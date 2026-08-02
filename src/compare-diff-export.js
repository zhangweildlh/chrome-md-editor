// compare-diff-export.js
// 导出 diff 报告（T6b / 增量 F）。
//
// 关键事实：presentableDiff(a, b, config) 返回的是「已对齐词边界的 Change[]」（结构化，
// 非字符串）。每个 Change 的 fromA/toA/fromB/toB 均为「文档字符偏移」（不是行号、不是索引），
// 因此渲染层需用 a.slice(fromA, toA) / b.slice(fromB, toB) 提取文本，再按行拆分加 +/- 前缀。
//
// 渲染为 git 风格统一 diff（约 50 行），最后复用 compare-export.js 的 exportResult 写出。

import { presentableDiff } from "@codemirror/merge";
import { exportResult } from "./compare-export.js";

/**
 * 给定文档与字符偏移，返回该偏移所在的 1-based 行号。
 * @param {string} text
 * @param {number} offset
 * @returns {number}
 */
function lineNumberOf(text, offset) {
  let line = 1;
  const max = Math.min(offset, text.length);
  for (let i = 0; i < max; i++) {
    if (text.charCodeAt(i) === 10 /* \n */) line++;
  }
  return line;
}

/**
 * 将文本按行拆分；空文本返回 []，并去掉末尾换行产生的多余空串（保留内容中的真实空行）。
 * @param {string} text
 * @returns {string[]}
 */
function toLines(text) {
  if (text === "") return [];
  const lines = text.split("\n");
  if (lines.length > 0 && lines[lines.length - 1] === "") lines.pop();
  return lines;
}

/**
 * 根据两侧文档生成 git 风格统一 diff 文本。
 * @param {string} a 原始文档（左侧 Yours）
 * @param {string} b 新文档（右侧 Theirs / 合并结果）
 * @param {object} [config] DiffConfig（scanLimit / timeout 等），默认 { scanLimit: 500, timeout: 1500 }
 * @returns {string} 统一 diff 文本（含 @@ 行与 +/- 标记）；无差异时返回空串。
 */
export function buildDiffText(a, b, config) {
  const changes = presentableDiff(a, b, config || { scanLimit: 500, timeout: 1500 });
  if (!changes.length) return "";

  const out = [];
  for (const c of changes) {
    // Change 的偏移是字符位置，而非行号：用 slice 取对应文本段。
    const removed = a.slice(c.fromA, c.toA);
    const added = b.slice(c.fromB, c.toB);
    const oldStart = lineNumberOf(a, c.fromA);
    const newStart = lineNumberOf(b, c.fromB);
    const oldLines = toLines(removed);
    const newLines = toLines(added);
    out.push(`@@ -${oldStart},${oldLines.length} +${newStart},${newLines.length} @@`);
    for (const l of oldLines) out.push(`- ${l}`);
    for (const l of newLines) out.push(`+ ${l}`);
  }
  return out.join("\n") + "\n";
}

/**
 * 导出 diff 报告：生成可读 diff 文本并写出。
 * @param {string} a 原始文档
 * @param {string} b 新文档
 * @param {string} [filename="diff.diff"] 建议文件名
 * @returns {Promise<void>}
 */
export async function exportDiffReport(a, b, filename = "diff.diff") {
  const text = buildDiffText(a, b);
  await exportResult(text, filename);
}
