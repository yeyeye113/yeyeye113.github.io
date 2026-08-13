// src/custom/index.mjs — 自定义题集（契约 §16，V2.3 增）
// 把用户手录的真实面试题变成契约 §3 的 Question 形状，并混排进既有 InterviewPlan。
// 零依赖、纯函数、确定性（无随机、零 IO）。
//
// refPoints 抽词法（确定性，本注释即真源）：
// 1. 题文 trim 后，按「长词优先」逐个剔除疑问虚词与引导客套词（QUESTION_STOPWORDS，
//    长词在前防止「什么」先删把「为什么」剁成「为」）；
// 2. 对剩余文本按出现序扫描 token：英文词 [A-Za-z][A-Za-z0-9]*、中文连续段 [\u4e00-\u9fff]+
//    ——即「标点/虚词切词」：虚词被替换成空格后，标点与空格天然成为分段边界；
// 3. 只保留 ≥2 字（中文按字、英文按字母）的 token，按出现序去重，取前 3 个。
// 抽不出给空数组——会话锚定机制对空 refPoints 免词法核对（src/session/index.mjs
// coverageBelowHalf 首行 points.length===0 直接返回 false），评分退到 jd 关键词与
// 结构信号：如实降级，不造假考点。

const TYPES = new Set(['开场', '行为', '技术', '项目深挖', '压力', '反问']);

// 疑问虚词＋引导客套词（长词优先排列；「类」词表可增，但只减不改语义）
const QUESTION_STOPWORDS = [
  '可不可以', '为什么', '有没有', '是不是', '能不能', '怎么样',
  '什么', '怎么', '怎样', '如何', '请问', '一下', '是否', '能否',
  '讲讲', '谈谈', '说说', '聊聊',
  '吗', '呢', '么', '的', '了', '请', '你', '您',
];

const FOLLOWUP_HINTS = ['能展开讲讲具体做法吗', '这件事里你个人的贡献是哪部分'];

function extractRefPoints(text) {
  let s = text;
  for (const w of QUESTION_STOPWORDS) s = s.split(w).join(' ');
  const points = [];
  for (const token of s.match(/[A-Za-z][A-Za-z0-9]*|[\u4e00-\u9fff]+/g) ?? []) {
    if (token.length < 2) continue;
    if (points.includes(token)) continue;
    points.push(token);
    if (points.length === 3) break;
  }
  return points;
}

export function makeCustomQuestion({ text, type = '行为', id } = {}) {
  const trimmed = typeof text === 'string' ? text.trim() : '';
  if (trimmed.length < 5) return null; // 拒收无意义题

  return {
    id: typeof id === 'string' && id ? id : 'custom',
    type: TYPES.has(type) ? type : '行为', // 不扩枚举：枚举外一律回落行为
    text: trimmed,
    intent: '用户自定义题（真实面试遇到）',
    followupHints: [...FOLLOWUP_HINTS],
    refPoints: extractRefPoints(trimmed),
  };
}

export function mixIntoPlan(plan, customQuestions) {
  const customs = Array.isArray(customQuestions)
    ? customQuestions.filter((c) => c && typeof c === 'object')
    : [];
  if (customs.length === 0) return plan; // 契约：空返回原 plan 同引用

  const copy = structuredClone(plan); // 深拷贝：不改入参
  const inserted = customs.map((c) => structuredClone(c)); // 自定义题同样拷贝，重编 id 不写回原对象

  // 反问永远收尾（出题引擎惯例：catSeq 以反问结尾）：插到最后一个反问题之前；无反问追加尾部
  let at = copy.questions.length;
  for (let i = copy.questions.length - 1; i >= 0; i -= 1) {
    if (copy.questions[i] && copy.questions[i].type === '反问') { at = i; break; }
  }
  copy.questions.splice(at, 0, ...inserted);

  copy.questions.forEach((question, i) => { question.id = `q${i + 1}`; }); // 全场重编 q1..qN
  return copy;
}
