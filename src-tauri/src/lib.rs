use std::path::Path;
use std::sync::Mutex;
use tauri::{Emitter, Manager, State};

// 保存通过系统右键菜单首次启动时传入的所有文件路径
struct LaunchFilesState(Mutex<Vec<String>>);

fn extract_valid_files(args: impl Iterator<Item = String>) -> Vec<String> {
    args.skip(1)
        .filter(|arg| !arg.starts_with('-') && Path::new(arg).is_file())
        .collect()
}

#[tauri::command]
fn get_exe_dir() -> Result<String, String> {
    let exe_path = std::env::current_exe().map_err(|e| e.to_string())?;
    let exe_dir = exe_path
        .parent()
        .ok_or_else(|| "无法获取可执行文件所在目录".to_string())?;
    Ok(exe_dir.to_string_lossy().to_string())
}

// 取出首次启动时传入的全部文件列表
#[tauri::command]
fn take_launch_files(state: State<LaunchFilesState>) -> Vec<String> {
    std::mem::take(&mut *state.0.lock().unwrap())
}

#[tauri::command]
fn check_windows_context_menu() -> Result<bool, String> {
    #[cfg(target_os = "windows")]
    {
        use winreg::enums::*;
        use winreg::RegKey;
        let hkcu = RegKey::predef(HKEY_CURRENT_USER);
        let exists = hkcu
            .open_subkey("Software\\Classes\\*\\shell\\EditFast")
            .is_ok();
        return Ok(exists);
    }
    #[cfg(not(target_os = "windows"))]
    {
        Ok(false)
    }
}

#[tauri::command]
fn toggle_windows_context_menu(enable: bool, menu_title: String) -> Result<bool, String> {
    #[cfg(target_os = "windows")]
    {
        use winreg::enums::*;
        use winreg::RegKey;
        let hkcu = RegKey::predef(HKEY_CURRENT_USER);
        let shell_path = "Software\\Classes\\*\\shell\\EditFast";

        if enable {
            let exe_path = std::env::current_exe().map_err(|e| e.to_string())?;
            let exe_str = exe_path.to_string_lossy().to_string();

            let (key, _) = hkcu.create_subkey(shell_path).map_err(|e| e.to_string())?;
            key.set_value("", &menu_title).map_err(|e| e.to_string())?;
            key.set_value("Icon", &format!("\"{}\"", exe_str))
                .map_err(|e| e.to_string())?;
            // 声明支持多选文件传入
            key.set_value("MultiSelectModel", &"Player")
                .map_err(|e| e.to_string())?;

            let (cmd_key, _) = key.create_subkey("command").map_err(|e| e.to_string())?;
            cmd_key
                .set_value("", &format!("\"{}\" \"%1\"", exe_str))
                .map_err(|e| e.to_string())?;
            Ok(true)
        } else {
            let _ = hkcu.delete_subkey_all(shell_path);
            Ok(false)
        }
    }
    #[cfg(not(target_os = "windows"))]
    {
        let _ = (enable, menu_title);
        Ok(false)
    }
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    let initial_files = extract_valid_files(std::env::args());

    tauri::Builder::default()
        .plugin(tauri_plugin_single_instance::init(|app, args, _cwd| {
            if let Some(window) = app.get_webview_window("main") {
                let _ = window.unminimize();
                let _ = window.set_focus();
            }
            // 提取二次启动（或多选文件逐个触发）传入的所有有效文件路径
            let files = extract_valid_files(args.into_iter());
            if !files.is_empty() {
                let _ = app.emit("single-instance-open", files);
            }
        }))
        .manage(LaunchFilesState(Mutex::new(initial_files)))
        .plugin(tauri_plugin_fs::init())
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_clipboard_manager::init())
        .invoke_handler(tauri::generate_handler![
            get_exe_dir,
            take_launch_files,
            check_windows_context_menu,
            toggle_windows_context_menu
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
