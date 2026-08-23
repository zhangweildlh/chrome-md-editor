// debug-probe.js — 运行态探针（浏览器扩展 + Tauri EXE 共用）
//
// 目的：让编辑器/对比合并页的运行态事件（按钮点击、拖拽 drop、打开文件回调、
//       合并结果、初始化完成、CLI 文件加载）可被外部观测，便于坐实 BUG。
//
// 落盘通道：
//   - Tauri(EXE) 环境：经 window.__TAURI_INTERNALS__.invoke('write_probe_log', {line})
//     由 Rust 侧直接写入 %temp%/cme-exe-probe-<pid>.jsonl（前端无写盘权限，走 Rust 桥）。
//   - 浏览器扩展环境：经 console.log('[PROBE]'+json) 输出，由外部 CDP 探针
//     （连接 360Chromex 9222、监听 Runtime.consoleAPICalled）采集到
//     %temp%/cme-browser-probe-<ts>.jsonl。
//
// 启用开关（默认关闭，零开销）：
//   1) URL 含 ?debug=1
//   2) localStorage['cme-debug'] === '1'
//   3) window.__CME_DEBUG__ === true
//   任一满足即开启。生产中不带这些标记则整个模块不输出任何内容、不注册任何监听。
//
// 用法：在任意模块调用 window.__probe('event-name', {key:'val', ...}) 即可。
//   例如 compare.js 的 onPageDrop 内：window.__probe('drop.html5', {count, active, mode})

(function () {
  if (typeof window === 'undefined') return;

  // ---------------------------------------------------------------------------
  // 1. 启用判定
  // ---------------------------------------------------------------------------
  function isEnabled() {
    try {
      if (window.__CME_DEBUG__ === true) return true;
      if (typeof localStorage !== 'undefined' && localStorage.getItem('cme-debug') === '1') return true;
      if (typeof location !== 'undefined' && /[?&]debug=1\b/.test(location.search)) return true;
    } catch (_) {
      /* localStorage 不可用时忽略 */
    }
    return false;
  }

  // 是否在 Tauri(EXE) 环境：若是，则异步查询 Rust 侧调试桥是否已启用（CME_DEBUG=1），
  // 对齐 Rust 的运行时门控——前端跟着 Rust 一起开/关，避免双重开关不一致。
  const isTauri =
    '__TAURI_INTERNALS__' in window || (window.__TAURI__ && typeof window.__TAURI__.invoke === 'function');

  // 显式开关（URL / localStorage / 全局变量）命中即开。
  const explicitOn =
    window.__CME_DEBUG__ === true ||
    (typeof localStorage !== 'undefined' && localStorage.getItem('cme-debug') === '1') ||
    (typeof location !== 'undefined' && /[?&]debug=1\b/.test(location.search));

  // 运行态：默认按显式开关；Tauri 下额外异步确认 Rust 调试桥状态（CME_DEBUG=1），
  // 对齐 Rust 运行时门控——前端跟着 Rust 一起开/关，避免双重开关不一致。
  let ENABLED = explicitOn;
  if (!ENABLED && isTauri) {
    try {
      const inv = (window.__TAURI_INTERNALS__ && window.__TAURI_INTERNALS__.invoke) ||
        (window.__TAURI__ && window.__TAURI__.invoke);
      if (inv) {
        Promise.resolve(inv('debug_bridge_status'))
          .then((on) => {
            if (on) {
              ENABLED = true;
              emit('probe.init.runtime', { via: 'rust-bridge', isTauri: true });
            }
          })
          .catch(() => {});
      }
    } catch (_) { /* ignore */ }
  }

  // ---------------------------------------------------------------------------
  // 2. 环境判定（复用项目既有约定，绝不 import '@tauri-apps/*'）
  // ---------------------------------------------------------------------------
  function getInvoke() {
    const internals = window.__TAURI_INTERNALS__;
    if (internals && typeof internals.invoke === 'function') return internals.invoke;
    const g = window.__TAURI__;
    if (g && typeof g.invoke === 'function') return g.invoke;
    return null;
  }
  const invoke = isTauri ? getInvoke() : null;

  // ---------------------------------------------------------------------------
  // 3. 输出层
  // ---------------------------------------------------------------------------
  const SESSION = (Date.now() + '-' + Math.floor(Math.random() * 1e4)).toString(36);
  let seq = 0;

  function emit(event, data) {
    if (!ENABLED) return;
    const entry = {
      t: new Date().toISOString(),
      seq: ++seq,
      session: SESSION,
      env: isTauri ? 'exe' : 'browser',
      event,
      data: data || null,
    };
    const line = JSON.stringify(entry);

    if (isTauri && invoke) {
      // EXE 侧：Rust 落盘 %temp%，失败降级到 console 以免静默丢失
      try {
        invoke('write_probe_log', { line }).catch((e) => {
          console.warn('[PROBE][fallback]', event, e);
        });
      } catch (e) {
        console.warn('[PROBE][fallback]', event, e);
      }
    } else {
      // 浏览器扩展侧：console 输出，由外部 CDP 探针采集
      console.log('[PROBE]' + line);
    }
  }

  // 对外 API
  window.__probe = emit;

  // 启动标记（便于外部探针确认探针已加载）
  emit('probe.init', {
    ua: typeof navigator !== 'undefined' ? navigator.userAgent : null,
    url: typeof location !== 'undefined' ? location.href : null,
    isTauri,
  });

  // ---------------------------------------------------------------------------
  // 4. 全局点击采样（可选，默认开启——仅记录带 id/data-probe 的按钮）
  //    避免对每一次点击都记录造成噪声；只记录显式标注 data-probe 或关键按钮。
  // ---------------------------------------------------------------------------
  function onClickCapture(e) {
    const el = e.target && e.target.closest ? e.target.closest('[data-probe],button[id],.toolbar-btn,[role="button"]') : null;
    if (!el) return;
    const id = el.id || el.getAttribute('data-probe') || el.className || '(unknown)';
    emit('click', { id, text: (el.textContent || '').trim().slice(0, 40) });
  }
  document.addEventListener('click', onClickCapture, true);

  // 暴露关闭函数（调试用）
  window.__probeStop = function () {
    document.removeEventListener('click', onClickCapture, true);
    window.__probe = function () {};
  };
})();
