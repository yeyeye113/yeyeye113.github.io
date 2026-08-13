// src/ui-core/index.mjs — 前端接缝层纯逻辑（接口真源：docs/架构契约.md §13）
// V1.3 从 app/app.js 外移：全部为不碰 DOM、不碰全局状态的纯函数/纯数据变换，
// 零 IO、零外部依赖，浏览器与 Node 双端可用；DOM 操作与事件绑定仍留在 app.js。
// 机检跑道：test/ui-core.test.mjs。
// 仓内 import 仅限纯常量（零 IO 纪律不破）：评分引擎的 DIMS/DIM_LABELS（契约 §4，
// 雷达轴顺序与中文标签单一真源）；报告层的 DISCLOSURE（契约 §12 分享卡条款——
// 披露句必须绘在卡面上且与 shareText 同源，不在这里手抄第二份）。
import { DIMS, DIM_LABELS } from '../engine/scoring/index.mjs';
import { DISCLOSURE } from '../report/index.mjs';

// ---- 纯数据：模式与题数选项（准备页 pill 组与标签映射的单一真源） ----

export const MODE_OPTIONS = [
  { value: 'comprehensive', label: '综合' },
  { value: 'technical', label: '技术' },
  { value: 'behavioral', label: '行为' },
  { value: 'hr', label: 'HR' },
];

export const ROUNDS_OPTIONS = [5, 8, 12];

// 不进准备页 pill 组、但会出现在台账行/报告标题的扩展模式标签（V2.1）：
// drill 由「弱项重练」入口触发生成（契约 §15 buildDrillPlan），不是用户可选模式，
// 混进 MODE_OPTIONS 会让准备页多出一个没有出题语义的 pill。
const EXTRA_MODE_LABELS = { drill: '弱项重练' };

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
  return {
    ok: true,
    data: d,
    counts: {
      profiles: d.profiles.length,
      sessions: d.sessions.length,
      ledger: d.ledger.length,
      custom: Array.isArray(d.custom) ? d.custom.length : 0,
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
    if (store.saveProfile({ jdText: p.jdText, resumeText: p.resumeText, jd: p.jd, resume: p.resume })) {
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

// entitlementText(ent) -> string：权益状态一行文案（台账页与解锁卡共用）；空输入回默认
export function entitlementText(ent) {
  const credits = ent?.credits ?? 0;
  const until = ent?.memberUntil ?? null;
  const member = until ? `会员到期：${String(until).slice(0, 10)}` : '暂非会员';
  return `剩余解锁券：${credits} 张 · ${member}`;
}
