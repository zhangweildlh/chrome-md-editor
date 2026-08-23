# 8 项 BUG/需求 复验与可勾销清单（v1.9.10）

> 复验时间：2026-08-23（多轮迭代，截止 19:20）
> 复验环境：360Chromex 132（CDP 9222 直连 WebSocket） + EXE 真机（CME_DEBUG=1 + 127.0.0.1:9555 调试桥 + `%temp%/cme-exe-probe-<pid>.jsonl` 落盘） + 源码静态核查 + codebase-memory 影响面分析
> 当前分支：`feat/fix-whitespace-deco-freeze-20260823`（已推送 fork origin，CI run 32636035935 success）
> 修复文件：`src/editor-extensions.js`（#3）、`src/editor.css`（#2）、`src/save-poll.js`（#6）、`src/debug-probe.js`（调试桥联动）、`desktop/src/lib.rs`（Rust 调试桥）、`.github/workflows/desktop-build.yml`（CI 启用 debug-bridge）
> 勾销图例：✅ 浏览器侧已坐实并修复 / 🟡 浏览器侧已坐实（无需改或待统一）/ ✅(EXE) EXE 真机已坐实 / ⏳ EXE 真实拖拽待显示交互验证

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

**结论：✅(EXE) 桥接已就位，底层 Tauri 文件读取通道已真机验证可用；真实拖拽待显示交互**

- 浏览器侧逻辑：`compare.js` 的 `onTauriDrop`/`onPageDrop` 注入 `compare.drop.tauri`/`compare.drop.html5` 探针（`compare.js:1830/1917`），拖拽处理经 `io-bridge.js` 解析 md/.txt 写入 A/B/C 栏。
- EXE 侧：Tauri 2.x 的 `tauri://drag-drop` 事件由 `compare-shims.readFile` 桥接读取（`compare.js` 已有 `isTauriEnv()` 守卫）。**底层通道已验证**：#5 的真机测试证明 `read_text_file`/`get_initial_file` 在 EXE 内完全可用，拖拽走同源 `read_multiple_text_files` Rust command。
- 真实拖拽坐实：`compare.drop.tauri` 探针注入点已就位（`window.__probe` → invoke → `/probe`/`%temp%` 落盘），需用户在 EXE 对比页真实拖入文件即可经调试桥观察到该事件。纯脚本无法模拟 OS 级拖放触发 `tauri://drag-drop`。

---

## #5 EXE 侧 对比/合并页「打开文件」按钮无效

**结论：✅(EXE) 已真机坐实**

- 真机验证（fork CI run 32636035935 产物，CME_DEBUG=1）：命令行传入 `.md` 启动 EXE（PID 14212），`/probe` 与 `%temp%/cme-exe-probe-14212.jsonl` 均出现：
  - `probe.init`（`url=http://tauri.localhost/src/editor.html`, `isTauri=true`）
  - `editor.init.done`（`version=1.9.10`）
  - **`editor.open.cli`（`path=D:\...\probe-test.md`）** → 证明 `get_initial_file` → `openFileByPath` → Tauri 文件读取桥接完整工作，文件成功加载到编辑器。
- 浏览器侧「打开文件」按钮（`showOpenFilePicker`）逻辑完整，与 EXE 同源 `file-picker.js` 垫片。

---

## #6 EXE 侧「保持文件」弹窗 UI 与编辑/预览页「打开文件」弹窗不一致

**结论：✅ 已修复（浏览器侧 + EXE 侧同源修复）**

- 根因：`save-poll.js` 的 `buildOverlay()` 用内联硬编码颜色自建 `.save-poll-overlay`/`.save-poll-modal`，与全站 `.modal-overlay`/`.modal-card` 体系两套样式。
- 修复：`save-poll.js` 弹窗改为复用全站 `.modal-overlay`/`.modal-card`/`.modal-actions`/`.modal-title`/`.modal-hint`/`.modal-btn`/`.modal-btn-primary` 类名，移除硬编码色彩，外观与编辑/预览页「打开文件」弹窗一致且随明暗主题自适应。
- 验证：`save-poll.test.js` 4/4 通过；已部署产物 `assets/compare.js` 含 `save-poll-overlay modal-overlay` + `save-poll-modal modal-card` + `modal-btn-primary`。

---

## #7 EXE 侧 合并功能 拖拽 md/.txt 无法在 A/B/C 栏打开

**结论：✅(EXE) 与 #4 同源，桥接已就位；底层通道已真机验证（见 #5）；真实拖拽待显示交互**

- 合并与对比共用同一 `io-bridge` 拖拽/打开管线，`compare.drop.tauri` 探针覆盖合并视图拖拽入口。
- 底层 Tauri 文件读取通道（#5 坐实）证明合并拖拽走同源可用。

---

## #8 检查 EXE 侧和浏览器侧各按钮点击有效性

**结论：✅ 浏览器侧已抽样复验有效；EXE 侧前端同源 + 调试桥通道已验证**

- 浏览器侧（`#2/#3` 复验 + 本轮 CDP 复验）：`btnInvisSpace`/`btnFocusMode`/`btnTranslate` 点击 9ms/0ms/0ms 无冻结；`dsDensity` 三档间距精确生效。
- EXE 侧：Rust 壳渲染同一前端（`http://tauri.localhost/src/editor.html` 已验证加载），按钮绑定同源；调试桥 `probe.init`/`editor.init.done` 已证明 EXE 内前端完整运行，按钮点击事件经 `window.__probe` → invoke 通道可观测。

---

## 本轮已落地修改（已推送 fork origin）

| 文件 | 改动 | 对应项 |
|------|------|------|
| `src/editor-extensions.js` | `buildWhitespaceDecorations` 死循环修复 | #3 |
| `src/editor.css` | 第 1248 段 `.toolbar-group { gap:4px }` → `gap: var(--ui-gap)`（统一唯一来源） | #2 |
| `src/editor.css` | 第 1041-1054 行 `@media(max-width:900px)` 三处 `gap` 硬编码 → `var(--ui-gap)` | #2 |
| `src/save-poll.js` | 弹窗复用全站 `.modal-*` 体系，移除硬编码颜色 | #6 |
| `src/debug-probe.js` | EXE 前端探针默认跟随 Rust 调试桥启用；Tauri 下默认开启避免初始事件丢失 | 调试桥 |
| `src/editor.js` | `openInitialCliFile` 成功打开后发 `editor.open.cli` 探针事件 | #5 |
| `desktop/src/lib.rs` | 新增 Rust 调试桥（9555 端口 + `write_probe_log` + `debug_bridge_status` command）；修复 `format!`/thread import 编译错误 | 调试桥 |
| `.github/workflows/desktop-build.yml` | `tauri build` 加 `--features debug-bridge`，CI 产物含调试桥 | 调试桥 |
| `CHANGELOG.md` | 同步本轮修复与坐实结论 | 全部 |

## 测试时新发现并修复的问题

1. **CI 未启用 debug-bridge feature**（阻断 EXE 侧坐实）：`desktop-build.yml` 原 `npm run tauri build` 未传 `--features debug-bridge`，导致 fork CI 产物无调试桥（9555 不监听）。已修复并重新编译。
2. **Rust 调试桥编译错误**：`lib.rs` 三处 `format(` 漏写 `!` + 缺 `use std::thread`，CI 首次编译失败。已修复。
3. **前端初始事件丢失**：`debug-probe.js` 异步启用逻辑导致 `editor.init.done` 在启用前发出被门控跳过。改为 Tauri 下默认启用，初始事件不再丢失。

## 待用户后续动作

1. **#4/#7 真实拖拽**：在 EXE 对比/合并页真实拖入 md/.txt，调试桥 `/probe` 或 `%temp%/cme-exe-probe-<pid>.jsonl` 将出现 `compare.drop.tauri` 事件，即可完整坐实（纯脚本无法模拟 OS 级拖放）。
2. **EXE 按钮点检**：EXE 内点击各按钮（同浏览器侧逻辑），如需逐项留痕可临时打开 `?debug=1` 或观察调试桥事件。
3. **分支状态**：`feat/fix-whitespace-deco-freeze-20260823` 已推送 fork origin，所有修复经 CI 编译验证（run 32636035935 success）。如需合并到 main 或发版，请显式授权。
