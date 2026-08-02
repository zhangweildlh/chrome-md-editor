# Changelog

All notable changes to this project are documented in this file.

Format based on Keep a Changelog.
Project uses Semantic Versioning.

## [1.4.15] - 2026-08-01 (方案 A：自绘中文查/替面板 + A-4：粘贴为 Markdown + A-5：自动保存与快照环)

### Added
- **自绘中文查找/替换面板（方案 A）**：新增 `src/search-panel.js`，替代 CodeMirror 6 默认英文 `search` 面板，注入官方 `search({ createPanel })` 钩子实现中文查/替界面——保持官方搜索语义（增量搜索、正则、大小写、全词），新增命中位置计数 `X/Y`、全选匹配（`selectMatches`）、替换下一个（`replaceNext`）/替换全部（`replaceAll`）；`src/editor.js` 第 384 行 `search()` 改为 `search({ createPanel: makeSearchPanel })`，`src/editor.css` 新增 `.md-search-panel` 系列样式（复用明暗主题变量）。
- **粘贴为 Markdown（A-4）**：改造 `src/editor.js` 的 `initPasteImageSupport`，采用三分支逻辑——① 图片优先（保留原有截图粘贴并写入 `images/` 或内嵌 data URL）；② 富文本 HTML→Markdown（复用 `src/html-to-markdown.js` 的 `htmlToMarkdown` + `FORMATTING_SELECTOR` 启发式判定，仅当转换结果确实比纯文本多了结构化内容时才拦截，避免破坏纯文本粘贴手感）；③ 其余（纯文本等）放行默认粘贴。
- **自动保存与历史快照环（A-5）**：新增 `src/autosave.js`——编辑停顿（防抖 800ms）将草稿写入 `chrome.storage.local`（`draft::<文件键>`），绝不触碰磁盘 `.md`（真实文件仅在用户 `Ctrl+S` 时写入，规避自动保存覆盖废稿风险）；每 2 分钟或累计 50 次改动压入一份快照，快照环（`snapshots::<文件键>`）最多保留 30 份（`unshift` 头部 + 截断尾部，最新在前）；启动发现比当前文档更新的草稿时弹窗提示恢复（不静默覆盖磁盘）；工具栏新增「快照」按钮（`btnSnapshots`）打开历史版本对话框（`#snapshotsDialog`），可查看并一键回滚任一历史快照（仅还原编辑区，不写磁盘）。`src/editor.js` 在 `docChanged` 触发 `scheduleAutosave()` 并注入 `initAutosave`/`offerDraftRestore`；`src/editor.html` 新增按钮与对话框，`src/editor.css` 新增 `.snapshots-*` 样式（复用明暗主题变量）；新增 `tests/autosave.test.js`（草稿读回、快照环截断到 30、还原编辑区）。

### Changed
- `package.json` / `package-lock.json`：将 `@tauri-apps/api` / `@tauri-apps/plugin-dialog` / `@tauri-apps/plugin-fs` 由 `^2` 精确化为 `^2.11.1` / `^2.7.2` / `^2.5.1`，与桌面版 `main` 既有 Tauri 依赖状态对齐（浏览器侧动态 `import()` 仍受 `__TAURI_INTERNALS__` 守卫，不受影响）。

### Fixed
- **A-5 自动保存键串档（Bug #1，高）**：`initAutosave` 的 `getFileId` 原仅取 `currentFileHandle?.name || 'unsaved'`；而通过 `file://` 打开的 `.md` 文件（内容脚本重定向的主入口）`currentFileHandle` 恒为 `null`，导致所有 `file://` 文件共用 `'unsaved'` 键，不同文件的草稿（`draft::`）与历史快照（`snapshots::`）互相覆盖、互相串档，且启动恢复草稿弹窗会对新打开的文件误报。修复：新增纯函数 `resolveFileKey(handleName, fileName)`（已加回归测试），优先句柄名、回退「已加载文件名」（`updateFilename` 现同步记录 `currentFileName`）、最后 `'unsaved'`；`getFileId` 改用 `resolveFileKey(currentFileHandle?.name, currentFileName)`。
- **方案 A 实时命中计数不刷新（Bug #2，中）**：自绘查/替面板的 `update()` 仅在 `docChanged || selectionSet` 时调用 `renderCount()`，而提交查询（`setSearchQuery`）既不改文档也不改选区，导致用户输入查找词后 `X/Y` 计数长期为空/陈旧，破坏「实时命中计数」功能。修复：`update()` 在检测到 `setSearchQuery` 副作用后立即补调 `renderCount()`。

### Notes
- 功能开发与验证沿用双端兼容临时探针（浏览器侧写 `chrome.storage.local`、EXE 侧写 `probe-<scope>.log`，均追加不覆盖）；每完成一项功能即部署探针、验证、彻底全量回收，本提交**不含任何探针残留**（`node --test` 全量 124 项通过，`vite build` 成功重新生成无探针 `dist/`）。
- `src/editor.js` 同步清理了 `updateListener` 内 Task 1 遗留的空注释诊断死代码（`matched`/`inserted`/`occ` 计算后未使用、整段 `try/catch` 包裹），并移除因此死代码衍生的孤立回归测试 C3（`tests/init-regression.test.js`），代码恢复干净。
- 严格遵循最高优先级约定：**样式工具栏功能（`applyFontStyle` 等）完全保留、未被触碰**。
- 分支：`feat/plan-a-a4`（基于 `main` @ `v1.4.14-desktop`，即 `6404b6a`）。

## [1.4.12] - 2026-08-01 (第一批 A 级可吸纳功能：大纲/代码补全/Callout/专注模式/Base64折叠/Mermaid缩放/任务面板)

### Added
- **文档大纲面板（A-3）**：新增 `src/outline.js`，基于 CodeMirror 6 `syntaxTree` 遍历 ATX 标题节点生成层级大纲；工具栏新增「大纲」按钮（`btnOutline`）打开侧边抽屉（`#outlinePanel` / `#outlineList`），点击条目滚动跳转至对应标题。
- **代码块语言自动补全（A-6）**：新增 `src/codeblock-complete.js`，在 Markdown 代码围栏起始行注入 CodeMirror 补全源，输入 ```` ``` ```` 后提示常用语言（js/ts/py/json/rust/html/css/sql/bash 等），降低代码块语言标注成本；含临时探针 A6_COMPLETE_TRIGGER / A6_COMPLETE_NO_MATCH / A6_COMPLETE_ERR。
- **Callout 标注渲染（A-7）**：新增 `src/callout.js` 作为 markdown-it 插件（`calloutPlugin`），识别 `> [!NOTE]` / `[!TIP]` / `[!WARNING]` 等 GitHub 风格标注语法，转译为带类型配色与图标的 `.callout` 块；`src/html-to-markdown.js` 反向还原时保留 `[!TYPE]` 语法，避免预览回写退化。
- **专注模式 / 打字机模式（A-8）**：新增 `src/focus-mode.js`，提供两种沉浸式编辑体验——专注模式淡出非活动行（`.focus-mode .cm-line`）、打字机模式使当前行垂直居中；工具栏新增「专注」（`btnFocusMode`）、「打字机」（`btnTypewriter`）按钮及状态同步。
- **Base64 内联图片代码折叠（A-9）**：新增 `src/base64-fold.js`，对源码中超长 `![...](data:image/...;base64,...)` 行以 `⛶` 代码折叠装饰隐藏，避免长 base64 撑爆编辑器视图，点击展开/收起。
- **Mermaid 图缩放与全屏（A-10）**：新增 `src/mermaid-zoom.js`，为每个渲染后的 Mermaid 图注入「⛶」按钮，支持 Ctrl/Cmd+滚轮以光标为锚点缩放、重置视图、点击打开全屏浮层（`#mermaid-zoom-overlay`）细看复杂图。
- **任务列表面板（A-12）**：新增 `src/tasklist-panel.js`，扫描源码中 `- [ ]` / `- [x]` 任务项，工具栏「任务」按钮（`btnTasks`）打开侧边抽屉（`#taskListPanel` / `#taskList`），点击复选框直接回写源码切换完成状态。

### Changed
- `src/editor.js`：集成上述 7 模块——导入区补充新模块与 `registerProbeEnvProvider`；Markdown 配置注入代码块语言补全源；扩展数组加入 Base64 折叠；`updateListener` 的 `docChanged` 触发大纲/任务面板防抖刷新（150ms）、`selectionSet` 触发专注模式当前行居中；注册 `calloutPlugin`；预览更新在 Mermaid 渲染后注入缩放增强；`createEditor` 绑定大纲/任务编辑器实例与初始渲染；`init` 注册探针环境快照与显示设置初始化；`bindEvents` 接入专注/打字机/大纲/任务/显示设置（编辑器字号、预览字号、密度）按钮与弹层。
- `src/editor.html`：工具栏新增 `view-tools-group`（专注/打字机/大纲/任务/显示设置按钮 + `#displaySettingsPopover` 弹层），`</main>` 后新增 `#outlinePanel` / `#taskListPanel` 侧边抽屉。
- `src/editor.css`：新增 CSS 变量（`--editor-font-size` / `--preview-font-size` / `--ui-gap`）、专注模式淡化、Base64 折叠、Callout 配色与图标、侧边面板/大纲/任务项、Mermaid 缩放按钮与全屏浮层样式。
- `desktop/src/lib.rs`：新增 `probe_log` Tauri 命令，将探针日志写入 `%TEMP%/md-editor-probe.log`（供 EXE 侧落盘）。

### Fixed
- **预览区编辑三类回写缺陷（BUG-1/2/3）修复**（同源 `src/`，Chrome 扩展与 Tauri EXE 共用）：
  - **BUG-1（多余空行）**：源码为一行一段（段间无空行）时，预览区任一段尾敲回车后，编辑区与预览区不再每段间被插入一空行；多段无空行比对回归通过。`src/html-to-markdown.js` 新增 `collapseSoftBreaks` 折叠连续空行。
  - **BUG-2（跳转文件头）**：预览区任一位置修改字符串后，编辑区与预览区不再自动跳转到文件头部。`src/editor.js` 的 `doUpdatePreview` 与 `setEditorContent` 在预览重建 / 编辑器全量替换后改用 `src/scroll-restore.js` 的 `restoreScroll` 显式恢复重建前滚动位置（含 `requestAnimationFrame` 兜底）；滚动恢复纯逻辑已抽取为可单测模块。
  - **BUG-3（引用空段不同步）**：多段 `>` 引用场景下，预览区删除空段 `>` 时，编辑区现已跟随删除。`src/html-to-markdown.js` 的 blockquote 分支改为按块逐行还原，空块跳过、多段引用不再被折叠合并。
- **配套自动化测试**：新增 `tests/html-to-markdown-bug1-3.test.js`（BUG-1/3 共 8 项，用 markdown-it + linkedom 复现回写机制）与 `tests/scroll-restore.test.js`（BUG-2 滚动恢复 5 项）；`node --test` 全量 110 项通过。

### Notes
- **临时调试探针（覆盖 7 模块 A-3/A-6/A-7/A-8/A-9/A-10/A-12）**：在 `src/probe.js`（增强版）基础上为本次 7 个功能部署遍布式临时探针，满足：① 经 `// ===== PROBE START/END =====` 标记可彻底回收；② 自动捕获 `window.error` / `unhandledrejection` 并采集环境快照（版本/主题/视图模式/是否 Tauri/文档长度/行数/选区/预览滚动/UA）；③ 经「导出探针日志」按钮或 Tauri `probe_log` 命令独立写出 `.log` 文件，内容足以支撑 BUG 定位、分析排查与修复。该探针为临时调试代码，**验证稳定后将随 `src/probe.js` 及 editor.js / html-to-markdown.js / editor.html 中的探针调用整体删除，不计入正式发布**。
- 严格遵循最高优先级约定：**样式工具栏功能（`applyFontStyle` 等）完全保留、未被触碰**。
- 分支：`feat/batch-a-features`（基于 `feat/editor-find-replace-bracket` 尖端 @ `33991ce`，即 `main` @ `5f06e90` 的下游）。

## [1.4.14] - 2026-08-01 (彻底回收临时调试探针，发布干净稳定版)

### Removed
- **完整彻底回收全部临时调试探针**：删除 `src/probe.js` 核心探针模块；移除 `src/editor.js`、`src/editor.html`、`src/html-to-markdown.js`、`src/outline.js`、`src/tasklist-panel.js`、`src/mermaid-zoom.js`、`src/focus-mode.js`、`src/codeblock-complete.js`、`src/callout.js`、`src/base64-fold.js` 中全部 `// ===== PROBE START/END =====` 标记块、裸 `probe()` 调用、`registerProbeEnvProvider` 调用与 `import { ... } from './probe.js'` 引用；移除 `src/editor.html` 的「导出探针日志」按钮及导出脚本；移除 `desktop/src/lib.rs` 的孤儿 `probe_log` Tauri 命令及其注册。代码恢复干净，无任何探针残留（`node --test` 全量 125 项通过，`vite build` 成功重新生成无探针 `dist/`）。

### Notes
- 本次为将 `feat/batch-a-features` 合并入 `main` 前的清理发布。探针系统原为 A 级功能开发与 BUG 定位（BUG-1/2/3/4）的临时调试设施，定位修复后按计划整体回收，不计入正式发布。
- 严格遵循最高优先级约定：**样式工具栏功能（`applyFontStyle` 等）完全保留、未被触碰**。

## [1.4.13] - 2026-08-02 (第二轮修复：预览区体验对齐 + 符号配对 + UI 溢出)

### Fixed
- **中文单/双引号错配对（BUG-4）**：CodeMirror 6 的 `closeBrackets` 把 `brackets` 视为「连续成对字符串」，原配置是普通数组且按相邻两位强行配对，导致 `(` 闭合到 `[`、`“` 闭合到 `` ` ``、`‘` 闭合到 `（` 等完全错乱——表现为输入 `“` 出现 `“`+`` ` `` 而非 `“”`、重复输入出三个字符。改为唯一事实源 `src/close-brackets-config.js` 的 `BRACKET_PAIRS`（开闭显式成对）派生成 `BRACKETS_STR`，由 `editor.js` 仅消费：`()[]{}<> '' "" \`\` “” ‘’ （）`，ASCII 自配对引号以「同字符连续两次」表达。
- **「导出探针日志」按钮无文件落地（BUG-1）**：EXE 端旧实现走 `probe_log` 直接写 `%TEMP%/md-editor-probe.log`，但按钮提示说「下载文件」让用户在下载文件夹找不到文件、误以为未导出。改为「Save 对话框 + write_text_file」流程：用户在系统保存对话框自选位置，回调中把实际保存路径附在成功提示里。`src/probe.js` 在 Tauri 路径走 `import('@tauri-apps/plugin-dialog').save()` + `invoke('write_text_file', { path, content })`，失败回退到扩展端的 Blob 下载。`src/editor.html` 按钮处理改为 `async`，正确展示「已保存到 X / 用户取消 / 失败原因」。
- **显示设置弹窗溢出屏幕（BUG-2）**：`.style-popover` 旧用 `left:0` 锚定到按钮左侧，「显示设置」按钮位于工具栏最右侧时弹窗向左溢出屏幕（截图见 `ScreenShot_2026-08-02_075128_975.jpg`）。CSS 改为 `right:0` 锚到按钮右侧，并加 `max-width: min(280px, calc(100vw - 24px))` 限制最大宽度，同时覆盖颜色/字号/显示设置三个弹层。

### Added
- **预览区符号自动配对（BUG-3）**：编辑器侧有 CodeMirror `closeBrackets`，预览侧（contentEditable HTML）原无此能力，两侧输入体验不一致。新增 `src/auto-pair.js` 提供 `getAutoPairClose(insertedChar, nextChar)` 纯逻辑——输入开符号时返回对应闭符号、nextChar 是字母/数字则跳过（避免中间输入 `foo|` 变 `foo()|`）、nextChar 已是闭符号则跳过（避免重复插入）。`initPreviewEditing` 在 `input` 事件中调用该函数，在光标位置插入闭符号并把光标移回中间。覆盖 ASCII `()[]{}<>` 与中文 `“”‘’（）`。
- **配套自动化测试**：新增 `tests/auto-pair.test.js`（7 项，验证各开符号 + 边界场景）与 `tests/close-brackets-config.test.js`（7 项，验证 BRACKETS_STR 满足 CM6 相邻成对解析约束且旧 BUG-4 错配对不再出现）；`node --test` 全量 125 项通过。

### Notes
- 严格遵循最高优先级约定：**样式工具栏功能（`applyFontStyle` 等）完全保留、未被触碰**。
- BUG-1 修复仍依赖 `tauri_plugin_dialog::init()`（`desktop/src/lib.rs:92` 已注册）与 capability `dialog:allow-save`、`fs:allow-write-text-file`（`desktop/capabilities/default.json` 已含）。`write_text_file` 为项目自定义 Tauri 命令（`desktop/src/lib.rs:66`），未走 `fs:` 权限范围。

## [1.4.11] - 2026-08-01 (测试与调试探针)

### Added
- **单元测试覆盖符号配对纯逻辑**：将 `findPairedBracket` / `findSelfPair` / `bracketMatchMap` 等符号配对纯逻辑抽取至 `src/bracket-utils.js`（行为不变），新增 `tests/bracket-utils.test.js` 覆盖 M1 map 构建、`findPairedBracket` 栈匹配、`findSelfPair` 就近匹配，共 14 项用例全部通过（`node --test`），解耦 CodeMirror 依赖以便纯逻辑验证。

### Fixed
- **`selectedBracketHighlight()` 误调用导致初始化崩溃（critical，预先存在，与探针无关）**：`src/editor.js` 扩展数组中错误地以 `selectedBracketHighlight()`（带括号）方式引用 `ViewPlugin.fromClass(...)` 的返回值。`ViewPlugin.fromClass()` 返回的是扩展实例本身（不可被 `()` 调用），调用它触发 `TypeError: Xet is not a function`，使 `new EditorView(...)` 构造期即崩溃、`init()` 中断。该 bug 自 v1.4.9 引入（`selectedBracketHighlight` 插件加入时即误用），与本次部署的探针毫无关系——即便移除全部探针，应用仍会因该误调用而无法启动。修复：改为 `selectedBracketHighlight`（去掉括号，直接作为扩展使用）。
- **`languageData.of` 配置格式错误导致初始化崩溃（critical，v1.4.10 引入，与探针无关）**：v1.4.10 为修复中文符号自动配对，写入 `EditorState.languageData.of({ closeBrackets: { brackets: [...] } })`，但该格式错误——`languageData` facet 的每个 provider **必须是返回可迭代对象（数组）的函数**（`languageDataAt` 内部对 `provider(state,pos,side)` 的返回值做 `for...of`）。传入普通对象会使 CM 在读取 `closeBrackets` 配置时（`closeBrackets()` 调用 `state.languageDataAt("closeBrackets", pos)`）抛 `TypeError: s is not a function or its return value is not iterable`，同样在 `new EditorView` 构造/首更新期崩溃。该 bug 亦与探针无关。修复：`EditorState.languageData.of((state, pos) => [{ closeBrackets: { brackets: [...] } }])`。
- **探针引发的初始化崩溃（critical，探针代码副作用）**：`src/editor.js` 的 `createEditor` 内 `updateListener` 探针代码中错误地使用**全局变量 `editor`** 读取 `editor.scrollDOM`，而 `editor` 在 `new EditorView(...)` 构造完成后才赋值；CodeMirror 在构造期会**同步触发首次 update**，此时全局 `editor` 仍为 `null`，导致 `editor.scrollDOM` 抛 `TypeError`。修复：探针改用回调参数 `update.view.scrollDOM`；并为整个探针区块包裹 `try/catch`，确保今后探针异常不再中断编辑器初始化。
- **预览 DOM-XSS 风险（medium，预先存在，审计 M1）**：`markdown-it` 以 `html:true` 渲染用户 `.md` 内容后直接 `previewContainer.innerHTML = html`，攻击者可构造含 `<script>`、`onerror=` 等恶意标记的文档触发 DOM-XSS（在 Chrome 扩展 / EXE 中可窃取页面上下文或发起本地文件越权读取）。修复：保留 `html:true`（以维持样式工具栏写入的 `<font>`/`<center>` 标记正常渲染），新增 `sanitizePreviewHtml()` 经 `DOMPurify` 净化后再注入 DOM，并显式放行应用依赖的 `font`/`center` 标记与 `color`/`face`/`size`/`align` 属性；`class`/`id`/`style`/`data-*` 由 DOMPurify 默认策略保留并净化。新增运行时依赖 `dompurify`。

> **根因结论（回应「是否由探针引发」）**：本次构建产物的严重 BUG **并非探针导致**。真正的根因是两个预先存在的 CodeMirror API 误用——`selectedBracketHighlight()` 误调用（v1.4.9）与 `languageData.of` 格式错误（v1.4.10），二者都会在 `new EditorView` 构造期独立致崩，使编辑器实例从未创建，表现为「按键全失效 / 双击 .md 无内容 / 主题切换失效 / 探针无 log」。探针代码仅在 `updateListener` 中额外引入了一处同类崩溃（`editor.scrollDOM`），已一并修复。三者任一存在都会让应用完全不可用；移除探针也无法让应用恢复，必须先修上述两个 API 误用。

### Notes
- **临时调试探针（S1~S4）**：为「查找 / 替换 / 符号配对 / 相同字符串高亮」四个功能在 `src/probe.js` 基础上部署 7 个运行时针点（S1-A/B 查找、S2-A 替换、S3-A/B/C 符号配对、S4-A 相同字符串高亮），经浏览器/EXE 侧复现后由「导出探针日志」按钮下载 `.log` 分析。该探针为临时调试代码，**修复相关 BUG 后将随 `src/probe.js` 及 editor.js / html-to-markdown.js / editor.html 中的探针调用整体删除，不计入正式发布**。
- 样式工具栏最高优先级约定未被触碰。
- 分支：`feat/editor-find-replace-bracket`。

## [1.4.10] - 2026-07-31 (缺陷修复)

### Fixed

- **H1 中文符号自动配对配置无效（核心缺陷）**：v1.4.9 的 `closeBrackets({ brackets })` 传入的配置被忽略（`closeBrackets` 为无参函数，配置经 `EditorState.languageDataAt('closeBrackets')` 读取）。改为通过 `EditorState.languageData.of({ closeBrackets: { brackets: [...] } })` 提供配置，中文引号/全角括号依赖 `closing()` 的「非 ASCII 字符 ch+1」回退（Unicode 连续码点）正确推导闭符号，英文 `()[]{}'"` 与中文符号、反引号均生效。
- **M1 `bracketMatchMap` 构建缺陷**：原 `SELECTED_BRACKET_PAIRS` 奇数长字符串导致末尾反引号 `other=undefined` 且污染 `undefined` 键；英文引号同字符覆盖使 `dir` 仅剩 -1。改为 `PAIR_GROUPS`（开闭不同、中文按左右字符分组）+ `SELF_PAIRS`（英文引号/反引号自身配对，就近匹配），消除污染。
- **反引号选中高亮补全**：将反引号纳入 `SELF_PAIRS`，支持选中单个反引号高亮其就近配对的另一个反引号，满足原始需求。
- **L1 性能优化**：`selectedBracketHighlight` 缓存 `doc.toString()` 结果（`cachedDoc`），`docChanged` 时失效，避免每次光标移动全量重建 O(n)。

### Notes

- 复审报告：`.workbuddy/review-combo-2026-07-31-reaudit-fixed.md`（H1/M1/L1 已修复验证）。
- 样式工具栏最高优先级约定未被触碰。

## [1.4.9] - 2026-07-31

### Added

- **查找 / 替换面板**：显式注册 `@codemirror/search` 的 `search()` 扩展；工具栏新增「查找」按钮（`btnFind`），点击打开 CodeMirror 原生查找/替换面板（查找输入框、上一个/下一个、区分大小写、正则、整词匹配，覆盖 Notepad4 截图全部查找选项）。
- **中文与全角符号自动配对（配置在 v1.4.9 实际无效，已于 v1.4.10 修正）**：原方案通过 `closeBrackets({ brackets })` 传入配置，但 `closeBrackets` 为无参函数、配置经 `languageDataAt` 读取，该调用被忽略，中文符号自动配对在 v1.4.9 并未实际生效（仅英文 `()[]{}'"` 为 CodeMirror 默认配对）。正确实现见 v1.4.10。
- **选中符号高亮配对另一半**：新增 `selectedBracketHighlight` 自定义 `ViewPlugin`（`@codemirror/view` 的 `ViewPlugin.fromClass` + `Decoration.mark`）。当选区恰好落在单个配对符号（含中英文引号/括号/花括号/反引号）上时，自动高亮其对应的另一半，样式为 `.cm-bracket-match-active`（绿色下划 + 半透明背景）。

### Changed

- `src/editor.js` 导入补充 `ViewPlugin`、`Decoration`（来自 `@codemirror/view`）与 `search`、`openSearchPanel`（来自 `@codemirror/search`）；同字符串高亮由内置 `highlightSelectionMatches()` 提供，本次未改动其实现。

### Notes

- 严格遵循最高优先级约定：**样式工具栏功能（`applyFontStyle` 等）完全保留、未被触碰**。
- 分支：`feat/editor-find-replace-bracket`（基于 `main` @ `5f06e90`）。

## [1.4.8] - 2026-07-26 (修复发布，已移除全部探针)

### Fixed

- **双击 .md 无法打开（根因修复）**：`src/desktop-shims.js` 的 FS 垫片守卫原本是
  `if (isTauri && typeof window.showOpenFilePicker === "undefined")`。但 Tauri v2 的
  WebView2 里 `window.showOpenFilePicker` 是**原生函数**（即便在沙箱中不可用），
  导致守卫为 false、整个 FS 垫片（含关键的 `window.__tauriFileHandle` 工厂）从未
  安装，于是 `openFileByPath` 命中 `factory=undefined` 静默 return —— 这正是
  「双击只显示初始界面、无任何提示」的真实根因（v1.4.7 的探针日志已确证：
  `shim:done :: __tauriFileHandle=undefined enteredFsShim=false`）。
  现改为 `if (isTauri)`：在 Tauri 下**无条件**安装 FS 垫片。
- **拖入 .md 无法打开（根因修复）**：原实现用 `listen('tauri://drop')` 监听
  Tauri 原生拖放；该事件在 WebView2 下不可靠、实测从不触发。改为使用稳定的
  `getCurrentWebview().onDragDropEvent()`（Tauri v2 推荐 API），在 `drop` 类型事件
  里取 `payload.paths` 并打开首个 `.md/.markdown/.txt`。
- **移除全部诊断探针**：按约定，BUG 修复后删除 `src/probe.js`、Rust 命令
  `probe_log` 及其注册、以及 `src/editor.js` / `src/desktop-shims.js` 内所有
  `// ===== PROBE START/END =====` 标记块。代码恢复干净。
- **防御性提示**：`openFileByPath` 在 `window.__tauriFileHandle` 仍非函数时改为
  弹出可见错误 toast（不再静默 return），便于日后排查。
- 四个版本字段统一升到 1.4.8；`src/editor.js` 内 `APP_VERSION` 同步到 1.4.8。

### 对 Chrome 扩展的影响

- 零功能影响：`desktop-shims.js` 在扩展环境 `isTauri=false` 仍整体跳过；`__tauriFileHandle`
  仅在 Tauri 下定义；`onDragDropEvent` 仅在 `__TAURI_INTERNALS__` 存在时注册。

## [1.4.7] - 2026-07-26 (诊断构建，含探针，已被 1.4.8 取代)

### Added (诊断用，已在 1.4.8 删除)

- **EXE 运行期诊断探针**：为定位「双击 .md 打不开」「拖入 .md 打不开」根因，临时新增一套全程监测探针（见 `src/probe.js`、`probe_log` 命令、各 `PROBE` 块）。**本版本仅为采集日志，请勿长期使用；所有探针已在 1.4.8 彻底删除。**

### Fixed

- **版本号一致性修复（元数据，不影响功能）**：v1.4.5 把 `package.json` / `desktop/package.json` 升到 1.4.5，但漏改 `public/manifest.json`（扩展 manifest 模板）与 `desktop/tauri.conf.json`（EXE 资源版本），导致扩展 zip 内 manifest 版本停在 1.4.4、EXE 文件属性版本停在 1.4.4。现四个 version 字段统一为 1.4.6/1.4.7。
- 本次修改（`src/editor.js` 顶部 `import './desktop-shims.js'` + 移除 `src/editor.html` 外置 `<script>`）**对 Chrome 扩展零功能影响**：`desktop-shims.js` 在扩展环境里 `window.chrome` 存在（跳过 chrome 垫片）、`isTauri` 为 false（跳过 FS Access 垫片），整模块零副作用；扩展的 `window.showOpenFilePicker` 仍是原生实现。

## [1.4.6] - 2026-07-26 (版本元数据一致性修复)

### Fixed

- **版本号一致性（元数据，不影响功能）**：v1.4.5 把 `package.json` / `desktop/package.json` 升到 1.4.5，但漏改 `public/manifest.json`（扩展 manifest 模板）与 `desktop/tauri.conf.json`（EXE 资源版本），导致扩展 zip 内 manifest 版本停在 1.4.4、EXE 文件属性版本停在 1.4.4。本次把四个 version 字段统一升到 1.4.6。

## [1.4.5] - 2026-07-26

### Fixed

- **根因修复：把 `desktop-shims.js` 真正打进 vite bundle**。上一版修了 `withGlobalTauri` 之后 EXE 仍只显示初始界面、且无任何 toast。定位发现：`src/editor.html` 里 `<script type="module" src="./desktop-shims.js">` 在 vite 构建时被**静默删除**（HTML 中未列入 rollup entry 的外部脚本会被丢弃），导致 `dist/assets/editor.js` 里**完全没有 TFileHandle / showOpenFilePicker 垫片**；`openFileByPath` 内 `window.__tauriFileHandle` 始终为 `undefined`，命中 `if (typeof factory !== 'function') return;` 静默退出 → 双击打开路径整条全静默失败。修复：
  - `src/editor.js` 顶部 `import './desktop-shims.js';`（vite 会把它视为编辑器依赖打包进 bundle）
  - `src/editor.html` 同步移除外置 `<script>` 标签，避免重复执行
  - `src/desktop-shims.js` 自身未改

## [1.4.4] - 2026-07-25

### Added

- 样式工具栏 v1.4.4：重选替换 / 智能取消 / 记忆上次选择（领先代码 c39e3be）
- **桌面端独立 EXE 支持（Tauri）**：
  - 新增 `desktop/` 桌面壳，用 Rust + Tauri 把同一套 Web 源码（`src/`）打包为独立 Windows EXE（nsis `setup.exe` + `.msi`）
  - 新增 `src/desktop-shims.js`：桌面端提供 `chrome` 垫片（会话恢复 / 翻译设置持久化）+ File System Access API polyfill（映射原生文件对话框）；在 Chrome 扩展内自动跳过，对扩展零影响
  - Tauri 窗口入口直接指向 `src/editor.html`（此前经 `src/index.html` 重定向，现已改为直连）
  - `vite.config.js` 增加 index 构建入口；根 `package.json` 增加依赖 `@tauri-apps/api`、`@tauri-apps/plugin-dialog`、`@tauri-apps/plugin-fs`
  - 桌面端支持「双击 .md 文件用 EXE 打开」：把 .md 设为默认程序后，双击文件会以 `EXE "路径.md"` 启动；桌面壳读取该命令行参数，前端初始化时通过 `invoke('get_initial_file')` 取路径并打开，文件读写由 Rust 命令（`read_text_file`/`write_text_file`，`std::fs`，无作用域限制）完成，保存可写回原文件；采用多实例，每次双击启动独立 EXE 实例打开各自文件
- 远端编译：`desktop-build.yml` 在 GitHub `windows-latest` 用 Rust + Tauri 构建 EXE

### Changed

- 将桌面壳合并进 `main`，与领先代码 v1.4.4 同仓同 CI

### CI / 自动化

- 打 `v*` 标签（如 `v1.4.5`、`v1.5.0`）会**同时触发** `ci.yml`（扩展 zip）与 `desktop-build.yml`（EXE），一次打标签自动同时产出扩展和 EXE；构建 100% 在 GitHub 云端，**本地零安装**
- `v1.4.4` 的 EXE 交付物见 Release `v1.4.4-desktop`

### Notes

- EXE 体积约 2.5–3 MB，依赖系统 WebView2 运行时（未打包运行时）
- 未签名版本首次运行会被 Windows SmartScreen 拦截，需手动允许
- 已清理无用分支 `feat/tauri-desktop`（已合入 main）

### Fixed

- **修复双击 .md 用 EXE 打开无效**：原实现依赖前端→Rust 的 `frontend-ready` 事件握手 + Rust→前端的 `open-file` 事件转发，事件未能稳定触发，导致 EXE 只显示初始界面、不打开文件。
  - 改为命令式：前端初始化时直接 `invoke('get_initial_file')` 取启动命令行里的 .md 路径，再用 `openFileByPath` 打开；时序更简单稳定。
  - 文件读写从「Tauri fs 插件（受作用域限制）」改为 **Rust 命令 `read_text_file` / `write_text_file`（`std::fs`，无作用域限制）**，彻底绕开 fs 插件对绝对路径的限制，保存可写回原文件。
  - **移除单实例插件**，改为多实例：每次双击 .md 启动独立 EXE 实例并打开对应文件，避免“已运行时再双击被转发/被拦”的复杂性。
- **双击打开诊断与加固（排查中）**：`openInitialCliFile` 现在把 `invoke` 异常与「未检测到参数时的原始 argv」用 toast 显示出来，便于定位「Windows 文件关联到底有没有把路径传给 EXE」；Rust 侧 `normalize_arg` 兼容外层引号与 `file://` 形式，`get_initial_file` 在解析前先归一化。
- **根因修复：开启 `app.withGlobalTauri`**：`tauri.conf.json` 此前未设置 `withGlobalTauri`，Tauri 不会把 `window.__TAURI_INTERNALS__` 注入 webview。而桌面端全部守卫（`desktop-shims.js` 的 `isTauri` 判定、`editor.js` 的 `openInitialCliFile` 守卫）以及 `@tauri-apps/api` 的 `invoke` 都依赖该全局 → 整个桌面代码路径被静默短路（双击 .md 只显示初始界面、**且连诊断 toast 都不弹**）。现已开启 `withGlobalTauri: true`，并把窗口入口从 `src/index.html`（重定向）直接指向 `src/editor.html`，消除 `location.replace` 跨文档导航可能带来的全局丢失风险。

## [1.4.3] - 2026-07

### Fixed

- 修复打印多页只输出可视区一屏的 BUG（commit 2d9e5b9）

## [1.4.2] - 2026-07-14

### Added

- Reading-time bilingual translation in the preview pane (does not modify Markdown source)
- Toolbar toggle + settings: pick a service preset, paste API Key only
- Default preset: MiniMax Token Plan · Anthropic (`sk-cp-` key, `/anthropic/v1/messages`)
- Dual protocol for MiniMax / StepFun Token Plans (Anthropic Messages + OpenAI-compatible)
- Built-in presets: OpenAI / DeepSeek / Gemini / Groq / Mistral, Kimi / Qwen / 智谱 / 豆包, MiniMax · StepFun, OpenRouter · 硅基流动 · AiHubMix · 302.AI · API2D · CloseAI · Together · Fireworks · OneAPI, DeepL Free/Pro, custom endpoints
- Preset base URLs and model IDs verified via Context7 against official docs (2026-07-13)
- Background service-worker proxy for translation fetch (avoids CORS on `x-api-key` / Anthropic headers)
- Per-segment translation cache and progress status
- Visible build stamp (`v1.4.2`) in the toolbar and page title

### Fixed

- Do not call `chrome.permissions.request` on the translate path (false "未授权" after async gaps)
- MiniMax Anthropic Token Plan calls go through the SW proxy with correct headers

### Notes

- Translation sends document text to the provider you configure; keep that in mind for private docs
- After upgrade, reload the extension at `chrome://extensions` and close old editor tabs

## [1.3.1] - 2026-07-13

### Changed

- Removed the jarring HTML style-preset toolbar (居粗 / 居红 / 字号等); keep the editor chrome calm
- Startup + toolbar **?** open a real short user manual; example file is a full 说明书

### Kept

- Multi-instance tabs, session restore, local images, preview HTML round-trip for people who type tags in Markdown

## [1.3.0] - 2026-07-13

### Added

- Multi-instance editors: each toolbar click / each local `.md` open gets its own tab (`?i=` + per-instance storage keys) — thanks [@zhangweildlh](https://github.com/zhangweildlh) (PR #4 / Issue #3)
- Style toolbar: center/bold/color, highlight, font face/size presets; superscript and subscript
- Session restore: reopen the extension restores last edited content and filename (Issue #2; FileSystemHandle cannot persist, so Save may ask for a path again)
- Richer first-run help tips for common Markdown / HTML snippets

### Fixed

- Preview WYSIWYG round-trip: normalize extra blank lines and preserve `<mark>/<center>/<font>/<span>/<sup>/<sub>` when syncing back to source (helps Issue #1 path/style corruption)
- Local image preview and original `src` preservation remain in place from 1.2.0 (Issue #1)

### Changed

- Extension and package version aligned to **1.3.0**

## [1.2.0] - 2026-07-13

### Added

- Local image preview for relative paths when a folder or `file://` context is available
- Paste image into the editor: writes to sibling `images/` when folder write access exists, otherwise embeds a data URL
- First-run onboarding overlay (drag file / open folder / open example)
- Feedback entry in the status bar linking to GitHub Issues
- Reproducible icon pipeline (`npm run icons`) and Markdown-recognizable toolbar icons
- Unit tests for image path resolution and preview link safety (`npm test`)
- Pack script: `npm run pack` builds and produces `chrome-md-editor-v*.zip` with a nested `dist/` folder

### Fixed

- Preview-pane links open reliably while the preview stays contenteditable for WYSIWYG
- Preserve original Markdown image sources when syncing WYSIWYG preview back to source (avoids writing blob URLs into the document)
- Addresses user report of local images not rendering and path corruption after preview edit (see GitHub Issue #1; please re-test on 1.2.0 before closing)

### Changed

- README quick start and installation guidance oriented around GitHub Releases
- Aligned `package.json` version with `manifest.json` at **1.2.0**

### Notes

- GitHub previously only published **v1.0.0** while `main` already contained the above work. This release closes that distribution gap.
- There was no separate public **v1.1.0** tag. DEVLOG mentions 1.1.0 during content-script work; that stream is included here under 1.2.0.

## [1.0.0] - 2026-02-28

### Added

- Initial Chrome extension (Manifest V3) Markdown editor
- CodeMirror 6 source editing, markdown-it preview, Mermaid diagrams
- WYSIWYG editing in the preview pane
- File System Access open/save and project folder sidebar
- `file://` content script intercept for local `.md` files
- Light/dark themes and split / editor / preview layouts
