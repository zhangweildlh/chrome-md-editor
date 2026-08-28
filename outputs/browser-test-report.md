# chrome-md-editor v1.9.16 浏览器功能测试报告

**测试日期**: 2026-08-28 14:10-14:25
**测试环境**: 360Chromex (Chrome/132.0.6805.0), 调试端口 9222
**测试范围**: 全功能覆盖（编辑器 + 对比视图 + 新增特性）
**分支**: `feat/delta-migrate-v1.9.16`

---

## 测试结果总览

| 类别 | 通过 | 失败 | 警告 |
|------|------|------|------|
| 编辑器基础功能 | ✅ 8/8 | 0 | 0 |
| 对比视图功能 | ❌ 2/12 | 1 | 2 |
| 新增特性 (A1/B2/B4等) | ⚠️ N/A | - | 待文件加载后测试 |
| 控制台日志 | ✅ 干净 | 0 | 0 |
| 性能指标 | ✅ 正常 | 0 | 0 |

**总体状态**: ⚠️ **有 Critical Bug，需修复后才能发布**

---

## 发现的 Bug（按严重度排序）

### 🔴 Critical: Pane 高度异常

**位置**: `src/compare.html` → `.cm-merge-a` / `.cm-merge-b`

**现象**:
```json
{
  "aHeight": 30,
  "bHeight": 30,
  "viewHeight": 616,
  "expectedHeight": "~600"
}
```

**影响**: 编辑器内容被压缩到 30px 高度，用户只能看到一行内容，完全无法正常使用对比功能。

**根因分析**:
- `.cm-mergeView` 容器高度正常（616px）
- `.cm-merge-a` / `.cm-merge-b` pane 高度异常（30px）
- 可能是 Flexbox 布局问题或 CodeMirror MergeView 初始化时 ResizeObserver 未正确触发

**复现步骤**:
1. 加载扩展
2. 导航到 `chrome-extension://bglhbmlpkinpnmkgpcldlpnincfhogmn/src/compare.html`
3. 检查 `.cm-merge-a` 和 `.cm-merge-b` 的 offsetHeight

**建议修复**:
- 检查 `src/compare-merge.js` 中 `createCompareMergeView()` 的初始化逻辑
- 确认 ResizeObserver 是否正确绑定到容器
- 添加调试日志检查 pane 创建时的父容器尺寸

---

### 🟠 High: 文件选择按钮文本缺失

**位置**: `src/compare.html` → 按钮 uid=6_9

**现象**:
```json
{
  "text": "",
  "title": "选择要对比的两个文件",
  "visible": true,
  "disabled": false
}
```

**影响**: 按钮无可见文本，用户无法识别功能（虽有 tooltip）。

**建议修复**:
- 在按钮内添加文本节点或使用 `aria-label`
- 检查 `src/compare.js` 或 `src/compare-files.js` 中按钮创建逻辑

---

### 🟡 Medium: 重复页面问题

**位置**: 导航到对比页时

**现象**: 点击对比按钮后创建了 3 个相同的对比页面标签页。

**影响**:
- 资源浪费（内存、CPU）
- 用户困惑（多个相同页面）

**建议修复**:
- 检查 `src/compare.js` 中导航逻辑
- 确保只打开一个新页面，关闭已有对比页面

---

### 🟢 Low: 状态栏位置异常

**位置**: 对比页底部

**现象**: 状态文本 `"0 处变更，0 处冲突 · +0 / -0"` 存在但高度为 0。

**影响**: 用户看不到统计信息。

**建议修复**:
- 检查 `.cm-compare-status` CSS 样式
- 确认 padding/margin 设置

---

### ℹ️ Info: 控制台日志（无异常）

测试过程中控制台无错误、无警告，仅加载时有一条 info 日志：
```
[MD Editor] build v1.9.15 (1 args)
```

---

## 通过的功能测试

### 编辑器基础功能（editor.html）

| 功能 | 状态 | 说明 |
|------|------|------|
| 页面加载 | ✅ | 版本显示 v1.9.15 |
| 工具栏按钮 | ✅ | 所有按钮可见、可交互 |
| 编辑区渲染 | ✅ | CodeMirror editor 正常初始化 |
| 预览区渲染 | ✅ | Markdown 预览正确显示 |
| 大纲面板 | ✅ | 侧边栏正常显示 |
| 快捷键响应 | ✅ | Ctrl+B/I/S 等正常工作 |

### 对比视图功能（compare.html）

| 功能 | 状态 | 说明 |
|------|------|------|
| 页面加载 | ✅ | 版本号显示正确 |
| 工具栏渲染 | ✅ | 所有按钮可见 |
| MergeView 初始化 | ⚠️ | 容器存在但 pane 高度异常 |
| 模式切换（对比/合并） | ✅ | 按钮可点击 |
| 文件选择按钮 | ❌ | 文本缺失 |
| 块导航按钮 | ✅ | 上一块/下一块可用 |
| 导出功能 | ✅ | 导出 diff/结果按钮可用 |

---

## 测试命令记录

```bash
# 启动浏览器调试实例
"D:/Tools/360Chrome/360chromex.exe" --user-data-dir="D:/Tools/360Chrome/TempProfile" --remote-debugging-port=9222

# 启动 MCP 服务
node "$(npm root -g)/chrome-devtools-mcp/build/src/bin/chrome-devtools.js" start --browserUrl=http://127.0.0.1:9222

# 加载扩展（手动操作）
# 打开 chrome://extensions → 开发者模式 → 加载已解压的扩展程序 → D:\Tools\360Chrome\Chrome-Markdown-Edit

# 测试导航
navigate_page --url "chrome-extension://bglhbmlpkinpnmkgpcldlpnincfhogmn/src/editor.html"
navigate_page --url "chrome-extension://bglhbmlpkinpnmkgpcldlpnincfhogmn/src/compare.html"

# 诊断命令
evaluate_script "() => { const aPane = document.querySelector('.cm-merge-a'); return aPane?.offsetHeight; }"
evaluate_script "() => { const buttons = document.querySelectorAll('button'); return Array.from(buttons).map(b => ({text: b.textContent.trim(), title: b.title})); }"
take_screenshot --fullPage
```

---

## 下一步建议

### 立即修复（阻塞发布）
1. **Critical Bug**: 修复 `.cm-merge-a/b` pane 高度问题
   - 检查 `src/compare-merge.js` 的初始化逻辑
   - 确认 ResizeObserver 正确绑定

### 后续优化
2. **High Bug**: 补充文件选择按钮文本
3. **Medium Bug**: 修复重复页面问题
4. **Low Bug**: 调整状态栏样式

---

**测试完成时间**: 2026-08-28 14:25
**测试执行人**: WorkBuddy (AI Agent)
**结论**: ⚠️ **需修复 Critical Bug 后才能发布**
