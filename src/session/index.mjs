// src/session/index.mjs — 面试会话状态机（契约 §5）
// 状态流：'ready' -> 'awaiting_answer' -> ('awaiting_followup' ->) ... -> 'finished'。
// 收口双通路：finish()（只在 ready 态、答满流程）与 abandon()（V1.2 增，提前交卷：
// finished 之外任意状态可调，丢弃挂着的未定稿题，只按已答题计分，见方法注释）。
// 追问是确定性规则触发（V1.1 校准口径）：score.total < 60，或（refPoints 关键词级覆盖
// 不足一半 且 score.total < 80）——高分回答即使字面覆盖不足也不追问。llm 只做措辞润色，
// 失败静默回退确定性文本；每题至多追问 1 次，追问回答并入该题重评、取两次较高分。

// 关键词提取用的虚词表：这些词是疑问/连接成分，不代表实义内容
const STOPWORDS = ['有没有', '是不是', '是否', '能否', '有无', '可否', '的', '了', '吗', '呢', '么'];

// 把一段文本切成实义关键词集合（确定性、纯字符串操作）：
// 先剔除虚词，再按非中英文数字字符切段；保留 ≥2 字符的英文词（小写归一）、
// ≥2 字的中文词，并对中文段补滑窗双字词，提升与口语化答案的命中率。
function extractKeywords(point) {
  let s = String(point ?? '');
  for (const w of STOPWORDS) s = s.split(w).join(' ');
  const keywords = new Set();
  for (const seg of s.split(/[^A-Za-z0-9\u4e00-\u9fff]+/).filter(Boolean)) {
    for (const en of seg.match(/[A-Za-z][A-Za-z0-9]*/g) ?? []) {
      if (en.length >= 2) keywords.add(en.toLowerCase());
    }
    for (const run of seg.match(/[\u4e00-\u9fff]+/g) ?? []) {
      if (run.length >= 2) keywords.add(run);
      for (let i = 0; i + 2 <= run.length; i += 1) keywords.add(run.slice(i, i + 2));
    }
  }
  return [...keywords];
}

export class StateError extends Error {
  constructor(message) {
    super(message);
    this.name = 'StateError';
    this.code = 'STATE';
  }
}

export function createSession({ plan, scorer, llm = null, persona = null, now = Date.now } = {}) {
  if (!plan || !Array.isArray(plan.questions)) {
    throw new TypeError('createSession 需要含 questions 数组的 plan');
  }
  if (!scorer || typeof scorer.scoreAnswer !== 'function' || typeof scorer.scoreSession !== 'function') {
    throw new TypeError('createSession 需要注入 { scoreAnswer, scoreSession } 形状的 scorer');
  }

  let state = 'ready';
  let cursor = 0;
  let current = null;        // 当前题（Question）
  let currentAnswer = null;  // { questionId, text, followupText? }
  let firstScore = null;     // 首答得分（追问重评时对比用）
  const answers = [];
  const scores = [];
  const startedAt = now();

  const fail = (action) => {
    throw new StateError(`状态 ${state} 下不允许调用 ${action}`);
  };

  // refPoints 覆盖判定（V1.1 校准：关键词级＋题面锚定，替代旧「要点全文 includes」口径——
  // 好回答几乎不会逐字复述要点全文，旧口径覆盖恒为 0、追问恒触发，规则失去区分度）：
  // 1. 每条要点切成实义关键词集合（见 extractKeywords），答案命中其中任意 ≥1 个
  //    关键词即算覆盖该要点；关键词全被虚词滤空的要点不设门槛（视为已覆盖）。
  // 2. 题面锚定：只有与题面词汇（题干＋followupHints＋skill 的关键词）存在交集的要点
  //    才参与词法核对。题库里「与岗位需求对得上」这类评价性准则与题面零词汇交集，
  //    任何正常回答都不可能字面命中，一律免词法核对（视为已覆盖）——这类要点的
  //    质量已由 scorer 的 relevance 维度计入总分，追问交给分数条款（<60 必追）兜底，
  //    避免对同一缺口罚两次造成的形式主义追问。
  function coverageBelowHalf(question, answer) {
    const points = Array.isArray(question.refPoints) ? question.refPoints : [];
    if (points.length === 0) return false;
    const answerLower = answer.toLowerCase();
    const anchor = new Set();
    const hints = Array.isArray(question.followupHints) ? question.followupHints : [];
    for (const part of [question.text, question.skill, ...hints]) {
      for (const k of extractKeywords(part)) anchor.add(k);
    }
    const covered = points.filter((p) => {
      const keywords = extractKeywords(p);
      if (keywords.length === 0) return true;
      if (!keywords.some((k) => anchor.has(k))) return true; // 评价性准则：免词法核对
      return keywords.some((k) => (/^[a-z0-9]/.test(k) ? answerLower.includes(k) : answer.includes(k)));
    }).length;
    return covered * 2 < points.length;
  }

  // 追问触发（V1.1 校准）：低分（<60）必追；中分（<80）且关键词覆盖不足一半才追；
  // 高分（≥80）即使字面覆盖不足也不追问，避免形式主义追问。
  function needsFollowup(score, question, answer) {
    if (score.total < 60) return true;
    return score.total < 80 && coverageBelowHalf(question, answer);
  }

  async function buildFollowup(question, answer) {
    const hints = Array.isArray(question.followupHints) ? question.followupHints : [];
    const base = hints[0]
      || (persona && typeof persona.followupTemplate === 'function'
        ? persona.followupTemplate(question.text, answer)
        : null)
      || `能围绕「${question.text}」再展开一些具体细节吗？`;
    if (!llm) return base;
    try {
      const { text } = await llm.complete({
        system: persona ? persona.system : undefined,
        messages: [{
          role: 'user',
          content: '请把下面这句面试追问润色得更自然口语化，不得改变追问指向，只输出润色后的一句追问：\n'
            + `${base}\n（候选人刚才的回答节选：${String(answer).slice(0, 200)}）`,
        }],
        maxTokens: 200,
      });
      const polished = typeof text === 'string' ? text.trim() : '';
      return polished || base;
    } catch {
      // llm 失败静默回退确定性文本，流程不中断
      return base;
    }
  }

  function commit(score) {
    answers.push(currentAnswer);
    scores.push(score);
    current = null;
    currentAnswer = null;
    firstScore = null;
    state = 'ready';
  }

  return {
    get state() {
      return state;
    },

    nextQuestion() {
      if (state !== 'ready') fail('nextQuestion');
      if (cursor >= plan.questions.length) return null; // null = 没有下一题，该 finish 了
      current = plan.questions[cursor];
      cursor += 1;
      state = 'awaiting_answer';
      return current;
    },

    async submitAnswer(text) {
      if (state !== 'awaiting_answer' && state !== 'awaiting_followup') fail('submitAnswer');
      const answer = String(text ?? '');

      if (state === 'awaiting_answer') {
        const score = await scorer.scoreAnswer({ question: current, answer });
        currentAnswer = { questionId: current.id, text: answer };
        if (needsFollowup(score, current, answer)) {
          firstScore = score;
          const followup = await buildFollowup(current, answer);
          state = 'awaiting_followup';
          return { score, followup };
        }
        commit(score);
        return { score, followup: null };
      }

      // awaiting_followup：追问回答并入该题重评，取两次较高分；每题至多追问 1 次
      currentAnswer.followupText = answer;
      const merged = `${currentAnswer.text}\n${answer}`;
      const rescore = await scorer.scoreAnswer({ question: current, answer: merged });
      const better = rescore.total >= firstScore.total ? rescore : firstScore;
      commit(better);
      return { score: better, followup: null };
    },

    finish() {
      if (state !== 'ready') fail('finish');
      state = 'finished';
      return {
        plan,
        answers,
        scores,
        sessionScore: scorer.scoreSession(scores),
        startedAt,
        endedAt: now(),
      };
    },

    // 提前交卷（V1.2 P2-5 收口）：finished 之外任意状态可调。
    // 挂在 awaiting_answer 的题（未作答）与挂在 awaiting_followup 的题（首答已评但
    // 未定稿——追问重评可能取更高分，半程收录会低估该题）都整题丢弃；
    // SessionResult 只含已完成评分的题，sessionScore 只按已答题的 scores 计算，
    // 未答题不算 0 分拉低均值。abandon 后状态即 finished，再调任何方法抛 StateError。
    abandon() {
      if (state === 'finished') fail('abandon');
      current = null;
      currentAnswer = null;
      firstScore = null;
      state = 'finished';
      return {
        plan,
        answers,
        scores,
        sessionScore: scorer.scoreSession(scores),
        startedAt,
        endedAt: now(),
        abandoned: true,
        answeredCount: scores.length,
        totalCount: plan.questions.length,
      };
    },
  };
}
