import type { RenderProfileId } from './presentation';

export interface BenchmarkConfig {
  enabled: boolean;
  outputPath?: string;
  sampleMs: number;
  interactionMs: number;
  targetFps: number;
  maxAtoms: number;
}

export interface BenchmarkInteractionPhase {
  phase: 'orbit' | 'pan' | 'zoom';
  frameSampleMs: number;
  sampledFrames: number;
  averageFrameMs: number | null;
  p95FrameMs: number | null;
  minFps: number | null;
  averageFps: number | null;
}

export interface BenchmarkRenderMetrics {
  rebuildSceneMs: number;
  visibleAtoms: number;
  visibleBonds: number;
  totalAtoms: number;
  totalBonds: number;
  renderProfile: RenderProfileId;
  renderQuality: {
    primitiveLoad: number;
    qualityT: number;
    pixelRatio: number;
    sphereWidthSegments: number;
    sphereHeightSegments: number;
    cylinderRadialSegments: number;
  };
  renderCalls: number;
  triangles: number;
  geometries: number;
  textures: number;
  sceneObjects: number;
  pickAtomMs: number | null;
  pickBondMs: number | null;
  pickTotalMs: number;
  pickHitType: 'atom' | 'bond' | 'none';
  pickAtomCandidates: number;
  pickBondCandidates: number;
  frameSampleMs: number;
  sampledFrames: number;
  averageFrameMs: number | null;
  p95FrameMs: number | null;
  minFps: number | null;
  averageFps: number | null;
  interactionFrameSampleMs: number;
  interactionAverageFrameMs: number | null;
  interactionP95FrameMs: number | null;
  interactionMinFps: number | null;
  interactionAverageFps: number | null;
  interactionPhases: BenchmarkInteractionPhase[];
  responsive: boolean;
  webglRenderer: string | null;
  webglVendor: string | null;
}
