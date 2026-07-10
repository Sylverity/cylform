use serde::{Deserialize, Serialize};
use serde_json::{json, Value};
use std::fs;
use tauri::AppHandle;

use crate::workspace::presentation_state_path;

pub(crate) fn presentation_state_version() -> u32 {
    1
}

pub(crate) fn default_material_preset() -> String {
    "CYLviewLegacy".to_string()
}

pub(crate) fn default_render_profile() -> String {
    "cylview".to_string()
}

pub(crate) fn normalize_render_profile_str(candidate: Option<&str>, fallback: &str) -> String {
    match candidate {
        Some("cylview") | Some("CYLviewLegacy") => "cylview".to_string(),
        Some("ball-stick") | Some("CYLview") => "ball-stick".to_string(),
        Some("houkmol") | Some("Houkmol") => "houkmol".to_string(),
        _ => fallback.to_string(),
    }
}

pub(crate) fn render_profile_to_material_preset(profile: &str) -> String {
    match profile {
        "ball-stick" => "CYLview".to_string(),
        "houkmol" => "Houkmol".to_string(),
        _ => "CYLviewLegacy".to_string(),
    }
}

pub(crate) fn default_presentation_camera(render_profile: &str) -> Value {
    let cylview = render_profile == "cylview";
    let houkmol = render_profile == "houkmol";
    json!({
        "showFloor": false,
        "showGrid": false,
        "backdropTone": "clean",
        "customBackdropHex": "#ffffff",
        "projection": "perspective",
        "lightingMood": "publication",
        "fogEnabled": cylview,
        "fogIntensity": if cylview { 0.55 } else { 0.45 },
        "fogDepth": if cylview { 0.58 } else { 0.5 },
        "focalBlurEnabled": false,
        "focalBlurAmount": 0.32,
        "focalDepth": 0.5,
        "autoRotate": false,
        "autoRotateSpeed": 0.35,
        "labelFontScale": 1.0,
        "bondSizeScale": 1.0,
        "showLabelLinkLines": houkmol
    })
}

pub(crate) fn normalize_presentation_camera(camera: Value, render_profile: &str) -> Value {
    let mut normalized = default_presentation_camera(render_profile);
    if let (Some(normalized_object), Some(camera_object)) =
        (normalized.as_object_mut(), camera.as_object())
    {
        for (key, value) in camera_object {
            normalized_object.insert(key.clone(), value.clone());
        }
    }
    normalized
}

#[derive(Debug, Clone, Deserialize, Serialize)]
#[serde(tag = "type")]
pub(crate) enum Annotation {
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
pub(crate) struct PresentationStyles {
    #[serde(default)]
    pub(crate) hydrogen_visibility: Option<String>,
    #[serde(default)]
    pub(crate) element_color_overrides: Value,
    #[serde(default)]
    pub(crate) atom_size_scale: Option<f64>,
    #[serde(default)]
    pub(crate) atom_style_overrides: Value,
    #[serde(default)]
    pub(crate) bond_style_overrides: Value,
    #[serde(default = "default_render_profile")]
    pub(crate) render_profile: String,
    #[serde(default = "default_material_preset")]
    pub(crate) material_preset: String,
}

impl Default for PresentationStyles {
    fn default() -> Self {
        Self {
            hydrogen_visibility: None,
            element_color_overrides: Value::Object(Default::default()),
            atom_size_scale: None,
            atom_style_overrides: Value::Object(Default::default()),
            bond_style_overrides: Value::Object(Default::default()),
            render_profile: default_render_profile(),
            material_preset: default_material_preset(),
        }
    }
}

#[derive(Debug, Clone, Deserialize, Serialize, Default)]
pub(crate) struct PresentationGroupState {
    #[serde(default)]
    pub(crate) hidden_group_ids: Vec<String>,
    #[serde(default)]
    pub(crate) highlighted_group_ids: Vec<String>,
}

#[derive(Debug, Clone, Deserialize, Serialize)]
pub(crate) struct PresentationStateEnvelope {
    #[serde(default = "presentation_state_version")]
    pub(crate) version: u32,
    #[serde(default)]
    pub(crate) poses: Value,
    #[serde(default)]
    pub(crate) annotations: Vec<Annotation>,
    #[serde(default)]
    pub(crate) hidden_atoms: Vec<usize>,
    #[serde(default)]
    pub(crate) group_state: PresentationGroupState,
    #[serde(default)]
    pub(crate) styles: PresentationStyles,
    #[serde(default)]
    pub(crate) camera: Value,
}

impl Default for PresentationStateEnvelope {
    fn default() -> Self {
        Self {
            version: presentation_state_version(),
            poses: Value::Array(Vec::new()),
            annotations: Vec::new(),
            hidden_atoms: Vec::new(),
            group_state: PresentationGroupState::default(),
            styles: PresentationStyles::default(),
            camera: Value::Null,
        }
    }
}

pub(crate) fn normalize_presentation_envelope(
    mut envelope: PresentationStateEnvelope,
) -> Result<Value, String> {
    let fallback_profile =
        normalize_render_profile_str(Some(envelope.styles.material_preset.as_str()), "cylview");
    let render_profile = normalize_render_profile_str(
        Some(envelope.styles.render_profile.as_str()),
        &fallback_profile,
    );
    envelope.styles.render_profile = render_profile.clone();
    envelope.styles.material_preset = render_profile_to_material_preset(&render_profile);
    if envelope.styles.atom_size_scale.is_none() {
        envelope.styles.atom_size_scale = Some(if render_profile == "houkmol" {
            0.75
        } else {
            1.0
        });
    }
    envelope.camera = normalize_presentation_camera(envelope.camera, &render_profile);
    serde_json::to_value(envelope)
        .map_err(|error| format!("Could not normalize presentation state: {error}"))
}

pub(crate) fn value_array(value: Option<&Value>) -> Value {
    match value {
        Some(Value::Array(items)) => Value::Array(items.clone()),
        _ => Value::Array(Vec::new()),
    }
}

pub(crate) fn value_object(value: Option<&Value>) -> Value {
    match value {
        Some(Value::Object(map)) => Value::Object(map.clone()),
        _ => Value::Object(Default::default()),
    }
}

pub(crate) fn legacy_label_to_annotation(label: &Value) -> Value {
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

pub(crate) fn normalize_presentation_state(mut value: Value) -> Result<Value, String> {
    if value.get("annotations").is_some()
        || value.get("hidden_atoms").is_some()
        || value.get("group_state").is_some()
        || value.get("styles").is_some()
        || value.get("camera").is_some()
        || value.get("poses").is_some()
    {
        if let Some(styles) = value.get_mut("styles").and_then(Value::as_object_mut) {
            if !styles.contains_key("render_profile") {
                if let Some(material_preset) = styles.get("material_preset").cloned() {
                    styles.insert("render_profile".to_string(), material_preset);
                }
            }
        }
        let envelope: PresentationStateEnvelope = serde_json::from_value(value)
            .map_err(|error| format!("Saved presentation state is invalid: {error}"))?;
        return normalize_presentation_envelope(envelope);
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
        "group_state": {
            "hidden_group_ids": [],
            "highlighted_group_ids": []
        },
        "styles": {
            "hydrogen_visibility": value.get("hydrogenVisibility").cloned(),
            "element_color_overrides": value_object(value.get("elementColorOverrides")),
            "atom_size_scale": value.get("atomSizeScale").cloned(),
            "atom_style_overrides": value_object(value.get("atomStyleOverrides")),
            "bond_style_overrides": value_object(value.get("bondStyleOverrides")),
            "render_profile": value.get("renderProfile").cloned().or_else(|| value.get("materialPreset").cloned()).unwrap_or_else(|| json!("cylview")),
            "material_preset": value.get("materialPreset").cloned().unwrap_or_else(|| json!("CYLview"))
        },
        "camera": value.get("viewOptions").cloned().unwrap_or(Value::Null)
    });
    let envelope: PresentationStateEnvelope = serde_json::from_value(envelope)
        .map_err(|error| format!("Saved presentation state is invalid: {error}"))?;
    normalize_presentation_envelope(envelope)
}

#[tauri::command]
pub(crate) fn load_presentation_state(
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
pub(crate) fn save_presentation_state(
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
pub(crate) fn clear_presentation_state(app: AppHandle, path: String) -> Result<(), String> {
    let state_path = presentation_state_path(&app, &path)?;
    if state_path.exists() {
        fs::remove_file(&state_path)
            .map_err(|error| format!("Could not remove presentation state: {error}"))?;
    }
    Ok(())
}
