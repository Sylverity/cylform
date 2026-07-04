import {
  Box3,
  Camera,
  Color,
  Fog,
  PerspectiveCamera,
  Vector3,
} from 'three';
import type { ViewOptions } from '../../App';
import type { SceneCtx } from './types';
import { clamp } from './visualStyle';

type NumericUniforms = Record<string, { value: number }>;

interface ViewDepthRange {
  minDepth: number;
  maxDepth: number;
  span: number;
  diagonal: number;
}

export interface FogRange {
  near: number;
  far: number;
  focus: number;
}

const BOX_CORNERS = Array.from({ length: 8 }, () => new Vector3());
const MAX_FOCAL_APERTURE = 0.0014;
const MAX_FOCAL_BLUR = 0.014;

function boxCorners(box: Box3): Vector3[] {
  const min = box.min;
  const max = box.max;
  BOX_CORNERS[0].set(min.x, min.y, min.z);
  BOX_CORNERS[1].set(min.x, min.y, max.z);
  BOX_CORNERS[2].set(min.x, max.y, min.z);
  BOX_CORNERS[3].set(min.x, max.y, max.z);
  BOX_CORNERS[4].set(max.x, min.y, min.z);
  BOX_CORNERS[5].set(max.x, min.y, max.z);
  BOX_CORNERS[6].set(max.x, max.y, min.z);
  BOX_CORNERS[7].set(max.x, max.y, max.z);
  return BOX_CORNERS;
}

export function moleculeViewDepthRange(box: Box3 | null, camera: Camera): ViewDepthRange | null {
  if (!box || box.isEmpty()) return null;

  const forward = new Vector3();
  camera.getWorldDirection(forward);
  const cameraPosition = new Vector3();
  camera.getWorldPosition(cameraPosition);

  let minDepth = Number.POSITIVE_INFINITY;
  let maxDepth = Number.NEGATIVE_INFINITY;
  for (const corner of boxCorners(box)) {
    const depth = corner.clone().sub(cameraPosition).dot(forward);
    minDepth = Math.min(minDepth, depth);
    maxDepth = Math.max(maxDepth, depth);
  }

  if (!Number.isFinite(minDepth) || !Number.isFinite(maxDepth)) return null;
  const diagonal = Math.max(box.getSize(new Vector3()).length(), 0.5);
  const span = Math.max(maxDepth - minDepth, diagonal * 0.2, 0.5);

  return {
    minDepth: Math.max(0.01, minDepth),
    maxDepth: Math.max(0.02, maxDepth),
    span,
    diagonal,
  };
}

export function fogRangeForView(
  box: Box3 | null,
  camera: Camera,
  options: Pick<ViewOptions, 'fogEnabled' | 'fogIntensity' | 'fogDepth' | 'focalDepth'>,
): FogRange | null {
  if (!options.fogEnabled) return null;

  const range = moleculeViewDepthRange(box, camera);
  if (!range) return null;

  const amount = clamp(options.fogIntensity, 0, 1);
  const depth = clamp(options.fogDepth, 0, 1);
  const pad = Math.max(range.diagonal * 0.08, range.span * 0.12, 0.2);

  const rampStartThroughMolecule = 0.82 - depth * 0.72;
  const rampSpan = range.span * (1.22 - amount * 0.74) + pad * (1.4 - amount * 0.6);
  const near = Math.max(0.01, range.minDepth + range.span * rampStartThroughMolecule - pad * 0.2);
  const far = Math.max(near + 0.05, near + rampSpan);
  const focus = Math.max(0.01, range.minDepth + range.span * clamp(options.focalDepth, 0, 1));

  return { near, far, focus };
}

export function focalDistanceForView(box: Box3 | null, camera: Camera, focalDepth: number): number | null {
  const range = moleculeViewDepthRange(box, camera);
  if (!range) return null;
  return Math.max(0.01, range.minDepth + range.span * clamp(focalDepth, 0, 1));
}

export function focalBlurUniformsForAmount(amount: number): { aperture: number; maxblur: number } {
  const strength = Math.pow(clamp(amount, 0, 1), 1.25);
  return {
    aperture: strength * MAX_FOCAL_APERTURE,
    maxblur: strength * MAX_FOCAL_BLUR,
  };
}

export function applyDepthCue(ctx: SceneCtx): FogRange | null {
  const options = ctx.depthCue.options;
  const bg = ctx.depthCue.backgroundColor;
  const fogRange = fogRangeForView(ctx.lastMoleculeBox, ctx.camera, options);
  ctx.scene.fog = fogRange ? new Fog(bg, fogRange.near, fogRange.far) : null;

  const { bokehPass, renderPass } = ctx.depthCue;
  if (renderPass) {
    renderPass.camera = ctx.camera;
  }
  if (bokehPass) {
    bokehPass.camera = ctx.camera;
    const uniforms = bokehPass.uniforms as NumericUniforms;
    const fallbackFocus = ctx.camera.position.distanceTo(ctx.controls.target);
    const focus = focalDistanceForView(ctx.lastMoleculeBox, ctx.camera, options.focalDepth) ?? fallbackFocus;
    const blurUniforms = focalBlurUniformsForAmount(options.focalBlurAmount);
    uniforms.focus.value = Math.max(0.01, focus);
    uniforms.aperture.value = blurUniforms.aperture;
    uniforms.maxblur.value = blurUniforms.maxblur;
    uniforms.nearClip.value = ctx.camera.near;
    uniforms.farClip.value = ctx.camera.far;
    uniforms.aspect.value = (
      ctx.camera instanceof PerspectiveCamera
        ? ctx.camera.aspect
        : (ctx.renderer.domElement.clientWidth || 1) / (ctx.renderer.domElement.clientHeight || 1)
    );
  }

  return fogRange;
}

export function renderScene(ctx: SceneCtx): void {
  applyDepthCue(ctx);
  if (
    ctx.depthCue.options.focalBlurEnabled &&
    focalBlurUniformsForAmount(ctx.depthCue.options.focalBlurAmount).maxblur > 0 &&
    ctx.depthCue.composer &&
    ctx.depthCue.bokehPass &&
    ctx.lastMoleculeBox
  ) {
    ctx.depthCue.composer.render();
    return;
  }

  ctx.renderer.render(ctx.scene, ctx.camera);
}

export function updateDepthCueBackground(ctx: SceneCtx, backgroundColor: number): void {
  ctx.depthCue.backgroundColor = backgroundColor;
  ctx.scene.background = new Color(backgroundColor);
}
