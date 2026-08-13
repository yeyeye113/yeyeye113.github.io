// src/monetize/index.mjs — 变现层（契约 §10）
// 体验码表 V1 随源码下发，V2 接真实支付前必须移服务端（docs/计划书.md §6 D1）。
// 三档 SKU + 券/会员双通道解锁：会员期内直通，否则扣 1 券；零券非会员抛 NoCreditError。
// 兑换记录不可变追加（只 concat 不改写既有条目），重复兑换与未知码分别抛带 code 的专用错误。

import { BETA_FREE } from '../config/index.mjs';

const DAY_MS = 24 * 60 * 60 * 1000;

export const SKUS = [
  { id: 'single', name: '单场深度报告', price: 19.9, credits: 1 },
  { id: 'sprint', name: '面试冲刺包', price: 99, credits: 6 },
  { id: 'monthly', name: '面霸月卡', price: 198, days: 30 },
];

// 体验码表（V1 内置，键一律小写归一后比对）
const CODES = {
  guomian1: { credits: 1 },
  qiuzhao2026: { credits: 2 },
  chongci6: { credits: 6 },
  mianba30: { days: 30 },
  neice7: { days: 7 },
};

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

// store 层原始权益（含 redeemed 追加记录等内部字段）
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

// 会员天数发放：期内顺延（从原到期日续），过期/无会员从 now 起算
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

  // V1.2 P1-1：扣券前先验会话存在，防止无效 sessionId 烧券无兑付
  const session = store.getSession(sessionId);
  if (!session) throw new SessionNotFoundError(`会话不存在：${sessionId}`);

  if (session.unlocked === true) {
    return getEntitlements(store); // 已解锁场次幂等直通，不重复扣券
  }

  if (!isMember(raw, epoch)) {
    if (raw.credits <= 0) throw new NoCreditError();
    store.setEntitlements({ ...raw, credits: raw.credits - 1 });
  }
  store.saveSession({ ...session, unlocked: true });
  return getEntitlements(store);
}

// 公测免费解锁（契约 §10 V1.7）：只加旁路不动既有门——零扣券零权益变动，
// 只做「session 存在校验 + unlocked 标记持久化」（与 unlockReport 同款落库路径）。
// _testBetaFree 仅测试用（依赖注入 false 分支，生产调用不传，缺省取 config 真源 BETA_FREE）。
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

export function redeemCode(store, code, now) {
  const normalized = String(code ?? '').trim().toLowerCase();
  // V1.2 P2-3：只认自有键，堵死 __proto__/constructor/toString 等原型链穿透
  if (!Object.hasOwn(CODES, normalized)) throw new InvalidCodeError();
  const grant = CODES[normalized];

  const epoch = toEpoch(now);
  const raw = readRaw(store);
  if (raw.redeemed.some((r) => r && r.code === normalized)) throw new CodeUsedError();

  const next = { ...raw };
  if (Number.isFinite(grant.credits)) next.credits = raw.credits + grant.credits;
  if (Number.isFinite(grant.days)) next.memberUntil = extendMembership(raw, grant.days, epoch);
  // 不可变追加：不改写既有记录，只 concat 新条目
  next.redeemed = raw.redeemed.concat([{ code: normalized, at: new Date(epoch).toISOString() }]);
  store.setEntitlements(next);
  return getEntitlements(store);
}
