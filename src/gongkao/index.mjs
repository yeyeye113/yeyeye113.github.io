// src/gongkao/index.mjs — 公考结构化面试题库适配层（V2.6，卡26 资产接线）
// 职责：把公考陪练资产仓的题库主数据装配成契约 §3 Question 形状的 InterviewPlan，
// 并提供独立的公考五维聚合。纯函数、零 IO、零随机泄漏（同 seed 逐位一致）、零依赖。
//
// 形状对账结论（接线时实测，真源见资产仓 README「schema 兼容口径」）：
// - 公考题字段 text/intent/followupHints(≥2)/refPoints(≥3) 与契约 §3 完全对齐，
//   type 全量「行为」（引擎六类枚举内）——「引擎兼容」声称属实；
// - dim（公考五维）为引擎不消费的扩展字段，保留在装配产物上供五维聚合；
// - framework/pitfalls 为纯内容扩展，引擎与报告层均不消费，不进装配产物
//   （快照信封不背这份体积；人读版在资产仓 MD 题库）。
// 评分档独立性：公考五维聚合只按题位 dim 汇总既有 score.total（engine/scoring 的
// 产物），不改 scoreAnswer/scoreSession 一字——scoring 17 组测试语义零触碰。

export const GONGKAO_MODE = 'gongkao';
export const GONGKAO_DEFAULT_ROUNDS = 5;
// 公考五维轴序真源（与 bank.mjs dims 定义序对齐，机检钉死逐位一致）。
// 报告②节专属雷达与 ui-core.buildGongkaoRadarPoints 都只认这份，禁止在消费方手抄。
export const GONGKAO_DIMS = Object.freeze([
  '综合分析',
  '计划组织',
  '应急应变',
  '人际关系',
  '言语表达',
]);
const MAX_ROUNDS = 30; // planInterview sanitizeRounds 同口径封顶

// 引擎六类 type 枚举（真源 src/custom/index.mjs TYPES，契约 §16：枚举外一律回落「行为」。
// 不 import：custom 未导出 TYPES，这里是同一契约条款的第二消费点，改枚举须两处同步）
const ENGINE_TYPES = new Set(['开场', '行为', '技术', '项目深挖', '压力', '反问']);

// normalizeGongkaoBank(raw) -> { ok:true, name, dims, questions } | { ok:false, reason }
// 把关口径即契约 §3：text（trim ≥5 字）/intent/followupHints ≥2/refPoints ≥3；
// dim 必须落在题库自报的维度表内（五维聚合的轴不许有野值）。任何一题不合格整库拒收
// ——资产仓有 2312 断言罩着真源，走到拒收说明同步链路坏了，宁可拦下也不静默放行半库。
export function normalizeGongkaoBank(raw) {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) {
    return { ok: false, reason: '题库不是对象' };
  }
  const dims = Array.isArray(raw.dims) ? raw.dims.filter((d) => typeof d === 'string' && d) : [];
  if (dims.length === 0) return { ok: false, reason: '题库缺维度表 dims' };
  if (!Array.isArray(raw.questions) || raw.questions.length === 0) {
    return { ok: false, reason: '题库 questions 不是非空数组' };
  }
  const dimSet = new Set(dims);
  const questions = [];
  for (const q of raw.questions) {
    if (!q || typeof q !== 'object') return { ok: false, reason: '存在非对象题目' };
    const text = typeof q.text === 'string' ? q.text.trim() : '';
    if (text.length < 5) return { ok: false, reason: `题 ${q.id ?? '?'} 题面过短` };
    if (typeof q.intent !== 'string' || !q.intent) return { ok: false, reason: `题 ${q.id ?? '?'} 缺 intent` };
    const hints = Array.isArray(q.followupHints) ? q.followupHints.filter((h) => typeof h === 'string' && h) : [];
    if (hints.length < 2) return { ok: false, reason: `题 ${q.id ?? '?'} followupHints 不足 2 条（契约 §3）` };
    const points = Array.isArray(q.refPoints) ? q.refPoints.filter((p) => typeof p === 'string' && p) : [];
    if (points.length < 3) return { ok: false, reason: `题 ${q.id ?? '?'} refPoints 不足 3 条（契约 §3）` };
    if (!dimSet.has(q.dim)) return { ok: false, reason: `题 ${q.id ?? '?'} 维度「${q.dim}」不在维度表内` };
    questions.push({
      id: typeof q.id === 'string' && q.id ? q.id : `gk-${questions.length + 1}`,
      dim: q.dim,
      type: ENGINE_TYPES.has(q.type) ? q.type : '行为',
      text,
      intent: q.intent,
      followupHints: hints,
      refPoints: points,
    });
  }
  return { ok: true, name: typeof raw.name === 'string' ? raw.name : '公考题库', dims, questions };
}

// LCG 与出题引擎同参（Numerical Recipes，src/engine/question/index.mjs 同口径）：
// 引擎未导出 makeRng，这里按同一确定性纪律重写——禁 Math.random。
function makeRng(seed) {
  let s = (Number(seed) >>> 0) || 1;
  return () => {
    s = (Math.imul(s, 1664525) + 1013904223) >>> 0;
    return s / 4294967296;
  };
}

function shuffle(arr, rng) {
  const a = arr.slice();
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

function sanitizeRounds(rounds) {
  const n = Math.trunc(Number(rounds));
  if (!Number.isFinite(n) || n < 1) return GONGKAO_DEFAULT_ROUNDS;
  return Math.min(MAX_ROUNDS, n);
}

// planGongkaoInterview({ questions, rounds?, seed }) -> { mode:'gongkao', seed, questions }
// questions 传 normalizeGongkaoBank 产物（把关在 normalize 一处，这里不复查）。
// 配比：五维均衡——rounds 按维度定义序做最大余数分摊（rounds=5 恰好五维各一），
// 维度内确定性洗牌取前 n，题序再整体洗牌一次（不让同维扎堆连问）。
// 产物题深拷贝并重编 id q1..qN（session 状态机按 id 追踪；绝不改 normalize 产物）。
export function planGongkaoInterview({ questions, rounds, seed } = {}) {
  const pool = Array.isArray(questions) ? questions.filter((q) => q && typeof q === 'object') : [];
  const safeSeed = (Number(seed) >>> 0) || 1;
  const safeRounds = Math.min(sanitizeRounds(rounds), pool.length);
  const rng = makeRng(safeSeed);

  const byDim = new Map();
  for (const q of pool) {
    if (!byDim.has(q.dim)) byDim.set(q.dim, []);
    byDim.get(q.dim).push(q);
  }
  const dims = [...byDim.keys()];

  // 最大余数法按维度均分：先取整，余量按维度定义序补齐（确定性，与出题引擎 apportion 同思路）
  const base = Math.floor(safeRounds / dims.length);
  let rest = safeRounds - base * dims.length;
  const picked = [];
  for (const d of dims) {
    const want = Math.min(base + (rest > 0 ? 1 : 0), byDim.get(d).length);
    if (rest > 0) rest -= 1;
    picked.push(...shuffle(byDim.get(d), rng).slice(0, want));
  }

  const ordered = shuffle(picked, rng).slice(0, safeRounds);
  const planQuestions = ordered.map((q, i) => ({ ...structuredClone(q), id: `q${i + 1}` }));
  return { mode: GONGKAO_MODE, seed: safeSeed, questions: planQuestions };
}

// aggregateGongkaoDims(plan, scores) -> { [公考维度]: 平均分 }
// 独立评分档（加法层）：按题位对齐 plan.questions[i].dim × scores[i].total，同维取平均
// （四舍五入）。只遍历 scores 实际长度——abandoned 场未答题位不进聚合、不造 0 分假象；
// 本场没考到的维度不出现在产物里。坏输入回空对象不抛。
export function aggregateGongkaoDims(plan, scores) {
  const questions = Array.isArray(plan?.questions) ? plan.questions : [];
  const list = Array.isArray(scores) ? scores : [];
  const acc = new Map();
  for (let i = 0; i < list.length && i < questions.length; i += 1) {
    const dim = questions[i]?.dim;
    const total = list[i]?.total;
    if (typeof dim !== 'string' || !dim || !Number.isFinite(total)) continue;
    if (!acc.has(dim)) acc.set(dim, []);
    acc.get(dim).push(total);
  }
  const out = {};
  for (const [dim, totals] of acc) {
    out[dim] = Math.round(totals.reduce((a, b) => a + b, 0) / totals.length);
  }
  return out;
}
