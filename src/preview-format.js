// Preview selection formatting (WYSIWYG).
// Apply styles on the rendered pane, then host syncs HTML → Markdown.

const TEXT_NODE = 3;
const ELEMENT_NODE = 1;

/**
 * @param {Node} node
 * @param {Element} root
 * @returns {HTMLElement | null}
 */
export function findMarkAncestor(node, root) {
  let n = node && node.nodeType === TEXT_NODE ? node.parentElement : node;
  while (n && n !== root) {
    if (n.nodeType === ELEMENT_NODE && n.tagName.toLowerCase() === 'mark') {
      return n;
    }
    n = n.parentElement;
  }
  return null;
}

/**
 * If the whole selection lives in one <mark>, return that mark (for toggle-off).
 * @param {Range} range
 * @param {Element} root
 */
export function rangeFullyInsideMark(range, root) {
  if (!range || range.collapsed) return null;
  const startMark = findMarkAncestor(range.startContainer, root);
  const endMark = findMarkAncestor(range.endContainer, root);
  if (startMark && startMark === endMark) return startMark;
  return null;
}

/**
 * Whether selection is non-empty and entirely inside root.
 * @param {Selection | null} selection
 * @param {Element} root
 */
export function selectionInsideRoot(selection, root) {
  if (!selection || selection.rangeCount === 0 || selection.isCollapsed) return false;
  const range = selection.getRangeAt(0);
  if (!root.contains(range.commonAncestorContainer)) return false;
  return true;
}

/**
 * Wrap range contents in <mark>, or unwrap if already fully inside one mark.
 * Mutates the DOM. Returns 'wrapped' | 'unwrapped' | 'noop'.
 * @param {Range} range
 * @param {Element} root
 * @param {{ createElement?: (tag: string) => HTMLElement }} [dom]
 */
export function toggleMarkOnRange(range, root, dom = {}) {
  if (!range || range.collapsed) return 'noop';
  if (!root.contains(range.commonAncestorContainer)) return 'noop';

  const existing = rangeFullyInsideMark(range, root);
  if (existing) {
    unwrapElement(existing);
    return 'unwrapped';
  }

  const createElement =
    dom.createElement || ((tag) => document.createElement(tag));
  const mark = createElement('mark');

  try {
    range.surroundContents(mark);
  } catch {
    // Selection crosses element boundaries — extract and re-insert.
    const frag = range.extractContents();
    mark.appendChild(frag);
    range.insertNode(mark);
  }

  // Collapse caret after the mark for less sticky selection noise
  try {
    range.setStartAfter(mark);
    range.collapse(true);
  } catch {
    /* ignore */
  }

  return 'wrapped';
}

/**
 * Replace element with its children.
 * @param {HTMLElement} el
 */
export function unwrapElement(el) {
  const parent = el.parentNode;
  if (!parent) return;
  while (el.firstChild) {
    parent.insertBefore(el.firstChild, el);
  }
  parent.removeChild(el);
  parent.normalize?.();
}
