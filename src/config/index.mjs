// src/config/index.mjs — 产品级开关真源（契约 §10 V1.7）
// BETA_FREE：公测期免费解锁的总开关（单布尔单真源，全仓只此一处）。
//   true  = 公测模式，报告经 betaUnlock 免费解锁（前端展示「公测期免费解锁（正式版 ¥19.9）」，价格锚点保留）；
//   false = 正式售卖，回到付费墙原语义（扣券/会员直通，betaUnlock 关门抛 BetaClosedError）。
// 改动本值属产品语义变更，须用户拍板，不许施工会话自行翻转。
// 机检约束：值必须写显式布尔字面量 true/false，不许写成表达式（test/monetize.test.mjs 有源文本断言）。
export const BETA_FREE = true;

// V2 权益接口：本地 dev 与静态托管同宿主时走同源 POST /api/redeem（空串=相对路径）。
// 公钥与 server/dev-entitlement.mjs DEV 密钥对匹配；生产部署换 Workers 公钥 JWK。
export const ENTITLEMENT_API_BASE = '';
export const ENTITLEMENT_PUBLIC_KEY_JWK = Object.freeze({
  key_ops: ['verify'],
  ext: true,
  alg: 'Ed25519',
  crv: 'Ed25519',
  x: '37dXLRvbZx_6ZR_dV8qOIkzk_y-jdn5hEFszEXMU6NA',
  kty: 'OKP',
});
