# Chrome-Markdown-Edit「多栏对照 / 逐块处理」实施方案（代码级）

- **版本**：POC（两栏/三栏/单栏 unified diff + 逐块处理 + 块导航 + diff 报告导出）+ 桌面端 Tauri 同源 + fork PR 流程
- **日期**：2026-08-02（2026-08-02 17:00 据 `@codemirror/merge` 增量调研修订）
- **状态**：方案已纳入增量调研结果（A–G 采纳，H 排除），冻结待用户授权进入实现
- **实现状态**：已实现，待审计与发版（分支 `feature/compare-merge-ag`，2026-08-02；详见 `docs/compare-progress.md`「实现完成总结」）
- **范围决策**：采纳优先级 P0/P1/P2（A–G 纳入实现）；P3（H 编辑器内版本 diff）移至后续版本，本方案不实现
- **依据**：基于对 GitHub 全站多轮 `gh` 搜索（`gh search repos` / `gh search code` / `gh api repos/.../contents`）获取的可直接复用代码

> 本文件为纯方案，**不改动任何源码**（`.js`/`.ts`/`.html`/`.rs`/`.css`）。所有代码片段为「落地时抄入/改写」的目标代码，标注来源。

---

## 0. 目标与范围

将 `ricoNext/mergev`（v0.8.0）的「多栏对照 + 逐块处理」能力移植到本项目，定义为：

- **两栏对照（POC 必备）**：选 2 个 MD/TXT 文件 → 左右并排差异视图（Yours / Theirs），差异块红绿高亮 + 行号标记。
- **三栏合并（POC 进阶，建议同批）**：左 Yours / 中 Result（可编辑合并结果）/ 右 Theirs，逐块 `Accept Left` / `Accept Right`。
- **图片上传区**：拖拽/点选多张图片，插入到当前对比块（复用 `src/image-support.js`）。
- **不依赖 Git 目录**：纯文件级 diff/merge，契合项目「本地零后端」本位。
- **含桌面端 Tauri 同源**：EXE 中同样可用（本机无 Rust，桌面端构建靠远端 CI 验证）。
- **fork PR 流程**：Agent 提交(commit)/推送(push)到 `origin` + 开 PR；合并(merge)/发版(Release)由用户授权（硬禁令：禁强推/删 main）。

### 0.1 本次调研新增的增量能力（A–G 已采纳；H 排除）

基于 `gh` 对 `@codemirror/merge`(v6.12.1) 全量导出面（`index.ts`）与实现（`unified.ts`/`merge.ts`/`theme.ts`/`diff.ts`）的深挖，并经 `gh search code "unifiedMergeView"` 验证生产采用（详见 `docs/compare-extra-capabilities.md`）：

- **A 单栏 unified 视图**：`unifiedMergeView` 单栏内联对照（删除行以 widget 显示在原行上方 + Accept/Reject 按钮），与三栏并排互补；已被 metabase / marimo / Pluto.jl / beekeeper-studio / Skyvern-AI 生产采用。
- **B 块导航**：`goToNextChunk` / `goToPreviousChunk` 现成 `StateCommand`，直接绑定「上一块/下一块」按钮（用户截图明确要求）。
- **C 行内 diff**：单栏模式 `allowInlineDiffs:true`，同行内改动内联显示。
- **D 删除行语法高亮**：单栏模式 `syntaxHighlightDeletions:true`，删除的 MD 片段带语法色。
- **E 折叠展开**：`uncollapseUnchanged` 手动展开被折叠的未改区域。
- **F 导出 diff 报告**：`presentableDiff` → 可读 diff 文本（`.diff`）。**关键事实**：`presentableDiff` 返回**对齐词边界的 `Change[]`（结构化，非字符串）**，需自写约 40–60 行文本渲染层。
- **G 自定义按钮**：单栏 `mergeControls` 自定义**中文** Accept/Reject 按钮，过验收闸门 + 明暗主题适配。
- **H 编辑器内版本 diff（底层 `diff()`）**：**P3，本方案不实现**，留待后续版本（防范围蔓延，且与 compare 模块职责分离）。

---

## 1. 关键调研结论（gh 搜索可复用代码清单）

| 仓库 | 文件 | 可复用点 | 复用方式 |
|------|------|---------|---------|
| **`@codemirror/merge`（官方 CM6 包）** | `mergeview.ts`（见 ampcode/merge 镜像） | `MergeView` 原生提供：两栏/三栏、差异高亮(`highlightChanges`)、行号差异标记(`gutter`)、折叠未改(`collapseUnchanged`)、`diffConfig{scanLimit,timeout}`、对齐(`Spacers`)、逐块 `revertControls:'a-to-b'/'b-to-a'` + `renderRevertControl` | **核心依赖**，npm 安装即用，零自研 diff |
| `manaflow-ai/manaflow` | `apps/client/src/lib/codemirror/diff-merge-view.ts` | `createDiffMergeView({oldContent,newContent,extensions,parent})` 约 30 行封装 | **原样抄**入 `src/compare-merge.js` |
| `manaflow-ai/manaflow` | `apps/client/src/lib/codemirror/diff-line-number-markers.ts` | 用 `getChunks`（来自 `@codemirror/merge`）+ `lineNumberMarkers` 给差异行加 `cm-lineNumber-addition/deletion` 类 | **原样抄**入 `src/compare-line-markers.js` |
| `mdx-editor/editor` | `src/examples/cm-merge.tsx` | `MergeView` 完整用法：`orientation:'a-b'`、`revertControls`、`renderRevertControl`、只读侧 `EditorState.readOnly` | 三栏/两栏配置参考 |
| `tyx-editor/TyX` | `src-tauri/src/cmds.rs` | Tauri `#[tauri::command] fn save/open` 用 `std::fs::read_to_string` / `File::create` / `write_all` + `tauri_plugin_dialog` + `handle.dialog().file().save_file(...)` | **改后即用**桌面端读写/另存模板 |
| `PiotrTrzpil/markdown-diff-viewer` | 仓库根（纯前端，11★） | 块级 + 字符级 Markdown diff 算法（非 CodeMirror） | **备选**：若 `@codemirror/merge` 行级粒度不满足 MD 语义，参考其块级分割 |
| **`@codemirror/merge`** | `unified.ts` | `unifiedMergeView` 单栏内联合并视图 + `acceptChunk`/`rejectChunk` 逐块接受/拒绝；被 metabase/marimo/Pluto.jl 等生产采用 | **核心增量**：抄扩展组合进 `src/compare-unified.js`（A 单栏模式） |
| **`@codemirror/merge`** | `merge.ts` | `goToNextChunk`/`goToPreviousChunk` 块导航现成 `StateCommand` | **直接 import 绑定**按钮（零自研，B 块导航） |
| **`@codemirror/merge`** | `diff.ts` | `presentableDiff(a,b,config)` 返回对齐词边界的 `Change[]`（非字符串） | **导出 diff 报告**渲染源（自写文本层，F） |
| **`@codemirror/merge`** | `theme.ts` | `baseTheme` 已内置 `&light`/`&dark` 选择器 | **零成本适配**本项目明暗主题，不需自写样式 |

**降维结论**：原方案（自研 diff 算法 + 三栏 UI + 合并状态机）估 8–12 天；改用 `@codemirror/merge` 后，**核心 UI 由包提供**，仅需写胶水 + 文件/图片/导出/入口。基础 POC（两/三栏 + 图片 + 桌面端）**3–5 天**；**纳入增量 A–G 后总工期 4.5–7 天**（多 Agent 并行压到 3–4 天墙钟）。所有增量均为官方包能力的胶水层，**不新增依赖**。

---

## 2. 技术决策

1. **diff/合并引擎 = `@codemirror/merge` 的 `MergeView`**（非自研、非 `jsdiff`）。本项目已用 CodeMirror 6，零摩擦。
   - 两栏(Yours/Theirs) = `MergeView` 传 `a`+`b`，`orientation:'a-b'`。
   - 三栏(Yours/Result/Theirs) = `MergeView` 三栏模式（`a` 左只读 + 中间可编辑 merge 区 + `b` 右只读）。中间 merge 区即「Result」。
   - 逐块 `Accept Left/Right` = `revertControls:'a-to-b'/'b-to-a'` + 自定义 `renderRevertControl` 按钮。
2. **行号差异标记** = 抄 manaflow `diff-line-number-markers.ts`（`getChunks` + `lineNumberMarkers`）。
3. **图片上传** = 复用 `src/image-support.js` 的 `buildPastedImageMarkdown`、`createPastedImageFilename`、`mimeTypeToExtension`（纯函数，零改写）。
4. **文件读取**（浏览器端）= `<input type="file" multiple>` + `File.text()`；导出 = `showSaveFilePicker` 句柄留存 + `<a download>` + 剪贴板降级。
5. **桌面端** = 复用现有 `desktop/src/lib.rs` 的 `read_text_file` / `write_text_file`（已用 `std::fs` 绕开 scope），加批量读命令 + 前端 `desktop-shims.js` 垫片。
6. **入口** = ~~在 `src/editor.html` 工具栏加「对比合并」按钮~~（方案初版设想，已调整）。实际落地为 **Chrome 扩展右键菜单「打开对比合并」**：由 `public/background.js` 的 `chrome.contextMenus` 注册，点击 `chrome.tabs.create({url: chrome.runtime.getURL('src/compare.html') + '?i=' + newInstanceId()})` 新开独立 compare 实例（沿用 `newInstanceId()`，不复用编辑器状态）；**桌面端（Tauri EXE）同源复用 `src/compare.html`**，同样经右键菜单打开。（变更登记见 §6）
7. **视图模式 = 三选一（两栏 / 三栏 / 单栏 unified）**：两栏/三栏用 `MergeView`；单栏用 `unifiedMergeView`（来自 `@codemirror/merge`）。compare 页提供模式切换，统一从 `CompareFile[]` 渲染。
8. **块导航 = 直接 `import { goToNextChunk, goToPreviousChunk }`**（现成 `StateCommand`，零自研），绑「上一块/下一块」按钮/快捷键；三栏模式从对应 pane 的 `view` 触发。
9. **单栏逐块 Accept/Reject = `acceptChunk`/`rejectChunk`**（unified 视图配套），并传 `mergeControls` 函数自定义**中文**按钮（类名 `cm-compare-revert`/`compare-toolbar-btn`，避开禁用类名闸门）。
10. **单栏增强配置**：`allowInlineDiffs:true`（行内 diff，C）+ `syntaxHighlightDeletions:true`（删除行语法高亮，D，需 markdown language 扩展传入）。
11. **导出 diff 报告 = `presentableDiff` → 自写文本渲染层**（`src/compare-diff-export.js`，约 40–60 行，遍历 `Change[]` 生成 `+/-` 前缀 + 行号的可读 diff，F）。

---

## 3. 任务拆分（多 Agent 续作）

> 每个任务独立可验证（`vite build` + 单测），接口在 T1 冻结，后续任务只扩展不改。

| 任务 | 目标 | 依赖 | 输出/交付 | 可复用代码 | 估时 | 负责 Agent |
|------|------|------|-----------|-----------|------|-----------|
| **T0** | 调研冻结 + 增量修订（A–G 纳入，H 排除） | — | 本文件 + `compare-contract.md` + `compare-extra-capabilities.md` | 见 §1 | 已完成 | 规划 Agent |
| **T1** | 接入骨架 | T0 | `package.json`(+`@codemirror/merge`)、`vite.config` 多入口、`src/compare.html`、manifest `web_accessible_resources` + `background.js` 入口、契约文件 | — | 0.5d | 基建 Agent |
| **T2** | 两栏 diff + 行号标记 + 折叠展开(E) | T1 | `src/compare-merge.js`、`src/compare-line-markers.js`、`src/compare.css`、绑定 `uncollapseUnchanged` | manaflow ×2 文件 | 1.1d | UI Agent A |
| **T3** | 文件多选 + 拖拽上传 | T1 | `src/compare-files.js`（`<input multiple>` + `File.text()` + 拖拽） | `editor.html` 现有文件输入模式 | 0.5d | UI Agent B |
| **T4** | 三栏合并 + 逐块 Accept + 块导航(B) + 自定义按钮(G) + 行内/删除高亮(C/D) | T2 | `compare-merge.js` 升级三栏 + `renderRevertControl` + `goToNextChunk`/`goToPreviousChunk` + `mergeControls` 中文按钮 + `allowInlineDiffs`/`syntaxHighlightDeletions` | mdx-editor `cm-merge.tsx` | 1.7d | UI Agent A |
| **T4b** | 单栏 unified 视图(A) | T1,T2 | `src/compare-unified.js`（`unifiedMergeView` + `acceptChunk`/`rejectChunk` + 自定义 `mergeControls`） | `@codemirror/merge` `unified.ts` | 0.5d | UI Agent A |
| **T5** | 图片上传区 | T2,T3 | `src/compare-images.js`（拖拽/点选 → dataURL → 插入当前块） | `src/image-support.js` | 0.5d | UI Agent B |
| **T6** | 导出合并结果 + diff 报告(F) | T2/T4 | `src/compare-export.js` + `src/compare-diff-export.js`（`presentableDiff` → 文本） | editor 现有保存逻辑 | 0.7d | 逻辑 Agent |
| **T7** | 桌面端 Tauri 同源 | T1,T6 | `desktop/src/lib.rs` 加 `read_multiple_text_files` / `save_compare_result` 命令 + `desktop-shims.js` 垫片 | tyx-editor `cmds.rs` + 现有 `lib.rs` | 1d（构建靠 CI） | 桌面 Agent |
| **T8** | 测试 | T2–T7 | `tests/compare-diff.test.js`（diff/合并状态机）、`tests/issue-acceptance.test.js` 不引入禁用类名 | — | 1d | 测试 Agent |
| **T9** | 文档 + 发版（fork PR） | T1–T8 | README「文件对照」章节 + CHANGELOG 段 + `commit`/`push origin` + 开 PR（合并/发版由用户） | — | 0.5d | 发布 Agent |

**总工期（多 Agent 并行墙钟）**：约 **4.5–7 天**（A 做 T2/T4/T4b、B 做 T3/T5、逻辑 Agent 做 T6、桌面 Agent 做 T7 可并行）；单人串行等效约 8 天。**P3（H 编辑器内版本 diff）本方案不实现**，留待后续版本。

---

## 4. 多 Agent 续作协议

### 4.1 共享契约文件 `docs/compare-contract.md`（T0 产出，T1 落地）
定义跨 Agent 的不可变接口：
- **模块导出**：`src/compare-merge.js` 导出 `createCompareMergeView(opts): {view, destroy, getResult(): string}`；`src/compare-files.js` 导出 `pickFiles(): Promise<{name,content}[]>`；`src/compare-export.js` 导出 `exportResult(content: string)`。
- **数据结构**：`type CompareFile = { name: string; content: string }`。
- **主题 CSS 变量**：复用 `editor.css` 的 `--bg`/`--fg`/`--accent` 等（不新建变量）。
- **验收闸门**：新增 compare 页面**禁止**使用类名 `btnCenterBold` / `btnCenterBoldRed` / `styleGroup`（会触发 `tests/issue-acceptance.test.js` 变红）。
- **实例隔离**：沿用 `?i=<uuid>` 模式，compare 页独立实例。

### 4.2 进度日志 `docs/compare-progress.md`
每个任务一行：`[状态] Tn 任务名 — 负责Agent — 完成物`。状态：`pending` / `in_progress` / `done` / `blocked`。Agent 接手先读此文件认领 `pending`。

### 4.3 接口冻结
T1 定义的导出签名、数据结构、CSS 变量名，后续任务**只扩展不改**。确需变更时，由规划 Agent 更新契约并通知所有在途 Agent。

### 4.4 Agent 接手流程
1. 读 `docs/compare-contract.md` + `docs/compare-progress.md`；
2. 认领一个 `pending` 任务，改为 `in_progress`；
3. 实现 + 跑 `node --test` / `vite build` 验证；
4. 标记 `done` 并追加进度行；
5. 如遇阻塞（依赖未就绪 / 接口歧义），改 `blocked` 并说明，不擅自改契约。

---

## 5. 代码级设计（各模块关键代码）

### T1 接入骨架
**package.json**（dependencies 加）：
```json
"@codemirror/merge": "^6.0.0"
```
**vite.config.js**（多入口，参考现有 `build.rollupOptions.input` 加 `compare: 'src/compare.html'`）。

**manifest.json**（public/manifest.json）：`web_accessible_resources` 数组加
```json
{ "resources": ["src/compare.html"], "matches": ["file:///*"] }
```

**background.js**（入口，经 `chrome.contextMenus` 注册右键菜单「打开对比合并」，沿用 `newInstanceId`）：点击 → `chrome.tabs.create({ url: chrome.runtime.getURL('src/compare.html') + '?i=' + newInstanceId() })` 新开独立 compare 实例（桌面端 Tauri EXE 同源复用 `src/compare.html`）。
```js
chrome.tabs.create({ url: chrome.runtime.getURL('src/compare.html') + '?i=' + newInstanceId() });
```

### T2 两栏 diff 视图（抄 manaflow `diff-merge-view.ts`）
`src/compare-merge.js`：
```ts
import { MergeView } from "@codemirror/merge";
import type { Extension } from "@codemirror/state";

export interface CompareMergeOptions {
  oldContent: string; newContent: string;
  extensions: Extension[]; parent: HTMLElement;
}
export interface CompareMergeInstance {
  destroy(): void;
  getResult(): string;   // 三栏时取中间 merge 文档；两栏时取 b 文档
}
export function createCompareMergeView(o: CompareMergeOptions): CompareMergeInstance {
  const mv = new MergeView({
    a: { doc: o.oldContent, extensions: [...o.extensions, EditorState.readOnly.of(true)] },
    b: { doc: o.newContent, extensions: [...o.extensions] },
    parent: o.parent,
    highlightChanges: true,
    gutter: true,
    collapseUnchanged: { margin: 3, minSize: 6 },
    diffConfig: { scanLimit: 500, timeout: 1500 },
  });
  return {
    destroy: () => mv.destroy(),
    getResult: () => mv.b.state.doc.toString(),   // 三栏改取中间 editor
  };
}
```

`src/compare-line-markers.js`（**原样抄** manaflow `diff-line-number-markers.ts`，仅改 import 路径为 `@codemirror/merge`）：
- 用 `getChunks(state)` 计算差异块，给 `a` 侧加 `cm-lineNumber-deletion`、`b` 侧加 `cm-lineNumber-addition`（对应 Yours/Theirs）。

### T3 文件多选 + 拖拽
`src/compare-files.js`：
```ts
export async function pickFiles(accept = ".md,.markdown,.mdown,.mkd,.mkdn,.txt"): Promise<CompareFile[]> {
  const input = document.createElement("input");
  input.type = "file"; input.multiple = true; input.accept = accept;
  return new Promise((resolve) => {
    input.onchange = async () => {
      const files = Array.from(input.files ?? []);
      resolve(await Promise.all(files.map(async f => ({ name: f.name, content: await f.text() }))));
    };
    input.click();
  });
}
```
（拖拽区：`dragover`/`drop` 读 `DataTransfer.files` 复用同逻辑。）

### T4 三栏合并 + 逐块 Accept + 块导航 + 自定义按钮
升级 `createCompareMergeView`：`a`=Yours(只读)、中间 merge=Result(可编辑)、`b`=Theirs(只读)。`renderRevertControl` 自定义中文按钮（类名 `cm-compare-revert`，避开禁用类名闸门）：
```ts
renderRevertControl: () => {
  const btn = document.createElement("button");
  btn.className = "cm-compare-revert";
  btn.textContent = "⇄";
  btn.title = "接受此块到结果";
  return btn;
}
```
**块导航（B，P0）**：直接 `import { goToNextChunk, goToPreviousChunk } from "@codemirror/merge"`，绑「上一块/下一块」按钮/快捷键（现成 `StateCommand`，零自研）。三栏模式从对应 pane 的 `view` 触发：
```ts
import { goToNextChunk, goToPreviousChunk } from "@codemirror/merge";
// 工具栏「下一块」onclick = () => goToNextChunk({ state: mv.a.state, dispatch: mv.a.dispatch })
// 工具栏「上一块」onclick = () => goToPreviousChunk({ state: mv.a.state, dispatch: mv.a.dispatch })
```
**单栏自定义按钮（G，P0）** 见 T4b；**行内 diff / 删除行高亮（C/D，P0）** 见 T4b 配置。

### T4b 单栏 unified 视图（A，P1）
`src/compare-unified.js`：抄 `@codemirror/merge` 的 `unifiedMergeView` 扩展组合（已读 `unified.ts` 源码），传 `original` + 配置：
```ts
import { unifiedMergeView, acceptChunk, rejectChunk } from "@codemirror/merge";
import { EditorView } from "@codemirror/view";
import type { Extension } from "@codemirror/state";

export interface CompareUnifiedOptions { original: string; extensions: Extension[]; parent: HTMLElement }
export interface CompareUnifiedInstance {
  destroy(): void;
  acceptAt(pos?: number): boolean;   // 封装 acceptChunk(view, pos)
  rejectAt(pos?: number): boolean;   // 封装 rejectChunk(view, pos)
  getResult(): string;               // 取当前编辑器内容
}
export function createCompareUnifiedView(o: CompareUnifiedOptions): CompareUnifiedInstance {
  const view = new EditorView({
    doc: o.original,
    extensions: [
      ...o.extensions,
      unifiedMergeView({
        original: o.original,
        highlightChanges: true,
        gutter: true,
        allowInlineDiffs: true,            // C 行内 diff
        syntaxHighlightDeletions: true,   // D 删除行语法高亮（需 markdown language 扩展传入）
        mergeControls: (type, action) => { // G 自定义中文按钮
          const btn = document.createElement("button");
          btn.className = "cm-compare-revert";
          btn.textContent = type === "accept" ? "接受" : "拒绝";
          btn.onmousedown = action;
          return btn;
        },
      }),
    ],
    parent: o.parent,
  });
  return {
    destroy: () => view.destroy(),
    acceptAt: (pos) => acceptChunk(view, pos),
    rejectAt: (pos) => rejectChunk(view, pos),
    getResult: () => view.state.doc.toString(),
  };
}
```
> 说明：`unifiedMergeView` 为「单栏 + original 对照」模式，删除行以 widget 显示在原行上方；`acceptChunk`/`rejectChunk` 为包提供的逐块接受/拒绝。`baseTheme` 已含 `&light`/`&dark` 选择器，零成本适配明暗主题。

### T5 图片上传区（复用 `src/image-support.js`）
`src/compare-images.js`：拖拽/点选 `<input type="file" accept="image/*" multiple>` → 生成 `FileReader.readAsDataURL` → 调 `buildPastedImageMarkdown({alt, imagePath: dataUrl})` → 插入当前块光标处。
```ts
import { buildPastedImageMarkdown, createPastedImageFilename, mimeTypeToExtension } from "./image-support";
```

### T6 导出合并结果
`src/compare-export.js`（句柄留存写回 + `<a download>` + 剪贴板降级）：
```ts
let savedHandle: FileSystemFileHandle | null = null;
export async function exportResult(content: string, filename = "merged.md") {
  try {
    if (!savedHandle) {
      savedHandle = await (window as any).showSaveFilePicker({ suggestedName: filename, types:[{description:"Markdown",accept:{"text/markdown":[".md"]}}] });
    }
    const w = await savedHandle.createWritable(); await w.write(content); await w.close();
  } catch {
    const blob = new Blob([content], { type: "text/markdown" });
    const a = document.createElement("a"); a.href = URL.createObjectURL(blob); a.download = filename; a.click();
  }
}
```

### T6b 导出 diff 报告（F，P2）
`src/compare-diff-export.js`：`presentableDiff` 返回**对齐词边界的 `Change[]`（非字符串）**，需自写文本渲染层（约 40–60 行）生成 git 风格可读 diff：
```ts
import { presentableDiff, type Change } from "@codemirror/merge";
import { exportResult } from "./compare-export";

export function buildDiffText(a: string, b: string): string {
  const changes: readonly Change[] = presentableDiff(a, b, { scanLimit: 500, timeout: 1500 });
  const linesA = a.split("\n"), linesB = b.split("\n");
  let out = "";
  for (const c of changes) {
    for (let i = c.fromA; i < c.toA; i++) out += `- ${linesA[i]}\n`; // 删除行
    for (let i = c.fromB; i < c.toB; i++) out += `+ ${linesB[i]}\n`; // 插入行
  }
  return out;
}
export async function exportDiffReport(a: string, b: string, filename = "diff.diff") {
  await exportResult(buildDiffText(a, b), filename); // 复用 exportResult 写回/下载降级
}
```
> 注意：真实渲染需处理 chunk 间未改上下文行与行号对齐；建议 `node --test` 覆盖（行号、`+/-` 前缀、多 chunk 拼接）。`presentableDiff` 已替我们完成词边界对齐与相邻合并。

### T7 桌面端 Tauri 同源
`desktop/src/lib.rs`（在现有 `invoke_handler!` 注册，沿用 `std::fs` 模式，参考 tyx-editor `cmds.rs`）：
```rust
#[tauri::command]
fn read_multiple_text_files(paths: Vec<String>) -> Result<Vec<(String, String)>, String> {
    paths.into_iter()
        .map(|p| std::fs::read_to_string(&p).map(|c| (p, c)).map_err(|e| format!("读取失败 {}: {}", p, e)))
        .collect()
}
#[tauri::command]
fn save_compare_result(path: String, content: String) -> Result<(), String> {
    std::fs::write(&path, content).map_err(|e| format!("写入失败 {}: {}", path, e))
}
```
`desktop-shims.js`（扩展现有 chrome/File System Access 垫片，让 compare 页在 EXE 中调 `invoke('read_multiple_text_files')` / `invoke('save_compare_result')`）。**本机无 Rust，构建验证靠推远端 CI。**

### T8 测试
`tests/compare-diff.test.js`（node:test，纯逻辑）：
- `MergeView` diff 正确性（用 `@codemirror/merge` 的 `Chunk.build` 或 `getChunks` 断言块数）；
- `getResult()` 在 Accept 后返回预期内容；
- 文件解析数据结构。
`tests/issue-acceptance.test.js`：确保 compare 页未出现 `btnCenterBold`/`btnCenterBoldRed`/`styleGroup`。

### T9 文档 + 发版（fork PR）
- README 加「文件对照 / 多栏合并」章节（功能表 + 截图位）；
- CHANGELOG 加 `## [x.y.z] - 日期` 段；
- `git commit` + `git push origin feat/compare` + `gh pr create --base main`（合并/打 tag/发版由用户授权）。

---

## 6. 风险与缓解

| 风险 | 缓解 |
|------|------|
| 真实浏览器端 UI 渲染我无法验证 | T2/T4 后由用户做浏览器验收（每阶段 1 次） |
| `@codemirror/merge` 行级粒度 vs MD 块级语义 | 备选参考 `markdown-diff-viewer` 块级算法；或 `diffConfig.scanLimit` 调大 |
| 多 Agent 上下文断裂 | §4 契约 + 进度日志 + 接口冻结，Agent 接手先读 |
| 桌面端本机无 Rust，构建靠 CI | T7 代码写完后推 fork 触发 GitHub Actions 验证；不本机编译 |
| 验收闸门误触禁用类名 | §4.1 明确禁用类名清单，T8 加断言 |
| 长任务单轮上下文溢出 | 拆 T1–T9 独立任务 + 可能 spawn 子 Agent 续做 |

---

## 7. 验收与发版流程（fork PR）

1. Agent 在 `feat/compare` 分支实现 T1–T8，跑 `node --test` + `npm run build` 全绿。
2. Agent `git commit`（含 README/CHANGELOG 文档同步，过门禁）+ `git push origin feat/compare`。
3. Agent 开 PR：`gh pr create --base main --title "feat: 多栏对照/逐块合并"`。
4. **暂停**，等用户授权：合并(merge) PR + 打 tag + 创建 Release 挂 zip（遵循「发布≠标签」硬规则）。
5. **硬禁令**：禁强推/删 main；标签移动用「删远端标签 + 重推」。

---

## 8. 后续可选项（不在本 POC 范围）

- 自动「两端都保留」选项（除 Accept Left/Right 外）。
- 大文件（>200KB）虚拟滚动 / 按段 diff 降级。
- 合并结果内联图片写回 `images/` 子目录（参照现有 `images/` 相对路径约定）。
- **H 编辑器内「版本对比」（底层 `diff()` 调用）：P3，本方案不实现**，留待后续版本（防范围蔓延，且与 compare 模块职责分离）。
