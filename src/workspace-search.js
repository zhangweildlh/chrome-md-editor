// ==========================================
// 工作区搜索（需求 7：P3 F2）
// 算法移植自 markra desktop (apps_desktop/src-tauri/src/markdown/files/search.rs)
// 纯 JS 实现：不依赖 Rust / CM6，仅用标准 FSA (dirHandle) + localStorage + DOM。
// 匹配策略：
//   - ASCII 文本/查询：lower 后 indexOf（与 Rust 的 ascii_lowercase 预存等价）。
//   - Unicode（含中文）：原生 String.prototype.toLowerCase + indexOf，跨语言大小写不敏感。
// 多命中、snippet 最大 96、行号/列号基于字符计数。
// ==========================================

const MARKDOWN_EXTENSIONS = ['.md', '.markdown'];
const SNIPPET_MAX_LENGTH = 96;
const SEARCH_DEBOUNCE_MS = 200;
const RECENT_QUERY_KEY = 'cme-workspace-search-query';

// 当前面板使用的目录句柄。优先使用 initWorkspaceSearchPanel 传入的句柄，
// 否则回退到 editor.js 导出的全局 directoryHandle（始终为最新已打开文件夹）。
let activeDirectoryHandle = null;

// 路径 -> dirHandle 映射，供点击结果时在编辑器内打开对应文件（FSA 模式下必需）。
const resultHandles = new Map();

/**
 * 判断字符串是否为纯 ASCII（每个码元 < 128）。
 * @param {string} value
 * @returns {boolean}
 */
function isAscii(value) {
  for (let i = 0; i < value.length; i++) {
    if (value.charCodeAt(i) >= 128) return false;
  }
  return true;
}

/**
 * 返回 text 中所有命中 query 的起始索引（UTF-16 码元偏移）。
 * 大小写不敏感：ASCII 走预 lower 比对；Unicode 走原生 toLowerCase。
 * @param {string} text
 * @param {string} query
 * @returns {number[]}
 */
export function matchQuery(text, query) {
  if (!query) return [];
  const haystack = String(text);
  const needle = String(query);
  // 预存 lower：ASCII 场景直接整串 lower 一次后比对（与 Rust 预存等价）。
  const haystackLower = haystack.toLowerCase();
  const needleLower = needle.toLowerCase();
  const needleLen = needle.length;
  const indices = [];
  let from = 0;
  let idx;
  while ((idx = haystackLower.indexOf(needleLower, from)) !== -1) {
    indices.push(idx);
    // 至少前进 1，避免空查询/单字符死循环；多字符查询前进整段（不重叠命中）。
    from = idx + Math.max(1, needleLen);
  }
  return indices;
}

/**
 * 基于单行文本生成命中上下文片段（最大 SNIPPET_MAX_LENGTH 个字符）。
 * text 为命中所在行（或其片段）；matchIndex 为该行内命中的起始偏移（码元）。
 * @param {string} text 单行文本
 * @param {number} matchIndex 命中在该行内的起始偏移（码元）
 * @param {string} query 查询串
 * @param {number} [maxLen=96] 片段最大字符数
 * @returns {string}
 */
export function extractSnippet(text, matchIndex, query, maxLen = SNIPPET_MAX_LENGTH) {
  const segment = String(text).replace(/\s+$/, '');
  const chars = Array.from(segment);
  const lineLength = chars.length;
  const matchLength = Array.from(String(query)).length;

  if (lineLength <= maxLen) return segment;

  // 将码元偏移转换为字符偏移，保证中文等非 BMP 字符计数正确。
  const matchStartChar = Array.from(segment.slice(0, Math.max(0, matchIndex))).length;
  const matchEndChar = matchStartChar + matchLength;
  // 预留两侧省略号（各 "..."，共 6 字符）预算，保证含省略号后总长度 ≤ maxLen。
  const ellipsisReserve = 6;
  const radius = Math.floor((maxLen - ellipsisReserve - matchLength) / 2);
  const startChar = Math.max(0, matchStartChar - radius);
  const endChar = Math.min(lineLength, matchEndChar + radius);

  const prefix = startChar > 0 ? '...' : '';
  const suffix = endChar < lineLength ? '...' : '';
  const slice = chars.slice(startChar, endChar).join('');
  return `${prefix}${slice}${suffix}`;
}

/**
 * 统计 s 前 upTo 个字符（码元）内换行符数量。
 * @param {string} s
 * @param {number} upTo
 * @returns {number}
 */
function countNewlinesBefore(s, upTo) {
  let count = 0;
  const limit = Math.min(upTo, s.length);
  for (let i = 0; i < limit; i++) {
    if (s.charCodeAt(i) === 10) count++;
  }
  return count;
}

/**
 * 在多个文件中检索 query，返回所有命中（支持多命中）。
 * @param {Array<{path:string, content:string}>} files
 * @param {string} query
 * @returns {Array<{path:string, lineNumber:number, columnNumber:number, snippet:string}>}
 */
export function searchInFiles(files, query) {
  const results = [];
  if (!query || !Array.isArray(files)) return results;

  const needleLower = String(query).toLowerCase();
  const needleLen = String(query).length;

  for (const file of files) {
    const content = file && file.content ? String(file.content) : '';
    if (!content) continue;

    const haystackLower = content.toLowerCase();
    let from = 0;
    let idx;
    while ((idx = haystackLower.indexOf(needleLower, from)) !== -1) {
      const lineStart = content.lastIndexOf('\n', idx - 1) + 1;
      const nlAfter = content.indexOf('\n', idx);
      const lineEnd = nlAfter === -1 ? content.length : nlAfter;
      const lineText = content.slice(lineStart, lineEnd);

      const lineNumber = countNewlinesBefore(content, lineStart) + 1;
      const matchStartInLine = idx - lineStart;
      const columnNumber = Array.from(lineText.slice(0, matchStartInLine)).length + 1;
      const snippet = extractSnippet(lineText, matchStartInLine, query);

      results.push({
        path: file.path,
        lineNumber,
        columnNumber,
        snippet,
      });

      from = idx + Math.max(1, needleLen);
    }
  }
  return results;
}

/**
 * 递归遍历 directoryHandle，收集所有 .md / .markdown 文件。
 * 复用 CME 既有 FSA 遍历范式（跳过隐藏文件、node_modules、dist）。
 * @param {FileSystemDirectoryHandle} directoryHandle
 * @param {string} [parentPath='']
 * @returns {Promise<Array<{path:string, handle:FileSystemHandle}>>}
 */
export async function collectMarkdownFiles(directoryHandle, parentPath = '') {
  const files = [];
  if (!directoryHandle || typeof directoryHandle.values !== 'function') return files;

  for await (const entry of directoryHandle.values()) {
    if (entry.name.startsWith('.') || entry.name === 'node_modules' || entry.name === 'dist') continue;
    const entryPath = parentPath ? `${parentPath}/${entry.name}` : entry.name;

    if (entry.kind === 'directory') {
      const children = await collectMarkdownFiles(entry, entryPath);
      files.push(...children);
    } else if (entry.kind === 'file') {
      const lower = entry.name.toLowerCase();
      if (MARKDOWN_EXTENSIONS.some((ext) => lower.endsWith(ext))) {
        files.push({ path: entryPath, handle: entry });
      }
    }
  }
  return files;
}

/**
 * 解析实际使用的目录句柄：参数优先，其次面板句柄，最后全局 directoryHandle。
 * @param {FileSystemDirectoryHandle|null} handle
 * @returns {FileSystemDirectoryHandle|null}
 */
function resolveDirectoryHandle(handle) {
  if (handle) return handle;
  if (activeDirectoryHandle) return activeDirectoryHandle;
  return null;
}

/**
 * 执行工作区搜索：collectMarkdownFiles -> 读取内容 -> searchInFiles。
 * @param {string} query
 * @param {FileSystemDirectoryHandle|null} [directoryHandle=null]
 * @returns {Promise<Array<{path:string, lineNumber:number, columnNumber:number, snippet:string}>}
 */
export async function runWorkspaceSearch(query, directoryHandle = null) {
  const handle = resolveDirectoryHandle(directoryHandle);
  if (!query || !handle) return [];

  const markdownFiles = await collectMarkdownFiles(handle);
  const files = [];
  resultHandles.clear();
  for (const file of markdownFiles) {
    try {
      const fileObj = await file.handle.getFile();
      const content = await fileObj.text();
      files.push({ path: file.path, content });
      resultHandles.set(file.path, file.handle);
    } catch (err) {
      // 跳过不可读文件（与 Rust 的 unreadable_file_count 语义一致）。
    }
  }
  return searchInFiles(files, query);
}

/**
 * 防抖封装。
 * @param {Function} fn
 * @param {number} wait
 * @returns {Function}
 */
function debounce(fn, wait) {
  let timer = null;
  return (...args) => {
    if (timer) clearTimeout(timer);
    timer = setTimeout(() => fn(...args), wait);
  };
}

/**
 * 初始化工作区搜索面板。
 * - 绑定 #btnWorkspaceSearch 打开面板。
 * - input 防抖 200ms 调用 runWorkspaceSearch。
 * - 结果列表用 textContent 渲染（防 XSS），点击在编辑器打开文件。
 * @param {FileSystemDirectoryHandle|null} [directoryHandle=null]
 * @param {Function|null} [onOpenFile=null] 形如 (detail: {path, handle}) => void
 */
export function initWorkspaceSearchPanel(directoryHandle = null, onOpenFile = null) {
  activeDirectoryHandle = directoryHandle || null;

  const openBtn = document.getElementById('btnWorkspaceSearch');
  const modal = document.getElementById('workspaceSearchModal');
  const input = document.getElementById('workspaceSearchInput');
  const resultsEl = document.getElementById('workspaceSearchResults');

  if (!openBtn || !modal || !input || !resultsEl) return;

  const closeModal = () => {
    modal.hidden = true;
    input.value = '';
    resultsEl.replaceChildren();
  };

  openBtn.addEventListener('click', () => {
    modal.hidden = false;
    try {
      const recent = localStorage.getItem(RECENT_QUERY_KEY);
      if (recent) input.value = recent;
    } catch (err) {
      /* localStorage 不可用时忽略 */
    }
    input.focus();
  });

  modal.addEventListener('click', (event) => {
    if (event.target === modal) closeModal();
  });

  document.addEventListener('keydown', (event) => {
    if (event.key === 'Escape' && !modal.hidden) closeModal();
  });

  const performSearch = debounce(async (q) => {
    try {
      const hits = await runWorkspaceSearch(q, activeDirectoryHandle);
      renderResults(resultsEl, hits, onOpenFile);
    } catch (err) {
      resultsEl.replaceChildren();
      const errLine = document.createElement('div');
      errLine.className = 'workspace-search-empty';
      errLine.textContent = '搜索出错：' + (err && err.message ? err.message : String(err));
      resultsEl.appendChild(errLine);
    }
  }, SEARCH_DEBOUNCE_MS);

  input.addEventListener('input', () => {
    const q = input.value;
    try {
      localStorage.setItem(RECENT_QUERY_KEY, q);
    } catch (err) {
      /* 忽略 */
    }
    if (!q) {
      resultsEl.replaceChildren();
      return;
    }
    performSearch(q);
  });
}

/**
 * 用 textContent 渲染结果（防 XSS）。
 * @param {HTMLElement} container
 * @param {Array} hits
 * @param {Function|null} onOpenFile
 */
function renderResults(container, hits, onOpenFile) {
  container.replaceChildren();

  if (!hits.length) {
    const empty = document.createElement('div');
    empty.className = 'workspace-search-empty';
    empty.textContent = '未找到匹配。';
    container.appendChild(empty);
    return;
  }

  for (const hit of hits) {
    const item = document.createElement('button');
    item.type = 'button';
    item.className = 'workspace-search-result';

    const pathEl = document.createElement('div');
    pathEl.className = 'workspace-search-result-path';
    pathEl.textContent = hit.path; // 文件名/路径：textContent 防 XSS

    const metaEl = document.createElement('div');
    metaEl.className = 'workspace-search-result-meta';
    metaEl.textContent = `第 ${hit.lineNumber} 行 · 第 ${hit.columnNumber} 列`;

    const snippetEl = document.createElement('div');
    snippetEl.className = 'workspace-search-result-snippet';
    snippetEl.textContent = hit.snippet;

    item.append(pathEl, metaEl, snippetEl);

    item.addEventListener('click', () => {
      const detail = { path: hit.path, handle: resultHandles.get(hit.path) || null };
      if (typeof onOpenFile === 'function') {
        onOpenFile(detail);
      } else {
        document.dispatchEvent(new CustomEvent('cme:workspace-search-open', { detail }));
      }
    });

    container.appendChild(item);
  }
}
