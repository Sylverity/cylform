//! File I/O module for molecular structures
//!
//! Currently supports:
//! - XYZ format (full read/write)
//! - PDB format (basic read)
//!
//! Future: Full chemfiles integration for 40+ formats

use crate::molecule::{Atom, Structure};
use crate::{CoreError, Result};
use std::fs::{self, File};
use std::io::{self, BufRead, BufReader, Write};
use std::path::Path;

/// Maximum input file size accepted by the single-structure loaders.
pub const MAX_FILE_SIZE_BYTES: u64 = 25 * 1024 * 1024;

/// Maximum atom count accepted by the current real-time viewer path.
pub const MAX_ATOMS: usize = 5_000;

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

    /// File exceeds the current safety limit
    #[error("File is too large: {size_mb:.1} MB. Current limit is {limit_mb:.1} MB")]
    FileTooLarge {
        /// File size in megabytes
        size_mb: f64,
        /// File size limit in megabytes
        limit_mb: f64,
    },

    /// Molecule exceeds the current atom limit
    #[error("Molecule has too many atoms: {count}. Current limit is {limit}")]
    TooManyAtoms {
        /// Parsed or declared atom count
        count: usize,
        /// Atom count limit
        limit: usize,
    },

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
        let ext = path
            .extension()
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
    validate_file_size(path)?;

    let format = if format == FileFormat::Auto {
        FileFormat::from_path(path)
    } else {
        format
    };

    match format {
        FileFormat::Xyz => read_xyz(path),
        FileFormat::Pdb => read_pdb(path),
        FileFormat::Sdf => Err(CoreError::Io(IoError::UnsupportedFormat(
            "SDF/MOL files are not supported yet. Please open an XYZ or PDB file.".to_string(),
        ))),
        FileFormat::Auto => Err(CoreError::Io(IoError::UnsupportedFormat(
            "Could not determine file format. Supported formats are XYZ and PDB.".to_string(),
        ))),
    }
}

fn validate_file_size(path: &Path) -> Result<()> {
    let metadata =
        fs::metadata(path).map_err(|e| CoreError::Io(IoError::NotFound(e.to_string())))?;

    if !metadata.is_file() {
        return Err(CoreError::Io(IoError::Parse(
            "Selected path is not a file".to_string(),
        )));
    }

    if metadata.len() > MAX_FILE_SIZE_BYTES {
        return Err(CoreError::Io(IoError::FileTooLarge {
            size_mb: bytes_to_mb(metadata.len()),
            limit_mb: bytes_to_mb(MAX_FILE_SIZE_BYTES),
        }));
    }

    Ok(())
}

fn bytes_to_mb(bytes: u64) -> f64 {
    bytes as f64 / 1024.0 / 1024.0
}

fn parse_f32(value: &str, line_number: usize, axis: &str) -> Result<f32> {
    value.parse::<f32>().map_err(|_| {
        CoreError::Io(IoError::Parse(format!(
            "Invalid {axis} coordinate on line {line_number}: '{value}'"
        )))
    })
}

fn validate_atom_count(count: usize) -> Result<()> {
    if count > MAX_ATOMS {
        return Err(CoreError::Io(IoError::TooManyAtoms {
            count,
            limit: MAX_ATOMS,
        }));
    }

    Ok(())
}

/// Read XYZ format
fn read_xyz<P: AsRef<Path>>(path: P) -> Result<Structure> {
    let file = File::open(path).map_err(|e| CoreError::Io(IoError::NotFound(e.to_string())))?;
    let reader = BufReader::new(file);
    let mut lines = reader.lines();

    // First line: number of atoms
    let num_atoms: usize = lines
        .next()
        .ok_or_else(|| CoreError::Io(IoError::Parse("Empty file".to_string())))?
        .map_err(|e| CoreError::Io(IoError::Io(e)))?
        .trim()
        .parse()
        .map_err(|_| {
            CoreError::Io(IoError::Parse(
                "Invalid XYZ atom count on line 1".to_string(),
            ))
        })?;

    validate_atom_count(num_atoms)?;

    // Second line: comment/title
    let title = lines
        .next()
        .and_then(|r| r.ok())
        .map(|s| s.trim().to_string())
        .unwrap_or_else(|| "Untitled".to_string());

    let mut structure = Structure::new(title);

    // Remaining lines: atoms
    for i in 0..num_atoms {
        let line_number = i + 3;
        let line = lines.next().ok_or_else(|| {
            CoreError::Io(IoError::Parse(format!(
                "XYZ ended early: expected {num_atoms} atom rows, found {i}"
            )))
        })?;
        let line = line.map_err(|e| CoreError::Io(IoError::Io(e)))?;
        let parts: Vec<&str> = line.trim().split_whitespace().collect();
        if parts.len() < 4 {
            return Err(CoreError::Io(IoError::Parse(format!(
                "Malformed XYZ atom row on line {line_number}: expected element and x y z coordinates"
            ))));
        }

        let element = parts[0].to_string();
        if element.is_empty() {
            return Err(CoreError::Io(IoError::Parse(format!(
                "Missing element symbol on line {line_number}"
            ))));
        }

        let x = parse_f32(parts[1], line_number, "x")?;
        let y = parse_f32(parts[2], line_number, "y")?;
        let z = parse_f32(parts[3], line_number, "z")?;

        let atom = Atom::new(i as u32, &element, glam::Vec3::new(x, y, z));
        structure.add_atom(atom);
    }

    // Auto-perceive bonds
    structure.perceive_bonds();

    Ok(structure)
}

/// Read PDB format (basic support)
fn read_pdb<P: AsRef<Path>>(path: P) -> Result<Structure> {
    let file = File::open(path).map_err(|e| CoreError::Io(IoError::NotFound(e.to_string())))?;
    let reader = BufReader::new(file);

    let mut structure = Structure::new("PDB Structure");
    let mut atom_index = 0u32;

    for (line_index, line) in reader.lines().enumerate() {
        let line_number = line_index + 1;
        let line = line.map_err(|e| CoreError::Io(IoError::Io(e)))?;

        if line.starts_with("ATOM") || line.starts_with("HETATM") {
            // PDB format:
            // ATOM/HETATM serial name resName chainID resSeq x y z
            // Columns are fixed-width
            if line.len() < 54 {
                return Err(CoreError::Io(IoError::Parse(format!(
                    "Malformed PDB atom row on line {line_number}: expected coordinate columns"
                ))));
            }

            let element = if line.len() >= 78 {
                line[76..78].trim().to_string()
            } else {
                String::new()
            };
            let element = if element.is_empty() {
                // Try to get element from atom name (columns 12-16)
                if line.len() < 16 {
                    return Err(CoreError::Io(IoError::Parse(format!(
                        "Malformed PDB atom row on line {line_number}: expected atom name columns"
                    ))));
                }

                line[12..16]
                    .trim()
                    .chars()
                    .next()
                    .map(|c| c.to_string())
                    .unwrap_or_else(|| "C".to_string())
            } else {
                element
            };

            let x = parse_f32(line[30..38].trim(), line_number, "x")?;
            let y = parse_f32(line[38..46].trim(), line_number, "y")?;
            let z = parse_f32(line[46..54].trim(), line_number, "z")?;

            let atom = Atom::new(atom_index, &element, glam::Vec3::new(x, y, z));
            structure.add_atom(atom);
            atom_index += 1;

            validate_atom_count(structure.atom_count())?;
        }
    }

    if structure.atoms.is_empty() {
        return Err(CoreError::Io(IoError::Parse(
            "No atoms found in PDB file".to_string(),
        )));
    }

    // Auto-perceive bonds
    structure.perceive_bonds();

    Ok(structure)
}

/// Write a structure to XYZ format
pub fn write_xyz<P: AsRef<Path>>(path: P, structure: &Structure) -> Result<()> {
    let mut file = File::create(path).map_err(|e| CoreError::Io(IoError::Io(e)))?;

    // Write header
    writeln!(file, "{}", structure.atom_count()).map_err(|e| CoreError::Io(IoError::Io(e)))?;
    writeln!(file, "{}", structure.name).map_err(|e| CoreError::Io(IoError::Io(e)))?;

    // Write atoms
    for atom in &structure.atoms {
        writeln!(
            file,
            "{} {:>12.6} {:>12.6} {:>12.6}",
            atom.element, atom.position.x, atom.position.y, atom.position.z
        )
        .map_err(|e| CoreError::Io(IoError::Io(e)))?;
    }

    Ok(())
}

/// Write a structure to a file (format determined by extension)
pub fn write_structure<P: AsRef<Path>>(
    path: P,
    structure: &Structure,
    format: FileFormat,
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
            "Only XYZ write supported currently".to_string(),
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
    fn test_rejects_oversized_xyz_declared_atom_count() {
        let xyz_content = format!("{}\nToo large\n", MAX_ATOMS + 1);
        let mut temp_file = NamedTempFile::new().unwrap();
        temp_file.write_all(xyz_content.as_bytes()).unwrap();

        let err = read_structure(temp_file.path(), FileFormat::Xyz).unwrap_err();
        assert!(err.to_string().contains("too many atoms"));
    }

    #[test]
    fn test_rejects_invalid_xyz_atom_count() {
        let xyz_content = "not-a-number\nBad count\n";
        let mut temp_file = NamedTempFile::new().unwrap();
        temp_file.write_all(xyz_content.as_bytes()).unwrap();

        let err = read_structure(temp_file.path(), FileFormat::Xyz).unwrap_err();
        assert!(err.to_string().contains("Invalid XYZ atom count"));
    }

    #[test]
    fn test_rejects_invalid_xyz_coordinate() {
        let xyz_content = "1\nBad coordinate\nC nope 0.0 0.0\n";
        let mut temp_file = NamedTempFile::new().unwrap();
        temp_file.write_all(xyz_content.as_bytes()).unwrap();

        let err = read_structure(temp_file.path(), FileFormat::Xyz).unwrap_err();
        assert!(err.to_string().contains("Invalid x coordinate on line 3"));
    }

    #[test]
    fn test_rejects_unsupported_sdf_and_mol() {
        let mut sdf_file = tempfile::Builder::new().suffix(".sdf").tempfile().unwrap();
        let mut mol_file = tempfile::Builder::new().suffix(".mol").tempfile().unwrap();
        sdf_file.write_all(b"unsupported").unwrap();
        mol_file.write_all(b"unsupported").unwrap();

        let sdf_err = read_structure(sdf_file.path(), FileFormat::Auto).unwrap_err();
        let mol_err = read_structure(mol_file.path(), FileFormat::Auto).unwrap_err();

        assert!(sdf_err
            .to_string()
            .contains("SDF/MOL files are not supported"));
        assert!(mol_err
            .to_string()
            .contains("SDF/MOL files are not supported"));
    }

    #[test]
    fn test_rejects_short_pdb_atom_line() {
        let pdb_content = "ATOM      1  C\n";
        let mut temp_file = NamedTempFile::new().unwrap();
        temp_file.write_all(pdb_content.as_bytes()).unwrap();

        let err = read_structure(temp_file.path(), FileFormat::Pdb).unwrap_err();
        assert!(err.to_string().contains("Malformed PDB atom row on line 1"));
    }

    #[test]
    fn test_rejects_invalid_pdb_coordinate() {
        let pdb_content =
            "ATOM      1  C   LIG A   1       BAD   0.000   0.000  1.00  0.00           C\n";
        let mut temp_file = NamedTempFile::new().unwrap();
        temp_file.write_all(pdb_content.as_bytes()).unwrap();

        let err = read_structure(temp_file.path(), FileFormat::Pdb).unwrap_err();
        assert!(err.to_string().contains("Invalid x coordinate on line 1"));
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
