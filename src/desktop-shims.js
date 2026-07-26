// desktop-shims.js
// ---------------------------------------------------------------------------
// 兼容垫片：让同一套 Web 源码（src/editor.* 等）既能在 Chrome 扩展运行，
// 也能在 Tauri 桌面壳里运行。
//
// 判定逻辑（双保险）：
//   - 在 Chrome 扩展中：window.chrome 与 window.showOpenFilePicker 均原生存在
//     → 两段垫片全部跳过，对扩展零影响。
//   - 在 Tauri 桌面壳中：window.__TAURI_INTERNALS__ 存在、且 showOpenFilePicker
//     不存在 → 安装 chrome 垫片 + File System Access API 垫片。
// ---------------------------------------------------------------------------
(function () {
  if (typeof window === "undefined") return;

  const isTauri = "__TAURI_INTERNALS__" in window;

  // ===== PROBE START =====
  const PROBE = (tag, detail) => {
    try {
      if (typeof window !== "undefined" && window.__PROBE__) window.__PROBE__(tag, detail);
    } catch (e) {}
  };
  PROBE(
    "shim:start",
    "isTauri=" + isTauri +
    " chrome=" + (typeof chrome) +
    " showOpenFilePicker=" + (typeof window.showOpenFilePicker) +
    " TAURI_INTERNALS=" + ("__TAURI_INTERNALS__" in window)
  );
  // ===== PROBE END =====

  // =========================================================================
  // 1. chrome 垫片
  //    作用：让 session-restore（恢复上次文件）、translate（翻译设置持久化）
  //          在桌面端也能正常工作。扩展里 chrome 已存在 → 跳过。
  // =========================================================================
  if (typeof chrome === "undefined") {
    const PREFIX = "chrome-shim:";
    const makeArea = () => ({
      async get(key) {
        if (typeof key === "string") {
          const v = localStorage.getItem(PREFIX + key);
          return v == null ? {} : { [key]: JSON.parse(v) };
        }
        if (Array.isArray(key)) {
          const out = {};
          for (const k of key) {
            const v = localStorage.getItem(PREFIX + k);
            if (v != null) out[k] = JSON.parse(v);
          }
          return out;
        }
        if (key && typeof key === "object") {
          const out = {};
          for (const k of Object.keys(key)) {
            const v = localStorage.getItem(PREFIX + k);
            out[k] = v == null ? key[k] : JSON.parse(v);
          }
          return out;
        }
        return {};
      },
      async set(items) {
        for (const k of Object.keys(items)) {
          localStorage.setItem(PREFIX + k, JSON.stringify(items[k]));
        }
      },
      async remove(key) {
        const keys = Array.isArray(key) ? key : [key];
        for (const k of keys) localStorage.removeItem(PREFIX + k);
      },
      async clear() {
        const toRemove = [];
        for (let i = 0; i < localStorage.length; i++) {
          const k = localStorage.key(i);
          if (k && k.startsWith(PREFIX)) toRemove.push(k);
        }
        toRemove.forEach((k) => localStorage.removeItem(k));
      },
    });
    window.chrome = {
      storage: { local: makeArea(), sync: makeArea() },
      runtime: {
        id: "",
        getURL: (p) => p,
        sendMessage: async () => undefined,
        onMessage: { addListener() {} },
      },
      tabs: {
        create: async (opts) =>
          window.open(opts && opts.url, "_blank", "noopener,noreferrer"),
      },
    };
  }

  // =========================================================================
  // 2. File System Access API 垫片（Tauri 后端）
  //    编辑器使用：showOpenFilePicker / showSaveFilePicker / showDirectoryPicker
  //    以及 FileSystemFileHandle(.getFile/.createWritable) 与
  //    FileSystemDirectoryHandle(.getFileHandle/.getDirectoryHandle/.values)。
  // =========================================================================
  if (isTauri && typeof window.showOpenFilePicker === "undefined") {
    const norm = (p) => (p || "").replace(/\\/g, "/").replace(/\/+/g, "/");
    const joinPath = (base, name) => {
      const b = norm(base).replace(/\/$/, "");
      return `${b}/${name}`;
    };
    const toFilters = (types) => {
      if (!types || !types[0] || !types[0].accept) return undefined;
      const exts = [];
      for (const mime of Object.keys(types[0].accept)) {
        for (const e of types[0].accept[mime] || []) {
          exts.push(e.startsWith(".") ? e : "." + e);
        }
      }
      return exts.length ? [{ name: types[0].description || "All Files", extensions: exts }] : undefined;
    };

    // 延迟加载 Tauri 插件 / API（仅桌面端执行，扩展端永不触发）
    // - dialog：选取文件/目录（返回路径字符串），不受 fs scope 限制
    // - fs：仅用于目录操作（TDirHandle 的 readDir/mkdir/exists）
    // - invoke：调用 Rust 命令做「按绝对路径的文本读写」，绕开 fs scope 限制
    const setup = (async () => {
      const dialog = await import("@tauri-apps/plugin-dialog");
      const fs = await import("@tauri-apps/plugin-fs");
      const { invoke } = await import("@tauri-apps/api/core");
      return { dialog, fs, invoke };
    })();

    class TFileHandle {
      constructor(path) {
        this.path = norm(path);
        this.name = this.path.split("/").pop() || "untitled";
      }
      async getFile() {
        // 文本读取改走 Rust 命令，避免 fs 插件 scope 拒绝绝对路径
        const { invoke } = await setup;
        // ===== PROBE START =====
        PROBE("shim:getFile", "path=" + this.path);
        // ===== PROBE END =====
        const text = await invoke("read_text_file", { path: this.path });
        const enc = new TextEncoder();
        return {
          name: this.name,
          size: text.length,
          type: "",
          text: async () => text,
          arrayBuffer: async () => enc.encode(text).buffer,
        };
      }
      async createWritable() {
        const self = this;
        return {
          write: async (content) => {
            const { invoke } = await setup;
            let str;
            if (typeof content === "string") {
              str = content;
            } else {
              // 统一以文本写入（编辑器内容为文本）
              let u8;
              if (content instanceof Uint8Array) u8 = content;
              else if (content instanceof ArrayBuffer) u8 = new Uint8Array(content);
              else if (content && typeof content.arrayBuffer === "function")
                u8 = new Uint8Array(await content.arrayBuffer());
              else u8 = new Uint8Array(content);
              str = new TextDecoder().decode(u8);
            }
            await invoke("write_text_file", { path: self.path, content: str });
            // ===== PROBE START =====
            PROBE("shim:write", "path=" + self.path + " len=" + (str ? str.length : -1));
            // ===== PROBE END =====
          },
          close: async () => {},
        };
      }
    }

    class TDirHandle {
      constructor(path) {
        this.path = norm(path);
        this.name = this.path.split("/").pop() || "/";
      }
      async getFileHandle(name) {
        return new TFileHandle(joinPath(this.path, name));
      }
      async getDirectoryHandle(name, opts = {}) {
        const p = joinPath(this.path, name);
        const { fs } = await setup;
        if (opts.create && !(await fs.exists(p))) {
          await fs.mkdir(p, { recursive: true });
        }
        return new TDirHandle(p);
      }
      async * values() {
        const { fs } = await setup;
        const entries = await fs.readDir(this.path);
        for (const e of entries) {
          const child = e.isDirectory
            ? new TDirHandle(joinPath(this.path, e.name))
            : new TFileHandle(joinPath(this.path, e.name));
          Object.assign(child, { name: e.name, kind: e.isDirectory ? "directory" : "file" });
          yield child;
        }
      }
      async * entries() {
        for await (const v of this.values()) yield [v.name, v];
      }
    }

    window.showOpenFilePicker = async (opts = {}) => {
      const { dialog } = await setup;
      const selected = await dialog.open({ multiple: !!opts.multiple, filters: toFilters(opts.types) });
      if (!selected) throw new DOMException("用户取消", "AbortError");
      const paths = Array.isArray(selected) ? selected : [selected];
      return paths.map((p) => new TFileHandle(p));
    };

    window.showSaveFilePicker = async (opts = {}) => {
      const { dialog } = await setup;
      const path = await dialog.save({
        defaultPath: opts.suggestedName,
        filters: toFilters(opts.types),
      });
      if (!path) throw new DOMException("用户取消", "AbortError");
      return new TFileHandle(path);
    };

    window.showDirectoryPicker = async () => {
      const { dialog } = await setup;
      const dir = await dialog.open({ directory: true, multiple: false });
      if (!dir) throw new DOMException("用户取消", "AbortError");
      return new TDirHandle(dir);
    };

    // 供编辑器按「命令行传入的绝对路径」构造文件句柄（双击 .md 启动 EXE 时使用）。
    // 返回的对象与 showOpenFilePicker 得到的句柄接口一致（getFile/createWritable）。
    window.__tauriFileHandle = (path) => {
      // ===== PROBE START =====
      PROBE("shim:factory", "path=" + path);
      // ===== PROBE END =====
      return new TFileHandle(path);
    };
  }

  // ===== PROBE START =====
  PROBE(
    "shim:done",
    "__tauriFileHandle=" + (typeof window.__tauriFileHandle) +
    " enteredFsShim=" + (isTauri && typeof window.showOpenFilePicker === "undefined")
  );
  // ===== PROBE END =====
})();
