// 桌面程序主逻辑：装载 Tauri 运行时 + 对话框/文件系统插件。
// 所有文件操作均由前端（src/desktop-shims.js）通过 FS Access API 垫片发起，
// 由 Tauri 的 dialog / fs 插件在 Rust 侧执行。无需自定义命令。

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_fs::init())
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
