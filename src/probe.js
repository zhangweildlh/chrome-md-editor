// ===== PROBE START =====
// EXE 运行期诊断探针模块（仅供排查 BUG 使用）。
// ⚠️ 彻底修复 BUG 后，必须连同本文件、所有 `import { PROBE }`、所有
//    `// ===== PROBE START/END =====` 标记块、以及 Rust 侧 `probe_log` 命令一并删除。
//
// PROBE(tag, detail):
//   1) console.log 一条 [PROBE] 日志（便于 DevTools 控制台查看）
//   2) 在桌面端（window.__TAURI_INTERNALS__ 存在）调用 Rust 命令
//      `probe_log` 把日志追加写入「EXE 同目录/md_editor_probe.log」
//      首次成功时记住日志绝对路径（window.__PROBE_PATH__），便于定位。
// 任何异常都被吞掉，绝不干扰主流程。
// ===== PROBE END =====

let __PROBE_PATH__ = "";

export async function PROBE(tag, detail) {
  const line = `[PROBE] ${tag} :: ${detail}`;
  try {
    console.log(line);
  } catch (_) {}
  try {
    if (typeof window !== "undefined" && "__TAURI_INTERNALS__" in window) {
      const { invoke } = await import("@tauri-apps/api/core");
      const p = await invoke("probe_log", { msg: line });
      if (p && !__PROBE_PATH__) {
        __PROBE_PATH__ = p;
        try { window.__PROBE_PATH__ = p; } catch (_) {}
      }
    }
  } catch (e) {
    try { console.warn("[PROBE] log-failed:", e); } catch (_) {}
  }
}

// 在 window 上挂同步引用，供 desktop-shims.js（IIFE）调用。
if (typeof window !== "undefined") {
  try { window.__PROBE__ = PROBE; } catch (_) {}
}
