import { WebGLRenderer, Vector3, OrthographicCamera } from 'three';
import type { SceneCtx, SceneRenderStats, PickMetrics } from './types';
import { pickScene } from './picking';

export function perfLoggingEnabled(): boolean {
  try {
    return window.localStorage.getItem('cylformPerf') === '1';
  } catch {
    return false;
  }
}

export function percentile(values: number[], percentileValue: number): number | null {
  if (values.length === 0) return null;
  const sorted = [...values].sort((a, b) => a - b);
  const index = Math.min(
    sorted.length - 1,
    Math.max(0, Math.ceil((percentileValue / 100) * sorted.length) - 1),
  );
  return sorted[index];
}

export function frameMetrics(frameTimes: number[]) {
  const averageFrameMs = frameTimes.length > 0
    ? frameTimes.reduce((sum, value) => sum + value, 0) / frameTimes.length
    : null;
  const p95FrameMs = percentile(frameTimes, 95);
  const worstFrameMs = frameTimes.length > 0 ? Math.max(...frameTimes) : null;

  return {
    sampledFrames: frameTimes.length,
    averageFrameMs,
    p95FrameMs,
    minFps: worstFrameMs ? 1000 / worstFrameMs : null,
    averageFps: averageFrameMs ? 1000 / averageFrameMs : null,
  };
}

export function sampleFrameTimes(
  durationMs: number,
  onFrame?: (progress: number) => void,
): Promise<number[]> {
  return new Promise((resolve) => {
    const frameTimes: number[] = [];
    let startedAt: number | null = null;
    let previous: number | null = null;

    const tick = (timestamp: number) => {
      if (startedAt === null) {
        startedAt = timestamp;
        previous = timestamp;
        requestAnimationFrame(tick);
        return;
      }

      if (previous !== null) {
        frameTimes.push(timestamp - previous);
      }
      previous = timestamp;

      const elapsedMs = timestamp - startedAt;
      onFrame?.(Math.min(1, elapsedMs / durationMs));

      if (elapsedMs >= durationMs) {
        resolve(frameTimes);
        return;
      }

      requestAnimationFrame(tick);
    };

    requestAnimationFrame(tick);
  });
}

export async function benchmarkInteractionMetrics(ctx: SceneCtx, phaseMs: number) {
  const phases: Array<{
    phase: 'orbit' | 'pan' | 'zoom';
    frameSampleMs: number;
    sampledFrames: number;
    averageFrameMs: number | null;
    p95FrameMs: number | null;
    minFps: number | null;
    averageFps: number | null;
  }> = [];
  const allFrameTimes: number[] = [];

  const originalPosition = ctx.camera.position.clone();
  const originalTarget = ctx.controls.target.clone();
  const originalZoom = ctx.camera.zoom;
  const originalQuaternion = ctx.camera.quaternion.clone();
  const originalUp = ctx.camera.up.clone();
  const baseOffset = originalPosition.clone().sub(originalTarget);
  const panExtent = Math.max(baseOffset.length() * 0.08, 1);

  const restoreCamera = () => {
    ctx.camera.position.copy(originalPosition);
    ctx.camera.quaternion.copy(originalQuaternion);
    ctx.camera.up.copy(originalUp);
    ctx.camera.zoom = originalZoom;
    ctx.camera.updateProjectionMatrix();
    ctx.controls.target.copy(originalTarget);
    ctx.controls.update();
    ctx.renderer.render(ctx.scene, ctx.camera);
  };

  const runPhase = async (
    phase: 'orbit' | 'pan' | 'zoom',
    applyPose: (progress: number) => void,
  ) => {
    const frameTimes = await sampleFrameTimes(phaseMs, (progress) => {
      applyPose(progress);
      ctx.controls.update();
      ctx.renderer.render(ctx.scene, ctx.camera);
    });
    allFrameTimes.push(...frameTimes);
    phases.push({
      phase,
      frameSampleMs: phaseMs,
      ...frameMetrics(frameTimes),
    });
    restoreCamera();
  };

  await runPhase('orbit', (progress) => {
    const angle = Math.sin(progress * Math.PI * 2) * 0.42;
    const pitch = Math.sin(progress * Math.PI * 4) * 0.12;
    const offset = baseOffset
      .clone()
      .applyAxisAngle(new Vector3(0, 1, 0), angle)
      .applyAxisAngle(new Vector3(1, 0, 0), pitch);
    ctx.camera.position.copy(originalTarget).add(offset);
    ctx.camera.lookAt(ctx.controls.target);
  });

  await runPhase('pan', (progress) => {
    const x = Math.sin(progress * Math.PI * 2) * panExtent;
    const y = Math.sin(progress * Math.PI * 4) * panExtent * 0.45;
    const pan = new Vector3(x, y, 0);
    ctx.controls.target.copy(originalTarget).add(pan);
    ctx.camera.position.copy(originalPosition).add(pan);
    ctx.camera.lookAt(ctx.controls.target);
  });

  await runPhase('zoom', (progress) => {
    const scale = 1 + Math.sin(progress * Math.PI * 2) * 0.28;
    const offset = baseOffset.clone().multiplyScalar(scale);
    ctx.camera.position.copy(ctx.controls.target).add(offset);
    ctx.camera.lookAt(ctx.controls.target);
    if (ctx.camera instanceof OrthographicCamera) {
      ctx.camera.zoom = originalZoom / scale;
      ctx.camera.updateProjectionMatrix();
    }
  });

  restoreCamera();
  const overallMetrics = frameMetrics(allFrameTimes);

  return {
    phases,
    sampledFrames: overallMetrics.sampledFrames,
    averageFrameMs: overallMetrics.averageFrameMs,
    p95FrameMs: overallMetrics.p95FrameMs,
    minFps: overallMetrics.minFps,
    averageFps: overallMetrics.averageFps,
  };
}

export function benchmarkPickMetrics(ctx: SceneCtx): PickMetrics {
  ctx.pointer.set(0, 0);
  ctx.raycaster.setFromCamera(ctx.pointer, ctx.camera);
  const result = pickScene(ctx, 'atom-bond');
  return {
    pickAtomMs: result.pickAtomMs,
    pickBondMs: result.pickBondMs,
    pickTotalMs: result.pickTotalMs,
    pickHitType: result.pickHitType,
    pickAtomCandidates: result.pickAtomCandidates,
    pickBondCandidates: result.pickBondCandidates,
  };
}

export function sceneRenderStats(ctx: SceneCtx): SceneRenderStats {
  let sceneObjects = 0;
  ctx.molGroup.traverse(() => {
    sceneObjects += 1;
  });

  return {
    renderCalls: ctx.renderer.info.render.calls,
    triangles: ctx.renderer.info.render.triangles,
    geometries: ctx.renderer.info.memory.geometries,
    textures: ctx.renderer.info.memory.textures,
    sceneObjects,
  };
}

export function webglDebugInfo(renderer: WebGLRenderer): { webglRenderer: string | null; webglVendor: string | null } {
  const gl = renderer.getContext();
  const debugInfo = gl.getExtension('WEBGL_debug_renderer_info');
  if (!debugInfo) {
    return { webglRenderer: null, webglVendor: null };
  }

  return {
    webglRenderer: gl.getParameter(debugInfo.UNMASKED_RENDERER_WEBGL) as string,
    webglVendor: gl.getParameter(debugInfo.UNMASKED_VENDOR_WEBGL) as string,
  };
}
