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
import { pickFiles, pickSingleFile, enableFileDropZone } from "./compare-files.js";
import {
  bindCompareEditorView,
  bindImageToolbarButton,
  createImageUploadArea,
} from "./compare-images.js";
import { exportResult } from "./compare-export.js";
import { exportDiffReport } from "./compare-diff-export.js";
// 活动栏（用户最后聚焦的栏）状态与保存链路
import {
  setActivePane,
  getActivePane,
  saveActivePane,
} from "./compare/save.js";
// 批量接受块（chunk-ops 纯函数层）：应用所有非冲突块，单次 dispatch 不漂移
import { applyNonConflicting } from "./compare/chunk-ops.js";
// 活动栏描边：必须走 CodeMirror 的 editorAttributes facet，不能手工 classList。
// 详见 pane-active.js 顶部说明（CM 会在焦点变化时整体覆写 .cm-editor 的 class）。
import {
  paneActiveExtension,
  setPaneActiveClass,
  PANE_ACTIVE_CLASS,
} from "./compare/pane-active.js";
// 位置概览侧栏（第三期）：差异缩略条 + 移动连线 + 文档大纲
import { createLocationPane } from "./compare/location-pane.js";
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
  // ── 位置概览侧栏（第三期）──
  /** @type {{update:()=>void, destroy:()=>void}|null} */
  let locationPane = null;
  /** @type {(()=>void)|null} 解绑 instance.onRefresh 的句柄 */
  let unsubscribeLocationPane = null;
  /** @type {(()=>void)|null} 解绑 instance.onRefresh(状态计数/方向按钮) 的句柄 */
  let unsubscribeStatus = null;
  /** 各栏关闭（隐藏）状态，跨 render 保留（关掉某栏后切换两/三栏再切回仍保持） */
  const paneOffState = { a: false, b: false, c: false };
  const LOCATION_PANE_KEY = "md-compare-location-pane";
  // 默认开启：概览是第三期的核心增量，首次进入应能直接看到；用户关掉后经 localStorage 记住。
  let locationPaneVisible = (() => {
    try {
      return localStorage.getItem(LOCATION_PANE_KEY) !== "0";
    } catch (_) {
      return true; // 隐私模式 / storage 被禁：退回默认开启
    }
  })();

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
    const ext = [
      markdown(),
      EditorView.lineWrapping,
      applyCompareLineMarkers(),
      // 每个面板有独立 EditorState，故同一份扩展数组可安全地同时注入 a/b/theirs
      ...paneActiveExtension(),
    ];
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
  const btnToggleLocationPane = $("btnToggleLocationPane");
  const locationPaneEl = $("locationPane");
  const locationPaneResizerEl = $("locationPaneResizer");
  // 「保存」按钮由 compare.html 提供；该按钮可能尚未上线，必须做 null 保护
  const btnSave = $("btnSave");

  // ── 批量合并相关元素（对齐 JetBrains Merge Revisions 顶部栏）──
  const btnApplyNonConflicting = $("btnApplyNonConflicting");
  const btnAcceptLeft = $("btnAcceptLeft");
  const btnAcceptAll = $("btnAcceptAll");
  const btnAcceptRight = $("btnAcceptRight");
  const selHighlightWords = $("selHighlightWords");
  const statusCountEl = $("compareStatusCount");
  const compareViewHeader = $("compareViewHeader");
  const comparePanes = $("comparePanes");
  const btnApplyMerge = $("btnApplyMerge");
  const btnAbortMerge = $("btnAbortMerge");
  const paneTitles = {
    a: $("paneTitleA"),
    b: $("paneTitleB"),
    c: $("paneTitleC"),
  };
  const paneToggles = {
    a: $("paneToggleA"),
    b: $("paneToggleB"),
    c: $("paneToggleC"),
  };

  // 注入扩展版本戳：版本唯一事实源 = package.json，Vite 构建时经 __APP_VERSION__ 注入，
  // 运行时兜底 1.9.0（与 editor.js 保持一致，避免 compare 页版本戳写死漂移）。
  const APP_VERSION = typeof __APP_VERSION__ !== "undefined" ? __APP_VERSION__ : "1.9.0";
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
        : (slot.dataset.slot === "a" ? "本地文件" : "对方文件") + "（未选择）";
    }
  }

  // ── 销毁旧实例并清空挂载点 ──
  function teardown() {
    // 概览侧栏必须【先于】视图实例销毁：它持有 instance.a / instance.b 的引用与
    // scroll 监听，若等视图先毁再毁它，中间任何一次 update() 都会摸到已销毁的 view。
    if (unsubscribeLocationPane) {
      try {
        unsubscribeLocationPane();
      } catch (_) {}
      unsubscribeLocationPane = null;
    }
    // 状态计数 / 方向按钮的 onRefresh 订阅必须【先于】视图实例销毁，否则回调会摸到已销毁的 view。
    if (unsubscribeStatus) {
      try {
        unsubscribeStatus();
      } catch (_) {}
      unsubscribeStatus = null;
    }
    if (locationPane) {
      try {
        locationPane.destroy();
      } catch (e) {
        console.error("[compare] 销毁位置概览失败:", e);
      }
      locationPane = null;
    }
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

  // ── 活动栏视觉标识 ──
  // Ctrl+S /「保存」写回的是【当前活动栏】，这是【写盘】操作：用户必须能一眼确认
  // 「现在会存进哪个文件」，否则极易覆盖错文件。因此活动栏不能只是 save.js 里的一个
  // 模块变量，必须在 DOM 上有对应描边。类名打在 view.dom（即 .cm-editor）上，
  // 由 compare.css 的 #compareRoot 提权规则着色。
  //
  // 【实现要点】类名由 pane-active.js 经 EditorView.editorAttributes facet 交给
  // CodeMirror 自行渲染。绝不可退回 view.dom.classList.add()：CM 在焦点变化时会
  // 整体覆写 .cm-editor 的 class 属性，手工加的类会在用户点一下编辑器时被抹掉
  // （真机实测：render 后类在，点击 .cm-content 后类消失 → 描边丢失、写盘目标不可见）。
  // PANE_ACTIVE_CLASS 从 pane-active.js 导入，保持类名单一事实源。

  // pane 键 → view 的映射与 currentPanes() 严格一致：
  //   两栏 a=Yours, b=Theirs；三栏 a=Yours, b=Result, c=Theirs(theirsView)。
  // 若二者错位，会出现「描边在 A、实际存到 B」这类最危险的不一致。
  function paneViewMap() {
    if (!instance) return {};
    return { a: instance.a, b: instance.b, c: instance.theirsView };
  }

  function applyActivePaneClass() {
    if (!instance) return;
    let active = "a";
    try {
      active = getActivePane();
    } catch (_) {
      /* 取值异常：退回默认 'a'，宁可描边保守也不能无描边 */
    }
    for (const [pane, view] of Object.entries(paneViewMap())) {
      if (!view || !view.dom) continue;
      const shouldBeActive = pane === active;
      // 首选路径：经 editorAttributes 由 CodeMirror 渲染，能扛住 CM 对 class 的整体覆写。
      if (setPaneActiveClass(view, shouldBeActive)) continue;
      // 兜底路径：该 view 未挂载 pane-active 扩展（例如被外部直接构造的视图）。
      // 此路径下的类仍可能被 CM 在下次焦点变化时抹掉，属已知降级，不作为主依赖。
      view.dom.classList.toggle(PANE_ACTIVE_CLASS, shouldBeActive);
    }
  }

  // ── 活动栏跟踪：哪一栏最后获得焦点，Ctrl+S / 「保存」就落到哪一栏 ──
  // 每次 render 都会 teardown 重建 view，DOM 节点是全新的，监听器随旧 DOM 一起被丢弃，
  // 因此这里无需手动解绑，也不会泄漏。
  function bindPaneFocus(view, pane) {
    if (!view || !view.dom) return;
    view.dom.addEventListener("focusin", () => {
      try {
        setActivePane(pane);
      } catch (_) {
        /* 非法 pane 值：忽略，保持上一次活动栏，且不刷新描边（避免与实际保存目标错位） */
        return;
      }
      applyActivePaneClass();
    });
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
              : { name: "本地", content: instance.a.state.doc.toString() };
          if (instance.b)
            files.b = files.b
              ? { ...files.b, content: instance.b.state.doc.toString() }
              : { name: "对方", content: instance.b.state.doc.toString() };
        } else if (mode === "three") {
          if (instance.a)
            files.a = files.a
              ? { ...files.a, content: instance.a.state.doc.toString() }
              : { name: "本地", content: instance.a.state.doc.toString() };
          files.result = instance.b ? instance.b.state.doc.toString() : ""; // 中间结果可编辑，必须回写
          if (instance.theirsView)
            files.b = files.b
              ? { ...files.b, content: instance.theirsView.state.doc.toString() }
              : { name: "对方", content: instance.theirsView.state.doc.toString() };
        }
      } catch (e) {
        console.error("[compare] 保存编辑内容失败:", e);
      }
    }
    skipSaveOnNextRender = false; // 一次性跳过已消费，后续 render（模式切换等）恢复回写
    teardown();
    // 重置栏隐藏类（切换两/三栏时避免残留），随后按 paneOffState 重新应用
    if (comparePanes) {
      comparePanes.classList.remove("pane-off-a", "pane-off-b", "pane-off-c");
      for (const p of ["a", "b", "c"]) {
        if (paneOffState[p]) comparePanes.classList.add("pane-off-" + p);
      }
    }
    const aFile = files.a || { name: "本地", content: "" };
    const bFile = files.b || { name: "对方", content: "" };
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
        bindPaneFocus(instance.a, "a");
        bindPaneFocus(instance.b, "b");
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
        bindPaneFocus(instance.a, "a");
        bindPaneFocus(instance.b, "b");
        bindPaneFocus(instance.theirsView, "c");
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

    // 活动栏复位：旧视图已随 teardown 销毁，若沿用上次的活动栏（如三栏切两栏后仍指向 'c'），
    // 保存时会取到不存在的栏。统一复位到 'a'，等用户实际聚焦后再更新。
    try {
      setActivePane("a");
    } catch (_) {}
    // 视图刚重建，描边随旧 DOM 一起消失了，必须按复位后的活动栏重新打上，
    // 否则重渲染后会出现「没有任何栏带描边、但 Ctrl+S 仍会写 A 栏」的静默不一致。
    applyActivePaneClass();

    // 补齐 UI：刷新 per-pane 标题（Yours / Result / Theirs）与差异/冲突计数。
    // 首帧 diff 尚未落定，计数可能为 0；onRefresh 订阅后会在 diff 算完时再刷一次。
    updatePaneHeader();
    syncDirectionTooltips();
    // 修复 R5：createCompareMergeView 内部默认 wordDiffMode='word'，而 #selHighlightWords
    // 是页面级静态控件，其值在 render 间不会重置。若不回填，用户选「关闭 / 按字符」后
    // 一旦重渲染（切换视图模式、重新载入文件），装饰会悄悄退回「按词」，
    // 造成「下拉显示 A、实际行为 B」的静默不一致。
    onHighlightWordsChange();
    updateStatusCount();
    if (instance && typeof instance.onRefresh === "function") {
      instance.onRefresh(() => {
        updateStatusCount();
      });
    }

    // 位置概览侧栏：随视图一同重建（旧实例已在 teardown 中销毁）。
    // 首帧刷新同样推到下一帧：此刻视图 DOM 刚插入，CM 尚未完成首次 measure，
    // 同帧调 update() 量到的视口尺寸是无效的。
    mountLocationPane();
    scheduleAfterLayout(() => {
      if (locationPane) locationPane.update();
      if (instance && typeof instance.redrawConnectors === "function") {
        instance.redrawConnectors();
      }
    });
  }

  // ── 位置概览侧栏：挂载 / 可见性 ──
  function mountLocationPane() {
    if (!locationPaneEl) return;
    // 幂等保护：本函数会覆盖 locationPane 引用，若进来时旧面板还在，
    // 旧面板与它的 onRefresh 订阅就再也无人 destroy —— 泄漏一个持有 instance.a/b 引用
    // 与 scroll 监听的僵尸面板。当前两个调用点恰好都先清理了，但那是【调用方纪律】而非
    // 【函数保证】，这里补上函数自身的保证。
    // 顺序与 teardown() 一致：必须【先 unsubscribe 再 destroy】——
    // 反过来的话，destroy 与退订之间若恰好触发一次 refresh，回调会摸到已销毁的面板。
    if (unsubscribeLocationPane) {
      try {
        unsubscribeLocationPane();
      } catch (_) {}
      unsubscribeLocationPane = null;
    }
    if (locationPane) {
      try {
        locationPane.destroy();
      } catch (e) {
        console.error("[compare] 销毁旧位置概览失败:", e);
      }
      locationPane = null;
    }
    locationPaneEl.hidden = !locationPaneVisible;
    // 分隔条与侧栏同生共死：侧栏隐藏时留一根可拖拽的空条会让人误以为侧栏还在。
    if (locationPaneResizerEl) locationPaneResizerEl.hidden = !locationPaneVisible;
    if (btnToggleLocationPane) {
      btnToggleLocationPane.classList.toggle("active", locationPaneVisible);
    }
    if (!locationPaneVisible || !instance) return;
    try {
      locationPane = createLocationPane({
        container: locationPaneEl,
        instance,
        getConnectorLayers:
          typeof instance.getConnectorLayers === "function"
            ? instance.getConnectorLayers
            : () => [],
      });
      // 注意：这里【不】立即 update()。首帧刷新的时机由调用方决定 ——
      // 侧栏出现/消失会改变编辑器宽度，同帧尚未 reflow，此刻量出来的视口是旧宽度下的值
      // （详见 toggleLocationPane 的 rAF 说明）。render() 路径下由本函数末尾同步刷一次即可。
      // diff 是异步落定的：构造瞬间 chunks 往往还是空的，此时画出来的概览是空条。
      // 订阅实例的装饰刷新事件，等 diff 真正算完再重画（无需自己另起轮询）。
      if (typeof instance.onRefresh === "function") {
        unsubscribeLocationPane = instance.onRefresh(() => {
          if (locationPane) locationPane.update();
        });
      }
    } catch (e) {
      console.error("[compare] 位置概览初始化失败:", e);
      locationPane = null;
    }
  }

  /**
   * 把回调推到下一帧执行（无 rAF 环境降级为同步）。
   *
   * 【为何布局相关的量取必须等下一帧】侧栏 176px 的出现/消失会改变编辑器可用宽度，
   * 进而触发软换行重排；CM6 的高度重测是异步 measure cycle，同帧读到的仍是旧宽度下的值。
   * 概览刷新（updateViewport 要量可见区）与连线重绘（要量栏边缘 x）依赖的是同一份布局，
   * 因此调用方应把两者放进【同一个】本函数回调里，而不是各推各的帧。
   */
  function scheduleAfterLayout(fn) {
    if (typeof requestAnimationFrame === "function") requestAnimationFrame(fn);
    else fn();
  }

  function toggleLocationPane() {
    locationPaneVisible = !locationPaneVisible;
    try {
      localStorage.setItem(LOCATION_PANE_KEY, locationPaneVisible ? "1" : "0");
    } catch (_) {
      /* storage 不可用：仅本次会话生效 */
    }
    // 按新状态重建概览（旧概览与其订阅由 mountLocationPane 自身保证清理），
    // 随后把「概览刷新 + 连线重绘」放进【同一个】下一帧回调 —— 侧栏出现/消失会改变栏宽，
    // 连线端点 x 坐标与概览视口指示器依赖的是同一份 reflow 后的尺寸，分开推帧会不自洽。
    mountLocationPane(); // 只建骨架
    scheduleAfterLayout(() => {
      if (locationPane) locationPane.update();
      if (instance && typeof instance.redrawConnectors === "function") {
        instance.redrawConnectors();
      }
    });
  }

  // ── 差异概览侧栏：拖拽调整宽度 ──
  // 宽度写在 #locationPane 自身的 --lp-width 上（compare.css 里 flex-basis 读它），
  // 并持久化到 localStorage，刷新/重开对比页后保持用户设定。
  const LP_WIDTH_KEY = "md-compare-location-pane-width";
  const LP_WIDTH_DEFAULT = 176;
  const LP_WIDTH_MIN = 120;
  // 上限不写死像素：窄窗口下 560px 会把编辑区挤没。取「视图容器宽度的 60%」与 560 的较小值。
  const LP_WIDTH_MAX_ABS = 560;

  function lpMaxWidth() {
    const host = locationPaneEl && locationPaneEl.parentElement;
    const avail = host ? host.clientWidth : 0;
    if (!avail) return LP_WIDTH_MAX_ABS;
    return Math.max(LP_WIDTH_MIN, Math.min(LP_WIDTH_MAX_ABS, Math.round(avail * 0.6)));
  }

  function clampLpWidth(px) {
    const n = Number(px);
    if (!Number.isFinite(n)) return LP_WIDTH_DEFAULT;
    return Math.round(Math.min(lpMaxWidth(), Math.max(LP_WIDTH_MIN, n)));
  }

  function applyLpWidth(px, { persist = false } = {}) {
    if (!locationPaneEl) return;
    const w = clampLpWidth(px);
    locationPaneEl.style.setProperty("--lp-width", `${w}px`);
    if (persist) {
      try {
        localStorage.setItem(LP_WIDTH_KEY, String(w));
      } catch (_) {
        /* storage 不可用：仅本次会话生效 */
      }
    }
    return w;
  }

  function initLocationPaneResizer() {
    if (!locationPaneEl || !locationPaneResizerEl) return;

    // 恢复持久化宽度（无记录则沿用 CSS 默认 176px，不写内联样式）
    let saved = null;
    try {
      saved = localStorage.getItem(LP_WIDTH_KEY);
    } catch (_) {
      /* 忽略 */
    }
    if (saved != null && saved !== "") applyLpWidth(saved);

    let dragging = false;

    // 用 Pointer Capture：捕获到分隔条本身，拖出窗口再松手也能收到 pointerup/pointercancel，
    // 不会卡在拖拽态（差异概览拖宽是新增交互，必须稳健）。
    locationPaneResizerEl.addEventListener("pointerdown", (e) => {
      if (e.button !== 0) return;
      e.preventDefault();
      dragging = true;
      locationPaneResizerEl.classList.add("dragging");
      document.body.style.cursor = "col-resize";
      document.body.style.userSelect = "none";

      const startX = e.clientX;
      const startWidth = locationPaneEl.getBoundingClientRect().width;

      const onPointerMove = (ev) => {
        if (!dragging) return;
        // 侧栏在右侧：鼠标左移（dx<0）变宽，故取 startX - clientX。
        applyLpWidth(startWidth + (startX - ev.clientX));
      };

      const onPointerUp = (ev) => {
        if (!dragging) return;
        dragging = false;
        locationPaneResizerEl.classList.remove("dragging");
        document.body.style.cursor = "";
        document.body.style.userSelect = "";
        locationPaneResizerEl.removeEventListener("pointermove", onPointerMove);
        locationPaneResizerEl.removeEventListener("pointerup", onPointerUp);
        locationPaneResizerEl.removeEventListener("pointercancel", onPointerUp);
        try { locationPaneResizerEl.releasePointerCapture(ev.pointerId); } catch (_) { /* 未捕获则忽略 */ }
        applyLpWidth(locationPaneEl.getBoundingClientRect().width, { persist: true });
        // 宽度变了 ⇒ 编辑区可用宽度变了 ⇒ 软换行重排。概览视口指示器与移动块连线
        // 依赖同一份布局，必须等下一帧 reflow 完再一起重算（与 toggleLocationPane 同规则）。
        scheduleAfterLayout(() => {
          if (locationPane) locationPane.update();
          if (instance && typeof instance.redrawConnectors === "function") {
            instance.redrawConnectors();
          }
        });
      };

      try { locationPaneResizerEl.setPointerCapture(e.pointerId); } catch (_) { /* 指针不可用则忽略 */ }
      locationPaneResizerEl.addEventListener("pointermove", onPointerMove);
      locationPaneResizerEl.addEventListener("pointerup", onPointerUp);
      locationPaneResizerEl.addEventListener("pointercancel", onPointerUp);
    });

    // 双击分隔条恢复默认宽度
    locationPaneResizerEl.addEventListener("dblclick", () => {
      applyLpWidth(LP_WIDTH_DEFAULT, { persist: true });
      scheduleAfterLayout(() => {
        if (locationPane) locationPane.update();
        if (instance && typeof instance.redrawConnectors === "function") {
          instance.redrawConnectors();
        }
      });
    });
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
  // 把「聚焦的栏」映射到其源文件槽位（files.a / files.b）：
  //   a        → 本地(files.a)
  //   c(三栏)  → 对方(files.b，三栏下 pane c 即「对方」)
  //   b        → 两栏=对方(files.b)；三栏=合并结果(无源文件)→ 退回本地(files.a)
  function paneToSlot(pane) {
    if (pane === "a") return "a";
    if (pane === "c") return "b";
    return mode === "two" ? "b" : "a";
  }

  async function onPickFiles() {
    try {
      // 单选：把文件载入「当前鼠标激活栏」对应的槽位（需求 #14）
      const picked = await pickSingleFile();
      if (!picked) return;
      const pane = getActivePane(); // 'a' | 'b' | 'c'，由栏聚焦时 setActivePane 维护
      const slot = paneToSlot(pane);
      files[slot] = picked;
      files.result = null; // 新选文件 → 重置合并结果
      setSlotText(fileSlots.a, files.a);
      setSlotText(fileSlots.b, files.b);
      skipSaveOnNextRender = true; // 重新载入：跳过 render 的编辑回写，保留刚载入的文件内容
      render();
      // 让「激活栏描边」跟随用户实际选择的目标栏（render 末尾会把活动栏复位为 'a'）
      try {
        setActivePane(pane);
        applyActivePaneClass();
      } catch (_) {}
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

  // ── 活动栏保存（第二期）：Ctrl/Cmd+S 或工具栏「保存」落到当前活动栏 ──
  // panes 的形状对齐 save.js 的契约：{ a:{view,target}, b:{...}, c:{...} }，
  // target 为 io-bridge 的目标描述符（浏览器 { handle } / 桌面 { path }）；
  // 未关联源文件时 target 为空，saveActivePane 会返回 no-target，由本文件降级到「另存为」。
  function currentPanes() {
    if (!instance) return {};
    const panes = {
      a: { view: instance.a, target: files.a && files.a.target },
    };
    if (mode === "two") {
      panes.b = { view: instance.b, target: files.b && files.b.target };
    } else {
      // 三栏：b = Result（合并产物，无关联源文件，只能另存）；c = Theirs（对应 files.b）
      panes.b = { view: instance.b, target: null };
      if (instance.theirsView) {
        panes.c = { view: instance.theirsView, target: files.b && files.b.target };
      }
    }
    return panes;
  }

  async function onSaveActive() {
    if (!instance) return;
    try {
      const r = await saveActivePane(currentPanes());
      if (r && r.saved === false && r.reason === "no-target") {
        // 未关联源文件（如三栏 Result、或浏览器端未持有 handle）：降级走「另存为」对话框
        const panes = currentPanes();
        const entry = panes[r.pane];
        const content = entry && entry.view ? entry.view.state.doc.toString() : "";
        const suggested =
          r.pane === "a" && files.a
            ? files.a.name
            : r.pane === "c" && files.b
              ? files.b.name
              : "merged.md";
        await exportResult(content, suggested);
      }
    } catch (e) {
      // 用户取消保存框：忽略 AbortError
      if (!(e && e.name === "AbortError")) console.error("[compare] 保存失败:", e);
    }
  }

  // ── 折叠 / 展开未改（增量 E） ──
  // 默认【展开】：一进页面就折叠会让用户先看到大片折叠占位、看不见正文，
  // 反而要多点一次才能读全文。需要精简视图时再手动点「折叠未改」。
  let collapsed = false;
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

  // ── 状态计数：实时反映当前差异块 / 冲突块数量（对齐 "6 changes, 2 conflicts"）──
  function updateStatusCount() {
    if (!statusCountEl) return;
    let changes = 0;
    let conflicts = 0;
    try {
      if (instance && typeof instance.getChunks === "function") {
        const chunks = instance.getChunks() || [];
        changes = chunks.length;
        // 冲突去重：三栏的一处物理冲突，在 compare-merge.js buildChunkModel() 中会被
        // **双侧各标记一次**（相交的 ab 块与 bc 块同时置 conflict=true），若直接对全量
        // filter 统计，1 处冲突会显示成「2 处冲突」。按 ab 层计数即等于冲突区域数。
        // 注意：去重只作用于计数维度，getChunks() 源头必须保留两侧标记 —— 块级 revert
        // 按钮要依据各自的 conflict 决定渲染单按钮还是双按钮（采纳左 / 采纳右）。
        // 两栏模式 conflict 恒为 false（无三方冲突），该式自然归零，不受影响。
        conflicts = chunks.filter((c) => c.conflict && c.layer === "ab").length;
      }
    } catch (err) {
      console.error("[compare] 统计差异块失败:", err);
    }
    statusCountEl.textContent = `${changes} 处变更，${conflicts} 处冲突`;
    statusCountEl.classList.toggle("has-conflict", conflicts > 0);
  }

  // ── per-pane 标题栏：根据当前模式与文件动态设置标题（Yours / Result / Theirs）──
  function updatePaneHeader() {
    if (!compareViewHeader || !comparePanes) return;
    // 修复中-1：#compareViewHeader 在 compare.html 中初始带 hidden，必须显式解除，
    // 否则整条标题栏被 CSS `.compare-view-header[hidden]{display:none}` 永久隐藏，
    // 三栏的 Yours / Result / Theirs 标题永不显示。
    compareViewHeader.hidden = false;
    // 三栏显示三份标题，两栏显示两份；c 栏在两栏下隐藏
    const visiblePanes = mode === "three" ? ["a", "b", "c"] : ["a", "b"];
    const titles = {
      a: files.a ? files.a.name : "本地",
      b: mode === "three" ? "合并结果" : files.b ? files.b.name : "对方",
      c: files.b ? files.b.name : "对方",
    };
    for (const p of ["a", "b", "c"]) {
      const el = document.querySelector(`.pane-header[data-pane="${p}"]`);
      if (!el) continue;
      const isVisible = visiblePanes.includes(p);
      el.hidden = !isVisible;
      // 修复 R6：跨 render 重放关闭态视觉（.pane-header 是静态 DOM，但 paneOffState
      // 可能在上一轮 render 前就被改过，这里统一以状态为准，保证幂等）
      el.classList.toggle("is-off", !!paneOffState[p]);
      const titleEl = paneTitles[p];
      if (titleEl) titleEl.textContent = titles[p];
    }
  }

  // ── 关闭态视觉同步（修复 R6）：CSS 已定义 .pane-header.is-off，此前无人添加该类 ──
  function syncPaneOffClass(p) {
    const el = document.querySelector(`.pane-header[data-pane="${p}"]`);
    if (el) el.classList.toggle("is-off", !!paneOffState[p]);
  }

  // ── 方向选择器文案（按模式动态，修复低-1：两栏 left/right 实为 Yours↔Theirs）──
  // 三栏：left=Yours→结果、right=Theirs→结果；两栏：left=Yours→Theirs、right=Theirs→Yours。
  function syncDirectionTooltips() {
    const isTwo = mode === "two";
    if (btnAcceptLeft)
      btnAcceptLeft.title = isTwo
        ? "采纳左侧全部块（本地 → 对方）"
        : "采纳左侧全部块（本地 → 合并结果）";
    if (btnAcceptAll)
      btnAcceptAll.title = isTwo
        ? "用左栏覆盖全部（本地优先）"
        : "两侧全部采纳（先左后右，右侧覆盖冲突处）";
    if (btnAcceptRight)
      btnAcceptRight.title = isTwo
        ? "采纳右侧全部块（对方 → 本地）"
        : "采纳右侧全部块（对方 → 合并结果）";
  }

  // ── 关闭某栏：仅视觉隐藏该栏（display:none）+ 触发重绘 ──
  // 简单方案：给 compare-panes 加 pane-off-<p> 类，CSS 收缩为该栏宽度 0；
  // 不能用 CSS 隐藏整列（会破坏 MergeView 的滚动联动），故仅收缩宽度。
  function closePane(p) {
    if (!comparePanes) return;
    comparePanes.classList.add(`pane-off-${p}`);
    paneOffState[p] = true; // 跨 render 保留关闭状态
    if (paneToggles[p]) paneToggles[p].checked = false;
    syncPaneOffClass(p); // 修复 R6：标题格压暗 + 删除线，否则关栏后无任何视觉反馈
    scheduleAfterLayout(() => {
      if (instance && typeof instance.redrawConnectors === "function") {
        instance.redrawConnectors();
      }
    });
  }
  function reopenPane(p) {
    if (!comparePanes) return;
    comparePanes.classList.remove(`pane-off-${p}`);
    paneOffState[p] = false; // 跨 render 保留关闭状态
    if (paneToggles[p]) paneToggles[p].checked = true;
    syncPaneOffClass(p); // 修复 R6：撤下压暗 + 删除线
    scheduleAfterLayout(() => {
      if (instance && typeof instance.redrawConnectors === "function") {
        instance.redrawConnectors();
      }
    });
  }

  // ── 应用所有非冲突变更（一键解决无冲突区，冲突块留给人工裁决）──
  // 三栏：ab 层（Yours→Result）与 bc 层（Theirs→Result）共用同一个 Result 文档。
  // 若分两次 dispatch，ab 层改动后 Result 内容已变，bc 层会把这些区域重新识别为
  // 「Result 与 Theirs 的差异」并覆盖回去，导致 ab 层改动丢失（实测：只有 Theirs 生效）。
  // 正确做法：一次性收集两层的 changes（均基于 dispatch 前的同一 Result 坐标），
  // 按 dstFrom 排序后合并为单次 dispatch；层间区间重叠则中止，避免静默损坏。
  // 两栏：只有一层，走原有路径。
  function applyNonConflictingChunks() {
    if (!instance || typeof instance.getChunks !== "function") return;
    const chunks = instance.getChunks() || [];
    const nonConf = chunks.filter((c) => !c.conflict);
    if (!nonConf.length) return;
    if (mode === "three") {
      const abViews = instance.getLayerViews("ab");
      const bcViews = instance.getLayerViews("bc");
      const ab = nonConf.filter((c) => c.layer === "ab");
      const bc = nonConf.filter((c) => c.layer === "bc");
      const changes = [];
      const pushChanges = (srcView, dstView, list) => {
        if (!srcView || !dstView || !list.length) return;
        const dstLen = dstView.state.doc.length;
        const srcLen = srcView.state.doc.length;
        for (const c of list) {
          changes.push({
            from: Math.min(c.dstFrom, dstLen),
            to: Math.min(c.dstTo, dstLen),
            insert: srcView.state.doc.sliceString(
              Math.min(c.srcFrom, srcLen),
              Math.min(c.srcTo, srcLen)
            ),
          });
        }
      };
      pushChanges(abViews.srcView, abViews.dstView, ab);
      pushChanges(bcViews.srcView, bcViews.dstView, bc);
      changes.sort((a, b) => a.from - b.from);
      for (let i = 1; i < changes.length; i++) {
        if (changes[i - 1].to > changes[i].from) {
          console.error(
            "[compare] 三栏非冲突块跨层区间重叠，已中止以免损坏 Result"
          );
          return;
        }
      }
      abViews.dstView.dispatch({ changes });
    } else {
      const views = instance.getLayerViews("ab");
      applyNonConflicting({
        chunks: nonConf,
        srcView: views.srcView,
        dstView: views.dstView,
      });
    }
    updateStatusCount();
  }

  // ── 方向选择器：<< 左 / 全部 / 右 >> 批量接受某一侧全部块（含冲突块）──
  // 关键正确性：向同一 dstView 写入多个块必须合并为【单次 dispatch】，
  // 否则后续块 dstFrom/dstTo 仍基于原始文档、从第 2 个起写错位置（漂移）。
  // 收集每一块的 changes（from/to/insert），按 dstFrom 升序排序后整批 dispatch。
  function acceptAllDir(dir) {
    if (!instance || typeof instance.getChunks !== "function") return;
    const chunks = instance.getChunks() || [];
    const isTwo = mode === "two";

    function bulkTo(srcView, dstView, layerChunks) {
      if (!srcView || !dstView || !layerChunks.length) return;
      const len = dstView.state.doc.length;
      const sorted = [...layerChunks].sort((a, b) => a.dstFrom - b.dstFrom);
      // 防御：相邻块区间重叠则中止，避免静默损坏文档（同 applyNonConflicting）
      for (let i = 1; i < sorted.length; i++) {
        if (sorted[i - 1].dstTo > sorted[i].dstFrom) {
          console.error(
            `[compare] 批量接受 ${dir} 检测到重叠块区间，已中止以免损坏文档`
          );
          return;
        }
      }
      const changes = sorted.map((c) => ({
        from: Math.min(c.dstFrom, len),
        to: Math.min(c.dstTo, len),
        insert: srcView.state.doc.sliceString(c.srcFrom, c.srcTo),
      }));
      dstView.dispatch({ changes });
    }

    if (dir === "left" || dir === "all") {
      if (isTwo) {
        const views = instance.getLayerViews("ab");
        bulkTo(views.srcView, views.dstView, chunks.filter((c) => c.layer === "ab"));
      } else if (dir === "left") {
        const views = instance.getLayerViews("ab"); // a→b (Yours→Result)
        bulkTo(views.srcView, views.dstView, chunks.filter((c) => c.layer === "ab"));
      }
      // dir === "all" 三栏：与下方 right 阶段合并为单次 dispatch，避免 ab 层被 bc 层覆盖。
    }
    if (dir === "right" || dir === "all") {
      if (isTwo) {
        // 两栏右：b→a（Theirs→Yours）。
        // ① dir==='all' 时上面的 left 阶段刚改写过 b，快照里的 dstFrom/dstTo 已过期，必须重取；
        // ② 把 src/dst 角色对调后交给 bulkTo，从而复用同一套「按 dstFrom 排序 + 重叠区间校验
        //    + 越界钳制」防御。此前这里是手写 dispatch，缺重叠校验，相邻块接触时 CM6 会直接
        //    抛 Overlapping changes，导致后续 syncRevertControls / updateStatusCount 都不执行。
        const srcChunks = dir === "all" ? instance.getChunks() || [] : chunks;
        const rightChunks = srcChunks
          .filter((c) => c.layer === "ab")
          .map((c) => ({
            ...c,
            srcFrom: c.dstFrom, // 取 b（Theirs）的内容
            srcTo: c.dstTo,
            dstFrom: c.srcFrom, // 写回 a（Yours）的区间
            dstTo: c.srcTo,
          }));
        // getLayerViews('right') 即 { srcView: mv.b, dstView: mv.a }，两栏实例已提供该反向端点
        const views = instance.getLayerViews("right");
        bulkTo(views.srcView, views.dstView, rightChunks);
      } else if (dir === "right") {
        // 三栏单独右：Theirs→Result（bc 层）
        const views = instance.getLayerViews("bc"); // theirsView→b
        bulkTo(views.srcView, views.dstView, chunks.filter((c) => c.layer === "bc"));
      }
      // dir === "all" 三栏：在下面统一处理。
    }

    // 三栏「全部」：把 ab + bc 两层 changes 合并为单次 dispatch，原因同 applyNonConflictingChunks。
    if (!isTwo && dir === "all") {
      const abViews = instance.getLayerViews("ab");
      const bcViews = instance.getLayerViews("bc");
      const allChanges = [];
      const pushAll = (srcView, dstView, list) => {
        if (!srcView || !dstView || !list.length) return;
        const dstLen = dstView.state.doc.length;
        const srcLen = srcView.state.doc.length;
        for (const c of list) {
          allChanges.push({
            from: Math.min(c.dstFrom, dstLen),
            to: Math.min(c.dstTo, dstLen),
            insert: srcView.state.doc.sliceString(
              Math.min(c.srcFrom, srcLen),
              Math.min(c.srcTo, srcLen)
            ),
          });
        }
      };
      pushAll(abViews.srcView, abViews.dstView, chunks.filter((c) => c.layer === "ab"));
      pushAll(bcViews.srcView, bcViews.dstView, chunks.filter((c) => c.layer === "bc"));
      allChanges.sort((a, b) => a.from - b.from);
      for (let i = 1; i < allChanges.length; i++) {
        if (allChanges[i - 1].to > allChanges[i].from) {
          console.error("[compare] 三栏「全部」块区间重叠，已中止");
          return;
        }
      }
      abViews.dstView.dispatch({ changes: allChanges });
    }
    if (instance.syncRevertControls) instance.syncRevertControls();
    updateStatusCount();
  }

  // ── 行内字词高亮粒度切换 ──
  function onHighlightWordsChange() {
    if (!selHighlightWords || !instance) return;
    const modeVal = selHighlightWords.value || "word";
    if (typeof instance.setWordDiffMode !== "function") return;
    // 本函数已被 render() 复用作「重建后回填」（修复 R5）。render 尾部还要挂载概览侧栏，
    // 若此处抛出会连带掐断后续初始化，故就地兜住：粒度失败只是装饰降级，不该拖垮整页。
    try {
      instance.setWordDiffMode(modeVal);
    } catch (e) {
      console.error("[compare] 设置行内高亮粒度失败:", e);
    }
  }

  // ── 底部 APPLY / ABORT ──
  function onApplyMerge() {
    // APPLY：导出 / 保存当前合并结果（复用现有导出逻辑）
    onExportResult();
  }
  function onAbortMerge() {
    // ABORT：放弃本次合并并关闭对比页（对比页通过 window.open 打开）
    try {
      window.close();
    } catch (_) {
      /* 某些环境禁止脚本关闭窗口：静默忽略 */
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
  if (btnToggleLocationPane)
    btnToggleLocationPane.addEventListener("click", toggleLocationPane);
  if (btnSave) btnSave.addEventListener("click", onSaveActive);

  // ── 批量合并（对齐 JetBrains Merge Revisions 顶部栏）──
  if (btnApplyNonConflicting)
    btnApplyNonConflicting.addEventListener("click", applyNonConflictingChunks);
  // 修复 R7：CSS 已定义 .compare-dir-btn.active（选中态压在相邻按钮之上），此前无人添加该类，
  // 属死代码。方向选择器是【即时动作】而非持久模式，故不做持久选中态，
  // 改为点击后短暂点亮 —— 批量合并的文档变化常在视口外，缺少反馈时用户无法确认「点中了哪个」。
  const DIR_FLASH_MS = 700;
  const dirFlashTimers = new WeakMap();
  function flashDirBtn(btn) {
    if (!btn) return;
    btn.classList.add("active");
    const prev = dirFlashTimers.get(btn);
    if (prev) clearTimeout(prev); // 连点时重置计时，避免前一次的定时器提前熄灯
    dirFlashTimers.set(
      btn,
      setTimeout(() => {
        btn.classList.remove("active");
        dirFlashTimers.delete(btn);
      }, DIR_FLASH_MS)
    );
  }
  if (btnAcceptLeft)
    btnAcceptLeft.addEventListener("click", () => {
      flashDirBtn(btnAcceptLeft);
      acceptAllDir("left");
    });
  if (btnAcceptAll)
    btnAcceptAll.addEventListener("click", () => {
      flashDirBtn(btnAcceptAll);
      acceptAllDir("all");
    });
  if (btnAcceptRight)
    btnAcceptRight.addEventListener("click", () => {
      flashDirBtn(btnAcceptRight);
      acceptAllDir("right");
    });
  if (selHighlightWords)
    selHighlightWords.addEventListener("change", onHighlightWordsChange);

  // ── 底部全局操作栏：APPLY / ABORT ──
  if (btnApplyMerge) btnApplyMerge.addEventListener("click", onApplyMerge);
  if (btnAbortMerge) btnAbortMerge.addEventListener("click", onAbortMerge);

  // ── 返回主界面（需求 #13）──
  // compare 页由 editor 经 window.open 打开，可脚本关闭；若部分环境禁止
  // window.close（页面未真正关闭），则降级跳转到 editor.html，避免用户被困。
  const btnBackToEditor = document.getElementById('btnBackToEditor');
  if (btnBackToEditor) {
    btnBackToEditor.addEventListener("click", () => {
      try { window.close(); } catch (_) {}
      window.location.href = 'editor.html';
    });
  }

  // ── per-pane 标题栏：勾选框（关闭/恢复栏）与关闭按钮 ──
  for (const p of ["a", "b", "c"]) {
    const toggle = paneToggles[p];
    const closeBtn = document.querySelector(
      `.pane-header-close[data-pane="${p}"]`
    );
    if (toggle) {
      toggle.addEventListener("change", () => {
        if (toggle.checked) reopenPane(p);
        else closePane(p);
      });
    }
    if (closeBtn) {
      closeBtn.addEventListener("click", () => closePane(p));
    }
  }

  // ── 概览侧栏快捷键 L（不带修饰键，且不能在编辑器内触发，否则会吞掉字母输入） ──
  document.addEventListener("keydown", (e) => {
    if (e.ctrlKey || e.metaKey || e.altKey || e.shiftKey) return;
    if (typeof e.key !== "string" || e.key.toLowerCase() !== "l") return;
    // isComposing：中文输入法组合期内的按键属于候选词交互，不是快捷键。
    // repeat：长按 L 会以系统重复速率高频 teardown/rebuild 整个侧栏（实测可复现的卡顿源）。
    // defaultPrevented：已被更内层的处理器消费掉，不再重复响应。
    if (e.isComposing || e.repeat || e.defaultPrevented) return;
    const t = e.target;
    // 在编辑区 / 输入控件内一律放行，L 就是普通字符。
    // select 与 [role='textbox'] 同样会吃字母键（前者用于首字母跳选项）；
    // contenteditable 用 :not([contenteditable='false']) 匹配，覆盖 contenteditable=""
    // 与 contenteditable="plaintext-only" 这两种同样可编辑、但旧写法漏判的形态。
    if (t && typeof t.closest === "function") {
      if (
        t.closest(
          ".cm-content, input, textarea, select, [contenteditable]:not([contenteditable='false']), [role='textbox']"
        )
      ) {
        return;
      }
    }
    e.preventDefault();
    toggleLocationPane();
  });

  // 窗口尺寸变化：连线端点依赖栏宽/栏高，必须重绘；概览条同理需重算比例。
  // 【rAF 合并】拖动窗口边框时 resize 会以远高于帧率的频率连续派发，而每次回调都要
  // 全量重算连线几何 + 重建概览色块/弧线/大纲，同步跑必然掉帧。同一帧内只保留最后一次，
  // 视觉结果完全等价（中间帧根本来不及呈现）。
  let resizeRaf = 0;
  window.addEventListener("resize", () => {
    const run = () => {
      if (instance && typeof instance.redrawConnectors === "function") {
        instance.redrawConnectors();
      }
      if (locationPane) locationPane.update();
    };
    if (typeof requestAnimationFrame !== "function") {
      run(); // 无 rAF 环境：退回同步执行，宁可卡也不能不刷新
      return;
    }
    if (resizeRaf) return; // 本帧已排队，丢弃后续事件
    resizeRaf = requestAnimationFrame(() => {
      resizeRaf = 0;
      run();
    });
  });

  // ── 保存快捷键 Ctrl+S / Cmd+S（不含 Shift/Alt 组合，留给「另存为」等后续扩展） ──
  document.addEventListener("keydown", (e) => {
    if (
      (e.ctrlKey || e.metaKey) &&
      !e.shiftKey &&
      !e.altKey &&
      typeof e.key === "string" &&
      e.key.toLowerCase() === "s"
    ) {
      e.preventDefault(); // 阻止浏览器「保存网页」
      onSaveActive();
    }
  });

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

  // ── 图片拖拽区（CMPX-08 修复）：把占位 #compareImageDrop 替换为真实拖拽上传区 ──
  const imageDropPlaceholder = document.getElementById("compareImageDrop");
  if (imageDropPlaceholder) {
    const area = createImageUploadArea({
      // 与「图片」按钮同源：取当前活动编辑器视图的光标作为插入位置
      getCursor: () => {
        if (activeView && activeView.state) {
          return activeView.state.selection.main.head;
        }
        return 0;
      },
    });
    imageDropPlaceholder.replaceWith(area);
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
      get activePane() {
        return getActivePane();
      },
      currentPanes,
      render,
      switchMode,
    };
  }

  // 差异概览侧栏宽度拖拽（必须在首次 render 前恢复宽度，避免首帧按默认宽度量错布局）
  initLocationPaneResizer();

  // 默认渲染两栏（空文档），保证页面有可见内容
  render();
})();
