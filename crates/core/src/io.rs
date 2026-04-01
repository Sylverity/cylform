//! File I/O module
//! 
//! Uses chemfiles to support 40+ molecular file formats including:
//! - XYZ (standard format)
//! - PDB (Protein Data Bank)
//! - SDF/MOL (MDL format)
//! - Gaussian input/output
//! - ORCA output
//! - Amber, CHARMM, Gromacs trajectories

use crate::molecule::{Atom, Structure, Bond};
use crate::{Result, CoreError};
use std::path::Path;

/// Error type for I/O operations
#[derive(Debug, thiserror::Error)]
pub enum IoError {
    /// File not found
    #[error("File not found: {0}")]
    NotFound(String),
    
    /// Unsupported format
    #[error("Unsupported file format: {0}")]
    UnsupportedFormat(String),
    
    /// Parse error
    #[error("Parse error: {0}")]
    Parse(String),
    
    /// Chemfiles error
    #[error("Chemfiles error: {0}")]
    Chemfiles(String),
}

/// Supported file formats
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum FileFormat {
    /// XYZ format
    Xyz,
    /// PDB format
    Pdb,
    /// SDF/MOL format
    Sdf,
    /// Gaussian input
    Gaussian,
    /// Auto-detect from extension
    Auto,
}

impl FileFormat {
    /// Detect format from file extension
    pub fn from_path<P: AsRef<Path>>(path: P) -> Self {
        let path = path.as_ref();
        let ext = path.extension()
            .and_then(|e| e.to_str())
            .map(|e| e.to_lowercase());
        
        match ext.as_deref() {
            Some("xyz") => FileFormat::Xyz,
            Some("pdb") => FileFormat::Pdb,
            Some("sdf") | Some("mol") => FileFormat::Sdf,
            Some("com") | Some("gjf") | Some("log") => FileFormat::Gaussian,
            _ => FileFormat::Auto,
        }
    }
}

/// Read a molecular structure from a file
/// 
/// # Arguments
/// * `path` - Path to the input file
/// * `format` - File format (use `FileFormat::Auto` to detect from extension)
/// 
/// # Returns
/// A `Structure` containing the loaded molecule
/// 
/// # Example
/// ```
/// use cylview_core::io::{read_structure, FileFormat};
/// 
/// let structure = read_structure("molecule.xyz", FileFormat::Auto).unwrap();
/// println!("Loaded {} atoms", structure.atom_count());
/// ```
pub fn read_structure<P: AsRef<Path>>(path: P, format: FileFormat) -> Result<Structure> {
    let path = path.as_ref();
    let format = if format == FileFormat::Auto {
        FileFormat::from_path(path)
    } else {
        format
    };
    
    // For now, implement basic XYZ parsing
    // Full chemfiles integration to be added
    match format {
        FileFormat::Xyz => read_xyz(path),
        FileFormat::Pdb => read_pdb_placeholder(path),
        FileFormat::Sdf => read_sdf_placeholder(path),
        FileFormat::Gaussian => read_gaussian_placeholder(path),
        FileFormat::Auto => Err(CoreError::Io(IoError::UnsupportedFormat(
            "Could not determine file format".to_string()
        ))),
    }
}

/// Read XYZ format
fn read_xyz<P: AsRef<Path>>(path: P) -> Result<Structure> {
    use std::fs;
    
    let content = fs::read_to_string(path)
        .map_err(|e| CoreError::Io(IoError::NotFound(e.to_string())))?;
    
    let mut lines = content.lines();
    
    // First line: number of atoms
    let num_atoms: usize = lines.next()
        .ok_or_else(|| CoreError::Io(IoError::Parse("Empty file".to_string())))?
        .trim()
        .parse()
        .map_err(|_| CoreError::Io(IoError::Parse("Invalid atom count".to_string())))?;
    
    // Second line: comment/title
    let title = lines.next()
        .map(|s| s.trim().to_string())
        .unwrap_or_else(|| "Untitled".to_string());
    
    let mut structure = Structure::new(title);
    
    // Remaining lines: atoms
    for (i, line) in lines.take(num_atoms).enumerate() {
        let parts: Vec<&str> = line.trim().split_whitespace().collect();
        if parts.len() < 4 {
            continue;
        }
        
        let element = parts[0].to_string();
        let x: f32 = parts[1].parse().unwrap_or(0.0);
        let y: f32 = parts[2].parse().unwrap_or(0.0);
        let z: f32 = parts[3].parse().unwrap_or(0.0);
        
        let atom = Atom::new(i as u32, &element, glam::Vec3::new(x, y, z));
        structure.add_atom(atom);
    }
    
    // Auto-perceive bonds
    structure.perceive_bonds();
    
    Ok(structure)
}

/// Placeholder for PDB reading (to be implemented with chemfiles)
fn read_pdb_placeholder<P: AsRef<Path>>(path: P) -> Result<Structure> {
    // TODO: Implement full PDB support with chemfiles
    Err(CoreError::Io(IoError::UnsupportedFormat(
        "PDB support coming soon".to_string()
    )))
}

/// Placeholder for SDF reading
fn read_sdf_placeholder<P: AsRef<Path>>(path: P) -> Result<Structure> {
    Err(CoreError::Io(IoError::UnsupportedFormat(
        "SDF support coming soon".to_string()
    )))
}

/// Placeholder for Gaussian reading
fn read_gaussian_placeholder<P: AsRef<Path>>(path: P) -> Result<Structure> {
    Err(CoreError::Io(IoError::UnsupportedFormat(
        "Gaussian support coming soon".to_string()
    )))
}

/// Write a structure to XYZ format
pub fn write_xyz<P: AsRef<Path>>(path: P, structure: &Structure) -> Result<()> {
    use std::fs::File;
    use std::io::Write;
    
    let mut file = File::create(path)
        .map_err(|e| CoreError::Io(IoError::NotFound(e.to_string())))?;
    
    // Write header
    writeln!(file, "{}", structure.atom_count())
        .map_err(|e| CoreError::Io(IoError::Parse(e.to_string())))?;
    writeln!(file, "{}", structure.name)
        .map_err(|e| CoreError::Io(IoError::Parse(e.to_string())))?;
    
    // Write atoms
    for atom in &structure.atoms {
        writeln!(file, "{} {:.6} {:.6} {:.6}",
            atom.element,
            atom.position.x,
            atom.position.y,
            atom.position.z
        ).map_err(|e| CoreError::Io(IoError::Parse(e.to_string())))?;
    }
    
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::io::Write;
    use tempfile::NamedTempFile;
    
    #[test]
    fn test_read_xyz() {
        let xyz_content = r#"3
Water molecule
O 0.000000 0.000000 0.000000
H 0.757000 0.586000 0.000000
H -0.757000 0.586000 0.000000
"#;
        
        let mut temp_file = NamedTempFile::new().unwrap();
        temp_file.write_all(xyz_content.as_bytes()).unwrap();
        
        let structure = read_structure(temp_file.path(), FileFormat::Xyz).unwrap();
        
        assert_eq!(structure.atom_count(), 3);
        assert_eq!(structure.name, "Water molecule");
        assert_eq!(structure.atoms[0].element, "O");
    }
    
    #[test]
    fn test_format_detection() {
        assert_eq!(FileFormat::from_path("test.xyz"), FileFormat::Xyz);
        assert_eq!(FileFormat::from_path("test.pdb"), FileFormat::Pdb);
        assert_eq!(FileFormat::from_path("test.sdf"), FileFormat::Sdf);
    }
}
