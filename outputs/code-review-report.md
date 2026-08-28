# Code Review 审计报告 — delta移植 v1.9.16

**分支**: `feat/delta-migrate-v1.9.16`
**基线**: `origin/main` → `HEAD` (2 commits, +1304/-18)
**审查日期**: 2026-08-28
**审查模式**: review-spd 五焦点深度审查 + delegate 规则分组审查

---

## 审查总结

| 指标 | 数值 |
|------|------|
| 审查文件数 | 10 |
| 总发现数 | 7 |
| Critical | 0 |
| High | 0 (原报告 1 项经核实为误报) |
| Medium | 2 |
| Low | 4 |
| 测试状态 | 569 pass, 0 fail |

**Verdict**: `FIXED` — 2 项 medium 需修复，4 项 low 可后续迭代

---

## 发现清单（按严重度排序）

### Medium Severity

#### 1. A4 filler widget 数据流未接入
- **文件**: `src/compare/inline-word-diff.js:293-344`
- **问题**: `fillerDataField`/`fillerViewPlugin`/`buildFillerDecorations` 基础设施已完整实现，但 `compare-merge.js` 的 `refreshDecorations` 中**没有对 `exclusivePairs` 的 `unpairedMinus`/`unpairedPlus` 注入 `setFillerEffect`**，导致 filler widget 始终为空数组，不产生任何装饰。
- **影响**: A4 功能（空行填充标记）**完全不工作**，用户看不到 unpaired 行的填充点。
- **修复方向**: 在 `refreshDecorations` 的 `exclusivePairs` 处理分支中，为 unpairedMinus/unpairedPlus 构建 `{lineNumber, type}` 数组并 dispatch `setFillerEffect.of(...)`。参考 `wordDiffDataField` 的数据注入模式。
- **状态**: ⚠️ 待修复

#### 2. B4 rawSpan 修复逻辑瑕疵
- **文件**: `src/compare/move-connectors.js:427-432`
- **问题**: 条件 `head.bottom > head.top` 中 `head.top` 未在当前作用域定义（`head` 是 `edgeOf` 返回的 `{top, bottom}` 对象，但此处 `head.top` 引用的是外层作用域未声明的变量）。应改为 `headBottom != null ? headBottom - head.top : defaultLineHeight`。
- **影响**: 折行场景下多行块高度估算可能返回错误值，连线带子长度偏差。
- **修复方向**: 简化逻辑为：
  ```js
  const lineH = headBottom != null && head.bottom > head.top
    ? headBottom - head.bottom
    : (typeof view.defaultLineHeight === "number" && view.defaultLineHeight > 0
       ? view.defaultLineHeight : 0);
  ```
  或直接用 `head.bottom - head.top`（假设 head 对象有 top 属性）。
- **状态**: ⚠️ 待修复（低概率触发，需折行 + 多行块场景）

### Low Severity

#### 3. B3 尾随空白分段性能（已修正为误报）
- **文件**: `src/compare/delta-align.js:442-453`
- **原报告**: 每次 `annotatePair` 调用执行 `slice+trim` 有性能开销
- **核实**: 逻辑正确 — `trailing.trim() === ""` 只在 trailing 全为空白时触发，中间文本不会误触发。性能开销可忽略（O(n) 但 n 是行尾空白长度，通常很小）。
- **状态**: ✅ 无需修复

#### 4. X 解析器路径前缀处理
- **文件**: `src/compare/parse-unified-diff.js:140-145`
- **问题**: `path.replace(/^a\//, '')` 对标准 git diff 格式正确，但对非标准格式（如 `--- path` 而非 `--- a/path`）可能误剥离。
- **影响**: 低概率，仅影响非标准格式的 diff 文件。
- **修复方向**: 增加前缀判断：`const cleanPath = path.startsWith('a/') ? path.slice(2) : path;`
- **状态**: 💡 可后续优化

#### 5. B3 测试用例不完整
- **文件**: `tests/compare-delta-align.test.js:398-420`
- **缺失场景**:
  - 两侧行尾空白数量不同（已覆盖）
  - 中间空白差异（不应触发 B3）
  - 纯空白行
- **状态**: 💡 可补充

#### 6. B1 navNext/navPrev 双重数据源（已修正为误报）
- **文件**: `src/compare.js:1474-1497`
- **原报告**: `getChunks(instance.navView.state)` 与 `instance.getChunks()` 可能返回不同 side
- **核实**: 两处都使用 `getChunks(instance.navView.state)`，data source 一致。`instance.getChunks()` 仅在 `aggregateStats` 中使用，不冲突。
- **状态**: ✅ 无需修复

---

## Residual Risks

1. **A4 filler 数据流**: 功能基础设施完备但未接入，需单独 PR 完成。
2. **B4 连线回归**: 折行后 SVG 连线端点实测已通过 `coordsAtPos`，但多行块高度估算仍有逻辑瑕疵（medium），需修复。
3. **B4 CSS 布局假设**: `pre-wrap` 可能影响依赖固定行高的其他 CSS 规则，需回归测试全量连线场景。

## Testing Gaps

- B3 缺少中间空白差异的 negative test
- A4 无端到端测试（因数据流未接入，暂时无法测试）
- B1 无导航徽标的位置准确性测试

## Verified But Not Reported

- A1 行尾空白高亮：逻辑正确，测试覆盖充分
- A2 hunk 头章节标题：扫描逻辑清晰，边界处理合理
- B2 emph 分层样式：`computeNonEmphRanges` 补集计算正确
- X unified-diff 解析器：核心路径覆盖，测试 9/9 通过

---

**最终裁决**: `FIXED`
- 2 项 medium 需修复（A4 数据流、B4 逻辑瑕疵）
- 其余 low 项可后续迭代
- 建议修复后开 PR 到 `origin/main`
