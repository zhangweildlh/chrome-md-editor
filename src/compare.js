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
// 活动栏（用户最后聚焦的栏）状态与保存链路
import {
  setActivePane,
  getActivePane,
  saveActivePane,
} from "./compare/save.js";
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
  // 「保存」按钮由 compare.html 提供；该按钮可能尚未上线，必须做 null 保护
  const btnSave = $("btnSave");

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
    // 概览侧栏必须【先于】视图实例销毁：它持有 instance.a / instance.b 的引用与
    // scroll 监听，若等视图先毁再毁它，中间任何一次 update() 都会摸到已销毁的 view。
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

  // 默认渲染两栏（空文档），保证页面有可见内容
  render();
})();
