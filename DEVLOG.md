# Markdown Editor Chrome 扩展 — 开发日志

## 项目概述

**目标**：开发一款本地 Chrome 扩展，用于在浏览器中查看和编辑 Markdown 文件。  
**使用方式**：通过 Chrome 开发者模式加载，仅供个人使用。

---

## 2026-02-27 第一阶段：核心编辑器搭建

### 技术选型调研

| 候选方案            | 评估结果                                |
| ------------------- | --------------------------------------- |
| **CodeMirror 6** ✅ | 模块化轻量、Markdown 语法高亮、活跃维护 |
| Monaco Editor       | 功能强但体积太大（~5MB），不适合扩展    |
| OverType            | 太新太轻量，生态不够                    |
| **markdown-it** ✅  | GFM 完善、插件生态好，优于 Marked.js    |
| **Vite** ✅         | 开发体验好，构建为静态文件直接作为扩展  |

### 实施内容

1. **项目初始化**
   - 创建 `package.json`，安装 CodeMirror 6 全家桶 + markdown-it + Vite
   - 配置 `vite.config.js` 多入口打包，输出到 `dist/`

2. **Chrome 扩展结构**
   - `manifest.json`：Manifest V3，点击图标打开编辑器标签页
   - `background.js`：Service Worker，管理编辑器标签页（避免重复打开）
   - 图标：纯 Node.js 脚本生成渐变紫色 PNG（16/48/128px）

3. **编辑器核心功能**
   - `editor.html`：工具栏 + 分屏布局 + 状态栏
   - `editor.js`：
     - CodeMirror 6 编辑器（Markdown 模式、代码语言高亮、折叠、搜索）
     - markdown-it 实时预览渲染
     - 文件操作：File System Access API (`showOpenFilePicker` / `showSaveFilePicker`)
     - 格式化工具栏：加粗/斜体/删除线/代码/标题/列表/引用/表格/链接/水平线
     - 分屏拖拽调节
     - 滚动同步
     - 深色/浅色主题切换（持久化 localStorage）
     - 三种视图模式：分屏 / 纯编辑 / 纯预览
     - 状态栏：行/列、字数（中英文混合）、字符数、选中数
     - 拖拽 .md 文件打开
     - 离开保护提示
   - `editor.css`：
     - CSS 变量主题系统（深色/浅色）
     - GitHub 风格 Markdown 预览样式

4. **验证**
   - Vite dev server 浏览器测试 → 通过
   - 深色/浅色主题切换 → 正常
   - 构建 → `dist/` 可直接作为 Chrome 扩展加载

---

## 2026-02-27 第二阶段：Mermaid 渲染 + 预览区可编辑

### 新增功能

1. **Mermaid 图表渲染**
   - 安装 `mermaid` 包
   - markdown-it 将 ` ```mermaid ` 代码块渲染为 `<code class="language-mermaid">`
   - `doUpdatePreview()` 中检测并调用 `mermaid.render()` 将其替换为 SVG
   - 主题切换时自动切换 Mermaid 主题（dark/default）并重新渲染
   - 渲染失败时显示友好错误提示

2. **预览区直接编辑（WYSIWYG）**
   - 预览容器设置 `contenteditable="true"`
   - 编辑时显示「编辑中 — 点击外部区域完成」状态提示
   - 内置轻量 HTML → Markdown 转换器（`htmlToMarkdown()`），支持：
     - 标题（h1-h6）、段落、粗体、斜体、删除线
     - 代码（行内/代码块，含语言标记）
     - 引用、有序/无序列表、任务列表
     - 链接、图片、表格、水平线
     - Mermaid 图表区域（SVG 无法反向还原，跳过）
   - 失焦或输入后 500ms 自动同步回 CodeMirror 源码编辑器
   - 防抖 + `isPreviewEditing` 标志防止循环更新

3. **验证**
   - Mermaid 流程图正确渲染
   - 预览区可直接编辑，修改自动同步到源码
   - 构建成功，`dist/` 更新

---

## 2026-02-27 第三阶段：拖拽 .md 文件到 Chrome 自动打开

### 需求

用户最核心的使用场景：直接把本地 .md 文件拖到 Chrome 浏览器窗口，扩展自动接管并在编辑器中打开，取代 Chrome 默认的纯文本渲染。

### 实现方案

用户拖 `.md` 文件到 Chrome 时，Chrome 以 `file:///path/to/file.md` 打开纯文本页面。我们通过 content script 拦截：

```
file.md → Chrome 打开 → content-script.js 注入
→ 读取页面纯文本内容 → 存入 chrome.storage.local
→ 重定向到编辑器页面 → editor.js 检查 storage 加载文件
```

### 修改文件

1. **`content-script.js`**（新建）：
   - 检测 `file://` 协议下的 `.md` 文件
   - 读取 `document.body.innerText` 获取原始 Markdown 文本
   - 存入 `chrome.storage.local.pendingFile`（含文件名、内容、时间戳）
   - 重定向到 `chrome.runtime.getURL('src/editor.html')`

2. **`manifest.json`**：版本升至 1.1.0，添加 `content_scripts` 配置
   - `matches: ["file:///*"]` + `include_globs: ["*.md", "*.markdown", ...]`

3. **`editor.js`**：`init()` 末尾调用 `loadPendingFile()` 检查 storage

### 注意事项

- 用户需要在 `chrome://extensions/` 扩展详情页开启 **「允许访问文件网址」**
- pending file 设有 30 秒过期机制，防止加载过期内容
- 拖拽打开时无法获得 `FileHandle`，无法直接回写文件（需用 Ctrl+S 另存为）

---

## 2026-02-27 第四阶段：文件浏览器侧边栏

### 需求

用户可以在编辑器中直接浏览项目文件夹，点击打开其他 .md 文件，无需反复使用「打开文件」对话框。

### 实现

1. **HTML**：在 `editor-main` 左侧添加 `<aside>` 侧边栏
   - 头部：标题 + 三个操作按钮（打开文件夹、刷新、收起）
   - 内容区：文件树 + 空状态提示

2. **CSS**（约190行）：
   - 240px 宽度侧边栏，可收缩到 0
   - 文件树节点样式：缩进对齐、hover 高亮、active 蓝色
   - 文件夹图标黄色、.md 文件图标蓝色、其他文件半透明
   - 收缩时显示展开 toggle bar

3. **JS**（约220行）：
   - `showDirectoryPicker()` 选择本地文件夹
   - 递归遍历目录树（最大深度 5，跳过 `.` 开头 / `node_modules` / `dist`）
   - 文件夹在前，按中文名称排序
   - 文件夹点击展开/折叠（chevron 旋转动画）
   - .md/.txt 文件点击直接打开到编辑器
   - 打开前检查未保存更改
   - 获得 `FileHandle` → 之后可直接 Ctrl+S 保存
   - 侧边栏收缩/展开状态持久化 `localStorage`

---

## 最终产物

```
dist/                   ← Chrome 扩展加载目录
├── manifest.json
├── background.js
├── content-script.js   ← 拦截 .md 文件
├── icons/
├── src/editor.html
└── assets/             ← 打包后的 JS/CSS
```

### 使用步骤

```bash
cd "/Users/mahaoxuan/Desktop/产品经理/灵感/markdown 编辑器"
npm run build
```

1. 打开 `chrome://extensions/`
2. 开启开发者模式
3. 点击「加载已解压的扩展程序」→ 选择 `dist/` 目录
4. **点击扩展详情 → 开启「允许访问文件网址」**
5. 拖拽任何 .md 文件到 Chrome 即可自动在编辑器中打开

---

## 2026-04-19 第五阶段：本地图片预览 + 粘贴图片插入

### 背景

收到用户反馈：

1. Markdown 中引用本地图片时，预览区无法显示
2. 希望支持直接粘贴截图或剪贴板图片到 Markdown

### 本阶段实现

1. **本地图片预览**
   - 新增 `src/image-support.js`，抽离图片路径解析逻辑
   - 预览渲染后扫描所有 `<img>` 节点
   - 支持以下图片来源：
     - `http/https`
     - `data:` / `blob:`
     - `file://` 绝对路径
     - 基于当前 Markdown 文件上下文解析的相对路径
   - 当 Markdown 来自已打开文件夹时：
     - 按当前 `.md` 文件所在目录解析相对图片路径
     - 通过 File System Access API 读取图片文件并转成 blob URL 显示
   - 当 Markdown 来自拖拽 `file://` 文件时：
     - 基于原始 `sourceUrl` 解析相对路径为 `file://` 绝对地址

2. **粘贴图片插入**
   - 监听 CodeMirror 编辑区粘贴事件
   - 检测到剪贴板中存在图片时，阻止默认粘贴流程
   - 若当前 Markdown 具备文件夹上下文：
     - 自动在当前 Markdown 同级创建或复用 `images/` 文件夹
     - 将图片写入 `images/pasted-时间戳-随机串.ext`
     - 自动插入相对 Markdown 图片语法
   - 若当前 Markdown 没有文件夹上下文：
     - 自动将图片转为 base64 data URL
     - 直接插入 Markdown 图片语法

3. **当前文档上下文管理**
   - 为不同打开方式补充上下文：
     - 文件树打开：记录相对目录路径
     - `file://` 拖拽打开：记录原始文件 URL
     - 普通文件选择器打开：不提供目录上下文，粘贴图片自动回退为 data URL
   - 新建文件、普通打开文件、拖入编辑器打开文件时会重置上下文

4. **测试基础设施**
   - 在 `package.json` 中新增 `npm test`
   - 新增 `tests/image-support.test.js`
   - 覆盖：
     - 本地图片路径解析
     - 缺少上下文时的回退行为
     - 粘贴图片文件名生成
     - Markdown 图片语法生成

### 约束与说明

- 普通“打开文件”对话框拿不到父目录句柄，因此无法可靠解析相对图片路径，也无法把粘贴图片写回同级目录
- 这类场景下会自动回退为 base64 内嵌图
- 如需稳定使用相对路径图片和图片文件落盘，建议先使用“打开文件夹”再从文件树中打开 Markdown

---

## 2026-04-29 第五阶段跟进：验证与交付说明补齐

### 本次跟进

1. **远端状态确认**
   - 已确认仓库远端为 `https://github.com/yishu-ziyu/chrome-md-editor.git`
   - `git fetch origin` 成功，远端新增 `v1.0.0` 标签
   - 本地 `main` 当前仍比 `origin/main` ahead 2，图片能力相关改动尚未提交

2. **功能验证**
   - `npm test -- tests/image-support.test.js` 通过，7 个用例全部成功
   - `npm run build` 通过，产物生成到 `dist/`
   - 构建仍有 Vite 大 chunk 警告，属于现有 Mermaid/语法高亮依赖体积问题，不阻塞扩展加载

3. **文档补齐**
   - README 已补充本地图片预览与粘贴图片插入能力
   - 继续保留第五阶段约束：稳定落盘图片建议先通过“打开文件夹”进入工作区

---

## 2026-04-29 第六阶段：扩展图标替换

### 背景

Chrome 扩展管理页中原图标显示为纯紫色渐变占位块，缺少和 Markdown 编辑器相关的主体符号，辨识度不足。

### 本阶段实现

1. 新增 `scripts/generate-icons.mjs`
   - 使用 Node.js 内置能力生成 PNG，不引入新依赖
   - 输出 `public/icons/icon16.png`、`icon48.png`、`icon128.png`
   - 设计元素改为深色圆角底、白色文档、`M` 字样和蓝色向下箭头

2. 新增 `npm run icons`
   - 之后调整图标时可复现生成三档扩展图标

---

## 2026-04-29 第七阶段：预览区超链接跳转修复

### 背景

用户反馈：同一篇 Markdown 在 Chrome 原生文件预览中点击链接可以跳转，但被扩展接管并渲染到编辑器右侧预览区后，蓝色超链接点击无反应。

### 根因

预览区为了支持 WYSIWYG 直接编辑，被设置为 `contenteditable="true"`。浏览器在可编辑区域内点击 `<a>` 时会优先进入编辑/选中语义，不一定执行默认导航；现有代码也没有对预览区链接点击进行显式处理。

### 本阶段实现

1. 新增 `src/link-support.js`
   - 抽离预览链接目标解析逻辑
   - 支持 `http:`、`https:`、`mailto:`、`file:` 安全协议
   - 支持在 `file://` Markdown 上下文中解析相对链接
   - 拒绝空链接、页内锚点和 `javascript:` 等不安全协议

2. 更新 `src/editor.js`
   - 新增预览区链接点击监听
   - 点击渲染后的 `<a href>` 时显式通过 `chrome.tabs.create()` 打开新标签
   - 非扩展开发环境回退到 `window.open()`
   - 保留预览区可编辑能力，不改变 Markdown 源文档内容

3. 更新 `src/editor.css`
   - 为预览区链接补充 `cursor: pointer`

4. 新增 `tests/link-support.test.js`
   - 覆盖远程链接、基于 `file://` 的相对链接解析，以及不安全链接拒绝

---

## 2026-07-07 第八阶段：预览编辑空行修复 + 多实例支持 + 工具栏样式按钮

本阶段覆盖三类修改：分屏预览编辑的「累加空行 / 格式重排」问题修复、多编辑器实例支持、以及工具栏新增居中 / 高亮 / 字号按钮。

### 需求 A：分屏预览编辑会自动添加多个空行、引发格式重排

**根因**（三层叠加）
1. `previewContainer` 被设为 `contenteditable` 后，浏览器在输入 / 回车时会重写 DOM（拆 `<div>`、插 `<br>`、合并节点）。
2. `htmlToMarkdown()` 的 `convertNode()` 是「逐块追加 `\n\n`」的粗粒度序列化器，`<div>` 默认分支只返回文本、`<br>` 返回 `'\n'`，与已是 `\n\n` 的段落叠加 → `文本\n\n\n…`（多个空行），并把单/双换行重新规范化为双换行（格式重排）。
3. `setEditorContent()` 全量替换编辑器后，预览因 `isPreviewEditing` 守卫**不重渲染**，仍显示被篡改的脏 DOM；下一轮编辑又基于脏 HTML 再转一次，空行与偏移不断累加。

**实现（修复）**
- 新增 `normalizeMarkdown(md)`：`\n{3,}` → `\n\n`、清除行尾空白、统一 `\r\n`；`htmlToMarkdown()` 末尾调用它，从根上压缩多余空行。
- `syncPreviewToEditor(rerender = false)` 增加参数；`blur` 处理器改为 `syncPreviewToEditor(true)`——同步后用规范化后的 Markdown 调 `doUpdatePreview()` 重渲染预览，使预览与编辑器重新对齐；`input` 期（用户正在输入）不重渲染以保光标。切断「脏 DOM 反复累加」循环。

### 需求 B：支持同时打开多个编辑器实例

**根因**
- `background.js` 的 `action.onClicked` 采用「已存在则聚焦」策略，最多只允许一个实例。
- `.md` 拦截路径（`background.js` 的 `tabs.onUpdated` 与 `content-script.js`）共用单个 `chrome.storage.local.pendingFile` 键，多文件并发后写覆盖先写，各实例 `loadPendingFile()` 争用同一键导致加载错乱。

**实现（多实例）**
1. `background.js`：新增 `newInstanceId()`（UUID，带 `crypto.randomUUID` 降级）；`action.onClicked` 改为每次点击都 `chrome.tabs.create('…editor.html?i=<uuid>')`，可打开任意多个实例；`tabs.onUpdated` 拦截 `.md` 时写入独立的 `pendingFile_<uuid>` 并 `?i=` 重定向。
2. `content-script.js`：写入 `pendingFile_<uuid>` 并以 `?i=<uuid>` 重定向。
3. `editor.js`：`loadPendingFile()` 读取 URL 上的 `?i=` 实例 ID，加载专属 `pendingFile_<uuid>`；无实例 ID 时回退 legacy `pendingFile` 键（兼容）。
- 副作用（预期行为）：`localStorage` 中的主题 / 视图 / 侧栏偏好同源共享，多实例 UI 风格保持一致。

### 需求 C：预览编辑回写时丢失居中 / 高亮 / 字号样式标签

**根因**：`convertNode()` 对 `<center>/<font>/<span>/<mark>` 走 `default` 分支，只保留内部文本、丢弃标签本身。用户在右侧预览区编辑含这些样式的文本并失焦后，居中 / 高亮 / 字号格式丢失。

**实现**：新增 `reconstructRawTag(node)`，按元素原始属性（`face`/`color`/`size`/`style` 等）重建原始 HTML 片段，使这四类标签在「预览 HTML → Markdown 源码」往返中无损保留。

### 需求 D：工具栏新增居中 / 高亮 / 字号按钮

**实现**
- `src/editor.html`：在格式化组后新增 `#styleGroup`（5 个按钮 + `#fontSizeDropdown` 字号下拉）。
- `src/editor.js`：新增通用 `wrapWithRaw(before, after, placeholder)`（有选区包裹 / 无选区插占位文本）与 `initFontSizeDropdown()`；字号下拉 6 项通过 `data-before/data-after/data-placeholder` 复用同一函数。
- `src/editor.css`：新增 `.toolbar-btn.text-btn` 与 `.dropdown`/`.dropdown-menu`/`.dropdown-item` 样式。

**插入的精确格式（markdown-it 已开启 `html: true`，原始片段透传渲染）**

| 按钮 | 包裹片段（before … after） | 无选区插入结果 |
|------|---------------------------|--------------|
| 居中+加粗 | `<center><b>` … `</b></center>` | `<center><b>居中+加粗</b></center>` |
| 居中+加粗+红色 | `<center><b><font color="red">` … `</font></b></center>` | `<center><b><font color="red">居中+加粗+红色</font></b></center>` |
| 居中+加粗+蓝色 | `<center><strong><span style="color: blue;">` … `</span></strong></center>` | `<center><strong><span style="color: blue;">居中+加粗+蓝色</span></strong></center>` |
| 文本高亮 | `<mark>` … `</mark>` | `<mark>文本高亮</mark>` |
| 文本高亮+加粗 | `<mark>**` … `** </mark>` | `<mark>**文本高亮+加粗** </mark>` |
| 修改字号（下拉 6 项） | 见 `editor.js` `initFontSizeDropdown` | `<font face="仿宋">这是宋体</font>` 等（仿宋/楷体 × 红/蓝/默认 × size） |

> 注意：`<center>` / `<font>` 为已废弃但 Chrome 仍支持的 HTML 标签，与原始需求规格一致。

### 验证
- `node --check` 三个 JS 文件均通过。
- 现有 11 个测试（`node --test`）全部通过。

---

## 2026-07-07 第九阶段：高亮占位符规格调整 + 文档 / 构建同步

### 本轮修改
1. **高亮按钮占位符去尾空格**：`btnHighlight` 的占位文本由 `'文本高亮 '` 改回 `'文本高亮'`，无选区插入结果由 `<mark>文本高亮 </mark>` 调整为 `<mark>文本高亮</mark>`（与本轮需求一致）；`btnHighlightBold` 仍保留尾部空格（规格 `<mark>**文本高亮+加粗** </mark>`）。
2. **文档同步**：`README.md` 增加新功能说明与「构建与本地测试」章节；`DEVLOG.md` 重构第八阶段、新增本阶段，补全预览空行修复、多实例、样式标签保留等全部改动记录。
3. **版本**：`manifest.json` 升至 `1.3.0`，与功能增量保持一致。

### 构建与本地测试（详细步骤见 README「构建与本地测试」）
- `npm install` → `npm run build` → 在 `chrome://extensions/` 开启开发者模式 → 「加载已解压的扩展程序」选择 `dist/` → 开启「允许访问文件网址」。
- 验证：点击扩展图标可开多个实例；工具栏居中 / 高亮 / 字号按钮按规格插入；分屏预览编辑不再累加空行。

---

## 2026-07-25 桌面端 EXE 集成（Tauri）—— 独立 Windows 程序，本地零安装

### 目标
将浏览器扩展改造为可独立运行的 Windows EXE，且保持「扩展 + EXE 同仓同 CI、一次打标签自动双出、本地零安装编译」。

### 架构与落点
- **编辑器核心**：`src/editor.html/.js/.css`（CodeMirror 6 + markdown-it + mermaid）保持纯 Web，扩展与桌面共用，业务代码零改动。
- **丢弃的扩展胶水**：`public/background.js`、`content-script.js`、`manifest.json` 仅浏览器集成用，桌面程序不需要。
- **桌面壳**：新增 `desktop/`（Tauri v2：`Cargo.toml`、`tauri.conf.json`、`capabilities`、`src/main.rs`/`lib.rs`/`build.rs`、图标脚本 `make-ico.mjs`）。
- **垫片 `src/desktop-shims.js`**（在 Chrome 扩展内自动跳过）：
  - `chrome` 垫片：恢复「会话恢复 / 翻译设置持久化」（`session-restore.js`/`translate.js` 原用 `chrome.storage`）。
  - File System Access API polyfill：用 Tauri `dialog`/`fs` 实现 `showOpenFilePicker`/`showSaveFilePicker`/`showDirectoryPicker` + 文件/目录句柄，覆盖打开/保存/另存/打开文件夹/图片内嵌。
- **入口**：新增 `src/index.html` 重定向供 Tauri 加载 `dist/src/index.html`；`vite.config.js` 增加 index 构建入口；根 `package.json` 增加 `@tauri-apps/api`、`@tauri-apps/plugin-dialog`、`@tauri-apps/plugin-fs`。

### CI / 自动化（远端编译，本地零安装）
- 新增 `.github/workflows/desktop-build.yml`：在 GitHub `windows-latest` 用 Rust + Tauri 构建 EXE；`permissions: contents: write` 解决 Release 发布 403。
- 与现有 `ci.yml`（扩展 zip）同时由 `tags: ["v*"]` 触发 → **一次打 `v*` 标签自动同时产出扩展和 EXE**。
- 实证：`v1.4.4-desktop` 标签一次出包（setup.exe ~2.5MB + msi ~3MB，依赖系统 WebView2，未打包运行时）。

### 合并与清理
- 把桌面壳合并进 `main`（合并提交 `34960f0`，基于领先代码 v1.4.4 `c39e3be`；仅 `package.json` 一处冲突已取 v1.4.4 版本解决，未覆盖任何领先代码；受保护标签 `v1.4.4` 未移动）。
- 合并后核验：`git merge-base --is-ancestor v1.4.4 origin/main` 为 YES（v1.4.4 领先代码已全部进入 main）；`desktop/`(10 文件) + `src/desktop-shims.js` + `src/index.html` 均在 main。
- 清理无用分支 `feat/tauri-desktop`（已完全合入 main）。
- 未来演进：在 main 上 bump 版本 → `git tag v1.4.5` → `git push origin v1.4.5`，即自动双出；本地无需安装 Rust/Tauri/WebView2。

### 验证
- 根 `npm ci` + `vite build` 通过，生成 `dist/src/editor.html` 与 `dist/src/index.html`。
- `v1.4.4-desktop` 标签触发 `CI`(扩展) + `Desktop Build`(EXE) 双构建均 success；推 main 再触发双构建，佐证演进自动跟随。

---

## 2026-07-26 桌面端 EXE 排障与版本对齐（1.4.5 → 1.4.8）

v1.4.4 合并进 `main` 后，桌面 EXE 在实测中连续出现「双击 .md 打不开」「拖入 .md 打不开」，经历 1.4.5 → 1.4.6 → 1.4.7（诊断）→ 1.4.8（修复）四轮演进。

### 1.4.5：vite 静默删除外置 `<script>`（根因之一）

- 现象：开启 `withGlobalTauri` 之后 EXE 仍只显示初始界面、且**无任何 toast**。
- 定位：原 `src/editor.html` 里 `<script type="module" src="./desktop-shims.js">` 在 vite `build` 时被**静默删除**——HTML 中未列入 rollup `input` entry 的外部脚本会被丢弃，导致 `dist/assets/editor.js` 里**完全没有 TFileHandle / showOpenFilePicker 垫片**；`openFileByPath` 内 `window.__tauriFileHandle` 始终 `undefined`，命中 `if (typeof factory !== 'function') return;` 静默退出。
- 修复：`src/editor.js` 顶部 `import './desktop-shims.js';`（vite 视作编辑器依赖一并打包），并同步移除外置 `<script>` 标签避免重复执行。

### 1.4.6：版本号一致性（元数据）

- v1.4.5 把 `package.json` / `desktop/package.json` 升到 1.4.5，但漏改 `public/manifest.json` 与 `desktop/tauri.conf.json`，导致扩展 zip 内 manifest 版本、EXE 文件属性版本仍停在 1.4.4。
- 本次把四个 version 字段统一升到 1.4.6（后续 1.4.7 / 1.4.8 同步跟进，含 `src/editor.js` 内 `APP_VERSION`）。

### 1.4.7：诊断构建（含探针，已被 1.4.8 取代）

- 为定位「双击 / 拖入均打不开」根因，临时新增一套全程监测探针：`src/probe.js` 导出 `PROBE(tag, detail)`（→ `console.log` + `invoke('probe_log')` 写 EXE 同目录 `md_editor_probe.log`）、Rust `probe_log` 命令、各 `// ===== PROBE START/END =====` 埋点。
- 三份日志确证：
  - `shim:done :: __tauriFileHandle=undefined enteredFsShim=false` → FS 垫片根本没装。
  - `ofbp:no-factory` → `openFileByPath` 因工厂 undefined 静默 return（这正是「无任何提示」的原因）。
  - 拖入场景 `argv` 无路径（符合预期），但 `listen('tauri://drop')` 事件在 WebView2 下从不触发 → 拖放链路失效。
- **核心根因**：`desktop-shims.js` 原守卫 `if (isTauri && typeof window.showOpenFilePicker === "undefined")`。但 Tauri v2 的 WebView2 中 `window.showOpenFilePicker` 是**原生函数**（即便在沙箱中不可用），导致 `=== "undefined"` 为 false → 整个 FS Access 垫片分支不执行。

### 1.4.8：根因修复 + 彻底移除探针

- **双击打不开**：守卫由 `if (isTauri && ...)` 改为 `if (isTauri)`，在 Tauri 下**无条件**安装 FS 垫片（WebView2 里 `showOpenFilePicker` 原生存在但不可用，必须强制 polyfill）。
- **拖入打不开**：改用 Tauri v2 稳定的 `getCurrentWebview().onDragDropEvent()`（取 `payload.paths` 打开首个 `.md`），替代不可靠的 `listen('tauri://drop')`。
- **防御性提示**：`openFileByPath` 在 `window.__tauriFileHandle` 仍非函数时改为弹可见错误 toast，不再静默 return。
- **彻底移除全部探针**：删 `src/probe.js`、Rust `probe_log` 命令及注册、`editor.js`/`desktop-shims.js` 内所有 `PROBE` 块（共删 231 行），代码恢复干净。
- 版本号四文件 + `APP_VERSION` 统一为 1.4.8；推 `v1.4.8-desktop` 标签，CI + Desktop Build 双构建均 success，Release 含 `chrome-md-editor-v1.4.8.zip` 与 `Markdown.Editor_1.4.8_portable.exe`。
- 用户实测：双击 .md 直接打开、启动后拖入 .md 也能打开，功能正常。

### 排障经验（桌面端三大坑，已沉淀到 MEMORY）

1. **Tauri v2 运行时注入**：`withGlobalTauri: true` 必须开，否则 `window.__TAURI_INTERNALS__` 不注入，`isTauri` 判定 / `openInitialCliFile` 守卫 / `@tauri-apps/api` 的 `invoke` 全部静默失败。
2. **vite 静默删除 HTML 外置脚本**：HTML 中未列入 rollup `input` 的依赖脚本会被丢弃；可靠做法是在 JS entry 里 `import`，而非在 HTML 写外置 `<script src>`。
3. **WebView2 中 `showOpenFilePicker` 是原生函数**：不能再用 `typeof === "undefined"` 判断是否缺失，必须直接按 `isTauri` 安装 polyfill。
4. **可靠拖放**：用 `getCurrentWebview().onDragDropEvent()`，不要用 `listen('tauri://drop')`。
5. **本地无 Rust 工具链**：所有 Rust 编译错误只能靠 `desktop-build.yml`（windows-latest）CI 暴露，提交前严格自审 `desktop/src/lib.rs`（trait 导入、所有权、迭代器 `.cloned()`/`.map()` 适配）。

---

## 2026-08-01 第十阶段：第一批 A 级可吸纳功能（借鉴 MarKing）

### 背景
复盘 GitHub 仓库 `l06066hb/MarKing` 的可吸纳项评估（只读），确认其公开仓无应用源码（CI 从私有 Gitee 拉取），故基于本地 Chrome-Markdown-Edit 架构自行实现第一批 A 级项：A-3 大纲、A-6 代码块语言补全、A-7 Callout、A-8 专注/打字机、A-9 Base64 折叠、A-10 Mermaid 缩放、A-12 任务面板。

### 实施
- 7 个独立模块：`src/outline.js` / `codeblock-complete.js` / `callout.js` / `focus-mode.js` / `base64-fold.js` / `mermaid-zoom.js` / `tasklist-panel.js`，经 `src/editor.js` / `src/editor.html` / `src/editor.css` 与 `desktop/src/lib.rs` 集成。
- 全模块遍布临时探针（`src/probe.js` 增强版）：支持环境快照、自动错误捕获、独立写出 log 文件，可经 `// ===== PROBE START/END =====` 标记彻底回收。

### 验证
- `vite build` 通过；`npm test` 75/76 通过。唯一失败为 Windows 本机 `tmpdir()` 路径双盘符 `D:\D:\` 的预存在环境问题（`tests/issue-acceptance.test.js`，与 A 级改动无关，CI Linux 应通过）。

### 分支与迁移
- 实现落于 `feat/batch-a-features`。因上一轮会话误将工作区落在 `feat/editor-find-replace-bracket`，本次通过 `git stash -u` + 切换 batch 分支并快进合并至 bracket 尖端 `33991ce` + `git stash pop` 零冲突迁移回 `feat/batch-a-features`；`feat/editor-find-replace-bracket` 恢复为仅含其自身提交的干净状态。

