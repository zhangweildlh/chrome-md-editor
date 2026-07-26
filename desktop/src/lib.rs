// 桌面程序主逻辑：装载 Tauri 运行时 + 对话框/文件系统/单实例插件。
// 文件打开：Windows 下把 .md 设为默认程序后，双击文件会以
//   Markdown_Editor.exe "C:\path\to\file.md"
// 的方式启动。这里在启动时读取该路径，等前端就绪后通过事件发给前端，
// 由前端的 FS Access 垫片（按路径读）加载进编辑器。单实例插件保证「已运行时
// 再双击另一个 .md」会转发到已存在的主窗口，而不是再开一个进程。

use tauri::Manager;
use std::sync::Mutex;

// 记录「启动时通过命令行传入的 .md 文件」，等待前端就绪后再打开
struct AppState {
    initial_file: Mutex<Option<String>>,
}

fn is_markdown_arg(s: &str) -> bool {
    let lower = s.to_ascii_lowercase();
    [".md", ".markdown", ".mdown", ".mkd", ".mkdn"]
        .iter()
        .any(|e| lower.ends_with(e))
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_fs::init())
        .plugin(tauri_plugin_single_instance::init(|app, args, _cwd| {
            // 第二个实例（如已运行后再双击另一 .md）把路径转发给主窗口
            if let Some(p) = args.iter().skip(1).find(|a| is_markdown_arg(a)).cloned() {
                if let Some(w) = app.get_webview_window("main") {
                    let _ = w.emit("open-file", p);
                }
            }
        }))
        .setup(|app| {
            // 收集启动参数里的 .md 路径（argv[0] 是 exe 自身，跳过）
            let initial = std::env::args().skip(1).find(|a| is_markdown_arg(a)).cloned();

            let handle = app.handle().clone();
            app.manage(AppState {
                initial_file: Mutex::new(initial),
            });

            // 前端就绪后，把启动路径通过事件发给前端打开
            app.listen("frontend-ready", move |_event| {
                let state = handle.state::<AppState>();
                let path = state.initial_file.lock().unwrap().take();
                if let Some(p) = path {
                    if let Some(w) = handle.get_webview_window("main") {
                        let _ = w.emit("open-file", p);
                    }
                }
            });
            Ok(())
        })
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
