//! File I/O module for molecular structures
//! 
//! Currently supports:
//! - XYZ format (full read/write)
//! - PDB format (basic read)
//! 
//! Future: Full chemfiles integration for 40+ formats

use crate::molecule::{Atom, Structure};
use crate::{Result, CoreError};
use std::path::Path;
use std::fs::File;
use std::io::{self, BufRead, BufReader, Write};

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
    
    /// I/O error
    #[error("I/O error: {0}")]
    Io(#[from] io::Error),
}

/// File format enumeration
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum FileFormat {
    /// XYZ format
    Xyz,
    /// PDB format (partial support)
    Pdb,
    /// SDF/MOL format
    Sdf,
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
/// # Example
/// ```no_run
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
    
    match format {
        FileFormat::Xyz => read_xyz(path),
        FileFormat::Pdb => read_pdb(path),
        FileFormat::Sdf => Err(CoreError::Io(IoError::UnsupportedFormat(
            "SDF support coming soon".to_string()
        ))),
        FileFormat::Auto => Err(CoreError::Io(IoError::UnsupportedFormat(
            "Could not determine file format".to_string()
        ))),
    }
}

/// Read XYZ format
fn read_xyz<P: AsRef<Path>>(path: P) -> Result<Structure> {
    let file = File::open(path)
        .map_err(|e| CoreError::Io(IoError::NotFound(e.to_string())))?;
    let reader = BufReader::new(file);
    let mut lines = reader.lines();
    
    // First line: number of atoms
    let num_atoms: usize = lines.next()
        .ok_or_else(|| CoreError::Io(IoError::Parse("Empty file".to_string())))?
        .map_err(|e| CoreError::Io(IoError::Io(e)))?
        .trim()
        .parse()
        .map_err(|_| CoreError::Io(IoError::Parse("Invalid atom count".to_string())))?;
    
    // Second line: comment/title
    let title = lines.next()
        .and_then(|r| r.ok())
        .map(|s| s.trim().to_string())
        .unwrap_or_else(|| "Untitled".to_string());
    
    let mut structure = Structure::new(title);
    
    // Remaining lines: atoms
    for (i, line) in lines.take(num_atoms).enumerate() {
        let line = line.map_err(|e| CoreError::Io(IoError::Io(e)))?;
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

/// Read PDB format (basic support)
fn read_pdb<P: AsRef<Path>>(path: P) -> Result<Structure> {
    let file = File::open(path)
        .map_err(|e| CoreError::Io(IoError::NotFound(e.to_string())))?;
    let reader = BufReader::new(file);
    
    let mut structure = Structure::new("PDB Structure");
    let mut atom_index = 0u32;
    
    for line in reader.lines() {
        let line = line.map_err(|e| CoreError::Io(IoError::Io(e)))?;
        
        if line.starts_with("ATOM") || line.starts_with("HETATM") {
            // PDB format: 
            // ATOM/HETATM serial name resName chainID resSeq x y z
            // Columns are fixed-width
            if line.len() < 54 {
                continue;
            }
            
            let element = line[76..78].trim().to_string();
            let element = if element.is_empty() {
                // Try to get element from atom name (columns 12-16)
                line[12..16].trim().chars().next()
                    .map(|c| c.to_string())
                    .unwrap_or_else(|| "C".to_string())
            } else {
                element
            };
            
            let x: f32 = line[30..38].trim().parse().unwrap_or(0.0);
            let y: f32 = line[38..46].trim().parse().unwrap_or(0.0);
            let z: f32 = line[46..54].trim().parse().unwrap_or(0.0);
            
            let atom = Atom::new(atom_index, &element, glam::Vec3::new(x, y, z));
            structure.add_atom(atom);
            atom_index += 1;
        }
    }
    
    if structure.atoms.is_empty() {
        return Err(CoreError::Io(IoError::Parse(
            "No atoms found in PDB file".to_string()
        )));
    }
    
    // Auto-perceive bonds
    structure.perceive_bonds();
    
    Ok(structure)
}

/// Write a structure to XYZ format
pub fn write_xyz<P: AsRef<Path>>(path: P, structure: &Structure) -> Result<()> {
    let mut file = File::create(path)
        .map_err(|e| CoreError::Io(IoError::Io(e)))?;
    
    // Write header
    writeln!(file, "{}", structure.atom_count())
        .map_err(|e| CoreError::Io(IoError::Io(e)))?;
    writeln!(file, "{}", structure.name)
        .map_err(|e| CoreError::Io(IoError::Io(e)))?;
    
    // Write atoms
    for atom in &structure.atoms {
        writeln!(file, "{} {:>12.6} {:>12.6} {:>12.6}",
            atom.element,
            atom.position.x,
            atom.position.y,
            atom.position.z
        ).map_err(|e| CoreError::Io(IoError::Io(e)))?;
    }
    
    Ok(())
}

/// Write a structure to a file (format determined by extension)
pub fn write_structure<P: AsRef<Path>>(
    path: P, 
    structure: &Structure, 
    format: FileFormat
) -> Result<()> {
    let path = path.as_ref();
    let format = if format == FileFormat::Auto {
        FileFormat::from_path(path)
    } else {
        format
    };
    
    match format {
        FileFormat::Xyz => write_xyz(path, structure),
        _ => Err(CoreError::Io(IoError::UnsupportedFormat(
            "Only XYZ write supported currently".to_string()
        ))),
    }
}

/// Read multiple frames (trajectory) - currently only returns single frame
pub fn read_trajectory<P: AsRef<Path>>(path: P, format: FileFormat) -> Result<Vec<Structure>> {
    // For now, just read single structure
    // Future: Support multi-frame XYZ, XTC, TRR, etc.
    let structure = read_structure(path, format)?;
    Ok(vec![structure])
}

/// Get list of supported formats
pub fn supported_formats() -> Vec<(&'static str, &'static str)> {
    vec![
        ("XYZ", "Standard XYZ format (full support)"),
        ("PDB", "Protein Data Bank (basic read support)"),
        ("SDF/MOL", "MDL Structure Data File (planned)"),
        ("chemfiles", "40+ formats via chemfiles (planned)"),
    ]
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
        assert_eq!(structure.atoms[0].element, "O");
        assert!(structure.bond_count() > 0);
    }
    
    #[test]
    fn test_write_xyz() {
        let mut structure = Structure::new("test");
        structure.add_atom(Atom::new(0, "C", glam::Vec3::new(0.0, 0.0, 0.0)));
        structure.add_atom(Atom::new(1, "H", glam::Vec3::new(1.0, 0.0, 0.0)));
        
        let temp_file = NamedTempFile::new().unwrap();
        write_structure(temp_file.path(), &structure, FileFormat::Xyz).unwrap();
        
        // Read it back
        let read_structure = read_structure(temp_file.path(), FileFormat::Xyz).unwrap();
        assert_eq!(read_structure.atom_count(), 2);
    }
    
    #[test]
    fn test_format_detection() {
        assert_eq!(FileFormat::from_path("test.xyz"), FileFormat::Xyz);
        assert_eq!(FileFormat::from_path("test.pdb"), FileFormat::Pdb);
        assert_eq!(FileFormat::from_path("test.sdf"), FileFormat::Sdf);
    }
    
    #[test]
    fn test_xyz_roundtrip() {
        // Create a structure
        let mut original = Structure::new("Test Molecule");
        original.add_atom(Atom::new(0, "C", glam::Vec3::new(1.0, 2.0, 3.0)));
        original.add_atom(Atom::new(1, "O", glam::Vec3::new(4.0, 5.0, 6.0)));
        original.add_atom(Atom::new(2, "N", glam::Vec3::new(7.0, 8.0, 9.0)));
        
        // Write and read back
        let temp_file = NamedTempFile::new().unwrap();
        write_xyz(temp_file.path(), &original).unwrap();
        
        let loaded = read_xyz(temp_file.path()).unwrap();
        
        assert_eq!(loaded.atom_count(), 3);
        assert_eq!(loaded.atoms[0].element, "C");
        assert!((loaded.atoms[0].position.x - 1.0).abs() < 0.001);
    }
}
