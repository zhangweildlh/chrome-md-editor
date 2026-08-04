# Chrome-Markdown-Edit × Markra 功能移植 —— 会话交接文档（无缝续作指南）

> 用途：本文件是「markra 功能移植到 Chrome-Markdown-Edit(CME)」任务的**唯一权威交接文档**。任何新接手的 Agent 读完本文件即可无缝续作，无需依赖原始会话。
> 最后更新：2026-08-04 15:30（GMT+8）｜ 交接时状态：**基础设施已就绪、9 个子 Agent 任务尚未实施（因 API 429 限流，2026-08-05 12:04:14 UTC+8 重置后可重试派发）**

---

## 0. 接手速览（先读这节）

**当前进度一句话**：分析文档 ✅ → 分支+标记脚手架 ✅（已提交 `2e769d8`）→ 9 个并行工作树 ✅（已建好、干净）→ 9 个子 Agent 实施 ❌（429 限流未执行）→ 合并/测试/双端校验/说明书 ❌。

**接手后第一步（按序）**：
1. 读本文件第 1-8 节（前因后果 + 现状 + 契约 + 门禁 + 红线）。
2. 切到主工作树 `D:\Documents\AI_Work_Temp\Chrome-Markdown-Edit`（当前分支 `feat/markra-features`），先跑基线：`npm test`（应全绿，v1.6.0 基线）与 `npm run build`（vite 应通过）。
3. 在 9 个工作树 `/d/Documents/AI_Work_Temp/cme-wt/<name>`（分支 `feat/<name>`）上，按第 5 节派发 9 个并行子 Agent（**每个 Agent 一个工作树、只改自己标记之后的代码**）。
4. 若仍遇 429 限流：改为**串行实施**（主 Agent 自己逐任务在对应工作树里实现），顺序见第 5.1 节；或等待限流重置（2026-08-05 12:04:14 UTC+8）后重试并行。
5. 全部实施完 → 第 6 节合并 → 第 7 节验收门禁 → 第 8 节双端校验 → 第 9 节收尾（说明书、记忆、合并回 main 需用户授权）。

**关键目录/文件索引**：
| 项 | 路径 |
|---|---|
| CME 主工作树（功能分支） | `D:\Documents\AI_Work_Temp\Chrome-Markdown-Edit`（分支 `feat/markra-features`） |
| 9 个并行工作树 | `D:\Documents\AI_Work_Temp\cme-wt\{themes,slash,blockdrag,viewmode,workspace-search,syntax,a6stub,toolbar-fix,onboarding}` |
| markra 源码快照（只读参考） | `D:\Documents\Downloads\markra_src\`（23+ 个关键文件） |
| 分析产物（4 份） | `D:\Documents\Downloads\markra_src\Markra功能清单_基于源码.md`、`Markra对标CME_深挖与可行性.md`、`Markra五功能详解.md`、`Markra三功能详解与UI移植.md` |
| 项目记忆 | `D:\Documents\AI_Work_Temp\Chrome-Markdown-Edit\.workbuddy\memory\2026-08-04.md`（本日日志）、`MEMORY.md`（长期项目记忆，含 v1.4.4 样式工具栏铁律等） |

---

## 1. 会话前因后果（时间线）

本任务是围绕**竞品源码移植**展开的连续会话，共 7 个子阶段：

| 阶段 | 做了什么 | 产物/结论 |
|---|---|---|
| 1️⃣ markra 全功能清单 | 用 `gh` 只读分析 `markrahq/markra` @ `v2`（968 文件树 + 23 关键源码精读），**严禁引用 README/文档** | `Markra功能清单_基于源码.md`（10 大类：Tauri2+React+TS monorepo、CM6 编辑器插件体系、AI Agent 工具集、14 厂商、WebDAV/S3 同步、6 格式导出、21 主题、11 语言等） |
| 2️⃣ 三块能力深挖+对标+可行性 | 深挖 markra「编辑器核心/文件与工作区/快捷键与视图」；Explore 子代理映射 CME 现状；逐功能对标 | `Markra对标CME_深挖与可行性.md`：E1 斜杠菜单(改后可用,1-2天)、E2 块拖拽(改后可用,3-5天)、F2 工作区搜索(算法移植,3-4天)、S1 快捷键(改后可用,2-3天)、S2 视图(改后可用,2-3天)；**发现 CME A-6 空桩**（`src/codeblock-complete.js:17-18` 函数体为空） |
| 3️⃣ 三功能详解+UI 移植评估 | 深挖斜杠菜单(状态机+React 浮层+式样)、块拖拽(纯 CM6+内联式样)、Vim(库封装)；核查 markra 式样与 CME 设计令牌**近同名** | `Markra三功能详解与UI移植.md`：斜杠菜单状态机✅改 import 即用、React 浮层❌需原生 JS 重写(~120行)但式样 100% 复刻、块拖拽✅几乎整文件搬、Vim✅加依赖搬；工期：斜杠 2-2.5天/块拖拽 3-4天/Vim 1.5-2天 |
| 4️⃣ 高价值推荐 | 基于对标报告给出精准推荐（P0 修 A-6 → P1 斜杠菜单+快捷键 → P2 Vim+视图 → P3 搜索），并解释为何 markra 分析文件放 `Downloads\markra_src`（独立沙箱防污染 CME） | 推荐实施顺序与分支纪律（新建 feature 分支、--no-ff 合并、node --test 闸门） |
| 5️⃣ Vim 模式详解 | 讲解 Vim 模态编辑 + markra `vim.ts` 实现（`@replit/codemirror-vim` + Compartment 热插拔 + 状态栏提示） | 纯讲解 |
| 6️⃣ 五项功能详解 | 视图扩展(15 元素矩阵)、工作区搜索(算法)、快捷键系统(444 行纯 TS)、githubAlerts/`==高亮==`、21 主题 | `Markra五功能详解.md`（含修正：视图模式实为 **15** 个 UI 元素） |
| 7️⃣ **本阶段（当前）** | 用户下达 12 项实施需求；完成分支+标记脚手架+9 工作树；派发 9 个子 Agent **全部 429 限流失败** | 本交接文档 |

**用户 12 项实施需求（任务 7 的完整范围）**：
1. 实现 **21 种编辑器主题** + 新增两套：豆沙绿(亮) RGB(199,237,204)/#C7EDCC、豆沙绿(暗) RGB(204,232,207)/#CCE8CF。
2. 默认主题改为**豆沙绿(亮)**。
3. 修复窗口非全屏时工具栏按钮/工具显示不全（EXE 侧与浏览器侧均存在）。
4. 实施 **P0 修 A-6 空桩**（`src/codeblock-complete.js`）。
5. 实现 **P1 E1 斜杠菜单**（状态机 + 原生浮层 + 式样）。
6. 实现 **P2 S2 视图扩展**（把 markra 15 元素**裁剪映射**成 CME 实际外壳）。
7. 实现 **P3 F2 工作区搜索**（算法移植）。
8. 完善 CME 现有 **githubAlerts / 高亮扩展语法**。
9. 实现 **块拖拽**（全部 + 内联式样）。
10. 实现「Markra三功能详解与UI移植.md」中**除 Vim 外**的所有功能（即与 5/9 重叠，无额外项）。
11. 检查当前代码所有功能在 **EXE 侧与浏览器侧同步完整实现且有效**，不能一侧有、另一侧无/无效。
12. 在**示例说明书**中添加最新功能的简单介绍和打开/使用方式。
（**全程排除 Vim**：不实现 Vim 相关模式/功能/UI/代码。）

---

## 2. 当前 Git 状态（精确）

```
主工作树：D:\Documents\AI_Work_Temp\Chrome-Markdown-Edit
当前分支：feat/markra-features
HEAD    ：2e769d8 "chore: 为 markra 功能移植添加集成标记脚手架（editor.js/editor.css/editor.html markers）"
基线    ：main = v1.6.0（tag v1.6.0 / d577dc3），工作树干净
```

**9 个并行工作树（全部已建好、HEAD=2e769d8、均未改动）**：

| 工作树路径 | 分支 | 负责功能 |
|---|---|---|
| `D:\Documents\AI_Work_Temp\cme-wt\themes` | `feat/themes` | 需求 1+2：21+2 主题、默认豆沙绿(亮)、主题下拉 |
| `D:\Documents\AI_Work_Temp\cme-wt\slash` | `feat/slash` | 需求 5：斜杠菜单（状态机+原生浮层+式样） |
| `D:\Documents\AI_Work_Temp\cme-wt\blockdrag` | `feat/blockdrag` | 需求 9：块拖拽 |
| `D:\Documents\AI_Work_Temp\cme-wt\viewmode` | `feat/viewmode` | 需求 6：视图扩展（裁剪映射） |
| `D:\Documents\AI_Work_Temp\cme-wt\workspace-search` | `feat/workspace-search` | 需求 7：工作区搜索 |
| `D:\Documents\AI_Work_Temp\cme-wt\syntax` | `feat/syntax` | 需求 8：githubAlerts / `==高亮==` |
| `D:\Documents\AI_Work_Temp\cme-wt\a6stub` | `feat/a6stub` | 需求 4：A-6 空桩 |
| `D:\Documents\AI_Work_Temp\cme-wt\toolbar-fix` | `feat/toolbar-fix` | 需求 3：工具栏非全屏修复 |
| `D:\Documents\AI_Work_Temp\cme-wt\onboarding` | `feat/onboarding` | 需求 12：示例说明书 |

> ⚠️ 工作树内**没有 node_modules**（git worktree 不共享未跟踪依赖）。子 Agent 只能 `node --check` 做语法校验，**不能跑 `node --test`**；完整测试由主 Agent 合并后在主工作树跑（主工作树有 node_modules）。

---

## 3. 已完成：集成标记脚手架（关键资产）

在 `feat/markra-features` 上，于三个共享文件埋入**唯一集成标记**，保证 9 个子 Agent 并行修改同一批文件**互不冲突**（各自只在自己标记之后插入代码）。接手后**务必保留这些标记**。

### 3.1 `src/editor.js`（6 个标记）
| 标记注释 | 位置（以标记所在行描述） | 用途 |
|---|---|---|
| `// === MARKRA_HOOK: SLASH_MENU ===` | 在 `...initBase64Fold(),` 之后、`keymap.of([` 之前（原 405 行区域，4 个扩展标记连续排列） | 斜杠菜单扩展插入点 |
| `// === MARKRA_HOOK: BLOCK_DRAG ===` | 紧接上者之后 | 块拖拽扩展插入点 |
| `// === MARKRA_HOOK: VIEW_MODE ===` | 紧接上者之后 | 视图模式扩展插入点 |
| `// === MARKRA_HOOK: WORKSPACE_SEARCH ===` | 紧接上者之后 | 工作区搜索扩展插入点 |
| `// === MARKRA_HOOK: THEMES ===` | 在 `toggleTheme()` 内 `document.documentElement.setAttribute('data-theme', ...)` 之后（原 1904 行区域） | 主题预设应用调用点 |
| `// === MARKRA_HOOK: INIT ===` | 在 `setViewMode(currentViewMode);` 之后（原 2982 行区域，`init()` 函数内） | 各功能 `initXxx()` 启动挂载点 |

### 3.2 `src/editor.css`（1 个标记块 + 7 个子标记）
位置：`[data-theme="light"]` 基础块结束 `}`（原 85 行）之后。内容：
```css
/* === MARKRA_CSS_HOOKS === 各功能 CSS 插入点（每个 Agent 在其专属标记后追加） */
/* === MARKRA_CSS: THEME_PRESETS === 主题预设：23 套主题 CSS 变量块 */
/* === MARKRA_CSS: SLASH_MENU === 斜杠菜单浮层样式 */
/* === MARKRA_CSS: BLOCK_DRAG === 块拖拽手柄/指示器样式 */
/* === MARKRA_CSS: VIEW_MODE === 视图模式隐藏类 */
/* === MARKRA_CSS: WORKSPACE_SEARCH === 工作区搜索面板样式 */
/* === MARKRA_CSS: SYNTAX === 高亮/Callout 语法样式 */
/* === MARKRA_CSS: TOOLBAR_RESPONSIVE === 工具栏非全屏响应式 */
```

### 3.3 `src/editor.html`（2 个标记）
| 标记注释 | 位置 | 用途 |
|---|---|---|
| `<!-- === MARKRA_HTML: TOOLBAR_BUTTONS === -->` | 主题按钮 `</button>` 之后（原 515 行区域） | 新工具栏按钮/下拉（主题下拉、视图切换、工作区搜索） |
| `<!-- === MARKRA_HTML: PANELS === -->` | 预览面板 `</div>` 之后、`</main>` 之前（原 672 行区域） | 新浮动面板（工作区搜索面板等） |

---

## 4. CME 集成契约（12 条硬约束，所有实现必须遵守）

以下为 Explore 子代理对 CME 的精确架构测绘（file:line 均为实测），违反任一条会导致功能破坏/测试失败/数据丢失：

1. **单一 EditorView**：主编辑器只有一个实例（`src/editor.js:446-452` `new EditorView`）。扩展数组在 `src/editor.js` 的 `const extensions = [ ... ]`（约 367-444 行）。新 CM6 扩展只能插到第 3.1 节对应标记之后。
2. **设置存储**：用户偏好一律 `localStorage`，键前缀 `md-editor-`；**不改动已有键**（`md-editor-theme`/`md-editor-view-mode`/`md-editor-focus-mode`/`md-editor-typewriter` 等）。新增键用 `md-editor-<feature>`。`chrome.storage.local` 仅用于草稿/快照/pendingFile/会话/翻译（`src/autosave.js`、`src/session-restore.js` 等），不要放设置。
3. **样式一律用 CSS 变量**：`src/editor.css` `:root`（4-54 行，暗色默认）与 `[data-theme="light"]`（56-85 行）定义全套 `--bg-primary`/`--bg-secondary`/`--bg-tertiary`/`--bg-toolbar`/`--bg-statusbar`/`--bg-panel-header`/`--bg-hover`/`--bg-active`/`--border-primary`/`--border-subtle`/`--text-primary`/`--text-secondary`/`--text-muted`/`--text-accent`/`--accent`/`--accent-hover`/`--danger`/`--success`/`--warning`/`--shadow-sm/md/lg`/`--radius-*` 等。**禁止硬编码色值**（高亮语义色等极少数例外）。**`data-theme` 暗色态是空字符串**——选择器用 `:root` 兜底，**勿写 `[data-theme="dark"]`**。
4. **多端兼容**：用 `"__TAURI_INTERNALS__" in window` 判定桌面端（`src/desktop-shims.js:16-18`）。只用标准 File System Access API（`showOpenFilePicker`/`showSaveFilePicker`/`showDirectoryPicker`/`createWritable`/`dirHandle.values()`，桌面端有垫片覆盖）。**不要用 `chrome.runtime.sendMessage` 做核心链路**（桌面垫片返回 undefined）。Tauri 专属 API 必须 `await import('@tauri-apps/api/...')` 动态导入（参考 `src/editor.js:1467`），禁止静态 import。
5. **预览回写 WYSIWYG 黄金规则（数据丢失防线）**：预览区是 `contenteditable`，失焦触发 `syncPreviewToEditor` → `htmlToMarkdown` 整体回写。任何把预览区 `<pre><code>` 替换为不可逆 DOM 的操作，必须 (a) 设 `data-md-source` 属性保存原始 Markdown（参考 `src/editor.js:559` mermaid 范式）；(b) 设 `contenteditable="false"`（`:561`）；(c) 在 `src/html-to-markdown.js` 的 `convertNode` 加对应还原分支。**可逆** DOM（纯文本如 `<mark>==高亮==</mark>`）只需保证 `convertNode` 能还原，不需三件套。
6. **DOMPurify 白名单**：`src/editor.js:142-147` `sanitizePreviewHtml` 的 `ADD_TAGS:['font','center']`、`ADD_ATTR:['color','face','size','align']`。新插件若产出新标签/属性（如 `<mark>`、`data-*`），**必须同步加入白名单**，否则被静默剥掉。
7. **严禁触碰 v1.4.4 样式工具栏（最高优先级约定）**：`src/editor.html:163-209`（居中/加粗/高亮/颜色/字号 5 按钮 + 弹窗）、`src/editor.js` `applyFontStyle`（约 1798-1859）与对应绑定（约 2113-2211）。**只能新增按钮，不得改造现有组**；新按钮插在 `TOOLBAR_BUTTONS` 标记后。所有 popover 内交互必须 `mousedown` 时 `e.preventDefault()`（保住 CM6 选区，参考 `:2172`）。
8. **视图切换后必须 `requestAnimationFrame(() => editor.requestMeasure())`**（`src/editor.js:1953` 范式），否则 CM6 尺寸错乱。
9. **文件名/路径渲染防 XSS**：一律 `textContent`，禁止 innerHTML 拼接（参考 `src/editor.js:2652-2665` 已修复的真实漏洞）。
10. **新增 JS 一律经 `editor.js` import**：`src/editor.html` 中禁止新增 `<script src>`（vite 会静默删除，`editor.html:729-731` 注释有警告）。
11. **新模块 = ES Module + 配套测试**：`tests/<模块名>.test.js`（命名与源文件一一对应是本仓库铁律），`node --test` 框架，可用 `linkedom` 模拟 DOM。改动 `editor.js` 的 `init()`/`createEditor()` 后必跑 `tests/init-regression.test.js`；改动预览渲染后必跑 `tests/html-to-markdown-bug1-3.test.js` 与 `tests/mermaid-roundtrip.test.js`（WYSIWYG 数据丢失护栏）；`tests/issue-acceptance.test.js` 是验收测试（`npm run test:issues`）。
12. **既有最佳落点/范式**：A-6 空桩 `src/codeblock-complete.js:17-18`（接线完毕只差实现，不用改 editor.js）；markdown-it 插件在 `src/editor.js` `md.use(calloutPlugin)`（约 180 行）之后追加 `md.use(xxx)`；CM6 扩展在标记后追加 `...initXxx()` 工厂式（参考 `initBase64Fold`）；设置模块范式参考 `src/md-theme-tokens.js`（常量 + get/set/apply 三件套）。

---

## 5. 未完成：9 个子 Agent 任务契约（可直接照抄派发）

> 派发方式：每个任务一个 `general-purpose` 子 Agent，`mode=acceptEdits`，**只在其专属工作树**内工作；命令：`cd /d/Documents/AI_Work_Temp/cme-wt/<name>`。每个 Agent 契约须包含：第 4 节集成契约 + 下表要点 + 「只在自己标记后插入代码，不碰其他标记/区域」+「先读 markra 参考源码再动手」+「`node --check` 语法校验、不跑完整 node --test」+「完成后 `git add -A && git commit -m ...`」+「中文汇报 <300 字」。
> ⚠️ 429 限流（2026-08-05 12:04:14 UTC+8 重置）期间派发会失败；限流时改为主 Agent 串行实现（同样按本表执行）。

### 任务卡片

| # | 工作树/分支 | 需求 | 目标与实现要点 | markra 参考（`D:\Documents\Downloads\markra_src\`） | 标记 | 测试 |
|---|---|---|---|---|---|---|
| T1 | themes / feat/themes | 1+2 | 新建 `src/theme-presets.js`（`EDITOR_THEMES` 23 项：21 标准 + 豆沙绿亮 `dou sha lv light`#C7EDCC + 豆沙绿暗 `dou sha lv dark`#CCE8CF；每项 `{id,label,kind,vars}`，vars 含核心 20 变量；`DEFAULT_EDITOR_THEME='dou sha lv light'`；`applyEditorThemePreset`/`getStoredEditorTheme`/`setStoredEditorTheme`，localStorage 键 `md-editor-editor-theme`）。editor.js：THEMES 标记处调用 `applyEditorThemePreset(getStoredEditorTheme())`；INIT 标记处启动恢复；editor.html TOOLBAR_BUTTONS 后加 `<select id="editorThemeSelect">` 并绑定 change（用 createElement+textContent 防注入）；editor.css THEME_PRESETS 后加 23 段 `[data-editor-theme="<id>"] { ...vars... }`。21 标准主题用知名配色（github/one-dark/nord/catppuccin/solarized/sepia 等），豆沙绿亮 `--bg-primary:#C7EDCC`+深绿文字，豆沙绿暗 `--bg-primary:#CCE8CF`+深色文字，保证对比度 | `packages_app_src_lib_settings_app-settings.ts`（21 主题枚举 266-292 行） | editor.js THEMES + INIT；editor.css THEME_PRESETS；editor.html TOOLBAR_BUTTONS | `tests/theme-presets.test.js`（23 项、含豆沙绿、默认正确） |
| T2 | slash / feat/slash | 5 | 新建 `src/slash-menu.js`：移植 markra 状态机（触发正则 `/^([\t ]*)[/、]([^\s/、]*)$/u`、`/`与`、`均可、代码块内不触发、StateField+StateEffect、Prec.highest keymap ↑↓/Enter/Tab/Esc、typed/virtual、suppressed 防抖）；CME 命令表 8-10 个（标题1-3/粗体/斜体/行内代码/代码块/有序无序列表/引用/表格/分割线/图片/链接），执行前删除 `/query`，可复用 editor.js 的 wrapSelection/insert 或自写 `insertAtCursor`；**原生 JS 浮层**（`.markra-slash-menu` + `.markra-slash-menu-option`，光标锚点 `coordsAtPos` 定位、viewport 边界 margin12/maxHeight320、scrollIntoView、外部 pointerdown 关闭、textContent 防注入）；editor.js SLASH_MENU 标记后加 `markraSlashMenu(),`；editor.css SLASH_MENU 标记后加样式（width240/13px/选项32px/hover 用 `--bg-active`/`--text-accent`/`--shadow-md`） | `packages_editor_src_codemirror_slash-menu.ts`(312行)、`markra_CodeMirrorEditorFloatingMenus.tsx`(React浮层改原生)、`markra_styles.css`(752-768) | editor.js SLASH_MENU；editor.css SLASH_MENU | `tests/slash-menu.test.js`（过滤纯函数 + 触发正则） |
| T3 | blockdrag / feat/blockdrag | 9 | 新建 `src/block-drag.js`：翻译 `markra_block-drag.ts`(823行) 去 TS 类型；`codeMirrorBlockDragPlugin`（ViewPlugin+Decoration.widget 每块首行插 `.cm-markra-block-toolbar`：拖拽点+手柄+add 按钮；HTML5 drag + pointer 事件；源块 `.markra-block-drag-source`、落点 `.markra-block-drop-indicator`、残影）；**内联 `EditorView.theme` 携带式样**（颜色用 CME 变量）；`readCodeMirrorBlockRanges`/`moveCodeMirrorBlock`/`addCodeMirrorBlockBelow` 导出，块解析适配 CME `@codemirror/lang-markdown` 语法树（参考 `src/base64-fold.js`）；editor.js BLOCK_DRAG 标记后加 `codeMirrorBlockDragPlugin(),` | `markra_block-drag.ts`(823行) | editor.js BLOCK_DRAG；editor.css BLOCK_DRAG(如需) | `tests/block-drag.test.js`（块边界解析纯函数） |
| T4 | viewmode / feat/viewmode | 6 | 新建 `src/view-mode.js`：`VIEW_MODE_OPTIONS=['daily','focus','immersive','full']`；**裁剪映射** CME 元素：editorPanel/previewPanel/resizer/toolbar/outlinePanel/taskListPanel/fileSidebar/statusBar；预设 daily/full 全显、focus 隐 sidebar+outline+task+statusbar、immersive 再隐 toolbar；`resolveViewModeChrome`/`applyViewMode`（classList `view-hidden`）/`nextViewMode` 循环/`getStoredViewMode`/`setStoredViewMode`（localStorage **`md-editor-chrome-mode`**，勿用已有 `md-editor-view-mode`）；隐藏含编辑器面板后必须 `requestMeasure()`；editor.js VIEW_MODE 标记加 import、INIT 标记处 `applyViewMode(getStoredViewMode())`；editor.html TOOLBAR_BUTTONS 后加 `<button id="btnChromeMode">⊞</button>` 绑定循环切换；editor.css VIEW_MODE 后加 `.view-hidden{display:none!important}` | `packages_app_src_lib_view-mode.ts`(213行) | editor.js VIEW_MODE + INIT；editor.html TOOLBAR_BUTTONS；editor.css VIEW_MODE | `tests/view-mode.test.js`（矩阵断言 + 循环） |
| T5 | workspace-search / feat/workspace-search | 7 | 新建 `src/workspace-search.js`：移植 search.rs 算法（大小写不敏感：ASCII 预存 toLowerCase、Unicode 原生；多命中；`extractSnippet` max96；行号/列号）；`collectMarkdownFiles(directoryHandle)` 复用 CME `readDirectoryRecursive`（editor.js:2627，可加大 depth）flatten 收集 .md 再 `getFile().text()`；`runWorkspaceSearch(query)` 返回命中列表（可先同步实现，Web Worker 可选不强求）；editor.js WORKSPACE_SEARCH 标记加 import、INIT 标记处 `initWorkspaceSearchPanel()`；editor.html TOOLBAR_BUTTONS 后加 `🔍` 按钮、PANELS 后加搜索面板 modal（input 防抖 200ms + 结果列表，textContent 渲染）；editor.css WORKSPACE_SEARCH 后加样式（复用 `.modal-overlay`/`.modal-card` 范式） | `apps_desktop_src-tauri_src_markdown_files_search.rs`(1103行) | editor.js WORKSPACE_SEARCH + INIT；editor.html TOOLBAR_BUTTONS + PANELS；editor.css WORKSPACE_SEARCH | `tests/workspace-search.test.js`（matchQuery 中文/英文不敏感、snippet、searchInFiles） |
| T6 | syntax / feat/syntax | 8 | ① githubAlerts：核对 `src/callout.js`（16 类型已齐则不重做，只补样式/缺失类型）；② `==高亮==`：新建 `src/highlight-plugin.js`（markdown-it 插件渲染 `==x==`→`<mark>x</mark>`，inline ruler）；editor.js `md.use(calloutPlugin)` 之后加 `md.use(highlightPlugin)`；`sanitizePreviewHtml` 的 ADD_TAGS 加 `'mark'`；**回写闭环**：检查并确保 `src/html-to-markdown.js` `convertNode` 能把 `<mark>` 还原为 `==...==`（若缺失则加分支）；editor.css SYNTAX 后加 `mark{background:#fff3a3;padding:0 2px;border-radius:2px}`（高亮语义色允许直接色值） | `packages_editor_src_codemirror_index.ts`(highlight 部分)、`packages_app_src_lib_settings_app-settings.ts`(373-374) | editor.css SYNTAX（md.use 加在 180 行后） | `tests/syntax-highlight.test.js`（`==x==`→`<mark>`；`htmlToMarkdown('<mark>x</mark>')`→`==x==`） |
| T7 | a6stub / feat/a6stub | 4 | 只改 `src/codeblock-complete.js`：实现 `codeBlockLanguageCompletions(context)`（`context.matchBefore(/```(\w*)$/)` 判围栏语言位、from 跳过 ```、候选来自已有 `languages`(LanguageDescription name/alias) + `ALIASES` 表、返回 CM6 `{from,options}`、无匹配 null）；**不碰其他文件**（挂载点 editor.js:425 已就绪） | — | 无（仅本文件） | `tests/codeblock-complete.test.js`（抽 `buildLanguageCompletions(query)` 纯函数测 py→python 等） |
| T8 | toolbar-fix / feat/toolbar-fix | 3 | 只改 `src/editor.css`：在 TOOLBAR_RESPONSIVE 标记后加响应式修复——工具栏窄宽不截断按钮。优先 `flex-wrap:wrap` 让按钮换行（扩展弹窗窄宽+EXE 窄窗两端通用）；或 `overflow-x:auto`+`flex:0 0 auto`。不动 v1.4.4 样式工具栏按钮组定义本身 | — | editor.css TOOLBAR_RESPONSIVE | 可选弱测试（断言含 flex-wrap/overflow-x） |
| T9 | onboarding / feat/onboarding | 12 | 只改 `src/onboarding.js`：在 `loadExampleFile()` 的 `exampleContent` 模板字符串末尾追加「## 新增功能速览」章节，含 6 点（23 主题+默认豆沙绿亮+工具栏主题下拉；斜杠菜单 `/` 或 `、` 唤起；块拖拽手柄；视图模式 ⊞ 按钮循环；工作区搜索 🔍；`==高亮==` 与 `> [!NOTE]` 提示框） | — | 无（仅本文件） | 可选弱测试（断言含关键词） |

---

## 6. 合并顺序与冲突策略

全部 9 个分支完成后，在**主工作树** `feat/markra-features` 上按序合并（`git merge --no-ff feat/<name>`）：

**推荐顺序（按共享文件标记位置从前往后，冲突最小化）**：
1. 先合并**不碰共享文件**的：`feat/a6stub` → `feat/onboarding`（各自只改独立文件）。
2. 再合并**只碰 editor.css** 的：`feat/toolbar-fix`。
3. 再合并**碰 editor.js/editor.css** 的（按标记从上到下）：`feat/themes`（THEMES/INIT + THEME_PRESETS + TOOLBAR_BUTTONS）→ `feat/slash`（SLASH_MENU）→ `feat/blockdrag`（BLOCK_DRAG）→ `feat/viewmode`（VIEW_MODE + INIT）→ `feat/workspace-search`（WORKSPACE_SEARCH + INIT）→ `feat/syntax`（180 行 md.use + SYNTAX）。
4. 冲突处理：各 Agent 只改自己标记后区域，冲突应极少；若冲突，**手工合并保留两侧代码**（不同标记区域的插入互不覆盖）。**严禁** `git reset --hard`/强推。
5. 合并完 `npm test` + `npm run build`，红则按第 7 节修。

> 注：themes/viewmode/workspace-search 都往 `INIT` 标记加代码——三个分支会在同一标记区冲突。**建议**：让这 3 个 Agent 各自把「启动调用」写在**不同位置**（例如都写进自己模块、由 `bindEvents()` 后统一一处调用），或合并时手工合并这三处 INIT 调用（彼此是不同函数名，冲突为同位置多行插入，手工拼接即可）。若采用串行实施可完全避免。

---

## 7. 验收门禁（必须全绿才算完成）

```bash
cd D:/Documents/AI_Work_Temp/Chrome-Markdown-Edit
npm test                 # node --test 全绿（重点盯 init-regression / html-to-markdown-bug1-3 / mermaid-roundtrip / issue-acceptance）
npm run test:issues      # 验收测试（issue-acceptance）
npm run build            # vite build 通过（新增 HTML 页需在 vite.config.js 注册 input；无新增页则无需）
node --check src/*.js    # 全部新模块语法校验
```

- 若新增独立 HTML 页面：`vite.config.js:16-20` 注册 input + `public/manifest.json` `web_accessible_resources` 加资源（本次**不应**新增页面，全部在 editor.html 内完成）。
- CI 门禁（远端）：`.github/workflows/ci.yml` = `npm ci && node --test && vite build && npm run pack`。

---

## 8. 任务 11：EXE 侧与浏览器侧双端同步校验

CME 是**同一套 Web 源码**跑两端（`src/desktop-shims.js` 顶部 import 安装 FSA/chrome 垫片，`"__TAURI_INTERNALS__" in window` 判定桌面端），因此"功能同步"天然成立的前提是**新功能不引入端侧专属 API**。校验清单：
1. 新模块只用标准 FSA + localStorage + CM6（两端都有）→ 天然同步。
2. grep 新代码无 `chrome.runtime.sendMessage`（桌面垫片返回 undefined）、无静态 `@tauri-apps/api` import（应 `await import()`）、无未垫片 FSA 方法（`queryPermission`/`move`/`getUniqueId` 需补 `desktop-shims.js`）。
3. 工具栏/面板/主题/视图全部是 HTML/CSS，两端同一 DOM，无需分端。
4. 人工/浏览器实测（可用 `/playwright-360chrome` 技能 + 360Chromex `D:/Tools/360Chrome/360chromex.exe`）：浏览器侧逐项点检 9 项功能；EXE 侧（Tauri 桌面构建走远端 CI `desktop-build.yml`，本机无 Rust 只能靠 CI artifact 验证，无法本地跑 EXE 实测）。
5. 输出一份双端功能对照表（功能 × 浏览器侧 ✓/✗ × EXE 侧代码路径 ✓/✗ × 说明）。

---

## 9. 收尾（完成全部功能后）

1. **示例说明书**：T9 已覆盖（onboarding.js）。核对 `btnHelp` → `showOnboarding({force:true, mode:'guide'})` 链路正常。
2. **版本/文档**：升 `package.json` + `public/manifest.json` 版本（单一事实源两端，历史教训：漏升 manifest 会导致版本戳不一致）；更新 `CHANGELOG.md`。
3. **回归**：全量 `npm test` + `npm run build` + 双端对照表。
4. **合并回 main**：`git checkout main && git merge --no-ff feat/markra-features` → 跑 CI → **推送 origin/main 属公开动作，须用户显式授权**（仓库无分支保护可直推，但遵守硬禁令：禁强推/删 main）。
5. **工作树清理**：确认后 `git worktree remove <path>` 清理 9 个工作树；删除 `feat/<name>` 合并后分支。
6. **记忆**：更新 `D:\Documents\AI_Work_Temp\Chrome-Markdown-Edit\.workbuddy\memory\`（日志 + MEMORY.md）。
7. **本次分析资产**：`D:\Documents\Downloads\markra_src\` 为竞品分析沙箱（防污染 CME），可压缩存档备份（`Downloads` 不抗 SyncFolders 清空）。

---

## 10. 红线与风险（最高优先级）

- **禁止**：强推/删除 `origin/main` 或受保护分支；`git reset --hard` 回滚；未经用户授权推送公开仓库。
- **禁止**：破坏 v1.4.4 样式工具栏（新增不改、popover mousedown preventDefault）。
- **禁止**：WYSIWYG 回写丢数据（不可逆 DOM 必须 `data-md-source`+`contenteditable=false`+html-to-markdown 分支）。
- **禁止**：在 `editor.html` 加 `<script src>`（vite 静默删）；硬编码色值；innerHTML 拼文件名。
- **隐私闸门**：任何 `git add`（尤其涉及 `.test-run/`）先 `--dry-run`；push 前 `git diff --name-only origin/main..HEAD | grep -iE "profile|Login Data|Cookies|favdb"` 命中即中止。
- **环境陷阱**：本机无 Docker（禁提）；Python 一律 `uv run`；SyncFolders 会清空其监控目录（重要产物入 git 或备份）；工作树无 node_modules（测试只在主工作树跑）。
- **限流**：子 Agent 派发受 API 429 限制（2026-08-05 12:04:14 UTC+8 重置）；重置前改为串行实施。

---

*本交接文档由主 Agent 于 2026-08-04 撰写，覆盖会话全部前因后果与实施细节。接手 Agent 完成第 0 节「接手第一步」即可无缝续作。*
