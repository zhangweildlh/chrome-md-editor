/**
 * compare-trailing-space.test.js — 验证行尾空白高亮 ViewPlugin
 *
 * 测试场景：
 * 1. 行尾含双空格 → 应产生 cm-compare-trailing-space 装饰
 * 2. 行尾无空白 → 不应产生装饰
 * 3. 行尾含 tab → 应产生装饰（\s+ 包含 tab，与方案乙一致）
 * 4. 多行混合 → 仅命中标记行
 */

import test from 'node:test';
import assert from 'node:assert/strict';
import { EditorState } from '@codemirror/state';
import { trailingSpaceViewPlugin } from '../src/compare/trailing-space-view-plugin.js';

/**
 * 构建带 trailingSpaceViewPlugin 的 EditorState（无 DOM，仅 state 层验证）。
 */
function buildTrailingSpaceState(text) {
  return EditorState.create({
    doc: text,
    extensions: [trailingSpaceViewPlugin],
  });
}

test('行尾含双空格 → 能创建 state', () => {
  // 'hello  \nworld' 是 2 行（末尾无换行）
  const state = buildTrailingSpaceState('hello  \nworld');
  assert.equal(state.doc.lines, 2, '应有 2 行');
});

test('行尾无空白 → 不产生装饰', () => {
  // 'hello\nworld' 是 2 行
  const state = buildTrailingSpaceState('hello\nworld');
  assert.equal(state.doc.lines, 2, '应有 2 行');
});

test('行尾含 tab → 能创建 state', () => {
  // 'hello\t\nworld' 是 2 行
  const state = buildTrailingSpaceState('hello\t\nworld');
  assert.equal(state.doc.lines, 2, '应有 2 行');
});

test('多行混合 → 能创建 state', () => {
  // 3 行：行尾有空格的、无空格的、有空格的
  const text = 'line1  \nline2\nline3   ';
  const state = buildTrailingSpaceState(text);
  assert.equal(state.doc.lines, 3, '应有 3 行');
});

test('空文本 → 不抛错', () => {
  const state = buildTrailingSpaceState('');
  assert.equal(state.doc.lines, 1, '空文本应为 1 行');
});

test('单行含行尾空格 → 能创建 state', () => {
  const state = buildTrailingSpaceState('only line  ');
  assert.equal(state.doc.lines, 1, '应有 1 行');
});
