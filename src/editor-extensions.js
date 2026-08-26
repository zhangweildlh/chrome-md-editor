// ==========================================
// 共享编辑器扩展工厂 createEditorExtensions(opts)
// 从 editor.js 的 extensions 数组（原 441–525 行）整体抽取为可复用工厂，
// 供编辑页与对比/合并页共用同一套 CodeMirror 6 内核。
// 本文件不得 import editor.js —— 所有编辑页专属胶水（updateListener 等）
// 都不在此工厂内（见下方说明 / 设计文档 §8.3）。
// ==========================================

import {
  lineNumbers, highlightActiveLineGutter, highlightSpecialChars,
  drawSelection, dropCursor, rectangularSelection, crosshairCursor,
  highlightActiveLine, keymap, EditorView, ViewPlugin, Decoration,
  WidgetType,
} from '@codemirror/view';
import { EditorState, Annotation, Compartment, RangeSetBuilder, StateField } from '@codemirror/state';
import { defaultKeymap, history, historyKeymap, indentWithTab } from '@codemirror/commands';
import {
  syntaxHighlighting, defaultHighlightStyle, indentOnInput,
  bracketMatching, foldGutter, foldKeymap,
} from '@codemirror/language';
import {
  closeBrackets, closeBracketsKeymap, autocompletion, completionKeymap,
} from '@codemirror/autocomplete';
import { search, searchKeymap } from '@codemirror/search';
import { lintKeymap } from '@codemirror/lint';
import { markdown, markdownLanguage } from '@codemirror/lang-markdown';
import { languages } from '@codemirror/language-data';
import { oneDark } from '@codemirror/theme-one-dark';

import { mdEditorHighlightExtensions } from './md-editor-highlight.js';
import { makeSearchPanel } from './search-panel.js';
import { markraSlashMenu } from './slash-menu.js';
import { codeMirrorBlockDragPlugin } from './block-drag.js';
import { initBase64Fold } from './base64-fold.js';
import { BRACKETS_STR } from './close-brackets-config.js';
import { themeCompartment, lightTheme } from './editor-theme-base.js';
import { selectedBracketHighlight } from './bracket-highlight.js';
import { codeBlockLanguageCompletions } from './codeblock-complete.js';

// ==========================================
// 需求 A：自定义「选中字符串高亮」ViewPlugin（替换内置 highlightSelectionMatches）
// 根因：内置 highlightSelectionMatches() 在拖动选区的每一帧都重建匹配集并重绘，
//       多处匹配时产生可见闪烁。此处改为「拖动中不高亮、松开后一次性高亮全部」：
//       - 选区/文档变化（拖动、Shift 方向键、输入）时立即清除高亮，重置 150ms 防抖计时器；
//         清空心高亮对每帧而言均为空→空，无视觉跳变，故拖动全程无闪烁。
//       - 连续变化停止 150ms（空闲 / 落定）后，由计时器派发一次性事务触发重算；
//       - 仅扫描视口 visibleRanges，maxMatches 封顶 100，避免大文档全量扫描拖帧；
//       - 幂等备忘：落定后若选中文本与上次查询相同则跳过重算（避免不必要的重绘）。
//       保留「高亮全部相同串」功能，仅消除闪烁。
// ==========================================
const SELECTION_MATCH_MAX = 100;
const SELECTION_MATCH_MIN = 2;       // 刻意 > 内置默认 minSelectionLength(1)，避免单字符选区满屏高亮
const SELECTION_MATCH_DEBOUNCE = 150; // ms，选区落定后的空闲阈值

// 计时器派发事务用的注解：仅携带此注解的事务才触发重算，避免与正常事务耦合。
const recomputeAnnotation = Annotation.define();

export function computeSelectionMatches(view, maxMatches) {
  const sel = view.state.selection.main;
  const text = sel.empty ? '' : view.state.sliceDoc(sel.from, sel.to);
  if (!text || text.length < SELECTION_MATCH_MIN) return Decoration.set([], true);

  const needle = text;
  const builder = [];
  let count = 0;

  for (const { from, to } of view.visibleRanges) {
    const slice = view.state.doc.sliceString(from, to);
    let idx = slice.indexOf(needle);
    while (idx !== -1) {
      const start = from + idx;
      const end = start + needle.length;
      // 跳过与选区重叠的匹配，仅装饰选区之外的相同串（与内置语义一致，避免选区文本被重复高亮）。
      // 关键：continue 前必须推进 idx，否则重叠匹配会触发死循环（主线程卡死，编辑器无响应）。
      if (!(start < sel.to && end > sel.from)) {
        builder.push(Decoration.mark({ class: 'cm-selectionMatch' }).range(start, end));
        count++;
        if (count >= maxMatches) break;
      }
      idx = slice.indexOf(needle, idx + 1);
    }
    if (count >= maxMatches) break;
  }
  return Decoration.set(builder, true);
}

const selectionMatchHighlighter = ViewPlugin.fromClass(
  class {
    constructor(view) {
      this.view = view;
      this.decorations = Decoration.set([], true);
      this.lastQuery = null;
      this.timer = null;
      // 首屏若已有选区，150ms 后一次性高亮（等效于原内置行为，且不闪）。
      this.schedule();
    }

    schedule() {
      clearTimeout(this.timer);
      this.timer = setTimeout(() => {
        // 空闲阈值到达：派发一次性事务，由 update 识别后重算。
        this.view.dispatch({ annotations: recomputeAnnotation.of(true) });
      }, SELECTION_MATCH_DEBOUNCE);
    }

    update(update) {
      // 选区或文档变化：拖动 / 编辑进行中 → 立即清空心高亮（拖动中不高亮），
      // 重置备忘与防抖计时器；本帧不重算，故无逐帧闪烁。
      if (update.selectionSet || update.docChanged) {
        this.decorations = Decoration.set([], true);
        this.lastQuery = null;
        this.schedule();
        return;
      }
      // 仅视口滚动（选区/文档未变）：旧视口算出的高亮已失效，重算可见范围内的匹配（单次整体重算，无闪烁）。
      if (update.viewportChanged) {
        this.lastQuery = null;
        this.recompute();
        return;
      }
      // 由本插件计时器派发的空闲事务：落定后一次性重算。
      if (update.transactions.some((tr) => tr.annotation(recomputeAnnotation))) {
        this.recompute();
      }
    }

    recompute() {
      const view = this.view;
      const sel = view.state.selection.main;
      const text = sel.empty ? '' : view.state.sliceDoc(sel.from, sel.to);
      // 幂等备忘：选中文本与上次查询相同（且非空）则跳过重算，避免几何不变时的重绘 churn。
      if (text && text === this.lastQuery) return;
      this.lastQuery = text;
      this.decorations = computeSelectionMatches(view, SELECTION_MATCH_MAX);
    }

    destroy() {
      clearTimeout(this.timer);
    }
  },
  {
    decorations: (v) => v.decorations,
  }
);

/**
 * 共享编辑器扩展工厂。返回与编辑页等价的扩展数组：
 * 语法高亮彩色 / 查找替换 / 斜杠菜单 / 块拖拽 / 括号匹配 / base64 折叠 /
 * 主题 compartment / markdown 高亮 / 含自定义快捷键的 keymap。
 *
 * 注意（设计文档 §8.3）：工厂【排除】编辑页专属的 updateListener
 * （updatePreview / markModified / scheduleAutosave / updateStatus /
 * maybeCenterActiveLine）—— 该 listener 仍由 editor.js 自身保留，不进入工厂。
 *
 * @param {object} [opts]
 * @param {string} [opts.theme='light'] 当前主题，'dark' 用 oneDark，其余用 lightTheme
 * @param {Array}  [opts.extraKeymap=[]] 追加到 keymap 的自定义绑定（如编辑页的
 *        Mod-s/Mod-o/Mod-b/Mod-i/Mod-g，由各调用方通过此参数注入，保持工厂与
 *        editor.js 解耦）
 * @returns {Array} CodeMirror 6 扩展数组
 */
// ==========================================
// G8 显示选项：空格 / 换行符 / 换行标记 / Unicode 控制字符 的可视化开关
//  - 空格：自定义 whitespace 插件（㉑），空格带 cm-space-dot（契约类，CSS Agent 染红），
//    制表符保持官方 cm-highlightTab（→），见下方 highlightSpaceDots()。
//  - 换行符/换行标记：自定义行尾 Decoration.line + CSS ::after（↵ / ¶），零 widget DOM
//  - Unicode 控制字符：highlightSpecialChars()（官方，零宽/方向等显示为框符）
// 独立 Compartment 实现动态开关（heynote 范式：初始注入 + reconfigure 切换）。
// ==========================================
// ㉑ 空格 → 红色居中小圆点：自定义 whitespace 插件（替代官方 highlightWhitespace()）。
// 与官方实现同语义：按可见行扫描，连续空白（空格/制表符/NBSP 等 \s）合并为一个
// Decoration.mark；首字符为制表符则带 cm-highlightTab（沿用现有 → 样式），否则带
// cm-space-dot + cm-highlightSpace 双类：cm-space-dot 是 HTML/CSS Agent 的契约类，
// cm-highlightSpace 沿用现有红点规则，保证 CSS 更新前空格渲染不中断。
// 与 highlightSpecialChars（Unicode 控制字符）/ eol 行尾标记互不干扰（独立 Compartment）。
function buildWhitespaceDecorations(view) {
  const builder = new RangeSetBuilder();
  for (const { from, to } of view.visibleRanges) {
    let pos = from;
    // 逐行推进：line.to 是行尾换行符位置，doc.lineAt(line.to) 仍返回【本行】，
    // 故必须显式 pos = line.to + 1 才能跨入下一行；否则 line/lineEnd/i 全部不前进，
    // 外层循环无限空转 → 主线程卡死（#3 显示空格开启时编辑器冻结的根因）。
    while (pos <= to) {
      const line = view.state.doc.lineAt(pos);
      const start = Math.max(from, line.from); // 不越界装饰可见区起点之前
      for (let i = start; i < line.to; i++) {
        const ch = line.text[i - line.from];
        if (ch === ' ' || ch === '\t') {
          // #11 修复：每个空白字符独立一个 Decoration.mark（逐字符），
          // 不再合并连续空白为单段粗横线。制表符与空格各自独立标记，
          // 视觉上表现为独立的红点/箭头，而非连成一条粗线。
          const cls = ch === '\t' ? 'cm-highlightTab' : 'cm-space-dot cm-highlightSpace';
          builder.add(i, i + 1, Decoration.mark({ class: `${cls} cm-whitespace` }));
        }
      }
      pos = line.to + 1; // 跨到下一行起点（跳过换行符）；越界时 while 条件终止
    }
  }
  return builder.finish();
}

function highlightSpaceDots() {
  return ViewPlugin.fromClass(class {
    constructor(view) {
      this.view = view;
      this.decorations = buildWhitespaceDecorations(view);
    }
    update(update) {
      // 文档变化或视口滚动时重建可见区装饰（与官方 highlightWhitespace 相同的更新策略）
      if (update.docChanged || update.viewportChanged) {
        this.decorations = buildWhitespaceDecorations(update.view);
      }
    }
  }, { decorations: (v) => v.decorations });
}

export const showWhitespaceCompartment = new Compartment();
export const showEolCompartment = new Compartment();
export const showEolMarkCompartment = new Compartment();
export const showSpecialCharsCompartment = new Compartment();

/** EOL 行尾标签 widget：按 kind 区分换行符(eol)与换行标记(eolMark)（#12/#13 纠正）。
 *  - eol：真实换行符 → 绿色小方块 + 文字 "LF"/"CR"/"CRLF"（.cm-eol-label）。
 *  - eolMark：空行占位提示 → 仅回车箭头 ⏎，无红框（.cm-eolmark-label）。 */
class EolLabelWidget extends WidgetType {
  constructor(label, kind) {
    super();
    this.label = label;
    this.kind = kind || 'eol';
  }
  eq(other) { return other.label === this.label && other.kind === this.kind; }
  toDOM() {
    const span = document.createElement("span");
    if (this.kind === 'eolMark') {
      span.className = "cm-eolmark-label";
      span.textContent = "⏎";
    } else {
      span.className = "cm-eol-label";
      span.textContent = this.label;
    }
    span.setAttribute("aria-hidden", "true");
    return span;
  }
  ignoreEvent() { return true; }
  get estimatedHeight() { return -1; }
}

function detectLineEnding(doc, line) {
  if (line.to >= doc.length) return null;
  const next = doc.sliceString(line.to, Math.min(doc.length, line.to + 2));
  if (next.startsWith("\r\n")) return "CR LF";
  if (next.startsWith("\n")) return "LF";
  if (next.startsWith("\r")) return "CR";
  return null;
}

function buildEolLabels(doc) {
  const builder = new RangeSetBuilder();
  for (let i = 1; i <= doc.lines; i++) {
    const line = doc.line(i);
    const label = detectLineEnding(doc, line);
    if (label) {
      // eol：真实换行符 → 绿色小方块 + LF/CR/CRLF（.cm-eol-label）。
      builder.add(line.to, line.to, Decoration.widget({ widget: new EolLabelWidget(label, 'eol'), side: 1 }));
    }
  }
  return builder.finish();
}

/** 换行标记：仅空行（text 为空）在文本末尾显示回车箭头 ⏎，无红框（#12/#13 纠正）。 */
function buildEolMarkLabels(doc) {
  const builder = new RangeSetBuilder();
  for (let i = 1; i <= doc.lines; i++) {
    const line = doc.line(i);
    if (line.text.length === 0) {
      builder.add(line.to, line.to, Decoration.widget({ widget: new EolLabelWidget("⏎", 'eolMark'), side: 1 }));
    }
  }
  return builder.finish();
}

/** 行尾标记：inline widget 显示实际换行符类型（CR/LF/CR LF），紧贴文本末尾，不撑高行高（#12/#13）。 */
const eolLabelsExtension = StateField.define({
  create(state) { return buildEolLabels(state.doc); },
  update(deco, tr) {
    if (!tr.docChanged) return deco;
    return buildEolLabels(tr.newDoc);
  },
  provide: (f) => EditorView.decorations.from(f),
});

/** 换行标记：inline widget 显示⏎（仅空行），不撑高行高（#12/#13 纠正）。 */
const eolMarkExtension = StateField.define({
  create(state) { return buildEolMarkLabels(state.doc); },
  update(deco, tr) {
    if (!tr.docChanged) return deco;
    return buildEolMarkLabels(tr.newDoc);
  },
  provide: (f) => EditorView.decorations.from(f),
});

// 上次应用的状态，用于 F6：仅对发生变化的项 reconfigure（减少冗余 dispatch）
let lastInvisibles = null;

/**
 * 动态应用显示选项（4 个 compartment，仅对发生变化的项 reconfigure，F6）。
 * @param {EditorView} view
 * @param {{space?:boolean, eol?:boolean, eolMark?:boolean, specialChars?:boolean}} settings
 */
export function applyInvisiblesSettings(view, settings = {}) {
  if (!view) return;
  const prev = lastInvisibles || {};
  const effects = [];
  const push = (comp, key, ext) => {
    if (settings[key] !== undefined && settings[key] !== prev[key]) {
      effects.push(comp.reconfigure(settings[key] ? ext : []));
    }
  };
  push(showWhitespaceCompartment, 'space', highlightSpaceDots());
  // #12/#13 纠正：eol 与 eolMark 分属独立 compartment，各自渲染不同内容。
  //  - eol：真实换行符 → 绿色小方块 + LF/CR/CRLF（eolLabelsExtension）。
  //  - eolMark：空行占位 → ⏎（eolMarkExtension）。
  push(showEolCompartment, 'eol', eolLabelsExtension);
  push(showEolMarkCompartment, 'eolMark', eolMarkExtension);
  push(showSpecialCharsCompartment, 'specialChars', highlightSpecialChars());
  if (effects.length) {
    view.dispatch({ effects });
    lastInvisibles = { ...prev, ...settings };
  }
}

export function createEditorExtensions(opts = {}) {
  const theme = opts.theme === 'dark' ? oneDark : lightTheme;
  // G8 显示选项默认值：空格/换行符/换行标记默认关，Unicode 控制字符默认开（保留现状）
  const invis = { space: false, eol: false, eolMark: false, specialChars: true, ...(opts.invisibles || {}) };

  return [
    lineNumbers(),
    highlightActiveLineGutter(),
    showSpecialCharsCompartment.of(invis.specialChars ? highlightSpecialChars() : []),
    history(),
    foldGutter(),
    drawSelection(),
    dropCursor(),
    EditorState.allowMultipleSelections.of(true),
    indentOnInput(),
    syntaxHighlighting(defaultHighlightStyle, { fallback: true }),
    // A+B 方案 Phase 2：编辑区 Markdown 语法彩色字体（class 驱动）+ 行底色。
    // 叠加在通用高亮之上，不冲突（前者管通用 token，后者管 markdown tag 的 cm-md-* 类）。
    ...mdEditorHighlightExtensions,
    bracketMatching(),
    // 中文符号自动配对：closeBrackets 本身不接受配置参数（配置经 languageDataAt 读取）。
    // BRACKETS_STR 由 ./close-brackets-config.js 的 BRACKET_PAIRS 权威派生，本处仅消费。
    EditorState.languageData.of((state, pos) => [
      {
        closeBrackets: {
          brackets: BRACKETS_STR,
        },
      },
    ]),
    closeBrackets(),
    autocompletion(),
    rectangularSelection(),
    crosshairCursor(),
    highlightActiveLine(),
    // 需求 A：自写落定式「选中字符串高亮」，替换内置 highlightSelectionMatches()（消除拖动闪烁）。
    selectionMatchHighlighter,
    search({ createPanel: makeSearchPanel }),
    selectedBracketHighlight,
    ...initBase64Fold(),
    // === MARKRA_HOOK: SLASH_MENU === 斜杠菜单
    markraSlashMenu(),
    // === MARKRA_HOOK: BLOCK_DRAG === 块拖拽
    codeMirrorBlockDragPlugin(),
    // === MARKRA_HOOK: VIEW_MODE === 视图模式（预留）
    // === MARKRA_HOOK: WORKSPACE_SEARCH === 工作区搜索（预留）
    keymap.of([
      ...closeBracketsKeymap,
      ...defaultKeymap,
      ...searchKeymap,
      ...historyKeymap,
      ...foldKeymap,
      ...completionKeymap,
      ...lintKeymap,
      indentWithTab,
      // 自定义快捷键由各调用方通过 opts.extraKeymap 注入（编辑页：Mod-s/o/b/i/g）
      ...(opts.extraKeymap || []),
    ]),
    markdown({
      base: markdownLanguage,
      codeLanguages: languages,
      extensions: [
        markdownLanguage.data.of({ autocomplete: codeBlockLanguageCompletions }),
      ],
    }),
    EditorView.lineWrapping,
    themeCompartment.of(theme),
    // G8 显示选项 compartments（初始按设置注入；动态切换走 applyInvisiblesSettings）
    showWhitespaceCompartment.of(invis.space ? highlightSpaceDots() : []),
    // #12/#13 纠正：eol / eolMark 独立 compartment 各自注入对应扩展。
    showEolCompartment.of(invis.eol ? eolLabelsExtension : []),
    showEolMarkCompartment.of(invis.eolMark ? eolMarkExtension : []),
    // 注意：编辑页专属 updateListener 不放入工厂（见上方函数注释 / 设计文档 §8.3）
  ];
}
