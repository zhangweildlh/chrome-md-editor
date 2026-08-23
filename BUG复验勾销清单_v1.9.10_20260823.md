# 8 项 BUG/需求 复验与可勾销清单（v1.9.10）

> 复验时间：2026-08-23
> 复验环境：360Chromex 132（CDP 9222 直连 WebSocket 探针） + 源码静态核查 + codebase-memory 影响面分析
> 当前分支：`feat/fix-whitespace-deco-freeze-20260823`
> 修复文件：`src/editor-extensions.js`（#3）、`src/editor.css`（#2）
> 勾销图例：✅ 浏览器侧已坐实并修复 / 🟡 浏览器侧已坐实（无需改或待统一）/ ⏳ EXE(Rust) 侧待用户真机验证（本机无 cargo，无法构建）

---

## #1 编辑/预览页「设置 → 字间距/行间距」需同时作用于编辑栏与预览栏

**结论：✅ 已实现，无需修改**

- 机制：`setEditorLetterSpacing` / `setEditorLineHeight`（`focus-mode.js:83-92`）将 `--editor-letter-spacing` / `--editor-line-height` 写入 `document.documentElement`（即 `:root` 级变量）。
- 作用域：`editor.css` 第 1705-1706 行（编辑栏 `.cm-content` 区）与第 1968-1969 行（预览栏 `.preview` 区）均消费这两个 `:root` 变量 → 两栏天然同步。
- 证据：源码静态核查 + 影响面分析确认两栏共用同一变量源，无隔离。

---

## #2 编辑/预览页「设置 → 按钮间距 → 紧凑/标准/宽松」无效、无反应

**结论：✅ 根因坐实并已修复（本轮核心交付）**

- **根因（单一权威）**：`editor.css` 存在两段同选择器 `.toolbar-group`、同特异性规则：
  - 第 1017-1026 行（密度修复段）：`gap: var(--ui-gap)`
  - 第 1248-1254 行（v1.8.5 工具栏溢出滚动引入的通用重置段）：原 `gap: 4px`
  - CSS 层叠「后定义者胜」，第 1248 段 `gap:4px` 覆盖前者，导致 `setDensity` 写入的 `--ui-gap`（2/4/14px）永远无法落到 `.toolbar-group` 计算 `gap` → 「按钮间距」下拉视觉无变化。
- **修复**：将第 1248 段 `gap: 4px` 改为 `gap: var(--ui-gap)`，使全仓库 `.toolbar-group` 的 `gap` 唯一来源统一为 `var(--ui-gap)`（第 1024、1052 窄屏 `@media`、1253 三处一致）。
- **真机复验（直连 CDP，新目标独立验证，未触碰用户真实标签）**：

  | 档位 | `--ui-gap`(root) | `.toolbar-group` 计算 gap | 预期 | 结果 |
  |------|------|------|------|------|
  | compact | 2px | 2px | 2px | ✅ |
  | standard | 4px | 4px | 4px | ✅ |
  | comfortable | 14px | 14px | 14px | ✅ |

- 三档区分度清晰，下拉切换即时生效。

---

## #3 编辑/预览页「设置 → 显示选项/增强/其他」三栏点击后程序卡死

**结论：✅ 根因坐实并已修复（前序 + 本轮回归复验）**

- **根因（单一权威）**：`src/editor-extensions.js` 的 `buildWhitespaceDecorations` 遍历可见区多行时，`doc.lineAt(line.to)` 对行尾位置 `line.to` 返回**当前行本身**（行尾属于该行），导致 `line`/`lineEnd`/`i` 均不前进 → 无限空转死循环，主线程阻塞，点击「显示空格」(space=1) 等即冻结；重启后概率性打不开插件页亦源于此初始化期死循环。
- **修复**：循环改为 `pos = from` 起、跨行时 `pos = line.to + 1`（越界即终止），行内空格/`tab` 装饰用 `RangeSetBuilder` 正常推进。
- **真机复验（直连 CDP，`space=1` 触发条件下）**：
  - 导航后 `readyState=complete`（此前必超时）
  - 点击「显示空格」(btnInvisSpace) 响应 4ms；「增强」(btnFocusMode) 响应 1ms；「其他」(btnTranslate) 响应 0ms
  - `frozen=false`，无主线程阻塞
- 本轮回归复验一致通过。

---

## #4 EXE 侧 对比/合并页 拖拽 md/.txt 无法在 A/B/C 栏打开

**结论：⏳ EXE(Rust) 侧待用户真机验证**

- 浏览器侧逻辑：拖拽处理在 `compare.js` / `io-bridge.js` 已实现，能解析 md/.txt 并写入 A/B/C 对应 `target`（`io-bridge.js:13` 注释说明 `saveAs` 语义）。
- EXE 侧：Rust 壳需将拖拽事件桥接到前端 `io-bridge`。当前本机无 cargo，无法构建 EXE 真机验证接线是否生效。
- 待用户：在已构建的 EXE 中拖入 md/.txt，确认 A/B/C 栏正确加载。

---

## #5 EXE 侧 对比/合并页「打开文件」按钮无效

**结论：⏳ EXE(Rust) 侧待用户真机验证**

- 浏览器侧：`compare.js` 的「打开文件」按钮调用 `showSaveAsDialog` / 文件选择逻辑（`compare.js:35` 导入 `save-poll.js`），浏览器内可用。
- EXE 侧：Rust 壳的 `openFile` 命令须桥接到前端。待真机确认按钮在 EXE 内可唤起系统文件选择并加载。
- 待用户：在 EXE 中点击「打开文件」，确认文件选择对话框弹出且能加载内容。

---

## #6 EXE 侧「保持文件」弹窗 UI 与编辑/预览页「打开文件」弹窗不一致

**结论：🟡 已坐实根因，待统一（跨浏览器/EXE，非本轮范围）**

- 根因：`save-poll.js` 的 `buildOverlay()`（第 155 行）动态创建**内联** `.save-poll-overlay` / `.save-poll-modal` 自建弹窗体系；而编辑/预览页使用全站 `.modal-overlay` / `.modal-card` 体系（`editor.css:2132` 起）。两者类名、结构、外观（圆角/阴影/按钮样式）均不一致。
- 影响：浏览器侧与 EXE 侧均存在此不一致（前端同套代码）。
- 修复建议：将 `save-poll.js` 的 `buildOverlay` 改为复用全站 `.modal-overlay` / `.modal-card` 类名与结构，统一外观。本轮聚焦 #2/#3，此项列为后续待办。

---

## #7 EXE 侧 合并功能 拖拽 md/.txt 无法在 A/B/C 栏打开

**结论：⏳ EXE(Rust) 侧待用户真机验证（与 #4 同源）**

- 合并功能与对比功能共用同一 `io-bridge` 拖拽/打开管线（`compare.js:683`、`compare.js:1336` 注释「panes 形状对齐 save-poll.js」）。
- 浏览器侧逻辑完整；EXE 侧 Rust 桥接待真机。
- 待用户：在 EXE 合并视图拖入 md/.txt，确认 A/B/C 栏加载。

---

## #8 检查 EXE 侧和浏览器侧各按钮点击有效性

**结论：✅ 浏览器侧已抽样复验有效；EXE 侧待真机**

- 浏览器侧（`#2/#3` 复验中已覆盖核心按钮）：
  - `btnInvisSpace`（显示空格）、`btnFocusMode`（增强/专注）、`btnTranslate`（其他/翻译）点击均即时响应无冻结（见 #3 复验）。
  - `btnDisplaySettings`（设置）→ `dsDensity`（按钮间距）下拉切换生效（见 #2 复验）。
  - 显示选项/增强/其他 三栏按钮绑定齐全（前序静态核查：`editor.js:3442-3462` 各 `btn*` → `applyInvisiblesSettings` / `setDensity` / 专注 / 翻译）。
- EXE 侧：Rust 壳渲染同一前端，按钮绑定同源；但 EXE 特定桥接（菜单、系统对话框）待用户真机点检。

---

## 本轮已落地修改（待提交）

| 文件 | 改动 | 对应项 |
|------|------|------|
| `src/editor-extensions.js` | `buildWhitespaceDecorations` 死循环修复 | #3 |
| `src/editor.css` | 第 1248 段 `.toolbar-group { gap:4px }` → `gap: var(--ui-gap)`（统一唯一来源） | #2 |
| `src/editor.css` | 第 1041-1054 行 `@media(max-width:900px)` 三处 `gap` 硬编码 → `var(--ui-gap)`（前序已改，本轮复核保留） | #2 |

## 待用户后续动作

1. **EXE 真机**：#4/#5/#7 需在已构建 EXE 中验证拖拽/打开文件接线；#8 的 EXE 特定按钮点检。
2. **统一弹窗 UI（#6）**：将 `save-poll.js` 内联弹窗改为复用全站 `.modal-*` 体系，作为独立后续任务。
3. **分支提交/推送**：本轮改动在 `feat/fix-whitespace-deco-freeze-20260823`，未经你显式授权不推送自有 fork(origin)。
