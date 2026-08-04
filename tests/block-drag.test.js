/**
 * block-drag.test.js — 需求 9 块拖拽：readCodeMirrorBlockRanges 纯逻辑 + isBlockStart 纯函数
 *
 * 说明：readCodeMirrorBlockRanges 依赖 @codemirror/lang-markdown 语法树，需在 node
 * 环境用 ensureSyntaxTree 强制完整解析后断言块范围。拖拽交互（moveCodeMirrorBlock /
 * addCodeMirrorBlockBelow / 工具栏 DOM）依赖 CodeMirror + DOM 运行时，无法在 node 纯环境
 * 实测；其正确性由构建通过 + 浏览器/EXE 探针运行时验证。此处锁定可纯逻辑验证的块解析。
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { EditorState } from '@codemirror/state';
import { markdown } from '@codemirror/lang-markdown';
import { ensureSyntaxTree } from '@codemirror/language';
import { readCodeMirrorBlockRanges, isBlockStart } from '../src/block-drag.js';

// 构造带完整语法的 Markdown 文档（标题/段落/无序列表+嵌套/有序列表/引用/代码块）
const SAMPLE = [
  '# 标题',
  '',
  '第一段段落文字，用于验证 Paragraph 块。',
  '',
  '- 项目一',
  '- 项目二',
  '  - 嵌套项',
  '',
  '1. 有序一',
  '2. 有序二',
  '',
  '> 引用一行',
  '> 引用二行',
  '',
  '```',
  '代码块内容',
  '```',
  '',
].join('\n');

function parseBlocks(doc) {
  const state = EditorState.create({ doc, extensions: [markdown()] });
  // 强制同步完整解析，否则小块可能只解析到视口。
  ensureSyntaxTree(state, doc.length, 1e9);
  return readCodeMirrorBlockRanges(state);
}

// ─── readCodeMirrorBlockRanges：多块解析 ──────────────────────────────────────

test('readCodeMirrorBlockRanges: 解析出标题/段落/列表/引用/代码块等块', () => {
  const blocks = parseBlocks(SAMPLE);
  const names = blocks.map((b) => b.name);

  assert.ok(blocks.length >= 8, `块数量应 >= 8，实际 ${blocks.length}`);
  assert.ok(names.some((n) => n.startsWith('ATXHeading')), '应包含标题块');
  assert.ok(names.includes('Paragraph'), '应包含段落块');
  assert.ok(names.filter((n) => n === 'ListItem').length >= 5, '应含 >=5 个 ListItem');
  assert.ok(names.includes('Blockquote'), '应包含引用块');
  assert.ok(
    names.some((n) => n === 'FencedCode' || n === 'CodeBlock'),
    '应包含代码块',
  );
});

test('readCodeMirrorBlockRanges: 块按文档顺序从前到后排列', () => {
  const blocks = parseBlocks(SAMPLE);
  for (let i = 1; i < blocks.length; i += 1) {
    assert.ok(
      blocks[i].from >= blocks[i - 1].from,
      `块应按 from 升序排列（索引 ${i}）`,
    );
  }
});

test('readCodeMirrorBlockRanges: 首块从文档起点开始，末块覆盖到文档末尾', () => {
  const blocks = parseBlocks(SAMPLE);
  assert.equal(blocks[0].from, 0, '首块应始于文档起点');
  assert.equal(blocks[blocks.length - 1].to, SAMPLE.length, '末块应覆盖到文档末尾');
});

test('readCodeMirrorBlockRanges: 嵌套列表项带有 depth=1', () => {
  const blocks = parseBlocks(SAMPLE);
  const nested = blocks.filter((b) => b.name === 'ListItem' && b.depth === 1);
  assert.equal(nested.length, 1, '应恰好 1 个 depth=1 的嵌套列表项');
});

test('readCodeMirrorBlockRanges: 单块文档返回单块且覆盖全文档', () => {
  const doc = '# 仅一个标题';
  const blocks = parseBlocks(doc);
  assert.equal(blocks.length, 1);
  assert.equal(blocks[0].from, 0);
  assert.equal(blocks[0].to, doc.length);
});

test('readCodeMirrorBlockRanges: 空文档返回空数组', () => {
  const blocks = parseBlocks('');
  assert.deepEqual(blocks, []);
});

// ─── isBlockStart：不依赖 CM6 的纯函数 ───────────────────────────────────────

test('isBlockStart: 命中首行偏移返回 true', () => {
  const blocks = [
    { from: 0, to: 5, name: 'ATXHeading1' },
    { from: 7, to: 20, name: 'Paragraph' },
  ];
  assert.equal(isBlockStart(blocks, 0), true);
  assert.equal(isBlockStart(blocks, 7), true);
});

test('isBlockStart: 非首行偏移返回 false', () => {
  const blocks = [
    { from: 0, to: 5, name: 'ATXHeading1' },
    { from: 7, to: 20, name: 'Paragraph' },
  ];
  assert.equal(isBlockStart(blocks, 3), false);
  assert.equal(isBlockStart(blocks, 12), false);
});

test('isBlockStart: 非法入参安全返回 false', () => {
  assert.equal(isBlockStart(null, 0), false);
  assert.equal(isBlockStart([], undefined), false);
  assert.equal(isBlockStart([{ from: 1 }], 'x'), false);
});
