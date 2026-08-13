// src/drill/index.mjs — 错题本与弱项重练（契约 §15，V2.1 增；V2.2 毕业机制）
// 刻意练习闭环：历史低分题自动聚合（collectMistakes）→ 一键组重练场（buildDrillPlan）。
// 两函数纯、零 IO、零依赖、确定性：无随机、不洗牌——重练就该先练最弱的。
//
// 毕业口径（V2.2，五轮复核 P2-1 修复；契约 §15 语义微调由主会话收口时同步）：
// 同 question.text 的全部历史作答按记录 savedAt 排时间序（坏值当 0；同刻——含同场多题位——
// 按遍历序后者为近，store 追加序即时间序），**以最近一次作答的得分定去留**：
// 最近一次 ≥ threshold 即毕业（不入错题本，重练打到高分就出本，闭环合上）；
// 最近一次 < threshold 才在本，条目取该最近低分次的数据。drill 场自身的作答同样参与
// 判定（重练又答砸继续在本——如实）。attempts 语义不变：历史答过总次数，不分高低分。
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
  // 去重键 = question.text；value = { latest: 该题时间序最近一次作答, attempts }
  // 毕业判定放收尾：先把每题的「最近一次」找出来，最后只留最近一次仍低分的题。
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
        entry = { latest: null, attempts: 0 };
        byText.set(key, entry);
      }
      entry.attempts += 1; // 该题历史出现总次数（不分高低分，答过就算一次）

      // 只追踪时间序最近一次作答（不分高低分——去留由它定）：savedAt 数字为主序，
      // 同刻（含同场多题位、坏 savedAt 同为 0）取后遍历到的，store 追加序即时间序。
      if (entry.latest && entry.latest.date > savedAt) continue;
      const answerText = answers[i] && typeof answers[i].text === 'string' ? answers[i].text : '';
      entry.latest = { question, score, answerText, sessionId, date: savedAt, attempts: 0 };
    }
  }

  const mistakes = [];
  for (const entry of byText.values()) {
    // 毕业判定：最近一次 ≥ threshold 即出本；仍低分才在本，条目即该最近低分次
    if (!entry.latest || entry.latest.score.total >= threshold) continue;
    entry.latest.attempts = entry.attempts;
    mistakes.push(entry.latest);
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
