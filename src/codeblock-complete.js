// ============================================================
// A-6 代码块语言名补全
// 在 ``` 围栏后的语言名位置，弹出语言候选（含简写展开 py→python）。
// 复用已安装的 @codemirror/language-data 的 languages 列表。
// 依赖：@codemirror/autocomplete、@codemirror/language-data
// ============================================================
import { languages } from '@codemirror/language-data';
import { probe } from './probe.js';

// 常用简写 → 标准语言名
const ALIASES = {
  py: 'python', js: 'javascript', ts: 'typescript', yml: 'yaml',
  sh: 'bash', md: 'markdown', rs: 'rust', 'c++': 'cpp', 'c#': 'csharp',
  ht: 'html', kx: 'kotlin', kt: 'kotlin', go: 'go', rb: 'ruby', pl: 'perl',
};

// 候选补全源：仅当光标紧接在 ``` 之后（围栏语言位）时触发
export function codeBlockLanguageCompletions(context) {
  // ===== PROBE START =====
  // A-6 遍布式临时探针：补全触发生效 / 无候选 / 异常 三类路径均独立采集，
  // 每条记录自动附带 loc(源码位置) + env(环境快照)，可经「导出探针日志」落盘 .log。
  try {
    const pos = context.pos;
    const line = context.state.doc.lineAt(pos);
    const before = line.text.slice(0, pos - line.from);
    const m = before.match(/```\s*([A-Za-z0-9_+#.-]*)$/);
    // 不在围栏语言位（无 ``` 前缀）时不埋点，避免每次光标移动产生噪声
    if (!m) return null;
    const typed = m[1].toLowerCase();
    const from = pos - typed.length;

    const seen = new Set();
    const options = [];
    const list = (languages || []).map((l) => l.name).filter(Boolean);
    for (const name of list) {
      const lower = name.toLowerCase();
      if (lower.startsWith(typed)) {
        if (!seen.has(lower)) { seen.add(lower); options.push({ label: name, type: 'keyword' }); }
      }
    }
    for (const [alias, full] of Object.entries(ALIASES)) {
      if (alias.startsWith(typed) && !seen.has(full)) {
        seen.add(full);
        options.push({ label: alias, detail: `→ ${full}`, type: 'text', apply: full });
      }
    }
    if (!options.length) {
      probe('A6_COMPLETE_NO_MATCH', { typed, from }, { loc: 'codeblock-complete.js' });
      return null;
    }
    probe('A6_COMPLETE_TRIGGER', { typed, from, candidates: options.length }, { loc: 'codeblock-complete.js' });
    return {
      from,
      options,
      validFor: /[A-Za-z0-9_+#.-]*/,
    };
  } catch (err) {
    probe('A6_COMPLETE_ERR', { message: err && err.message, stack: err && err.stack }, { loc: 'codeblock-complete.js' });
    return null;
  }
  // ===== PROBE END =====
}
