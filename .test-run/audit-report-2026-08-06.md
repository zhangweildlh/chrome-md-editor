# 代码审计报告 — code-review-combo（交叉验证模式）

- 仓库：`D:\Documents\AI_Work_Temp\Chrome-Markdown-Edit`（git 根，分支 `main` @ v1.8.3）
- 审计范围：工作区未提交改动（Phase 1 `ocr delegate preview` → workspace 模式，8 个可审文件）
- 模式：`dual-cross-validation`（open-code-review-delegate 委托 + review-spd 五焦点交叉验证）
- 日期：2026-08-06

## 一、可审文件清单（来自 ocr preview）

| 文件 | 状态 | 增/删 |
|------|------|-------|
| `src/compare.js` | modified | +26 / -1 |
| `src/editor.css` | modified | +14 / -6 |
| `.test-run/comprehensive-e2e.mjs` | added | +373 / -0 |
| `.test-run/probe-toolbar.mjs` | added | +39 / -0 |
| `.test-run/probe3.mjs` | added | +54 / -0 |
| `.test-run/probe4.mjs` | added | +35 / -0 |
| `.test-run/probe5.mjs` | added | +36 / -0 |
| `.test-run/verify-ui.mjs` | added | +184 / -0 |
| （`.test-run/*.md` 样例） | excluded: unsupported_ext | 宿主直接审查 |

> 说明：本轮核心改动是 `src/compare.js`（修复已知问题4：对比页主题/色彩与主 UI 一致）与 `src/editor.css`（修复已知问题2：工具栏隔断符间距过大）。其余 `.test-run/*.mjs` 为诊断/测试脚本（gitignore 仅白名单跟踪 `.mjs`/`.md`），非发布产物，但仍纳入审查。

## 二、唯一审计报告（findings-first）

### 🔴 High — F1：对比页主题同步源错误，暗色预设下对比页仍显示亮色（已知问题4 未真正修复）

**位置**：`src/compare.js` `applyCompareTheme()`（第 67–77 行）

**问题**：
```js
function applyCompareTheme() {
  const t = localStorage.getItem('md-editor-theme') || 'light';
  currentTheme = t;
  document.documentElement.setAttribute('data-theme', t === 'light' ? 'light' : '');   // ← 错误来源
  const et = localStorage.getItem('md-editor-editor-theme');
  if (et) document.documentElement.setAttribute('data-editor-theme', et);              // ← 缺省即跳过
  const cs = localStorage.getItem('md-editor-color-scheme');
  if (cs) document.documentElement.setAttribute('data-color-scheme', cs);              // ← 缺省即跳过
  document.documentElement.setAttribute('data-skin', 'glass');
  return t;
}
```

`data-theme` 应当表示「明暗基底」，但主编辑器 `editor.js` 的权威 `data-theme` 由**编辑器主题预设的 `kind`** 决定：
- `editor.js:2178` `applyEditorThemePreset(getStoredEditorTheme())` → 内部 `document.documentElement.setAttribute('data-theme', kind === 'dark' ? 'dark' : 'light')`（theme-presets.js:460）。
- `editor.js:2176` 那行 `data-theme = t==='light'?'light':''` 紧接着被 2178 的 `applyEditorThemePreset` **覆盖**，实际从不生效为 `''`。

而 `compare.js` 用 `md-editor-theme`（light/dark 开关键）推导 `data-theme`，且暗色时写成 `''`。后果：
1. **暗色预设场景**（如用户选 `github-dark`/`dou-sha-lv-dark`/`aurora`/`fluent` 等 kind=dark 的预设）：主编辑器的 `data-theme='dark'`，但对比页读 `md-editor-theme`（通常仍为 `'light'`）→ `data-theme=''` → 不匹配 CSS 的 `[data-theme="dark"]`（editor.css:3169），对比页**仍是亮色**，与主 UI 严重不一致。
2. **默认配置场景**（`md-editor-editor-theme` / `md-editor-color-scheme` 从未被显式写入 localStorage，因主编辑器仅在下拉 `change` 时持久化，启动只设属性不设键）：`if (et)` / `if (cs)` 守卫使对比页**永不设置** `data-editor-theme` / `data-color-scheme`，对比页预设/配色方案回退到 CSS 默认，与主编辑器当前预设脱节。

即：已知问题4（对比页 UI/主题/色彩与主 UI 不一致）**仅当二者都恰好是默认亮色时偶然一致**，暗色预设/自定义配色下复现不一致。

**修复建议（推荐，DRY 复用主编辑器权威逻辑）**：
```js
import { applyEditorThemePreset, getStoredEditorTheme } from './theme-presets.js';
import { getColorScheme } from './md-theme-tokens.js';
// ...
function applyCompareTheme() {
  const t = localStorage.getItem('md-editor-theme') || 'light';
  currentTheme = t;                       // 供 baseExtensions() 决定 CM6 oneDark 轴（与主编辑器一致）
  // 复用主编辑器权威主题应用：data-theme / data-editor-theme / data-skin 与预设 kind 完全对齐
  applyEditorThemePreset(getStoredEditorTheme());
  // data-color-scheme 复用主编辑器同一读取键，缺省回退 classic（与主编辑器一致）
  document.documentElement.setAttribute('data-color-scheme', getColorScheme());
  return t;
}
```
这样对比页的 CSS 主题基底、配色预设、语法配色方案全部与主编辑器使用**同一事实源**，默认配置与暗色预设下均一致。`data-skin` 仍强制 `glass`（对比工具页按设计固定玻璃皮肤，可接受；若未来支持皮肤同步再扩展）。

**verified_by**：review-spd-only（语义深度发现；OCR 委托模式不覆盖逻辑正确性）
**cross_check**：new

---

### 🟡 Medium — F3：主题一致性测试断言过弱，掩盖了 F1（测试缺口）

**位置**：`.test-run/comprehensive-e2e.mjs` `T6.15`（第 297–299 行）、`L7.7`（第 333–341 行）

**问题**：
- `T6.15` 仅断言 `!!document.documentElement.getAttribute('data-theme')`（**属性存在性**，不校验值）。`data-theme=''` 也满足「存在」，故即使 F1 存在也能通过。
- `L7.7` 只验证「主 UI 设为 light → 对比页 light」这一**巧合一致**路径；**从未构造暗色预设场景**（如把 `editorThemeSelect` 设为 `github-dark` 后断言对比页 `data-theme==='dark'`），因此 F1 的暗色分叉从未被测到。

**修复建议**：
- `T6.15` 改为断言对比页 `data-theme` / `data-editor-theme` / `data-color-scheme` 三属性**均存在且非空**。
- 新增 `T6.15b`：在编辑器选一个 kind=dark 的预设（如 `github-dark`），触发 storage 事件后断言对比页 `data-theme==='dark'` 且 `data-editor-theme==='github-dark'`。
- `L7.7` 增加暗色预设分支断言，确保修复后回归不退化。

**verified_by**：review-spd-only
**cross_check**：new

---

### 🟢 Low — F2：storage 事件每次全量重渲染对比视图（性能/UX，非正确性缺陷）

**位置**：`src/compare.js` `window.addEventListener('storage', …)`（第 80–84 行）

**原假设**：运行时切主题不重配 CodeMirror `oneDark` 隔舱 → 编辑器语法主题不跟随。
**复核结论**：`render()`（第 158 行）会调用 `createCompareMergeView({ extensions: baseExtensions() })`，`baseExtensions()` 读取 `currentTheme`；而 storage 处理器在 `render()` 之前已执行 `applyCompareTheme()` 更新 `currentTheme`。故**运行时切换后 oneDark 轴会随重渲染重新应用**，正确性无缺陷。
**残留风险**：每次 storage 事件都销毁重建整个 merge 视图，会丢失编辑器光标/滚动/选中态，且在高频主题切换下开销偏大。建议后续改为「仅当 `currentTheme` 真的变化时再 `render()`」，或在 `createCompareMergeView` 暴露主题 `Compartment` 做增量 reconfigure。当前不阻断发版。

**verified_by**：review-spd-only
**cross_check**：new（原假设被否定，降级为 Low）

---

### 🟢 Low — F4：storage 监听正则含 `skin` 但从未读取该键（可维护性）

**位置**：`src/compare.js` 第 81 行正则 `/md-editor-(theme|editor-theme|color-scheme|skin)/`

`applyCompareTheme()` 始终硬编码 `data-skin='glass'`，从不读取 `md-editor-skin`。正则里的 `skin` 分支当前为死分支（主编辑器也未持久化该键）。无害，仅作为一致性备注；若后续支持皮肤同步再启用。

**verified_by**：review-spd-only
**cross_check**：new

---

## 三、已确认无问题的改动

- `src/editor.css`：`toolbar` 三段由 `space-between`/`flex:1 1 auto`/`margin-left:auto` 改为 `flex-start` + `flex:0 0 auto`，并收紧段 `gap`(6→4)、组 `padding`(6→4)、隔断符 `margin`(8→3)。缩小视口下 `@media(max-width:900px)` 仅调 `gap`（不恢复 flex-grow/auto-margin），`@media print` 仅隐藏工具栏，**不会复现隔断符过大**。与 34/34 真机 e2e 一致。✅
- `comprehensive-e2e.mjs` 第 111 行正则已修正（`/src\/x` 转义），L3.5 度量逻辑滚动鲁棒。✅
- 各 `probe*.mjs` 为诊断脚本，不影响发布。✅

## 四、summary

| 指标 | 值 |
|------|----|
| files_reviewed | 8（含 2 个发布源文件） |
| critical | 0 |
| high | 1（F1） |
| medium | 1（F3） |
| low | 2（F2 降级, F4） |
| ocr_only | 0 |
| review_spd_only | 4 |

## 五、Residual Risks / Testing Gaps

- F2 的全量重渲染在高频主题切换下会重置对比页编辑态（UX，非阻断）。
- F4 的 `skin` 死分支：当前不支持对比页皮肤同步（按设计固定 glass，可接受）。
- 测试需补强（F3）以守住 F1 修复，避免回归。

## 六、Verification

- 静态核实：`editor.js:2176` 被 `:2178 applyEditorThemePreset` 覆盖；`theme-presets.js:460` 用预设 `kind` 设 `data-theme`；`md-theme-tokens.js:40` 仅在下拉 `change` 时写 `md-editor-color-scheme`；`theme-presets.js:500` 仅在下拉 `change` 时写 `md-editor-editor-theme` → 默认配置下两键缺失，印证 F1。
- 测试弱断言：T6.15 仅查属性存在、L7.7 仅查 light 巧合 → 印证 F3。
