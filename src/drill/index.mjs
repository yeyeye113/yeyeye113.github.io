// src/drill/index.mjs — 错题本与弱项重练（契约 §15，V2.1 增）
// 刻意练习闭环：历史低分题自动聚合（collectMistakes）→ 一键组重练场（buildDrillPlan）。
// 两函数纯、零 IO、零依赖、确定性：无随机、不洗牌——重练就该先练最弱的。
//
// 记录形状真源：src/storage/index.mjs saveSession ＋ app/app.js 落库调用——SessionResult
// 字段（plan/answers/scores/savedAt）平铺在记录顶层；容忍嵌套 result 键的变体（先取
// rec.result，无则取 rec 本身），坏记录逐条跳过不炸。

// 从一条落库记录里取出 SessionResult 面（平铺为主、嵌套 result 兜底）；形状不对返回 null。
function resultOf(rec) {
  if (!rec || typeof rec !== 'object' || Array.isArray(rec)) return null;
  const r = rec.result && typeof rec.result === 'object' && !Array.isArray(rec.result) ? rec.result : rec;
  if (!r.plan || typeof r.plan !== 'object' || !Array.isArray(r.plan.questions)) return null;
  if (!Array.isArray(r.scores)) return null;
  return r;
}

function toEpoch(v) {
  return typeof v === 'number' && Number.isFinite(v) ? v : 0; // 坏 savedAt 当 0（沉底为最旧）
}

export function collectMistakes(sessions, { threshold = 60 } = {}) {
  const list = Array.isArray(sessions) ? sessions : [];
  // 去重键 = question.text；value = { item: MistakeItem, attempts }
  const byText = new Map();

  for (const rec of list) {
    const result = resultOf(rec);
    if (!result) continue; // 坏记录：缺 result/plan/scores 或形状不对，逐条跳过
    const { questions } = result.plan;
    const answers = Array.isArray(result.answers) ? result.answers : [];
    const savedAt = toEpoch(rec.savedAt);
    const sessionId = rec.id ?? null;

    // 下标对齐：plan.questions[i] × scores[i] × answers[i]。abandoned 场 questions 可能
    // 比 scores 长（未答题无分）——以 scores 实际长度为准，只遍历已评分的题位。
    for (let i = 0; i < result.scores.length; i += 1) {
      const question = questions[i];
      const score = result.scores[i];
      if (!question || typeof question !== 'object' || typeof question.text !== 'string') continue;
      if (!score || typeof score !== 'object' || !Number.isFinite(score.total)) continue;

      const key = question.text;
      let entry = byText.get(key);
      if (!entry) {
        entry = { item: null, attempts: 0 };
        byText.set(key, entry);
      }
      entry.attempts += 1; // 该题历史出现总次数（不分高低分，答过就算一次）

      if (score.total >= threshold) continue; // 只有低分次入错题本
      // 同题去重保留最近一次：按 savedAt 数字比较，同刻取后遍历到的（store 追加序即时间序）
      if (entry.item && entry.item.date > savedAt) continue;
      const answerText = answers[i] && typeof answers[i].text === 'string' ? answers[i].text : '';
      entry.item = { question, score, answerText, sessionId, date: savedAt, attempts: 0 };
    }
  }

  const mistakes = [];
  for (const entry of byText.values()) {
    if (!entry.item) continue; // 该题从未低于阈值
    entry.item.attempts = entry.attempts;
    mistakes.push(entry.item);
  }
  // 按 score.total 升序（sort 稳定，同分保持收集序）——最弱的排最前
  mistakes.sort((a, b) => a.score.total - b.score.total);
  return mistakes;
}

export function buildDrillPlan(mistakes, { rounds = 5, seed } = {}) {
  const list = Array.isArray(mistakes) ? mistakes : [];
  const picked = list
    .filter((m) => m && m.question && typeof m.question === 'object')
    .slice(0, rounds);
  if (picked.length === 0) return null; // 调用方据此隐藏重练入口

  const questions = picked.map((m, i) => {
    // 深拷贝：重练场（session 状态机、评分标注）对题对象的任何改写都不得污染历史记录
    const copy = structuredClone(m.question);
    copy.id = `q${i + 1}`; // session 状态机按 id 追踪，重编为 q1..qN
    return copy;
  });
  return { mode: 'drill', seed, questions };
}
