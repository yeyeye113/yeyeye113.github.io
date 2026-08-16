// src/monetize/ticket.mjs — 权益票据客户端验签与入账（V2 最小商用）
// 真源：docs/V2服务端权益契约草案.md §5（GM1 三段式，沿用草台 PS1 先例）。
// redeemEntitlementCode 含唯一主动 fetch（兑码 POST /api/redeem），已入 privacy 白名单。
// 生产公钥常量见 src/config/index.mjs ENTITLEMENT_PUBLIC_KEY_JWK。

export const TICKET_PREFIX = 'GM1';

export const TICKET_CLAIM_KEYS = Object.freeze(['sku', 'credits', 'memberDays', 'iat', 'exp', 'jti']);
const REQUIRED_KEYS = ['sku', 'iat', 'exp', 'jti'];
const DAY_MS = 24 * 60 * 60 * 1000;

export class TicketUsedError extends Error {
  constructor(message = '该权益票据已入账') {
    super(message);
    this.name = 'TicketUsedError';
    this.code = 'TICKET_USED';
  }
}

export class TicketInvalidError extends Error {
  constructor(message = '权益票据无效或已过期', code = 'TICKET_INVALID') {
    super(message);
    this.name = 'TicketInvalidError';
    this.code = code;
  }
}

function b64urlToBytes(s) {
  const b64 = s.replace(/-/g, '+').replace(/_/g, '/') + '='.repeat((4 - (s.length % 4)) % 4);
  const bin = atob(b64);
  const bytes = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
  return bytes;
}

function decodeClaims(payloadB64) {
  try {
    return JSON.parse(new TextDecoder().decode(b64urlToBytes(payloadB64)));
  } catch {
    return null;
  }
}

function isValidClaims(claims) {
  if (!claims || typeof claims !== 'object' || Array.isArray(claims)) return false;
  for (const key of Object.keys(claims)) {
    if (!TICKET_CLAIM_KEYS.includes(key)) return false;
  }
  for (const key of REQUIRED_KEYS) {
    if (!Object.hasOwn(claims, key)) return false;
  }
  if (typeof claims.sku !== 'string' || claims.sku.length === 0) return false;
  if (typeof claims.jti !== 'string' || claims.jti.length === 0) return false;
  if (!Number.isFinite(claims.iat) || !Number.isFinite(claims.exp)) return false;
  if (Object.hasOwn(claims, 'credits') && !Number.isFinite(claims.credits)) return false;
  if (Object.hasOwn(claims, 'memberDays') && !Number.isFinite(claims.memberDays)) return false;
  return true;
}

export async function verifyTicket(ticket, publicKeyJwk, now = Date.now()) {
  try {
    if (typeof ticket !== 'string') return { valid: false, reason: 'format' };
    const parts = ticket.split('.');
    if (parts.length !== 3 || parts[0] !== TICKET_PREFIX) return { valid: false, reason: 'format' };
    const [, payloadB64, sigB64] = parts;

    const claims = decodeClaims(payloadB64);
    if (!isValidClaims(claims)) return { valid: false, reason: 'format' };

    let sigOk = false;
    try {
      const key = await crypto.subtle.importKey('jwk', publicKeyJwk, { name: 'Ed25519' }, false, ['verify']);
      sigOk = await crypto.subtle.verify(
        { name: 'Ed25519' },
        key,
        b64urlToBytes(sigB64),
        new TextEncoder().encode(payloadB64),
      );
    } catch {
      return { valid: false, reason: 'signature' };
    }
    if (!sigOk) return { valid: false, reason: 'signature' };

    if (!(claims.exp > now)) return { valid: false, reason: 'expired' };
    return { valid: true, claims };
  } catch {
    return { valid: false, reason: 'format' };
  }
}

export function parseTicketUnsafe(ticket) {
  if (typeof ticket !== 'string') return null;
  const parts = ticket.split('.');
  if (parts.length !== 3 || parts[0] !== TICKET_PREFIX) return null;
  return decodeClaims(parts[1]);
}

function readRaw(store) {
  const e = store.getEntitlements();
  return {
    ...e,
    credits: Number.isFinite(e.credits) ? e.credits : 0,
    memberUntil: typeof e.memberUntil === 'string' ? e.memberUntil : null,
    redeemed: Array.isArray(e.redeemed) ? e.redeemed : [],
  };
}

function toEpoch(now) {
  if (now instanceof Date) return now.getTime();
  return Number.isFinite(now) ? now : Date.now();
}

function extendMembership(raw, days, epoch) {
  const existing = raw.memberUntil ? Date.parse(raw.memberUntil) : NaN;
  const base = Number.isFinite(existing) ? Math.max(existing, epoch) : epoch;
  return new Date(base + days * DAY_MS).toISOString();
}

function redeemUrl(apiBase) {
  const base = String(apiBase ?? '').replace(/\/+$/, '');
  return base ? `${base}/api/redeem` : '/api/redeem';
}

export async function applyTicket({ store, ticket, publicKeyJwk, now = Date.now() }) {
  const epoch = toEpoch(now);
  const res = await verifyTicket(ticket, publicKeyJwk, epoch);
  if (!res.valid) {
    const code = res.reason === 'expired' ? 'TICKET_EXPIRED' : 'TICKET_INVALID';
    throw new TicketInvalidError(undefined, code);
  }
  const { claims } = res;
  const raw = readRaw(store);
  if (raw.redeemed.some((r) => r && r.jti === claims.jti)) {
    throw new TicketUsedError();
  }
  const next = { ...raw };
  if (Number.isFinite(claims.credits)) next.credits = raw.credits + claims.credits;
  if (Number.isFinite(claims.memberDays)) {
    next.memberUntil = extendMembership(raw, claims.memberDays, epoch);
  }
  next.redeemed = raw.redeemed.concat([{
    jti: claims.jti,
    at: new Date(epoch).toISOString(),
  }]);
  store.setEntitlements(next);
  return { credits: next.credits, memberUntil: next.memberUntil };
}

export async function redeemEntitlementCode({
  store,
  code,
  apiBase = '',
  publicKeyJwk,
  fetchFn = globalThis.fetch,
  now = Date.now(),
}) {
  const normalized = String(code ?? '').trim();
  if (!normalized) {
    const { InvalidCodeError } = await import('./index.mjs');
    throw new InvalidCodeError();
  }
  let res;
  try {
    res = await fetchFn(redeemUrl(apiBase), {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ code: normalized }),
    });
  } catch {
    const err = new Error('网络失败，请检查连接后重试');
    err.code = 'NETWORK_ERROR';
    throw err;
  }
  let body;
  try {
    body = await res.json();
  } catch {
    const err = new Error('服务端响应格式异常');
    err.code = 'BAD_RESPONSE';
    throw err;
  }
  if (!body?.ok) {
    const { InvalidCodeError, CodeExhaustedError } = await import('./index.mjs');
    if (body?.code === 'INVALID_CODE') throw new InvalidCodeError(body.message);
    if (body?.code === 'CODE_EXHAUSTED') throw new CodeExhaustedError(body.message);
    const err = new Error(body?.message ?? '兑换失败');
    err.code = body?.code ?? 'REDEEM_FAILED';
    throw err;
  }
  if (typeof body.ticket !== 'string') {
    throw new TicketInvalidError('服务端未返回有效票据');
  }
  return applyTicket({ store, ticket: body.ticket, publicKeyJwk, now });
}
