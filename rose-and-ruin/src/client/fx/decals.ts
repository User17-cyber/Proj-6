// Blood on the ground: splatters where blows land and pools that spread under the fallen.

import * as THREE from 'three';
import { prepare } from '../render/materials';

function splatAtlas(): THREE.Texture {
  const S = 256, c = document.createElement('canvas');
  c.width = S * 4; c.height = S;
  const x = c.getContext('2d')!;
  let seed = 31;
  const rnd = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
  for (let i = 0; i < 4; i++) {
    const cx = i * S + S / 2, cy = S / 2;
    x.fillStyle = '#fff';
    if (i === 3) {
      // pool: one big irregular blob
      x.beginPath();
      for (let k = 0; k <= 40; k++) {
        const a = (k / 40) * Math.PI * 2, r = S * (0.3 + 0.08 * Math.sin(a * 3 + 1) + 0.05 * Math.sin(a * 7) + rnd() * 0.03);
        if (k === 0) x.moveTo(cx + Math.cos(a) * r, cy + Math.sin(a) * r); else x.lineTo(cx + Math.cos(a) * r, cy + Math.sin(a) * r);
      }
      x.fill();
      continue;
    }
    for (let k = 0; k < 26; k++) {
      const a = rnd() * Math.PI * 2, d = Math.pow(rnd(), 1.6) * S * 0.42, r = (1 - d / (S * 0.45)) * S * 0.07 * (0.3 + rnd());
      x.beginPath(); x.arc(cx + Math.cos(a) * d, cy + Math.sin(a) * d, Math.max(1.5, r), 0, Math.PI * 2); x.fill();
    }
    x.beginPath(); x.arc(cx, cy, S * 0.12, 0, Math.PI * 2); x.fill();
  }
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.NoColorSpace;
  return t;
}

interface Decal { x: number; y: number; z: number; nx: number; ny: number; nz: number; size: number; target: number; grow: number; rot: number; frame: number; age: number }

export class Decals {
  readonly mesh: THREE.InstancedMesh;
  private list: Decal[] = [];
  private aFrame: THREE.InstancedBufferAttribute;
  private m = new THREE.Matrix4();
  private q = new THREE.Quaternion();
  constructor(private cap = 400) {
    const geo = new THREE.PlaneGeometry(1, 1);
    geo.rotateX(-Math.PI / 2);
    this.aFrame = new THREE.InstancedBufferAttribute(new Float32Array(cap * 2), 2);
    geo.setAttribute('aFrame', this.aFrame);
    const mat = new THREE.MeshStandardMaterial({ color: 0x3a0303, roughness: 0.25, metalness: 0, transparent: true, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -4, polygonOffsetUnits: -4, alphaMap: splatAtlas(), envMapIntensity: 1.2 });
    prepare(mat, [(s) => {
      s.vertexShader = s.vertexShader.replace('#include <common>', '#include <common>\nattribute vec2 aFrame; varying vec2 vFrame;').replace('#include <uv_vertex>', '#include <uv_vertex>\nvFrame = aFrame;');
      s.fragmentShader = s.fragmentShader
        .replace('#include <common>', '#include <common>\nvarying vec2 vFrame;')
        .replace('#include <alphamap_fragment>', 'diffuseColor.a *= texture2D(alphaMap, vec2((vAlphaMapUv.x + vFrame.x) / 4.0, vAlphaMapUv.y)).r * vFrame.y;\ndiffuseColor.rgb *= mix(0.55, 1.0, texture2D(alphaMap, vec2((vAlphaMapUv.x + vFrame.x) / 4.0, vAlphaMapUv.y)).r);');
    }], ['decal']);
    this.mesh = new THREE.InstancedMesh(geo, mat, cap);
    this.mesh.count = 0;
    this.mesh.frustumCulled = false;
    this.mesh.receiveShadow = true;
    this.mesh.renderOrder = 4;
  }

  add(x: number, y: number, z: number, n: { x: number; y: number; z: number }, size: number, pool = false) {
    const d: Decal = { x, y: y + 0.02, z, nx: n.x, ny: n.y, nz: n.z, size: pool ? 0.2 : size, target: size, grow: pool ? 0.18 : 100, rot: Math.random() * Math.PI * 2, frame: pool ? 3 : Math.floor(Math.random() * 3), age: 0 };
    if (this.list.length >= this.cap) this.list.shift();
    this.list.push(d);
  }

  update(dt: number) {
    const up = new THREE.Vector3(0, 1, 0);
    let i = 0;
    for (const d of this.list) {
      d.age += dt;
      if (d.size < d.target) d.size = Math.min(d.target, d.size + d.grow * dt);
      this.q.setFromUnitVectors(up, _n.set(d.nx, d.ny, d.nz));
      _r.setFromAxisAngle(up, d.rot);
      this.q.multiply(_r);
      this.m.compose(_p.set(d.x, d.y, d.z), this.q, _s.set(d.size, 1, d.size));
      this.mesh.setMatrixAt(i, this.m);
      // dries and darkens over a minute
      this.aFrame.setXY(i, d.frame, Math.max(0.55, 1 - d.age / 120));
      i++;
    }
    this.mesh.count = i;
    if (i) { this.mesh.instanceMatrix.needsUpdate = true; this.aFrame.needsUpdate = true; }
  }

  clear() { this.list.length = 0; }
}

const _n = new THREE.Vector3(), _p = new THREE.Vector3(), _s = new THREE.Vector3(), _r = new THREE.Quaternion();
