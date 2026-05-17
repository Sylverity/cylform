//! Molecular data structures
//!
//! Defines the core data types for representing molecular structures:
//! - `Atom`: Atomic elements with 3D positions and properties
//! - `Bond`: Connections between atoms (single, double, triple, aromatic)
//! - `Structure`: A complete molecular system

use glam::{Mat4, Vec3};
use serde::{Deserialize, Serialize};
use std::collections::HashMap;

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
        Self {
            id,
            element: element.to_string(),
            position,
            radius: Self::default_radius(element),
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
            selected: false,
            visible: true,
        }
    }
}

/// A complete molecular structure
#[derive(Debug, Clone, Default, Serialize, Deserialize)]
pub struct Structure {
    /// Structure name
    pub name: String,
    /// Atoms in the structure
    pub atoms: Vec<Atom>,
    /// Bonds in the structure
    pub bonds: Vec<Bond>,
    /// Transform matrix (for positioning)
    pub transform: Mat4,
    /// Optional source-file metadata
    pub metadata: StructureMetadata,
}

impl Structure {
    /// Create a new empty structure
    pub fn new(name: impl Into<String>) -> Self {
        Self {
            name: name.into(),
            atoms: Vec::new(),
            bonds: Vec::new(),
            transform: Mat4::IDENTITY,
            metadata: StructureMetadata::default(),
        }
    }

    /// Add an atom and return its index
    pub fn add_atom(&mut self, atom: Atom) -> usize {
        self.atoms.push(atom);
        self.atoms.len() - 1
    }

    /// Add a bond
    pub fn add_bond(&mut self, bond: Bond) {
        self.bonds.push(bond);
    }

    /// Get center of geometry
    pub fn center(&self) -> Vec3 {
        if self.atoms.is_empty() {
            return Vec3::ZERO;
        }

        let sum: Vec3 = self.atoms.iter().map(|a| a.position).sum();
        sum / self.atoms.len() as f32
    }

    /// Compute bounding box
    pub fn bounding_box(&self) -> (Vec3, Vec3) {
        if self.atoms.is_empty() {
            return (Vec3::ZERO, Vec3::ONE);
        }

        let first = self.atoms[0].position;
        let mut min = first;
        let mut max = first;

        for atom in &self.atoms {
            min = min.min(atom.position);
            max = max.max(atom.position);
        }

        (min, max)
    }

    /// Auto-perceive bonds using covalent radii thresholds.
    pub fn perceive_bonds(&mut self) {
        self.bonds.clear();
        let indices = (0..self.atoms.len()).collect::<Vec<_>>();
        self.perceive_bonds_for_indices(&indices);
    }

    /// Whether source metadata can identify molecule-like residue groups.
    pub fn has_metadata_groups(&self) -> bool {
        let mut groups = HashMap::<String, usize>::new();
        for (index, atom) in self.atoms.iter().enumerate() {
            if let Some(key) = atom_metadata_group_key(atom) {
                groups.entry(key).or_insert(index);
            }
        }
        groups.len() > 1
    }

    /// Auto-perceive bonds independently inside source metadata groups.
    pub fn perceive_bonds_within_metadata_groups(&mut self) {
        self.bonds.clear();

        let mut groups = HashMap::<String, Vec<usize>>::new();
        let mut ungrouped = Vec::<usize>::new();
        for (index, atom) in self.atoms.iter().enumerate() {
            if let Some(key) = atom_metadata_group_key(atom) {
                groups.entry(key).or_default().push(index);
            } else {
                ungrouped.push(index);
            }
        }

        for indices in groups.values() {
            self.perceive_bonds_for_indices(indices);
        }
        if !ungrouped.is_empty() {
            self.perceive_bonds_for_indices(&ungrouped);
        }
    }

    fn perceive_bonds_for_indices(&mut self, indices: &[usize]) {
        if indices.len() < 2 {
            return;
        }

        const CELL_SIZE: f32 = 3.6;
        let mut cells = HashMap::<(i32, i32, i32), Vec<usize>>::new();

        for &atom_index in indices {
            let position = self.atoms[atom_index].position;
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
                            let atom_i = &self.atoms[candidate_index];
                            let atom_j = &self.atoms[atom_index];
                            let distance = atom_i.position.distance(atom_j.position);
                            let max_bond_dist = (Atom::covalent_radius(&atom_i.element)
                                + Atom::covalent_radius(&atom_j.element))
                                * 1.3;

                            if distance > 0.4 && distance < max_bond_dist {
                                self.bonds.push(Bond::new(
                                    candidate_index as u32,
                                    atom_index as u32,
                                    BondOrder::Single,
                                ));
                            }
                        }
                    }
                }
            }

            cells.entry(cell).or_default().push(atom_index);
        }
    }

    /// Count atoms
    pub fn atom_count(&self) -> usize {
        self.atoms.len()
    }

    /// Count bonds
    pub fn bond_count(&self) -> usize {
        self.bonds.len()
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

/// Optional metadata preserved from the source molecular file.
#[derive(Debug, Clone, Default, PartialEq, Serialize, Deserialize)]
pub struct StructureMetadata {
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

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_atom_creation() {
        let atom = Atom::new(0, "C", Vec3::new(1.0, 2.0, 3.0));
        assert_eq!(atom.element, "C");
        assert_eq!(atom.position, Vec3::new(1.0, 2.0, 3.0));
    }

    #[test]
    fn test_structure_center() {
        let mut structure = Structure::new("test");
        structure.add_atom(Atom::new(0, "C", Vec3::new(0.0, 0.0, 0.0)));
        structure.add_atom(Atom::new(1, "C", Vec3::new(2.0, 0.0, 0.0)));

        assert_eq!(structure.center(), Vec3::new(1.0, 0.0, 0.0));
    }
}
