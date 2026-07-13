# Markdown Editor (Chrome Extension)

**Current release: [v1.3.0](https://github.com/yishu-ziyu/chrome-md-editor/releases/tag/v1.3.0)** · Load the extracted `dist/` folder in Chrome (not the repo root).

🌟 **Welcome friends from Xiaohongshu (小红书) and sspai (少数派)!** If you find this extension helpful, please consider giving it a Star ⭐️

> **在浏览器里直接编辑本地 Markdown 文件，无需上传、无需服务器。**
> Edit local Markdown files directly in Chrome — no upload, no server required.

## 快速预览 / Quick Preview

<!-- TODO: 在此处插入 demo GIF，展示扩展的核心使用流程。
     建议格式：GIF 或 WebM，宽度 800px 左右，总时长 8-15 秒。
     录制内容建议：拖入 .md 文件 → 侧边栏切换文件 → 粘贴图片 → 预览区直接编辑。
     工具推荐：ScreenFlow / Kap / Chrome 内置录屏。 -->

![Demo GIF coming soon](https://via.placeholder.com/800x450/1a1a2e/ffffff?text=Demo+GIF%3A+Drag+.md+file+%E2%86%92+Edit+%E2%86%92+Paste+image+%E2%86%92+Preview)

A clean, efficient, and locally-hosted Markdown editor extension for Google Chrome. / 这是一个简洁、高效的且支持本地部署的 Markdown 编辑器 Chrome 扩展。

[English](#english) | [中文说明](#%E4%B8%AD%E6%96%87%E8%AF%B4%E6%98%8E)

---

## English

### Features

- **Direct File Editing:** Drag and drop any `.md` file into Chrome to automatically open and edit it.
- **Project File Browser:** Built-in sidebar to browse your local project structures and quickly switch between Markdown files.
- **Local Image Preview:** Renders relative local image paths when a Markdown file is opened from a folder or a `file://` drag-open flow.
- **Paste Images:** Paste screenshots or clipboard images directly into Markdown; the editor saves them into `images/` when folder write access is available, otherwise it falls back to embedded data URLs.
- **Mermaid Diagram Support:** Automatically renders ` ```mermaid ` code blocks into beautiful SVG diagrams.
- **WYSIWYG Preview:** Click and edit directly within the rendered preview pane – changes automatically sync back to the source code.
- **Real-time Preview:** Split-pane layout with independent scrolling and synchronized viewing for GitHub Flavored Markdown (GFM).
- **Themes & Layouts:** Supports Light and Dark modes. Choose between Split, Editor-only, or Preview-only layouts.
- **No Uploads Required:** Runs entirely locally using Chrome's File System Access API. Your files never leave your computer.
- **Multiple Instances:** Click the toolbar icon as many times as you like — each click opens a new, independent editor tab (no more single-tab limit). Every opened `.md` file is routed to its own instance via a per-instance storage key.
- **Style Toolbar Buttons:** One-click insert of *Centered+Bold*, *Centered+Bold+Red*, *Centered+Bold+Blue*, *Text Highlight*, *Highlight+Bold*, plus a **Font Size** dropdown (FangSong / KaiTi in default / red / blue with sizes). Rendered through markdown-it's raw-HTML pass-through.
- **Cleaner WYSIWYG Sync:** Editing directly in the preview pane no longer introduces extra blank lines or reformats your source — a `normalizeMarkdown` step collapses redundant newlines and re-renders the preview on blur to stay in sync.

### Installation

1. Download the latest `chrome-md-editor.zip` from the [Releases](https://github.com/yishu-ziyu/chrome-md-editor/releases) page.
2. Extract the downloaded ZIP file.
3. Open Chrome and navigate to `chrome://extensions/`.
4. Enable **Developer mode** in the top right corner.
5. Click **Load unpacked** and select the extracted `dist` directory.
6. **Important:** Click on the "Details" button of the extension and enable **"Allow access to file URLs"**. This is required for drag-and-drop file opening.
7. Click the extension icon in your toolbar to start, or simply drag a `.md` file into your browser.

> **安装指引图示 / Screenshot Guide**
>
> | 步骤 | 截图建议 / Screenshot suggestion |
> |------|----------------------------------|
> | Step 3-4: `chrome://extensions/` + Developer mode | 截图右上角 "Developer mode" 开关已开启的状态 |
> | Step 5: Load unpacked | 截图左上角三个按钮（Load unpacked / Pack extension / Update），箭头指向 "Load unpacked" |
> | Step 6: Allow access to file URLs | 截图扩展详情页，"Allow access to file URLs" 开关的位置 |
>
> *截图建议使用系统自带截图工具（macOS: `Cmd+Shift+4`），标注箭头或圆圈圈出关键按钮即可。*

### Development

- Built with **CodeMirror 6**, **markdown-it**, and **Vite**.
- `npm run dev` starts a local server for UI testing and development (Note: File system access won't work correctly outside of the extension context).
- Check `DEVLOG.md` for detailed implementation notes and history.

---

## 中文说明

🌟 **欢迎来自 小红书 / 少数派 (sspai) 的朋友！** 如果你觉得这个项目提升了你的工作效率，欢迎在右上角给项目点个 Star ⭐️！也欢迎在评论区或 Issue 提出建议。

### 第一次使用 / Quick Start

> 三步上手，无需任何配置。

1. **拖入文件** — 将任意 `.md` 文件从 Finder 拖入 Chrome 浏览器窗口，编辑器自动打开。
2. **打开文件夹** — 点击扩展图标，选择包含 Markdown 文件的本地文件夹，获得完整项目浏览能力。
3. **开始编辑** — 左侧写源码，右侧实时预览；也可以直接在预览区点击编辑（WYSIWYG），改动自动同步。

### 核心功能

- **拖拽直开：** 直接将本地 `.md` 文件拖入 Chrome 浏览器，扩展将自动接管并在编辑器中无缝打开。
- **项目文件浏览器：** 内置侧边栏，轻松浏览本地文件夹结构，在多个 Markdown 文件间快速切换。
- **本地图片预览：** 从文件夹或 `file://` 拖拽打开 Markdown 时，可解析并预览相对路径图片。
- **粘贴图片插入：** 支持直接粘贴截图或剪贴板图片；有文件夹写入权限时保存到同级 `images/` 目录，否则自动以内嵌 data URL 插入。
- **Mermaid 图表渲染：** 原生支持识别 ` ```mermaid ` 代码块，并直接在预览区渲染为 SVG 流程图。
- **预览区直接编辑 (WYSIWYG)：** 点击右侧渲染好的预览区即可直接修改文本，改动会自动同步回左侧的 Markdown 源码。
- **实时预览：** 左右分屏布局，支持 GitHub 风格 Markdown (GFM)，支持滚动条同步联动。
- **多主题与布局：** 内置深色/浅色主题；支持分屏、纯编辑、纯预览三种视图模式。
- **纯本地极客体验：** 基于 Chrome File System Access API 构建，无需启动后端服务，数据完全保留在本地。
- **多实例支持：** 点击工具栏图标可反复打开，每次都是独立的新编辑器标签页（不再限制单实例）；每个被拦截的 `.md` 文件通过专属存储键路由到对应实例，互不干扰。
- **样式工具栏按钮：** 一键插入「居中+加粗 / 居中+加粗+红 / 居中+加粗+蓝 / 文本高亮 / 文本高亮+加粗」以及「修改字号」下拉（仿宋 / 楷体 × 默认 / 红 / 蓝 × 指定字号），借助 markdown-it 的 HTML 透传渲染。
- **预览编辑更干净：** 在右侧预览区直接编辑后，源码同步且不再产生多余空行、也不做格式重排（`normalizeMarkdown` 折叠冗余空行，失焦时重渲染预览以重新对齐）。

### 安装步骤

1. 前往 [Releases](https://github.com/yishu-ziyu/chrome-md-editor/releases) 页面下载最新的 `chrome-md-editor.zip` 压缩包。
2. 解压下载的 ZIP 文件，获得 `dist` 文件夹。
3. 打开 Chrome 浏览器，访问 `chrome://extensions/` 设置页面。
4. 开启右上角的 **“开发者模式”**。
5. 点击 **“加载已解压的扩展程序”**，然后选择刚才解压出来的 `dist` 文件夹。
6. **⚠️ 重要：** 在扩展列表中找到 Markdown Editor，点击“详细信息”，并开启 **“允许访问文件网址”**（这是拖拽本地文件自动打开功能的前提）。
7. 点击浏览器工具栏的扩展图标即可启动，或者直接将本地 `.md` 文件拖入浏览器窗口。

### 本地开发

- 核心技术栈：**CodeMirror 6**, **markdown-it**, **Vite**。
- 运行 `npm run dev` 可启动本地开发服务器进行 UI 调试（注意：纯网页环境下无法使用 Chrome 扩展专属的文件访问 API）。
- 详细的开发历程与技术决策请参阅 `DEVLOG.md`。

---

## 构建与本地测试 / Build & Local Test

### 前置要求 / Prerequisites

- 已安装 **Node.js 18+**（建议 20+）。
- 包管理使用 `npm`（随 Node 一同安装）。

### 步骤 1：安装依赖

```bash
npm install
```

首次运行会从 npm 拉取 CodeMirror 6、markdown-it、mermaid、vite 等依赖，生成 `node_modules/`（已被 `.gitignore` 忽略，不会进入版本库）。

### 步骤 2：构建扩展

```bash
npm run build
```

Vite 将 `src/editor.html` 作为入口打包，并把 `public/` 下的文件（`manifest.json`、`background.js`、`content-script.js`、`icons/`）原样拷贝进输出目录，最终产物在 `dist/`：

```
dist/
├── manifest.json
├── background.js
├── content-script.js
├── icons/icon{16,48,128}.png
├── src/editor.html        ← 打包后的编辑器页面（内部引用 ../assets/*）
└── assets/editor.js, editor.css
```

> `chrome.runtime.getURL('src/editor.html')` 与 `manifest.json` 中的 `web_accessible_resources` 指向的路径一致，因此加载 `dist/` 即可直接用，**无需改动任何路径**。

### 步骤 3：加载到 Chrome 开发者模式

1. 打开 Chrome，访问 `chrome://extensions/`。
2. 打开右上角的 **「开发者模式」**（Developer mode）开关。
3. 点击左上角 **「加载已解压的扩展程序」**（Load unpacked），**选择项目里的 `dist/` 文件夹**（注意：选 `dist/`，不是 `src/`，也不是项目根目录）。
4. 加载成功后，扩展列表出现 **Markdown Editor**（版本 1.3.0）。
5. **⚠️ 重要**：点击该扩展的「详细信息」（Details），开启 **「允许访问文件网址」**（Allow access to file URLs）——这是「拖拽本地 `.md` 自动打开」的前提。

### 步骤 4：本地验证

- **多实例**：点击工具栏扩展图标，每次都会**新开一个独立编辑器标签页**（不再复用同一页）。
- **样式按钮**：点击工具栏新增的「居中+加粗 / 高亮 / 字号」等按钮，确认按规格插入 `<center>` / `<font>` / `<mark>` 片段。
- **预览编辑**：在右侧预览区直接编辑文字后点击外部，源码同步且**不再出现多余空行**。
- **拖拽打开**：把任意 `.md` 文件拖入 Chrome 窗口，自动重定向到编辑器并加载内容。
- **热更新**：改完代码执行 `npm run build`，回到 `chrome://extensions/` 点击扩展卡片上的 **「刷新」**（Update）即可生效，无需重新加载整个目录。

### 说明

- `npm run dev` 仅用于纯网页 UI 调试（Vite 开发服务器）。由于缺少 Chrome 扩展上下文（`chrome.*` API、文件系统权限），「打开文件 / 拖拽 `.md` / 多实例」等扩展专属功能在 dev 模式下不可用。**正式验证请走 `npm run build` + 加载 `dist/` 流程。**
- 构建时可能出现 Vite 大 chunk 警告（来自 mermaid / 语法高亮依赖体积），属已知现象，不阻塞扩展加载。
- 运行单元测试：`npm test`（验证 `image-support` / `link-support` 纯函数模块）。
- 开发日志与全部改动记录见 `DEVLOG.md`。
