import { OrthographicCamera, PerspectiveCamera, Vector3 } from 'three';
import type { SceneCtx } from './types';
import type { ViewOptions, SavedPose } from '../../App';

export function syncOrthographicCamera(ctx: SceneCtx): void {
  const { renderer, orthographicCamera, controls } = ctx;
  const width = renderer.domElement.clientWidth || 800;
  const height = renderer.domElement.clientHeight || 600;
  const aspect = width / height;
  const distance = Math.max(ctx.camera.position.distanceTo(controls.target), ctx.lastCameraDistance, 8);
  const viewHeight = Math.max(distance * 0.55, 4);

  orthographicCamera.left = (-viewHeight * aspect) / 2;
  orthographicCamera.right = (viewHeight * aspect) / 2;
  orthographicCamera.top = viewHeight / 2;
  orthographicCamera.bottom = -viewHeight / 2;
  orthographicCamera.near = Math.max(distance / 120, 0.01);
  orthographicCamera.far = distance * 120;
  orthographicCamera.updateProjectionMatrix();
}

export function applySavedPoseToContext(current: SceneCtx, pose: SavedPose) {
  current.camera.position.set(pose.cameraPosition.x, pose.cameraPosition.y, pose.cameraPosition.z);
  current.controls.target.set(pose.target.x, pose.target.y, pose.target.z);
  current.camera.lookAt(current.controls.target);
  current.controls.update();
  current.controls.saveState();
  current.lastCameraDistance = current.camera.position.distanceTo(current.controls.target);
  if (current.camera instanceof OrthographicCamera) syncOrthographicCamera(current);
}

export function setActiveCamera(ctx: SceneCtx, projection: ViewOptions['projection']): void {
  const nextCamera = projection === 'orthographic'
    ? ctx.orthographicCamera
    : ctx.perspectiveCamera;

  if (ctx.camera === nextCamera) {
    if (nextCamera instanceof OrthographicCamera) syncOrthographicCamera(ctx);
    return;
  }

  nextCamera.position.copy(ctx.camera.position);
  nextCamera.quaternion.copy(ctx.camera.quaternion);
  nextCamera.up.copy(ctx.camera.up);
  nextCamera.near = ctx.camera.near;
  nextCamera.far = ctx.camera.far;
  if (nextCamera instanceof PerspectiveCamera) {
    nextCamera.updateProjectionMatrix();
  }

  ctx.camera = nextCamera;
  if (nextCamera instanceof OrthographicCamera) syncOrthographicCamera(ctx);
  ctx.controls.object = nextCamera;
  ctx.controls.update();
}

export function updateFloorPlacement(ctx: SceneCtx): void {
  if (!ctx.lastMoleculeBox) {
    ctx.floorGroup.visible = false;
    return;
  }

  const box = ctx.lastMoleculeBox;
  const size = box.getSize(new Vector3());
  const center = box.getCenter(new Vector3());
  const floorSize = Math.max(size.x, size.z, size.y, 4) * 2.35;

  ctx.floorGroup.position.set(center.x, box.min.y - 0.45, center.z);
  ctx.floorPlane.scale.set(floorSize, floorSize, 1);
  ctx.floorGrid.scale.setScalar(floorSize / 10);
}

export function applyCameraPreset(ctx: SceneCtx, preset: 'front' | 'top' | 'right' | 'iso'): void {
  const target = ctx.controls.target.clone();
  const distance = Math.max(ctx.camera.position.distanceTo(target), ctx.lastCameraDistance, 8);
  const offsets = {
    front: new Vector3(0, 0, distance),
    top: new Vector3(0, distance, 0.001),
    right: new Vector3(distance, 0, 0),
    iso: new Vector3(0.62, 0.48, 0.62).normalize().multiplyScalar(distance),
  };

  ctx.camera.position.copy(target).add(offsets[preset]);
  ctx.camera.up.set(0, 1, 0);
  if (preset === 'top') {
    ctx.camera.up.set(0, 0, -1);
  }
  ctx.camera.lookAt(target);
  ctx.controls.target.copy(target);
  ctx.controls.update();
  ctx.controls.saveState();
  ctx.lastCameraDistance = distance;
  if (ctx.camera instanceof OrthographicCamera) syncOrthographicCamera(ctx);
}
