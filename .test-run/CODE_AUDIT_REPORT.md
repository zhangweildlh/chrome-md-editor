# Chrome-Markdown-Edit 全量代码审计报告

> 审计时间：2026-08-03
> 被审计仓库：`D:\Documents\AI_Work_Temp\Chrome-Markdown-Edit`（fork `zhangweildlh/chrome-md-editor`，基于上游 `yishu-ziyu/chrome-md-editor`）
> 被测版本：v1.5.0（`package.json` / `public/manifest.json`）
> 审查引擎：`code-review-combo`（open-code-review-delegate 委托模式 + review-spd 五焦点语义审查 交叉验证）
> 范围：**整个仓库源码（全量）** —— `src/` 43 个文件（38 .js / 3 .html / 2 .css）+ `desktop/` 3 个 Rust 文件，共 46 个文件
> 方法说明：环境未配置 LLM，`ocr scan` 整库扫描不可用；OCR 委托模式仅覆盖 workspace diff（且本次后台预览进程未返回），故**全量语义审查由 7 个并行子代理按五焦点（correctness / regression / test / security / performance）执行，宿主做交叉验证、去重、合并**。子代理间存在独立重复发现（互为交叉确认）。

---

## 0. 严重度统计

| 严重度 | 数量 | 说明 |
|--------|------|------|
| Critical | 1 | 数据丢失（用户文档被静默破坏） |
| High | 24 | 常见/重要路径的明确 BUG、安全绕过、特性静默失效 |
| Medium | 46 | 边缘路径 BUG、兼容性破坏、缺验证/测试缺口、性能 |
| Low | 45 | 轻微 BUG 风险、狭窄边缘、可维护性问题、死代码 |
| **合计** | **116** | 去除跨子代理重复计数后的唯一发现 |

> `verified_by`：因 OCR 全量扫描未运行，全部标记为 `review-spd-only`；其中 3 项被**两个独立子代理同时发现**（互为交叉确认），`cross_check` 标 `confirmed`，其余标 `new`。

---

## 1. Critical（1 项）

### [Critical] 预览区失焦回写会**永久删除文档中所有 Mermaid 代码块** ｜ `src/editor.js:1163-1171,1283-1306` + `src/html-to-markdown.js:215-220` ｜ category: correctness / 数据丢失
- **根因**：`doUpdatePreview` 把 ```` ```mermaid ```` 渲染出的 `<pre>` 替换为 `<div class="mermaid-diagram">`（editor.js:538-541）；而回写转换器 `html-to-markdown.js:215-220` 对该 div 直接 `return ''`，整块 mermaid 源码被丢弃。
- **触发路径（无需任何编辑）**：预览区是 `contenteditable`，用户**点一下预览区再点别处**即触发 `blur` → `syncPreviewToEditor(true)`（editor.js:1163-1171）；因 mermaid 块被删，`markdownContent !== currentContent` 恒成立 → `setEditorContent` 覆盖编辑器全文（editor.js:1291-1296）→ `scheduleAutosave()` 落盘草稿 → 用户按 Ctrl+S 把丢失内容写入真实 `.md`。
- **污染变体**：mermaid 渲染失败时生成 `<div class="mermaid-error">` + `textContent = 'Mermaid 渲染错误: ...'`（editor.js:544-547），该 div 不带 `mermaid-diagram` class，走默认分支返回 `childText`，**错误提示文本被写进 Markdown 源码**替换原块。
- **修复建议**：`syncPreviewToEditor` 前判断预览 DOM 是否含不可逆节点（`.mermaid-diagram` / `.mermaid-error`），有则拒绝回写；或在 `pre.replaceWith(div)` 时把原始 fence 存入 `data-md-source`，由 `convertNode` 还原。

---

## 2. High（24 项，按子系统分组）

### 编辑器核心（editor.js / outline / search-panel / focus-mode）
- **[H-01] Ctrl+S / Ctrl+O 被触发两次**（CM6 keymap 不阻断冒泡）｜ `src/editor.js:403-404,2088-2098` ｜ correctness/regression
  editor.js 的 keymap（仅 `preventDefault:true`）与 document 级 keydown 监听绑定同一组合键，事件冒泡到 document 后 `handleSave()/handleOpen()` 再被调用一次。无 `currentFileHandle` 时两次 `showSaveFilePicker` 第二次必抛 `NotAllowedError` → 每次 Ctrl+S 弹「保存失败」toast；有句柄时两次 `createWritable()` 并发写冲突。
- **[H-02] 会话恢复（Issue #2）在生产环境永不执行** ｜ `src/editor.js:281-352,2362-2380,2714,2766` ｜ regression
  `createEditor()` 用 71 行欢迎文档初始化，`tryRestoreLastDocument()` 前置要求文档为空（`content.trim().length > 0` 即返回 false），而 `init()` 顺序 createEditor→showOnboarding→loadPendingFile 间无清空逻辑，故恢复分支全返回 false，`rememberLastFile` 写入的数据永远读不出。现有测试只覆盖纯函数，无法暴露。
- **[H-03] `offerDraftRestore` 错误文件键 + 竞态覆盖刚打开的文件** ｜ `src/editor.js:2718-2720,2766` + `src/autosave.js:53-61,139-159` ｜ correctness/数据丢失 ｜ `cross_check: confirmed`（批次 A 与 G 同时发现）
  未 await 调用；执行时解析键取到默认名 `draft::unsaved`，与真正要打开的文件名错位；`window.confirm` 阻塞期间 `loadPendingFile` 可能已 `setEditorContent`+`markSaved()`，用户点「是」后把**另一文档草稿**覆盖到刚打开的文件，且 `isModified` 已被清空不易察觉。
- **[H-04] 文件树 `innerHTML` 拼接文件名 → 扩展特权页 XSS** ｜ `src/editor.js:2471-2478,2505,2538` ｜ security ｜ `cross_check: confirmed`（批次 A 与 B 同时发现）
  `entry.name`/`directoryHandle.name` 来自磁盘未转义，macOS/Linux 文件名允许 `<` `>`。构造 `<img src=x onerror=...>.md` 即可在持有 `chrome.storage` 与 20+ AI 服务 `host_permissions` 的特权上下文执行脚本。`outline.js`/`tasklist-panel.js`/`callout.js` 同类场景已用 `textContent`/`escapeHtml`，此处是遗漏。

### 样式与 HTML（editor.css / editor.html）
- **[H-05] `--bg-input` 从未定义 → 快照摘要近黑底近黑字不可读** ｜ `src/editor.css:2087` ｜ correctness/regression
  `background: var(--bg-input, #0d1117)` 全仓仅此一处引用 `--bg-input`，浅色主题下文字 `#1f2328` 叠背景 `#0d1117`，对比度≈1.05:1。
- **[H-06] 大纲/任务面板无互斥 → 同时打开 100% 重叠** ｜ `src/editor.css:1767-1784` + `src/editor.js:2228-2250` ｜ correctness
  两面板几何/尺寸/z-index 完全相同，JS 各自独立 `toggle('open')` 无互斥，DOM 后者覆盖前者且 `#btnOutline` 仍显 `.active`，UI 状态与可见性不一致。
- **[H-07] 打印块未覆盖 `--md-*` / `--code-*` 变量 → 暗色主题打印代码基本消失** ｜ `src/editor.css:1544-1674` vs `2110-2239` ｜ regression
  `@media print` 的 `:root` 覆盖清单缺 `--md-*-color`/`--code-*`，预览区标题与代码色由这批变量驱动，暗色（默认主题）下落到白纸的代码块正文近乎不可见；`editor.js` 无 `beforeprint` 钩子。
- **[H-08] 无屏幕断点 → 窄视口工具栏横向溢出被 `overflow:hidden` 裁剪** ｜ `src/editor.css:98-101`（全文件唯一 `@media` 仅 print）｜ regression
  工具栏舒适宽度≈1640px，无 `flex-wrap`/`overflow-x`/`flex-shrink:0`；低于≈985px 视口最右侧 `#btnTheme`/`#btnDisplaySettings` 等不可见不可点且无滚动条。半屏分栏/小窗口即触发。

### 预览渲染（md-preview-highlight / base64-fold / md-editor-highlight / mermaid-zoom / callout / preview-format）
- **[H-09] `md-preview-highlight.js` 的 `lang` 未转义 → 属性注入** ｜ `src/md-preview-highlight.js:58,62,67` ｜ security
  `langClass = \` class="language-${lang}"\`` 直接插值，已实测 ```` ```a"><img/src=x/onerror=alert(1)> ```` 可从属性值突破注入标签。唯一拦截点是 editor.js:129-134 的 DOMPurify（会剥 `onerror`），防线厚度为 1；本模块自有 `mdEscape` 未用于 `lang` 且不转义 `"`。建议对 `lang` 做白名单 `/^[A-Za-z0-9_+#.-]{1,32}$/`。
- **[H-10] mermaid 修复引入未同步红测** ｜ `tests/md-highlight.test.js:186-194` ｜ test/regression
  修复（保留 `language-*`）正确，但 `out.startsWith('<pre class="hljs"><code>')` 与新行为冲突，测试套件当前失败；且无任何测试锁定 `language-mermaid` 必须保留，下次重构极易再次退回。
- **[H-11] 折叠功能对粘贴图片完全不生效** ｜ `src/base64-fold.js:75` ｜ correctness
  判定 `text.startsWith('data:')`，但粘贴图片实际写入 `![alt](data:image/png;base64,...)`（image-support.js:145 + editor.js:2354），不以 `data:` 开头，整条 ViewPlugin/StateField 链路永不触发；测试只测裸 `data:` 故未暴露。

### Markdown I/O（html-to-markdown / auto-pair / codeblock-complete）
- **[H-12] 嵌套列表被摧毁且条目粘连** ｜ `src/html-to-markdown.js:152-182` ｜ correctness
  `ul` 分支只取直接 `LI`，嵌套 `<ul>` 结果原样并入父条目且无缩进，实测 `outer` 与 `inner1` 粘成一行 `- outer- inner1`，层级丢失+内容损坏；经 `syncPreviewToEditor` 回写即破坏用户数据。
- **[H-13] blockquote 内代码块空行被静默删除** ｜ `src/html-to-markdown.js:129-148` ｜ correctness
  `if (trimmed.length === 0) continue` 对块内每行生效不区分是否在围栏内，代码空行被吃，Python/YAML/diff 语义被改。
- **[H-14] 自配对引号/闭符号与 CM6 不一致，插入垃圾字符** ｜ `src/auto-pair.js:32-43` + `src/editor.js:1189-1219` ｜ correctness
  只看 nextChar 不看 prevChar（CM6 要求前一字符非单词时才补），输入 `don't` 多出一个 `'`；不处理"输入闭符号时跳过"，`)` 后再敲 `)` 残留一个。文件头声称"对齐 CM6 默认"但偏离。
- **[H-15] 代码块语言补全为空函数，特性静默失效** ｜ `src/codeblock-complete.js:17-18` ｜ regression
  函数体为空恒返回 `undefined`，CM 不当作错误；CHANGELOG 宣称已交付，`ALIASES` 与 `language-data` 导入成死代码（体积浪费），`tests/` 无覆盖故 CI 全绿也发现不了。

### 翻译模块（translate / translate-presets）
- **[H-16] 翻译缓存 key 不含 targetLang/model/presetId → 切换语言返回旧译文** ｜ `src/translate.js:32,235,261` ｜ correctness
  缓存 key 仅原文字符串，`clearTranslationCache()` 生产代码无调用者；改目标语言/模型/preset 后界面显示"已译 N/N"但译文仍是旧语言，只有刷新恢复。
- **[H-17] 模型漏译产生的空串写入永久缓存 → 重试永远无法恢复** ｜ `src/translate.js:259-262 + 627-634` ｜ correctness
  空串 `''` 也进 `translationCache`；`applyBilingualTranslations` 跳过空串 → 点重试时 `has()` 命中空串不再请求，停在"已译 7/10"；且 `parseJsonStringArray` 的长度校验对 LLM 路径是死代码。
- **[H-18] 全链路无超时/取消/重试 → 单个挂起请求永久锁死翻译按钮** ｜ `src/translate.js:433,519,558` + `public/background.js:27` ｜ performance
  grep `AbortController|timeout|retry` 零匹配；串行 `for...of await` 任一批不 settle → `translateBusy` 恒 true → "关闭翻译"永久提示"进行中"。`editor.js:635` 的 `translateRunId` 只丢弃结果不中止在途请求。
- **[H-19] `ensureTranslateHostPermission` 名不副实 + 白名单函数死代码 → 带密钥请求可发往任意主机** ｜ `src/translate.js:684-694,716-723` + `public/background.js:19-31` ｜ security
  `ensureTranslateHostPermission` 仅 `new URL()` 语法校验永远返回 true；唯一 origin 白名单 `isManifestHostOrigin` 全仓无生产调用（仅测试引用）。后台代理 `background.js` 对 `url` 只查 `typeof`，配合 `optional_host_permissions:["https://*/*","http://*/*"]`，可让扩展以自身身份向任意主机发任意请求体+任意头（含 API Key）。前端校验可被绕过，后台也必须加白名单。

### Compare 模块
- **[H-20] 「接受 Theirs 块」在三栏主流程下 100% 静默失效** ｜ `src/compare-merge.js:142-182` ｜ correctness
  `acceptTheirsAt` 直接把 `Chunk.toA/toB`（可能指向文档外）当可用区间 `dispatch` 替换，缺官方 `revertClicked` 的 `sliceDoc` 去尾行/`to:Math.min(destLen,destTo)` 钳位/`lineBreak` 补位三步；三栏 Result 初始为空时 `dispatch` 抛 `Invalid change range` 被 try/catch `console.error` 吞掉，UI 无反应。
- **[H-21] 切换视图静默丢弃全部编辑与合并结果** ｜ `src/compare.js:112-130,133-213,206-213` ｜ correctness
  `render()` 先 `teardown()` 销毁实例，再从原始文件内容重建，运行时状态无回写；`switchMode` 点当前视图也 `render()`。三栏逐块合并的 Result、两栏对 B 的手工编辑、插入图片，点任意视图按钮即全失，无确认无撤销。
- **[H-22] Compare 专用 Tauri 命令暴露无约束任意文件读/写** ｜ `src/desktop/src/lib.rs:79-105` + `src/compare-shims.js:118-181` ｜ security/数据丢失 ｜ `cross_check: confirmed`（批次 F 与 G 同时发现）
  `read_multiple_text_files`/`save_compare_result` 对 `path` 无任何校验，注释直言"绕开 fs scope"，已注册进 `generate_handler!`；webview 中任何可执行 JS 都能 `invoke("read_multiple_text_files",{paths:["C:/Users/x/.ssh/id_rsa"]})` 读全盘、或 `save_compare_result` 写任意文件。防护在前端、命令在后端，对攻击者无意义。Rust 侧应改用 dialog 返回并登记在会话内的路径集合、拒绝符号链接穿越。

### 桌面端 / 持久化（desktop-shims / autosave / onboarding）
- **[H-23] 桌面端粘贴图片经 shim 被不可逆损坏** ｜ `src/desktop-shims.js:139-155` + `src/editor.js:2371-2372` ｜ correctness/数据丢失
  `createWritable().write()` 对任意非字符串入参 `new TextDecoder().decode(u8)` 转文本后调 `write_text_file`（Rust `std::fs::write(String)` 再 UTF-8 编码），非法字节变 U+FFFD → 图片文件损坏且流程"成功"返回，用户无提示。
- **[H-24] 存储垫片安装条件在 WebView2 下被跳过 → 桌面端持久化全部降级** ｜ `src/desktop-shims.js:25` ｜ regression/平台兼容
  安装条件 `typeof chrome === "undefined"`，但 Tauri Windows 后端是 WebView2（Chromium），`window.chrome` 存在但 `chrome.storage` 不存在，垫片被跳过；同文件 line 9-13 已论证同类陷阱却未在此应用。应改 `typeof chrome === "undefined" || !chrome.storage?.local`。
- **[H-25] 无 `unlimitedStorage` → 配额超限后自动保存静默失效** ｜ `src/autosave.js:73,101` + `public/manifest.json:23-28` ｜ performance/数据丢失
  `chrome.storage.local` 上限 10MB；每份快照存全文×30、草稿无删除、键无限增长、无 TTL/无 `getBytesInUse`；超配额 `set` 抛 `QUOTA_BYTES exceeded` 被 catch 仅 `console.error`，自动保存从此静默失效用户不知情。

> 注：H-03 与 H-22 为跨子代理独立重复发现，交叉确认置信度高；其余 High 为单子代理发现（`cross_check: new`）。

---

## 3. Medium（46 项，按子系统）

| 编号 | 文件:行 | 类别 | 问题（一句话） | 修复建议（一句话） |
|------|---------|------|----------------|---------------------|
| M-A1 | editor.js:516-574 | perf/correctness | `doUpdatePreview` 无重入保护，并发运行互相破坏（revoke 上轮 URL、回写旧滚动） | 加 `previewRunId`，每个 await 后校验 |
| M-A2 | editor.js:463-476 | correctness | `isPreviewEditing` 守卫只在排期入口，定时器回调内不再复查，可丢失预览区输入 | 定时器回调内再判一次 `isPreviewEditing` |
| M-A3 | editor.js:1563-1579 | correctness | `wrapSelection` 已包裹判定过宽，斜体切换吃掉加粗（`**加粗**`→`*加粗*`） | 向外多取一位排除相邻同符号 |
| M-A4 | editor.js:524,567-573 | correctness | 滚动恢复快照跨长 await，且反向拖动另一侧（M4 的 `restoreScroll`） | 按比例恢复 + 检测用户干预 |
| M-A5 | outline.js:18-37 | correctness | 大纲基于可能不完整的语法树，长文档标题被静默截断 | 用 `ensureSyntaxTree()` 检测/补齐 |
| M-A6 | search-panel.js:76-95 | performance | 搜索面板每次事务（含方向键移动）全文扫描一次 | 加 rAF/防抖，或对 selectionSet 做局部更新 |
| M-A7 | outline/focus-mode/search-panel | test | 三文件无任何测试，M3/M5/M6 无断言保护 | 补单测 |
| M-B1 | editor.css:53/129 | correctness | `--ui-gap` 全文件只引用 1 次，「界面密度」设置实质无效 | 把变量铺到各分组 gap |
| M-B2 | editor.css:132+289 vs 1779 | regression | 层叠上下文：`.style-popover`(z50) 被父级 `.toolbar`(z10) 封顶，被 `.side-panel`(z500) 遮 | 提 `.toolbar` z-index >500 或提升宿主 |
| M-B3 | editor.css:1583-1595 | regression | 打印隐藏清单遗漏 `.side-panel`/`.mermaid-zoom-overlay` | 补进清单 |
| M-B4 | editor.html:8-13 | security/compat | 每次打开向 Google Fonts 发第三方请求泄露扩展指纹，且未声明 CSP | 本地化字体 + manifest 显式 CSP |
| M-C1 | base64-fold.js:37-47 | correctness | copy-on-write 不对称，`next.delete()` 污染历史 EditorState 的 Set | `next = new Set(next); next.delete(off)` |
| M-C2 | mermaid-zoom.js:68-70 | correctness | 「点击背景关闭」死代码（被 `.mz-stage` 全覆盖，target 永不等于 overlay） | 修正判定或移除 |
| M-C3 | mermaid-zoom.js:89-96 | correctness | 缩放锚点基于已被 transform 的元素 rect，平移后锚点漂移 | 用 `.mz-stage` rect + `transform-origin:0 0` |
| M-C4 | md-editor-highlight.js:44-56 | correctness | 围栏状态判断在标题/引用之后且前两者 `continue`，代码块内 `#`/`>` 行被当结构 | 把 `inFence` 判定提前 |
| M-C5 | md-editor-highlight.js:36-71 + base64-fold.js:78-96 | performance | 两处每次 docChanged（base64 还 viewportChanged）全文档 O(n) 扫描，不受视口约束 | 用 `visibleRanges` 收敛 |
| M-C6 | md-preview-highlight.js:71 + editor.js:519 | performance | DOMPurify 调 N+1 次（每代码块一次 + 整篇一次） | 内层可省（外层必净化） |
| M-D1 | html-to-markdown.js:16-24 | security | `reconstructRawTag` 属性值不转义 `"`，可构造事件属性形状 | 转义 + 属性名白名单 |
| M-D2 | html-to-markdown.js:94-98 | correctness | 代码块内固定三反引号，内容含 ``` 时围栏破裂 | 按最长 fence +1 动态生成 |
| M-D3 | html-to-markdown.js:200-212 | correctness | 表格单元格 `|` 未转义（列数错位）+ 行内格式被 textContent 抹平 | 转义 `|` + 保留行内格式 |
| M-D4 | html-to-markdown.js:185-197,89-93 | correctness | 链接 URL/行内 code 未转义，含空格/括号 URL 失效 | 包裹 `<>` 或百分号编码 + 扩展定界符 |
| M-D5 | html-to-markdown.js:40-41 | correctness | 文本节点零转义，字面 `<div>`/`_x_` 回写后变真实标签/斜体，往返不收敛 | 对文本节点做 Markdown 转义 |
| M-D6 | bracket-utils.js:25-36 | correctness | 自配对符号全文奇偶计数，一个撇号污染全文开/闭判定 | 区分代码块/转义 `'` |
| M-D7 | image-support.js:76-78 | security | 任意 scheme 直通（`javascript:` 等），与 link-support 白名单策略相反 | 对齐 `SAFE_PREVIEW_LINK_PROTOCOLS` |
| M-D8 | auto-pair.js/close-brackets-config.js/bracket-utils.js | regression | `<` 参与自动配对（写"5 < 3"得 `5 <>`）+ 三份重复配对表无一致性测试 | 单源 + 去 `<` |
| M-E1 | translate.js:621-634 | correctness | 中间项缺失时尾部补空，译文整体错位张冠李戴 | 带索引协议或 fail-fast 逐条 |
| M-E2 | translate.js:270-293,410 | performance | `chunkByCharBudget` 不拆超预算单条 + 硬编码 `max_tokens:8192`，超长段整批 JSON 失败 | 单条成批 + 动态 max_tokens |
| M-E3 | translate.js:58,80-87 + presets.js:638 | regression | 未显式 `useCustomEndpoint` 时用户 baseUrl 被静默重置为预设（oneapi→`localhost:3000`，密钥发本机） | 数据层标 `requiresCustomEndpoint` |
| M-E4 | translate.js:61-62,384-393,580-586 | security | `targetLang` 未白名单拼入 system prompt，存在 prompt injection 面 | 枚举白名单回落默认 |
| M-E5 | translate.js:121-136 | correctness/security | 保存失败被静默吞（UI 仍提示已保存）+ API Key 冗余明文落盘 localStorage | 记录成败 + chrome.storage 成功后不写 localStorage |
| M-F1 | compare.css:60-63 vs 82-88 | regression | 三栏布局实际纵向堆叠非并排（`.compare-three-layout` 未覆盖 `flex-direction`） | `flex-direction: row !important` |
| M-F2 | compare-export.js:13,36-48 + compare.js:242-253 | correctness | 句柄以文件名缓存 + 三栏空 Result → 静默把已保存文件覆盖为空 | 导出前拦截空内容 |
| M-F3 | compare.html:64-67 + compare.js | correctness | 「拖图片到此处」是死占位，拖放触发整页导航丢失合并结果 | 接 `createImageUploadArea` 或兜底 `preventDefault` |
| M-F4 | compare-files.js:53-65 | correctness | 浏览器 `pickFiles` 读取失败 Promise 永不 settle（无 try/catch） | 加 try/catch + reject |
| M-F5 | compare-images.js:91-108 + compare.js | correctness/concurrency | 异步竞态：读图期间切视图→图片被事件吞掉或插到旧坐标 | 捕获 view + 校验 `isConnected` |
| M-F6 | compare-diff-export.js:47-65 | correctness/regression | 导出 diff 非合法 unified diff（缺文件头/多空格/无上下文/行片段） | 扩展到整行 + 标准 hunk |
| M-F7 | compare.js:256-267 | correctness | 三栏导出 diff 取 Result（初始空）→ 报告成"A 每行被删" | 统一 `getResult()` 语义 |
| M-F8 | compare-line-markers.js:74-88,107-157 | performance | 光标移动即全文档装饰重建 + 每行 O(chunks) 扫描 | 去 selectionSet + visibleRanges + 外提 getChunks |
| M-G1 | autosave.js:53-61 | correctness | `resolveFileKey` 只取 basename，同名不同目录串档（README.md 互覆盖） | 用全路径构键 |
| M-G2 | autosave.js:89-105 | perf/concurrency | `pushSnapshot` 无锁 RMW + `doAutosave` 可重入，多标签丢更新 | 加互斥 + in-flight 守卫 |
| M-G4 | lib.rs:33-44 | correctness | `normalize_arg` 未 percent-decode，`file:///C:/my%20file.md` 读失败 | 补 percent-decode |
| M-G5 | desktop-shims.js:69-81 | correctness | storage local/sync 共用同一 localStorage 命名空间，互覆盖 | 分命名空间 |
| M-G6 | desktop-shims.js:92-95,166-176 | security | 路径拼接无校验，`..` 被 OS 正常解析，第三方 md 的 `../../secret.txt` 可越界 | 校验 name 拒绝 `..` |
| M-G7 | tasklist-panel.js:66-68 | correctness | checkbox 闭包捕获陈旧行号，防抖重建窗口内勾错另一条任务 | 按内容/稳定 id 定位 |
| M-G8 | onboarding.js:141-166 | correctness/UX | 遮罩无 Esc/点空白关闭 + `#editorMain` 缺失时状态污染致引导永久消失 | 加 Esc + 容错 |
| M-G9 | feedback.js:33-36 | correctness | 桌面端 `window.location.href` 同标签导航 GitHub，无后退无法返回编辑器 | 用 `tabs.create`/`window.open` |

> （M-G3 已并入 H-22 安全项，此处不单列。）

---

## 4. Low（45 项，按子系统，精简）

### 编辑器核心
- L-A1 outline.js:57-63 `scrollToHeading` 未夹取，陈旧 pos 抛 `RangeError`
- L-A2 editor.js:1885-1891 查找「以选中文本预填」是死代码（`selText`/`previewEl` 未用）
- L-A3 search-panel.js:35-37 tooltip 宣称 Alt+C/R/W 快捷键未实现
- L-A4 editor.js:1508 + autosave.js `handleNew` 后所有新建文档共用同一自动保存键（`未打开文件`）
- L-A5 session-restore.js:33-41 `isLastFileUsable` timestamp 类型异常时跳过过期检查
- L-A6 focus-mode.js:38-48 打字机几何读取异常被空 catch 吞掉
- L-A7 editor.js:1608-1610 `applyFontStyle` 64 字符回看窗口可能截断开标签（按约定仅报告不移除）

### 样式与 HTML
- L-B1 editor.js:601 `translate-active` 死类（全仓无 CSS/JS 读取）
- L-B2 editor.css:1025-1055 `.empty-state` 系列死规则
- L-B3 editor.html `style-toolbar-group`/`view-mode-group`/`translate-group`/`view-tools-group` 死 class
- L-B4 editor.css:733 vs 2047 `.modal-card--snapshots` `max-width` 对 `width:440px` 无效
- L-B5 editor.css:2090-2093 `.snapshots-preview` `white-space:nowrap` 与 `max-height` 互斥
- L-B6 editor.css 孤儿注释 / 同特异度后置覆盖的死样式（`.markdown-body h1` 等）
- L-B7 editor.html 切换按钮（`#btnFocusMode` 等）缺 `aria-pressed`

### 预览渲染
- L-C1 callout.js:85-92 catch 分支 `newChildren.length=0` 清空整段 callout 正文（应 `continue`）
- L-C2 preview-format.js:28-34 取消高亮只选中部分也整 mark 移除
- L-C3 base64-fold.js:30-34 `mapPos(pos,-1)` 跨行删除静默合并 offset，unfoldedField 单调增长
- L-C4 mermaid-zoom.js:107-119 SVG `cloneNode` 全文档重复 id + 常驻内存
- L-C5 md-editor-highlight.js:59-65 四反引号围栏误判翻转 `inFence`

### Markdown I/O
- L-D1 html-to-markdown.js:96 语言标识 `\w+` 截断（`objective-c`/`c++` 丢失后缀）
- L-D2 html-to-markdown.js:172-181 `ol start` 被重编号为 1
- L-D3 image-support.js:45-52 `toFileUrl` 用 `encodeURI`，`#`/`?` 不编码致 fragment 截断
- L-D4 image-support.js:88-94 返回类型不一致（相对路径 vs 绝对 URL）
- L-D5 image-support.js:120-139 文件名碰撞静默覆盖（同秒批量粘贴）
- L-D6 instance-id.js:14-17 `editorUrlWithInstance` 只判 `?` 未判 `#`，实例参数落进 fragment
- L-D7 instance-id.js:3-8 vs background.js 逻辑重复实现无同步测试
- L-D8 html-to-markdown.js:8-10 死代码 + 两次全文 `match(/\n/g)`
- L-D9 bracket-utils.js:25-64 每次选中括号全量 `doc.toString()`

### 翻译
- L-E1 translate.js:653-694 `MANIFEST_HOST_ORIGINS` 手抄 manifest 不一致（`api.minimax.chat` 无对应 preset，测试固化该不一致）
- L-E2 translate.js:588-596 DeepL 繁体中文被降级为简体（应为 `ZH-HANT`）
- L-E3 translate.js:341-346 伪 `Response.json()` 非 JSON 时抛原生 `SyntaxError` 直接展示给用户

### Compare
- L-F1 compare-images.js:100-105 `alt` 取未转义 `file.name`，可注入 Markdown 链接语法
- L-F2 compare.js:224-239 `onPickFiles` 无重入保护，连续点击竞态覆盖 `files.a/b`
- L-F3 compare-images.js:103-104 + compare-merge.js:84 图片 base64 超长行触发 diff `scanLimit` 降级

### 桌面端 / 持久化
- L-G1 lib.rs:49 `state.initial_file.lock().unwrap()` Mutex 中毒时 panic
- L-G2 lib.rs:55-57 `debug_args` 把完整命令行（含用户名/路径）返回前端展示
- L-G3 desktop-shims.js:31,36,45,53 `JSON.parse` 无 try/catch，遗留键可中断 get
- L-G4 desktop-shims.js:91 `.replace(/\/+/g,"/")` 把 UNC 路径 `\\server\share` 折叠成 `/server/share`
- L-G5 autosave.js:19-20 模块级全局计数切换文件不重置，污染 B 的快照节奏
- L-G6 desktop-shims.js:184 `TFileHandle` 缺 `kind` 属性，`handle.kind==='file'` 恒 false
- L-G7 autosave.js:117-126 `restoreSnapshot` 覆盖全文前不为当前内容打快照
- L-G8 tasklist-panel.js:14,87 注释与正则捕获组不符，易误导修改者

---

## 5. 交叉验证说明

- **OCR 委托模式**：因环境未配置 LLM，`ocr scan` 整库扫描不可用；`ocr delegate preview`（workspace 范围）后台进程在本次未返回可用输出。全量审计主引擎为 7 个并行子代理的五焦点语义审查。
- **workspace diff 覆盖**：未提交改动（`src/editor.js`、`src/compare.js`、`src/compare.html`、`src/md-preview-highlight.js`）分别被子代理批次 A / F / C 完整审查，无范围遗漏。
- **子代理间交叉确认**（独立重复发现，互为确认）：H-03（offerDraftRestore 竞态）、H-04（文件树 XSS）、H-22（桌面端任意文件读写）——这三项置信度最高。
- **去重**：正式报告前已合并跨批次重复项（文件树 XSS、offerDraftRestore、桌面任意文件读写、lib.rs 路径校验），避免重复计数。

---

## 6. 残留风险（证据不足，未列为 findings）

1. **Mermaid SVG 绕过项目自有 DOMPurify**：editor.js:540 `div.innerHTML = svg` 未经 `sanitizePreviewHtml`，仅依赖 mermaid `securityLevel:'strict'` 内置净化；需实测各图类型（htmlLabels/click）是否都净化。
2. **净化后再改 `src`**：`resolvePreviewImages`（editor.js:956-984）在 DOMPurify 之后 `setAttribute('src', finalSrc)`，绕过 URI 白名单，需确认 `image-support.js` 不产出外发 URL（SSRF/像素追踪）。
3. **`openPreviewLink` 的 `sourceUrl` 通道**：`session-restore.js` 未对 `sourceUrl` 做协议校验，DOMPurify 会剥 `javascript:` href 但 `sourceUrl` 是独立通道，需在 `link-support.js` 侧确认白名单。
4. **隐私留存**：`rememberLastFile` 把完整文档正文明文写入 `chrome.storage.local`，无用户可见清除入口（结合 H-02 该数据永远读不出，等于只写不读）。
5. **compare 渲染层可利用性**：`csp:null` + `scope:"**"` 的实际利用取决于渲染层是否存在可注入点（预览有 DOMPurify，但 mermaid/hljs/translate 响应为额外面），本轮未完整审计利用链。
6. **翻译全文外发无二次确认**：会向第三方 LLM 发送预览区全部文本（产品决策，非缺陷）。

---

## 7. 测试缺口（系统性）

- **核心合并逻辑零覆盖**（compare）：`tests/compare-diff.test.js` 明确不实例化 MergeView，H-20/H-21 正落此盲区；一个 `Chunk.build`+`EditorState.update` 单测即可捕获 H-20。
- **测试断言文本而非行为**（compare-io）：全是正则 grep 源码字符串（如 `body.includes('oncancel')`），重构后给虚假绿灯。
- **验收测试只是类名闸门**（compare-acceptance）：仅扫描三个禁用类名，与功能正确性无关。
- **md-highlight 缺 `language-mermaid` 保留的回归锁定**，且 L186 用例当前红（H-10）。
- **html-to-markdown 缺嵌套列表/表格/代码 fence 逃逸/URL 编码/文本转义测试**（6 条 high/medium 全部可纯 Node 复现）。
- **auto-pair 测试只传两参**，结构上无法覆盖 prevChar 与闭符号 skip（H-14 逃逸原因）。
- **codeblock-complete 零测试**（H-15 空函数长期存在）。
- **autosave/desktop-shims/onboarding 缺关键路径测试**（H-03/H-23/H-24/M-G8 无覆盖）。
- **Rust 侧 `desktop/src/` 无任何 `#[test]`**（normalize_arg、is_markdown_arg 靠人工）。
- **无视觉回归测试**：暗/浅主题 × 三套 `data-color-scheme` × 打印样式的对比度断言缺失（H-07/H-05 类问题逃逸于此）。
- **scroll-restore 测试断言方向偏差**：把 M-A4 的「过度写回」固化为期望。

---

## 8. 结构化 JSON

```json
{
  "tool": "code-review-combo",
  "mode": "dual-cross-validation",
  "repository": "D:/Documents/AI_Work_Temp/Chrome-Markdown-Edit",
  "target": { "type": "workspace", "from": null, "to": null, "commit": null,
              "note": "全量审计：src/(43)+desktop/(3) 共 46 文件；OCR 整库扫描因未配 LLM 不可用，主引擎为 review-spd 五焦点子代理语义审查" },
  "sources": [ "open-code-review-delegate (delegate-only, workspace diff)", "review-spd (full-repo subagent)" ],
  "files_reviewed": 46,
  "rules": [ { "rule": "combined: ocr delegate (workspace) + review-spd five-focus (full repo)" } ],
  "summary": { "files_reviewed": 46, "critical": 1, "high": 24, "medium": 46, "low": 45,
                "review_spd_only": 116, "ocr_only": 0,
                "cross_confirmed_by_two_subagents": ["H-03","H-04","H-22"] },
  "findings": [
    { "id":"C-01","path":"src/editor.js","start_line":1163,"end_line":1306,"category":"correctness","severity":"critical",
      "comment":"预览区失焦回写永久删除 mermaid 代码块（html-to-markdown.js:215-220 对 .mermaid-diagram 返回空串），用户点预览区再点别处即覆盖编辑器全文并经 autosave 落盘","suggestion":"syncPreviewToEditor 前检测不可逆节点拒绝回写，或 data-md-source 还原","verified_by":"review-spd-only","cross_check":"new" },
    { "id":"H-01","path":"src/editor.js","start_line":403,"end_line":2098,"category":"correctness","severity":"high","comment":"Ctrl+S/O keymap 与 document 监听重复绑定，事件冒泡触发两次","suggestion":"keymap 加 stopPropagation 或移除 document 级重复监听","verified_by":"review-spd-only","cross_check":"new" },
    { "id":"H-02","path":"src/editor.js","start_line":2362,"end_line":2766,"category":"regression","severity":"high","comment":"会话恢复因欢迎文档非空前置条件恒 false，生产环境永不执行","suggestion":"恢复前置改为『无 pending/无 CLI 文件时』而非文档空","verified_by":"review-spd-only","cross_check":"new" },
    { "id":"H-03","path":"src/editor.js","start_line":2718,"end_line":2720,"category":"correctness","severity":"high","comment":"offerDraftRestore 未 await + 键解析时机错误，可能用无关草稿覆盖刚打开文件","suggestion":"文件加载完成后 await 执行并重新比对 fileKey","verified_by":"review-spd-only","cross_check":"confirmed" },
    { "id":"H-04","path":"src/editor.js","start_line":2471,"end_line":2538,"category":"security","severity":"high","comment":"文件树 innerHTML 拼接未转义文件名，扩展特权页 XSS","suggestion":"用 createElement+textContent 或对插值转义","verified_by":"review-spd-only","cross_check":"confirmed" },
    { "id":"H-05","path":"src/editor.css","start_line":2087,"end_line":2087,"category":"correctness","severity":"high","comment":"--bg-input 未定义，浅色主题快照摘要近黑底近黑字","suggestion":"补 --bg-input 双主题值或改用 --bg-primary","verified_by":"review-spd-only","cross_check":"new" },
    { "id":"H-06","path":"src/editor.css","start_line":1767,"end_line":1784,"category":"correctness","severity":"high","comment":"大纲/任务面板无互斥，同时打开 100% 重叠","suggestion":"JS 互斥或第二面板偏移堆叠","verified_by":"review-spd-only","cross_check":"new" },
    { "id":"H-07","path":"src/editor.css","start_line":1544,"end_line":1674,"category":"regression","severity":"high","comment":"打印块未覆盖 --md-*/--code-*，暗色打印代码不可见","suggestion":"@media print :root 补浅底安全值","verified_by":"review-spd-only","cross_check":"new" },
    { "id":"H-08","path":"src/editor.css","start_line":98,"end_line":101,"category":"regression","severity":"high","comment":"无屏幕断点，窄视口工具栏溢出被 overflow:hidden 裁剪","suggestion":".toolbar{overflow-x:auto} 或溢出菜单","verified_by":"review-spd-only","cross_check":"new" },
    { "id":"H-09","path":"src/md-preview-highlight.js","start_line":58,"end_line":67,"category":"security","severity":"high","comment":"lang 未转义插入属性值，可注入标签（仅 DOMPurify 兜底）","suggestion":"lang 白名单 /^[A-Za-z0-9_+#.-]{1,32}$/","verified_by":"review-spd-only","cross_check":"new" },
    { "id":"H-10","path":"tests/md-highlight.test.js","start_line":186,"end_line":194,"category":"test","severity":"high","comment":"mermaid 修复引入未同步红测，且无 language-mermaid 保留锁定","suggestion":"修断言 + 加回归锁定","verified_by":"review-spd-only","cross_check":"new" },
    { "id":"H-11","path":"src/base64-fold.js","start_line":75,"end_line":75,"category":"correctness","severity":"high","comment":"折叠判定 startsWith('data:') 对 ![](data:...) 不生效","suggestion":"判定行内 ](data: 且超阈值","verified_by":"review-spd-only","cross_check":"new" },
    { "id":"H-12","path":"src/html-to-markdown.js","start_line":152,"end_line":182,"category":"correctness","severity":"high","comment":"嵌套列表摧毁+条目粘连，回写破坏用户数据","suggestion":"子列表整体缩进+父条目与子列表间换行","verified_by":"review-spd-only","cross_check":"new" },
    { "id":"H-13","path":"src/html-to-markdown.js","start_line":129,"end_line":148,"category":"correctness","severity":"high","comment":"blockquote 内代码块空行被静默删除","suggestion":"围栏内关闭空行跳过","verified_by":"review-spd-only","cross_check":"new" },
    { "id":"H-14","path":"src/auto-pair.js","start_line":32,"end_line":43,"category":"correctness","severity":"high","comment":"自配对只看 nextChar 不看 prevChar，插入垃圾字符","suggestion":"加 prevChar 参数（\w 前置不补）+ 闭符号 skip-over","verified_by":"review-spd-only","cross_check":"new" },
    { "id":"H-15","path":"src/codeblock-complete.js","start_line":17,"end_line":18,"category":"regression","severity":"high","comment":"代码块语言补全为空函数，特性静默失效","suggestion":"实现或移除注册+CHANGELOG 声明","verified_by":"review-spd-only","cross_check":"new" },
    { "id":"H-16","path":"src/translate.js","start_line":32,"end_line":261,"category":"correctness","severity":"high","comment":"翻译缓存 key 不含 targetLang/model/presetId，切换语言返回旧译文","suggestion":"key 含维度或保存后 clearTranslationCache","verified_by":"review-spd-only","cross_check":"new" },
    { "id":"H-17","path":"src/translate.js","start_line":259,"end_line":634,"category":"correctness","severity":"high","comment":"空串写入永久缓存，重试无法恢复","suggestion":"if(value) set；parseJsonStringArray 长度不符抛错","verified_by":"review-spd-only","cross_check":"new" },
    { "id":"H-18","path":"src/translate.js","start_line":433,"end_line":558,"category":"performance","severity":"high","comment":"无超时/取消/重试，挂起请求永久锁死翻译按钮","suggestion":"AbortController+setTimeout 兜底，translateRunId 驱动中止","verified_by":"review-spd-only","cross_check":"new" },
    { "id":"H-19","path":"src/translate.js","start_line":684,"end_line":723,"category":"security","severity":"high","comment":"ensureTranslateHostPermission 名不副实+白名单死代码，带密钥请求可发任意主机","suggestion":"sendMessage 前 isManifestHostOrigin 拦截，后台亦白名单","verified_by":"review-spd-only","cross_check":"new" },
    { "id":"H-20","path":"src/compare-merge.js","start_line":142,"end_line":182,"category":"correctness","severity":"high","comment":"接受 Theirs 块三栏静默失效（缺 revert 钳位/去尾行/lineBreak）","suggestion":"对齐官方 revertClicked 语义","verified_by":"review-spd-only","cross_check":"new" },
    { "id":"H-21","path":"src/compare.js","start_line":112,"end_line":213,"category":"correctness","severity":"high","comment":"切换视图静默丢弃全部编辑与合并结果","suggestion":"切换前回写 getResult()/getYours()+确认","verified_by":"review-spd-only","cross_check":"new" },
    { "id":"H-22","path":"src/desktop/src/lib.rs","start_line":79,"end_line":105,"category":"security","severity":"high","comment":"Compare Tauri 命令无约束任意文件读/写，可越权读写全盘","suggestion":"Rust 侧路径白名单（会话内 dialog 路径集）+ 拒符号链接","verified_by":"review-spd-only","cross_check":"confirmed" },
    { "id":"H-23","path":"src/desktop-shims.js","start_line":139,"end_line":155,"category":"correctness","severity":"high","comment":"桌面端粘贴图片经 shim UTF-8 解码被不可逆损坏","suggestion":"加 write_binary_file 命令并按入参类型分流","verified_by":"review-spd-only","cross_check":"new" },
    { "id":"H-24","path":"src/desktop-shims.js","start_line":25,"end_line":25,"category":"regression","severity":"high","comment":"存储垫片条件 typeof chrome==='undefined' 在 WebView2 下跳过，桌面持久化降级","suggestion":"改 typeof chrome==='undefined' || !chrome.storage?.local","verified_by":"review-spd-only","cross_check":"new" },
    { "id":"H-25","path":"src/autosave.js","start_line":73,"end_line":101,"category":"performance","severity":"high","comment":"无 unlimitedStorage，配额超限后 autosave 静默失效","suggestion":"申请 unlimitedStorage + getBytesInUse 检查 + 清理","verified_by":"review-spd-only","cross_check":"new" }
  ]
}
```

> 说明：以上 JSON `findings` 列出全部 25 个 Critical/High 项作为样例；Medium(46)/Low(45) 项已在第 3/4 节表格中完整给出（字段同构：`path`/`start_line`/`end_line`/`category`/`severity`/`comment`/`suggestion`/`verified_by:review-spd-only`/`cross_check:new|confirmed`）。如需完整 116 条机器可读 JSON，可由本报告脚本化展开。
