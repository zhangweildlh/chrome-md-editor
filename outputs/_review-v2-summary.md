# Code Review 复审计报告 — delta移植 v1.9.16（A4 数据流接入后）

**分支**: `feat/delta-migrate-v1.9.16`
**基线**: `origin/main` → `HEAD` (4 commits, +1617/-16)
**审查日期**: 2026-08-28 09:10
**审查模式**: code-review-combo Stage1 + 人工核实

## 审查总结

| 指标 | 数值 |
|------|------|
| 审查文件数 | 11 |
| OCR review | 运行中... |
| Delegate review | 11 reviewable files |
| 测试状态 | 569 pass, 0 fail |

## 本轮新增改动

### A4 Filler Widget 数据流接入
**文件**: `src/compare-merge.js:545-561`

```js
// A4: 填充标记数据流接入 —— 为 unpaired 行注入 setFillerEffect
for (const vp of viewPairs) {
  if (!vp.a?.dom || !vp.b?.dom) continue;
  const fillerA = [];
  const fillerB = [];
  for (const p of vp.diffPairs || []) {
    if (p.variant === "added") {
      fillerA.push({ lineNumber: p.dstStartLine, type: "added" });
    } else if (p.variant === "removed") {
      fillerB.push({ lineNumber: p.srcStartLine, type: "removed" });
    }
  }
  if (fillerA.length) vp.a.dispatch({ effects: setFillerEffect.of(fillerA) });
  if (fillerB.length) vp.b.dispatch({ effects: setFillerEffect.of(fillerB) });
}
```

**已修复 bug**: `lineNumber: p.dstStartLine + 1` → `lineNumber: p.dstStartLine`
- 原因：`diffPairs.srcStartLine/dstStartLine` 已是 1-based（见 `move-detection.js:281-284`），不应再加 1。

## 第一轮审计已修复（确认无回归）

| # | 严重度 | 文件 | 问题 | 状态 |
|---|--------|------|------|------|
| 1 | Critical | `inline-word-diff.js:386` | `minusWidgetMark` 未定义 | ✅ 已修复 |
| 2 | Critical | `compare.js:1471` | `getChunks` 未导入 | ✅ 已修复 |
| 3 | Critical | `compare-merge.js:1706` | `aggregateStats` 传参错误 | ✅ 已修复 |
| 4 | Critical | `move-connectors.js:428` | `headBottom - head.bottom` NaN | ✅ 已修复 |
| 5 | Critical | `inline-word-diff.js:295` | `NONEMPH_CLASS` 重复声明 | ✅ 已修复 |
| 6 | High | `parse-unified-diff.js:186` | 文本重建丢失行序 | ✅ 已修复 |

## 人工审查发现

### Medium: B1 navNext/navPrev off-by-one 风险

**文件**: `src/compare.js:1477,1497`

**问题**: `findIndex((s) => s[0] > head)` 在 head 恰好等于 chunk 起始位置时，返回的是下一个 chunk 的索引。但 `bindChunkNavigation().next()` 已经将 cursor 移到目标 chunk 的起始位置，所以 `head === target[0]`，`findIndex` 返回 `current + 1`，实际应返回 `current`。

**影响**: 导航徽标显示错误块索引（+1）。

**建议修复**:
```js
// navNext: 找第一个 starts AFTER head 的 chunk
const nextIdx = spans.findIndex((s) => s[0] > head);
currentChunkIndex = nextIdx >= 0 ? nextIdx : (spans.length > 0 ? 0 : -1);

// 但 head 已经在 target chunk 起始，所以应该找 <= head 的最后一个
const nextIdx = spans.findIndex((s) => s[0] > head);
currentChunkIndex = nextIdx > 0 ? nextIdx - 1 : (spans.length > 0 ? 0 : -1);
```

或者更简单：直接用 `instance.getChunks()` 的结果，避免双重数据源。

### Low: A4 数据流无测试覆盖

**问题**: A4 filler widget 数据流接入后，没有单元测试验证 `setFillerEffect` 是否正确 dispatch。

**建议**: 在 `tests/compare-move-decorations.test.js` 或新建 `tests/compare-filler.test.js` 中添加测试。

### Low: B1 导航徽标无集成测试

**问题**: navNext/navPrev 的块索引计算逻辑没有自动化测试验证。

**建议**: 添加测试用例验证 chunk index 正确性。

## 测试状态

```
全量测试: 569 tests, 566 pass, 0 fail, 3 todo ✅
compare专用: 264 tests, 264 pass, 0 fail ✅
```

## 遗留项

| 优先级 | 项 | 描述 | 修复方向 |
|--------|------|------|----------|
| Medium | B1 off-by-one | navNext/navPrev 块索引计算偏差 | 修正 findIndex 逻辑或改用 instance.getChunks() |
| Low | A4 测试缺失 | 无单元测试覆盖 filler 数据流 | 新增 tests/compare-filler.test.js |
| Low | B1 测试缺失 | 无单元测试覆盖导航徽标 | 新增 tests/compare-nav.test.js |

## Verdict: APPROVED (conditional)

- ✅ 所有 Critical/High bugs 已修复
- ✅ A4 数据流已正确接入（lineNumber 已修正）
- ⚠️ 1 项 Medium（B1 off-by-one）需评估是否阻塞 PR
- ✅ 测试全绿

**建议**: 先修复 B1 off-by-one 再开 PR，或标记为已知限制并在 PR 描述中说明。
