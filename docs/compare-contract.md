# compare 模块共享契约（多 Agent 续作硬接口）

> 本文件为 `COMPARE_IMPLEMENTATION_PLAN.md` §4 的落地契约。**冻结**：后续任务只扩展不改；确需变更须由规划 Agent 更新并通知在途 Agent。

## 1. 模块导出签名（不可变）

| 模块文件 | 导出 | 签名 |
|---------|------|------|
| `src/compare-merge.js` | `createCompareMergeView` | `(o: CompareMergeOptions) => CompareMergeInstance` |
| `src/compare-merge.js` | 类型 `CompareMergeOptions` | `{ oldContent: string; newContent: string; extensions: Extension[]; parent: HTMLElement }` |
| `src/compare-merge.js` | 类型 `CompareMergeInstance` | `{ destroy(): void; getResult(): string }` |
| `src/compare-files.js` | `pickFiles` | `(accept?: string) => Promise<CompareFile[]>` |
| `src/compare-export.js` | `exportResult` | `(content: string, filename?: string) => Promise<void>` |
| `src/compare-images.js` | `insertImagesAtCursor` | `(files: File[], getCursor: () => number) => Promise<void>` |
| `src/compare-unified.js` | `createCompareUnifiedView` | `(o: CompareUnifiedOptions) => CompareUnifiedInstance` |
| `src/compare-unified.js` | 类型 `CompareUnifiedOptions` | `{ original: string; extensions: Extension[]; parent: HTMLElement }` |
| `src/compare-unified.js` | 类型 `CompareUnifiedInstance` | `{ destroy(): void; acceptAt(pos?): boolean; rejectAt(pos?): boolean; getResult(): string }` |
| `src/compare-nav.js` | `bindChunkNavigation` | `(view: EditorView) => { next(): void; prev(): void }`（封装 `goToNextChunk`/`goToPreviousChunk`） |
| `src/compare-diff-export.js` | `exportDiffReport` | `(a: string, b: string, filename?: string) => Promise<void>` |

> **契约最小接口 vs 实际超集**：上表为跨 Agent 续作的**最小接口**。实际落地中 `createCompareMergeView` / `createCompareUnifiedView` 返回的是**超集实例**，在最小字段（`getResult` / `destroy` / 单栏 `acceptAt`/`rejectAt`）之外，还包含以下扩展字段，调用方可直接使用：
> - `CompareMergeOptions` 扩展：`layout`（`'two'|'three'`）、`a` / `b`（`CompareFile`）、`aReadonly` / `bReadonly`、`collapseUnchanged`；`oldContent`/`newContent` 作为 `a.content`/`b.content` 的兼容别名保留。
> - `CompareMergeInstance` 扩展：`mv`（底层 `MergeView`）、`a` / `b`（`EditorView`）、`theirsView`（`EditorView|null`）、`navView`（块导航活动视图）、`getYours()` / `getTheirs()`、`setCollapse(collapsed)`、`acceptTheirsAt(pos?)`。
> - `CompareUnifiedOptions` 扩展：`doc`（当前可编辑文档初值，默认 = `original`）、`collapseUnchanged`。
> - `CompareUnifiedInstance` 扩展：`view`（`EditorView`）、`navView`、`nextChunk()` / `prevChunk()`（块导航）、`expandAt(pos?)`（展开光标处被折叠的未改区域）。
>
> 新任务在扩展接口时仍遵循「只扩展不改」原则；如需新增不可变字段，由规划 Agent 更新本契约并通知在途 Agent。

## 2. 数据结构（不可变）

```ts
export interface CompareFile { name: string; content: string }
```

## 3. 主题 CSS 变量（复用，不新建）

- 复用 `src/editor.css` 既有变量：`--bg` / `--fg` / `--accent` / `--border` 等。
- 新增对比专用类仅使用上述变量，禁止硬编码颜色（保证亮/暗主题自动适配）。
- `MergeView` 容器类 `.cm-mergeView` / `.cm-merge-a` / `.cm-merge-b` 可直接用官方样式，覆盖用 CSS 变量。

## 4. 验收闸门（禁用类名清单）

新增 compare 页面**禁止**使用以下类名（会触发 `tests/issue-acceptance.test.js` 变红）：
- `btnCenterBold`
- `btnCenterBoldRed`
- `styleGroup`

自定义按钮一律用新类名（如 `cm-compare-revert`、`compare-toolbar-btn`）。

## 5. 实例隔离

- 沿用 `?i=<uuid>` 模式（`background.js` 的 `newInstanceId()`）。
- compare 页独立实例，不共享编辑器状态。

## 6. diff/合并引擎

- 统一使用 `@codemirror/merge` 的 `MergeView`，**禁止**自研 diff 算法或引入 `jsdiff`（除非 §6 风险触发块级备选）。
- 两栏：传 `a`+`b`，`orientation:'a-b'`。
- 三栏：左 `a`(Yours,只读) + 中间可编辑 merge(Result) + 右 `b`(Theirs,只读)。
- 逐块 Accept = `revertControls:'a-to-b'/'b-to-a'` + `renderRevertControl` 自定义按钮。
- **单栏 unified 模式** = `unifiedMergeView({original, highlightChanges, gutter, allowInlineDiffs, syntaxHighlightDeletions, mergeControls})`（来自 `@codemirror/merge`），逐块 Accept/Reject = `acceptChunk`/`rejectChunk`。
- **块导航** = `goToNextChunk`/`goToPreviousChunk`（现成 `StateCommand`，直接 import 绑定）。
- **视图模式切换**：compare 页支持「两栏 / 三栏 / 单栏 unified」三选一，统一从 `CompareFile[]` 渲染。
- **导出 diff 报告** = `presentableDiff(a,b,config)` 返回对齐词边界的 `Change[]`，由 `compare-diff-export.js` 自写文本渲染层。
- **H 排除**：底层 `diff()` 直接调用（编辑器内版本对比）**本方案不实现**，留待后续版本。
