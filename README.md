# Chrome Markdown Editor

本地 Markdown 编辑器 Chrome 扩展。
不上传文件、不依赖后端；在浏览器里直接打开、编辑、预览本地 `.md`。

**当前版本：[v1.5.0](https://github.com/zhangweildlh/chrome-md-editor/releases/tag/v1.5.0)**  
**下载（Chrome 扩展）：** [chrome-md-editor-v1.4.8.zip](https://github.com/zhangweildlh/chrome-md-editor/releases/download/v1.4.8-desktop/chrome-md-editor-v1.4.8.zip)  
**下载（Windows 独立 EXE）：** [Markdown.Editor_1.4.8_portable.exe](https://github.com/zhangweildlh/chrome-md-editor/releases/download/v1.4.8-desktop/Markdown.Editor_1.4.8_portable.exe)  
**许可：** [MIT](./LICENSE)

[English](#english)

---

## 预览

分屏编辑 + 实时预览（深色）：


阅读翻译：预览区中英对照（不改源码）：


翻译设置（选预设 + 粘贴 API Key）：


浅色主题：


动图（主界面 → 设置 → 双语）：


---

## 功能

| 能力 | 说明 |
| --- | --- |
| 拖拽打开 | 将本地 `.md` 拖入 Chrome，扩展接管并打开编辑器 |
| 多实例 | 每次点扩展图标新开独立标签；多文件互不抢占 |
| 项目侧边栏 | 打开文件夹后浏览并切换同目录 Markdown |
| 分屏预览 | 左编辑 / 右预览；支持仅编辑、仅预览 |
| 预览区编辑 | 可在渲染结果上直接改字，再同步回源码（回车新增/删除空段、多段 `>` 引用、滚动位置均正确保持，不会插入多余空行或跳回文件头） |
| 本地图片 | 相对路径图片可预览；支持粘贴截图（有权限时写入 `images/`） |
| 查找 / 替换 | 自绘中文查找替换面板；显示命中位置 `X/Y`、支持全选匹配、替换下一个/全部（替代 CodeMirror 默认英文面板） |
| 粘贴为 Markdown | 从网页/富文本复制内容粘贴时自动转换为 Markdown（保留原有图片粘贴；纯文本与无结构内容原样放行） |
| 自动保存 / 快照 | 编辑停顿自动保存草稿（仅存 `chrome.storage.local`，不碰磁盘 `.md`）；每 2 分钟或累计 50 次改动生成一份历史快照，快照环最多保留 30 份、可一键回滚任一版本；重启发现更新草稿时弹窗提示恢复 |
| 磁盘自动保存 | 工具栏「自动保存」开关 + 间隔秒数（默认 30，5–3600）；开启后每 N 秒在**源文件同目录**生成「主文件名_秒级时间戳.md」副本（例：`这是测试文件.md` → `这是测试文件_20260804133025.md`），绝不覆盖源文件。Web 首次需授权目录句柄；Tauri EXE 直接写同目录 |
| 高亮（编辑区 + 预览区联动） | 选中编辑区或预览区文字，点「高亮」按钮即把源码外包 `<mark>…</mark>` 并同步重渲染预览；再点一次取消。编辑区与预览区行为统一，不再出现「编辑区改了预览不渲染」或反之 |
| Mermaid | ` ```mermaid ` 代码块渲染为图 |
| 主题 | 深色 / 浅色 |
| 语法高亮 | 编辑区与预览区 Markdown 语法彩色字体 + 标题/引用/代码块行底色；经典 / 护眼（米黄）/ 高对比三套配色方案，与深/浅主题正交独立、可切换并持久化 |
| 会话恢复 | 再次打开扩展时尽量恢复上次内容与文件名 |
| 阅读翻译 | 预览区中英对照；**不修改** Markdown 源文件 |

> 工具栏所有按钮均带鼠标悬停提示（tooltip）：悬停即显示功能说明与对应快捷键。

技术栈：CodeMirror 6 · markdown-it · Vite · Manifest V3。  
桌面端额外使用 Rust + Tauri v2 打包为独立 Windows EXE。

---

## 桌面端独立 EXE（Tauri）

除了 Chrome 扩展，本项目还提供一个**独立 Windows 程序**：用 [Tauri](https://tauri.app/) v2 把同一套 Web 编辑器（CodeMirror 6 + markdown-it + Mermaid）打包成绿色免安装的 EXE，**无需浏览器、无需安装、本地零依赖**（仅依赖系统 WebView2 运行时）。

- **下载**：Release `v1.4.8-desktop` 中的 `Markdown.Editor_1.4.8_portable.exe`（便携版，直接拷到任意目录双击运行）。
- **双击打开**：把 `.md` 设为默认打开程序后，双击任意 `.md` 文件即由 EXE 直接打开并编辑。
- **拖入打开**：启动 EXE 后，把 `.md` 文件拖进窗口也能打开。
- **多实例**：每次双击 / 拖入都启动一个独立 EXE 实例，各自打开对应文件，互不干扰。
- **保存写回原文件**：底层用 Rust `std::fs` 命令读写（无路径作用域限制），`Ctrl/Cmd+S` 可直接覆盖原文件。
- **未签名提示**：未签名版本首次运行可能被 Windows SmartScreen 拦截，点「仍要运行」即可；本机需已安装 WebView2 运行时（Win10/11 通常已自带，否则按提示安装）。
- **本地零安装构建**：EXE 完全在 GitHub 云端（`windows-latest`）用 Rust + Tauri 构建；一次打 `v1.4.8-desktop` 标签即**同时产出扩展 zip 与 EXE 两个资产**，开发者本地无需安装 Rust / Tauri / WebView2。

> 桌面端与 Chrome 扩展共用 `src/editor.html/.js/.css`；仅在检测到 Tauri 环境时由 `src/desktop-shims.js` 注入 `chrome` 与 File System Access API 垫片，对扩展零影响。
---

## 文件对照 / 多栏合并（compare 模块）

把两个本地 Markdown / 纯文本文件并排对照、逐块合并，无需 Git 目录、纯前端 diff/merge。底层使用 `@codemirror/merge` 的 `MergeView` / `unifiedMergeView`，零自研 diff 算法。

### 如何打开

- **Chrome 扩展**：在任意页面或扩展图标上点右键，选择「打开对比合并」（由 `public/background.js` 的 `chrome.contextMenus` 注册），会新开一个 `src/compare.html` 独立实例（沿用 `newInstanceId()`，不复用编辑器状态）。
- **桌面端（Tauri EXE）**：同源入口——EXE 内同样通过右键菜单打开 compare 页，复用同一套 `src/compare.html`。

### 三种视图

- **两栏 diff**：左 `Yours` / 右 `Theirs`，差异块红绿高亮 + 行号差异标记（`−` / `+` gutter）。两栏默认可编辑；亦可将 `Yours` 侧设为只读。
- **三栏合并**：左 `Yours`（只读）/ 中 `Result`（可编辑合并结果）/ 右 `Theirs`（只读参考）。每块提供中文「⇄ 接受此块」按钮，把 `Yours` 当前块并入 `Result`；另有「接受 Theirs 块」把 `Theirs` 对应块拷入 `Result`，逐步合并出最终结果。
- **单栏 unified**：`unifiedMergeView` 行内对照——删除行以 widget 显示在原行上方，块内提供中文「接受 / 拒绝」按钮；开启行内 diff 与删除行语法高亮，保留 Markdown 语法色。

> 工具栏可随时切换「两栏 / 三栏 / 单栏」；三种视图统一从已选的两个文件渲染。

### 文件选择与拖拽

- 点「选择文件」按钮或拖拽区，多选本地 `.md` / `.markdown` / `.mdown` / `.mkd` / `.mkdn` / `.txt`（不限于 Git 仓库目录）。
- 选中的**第 1 个**文件作为 `Yours`、**第 2 个**作为 `Theirs`（更多文件当前版本未纳入对照）。
- 也可将文件直接拖入页面拖拽区读取。

### 块导航与逐块接受

- **块导航**：「上一块 / 下一块」按钮跳转差异块（底层 `goToNextChunk` / `goToPreviousChunk`）。
- **块导航快捷键**：在对比页按 `B` / `]` 跳到下一块，`Shift+B` / `[` 跳到上一块；在可编辑区域（CodeMirror / input / textarea）内为不吞掉正常输入，改用 `Alt+B` / `Alt+Shift+B` 在编辑区内也生效。快捷键与按钮复用同一组函数，行为完全一致。
- **逐块接受**：
  - 三栏：每块「⇄ 接受此块」把 `Yours` 当前块并入 `Result`；「接受 Theirs 块」把 `Theirs` 对应块拷入 `Result`。
  - 单栏：块内中文「接受 / 拒绝」按钮（自定义 `mergeControls`，避开验收闸门禁用类名）。

### 图片插入

- 点「图片」按钮或拖拽图片到图片区：图片转为内嵌 `data URL`，插入到当前光标（或当前活动编辑块）处，生成 Markdown 语法 `![name](data:image/...)`；复用 `src/image-support.js` 的纯函数。

### 导出

- **导出合并结果**：把 `Result` / 单栏当前内容写出。优先 `showSaveFilePicker` **句柄留存**写回，失败降级为浏览器下载（`<a download>`），再失败降级到剪贴板。
- **导出 diff 报告**：生成 git 风格可读 diff 文本（`@@` 行 + `+/-` 标记，底层 `presentableDiff` 渲染层），同样走「句柄留存 / 下载 / 剪贴板」三级降级。

### 折叠未改 / 主题

- 单栏 unified：「展开未改」按钮展开当前光标处的大片未改区域（单栏以展开为主；真正的折叠收起能力不在当前版本承诺）。两栏 / 三栏视图由 `@codemirror/merge` 的 `collapseUnchanged` 配置自动折叠未改区域。
- 明暗主题：复用编辑器既有 `--bg` / `--fg` / `--accent` / `--border` 等 CSS 变量，`@codemirror/merge` 自带 `&light` / `&dark` 选择器，随主题自动适配，**不新建主题变量**。

### 桌面端（Tauri 同源）

compare 页在 EXE 内复用同一套 `src/compare.html`。文件读取与结果保存复用桌面端既有的 Tauri 文件访问能力（`showOpenFilePicker` / `showSaveFilePicker` 垫片 → `read_text_file` / `write_text_file`）。Rust 侧另已实现并注册 `read_multiple_text_files` / `save_compare_result` 命令（`desktop/src/lib.rs`），作为对比批处理读写的专用通道；对应桥接模块 `src/compare-shims.js` 提供浏览器 / 桌面统一的文件读写签名。

> 模块文件：`src/compare.js`（页面控制器）、`src/compare-merge.js`、`src/compare-unified.js`、`src/compare-nav.js`、`src/compare-line-markers.js`、`src/compare-files.js`、`src/compare-images.js`、`src/compare-export.js`、`src/compare-diff-export.js`、`src/compare-shims.js`；新增 `src/compare.html` 与 `vite.config.js` 多入口 `compare`、manifest `web_accessible_resources` + `contextMenus` 权限。

---

## 安装（用户）

1. 打开 [Releases](https://github.com/yishu-ziyu/chrome-md-editor/releases)，下载最新 `chrome-md-editor-v*.zip`。
2. 解压，得到内层 **`dist/`** 目录（不要加载 zip 根目录，也不要加载本仓库源码根目录）。
3. Chrome 打开 `chrome://extensions/`，打开右上角 **开发者模式**。
4. **加载已解压的扩展程序**，选择上一步的 `dist/`。
5. 进入扩展 **详细信息**，开启 **允许访问文件网址**（拖拽本地 `.md` 必需）。
6. 点工具栏扩展图标启动，或把 `.md` 拖进浏览器。

### 从旧版升级

1. 在 `chrome://extensions/` 对该扩展点 **重新加载**。
2. 关掉所有旧的编辑器标签，再新开一页。
3. 确认左上角版本徽标与 Release 一致（当前应为 **v1.5.0**）。
4. 桌面 EXE 用户：重新下载 `Markdown.Editor_1.4.8_portable.exe` 覆盖旧文件即可，无需卸载。

---

## 使用

### 基本编辑

1. 拖入 `.md`，或点扩展图标后「打开文件 / 打开文件夹」。
2. 左侧写 Markdown，右侧实时预览。
3. 需要时可在预览区直接点选改字；失焦后写回源码。
4. `Ctrl/Cmd+S` 保存（首次可能弹出系统保存对话框）。

### 阅读翻译

用于读英文长文，不是用来改写源文件。

1. **左键**点「译」开关双语对照：预览区在英文段落下显示中文；再点一次关闭，恢复原文排版。
2. **右键**点「译」打开翻译设置：选择服务预设、粘贴 API Key（默认预设为 MiniMax Token Plan · Anthropic，Key 形如 `sk-cp-...`）、可改 Base URL 与模型名。

预设覆盖常见官方接口、国内模型、Token Plan（MiniMax / 阶跃）、聚合与 DeepL。
高级设置可改 Base URL 与模型名。

开启翻译后，文档正文会发往你配置的 API 服务商。
未开启翻译时，编辑与预览均在本地完成。

---

## 开发

需要 Node.js 18+（建议 20+）。

```bash
npm install
npm test          # 单元测试
npm run build     # 输出到 dist/
npm run pack      # build + 打 zip：chrome-md-editor-v<version>.zip
```

加载方式与用户安装相同：在 `chrome://extensions/` 加载本仓库的 **`dist/`**。

```bash
npm run dev       # 仅 UI 调试用；无 chrome.* / 文件 API，不能代替扩展验收
```

改代码后：`npm run build` → 扩展卡片 **重新加载** → 关掉旧标签再测。

相关文档：

- 变更记录：[CHANGELOG.md](./CHANGELOG.md)

---

## 目录说明

```
public/          # manifest、background、content-script、icons（构建时拷贝进 dist）
src/             # 编辑器页面与逻辑（扩展与桌面端共用）
desktop/         # Tauri v2 桌面壳（Rust + 配置），打包为独立 Windows EXE
tests/           # node:test 单元测试
scripts/         # 打包、图标、验收脚本
dist/            # 构建产物（gitignore；Chrome 只加载这里）
```

---

## 隐私

- 默认：文件读写在本地完成，不经过本项目服务器（本项目无后端）。
- 阅读翻译：仅在你主动开启并配置 Key 后，将预览中的待译文本发送到你选择的第三方 API。
- API Key 保存在浏览器扩展本地存储中。

---

## License

[MIT](./LICENSE) © 2026 [yishu-ziyu](https://github.com/yishu-ziyu)

---

## English

**Chrome Markdown Editor** is a Manifest V3 extension for editing local Markdown files in the browser.
No backend.
No upload for normal editing.


### Install

1. Download `chrome-md-editor-v*.zip` from [Releases](https://github.com/yishu-ziyu/chrome-md-editor/releases).
2. Unzip and load the inner **`dist/`** folder via `chrome://extensions` (Developer mode → Load unpacked).
3. Enable **Allow access to file URLs** in the extension details.
4. Click the toolbar icon, or drag a `.md` file into Chrome.

After upgrading: **Reload** the extension, close old editor tabs, open a new one.
The toolbar should show the release version (currently **v1.5.0**).

### Features (short)

- Drag-open local `.md`, multi-tab instances, folder sidebar
- Split / editor / preview layouts, light & dark themes
- Preview WYSIWYG sync, Mermaid, local images, paste screenshot
- Optional reading translation (bilingual preview; source file unchanged)

### Develop

```bash
npm install && npm test && npm run build
```

Load `dist/` as an unpacked extension.
`npm run dev` is UI-only and is not a substitute for extension testing.

### Privacy

Editing stays local unless you enable reading translation, which sends text to the API provider you configure.

### Standalone Windows EXE (Tauri)

A portable Windows build is also provided: the same web editor packaged with Tauri v2 into a green, install-free `Markdown.Editor_1.4.8_portable.exe`. Double-clicking a `.md` (after setting it as the default opener) or dragging a `.md` into the window opens it directly; each open runs as an independent instance. Saves write back to the original file. The EXE relies on the system WebView2 runtime and is built entirely in GitHub Actions (no local Rust/Tauri toolchain needed). Download from the `v1.4.8-desktop` release.

### License

[MIT](./LICENSE)
