//! Cylform Core Library
//!
//! Core library for Cylform molecular visualization.
//!
//! ## Architecture
//!
//! - **molecule**: Data structures for atoms, bonds, and molecular topology
//! - **io**: File I/O using chemfiles (40+ formats)
//! - **camera**: Orbital camera controls
//! - **picker**: Object picking and selection

#![warn(missing_docs)]

pub mod camera;
pub mod io;
pub mod molecule;
pub mod picker;

use thiserror::Error;

/// Core library error type
#[derive(Error, Debug)]
pub enum CoreError {
    /// File I/O error
    #[error("File I/O error: {0}")]
    Io(#[from] io::IoError),

    /// GPU error
    #[error("GPU error: {0}")]
    Gpu(String),

    /// Invalid molecule data
    #[error("Invalid molecule data: {0}")]
    InvalidMolecule(String),
}

/// Result type alias for the core library
pub type Result<T> = std::result::Result<T, CoreError>;

/// Library version
pub const VERSION: &str = env!("CARGO_PKG_VERSION");

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_version() {
        assert!(!VERSION.is_empty());
    }
}
