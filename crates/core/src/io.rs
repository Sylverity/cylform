//! File I/O module for molecular structures
//!
//! Currently supports:
//! - XYZ format (full read/write)
//! - PDB format (basic read)
//!
//! Future: Full chemfiles integration for 40+ formats

use crate::molecule::{Atom, AtomMetadata, Bond, BondOrder, Structure};
use crate::{CoreError, Result};
use std::fs::{self, File};
use std::io::{self, BufRead, BufReader, Write};
use std::path::Path;

fn text_value(value: &str) -> Option<String> {
    let trimmed = value.trim();
    if trimmed.is_empty() {
        None
    } else {
        Some(trimmed.to_string())
    }
}

fn parse_optional_i32(value: &str) -> Option<i32> {
    value.trim().parse::<i32>().ok()
}

fn parse_optional_f32(value: &str) -> Option<f32> {
    value.trim().parse::<f32>().ok()
}

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

fn parse_energy_from_title(title: &str) -> Option<f64> {
    let normalized = title
        .replace(['=', ':', ','], " ")
        .split_whitespace()
        .map(str::to_string)
        .collect::<Vec<_>>();

    for (index, token) in normalized.iter().enumerate() {
        let key = token.trim().to_ascii_lowercase();
        if matches!(key.as_str(), "e" | "energy" | "ener") {
            if let Some(value) = normalized.get(index + 1) {
                if let Ok(parsed) = value.parse::<f64>() {
                    return Some(parsed);
                }
            }
        }

        if let Some(value) = key.strip_prefix("energy=") {
            if let Ok(parsed) = value.parse::<f64>() {
                return Some(parsed);
            }
        }
    }

    None
}

fn detect_xyz_frame_count(lines: &[String], first_atom_count: usize) -> usize {
    let mut index = first_atom_count + 2;
    let mut count = 1;

    while index < lines.len() {
        while index < lines.len() && lines[index].trim().is_empty() {
            index += 1;
        }

        if index >= lines.len() {
            break;
        }

        let Ok(atom_count) = lines[index].trim().parse::<usize>() else {
            break;
        };

        if atom_count > MAX_ATOMS || index + 1 + atom_count >= lines.len() + 1 {
            break;
        }

        count += 1;
        index += atom_count + 2;
    }

    count
}

fn pdb_col(line: &str, start: usize, end: usize) -> &str {
    line.get(start..end).unwrap_or("").trim()
}

fn pdb_record_text(line: &str) -> &str {
    line.get(10..).unwrap_or("").trim()
}

fn infer_pdb_element(atom_name: &str) -> String {
    let letters: String = atom_name
        .chars()
        .filter(|c| c.is_ascii_alphabetic())
        .collect();
    if letters.is_empty() {
        return "C".to_string();
    }

    let mut chars = letters.chars();
    let first = chars.next().map(|c| c.to_ascii_uppercase()).unwrap_or('C');
    let second = chars.next().map(|c| c.to_ascii_lowercase());

    match second {
        Some(second) if matches!(format!("{first}{second}").as_str(), "Cl" | "Br") => {
            format!("{first}{second}")
        }
        _ => first.to_string(),
    }
}

fn pdb_display_name(
    header: Option<String>,
    title: Option<String>,
    compound: Option<String>,
) -> String {
    title
        .or(header)
        .or(compound)
        .unwrap_or_else(|| "PDB Structure".to_string())
}

/// Read XYZ format
fn read_xyz<P: AsRef<Path>>(path: P) -> Result<Structure> {
    let file = File::open(path).map_err(|e| CoreError::Io(IoError::NotFound(e.to_string())))?;
    let reader = BufReader::new(file);
    let lines: Vec<String> = reader
        .lines()
        .collect::<io::Result<Vec<_>>>()
        .map_err(|e| CoreError::Io(IoError::Io(e)))?;

    // First line: number of atoms
    let num_atoms: usize = lines
        .first()
        .ok_or_else(|| CoreError::Io(IoError::Parse("Empty file".to_string())))?
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
        .get(1)
        .map(|s| s.trim().to_string())
        .unwrap_or_else(|| "Untitled".to_string());

    let frame_count = detect_xyz_frame_count(&lines, num_atoms);
    let energy = parse_energy_from_title(&title);
    let mut structure = Structure::new(title.clone());
    structure.metadata.source_format = Some("XYZ".to_string());
    structure.metadata.title = Some(title.clone());
    structure.metadata.frame_count = Some(frame_count);
    structure.metadata.loaded_frame_index = Some(1);
    structure.metadata.energy = energy;
    if energy.is_some() {
        structure.metadata.energy_unit = Some("unknown".to_string());
    }

    // Remaining lines: atoms
    for i in 0..num_atoms {
        let line_number = i + 3;
        let line = lines.get(i + 2).ok_or_else(|| {
            CoreError::Io(IoError::Parse(format!(
                "XYZ ended early: expected {num_atoms} atom rows, found {i}"
            )))
        })?;
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
        if parts.len() > 4
            && !structure
                .metadata
                .warnings
                .iter()
                .any(|warning| warning.contains("extra XYZ atom columns"))
        {
            structure.metadata.warnings.push(
                "Detected extra XYZ atom columns; CYLview-NG preserves coordinates only for now."
                    .to_string(),
            );
        }

        let atom = Atom::new(i as u32, &element, glam::Vec3::new(x, y, z));
        structure.add_atom(atom);
    }

    if frame_count > 1 {
        structure.metadata.warnings.push(format!(
            "Detected {frame_count} XYZ frames; currently displaying frame 1."
        ));
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
    structure.metadata.source_format = Some("PDB".to_string());
    structure.metadata.loaded_frame_index = Some(1);
    let mut atom_index = 0u32;
    let mut serial_to_index = std::collections::HashMap::<i32, u32>::new();
    let mut conect_pairs = Vec::<(i32, i32)>::new();
    let mut header: Option<String> = None;
    let mut title_parts = Vec::<String>::new();
    let mut compound_parts = Vec::<String>::new();
    let mut model_count = 0usize;
    let mut inside_first_model = false;
    let mut finished_first_model = false;
    let mut saw_model = false;

    for (line_index, line) in reader.lines().enumerate() {
        let line_number = line_index + 1;
        let line = line.map_err(|e| CoreError::Io(IoError::Io(e)))?;
        let record = line.get(0..6).unwrap_or("").trim();

        match record {
            "HEADER" => {
                if header.is_none() {
                    header = text_value(pdb_record_text(&line));
                }
            }
            "TITLE" => {
                if let Some(value) = text_value(pdb_record_text(&line)) {
                    title_parts.push(value);
                }
            }
            "COMPND" => {
                if let Some(value) = text_value(pdb_record_text(&line)) {
                    compound_parts.push(value);
                }
            }
            "MODEL" => {
                saw_model = true;
                model_count += 1;
                inside_first_model = model_count == 1;
            }
            "ENDMDL" => {
                if inside_first_model {
                    finished_first_model = true;
                    inside_first_model = false;
                }
            }
            "CONECT" => {
                let parts = line.split_whitespace().collect::<Vec<_>>();
                if let Some(source) = parts.get(1).and_then(|value| value.parse::<i32>().ok()) {
                    for target in parts
                        .iter()
                        .skip(2)
                        .filter_map(|value| value.parse::<i32>().ok())
                    {
                        conect_pairs.push((source, target));
                    }
                }
            }
            _ => {}
        }

        let should_read_atom = !saw_model || (inside_first_model && !finished_first_model);
        if should_read_atom && (line.starts_with("ATOM") || line.starts_with("HETATM")) {
            // PDB format:
            // ATOM/HETATM serial name resName chainID resSeq x y z
            // Columns are fixed-width
            if line.len() < 54 {
                return Err(CoreError::Io(IoError::Parse(format!(
                    "Malformed PDB atom row on line {line_number}: expected coordinate columns"
                ))));
            }

            let atom_name = pdb_col(&line, 12, 16).to_string();
            let element = pdb_col(&line, 76, 78).to_string();
            let element = if element.is_empty() {
                // Try to get element from atom name (columns 12-16)
                if line.len() < 16 {
                    return Err(CoreError::Io(IoError::Parse(format!(
                        "Malformed PDB atom row on line {line_number}: expected atom name columns"
                    ))));
                }

                infer_pdb_element(&atom_name)
            } else {
                element
            };

            let x = parse_f32(pdb_col(&line, 30, 38), line_number, "x")?;
            let y = parse_f32(pdb_col(&line, 38, 46), line_number, "y")?;
            let z = parse_f32(pdb_col(&line, 46, 54), line_number, "z")?;

            let serial = parse_optional_i32(pdb_col(&line, 6, 11));
            let mut atom = Atom::new(atom_index, &element, glam::Vec3::new(x, y, z));
            atom.metadata = Some(AtomMetadata {
                record_type: Some(record.to_string()),
                serial,
                atom_name: text_value(&atom_name),
                alt_loc: text_value(pdb_col(&line, 16, 17)),
                residue_name: text_value(pdb_col(&line, 17, 20)),
                chain_id: text_value(pdb_col(&line, 21, 22)),
                residue_sequence: parse_optional_i32(pdb_col(&line, 22, 26)),
                insertion_code: text_value(pdb_col(&line, 26, 27)),
                occupancy: parse_optional_f32(pdb_col(&line, 54, 60)),
                b_factor: parse_optional_f32(pdb_col(&line, 60, 66)),
                formal_charge: text_value(pdb_col(&line, 78, 80)),
            });
            structure.add_atom(atom);
            if let Some(serial) = serial {
                serial_to_index.insert(serial, atom_index);
            }
            atom_index += 1;

            validate_atom_count(structure.atom_count())?;
        }
    }

    if structure.atoms.is_empty() {
        return Err(CoreError::Io(IoError::Parse(
            "No atoms found in PDB file".to_string(),
        )));
    }

    let title = if title_parts.is_empty() {
        None
    } else {
        Some(title_parts.join(" "))
    };
    let compound = if compound_parts.is_empty() {
        None
    } else {
        Some(compound_parts.join(" "))
    };
    structure.name = pdb_display_name(header.clone(), title.clone(), compound.clone());
    structure.metadata.title = Some(structure.name.clone());
    structure.metadata.frame_count = Some(if saw_model { model_count.max(1) } else { 1 });
    if saw_model && model_count > 1 {
        structure.metadata.warnings.push(format!(
            "Detected {model_count} PDB models; currently displaying model 1."
        ));
    }

    let mut added_conect = std::collections::HashSet::<(u32, u32)>::new();
    for (source_serial, target_serial) in conect_pairs {
        let (Some(&source), Some(&target)) = (
            serial_to_index.get(&source_serial),
            serial_to_index.get(&target_serial),
        ) else {
            continue;
        };
        if source == target {
            continue;
        }
        let pair = if source < target {
            (source, target)
        } else {
            (target, source)
        };
        if added_conect.insert(pair) {
            structure.add_bond(Bond::new(pair.0, pair.1, BondOrder::Single));
        }
    }

    if structure.bonds.is_empty() {
        structure.perceive_bonds();
    }

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
        assert_eq!(structure.metadata.source_format.as_deref(), Some("XYZ"));
        assert_eq!(structure.metadata.title.as_deref(), Some("Water molecule"));
    }

    #[test]
    fn test_xyz_energy_metadata() {
        let xyz_content = "1\nenergy=-123.456 hartree\nC 0.0 0.0 0.0\n";
        let mut temp_file = NamedTempFile::new().unwrap();
        temp_file.write_all(xyz_content.as_bytes()).unwrap();

        let structure = read_structure(temp_file.path(), FileFormat::Xyz).unwrap();

        assert_eq!(structure.name, "energy=-123.456 hartree");
        assert_eq!(structure.metadata.energy, Some(-123.456));
    }

    #[test]
    fn test_xyz_detects_multiframe_and_extra_columns() {
        let xyz_content = r#"2
step 1 E -1.0
C 0.0 0.0 0.0 charge=0.1
H 0.7 0.0 0.0 velocity 1
2
step 2 E -0.9
C 0.0 0.0 0.0
H 0.8 0.0 0.0
"#;
        let mut temp_file = NamedTempFile::new().unwrap();
        temp_file.write_all(xyz_content.as_bytes()).unwrap();

        let structure = read_structure(temp_file.path(), FileFormat::Xyz).unwrap();

        assert_eq!(structure.atom_count(), 2);
        assert_eq!(structure.metadata.frame_count, Some(2));
        assert_eq!(structure.metadata.loaded_frame_index, Some(1));
        assert!(structure
            .metadata
            .warnings
            .iter()
            .any(|warning| warning.contains("extra XYZ atom columns")));
        assert!(structure
            .metadata
            .warnings
            .iter()
            .any(|warning| warning.contains("2 XYZ frames")));
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
    fn test_pdb_captures_atom_metadata_and_title() {
        let pdb_content = "\
HEADER    TEST HEADER\n\
TITLE     EXAMPLE PDB TITLE\n\
ATOM      7  CA AMET B  42      12.345  23.456  34.567  0.50 19.75           C1+\n\
END\n";
        let mut temp_file = NamedTempFile::new().unwrap();
        temp_file.write_all(pdb_content.as_bytes()).unwrap();

        let structure = read_structure(temp_file.path(), FileFormat::Pdb).unwrap();
        let metadata = structure.atoms[0].metadata.as_ref().unwrap();

        assert_eq!(structure.name, "EXAMPLE PDB TITLE");
        assert_eq!(structure.metadata.source_format.as_deref(), Some("PDB"));
        assert_eq!(metadata.record_type.as_deref(), Some("ATOM"));
        assert_eq!(metadata.serial, Some(7));
        assert_eq!(metadata.atom_name.as_deref(), Some("CA"));
        assert_eq!(metadata.alt_loc.as_deref(), Some("A"));
        assert_eq!(metadata.residue_name.as_deref(), Some("MET"));
        assert_eq!(metadata.chain_id.as_deref(), Some("B"));
        assert_eq!(metadata.residue_sequence, Some(42));
        assert_eq!(metadata.occupancy, Some(0.5));
        assert_eq!(metadata.b_factor, Some(19.75));
        assert_eq!(metadata.formal_charge.as_deref(), Some("1+"));
    }

    #[test]
    fn test_pdb_uses_conect_records_for_bonds() {
        let pdb_content = "\
HETATM    1  C1  LIG A   1       0.000   0.000   0.000  1.00  0.00           C\n\
HETATM    2  O1  LIG A   1       5.000   0.000   0.000  1.00  0.00           O\n\
CONECT    1    2\n\
CONECT    2    1\n\
END\n";
        let mut temp_file = NamedTempFile::new().unwrap();
        temp_file.write_all(pdb_content.as_bytes()).unwrap();

        let structure = read_structure(temp_file.path(), FileFormat::Pdb).unwrap();

        assert_eq!(structure.bond_count(), 1);
        assert_eq!(structure.bonds[0].atom1, 0);
        assert_eq!(structure.bonds[0].atom2, 1);
    }

    #[test]
    fn test_pdb_detects_multimodel_and_loads_first_model() {
        let pdb_content = "\
MODEL        1\n\
ATOM      1  C   LIG A   1       0.000   0.000   0.000  1.00  0.00           C\n\
ENDMDL\n\
MODEL        2\n\
ATOM      2  O   LIG A   1       1.000   0.000   0.000  1.00  0.00           O\n\
ENDMDL\n";
        let mut temp_file = NamedTempFile::new().unwrap();
        temp_file.write_all(pdb_content.as_bytes()).unwrap();

        let structure = read_structure(temp_file.path(), FileFormat::Pdb).unwrap();

        assert_eq!(structure.atom_count(), 1);
        assert_eq!(structure.atoms[0].element, "C");
        assert_eq!(structure.metadata.frame_count, Some(2));
        assert!(structure
            .metadata
            .warnings
            .iter()
            .any(|warning| warning.contains("2 PDB models")));
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
