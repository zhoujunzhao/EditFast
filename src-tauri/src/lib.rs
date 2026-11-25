use std::path::Path;
use std::sync::Mutex;
use tauri::menu::{Menu, MenuItem};
use tauri::tray::{MouseButton, TrayIconBuilder, TrayIconEvent};
use tauri::{LogicalSize, Manager, Size, State};

// 保存通过系统右键菜单首次启动时传入的所有文件路径
struct LaunchFilesState(Mutex<Vec<String>>);

fn extract_valid_files(args: impl Iterator<Item = String>) -> Vec<String> {
    args.skip(1)
        .filter(|arg| !arg.starts_with('-') && Path::new(arg).is_file())
        .collect()
}

fn restore_window_size(app: &tauri::App) {
    let Ok(exe_dir) = get_exe_dir() else { return };
    let config_file = Path::new(&exe_dir).join("config").join("config.json");

    let Ok(content) = std::fs::read_to_string(config_file) else { return };
    let Ok(json) = serde_json::from_str::<serde_json::Value>(&content) else { return };

    let Some(win_state) = json.get("windowState") else { return };
    let Some(window) = app.get_webview_window("main") else { return };

    if let (Some(w), Some(h)) = (
        win_state.get("width").and_then(|v| v.as_f64()),
        win_state.get("height").and_then(|v| v.as_f64()),
    ) {
        if w >= 400.0 && h >= 300.0 {
            let _ = window.set_size(Size::Logical(LogicalSize::new(w, h)));
            let _ = window.center();
        }
    }

    if win_state
        .get("maximized")
        .and_then(|v| v.as_bool())
        .unwrap_or(false)
    {
        let _ = window.maximize();
    }
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

    #[allow(unused_mut)] let mut builder = tauri::Builder::default();

    // 仅在非调试模式（Release 发布版）下启用单实例限制；调试模式允许多实例共存
    #[cfg(all(
        not(debug_assertions),
        not(any(target_os = "android", target_os = "ios"))
    ))]
    {
        use tauri::Emitter;
        builder = builder.plugin(tauri_plugin_single_instance::init(|app, args, _cwd| {
            // 提取二次启动（或多选文件逐个触发）传入的所有有效文件路径
            let files = extract_valid_files(args.into_iter());
            if !files.is_empty() {
                let _ = app.emit("single-instance-open", files);
            }
            if let Some(window) = app.get_webview_window("main") {
                let _ = window.unminimize();
                let _ = window.show();
                let _ = window.set_focus();
            }
        }));
    }

    builder
        .manage(LaunchFilesState(Mutex::new(initial_files)))
        .setup(move |app| {

            restore_window_size(app);

            // region 托盘
            let quit_i = MenuItem::with_id(app, "tray-quit", "退出", true, None::<&str>).unwrap();
            let menu = Menu::with_id_and_items(app, "tray-menu", &[&quit_i]).unwrap();
            let _tray = TrayIconBuilder::new()
                // 请确保你的 src-tauri/icons 目录下有对应的托盘图标（如 tray.png 或 icon.ico）
                .icon(app.default_window_icon().unwrap().clone())
                .show_menu_on_left_click(false)
                .menu(&menu)
                .tooltip("EditFast \n 无它,唯记事本耳。")
                .on_menu_event(|app_handle, event| {
                    match event.id.as_ref() {
                        "tray-quit" => {
                            if let Some(_) = app_handle.tray_by_id("tray-menu") {
                                let _ = app_handle.remove_tray_by_id("tray-menu");
                            }
                            app_handle.exit(0);
                        }
                        _ => {}
                    }
                })
                .on_tray_icon_event(|tray, event| {
                    match event {
                        TrayIconEvent::DoubleClick { button, .. } => {
                            if button == MouseButton::Left {
                                let app = tray.app_handle();
                                if let Some(window) = app.get_webview_window("main") {
                                    let _ = window.show();
                                    let _ = window.unminimize();
                                    let _ = window.set_focus();
                                }
                            }
                        }
                        _ => {}
                    }
                })
                .build(app)?;
            // endregion 托盘

            Ok(())
        })
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
