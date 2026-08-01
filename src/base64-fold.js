// ============================================================
// A-9 超长 Base64 图片行折叠
// 用 ViewPlugin + Decoration 把超长 data: 行（粘贴图片生成的 base64）替换为
// 占位装饰，避免长行拖慢编辑器；点击占位可临时展开该行。
// 复用 selectedBracketHighlight 的 ViewPlugin + Decoration 范式。
// ============================================================
import { Decoration, ViewPlugin, EditorView, WidgetType } from '@codemirror/view';
import { RangeSetBuilder } from '@codemirror/state';
import { probe } from './probe.js';

const FOLD_MIN_LEN = 200; // 超过此长度的 data: 行才折叠

// 每个 view 独立记录「已展开」的行号，避免多实例互相影响
const unfoldedMap = new WeakMap();

class Base64FoldWidget extends WidgetType {
  constructor(lineNumber, len) { super(); this.lineNumber = lineNumber; this.len = len; }
  eq(other) {
    return other instanceof Base64FoldWidget && other.len === this.len && other.lineNumber === this.lineNumber;
  }
  toDOM(view) {
    const wrap = document.createElement('span');
    wrap.className = 'cm-base64-fold';
    wrap.textContent = `📎 图片 base64 已折叠（长度 ${this.len}）— 点击展开`;
    wrap.addEventListener('click', (e) => {
      e.preventDefault();
      const set = unfoldedMap.get(view) || new Set();
      set.add(this.lineNumber); // 记住自身行号，点击即展开该行
      unfoldedMap.set(view, set);
      // ===== PROBE START =====
      probe('A9_EXPAND', { line: this.lineNumber, len: this.len }, { loc: 'base64-fold.js' });
      // ===== PROBE END =====
      view.dispatch({}); // 触发插件重建装饰
    });
    return wrap;
  }
  ignoreEvent() { return false; }
}

function buildFolds(view) {
  const builder = new RangeSetBuilder();
  const set = unfoldedMap.get(view) || new Set();
  const doc = view.state.doc;
  for (let i = 1; i <= doc.lines; i++) {
    const line = doc.line(i);
    const txt = line.text;
    if (txt.startsWith('data:') && txt.length > FOLD_MIN_LEN && !set.has(i)) {
      builder.add(line.from, line.to, Decoration.replace({ widget: new Base64FoldWidget(i, txt.length) }));
    }
  }
  return builder.finish();
}

export const base64FoldPlugin = ViewPlugin.fromClass(
  class {
    constructor(view) { this.view = view; this.decorations = buildFolds(view); }
    update(u) {
      if (u.docChanged || u.viewportChanged || u.selectionSet || u.focusChanged) {
        this.decorations = buildFolds(u.view);
      }
    }
  },
  { decorations: (v) => v.decorations }
);

// 提供给 editor.js 的接入点（统一在 editor.js 注册探针环境与调用）
export function initBase64Fold() {
  // ===== PROBE START =====
  probe('A9_INIT', { foldMinLen: FOLD_MIN_LEN }, { loc: 'base64-fold.js' });
  // ===== PROBE END =====
  return base64FoldPlugin;
}
