// compare-merge.js — 两栏 / 三栏 diff 视图（T2 / T4）
//
// 封装 @codemirror/merge 的 MergeView。
//
// 导出（签名在冻结契约基础上做超集扩展，不破坏既有字段）：
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
// 禁用类名闸门：
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
 * 计算 collapseUnchanged 重配置参数。
 * 修复 A6：当两文件完全相同（无任何差异块）时，不折叠——否则整篇文档会被折叠成单个占位，
 * 导致内容不可见（误判为「渲染为空」）。
 * @param {boolean} collapsed
 * @param {{margin?:number,minSize?:number}} collapseConf
 * @param {import('@codemirror/view').EditorView} viewA
 * @returns {undefined|{margin?:number,minSize?:number}}
 */
function resolveCollapse(collapsed, collapseConf, viewA) {
  if (collapsed) {
    const chunks = getChunks(viewA.state);
    if (!chunks || !chunks.chunks.length) return undefined; // 无差异：不折叠
  }
  return collapsed ? collapseConf : undefined;
}

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
    // 结果从（上次保留的）内容开始，由用户接受 Yours / Theirs 块逐步合并（修复 E1：模式切换不丢编辑）
    const resultInitial = opts.result || "";

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
     *
     * 三栏合并模型：左 Yours(a) / 中 Result(b, 可编辑, 逐步建成) / 右 Theirs(独立只读)。
     * 用户光标在 Result(b) 中；需要把「与光标对应的 Theirs 块」插入 Result。
     * 对齐策略：
     *   1) 用 a↔b(当前 Result) 的差异块，把光标在 b 中的位置反推回 Yours(a) 的对应位置 aPos；
     *   2) 用 a↔Theirs 的差异块，找到包含 aPos 的块，取其 Theirs 侧文本；
     *   3) 将 Theirs 文本【插入】Result 光标处（用 insert，避免空文档上替换区间越界 RangeError）。
     *
     * @param {number} [pos]
     * @returns {boolean}
     */
    function acceptTheirsAt(pos) {
      try {
        const resultState = mv.b.state;
        const cursor =
          typeof pos === "number" ? pos : resultState.selection.main.head;
        const aText = Text.of(aFile.content.split("\n"));
        const theirsDoc = theirsView.state.doc;

        // 1) 光标在 Result(b) 的位置 → 反推其在 Yours(a) 的对应位置
        const abChunks = Chunk.build(aText, resultState.doc, diffConfig);
        let aPos = cursor;
        for (const c of abChunks) {
          if (cursor >= c.fromB && cursor <= c.toB) {
            aPos = c.fromA;
            break;
          }
        }

        // 2) 找到 (Yours, Theirs) 差异块中包含 aPos 的块
        const atChunks = Chunk.build(aText, theirsDoc, diffConfig);
        let target = null;
        for (const c of atChunks) {
          if (aPos >= c.fromA && aPos <= c.toA) {
            target = c;
            break;
          }
        }
        // 命中不到光标块：选择离 aPos 最近的块
        if (!target) {
          let best = null;
          let bestDist = Infinity;
          for (const c of atChunks) {
            const d = Math.abs(aPos - c.fromA);
            if (d < bestDist) {
              bestDist = d;
              best = c;
            }
          }
          target = best;
        }
        if (!target) return false; // a 与 Theirs 完全相同，无内容可采纳

        // 3) 将 Theirs 对应块内容【插入】Result 光标处（插入而非替换，避免空文档越界）
        const insertText = theirsDoc.sliceString(target.fromB, target.toB);
        mv.b.dispatch({
          changes: { from: cursor, to: cursor, insert: insertText },
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
        const apply = () =>
          mv.reconfigure({
            collapseUnchanged: resolveCollapse(collapsed, collapse, mv.a),
          });
        apply();
        // diff 异步完成：构造后 / 同步调用时 chunks 尚未就绪，resolveCollapse 会回
        // undefined 而误关折叠。等待 diff 落定后按真实 chunks 校正一次（有差异→折叠
        // 生效；相同文件→保持不折叠）。仅当 collapsed 为真且当前无 chunks 时轮询，
        // 帧上限避免「相同文件 chunks 恒为 0」导致的无限轮询；视图销毁即停止。
        if (collapsed && getChunks(mv.a.state).chunks.length === 0) {
          if (typeof requestAnimationFrame !== "function") return;
          let frames = 0;
          const MAX = 120; // ~2s 上限
          const tick = () => {
            try {
              if (!mv.a || mv.a.dom === null) return; // 已销毁
              const chunks = getChunks(mv.a.state).chunks;
              if (chunks.length > 0) {
                apply(); // diff 完成：按真实 chunks 校正
                return;
              }
              if (++frames < MAX) requestAnimationFrame(tick);
            } catch (_) {
              /* 视图已销毁，忽略 */
            }
          };
          requestAnimationFrame(tick);
        }
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
      const apply = () =>
        mv.reconfigure({
          collapseUnchanged: resolveCollapse(collapsed, collapse, mv.a),
        });
      apply();
      // 与三栏一致：diff 异步落定后校正折叠（避免同步调用时 chunks 未就绪误关折叠）。
      if (collapsed && getChunks(mv.a.state).chunks.length === 0) {
        if (typeof requestAnimationFrame !== "function") return;
        let frames = 0;
        const MAX = 120;
        const tick = () => {
          try {
            if (!mv.a || mv.a.dom === null) return;
            const chunks = getChunks(mv.a.state).chunks;
            if (chunks.length > 0) {
              apply();
              return;
            }
            if (++frames < MAX) requestAnimationFrame(tick);
          } catch (_) {
            /* 视图已销毁，忽略 */
          }
        };
        requestAnimationFrame(tick);
      }
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
