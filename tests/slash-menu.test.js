// ============================================================
// 斜杠菜单纯逻辑测试（需求 5 / P1 E1）
// ------------------------------------------------------------
// 仅测试模块级纯函数（isSlashTrigger / filterSlashCommands / 命令表），
// 不依赖 CodeMirror 6 实例。CM6 相关行为（StateField 自启、浮层渲染）
// 标注为 todo，待集成测试环境补充。
// ============================================================
import test from 'node:test';
import assert from 'node:assert/strict';
import {
  isSlashTrigger,
  filterSlashCommands,
  slashMenuCommands,
} from '../src/slash-menu.js';

// ------------------------------------------------------------
// 触发判断
// ------------------------------------------------------------
test('isSlashTrigger: / 前缀 + 查询词触发', () => {
  assert.deepEqual(isSlashTrigger('/hea'), { indent: '', query: 'hea' });
  assert.deepEqual(isSlashTrigger('/'), { indent: '', query: '' });
});

test('isSlashTrigger: 中文顿号 、 前缀同样触发', () => {
  assert.deepEqual(isSlashTrigger('、引用'), { indent: '', query: '引用' });
  assert.deepEqual(isSlashTrigger('  、表格'), { indent: '  ', query: '表格' });
});

test('isSlashTrigger: 普通文本不触发', () => {
  assert.equal(isSlashTrigger('hello'), null);
  assert.equal(isSlashTrigger('foo/bar'), null);
  assert.equal(isSlashTrigger('列表 - 项'), null);
  assert.equal(isSlashTrigger(''), null);
});

test('isSlashTrigger: 查询词含空白/分隔符不触发', () => {
  assert.equal(isSlashTrigger('/heading 1'), null);
  assert.equal(isSlashTrigger('/a/b'), null);
});

// ------------------------------------------------------------
// 命令过滤
// ------------------------------------------------------------
test('filterSlashCommands: 空查询返回全部', () => {
  const all = filterSlashCommands('');
  assert.ok(all.length >= 8);
});

test('filterSlashCommands: /hea 过滤出标题命令', () => {
  const result = filterSlashCommands('hea');
  const commands = result.map((c) => c.command);
  assert.ok(commands.includes('heading1'));
  assert.ok(commands.includes('heading2'));
  assert.ok(commands.includes('heading3'));
});

test('filterSlashCommands: 中文「引用」也能匹配 quote', () => {
  const result = filterSlashCommands('引用');
  assert.ok(result.some((c) => c.command === 'quote'));
});

test('filterSlashCommands: 无匹配返回空数组', () => {
  assert.deepEqual(filterSlashCommands('zzzzz'), []);
});

// ------------------------------------------------------------
// 命令表结构
// ------------------------------------------------------------
test('slashMenuCommands: 每个命令都有 run 函数', () => {
  assert.ok(slashMenuCommands.length >= 8 && slashMenuCommands.length <= 12);
  for (const command of slashMenuCommands) {
    assert.equal(typeof command.run, 'function', `${command.command} 缺 run`);
    assert.ok(typeof command.insert === 'string', `${command.command} 缺 insert`);
  }
});

test('slashMenuCommands: 覆盖核心 Markdown 块/行内命令', () => {
  const ids = slashMenuCommands.map((c) => c.command);
  for (const expected of [
    'heading1',
    'heading2',
    'heading3',
    'bold',
    'italic',
    'inline-code',
    'code-block',
    'bullet-list',
    'ordered-list',
    'quote',
    'table',
    'divider',
    'image',
    'link',
  ]) {
    assert.ok(ids.includes(expected), `命令表缺少 ${expected}`);
  }
});

// ------------------------------------------------------------
// 集成（CM6）相关：环境无 node_modules，标记为 todo
// ------------------------------------------------------------
test.todo('CM6: 键入 "/" 后 StateField 自启并使菜单 open');
test.todo('CM6: 代码块内键入 "/" 不触发菜单');
test.todo('CM6: ↑/↓ 移动 selectedIndex，Enter 执行并删除 /query');
