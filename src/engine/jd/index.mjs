// JD 解析引擎（契约 §1）：纯规则式，零依赖。
// parseJD(text) -> JDProfile；空文本/乱码不抛异常，返回低置信默认形状。
import { extractSkills, LEVEL_SIGNALS, DOMAIN_SIGNALS, countOccurrences } from './dict.mjs';

const LEVELS = ['实习', '初级', '中级', '高级', '专家', '管理', '未知'];

const emptyProfile = () => ({
  title: '未知岗位',
  level: '未知',
  domain: '通用',
  skills: [],
  responsibilities: [],
  keywords: [],
});

const TITLE_HINT = /(工程师|开发|架构师|经理|总监|专员|主管|设计师|分析师|运营|产品|测试|顾问|专家|实习生|负责人|scientist|engineer|developer|manager|designer|analyst)/i;
const SECTION_HEAD = /^(岗位职责|工作职责|职责描述|工作内容|你将负责|职位描述)[:：]?\s*$/;
const SECTION_END = /^(任职要求|岗位要求|职位要求|任职资格|加分项|我们提供|福利待遇)[:：]?\s*$/;
const BULLET = /^[-•·*◦]?\s*\d*[.、)）]?\s*/;

function pickTitle(lines) {
  // 优先取带岗位称谓的短行；兜底取第一行短文本
  for (const line of lines.slice(0, 5)) {
    if (line.length <= 40 && TITLE_HINT.test(line)) {
      return line.replace(/^(招聘|职位|岗位|职位名称|岗位名称)[:：]\s*/, '');
    }
  }
  const first = lines[0];
  if (first && first.length <= 30 && !SECTION_HEAD.test(first) && !SECTION_END.test(first)) return first;
  return '未知岗位';
}

// 返回 { level, word }；word 用于 keywords 收集
function detectLevel(text) {
  for (const [level, words] of LEVEL_SIGNALS) {
    for (const w of words) {
      if (countOccurrences(text, w) > 0) return { level, word: w };
    }
  }
  return null;
}

function detectDomain(text, skills) {
  const score = new Map();
  const hitWords = [];
  for (const [domain, words] of Object.entries(DOMAIN_SIGNALS)) {
    for (const w of words) {
      const c = countOccurrences(text, w);
      if (c > 0) {
        score.set(domain, (score.get(domain) ?? 0) + c * 2);
        hitWords.push(w);
      }
    }
  }
  // 技能所属领域做辅助信号（单个技能最多记 3 次，防高频词垄断）
  for (const s of skills) {
    score.set(s.domain, (score.get(s.domain) ?? 0) + Math.min(s.count, 3));
  }
  let best = null;
  for (const [domain, v] of score) {
    if (!best || v > best.v) best = { domain, v };
  }
  return { domain: best && best.v > 0 ? best.domain : '通用', hitWords };
}

function pickResponsibilities(lines) {
  const out = [];
  let inSection = false;
  for (const line of lines) {
    if (SECTION_HEAD.test(line)) { inSection = true; continue; }
    if (SECTION_END.test(line)) { inSection = false; continue; }
    if (inSection) {
      const item = line.replace(BULLET, '').trim();
      if (item) out.push(item);
    }
  }
  if (out.length > 0) return out.slice(0, 12);
  // 无显式职责段时，兜底抓「负责/参与/主导/推动」句
  return lines
    .filter((l) => /(负责|参与|主导|推动|搭建|完成)/.test(l))
    .map((l) => l.replace(BULLET, '').trim())
    .filter(Boolean)
    .slice(0, 8);
}

export function parseJD(text) {
  if (typeof text !== 'string' || !text.trim()) return emptyProfile();

  const lines = text.split(/\r?\n/).map((l) => l.trim()).filter(Boolean);
  const titleLine = pickTitle(lines);
  const found = extractSkills(text);
  const titleSkills = new Set(extractSkills(titleLine).map((s) => s.name));

  const skills = found.map((s) => {
    // 频次定基础权重，出现在岗位名里加一档，封顶 3
    const base = s.count >= 3 ? 3 : s.count;
    const weight = Math.min(3, Math.max(1, base + (titleSkills.has(s.name) ? 1 : 0)));
    return { name: s.name, weight };
  });

  const levelHit = detectLevel(titleLine) ?? detectLevel(text);
  const level = levelHit && LEVELS.includes(levelHit.level) ? levelHit.level : '未知';

  const { domain, hitWords } = detectDomain(text, found);

  const keywords = [...new Set([
    ...found.map((s) => s.name),
    ...(levelHit ? [levelHit.word] : []),
    ...hitWords,
  ])];

  return {
    title: titleLine || '未知岗位',
    level,
    domain,
    skills,
    responsibilities: pickResponsibilities(lines),
    keywords,
  };
}
