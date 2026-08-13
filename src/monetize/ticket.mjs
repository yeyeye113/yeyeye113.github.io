// src/monetize/ticket.mjs — 权益票据客户端验签（V2 基建，休眠态：前端尚未消费本模块）
// 真源：docs/V2服务端权益契约草案.md §5（GM1 三段式，沿用草台 PS1 先例）。
// 票据格式：GM1.<payload-base64url>.<signature-base64url>，签名对 payload 段字符串本体（UTF-8）。
// claims 字段闭集：{ sku, credits?, memberDays?, iat, exp, jti }——无任何身份字段（隐私守护 §7），
//   多一个字段即 format 拒收；「传不了」而不是「我们不传」。
// 验签用 WebCrypto Ed25519（globalThis.crypto.subtle，Node ≥19 与现代浏览器原生支持），
// 本模块零网络调用、零存储触碰（隐私机检 test/privacy.test.mjs 扫描面内，白名单为零）。
// 生产公钥常量在 V2 服务端上线时落位（wrangler 生成的公钥 JWK），测试一律注入临时密钥对。

export const TICKET_PREFIX = 'GM1';

// claims 闭集真源（test/ticket.test.mjs 机检引用；改动属契约变更，先改草案再改这里）
export const TICKET_CLAIM_KEYS = Object.freeze(['sku', 'credits', 'memberDays', 'iat', 'exp', 'jti']);
const REQUIRED_KEYS = ['sku', 'iat', 'exp', 'jti'];

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
    if (!TICKET_CLAIM_KEYS.includes(key)) return false; // 闭集：多余字段即拒收
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

// 验签：签名不符/格式坏/过期分别给 reason（'signature'|'format'|'expired'），永不抛异常。
// 校验顺序：格式与闭集 → 签名 → 过期（过期票据的签名本身合法时如实报 expired）。
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

// 只解码不验签——调试/排障用，命名故意带 Unsafe：拿它的返回值做权益判定即安全事故。
export function parseTicketUnsafe(ticket) {
  if (typeof ticket !== 'string') return null;
  const parts = ticket.split('.');
  if (parts.length !== 3 || parts[0] !== TICKET_PREFIX) return null;
  return decodeClaims(parts[1]);
}
