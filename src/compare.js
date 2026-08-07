// compare.js — 对比合并页面入口与控制器（T1 骨架 + T2/T4/T4b 整合）
//
// 职责：
//   1. 读取 window.__compareMount 提供的挂载约定（root / mountPoints / fileSlots / imageDrop）。
//   2. 根据工具栏按钮切换「两栏 / 三栏」两种视图（对比/合并必为两栏或三栏，无单栏）。
//   3. 绑定文件选择、块导航、图片插入、导出结果 / 导出 diff 报告。
//
// 模块契约（静态 import，文件名固定，由对应 Agent 交付；统一 build 由测试 Agent 执行）：
//   - compare-merge.js        → createCompareMergeView        （本文件新建）
//   - compare-line-markers.js → applyCompareLineMarkers       （本文件新建）
//   - compare-nav.js          → bindChunkNavigation           （本文件新建）
//   - compare-files.js        → pickFiles                     （UI-B 交付）
//   - compare-images.js       → insertImagesAtCursor / bindCompareEditorView / bindImageToolbarButton （UI-B 交付）
//   - compare-export.js       → exportResult                  （逻辑 Agent 交付）
//   - compare-diff-export.js  → exportDiffReport              （逻辑 Agent 交付）
//
// 禁用类名闸门：
//   严禁使用方案列明的禁用类名。本文件按钮统一用 compare-toolbar-btn。

import { markdown } from "@codemirror/lang-markdown";
import { EditorView } from "@codemirror/view";
import { oneDark } from "@codemirror/theme-one-dark";

import { createCompareMergeView } from "./compare-merge.js";
import { applyCompareLineMarkers } from "./compare-line-markers.js";
import { bindChunkNavigation, bindChunkNavigationKeys } from "./compare-nav.js";
import { pickFiles, enableFileDropZone } from "./compare-files.js";
import {
  bindCompareEditorView,
  bindImageToolbarButton,
} from "./compare-images.js";
import { exportResult } from "./compare-export.js";
import { exportDiffReport } from "./compare-diff-export.js";
// 主题同步复用主编辑器的权威函数，保证对比页 data-theme/data-editor-theme/data-skin
// 与「编辑器主题预设 kind」完全一致（而非 light/dark 开关键），缺省回退默认预设/经典配色。
import { applyEditorThemePreset, getStoredEditorTheme } from "./theme-presets.js";
import { getColorScheme } from "./md-theme-tokens.js";
import { initToolbarScroll } from "./toolbar-scroll.js";

(function bootstrapCompare() {
  // 挂载点直接取自 compare.html 中定义的 DOM 节点（不再依赖 window.__compareMount，
  // 该约定在 compare.html 中并未注入，否则会导致整页无法初始化）。
  const root = document.getElementById("compareRoot");
  const mountPoints = {
    two: document.getElementById("viewTwo"),
    three: document.getElementById("viewThree"),
  };
  const fileSlots = {
    a: document.getElementById("fileSlotA"),
    b: document.getElementById("fileSlotB"),
  };
  if (!root || !mountPoints.two || !mountPoints.three) {
    console.error(
      "[compare] 未找到必要的挂载节点（#compareRoot / #viewTwo / #viewThree）"
    );
    return;
  }

  // ── 运行时状态 ──
  /** @type {{a:?{name:string,content:string}, b:?{name:string,content:string}, result?:?string}} */
  const files = { a: null, b: null, result: null };
  let mode = "two"; // 'two' | 'three'
  let instance = null; // 当前视图实例
  // 跳过下一次 render 的「编辑回写」：仅在「重新载入文件（onPickFiles / 拖拽）」时置位，
  // 避免 render() 顶部的 saveCurrentEdit 用陈旧/空的编辑器文档覆盖刚载入的文件内容
  // （否则两栏/三栏编辑器恒为空，差异高亮/导航/折叠/接受块全部失效）。
  let skipSaveOnNextRender = false;
  // 图片插入 / 光标坐标所用的活动编辑器视图（与 bindCompareEditorView 绑定的视图同源）
  let activeView = null;

  // ── 主题同步：复用主编辑器的权威主题应用函数，使对比页与主 UI 主题/配色/皮肤完全一致（修复已知问题4）──
  // 关键事实：主编辑器 data-theme 由「编辑器主题预设的 kind」决定（editor.js:2178 → applyEditorThemePreset，
  // 其内部 data-theme = kind==='dark'?'dark':'light'），而非 light/dark 开关键；且 data-editor-theme /
  // data-color-scheme 在缺省时用默认预设/经典配色。直接复用同一组函数，可保证默认配置与暗色预设下均一致。
  let currentTheme = 'light';
  function applyCompareTheme() {
    const t = localStorage.getItem('md-editor-theme') || 'light';
    currentTheme = t;                       // 供 baseExtensions() 决定 CM6 oneDark 轴（与主编辑器同一开关键）
    applyEditorThemePreset(getStoredEditorTheme());   // data-theme(预设kind) / data-editor-theme / data-skin=glass
    document.documentElement.setAttribute('data-color-scheme', getColorScheme());  // 与主编辑器同一读取键，缺省 classic
    return t;
  }
  applyCompareTheme();
  // 主 UI 切换主题后（同源 localStorage 变更）实时同步对比页
  window.addEventListener('storage', (e) => {
    if (e.key && /md-editor-(theme|editor-theme|color-scheme|skin)/.test(e.key)) {
      applyCompareTheme();
      try { render(); } catch (_) {}
    }
  });

  // 公共扩展：markdown 语法高亮 + 行号差异标记
  function baseExtensions() {
    const ext = [markdown(), EditorView.lineWrapping, applyCompareLineMarkers()];
    if (currentTheme === 'dark') ext.push(oneDark);
    return ext;
  }

  // ── DOM 查询 ──
  const $ = (id) => document.getElementById(id);
  const btnViewTwo = $("btnViewTwo");
  const btnViewThree = $("btnViewThree");
  const btnPrevChunk = $("btnPrevChunk");
  const btnNextChunk = $("btnNextChunk");
  const btnPickFiles = $("btnPickFiles");
  const btnExportResult = $("btnExportResult");
  const btnExportDiff = $("btnExportDiff");
  const btnAddImages = $("btnAddImages");
  const btnToggleCollapse = $("btnToggleCollapse");
  const btnAcceptTheirs = $("btnAcceptTheirs");

  // 注入扩展版本戳：版本唯一事实源 = package.json，Vite 构建时经 __APP_VERSION__ 注入，
  // 运行时兜底 1.8.7（与 editor.js 保持一致，避免 compare 页版本戳写死漂移）。
  const APP_VERSION = typeof __APP_VERSION__ !== "undefined" ? __APP_VERSION__ : "1.8.7";
  const verEl = $("compareVersion");
  if (verEl) verEl.textContent = `v${APP_VERSION}`;

  const viewButtons = {
    two: btnViewTwo,
    three: btnViewThree,
  };
  const viewEls = {
    two: mountPoints.two,
    three: mountPoints.three,
  };

  // ── 文件槽 UI 更新 ──
  function setSlotText(slot, file) {
    if (!slot) return;
    const nameEl = slot.querySelector(".compare-file-name");
    if (nameEl) {
      nameEl.textContent = file
        ? file.name
        : (slot.dataset.slot === "a" ? "Yours" : "Theirs") + "（未选择）";
    }
  }

  // ── 销毁旧实例并清空挂载点 ──
  function teardown() {
    if (instance) {
      try {
        instance.destroy();
      } catch (e) {
        console.error("[compare] 销毁旧视图失败:", e);
      }
      instance = null;
    }
    bindCompareEditorView(null);
    activeView = null;
    for (const key of Object.keys(viewEls)) {
      const el = viewEls[key];
      if (el) {
        el.innerHTML = "";
        el.hidden = true;
      }
    }
  }

  // ── 渲染当前模式 ──
  function render() {
    // 保存当前编辑内容，避免模式切换 / 重渲染丢失（修复 E1-01/02：无声数据丢失）
    // 但「重新载入文件」场景（onPickFiles / 拖拽）会先置 skipSaveOnNextRender，
    // 跳过本次回写，否则会用陈旧编辑器文档覆盖刚载入的文件内容。
    if (!skipSaveOnNextRender && instance) {
      try {
        if (mode === "two") {
          if (instance.a)
            files.a = files.a
              ? { ...files.a, content: instance.a.state.doc.toString() }
              : { name: "Yours", content: instance.a.state.doc.toString() };
          if (instance.b)
            files.b = files.b
              ? { ...files.b, content: instance.b.state.doc.toString() }
              : { name: "Theirs", content: instance.b.state.doc.toString() };
        } else if (mode === "three") {
          if (instance.a)
            files.a = files.a
              ? { ...files.a, content: instance.a.state.doc.toString() }
              : { name: "Yours", content: instance.a.state.doc.toString() };
          files.result = instance.b ? instance.b.state.doc.toString() : ""; // 中间结果可编辑，必须回写
          if (instance.theirsView)
            files.b = files.b
              ? { ...files.b, content: instance.theirsView.state.doc.toString() }
              : { name: "Theirs", content: instance.theirsView.state.doc.toString() };
        }
      } catch (e) {
        console.error("[compare] 保存编辑内容失败:", e);
      }
    }
    skipSaveOnNextRender = false; // 一次性跳过已消费，后续 render（模式切换等）恢复回写
    teardown();
    const aFile = files.a || { name: "Yours", content: "" };
    const bFile = files.b || { name: "Theirs", content: "" };
    const target = viewEls[mode];
    if (!target) return;
    target.hidden = false;

    try {
      if (mode === "two") {
        instance = createCompareMergeView({
          layout: "two",
          a: aFile,
          b: bFile,
          extensions: baseExtensions(),
          parent: target,
        });
        // 两栏的可编辑目标面板 = MergeView 的 b 面板（与三栏一致）
        bindCompareEditorView(instance.b);
        activeView = instance.b;
      } else if (mode === "three") {
        instance = createCompareMergeView({
          layout: "three",
          a: aFile,
          b: bFile, // 作为 Theirs 参考；Result 由 MergeView 生成（空/上次保留，逐步合并）
          result: files.result,
          extensions: baseExtensions(),
          parent: target,
        });
        // 三栏的可编辑结果面板 = MergeView 的 b 面板
        bindCompareEditorView(instance.b);
        activeView = instance.b;
      }
    } catch (e) {
      console.error("[compare] 渲染视图失败:", e);
      target.innerHTML = "";
      const hint = document.createElement("div");
      hint.className = "compare-empty-hint";
      hint.textContent = "渲染失败：" + (e && e.message ? e.message : String(e));
      target.appendChild(hint);
    }

    // 高亮当前视图按钮
    for (const key of Object.keys(viewButtons)) {
      const btn = viewButtons[key];
      if (btn) btn.classList.toggle("active", key === mode);
    }

    // 同步折叠状态与按钮文案（跨模式切换保持一致）
    if (instance && typeof instance.setCollapse === "function") {
      instance.setCollapse(collapsed);
    }
    if (btnToggleCollapse) {
      btnToggleCollapse.textContent = collapsed ? "展开未改" : "折叠未改";
    }

    // M3：「接受 Theirs 块」仅在三栏模式可用（两栏实例返回 false）
    if (btnAcceptTheirs) {
      btnAcceptTheirs.disabled = mode !== "three";
      btnAcceptTheirs.classList.toggle("disabled", mode !== "three");
    }
  }

  // ── 视图切换 ──
  function switchMode(next) {
    if (next === mode) {
      render();
      return;
    }
    mode = next;
    render();
  }

  // ── 块导航（增量 B）：用当前实例的 navView ──
  function navNext() {
    if (instance && instance.navView) bindChunkNavigation(instance.navView).next();
  }
  function navPrev() {
    if (instance && instance.navView) bindChunkNavigation(instance.navView).prev();
  }

  // ── 文件选择 ──
  async function onPickFiles() {
    try {
      const picked = await pickFiles();
      if (!picked || !picked.length) return;
      files.a = picked[0] || null;
      files.b = picked[1] || null;
      files.result = null; // 新选文件 → 重置合并结果
      setSlotText(fileSlots.a, files.a);
      setSlotText(fileSlots.b, files.b);
      skipSaveOnNextRender = true; // 重新载入：跳过 render 的编辑回写，保留刚载入的文件内容
      render();
    } catch (e) {
      // 用户取消选择：忽略 AbortError
      if (!(e && e.name === "AbortError")) {
        console.error("[compare] 选择文件失败:", e);
      }
    }
  }

  // ── 导出结果 ──
  async function onExportResult() {
    if (!instance) return;
    const content = instance.getResult();
    try {
      await exportResult(content, "merged.md");
    } catch (e) {
      // 用户取消保存：忽略 AbortError
      if (!(e && e.name === "AbortError")) {
        console.error("[compare] 导出结果失败:", e);
      }
    }
  }

  // ── 导出 diff 报告（增量 F） ──
  async function onExportDiff() {
    const a = files.a ? files.a.content : "";
    const b = instance ? instance.getResult() : files.b ? files.b.content : "";
    try {
      await exportDiffReport(a, b, "diff.diff");
    } catch (e) {
      // 用户取消保存：忽略 AbortError
      if (!(e && e.name === "AbortError")) {
        console.error("[compare] 导出 diff 失败:", e);
      }
    }
  }

  // ── 折叠 / 展开未改（增量 E） ──
  let collapsed = true;
  function onToggleCollapse() {
    collapsed = !collapsed;
    if (!instance) return;
    if (typeof instance.setCollapse === "function") {
      instance.setCollapse(collapsed);
    }
    if (btnToggleCollapse) {
      btnToggleCollapse.textContent = collapsed ? "展开未改" : "折叠未改";
    }
  }

  // ── 接受 Theirs 块（三栏专用，增量 T4 逐块 Accept） ──
  function onAcceptTheirs() {
    if (instance && typeof instance.acceptTheirsAt === "function") {
      instance.acceptTheirsAt();
    }
  }

  // ── 绑定工具栏按钮 ──
  if (btnViewTwo) btnViewTwo.addEventListener("click", () => switchMode("two"));
  if (btnViewThree) btnViewThree.addEventListener("click", () => switchMode("three"));
  if (btnPrevChunk) btnPrevChunk.addEventListener("click", navPrev);
  if (btnNextChunk) btnNextChunk.addEventListener("click", navNext);

  // ── 块导航快捷键：复用按钮点击的同一组 navNext / navPrev（B / ] 下一块，Shift+B / [ 上一块） ──
  bindChunkNavigationKeys({ next: navNext, prev: navPrev });
  if (btnPickFiles) btnPickFiles.addEventListener("click", onPickFiles);
  if (btnExportResult) btnExportResult.addEventListener("click", onExportResult);
  if (btnExportDiff) btnExportDiff.addEventListener("click", onExportDiff);
  if (btnToggleCollapse) btnToggleCollapse.addEventListener("click", onToggleCollapse);
  if (btnAcceptTheirs) btnAcceptTheirs.addEventListener("click", onAcceptTheirs);

  // v1.8.5：工具栏横向溢出滚动按钮（已知问题3，对比页同源）
  initToolbarScroll("#compareToolbar");

  // ── 图片插入（T5）：绑定「图片」按钮到当前活动编辑器 ──
  if (btnAddImages) {
    bindImageToolbarButton(btnAddImages, {
      // NEW-2：取当前活动编辑器视图的光标，确保与 activeEditorView（图片插入目标）同源
      getCursor: () => {
        if (activeView && activeView.state) {
          return activeView.state.selection.main.head;
        }
        return 0;
      },
    });
  }

  // ── 文件拖拽（E4-01）：拖入文件区即载入为 Yours / Theirs，无需走文件框 ──
  const dropZone = document.getElementById("compareFiles");
  if (dropZone) {
    enableFileDropZone(dropZone, {
      accept: ".md,.markdown,.mdown,.mkd,.mkdn,.txt",
      onFiles: (dropped) => {
        if (!dropped || !dropped.length) return;
        files.a = dropped[0] || files.a;
        files.b = dropped[1] || files.b;
        files.result = null; // 新载入 → 重置合并结果
        setSlotText(fileSlots.a, files.a);
        setSlotText(fileSlots.b, files.b);
        skipSaveOnNextRender = true; // 拖入新文件：跳过 render 编辑回写，保留刚拖入的文件内容
        render();
      },
    });
  }

  // ── 调试钩子（仅当 cmp-debug=1 时暴露，生产默认不暴露，便于自动化探针读取真实状态） ──
  if (localStorage.getItem("cmp-debug") === "1") {
    window.__cmp = {
      get instance() {
        return instance;
      },
      get files() {
        return files;
      },
      get mode() {
        return mode;
      },
      render,
      switchMode,
    };
  }

  // 默认渲染两栏（空文档），保证页面有可见内容
  render();
})();
