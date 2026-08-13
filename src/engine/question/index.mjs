// 出题引擎（契约 §3）：planInterview -> InterviewPlan。
// 确定性：所有随机由 seed 驱动的 LCG 产生，同 seed 同输入逐位一致；禁 Math.random。
import { BANK, CATEGORY_TO_TYPE } from './bank.mjs';
import { skillDomain } from '../jd/dict.mjs';

// Numerical Recipes 参数的 32 位 LCG，跨平台确定性
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

// 中段（去掉开场/反问后）各类目的配比权重；数组顺序即出题块顺序
const MODE_PLAN = {
  behavioral: [['行为', 0.7], ['项目深挖', 0.2], ['压力', 0.1]],
  technical: [['技术', 0.75], ['项目深挖', 0.15], ['压力', 0.1]],
  comprehensive: [['行为', 0.3], ['技术', 0.4], ['项目深挖', 0.2], ['压力', 0.1]],
  hr: [['行为', 0.6], ['压力', 0.3], ['项目深挖', 0.1]],
};

// 最大余数法配额：先取整，余量按小数部分降序补齐（并列按定义顺序，保证确定性）
function apportion(weights, total) {
  const rows = weights.map(([cat, w], i) => {
    const exact = w * total;
    return { cat, floor: Math.floor(exact), frac: exact - Math.floor(exact), i };
  });
  let used = rows.reduce((acc, r) => acc + r.floor, 0);
  const order = rows.slice().sort((a, b) => b.frac - a.frac || a.i - b.i);
  const counts = new Map(rows.map((r) => [r.cat, r.floor]));
  for (let k = 0; used < total; k = (k + 1) % order.length, used++) {
    counts.set(order[k].cat, counts.get(order[k].cat) + 1);
  }
  return counts;
}

// 类目池：洗牌后顺序取用，取尽则重洗（同一 rng 流，保持确定性）
function makePool(templates, rng) {
  let order = shuffle(templates, rng);
  let ptr = 0;
  return {
    size: templates.length,
    next() {
      if (templates.length === 0) return null;
      if (ptr >= order.length) {
        order = shuffle(templates, rng);
        ptr = 0;
      }
      return order[ptr++];
    },
  };
}

function fill(text, ctx) {
  return text
    .replaceAll('{skill}', ctx.skill)
    .replaceAll('{title}', ctx.title)
    .replaceAll('{missing}', ctx.missing)
    .replaceAll('{domain}', ctx.domain);
}

function sanitizeRounds(rounds) {
  const n = Math.trunc(Number(rounds));
  if (!Number.isFinite(n) || n < 1) return 8;
  return Math.min(30, n);
}

export function planInterview({ jd, resume, match, mode, rounds = 8, seed } = {}) {
  const safeMode = Object.hasOwn(MODE_PLAN, mode) ? mode : 'comprehensive';
  const safeRounds = sanitizeRounds(rounds);
  const safeSeed = (Number(seed) >>> 0) || 1;
  const rng = makeRng(safeSeed);

  const title = typeof jd?.title === 'string' && jd.title ? jd.title : '目标岗位';
  const domain = typeof jd?.domain === 'string' && jd.domain && jd.domain !== '通用' ? jd.domain : '技术';
  const missingList = (Array.isArray(match?.missing) ? match.missing : []).filter((m) => typeof m === 'string' && m);
  const missingText = missingList.slice(0, 2).join('、') || '岗位要求的关键技能';

  // 技能优先级：missing 优先（针对性拷问缺口），其后按 JD 权重降序
  const jdSkillNames = (Array.isArray(jd?.skills) ? jd.skills : [])
    .filter((s) => s && typeof s.name === 'string')
    .slice()
    .sort((a, b) => (b.weight ?? 1) - (a.weight ?? 1))
    .map((s) => s.name);
  const skillPriority = [...new Set([...missingList, ...jdSkillNames])];
  const fallbackSkill = skillPriority[0] ?? '你最熟悉的核心技能';

  // 类目池准备
  const byCat = new Map();
  for (const t of BANK) {
    if (!byCat.has(t.cat)) byCat.set(t.cat, []);
    byCat.get(t.cat).push(t);
  }
  const pools = {
    开场: makePool(byCat.get('开场') ?? [], rng),
    行为: makePool(byCat.get('行为') ?? [], rng),
    技术通用: makePool(byCat.get('技术通用') ?? [], rng),
    项目深挖: makePool(byCat.get('项目深挖') ?? [], rng),
    压力: makePool(byCat.get('压力') ?? [], rng),
    反问: makePool(byCat.get('反问') ?? [], rng),
  };
  const domainPools = new Map();
  for (const t of byCat.get('领域族') ?? []) {
    if (!domainPools.has(t.domain)) domainPools.set(t.domain, []);
    domainPools.get(t.domain).push(t);
  }
  for (const [d, ts] of domainPools) domainPools.set(d, makePool(ts, rng));

  // 组装类目序列：开场 -> 中段按 MODE_PLAN 配比 -> 反问
  const catSeq = [];
  if (safeRounds >= 1) catSeq.push('开场');
  const middle = Math.max(0, safeRounds - 2);
  if (middle > 0) {
    const counts = apportion(MODE_PLAN[safeMode], middle);
    for (const [cat] of MODE_PLAN[safeMode]) {
      for (let i = 0; i < (counts.get(cat) ?? 0); i++) catSeq.push(cat);
    }
  }
  if (safeRounds >= 2) catSeq.push('反问');

  let techIndex = 0;
  const questions = catSeq.map((cat, i) => {
    let template;
    let assignedSkill = null;

    if (cat === '技术') {
      assignedSkill = skillPriority.length > 0 ? skillPriority[techIndex % skillPriority.length] : fallbackSkill;
      // 首个技术槽固定走通用池（模板必含 {skill}），保证 missing 技能一定进入题目文本
      const dPool = domainPools.get(skillDomain(assignedSkill));
      const useDomain = techIndex > 0 && dPool && rng() < 0.5;
      template = useDomain ? dPool.next() : pools['技术通用'].next();
      techIndex++;
    } else {
      template = pools[cat].next();
    }

    const ctx = {
      skill: assignedSkill ?? (skillPriority[i % Math.max(1, skillPriority.length)] ?? fallbackSkill),
      title,
      missing: missingText,
      domain,
    };
    const type = CATEGORY_TO_TYPE[template.cat];
    const q = {
      id: `q${i + 1}`,
      type,
      text: fill(template.text, ctx),
      intent: fill(template.intent, ctx),
      followupHints: template.followupHints.map((h) => fill(h, ctx)),
      refPoints: template.refPoints.map((r) => fill(r, ctx)),
    };
    if (type === '技术') q.skill = assignedSkill ?? fallbackSkill;
    return q;
  });

  return { mode: safeMode, seed: safeSeed, questions };
}
