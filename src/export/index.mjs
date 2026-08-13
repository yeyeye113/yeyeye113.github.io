// src/export/index.mjs — 报告导出模块（V1.1「报告即媒介」：导出文件本身就是传播载体）
// 本模块是契约新增面，接口形状以本头注释为真源（消费契约 §8 的 Report 形状，不改动它）：
//
//   toMarkdown({ report, meta? }) -> string
//     report: 契约 §8 的 Report（{ title, sections:[{heading, body, locked}], shareText }）
//     meta?:  { date?: string, mode?: string, totalScore?: number } — 渲染进头部信息行
//     渲染顺序（披露置顶硬条款）：披露块引用（> 披露句）→ # title → meta 信息行 →
//     逐节「## heading + body」。locked 节只输出占位「（付费解锁后可见）」，正文绝不落入导出。
//
//   toShareText(report) -> string
//     透传 report.shareText，但机检披露句必须落在结尾：结尾缺失（上游漂移/被篡改/非字符串）
//     时兜底追加披露句，不静默信任上游；结尾已在场则原样透传、不重复追加。
//
//   suggestFilename({ meta?, now? }) -> string
//     生成「过面面试报告-YYYYMMDD-<模式>-<分>分.md」；meta 字段经非法字符清洗
//     （\ / : * ? " < > | 与控制符），缺省字段整段省略；日期取 meta.date（清洗后）
//     或由 now（Date | 毫秒时间戳，可注入保证确定性）按本地时区格式化，缺省用当前时间。
//
// 纪律：全部纯函数、零 IO、零依赖、不 import node: 模块——浏览器与 Node 双端可用。
// （允许 import 相对路径 ESM 模块：report 模块本身也是纯 ESM 零依赖，浏览器可直接解析，
//   不违反双端承诺；禁的是 node: 内置模块与第三方包。）
// 诚实边界（docs/计划书.md §3）：披露句为硬条款，置顶与结尾双机检入 test/export.test.mjs。
// 单真源（V1.2 修复 P2-2）：披露句常量唯一真源在 src/report/index.mjs，本模块 import 消费、
// 不得自持第二份字面量（有源码级机检用例守着），防止 report 侧漂移时兜底静默补回旧文本。

import { DISCLOSURE } from '../report/index.mjs';

const LOCKED_PLACEHOLDER = '（付费解锁后可见）';

export function toMarkdown({ report, meta } = {}) {
  const title = String(report?.title ?? '');
  const sections = Array.isArray(report?.sections) ? report.sections : [];

  const lines = [`> ${DISCLOSURE}。`, ''];
  if (title) {
    lines.push(`# ${title}`, '');
  }

  const metaParts = [];
  if (meta?.date != null) metaParts.push(`日期：${meta.date}`);
  if (meta?.mode != null) metaParts.push(`模式：${meta.mode}`);
  if (meta?.totalScore != null) metaParts.push(`总分：${meta.totalScore}/100`);
  if (metaParts.length > 0) {
    lines.push(metaParts.join(' · '), '');
  }

  for (const s of sections) {
    lines.push(`## ${String(s?.heading ?? '')}`, '');
    lines.push(s?.locked ? LOCKED_PLACEHOLDER : String(s?.body ?? ''), '');
  }

  return lines.join('\n').replace(/\n+$/, '\n');
}

export function toShareText(report) {
  const text = typeof report?.shareText === 'string' ? report.shareText.trimEnd() : '';
  // 结尾机检：允许披露句后跟少量收尾标点（如「。」）
  const tail = text.slice(-(DISCLOSURE.length + 2));
  if (tail.includes(DISCLOSURE)) return text;
  return `${text}${DISCLOSURE}。`;
}

// Windows/Web 下载场景的文件名非法字符：\ / : * ? " < > | 与控制符
function sanitizeFilePart(value) {
  return String(value)
    .replace(/[\\/:*?"<>|\u0000-\u001f\u007f]/g, '')
    .trim();
}

function formatDate(now) {
  const d = now instanceof Date ? now : new Date(now ?? Date.now());
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}${m}${day}`;
}

export function suggestFilename({ meta, now } = {}) {
  const date = meta?.date != null ? sanitizeFilePart(meta.date) : formatDate(now);
  const parts = ['过面面试报告', date];
  if (meta?.mode != null) {
    const mode = sanitizeFilePart(meta.mode);
    if (mode) parts.push(mode);
  }
  if (meta?.totalScore != null && Number.isFinite(Number(meta.totalScore))) {
    parts.push(`${Number(meta.totalScore)}分`);
  }
  return `${parts.join('-')}.md`;
}

export { DISCLOSURE };
