// compare-unified.js — 单栏 unified 视图（T4b / 增量 A）
//
// 封装 @codemirror/merge 的 unifiedMergeView。
//
// 导出：
//   createCompareUnifiedView(opts): CompareUnifiedInstance
//
// 设计要点：
//   - 单栏内联对照：original = 原文（默认 Yours），当前可编辑文档默认 = doc（默认 Theirs），
//     删除行以 widget 显示在原行上方。逐块 Accept/Reject = acceptChunk/rejectChunk。
//   - 增量 C：allowInlineDiffs:true（行内 diff）。
//   - 增量 D：syntaxHighlightDeletions:true（删除行语法高亮，需要 markdown language 扩展由调用方注入）。
//   - 增量 G：mergeControls 自定义中文按钮（类名 cm-compare-chunk-btn，避开禁用类名闸门）。
//   - 增量 E：expandAt(pos) 用 uncollapseUnchanged 展开被折叠的未改区域。
//
// 禁用类名闸门：严禁使用方案列明的禁用类名；
// 自定义按钮仅用 cm-compare-chunk-btn。

import {
  unifiedMergeView,
  acceptChunk,
  rejectChunk,
  goToNextChunk,
  goToPreviousChunk,
  uncollapseUnchanged,
} from "@codemirror/merge";
import { EditorView } from "@codemirror/view";
import { Compartment } from "@codemirror/state";

/**
 * @typedef {Object} CompareUnifiedOptions
 * @property {string} original   原文（对照基准，单栏模式下复用 A=Yours）
 * @property {string} [doc]      当前可编辑文档初始内容（默认 = original；本模块约定传 Theirs）
 * @property {any[]} [extensions]  CodeMirror 扩展数组（调用方注入 markdown() / applyCompareLineMarkers() 等）
 * @property {HTMLElement} parent
 * @property {{margin?:number,minSize?:number}} [collapseUnchanged]
 */

/**
 * 自定义 mergeControls 工厂：生成中文「接受 / 拒绝」按钮。
 * @param {"accept"|"reject"} type
 * @param {(e: MouseEvent) => void} action
 * @returns {HTMLButtonElement}
 */
function makeChunkButton(type, action) {
  const btn = document.createElement("button");
  btn.type = "button";
  btn.className = "cm-compare-chunk-btn";
  if (type === "accept") {
    btn.textContent = "接受";
    btn.title = "接受此块（保留当前内容）";
  } else {
    btn.textContent = "拒绝";
    btn.title = "拒绝此块（还原为原文）";
  }
  // 官方契约：按钮需通过 mousedown 触发 action
  btn.addEventListener("mousedown", action);
  return btn;
}

/**
 * 创建单栏 unified 对比视图。
 * @param {CompareUnifiedOptions} opts
 * @returns {CompareUnifiedInstance}
 */
export function createCompareUnifiedView(opts) {
  const original = opts.original || "";
  const initialDoc = typeof opts.doc === "string" ? opts.doc : original;
  const baseExtensions = Array.isArray(opts.extensions) ? opts.extensions : [];
  const collapse =
    opts.collapseUnchanged === undefined
      ? { margin: 3, minSize: 6 }
      : opts.collapseUnchanged;

  // 折叠/展开未改区域用独立 Compartment 承载 unifiedMergeView，便于动态 reconfigure。
  const collapseCompartment = new Compartment();

  /** 构造 unifiedMergeView 配置（折叠值由调用方决定） */
  function buildUnifiedConfig(collapseVal) {
    return unifiedMergeView({
      original,
      highlightChanges: true,
      gutter: true,
      // 增量 C：行内 diff
      allowInlineDiffs: true,
      // 增量 D：删除行语法高亮（需 markdown language 扩展已在 baseExtensions 中）
      syntaxHighlightDeletions: true,
      // 增量 G：自定义中文按钮
      mergeControls: (type, action) => makeChunkButton(type, action),
      collapseUnchanged: collapseVal,
      diffConfig: { scanLimit: 500, timeout: 1500 },
    });
  }

  const view = new EditorView({
    doc: initialDoc,
    parent: opts.parent,
    extensions: [
      ...baseExtensions,
      collapseCompartment.of(buildUnifiedConfig(collapse)),
    ],
  });

  return {
    /** @type {EditorView} */
    view,
    /** 块导航所用的活动视图（即单栏自身） */
    navView: view,
    destroy() {
      view.destroy();
    },
    /** 接受光标所在块（保留当前内容）。pos 省略则取光标。 */
    acceptAt(pos) {
      return acceptChunk(view, pos);
    },
    /** 拒绝光标所在块（还原为原文）。pos 省略则取光标。 */
    rejectAt(pos) {
      return rejectChunk(view, pos);
    },
    /** @returns {string} 当前编辑器内容 */
    getResult() {
      return view.state.doc.toString();
    },
    /** 跳转下一块（增量 B） */
    nextChunk() {
      return goToNextChunk({ state: view.state, dispatch: view.dispatch });
    },
    /** 跳转上一块（增量 B） */
    prevChunk() {
      return goToPreviousChunk({ state: view.state, dispatch: view.dispatch });
    },
    /** 展开光标处被折叠的未改区域（增量 E） */
    expandAt(pos) {
      const at = typeof pos === "number" ? pos : view.state.selection.main.head;
      view.dispatch({ effects: uncollapseUnchanged.of(at) });
    },
    /** 折叠（collapsed=true）/ 展开（collapsed=false）未改区域（增量 E） */
    setCollapse(collapsed) {
      view.dispatch({
        effects: collapseCompartment.reconfigure(
          buildUnifiedConfig(collapsed ? collapse : undefined)
        ),
      });
    },
  };
}

/**
 * @typedef {Object} CompareUnifiedInstance
 * @property {EditorView} view
 * @property {EditorView} navView
 * @property {() => void} destroy
 * @property {(pos?: number) => boolean} acceptAt
 * @property {(pos?: number) => boolean} rejectAt
 * @property {() => string} getResult
 * @property {() => boolean} nextChunk
 * @property {() => boolean} prevChunk
 * @property {(pos?: number) => void} expandAt
 * @property {(collapsed: boolean) => void} setCollapse
 */
