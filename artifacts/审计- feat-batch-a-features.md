# 代码审计报告 · `feat/batch-a-features` 全量审计

> 由 **code-review-combo**（open-code-review-delegate 委托模式 + review-spd 五焦点）交叉验证后，由宿主结合真实代码逐条核实、去重合并产出的**唯一审计报告**。

## 元信息

| 项 | 值 |
| --- | --- |
| 仓库 | `D:\Documents\AI_Work_Temp\Chrome-Markdown-Edit`（chrome-md-editor v1.4.8） |
| 目标分支 | `feat/batch-a-features` |
| 基准 | `main`（合并基 `5f06e90`） |
| 审查模式 | range（分支 vs main） |
| 变更规模 | 21 文件，+2280 / −37 |
| 提交数 | 14（含 S 级查找/替换/符号配对、M1 DOMPurify XSS 修复、A-3/6/7/8/9/10/12 七功能与探针系统） |
| 日期 | 2026-08-01 |
| 测试现状 | 分支新增 `tests/bracket-utils.test.js` + `tests/init-regression.test.js` 共 18 项全绿 |

## 审查范围（21 文件）

新增：`src/base64-fold.js` `src/bracket-utils.js` `src/callout.js` `src/codeblock-complete.js` `src/focus-mode.js` `src/mermaid-zoom.js` `src/outline.js` `src/probe.js` `src/tasklist-panel.js`
修改：`src/editor.js`(+530) `src/editor.css`(+295) `src/editor.html`(+79) `src/html-to-markdown.js`(+115) `desktop/src/lib.rs`(+19) `package.json`(+9) `package-lock.json`(+11) `.github/workflows/ci.yml`(+4) `CHANGELOG.md`(+71) `DEVLOG.md`(+20) `tests/bracket-utils.test.js` `tests/init-regression.test.js`

> 说明：本分支在 A 级功能之前，还沉淀了 S 级（查找/替换面板、中文符号配对高亮、选中相同字符串高亮）与 M 级（M1 DOMPurify 净化预览防 DOM-XSS、M2 初始化崩溃守卫）。审计覆盖上述全部新增/修改代码。

## 方法

1. **阶段一（报告 A）**：`ocr delegate preview --from main --to feat/batch-a-features` 确定范围（17 个可审查文件，CHANGELOG/DEVLOG 因 `unsupported_ext` 排除、两测试文件因 `default_path` 排除）；`ocr delegate rule` 解析出 XSS/innerHTML/正确性/安全性/性能/可维护性/测试覆盖规则组；宿主逐文件审查。
2. **阶段二（报告 B）**：`review-context.py --branch feat/batch-a-features --base main` 收集 git 上下文；按五焦点（正确性 / 回归兼容 / 测试 / 安全 / 性能并发）独立挖掘盲区，并交叉验证报告 A 各项。
3. **阶段三（唯一报告）**：对每条发现回到真实代码核实，去重合并，按严重度定级。

## 发现（按严重度）

### 🔴 High（发布前必须处理）

**H1 · 临时探针系统处于生产热路径，发布前必须整体回收**
- 路径：`src/editor.js`（updateListener 内 S1/S2/S3/S4 探针块，约 430–519 行）、`src/probe.js`、`src/html-to-markdown.js`（P1-F/P1-G/P3-A/P3-B）、`src/editor.html`（第 696–713 行「导出探针日志」橙色固定按钮）。
- 问题：探针并非纯后台埋点。其一，`updateListener` 中的 **S4-A（选中非空文本 → 对整篇文档做 `doc.toString()` + `indexOf` 循环）在每次选区变化都执行**；S1-B 在查找激活态对整篇文档 `toString()` + 正则统计。其二，编辑器右上/右下存在醒目的调试按钮与高频 `console.log`。若按本分支现状构建发布，将带来**明确的运行期性能回归（大文档每次光标移动 O(n) 扫描）与调试 UI 泄漏**。
- 建议：严格按 `src/probe.js` 头部记载的「三步回收法」整体移除——① 删除 `src/probe.js`；② 删除全部 `// ===== PROBE START/END =====` 包裹块（含 updateListener 内的 S1–S4 探针与 `try/catch` 包裹层，注意保留 `doUpdatePreview`/`updatePreview` 等核心逻辑本身）；③ 移除各模块 `import { probe } from './probe.js'` 及 `editor.html` 的「导出探针日志」按钮与内联脚本；④ `setProbeEnabled(false)` 紧急开关仅作兜底。回收后执行 `vite build` 并 `grep -rn "probe(" src` 确认无残留。
- 交叉：`review-spd-only`，已核实。

### 🟠 Medium

**M1 · base64 折叠「点击展开」在编辑器已聚焦时可能不生效**
- 路径：`src/base64-fold.js` 第 25–34 行（点击 handler）+ 第 57–61 行（`update(u)` 重建条件）。
- 问题：点击 handler 先 `unfoldedMap.set(...)` 再 `view.dispatch({})`。`update(u)` 仅在 `docChanged||viewportChanged||selectionSet||focusChanged` 时重建；而空 `dispatch({})` 在**编辑器已聚焦**（最常见场景）时不触发任何上述标志 → 装饰不重建 → 展开点击无效。仅当点击使编辑器**首次**获得焦点（focusChanged=true）时才偶然生效，行为不稳定。
- 建议：用 `StateEffect` + `StateField` 跟踪已展开行集合，点击派发 effect 强制重建；或至少在 click handler 中 `view.dispatch({ selection: ... })` 制造确定性的可重建事务。最稳妥是让折叠状态进入文档相关的状态字段，而非依赖 WeakMap + 空 dispatch。
- 交叉：`ocr-only`，已核实。

**M2 · base64 已展开状态按「绝对行号」记录，编辑后错位**
- 路径：`src/base64-fold.js` 第 14 行（`unfoldedMap`）、第 44–49 行（`i` 为 1-based 绝对行号）、第 27–29 行（点击记住 `this.lineNumber`）。
- 问题：在折叠行**上方**插入/删除行后，行号整体偏移，旧的「已展开」记录指向错误行——展开状态丢失或被误用到别的行。对编辑频繁的长 base64 文档体验不稳。
- 建议：以文档位置（`line.from` 偏移）或基于内容指纹记录展开状态，避免依赖可变行号。
- 交叉：`ocr-only`，已核实。

**M3 · base64 `update()` 在 `selectionSet/focusChanged` 也全量重建，大文档有性能开销**
- 路径：`src/base64-fold.js` 第 58 行。
- 问题：折叠装饰与选区/焦点无关，却每次光标移动/聚焦都遍历全部行（`O(n)`）。与 M1 同根——重建条件过宽。
- 建议：重建条件收敛为 `docChanged || viewportChanged`（配合 M1 的显式强制重建）。
- 交叉：`ocr-only`，已核实。

**M4 · Callout 插件对嵌套 blockquote 检测不完整**
- 路径：`src/callout.js` 第 44–59 行（前向扫描在首个 `paragraph_open` 处停止）。
- 问题：扫描从 `blockquote_open` 起跳，遇到第一个 `paragraph_open` 即停。若 callout 内含嵌套 `> >` 子引用，首个 `paragraph_open` 属于**内层**，扫描会检查内层段落文本（不含 `[!TYPE]`）→ `if (!m) continue` 跳过，**外层 `[!TYPE]` 漏检**；且标题可能被误插到内层 blockquote 之前。
- 建议：非嵌套 callout 完全正常；嵌套为已知局限。可在扫描时跳过内层 `blockquote_open`，或于文档/注释明确「不支持嵌套 callout」。
- 交叉：`ocr-only`，已核实。

**M5 · 预览 DOM-XSS 防护已就位，但 mermaid `securityLevel:'loose'` 残留脚本执行风险**
- 路径：`src/editor.js` 第 91–96 行 / 第 1816–1821 行（`mermaid.initialize({ securityLevel: 'loose' })`）；M1 修复已对 `md.render` 结果经 `DOMPurify.sanitize`（`sanitizePreviewHtml`，ADD_TAGS font/center，ADD_ATTR color/face/size/align）后注入，方向正确。
- 问题：`loose` 允许 mermaid 图表内嵌点击事件/脚本。若用户打开的恶意 `.md` 含构造的 mermaid 块，可能在预览中执行 JS（DOMPurify 不净化 mermaid 自身产出的 SVG）。
- 建议：评估改为 `'strict'` 或 `'sandbox'`；若离线编辑场景需保留交互，应在文档中明确接受该残留风险。
- 交叉：`review-spd-only`，已核实。

**M6 · 任务列表正则要求 `[ ]` 后至少一个空格，空任务项不被识别**
- 路径：`src/tasklist-panel.js` 第 10 行（`TASK_LINE_RE` 末段 `\]\s+(.*)$`）。
- 问题：`- [ ]` 无尾随文本的行无法匹配 → 不在面板列出、不可勾选切换；与预览区 task-list 插件的宽松处理略有出入。
- 建议：将 `\]\s+(.*)$` 放宽为 `\]\s*(.*)$`，`m[3]` 允许空串。
- 交叉：`review-spd-only`，已核实。

### 🟡 Low

**L1 · 大纲首次渲染可能基于未完全解析的语法树**
- 路径：`src/outline.js` 第 19–41 行（`syntaxTree` 惰性解析）。
- 说明：新建编辑器后若语法树尚未全量解析，首次 `getOutlineItems` 可能不全，需待下次更新补全。影响轻微。

**L2 · outline / tasklist 使用模块级单例（`outlineView`/`taskView`）**
- 路径：`src/outline.js` 第 13 行、`src/tasklist-panel.js` 第 12 行。
- 说明：当前单编辑器实例无碍；若未来多实例，单例会串味。风险低。

**L3 · `editor.html` 顶部 app-version 静态显示 `v1.4.4`**
- 路径：`src/editor.html` 第 37 行。
- 说明：运行期被 `editor.js` 第 2723 行覆盖为 `v1.4.8`，属陈旧占位，无功能影响。

**L4 · 探针 `installErrorCapture` 在每次未捕获错误后触发 `flushProbeLog`（Blob 下载）**
- 路径：`src/probe.js` 第 93–116 行。
- 说明：开发期可能频繁弹下载；属临时行为，H1 回收后无影响。

**L5 · `html-to-markdown.js` 的 `reconstructRawTag` 重建原始标签未做 Markdown 转义**
- 路径：`src/html-to-markdown.js` 第 25–33 行。
- 说明：用户文档中含会破坏 Markdown 的字符（如 `]`）可能轻微错位；因回写后再次渲染会重新经 DOMPurify 净化，影响低。

### 🧪 Testing Gaps

**T1 · A 级七功能缺少自动化测试**
- 说明：`bracket-utils` 已有 18 项单测；但 `callout` 标记解析、`outline` 标题提取、`tasklist` 解析、`codeblock-complete` 补全、`base64-fold` 折叠判定等纯逻辑均未覆盖，仅依赖手动与临时探针。建议补单测（节点环境可导入，无需浏览器）。

**T2 · 本机 `npm test` 中 `issue-acceptance.test.js` 因 Windows 路径双盘符报错**
- 说明：`tmpdir()` 经 `pathToFileURL`/`fileURLToPath` 往返产生 `D:\D:\...` 双盘符致 `ENOENT`。属预存在环境问题，与本分支无关，CI（Linux）应通过；合并前应在 CI 确认全绿。

## 残留风险（Residual Risks）

1. **临时探针回收不彻底**会污染生产（H1）——最高优先。
2. **mermaid `loose`** 的 XSS 残留（M5）——取决于是否改为 strict/sandbox。
3. **嵌套 callout** 检测局限（M4）——文档需声明不支持。
4. **A 功能缺自动测试**（T1）——回归保障弱，依赖手动。

## 后续动作建议（Verification）

1. **手动冒烟**：在 `feat/batch-a-features` 对七功能逐项验证（代码块语言补全、专注/打字机、callout、base64 折叠点击展开、mermaid 缩放、大纲跳转、任务勾选回写）。
2. **测试**：修复本机 tmp 路径问题或依赖 CI，跑 `node --test` 全量确认绿；按 T1 补纯逻辑单测。
3. **发布前回收**：执行 H1 三步回收，`vite build` 后 `grep -rn "probe(" src` 确认零残留、且 `editor.html` 无「导出探针日志」按钮。
4. **可选推送**：推 `feat/batch-a-features` 触发 CI + Desktop Build（需用户授权，未执行）。

## 结论

本分支功能实现完整、七项 A 级功能均代码级落地且遍布临时探针、DOM-XSS 已由 M1 正确加固；**未发现 Critical 级缺陷**。主要风险集中在两点：① 临时探针系统必须于发布前整体回收（H1，否则带来性能回归与调试 UI 泄漏）；② base64 折叠的点击展开/行号漂移/重建开销（M1–M3）。上述问题均附具体修复建议，可在合并前或回收阶段一并处理。
