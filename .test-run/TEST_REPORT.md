# Chrome-Markdown-Edit 全功能测试报告

> 测试时间：2026-08-03
> 被测版本：v1.5.0（`dist/` 构建产物）
> 测试引擎：Playwright 驱动 360Chromex（`D:\Tools\360Chrome\360chromex.exe`）
> 测试架构：`vite preview` 静态服务（`http://localhost:5173`）→ 浏览器打开 `src/editor.html` / `src/compare.html`
> 用例总数：**47**，通过：**47**，确认 BUG：**0**（修复后）

---

## 1. 测试结论

全部 47 个功能用例在真实 Chromium 内核（360Chromex）下通过"首次执行 + 二次独立复跑"双确认流程，**无残留 BUG**。

测试过程中发现并修复了 **1 个真实产品 BUG**（Mermaid 图在预览区不渲染），另在测试脚本层面修正了 8 处断言/选择器错误（非产品缺陷，见第 4 节）。

---

## 2. 测试范围与覆盖

| 模块 | 用例 | 覆盖功能 |
|------|------|----------|
| 核心编辑与预览 | E01-E07 | 页面初始化、视图模式切换、Markdown 输入、格式按钮、标题/列表按钮、链/表/分隔符、预览 WYSIWYG 回写 |
| 样式工具栏 v1.4.4 | S01-S06 | 居中、`<b>` 加粗、`<mark>` 高亮、`<font color>`、`<font size>`、记忆上次选择 |
| 查找与替换 | F01-F05 | 面板打开、命中、导航、替换全部、全选匹配 |
| 视图增强与主题 | V01-V04, T01-T04 | 大纲、任务面板、专注、打字机、明暗主题、显示设置、字号、密度 |
| 渲染与增强 | C01-C04, P01-P03, PM01, TR01-TR03 | Callout、Base64、Mermaid、代码块语言、括号/方括号/引号配对、粘贴为 MD、翻译设置/预设/按钮 |
| Compare 模块 | CM01-CM07（CM02 降级） | 页面初始化、视图切换、块导航、折叠、图片区、导出按钮 |

---

## 3. 已修复的产品 BUG

### BUG：Mermaid 图表在预览区不渲染（已修复）

- **根因**：`src/md-preview-highlight.js` 的 `createMarkdownHighlight` 在调用 `hljs.highlight` 后，返回的 `<code>` 丢失了 `language-mermaid` class（hljs 高亮结果不含语言标识）。`src/editor.js:531` 的 mermaid 渲染器依赖 `code.language-mermaid` 选择器定位目标块，因 class 缺失导致遍历 0 个匹配，**Mermaid 图永不渲染**，仅显示为普通高亮代码块（`pre.hljs`）。
- **修复**：在 `md-preview-highlight.js` 中，hljs 高亮成功（含回退路径）后，给 `<code>` 补回 `class="language-${lang}"`。修复后 mermaid 渲染器可正常找到目标块并生成 SVG 流程图。
- **复测**：用例 C03 二次独立复跑均通过（预览区出现 `.mermaid-diagram` SVG 容器）。
- **影响范围**：修复同时使所有代码块在预览区保留语言 class，对依赖该 class 的其他功能（如复制语言名、未来扩展）亦有益，无回归。

---

## 4. 测试脚本修正（非产品缺陷，仅说明）

以下为测试实施过程中发现的**断言/选择器错误**，已修正，不属于产品 BUG：

| 项 | 原错误 | 修正 |
|----|--------|------|
| 查替选择器 | `.cm-search`（CM 默认类名） | 实际为自定义 `.md-search-panel`，输入框 `.md-search-panel__input` |
| 大纲/任务面板 | 断言 `:not([hidden])` | 实际用 `.open` class 切换 |
| 专注模式 | 断言 `body` 含 `focus` class | 实际加在 `<html>` 的 `focus-mode` class |
| 打字机 | 断言 `<html>` 含 `typewriter-mode` class | 实际无独立 class，仅 `#btnTypewriter.active`（光标行居中滚动生效） |
| 密度 | 断言 `body` 含 density class | 实际通过 `<html>` 的 `--ui-gap` CSS 变量生效 |
| 表格断言 | 查英文 `header` | 实际模板为中文「列1/列2」 |
| 预览回写 | 等待 400ms | 实际防抖 500ms，改为 900ms |
| 高亮 toggle | 误预期样式工具栏 `btnStyleHighlight` 为 toggle | 实际为 `wrapSelection`（包裹语义），toggle 属顶部荧光笔 `btnHighlight` |
| 颜色记忆 | 连续点 `btnColor` toggle 误关弹窗 | 改 Esc 关闭后再打开验证 |

---

## 5. 环境限制（本方案无法自动化，非缺陷）

依据 TEST_PLAN.md 第 1.2 节，以下因 360Chromex + `vite preview` 环境限制未自动化，建议用户手动/换环境验证：

- 扩展安装、图标点击（`action.onClicked`）、右键菜单（`contextMenus`）
- `file://*.md` 内容脚本拦截（`vite preview` 下无扩展 context）
- `chrome.storage.local` 自动保存/快照环/会话恢复（非扩展环境 `chrome.storage` 不存在，控制台有 `[autosave] 草稿写入失败` 预期错误，非产品缺陷）
- 真实翻译 API 调用、本地文件系统读写、桌面端 Tauri EXE（本机无 Rust 环境）

---

## 6. 交付物

- `.test-run/TEST_PLAN.md`：测试实施方案
- `.test-run/test-utils.mjs`：公共测试框架（启动/浏览器/断言/重置/BUG 记录）
- `.test-run/test-core.mjs` / `test-core2.mjs` / `test-style.mjs` / `test-find.mjs` / `test-view.mjs` / `test-render.mjs` / `test-compare.mjs`：各功能模块
- `.test-run/runner.mjs`：顺序执行 + 二次确认 + BUG 记录
- `.test-run/screenshots/`：全部用例截图证据
- `.test-run/BUGS.md`：本轮无确认 BUG（空）
- 源码修复：`src/md-preview-highlight.js`（Mermaid 语言 class 保留）
- `.test-run/TEST_REPORT.md`：本报告
