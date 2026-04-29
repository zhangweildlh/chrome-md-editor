# Local Images And Paste Support Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add local-image preview support and paste-image insertion to the Chrome Markdown editor without adding any backend service.

**Architecture:** Extract pure image/path helpers into a small module that can be tested with Node's built-in test runner, then wire those helpers into the existing preview and editor event flow in `src/editor.js`. Image preview resolution will use document context metadata, and paste-image handling will prefer writing files into a sibling `images/` folder when the current Markdown file has a writable directory context, otherwise it will fall back to base64 data URLs in Markdown.

**Tech Stack:** Vite, vanilla ES modules, CodeMirror 6, Markdown-it, File System Access API, Node `node:test`

**Follow-up status 2026-04-29:** Implemented and re-verified. `npm test -- tests/image-support.test.js` passes with 7 tests, and `npm run build` completes successfully with only the pre-existing Vite large chunk warning.

---

### Task 1: Add test harness and failing helper tests

**Files:**
- Modify: `package.json`
- Create: `tests/image-support.test.js`
- Test: `tests/image-support.test.js`

- [ ] **Step 1: Write the failing test**

```js
import test from 'node:test';
import assert from 'node:assert/strict';
import {
  buildPastedImageMarkdown,
  createPastedImageFilename,
  resolvePreviewImageSource,
} from '../src/image-support.js';

test('resolvePreviewImageSource keeps remote and data urls unchanged', () => {
  assert.equal(
    resolvePreviewImageSource('https://example.com/a.png', {}),
    'https://example.com/a.png'
  );
  assert.equal(
    resolvePreviewImageSource('data:image/png;base64,abc', {}),
    'data:image/png;base64,abc'
  );
});

test('resolvePreviewImageSource resolves relative path against file url context', () => {
  assert.equal(
    resolvePreviewImageSource('../assets/demo.png', {
      currentFileUrl: 'file:///Users/demo/docs/guide/readme.md',
    }),
    'file:///Users/demo/docs/assets/demo.png'
  );
});

test('resolvePreviewImageSource resolves relative path against directory context', () => {
  assert.equal(
    resolvePreviewImageSource('./images/demo.png', {
      currentDirectoryPath: 'notes/project',
    }),
    'notes/project/images/demo.png'
  );
});

test('createPastedImageFilename uses a stable prefix and extension', () => {
  assert.match(
    createPastedImageFilename({
      timestamp: new Date('2026-04-19T10:11:12.000Z'),
      extension: 'png',
    }),
    /^pasted-20260419-101112(-[a-z0-9]{4})?\.png$/
  );
});

test('buildPastedImageMarkdown inserts a relative image reference', () => {
  assert.equal(
    buildPastedImageMarkdown({
      alt: 'pasted-image',
      imagePath: 'images/pasted-20260419-101112.png',
    }),
    '![pasted-image](images/pasted-20260419-101112.png)'
  );
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test -- tests/image-support.test.js`
Expected: FAIL with `Cannot find module '../src/image-support.js'` or missing export errors.

- [ ] **Step 3: Write minimal implementation**

```js
export function resolvePreviewImageSource(src, context = {}) {
  // minimal implementation added in src/image-support.js
}

export function createPastedImageFilename({ timestamp, extension }) {
  // minimal implementation added in src/image-support.js
}

export function buildPastedImageMarkdown({ alt, imagePath }) {
  return `![${alt}](${imagePath})`;
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npm test -- tests/image-support.test.js`
Expected: PASS with all tests green.

- [ ] **Step 5: Commit**

```bash
git add package.json tests/image-support.test.js src/image-support.js
git commit -m "test: add image support helper coverage"
```

### Task 2: Resolve local preview images using document context

**Files:**
- Modify: `src/editor.js`
- Create: `src/image-support.js`
- Test: `tests/image-support.test.js`

- [ ] **Step 1: Write the failing test**

```js
test('resolvePreviewImageSource keeps unsupported relative paths unresolved when no context exists', () => {
  assert.equal(resolvePreviewImageSource('./images/demo.png', {}), null);
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test -- tests/image-support.test.js`
Expected: FAIL because the helper still returns the wrong value for missing context.

- [ ] **Step 3: Write minimal implementation**

```js
// In src/image-support.js
export function resolvePreviewImageSource(src, context = {}) {
  // keep http/https/data/blob/file absolute urls
  // resolve relative paths against context.currentFileUrl when present
  // otherwise resolve against context.currentDirectoryPath when present
  // otherwise return null
}

// In src/editor.js
// track currentFileUrl and currentDirectoryPath metadata
// after preview HTML render, scan img tags and replace local src with resolved values
// add a small user-facing fallback on img error when resolution fails
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npm test -- tests/image-support.test.js`
Expected: PASS with the missing-context case covered.

- [ ] **Step 5: Commit**

```bash
git add src/editor.js src/image-support.js tests/image-support.test.js
git commit -m "feat: resolve local markdown images in preview"
```

### Task 3: Add paste-image insertion with file-write and base64 fallback

**Files:**
- Modify: `src/editor.js`
- Modify: `src/editor.html`
- Modify: `src/editor.css`
- Test: `tests/image-support.test.js`

- [ ] **Step 1: Write the failing test**

```js
test('buildPastedImageMarkdown supports base64 image sources', () => {
  assert.equal(
    buildPastedImageMarkdown({
      alt: 'pasted-image',
      imagePath: 'data:image/png;base64,abc',
    }),
    '![pasted-image](data:image/png;base64,abc)'
  );
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test -- tests/image-support.test.js`
Expected: FAIL if the helper or paste pipeline rejects data URLs.

- [ ] **Step 3: Write minimal implementation**

```js
// In src/editor.js
// listen for paste events on the CodeMirror editor root
// detect image clipboard items
// if current markdown has writable directory context:
//   create/get sibling images directory
//   write clipboard image file
//   insert relative markdown image syntax at current selection
// else:
//   convert blob to data url
//   insert markdown image syntax with that data url
// show toast describing which storage path was used
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npm test -- tests/image-support.test.js`
Expected: PASS with base64 markdown generation still green.

- [ ] **Step 5: Commit**

```bash
git add src/editor.js src/editor.html src/editor.css tests/image-support.test.js
git commit -m "feat: paste clipboard images into markdown"
```

### Task 4: Update docs and development log

**Files:**
- Modify: `DEVLOG.md`
- Modify: `README.md` (only if user-facing usage text needs the new feature)

- [ ] **Step 1: Write the failing test**

```txt
No automated test. This is a documentation-only task.
```

- [ ] **Step 2: Run test to verify it fails**

Run: `printf 'docs task uses manual verification\n'`
Expected: Manual-only documentation task noted.

- [ ] **Step 3: Write minimal implementation**

```md
## 2026-04-19 第五阶段：本地图片预览 + 粘贴图片插入

- 支持相对路径图片预览
- 支持剪贴板图片写入 images/ 目录
- 无目录上下文时自动回退为 data URL
```

- [ ] **Step 4: Run test to verify it passes**

Run: `git diff -- DEVLOG.md README.md`
Expected: Only documentation lines relevant to image support are changed.

- [ ] **Step 5: Commit**

```bash
git add DEVLOG.md README.md
git commit -m "docs: record image support workflow"
```

### Task 5: Verify feature behavior end-to-end

**Files:**
- Modify: `package.json` (only if test script was added earlier)
- Test: `tests/image-support.test.js`

- [ ] **Step 1: Write the failing test**

```txt
No new automated test file. This task is fresh verification of the completed behavior.
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test -- tests/image-support.test.js`
Expected: If any regression exists, this command fails and blocks completion.

- [ ] **Step 3: Write minimal implementation**

```txt
Fix only the concrete failures revealed by the verification commands.
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npm test -- tests/image-support.test.js && npm run build`
Expected: Tests PASS and Vite build exits with code 0.

- [ ] **Step 5: Commit**

```bash
git add package.json src/editor.js src/editor.html src/editor.css src/image-support.js tests/image-support.test.js DEVLOG.md
git commit -m "feat: add local image preview and paste support"
```
