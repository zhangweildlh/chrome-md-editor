// compare-nav.js — 块导航封装（T4 / 增量 B）
//
// 契约导出（docs/compare-contract.md §1）：
//   bindChunkNavigation(view: EditorView) => { next(): void; prev(): void }
//
// 直接复用 @codemirror/merge 的 goToNextChunk / goToPreviousChunk（现成 StateCommand，零自研）。

import { goToNextChunk, goToPreviousChunk } from "@codemirror/merge";

/**
 * 绑定块导航到某个 CodeMirror 编辑器视图。
 * 返回的 next()/prev() 分别对应「下一块 / 上一块」按钮行为（增量 B 块导航）。
 * @param {import('@codemirror/view').EditorView|null|undefined} view
 * @returns {{next:()=>void, prev:()=>void}}
 */
export function bindChunkNavigation(view) {
  const safe = view && typeof view.dispatch === "function" && view.state;
  if (!safe) {
    return { next() {}, prev() {} };
  }
  return {
    next() {
      goToNextChunk({ state: view.state, dispatch: view.dispatch });
    },
    prev() {
      goToPreviousChunk({ state: view.state, dispatch: view.dispatch });
    },
  };
}
