# Changelog

All notable changes to this project are documented in this file.

Format based on Keep a Changelog.
Project uses Semantic Versioning.

## [1.4.5] - 2026-07-26

### Fixed

- **根因修复：把 `desktop-shims.js` 真正打进 vite bundle**。上一版修了 `withGlobalTauri` 之后 EXE 仍只显示初始界面、且无任何 toast。定位发现：`src/editor.html` 里 `<script type="module" src="./desktop-shims.js">` 在 vite 构建时被**静默删除**（HTML 中未列入 rollup entry 的外部脚本会被丢弃），导致 `dist/assets/editor.js` 里**完全没有 TFileHandle / showOpenFilePicker 垫片**；`openFileByPath` 内 `window.__tauriFileHandle` 始终为 `undefined`，命中 `if (typeof factory !== 'function') return;` 静默退出 → 双击打开路径整条全静默失败。修复：
  - `src/editor.js` 顶部 `import './desktop-shims.js';`（vite 会把它视为编辑器依赖打包进 bundle）
  - `src/editor.html` 同步移除外置 `<script>` 标签，避免重复执行
  - `src/desktop-shims.js` 自身未改

## [1.4.4] - 2026-07-25

### Added

- 样式工具栏 v1.4.4：重选替换 / 智能取消 / 记忆上次选择（领先代码 c39e3be）
- **桌面端独立 EXE 支持（Tauri）**：
  - 新增 `desktop/` 桌面壳，用 Rust + Tauri 把同一套 Web 源码（`src/`）打包为独立 Windows EXE（nsis `setup.exe` + `.msi`）
  - 新增 `src/desktop-shims.js`：桌面端提供 `chrome` 垫片（会话恢复 / 翻译设置持久化）+ File System Access API polyfill（映射原生文件对话框）；在 Chrome 扩展内自动跳过，对扩展零影响
  - Tauri 窗口入口直接指向 `src/editor.html`（此前经 `src/index.html` 重定向，现已改为直连）
  - `vite.config.js` 增加 index 构建入口；根 `package.json` 增加依赖 `@tauri-apps/api`、`@tauri-apps/plugin-dialog`、`@tauri-apps/plugin-fs`
  - 桌面端支持「双击 .md 文件用 EXE 打开」：把 .md 设为默认程序后，双击文件会以 `EXE "路径.md"` 启动；桌面壳读取该命令行参数，前端初始化时通过 `invoke('get_initial_file')` 取路径并打开，文件读写由 Rust 命令（`read_text_file`/`write_text_file`，`std::fs`，无作用域限制）完成，保存可写回原文件；采用多实例，每次双击启动独立 EXE 实例打开各自文件
- 远端编译：`desktop-build.yml` 在 GitHub `windows-latest` 用 Rust + Tauri 构建 EXE

### Changed

- 将桌面壳合并进 `main`，与领先代码 v1.4.4 同仓同 CI

### CI / 自动化

- 打 `v*` 标签（如 `v1.4.5`、`v1.5.0`）会**同时触发** `ci.yml`（扩展 zip）与 `desktop-build.yml`（EXE），一次打标签自动同时产出扩展和 EXE；构建 100% 在 GitHub 云端，**本地零安装**
- `v1.4.4` 的 EXE 交付物见 Release `v1.4.4-desktop`

### Notes

- EXE 体积约 2.5–3 MB，依赖系统 WebView2 运行时（未打包运行时）
- 未签名版本首次运行会被 Windows SmartScreen 拦截，需手动允许
- 已清理无用分支 `feat/tauri-desktop`（已合入 main）

### Fixed

- **修复双击 .md 用 EXE 打开无效**：原实现依赖前端→Rust 的 `frontend-ready` 事件握手 + Rust→前端的 `open-file` 事件转发，事件未能稳定触发，导致 EXE 只显示初始界面、不打开文件。
  - 改为命令式：前端初始化时直接 `invoke('get_initial_file')` 取启动命令行里的 .md 路径，再用 `openFileByPath` 打开；时序更简单稳定。
  - 文件读写从「Tauri fs 插件（受作用域限制）」改为 **Rust 命令 `read_text_file` / `write_text_file`（`std::fs`，无作用域限制）**，彻底绕开 fs 插件对绝对路径的限制，保存可写回原文件。
  - **移除单实例插件**，改为多实例：每次双击 .md 启动独立 EXE 实例并打开对应文件，避免“已运行时再双击被转发/被拦”的复杂性。
- **双击打开诊断与加固（排查中）**：`openInitialCliFile` 现在把 `invoke` 异常与「未检测到参数时的原始 argv」用 toast 显示出来，便于定位「Windows 文件关联到底有没有把路径传给 EXE」；Rust 侧 `normalize_arg` 兼容外层引号与 `file://` 形式，`get_initial_file` 在解析前先归一化。
- **根因修复：开启 `app.withGlobalTauri`**：`tauri.conf.json` 此前未设置 `withGlobalTauri`，Tauri 不会把 `window.__TAURI_INTERNALS__` 注入 webview。而桌面端全部守卫（`desktop-shims.js` 的 `isTauri` 判定、`editor.js` 的 `openInitialCliFile` 守卫）以及 `@tauri-apps/api` 的 `invoke` 都依赖该全局 → 整个桌面代码路径被静默短路（双击 .md 只显示初始界面、**且连诊断 toast 都不弹**）。现已开启 `withGlobalTauri: true`，并把窗口入口从 `src/index.html`（重定向）直接指向 `src/editor.html`，消除 `location.replace` 跨文档导航可能带来的全局丢失风险。

## [1.4.3] - 2026-07

### Fixed

- 修复打印多页只输出可视区一屏的 BUG（commit 2d9e5b9）

## [1.4.2] - 2026-07-14

### Added

- Reading-time bilingual translation in the preview pane (does not modify Markdown source)
- Toolbar toggle + settings: pick a service preset, paste API Key only
- Default preset: MiniMax Token Plan · Anthropic (`sk-cp-` key, `/anthropic/v1/messages`)
- Dual protocol for MiniMax / StepFun Token Plans (Anthropic Messages + OpenAI-compatible)
- Built-in presets: OpenAI / DeepSeek / Gemini / Groq / Mistral, Kimi / Qwen / 智谱 / 豆包, MiniMax · StepFun, OpenRouter · 硅基流动 · AiHubMix · 302.AI · API2D · CloseAI · Together · Fireworks · OneAPI, DeepL Free/Pro, custom endpoints
- Preset base URLs and model IDs verified via Context7 against official docs (2026-07-13)
- Background service-worker proxy for translation fetch (avoids CORS on `x-api-key` / Anthropic headers)
- Per-segment translation cache and progress status
- Visible build stamp (`v1.4.2`) in the toolbar and page title

### Fixed

- Do not call `chrome.permissions.request` on the translate path (false "未授权" after async gaps)
- MiniMax Anthropic Token Plan calls go through the SW proxy with correct headers

### Notes

- Translation sends document text to the provider you configure; keep that in mind for private docs
- After upgrade, reload the extension at `chrome://extensions` and close old editor tabs

## [1.3.1] - 2026-07-13

### Changed

- Removed the jarring HTML style-preset toolbar (居粗 / 居红 / 字号等); keep the editor chrome calm
- Startup + toolbar **?** open a real short user manual; example file is a full 说明书

### Kept

- Multi-instance tabs, session restore, local images, preview HTML round-trip for people who type tags in Markdown

## [1.3.0] - 2026-07-13

### Added

- Multi-instance editors: each toolbar click / each local `.md` open gets its own tab (`?i=` + per-instance storage keys) — thanks [@zhangweildlh](https://github.com/zhangweildlh) (PR #4 / Issue #3)
- Style toolbar: center/bold/color, highlight, font face/size presets; superscript and subscript
- Session restore: reopen the extension restores last edited content and filename (Issue #2; FileSystemHandle cannot persist, so Save may ask for a path again)
- Richer first-run help tips for common Markdown / HTML snippets

### Fixed

- Preview WYSIWYG round-trip: normalize extra blank lines and preserve `<mark>/<center>/<font>/<span>/<sup>/<sub>` when syncing back to source (helps Issue #1 path/style corruption)
- Local image preview and original `src` preservation remain in place from 1.2.0 (Issue #1)

### Changed

- Extension and package version aligned to **1.3.0**

## [1.2.0] - 2026-07-13

### Added

- Local image preview for relative paths when a folder or `file://` context is available
- Paste image into the editor: writes to sibling `images/` when folder write access exists, otherwise embeds a data URL
- First-run onboarding overlay (drag file / open folder / open example)
- Feedback entry in the status bar linking to GitHub Issues
- Reproducible icon pipeline (`npm run icons`) and Markdown-recognizable toolbar icons
- Unit tests for image path resolution and preview link safety (`npm test`)
- Pack script: `npm run pack` builds and produces `chrome-md-editor-v*.zip` with a nested `dist/` folder

### Fixed

- Preview-pane links open reliably while the preview stays contenteditable for WYSIWYG
- Preserve original Markdown image sources when syncing WYSIWYG preview back to source (avoids writing blob URLs into the document)
- Addresses user report of local images not rendering and path corruption after preview edit (see GitHub Issue #1; please re-test on 1.2.0 before closing)

### Changed

- README quick start and installation guidance oriented around GitHub Releases
- Aligned `package.json` version with `manifest.json` at **1.2.0**

### Notes

- GitHub previously only published **v1.0.0** while `main` already contained the above work. This release closes that distribution gap.
- There was no separate public **v1.1.0** tag. DEVLOG mentions 1.1.0 during content-script work; that stream is included here under 1.2.0.

## [1.0.0] - 2026-02-28

### Added

- Initial Chrome extension (Manifest V3) Markdown editor
- CodeMirror 6 source editing, markdown-it preview, Mermaid diagrams
- WYSIWYG editing in the preview pane
- File System Access open/save and project folder sidebar
- `file://` content script intercept for local `.md` files
- Light/dark themes and split / editor / preview layouts
