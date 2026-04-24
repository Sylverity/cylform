import { useEffect, useRef } from 'react';
import {
  AmbientLight,
  Box3,
  Color,
  CylinderGeometry,
  DirectionalLight,
  Fog,
  Group,
  Material,
  MathUtils,
  Mesh,
  MeshPhongMaterial,
  MOUSE,
  PerspectiveCamera,
  Raycaster,
  Scene,
  SphereGeometry,
  Vector2,
  Vector3,
  WebGLRenderer,
} from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
import { save } from '@tauri-apps/plugin-dialog';
import { writeFile } from '@tauri-apps/plugin-fs';
import type {
  ElementColorOverrides,
  MoleculeData,
  SelectionMode,
  SelectionSummary,
  SelectedAngleMeasurement,
  SelectedBondMeasurement,
  SelectedDihedralMeasurement,
} from '../App';

// ---------------------------------------------------------------------------
// Visual style — matches CYLview reference image
// ---------------------------------------------------------------------------

// Atom colours: keep the palette restrained so the cylindrical bonds dominate.
const ATOM_COLORS: Record<string, number> = {
  H:  0xcfd3d7,
  C:  0x8d949c,
  N:  0x4b84d8,
  O:  0xea6a1a,
  F:  0x33CC55,
  P:  0xFF8800,
  S:  0xDDAA00,
  Cl: 0x22BB44,
  Br: 0xAA2200,
  I:  0x770088,
};

// Keep spheres understated so the render reads as a CYLview-style tube drawing.
const ATOM_DISPLAY_RADIUS: Record<string, number> = {
  H:  0.075,
  C:  0.078,
  N:  0.095,
  O:  0.118,
  F:  0.09,
  P:  0.118,
  S:  0.118,
  Cl: 0.108,
  Br: 0.13,
  I:  0.145,
};

function atomColor(element: string): number {
  return ATOM_COLORS[element] ?? 0x888888;
}

function atomColorHex(element: string): string {
  return `#${atomColor(element).toString(16).padStart(6, '0')}`;
}

function atomDisplayRadius(element: string): number {
  return ATOM_DISPLAY_RADIUS[element] ?? 0.12;
}

function dataUrlToBytes(dataUrl: string): Uint8Array {
  const base64 = dataUrl.split(',')[1] ?? '';
  const binary = atob(base64);
  const bytes = new Uint8Array(binary.length);

  for (let i = 0; i < binary.length; i += 1) {
    bytes[i] = binary.charCodeAt(i);
  }

  return bytes;
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

interface Props {
  moleculeData: MoleculeData | null;
  showHydrogens: boolean;
  elementColorOverrides: ElementColorOverrides;
  atomSizeScale: number;
  selectedBond: SelectedBondMeasurement | null;
  selectedAngle: SelectedAngleMeasurement | null;
  selectedDihedral: SelectedDihedralMeasurement | null;
  selectionMode: SelectionMode;
  onBondSelected: (bond: SelectedBondMeasurement | null) => void;
  onAngleSelected: (angle: SelectedAngleMeasurement | null) => void;
  onDihedralSelected: (dihedral: SelectedDihedralMeasurement | null) => void;
  onSelectionSummaryChange: (summary: SelectionSummary) => void;
  isLoading: boolean;
  loadingLabel: string;
  onOpenFile: () => void;
  onError: (msg: string) => void;
}

interface BondSelectionData {
  atom1Element: string;
  atom2Element: string;
  distance: number;
  midpoint: Vector3;
}

interface SceneCtx {
  renderer:   WebGLRenderer;
  scene:      Scene;
  camera:     PerspectiveCamera;
  controls:   OrbitControls;
  molGroup:   Group;
  animId:     number;
  sphereGeom: SphereGeometry;
  cylGeom:    CylinderGeometry;
  atomMats:   Map<string, MeshPhongMaterial>;
  bondMat:    MeshPhongMaterial;
  selectedBondMat: MeshPhongMaterial;
  raycaster: Raycaster;
  pointer: Vector2;
  selectedBondMesh: Mesh | null;
  selectedBondData: BondSelectionData | null;
  bondMeshes: Mesh[];
  selectedAtomMat: MeshPhongMaterial;
  atomMeshes: Mesh[];
  selectedAtomMeshes: Mesh[];
  modeSelectedAtomMeshes: Mesh[];
  modeSelectedBondMeshes: Mesh[];
  angleSelection: Mesh[];
  angleLabelPosition: Vector3 | null;
  angleDegrees: number | null;
  dihedralLabelPosition: Vector3 | null;
  dihedralDegrees: number | null;
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

function updateAngleSelection(
  selection: Mesh[],
  clickedAtom: Mesh,
): Mesh[] {
  if (selection.length >= 4) {
    return [clickedAtom];
  }

  if (selection.length === 0) {
    return [clickedAtom];
  }

  if (selection[selection.length - 1] === clickedAtom) {
    return selection;
  }

  return [...selection, clickedAtom];
}

export function MoleculeCanvas({
  moleculeData,
  showHydrogens,
  elementColorOverrides,
  atomSizeScale,
  selectedBond,
  selectedAngle,
  selectedDihedral,
  selectionMode,
  onBondSelected,
  onAngleSelected,
  onDihedralSelected,
  onSelectionSummaryChange,
  isLoading,
  loadingLabel,
  onOpenFile,
  onError,
}: Props) {
  const containerRef = useRef<HTMLDivElement>(null);
  const ctxRef = useRef<SceneCtx | null>(null);
  const bondLabelRef = useRef<HTMLDivElement>(null);
  const angleLabelRef = useRef<HTMLDivElement>(null);
  const dihedralLabelRef = useRef<HTMLDivElement>(null);
  const selectionModeRef = useRef<SelectionMode>(selectionMode);
  const previousMoleculeDataRef = useRef<MoleculeData | null>(null);

  useEffect(() => {
    selectionModeRef.current = selectionMode;
  }, [selectionMode]);

  // ------------------------------------------------------------------
  // Init Three.js once
  // ------------------------------------------------------------------
  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    const w = container.clientWidth  || 800;
    const h = container.clientHeight || 600;

    // preserveDrawingBuffer is required for toDataURL PNG export
    const renderer = new WebGLRenderer({ antialias: true, preserveDrawingBuffer: true });
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    renderer.setSize(w, h);
    container.appendChild(renderer.domElement);

    const scene = new Scene();
    scene.background = new Color(0xffffff);
    scene.fog = new Fog(0xffffff, 42, 120);

    const camera = new PerspectiveCamera(35, w / h, 0.1, 1000);
    camera.position.set(0, 0, 25);

    // Bright, print-oriented lighting tuned toward the CYLview reference.
    scene.add(new AmbientLight(0xffffff, 0.52));

    const key = new DirectionalLight(0xffffff, 1.65);
    key.position.set(3.2, 4.4, 6.4);
    scene.add(key);

    const fill = new DirectionalLight(0xffffff, 0.72);
    fill.position.set(-5.2, 1.4, 3.2);
    scene.add(fill);

    const rim = new DirectionalLight(0xffffff, 0.24);
    rim.position.set(-1.6, -3.6, -4.8);
    scene.add(rim);

    const topLight = new DirectionalLight(0xffffff, 0.35);
    topLight.position.set(0, 7, 1.5);
    scene.add(topLight);

    // Controls
    const controls = new OrbitControls(camera, renderer.domElement);
    controls.enableDamping  = true;
    controls.dampingFactor  = 0.08;
    controls.mouseButtons   = {
      LEFT:   MOUSE.ROTATE,
      MIDDLE: MOUSE.DOLLY,
      RIGHT:  MOUSE.PAN,
    };

    const molGroup = new Group();
    scene.add(molGroup);

    // Shared geometries — 16-segment cylinders for smooth tubes
    const sphereGeom = new SphereGeometry(1, 20, 16);
    const cylGeom    = new CylinderGeometry(1, 1, 1, 24);

    // Saturated cyan cylinders with enough gloss to read like polished tubes.
    const bondMat = new MeshPhongMaterial({
      color:     0x2f9df4,
      shininess: 175,
      specular:  new Color(0.86, 0.9, 0.96),
    });
    const selectedBondMat = new MeshPhongMaterial({
      color:     0xffa24c,
      shininess: 190,
      specular:  new Color(0.98, 0.88, 0.78),
    });
    const selectedAtomMat = new MeshPhongMaterial({
      color:     0xffbf73,
      shininess: 150,
      specular:  new Color(0.98, 0.9, 0.78),
    });

    const atomMats = new Map<string, MeshPhongMaterial>();
    const raycaster = new Raycaster();
    const pointer = new Vector2();

    // Render loop
    let animId = 0;
    function animate() {
      animId = requestAnimationFrame(animate);
      controls.update();
      const bondLabel = bondLabelRef.current;
      const selectedBond = ctxRef.current?.selectedBondData;
      if (bondLabel && selectedBond) {
        const projected = selectedBond.midpoint.clone().project(camera);
        const x = ((projected.x + 1) / 2) * renderer.domElement.clientWidth;
        const y = ((-projected.y + 1) / 2) * renderer.domElement.clientHeight;
        const visible = projected.z >= -1 && projected.z <= 1;

        bondLabel.style.display = visible ? 'block' : 'none';
        bondLabel.style.transform = `translate(-50%, -50%) translate(${x}px, ${y}px)`;
        bondLabel.textContent = `${selectedBond.distance.toFixed(2)} A`;
      } else if (bondLabel) {
        bondLabel.style.display = 'none';
      }

      const angleLabel = angleLabelRef.current;
      const anglePosition = ctxRef.current?.angleLabelPosition;
      const angleDegrees = ctxRef.current?.angleDegrees;
      if (angleLabel && anglePosition && typeof angleDegrees === 'number') {
        const projected = anglePosition.clone().project(camera);
        const x = ((projected.x + 1) / 2) * renderer.domElement.clientWidth;
        const y = ((-projected.y + 1) / 2) * renderer.domElement.clientHeight;
        const visible = projected.z >= -1 && projected.z <= 1;

        angleLabel.style.display = visible ? 'block' : 'none';
        angleLabel.style.transform = `translate(-50%, -50%) translate(${x}px, ${y}px)`;
        angleLabel.textContent = `${angleDegrees.toFixed(2)} deg`;
      } else if (angleLabel) {
        angleLabel.style.display = 'none';
      }

      const dihedralLabel = dihedralLabelRef.current;
      const dihedralPosition = ctxRef.current?.dihedralLabelPosition;
      const dihedralDegrees = ctxRef.current?.dihedralDegrees;
      if (dihedralLabel && dihedralPosition && typeof dihedralDegrees === 'number') {
        const projected = dihedralPosition.clone().project(camera);
        const x = ((projected.x + 1) / 2) * renderer.domElement.clientWidth;
        const y = ((-projected.y + 1) / 2) * renderer.domElement.clientHeight;
        const visible = projected.z >= -1 && projected.z <= 1;

        dihedralLabel.style.display = visible ? 'block' : 'none';
        dihedralLabel.style.transform = `translate(-50%, -50%) translate(${x}px, ${y}px)`;
        dihedralLabel.textContent = `${dihedralDegrees.toFixed(2)} deg`;
      } else if (dihedralLabel) {
        dihedralLabel.style.display = 'none';
      }
      renderer.render(scene, camera);
    }
    animate();

    ctxRef.current = {
      renderer, scene, camera, controls, molGroup, animId,
      sphereGeom, cylGeom, atomMats, bondMat, selectedBondMat,
      raycaster, pointer, selectedBondMesh: null, selectedBondData: null, bondMeshes: [],
      selectedAtomMat, atomMeshes: [], selectedAtomMeshes: [], modeSelectedAtomMeshes: [],
      modeSelectedBondMeshes: [], angleSelection: [],
      angleLabelPosition: null, angleDegrees: null, dihedralLabelPosition: null,
      dihedralDegrees: null,
    };

    // Resize
    const ro = new ResizeObserver(() => {
      const cw = container.clientWidth;
      const ch = container.clientHeight;
      renderer.setSize(cw, ch);
      camera.aspect = cw / ch;
      camera.updateProjectionMatrix();
    });
    ro.observe(container);

    // Toolbar button and global keyboard shortcut
    const onReset = () => ctxRef.current?.controls.reset();
    window.addEventListener('reset-camera', onReset);

    let pointerDown = { x: 0, y: 0 };
    const onPointerDown = (event: PointerEvent) => {
      pointerDown = { x: event.clientX, y: event.clientY };
    };

    const clearSelection = () => {
      const current = ctxRef.current;
      if (!current) return;
      if (current.selectedBondMesh) {
        current.selectedBondMesh.material = current.bondMat;
      }
      current.selectedBondMesh = null;
      current.selectedBondData = null;
      for (const atomMesh of current.selectedAtomMeshes) {
        atomMesh.material = atomMesh.userData.defaultMaterial as Material;
      }
      for (const atomMesh of current.modeSelectedAtomMeshes) {
        atomMesh.material = atomMesh.userData.defaultMaterial as Material;
      }
      for (const bondMesh of current.modeSelectedBondMeshes) {
        bondMesh.material = current.bondMat;
      }
      current.selectedAtomMeshes = [];
      current.modeSelectedAtomMeshes = [];
      current.modeSelectedBondMeshes = [];
      current.angleSelection = [];
      current.angleLabelPosition = null;
      current.angleDegrees = null;
      current.dihedralLabelPosition = null;
      current.dihedralDegrees = null;
      onBondSelected(null);
      onAngleSelected(null);
      onDihedralSelected(null);
      onSelectionSummaryChange({ atomCount: 0, bondCount: 0 });
    };

    const clearMeasurementSelection = () => {
      const current = ctxRef.current;
      if (!current) return;
      if (current.selectedBondMesh) {
        current.selectedBondMesh.material = current.bondMat;
      }
      current.selectedBondMesh = null;
      current.selectedBondData = null;
      for (const atomMesh of current.selectedAtomMeshes) {
        atomMesh.material = atomMesh.userData.defaultMaterial as Material;
      }
      current.selectedAtomMeshes = [];
      current.angleSelection = [];
      current.angleLabelPosition = null;
      current.angleDegrees = null;
      current.dihedralLabelPosition = null;
      current.dihedralDegrees = null;
      onBondSelected(null);
      onAngleSelected(null);
      onDihedralSelected(null);
    };

    const publishModeSelectionSummary = (current: SceneCtx) => {
      onSelectionSummaryChange({
        atomCount: current.modeSelectedAtomMeshes.length,
        bondCount: current.modeSelectedBondMeshes.length,
      });
    };

    const toggleModeAtom = (atomMesh: Mesh) => {
      const current = ctxRef.current;
      if (!current) return;
      const index = current.modeSelectedAtomMeshes.indexOf(atomMesh);
      if (index >= 0) {
        atomMesh.material = atomMesh.userData.defaultMaterial as Material;
        current.modeSelectedAtomMeshes.splice(index, 1);
      } else {
        atomMesh.material = current.selectedAtomMat;
        current.modeSelectedAtomMeshes.push(atomMesh);
      }
      publishModeSelectionSummary(current);
    };

    const toggleModeBond = (bondMesh: Mesh) => {
      const current = ctxRef.current;
      if (!current) return;
      const index = current.modeSelectedBondMeshes.indexOf(bondMesh);
      if (index >= 0) {
        bondMesh.material = current.bondMat;
        current.modeSelectedBondMeshes.splice(index, 1);
      } else {
        bondMesh.material = current.selectedBondMat;
        current.modeSelectedBondMeshes.push(bondMesh);
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

      if (activeMode === 'view' || activeMode === 'label') {
        return;
      }

      const atomHit = current.raycaster.intersectObjects(current.atomMeshes, false)[0];
      const bondHit = current.raycaster.intersectObjects(current.bondMeshes, false)[0];

      if (activeMode === 'atom' || activeMode === 'bond' || activeMode === 'atom-bond') {
        clearMeasurementSelection();
        if (
          (activeMode === 'atom' || activeMode === 'atom-bond') &&
          atomHit &&
          atomHit.object instanceof Mesh
        ) {
          toggleModeAtom(atomHit.object);
          return;
        }

        if (
          (activeMode === 'bond' || activeMode === 'atom-bond') &&
          bondHit &&
          bondHit.object instanceof Mesh
        ) {
          toggleModeBond(bondHit.object);
        }
        return;
      }

      if (atomHit && atomHit.object instanceof Mesh) {
        if (current.selectedBondMesh) {
          current.selectedBondMesh.material = current.bondMat;
        }
        current.selectedBondMesh = null;
        current.selectedBondData = null;
        onBondSelected(null);

        for (const atomMesh of current.selectedAtomMeshes) {
          atomMesh.material = atomMesh.userData.defaultMaterial as Material;
        }

        current.angleSelection = updateAngleSelection(current.angleSelection, atomHit.object);
        current.selectedAtomMeshes = [...current.angleSelection];

        for (const atomMesh of current.selectedAtomMeshes) {
          atomMesh.material = current.selectedAtomMat;
        }

        if (current.angleSelection.length === 1) {
          current.angleLabelPosition = null;
          current.angleDegrees = null;
          current.dihedralLabelPosition = null;
          current.dihedralDegrees = null;
          onAngleSelected({
            atomElements: [atomHit.object.userData.element as string, '', ''],
            angleDegrees: 0,
            stage: 1,
          });
          onDihedralSelected({
            atomElements: [atomHit.object.userData.element as string, '', '', ''],
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
              current.angleSelection[0].userData.element as string,
              current.angleSelection[1].userData.element as string,
              '',
            ],
            angleDegrees: 0,
            stage: 2,
          });
          onDihedralSelected({
            atomElements: [
              current.angleSelection[0].userData.element as string,
              current.angleSelection[1].userData.element as string,
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
        onAngleSelected({
          atomElements: [
            a.userData.element as string,
            b.userData.element as string,
            c.userData.element as string,
          ],
          angleDegrees,
          stage: 3,
        });

        if (current.angleSelection.length === 3) {
          current.dihedralLabelPosition = null;
          current.dihedralDegrees = null;
          onDihedralSelected({
            atomElements: [
              a.userData.element as string,
              b.userData.element as string,
              c.userData.element as string,
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
        onDihedralSelected({
          atomElements: [
            a.userData.element as string,
            b.userData.element as string,
            c.userData.element as string,
            d.userData.element as string,
          ],
          dihedralDegrees,
          stage: 4,
        });
        return;
      }

      const hit = bondHit;
      if (!hit || !(hit.object instanceof Mesh)) {
        clearSelection();
        return;
      }

      for (const atomMesh of current.selectedAtomMeshes) {
        atomMesh.material = atomMesh.userData.defaultMaterial as Material;
      }
      current.selectedAtomMeshes = [];
      current.angleSelection = [];
      current.angleLabelPosition = null;
      current.angleDegrees = null;
      current.dihedralLabelPosition = null;
      current.dihedralDegrees = null;
      onAngleSelected(null);
      onDihedralSelected(null);

      if (current.selectedBondMesh && current.selectedBondMesh !== hit.object) {
        current.selectedBondMesh.material = current.bondMat;
      }

      current.selectedBondMesh = hit.object;
      current.selectedBondMesh.material = current.selectedBondMat;

      const bond = hit.object.userData.bond as BondSelectionData | undefined;
      if (!bond) {
        clearSelection();
        return;
      }

      current.selectedBondData = bond;
      onBondSelected({
        atom1Element: bond.atom1Element,
        atom2Element: bond.atom2Element,
        distance: bond.distance,
      });
    };

    renderer.domElement.addEventListener('pointerdown', onPointerDown);
    renderer.domElement.addEventListener('pointerup', onPointerUp);

    // PNG export
    const onExport = async () => {
      const ctx = ctxRef.current;
      if (!ctx) return;
      if (!moleculeData) {
        onError('Load a molecule before exporting a PNG.');
        return;
      }

      try {
        const defaultName = `${moleculeData.name || 'molecule'}.png`
          .replace(/[<>:"/\\|?*\u0000-\u001f]/g, '_')
          .replace(/\s+/g, '_');

        const targetPath = await save({
          title: 'Export Current View as PNG',
          defaultPath: defaultName,
          filters: [{ name: 'PNG Image', extensions: ['png'] }],
        });

        if (!targetPath) return;

        ctx.renderer.render(ctx.scene, ctx.camera);
        const pngBytes = dataUrlToBytes(ctx.renderer.domElement.toDataURL('image/png'));
        await writeFile(targetPath, pngBytes);
      } catch (error) {
        onError(error instanceof Error ? error.message : String(error));
      }
    };
    window.addEventListener('export-png', onExport);

    const onClearSelection = () => clearSelection();
    window.addEventListener('clear-selection', onClearSelection);

    return () => {
      ro.disconnect();
      window.removeEventListener('reset-camera', onReset);
      window.removeEventListener('export-png', onExport);
      window.removeEventListener('clear-selection', onClearSelection);
      renderer.domElement.removeEventListener('pointerdown', onPointerDown);
      renderer.domElement.removeEventListener('pointerup', onPointerUp);
      cancelAnimationFrame(animId);
      sphereGeom.dispose();
      cylGeom.dispose();
      bondMat.dispose();
      selectedBondMat.dispose();
      selectedAtomMat.dispose();
      atomMats.forEach(m => m.dispose());
      renderer.dispose();
      container.removeChild(renderer.domElement);
      ctxRef.current = null;
    };
  }, [
    moleculeData,
    onAngleSelected,
    onBondSelected,
    onDihedralSelected,
    onError,
    onSelectionSummaryChange,
  ]);

  // ------------------------------------------------------------------
  // Rebuild molecule meshes when topology or visibility changes.
  // ------------------------------------------------------------------
  useEffect(() => {
    const ctx = ctxRef.current;
    if (!ctx) return;

    const {
      molGroup, camera, controls, sphereGeom, cylGeom, atomMats, bondMat,
      selectedBondMat, selectedAtomMat,
    } = ctx;
    const shouldFitCamera = moleculeData !== previousMoleculeDataRef.current;

    // Clear previous meshes while keeping shared element materials alive.
    const sharedAtomMaterials = new Set(atomMats.values());
    molGroup.traverse(obj => {
      if (
        obj instanceof Mesh &&
        obj.material !== bondMat &&
        obj.material !== selectedBondMat &&
        obj.material !== selectedAtomMat &&
        !sharedAtomMaterials.has(obj.material as MeshPhongMaterial)
      ) {
        (obj.material as Material).dispose();
      }
    });
    molGroup.clear();
    ctx.bondMeshes = [];
    ctx.atomMeshes = [];
    ctx.selectedBondMesh = null;
    ctx.selectedBondData = null;
    ctx.selectedAtomMeshes = [];
    ctx.modeSelectedAtomMeshes = [];
    ctx.modeSelectedBondMeshes = [];
    ctx.angleSelection = [];
    ctx.angleLabelPosition = null;
    ctx.angleDegrees = null;
    ctx.dihedralLabelPosition = null;
    ctx.dihedralDegrees = null;
    onBondSelected(null);
    onAngleSelected(null);
    onDihedralSelected(null);
    onSelectionSummaryChange({ atomCount: 0, bondCount: 0 });

    if (!moleculeData || moleculeData.atoms.length === 0) {
      previousMoleculeDataRef.current = moleculeData;
      return;
    }

    const UP = new Vector3(0, 1, 0);

    // --- Bonds first (atoms rendered on top) ---
    for (const bond of moleculeData.bonds) {
      const a1 = moleculeData.atoms[bond.atom1];
      const a2 = moleculeData.atoms[bond.atom2];
      if (!a1 || !a2) continue;
      if (!showHydrogens && (a1.element === 'H' || a2.element === 'H')) continue;

      const start   = new Vector3(a1.x, a1.y, a1.z);
      const end     = new Vector3(a2.x, a2.y, a2.z);
      const dir     = new Vector3().subVectors(end, start);
      const len     = dir.length();
      if (len < 0.01) continue;

      const dirNorm = dir.clone().normalize();
      const mesh    = new Mesh(cylGeom, bondMat);
      mesh.position.addVectors(start, end).multiplyScalar(0.5);
      const displayRadius = Math.max(0.055, bond.radius * 0.82);
      mesh.scale.set(displayRadius, len, displayRadius);
      mesh.userData.bond = {
        atom1Element: a1.element,
        atom2Element: a2.element,
        distance: len,
        midpoint: mesh.position.clone(),
      } satisfies BondSelectionData;

      if (Math.abs(dirNorm.dot(UP)) > 0.9999) {
        // Bond nearly parallel to Y — rotate 180° around X to point the right way
        mesh.quaternion.setFromAxisAngle(
          new Vector3(1, 0, 0),
          dirNorm.y < 0 ? Math.PI : 0,
        );
      } else {
        mesh.quaternion.setFromUnitVectors(UP, dirNorm);
      }

      molGroup.add(mesh);
      ctx.bondMeshes.push(mesh);
    }

    // --- Atoms on top ---
    for (const atom of moleculeData.atoms) {
      if (!showHydrogens && atom.element === 'H') continue;

      if (!atomMats.has(atom.element)) {
        atomMats.set(atom.element, new MeshPhongMaterial({
          color:     atomColorHex(atom.element),
          shininess: 42,
          specular:  new Color(0.18, 0.18, 0.18),
        }));
      }
      const mat  = atomMats.get(atom.element)!;
      const r    = atomDisplayRadius(atom.element);
      const mesh = new Mesh(sphereGeom, mat);
      mesh.position.set(atom.x, atom.y, atom.z);
      mesh.scale.setScalar(r);
      mesh.userData.element = atom.element;
      mesh.userData.baseRadius = r;
      mesh.userData.defaultMaterial = mat;
      molGroup.add(mesh);
      ctx.atomMeshes.push(mesh);
    }

    // --- Fit camera ---
    if (shouldFitCamera) {
      const box    = new Box3().setFromObject(molGroup);
      const size   = box.getSize(new Vector3());
      const maxDim = Math.max(size.x, size.y, size.z);
      const fovRad = camera.fov * (Math.PI / 180);
      const dist   = (maxDim / 2 / Math.tan(fovRad / 2)) * 1.9;

      camera.near = dist / 100;
      camera.far  = dist * 100;
      camera.updateProjectionMatrix();
      camera.position.set(0.15, 0.1, dist);
      controls.target.set(0, 0, 0);
      controls.update();
      controls.saveState();
    }

    previousMoleculeDataRef.current = moleculeData;

  }, [
    moleculeData,
    showHydrogens,
    onBondSelected,
    onAngleSelected,
    onDihedralSelected,
    onSelectionSummaryChange,
  ]);

  // Update atom colours without rebuilding meshes or touching the camera.
  useEffect(() => {
    const ctx = ctxRef.current;
    if (!ctx) return;

    for (const [element, material] of ctx.atomMats.entries()) {
      material.color.set(elementColorOverrides[element] ?? atomColorHex(element));
    }
  }, [elementColorOverrides, moleculeData, showHydrogens]);

  // Update atom scale without rebuilding meshes or touching the camera.
  useEffect(() => {
    const ctx = ctxRef.current;
    if (!ctx) return;

    for (const atomMesh of ctx.atomMeshes) {
      const baseRadius = typeof atomMesh.userData.baseRadius === 'number'
        ? atomMesh.userData.baseRadius
        : atomDisplayRadius(String(atomMesh.userData.element ?? ''));
      atomMesh.scale.setScalar(baseRadius * atomSizeScale);
    }
  }, [atomSizeScale, moleculeData, showHydrogens]);

  const measureHelpText = selectedDihedral?.stage === 1
    ? 'Select atom 2'
    : selectedDihedral?.stage === 2
      ? 'Select atom 3'
      : selectedDihedral?.stage === 3
        ? 'Select atom 4'
        : selectedDihedral?.stage === 4
          ? `Dihedral ${selectedDihedral.dihedralDegrees.toFixed(2)} deg`
          : selectedAngle
        ? `Angle ${selectedAngle.angleDegrees.toFixed(2)} deg`
        : selectedBond
          ? `Distance ${selectedBond.distance.toFixed(2)} A`
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
              ? 'Label mode is planned for a later v1 milestone'
              : measureHelpText;

  return (
    <div ref={containerRef} className="molecule-canvas">
      <div className="canvas-help-strip">{helpText}</div>
      <div ref={bondLabelRef} className="bond-distance-label" />
      <div ref={angleLabelRef} className="angle-measure-label" />
      <div ref={dihedralLabelRef} className="dihedral-measure-label" />
      {!moleculeData && (
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
      {isLoading && (
        <div className="loading-overlay" role="status" aria-live="polite">
          <div className="loading-card">
            <div className="loading-orbit" aria-hidden="true">
              <span />
              <span />
              <span />
            </div>
            <p className="loading-kicker">CYLview-NG</p>
            <h3>{loadingLabel}</h3>
            <p>Parsing atoms, perceiving bonds, and preparing the 3-D workspace.</p>
          </div>
        </div>
      )}
    </div>
  );
}
