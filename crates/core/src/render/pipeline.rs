//! Render pipelines for bonds and atoms

use wgpu::util::DeviceExt;
use crate::camera::Camera;
use super::{
    context::RenderContext,
    mesh::{CylinderMesh, SphereImpostor, InstanceData},
    shaders,
};

/// Uniform buffer data for camera
#[repr(C)]
#[derive(Clone, Copy, bytemuck::Pod, bytemuck::Zeroable)]
struct CameraUniform {
    view_proj: [[f32; 4]; 4],
    view_pos: [f32; 4],
}

impl CameraUniform {
    fn from_camera(camera: &Camera) -> Self {
        let view_proj = camera.view_projection_matrix();
        let view_pos = camera.position();
        
        Self {
            view_proj: view_proj.to_cols_array_2d(),
            view_pos: [view_pos.x, view_pos.y, view_pos.z, 1.0],
        }
    }
}

/// Pipeline for rendering bonds (cylinders)
pub struct BondPipeline {
    pipeline: wgpu::RenderPipeline,
    #[allow(dead_code)]
    camera_bind_group_layout: wgpu::BindGroupLayout,
    #[allow(dead_code)]
    lighting_bind_group_layout: wgpu::BindGroupLayout,
    lighting_bind_group: wgpu::BindGroup,
    camera_buffer: wgpu::Buffer,
    camera_bind_group: wgpu::BindGroup,
}

impl BondPipeline {
    /// Create the bond rendering pipeline
    pub fn new(context: &RenderContext) -> Self {
        let device = &context.device;
        let config = &context.config;
        
        // Create bind group layouts
        let camera_bind_group_layout = device.create_bind_group_layout(&wgpu::BindGroupLayoutDescriptor {
            entries: &[wgpu::BindGroupLayoutEntry {
                binding: 0,
                visibility: wgpu::ShaderStages::VERTEX,
                ty: wgpu::BindingType::Buffer {
                    ty: wgpu::BufferBindingType::Uniform,
                    has_dynamic_offset: false,
                    min_binding_size: None,
                },
                count: None,
            }],
            label: Some("camera_bind_group_layout"),
        });
        
        let lighting_bind_group_layout = device.create_bind_group_layout(&wgpu::BindGroupLayoutDescriptor {
            entries: &[wgpu::BindGroupLayoutEntry {
                binding: 0,
                visibility: wgpu::ShaderStages::VERTEX | wgpu::ShaderStages::FRAGMENT,
                ty: wgpu::BindingType::Buffer {
                    ty: wgpu::BufferBindingType::Uniform,
                    has_dynamic_offset: false,
                    min_binding_size: None,
                },
                count: None,
            }],
            label: Some("lighting_bind_group_layout"),
        });
        
        let pipeline_layout = device.create_pipeline_layout(&wgpu::PipelineLayoutDescriptor {
            label: Some("bond_pipeline_layout"),
            bind_group_layouts: &[&camera_bind_group_layout, &lighting_bind_group_layout],
            push_constant_ranges: &[],
        });
        
        // Compile shaders
        let vertex_shader = device.create_shader_module(wgpu::ShaderModuleDescriptor {
            label: Some("cylinder_vertex"),
            source: wgpu::ShaderSource::Wgsl(shaders::CYLINDER_VERTEX_SHADER.into()),
        });
        
        let fragment_shader = device.create_shader_module(wgpu::ShaderModuleDescriptor {
            label: Some("cylinder_fragment"),
            source: wgpu::ShaderSource::Wgsl(shaders::CYLINDER_FRAGMENT_SHADER.into()),
        });
        
        let pipeline = device.create_render_pipeline(&wgpu::RenderPipelineDescriptor {
            label: Some("bond_pipeline"),
            layout: Some(&pipeline_layout),
            vertex: wgpu::VertexState {
                module: &vertex_shader,
                entry_point: "main",
                buffers: &[CylinderMesh::vertex_layout(), InstanceData::layout()],
            },
            fragment: Some(wgpu::FragmentState {
                module: &fragment_shader,
                entry_point: "main",
                targets: &[Some(wgpu::ColorTargetState {
                    format: config.format,
                    blend: Some(wgpu::BlendState::ALPHA_BLENDING),
                    write_mask: wgpu::ColorWrites::ALL,
                })],
            }),
            primitive: wgpu::PrimitiveState {
                topology: wgpu::PrimitiveTopology::TriangleList,
                strip_index_format: None,
                front_face: wgpu::FrontFace::Ccw,
                cull_mode: Some(wgpu::Face::Back),
                polygon_mode: wgpu::PolygonMode::Fill,
                unclipped_depth: false,
                conservative: false,
            },
            depth_stencil: Some(wgpu::DepthStencilState {
                format: wgpu::TextureFormat::Depth32Float,
                depth_write_enabled: true,
                depth_compare: wgpu::CompareFunction::Less,
                stencil: wgpu::StencilState::default(),
                bias: wgpu::DepthBiasState::default(),
            }),
            multisample: wgpu::MultisampleState {
                count: 1,
                mask: !0,
                alpha_to_coverage_enabled: false,
            },
            multiview: None,
        });
        
        // Create lighting uniform buffer with default CYLview lighting
        let lighting_data = shaders::default_lighting_uniform();
        let lighting_buffer = device.create_buffer_init(&wgpu::util::BufferInitDescriptor {
            label: Some("lighting_buffer"),
            contents: bytemuck::cast_slice(&lighting_data),
            usage: wgpu::BufferUsages::UNIFORM | wgpu::BufferUsages::COPY_DST,
        });
        
        let lighting_bind_group = device.create_bind_group(&wgpu::BindGroupDescriptor {
            layout: &lighting_bind_group_layout,
            entries: &[wgpu::BindGroupEntry {
                binding: 0,
                resource: lighting_buffer.as_entire_binding(),
            }],
            label: Some("lighting_bind_group"),
        });
        
        // Create reusable camera buffer
        let camera_buffer = device.create_buffer(&wgpu::BufferDescriptor {
            label: Some("camera_buffer"),
            size: std::mem::size_of::<CameraUniform>() as u64,
            usage: wgpu::BufferUsages::UNIFORM | wgpu::BufferUsages::COPY_DST,
            mapped_at_creation: false,
        });
        
        let camera_bind_group = device.create_bind_group(&wgpu::BindGroupDescriptor {
            layout: &camera_bind_group_layout,
            entries: &[wgpu::BindGroupEntry {
                binding: 0,
                resource: camera_buffer.as_entire_binding(),
            }],
            label: Some("camera_bind_group"),
        });
        
        Self {
            pipeline,
            camera_bind_group_layout,
            lighting_bind_group_layout,
            lighting_bind_group,
            camera_buffer,
            camera_bind_group,
        }
    }
    
    /// Update camera uniform
    pub fn update_camera(&self, queue: &wgpu::Queue, camera: &Camera) {
        let camera_uniform = CameraUniform::from_camera(camera);
        queue.write_buffer(&self.camera_buffer, 0, bytemuck::cast_slice(&[camera_uniform]));
    }
    
    /// Render bonds
    pub fn render<'a>(
        &'a self,
        render_pass: &mut wgpu::RenderPass<'a>,
        mesh: &'a CylinderMesh,
        instance_buffer: &'a wgpu::Buffer,
        instance_count: u32,
    ) {
        render_pass.set_pipeline(&self.pipeline);
        render_pass.set_bind_group(0, &self.camera_bind_group, &[]);
        render_pass.set_bind_group(1, &self.lighting_bind_group, &[]);
        render_pass.set_vertex_buffer(0, mesh.vertex_buffer.slice(..));
        render_pass.set_vertex_buffer(1, instance_buffer.slice(..));
        render_pass.set_index_buffer(mesh.index_buffer.slice(..), wgpu::IndexFormat::Uint16);
        render_pass.draw_indexed(0..mesh.index_count, 0, 0..instance_count);
    }
    
    /// Create an instance buffer for bonds
    pub fn create_instance_buffer(&self, device: &wgpu::Device, instances: &[InstanceData]) -> wgpu::Buffer {
        device.create_buffer_init(&wgpu::util::BufferInitDescriptor {
            label: Some("bond_instances"),
            contents: bytemuck::cast_slice(instances),
            usage: wgpu::BufferUsages::VERTEX,
        })
    }
}

/// Pipeline for rendering atoms (sphere impostors)
pub struct AtomPipeline {
    pipeline: wgpu::RenderPipeline,
    #[allow(dead_code)]
    camera_bind_group_layout: wgpu::BindGroupLayout,
    #[allow(dead_code)]
    lighting_bind_group_layout: wgpu::BindGroupLayout,
    lighting_bind_group: wgpu::BindGroup,
    camera_buffer: wgpu::Buffer,
    camera_bind_group: wgpu::BindGroup,
}

impl AtomPipeline {
    /// Create the atom rendering pipeline
    pub fn new(context: &RenderContext) -> Self {
        let device = &context.device;
        let config = &context.config;
        
        let camera_bind_group_layout = device.create_bind_group_layout(&wgpu::BindGroupLayoutDescriptor {
            entries: &[wgpu::BindGroupLayoutEntry {
                binding: 0,
                visibility: wgpu::ShaderStages::VERTEX,
                ty: wgpu::BindingType::Buffer {
                    ty: wgpu::BufferBindingType::Uniform,
                    has_dynamic_offset: false,
                    min_binding_size: None,
                },
                count: None,
            }],
            label: Some("camera_bind_group_layout"),
        });
        
        let lighting_bind_group_layout = device.create_bind_group_layout(&wgpu::BindGroupLayoutDescriptor {
            entries: &[wgpu::BindGroupLayoutEntry {
                binding: 0,
                visibility: wgpu::ShaderStages::VERTEX | wgpu::ShaderStages::FRAGMENT,
                ty: wgpu::BindingType::Buffer {
                    ty: wgpu::BufferBindingType::Uniform,
                    has_dynamic_offset: false,
                    min_binding_size: None,
                },
                count: None,
            }],
            label: Some("lighting_bind_group_layout"),
        });
        
        let pipeline_layout = device.create_pipeline_layout(&wgpu::PipelineLayoutDescriptor {
            label: Some("atom_pipeline_layout"),
            bind_group_layouts: &[&camera_bind_group_layout, &lighting_bind_group_layout],
            push_constant_ranges: &[],
        });
        
        let vertex_shader = device.create_shader_module(wgpu::ShaderModuleDescriptor {
            label: Some("sphere_vertex"),
            source: wgpu::ShaderSource::Wgsl(shaders::SPHERE_VERTEX_SHADER.into()),
        });
        
        let fragment_shader = device.create_shader_module(wgpu::ShaderModuleDescriptor {
            label: Some("sphere_fragment"),
            source: wgpu::ShaderSource::Wgsl(shaders::SPHERE_FRAGMENT_SHADER.into()),
        });
        
        let pipeline = device.create_render_pipeline(&wgpu::RenderPipelineDescriptor {
            label: Some("atom_pipeline"),
            layout: Some(&pipeline_layout),
            vertex: wgpu::VertexState {
                module: &vertex_shader,
                entry_point: "main",
                buffers: &[SphereImpostor::vertex_layout(), InstanceData::layout()],
            },
            fragment: Some(wgpu::FragmentState {
                module: &fragment_shader,
                entry_point: "main",
                targets: &[Some(wgpu::ColorTargetState {
                    format: config.format,
                    blend: Some(wgpu::BlendState::ALPHA_BLENDING),
                    write_mask: wgpu::ColorWrites::ALL,
                })],
            }),
            primitive: wgpu::PrimitiveState {
                topology: wgpu::PrimitiveTopology::TriangleList,
                strip_index_format: None,
                front_face: wgpu::FrontFace::Ccw,
                cull_mode: None, // Don't cull for impostors
                polygon_mode: wgpu::PolygonMode::Fill,
                unclipped_depth: false,
                conservative: false,
            },
            depth_stencil: Some(wgpu::DepthStencilState {
                format: wgpu::TextureFormat::Depth32Float,
                depth_write_enabled: true,
                depth_compare: wgpu::CompareFunction::Less,
                stencil: wgpu::StencilState::default(),
                bias: wgpu::DepthBiasState {
                    constant: -1, // Slight bias to prevent z-fighting with bonds
                    slope_scale: 0.0,
                    clamp: 0.0,
                },
            }),
            multisample: wgpu::MultisampleState {
                count: 1,
                mask: !0,
                alpha_to_coverage_enabled: false,
            },
            multiview: None,
        });
        
        // Reuse same lighting data as bonds
        let lighting_data = shaders::default_lighting_uniform();
        let lighting_buffer = device.create_buffer_init(&wgpu::util::BufferInitDescriptor {
            label: Some("atom_lighting_buffer"),
            contents: bytemuck::cast_slice(&lighting_data),
            usage: wgpu::BufferUsages::UNIFORM | wgpu::BufferUsages::COPY_DST,
        });
        
        let lighting_bind_group = device.create_bind_group(&wgpu::BindGroupDescriptor {
            layout: &lighting_bind_group_layout,
            entries: &[wgpu::BindGroupEntry {
                binding: 0,
                resource: lighting_buffer.as_entire_binding(),
            }],
            label: Some("atom_lighting_bind_group"),
        });
        
        let camera_buffer = device.create_buffer(&wgpu::BufferDescriptor {
            label: Some("atom_camera_buffer"),
            size: std::mem::size_of::<CameraUniform>() as u64,
            usage: wgpu::BufferUsages::UNIFORM | wgpu::BufferUsages::COPY_DST,
            mapped_at_creation: false,
        });
        
        let camera_bind_group = device.create_bind_group(&wgpu::BindGroupDescriptor {
            layout: &camera_bind_group_layout,
            entries: &[wgpu::BindGroupEntry {
                binding: 0,
                resource: camera_buffer.as_entire_binding(),
            }],
            label: Some("atom_camera_bind_group"),
        });
        
        Self {
            pipeline,
            camera_bind_group_layout,
            lighting_bind_group_layout,
            lighting_bind_group,
            camera_buffer,
            camera_bind_group,
        }
    }
    
    /// Update camera uniform
    pub fn update_camera(&self, queue: &wgpu::Queue, camera: &Camera) {
        let camera_uniform = CameraUniform::from_camera(camera);
        queue.write_buffer(&self.camera_buffer, 0, bytemuck::cast_slice(&[camera_uniform]));
    }
    
    /// Render atoms
    pub fn render<'a>(
        &'a self,
        render_pass: &mut wgpu::RenderPass<'a>,
        mesh: &'a SphereImpostor,
        instance_buffer: &'a wgpu::Buffer,
        instance_count: u32,
    ) {
        render_pass.set_pipeline(&self.pipeline);
        render_pass.set_bind_group(0, &self.camera_bind_group, &[]);
        render_pass.set_bind_group(1, &self.lighting_bind_group, &[]);
        render_pass.set_vertex_buffer(0, mesh.vertex_buffer.slice(..));
        render_pass.set_vertex_buffer(1, instance_buffer.slice(..));
        render_pass.set_index_buffer(mesh.index_buffer.slice(..), wgpu::IndexFormat::Uint16);
        render_pass.draw_indexed(0..6, 0, 0..instance_count);
    }
    
    /// Create an instance buffer for atoms
    pub fn create_instance_buffer(&self, device: &wgpu::Device, instances: &[InstanceData]) -> wgpu::Buffer {
        device.create_buffer_init(&wgpu::util::BufferInitDescriptor {
            label: Some("atom_instances"),
            contents: bytemuck::cast_slice(instances),
            usage: wgpu::BufferUsages::VERTEX,
        })
    }
}
