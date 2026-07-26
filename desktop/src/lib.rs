// 桌面程序主逻辑：装载 Tauri 运行时 + 对话框/文件系统插件。
//
// 文件打开（双击 .md 启动 EXE）：
//   Windows 把 .md 设为默认程序后，双击文件会以
//     Markdown_Editor.exe "C:\path\to\file.md"
//   的方式启动。这里在启动时读取该路径存入状态；前端就绪后通过
//   Tauri command（invoke get_initial_file）读取路径，再用
//   read_text_file / write_text_file 命令在 Rust 侧做文件读写。
//
// 采用多实例：每次双击 .md 都会启动一个独立 EXE 实例并打开对应文件，
// 不使用 single-instance 插件，避免“已运行时再双击被转发/被拦”的复杂性。
//
// 文件读写放在 Rust 侧（std::fs），彻底绕开 Tauri fs 插件对“未授权绝对路径”
// 的 scope 限制——否则 fs:allow-read-text-file 权限给了也会被 scope 拒绝。

use tauri::Manager;
use std::sync::Mutex;

// 记录「启动时通过命令行传入的 .md 文件」
struct AppState {
    initial_file: Mutex<Option<String>>,
}

fn is_markdown_arg(s: &str) -> bool {
    let lower = s.to_ascii_lowercase();
    [".md", ".markdown", ".mdown", ".mkd", ".mkdn"]
        .iter()
        .any(|e| lower.ends_with(e))
}

// 返回启动时命令行传入的 .md 路径（若有）。前端在初始化时调用。
#[tauri::command]
fn get_initial_file(state: tauri::State<AppState>) -> Option<String> {
    state.initial_file.lock().unwrap().clone()
}

// 按绝对路径读取文本文件（Rust 侧，无 scope 限制）
#[tauri::command]
fn read_text_file(path: String) -> Result<String, String> {
    std::fs::read_to_string(&path).map_err(|e| format!("读取失败 {}: {}", path, e))
}

// 按绝对路径写入文本文件（Rust 侧，无 scope 限制）
#[tauri::command]
fn write_text_file(path: String, content: String) -> Result<(), String> {
    std::fs::write(&path, content).map_err(|e| format!("写入失败 {}: {}", path, e))
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_fs::init())
        .manage(AppState {
            // argv[0] 是 exe 自身，跳过；取第一个 .md 参数
            initial_file: Mutex::new(std::env::args().skip(1).find(|a| is_markdown_arg(a))),
        })
        .invoke_handler(tauri::generate_handler![
            get_initial_file,
            read_text_file,
            write_text_file
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
