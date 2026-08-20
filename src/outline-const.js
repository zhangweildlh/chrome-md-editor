// ============================================
// 大纲宽度共享常量（单一事实源，F5）：
// 编辑页 editor.js 与对比页 compare.js 共用，避免双份常量独立维护导致漂移
// ============================================
export const OUTLINE_WIDTH_KEY = 'md-editor-outline-width';
export const OUTLINE_WIDTH_DEFAULT = 260;
export const OUTLINE_MIN_WIDTH = 160; // 与 editor.css .side-panel-docked min-width 对齐
export const OUTLINE_MAX_WIDTH_ABS = 520;
