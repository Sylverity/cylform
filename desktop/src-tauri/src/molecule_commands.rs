use cylform_core::{
    io::{
        read_structure_with_options, supported_read_extensions, FileFormat, IoError, ReadOptions,
        MAX_ATOMS,
    },
    molecule::{normalize_bond_perception_tolerance, Atom, BondKind},
    CoreError,
};
use serde::Serialize;
use std::fs;
use std::path::Path;
use std::sync::Arc;
use tauri::State;

use crate::exports::benchmark_enabled;
use crate::AppState;

// ---------------------------------------------------------------------------
// Serialisable types sent to the frontend
// ---------------------------------------------------------------------------

#[derive(Serialize)]
pub(crate) struct SerialAtom {
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
pub(crate) struct SerialBond {
    atom1: u32,
    atom2: u32,
    /// cylinder radius (Å) derived from bond order
    radius: f32,
    kind: BondKind,
}

#[derive(Serialize)]
pub(crate) struct SerialAtomMetadata {
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
pub(crate) struct SerialMoleculeMetadata {
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
pub(crate) struct SerialMoleculeGroup {
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
pub(crate) struct SerialPoint {
    x: f32,
    y: f32,
    z: f32,
}

#[derive(Serialize)]
pub(crate) struct MoleculeData {
    path: String,
    name: String,
    atoms: Vec<SerialAtom>,
    bonds: Vec<SerialBond>,
    groups: Vec<SerialMoleculeGroup>,
    metadata: SerialMoleculeMetadata,
}

// ---------------------------------------------------------------------------
// Tauri commands
// ---------------------------------------------------------------------------

/// Load a molecular file and return the full atom/bond geometry to the frontend.
/// Coordinates are re-centred to the geometric centre of the molecule.
#[tauri::command]
pub(crate) fn load_molecule(
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
    let frame = structure.frame(frame_index).cloned().ok_or_else(|| {
        format!(
            "Frame index {} is out of range for {} frame(s).",
            frame_index,
            structure.frames.len()
        )
    })?;
    structure.metadata.loaded_frame_index = Some(frame_index);
    structure.metadata.title = frame.title.clone().or_else(|| structure.metadata.title.clone());
    structure.metadata.energy = frame.energy;
    structure.metadata.energy_unit = frame.energy_unit.clone();

    let center = structure.center_for_frame(frame_index);

    let atoms = frame
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

    let groups = build_molecule_groups_for_atoms(&frame.atoms, center);

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
        frame.atoms.len(),
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

pub(crate) fn read_options_from_env() -> ReadOptions {
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

pub(crate) fn build_molecule_groups_for_atoms(atoms: &[Atom], center: glam::Vec3) -> Vec<SerialMoleculeGroup> {
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

    for (atom_index, atom) in atoms.iter().enumerate() {
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

pub(crate) fn format_group_label(
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

#[tauri::command]
pub(crate) fn get_supported_read_extensions() -> Vec<&'static str> {
    supported_read_extensions()
}

#[tauri::command]
pub(crate) fn list_supported_files_near(path: String) -> Result<Vec<String>, String> {
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

pub(crate) fn format_load_error(error: CoreError) -> String {
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
pub(crate) fn get_startup_file() -> Option<String> {
    std::env::args().skip(1).find(|arg| {
        let path = Path::new(arg);
        path.exists() && path.is_file()
    })
}
