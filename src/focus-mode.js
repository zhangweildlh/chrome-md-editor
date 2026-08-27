// ============================================================
// A-8 专注模式 + 显示字号 / 界面密度
//  - 专注模式：给 documentElement 加 .focus-mode，由 editor.css 淡化非当前行
//  - 打字机：光标行始终居中（选区变化时滚动到视图中部）
//  - 显示设置：编辑器/预览独立字号 + 界面密度，写入 CSS 变量并持久化 localStorage
// 纯前端、不改 Markdown 源码。
// ============================================================

const LS = {
  focus: 'md-editor-focus-mode',
  typewriter: 'md-editor-typewriter',
  editorFont: 'md-editor-font-size',
  previewFont: 'md-editor-preview-font-size',
  density: 'md-editor-density',
  // G4 编辑器排版：字体族 / 字间距 / 行间距
  editorFontFamily: 'md-editor-font-family',
  editorLetterSpacing: 'md-editor-letter-spacing',
  editorLineHeight: 'md-editor-line-height',
};

let focusMode = localStorage.getItem(LS.focus) === '1';
let typewriter = localStorage.getItem(LS.typewriter) === '1';

// ⑱ Win11 记事本默认值（用于显示设置「默认」按钮一键恢复）
// 来源：Win11 记事本默认字体 'Lucida Console, 宋体'、字号 12px（小五）、
// 行距 1.0（单倍）、字间距 0px；界面密度取 standard（= 默认观感），配色用默认 classic。
// 预览字号记事本无对应概念，保持本应用默认 15px（不动）。
export const WIN11_DEFAULTS = {
  editorFont: 12,
  editorFontFamily: "'Lucida Console', 宋体",
  editorLetterSpacing: 0,
  editorLineHeight: 1.0,
  previewFont: 15,
  density: 'standard',
  colorScheme: 'classic',
};

// ---- 专注 / 打字机 ----
export function isFocusMode() { return focusMode; }
export function isTypewriter() { return typewriter; }

export function toggleFocusMode() {
  focusMode = !focusMode;
  localStorage.setItem(LS.focus, focusMode ? '1' : '0');
  document.documentElement.classList.toggle('focus-mode', focusMode);
    return focusMode;
}

export function toggleTypewriter() {
  typewriter = !typewriter;
  localStorage.setItem(LS.typewriter, typewriter ? '1' : '0');
    return typewriter;
}

// 选区变化时，若开启打字机则把光标行滚到视图中部
export function maybeCenterActiveLine(view) {
  if (!typewriter || !view) return;
  try {
    const sel = view.state.selection.main;
    const line = view.state.doc.lineAt(sel.head);
    const lineTop = view.lineBlockAt(line.from).top;
    const target = lineTop - view.scrollDOM.clientHeight / 2 + 20;
    view.scrollDOM.scrollTop = Math.max(0, target);
  } catch (err) {
      }
}

// ---- 显示字号 / 密度 ----
export function getEditorFontSize() { return parseInt(localStorage.getItem(LS.editorFont) || '0', 10); }
export function getPreviewFontSize() { return parseInt(localStorage.getItem(LS.previewFont) || '0', 10); }
export function getDensity() { return localStorage.getItem(LS.density) || 'standard'; }

// ---- G4 编辑器排版（字体族 / 字间距 / 行间距）----
export function getEditorFontFamily() { return localStorage.getItem(LS.editorFontFamily) || ''; }
export function getEditorLetterSpacing() { return localStorage.getItem(LS.editorLetterSpacing) || ''; }
export function getEditorLineHeight() { return localStorage.getItem(LS.editorLineHeight) || ''; }

export function setEditorFontFamily(val) {
  localStorage.setItem(LS.editorFontFamily, val);
  if (val) document.documentElement.style.setProperty('--editor-font-family', val);
  else document.documentElement.style.removeProperty('--editor-font-family');
}
export function setEditorLetterSpacing(val) {
  localStorage.setItem(LS.editorLetterSpacing, val);
  if (val !== '') document.documentElement.style.setProperty('--editor-letter-spacing', `${val}px`);
  else document.documentElement.style.removeProperty('--editor-letter-spacing');
}
export function setEditorLineHeight(val) {
  localStorage.setItem(LS.editorLineHeight, val);
  if (val !== '') document.documentElement.style.setProperty('--editor-line-height', val);
  else document.documentElement.style.removeProperty('--editor-line-height');
}

// 界面密度间距。注意：editor.css :root 默认 --ui-gap:4px（未设置密度时的观感），
// 故把 standard 对齐到 4px，使「标准」等于默认观感（标准=默认，语义一致，修复 L9）。
// compact 相应收紧到 2px，保持三档（2/4/14）区分度，避免与 standard 塌缩为同一值。
const DENSITY_GAP = { compact: '2px', standard: '4px', comfortable: '14px' };

export function applyDisplaySettings() {
  const root = document.documentElement.style;
  const ef = getEditorFontSize();
  if (ef > 0) root.setProperty('--editor-font-size', `${ef}px`);
  const pf = getPreviewFontSize();
  if (pf > 0) root.setProperty('--preview-font-size', `${pf}px`);
  const d = getDensity();
  root.setProperty('--ui-gap', DENSITY_GAP[d] || DENSITY_GAP.standard);
  // G4 编辑器排版
  const ff = getEditorFontFamily();
  if (ff) root.setProperty('--editor-font-family', ff);
  const ls = getEditorLetterSpacing();
  if (ls !== '') root.setProperty('--editor-letter-spacing', `${ls}px`);
  const lh = getEditorLineHeight();
  if (lh !== '') root.setProperty('--editor-line-height', lh);
}

export function setEditorFontSize(px) {
  localStorage.setItem(LS.editorFont, String(px));
  if (px > 0) document.documentElement.style.setProperty('--editor-font-size', `${px}px`);
  else document.documentElement.style.removeProperty('--editor-font-size');
  }

export function setPreviewFontSize(px) {
  localStorage.setItem(LS.previewFont, String(px));
  if (px > 0) document.documentElement.style.setProperty('--preview-font-size', `${px}px`);
  else document.documentElement.style.removeProperty('--preview-font-size');
  }

export function setDensity(level) {
  localStorage.setItem(LS.density, level);
  document.documentElement.style.setProperty('--ui-gap', DENSITY_GAP[level] || DENSITY_GAP.standard);
  }

// ---- G4/R8/R10：Ctrl+滚轮缩放编辑器排版（字号 / 字间距 / 行间距）----
// 复用同一组 :root CSS 变量（--editor-font-size / --editor-letter-spacing / --editor-line-height），
// 因此编辑栏与对比/合并页共享同一缩放状态，天然保持「一致 + 联动」。
// 修饰键：Ctrl+滚轮=字号(10-32px,步长1)；Ctrl+Shift+滚轮=字间距(0-4px,步长0.5)；
//        Ctrl+Alt+滚轮=行间距(1-2.5,步长0.1)。返回 true 表示已拦截并处理缩放（调用方据此同步 UI）。
// R10 修复：字号缩放原本只写 --editor-font-size（编辑栏+对比栏变，预览因独立 --preview-font-size 不变）。
//   为落实「三栏一致+联动」，字号缩放同时同步写入 --preview-font-size，使预览栏随缩放联动。
//   注：这会覆盖预览独立字号设置（缩放手势语义即「整体视觉缩放」，符合一致性预期）；
//       在设置面板显式调整预览字号仍独立生效。
export function applyZoomFromWheel(e) {
  if (!e.ctrlKey) return false;
  e.preventDefault();
  const dir = e.deltaY < 0 ? 1 : -1;
  let kind = 'fontSize';
  let next = 0;
  if (e.shiftKey) {
    kind = 'letterSpacing';
    const cur = parseFloat(getEditorLetterSpacing() || '0') || 0;
    next = Math.min(4, Math.max(0, Math.round((cur + dir * 0.5) * 10) / 10));
    setEditorLetterSpacing(next);
  } else if (e.altKey) {
    kind = 'lineHeight';
    const cur = parseFloat(getEditorLineHeight() || '1.6') || 1.6;
    next = Math.min(2.5, Math.max(1, Math.round((cur + dir * 0.1) * 10) / 10));
    setEditorLineHeight(next);
  } else {
    kind = 'fontSize';
    const cur = getEditorFontSize() || 14;
    next = Math.min(32, Math.max(10, cur + dir));
    setEditorFontSize(next);
    // R10：字号缩放同步预览字号，落实三栏联动。
    setPreviewFontSize(next);
  }
  // R10 诊断探针：覆盖全部缩放子路径（字号/字间距/行高），
  // 捕获三栏 computed line-height + 预览 font-size 及根变量值，用于核对预览是否随缩放联动。
  if (typeof window !== 'undefined' && typeof window.__probe === 'function') {
    const cs = (sel, prop) => { const el = document.querySelector(sel); return el ? getComputedStyle(el)[prop] : '(none)'; };
    window.__probe('display.lineHeight.applied', {
      trigger: 'wheel',
      kind,
      value: next,
      varEditorLineHeight: (getComputedStyle(document.documentElement).getPropertyValue('--editor-line-height') || '').trim(),
      varEditorFontSize: (getComputedStyle(document.documentElement).getPropertyValue('--editor-font-size') || '').trim(),
      varPreviewFontSize: (getComputedStyle(document.documentElement).getPropertyValue('--preview-font-size') || '').trim(),
      editorCmContentLH: cs('.editor-container .cm-editor .cm-content', 'lineHeight'),
      editorCmLineLH: cs('.editor-container .cm-editor .cm-line', 'lineHeight'),
      previewLH: cs('.markdown-body', 'lineHeight'),
      previewFS: cs('.markdown-body', 'fontSize'),
      compareCmContentLH: cs('.compare-view .cm-editor .cm-content', 'lineHeight'),
    });
  }
  return true;
}

// 初始化：恢复持久化设置
export function initDisplaySettings() {
  document.documentElement.classList.toggle('focus-mode', focusMode);
  applyDisplaySettings();
  }
