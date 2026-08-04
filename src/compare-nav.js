// compare-nav.js — 块导航封装（T4 / 增量 B）
//
// 契约导出：
//   bindChunkNavigation(view: EditorView) => { next(): void; prev(): void }
//   bindChunkNavigationKeys(handlers, options?) => () => void   // 键盘快捷键
//   resolveChunkNavAction(event) => 'next' | 'prev' | null       // 纯函数，可单测
//   isEditableTarget(target) => boolean
//
// 直接复用 @codemirror/merge 的 goToNextChunk / goToPreviousChunk（现成 StateCommand，零自研）。
//
// 快捷键映射（见 compare.html 上一块/下一块按钮 title）：
//   B / ]            → 下一块
//   Shift+B / [      → 上一块
//   Alt+B            → 下一块（编辑区内也生效）
//   Alt+Shift+B      → 上一块（编辑区内也生效）
// 不带 Alt 时在可编辑区域（CodeMirror / input / textarea）内不响应，避免吞掉正常输入。

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

/**
 * 判断事件目标是否处于可编辑区域（CodeMirror 的 .cm-content 是 contenteditable）。
 * @param {any} target
 * @returns {boolean}
 */
export function isEditableTarget(target) {
  if (!target || typeof target !== "object") return false;
  const tag = typeof target.tagName === "string" ? target.tagName.toUpperCase() : "";
  if (tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT") return true;
  return target.isContentEditable === true;
}

/**
 * 把一个 keydown 事件解析成块导航动作（纯函数，便于单测）。
 * @param {{key?:string, shiftKey?:boolean, altKey?:boolean, ctrlKey?:boolean, metaKey?:boolean, target?:any}} event
 * @returns {'next'|'prev'|null}
 */
export function resolveChunkNavAction(event) {
  if (!event) return null;
  // Ctrl/Cmd 组合留给浏览器与编辑器自身快捷键
  if (event.ctrlKey || event.metaKey) return null;

  const key = typeof event.key === "string" ? event.key : "";
  let action = null;
  if (key === "b" || key === "B") action = event.shiftKey ? "prev" : "next";
  else if (key === "]") action = "next";
  else if (key === "[") action = "prev";
  if (!action) return null;

  // 编辑区内只认 Alt 组合，否则 b / [ / ] 会被当成导航而无法正常输入
  if (!event.altKey && isEditableTarget(event.target)) return null;
  return action;
}

/**
 * 绑定块导航键盘快捷键。传入的 next/prev 应与「上一块 / 下一块」按钮点击调用的
 * 是同一组函数，保证按钮与快捷键行为完全一致（单一实现）。
 * @param {{next?:()=>void, prev?:()=>void}} handlers
 * @param {{target?:any}} [options] target 默认为 document，便于测试注入
 * @returns {() => void} 解绑函数
 */
export function bindChunkNavigationKeys(handlers, options) {
  const next = handlers && typeof handlers.next === "function" ? handlers.next : null;
  const prev = handlers && typeof handlers.prev === "function" ? handlers.prev : null;
  const target =
    (options && options.target) || (typeof document !== "undefined" ? document : null);
  if (!target || typeof target.addEventListener !== "function" || (!next && !prev)) {
    return () => {};
  }

  const onKeyDown = (event) => {
    const action = resolveChunkNavAction(event);
    if (!action) return;
    const run = action === "next" ? next : prev;
    if (!run) return;
    if (typeof event.preventDefault === "function") event.preventDefault();
    run();
  };

  // 捕获阶段：确保 Alt 组合在 CodeMirror 消费之前被处理
  target.addEventListener("keydown", onKeyDown, true);
  return () => target.removeEventListener("keydown", onKeyDown, true);
}
