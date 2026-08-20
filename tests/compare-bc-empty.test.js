// F4 补测试：B↔C 逐块采纳列的「空态隐藏」判定（bcColumnDisplay）
// 覆盖：无差异块 → display:none 隐藏整列（消除 67px 空白）；有差异块 → 恢复默认（空串）。
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { bcColumnDisplay } from '../src/compare-merge.js';

test('bcColumnDisplay: 无 B↔C 差异块 → 隐藏整列 (display:none)', () => {
  assert.equal(bcColumnDisplay(0), 'none');
});

test('bcColumnDisplay: 有 B↔C 差异块 → 恢复默认 (空串，由 CSS 决定 flex 显示)', () => {
  assert.equal(bcColumnDisplay(1), '');
  assert.equal(bcColumnDisplay(5), '');
});

test('bcColumnDisplay: 负数/undefined 边界按空态处理', () => {
  assert.equal(bcColumnDisplay(-1), 'none');
  assert.equal(bcColumnDisplay(undefined), 'none');
});
