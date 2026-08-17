/**
 * selection-match.test.js — 需求 A 回归：computeSelectionMatches 不能死循环。
 *
 * 历史缺陷：原实现用 `if (start < sel.to && end > sel.from) continue;` 跳过与选区
 * 重叠的匹配，却没在推进 `idx` 前 continue，导致「选区文本本身就是第一个匹配」时
 * `while (idx !== -1)` 永远成立 → 主线程死循环 → 编辑器完全无响应（真机 E2E 抓到：
 * 设选区后连 `2+2` 都 CDP 超时）。本测试用 mock view 在 node 纯环境锁定该场景，
 * 并断言「不抛错 / 不挂死 / 装饰数正确」。
 *
 * 注：computeSelectionMatches 是同步函数。若缺陷被 reintroduced，本测试会同步死循环、
 * 进而拖垮整个 node --test 进程——这恰是想要的硬熔断（优于静默发版）。修复后瞬时返回。
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { computeSelectionMatches } from '../src/editor-extensions.js';

// 构造最小 mock view：仅需 state.sliceDoc / state.doc.sliceString / state.selection.main / visibleRanges。
function makeView(doc, selFrom, selTo, ranges = [{ from: 0, to: doc.length }]) {
  return {
    state: {
      doc: { sliceString: (f, t) => doc.slice(f, t) },
      sliceDoc: (f, t) => doc.slice(f, t),
      selection: { main: { empty: selFrom === selTo, from: selFrom, to: selTo } },
    },
    visibleRanges: ranges,
  };
}

function countMarks(decos, docLen) {
  let n = 0;
  // 该版本 RangeSet.iter() 返回生成器（HeapCursor 不暴露 done），改用 between 回调迭代，
  // 与 tests/md-highlight.test.js:41 既有约定一致；回调第三参 value 为 Decoration 实例，
  // 类名位于 value.spec.class。
  decos.between(0, docLen, (_f, _t, value) => {
    if (value && value.spec && value.spec.class === 'cm-selectionMatch') n += 1;
  });
  return n;
}

test('computeSelectionMatches: 选区与首个匹配重叠时不死循环（需求A 回归）', () => {
  const doc = 'alpha beta alpha gamma alpha delta echo';
  // 选中第一个 'alpha'（索引 0..5）：它是第一个匹配，必然与选区重叠。
  const view = makeView(doc, 0, 5);
  let decos;
  assert.doesNotThrow(() => { decos = computeSelectionMatches(view, 100); });
  // 共 3 处 'alpha'：1 处是选区本身（跳过），剩余 2 处应被装饰。
  assert.strictEqual(countMarks(decos, doc.length), 2, '重叠选区场景下应装饰 2 处（选区自身跳过）');
});

test('computeSelectionMatches: 选中串在多处出现时高亮其余相同串（排除自身）', () => {
  const doc = 'ab ab ab'; // 'ab' 出现 3 次，且长度(2) >= SELECTION_MATCH_MIN
  // 选中第二个 'ab'（索引 3..5）：它是匹配之一，与选区重叠被跳过；
  // 其余 2 处 'ab' 不与选区重叠 → 应被装饰（验证「高亮全部相同串」语义）。
  const view = makeView(doc, 3, 5);
  const decos = computeSelectionMatches(view, 100);
  assert.strictEqual(countMarks(decos, doc.length), 2, '选中的相同串在别处应高亮 2 处（自身跳过）');
});

test('computeSelectionMatches: 选中文本短于最小长度时返回空（不挂死）', () => {
  const doc = 'alpha beta alpha gamma alpha delta echo';
  const view = makeView(doc, 0, 1); // 单字符选区，低于 SELECTION_MATCH_MIN(2)
  const decos = computeSelectionMatches(view, 100);
  assert.strictEqual(countMarks(decos, doc.length), 0, '短于最小长度的选区不应产生高亮');
});

test('computeSelectionMatches: maxMatches 封顶生效', () => {
  const doc = Array.from({ length: 50 }, () => 'x').join(' '); // 50 个 'x'
  const view = makeView(doc, 0, 1); // 选单个 'x'? 不，选短于 min 会返回空。
  // 改为选一个在文档中多次出现且长度>=2 的串
  const doc2 = Array.from({ length: 50 }, () => 'yy').join(' '); // 50 个 'yy'
  const view2 = makeView(doc2, 0, 2);
  const decos = computeSelectionMatches(view2, 7);
  assert.strictEqual(countMarks(decos, doc2.length), 7, 'maxMatches 应把装饰数封顶为 7');
});
