// ==========================================
// 斜杠菜单（Slash Menu）— 纯 CodeMirror 6 实现，零 React
// ------------------------------------------
// 移植自 markra 的 slash-menu-fresh.ts / CodeMirrorEditorFloatingMenus.tsx：
//   - 状态机：StateField + StateEffect 维护 active{from,to,query,source} /
//     selectedIndex / suppressed，区分 typed 与 virtual 来源。
//   - 浮层：原生 JS（ViewPlugin 渲染 <div class="markra-slash-menu">），
//     替代 markra 的 React 浮层，用 view.coordsAtPos 定位、固定定位。
//   - 命令表：每个命令带 run(view)，执行前先删除已键入的 /query 文本，
//     再用 view.dispatch 直接插入/包裹对应 Markdown 片段（仅用 view 实例）。
// 本模块为独立模块，不 import editor.js（避免循环依赖），命令执行只依赖 view。
// 纯逻辑（触发正则 / 命令表 / 过滤 / 视口约束）复用 ./slash-menu-core.js。
// ==========================================

import {
  EditorSelection,
  EditorState,
  Prec,
  StateEffect,
  StateField,
} from '@codemirror/state';
import { keymap, ViewPlugin } from '@codemirror/view';
import { syntaxTree } from '@codemirror/language';
import {
  SLASH_TRIGGER_RE,
  SLASH_COMMANDS as SLASH_COMMANDS_CORE,
  filterSlashCommands as filterSlashCommandsCore,
  nodeChainHasCodeBlock,
  selectionOffsetsFor,
  SLASH_MENU_WIDTH,
  SLASH_MENU_MAX_HEIGHT,
  fitFloatingMenu,
} from './slash-menu-core.js';

// ------------------------------------------------------------------
// 对外暴露的纯函数（供单测，无 CM6 / DOM 依赖）
// ------------------------------------------------------------------

/**
 * 判断光标前文本是否构成斜杠菜单触发。
 * @param {string} lineText 当前行行首到光标处的文本
 * @returns {{ indent: string, query: string } | null}
 */
export function isSlashTrigger(lineText) {
  if (typeof lineText !== 'string') return null;
  const match = SLASH_TRIGGER_RE.exec(lineText);
  if (!match) return null;
  return { indent: match[1] ?? '', query: match[2] ?? '' };
}

/** 按查询词过滤命令表（大小写不敏感，匹配 label / keywords / command id）。 */
export const filterSlashCommands = filterSlashCommandsCore;

// ------------------------------------------------------------------
// 内部类型
// ------------------------------------------------------------------

/** @typedef {'typed' | 'virtual'} SlashMenuSource */

/**
 * @typedef {Object} SlashMenuRange
 * @property {number} from
 * @property {string} query
 * @property {SlashMenuSource} source
 * @property {number} to
 */

/**
 * @typedef {Object} SlashMenuState
 * @property {ReadonlyArray<Object>} actions
 * @property {number | null} from
 * @property {boolean} open
 * @property {string} query
 * @property {number} selectedIndex
 * @property {SlashMenuSource | null} source
 * @property {number | null} to
 */

/**
 * @typedef {Object} InternalSlashMenuState
 * @property {SlashMenuRange | null} active
 * @property {number} selectedIndex
 * @property {{from:number,to:number} | null} suppressed
 */

/** @type {import('@codemirror/state').StateEffectType<{type:'close'} | {type:'open'} | {index:number,type:'select'}>} */
const updateSlashMenu = StateEffect.define();

// ------------------------------------------------------------------
// 状态机辅助函数（移植自 markra）
// ------------------------------------------------------------------

function isEditable(state) {
  return !state.facet(EditorState.readOnly);
}

/**
 * 判断 position 是否位于 FencedCode / CodeBlock 内部（代码块内不触发）。
 * @param {import('@codemirror/state').EditorState} state
 * @param {number} position
 */
function isInsideCodeBlock(state, position) {
  const node = syntaxTree(state).resolve(position, -1);
  return nodeChainHasCodeBlock(node);
}

/**
 * 从 state 推导「键入触发」范围：行尾的 `/query` 或 `、query`。
 * @param {import('@codemirror/state').EditorState} state
 * @returns {SlashMenuRange | null}
 */
function typedRangeFromState(state) {
  if (!isEditable(state) || state.selection.ranges.length !== 1) return null;
  const selection = state.selection.main;
  if (!selection.empty) return null;

  const line = state.doc.lineAt(selection.head);
  if (selection.head !== line.to) return null;
  if (isInsideCodeBlock(state, selection.head)) return null;

  const beforeCursor = state.sliceDoc(line.from, selection.head);
  const match = SLASH_TRIGGER_RE.exec(beforeCursor);
  if (!match) return null;

  const indentLength = match[1]?.length ?? 0;
  return {
    from: line.from + indentLength,
    query: match[2] ?? '',
    source: 'typed',
    to: selection.head,
  };
}

/**
 * 从 state 推导「虚拟触发」范围（由外部命令唤起，无 `/` 前缀）。
 * @param {import('@codemirror/state').EditorState} state
 * @param {number} [from]
 * @returns {SlashMenuRange | null}
 */
function virtualRangeFromState(state, from = state.selection.main.head) {
  if (!isEditable(state) || state.selection.ranges.length !== 1) return null;
  const selection = state.selection.main;
  if (!selection.empty || from > selection.head) return null;

  const line = state.doc.lineAt(selection.head);
  if (selection.head !== line.to || from < line.from) return null;
  if (isInsideCodeBlock(state, selection.head)) return null;

  const query = state.sliceDoc(from, selection.head);
  if (/\s|[/、]/u.test(query)) return null;

  return { from, query, source: 'virtual', to: selection.head };
}

/**
 * 沿用上一事务的虚拟范围起点，在连续输入时保持菜单打开。
 * @param {import('@codemirror/state').Transaction} transaction
 * @param {InternalSlashMenuState} previous
 */
function continuedVirtualRange(transaction, previous) {
  if (previous.active?.source !== 'virtual') return null;
  const from = transaction.changes.mapPos(previous.active.from, -1);
  return virtualRangeFromState(transaction.state, from);
}

/**
 * @param {{from:number,to:number} | null} left
 * @param {{from:number,to:number} | null} right
 */
function sameRange(left, right) {
  return Boolean(
    left && right && left.from === right.from && left.to === right.to,
  );
}

/**
 * @param {import('@codemirror/state').Transaction} transaction
 */
function effectFrom(transaction) {
  return transaction.effects.find((effect) => effect.is(updateSlashMenu))?.value;
}

// ------------------------------------------------------------------
// StateField：状态机核心
// ------------------------------------------------------------------

const slashMenuField = StateField.define({
  /**
   * @param {import('@codemirror/state').EditorState} state
   * @returns {InternalSlashMenuState}
   */
  create(state) {
    return {
      active: typedRangeFromState(state),
      selectedIndex: 0,
      suppressed: null,
    };
  },
  /**
   * @param {InternalSlashMenuState} previous
   * @param {import('@codemirror/state').Transaction} transaction
   * @returns {InternalSlashMenuState}
   */
  update(previous, transaction) {
    const effect = effectFrom(transaction);
    const typedRange = typedRangeFromState(transaction.state);

    if (effect?.type === 'close') {
      return {
        active: null,
        selectedIndex: 0,
        // 保留被关闭的精确键入范围，直到其文本或选区变化，
        // 否则任何后续事务都会重新打开菜单。
        suppressed:
          typedRange?.source === 'typed'
            ? { from: typedRange.from, to: typedRange.to }
            : null,
      };
    }

    if (effect?.type === 'open') {
      return {
        active: virtualRangeFromState(transaction.state),
        selectedIndex: 0,
        suppressed: null,
      };
    }

    const active = typedRange ?? continuedVirtualRange(transaction, previous);
    if (sameRange(active, previous.suppressed)) {
      return { active: null, selectedIndex: 0, suppressed: previous.suppressed };
    }

    const keepSelection =
      active?.from === previous.active?.from &&
      active?.query === previous.active?.query &&
      active?.source === previous.active?.source;

    return {
      active,
      selectedIndex:
        effect?.type === 'select'
          ? effect.index
          : keepSelection
            ? previous.selectedIndex
            : 0,
      suppressed: null,
    };
  },
});

// ------------------------------------------------------------------
// 命令执行（仅用 view 实例）
// ------------------------------------------------------------------

/**
 * 执行指定命令：先删除已键入的 /query 文本，再插入/包裹对应 Markdown 片段。
 * @param {import('@codemirror/view').EditorView} view
 * @param {string} commandId
 * @returns {boolean}
 */
function executeCommand(view, commandId) {
  const menu = getSlashMenuState(view);
  if (!menu.open || menu.from == null || menu.to == null) return false;
  const command = SLASH_COMMANDS_CORE.find((c) => c.command === commandId);
  if (!command) return false;

  const from = menu.from;
  const to = menu.to;
  const insert = command.insert ?? '';
  const { anchor, head } = selectionOffsetsFor(command);

  view.dispatch({
    changes: { from, to, insert },
    effects: updateSlashMenu.of({ type: 'close' }),
    selection: EditorSelection.range(from + anchor, from + head),
    userEvent: 'input',
  });
  view.focus();
  return true;
}

/**
 * 带 run(view) 的命令表（供浮层渲染与单测）。run 闭包引用 commandId，
 * 执行时再从当前菜单状态读取 /query 范围，避免重复携带坐标。
 */
export const slashMenuCommands = SLASH_COMMANDS_CORE.map((command) => ({
  ...command,
  run: /** @param {import('@codemirror/view').EditorView} view */ (view) =>
    executeCommand(view, command.command),
}));

// ------------------------------------------------------------------
// 对外查询 / 控制 API
// ------------------------------------------------------------------

/**
 * 读取当前斜杠菜单状态（含按 query 过滤后的命令列表，每个带 run）。
 * @param {import('@codemirror/view').EditorView} view
 * @returns {SlashMenuState}
 */
export function getSlashMenuState(view) {
  const state = view.state.field(slashMenuField, false);
  if (!state || !state.active) {
    return {
      actions: [],
      from: null,
      open: false,
      query: '',
      selectedIndex: 0,
      source: null,
      to: null,
    };
  }

  const { active } = state;
  const filtered = filterSlashCommandsCore(active.query, SLASH_COMMANDS_CORE);
  const actions = filtered.map((command) => ({
    command: command.command,
    label: command.label,
    keywords: command.keywords,
    run: () => executeCommand(view, command.command),
  }));
  const selectedIndex = Math.min(
    state.selectedIndex,
    Math.max(actions.length - 1, 0),
  );

  return {
    actions,
    from: active.from,
    open: true,
    query: active.query,
    selectedIndex,
    source: active.source,
    to: active.to,
  };
}

/**
 * @param {import('@codemirror/view').EditorView} view
 * @returns {InternalSlashMenuState | null}
 */
function internalState(view) {
  return view.state.field(slashMenuField, false);
}

/**
 * @param {import('@codemirror/view').EditorView} view
 * @param {-1 | 1} amount
 */
function moveSelection(view, amount) {
  const menu = getSlashMenuState(view);
  if (!menu.open) return false;
  const count = menu.actions.length;
  const index = count === 0 ? 0 : (menu.selectedIndex + amount + count) % count;
  view.dispatch({ effects: updateSlashMenu.of({ index, type: 'select' }) });
  return true;
}

/**
 * @param {import('@codemirror/view').EditorView} view
 */
function runSelectedAction(view) {
  const menu = getSlashMenuState(view);
  if (!menu.open || menu.actions.length === 0) return false;
  const selected = menu.actions[menu.selectedIndex];
  return selected ? selected.run() : false;
}

/** @param {import('@codemirror/view').EditorView} view */
export function openMarkraSlashMenu(view) {
  if (!virtualRangeFromState(view.state)) return false;
  view.dispatch({ effects: updateSlashMenu.of({ type: 'open' }) });
  view.focus();
  return true;
}

/** @param {import('@codemirror/view').EditorView} view */
export function closeMarkraSlashMenu(view) {
  if (!internalState(view)?.active) return false;
  view.dispatch({ effects: updateSlashMenu.of({ type: 'close' }) });
  return true;
}

// ------------------------------------------------------------------
// keymap：Prec.highest 优先拦截 ↑/↓/Enter/Tab/Esc
// ------------------------------------------------------------------

const slashMenuKeymap = Prec.highest(
  keymap.of([
    { key: 'ArrowDown', run: (view) => moveSelection(view, 1) },
    { key: 'ArrowUp', run: (view) => moveSelection(view, -1) },
    { key: 'Enter', run: runSelectedAction },
    { key: 'Tab', run: runSelectedAction },
    { key: 'Escape', run: closeMarkraSlashMenu },
  ]),
);

// ------------------------------------------------------------------
// ViewPlugin：原生浮层渲染（替代 React）
// ------------------------------------------------------------------

const slashMenuPlugin = ViewPlugin.fromClass(
  class {
    /**
     * @param {import('@codemirror/view').EditorView} view
     */
    constructor(view) {
      this.view = view;
      /** @type {HTMLElement | null} */
      this.dom = null;
      this.dismiss = /** @param {PointerEvent} event */ (event) => {
        const target = event.target;
        if (target instanceof Element && target.closest('.markra-slash-menu')) {
          return;
        }
        closeMarkraSlashMenu(this.view);
      };
    }

    update() {
      this.render();
    }

    render() {
      const view = this.view;
      const doc = view.dom.ownerDocument;
      const state = getSlashMenuState(view);

      if (!state.open) {
        this.teardown();
        return;
      }

      if (!this.dom) {
        this.dom = doc.createElement('div');
        this.dom.className = 'markra-slash-menu';
        this.dom.setAttribute('role', 'menu');
        doc.body.appendChild(this.dom);
        doc.addEventListener('pointerdown', this.dismiss, true);
      }

      // 用 textContent 渲染标签，防止文件名/文本注入（XSS）。
      this.dom.replaceChildren();
      if (state.actions.length === 0) {
        const empty = doc.createElement('div');
        empty.className = 'markra-slash-menu-empty';
        empty.textContent = '无匹配命令';
        this.dom.appendChild(empty);
      } else {
        state.actions.forEach((command, index) => {
          const button = doc.createElement('button');
          button.type = 'button';
          button.className = 'markra-slash-menu-option';
          button.setAttribute('role', 'menuitem');
          button.textContent = command.label;
          if (index === state.selectedIndex) {
            button.setAttribute('aria-selected', 'true');
          }
          // 保住编辑器选区：mousedown 不抢焦点，点击再执行命令。
          button.addEventListener('mousedown', (event) => event.preventDefault());
          button.addEventListener('click', () => {
            command.run();
          });
          this.dom.appendChild(button);
        });
      }

      // 用 view.coordsAtPos(active.to) 定位（固定定位，视口边界约束）。
      const coords = view.coordsAtPos(state.to);
      if (coords) {
        this.dom.style.position = 'fixed';
        this.dom.style.margin = '0';
        this.dom.style.left = `${coords.left}px`;
        this.dom.style.top = `${coords.bottom}px`;
        this.dom.style.maxHeight = `${SLASH_MENU_MAX_HEIGHT}px`;
        this.dom.style.overflowY = 'auto';

        const rect = this.dom.getBoundingClientRect();
        const fitted = fitFloatingMenu(
          { left: coords.left, top: coords.bottom },
          {
            width: rect.width || SLASH_MENU_WIDTH,
            height: rect.height || 200,
          },
          { width: window.innerWidth, height: window.innerHeight },
        );
        this.dom.style.left = `${fitted.left}px`;
        this.dom.style.top = `${fitted.top}px`;
      }

      // 选中项滚动可见。
      const selected = this.dom.querySelector('[aria-selected="true"]');
      if (selected) selected.scrollIntoView({ block: 'nearest' });
    }

    teardown() {
      if (this.dom) {
        const doc = this.view.dom.ownerDocument;
        doc.removeEventListener('pointerdown', this.dismiss, true);
        this.dom.remove();
        this.dom = null;
      }
    }

    destroy() {
      this.teardown();
    }
  },
);

// ------------------------------------------------------------------
// 导出：集成入口
// ------------------------------------------------------------------

/**
 * 返回斜杠菜单扩展（StateField + keymap + ViewPlugin）。
 * 经 StateField 自启，无需在 editor.js 的 INIT 标记处挂载。
 * @returns {import('@codemirror/state').Extension}
 */
export function markraSlashMenu() {
  return [slashMenuField, slashMenuKeymap, slashMenuPlugin];
}
