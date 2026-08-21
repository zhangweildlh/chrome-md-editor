// save-poll.js — 对比/合并页「保存轮询」模型（§5.1–§5.6 / §10.1）
//
// 职责：
//   1) runSavePoll(panes, order)  —— 从左到右逐栏弹原生 DOM modal，
//      四按钮：保存(覆盖源) / 另存为(新文件，不覆盖) / 不保存(跳过) / 取消(中止整轮)。
//   2) showSaveAsDialog({ suggestedName, types }) —— 另存为「文件选择」，与编辑器「打开文件」
//      同款：直接调原生 File System Access API（window.showSaveFilePicker），不再自建
//      文件名输入弹窗（需求①⑦⑬）。返回新目标描述符 { handle } | { path } | null（取消）。
//      Tauri / 非安全上下文经 ioBridge.pickSaveTarget 降级。
//
// 依赖约定（§5.6，由 B2 Agent 在 src/compare/io-bridge.js 实现，本文件只按签名调用）：
//   ioBridge.write(target, content)            —— 覆盖写入既有目标
//   ioBridge.pickSaveTarget(suggestedName)     —— 打开保存框，返回 { handle } | { path }
//   ioBridge.saveAs(target, content)           —— 写入「新目标」（语义上等同 write）
//
// 本文件位于 src/ 根，io-bridge 在 src/compare/，故 import 路径 './compare/io-bridge.js'。
// 采用「静态 import ioBridge（write 必存在）+ 动态解析 pickSaveTarget/saveAs（兼容 B2
// 既可能挂到 ioBridge 上、也可能以具名导出两种形态）」，规避任何循环依赖风险，且
// 绝不 import editor.js（项目铁律）。
//
// 样式：本文件用内联 style 占位；统一视觉由 C3 Agent 在 compare.css 完善，不要新建 CSS 文件。
//
// panes 结构：[{ key, view, target, content }]
//   - key    : 栏键（如 'a'|'b'|'c'）
//   - view   : 该栏 CodeMirror EditorView（保留字段，便于调用方后续回焦；本文件不主动使用）
//   - target : 源文件目标描述符 { handle } | { path }；为 null 表示无源（合并结果 b）
//   - content: 当前要写盘的字符串
//   - [可选] path : 仅在浏览器无法取得完整绝对路径时，由调用方显式传入完整路径用于展示
// order：栏键数组（如 ['a','b','c']），决定轮询从左到右顺序。

import { ioBridge, isTauri } from './compare/io-bridge.js';

// 「另存为」原生保存框的默认文件类型（与 src/file-picker.js 的 MD_SAVE_TYPES 一致）。
// 调用方可通过 showSaveAsDialog({ types }) 覆盖（如 diff 导出传 .txt）。
const MD_SAVE_TYPES = [{
  description: 'Markdown 文件',
  accept: { 'text/markdown': ['.md'] },
}];

// 重入保护（M2）：同一时刻只允许一轮保存轮询在跑，防止连按 Ctrl+S / 保存中返回
// 触发并发多轮、叠加 .save-poll-overlay、重复写盘。入口检查，finally 复位。
let inFlight = false;

// ---------------------------------------------------------------------------
// 环境无关的小工具
// ---------------------------------------------------------------------------

// 取路径 basename（兼容 / 与 \ 分隔符）。
function basename(p) {
  if (!p || typeof p !== 'string') return '';
  const i = Math.max(p.lastIndexOf('/'), p.lastIndexOf('\\'));
  return i >= 0 ? p.slice(i + 1) : p;
}

// 计算弹窗要展示的「绝对路径 + 文件名」（完整，不省略）。
//   - pane.path 优先（调用方显式给的完整绝对路径，最可靠）
//   - Tauri 模式 target.path 即绝对路径
//   - 浏览器模式 target.handle 仅能拿到文件名（FSAPI 出于隐私不暴露完整路径），尽力而为
//   - target 为 null：合并结果，无源文件
function displayPath(pane) {
  if (pane && pane.path) return pane.path;
  const t = pane && pane.target;
  if (t && typeof t.path === 'string' && t.path) return t.path;       // Tauri 绝对路径
  if (t && t.handle) {
    const n = t.handle && t.handle.name ? t.handle.name : '';
    return n ? '[浏览器] ' + n : '[浏览器] 未知文件';
  }
  if (t == null) return '[无源文件 · 合并结果]';
  return '[未知路径]';
}

// 计算「另存为」默认文件名。
//   - 无源（合并结果 b）→ 'merged.md'（§5.3 / D7）
//   - 有源 → 用源文件名，便于用户在此基础上改名
function suggestedNameFor(pane) {
  if (pane.target == null) return 'merged.md';
  if (pane.path) {
    const b = basename(pane.path);
    if (b) return b;
  }
  if (pane.target && typeof pane.target.path === 'string' && pane.target.path) {
    const b = basename(pane.target.path);
    if (b) return b;
  }
  if (pane.target && pane.target.handle && pane.target.handle.name) {
    return pane.target.handle.name;
  }
  return 'untitled.md';
}

// 兼容解析 pickSaveTarget：优先用 ioBridge.pickSaveTarget（B2 可能挂到对象上），
// 否则回退到具名导出（B2 也可能按 §5.6 写成顶层 export async function）。
async function resolvePickSaveTarget(suggestedName) {
  if (typeof ioBridge.pickSaveTarget === 'function') {
    return ioBridge.pickSaveTarget(suggestedName);
  }
  const mod = await import('./compare/io-bridge.js');
  if (typeof mod.pickSaveTarget === 'function') return mod.pickSaveTarget(suggestedName);
  throw new Error('ioBridge.pickSaveTarget 未实现（需 B2 Agent 在 io-bridge.js 提供）');
}

// 兼容解析 saveAs，同上。
async function resolveSaveAs(target, content) {
  if (typeof ioBridge.saveAs === 'function') {
    return ioBridge.saveAs(target, content);
  }
  const mod = await import('./compare/io-bridge.js');
  if (typeof mod.saveAs === 'function') return mod.saveAs(target, content);
  throw new Error('ioBridge.saveAs 未实现（需 B2 Agent 在 io-bridge.js 提供）');
}

// ---------------------------------------------------------------------------
// 内联样式（占位；最终由 C3 Agent 在 compare.css 统一完善）
// ---------------------------------------------------------------------------
const OVERLAY_STYLE = [
  'position:fixed', 'inset:0', 'z-index:99999',
  'display:flex', 'align-items:center', 'justify-content:center',
  'background:rgba(0,0,0,0.45)',
  'font-family:system-ui,-apple-system,"Segoe UI",sans-serif',
].join(';') + ';';

// R3 修复 ⑥：runSavePoll 弹窗视觉重做为「系统式样」，与原生 showOpenFilePicker / showSaveFilePicker
// 弹窗（操作系统提供的对话框）观感一致——浅色卡片、圆角、按钮强调色（系统蓝 accent）。
// 浏览器侧无法 100% 复刻 OS 原生，但通过统一调色板、字体、间距达成「观感对齐」。
const BOX_STYLE = [
  'min-width:380px', 'max-width:90vw', 'background:#ffffff', 'color:#1f2328',
  'border:1px solid #d0d7de', 'border-radius:12px', 'padding:20px 22px',
  'box-shadow:0 8px 28px rgba(0,0,0,0.18), 0 2px 8px rgba(0,0,0,0.08)',
  'font-family:system-ui,-apple-system,"Segoe UI",sans-serif',
].join(';') + ';';

const PATH_STYLE = [
  'margin:10px 0', 'padding:8px 10px', 'background:#f6f8fa', 'border:1px solid #eaeef2',
  'border-radius:6px',
  'font-family:ui-monospace,SFMono-Regular,Menlo,Consolas,monospace',
  'font-size:12px', 'word-break:break-all', 'line-height:1.5', 'color:#57606a',
].join(';') + ';';

const HINT_STYLE = [
  'font-size:12px', 'color:#57606a', 'margin-bottom:14px', 'line-height:1.55',
].join(';') + ';';

// 系统式按钮：浅灰底 + 细边，hover 加深。emphasis=true 时用系统蓝（accent）强调（主操作）。
const BTN_STYLE = [
  'flex:1', 'margin:0 4px', 'padding:7px 14px',
  'border:1px solid #d0d7de', 'border-radius:6px',
  'background:#f6f8fa', 'color:#1f2328', 'cursor:pointer',
  'font-size:13px', 'font-weight:500', 'transition:background .12s',
].join(';') + ';';
const BTN_EMPHASIS_BG = '#0969da'; // 系统蓝（GitHub/Windows accent）
const BTN_EMPHASIS_BORDER = '#0969da';
const BTN_EMPHASIS_TEXT = '#ffffff';

// 通用：构造覆盖层 + 居中卡片，返回 { overlay, box, close }。
function buildOverlay() {
  const overlay = document.createElement('div');
  overlay.className = 'save-poll-overlay';
  overlay.style.cssText = OVERLAY_STYLE;
  const box = document.createElement('div');
  box.className = 'save-poll-modal';
  box.style.cssText = BOX_STYLE;
  overlay.appendChild(box);
  let escHandler = null;
  const close = (onEsc) => {
    if (escHandler) document.removeEventListener('keydown', escHandler);
    if (overlay.parentNode) overlay.parentNode.removeChild(overlay);
    if (typeof onEsc === 'function') onEsc();
  };
  // Escape 统一映射为「取消/中止」（安全：留在页内继续编辑，不静默丢失）。
  escHandler = (e) => {
    if (e.key === 'Escape') {
      e.preventDefault();
      close();
      if (escResolver) escResolver();
    }
  };
  let escResolver = null;
  document.addEventListener('keydown', escHandler);
  document.body.appendChild(overlay);
  return { overlay, box, close, setEscResolver: (fn) => { escResolver = fn; } };
}

// ---------------------------------------------------------------------------
// 单栏保存弹窗：返回 Promise<{ action: 'save'|'saveAs'|'skip'|'cancel' }>
// ---------------------------------------------------------------------------
function showPaneSaveDialog(pane) {
  return new Promise((resolve) => {
    const { box, close, setEscResolver } = buildOverlay();

    const title = document.createElement('div');
    title.textContent = '保存文件';
    title.style.cssText = 'font-size:15px;font-weight:600;margin-bottom:2px;';

    const path = document.createElement('div');
    path.className = 'save-poll-path';
    path.style.cssText = PATH_STYLE;
    const full = displayPath(pane);
    path.textContent = '路径：' + full;
    path.title = full; // tooltip 显示完整绝对路径（不省略）

    const hint = document.createElement('div');
    hint.className = 'save-poll-hint';
    hint.style.cssText = HINT_STYLE;
    if (pane.target == null) {
      hint.textContent = '该栏无源文件（合并结果）。「保存」将等同于「另存为」，请指定新路径与文件名（默认 merged.md）。';
    } else {
      hint.textContent = '「保存」覆盖源文件；「另存为」写入新文件不覆盖源；「不保存」跳过本栏；「取消」中止整个保存流程（留在页内）。';
    }

    const bar = document.createElement('div');
    bar.style.cssText = 'display:flex;gap:0;margin-top:4px;';

    const mk = (label, action, emphasis) => {
      const b = document.createElement('button');
      b.textContent = label;
      b.style.cssText = BTN_STYLE + (emphasis ? `background:${BTN_EMPHASIS_BG};border-color:${BTN_EMPHASIS_BORDER};color:${BTN_EMPHASIS_TEXT};` : '');
      b.onclick = () => { close(); resolve({ action }); };
      return b;
    };

    const btnSave = mk('保存', 'save', true);
    const btnSaveAs = mk('另存为', 'saveAs', false);
    const btnSkip = mk('不保存', 'skip', false);
    const btnCancel = mk('取消', 'cancel', false);

    bar.appendChild(btnSave);
    bar.appendChild(btnSaveAs);
    bar.appendChild(btnSkip);
    bar.appendChild(btnCancel);

    box.appendChild(title);
    box.appendChild(path);
    box.appendChild(hint);
    box.appendChild(bar);

    // Escape → 取消（中止整轮，留页内）
    setEscResolver(() => resolve({ action: 'cancel' }));
    btnCancel.focus();
  });
}

// ---------------------------------------------------------------------------
// 另存为「文件选择」：返回 Promise<target | null>
//   与编辑器「打开文件」（file-picker.js → window.showOpenFilePicker）同款，直接调原生
//   保存框 window.showSaveFilePicker，一步选定路径 + 文件名（不再自建文件名输入弹窗）。
//   返回：{ handle }（浏览器）| { path }（Tauri）| { download, name }（非安全上下文降级）
//         | null（用户取消 / 无可用途径）。
//   suggestedName 作为保存框默认文件名；types 为 FSAPI 文件类型过滤（默认 Markdown）。
// ---------------------------------------------------------------------------
export async function showSaveAsDialog({ suggestedName, types } = {}) {
  const name = (typeof suggestedName === 'string' && suggestedName.trim())
    ? suggestedName.trim()
    : 'untitled.md';

  // 浏览器安全上下文（https / 扩展页）：原生 File System Access API 保存框。
  // Tauri 内不走此路（其描述符须为 { path }，见 ioBridge.write 的 Tauri 分支）。
  if (!isTauri && typeof window !== 'undefined' && typeof window.showSaveFilePicker === 'function') {
    try {
      const handle = await window.showSaveFilePicker({
        suggestedName: name,
        types: types || MD_SAVE_TYPES,
      });
      return { handle };
    } catch (err) {
      // 用户取消 → null（调用方按「跳过」处理，不报错）
      if (err && err.name === 'AbortError') return null;
      // 其余错误（如沙箱 SecurityError）→ 落到 Tauri / 非安全上下文降级
      console.warn('[save-poll] showSaveFilePicker 不可用，降级 pickSaveTarget：', err);
    }
  }

  // Tauri（返回 { path }）/ 非安全上下文（返回 { download, name } 由 write 走 Blob 下载）。
  try {
    const target = await resolvePickSaveTarget(name);
    return target || null;
  } catch (err) {
    if (err && err.name === 'AbortError') return null; // 用户取消
    console.error('[save-poll] pickSaveTarget 失败：', err);
    return null;
  }
}

// ---------------------------------------------------------------------------
// M3：一轮结束后，若有失败栏，给出非阻塞 UI 提示（不吞掉错误）。
// 用轻量 toast（不拦截其它交互、数秒后自动消失），仅在浏览器 DOM 环境生效；
// node 环境下 document 不存在，直接跳过，避免破坏 node 测试。
// ---------------------------------------------------------------------------
function showSaveErrors(count) {
  if (typeof document === 'undefined' || !document.body || typeof document.createElement !== 'function') {
    return;
  }
  const toast = document.createElement('div');
  toast.className = 'save-poll-toast';
  toast.textContent = count + ' 个文件保存失败，请重试';
  toast.style.cssText = [
    'position:fixed', 'left:50%', 'bottom:24px', 'transform:translateX(-50%)',
    'z-index:100000', 'padding:10px 16px', 'background:#5a1d1d', 'color:#ffd7d7',
    'border:1px solid #8a2d2d', 'border-radius:8px',
    'font-family:system-ui,-apple-system,sans-serif', 'font-size:13px',
    'box-shadow:0 8px 24px rgba(0,0,0,0.5)', 'pointer-events:none',
  ].join(';') + ';';
  document.body.appendChild(toast);
  setTimeout(() => {
    if (toast.parentNode) toast.parentNode.removeChild(toast);
  }, 5000);
}

// ---------------------------------------------------------------------------
// 主入口：从左到右逐栏轮询保存。
//   panes : [{ key, view, target, content }]
//   order : 栏键数组，决定轮询顺序（如 ['a','b','c']）
// 返回：
//   { aborted: boolean, actions: [{ key, action: 'save'|'saveAs'|'skip' }] }
//   - aborted=true（用户点「取消」）：中断整轮，actions 仅含已处理栏。
//   - 任何栏在「另存为」中取消选择 → 记 skip，继续下一栏。
// ---------------------------------------------------------------------------
export async function runSavePoll(panes, order) {
  // M2：模块级重入保护，避免并发多轮叠加 overlay / 重复写盘。
  // 调用方收到 { aborted:true, reason:'in-flight' } 时，r && !r.aborted 判据仍成立，
  // 不会误报错误（AbortError 是 Error，单独处理）。
  if (inFlight) return { aborted: true, reason: 'in-flight' };
  inFlight = true;

  const result = { aborted: false, actions: [] };
  const errors = []; // M3：收集单栏写盘失败的栏，收尾统一提示

  try {
    const list = Array.isArray(order) ? order : (panes || []).map((p) => p.key);

    for (const key of list) {
      const pane = (panes || []).find((p) => p.key === key);
      if (!pane) continue;

      const decision = await showPaneSaveDialog(pane);

      if (decision.action === 'cancel') {
        result.aborted = true;       // 中止整轮，留在页内（§5.3 / D8）
        break;
      }

      if (decision.action === 'skip') {
        result.actions.push({ key, action: 'skip' }); // 不保存，跳过本栏
        continue;
      }

      // 计算实际写入目标：
      let target = pane.target;
      let writeViaSaveAs = false;

      if (decision.action === 'save' && pane.target == null) {
        // 无源（合并结果 b）→ 「保存」等价于「另存为」（§5.3 / D7）
        target = await showSaveAsDialog({ suggestedName: suggestedNameFor(pane) });
        writeViaSaveAs = true;
      } else if (decision.action === 'saveAs') {
        target = await showSaveAsDialog({ suggestedName: suggestedNameFor(pane) });
        writeViaSaveAs = true;
      }

      if (!target) {
        // 另存为未选定目标 → 视为跳过，继续下一栏
        result.actions.push({ key, action: 'skip' });
        continue;
      }

      // M3：每栏写盘独立 try/catch，单栏失败不影响其它栏继续保存。
      try {
        if (decision.action === 'save' && pane.target != null && !writeViaSaveAs) {
          await ioBridge.write(target, pane.content);   // 覆盖源
          result.actions.push({ key, action: 'save' });
        } else {
          await resolveSaveAs(target, pane.content);    // 写入新目标，不覆盖源
          result.actions.push({ key, action: 'saveAs' });
        }
      } catch (err) {
        console.error('[save-poll] 栏 ' + key + ' 保存失败：', err);
        errors.push({ key, error: err });
        result.actions.push({ key, action: 'error' });
      }
    }

    // M3：一轮结束，若有失败栏，给出非阻塞 UI 提示（不吞掉错误）。
    if (errors.length) {
      showSaveErrors(errors.length);
    }
  } finally {
    inFlight = false; // M2：无论成功/异常/中止，复位重入标志
  }

  return result;
}
