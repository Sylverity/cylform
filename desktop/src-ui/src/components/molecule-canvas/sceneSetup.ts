import {
  AmbientLight,
  Color,
  CylinderGeometry,
  DirectionalLight,
  DoubleSide,
  GridHelper,
  Group,
  Mesh,
  MeshBasicMaterial,
  MeshPhongMaterial,
  MOUSE,
  OrthographicCamera,
  PerspectiveCamera,
  PlaneGeometry,
  Raycaster,
  Scene,
  SphereGeometry,
  Vector2,
  WebGLRenderer,
} from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
import { BokehPass } from 'three/examples/jsm/postprocessing/BokehPass.js';
import { EffectComposer } from 'three/examples/jsm/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/examples/jsm/postprocessing/RenderPass.js';
import { MATERIAL_PRESETS } from './materialPresets';
import type { SceneCtx } from './types';
import type { RenderProfileId, ViewOptions } from '../../types';

export type MouseMode = 'standard' | 'one-button';

export function orbitMouseButtons(mouseMode: MouseMode) {
  return mouseMode === 'one-button'
    ? {
        LEFT: MOUSE.ROTATE,
        MIDDLE: MOUSE.PAN,
        RIGHT: MOUSE.PAN,
      }
    : {
        LEFT: MOUSE.ROTATE,
        MIDDLE: MOUSE.DOLLY,
        RIGHT: MOUSE.PAN,
      };
}

export interface SceneSetupOptions {
  renderProfile: RenderProfileId;
  mouseMode: MouseMode;
  invertScrollZoom: boolean;
  viewOptions: ViewOptions;
}

/**
 * Build the Three.js scene graph, cameras, lights, controls, shared
 * geometries/materials, and post-processing passes for the molecule
 * canvas. Returns the scene context plus a dispose function that
 * releases every GPU resource created here.
 */
export function createSceneContext(
  container: HTMLElement,
  options: SceneSetupOptions,
): { ctx: SceneCtx; dispose: () => void } {
  const w = container.clientWidth || 800;
  const h = container.clientHeight || 600;

  // preserveDrawingBuffer is required for toDataURL PNG export
  const renderer = new WebGLRenderer({ antialias: true, alpha: true, preserveDrawingBuffer: true });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
  renderer.setSize(w, h);
  container.appendChild(renderer.domElement);

  const scene = new Scene();
  scene.background = new Color(0xffffff);
  scene.fog = null;

  const camera = new PerspectiveCamera(35, w / h, 0.1, 1000);
  const orthographicCamera = new OrthographicCamera(-10, 10, 10, -10, 0.1, 1000);
  camera.position.set(0, 0, 25);
  orthographicCamera.position.copy(camera.position);

  const renderPass = new RenderPass(scene, camera);
  const bokehPass = new BokehPass(scene, camera, {
    focus: 25,
    aperture: 0.00002,
    maxblur: 0.006,
  });
  const composer = new EffectComposer(renderer);
  composer.addPass(renderPass);
  composer.addPass(bokehPass);

  // Bright, print-oriented lighting tuned toward the CYLview reference.
  const ambient = new AmbientLight(0xffffff, 0.52);
  scene.add(ambient);

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
  controls.enableDamping = true;
  controls.dampingFactor = 0.08;
  controls.mouseButtons = orbitMouseButtons(options.mouseMode);
  controls.zoomSpeed = options.invertScrollZoom ? -1 : 1;

  const molGroup = new Group();
  scene.add(molGroup);

  const floorGroup = new Group();
  const floorMat = new MeshBasicMaterial({
    color: 0x2d3035,
    side: DoubleSide,
    transparent: true,
    opacity: 0.92,
  });
  const floorPlane = new Mesh(new PlaneGeometry(1, 1), floorMat);
  floorPlane.rotation.x = -Math.PI / 2;
  const floorGrid = new GridHelper(10, 20, 0x737983, 0x4c525a);
  floorGroup.add(floorPlane);
  floorGroup.add(floorGrid);
  floorGroup.visible = false;
  scene.add(floorGroup);

  const sphereGeom = new SphereGeometry(1, 20, 16);
  const cylGeom = new CylinderGeometry(1, 1, 1, 24, 1, true);
  const sphereGeometryCache = new Map<string, SphereGeometry>([['20x16', sphereGeom]]);
  const cylinderGeometryCache = new Map<string, CylinderGeometry>([['24', cylGeom]]);

  // Saturated cyan cylinders with enough gloss to read like polished tubes.
  const bondMat = new MeshPhongMaterial({
    color: MATERIAL_PRESETS[options.renderProfile].bondColor,
    shininess: MATERIAL_PRESETS[options.renderProfile].shininess,
    specular: MATERIAL_PRESETS[options.renderProfile].specular.clone(),
  });
  const selectedBondMat = new MeshPhongMaterial({
    color: 0xffa24c,
    shininess: 190,
    specular: new Color(0.98, 0.88, 0.78),
  });
  const selectedAtomMat = new MeshPhongMaterial({
    color: 0xffbf73,
    shininess: 150,
    specular: new Color(0.98, 0.9, 0.78),
  });

  const atomMats = new Map<string, MeshPhongMaterial>();
  const raycaster = new Raycaster();
  const pointer = new Vector2();

  const ctx: SceneCtx = {
    renderer, scene, camera, perspectiveCamera: camera, orthographicCamera, controls,
    molGroup, floorGroup, floorPlane, floorGrid, floorMat,
    lights: { ambient, key, fill, rim, topLight },
    depthCue: {
      options: options.viewOptions,
      backgroundColor: 0xffffff,
      composer,
      renderPass,
      bokehPass,
    },
    lastCameraDistance: 25,
    lastMoleculeBox: null,
    animId: 0,
    sphereGeom, cylGeom, sphereGeometryCache, cylinderGeometryCache, atomMats, bondMat, selectedBondMat,
    raycaster, pointer, selectedBondOverlay: null, selectedBondData: null, bondPickObjects: [],
    selectedAtomMat, atomPickObjects: [], selectedAtomOverlays: [], modeSelectedAtomOverlays: [],
    modeSelectedBondOverlays: [], modeSelectedAtoms: [], modeSelectedBonds: [], angleSelection: [],
    angleLabelPosition: null, angleDegrees: null, dihedralLabelPosition: null,
    dihedralDegrees: null, angleArcMesh: null,
  };

  const dispose = () => {
    sphereGeometryCache.forEach((geometry) => geometry.dispose());
    cylinderGeometryCache.forEach((geometry) => geometry.dispose());
    floorPlane.geometry.dispose();
    floorMat.dispose();
    bondMat.dispose();
    selectedBondMat.dispose();
    selectedAtomMat.dispose();
    atomMats.forEach((material) => material.dispose());
    composer.dispose();
    bokehPass.dispose();
    renderer.dispose();
    container.removeChild(renderer.domElement);
  };

  return { ctx, dispose };
}
