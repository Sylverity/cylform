//! Molecular data structures
//! 
//! Defines the core data types for representing molecular structures:
//! - `Atom`: Atomic elements with 3D positions and properties
//! - `Bond`: Connections between atoms (single, double, triple, aromatic)
//! - `Structure`: A complete molecular system

use glam::{Vec3, Mat4};
use serde::{Deserialize, Serialize};

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
        }
    }
    
    /// Get default radius for an element
    fn default_radius(element: &str) -> f32 {
        // CPK van der Waals radii in Angstroms
        match element {
            "H" => 1.2,
            "C" => 1.7,
            "N" => 1.55,
            "O" => 1.52,
            "F" => 1.47,
            "P" => 1.80,
            "S" => 1.80,
            "Cl" => 1.75,
            _ => 1.7, // Default to carbon
        }
    }
    
    /// Get default color for the element (CPK coloring)
    pub fn default_color(&self) -> [f32; 4] {
        let rgb = match self.element.as_str() {
            "H" => [1.0, 1.0, 1.0],      // White
            "C" => [0.3, 0.3, 0.3],      // Dark gray
            "N" => [0.0, 0.0, 1.0],      // Blue
            "O" => [1.0, 0.0, 0.0],      // Red
            "F" => [0.0, 1.0, 0.0],      // Green
            "P" => [1.0, 0.5, 0.0],      // Orange
            "S" => [1.0, 1.0, 0.0],      // Yellow
            "Cl" => [0.0, 1.0, 0.0],     // Green
            _ => [0.5, 0.5, 0.5],        // Gray
        };
        [rgb[0], rgb[1], rgb[2], 1.0]
    }
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
}

impl Structure {
    /// Create a new empty structure
    pub fn new(name: impl Into<String>) -> Self {
        Self {
            name: name.into(),
            atoms: Vec::new(),
            bonds: Vec::new(),
            transform: Mat4::IDENTITY,
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
        
        let sum: Vec3 = self.atoms.iter()
            .map(|a| a.position)
            .sum();
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
    
    /// Auto-perceive bonds based on covalent radii
    pub fn perceive_bonds(&mut self) {
        self.bonds.clear();
        
        for i in 0..self.atoms.len() {
            for j in (i + 1)..self.atoms.len() {
                let atom_i = &self.atoms[i];
                let atom_j = &self.atoms[j];
                
                let distance = atom_i.position.distance(atom_j.position);
                let max_bond_dist = (atom_i.radius + atom_j.radius) * 1.2;
                
                if distance < max_bond_dist && distance > 0.4 {
                    self.bonds.push(Bond::new(i as u32, j as u32, BondOrder::Single));
                }
            }
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
