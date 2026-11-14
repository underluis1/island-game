import type * as THREE from 'three';

export interface ShopUpgrades {
  /** sgabello plastica, sedia legno, sedia ergonomica */
  chair: 1 | 2 | 3;
  /** ventilatore da tavolo, condizionatore (fase 3: split a parete; fasi 1-2: ventilatore a piantana grande) */
  fan: 1 | 2;
  /** lampada da tavolo, lampada con lente */
  lamp: 1 | 2;
  /** nessuna, lucine a filo, lucine + faretti */
  lights: 0 | 1 | 2;
  /** portatelefoni da 3, 5, 8 slot */
  rack: 1 | 2 | 3;
  /** mensole porta-ricambi */
  shelf: 0 | 1;
}

export interface ShopOptions {
  stage: 1 | 2 | 3;
  /** hex: strisce bianco + colore */
  awningColor: string;
  /** hex: pareti/infissi fasi 2-3 */
  accentColor: string;
  /** sul cartello */
  shopName: string;
  /** 0.5 | 1 | 2 */
  textureScale: number;
  upgrades: ShopUpgrades;
}

export interface ShopEnv {
  timeOfDay: number;
  wind: number;
  rain: number;
  lampsOn: boolean;
}

export interface Rect {
  minX: number;
  maxX: number;
  minZ: number;
  maxZ: number;
}

export interface ShopAnchors {
  customerSpot: THREE.Vector3;
  seat: THREE.Vector3;
  /** dove sta il tablet ordini sul banco, fuori zona riservata */
  tablet: THREE.Vector3;
  cashBox: THREE.Vector3;
  /** fase 3: postazione assistente */
  assistantSpot: THREE.Vector3;
  /** vetrina accessori fase ≥2 */
  showcase: THREE.Vector3 | null;
}

export interface ShopInteractables {
  radio: THREE.Object3D;
  fan: THREE.Object3D;
  lamp: THREE.Object3D;
  sign: THREE.Object3D;
  rack: THREE.Object3D;
  tablet: THREE.Object3D;
}

export interface ShopBuild {
  root: THREE.Group;
  update(dt: number, env: ShopEnv): void;
  decorArea: Rect;
  blocked: Rect[];
  wallSlots: Array<{ position: THREE.Vector3; normal: THREE.Vector3 }>;
  hangSlots: THREE.Vector3[];
  shelfSlots: THREE.Vector3[];
  deviceSlots: THREE.Vector3[];
  rackSlots: THREE.Vector3[];
  anchors: ShopAnchors;
  interactables: ShopInteractables;
  lampLight: THREE.PointLight;
  /** (extra) quota del piano calpestabile in (x,z): 0 sulla sabbia, >0 su pedana/pavimento */
  floorHeightAt(x: number, z: number): number;
  dispose(): void;
}

export interface ConstructionSite {
  root: THREE.Group;
  update(dt: number): void;
  dispose(): void;
}

export interface DecorModel {
  root: THREE.Group;
  update?(dt: number, env: ShopEnv): void;
  dispose(): void;
}
