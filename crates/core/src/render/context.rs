//! Render context - wgpu device, queue, and surface management

use wgpu::{Device, Queue, Surface, SurfaceConfiguration};
use raw_window_handle::{HasWindowHandle, HasDisplayHandle};

/// GPU context holding device, queue, and surface
pub struct RenderContext {
    /// wgpu instance
    #[allow(dead_code)]
    pub instance: wgpu::Instance,
    
    /// Surface for presenting to window
    pub surface: Surface<'static>,
    
    /// Surface configuration
    pub config: SurfaceConfiguration,
    
    /// GPU device
    pub device: Device,
    
    /// Command queue
    pub queue: Queue,
    
    /// Depth texture for depth testing
    pub depth_texture: wgpu::Texture,
    
    /// Depth texture view
    pub depth_texture_view: wgpu::TextureView,
}

impl RenderContext {
    /// Create a new render context for the given window
    pub async fn new<W>(window: &'static W) -> anyhow::Result<Self> 
    where
        W: HasWindowHandle + HasDisplayHandle + Send + Sync,
    {
        let instance = wgpu::Instance::new(wgpu::InstanceDescriptor {
            backends: wgpu::Backends::all(),
            dx12_shader_compiler: Default::default(),
            flags: wgpu::InstanceFlags::default(),
            gles_minor_version: wgpu::Gles3MinorVersion::Automatic,
        });
        
        // Create surface
        let surface = instance.create_surface(window)?;
        
        // Request adapter
        let adapter = instance
            .request_adapter(&wgpu::RequestAdapterOptions {
                power_preference: wgpu::PowerPreference::HighPerformance,
                compatible_surface: Some(&surface),
                force_fallback_adapter: false,
            })
            .await
            .ok_or_else(|| anyhow::anyhow!("Failed to find suitable GPU adapter"))?;
        
        log::info!("Using GPU adapter: {:?}", adapter.get_info().name);
        
        // Request device
        let (device, queue) = adapter
            .request_device(
                &wgpu::DeviceDescriptor {
                    required_features: wgpu::Features::empty(),
                    required_limits: wgpu::Limits::default(),
                    label: Some("device"),
                },
                None,
            )
            .await?;
        
        // Configure surface
        let surface_caps = surface.get_capabilities(&adapter);
        let surface_format = surface_caps
            .formats
            .iter()
            .find(|f| f.is_srgb())
            .copied()
            .unwrap_or(surface_caps.formats[0]);
        
        // Get initial size (will be updated by resize)
        let config = wgpu::SurfaceConfiguration {
            usage: wgpu::TextureUsages::RENDER_ATTACHMENT,
            format: surface_format,
            width: 800,
            height: 600,
            present_mode: surface_caps.present_modes[0],
            alpha_mode: surface_caps.alpha_modes[0],
            view_formats: vec![],
            desired_maximum_frame_latency: 2,
        };
        
        surface.configure(&device, &config);
        
        // Create initial depth texture
        let (depth_texture, depth_texture_view) = create_depth_texture(&device, &config);
        
        Ok(Self {
            instance,
            surface,
            config,
            device,
            queue,
            depth_texture,
            depth_texture_view,
        })
    }
    
    /// Resize the render surface
    pub fn resize(&mut self, width: u32, height: u32) {
        if width == 0 || height == 0 {
            return;
        }
        
        self.config.width = width;
        self.config.height = height;
        self.surface.configure(&self.device, &self.config);
        
        // Recreate depth texture
        let (depth_texture, depth_texture_view) = create_depth_texture(&self.device, &self.config);
        self.depth_texture = depth_texture;
        self.depth_texture_view = depth_texture_view;
    }
}

/// Create a depth texture for depth testing
fn create_depth_texture(
    device: &Device,
    config: &SurfaceConfiguration,
) -> (wgpu::Texture, wgpu::TextureView) {
    let size = wgpu::Extent3d {
        width: config.width,
        height: config.height,
        depth_or_array_layers: 1,
    };
    
    let texture = device.create_texture(&wgpu::TextureDescriptor {
        label: Some("depth_texture"),
        size,
        mip_level_count: 1,
        sample_count: 1,
        dimension: wgpu::TextureDimension::D2,
        format: wgpu::TextureFormat::Depth32Float,
        usage: wgpu::TextureUsages::RENDER_ATTACHMENT,
        view_formats: &[],
    });
    
    let view = texture.create_view(&wgpu::TextureViewDescriptor::default());
    
    (texture, view)
}
