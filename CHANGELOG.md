# Changelog

All notable changes to this project are documented in this file.

Format based on Keep a Changelog.
Project uses Semantic Versioning.

## [1.4.4] - 2026-07-25

### Added

- 样式工具栏 v1.4.4：重选替换 / 智能取消 / 记忆上次选择（领先代码 c39e3be）
- **桌面端独立 EXE 支持（Tauri）**：
  - 新增 `desktop/` 桌面壳，用 Rust + Tauri 把同一套 Web 源码（`src/`）打包为独立 Windows EXE（nsis `setup.exe` + `.msi`）
  - 新增 `src/desktop-shims.js`：桌面端提供 `chrome` 垫片（会话恢复 / 翻译设置持久化）+ File System Access API polyfill（映射原生文件对话框）；在 Chrome 扩展内自动跳过，对扩展零影响
  - 新增 `src/index.html` 重定向入口供 Tauri 加载
  - `vite.config.js` 增加 index 构建入口；根 `package.json` 增加依赖 `@tauri-apps/api`、`@tauri-apps/plugin-dialog`、`@tauri-apps/plugin-fs`
  - 桌面端支持「双击 .md 文件用 EXE 打开」：把 .md 设为默认程序后，双击文件会以 `EXE "路径.md"` 启动；桌面壳读取该命令行参数，等前端就绪后通过事件转发，由 FS Access 垫片按路径读取并加载进编辑器（保存可直接写回原文件）；并接入单实例插件，已运行时再双击另一 .md 会转发到主窗口而非新开进程
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
