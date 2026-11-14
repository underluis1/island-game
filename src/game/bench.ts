/**
 * The work surface: silicone work mat, magnetic screw mat and the layout rules for parts laid on it.
 * Mat space is in millimetres (+x right, +y away from the player, +z up); `root` maps it onto the bench.
 */
import * as THREE from 'three';
import { PhoneModel } from '../gameplay/repair/model';
import type { PhoneInstance } from '../gameplay/repair/types';

export const MAT_W = 600;
export const MAT_H = 380;
const CELL = 30;

export interface MatGrid {
  cols: number;
  rows: number;
  cells: number;
}

export function matGrid(cells: number): MatGrid {
  if (cells >= 24) return { cols: 4, rows: 6, cells: 24 };
  if (cells >= 15) return { cols: 3, rows: 5, cells: 15 };
  return { cols: 2, rows: 4, cells: 8 };
}

function workMatTexture(scale: number): THREE.CanvasTexture {
  const W = Math.round(1200 * scale);
  const H = Math.round(760 * scale);
  const c = document.createElement('canvas');
  c.width = W;
  c.height = H;
  const g = c.getContext('2d') as CanvasRenderingContext2D;
  g.scale(W / 1200, H / 760);
  const grad = g.createLinearGradient(0, 0, 1200, 760);
  grad.addColorStop(0, '#1f6f72');
  grad.addColorStop(1, '#195a60');
  g.fillStyle = grad;
  g.fillRect(0, 0, 1200, 760);
  // silicone speckle
  for (let i = 0; i < 2600; i++) {
    g.fillStyle = `rgba(255,255,255,${0.012 + Math.random() * 0.02})`;
    g.fillRect(Math.random() * 1200, Math.random() * 760, 2, 2);
  }
  // 10 mm grid (2 px per mm), bolder every 50 mm
  for (let x = 20; x <= 1180; x += 20) {
    g.strokeStyle = (x - 20) % 100 === 0 ? 'rgba(220,255,250,0.16)' : 'rgba(220,255,250,0.06)';
    g.lineWidth = (x - 20) % 100 === 0 ? 1.4 : 1;
    g.beginPath();
    g.moveTo(x, 20);
    g.lineTo(x, 740);
    g.stroke();
  }
  for (let y = 20; y <= 740; y += 20) {
    g.strokeStyle = (y - 20) % 100 === 0 ? 'rgba(220,255,250,0.16)' : 'rgba(220,255,250,0.06)';
    g.lineWidth = (y - 20) % 100 === 0 ? 1.4 : 1;
    g.beginPath();
    g.moveTo(20, y);
    g.lineTo(1180, y);
    g.stroke();
  }
  g.strokeStyle = 'rgba(230,255,250,0.55)';
  g.lineWidth = 3;
  g.strokeRect(20, 20, 1160, 720);
  // ruler numbers
  g.fillStyle = 'rgba(230,255,250,0.6)';
  g.font = '13px monospace';
  for (let x = 0; x <= 55; x += 5) g.fillText(String(x), 24 + x * 20, 36);
  for (let y = 5; y <= 35; y += 5) g.fillText(String(y), 24, 26 + y * 20);
  g.font = 'bold 22px system-ui, sans-serif';
  g.fillText('ISLAND FIX · WORK MAT · ซ่อมมือถือ', 40, 726);
  g.font = '14px system-ui, sans-serif';
  g.textAlign = 'right';
  g.fillText('ESD SAFE · HEAT RESISTANT 500°C · KOH PHI PHI', 1170, 726);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = 8;
  return t;
}

function magMatTexture(grid: MatGrid, scale: number): THREE.CanvasTexture {
  const px = 64;
  const W = grid.cols * px + 24;
  const H = grid.rows * px + 44;
  const c = document.createElement('canvas');
  c.width = Math.round(W * scale);
  c.height = Math.round(H * scale);
  const g = c.getContext('2d') as CanvasRenderingContext2D;
  g.scale(scale, scale);
  g.fillStyle = '#e9eef0';
  g.fillRect(0, 0, W, H);
  g.fillStyle = '#17324d';
  g.fillRect(0, 0, W, 30);
  g.fillStyle = '#ffffff';
  g.font = 'bold 15px system-ui, sans-serif';
  g.fillText('MAGNETIC SCREW MAT', 10, 20);
  for (let r = 0; r < grid.rows; r++) {
    for (let col = 0; col < grid.cols; col++) {
      const x = 12 + col * px;
      const y = 38 + r * px;
      g.fillStyle = (r + col) % 2 === 0 ? '#f7fafb' : '#dfe8ec';
      g.fillRect(x, y, px, px);
      g.strokeStyle = '#17324d';
      g.lineWidth = 1.5;
      g.strokeRect(x, y, px, px);
      g.fillStyle = 'rgba(23,50,77,0.55)';
      g.font = 'bold 13px monospace';
      g.fillText(`${String.fromCharCode(65 + col)}${r + 1}`, x + 5, y + 16);
    }
  }
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = 8;
  return t;
}

export interface TrayRect {
  x: number;
  y: number;
  w: number;
  h: number;
}

export class Bench {
  /** mat space (mm) → world; add phone visuals here */
  readonly root = new THREE.Group();
  private workMat: THREE.Mesh;
  private magMat: THREE.Mesh | null = null;
  private cellHighlight: THREE.Mesh;
  private cellProxies: THREE.Mesh[] = [];
  private grid: MatGrid = matGrid(8);
  private textures: THREE.Texture[] = [];
  private magOrigin = new THREE.Vector2();

  constructor(private textureScale = 1) {
    this.root.name = 'bench';
    this.root.rotation.x = -Math.PI / 2;
    this.root.scale.setScalar(0.001);
    this.root.position.set(0, 0.9 + 0.0022, 0);

    const tex = workMatTexture(textureScale);
    this.textures.push(tex);
    const shape = new THREE.Shape();
    const hw = MAT_W / 2;
    const hh = MAT_H / 2;
    const r = 14;
    shape.moveTo(-hw + r, -hh);
    shape.lineTo(hw - r, -hh);
    shape.absarc(hw - r, -hh + r, r, -Math.PI / 2, 0, false);
    shape.lineTo(hw, hh - r);
    shape.absarc(hw - r, hh - r, r, 0, Math.PI / 2, false);
    shape.lineTo(-hw + r, hh);
    shape.absarc(-hw + r, hh - r, r, Math.PI / 2, Math.PI, false);
    shape.lineTo(-hw, -hh + r);
    shape.absarc(-hw + r, -hh + r, r, Math.PI, Math.PI * 1.5, false);
    const geo = new THREE.ExtrudeGeometry(shape, { depth: 2, bevelEnabled: true, bevelSize: 0.6, bevelThickness: 0.6, bevelSegments: 2 });
    geo.translate(0, 0, -2.6);
    const pos = geo.getAttribute('position');
    const uv = new Float32Array(pos.count * 2);
    for (let i = 0; i < pos.count; i++) {
      uv[i * 2] = pos.getX(i) / MAT_W + 0.5;
      uv[i * 2 + 1] = pos.getY(i) / MAT_H + 0.5;
    }
    geo.setAttribute('uv', new THREE.BufferAttribute(uv, 2));
    this.workMat = new THREE.Mesh(geo, new THREE.MeshStandardMaterial({ map: tex, roughness: 0.86, metalness: 0 }));
    this.workMat.receiveShadow = true;
    this.workMat.userData.surface = 'mat';
    this.root.add(this.workMat);

    this.cellHighlight = new THREE.Mesh(
      new THREE.PlaneGeometry(CELL - 2, CELL - 2),
      new THREE.MeshBasicMaterial({ color: '#18e0c8', transparent: true, opacity: 0.45, depthWrite: false }),
    );
    this.cellHighlight.visible = false;
    this.cellHighlight.renderOrder = 4;
    this.root.add(this.cellHighlight);
    this.setMatCells(8);
  }

  get surface(): THREE.Mesh {
    return this.workMat;
  }

  get cells(): number {
    return this.grid.cells;
  }

  setMatCells(cells: number): void {
    const grid = matGrid(cells);
    if (this.magMat && grid.cells === this.grid.cells) return;
    this.grid = grid;
    if (this.magMat) {
      this.root.remove(this.magMat);
      this.magMat.geometry.dispose();
      const m = this.magMat.material as THREE.MeshStandardMaterial;
      m.map?.dispose();
      m.dispose();
    }
    for (const p of this.cellProxies) {
      this.root.remove(p);
    }
    this.cellProxies = [];
    const w = grid.cols * CELL + 12;
    const h = grid.rows * CELL + 22;
    const tex = magMatTexture(grid, this.textureScale);
    const geo = new THREE.BoxGeometry(w, h, 1.2);
    // top face gets the full texture; sides sample a border pixel
    const uv = geo.getAttribute('uv') as THREE.BufferAttribute;
    for (let i = 0; i < uv.count; i++) {
      const face = Math.floor(i / 4);
      if (face !== 4) uv.setXY(i, 0.01, 0.99);
    }
    this.magMat = new THREE.Mesh(geo, new THREE.MeshStandardMaterial({ map: tex, roughness: 0.55, metalness: 0.05 }));
    const cx = 96 + w / 2;
    this.magMat.position.set(cx, 0, 0.6);
    this.magMat.receiveShadow = true;
    this.magMat.castShadow = true;
    this.magMat.userData.surface = 'magmat';
    this.root.add(this.magMat);
    // cell (0,0) is top-left
    this.magOrigin.set(cx - w / 2 + 6 + CELL / 2, h / 2 - 19 - CELL / 2 + 0);
    const proxyGeo = new THREE.PlaneGeometry(CELL, CELL);
    const proxyMat = new THREE.MeshBasicMaterial({ visible: false });
    for (let i = 0; i < grid.cells; i++) {
      const p = new THREE.Mesh(proxyGeo, proxyMat);
      const c = this.cellCenter(i);
      p.position.set(c.x, c.y, 1.3);
      p.userData.cell = i;
      this.root.add(p);
      this.cellProxies.push(p);
    }
  }

  cellCenter(cell: number): THREE.Vector3 {
    const col = cell % this.grid.cols;
    const row = Math.floor(cell / this.grid.cols);
    return new THREE.Vector3(this.magOrigin.x + col * CELL, this.magOrigin.y - row * CELL, 1.25);
  }

  get cellTargets(): THREE.Object3D[] {
    return this.cellProxies;
  }

  highlightCell(cell: number | null, color = '#18e0c8'): void {
    if (cell == null || cell >= this.grid.cells) {
      this.cellHighlight.visible = false;
      return;
    }
    const c = this.cellCenter(cell);
    this.cellHighlight.position.set(c.x, c.y, 1.32);
    (this.cellHighlight.material as THREE.MeshBasicMaterial).color.set(color);
    this.cellHighlight.visible = true;
  }

  /** x range (mm) taken by the magnetic mat, to keep parts off it */
  private magRect(): TrayRect {
    const w = this.grid.cols * CELL + 12;
    const h = this.grid.rows * CELL + 22;
    return { x: 96 + w / 2, y: 0, w: w + 10, h: h + 10 };
  }

  /**
   * Finds a free resting place on the mat for a removed part and stores it in the phone state.
   * Returns false when the mat is completely full (the part then overlaps at a default spot).
   */
  assignTray(model: PhoneModel, phone: PhoneInstance, compId: string, phoneCenterX = -20): boolean {
    const def = model.comp(compId);
    const cs = phone.comps[compId]!;
    if (cs.tray) return true;
    const margin = 7;
    const fw = def.rect[2] + margin;
    const fh = def.rect[3] + margin;
    const occupied: TrayRect[] = [this.magRect()];
    const { w: pw, h: ph } = model.def.dims;
    // the phone itself, plus room for a cover standing open on either side
    occupied.push({ x: phoneCenterX, y: 0, w: pw + 46, h: ph + 14 });
    for (const c of model.def.components) {
      const s = phone.comps[c.id]!;
      if (c.id === compId || s.state !== 'removed' || !s.tray) continue;
      occupied.push({ x: s.tray.x * 1000, y: -s.tray.z * 1000, w: c.rect[2] + margin, h: c.rect[3] + margin });
    }
    const overlaps = (x: number, y: number): boolean =>
      occupied.some((o) => Math.abs(o.x - x) < (o.w + fw) / 2 && Math.abs(o.y - y) < (o.h + fh) / 2);
    const xMin = -MAT_W / 2 + 12 + fw / 2;
    const xMax = MAT_W / 2 - 12 - fw / 2;
    const yMin = -MAT_H / 2 + 12 + fh / 2;
    const yMax = MAT_H / 2 - 12 - fh / 2;
    // scan columns outward from the phone, towards the left first, top to bottom
    const candidates: Array<[number, number]> = [];
    for (let x = phoneCenterX - pw / 2 - 30 - fw / 2; x >= xMin; x -= 9) {
      for (let y = yMax; y >= yMin; y -= 9) candidates.push([x, y]);
    }
    for (let x = phoneCenterX + pw / 2 + 30 + fw / 2; x <= xMax; x += 9) {
      for (let y = yMax; y >= yMin; y -= 9) candidates.push([x, y]);
    }
    for (const [x, y] of candidates) {
      if (!overlaps(x, y)) {
        cs.tray = { x: x / 1000, z: -y / 1000, r: 0 };
        return true;
      }
    }
    cs.tray = { x: xMin / 1000, z: -yMin / 1000, r: 0 };
    return false;
  }

  /** Clamp a dragged part inside the work mat. */
  clampToMat(x: number, y: number, w: number, h: number): [number, number] {
    return [
      Math.max(-MAT_W / 2 + w / 2 + 6, Math.min(MAT_W / 2 - w / 2 - 6, x)),
      Math.max(-MAT_H / 2 + h / 2 + 6, Math.min(MAT_H / 2 - h / 2 - 6, y)),
    ];
  }

  dispose(): void {
    this.root.removeFromParent();
    this.workMat.geometry.dispose();
    (this.workMat.material as THREE.Material).dispose();
    for (const t of this.textures) t.dispose();
    if (this.magMat) {
      this.magMat.geometry.dispose();
      const m = this.magMat.material as THREE.MeshStandardMaterial;
      m.map?.dispose();
      m.dispose();
    }
    this.cellHighlight.geometry.dispose();
    (this.cellHighlight.material as THREE.Material).dispose();
  }
}
