import { useEffect, useRef } from 'react';
import * as THREE from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
import { save } from '@tauri-apps/plugin-dialog';
import { writeFile } from '@tauri-apps/plugin-fs';
import type {
  ElementColorOverrides,
  MoleculeData,
  SelectedAngleMeasurement,
  SelectedBondMeasurement,
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
  onBondSelected: (bond: SelectedBondMeasurement | null) => void;
  onAngleSelected: (angle: SelectedAngleMeasurement | null) => void;
  onError: (msg: string) => void;
}

interface BondSelectionData {
  atom1Element: string;
  atom2Element: string;
  distance: number;
  midpoint: THREE.Vector3;
}

interface SceneCtx {
  renderer:   THREE.WebGLRenderer;
  scene:      THREE.Scene;
  camera:     THREE.PerspectiveCamera;
  controls:   OrbitControls;
  molGroup:   THREE.Group;
  animId:     number;
  sphereGeom: THREE.SphereGeometry;
  cylGeom:    THREE.CylinderGeometry;
  atomMats:   Map<string, THREE.MeshPhongMaterial>;
  bondMat:    THREE.MeshPhongMaterial;
  selectedBondMat: THREE.MeshPhongMaterial;
  raycaster: THREE.Raycaster;
  pointer: THREE.Vector2;
  selectedBondMesh: THREE.Mesh | null;
  selectedBondData: BondSelectionData | null;
  bondMeshes: THREE.Mesh[];
  selectedAtomMat: THREE.MeshPhongMaterial;
  atomMeshes: THREE.Mesh[];
  selectedAtomMeshes: THREE.Mesh[];
  angleSelection: THREE.Mesh[];
  angleLabelPosition: THREE.Vector3 | null;
  angleDegrees: number | null;
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

function updateAngleSelection(
  selection: THREE.Mesh[],
  clickedAtom: THREE.Mesh,
): THREE.Mesh[] {
  if (selection.length >= 3) {
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
  onBondSelected,
  onAngleSelected,
  onError,
}: Props) {
  const containerRef = useRef<HTMLDivElement>(null);
  const ctxRef = useRef<SceneCtx | null>(null);
  const bondLabelRef = useRef<HTMLDivElement>(null);
  const angleLabelRef = useRef<HTMLDivElement>(null);

  // ------------------------------------------------------------------
  // Init Three.js once
  // ------------------------------------------------------------------
  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    const w = container.clientWidth  || 800;
    const h = container.clientHeight || 600;

    // preserveDrawingBuffer is required for toDataURL PNG export
    const renderer = new THREE.WebGLRenderer({ antialias: true, preserveDrawingBuffer: true });
    renderer.setPixelRatio(window.devicePixelRatio);
    renderer.setSize(w, h);
    container.appendChild(renderer.domElement);

    const scene = new THREE.Scene();
    scene.background = new THREE.Color(0xffffff);
    scene.fog = new THREE.Fog(0xffffff, 42, 120);

    const camera = new THREE.PerspectiveCamera(35, w / h, 0.1, 1000);
    camera.position.set(0, 0, 25);

    // Bright, print-oriented lighting tuned toward the CYLview reference.
    scene.add(new THREE.AmbientLight(0xffffff, 0.52));

    const key = new THREE.DirectionalLight(0xffffff, 1.65);
    key.position.set(3.2, 4.4, 6.4);
    scene.add(key);

    const fill = new THREE.DirectionalLight(0xffffff, 0.72);
    fill.position.set(-5.2, 1.4, 3.2);
    scene.add(fill);

    const rim = new THREE.DirectionalLight(0xffffff, 0.24);
    rim.position.set(-1.6, -3.6, -4.8);
    scene.add(rim);

    const topLight = new THREE.DirectionalLight(0xffffff, 0.35);
    topLight.position.set(0, 7, 1.5);
    scene.add(topLight);

    // Controls
    const controls = new OrbitControls(camera, renderer.domElement);
    controls.enableDamping  = true;
    controls.dampingFactor  = 0.08;
    controls.mouseButtons   = {
      LEFT:   THREE.MOUSE.ROTATE,
      MIDDLE: THREE.MOUSE.DOLLY,
      RIGHT:  THREE.MOUSE.PAN,
    };

    const molGroup = new THREE.Group();
    scene.add(molGroup);

    // Shared geometries — 16-segment cylinders for smooth tubes
    const sphereGeom = new THREE.SphereGeometry(1, 20, 16);
    const cylGeom    = new THREE.CylinderGeometry(1, 1, 1, 24);

    // Saturated cyan cylinders with enough gloss to read like polished tubes.
    const bondMat = new THREE.MeshPhongMaterial({
      color:     0x2f9df4,
      shininess: 175,
      specular:  new THREE.Color(0.86, 0.9, 0.96),
    });
    const selectedBondMat = new THREE.MeshPhongMaterial({
      color:     0xffa24c,
      shininess: 190,
      specular:  new THREE.Color(0.98, 0.88, 0.78),
    });
    const selectedAtomMat = new THREE.MeshPhongMaterial({
      color:     0xffbf73,
      shininess: 150,
      specular:  new THREE.Color(0.98, 0.9, 0.78),
    });

    const atomMats = new Map<string, THREE.MeshPhongMaterial>();
    const raycaster = new THREE.Raycaster();
    const pointer = new THREE.Vector2();

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
      renderer.render(scene, camera);
    }
    animate();

    ctxRef.current = {
      renderer, scene, camera, controls, molGroup, animId,
      sphereGeom, cylGeom, atomMats, bondMat, selectedBondMat,
      raycaster, pointer, selectedBondMesh: null, selectedBondData: null, bondMeshes: [],
      selectedAtomMat, atomMeshes: [], selectedAtomMeshes: [], angleSelection: [],
      angleLabelPosition: null, angleDegrees: null,
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

    // R key — reset view
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'r' || e.key === 'R') ctxRef.current?.controls.reset();
    };
    window.addEventListener('keydown', onKey);

    // Toolbar reset button
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
        atomMesh.material = atomMesh.userData.defaultMaterial as THREE.Material;
      }
      current.selectedAtomMeshes = [];
      current.angleSelection = [];
      current.angleLabelPosition = null;
      current.angleDegrees = null;
      onBondSelected(null);
      onAngleSelected(null);
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

      const atomHit = current.raycaster.intersectObjects(current.atomMeshes, false)[0];
      if (atomHit && atomHit.object instanceof THREE.Mesh) {
        if (current.selectedBondMesh) {
          current.selectedBondMesh.material = current.bondMat;
        }
        current.selectedBondMesh = null;
        current.selectedBondData = null;
        onBondSelected(null);

        for (const atomMesh of current.selectedAtomMeshes) {
          atomMesh.material = atomMesh.userData.defaultMaterial as THREE.Material;
        }

        current.angleSelection = updateAngleSelection(current.angleSelection, atomHit.object);
        current.selectedAtomMeshes = [...current.angleSelection];

        for (const atomMesh of current.selectedAtomMeshes) {
          atomMesh.material = current.selectedAtomMat;
        }

        if (current.angleSelection.length === 1) {
          current.angleLabelPosition = null;
          current.angleDegrees = null;
          onAngleSelected({
            atomElements: [atomHit.object.userData.element as string, '', ''],
            angleDegrees: 0,
            stage: 1,
          });
          return;
        }

        if (current.angleSelection.length === 2) {
          current.angleLabelPosition = null;
          current.angleDegrees = null;
          onAngleSelected({
            atomElements: [
              current.angleSelection[0].userData.element as string,
              current.angleSelection[1].userData.element as string,
              '',
            ],
            angleDegrees: 0,
            stage: 2,
          });
          return;
        }

        const [a, b, c] = current.angleSelection;
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
        const angleDegrees = THREE.MathUtils.radToDeg(angleRadians);
        const bisector = baNorm.add(bcNorm);
        const offsetDirection =
          bisector.lengthSq() > 1e-6 ? bisector.normalize() : new THREE.Vector3(0.35, 0.35, 0);

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
        return;
      }

      const hit = current.raycaster.intersectObjects(current.bondMeshes, false)[0];
      if (!hit || !(hit.object instanceof THREE.Mesh)) {
        clearSelection();
        return;
      }

      for (const atomMesh of current.selectedAtomMeshes) {
        atomMesh.material = atomMesh.userData.defaultMaterial as THREE.Material;
      }
      current.selectedAtomMeshes = [];
      current.angleSelection = [];
      current.angleLabelPosition = null;
      current.angleDegrees = null;
      onAngleSelected(null);

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

    return () => {
      ro.disconnect();
      window.removeEventListener('keydown', onKey);
      window.removeEventListener('reset-camera', onReset);
      window.removeEventListener('export-png', onExport);
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
  }, [moleculeData, onAngleSelected, onBondSelected, onError]);

  // ------------------------------------------------------------------
  // Rebuild molecule meshes when data changes
  // ------------------------------------------------------------------
  useEffect(() => {
    const ctx = ctxRef.current;
    if (!ctx) return;

    const {
      molGroup, camera, controls, sphereGeom, cylGeom, atomMats, bondMat,
      selectedBondMat, selectedAtomMat,
    } = ctx;

    // Clear previous meshes (dispose per-atom materials, not the shared bondMat)
    molGroup.traverse(obj => {
      if (
        obj instanceof THREE.Mesh &&
        obj.material !== bondMat &&
        obj.material !== selectedBondMat &&
        obj.material !== selectedAtomMat
      ) {
        (obj.material as THREE.Material).dispose();
      }
    });
    molGroup.clear();
    ctx.bondMeshes = [];
    ctx.atomMeshes = [];
    ctx.selectedBondMesh = null;
    ctx.selectedBondData = null;
    ctx.selectedAtomMeshes = [];
    ctx.angleSelection = [];
    ctx.angleLabelPosition = null;
    ctx.angleDegrees = null;
    onBondSelected(null);
    onAngleSelected(null);

    if (!moleculeData || moleculeData.atoms.length === 0) return;

    const UP = new THREE.Vector3(0, 1, 0);

    // --- Bonds first (atoms rendered on top) ---
    for (const bond of moleculeData.bonds) {
      const a1 = moleculeData.atoms[bond.atom1];
      const a2 = moleculeData.atoms[bond.atom2];
      if (!a1 || !a2) continue;
      if (!showHydrogens && (a1.element === 'H' || a2.element === 'H')) continue;

      const start   = new THREE.Vector3(a1.x, a1.y, a1.z);
      const end     = new THREE.Vector3(a2.x, a2.y, a2.z);
      const dir     = new THREE.Vector3().subVectors(end, start);
      const len     = dir.length();
      if (len < 0.01) continue;

      const dirNorm = dir.clone().normalize();
      const mesh    = new THREE.Mesh(cylGeom, bondMat);
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
          new THREE.Vector3(1, 0, 0),
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
        atomMats.set(atom.element, new THREE.MeshPhongMaterial({
          color:     elementColorOverrides[atom.element] ?? atomColorHex(atom.element),
          shininess: 42,
          specular:  new THREE.Color(0.18, 0.18, 0.18),
        }));
      }
      const mat  = atomMats.get(atom.element)!;
      const r    = atomDisplayRadius(atom.element);
      const mesh = new THREE.Mesh(sphereGeom, mat);
      mesh.position.set(atom.x, atom.y, atom.z);
      mesh.scale.setScalar(r);
      mesh.userData.element = atom.element;
      mesh.userData.defaultMaterial = mat;
      molGroup.add(mesh);
      ctx.atomMeshes.push(mesh);
    }

    // --- Fit camera ---
    const box    = new THREE.Box3().setFromObject(molGroup);
    const size   = box.getSize(new THREE.Vector3());
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

  }, [moleculeData, showHydrogens, elementColorOverrides, onBondSelected, onAngleSelected]);

  return (
    <div ref={containerRef} className="molecule-canvas">
      <div ref={bondLabelRef} className="bond-distance-label" />
      <div ref={angleLabelRef} className="angle-measure-label" />
      {!moleculeData && (
        <div className="canvas-placeholder">
          <h3>CYLview-NG</h3>
          <p>Open a molecular file to begin</p>
        </div>
      )}
    </div>
  );
}
