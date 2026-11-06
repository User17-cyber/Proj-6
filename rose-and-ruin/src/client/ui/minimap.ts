// Minimap: a hill-shaded parchment chart of the map, baked once, drawn rotated around the
// viewer with knights, objectives and the player's heading.

import type { BuiltMap } from '../../shared/world/mapgen';
import type { KnightState, ObjectiveView } from '../game/session';
import { TEAM_CSS_LIGHT } from '../render/heraldry';

const BAKE = 768;

export class Minimap {
  readonly canvas: HTMLCanvasElement;
  private ctx: CanvasRenderingContext2D;
  private bg: HTMLCanvasElement;
  private x0: number; private z0: number; private span: number;
  /** metres shown across the minimap */
  range = 120;

  constructor(private map: BuiltMap, sizePx: number) {
    this.canvas = document.createElement('canvas');
    const dpr = Math.min(2, window.devicePixelRatio || 1);
    this.canvas.width = this.canvas.height = Math.round(sizePx * dpr);
    this.ctx = this.canvas.getContext('2d')!;
    const b = map.world.bounds;
    this.span = Math.max(b.maxX - b.minX, b.maxZ - b.minZ) + 80;
    this.x0 = (b.minX + b.maxX) / 2 - this.span / 2;
    this.z0 = (b.minZ + b.maxZ) / 2 - this.span / 2;
    this.bg = this.bake();
  }

  private bake(): HTMLCanvasElement {
    const c = document.createElement('canvas');
    c.width = c.height = BAKE;
    const g = c.getContext('2d')!;
    const W = this.map.world, T = W.terrain;
    const img = g.createImageData(BAKE, BAKE);
    const d = img.data;
    const px = this.span / BAKE;
    const sea = this.map.seaLevel;
    for (let j = 0; j < BAKE; j++) {
      for (let i = 0; i < BAKE; i++) {
        const x = this.x0 + (i + 0.5) * px, z = this.z0 + (j + 0.5) * px;
        const h = T.height(x, z);
        const hx = T.height(x + px, z) - T.height(x - px, z);
        const hz = T.height(x, z + px) - T.height(x, z - px);
        // light from the north-west, like an old chart
        let shade = 0.78 + (-hx * 0.7 - hz * 0.7) / (2 * px) * 0.45;
        shade = Math.max(0.45, Math.min(1.15, shade));
        // parchment base, darker inked lowlands, warm highlands
        let r = 196, gg = 178, bb = 140;
        const fx = Math.max(0, Math.min(T.n - 1, Math.round((x - T.origin) / T.cell)));
        const fz = Math.max(0, Math.min(T.n - 1, Math.round((z - T.origin) / T.cell)));
        const pi = (fz * T.n + fx) * 4;
        const dirt = T.paint[pi] / 255, cob = T.paint[pi + 1] / 255, sand = T.paint[pi + 2] / 255, rock = T.paint[pi + 3] / 255;
        r -= 26 * (1 - dirt - cob - sand - rock); gg -= 14 * (1 - dirt - cob - sand - rock); bb -= 30 * (1 - dirt - cob - sand - rock); // grass: olive
        r += 8 * dirt - 4 * cob + 18 * sand - 22 * rock; gg += 2 * dirt - 6 * cob + 14 * sand - 20 * rock; bb += -6 * dirt + 4 * cob + 6 * sand - 12 * rock;
        let wr = 0;
        const wb = W.waterAt(x, z);
        if (wb && wb.level > h) wr = Math.min(1, (wb.level - h) * 0.8 + 0.45);
        else if (sea !== null && h < sea) wr = Math.min(1, (sea - h) * 0.4 + 0.5);
        r = r * shade; gg = gg * shade; bb = bb * shade;
        if (wr > 0) { r = r * (1 - wr) + 62 * wr; gg = gg * (1 - wr) + 88 * wr; bb = bb * (1 - wr) + 100 * wr; }
        // contour lines every 4 m
        const ci = Math.abs((h / 4) % 1);
        if (ci < 0.06 && wr === 0) { r *= 0.88; gg *= 0.88; bb *= 0.86; }
        const o = (j * BAKE + i) * 4;
        d[o] = r; d[o + 1] = gg; d[o + 2] = bb; d[o + 3] = 255;
      }
    }
    g.putImageData(img, 0, 0);
    // structures: inked stone
    const s = BAKE / this.span;
    const tx = (x: number) => (x - this.x0) * s, tz = (z: number) => (z - this.z0) * s;
    for (const p of W.platforms) {
      g.save();
      g.translate(tx(p.cx), tz(p.cz));
      g.rotate(-p.rot);
      g.fillStyle = 'rgba(120, 86, 52, 0.85)';
      g.fillRect(-p.hx * s, -p.hz * s, p.hx * 2 * s, p.hz * 2 * s);
      g.restore();
    }
    for (const c of W.colliders) {
      if (c.y1 - c.y0 < 1.6) continue;
      const tall = Math.min(1, (c.y1 - c.y0) / 14);
      g.fillStyle = `rgba(${58 - tall * 18}, ${50 - tall * 16}, ${44 - tall * 14}, 0.92)`;
      if (c.kind === 1) {
        g.beginPath(); g.arc(tx(c.cx), tz(c.cz), Math.max(1, c.r * s), 0, Math.PI * 2); g.fill();
      } else {
        g.save();
        g.translate(tx(c.cx), tz(c.cz));
        // local->world: x' = lx*c + lz*s, z' = -lx*s + lz*c (see StaticWorld)
        g.transform(c.c, -c.s, c.s, c.c, 0, 0);
        g.fillRect(-c.hx * s, -c.hz * s, Math.max(1, c.hx * 2 * s), Math.max(1, c.hz * 2 * s));
        g.restore();
      }
    }
    // aged edge
    const grad = g.createRadialGradient(BAKE / 2, BAKE / 2, BAKE * 0.3, BAKE / 2, BAKE / 2, BAKE * 0.75);
    grad.addColorStop(0, 'rgba(60,40,10,0)');
    grad.addColorStop(1, 'rgba(60,40,10,0.35)');
    g.fillStyle = grad;
    g.fillRect(0, 0, BAKE, BAKE);
    return c;
  }

  /** Whole-map chart for the scoreboard / spawn screen. */
  chart(): HTMLCanvasElement { return this.bg; }

  draw(cx: number, cz: number, heading: number, viewerTeam: number, knights: KnightState[], objectives: ObjectiveView[], localId: number, showAll: boolean) {
    const g = this.ctx;
    const W = this.canvas.width;
    const scale = W / this.range; // px per metre
    g.save();
    g.clearRect(0, 0, W, W);
    g.fillStyle = '#2a2219';
    g.fillRect(0, 0, W, W);
    g.translate(W / 2, W / 2);
    // forward (heading) points up: world forward is (-sin h, -cos h)
    g.rotate(heading);
    const bs = this.span * scale;
    g.drawImage(this.bg, (this.x0 - cx) * scale, (this.z0 - cz) * scale, bs, bs);
    // objectives
    for (let i = 0; i < objectives.length; i++) {
      const o = objectives[i];
      const x = (o.def.x - cx) * scale, z = (o.def.z - cz) * scale;
      g.beginPath();
      g.arc(x, z, Math.max(6, o.def.r * scale), 0, Math.PI * 2);
      g.fillStyle = o.owner === 0 ? 'rgba(179,38,42,0.35)' : o.owner === 1 ? 'rgba(61,99,184,0.35)' : 'rgba(230,220,190,0.25)';
      g.fill();
      g.lineWidth = 2;
      g.strokeStyle = o.contested ? '#f1d488' : 'rgba(0,0,0,0.6)';
      g.stroke();
      g.save();
      g.translate(x, z);
      g.rotate(-heading);
      g.fillStyle = '#fff';
      g.font = `bold ${Math.round(W * 0.07)}px Cinzel, serif`;
      g.textAlign = 'center'; g.textBaseline = 'middle';
      g.shadowColor = '#000'; g.shadowBlur = 3;
      g.fillText(o.def.short, 0, 1);
      g.restore();
    }
    // knights
    const r = Math.max(2.2, W * 0.014);
    const me = localId >= 0 ? knights[localId] : null;
    for (const k of knights) {
      if (!k.alive || k.id === localId) continue;
      const ally = k.team === viewerTeam;
      if (!ally && !showAll) {
        // enemies appear when an ally or the player can see them close by
        const dx = k.x - cx, dz = k.z - cz;
        if (dx * dx + dz * dz > 38 * 38) continue;
      }
      const x = (k.x - cx) * scale, z = (k.z - cz) * scale;
      if (Math.abs(x) > W * 0.75 || Math.abs(z) > W * 0.75) continue;
      g.beginPath();
      g.arc(x, z, ally || showAll ? r : r * 1.1, 0, Math.PI * 2);
      g.fillStyle = TEAM_CSS_LIGHT[k.team];
      g.fill();
      g.lineWidth = 1.2;
      g.strokeStyle = 'rgba(0,0,0,0.75)';
      g.stroke();
    }
    g.restore();
    // the viewer: an arrow pointing up
    g.save();
    g.translate(W / 2, W / 2);
    g.fillStyle = me ? '#f1d488' : '#e8dbbd';
    g.strokeStyle = '#000';
    g.lineWidth = 2;
    g.beginPath();
    const a = W * 0.045;
    g.moveTo(0, -a * 1.3); g.lineTo(a * 0.85, a); g.lineTo(0, a * 0.45); g.lineTo(-a * 0.85, a); g.closePath();
    g.stroke(); g.fill();
    g.restore();
    // vignette ring
    const grad = g.createRadialGradient(W / 2, W / 2, W * 0.36, W / 2, W / 2, W * 0.5);
    grad.addColorStop(0, 'rgba(0,0,0,0)');
    grad.addColorStop(1, 'rgba(0,0,0,0.55)');
    g.fillStyle = grad;
    g.fillRect(0, 0, W, W);
  }
}
