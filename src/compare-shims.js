// compare-shims.js
// ---------------------------------------------------------------------------
// 对比合并模块（compare/*）专用的「浏览器 / 桌面」文件读写垫片。
//
// 让 compare 页在两种形态下都能「选择多文件 / 按路径读 / 按路径写结果」，
// 且对调用方（UI-A 等整合 Agent）提供统一签名，无需关心当前运行形态：
//
//   - Chrome 扩展 / 普通浏览器：走 <input type=file multiple> + File.text()
//     与 File System Access API（showSaveFilePicker），无后端依赖。
//   - Tauri 桌面壳（window.__TAURI_INTERNALS__ 存在）：走 Rust 命令
//       read_multiple_text_files / save_compare_result（std::fs，绕开 fs scope）。
//
// 导出（供 compare 模块 import）：
//   pickFiles(accept?)        -> Promise<CompareFile[]>   // { name, content }[]
//   readFile(path)            -> Promise<string>
//   saveFile(path, content)   -> Promise<void>
//
// 说明：本文件不创建任何 DOM 元素类名，故不触碰验收闸门禁用类名清单
//       （btnCenterBold / btnCenterBoldRed / styleGroup）。
//
// 命名说明：项目已存在 src/desktop-shims.js（编辑器 FS Access 垫片，IIFE、
// 无导出），为避免覆盖破坏编辑器功能，本文件独立命名 compare-shims.js。
// ---------------------------------------------------------------------------

// 判定是否运行在 Tauri 桌面壳内（与现有 desktop-shims.js 判定保持一致，
// 并兼容 window.isTauri / window.__TAURI__ 两种写法）。
export function isTauriEnv() {
  if (typeof window === "undefined") return false;
  return !!(window.__TAURI_INTERNALS__ || window.isTauri || window.__TAURI__);
}

// 延迟加载 Tauri API（仅桌面端调用，浏览器端永不触发 import，避免打包报错）。
let _tauri = null;
async function getTauri() {
  if (_tauri) return _tauri;
  const dialogMod = await import("@tauri-apps/plugin-dialog");
  const { invoke } = await import("@tauri-apps/api/core");
  _tauri = { dialog: dialogMod, invoke };
  return _tauri;
}

// 从 accept 字符串（".md,.txt"）提取扩展名数组（去点），喂给 dialog 过滤器。
function acceptToExtensions(accept) {
  return (accept || "")
    .split(",")
    .map((e) => e.trim())
    .filter(Boolean)
    .map((e) => (e.startsWith(".") ? e.slice(1) : e));
}

// 浏览器端：隐藏 <input type=file multiple> 选取并读取全部文本。
function browserPickFiles(accept) {
  return new Promise((resolve, reject) => {
    const input = document.createElement("input");
    input.type = "file";
    input.multiple = true;
    if (accept) input.accept = accept;
    input.onchange = async () => {
      try {
        const files = Array.from(input.files || []);
        const out = await Promise.all(
          files.map(async (f) => ({ name: f.name, content: await f.text() }))
        );
        resolve(out);
      } catch (e) {
        reject(e);
      }
    };
    input.oncancel = () => reject(new DOMException("用户取消", "AbortError"));
    input.click();
  });
}

// 浏览器端：按路径语义读取一个文件（浏览器无绝对路径，转为交互选取）。
async function browserReadFile() {
  if (typeof window !== "undefined" && window.showOpenFilePicker) {
    const [handle] = await window.showOpenFilePicker();
    const file = await handle.getFile();
    return file.text();
  }
  const f = await new Promise((resolve, reject) => {
    const input = document.createElement("input");
    input.type = "file";
    input.onchange = () => resolve(input.files && input.files[0]);
    input.oncancel = () => reject(new DOMException("用户取消", "AbortError"));
    input.click();
  });
  if (!f) throw new DOMException("用户取消", "AbortError");
  return f.text();
}

// 浏览器端：保存结果（优先 File System Access，降级为 <a download>）。
async function browserSaveFile(path, content) {
  const name = (path || "merged.md").split(/[\\/]/).pop();
  if (typeof window !== "undefined" && window.showSaveFilePicker) {
    const handle = await window.showSaveFilePicker({ suggestedName: name });
    const w = await handle.createWritable();
    await w.write(content);
    await w.close();
    return;
  }
  const blob = new Blob([content], { type: "text/markdown" });
  const a = document.createElement("a");
  a.href = URL.createObjectURL(blob);
  a.download = name;
  a.click();
  URL.revokeObjectURL(a.href);
}

// ===========================================================================
// 导出 API
// ===========================================================================

// 选择多个文件，返回 CompareFile[]（契约数据结构：{ name, content }）。
export async function pickFiles(
  accept = ".md,.markdown,.mdown,.mkd,.mkdn,.txt"
) {
  if (isTauriEnv()) {
    const { dialog, invoke } = await getTauri();
    const selected = await dialog.open({
      multiple: true,
      filters: [
        { name: "Markdown / Text", extensions: acceptToExtensions(accept) },
      ],
    });
    if (!selected) throw new DOMException("用户取消", "AbortError");
    const paths = Array.isArray(selected) ? selected : [selected];
    // 批量读走 Rust 命令，绕开 fs scope；返回 FileReadResult 数组：
    //   { path, content: Option<String>, error: Option<String> }
    // 逐文件容错：成功的转 CompareFile，失败的 console.warn 收集。
    const results = await invoke("read_multiple_text_files", { paths });
    const out = [];
    const failed = [];
    for (const r of results || []) {
      if (r.content != null) {
        out.push({
          name: r.path.split(/[\\/]/).pop() || r.path,
          content: r.content,
        });
      } else {
        failed.push(r.path);
        console.warn(`[compare-shims] 读取失败 ${r.path}: ${r.error || "未知错误"}`);
      }
    }
    if (failed.length) {
      console.warn(`[compare-shims] 共 ${failed.length} 个文件读取失败: ${failed.join(", ")}`);
    }
    return out;
  }
  return browserPickFiles(accept);
}

// 按绝对路径（桌面）或交互选取（浏览器）读取单个文件，返回文本内容。
export async function readFile(path) {
  if (isTauriEnv()) {
    const { invoke } = await getTauri();
    const results = await invoke("read_multiple_text_files", { paths: [path] });
    if (!results || !results.length) throw new Error("读取失败：" + path);
    const r = results[0];
    if (r.content == null) {
      throw new Error(`读取失败 ${path}: ${r.error || "未知错误"}`);
    }
    return r.content;
  }
  return browserReadFile();
}

// 按绝对路径（桌面）或交互保存（浏览器）写入结果内容。
export async function saveFile(path, content) {
  if (isTauriEnv()) {
    const { dialog, invoke } = await getTauri();
    const savePath = await dialog.save({
      defaultPath: path || "merged.md",
      filters: [{ name: "Markdown / Text", extensions: ["md", "markdown", "txt"] }],
    });
    if (!savePath) throw new DOMException("用户取消", "AbortError");
    await invoke("save_compare_result", { path: savePath, content });
    return;
  }
  return browserSaveFile(path, content);
}
