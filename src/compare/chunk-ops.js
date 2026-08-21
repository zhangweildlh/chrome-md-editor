// chunk-ops.js — 差异块接受/拒绝/应用非冲突变更
//
// 操作 CodeMirror EditorView 的差异块（chunk）。把「可纯计算」的部分
// （列表过滤、非冲突筛选）与「依赖真实 view 的派发」分离，便于单测。
//
// 约定：
//   chunk = { id, conflict?: boolean, srcFrom, srcTo, dstFrom, dstTo, ... }
//   view  = CodeMirror EditorView（需有 .state.doc.sliceString / .dispatch）

// ── 纯函数层（不依赖真实 view，便于单测） ──────────────────────────────

// 从待处理列表移除指定 chunkId，返回新数组（不可变）。
export function filterReject(list, chunkId) {
  return (list || []).filter((c) => c.id !== chunkId);
}

// 筛选所有非冲突 chunk（conflict !== true）。
export function selectNonConflicting(chunks) {
  return (chunks || []).filter((c) => !c.conflict);
}

// 校验单个偏移对：from/to 必须为数字且 from <= to。
function assertRange(name, from, to) {
  if (typeof from !== 'number' || typeof to !== 'number') {
    throw new Error(`acceptChunk: ${name} 必须为数字（收到 ${from}, ${to}）`);
  }
  if (!Number.isFinite(from) || !Number.isFinite(to)) {
    throw new Error(`acceptChunk: ${name} 必须为有限数字`);
  }
  if (from > to) {
    throw new Error(`acceptChunk: ${name} 必须 from <= to（收到 ${from} > ${to}）`);
  }
}

// ── 依赖 view 的操作层 ──────────────────────────────────────────────────

// 把 srcView 中 [srcFrom, srcTo) 文本覆盖写入 dstView 的 [dstFrom, dstTo)。
// 通过 dstView.dispatch({ changes }) 派发变更。
export function acceptChunk({ srcView, dstView, srcFrom, srcTo, dstFrom, dstTo }) {
  if (!srcView || !dstView) {
    throw new Error('acceptChunk: 需要 srcView 与 dstView');
  }
  assertRange('src', srcFrom, srcTo);
  assertRange('dst', dstFrom, dstTo);
  const text = srcView.state.doc.sliceString(srcFrom, srcTo);
  dstView.dispatch({
    changes: { from: dstFrom, to: dstTo, insert: text },
  });
}

// 光标 / 选区粒度「局部采纳」：只把 chunk 中与源视图当前选择（或光标行）相交的部分
// 写入目标视图，而非整块。用于栏间内联采纳按钮（makeRevertGroup 创建的
// cm-compare-accept-left / cm-compare-accept-right / cm-compare-revert-single，需求⑧）。
//
// 与 acceptChunk 同样使用单次 dispatch 安全原语（沿用 assertRange 区间校验），
// 不引入任何新的派发路径。
//
// ── 坐标映射（关键）──
// chunk 给出源侧区间 [srcFrom, srcTo) 与目标侧区间 [dstFrom, dstTo)，二者在各自视图里
// 是【逐行对齐】的差异块（第 i 个源行 ↔ 第 i 个目标行）。因此：
//   1) 在源视图里求「选取区间」与「chunk 源行范围」相交的行集合；
//   2) 按行索引把这些行映射到目标视图的对应行；
//   3) 把源侧选中行（含行尾换行）整体替换为目标侧对应行。
// 选区为空时取光标所在行；选区与 chunk 无交集时回退到「chunk 内光标当前行」。
//
// ⚠️ 行不对称 chunk（源行数 ≠ 目标行数，如 3 行替换 1 行）：按行索引映射 + 目标端
// 钳制（dstFirstLine/dstLastLine 都 clamp 到 dst 块范围）后，「选中源某行」会把
// 【整个目标块区域】替换为【该选中源行（含行尾换行）】——即整块目标被单行替换、
// 源块其余行不写入。这是「逐行采纳」语义在不对称块上的既定取舍（测试仅锁定行对称
// 场景）；如需「整块原子替换」请直接使用 acceptChunk。
//
// @param {{srcView:object, dstView:object, srcFrom:number, srcTo:number, dstFrom:number, dstTo:number, selection:object}} args
//        selection：源视图的 selection 对象，需含 .main.{anchor,head}（CodeMirror 契约）
// @returns {boolean} 是否实际产生了写入（无任何相交行时为 false，不改动文档）
export function acceptChunkAtCursor({
  srcView,
  dstView,
  srcFrom,
  srcTo,
  dstFrom,
  dstTo,
  selection,
}) {
  if (!srcView || !dstView) {
    throw new Error('acceptChunkAtCursor: 需要 srcView 与 dstView');
  }
  if (!selection || !selection.main) {
    throw new Error('acceptChunkAtCursor: 需要 selection.main');
  }
  const srcDoc = srcView.state.doc;
  const dstDoc = dstView.state.doc;
  const { anchor, head } = selection.main;

  // 源侧无内容可采纳（纯插入块源侧为空区间）→ 无法按源行局部采纳
  if (srcFrom >= srcTo) return false;

  // 1) 选取区间（源视图字符坐标）
  const hasSel = anchor !== head;
  let selFrom, selTo;
  if (hasSel) {
    selFrom = Math.min(anchor, head);
    selTo = Math.max(anchor, head);
  } else {
    const line = srcDoc.lineAt(head);
    selFrom = line.from;
    selTo = line.to;
  }

  // 2) chunk 的源行范围
  const srcLineStart = srcDoc.lineAt(srcFrom).number;
  const srcLineEnd = srcDoc.lineAt(srcTo - 1).number;
  const dstLineStart = dstDoc.lineAt(dstFrom).number;

  // 3) 求与选取相交的源行（行 [from,to) 与选取 [selFrom,selTo) 相交）
  const selLines = [];
  for (let L = srcLineStart; L <= srcLineEnd; L++) {
    const ln = srcDoc.line(L);
    if (ln.from < selTo && ln.to > selFrom) selLines.push(L);
  }
  // 4) 交集为空 → 回退到「chunk 内光标当前行」
  if (!selLines.length) {
    const cur = srcDoc.lineAt(head).number;
    if (cur >= srcLineStart && cur <= srcLineEnd) selLines.push(cur);
  }
  if (!selLines.length) return false; // 选取与 chunk 无交集、且光标不在 chunk 内 → 不改动

  const firstL = selLines[0];
  const lastL = selLines[selLines.length - 1];

  // 5) 源侧字符区间：选中行 + 其行尾换行（到下一行行首，或文档末尾）
  const pSrcFrom = srcDoc.line(firstL).from;
  const pSrcTo = lastL < srcDoc.lines ? srcDoc.line(lastL + 1).from : srcDoc.length;
  const insertText = srcDoc.sliceString(pSrcFrom, pSrcTo);

  // 6) 目标侧字符区间：按行索引映射（chunk 内 src 第 i 行 ↔ dst 第 i 行），并钳到 dst 块范围
  const dstLineEnd = dstDoc.lineAt(Math.max(dstFrom, dstTo - 1)).number;
  const dstFirstLine = Math.min(dstLineStart + (firstL - srcLineStart), dstLineEnd);
  const dstLastLine = Math.min(dstLineStart + (lastL - srcLineStart), dstLineEnd);
  const pDstFrom = dstDoc.line(dstFirstLine).from;
  const pDstTo =
    dstLastLine < dstDoc.lines ? dstDoc.line(dstLastLine + 1).from : dstDoc.length;

  // 7) 单次 dispatch 局部采纳（沿用 acceptChunk 的区间校验）
  assertRange('src', pSrcFrom, pSrcTo);
  assertRange('dst', pDstFrom, pDstTo);
  dstView.dispatch({ changes: { from: pDstFrom, to: pDstTo, insert: insertText } });
  return true;
}

// 从待处理列表移除指定块（标记已处理，不改文档内容），返回新列表。
// 保持不可变：返回过滤后的新数组，原列表不被修改。
export function rejectChunk(list, chunkId) {
  return filterReject(list, chunkId);
}

// 对所有非冲突 chunk 批量 acceptChunk。
// 注意：此功能默认关闭，仅显式调用时执行（不在模块里自动触发）。
//
// 关键正确性：CodeMirror 每次 dispatch 后文档与偏移立即改变，若逐个 dispatch
// 则后续块的 dstFrom/dstTo 仍基于「原始文档」旧偏移，从第 2 个块起就会写到
// 错误位置（位置漂移，块越多越严重，造成文档结构性损坏）。标准做法是把全部
// 变更收集成 changes 数组，合并为「单次 dispatch」——CM6 会按 dispatch 前的
// 同一文档状态解释数组内每个 spec，并自动处理排序与位置映射，不漂移。
//
// 另：insert 文本必须在 dispatch 前从 srcView 一次性取完（map 阶段），因为若
// srcView 与 dstView 是同一个 view，dispatch 后再取就晚了。
//
// 返回实际被应用的 chunk 数量。
export function applyNonConflicting({ chunks, srcView, dstView }) {
  if (!srcView || !dstView) {
    throw new Error('applyNonConflicting: 需要 srcView 与 dstView');
  }
  const nonConf = selectNonConflicting(chunks);
  if (!nonConf.length) return 0;

  // 按 dstFrom 升序排序，确保 changes 顺序符合 CM6 要求。
  const sorted = [...nonConf].sort((a, b) => a.dstFrom - b.dstFrom);

  // 防御：同一 dispatch 内的多个 changes 不可重叠。若相邻块区间重叠
  // （前一个 dstTo > 后一个 dstFrom），直接抛错，避免静默产出损坏文档。
  for (let i = 1; i < sorted.length; i++) {
    if (sorted[i - 1].dstTo > sorted[i].dstFrom) {
      throw new Error(
        `applyNonConflicting: 检测到重叠的块区间（块 ${sorted[i - 1].id} 与 ${sorted[i].id}），dst 区间不可重叠`
      );
    }
  }

  // map 阶段一次性取完所有 insert 文本（基于原始文档）。
  //
  // 越界钳制：@codemirror/merge 的类型声明明确写明 chunk 的 `to` 可能指向文档末尾之后
  // （尾部块的 toA 常等于「文档长度 + 1」，用于表达“连同行尾换行一起替换”）。未经钳制
  // 直接喂给 dispatch 会抛 RangeError，导致「应用非冲突变更」在最后一个差异块位于文末时
  // 整体失败。compare-merge.js 与 compare.js 的 bulkTo 都已做同样钳制，此处必须对齐。
  // 契约保真：本函数对 dstView 的原始契约只要求 `dispatch`（既有单测的 mock 即只提供
  // dispatch）。这里读 state 仅为取长度做钳制，属可选增强，因此必须降级容错——长度
  // 不可用时退化为 Infinity，Math.min 原样放行，行为与钳制前完全一致，不破坏调用方契约。
  //
  // ⚠ 必须校验到 `length` 是不是数字，只判断 `state` 存在是不够的：若 doc 上没有 length，
  // 取到 undefined 会让 Math.min 返回 NaN，进而 sliceString(NaN, NaN) 得到空串，静默把
  // insert 文本清空。这是修钳制时真实踩过的坑，由单测护栏拦下。
  const docLen = (view) => {
    const n = view && view.state && view.state.doc && view.state.doc.length;
    return typeof n === "number" ? n : Infinity;
  };
  const dstLen = docLen(dstView);
  const srcLen = docLen(srcView);
  const changes = sorted.map((c) => ({
    from: Math.min(c.dstFrom, dstLen),
    to: Math.min(c.dstTo, dstLen),
    insert: srcView.state.doc.sliceString(
      Math.min(c.srcFrom, srcLen),
      Math.min(c.srcTo, srcLen)
    ),
  }));

  dstView.dispatch({ changes });
  return nonConf.length;
}
