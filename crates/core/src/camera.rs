//! Orbital camera controls
//!
//! Standard molecular viewer camera:
//! - Left drag: Rotate around center
//! - Right drag: Pan
//! - Scroll: Zoom
//! - Double-click: Center on point

use glam::{Mat4, Vec3};

/// An orbital camera for viewing molecular structures
#[derive(Debug, Clone)]
pub struct Camera {
    /// Camera position (spherical coordinates)
    radius: f32,
    /// Azimuthal angle (horizontal rotation)
    theta: f32,
    /// Polar angle (vertical rotation)
    phi: f32,
    /// Point to orbit around
    target: Vec3,
    /// World up vector
    up: Vec3,
    /// Field of view in degrees
    fov: f32,
    /// Aspect ratio
    aspect: f32,
    /// Near plane
    near: f32,
    /// Far plane
    far: f32,
}

impl Default for Camera {
    fn default() -> Self {
        Self {
            radius: 10.0,
            theta: 0.0,
            phi: std::f32::consts::FRAC_PI_4,
            target: Vec3::ZERO,
            up: Vec3::Y,
            fov: 45.0,
            aspect: 1.0,
            near: 0.1,
            far: 1000.0,
        }
    }
}

impl Camera {
    /// Create a new camera with default settings
    pub fn new() -> Self {
        Self::default()
    }

    /// Get camera position in world space
    pub fn position(&self) -> Vec3 {
        Vec3::new(
            self.radius * self.phi.sin() * self.theta.cos(),
            self.radius * self.phi.cos(),
            self.radius * self.phi.sin() * self.theta.sin(),
        ) + self.target
    }

    /// Get view matrix
    pub fn view_matrix(&self) -> Mat4 {
        Mat4::look_at_rh(self.position(), self.target, self.up)
    }

    /// Get projection matrix
    pub fn projection_matrix(&self) -> Mat4 {
        Mat4::perspective_rh(self.fov.to_radians(), self.aspect, self.near, self.far)
    }

    /// Get combined view-projection matrix
    pub fn view_projection_matrix(&self) -> Mat4 {
        self.projection_matrix() * self.view_matrix()
    }

    /// Rotate camera
    pub fn rotate(&mut self, delta_theta: f32, delta_phi: f32) {
        self.theta += delta_theta;
        self.phi = (self.phi + delta_phi).clamp(0.01, std::f32::consts::PI - 0.01);
    }

    /// Zoom camera
    pub fn zoom(&mut self, delta: f32) {
        self.radius = (self.radius * (1.0 + delta)).clamp(self.near, self.far);
    }

    /// Pan camera (moves target)
    pub fn pan(&mut self, delta_x: f32, delta_y: f32) {
        let right = self.right_vector();
        let up = self.up_vector();

        self.target += right * delta_x + up * delta_y;
    }

    /// Set target point to orbit around
    pub fn set_target(&mut self, target: Vec3) {
        self.target = target;
    }

    /// Fit camera to view a bounding box
    pub fn fit_to_bounds(&mut self, min: Vec3, max: Vec3) {
        let center = (min + max) / 2.0;
        let size = (max - min).length();

        self.target = center;
        self.radius = size * 1.5;
    }

    /// Set aspect ratio
    pub fn set_aspect(&mut self, aspect: f32) {
        self.aspect = aspect;
    }

    /// Get the camera's right vector
    fn right_vector(&self) -> Vec3 {
        let forward = (self.target - self.position()).normalize();
        forward.cross(self.up).normalize()
    }

    /// Get the camera's up vector (view-space)
    fn up_vector(&self) -> Vec3 {
        let right = self.right_vector();
        let forward = (self.target - self.position()).normalize();
        right.cross(forward).normalize()
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_camera_position() {
        let mut camera = Camera::new();
        camera.theta = 0.0;
        camera.phi = std::f32::consts::FRAC_PI_2;
        camera.radius = 1.0;
        camera.target = Vec3::ZERO;

        let pos = camera.position();
        assert!((pos.x - 1.0).abs() < 0.001);
        assert!(pos.y.abs() < 0.001);
        assert!(pos.z.abs() < 0.001);
    }

    #[test]
    fn test_view_matrix() {
        let camera = Camera::new();
        let view = camera.view_matrix();
        // View matrix should transform camera position to origin
        let pos = camera.position();
        let transformed = view.transform_point3(pos);
        assert!(transformed.length() < 0.001);
    }
}
