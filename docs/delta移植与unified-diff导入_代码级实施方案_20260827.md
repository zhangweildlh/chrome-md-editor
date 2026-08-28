# delta 移植与 unified-diff 导入 · 代码级坐实与实施方案

> 版本：2026-08-27（取代 `docs/delta移植分析与可借鉴功能清单_20260826.md`）
> 交叉核对基线：`D:/Documents/AI_Work_Temp/delta-main`（dandavison/delta 本地克隆，v0.19.2）↔ `D:/Documents/AI_Work_Temp/chrome-md-editor`（v1.9.10）
> 方法：两端逐函数读取，所有断言均带 `文件:行号`；凡与原报告不符处已就地更正并标注。
> 交付物：**本文件为实施方案，不动一行源码**。
> 本版修订（v2）：修正 A3 行数公式（字符位置→行号）、B2 目标（配对行非改动段而非 unpaired）、A4 widget 机制（新增并列 StateField）；补「〇·五 Q1 采纳项」与「五、待决策清单」。

---

## 〇、与原报告的关键更正（必须先读）

| 原报告断言 | 代码事实（已坐实） | 影响 |
|---|---|---|
| A1 来源 `features/diff_highlight.rs` 含空白检测 | 真实检测在 `delta/src/utils/tabs.rs:23 expand` + `delta/src/edits.rs:110` + `delta/src/paint.rs:524-578` 逆向扫描；`diff_highlight.rs` 仅定义样式默认值（L4-56），并在 L10 把 `keep-plus-minus-markers`/`tabs` **从 feature 集合移除** | 移植逻辑应取自 tabs.rs/edits.rs/paint.rs，非 diff_highlight.rs |
| A3「delta 提供变更统计概览」 | `delta/src/handlers/diff_stat.rs:17-34` **仅当 `relative_paths` 开启时改写路径**，条形本身由 git 生成；delta 不计算增删计数 | 本仓库场景（任意两文档对比）**无 git 可生成条形**，必须自算；迁移目标改为「基于 chunks 聚合」 |
| A5「diff_highlight 中禁用 +/- 标记」 | `delta/src/features/raw.rs:72-76` 默认 `keep-plus_minus_markers = true`；仅在启用 `diff-highlight` feature 时 L10 才移除 | 默认实为「保留」，移植语义应取「保留」 |
| B1「navigate 标记体系可移植」 | `delta/src/features/navigate.rs:71-91` 把正则写入 `.lesshst` 历史文件交给 `less` pager 跳转——**深度耦合终端 pager**，无法脱离 less | B1 在本仓库应**原生实现**（本仓已有 navNext，仅补徽标/高亮），不移植 delta 正则机制 |
| B5「DSL 在 options/theme.rs」 | 真实解析器是 `delta/src/parse_style.rs:146-231 parse_ansi_term_style`；`options/theme.rs` 只管明暗模式/主题名 | 仅借鉴其「键→样式对象」词法模型 |
| 路径 `src/compare/compare-diff-export.js` / `compare.css` / `theme-presets.*` | 实际在 `src/` 顶层：`src/compare-diff-export.js`、`src/compare.css`、`src/theme-presets.js` | 下文一律用顶层真实路径 |

---

## 〇·五、源自 Q1 审查的采纳项（语法着色引擎不采纳，以下三项采纳）

在 Q1 审查中已坐实：delta 的**语法着色引擎 syntect（Rust→ANSI）不可采纳、也无需采纳**——本仓库对比视图已装配 CodeMirror `markdown()` 语言模式（`compare.js:226`）+ `highlightChanges:true`（`compare-merge.js:1225`），diff 行的「语法前景色 + 增删底色」两层叠加**已被本仓库原生实现**，且为 DOM 而非 ANSI，视觉等价甚至更强。

因此「值得向 delta 借用的」收敛为以下三项，分别对应下方 **A1 / B2 / B5**，本方案将其列为**必须落地项**（非可选）：

- **A1 空白错误高亮**：借 delta `edits.rs:110` + `paint.rs:524` 的「行尾纯空白段逆向判定」思想，补本仓库 MergeView 缺失的 trailing-whitespace 视觉。
- **B2 emph 分层样式**：借 delta `paint.rs:548` 的「仅同源配对行的非改动段套弱色」思想，降低「整行重写误读为局部修改」风险。
- **B5 配置面 DSL**：借 delta `parse_style.rs:146` 的「键→样式对象」键值模型，做本仓库对比配色自定义面板（本仓库已是 CSS 变量模型，只需补录入 UI）。

> 注：A5（行内 +/- 标记）、A2（章节标题）、A3（统计）、A4（空行填充）属独立增强，不在「Q1 语法/着色采纳项」范畴内，仍按原分批推进。

---

## 一、A 档：直接移植（delta 有、本仓库缺失）

### A1 空白错误高亮（trailing-whitespace / tab）

**delta 端代码事实**
- 判定：`delta/src/edits.rs:110-118 get_contents_before_trailing_whitespace` 用 `trim_end()` 判断是否行尾含非换行空白。
- 着色：`delta/src/paint.rs:524-578 update_diff_style_sections` 自**行尾逆向**遍历，仅对「行尾纯空白段且无前置非空白内容」套 `whitespace_error_style`（默认 magenta reverse）。
- tab 展开：`delta/src/utils/tabs.rs:23 expand` 把 `\t` 替换为 N 个空格。

**本仓库现状（坐实）**
- `src/compare.css` 全文 grep `trailing/whitespace/highlightSpace` **零命中**，MergeView 无空白高亮 class。
- 主编辑器侧有近似实现（`src/editor-extensions.js:202 highlightSpaceDots` → `cm-highlightSpace`，`src/editor.css:1789/1798/1812`），但作用域限定 `.editor-container .cm-editor`，**不覆盖** `.cm-mergeView`。
- `@codemirror/view` 内置 `showTrailingSpace` 扩展会加 `cm-trailingSpace`（见 `node_modules/@codemirror/view/dist/index.js:11618`），**compare 的 MergeView 未装配**。

**实施方案**
- 方案甲（最小）：在 `src/compare-merge.js` 构造 `createCompareMergeView` 的扩展数组里，对左右 `EditorView` 各注入 `showTrailingSpace`（来自 `@codemirror/view`）。一行导入 + 两处数组项。
- 方案乙（可控样式）：仿 `src/compare-line-markers.js:55 computeChunkDecorations`（ViewPlugin + `getChunks` 整行 `Decoration.line`）新增 `trailingSpaceViewPlugin`：扫描视口每行 `line.text` 尾随 `/\s+$/`，对区间 `[line.to - m.length, line.to)` 加 `Decoration.mark({class:"cm-compare-trailing-space"})`；在 `src/compare.css` 补 `.cm-mergeView .cm-compare-trailing-space { background: ... }`。
- 推荐乙（样式可控、避免污染主编辑器语义）；甲作兜底。
- **已拍板（2026-08-27）**：采用**方案乙**（自写 `trailingSpaceViewPlugin`）；高亮范围**仅行尾空白**，**不覆盖 tab 缩进**（.md 中 tab 缩进常为合法代码块，覆盖会误报）。详见第五节第 1 项；甲保留作兜底。
- 验证：`tests/compare-line-markers.test.js` 同款 ViewPlugin 测试范式；新增 `tests/compare-trailing-space.test.js`，构造含行尾双空格的 Markdown 行，断言 class 命中。

### A2 hunk 头注入 Markdown 章节标题

**delta 端代码事实**
- `delta/src/handlers/hunk_header.rs:212 HUNK_HEADER_REGEX = r"@+ ([^@]+)@+(.*\s?)"`；`parse_hunk_header:235` 取组 2 为 git 写入的「代码片段上下文」（如 `pub fn delta(`）。
- 结论：**所谓「函数/章节上下文」是 git 在 `@@ ... @@` 之后原始写入的字符串，delta 仅正则提取排版，不自行分析语言结构**。

**本仓库现状（坐实）**
- `src/compare-diff-export.js:22-49 buildDiffText` 在 L45 仅推 `@@ -oldStart,oldLines +newStart,newLines @@`，无标题。
- `src/compare/location-pane.js:97 buildSegments` / `:175 computeBarSegments` 只产 `type + topPct/heightPct`，无标题文本。

**实施方案**
- 在 `src/compare-diff-export.js:45` 生成 `@@` 行时，依据 `oldStart` 在 `a.split("\n")`（L23 已切分）中向上扫描 `for (let i = oldStart-2; i>=0; i--)` 首个 `/^#{1,6}\s+/`，把命中标题作为 `@@ ... @@` 后缀（或额外注释行）。纯函数，单测易写。
- location-pane 增强（可选，非必须）：给 `buildSegments` 段对象加 `header` 字段，在 `createLocationPane`（L250）渲染 tooltip。
- 注意：本仓库对比的是任意两 .md 文档，**标题由我们自己扫描**，而非依赖 git 注入——这是与原报告「注入 export」一致、且比 delta 更强的点。
- **范围说明**：本项仅作用于「本仓库自行导出」的 diff（`buildDiffText`）。外部导入的 unified diff（第三节 X）走重建→渲染通道，不经过 `buildDiffText`；若需给导入 diff 也加章节标题，须另在 location-pane 由重建出的 A 文本向上扫描，属可选扩展。
- 验证：`tests/compare-diff.test.js` 加用例：构造含 `# 标题` 的两文档，断言导出文本 `@@` 行含标题。

### A3 变更统计概览（+N / -M 行计数）

**delta 端代码事实（更正）**
- `delta/src/handlers/diff_stat.rs` **不计算**条形；条形由 `git diff --stat` 生成，delta 仅 `:46-75 relativize_path_in_diff_stat_line` 在开启 relative_paths 时改写路径、保留 git 后缀。
- 故本仓库场景必须**自算**增删行数。

**本仓库现状（坐实）**
- `src/compare.js:1709 statusCountEl.textContent = \`${changes} 处变更，${conflicts} 处冲突\``，其中 `changes = chunks.length`（`compare.js:1697`）、`conflicts = chunks.filter(c=>c.conflict).length`（`compare.js:1704`）。`#compareStatusCount` DOM 在 `src/compare.html:96`。
- 全仓 grep `stat|insertions|deletions`：除块计数外**无行级 +/- 数**（已确认缺失）。

**实施方案（v2 修正：行号换算）**
- 纯函数 `aggregateStats(chunks, docA, docB)` 置于 `src/compare-merge.js`（紧邻 `safeChunks`，L84）。**`Chunk.fromA/toA/fromB/toB` 是字符位置（非行号）**——证据：`compare-diff-export.js:30` 用 `ta.lineAt(c.fromA).number` 取行号。故必须用 `doc.lineAt()` 换算行数：
  - `removed += docA.lineAt(c.toA).number - docA.lineAt(c.fromA).number`
  - `added += docB.lineAt(c.toB).number - docB.lineAt(c.fromB).number`
  - 三栏另有 `fromC/toC`，按相同方式用对应 doc 换算（Base/Yours/Theirs 两两比对各算各的）。
- 在 `src/compare.js:1709` 处并入文案：`第 ${changes} 块 · +${added} / -${removed} · ${conflicts} 冲突`。
- 验证：`tests/compare-line-markers.test.js` / 新增用例，构造已知 chunks + 对应 `Text` 文档，断言聚合行数（**必须用 `doc.lineAt` 构造，不能用 `toA-fromA` 字符差**）。

### A4 空行填充标记（N↔M 块独属行对侧）

**delta 端代码事实**
- `delta/src/paint.rs:315 get_should_right_fill_background_color_and_fill_style` 返回填充样式；`:373 right_fill_background_color` 依赖 `ANSI_CSI_CLEAR_TO_EOL` 终端清行；`:391 mark_empty_line` 依赖 `ANSI_CSI_CLEAR_TO_BOL`——**纯 ANSI 终端控制，需替换为 DOM 机制**。

**本仓库现状（坐实）**
- 数据层已有：`src/compare/delta-align.js:665 buildExclusiveConnectorPairs` 产出独属行→对侧插入点楔形连线；`src/compare/move-connectors.js:290 createConnectorPainter` 用 SVG `.cm-move-connector` 绘制（L695-696 `variant:'added'|'removed'`）。
- `refreshDecorations`（compare-merge.js:274-352）对独属行填充侧**无任何 in-editor 标记**，仅 SVG 楔形覆盖层。

**实施方案（v2 修正：widget 机制）**
- **机制纠正**：`wordDiffDataField` 的载荷是 `WordDiffData`（行内区间，非 widget），不能承载 `Decoration.widget`，类型不一致。改为在 `src/compare/inline-word-diff.js` 新增与 `wordDiffDataField` **并列**的 `fillerField` / `setFillerEffect`（同款 `StateField`+`Effect` 结构，沿用 compare-merge.js:347 注释所述「多层累积、一次性 dispatch」模式避免覆盖）。
- `refreshDecorations`（L339 的 `exclusivePairs` 分支）对 `unpairedMinus/unpairedPlus` 对应行，经 `accumA/accumB`（L350-351）推入 `Decoration.widget({class:'cm-compare-filler'})` 占位块，由 `buildWordDiffDecorations` 同款合并后一次性 dispatch 到对应视图。
- **已拍板（2026-08-27）**：filler 占位块采用**与 SVG 楔形连线同色的小标**（视觉一致、辨识度高）。详见第五节第 5 项。
- 验证：`tests/compare-move-decorations.test.js` 同范式，断言 N↔M 块填充侧存在 filler widget。

### A5 行内保留 +/- 标记符

**delta 端代码事实（更正）**
- 默认 **保留**：`delta/src/features/raw.rs:72-76 keep_plus_minus_markers = true`；`delta/src/paint.rs:780-804 painted_prefix` 据标志把 `-`/` `/`+` 用对应样式重绘。

**本仓库现状（坐实）**
- `src/compare/inline-word-diff.js:93 computeWordDiff` 仅返回区间 `type:'added'|'removed'`（L115/L119），经 `:240 buildWordDiffDecorations` 转 `Decoration.mark` + class `cm-diff-word-added`/`cm-diff-word-removed`（L75-76）；本文件 grep `prefix|'+ '|'- '` **零命中**——无字面符号。

**实施方案**
- 最小：在 `src/compare.css` 给 `.cm-diff-word-added::before { content:"+"; }` / `.cm-diff-word-removed::before { content:"−"; }`（需 `position` 处理偏移，避免挤动文本；CodeMirror 测量基于 DOM，::before 会影响布局，需实机验证）。
- 稳妥：在 `buildWordDiffDecorations`（L251-258）对 `type==="removed"` 区间改为 `Decoration.widget` 渲染 `−` 字形（不侵入文本布局）。
- **已拍板（2026-08-27）**：采用 **`Decoration.widget`** 渲染 `−` 字形（不侵入文本布局，稳；走与新增 `fillerField` 同款 widget 通道）。详见第五节第 6 项。
- 验证：截图比对 + 单测断言 decoration 类型。

---

## 二、B 档：本仓库已有、需加固对齐 delta 体验

### B1 块导航标记与计数（原生实现，不移植 delta 机制）

**delta 端代码事实（更正：不可移植）**
- `delta/src/features/navigate.rs:71-91` 把 `^(commit|Δ|•)` 正则写入 `.lesshst` 历史文件交给 `less` 跳转——**终端 pager 耦合，无法移植**。仅有 label 体系（L9-30：`navigate`/`file-modified-label=Δ`/`hunk-label=•`）可供借鉴命名。

**本仓库现状（坐实）**
- 导航已存在：`src/compare.js:1485 navNext` → `src/compare-nav.js:31 bindChunkNavigation(view).move(dir)`（含环绕）；快捷键 `src/compare-nav.js:123 bindChunkNavigationKeys`，`src/compare.js:2005` 调用（`B/]`=下、`Shift+B/[`=上）。
- 但**无「第 n/N 块」徽标、无当前块高亮**；`#compareStatusCount` 仅块计数（`compare.js:1709`）。

**实施方案**
- 在 `navNext/navPrev`（`compare.js:1485-1490`）的 `move` 后记录 `currentChunkIndex`（从 `bindChunkNavigation(view).move(dir)` 的返回值或 `getChunks` 现状态取），于 `compare.js:1709` 同区域渲染 `第 ${i+1}/${n} 块`。
- 当前块高亮：在 `src/compare-line-markers.js:55 computeChunkDecorations` 或 `buildWordDiffDecorations` 增加基于光标所在 chunk 的 `cm-compare-current-chunk` 行装饰（line decoration），并在选区变化时重算。
- 验证：`tests/compare-line-markers.test.js` 同范式；手动复测快捷键循环。

### B2 emph 分层样式（配对行强色 / 未配对行弱色）

**delta 端代码事实**
- 数据：`delta/src/edits.rs:121-136 make_lines_have_homolog` 依 `line_alignment` 判每行是否同源配对，返回 `Vec<bool>`。
- 样式：`delta/src/paint.rs:324/332` 配对行用 `non_emph_style`、未配对行用主 `style`；`:548-575` 精确条件 `should_update_non_emph_styles = non_emph_style.is_some() && *line_has_homolog`——**仅配对行的非 emph 段套弱色，未配对行（整行增删）保持强色**，防「整行重写误读成局部修改」。

**本仓库现状（坐实）**
- 数据层已区分：`src/compare/delta-align.js:497 inferEdits` 返回 `pairs`（配对）+ `unpairedMinus/unpairedPlus`（独属）。
- 装饰层：`src/compare/inline-word-diff.js:75-76` 仅 `cm-diff-word-added`/`cm-diff-word-removed`；`src/compare.css:1422/1429` 无 `emph/non-emph/paired` 变体（grep `emph|non-emph|paired` 零命中）。

**实施方案（v2 修正：目标为配对行的非改动间隙段）**
- **目标纠正（与原初稿相反）**：delta 的 emph 分层是给**已配对行的「非改动段」**套弱色，未配对整行（纯增删）**保持强色**（整行增删本就应是强色）。故**不应**给 unpaired 行加 class，而应在 `buildWordDiffDecorations` 对配对行的「未改动间隙段」补 `type:'nonemph'` 区间——间隙 = 整行减去 `pairs` 的 `minusRanges/plusRanges`。
- 具体：在 `src/compare/inline-word-diff.js` 的 `computeWordDiff`/`buildWordDiffDecorations` 增加 `type==='nonemph'` 分支，映射到 CSS 类 `cm-diff-word-nonemph`（弱底色），覆盖在 `highlightChanges`（`compare-merge.js:1225`）整行强底之上，形成「上下文弱、改动强」的视觉。
- `src/compare.css` 补 `.cm-content .cm-diff-word-nonemph { background: <弱色>; }`。
- **已拍板（2026-08-27）**：nonemph 弱色**叠加强底方案成立**（沿用 delta 原方案：上下文间隙弱色、改动强色）。实机点检若发现弱色被整行强底压过，再降级为描边。详见第五节第 2 项。
- 验证：`tests/compare-delta-align.test.js`（已存在）增「配对行 nonemph 间隙断言」——断言 `pairs` 的间隙段产出 `type:'nonemph'`。

### B3 尾随空白独立分段（与 A1 互补，非依赖）

**delta 端代码事实**
- `delta/src/edits.rs:110-118` 判定 + `:255-262` 在 `annotate` 的 NoOp 分支把尾随空白切为独立 annotation 段，从而可独立着色。

**本仓库现状（坐实）**
- `src/compare/delta-align.js:158 tokenize`（词整体成 token、词间逐字素簇拆）不单独识别尾随空白；`:334 annotatePair` 仅中间空白在 `coalesce_space_with_previous`（L422-435）并入，行尾空白不会被单独分段/染红绿。

**实施方案**
- 在 `annotatePair`（L401-437）回溯循环结束后，补「若 `before`/`after` 末段为纯空白且与上段同型，单独推一个 type 段」；或在前端 `push` 合并（L391-399）对行尾空白强制断开。
- 须同步更新 `tests/compare-delta-align.test.js`（偏移无损用例 + 尾随空白分段用例）。
- **与 A1 的关系（澄清）**：A1 是**视觉层**（扫描行尾空白加 class），可独立成立，无需 B3；B3 是**数据层**（把尾随空白从改动段切出），其真正价值是**提升对齐质量**——避免行尾空白把整段 token 误判为改动，从而减少假红绿。二者互补：A1 给视觉、B3 给对齐精度。可只做 A1，B3 按需。
- 验证：单测断言行尾空白段 `type` 与偏移可无损拼回。

### B4 超长行折行对齐

**delta 端代码事实**
- `delta/src/features/side_by_side.rs:77 line_is_too_long`（`line.width() > line_width`）、`:87 has_long_lines`（左右分别 map + 返回逐行 bool 表供后续避免重复计算）。纯宽度逻辑，移植成本低。

**本仓库现状（坐实）**
- 两栏等高由 MergeView 模型天然保证（`scroll-box.js:28` 共用滚动盒 + spacer）。
- `src/compare.css:500 .cm-mergeView { overflow-x: hidden }`（L507），`.cm-content` 未显式 nowrap——**超长行被横向裁切，无折行**。

**实施方案（含待决策）**
- 方案甲（稳）：保持 `nowrap`，将 `overflow-x: hidden` 改为 `overflow-x: auto` 让超长行可横向滚动，不破坏 MergeView 对齐。
- 方案乙（观感好、风险高）：在 `src/compare.css` 给 `.cm-mergeView .cm-content` / `.cm-line` 加 `white-space: pre-wrap; word-break: break-word;`。但折行改变行高，一侧折行另一侧不折会导致 MergeView chunk 对齐 spacer 需补偿（`src/compare/move-connectors.js:471-498` 已用 `coordsAtPos` 取多行高度，具备兼容基础，但需回归）。
- **已拍板（2026-08-27）**：采用**方案乙**（`pre-wrap` 折行，观感优先），且**用户明确接受折行导致盒子（`.cm-line`）变高**〔2026-08-27 第四轮裁定〕。风险已识别：折行改变行高，一侧折行另一侧不折会导致 MergeView chunk 对齐 spacer 需补偿，`move-connectors.js:471-498` 已用 `coordsAtPos` 取多行高度具备兼容基础，但**必须回归** SVG 落点测量。详见第五节第 3 项。
- **外部佐证（WinMerge，`github.com/winmerge/winmerge`，2026-08-27 用 `gh` 核证）**：WinMerge 并排 diff 用「逻辑行号 + 视觉子行(`GetSubLines`/`WrapLineCached`)」两层坐标；两栏垂直滚动同步的是**逻辑行号**（`OnUpdateSibling`→`ScrollToLine(pUpdateSource->m_nTopLine)`，基类 `ccrystaltextview.cpp:4024`/`6490`），每栏独立把逻辑行映射为自身子行布局，**不假设左右等宽、不强制逐像素行对齐**，差异对应靠 diff 块阴影/连线表达（`nDiffHeight` 逐窗格按各自 `GetSubLines` 计，见 `MergeEditView.cpp:4099`）。本仓库乙方案 + `move-connectors` 的 `coordsAtPos` 实测盒子 Y 连线，与该思路**殊途同归**，进一步确证乙方案可行。
- 验证：`tests/compare-move-decorations.test.js` 超长行用例回归。

#### B4 回归核对清单（执行前逐项勾销）

> **总纲**：本仓库两栏**共用一个滚动盒** `.cm-mergeView`（`src/compare/scroll-box.js:4-9`），A↔B 行对齐靠像素级共用滚动；而 WinMerge 是独立窗格 + 同步逻辑行号、不强制等高。故乙方案（`pre-wrap` 折行）的真正回归焦点**不在**「连线画不画得对」——`edgeOf` 全靠 `coordsAtPos`/`lineBlockAt` 实测（`src/compare/move-connectors.js:471-498`，注释 L473 已确认软换行变高能量到真实高度，与 WinMerge「靠连线表达差异」一致）——而在「**行对齐本身**」与「**多行块高度估算**」两处底层逻辑在变高盒子下是否成立。

**A. 连线端点测量（对应 WinMerge「独立子行建模」）**

| 项 | 核对什么 | 预期 | 现状基础 | 回归手段 |
|---|---|---|---|---|
| A1 | `edgeOf` 对「单侧某逻辑行折成 N 行」取 `coordsAtPos(line.from)`/`line.to` 的 min/max | 端点跨度 ≈ N×单行高，覆盖整行（含所有视觉子行） | `edgeOf:471` 实测 + 注释 L473 已确认 | 单测断言 `bottom-top ≈ 3×lineHeight`（造一行折 3 行用例） |
| A2 | 降级路径 `lineBlockAt(line.from)+documentTop`（`edgeOf:488`）在折行下 `block.top/bottom` 是否含软换行高度 | 滚出视口的块仍落真实垂直位置，非堆在 0 | 理论 OK，未实测 | 大文件滚动后连线端点 y 正确 |
| A3 ⚠ 高危 | `rawSpan` 多行块 `tail` 测不出时回退 `(e-s)*defaultLineHeight`（`move-connectors.js:423-430`） | 折行后每行实际 > 默认行高，此估算**会低估**块高度，带子偏短 | 当前用固定行高估算，折行下不成立 | **重点**：构造跨 3 行且首行折行的 moved block，确认 tail 取不到时是否真的低估；若是，改为按真实子行数（`lineBlockAt` 或实测高度）估算 |

**B. 共用滚动下的累积错位（对应 WinMerge「逻辑行同步」vs 本仓库「像素同步」）**

| 项 | 核对什么 | 预期 | 现状基础 | 回归手段 |
|---|---|---|---|---|
| B1 | 对应行左右折行数不同时，后续行 Y 累积错位 | **预期会发生**（与 WinMerge 接受错位一致）；连线正确连接两端即可，属观感代价 | 共用滚动盒致像素同步，错位无法靠逻辑行同步消除 | 视觉核对；若要求严格对齐，列为**可选增强**：给矮侧补等高空白到同子行数（非阻塞项） |
| B2 | CM6 merge 自带 spacer（独属行占位）在 `pre-wrap` 下高度计算 | 删除块（一侧 N 行 / 另一侧 0 行）场景后续行仍对齐 | spacer 是 CM 包内部，本仓库不可改，需实测 | 删行场景真机；`scroll-box.js:148-151` 提示 spacer 重算位移靠补绘归位，确认 `SETTLE_SAMPLE_FRAMES` 在更高位移下仍归位 |

**C. 连线绘制时机（对应 WinMerge 滚动重算）**

| 项 | 核对什么 | 预期 | 现状基础 | 回归手段 |
|---|---|---|---|---|
| C1 | scroll 事件下 draw 节流 + `coordsAtPos` 重测跟随折行后新坐标 | 折行后连线随滚动实时贴附新高度 | `draw()` 已有 lead/trail 节流 | 滚动中截图比对连线端点 |
| C2 | resize 补绘（`SETTLE_SAMPLE_FRAMES` 1/2/4/8/16 帧）在 `pre-wrap` 下 spacer 位移更大时 | 5 次采样仍能在 spacer 落定后归位 | 原用于 ~79px 位移，折行下位移更大需确认 | 拖拽窗口边框 + 超长行，查补绘后连线是否归位 |
| C3 逻辑核查 | `sizeSignature` 只量栏盒子尺寸，折行只改行内高度、不改栏宽高 → **不会触发** resize 补绘 | 无碍：draw 由 scroll/refresh 驱动、坐标实测即可 | `sizeSignature:544` 仅量盒子 | 确认「仅加 pre-wrap 不改栏尺寸」时 draw 仍正确（无回归） |

**D. 跨视图坐标归一化**

| 项 | 核对什么 | 预期 | 现状基础 |
|---|---|---|---|
| D1 | `normalize` 用 container rect 做两栏坐标统一减（`move-connectors.js:342`） | 两栏各自变高，归一化仍正确（坐标减法与行高无关） | ✅ 无需改，回归确认 |
| D2 | 三栏模式 Theirs 是独立 `EditorView`（其 `.cm-scroller` 为滚动盒，`scroll-box.js:17`），B↔C 层连线同样受 `pre-wrap` 影响 | A1–A3 对 B↔C 层同样适用 | 需对 B↔C 层重复 A 组回归 |

**E. 边界 / 极端用例**
- E1 单侧全超长（一行 500 字符折 10 行）：连线块应正确包围 10 行。
- E2 空文档 / 单行：无折行，退化现有行为，确认无回归。
- E3 `truncated` 超大文件降级（只高亮不连线）：与折行无关，确认不受影响。
- E4 `collapseUnchanged` 折叠区段 + 折行：`coordsAtPos` 返回 null 走 `lineBlockAt` 降级，确认折行下仍正确。

**F. 自动化测试落点**
- F1 `tests/compare-move-decorations.test.js` 增超长行用例，断言连线 `d` path 的 `sTop/sBottom` 跨度 = **实测变高高度**（非固定 `defaultLineHeight`）。
- F2 暴露并修 **A3** 的 `(e-s)*defaultLineHeight` 估算（折行下低估），这是乙方案下**最可能的真实 bug**。
- F3 性能：折行下 `coordsAtPos` 调用频次（每 pair 2×N 行）在 `DRAW_DEBOUNCE_MS` 窗口内不卡顿。

**两项必须钉死的风险**
1. **A3 `rawSpan` 固定行高估算**：折行后多行块高度被低估，带子偏短——逻辑 bug，非观感问题，执行乙方案时**必须改**。
2. **B1 累积错位**：属观感代价，已接受「盒子变高」应一并接受此错位（与 WinMerge 同思路，靠连线表达）；若后续要求严格对齐，再单独做「等高 filler」增强，不阻塞乙方案。

### B5 自定义对比配色面板（借鉴键值 DSL 设计）

**delta 端代码事实**
- 真实解析器 `delta/src/parse_style.rs:146-231 parse_ansi_term_style`：词法状态机，`split_whitespace` 逐词匹配属性（bold/ul/reverse…）、首个非属性词=前景、第二个=背景、多于两色报错；`#rrggbb` 经 `color::parse_color` 解析。`DecorationStyle::from_str`（L79-109）用 bitflags 组合 box/ol/ul。
- 注意 `options/theme.rs` 仅管明暗/主题名，**不是** DSL 解析器。

**本仓库现状（坐实）**
- `src/theme-presets.js:522 EDITOR_THEMES`（21 预设 + L319 `id:'custom'` 中性回退）；差异色出口是 `src/compare.css` 的 `--diff-word-added-bg` 等 CSS 变量，`inline-word-diff.js:295 wordDiffTheme` 用 `var(--diff-word-added-bg, …)` 留覆盖口。
- **无用户自定义录入 UI**（`initThemeSelect` L632 仅选预设）。

**实施方案**
- 在 `initThemeSelect`（L632）旁新增「自定义」面板，写入 `document.documentElement.style` 覆盖 `--diff-*` 变量集；对 `id==='custom'`（`applyEditorThemePreset` L597）读取用户变量。
- 键值 DSL 仅作设计参考：本仓库已是「键(CSS 变量)→值」模型，无需移植 parse_style.rs 的词法机。
- **已拍板（2026-08-27）**：自定义面板范围**仅 diff 配色 CSS 变量**（`--diff-*` 变量集），**不扩展到整编辑器主题**（避免与 `theme-presets.js` 预设体系冲突）。详见第五节第 4 项。
- 验证：手动切换预设 + 自定义，截图比对；CSS 变量覆盖单测（如有）。

---

## 三、unified-diff 导入（消费 git/GitHub diff 成果）

### 当前入口事实（坐实）
- `src/compare.js:87 bootstrapCompare` → `:1505 onPickFiles`（走 `pickSingleFile` 载入全文）→ `:1053 render` → `createCompareMergeView`。**三者只消费「两份/三份全文」**。
- 全仓 grep `diff --git|parseDiff|importDiff|No newline` 应用代码**零命中**（唯一 `tests/compare-line-markers.test.js` 的 unified 指 `unifiedMergeView`，与 unified diff 文本无关）。
- `src/compare/io-bridge.js:89 createIoBridge` 仅有 `read/write/pickSaveTarget/saveAs`，**无 shell 执行**；`desktop/capabilities/default.json` 仅 `shell:allow-open`，**无 `shell:allow-execute`/`spawn`**。`package.json` 已依赖 `@tauri-apps/plugin-shell ^2.2.1`。

### 解析/重建器设计（纯函数，可 node:test 单测）
- 新建 `src/compare/parse-unified-diff.js`，导出 `parseUnifiedDiff(text) -> { files: DiffFile[] }`，`DiffFile = { oldPath, newPath, oldText, newText, hunks }`。
- 状态机（对标 delta `ARCHITECTURE.md` 五态，JS ~200-300 行）：
  1. 文件头：`diff --git a/x b/y` 分段；`--- a/x` / `+++ b/y`（一侧 `/dev/null` ⇒ 空文档）；`rename from/to`、`new file`、`deleted file`、`similarity index`。
  2. hunk 头：`@@ -a,b +c,d @@` 解析起止行；行前缀 ` `=上下文（两侧入）、`-`=删（入 oldText）、`+`=增（入 newText）。
  3. `\ No newline at end of file`：还原 EOF 无换行语义，避免尾部差一个 `\n` 造出假差异。
  4. `GIT binary patch`：识别后该文件标记 `binary:true`，跳过重建并提示。
- 多文件：`diff --git` 切分为多 `DiffFile`。**已拍板（2026-08-27）：本期先支持单文件 diff 导入**（多文件时取列表首项或让用户选一个），多文件列表选择 UI 留待后续迭代。详见第五节第 8 项。

### 三条数据源接入（含接线点修正）
- **① 粘贴 diff（纯前端，零权限）**：对比视图加「粘贴 unified diff」入口 → 调 `parseUnifiedDiff` → 把 `oldText/newText`（多文件时取选中项）经**新增** `loadFromDiffText(text)` 灌入视图。该函数复用 `onPickFiles`（compare.js:1505）内部已有的「设置 A/B 文档 + 触发 render」通道（即 `instance` 的文档 setter / `setEditorContent`），**不改造 `onPickFiles` 本身**，避免影响文件框逻辑。
- **② GitHub `.diff` URL（已砍掉）**：原拟 `fetch('https://github.com/<owner>/<repo>/pull/N.diff')` + 扩展 `manifest` 加 `host_permissions`。**2026-08-27 第四轮裁定：不实现**（B 路径），因扩展权限模型变更未授权、收益不足以覆盖风险。
- **③ 本地 `.diff`/`.patch` 文件打开（本期唯一定点，零权限）**〔2026-08-27 第四轮裁定 (A)〕：复用现有「打开文件」入口——扩展 `compare-files.js` 的 `DEFAULT_ACCEPT`（当前 `.md,.markdown,.mdown,.mkd,.mkdn,.txt`）加入 `.diff,.patch`，并在 `pickSingleFile` 分支：扩展名命中 diff/patch 时调 `parseUnifiedDiff(text)` 重建 `oldText/newText` 后走与 ① 相同的 `loadFromDiffText` 灌入通道。**纯前端 + 现有文件读能力，零权限增量，不需要 `shell:allow-execute`，不需要 manifest 变更，不需要你额外授权。**

### 安全约束（硬）
- 本地 `.diff`/`.patch` 文件打开走现有文件读能力，**零权限增量**；解析器须限制 hunk 数量上限（防超大 diff 拖垮主线程，现有 `scanLimit/MAX_TOKENS` 兜底）。桌面端无需执行 git 命令。
- 浏览器扩展**绝不**内嵌或调用外部 exe；仅路径 ①②适用扩展，③仅桌面端。

---

## 四、分批实施与验证矩阵

| 批次 | 项 | 关键改动文件 | 验证 |
|---|---|---|---|
| P1 小改动高回报 | A1 空白高亮 | `src/compare-merge.js` 扩展数组 / `src/compare.css` | `tests/compare-trailing-space.test.js` |
| P1 | B2 emph 分层（配对行非改动段 nonemph） | `src/compare/inline-word-diff.js` 增 `type:'nonemph'` + `src/compare.css` | `tests/compare-delta-align.test.js` 增 nonemph 间隙断言 |
| P1 | B1 导航徽标 | `src/compare.js:1485-1490,1709` + `src/compare-line-markers.js:55` | 快捷键复测 + `compare-line-markers.test.js` |
| P2 体验完善 | A4 空行填充（新增 fillerField） | `src/compare/inline-word-diff.js` 增 `fillerField` + `src/compare-merge.js:339` | `tests/compare-move-decorations.test.js` |
| P2 | A3 统计概览（行号换算） | `src/compare-merge.js:84` 增 `aggregateStats(chunks,docA,docB)` + `src/compare.js:1709` | 行数聚合单测（用 `doc.lineAt`） |
| P2 | B3 尾随空白分段 | `src/compare/delta-align.js:334,391` + 单测 | `tests/compare-delta-align.test.js` |
| P3 按需 | A2 章节上下文 | `src/compare-diff-export.js:45` + `src/compare/location-pane.js:97` | `tests/compare-diff.test.js` |
| P3 | B5 自定义配色 | `src/theme-presets.js:632,597` + `src/compare.css` 变量 | 截图比对 |
| P3 | B4 折行对齐 | `src/compare.css` 改 overflow / 或加 white-space | 超长行回归 |
| P3 | A5 +/- 标记 | `src/compare/inline-word-diff.js:251` + `src/compare.css` | 截图 + 类型单测 |
| X 独立可用 | unified-diff 导入（仅 (A) 本地文件打开，零权限） | 新建 `src/compare/parse-unified-diff.js` + 新增 `loadFromDiffText` + 扩展 `compare-files.js:DEFAULT_ACCEPT` 与 `pickSingleFile` 分支 | 新建 `tests/compare-parse-unified-diff.test.js`（覆盖 /dev/null、No newline、binary、多文件） |

### 每批收尾闭环（项目惯例）
实现 → 全面检查 + 跨阶段 BUG/泄漏/污染/冲突审查 → 修复 → 复检 → 真机点检（360Chromex 扩展 + Tauri EXE 双环境）。移植文件头照 `src/compare/delta-align.js` 惯例标注上游来源与适配改动，MIT 与 `Copyright (c) Dan Davison` 随文件保留。

### 风险与边界
- B2/B3 改动 `delta-align.js` 会动核心算法，必须跑全量 `tests/compare-delta-align.test.js` 确认偏移无损。
- B2 与 `highlightChanges` 整行强底叠加，需实机确认 nonemph 弱色视觉成立。
- B4 折行改变行高，须回归 `move-connectors` 的 SVG 落点测量。
- A4 新增 `fillerField` 须与 `wordDiffDataField` 同款累积/合并，避免 compare-merge.js:347 所述多层覆盖。
- unified-diff 解析器是**全新模块**，独立于对比渲染，应先以纯单测驱动（node:test）稳定后再接 UI。
- 路径 ②（GitHub `.diff` URL 抓取）**已砍掉**（未授权 manifest 权限变更）；路径 ③ 仅落地 (A) 本地 `.diff`/`.patch` 文件打开，走现有文件读能力，零权限增量，无需 shell 执行授权。

---

## 五、待决策 / 待讨论事项（需你拍板）

以下各项方案已给出可行路径，但存在**二选一或范围界定**需你定夺，未定前不影响其他项启动：

1. ~~**A1 方案甲/乙 + 范围**~~ **【已拍板】**：采用方案乙（自写 ViewPlugin），范围仅行尾空白、不覆盖 tab 缩进。
2. ~~**B2 nonemph 视觉**~~ **【已拍板】**：弱色叠加强底方案成立（沿用 delta 原方案），实机发现被压过再降级描边。
3. ~~**B4 折行策略**~~ **【已拍板】**：采用方案乙（`pre-wrap` 折行，观感优先），须回归 `move-connectors` 对齐落点。
4. ~~**B5 自定义范围**~~ **【已拍板】**：自定义面板仅暴露 diff 配色 CSS 变量（`--diff-*`），不扩展到整编辑器主题。
5. ~~**A4 filler 形态**~~ **【已拍板】**：独属行对侧占位块用与 SVG 连线同色的小标。
6. ~~**A5 +/- 标记**~~ **【已拍板】**：采用 `Decoration.widget` 渲染 `−` 字形（走 widget 通道）。
7. ~~**unified-diff 数据源 III**~~ **【已拍板】**：仅实现 **(A) 本地 `.diff`/`.patch` 文件打开**（扩展 `pickSingleFile` 白名单 + `parseUnifiedDiff` 分支，纯前端零权限）；**不实现 (B) GitHub `.diff` URL 抓取**（未授权 manifest 权限变更）。无需 shell 执行授权即可落地 (A)。
8. ~~**多文件 diff 列表 UI**~~ **【已拍板】**：本期先支持单文件 diff 导入，多文件列表 UI 留待后续迭代。

> **全部 8 项已于 2026-08-27 拍板**（见各节「已拍板」标注）。其中第 7 项（数据源 III）定稿为：仅实现 (A) 本地 `.diff`/`.patch` 文件打开（纯前端、走现有文件读能力、零权限增量），不实现 (B) GitHub `.diff` URL 抓取。P1（A1/B2/B1）与 (A) 均已完全可落地，待你「开始执行」指令。
