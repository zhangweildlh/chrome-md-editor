// tests/theme-presets.test.js
// 编辑器主题预设单元测试（不依赖 @codemirror/*，仅用标准 DOM + localStorage 伪造）
import { parseHTML } from 'linkedom';
import test from 'node:test';
import assert from 'node:assert/strict';
import {
  EDITOR_THEMES,
  DEFAULT_EDITOR_THEME,
  DEFAULT_DARK_EDITOR_THEME,
  getStoredEditorTheme,
  setStoredEditorTheme,
  applyEditorThemePreset,
  getThemeKind,
  getCounterpartTheme,
} from '../src/theme-presets.js';

// 用 linkedom 提供 document（与 syntax-highlight.test.js 一致），并注入内存版
// localStorage，避免依赖未安装的 jsdom / 真实浏览器 / CM6。
const { document } = parseHTML('<!DOCTYPE html><html><head></head><body></body></html>');
globalThis.document = document;

const __store = new Map();
globalThis.localStorage = {
  getItem: (k) => (__store.has(k) ? __store.get(k) : null),
  setItem: (k, v) => __store.set(k, String(v)),
  removeItem: (k) => __store.delete(k),
  clear: () => __store.clear(),
};

test('EDITOR_THEMES 共 27 项（21 标准 + 豆沙绿亮/暗 + 4 套新增皮肤）', () => {
  assert.strictEqual(EDITOR_THEMES.length, 27);
});

test('4 套新增皮肤（glacier/aurora/fluent/macos）均注册且含全部材质键', () => {
  const materialKeys = ['--ambient', '--accent-glow', '--btn-top', '--btn-bot', '--edge'];
  for (const id of ['glacier', 'aurora', 'fluent', 'macos']) {
    const t = EDITOR_THEMES.find((x) => x.id === id);
    assert.ok(t, `应包含 ${id}`);
    assert.ok(t.vars['--bg-primary'], `${id} 应定义 --bg-primary`);
    for (const k of materialKeys) {
      assert.ok(t.vars[k] !== undefined, `${id} 应定义材质键 ${k}`);
    }
  }
});

test('含豆沙绿(亮) 且 --bg-primary 为 #C7EDCC', () => {
  const t = EDITOR_THEMES.find((x) => x.id === 'dou-sha-lv-light');
  assert.ok(t, '应包含 dou-sha-lv-light');
  assert.strictEqual(t.vars['--bg-primary'], '#C7EDCC');
  assert.strictEqual(t.kind, 'light');
});

test('含豆沙绿(暗) 且为深墨绿（重做以强化与亮版的区分度）', () => {
  const t = EDITOR_THEMES.find((x) => x.id === 'dou-sha-lv-dark');
  assert.ok(t, '应包含 dou-sha-lv-dark');
  assert.strictEqual(t.vars['--bg-primary'], '#16271c');
  assert.strictEqual(t.kind, 'dark');
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

// ── 修复 THM-01：明暗对偶切换 ────────────────────────────────
// 旧缺陷：#btnTheme 只翻转独立变量并直接写 data-theme，随后 applyEditorThemePreset
// 用「已存预设的 kind」把 data-theme 覆盖回去，导致明暗按钮对 CSS 变量层完全无效。
// 修复后：明暗切换 = 切换到同族对偶预设，data-theme 随预设 kind 一起翻转。

test('getThemeKind 正确识别每个预设的明暗归属', () => {
  for (const t of EDITOR_THEMES) {
    assert.strictEqual(getThemeKind(t.id), t.kind === 'dark' ? 'dark' : 'light');
  }
});

test('getThemeKind 未知预设视为 light（与 applyEditorThemePreset 兜底一致）', () => {
  assert.strictEqual(getThemeKind('not-a-real-theme'), 'light');
});

test('getCounterpartTheme 在同族明暗之间往返配对', () => {
  const pairs = [
    ['light', 'dark'],
    ['github', 'github-dark'],
    ['one-light', 'one-dark'],
    ['solarized-light', 'solarized-dark'],
    ['catppuccin-latte', 'catppuccin-mocha'],
    ['dou-sha-lv-light', 'dou-sha-lv-dark'],
  ];
  for (const [a, b] of pairs) {
    assert.strictEqual(getCounterpartTheme(a), b, `${a} 的对偶应为 ${b}`);
    assert.strictEqual(getCounterpartTheme(b), a, `${b} 的对偶应为 ${a}`);
  }
});

test('getCounterpartTheme 对无同族配对的预设回退到目标 kind 的默认预设', () => {
  // nord 是暗色且无同族亮色版本 → 回退到默认亮色预设
  assert.strictEqual(getThemeKind('nord'), 'dark');
  assert.strictEqual(getCounterpartTheme('nord'), DEFAULT_EDITOR_THEME);
  // sepia 是亮色且无同族暗色版本 → 回退到默认暗色预设
  assert.strictEqual(getThemeKind('sepia'), 'light');
  assert.strictEqual(getCounterpartTheme('sepia'), DEFAULT_DARK_EDITOR_THEME);
});

test('getCounterpartTheme 的结果必定是已知预设，且 kind 与原预设相反', () => {
  for (const t of EDITOR_THEMES) {
    const next = getCounterpartTheme(t.id);
    assert.ok(
      EDITOR_THEMES.some((x) => x.id === next),
      `${t.id} 的对偶 ${next} 必须是已知预设`
    );
    assert.notStrictEqual(
      getThemeKind(next),
      getThemeKind(t.id),
      `${t.id}(${t.kind}) 的对偶 ${next} 明暗必须相反`
    );
  }
});

test('明暗切换链路：连续两次对偶切换后 data-theme 回到原值', () => {
  localStorage.clear();
  const start = DEFAULT_EDITOR_THEME;
  applyEditorThemePreset(start);
  assert.strictEqual(document.documentElement.getAttribute('data-theme'), 'light');

  const dark = getCounterpartTheme(start);
  applyEditorThemePreset(dark);
  assert.strictEqual(
    document.documentElement.getAttribute('data-theme'),
    'dark',
    '切到对偶暗色预设后 data-theme 必须变为 dark（旧实现在此恒为 light）'
  );

  const back = getCounterpartTheme(dark);
  applyEditorThemePreset(back);
  assert.strictEqual(document.documentElement.getAttribute('data-theme'), 'light');
  assert.strictEqual(back, start, '往返切换应回到起点预设');
});
