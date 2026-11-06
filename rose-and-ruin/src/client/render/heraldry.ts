// Heraldry drawn on canvas: the red rose of Lancaster and the white rose of York, on
// banners, tabards and shields.

import * as THREE from 'three';

/** [primary field, secondary/metal] per team (linear-ish sRGB hex). */
export const TEAM_COLORS: [number, number][] = [
  [0x8a1a1c, 0xc99a34], // Lancaster: gules and or
  [0x1c3570, 0xe6e1d4], // York: azure and argent
];
export const TEAM_CSS = ['#b3262a', '#3d63b8'];
export const TEAM_CSS_LIGHT = ['#e0574f', '#7aa0f0'];

const hex = (n: number) => '#' + n.toString(16).padStart(6, '0');

export function drawRose(ctx: CanvasRenderingContext2D, cx: number, cy: number, r: number, petal: string, petalDark: string) {
  ctx.save();
  ctx.translate(cx, cy);
  // sepals (barbs) between the outer petals
  ctx.fillStyle = '#3d5a22';
  for (let i = 0; i < 5; i++) {
    ctx.save();
    ctx.rotate((i / 5) * Math.PI * 2 + Math.PI / 5);
    ctx.beginPath();
    ctx.moveTo(-r * 0.12, -r * 0.55);
    ctx.quadraticCurveTo(0, -r * 1.12, r * 0.12, -r * 0.55);
    ctx.fill();
    ctx.restore();
  }
  const ring = (rad: number, pr: number, col: string, dark: string, off: number) => {
    for (let i = 0; i < 5; i++) {
      const a = (i / 5) * Math.PI * 2 + off - Math.PI / 2;
      const px = Math.cos(a) * rad, py = Math.sin(a) * rad;
      const g = ctx.createRadialGradient(px * 0.6, py * 0.6, pr * 0.1, px, py, pr);
      g.addColorStop(0, col); g.addColorStop(1, dark);
      ctx.fillStyle = g;
      ctx.beginPath();
      // heart-shaped petal: two lobes
      ctx.arc(px + Math.cos(a + 1.57) * pr * 0.32, py + Math.sin(a + 1.57) * pr * 0.32, pr * 0.72, 0, Math.PI * 2);
      ctx.arc(px - Math.cos(a + 1.57) * pr * 0.32, py - Math.sin(a + 1.57) * pr * 0.32, pr * 0.72, 0, Math.PI * 2);
      ctx.fill();
      ctx.strokeStyle = 'rgba(0,0,0,0.35)'; ctx.lineWidth = r * 0.02;
      ctx.stroke();
    }
  };
  ring(r * 0.5, r * 0.5, petal, petalDark, 0);
  ring(r * 0.27, r * 0.3, petal, petalDark, Math.PI / 5);
  // seeds
  ctx.fillStyle = '#d9a72c';
  ctx.beginPath(); ctx.arc(0, 0, r * 0.15, 0, Math.PI * 2); ctx.fill();
  ctx.fillStyle = '#7a4f12';
  for (let i = 0; i < 9; i++) {
    const a = (i / 9) * Math.PI * 2;
    ctx.beginPath(); ctx.arc(Math.cos(a) * r * 0.09, Math.sin(a) * r * 0.09, r * 0.025, 0, Math.PI * 2); ctx.fill();
  }
  ctx.restore();
}

function clothNoise(ctx: CanvasRenderingContext2D, w: number, h: number, amt = 0.08) {
  const img = ctx.getImageData(0, 0, w, h);
  const d = img.data;
  let seed = 1234567;
  const rnd = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    const i = (y * w + x) * 4;
    const n = 1 + (rnd() - 0.5) * amt + Math.sin(y * 0.9) * amt * 0.3;
    d[i] *= n; d[i + 1] *= n; d[i + 2] *= n;
  }
  ctx.putImageData(img, 0, 0);
}

export function roseColors(team: number): [string, string] {
  return team === 0 ? ['#c21e2b', '#6b0c14'] : ['#f4f0e6', '#bdb5a3'];
}

/** Hanging banner (portrait). */
export function drawBanner(ctx: CanvasRenderingContext2D, w: number, h: number, team: number) {
  const [field, metal] = TEAM_COLORS[team];
  ctx.fillStyle = hex(field); ctx.fillRect(0, 0, w, h);
  const g = ctx.createLinearGradient(0, 0, w, 0);
  g.addColorStop(0, 'rgba(0,0,0,0.25)'); g.addColorStop(0.5, 'rgba(255,255,255,0.05)'); g.addColorStop(1, 'rgba(0,0,0,0.25)');
  ctx.fillStyle = g; ctx.fillRect(0, 0, w, h);
  // border
  ctx.strokeStyle = hex(metal); ctx.lineWidth = w * 0.05;
  ctx.strokeRect(w * 0.06, w * 0.06, w * 0.88, h - w * 0.12);
  // swallowtail-ish dagged bottom
  ctx.fillStyle = 'rgba(0,0,0,0)';
  ctx.globalCompositeOperation = 'destination-out';
  ctx.beginPath(); ctx.moveTo(w * 0.3, h); ctx.lineTo(w * 0.5, h * 0.9); ctx.lineTo(w * 0.7, h); ctx.closePath(); ctx.fill();
  ctx.globalCompositeOperation = 'source-over';
  const [p, pd] = roseColors(team);
  drawRose(ctx, w / 2, h * 0.36, w * 0.34, p, pd);
  if (team === 1) {
    // sun in splendour of Edward IV behind the lower charge
    ctx.save(); ctx.translate(w / 2, h * 0.7); ctx.fillStyle = hex(0xd9a72c);
    for (let i = 0; i < 16; i++) { ctx.rotate(Math.PI / 8); ctx.beginPath(); ctx.moveTo(-w * 0.03, 0); ctx.lineTo(0, -w * 0.22); ctx.lineTo(w * 0.03, 0); ctx.fill(); }
    ctx.beginPath(); ctx.arc(0, 0, w * 0.1, 0, Math.PI * 2); ctx.fill(); ctx.restore();
  } else {
    // portcullis badge of the Beauforts
    ctx.save(); ctx.translate(w / 2, h * 0.7); ctx.strokeStyle = hex(metal); ctx.lineWidth = w * 0.025;
    for (let i = -2; i <= 2; i++) { ctx.beginPath(); ctx.moveTo(i * w * 0.06, -w * 0.15); ctx.lineTo(i * w * 0.06, w * 0.17); ctx.stroke(); }
    for (let j = -1; j <= 2; j++) { ctx.beginPath(); ctx.moveTo(-w * 0.15, j * w * 0.08); ctx.lineTo(w * 0.15, j * w * 0.08); ctx.stroke(); }
    ctx.restore();
  }
  clothNoise(ctx, w, h);
}

/** Tabard / surcoat: field colour with the rose on the chest (centre of the texture). */
export function drawTabard(ctx: CanvasRenderingContext2D, w: number, h: number, team: number) {
  const [field, metal] = TEAM_COLORS[team];
  ctx.fillStyle = hex(field); ctx.fillRect(0, 0, w, h);
  ctx.fillStyle = hex(metal);
  ctx.fillRect(0, h * 0.94, w, h * 0.06);
  const [p, pd] = roseColors(team);
  // u = 0.5 is the front of the chest, u = 0 / 1 the back
  drawRose(ctx, w * 0.5, h * 0.56, w * 0.085, p, pd);
  drawRose(ctx, 0, h * 0.56, w * 0.07, p, pd);
  drawRose(ctx, w, h * 0.56, w * 0.07, p, pd);
  // a darker band of the metal colour down the edges and an embroidered hem
  ctx.fillStyle = hex(metal);
  ctx.fillRect(0, h * 0.965, w, h * 0.035);
  clothNoise(ctx, w, h, 0.12);
}

/** Heater shield face. */
export function drawShield(ctx: CanvasRenderingContext2D, w: number, h: number, team: number, variant: number) {
  const [field, metal] = TEAM_COLORS[team];
  ctx.fillStyle = hex(field); ctx.fillRect(0, 0, w, h);
  ctx.fillStyle = hex(metal);
  if (variant % 3 === 1) { ctx.fillRect(0, h * 0.42, w, h * 0.16); }
  else if (variant % 3 === 2) { ctx.beginPath(); ctx.moveTo(0, 0); ctx.lineTo(w * 0.18, 0); ctx.lineTo(w, h * 0.82); ctx.lineTo(w, h); ctx.lineTo(w * 0.82, h); ctx.lineTo(0, h * 0.18); ctx.fill(); }
  const [p, pd] = roseColors(team);
  drawRose(ctx, w / 2, h * 0.45, w * 0.3, p, pd);
  // scuffs
  ctx.strokeStyle = 'rgba(30,20,10,0.35)';
  let seed = 99 + variant * 13;
  const rnd = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
  for (let i = 0; i < 14; i++) { ctx.lineWidth = 1 + rnd() * 2; ctx.beginPath(); const x = rnd() * w, y = rnd() * h; ctx.moveTo(x, y); ctx.lineTo(x + (rnd() - 0.5) * w * 0.3, y + (rnd() - 0.5) * h * 0.2); ctx.stroke(); }
  clothNoise(ctx, w, h, 0.1);
}

export function canvasTexture(w: number, h: number, draw: (ctx: CanvasRenderingContext2D, w: number, h: number) => void): THREE.CanvasTexture {
  const c = document.createElement('canvas');
  c.width = w; c.height = h;
  draw(c.getContext('2d')!, w, h);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = 8;
  t.generateMipmaps = true;
  return t;
}

/** Data URL of a rose badge for the UI. */
export function roseDataUrl(team: number, size = 128): string {
  const c = document.createElement('canvas');
  c.width = c.height = size;
  const [p, pd] = roseColors(team);
  drawRose(c.getContext('2d')!, size / 2, size / 2, size * 0.46, p, pd);
  return c.toDataURL();
}
