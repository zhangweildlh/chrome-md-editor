/**
 * view-mode.test.js — 需求 6：P2 S2 视图扩展（裁剪映射 CME 外壳）
 *
 * 覆盖纯逻辑：
 *   - VIEW_MODE_OPTIONS 含 4 项
 *   - resolveViewModeChrome('focus') 的隐藏/显示矩阵
 *   - nextViewMode 循环 daily→focus→immersive→full→daily
 *   - getStoredViewMode / setStoredViewMode 用伪造 localStorage 往返
 *
 * 不依赖 CM6；localStorage 用伪造实现，避免污染真实环境。
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import {
  VIEW_MODE_OPTIONS,
  resolveViewModeChrome,
  nextViewMode,
  getStoredViewMode,
  setStoredViewMode,
} from '../src/view-mode.js';

// 伪造 localStorage（仅覆盖本测试作用域）
function installFakeLocalStorage() {
  const store = new Map();
  globalThis.localStorage = {
    getItem: (k) => (store.has(k) ? store.get(k) : null),
    setItem: (k, v) => store.set(k, String(v)),
    removeItem: (k) => store.delete(k),
    clear: () => store.clear(),
  };
  return store;
}

test('VIEW_MODE_OPTIONS 含 4 项', () => {
  assert.deepEqual(VIEW_MODE_OPTIONS, ['daily', 'focus', 'immersive', 'full']);
  assert.equal(VIEW_MODE_OPTIONS.length, 4);
});

test('resolveViewModeChrome("focus") 裁剪矩阵', () => {
  const m = resolveViewModeChrome('focus');
  assert.equal(m.fileSidebar, false);
  assert.equal(m.outlinePanel, false);
  assert.equal(m.taskListPanel, false);
  assert.equal(m.statusBar, false);
  assert.equal(m.editorPanel, true);
  assert.equal(m.previewPanel, true);
  // 保留工具栏与编辑/预览分隔条
  assert.equal(m.toolbar, true);
  assert.equal(m.resizer, true);
});

test('resolveViewModeChrome 未知 mode 回退 daily（全显）', () => {
  const m = resolveViewModeChrome('unknown');
  assert.equal(m.fileSidebar, true);
  assert.equal(m.statusBar, true);
  assert.equal(m.toolbar, true);
});

test('resolveViewModeChrome("immersive") 在 focus 基础上再隐 toolbar', () => {
  const f = resolveViewModeChrome('focus');
  const im = resolveViewModeChrome('immersive');
  assert.equal(im.toolbar, false);
  assert.equal(f.toolbar, true);
  assert.equal(im.fileSidebar, f.fileSidebar);
  assert.equal(im.statusBar, f.statusBar);
});

test('nextViewMode 循环 daily→focus→immersive→full→daily', () => {
  assert.equal(nextViewMode('daily'), 'focus');
  assert.equal(nextViewMode('focus'), 'immersive');
  assert.equal(nextViewMode('immersive'), 'full');
  assert.equal(nextViewMode('full'), 'daily');
});

test('nextViewMode 非法输入回退 daily', () => {
  assert.equal(nextViewMode('nope'), 'daily');
  assert.equal(nextViewMode(undefined), 'daily');
});

test('getStoredViewMode / setStoredViewMode 伪造 localStorage 往返', () => {
  installFakeLocalStorage();
  assert.equal(getStoredViewMode(), 'daily'); // 默认
  setStoredViewMode('immersive');
  assert.equal(getStoredViewMode(), 'immersive');
  setStoredViewMode('focus');
  assert.equal(getStoredViewMode(), 'focus');
});

test('setStoredViewMode 非法值归一到 daily', () => {
  installFakeLocalStorage();
  setStoredViewMode('bogus');
  assert.equal(getStoredViewMode(), 'daily');
});
