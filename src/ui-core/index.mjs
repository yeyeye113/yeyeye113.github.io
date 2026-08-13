// src/ui-core/index.mjs — 前端接缝层纯逻辑（接口真源：docs/架构契约.md §13）
// V1.3 从 app/app.js 外移：全部为不碰 DOM、不碰全局状态的纯函数/纯数据变换，
// 零 IO、零外部依赖，浏览器与 Node 双端可用；DOM 操作与事件绑定仍留在 app.js。
// 机检跑道：test/ui-core.test.mjs。
// 唯一仓内 import：评分引擎的 DIMS/DIM_LABELS（同为纯常量，契约 §4）——
// 雷达轴顺序与中文标签只认评分引擎一处真源，不在这里手抄第二份。
import { DIMS, DIM_LABELS } from '../engine/scoring/index.mjs';

// ---- 纯数据：模式与题数选项（准备页 pill 组与标签映射的单一真源） ----

export const MODE_OPTIONS = [
  { value: 'comprehensive', label: '综合' },
  { value: 'technical', label: '技术' },
  { value: 'behavioral', label: '行为' },
  { value: 'hr', label: 'HR' },
];

export const ROUNDS_OPTIONS = [5, 8, 12];

// modeLabel(mode) -> string：契约 mode 值转中文标签；未知值原样字符串化（不抛）
export function modeLabel(mode) {
  const found = MODE_OPTIONS.find((m) => m.value === mode);
  return found ? found.label : String(mode ?? '未知');
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
  const center = size / 2;
  const radius = size / 2 - 24;
  if (radar == null || typeof radar !== 'object') {
    return { size, center, radius, axes: [], polygon: '', gridPolygons: [] };
  }
  const r1 = (n) => Number(n.toFixed(1));
  // 第 i 根轴的方向单位向量（-90° 起、顺时针 72° 步进）
  const dir = (i) => {
    const angle = ((-90 + i * 72) * Math.PI) / 180;
    return [Math.cos(angle), Math.sin(angle)];
  };
  const axes = DIMS.map((key, i) => {
    const [dx, dy] = dir(i);
    const raw = radar[key];
    const value = Number.isFinite(raw) ? Math.max(0, Math.min(100, raw)) : 0;
    const vr = (value / 100) * radius;
    return {
      key,
      label: DIM_LABELS[key],
      x: r1(center + dx * radius),
      y: r1(center + dy * radius),
      valueX: r1(center + dx * vr),
      valueY: r1(center + dy * vr),
    };
  });
  const ring = (frac) => DIMS
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

// entitlementText(ent) -> string：权益状态一行文案（台账页与解锁卡共用）；空输入回默认
export function entitlementText(ent) {
  const credits = ent?.credits ?? 0;
  const until = ent?.memberUntil ?? null;
  const member = until ? `会员到期：${String(until).slice(0, 10)}` : '暂非会员';
  return `剩余解锁券：${credits} 张 · ${member}`;
}
