// ============================================================
// 临时调试探针工具（用于定位 BUG-1/2/3）
//   BUG-1：预览区回车后段间全添加空行
//   BUG-2：预览区修改字符串后编辑区/预览区跳转头部
//   BUG-3：预览区删除引用块空段 `>` 时编辑区不跟随删除
// 注意：此为临时调试代码，非生产功能；定位修复后应整体删除
//       （含各处对 probe() 的调用、本文件、editor.html 的导出按钮）。
// ============================================================

// 全局日志缓冲（所有探针共享，按 tag 区分）
// 容错：node 测试环境无 window，回退 globalThis，避免模块加载即抛 ReferenceError
const __PROBE_GLOBAL__ = (typeof window !== 'undefined') ? window : globalThis;
__PROBE_GLOBAL__.__PROBE_LOG__ = __PROBE_GLOBAL__.__PROBE_LOG__ || [];

export const PROBE_ENABLED = true;

// 每个探针独立调用本函数收集【自身】所需信息；信息按 tag 显著区分，
// 统一累积到 window.__PROBE_LOG__，最终由 exportProbeLog() 导出为 .log 文件。
export function probe(tag, data) {
  if (!PROBE_ENABLED) return null;
  // node 测试/构建环境无 window，跳过探针（探针仅用于浏览器/EXE 运行时复现 BUG 采集）
  if (typeof window === 'undefined') return null;
  let safe;
  try {
    // 深拷贝基本可序列化信息，避免后续 DOM 变更影响本次快照
    safe = JSON.parse(
      JSON.stringify(data, (k, v) => {
        if (typeof v === 'string' && v.length > 4000) {
          return v.slice(0, 4000) + '…[truncated]';
        }
        return v;
      })
    );
  } catch {
    safe = { _raw: String(data) };
  }
  const entry = { ts: new Date().toISOString(), tag, ...safe };
  window.__PROBE_LOG__.push(entry);
  // 实时输出到 console，便于 DevTools 观察（醒目橙色 + 标志）
  console.log(
    `%c[PROBE ${tag}]`,
    'color:#ff6600;font-weight:bold;font-size:12px',
    data
  );
  return entry;
}

// 将累积日志导出为 .log 文件（浏览器环境触发下载）
export function exportProbeLog() {
  const arr = window.__PROBE_LOG__ || [];
  const blocks = arr.map((e) => {
    const { ts, tag, ...rest } = e;
    let body;
    try {
      body = JSON.stringify(rest, null, 2);
    } catch {
      body = String(rest);
    }
    return `========== [${ts}] ${tag} ==========\n${body}`;
  });
  const text =
    blocks.join('\n\n') +
    `\n\n========== PROBE LOG END (total ${arr.length} entries) ==========\n`;
  try {
    const blob = new Blob([text], { type: 'text/plain;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `probe-log-${new Date().toISOString().replace(/[:.]/g, '-')}.log`;
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);
  } catch (err) {
    console.error('[PROBE] 导出下载失败', err);
  }
  return text;
}

__PROBE_GLOBAL__.__exportProbeLog__ = exportProbeLog;
// 清空缓冲（复现新场景前调用）
__PROBE_GLOBAL__.__clearProbeLog__ = () => {
  __PROBE_GLOBAL__.__PROBE_LOG__ = [];
};
