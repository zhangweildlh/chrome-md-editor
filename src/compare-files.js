// compare-files.js — 文件多选 + 拖拽上传（T3）
//
// 契约导出：
//   - pickFiles(accept?: string) => Promise<CompareFile[]>
//     CompareFile = { name: string; content: string }
//
// 复用模式：沿用 editor.js 现有的「<input type="file" multiple> + File.text()」读取方式，
// 并额外提供拖拽区 / 按钮工厂，供 UI-A（compare.js）直接挂载到 compare.html。
//
// 禁用类名闸门：
//   禁止使用 btnCenterBold / btnCenterBoldRed / styleGroup。
//   本文件统一使用 compare-filebtn / compare-dropzone 等新类名。
//
// 注意：本文件只负责「读取文件 → CompareFile[]」与 UI 工厂，不负责把内容喂给视图；
// 喂给多视图由 UI-A 调用方处理（参见文件末尾的对接提示）。

import { isTauriEnv } from "./compare-shims.js";

const DEFAULT_ACCEPT = '.md,.markdown,.mdown,.mkd,.mkdn,.txt';

/**
 * 读取一批 File 为 CompareFile[]（{name, content}）。
 * content 通过 File.text() 同步读取为字符串（Markdown / 纯文本）。
 * @param {FileList|File[]|ArrayLike<File>} fileList
 * @returns {Promise<{name:string, content:string}[]>}
 */
export async function readCompareFiles(fileList) {
  const files = Array.from(fileList || []);
  return Promise.all(
    files.map(async (file) => ({
      name: file.name,
      content: await file.text(),
    }))
  );
}

/**
 * 弹出系统文件选择框，多选文件，返回 CompareFile[]。
 * @param {string} [accept] 形如 ".md,.txt" 的 accept 过滤串；省略则默认 Markdown/文本。
 * @returns {Promise<{name:string, content:string}[]>}
 */
export async function pickFiles(accept = DEFAULT_ACCEPT) {
  // 桌面端（Tauri）：委派到 compare-shims.js，走 Rust 命令 read_multiple_text_files
  if (isTauriEnv()) {
    const { pickFiles: shimPick } = await import("./compare-shims.js");
    return shimPick(accept);
  }
  const input = document.createElement('input');
  input.type = 'file';
  input.multiple = true;
  if (accept) input.accept = accept;

  return new Promise((resolve, reject) => {
    input.addEventListener(
      'change',
      async () => {
        const result = await readCompareFiles(input.files);
        resolve(result);
      },
      { once: true }
    );
    // 用户取消文件选择框时 reject，避免 Promise 永不 settle。
    input.oncancel = () => reject(new DOMException('用户取消', 'AbortError'));
    input.click();
  });
}

/**
 * 把 accept 串编译为文件名后缀 / MIME 通配匹配函数，供拖拽区过滤用。
 * @param {string} [accept]
 * @returns {(file: File) => boolean}
 */
function makeAcceptor(accept) {
  if (!accept) return () => true;
  const rules = accept
    .split(',')
    .map((s) => s.trim().toLowerCase())
    .filter(Boolean);
  return (file) => {
    const name = (file.name || '').toLowerCase();
    const type = (file.type || '').toLowerCase();
    return rules.some((rule) => {
      if (rule.includes('*')) {
        const re = new RegExp('^' + rule.replace(/[.+?^${}()|[\]\\]/g, '\\$&').replace(/\\\*/g, '.*') + '$');
        return re.test(type) || re.test(name);
      }
      if (rule.startsWith('.')) return name.endsWith(rule);
      return type.includes(rule);
    });
  };
}

/**
 * UI 工厂：生成一个「选择文件」按钮（规范类名 compare-filebtn）。
 * @param {object} [opts]
 * @param {string} [opts.label='选择文件']
 * @param {string} [opts.accept]
 * @param {(files:{name:string,content:string}[]) => void} [opts.onPick]
 * @param {string} [opts.className='compare-filebtn']
 * @returns {HTMLButtonElement}
 */
export function createFilePickerButton({
  label = '选择文件',
  accept,
  onPick,
  className = 'compare-filebtn',
} = {}) {
  const btn = document.createElement('button');
  btn.type = 'button';
  btn.className = className;
  btn.textContent = label;
  btn.addEventListener('click', async () => {
    try {
      const files = await pickFiles(accept);
      if (files.length && typeof onPick === 'function') onPick(files);
    } catch (err) {
      console.error('[compare-files] 选择文件失败:', err);
    }
  });
  return btn;
}

/**
 * UI 工厂：把任意元素变为文件拖拽区（dragover/drop 读取 File）。
 * 拖入的文件经 accept 过滤后，以 CompareFile[] 形式交给 onFiles。
 * @param {HTMLElement} element 作为拖拽区的 DOM 元素
 * @param {object} [opts]
 * @param {string} [opts.accept]
 * @param {boolean} [opts.multiple=true]
 * @param {(files:{name:string,content:string}[]) => void} [opts.onFiles]
 * @returns {() => void} 解绑函数（移除监听器）
 */
export function enableFileDropZone(element, { accept, multiple = true, onFiles } = {}) {
  if (!element) return () => {};
  const acceptFn = makeAcceptor(accept);

  const onDragOver = (e) => {
    e.preventDefault();
    element.classList.add('compare-dropzone-dragover');
  };
  const onDragLeave = () => {
    element.classList.remove('compare-dropzone-dragover');
  };
  const onDrop = async (e) => {
    e.preventDefault();
    element.classList.remove('compare-dropzone-dragover');
    const dt = e.dataTransfer;
    if (!dt) return;
    const all = Array.from(dt.files || []);
    const filtered = accept ? all.filter(acceptFn) : all;
    const files = await readCompareFiles(filtered);
    if (files.length && typeof onFiles === 'function') onFiles(files);
  };

  element.addEventListener('dragover', onDragOver);
  element.addEventListener('dragleave', onDragLeave);
  element.addEventListener('drop', onDrop);
  return () => {
    element.removeEventListener('dragover', onDragOver);
    element.removeEventListener('dragleave', onDragLeave);
    element.removeEventListener('drop', onDrop);
  };
}

// ───────────────────────────────────────────────────────────────────────────
// 对接提示（给 UI-A / compare.js 整合用）：
//
// 1) 工具栏「选择文件」按钮（#btnPickFiles）：
//      import { pickFiles } from './compare-files.js';
//      btnPickFiles.addEventListener('click', async () => {
//        const files = await pickFiles();           // CompareFile[]
//        // 取 files[0] 给 Yours(A) 槽、files[1] 给 Theirs(B) 槽，再渲染 MergeView
//      });
//
// 2) 文件拖拽：把 compare.html 的 #compareFiles 或 window.__compareMount.root 设为拖拽区：
//      import { enableFileDropZone } from './compare-files.js';
//      enableFileDropZone(window.__compareMount.root, {
//        accept: '.md,.txt',
//        onFiles: (files) => { /* files: CompareFile[] → 喂给多视图 */ },
//      });
//
// 3) CompareFile[] 即 { name, content }，直接对应 createCompareMergeView 的
//    oldContent/newContent（A=Yours, B=Theirs）。
// ───────────────────────────────────────────────────────────────────────────
