// ============================================================
// A-8 高亮语法（==高亮==）
// 语法：行内 `==文本==` 渲染为 <mark>文本</mark>。
// 通过 markdown-it 的 inline ruler 识别 `==...==` 并生成
//   highlight_open(highlight_close) 一对 token（tag=mark），
// 由 markdown-it 默认渲染器输出 <mark>...</mark>。
// 预览区 <mark> 是可逆 DOM：src/html-to-markdown.js 的 convertNode
// 会把 <mark>x</mark> 还原为 ==x==（WYSIWYG 回写闭环，无需 data-md-source）。
// ============================================================

// `=` 的 charCode，避免魔法数字。
const EQ = 0x3D;

function highlightPlugin(md) {
  // 在 emphasis 之前插入，确保 `==` 优先于其他行内规则被识别。
  md.inline.ruler.before('emphasis', 'highlight', function highlight(state, silent) {
    const src = state.src;
    const max = state.posMax;
    const pos = state.pos;

    // 必须以 `==` 起始
    if (src.charCodeAt(pos) !== EQ || src.charCodeAt(pos + 1) !== EQ) {
      return false;
    }

    // 查找最近的闭合 `==`
    let end = pos + 2;
    while (end + 1 < max) {
      if (src.charCodeAt(end) === EQ && src.charCodeAt(end + 1) === EQ) {
        break;
      }
      end++;
    }
    // 未找到闭合标记
    if (end + 1 >= max) {
      return false;
    }

    const content = src.slice(pos + 2, end);
    // 仅当内容为空时不视为高亮；放宽原「首尾含空格即失效」规则，
    // 使 `== 高亮 ==`（内侧含空格）也能正常渲染为 <mark>，至少保证
    // `==高亮==`（不带内侧空格）始终生效（修复预览栏 == 高亮 == 不渲染问题）。
    if (!content.length) {
      return false;
    }

    if (!silent) {
      const open = state.push('highlight_open', 'mark', 1);
      open.markup = '==';
      const text = state.push('text', '', 0);
      text.content = content;
      const close = state.push('highlight_close', 'mark', -1);
      close.markup = '==';
    }

    state.pos = end + 2;
    return true;
  });
}

export { highlightPlugin };
