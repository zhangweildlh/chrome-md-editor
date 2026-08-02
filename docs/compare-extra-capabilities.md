# @codemirror/merge 增量能力挖掘与移植评估（gh 调研）

> 本文档为 `COMPARE_IMPLEMENTATION_PLAN.md` 的延伸调研。目标：在已规划能力（MergeView 两/三栏、highlightChanges、gutter、collapseUnchanged、revertControls、getChunks、diffConfig）之外，识别官方包 `@codemirror/merge`(v6.12.1) 中**还值得移植到本项目**的能力，并逐项评估难度、成本、耗时（基于 WorkBuddy 即 AI Agent 实现）。
>
> 调研手段：`gh api repos/codemirror/merge`（元信息/源码/package.json）、`gh search code "unifiedMergeView"`（真实生产采用验证）。

---

## 1. 官方包全量能力面（来自 `index.ts` 导出）

| 来源文件 | 导出 | 能力 |
|---------|------|------|
| `diff.ts` | `diff(a,b,config)` | Myers 1986 O(ND) diff，返回 `Change[]` |
| `diff.ts` | `presentableDiff(a,b,config)` | 同上，但丢弃短未改段、对齐到词边界，返回 `Change[]` |
| `diff.ts` | `Change` 类 | 改动范围 `{fromA,toA,fromB,toB}` |
| `diff.ts` | `DiffConfig` | `{scanLimit, timeout, override}` |
| `merge.ts` | `getChunks(state)` | 取当前视图 chunks + side |
| `merge.ts` | `goToNextChunk` / `goToPreviousChunk` | 块导航 `StateCommand`（现成） |
| `mergeview.ts` | `MergeView` / `MergeConfig` / `DirectMergeConfig` | 两栏/三栏并排视图（方案已纳入） |
| `unified.ts` | `unifiedMergeView(config)` | **单栏内联合并视图**（本次新增候选 A） |
| `unified.ts` | `acceptChunk` / `rejectChunk` | 单栏逐块接受/拒绝（候选 A 配套） |
| `unified.ts` | `getOriginalDoc` / `originalDocChangeEffect` / `updateOriginalDoc` | 动态更新原始文档 |
| `deco.ts` | `uncollapseUnchanged` | 手动展开折叠的未改区域（候选 E） |
| `deco.ts` | `mergeViewSiblings` | 获取兄弟视图（跨 pane 同步） |
| `chunk.ts` | `Chunk` | chunk 数据结构 |

**已纳入方案 T2/T4（不再评估）**：`MergeView` 两/三栏、`highlightChanges`、`gutter`、`collapseUnchanged`、`revertControls`+`renderRevertControl`、`getChunks`、`diffConfig`、`orientation:'a-b'`。

---

## 2. 增量候选逐项评估（A–H）

> 难度等级：极低 / 低 / 低-中 / 中。耗时以 **WorkBuddy 实现**为基准，给「等效代码编写工时」与「含本机 build + `node --test` + 等 CI 的墙钟」。
> 验证边界：本机可跑 `vite build` + 纯逻辑 `node --test`；**真实浏览器 GUI 视觉验收需用户**（硬边界）。桌面端 Tauri 部分因本机无 Rust，仅靠远端 CI 验证。

### A. 单栏 unified 视图（unifiedMergeView + acceptChunk/rejectChunk）⭐ 最高价值
- **描述**：第四种视图模式——单栏内联，删除行以 widget 显示在原行上方，每块带 Accept/Reject 按钮（GitHub PR diff 体验）。
- **价值**：高。与三栏并排互补，适合窄窗口/桌面端、长文档、逐行 review。
- **生产佐证**：`gh search code "unifiedMergeView"` 命中 metabase/metabase、marimo-team/marimo、JuliaPluto/Pluto.jl、beekeeper-studio/beekeeper-studio、Skyvern-AI/skyvern 等，成熟度可靠。
- **难度**：低-中。包已提供完整扩展组合（`unifiedMergeView` 返回扩展数组，含 `baseTheme` 自动明暗适配）。
- **需写代码**：① `src/compare-unified.ts` 接入；② compare 页面加「视图模式」切换（两栏/三栏/单栏）；③ `acceptChunk`/`rejectChunk` 接到导出逻辑。
- **代码量**：约 80–120 行。
- **依赖**：无新增（`@codemirror/merge` 内）。
- **耗时**：等效 0.5 工作日；墙钟 0.5–1 天（含验证）。
- **风险**：低。主要风险是「单栏 accept/reject」与「三栏 revertControls」的按钮语义统一——需定义清晰的视图模式状态机，避免用户混淆。
- **复用**：`unified.ts` 整文件已读，直接抄扩展组合；`theme.ts` 的 `baseTheme` 已含 `&light`/`&dark`。

### B. 块导航 goToNextChunk / goToPreviousChunk ⭐ 高价值（用户截图已明确要）
- **描述**：上一块/下一块导航。现成 `StateCommand`，直接 `import` 绑定按钮/快捷键。
- **价值**：高。用户 mergev 截图明确含「上一块/下一块」按钮；方案 T4 提了但未明确用现成函数。
- **难度**：极低。import 两命令 + 绑到 compare 工具栏；三栏模式需从某 pane 的 view 触发（manaflow/mdx-editor 有范例）。
- **代码量**：约 10–20 行（按钮 + keymap 注册）。
- **耗时**：等效 0.1–0.25 工作日。
- **风险**：极低。

### C. 行内差异 allowInlineDiffs（unified 视图可选）
- **描述**：单栏模式下，同一行内删除/插入用 `<del>` 内联显示，而非上下两行（GitHub 内联 diff）。
- **价值**：中。单栏更紧凑。
- **难度**：极低。`unifiedMergeView` 配置项 `allowInlineDiffs:true`（包内 `chunkCanDisplayInline` 已限制 `linesA==linesB && <10`）。
- **代码量**：配置项约 5 行 + UI 开关。
- **耗时**：等效 0.1 工作日。
- **风险**：低。

### D. 删除行语法高亮 syntaxHighlightDeletions（unified 视图）
- **描述**：删除的 MD 片段带语法色（需 language 扩展）。
- **价值**：中。删除内容可读性更高。
- **难度**：低。配置项 `syntaxHighlightDeletions:true` + 确保 markdown language 扩展传入 unified 视图。包对 >3000 字符删除块自动降级不高亮。
- **代码量**：约 10 行。
- **耗时**：等效 0.1 工作日。
- **风险**：低。

### E. 折叠展开 uncollapseUnchanged / mergeViewSiblings
- **描述**：用户手动展开被折叠的未改区域（点「展开 N 行」）；`mergeViewSiblings` 取兄弟视图用于跨 pane 同步展开。
- **价值**：低-中。折叠后需看上下文时的细节增强。
- **难度**：低。`uncollapseUnchanged` 是 `StateCommand`，绑按钮即可。
- **代码量**：约 15–25 行。
- **耗时**：等效 0.15 工作日。
- **风险**：低。

### F. 导出 diff 报告（presentableDiff + ChunkField）
- **描述**：生成 git 风格可读 diff 文本（`.diff` 文件），作为「对照报告」导出。
- **价值**：中。团队协作/记录「哪里改了」。
- **难度**：中。关键事实——`presentableDiff(a,b,config)` 返回**已对齐词边界的 `Change[]`（结构化，非字符串）**，导出文本需自写渲染层（遍历 chunk + change，生成 `+/-` 前缀 + 行号）。`makePresentable` 已帮我们做词边界对齐与相邻合并，省去这部分工作。
- **代码量**：约 40–60 行（`src/compare-diff-export.ts`）。
- **耗时**：等效 0.25–0.4 工作日；墙钟 0.5 天（含测试）。
- **风险**：中低。渲染逻辑可纯 `node --test` 验证（行号/`+/-`/多 chunk 拼接）。
- **复用**：`presentableDiff` 语义已读（`makePresentable` 对齐词边界、`mergeAdjacent` 合并相邻）。

### G. 自定义 mergeControls（统一按钮风格 / 中文文案 / 过验收闸门）
- **描述**：unified 视图 accept/reject 按钮默认英文 + 固定绿/红；传 `mergeControls` 函数自定义按钮（符合本项目禁用类名闸门 `btnCenterBold` 等 + 中文 + `editor.css` 变量）。
- **价值**：中。统一风格、过 `tests/issue-acceptance.test.js` 闸门、中文文案。
- **难度**：低-中。写 render 函数返回 `HTMLElement`。
- **代码量**：约 30 行。
- **耗时**：等效 0.2 工作日。
- **风险**：低（与 A 同批做）。

### H. 底层 diff / DiffConfig 直接调用（编辑器内「版本对比」）
- **描述**：在编辑器主界面加「与某版本/剪贴板 diff」入口，调用 `diff()`。
- **价值**：低（超出 compare 模块范围，范围蔓延）。
- **难度**：中。需新 UI 入口 + 状态管理。
- **代码量**：约 80–150 行。
- **耗时**：等效 1–2 工作日。
- **风险**：中（与 compare 模块职责混淆）。
- **建议**：**暂不纳入**。如未来要，独立立项。

---

## 3. 优先级与任务拆分建议

| 优先级 | 项 | 建议任务 | 说明 |
|--------|-----|---------|------|
| **P0** | B 块导航 | T2b | 用户截图明确要，近乎免费 |
| **P0** | C 行内 diff | T4b 配置 | 配置项 |
| **P0** | D 删除行高亮 | T4b 配置 | 配置项 |
| **P0** | G 自定义按钮 | T4b | 过验收闸门 + 中文 |
| **P1** | A 单栏 unified 视图 | T4b | 第四模式，强烈推荐 |
| **P2** | E 折叠展开 | T2b | 细节增强 |
| **P2** | F diff 报告导出 | T6b | 协作增值 |
| **P3** | H 编辑器内版本 diff | — | 暂不做 |

---

## 4. 总工期影响

- **原方案（含桌面端 Tauri + POC）**：3–5 天（单人）/ 多 Agent 并行 2–3 天。
- **纳入 A–G 增量后**：
  - A+G：+0.5–0.7 天
  - B（并入 T4）：+0.1–0.25 天
  - C+D（T4b 配置）：+0.2 天
  - E（T2b）：+0.15 天
  - F（T6b）：+0.3–0.4 天
  - **合计增量 ≈ +1.3–1.9 天**
- **修订总工期**：约 **4.5–7 天**（含桌面端 + 单栏模式 + diff 报告 + 全部增强）。多 Agent 并行（A 做单栏/三栏、B 做文件/图片、C 做导出/导航增强）可压到 **3–4 天墙钟**。

---

## 5. 结论

`@codemirror/merge` 除已规划能力外，**最高性价比的增量是 A（单栏 unified 视图）+ B（块导航）**——前者补齐第四种 review 模式（已被多家生产验证），后者用户已明确需要且近乎零成本。**F（diff 报告导出）** 提供协作增值但需自写渲染层。**H 建议排除**以防范围蔓延。

所有增量均为官方包已提供能力的胶水层，**不引入任何新依赖**，且 `baseTheme` 自动适配明暗主题，落地风险低。建议用户授权后将 A–G 并入 T2b/T4b/T6b 任务。
