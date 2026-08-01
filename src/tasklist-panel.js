// ============================================================
// A-12 任务列表面板
//  - 解析编辑器源码中所有 `- [ ]` / `- [x]` 任务项（含 * / + / 有序列表）；
//  - 生成可勾选的列表；勾选状态回写到源码对应行（仅替换 [ ] / [x] 标记）；
//  - 与预览区已有的任务列表 checkbox 互不冲突（都基于同一份源码）。
// 纯前端。
// ============================================================
import { probe } from './probe.js';

const TASK_LINE_RE = /^(\s*(?:[-*+]|\d+\.)\s+)\[([ xX])\]\s+(.*)$/;

let taskView = null;

export function setTaskEditor(view) {
  taskView = view;
}

export function getTaskItems(view) {
  const v = view || taskView;
  const items = [];
  if (!v) return items;
  const doc = v.state.doc;
  for (let i = 1; i <= doc.lines; i++) {
    const line = doc.line(i);
    const m = line.text.match(TASK_LINE_RE);
    if (m) {
      items.push({
        lineNumber: i,
        checked: m[2].toLowerCase() === 'x',
        text: m[3],
        indent: m[1].length,
      });
    }
  }
  // ===== PROBE START =====
  probe('A12_TASKS_BUILD', { count: items.length }, { loc: 'tasklist-panel.js' });
  // ===== PROBE END =====
  return items;
}

export function renderTaskList(items) {
  const list = document.getElementById('taskList');
  if (!list) return;
  list.innerHTML = '';
  if (!items.length) {
    list.innerHTML = '<div class="panel-empty">暂无任务</div>';
    return;
  }
  for (const it of items) {
    const el = document.createElement('label');
    el.className = 'task-item' + (it.checked ? ' checked' : '');

    const cb = document.createElement('input');
    cb.type = 'checkbox';
    cb.checked = it.checked;
    cb.addEventListener('change', () => {
      toggleTaskAtLine(it.lineNumber, cb.checked);
    });

    const span = document.createElement('span');
    span.className = 'task-text';
    span.textContent = it.text || '(空任务)';

    el.appendChild(cb);
    el.appendChild(span);
    list.appendChild(el);
  }
}

export function toggleTaskAtLine(lineNumber, checked) {
  if (!taskView) return;
  const doc = taskView.state.doc;
  if (lineNumber < 1 || lineNumber > doc.lines) return;
  const line = doc.line(lineNumber);
  const m = line.text.match(TASK_LINE_RE);
  if (!m) return;
  // m[1] 为「缩进+列表符号+空格+[」，标记 [ ]/[x] 从 line.from + m[1].length 起，长 3
  const from = line.from + m[1].length;
  const to = from + 3;
  const newMark = checked ? '[x]' : '[ ]';
  taskView.dispatch({ changes: { from, to, insert: newMark } });
  // ===== PROBE START =====
  probe('A12_TASK_TOGGLE', { lineNumber, checked, from, to }, { loc: 'tasklist-panel.js' });
  // ===== PROBE END =====
}
