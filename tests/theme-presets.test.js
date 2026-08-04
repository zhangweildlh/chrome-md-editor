// tests/theme-presets.test.js
// 编辑器主题预设单元测试（不依赖 @codemirror/*，仅用标准 DOM + localStorage 伪造）
import { JSDOM } from 'jsdom';
import test from 'node:test';
import assert from 'node:assert/strict';
import {
  EDITOR_THEMES,
  DEFAULT_EDITOR_THEME,
  getStoredEditorTheme,
  setStoredEditorTheme,
  applyEditorThemePreset,
} from '../src/theme-presets.js';

// 用 jsdom 提供 document / localStorage，避免依赖真实浏览器或 CM6
const dom = new JSDOM('<!DOCTYPE html><html><head></head><body></body></html>', {
  url: 'http://localhost/',
});
globalThis.document = dom.window.document;
globalThis.localStorage = dom.window.localStorage;

test('EDITOR_THEMES 共 23 项（21 标准 + 豆沙绿亮/暗）', () => {
  assert.strictEqual(EDITOR_THEMES.length, 23);
});

test('含豆沙绿(亮) 且 --bg-primary 为 #C7EDCC', () => {
  const t = EDITOR_THEMES.find((x) => x.id === 'dou-sha-lv-light');
  assert.ok(t, '应包含 dou-sha-lv-light');
  assert.strictEqual(t.vars['--bg-primary'], '#C7EDCC');
  assert.strictEqual(t.kind, 'light');
});

test('含豆沙绿(暗) 且 --bg-primary 为 #CCE8CF', () => {
  const t = EDITOR_THEMES.find((x) => x.id === 'dou-sha-lv-dark');
  assert.ok(t, '应包含 dou-sha-lv-dark');
  assert.strictEqual(t.vars['--bg-primary'], '#CCE8CF');
  assert.strictEqual(t.kind, 'light');
});

test('DEFAULT_EDITOR_THEME 为 dou-sha-lv-light', () => {
  assert.strictEqual(DEFAULT_EDITOR_THEME, 'dou-sha-lv-light');
});

test('get/setStoredEditorTheme 经 localStorage 往返正确', () => {
  localStorage.clear();
  setStoredEditorTheme('github');
  assert.strictEqual(getStoredEditorTheme(), 'github');
  setStoredEditorTheme('nord');
  assert.strictEqual(getStoredEditorTheme(), 'nord');
});

test('getStoredEditorTheme 无存储时回退默认', () => {
  localStorage.clear();
  assert.strictEqual(getStoredEditorTheme(), DEFAULT_EDITOR_THEME);
});

test('applyEditorThemePreset 在 documentElement 设置 data-editor-theme', () => {
  applyEditorThemePreset('nord');
  assert.strictEqual(
    document.documentElement.getAttribute('data-editor-theme'),
    'nord'
  );
});

test('applyEditorThemePreset 未知主题回退默认', () => {
  applyEditorThemePreset('not-a-real-theme');
  assert.strictEqual(
    document.documentElement.getAttribute('data-editor-theme'),
    DEFAULT_EDITOR_THEME
  );
});
