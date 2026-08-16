// src/ui-core/index.mjs — 前端接缝层纯逻辑（接口真源：docs/架构契约.md §13）
// V1.3 从 app/app.js 外移：全部为不碰 DOM、不碰全局状态的纯函数/纯数据变换，
// 零 IO、零外部依赖，浏览器与 Node 双端可用；DOM 操作与事件绑定仍留在 app.js。
// 机检跑道：test/ui-core.test.mjs。
// 仓内 import 仅限纯常量与纯函数（零 IO 纪律不破）：评分引擎的 DIMS/DIM_LABELS（契约 §4，
// 雷达轴顺序与中文标签单一真源）；报告层的 DISCLOSURE（契约 §12 分享卡条款——
// 披露句必须绘在卡面上且与 shareText 同源，不在这里手抄第二份）。
import { DIMS, DIM_LABELS } from '../engine/scoring/index.mjs';
import { DISCLOSURE } from '../report/index.mjs';
// V2.4 #6：档案上限同源 storage（契约 §9 MAX_PROFILES）——上限判断的展示口径在
// buildProfileDraft，数字真源只有 storage 一份，这里 import 纯常量不破零 IO 纪律。
import { MAX_PROFILES } from '../storage/index.mjs';
// V2.4 #7 复核修复：题集导入的条目校验（trim/长度上下限/type 枚举回落）唯一真源是
// §16 makeCustomQuestion——纯函数零 IO，不在这里抄第二份判断口径。
import { makeCustomQuestion } from '../custom/index.mjs';
// V2.6 报告面：公考五维轴序单真源（与 bank.dims / 报告②节同序），不在这里手抄维名。
import { GONGKAO_DIMS, GONGKAO_DEFAULT_ROUNDS } from '../gongkao/index.mjs';

// ---- 纯数据：模式与题数选项（准备页 pill 组与标签映射的单一真源） ----

export const MODE_OPTIONS = [
  { value: 'comprehensive', label: '综合' },
  { value: 'technical', label: '技术' },
  { value: 'behavioral', label: '行为' },
  { value: 'hr', label: 'HR' },
];

export const ROUNDS_OPTIONS = [5, 8, 12];

// 公考场题数 pill（V2.8）：与 ROUNDS_OPTIONS 分列——12 不是五维整除档，
// 公考只给 5（各一）/ 8（余数法）/ 10（各二）。parse 非法档回默认 5，不静默吃 JD 路径的 12。
export const GONGKAO_ROUND_OPTIONS = Object.freeze([5, 8, 10]);

export function parseGongkaoRounds(value) {
  const n = Math.trunc(Number(value));
  if (GONGKAO_ROUND_OPTIONS.includes(n)) return n;
  return GONGKAO_DEFAULT_ROUNDS;
}

export function describeGongkaoStartLabel(rounds) {
  return `开练公考场（${parseGongkaoRounds(rounds)} 题）`;
}

// 不进准备页 pill 组、但会出现在台账行/报告标题的扩展模式标签（V2.1）：
// drill 由「弱项重练」入口触发生成（契约 §15 buildDrillPlan），不是用户可选模式，
// 混进 MODE_OPTIONS 会让准备页多出一个没有出题语义的 pill。
// gongkao（V2.6 卡26）：公考结构化题库场，由专用入口触发（不吃 JD 出题语义），同款取舍。
const EXTRA_MODE_LABELS = { drill: '弱项重练', gongkao: '公考结构化' };

// modeLabel(mode) -> string：契约 mode 值转中文标签；未知值原样字符串化（不抛）
export function modeLabel(mode) {
  const found = MODE_OPTIONS.find((m) => m.value === mode);
  if (found) return found.label;
  if (typeof mode === 'string' && EXTRA_MODE_LABELS[mode]) return EXTRA_MODE_LABELS[mode];
  return String(mode ?? '未知');
}

// buildDrillSummary(mistakes, { max=5, previewLen=24 }) -> { total, pick, lead, preview } | null
// 重练入口卡文案的纯数据构建（V2.1）：mistakes 为 collectMistakes 产出（已按分升序，
// 首条即最弱）；空/坏输入返回 null，调用方据此隐藏入口卡。pick 封顶 max 与
// buildDrillPlan 的 rounds 同源口径（app.js 两处传同一个值）。
export function buildDrillSummary(mistakes, { max = 5, previewLen = 24 } = {}) {
  const list = Array.isArray(mistakes)
    ? mistakes.filter((m) => m && m.question && typeof m.question.text === 'string')
    : [];
  if (list.length === 0) return null;
  const weakestText = list[0].question.text.trim();
  const clipped = weakestText.length > previewLen ? `${weakestText.slice(0, previewLen)}…` : weakestText;
  return {
    total: list.length,
    pick: Math.min(list.length, max),
    lead: `你有 ${list.length} 道低分题待攻克`,
    preview: `最弱一题：${clipped}`,
  };
}

// 本地时区日期 'YYYY-MM-DD'（内部单一真源，P2-3 收口）：
// fmtTime / buildReportMeta / buildLedgerEntry 三处共用，台账与报告日期永不分裂。
// 调用方保证 ts 为有限数字（各出口自带「未知时间」兜底）。
function localDateStr(ts) {
  const d = new Date(ts);
  const p = (n) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
}

// fmtTime(ts) -> 'YYYY-MM-DD HH:mm' | '未知时间'
// 只接受 epoch 毫秒数字（storage savedAt 契约口径）；ISO 字符串/null/undefined/NaN
// 一律回「未知时间」——绝不把 Invalid Date 漏到界面（V1.2 P0 回归钉）。
export function fmtTime(ts) {
  if (!Number.isFinite(ts)) return '未知时间';
  const d = new Date(ts);
  const p = (n) => String(n).padStart(2, '0');
  return `${localDateStr(ts)} ${p(d.getHours())}:${p(d.getMinutes())}`;
}

// sortSessionsByTimeDesc(list) -> 新数组：savedAt（缺则 endedAt）数字降序；
// 坏值（字符串/缺失）沉底且互不比较；非数组回 []；不改动入参。
export function sortSessionsByTimeDesc(list) {
  const key = (rec) => {
    const t = Number.isFinite(rec?.savedAt) ? rec.savedAt : rec?.endedAt;
    return Number.isFinite(t) ? t : -Infinity;
  };
  return [...(Array.isArray(list) ? list : [])].sort((a, b) => {
    const ka = key(a);
    const kb = key(b);
    if (ka === kb) return 0; // 含双 -Infinity：坏值之间保持原序
    return kb > ka ? 1 : -1;
  });
}

// buildReportMeta({ result, mode }) -> { date, mode, totalScore, abandoned, answeredCount, totalCount }
// 导出层（src/export toMarkdown/suggestFilename）只消费 date/mode/totalScore；
// abandoned 三字段供报告页徽标与台账标注。时间优先 savedAt、退 endedAt，坏值回「未知时间」。
export function buildReportMeta({ result, mode } = {}) {
  const ts = Number.isFinite(result?.savedAt) ? result.savedAt : result?.endedAt;
  return {
    date: Number.isFinite(ts) ? localDateStr(ts) : '未知时间',
    mode: modeLabel(mode),
    totalScore: result?.sessionScore?.total ?? undefined,
    abandoned: result?.abandoned === true,
    answeredCount: result?.answeredCount,
    totalCount: result?.totalCount,
  };
}

// isReportUnlocked({ session, entitlements, memoryUnlockedIds, now? }) -> boolean
// 三源归一（任一为真即解锁，V1.2 前的双源隐患收口处）：
//   源1 storage 读回的会话记录 unlocked === true；
//   源2 会员期内（entitlements.memberUntil 解析后 >= now）；
//   源3 本会话内存兜底集合含该会话 id。
// 全空输入判假不抛；now 可注入保证测试确定性。
export function isReportUnlocked({ session, entitlements, memoryUnlockedIds, now } = {}) {
  if (session?.unlocked === true) return true;
  if (session?.id != null && memoryUnlockedIds?.has?.(session.id) === true) return true;
  const until = entitlements?.memberUntil;
  if (until != null) {
    const t = Date.parse(until);
    const ref = Number.isFinite(now) ? now : Date.now();
    if (Number.isFinite(t) && t >= ref) return true;
  }
  return false;
}

// buildLedgerEntry({ result, mode, now? })
//   -> { date, mode, total, radar?, abandoned?, answeredCount?, totalCount? }
// 台账条目（契约 §9 appendLedger 消费）：date 为本地时区 YYYY-MM-DD，与
// buildReportMeta 同源（localDateStr，P2-3 收口——UTC 口径曾让 0-8 点完卷记到前一天）；
// 提前交卷时如实带 abandoned 三字段，完卷不带。
// V1.6：五维 radar（sessionScore.radar）随条目落账（浅拷贝，不与来源别名共享）；
// 来源缺 radar 时不带该字段——旧条目形状向后兼容，趋势/雷达消费方各自跳过缺失项。
export function buildLedgerEntry({ result, mode, now } = {}) {
  const ts = Number.isFinite(now) ? now : Date.now();
  const entry = {
    date: localDateStr(ts),
    mode,
    total: result?.sessionScore?.total ?? 0,
  };
  const radar = result?.sessionScore?.radar;
  if (radar != null && typeof radar === 'object') {
    entry.radar = { ...radar };
  }
  if (result?.abandoned === true) {
    entry.abandoned = true;
    entry.answeredCount = result?.answeredCount;
    entry.totalCount = result?.totalCount;
  }
  return entry;
}

// abandonBadgeText(resultOrMeta) -> string | null
// 「提前交卷 · 已答 N/共 M」徽标文本；吃 SessionResult 或 buildReportMeta 产物均可
// （都带 abandoned/answeredCount/totalCount）；完卷返回 null（不出徽标）。
export function abandonBadgeText(result) {
  if (result?.abandoned !== true) return null;
  return `提前交卷 · 已答 ${result?.answeredCount ?? '?'}/共 ${result?.totalCount ?? '?'}`;
}

// buildShareCardModel({ meta, sessionScore, jd })
//   -> { title, subtitle, scoreText, scoreBand, scoreLabel, modeLine, dateLine,
//        badges, radar, noRadar, footer, disclosure, filename }
// V2.3 战绩分享卡的可测面（契约 §12/§13）：画卡所需的全部文本行与颜色档在这里定死，
// canvas 只管照 model 画、不做任何判定。披露句同源 import DISCLOSURE（诚实承诺不因
// 载体变化而豁免）；卡面不含用户身份信息与简历内容——model 字段只有分数与维度。
// 分数带：≥80 gold / 60-79 mid / <60 low；总分非有限数字给占位「—」并落 mid（中性档，
// 不给无分卡片挂红挂金）。徽标：abandoned 复用 abandonBadgeText 口径；mode 为
// EXTRA_MODE_LABELS.drill 时带「弱项重练场」。缺 radar 标 noRadar=true 且 radar=null，
// canvas 侧据此跳过雷达区。文件名沿 suggestFilename 风格：过面战绩-YYYYMMDD-N分.png。
export function buildShareCardModel({ meta, sessionScore, jd } = {}) {
  const total = Number.isFinite(sessionScore?.total) ? sessionScore.total
    : (Number.isFinite(meta?.totalScore) ? meta.totalScore : null);
  const scoreText = total == null ? '—' : String(total);
  const scoreBand = total == null ? 'mid' : (total >= 80 ? 'gold' : (total >= 60 ? 'mid' : 'low'));

  const badges = [];
  const abandonText = abandonBadgeText(meta);
  if (abandonText) badges.push(abandonText);
  if (meta?.mode === EXTRA_MODE_LABELS.drill) badges.push('弱项重练场');

  const radar = sessionScore?.radar && typeof sessionScore.radar === 'object' ? sessionScore.radar : null;
  const dateLine = typeof meta?.date === 'string' && meta.date ? meta.date : '未知时间';
  const domain = typeof jd?.domain === 'string' && jd.domain ? jd.domain : '通用';
  // mode 来自 buildReportMeta（已是中文 label）；drill label 本身完整（「弱项重练」），
  // 常规模式 label 是单词（「技术」等）需补「模拟面试」后缀成整句。
  const mode = meta?.mode ?? '未知';
  const modeLine = mode === EXTRA_MODE_LABELS.drill ? `${mode} · ${domain}` : `${mode}模拟面试 · ${domain}`;

  return {
    title: '过面',
    subtitle: 'AI 模拟面试 · 练到心里有底',
    scoreText,
    scoreBand,
    scoreLabel: '综合得分',
    modeLine,
    dateLine,
    badges,
    radar,
    noRadar: radar == null,
    footer: 'yeyeye113.github.io',
    disclosure: DISCLOSURE,
    filename: `过面战绩-${dateLine.replaceAll('-', '')}${total == null ? '' : `-${total}分`}.png`,
  };
}

// buildTrendPoints(ledger, { width?, height?, pad?, maxPoints? })
//   -> { width, height, pad, points: [{ x, y, value }] }
// 趋势折线的坐标数学（SVG 字符串拼接留在前端）：纵轴固定 0-100（避免两点拉满全高
// 造成误读），越界值钳制；坏值（total 非数字）过滤；最多取最近 maxPoints 个；
// 空/单点/null 输入不炸（单点横向居中）。坐标保留 1 位小数。
export function buildTrendPoints(ledger, { width = 320, height = 100, pad = 8, maxPoints = 20 } = {}) {
  const values = (Array.isArray(ledger) ? ledger : [])
    .map((e) => e?.total)
    .filter((v) => Number.isFinite(v))
    .slice(-maxPoints);
  const w = width - pad * 2;
  const h = height - pad * 2;
  const points = values.map((v, i) => {
    const clamped = Math.max(0, Math.min(100, v));
    const x = pad + (values.length === 1 ? w / 2 : (i * w) / (values.length - 1));
    const y = pad + h - (clamped / 100) * h;
    return { x: Number(x.toFixed(1)), y: Number(y.toFixed(1)), value: v };
  });
  return { width, height, pad, points };
}

// buildRadarPoints(radar, { size? })
//   -> { size, center, radius, axes: [{ key, label, x, y, valueX, valueY }],
//        polygon: 'x1,y1 x2,y2 …', gridPolygons: [外圈, 中圈, 内圈] }
// 五维雷达五边形的坐标数学（SVG 字符串拼接留在前端）：
//   - 轴顺序与中文 label 取自评分引擎 DIMS/DIM_LABELS（单一真源）；
//   - 第一根轴指向正上方，顺时针每 72° 一根；(x,y) 为轴端点（满分位置）；
//   - 维度值 0-100 归一到半径（radius = size/2 - 24，留 label 边距），
//     越界钳制、非数字按 0（收缩到心）——坏值不炸；
//   - gridPolygons 是 100%/66%/33% 三圈底网格顶点串；坐标保留 1 位小数；
//   - radar 不是对象时回空轴集（axes: []、polygon: ''），消费方按无数据处理。
export function buildRadarPoints(radar, { size = 220 } = {}) {
  return buildAxisRadarPoints(radar, DIMS, { size, labels: DIM_LABELS, missingAsZero: true });
}

// buildGongkaoRadarPoints(gongkaoDims, { size? })
//   公考专属雷达（V2.6 报告面收口）：轴序取 GONGKAO_DIMS；只绘制有限数字分的维
//   ——本场没考到的维度不进轴（与 aggregateGongkaoDims「不造 0 分假象」同口径）。
//   野维 / 非数字分丢弃。空输入回空轴集不抛。
export function buildGongkaoRadarPoints(gongkaoDims, { size = 220 } = {}) {
  const labels = Object.fromEntries(GONGKAO_DIMS.map((d) => [d, d]));
  return buildAxisRadarPoints(gongkaoDims, GONGKAO_DIMS, { size, labels, missingAsZero: false });
}

function buildAxisRadarPoints(radar, keys, { size = 220, labels = {}, missingAsZero = false } = {}) {
  const center = size / 2;
  const radius = size / 2 - 24;
  const empty = { size, center, radius, axes: [], polygon: '', gridPolygons: [] };
  if (radar == null || typeof radar !== 'object') return empty;
  const axisKeys = missingAsZero
    ? keys
    : keys.filter((k) => Number.isFinite(radar[k]));
  if (axisKeys.length === 0) return empty;
  const r1 = (n) => Number(n.toFixed(1));
  const step = 360 / axisKeys.length;
  const dir = (i) => {
    const angle = ((-90 + i * step) * Math.PI) / 180;
    return [Math.cos(angle), Math.sin(angle)];
  };
  const axes = axisKeys.map((key, i) => {
    const [dx, dy] = dir(i);
    const raw = radar[key];
    const value = Number.isFinite(raw) ? Math.max(0, Math.min(100, raw)) : 0;
    const vr = (value / 100) * radius;
    return {
      key,
      label: labels[key] ?? key,
      x: r1(center + dx * radius),
      y: r1(center + dy * radius),
      valueX: r1(center + dx * vr),
      valueY: r1(center + dy * vr),
    };
  });
  const ring = (frac) => axisKeys
    .map((_, i) => {
      const [dx, dy] = dir(i);
      return `${r1(center + dx * radius * frac)},${r1(center + dy * radius * frac)}`;
    })
    .join(' ');
  return {
    size,
    center,
    radius,
    axes,
    polygon: axes.map((a) => `${a.valueX},${a.valueY}`).join(' '),
    gridPolygons: [ring(1), ring(2 / 3), ring(1 / 3)],
  };
}

// sanitizeLlmConfig({ baseURL, apiKey, model, timeoutMs? }) -> config | null
// AI 增强面板输入清洗：三字段 trim 后缺一即返回 null（调用方走纯本地模式）；
// timeoutMs 数字化（正有限数才收，其余整字段省略、由 LLM 层默认值兜底）。
// 本函数不持有任何值：apiKey 只在调用方内存变量里过手。
export function sanitizeLlmConfig({ baseURL, apiKey, model, timeoutMs } = {}) {
  const b = typeof baseURL === 'string' ? baseURL.trim() : '';
  const k = typeof apiKey === 'string' ? apiKey.trim() : '';
  const m = typeof model === 'string' ? model.trim() : '';
  if (!b || !k || !m) return null;
  const config = { baseURL: b, apiKey: k, model: m };
  const t = Number(timeoutMs);
  if (Number.isFinite(t) && t > 0) config.timeoutMs = t;
  return config;
}

// ---- V2.0 本地数据备份（契约 §13）：本地优先产品的逃生舱 ----
// 三函数全部只经 store 公开四面 API（契约 §9）读写，不碰 backend、不开 storage 后门。
// 已知公开 API 语义带来的两处口径（对拍/去重按此设计，交付与测试同口径）：
//   ① saveProfile 会重新发号（id/createdAt 刷新）——merge 判重按「id 或 jdText+resumeText
//     内容相同」双条件，防重新发号后同备份二次导入翻倍；
//   ② savedAt：storage V2.2 契约起 saveSession 对「传入的有限数字 savedAt」优先保留——
//     备份恢复不改写历史时间（接缝机检：test/ui-core.test.mjs 的 P1-2 用例）。

const BACKUP_APP = 'guomian';
const BACKUP_SCHEMA = 1;

// exportBackup(store) -> { payload, filename }
// 五面聚合成带信封的 JSON 字符串 { app, schema, exportedAt(epoch ms), data:{五面} }；
// V2.3 起 data 增 custom（自定义题集）——schema 仍 1：纯增字段、旧读端不受影响，
// validateBackup 对缺 custom 的旧备份宽容（当空数组），升 schema 反而会把旧应用挡在门外。
// filename 形如「过面备份-20260813.json」（本地日期，与台账日期同源 localDateStr）。
export function exportBackup(store) {
  const now = Date.now();
  const envelope = {
    app: BACKUP_APP,
    schema: BACKUP_SCHEMA,
    exportedAt: now,
    data: {
      profiles: store.listProfiles(),
      sessions: store.listSessions(),
      entitlements: store.getEntitlements(),
      ledger: store.getLedger(),
      custom: store.listCustomQuestions(),
    },
  };
  return {
    payload: JSON.stringify(envelope, null, 2),
    filename: `过面备份-${localDateStr(now).replaceAll('-', '')}.json`,
  };
}

// validateBackup(text) -> { ok:true, data, counts } | { ok:false, reason }
// 解析＋信封校验（app 标识 / schema 版本 / 四面形状逐面）；一切失败路径给中文 reason 不抛。
export function validateBackup(text) {
  let parsed;
  try {
    parsed = JSON.parse(String(text));
  } catch {
    return { ok: false, reason: '文件内容不是有效的 JSON，可能已损坏或选错了文件' };
  }
  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
    return { ok: false, reason: '备份格式不对：顶层应为信封对象' };
  }
  if (parsed.app !== BACKUP_APP) {
    return { ok: false, reason: '这不是「过面」导出的备份文件' };
  }
  // 反向误投特判（与 validateCustomSet 的正向指路对称）：题集分享信封 app/schema 都合法，
  // 只报「缺少数据体」会让用户以为文件坏了——认出 kind 就指路回题集入口。
  if (parsed.kind === CUSTOM_SET_KIND) {
    return { ok: false, reason: '这是一份题集分享文件，不是全量数据备份——请到准备页「我的题集」用「导入题集」' };
  }
  if (!Number.isFinite(parsed.schema) || parsed.schema < 1) {
    return { ok: false, reason: '备份缺少有效的版本号（schema）' };
  }
  if (parsed.schema > BACKUP_SCHEMA) {
    return { ok: false, reason: `备份来自更新版本的应用（schema ${parsed.schema}），请先升级应用再导入` };
  }
  const d = parsed.data;
  if (!d || typeof d !== 'object' || Array.isArray(d)) {
    return { ok: false, reason: '备份缺少数据体（data）' };
  }
  for (const face of ['profiles', 'sessions', 'ledger']) {
    if (!Array.isArray(d[face])) return { ok: false, reason: `备份数据不完整：${face} 应为数组` };
  }
  if (!d.entitlements || typeof d.entitlements !== 'object' || Array.isArray(d.entitlements)) {
    return { ok: false, reason: '备份数据不完整：entitlements 应为对象' };
  }
  // custom（V2.3）向后兼容：旧备份没有该键——缺省当空数组放行；键存在则必须是数组
  if (d.custom !== undefined && !Array.isArray(d.custom)) {
    return { ok: false, reason: '备份数据不完整：custom 应为数组' };
  }
  const customCount = Array.isArray(d.custom) ? d.custom.length : 0;
  const ent = d.entitlements;
  const hasEntitlements = Boolean(
    ent && typeof ent === 'object'
    && ((Number.isFinite(ent.credits) && ent.credits > 0)
      || (typeof ent.memberUntil === 'string' && ent.memberUntil.trim())),
  );
  const totalItems = d.profiles.length + d.sessions.length + d.ledger.length + customCount;
  if (totalItems === 0 && !hasEntitlements) {
    return { ok: false, reason: '备份文件里没有可导入的数据——这是一份空备份，请先在本机打过一场或存过档案再导出' };
  }
  return {
    ok: true,
    data: d,
    counts: {
      profiles: d.profiles.length,
      sessions: d.sessions.length,
      ledger: d.ledger.length,
      custom: customCount,
    },
  };
}

// 会员到期取较晚的一侧；两侧都不是可解析日期时回 null
function laterMemberUntil(a, b) {
  const ta = typeof a === 'string' ? Date.parse(a) : NaN;
  const tb = typeof b === 'string' ? Date.parse(b) : NaN;
  if (!Number.isFinite(ta)) return Number.isFinite(tb) ? b : null;
  if (!Number.isFinite(tb)) return a;
  return tb > ta ? b : a;
}

// importBackup(store, data, { mode:'merge'|'replace', wipe? }) -> { imported: counts }
// merge：按 id 去重并入（profiles 加内容判重，见头注①）；ledger 按整条内容判重
//   （条目无 id，重复并入会画歪趋势线）；custom 按 text 判重（V2.3，见面内注释）。
// replace：先清各面再全量写入（wipe 回调按 guomian: 前缀清键，custom 面一并覆盖）。
//   store 公开面没有删除 API（刻意的——业务代码不该能删档），
//   「清面」由调用方注入 wipe 回调完成（app.js 删 localStorage 四面键 / 测试清内存 backend），
//   ui-core 保持零 IO。
// 权益 merge 的对抗性思考：credits 取两者较大值、memberUntil 取较晚——不取相加，
// 反复导入同一备份幂等、不会滚雪球刷券。但说清定位：本地产品的权益本就存在用户
// 自己的 localStorage 里（直接改数据也能改权益），max 语义是两份数据的一致性合并
// 选择，不是安全边界；真安全边界要等 V2 权益上服务端。
// MAX_SESSIONS 修剪语义经 saveSession 自然生效（超 30 场挤掉最旧）。
export function importBackup(store, data, { mode = 'merge', wipe } = {}) {
  const merge = mode !== 'replace';
  if (!merge && typeof wipe === 'function') wipe();
  const imported = { profiles: 0, sessions: 0, ledger: 0, custom: 0, entitlements: false };

  const existingProfiles = merge ? store.listProfiles() : [];
  const profileSeen = (p) => existingProfiles.some((e) => e
    && (e.id === p.id || (e.jdText === p.jdText && e.resumeText === p.resumeText)));
  for (const p of data?.profiles ?? []) {
    if (!p || typeof p !== 'object') continue;
    if (merge && profileSeen(p)) continue;
    if (store.saveProfile({ name: p.name, jdText: p.jdText, resumeText: p.resumeText, jd: p.jd, resume: p.resume })) {
      imported.profiles += 1;
    }
  }

  const existingSessionIds = merge ? new Set(store.listSessions().map((s) => s?.id)) : new Set();
  for (const s of data?.sessions ?? []) {
    if (!s || typeof s !== 'object') continue;
    if (merge && s.id != null && existingSessionIds.has(s.id)) continue;
    if (store.saveSession(s)) imported.sessions += 1;
  }

  const existingLedger = merge ? new Set(store.getLedger().map((e) => JSON.stringify(e))) : new Set();
  for (const entry of data?.ledger ?? []) {
    if (merge && existingLedger.has(JSON.stringify(entry))) continue;
    if (store.appendLedger(entry)) imported.ledger += 1;
  }

  // custom（V2.3）：merge 按 text 判重（addCustomQuestion 重新发号，id 判重必失效；
  // 同题文重录没有价值）；MAX_CUSTOM 满则 addCustomQuestion 拒收返回 false 不计数——
  // 上限语义在 storage 一处真源，这里不复制第二份判断。旧备份无 custom 键时循环体零次。
  const existingCustomTexts = merge
    ? new Set(store.listCustomQuestions().map((q) => q?.text))
    : new Set();
  for (const q of data?.custom ?? []) {
    if (!q || typeof q !== 'object') continue;
    if (merge && existingCustomTexts.has(q.text)) continue;
    if (store.addCustomQuestion({ text: q.text, type: q.type })) imported.custom += 1;
  }

  const incoming = data?.entitlements ?? {};
  if (merge) {
    const cur = store.getEntitlements();
    imported.entitlements = store.setEntitlements({
      ...cur,
      ...incoming,
      credits: Math.max(
        Number.isFinite(cur.credits) ? cur.credits : 0,
        Number.isFinite(incoming.credits) ? incoming.credits : 0,
      ),
      memberUntil: laterMemberUntil(cur.memberUntil, incoming.memberUntil),
    }) === true;
  } else {
    imported.entitlements = store.setEntitlements(incoming) === true;
  }

  return { imported };
}

// ---- V2.4 #7 题集分享：exportCustomSet / validateCustomSet / importCustomSet ----
// 与全量备份（exportBackup 五面信封）是两种文件、两个入口：分享信封带 kind:'custom-set'，
// questions 只含 {text, type} 两字段——把题集发给别人时，id/createdAt 等本机痕迹与
// 简历/战绩/权益一律不出门（零隐私字段）。导入只有 merge 语义（分享不该清人家的库），
// 按 text 判重；题文有效性沿 §16 makeCustomQuestion 口径（trim 后 <5 字拒收）；
// MAX_CUSTOM 满则拒收的判断在 storage 一处真源，这里只把 false 计成 rejected。

const CUSTOM_SET_KIND = 'custom-set';
const CUSTOM_SET_SCHEMA = 1;

// exportCustomSet(store) -> { payload, filename } | null（空题集不产空文件，调用方提示）
// filename 形如「过面题集-20260814.json」（本地日期，与备份文件名同源 localDateStr）。
export function exportCustomSet(store) {
  const questions = store.listCustomQuestions()
    .filter((q) => q && typeof q.text === 'string')
    .map((q) => ({ text: q.text, type: q.type }));
  if (questions.length === 0) return null;
  const now = Date.now();
  const envelope = {
    app: BACKUP_APP,
    kind: CUSTOM_SET_KIND,
    schema: CUSTOM_SET_SCHEMA,
    exportedAt: now,
    questions,
  };
  return {
    payload: JSON.stringify(envelope, null, 2),
    filename: `过面题集-${localDateStr(now).replaceAll('-', '')}.json`,
  };
}

// validateCustomSet(text) -> { ok:true, questions, count } | { ok:false, reason }
// 一切失败路径给中文 reason 不抛。特判「拿全量备份当题集」：信封 app 对但 kind 不对
// 且带 data 面——用户十有八九选错了文件，理由要指路到「导入备份」入口而不是干拒。
export function validateCustomSet(text) {
  let parsed;
  try {
    parsed = JSON.parse(String(text));
  } catch {
    return { ok: false, reason: '文件内容不是有效的 JSON，可能已损坏或选错了文件' };
  }
  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
    return { ok: false, reason: '题集文件格式不对：顶层应为信封对象' };
  }
  if (parsed.app !== BACKUP_APP) {
    return { ok: false, reason: '这不是「过面」导出的题集文件' };
  }
  if (parsed.kind !== CUSTOM_SET_KIND) {
    if (parsed.data && typeof parsed.data === 'object') {
      return { ok: false, reason: '这是一份全量数据备份，不是题集分享文件——请到「数据备份」区用「导入备份」' };
    }
    return { ok: false, reason: '这不是题集分享文件（缺 kind 标识）' };
  }
  if (!Number.isFinite(parsed.schema) || parsed.schema < 1) {
    return { ok: false, reason: '题集文件缺少有效的版本号（schema）' };
  }
  if (parsed.schema > CUSTOM_SET_SCHEMA) {
    return { ok: false, reason: `题集来自更新版本的应用（schema ${parsed.schema}），请先升级应用再导入` };
  }
  if (!Array.isArray(parsed.questions)) {
    return { ok: false, reason: '题集文件不完整：questions 应为数组' };
  }
  if (parsed.questions.length === 0) {
    return { ok: false, reason: '题集文件里没有题目——请确认选对了文件，或让对方先录题再导出分享' };
  }
  return { ok: true, questions: parsed.questions, count: parsed.questions.length };
}

// importCustomSet(store, questions) -> { imported, skipped, rejected }
// 只有 merge：坏条目（非对象/题文 trim 后 <5 字或 > MAX_QUESTION_TEXT）与 trim 后同
// text 均计 skipped；MAX_CUSTOM 满时 addCustomQuestion 拒收返回 false 计 rejected。
// V2.4 复核修复：条目一律过 §16 makeCustomQuestion 单真源——题文 trim 后落库（与本地
// 添加路径同一不变量，带空白的同题不得绕过判重）、超长题拒收（不给 storage.write 的
// 配额重试任何「为存垃圾牺牲最旧 session」的机会）、枚举外 type 回落『行为』。
export function importCustomSet(store, questions) {
  const counts = { imported: 0, skipped: 0, rejected: 0 };
  if (!Array.isArray(questions)) return counts;
  const norm = (t) => (typeof t === 'string' ? t.trim() : '');
  const existingTexts = new Set(store.listCustomQuestions().map((q) => norm(q?.text)));
  for (const q of questions) {
    const mq = q && typeof q === 'object' ? makeCustomQuestion({ text: q.text, type: q.type }) : null;
    if (!mq || existingTexts.has(mq.text)) {
      counts.skipped += 1;
      continue;
    }
    if (store.addCustomQuestion({ text: mq.text, type: mq.type })) {
      counts.imported += 1;
      existingTexts.add(mq.text);
    } else {
      counts.rejected += 1;
    }
  }
  return counts;
}

// ---- V2.4 #6 多简历档案切换：buildProfileOptions / buildProfileFillPayload / buildProfileDraft ----
// 准备页「存当前 JD+简历为档案 / 下拉切换回填」的纯逻辑面（契约 §13）：
// storage §9 的 profiles 面早已在场（saveProfile/listProfiles/getProfile/deleteProfile），
// 这里只做渲染数据、回填载荷与保存口径三件事，DOM 与事件留在 app.js。

// buildProfileOptions(profiles) -> [{ id, label }]
// 下拉选项数据：按 createdAt（ISO 字符串，saveProfile 落库口径）新在前，坏值沉底保持原序；
// label = 展示名 + ' · YYYY-MM-DD'（createdAt 可解析时；日期与台账同源 localDateStr）；
// 展示名取 name → jd.title → '未命名档案'（trim 后非空才算数）。
// 非数组回 []；缺 id/null 条目跳过（渲染不出可点的选项就别进列表）。
export function buildProfileOptions(profiles) {
  const displayName = (p) => {
    if (typeof p.name === 'string' && p.name.trim()) return p.name.trim();
    if (typeof p.jd?.title === 'string' && p.jd.title.trim()) return p.jd.title.trim();
    return '未命名档案';
  };
  return (Array.isArray(profiles) ? profiles : [])
    .filter((p) => p && typeof p === 'object' && p.id != null)
    .map((p) => {
      const t = typeof p.createdAt === 'string' ? Date.parse(p.createdAt) : NaN;
      return { id: p.id, t: Number.isFinite(t) ? t : -Infinity, name: displayName(p) };
    })
    .sort((a, b) => (a.t === b.t ? 0 : (b.t > a.t ? 1 : -1)))
    .map(({ id, t, name }) => ({
      id,
      label: t === -Infinity ? name : `${name} · ${localDateStr(t)}`,
    }));
}

// buildProfileFillPayload(profile) -> { jdText, resumeText } | null
// 切换回填载荷：jdText 必须是非空白字符串（空档案没有回填意义，回 null 让调用方提示）；
// resumeText 缺失/非字符串回空串——必须把上一份档案在简历框里的残留清掉，不许串档。
export function buildProfileFillPayload(profile) {
  if (!profile || typeof profile !== 'object') return null;
  if (typeof profile.jdText !== 'string' || !profile.jdText.trim()) return null;
  return {
    jdText: profile.jdText,
    resumeText: typeof profile.resumeText === 'string' ? profile.resumeText : '',
  };
}

// buildProfileDraft({ name, jdText, resumeText, jdTitle }, existingProfiles)
//   -> { ok:true, draft:{ name, jdText, resumeText } } | { ok:false, reason }
// 保存口径三件套（reason 一律中文不抛）：
//   ① 空 JD 拒存（档案的意义就是 JD+简历组合）；
//   ② 内容判重：jdText+resumeText（trim 后）与既有档案全同 → 拒存并点名既有档案——
//     与 importBackup 的 profiles 判重同思路，防同一份内容反复占坑；判重先于上限：
//     满额时重复保存报「已有」比报「已满」更对症；
//   ③ 上限：既有 ≥ MAX_PROFILES 拒存（数字真源在 storage，拒收语义与 saveProfile 对齐，
//     这里提前拦是为了给出人话理由，storage 的 false 仍是最后防线）。
// 命名：name trim → 空退 jdTitle（调用方传 parseJD 结果的 title）→ 仍空退「未命名档案」；
// 同名自动加序号「名 2」「名 3」（找最小可用）——下拉里两份重名档案分不清是谁。
export function buildProfileDraft({ name, jdText, resumeText, jdTitle } = {}, existingProfiles = []) {
  const jd = typeof jdText === 'string' ? jdText.trim() : '';
  if (!jd) return { ok: false, reason: '目标岗位 JD 是空的——先把 JD 贴进来再存档案' };
  const resume = typeof resumeText === 'string' ? resumeText.trim() : '';
  const existing = Array.isArray(existingProfiles)
    ? existingProfiles.filter((p) => p && typeof p === 'object')
    : [];

  const trimmed = (v) => (typeof v === 'string' ? v.trim() : '');
  const same = existing.find((p) => trimmed(p.jdText) === jd && trimmed(p.resumeText) === resume);
  if (same) {
    const sameName = trimmed(same.name) || '未命名档案';
    return { ok: false, reason: `已有同内容档案「${sameName}」，无需重复保存` };
  }
  if (existing.length >= MAX_PROFILES) {
    return { ok: false, reason: `档案已满 ${MAX_PROFILES} 份，删掉不用的再存` };
  }

  const base = trimmed(name) || trimmed(jdTitle) || '未命名档案';
  const taken = new Set(existing.map((p) => trimmed(p.name)).filter(Boolean));
  let finalName = base;
  for (let i = 2; taken.has(finalName); i += 1) finalName = `${base} ${i}`;

  return { ok: true, draft: { name: finalName, jdText: jd, resumeText: resume } };
}

// entitlementText(ent) -> string：权益状态一行文案（台账页与解锁卡共用）；空输入回默认
export function entitlementText(ent) {
  const credits = ent?.credits ?? 0;
  const until = ent?.memberUntil ?? null;
  const member = until ? `会员到期：${String(until).slice(0, 10)}` : '暂非会员';
  return `剩余解锁券：${credits} 张 · ${member}`;
}

// ---- 中断恢复快照信封（V2.5，契约 §13；引擎侧真源：契约 §5 snapshot/restoreSession）----
// 职责切分（不复制第二份把关口径）：ui-core 只管 localStorage 信封层（kind/schema/上下文/
// 时间），对快照本体只做「answers/scores/plan.questions 是数组」的最浅形状检查；
// 深校验（版本、长度对齐、题数上限、时间线）的唯一真源在 session.restoreSession——
// 信封放行但本体坏的快照，会在恢复时被 TypeError 拒收，不会静默造半坏会话。

export const INTERVIEW_SNAPSHOT_KIND = 'guomian.interview.snapshot';
export const INTERVIEW_SNAPSHOT_SCHEMA = 1;
// localStorage 键名单一真源（app 与测试都从这里拿）：guomian: 前缀让备份 replace 的
// wipe 语义（按前缀清键）自然罩住快照，换机恢复不会带出一场别人机器上的半程面试。
export const INTERVIEW_SNAPSHOT_KEY = 'guomian:interview:snapshot';

function isEngineSnapshotShape(s) {
  return Boolean(
    s && typeof s === 'object' && !Array.isArray(s)
    && Array.isArray(s.answers) && Array.isArray(s.scores)
    && s.plan && Array.isArray(s.plan.questions),
  );
}

// buildInterviewSnapshotPayload({ snapshot, context? }) -> string（直接进 localStorage）
// snapshot：引擎 session.snapshot() 产物——形状不对是编程错误，早炸 TypeError，
// 绝不静默写出一条恢复不了的坏 payload。context：恢复 UI 所需上下文（mode/style/jdTitle
// 等），只收平铺对象、原样透传；非对象一律丢弃为 {}。
export function buildInterviewSnapshotPayload({ snapshot, context } = {}) {
  if (!isEngineSnapshotShape(snapshot)) {
    throw new TypeError('buildInterviewSnapshotPayload 需要引擎 session.snapshot() 形状的快照');
  }
  const ctx = context && typeof context === 'object' && !Array.isArray(context) ? context : {};
  return JSON.stringify({
    kind: INTERVIEW_SNAPSHOT_KIND,
    schema: INTERVIEW_SNAPSHOT_SCHEMA,
    savedAt: Number.isFinite(snapshot.savedAt) ? snapshot.savedAt : Date.now(),
    context: ctx,
    snapshot,
  });
}

// parseInterviewSnapshotPayload(raw) -> { snapshot, context, savedAt, answered, total } | null
// localStorage 里躺着的东西一律当不可信输入：坏 JSON / 错 kind（含备份信封误投）/
// 未来 schema / 快照本体形状坏，全部回 null 不抛——调用方据 null 隐藏恢复卡即可。
export function parseInterviewSnapshotPayload(raw) {
  let parsed;
  try {
    parsed = JSON.parse(String(raw));
  } catch {
    return null;
  }
  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) return null;
  if (parsed.kind !== INTERVIEW_SNAPSHOT_KIND) return null;
  if (!Number.isFinite(parsed.schema) || parsed.schema < 1 || parsed.schema > INTERVIEW_SNAPSHOT_SCHEMA) return null;
  if (!isEngineSnapshotShape(parsed.snapshot)) return null;
  const context = parsed.context && typeof parsed.context === 'object' && !Array.isArray(parsed.context)
    ? parsed.context
    : {};
  return {
    snapshot: parsed.snapshot,
    context,
    savedAt: Number.isFinite(parsed.savedAt) ? parsed.savedAt : null,
    answered: parsed.snapshot.answers.length,
    total: parsed.snapshot.plan.questions.length,
  };
}

// ---- 恢复上下文装配/拆包（V2.5 前端接线轮）----
// 三道门分工：parse 管信封、本对（build/unpack）管「接线所需上下文是否齐全」、
// restoreSession 管快照本体深校验——unpack 不复制第四份深校验。
// jd 存解析产物而非原文：恢复后不重解析，词典升级不许半场换评分口径。

function asPlainObject(v) {
  return v && typeof v === 'object' && !Array.isArray(v) ? v : null;
}

// buildInterviewSnapshotContext({ mode, style, jd, resume?, match? }) -> context
// 进快照信封的恢复上下文单一装配点。jd 是恢复后重建 scorer 的唯一依据，
// 缺了写出去也是恢复不了的死快照——编程错误，早炸 TypeError。
// jdTitle 从 jd.title 导出（describeInterviewSnapshot 消费面同源，不手抄第二份）。
export function buildInterviewSnapshotContext({ mode, style, jd, resume, match } = {}) {
  if (!asPlainObject(jd)) {
    throw new TypeError('buildInterviewSnapshotContext 需要 parseJD 解析产物（恢复后重建 scorer 的唯一依据）');
  }
  return {
    mode: mode ?? null,
    style: typeof style === 'string' && style.trim() ? style : null,
    jdTitle: typeof jd.title === 'string' ? jd.title : '',
    jd,
    resume: asPlainObject(resume),
    match: asPlainObject(match),
  };
}

// unpackInterviewSnapshotContext(parsed) -> { snapshot, mode, style, jd, resume, match } | null
// 恢复通路第二道门：parse 放行的信封若罩不住接线所需（context 缺 jd——含逻辑层期
// 只存 {mode,style,jdTitle} 的老信封），一律回 null 走全新开始，绝不造半恢复会话。
export function unpackInterviewSnapshotContext(parsed) {
  if (!asPlainObject(parsed)) return null;
  if (!isEngineSnapshotShape(parsed.snapshot)) return null;
  const ctx = asPlainObject(parsed.context);
  const jd = ctx ? asPlainObject(ctx.jd) : null;
  if (!jd) return null;
  return {
    snapshot: parsed.snapshot,
    mode: ctx.mode ?? null,
    style: typeof ctx.style === 'string' && ctx.style.trim() ? ctx.style : null,
    jd,
    resume: asPlainObject(ctx.resume),
    match: asPlainObject(ctx.match),
  };
}

// ---- 公考场快照上下文（V2.6 卡26 接线）：独立 build/unpack 一对 ----
// 公考场没有 JD（题库场，出题与评分都不吃岗位语义），装不进 buildInterviewSnapshotContext
// （它对缺 jd 早炸 TypeError——那是常规场的正确纪律，不为公考松动）。这里独立一对：
// context 带题库标记 bank，恢复通路据此分流；既有 unpackInterviewSnapshotContext 对
// 公考信封回 null（「缺 jd 老信封回 null」先例照走），旧恢复通路对公考场零感知、绝不半恢复。

export const GONGKAO_BANK_TAG = 'gongkao';

// buildGongkaoSnapshotContext({ style? }) -> { mode:'gongkao', style, bank }
export function buildGongkaoSnapshotContext({ style } = {}) {
  return {
    mode: 'gongkao',
    style: typeof style === 'string' && style.trim() ? style : null,
    bank: GONGKAO_BANK_TAG,
  };
}

// unpackGongkaoSnapshotContext(parsed) -> { snapshot, mode:'gongkao', style, bank } | null
// 只认带公考题库标记的信封；常规信封（带 jd 无 bank）与一切坏输入回 null 不抛——
// 与 unpackInterviewSnapshotContext 互为补集，两条恢复通路互不误吞。
export function unpackGongkaoSnapshotContext(parsed) {
  if (!asPlainObject(parsed)) return null;
  if (!isEngineSnapshotShape(parsed.snapshot)) return null;
  const ctx = asPlainObject(parsed.context);
  if (!ctx || ctx.bank !== GONGKAO_BANK_TAG) return null;
  return {
    snapshot: parsed.snapshot,
    mode: 'gongkao',
    style: typeof ctx.style === 'string' && ctx.style.trim() ? ctx.style : null,
    bank: GONGKAO_BANK_TAG,
  };
}

// describeInterviewSnapshot(parsed) -> string | null：恢复卡一句话文案。
// 形如「后端工程师」的岗位段与模式段缺省自然省略，进度段与时间段恒在；
// 时间坏值走 fmtTime 的「未知时间」兜底；坏输入回 null 供调用方隐藏恢复卡。
export function describeInterviewSnapshot(parsed) {
  if (!parsed || typeof parsed !== 'object') return null;
  const { answered, total, context, savedAt } = parsed;
  if (!Number.isFinite(answered) || !Number.isFinite(total)) return null;
  const parts = [];
  const jdTitle = typeof context?.jdTitle === 'string' ? context.jdTitle.trim() : '';
  if (jdTitle) parts.push(`「${jdTitle}」`);
  if (context?.mode != null) parts.push(modeLabel(context.mode));
  parts.push(`已答 ${answered}/${total} 题`);
  parts.push(Number.isFinite(savedAt) ? fmtTime(savedAt) : '未知时间');
  return parts.join(' · ');
}
