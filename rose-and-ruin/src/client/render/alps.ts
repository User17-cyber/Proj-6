// Backdrops for a castle among the mountains: a ring of snow-capped peaks on the horizon, and a
// sea of cloud filling the valleys below the summit, drifting slowly.

import * as THREE from 'three';
import { Noise2 } from '../../shared/rng';
import { prepare } from './materials';

/** A ring of jagged, snow-capped mountains far beyond the field. `height`: the tallest peaks. */
export function buildAlps(height: number, seed: number, haze: THREE.Color): THREE.Mesh {
  const noise = new Noise2(seed);
  const around = 480, radial = 48, r0 = 2200, r1 = 5600;
  const pos: number[] = [], col: number[] = [], idx: number[] = [];
  const rock = new THREE.Color(0.2, 0.22, 0.26), forest = new THREE.Color(0.07, 0.1, 0.08), snow = new THREE.Color(0.93, 0.95, 1.0);
  const c = new THREE.Color();
  const hAt = (x: number, z: number, r: number) => {
    const rise = THREE.MathUtils.smoothstep(r, r0, r0 + 900) * (1 - THREE.MathUtils.smoothstep(r, r1 - 700, r1));
    // broad massifs, their crests broken into ridges and summits
    const mass = THREE.MathUtils.clamp(0.55 + 0.9 * noise.fbm(x / 2200 + 7, z / 2200, 3), 0, 1);
    const ridge = noise.ridged(x / 1400, z / 1400, 4);
    const h = mass * (0.45 + 0.55 * ridge);
    return Math.max(0, Math.pow(h, 1.6) * height * rise - 40);
  };
  for (let i = 0; i <= radial; i++) {
    const r = r0 + (r1 - r0) * Math.pow(i / radial, 1.2);
    for (let a = 0; a <= around; a++) {
      const th = (a / around) * Math.PI * 2;
      const x = Math.cos(th) * r, z = Math.sin(th) * r;
      const y = hAt(x, z, r);
      pos.push(x, y, z);
      // slope from neighbouring samples decides rock or snow
      const dh = Math.abs(hAt(x + 40, z, r) - y) + Math.abs(hAt(x, z + 40, r) - y);
      const steep = THREE.MathUtils.clamp(dh / 70, 0, 1);
      const line = height * (0.3 + 0.06 * noise.fbm(x / 500, z / 500, 2));
      const sn = THREE.MathUtils.smoothstep(y, line - 40, line + 80) * (1 - steep * 0.55);
      const fo = 1 - THREE.MathUtils.smoothstep(y, height * 0.05, height * 0.16);
      c.copy(rock).lerp(forest, fo).lerp(snow, sn);
      // the air between: the further and lower, the more the haze
      c.lerp(haze, THREE.MathUtils.clamp(0.12 + (r - r0) / (r1 - r0) * 0.35 - (y / height) * 0.15, 0.06, 0.45));
      col.push(c.r, c.g, c.b);
    }
  }
  const W = around + 1;
  for (let i = 0; i < radial; i++) for (let a = 0; a < around; a++) {
    const i0 = i * W + a, i1 = i0 + 1, i2 = i0 + W, i3 = i2 + 1;
    idx.push(i0, i2, i1, i1, i2, i3);
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('color', new THREE.Float32BufferAttribute(col, 3));
  g.setIndex(idx);
  g.computeVertexNormals();
  g.computeBoundingSphere();
  const mat = prepare(new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.92, metalness: 0, envMapIntensity: 0.8 }), [], ['alps'], { fog: false });
  const m = new THREE.Mesh(g, mat);
  m.name = 'alps';
  m.frustumCulled = false;
  m.receiveShadow = false; m.castShadow = false;
  m.userData.noReflect = true;
  return m;
}

/** Billowing cloud filling the valleys up to height `top`, in two drifting layers. */
export function buildCloudSea(top: number, seed: number): { group: THREE.Group; update: (dt: number) => void } {
  const noise = new Noise2(seed ^ 0x51ab);
  const N = 512;
  const cv = document.createElement('canvas');
  cv.width = cv.height = N;
  const ctx = cv.getContext('2d')!;
  const img = ctx.createImageData(N, N);
  for (let y = 0; y < N; y++) for (let x = 0; x < N; x++) {
    const u = x / N, v = y / N;
    const d = Math.hypot(u - 0.5, v - 0.5) * 2;
    let f = noise.fbm(u * 9, v * 9, 5) * 0.75 + 0.5;
    f = THREE.MathUtils.smoothstep(f, 0.38, 0.78);
    const edge = 1 - THREE.MathUtils.smoothstep(d, 0.75, 1);
    const o = (y * N + x) * 4;
    const sh = 0.88 + 0.12 * f;
    img.data[o] = 255 * sh; img.data[o + 1] = 255 * sh; img.data[o + 2] = 255 * Math.min(1, sh + 0.03);
    img.data[o + 3] = 255 * f * edge;
  }
  ctx.putImageData(img, 0, 0);
  const tex = new THREE.CanvasTexture(cv);
  tex.colorSpace = THREE.SRGBColorSpace;
  const group = new THREE.Group();
  group.name = 'cloud-sea';
  const layers: THREE.Mesh[] = [];
  const size = 5200;
  for (let i = 0; i < 4; i++) {
    const mat = new THREE.MeshLambertMaterial({ map: tex, transparent: true, depthWrite: false, opacity: [0.85, 0.7, 0.55, 0.45][i], side: THREE.DoubleSide, color: 0xf4f6fa, emissive: 0x9aa3ae, emissiveIntensity: 0.55 });
    prepare(mat, [], ['cloudsea']);
    const m = new THREE.Mesh(new THREE.PlaneGeometry(size * (1 - i * 0.06), size * (1 - i * 0.06)), mat);
    m.rotation.x = -Math.PI / 2;
    m.rotation.z = i * 1.3;
    m.position.y = top - i * 7;
    m.renderOrder = 2;
    m.userData.noReflect = true;
    m.frustumCulled = false;
    group.add(m);
    layers.push(m);
  }
  return {
    group,
    update(dt) { layers.forEach((m, i) => { m.rotation.z += dt * (0.0016 + i * 0.0006) * (i % 2 ? -1 : 1); }); },
  };
}
