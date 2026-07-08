import { useEffect, useMemo, useRef, useState, type Dispatch, type KeyboardEvent as ReactKeyboardEvent, type SetStateAction } from 'react';
import {
  Box3,
  InstancedMesh,
  Material,
  MathUtils,
  Mesh,
  MeshPhongMaterial,
  OrthographicCamera,
  Vector3,
} from 'three';
import { invoke } from '@tauri-apps/api/core';
import { save } from '@tauri-apps/plugin-dialog';
import { AppearancePanel } from './AppearancePanel';
import { LoadingSpinner } from './LoadingSpinner';
import { dispatchCanvasEvent, listenToCanvasEvent } from '../canvasEvents';
import { profileViewOptionPatch } from '../persistence';
import type {
  ElementColorOverrides,
  HydrogenVisibility,
  PersistentLabel,
  MoleculeData,
  AtomStyleOverride,
  BondStyleOverride,
  BondStyleType,
  RenderProfileId,
  BenchmarkConfig,
  BenchmarkRenderMetrics,
  SelectionMode,
  SelectionSummary,
  SelectedAngleMeasurement,
  SelectedBondMeasurement,
  SelectedDihedralMeasurement,
  SavedPose,
  ViewOptions,
} from '../types';
import type { ToastMessage } from './Toast';
import {
  BondSelectionData,
  AtomSelectionData,
  MoleculeVisibilityIndex,
  SceneCtx,
} from './molecule-canvas/types';
import {
  formatDistance,
  formatAngle,
  sanitizeLabelText,
} from './molecule-canvas/labels';
import {
  atomColorHex,
  backdropColor,
  applyMaterialPreset,
  applyMaterialFinish,
  bondKey,
  applyRenderPixelRatio,
  clamp,
  updateAngleSelection,
  dataUrlToBytes,
} from './molecule-canvas/visualStyle';
import {
  syncOrthographicCamera,
  applySavedPoseToContext,
  setActiveCamera,
  updateFloorPlacement,
  applyCameraPreset,
} from './molecule-canvas/camera';
import {
  buildMoleculeVisibilityIndex,
} from './molecule-canvas/visibility';
import {
  perfLoggingEnabled,
  frameMetrics,
  sampleFrameTimes,
  webglDebugInfo,
  benchmarkPickMetrics,
  sceneRenderStats,
  benchmarkInteractionMetrics,
} from './molecule-canvas/benchmark';
import {
  createAngleArcMesh,
  removeAngleArcMesh,
  removeOverlay,
  clearOverlays,
  createAtomOverlay,
  createBondOverlay,
} from './molecule-canvas/geometry';
import {
  pickScene,
} from './molecule-canvas/picking';
import {
  DEFAULT_PUBLICATION_EXPORT_SETTINGS,
  capturePublicationRenderState,
  renderCurrentViewDataUrl,
  renderPublicationExport,
  type ExportMode,
  type ExportScalePreset,
  type ExportSizePreset,
  type ExportToneMapping,
  type PathTraceQuality,
  type PublicationExportSettings,
} from './molecule-canvas/exportPng';
import {
  numberedPngPath,
  resolveExportFrameIndices,
  sanitizeExportFileName,
} from './molecule-canvas/exportWorkflow';
import { buildMoleculeBatches } from './molecule-canvas/moleculeBatches';
import { createSceneContext, orbitMouseButtons } from './molecule-canvas/sceneSetup';
import { updateScreenOverlays } from './molecule-canvas/screenLabels';
import {
  renderScene,
  updateDepthCueBackground,
} from './molecule-canvas/depthCue';

function preventMaterialPresetShortcutOverlap(event: ReactKeyboardEvent<HTMLSelectElement>) {
  if (!event.ctrlKey && !event.metaKey && !event.altKey && event.key.toLowerCase() === 'h') {
    event.preventDefault();
    event.stopPropagation();
  }
}

interface Props {
  moleculeData: MoleculeData | null;
  hydrogenVisibility: HydrogenVisibility;
  hiddenAtomIndices: number[];
  elementColorOverrides: ElementColorOverrides;
  atomStyleOverrides: Record<string, AtomStyleOverride>;
  bondStyleOverrides: Record<string, BondStyleOverride>;
  atomSizeScale: number;
  renderProfile: RenderProfileId;
  viewOptions: ViewOptions;
  distancePrecision: number;
  anglePrecision: number;
  useSymbolUnits: boolean;
  pngExportScale: 1 | 2 | 4;
  onPngExportScaleChange: (scale: 1 | 2 | 4) => void;
  mouseMode: 'standard' | 'one-button';
  invertScrollZoom: boolean;
  onViewOptionsChange: Dispatch<SetStateAction<ViewOptions>>;
  onRenderProfileChange: Dispatch<SetStateAction<RenderProfileId>>;
  onElementColorChange: (element: string, color: string) => void;
  onResetElementColor: (element: string) => void;
  onResetAllElementColors: () => void;
  onAtomSizeScaleChange: (scale: number) => void;

  onStyleSelectedAtoms: (color: string) => void;
  onSizeSelectedAtoms: () => void;
  onResetSelectedAtomStyles: () => void;
  onRestyleSelectedBonds: (type: BondStyleType) => void;
  onResetSelectedBondStyles: () => void;
  selectedBond: SelectedBondMeasurement | null;
  selectedAngle: SelectedAngleMeasurement | null;
  selectedDihedral: SelectedDihedralMeasurement | null;
  persistentLabels: PersistentLabel[];
  savedPoses: SavedPose[];
  frameIndex: number;
  frameCount: number;
  isFramePlaying: boolean;
  framePlaybackSpeed: number;
  onFrameChange: (frameIndex: number) => Promise<MoleculeData | null>;
  onFramePlaybackToggle: () => void;
  onFramePlaybackSpeedChange: (speed: number) => void;
  selectionMode: SelectionMode;
  selectionSummary: SelectionSummary;
  onBondSelected: (bond: SelectedBondMeasurement | null) => void;
  onAngleSelected: (angle: SelectedAngleMeasurement | null) => void;
  onDihedralSelected: (dihedral: SelectedDihedralMeasurement | null) => void;
  onPersistentLabelCreate: (label: Omit<PersistentLabel, 'id' | 'visible'>) => void;
  onSelectionSummaryChange: (summary: SelectionSummary) => void;
  isLoading: boolean;
  loadingLabel: string;
  onOpenFile: () => void;
  onError: (msg: string) => void;
  onToast: (text: string, type?: ToastMessage['type']) => void;
  benchmarkConfig?: BenchmarkConfig;
  onBenchmarkRender?: (metrics: BenchmarkRenderMetrics) => void;
  previewMode?: boolean;
  previewPose?: SavedPose | null;
  previewCaptureToken?: string | null;
  onPreviewCaptured?: (token: string, dataUrl: string) => void;
  onPreviewError?: (token: string, error: string) => void;
}

export function MoleculeCanvas({
  moleculeData,
  hydrogenVisibility,
  hiddenAtomIndices,
  elementColorOverrides,
  atomStyleOverrides,
  bondStyleOverrides,
  atomSizeScale,
  renderProfile,
  viewOptions,
  distancePrecision,
  anglePrecision,
  useSymbolUnits,
  pngExportScale,
  onPngExportScaleChange,
  mouseMode,
  invertScrollZoom,
  onViewOptionsChange,
  onRenderProfileChange,
  onElementColorChange,
  onResetElementColor,
  onResetAllElementColors,
  onAtomSizeScaleChange,

  onStyleSelectedAtoms,
  onSizeSelectedAtoms,
  onResetSelectedAtomStyles,
  onRestyleSelectedBonds,
  onResetSelectedBondStyles,
  selectedBond,
  selectedAngle,
  selectedDihedral,
  persistentLabels,
  savedPoses,
  frameIndex,
  frameCount,
  isFramePlaying,
  framePlaybackSpeed,
  onFrameChange,
  onFramePlaybackToggle,
  onFramePlaybackSpeedChange,
  selectionMode,
  selectionSummary,
  onBondSelected,
  onAngleSelected,
  onDihedralSelected,
  onPersistentLabelCreate,
  onSelectionSummaryChange,
  isLoading,
  loadingLabel,
  onOpenFile,
  onError,
  onToast,
  benchmarkConfig,
  onBenchmarkRender,
  previewMode = false,
  previewPose = null,
  previewCaptureToken = null,
  onPreviewCaptured,
  onPreviewError,
}: Props) {
  const containerRef = useRef<HTMLDivElement>(null);
  const ctxRef = useRef<SceneCtx | null>(null);
  const bondLabelRef = useRef<HTMLDivElement>(null);
  const angleLabelRef = useRef<HTMLDivElement>(null);
  const dihedralLabelRef = useRef<HTMLDivElement>(null);
  const linkLinesRef = useRef<HTMLCanvasElement>(null);
  const selectionModeRef = useRef<SelectionMode>(selectionMode);
  const viewOptionsRef = useRef<ViewOptions>(viewOptions);
  const persistentLabelsRef = useRef<PersistentLabel[]>(persistentLabels);
  const hiddenAtomIndicesRef = useRef<number[]>(hiddenAtomIndices);
  const hydrogenVisibilityRef = useRef<HydrogenVisibility>(hydrogenVisibility);
  const moleculeDataRef = useRef<MoleculeData | null>(moleculeData);
  const distancePrecisionRef = useRef(distancePrecision);
  const anglePrecisionRef = useRef(anglePrecision);
  const useSymbolUnitsRef = useRef(useSymbolUnits);
  const renderProfileRef = useRef<RenderProfileId>(renderProfile);
  const visibilityIndexRef = useRef<MoleculeVisibilityIndex | null>(null);
  const viewOptionsForPoseRef = useRef<ViewOptions>(viewOptions);
  const persistentLabelRefs = useRef(new Map<string, HTMLDivElement>());
  const previousMoleculeDataRef = useRef<MoleculeData | null>(null);
  const exportCancelRef = useRef(false);
  const [exportPanelOpen, setExportPanelOpen] = useState(false);
  const [exportSettings, setExportSettings] = useState<PublicationExportSettings>(DEFAULT_PUBLICATION_EXPORT_SETTINGS);
  const [exportPreviewDataUrl, setExportPreviewDataUrl] = useState<string | null>(null);
  const [exportProgress, setExportProgress] = useState<{ progress: number; label: string } | null>(null);
  const visibilityIndex = useMemo(() => buildMoleculeVisibilityIndex(moleculeData), [moleculeData]);
  const isCylviewProfile = renderProfile === 'cylview';

  useEffect(() => {
    selectionModeRef.current = selectionMode;
  }, [selectionMode]);

  useEffect(() => {
    viewOptionsRef.current = viewOptions;
    viewOptionsForPoseRef.current = viewOptions;
  }, [viewOptions]);

  useEffect(() => {
    persistentLabelsRef.current = persistentLabels;
  }, [persistentLabels]);

  useEffect(() => {
    hiddenAtomIndicesRef.current = hiddenAtomIndices;
  }, [hiddenAtomIndices]);

  useEffect(() => {
    hydrogenVisibilityRef.current = hydrogenVisibility;
  }, [hydrogenVisibility]);

  useEffect(() => {
    moleculeDataRef.current = moleculeData;
  }, [moleculeData]);

  useEffect(() => {
    distancePrecisionRef.current = distancePrecision;
    anglePrecisionRef.current = anglePrecision;
    useSymbolUnitsRef.current = useSymbolUnits;
  }, [anglePrecision, distancePrecision, useSymbolUnits]);

  useEffect(() => {
    renderProfileRef.current = renderProfile;
  }, [renderProfile]);

  useEffect(() => {
    visibilityIndexRef.current = visibilityIndex;
  }, [visibilityIndex]);

  useEffect(() => {
    setExportSettings((current) => ({
      ...current,
      frameStart: Math.min(Math.max(1, current.frameStart), Math.max(1, frameCount)),
      frameEnd: current.frameEnd <= 1
        ? Math.max(1, frameCount)
        : Math.min(Math.max(1, current.frameEnd), Math.max(1, frameCount)),
    }));
  }, [frameCount]);

  // ------------------------------------------------------------------
  // Init Three.js once
  // ------------------------------------------------------------------
  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    const { ctx: sceneCtx, dispose: disposeSceneContext } = createSceneContext(container, {
      renderProfile,
      mouseMode,
      invertScrollZoom,
      viewOptions: viewOptionsRef.current,
    });
    ctxRef.current = sceneCtx;
    const { renderer, scene, controls, perspectiveCamera: camera } = sceneCtx;

    // Render loop
    let animId = 0;
    function animate() {
      animId = requestAnimationFrame(animate);
      controls.update();
      const current = ctxRef.current;
      const activeCamera = current?.camera ?? camera;

      if (current) {
        updateScreenOverlays(current, activeCamera, {
          bondLabel: bondLabelRef.current,
          angleLabel: angleLabelRef.current,
          dihedralLabel: dihedralLabelRef.current,
          linkCanvas: linkLinesRef.current,
          labelElements: persistentLabelRefs.current,
        }, {
          persistentLabels: persistentLabelsRef.current,
          moleculeData: moleculeDataRef.current,
          hydrogenVisibility: hydrogenVisibilityRef.current,
          hiddenAtomIndices: hiddenAtomIndicesRef.current,
          visibilityIndex: visibilityIndexRef.current,
          showLabelLinkLines: viewOptionsRef.current.showLabelLinkLines,
          renderProfile: renderProfileRef.current,
          distancePrecision: distancePrecisionRef.current,
          anglePrecision: anglePrecisionRef.current,
          useSymbolUnits: useSymbolUnitsRef.current,
        });
        renderScene(current);
      } else {
        renderer.render(scene, activeCamera);
      }
    }
    animate();
    sceneCtx.animId = animId;

    // Resize
    const ro = new ResizeObserver(() => {
      const cw = container.clientWidth;
      const ch = container.clientHeight;
      renderer.setSize(cw, ch);
      const current = ctxRef.current;
      camera.aspect = cw / ch;
      camera.updateProjectionMatrix();
      if (current) {
        current.depthCue.composer?.setSize(cw, ch);
        syncOrthographicCamera(current);
      }
    });
    ro.observe(container);

    // Toolbar button and global keyboard shortcut
    const canvasEventUnsubscribers: Array<() => void> = [];
    const onReset = () => ctxRef.current?.controls.reset();

    const onCaptureCameraPose = (detail: { updatePoseId?: string } | undefined) => {
      const current = ctxRef.current;
      if (!current) return;
      dispatchCanvasEvent('camera-pose-captured', {
        updatePoseId: detail?.updatePoseId,
        cameraPosition: {
          x: current.camera.position.x,
          y: current.camera.position.y,
          z: current.camera.position.z,
        },
        target: {
          x: current.controls.target.x,
          y: current.controls.target.y,
          z: current.controls.target.z,
        },
        projection: viewOptionsForPoseRef.current.projection,
        viewOptions: viewOptionsForPoseRef.current,
      });
    };

    const onApplyCameraPose = (pose: SavedPose) => {
      const current = ctxRef.current;
      if (!current || !pose) return;
      applySavedPoseToContext(current, pose);
    };
    const onApplyCameraPreset = (preset: 'front' | 'top' | 'right' | 'iso') => {
      const current = ctxRef.current;
      if (!current || !moleculeDataRef.current || !preset) return;
      applyCameraPreset(current, preset);
    };
    if (!previewMode) {
      canvasEventUnsubscribers.push(
        listenToCanvasEvent('reset-camera', onReset),
        listenToCanvasEvent('capture-camera-pose', onCaptureCameraPose),
        listenToCanvasEvent('apply-camera-pose', onApplyCameraPose),
        listenToCanvasEvent('camera-preset', onApplyCameraPreset),
      );
    }

    let pointerDown = { x: 0, y: 0 };
    const onPointerDown = (event: PointerEvent) => {
      pointerDown = { x: event.clientX, y: event.clientY };
    };

    const clearMeasurementSelection = () => {
      const current = ctxRef.current;
      if (!current) return;
      removeOverlay(current, current.selectedBondOverlay);
      current.selectedBondOverlay = null;
      current.selectedBondData = null;
      clearOverlays(current, current.selectedAtomOverlays);
      current.angleSelection = [];
      current.angleLabelPosition = null;
      current.angleDegrees = null;
      current.dihedralLabelPosition = null;
      current.dihedralDegrees = null;
      removeAngleArcMesh(current);
      onBondSelected(null);
      onAngleSelected(null);
      onDihedralSelected(null);
    };

    const clearSelection = () => {
      const current = ctxRef.current;
      if (!current) return;
      clearMeasurementSelection();
      clearOverlays(current, current.modeSelectedAtomOverlays);
      clearOverlays(current, current.modeSelectedBondOverlays);
      current.modeSelectedAtoms = [];
      current.modeSelectedBonds = [];
      onSelectionSummaryChange({ atomCount: 0, bondCount: 0, atomIndices: [], bondKeys: [] });
    };

    const publishModeSelectionSummary = (current: SceneCtx) => {
      onSelectionSummaryChange({
        atomCount: current.modeSelectedAtoms.length,
        bondCount: current.modeSelectedBonds.length,
        atomIndices: current.modeSelectedAtoms.map((atom) => atom.atomIndex),
        bondKeys: current.modeSelectedBonds.map((bond) => bondKey(bond.atom1Index, bond.atom2Index)),
      });
    };

    const toggleModeAtom = (atom: AtomSelectionData) => {
      const current = ctxRef.current;
      if (!current) return;
      const index = current.modeSelectedAtoms.findIndex((candidate) => candidate.atomIndex === atom.atomIndex);
      if (index >= 0) {
        current.modeSelectedAtoms.splice(index, 1);
        const [overlay] = current.modeSelectedAtomOverlays.splice(index, 1);
        removeOverlay(current, overlay ?? null);
      } else {
        current.modeSelectedAtoms.push(atom);
        current.modeSelectedAtomOverlays.push(createAtomOverlay(current, atom));
      }
      publishModeSelectionSummary(current);
    };

    const toggleModeBond = (bond: BondSelectionData) => {
      const current = ctxRef.current;
      if (!current) return;
      const key = bondKey(bond.atom1Index, bond.atom2Index);
      const index = current.modeSelectedBonds.findIndex(
        (candidate) => bondKey(candidate.atom1Index, candidate.atom2Index) === key,
      );
      if (index >= 0) {
        current.modeSelectedBonds.splice(index, 1);
        const [overlay] = current.modeSelectedBondOverlays.splice(index, 1);
        removeOverlay(current, overlay ?? null);
      } else {
        current.modeSelectedBonds.push(bond);
        current.modeSelectedBondOverlays.push(createBondOverlay(current, bond));
      }
      publishModeSelectionSummary(current);
    };

    const onPointerUp = (event: PointerEvent) => {
      const current = ctxRef.current;
      const host = containerRef.current;
      if (!current || !host) return;

      const movedX = Math.abs(event.clientX - pointerDown.x);
      const movedY = Math.abs(event.clientY - pointerDown.y);
      if (movedX > 4 || movedY > 4) return;

      const rect = host.getBoundingClientRect();
      current.pointer.x = ((event.clientX - rect.left) / rect.width) * 2 - 1;
      current.pointer.y = -((event.clientY - rect.top) / rect.height) * 2 + 1;
      current.raycaster.setFromCamera(current.pointer, current.camera);

      const activeMode = selectionModeRef.current;

      if (activeMode === 'view') {
        return;
      }

      const pick = pickScene(current, activeMode);
      const { atom, bond } = pick;
      if (perfLoggingEnabled()) {
        console.info(
          '[Cylform perf] pick',
          {
            totalMs: Math.round(pick.pickTotalMs * 100) / 100,
            atomMs: pick.pickAtomMs === null ? null : Math.round(pick.pickAtomMs * 100) / 100,
            bondMs: pick.pickBondMs === null ? null : Math.round(pick.pickBondMs * 100) / 100,
            hit: pick.pickHitType,
            atoms: pick.pickAtomCandidates,
            bonds: pick.pickBondCandidates,
            mode: activeMode,
          },
        );
      }

      if (activeMode === 'label') {
        clearMeasurementSelection();
        if (atom) {
          const serial = atom.atomIndex + 1;
          onPersistentLabelCreate({
            type: 'AtomLabel',
            text: `${atom.element}${serial}`,
            anchor: {
              x: atom.position.x,
              y: atom.position.y + 0.25,
              z: atom.position.z,
            },
            atom_id: atom.atomIndex,
            source: { atomIndex: atom.atomIndex },
          });
        }
        return;
      }

      if (activeMode === 'atom' || activeMode === 'bond' || activeMode === 'atom-bond') {
        clearMeasurementSelection();
        if (
          (activeMode === 'atom' || activeMode === 'atom-bond') &&
          atom
        ) {
          toggleModeAtom(atom);
          return;
        }

        if (
          (activeMode === 'bond' || activeMode === 'atom-bond') &&
          bond
        ) {
          toggleModeBond(bond);
        }
        return;
      }

      if (atom) {
        removeOverlay(current, current.selectedBondOverlay);
        current.selectedBondOverlay = null;
        current.selectedBondData = null;
        onBondSelected(null);

        clearOverlays(current, current.selectedAtomOverlays);
        current.angleSelection = updateAngleSelection(current.angleSelection, atom);
        current.selectedAtomOverlays = current.angleSelection.map((selectedAtom) => (
          createAtomOverlay(current, selectedAtom)
        ));

        if (current.angleSelection.length === 1) {
          current.angleLabelPosition = null;
          current.angleDegrees = null;
          current.dihedralLabelPosition = null;
          current.dihedralDegrees = null;
          onAngleSelected({
            atomElements: [atom.element, '', ''],
            angleDegrees: 0,
            stage: 1,
          });
          onDihedralSelected({
            atomElements: [atom.element, '', '', ''],
            dihedralDegrees: 0,
            stage: 1,
          });
          return;
        }

        if (current.angleSelection.length === 2) {
          current.angleLabelPosition = null;
          current.angleDegrees = null;
          current.dihedralLabelPosition = null;
          current.dihedralDegrees = null;
          onAngleSelected({
            atomElements: [
              current.angleSelection[0].element,
              current.angleSelection[1].element,
              '',
            ],
            angleDegrees: 0,
            stage: 2,
          });
          onDihedralSelected({
            atomElements: [
              current.angleSelection[0].element,
              current.angleSelection[1].element,
              '',
              '',
            ],
            dihedralDegrees: 0,
            stage: 2,
          });
          return;
        }

        const [a, b, c, d] = current.angleSelection;
        const pa = a.position.clone();
        const pb = b.position.clone();
        const pc = c.position.clone();
        const ba = pa.sub(pb);
        const bc = pc.sub(pb);
        const baLen = ba.length();
        const bcLen = bc.length();

        if (baLen < 1e-4 || bcLen < 1e-4) {
          clearSelection();
          return;
        }

        const baNorm = ba.clone().normalize();
        const bcNorm = bc.clone().normalize();
        const angleRadians = Math.acos(clamp(baNorm.dot(bcNorm), -1, 1));
        const angleDegrees = MathUtils.radToDeg(angleRadians);
        const bisector = baNorm.add(bcNorm);
        const offsetDirection =
          bisector.lengthSq() > 1e-6 ? bisector.normalize() : new Vector3(0.35, 0.35, 0);

        current.angleDegrees = angleDegrees;
        current.angleLabelPosition = b.position.clone().add(offsetDirection.multiplyScalar(0.9));
        removeAngleArcMesh(current);
        current.angleArcMesh = createAngleArcMesh(b.position, a.position, c.position, current.scene);
        const angleAnchor = current.angleLabelPosition.clone();
        onAngleSelected({
          atomElements: [
            a.element,
            b.element,
            c.element,
          ],
          angleDegrees,
          stage: 3,
          anchor: { x: angleAnchor.x, y: angleAnchor.y, z: angleAnchor.z },
          atomIndices: [
            a.atomIndex,
            b.atomIndex,
            c.atomIndex,
          ],
        });

        if (current.angleSelection.length === 3) {
          current.dihedralLabelPosition = null;
          current.dihedralDegrees = null;
          onDihedralSelected({
            atomElements: [
              a.element,
              b.element,
              c.element,
              '',
            ],
            dihedralDegrees: 0,
            stage: 3,
          });
          return;
        }

        const pd = d.position.clone();
        const b0 = new Vector3().subVectors(pa, pb);
        const b1 = new Vector3().subVectors(pc, pb);
        const b2 = new Vector3().subVectors(pd, pc);
        const b1Len = b1.length();

        if (b1Len < 1e-4) {
          clearSelection();
          return;
        }

        const b1Norm = b1.clone().normalize();
        const v = b0.sub(b1Norm.clone().multiplyScalar(b0.dot(b1Norm)));
        const w = b2.sub(b1Norm.clone().multiplyScalar(b2.dot(b1Norm)));
        const vLen = v.length();
        const wLen = w.length();

        if (vLen < 1e-4 || wLen < 1e-4) {
          clearSelection();
          return;
        }

        const x = v.normalize().dot(w.normalize());
        const y = new Vector3().crossVectors(b1Norm, v).dot(w);
        const dihedralDegrees = MathUtils.radToDeg(Math.atan2(y, x));
        current.dihedralDegrees = dihedralDegrees;
        current.dihedralLabelPosition = new Vector3()
          .addVectors(b.position, c.position)
          .multiplyScalar(0.5)
          .add(new Vector3(0.35, 0.35, 0));
        const dihedralAnchor = current.dihedralLabelPosition.clone();
        onDihedralSelected({
          atomElements: [
            a.element,
            b.element,
            c.element,
            d.element,
          ],
          dihedralDegrees,
          stage: 4,
          anchor: { x: dihedralAnchor.x, y: dihedralAnchor.y, z: dihedralAnchor.z },
          atomIndices: [
            a.atomIndex,
            b.atomIndex,
            c.atomIndex,
            d.atomIndex,
          ],
        });
        return;
      }

      if (!bond) {
        clearSelection();
        return;
      }

      clearOverlays(current, current.selectedAtomOverlays);
      current.angleSelection = [];
      current.angleLabelPosition = null;
      current.angleDegrees = null;
      current.dihedralLabelPosition = null;
      current.dihedralDegrees = null;
      onAngleSelected(null);
      onDihedralSelected(null);

      removeOverlay(current, current.selectedBondOverlay);
      current.selectedBondOverlay = createBondOverlay(current, bond);

      current.selectedBondData = bond;
      onBondSelected({
        atom1Element: bond.atom1Element,
        atom2Element: bond.atom2Element,
        distance: bond.distance,
        anchor: { x: bond.midpoint.x, y: bond.midpoint.y, z: bond.midpoint.z },
        atomIndices: [bond.atom1Index, bond.atom2Index],
      });
    };

    renderer.domElement.addEventListener('pointerdown', onPointerDown);
    renderer.domElement.addEventListener('pointerup', onPointerUp);

    // Publication export workflow
    const onExport = () => {
      if (!moleculeDataRef.current) {
        onError('Load a molecule before exporting a PNG.');
        return;
      }
      setExportPanelOpen(true);
    };
    if (!previewMode) {
      canvasEventUnsubscribers.push(listenToCanvasEvent('export-png', onExport));
    }

    const onClearSelection = () => clearSelection();
    if (!previewMode) {
      canvasEventUnsubscribers.push(listenToCanvasEvent('clear-selection', onClearSelection));
    }

    return () => {
      ro.disconnect();
      canvasEventUnsubscribers.forEach((unsubscribe) => unsubscribe());
      renderer.domElement.removeEventListener('pointerdown', onPointerDown);
      renderer.domElement.removeEventListener('pointerup', onPointerUp);
      cancelAnimationFrame(animId);
      disposeSceneContext();
      ctxRef.current = null;
    };
  }, [
    moleculeData,
    onAngleSelected,
    onBondSelected,
    onDihedralSelected,
    onError,
    onPersistentLabelCreate,
    onSelectionSummaryChange,
    onToast,
    previewMode,
  ]);

  useEffect(() => {
    if (!previewMode || !previewCaptureToken || !previewPose) return;
    let cancelled = false;

    const waitFrame = () => new Promise<void>((resolve) => {
      requestAnimationFrame(() => resolve());
    });

    const capture = async () => {
      try {
        await waitFrame();
        await waitFrame();
        if (cancelled) return;
        const ctx = ctxRef.current;
        const host = containerRef.current;
        if (!ctx || !host) throw new Error('Preview renderer is not ready.');
        applySavedPoseToContext(ctx, previewPose);
        await waitFrame();
        await waitFrame();
        if (cancelled) return;
        const dataUrl = renderCurrentViewDataUrl(ctx, host, { moleculeData, pngExportScale, maxWidth: 400 });
        onPreviewCaptured?.(previewCaptureToken, dataUrl);
      } catch (error) {
        if (cancelled) return;
        onPreviewError?.(
          previewCaptureToken,
          error instanceof Error ? error.message : String(error),
        );
      }
    };

    void capture();

    return () => {
      cancelled = true;
    };
  }, [
    onPreviewCaptured,
    onPreviewError,
    previewCaptureToken,
    previewMode,
    previewPose,
  ]);

  useEffect(() => {
    const ctx = ctxRef.current;
    if (!ctx) return;
    applyMaterialPreset(ctx.bondMat, renderProfile);
    for (const material of ctx.atomMats.values()) {
      applyMaterialPreset(material, renderProfile, true);
    }
    ctx.molGroup.traverse((object) => {
      if (object instanceof InstancedMesh && object.material instanceof MeshPhongMaterial) {
        const bonds = object.userData.bonds as BondSelectionData[] | undefined;
        if (bonds && object.material === ctx.bondMat) {
          applyMaterialPreset(object.material, renderProfile);
        } else if (bonds) {
          applyMaterialFinish(object.material, renderProfile);
        }
        const atoms = object.userData.atoms as AtomSelectionData[] | undefined;
        if (atoms) {
          applyMaterialPreset(object.material, renderProfile, true);
        }
      }
    });
  }, [renderProfile]);

  // ------------------------------------------------------------------
  // Rebuild molecule meshes when topology or visibility changes.
  // ------------------------------------------------------------------
  useEffect(() => {
    const ctx = ctxRef.current;
    if (!ctx) return;
    const perfStart = performance.now();

    const {
      molGroup, perspectiveCamera, camera, controls, atomMats, bondMat, selectedBondMat, selectedAtomMat,
    } = ctx;
    const shouldFitCamera = moleculeData?.path !== previousMoleculeDataRef.current?.path;

    // Clear previous molecule batches while keeping shared base materials alive.
    const sharedAtomMaterials = new Set(atomMats.values());
    molGroup.traverse(obj => {
      if (
        (obj instanceof Mesh || obj instanceof InstancedMesh) &&
        obj.material !== bondMat &&
        obj.material !== selectedBondMat &&
        obj.material !== selectedAtomMat &&
        !sharedAtomMaterials.has(obj.material as MeshPhongMaterial)
      ) {
        (obj.material as Material).dispose();
      }
    });
    molGroup.clear();
    ctx.bondPickObjects = [];
    ctx.atomPickObjects = [];
    ctx.selectedBondOverlay = null;
    ctx.selectedBondData = null;
    ctx.selectedAtomOverlays = [];
    ctx.modeSelectedAtomOverlays = [];
    ctx.modeSelectedBondOverlays = [];
    ctx.modeSelectedAtoms = [];
    ctx.modeSelectedBonds = [];
    ctx.angleSelection = [];
    ctx.angleLabelPosition = null;
    ctx.angleDegrees = null;
    ctx.dihedralLabelPosition = null;
    ctx.dihedralDegrees = null;
    onBondSelected(null);
    onAngleSelected(null);
    onDihedralSelected(null);
    onSelectionSummaryChange({ atomCount: 0, bondCount: 0, atomIndices: [], bondKeys: [] });

    if (!moleculeData || moleculeData.atoms.length === 0) {
      applyRenderPixelRatio(ctx, 0, 0);
      ctx.lastMoleculeBox = null;
      updateFloorPlacement(ctx);
      previousMoleculeDataRef.current = moleculeData;
      return;
    }

    const activeVisibilityIndex = visibilityIndex?.moleculeData === moleculeData ? visibilityIndex : null;
    const hiddenAtomSet = new Set(hiddenAtomIndices);
    applyRenderPixelRatio(ctx, moleculeData.atoms.length, moleculeData.bonds.length);
    const { visibleAtomCount, visibleBondCount, qualityProfile } = buildMoleculeBatches(ctx, {
      moleculeData,
      visibilityIndex: activeVisibilityIndex,
      hydrogenVisibility,
      hiddenAtomSet,
      renderProfile,
      elementColorOverrides,
      atomStyleOverrides,
      bondStyleOverrides,
      atomSizeScale,
      bondSizeScale: viewOptions.bondSizeScale,
    });

    // --- Fit camera ---
    const box = activeVisibilityIndex?.bounds?.clone() ?? new Box3().setFromObject(molGroup);
    ctx.lastMoleculeBox = box.isEmpty() ? null : box.clone();
    updateFloorPlacement(ctx);
    const currentViewOptions = viewOptionsRef.current;
    ctx.floorGroup.visible = Boolean(
      ctx.lastMoleculeBox && (currentViewOptions.showFloor || currentViewOptions.showGrid),
    );
    ctx.floorPlane.visible = currentViewOptions.showFloor;
    ctx.floorGrid.visible = currentViewOptions.showGrid;

    if (shouldFitCamera && ctx.lastMoleculeBox) {
      const size   = box.getSize(new Vector3());
      const maxDim = Math.max(size.x, size.y, size.z);
      const fovRad = perspectiveCamera.fov * (Math.PI / 180);
      const dist   = (maxDim / 2 / Math.tan(fovRad / 2)) * 1.9;

      perspectiveCamera.near = dist / 100;
      perspectiveCamera.far  = dist * 100;
      perspectiveCamera.updateProjectionMatrix();
      camera.near = dist / 100;
      camera.far = dist * 100;
      camera.updateProjectionMatrix();
      camera.position.set(0.15, 0.1, dist);
      controls.target.set(0, 0, 0);
      controls.update();
      controls.saveState();
      ctx.lastCameraDistance = dist;
      if (camera instanceof OrthographicCamera) syncOrthographicCamera(ctx);
    }

    previousMoleculeDataRef.current = moleculeData;
    const rebuildSceneMs = performance.now() - perfStart;
    renderScene(ctx);
    const renderStats = sceneRenderStats(ctx);
    if (perfLoggingEnabled()) {
      console.info(
        '[Cylform perf] rebuild_scene',
        {
          ms: Math.round(rebuildSceneMs),
          atoms: visibleAtomCount,
          bonds: visibleBondCount,
          totalAtoms: moleculeData.atoms.length,
          totalBonds: moleculeData.bonds.length,
          renderCalls: renderStats.renderCalls,
          triangles: renderStats.triangles,
          geometries: renderStats.geometries,
          textures: renderStats.textures,
          sceneObjects: renderStats.sceneObjects,
        },
      );
    }

    if (benchmarkConfig?.enabled && onBenchmarkRender && shouldFitCamera) {
      const sampleMs = benchmarkConfig.sampleMs || 3000;
      const interactionMs = benchmarkConfig.interactionMs || 1200;
      const targetFrameMs = 1000 / (benchmarkConfig.targetFps || 30);
      void sampleFrameTimes(sampleMs).then(async (frameTimes) => {
        const debugInfo = webglDebugInfo(ctx.renderer);
        const pickMetrics = benchmarkPickMetrics(ctx);
        const passiveMetrics = frameMetrics(frameTimes);
        const interactionMetrics = await benchmarkInteractionMetrics(ctx, interactionMs);
        onBenchmarkRender({
          rebuildSceneMs,
          visibleAtoms: visibleAtomCount,
          visibleBonds: visibleBondCount,
          totalAtoms: moleculeData.atoms.length,
          totalBonds: moleculeData.bonds.length,
          renderProfile,
          renderQuality: qualityProfile,
          renderCalls: renderStats.renderCalls,
          triangles: renderStats.triangles,
          geometries: renderStats.geometries,
          textures: renderStats.textures,
          sceneObjects: renderStats.sceneObjects,
          pickAtomMs: pickMetrics.pickAtomMs,
          pickBondMs: pickMetrics.pickBondMs,
          pickTotalMs: pickMetrics.pickTotalMs,
          pickHitType: pickMetrics.pickHitType,
          pickAtomCandidates: pickMetrics.pickAtomCandidates,
          pickBondCandidates: pickMetrics.pickBondCandidates,
          frameSampleMs: sampleMs,
          sampledFrames: passiveMetrics.sampledFrames,
          averageFrameMs: passiveMetrics.averageFrameMs,
          p95FrameMs: passiveMetrics.p95FrameMs,
          minFps: passiveMetrics.minFps,
          averageFps: passiveMetrics.averageFps,
          interactionFrameSampleMs: interactionMs,
          interactionAverageFrameMs: interactionMetrics.averageFrameMs,
          interactionP95FrameMs: interactionMetrics.p95FrameMs,
          interactionMinFps: interactionMetrics.minFps,
          interactionAverageFps: interactionMetrics.averageFps,
          interactionPhases: interactionMetrics.phases,
          webglRenderer: debugInfo.webglRenderer,
          webglVendor: debugInfo.webglVendor,
          responsive: Boolean(
            frameTimes.length > 0 &&
            passiveMetrics.p95FrameMs !== null &&
            passiveMetrics.p95FrameMs <= targetFrameMs * 1.5 &&
            interactionMetrics.p95FrameMs !== null &&
            interactionMetrics.p95FrameMs <= targetFrameMs * 1.5 &&
            rebuildSceneMs <= 15_000
          ),
        });
      });
    }

  }, [
    moleculeData,
    visibilityIndex,
    hydrogenVisibility,
    hiddenAtomIndices,
    isCylviewProfile,
    elementColorOverrides,
    atomStyleOverrides,
    atomSizeScale,
    bondStyleOverrides,
    onBondSelected,
    onAngleSelected,
    onDihedralSelected,
    onSelectionSummaryChange,
    benchmarkConfig,
    onBenchmarkRender,
    viewOptions.bondSizeScale,
  ]);

  useEffect(() => {
    const ctx = ctxRef.current;
    if (!ctx) return;

    ctx.controls.mouseButtons = orbitMouseButtons(mouseMode);
    ctx.controls.zoomSpeed = invertScrollZoom ? -1 : 1;
  }, [invertScrollZoom, mouseMode]);

  // Apply scene/view options in place so rendering controls do not rebuild meshes.
  useEffect(() => {
    const ctx = ctxRef.current;
    if (!ctx) return;

    setActiveCamera(ctx, viewOptions.projection);

    const bg = backdropColor(viewOptions.backdropTone, viewOptions.customBackdropHex);
    ctx.depthCue.options = viewOptions;
    updateDepthCueBackground(ctx, bg);

    const publicationMood = renderProfile === 'cylview'
      ? { ambient: 0.78, key: 0.96, fill: 0.68, rim: 0.14, topLight: 0.18 }
      : renderProfile === 'houkmol'
        ? { ambient: 0.65, key: 1.08, fill: 0.5, rim: 0.1, topLight: 0.18 }
        : { ambient: 0.52, key: 1.65, fill: 0.72, rim: 0.24, topLight: 0.35 };
    const moods = {
      publication: publicationMood,
      'soft-studio': { ambient: 0.72, key: 1.12, fill: 0.92, rim: 0.2, topLight: 0.46 },
      'high-contrast': { ambient: 0.32, key: 2.08, fill: 0.32, rim: 0.58, topLight: 0.22 },
    }[viewOptions.lightingMood];

    ctx.lights.ambient.intensity = moods.ambient;
    ctx.lights.key.intensity = moods.key;
    ctx.lights.fill.intensity = moods.fill;
    ctx.lights.rim.intensity = moods.rim;
    ctx.lights.topLight.intensity = moods.topLight;

    ctx.controls.autoRotate = viewOptions.autoRotate;
    ctx.controls.autoRotateSpeed = viewOptions.autoRotateSpeed;
    ctx.floorGroup.visible = Boolean(ctx.lastMoleculeBox && (viewOptions.showFloor || viewOptions.showGrid));
    ctx.floorPlane.visible = viewOptions.showFloor;
    ctx.floorGrid.visible = viewOptions.showGrid;
  }, [renderProfile, viewOptions]);

  useEffect(() => {
    const ctx = ctxRef.current;
    if (!ctx) return;

    for (const [element, material] of ctx.atomMats.entries()) {
      material.color.set(elementColorOverrides[element] ?? atomColorHex(element));
    }
  }, [elementColorOverrides, moleculeData, hydrogenVisibility, hiddenAtomIndices]);

  const measureHelpText = selectedDihedral?.stage === 1
    ? 'Select atom 2'
    : selectedDihedral?.stage === 2
      ? 'Select atom 3'
      : selectedDihedral?.stage === 3
        ? 'Select atom 4'
        : selectedDihedral?.stage === 4
          ? `Dihedral ${formatAngle(selectedDihedral.dihedralDegrees, anglePrecision, useSymbolUnits)}`
          : selectedAngle
        ? `Angle ${formatAngle(selectedAngle.angleDegrees, anglePrecision, useSymbolUnits)}`
        : selectedBond
          ? `Distance ${formatDistance(selectedBond.distance, distancePrecision, useSymbolUnits)}`
          : 'Click a bond for distance, or atoms for angle/dihedral';

  const helpText = !moleculeData
    ? 'Open XYZ or PDB'
    : selectionMode === 'view'
      ? 'View mode: orbit, pan, and zoom'
      : selectionMode === 'atom'
        ? 'Atom mode: click atoms to select'
        : selectionMode === 'bond'
          ? 'Bond mode: click bonds to select'
          : selectionMode === 'atom-bond'
            ? 'Atom+Bond mode: click atoms or bonds to select'
            : selectionMode === 'label'
              ? 'Label mode: click atoms to add persistent labels'
              : measureHelpText;

  const patchViewOptions = (patch: Partial<ViewOptions>) => {
    onViewOptionsChange((current) => ({ ...current, ...patch }));
  };

  const handleCameraPreset = (preset: 'front' | 'top' | 'right' | 'iso') => {
    const ctx = ctxRef.current;
    if (!ctx || !moleculeData) return;
    applyCameraPreset(ctx, preset);
  };

  const patchExportSettings = (patch: Partial<PublicationExportSettings>) => {
    setExportSettings((current) => ({ ...current, ...patch }));
  };

  const currentPublicationState = (data: MoleculeData | null = moleculeData) => {
    const ctx = ctxRef.current;
    if (!ctx || !data) return null;
    return capturePublicationRenderState({
      ctx,
      moleculeData: data,
      renderProfile,
      viewOptions,
      hydrogenVisibility,
      hiddenAtomIndices,
      elementColorOverrides,
      atomStyleOverrides,
      bondStyleOverrides,
      atomSizeScale,
      persistentLabels,
      savedPoses,
    });
  };

  const waitForFrameRender = async () => {
    await new Promise<void>((resolve) => requestAnimationFrame(() => resolve()));
    await new Promise<void>((resolve) => requestAnimationFrame(() => resolve()));
  };

  const runPublicationRender = async (purpose: 'preview' | 'save') => {
    const ctx = ctxRef.current;
    const renderState = currentPublicationState();
    if (!ctx || !moleculeData || !renderState) {
      onError('Load a molecule before exporting a PNG.');
      return;
    }

    exportCancelRef.current = false;
    try {
      let targetPath: string | null = null;
      const frameIndices = purpose === 'save'
        ? resolveExportFrameIndices(exportSettings, frameCount, frameIndex)
        : [frameIndex];
      if (purpose === 'save') {
        const defaultName = sanitizeExportFileName(`${moleculeData.name || 'molecule'}.png`);

        targetPath = await save({
          title: 'Export Publication Figure',
          defaultPath: defaultName,
          filters: [{ name: 'PNG Image', extensions: ['png'] }],
        });
        if (!targetPath) return;
      }

      setExportProgress({ progress: 0, label: purpose === 'preview' ? 'Preparing preview' : 'Preparing export' });
      const fixedCameraPose = exportSettings.fixedCameraForSequence
        ? {
            position: ctx.camera.position.clone(),
            target: ctx.controls.target.clone(),
          }
        : null;
      let fixedCropBox = exportSettings.fixedCropBoundsForSequence && frameIndices.length > 1 && ctx.lastMoleculeBox
        ? ctx.lastMoleculeBox.clone().makeEmpty()
        : null;
      if (fixedCropBox) {
        for (const index of frameIndices) {
          if (exportCancelRef.current) throw new Error('Frame sequence export cancelled.');
          await onFrameChange(index);
          await waitForFrameRender();
          if (ctx.lastMoleculeBox) fixedCropBox.union(ctx.lastMoleculeBox);
        }
      }

      let lastPreview: string | null = null;
      let savedCount = 0;
      for (const [sequenceIndex, index] of frameIndices.entries()) {
        if (exportCancelRef.current) throw new Error('Frame sequence export cancelled.');
        const frameData = frameCount > 1 ? await onFrameChange(index) : moleculeData;
        await waitForFrameRender();
        if (fixedCameraPose) {
          ctx.camera.position.copy(fixedCameraPose.position);
          ctx.controls.target.copy(fixedCameraPose.target);
          ctx.controls.update();
        }
        const frameRenderState = currentPublicationState(frameData ?? moleculeData);
        if (!frameRenderState) throw new Error('Frame renderer is not ready.');
        const frameOffset = sequenceIndex / frameIndices.length;
        const frameSpan = 1 / frameIndices.length;
        const result = await renderPublicationExport({
          ctx,
          host: containerRef.current,
          settings: exportSettings,
          renderState: frameRenderState,
          fixedCropBox,
          onProgress: (progress, label) => {
            const totalProgress = Math.min(1, frameOffset + progress * frameSpan);
            setExportProgress({
              progress: totalProgress,
              label: frameIndices.length > 1 ? `Frame ${index + 1}: ${label}` : label,
            });
          },
          shouldCancel: () => exportCancelRef.current,
        });
        lastPreview = result.previewDataUrl;

        if (purpose === 'save') {
          if (!targetPath) throw new Error('Export path was not selected.');
          const framePath = numberedPngPath(targetPath, index, frameIndices.length);
          const pngBytes = dataUrlToBytes(result.dataUrl);
          await invoke('export_png', { path: framePath, bytes: Array.from(pngBytes) });
          if (result.metadataJson) {
            const sidecarPath = framePath.replace(/\.png$/i, '') + '.cylform-render.json';
            await invoke('export_text_sidecar', { path: sidecarPath, contents: result.metadataJson });
          }
          savedCount += 1;
        }
      }

      if (lastPreview) setExportPreviewDataUrl(lastPreview);

      if (purpose === 'save') {
        onToast(
          savedCount === 1
            ? 'Exported current frame PNG'
            : `Exported ${savedCount} frame PNGs`,
          'success',
        );
      } else {
        onToast('Export preview refreshed', 'success');
      }
    } catch (error) {
      onError(error instanceof Error ? error.message : String(error));
    } finally {
      setExportProgress(null);
      exportCancelRef.current = false;
    }
  };

  const cancelPublicationExport = () => {
    exportCancelRef.current = true;
    setExportProgress((current) => current ? { ...current, label: 'Cancelling export' } : current);
  };

  const requestFrame = (nextFrameIndex: number) => {
    const count = Math.max(1, frameCount);
    const normalized = ((nextFrameIndex % count) + count) % count;
    void onFrameChange(normalized);
  };

  const exportCurrentFrameXyz = async () => {
    if (!moleculeData) {
      onError('Load a molecule before exporting a frame.');
      return;
    }
    try {
      const defaultName = sanitizeExportFileName(
        `${moleculeData.name || 'frame'}_${String(frameIndex + 1).padStart(4, '0')}.xyz`,
      );
      const targetPath = await save({
        title: 'Export Current Frame as XYZ',
        defaultPath: defaultName,
        filters: [{ name: 'XYZ Structure', extensions: ['xyz'] }],
      });
      if (!targetPath) return;
      await invoke('export_xyz_frame', {
        path: targetPath,
        sourcePath: moleculeData.path,
        frameIndex,
      });
      onToast(`Exported frame ${frameIndex + 1} XYZ`, 'success');
    } catch (error) {
      onError(error instanceof Error ? error.message : String(error));
    }
  };

  return (
    <div
      ref={containerRef}
      className={[
        'molecule-canvas',
        `render-profile-${renderProfile}`,
        previewMode ? 'preview-render-canvas' : '',
      ].filter(Boolean).join(' ')}
      style={{ '--label-font-scale': viewOptions.labelFontScale } as React.CSSProperties}
    >
      {!previewMode && (
        <div
          className="left-options-stack"
          onPointerDown={(event) => event.stopPropagation()}
          onPointerUp={(event) => event.stopPropagation()}
          onClick={(event) => event.stopPropagation()}
        >
          <aside className="view-options-panel" aria-label="View options">
            <div className="view-panel-header">
              <span>View</span>
              <span className="view-panel-status">Session</span>
            </div>

            {frameCount > 1 && (
              <div className="frame-transport" aria-label="Frame controls">
                <div className="view-split-row">
                  <span>Frame</span>
                  <span>{frameIndex + 1} / {frameCount}</span>
                </div>
                <input
                  className="view-range"
                  type="range"
                  min="0"
                  max={Math.max(0, frameCount - 1)}
                  step="1"
                  value={frameIndex}
                  aria-label="Current frame"
                  onChange={(event) => requestFrame(Number(event.target.value))}
                />
                <div className="frame-button-row">
                  <button type="button" onClick={() => requestFrame(frameIndex - 1)}>Prev</button>
                  <button type="button" className={isFramePlaying ? 'view-toggle active' : 'view-toggle'} onClick={onFramePlaybackToggle}>
                    {isFramePlaying ? 'Pause' : 'Play'}
                  </button>
                  <button type="button" onClick={() => requestFrame(frameIndex + 1)}>Next</button>
                </div>
                <label className="view-control">
                  <span>Speed</span>
                  <select
                    value={framePlaybackSpeed}
                    onChange={(event) => onFramePlaybackSpeedChange(Number(event.target.value))}
                  >
                    <option value={0.5}>0.5 fps</option>
                    <option value={1}>1 fps</option>
                    <option value={2}>2 fps</option>
                    <option value={5}>5 fps</option>
                    <option value={10}>10 fps</option>
                  </select>
                </label>
                <button type="button" className="panel-action compact" onClick={() => void exportCurrentFrameXyz()}>
                  Export XYZ
                </button>
              </div>
            )}

            <div className="view-toggle-row">
              <button
                type="button"
                className={viewOptions.showFloor ? 'view-toggle active' : 'view-toggle'}
                onClick={() => patchViewOptions({ showFloor: !viewOptions.showFloor })}
              >
                Floor
              </button>
              <button
                type="button"
                className={viewOptions.showGrid ? 'view-toggle active' : 'view-toggle'}
                onClick={() => patchViewOptions({ showGrid: !viewOptions.showGrid })}
              >
                Grid
              </button>
            </div>
            <div className="view-toggle-row">
              <button
                type="button"
                className={viewOptions.showLabelLinkLines ? 'view-toggle active' : 'view-toggle'}
                onClick={() => patchViewOptions({ showLabelLinkLines: !viewOptions.showLabelLinkLines })}
              >
                Link lines
              </button>
            </div>

            <label className="view-control">
              <span>Backdrop</span>
              <select
                value={viewOptions.backdropTone}
                onChange={(event) => patchViewOptions({ backdropTone: event.target.value as ViewOptions['backdropTone'] })}
              >
                <option value="clean">Clean white</option>
                <option value="warm">Warm grey</option>
                <option value="slate">Slate</option>
                <option value="black">Black</option>
                <option value="custom">Custom</option>
              </select>
            </label>

            <label className="view-control">
              <span>Projection</span>
              <select
                value={viewOptions.projection}
                onChange={(event) => patchViewOptions({ projection: event.target.value as ViewOptions['projection'] })}
              >
                <option value="perspective">Perspective</option>
                <option value="orthographic">Orthographic</option>
              </select>
            </label>

            <label className="view-control">
              <span>Lighting</span>
              <select
                value={viewOptions.lightingMood}
                onChange={(event) => patchViewOptions({ lightingMood: event.target.value as ViewOptions['lightingMood'] })}
              >
                <option value="publication">Publication</option>
                <option value="soft-studio">Soft studio</option>
                <option value="high-contrast">High contrast</option>
              </select>
            </label>

            <label className="view-control">
              <span>Render style</span>
              <select
                value={renderProfile}
                onKeyDown={preventMaterialPresetShortcutOverlap}
                onChange={(event) => {
                  const nextProfile = event.target.value as RenderProfileId;
                  onRenderProfileChange(nextProfile);
                  patchViewOptions(profileViewOptionPatch(nextProfile));
                  event.currentTarget.blur();
                }}
              >
                <option value="cylview">CYLview</option>
                <option value="ball-stick">Ball and stick</option>
                <option value="houkmol">Houkmol</option>
              </select>
            </label>

            <label className="view-control">
              <span>Export scale</span>
              <select
                value={pngExportScale}
                onChange={(event) => {
                  onPngExportScaleChange(Number(event.target.value) as 1 | 2 | 4);
                }}
              >
                <option value={1}>1x</option>
                <option value={2}>2x</option>
                <option value={4}>4x</option>
              </select>
            </label>

            <div className="view-split-row">
              <button
                type="button"
                className={viewOptions.fogEnabled ? 'view-toggle active' : 'view-toggle'}
                onClick={() => patchViewOptions({ fogEnabled: !viewOptions.fogEnabled })}
              >
                Depth cue
              </button>
              <span>{viewOptions.fogEnabled ? 'On' : 'Off'}</span>
            </div>
            <div className="view-split-row">
              <span>Fog</span>
              <span>{Math.round(viewOptions.fogIntensity * 100)}%</span>
            </div>
            <input
              className="view-range"
              type="range"
              min="0"
              max="1"
              step="0.05"
              value={viewOptions.fogIntensity}
              disabled={!viewOptions.fogEnabled}
              aria-label="Fog amount"
              onChange={(event) => patchViewOptions({ fogIntensity: Number(event.target.value) })}
            />
            <div className="view-split-row">
              <span>Depth</span>
              <span>{Math.round(viewOptions.fogDepth * 100)}%</span>
            </div>
            <input
              className="view-range"
              type="range"
              min="0"
              max="1"
              step="0.05"
              value={viewOptions.fogDepth}
              disabled={!viewOptions.fogEnabled}
              aria-label="Fog depth"
              onChange={(event) => patchViewOptions({ fogDepth: Number(event.target.value) })}
            />

            <div className="view-split-row">
              <button
                type="button"
                className={viewOptions.focalBlurEnabled ? 'view-toggle active' : 'view-toggle'}
                onClick={() => patchViewOptions({ focalBlurEnabled: !viewOptions.focalBlurEnabled })}
              >
                Focal blur
              </button>
              <span>{viewOptions.focalBlurEnabled ? 'On' : 'Off'}</span>
            </div>
            <div className="view-split-row">
              <span>Blur</span>
              <span>{Math.round(viewOptions.focalBlurAmount * 100)}%</span>
            </div>
            <input
              className="view-range"
              type="range"
              min="0"
              max="1"
              step="0.05"
              value={viewOptions.focalBlurAmount}
              disabled={!viewOptions.focalBlurEnabled}
              aria-label="Focal blur amount"
              onChange={(event) => patchViewOptions({ focalBlurAmount: Number(event.target.value) })}
            />
            <div className="view-split-row">
              <span>Focus</span>
              <span>{Math.round(viewOptions.focalDepth * 100)}%</span>
            </div>
            <input
              className="view-range"
              type="range"
              min="0"
              max="1"
              step="0.05"
              value={viewOptions.focalDepth}
              disabled={!viewOptions.focalBlurEnabled}
              aria-label="Focal depth"
              onChange={(event) => patchViewOptions({ focalDepth: Number(event.target.value) })}
            />

            <div className="view-split-row">
              <button
                type="button"
                className={viewOptions.autoRotate ? 'view-toggle active' : 'view-toggle'}
                onClick={() => patchViewOptions({ autoRotate: !viewOptions.autoRotate })}
              >
                Auto-rotate
              </button>
              <span>{viewOptions.autoRotateSpeed.toFixed(2)}x</span>
            </div>
            <input
              className="view-range"
              type="range"
              min="0.15"
              max="0.8"
              step="0.05"
              value={viewOptions.autoRotateSpeed}
              disabled={!viewOptions.autoRotate}
              aria-label="Auto-rotate speed"
              onChange={(event) => patchViewOptions({ autoRotateSpeed: Number(event.target.value) })}
            />

            <div className="camera-preset-grid" aria-label="Camera presets">
              <button type="button" disabled={!moleculeData} onClick={() => handleCameraPreset('front')}>Front</button>
              <button type="button" disabled={!moleculeData} onClick={() => handleCameraPreset('top')}>Top</button>
              <button type="button" disabled={!moleculeData} onClick={() => handleCameraPreset('right')}>Right</button>
              <button type="button" disabled={!moleculeData} onClick={() => handleCameraPreset('iso')}>Iso</button>
            </div>
          </aside>

          {exportPanelOpen && (
            <aside className="publication-export-panel" aria-label="Publication export">
              <div className="view-panel-header">
                <span>Export</span>
                <button
                  type="button"
                  className="panel-close-button"
                  onClick={() => setExportPanelOpen(false)}
                  aria-label="Close export panel"
                >
                  x
                </button>
              </div>

              <div className="export-mode-grid" aria-label="Export mode">
                {([
                  ['viewport', 'Viewport'],
                  ['publication-raster', 'Raster'],
                  ['path-traced', 'Path trace'],
                ] as Array<[ExportMode, string]>).map(([mode, label]) => (
                  <button
                    key={mode}
                    type="button"
                    className={exportSettings.mode === mode ? 'view-toggle active' : 'view-toggle'}
                    onClick={() => patchExportSettings({ mode })}
                    disabled={Boolean(exportProgress)}
                  >
                    {label}
                  </button>
                ))}
              </div>

              <label className="view-control">
                <span>Size</span>
                <select
                  value={exportSettings.sizePreset}
                  disabled={Boolean(exportProgress)}
                  onChange={(event) => patchExportSettings({ sizePreset: event.target.value as ExportSizePreset })}
                >
                  <option value="viewport">Viewport</option>
                  <option value="manuscript">Manuscript</option>
                  <option value="slide">Slide</option>
                  <option value="poster">Poster</option>
                  <option value="custom">Custom</option>
                </select>
              </label>

              {exportSettings.sizePreset === 'custom' && (
                <div className="export-pair-row">
                  <label>
                    <span>W</span>
                    <input
                      type="number"
                      min="16"
                      max="24000"
                      value={exportSettings.customWidth}
                      disabled={Boolean(exportProgress)}
                      onChange={(event) => patchExportSettings({ customWidth: Number(event.target.value) })}
                    />
                  </label>
                  <label>
                    <span>H</span>
                    <input
                      type="number"
                      min="16"
                      max="24000"
                      value={exportSettings.customHeight}
                      disabled={Boolean(exportProgress)}
                      onChange={(event) => patchExportSettings({ customHeight: Number(event.target.value) })}
                    />
                  </label>
                </div>
              )}

              <label className="view-control">
                <span>Scale</span>
                <select
                  value={exportSettings.scalePreset}
                  disabled={Boolean(exportProgress)}
                  onChange={(event) => {
                    const value = event.target.value;
                    patchExportSettings({ scalePreset: value === 'custom' ? 'custom' : Number(value) as ExportScalePreset });
                  }}
                >
                  <option value={1}>1x</option>
                  <option value={2}>2x</option>
                  <option value={4}>4x</option>
                  <option value="custom">Custom</option>
                </select>
              </label>

              {exportSettings.scalePreset === 'custom' && (
                <label className="view-control">
                  <span>Custom scale</span>
                  <input
                    type="number"
                    min="0.25"
                    max="12"
                    step="0.25"
                    value={exportSettings.customScale}
                    disabled={Boolean(exportProgress)}
                    onChange={(event) => patchExportSettings({ customScale: Number(event.target.value) })}
                  />
                </label>
              )}

              <label className="view-control">
                <span>Background</span>
                <select
                  value={exportSettings.background}
                  disabled={Boolean(exportProgress)}
                  onChange={(event) => patchExportSettings({ background: event.target.value as PublicationExportSettings['background'] })}
                >
                  <option value="white">White</option>
                  <option value="transparent">Transparent</option>
                  <option value="current">Current</option>
                </select>
              </label>

              {frameCount > 1 && (
                <>
                  <label className="view-control">
                    <span>Frames</span>
                    <select
                      value={exportSettings.frameSelection}
                      disabled={Boolean(exportProgress)}
                      onChange={(event) => patchExportSettings({ frameSelection: event.target.value as PublicationExportSettings['frameSelection'] })}
                    >
                      <option value="current">Current</option>
                      <option value="range">Range</option>
                      <option value="every-nth">Every Nth</option>
                    </select>
                  </label>
                  {exportSettings.frameSelection !== 'current' && (
                    <>
                      <div className="export-pair-row">
                        <label>
                          <span>Start</span>
                          <input
                            type="number"
                            min="1"
                            max={frameCount}
                            value={exportSettings.frameStart}
                            disabled={Boolean(exportProgress)}
                            onChange={(event) => patchExportSettings({ frameStart: Number(event.target.value) })}
                          />
                        </label>
                        <label>
                          <span>End</span>
                          <input
                            type="number"
                            min="1"
                            max={frameCount}
                            value={exportSettings.frameEnd}
                            disabled={Boolean(exportProgress)}
                            onChange={(event) => patchExportSettings({ frameEnd: Number(event.target.value) })}
                          />
                        </label>
                      </div>
                      <label className="view-control">
                        <span>Every</span>
                        <input
                          type="number"
                          min="1"
                          max={frameCount}
                          value={exportSettings.frameStep}
                          disabled={Boolean(exportProgress) || exportSettings.frameSelection === 'range'}
                          onChange={(event) => patchExportSettings({ frameStep: Number(event.target.value) })}
                        />
                      </label>
                      <div className="view-toggle-row">
                        <button
                          type="button"
                          className={exportSettings.fixedCameraForSequence ? 'view-toggle active' : 'view-toggle'}
                          disabled={Boolean(exportProgress)}
                          onClick={() => patchExportSettings({ fixedCameraForSequence: !exportSettings.fixedCameraForSequence })}
                        >
                          Fixed camera
                        </button>
                        <button
                          type="button"
                          className={exportSettings.fixedCropBoundsForSequence ? 'view-toggle active' : 'view-toggle'}
                          disabled={Boolean(exportProgress)}
                          onClick={() => patchExportSettings({ fixedCropBoundsForSequence: !exportSettings.fixedCropBoundsForSequence })}
                        >
                          Fixed crop
                        </button>
                      </div>
                    </>
                  )}
                </>
              )}

              <div className="view-toggle-row">
                <button
                  type="button"
                  className={exportSettings.cropToMolecule ? 'view-toggle active' : 'view-toggle'}
                  disabled={Boolean(exportProgress)}
                  onClick={() => patchExportSettings({ cropToMolecule: !exportSettings.cropToMolecule })}
                >
                  Crop
                </button>
                <button
                  type="button"
                  className={exportSettings.absoluteScaleEnabled ? 'view-toggle active' : 'view-toggle'}
                  disabled={Boolean(exportProgress)}
                  onClick={() => patchExportSettings({ absoluteScaleEnabled: !exportSettings.absoluteScaleEnabled })}
                >
                  Absolute
                </button>
              </div>

              {exportSettings.cropToMolecule && (
                <label className="view-control">
                  <span>Padding</span>
                  <input
                    type="number"
                    min="0"
                    max="800"
                    value={exportSettings.cropPaddingPx}
                    disabled={Boolean(exportProgress)}
                    onChange={(event) => patchExportSettings({ cropPaddingPx: Number(event.target.value) })}
                  />
                </label>
              )}

              {exportSettings.absoluteScaleEnabled && (
                <label className="view-control">
                  <span>px / A</span>
                  <input
                    type="number"
                    min="12"
                    max="1200"
                    value={exportSettings.pixelsPerAngstrom}
                    disabled={Boolean(exportProgress)}
                    onChange={(event) => patchExportSettings({ pixelsPerAngstrom: Number(event.target.value) })}
                  />
                </label>
              )}

              {exportSettings.mode === 'publication-raster' && (
                <>
                  <label className="view-control">
                    <span>Sampling</span>
                    <select
                      value={exportSettings.supersampling}
                      disabled={Boolean(exportProgress)}
                      onChange={(event) => patchExportSettings({ supersampling: Number(event.target.value) as PublicationExportSettings['supersampling'] })}
                    >
                      <option value={1}>1x</option>
                      <option value={2}>2x</option>
                      <option value={3}>3x</option>
                      <option value={4}>4x</option>
                    </select>
                  </label>
                  <label className="view-control">
                    <span>Tone map</span>
                    <select
                      value={exportSettings.toneMapping}
                      disabled={Boolean(exportProgress)}
                      onChange={(event) => patchExportSettings({ toneMapping: event.target.value as ExportToneMapping })}
                    >
                      <option value="aces">ACES</option>
                      <option value="reinhard">Reinhard</option>
                      <option value="cineon">Cineon</option>
                      <option value="none">None</option>
                    </select>
                  </label>
                  <div className="view-toggle-row">
                    <button type="button" className={exportSettings.improvedShadows ? 'view-toggle active' : 'view-toggle'} disabled={Boolean(exportProgress)} onClick={() => patchExportSettings({ improvedShadows: !exportSettings.improvedShadows })}>Shadows</button>
                    <button type="button" className={exportSettings.ambientOcclusion ? 'view-toggle active' : 'view-toggle'} disabled={Boolean(exportProgress)} onClick={() => patchExportSettings({ ambientOcclusion: !exportSettings.ambientOcclusion })}>AO</button>
                    <button type="button" className={exportSettings.depthAwareOutline ? 'view-toggle active' : 'view-toggle'} disabled={Boolean(exportProgress)} onClick={() => patchExportSettings({ depthAwareOutline: !exportSettings.depthAwareOutline })}>Outline</button>
                  </div>
                </>
              )}

              {exportSettings.mode === 'path-traced' && (
                <label className="view-control">
                  <span>Quality</span>
                  <select
                    value={exportSettings.pathTraceQuality}
                    disabled={Boolean(exportProgress)}
                    onChange={(event) => patchExportSettings({ pathTraceQuality: event.target.value as PathTraceQuality })}
                  >
                    <option value="draft">Draft</option>
                    <option value="standard">Standard</option>
                    <option value="final">Final</option>
                  </select>
                </label>
              )}

              <div className="view-toggle-row">
                <button
                  type="button"
                  className={exportSettings.tiledExport ? 'view-toggle active' : 'view-toggle'}
                  disabled={Boolean(exportProgress)}
                  onClick={() => patchExportSettings({ tiledExport: !exportSettings.tiledExport })}
                >
                  Tiled
                </button>
                <button
                  type="button"
                  className={exportSettings.includeMetadataSidecar ? 'view-toggle active' : 'view-toggle'}
                  disabled={Boolean(exportProgress)}
                  onClick={() => patchExportSettings({ includeMetadataSidecar: !exportSettings.includeMetadataSidecar })}
                >
                  Metadata
                </button>
              </div>

              <label className="view-control">
                <span>Label scale</span>
                <input
                  type="number"
                  min="0.75"
                  max="2"
                  step="0.05"
                  value={exportSettings.printSafeAnnotationScale}
                  disabled={Boolean(exportProgress)}
                  onChange={(event) => patchExportSettings({ printSafeAnnotationScale: Number(event.target.value) })}
                />
              </label>

              {exportPreviewDataUrl && (
                <div className="export-preview">
                  <img src={exportPreviewDataUrl} alt="Export preview" />
                </div>
              )}

              {exportProgress && (
                <div className="export-progress" aria-live="polite">
                  <div><span style={{ width: `${Math.round(exportProgress.progress * 100)}%` }} /></div>
                  <p>{exportProgress.label}</p>
                </div>
              )}

              <div className="export-action-row">
                <button type="button" disabled={Boolean(exportProgress) || !moleculeData} onClick={() => void runPublicationRender('preview')}>
                  Preview
                </button>
                <button type="button" className="primary" disabled={Boolean(exportProgress) || !moleculeData} onClick={() => void runPublicationRender('save')}>
                  Save PNG
                </button>
                {exportProgress && (
                  <button type="button" onClick={cancelPublicationExport}>
                    Cancel
                  </button>
                )}
              </div>
            </aside>
          )}

          <AppearancePanel
            moleculeData={moleculeData}
            hydrogenVisibility={hydrogenVisibility}
            hiddenAtomIndices={hiddenAtomIndices}
            elementColorOverrides={elementColorOverrides}
            atomStyleOverrides={atomStyleOverrides}
            bondStyleOverrides={bondStyleOverrides}
            atomSizeScale={atomSizeScale}
            labelFontScale={viewOptions.labelFontScale}
            bondSizeScale={viewOptions.bondSizeScale}
            renderProfile={renderProfile}
            selectionMode={selectionMode}
            selectionSummary={selectionSummary}
            onElementColorChange={onElementColorChange}
            onResetElementColor={onResetElementColor}
            onResetAllElementColors={onResetAllElementColors}
            onAtomSizeScaleChange={onAtomSizeScaleChange}
            onLabelFontScaleChange={(scale) => onViewOptionsChange((prev) => ({ ...prev, labelFontScale: scale }))}
            onBondSizeScaleChange={(scale) => onViewOptionsChange((prev) => ({ ...prev, bondSizeScale: scale }))}

            onStyleSelectedAtoms={onStyleSelectedAtoms}
            onSizeSelectedAtoms={onSizeSelectedAtoms}
            onResetSelectedAtomStyles={onResetSelectedAtomStyles}
            onRestyleSelectedBonds={onRestyleSelectedBonds}
            onResetSelectedBondStyles={onResetSelectedBondStyles}
          />
        </div>
      )}
      {!previewMode && <div className="canvas-help-strip">{helpText}</div>}
      <div ref={bondLabelRef} className="bond-distance-label" />
      <div ref={angleLabelRef} className="angle-measure-label" />
      <div ref={dihedralLabelRef} className="dihedral-measure-label" />
      {persistentLabels.map((label) => (
        <div
          key={label.id}
          ref={(element) => {
            if (element) {
              persistentLabelRefs.current.set(label.id, element);
            } else {
              persistentLabelRefs.current.delete(label.id);
            }
          }}
          className={`persistent-label persistent-label-${label.type}`}
          title={label.type}
          dangerouslySetInnerHTML={{ __html: sanitizeLabelText(label.text) }}
        />
      ))}
      <canvas
        ref={linkLinesRef}
        className="label-link-overlay"
        style={{ display: viewOptions.showLabelLinkLines ? 'block' : 'none' }}
      />
      {!previewMode && !moleculeData && (
        <div className="canvas-placeholder">
          <div className="placeholder-mark" aria-hidden="true">
            <span />
            <span />
            <span />
          </div>
          <p className="placeholder-kicker">Publication-minded molecular viewing</p>
          <h3>Open XYZ or PDB</h3>
          <p>
            Load a structure to inspect bonds, measure distances, angles, and dihedrals,
            then export a clean PNG view.
          </p>
          <button
            type="button"
            className="placeholder-action"
            disabled={isLoading}
            onClick={onOpenFile}
          >
            {isLoading ? 'Loading...' : 'Open File'}
          </button>
          <div className="placeholder-shortcuts">
            <span>Left drag rotate</span>
            <span>Right drag pan</span>
            <span>Scroll zoom</span>
          </div>
        </div>
      )}
      {!previewMode && isLoading && (
        <LoadingSpinner title={loadingLabel} subtitle="Parsing atoms, perceiving bonds, and preparing the 3-D workspace." />
      )}
    </div>
  );
}
