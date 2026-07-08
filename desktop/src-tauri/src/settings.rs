use serde_json::{json, Value};
use std::fs;
use std::path::Path;
use tauri::AppHandle;

use crate::exports::benchmark_enabled;
use crate::presentation_state::{normalize_render_profile_str, render_profile_to_material_preset};
use crate::workspace::app_settings_path;

pub(crate) fn app_settings_version() -> u32 {
    1
}

pub(crate) fn setting_section<'a>(value: &'a Value, key: &str) -> Option<&'a serde_json::Map<String, Value>> {
    value.get(key).and_then(Value::as_object)
}

pub(crate) fn setting_bool(
    section: Option<&serde_json::Map<String, Value>>,
    key: &str,
    default: bool,
) -> bool {
    section
        .and_then(|object| object.get(key))
        .and_then(Value::as_bool)
        .unwrap_or(default)
}

pub(crate) fn setting_string(
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

pub(crate) fn setting_u8_range(
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

pub(crate) fn setting_f64_range(
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

pub(crate) fn setting_object(section: Option<&serde_json::Map<String, Value>>, key: &str) -> Value {
    section
        .and_then(|object| object.get(key))
        .and_then(Value::as_object)
        .map(|object| Value::Object(object.clone()))
        .unwrap_or_else(|| json!({}))
}

pub(crate) fn normalize_hex_color(value: Option<&Value>, default: &str) -> String {
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

pub(crate) fn default_app_settings() -> Value {
    normalize_app_settings(json!({}))
}

pub(crate) fn normalize_app_settings(value: Value) -> Value {
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
    let default_render_profile = normalize_render_profile_str(
        rendering
            .and_then(|section| section.get("defaultRenderProfile"))
            .and_then(Value::as_str)
            .or_else(|| {
                rendering
                    .and_then(|section| section.get("defaultMaterialPreset"))
                    .and_then(Value::as_str)
            }),
        "cylview",
    );

    json!({
        "version": app_settings_version(),
        "rendering": {
            "pngExportScale": png_export_scale,
            "defaultBackground": setting_string(rendering, "defaultBackground", "white", &["white", "black", "custom"]),
            "customBackgroundHex": normalize_hex_color(rendering.and_then(|section| section.get("customBackgroundHex")), "#ffffff"),
            "defaultRenderProfile": default_render_profile.clone(),
            "defaultMaterialPreset": render_profile_to_material_preset(&default_render_profile),
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

pub(crate) fn read_app_settings_from_path(path: &Path) -> Result<Value, String> {
    if !path.exists() {
        return Ok(default_app_settings());
    }
    let contents = fs::read_to_string(path)
        .map_err(|error| format!("Could not read app settings: {error}"))?;
    let value = serde_json::from_str(&contents)
        .map_err(|error| format!("App settings are invalid JSON: {error}"))?;
    Ok(normalize_app_settings(value))
}

pub(crate) fn write_app_settings_to_path(path: &Path, settings: Value) -> Result<Value, String> {
    let settings = normalize_app_settings(settings);
    let contents = serde_json::to_string_pretty(&settings)
        .map_err(|error| format!("Could not encode app settings: {error}"))?;
    fs::write(path, contents).map_err(|error| format!("Could not save app settings: {error}"))?;
    Ok(settings)
}

pub(crate) fn devtools_menu_enabled(app: &AppHandle) -> bool {
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
pub(crate) fn get_app_settings(app: AppHandle) -> Result<Value, String> {
    if benchmark_enabled() {
        return Ok(default_app_settings());
    }
    read_app_settings_from_path(&app_settings_path(&app)?)
}

#[tauri::command]
pub(crate) fn save_app_settings(app: AppHandle, settings: Value) -> Result<Value, String> {
    write_app_settings_to_path(&app_settings_path(&app)?, settings)
}

#[tauri::command]
pub(crate) fn reset_app_settings(app: AppHandle) -> Result<Value, String> {
    write_app_settings_to_path(&app_settings_path(&app)?, default_app_settings())
}
