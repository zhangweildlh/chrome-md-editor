# 测试验证记录 — 编辑器 UI 工具栏 / 预览重构（feat/ui-toolbar-preview-refactor）

> 验证方式：360Chromex（调试端口 9222，隔离测试 profile `D:\Documents\AI_Work_Temp\chrome-test-profile`）+ chrome-devtools MCP 真机点检；扩展 ID `eofmkjlledbhhpeaanjbfneffcnceeom`（manifest name "Markdown Editor" v1.9.6，MV3 service_worker）。
> 验证日期：2026-08-18
> 结论：**全部用例通过，未发现功能性 BUG。**

## 一、编辑器页（TC-E01 ~ E08）

| 用例 | 验证点 | 方法 | 结果 |
| --- | --- | --- | --- |
| E01 | 撤销 / 重做按钮 | 注入文本 → 点撤销（字符 216→207，测试文本移除）→ 点重做（恢复 216，测试文本回归） | ✅ 通过 |
| E02 | 设置菜单弹出 | 点 ⚙ 展开：视图模式 / 外观(33 主题含 10 玻璃) / 高亮方案(编辑高亮+预览着色) / 自动保持 / 显示设置 / 增强 / 其他 齐备 | ✅ 通过 |
| E03 | 高亮方案拆两按钮 | 设置菜单内「编辑高亮」「预览着色」两个独立按钮，各含 8 个配色选项、互斥弹出 | ✅ 通过 |
| E04 | 标题 / 列表菜单 | 点「标题/列表」展开 H1/H2/H3 + 有序/无序；与设置菜单互斥关闭 | ✅ 通过 |
| E05 | Mermaid 渲染 | 预览栏 flowchart 渲染为 `SvgRoot flowchart-v2`（节点 开始/判断/执行/结束 + 分支 是/否），非空框 | ✅ 通过 |
| E06 | `==高亮==` 渲染 | `==高亮内容==` 与 `== 带空格高亮 ==` 均渲染为 `<mark>`（放宽规则生效） | ✅ 通过 |
| E07 | callout 渲染 | `>[!NOTE]`→带 ℹ 图标「备注」提示框、内容不重复；`>[!WARNING]`→带 ⚠ 图标「警告」提示框 | ✅ 通过 |
| E08 | 行内高亮按钮 + 同步锁链 | 选中文字点「A」→ 源码被 `<mark>…</mark>` 包裹；同步按钮确认锁链图标 | ✅ 通过 |

## 二、对比页（TC-C01 ~ C03）

| 用例 | 验证点 | 方法 | 结果 |
| --- | --- | --- | --- |
| C01 | 撤销 / 重做 | 首栏 execCommand 插入文本 → 点撤销（文本移除）→ 点重做（恢复） | ✅ 通过 |
| C02 | 按钮顺序 | 快照顺序：对照/合并 → 撤销/重做 → 三栏 → 选择文件/保存/滚动同步 → 差异 → 大纲 → 折叠未改 → 上一块/下一块 → 接受对方块 → 导出结果/diff → 插入图片，与预期一致 | ✅ 通过 |
| C03 | 插入图片 / 拖拽一致性 | 主区无拖放栏（`#compareImageDrop` 已移除，hasDropZone=false），图片插入统一为「插入图片」按钮 | ✅ 通过 |

## 三、双页回归（TC-R01 ~ R02）

| 用例 | 验证点 | 结果 |
| --- | --- | --- |
| R01 | 编辑器页回归 | 撤销/重做、菜单互斥、预览渲染、行内高亮、同步图标全部正常，console 无 error | ✅ 通过 |
| R02 | 对比页回归 | 撤销/重做、按钮顺序、图片插入路径全部正常，无悬空 DOM 引用 | ✅ 通过 |

## 四、代码审计（宿主 LLM 五焦点，review-spd 等效）

- **正确性**：`compare.js onPageDrop`（L1784-1854）对 `dataTransfer` 空安全，`!dragHasFiles(e)` 正确放行内部文本拖拽，图片经 `insertImagesAtCursor` 插入活动栏光标；无对已移除 `#compareImageDrop` 的引用。
- **回归兼容**：`editor.js initToolbarMenus`（L2525-2554）两个 `.toolbar-menu` 互斥展开，点击切换 / 外部点击 / Esc / 缩放关闭逻辑正确；`highlight-plugin.js`、`callout.js` 渲染已真机验证。
- **安全 / 性能并发**：无新增密钥、无阻塞调用；Mermaid 渲染正常。
- **测试**：`docs/测试方案_ui-toolbar-refactor.md` 已覆盖 13 个用例。

### 待说明项（非 BUG）
1. console `[Preview Consistency] Mismatch detected`：预览→Markdown 回写一致性自检，欢迎文档含 Mermaid/表格/代码块回写有损，属预期诊断告警，非本次重构回归。
2. console `form field 缺 id/name`（[issue] 级）：核查 `editor.html` 全部 `input/select` 均带 `id`，判定为 360Chromex 注入的外部 DOM 所致，非本扩展问题，不修。
3. README L79 标题「编辑器主题（23 套）」→ 已修正为「33 套，含 10 套玻璃」，消除与 L50/L81 的口径不一致（仅文档，不入 dist，无需重建）。

## 五、状态
- 10 项重构 + 预览渲染修复全部真机通过；修改尚未提交（github-personal-manager 纪律：只改文件、不提交）。
- 下一步须用户二次授权决定是否 `commit` / 开 PR。
