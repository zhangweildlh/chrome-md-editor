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

// 初始化：恢复持久化设置
export function initDisplaySettings() {
  document.documentElement.classList.toggle('focus-mode', focusMode);
  applyDisplaySettings();
  }
