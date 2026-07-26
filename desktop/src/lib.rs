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

// 归一化一个命令行参数：去外层引号、兼容 file:// 形式（Windows 某些
// 文件关联会以 file:///C:/.../x.md 形式传入）。
fn normalize_arg(s: &str) -> String {
    let mut s = s.trim().to_string();
    if s.starts_with('"') && s.ends_with('"') && s.len() >= 2 {
        s = s[1..s.len() - 1].to_string();
    }
    if let Some(rest) = s.strip_prefix("file:///") {
        s = rest.replace('/', "\\");
    } else if let Some(rest) = s.strip_prefix("file://") {
        s = rest.replace('/', "\\");
    }
    s
}

// 返回启动时命令行传入的 .md 路径（若有）。前端在初始化时调用。
#[tauri::command]
fn get_initial_file(state: tauri::State<AppState>) -> Option<String> {
    state.initial_file.lock().unwrap().clone()
}

// 返回原始命令行参数（诊断用）：用于排查「双击 .md 启动 EXE 时
// Windows 到底传了什么」，便于定位文件关联未传参等问题。
#[tauri::command]
fn debug_args() -> Vec<String> {
    std::env::args().map(|a| normalize_arg(&a)).collect()
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

// ===== PROBE START =====
// EXE 运行期诊断探针：把所有 PROBE 日志追加写入「EXE 同目录/md_editor_probe.log」
// （无写入权限时回退到系统临时目录）。彻底修复 BUG 后连同该命令一并删除。
#[tauri::command]
async fn probe_log(msg: String) -> String {
    use std::io::Write;
    let dir = std::env::current_exe()
        .ok()
        .and_then(|p| p.parent().map(|d| d.to_path_buf()))
        .unwrap_or_else(|| std::env::temp_dir());
    let path = dir.join("md_editor_probe.log");
    let ts = std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .map(|d| d.as_secs())
        .unwrap_or(0);
    let line = format!("[{}] {}\n", ts, msg);
    if let Ok(mut f) = std::fs::OpenOptions::new().create(true).append(true).open(&path) {
        let _ = f.write_all(line.as_bytes());
    }
    path.to_string_lossy().to_string()
}
// ===== PROBE END =====

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_fs::init())
        .manage(AppState {
            // argv[0] 是 exe 自身，跳过；取第一个 .md 参数（先归一化，兼容引号/file:// 形式）
            initial_file: Mutex::new(
                std::env::args()
                    .skip(1)
                    .map(|a| normalize_arg(&a))
                    .find(|a| is_markdown_arg(a)),
            ),
        })
        .invoke_handler(tauri::generate_handler![
            get_initial_file,
            debug_args,
            read_text_file,
            write_text_file,
            // ===== PROBE START =====
            probe_log
            // ===== PROBE END =====
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
