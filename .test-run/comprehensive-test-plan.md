# Chrome-Markdown-Edit 全覆盖测试方案（v1.8.3）

> 目标：对扩展「全部功能 + 全部边界条件」做多场景全覆盖测试，作为后续真机测试、BUG 复现、修复、审计迭代的单一事实源。
> 测试方法：以 Playwright 驱动本机 360Chromex（`D:\Tools\360Chrome\360chromex.exe`），HTTP 服务 `dist/`@8123（构建产物 = 已安装扩展同源码），真实可见性判定 + DOM 断言 + 截图证据。
> 缺陷证据：每条 FAIL 必须附 `take_screenshot` 截图（存 `.test-run/verify-shots/<CASE>.png`）+ 控制台错误摘录。

---

## 0. 测试环境与基线

- 浏览器：`D:\Tools\360Chrome\360chromex.exe`（非 headless，持久 profile）
- 被测代码：`dist/`（由 `npm run build` 生成，与已装入 `D:\Tools\360Chrome\Chrome-Markdown-Edit` 的 v1.8.3 同源）
- 端口：8123（editor.html / compare.html）
- 基线动作：每次 `gotoEditor()` 清 `localStorage`、移除 onboarding 遮罩、等待 `#toolbar`
- 真机判定 `isRealVisible()`：display/visibility/opacity + bounding box ≥ 2px + `elementFromPoint` 未被遮挡
- 版本戳核对：加载后读取 `#appVersion` / `#compareVersion` 文本应为 `v1.8.3`

---

## 1. 功能地图（待测能力清单）

1. 编辑器内核（CodeMirror 6）：输入、撤销/重做、选区、滚动
2. 实时预览 + 双向同步（编辑区→预览区；预览区 contenteditable→编辑区）
3. 防闪烁（哈希跳过 + 淡入）
4. 视图模式：`edit` / `preview` / `split`
5. Chrome 模式：`daily` / `focus` / `immersive` / `full`（⊞ 按钮循环）
6. 工具栏：三层（left/center/right）、分组、隔断符、响应式单行横向滚动
7. 样式工具栏：加粗/居中/高亮/颜色/字号（`applyFontStyle`）
8. 侧栏/文件树/工区：显示、折叠隐藏、宽度拖拽持久化、恢复条
9. 多栏对照/对比（compare）：两栏/三栏/单栏、双槽独立选文件、差异块导航、采纳、导入导出、图片
10. 主题/皮肤系统：data-theme × data-editor-theme × data-color-scheme × data-skin
11. 导入导出 / 图片 / 工作区搜索 / slash 菜单 / 块拖拽 / 会话恢复

---

## 2. 分层测试用例

### L0 — 安装与启动环境
- L0.1 启动 editor.html，`#toolbar` 存在且真实可见
- L0.2 启动 compare.html，`#compareApp` 存在且真实可见
- L0.3 `#appVersion` 文本 == `v1.8.3`；`#compareVersion` == `v1.8.3`
- L0.4 控制台无未捕获错误（pageerror / console.error 计数）
- L0.5 onboarding 遮罩可关闭且次日基线不再出现

### L1 — 编辑器核心与双向同步
- L1.1 输入文本后编辑区 `.cm-content` 文本同步
- L1.2 编辑区输入 `# 标题` → 预览区出现 `<h1>`
- L1.3 预览区 contenteditable 输入 `**abc**` → 编辑区得到 `**abc**`（已知往返）
- L1.4 预览区输入行内 `` `code` `` → 编辑区得到反引号代码
- L1.5 预览区输入 `# 标题` → 编辑区得到 ATX 标题
- L1.6 纯净文本（无语法）输入预览区不打断光标（MD_SYNTAX_RE 判定）
- L1.7 防闪烁：连续相同内容渲染不触发 DOM 替换（`lastRenderedHash` 命中）
- L1.8 防闪烁：内容变化时有 opacity 淡入且无明显白屏闪烁
- L1.9 撤销/重做：编辑区文本可撤销恢复
- L1.10 选区 + 滚动：长文档滚动后选区正确

### L2 — 视图模式（3 × 4 组合）
- L2.1 `edit/preview/split` 切换，`#editorMain[data-mode]` 正确
- L2.2 ⊞ 循环 `daily→focus→immersive→full→daily`，每态 `body` 类正确
- L2.3 `daily`：工具栏 + 侧栏均可见
- L2.4 `focus`：侧栏 `.view-hidden` 隐藏，恢复条 `#sidebarToggle.visible` 点亮
- L2.5 `focus`：工具栏仍可见（不被错误隐藏）
- L2.6 `immersive`：工具栏 `.view-hidden` 隐藏，悬浮恢复按钮可见
- L2.7 `immersive`：点悬浮恢复按钮 → 工具栏恢复 `display:flex`
- L2.8 `focus`：点恢复条 → 侧栏真正恢复可见（**已知历史 FAIL**）
- L2.9 视图模式持久化（`localStorage` 键存在且重载生效）
- L2.10 分屏比例拖拽（若存在 resizer）保存比例

### L3 — 工具栏（已知问题 1、2）
- L3.1 工具栏整体 `flex-wrap:nowrap` + 固定 `height:var(--toolbar-height)`
- L3.2 工具栏无横向换行（窄视口下整体横向滚动，不换行堆叠）
- L3.3 左右段按钮与中段按钮垂直对齐（`align-items:center`，无高低错落）
- L3.4 **已知问题1**：相邻按钮不重叠（相邻按钮 bounding box 不相交）
- L3.5 **已知问题2**：按钮与 `|` 隔断符间距合理（间距 ≤ 按钮间距的 2 倍，不出现过大空隙）
- L3.6 隔断符 `.toolbar-divider` 真实可见且垂直居中
- L3.7 工具栏横向滚动时三段保持同一滚动容器（无独立 6px 滚动槽错位）
- L3.8 极窄视口（≤900px）工具栏可滚动且关键按钮（⊞、对比、加粗）可达
- L3.9 样式工具栏 5 按钮（居中/加粗/高亮/颜色/字号）均存在且不被覆盖（铁律）

### L4 — 侧栏 / 文件树 / 工区（已知问题 3）
- L4.1 初始侧栏可见（`fileSidebar` 非 `collapsed`/`view-hidden`）
- L4.2 点 `#btnCollapseSidebar`（收起）→ 侧栏 `.collapsed`（`width:0` 且不可见）
- L4.3 **已知问题3**：收起后侧栏真正不可见（display/width/遮挡判定均通过）
- L4.4 收起后 `#sidebarToggle` 恢复条可见
- L4.5 点恢复条 → 侧栏恢复（移除 `collapsed`/`view-hidden`，持久化宽度恢复）
- L4.6 宽度拖拽 resizer → 宽度变化并持久化（重载后保持）
- L4.7 工区视图切换（`view-switch-group`）按钮可达且不重叠
- L4.8 文件树点击文件 → 编辑区加载该文件内容
- L4.9 `view-hidden` 优先级高于 `collapsed`（聚焦态下侧栏彻底隐藏）

### L5 — 样式工具栏
- L5.1 加粗：选区包裹 `**`
- L5.2 居中：块加 `::: center` 或对应标记
- L5.3 高亮：选区包裹 `==`
- L5.4 颜色：应用前景色
- L5.5 字号：应用字号
- L5.6 `applyFontStyle` 函数存在且被 5 按钮调用（铁律：不被覆盖移除）
- L5.7 多格式叠加（加粗+高亮+颜色）不互相覆盖

### L6 — 多栏对照 / 对比（已知问题 4、5、6、7）★重点
> 覆盖 compare 全部功能。每个用例先确认 compare.html 已加载且主题与主 UI 一致。

**视图模式**
- T6.1 打开对比视图（`#btnCompare` 存在于主 UI 且可点击）
- T6.2 默认进入两栏视图（two）
- T6.3 切换「三栏」按钮 → 出现 third 槽（A/B/Base 或 A/B/C）
- T6.4 **已知问题5**：切换「单栏」按钮 → 进入 unified/single 单栏视图且功能可用
- T6.5 单栏视图渲染合并结果（带行内/块差异标记）
- T6.6 三视图间来回切换无报错、状态正确
- T6.7 切回主编辑器再进入对比，状态重置正确

**选择文件（双槽独立）**
- T6.8 **已知问题6**：`选择文件` 在 A 槽选 file1、B 槽选 file2，两栏分别显示不同文件
- T6.9 仅选 A 槽 → B 槽提示/空态，不崩溃
- T6.10 仅选 B 槽 → A 槽空态，不崩溃
- T6.11 双槽均选 → 两栏内容正确加载
- T6.12 拖拽文件到 A 槽 / B 槽分别生效
- T6.13 重新选择覆盖原槽内容
- T6.14 选择同名不同内容文件，区分正确

**主题 / 色彩一致性（已知问题 4）**
- T6.15 **已知问题4**：compare 工具栏/背景/文字色 与主 UI（`editor.css` 变量）一致
- T6.16 compare 暗色模式随主 UI `data-theme` 切换
- T6.17 compare 配色随主 UI `data-editor-theme` 切换
- T6.18 compare 语法高亮随 `data-color-scheme` 切换
- T6.19 compare 皮肤随 `data-skin` 切换
- T6.20 差异块（增/删/改）配色清晰、对比度高

**编辑能力（已知问题 7）**
- T6.21 **已知问题7**：对比视图内可编辑 A/B 栏内容（具备单 MD 编辑能力）
- T6.22 编辑 A 栏 → 差异实时重算
- T6.23 编辑 B 栏 → 差异实时重算
- T6.24 单栏编辑：编辑合并结果生效
- T6.25 编辑后工具栏样式按钮（加粗/高亮等）在对比视图可用
- T6.26 编辑支持 Markdown 实时预览（若对比内置预览）

**差异导航与采纳**
- T6.27 上一处/下一处差异块导航（`btnPrevChunk`/`btnNextChunk`）正确跳转并高亮
- T6.28 三栏「采纳对方」(`btnAcceptTheirs`) 仅在 three 模式可点，其余模式禁用
- T6.29 键盘上下键导航差异块
- T6.30 折叠差异块（`btnToggleCollapse`）生效

**导入 / 导出 / 图片**
- T6.31 导出合并结果（`btnExportResult`）下载/生成文件
- T6.32 导出差异（`btnExportDiff`）生成 diff 文本
- T6.33 添加图片（`btnAddImages`）在对比视图生效
- T6.34 空文件对比：两空文件 → 无差异、不崩溃
- T6.35 完全相同文件：提示无差异
- T6.36 超大文件（>1MB）：渲染不卡死、可滚动
- T6.37 含特殊字符（中文/emoji/代码块/表格/公式）：正确解析不丢内容
- T6.38 切换文件后撤销栈不串栏

### L7 — 主题 / 皮肤系统
- L7.1 切换 `data-theme` light/dark 全局生效
- L7.2 切换 `data-editor-theme`（27 套）编辑区配色变化
- L7.3 切换 `data-color-scheme` 语法高亮变化
- L7.4 切换 `data-skin`（glass 等 4 套）材质层变化
- L7.5 四维度正交组合无冲突（任意组合渲染正常）
- L7.6 主题持久化（重载保持）
- L7.7 compare 视图主题与主 UI 联动（呼应 T6.15-19）

### L8 — 其他功能
- L8.1 导入 MD 文件 → 编辑区加载
- L8.2 导出 MD → 内容完整
- L8.3 工作区搜索 → 命中高亮
- L8.4 slash 菜单：输入 `/` 弹出、选择插入块
- L8.5 块拖拽：拖动手柄移动块，顺序更新
- L8.6 会话恢复：重载后恢复上次内容/光标
- L8.7 图片插入：粘贴/选择图片 → 预览显示

### L9 — 边界条件
- L9.1 空文档（无任何内容）启动不崩溃
- L9.2 极大文档（10 万行）滚动/渲染不卡死
- L9.3 仅空白字符文档
- L9.4 含未闭合标记（`**` 不闭合、`#` 行尾无空格）渲染不崩
- L9.5 含 HTML 实体/脚本字符（XSS 防护：不执行脚本）
- L9.6 极宽视口（≥2560px）布局不溢出
- L9.7 极窄视口（≤480px）关键功能可达
- L9.8 连续快速切换视图/模式（压力）不崩
- L9.9 键盘全可达（Tab 遍历工具栏，Enter 触发）
- L9.10 网络离线（file:// 或断网）核心编辑可用

---

## 3. 已知问题映射表（7 项）

| 编号 | 用户描述 | 对应用例 | 代码现状（审查） | 待真机验证 |
|------|----------|----------|------------------|------------|
| 1 | 工具栏按钮紧凑且部分重叠 | L3.4 | base `.toolbar` 已改 `nowrap`+定高；待真机量距 | 重叠是否消除 |
| 2 | 按钮与 `\|` 隔断符间距过大 | L3.5 | `.toolbar-divider` 间距待查 | 间距是否过大 |
| 3 | 文件树/工区 隐藏/关闭后未隐藏 | L4.3 | `toggleSidebar(true)` 加 `.collapsed(width:0)`；待查 CSS 是否被 flex 覆盖 | 是否真隐藏 |
| 4 | 多 MD 对照 UI/主题/色彩不一致 | T6.15-19 | compare.html 已 `link editor.css`；待查 compare.css 覆盖 | 一致性 |
| 5 | 对照不存在「单栏」场景 | T6.4/T6.5 | `btnViewSingle` + `createCompareUnifiedView` 已实现 | 单栏是否真可用 |
| 6 | 选择文件只开左栏 | T6.8 | `onPickFiles()` 已 `files.a/b` 双槽填充 | 双槽独立选 |
| 7 | 对照应具备单 MD 全部编辑功能 | T6.21-26 | compare 编辑能力待验证 | 编辑完整性 |

---

## 4. 缺陷分级与回归标准

- P0：功能完全不可用 / 崩溃 / 数据丢失
- P1：核心功能异常（已知 7 项均归 P1 起步，按真机确认调级）
- P2：视觉/对齐/一致性瑕疵
- P3：边界/极端场景
- 回归门槛：P0/P1 全部清零、`node --test` 全绿、单测 + 真机核心用例全绿方可发版。

---

## 5. 迭代循环

编写方案 → 真机测试记录 → 复现 BUG → 修复 → `code-review-combo` 审计 → 修复审计项 → 再审计 → 零缺陷 → 提交/推送/打标签/CI/安装 → 回到真机测试，直至无 BUG。
