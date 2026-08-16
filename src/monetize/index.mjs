// src/monetize/index.mjs — 变现层（契约 §10）
// 体验码表已移服务端（V2 最小商用：POST /api/redeem → 权益票据 → applyTicket 入账）。
// 三档 SKU + 券/会员双通道解锁：会员期内直通，否则扣 1 券；零券非会员抛 NoCreditError。
// 兑换记录不可变追加（jti 幂等去重），重复票据与未知码分别抛带 code 的专用错误。

import { BETA_FREE, ENTITLEMENT_API_BASE, ENTITLEMENT_PUBLIC_KEY_JWK } from '../config/index.mjs';
import { redeemEntitlementCode } from './ticket.mjs';

export { applyTicket, redeemEntitlementCode, TicketUsedError, TicketInvalidError } from './ticket.mjs';

const DAY_MS = 24 * 60 * 60 * 1000;

export const SKUS = [
  { id: 'single', name: '单场深度报告', price: 19.9, credits: 1 },
  { id: 'sprint', name: '面试冲刺包', price: 99, credits: 6 },
  { id: 'monthly', name: '面霸月卡', price: 198, days: 30 },
];

export class NoCreditError extends Error {
  constructor(message = '零券且非会员，无法解锁报告') {
    super(message);
    this.name = 'NoCreditError';
    this.code = 'NO_CREDIT';
  }
}

export class CodeUsedError extends Error {
  constructor(message = '该体验码已兑换过') {
    super(message);
    this.name = 'CodeUsedError';
    this.code = 'CODE_USED';
  }
}

export class InvalidCodeError extends Error {
  constructor(message = '体验码无效') {
    super(message);
    this.name = 'InvalidCodeError';
    this.code = 'INVALID_CODE';
  }
}

export class CodeExhaustedError extends Error {
  constructor(message = '体验码兑换余量已用完') {
    super(message);
    this.name = 'CodeExhaustedError';
    this.code = 'CODE_EXHAUSTED';
  }
}

export class SessionNotFoundError extends Error {
  constructor(message = '会话不存在，无法解锁') {
    super(message);
    this.name = 'SessionNotFoundError';
    this.code = 'SESSION_NOT_FOUND';
  }
}

export class BetaClosedError extends Error {
  constructor(message = '公测已结束，请走付费解锁') {
    super(message);
    this.name = 'BetaClosedError';
    this.code = 'BETA_CLOSED';
  }
}

function toEpoch(now) {
  if (now instanceof Date) return now.getTime();
  return Number.isFinite(now) ? now : Date.now();
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

function isMember(raw, epoch) {
  if (!raw.memberUntil) return false;
  const until = Date.parse(raw.memberUntil);
  return Number.isFinite(until) && until > epoch;
}

function extendMembership(raw, days, epoch) {
  const existing = raw.memberUntil ? Date.parse(raw.memberUntil) : NaN;
  const base = Number.isFinite(existing) ? Math.max(existing, epoch) : epoch;
  return new Date(base + days * DAY_MS).toISOString();
}

export function getEntitlements(store) {
  const raw = readRaw(store);
  return { credits: raw.credits, memberUntil: raw.memberUntil };
}

export function canUnlock(store, now) {
  const raw = readRaw(store);
  return raw.credits > 0 || isMember(raw, toEpoch(now));
}

export function unlockReport({ store, sessionId, now } = {}) {
  const epoch = toEpoch(now);
  const raw = readRaw(store);

  const session = store.getSession(sessionId);
  if (!session) throw new SessionNotFoundError(`会话不存在：${sessionId}`);

  if (session.unlocked === true) {
    return getEntitlements(store);
  }

  if (!isMember(raw, epoch)) {
    if (raw.credits <= 0) throw new NoCreditError();
    store.setEntitlements({ ...raw, credits: raw.credits - 1 });
  }
  store.saveSession({ ...session, unlocked: true });
  return getEntitlements(store);
}

export function betaUnlock({ store, sessionId, _testBetaFree } = {}) {
  const betaFree = _testBetaFree === undefined ? BETA_FREE : _testBetaFree;
  if (betaFree !== true) throw new BetaClosedError();

  const session = store.getSession(sessionId);
  if (!session) throw new SessionNotFoundError(`会话不存在：${sessionId}`);

  if (session.unlocked !== true) {
    store.saveSession({ ...session, unlocked: true });
  }
  return getEntitlements(store);
}

export function grantSku({ store, skuId, now } = {}) {
  const sku = SKUS.find((s) => s.id === skuId);
  if (!sku) {
    const err = new Error(`未知 SKU：${skuId}`);
    err.code = 'INVALID_SKU';
    throw err;
  }
  const epoch = toEpoch(now);
  const raw = readRaw(store);
  const next = { ...raw };
  if (Number.isFinite(sku.credits)) next.credits = raw.credits + sku.credits;
  if (Number.isFinite(sku.days)) next.memberUntil = extendMembership(raw, sku.days, epoch);
  store.setEntitlements(next);
  return getEntitlements(store);
}

export async function redeemCode(store, code, now, options = {}) {
  return redeemEntitlementCode({
    store,
    code,
    apiBase: options.apiBase ?? ENTITLEMENT_API_BASE,
    publicKeyJwk: options.publicKeyJwk ?? ENTITLEMENT_PUBLIC_KEY_JWK,
    fetchFn: options.fetchFn ?? globalThis.fetch,
    now,
  });
}
