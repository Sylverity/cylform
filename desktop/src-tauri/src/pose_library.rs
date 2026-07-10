use base64::{engine::general_purpose, Engine as _};
use serde::{Deserialize, Serialize};
use serde_json::Value;
use std::fs;
use std::path::{Path, PathBuf};
use tauri::AppHandle;

use crate::workspace::{now_timestamp, path_key, pose_library_path, pose_previews_dir};

pub(crate) fn pose_library_version() -> u32 {
    1
}

#[derive(Debug, Clone, Deserialize, Serialize, PartialEq)]
pub(crate) struct PoseLibraryEntry {
    pub(crate) id: String,
    pub(crate) name: String,
    #[serde(rename = "moleculePath")]
    pub(crate) molecule_path: String,
    #[serde(rename = "moleculeDisplayName")]
    pub(crate) molecule_display_name: String,
    #[serde(rename = "moleculeHash")]
    pub(crate) molecule_hash: String,
    pub(crate) pose: Value,
    #[serde(rename = "previewImagePath")]
    pub(crate) preview_image_path: Option<String>,
    #[serde(rename = "createdAt")]
    pub(crate) created_at: String,
    #[serde(rename = "updatedAt")]
    pub(crate) updated_at: String,
    #[serde(default)]
    pub(crate) tags: Vec<String>,
    #[serde(default)]
    pub(crate) notes: String,
    #[serde(rename = "atomCount")]
    pub(crate) atom_count: Option<usize>,
    pub(crate) formula: Option<String>,
    #[serde(rename = "sourceFormat")]
    pub(crate) source_format: Option<String>,
}

#[derive(Debug, Clone, Deserialize, Serialize, PartialEq)]
pub(crate) struct PoseLibraryEnvelope {
    #[serde(default = "pose_library_version")]
    pub(crate) version: u32,
    #[serde(default)]
    pub(crate) entries: Vec<PoseLibraryEntry>,
}

impl Default for PoseLibraryEnvelope {
    fn default() -> Self {
        Self {
            version: pose_library_version(),
            entries: Vec::new(),
        }
    }
}

pub(crate) struct PoseLibrarySaveRequest {
    pub(crate) name: String,
    pub(crate) molecule_path: String,
    pub(crate) molecule_display_name: String,
    pub(crate) pose: Value,
    pub(crate) tags: Vec<String>,
    pub(crate) notes: String,
    pub(crate) atom_count: Option<usize>,
    pub(crate) formula: Option<String>,
    pub(crate) source_format: Option<String>,
    pub(crate) preview_image_path: Option<String>,
}

pub(crate) fn add_pose_library_entry(
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

pub(crate) fn rename_pose_library_entry_in_envelope(
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

pub(crate) fn delete_pose_library_entry_in_envelope(
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

pub(crate) fn attach_pose_preview_in_envelope(
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

pub(crate) fn preview_file_name(id: &str) -> String {
    let safe_id = id
        .chars()
        .filter(|character| character.is_ascii_alphanumeric() || matches!(character, '_' | '-'))
        .collect::<String>();
    format!("{}.png", if safe_id.is_empty() { "pose" } else { &safe_id })
}

pub(crate) fn preview_path_in_dir(dir: &Path, reference: &str) -> Result<PathBuf, String> {
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

pub(crate) fn decode_png_data_url(data_url: &str) -> Result<Vec<u8>, String> {
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

pub(crate) fn encode_png_data_url(bytes: &[u8]) -> String {
    format!(
        "data:image/png;base64,{}",
        general_purpose::STANDARD.encode(bytes)
    )
}

pub(crate) fn read_pose_library(app: &AppHandle) -> Result<PoseLibraryEnvelope, String> {
    let path = pose_library_path(app)?;
    if !path.exists() {
        return Ok(PoseLibraryEnvelope::default());
    }
    let contents = fs::read_to_string(path)
        .map_err(|error| format!("Could not read pose library: {error}"))?;
    serde_json::from_str(&contents)
        .map_err(|error| format!("Pose library is invalid JSON: {error}"))
}

pub(crate) fn write_pose_library(
    app: &AppHandle,
    library: &PoseLibraryEnvelope,
) -> Result<(), String> {
    let path = pose_library_path(app)?;
    let contents = serde_json::to_string_pretty(library)
        .map_err(|error| format!("Could not encode pose library: {error}"))?;
    fs::write(path, contents).map_err(|error| format!("Could not save pose library: {error}"))
}

#[tauri::command]
pub(crate) fn get_pose_library(app: AppHandle) -> Result<PoseLibraryEnvelope, String> {
    read_pose_library(&app)
}

#[tauri::command]
#[allow(clippy::too_many_arguments)]
pub(crate) fn save_pose_to_library(
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
pub(crate) fn rename_pose_library_entry(
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
pub(crate) fn delete_pose_library_entry(
    app: AppHandle,
    id: String,
) -> Result<PoseLibraryEnvelope, String> {
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
pub(crate) fn save_pose_library_preview(
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
pub(crate) fn get_pose_preview_data_url(
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
