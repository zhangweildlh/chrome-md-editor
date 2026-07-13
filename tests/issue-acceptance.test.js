/**
 * Strict acceptance tests mapped to GitHub Issues #1 #2 #3.
 * These are the contracts we owe reporters — fail closed, not wishful.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, mkdtempSync, writeFileSync, mkdirSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { pathToFileURL } from 'node:url';
import { parseHTML } from 'linkedom';

import { resolvePreviewImageSource } from '../src/image-support.js';
import { htmlToMarkdown, normalizeMarkdown } from '../src/html-to-markdown.js';
import {
  buildLastFileRecord,
  isLastFileUsable,
  rememberLastFile,
  loadLastFile,
  clearLastFile,
  LAST_FILE_KEY,
} from '../src/session-restore.js';
import {
  newInstanceId,
  pendingFileStorageKey,
  editorUrlWithInstance,
} from '../src/instance-id.js';

function toMd(html) {
  return htmlToMarkdown(html, { parseHTML });
}

// ─── Issue #1 Q1: local image preview path resolution ───────────────────────

test('Issue #1 Q1: relative local image resolves under file:// markdown context', () => {
  const mdUrl = 'file:///Users/demo/project/notes/readme.md';
  const src = './images/photo.png';
  const resolved = resolvePreviewImageSource(src, { currentFileUrl: mdUrl });
  assert.equal(resolved, 'file:///Users/demo/project/notes/images/photo.png');
});

test('Issue #1 Q1: sibling folder image resolves with directory context (open folder)', () => {
  const resolved = resolvePreviewImageSource('images/a.png', {
    currentDirectoryPath: 'docs',
  });
  assert.equal(resolved, 'docs/images/a.png');
});

test('Issue #1 Q1: without context, relative local image stays unresolved (honest failure)', () => {
  assert.equal(resolvePreviewImageSource('images/a.png', {}), null);
});

test('Issue #1 Q1: real fixture path pattern matches file URL layout', () => {
  const dir = mkdtempSync(join(tmpdir(), 'md-issue1-'));
  const imgDir = join(dir, 'images');
  mkdirSync(imgDir);
  const imgPath = join(imgDir, 'dot.png');
  // 1x1 PNG
  writeFileSync(
    imgPath,
    Buffer.from(
      'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==',
      'base64'
    )
  );
  const mdPath = join(dir, 'note.md');
  writeFileSync(mdPath, '![dot](images/dot.png)\n');
  const fileUrl = pathToFileURL(mdPath).href;
  const resolved = resolvePreviewImageSource('images/dot.png', {
    currentFileUrl: fileUrl,
  });
  assert.ok(resolved.startsWith('file://'));
  assert.ok(resolved.includes('images/dot.png') || resolved.endsWith('images/dot.png'));
  // file should exist at decoded path
  const decoded = decodeURIComponent(resolved.replace(/^file:\/\//, ''));
  assert.equal(readFileSync(decoded).length > 0, true);
});

// ─── Issue #1 Q2: WYSIWYG must not corrupt image path to blob/object URL ────

test('Issue #1 Q2: html→md prefers data-md-original-src over blob src', () => {
  const html = `<p><img src="blob:https://example/abc-123" data-md-original-src="images/photo.png" alt="photo"></p>`;
  const md = toMd(html);
  assert.match(md, /!\[photo\]\(images\/photo\.png\)/);
  assert.doesNotMatch(md, /blob:/);
});

test('Issue #1 Q2: without original attr, falls back to src (no silent empty)', () => {
  const html = `<p><img src="images/fallback.png" alt="x"></p>`;
  const md = toMd(html);
  assert.match(md, /!\[x\]\(images\/fallback\.png\)/);
});

test('Issue #1 Q2: normalizeMarkdown collapses runaway blank lines from preview edit', () => {
  const messy = 'hello\n\n\n\n\nworld\n';
  assert.equal(normalizeMarkdown(messy), 'hello\n\nworld');
});

// ─── Issue #2: restore last document ────────────────────────────────────────

test('Issue #2: last-file record shape is restorable', () => {
  const record = buildLastFileRecord({
    content: '# 上次的内容\n\n本地图 ![a](images/a.png)\n',
    filename: '工作笔记.md',
    sourceUrl: 'file:///tmp/工作笔记.md',
  });
  assert.equal(isLastFileUsable(record), true);
  assert.equal(record.filename, '工作笔记.md');
  assert.ok(record.content.includes('images/a.png'));
});

test('Issue #2: chrome.storage mock remember → load round-trip', async () => {
  const store = {};
  globalThis.chrome = {
    storage: {
      local: {
        async set(obj) {
          Object.assign(store, obj);
        },
        async get(key) {
          if (typeof key === 'string') return { [key]: store[key] };
          return {};
        },
        async remove(key) {
          delete store[key];
        },
      },
    },
  };

  await clearLastFile();
  await rememberLastFile({
    content: 'restored body',
    filename: 'last.md',
    sourceUrl: null,
  });
  assert.ok(store[LAST_FILE_KEY]);
  const loaded = await loadLastFile();
  assert.equal(loaded.content, 'restored body');
  assert.equal(loaded.filename, 'last.md');
  await clearLastFile();
  assert.equal(await loadLastFile(), null);

  delete globalThis.chrome;
});

// ─── Issue #3: multi-instance + style HTML round-trip + toolbar tags ─────────

test('Issue #3: instance ids are unique enough for concurrent tabs', () => {
  const ids = new Set(Array.from({ length: 50 }, () => newInstanceId()));
  assert.equal(ids.size, 50);
});

test('Issue #3: pending storage keys do not collide across instances', () => {
  const a = pendingFileStorageKey('aaa');
  const b = pendingFileStorageKey('bbb');
  assert.equal(a, 'pendingFile_aaa');
  assert.equal(b, 'pendingFile_bbb');
  assert.notEqual(a, b);
  assert.equal(pendingFileStorageKey(null), 'pendingFile');
});

test('Issue #3: editor URL carries instance id', () => {
  const url = editorUrlWithInstance('chrome-extension://id/src/editor.html', 'uuid-1');
  assert.equal(url, 'chrome-extension://id/src/editor.html?i=uuid-1');
});

test('Issue #3: mark / center / font / sup / sub survive html→md round-trip', () => {
  const samples = [
    ['<p><mark>important</mark></p>', ['<mark>important</mark>']],
    // <b> may become **bold** markdown — center tag itself must remain
    ['<p><center><b>title</b></center></p>', ['<center>', 'title', '</center>']],
    ['<p><font color="red">红</font></p>', ['<font color="red">红</font>']],
    ['<p>X<sup>2</sup></p>', ['<sup>2</sup>']],
    ['<p>H<sub>2</sub>O</p>', ['<sub>2</sub>']],
  ];
  for (const [html, expectedSnippets] of samples) {
    const md = toMd(html);
    for (const expectedSnippet of expectedSnippets) {
      assert.ok(
        md.includes(expectedSnippet),
        `expected ${expectedSnippet} in:\n${md}`
      );
    }
  }
});

test('Issue #3: toolbar button ids exist in editor.html', () => {
  const html = readFileSync(new URL('../src/editor.html', import.meta.url), 'utf8');
  for (const id of [
    'btnCenterBold',
    'btnCenterBoldRed',
    'btnCenterBoldBlue',
    'btnHighlight',
    'btnHighlightBold',
    'btnSuperscript',
    'btnSubscript',
    'btnFontSize',
  ]) {
    assert.ok(html.includes(`id="${id}"`), `missing toolbar control ${id}`);
  }
});

test('Issue #3: background opens multi-instance URLs (source contract)', () => {
  const bg = readFileSync(new URL('../public/background.js', import.meta.url), 'utf8');
  assert.match(bg, /newInstanceId/);
  assert.match(bg, /\?i=/);
  assert.match(bg, /pendingFile_/);
  // must NOT reuse single tab only
  assert.doesNotMatch(bg, /tabs\.query\(\s*\{\s*url:\s*chrome\.runtime\.getURL\('src\/editor\.html'\)/);
});

test('Issue #3: onboarding help includes mark / nested quote / super-sub hints', () => {
  const ob = readFileSync(new URL('../src/onboarding.js', import.meta.url), 'utf8');
  assert.match(ob, /mark/i);
  assert.match(ob, /sup/i);
  assert.match(ob, /sub/i);
  assert.match(ob, /嵌套引用|>>/);
});
