// 弱测试：仅校验 editor.css 在 TOOLBAR_RESPONSIVE 标记之后追加了响应式修复，
// 即含 flex-wrap 或 overflow-x（不依赖任何外部依赖，node --test 内置运行）。
// 本功能为纯 CSS，无逻辑可执行，故仅做字符串断言。
const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const CSS = fs.readFileSync(
  path.join(__dirname, "..", "src", "editor.css"),
  "utf8"
);

const MARKER = "MARKRA_CSS: TOOLBAR_RESPONSIVE";

test("editor.css 含 TOOLBAR_RESPONSIVE 集成标记", () => {
  assert.ok(
    CSS.includes(MARKER),
    "缺少 MARKRA_CSS: TOOLBAR_RESPONSIVE 标记"
  );
});

test("TOOLBAR_RESPONSIVE 标记后追加了响应式修复（flex-wrap 或 overflow-x）", () => {
  const idx = CSS.indexOf(MARKER);
  const after = CSS.slice(idx);
  assert.ok(
    /flex-wrap/.test(after) || /overflow-x/.test(after),
    "标记后未找到 flex-wrap 或 overflow-x，响应式修复缺失"
  );
});
