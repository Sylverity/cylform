use cylform_core::io::{read_structure_with_options, write_xyz_frame, FileFormat};
use serde::Serialize;
use serde_json::Value;
use std::fs;
use std::path::{Path, PathBuf};
use tauri::AppHandle;

use crate::molecule_commands::{format_load_error, read_options_from_env};

#[derive(Serialize)]
pub(crate) struct BenchmarkConfig {
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

pub(crate) fn export_xyz_frame_to_path(path: &Path, source_path: &str, frame_index: usize) -> Result<(), String> {
    if path
        .extension()
        .and_then(|extension| extension.to_str())
        .map(|extension| extension.eq_ignore_ascii_case("xyz"))
        != Some(true)
    {
        return Err("XYZ export path must end with .xyz.".to_string());
    }
    if path.exists() && !path.is_file() {
        return Err("XYZ export path is not a file.".to_string());
    }
    if let Some(parent) = path.parent() {
        if !parent.exists() {
            return Err("XYZ export directory does not exist.".to_string());
        }
    }

    let structure = read_structure_with_options(source_path, FileFormat::Auto, read_options_from_env())
        .map_err(format_load_error)?;
    write_xyz_frame(path, &structure, frame_index)
        .map_err(|error| format!("Could not export XYZ frame: {error}"))
}

#[tauri::command]
pub(crate) fn export_xyz_frame(path: String, source_path: String, frame_index: usize) -> Result<(), String> {
    export_xyz_frame_to_path(Path::new(&path), &source_path, frame_index)
}

pub(crate) fn benchmark_enabled() -> bool {
    std::env::var("CYLFORM_BENCHMARK")
        .map(|value| matches!(value.as_str(), "1" | "true" | "TRUE" | "yes" | "YES"))
        .unwrap_or(false)
}

#[tauri::command]
pub(crate) fn get_benchmark_config() -> BenchmarkConfig {
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
pub(crate) fn write_benchmark_result(
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

pub(crate) fn export_png_to_path(path: &Path, bytes: &[u8]) -> Result<(), String> {
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
pub(crate) fn export_png(path: String, bytes: Vec<u8>) -> Result<(), String> {
    export_png_to_path(Path::new(&path), &bytes)
}

pub(crate) fn export_text_sidecar_to_path(path: &Path, contents: &str) -> Result<(), String> {
    if contents.trim().is_empty() {
        return Err("Metadata sidecar was empty.".to_string());
    }
    if serde_json::from_str::<Value>(contents).is_err() {
        return Err("Metadata sidecar must be valid JSON.".to_string());
    }
    if path
        .extension()
        .and_then(|extension| extension.to_str())
        .map(|extension| extension.eq_ignore_ascii_case("json"))
        != Some(true)
    {
        return Err("Metadata sidecar path must end with .json.".to_string());
    }
    if path.exists() && !path.is_file() {
        return Err("Metadata sidecar path is not a file.".to_string());
    }
    if let Some(parent) = path.parent() {
        if !parent.exists() {
            return Err("Metadata sidecar directory does not exist.".to_string());
        }
    }

    fs::write(path, contents).map_err(|error| format!("Could not export metadata sidecar: {error}"))
}

#[tauri::command]
pub(crate) fn export_text_sidecar(path: String, contents: String) -> Result<(), String> {
    export_text_sidecar_to_path(Path::new(&path), &contents)
}
