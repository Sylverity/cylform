//! CYLview-NG Desktop Application
//!
//! Tauri shell — file I/O in Rust, 3-D rendering via Three.js in the WebView.

#![cfg_attr(
    all(not(debug_assertions), target_os = "windows"),
    windows_subsystem = "windows"
)]

use cylview_core::{
    io::{read_structure, FileFormat, IoError},
    molecule::Structure,
    CoreError,
};
use parking_lot::Mutex;
use serde::Serialize;
use std::path::Path;
use std::sync::Arc;
use tauri::{Manager, State};

// ---------------------------------------------------------------------------
// Application state
// ---------------------------------------------------------------------------

pub struct AppState {
    structure: Mutex<Option<Structure>>,
}

impl AppState {
    fn new() -> Self {
        Self {
            structure: Mutex::new(None),
        }
    }
}

// ---------------------------------------------------------------------------
// Serialisable types sent to the frontend
// ---------------------------------------------------------------------------

#[derive(Serialize)]
struct SerialAtom {
    x: f32,
    y: f32,
    z: f32,
    element: String,
    /// van der Waals radius (Å) — frontend scales this for display
    radius: f32,
}

#[derive(Serialize)]
struct SerialBond {
    atom1: u32,
    atom2: u32,
    /// cylinder radius (Å) derived from bond order
    radius: f32,
}

#[derive(Serialize)]
struct MoleculeData {
    name: String,
    atoms: Vec<SerialAtom>,
    bonds: Vec<SerialBond>,
}

// ---------------------------------------------------------------------------
// Tauri commands
// ---------------------------------------------------------------------------

/// Load a molecular file and return the full atom/bond geometry to the frontend.
/// Coordinates are re-centred to the geometric centre of the molecule.
#[tauri::command]
fn load_molecule(path: String, state: State<'_, Arc<AppState>>) -> Result<MoleculeData, String> {
    log::info!("Loading molecule from: {}", path);

    let structure = read_structure(&path, FileFormat::Auto).map_err(format_load_error)?;

    let center = structure.center();

    let atoms = structure
        .atoms
        .iter()
        .map(|a| SerialAtom {
            x: a.position.x - center.x,
            y: a.position.y - center.y,
            z: a.position.z - center.z,
            element: a.element.clone(),
            radius: a.radius,
        })
        .collect();

    let bonds = structure
        .bonds
        .iter()
        .map(|b| SerialBond {
            atom1: b.atom1,
            atom2: b.atom2,
            radius: b.order.radius_multiplier(),
        })
        .collect();

    log::info!(
        "Loaded '{}': {} atoms, {} bonds",
        structure.name,
        structure.atom_count(),
        structure.bond_count()
    );

    let data = MoleculeData {
        name: structure.name.clone(),
        atoms,
        bonds,
    };

    *state.structure.lock() = Some(structure);

    Ok(data)
}

fn format_load_error(error: CoreError) -> String {
    match error {
        CoreError::Io(IoError::NotFound(message)) => {
            format!("File not found or not readable: {message}")
        }
        CoreError::Io(IoError::UnsupportedFormat(message)) => message,
        CoreError::Io(IoError::Parse(message)) => message,
        CoreError::Io(IoError::FileTooLarge { size_mb, limit_mb }) => format!(
            "File is too large ({size_mb:.1} MB). CYLview-NG currently supports files up to {limit_mb:.1} MB."
        ),
        CoreError::Io(IoError::TooManyAtoms { count, limit }) => format!(
            "Molecule is too large ({count} atoms). CYLview-NG currently supports up to {limit} atoms per structure."
        ),
        CoreError::Io(IoError::Io(message)) => {
            format!("Could not read file: {message}")
        }
        other => other.to_string(),
    }
}

/// Return an optional molecular file path passed on app launch.
#[tauri::command]
fn get_startup_file() -> Option<String> {
    std::env::args().skip(1).find(|arg| {
        let path = Path::new(arg);
        path.exists() && path.is_file()
    })
}

// ---------------------------------------------------------------------------
// Entry point
// ---------------------------------------------------------------------------

fn main() {
    env_logger::init();

    log::info!("CYLview-NG starting (core v{})", cylview_core::VERSION);

    let app_state = Arc::new(AppState::new());

    tauri::Builder::default()
        .plugin(tauri_plugin_single_instance::init(|app, _args, _cwd| {
            if let Some(window) = app.get_webview_window("main") {
                let _ = window.unminimize();
                let _ = window.show();
                let _ = window.set_focus();
            }
        }))
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_fs::init())
        .manage(app_state)
        .invoke_handler(tauri::generate_handler![load_molecule, get_startup_file])
        .setup(|app| {
            #[cfg(not(debug_assertions))]
            let url = tauri::WebviewUrl::App("index.html".into());

            #[cfg(debug_assertions)]
            let url =
                tauri::WebviewUrl::External(tauri::Url::parse("http://localhost:5173").unwrap());

            tauri::WebviewWindowBuilder::new(app, "main", url)
                .title("CYLview-NG")
                .inner_size(1280.0, 800.0)
                .min_inner_size(800.0, 600.0)
                .center()
                .build()?;

            Ok(())
        })
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
