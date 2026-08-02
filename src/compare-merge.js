// compare-merge.js — 两栏 / 三栏 diff 视图（T2 / T4）
//
// 封装 @codemirror/merge 的 MergeView。
//
// 导出（docs/compare-contract.md §1，签名在冻结契约基础上做超集扩展，不破坏既有字段）：
//   createCompareMergeView(opts): CompareMergeInstance
//
// 设计要点：
//   - layout='two'   ：纯两栏对照，a=Yours（可编辑或只读，默认可编辑）、b=Theirs（可编辑）。
//                      差异块红绿高亮 + 行号差异标记（由调用方在 extensions 注入 applyCompareLineMarkers）。
//   - layout='three' ：三栏合并：左 a=Yours(只读) / 中 b=Result(可编辑) / 右 Theirs(只读，独立编辑器)。
//                      「接受此块」按钮用自定义 renderRevertControl（类名 cm-compare-revert，中文「⇄ 接受此块」），
//                      把 Yours 的当前块拷入 Result（revertControls: 'a-to-b'）；
//                      Theirs→Result 通过实例方法 acceptTheirsAt(pos?) 逐块拷贝（基于 Chunk.build 对齐）。
//
// 禁用类名闸门（docs/compare-contract.md §4）：
//   严禁使用方案列明的禁用类名；自定义按钮仅用 cm-compare-revert。
//
// 其余配置（契约超集字段，保持向后兼容旧 {oldContent,newContent,extensions,parent} 形态）：
//   opts.layout            'two' | 'three'（默认 'two'）
//   opts.a                 { name, content }  左侧 / Yours
//   opts.b                 { name, content }  右侧 / Theirs（三栏时作为 Theirs 参考，Result 单独生成）
//   opts.oldContent        兼容别名，等同 opts.a.content
//   opts.newContent        兼容别名，等同 opts.b.content
//   opts.extensions        CodeMirror 扩展数组（调用方注入 markdown() / applyCompareLineMarkers() 等）
//   opts.parent            挂载容器 HTMLElement
//   opts.collapseUnchanged 折叠未改配置（默认 { margin:3, minSize:6 }），T2 增量 E
//   opts.aReadonly         两栏模式下是否把 a 设为只读（默认 false）
//   opts.bReadonly         两栏模式下是否把 b 设为只读（默认 false）

import { MergeView, getChunks, Chunk } from "@codemirror/merge";
import { EditorState, Text } from "@codemirror/state";
import { EditorView } from "@codemirror/view";

/**
 * @typedef {Object} CompareFile
 * @property {string} name
 * @property {string} content
 */

/**
 * @typedef {Object} CompareMergeOptions
 * @property {'two'|'three'} [layout]
 * @property {CompareFile} [a]
 * @property {CompareFile} [b]
 * @property {string} [oldContent]  兼容别名（= a.content）
 * @property {string} [newContent]  兼容别名（= b.content）
 * @property {any[]} [extensions]
 * @property {HTMLElement} parent
 * @property {{margin?:number,minSize?:number}} [collapseUnchanged]
 * @property {boolean} [aReadonly]
 * @property {boolean} [bReadonly]
 */

/**
 * 自定义 renderRevertControl 工厂：生成中文「接受此块」按钮。
 * 类名 cm-compare-revert，避开禁用类名闸门。
 * @param {string} [label]
 * @returns {HTMLButtonElement}
 */
function makeRevertButton(label = "⇄ 接受此块") {
  const btn = document.createElement("button");
  btn.type = "button";
  btn.className = "cm-compare-revert";
  btn.textContent = label;
  btn.title = "接受此块（将左侧内容并入结果）";
  return btn;
}

/**
 * 创建两栏 / 三栏对比合并视图。
 * @param {CompareMergeOptions} opts
 * @returns {CompareMergeInstance}
 */
export function createCompareMergeView(opts) {
  const layout = opts.layout || "two";
  const aFile = opts.a || { name: "Yours", content: opts.oldContent || "" };
  const bFile = opts.b || { name: "Theirs", content: opts.newContent || "" };
  const baseExtensions = Array.isArray(opts.extensions) ? opts.extensions : [];
  const collapse =
    opts.collapseUnchanged === undefined
      ? { margin: 3, minSize: 6 }
      : opts.collapseUnchanged;
  const diffConfig = { scanLimit: 500, timeout: 1500 };

  /** @type {HTMLElement} */
  const parent = opts.parent;

  if (layout === "three") {
    // ── 三栏合并：左 Yours(只读) / 中 Result(可编辑) / 右 Theirs(只读) ──
    // 左 + 中 用 MergeView 承载 diff 与「接受此块(Yours→Result)」；右 Theirs 为独立只读编辑器。
    const theirsInitial = bFile.content;
    const resultInitial = ""; // 结果从空开始，由用户接受 Yours / Theirs 块逐步合并

    const readOnlyYours = [
      EditorState.readOnly.of(true),
      EditorView.editable.of(false),
    ];
    const readOnlyTheirs = [
      EditorState.readOnly.of(true),
      EditorView.editable.of(false),
    ];

    const mv = new MergeView({
      a: {
        doc: aFile.content,
        extensions: [...baseExtensions, ...readOnlyYours],
      },
      b: {
        doc: resultInitial,
        extensions: [...baseExtensions],
      },
      parent,
      orientation: "a-b",
      highlightChanges: true,
      gutter: true,
      collapseUnchanged: collapse,
      diffConfig,
      // 自定义中文接受按钮：revert a→b 即把当前块从 Yours 拷入 Result
      revertControls: "a-to-b",
      renderRevertControl: () => makeRevertButton("⇄ 接受此块"),
    });

    // 右侧 Theirs 只读参考编辑器（独立挂载到 parent，紧随 MergeView 之后）
    const theirsView = new EditorView({
      doc: theirsInitial,
      parent,
      extensions: [
        ...baseExtensions,
        ...readOnlyTheirs,
        EditorView.editorAttributes.of({ class: "cm-compare-theirs" }),
      ],
    });
    parent.classList.add("compare-three-layout");

    /**
     * 把光标（或指定位置）所在块从 Theirs 拷入 Result（b 面板）。
     * 基于 Chunk.build(theirs, result) 对齐两侧块边界。
     * @param {number} [pos]
     * @returns {boolean}
     */
    function acceptTheirsAt(pos) {
      try {
        const resultState = mv.b.state;
        const cursor =
          typeof pos === "number" ? pos : resultState.selection.main.head;
        const theirsText = Text.of(theirsView.state.doc.toString().split("\n"));
        const resultText = Text.of(resultState.doc.toString().split("\n"));
        const chunks = Chunk.build(theirsText, resultText, diffConfig);
        if (!chunks.length) return false;
        // 找到包含 cursor 的块
        let target = null;
        for (const c of chunks) {
          if (cursor >= c.fromB && cursor <= c.endB) {
            target = c;
            break;
          }
        }
        // 命中不到光标块：选择离光标最近的块（避免无感知改写 chunks[0]）
        if (!target) {
          let best = null;
          let bestDist = Infinity;
          for (const c of chunks) {
            const d = Math.abs(cursor - c.fromB);
            if (d < bestDist) {
              bestDist = d;
              best = c;
            }
          }
          if (!best) return false;
          target = best;
        }
        const insertText = theirsText.sliceString(target.fromA, target.toA);
        mv.b.dispatch({
          changes: { from: target.fromB, to: target.toB, insert: insertText },
        });
        return true;
      } catch (err) {
        console.error("[compare-merge] acceptTheirsAt 失败:", err);
        return false;
      }
    }

    return {
      /** @type {MergeView} */
      mv,
      /** @type {EditorView} */
      a: mv.a,
      /** @type {EditorView} */
      b: mv.b,
      /** @type {EditorView} */
      theirsView,
      /** 块导航所用的活动视图（Yours 面板） */
      navView: mv.a,
      /** @returns {string} 合并结果（Result / b 面板文档） */
      getResult() {
        return mv.b.state.doc.toString();
      },
      /** 右栏 Theirs 原始内容 */
      getTheirs() {
        return theirsView.state.doc.toString();
      },
      /** 左栏 Yours 原始内容 */
      getYours() {
        return mv.a.state.doc.toString();
      },
      /** 展开/折叠未改区域（T2 增量 E） */
      setCollapse(collapsed) {
        mv.reconfigure({
          collapseUnchanged: collapsed ? collapse : undefined,
        });
      },
      acceptTheirsAt,
      destroy() {
        parent.classList.remove("compare-three-layout");
        theirsView.destroy();
        mv.destroy();
      },
    };
  }

  // ── 两栏对照：a=Yours、b=Theirs，均可编辑或 a 只读（按 opts 决定） ──
  const aExtras = opts.aReadonly
    ? [EditorState.readOnly.of(true), EditorView.editable.of(false)]
    : [];
  const bExtras = opts.bReadonly
    ? [EditorState.readOnly.of(true), EditorView.editable.of(false)]
    : [];

  const mv = new MergeView({
    a: { doc: aFile.content, extensions: [...baseExtensions, ...aExtras] },
    b: { doc: bFile.content, extensions: [...baseExtensions, ...bExtras] },
    parent,
    orientation: "a-b",
    highlightChanges: true,
    gutter: true,
    collapseUnchanged: collapse,
    diffConfig,
  });

  return {
    /** @type {MergeView} */
    mv,
    /** @type {EditorView} */
    a: mv.a,
    /** @type {EditorView} */
    b: mv.b,
    /** 两栏无独立 Theirs 面板 */
    theirsView: null,
    /** 块导航所用的活动视图（默认在 a 面板触发） */
    navView: mv.a,
    /** @returns {string} 当前右侧（Theirs）文档 */
    getResult() {
      return mv.b.state.doc.toString();
    },
    getYours() {
      return mv.a.state.doc.toString();
    },
    getTheirs() {
      return mv.b.state.doc.toString();
    },
    setCollapse(collapsed) {
      mv.reconfigure({
        collapseUnchanged: collapsed ? collapse : undefined,
      });
    },
    acceptTheirsAt() {
      return false;
    },
    destroy() {
      mv.destroy();
    },
  };
}

/**
 * 取某 MergeView 面板的差异块数（供调用方做状态展示 / 测试）。
 * @param {import('@codemirror/state').EditorState} state
 * @returns {number}
 */
export function countChunks(state) {
  const res = getChunks(state);
  return res ? res.chunks.length : 0;
}

/**
 * @typedef {Object} CompareMergeInstance
 * @property {MergeView} mv
 * @property {EditorView} a
 * @property {EditorView} b
 * @property {EditorView|null} theirsView
 * @property {EditorView} navView
 * @property {() => string} getResult
 * @property {() => string} getYours
 * @property {() => string} getTheirs
 * @property {(collapsed: boolean) => void} setCollapse
 * @property {(pos?: number) => boolean} acceptTheirsAt
 * @property {() => void} destroy
 */
