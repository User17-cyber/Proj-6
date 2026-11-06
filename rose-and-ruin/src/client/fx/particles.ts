// CPU-simulated, GPU-drawn billboard particles: blood spray and mist, armour sparks, dust,
// smoke, fire and embers. Two instanced draws (alpha-blended and additive).

import * as THREE from 'three';
import { G } from '../render/materials';

export const enum PK { Blood = 0, Mist = 1, Spark = 2, Dust = 3, Smoke = 4, Fire = 5, Ember = 6, Splash = 7 }

interface P { kind: PK; x: number; y: number; z: number; vx: number; vy: number; vz: number; life: number; max: number; size: number; grow: number; rot: number; spin: number; r: number; g: number; b: number; a: number; drag: number; grav: number }

function spriteAtlas(): THREE.Texture {
  // 4x2 atlas: soft dot, smoke puff, spark streak, blood drop, flame, splat, dust, ember
  const S = 128, c = document.createElement('canvas');
  c.width = S * 4; c.height = S * 2;
  const x = c.getContext('2d')!;
  const cell = (i: number, f: (cx: number, cy: number) => void) => { const cx = (i % 4) * S + S / 2, cy = Math.floor(i / 4) * S + S / 2; x.save(); f(cx, cy); x.restore(); };
  const radial = (cx: number, cy: number, r: number, stops: [number, string][]) => { const g = x.createRadialGradient(cx, cy, 0, cx, cy, r); for (const [o, col] of stops) g.addColorStop(o, col); x.fillStyle = g; x.beginPath(); x.arc(cx, cy, r, 0, Math.PI * 2); x.fill(); };
  let seed = 7;
  const rnd = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
  cell(0, (cx, cy) => radial(cx, cy, 60, [[0, 'rgba(255,255,255,1)'], [0.4, 'rgba(255,255,255,0.5)'], [1, 'rgba(255,255,255,0)']]));
  cell(1, (cx, cy) => { for (let i = 0; i < 14; i++) radial(cx + (rnd() - 0.5) * 50, cy + (rnd() - 0.5) * 50, 22 + rnd() * 26, [[0, 'rgba(255,255,255,0.35)'], [1, 'rgba(255,255,255,0)']]); });
  cell(2, (cx, cy) => { const g = x.createLinearGradient(cx, cy - 60, cx, cy + 60); g.addColorStop(0, 'rgba(255,255,255,0)'); g.addColorStop(0.5, 'rgba(255,255,255,1)'); g.addColorStop(1, 'rgba(255,255,255,0)'); x.fillStyle = g; x.fillRect(cx - 5, cy - 60, 10, 120); });
  cell(3, (cx, cy) => { radial(cx, cy, 30, [[0, 'rgba(255,255,255,1)'], [0.7, 'rgba(255,255,255,0.9)'], [1, 'rgba(255,255,255,0)']]); });
  cell(4, (cx, cy) => { for (let i = 0; i < 9; i++) radial(cx + (rnd() - 0.5) * 24, cy + 10 - i * 6 + (rnd() - 0.5) * 8, 30 - i * 2.5, [[0, 'rgba(255,255,255,0.5)'], [1, 'rgba(255,255,255,0)']]); });
  cell(5, (cx, cy) => { for (let i = 0; i < 18; i++) radial(cx + (rnd() - 0.5) * 70, cy + (rnd() - 0.5) * 70, 4 + rnd() * 14, [[0, 'rgba(255,255,255,1)'], [0.8, 'rgba(255,255,255,0.95)'], [1, 'rgba(255,255,255,0)']]); });
  cell(6, (cx, cy) => { for (let i = 0; i < 10; i++) radial(cx + (rnd() - 0.5) * 60, cy + (rnd() - 0.5) * 40, 18 + rnd() * 22, [[0, 'rgba(255,255,255,0.4)'], [1, 'rgba(255,255,255,0)']]); });
  cell(7, (cx, cy) => radial(cx, cy, 20, [[0, 'rgba(255,255,255,1)'], [1, 'rgba(255,255,255,0)']]));
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

const FRAME: Record<PK, number> = { [PK.Blood]: 3, [PK.Mist]: 0, [PK.Spark]: 2, [PK.Dust]: 6, [PK.Smoke]: 1, [PK.Fire]: 4, [PK.Ember]: 7, [PK.Splash]: 5 };

const VERT = /* glsl */ `
attribute vec4 iPos;    // xyz, size
attribute vec4 iColor;  // rgba
attribute vec4 iMisc;   // rot, frame, stretch, kind
attribute vec3 iVel;
varying vec2 vUv; varying vec4 vColor; varying float vKind;
uniform vec3 uCamRight; uniform vec3 uCamUp;
void main() {
  vec2 q = position.xy;
  float c = cos(iMisc.x), s = sin(iMisc.x);
  vec3 wp;
  if (iMisc.z > 0.0) {
    // velocity-aligned streak (sparks, blood spray)
    vec3 dir = normalize(iVel + vec3(1e-5));
    vec3 viewDir = normalize(cameraPosition - iPos.xyz);
    vec3 side = normalize(cross(dir, viewDir));
    wp = iPos.xyz + side * q.x * iPos.w * 0.35 + dir * q.y * iPos.w * (1.0 + iMisc.z);
  } else {
    vec2 r = vec2(q.x * c - q.y * s, q.x * s + q.y * c);
    wp = iPos.xyz + (uCamRight * r.x + uCamUp * r.y) * iPos.w;
  }
  float fr = iMisc.y;
  vUv = (vec2(mod(fr, 4.0), 1.0 - floor(fr / 4.0)) + (q * 0.5 + 0.5) * vec2(1.0, 1.0)) / vec2(4.0, 2.0);
  vUv.y = vUv.y - 0.5 * 0.0;
  vColor = iColor; vKind = iMisc.w;
  gl_Position = projectionMatrix * viewMatrix * vec4(wp, 1.0);
}`;
const FRAG = /* glsl */ `
uniform sampler2D uTex; uniform vec3 uAmbient;
varying vec2 vUv; varying vec4 vColor; varying float vKind;
void main() {
  vec4 t = texture2D(uTex, vUv);
  vec4 c = vColor * t;
  if (c.a < 0.004) discard;
  gl_FragColor = c;
}`;

class Pool {
  readonly mesh: THREE.Mesh;
  private geo: THREE.InstancedBufferGeometry;
  private aPos: THREE.InstancedBufferAttribute; private aCol: THREE.InstancedBufferAttribute; private aMisc: THREE.InstancedBufferAttribute; private aVel: THREE.InstancedBufferAttribute;
  readonly list: P[] = [];
  constructor(readonly cap: number, tex: THREE.Texture, additive: boolean, uni: Record<string, THREE.IUniform>) {
    const base = new THREE.PlaneGeometry(2, 2);
    this.geo = new THREE.InstancedBufferGeometry();
    this.geo.index = base.index;
    this.geo.setAttribute('position', base.attributes.position);
    this.aPos = new THREE.InstancedBufferAttribute(new Float32Array(cap * 4), 4).setUsage(THREE.DynamicDrawUsage) as THREE.InstancedBufferAttribute;
    this.aCol = new THREE.InstancedBufferAttribute(new Float32Array(cap * 4), 4).setUsage(THREE.DynamicDrawUsage) as THREE.InstancedBufferAttribute;
    this.aMisc = new THREE.InstancedBufferAttribute(new Float32Array(cap * 4), 4).setUsage(THREE.DynamicDrawUsage) as THREE.InstancedBufferAttribute;
    this.aVel = new THREE.InstancedBufferAttribute(new Float32Array(cap * 3), 3).setUsage(THREE.DynamicDrawUsage) as THREE.InstancedBufferAttribute;
    this.geo.setAttribute('iPos', this.aPos); this.geo.setAttribute('iColor', this.aCol); this.geo.setAttribute('iMisc', this.aMisc); this.geo.setAttribute('iVel', this.aVel);
    this.geo.instanceCount = 0;
    this.geo.boundingSphere = new THREE.Sphere(new THREE.Vector3(), 1e5);
    const mat = new THREE.ShaderMaterial({
      vertexShader: VERT, fragmentShader: FRAG,
      uniforms: { ...uni, uTex: { value: tex } },
      transparent: true, depthWrite: false,
      blending: additive ? THREE.AdditiveBlending : THREE.NormalBlending,
    });
    this.mesh = new THREE.Mesh(this.geo, mat);
    this.mesh.frustumCulled = false;
    this.mesh.renderOrder = additive ? 20 : 19;
  }
  add(p: P) { if (this.list.length < this.cap) this.list.push(p); else this.list[Math.floor(Math.random() * this.cap)] = p; }
  update(dt: number, ambient: number, ground: (x: number, z: number) => number) {
    const L = this.list;
    let n = 0;
    for (let i = L.length - 1; i >= 0; i--) {
      const p = L[i];
      p.life -= dt;
      if (p.life <= 0) { L[i] = L[L.length - 1]; L.pop(); continue; }
      p.vy -= p.grav * dt;
      const d = Math.exp(-p.drag * dt);
      p.vx *= d; p.vy *= d; p.vz *= d;
      p.x += p.vx * dt; p.y += p.vy * dt; p.z += p.vz * dt;
      p.size += p.grow * dt; p.rot += p.spin * dt;
      if (p.kind === PK.Blood || p.kind === PK.Spark || p.kind === PK.Ember) {
        const g = ground(p.x, p.z);
        if (p.y < g) { p.y = g + 0.01; p.vy *= -0.2; p.vx *= 0.3; p.vz *= 0.3; if (p.kind === PK.Blood) p.life = Math.min(p.life, 0.05); }
      }
    }
    for (const p of L) {
      const u = p.life / p.max;
      let a = p.a;
      let br = 1;
      if (p.kind === PK.Fire) { a *= Math.min(1, (1 - u) * 6) * u; }
      else if (p.kind === PK.Smoke || p.kind === PK.Dust || p.kind === PK.Mist) a *= Math.min(1, (1 - u) * 5) * u;
      else if (p.kind === PK.Spark || p.kind === PK.Ember) { a *= u; br = 1 + u * 2; }
      else a *= Math.min(1, u * 3);
      const lit = p.kind === PK.Fire || p.kind === PK.Spark || p.kind === PK.Ember ? 1 : ambient;
      this.aPos.setXYZW(n, p.x, p.y, p.z, p.size);
      this.aCol.setXYZW(n, p.r * br * lit, p.g * br * lit, p.b * br * lit, a);
      const sp = Math.hypot(p.vx, p.vy, p.vz);
      const stretch = p.kind === PK.Spark ? Math.min(6, sp * 0.06) : p.kind === PK.Blood && sp > 2 ? Math.min(2.5, sp * 0.12) : 0;
      this.aMisc.setXYZW(n, p.rot, FRAME[p.kind], stretch, p.kind);
      this.aVel.setXYZ(n, p.vx, p.vy, p.vz);
      n++;
    }
    this.geo.instanceCount = n;
    if (n) { this.aPos.needsUpdate = true; this.aCol.needsUpdate = true; this.aMisc.needsUpdate = true; this.aVel.needsUpdate = true; }
  }
}

export class Particles {
  readonly group = new THREE.Group();
  private alpha: Pool;
  private add: Pool;
  private uni = { uCamRight: { value: new THREE.Vector3() }, uCamUp: { value: new THREE.Vector3() }, uAmbient: { value: new THREE.Vector3(1, 1, 1) } };
  ambient = 0.6;
  quality = 2;

  constructor(cap = 4000) {
    const tex = spriteAtlas();
    this.alpha = new Pool(cap, tex, false, this.uni);
    this.add = new Pool(Math.floor(cap / 2), tex, true, this.uni);
    this.group.add(this.alpha.mesh, this.add.mesh);
  }

  clear() { this.alpha.list.length = 0; this.add.list.length = 0; }

  spawn(kind: PK, x: number, y: number, z: number, vx: number, vy: number, vz: number, life: number, size: number, color: [number, number, number, number], o: Partial<P> = {}) {
    const p: P = { kind, x, y, z, vx, vy, vz, life, max: life, size, grow: 0, rot: Math.random() * 6.28, spin: 0, r: color[0], g: color[1], b: color[2], a: color[3], drag: 0.5, grav: 0, ...o };
    (kind === PK.Spark || kind === PK.Fire || kind === PK.Ember ? this.add : this.alpha).add(p);
  }

  /** Blood from a wound: spray along the blow, droplets falling, a little mist. */
  blood(x: number, y: number, z: number, dx: number, dy: number, dz: number, amount: number) {
    const n = Math.round((6 + amount * 22) * (this.quality >= 2 ? 1 : 0.5));
    for (let i = 0; i < n; i++) {
      const s = 1.5 + Math.random() * 4.5 * amount;
      const jx = (Math.random() - 0.5) * 2, jy = Math.random() * 1.2, jz = (Math.random() - 0.5) * 2;
      this.spawn(PK.Blood, x, y, z, dx * s + jx, dy * s + jy + 1.2, dz * s + jz, 0.5 + Math.random() * 0.6, 0.012 + Math.random() * 0.03, [0.32, 0.015, 0.01, 0.95], { grav: 9.8, drag: 0.4 });
    }
    for (let i = 0; i < 3 + amount * 4; i++) {
      this.spawn(PK.Mist, x + (Math.random() - 0.5) * 0.1, y, z + (Math.random() - 0.5) * 0.1, dx * 0.8 + (Math.random() - 0.5) * 0.6, 0.3 + Math.random() * 0.4, dz * 0.8 + (Math.random() - 0.5) * 0.6, 0.5 + Math.random() * 0.4, 0.08 + amount * 0.12, [0.26, 0.01, 0.01, 0.55], { grow: 0.5, drag: 2.5 });
    }
  }

  /** Steel on steel: a shower of sparks and a flash. */
  sparks(x: number, y: number, z: number, nx: number, ny: number, nz: number, big: boolean) {
    const n = big ? 34 : 16;
    for (let i = 0; i < n; i++) {
      const s = 2.5 + Math.random() * (big ? 7 : 4.5);
      this.spawn(PK.Spark, x, y, z, nx * s + (Math.random() - 0.5) * 5, ny * s + Math.random() * 3, nz * s + (Math.random() - 0.5) * 5, 0.25 + Math.random() * 0.45, 0.012 + Math.random() * 0.012, [3.2, 1.9, 0.7, 1], { grav: 9.8, drag: 0.8 });
    }
    this.spawn(PK.Mist, x, y, z, 0, 0, 0, 0.09, big ? 0.5 : 0.3, [4, 3, 1.8, 0.9]);
    this.spawn(PK.Fire, x, y, z, 0, 0, 0, 0.06, big ? 0.35 : 0.22, [5, 3.4, 1.6, 1]);
  }

  dust(x: number, y: number, z: number, amount: number, color: [number, number, number] = [0.45, 0.4, 0.33]) {
    const n = Math.round(2 + amount * 10);
    const alpha = 0.14 + 0.3 * Math.min(1, amount);
    for (let i = 0; i < n; i++) {
      const a = Math.random() * Math.PI * 2, s = Math.random() * 2.5 * amount;
      this.spawn(PK.Dust, x + Math.cos(a) * 0.3, y + 0.1, z + Math.sin(a) * 0.3, Math.cos(a) * s, 0.3 + Math.random() * 0.8 * amount, Math.sin(a) * s, 1.0 + Math.random() * 1.2, 0.22 + Math.random() * 0.5 * amount, [color[0], color[1], color[2], alpha], { grow: 0.35 + amount * 0.6, drag: 1.6, spin: (Math.random() - 0.5) });
    }
  }

  fire(x: number, y: number, z: number, scale: number, dt: number) {
    if (Math.random() < 18 * dt * scale) this.spawn(PK.Fire, x + (Math.random() - 0.5) * 0.2 * scale, y, z + (Math.random() - 0.5) * 0.2 * scale, (Math.random() - 0.5) * 0.3, 0.9 + Math.random() * 0.8, (Math.random() - 0.5) * 0.3, 0.45 + Math.random() * 0.35, 0.22 * scale, [3.0, 1.35, 0.4, 0.85], { grow: -0.2 * scale, spin: (Math.random() - 0.5) * 2 });
    if (Math.random() < 3 * dt) this.spawn(PK.Smoke, x, y + 0.5 * scale, z, (Math.random() - 0.5) * 0.2 + G.uWindDir.value.x * 0.6, 0.8 + Math.random() * 0.4, (Math.random() - 0.5) * 0.2 + G.uWindDir.value.y * 0.6, 3 + Math.random() * 2, 0.4 * scale, [0.2, 0.19, 0.18, 0.35], { grow: 0.7, drag: 0.3 });
    if (Math.random() < 2.5 * dt) this.spawn(PK.Ember, x, y + 0.2, z, (Math.random() - 0.5) * 0.8, 1.5 + Math.random() * 1.5, (Math.random() - 0.5) * 0.8, 1.2 + Math.random(), 0.012, [3, 1.2, 0.3, 1], { grav: -0.3, drag: 0.6 });
  }

  update(dt: number, cam: THREE.Camera, ground: (x: number, z: number) => number) {
    this.uni.uCamRight.value.setFromMatrixColumn(cam.matrixWorld, 0);
    this.uni.uCamUp.value.setFromMatrixColumn(cam.matrixWorld, 1);
    this.alpha.update(dt, this.ambient, ground);
    this.add.update(dt, 1, ground);
  }
}
