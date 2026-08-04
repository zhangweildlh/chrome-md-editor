// 视图模式（需求 6：P2 S2 视图扩展）
// 把 markra 的 15 元素视图矩阵裁剪映射成 CME 实际拥有的外壳元素，
// 仅做 DOM classList 切换，不引入 CM6 扩展（单一 EditorView 内纯 DOM 控制）。
//
// 设计要点：
// - 设置存 localStorage（键 md-editor-chrome-mode，默认 'daily'）。
// - 只对 CME 真实存在的元素操作，缺失则跳过（不报错）。
// - applyViewMode 只切 DOM，不碰 editor；requestMeasure 由主 Agent 在 INIT 接线时处理。

export const VIEW_MODE_OPTIONS = ['daily', 'focus', 'immersive', 'full'];

const STORAGE_KEY = 'md-editor-chrome-mode';

// CME 实际拥有的外壳元素：视图矩阵 key → DOM id
// 注意：底部状态栏真实 id 为 statusbar（全小写），字数元素为 statusWords。
const ELEMENT_IDS = {
  editorPanel: 'editorPanel',
  previewPanel: 'previewPanel',
  resizer: 'resizer',
  toolbar: 'toolbar',
  outlinePanel: 'outlinePanel',
  taskListPanel: 'taskListPanel',
  fileSidebar: 'fileSidebar',
  statusBar: 'statusbar',
  wordCount: 'statusWords',
};

// 预设矩阵（元素 → 是否显示）。daily/full 全显。
const PRESETS = {
  daily: {
    editorPanel: true,
    previewPanel: true,
    resizer: true,
    toolbar: true,
    outlinePanel: true,
    taskListPanel: true,
    fileSidebar: true,
    statusBar: true,
    wordCount: true,
  },
  full: {
    editorPanel: true,
    previewPanel: true,
    resizer: true,
    toolbar: true,
    outlinePanel: true,
    taskListPanel: true,
    fileSidebar: true,
    statusBar: true,
    wordCount: true,
  },
  // 专注：隐文件树 / 大纲 / 任务 / 状态栏；保留编辑-预览分隔条与工具栏。
  focus: {
    editorPanel: true,
    previewPanel: true,
    resizer: true,
    toolbar: true,
    outlinePanel: false,
    taskListPanel: false,
    fileSidebar: false,
    statusBar: false,
    wordCount: true,
  },
  // 沉浸：在专注基础上再隐工具栏。
  immersive: {
    editorPanel: true,
    previewPanel: true,
    resizer: true,
    toolbar: false,
    outlinePanel: false,
    taskListPanel: false,
    fileSidebar: false,
    statusBar: false,
    wordCount: true,
  },
};

// 循环顺序
const CYCLE = ['daily', 'focus', 'immersive', 'full'];

function isViewMode(value) {
  return VIEW_MODE_OPTIONS.includes(value);
}

function normalizeMode(value) {
  return isViewMode(value) ? value : 'daily';
}

// 返回元素 key → 布尔（是否显示）矩阵。未知 mode 回退 daily。
export function resolveViewModeChrome(mode) {
  const m = normalizeMode(mode);
  return { ...PRESETS[m] };
}

// 对各外壳元素 classList add/remove 'view-hidden'，只对 CME 实际存在元素操作。
export function applyViewMode(mode) {
  const matrix = resolveViewModeChrome(mode);
  for (const key of Object.keys(matrix)) {
    const id = ELEMENT_IDS[key];
    if (!id) continue;
    const el = document.getElementById(id);
    if (!el) continue; // 元素缺失则跳过
    if (matrix[key]) {
      el.classList.remove('view-hidden');
    } else {
      el.classList.add('view-hidden');
    }
  }
}

// daily → focus → immersive → full → daily 循环
export function nextViewMode(mode) {
  if (!isViewMode(mode)) return 'daily';
  const idx = CYCLE.indexOf(mode);
  if (idx < 0) return 'daily';
  return CYCLE[(idx + 1) % CYCLE.length];
}

export function getStoredViewMode() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    return normalizeMode(raw);
  } catch {
    return 'daily';
  }
}

export function setStoredViewMode(mode) {
  const m = normalizeMode(mode);
  try {
    localStorage.setItem(STORAGE_KEY, m);
  } catch {
    // localStorage 不可用时静默忽略（不影响本次会话 DOM 切换）
  }
  return m;
}

// 绑定工具栏 ⊞ 按钮：点击循环切换并持久化（applyViewMode 只切 DOM）。
export function initChromeModeButton() {
  const btn = document.getElementById('btnChromeMode');
  if (!btn) return;
  btn.addEventListener('click', () => {
    const m = nextViewMode(getStoredViewMode());
    setStoredViewMode(m);
    applyViewMode(m);
  });
}
