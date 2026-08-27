// trailing-space-view-plugin.js — 对比视图行尾空白高亮
//
// 移植自 delta（MIT License, Copyright (c) Dan Davison）的空白错误检测思想：
//   delta/src/edits.rs:110 get_contents_before_trailing_whitespace
//   delta/src/paint.rs:524-578 update_diff_style_sections
//
// 本文件为浏览器扩展场景适配：仅检测行尾空白段，加 Decoration.mark 装饰。
// 与主编辑器的 highlightSpaceDots（editor-extensions.js:202）互补：
//   - 主编辑器：显示空格（·）和 tab（→）符号，覆盖所有空白
//   - 对比视图：仅高亮行尾空白（视觉警示），不覆盖 tab 缩进（Markdown 代码块中 tab 可能合法）
//
// 【相对上游的改动】
//   1. 仅检测行尾空白（/\\s+$/），不检测行内 tab
//   2. 使用 .cm-compare-trailing-space class，作用域限定 .cm-mergeView
//   3. 纯 ViewPlugin 实现，不依赖 StateField

import { ViewPlugin, Decoration } from "@codemirror/view";
import { RangeSetBuilder } from "@codemirror/state";

const TRAILING_SPACE_CLASS = "cm-compare-trailing-space";

/**
 * 构建行尾空白装饰集。
 * 扫描视口内每行，检测尾随空白段（非换行符的空白字符），标记 Decoration.mark。
 * @param {import('@codemirror/view').EditorView} view
 * @returns {import('@codemirror/view').DecorationSet}
 */
function buildTrailingSpaceDecorations(view) {
  const builder = new RangeSetBuilder();
  for (const { from, to, line } of view.visibleRanges) {
    // 逐行遍历
    const docLine = view.state.doc.lineAt(line.from);
    const text = docLine.text;
    // 正则匹配行尾空白（不含换行符）
    const match = text.match(/(\s+)$/);
    if (match) {
      const whitespaceStart = text.length - match[1].length;
      // 相对于行首的偏移，转为文档绝对位置
      const absFrom = docLine.from + whitespaceStart;
      const absTo = docLine.from + text.length;
      builder.add(absFrom, absTo, Decoration.mark({
        class: TRAILING_SPACE_CLASS,
      }));
    }
  }
  return builder.finish();
}

/**
 * 行尾空白高亮 ViewPlugin。
 * 仅作用于对比视图（.cm-mergeView），不影响主编辑器。
 */
export const trailingSpaceViewPlugin = ViewPlugin.fromClass(class {
  constructor(view) {
    this.view = view;
    this.decorations = buildTrailingSpaceDecorations(view);
  }
  update(update) {
    // 文档变化或视口变化时重建装饰
    if (update.docChanged || update.viewportChanged) {
      this.decorations = buildTrailingSpaceDecorations(update.view);
    }
  }
}, {
  decorations: (v) => v.decorations,
});
