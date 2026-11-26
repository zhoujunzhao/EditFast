use std::path::Path;
use std::sync::Mutex;
use tauri::menu::{Menu, MenuItem};
use tauri::tray::{MouseButton, TrayIconBuilder, TrayIconEvent};
use tauri::{LogicalSize, Manager, Size, State};

struct LaunchFilesState(Mutex<Vec<String>>);

fn extract_valid_files(args: impl Iterator<Item = String>) -> Vec<String> {
    let current_exe = std::env::current_exe().ok();
    args.filter(|arg| {
        if arg.starts_with('-') {
            return false;
        }
        let path = Path::new(arg);
        if !path.is_file() {
            return false;
        }
        if let Some(ref exe) = current_exe {
            if let (Ok(p1), Ok(p2)) = (std::fs::canonicalize(path), std::fs::canonicalize(exe)) {
                if p1 == p2 {
                    return false;
                }
            }
        }
        true
    })
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

#[tauri::command]
fn get_app_authors() -> String {
    env!("CARGO_PKG_AUTHORS").replace(':', ", ")
}


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

#[tauri::command]
fn write_file_with_encoding(path: String, content: String, encoding: String) -> Result<(), String> {
    let clean_content = content.strip_prefix('\u{FEFF}').unwrap_or(&content);
    let bytes: Vec<u8> = match encoding.to_uppercase().as_str() {
        "UTF-16LE" => {
            let mut out = Vec::with_capacity(2 + clean_content.len() * 2);
            out.extend_from_slice(&[0xFF, 0xFE]);
            for u in clean_content.encode_utf16() {
                out.extend_from_slice(&u.to_le_bytes());
            }
            out
        }
        "GBK" => {
            let (encoded, _, _) = encoding_rs::GBK.encode(clean_content);
            encoded.into_owned()
        }
        "ASCII" => clean_content
            .chars()
            .map(|c| if c.is_ascii() { c as u8 } else { b'?' })
            .collect(),
        _ => clean_content.as_bytes().to_vec(),
    };

    std::fs::write(&path, bytes).map_err(|e| e.to_string())
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    let initial_files = extract_valid_files(std::env::args().skip(1));

    #[allow(unused_mut)]
    let mut builder = tauri::Builder::default();

    #[cfg(all(
        not(debug_assertions),
        not(any(target_os = "android", target_os = "ios"))
    ))]
    {
        use tauri::Emitter;
        builder = builder.plugin(tauri_plugin_single_instance::init(|app, args, _cwd| {
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

            let quit_i = MenuItem::with_id(app, "tray-quit", "退出", true, None::<&str>).unwrap();
            let menu = Menu::with_id_and_items(app, "tray-menu", &[&quit_i]).unwrap();
            let _tray = TrayIconBuilder::new()
                .icon(app.default_window_icon().unwrap().clone())
                .show_menu_on_left_click(false)
                .menu(&menu)
                .tooltip("EditFast \n 无它,唯记事本耳。")
                .on_menu_event(|app_handle, event| {
                    if event.id.as_ref() == "tray-quit" {
                        if app_handle.tray_by_id("tray-menu").is_some() {
                            let _ = app_handle.remove_tray_by_id("tray-menu");
                        }
                        app_handle.exit(0);
                    }
                })
                .on_tray_icon_event(|tray, event| {
                    if let TrayIconEvent::DoubleClick { button, .. } = event {
                        if button == MouseButton::Left {
                            let app = tray.app_handle();
                            if let Some(window) = app.get_webview_window("main") {
                                let _ = window.show();
                                let _ = window.unminimize();
                                let _ = window.set_focus();
                            }
                        }
                    }
                })
                .build(app)?;

            Ok(())
        })
        .plugin(tauri_plugin_fs::init())
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_clipboard_manager::init())
        .invoke_handler(tauri::generate_handler![
            get_exe_dir,
            get_app_authors,
            take_launch_files,
            check_windows_context_menu,
            toggle_windows_context_menu,
            write_file_with_encoding
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
