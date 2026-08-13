// src/engine/scoring/index.mjs — 评分引擎（接口真源：docs/架构契约.md §4）
// 确定性启发式：同输入同输出，零随机、零 IO、零运行时依赖。
// 五维权重（契约钉死）：structure 25 / relevance 25 / depth 20 / quantification 15 / clarity 15。

export const WEIGHTS = {
  structure: 0.25,
  relevance: 0.25,
  depth: 0.2,
  quantification: 0.15,
  clarity: 0.15,
};

const DIMS = ['structure', 'relevance', 'quantification', 'depth', 'clarity'];

const DIM_LABELS = {
  structure: '结构化表达',
  relevance: '岗位相关性',
  quantification: '量化支撑',
  depth: '思考深度',
  clarity: '表达清晰度',
};

// ---- STAR 信号词族（中文，情境/任务/行动/结果四族）----
const STAR_FAMILIES = [
  {
    key: 'situation',
    label: '情境（S）',
    words: ['情境', '背景', '当时', '那时', '项目中', '在项目', '场景', '面临', '接手', '起因'],
  },
  {
    key: 'task',
    label: '任务（T）',
    words: ['任务', '目标', '职责', '负责', '要求', '指标', '需要解决', '我的角色'],
  },
  {
    key: 'action',
    label: '行动（A）',
    words: ['行动', '做法', '采取', '实施', '设计', '搭建', '优化', '推动', '落地', '执行', '引入', '拆解', '我先', '我做', '第一步', '主导'],
  },
  {
    key: 'result',
    label: '结果（R）',
    words: ['结果', '最终', '达成', '提升', '降低', '效果', '成果', '上线后', '收益', '减少', '增长', '零故障'],
  },
];

// ---- 深度信号词（因果 / 权衡 / 复盘 三族）----
const DEPTH_FAMILIES = [
  {
    key: 'causal',
    label: '因果链',
    words: ['因为', '所以', '因此', '导致', '由于', '从而', '以便', '原因是', '之所以', '于是'],
  },
  {
    key: 'tradeoff',
    label: '权衡取舍',
    words: ['权衡', '取舍', '对比', '相比', '优缺点', '代价', '折中', '备选', '舍弃', '选择', '两个方案', '边界'],
  },
  {
    key: 'review',
    label: '复盘反思',
    words: ['复盘', '反思', '总结', '教训', '改进', '如果重来', '下次', '沉淀', '意识到'],
  },
];

// ---- 量化检测：数字＋单位/百分比/倍数 ----
const QUANT_RE =
  /\d+(?:\.\d+)?\s*(?:%|％|倍|万|亿|千|百分点|个|名|人|天|周|月|年|小时|分钟|秒|毫秒|ms|s\b|qps|tps|次|条|台|行|元|块|kb|mb|gb|tb|k\b|w\b)|百分之[零一二三四五六七八九十百\d]+|[一二两三四五六七八九十]+倍/gi;

// ---- 口头禅 / 空话 ----
const FILLERS = ['差不多', '就是说', '之类的', '什么的', '反正', '大概吧', '那个那个', '你懂的', '呗'];

// ---- 建议模板（按最弱维度选，可执行改法）----
const SUGGESTIONS = {
  structure: [
    '按 STAR 重排回答：先一句话交代情境与你的任务，再讲你采取的 2-3 步行动，最后用结果收尾。',
    '开头 15 秒内点明「当时的背景是……我负责的任务是……」，让面试官立刻抓到叙事骨架。',
  ],
  relevance: [
    '回答前先扫一眼题目要考的点，把岗位 JD 里的关键技能词（而不是泛泛的形容词）显式说进回答里。',
    '每答一题都回扣岗位要求一次，例如「这正对应贵司 JD 里提到的高并发场景」。',
  ],
  quantification: [
    '给每个结论配一个数字：优化前后指标、影响的用户量、节省的时间或成本，没有精确值就给量级估计。',
    '把「效果不错」换成可验证的表述，如「P99 从 800ms 降到 120ms」「转化率提升 12%」。',
  ],
  depth: [
    '讲方案时补上「为什么不选另一条路」：一句权衡（成本/风险/收益）能立刻体现决策深度。',
    '结尾加一句复盘：这件事如果重来你会改什么，暴露你的反思习惯而不是只报流水账。',
  ],
  clarity: [
    '删掉「差不多」「就是说」「之类的」等口头禅，改用短句直接陈述事实。',
    '把回答控制在 40-800 字之间：过短显得敷衍，过长稀释重点；先给结论再展开细节。',
  ],
};

function clamp(x, lo = 0, hi = 100) {
  return Math.max(lo, Math.min(hi, x));
}

function countMeaningfulChars(text) {
  const m = text.match(/[\u4e00-\u9fffA-Za-z0-9]/g);
  return m ? m.length : 0;
}

function isInvalidAnswer(answer) {
  if (typeof answer !== 'string') return true;
  const t = answer.trim();
  if (t.length === 0) return true;
  const meaningful = countMeaningfulChars(t);
  // 纯乱码/符号堆：有效字符太少或占比过低，一律判无效（不抛异常）
  return meaningful < 5 || meaningful / t.length < 0.3;
}

function familyHit(text, words) {
  for (const w of words) {
    if (text.includes(w)) return w;
  }
  return null;
}

// 相关性命中：refPoint 拆词后任一 ≥2 字词元出现在回答里即算覆盖
function tokenize(s) {
  return String(s)
    .split(/[^\u4e00-\u9fffA-Za-z0-9]+/)
    .filter((t) => t.length >= 2);
}

function coveredBy(answerLower, point) {
  const tokens = tokenize(point);
  if (tokens.length === 0) return false;
  return tokens.some((t) => answerLower.includes(t.toLowerCase()));
}

function zeroScore(note) {
  return {
    dims: { structure: 0, relevance: 0, quantification: 0, depth: 0, clarity: 0 },
    total: 0,
    evidence: [{ dim: 'clarity', note }],
    suggestions: [
      '先给出实质性回答：哪怕只有三句话，也按「背景—我做了什么—结果如何」组织。',
      '作答时对准题目要考察的点（见题目本身与岗位 JD 关键词），避免空白或无效字符。',
    ],
  };
}

function weightedTotal(dims) {
  return Math.round(DIMS.reduce((acc, d) => acc + dims[d] * WEIGHTS[d], 0));
}

export function scoreAnswer({ question, answer, jd }) {
  if (isInvalidAnswer(answer)) {
    return zeroScore('回答为空或不含有效内容，按 0 分处理。');
  }

  const text = answer.trim();
  const lower = text.toLowerCase();
  const evidence = [];

  // ---- structure：STAR 四要素，每要素 25 分 ----
  let structure = 0;
  for (const fam of STAR_FAMILIES) {
    const hit = familyHit(text, fam.words);
    if (hit) {
      structure += 25;
    } else {
      evidence.push({ dim: 'structure', note: `缺少 STAR 要素「${fam.label}」的信号，叙事骨架不完整。` });
    }
  }

  // ---- relevance：refPoints 覆盖（60%）＋ JD 关键词覆盖（40%）----
  const refPoints = Array.isArray(question?.refPoints) ? question.refPoints : [];
  const keywords = Array.isArray(jd?.keywords) ? jd.keywords : [];
  let refRatio = 0.5; // 无参考点时给中性分
  if (refPoints.length > 0) {
    const missed = refPoints.filter((p) => !coveredBy(lower, p));
    refRatio = (refPoints.length - missed.length) / refPoints.length;
    for (const p of missed.slice(0, 3)) {
      evidence.push({ dim: 'relevance', note: `未覆盖评分参考点「${p}」。` });
    }
  }
  let kwRatio = 0.5;
  if (keywords.length > 0) {
    const hitCount = keywords.filter((k) => lower.includes(String(k).toLowerCase())).length;
    kwRatio = hitCount / keywords.length;
    if (kwRatio < 0.3) {
      evidence.push({ dim: 'relevance', note: 'JD 关键技能词几乎未出现在回答里，针对性不足。' });
    }
  }
  const relevance = Math.round(clamp(100 * (0.6 * refRatio + 0.4 * kwRatio)));

  // ---- quantification：数字＋单位/百分比/倍数命中次数 ----
  const quantHits = text.match(QUANT_RE) || [];
  let quantification;
  if (quantHits.length === 0) {
    quantification = 8;
    evidence.push({ dim: 'quantification', note: '全文没有任何数字量化支撑，结论无法被验证。' });
  } else if (quantHits.length === 1) {
    quantification = 55;
    evidence.push({
      dim: 'quantification',
      note: '仅有一处量化，关键结论仍缺数据支撑。',
      quote: quantHits[0].trim(),
    });
  } else if (quantHits.length === 2) {
    quantification = 78;
  } else {
    quantification = 100;
  }

  // ---- depth：因果/权衡/复盘 三族 ----
  const DEPTH_STEPS = [0, 34, 67, 100];
  let depthFams = 0;
  for (const fam of DEPTH_FAMILIES) {
    if (familyHit(text, fam.words)) {
      depthFams += 1;
    } else {
      evidence.push({ dim: 'depth', note: `没有体现「${fam.label}」类思考信号，回答停留在过程描述。` });
    }
  }
  const depth = DEPTH_STEPS[depthFams];

  // ---- clarity：长度带 ＋ 口头禅惩罚 ----
  const len = text.length;
  let clarity;
  if (len < 40) {
    clarity = 25;
    evidence.push({ dim: 'clarity', note: `回答仅 ${len} 字（<40 字），信息量不足以支撑评估，按过短重罚。` });
  } else if (len > 800) {
    clarity = 85;
    evidence.push({ dim: 'clarity', note: `回答长达 ${len} 字（>800 字），重点被稀释，按超长轻罚。` });
  } else {
    clarity = 100;
  }
  let fillerPenalty = 0;
  for (const f of FILLERS) {
    let idx = text.indexOf(f);
    let count = 0;
    while (idx !== -1) {
      count += 1;
      idx = text.indexOf(f, idx + f.length);
    }
    if (count > 0) {
      fillerPenalty += 8 * count;
      evidence.push({
        dim: 'clarity',
        note: `口头禅/空话「${f}」出现 ${count} 次，削弱专业感。`,
        quote: f,
      });
    }
  }
  clarity = clamp(clarity - Math.min(fillerPenalty, 40));

  const dims = { structure, relevance, quantification, depth, clarity };
  const total = weightedTotal(dims);

  // ---- suggestions：按最弱维度选模板，保证 ≥2 条 ----
  const orderedWeak = [...DIMS].sort((a, b) => dims[a] - dims[b] || DIMS.indexOf(a) - DIMS.indexOf(b));
  const suggestions = [];
  for (const d of orderedWeak) {
    if (suggestions.length >= 2 && dims[d] >= 85) break;
    suggestions.push(SUGGESTIONS[d][suggestions.length % SUGGESTIONS[d].length]);
    if (suggestions.length >= 3) break;
  }
  while (suggestions.length < 2) {
    suggestions.push(SUGGESTIONS[orderedWeak[0]][suggestions.length % 2]);
  }

  return { dims, total, evidence, suggestions };
}

export function scoreSession(scores) {
  const list = Array.isArray(scores) ? scores : [];
  if (list.length === 0) {
    return {
      total: 0,
      radar: { structure: 0, relevance: 0, quantification: 0, depth: 0, clarity: 0 },
      weakest: [],
      strongest: [],
    };
  }
  const radar = {};
  for (const d of DIMS) {
    radar[d] = Math.round(list.reduce((acc, s) => acc + (s?.dims?.[d] ?? 0), 0) / list.length);
  }
  const total = Math.round(list.reduce((acc, s) => acc + (s?.total ?? 0), 0) / list.length);
  const values = DIMS.map((d) => radar[d]);
  const min = Math.min(...values);
  const max = Math.max(...values);
  const weakest = DIMS.filter((d) => radar[d] === min);
  const strongest = DIMS.filter((d) => radar[d] === max);
  return { total, radar, weakest, strongest };
}

export { DIM_LABELS, DIMS };
