//! Cylform Desktop Application
//!
//! Tauri shell — file I/O in Rust, 3-D rendering via Three.js in the WebView.

#![cfg_attr(
    all(not(debug_assertions), target_os = "windows"),
    windows_subsystem = "windows"
)]

mod exports;
mod menu;
mod molecule_commands;
mod pose_library;
mod presentation_state;
mod settings;
mod workspace;

use cylform_core::molecule::Structure;
use parking_lot::Mutex;
use std::sync::Arc;
use tauri::Manager;

use exports::*;
use menu::*;
use molecule_commands::*;
use pose_library::*;
use presentation_state::*;
use settings::*;
use workspace::*;

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
            export_png,
            export_text_sidecar,
            export_xyz_frame
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
    use cylform_core::CoreError;
    use serde_json::{json, Value};
    use std::fs;
    use std::path::Path;

    #[test]
    fn test_default_app_settings_match_shared_golden_fixture() {
        let fixture: Value = serde_json::from_str(include_str!(
            "../../shared-fixtures/default-app-settings.json"
        ))
        .expect("golden default app settings fixture parses");
        assert_eq!(default_app_settings(), fixture);
    }

    #[test]
    fn test_default_presentation_cameras_match_shared_golden_fixture() {
        let fixture: Value = serde_json::from_str(include_str!(
            "../../shared-fixtures/default-presentation-cameras.json"
        ))
        .expect("golden default presentation cameras fixture parses");
        for profile in ["cylview", "ball-stick", "houkmol"] {
            assert_eq!(
                default_presentation_camera(profile),
                fixture[profile],
                "default camera drifted from the shared fixture for profile {profile}"
            );
        }
    }

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
            normalized["rendering"]["defaultRenderProfile"],
            json!("cylview")
        );
        assert_eq!(
            normalized["rendering"]["defaultMaterialPreset"],
            json!("CYLviewLegacy")
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
    fn test_export_text_sidecar_to_path_validates_json_and_extension() {
        let path = std::env::temp_dir().join(format!("cylform-test-{}.json", now_timestamp()));
        let contents = r#"{"kind":"cylform-publication-render"}"#;

        export_text_sidecar_to_path(&path, contents).unwrap();
        assert_eq!(fs::read_to_string(&path).unwrap(), contents);
        fs::remove_file(&path).unwrap();

        assert!(export_text_sidecar_to_path(&path.with_extension("txt"), contents).is_err());
        assert!(export_text_sidecar_to_path(&path, "not json").is_err());
    }

    #[test]
    fn test_export_xyz_frame_to_path_exports_selected_frame() {
        let input_path = std::env::temp_dir().join(format!("cylform-input-{}.xyz", now_timestamp()));
        let output_path = std::env::temp_dir().join(format!("cylform-frame-{}.xyz", now_timestamp()));
        fs::write(
            &input_path,
            "1\nframe 1\nC 0.0 0.0 0.0\n1\nframe 2\nC 4.0 5.0 6.0\n",
        )
        .unwrap();

        export_xyz_frame_to_path(&output_path, input_path.to_str().unwrap(), 1).unwrap();
        let exported = fs::read_to_string(&output_path).unwrap();

        assert!(exported.contains("frame 2"));
        assert!(exported.contains("C     4.000000     5.000000     6.000000"));
        fs::remove_file(&input_path).unwrap();
        fs::remove_file(&output_path).unwrap();
        assert!(export_xyz_frame_to_path(&output_path.with_extension("txt"), input_path.to_str().unwrap(), 0).is_err());
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
        assert_eq!(normalized["group_state"]["hidden_group_ids"], json!([]));
        assert_eq!(
            normalized["group_state"]["highlighted_group_ids"],
            json!([])
        );
        assert_eq!(normalized["styles"]["element_color_overrides"], json!({}));
        assert_eq!(normalized["styles"]["atom_size_scale"], json!(1.0));
        assert_eq!(normalized["styles"]["render_profile"], json!("cylview"));
        assert_eq!(
            normalized["styles"]["material_preset"],
            json!("CYLviewLegacy")
        );
        assert_eq!(normalized["camera"]["fogEnabled"], json!(true));
        assert_eq!(normalized["camera"]["fogIntensity"], json!(0.55));
        assert_eq!(normalized["camera"]["fogDepth"], json!(0.58));
        assert_eq!(normalized["camera"]["focalBlurEnabled"], json!(false));
        assert_eq!(normalized["camera"]["focalBlurAmount"], json!(0.32));
        assert_eq!(normalized["camera"]["focalDepth"], json!(0.5));
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
        assert_eq!(normalized["group_state"]["hidden_group_ids"], json!([]));
        assert_eq!(
            normalized["group_state"]["highlighted_group_ids"],
            json!([])
        );
        assert_eq!(
            normalized["styles"]["hydrogen_visibility"],
            json!("hide-c-h")
        );
        assert_eq!(normalized["styles"]["render_profile"], json!("houkmol"));
        assert_eq!(normalized["styles"]["material_preset"], json!("Houkmol"));
        assert_eq!(normalized["styles"]["atom_size_scale"], json!(1.25));
        assert_eq!(normalized["camera"]["backdropTone"], json!("clean"));
        assert_eq!(normalized["camera"]["projection"], json!("orthographic"));
        assert_eq!(normalized["camera"]["fogEnabled"], json!(false));
        assert_eq!(normalized["camera"]["fogIntensity"], json!(0.45));
        assert_eq!(normalized["camera"]["fogDepth"], json!(0.5));
        assert_eq!(normalized["camera"]["focalBlurEnabled"], json!(false));
        assert_eq!(normalized["camera"]["focalBlurAmount"], json!(0.32));
        assert_eq!(normalized["camera"]["focalDepth"], json!(0.5));
        assert_eq!(normalized["camera"]["showLabelLinkLines"], json!(true));
        assert_eq!(normalized["poses"][0]["id"], json!("pose-1"));
    }

    #[test]
    fn test_presentation_state_maps_legacy_material_aliases_to_render_profiles() {
        let normalized = normalize_presentation_state(json!({
            "version": 1,
            "annotations": [],
            "hidden_atoms": [],
            "group_state": {
                "hidden_group_ids": ["A:ALA:1:"],
                "highlighted_group_ids": ["A:GLY:2:"]
            },
            "poses": [],
            "styles": {
                "material_preset": "CYLview"
            }
        }))
        .unwrap();

        assert_eq!(normalized["styles"]["render_profile"], json!("ball-stick"));
        assert_eq!(
            normalized["group_state"]["hidden_group_ids"],
            json!(["A:ALA:1:"])
        );
        assert_eq!(
            normalized["group_state"]["highlighted_group_ids"],
            json!(["A:GLY:2:"])
        );
        assert_eq!(normalized["styles"]["material_preset"], json!("CYLview"));
        assert_eq!(normalized["styles"]["atom_size_scale"], json!(1.0));
        assert_eq!(normalized["camera"]["fogEnabled"], json!(false));
        assert_eq!(normalized["camera"]["fogDepth"], json!(0.5));

        let explicit = normalize_presentation_state(json!({
            "version": 1,
            "annotations": [],
            "hidden_atoms": [],
            "poses": [],
            "styles": {
                "render_profile": "cylview",
                "material_preset": "CYLview"
            }
        }))
        .unwrap();

        assert_eq!(explicit["styles"]["render_profile"], json!("cylview"));
        assert_eq!(
            explicit["styles"]["material_preset"],
            json!("CYLviewLegacy")
        );
        assert_eq!(explicit["camera"]["fogEnabled"], json!(true));
        assert_eq!(explicit["camera"]["fogDepth"], json!(0.58));

        let houkmol = normalize_presentation_state(json!({
            "version": 1,
            "annotations": [],
            "hidden_atoms": [],
            "poses": [],
            "styles": {
                "render_profile": "houkmol"
            }
        }))
        .unwrap();

        assert_eq!(houkmol["styles"]["material_preset"], json!("Houkmol"));
        assert_eq!(houkmol["styles"]["atom_size_scale"], json!(0.75));
        assert_eq!(houkmol["camera"]["fogEnabled"], json!(false));
        assert_eq!(houkmol["camera"]["focalBlurEnabled"], json!(false));
        assert_eq!(houkmol["camera"]["showLabelLinkLines"], json!(true));
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
