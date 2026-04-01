//! WGSL shaders for CYLview-style rendering

/// Vertex shader for cylinder bonds
pub const CYLINDER_VERTEX_SHADER: &str = r#"
struct CameraUniform {
    view_proj: mat4x4<f32>,
    view_pos: vec4<f32>,
};

struct LightingUniform {
    // Four quadrant light directions
    light_dirs: array<vec4<f32>, 4>,
    // Four quadrant light colors
    light_colors: array<vec4<f32>, 4>,
};

@group(0) @binding(0)
var<uniform> camera: CameraUniform;

@group(1) @binding(0)
var<uniform> lighting: LightingUniform;

struct VertexInput {
    @location(0) position: vec3<f32>,
    @location(1) normal: vec3<f32>,
    @location(2) uv: vec2<f32>,
};

struct InstanceInput {
    @location(3) transform_0: vec4<f32>,
    @location(4) transform_1: vec4<f32>,
    @location(5) transform_2: vec4<f32>,
    @location(6) color: vec4<f32>,
    @location(7) params: vec4<f32>,
};

struct VertexOutput {
    @builtin(position) clip_position: vec4<f32>,
    @location(0) world_position: vec3<f32>,
    @location(1) world_normal: vec3<f32>,
    @location(2) color: vec4<f32>,
    @location(3) uv: vec2<f32>,
};

@vertex
fn main(
    vertex: VertexInput,
    instance: InstanceInput,
) -> VertexOutput {
    // Reconstruct transform matrix from rows
    let transform = mat4x4<f32>(
        instance.transform_0,
        instance.transform_1,
        instance.transform_2,
        vec4<f32>(0.0, 0.0, 0.0, 1.0),
    );
    
    let world_position = (transform * vec4<f32>(vertex.position, 1.0)).xyz;
    let world_normal = normalize((transform * vec4<f32>(vertex.normal, 0.0)).xyz);
    
    var out: VertexOutput;
    out.clip_position = camera.view_proj * vec4<f32>(world_position, 1.0);
    out.world_position = world_position;
    out.world_normal = world_normal;
    out.color = instance.color;
    out.uv = vertex.uv;
    
    return out;
}
"#;

/// Fragment shader for cylinder bonds with CYLview quadrant lighting
pub const CYLINDER_FRAGMENT_SHADER: &str = r#"
struct LightingUniform {
    light_dirs: array<vec4<f32>, 4>,
    light_colors: array<vec4<f32>, 4>,
};

@group(1) @binding(0)
var<uniform> lighting: LightingUniform;

struct FragmentInput {
    @location(0) world_position: vec3<f32>,
    @location(1) world_normal: vec3<f32>,
    @location(2) color: vec4<f32>,
    @location(3) uv: vec2<f32>,
};

@fragment
fn main(in: FragmentInput) -> @location(0) vec4<f32> {
    let normal = normalize(in.world_normal);
    let base_color = in.color.rgb;
    
    // CYLview quadrant lighting
    var irradiance = vec3<f32>(0.0);
    
    for (var i: i32 = 0; i < 4; i++) {
        let light_dir = normalize(lighting.light_dirs[i].xyz);
        let light_color = lighting.light_colors[i].rgb;
        
        // Diffuse term
        let ndotl = max(dot(normal, light_dir), 0.0);
        irradiance += base_color * light_color * ndotl;
    }
    
    // Add subtle ambient term for base visibility
    let ambient = base_color * 0.15;
    
    // Specular highlights (plastic-like material)
    // Use view direction for Phong-style highlights
    let view_dir = normalize(vec3<f32>(0.0, 0.0, 5.0) - in.world_position);
    var specular = vec3<f32>(0.0);
    
    for (var i: i32 = 0; i < 4; i++) {
        let light_dir = normalize(lighting.light_dirs[i].xyz);
        let light_color = lighting.light_colors[i].rgb;
        
        let reflect_dir = reflect(-light_dir, normal);
        let spec_angle = max(dot(view_dir, reflect_dir), 0.0);
        let spec_power = pow(spec_angle, 32.0); // Moderate shininess
        specular += light_color * spec_power * 0.3;
    }
    
    let final_color = ambient + irradiance + specular;
    
    // Subtle edge darkening for better depth perception
    let fresnel = 1.0 - abs(dot(normal, view_dir));
    let edge_darkening = mix(1.0, 0.85, fresnel * fresnel);
    
    return vec4<f32>(final_color * edge_darkening, in.color.a);
}
"#;

/// Vertex shader for sphere impostors
pub const SPHERE_VERTEX_SHADER: &str = r#"
struct CameraUniform {
    view_proj: mat4x4<f32>,
    view_pos: vec4<f32>,
};

@group(0) @binding(0)
var<uniform> camera: CameraUniform;

struct VertexInput {
    @location(0) position: vec3<f32>,
    @location(1) normal: vec3<f32>,
    @location(2) uv: vec2<f32>,
};

struct InstanceInput {
    @location(3) transform_0: vec4<f32>,
    @location(4) transform_1: vec4<f32>,
    @location(5) transform_2: vec4<f32>,
    @location(6) color: vec4<f32>,
    @location(7) params: vec4<f32>,
};

struct VertexOutput {
    @builtin(position) clip_position: vec4<f32>,
    @location(0) world_position: vec3<f32>,
    @location(1) quad_uv: vec2<f32>,
    @location(2) color: vec4<f32>,
    @location(3) radius: f32,
};

@vertex
fn main(
    vertex: VertexInput,
    instance: InstanceInput,
) -> VertexOutput {
    let transform = mat4x4<f32>(
        instance.transform_0,
        instance.transform_1,
        instance.transform_2,
        vec4<f32>(0.0, 0.0, 0.0, 1.0),
    );
    
    // Extract scale for radius
    let radius = instance.params.x;
    
    // Billboard the quad: always face camera
    let center_world = (transform * vec4<f32>(0.0, 0.0, 0.0, 1.0)).xyz;
    
    // Simple billboard aligned to screen
    let quad_pos = vertex.position.xy * radius;
    
    // Transform to view space then clip space for proper billboard
    let view_center = (camera.view_proj * vec4<f32>(center_world, 1.0));
    let clip_offset = vec4<f32>(quad_pos, 0.0, 0.0) * view_center.w * 0.001;
    
    var out: VertexOutput;
    out.clip_position = view_center + clip_offset;
    out.world_position = center_world + vec3<f32>(quad_pos, 0.0); // Approximate
    out.quad_uv = vertex.uv;
    out.color = instance.color;
    out.radius = radius;
    
    return out;
}
"#;

/// Fragment shader for sphere impostors
pub const SPHERE_FRAGMENT_SHADER: &str = r#"
struct LightingUniform {
    light_dirs: array<vec4<f32>, 4>,
    light_colors: array<vec4<f32>, 4>,
};

@group(1) @binding(0)
var<uniform> lighting: LightingUniform;

struct FragmentInput {
    @location(0) world_position: vec3<f32>,
    @location(1) quad_uv: vec2<f32>,
    @location(2) color: vec4<f32>,
    @location(3) radius: f32,
};

@fragment
fn main(in: FragmentInput) -> @location(0) vec4<f32> {
    // Map UV from [0,1] to [-1,1]
    let uv = in.quad_uv * 2.0 - 1.0;
    
    // Calculate distance from center
    let dist_sq = dot(uv, uv);
    
    // Discard fragments outside the sphere
    if (dist_sq > 1.0) {
        discard;
    }
    
    // Calculate sphere normal from impostor
    let z = sqrt(1.0 - dist_sq);
    let normal = normalize(vec3<f32>(uv.x, uv.y, z));
    
    let base_color = in.color.rgb;
    
    // Same quadrant lighting as cylinders
    var irradiance = vec3<f32>(0.0);
    
    for (var i: i32 = 0; i < 4; i++) {
        let light_dir = normalize(lighting.light_dirs[i].xyz);
        let light_color = lighting.light_colors[i].rgb;
        let ndotl = max(dot(normal, light_dir), 0.0);
        irradiance += base_color * light_color * ndotl;
    }
    
    let ambient = base_color * 0.15;
    
    // Specular for atoms (slightly sharper for compact look)
    let view_dir = vec3<f32>(0.0, 0.0, 1.0);
    var specular = vec3<f32>(0.0);
    
    for (var i: i32 = 0; i < 4; i++) {
        let light_dir = normalize(lighting.light_dirs[i].xyz);
        let light_color = lighting.light_colors[i].rgb;
        let reflect_dir = reflect(-light_dir, normal);
        let spec_angle = max(dot(view_dir, reflect_dir), 0.0);
        specular += light_color * pow(spec_angle, 64.0) * 0.4;
    }
    
    let final_color = ambient + irradiance + specular;
    
    // Soft edge for atoms
    let alpha = in.color.a * smoothstep(1.0, 0.8, dist_sq);
    
    return vec4<f32>(final_color, alpha);
}
"#;

/// Default lighting configuration matching CYLview aesthetic
pub fn default_lighting_uniform() -> [f32; 32] {
    // 4 light directions (4 floats each) + 4 light colors (4 floats each)
    [
        // Light 0: Upper right, warm
        0.577, 0.577, 0.577, 0.0,
        // Light 1: Upper left, cool
        -0.577, 0.577, 0.577, 0.0,
        // Light 2: Lower right, neutral
        0.707, -0.5, 0.5, 0.0,
        // Light 3: Back light, fill
        0.0, 0.2, -0.98, 0.0,
        // Colors
        1.0, 0.95, 0.9, 1.0,   // Warm white
        0.9, 0.95, 1.0, 1.0,   // Cool white
        0.85, 0.85, 0.85, 1.0, // Neutral
        0.5, 0.5, 0.55, 1.0,   // Back fill
    ]
}
