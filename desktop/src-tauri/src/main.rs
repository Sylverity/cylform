//! CYLview-NG Desktop Application
//! 
//! Tauri-based desktop wrapper for the core visualization engine.

#![cfg_attr(
    all(not(debug_assertions), target_os = "windows"),
    windows_subsystem = "windows"
)]

use cylview_core::{
    io::{read_structure, FileFormat},
    molecule::Structure,
    render::Renderer,
    camera::Camera,
};
use parking_lot::Mutex;
use serde::Serialize;
use std::sync::Arc;
use tauri::{Manager, State, WebviewWindow};

/// Application state shared between Tauri commands
pub struct AppState {
    /// The renderer (initialized on first window creation)
    renderer: Mutex<Option<Renderer>>,
    /// Current molecule being displayed
    structure: Mutex<Option<Structure>>,
    /// Camera for view control
    camera: Mutex<Camera>,
    /// Window reference for rendering
    window: Mutex<Option<WebviewWindow>>,
}

impl AppState {
    fn new() -> Self {
        Self {
            renderer: Mutex::new(None),
            structure: Mutex::new(None),
            camera: Mutex::new(Camera::new()),
            window: Mutex::new(None),
        }
    }
}

/// Molecule info returned to frontend
#[derive(Serialize)]
struct MoleculeInfo {
    name: String,
    atom_count: usize,
    bond_count: usize,
}

/// Initialize the wgpu renderer
#[tauri::command]
async fn init_renderer(
    window: WebviewWindow,
    state: State<'_, Arc<AppState>>,
) -> Result<(), String> {
    log::info!("Initializing renderer...");
    
    // Store window reference
    *state.window.lock() = Some(window.clone());
    
    // Create renderer - window needs to be static or we need to use a different approach
    // For now, let's create the renderer in a blocking task
    let window_for_renderer = window.clone();
    let renderer = tokio::task::spawn_blocking(move || {
        // We need to use a static reference or leak the window
        // This is a workaround for the lifetime issue
        let window_ref: &'static WebviewWindow = unsafe { std::mem::transmute(&window_for_renderer) };
        pollster::block_on(Renderer::new(window_ref))
    })
    .await
    .map_err(|e| format!("Task panicked: {}", e))?
    .map_err(|e| format!("Failed to create renderer: {}", e))?;
    
    *state.renderer.lock() = Some(renderer);
    
    // Start render loop
    let state_clone = Arc::clone(&state);
    std::thread::spawn(move || {
        render_loop(state_clone);
    });
    
    log::info!("Renderer initialized successfully");
    Ok(())
}

/// Load a molecule file
#[tauri::command]
fn load_molecule(
    path: String,
    state: State<'_, Arc<AppState>>,
) -> Result<MoleculeInfo, String> {
    log::info!("Loading molecule from: {}", path);
    
    // Read the structure
    let structure = read_structure(&path, FileFormat::Auto)
        .map_err(|e| format!("Failed to load file: {}", e))?;
    
    let info = MoleculeInfo {
        name: structure.name.clone(),
        atom_count: structure.atom_count(),
        bond_count: structure.bond_count(),
    };
    
    // Update camera to fit molecule
    let (min, max) = structure.bounding_box();
    state.camera.lock().fit_to_bounds(min, max);
    
    // Store structure
    *state.structure.lock() = Some(structure);
    
    log::info!("Loaded {} atoms, {} bonds", info.atom_count, info.bond_count);
    Ok(info)
}

/// Camera control commands
#[tauri::command]
fn camera_rotate(
    delta_x: f32,
    delta_y: f32,
    state: State<'_, Arc<AppState>>,
) -> Result<(), String> {
    state.camera.lock().rotate(delta_x, delta_y);
    Ok(())
}

#[tauri::command]
fn camera_pan(
    delta_x: f32,
    delta_y: f32,
    state: State<'_, Arc<AppState>>,
) -> Result<(), String> {
    state.camera.lock().pan(delta_x, delta_y);
    Ok(())
}

#[tauri::command]
fn camera_zoom(
    delta: f32,
    state: State<'_, Arc<AppState>>,
) -> Result<(), String> {
    state.camera.lock().zoom(delta);
    Ok(())
}

#[tauri::command]
fn camera_reset(state: State<'_, Arc<AppState>>) -> Result<(), String> {
    let mut camera = state.camera.lock();
    if let Some(ref structure) = *state.structure.lock() {
        let (min, max) = structure.bounding_box();
        camera.fit_to_bounds(min, max);
    } else {
        *camera = Camera::new();
    }
    Ok(())
}

/// Resize the render surface
#[tauri::command]
fn resize_surface(
    width: u32,
    height: u32,
    state: State<'_, Arc<AppState>>,
) -> Result<(), String> {
    if let Some(ref mut renderer) = *state.renderer.lock() {
        renderer.resize(width, height);
    }
    Ok(())
}

/// Main render loop - runs in a separate thread
fn render_loop(state: Arc<AppState>) {
    log::info!("Render loop started");
    
    loop {
        // Try to render a frame
        let mut renderer_guard = state.renderer.lock();
        let structure_guard = state.structure.lock();
        let camera_guard = state.camera.lock();
        
        if let Some(ref mut renderer) = *renderer_guard {
            if let Some(ref structure) = *structure_guard {
                if let Err(e) = renderer.render(structure, &camera_guard) {
                    log::error!("Render error: {}", e);
                }
            }
        }
        
        // Drop guards before sleeping
        drop(camera_guard);
        drop(structure_guard);
        drop(renderer_guard);
        
        // Target ~60 FPS
        std::thread::sleep(std::time::Duration::from_millis(16));
    }
}

fn main() {
    env_logger::init();
    
    log::info!("CYLview-NG Desktop starting...");
    log::info!("Core version: {}", cylview_core::VERSION);
    
    // Create shared state
    let app_state = Arc::new(AppState::new());
    
    tauri::Builder::default()
        .plugin(tauri_plugin_shell::init())
        .plugin(tauri_plugin_dialog::init())
        .manage(app_state)
        .invoke_handler(tauri::generate_handler![
            init_renderer,
            load_molecule,
            camera_rotate,
            camera_pan,
            camera_zoom,
            camera_reset,
            resize_surface,
        ])
        .setup(|app| {
            log::info!("Tauri application setup complete");
            
            // Get the main window
            let window = app.get_webview_window("main").unwrap();
            
            // Set initial size
            let _ = window.set_size(tauri::Size::Physical(tauri::PhysicalSize {
                width: 1280,
                height: 800,
            }));
            
            Ok(())
        })
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
