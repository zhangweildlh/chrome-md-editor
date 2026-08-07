# Chrome-Markdown-Edit 完整测试方案（v1.8.4，Step 1）

> 目标：对扩展「全部功能 + 全部边界条件 + 多栏对照全部功能」做多场景全覆盖测试，作为后续真机复现、修复、审计迭代的单一事实源。
> 驱动：本机 360Chromex（`D:\Tools\360Chrome\360chromex.exe`）经 Playwright 真机加载**已安装目录** `D:\Tools\360Chrome\Chrome-Markdown-Edit`（即用户手动安装的同一份 v1.8.4 代码），HTTP 服务该目录 @8123。
> 原则（用户硬性要求）：**先假设所有功能均存在 BUG、均不可用、均不方便使用；再用测试事实证得/反证真伪。** 每条用例默认按「正确行为」断言，FAIL 即证明 BUG 存在。
> 可视判定铁律：**我能 `看见`/DOM 能取到的，不等于用户能 `看见` 的。** 必须先假设「窗口边界之外用户看不见」，用 `getBoundingClientRect` 相对 `#toolbar`/视口实测：按钮 `right > 容器右边界` 即判定用户不可见、不可点（即便容器可横向滚动但无滚动按钮/指示，仍视为不可用）。

---

## 0. 测试环境与基线

- 浏览器：`D:\Tools\360Chrome\360chromex.exe`（非 headless，持久 profile）
- 被测代码：已安装目录 `D:\Tools\360Chrome\Chrome-Markdown-Edit`（v1.8.4，与 `dist/` 同源码）
- 端口：8123（经 HTTP 服务 `src/editor.html` / `src/compare.html`）
- 基线：`gotoEditor()` 清 `localStorage`、移除 onboarding 遮罩、等待 `#toolbar`；`gotoCompare()` 等待 `#compareToolbar`
- 版本核对：加载后 `#appVersion` / `#compareVersion` 文本应为 `v1.8.4`
- 真机判定 `isRealVisible()`：display/visibility/opacity + bounding box ≥ 2px + `elementFromPoint` 未被遮挡
- 溢出判定 `measureToolbar(sel, width)`：设视口宽 `width` → 取 `#toolbar`(或对比页工具条) `getBoundingClientRect()` 右边界 `R`；遍历其 `button/select/input`，凡 `getBoundingClientRect().right > R+1` 或 `left < L-1` 记为「用户不可见」；同时返回 `scrollWidth-clientWidth`(溢出像素)、是否存在滚动按钮(`.toolbar-scroll-btn` 等)
- 缺陷证据：每条 FAIL 附 `page.screenshot`（`filePath` 存 `.test-run/verify-shots/<CASE>.png`）+ 控制台/HTTP 错误摘录

---

## 1. 功能地图（待测能力清单，假设均有 BUG）

1. 编辑器内核（CodeMirror 6）：输入、撤销/重做、选区、滚动
2. 实时预览 + 双向同步（编辑区↔预览区 contenteditable）
3. 防闪烁（哈希跳过 + 淡入）
4. 视图模式：`edit` / `preview` / `split`
5. Chrome 模式：`daily` / `focus` / `immersive` / `full`（⊞ 循环）
6. 工具栏：三层（left/center/right）、分组、隔断符、响应式单行、**横向溢出时用户可达**
7. 样式工具栏：加粗/居中/高亮/颜色/字号（`applyFontStyle`）
8. 侧栏/文件树/工区：显示、**折叠隐藏（真隐藏）**、宽度拖拽持久化、恢复条
9. 多栏对照/对比（compare）：两栏/三栏/单栏、双槽独立选文件、差异块导航、采纳、导入导出、图片
10. 主题/皮肤系统：data-theme × data-editor-theme × data-color-scheme × data-skin
11. 导入导出 / 图片 / 工作区搜索 / slash 菜单 / 块拖拽 / 会话恢复

---

## 2. 分层测试用例（默认按「正确行为」断言，FAIL=证伪 BUG）

### L0 — 安装与启动环境
- L0.1 editor `#toolbar` 存在且真实可见
- L0.2 compare `#compareToolbar` 存在且真实可见
- L0.3 `#appVersion` == `v1.8.4`；`#compareVersion` == `v1.8.4`
- L0.4 控制台/页面无未捕获错误
- L0.5 onboarding 遮罩可关闭

### L1 — 编辑器核心与双向同步
- L1.2 编辑区 `# 标题` → 预览区 `<h1>`
- L1.3 预览区 contenteditable 输入 `**abc**` → 编辑区得到 `**abc**`
- L1.7 防闪烁：连续相同内容渲染不触发 DOM 替换
- L1.9 撤销/重做可恢复

### L2 — 视图模式（3 × 4 组合）
- L2.1 `edit/preview/split` 切换，`#editorMain[data-mode]` 正确
- L2.2 ⊞ 循环 `daily→focus→immersive→full→daily`，每态 `body` 类正确
- L2.3 `daily`：工具栏 + 侧栏均可见
- L2.4 `focus`：侧栏 `.view-hidden` 隐藏，恢复条 `#sidebarToggle` 可见
- L2.6 `immersive`：工具栏 `.view-hidden` 隐藏，悬浮恢复按钮可见
- L2.8 `focus`：点恢复条 → 侧栏真正恢复可见
- L2.9 视图模式持久化

### L3 — 工具栏（已知问题 1、3，重点溢出）
- L3.1 工具栏整体 `flex-wrap:nowrap` + 固定高
- L3.2 窄视口不换行（整体横向滚动，不堆叠）
- L3.4 相邻按钮不重叠
- **L3.5 隔断符间距（已知问题1）**：测量「组最后一个真实子元素右缘 → 紧邻隔断符左缘」的实际间距，取最大值；断言 ≤ 12px（若 >12px 证明间距过大 BUG 确实存在）。
- **L3.6 工具栏横向溢出（已知问题3，核心）**：在视口宽 `W ∈ {320,480,768,900,1280,1600,1920}` 逐一测量 `measureToolbar('#toolbar', W)`：
  - 断言：`overflow ≤ 0`（所有按钮均在容器内，用户全部可见）；**或** 存在滚动按钮(`hasScrollBtns`)且 off-screen 按钮可经滚动到达。
  - 当前预期：窄/中宽下 `overflow>0` 且无滚动按钮 → 证伪「用户看不见的按钮不可达」BUG。
- **L3.7 全屏溢出（已知问题3）**：`document.documentElement.requestFullscreen()` 或设视口=屏幕分辨率后，重测 `measureToolbar`；断言同 L3.6（全屏下仍不得有用户不可达按钮）。
- L3.8 极窄(≤480)关键按钮（⊞、对比、加粗、样式5按钮）必须可达（fit 或 scroll 机制）
- L3.9 样式工具栏 5 按钮均存在且不被覆盖（铁律）

### L4 — 侧栏 / 文件树 / 工区（已知问题 2，重点真隐藏）
- L4.1 初始侧栏可见
- **L4.2 点收起 → `.collapsed` + 真实宽度≈0（已知问题2）**：断言 `getBoundingClientRect().width < 5`（不是仅透明仍占 180px）
- **L4.3 收起后侧栏真不可见（已知问题2）**：`isRealVisible('#fileSidebar')` 必须为 false（证伪「隐藏/关闭未生效」）
- L4.4 收起后 `#sidebarToggle` 恢复条可见
- L4.5 点恢复条 → 侧栏恢复
- L4.6 宽度拖拽 resizer → 宽度变化并持久化
- L4.8 文件树点击文件 → 编辑区加载内容

### L5 — 样式工具栏
- L5.1 加粗：选区包裹 `**`；L5.2 居中；L5.3 高亮 `==`；L5.4 颜色；L5.5 字号
- L5.6 `applyFontStyle` 被 5 按钮调用（铁律不被覆盖）
- L5.7 多格式叠加不互相覆盖

### L6 — 多栏对照 / 对比（已知问题 4/5/6/7，★全覆盖）
**视图模式**
- T6.1 打开对比视图（`#btnCompare` 可点）
- T6.2 默认两栏(two)
- T6.3 三栏(three) 出现 third 槽
- T6.4 单栏(single) 进入且可用（已知问题5）
- T6.5 单栏渲染合并结果（含差异标记）
- T6.6 三视图来回切换无报错
**选择文件（双槽独立）**
- T6.8 双槽独立选不同文件，两栏分别显示（已知问题6）
- T6.9 仅选 A → B 空态不崩；T6.10 仅选 B → A 空态不崩
- T6.11 双槽均选 → 正确加载；T6.12 拖拽到 A/B 槽；T6.13 重选覆盖；T6.14 同名不同内容区分
**主题一致性（已知问题4）**
- T6.15 对比页 `data-theme`/`data-editor-theme`/`data-color-scheme` 三属性齐全非空
- T6.15b 主 UI 选暗色预设(github-dark) → 对比页 `data-theme==='dark'` 且 `data-editor-theme==='github-dark'`
- T6.16/17/18/19 暗色/配色/语法/皮肤随主 UI
**编辑能力（已知问题7）**
- T6.21 对比视图内可编辑 A/B 栏（单 MD 编辑能力）
- T6.22 编辑 A → 差异实时重算；T6.23 编辑 B → 实时重算
- T6.24 单栏编辑生效；T6.25 样式按钮在对比视图可用
**差异导航与采纳**
- T6.27 上一处/下一处差异导航正确；T6.28 三栏「采纳对方」仅 three 可点；T6.29 键盘导航；T6.30 折叠差异块
**导入/导出/图片**
- T6.31 导出合并结果；T6.32 导出差异；T6.33 添加图片；T6.34 空文件对比不崩；T6.35 完全相同提示无差异；T6.36 超大文件不卡死；T6.37 特殊字符不丢；T6.38 切换文件撤销栈不串栏
**对比页工具栏溢出（复用 L3.6 方法）**
- T6.39 对比页 `#compareToolbar` 在 `W∈{320,480,768,900,1280}` 测量，断言同 L3.6（含暗色预设下）

### L7 — 主题 / 皮肤系统
- L7.1 `data-theme` light/dark 生效；L7.2 `data-editor-theme` 27 套变化；L7.3 `data-color-scheme`；L7.4 `data-skin`；L7.5 四维度正交无冲突；L7.6 持久化；L7.7 compare 联动

### L8 — 其他功能
- L8.1 导入 MD；L8.2 导出 MD；L8.3 工作区搜索；L8.4 slash 菜单；L8.5 块拖拽；L8.6 会话恢复；L8.7 图片插入

### L9 — 边界条件（含「用户可视」边界）
- L9.1 空文档不崩；L9.2 极大文档(10万行)不卡死；L9.3 仅空白字符；L9.4 未闭合标记不崩
- L9.5 含脚本字符(XSS) 不执行
- **L9.6 极宽(≥2560)布局不溢出（对称验证 L3.6）**
- **L9.7 极窄(≤480)关键功能可达（对称验证 L3.6/L3.8）**
- L9.8 连续快速切换不崩；L9.9 键盘全可达(Tab/Enter)；L9.10 离线核心编辑可用

---

## 3. 已知问题映射表（v1.8.4 待实测验证）

| 编号 | 用户描述 | 对应用例 | 源码根因(待实测确认) | 待真机实证 |
|------|----------|----------|----------------------|------------|
| 1 | 工具栏按钮与 `\|` 隔断符间距过大 | L3.5 | 三层间距叠加（组 padding+段 gap+隔断符 margin），上一轮只改一层 | 实测最大间距 |
| 2 | 文件树/工区 隐藏/关闭后未隐藏 | L4.2/L4.3 | `.file-sidebar{min-width:180px}` 压制 `.collapsed{width:0}` | 实测收起后宽度 |
| 3 | 全屏/非全屏 工具栏按钮超出边界、用户看不见/点不到 | L3.6/L3.7/T6.39 | `.toolbar{overflow-x:auto}` 仅 5px 滚动条、无滚动按钮 | 实测各宽下溢出按钮数 |

---

## 4. 缺陷分级与回归标准

- P0：功能完全不可用/崩溃/数据丢失
- P1：核心功能异常（已知 3 项 + 多栏对照功能缺失均归 P1 起步，按实测调级）
- P2：视觉/对齐/一致性瑕疵
- P3：边界/极端场景
- 回归门槛：P0/P1 全部清零、`node --test` 全绿、单测 + 真机核心用例全绿方可发版。

---

## 5. 迭代循环（与用户 6 步一致）

编写方案(Step1) → 真机测试记录(Step2) → 复现 BUG → 修复(Step3) → `code-review-combo` 审计(Step4) → 修复审计项 → 再审计(Step5) → 零缺陷 → 提交/推送/打标签/CI/安装(Step6) → 回到真机测试，直至无 BUG。
