// app/app.js — 移动端优先单页应用（接口真源：docs/架构契约.md §12）
// 原生 ESM，直接 import /src/... 真模块；四视图单页切换（准备/面试/报告/台账）。
// 隐私承诺：JD/简历/作答只经 createStore(localStorage) 存本机；apiKey 只存内存变量。

import { parseJD, isJdScorable } from '/src/engine/jd/index.mjs';
import { parseResume, matchResume } from '/src/engine/resume/index.mjs';
import { planInterview } from '/src/engine/question/index.mjs';
import { scoreAnswer, scoreSession } from '/src/engine/scoring/index.mjs';
import { createSession, restoreSession } from '/src/session/index.mjs';
import { createLLM } from '/src/llm/index.mjs';
import { getPersona, listStyles } from '/src/prompts/index.mjs';
import { buildReport, DISCLOSURE } from '/src/report/index.mjs';
import { toMarkdown, toShareText, suggestFilename } from '/src/export/index.mjs';
// 契约 §9/§10 消费面：storage 与 monetize 由并行子代理施工，路径按契约写死
import { createStore, MAX_SESSIONS, MAX_CUSTOM, MAX_PROFILES } from '/src/storage/index.mjs';
import { SKUS, getEntitlements, canUnlock, unlockReport, grantSku, redeemEntitlementCode, betaUnlock } from '/src/monetize/index.mjs';
// 公测开关（契约 §10 V1.7）：单布尔单真源，正式售卖时只改 src/config 这一处
import { BETA_FREE, ENTITLEMENT_API_BASE, ENTITLEMENT_PUBLIC_KEY_JWK } from '/src/config/index.mjs';
// 面试锦囊（契约 §14 V1.8）：纯数据方法库由并行子代理施工，按契约形状消费
import { TIPS, listCategories, searchTips, getTipsByCategory, recommendTips } from '/src/coach/index.mjs';
// 示例数据（V1.4 一键填示例）：机检在 test/samples.test.mjs
import { SAMPLES } from '/src/samples/index.mjs';
// 错题本与弱项重练（契约 §15 V2.1）：低分题聚合＋一键组重练场
import { collectMistakes, buildDrillPlan } from '/src/drill/index.mjs';
// 自定义题集（契约 §16 V2.3）：手录题转 Question 形状＋混排进既有 plan
import { makeCustomQuestion, mixIntoPlan, MAX_QUESTION_TEXT } from '/src/custom/index.mjs';
// 公考结构化题库（V2.6 卡26 接线）：适配层＋生成物数据模块（真源在公考陪练资产仓）
import { normalizeGongkaoBank, planGongkaoInterview, aggregateGongkaoDims, GONGKAO_DEFAULT_ROUNDS, GONGKAO_DIMS } from '/src/gongkao/index.mjs';
import { GONGKAO_BANK } from '/src/gongkao/bank.mjs';
// 接缝层纯逻辑（契约 §13，V1.3 外移）：机检在 test/ui-core.test.mjs
import {
  MODE_OPTIONS,
  ROUNDS_OPTIONS,
  GONGKAO_ROUND_OPTIONS,
  parseGongkaoRounds,
  describeGongkaoStartLabel,
  fmtTime,
  modeLabel,
  sortSessionsByTimeDesc,
  buildReportMeta,
  isReportUnlocked,
  buildLedgerEntry,
  abandonBadgeText,
  buildTrendPoints,
  buildRadarPoints,
  buildGongkaoRadarPoints,
  sanitizeLlmConfig,
  entitlementText,
  exportBackup,
  validateBackup,
  importBackup,
  exportCustomSet,
  validateCustomSet,
  importCustomSet,
  buildDrillSummary,
  buildShareCardModel,
  buildProfileOptions,
  buildProfileFillPayload,
  buildProfileDraft,
  INTERVIEW_SNAPSHOT_KEY,
  buildInterviewSnapshotPayload,
  parseInterviewSnapshotPayload,
  describeInterviewSnapshot,
  buildInterviewSnapshotContext,
  unpackInterviewSnapshotContext,
  buildGongkaoSnapshotContext,
  unpackGongkaoSnapshotContext,
} from '/src/ui-core/index.mjs';

// 趋势折线 SVG 拼接（坐标数学在 ui-core.buildTrendPoints，这里只出字符串）。
// 色值走 CSS 变量（style 属性内 var()，SVG 表现属性不支持 var），与主题单一真源。
function trendSvgMarkup(ledger, width = 320, height = 100) {
  const { pad, points } = buildTrendPoints(ledger, { width, height });
  if (points.length === 0) return '';
  const pts = points.map((p) => `${p.x},${p.y}`).join(' ');
  const dots = points
    .map((p) => `<circle cx="${p.x}" cy="${p.y}" r="3" style="fill:var(--gold)"/>`)
    .join('');
  const line = points.length > 1
    ? `<polyline points="${pts}" style="fill:none;stroke:var(--gold);stroke-width:2;stroke-linejoin:round"/>`
    : '';
  const axis = `style="stroke:var(--line);stroke-width:1"`;
  return `<svg viewBox="0 0 ${width} ${height}" role="img" aria-label="分数趋势折线图" preserveAspectRatio="xMidYMid meet">`
    + `<line x1="${pad}" y1="${pad}" x2="${pad}" y2="${height - pad}" ${axis}/>`
    + `<line x1="${pad}" y1="${height - pad}" x2="${width - pad}" y2="${height - pad}" ${axis}/>`
    + line + dots + '</svg>';
}

// 五维雷达 SVG 拼接（坐标数学在 ui-core.buildRadarPoints，这里只出字符串）。
// 插进 innerHTML 的 label 全部来自评分引擎常量 DIM_LABELS（非用户输入），无注入面。
// viewBox 左右各外扩 50、上下各外扩 10：给轴端 label 文字留位，几何仍是正方形坐标系。
function radarSvgMarkup(radar, size = 220) {
  return radarSvgFromPoints(buildRadarPoints(radar, { size }), {
    size,
    ariaLabel: '最近一场五维评分雷达图',
  });
}

function gongkaoRadarSvgMarkup(gongkaoDims, size = 220) {
  return radarSvgFromPoints(buildGongkaoRadarPoints(gongkaoDims, { size }), {
    size,
    ariaLabel: '本场公考结构化五维雷达',
  });
}

function radarSvgFromPoints({ center, axes, polygon, gridPolygons }, { size = 220, ariaLabel = '雷达图' } = {}) {
  if (!Array.isArray(axes) || axes.length === 0) return '';
  const thin = 'style="fill:none;stroke:var(--line);stroke-width:1"';
  const grid = (gridPolygons ?? []).map((pts) => `<polygon points="${pts}" ${thin}/>`).join('');
  const spokes = axes
    .map((a) => `<line x1="${center}" y1="${center}" x2="${a.x}" y2="${a.y}" style="stroke:var(--line);stroke-width:1"/>`)
    .join('');
  const data = `<polygon points="${polygon}" style="fill:rgba(201,162,39,0.22);stroke:var(--gold);stroke-width:2;stroke-linejoin:round"/>`;
  const dots = axes
    .map((a) => `<circle cx="${a.valueX}" cy="${a.valueY}" r="2.5" style="fill:var(--gold)"/>`)
    .join('');
  const labels = axes
    .map((a) => {
      const dx = a.x - center;
      const dy = a.y - center;
      const len = Math.hypot(dx, dy) || 1;
      const lx = (a.x + (dx / len) * 12).toFixed(1);
      const ly = (a.y + (dy / len) * 12 + 4).toFixed(1);
      const anchor = Math.abs(dx) < 8 ? 'middle' : (dx > 0 ? 'start' : 'end');
      return `<text x="${lx}" y="${ly}" text-anchor="${anchor}" style="fill:var(--text-dim);font-size:11px">${a.label}</text>`;
    })
    .join('');
  return `<svg viewBox="-50 -10 ${size + 100} ${size + 20}" role="img" aria-label="${ariaLabel}" preserveAspectRatio="xMidYMid meet">`
    + grid + spokes + data + dots + labels + '</svg>';
}

// ---------------- 全局状态 ----------------

const store = createStore(localStorage);

const state = {
  session: null,          // 会话状态机（契约 §5）
  plan: null,
  jd: null,
  resume: null,
  match: null,
  persona: null,
  qIndex: 0,              // 当前第几题（1-based）
  finishing: false,
  currentReport: null,    // 报告页正在展示的 Report
  currentMode: null,      // 本场原始 mode 值（'drill' 时报告标题加重练徽标，V2.1）
  currentMeta: null,      // 导出用元信息 { date, mode, totalScore }（src/export 消费）
  currentClosing: null,   // 面试官收尾台词（报告页顶部寄语行，V1.6 P3-3）
  currentWeakDims: null,  // 本场评分弱维度 key 数组（锦囊推荐联动，V1.8）
  currentGongkaoDims: null, // 公考场独立五维聚合（V2.6 报告面专属雷达；常规场为 null）
  currentSessionId: null, // 对应 storage 里的会话 id（解锁用）
  unlockedIds: new Set(), // 本次会话内已解锁的报告 id（storage 侧标记的兜底）
  snapshotContext: null,  // 中断恢复快照的信封上下文（契约 §13 V2.5）；null＝本场不落快照（drill）
};

// ---------------- DOM 工具 ----------------

const $ = (sel) => document.querySelector(sel);

let toastTimer = null;
function toast(msg) {
  const el = $('#toast');
  el.textContent = msg;
  el.hidden = false;
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => { el.hidden = true; }, 2600);
}

function showView(name) {
  // P2-2（V2.2）：识别中切视图不许留悬挂的活麦克风——停止但保留已识别文本进输入框
  // （用户可能只是误触 tab，回来答案还在）；stopRequested 窗口内不重复提示
  if (voice.rec && !voice.stopRequested) {
    stopVoiceInput();
    toast('语音输入已停止');
  }
  for (const view of document.querySelectorAll('.view')) {
    view.hidden = view.id !== `view-${name}`;
  }
  for (const tab of document.querySelectorAll('.tabbar .tab')) {
    const selected = tab.dataset.view === name;
    tab.classList.toggle('active', selected);
    tab.setAttribute('aria-selected', selected ? 'true' : 'false');
  }
  if (name === 'prepare') {
    renderDrillCard(); // 重练卡随历史数据变化（打完一场回来要刷新）
    renderCustomSection(); // 题集随增删/备份导入变化（V2.3）
    renderProfileSection(); // 档案下拉随存删/备份导入变化（V2.4 #6）
  }
  if (name === 'ledger') renderLedger();
  if (name === 'report') renderReportView();
  if (name === 'coach') renderCoach();
  if (name === 'interview') {
    $('#interview-empty').hidden = Boolean(state.session);
    $('#interview-main').hidden = !state.session;
    renderRestoreCard(); // 空态时检测有效快照出「继续上次面试」卡（V2.5 接线）
  }
}

function pillGroup(container, name, items, defaultValue) {
  container.innerHTML = '';
  for (const item of items) {
    const label = document.createElement('label');
    label.className = 'pill';
    const input = document.createElement('input');
    input.type = 'radio';
    input.name = name;
    input.value = String(item.value);
    input.checked = String(item.value) === String(defaultValue);
    const span = document.createElement('span');
    span.textContent = item.label;
    label.append(input, span);
    container.append(label);
  }
}

function selectedValue(name) {
  const el = document.querySelector(`input[name="${name}"]:checked`);
  return el ? el.value : null;
}

function addBubble(who, text, { followup = false } = {}) {
  const log = $('#chat-log');
  const bubble = document.createElement('div');
  bubble.className = `bubble ${who}${followup ? ' followup' : ''}`;
  const tag = document.createElement('span');
  tag.className = 'bubble-tag';
  tag.textContent = who === 'me' ? '我' : (followup ? '面试官 · 追问' : '面试官');
  const body = document.createElement('p');
  body.textContent = text;
  bubble.append(tag, body);
  log.append(bubble);
  log.scrollTop = log.scrollHeight;
  return bubble; // 供失败回滚移除（P3-1）
}

// 「面试官正在输入…」打字指示气泡：等待评分/LLM 期间显示，出结果即移除
function showTyping() {
  hideTyping();
  const log = $('#chat-log');
  const bubble = document.createElement('div');
  bubble.className = 'bubble interviewer typing';
  bubble.id = 'typing-bubble';
  const tag = document.createElement('span');
  tag.className = 'bubble-tag';
  tag.textContent = '面试官';
  const dots = document.createElement('p');
  dots.className = 'typing-dots';
  dots.setAttribute('aria-label', '面试官正在输入');
  dots.innerHTML = '<span></span><span></span><span></span>';
  bubble.append(tag, dots);
  log.append(bubble);
  log.scrollTop = log.scrollHeight;
}

function hideTyping() {
  document.getElementById('typing-bubble')?.remove();
}

function updateProgress(currentQuestion) {
  const plan = state.plan;
  const total = plan ? plan.questions.length : 0;
  $('#progress-text').textContent = `第 ${state.qIndex}/共 ${total} 题`;
  $('#progress-fill').style.width = total > 0 ? `${(state.qIndex / total) * 100}%` : '0%';

  const dimRow = $('#progress-dim-row');
  const dimChip = $('#progress-dim-chip');
  const dimCovered = $('#progress-dim-covered');
  const dimNote = $('#progress-dim-note');

  if (plan && plan.mode === 'gongkao') {
    dimRow.hidden = false;
    const dim = typeof currentQuestion?.dim === 'string' ? currentQuestion.dim : '';
    dimChip.textContent = dim ? `本题·${dim}` : '本题';

    const covered = [];
    const seen = new Set();
    for (const q of plan.questions.slice(0, state.qIndex)) {
      if (typeof q.dim === 'string' && q.dim && !seen.has(q.dim)) {
        seen.add(q.dim);
        covered.push(q.dim);
      }
    }
    dimCovered.textContent = covered.length
      ? `已覆盖 ${covered.length}/${GONGKAO_DIMS.length} 维：${covered.join('、')}`
      : '';

    if (total > GONGKAO_DIMS.length) {
      dimNote.textContent = `本场 ${total} 题≠五维各测一遍（部分维度会重复考查）`;
      dimNote.hidden = false;
    } else {
      dimNote.textContent = '';
      dimNote.hidden = true;
    }
    return;
  }

  dimRow.hidden = true;
  dimNote.hidden = true;
}

// ---------------- ① 准备页：一键填示例 ----------------

// 双文本域内容恰好等于某组示例时视为「示例填充态」，切换示例不弹覆盖确认；
// 只要有任何用户手贴内容，覆盖前必须 confirm——不许静默清掉别人的简历。
function isSampleFill(jdVal, resumeVal) {
  return SAMPLES.some((s) => s.jdText === jdVal && s.resumeText === resumeVal);
}

function applySample(sample) {
  const jdEl = $('#jd-input');
  const resumeEl = $('#resume-input');
  const hasContent = Boolean(jdEl.value.trim() || resumeEl.value.trim());
  if (hasContent && !isSampleFill(jdEl.value, resumeEl.value)
    && !confirm('输入框里已有内容，确定用示例覆盖吗？覆盖后原内容不可恢复。')) {
    return;
  }
  jdEl.value = sample.jdText;
  resumeEl.value = sample.resumeText;
  toast('已填入示例，可直接开始或改成你自己的');
}

function renderSamplePills() {
  const wrap = $('#sample-options');
  wrap.innerHTML = '';
  for (const sample of SAMPLES) {
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'pill sample-pill';
    const badge = document.createElement('span');
    badge.className = 'sample-badge';
    badge.textContent = '示例';
    const label = document.createElement('span');
    label.textContent = sample.label;
    btn.append(badge, label);
    btn.addEventListener('click', () => applySample(sample));
    wrap.append(btn);
  }
}

// ---------------- ① 准备页：弱项重练（契约 §15，V2.1） ----------------

// pick 数与出题数同源：buildDrillSummary({max}) 与 buildDrillPlan({rounds}) 都传它
const DRILL_ROUNDS = 5;

function renderDrillCard() {
  const card = $('#drill-card');
  const summary = buildDrillSummary(collectMistakes(store.listSessions()), { max: DRILL_ROUNDS });
  if (!summary) {
    card.hidden = true; // 没有低分题（或从没打过）：入口零痕迹
    return;
  }
  $('#drill-lead').textContent = summary.lead;
  $('#drill-preview').textContent = summary.preview;
  $('#btn-drill-start').textContent = `开练（本次 ${summary.pick} 题）`;
  card.hidden = false;
}

function showDrillError(msg) {
  const el = $('#drill-error');
  el.textContent = msg;
  el.hidden = false;
  toast(msg);
}

function clearDrillError() {
  const el = $('#drill-error');
  el.textContent = '';
  el.hidden = true;
}

function startDrill() {
  try {
    doStartDrill();
  } catch (err) {
    showDrillError(`重练开场失败：${err?.message ?? '未知错误'}，请重试`);
  }
}

function doStartDrill() {
  const sessions = store.listSessions();
  const plan = buildDrillPlan(collectMistakes(sessions), { rounds: DRILL_ROUNDS, seed: Date.now() });
  if (!plan) {
    // 入口显示后错题被清（如覆盖导入）也可能走到这。先上屏再藏卡会把
    // #drill-error 一起藏掉，用户只剩 2.6s toast——所以这里不立刻 renderDrillCard。
    showDrillError('错题本是空的——先打一场常规面试，低分题会自动聚到这里');
    return;
  }
  launchDrillSession(plan, sessions);
}

// V2.3 错题单题直达：台账错题行「重练这题」→ rounds:1 单题场；
// jd 来源与整批重练同一套取舍（launchDrillSession 内注释）
function startSingleDrill(mistake) {
  try {
    const plan = buildDrillPlan([mistake], { rounds: 1, seed: Date.now() });
    if (!plan) {
      showDrillError('这道题暂时无法重练，请刷新台账后再试');
      return;
    }
    launchDrillSession(plan, store.listSessions());
  } catch (err) {
    showDrillError(`重练开场失败：${err?.message ?? '未知错误'}，请重试`);
  }
}

// 重练场公共开场（V2.1 整批入口与 V2.3 单题直达共用）。
// 自定义题集不混入重练场：drill 的价值是把历史低分题逐一答透，掺新题会稀释焦点；
// 想练自定义题走准备页「混入我的题集」勾选（V2.3 取舍）。
function launchDrillSession(plan, sessions) {
  clearDrillError();
  // jd 来源取舍：重练题自带 refPoints（评分主锚点），但 scoreAnswer({question,answer,jd})
  // 契约需要 jd 供「JD 关键词覆盖率」一项。取最近一场落库记录随存的 jd 对象——与错题
  // 出处同源概率最高；一条都取不到时退 parseJD('') 的合法空形状（只弱化 JD 覆盖率
  // 一个评分信号，refPoints 覆盖/STAR/量化检测照常），不让重练因缺 jd 开不了场。
  const latest = sortSessionsByTimeDesc(sessions).find((r) => r?.jd && typeof r.jd === 'object');
  const jd = latest?.jd ?? parseJD('');

  // 重练场固定「大厂严谨」persona（追问步步递进，最贴合逼你把低分题答透的场景）
  const persona = getPersona({ style: '大厂严谨', domain: jd.domain });

  // LLM 面板同常规场读取：重练也享受追问润色，留空即纯本地
  const llmConfig = sanitizeLlmConfig({
    baseURL: $('#llm-baseurl').value,
    apiKey: $('#llm-apikey').value,
    model: $('#llm-model').value,
  });
  const llm = llmConfig ? createLLM(llmConfig) : null;

  const scorer = {
    scoreAnswer: ({ question, answer }) => scoreAnswer({ question, answer, jd }),
    scoreSession,
  };

  state.session = createSession({ plan, scorer, llm, persona });
  state.plan = plan;
  state.jd = jd;
  state.resume = null; // 重练场不带简历上下文（题已定，匹配度一节无意义）
  state.match = null;
  state.persona = persona;
  state.qIndex = 0;
  state.finishing = false;
  state.snapshotContext = null; // drill 场不落快照（saveInterviewSnapshot 据此空转），也不动常规场既有快照

  $('#chat-log').innerHTML = '';
  $('#answer-input').value = '';
  addBubble('interviewer', persona.openingLine);
  askNextQuestion();
  showView('interview');
  toast(`弱项重练开场：${plan.questions.length} 道历史低分题，这次把它们答透`);
}

// ---------------- ① 准备页：公考结构化面试（V2.6 卡26 接线） ----------------
// 题库真源在公考陪练资产仓（src/gongkao/bank.mjs 是生成物，同步纪律见其头注）。
// 装配路径独立于 planInterview：公考题不吃 JD/简历语义，五维均衡抽题（gongkao 适配层）。
// 展示用 jd 取 parseJD 的合法形状（报告页消费面不为公考特判）；评分不吃它——
// scorer 不传 jd（kwRatio 走中性 0.5），refPoints/STAR/量化/口头禅检测照常。

const GONGKAO_JD_TEXT = '公考结构化面试';

let gongkaoBankCache = null;
function getGongkaoBank() {
  if (!gongkaoBankCache) {
    const r = normalizeGongkaoBank(GONGKAO_BANK);
    if (!r.ok) throw new Error(`公考题库数据损坏：${r.reason}（重跑 scripts/sync-gongkao-bank.mjs）`);
    gongkaoBankCache = r;
  }
  return gongkaoBankCache;
}

function showGongkaoError(msg) {
  const el = $('#gongkao-error');
  el.textContent = msg;
  el.hidden = false;
  toast(msg);
}

function clearGongkaoError() {
  const el = $('#gongkao-error');
  el.textContent = '';
  el.hidden = true;
}

function startGongkao() {
  try {
    launchGongkaoSession();
  } catch (err) {
    showGongkaoError(`公考场开场失败：${err?.message ?? '未知错误'}，请重试`);
  }
}

function initGongkaoCard() {
  const chips = $('#gongkao-dim-chips');
  chips.replaceChildren();
  for (const dim of GONGKAO_DIMS) {
    const li = document.createElement('li');
    li.className = 'gongkao-dim-chip';
    li.textContent = dim;
    chips.append(li);
  }
  pillGroup(
    $('#gongkao-rounds-options'),
    'gongkao-rounds',
    GONGKAO_ROUND_OPTIONS.map((n) => ({ value: n, label: `${n} 题` })),
    GONGKAO_DEFAULT_ROUNDS,
  );
  const btn = $('#btn-gongkao-start');
  const sync = () => {
    btn.textContent = describeGongkaoStartLabel(parseGongkaoRounds(selectedValue('gongkao-rounds')));
  };
  $('#gongkao-rounds-options').addEventListener('change', sync);
  sync();
  btn.addEventListener('click', startGongkao);
}

function launchGongkaoSession() {
  clearGongkaoError();
  const bank = getGongkaoBank();
  const style = selectedValue('style');
  const rounds = parseGongkaoRounds(selectedValue('gongkao-rounds'));
  const plan = planGongkaoInterview({ questions: bank.questions, rounds, seed: Date.now() });
  const jd = parseJD(GONGKAO_JD_TEXT);
  const persona = getPersona({ style, domain: jd.domain });

  const llmConfig = sanitizeLlmConfig({
    baseURL: $('#llm-baseurl').value,
    apiKey: $('#llm-apikey').value,
    model: $('#llm-model').value,
  });
  const llm = llmConfig ? createLLM(llmConfig) : null;

  // 公考场 scorer 不借 jd（与 drill 借最近一场 jd 的取舍不同）：公考题与任何岗位
  // JD 无关，借来只会引入噪声；sessionScore 口径与常规场同源（scoring 语义零改动），
  // 公考五维聚合在收场时按题 dim 加法产出（aggregateGongkaoDims）
  const scorer = {
    scoreAnswer: ({ question, answer }) => scoreAnswer({ question, answer }),
    scoreSession,
  };

  state.session = createSession({ plan, scorer, llm, persona });
  state.plan = plan;
  state.jd = jd;
  state.resume = null; // 公考场不带简历上下文（题已定，匹配度一节无意义，与 drill 同款）
  state.match = null;
  state.persona = persona;
  state.qIndex = 0;
  state.finishing = false;
  // 公考场落快照可恢复（与常规场同纪律，与 drill 的不落快照相反——公考一场 5 题
  // 都是完整作答，值得恢复）：先作废旧半场，再备好带题库标记的上下文
  clearInterviewSnapshot();
  state.snapshotContext = buildGongkaoSnapshotContext({ style });

  $('#chat-log').innerHTML = '';
  $('#answer-input').value = '';
  addBubble('interviewer', persona.openingLine);
  askNextQuestion();
  showView('interview');
  toast(`公考结构化开场：五维题库均衡抽 ${plan.questions.length} 题`);
}

// ---------------- ① 准备页：我的题集（V2.3，契约 §16） ----------------

// 六类枚举展示序与 src/custom 的 TYPES 同源（§16：枚举外一律回落「行为」，这里不扩）
const CUSTOM_TYPE_OPTIONS = ['开场', '行为', '技术', '项目深挖', '压力', '反问']
  .map((t) => ({ value: t, label: t }));

function renderCustomSection() {
  const list = store.listCustomQuestions();
  $('#custom-count').textContent = String(list.length);
  $('#custom-empty').hidden = list.length > 0;
  const ul = $('#custom-list');
  ul.innerHTML = '';
  for (const q of list) {
    const li = document.createElement('li');
    li.className = 'custom-item';
    const typeSpan = document.createElement('span');
    typeSpan.className = 'c-type';
    typeSpan.textContent = q.type ?? '行为';
    const textSpan = document.createElement('span');
    textSpan.className = 'c-text';
    textSpan.textContent = q.text ?? ''; // 展示截断走 CSS ellipsis，数据不截
    const delBtn = document.createElement('button');
    delBtn.type = 'button';
    delBtn.className = 'btn ghost small c-del';
    delBtn.textContent = '删除';
    delBtn.addEventListener('click', () => {
      if (!window.confirm(`删除这道题？\n${q.text}`)) return;
      store.removeCustomQuestion(q.id);
      renderCustomSection();
    });
    li.append(typeSpan, textSpan, delBtn);
    ul.append(li);
  }
  // 混入行随题集数量联动：空则整行隐藏（勾选状态留在 checkbox 上，无需持久化）
  $('#mix-custom-row').hidden = list.length === 0;
  $('#mix-custom-label').textContent = `混入我的题集（${list.length} 道）`;
}

function showCustomAddError(msg) {
  const el = $('#custom-add-error');
  el.textContent = msg;
  el.hidden = false;
  toast(msg);
}

function clearCustomAddError() {
  const el = $('#custom-add-error');
  el.textContent = '';
  el.hidden = true;
}

function addCustomFromForm() {
  // makeCustomQuestion 是校验真源（trim 后 <5 字返回 null），不在这里抄第二份判断
  const q = makeCustomQuestion({
    text: $('#custom-text').value,
    type: selectedValue('customType') ?? '行为',
  });
  if (!q) {
    // makeCustomQuestion 两种拒因（<5 字 / 超上限）都返回 null，这里按实长报对症的话
    showCustomAddError($('#custom-text').value.trim().length > MAX_QUESTION_TEXT
      ? `题目太长（上限 ${MAX_QUESTION_TEXT} 字）——真实面试题一两句话就够`
      : '题目至少 5 个字');
    return;
  }
  // storage 只落 text/type：Question 形状（refPoints 等）由开场时 makeCustomQuestion
  // 现做——词法将来升级时老题自动受益，不落盘过期形状
  const saved = store.addCustomQuestion({ text: q.text, type: q.type });
  if (!saved) {
    showCustomAddError(`题集已满 ${MAX_CUSTOM} 道，删几道再加`);
    return;
  }
  clearCustomAddError();
  $('#custom-text').value = '';
  renderCustomSection();
  toast('已加入题集');
}

// 题集分享（V2.4 #7，逻辑真源 ui-core）：导出只装 {text,type} 的轻信封（零隐私字段），
// 导入只有 merge 语义（分享不清库）、同题文跳过——与台账页「数据备份」两套入口两种文件。
function doExportCustomSet() {
  const out = exportCustomSet(store);
  if (!out) {
    showCustomImportError('题集是空的——先录一道题再导出分享');
    return;
  }
  clearCustomImportError();
  try {
    downloadJsonFile(out.payload, out.filename);
    toast(`已导出 ${out.filename}——发给伙伴，TA 在「我的题集」里导入`);
  } catch (err) {
    showCustomImportError(`导出失败：${err?.message ?? '未知错误'}，请重试`);
  }
}

function showCustomImportError(msg) {
  const el = $('#custom-import-error');
  el.textContent = msg;
  el.hidden = false;
  toast(msg);
}

function clearCustomImportError() {
  const el = $('#custom-import-error');
  el.textContent = '';
  el.hidden = true;
}

async function importCustomSetFromFile(file) {
  let text;
  try {
    text = await file.text();
  } catch {
    showCustomImportError('文件读取失败，请重新选择');
    return;
  }
  const result = validateCustomSet(text);
  if (!result.ok) {
    showCustomImportError(`无法导入：${result.reason}`);
    return;
  }
  const { imported, skipped, rejected } = importCustomSet(store, result.questions);
  renderCustomSection();
  clearCustomImportError();
  toast(`题集导入完成：新增 ${imported} 道`
    + (skipped > 0 ? `、跳过 ${skipped} 道（已有或无效）` : '')
    + (rejected > 0 ? `、${rejected} 道因题集已满（上限 ${MAX_CUSTOM} 道）被拒收` : ''));
}

function initCustomQuestions() {
  pillGroup($('#custom-type-options'), 'customType', CUSTOM_TYPE_OPTIONS, '行为');
  $('#btn-custom-add').addEventListener('click', addCustomFromForm);
  $('#btn-custom-export').addEventListener('click', doExportCustomSet);
  $('#btn-custom-import').addEventListener('click', () => $('#custom-file').click());
  $('#custom-file').addEventListener('change', (e) => {
    const file = e.target.files?.[0];
    e.target.value = ''; // 清掉选择，同一文件可再次触发 change
    if (file) importCustomSetFromFile(file);
  });
  renderCustomSection();
}

// ---------------- ① 准备页：简历档案切换（V2.4 #6，契约 §9 profiles 面） ----------------
// 存当前 JD+简历为档案 / 下拉切换一键回填；纯逻辑（选项数据/回填载荷/保存口径）在
// ui-core 三函数，这里只做 DOM 与事件——沿题集分享/备份的接线范式。

function renderProfileSection(selectedId = '') {
  const options = buildProfileOptions(store.listProfiles());
  const select = $('#profile-select');
  select.innerHTML = '';
  const placeholder = document.createElement('option');
  placeholder.value = '';
  placeholder.textContent = `切换档案（已存 ${options.length}/${MAX_PROFILES} 份）…`;
  select.append(placeholder);
  for (const o of options) {
    const opt = document.createElement('option');
    opt.value = o.id;
    opt.textContent = o.label;
    select.append(opt);
  }
  select.hidden = options.length === 0; // 空库不摆空下拉，「存为档案」按钮引导第一份
  select.value = selectedId;
  $('#btn-profile-delete').hidden = !select.value;
}

function showProfileError(msg) {
  const el = $('#profile-error');
  el.textContent = msg;
  el.hidden = false;
  toast(msg);
}

function clearProfileError() {
  const el = $('#profile-error');
  el.textContent = '';
  el.hidden = true;
}

function saveProfileFromForm() {
  const jdText = $('#jd-input').value;
  const resumeText = $('#resume-input').value;
  const profiles = store.listProfiles();
  const jd = parseJD(jdText); // title 当默认档案名；记录也按契约 §9 形状带上解析结果
  // 先按默认名过一遍口径：空 JD/同内容/满额三类拒因先兜住，别白弹命名框
  const precheck = buildProfileDraft({ jdText, resumeText, jdTitle: jd.title }, profiles);
  if (!precheck.ok) {
    showProfileError(precheck.reason);
    return;
  }
  const input = window.prompt('给这份档案起个名（下拉里认它用）：', precheck.draft.name);
  if (input === null) return; // 用户取消
  const result = buildProfileDraft({ name: input, jdText, resumeText, jdTitle: jd.title }, profiles);
  if (!result.ok) {
    showProfileError(result.reason);
    return;
  }
  const { draft } = result;
  const saved = store.saveProfile({
    name: draft.name,
    jdText: draft.jdText,
    resumeText: draft.resumeText,
    jd,
    resume: draft.resumeText ? parseResume(draft.resumeText) : null,
  });
  if (!saved) {
    // ui-core 预检之外的最后防线（如并发窗口内他标签页刚存满）
    showProfileError(`档案已满 ${MAX_PROFILES} 份，删掉不用的再存`);
    return;
  }
  renderProfileSection(saved.id);
  clearProfileError();
  toast(`已存为档案「${saved.name}」`);
}

function switchProfile() {
  const select = $('#profile-select');
  $('#btn-profile-delete').hidden = !select.value;
  if (!select.value) return;
  const payload = buildProfileFillPayload(store.getProfile(select.value));
  if (!payload) {
    showProfileError('这份档案数据不完整，回填不了——建议删除后重存');
    return;
  }
  $('#jd-input').value = payload.jdText;
  $('#resume-input').value = payload.resumeText;
  clearProfileError();
  toast('已回填该档案的 JD 与简历');
}

function deleteSelectedProfile() {
  const select = $('#profile-select');
  const id = select.value;
  if (!id) return;
  const label = select.options[select.selectedIndex]?.textContent ?? '这份档案';
  if (!window.confirm(`删除档案「${label}」？\n只删档案本身，不影响已完成的面试记录与报告。`)) return;
  store.deleteProfile(id);
  renderProfileSection();
  clearProfileError();
  toast('档案已删除');
}

function initProfiles() {
  $('#btn-profile-save').addEventListener('click', saveProfileFromForm);
  $('#profile-select').addEventListener('change', switchProfile);
  $('#btn-profile-delete').addEventListener('click', deleteSelectedProfile);
  renderProfileSection();
}

// ---------------- ① 准备页：开始面试 ----------------

function showStartError(msg) {
  const el = $('#start-error');
  el.textContent = msg;
  el.hidden = false;
  toast(msg);
}

function clearStartError() {
  const el = $('#start-error');
  el.textContent = '';
  el.hidden = true;
}

function startInterview() {
  const jdText = $('#jd-input').value.trim();
  const resumeText = $('#resume-input').value.trim();
  if (!jdText) {
    showStartError('先把目标岗位 JD 贴进来，面试官才知道怎么考你');
    return;
  }
  // 非空乱码/闲聊也会 parse 成「未知岗位」空技能——评分走关键词中性 0.5，假开考。
  if (!isJdScorable(parseJD(jdText))) {
    showStartError('这段文字解析不出岗位技能或职责，面试官没法按 JD 出题打分。请贴完整岗位 JD（岗位名、职责、任职要求）');
    return;
  }

  try {
    doStartInterview(jdText, resumeText);
  } catch (err) {
    showStartError(`开始面试失败：${err?.message ?? '未知错误'}，请重试`);
  }
}

function doStartInterview(jdText, resumeText) {
  clearStartError();
  clearSubmitError();
  const jd = parseJD(jdText);
  const resume = resumeText ? parseResume(resumeText) : null;
  const match = resume ? matchResume(jd, resume) : null;
  const mode = selectedValue('mode');
  const rounds = Number(selectedValue('rounds'));
  const style = selectedValue('style');

  let plan = planInterview({
    jd,
    resume: resume ?? undefined,
    match: match ?? undefined,
    mode,
    rounds,
    seed: Date.now(),
  });
  // V2.3 出题混入：勾选才混（默认关，渐进选择）；Question 形状由 makeCustomQuestion
  // 现做（storage 只存 text/type）。重练场不走此路径——drill 专注错题不混入。
  if (!$('#mix-custom-row').hidden && $('#mix-custom').checked) {
    plan = mixIntoPlan(plan, store.listCustomQuestions()
      .map((q) => makeCustomQuestion({ text: q.text, type: q.type }))
      .filter(Boolean));
  }
  const persona = getPersona({ style, domain: jd.domain });

  // apiKey 只存内存变量（这里的局部量），绝不写入 storage；清洗逻辑在 ui-core
  const llmConfig = sanitizeLlmConfig({
    baseURL: $('#llm-baseurl').value,
    apiKey: $('#llm-apikey').value,
    model: $('#llm-model').value,
  });
  const llm = llmConfig ? createLLM(llmConfig) : null;

  // 会话的 scorer 注入：把本场 jd 闭包进去，满足 scoreAnswer({question, answer, jd}) 契约
  const scorer = {
    scoreAnswer: ({ question, answer }) => scoreAnswer({ question, answer, jd }),
    scoreSession,
  };

  state.session = createSession({ plan, scorer, llm, persona });
  state.plan = plan;
  state.jd = jd;
  state.resume = resume;
  state.match = match;
  state.persona = persona;
  state.qIndex = 0;
  state.finishing = false;
  // 中断恢复（V2.5 接线）：新场开场即作废旧半场快照（防陈尸），并备好本场信封上下文
  clearInterviewSnapshot();
  state.snapshotContext = buildInterviewSnapshotContext({ mode, style, jd, resume, match });

  $('#chat-log').innerHTML = '';
  $('#answer-input').value = '';
  addBubble('interviewer', persona.openingLine);
  askNextQuestion();
  showView('interview');
}

// ---------------- ② 面试页：答题循环 ----------------

function askNextQuestion() {
  const q = state.session.nextQuestion();
  if (!q) {
    concludeInterview();
    return;
  }
  state.qIndex += 1;
  addBubble('interviewer', q.text);
  updateProgress(q);
}

function setComposerBusy(busy) {
  $('#btn-submit').disabled = busy;
  $('#btn-early-finish').disabled = busy;
  $('#answer-input').disabled = busy;
  $('#btn-voice').disabled = busy;
  if (busy) stopVoiceInput(); // 提交/评分期间不该继续往输入框里灌识别文本
}

function showSubmitError(msg) {
  const el = $('#submit-error');
  el.textContent = msg;
  el.hidden = false;
  toast(msg);
}

function clearSubmitError() {
  const el = $('#submit-error');
  el.textContent = '';
  el.hidden = true;
}

function attachAnswerScore(bubble, score) {
  if (!Number.isFinite(score?.total)) return false;
  const chip = document.createElement('span');
  chip.className = 'bubble-score';
  chip.textContent = `${Math.round(score.total)} 分`;
  chip.setAttribute('aria-label', `本题 ${Math.round(score.total)} 分`);
  bubble.append(chip);
  return true;
}

async function submitCurrentAnswer() {
  const input = $('#answer-input');
  const text = input.value.trim();
  if (!text) {
    showSubmitError('先写点回答再提交吧——真实面试可没有空着不答这一项');
    return;
  }
  const myBubble = addBubble('me', text);
  input.value = '';
  setComposerBusy(true);
  showTyping();
  try {
    clearSubmitError();
    const { score, followup } = await state.session.submitAnswer(text);
    hideTyping();
    if (!attachAnswerScore(myBubble, score)) {
      myBubble.remove();
      input.value = text;
      showSubmitError('评分结果未能上屏：本题分数缺失或无效，回答已放回输入框，请重试');
      return;
    }
    // 每答一题后落快照（契约 §5：追问挂起时未定稿题按「半程不收录」口径整题丢弃，
    // 中断恢复后重问该题——这正是想要的语义，不必等定稿再写）
    saveInterviewSnapshot();
    if (followup) {
      addBubble('interviewer', followup, { followup: true });
    } else {
      askNextQuestion();
    }
  } catch (err) {
    // 出错不吞：撤下已上屏的气泡（重试不出重复气泡，P3-1）、回答放回输入框，
    // composer 恢复可用，不留 unhandled rejection
    myBubble.remove();
    input.value = text;
    showSubmitError(`提交失败：${err?.message ?? '未知错误'}，回答已放回输入框，请重试`);
  } finally {
    hideTyping();
    setComposerBusy(false);
    if (state.session && !state.finishing) input.focus();
  }
}

function showEarlyFinishError(msg) {
  const el = $('#early-finish-error');
  el.textContent = msg;
  el.hidden = false;
  toast(msg);
}

function clearEarlyFinishError() {
  const el = $('#early-finish-error');
  el.textContent = '';
  el.hidden = true;
}

// 提前交卷（契约 §5 V1.2）：session.abandon() 丢弃未答题、只按已答题计分
function earlyFinish() {
  if (!state.session || state.finishing) return;
  setComposerBusy(true);
  try {
    concludeInterview({ early: true });
  } catch (err) {
    // concludeInterview 入口已把 finishing=true：不复位则按钮 enabled 但点了立刻 return
    state.finishing = false;
    showEarlyFinishError(`交卷失败：${err?.message ?? '未知错误'}，请重试`);
  } finally {
    setComposerBusy(false);
  }
}

function concludeInterview({ early = false } = {}) {
  if (state.finishing || !state.session) return;
  state.finishing = true;
  const session = state.session;

  hideTyping();
  addBubble('interviewer', state.persona.closingLine);
  const result = early ? session.abandon() : session.finish();
  // 公考场（V2.6）：附加独立五维聚合（加法字段，不碰既有 sessionScore/scoring 语义；
  // abandoned 场只按已答题位聚合——aggregateGongkaoDims 以 scores 长度为准）
  if (state.plan.mode === 'gongkao') {
    result.gongkaoDims = aggregateGongkaoDims(state.plan, result.scores);
  }

  const report = buildReport({
    result,
    jd: state.jd,
    resume: state.resume ?? undefined,
    match: state.match ?? undefined,
  });

  // 契约 §9：报告随会话结果一起存本地（saveSession(resultWithReport)），台账记一行趋势；
  // closingLine 随记录存，台账回看时报告页寄语行同样可见（V1.6）
  const savedAt = Date.now();
  const record = store.saveSession({
    ...result,
    report,
    jd: state.jd,
    resume: state.resume,
    match: state.match,
    mode: state.plan.mode,
    closingLine: state.persona.closingLine,
    savedAt,
  });
  store.appendLedger(buildLedgerEntry({ result, mode: state.plan.mode, now: savedAt }));

  state.currentReport = report;
  state.currentMode = state.plan.mode;
  state.currentMeta = buildReportMeta({ result: { ...result, savedAt }, mode: state.plan.mode });
  state.currentClosing = state.persona.closingLine;
  state.currentWeakDims = result.sessionScore?.weakest ?? null;
  state.currentGongkaoDims = result.gongkaoDims && typeof result.gongkaoDims === 'object'
    ? result.gongkaoDims
    : null;
  state.currentSessionId = record?.id ?? null;
  state.session = null;
  state.plan = null;
  // 本场正常收进报告（finish/abandon 皆是）：快照使命结束，清掉防陈尸。
  // guard：drill 场 snapshotContext 为 null——不许它顺手清掉常规场还躺着的可恢复快照
  if (state.snapshotContext) {
    clearInterviewSnapshot();
    state.snapshotContext = null;
  }
  clearEarlyFinishError();
  showView('report');
  if (state.currentSessionId == null) {
    // P2-4：存储写失败（saveSession 返回 false/无 id）时明说后果，解锁卡同步禁用
    toast('本场未能保存（存储空间不足），报告仅本次可见，解锁功能不可用');
  } else {
    toast(result.abandoned
      ? `已提前交卷（答了 ${result.answeredCount}/${result.totalCount} 题），报告只按已答题计分`
      : '面试结束，报告已生成并存入本机台账');
  }
}

// ---------------- ② 面试页：中断恢复（契约 §5/§13 V2.5，本轮接线） ----------------
// 快照通路三件套：写（每答一题后）/ 清（完成、放弃、重新开始、新场开场）/ 恢复（恢复卡）。
// 三道门分工：parseInterviewSnapshotPayload 管信封、unpackInterviewSnapshotContext 管
// 接线上下文（缺 jd 的老信封回 null 走全新开始）、restoreSession 管快照本体深校验。
// 隐私口径：快照含 JD 与作答，键 guomian:interview:snapshot 已在 docs/隐私政策.md §1 点名，
// 备份 replace 的按前缀 wipe 与「清浏览器数据」语义天然罩住。

function readInterviewSnapshotRaw() {
  try {
    return localStorage.getItem(INTERVIEW_SNAPSHOT_KEY);
  } catch {
    return null; // 读不了按无快照处理（隐私模式等），恢复卡自然不出
  }
}

function saveInterviewSnapshot() {
  // drill 场不落快照（snapshotContext 为 null）：重练一场就三题，且 jd 是借来的——
  // 不值得为它覆盖掉常规场可能还躺着的可恢复快照
  if (!state.session || !state.snapshotContext) return;
  try {
    localStorage.setItem(INTERVIEW_SNAPSHOT_KEY, buildInterviewSnapshotPayload({
      snapshot: state.session.snapshot(),
      context: state.snapshotContext,
    }));
  } catch { /* 写失败（配额/隐私模式）只损失恢复能力，不打断答题主流程 */ }
}

function clearInterviewSnapshot() {
  try {
    localStorage.removeItem(INTERVIEW_SNAPSHOT_KEY);
  } catch { /* 清不掉也无害：陈尸快照会被下次开场的清理或 parse 校验兜住 */ }
}

function showRestoreError(msg) {
  const el = $('#restore-error');
  el.textContent = msg;
  el.hidden = false;
  toast(msg);
}

function clearRestoreError() {
  const el = $('#restore-error');
  el.textContent = '';
  el.hidden = true;
}

// 面试页空态的恢复卡：有活跃会话不出卡；快照坏/缺一律静默隐藏（describe 回 null）
function renderRestoreCard() {
  const card = $('#restore-card');
  if (state.session) {
    card.hidden = true;
    return;
  }
  const desc = describeInterviewSnapshot(parseInterviewSnapshotPayload(readInterviewSnapshotRaw()));
  if (!desc) {
    card.hidden = true;
    return;
  }
  clearRestoreError();
  $('#restore-desc').textContent = desc;
  card.hidden = false;
}

function continueFromSnapshot() {
  clearRestoreError();
  const unpacked = unpackInterviewSnapshotContext(parseInterviewSnapshotPayload(readInterviewSnapshotRaw()));
  if (!unpacked) {
    // 公考场分流（V2.6）：常规拆包对公考信封回 null（缺 jd 先例），先给公考拆包认领
    const gk = unpackGongkaoSnapshotContext(parseInterviewSnapshotPayload(readInterviewSnapshotRaw()));
    if (gk) {
      continueGongkaoFromSnapshot(gk);
      return;
    }
    // 信封坏或上下文罩不住（含逻辑层期老信封）：清掉走全新开始，绝不半恢复
    clearInterviewSnapshot();
    showRestoreError('上次的面试快照已失效（可能来自旧版本），请去「准备」页重新开场');
    $('#restore-card').hidden = false;
    return;
  }
  const { snapshot, jd, resume, match, style } = unpacked;
  const persona = getPersona({ style: style ?? listStyles()[0], domain: jd.domain });
  // LLM 面板按当前填写读取（apiKey 只存内存，绝不进快照——恢复后想用增强得重填）
  const llmConfig = sanitizeLlmConfig({
    baseURL: $('#llm-baseurl').value,
    apiKey: $('#llm-apikey').value,
    model: $('#llm-model').value,
  });
  const llm = llmConfig ? createLLM(llmConfig) : null;
  const scorer = {
    scoreAnswer: ({ question, answer }) => scoreAnswer({ question, answer, jd }),
    scoreSession,
  };

  let session;
  try {
    session = restoreSession({ snapshot, scorer, llm, persona });
  } catch (err) {
    // 信封放行但快照本体坏：restoreSession 五道校验拒收（契约 §5）——同样走全新开始
    clearInterviewSnapshot();
    showRestoreError(`恢复失败：${err.message ?? '快照已损坏'}，请去「准备」页重新开场`);
    $('#restore-card').hidden = false;
    return;
  }

  state.session = session;
  state.plan = snapshot.plan;
  state.jd = jd;
  state.resume = resume;
  state.match = match;
  state.persona = persona;
  state.qIndex = snapshot.answers.length; // askNextQuestion 会 +1 到「第 N+1 题」
  state.finishing = false;
  state.snapshotContext = buildInterviewSnapshotContext({
    mode: snapshot.plan.mode, style, jd, resume, match,
  });

  $('#chat-log').innerHTML = '';
  $('#answer-input').value = '';
  addBubble('interviewer', `欢迎回来，我们接着上次继续（已答 ${snapshot.answers.length}/${snapshot.plan.questions.length} 题）。`);
  showView('interview'); // 先切视图再出题：全答完的快照会直接走 concludeInterview 收进报告页
  askNextQuestion();
}

// 公考场恢复（V2.6）：与常规恢复同三道门（parse/unpack 已过前两道），scorer 与
// snapshotContext 按公考口径重建——scorer 不借 jd、上下文带题库标记（续答继续落公考快照）
function continueGongkaoFromSnapshot(gk) {
  const { snapshot, style } = gk;
  const jd = parseJD(GONGKAO_JD_TEXT); // 报告页展示形状，评分不吃它（同开场取舍）
  const persona = getPersona({ style: style ?? listStyles()[0], domain: jd.domain });
  const llmConfig = sanitizeLlmConfig({
    baseURL: $('#llm-baseurl').value,
    apiKey: $('#llm-apikey').value,
    model: $('#llm-model').value,
  });
  const llm = llmConfig ? createLLM(llmConfig) : null;
  const scorer = {
    scoreAnswer: ({ question, answer }) => scoreAnswer({ question, answer }),
    scoreSession,
  };

  let session;
  try {
    session = restoreSession({ snapshot, scorer, llm, persona });
  } catch (err) {
    clearInterviewSnapshot();
    showRestoreError(`恢复失败：${err.message ?? '快照已损坏'}，请去「准备」页重新开场`);
    $('#restore-card').hidden = false;
    return;
  }

  state.session = session;
  state.plan = snapshot.plan;
  state.jd = jd;
  state.resume = null;
  state.match = null;
  state.persona = persona;
  state.qIndex = snapshot.answers.length;
  state.finishing = false;
  state.snapshotContext = buildGongkaoSnapshotContext({ style });

  $('#chat-log').innerHTML = '';
  $('#answer-input').value = '';
  addBubble('interviewer', `欢迎回来，公考场接着上次继续（已答 ${snapshot.answers.length}/${snapshot.plan.questions.length} 题）。`);
  showView('interview');
  askNextQuestion();
}

function discardSnapshot() {
  clearRestoreError();
  clearInterviewSnapshot();
  renderRestoreCard();
  toast('已清除上次面试进度，去「准备」页重新开场吧');
}

// ---------------- ③ 报告页 ----------------

// 解锁判定的取数（storage 记录＋权益＋内存兜底），三源归一逻辑在 ui-core.isReportUnlocked
function reportUnlocked(sessionId) {
  if (sessionId == null) return false;
  return isReportUnlocked({
    session: store.getSession(sessionId) ?? { id: sessionId },
    entitlements: getEntitlements(store),
    memoryUnlockedIds: state.unlockedIds,
  });
}

function showUnlockError(msg) {
  const el = $('#unlock-error');
  el.textContent = msg;
  el.hidden = false;
  toast(msg);
}

function clearUnlockError() {
  const el = $('#unlock-error');
  el.textContent = '';
  el.hidden = true;
}

function doUnlock() {
  // P2-4 兜底：会话没存下来（无 sessionId）时不把内部错误形状抛给用户
  if (state.currentSessionId == null) {
    showUnlockError('本场会话未能保存到本机，无法解锁——清理存储空间后再打一场即可正常解锁');
    return;
  }
  try {
    unlockReport({ store, sessionId: state.currentSessionId });
    if (state.currentSessionId != null) state.unlockedIds.add(state.currentSessionId);
    clearUnlockError();
    renderReportView();
    toast('已解锁完整报告');
  } catch (err) {
    if (err && err.name === 'NoCreditError') {
      showUnlockError('暂无可用权益：先点一个「模拟购买」或输入体验码');
    } else if (err && err.name === 'SessionNotFoundError') {
      // P2-4：覆盖导入等操作清掉旧场后，残留指针解锁会走到这——不吐内部错误形状
      showUnlockError('该场记录已不存在，请重新完成一场面试');
    } else {
      showUnlockError(`解锁失败：${err?.message ?? '未知错误'}`);
    }
  }
}

function buildUnlockCard() {
  const card = document.createElement('div');
  card.className = 'unlock-card';

  // P2-4：会话没存下来时不渲染可点的购买/兑换按钮（那是「已付解不开」的死路），
  // 改为禁用态说明；锁定节保持模糊
  if (state.currentSessionId == null) {
    const notice = document.createElement('p');
    notice.className = 'unlock-lead';
    notice.textContent = '本场会话未能保存到本机（可能是存储空间不足），解锁功能本场不可用。'
      + '免费部分不受影响；清理浏览器存储空间后再打一场，即可正常购买或兑换解锁。';
    card.append(notice);
    return card;
  }

  const lead = document.createElement('p');
  lead.className = 'unlock-lead';
  lead.textContent = '解锁完整报告：五维雷达、全部逐题诊断、追问预演、知识补强与 7 天冲刺计划。';
  card.append(lead);

  // 公测免费旁路（契约 §10 V1.7）：BETA_FREE 时不渲染购买/兑换（那是假动作），
  // 走 betaUnlock 零扣券解锁；付费卡整段保留在下方，正式售卖切 BETA_FREE=false 即回。
  if (BETA_FREE) {
    const freeBtn = document.createElement('button');
    freeBtn.className = 'btn gold block';
    freeBtn.textContent = '公测期免费解锁完整报告';
    freeBtn.addEventListener('click', () => {
      try {
        betaUnlock({ store, sessionId: state.currentSessionId });
        state.unlockedIds.add(state.currentSessionId); // 与既有解锁同款内存兜底
        clearUnlockError();
        renderReportView();
        toast('已解锁完整报告（公测期免费）');
      } catch (err) {
        showUnlockError(`解锁失败：${err?.message ?? '未知错误'}，请重试`);
      }
    });
    card.append(freeBtn);
    const anchor = document.createElement('p');
    anchor.className = 'hint price-anchor';
    // 价格锚点：展示值运行时派生自 SKUS.single（契约 §10 单真源），
    // 改价只动 src/monetize，前端零同步动作——test/price-anchor.test.mjs 机检在守
    const singleSku = SKUS.find((s) => s.id === 'single');
    anchor.textContent = `正式版定价 ¥${singleSku.price}/场 · 公测期间全部免费`;
    card.append(anchor);
    return card;
  }

  for (const sku of SKUS) {
    const btn = document.createElement('button');
    btn.className = 'btn gold block';
    const detail = sku.credits != null ? `${sku.credits} 张解锁券` : `${sku.days} 天会员`;
    btn.textContent = `${sku.name} ¥${sku.price}（${detail}）· 模拟购买`;
    btn.addEventListener('click', () => {
      grantSku({ store, skuId: sku.id }); // V1 模拟支付到账（契约 §10）
      doUnlock();
    });
    card.append(btn);
  }

  if (canUnlock(store)) {
    const useBtn = document.createElement('button');
    useBtn.className = 'btn primary block';
    useBtn.textContent = '用现有权益解锁本场报告';
    useBtn.addEventListener('click', doUnlock);
    card.append(useBtn);
  }

  const redeemRow = document.createElement('div');
  redeemRow.className = 'redeem-row';
  const codeInput = document.createElement('input');
  codeInput.type = 'text';
  codeInput.placeholder = '输入体验码';
  codeInput.setAttribute('aria-label', '体验码');
  const redeemBtn = document.createElement('button');
  redeemBtn.className = 'btn ghost';
  redeemBtn.textContent = '兑换';
  redeemBtn.addEventListener('click', async () => {
    const code = codeInput.value.trim();
    if (!code) {
      showUnlockError('先输入体验码');
      return;
    }
    redeemBtn.disabled = true;
    const prevLabel = redeemBtn.textContent;
    redeemBtn.textContent = '兑换中…';
    try {
      await redeemEntitlementCode({
        store,
        code,
        apiBase: ENTITLEMENT_API_BASE,
        publicKeyJwk: ENTITLEMENT_PUBLIC_KEY_JWK,
      });
      clearUnlockError();
      doUnlock();
    } catch (err) {
      showUnlockError(`兑换失败：${err?.message ?? '体验码无效'}`);
    } finally {
      redeemBtn.disabled = false;
      redeemBtn.textContent = prevLabel;
    }
  });
  redeemRow.append(codeInput, redeemBtn);
  card.append(redeemRow);

  const entLine = document.createElement('p');
  entLine.className = 'hint';
  entLine.textContent = entitlementText(getEntitlements(store));
  card.append(entLine);

  return card;
}

function renderReportView() {
  const hasReport = Boolean(state.currentReport);
  $('#report-empty').hidden = hasReport;
  $('#report-main').hidden = !hasReport;
  $('#disclosure-bar').textContent = `${DISCLOSURE}。`; // 契约硬条款：报告页固定可见
  clearShareError();
  if (!hasReport) return;

  const report = state.currentReport;
  const unlocked = reportUnlocked(state.currentSessionId);
  $('#export-locked-hint').hidden = unlocked; // 未解锁时提示导出的是占位版
  // 弱项锦囊联动（V1.8）：本场有弱维度才出，点击切到锦囊页按弱项过滤
  $('#coach-link-row').hidden = !(Array.isArray(state.currentWeakDims) && state.currentWeakDims.length > 0);
  const container = $('#report-content');
  container.innerHTML = '';

  const title = document.createElement('h2');
  title.className = 'report-title';
  title.textContent = report.title;
  const badgeText = abandonBadgeText(state.currentMeta);
  if (badgeText) {
    const badge = document.createElement('span');
    badge.className = 'abandon-badge';
    badge.textContent = badgeText;
    title.append(badge);
  }
  // 重练场徽标（V2.1）：复用提前交卷徽标样式体系，金色变体区分「标注」与「警示」
  if (state.currentMode === 'drill') {
    const drillBadge = document.createElement('span');
    drillBadge.className = 'abandon-badge drill-badge';
    drillBadge.textContent = `${modeLabel('drill')}场`;
    title.append(drillBadge);
  }
  if (state.currentMode === 'gongkao') {
    const gkBadge = document.createElement('span');
    gkBadge.className = 'abandon-badge gongkao-badge';
    gkBadge.textContent = `${modeLabel('gongkao')}场`;
    title.append(gkBadge);
  }
  container.append(title);

  // 收尾台词呈现在报告页顶部（V1.6 P3-3）：面试页气泡加完立刻切页看不到，
  // 与其塞 1.2s 定时器拖流程，不如让寄语常驻报告，台账回看也在
  if (state.currentClosing) {
    const closing = document.createElement('p');
    closing.className = 'closing-quote';
    const tag = document.createElement('span');
    tag.className = 'closing-tag';
    tag.textContent = '面试官寄语';
    const line = document.createElement('span');
    line.textContent = state.currentClosing;
    closing.append(tag, line);
    container.append(closing);
  }

  // 公考专属雷达（V2.6 遗留收口）：五维聚合已随 saveSession 落库，报告页必须画出。
  // 表达五维雷达仍走②节正文 + 台账页 #radar-chart，这里只画公考轴，两套轴互不替换。
  const gkSvg = gongkaoRadarSvgMarkup(state.currentGongkaoDims);
  if (gkSvg) {
    const cap = document.createElement('p');
    cap.className = 'hint';
    cap.textContent = '本场公考结构化五维（独立评分档，未考维度不画出）';
    const host = document.createElement('div');
    host.id = 'gongkao-report-radar';
    host.className = 'radar-chart';
    host.innerHTML = gkSvg;
    container.append(cap, host);
  }

  let unlockCardPlaced = false;
  for (const sec of report.sections ?? []) {
    const secEl = document.createElement('section');
    secEl.className = 'report-section';
    const h = document.createElement('h3');
    h.textContent = sec.heading;
    secEl.append(h);

    const body = document.createElement('div');
    body.className = 'section-body';
    for (const line of String(sec.body ?? '').split('\n')) {
      const p = document.createElement('p');
      p.textContent = line;
      body.append(p);
    }

    if (sec.locked && !unlocked) {
      body.classList.add('blurred');
      body.setAttribute('aria-hidden', 'true');
      const wrap = document.createElement('div');
      wrap.className = 'locked-wrap';
      wrap.append(body);
      if (!unlockCardPlaced) {
        wrap.append(buildUnlockCard());
        unlockCardPlaced = true;
      } else {
        const hint = document.createElement('p');
        hint.className = 'locked-hint';
        hint.textContent = '🔒 解锁后可见';
        wrap.append(hint);
      }
      secEl.append(wrap);
    } else {
      secEl.append(body);
    }
    container.append(secEl);
  }
}

function showShareError(msg) {
  const el = $('#share-error');
  el.textContent = msg;
  el.hidden = false;
  toast(msg);
}

function clearShareError() {
  const el = $('#share-error');
  el.textContent = '';
  el.hidden = true;
}

async function copyToClipboard(text, okMsg) {
  clearShareError();
  try {
    await navigator.clipboard.writeText(text);
    toast(okMsg);
  } catch {
    // 剪贴板 API 不可用时的兜底（如非安全上下文）
    const ta = document.createElement('textarea');
    ta.value = text;
    document.body.append(ta);
    ta.select();
    const ok = document.execCommand('copy');
    ta.remove();
    if (ok) toast(okMsg);
    else showShareError('复制失败，请手动长按报告文本复制');
  }
}

// 导出用报告：已解锁时把 locked 标记摘掉（导出模块对 locked 节只出占位，防泄露真源在它那边）
function exportableReport() {
  const report = state.currentReport;
  if (!reportUnlocked(state.currentSessionId)) return report;
  return { ...report, sections: (report.sections ?? []).map((s) => ({ ...s, locked: false })) };
}

function copyMarkdown() {
  if (!state.currentReport) return;
  const md = toMarkdown({ report: exportableReport(), meta: state.currentMeta ?? undefined });
  copyToClipboard(md, '报告全文（Markdown）已复制到剪贴板');
}

function downloadMarkdown() {
  if (!state.currentReport) return;
  clearShareError();
  try {
    const md = toMarkdown({ report: exportableReport(), meta: state.currentMeta ?? undefined });
    const filename = suggestFilename({ meta: state.currentMeta ?? undefined });
    const blob = new Blob([md], { type: 'text/markdown;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    document.body.append(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);
    toast(`已下载 ${filename}`);
  } catch (err) {
    showShareError(`下载失败：${err?.message ?? '未知错误'}，请重试`);
  }
}

function shareReport() {
  if (!state.currentReport) return;
  copyToClipboard(toShareText(state.currentReport), '分享文本已复制到剪贴板（含披露句）');
}

// ---------------- 战绩分享卡（V2.3，契约 §12） ----------------
// canvas 只管照 buildShareCardModel 画：文案/颜色档/徽标判定全部在 ui-core 可测面。
// 卡面只有分数与维度，不含用户身份信息与简历内容；披露句必须整行绘制在卡面上
// （诚实承诺不因载体变化而豁免，与 shareText 同源 DISCLOSURE）。

const SHARE_CARD_W = 1080;
const SHARE_CARD_H = 1350; // 3:4 竖版，适配小红书
// 分数带三档色（model.scoreBand 判定在 ui-core）：金 / 蓝灰 / 暗红
const SHARE_BAND_COLORS = { gold: '#c9a227', mid: '#9fb0c9', low: '#c75c4a' };

function canvasSupported() {
  try {
    const c = document.createElement('canvas');
    return typeof c.getContext === 'function' && Boolean(c.getContext('2d'));
  } catch {
    return false;
  }
}

// buildRadarPoints 的 'x,y x,y' 顶点串解析成数字对——SVG 版与 canvas 版共用同一坐标真源
function parseSvgPoints(str) {
  return String(str).split(' ').filter(Boolean).map((p) => p.split(',').map(Number));
}

function traceCardPolygon(ctx, pts, dx, dy) {
  ctx.beginPath();
  pts.forEach(([x, y], i) => (i === 0 ? ctx.moveTo(x + dx, y + dy) : ctx.lineTo(x + dx, y + dy)));
  ctx.closePath();
}

function drawShareCard(model) {
  const canvas = document.createElement('canvas');
  canvas.width = SHARE_CARD_W;
  canvas.height = SHARE_CARD_H;
  const ctx = canvas.getContext('2d');
  const cx = SHARE_CARD_W / 2;
  const font = (px, bold = false) => {
    ctx.font = `${bold ? '700 ' : ''}${px}px "PingFang SC", "Microsoft YaHei", sans-serif`;
  };

  // 深藏青底（比主题主色 #1f3a5f 深一档，金字对比更足）
  ctx.fillStyle = '#14213a';
  ctx.fillRect(0, 0, SHARE_CARD_W, SHARE_CARD_H);
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';

  // 品牌区：产品名＋副题＋分隔线
  ctx.fillStyle = '#c9a227';
  font(96, true);
  ctx.fillText(model.title, cx, 140);
  ctx.fillStyle = 'rgba(230,236,245,0.6)';
  font(36);
  ctx.fillText(model.subtitle, cx, 222);
  ctx.strokeStyle = 'rgba(201,162,39,0.35)';
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.moveTo(220, 278);
  ctx.lineTo(860, 278);
  ctx.stroke();

  // 总分大字（带色）＋标签＋徽标行（重练/提前交卷）
  ctx.fillStyle = SHARE_BAND_COLORS[model.scoreBand] ?? SHARE_BAND_COLORS.mid;
  font(210, true);
  ctx.fillText(model.scoreText, cx, 430);
  ctx.fillStyle = 'rgba(230,236,245,0.6)';
  font(38);
  ctx.fillText(model.scoreLabel, cx, 548);
  if (model.badges.length > 0) {
    ctx.fillStyle = '#c9a227';
    font(34);
    ctx.fillText(model.badges.join('　'), cx, 610);
  }

  // 五维雷达（坐标同源 buildRadarPoints）；noRadar 时占位一行不留空洞
  if (model.noRadar) {
    ctx.fillStyle = 'rgba(230,236,245,0.4)';
    font(32);
    ctx.fillText('本场无五维数据', cx, 830);
  } else {
    const size = 400;
    const { center, axes, polygon, gridPolygons } = buildRadarPoints(model.radar, { size });
    const dx = cx - center;
    const dy = 840 - center;
    ctx.strokeStyle = 'rgba(230,236,245,0.22)';
    ctx.lineWidth = 1.5;
    for (const ring of gridPolygons) {
      traceCardPolygon(ctx, parseSvgPoints(ring), dx, dy);
      ctx.stroke();
    }
    for (const a of axes) {
      ctx.beginPath();
      ctx.moveTo(center + dx, center + dy);
      ctx.lineTo(a.x + dx, a.y + dy);
      ctx.stroke();
    }
    traceCardPolygon(ctx, parseSvgPoints(polygon), dx, dy);
    ctx.fillStyle = 'rgba(201,162,39,0.25)';
    ctx.fill();
    ctx.strokeStyle = '#c9a227';
    ctx.lineWidth = 3;
    ctx.stroke();
    // 轴端标签沿轴向外推（与 SVG 版同思路，canvas 统一居中锚）
    ctx.fillStyle = 'rgba(230,236,245,0.75)';
    font(30);
    for (const a of axes) {
      const vx = a.x - center;
      const vy = a.y - center;
      const len = Math.hypot(vx, vy) || 1;
      ctx.fillText(a.label, a.x + (vx / len) * 52 + dx, a.y + (vy / len) * 42 + dy);
    }
  }

  // 场次信息：模式与领域行＋日期行
  ctx.fillStyle = 'rgba(230,236,245,0.9)';
  font(40);
  ctx.fillText(model.modeLine, cx, 1105);
  ctx.fillStyle = 'rgba(230,236,245,0.55)';
  font(34);
  ctx.fillText(model.dateLine, cx, 1165);

  // 底部：站点地址＋披露句整行（字号小但完整绘制，契约硬条款）
  ctx.fillStyle = '#c9a227';
  font(34);
  ctx.fillText(model.footer, cx, 1245);
  ctx.fillStyle = 'rgba(230,236,245,0.5)';
  font(28);
  ctx.fillText(model.disclosure, cx, 1300);

  return canvas;
}

function doShareCard() {
  if (!state.currentReport) return;
  clearShareError();
  // sessionScore/jd 取落库记录（radar 与领域的真源随场存）；存失败的场（无 id / 记录
  // 已被清理）退 meta.totalScore 出无雷达卡，分享功能不整个哑掉
  const rec = state.currentSessionId != null
    ? (store.listSessions() ?? []).find((s) => s?.id === state.currentSessionId)
    : null;
  const model = buildShareCardModel({
    meta: state.currentMeta ?? {},
    sessionScore: rec?.sessionScore,
    jd: rec?.jd,
  });
  const canvas = drawShareCard(model);
  canvas.toBlob((blob) => {
    if (!blob) {
      showShareError('分享图生成失败，请重试');
      return;
    }
    try {
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = model.filename;
      document.body.append(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(url);
      toast(`已下载 ${model.filename}`);
    } catch (err) {
      showShareError(`分享图下载失败：${err?.message ?? '未知错误'}，请重试`);
    }
  }, 'image/png');
}

// ---------------- ④ 台账页 ----------------

function showLedgerError(msg) {
  const el = $('#ledger-error');
  el.textContent = msg;
  el.hidden = false;
  toast(msg);
}

function clearLedgerError() {
  const el = $('#ledger-error');
  el.textContent = '';
  el.hidden = true;
}

function openSavedReport(rec) {
  if (!rec || !rec.report) {
    showLedgerError('这条记录没有存下报告，无法回看——可能是存储空间不足时打的场，再打一场即可');
    return;
  }
  state.currentReport = rec.report;
  state.currentMode = rec?.mode ?? null;
  state.currentMeta = buildReportMeta({ result: rec, mode: rec?.mode });
  state.currentClosing = typeof rec.closingLine === 'string' ? rec.closingLine : null;
  state.currentWeakDims = rec?.sessionScore?.weakest ?? null;
  state.currentGongkaoDims = rec?.gongkaoDims && typeof rec.gongkaoDims === 'object'
    ? rec.gongkaoDims
    : null;
  state.currentSessionId = rec.id ?? null;
  clearLedgerError();
  showView('report');
}

function renderLedger() {
  clearLedgerError();
  // 公测态不展示券数/会员（公测不扣券，展示了反而误导）；付费态原样走 entitlementText
  $('#entitlement-card').textContent = BETA_FREE
    ? '公测期 · 免费解锁不限量'
    : entitlementText(getEntitlements(store));

  const ledger = store.getLedger() ?? [];
  const trendEl = $('#trend-chart');
  const trendSvg = trendSvgMarkup(ledger);
  trendEl.innerHTML = trendSvg
    || '<p class="empty-inline">还没有分数记录，打完第一场这里就会出现你的成长曲线。</p>';

  // 最近一场五维雷达：radar 是 V1.6 起才落账的字段，旧条目没有——从新到旧
  // 找最近一条带 radar 的；一条都没有时给引导文案而不是空白
  const latestWithRadar = [...ledger]
    .reverse()
    .find((e) => e?.radar != null && typeof e.radar === 'object');
  const radarEl = $('#radar-chart');
  const radarSvg = latestWithRadar ? radarSvgMarkup(latestWithRadar.radar) : '';
  radarEl.innerHTML = radarSvg
    || '<p class="empty-inline">还没有五维数据（早期记录只存了总分），打一场新的就能看到你的能力雷达。</p>';

  const sessions = store.listSessions() ?? [];

  // 错题本（V2.1）：低分题聚合列表（title＋最近得分＋答过次数）；空态整卡隐藏。
  // 注意放在下方 sessions 空态 early return 之前——没有历史时错题卡也必须收起。
  const mistakes = collectMistakes(sessions);
  const mistakeCard = $('#mistake-card');
  const mistakeList = $('#mistake-list');
  mistakeList.innerHTML = '';
  mistakeCard.hidden = mistakes.length === 0;
  for (const m of mistakes) {
    const li = document.createElement('li');
    li.className = 'mistake-item';
    const titleSpan = document.createElement('span');
    titleSpan.className = 'm-title';
    titleSpan.textContent = m.question.text;
    const metaSpan = document.createElement('span');
    metaSpan.className = 'm-meta';
    metaSpan.textContent = `最近 ${m.score.total} 分 · 答过 ${m.attempts} 次`;
    // V2.3 单题直达：只有这颗按钮可点（行内其余区域保持不可点，防误触）
    const retryBtn = document.createElement('button');
    retryBtn.type = 'button';
    retryBtn.className = 'btn gold m-retry';
    retryBtn.textContent = '重练这题';
    retryBtn.addEventListener('click', () => startSingleDrill(m));
    li.append(titleSpan, metaSpan, retryBtn);
    mistakeList.append(li);
  }

  const list = $('#history-list');
  list.innerHTML = '';
  if (sessions.length === 0) {
    const li = document.createElement('li');
    li.className = 'empty-inline';
    li.textContent = '还没有练习记录。每一场模拟的价值，都在于把问题暴露在真实面试之前。';
    list.append(li);
    return;
  }
  const ordered = sortSessionsByTimeDesc(sessions);
  for (const rec of ordered) {
    const li = document.createElement('li');
    const btn = document.createElement('button');
    btn.className = 'history-item';
    // 与 ui-core 排序/回看同款回退：字符串 savedAt（旧坏数据）也退到 endedAt，不显「未知时间」
    const when = fmtTime(Number.isFinite(rec?.savedAt) ? rec.savedAt : rec?.endedAt);
    const total = rec?.sessionScore?.total ?? '—';
    const timeSpan = document.createElement('span');
    timeSpan.className = 'h-time';
    timeSpan.textContent = when;
    const modeSpan = document.createElement('span');
    modeSpan.className = 'h-mode';
    modeSpan.textContent = modeLabel(rec?.mode);
    const scoreSpan = document.createElement('span');
    scoreSpan.className = 'h-score';
    scoreSpan.textContent = `${total} 分`;
    btn.append(timeSpan, modeSpan);
    const rowBadge = abandonBadgeText(rec);
    if (rowBadge) {
      const abandonSpan = document.createElement('span');
      abandonSpan.className = 'h-mode h-abandon';
      abandonSpan.textContent = rowBadge;
      btn.append(abandonSpan);
    }
    btn.append(scoreSpan);
    btn.addEventListener('click', () => openSavedReport(rec));
    li.append(btn);
    list.append(li);
  }
}

// ---------------- 浮层公共：焦点陷阱（P2-5，两浮层共用单真源） ----------------
// aria-modal 只是语义声明，z-index 挡得住鼠标挡不住键盘——浮层打开期间
// Tab/Shift+Tab 必须锁在浮层内循环：最后一个 Tab 回第一个、第一个 Shift+Tab 到最后一个；
// 焦点意外落在浮层外（如刚打开）时，下一次 Tab 直接拉回浮层内。
// document 级单一 keydown 处理器按「当前唯一可见的 .modal-overlay」取陷阱范围，
// 新增浮层零接线成本；关闭后浮层 hidden，处理器自动不再拦截。

const FOCUSABLE_SELECTOR = 'button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])';

function initModalFocusTrap() {
  document.addEventListener('keydown', (e) => {
    if (e.key !== 'Tab') return;
    const overlay = [...document.querySelectorAll('.modal-overlay')].find((o) => !o.hidden);
    if (!overlay) return;
    const focusables = [...overlay.querySelectorAll(FOCUSABLE_SELECTOR)]
      .filter((el) => !el.disabled);
    if (focusables.length === 0) {
      e.preventDefault();
      return;
    }
    const first = focusables[0];
    const last = focusables[focusables.length - 1];
    const active = document.activeElement;
    if (e.shiftKey) {
      if (active === first || !overlay.contains(active)) {
        e.preventDefault();
        last.focus();
      }
    } else if (active === last || !overlay.contains(active)) {
      e.preventDefault();
      first.focus();
    }
  });
}

// ---------------- 隐私承诺浮层 ----------------
// 应用内要点摘录（内容在 index.html 静态写死，完整文本在 docs/隐私政策.md）；
// 关闭后焦点归还触发按钮（无障碍），Esc/背景点击均可关。

function openPrivacyOverlay() {
  const overlay = $('#privacy-overlay');
  overlay.hidden = false;
  $('#btn-privacy-close').focus();
}

function closePrivacyOverlay() {
  const overlay = $('#privacy-overlay');
  if (overlay.hidden) return;
  overlay.hidden = true;
  $('#btn-privacy').focus(); // 焦点归还触发按钮
}

function initPrivacyOverlay() {
  $('#btn-privacy').addEventListener('click', openPrivacyOverlay);
  $('#btn-privacy-close').addEventListener('click', closePrivacyOverlay);
  $('#btn-privacy-full').addEventListener('click', loadPrivacyFullText);
  $('#privacy-overlay').addEventListener('click', (e) => {
    if (e.target === e.currentTarget) closePrivacyOverlay(); // 只点背景关，点卡片不关
  });
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') closePrivacyOverlay();
  });
}

// 政策全文按行渲染为纯文本段落：# 开头的标题行加粗、空行跳过，零 markdown 渲染器、
// 全部 textContent（注入纪律不因自家文档破例）
function renderPolicyText(box, text) {
  box.textContent = '';
  for (const raw of String(text).split('\n')) {
    const line = raw.replace(/\r$/, '').trim();
    if (!line) continue;
    const p = document.createElement('p');
    if (line.startsWith('#')) {
      p.className = 'policy-heading';
      p.textContent = line.replace(/^#+\s*/, '');
    } else {
      p.textContent = line;
    }
    box.append(p);
  }
}

// 隐私政策全文入应用（V1.9，收 V1.7 挂账「浮层引用的全文线上不可达」）：
// 这是 app 层唯一的网络调用点——取本站静态托管的政策文本自身，同源 GET、
// 不携带任何业务数据；已在 test/privacy.test.mjs 的 FETCH_WHITELIST 登记 1 处，
// 政策依据见 docs/隐私政策.md §5 末行声明。失败（本地 dev 未放行 /docs、断网
// 且无缓存）时给兜底行并允许重试，不炸不空白。
async function loadPrivacyFullText() {
  const btn = $('#btn-privacy-full');
  const box = $('#privacy-full');
  btn.disabled = true;
  box.hidden = false;
  box.textContent = '加载中…';
  try {
    const res = await fetch('/docs/隐私政策.md');
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    renderPolicyText(box, await res.text());
    btn.hidden = true; // 已展开，按钮退场
  } catch {
    box.textContent = '';
    const fallback = document.createElement('p');
    fallback.className = 'hint';
    fallback.textContent = '当前环境未能加载完整文本（可能离线或本环境未托管该文件）。'
      + '全文暂时加载失败，可稍后重试；上方要点即政策的忠实摘录，六条承诺不因加载失败而打折。';
    box.append(fallback);
    btn.disabled = false; // 网络恢复后可重试
  }
}

// ---------------- ⑤ 锦囊页（契约 §14 V1.8） ----------------
// 数据与过滤逻辑全在 src/coach（单真源），这里只做渲染与交互状态。
// 过滤优先级：弱项推荐（报告页联动）> 搜索词 > 分类；搜索与分类互斥——
// 输入关键词即离开分类视图，点分类即清搜索框，状态永远只有一个来源。

const COACH_ALL = '全部';
const coachState = {
  category: COACH_ALL,
  keyword: '',
  recoTips: null, // 非 null = 报告页弱项推荐态（Tip 数组）
};
let coachSearchTimer = null;

function coachVisibleTips() {
  if (coachState.recoTips) return coachState.recoTips;
  if (coachState.keyword) return searchTips(coachState.keyword); // 契约：空词回 []，故空词不走这支
  if (coachState.category === COACH_ALL) return TIPS;
  return getTipsByCategory(coachState.category);
}

// 条目卡片：title＋category 徽标＋body 常显；script/dont 用 details 默认折叠保持列表可扫。
// 全部 textContent 渲染（注入纪律不因自家数据破例）。
function buildTipCard(tip) {
  const card = document.createElement('article');
  card.className = 'coach-card';

  const head = document.createElement('h3');
  head.className = 'coach-card-title';
  const titleSpan = document.createElement('span');
  titleSpan.textContent = tip.title;
  const catBadge = document.createElement('span');
  catBadge.className = 'coach-cat-badge';
  catBadge.textContent = tip.category;
  head.append(titleSpan, catBadge);
  card.append(head);

  const body = document.createElement('p');
  body.className = 'coach-body';
  body.textContent = tip.body;
  card.append(body);

  if (tip.script) {
    const details = document.createElement('details');
    details.className = 'coach-script';
    const summary = document.createElement('summary');
    summary.textContent = '话术示范';
    const quote = document.createElement('p');
    quote.textContent = tip.script;
    details.append(summary, quote);
    card.append(details);
  }

  if (tip.dont) {
    const details = document.createElement('details');
    details.className = 'coach-dont';
    const summary = document.createElement('summary');
    summary.textContent = '别这样';
    const warn = document.createElement('p');
    warn.textContent = tip.dont;
    details.append(summary, warn);
    card.append(details);
  }

  return card;
}

function renderCoachCats() {
  const wrap = $('#coach-cats');
  wrap.innerHTML = '';
  for (const cat of [COACH_ALL, ...listCategories()]) {
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'coach-cat-pill';
    btn.textContent = cat;
    btn.classList.toggle('active', !coachState.recoTips && !coachState.keyword && coachState.category === cat);
    btn.addEventListener('click', () => {
      coachState.category = cat;
      coachState.keyword = '';
      coachState.recoTips = null;
      $('#coach-search').value = '';
      renderCoach();
    });
    wrap.append(btn);
  }
}

function renderCoach() {
  $('#coach-reco-bar').hidden = !coachState.recoTips;
  renderCoachCats();

  const list = $('#coach-list');
  list.innerHTML = '';
  const tips = coachVisibleTips();
  if (tips.length === 0) {
    const empty = document.createElement('p');
    empty.className = 'empty-inline';
    empty.textContent = `没搜到与「${coachState.keyword}」相关的锦囊，换个词试试：追问、STAR、谈薪、反问。`;
    list.append(empty);
    return;
  }
  for (const tip of tips) list.append(buildTipCard(tip));
}

// 报告页「针对你的弱项」入口：切到锦囊页并按本场弱维度推荐过滤
function openCoachReco() {
  const tips = recommendTips({ weakDims: state.currentWeakDims ?? [] });
  coachState.recoTips = tips.length > 0 ? tips : null; // 推荐空时退化为全部，不出空推荐态
  coachState.keyword = '';
  coachState.category = COACH_ALL;
  $('#coach-search').value = '';
  showView('coach');
}

function initCoach() {
  $('#coach-search').addEventListener('input', (e) => {
    clearTimeout(coachSearchTimer);
    coachSearchTimer = setTimeout(() => {
      coachState.keyword = e.target.value.trim(); // 空词回分类视图（契约 searchTips 空词返回 []）
      coachState.recoTips = null;
      renderCoach();
    }, 200); // 防抖：即输即滤但不逐键全量过滤
  });
  $('#btn-coach-reco-clear').addEventListener('click', () => {
    coachState.recoTips = null;
    renderCoach();
  });
  $('#coach-link-row').addEventListener('click', openCoachReco);
}

// ---------------- 语音作答（V2.1，纯前端渐进增强，契约 §12 语音条款） ----------------
// 语音只是输入法：识别文本进作答框、可编辑、提交链路不变。浏览器不支持则按钮保持
// hidden 零痕迹。音频由浏览器内置识别服务处理（通常经浏览器厂商云端）——本产品代码
// 不接触音频字节，只接收识别文本；数据流已在 docs/隐私政策.md §7 如实披露，
// 首次使用先弹告知浮层，确认记 UI 偏好裸键 guomian:voice-consent（onboarded 同款先例，
// 非业务数据不走 createStore 四面）。

const SpeechRec = window.SpeechRecognition || window.webkitSpeechRecognition;

const voice = {
  rec: null,           // 当前识别实例（识别中非 null，防重复启动）
  baseText: '',        // 开始聆听时输入框已有文本快照，识别结果拼在其后
  finalText: '',       // 已定稿的识别文本累积
  errored: false,      // onerror 后 onend 还会来一次，防 toast 双发
  discard: false,      // 丢弃模式（V2.2 P1-1）：onend 不回写输入框（提交路径专用）
  stopRequested: false, // stop 已发出、onend 未到的窗口标志（防重复 stop/toast）
};

function voiceErrorMessage(code) {
  if (code === 'not-allowed' || code === 'service-not-allowed') {
    return '麦克风权限被拒绝——请在浏览器设置里允许本站使用麦克风后重试';
  }
  if (code === 'no-speech') return '没听到声音，已停止聆听；可以再点麦克风重试';
  if (code === 'network') return '语音服务连接失败（浏览器的识别服务需要联网），已停止聆听';
  return '语音识别出错，已停止聆听；可以继续手动输入';
}

function setVoiceUi(listening) {
  const btn = $('#btn-voice');
  btn.classList.toggle('listening', listening);
  btn.setAttribute('aria-pressed', String(listening));
  btn.setAttribute('aria-label', listening ? '聆听中，点击结束' : '语音作答（点击开始聆听）');
  $('#voice-hint').hidden = !listening;
}

// 接缝防护（V2.2 P1-1）：rec.stop() 是异步的——onend 要过一拍才来。识别中点「提交」时，
// 提交路径会消费并清空输入框；若 onend 仍无条件回写 baseText+finalText，上一题答案就会
// 在空输入框里「复活」，极易被重复提交。提交/评分路径必须用 { discard:true } 停止：
// 清掉快照并让 onend 跳过回写。手动点麦克风/切视图的停止仍走默认路径（文本保留）。
function stopVoiceInput({ discard = false } = {}) {
  if (!voice.rec) return;
  if (discard) {
    voice.discard = true;
    voice.baseText = '';
    voice.finalText = '';
  }
  if (voice.stopRequested) return; // stop 已在路上，只需（可能的）discard 升级
  voice.stopRequested = true;
  try { voice.rec.stop(); } catch { /* 已停的实例再 stop 不炸 */ }
}

function showVoiceError(msg) {
  const el = $('#voice-error');
  el.textContent = msg;
  el.hidden = false;
  toast(msg);
}

function clearVoiceError() {
  const el = $('#voice-error');
  el.textContent = '';
  el.hidden = true;
}

function startVoiceInput() {
  if (voice.rec) return; // 识别中禁再启
  clearVoiceError();
  const input = $('#answer-input');
  // 与已有手打文本拼接：快照现值，识别结果追加在尾部
  voice.baseText = input.value;
  if (voice.baseText && !/\s$/.test(voice.baseText)) voice.baseText += ' ';
  voice.finalText = '';
  voice.errored = false;
  voice.discard = false;
  voice.stopRequested = false;

  const rec = new SpeechRec();
  rec.lang = 'zh-CN';
  rec.continuous = true;
  rec.interimResults = true;

  rec.onresult = (event) => {
    let finals = '';
    let interim = '';
    for (const result of event.results) {
      if (result.isFinal) finals += result[0].transcript;
      else interim += result[0].transcript;
    }
    voice.finalText = finals;
    input.value = voice.baseText + voice.finalText + interim;
    input.selectionStart = input.selectionEnd = input.value.length; // 光标尾部
  };
  rec.onerror = (event) => {
    voice.errored = true;
    showVoiceError(voiceErrorMessage(event?.error));
  };
  rec.onend = () => {
    // 停止（用户手点 / 自然超时 / 出错）统一收口：丢弃残留 interim，只留定稿文本
    input.value = voice.baseText + voice.finalText;
    voice.rec = null;
    setVoiceUi(false);
    input.focus();
  };

  try {
    rec.start();
  } catch {
    showVoiceError(voiceErrorMessage('start-failed'));
    return;
  }
  voice.rec = rec;
  setVoiceUi(true);
}

function closeVoiceConsent() {
  const overlay = $('#voice-consent-overlay');
  if (overlay.hidden) return;
  overlay.hidden = true;
  $('#btn-voice').focus(); // 焦点归还触发按钮
}

function initVoiceInput() {
  if (!SpeechRec) return; // 不支持：按钮保持 hidden，纯文字路径零痕迹
  const btn = $('#btn-voice');
  btn.hidden = false;

  btn.addEventListener('click', () => {
    if (voice.rec) {
      stopVoiceInput();
      return;
    }
    if (localStorage.getItem('guomian:voice-consent') === '1') {
      startVoiceInput();
      return;
    }
    $('#voice-consent-overlay').hidden = false;
    $('#btn-voice-consent-ok').focus();
  });

  $('#btn-voice-consent-ok').addEventListener('click', () => {
    // 只有明确点「知道了，开始」才落盘同意标志；取消/Esc 不落盘，下次再问
    localStorage.setItem('guomian:voice-consent', '1');
    closeVoiceConsent();
    startVoiceInput();
  });
  $('#btn-voice-consent-cancel').addEventListener('click', closeVoiceConsent);
  $('#voice-consent-overlay').addEventListener('click', (e) => {
    if (e.target === e.currentTarget) closeVoiceConsent(); // 只点背景关，点卡片不关
  });
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') closeVoiceConsent();
  });
}

// ---------------- 数据备份：导出 / 导入（V2.0，逻辑真源 ui-core 契约 §13） ----------------
// 本地优先产品的逃生舱：清浏览器数据/换设备前导出 JSON，回来时导入。
// 文件读取用 File.text()（Blob API），零网络请求——隐私机检 fetch 白名单不涉及。

let pendingImportData = null; // 已通过 validateBackup 的备份 data，等用户选合并/覆盖

// JSON 文件落地下载（备份与题集分享共用，V2.4 抽出）：Blob API 零网络请求
function downloadJsonFile(payload, filename) {
  const blob = new Blob([payload], { type: 'application/json;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.append(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}

function doExportBackup() {
  clearBackupImportError();
  try {
    const { payload, filename } = exportBackup(store);
    downloadJsonFile(payload, filename);
    toast(`已导出 ${filename}——收好，这是你数据的唯一副本`);
  } catch (err) {
    showBackupImportError(`导出失败：${err?.message ?? '未知错误'}，请重试`);
  }
}

// replace 模式的清面回调（注入给 ui-core.importBackup）：只删 storage 数据面键
// （V2.3 起五面，含 custom），不碰 guomian:onboarded 等 UI 偏好键。
// 键名同 src/storage 的 KEYS（契约 §9），storage 改键名须同步这里。
function wipeStoreFaces() {
  for (const face of ['profiles', 'sessions', 'entitlements', 'ledger', 'custom']) {
    localStorage.removeItem(`guomian:${face}`);
  }
}

function resetReplaceButton() {
  const btn = $('#btn-import-replace');
  btn.dataset.armed = '';
  btn.textContent = '覆盖导入（清空现有数据）';
}

function showBackupImportError(msg) {
  const el = $('#backup-import-error');
  el.textContent = msg;
  el.hidden = false;
  toast(msg);
}

function clearBackupImportError() {
  const el = $('#backup-import-error');
  el.textContent = '';
  el.hidden = true;
}

function openImportOverlay(data, counts) {
  clearBackupImportError(); // 成功预览不得留下一次失败的陈尸红字
  pendingImportData = data;
  // P2-3（V2.2）：合并导入可能触发 MAX_SESSIONS 修剪（saveSession 挤掉最旧）——
  // 现有＋导入超上限时提前预警。同 id 跳过会让实际写入偏少，这是保守估计。
  const overflow = store.listSessions().length + counts.sessions > MAX_SESSIONS
    ? `（超出上限 ${MAX_SESSIONS} 场，最早的记录将被自动清理）`
    : '';
  $('#import-summary').textContent =
    `将导入 ${counts.sessions} 场面试记录${overflow}、${counts.profiles} 份档案、${counts.ledger} 条台账、${counts.custom} 道自定义题。`
    + '合并会保留现有记录（同一场不重复）；覆盖会先清空本机现有数据。';
  resetReplaceButton();
  $('#import-overlay').hidden = false;
  $('#btn-import-merge').focus();
}

function closeImportOverlay() {
  const overlay = $('#import-overlay');
  if (overlay.hidden) return;
  overlay.hidden = true;
  pendingImportData = null;
  $('#btn-backup-import').focus(); // 焦点归还触发按钮
}

function runImport(mode) {
  if (!pendingImportData) return;
  const { imported } = importBackup(store, pendingImportData, { mode, wipe: wipeStoreFaces });

  // P2-4（V2.2）：replace 清面后，报告页可能还握着被清掉那场的指针——解锁会撞
  // SessionNotFoundError。清指针；报告视图若正显示旧场（防御，导入通常发起自台账页）回台账。
  if (mode === 'replace') {
    state.currentSessionId = null;
    state.currentMeta = null;
    if (!$('#view-report').hidden) showView('ledger');
  }

  closeImportOverlay();
  renderLedger(); // 台账视图立即反映导入结果
  // P2-3：merge 可能触发 MAX_SESSIONS 修剪，报「实际写入数」会骗人——一并报最终存量
  toast(`导入完成：新增 ${imported.sessions} 场记录、${imported.profiles} 份档案、${imported.ledger} 条台账、${imported.custom} 道自定义题`
    + `，本机现有 ${store.listSessions().length} 场`
    + (imported.entitlements ? '，权益已更新' : ''));
}

function initBackup() {
  $('#btn-backup-export').addEventListener('click', doExportBackup);
  $('#btn-backup-import').addEventListener('click', () => $('#backup-file').click());
  $('#backup-file').addEventListener('change', async (e) => {
    const file = e.target.files?.[0];
    e.target.value = ''; // 清掉选择，同一文件可再次触发 change
    if (!file) return;
    let text;
    try {
      text = await file.text();
    } catch {
      showBackupImportError('文件读取失败，请重新选择');
      return;
    }
    const result = validateBackup(text);
    if (!result.ok) {
      showBackupImportError(`无法导入：${result.reason}`);
      return;
    }
    openImportOverlay(result.data, result.counts);
  });
  $('#btn-import-merge').addEventListener('click', () => runImport('merge'));
  // 覆盖是不可逆危险操作：两段式确认——首击只是「上膛」改文案，再击才执行
  $('#btn-import-replace').addEventListener('click', (e) => {
    const btn = e.currentTarget;
    if (btn.dataset.armed === '1') {
      runImport('replace');
      return;
    }
    btn.dataset.armed = '1';
    btn.textContent = '再点一次确认：现有数据将被清空';
  });
  $('#btn-import-cancel').addEventListener('click', closeImportOverlay);
  $('#import-overlay').addEventListener('click', (e) => {
    if (e.target === e.currentTarget) closeImportOverlay(); // 只点背景关，点卡片不关
  });
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') closeImportOverlay();
  });
}

// ---------------- PWA 安装引导（V1.9，判端事实见 docs/上架路线预研.md §1） ----------------
// 三分支：已装（standalone）不出卡；iOS 无 beforeinstallprompt 只能图文引导手动
// 「添加到主屏幕」；Chromium 系捕获 beforeinstallprompt 后由按钮触发原生安装弹窗；
// 其余环境（国产安卓默认浏览器/桌面 Firefox 等）按钮给通用换浏览器说明。

let deferredInstallPrompt = null; // beforeinstallprompt 事件暂存，只由用户点按钮时消费

function isStandaloneDisplay() {
  return window.matchMedia?.('(display-mode: standalone)')?.matches === true
    || window.navigator.standalone === true; // 后者是 iOS Safari 私有属性
}

function isIOSBrowser() {
  const ua = navigator.userAgent;
  // iPadOS 13+ 桌面态 UA 伪装 Macintosh，用触点数辨认
  return /iPhone|iPad|iPod/.test(ua)
    || (ua.includes('Macintosh') && navigator.maxTouchPoints > 1);
}

function openIosInstallOverlay() {
  $('#ios-install-overlay').hidden = false;
  $('#btn-ios-install-close').focus();
}

function closeIosInstallOverlay() {
  const overlay = $('#ios-install-overlay');
  if (overlay.hidden) return;
  overlay.hidden = true;
  $('#btn-install').focus(); // 焦点归还触发按钮
}

function initInstallCard() {
  if (isStandaloneDisplay()) return; // 已安装：卡片保持 hidden

  // 尽早挂监听：Chromium 系满足可安装条件即发事件，拦下暂存、不打断用户
  window.addEventListener('beforeinstallprompt', (e) => {
    e.preventDefault();
    deferredInstallPrompt = e;
  });
  window.addEventListener('appinstalled', () => {
    $('#install-card').hidden = true;
    toast('安装完成，之后可从桌面图标直接打开');
  });

  const card = $('#install-card');
  const desc = $('#install-desc');
  const btn = $('#btn-install');
  card.hidden = false;

  if (isIOSBrowser()) {
    desc.textContent = '把「过面」添加到主屏幕：全屏打开、离线也能练，体验和 App 一样。';
    btn.textContent = '查看添加步骤';
    btn.addEventListener('click', openIosInstallOverlay);
    $('#btn-ios-install-close').addEventListener('click', closeIosInstallOverlay);
    $('#ios-install-overlay').addEventListener('click', (e) => {
      if (e.target === e.currentTarget) closeIosInstallOverlay();
    });
    document.addEventListener('keydown', (e) => {
      if (e.key === 'Escape') closeIosInstallOverlay();
    });
    return;
  }

  desc.textContent = '把「过面」装成独立应用：离线可用、桌面直达（Chrome、Edge 等浏览器支持）。';
  btn.addEventListener('click', async () => {
    if (deferredInstallPrompt) {
      deferredInstallPrompt.prompt(); // 原生安装弹窗
      const choice = await deferredInstallPrompt.userChoice.catch(() => null);
      deferredInstallPrompt = null;
      if (choice?.outcome === 'accepted') $('#install-card').hidden = true;
    } else {
      // 通用说明分支：当前浏览器没发 beforeinstallprompt（国产默认浏览器/不支持环境）
      toast('浏览器暂未提供安装入口（可能已安装过、或刚拒绝过安装提示）——可在浏览器菜单里找「安装应用 / 添加到主屏幕」，或稍后再试');
    }
  });
}

// ---------------- 公测徽标与说明浮层（契约 §10 V1.7） ----------------
// 徽标仅 BETA_FREE 时显示；浮层复用 modal 体系（焦点陷阱由 initModalFocusTrap 统一覆盖），
// 关闭后焦点归还徽标按钮（既有纪律）。

function closeBetaOverlay() {
  const overlay = $('#beta-overlay');
  if (overlay.hidden) return;
  overlay.hidden = true;
  $('#beta-badge').focus(); // 焦点归还触发按钮
}

function initBetaBadge() {
  if (!BETA_FREE) return; // 正式售卖态：徽标保持 hidden，浮层永不打开
  const badge = $('#beta-badge');
  badge.hidden = false;
  badge.addEventListener('click', () => {
    $('#beta-overlay').hidden = false;
    $('#btn-beta-close').focus();
  });
  $('#btn-beta-close').addEventListener('click', closeBetaOverlay);
  $('#beta-overlay').addEventListener('click', (e) => {
    if (e.target === e.currentTarget) closeBetaOverlay(); // 只点背景关，点卡片不关
  });
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') closeBetaOverlay();
  });
}

// ---------------- 首访三步引导浮层 ----------------
// 「看过没看过」是 UI 层偏好，不是业务数据——契约 §9 的 createStore 四面
// （profiles/sessions/entitlements/ledger）都是业务数据面，不为一个布尔标志扩存储契约，
// 直接用 localStorage 裸键；读写失败（隐私模式等）静默降级为每次都弹，可接受。
const ONBOARDED_KEY = 'guomian:onboarded';

// 非 null 表示本次是从「新手引导」入口重看（关闭时焦点归还该按钮、不碰标志位）；
// null 表示首访自动弹出（「开始体验」才落盘标志，关闭后聚焦示例 pill 区）。
let onboardingTrigger = null;

function openOnboarding(trigger = null) {
  onboardingTrigger = trigger;
  $('#onboarding-overlay').hidden = false;
  $('#btn-onboarding-start').focus();
}

// P2-6：只有点「开始体验」（persist=true）才写 onboarded 标志；
// Esc/点背景关闭本次不再弹但不落盘——误触一次不该让引导永不再见。
// 从台账「新手引导」入口重看时无论怎么关都不碰标志位。
function closeOnboarding({ persist = false } = {}) {
  const overlay = $('#onboarding-overlay');
  if (overlay.hidden) return;
  overlay.hidden = true;
  if (persist && onboardingTrigger == null) {
    try {
      localStorage.setItem(ONBOARDED_KEY, '1');
    } catch { /* 写不进就下次再弹，不打断流程 */ }
  }
  if (onboardingTrigger != null) {
    onboardingTrigger.focus(); // 既有纪律：焦点归还触发按钮
  } else {
    // 首访没有「触发按钮」可归还焦点，按引导第一步的动线聚焦到示例 pill 区
    $('#sample-options button')?.focus();
  }
  onboardingTrigger = null;
}

function initOnboarding() {
  $('#btn-onboarding-start').addEventListener('click', () => closeOnboarding({ persist: true }));
  $('#btn-onboarding-open').addEventListener('click', (e) => openOnboarding(e.currentTarget));
  $('#onboarding-overlay').addEventListener('click', (e) => {
    if (e.target === e.currentTarget) closeOnboarding(); // 与隐私浮层同款：只点背景关
  });
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') closeOnboarding();
  });
  let seen = false;
  try {
    seen = localStorage.getItem(ONBOARDED_KEY) === '1';
  } catch { /* 读不了按未看过处理 */ }
  if (!seen) openOnboarding(); // 首访自动弹出：无触发按钮（trigger=null）
}

// ---------------- 初始化 ----------------

function init() {
  pillGroup($('#mode-options'), 'mode', MODE_OPTIONS, 'comprehensive');
  pillGroup(
    $('#style-options'),
    'style',
    listStyles().map((s) => ({ value: s, label: s })),
    listStyles()[0],
  );
  pillGroup(
    $('#rounds-options'),
    'rounds',
    ROUNDS_OPTIONS.map((n) => ({ value: n, label: `${n} 题` })),
    8,
  );
  renderSamplePills();

  $('#btn-start').addEventListener('click', startInterview);
  $('#btn-drill-start').addEventListener('click', startDrill);
  initGongkaoCard();
  $('#btn-submit').addEventListener('click', submitCurrentAnswer);
  $('#btn-early-finish').addEventListener('click', earlyFinish);
  $('#btn-restore-continue').addEventListener('click', continueFromSnapshot);
  $('#btn-restore-discard').addEventListener('click', discardSnapshot);
  $('#btn-copy-md').addEventListener('click', copyMarkdown);
  $('#btn-download-md').addEventListener('click', downloadMarkdown);
  $('#btn-share').addEventListener('click', shareReport);
  // 分享图按钮渐进增强：canvas 可用才放开（不可用保持 HTML 里的 hidden 零痕迹）
  if (canvasSupported()) {
    const shareCardBtn = $('#btn-share-card');
    shareCardBtn.hidden = false;
    shareCardBtn.addEventListener('click', doShareCard);
  }
  for (const tab of document.querySelectorAll('.tabbar .tab')) {
    tab.addEventListener('click', () => showView(tab.dataset.view));
  }
  initModalFocusTrap(); // P2-5：全部浮层共用的 Tab 焦点陷阱，先于任何浮层打开
  initPrivacyOverlay();
  initBetaBadge();
  initCoach();
  initInstallCard();
  initBackup();
  initVoiceInput();
  initCustomQuestions();
  initProfiles();
  $('#disclosure-bar').textContent = `${DISCLOSURE}。`;
  showView('prepare');
  initOnboarding(); // 放在 showView 之后：首访聚焦引导按钮不被视图切换打断

  // PWA：注册失败静默，不影响主流程（file:// 或不支持的环境直接跳过）
  if ('serviceWorker' in navigator) {
    navigator.serviceWorker.register('/sw.js').catch(() => {});
  }
}

init();
