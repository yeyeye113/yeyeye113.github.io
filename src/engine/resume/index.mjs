// 简历解析与匹配（契约 §2）：技能归一与 JD 引擎共用同一份词典真源，不复制第二份。
import { extractSkills } from '../jd/dict.mjs';

const emptyProfile = () => ({ years: 0, skills: [], experiences: [], highlights: [] });

// 「X年经验 / 工作X年」显式声明
const EXPLICIT_YEARS = [
  /(\d{1,2})\s*年(?:以上)?(?:相关|工作|开发|从业)*经验/,
  /工作(?:经验)?[:：\s]*(\d{1,2})\s*年/,
];
// 「2019-2023 / 2019.03~至今」年份区间
const RANGE_RE = /(20\d{2})(?:\s*[年./]\s*\d{1,2}\s*月?)?\s*[-—~～至到]+\s*(?:(20\d{2})(?:\s*[年./]\s*\d{1,2}\s*月?)?|至今|现在|present|now)/gi;

function estimateYears(text) {
  let explicit = 0;
  for (const re of EXPLICIT_YEARS) {
    const m = text.match(re);
    if (m) explicit = Math.max(explicit, Number(m[1]));
  }
  const nowYear = new Date().getFullYear();
  let minStart = Infinity;
  let maxEnd = -Infinity;
  for (const m of text.matchAll(RANGE_RE)) {
    const start = Number(m[1]);
    const end = m[2] ? Number(m[2]) : nowYear;
    if (end >= start) {
      minStart = Math.min(minStart, start);
      maxEnd = Math.max(maxEnd, end);
    }
  }
  const span = maxEnd > minStart ? maxEnd - minStart : 0;
  return Math.min(40, Math.max(explicit, span));
}

const ROLE_HINT = /(工程师|开发|架构师|经理|总监|专员|主管|设计师|分析师|负责人|运营|产品|测试|实习生|顾问)/;
const SEP = /[|｜·•/／—]/;
const STOP_HEAD = /^(技能|专业技能|掌握技能|教育|教育经历|教育背景|证书|自我评价|荣誉)/;
const BULLET = /^[-•·*◦]?\s*\d*[.、)）]?\s*/;

function isRoleLine(line) {
  if (line.length > 45 || !ROLE_HINT.test(line)) return false;
  return SEP.test(line) || /(公司|集团|科技|网络|实验室|研究院|大学)/.test(line) || line.length <= 20;
}

function extractRole(line) {
  // 「公司 · 职位」取含称谓的那一段
  const parts = line.split(SEP).map((p) => p.trim()).filter(Boolean);
  return parts.find((p) => ROLE_HINT.test(p)) ?? line;
}

function parseExperiences(lines) {
  const experiences = [];
  let current = null;
  for (const line of lines) {
    if (STOP_HEAD.test(line)) { current = null; continue; }
    if (isRoleLine(line)) {
      current = { role: extractRole(line), points: [] };
      experiences.push(current);
      continue;
    }
    if (current) {
      const point = line.replace(BULLET, '').trim();
      if (point && current.points.length < 12) current.points.push(point);
    }
  }
  return experiences;
}

// 量化句：含数字且带量化语境词，排除纯年份区间/联系方式
const QUANT_HINT = /(%|％|倍|万|千万|亿|k|w|qps|tps|ms|毫秒|秒|人|次|个|条|元|单|台|页|分|提升|下降|降低|增长|优化|节省|覆盖|支撑)/i;
const PURE_DATE = /^\s*(20\d{2}[年.\/\-\s]*){1,2}([-—~～至到]+\s*(20\d{2}|至今|现在)?[年月.\/\-\s]*)?$/;

function pickHighlights(text) {
  const sentences = text.split(/[。；;！!\r\n]+/).map((s) => s.trim()).filter(Boolean);
  const out = [];
  for (const s of sentences) {
    if (s.length < 8 || !/\d/.test(s) || PURE_DATE.test(s)) continue;
    if (QUANT_HINT.test(s)) out.push(s.replace(BULLET, '').trim());
    if (out.length >= 10) break;
  }
  return [...new Set(out)];
}

export function parseResume(text) {
  if (typeof text !== 'string' || !text.trim()) return emptyProfile();
  const lines = text.split(/\r?\n/).map((l) => l.trim()).filter(Boolean);
  return {
    years: estimateYears(text),
    skills: extractSkills(text).map((s) => s.name),
    experiences: parseExperiences(lines),
    highlights: pickHighlights(text),
  };
}

// matchResume(jd, resume) -> { matched, missing, matchScore 0-100 }
// 分数 = 命中 JD 技能的权重占比（权重高的技能缺失扣得更多）。
export function matchResume(jd, resume) {
  const jdSkills = Array.isArray(jd?.skills) ? jd.skills : [];
  const resumeSet = new Set(Array.isArray(resume?.skills) ? resume.skills : []);

  const matched = [];
  const missing = [];
  let totalWeight = 0;
  let matchedWeight = 0;
  for (const s of jdSkills) {
    if (!s || typeof s.name !== 'string') continue;
    const w = Number.isFinite(s.weight) ? s.weight : 1;
    totalWeight += w;
    if (resumeSet.has(s.name)) {
      matched.push(s.name);
      matchedWeight += w;
    } else {
      missing.push(s.name);
    }
  }

  const matchScore = totalWeight > 0 ? Math.round((matchedWeight / totalWeight) * 100) : 0;
  return { matched, missing, matchScore };
}
