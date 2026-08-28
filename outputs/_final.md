# 代码合并审计报告 (code-review-combo)

> 模式: `dual-cross-validation`　|　生成器: `scripts/merge_reports`（确定性，未调用 LLM）

## 总览 (Overview)

- **总 findings**: 0
- **文件数**: 0
- **跨源验证**: confirmed=0 / disputed=0
- **单源覆盖**: ocr-only=0 / review-spd-only=0
- **丢弃的 style 噪音**: 0 条（视为噪音，未计入 findings）
- **severity 分布**: critical=0 / high=0 / medium=0 / low=0
- **category 分布**: 无

## 数据源计数 (by source)

| source | findings |
| --- | --- |

## Top 风险 (Critical / High)

_无 critical / high 风险。_

## 按文件分组 (Findings by File)

_无 findings。_

## 修复建议汇总 (Suggestions)

_无修复建议。_

## 备注 (Notes)

- category 8↔5 映射：ocr/delegate 的 `maintainability`/`documentation` 统一归入 `other`；`style` 视为噪音已丢弃（共 0 条）。
- 跨源 `both` 判定在映射后口径一致：同一 (path,start_line,end_line,category) 被两源报告即交叉验证。
- disputed 项已取两源中更高 severity。
