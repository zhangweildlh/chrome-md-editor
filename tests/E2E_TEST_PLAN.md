# Chrome-Markdown-Edit (CME) v1.7.0 全覆盖测试方案

> 本文档是**任务 5（360chrome 真机测试）的执行契约**，也是**任务 7-8（code-review-combo 审计）的验收口径**。
> 目标：对 CME 全部功能做「多场景全覆盖 + 多边界条件全覆盖」测试，挖掘真实 BUG 并二次复测/复现。

## 0. 版本与基线
- 版本：`v1.7.0`（已合并 `feat/markra-features`，含 markra 移植 6 大功能 + 既有样式工具栏 + 预览/对比能力）。
- 形态：浏览器扩展（360Chrome 开发者模式，安装路径 `D:\Tools\360Chrome\Chrome-Markdown-Edit`）+ 桌面端 EXE（Tauri v2）。本方案以**扩展端**为主测试对象，双端差异见 §6。

## 1. 测试环境
- 浏览器：360Chrome（360Chromex 内核），开发者模式加载解压的扩展产物（经 `vite build` 的 `dist/`，或源码经 `npm run dev`）。
- 用户数据隔离：Playwright 测试生成的浏览器 profile 落入 `.test-run/`（`.gitignore` 已设「默认拒绝 + 白名单」，profile 数据**绝不入库**）。
- **隐私闸门（铁律）**：任何涉及 `.test-run/` 的 `git add` 必须先 `git add --dry-run` 逐行核对；push 前 `git diff --name-only origin/main..HEAD | grep -iE "profile|Login Data|Cookies|favdb"` 命中即中止。
- 测试夹具（fixtures）：空文件 / 小文件 / 大文件(>5MB) / 含 BOM / GBK 编码 / 含 mermaid / 含 `==高亮==` / 含表格 / 含数学公式 / 含图片相对路径 / 含嵌套列表 / 含任务列表 / 非 md（.txt/.csv） / 含非法 HTML。

## 2. 缺陷严重级定义
| 级 | 名称 | 判据 |
|----|------|------|
| S1 | 致命 | 崩溃 / 数据丢失 / 隐私泄露 / 无法启动 / 不可逆删除 |
| S2 | 严重 | 核心功能不可用（编辑、预览、保存、对比失效） |
| S3 | 一般 | 功能可用但结果错误 / 错位 / 明显性能劣化 |
| S4 | 轻微 | 文案、样式、易用性瑕疵（含缺少引导提示） |

## 3. 测试矩阵（功能 × 场景 × 边界）

### A. 启动与基础
- A1 首次启动：无本地存储 → 正常初始化，默认视图=日常，默认主题=豆沙绿。
- A2 二次启动：携带本地存储 → 还原上次视图模式、主题、最近文档。
- A3 引导(onboarding)：点帮助 → 显示「新增功能速览」（6 大功能）；`showOnboarding({force:true})` 链路（`src/onboarding.js`）。
- A4 右键菜单：扩展图标右键出现「打开对比合并」（`public/background.js`）。
- B-边界：localStorage 不可用（用 `addInitScript` shim 使 `chrome.storage.local` 抛错）→ 启动不崩溃，降级可用（已知 360Chrome 限制，见环境陷阱记忆）。

### B. 编辑核心
- B1 输入/删除/换行正常。
- B2 撤销/重做：连续编辑后逐步撤销、重做正确。
- B3 选择与多光标：Shift 选择、Alt+Click 多光标。
- B4 缩进：Tab/Shift+Tab、列表自动续行。
- B5 查找替换：弹窗查找、区分大小写、正则、全部替换。
- B6 自动保存：编辑后延迟写入本地存储；刷新后内容还原。
- B-边界：超长行(>10000 字符)、空文档、仅空白字符、连续撤销到起点、撤销后再输入。

### C. 预览渲染
- C1 实时渲染：输入 Markdown 即时更新预览。
- C2 滚动同步：编辑/预览滚动联动。
- C3 mermaid：```mermaid 代码块渲染为图；**回写范式** — 失焦后源码不被删除（`data-md-source` 机制，回归 `tests/mermaid-roundtrip.test.js`）。
- C4 `==高亮==`：渲染为 `<mark>`，round-trip 还原为 `==...==`（非 `<mark>` 字面）。
- C5 表格 / 代码块 / 数学公式 / 任务列表 / 脚注 / 图片相对路径。
- C-边界：超大文档预览卡顿；含非法 HTML 的 XSS 转义；代码块内 `<script>` 不执行；mermaid 语法错误显示错误而非崩溃；预览区 `contenteditable` 误编辑导致整体覆盖（C-01 历史 BUG 回归）。

### D. 主题（23 套）
- D1 切换 23 套主题，UI 即时变化。
- D2 豆沙绿为默认；切换后持久化（刷新保持）。
- D3 编辑器主题 select（`#editorThemeSelect`）可选并生效。
- D-边界：主题列表为空/渲染失败回退默认；未知主题名回退豆沙绿；切换极快连点不残留脏样式。

### E. 斜杠菜单（slash-menu）
- E1 行首 `/` 触发菜单；输入过滤；Enter 插入块。
- E2 光标在代码块内输入 `/` → 不触发或行为合理。
- E3 光标在嵌套列表内 `/` → 触发且插入位置正确。
- E4 中文输入法下触发/过滤不串码。
- E5 ESC 取消；无匹配项时提示。
- E-边界：文档最末空行触发；菜单项 hover 高亮；点击外部关闭；连续多次触发不叠加多个菜单。

### F. 块拖拽（block-drag）
- F1 拖首块/末块/中间块到新位置，内容重排正确。
- F2 跨列表拖拽（标题↔段落↔列表）。
- F3 拖代码块、表格块。
- F-边界：拖到自身（无变化不报错）；拖出文档范围（末块 `to` 延展至 `doc.length`）；触摸拖拽；极快连拖；拖拽中失焦。

### G. 视图模式（view-mode，含 Q1 恢复）
- G1 四态切换：日常/专注/沉浸/全显，对应元素显隐正确（见 `src/view-mode.js` PRESETS）。
- G2 **工具栏隐藏恢复**：沉浸模式隐藏工具栏 → 点 `⊞`(#btnChromeMode) 切回日常/全显恢复（`view-mode.js:112-147`）。
- G3 状态持久化：`localStorage` 键 `md-editor-chrome-mode`，重启沿用。
- G-边界：未知模式值回退 daily；缺少某 DOM 元素不报错；全显与日常差异（目前二者预设相同，需确认是否应有区别）。

### H. 工区搜索（workspace-search，含 Q3 边界）
- H1 未打开文件夹 → 点 🔍(#btnWorkspaceSearch) → 输入关键词 → 显示「未找到匹配。」**（缺陷点：应提示"请先打开文件夹"）**。
- H2 打开文件夹后搜索：命中当前文件夹及子目录 `.md/.markdown`，跳过 `node_modules/dist`。
- H3 大小写不敏感匹配；命中行号/列号/片段正确。
- H4 结果点击 → 在编辑器打开对应文件。
- H-边界：含非 md 文件（不搜）；文件夹含不可读文件（跳过不崩）；特殊字符/正则元字符查询；XSS（结果用 `textContent` 渲染，`workspace-search.js:321`）；超大文件夹性能；搜索中切换文件夹。

### I. 样式工具栏（v1.4.4 保留，最高优先级）
- I1 居中 / 加粗 / 高亮 / 颜色 / 字号 5 按钮各自生效。
- I2 `applyFontStyle` 记忆上次选择（`src/editor.js`）。
- I3 组合应用（先居中再高亮再改色）正确叠加。
- I-边界：对空选择点击；对代码块内文本应用；撤销可还原样式；与斜杠菜单/块拖拽共存不冲突；上游若暗中舍弃须保留（见样式工具栏保留策略记忆）。

### J. 对比合并（compare，入口见 Q2）
- J1 右键「打开对比合并」→ 打开 `compare.html`。
- J2 两栏/三栏/单栏切换（`compare.html:22-24`）：三栏=Yours|可编辑 Result|Theirs。
- J3 选两份文件 → 差异红绿高亮 + 行号差异标记（`compare-line-markers.js`）。
- J4 接受块 / revert：按钮 `cm-compare-revert` / `cm-compare-chunk-btn` 中文化。
- J5 块导航：上一块/下一块快捷键（B / Shift+B / E 折叠）。
- J6 导出结果 / 导出 diff（`compare-export.js` / `compare-diff-export.js`）。
- J7 图片插入当前块（`compare-images.js`）。
- J-边界：仅选一份文件；选非文本文件；空文件对比；超大文件(>5MB)；两份完全相同（无差异提示）；中途替换文件；导出无写入权限。

### K. 文件操作
- K1 新建 / 打开 / 保存 / 导入 / 导出。
- K2 拖拽文件到窗口打开。
- K3 编码：UTF-8 / 含 BOM / GBK（应提示或转码，不乱码）。
- K-边界：保存被拒（只读/权限）；导入损坏文件；导出路径非法。

### L. 快捷键
- L1 全量快捷键可用（视图切换、搜索、保存、撤销等）。
- L2 与浏览器快捷键冲突处理（如 Ctrl+S 不触发浏览器保存）。
- L-边界：输入框聚焦时快捷键不误触发；组合键顺序。

### M. 异常边界（全局）
- M1 localStorage 不可用 → 不崩溃，本次会话可用。
- M2 文件夹权限被拒（`showDirectoryPicker` 取消/拒绝）→ 友好提示不崩。
- M3 扩展环境 `showDirectoryPicker` 降级（需用户手势，自动调用应失败优雅）。
- M4 大文件(>5MB)编辑/预览/搜索性能与内存。
- M5 并发保存竞态。

### N. 双端守卫
- N1 扩展端：`__TAURI_INTERNALS__ in window` 为 false → 不调用任何 `@tauri-apps/*` API（已知 `editor.js:528/1479/2357` 守卫）。
- N2 桌面端：对应为 true → 走 Rust 读写。
- N-边界：动态 import `@tauri-apps/*` 仅在 `isTauriEnv` 时（compare-shims.js）。

## 4. 记录格式（任务 5 逐条填写）
| 编号 | 功能 | 场景/边界 | 前置条件 | 操作 | 预期 | 实际 | 截图/日志 | 判定 | 严重级 | 二次复测 |
|------|------|-----------|----------|------|------|------|-----------|------|--------|----------|
| T-001 | ... | ... | ... | ... | ... | ... | ... | Pass/Fail | S1-S4 | 复现/未复现 |

每条 Fail 必须**二次复测/复现**后才确认为 BUG，记录复现步骤与证据（截图/console 日志）。

## 5. 执行顺序建议（与测试效率）
1. 烟雾：A 组（启动/右键菜单）→ B 组（编辑核心）→ C 组（预览）。
2. markra 新功能：D/E/F/G/H/I。
3. 对比：J 组（独立页面，最后做避免状态污染）。
4. 边界：K/L/M/N 穿插或最后集中。
5. 每个 Fail 即时二次复测，当轮汇总 BUG 清单供任务 6 修复。

## 6. 双端差异注记
- 扩展端：`showDirectoryPicker` 需用户手势；`chrome.storage.local` 可用（360Chrome 已知会抛 `Invalid context type provided`，测试用 shim 补偿）。
- 桌面端：Tauri 走 Rust 命令 `read_text_file`/`write_text_file`/`read_multiple_text_files`/`save_compare_result`（`desktop/src`）。
- 守卫：`__TAURI_INTERNALS__ in window`；新模块禁直接 import `@tauri-apps/*`。

## 7. 已识别的待验证疑点（来自代码研读，优先级高）
1. **对比入口不可发现**：编辑器内无对比按钮，仅右键菜单（Q2）。建议测试"用户能否在 30 秒内找到对比入口"。
2. **工区搜索无引导**：未打开文件夹时只显示「未找到匹配。」不提示先打开文件夹（Q3/H1）。
3. **全显与日常预设相同**：`view-mode.js` 中 `full` 与 `daily` PRESETS 完全一致，G3 边界需确认是否为预期。
4. **mermaid 回写 / C-01 回归**：预览区 `contenteditable` 失焦整体覆盖编辑器的历史风险，必须复测。
