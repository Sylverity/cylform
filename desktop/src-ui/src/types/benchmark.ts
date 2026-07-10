import type { RenderProfileId } from './presentation';

export interface BenchmarkConfig {
  enabled: boolean;
  outputPath?: string;
  sampleMs: number;
  interactionMs: number;
  targetFps: number;
  maxAtoms: number;
  /** When true, capture a PNG of the rendered view for local visual feedback. */
  screenshot: boolean;
  /** Local path the app writes the screenshot PNG to; set by the benchmark runner. */
  screenshotPath?: string;
  /** Optional render profile to force for this run, e.g. "cylview" | "ball-stick" | "houkmol". */
  renderProfile?: string;
  /**
   * When true, capture a static screenshot of the loaded molecule without the
   * frame-timing sample or orbit/pan/zoom interaction phases. Used by the
   * snapshot harness to grab a clean render/UI view of a real molecule.
   */
  snapshot?: boolean;
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
