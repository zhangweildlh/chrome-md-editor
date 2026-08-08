// io-bridge.js — 文件读写环境分流（浏览器 / 桌面 Tauri）
//
// 设计要点：
//   1) 浏览器侧读写目标是 FileSystemFileHandle（不是路径字符串），
//      Tauri 侧是绝对路径字符串。两者差异通过「目标描述符」抽象：
//        - 浏览器：{ handle }   （File System Access API 的 FileSystemFileHandle）
//        - Tauri ：{ path }     （绝对路径字符串）
//      read/write 统一接收该描述符，调用方无需关心当前运行形态。
//   2) 沿用项目既有约定判定 Tauri：只用全局守卫，严禁 import '@tauri-apps/*'。
//   3) 分流逻辑做成可注入工厂 createIoBridge({ isTauri, invoke })，
//      便于单测在 node 环境下注入 mock，而非依赖真实 window / Tauri 运行时。

// 是否在 Tauri 桌面壳内：沿用项目既有约定（src/compare-shims.js / src/editor.js）。
export const isTauri =
  typeof window !== 'undefined' && '__TAURI_INTERNALS__' in window;

// 从全局对象取出 Tauri 的 invoke（桌面端由 __TAURI_INTERNALS__ 暴露）。
// 浏览器侧没有该全局，返回 undefined；调用方在 Tauri 分流分支会保证它可用。
function getInvoke() {
  if (typeof window === 'undefined') return undefined;
  const internals = window.__TAURI_INTERNALS__;
  if (internals && typeof internals.invoke === 'function') return internals.invoke;
  // 兼容 withGlobalTauri 开启时的 window.__TAURI__
  const g = window.__TAURI__;
  if (g && typeof g.invoke === 'function') return g.invoke;
  return undefined;
}

// 默认（真实环境）的 Tauri 判定，供工厂兜底使用。
function globalIsTauri() {
  return typeof window !== 'undefined' && '__TAURI_INTERNALS__' in window;
}

// 工厂函数：注入环境依赖，返回 { read, write }。
// 参数：
//   isTauri (boolean) - 是否桌面端；省略则按真实 window 守卫推断。
//   invoke  (function) - Tauri 的 invoke；省略则按真实全局对象推断。
export function createIoBridge({ isTauri: injectedTauri, invoke: injectedInvoke } = {}) {
  const envIsTauri = injectedTauri != null ? injectedTauri : globalIsTauri();
  const envInvoke = injectedInvoke != null ? injectedInvoke : getInvoke();

  // 校验目标描述符：必须为非空对象。
  function assertTarget(target) {
    if (!target || typeof target !== 'object') {
      throw new Error('ioBridge: 目标描述符无效（应为 { handle } 或 { path } 对象）');
    }
  }

  // 读取目标文本。
  //   Tauri：invoke('read_text_file', { path })
  //   浏览器：handle.getFile().text()
  function read(target) {
    assertTarget(target);
    if (envIsTauri) {
      if (!('path' in target)) {
        throw new Error('ioBridge.read: Tauri 模式目标描述符必须含 path');
      }
      if (typeof envInvoke !== 'function') {
        throw new Error('ioBridge.read: 桌面端缺少可用的 invoke');
      }
      // 桌面侧真实命令（desktop/src/lib.rs: read_text_file(path: String)）
      return envInvoke('read_text_file', { path: target.path });
    }
    // 浏览器侧：目标形如 { handle }
    if (!('handle' in target) || !target.handle) {
      throw new Error('ioBridge.read: 浏览器模式目标描述符必须含 handle');
    }
    return target.handle.getFile().then((file) => file.text());
  }

  // 写入目标内容。
  //   Tauri：invoke('write_text_file', { path, content })
  //   浏览器：handle.createWritable() -> write(content) -> close()
  function write(target, content) {
    assertTarget(target);
    if (typeof content !== 'string') {
      throw new Error('ioBridge.write: content 必须为字符串');
    }
    if (envIsTauri) {
      if (!('path' in target)) {
        throw new Error('ioBridge.write: Tauri 模式目标描述符必须含 path');
      }
      if (typeof envInvoke !== 'function') {
        throw new Error('ioBridge.write: 桌面端缺少可用的 invoke');
      }
      // 桌面侧真实命令（desktop/src/lib.rs: write_text_file(path: String, content: String)）
      return envInvoke('write_text_file', { path: target.path, content });
    }
    // 浏览器侧：目标形如 { handle }
    if (!('handle' in target) || !target.handle) {
      throw new Error('ioBridge.write: 浏览器模式目标描述符必须含 handle');
    }
    return target.handle.createWritable().then((w) =>
      w.write(content).then(() => w.close())
    );
  }

  return { read, write };
}

// 默认导出：用真实环境实例化（node 下 isTauri 为 false、invoke 为 undefined，
// 不会在导入时触发任何真实 IO，单测可另行注入）。
export const ioBridge = createIoBridge();
