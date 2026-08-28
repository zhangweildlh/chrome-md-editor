/**
 * compare-parse-unified-diff.test.js — parseUnifiedDiff 单元测试
 *
 * 覆盖：
 *   1. /dev/null 文件（新文件/删除文件）
 *   2. No newline at end of file
 *   3. binary patch（跳过）
 *   4. 多文件 diff
 *   5. 普通修改（上下文 + 增删）
 */

import test from 'node:test';
import assert from 'node:assert/strict';
import { parseUnifiedDiff } from '../src/compare/parse-unified-diff.js';

// 简单辅助：把 diff 文本拆成行
function splitLines(text) {
  return text.split(/\r?\n/);
}

test('parseUnifiedDiff: 空文本返回空 files', () => {
  const { files } = parseUnifiedDiff('');
  assert.equal(files.length, 0);
});

test('parseUnifiedDiff: /dev/null 新文件（oldPath 为空，newPath 为实际路径）', () => {
  const diff = [
    'diff --git a/newfile.md b/newfile.md',
    'new file mode 100644',
    'index 0000000..e69de29',
    '--- /dev/null',
    '+++ b/newfile.md',
    '@@ -0,0 +1,2 @@',
    '+line1',
    '+line2',
    '',
  ].join('\n');
  const { files } = parseUnifiedDiff(diff);
  assert.equal(files.length, 1);
  assert.equal(files[0].oldPath, '');
  assert.equal(files[0].newPath, 'newfile.md');
  assert.ok(files[0].oldText === null || files[0].oldText === '');
  assert.ok(files[0].newText?.includes('line1'));
});

test('parseUnifiedDiff: /dev/null 删除文件（newPath 为空）', () => {
  const diff = [
    'diff --git a/oldfile.md b/oldfile.md',
    'deleted file mode 100644',
    'index e69de29..0000000',
    '--- a/oldfile.md',
    '+++ /dev/null',
    '@@ -1,2 +0,0 @@',
    '-line1',
    '-line2',
    '',
  ].join('\n');
  const { files } = parseUnifiedDiff(diff);
  assert.equal(files.length, 1);
  assert.equal(files[0].newPath, '');
  assert.ok(files[0].newText === null || files[0].newText === '');
  assert.ok(files[0].oldText?.includes('line1'));
});

test('parseUnifiedDiff: No newline at end of file 应被识别但当前实现仅跳过', () => {
  const diff = [
    'diff --git a/a.md b/a.md',
    '--- a/a.md',
    '+++ b/a.md',
    '@@ -1,2 +1,2 @@',
    ' line1',
    '-old',
    '+new',
    '\\ No newline at end of file',
    '',
  ].join('\n');
  const { files } = parseUnifiedDiff(diff);
  assert.equal(files.length, 1);
  assert.ok(files[0].newText?.includes('new'));
});

test('parseUnifiedDiff: binary patch 标记 binary=true', () => {
  const diff = [
    'diff --git a/image.png b/image.png',
    'index 1234567..abcdefg 100644',
    'GIT binary patch',
    'literal 0',
    ')',
    '',
  ].join('\n');
  const { files } = parseUnifiedDiff(diff);
  assert.equal(files.length, 1);
  assert.equal(files[0].binary, true);
  assert.equal(files[0].oldText, null);
  assert.equal(files[0].newText, null);
});

test('parseUnifiedDiff: 多文件 diff 返回多个 DiffFile', () => {
  const diff = [
    'diff --git a/first.md b/first.md',
    '--- a/first.md',
    '+++ b/first.md',
    '@@ -1,2 +1,2 @@',
    ' old',
    '-line1',
    '+LINE1',
    ' line2',
    '',
    'diff --git a/second.md b/second.md',
    '--- a/second.md',
    '+++ b/second.md',
    '@@ -1 +1,2 @@',
    '-old',
    '+first',
    '+second',
    '',
  ].join('\n');
  const { files } = parseUnifiedDiff(diff);
  assert.equal(files.length, 2);
  assert.equal(files[0].oldPath, 'first.md');
  assert.equal(files[1].oldPath, 'second.md');
});

test('parseUnifiedDiff: 普通修改块重建 oldText/newText', () => {
  const diff = [
    'diff --git a/test.md b/test.md',
    '--- a/test.md',
    '+++ b/test.md',
    '@@ -1,3 +1,3 @@',
    ' line1',
    '-oldLine',
    '+newLine',
    ' line3',
    '',
  ].join('\n');
  const { files } = parseUnifiedDiff(diff);
  assert.equal(files.length, 1);
  assert.ok(files[0].oldText?.includes('oldLine'));
  assert.ok(files[0].newText?.includes('newLine'));
  assert.ok(files[0].oldText?.includes('line1'));
  assert.ok(files[0].newText?.includes('line1'));
});

test('parseUnifiedDiff: hunk 数量限制（MAX_HUNKS_PER_FILE）', () => {
  // 构造超过 MAX_HUNKS_PER_FILE (1000) 的 diff
  const lines = ['diff --git a/large.md b/large.md'];
  for (let i = 0; i < 1005; i++) {
    lines.push(`@@ -${i},1 +${i},1 @@`);
    lines.push('-old' + i);
    lines.push('+new' + i);
  }
  const diff = lines.join('\n');
  const { files } = parseUnifiedDiff(diff);
  assert.equal(files.length, 1);
  // 应被限制在 1000 个 hunk
  assert.ok(files[0].hunks.length <= 1000, `hunk 数量 ${files[0].hunks.length} 不应超过 1000`);
});

test('parseUnifiedDiff: 无差异文档返回空 files', () => {
  const diff = '';
  const { files } = parseUnifiedDiff(diff);
  assert.equal(files.length, 0);
});
