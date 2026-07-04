import { Box3, PerspectiveCamera, Vector3 } from 'three';
import { describe, expect, it } from 'vitest';
import {
  focalBlurUniformsForAmount,
  focalDistanceForView,
  fogRangeForView,
  moleculeViewDepthRange,
} from './depthCue';

function testCamera() {
  const camera = new PerspectiveCamera(35, 1, 0.1, 1000);
  camera.position.set(0, 0, 20);
  camera.lookAt(0, 0, 0);
  camera.updateMatrixWorld(true);
  return camera;
}

function testBox() {
  return new Box3(
    new Vector3(-3, -2, -4),
    new Vector3(3, 2, 4),
  );
}

describe('depth cue fog', () => {
  it('projects molecule bounds into camera depth space', () => {
    const range = moleculeViewDepthRange(testBox(), testCamera());

    expect(range).not.toBeNull();
    expect(range?.minDepth).toBeCloseTo(16);
    expect(range?.maxDepth).toBeCloseTo(24);
    expect(range?.span).toBeCloseTo(8);
  });

  it('keeps subtle fog mostly toward the back of the molecule', () => {
    const fog = fogRangeForView(testBox(), testCamera(), {
      fogEnabled: true,
      fogIntensity: 0.15,
      fogDepth: 0.15,
      focalDepth: 0.5,
    });

    expect(fog).not.toBeNull();
    expect(fog?.near).toBeGreaterThan(20);
    expect(fog?.far).toBeGreaterThan(28);
  });

  it('moves strong fog into the molecule depth span', () => {
    const fog = fogRangeForView(testBox(), testCamera(), {
      fogEnabled: true,
      fogIntensity: 1,
      fogDepth: 1,
      focalDepth: 0.5,
    });

    expect(fog).not.toBeNull();
    expect(fog?.near).toBeLessThan(18);
    expect(fog?.far).toBeLessThan(24);
  });

  it('maps focal depth across the molecule even when fog is disabled', () => {
    expect(focalDistanceForView(testBox(), testCamera(), 0)).toBeCloseTo(16);
    expect(focalDistanceForView(testBox(), testCamera(), 0.5)).toBeCloseTo(20);
    expect(focalDistanceForView(testBox(), testCamera(), 1)).toBeCloseTo(24);
  });

  it('uses a true zero for disabled focal blur strength', () => {
    expect(focalBlurUniformsForAmount(0)).toEqual({ aperture: 0, maxblur: 0 });
    expect(focalBlurUniformsForAmount(1).aperture).toBeGreaterThan(0);
    expect(focalBlurUniformsForAmount(1).maxblur).toBeGreaterThan(0);
  });

  it('disables fog safely without molecule bounds', () => {
    expect(fogRangeForView(null, testCamera(), {
      fogEnabled: true,
      fogIntensity: 1,
      fogDepth: 1,
      focalDepth: 0.5,
    })).toBeNull();
  });
});
