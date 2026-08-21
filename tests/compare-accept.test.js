/**
 * compare-accept.test.js — 需求⑧ 光标/选区粒度「局部采纳」回归测试
 *
 * 背景：栏间内联采纳按钮（makeRevertGroup 创建，类名 cm-compare-accept-left /
 * cm-compare-accept-right / cm-compare-revert-single）原本通过 acceptChunk 整块覆写，
 * 需求⑧ 改为只采纳 chunk 中与「光标当前行 / 鼠标选区」相交的部分。
 *
 * 本文件直接对核心原语 acceptChunkAtCursor（src/compare/chunk-ops.js）做单测：
 *   · 选取只覆盖 chunk 中部分行 → 仅这些行被采纳，区间外的行【原样不动】；
 *   · 无选区（光标落在某行）→ 只采纳该行；
 *   · 选区 / 光标都不在 chunk 内 → 不产生任何写入（返回 false）。
 *
 * 变异式护栏：若有人把 acceptChunkAtCursor 退化回「整块 acceptChunk」，下列断言会精确变红
 * （区间外的行被意外改写），从而抓住「内联按钮又退回整块采纳」类回归。
 *
 * 另含需求⑨ 的护栏：applyNonConflicting 必须【跳过冲突块、只应用非冲突块】。
 *
 * 运行：node --test tests/compare-accept.test.js
 */

import test from "node:test";
import assert from "node:assert/strict";
import {
  acceptChunkAtCursor,
  applyNonConflicting,
  selectNonConflicting,
} from "../src/compare/chunk-ops.js";

// ── 极简 fake Text（仅实现 acceptChunkAtCursor 所需的 line / lineAt / sliceString
//    / length / lines / toString / replace） ──
function makeDoc(text) {
  const lines = text.split("\n");
  const lineStarts = [];
  let pos = 0;
  for (const ln of lines) {
    lineStarts.push(pos);
    pos += ln.length + 1; // +1 行尾换行
  }
  let content = text;
  const doc = {
    get length() {
      return content.length;
    },
    get lines() {
      return lines.length;
    },
    sliceString(from, to) {
      return content.slice(from, to);
    },
    toString() {
      return content;
    },
    replace(from, to, insert) {
      content = content.slice(0, from) + insert + content.slice(to);
    },
    line(n) {
      if (n < 1 || n > lines.length) throw new Error("line out of range: " + n);
      const from = lineStarts[n - 1];
      const to = from + lines[n - 1].length;
      return { number: n, from, to };
    },
    lineAt(p) {
      let posN = p;
      if (posN < 0) posN = 0;
      if (posN > content.length) posN = content.length;
      for (let i = 0; i < lines.length; i++) {
        const from = lineStarts[i];
        const to = from + lines[i].length;
        if (posN >= from && posN <= to) return { number: i + 1, from, to };
      }
      return {
        number: lines.length,
        from: lineStarts[lines.length - 1],
        to: lineStarts[lines.length - 1] + lines[lines.length - 1].length,
      };
    },
  };
  return doc;
}

// 构造一对 fake view：srcView 提供内容，dstView 记录并应用 dispatch。
function makeViews(srcText, dstText, selection) {
  const srcDoc = makeDoc(srcText);
  const dstDoc = makeDoc(dstText);
  const dispatchCalls = [];
  const srcView = {
    state: { doc: srcDoc, selection: selection || { main: { anchor: 0, head: 0 } } },
  };
  const dstView = {
    state: { doc: dstDoc },
    dispatch(spec) {
      dispatchCalls.push(spec);
      const c = spec.changes;
      dstDoc.replace(c.from, c.to, c.insert);
    },
  };
  return { srcView, dstView, dstDoc, dispatchCalls };
}

// 一个对称的多行文档对：src 5 行 A，dst 5 行 B。中间 3 行（2..4）构成差异块。
const SRC = "A1\nA2\nA3\nA4\nA5";
const DST = "B1\nB2\nB3\nB4\nB5";
// chunk 覆盖 src 第 2..4 行：srcFrom = line(2).from, srcTo = line(5).from（下一行行首，半开）
// 对 dst 同理。两者逐行对齐：src 第 i 行 ↔ dst 第 i 行。
const sDoc = makeDoc(SRC);
const dDoc = makeDoc(DST);
const CHUNK = {
  srcFrom: sDoc.line(2).from,
  srcTo: sDoc.line(5).from,
  dstFrom: dDoc.line(2).from,
  dstTo: dDoc.line(5).from,
};

// 便捷：构造一段选中 src 第 [a..b] 行（含行尾换行）的 selection
function selLines(a, b) {
  return {
    main: { anchor: sDoc.line(a).from, head: sDoc.line(b + 1).from },
  };
}
// 光标落在 src 第 n 行（折叠选区）
function cursorLine(n) {
  return { main: { anchor: sDoc.line(n).from, head: sDoc.line(n).from } };
}

// ============== 需求⑧ 核心：选取只覆盖 chunk 中部分行 ==============

test("⑧ 局部采纳：只采纳选中行，区间外行原样不动（变异式护栏）", () => {
  // 选中 src 第 3 行（区间 [line(3).from, line(4).from)）
  const { srcView, dstView, dstDoc, dispatchCalls } = makeViews(
    SRC,
    DST,
    selLines(3, 3)
  );
  const ok = acceptChunkAtCursor({
    srcView,
    dstView,
    srcFrom: CHUNK.srcFrom,
    srcTo: CHUNK.srcTo,
    dstFrom: CHUNK.dstFrom,
    dstTo: CHUNK.dstTo,
    selection: srcView.state.selection,
  });
  assert.equal(ok, true);
  assert.equal(dispatchCalls.length, 1);
  // 只有第 3 行被采纳：B3 → A3
  assert.equal(dstDoc.toString(), "B1\nB2\nA3\nB4\nB5");
  // 关键不变量：区间外的行（第 2 行 B2、第 4 行 B4）不得被改动
  const out = dstDoc.toString().split("\n");
  assert.equal(out[1], "B2", "区间外第 2 行不应被改动");
  assert.equal(out[3], "B4", "区间外第 4 行不应被改动");
  assert.equal(out[0], "B1");
  assert.equal(out[4], "B5");
});

test("⑧ 变异校验：若退回整块采纳，区间外行会被改写 → 上述断言变红", () => {
  // 用整块 acceptChunk 模拟「旧行为」，证明旧行为下 out[1]/out[3] 会被改变，
  // 从而说明本测试能抓住「又退回整块」的回归。
  const { srcView, dstView, dstDoc } = makeViews(SRC, DST, selLines(3, 3));
  // 整块采纳：src 第 2..4 行 → dst 第 2..4 行
  const text = srcView.state.doc.sliceString(CHUNK.srcFrom, CHUNK.srcTo);
  dstView.dispatch({ changes: { from: CHUNK.dstFrom, to: CHUNK.dstTo, insert: text } });
  const whole = dstDoc.toString().split("\n");
  assert.notEqual(whole[1], "B2", "整块行为会改写第 2 行（与局部采纳结果相反，证明护栏有效）");
  assert.notEqual(whole[3], "B4", "整块行为会改写第 4 行");
});

test("⑧ 局部采纳：选中跨 2 行 → 只采纳这 2 行，其余不动", () => {
  const { srcView, dstView, dstDoc } = makeViews(SRC, DST, selLines(2, 3));
  const ok = acceptChunkAtCursor({
    srcView,
    dstView,
    srcFrom: CHUNK.srcFrom,
    srcTo: CHUNK.srcTo,
    dstFrom: CHUNK.dstFrom,
    dstTo: CHUNK.dstTo,
    selection: srcView.state.selection,
  });
  assert.equal(ok, true);
  assert.equal(dstDoc.toString(), "B1\nA2\nA3\nB4\nB5");
  assert.equal(dstDoc.toString().split("\n")[3], "B4", "第 4 行（区间外）应不动");
});

test("⑧ 无选区（光标落在某行）→ 只采纳该行", () => {
  const { srcView, dstView, dstDoc } = makeViews(SRC, DST, cursorLine(3));
  const ok = acceptChunkAtCursor({
    srcView,
    dstView,
    srcFrom: CHUNK.srcFrom,
    srcTo: CHUNK.srcTo,
    dstFrom: CHUNK.dstFrom,
    dstTo: CHUNK.dstTo,
    selection: srcView.state.selection,
  });
  assert.equal(ok, true);
  assert.equal(dstDoc.toString(), "B1\nB2\nA3\nB4\nB5");
  assert.equal(dstDoc.toString().split("\n")[1], "B2", "区间外第 2 行不动");
});

test("⑧ 选区与 chunk 无交集、光标也不在 chunk 内 → 不产生写入（返回 false）", () => {
  // 光标落在第 1 行（chunk 之外），折叠选区
  const { srcView, dstView, dstDoc, dispatchCalls } = makeViews(
    SRC,
    DST,
    cursorLine(1)
  );
  const ok = acceptChunkAtCursor({
    srcView,
    dstView,
    srcFrom: CHUNK.srcFrom,
    srcTo: CHUNK.srcTo,
    dstFrom: CHUNK.dstFrom,
    dstTo: CHUNK.dstTo,
    selection: srcView.state.selection,
  });
  assert.equal(ok, false);
  assert.equal(dispatchCalls.length, 0, "不应产生任何 dispatch");
  assert.equal(dstDoc.toString(), DST, "dst 文档应完全不变");
});

test("⑧ 源侧为空区间（纯插入块）→ 无法按源行局部采纳，返回 false 不改动", () => {
  // src 区间为空（srcFrom === srcTo），dst 有内容：纯删除型块，无源行可局部采纳
  const { srcView, dstView, dstDoc, dispatchCalls } = makeViews(SRC, DST, selLines(3, 3));
  const ok = acceptChunkAtCursor({
    srcView,
    dstView,
    srcFrom: CHUNK.srcFrom,
    srcTo: CHUNK.srcFrom, // 空区间
    dstFrom: CHUNK.dstFrom,
    dstTo: CHUNK.dstTo,
    selection: srcView.state.selection,
  });
  assert.equal(ok, false);
  assert.equal(dispatchCalls.length, 0);
  assert.equal(dstDoc.toString(), DST);
});

test("⑧ 非法参数：缺少 view / selection 时抛错（沿用 acceptChunk 的安全契约）", () => {
  assert.throws(
    () =>
      acceptChunkAtCursor({
        srcView: null,
        dstView: null,
        srcFrom: 0,
        srcTo: 1,
        dstFrom: 0,
        dstTo: 1,
        selection: { main: { anchor: 0, head: 0 } },
      }),
    /需要 srcView 与 dstView/
  );
  assert.throws(
    () =>
      acceptChunkAtCursor({
        srcView: { state: { doc: makeDoc(SRC) } },
        dstView: { state: { doc: makeDoc(DST) } },
        srcFrom: 0,
        srcTo: 1,
        dstFrom: 0,
        dstTo: 1,
        selection: null,
      }),
    /需要 selection\.main/
  );
});

// ============== 需求⑨：applyNonConflicting 必须跳过冲突块、只应用非冲突块 ==============

test("⑨ applyNonConflicting 跳过冲突块：仅应用非冲突块", () => {
  const srcText = "ABCDEFGHIJ"; // 10 字符
  const srcView = {
    state: { doc: { sliceString: (f, t) => srcText.slice(f, t) } },
  };
  const dispatchCalls = [];
  const dstView = {
    dispatch(spec) {
      dispatchCalls.push(spec);
    },
  };
  const chunks = [
    { id: 0, conflict: true, srcFrom: 0, srcTo: 2, dstFrom: 0, dstTo: 1 }, // 冲突 → 应被排除
    { id: 1, srcFrom: 0, srcTo: 3, dstFrom: 0, dstTo: 1 }, // ABC -> [0,1)
    { id: 2, srcFrom: 3, srcTo: 6, dstFrom: 2, dstTo: 4 }, // DEF -> [2,4)
  ];
  const n = applyNonConflicting({ chunks, srcView, dstView });
  assert.equal(n, 2, "应只应用 2 个非冲突块");
  assert.equal(dispatchCalls.length, 1, "应合并为单次 dispatch");
  const changes = dispatchCalls[0].changes;
  assert.equal(changes.length, 2, "changes 不应包含冲突块");
  assert.deepEqual(changes, [
    { from: 0, to: 1, insert: "ABC" },
    { from: 2, to: 4, insert: "DEF" },
  ]);
  // 关键：冲突块的文本（AB）绝不出现
  assert.ok(
    !changes.some((c) => c.insert === "AB"),
    "冲突块内容（AB）不得被应用"
  );
});

test("⑨ selectNonConflicting 纯函数：过滤掉 conflict===true", () => {
  const chunks = [
    { id: 1, conflict: true },
    { id: 2, conflict: false },
    { id: 3 }, // 默认非冲突
    { id: 4, conflict: true },
  ];
  const out = selectNonConflicting(chunks);
  assert.deepEqual(out.map((c) => c.id), [2, 3]);
});
