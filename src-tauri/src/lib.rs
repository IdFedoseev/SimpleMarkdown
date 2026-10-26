use std::fs;
use std::sync::Mutex;

use tauri::{Emitter, Manager, RunEvent, State};

pub struct PendingFile(pub Mutex<Option<String>>);

#[tauri::command]
fn read_file(path: String) -> Result<String, String> {
    fs::read_to_string(&path).map_err(|e| e.to_string())
}

#[tauri::command]
fn write_file(path: String, contents: String) -> Result<(), String> {
    fs::write(&path, contents).map_err(|e| e.to_string())
}

#[tauri::command]
fn list_dir(path: String) -> Result<serde_json::Value, String> {
    let entries = fs::read_dir(&path)
        .map_err(|e| e.to_string())?
        .filter_map(|entry| entry.ok())
        .filter(|entry| {
            entry.file_type().map(|t| t.is_file()).unwrap_or(false)
                && entry
                    .file_name()
                    .to_str()
                    .map(|n| !n.starts_with('.'))
                    .unwrap_or(false)
        })
        .map(|entry| {
            serde_json::json!({
                "name": entry.file_name().to_string_lossy(),
                "path": entry.path().display().to_string(),
            })
        })
        .collect::<Vec<_>>();
    Ok(serde_json::Value::Array(entries))
}

#[tauri::command]
fn take_pending_file(state: State<PendingFile>) -> Option<String> {
    state.0.lock().unwrap().take()
}

pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_dialog::init())
        .manage(PendingFile(Mutex::new(None)))
        .invoke_handler(tauri::generate_handler![
        read_file,
        write_file,
        list_dir,
        take_pending_file
    ])
        .build(tauri::generate_context!())
        .expect("error while building tauri application")
        .run(|app, event| match event {
            RunEvent::Opened { urls } => {
                if let Some(path) = urls.iter().find_map(|url| url.to_file_path().ok()) {
                    let path = path.display().to_string();
                    let _ = app.emit("open-file", serde_json::json!({ "path": &path }));
                    let state = app.state::<PendingFile>();
                    let mut pending = state.0.lock().unwrap();
                    if pending.is_none() {
                        *pending = Some(path);
                    }
                }
            }
            _ => {}
        });
}
