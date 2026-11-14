/** Arte procedurale dei poster (canvas 2D, 512×720). */
type Ctx = CanvasRenderingContext2D;

export type PosterKind = 'sunset' | 'longtail' | 'repair';

const SANS = '"Avenir Next","Trebuchet MS","Segoe UI","Helvetica Neue",Arial,sans-serif';
const THAI = '"Thonburi","Leelawadee UI","Noto Sans Thai","Tahoma",sans-serif';

function karst(c: Ctx, x: number, base: number, w: number, h: number, fill: string): void {
  c.fillStyle = fill;
  c.beginPath();
  c.moveTo(x - w / 2, base);
  c.bezierCurveTo(x - w * 0.45, base - h * 0.7, x - w * 0.3, base - h * 1.02, x - w * 0.08, base - h);
  c.bezierCurveTo(x + w * 0.05, base - h * 1.08, x + w * 0.2, base - h * 0.9, x + w * 0.28, base - h * 0.72);
  c.bezierCurveTo(x + w * 0.42, base - h * 0.6, x + w * 0.46, base - h * 0.3, x + w / 2, base);
  c.closePath();
  c.fill();
}

function longtail(c: Ctx, x: number, y: number, s: number, hull: string, ribbons: boolean): void {
  c.save();
  c.translate(x, y);
  c.scale(s, s);
  c.fillStyle = hull;
  c.beginPath();
  c.moveTo(-120, 0);
  c.quadraticCurveTo(-20, 26, 90, 6);
  c.quadraticCurveTo(128, -8, 150, -58);
  c.quadraticCurveTo(118, -22, 80, -14);
  c.lineTo(-118, -12);
  c.closePath();
  c.fill();
  if (ribbons) {
    const cols = ['#f2705a', '#f6c94a', '#1fa7a0', '#f08fa8'];
    cols.forEach((col, i) => {
      c.strokeStyle = col;
      c.lineWidth = 5;
      c.beginPath();
      c.moveTo(138, -40);
      c.quadraticCurveTo(128 - i * 6, -10 + i * 6, 120 - i * 9, 14 + i * 5);
      c.stroke();
    });
    c.fillStyle = '#f4efe2';
    c.fillRect(-70, -42, 110, 6);
    c.fillRect(-64, -40, 5, 30);
    c.fillRect(30, -40, 5, 30);
  }
  c.strokeStyle = hull;
  c.lineWidth = 4;
  c.beginPath();
  c.moveTo(-110, -12);
  c.lineTo(-190, 12);
  c.stroke();
  c.restore();
}

function palm(c: Ctx, x: number, y: number, s: number, fill: string): void {
  c.save();
  c.translate(x, y);
  c.scale(s, s);
  c.strokeStyle = fill;
  c.fillStyle = fill;
  c.lineWidth = 16;
  c.lineCap = 'round';
  c.beginPath();
  c.moveTo(0, 0);
  c.quadraticCurveTo(30, -160, 90, -300);
  c.stroke();
  for (let i = 0; i < 7; i++) {
    const a = -2.9 + i * 0.5;
    c.beginPath();
    c.moveTo(90, -300);
    const ex = 90 + Math.cos(a) * 170;
    const ey = -300 + Math.sin(a) * 110 + 70;
    c.quadraticCurveTo(90 + Math.cos(a) * 110, -300 + Math.sin(a) * 130, ex, ey);
    c.quadraticCurveTo(90 + Math.cos(a) * 80, -300 + Math.sin(a) * 60 + 10, 90, -300);
    c.fill();
  }
  c.restore();
}

function paintSunset(c: Ctx, W: number, H: number): void {
  const g = c.createLinearGradient(0, 0, 0, H * 0.62);
  g.addColorStop(0, '#3b2a6e');
  g.addColorStop(0.45, '#d9507a');
  g.addColorStop(1, '#ffb347');
  c.fillStyle = g;
  c.fillRect(0, 0, W, H);
  // sole a strisce
  c.save();
  c.beginPath();
  c.arc(W / 2, H * 0.42, 150, 0, 6.283);
  c.clip();
  const sg = c.createLinearGradient(0, H * 0.42 - 150, 0, H * 0.42 + 150);
  sg.addColorStop(0, '#fff3a8');
  sg.addColorStop(1, '#ff6f61');
  c.fillStyle = sg;
  c.fillRect(0, 0, W, H);
  c.fillStyle = '#d9507a';
  for (let i = 0; i < 6; i++) c.fillRect(0, H * 0.42 + 10 + i * 26, W, 5 + i * 3);
  c.restore();
  karst(c, 90, H * 0.62, 190, 210, '#4a2a66');
  karst(c, 420, H * 0.62, 240, 150, '#5a3273');
  karst(c, 250, H * 0.62, 120, 70, '#6b3d80');
  // mare
  const mg = c.createLinearGradient(0, H * 0.62, 0, H * 0.86);
  mg.addColorStop(0, '#ff9a6a');
  mg.addColorStop(1, '#2a4a8a');
  c.fillStyle = mg;
  c.fillRect(0, H * 0.62, W, H * 0.3);
  c.fillStyle = 'rgba(255,240,180,0.55)';
  for (let i = 0; i < 9; i++) c.fillRect(W / 2 - 90 + i * 9 - i * i, H * 0.635 + i * 18, 180 - i * 18 + i * i * 2, 5);
  longtail(c, 300, H * 0.75, 0.9, '#2a1a40', false);
  palm(c, 30, H * 0.9, 1.05, '#24143a');
  c.fillStyle = '#24143a';
  c.fillRect(0, H * 0.86, W, H * 0.14);
  c.fillStyle = '#fff3d6';
  c.textAlign = 'center';
  c.font = `800 62px ${SANS}`;
  c.fillText('KOH PHI PHI', W / 2, H * 0.945);
  c.font = `600 24px ${SANS}`;
  c.fillStyle = '#ffb347';
  c.fillText('T H A I L A N D', W / 2, H * 0.985);
}

function paintLongtail(c: Ctx, W: number, H: number): void {
  c.fillStyle = '#f6efdc';
  c.fillRect(0, 0, W, H);
  c.save();
  c.beginPath();
  c.roundRect(26, 26, W - 52, H - 150, 18);
  c.clip();
  const g = c.createLinearGradient(0, 0, 0, H * 0.5);
  g.addColorStop(0, '#7fd3e6');
  g.addColorStop(1, '#e8f7ee');
  c.fillStyle = g;
  c.fillRect(0, 0, W, H);
  c.fillStyle = 'rgba(255,255,255,0.8)';
  for (const [x, y, r] of [[120, 110, 34], [160, 100, 44], [205, 114, 30], [380, 170, 26], [415, 162, 34]] as const) {
    c.beginPath();
    c.arc(x, y, r, 0, 6.283);
    c.fill();
  }
  karst(c, 400, 400, 300, 300, '#8fb5a0');
  karst(c, 130, 400, 230, 220, '#6fa387');
  karst(c, 300, 400, 150, 120, '#4f8f72');
  c.fillStyle = 'rgba(255,255,255,0.35)';
  for (let i = 0; i < 14; i++) c.fillRect(60 + ((i * 97) % 380), 250 + ((i * 53) % 130), 4, 30 + ((i * 31) % 50));
  const mg = c.createLinearGradient(0, 400, 0, 580);
  mg.addColorStop(0, '#2fc4c0');
  mg.addColorStop(1, '#8fe6d6');
  c.fillStyle = mg;
  c.fillRect(0, 400, W, 200);
  c.strokeStyle = 'rgba(255,255,255,0.7)';
  c.lineWidth = 3;
  for (let i = 0; i < 7; i++) {
    c.beginPath();
    const y = 425 + i * 22;
    c.moveTo(60 + ((i * 131) % 250), y);
    c.quadraticCurveTo(100 + ((i * 131) % 250), y - 6, 150 + ((i * 131) % 250), y);
    c.stroke();
  }
  longtail(c, 250, 500, 1.15, '#8a4a2a', true);
  c.fillStyle = '#f3e3b8';
  c.beginPath();
  c.moveTo(0, 600);
  c.quadraticCurveTo(W * 0.5, 540, W, 580);
  c.lineTo(W, H);
  c.lineTo(0, H);
  c.fill();
  c.restore();
  c.fillStyle = '#1f6f78';
  c.textAlign = 'center';
  c.font = `800 60px ${SANS}`;
  c.fillText('ISLAND LIFE', W / 2, H - 70);
  c.fillStyle = '#f2705a';
  c.font = `bold 30px ${THAI}`;
  c.fillText('ชีวิตเกาะ · slow & sunny', W / 2, H - 30);
}

function paintRepair(c: Ctx, W: number, H: number): void {
  c.fillStyle = '#f4e9cf';
  c.fillRect(0, 0, W, H);
  c.save();
  c.translate(W / 2, H * 0.47);
  for (let i = 0; i < 24; i++) {
    c.fillStyle = i % 2 ? '#f2705a' : '#f6c94a';
    c.beginPath();
    c.moveTo(0, 0);
    c.arc(0, 0, 520, (i / 24) * 6.283, ((i + 1) / 24) * 6.283);
    c.fill();
  }
  c.restore();
  c.fillStyle = 'rgba(244,233,207,0.55)';
  c.fillRect(0, 0, W, H);
  // esploso del telefono: strati sfalsati
  const layer = (dy: number, fill: string, draw?: () => void): void => {
    c.save();
    c.translate(W / 2, H * 0.47 + dy);
    c.transform(1, -0.28, 0.55, 0.55, 0, 0);
    c.fillStyle = 'rgba(0,0,0,0.16)';
    c.beginPath();
    c.roundRect(-92, -180 + 14, 200, 380, 30);
    c.fill();
    c.fillStyle = fill;
    c.beginPath();
    c.roundRect(-100, -190, 200, 380, 30);
    c.fill();
    draw?.();
    c.restore();
  };
  layer(150, '#39424a', () => {
    c.fillStyle = '#20262b';
    c.beginPath();
    c.roundRect(-78, -168, 60, 60, 14);
    c.fill();
  });
  layer(70, '#2f8f5a', () => {
    c.fillStyle = '#1d1e21';
    c.fillRect(-80, -160, 70, 120);
    c.fillStyle = '#d9d9d9';
    c.fillRect(-70, -150, 50, 40);
    c.fillStyle = '#111';
    c.beginPath();
    c.roundRect(0, -150, 80, 250, 10);
    c.fill();
    c.fillStyle = '#f6c94a';
    c.fillRect(10, -40, 60, 8);
    c.fillStyle = '#d9a23a';
    c.fillRect(-80, 110, 160, 50);
  });
  layer(-20, '#1fa7a0', () => {
    c.strokeStyle = 'rgba(255,255,255,0.5)';
    c.lineWidth = 6;
    c.strokeRect(-82, -172, 164, 344);
  });
  layer(-110, '#14181c', () => {
    c.fillStyle = '#8fe6d6';
    c.beginPath();
    c.roundRect(-88, -178, 176, 356, 22);
    c.fill();
    c.fillStyle = 'rgba(255,255,255,0.55)';
    c.beginPath();
    c.moveTo(-88, -60);
    c.lineTo(40, -178);
    c.lineTo(88, -178);
    c.lineTo(-88, 10);
    c.fill();
  });
  // viti
  c.fillStyle = '#39424a';
  for (const [x, y] of [[90, 250], [410, 300], [70, 470], [440, 520], [420, 150]] as const) {
    c.beginPath();
    c.arc(x, y, 9, 0, 6.283);
    c.fill();
    c.fillStyle = '#f4e9cf';
    c.fillRect(x - 6, y - 1.5, 12, 3);
    c.fillRect(x - 1.5, y - 6, 3, 12);
    c.fillStyle = '#39424a';
  }
  c.fillStyle = '#24406e';
  c.textAlign = 'center';
  c.font = `900 96px ${SANS}`;
  c.fillText('FIX IT!', W / 2, 104);
  c.fillStyle = '#f4e9cf';
  c.fillRect(40, H - 112, W - 80, 84);
  c.fillStyle = '#d9392c';
  c.font = `800 34px ${SANS}`;
  c.fillText("DON'T DITCH IT", W / 2, H - 74);
  c.fillStyle = '#24406e';
  c.font = `bold 26px ${THAI}`;
  c.fillText('ซ่อมได้ · si ripara!', W / 2, H - 42);
}

export function paintPoster(kind: PosterKind, c: Ctx, W: number, H: number): void {
  if (kind === 'sunset') paintSunset(c, W, H);
  else if (kind === 'longtail') paintLongtail(c, W, H);
  else paintRepair(c, W, H);
  // grana della carta
  for (let i = 0; i < 500; i++) {
    c.fillStyle = i % 2 ? 'rgba(255,255,255,0.05)' : 'rgba(0,0,0,0.04)';
    c.fillRect((i * 7919) % W, (i * 104729) % H, 2 + (i % 3), 2);
  }
}
