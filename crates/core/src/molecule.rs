//! Molecular data structures
//!
//! Defines the core data types for representing molecular structures:
//! - `Atom`: Atomic elements with 3D positions and properties
//! - `Bond`: Connections between atoms (single, double, triple, aromatic)
//! - `Structure`: A complete molecular system

use glam::{Mat4, Vec3};
use serde::{Deserialize, Deserializer, Serialize};
use std::collections::HashMap;

/// Default multiplier applied to summed covalent radii during bond perception.
pub const DEFAULT_BOND_PERCEPTION_TOLERANCE: f32 = 1.3;

/// Lower bound for configurable bond-perception tolerance.
pub const MIN_BOND_PERCEPTION_TOLERANCE: f32 = 1.1;

/// Upper bound for configurable bond-perception tolerance.
pub const MAX_BOND_PERCEPTION_TOLERANCE: f32 = 1.5;

const MIN_BOND_DISTANCE: f32 = 0.4;
const BOND_PERCEPTION_HEAVY_ATOM_SLACK: f32 = 0.25;
const BOND_PERCEPTION_HYDROGEN_SLACK: f32 = 0.20;

/// Clamp a user-facing bond-perception tolerance to the supported range.
pub fn normalize_bond_perception_tolerance(tolerance: f32) -> f32 {
    if tolerance.is_finite() {
        tolerance.clamp(MIN_BOND_PERCEPTION_TOLERANCE, MAX_BOND_PERCEPTION_TOLERANCE)
    } else {
        DEFAULT_BOND_PERCEPTION_TOLERANCE
    }
}

#[derive(Debug)]
struct BondCandidate {
    atom1: usize,
    atom2: usize,
    distance: f32,
    max_distance: f32,
}

/// An atom in a molecular structure
#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
pub struct Atom {
    /// Unique identifier within the structure
    pub id: u32,
    /// Element symbol ("C", "H", "O", etc.)
    pub element: String,
    /// 3D position in Angstroms
    pub position: Vec3,
    /// Atomic radius (van der Waals or covalent)
    pub radius: f32,
    /// Color override (optional)
    pub color: Option<[f32; 4]>,
    /// Selection state
    pub selected: bool,
    /// Visibility
    pub visible: bool,
    /// Optional source-file metadata for this atom
    pub metadata: Option<AtomMetadata>,
}

impl Atom {
    /// Create a new atom
    pub fn new(id: u32, element: &str, position: Vec3) -> Self {
        let element = normalize_element_symbol(element);
        Self {
            id,
            radius: Self::default_radius(&element),
            element,
            position,
            color: None,
            selected: false,
            visible: true,
            metadata: None,
        }
    }

    /// Get default van der Waals radius for an element (Angstroms)
    fn default_radius(element: &str) -> f32 {
        match element {
            "H" => 1.20,
            "C" => 1.70,
            "N" => 1.55,
            "O" => 1.52,
            "F" => 1.47,
            "P" => 1.80,
            "S" => 1.80,
            "Cl" => 1.75,
            "Br" => 1.85,
            "I" => 1.98,
            _ => 1.70,
        }
    }

    /// Get covalent radius for bond perception (Angstroms)
    pub(crate) fn covalent_radius(element: &str) -> f32 {
        match element {
            "H" => 0.31,
            "C" => 0.76,
            "N" => 0.71,
            "O" => 0.66,
            "F" => 0.57,
            "P" => 1.07,
            "S" => 1.05,
            "Cl" => 1.02,
            "Br" => 1.14,
            "I" => 1.33,
            _ => 0.77,
        }
    }

    /// Get default color for the element (CPK coloring)
    pub fn default_color(&self) -> [f32; 4] {
        let rgb = match self.element.as_str() {
            "H" => [1.0, 1.0, 1.0],  // White
            "C" => [0.3, 0.3, 0.3],  // Dark gray
            "N" => [0.0, 0.0, 1.0],  // Blue
            "O" => [1.0, 0.0, 0.0],  // Red
            "F" => [0.0, 1.0, 0.0],  // Green
            "P" => [1.0, 0.5, 0.0],  // Orange
            "S" => [1.0, 1.0, 0.0],  // Yellow
            "Cl" => [0.0, 1.0, 0.0], // Green
            _ => [0.5, 0.5, 0.5],    // Gray
        };
        [rgb[0], rgb[1], rgb[2], 1.0]
    }
}

/// Canonicalize simple element symbols from permissive file formats.
pub fn normalize_element_symbol(element: &str) -> String {
    let mut chars = element
        .trim()
        .chars()
        .filter(|character| character.is_ascii_alphabetic());
    let Some(first) = chars.next() else {
        return "C".to_string();
    };

    let mut normalized = String::new();
    normalized.push(first.to_ascii_uppercase());
    if let Some(second) = chars.next() {
        normalized.push(second.to_ascii_lowercase());
    }
    normalized
}

/// Optional source-file metadata for an atom.
#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
pub struct AtomMetadata {
    /// Source record kind, for example ATOM or HETATM in PDB files
    pub record_type: Option<String>,
    /// Source atom serial number
    pub serial: Option<i32>,
    /// Source atom name
    pub atom_name: Option<String>,
    /// Alternate location indicator
    pub alt_loc: Option<String>,
    /// Residue name
    pub residue_name: Option<String>,
    /// Chain identifier
    pub chain_id: Option<String>,
    /// Residue sequence number
    pub residue_sequence: Option<i32>,
    /// Insertion code
    pub insertion_code: Option<String>,
    /// PDB occupancy
    pub occupancy: Option<f32>,
    /// PDB temperature factor / B-factor
    pub b_factor: Option<f32>,
    /// Formal charge
    pub formal_charge: Option<String>,
}

/// Bond order/type
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
pub enum BondOrder {
    /// Single bond
    Single,
    /// Double bond
    Double,
    /// Triple bond
    Triple,
    /// Aromatic bond
    Aromatic,
    /// Weak interaction (H-bond, etc.)
    Interaction,
}

/// Figure/rendering style for a bond.
#[derive(Debug, Clone, Copy, Default, PartialEq, Eq, Serialize, Deserialize)]
pub enum BondKind {
    /// Normal covalent-style tube.
    #[default]
    Normal,
    /// Transition-state bond.
    Ts,
    /// Dative bond.
    Dative,
    /// Weak interaction/contact.
    Interaction,
    /// Thin highlighted bond.
    Thin,
}

impl BondOrder {
    /// Get the bond radius multiplier
    pub fn radius_multiplier(&self) -> f32 {
        match self {
            BondOrder::Single => 0.15,
            BondOrder::Double => 0.20,
            BondOrder::Triple => 0.25,
            BondOrder::Aromatic => 0.18,
            BondOrder::Interaction => 0.08,
        }
    }
}

/// A bond connecting two atoms
#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
pub struct Bond {
    /// First atom index
    pub atom1: u32,
    /// Second atom index
    pub atom2: u32,
    /// Bond order/type
    pub order: BondOrder,
    /// Figure/rendering style kind
    pub kind: BondKind,
    /// Selection state
    pub selected: bool,
    /// Visibility
    pub visible: bool,
}

impl Bond {
    /// Create a new bond
    pub fn new(atom1: u32, atom2: u32, order: BondOrder) -> Self {
        Self {
            atom1,
            atom2,
            order,
            kind: BondKind::Normal,
            selected: false,
            visible: true,
        }
    }
}

/// One coordinate frame in a molecular structure or trajectory.
#[derive(Debug, Clone, Default, Serialize, Deserialize)]
pub struct Frame {
    /// Atoms in the structure
    pub atoms: Vec<Atom>,
}

impl Frame {
    /// Create an empty coordinate frame.
    pub fn new() -> Self {
        Self { atoms: Vec::new() }
    }
}

/// A complete molecular structure.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Structure {
    /// Coordinate frames. Current loaders populate one frame, with trajectory playback planned.
    #[serde(default = "default_frames", deserialize_with = "deserialize_frames")]
    pub frames: Vec<Frame>,
    /// Bonds perceived from frame 0 and reused as static topology.
    pub static_bonds: Vec<Bond>,
    /// Transform matrix (for positioning)
    pub transform: Mat4,
    /// Optional source-file metadata
    pub metadata: SourceMetadata,
}

fn default_frames() -> Vec<Frame> {
    vec![Frame::new()]
}

fn deserialize_frames<'de, D>(deserializer: D) -> std::result::Result<Vec<Frame>, D::Error>
where
    D: Deserializer<'de>,
{
    let frames = Vec::<Frame>::deserialize(deserializer)?;
    if frames.is_empty() {
        Ok(default_frames())
    } else {
        Ok(frames)
    }
}

impl Default for Structure {
    fn default() -> Self {
        Self::new("Untitled")
    }
}

impl Structure {
    /// Create a new empty structure
    pub fn new(name: impl Into<String>) -> Self {
        let name = name.into();
        Self {
            frames: vec![Frame::new()],
            static_bonds: Vec::new(),
            transform: Mat4::IDENTITY,
            metadata: SourceMetadata {
                title: Some(name),
                ..SourceMetadata::default()
            },
        }
    }

    /// Display name for this structure.
    pub fn name(&self) -> &str {
        self.metadata.title.as_deref().unwrap_or("Untitled")
    }

    /// Update the display name/title for this structure.
    pub fn set_name(&mut self, name: impl Into<String>) {
        self.metadata.title = Some(name.into());
    }

    /// Get a coordinate frame by zero-based index.
    pub fn frame(&self, index: usize) -> Option<&Frame> {
        self.frames.get(index)
    }

    /// Get the currently displayed frame. Today this is always frame 0.
    pub fn active_frame(&self) -> &Frame {
        self.frames
            .first()
            .expect("Structure always has at least one frame")
    }

    fn active_frame_mut(&mut self) -> &mut Frame {
        if self.frames.is_empty() {
            self.frames.push(Frame::new());
        }
        &mut self.frames[0]
    }

    /// Atoms in frame 0. Compatibility helper while the app adopts frames.
    pub fn atoms(&self) -> &[Atom] {
        self.active_frame().atoms.as_slice()
    }

    /// Mutable atoms in frame 0. Compatibility helper while the app adopts frames.
    pub fn atoms_mut(&mut self) -> &mut Vec<Atom> {
        &mut self.active_frame_mut().atoms
    }

    /// Static topology bonds. Compatibility helper while the app adopts static_bonds.
    pub fn bonds(&self) -> &[Bond] {
        self.static_bonds.as_slice()
    }

    /// Mutable static topology bonds. Compatibility helper while the app adopts static_bonds.
    pub fn bonds_mut(&mut self) -> &mut Vec<Bond> {
        &mut self.static_bonds
    }

    /// Add an atom and return its index
    pub fn add_atom(&mut self, atom: Atom) -> usize {
        let atoms = self.atoms_mut();
        atoms.push(atom);
        atoms.len() - 1
    }

    /// Add a bond
    pub fn add_bond(&mut self, bond: Bond) {
        self.static_bonds.push(bond);
    }

    /// Get center of geometry
    pub fn center(&self) -> Vec3 {
        let atoms = self.atoms();
        if atoms.is_empty() {
            return Vec3::ZERO;
        }

        let sum: Vec3 = atoms.iter().map(|a| a.position).sum();
        sum / atoms.len() as f32
    }

    /// Compute bounding box
    pub fn bounding_box(&self) -> (Vec3, Vec3) {
        let atoms = self.atoms();
        if atoms.is_empty() {
            return (Vec3::ZERO, Vec3::ONE);
        }

        let first = atoms[0].position;
        let mut min = first;
        let mut max = first;

        for atom in atoms {
            min = min.min(atom.position);
            max = max.max(atom.position);
        }

        (min, max)
    }

    /// Auto-perceive bonds using covalent radii thresholds.
    pub fn perceive_bonds(&mut self) {
        self.perceive_bonds_with_tolerance(DEFAULT_BOND_PERCEPTION_TOLERANCE);
    }

    /// Auto-perceive bonds using covalent radii thresholds and an explicit tolerance.
    pub fn perceive_bonds_with_tolerance(&mut self, tolerance: f32) {
        self.static_bonds.clear();
        let indices = (0..self.atoms().len()).collect::<Vec<_>>();
        self.perceive_bonds_for_indices(&indices, normalize_bond_perception_tolerance(tolerance));
    }

    /// Whether source metadata can identify molecule-like residue groups.
    pub fn has_metadata_groups(&self) -> bool {
        let mut groups = HashMap::<String, usize>::new();
        for (index, atom) in self.atoms().iter().enumerate() {
            if let Some(key) = atom_metadata_group_key(atom) {
                groups.entry(key).or_insert(index);
            }
        }
        groups.len() > 1
    }

    /// Auto-perceive bonds independently inside source metadata groups.
    pub fn perceive_bonds_within_metadata_groups(&mut self) {
        self.perceive_bonds_within_metadata_groups_with_tolerance(
            DEFAULT_BOND_PERCEPTION_TOLERANCE,
        );
    }

    /// Auto-perceive bonds independently inside source metadata groups with an explicit tolerance.
    pub fn perceive_bonds_within_metadata_groups_with_tolerance(&mut self, tolerance: f32) {
        self.static_bonds.clear();
        let tolerance = normalize_bond_perception_tolerance(tolerance);

        let mut groups = HashMap::<String, Vec<usize>>::new();
        let mut ungrouped = Vec::<usize>::new();
        for (index, atom) in self.atoms().iter().enumerate() {
            if let Some(key) = atom_metadata_group_key(atom) {
                groups.entry(key).or_default().push(index);
            } else {
                ungrouped.push(index);
            }
        }

        for indices in groups.values() {
            self.perceive_bonds_for_indices(indices, tolerance);
        }
        if !ungrouped.is_empty() {
            self.perceive_bonds_for_indices(&ungrouped, tolerance);
        }
    }

    fn perceive_bonds_for_indices(&mut self, indices: &[usize], tolerance: f32) {
        if indices.len() < 2 {
            return;
        }

        const CELL_SIZE: f32 = 3.6;
        let mut cells = HashMap::<(i32, i32, i32), Vec<usize>>::new();
        let mut bond_candidates = Vec::<BondCandidate>::new();

        for &atom_index in indices {
            let position = self.atoms()[atom_index].position;
            let cell = (
                (position.x / CELL_SIZE).floor() as i32,
                (position.y / CELL_SIZE).floor() as i32,
                (position.z / CELL_SIZE).floor() as i32,
            );

            for dx in -1..=1 {
                for dy in -1..=1 {
                    for dz in -1..=1 {
                        let neighbor_cell = (cell.0 + dx, cell.1 + dy, cell.2 + dz);
                        let Some(candidates) = cells.get(&neighbor_cell) else {
                            continue;
                        };

                        for &candidate_index in candidates {
                            let atom_i = &self.atoms()[candidate_index];
                            let atom_j = &self.atoms()[atom_index];
                            let distance = atom_i.position.distance(atom_j.position);
                            let max_distance = bond_perception_max_distance(
                                &atom_i.element,
                                &atom_j.element,
                                tolerance,
                            );

                            if distance > MIN_BOND_DISTANCE && distance < max_distance {
                                bond_candidates.push(BondCandidate {
                                    atom1: candidate_index,
                                    atom2: atom_index,
                                    distance,
                                    max_distance,
                                });
                            }
                        }
                    }
                }
            }

            cells.entry(cell).or_default().push(atom_index);
        }

        bond_candidates.sort_by(|left, right| {
            let left_score = left.distance / left.max_distance;
            let right_score = right.distance / right.max_distance;
            left_score.total_cmp(&right_score)
        });

        let mut bond_counts = vec![0usize; self.atoms().len()];
        for bond in &self.static_bonds {
            let atom1 = bond.atom1 as usize;
            let atom2 = bond.atom2 as usize;
            if atom1 < bond_counts.len() {
                bond_counts[atom1] += 1;
            }
            if atom2 < bond_counts.len() {
                bond_counts[atom2] += 1;
            }
        }

        for candidate in bond_candidates {
            let atom1 = &self.atoms()[candidate.atom1];
            let atom2 = &self.atoms()[candidate.atom2];
            if bond_counts[candidate.atom1] >= bond_perception_valence_limit(&atom1.element)
                || bond_counts[candidate.atom2] >= bond_perception_valence_limit(&atom2.element)
            {
                continue;
            }

            self.static_bonds.push(Bond::new(
                candidate.atom1 as u32,
                candidate.atom2 as u32,
                BondOrder::Single,
            ));
            bond_counts[candidate.atom1] += 1;
            bond_counts[candidate.atom2] += 1;
        }
    }

    /// Count atoms
    pub fn atom_count(&self) -> usize {
        self.atoms().len()
    }

    /// Count bonds
    pub fn bond_count(&self) -> usize {
        self.static_bonds.len()
    }
}

fn atom_metadata_group_key(atom: &Atom) -> Option<String> {
    let metadata = atom.metadata.as_ref()?;
    if metadata.residue_name.is_none()
        && metadata.residue_sequence.is_none()
        && metadata.chain_id.is_none()
        && metadata.insertion_code.is_none()
    {
        return None;
    }

    Some(format!(
        "{}:{}:{}:{}",
        metadata.chain_id.as_deref().unwrap_or(""),
        metadata.residue_name.as_deref().unwrap_or(""),
        metadata
            .residue_sequence
            .map(|value| value.to_string())
            .unwrap_or_default(),
        metadata.insertion_code.as_deref().unwrap_or("")
    ))
}

fn bond_perception_max_distance(element_a: &str, element_b: &str, tolerance: f32) -> f32 {
    let covalent_sum = Atom::covalent_radius(element_a) + Atom::covalent_radius(element_b);
    let additive_slack = if element_a == "H" || element_b == "H" {
        BOND_PERCEPTION_HYDROGEN_SLACK
    } else {
        BOND_PERCEPTION_HEAVY_ATOM_SLACK
    };

    (covalent_sum * normalize_bond_perception_tolerance(tolerance))
        .min(covalent_sum + additive_slack)
}

fn bond_perception_valence_limit(element: &str) -> usize {
    match element {
        "H" | "F" | "Cl" | "Br" | "I" => 1,
        "O" => 2,
        "N" => 3,
        "C" => 4,
        "P" => 5,
        "S" => 6,
        _ => 4,
    }
}

/// Optional metadata preserved from the source molecular file.
#[derive(Debug, Clone, Default, PartialEq, Serialize, Deserialize)]
pub struct SourceMetadata {
    /// Source format label such as XYZ or PDB
    pub source_format: Option<String>,
    /// Title/comment/header text from the source file
    pub title: Option<String>,
    /// Detected total frame/model count when the source can contain multiple structures
    pub frame_count: Option<usize>,
    /// One-based frame/model index loaded by the current single-structure viewer
    pub loaded_frame_index: Option<usize>,
    /// Parsed scalar energy from common title/comment formats
    pub energy: Option<f64>,
    /// Energy unit when known
    pub energy_unit: Option<String>,
    /// Non-fatal parser notes about ignored or deferred metadata
    pub warnings: Vec<String>,
}

/// Temporary compatibility alias while downstream code adopts SourceMetadata.
pub type StructureMetadata = SourceMetadata;

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_atom_creation() {
        let atom = Atom::new(0, "c", Vec3::new(1.0, 2.0, 3.0));
        assert_eq!(atom.element, "C");
        assert_eq!(atom.position, Vec3::new(1.0, 2.0, 3.0));
    }

    #[test]
    fn test_atom_normalizes_mixed_case_element_symbols() {
        assert_eq!(
            Atom::new(0, "CL", Vec3::ZERO).element,
            "Cl",
            "chlorine input should use the canonical covalent-radius key"
        );
        assert_eq!(Atom::new(1, "br", Vec3::ZERO).element, "Br");
        assert_eq!(Atom::new(2, "C1+", Vec3::ZERO).element, "C");
    }

    #[test]
    fn test_structure_center() {
        let mut structure = Structure::new("test");
        structure.add_atom(Atom::new(0, "C", Vec3::new(0.0, 0.0, 0.0)));
        structure.add_atom(Atom::new(1, "C", Vec3::new(2.0, 0.0, 0.0)));

        assert_eq!(structure.center(), Vec3::new(1.0, 0.0, 0.0));
    }

    #[test]
    fn test_structure_frame_helpers_and_static_bonds() {
        let mut structure = Structure::new("test");
        structure.add_atom(Atom::new(0, "C", Vec3::new(0.0, 0.0, 0.0)));
        structure.add_atom(Atom::new(1, "C", Vec3::new(1.4, 0.0, 0.0)));
        structure.perceive_bonds();

        assert_eq!(structure.frames.len(), 1);
        assert_eq!(structure.frame(0).unwrap().atoms.len(), 2);
        assert_eq!(structure.active_frame().atoms.len(), 2);
        assert_eq!(structure.atoms().len(), 2);
        assert_eq!(structure.bonds().len(), 1);
        assert_eq!(structure.static_bonds.len(), 1);
    }

    #[test]
    fn test_bond_perception_tolerance_changes_threshold() {
        let mut structure = Structure::new("test");
        structure.add_atom(Atom::new(0, "C", Vec3::new(0.0, 0.0, 0.0)));
        structure.add_atom(Atom::new(1, "C", Vec3::new(1.75, 0.0, 0.0)));

        structure.perceive_bonds_with_tolerance(1.1);
        assert_eq!(structure.bonds().len(), 0);

        structure.perceive_bonds_with_tolerance(1.3);
        assert_eq!(structure.bonds().len(), 1);
    }

    #[test]
    fn test_bond_perception_rejects_long_carbon_contact() {
        let mut structure = Structure::new("crowded carbon contact");
        structure.add_atom(Atom::new(0, "C", Vec3::new(0.0, 0.0, 0.0)));
        structure.add_atom(Atom::new(1, "C", Vec3::new(1.90, 0.0, 0.0)));

        structure.perceive_bonds();

        assert_eq!(structure.bonds().len(), 0);
    }

    #[test]
    fn test_bond_perception_keeps_real_bond_and_rejects_cavity_contact() {
        let mut structure = Structure::new("crowded natural product fragment");
        structure.add_atom(Atom::new(0, "C", Vec3::new(0.0, 0.0, 0.0)));
        structure.add_atom(Atom::new(1, "C", Vec3::new(1.48, 0.0, 0.0)));
        structure.add_atom(Atom::new(2, "C", Vec3::new(0.0, 1.90, 0.0)));
        structure.add_atom(Atom::new(3, "C", Vec3::new(1.48, 1.90, 0.0)));

        structure.perceive_bonds();

        assert_eq!(structure.bonds().len(), 2);
        assert!(has_bond(&structure, 0, 1));
        assert!(has_bond(&structure, 2, 3));
        assert!(!has_bond(&structure, 0, 2));
        assert!(!has_bond(&structure, 1, 3));
    }

    #[test]
    fn test_bond_perception_valence_filter_preserves_common_fragments() {
        let mut structure = Structure::new("organic valence sanity");
        structure.add_atom(Atom::new(0, "C", Vec3::new(0.0, 0.0, 0.0)));
        structure.add_atom(Atom::new(1, "H", Vec3::new(1.09, 0.0, 0.0)));
        structure.add_atom(Atom::new(2, "H", Vec3::new(-1.09, 0.0, 0.0)));
        structure.add_atom(Atom::new(3, "O", Vec3::new(0.0, 1.43, 0.0)));
        structure.add_atom(Atom::new(4, "N", Vec3::new(0.0, -1.47, 0.0)));

        structure.perceive_bonds();

        assert_eq!(structure.bonds().len(), 4);
        assert!(has_bond(&structure, 0, 1));
        assert!(has_bond(&structure, 0, 2));
        assert!(has_bond(&structure, 0, 3));
        assert!(has_bond(&structure, 0, 4));
    }

    #[test]
    fn test_bond_perception_valence_filter_rejects_overcoordinated_carbon() {
        let mut structure = Structure::new("overcoordinated carbon");
        structure.add_atom(Atom::new(0, "C", Vec3::new(0.0, 0.0, 0.0)));
        structure.add_atom(Atom::new(1, "H", Vec3::new(1.09, 0.0, 0.0)));
        structure.add_atom(Atom::new(2, "H", Vec3::new(-1.09, 0.0, 0.0)));
        structure.add_atom(Atom::new(3, "H", Vec3::new(0.0, 1.09, 0.0)));
        structure.add_atom(Atom::new(4, "H", Vec3::new(0.0, -1.09, 0.0)));
        structure.add_atom(Atom::new(5, "H", Vec3::new(0.0, 0.0, 1.09)));

        structure.perceive_bonds();

        assert_eq!(structure.bonds().len(), 4);
        assert_eq!(
            structure
                .bonds()
                .iter()
                .filter(|bond| bond.atom1 == 0 || bond.atom2 == 0)
                .count(),
            4
        );
    }

    #[test]
    fn test_bond_kind_defaults_and_serializes() {
        let mut bond = Bond::new(0, 1, BondOrder::Single);
        assert_eq!(bond.kind, BondKind::Normal);
        bond.kind = BondKind::Ts;

        let encoded = serde_json::to_string(&bond).unwrap();
        let decoded: Bond = serde_json::from_str(&encoded).unwrap();

        assert_eq!(decoded.kind, BondKind::Ts);
    }

    #[test]
    fn test_deserializes_empty_frames_to_empty_active_frame() {
        let original = Structure::new("repair empty frames");
        let mut value = serde_json::to_value(&original).unwrap();
        value["frames"] = serde_json::json!([]);

        let decoded: Structure = serde_json::from_value(value).unwrap();

        assert_eq!(decoded.frames.len(), 1);
        assert_eq!(decoded.atoms().len(), 0);
        assert_eq!(decoded.center(), Vec3::ZERO);
    }

    fn has_bond(structure: &Structure, atom1: u32, atom2: u32) -> bool {
        structure.bonds().iter().any(|bond| {
            (bond.atom1 == atom1 && bond.atom2 == atom2)
                || (bond.atom1 == atom2 && bond.atom2 == atom1)
        })
    }
}
