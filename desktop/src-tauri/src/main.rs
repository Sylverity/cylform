//! Cylform Desktop Application
//!
//! Tauri shell — file I/O in Rust, 3-D rendering via Three.js in the WebView.

#![cfg_attr(
    all(not(debug_assertions), target_os = "windows"),
    windows_subsystem = "windows"
)]

use base64::{engine::general_purpose, Engine as _};
use cylform_core::{
    io::{
        read_structure_with_options, supported_read_extensions, FileFormat, IoError, ReadOptions,
        MAX_ATOMS,
    },
    molecule::{normalize_bond_perception_tolerance, BondKind, Structure},
    CoreError,
};
use parking_lot::Mutex;
use serde::{Deserialize, Serialize};
use serde_json::{json, Value};
use std::fs;
use std::path::{Path, PathBuf};
use std::process::Command;
use std::sync::Arc;
use std::time::{SystemTime, UNIX_EPOCH};
use tauri::menu::{AboutMetadataBuilder, Menu, MenuItemBuilder, SubmenuBuilder};
use tauri::{AppHandle, Emitter, Manager, State};

const MENU_FILE_OPEN: &str = "file_open";
const MENU_FILE_OPEN_RECENT: &str = "file_open_recent";
const MENU_FILE_CLOSE_CURRENT: &str = "file_close_current";
const MENU_FILE_EXPORT_PNG: &str = "file_export_png";
const MENU_FILE_SETTINGS: &str = "file_settings";
const MENU_FILE_QUIT: &str = "file_quit";
const MENU_VIEW_RESET: &str = "view_reset";
const MENU_VIEW_OPEN_DEVTOOLS: &str = "view_open_devtools";

const EVENT_MENU_OPEN_FILE: &str = "menu:open-file";
const EVENT_MENU_OPEN_RECENT: &str = "menu:open-recent";
const EVENT_MENU_CLOSE_CURRENT_TAB: &str = "menu:close-current-tab";
const EVENT_MENU_EXPORT_PNG: &str = "menu:export-png";
const EVENT_MENU_OPEN_SETTINGS: &str = "menu:open-settings";
const EVENT_MENU_RESET_VIEW: &str = "menu:reset-view";
const EVENT_MENU_DEVTOOLS_DISABLED: &str = "menu:devtools-disabled";
#[cfg(not(any(debug_assertions, feature = "devtools")))]
const EVENT_MENU_DEVTOOLS_UNAVAILABLE: &str = "menu:devtools-unavailable";

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
    kind: BondKind,
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
struct SerialMoleculeGroup {
    id: String,
    label: String,
    #[serde(rename = "residueName", skip_serializing_if = "Option::is_none")]
    residue_name: Option<String>,
    #[serde(rename = "chainId", skip_serializing_if = "Option::is_none")]
    chain_id: Option<String>,
    #[serde(rename = "residueSequence", skip_serializing_if = "Option::is_none")]
    residue_sequence: Option<i32>,
    #[serde(rename = "insertionCode", skip_serializing_if = "Option::is_none")]
    insertion_code: Option<String>,
    #[serde(rename = "atomIndices")]
    atom_indices: Vec<usize>,
    centroid: SerialPoint,
}

#[derive(Serialize)]
struct SerialPoint {
    x: f32,
    y: f32,
    z: f32,
}

#[derive(Serialize)]
struct MoleculeData {
    path: String,
    name: String,
    atoms: Vec<SerialAtom>,
    bonds: Vec<SerialBond>,
    groups: Vec<SerialMoleculeGroup>,
    metadata: SerialMoleculeMetadata,
}

#[derive(Serialize)]
struct BenchmarkConfig {
    enabled: bool,
    #[serde(rename = "outputPath")]
    output_path: Option<String>,
    #[serde(rename = "sampleMs")]
    sample_ms: u32,
    #[serde(rename = "interactionMs")]
    interaction_ms: u32,
    #[serde(rename = "targetFps")]
    target_fps: f64,
    #[serde(rename = "maxAtoms")]
    max_atoms: usize,
}

#[derive(Deserialize, Serialize, Clone, Default)]
struct RecentFileEntry {
    path: String,
    name: String,
}

#[derive(Debug, Clone, Serialize)]
struct AppDataPaths {
    root: String,
    settings: String,
    session_tabs: String,
    recent_files: String,
    saved_info: String,
    pose_library: String,
    pose_previews: String,
}

fn session_tabs_version() -> u32 {
    1
}

#[derive(Debug, Clone, Deserialize, Serialize, PartialEq, Eq)]
struct SessionTabRecord {
    id: String,
    path: String,
    #[serde(rename = "displayName")]
    display_name: String,
    #[serde(rename = "lastOpenedAt")]
    last_opened_at: String,
}

#[derive(Debug, Clone, Deserialize, Serialize, PartialEq, Eq)]
struct SessionTabsEnvelope {
    #[serde(default = "session_tabs_version")]
    version: u32,
    #[serde(rename = "activeTabId", default)]
    active_tab_id: Option<String>,
    #[serde(default)]
    tabs: Vec<SessionTabRecord>,
}

impl Default for SessionTabsEnvelope {
    fn default() -> Self {
        Self {
            version: session_tabs_version(),
            active_tab_id: None,
            tabs: Vec::new(),
        }
    }
}

fn pose_library_version() -> u32 {
    1
}

#[derive(Debug, Clone, Deserialize, Serialize, PartialEq)]
struct PoseLibraryEntry {
    id: String,
    name: String,
    #[serde(rename = "moleculePath")]
    molecule_path: String,
    #[serde(rename = "moleculeDisplayName")]
    molecule_display_name: String,
    #[serde(rename = "moleculeHash")]
    molecule_hash: String,
    pose: Value,
    #[serde(rename = "previewImagePath")]
    preview_image_path: Option<String>,
    #[serde(rename = "createdAt")]
    created_at: String,
    #[serde(rename = "updatedAt")]
    updated_at: String,
    #[serde(default)]
    tags: Vec<String>,
    #[serde(default)]
    notes: String,
    #[serde(rename = "atomCount")]
    atom_count: Option<usize>,
    formula: Option<String>,
    #[serde(rename = "sourceFormat")]
    source_format: Option<String>,
}

#[derive(Debug, Clone, Deserialize, Serialize, PartialEq)]
struct PoseLibraryEnvelope {
    #[serde(default = "pose_library_version")]
    version: u32,
    #[serde(default)]
    entries: Vec<PoseLibraryEntry>,
}

impl Default for PoseLibraryEnvelope {
    fn default() -> Self {
        Self {
            version: pose_library_version(),
            entries: Vec::new(),
        }
    }
}

struct PoseLibrarySaveRequest {
    name: String,
    molecule_path: String,
    molecule_display_name: String,
    pose: Value,
    tags: Vec<String>,
    notes: String,
    atom_count: Option<usize>,
    formula: Option<String>,
    source_format: Option<String>,
    preview_image_path: Option<String>,
}

fn presentation_state_version() -> u32 {
    1
}

fn app_settings_version() -> u32 {
    1
}

fn default_material_preset() -> String {
    "CYLview".to_string()
}

#[derive(Debug, Clone, Deserialize, Serialize)]
#[serde(tag = "type")]
enum Annotation {
    AtomLabel {
        #[serde(default)]
        id: String,
        #[serde(default)]
        visible: bool,
        #[serde(default)]
        atom_id: usize,
        #[serde(default)]
        text: String,
        #[serde(default)]
        anchor: Value,
        #[serde(default)]
        source: Value,
    },
    Distance {
        #[serde(default)]
        id: String,
        #[serde(default)]
        visible: bool,
        #[serde(default)]
        atoms: [usize; 2],
        #[serde(default)]
        value: f64,
        #[serde(default)]
        text: String,
        #[serde(default)]
        anchor: Value,
        #[serde(default)]
        source: Value,
    },
    Angle {
        #[serde(default)]
        id: String,
        #[serde(default)]
        visible: bool,
        #[serde(default)]
        atoms: [usize; 3],
        #[serde(default)]
        value: f64,
        #[serde(default)]
        text: String,
        #[serde(default)]
        anchor: Value,
        #[serde(default)]
        source: Value,
    },
    Dihedral {
        #[serde(default)]
        id: String,
        #[serde(default)]
        visible: bool,
        #[serde(default)]
        atoms: [usize; 4],
        #[serde(default)]
        value: f64,
        #[serde(default)]
        text: String,
        #[serde(default)]
        anchor: Value,
        #[serde(default)]
        source: Value,
    },
}

#[derive(Debug, Clone, Deserialize, Serialize)]
struct PresentationStyles {
    #[serde(default)]
    hydrogen_visibility: Option<String>,
    #[serde(default)]
    element_color_overrides: Value,
    #[serde(default)]
    atom_size_scale: Option<f64>,
    #[serde(default)]
    atom_style_overrides: Value,
    #[serde(default)]
    bond_style_overrides: Value,
    #[serde(default = "default_material_preset")]
    material_preset: String,
}

impl Default for PresentationStyles {
    fn default() -> Self {
        Self {
            hydrogen_visibility: None,
            element_color_overrides: Value::Object(Default::default()),
            atom_size_scale: None,
            atom_style_overrides: Value::Object(Default::default()),
            bond_style_overrides: Value::Object(Default::default()),
            material_preset: default_material_preset(),
        }
    }
}

#[derive(Debug, Clone, Deserialize, Serialize)]
struct PresentationStateEnvelope {
    #[serde(default = "presentation_state_version")]
    version: u32,
    #[serde(default)]
    poses: Value,
    #[serde(default)]
    annotations: Vec<Annotation>,
    #[serde(default)]
    hidden_atoms: Vec<usize>,
    #[serde(default)]
    styles: PresentationStyles,
    #[serde(default)]
    camera: Value,
}

impl Default for PresentationStateEnvelope {
    fn default() -> Self {
        Self {
            version: presentation_state_version(),
            poses: Value::Array(Vec::new()),
            annotations: Vec::new(),
            hidden_atoms: Vec::new(),
            styles: PresentationStyles::default(),
            camera: Value::Null,
        }
    }
}

// ---------------------------------------------------------------------------
// Tauri commands
// ---------------------------------------------------------------------------

/// Load a molecular file and return the full atom/bond geometry to the frontend.
/// Coordinates are re-centred to the geometric centre of the molecule.
#[tauri::command]
fn load_molecule(
    path: String,
    frame_index: Option<usize>,
    bond_perception_tolerance: Option<f32>,
    state: State<'_, Arc<AppState>>,
) -> Result<MoleculeData, String> {
    let frame_index = frame_index.unwrap_or(0);
    log::info!("Loading molecule from: {} (frame {})", path, frame_index);

    let mut read_options = read_options_from_env();
    if let Some(tolerance) = bond_perception_tolerance {
        read_options.bond_perception_tolerance = normalize_bond_perception_tolerance(tolerance);
    }

    let mut structure = read_structure_with_options(&path, FileFormat::Auto, read_options)
        .map_err(format_load_error)?;
    if structure.frame(frame_index).is_none() {
        return Err(format!(
            "Frame index {} is out of range for {} frame(s).",
            frame_index,
            structure.frames.len()
        ));
    }
    structure.metadata.loaded_frame_index = Some(frame_index);

    let center = structure.center();

    let atoms = structure
        .atoms()
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

    let groups = build_molecule_groups(&structure, center);

    let bonds = structure
        .bonds()
        .iter()
        .map(|b| SerialBond {
            atom1: b.atom1,
            atom2: b.atom2,
            radius: b.order.radius_multiplier(),
            kind: b.kind,
        })
        .collect();

    log::info!(
        "Loaded '{}': {} atoms, {} bonds",
        structure.name(),
        structure.atom_count(),
        structure.bond_count()
    );

    let data = MoleculeData {
        path: path.clone(),
        name: structure.name().to_string(),
        atoms,
        bonds,
        groups,
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

fn benchmark_enabled() -> bool {
    std::env::var("CYLFORM_BENCHMARK")
        .map(|value| matches!(value.as_str(), "1" | "true" | "TRUE" | "yes" | "YES"))
        .unwrap_or(false)
}

fn read_options_from_env() -> ReadOptions {
    if !benchmark_enabled() {
        return ReadOptions::default();
    }

    let max_atoms = std::env::var("CYLFORM_BENCH_MAX_ATOMS")
        .ok()
        .and_then(|value| value.parse::<usize>().ok())
        .filter(|value| *value > 0)
        .unwrap_or(MAX_ATOMS);

    ReadOptions {
        max_atoms,
        ..ReadOptions::default()
    }
}

#[tauri::command]
fn get_benchmark_config() -> BenchmarkConfig {
    BenchmarkConfig {
        enabled: benchmark_enabled(),
        output_path: std::env::var("CYLFORM_BENCH_OUTPUT").ok(),
        sample_ms: std::env::var("CYLFORM_BENCH_SAMPLE_MS")
            .ok()
            .and_then(|value| value.parse::<u32>().ok())
            .filter(|value| *value >= 250)
            .unwrap_or(3_000),
        interaction_ms: std::env::var("CYLFORM_BENCH_INTERACTION_MS")
            .ok()
            .and_then(|value| value.parse::<u32>().ok())
            .filter(|value| *value >= 250)
            .unwrap_or(1_200),
        target_fps: std::env::var("CYLFORM_BENCH_TARGET_FPS")
            .ok()
            .and_then(|value| value.parse::<f64>().ok())
            .filter(|value| *value > 0.0)
            .unwrap_or(30.0),
        max_atoms: read_options_from_env().max_atoms,
    }
}

#[tauri::command]
fn write_benchmark_result(
    app: AppHandle,
    output_path: Option<String>,
    result: serde_json::Value,
) -> Result<(), String> {
    if !benchmark_enabled() {
        return Err("Benchmark result writing is available only in benchmark mode.".to_string());
    }

    let path = output_path
        .or_else(|| std::env::var("CYLFORM_BENCH_OUTPUT").ok())
        .ok_or_else(|| "Benchmark output path was not provided.".to_string())?;
    let path = PathBuf::from(path);
    if let Some(parent) = path.parent() {
        fs::create_dir_all(parent)
            .map_err(|error| format!("Could not create benchmark output directory: {error}"))?;
    }
    let contents = serde_json::to_string_pretty(&result)
        .map_err(|error| format!("Could not encode benchmark result: {error}"))?;
    fs::write(&path, contents)
        .map_err(|error| format!("Could not write benchmark result: {error}"))?;
    app.exit(0);
    Ok(())
}

fn export_png_to_path(path: &Path, bytes: &[u8]) -> Result<(), String> {
    if bytes.is_empty() {
        return Err("PNG export data was empty.".to_string());
    }
    if !bytes.starts_with(b"\x89PNG\r\n\x1a\n") {
        return Err("PNG export data is not a valid PNG image.".to_string());
    }
    if path
        .extension()
        .and_then(|extension| extension.to_str())
        .map(|extension| extension.eq_ignore_ascii_case("png"))
        != Some(true)
    {
        return Err("PNG export path must end with .png.".to_string());
    }
    if path.exists() && !path.is_file() {
        return Err("PNG export path is not a file.".to_string());
    }
    if let Some(parent) = path.parent() {
        if !parent.exists() {
            return Err("PNG export directory does not exist.".to_string());
        }
    }

    fs::write(path, bytes).map_err(|error| format!("Could not export PNG: {error}"))
}

#[tauri::command]
fn export_png(path: String, bytes: Vec<u8>) -> Result<(), String> {
    export_png_to_path(Path::new(&path), &bytes)
}

fn build_molecule_groups(structure: &Structure, center: glam::Vec3) -> Vec<SerialMoleculeGroup> {
    #[derive(Clone)]
    struct GroupAccumulator {
        residue_name: Option<String>,
        chain_id: Option<String>,
        residue_sequence: Option<i32>,
        insertion_code: Option<String>,
        atom_indices: Vec<usize>,
        sum: glam::Vec3,
    }

    let mut groups = std::collections::BTreeMap::<String, GroupAccumulator>::new();

    for (atom_index, atom) in structure.atoms().iter().enumerate() {
        let Some(metadata) = atom.metadata.as_ref() else {
            continue;
        };
        if metadata.residue_name.is_none()
            && metadata.residue_sequence.is_none()
            && metadata.chain_id.is_none()
            && metadata.insertion_code.is_none()
        {
            continue;
        }

        let key = format!(
            "{}:{}:{}:{}",
            metadata.chain_id.as_deref().unwrap_or(""),
            metadata.residue_name.as_deref().unwrap_or(""),
            metadata
                .residue_sequence
                .map(|value| value.to_string())
                .unwrap_or_default(),
            metadata.insertion_code.as_deref().unwrap_or("")
        );
        let entry = groups.entry(key).or_insert_with(|| GroupAccumulator {
            residue_name: metadata.residue_name.clone(),
            chain_id: metadata.chain_id.clone(),
            residue_sequence: metadata.residue_sequence,
            insertion_code: metadata.insertion_code.clone(),
            atom_indices: Vec::new(),
            sum: glam::Vec3::ZERO,
        });
        entry.atom_indices.push(atom_index);
        entry.sum += atom.position - center;
    }

    if groups.len() < 2 {
        return Vec::new();
    }

    groups
        .into_iter()
        .map(|(id, group)| {
            let centroid = group.sum / group.atom_indices.len() as f32;
            let label = format_group_label(
                group.residue_name.as_deref(),
                group.chain_id.as_deref(),
                group.residue_sequence,
                group.insertion_code.as_deref(),
            );
            SerialMoleculeGroup {
                id,
                label,
                residue_name: group.residue_name,
                chain_id: group.chain_id,
                residue_sequence: group.residue_sequence,
                insertion_code: group.insertion_code,
                atom_indices: group.atom_indices,
                centroid: SerialPoint {
                    x: centroid.x,
                    y: centroid.y,
                    z: centroid.z,
                },
            }
        })
        .collect()
}

fn format_group_label(
    residue_name: Option<&str>,
    chain_id: Option<&str>,
    residue_sequence: Option<i32>,
    insertion_code: Option<&str>,
) -> String {
    let mut label = residue_name.unwrap_or("Group").to_string();
    if let Some(sequence) = residue_sequence {
        label.push(' ');
        label.push_str(&sequence.to_string());
    }
    if let Some(code) = insertion_code.filter(|value| !value.is_empty()) {
        label.push_str(code);
    }
    if let Some(chain) = chain_id.filter(|value| !value.is_empty()) {
        label.push_str(" · ");
        label.push_str(chain);
    }
    label
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

fn session_tabs_path(app: &AppHandle) -> Result<PathBuf, String> {
    Ok(app_data_dir(app)?.join("session-tabs.json"))
}

fn app_settings_path(app: &AppHandle) -> Result<PathBuf, String> {
    Ok(app_data_dir(app)?.join("settings.json"))
}

fn pose_library_path(app: &AppHandle) -> Result<PathBuf, String> {
    Ok(app_data_dir(app)?.join("pose-library.json"))
}

fn pose_previews_dir(app: &AppHandle) -> Result<PathBuf, String> {
    let dir = app_data_dir(app)?.join("PosePreviews");
    fs::create_dir_all(&dir)
        .map_err(|error| format!("Could not create pose-preview directory: {error}"))?;
    Ok(dir)
}

fn app_data_paths(app: &AppHandle) -> Result<AppDataPaths, String> {
    let root = app_data_dir(app)?;
    let saved_info = presentation_dir(app)?;
    let pose_previews = pose_previews_dir(app)?;
    Ok(AppDataPaths {
        root: root.to_string_lossy().to_string(),
        settings: app_settings_path(app)?.to_string_lossy().to_string(),
        session_tabs: session_tabs_path(app)?.to_string_lossy().to_string(),
        recent_files: recent_files_path(app)?.to_string_lossy().to_string(),
        saved_info: saved_info.to_string_lossy().to_string(),
        pose_library: pose_library_path(app)?.to_string_lossy().to_string(),
        pose_previews: pose_previews.to_string_lossy().to_string(),
    })
}

fn preview_file_name(id: &str) -> String {
    let safe_id = id
        .chars()
        .filter(|character| character.is_ascii_alphanumeric() || matches!(character, '_' | '-'))
        .collect::<String>();
    format!("{}.png", if safe_id.is_empty() { "pose" } else { &safe_id })
}

fn preview_path_in_dir(dir: &Path, reference: &str) -> Result<PathBuf, String> {
    let path = Path::new(reference);
    let file_name = path
        .file_name()
        .and_then(|name| name.to_str())
        .ok_or_else(|| "Preview image path is invalid.".to_string())?;
    if file_name != reference || file_name.is_empty() || !file_name.ends_with(".png") {
        return Err("Preview image path must be a PosePreviews PNG reference.".to_string());
    }
    Ok(dir.join(file_name))
}

fn decode_png_data_url(data_url: &str) -> Result<Vec<u8>, String> {
    let (header, payload) = data_url
        .split_once(',')
        .ok_or_else(|| "Preview image data is malformed.".to_string())?;
    if !header.starts_with("data:image/png") || !header.contains(";base64") {
        return Err("Preview image must be a base64 PNG data URL.".to_string());
    }
    general_purpose::STANDARD
        .decode(payload)
        .map_err(|error| format!("Could not decode pose preview: {error}"))
}

fn encode_png_data_url(bytes: &[u8]) -> String {
    format!(
        "data:image/png;base64,{}",
        general_purpose::STANDARD.encode(bytes)
    )
}

fn setting_section<'a>(value: &'a Value, key: &str) -> Option<&'a serde_json::Map<String, Value>> {
    value.get(key).and_then(Value::as_object)
}

fn setting_bool(
    section: Option<&serde_json::Map<String, Value>>,
    key: &str,
    default: bool,
) -> bool {
    section
        .and_then(|object| object.get(key))
        .and_then(Value::as_bool)
        .unwrap_or(default)
}

fn setting_string(
    section: Option<&serde_json::Map<String, Value>>,
    key: &str,
    default: &str,
    allowed: &[&str],
) -> String {
    let value = section
        .and_then(|object| object.get(key))
        .and_then(Value::as_str)
        .unwrap_or(default);
    if allowed.contains(&value) {
        value.to_string()
    } else {
        default.to_string()
    }
}

fn setting_u8_range(
    section: Option<&serde_json::Map<String, Value>>,
    key: &str,
    default: u8,
    min: u8,
    max: u8,
) -> u8 {
    section
        .and_then(|object| object.get(key))
        .and_then(Value::as_u64)
        .map(|value| value.clamp(u64::from(min), u64::from(max)) as u8)
        .unwrap_or(default)
}

fn setting_f64_range(
    section: Option<&serde_json::Map<String, Value>>,
    key: &str,
    default: f64,
    min: f64,
    max: f64,
) -> f64 {
    section
        .and_then(|object| object.get(key))
        .and_then(Value::as_f64)
        .map(|value| value.clamp(min, max))
        .unwrap_or(default)
}

fn setting_object(section: Option<&serde_json::Map<String, Value>>, key: &str) -> Value {
    section
        .and_then(|object| object.get(key))
        .and_then(Value::as_object)
        .map(|object| Value::Object(object.clone()))
        .unwrap_or_else(|| json!({}))
}

fn normalize_hex_color(value: Option<&Value>, default: &str) -> String {
    let Some(candidate) = value.and_then(Value::as_str) else {
        return default.to_string();
    };
    let hex = candidate.trim();
    let Some(digits) = hex.strip_prefix('#') else {
        return default.to_string();
    };
    if digits.len() == 6
        && digits
            .chars()
            .all(|character| character.is_ascii_hexdigit())
    {
        format!("#{digits}").to_ascii_lowercase()
    } else {
        default.to_string()
    }
}

fn default_app_settings() -> Value {
    normalize_app_settings(json!({}))
}

fn normalize_app_settings(value: Value) -> Value {
    let rendering = setting_section(&value, "rendering");
    let chemistry = setting_section(&value, "chemistry");
    let interaction = setting_section(&value, "interaction");
    let files = setting_section(&value, "files");
    let app = setting_section(&value, "app");

    let png_export_scale = match setting_u8_range(rendering, "pngExportScale", 2, 1, 4) {
        1 => 1,
        4 => 4,
        _ => 2,
    };
    let recent_files_limit = setting_u8_range(files, "recentFilesLimit", 12, 5, 50);

    json!({
        "version": app_settings_version(),
        "rendering": {
            "pngExportScale": png_export_scale,
            "defaultBackground": setting_string(rendering, "defaultBackground", "white", &["white", "black", "custom"]),
            "customBackgroundHex": normalize_hex_color(rendering.and_then(|section| section.get("customBackgroundHex")), "#ffffff"),
            "defaultMaterialPreset": setting_string(rendering, "defaultMaterialPreset", "CYLview", &["CYLviewLegacy", "CYLview", "Houkmol"]),
            "defaultProjection": setting_string(rendering, "defaultProjection", "perspective", &["perspective", "orthographic"]),
            "defaultLighting": setting_string(rendering, "defaultLighting", "publication", &["publication", "soft-studio", "high-contrast"]),
            "showFloorGridByDefault": setting_bool(rendering, "showFloorGridByDefault", false),
        },
        "chemistry": {
            "defaultHydrogenVisibility": setting_string(chemistry, "defaultHydrogenVisibility", "shown", &["shown", "hidden", "hide-c-h"]),
            "distancePrecision": setting_u8_range(chemistry, "distancePrecision", 2, 1, 4),
            "anglePrecision": setting_u8_range(chemistry, "anglePrecision", 1, 1, 4),
            "bondPerceptionTolerance": setting_f64_range(chemistry, "bondPerceptionTolerance", 1.3, 1.1, 1.5),
            "useSymbolUnits": setting_bool(chemistry, "useSymbolUnits", true),
        },
        "interaction": {
            "mouseMode": setting_string(interaction, "mouseMode", "standard", &["standard", "one-button"]),
            "invertScrollZoom": setting_bool(interaction, "invertScrollZoom", false),
            "keyboardShortcuts": setting_object(interaction, "keyboardShortcuts"),
        },
        "files": {
            "autosavePresentationState": setting_bool(files, "autosavePresentationState", true),
            "restorePreviousSessionOnStartup": setting_bool(files, "restorePreviousSessionOnStartup", true),
            "droppedFilesOpenInBackground": setting_bool(files, "droppedFilesOpenInBackground", true),
            "recentFilesLimit": recent_files_limit,
        },
        "app": {
            "autoCheckForUpdates": setting_bool(app, "autoCheckForUpdates", false),
            "devtoolsMenuEnabled": setting_bool(app, "devtoolsMenuEnabled", true),
            "theme": setting_string(app, "theme", "dark", &["dark", "light", "auto"]),
        },
    })
}

fn now_timestamp() -> String {
    let millis = SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .map(|duration| duration.as_millis())
        .unwrap_or(0);
    format!("{millis}")
}

fn normalize_session_tabs(mut envelope: SessionTabsEnvelope) -> SessionTabsEnvelope {
    envelope.version = session_tabs_version();
    envelope.tabs.retain(|tab| !tab.path.trim().is_empty());
    let active_is_valid = envelope
        .active_tab_id
        .as_ref()
        .map(|active_id| envelope.tabs.iter().any(|tab| &tab.id == active_id))
        .unwrap_or(false);
    if !active_is_valid {
        envelope.active_tab_id = envelope.tabs.first().map(|tab| tab.id.clone());
    }
    envelope
}

fn add_pose_library_entry(
    mut library: PoseLibraryEnvelope,
    request: PoseLibrarySaveRequest,
    now: String,
) -> PoseLibraryEnvelope {
    let id = format!(
        "pose_lib_{}_{}",
        path_key(&request.molecule_path),
        now.chars()
            .filter(|character| character.is_ascii_alphanumeric())
            .collect::<String>()
    );
    library.version = pose_library_version();
    library.entries.insert(
        0,
        PoseLibraryEntry {
            id,
            name: request.name,
            molecule_hash: path_key(&request.molecule_path),
            molecule_path: request.molecule_path,
            molecule_display_name: request.molecule_display_name,
            pose: request.pose,
            preview_image_path: request.preview_image_path,
            created_at: now.clone(),
            updated_at: now,
            tags: request.tags,
            notes: request.notes,
            atom_count: request.atom_count,
            formula: request.formula,
            source_format: request.source_format,
        },
    );
    library
}

fn rename_pose_library_entry_in_envelope(
    mut library: PoseLibraryEnvelope,
    id: &str,
    name: String,
    now: String,
) -> Result<PoseLibraryEnvelope, String> {
    let entry = library
        .entries
        .iter_mut()
        .find(|entry| entry.id == id)
        .ok_or_else(|| "Pose library entry was not found.".to_string())?;
    entry.name = name;
    entry.updated_at = now;
    Ok(library)
}

fn delete_pose_library_entry_in_envelope(
    mut library: PoseLibraryEnvelope,
    id: &str,
) -> Result<PoseLibraryEnvelope, String> {
    let original_len = library.entries.len();
    library.entries.retain(|entry| entry.id != id);
    if library.entries.len() == original_len {
        return Err("Pose library entry was not found.".to_string());
    }
    Ok(library)
}

fn attach_pose_preview_in_envelope(
    mut library: PoseLibraryEnvelope,
    id: &str,
    preview_image_path: String,
    now: String,
) -> Result<(PoseLibraryEnvelope, PoseLibraryEntry), String> {
    let entry_index = library
        .entries
        .iter()
        .position(|entry| entry.id == id)
        .ok_or_else(|| "Pose library entry was not found.".to_string())?;
    let entry = &mut library.entries[entry_index];
    entry.preview_image_path = Some(preview_image_path);
    entry.updated_at = now;
    let entry = entry.clone();
    Ok((library, entry))
}

fn value_array(value: Option<&Value>) -> Value {
    match value {
        Some(Value::Array(items)) => Value::Array(items.clone()),
        _ => Value::Array(Vec::new()),
    }
}

fn value_object(value: Option<&Value>) -> Value {
    match value {
        Some(Value::Object(map)) => Value::Object(map.clone()),
        _ => Value::Object(Default::default()),
    }
}

fn legacy_label_to_annotation(label: &Value) -> Value {
    let label_type = label.get("type").and_then(Value::as_str).unwrap_or("atom");
    let text = label.get("text").cloned().unwrap_or_else(|| json!(""));
    let id = label.get("id").cloned().unwrap_or_else(|| json!(""));
    let visible = label.get("visible").cloned().unwrap_or(Value::Bool(true));
    let anchor = label.get("anchor").cloned().unwrap_or(Value::Null);
    let source = label.get("source").cloned().unwrap_or_else(|| json!({}));
    let atom_indices = source
        .get("atomIndices")
        .and_then(Value::as_array)
        .cloned()
        .unwrap_or_default();

    match label_type {
        "distance" => json!({
            "type": "Distance",
            "id": id,
            "visible": visible,
            "atoms": [
                atom_indices.first().and_then(Value::as_u64).unwrap_or(0) as usize,
                atom_indices.get(1).and_then(Value::as_u64).unwrap_or(0) as usize
            ],
            "value": 0.0,
            "text": text,
            "anchor": anchor,
            "source": source,
        }),
        "angle" => json!({
            "type": "Angle",
            "id": id,
            "visible": visible,
            "atoms": [
                atom_indices.first().and_then(Value::as_u64).unwrap_or(0) as usize,
                atom_indices.get(1).and_then(Value::as_u64).unwrap_or(0) as usize,
                atom_indices.get(2).and_then(Value::as_u64).unwrap_or(0) as usize
            ],
            "value": 0.0,
            "text": text,
            "anchor": anchor,
            "source": source,
        }),
        "dihedral" => json!({
            "type": "Dihedral",
            "id": id,
            "visible": visible,
            "atoms": [
                atom_indices.first().and_then(Value::as_u64).unwrap_or(0) as usize,
                atom_indices.get(1).and_then(Value::as_u64).unwrap_or(0) as usize,
                atom_indices.get(2).and_then(Value::as_u64).unwrap_or(0) as usize,
                atom_indices.get(3).and_then(Value::as_u64).unwrap_or(0) as usize
            ],
            "value": 0.0,
            "text": text,
            "anchor": anchor,
            "source": source,
        }),
        _ => json!({
            "type": "AtomLabel",
            "id": id,
            "visible": visible,
            "atom_id": source.get("atomIndex").and_then(Value::as_u64).unwrap_or(0) as usize,
            "text": text,
            "anchor": anchor,
            "source": source,
        }),
    }
}

fn normalize_presentation_state(value: Value) -> Result<Value, String> {
    if value.get("annotations").is_some()
        || value.get("hidden_atoms").is_some()
        || value.get("styles").is_some()
        || value.get("camera").is_some()
        || value.get("poses").is_some()
    {
        let envelope: PresentationStateEnvelope = serde_json::from_value(value)
            .map_err(|error| format!("Saved presentation state is invalid: {error}"))?;
        return serde_json::to_value(envelope)
            .map_err(|error| format!("Could not normalize presentation state: {error}"));
    }

    let legacy_labels = value
        .get("labels")
        .and_then(Value::as_array)
        .map(|labels| {
            labels
                .iter()
                .map(legacy_label_to_annotation)
                .collect::<Vec<_>>()
        })
        .unwrap_or_default();
    let envelope = json!({
        "version": value.get("version").and_then(Value::as_u64).unwrap_or(1),
        "poses": value_array(value.get("savedPoses")),
        "annotations": legacy_labels,
        "hidden_atoms": value.get("hiddenAtomIndices").cloned().unwrap_or_else(|| json!([])),
        "styles": {
            "hydrogen_visibility": value.get("hydrogenVisibility").cloned(),
            "element_color_overrides": value_object(value.get("elementColorOverrides")),
            "atom_size_scale": value.get("atomSizeScale").cloned(),
            "atom_style_overrides": value_object(value.get("atomStyleOverrides")),
            "bond_style_overrides": value_object(value.get("bondStyleOverrides")),
            "material_preset": value.get("materialPreset").cloned().unwrap_or_else(|| json!("CYLview"))
        },
        "camera": value.get("viewOptions").cloned().unwrap_or(Value::Null)
    });
    let envelope: PresentationStateEnvelope = serde_json::from_value(envelope)
        .map_err(|error| format!("Saved presentation state is invalid: {error}"))?;
    serde_json::to_value(envelope)
        .map_err(|error| format!("Could not normalize presentation state: {error}"))
}

fn read_app_settings_from_path(path: &Path) -> Result<Value, String> {
    if !path.exists() {
        return Ok(default_app_settings());
    }
    let contents = fs::read_to_string(path)
        .map_err(|error| format!("Could not read app settings: {error}"))?;
    let value = serde_json::from_str(&contents)
        .map_err(|error| format!("App settings are invalid JSON: {error}"))?;
    Ok(normalize_app_settings(value))
}

fn write_app_settings_to_path(path: &Path, settings: Value) -> Result<Value, String> {
    let settings = normalize_app_settings(settings);
    let contents = serde_json::to_string_pretty(&settings)
        .map_err(|error| format!("Could not encode app settings: {error}"))?;
    fs::write(path, contents).map_err(|error| format!("Could not save app settings: {error}"))?;
    Ok(settings)
}

fn devtools_menu_enabled(app: &AppHandle) -> bool {
    app_settings_path(app)
        .ok()
        .and_then(|path| read_app_settings_from_path(&path).ok())
        .and_then(|settings| {
            settings
                .get("app")
                .and_then(|app| app.get("devtoolsMenuEnabled"))
                .and_then(Value::as_bool)
        })
        .unwrap_or(true)
}

#[tauri::command]
fn get_app_settings(app: AppHandle) -> Result<Value, String> {
    if benchmark_enabled() {
        return Ok(default_app_settings());
    }
    read_app_settings_from_path(&app_settings_path(&app)?)
}

#[tauri::command]
fn save_app_settings(app: AppHandle, settings: Value) -> Result<Value, String> {
    write_app_settings_to_path(&app_settings_path(&app)?, settings)
}

#[tauri::command]
fn reset_app_settings(app: AppHandle) -> Result<Value, String> {
    write_app_settings_to_path(&app_settings_path(&app)?, default_app_settings())
}

#[tauri::command]
fn get_app_data_paths(app: AppHandle) -> Result<AppDataPaths, String> {
    app_data_paths(&app)
}

#[tauri::command]
fn open_app_data_folder(app: AppHandle) -> Result<(), String> {
    let dir = app_data_dir(&app)?;
    #[cfg(target_os = "windows")]
    let mut command = {
        let mut command = Command::new("explorer");
        command.arg(&dir);
        command
    };
    #[cfg(target_os = "macos")]
    let mut command = {
        let mut command = Command::new("open");
        command.arg(&dir);
        command
    };
    #[cfg(all(unix, not(target_os = "macos")))]
    let mut command = {
        let mut command = Command::new("xdg-open");
        command.arg(&dir);
        command
    };

    command
        .spawn()
        .map_err(|error| format!("Could not open app data folder: {error}"))?;
    Ok(())
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
    let value = serde_json::from_str(&contents)
        .map_err(|error| format!("Saved presentation state is invalid JSON: {error}"))?;
    normalize_presentation_state(value).map(Some)
}

#[tauri::command]
fn save_presentation_state(
    app: AppHandle,
    path: String,
    state: serde_json::Value,
) -> Result<(), String> {
    let state_path = presentation_state_path(&app, &path)?;
    let state = normalize_presentation_state(state)?;
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

#[tauri::command]
fn get_supported_read_extensions() -> Vec<&'static str> {
    supported_read_extensions()
}

fn read_session_tabs(app: &AppHandle) -> Result<SessionTabsEnvelope, String> {
    let path = session_tabs_path(app)?;
    if !path.exists() {
        return Ok(SessionTabsEnvelope::default());
    }
    let contents = fs::read_to_string(path)
        .map_err(|error| format!("Could not read session tabs: {error}"))?;
    let envelope = serde_json::from_str(&contents)
        .map_err(|error| format!("Session tabs are invalid JSON: {error}"))?;
    Ok(normalize_session_tabs(envelope))
}

fn write_session_tabs(app: &AppHandle, envelope: &SessionTabsEnvelope) -> Result<(), String> {
    let path = session_tabs_path(app)?;
    let envelope = normalize_session_tabs(envelope.clone());
    let contents = serde_json::to_string_pretty(&envelope)
        .map_err(|error| format!("Could not encode session tabs: {error}"))?;
    fs::write(path, contents).map_err(|error| format!("Could not save session tabs: {error}"))
}

#[tauri::command]
fn get_session_tabs(app: AppHandle) -> Result<SessionTabsEnvelope, String> {
    read_session_tabs(&app)
}

#[tauri::command]
fn save_session_tabs(app: AppHandle, session: SessionTabsEnvelope) -> Result<(), String> {
    write_session_tabs(&app, &session)
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

fn normalize_recent_files_limit(limit: Option<usize>) -> usize {
    limit.unwrap_or(12).clamp(5, 50)
}

#[tauri::command]
fn get_recent_files(app: AppHandle, limit: Option<usize>) -> Result<Vec<RecentFileEntry>, String> {
    let entries = read_recent_files(&app)?;
    Ok(entries
        .into_iter()
        .filter(|entry| Path::new(&entry.path).is_file())
        .take(normalize_recent_files_limit(limit))
        .collect())
}

#[tauri::command]
fn record_recent_file(app: AppHandle, path: String, limit: Option<usize>) -> Result<(), String> {
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
    entries.truncate(normalize_recent_files_limit(limit));
    write_recent_files(&app, &entries)
}

#[tauri::command]
fn clear_recent_files(app: AppHandle) -> Result<(), String> {
    write_recent_files(&app, &[])
}

#[tauri::command]
fn clear_session_tabs(app: AppHandle) -> Result<SessionTabsEnvelope, String> {
    let session = SessionTabsEnvelope::default();
    write_session_tabs(&app, &session)?;
    Ok(session)
}

fn read_pose_library(app: &AppHandle) -> Result<PoseLibraryEnvelope, String> {
    let path = pose_library_path(app)?;
    if !path.exists() {
        return Ok(PoseLibraryEnvelope::default());
    }
    let contents = fs::read_to_string(path)
        .map_err(|error| format!("Could not read pose library: {error}"))?;
    serde_json::from_str(&contents)
        .map_err(|error| format!("Pose library is invalid JSON: {error}"))
}

fn write_pose_library(app: &AppHandle, library: &PoseLibraryEnvelope) -> Result<(), String> {
    let path = pose_library_path(app)?;
    let contents = serde_json::to_string_pretty(library)
        .map_err(|error| format!("Could not encode pose library: {error}"))?;
    fs::write(path, contents).map_err(|error| format!("Could not save pose library: {error}"))
}

#[tauri::command]
fn get_pose_library(app: AppHandle) -> Result<PoseLibraryEnvelope, String> {
    read_pose_library(&app)
}

#[tauri::command]
#[allow(clippy::too_many_arguments)]
fn save_pose_to_library(
    app: AppHandle,
    name: String,
    molecule_path: String,
    molecule_display_name: String,
    pose: Value,
    tags: Option<Vec<String>>,
    notes: Option<String>,
    atom_count: Option<usize>,
    formula: Option<String>,
    source_format: Option<String>,
    preview_image_path: Option<String>,
) -> Result<PoseLibraryEntry, String> {
    let request = PoseLibrarySaveRequest {
        name,
        molecule_path,
        molecule_display_name,
        pose,
        tags: tags.unwrap_or_default(),
        notes: notes.unwrap_or_default(),
        atom_count,
        formula,
        source_format,
        preview_image_path,
    };
    let library = read_pose_library(&app)?;
    let next = add_pose_library_entry(library, request, now_timestamp());
    let entry = next
        .entries
        .first()
        .cloned()
        .ok_or_else(|| "Could not create pose library entry.".to_string())?;
    write_pose_library(&app, &next)?;
    Ok(entry)
}

#[tauri::command]
fn rename_pose_library_entry(
    app: AppHandle,
    id: String,
    name: String,
) -> Result<PoseLibraryEnvelope, String> {
    let library = read_pose_library(&app)?;
    let next = rename_pose_library_entry_in_envelope(library, &id, name, now_timestamp())?;
    write_pose_library(&app, &next)?;
    Ok(next)
}

#[tauri::command]
fn delete_pose_library_entry(app: AppHandle, id: String) -> Result<PoseLibraryEnvelope, String> {
    let library = read_pose_library(&app)?;
    let preview_reference = library
        .entries
        .iter()
        .find(|entry| entry.id == id)
        .and_then(|entry| entry.preview_image_path.clone());
    let next = delete_pose_library_entry_in_envelope(library, &id)?;
    if let Some(reference) = preview_reference {
        if let Ok(dir) = pose_previews_dir(&app) {
            if let Ok(path) = preview_path_in_dir(&dir, &reference) {
                let _ = fs::remove_file(path);
            }
        }
    }
    write_pose_library(&app, &next)?;
    Ok(next)
}

#[tauri::command]
fn save_pose_library_preview(
    app: AppHandle,
    id: String,
    data_url: String,
) -> Result<PoseLibraryEntry, String> {
    let bytes = decode_png_data_url(&data_url)?;
    let library = read_pose_library(&app)?;
    if !library.entries.iter().any(|entry| entry.id == id) {
        return Err("Pose library entry was not found.".to_string());
    }
    let preview_reference = preview_file_name(&id);
    let preview_path = preview_path_in_dir(&pose_previews_dir(&app)?, &preview_reference)?;
    fs::write(&preview_path, bytes)
        .map_err(|error| format!("Could not save pose preview: {error}"))?;

    let (next, entry) =
        attach_pose_preview_in_envelope(library, &id, preview_reference, now_timestamp())?;
    write_pose_library(&app, &next)?;
    Ok(entry)
}

#[tauri::command]
fn get_pose_preview_data_url(
    app: AppHandle,
    preview_image_path: String,
) -> Result<Option<String>, String> {
    let preview_path = preview_path_in_dir(&pose_previews_dir(&app)?, &preview_image_path)?;
    if !preview_path.exists() {
        return Ok(None);
    }
    let bytes =
        fs::read(preview_path).map_err(|error| format!("Could not read pose preview: {error}"))?;
    Ok(Some(encode_png_data_url(&bytes)))
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

fn menu_event_name(menu_id: &str) -> Option<&'static str> {
    match menu_id {
        MENU_FILE_OPEN => Some(EVENT_MENU_OPEN_FILE),
        MENU_FILE_OPEN_RECENT => Some(EVENT_MENU_OPEN_RECENT),
        MENU_FILE_CLOSE_CURRENT => Some(EVENT_MENU_CLOSE_CURRENT_TAB),
        MENU_FILE_EXPORT_PNG => Some(EVENT_MENU_EXPORT_PNG),
        MENU_FILE_SETTINGS => Some(EVENT_MENU_OPEN_SETTINGS),
        MENU_VIEW_RESET => Some(EVENT_MENU_RESET_VIEW),
        _ => None,
    }
}

fn build_app_menu<R: tauri::Runtime, M: Manager<R>>(manager: &M) -> tauri::Result<Menu<R>> {
    let open_file = MenuItemBuilder::with_id(MENU_FILE_OPEN, "Open File...")
        .accelerator("CommandOrControl+O")
        .build(manager)?;
    let open_recent = MenuItemBuilder::with_id(MENU_FILE_OPEN_RECENT, "Open Recent...")
        .accelerator("CommandOrControl+Shift+O")
        .build(manager)?;
    let close_current = MenuItemBuilder::with_id(MENU_FILE_CLOSE_CURRENT, "Close Current Molecule")
        .accelerator("CommandOrControl+W")
        .build(manager)?;
    let export_png = MenuItemBuilder::with_id(MENU_FILE_EXPORT_PNG, "Export PNG...")
        .accelerator("CommandOrControl+E")
        .build(manager)?;
    let settings = MenuItemBuilder::with_id(MENU_FILE_SETTINGS, "Settings...")
        .accelerator("CommandOrControl+,")
        .build(manager)?;
    let quit = MenuItemBuilder::with_id(MENU_FILE_QUIT, "Quit Cylform")
        .accelerator("CommandOrControl+Q")
        .build(manager)?;
    let reset_view = MenuItemBuilder::with_id(MENU_VIEW_RESET, "Reset View")
        .accelerator("R")
        .build(manager)?;
    let open_devtools = MenuItemBuilder::with_id(MENU_VIEW_OPEN_DEVTOOLS, "Open DevTools")
        .accelerator("CommandOrControl+Shift+I")
        .build(manager)?;

    let about = AboutMetadataBuilder::new()
        .name(Some("Cylform"))
        .version(Some(env!("CARGO_PKG_VERSION")))
        .authors(Some(vec!["Cylform Contributors".to_string()]))
        .comments(Some(
            "Publication-minded molecular viewing for XYZ and PDB structures.",
        ))
        .license(Some("Apache-2.0"))
        .website(Some("https://github.com/Sylverity/Cylform"))
        .website_label(Some("Cylform on GitHub"))
        .build();

    let file_menu = SubmenuBuilder::new(manager, "File")
        .item(&open_file)
        .item(&open_recent)
        .separator()
        .item(&close_current)
        .item(&export_png)
        .separator()
        .item(&settings)
        .separator()
        .item(&quit)
        .build()?;
    let edit_menu = SubmenuBuilder::new(manager, "Edit")
        .undo()
        .redo()
        .separator()
        .cut()
        .copy()
        .paste()
        .select_all()
        .build()?;
    let view_menu = SubmenuBuilder::new(manager, "View")
        .item(&reset_view)
        .fullscreen_with_text("Toggle Full Screen")
        .separator()
        .item(&open_devtools)
        .build()?;
    let window_menu = SubmenuBuilder::new(manager, "Window")
        .minimize()
        .maximize_with_text("Zoom")
        .close_window()
        .separator()
        .show_all_with_text("Bring All to Front")
        .build()?;
    let help_menu = SubmenuBuilder::new(manager, "Help")
        .about_with_text("About Cylform", Some(about))
        .build()?;

    Menu::with_items(
        manager,
        &[&file_menu, &edit_menu, &view_menu, &window_menu, &help_menu],
    )
}

fn handle_app_menu_event(app: &AppHandle, menu_id: &str) {
    if menu_id == MENU_FILE_QUIT {
        app.exit(0);
        return;
    }

    if menu_id == MENU_VIEW_OPEN_DEVTOOLS {
        if !devtools_menu_enabled(app) {
            log::info!("DevTools menu action is disabled in app settings.");
            let _ = app.emit(EVENT_MENU_DEVTOOLS_DISABLED, ());
            return;
        }
        #[cfg(any(debug_assertions, feature = "devtools"))]
        {
            if let Some(window) = app.get_webview_window("main") {
                window.open_devtools();
            } else {
                log::warn!("Could not open DevTools because the main window was not found.");
            }
        }
        #[cfg(not(any(debug_assertions, feature = "devtools")))]
        {
            log::warn!("DevTools are unavailable in this build.");
            let _ = app.emit(EVENT_MENU_DEVTOOLS_UNAVAILABLE, ());
        }
        return;
    }

    if let Some(event_name) = menu_event_name(menu_id) {
        let _ = app.emit(event_name, ());
    }
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
            handle_app_menu_event(app, event.id().as_ref());
        })
        .plugin(tauri_plugin_single_instance::init(|app, _args, _cwd| {
            if let Some(window) = app.get_webview_window("main") {
                let _ = window.unminimize();
                let _ = window.show();
                let _ = window.set_focus();
            }
        }))
        .plugin(tauri_plugin_dialog::init())
        .manage(app_state)
        .invoke_handler(tauri::generate_handler![
            load_molecule,
            get_benchmark_config,
            write_benchmark_result,
            get_startup_file,
            get_app_settings,
            save_app_settings,
            reset_app_settings,
            get_app_data_paths,
            open_app_data_folder,
            load_presentation_state,
            save_presentation_state,
            clear_presentation_state,
            get_supported_read_extensions,
            get_session_tabs,
            save_session_tabs,
            get_recent_files,
            record_recent_file,
            clear_recent_files,
            clear_session_tabs,
            get_pose_library,
            save_pose_to_library,
            save_pose_library_preview,
            get_pose_preview_data_url,
            delete_pose_library_entry,
            rename_pose_library_entry,
            list_supported_files_near,
            export_png
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
                .maximized(true)
                .build()?;

            Ok(())
        })
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}

#[cfg(test)]
mod tests {
    use super::*;
    use cylform_core::io::IoError;

    #[test]
    fn test_path_key_consistency() {
        let key1 = path_key("/home/user/mol.xyz");
        let key2 = path_key("/home/user/mol.xyz");
        assert_eq!(key1, key2);
        assert_eq!(key1.len(), 16);
    }

    #[test]
    fn test_menu_event_name_maps_frontend_actions() {
        assert_eq!(menu_event_name(MENU_FILE_OPEN), Some(EVENT_MENU_OPEN_FILE));
        assert_eq!(
            menu_event_name(MENU_FILE_OPEN_RECENT),
            Some(EVENT_MENU_OPEN_RECENT)
        );
        assert_eq!(
            menu_event_name(MENU_FILE_CLOSE_CURRENT),
            Some(EVENT_MENU_CLOSE_CURRENT_TAB)
        );
        assert_eq!(
            menu_event_name(MENU_FILE_EXPORT_PNG),
            Some(EVENT_MENU_EXPORT_PNG)
        );
        assert_eq!(
            menu_event_name(MENU_FILE_SETTINGS),
            Some(EVENT_MENU_OPEN_SETTINGS)
        );
        assert_eq!(
            menu_event_name(MENU_VIEW_RESET),
            Some(EVENT_MENU_RESET_VIEW)
        );
        assert_eq!(menu_event_name(MENU_FILE_QUIT), None);
        assert_eq!(menu_event_name(MENU_VIEW_OPEN_DEVTOOLS), None);
        assert_eq!(menu_event_name("unknown"), None);
    }

    #[test]
    fn test_app_settings_defaults_and_normalization() {
        let normalized = normalize_app_settings(json!({
            "version": 99,
            "rendering": {
                "pngExportScale": 3,
                "defaultBackground": "transparent",
                "customBackgroundHex": "not-a-color",
                "defaultMaterialPreset": "last-used",
                "showFloorGridByDefault": true
            },
            "chemistry": {
                "defaultHydrogenVisibility": "hidden",
                "distancePrecision": 99,
                "anglePrecision": 0,
                "bondPerceptionTolerance": 2.0
            },
            "interaction": {
                "mouseMode": "one-button",
                "invertScrollZoom": true,
                "keyboardShortcuts": { "openFile": "Ctrl+O" }
            },
            "files": {
                "autosavePresentationState": false,
                "recentFilesLimit": 500
            },
            "app": {
                "autoCheckForUpdates": true
            }
        }));

        assert_eq!(normalized["version"], json!(1));
        assert_eq!(normalized["rendering"]["pngExportScale"], json!(2));
        assert_eq!(normalized["rendering"]["defaultBackground"], json!("white"));
        assert_eq!(
            normalized["rendering"]["customBackgroundHex"],
            json!("#ffffff")
        );
        assert_eq!(
            normalized["rendering"]["defaultMaterialPreset"],
            json!("CYLview")
        );
        assert_eq!(
            normalized["rendering"]["showFloorGridByDefault"],
            json!(true)
        );
        assert_eq!(
            normalized["chemistry"]["defaultHydrogenVisibility"],
            json!("hidden")
        );
        assert_eq!(normalized["chemistry"]["distancePrecision"], json!(4));
        assert_eq!(normalized["chemistry"]["anglePrecision"], json!(1));
        assert_eq!(
            normalized["chemistry"]["bondPerceptionTolerance"],
            json!(1.5)
        );
        assert_eq!(normalized["interaction"]["mouseMode"], json!("one-button"));
        assert_eq!(normalized["interaction"]["invertScrollZoom"], json!(true));
        assert_eq!(
            normalized["interaction"]["keyboardShortcuts"]["openFile"],
            json!("Ctrl+O")
        );
        assert_eq!(
            normalized["files"]["autosavePresentationState"],
            json!(false)
        );
        assert_eq!(normalized["files"]["recentFilesLimit"], json!(50));
        assert_eq!(normalized["app"]["autoCheckForUpdates"], json!(true));
        assert_eq!(normalized["app"]["devtoolsMenuEnabled"], json!(true));
    }

    #[test]
    fn test_app_settings_round_trip_and_reset_helpers() {
        let path =
            std::env::temp_dir().join(format!("cylform-settings-test-{}.json", now_timestamp()));

        let default_settings = read_app_settings_from_path(&path).unwrap();
        assert_eq!(default_settings, default_app_settings());

        let saved = write_app_settings_to_path(
            &path,
            json!({
                "rendering": { "pngExportScale": 4, "customBackgroundHex": "#ABCDEF" },
                "files": { "recentFilesLimit": 8 }
            }),
        )
        .unwrap();
        assert_eq!(saved["rendering"]["pngExportScale"], json!(4));
        assert_eq!(saved["rendering"]["customBackgroundHex"], json!("#abcdef"));
        assert_eq!(saved["files"]["recentFilesLimit"], json!(8));

        let round_tripped = read_app_settings_from_path(&path).unwrap();
        assert_eq!(round_tripped, saved);

        let reset = write_app_settings_to_path(&path, default_app_settings()).unwrap();
        assert_eq!(reset, default_app_settings());

        let _ = fs::remove_file(path);
    }

    #[test]
    fn test_path_key_uniqueness() {
        let key1 = path_key("/home/user/mol1.xyz");
        let key2 = path_key("/home/user/mol2.xyz");
        assert_ne!(key1, key2);
    }

    #[test]
    fn test_session_tabs_normalizes_active_tab() {
        let normalized = normalize_session_tabs(SessionTabsEnvelope {
            version: 99,
            active_tab_id: Some("missing".to_string()),
            tabs: vec![SessionTabRecord {
                id: "tab-1".to_string(),
                path: "/home/user/mol.xyz".to_string(),
                display_name: "mol.xyz".to_string(),
                last_opened_at: "123".to_string(),
            }],
        });

        assert_eq!(normalized.version, 1);
        assert_eq!(normalized.active_tab_id.as_deref(), Some("tab-1"));
        assert_eq!(normalized.tabs.len(), 1);
    }

    #[test]
    fn test_pose_library_default_is_empty() {
        let library = PoseLibraryEnvelope::default();

        assert_eq!(library.version, 1);
        assert!(library.entries.is_empty());
    }

    #[test]
    fn test_add_pose_library_entry_sets_metadata_and_preserves_pose() {
        let library = add_pose_library_entry(
            PoseLibraryEnvelope::default(),
            PoseLibrarySaveRequest {
                name: "Final oblique view".to_string(),
                molecule_path: "/home/user/mol.xyz".to_string(),
                molecule_display_name: "mol.xyz".to_string(),
                pose: json!({ "id": "pose-1", "name": "Pose 1" }),
                tags: vec!["figure".to_string()],
                notes: "paper".to_string(),
                atom_count: Some(123),
                formula: None,
                source_format: Some("xyz".to_string()),
                preview_image_path: None,
            },
            "12345".to_string(),
        );

        let entry = &library.entries[0];
        assert!(entry.id.starts_with("pose_lib_"));
        assert_eq!(entry.name, "Final oblique view");
        assert_eq!(entry.molecule_hash, path_key("/home/user/mol.xyz"));
        assert_eq!(entry.created_at, "12345");
        assert_eq!(entry.updated_at, "12345");
        assert_eq!(entry.pose["id"], json!("pose-1"));
        assert_eq!(entry.atom_count, Some(123));
        assert_eq!(entry.source_format.as_deref(), Some("xyz"));
    }

    #[test]
    fn test_decode_png_data_url_accepts_base64_png() {
        let bytes = decode_png_data_url("data:image/png;base64,aGVsbG8=").unwrap();

        assert_eq!(bytes, b"hello");
    }

    #[test]
    fn test_export_png_to_path_validates_png_data_and_extension() {
        let path = std::env::temp_dir().join(format!("cylform-test-{}.png", now_timestamp()));
        let mut png = b"\x89PNG\r\n\x1a\n".to_vec();
        png.extend_from_slice(b"test");

        export_png_to_path(&path, &png).unwrap();
        assert_eq!(fs::read(&path).unwrap(), png);
        fs::remove_file(&path).unwrap();

        assert!(export_png_to_path(&path.with_extension("txt"), b"\x89PNG\r\n\x1a\ntest").is_err());
        assert!(export_png_to_path(&path, b"not png").is_err());
    }

    #[test]
    fn test_preview_file_name_sanitizes_entry_id() {
        assert_eq!(preview_file_name("../bad/pose"), "badpose.png");
        assert_eq!(
            preview_file_name("pose_lib_123-abc"),
            "pose_lib_123-abc.png"
        );
    }

    #[test]
    fn test_preview_path_in_dir_rejects_traversal() {
        let dir = Path::new("/tmp/PosePreviews");

        assert!(preview_path_in_dir(dir, "pose.png")
            .unwrap()
            .starts_with(dir));
        assert!(preview_path_in_dir(dir, "../pose.png").is_err());
        assert!(preview_path_in_dir(dir, "/tmp/pose.png").is_err());
        assert!(preview_path_in_dir(dir, "pose.jpg").is_err());
    }

    #[test]
    fn test_attach_pose_preview_updates_entry() {
        let library = add_pose_library_entry(
            PoseLibraryEnvelope::default(),
            PoseLibrarySaveRequest {
                name: "Original".to_string(),
                molecule_path: "/home/user/mol.xyz".to_string(),
                molecule_display_name: "mol.xyz".to_string(),
                pose: json!({ "id": "pose-1" }),
                tags: Vec::new(),
                notes: String::new(),
                atom_count: None,
                formula: None,
                source_format: None,
                preview_image_path: None,
            },
            "12345".to_string(),
        );
        let id = library.entries[0].id.clone();

        let (library, entry) = attach_pose_preview_in_envelope(
            library,
            &id,
            "/tmp/preview.png".to_string(),
            "67890".to_string(),
        )
        .unwrap();

        assert_eq!(
            entry.preview_image_path.as_deref(),
            Some("/tmp/preview.png")
        );
        assert_eq!(entry.updated_at, "67890");
        assert_eq!(
            library.entries[0].preview_image_path.as_deref(),
            Some("/tmp/preview.png")
        );
    }

    #[test]
    fn test_rename_and_delete_pose_library_entry_target_one_entry() {
        let library = add_pose_library_entry(
            PoseLibraryEnvelope::default(),
            PoseLibrarySaveRequest {
                name: "Original".to_string(),
                molecule_path: "/home/user/mol.xyz".to_string(),
                molecule_display_name: "mol.xyz".to_string(),
                pose: json!({ "id": "pose-1" }),
                tags: Vec::new(),
                notes: String::new(),
                atom_count: None,
                formula: None,
                source_format: None,
                preview_image_path: None,
            },
            "12345".to_string(),
        );
        let id = library.entries[0].id.clone();

        let renamed = rename_pose_library_entry_in_envelope(
            library,
            &id,
            "Renamed".to_string(),
            "67890".to_string(),
        )
        .unwrap();
        assert_eq!(renamed.entries[0].name, "Renamed");
        assert_eq!(renamed.entries[0].updated_at, "67890");

        let deleted = delete_pose_library_entry_in_envelope(renamed, &id).unwrap();
        assert!(deleted.entries.is_empty());
    }

    #[test]
    fn test_presentation_state_defaults() {
        let normalized = normalize_presentation_state(json!({})).unwrap();

        assert_eq!(normalized["version"], json!(1));
        assert_eq!(normalized["poses"], json!([]));
        assert_eq!(normalized["annotations"], json!([]));
        assert_eq!(normalized["hidden_atoms"], json!([]));
        assert_eq!(normalized["styles"]["element_color_overrides"], json!({}));
        assert_eq!(
            normalized["styles"]["material_preset"],
            json!("CYLview")
        );
    }

    #[test]
    fn test_legacy_presentation_state_normalizes_to_envelope() {
        let normalized = normalize_presentation_state(json!({
            "version": 1,
            "labels": [{
                "id": "label-1",
                "type": "distance",
                "text": "C-O 1.20 A",
                "visible": true,
                "anchor": { "x": 0.0, "y": 0.0, "z": 0.0 },
                "source": { "atomIndices": [0, 1], "bond": [0, 1] }
            }],
            "hiddenAtomIndices": [3, 5],
            "hydrogenVisibility": "hide-c-h",
            "elementColorOverrides": { "C": "#ffffff" },
            "atomSizeScale": 1.25,
            "atomStyleOverrides": {},
            "bondStyleOverrides": {},
            "materialPreset": "Houkmol",
            "viewOptions": { "projection": "orthographic" },
            "savedPoses": [{ "id": "pose-1" }]
        }))
        .unwrap();

        assert_eq!(normalized["annotations"][0]["type"], json!("Distance"));
        assert_eq!(normalized["annotations"][0]["atoms"], json!([0, 1]));
        assert_eq!(normalized["hidden_atoms"], json!([3, 5]));
        assert_eq!(
            normalized["styles"]["hydrogen_visibility"],
            json!("hide-c-h")
        );
        assert_eq!(normalized["styles"]["material_preset"], json!("Houkmol"));
        assert_eq!(normalized["camera"]["projection"], json!("orthographic"));
        assert_eq!(normalized["poses"][0]["id"], json!("pose-1"));
    }

    #[test]
    fn test_annotation_variants_deserialize() {
        let annotations = vec![
            json!({ "type": "AtomLabel", "atom_id": 1, "text": "C2" }),
            json!({ "type": "Distance", "atoms": [0, 1], "value": 1.2, "text": "C-O" }),
            json!({ "type": "Angle", "atoms": [0, 1, 2], "value": 109.5, "text": "angle" }),
            json!({ "type": "Dihedral", "atoms": [0, 1, 2, 3], "value": 180.0, "text": "dihedral" }),
        ];
        let value = json!({
            "version": 1,
            "annotations": annotations
        });

        let envelope: PresentationStateEnvelope = serde_json::from_value(value).unwrap();

        assert_eq!(envelope.annotations.len(), 4);
    }

    #[test]
    fn test_format_load_error_not_found() {
        let err = CoreError::Io(IoError::NotFound("test.xyz".into()));
        let msg = format_load_error(err);
        assert!(msg.contains("not found"));
    }

    #[test]
    fn test_format_load_error_unsupported_format() {
        let err = CoreError::Io(IoError::UnsupportedFormat("SDF".into()));
        let msg = format_load_error(err);
        assert!(msg.contains("SDF"));
    }

    #[test]
    fn test_format_load_error_file_too_large() {
        let err = CoreError::Io(IoError::FileTooLarge {
            size_mb: 150.0,
            limit_mb: 100.0,
        });
        let msg = format_load_error(err);
        assert!(msg.contains("too large"));
        assert!(msg.contains("150.0"));
    }

    #[test]
    fn test_app_state_stores_structure() {
        let state = AppState::new();
        assert!(state.structure.lock().is_none());

        let structure = Structure::new("test");
        *state.structure.lock() = Some(structure);

        assert!(state.structure.lock().is_some());
        assert_eq!(state.structure.lock().as_ref().unwrap().name(), "test");
    }
}
