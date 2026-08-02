# 实施方案（代码级）：A-4 粘贴为 Markdown · A-5 自动保存+快照 · 方案 A 自绘中文查/替面板

> 版本：基于 v1.4.13 代码现状制定 · 制定日期：2026-08-02
> 范围：仅实施方案与可复用代码，**不修改任何 `src/` 源码**（本文件为规划文档）。
> 放弃项（已确认）：A-1 可视化表格编辑器、A-2 命令面板+文件切换器、Boost 正则表达式。

---

## 0. GitHub 实证参考来源（已用 `gh` + `browser-skill` 实例 819fdea7 检索并读取源码）

| 仓库 / 文件 | 贡献 | 借鉴点 |
| --- | --- | --- |
| **typster-io/typster** `assets/js/cm_search_panel.js` | CM6 自绘查/替面板（生产级） | 方案 A 蓝本：`makeSearchPanel(view)` 返回 `{dom, top, mount, update, destroy}`，用 `setSearchQuery`/`getSearchQuery`/`SearchQuery`/`findNext`/`findPrevious`/`replaceNext`/`replaceAll`/`selectMatches`/`closeSearchPanel` + `search({ createPanel })` |
| **overleaf/overleaf** `.../visual/paste-html.ts` | CM6 `domEventHandlers({paste})` 拦截 HTML | A-4 范式：`clipboardData.types.includes('text/html')` 才拦截；`return true` 消费、`return false` **回退默认粘贴**（与图片共存关键） |
| **lumen-notes/lumen** `src/codemirror-extensions/paste.ts` | CM6 原生粘贴扩展 | A-4 插入方式：`view.dispatch({ changes:{from,to,insert}, selection })` + `event.preventDefault()` |
| **cbrake/thunderbird-markdown-compose** `src/paste.js` | 剪贴板 HTML→MD 启发式 | A-4 `FORMATTING_SELECTOR` 判定：仅当 HTML 含有意义格式时才转换，否则放行默认粘贴 |
| **michaelcuneo/markdown-editor** `.../autoSavePlugin.ts` | CM6/PM 防抖自动保存 | A-5 `debounce(fn, delay)` 工具 + `getStorageKey(base, docId)` 按文档分键 + `update()` 调 `save()`、`destroy()` 调 `save.cancel()` |
| **ayanimea/aurorae-haven** `src/utils/notes/versionHistory.js` | 版本历史快照环 | A-5 `VersionHistory` 类：`save()` 用 `unshift` + 截断 `maxVersions`，`restore(id)`，`generateDiff()` |

---

## 1. 方案 A — 自绘中文查找/替换面板

### 1.1 目标
用中文 UI 替换 CM6 默认英文小窗（Ctrl+F / 工具栏"查找"按钮触发），保留官方搜索语义（命中高亮、正则、整词、大小写），新增"实时命中计数（X / Y）"与"全选匹配（多光标）"。

### 1.2 复用 API（全部已在 `@codemirror/search` 导出，已核验）
`search` / `searchKeymap` / `getSearchQuery` / `setSearchQuery` / `closeSearchPanel` / `SearchQuery` / `findNext` / `findPrevious` / `replaceNext` / `replaceAll` / `selectMatches` / `openSearchPanel`

### 1.3 新增文件：`src/search-panel.js`
直接改编自 typster `cm_search_panel.js`（已读源码，MIT/Apache 友好，核心逻辑可照搬，仅做中文 UI 与本项目样式类适配）。关键函数签名：

```js
// src/search-panel.js
import {
  search, getSearchQuery, setSearchQuery, SearchQuery,
  findNext, findPrevious, replaceNext, replaceAll,
  selectMatches, closeSearchPanel,
} from '@codemirror/search';

const MATCH_CAP = 2000;

// 轻量 DOM 构造器（typster 的 el()，可直接用）
function el(tag, props = {}, children = []) { /* ...同 typster... */ }

export function makeSearchPanel(view) {
  const dom = el('div', { className: 'md-search-panel', role: 'search' });
  // 查找行：输入 + 计数 + [区分大小写][正则][整词] + [上一个][下一个][全选][关闭]
  // 替换行：输入 + [替换][替换全部]
  // 中文文案：placeholder="查找"/"替换"，title="上一个匹配 (⇧⏎)" 等
  // ...（完整实现见 typster 源码，逐行改为中文 + 本项目 .md-search-* 样式类）

  function buildQuery() {
    return new SearchQuery({
      search: findInput.value,
      replace: replaceInput.value,
      caseSensitive: tCase.getAttribute('aria-pressed') === 'true',
      regexp: tRegex.getAttribute('aria-pressed') === 'true',
      wholeWord: tWord.getAttribute('aria-pressed') === 'true',
    });
  }
  function commit() {
    const q = buildQuery();
    if (!q.eq(getSearchQuery(view.state))) view.dispatch({ effects: setSearchQuery.of(q) });
  }
  function debouncedCommit() { clearTimeout(t); t = setTimeout(commit, 120); }
  function countMatches(query) {            // 复用官方 query.getCursor
    const cursor = query.getCursor(view.state);
    let total = 0, current = 0; const step = cursor.next();
    while (!step.done) { total++; /* 比对 selection 定位 current */ step = cursor.next(); }
    return { total, current };
  }
  function renderCount() { /* 无结果 / X / Y / 无效正则（中文） */ }
  function syncFromQuery() { /* 反向同步开关状态 */ }

  // 接线：input→debouncedCommit；toggle click→commit；Enter→findNext/findPrevious；
  // Esc→closeSearchPanel；btnReplace→replaceNext；btnReplaceAll→replaceAll；btnSelectAll→selectMatches
  return {
    dom, top: true,
    mount() { syncFromQuery(); renderCount(); findInput.focus(); findInput.select(); },
    update(update) {
      if (update.transactions.some(tr => tr.effects.some(e => e.is(setSearchQuery))))
        syncFromQuery();
      if (update.docChanged || update.selectionSet) renderCount();
    },
    destroy() { clearTimeout(t); },
  };
}
```

### 1.4 改动 `src/editor.js`
| 位置 | 改动 |
| --- | --- |
| **第 20 行** import | 在 `@codemirror/search` 导入中**追加**：`setSearchQuery, closeSearchPanel, replaceNext, replaceAll, selectMatches, SearchQuery`（`search, searchKeymap, highlightSelectionMatches, openSearchPanel, getSearchQuery` 已存在） |
| **第 403 行** `search(),` | 改为 `search({ createPanel: makeSearchPanel }),`（注入自绘面板；默认英文面板即被替换） |
| **第 2126-2140 行** `btnFind` 处理 | 基本**不动**：仍 `openSearchPanel(editor)`；因 `search({createPanel})` 已配置，`openSearchPanel` 自动打开我们的中文面板。可选增强：用当前选中文本预填 `findInput`（`openSearchPanel` 本身已会预填选区，无需额外代码） |
| **扩展挂载处**（imports 顶部） | `import { makeSearchPanel } from './search-panel.js';` |

> 说明：`searchKeymap`（第 409 行）保留，Ctrl+F 仍走 `openSearchPanel` → 命中我们的面板。`getSearchQuery` 在现有 `updateListener`（第 466 行）中的探针逻辑**继续兼容**（我们的面板同样通过 `setSearchQuery` 写入同一搜索状态字段）。

### 1.5 样式 `src/editor.css`
新增 `.md-search-panel`（定位在编辑器顶部浮层）、`.md-search-panel__row`、`.md-search-panel__input`、`.md-search-panel__count`、`.md-search-panel__btn` 及 `.is-active` 高亮（开关按下的视觉反馈）。约 60–90 行 CSS，参照 typster 的 `ts-cm-search*` 结构。

### 1.6 风险与注意
- `search({ createPanel })` 是 `@codemirror/search` 官方配置项（typster 已验证），但需确认本工程锁定的 `(@codemirror/search` 版本支持——v6 全系支持，已导入 `setSearchQuery` 即证明版本足够。
- 现有第 466 行 `countMatches(docText, q)`（自定义正则计数）与面板内 `query.getCursor` 计数并存无冲突；面板用官方 cursor，更准确（支持正则/整词）。

---

## 2. A-4 — 粘贴为 Markdown

### 2.1 目标
从网页/富文本编辑器复制内容（含表格、列表、标题、链接、加粗等）时，粘贴得到干净 Markdown，而非原始 HTML；**纯文本与图片粘贴保持原有行为不变**。

### 2.2 复用
- **本项目 `src/html-to-markdown.js`**：`htmlToMarkdown(html, { DOMParserImpl, parseHTML })`，浏览器端默认 `globalThis.DOMParser`，已完整覆盖 `table / blockquote / callout / 任务列表 / code / a / img / hr` 等。**无需引入 Turndown。**
- **本项目 `src/editor.js:2535` `initPasteImageSupport()`**：现有 `editor.contentDOM.addEventListener('paste', ...)` 图片处理逻辑（保留）。
- **本项目 `src/editor.js:2570` `insertMarkdownSnippet(snippet)`**：已处理光标处插入与换行补齐（复用，避免重复实现）。

### 2.3 改动 `src/editor.js:2535` `initPasteImageSupport`（合并图片 + HTML 两分支）
将原函数体改为"图片优先 → 富文本 HTML→MD → 其余放行默认"。

```js
// 在文件顶部（或 search-panel 同区）新增启发式（改编自 thunderbird paste.js）
const FORMATTING_SELECTOR = [
  'a[href]', 'img', 'b', 'strong', 'i', 'em', 'code', 'pre', 'blockquote',
  'ul', 'ol', 'li', 'table', 'h1', 'h2', 'h3', 'h4', 'h5', 'h6', 'hr', 's', 'del', 'strike',
].join(',');

function hasRichMarkdownFormatting(html) {
  try {
    const doc = new DOMParser().parseFromString(html, 'text/html');
    return !!doc.body.querySelector(FORMATTING_SELECTOR);
  } catch { return false; }
}

function initPasteImageSupport() {
  editor.contentDOM.addEventListener('paste', async (event) => {
    const cd = event.clipboardData;
    if (!cd) return;

    // —— 1) 图片优先（保持原有全部逻辑）——
    const items = Array.from(cd.items || []);
    const imageItem = items.find((it) => it.type.startsWith('image/'));
    if (imageItem) {
      const file = imageItem.getAsFile();
      if (file) {
        event.preventDefault();
        try {
          const { imagePath, storageMode } = await persistPastedImage(file);
          insertMarkdownSnippet(buildPastedImageMarkdown({ alt: 'pasted-image', imagePath }));
          showToast(storageMode === 'file'
            ? `图片已保存并插入: ${imagePath}` : '图片已以内嵌 data URL 插入 Markdown', 'success');
        } catch (err) { showToast('粘贴图片失败: ' + err.message, 'error'); }
      }
      return;
    }

    // —— 2) 富文本 HTML → Markdown（A-4 新增）——
    const html = cd.getData('text/html');
    if (html && hasRichMarkdownFormatting(html)) {
      const md = htmlToMarkdown(html);
      const plain = (cd.getData('text/plain') || '').trim();
      // 仅当转换结果确实比纯文本多了结构化内容时才拦截，避免破坏纯文本粘贴手感
      if (md && md.trim() && md.trim() !== plain) {
        event.preventDefault();
        insertMarkdownSnippet(md);
        return;
      }
    }
    // —— 3) 其余（纯文本等）放行默认粘贴 ——
  });
}
```

### 2.4 顶部 import 补充
`import { htmlToMarkdown } from './html-to-markdown.js';`（第 1 行附近，与其他 import 同区）。

### 2.5 风险与注意
- **共存正确性**：图片分支 `return` 在前，HTML 分支在其后；纯文本/无图无格式时走默认粘贴，**现有纯文本与图片行为零回归**。
- `hasRichMarkdownFormatting` 启发式确保"从记事本复制的纯文本（即使带 `<div>` 包装）"不被无意义转换（thunderbird 同款逻辑）。
- `htmlToMarkdown` 内部 `normalizeMarkdown` 会压缩多余空行，需确认与现有预览回写测试（`tests/`）无冲突（该函数在 BUG-1/3 修复中已稳定）。
- 可选增强（非必需）：参照 overleaf 忽略 `application/vnd.code.copymetadata` / `vscode-editor-data`，避免 VS Code 复制产生的伪 HTML 被误转；当前 `FORMATTING_SELECTOR` 已天然过滤大部分情况，可暂缓。

---

## 3. A-5 — 自动保存 + 快照

### 3.1 目标
- **自动保存**：编辑停顿时（防抖 ~800ms）把当前文档写入 `chrome.storage.local` 作为**可恢复草稿**；重新打开若草稿比已保存文件新，提示恢复（扩展现有 `session-restore.js` 的 `lastFile` 思路，但不静默覆盖真实文件）。
- **快照**：按时间/变更次数周期性把文档压入**快照环**（最多 30 份），提供"快照"面板可回滚到任意历史版本。

### 3.2 复用
- **本项目 `src/editor.js:431` `EditorView.updateListener.of`**：现有 `if (update.docChanged) { updatePreview(); ... }` 是天然触发点，追加 `scheduleAutosave()` 即可。
- **本项目 `src/editor.js:1652` `handleSave()`**：写文件的权威实现（快照恢复时调用其写入语义，或复用 `editor.state.doc.toString()`）。
- **本项目 `src/session-restore.js`**：`chrome.storage.local` 读写范式（`rememberLastFile` / `loadLastFile` / `clearLastFile`）。
- **外部范式**：michaelcuneo `debounce` + 按文档分键；aurorae-haven `VersionHistory` 快照环（`unshift` + 截断 + `restore`）。

### 3.3 新增文件：`src/autosave.js`
```js
const AUTOSAVE_DELAY = 800;          // 防抖毫秒
const SNAPSHOT_INTERVAL_MS = 2 * 60 * 1000; // 至少每 2 分钟一快照
const MAX_SNAPSHOTS = 30;

let draftTimer = null;
let lastSnapshotAt = 0;
let changesSinceSnap = 0;

export function debounce(fn, delay) { /* 同 michaelcuneo：返回带 .cancel() 的包装 */ }

// 文件唯一键：优先用句柄名，Tauri 下用路径，均无则 'unsaved'
function fileKey() {
  return (typeof currentFileHandle !== 'undefined' && currentFileHandle?.name)
    || (typeof currentFilePath !== 'undefined' && currentFilePath)
    || 'unsaved';
}

export function scheduleAutosave() {
  if (draftTimer) clearTimeout(draftTimer);
  draftTimer = setTimeout(() => { draftTimer = null; doAutosave(); }, AUTOSAVE_DELAY);
}

export async function doAutosave() {
  const content = editor.state.doc.toString();
  const key = fileKey();
  await chrome.storage.local.set({ [`draft::${key}`]: { content, savedAt: Date.now() } });
  // 快照环
  changesSinceSnap++;
  const now = Date.now();
  if (now - lastSnapshotAt >= SNAPSHOT_INTERVAL_MS || changesSinceSnap >= 50) {
    await pushSnapshot(key, content);
    lastSnapshotAt = now; changesSinceSnap = 0;
  }
  updateAutosaveStatus();
}

async function pushSnapshot(key, content) {
  const recKey = `snapshots::${key}`;
  const { [recKey]: arr = [] } = await chrome.storage.local.get(recKey);
  arr.unshift({ id: Date.now(), content, timestamp: new Date().toISOString(), preview: content.slice(0, 120) });
  if (arr.length > MAX_SNAPSHOTS) arr.length = MAX_SNAPSHOTS; // 截断（aurorae-haven 范式）
  await chrome.storage.local.set({ [recKey]: arr });
}

export async function listSnapshots() {
  const key = fileKey();
  const { [`snapshots::${key}`]: arr = [] } = await chrome.storage.local.get(`snapshots::${key}`);
  return arr;
}

export async function restoreSnapshot(id) {
  const arr = await listSnapshots();
  const v = arr.find((x) => x.id === id);
  if (!v) return false;
  editor.dispatch({ changes: { from: 0, to: editor.state.doc.length, insert: v.content } });
  return true;
}

export async function getDraft() {
  const key = fileKey();
  const { [`draft::${key}`]: d } = await chrome.storage.local.get(`draft::${key}`);
  return d || null;
}
```

### 3.4 改动 `src/editor.js`
| 位置 | 改动 |
| --- | --- |
| **第 431 行** `updateListener` 内 `if (update.docChanged) { ... }` | 在该块末尾追加 `scheduleAutosave();`（直接复用现有 docChanged 分支，零新增监听） |
| **顶部 import** | `import { scheduleAutosave, listSnapshots, restoreSnapshot, getDraft } from './autosave.js';` |
| **启动恢复**（编辑器初始化完成处，约第 2933 行附近 `initPasteImageSupport()` 同区） | 调用 `getDraft()`，若存在且 `savedAt` 晚于当前文档加载时间，弹"发现未保存草稿，是否恢复？"提示（复用现有 `showToast` / 对话框机制） |
| **工具栏/菜单** | 新增"快照"按钮（见 3.5），点击 `listSnapshots()` 渲染对话框 |

### 3.5 新增 UI（编辑器外壳）
- **`src/editor.html`**：工具栏新增 `<button id="btnSnapshots">快照</button>`（或置于"更多"菜单）。新增隐藏的快照对话框 `#snapshotsDialog`（列表 + 时间戳 + 预览 + "恢复"按钮 + "关闭"）。
- **`src/editor.css`**：`.snapshots-dialog`、`#.snapshots-item`、`#.snapshots-preview` 等样式（约 40–60 行）。
- **`src/editor.js` 接线**：`btnSnapshots` 点击 → 填充并打开 `#snapshotsDialog`；列表项"恢复" → `restoreSnapshot(id)`（带确认，避免误覆盖）。

### 3.6 风险与注意
- **绝不静默覆盖真实文件**：自动保存只写 `chrome.storage.local` 草稿与快照；真实文件仅在用户主动 Ctrl+S（`handleSave`）时写入。这规避了"自动保存把用户正在试验的废稿覆盖原文件"的风险，且与现有 `lastFile` 快照哲学一致。
- `fileKey()` 依赖全局 `currentFileHandle` / `currentFilePath`——需确认这两个变量在 `editor.js` 作用域内为全局声明（从 `handleSave` 第 1657 行 `currentFileHandle` 可见其为模块级变量，可直接引用；若 Tauri 下用路径变量名不同，需对齐）。
- 快照环占用 `chrome.storage.local` 配额：30 份 × 平均 50KB ≈ 1.5MB，远低于配额；可在"清除缓存"功能中顺带清理 `draft::*` / `snapshots::*`。
- Tauri 桌面端 `chrome.storage.local` 由注入垫片兼容（现有 `session-restore.js` 已验证可用），无需额外适配。

---

## 4. 验证与回归

1. **方案 A**：`tests/` 增补——打开面板、`setSearchQuery` 注入、验证 `query.getCursor` 命中计数、正则/整词/大小写开关、`replaceAll` 行为；确保 `getSearchQuery` 探针（第 466 行）仍正常。
2. **A-4**：粘贴富文本（含表格/列表/加粗）→ 断言得到 Markdown；粘贴纯文本 → 行为不变；粘贴图片 → 图片逻辑不变（原有 `tests/issue-acceptance` 不回归）。
3. **A-5**：`docChanged` 触发 `scheduleAutosave` → `chrome.storage.local` 出现 `draft::*`；构造 30+ 次快照验证截断；`restoreSnapshot` 还原文档；刷新后草稿恢复提示出现。
4. 跑 `node --test` 与 `vite build`，确认 CI 全绿（沿用 `.github/workflows/ci.yml`）。

---

## 5. 实施顺序建议

1. **方案 A**（风险最低、纯 UI 外壳、100% 复用已核验内核）→ 2. **A-4**（合并进现有 paste 监听，改动集中、回归面小）→ 3. **A-5**（新增模块 + 存储 + 对话框，工作量最大但逻辑独立）。

> 理由：方案 A 与 A-4 都只触碰编辑器交互外壳，不影响文件写回语义；A-5 引入持久化与回滚 UI，需更谨慎的回归测试。三者互相解耦，可独立提交。
