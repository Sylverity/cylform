//! Mesh generation for cylinders and sphere impostors

use bytemuck::{Pod, Zeroable};
use wgpu::util::DeviceExt;
use glam::{Vec3, Mat4, Quat};

/// Vertex layout for mesh data
#[repr(C)]
#[derive(Clone, Copy, Pod, Zeroable, Debug)]
pub struct Vertex {
    pub position: [f32; 3],
    pub normal: [f32; 3],
    pub uv: [f32; 2],
}

/// Instance data for GPU instancing
#[repr(C)]
#[derive(Clone, Copy, Pod, Zeroable, Debug)]
pub struct InstanceData {
    /// Model transform matrix (4x3 for efficiency)
    pub transform: [f32; 12],
    /// Color (RGBA)
    pub color: [f32; 4],
    /// Additional data (radius, length, etc.)
    pub params: [f32; 4],
}

impl InstanceData {
    /// Create instance data for a cylinder
    pub fn cylinder(
        position: Vec3,
        direction: Vec3,
        length: f32,
        radius: f32,
        color: [f32; 4],
    ) -> Self {
        // Build rotation to align cylinder (default up is Y) with direction
        let up = Vec3::Y;
        let rotation = if direction.dot(up) > 0.999 {
            // Already aligned
            Quat::IDENTITY
        } else if direction.dot(up) < -0.999 {
            // Opposite direction
            Quat::from_axis_angle(Vec3::X, std::f32::consts::PI)
        } else {
            let axis = up.cross(direction).normalize();
            let angle = up.dot(direction).acos();
            Quat::from_axis_angle(axis, angle)
        };
        
        // Scale: cylinder mesh is unit length, radius 1
        let scale = Vec3::new(radius, length * 0.5, radius);
        let transform = Mat4::from_scale_rotation_translation(scale, rotation, position);
        
        // Convert to 4x3 matrix (3 rows of 4)
        let transform_cols = transform.to_cols_array();
        Self {
            transform: [
                transform_cols[0], transform_cols[1], transform_cols[2], transform_cols[3],
                transform_cols[4], transform_cols[5], transform_cols[6], transform_cols[7],
                transform_cols[8], transform_cols[9], transform_cols[10], transform_cols[11],
            ],
            color,
            params: [radius, length, 0.0, 0.0],
        }
    }
    
    /// Create instance data for a sphere impostor
    pub fn sphere(position: Vec3, radius: f32, color: [f32; 4]) -> Self {
        let transform = Mat4::from_translation(position) * Mat4::from_scale(Vec3::splat(radius));
        let transform_cols = transform.to_cols_array();
        
        Self {
            transform: [
                transform_cols[0], transform_cols[1], transform_cols[2], transform_cols[3],
                transform_cols[4], transform_cols[5], transform_cols[6], transform_cols[7],
                transform_cols[8], transform_cols[9], transform_cols[10], transform_cols[11],
            ],
            color,
            params: [radius, 0.0, 0.0, 0.0],
        }
    }
    
    /// Vertex buffer layout descriptor
    pub fn layout() -> wgpu::VertexBufferLayout<'static> {
        wgpu::VertexBufferLayout {
            array_stride: std::mem::size_of::<InstanceData>() as wgpu::BufferAddress,
            step_mode: wgpu::VertexStepMode::Instance,
            attributes: &[
                // Transform matrix (4 floats per row, 3 rows)
                wgpu::VertexAttribute {
                    offset: 0,
                    shader_location: 3,
                    format: wgpu::VertexFormat::Float32x4,
                },
                wgpu::VertexAttribute {
                    offset: 16,
                    shader_location: 4,
                    format: wgpu::VertexFormat::Float32x4,
                },
                wgpu::VertexAttribute {
                    offset: 32,
                    shader_location: 5,
                    format: wgpu::VertexFormat::Float32x4,
                },
                // Color
                wgpu::VertexAttribute {
                    offset: 48,
                    shader_location: 6,
                    format: wgpu::VertexFormat::Float32x4,
                },
                // Params
                wgpu::VertexAttribute {
                    offset: 64,
                    shader_location: 7,
                    format: wgpu::VertexFormat::Float32x4,
                },
            ],
        }
    }
}

/// Cylinder mesh for rendering bonds
pub struct CylinderMesh {
    /// Vertex buffer
    pub vertex_buffer: wgpu::Buffer,
    /// Index buffer
    pub index_buffer: wgpu::Buffer,
    /// Number of indices
    pub index_count: u32,
}

impl CylinderMesh {
    /// Create a cylinder mesh with given radial segments
    /// Default cylinder is aligned along Y axis, length 1, radius 1
    pub fn new(device: &wgpu::Device) -> Self {
        let segments = 16; // Number of radial segments
        let mut vertices = Vec::new();
        let mut indices = Vec::new();
        
        // Generate cylinder vertices
        // Top and bottom caps + side
        
        // Center points for caps
        let top_center = Vertex {
            position: [0.0, 0.5, 0.0],
            normal: [0.0, 1.0, 0.0],
            uv: [0.5, 0.5],
        };
        let bottom_center = Vertex {
            position: [0.0, -0.5, 0.0],
            normal: [0.0, -1.0, 0.0],
            uv: [0.5, 0.5],
        };
        
        let top_center_idx = vertices.len() as u32;
        vertices.push(top_center);
        let bottom_center_idx = vertices.len() as u32;
        vertices.push(bottom_center);
        
        // Generate ring vertices
        let ring_start = vertices.len() as u32;
        for i in 0..segments {
            let angle = (i as f32 / segments as f32) * std::f32::consts::TAU;
            let cos = angle.cos();
            let sin = angle.sin();
            
            // Top ring vertex
            vertices.push(Vertex {
                position: [cos * 1.0, 0.5, sin * 1.0],
                normal: [0.0, 1.0, 0.0],
                uv: [(cos + 1.0) * 0.5, (sin + 1.0) * 0.5],
            });
            
            // Side top vertex (with correct normal)
            vertices.push(Vertex {
                position: [cos * 1.0, 0.5, sin * 1.0],
                normal: [cos, 0.0, sin],
                uv: [i as f32 / segments as f32, 1.0],
            });
            
            // Side bottom vertex
            vertices.push(Vertex {
                position: [cos * 1.0, -0.5, sin * 1.0],
                normal: [cos, 0.0, sin],
                uv: [i as f32 / segments as f32, 0.0],
            });
            
            // Bottom ring vertex
            vertices.push(Vertex {
                position: [cos * 1.0, -0.5, sin * 1.0],
                normal: [0.0, -1.0, 0.0],
                uv: [(cos + 1.0) * 0.5, (sin + 1.0) * 0.5],
            });
        }
        
        // Generate indices for caps and sides
        for i in 0..segments {
            let next = (i + 1) % segments;
            let base = ring_start + i * 4;
            let next_base = ring_start + next * 4;
            
            // Top cap (top_center, top_ring[i], top_ring[next])
            indices.extend_from_slice(&[
                top_center_idx,
                base,        // top ring
                next_base,   // next top ring
            ]);
            
            // Bottom cap (bottom_center, bottom_ring[next], bottom_ring[i])
            indices.extend_from_slice(&[
                bottom_center_idx,
                next_base + 3, // next bottom ring
                base + 3,      // bottom ring
            ]);
            
            // Side quad (two triangles)
            indices.extend_from_slice(&[
                base + 1,      // side top
                next_base + 1, // next side top
                next_base + 2, // next side bottom
                base + 1,      // side top
                next_base + 2, // next side bottom
                base + 2,      // side bottom
            ]);
        }
        
        let vertex_buffer = device.create_buffer_init(&wgpu::util::BufferInitDescriptor {
            label: Some("cylinder_vertices"),
            contents: bytemuck::cast_slice(&vertices),
            usage: wgpu::BufferUsages::VERTEX,
        });
        
        let index_buffer = device.create_buffer_init(&wgpu::util::BufferInitDescriptor {
            label: Some("cylinder_indices"),
            contents: bytemuck::cast_slice(&indices),
            usage: wgpu::BufferUsages::INDEX,
        });
        
        Self {
            vertex_buffer,
            index_buffer,
            index_count: indices.len() as u32,
        }
    }
    
    /// Vertex buffer layout
    pub fn vertex_layout() -> wgpu::VertexBufferLayout<'static> {
        wgpu::VertexBufferLayout {
            array_stride: std::mem::size_of::<Vertex>() as wgpu::BufferAddress,
            step_mode: wgpu::VertexStepMode::Vertex,
            attributes: &[
                // Position
                wgpu::VertexAttribute {
                    offset: 0,
                    shader_location: 0,
                    format: wgpu::VertexFormat::Float32x3,
                },
                // Normal
                wgpu::VertexAttribute {
                    offset: 12,
                    shader_location: 1,
                    format: wgpu::VertexFormat::Float32x3,
                },
                // UV
                wgpu::VertexAttribute {
                    offset: 24,
                    shader_location: 2,
                    format: wgpu::VertexFormat::Float32x2,
                },
            ],
        }
    }
}

/// Sphere impostor (billboard quad for rendering spheres)
pub struct SphereImpostor {
    /// Vertex buffer
    pub vertex_buffer: wgpu::Buffer,
    /// Index buffer
    pub index_buffer: wgpu::Buffer,
}

impl SphereImpostor {
    /// Create a quad for sphere impostor rendering
    pub fn new(device: &wgpu::Device) -> Self {
        // A simple quad that will be billboarded in the fragment shader
        let vertices = [
            // Position (will be scaled by instance), normal (pointing out), uv
            Vertex { position: [-1.0, -1.0, 0.0], normal: [0.0, 0.0, 1.0], uv: [0.0, 0.0] },
            Vertex { position: [ 1.0, -1.0, 0.0], normal: [0.0, 0.0, 1.0], uv: [1.0, 0.0] },
            Vertex { position: [ 1.0,  1.0, 0.0], normal: [0.0, 0.0, 1.0], uv: [1.0, 1.0] },
            Vertex { position: [-1.0,  1.0, 0.0], normal: [0.0, 0.0, 1.0], uv: [0.0, 1.0] },
        ];
        
        let indices: [u16; 6] = [0, 1, 2, 0, 2, 3];
        
        let vertex_buffer = device.create_buffer_init(&wgpu::util::BufferInitDescriptor {
            label: Some("sphere_vertices"),
            contents: bytemuck::cast_slice(&vertices),
            usage: wgpu::BufferUsages::VERTEX,
        });
        
        let index_buffer = device.create_buffer_init(&wgpu::util::BufferInitDescriptor {
            label: Some("sphere_indices"),
            contents: bytemuck::cast_slice(&indices),
            usage: wgpu::BufferUsages::INDEX,
        });
        
        Self {
            vertex_buffer,
            index_buffer,
        }
    }
    
    /// Vertex buffer layout (same as cylinder)
    pub fn vertex_layout() -> wgpu::VertexBufferLayout<'static> {
        CylinderMesh::vertex_layout()
    }
}
