/** Scheletro procedurale dei personaggi: indici delle ossa, misure canoniche e creazione delle ossa. */
import * as THREE from 'three';

export const B = {
  hips: 0,
  spine: 1,
  chest: 2,
  neck: 3,
  head: 4,
  armL: 5,
  foreL: 6,
  handL: 7,
  armR: 8,
  foreR: 9,
  handR: 10,
  thighL: 11,
  shinL: 12,
  footL: 13,
  thighR: 14,
  shinR: 15,
  footR: 16,
  phone: 17,
  jaw: 18,
  mouthC: 19,
  eyes: 20,
  browL: 21,
  browR: 22,
} as const;
export const BONE_COUNT = 23;

/** Misure canoniche (metri) di un personaggio alto ≈ 1.70 m; il lato sinistro è +X, lo sguardo +Z. */
export const D = {
  hipsY: 0.9,
  spineY: 1.02,
  chestY: 1.17,
  neckY: 1.4,
  headY: 1.455,
  headCY: 1.565,
  headRX: 0.113,
  headRY: 0.132,
  headRZ: 0.122,
  shY: 1.365,
  upperArm: 0.265,
  foreArm: 0.235,
  hipJY: 0.86,
  thigh: 0.4,
  shin: 0.385,
  ankleY: 0.075,
  eyeY: 1.572,
  browY: 1.612,
  mouthY: 1.503,
  canonicalHeight: 1.7,
} as const;

export interface Dims {
  /** x della spalla (positivo) */
  shX: number;
  /** x dell'anca (positivo) */
  hipX: number;
}

export interface Rig {
  bones: THREE.Bone[];
  skeleton: THREE.Skeleton;
}

export function createRig(d: Dims): Rig {
  const bones: THREE.Bone[] = [];
  const world: THREE.Vector3[] = [];
  const add = (index: number, name: string, parent: number, x: number, y: number, z: number): void => {
    const b = new THREE.Bone();
    b.name = name;
    const w = new THREE.Vector3(x, y, z);
    if (parent >= 0) {
      b.position.copy(w).sub(world[parent] as THREE.Vector3);
      (bones[parent] as THREE.Bone).add(b);
    } else {
      b.position.copy(w);
    }
    bones[index] = b;
    world[index] = w;
  };
  add(B.hips, 'hips', -1, 0, D.hipsY, 0);
  add(B.spine, 'spine', B.hips, 0, D.spineY, 0);
  add(B.chest, 'chest', B.spine, 0, D.chestY, 0);
  add(B.neck, 'neck', B.chest, 0, D.neckY, 0);
  add(B.head, 'head', B.neck, 0, D.headY, 0);
  add(B.armL, 'armL', B.chest, d.shX, D.shY, 0);
  add(B.foreL, 'foreL', B.armL, d.shX, D.shY - D.upperArm, 0);
  add(B.handL, 'handL', B.foreL, d.shX, D.shY - D.upperArm - D.foreArm, 0);
  add(B.armR, 'armR', B.chest, -d.shX, D.shY, 0);
  add(B.foreR, 'foreR', B.armR, -d.shX, D.shY - D.upperArm, 0);
  add(B.handR, 'handR', B.foreR, -d.shX, D.shY - D.upperArm - D.foreArm, 0);
  add(B.thighL, 'thighL', B.hips, d.hipX, D.hipJY, 0);
  add(B.shinL, 'shinL', B.thighL, d.hipX, D.hipJY - D.thigh, 0);
  add(B.footL, 'footL', B.shinL, d.hipX, D.ankleY, 0);
  add(B.thighR, 'thighR', B.hips, -d.hipX, D.hipJY, 0);
  add(B.shinR, 'shinR', B.thighR, -d.hipX, D.hipJY - D.thigh, 0);
  add(B.footR, 'footR', B.shinR, -d.hipX, D.ankleY, 0);
  add(B.phone, 'phone', B.handR, -d.shX, D.shY - D.upperArm - D.foreArm - 0.075, 0);
  add(B.jaw, 'jaw', B.head, 0, D.mouthY, 0.1);
  add(B.mouthC, 'mouthC', B.head, 0, D.mouthY, 0.1);
  add(B.eyes, 'eyes', B.head, 0, D.eyeY, 0.1);
  add(B.browL, 'browL', B.head, 0.043, D.browY, 0.105);
  add(B.browR, 'browR', B.head, -0.043, D.browY, 0.105);
  (bones[B.hips] as THREE.Bone).updateMatrixWorld(true);
  const skeleton = new THREE.Skeleton(bones);
  return { bones, skeleton };
}
