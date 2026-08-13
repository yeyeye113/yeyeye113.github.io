// app/app.js — 移动端优先单页应用（接口真源：docs/架构契约.md §12）
// 原生 ESM，直接 import /src/... 真模块；四视图单页切换（准备/面试/报告/台账）。
// 隐私承诺：JD/简历/作答只经 createStore(localStorage) 存本机；apiKey 只存内存变量。

import { parseJD } from '/src/engine/jd/index.mjs';
import { parseResume, matchResume } from '/src/engine/resume/index.mjs';
import { planInterview } from '/src/engine/question/index.mjs';
import { scoreAnswer, scoreSession } from '/src/engine/scoring/index.mjs';
import { createSession } from '/src/session/index.mjs';
import { createLLM } from '/src/llm/index.mjs';
import { getPersona, listStyles } from '/src/prompts/index.mjs';
import { buildReport, DISCLOSURE } from '/src/report/index.mjs';
import { toMarkdown, toShareText, suggestFilename } from '/src/export/index.mjs';
// 契约 §9/§10 消费面：storage 与 monetize 由并行子代理施工，路径按契约写死
import { createStore } from '/src/storage/index.mjs';
import { SKUS, getEntitlements, canUnlock, unlockReport, grantSku, redeemCode, betaUnlock } from '/src/monetize/index.mjs';
// 公测开关（契约 §10 V1.7）：单布尔单真源，正式售卖时只改 src/config 这一处
import { BETA_FREE } from '/src/config/index.mjs';
// 面试锦囊（契约 §14 V1.8）：纯数据方法库由并行子代理施工，按契约形状消费
import { TIPS, listCategories, searchTips, getTipsByCategory, recommendTips } from '/src/coach/index.mjs';
// 示例数据（V1.4 一键填示例）：机检在 test/samples.test.mjs
import { SAMPLES } from '/src/samples/index.mjs';
// 接缝层纯逻辑（契约 §13，V1.3 外移）：机检在 test/ui-core.test.mjs
import {
  MODE_OPTIONS,
  ROUNDS_OPTIONS,
  fmtTime,
  modeLabel,
  sortSessionsByTimeDesc,
  buildReportMeta,
  isReportUnlocked,
  buildLedgerEntry,
  abandonBadgeText,
  buildTrendPoints,
  buildRadarPoints,
  sanitizeLlmConfig,
  entitlementText,
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
  const { center, radius, axes, polygon, gridPolygons } = buildRadarPoints(radar, { size });
  if (axes.length === 0) return '';
  const thin = 'style="fill:none;stroke:var(--line);stroke-width:1"';
  const grid = gridPolygons.map((pts) => `<polygon points="${pts}" ${thin}/>`).join('');
  const spokes = axes
    .map((a) => `<line x1="${center}" y1="${center}" x2="${a.x}" y2="${a.y}" style="stroke:var(--line);stroke-width:1"/>`)
    .join('');
  const data = `<polygon points="${polygon}" style="fill:rgba(201,162,39,0.22);stroke:var(--gold);stroke-width:2;stroke-linejoin:round"/>`;
  const dots = axes
    .map((a) => `<circle cx="${a.valueX}" cy="${a.valueY}" r="2.5" style="fill:var(--gold)"/>`)
    .join('');
  const labels = axes
    .map((a) => {
      // label 沿轴向外推 12px；锚点按轴在左/右/正上下取 end/start/middle
      const dx = a.x - center;
      const dy = a.y - center;
      const len = Math.hypot(dx, dy) || 1;
      const lx = (a.x + (dx / len) * 12).toFixed(1);
      const ly = (a.y + (dy / len) * 12 + 4).toFixed(1);
      const anchor = Math.abs(dx) < 8 ? 'middle' : (dx > 0 ? 'start' : 'end');
      return `<text x="${lx}" y="${ly}" text-anchor="${anchor}" style="fill:var(--text-dim);font-size:11px">${a.label}</text>`;
    })
    .join('');
  return `<svg viewBox="-50 -10 ${size + 100} ${size + 20}" role="img" aria-label="最近一场五维评分雷达图" preserveAspectRatio="xMidYMid meet">`
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
  currentMeta: null,      // 导出用元信息 { date, mode, totalScore }（src/export 消费）
  currentClosing: null,   // 面试官收尾台词（报告页顶部寄语行，V1.6 P3-3）
  currentWeakDims: null,  // 本场评分弱维度 key 数组（锦囊推荐联动，V1.8）
  currentSessionId: null, // 对应 storage 里的会话 id（解锁用）
  unlockedIds: new Set(), // 本次会话内已解锁的报告 id（storage 侧标记的兜底）
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
  for (const view of document.querySelectorAll('.view')) {
    view.hidden = view.id !== `view-${name}`;
  }
  for (const tab of document.querySelectorAll('.tabbar .tab')) {
    tab.classList.toggle('active', tab.dataset.view === name);
  }
  if (name === 'ledger') renderLedger();
  if (name === 'report') renderReportView();
  if (name === 'coach') renderCoach();
  if (name === 'interview') {
    $('#interview-empty').hidden = Boolean(state.session);
    $('#interview-main').hidden = !state.session;
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

function updateProgress() {
  const total = state.plan ? state.plan.questions.length : 0;
  $('#progress-text').textContent = `第 ${state.qIndex}/共 ${total} 题`;
  $('#progress-fill').style.width = total > 0 ? `${(state.qIndex / total) * 100}%` : '0%';
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

// ---------------- ① 准备页：开始面试 ----------------

function startInterview() {
  const jdText = $('#jd-input').value.trim();
  const resumeText = $('#resume-input').value.trim();
  if (!jdText) {
    toast('先把目标岗位 JD 贴进来，面试官才知道怎么考你');
    return;
  }

  try {
    doStartInterview(jdText, resumeText);
  } catch (err) {
    toast(`开始面试失败：${err?.message ?? '未知错误'}，请重试`);
  }
}

function doStartInterview(jdText, resumeText) {
  const jd = parseJD(jdText);
  const resume = resumeText ? parseResume(resumeText) : null;
  const match = resume ? matchResume(jd, resume) : null;
  const mode = selectedValue('mode');
  const rounds = Number(selectedValue('rounds'));
  const style = selectedValue('style');

  const plan = planInterview({
    jd,
    resume: resume ?? undefined,
    match: match ?? undefined,
    mode,
    rounds,
    seed: Date.now(),
  });
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
  updateProgress();
}

function setComposerBusy(busy) {
  $('#btn-submit').disabled = busy;
  $('#btn-early-finish').disabled = busy;
  $('#answer-input').disabled = busy;
}

async function submitCurrentAnswer() {
  const input = $('#answer-input');
  const text = input.value.trim();
  if (!text) {
    toast('先写点回答再提交吧——真实面试可没有空着不答这一项');
    return;
  }
  const myBubble = addBubble('me', text);
  input.value = '';
  setComposerBusy(true);
  showTyping();
  try {
    const { followup } = await state.session.submitAnswer(text);
    hideTyping();
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
    toast(`提交失败：${err?.message ?? '未知错误'}，回答已放回输入框，请重试`);
  } finally {
    hideTyping();
    setComposerBusy(false);
    if (state.session && !state.finishing) input.focus();
  }
}

// 提前交卷（契约 §5 V1.2）：session.abandon() 丢弃未答题、只按已答题计分
function earlyFinish() {
  if (!state.session || state.finishing) return;
  setComposerBusy(true);
  try {
    concludeInterview({ early: true });
  } catch (err) {
    toast(`交卷失败：${err?.message ?? '未知错误'}，请重试`);
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
  state.currentMeta = buildReportMeta({ result: { ...result, savedAt }, mode: state.plan.mode });
  state.currentClosing = state.persona.closingLine;
  state.currentWeakDims = result.sessionScore?.weakest ?? null;
  state.currentSessionId = record?.id ?? null;
  state.session = null;
  state.plan = null;
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

function doUnlock() {
  // P2-4 兜底：会话没存下来（无 sessionId）时不把内部错误形状抛给用户
  if (state.currentSessionId == null) {
    toast('本场会话未能保存到本机，无法解锁——清理存储空间后再打一场即可正常解锁');
    return;
  }
  try {
    unlockReport({ store, sessionId: state.currentSessionId });
    if (state.currentSessionId != null) state.unlockedIds.add(state.currentSessionId);
    renderReportView();
    toast('已解锁完整报告');
  } catch (err) {
    if (err && err.name === 'NoCreditError') {
      toast('暂无可用权益：先点一个「模拟购买」或输入体验码');
    } else {
      toast(`解锁失败：${err?.message ?? '未知错误'}`);
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
        renderReportView();
        toast('已解锁完整报告（公测期免费）');
      } catch (err) {
        toast(`解锁失败：${err?.message ?? '未知错误'}，请重试`);
      }
    });
    card.append(freeBtn);
    const anchor = document.createElement('p');
    anchor.className = 'hint price-anchor';
    // 价格锚点：¥19.9 数字真源是 src/monetize 的 SKUS.single（契约 §10），
    // 全前端只此一处写死展示值，改价时与 SKUS 同步
    anchor.textContent = '正式版定价 ¥19.9/场 · 公测期间全部免费';
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
  redeemBtn.addEventListener('click', () => {
    const code = codeInput.value.trim();
    if (!code) {
      toast('先输入体验码');
      return;
    }
    try {
      redeemCode(store, code);
      doUnlock();
    } catch (err) {
      toast(`兑换失败：${err?.message ?? '体验码无效'}`);
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

async function copyToClipboard(text, okMsg) {
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
    toast(ok ? okMsg : '复制失败，请手动长按报告文本复制');
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
}

function shareReport() {
  if (!state.currentReport) return;
  copyToClipboard(toShareText(state.currentReport), '分享文本已复制到剪贴板（含披露句）');
}

// ---------------- ④ 台账页 ----------------

function openSavedReport(rec) {
  if (!rec || !rec.report) {
    toast('这条记录没有存下报告，无法回看');
    return;
  }
  state.currentReport = rec.report;
  state.currentMeta = buildReportMeta({ result: rec, mode: rec?.mode });
  state.currentClosing = typeof rec.closingLine === 'string' ? rec.closingLine : null;
  state.currentWeakDims = rec?.sessionScore?.weakest ?? null;
  state.currentSessionId = rec.id ?? null;
  showView('report');
}

function renderLedger() {
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
  $('#privacy-overlay').addEventListener('click', (e) => {
    if (e.target === e.currentTarget) closePrivacyOverlay(); // 只点背景关，点卡片不关
  });
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') closePrivacyOverlay();
  });
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
  $('#btn-submit').addEventListener('click', submitCurrentAnswer);
  $('#btn-early-finish').addEventListener('click', earlyFinish);
  $('#btn-copy-md').addEventListener('click', copyMarkdown);
  $('#btn-download-md').addEventListener('click', downloadMarkdown);
  $('#btn-share').addEventListener('click', shareReport);
  for (const tab of document.querySelectorAll('.tabbar .tab')) {
    tab.addEventListener('click', () => showView(tab.dataset.view));
  }
  initModalFocusTrap(); // P2-5：全部浮层共用的 Tab 焦点陷阱，先于任何浮层打开
  initPrivacyOverlay();
  initBetaBadge();
  initCoach();
  $('#disclosure-bar').textContent = `${DISCLOSURE}。`;
  showView('prepare');
  initOnboarding(); // 放在 showView 之后：首访聚焦引导按钮不被视图切换打断

  // PWA：注册失败静默，不影响主流程（file:// 或不支持的环境直接跳过）
  if ('serviceWorker' in navigator) {
    navigator.serviceWorker.register('/sw.js').catch(() => {});
  }
}

init();
