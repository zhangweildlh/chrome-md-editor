/**
 * compare-acceptall-conflict.test.js — 批量采纳「冲突块排除」回归断言（H1 → 需求⑩ 演进）
 *
 * 背景（H1）：旧 acceptAllDir('all') 三栏分支曾把 ab 层与 bc 层的【冲突块】都压入同一
 * allChanges 数组。冲突块在 ab 层与 bc 层映射到【同一个 Result 区域】，于是两者区间
 * 重叠，触发下方重叠守卫整轮 return，dispatch 永不执行 —— 冲突文档点「全部」完全无反应，
 * 合并核心功能在冲突文档上失效。修复：ab 层只压【非冲突】块，冲突块由 bc 层覆盖。
 *
 * 演进（需求⑩）：顶部工具栏「◀ 左 / 全部 / 右 ▶」方向选择器已删除，acceptAllDir 整体
 * 移除（compare.js 不再有该函数、compare.html 不再有 btnAcceptLeft/All/Right）。
 * 批量采纳的唯一入口变为「应用非冲突变更」（applyNonConflictingChunks, compare.js:1505），
 * 它在按层拆分前先做全局 !c.conflict 过滤（compare.js:1508）—— H1 不变量以更强形式保留：
 * 任何层都不会推入冲突块；冲突块只留给栏间内联逐块采纳按钮（需求⑧，单块 dispatch 无
 * 批量重叠风险）。
 *
 * 本测试为静态源码断言（与 compare-merge-regression.test.js 同范式）：
 *   1) ⑩ 已落地：compare.js 不再出现 acceptAllDir 调用，compare.html 不再含方向按钮；
 *   2) H1 不变量：applyNonConflictingChunks 在按层拆分前全局过滤 !c.conflict。
 */

import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(__dirname, '..');
const SRC = path.join(root, 'src', 'compare.js');
const HTML = path.join(root, 'src', 'compare.html');

const src = fs.readFileSync(SRC, 'utf8');
const html = fs.readFileSync(HTML, 'utf8');

function stripComments(code) {
  return code
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/(^|[^:])\/\/[^\n]*/g, '$1');
}

const codeOnly = stripComments(src);

// ⑩ 删除验证：acceptAllDir 函数与方向选择器按钮引用均已移除。
test('回归：需求⑩ 已移除 acceptAllDir 与「左/全部/右」方向按钮', () => {
  assert.ok(
    !/acceptAllDir\s*\(/.test(codeOnly),
    'acceptAllDir 应按需求⑩ 整体移除'
  );
  assert.ok(
    !/id="btnAccept(Left|All|Right)"/.test(html),
    'compare.html 不应再含 btnAcceptLeft / btnAcceptAll / btnAcceptRight 按钮元素'
  );
});

// H1 不变量：批量采纳（应用非冲突变更）在按层拆分前全局排除冲突块。
test('回归：批量采纳按层拆分前全局排除冲突块（!c.conflict，H1）', () => {
  // 匹配 applyNonConflictingChunks 的 chunks.filter((c) => !c.conflict)（兼容有无外层括号）
  const re = /chunks\.filter\(\s*\(?\s*c\s*\)?\s*=>\s*!\s*c\.conflict\s*\)/;
  const m = codeOnly.match(re);
  assert.ok(
    m,
    '未找到「全局排除冲突块」的过滤写法（chunks.filter(c => !c.conflict)）；H1 可能复发'
  );
});
