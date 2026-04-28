//! Cylform Desktop Application
//!
//! Tauri shell — file I/O in Rust, 3-D rendering via Three.js in the WebView.

#![cfg_attr(
    all(not(debug_assertions), target_os = "windows"),
    windows_subsystem = "windows"
)]

use cylform_core::{
    io::{read_structure, FileFormat, IoError},
    molecule::Structure,
    CoreError,
};
use parking_lot::Mutex;
use serde::{Deserialize, Serialize};
use std::fs;
use std::path::{Path, PathBuf};
use std::sync::Arc;
use tauri::menu::{AboutMetadataBuilder, Menu, MenuItemBuilder, SubmenuBuilder};
use tauri::{AppHandle, Manager, State};

const MENU_FILE_QUIT: &str = "file_quit";
const MENU_EDIT_COMING_SOON: &str = "edit_coming_soon";
const MENU_VIEW_COMING_SOON: &str = "view_coming_soon";
const MENU_WINDOW_COMING_SOON: &str = "window_coming_soon";

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
    #[serde(skip_serializing_if = "Option::is_none")]
    metadata: Option<SerialAtomMetadata>,
}

#[derive(Serialize)]
struct SerialBond {
    atom1: u32,
    atom2: u32,
    /// cylinder radius (Å) derived from bond order
    radius: f32,
}

#[derive(Serialize)]
struct SerialAtomMetadata {
    #[serde(rename = "recordType", skip_serializing_if = "Option::is_none")]
    record_type: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    serial: Option<i32>,
    #[serde(rename = "atomName", skip_serializing_if = "Option::is_none")]
    atom_name: Option<String>,
    #[serde(rename = "altLoc", skip_serializing_if = "Option::is_none")]
    alt_loc: Option<String>,
    #[serde(rename = "residueName", skip_serializing_if = "Option::is_none")]
    residue_name: Option<String>,
    #[serde(rename = "chainId", skip_serializing_if = "Option::is_none")]
    chain_id: Option<String>,
    #[serde(rename = "residueSequence", skip_serializing_if = "Option::is_none")]
    residue_sequence: Option<i32>,
    #[serde(rename = "insertionCode", skip_serializing_if = "Option::is_none")]
    insertion_code: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    occupancy: Option<f32>,
    #[serde(rename = "bFactor", skip_serializing_if = "Option::is_none")]
    b_factor: Option<f32>,
    #[serde(rename = "formalCharge", skip_serializing_if = "Option::is_none")]
    formal_charge: Option<String>,
}

#[derive(Serialize)]
struct SerialMoleculeMetadata {
    #[serde(rename = "sourceFormat", skip_serializing_if = "Option::is_none")]
    source_format: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    title: Option<String>,
    #[serde(rename = "frameCount", skip_serializing_if = "Option::is_none")]
    frame_count: Option<usize>,
    #[serde(rename = "loadedFrameIndex", skip_serializing_if = "Option::is_none")]
    loaded_frame_index: Option<usize>,
    #[serde(skip_serializing_if = "Option::is_none")]
    energy: Option<f64>,
    #[serde(rename = "energyUnit", skip_serializing_if = "Option::is_none")]
    energy_unit: Option<String>,
    warnings: Vec<String>,
}

#[derive(Serialize)]
struct MoleculeData {
    path: String,
    name: String,
    atoms: Vec<SerialAtom>,
    bonds: Vec<SerialBond>,
    metadata: SerialMoleculeMetadata,
}

#[derive(Deserialize, Serialize, Clone, Default)]
struct RecentFileEntry {
    path: String,
    name: String,
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
            metadata: a.metadata.as_ref().map(|metadata| SerialAtomMetadata {
                record_type: metadata.record_type.clone(),
                serial: metadata.serial,
                atom_name: metadata.atom_name.clone(),
                alt_loc: metadata.alt_loc.clone(),
                residue_name: metadata.residue_name.clone(),
                chain_id: metadata.chain_id.clone(),
                residue_sequence: metadata.residue_sequence,
                insertion_code: metadata.insertion_code.clone(),
                occupancy: metadata.occupancy,
                b_factor: metadata.b_factor,
                formal_charge: metadata.formal_charge.clone(),
            }),
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
        path: path.clone(),
        name: structure.name.clone(),
        atoms,
        bonds,
        metadata: SerialMoleculeMetadata {
            source_format: structure.metadata.source_format.clone(),
            title: structure.metadata.title.clone(),
            frame_count: structure.metadata.frame_count,
            loaded_frame_index: structure.metadata.loaded_frame_index,
            energy: structure.metadata.energy,
            energy_unit: structure.metadata.energy_unit.clone(),
            warnings: structure.metadata.warnings.clone(),
        },
    };

    *state.structure.lock() = Some(structure);

    Ok(data)
}

fn app_data_dir(app: &AppHandle) -> Result<PathBuf, String> {
    let dir = app
        .path()
        .app_data_dir()
        .map_err(|error| format!("Could not locate app data directory: {error}"))?;
    fs::create_dir_all(&dir)
        .map_err(|error| format!("Could not create app data directory: {error}"))?;
    Ok(dir)
}

fn presentation_dir(app: &AppHandle) -> Result<PathBuf, String> {
    let dir = app_data_dir(app)?.join("SavedInfo");
    fs::create_dir_all(&dir)
        .map_err(|error| format!("Could not create presentation-state directory: {error}"))?;
    Ok(dir)
}

fn path_key(path: &str) -> String {
    let mut hash: u64 = 0xcbf29ce484222325;
    for byte in path.as_bytes() {
        hash ^= u64::from(*byte);
        hash = hash.wrapping_mul(0x100000001b3);
    }
    format!("{hash:016x}")
}

fn presentation_state_path(app: &AppHandle, path: &str) -> Result<PathBuf, String> {
    Ok(presentation_dir(app)?.join(format!("{}.json", path_key(path))))
}

#[tauri::command]
fn load_presentation_state(
    app: AppHandle,
    path: String,
) -> Result<Option<serde_json::Value>, String> {
    let state_path = presentation_state_path(&app, &path)?;
    if !state_path.exists() {
        return Ok(None);
    }

    let contents = fs::read_to_string(&state_path)
        .map_err(|error| format!("Could not read saved presentation state: {error}"))?;
    serde_json::from_str(&contents)
        .map(Some)
        .map_err(|error| format!("Saved presentation state is invalid JSON: {error}"))
}

#[tauri::command]
fn save_presentation_state(
    app: AppHandle,
    path: String,
    state: serde_json::Value,
) -> Result<(), String> {
    let state_path = presentation_state_path(&app, &path)?;
    let contents = serde_json::to_string_pretty(&state)
        .map_err(|error| format!("Could not encode presentation state: {error}"))?;
    fs::write(&state_path, contents)
        .map_err(|error| format!("Could not save presentation state: {error}"))
}

#[tauri::command]
fn clear_presentation_state(app: AppHandle, path: String) -> Result<(), String> {
    let state_path = presentation_state_path(&app, &path)?;
    if state_path.exists() {
        fs::remove_file(&state_path)
            .map_err(|error| format!("Could not remove presentation state: {error}"))?;
    }
    Ok(())
}

fn recent_files_path(app: &AppHandle) -> Result<PathBuf, String> {
    Ok(app_data_dir(app)?.join("recent-files.json"))
}

fn read_recent_files(app: &AppHandle) -> Result<Vec<RecentFileEntry>, String> {
    let path = recent_files_path(app)?;
    if !path.exists() {
        return Ok(Vec::new());
    }
    let contents = fs::read_to_string(path)
        .map_err(|error| format!("Could not read recent files: {error}"))?;
    serde_json::from_str(&contents)
        .map_err(|error| format!("Recent files are invalid JSON: {error}"))
}

fn write_recent_files(app: &AppHandle, entries: &[RecentFileEntry]) -> Result<(), String> {
    let path = recent_files_path(app)?;
    let contents = serde_json::to_string_pretty(entries)
        .map_err(|error| format!("Could not encode recent files: {error}"))?;
    fs::write(path, contents).map_err(|error| format!("Could not save recent files: {error}"))
}

#[tauri::command]
fn get_recent_files(app: AppHandle) -> Result<Vec<RecentFileEntry>, String> {
    let entries = read_recent_files(&app)?;
    Ok(entries
        .into_iter()
        .filter(|entry| Path::new(&entry.path).is_file())
        .take(12)
        .collect())
}

#[tauri::command]
fn record_recent_file(app: AppHandle, path: String) -> Result<(), String> {
    let file_name = Path::new(&path)
        .file_name()
        .and_then(|name| name.to_str())
        .unwrap_or(&path)
        .to_string();
    let mut entries = read_recent_files(&app)?;
    entries.retain(|entry| entry.path != path);
    entries.insert(
        0,
        RecentFileEntry {
            path,
            name: file_name,
        },
    );
    entries.truncate(12);
    write_recent_files(&app, &entries)
}

#[tauri::command]
fn list_supported_files_near(path: String) -> Result<Vec<String>, String> {
    let current_path = Path::new(&path);
    let dir = current_path
        .parent()
        .ok_or_else(|| "Could not locate containing directory.".to_string())?;
    let mut files = Vec::new();
    for entry in fs::read_dir(dir).map_err(|error| format!("Could not read directory: {error}"))? {
        let entry = entry.map_err(|error| format!("Could not read directory entry: {error}"))?;
        let path = entry.path();
        if !path.is_file() {
            continue;
        }
        let is_supported = path
            .extension()
            .and_then(|extension| extension.to_str())
            .map(|extension| matches!(extension.to_ascii_lowercase().as_str(), "xyz" | "pdb"))
            .unwrap_or(false);
        if is_supported {
            files.push(path.to_string_lossy().to_string());
        }
    }
    files.sort_by_key(|file| file.to_ascii_lowercase());
    Ok(files)
}

fn format_load_error(error: CoreError) -> String {
    match error {
        CoreError::Io(IoError::NotFound(message)) => {
            format!("File not found or not readable: {message}")
        }
        CoreError::Io(IoError::UnsupportedFormat(message)) => message,
        CoreError::Io(IoError::Parse(message)) => message,
        CoreError::Io(IoError::FileTooLarge { size_mb, limit_mb }) => format!(
            "File is too large ({size_mb:.1} MB). Cylform currently supports files up to {limit_mb:.1} MB."
        ),
        CoreError::Io(IoError::TooManyAtoms { count, limit }) => format!(
            "Molecule is too large ({count} atoms). Cylform currently supports up to {limit} atoms per structure."
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

fn build_app_menu<R: tauri::Runtime, M: Manager<R>>(manager: &M) -> tauri::Result<Menu<R>> {
    let quit = MenuItemBuilder::with_id(MENU_FILE_QUIT, "Quit Cylform")
        .accelerator("Ctrl+Q")
        .build(manager)?;
    let edit_coming_soon = MenuItemBuilder::with_id(MENU_EDIT_COMING_SOON, "Coming soon")
        .enabled(false)
        .build(manager)?;
    let view_coming_soon = MenuItemBuilder::with_id(MENU_VIEW_COMING_SOON, "Coming soon")
        .enabled(false)
        .build(manager)?;
    let window_coming_soon = MenuItemBuilder::with_id(MENU_WINDOW_COMING_SOON, "Coming soon")
        .enabled(false)
        .build(manager)?;

    let about = AboutMetadataBuilder::new()
        .name(Some("Cylform"))
        .version(Some(env!("CARGO_PKG_VERSION")))
        .authors(Some(vec!["Cylform Contributors".to_string()]))
        .comments(Some(
            "Publication-minded molecular viewing for XYZ and PDB structures.",
        ))
        .license(Some("Apache-2.0"))
        .website(Some("https://github.com/Summykai/Cylform"))
        .website_label(Some("Cylform on GitHub"))
        .build();

    let file_menu = SubmenuBuilder::new(manager, "File").item(&quit).build()?;
    let edit_menu = SubmenuBuilder::new(manager, "Edit")
        .item(&edit_coming_soon)
        .build()?;
    let view_menu = SubmenuBuilder::new(manager, "View")
        .item(&view_coming_soon)
        .build()?;
    let window_menu = SubmenuBuilder::new(manager, "Window")
        .item(&window_coming_soon)
        .build()?;
    let help_menu = SubmenuBuilder::new(manager, "Help")
        .about_with_text("About Cylform", Some(about))
        .build()?;

    Menu::with_items(
        manager,
        &[&file_menu, &edit_menu, &view_menu, &window_menu, &help_menu],
    )
}

// ---------------------------------------------------------------------------
// Entry point
// ---------------------------------------------------------------------------

fn main() {
    env_logger::init();

    log::info!("Cylform starting (core v{})", cylform_core::VERSION);

    let app_state = Arc::new(AppState::new());

    tauri::Builder::default()
        .menu(build_app_menu)
        .on_menu_event(|app, event| {
            if event.id() == MENU_FILE_QUIT {
                app.exit(0);
            }
        })
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
        .invoke_handler(tauri::generate_handler![
            load_molecule,
            get_startup_file,
            load_presentation_state,
            save_presentation_state,
            clear_presentation_state,
            get_recent_files,
            record_recent_file,
            list_supported_files_near
        ])
        .setup(|app| {
            #[cfg(not(debug_assertions))]
            let url = tauri::WebviewUrl::App("index.html".into());

            #[cfg(debug_assertions)]
            let url =
                tauri::WebviewUrl::External(tauri::Url::parse("http://localhost:5173").unwrap());

            tauri::WebviewWindowBuilder::new(app, "main", url)
                .title("Cylform")
                .inner_size(1280.0, 800.0)
                .min_inner_size(800.0, 600.0)
                .center()
                .build()?;

            Ok(())
        })
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
