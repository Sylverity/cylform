use serde::{Deserialize, Serialize};
use std::fs;
use std::path::{Path, PathBuf};
use std::process::Command;
use std::time::{SystemTime, UNIX_EPOCH};
use tauri::{AppHandle, Manager};

#[derive(Deserialize, Serialize, Clone, Default)]
pub(crate) struct RecentFileEntry {
    path: String,
    name: String,
}

#[derive(Debug, Clone, Serialize)]
pub(crate) struct AppDataPaths {
    root: String,
    settings: String,
    session_tabs: String,
    recent_files: String,
    saved_info: String,
    pose_library: String,
    pose_previews: String,
}

pub(crate) fn session_tabs_version() -> u32 {
    1
}

#[derive(Debug, Clone, Deserialize, Serialize, PartialEq, Eq)]
pub(crate) struct SessionTabRecord {
    pub(crate) id: String,
    pub(crate) path: String,
    #[serde(rename = "displayName")]
    pub(crate) display_name: String,
    #[serde(rename = "lastOpenedAt")]
    pub(crate) last_opened_at: String,
}

#[derive(Debug, Clone, Deserialize, Serialize, PartialEq, Eq)]
pub(crate) struct SessionTabsEnvelope {
    #[serde(default = "session_tabs_version")]
    pub(crate) version: u32,
    #[serde(rename = "activeTabId", default)]
    pub(crate) active_tab_id: Option<String>,
    #[serde(default)]
    pub(crate) tabs: Vec<SessionTabRecord>,
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

pub(crate) fn app_data_dir(app: &AppHandle) -> Result<PathBuf, String> {
    let dir = app
        .path()
        .app_data_dir()
        .map_err(|error| format!("Could not locate app data directory: {error}"))?;
    fs::create_dir_all(&dir)
        .map_err(|error| format!("Could not create app data directory: {error}"))?;
    Ok(dir)
}

pub(crate) fn presentation_dir(app: &AppHandle) -> Result<PathBuf, String> {
    let dir = app_data_dir(app)?.join("SavedInfo");
    fs::create_dir_all(&dir)
        .map_err(|error| format!("Could not create presentation-state directory: {error}"))?;
    Ok(dir)
}

pub(crate) fn path_key(path: &str) -> String {
    let mut hash: u64 = 0xcbf29ce484222325;
    for byte in path.as_bytes() {
        hash ^= u64::from(*byte);
        hash = hash.wrapping_mul(0x100000001b3);
    }
    format!("{hash:016x}")
}

pub(crate) fn presentation_state_path(app: &AppHandle, path: &str) -> Result<PathBuf, String> {
    Ok(presentation_dir(app)?.join(format!("{}.json", path_key(path))))
}

pub(crate) fn session_tabs_path(app: &AppHandle) -> Result<PathBuf, String> {
    Ok(app_data_dir(app)?.join("session-tabs.json"))
}

pub(crate) fn app_settings_path(app: &AppHandle) -> Result<PathBuf, String> {
    Ok(app_data_dir(app)?.join("settings.json"))
}

pub(crate) fn pose_library_path(app: &AppHandle) -> Result<PathBuf, String> {
    Ok(app_data_dir(app)?.join("pose-library.json"))
}

pub(crate) fn pose_previews_dir(app: &AppHandle) -> Result<PathBuf, String> {
    let dir = app_data_dir(app)?.join("PosePreviews");
    fs::create_dir_all(&dir)
        .map_err(|error| format!("Could not create pose-preview directory: {error}"))?;
    Ok(dir)
}

pub(crate) fn app_data_paths(app: &AppHandle) -> Result<AppDataPaths, String> {
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

pub(crate) fn now_timestamp() -> String {
    let millis = SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .map(|duration| duration.as_millis())
        .unwrap_or(0);
    format!("{millis}")
}

pub(crate) fn normalize_session_tabs(mut envelope: SessionTabsEnvelope) -> SessionTabsEnvelope {
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

#[tauri::command]
pub(crate) fn get_app_data_paths(app: AppHandle) -> Result<AppDataPaths, String> {
    app_data_paths(&app)
}

#[tauri::command]
pub(crate) fn open_app_data_folder(app: AppHandle) -> Result<(), String> {
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

pub(crate) fn read_session_tabs(app: &AppHandle) -> Result<SessionTabsEnvelope, String> {
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

pub(crate) fn write_session_tabs(app: &AppHandle, envelope: &SessionTabsEnvelope) -> Result<(), String> {
    let path = session_tabs_path(app)?;
    let envelope = normalize_session_tabs(envelope.clone());
    let contents = serde_json::to_string_pretty(&envelope)
        .map_err(|error| format!("Could not encode session tabs: {error}"))?;
    fs::write(path, contents).map_err(|error| format!("Could not save session tabs: {error}"))
}

#[tauri::command]
pub(crate) fn get_session_tabs(app: AppHandle) -> Result<SessionTabsEnvelope, String> {
    read_session_tabs(&app)
}

#[tauri::command]
pub(crate) fn save_session_tabs(app: AppHandle, session: SessionTabsEnvelope) -> Result<(), String> {
    write_session_tabs(&app, &session)
}

pub(crate) fn recent_files_path(app: &AppHandle) -> Result<PathBuf, String> {
    Ok(app_data_dir(app)?.join("recent-files.json"))
}

pub(crate) fn read_recent_files(app: &AppHandle) -> Result<Vec<RecentFileEntry>, String> {
    let path = recent_files_path(app)?;
    if !path.exists() {
        return Ok(Vec::new());
    }
    let contents = fs::read_to_string(path)
        .map_err(|error| format!("Could not read recent files: {error}"))?;
    serde_json::from_str(&contents)
        .map_err(|error| format!("Recent files are invalid JSON: {error}"))
}

pub(crate) fn write_recent_files(app: &AppHandle, entries: &[RecentFileEntry]) -> Result<(), String> {
    let path = recent_files_path(app)?;
    let contents = serde_json::to_string_pretty(entries)
        .map_err(|error| format!("Could not encode recent files: {error}"))?;
    fs::write(path, contents).map_err(|error| format!("Could not save recent files: {error}"))
}

pub(crate) fn normalize_recent_files_limit(limit: Option<usize>) -> usize {
    limit.unwrap_or(12).clamp(5, 50)
}

#[tauri::command]
pub(crate) fn get_recent_files(app: AppHandle, limit: Option<usize>) -> Result<Vec<RecentFileEntry>, String> {
    let entries = read_recent_files(&app)?;
    Ok(entries
        .into_iter()
        .filter(|entry| Path::new(&entry.path).is_file())
        .take(normalize_recent_files_limit(limit))
        .collect())
}

#[tauri::command]
pub(crate) fn record_recent_file(app: AppHandle, path: String, limit: Option<usize>) -> Result<(), String> {
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
pub(crate) fn clear_recent_files(app: AppHandle) -> Result<(), String> {
    write_recent_files(&app, &[])
}

#[tauri::command]
pub(crate) fn clear_session_tabs(app: AppHandle) -> Result<SessionTabsEnvelope, String> {
    let session = SessionTabsEnvelope::default();
    write_session_tabs(&app, &session)?;
    Ok(session)
}
