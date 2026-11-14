/**
 * Animazione procedurale: ogni azione scrive un vettore di parametri di posa (traslazioni/rotazioni del busto,
 * bersagli IK di mani e piedi, espressione del viso); i vettori si interpolano e poi `applyPose` risolve
 * l'IK a due ossa e scrive le rotazioni sulle ossa. Nessuna allocazione per frame.
 */
import * as THREE from 'three';
import { B, D, type Dims } from './rig';

export type CharacterAction = 'idle' | 'walk' | 'talk' | 'wave' | 'give' | 'happy' | 'angry' | 'sit' | 'work' | 'think';

export const P = {
  hipX: 0,
  hipY: 1,
  hipZ: 2,
  hipRX: 3,
  hipRY: 4,
  hipRZ: 5,
  spRX: 6,
  spRY: 7,
  spRZ: 8,
  chRX: 9,
  chRY: 10,
  chRZ: 11,
  hdRX: 12,
  hdRY: 13,
  hdRZ: 14,
  /** bersaglio del polso rispetto alla spalla a riposo (x = verso l'esterno del proprio lato) */
  aL: 15,
  aR: 18,
  /** direzione del gomito (x = verso l'esterno) */
  pL: 21,
  pR: 24,
  /** rotazione locale della mano (eulero XYZ) */
  hL: 27,
  hR: 30,
  /** piede: offset caviglia (x verso l'esterno, y, z), beccheggio, imbardata verso l'esterno */
  fL: 33,
  fR: 38,
  jaw: 43,
  smile: 44,
  browUp: 45,
  browAng: 46,
  eyeClose: 47,
  /** ginocchia: componente verticale del polo (più alto = ginocchio più su, da seduti) */
  kneeUp: 48,
} as const;
export const POSE_SIZE = 49;

export interface AnimCtx {
  /** fase del passo in radianti */
  walkPhase: number;
  /** sfasamento personale */
  ph: number;
  /** offset Y del bacino da seduti (spazio non scalato) */
  seatDY: number;
  /** quota assoluta dei polsi al banco (spazio non scalato) */
  benchY: number;
}

const sin = Math.sin;
const cos = Math.cos;
const sm = (t: number): number => {
  const x = Math.min(1, Math.max(0, t));
  return x * x * (3 - 2 * x);
};

function arm(o: Float32Array, base: number, out: number, up: number, fwd: number): void {
  o[base] = out;
  o[base + 1] = up;
  o[base + 2] = fwd;
}
function pole(o: Float32Array, base: number, out: number, up: number, fwd: number): void {
  o[base] = out;
  o[base + 1] = up;
  o[base + 2] = fwd;
}
function hand(o: Float32Array, base: number, x: number, y: number, z: number): void {
  o[base] = x;
  o[base + 1] = y;
  o[base + 2] = z;
}
function foot(o: Float32Array, base: number, out: number, y: number, z: number, pitch: number, yaw: number): void {
  o[base] = out;
  o[base + 1] = y;
  o[base + 2] = z;
  o[base + 3] = pitch;
  o[base + 4] = yaw;
}

function rest(o: Float32Array, t: number, ph: number): void {
  o.fill(0);
  const br = sin(t * 1.7 + ph);
  o[P.chRX] = 0.012 * br;
  arm(o, P.aL, 0.035, -0.482 + 0.004 * br, 0.02 + 0.006 * sin(t * 0.8 + ph));
  arm(o, P.aR, 0.035, -0.482 + 0.004 * br, 0.02 + 0.006 * sin(t * 0.8 + ph + 1.3));
  pole(o, P.pL, 0.5, -0.3, -1);
  pole(o, P.pR, 0.5, -0.3, -1);
  foot(o, P.fL, 0.012, 0, 0, 0, 0.14);
  foot(o, P.fR, 0.012, 0, 0, 0, 0.14);
  o[P.smile] = 0.35;
  o[P.kneeUp] = 0.2;
}

function weightShift(o: Float32Array, t: number, ph: number, amt: number): void {
  const raw = sin(t * 0.42 + ph * 2.1);
  const s = Math.sign(raw) * sm(Math.abs(raw) * 1.6) * amt;
  o[P.hipX] = 0.024 * s;
  o[P.hipRZ] = 0.035 * s;
  o[P.spRZ] = -0.045 * s;
  o[P.hipY] = -0.006 * Math.abs(s);
  o[P.hdRZ] = 0.012 * s;
}

function legCycle(o: Float32Array, base: number, p: number, stride: number): void {
  const TAU = Math.PI * 2;
  const u = (((p % TAU) + TAU) % TAU) / TAU;
  const duty = 0.6;
  let z: number;
  let y: number;
  let pitch: number;
  if (u < duty) {
    const s = u / duty;
    z = stride * (0.5 - s);
    const strike = s < 0.16 ? 1 - s / 0.16 : 0;
    const push = s > 0.68 ? (s - 0.68) / 0.32 : 0;
    pitch = -0.3 * strike + 0.55 * push * push;
    y = 0.035 * push * push + 0.012 * strike;
  } else {
    const w = (u - duty) / (1 - duty);
    z = stride * (-0.5 + (0.5 - 0.5 * cos(Math.PI * w)));
    y = 0.075 * sin(Math.PI * w) + 0.035 * (1 - w) * (1 - w) + 0.012 * w * w;
    pitch = 0.55 * (1 - w) * (1 - w) - 0.3 * w * w;
  }
  foot(o, base, 0.0, y, z, pitch, 0.07);
}

export function evalAction(a: CharacterAction, t: number, c: AnimCtx, o: Float32Array): void {
  const ph = c.ph;
  rest(o, t, ph);
  switch (a) {
    case 'idle': {
      weightShift(o, t, ph, 1);
      const look = sin(t * 0.23 + ph) * sin(t * 0.11 + ph * 0.7);
      o[P.hdRY] = 0.3 * look;
      o[P.hdRX] = 0.04 * sin(t * 0.31 + ph);
      o[P.chRY] = 0.06 * look;
      break;
    }
    case 'walk': {
      const f = c.walkPhase;
      legCycle(o, P.fL, f, 0.74);
      legCycle(o, P.fR, f + Math.PI, 0.74);
      o[P.hipY] = -0.014 - 0.016 * cos(2 * f);
      o[P.hipX] = 0.022 * sin(f - 0.5);
      o[P.hipRY] = -0.13 * cos(f);
      o[P.chRY] = 0.23 * cos(f);
      o[P.hdRY] = -0.1 * cos(f);
      o[P.hipRZ] = 0.045 * sin(f - 0.5);
      o[P.spRZ] = -0.05 * sin(f - 0.5);
      o[P.hipRX] = 0.045;
      o[P.hdRX] = -0.03 + 0.012 * cos(2 * f);
      const aL = -0.5 * cos(f);
      const aR = 0.5 * cos(f);
      const L = 0.488;
      arm(o, P.aL, 0.04, -(L - 0.05 * Math.max(0, sin(aL))) * cos(aL), L * sin(aL) + 0.02);
      arm(o, P.aR, 0.04, -(L - 0.05 * Math.max(0, sin(aR))) * cos(aR), L * sin(aR) + 0.02);
      o[P.smile] = 0.3;
      break;
    }
    case 'talk': {
      weightShift(o, t, ph, 0.7);
      const gR = sm(0.5 + 0.9 * sin(t * 0.9 + ph));
      const gL = sm(0.5 + 0.9 * sin(t * 0.63 + ph + 2.2) - 0.25);
      arm(o, P.aR, 0.035 + gR * (0.02 + 0.03 * sin(t * 3.1)), -0.482 + gR * (0.25 + 0.035 * sin(t * 2.3 + 1)), 0.02 + gR * (0.22 + 0.025 * cos(t * 2.7)));
      arm(o, P.aL, 0.035 + gL * (0.03 + 0.02 * sin(t * 2.6 + 2)), -0.482 + gL * (0.2 + 0.03 * sin(t * 2.1)), 0.02 + gL * (0.2 + 0.02 * cos(t * 3.0)));
      hand(o, P.hR, -0.3 * gR, -0.9 * gR, 0);
      hand(o, P.hL, -0.3 * gL, 0.9 * gL, 0);
      o[P.hdRX] = 0.05 * sin(t * 2.1 + ph);
      o[P.hdRZ] += 0.05 * sin(t * 0.9 + ph);
      o[P.hdRY] = 0.08 * sin(t * 0.7);
      o[P.browUp] = 0.4 + 0.3 * sin(t * 1.3);
      o[P.smile] = 0.5;
      break;
    }
    case 'wave': {
      weightShift(o, t, ph, 0.4);
      const w = sin(t * 9);
      arm(o, P.aR, 0.2 + 0.09 * w, 0.23 + 0.01 * cos(t * 18), 0.07);
      pole(o, P.pR, 0.9, -1, -0.15);
      hand(o, P.hR, 0, 1.5, -0.25 * w);
      o[P.spRZ] += 0.05;
      o[P.chRZ] = 0.03 * w;
      o[P.hdRZ] = -0.08;
      o[P.hdRX] = -0.06;
      o[P.smile] = 1;
      o[P.browUp] = 0.8;
      o[P.jaw] = 0.45;
      break;
    }
    case 'give': {
      weightShift(o, t, ph, 0.25);
      arm(o, P.aR, -0.08, -0.17 + 0.006 * sin(t * 2), 0.43);
      pole(o, P.pR, 0.7, -1, -0.3);
      hand(o, P.hR, 0.12, -1.45, 0.0);
      o[P.spRX] = 0.09;
      o[P.chRX] += 0.05;
      o[P.hdRX] = 0.06;
      o[P.hdRY] = -0.06;
      o[P.browUp] = 0.4;
      o[P.smile] = 0.55;
      break;
    }
    case 'happy': {
      const w = t * 9.5;
      const s = sin(w);
      const jump = Math.max(0, s);
      const crouch = Math.min(0, s);
      o[P.hipY] = 0.075 * jump + 0.035 * crouch;
      const fy = 0.055 * jump;
      foot(o, P.fL, 0.02, fy, 0, 0.5 * jump, 0.2);
      foot(o, P.fR, 0.02, fy, 0, 0.5 * jump, 0.2);
      const up = 0.3 + 0.05 * s;
      arm(o, P.aL, 0.16 + 0.03 * sin(w * 0.5), up, 0.06);
      arm(o, P.aR, 0.16 - 0.03 * sin(w * 0.5), up, 0.06);
      pole(o, P.pL, 1, -0.6, -0.3);
      pole(o, P.pR, 1, -0.6, -0.3);
      hand(o, P.hL, 0, -1.4, 0);
      hand(o, P.hR, 0, 1.4, 0);
      o[P.hdRX] = -0.14;
      o[P.spRX] = -0.04;
      o[P.hdRZ] = 0.06 * sin(w * 0.5);
      o[P.smile] = 1;
      o[P.jaw] = 0.7;
      o[P.browUp] = 1;
      o[P.eyeClose] = 0.62;
      break;
    }
    case 'angry': {
      const burst = sm(0.5 + 1.2 * sin(t * 1.3 + ph));
      const shake = sin(t * 15) * burst;
      o[P.spRX] = 0.1;
      o[P.hipX] = 0.012;
      arm(o, P.aL, 0.085, -0.3, -0.035);
      pole(o, P.pL, 1, 0.1, -0.7);
      hand(o, P.hL, 0.5, 0, -0.5);
      arm(o, P.aR, -0.02, -0.14 + 0.035 * shake, 0.27);
      pole(o, P.pR, 0.8, -0.8, -0.4);
      hand(o, P.hR, -0.9, 0.6, 0);
      foot(o, P.fR, 0.03, 0, 0.06, -0.3 * Math.max(0, sin(t * 9)), 0.3);
      o[P.hdRX] = 0.08;
      o[P.hdRY] = 0.1 * sin(t * 7.5) * burst;
      o[P.browAng] = -1;
      o[P.browUp] = -0.6;
      o[P.smile] = -1;
      o[P.jaw] = 0.25 * burst * (0.5 + 0.5 * sin(t * 11));
      o[P.eyeClose] = 0.25;
      break;
    }
    case 'sit':
    case 'work': {
      o[P.hipY] = c.seatDY;
      o[P.hipRX] = -0.04;
      o[P.kneeUp] = 0.9;
      foot(o, P.fL, 0.035, 0, 0.36, 0, 0.12);
      foot(o, P.fR, 0.035, 0, 0.34, 0, 0.12);
      const br = sin(t * 1.7 + ph);
      if (a === 'sit') {
        o[P.spRX] = 0.1;
        o[P.chRX] = 0.04 + 0.012 * br;
        o[P.hdRX] = -0.08 + 0.03 * sin(t * 0.3 + ph);
        o[P.hdRY] = 0.25 * sin(t * 0.21 + ph) * sin(t * 0.13);
        arm(o, P.aL, -0.045, -0.375, 0.27);
        arm(o, P.aR, -0.045, -0.375, 0.27);
        hand(o, P.hL, -1.1, -0.5, 0);
        hand(o, P.hR, -1.1, 0.5, 0);
      } else {
        o[P.spRX] = 0.2;
        o[P.chRX] = 0.14 + 0.01 * br;
        o[P.hdRX] = 0.32 + 0.03 * sin(t * 0.7);
        o[P.hdRY] = 0.05 * sin(t * 0.4 + ph);
        const y = c.benchY - (D.shY + c.seatDY);
        const busy = sm(0.5 + 1.5 * sin(t * 0.8 + ph));
        const tw = t * 13;
        arm(o, P.aR, -0.1 + 0.006 * cos(tw) * busy + 0.02 * sin(t * 0.5), y + 0.02 + 0.004 * sin(tw) * busy, 0.4 + 0.02 * sin(t * 0.37));
        arm(o, P.aL, -0.07 + 0.01 * sin(t * 0.6 + 1), y, 0.41 + 0.012 * sin(t * 0.45 + 2));
        pole(o, P.pL, 1, -0.5, -0.5);
        pole(o, P.pR, 1, -0.5, -0.5);
        hand(o, P.hL, -0.5, -0.6, 0);
        hand(o, P.hR, -0.5, 0.6, 0.3 * sin(tw) * busy);
        o[P.smile] = 0.15;
        o[P.browUp] = -0.2;
      }
      break;
    }
    case 'think': {
      weightShift(o, t * 0.6, ph, 1);
      arm(o, P.aR, -0.14, 0.085 + 0.004 * sin(t * 1.2), 0.15);
      pole(o, P.pR, 0.3, -1, 0.2);
      hand(o, P.hR, -0.6, 1.2, 0);
      arm(o, P.aL, -0.2, -0.275, 0.15);
      pole(o, P.pL, 0.8, -0.6, -0.5);
      hand(o, P.hL, 0, -1.3, 0);
      o[P.hdRZ] = 0.13;
      o[P.hdRY] = -0.2 + 0.06 * sin(t * 0.5);
      o[P.hdRX] = -0.07 + 0.03 * sin(t * 0.37);
      o[P.browUp] = 0.7;
      o[P.browAng] = 0.3;
      o[P.smile] = -0.15;
      break;
    }
  }
}

// ------------------------------------------------------------------ applicazione della posa (FK + IK)
const eul = new THREE.Euler();
const qH = new THREE.Quaternion();
const qS = new THREE.Quaternion();
const qC = new THREE.Quaternion();
const qT = new THREE.Quaternion();
const qU = new THREE.Quaternion();
const qLow = new THREE.Quaternion();
const qInv = new THREE.Quaternion();
const pH = new THREE.Vector3();
const pS = new THREE.Vector3();
const pC = new THREE.Vector3();
const joint = new THREE.Vector3();
const tgt = new THREE.Vector3();
const pol = new THREE.Vector3();
const dn = new THREE.Vector3();
const nn = new THREE.Vector3();
const toward = new THREE.Vector3();
const uu = new THREE.Vector3();
const ax = new THREE.Vector3();
const ay = new THREE.Vector3();
const az = new THREE.Vector3();
const mBasis = new THREE.Matrix4();
const X_AXIS = new THREE.Vector3(1, 0, 0);
const Y_AXIS = new THREE.Vector3(0, 1, 0);

/** IK a due ossa: orienta `upper` (figlio di un osso con orientamento mondo `parentQ`) e `lower`; lascia in qLow l'orientamento del secondo osso. */
function solveLimb(upper: THREE.Bone, lower: THREE.Bone, parentQ: THREE.Quaternion, a: number, b: number, flip: boolean): void {
  dn.copy(tgt).sub(joint);
  const len = dn.length() || 1e-4;
  const c = Math.min(a + b - 0.002, Math.max(Math.abs(a - b) + 0.002, len));
  dn.multiplyScalar(1 / len);
  nn.crossVectors(dn, pol);
  if (nn.lengthSq() < 1e-8) nn.crossVectors(dn, X_AXIS);
  nn.normalize();
  toward.crossVectors(nn, dn);
  const cosA = Math.min(1, Math.max(-1, (a * a + c * c - b * b) / (2 * a * c)));
  const A = Math.acos(cosA);
  uu.copy(dn).multiplyScalar(cosA).addScaledVector(toward, Math.sin(A));
  const cosK = Math.min(1, Math.max(-1, (a * a + b * b - c * c) / (2 * a * b)));
  const bend = Math.PI - Math.acos(cosK);
  if (flip) ax.copy(nn).negate();
  else ax.copy(nn);
  ay.copy(uu).negate();
  az.crossVectors(ax, ay);
  mBasis.makeBasis(ax, ay, az);
  qU.setFromRotationMatrix(mBasis);
  qInv.copy(parentQ).invert();
  upper.quaternion.copy(qInv).multiply(qU);
  lower.quaternion.setFromAxisAngle(X_AXIS, flip ? bend : -bend);
  qLow.copy(qU).multiply(lower.quaternion);
}

export function applyPose(o: Float32Array, bones: THREE.Bone[], d: Dims, restPos: THREE.Vector3[]): void {
  const hips = bones[B.hips] as THREE.Bone;
  pH.set(o[P.hipX] as number, D.hipsY + (o[P.hipY] as number), o[P.hipZ] as number);
  hips.position.copy(pH);
  qH.setFromEuler(eul.set(o[P.hipRX] as number, o[P.hipRY] as number, o[P.hipRZ] as number, 'YXZ'));
  hips.quaternion.copy(qH);
  const spine = bones[B.spine] as THREE.Bone;
  spine.quaternion.setFromEuler(eul.set(o[P.spRX] as number, o[P.spRY] as number, o[P.spRZ] as number, 'YXZ'));
  const chest = bones[B.chest] as THREE.Bone;
  chest.quaternion.setFromEuler(eul.set(o[P.chRX] as number, o[P.chRY] as number, o[P.chRZ] as number, 'YXZ'));
  const hx = o[P.hdRX] as number;
  const hy = o[P.hdRY] as number;
  const hzr = o[P.hdRZ] as number;
  (bones[B.neck] as THREE.Bone).quaternion.setFromEuler(eul.set(hx * 0.4, hy * 0.4, hzr * 0.4, 'YXZ'));
  (bones[B.head] as THREE.Bone).quaternion.setFromEuler(eul.set(hx * 0.6, hy * 0.6, hzr * 0.6, 'YXZ'));
  qS.copy(qH).multiply(spine.quaternion);
  qC.copy(qS).multiply(chest.quaternion);
  pS.set(0, D.spineY - D.hipsY, 0).applyQuaternion(qH).add(pH);
  pC.set(0, D.chestY - D.spineY, 0).applyQuaternion(qS).add(pS);

  for (let side = 0; side < 2; side++) {
    const sx = side === 0 ? 1 : -1;
    const aB = side === 0 ? P.aL : P.aR;
    const pB = side === 0 ? P.pL : P.pR;
    const hB = side === 0 ? P.hL : P.hR;
    joint.set(sx * d.shX, D.shY - D.chestY, 0).applyQuaternion(qC).add(pC);
    tgt.set(sx * (d.shX + (o[aB] as number)) + (o[P.hipX] as number), D.shY + (o[aB + 1] as number) + (o[P.hipY] as number), (o[aB + 2] as number) + (o[P.hipZ] as number));
    pol.set(sx * (o[pB] as number), o[pB + 1] as number, o[pB + 2] as number);
    solveLimb(bones[side === 0 ? B.armL : B.armR] as THREE.Bone, bones[side === 0 ? B.foreL : B.foreR] as THREE.Bone, qC, D.upperArm, D.foreArm, false);
    (bones[side === 0 ? B.handL : B.handR] as THREE.Bone).quaternion.setFromEuler(eul.set(o[hB] as number, o[hB + 1] as number, o[hB + 2] as number, 'YXZ'));
  }
  for (let side = 0; side < 2; side++) {
    const sx = side === 0 ? 1 : -1;
    const fB = side === 0 ? P.fL : P.fR;
    joint.set(sx * d.hipX, D.hipJY - D.hipsY, 0).applyQuaternion(qH).add(pH);
    tgt.set(sx * (d.hipX + (o[fB] as number)), D.ankleY + (o[fB + 1] as number), o[fB + 2] as number);
    const yaw = sx * (o[fB + 4] as number);
    pol.set(Math.sin(yaw) * 0.6, o[P.kneeUp] as number, 1);
    solveLimb(bones[side === 0 ? B.thighL : B.thighR] as THREE.Bone, bones[side === 0 ? B.shinL : B.shinR] as THREE.Bone, qH, D.thigh, D.shin, true);
    qT.setFromAxisAngle(Y_AXIS, yaw);
    qU.setFromAxisAngle(X_AXIS, o[fB + 3] as number);
    qT.multiply(qU);
    (bones[side === 0 ? B.footL : B.footR] as THREE.Bone).quaternion.copy(qLow.invert()).multiply(qT);
  }
  // viso
  const jaw = bones[B.jaw] as THREE.Bone;
  jaw.position.y = (restPos[B.jaw] as THREE.Vector3).y - Math.max(0, o[P.jaw] as number) * 0.017;
  const mc = bones[B.mouthC] as THREE.Bone;
  mc.position.y = (restPos[B.mouthC] as THREE.Vector3).y + (o[P.smile] as number) * 0.0075 - Math.max(0, o[P.jaw] as number) * 0.006;
  (bones[B.eyes] as THREE.Bone).scale.y = Math.max(0.08, 1 - 0.92 * (o[P.eyeClose] as number));
  const bu = (o[P.browUp] as number) * 0.007;
  const ba = (o[P.browAng] as number) * 0.42;
  const bl = bones[B.browL] as THREE.Bone;
  const br = bones[B.browR] as THREE.Bone;
  bl.position.y = (restPos[B.browL] as THREE.Vector3).y + bu;
  br.position.y = (restPos[B.browR] as THREE.Vector3).y + bu;
  bl.rotation.z = -ba;
  br.rotation.z = ba;
}
