//! CYLview-NG Desktop Application
//! 
//! Tauri-based desktop wrapper for the core visualization engine.
//! React 19 + Vite frontend (to be implemented in Phase 1, Step 4)

#![cfg_attr(
    all(not(debug_assertions), target_os = "windows"),
    windows_subsystem = "windows"
)]

use tauri::Manager;

fn main() {
    env_logger::init();
    
    log::info!("CYLview-NG Desktop starting...");
    log::info!("Core version: {}", cylview_core::VERSION);
    
    tauri::Builder::default()
        .invoke_handler(tauri::generate_handler![greet])
        .setup(|app| {
            log::info!("Tauri application setup complete");
            Ok(())
        })
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}

/// Example Tauri command - will be replaced with actual molecule loading
#[tauri::command]
fn greet(name: &str) -> String {
    format!("Hello, {}! CYLview-NG is coming soon.", name)
}
