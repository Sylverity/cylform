import type {
  WebGLRenderer,
  Scene,
  PerspectiveCamera,
  OrthographicCamera,
  Group,
  GridHelper,
  Mesh,
  MeshBasicMaterial,
  AmbientLight,
  DirectionalLight,
  SphereGeometry,
  CylinderGeometry,
  MeshPhongMaterial,
  Raycaster,
  Vector2,
  Vector3,
  Box3,
  Matrix4,
  InstancedMesh,
} from 'three';
import type { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
import type { BokehPass } from 'three/examples/jsm/postprocessing/BokehPass.js';
import type { EffectComposer } from 'three/examples/jsm/postprocessing/EffectComposer.js';
import type { RenderPass } from 'three/examples/jsm/postprocessing/RenderPass.js';
import type { MoleculeData, ViewOptions } from '../../App';

export interface BondSelectionData {
  atom1Element: string;
  atom2Element: string;
  distance: number;
  midpoint: Vector3;
  atom1Index: number;
  atom2Index: number;
  displayRadius: number;
  matrix: Matrix4;
}

export interface AtomSelectionData {
  element: string;
  atomIndex: number;
  position: Vector3;
  baseRadius: number;
}

export interface SceneRenderStats {
  renderCalls: number;
  triangles: number;
  geometries: number;
  textures: number;
  sceneObjects: number;
}

export interface RenderQualityProfile {
  primitiveLoad: number;
  qualityT: number;
  pixelRatio: number;
  sphereWidthSegments: number;
  sphereHeightSegments: number;
  cylinderRadialSegments: number;
}

export interface MoleculeVisibilityIndex {
  moleculeData: MoleculeData;
  adjacency: number[][];
  isHydrogen: boolean[];
  isCarbonHydrogen: boolean[];
  bounds: Box3 | null;
}

export interface PickMetrics {
  pickAtomMs: number | null;
  pickBondMs: number | null;
  pickTotalMs: number;
  pickHitType: 'atom' | 'bond' | 'none';
  pickAtomCandidates: number;
  pickBondCandidates: number;
}

export interface PickResult extends PickMetrics {
  atom: AtomSelectionData | null;
  bond: BondSelectionData | null;
}

export interface BondRenderInstance {
  matrix: Matrix4;
  selection: BondSelectionData;
}

export interface SceneCtx {
  renderer: WebGLRenderer;
  scene: Scene;
  camera: PerspectiveCamera | OrthographicCamera;
  perspectiveCamera: PerspectiveCamera;
  orthographicCamera: OrthographicCamera;
  controls: OrbitControls;
  molGroup: Group;
  floorGroup: Group;
  floorPlane: Mesh;
  floorGrid: GridHelper;
  floorMat: MeshBasicMaterial;
  lights: {
    ambient: AmbientLight;
    key: DirectionalLight;
    fill: DirectionalLight;
    rim: DirectionalLight;
    topLight: DirectionalLight;
  };
  depthCue: {
    options: ViewOptions;
    backgroundColor: number;
    composer: EffectComposer | null;
    renderPass: RenderPass | null;
    bokehPass: BokehPass | null;
  };
  lastCameraDistance: number;
  lastMoleculeBox: Box3 | null;
  animId: number;
  sphereGeom: SphereGeometry;
  cylGeom: CylinderGeometry;
  sphereGeometryCache: Map<string, SphereGeometry>;
  cylinderGeometryCache: Map<string, CylinderGeometry>;
  atomMats: Map<string, MeshPhongMaterial>;
  bondMat: MeshPhongMaterial;
  selectedBondMat: MeshPhongMaterial;
  raycaster: Raycaster;
  pointer: Vector2;
  selectedBondOverlay: Mesh | null;
  selectedBondData: BondSelectionData | null;
  bondPickObjects: Array<Mesh | InstancedMesh>;
  selectedAtomMat: MeshPhongMaterial;
  atomPickObjects: InstancedMesh[];
  selectedAtomOverlays: Mesh[];
  modeSelectedAtomOverlays: Mesh[];
  modeSelectedBondOverlays: Mesh[];
  modeSelectedAtoms: AtomSelectionData[];
  modeSelectedBonds: BondSelectionData[];
  angleSelection: AtomSelectionData[];
  angleLabelPosition: Vector3 | null;
  angleDegrees: number | null;
  dihedralLabelPosition: Vector3 | null;
  dihedralDegrees: number | null;
  angleArcMesh: Mesh | null;
}
