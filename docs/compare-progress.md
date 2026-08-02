# compare 模块进度日志（多 Agent 续作状态机）

> 状态：`pending` / `in_progress` / `done` / `blocked`
> Agent 接手流程：读 `compare-contract.md` + 本文件 → 认领 `pending` → 改 `in_progress` → 实现+验证 → 改 `done`（或 `blocked` 并说明）。

| 状态 | 任务 | 负责 Agent | 完成物 | 依赖 |
|------|------|-----------|--------|------|
| `[done]` | T0 调研冻结 + 增量修订（A–G 纳入，H 排除） | 规划 Agent | `COMPARE_IMPLEMENTATION_PLAN.md` + `compare-contract.md` + `compare-extra-capabilities.md` | — |
| `[done]` | T1 接入骨架 | 基建 Agent | `package.json`(+`@codemirror/merge` ^6.12.1)、`vite.config` 多入口(`compare`)、`src/compare.html`、`src/compare.js`、manifest `web_accessible_resources`(+`src/compare.html`)+`contextMenus` 权限、`background.js` 右键菜单入口 | T0 |
| `[done]` | T2 两栏 diff + 行号标记 + 折叠展开(E) | UI Agent A | `src/compare-merge.js`、`src/compare-line-markers.js`、`src/compare.css`、`src/compare-nav.js`、绑定 `uncollapseUnchanged`（setCollapse / 单栏 expandAt） | T1 |
| `[done]` | T3 文件多选+拖拽 | UI Agent B | `src/compare-files.js` | T1 |
| `[done]` | T4 三栏合并+逐块 Accept+块导航(B)+自定义按钮(G)+行内/删除高亮(C/D) | UI Agent A | `compare-merge.js` 三栏 + `renderRevertControl` 中文按钮 + `goToNextChunk`/`goToPreviousChunk`（bindChunkNavigation）+ 三栏 acceptTheirsAt + 单栏 `allowInlineDiffs`/`syntaxHighlightDeletions` 在 `compare-unified.js` | T2 |
| `[done]` | T4b 单栏 unified 视图(A) | UI Agent A | `src/compare-unified.js`（`unifiedMergeView`+`acceptChunk`/`rejectChunk`+自定义中文 `mergeControls`） | T1,T2 |
| `[done]` | T5 图片上传区 | UI Agent B | `src/compare-images.js` | T2,T3 |
| `[done]` | T6 导出合并结果 + diff 报告(F) | 逻辑 Agent | `src/compare-export.js`（句柄留存/下载/剪贴板三级）+ `src/compare-diff-export.js`（`presentableDiff`→git 风格文本） | T2/T4 |
| `[done]` | T7 桌面端 Tauri 同源 | 桌面 Agent | `desktop/src/lib.rs` 新增 `read_multiple_text_files` / `save_compare_result` 命令 + `src/compare-shims.js` 桥接垫片 | T1,T6 |
| `[done]` | T8 测试 | 测试 Agent | `tests/compare-diff.test.js`(19 用例：presentableDiff/diff 集成 + buildDiffText + countChunks/bindChunkNavigation 安全降级) + `tests/compare-acceptance.test.js`(compare 模块禁用类名闸门) + 修复 compare.js 挂载 | T2–T7 |
| `[done]` | T9 文档+发版准备 | 文档 Agent | README「文件对照/多栏合并」章节 + CHANGELOG `1.4.16` 段 + 本进度日志更新（commit/push/PR 由 lead 统一处理） | T1–T8 |

## 阻塞记录
（无）

## 增量任务纳入说明（2026-08-02 17:00 据 gh 调研修订）
> 来源：`docs/compare-extra-capabilities.md`。采纳优先级 **P0/P1/P2（A–G 纳入实现）**；**P3（H 编辑器内版本 diff）排除，留待后续版本**。
> 增量已并入主任务表：B 块导航 + E 折叠展开 → T2/T4；A 单栏 unified + C/D 配置 + G 自定义按钮 → 新增 **T4b**；F diff 报告导出 → T6。
> 均为 `@codemirror/merge` 已提供能力的胶水层，**不新增依赖**。
> **总工期（多 Agent 并行墙钟）**：约 4.5–7 天（A 做 T2/T4/T4b、B 做 T3/T5、逻辑 Agent 做 T6、桌面 Agent 做 T7 可并行）；单人串行等效约 8 天。

---

## 实现完成总结

- **日期**：2026-08-02
- **分支**：`feature/compare-merge-ag`（基于 `main` @ `v1.4.14`）
- **实现状态**：代码已实现，待审计（code-review-combo）与发版（由用户/Lead 授权合并、打 tag、Release）。
- **模块文件清单**（全部位于 `src/`，与 `docs/compare-contract.md` 一致）：
  - `src/compare.js` —— 页面控制器（三视图切换、工具栏按钮、文件/图片/导出/导航绑定）
  - `src/compare-merge.js` —— 两栏 / 三栏 `MergeView` 封装（`createCompareMergeView`）
  - `src/compare-unified.js` —— 单栏 `unifiedMergeView` 封装（`createCompareUnifiedView`）
  - `src/compare-nav.js` —— 块导航封装（`bindChunkNavigation`，增量 B）
  - `src/compare-line-markers.js` —— 行号差异标记（`applyCompareLineMarkers`）
  - `src/compare-files.js` —— 文件多选 + 拖拽（`pickFiles` / `enableFileDropZone`）
  - `src/compare-images.js` —— 图片插入（`insertImagesAtCursor` / `bindCompareEditorView` / `bindImageToolbarButton`）
  - `src/compare-export.js` —— 导出合并结果（句柄留存/下载/剪贴板降级）
  - `src/compare-diff-export.js` —— 导出 diff 报告（`buildDiffText` / `exportDiffReport`，增量 F）
  - `src/compare-shims.js` —— 浏览器/桌面统一文件读写垫片（桥接 Tauri `read_multiple_text_files` / `save_compare_result`）
  - `src/compare.html` —— 新增页面入口；`vite.config.js` 多入口 `compare`；`public/manifest.json` 加 `web_accessible_resources` + `contextMenus` 权限；`public/background.js` 右键菜单「打开对比合并」
  - `desktop/src/lib.rs` —— 新增 `read_multiple_text_files` / `save_compare_result` Tauri 命令
- **构建 / 测试状态占位**：
  - 全部新建 `.js` 已通过 `node --check` 校验（语法校验通过）。
  - `vite build` 重新生成 `dist/` 待 CI 验证（桌面端本机无 Rust，构建靠推远端 GitHub Actions）。
  - 单元测试 `tests/compare-diff.test.js` 等由测试 Agent 跟进（见 T8，当前 `[pending]`）。
- **与契约一致性**：导出签名、`CompareFile = {name,content}` 数据结构、禁用类名清单（`btnCenterBold`/`btnCenterBoldRed`/`styleGroup` 未使用，自定义按钮一律 `cm-compare-revert`/`cm-compare-chunk-btn`/`compare-toolbar-btn`）、明暗主题复用 `--bg`/`--fg`/`--accent`/`--border` 变量——均与 `docs/compare-contract.md` 一致。
- **已知说明（如实标注，不影响发行）**：`compare-shims.js` 已在 `compare-files.js`（`pickFiles`）与 `compare-export.js`（`saveFile`）的 Tauri 分支接通，调用专用 Tauri 命令 `read_multiple_text_files` / `save_compare_result`；桌面保存经 `dialog.save` 取得绝对路径，再交由 `save_compare_result` 写回。
