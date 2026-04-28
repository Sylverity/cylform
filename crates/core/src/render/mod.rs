//! wgpu-based rendering engine for Cylform
//!
//! Features:
//! - GPU-instanced cylinder rendering for bonds (the CYLview signature look)
//! - Impostor spheres for atoms (compact, performance-friendly)
//! - Quadrant lighting system (4-point lighting for attractive highlights)
//! - Clean, publication-quality defaults

mod context;
mod mesh;
mod pipeline;
mod shaders;

pub use context::RenderContext;
pub use mesh::{CylinderMesh, InstanceData, SphereImpostor};
pub use pipeline::{AtomPipeline, BondPipeline};

use crate::camera::Camera;
use crate::molecule::Structure;

/// Main renderer coordinating all rendering operations
pub struct Renderer {
    /// GPU context and device
    context: RenderContext,

    /// Bond rendering pipeline (cylinder instancing)
    bond_pipeline: BondPipeline,

    /// Atom rendering pipeline (impostor spheres)
    atom_pipeline: AtomPipeline,

    /// Cylinder mesh for bonds
    cylinder_mesh: CylinderMesh,

    /// Sphere impostor quad for atoms
    sphere_impostor: SphereImpostor,
}

impl Renderer {
    /// Create a new renderer with the given window
    pub async fn new<W>(window: &'static W) -> anyhow::Result<Self>
    where
        W: raw_window_handle::HasWindowHandle + raw_window_handle::HasDisplayHandle + Send + Sync,
    {
        let context = RenderContext::new(window).await?;
        let cylinder_mesh = CylinderMesh::new(&context.device);
        let sphere_impostor = SphereImpostor::new(&context.device);

        let bond_pipeline = BondPipeline::new(&context);
        let atom_pipeline = AtomPipeline::new(&context);

        Ok(Self {
            context,
            bond_pipeline,
            atom_pipeline,
            cylinder_mesh,
            sphere_impostor,
        })
    }

    /// Resize the render surface
    pub fn resize(&mut self, width: u32, height: u32) {
        self.context.resize(width, height);
    }

    /// Render a frame
    pub fn render(&mut self, structure: &Structure, camera: &Camera) -> anyhow::Result<()> {
        // Prepare instance data from structure
        let bond_instances = self.prepare_bond_instances(structure);
        let atom_instances = self.prepare_atom_instances(structure);

        // Create instance buffers
        let bond_instance_buffer = if !bond_instances.is_empty() {
            Some(
                self.bond_pipeline
                    .create_instance_buffer(&self.context.device, &bond_instances),
            )
        } else {
            None
        };

        let atom_instance_buffer = if !atom_instances.is_empty() {
            Some(
                self.atom_pipeline
                    .create_instance_buffer(&self.context.device, &atom_instances),
            )
        } else {
            None
        };

        // Update camera uniforms
        self.bond_pipeline
            .update_camera(&self.context.queue, camera);
        self.atom_pipeline
            .update_camera(&self.context.queue, camera);

        // Get the current frame
        let surface_texture = self.context.surface.get_current_texture()?;
        let view = surface_texture
            .texture
            .create_view(&wgpu::TextureViewDescriptor::default());

        // Create command encoder
        let mut encoder =
            self.context
                .device
                .create_command_encoder(&wgpu::CommandEncoderDescriptor {
                    label: Some("render_encoder"),
                });

        // Render pass
        {
            let mut render_pass = encoder.begin_render_pass(&wgpu::RenderPassDescriptor {
                label: Some("render_pass"),
                color_attachments: &[Some(wgpu::RenderPassColorAttachment {
                    view: &view,
                    resolve_target: None,
                    ops: wgpu::Operations {
                        load: wgpu::LoadOp::Clear(wgpu::Color {
                            r: 0.95, // Light gray background (CYLview style)
                            g: 0.95,
                            b: 0.95,
                            a: 1.0,
                        }),
                        store: wgpu::StoreOp::Store,
                    },
                })],
                depth_stencil_attachment: Some(wgpu::RenderPassDepthStencilAttachment {
                    view: &self.context.depth_texture_view,
                    depth_ops: Some(wgpu::Operations {
                        load: wgpu::LoadOp::Clear(1.0),
                        store: wgpu::StoreOp::Store,
                    }),
                    stencil_ops: None,
                }),
                occlusion_query_set: None,
                timestamp_writes: None,
            });

            // Render bonds (cylinders) first
            if let Some(ref buffer) = bond_instance_buffer {
                self.bond_pipeline.render(
                    &mut render_pass,
                    &self.cylinder_mesh,
                    buffer,
                    bond_instances.len() as u32,
                );
            }

            // Render atoms (impostor spheres) on top
            if let Some(ref buffer) = atom_instance_buffer {
                self.atom_pipeline.render(
                    &mut render_pass,
                    &self.sphere_impostor,
                    buffer,
                    atom_instances.len() as u32,
                );
            }
        }

        // Submit commands
        self.context.queue.submit(std::iter::once(encoder.finish()));
        surface_texture.present();

        Ok(())
    }

    /// Prepare bond instance data from structure
    fn prepare_bond_instances(&self, structure: &Structure) -> Vec<InstanceData> {
        let mut instances = Vec::with_capacity(structure.bonds.len());

        for bond in &structure.bonds {
            let atom1 = &structure.atoms[bond.atom1 as usize];
            let atom2 = &structure.atoms[bond.atom2 as usize];

            // Calculate cylinder transform
            let start = atom1.position;
            let end = atom2.position;
            let mid = (start + end) * 0.5;
            let dir = (end - start).normalize();
            let length = start.distance(end);

            // Bond radius based on order
            let radius = bond.order.radius_multiplier();

            // Default bond color (CPK-ish, but stylized)
            let color = [0.3, 0.5, 0.7, 1.0]; // Blue-ish default

            instances.push(InstanceData::cylinder(mid, dir, length, radius, color));
        }

        instances
    }

    /// Prepare atom instance data from structure
    fn prepare_atom_instances(&self, structure: &Structure) -> Vec<InstanceData> {
        structure
            .atoms
            .iter()
            .map(|atom| {
                let color = atom.default_color();
                InstanceData::sphere(
                    atom.position,
                    atom.radius * 0.8, // Slightly smaller for CYLview look
                    color,
                )
            })
            .collect()
    }
}
