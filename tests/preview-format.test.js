import test from 'node:test';
import assert from 'node:assert/strict';
import { parseHTML } from 'linkedom';

import {
  findMarkAncestor,
  rangeFullyInsideMark,
  selectionInsideRoot,
  unwrapElement,
} from '../src/preview-format.js';

// linkedom Range is incomplete (no setStart) — test pure helpers + unwrap only.
// toggleMarkOnRange is exercised in the browser.

function setup(html) {
  const { document } = parseHTML(
    `<!DOCTYPE html><html><body><div id="root">${html}</div></body></html>`
  );
  return { document, root: document.getElementById('root') };
}

test('findMarkAncestor walks up to mark inside root', () => {
  const { root } = setup('<p>hello <mark id="m">world</mark></p>');
  const text = root.querySelector('#m').firstChild;
  assert.equal(findMarkAncestor(text, root)?.id, 'm');
  assert.equal(findMarkAncestor(root.querySelector('p'), root), null);
});

test('unwrapElement keeps text content', () => {
  const { root } = setup('<p><mark>x</mark></p>');
  unwrapElement(root.querySelector('mark'));
  assert.equal(root.querySelector('mark'), null);
  assert.equal(root.textContent, 'x');
});

test('rangeFullyInsideMark when start and end share one mark', () => {
  const { root } = setup('<p><mark id="m">ab</mark>cd</p>');
  const mark = root.querySelector('#m');
  const text = mark.firstChild;
  const range = {
    collapsed: false,
    startContainer: text,
    endContainer: text,
    commonAncestorContainer: mark,
  };
  assert.equal(rangeFullyInsideMark(range, root), mark);
});

test('rangeFullyInsideMark is null when selection leaves the mark', () => {
  const { root } = setup('<p><mark id="m">ab</mark>cd</p>');
  const mark = root.querySelector('#m');
  const p = root.querySelector('p');
  const range = {
    collapsed: false,
    startContainer: mark.firstChild,
    endContainer: p.lastChild,
    commonAncestorContainer: p,
  };
  assert.equal(rangeFullyInsideMark(range, root), null);
});

test('selectionInsideRoot rejects null / empty selection objects', () => {
  const { root } = setup('<p>ab</p>');
  assert.equal(selectionInsideRoot(null, root), false);
  assert.equal(
    selectionInsideRoot({ rangeCount: 0, isCollapsed: true }, root),
    false
  );
  assert.equal(
    selectionInsideRoot(
      {
        rangeCount: 1,
        isCollapsed: false,
        getRangeAt: () => ({
          commonAncestorContainer: root.querySelector('p'),
        }),
      },
      root
    ),
    true
  );
});
