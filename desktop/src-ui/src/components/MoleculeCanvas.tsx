import { useEffect, useRef } from 'react';
import * as THREE from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
import type { MoleculeData } from '../App';

// ---------------------------------------------------------------------------
// Visual style — matches CYLview reference image
// ---------------------------------------------------------------------------

// Atom colours: O = orange, H/C = grays, rest = CPK
const ATOM_COLORS: Record<string, number> = {
  H:  0xCCCCCC,  // light gray
  C:  0x999999,  // medium gray  (tiny spheres, barely visible)
  N:  0x4466FF,
  O:  0xE05500,  // orange (matches reference)
  F:  0x33CC55,
  P:  0xFF8800,
  S:  0xDDAA00,
  Cl: 0x22BB44,
  Br: 0xAA2200,
  I:  0x770088,
};

// Very small atom spheres — bonds are the dominant visual element
const ATOM_DISPLAY_RADIUS: Record<string, number> = {
  H:  0.10,
  C:  0.10,
  N:  0.13,
  O:  0.16,  // slightly larger so the orange reads clearly
  F:  0.12,
  P:  0.16,
  S:  0.16,
  Cl: 0.15,
  Br: 0.18,
  I:  0.20,
};

function atomColor(element: string): number {
  return ATOM_COLORS[element] ?? 0x888888;
}

function atomDisplayRadius(element: string): number {
  return ATOM_DISPLAY_RADIUS[element] ?? 0.12;
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

interface Props {
  moleculeData: MoleculeData | null;
  onError: (msg: string) => void;
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
}

export function MoleculeCanvas({ moleculeData, onError: _onError }: Props) {
  const containerRef = useRef<HTMLDivElement>(null);
  const ctxRef       = useRef<SceneCtx | null>(null);

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
    scene.background = new THREE.Color(0xffffff); // white — matches CYLview

    const camera = new THREE.PerspectiveCamera(35, w / h, 0.1, 1000);
    camera.position.set(0, 0, 25);

    // Lighting: strong key from upper-front, soft fill, dim back-rim
    scene.add(new THREE.AmbientLight(0xffffff, 0.18));

    const key = new THREE.DirectionalLight(0xffffff, 1.0);
    key.position.set(1.5, 2.5, 4);
    scene.add(key);

    const fill = new THREE.DirectionalLight(0xffffff, 0.30);
    fill.position.set(-3, 0.5, -1);
    scene.add(fill);

    const rim = new THREE.DirectionalLight(0xffffff, 0.12);
    rim.position.set(0, -3, -2);
    scene.add(rim);

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
    const cylGeom    = new THREE.CylinderGeometry(1, 1, 1, 16);

    // Bond material: CYLview cyan, very glossy
    const bondMat = new THREE.MeshPhongMaterial({
      color:     0x29ABE2,              // CYLview cyan
      shininess: 200,
      specular:  new THREE.Color(0.85, 0.85, 0.90),
    });

    const atomMats = new Map<string, THREE.MeshPhongMaterial>();

    // Render loop
    let animId = 0;
    function animate() {
      animId = requestAnimationFrame(animate);
      controls.update();
      renderer.render(scene, camera);
    }
    animate();

    ctxRef.current = {
      renderer, scene, camera, controls, molGroup, animId,
      sphereGeom, cylGeom, atomMats, bondMat,
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

    // PNG export
    const onExport = () => {
      const ctx = ctxRef.current;
      if (!ctx) return;
      ctx.renderer.render(ctx.scene, ctx.camera); // ensure latest frame
      const link = document.createElement('a');
      link.download = 'molecule.png';
      link.href = ctx.renderer.domElement.toDataURL('image/png');
      link.click();
    };
    window.addEventListener('export-png', onExport);

    return () => {
      ro.disconnect();
      window.removeEventListener('keydown', onKey);
      window.removeEventListener('reset-camera', onReset);
      window.removeEventListener('export-png', onExport);
      cancelAnimationFrame(animId);
      sphereGeom.dispose();
      cylGeom.dispose();
      bondMat.dispose();
      atomMats.forEach(m => m.dispose());
      renderer.dispose();
      container.removeChild(renderer.domElement);
      ctxRef.current = null;
    };
  }, []);

  // ------------------------------------------------------------------
  // Rebuild molecule meshes when data changes
  // ------------------------------------------------------------------
  useEffect(() => {
    const ctx = ctxRef.current;
    if (!ctx) return;

    const { molGroup, camera, controls, sphereGeom, cylGeom, atomMats, bondMat } = ctx;

    // Clear previous meshes (dispose per-atom materials, not the shared bondMat)
    molGroup.traverse(obj => {
      if (obj instanceof THREE.Mesh && obj.material !== bondMat) {
        (obj.material as THREE.Material).dispose();
      }
    });
    molGroup.clear();

    if (!moleculeData || moleculeData.atoms.length === 0) return;

    const UP = new THREE.Vector3(0, 1, 0);

    // --- Bonds first (atoms rendered on top) ---
    for (const bond of moleculeData.bonds) {
      const a1 = moleculeData.atoms[bond.atom1];
      const a2 = moleculeData.atoms[bond.atom2];
      if (!a1 || !a2) continue;

      const start   = new THREE.Vector3(a1.x, a1.y, a1.z);
      const end     = new THREE.Vector3(a2.x, a2.y, a2.z);
      const dir     = new THREE.Vector3().subVectors(end, start);
      const len     = dir.length();
      if (len < 0.01) continue;

      const dirNorm = dir.clone().normalize();
      const mesh    = new THREE.Mesh(cylGeom, bondMat);
      mesh.position.addVectors(start, end).multiplyScalar(0.5);
      mesh.scale.set(bond.radius, len, bond.radius);

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
    }

    // --- Atoms on top ---
    for (const atom of moleculeData.atoms) {
      if (!atomMats.has(atom.element)) {
        atomMats.set(atom.element, new THREE.MeshPhongMaterial({
          color:     atomColor(atom.element),
          shininess: 60,
          specular:  new THREE.Color(0.3, 0.3, 0.3),
        }));
      }
      const mat  = atomMats.get(atom.element)!;
      const r    = atomDisplayRadius(atom.element);
      const mesh = new THREE.Mesh(sphereGeom, mat);
      mesh.position.set(atom.x, atom.y, atom.z);
      mesh.scale.setScalar(r);
      molGroup.add(mesh);
    }

    // --- Fit camera ---
    const box    = new THREE.Box3().setFromObject(molGroup);
    const size   = box.getSize(new THREE.Vector3());
    const maxDim = Math.max(size.x, size.y, size.z);
    const fovRad = camera.fov * (Math.PI / 180);
    const dist   = (maxDim / 2 / Math.tan(fovRad / 2)) * 1.6;

    camera.near = dist / 100;
    camera.far  = dist * 100;
    camera.updateProjectionMatrix();
    camera.position.set(0, 0, dist);
    controls.target.set(0, 0, 0);
    controls.update();
    controls.saveState();

  }, [moleculeData]);

  return (
    <div ref={containerRef} className="molecule-canvas">
      {!moleculeData && (
        <div className="canvas-placeholder">
          <h3>CYLview-NG</h3>
          <p>Open a molecular file to begin</p>
        </div>
      )}
    </div>
  );
}
