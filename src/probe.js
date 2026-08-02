// ============================================================
// 临时调试探针工具（开发期 BUG 定位 / 分析 / 排查专用）
// ------------------------------------------------------------
// 【可彻底回收】本文件 + 各处 `// ===== PROBE START =====` / `// ===== PROBE END =====`
//   标记块 + 全部 `probe(` 调用，即为本次新增的全部临时探针。回收三步：
//   1) 删除本文件 src/probe.js；
//   2) 删除所有被 `// ===== PROBE START/END =====` 包裹的探针调用块；
//   3) 删除 editor.js / 各功能模块里 `import { ... } from './probe.js'` 的引用。
//   （紧急禁用：将下方 PROBE_ENABLED 改为 false，或运行时 window.__setProbeEnabled(false)）
// 【设计目标】探针须能「独立」搜集完整 BUG 定位信息并「独立」写出 log 文件，
//   使 WorkBuddy 仅凭 log 即可定位、分析、修复缺陷：
//   - 每次 probe 自动附带 源码位置(loc) + 环境快照(env: 版本/平台/文档长/选区/滚动/主题…)；
//   - 自动捕获 window.error / unhandledrejection（无需手埋点也能抓 BUG）；
//   - flushProbeLog() 在 EXE 经 Tauri invoke 落盘为 .log，在扩展经 Blob 下载为 .log。
// 注意：此为临时调试代码，非生产功能；定位修复后须按上述三步整体回收。
// ============================================================

// node 测试/构建环境无 window，回退 globalThis，避免模块加载即抛 ReferenceError
const __PROBE_GLOBAL__ = (typeof window !== 'undefined') ? window : globalThis;
__PROBE_GLOBAL__.__PROBE_LOG__ = __PROBE_GLOBAL__.__PROBE_LOG__ || [];

export let PROBE_ENABLED = true;
export function setProbeEnabled(v) {
  PROBE_ENABLED = !!v;
  __PROBE_GLOBAL__.__PROBE_ENABLED__ = PROBE_ENABLED;
}
__PROBE_GLOBAL__.__setProbeEnabled__ = setProbeEnabled;
__PROBE_GLOBAL__.__PROBE_ENABLED__ = PROBE_ENABLED;

const PROBE_MAX_ENTRIES = 4000;

// 环境快照提供器（由 editor.js 在初始化时注册，提供编辑器上下文）
let __envProvider__ = null;
export function registerProbeEnvProvider(fn) {
  __envProvider__ = fn;
}
__PROBE_GLOBAL__.__registerProbeEnvProvider__ = registerProbeEnvProvider;

// 解析调用位置（文件:行），用于 BUG 定位
function getCallerLocation() {
  try {
    const lines = (new Error().stack || '').split('\n');
    for (let i = 2; i < lines.length; i++) {
      const l = lines[i] || '';
      if (/probe\.js|getCallerLocation|Error\.stack/.test(l)) continue;
      const m = l.match(/(?:at\s+)?(?:.*?\s+)?\(?([^()\s]+\.js):(\d+):(\d+)\)?/);
      if (m) return `${m[1]}:${m[2]}`;
      const m2 = l.match(/([^/\\]+\.js):(\d+)/);
      if (m2) return `${m2[1]}:${m2[2]}`;
    }
  } catch { /* ignore */ }
  return 'unknown';
}

// 主探针函数：每个埋点独立收集自身所需信息，统一累积到 window.__PROBE_LOG__
export function probe(tag, data, opts = {}) {
  if (!PROBE_ENABLED) return null;
  // node 测试/构建环境无 window，跳过（探针仅用于浏览器/EXE 运行时复现 BUG）
  if (typeof window === 'undefined') return null;

  let safe;
  try {
    safe = JSON.parse(JSON.stringify(data, (_k, v) => {
      if (typeof v === 'string' && v.length > 4000) return v.slice(0, 4000) + '…[truncated]';
      if (v instanceof Error) return { name: v.name, message: v.message, stack: (v.stack || '').split('\n').slice(0, 10) };
      return v;
    }));
  } catch {
    safe = { _raw: String(data) };
  }

  const entry = {
    ts: new Date().toISOString(),
    tag,
    loc: opts.loc || getCallerLocation(),
    ...safe,
  };
  // 自动附带环境快照，使每条记录都自带完整上下文（满足 BUG 定位需求）
  if (__envProvider__ && opts.noEnv !== true) {
    try { entry.env = __envProvider__(); } catch { /* ignore */ }
  }

  const arr = __PROBE_GLOBAL__.__PROBE_LOG__;
  arr.push(entry);
  if (arr.length > PROBE_MAX_ENTRIES) arr.splice(0, arr.length - PROBE_MAX_ENTRIES);

  // 实时输出到 console，便于 DevTools 观察
  console.log(`%c[PROBE ${tag}]`, 'color:#ff6600;font-weight:bold;font-size:12px', entry);
  return entry;
}

// 自动捕获未处理错误 —— 即使未手埋点也能独立收集 BUG 信息
function installErrorCapture() {
  if (typeof window === 'undefined') return;
  window.addEventListener('error', (ev) => {
    probe('UNCAUGHT_ERROR', {
      message: ev.message,
      filename: ev.filename,
      lineno: ev.lineno,
      colno: ev.colno,
      stack: ev.error ? (ev.error.stack || '').split('\n').slice(0, 14) : null,
    });
    // 严重错误主动落盘/下载一次，确保 log 文件内容足以定位
    if (PROBE_ENABLED) {
      setTimeout(() => { try { flushProbeLog(); } catch { /* ignore */ } }, 0);
    }
  });
  window.addEventListener('unhandledrejection', (ev) => {
    const r = ev.reason;
    probe('UNHANDLED_REJECTION', {
      message: r && r.message,
      stack: r && r.stack ? r.stack.split('\n').slice(0, 14) : null,
    });
  });
}
installErrorCapture();

export function getEnvironmentSnapshot() {
  if (__envProvider__) { try { return __envProvider__(); } catch { /* ignore */ } }
  return {};
}

function buildLogText() {
  const arr = __PROBE_GLOBAL__.__PROBE_LOG__ || [];
  const header = [
    '========================================',
    ' Markdown Editor - PROBE LOG',
    ` generated : ${new Date().toISOString()}`,
    ` entries   : ${arr.length}`,
    ` enabled   : ${PROBE_ENABLED}`,
    '========================================',
  ].join('\n');
  const blocks = arr.map((e) => {
    const { ts, tag, ...rest } = e;
    let body;
    try { body = JSON.stringify(rest, null, 2); } catch { body = String(rest); }
    return `---------- [${ts}] ${tag} ----------\n${body}`;
  });
  return header + '\n\n' + blocks.join('\n\n') + `\n\n========== PROBE LOG END (${arr.length} entries) ==========\n`;
}

// 写出 log 文件：EXE 弹保存对话框让用户选位置后写入；扩展/兜底经 Blob 触发下载
export async function flushProbeLog() {
  const text = buildLogText();
  const defaultName = `probe-log-${new Date().toISOString().replace(/[:.]/g, '-')}.log`;

  // 1. EXE 环境：弹系统 Save 对话框（用户取消→返回 canceled:true，不再静默写 TEMP 让用户找不到）
  //    旧实现直接 invoke('probe_log') 写 %TEMP%/md-editor-probe.log，提示却说「下载文件」，
  //    用户在下载文件夹找不到文件 → 误以为未导出。改为 save 对话框后用户主导位置，消息里附实际路径。
  if (typeof window !== 'undefined' && window.__TAURI_INTERNALS__) {
    try {
      const [{ save }, { invoke }] = await Promise.all([
        import('@tauri-apps/plugin-dialog'),
        import('@tauri-apps/api/core'),
      ]);
      const path = await save({
        defaultPath: defaultName,
        filters: [
          { name: 'Log Files', extensions: ['log', 'txt'] },
          { name: 'All Files', extensions: ['*'] },
        ],
      });
      if (!path) {
        return { ok: false, canceled: true };
      }
      // 使用 Rust 侧已有的 write_text_file 命令（desktop/src/lib.rs 中已注册，无 fs scope 限制）
      await invoke('write_text_file', { path, content: text });
      console.log('[PROBE] 已通过 Tauri 保存对话框落盘:', path);
      return { ok: true, method: 'tauri-save-dialog', path, length: text.length };
    } catch (err) {
      console.warn('[PROBE] Tauri 保存对话框失败，回退到下载', err);
    }
  }

  // 2. 扩展 / 兜底：构造 Blob 并触发浏览器下载为 .log
  try {
    const blob = new Blob([text], { type: 'text/plain;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = defaultName;
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);
    return { ok: true, method: 'download', length: text.length };
  } catch (err) {
    console.error('[PROBE] 导出下载失败', err);
    return { ok: false, error: String(err) };
  }
}
__PROBE_GLOBAL__.__flushProbeLog__ = flushProbeLog;

// 手动导出（供「导出探针日志」按钮调用）
export function exportProbeLog() { return flushProbeLog(); }
__PROBE_GLOBAL__.__exportProbeLog__ = exportProbeLog;

// 清空缓冲（复现新场景前调用）
export function clearProbeLog() { __PROBE_GLOBAL__.__PROBE_LOG__ = []; }
__PROBE_GLOBAL__.__clearProbeLog__ = clearProbeLog;
