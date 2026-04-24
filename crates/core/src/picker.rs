//! Object picking and selection
//!
//! Supports:
//! - Single click selection
//! - Rectangle/lasso selection
//! - Hover highlighting
//! - SMARTS query selection

use crate::molecule::Structure;
use glam::Vec2;

/// A picked object
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum PickedObject {
    /// An atom was picked
    Atom(u32),
    /// A bond was picked
    Bond(u32),
    /// Nothing was picked
    None,
}

/// Selection state
#[derive(Debug, Clone, Default)]
pub struct Selection {
    /// Selected atom indices
    pub atoms: Vec<u32>,
    /// Selected bond indices
    pub bonds: Vec<u32>,
}

impl Selection {
    /// Create a new empty selection
    pub fn new() -> Self {
        Self::default()
    }

    /// Clear the selection
    pub fn clear(&mut self) {
        self.atoms.clear();
        self.bonds.clear();
    }

    /// Add an atom to selection
    pub fn add_atom(&mut self, index: u32) {
        if !self.atoms.contains(&index) {
            self.atoms.push(index);
        }
    }

    /// Remove an atom from selection
    pub fn remove_atom(&mut self, index: u32) {
        self.atoms.retain(|&i| i != index);
    }

    /// Toggle atom selection
    pub fn toggle_atom(&mut self, index: u32) {
        if self.atoms.contains(&index) {
            self.remove_atom(index);
        } else {
            self.add_atom(index);
        }
    }

    /// Check if an atom is selected
    pub fn is_atom_selected(&self, index: u32) -> bool {
        self.atoms.contains(&index)
    }

    /// Get selection count
    pub fn count(&self) -> usize {
        self.atoms.len() + self.bonds.len()
    }

    /// Check if selection is empty
    pub fn is_empty(&self) -> bool {
        self.atoms.is_empty() && self.bonds.is_empty()
    }
}

/// Picking ray from screen coordinates
#[derive(Debug, Clone)]
pub struct PickRay {
    /// Ray origin (camera position)
    pub origin: glam::Vec3,
    /// Ray direction (normalized)
    pub direction: glam::Vec3,
}

/// Object picker using raycasting
pub struct Picker {
    /// Screen dimensions
    screen_size: Vec2,
}

impl Picker {
    /// Create a new picker
    pub fn new(width: u32, height: u32) -> Self {
        Self {
            screen_size: Vec2::new(width as f32, height as f32),
        }
    }

    /// Update screen dimensions
    pub fn resize(&mut self, width: u32, height: u32) {
        self.screen_size = Vec2::new(width as f32, height as f32);
    }

    /// Pick an object at screen coordinates
    pub fn pick(&self, screen_x: f32, screen_y: f32, structure: &Structure) -> PickedObject {
        // TODO: Implement ray-sphere intersection for atoms
        // TODO: Implement ray-cylinder intersection for bonds

        // Placeholder: simple distance check
        let closest = self.find_closest_atom(screen_x, screen_y, structure);

        match closest {
            Some(index) => PickedObject::Atom(index),
            None => PickedObject::None,
        }
    }

    /// Select objects within a rectangle
    pub fn select_rect(&self, _min: Vec2, _max: Vec2, _structure: &Structure) -> Selection {
        // TODO: Implement rectangle selection
        Selection::new()
    }

    /// Find closest atom to screen position (placeholder)
    fn find_closest_atom(&self, _x: f32, _y: f32, _structure: &Structure) -> Option<u32> {
        // TODO: Transform atoms to screen space and find closest
        None
    }
}

/// SMARTS query for substructure selection
pub struct SmartsQuery {
    /// The SMARTS pattern string
    pattern: String,
}

impl SmartsQuery {
    /// Create a new SMARTS query
    pub fn new(pattern: impl Into<String>) -> Self {
        Self {
            pattern: pattern.into(),
        }
    }

    /// Execute the query on a structure
    pub fn execute(&self, _structure: &Structure) -> Selection {
        // TODO: Integrate with a SMARTS parser (like RDKit bindings or pure Rust implementation)
        log::warn!("SMARTS queries not yet implemented: {}", self.pattern);
        Selection::new()
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_selection() {
        let mut sel = Selection::new();

        sel.add_atom(0);
        sel.add_atom(1);
        assert_eq!(sel.count(), 2);

        sel.toggle_atom(0); // Remove
        assert_eq!(sel.count(), 1);

        sel.toggle_atom(2); // Add
        assert_eq!(sel.count(), 2);
    }

    #[test]
    fn test_selection_clear() {
        let mut sel = Selection::new();
        sel.add_atom(0);
        sel.add_atom(1);
        sel.clear();
        assert!(sel.is_empty());
    }
}
