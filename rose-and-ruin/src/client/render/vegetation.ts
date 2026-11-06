// Trees (oak, birch, Scots pine) built from leaf cards with crown-spherical normals for soft,
// volumetric shading; hedgerows; and dense GPU-placed meadow grass around the camera.

import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import type { BuiltMap } from '../../shared/world/mapgen';
import { Rng } from '../../shared/rng';
import { pbr, prepare, G, noFlipPatch } from './materials';
import type { TextureBaker } from './textures';
import { NOISE_GLSL } from './glsl';

function leafAtlas(baker: TextureBaker): THREE.Texture {
  return baker.canvas('leaves', 1024, 512, (ctx, w, h) => {
    ctx.clearRect(0, 0, w, h);
    let seed = 4242;
    const rnd = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
    // left half: broadleaf cluster (oak-like lobed leaves)
    for (let i = 0; i < 260; i++) {
      const a = rnd() * Math.PI * 2, d = Math.sqrt(rnd()) * 0.42;
      const x = w * 0.25 + Math.cos(a) * d * w * 0.5, y = h * 0.5 + Math.sin(a) * d * h;
      const s = 9 + rnd() * 12;
      const shade = 0.55 + 0.45 * (1 - d / 0.42) * (0.7 + rnd() * 0.3);
      const hue = 85 + rnd() * 25, sat = 35 + rnd() * 25, lig = (16 + rnd() * 14) * shade + 6;
      ctx.save(); ctx.translate(x, y); ctx.rotate(rnd() * Math.PI * 2);
      ctx.fillStyle = `hsl(${hue},${sat}%,${lig}%)`;
      ctx.beginPath();
      for (let k = 0; k <= 12; k++) {
        const t = k / 12, ang = t * Math.PI * 2;
        const lobe = 1 + 0.18 * Math.sin(ang * 4);
        ctx.lineTo(Math.cos(ang) * s * 0.45 * lobe, Math.sin(ang) * s * lobe);
      }
      ctx.fill();
      ctx.strokeStyle = `hsla(${hue},${sat}%,${lig + 12}%,0.6)`; ctx.lineWidth = 1;
      ctx.beginPath(); ctx.moveTo(0, -s); ctx.lineTo(0, s); ctx.stroke();
      ctx.restore();
    }
    // twigs
    ctx.strokeStyle = 'rgba(50,38,26,0.9)'; ctx.lineWidth = 2;
    for (let i = 0; i < 8; i++) { ctx.beginPath(); ctx.moveTo(w * 0.25, h * 0.5); ctx.lineTo(w * 0.25 + (rnd() - 0.5) * w * 0.35, h * 0.5 + (rnd() - 0.5) * h * 0.7); ctx.stroke(); }
    // right half: pine needle tufts
    for (let i = 0; i < 70; i++) {
      const cx = w * 0.75 + (rnd() - 0.5) * w * 0.36, cy = h * 0.5 + (rnd() - 0.5) * h * 0.8;
      const n = 22;
      for (let k = 0; k < n; k++) {
        const ang = (k / n) * Math.PI * 2 + rnd() * 0.3, len = 10 + rnd() * 16;
        ctx.strokeStyle = `hsl(${100 + rnd() * 30},${30 + rnd() * 20}%,${12 + rnd() * 14}%)`; ctx.lineWidth = 1.6;
        ctx.beginPath(); ctx.moveTo(cx, cy); ctx.lineTo(cx + Math.cos(ang) * len, cy + Math.sin(ang) * len * 0.8); ctx.stroke();
      }
    }
  });
}

interface Tmpl { trunk: THREE.BufferGeometry; leaves: THREE.BufferGeometry; leavesFar: THREE.BufferGeometry; height: number }

function cardQuad(p: THREE.Vector3, size: number, rng: Rng, center: THREE.Vector3, atlasU: number, out: { pos: number[]; nrm: number[]; uv: number[]; idx: number[] }) {
  // random orientation facing roughly outward
  const n = p.clone().sub(center).normalize();
  const t = new THREE.Vector3(rng.range(-1, 1), rng.range(-1, 1), rng.range(-1, 1)).normalize();
  const u = new THREE.Vector3().crossVectors(n, t).normalize();
  const v = new THREE.Vector3().crossVectors(u, n).normalize();
  const tilt = new THREE.Quaternion().setFromAxisAngle(u, rng.range(-0.6, 0.6));
  v.applyQuaternion(tilt);
  const base = out.pos.length / 3;
  const corners: [number, number][] = [[-1, -1], [1, -1], [1, 1], [-1, 1]];
  for (const [a, b] of corners) {
    const q = p.clone().addScaledVector(u, a * size * 0.5).addScaledVector(v, b * size * 0.5);
    out.pos.push(q.x, q.y, q.z);
    // crown-spherical normal for soft lighting, slightly mixed with the card normal
    const sn = q.clone().sub(center).normalize().multiplyScalar(0.8).addScaledVector(n, 0.2).normalize();
    out.nrm.push(sn.x, sn.y, sn.z);
    out.uv.push(atlasU + (a * 0.5 + 0.5) * 0.5, b * 0.5 + 0.5);
  }
  out.idx.push(base, base + 1, base + 2, base, base + 2, base + 3);
}

function geoFrom(o: { pos: number[]; nrm: number[]; uv: number[]; idx: number[] }) {
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(o.pos, 3));
  g.setAttribute('normal', new THREE.Float32BufferAttribute(o.nrm, 3));
  g.setAttribute('uv', new THREE.Float32BufferAttribute(o.uv, 2));
  g.setIndex(o.idx);
  g.computeBoundingSphere();
  return g;
}

function limb(a: THREE.Vector3, b: THREE.Vector3, r0: number, r1: number): THREE.BufferGeometry {
  const len = a.distanceTo(b);
  const g = new THREE.CylinderGeometry(r1, r0, len, 8, 1, true);
  // bark UVs: v along length in metres
  const uv = g.attributes.uv as THREE.BufferAttribute;
  for (let i = 0; i < uv.count; i++) uv.setY(i, uv.getY(i) * len / 2.5);
  const q = new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 1, 0), b.clone().sub(a).normalize());
  const m = new THREE.Matrix4().compose(a.clone().add(b).multiplyScalar(0.5), q, new THREE.Vector3(1, 1, 1));
  g.applyMatrix4(m);
  return g;
}

function makeTree(kind: number, seed: number): Tmpl {
  const rng = new Rng(seed);
  const limbs: THREE.BufferGeometry[] = [];
  const near = { pos: [] as number[], nrm: [] as number[], uv: [] as number[], idx: [] as number[] };
  const far = { pos: [] as number[], nrm: [] as number[], uv: [] as number[], idx: [] as number[] };
  let height = 8;
  const V = (x: number, y: number, z: number) => new THREE.Vector3(x, y, z);
  if (kind === 2) {
    // Scots pine: tall bare trunk, flat crown
    height = rng.range(12, 15);
    const lean = V(rng.range(-0.6, 0.6), 0, rng.range(-0.6, 0.6));
    const top = V(lean.x, height, lean.z);
    limbs.push(limb(V(0, -0.5, 0), V(lean.x * 0.5, height * 0.6, lean.z * 0.5), 0.32, 0.22), limb(V(lean.x * 0.5, height * 0.6, lean.z * 0.5), top, 0.22, 0.08));
    const center = V(lean.x, height * 0.83, lean.z);
    for (let i = 0; i < 7; i++) {
      const a = rng.range(0, Math.PI * 2), y = rng.range(height * 0.62, height * 0.92);
      const s = V(lean.x * (y / height), y, lean.z * (y / height));
      const e = s.clone().add(V(Math.cos(a) * rng.range(1.5, 3), rng.range(0.2, 1.2), Math.sin(a) * rng.range(1.5, 3)));
      limbs.push(limb(s, e, 0.09, 0.03));
    }
    for (let i = 0; i < 130; i++) {
      const a = rng.range(0, Math.PI * 2), r = Math.sqrt(rng.next()) * 3.4;
      const p = V(center.x + Math.cos(a) * r, center.y + rng.range(-1.3, 1.6) * (1 - r / 5), center.z + Math.sin(a) * r);
      cardQuad(p, rng.range(1.3, 2.0), rng, center, 0.5, near);
      if (i % 5 === 0) cardQuad(p, 3.2, rng, center, 0.5, far);
    }
  } else if (kind === 1) {
    // silver birch
    height = rng.range(9, 12);
    const bend = V(rng.range(-0.8, 0.8), 0, rng.range(-0.8, 0.8));
    limbs.push(limb(V(0, -0.5, 0), V(bend.x * 0.4, height * 0.5, bend.z * 0.4), 0.18, 0.12), limb(V(bend.x * 0.4, height * 0.5, bend.z * 0.4), V(bend.x, height, bend.z), 0.12, 0.04));
    const center = V(bend.x * 0.7, height * 0.66, bend.z * 0.7);
    for (let i = 0; i < 9; i++) {
      const y = rng.range(height * 0.35, height * 0.9), a = rng.range(0, Math.PI * 2);
      const s = V(bend.x * y / height, y, bend.z * y / height);
      limbs.push(limb(s, s.clone().add(V(Math.cos(a) * 1.6, 1.4, Math.sin(a) * 1.6)), 0.05, 0.02));
    }
    for (let i = 0; i < 150; i++) {
      const dir = V(rng.range(-1, 1), rng.range(-1, 1), rng.range(-1, 1)).normalize();
      const r = Math.pow(rng.next(), 0.4);
      const p = center.clone().add(V(dir.x * 2.4 * r, dir.y * 3.6 * r, dir.z * 2.4 * r));
      cardQuad(p, rng.range(1.0, 1.5), rng, center, 0, near);
      if (i % 5 === 0) cardQuad(p, 2.6, rng, center, 0, far);
    }
  } else {
    // English oak: stout trunk, spreading boughs, broad crown
    height = rng.range(9, 13);
    const trunkTop = V(rng.range(-0.3, 0.3), rng.range(2.8, 3.8), rng.range(-0.3, 0.3));
    limbs.push(limb(V(0, -0.6, 0), trunkTop, 0.55, 0.38));
    const center = V(trunkTop.x, height * 0.62, trunkTop.z);
    const crownR = rng.range(4.2, 5.6);
    for (let i = 0; i < 6; i++) {
      const a = (i / 6) * Math.PI * 2 + rng.range(-0.4, 0.4);
      const mid = trunkTop.clone().add(V(Math.cos(a) * crownR * 0.45, rng.range(1.2, 2.4), Math.sin(a) * crownR * 0.45));
      const end = mid.clone().add(V(Math.cos(a) * crownR * 0.4, rng.range(1.0, 2.6), Math.sin(a) * crownR * 0.4));
      limbs.push(limb(trunkTop, mid, 0.3, 0.17), limb(mid, end, 0.17, 0.06));
    }
    for (let i = 0; i < 190; i++) {
      const dir = V(rng.range(-1, 1), rng.range(-0.55, 1), rng.range(-1, 1)).normalize();
      const r = Math.pow(rng.next(), 0.35);
      const p = center.clone().add(V(dir.x * crownR * r, dir.y * crownR * 0.75 * r, dir.z * crownR * r));
      cardQuad(p, rng.range(1.6, 2.4), rng, center, 0, near);
      if (i % 5 === 0) cardQuad(p, 4.0, rng, center, 0, far);
    }
  }
  const trunk = mergeGeometries(limbs.map((g) => g.toNonIndexed()), false)!;
  trunk.computeBoundingSphere();
  return { trunk, leaves: geoFrom(near), leavesFar: geoFrom(far), height };
}

function bush(seed: number): THREE.BufferGeometry {
  const rng = new Rng(seed);
  const o = { pos: [] as number[], nrm: [] as number[], uv: [] as number[], idx: [] as number[] };
  const center = new THREE.Vector3(0, 0.75, 0);
  for (let i = 0; i < 26; i++) {
    const dir = new THREE.Vector3(rng.range(-1, 1), rng.range(-0.3, 1), rng.range(-1, 1)).normalize();
    const p = center.clone().add(dir.multiply(new THREE.Vector3(0.9, 0.7, 0.9)).multiplyScalar(Math.pow(rng.next(), 0.4)));
    cardQuad(p, rng.range(0.9, 1.3), rng, center, 0, o);
  }
  return geoFrom(o);
}

/** Wind sway for foliage: displacement grows with height above the instance origin. */
const leafWind = (strength: number) => (s: THREE.WebGLProgramParametersWithUniforms) => {
  s.uniforms.uTime = G.uTime;
  s.uniforms.uWind = G.uWind;
  s.vertexShader = s.vertexShader
    .replace('#include <common>', '#include <common>\nuniform float uTime; uniform float uWind;')
    .replace('#include <begin_vertex>', /* glsl */ `#include <begin_vertex>
{
  vec3 ip = vec3(0.0);
  #ifdef USE_INSTANCING
    ip = instanceMatrix[3].xyz;
  #endif
  float h = max(position.y, 0.0);
  float w = uWind * ${strength.toFixed(2)};
  float ph = uTime * 1.3 + ip.x * 0.11 + ip.z * 0.07;
  transformed.x += sin(ph + position.y * 0.3) * 0.035 * h * w + sin(uTime * 4.1 + position.x * 2.0 + position.z) * 0.04 * w;
  transformed.z += cos(ph * 0.8 + position.y * 0.2) * 0.025 * h * w + cos(uTime * 3.7 + position.z * 2.0) * 0.04 * w;
}`);
};

export interface VegetationView { group: THREE.Group; update(cam: THREE.Camera, time: number): void; dispose(): void }

export function buildVegetation(map: BuiltMap, baker: TextureBaker, quality: number, heightTex: THREE.DataTexture, splatTex: THREE.DataTexture): VegetationView {
  const group = new THREE.Group();
  group.name = 'vegetation';
  const atlas = leafAtlas(baker);
  const bark = baker.get('bark', undefined, '', 0.5);
  const barkMat = pbr(bark, { color: 0xb8aea2 });
  const birchMat = pbr(bark, { color: 0xf0ece4, roughness: 0.9 });
  const leafMat = prepare(new THREE.MeshStandardMaterial({ map: atlas, alphaTest: 0.45, side: THREE.DoubleSide, roughness: 0.82, metalness: 0, color: 0xdde8c8, envMapIntensity: 0.7 }), [leafWind(1), noFlipPatch], ['leafwind']);
  const pineMat = prepare(new THREE.MeshStandardMaterial({ map: atlas, alphaTest: 0.45, side: THREE.DoubleSide, roughness: 0.85, metalness: 0, color: 0xc8d4bc, envMapIntensity: 0.6 }), [leafWind(0.6), noFlipPatch], ['leafwind6']);
  const depthMat = new THREE.MeshDepthMaterial({ depthPacking: THREE.RGBADepthPacking, map: atlas, alphaTest: 0.45, side: THREE.DoubleSide });

  const templates: Tmpl[][] = [[makeTree(0, 11), makeTree(0, 12), makeTree(0, 13)], [makeTree(1, 21), makeTree(1, 22)], [makeTree(2, 31), makeTree(2, 32)]];
  interface Batch { tmpl: Tmpl; kind: number; items: { m: THREE.Matrix4; x: number; z: number }[]; near: THREE.InstancedMesh; far: THREE.InstancedMesh; trunk: THREE.InstancedMesh }
  const batches: Batch[] = [];
  const rng = new Rng(9);
  const maxTrees = quality <= 0 ? 400 : quality === 1 ? 900 : 2000;
  const trees = map.trees.slice(0, maxTrees);
  const lists = new Map<Tmpl, { m: THREE.Matrix4; x: number; z: number; kind: number }[]>();
  for (const t of trees) {
    const set = templates[t.kind] ?? templates[0];
    const tm = set[Math.floor(rng.next() * set.length)];
    const m = new THREE.Matrix4().compose(new THREE.Vector3(t.x, t.y, t.z), new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), rng.range(0, Math.PI * 2)), new THREE.Vector3(t.s, t.s * rng.range(0.9, 1.1), t.s));
    (lists.get(tm) ?? lists.set(tm, []).get(tm)!).push({ m, x: t.x, z: t.z, kind: t.kind });
  }
  for (const [tmpl, items] of lists) {
    const kind = items[0].kind;
    const lm = kind === 2 ? pineMat : leafMat;
    const near = new THREE.InstancedMesh(tmpl.leaves, lm, items.length);
    const far = new THREE.InstancedMesh(tmpl.leavesFar, lm, items.length);
    const trunk = new THREE.InstancedMesh(tmpl.trunk, kind === 1 ? birchMat : barkMat, items.length);
    near.customDepthMaterial = depthMat; far.customDepthMaterial = depthMat;
    near.castShadow = quality >= 1; far.castShadow = false; trunk.castShadow = true;
    near.receiveShadow = true; far.receiveShadow = true; trunk.receiveShadow = true;
    items.forEach((it, i) => trunk.setMatrixAt(i, it.m));
    trunk.computeBoundingSphere();
    near.frustumCulled = false; far.frustumCulled = false;
    group.add(near, far, trunk);
    batches.push({ tmpl, kind, items, near, far, trunk });
  }

  // hedgerows
  const bushGeo = bush(5);
  const bushes: THREE.Matrix4[] = [];
  const t = map.world.terrain;
  for (const h of map.hedges) {
    for (let i = 0; i < h.pts.length - 1; i++) {
      const [ax, az] = h.pts[i], [bx, bz] = h.pts[i + 1];
      const len = Math.hypot(bx - ax, bz - az);
      const n = Math.ceil(len / 1.0);
      for (let k = 0; k < n; k++) {
        const u = (k + rng.next()) / n;
        const x = ax + (bx - ax) * u + rng.range(-0.25, 0.25), z = az + (bz - az) * u + rng.range(-0.25, 0.25);
        bushes.push(new THREE.Matrix4().compose(new THREE.Vector3(x, t.height(x, z) - 0.2, z), new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), rng.range(0, 6.28)), new THREE.Vector3(1, 1, 1).multiplyScalar(rng.range(0.9, 1.4) * (h.h / 1.6))));
      }
    }
  }
  if (bushes.length) {
    const bm = new THREE.InstancedMesh(bushGeo, leafMat, bushes.length);
    bushes.forEach((m, i) => bm.setMatrixAt(i, m));
    bm.customDepthMaterial = depthMat;
    bm.castShadow = quality >= 2; bm.receiveShadow = true;
    bm.computeBoundingSphere();
    group.add(bm);
  }

  // meadow grass
  const grass = quality >= 1 ? buildGrass(map, quality, heightTex, splatTex) : null;
  if (grass) { grass.mesh.name = 'grass'; grass.mesh.userData.noReflect = true; group.add(grass.mesh); }

  let lastX = Infinity, lastZ = Infinity;
  return {
    group,
    update(cam) {
      if (grass) grass.update(cam);
      const dx = cam.position.x - lastX, dz = cam.position.z - lastZ;
      if (dx * dx + dz * dz < 16) return;
      lastX = cam.position.x; lastZ = cam.position.z;
      const nearR2 = (quality >= 2 ? 140 : 90) ** 2;
      for (const b of batches) {
        let ni = 0, fi = 0;
        for (const it of b.items) {
          const d2 = (it.x - lastX) ** 2 + (it.z - lastZ) ** 2;
          if (d2 < nearR2) b.near.setMatrixAt(ni++, it.m); else b.far.setMatrixAt(fi++, it.m);
        }
        b.near.count = ni; b.far.count = fi;
        b.near.instanceMatrix.needsUpdate = true; b.far.instanceMatrix.needsUpdate = true;
      }
    },
    dispose() {
      for (const set of templates) for (const tm of set) { tm.trunk.dispose(); tm.leaves.dispose(); tm.leavesFar.dispose(); }
      bushGeo.dispose(); grass?.mesh.geometry.dispose();
    },
  };
}

function buildGrass(map: BuiltMap, quality: number, heightTex: THREE.DataTexture, splatTex: THREE.DataTexture) {
  const hf = map.world.terrain;
  // patches of blades around the camera; High keeps about 450k triangles, Ultra a million
  const grid = quality >= 3 ? 60 : quality === 2 ? 46 : 34;
  const cell = 1.25;
  const blades = quality >= 3 ? 48 : quality === 2 ? 36 : 26;
  // one patch of blades; each blade 3 segments (8 verts)
  const rng = new Rng(77);
  const pos: number[] = [], nrm: number[] = [], uv: number[] = [], data: number[] = [], idx: number[] = [], roots: number[] = [];
  for (let b = 0; b < blades; b++) {
    const px = rng.range(0, cell), pz = rng.range(0, cell);
    const ang = rng.range(0, Math.PI * 2);
    const h = rng.range(0.16, 0.48), w = rng.range(0.007, 0.016);
    const bend = rng.range(0.1, 0.35);
    const base = pos.length / 3;
    for (let s = 0; s <= 3; s++) {
      const t = s / 3;
      const ww = w * (1 - t * 0.85);
      for (const side of [-1, 1]) {
        const cx = Math.cos(ang), cz = Math.sin(ang);
        pos.push(px + -cz * ww * side + cx * bend * t * t * h, t * h, pz + cx * ww * side + cz * bend * t * t * h);
        nrm.push(cx * 0.3, 1, cz * 0.3);
        uv.push(side * 0.5 + 0.5, t);
        data.push(t, rng.next(), h, ang);
        roots.push(px, pz);
      }
    }
    for (let s = 0; s < 3; s++) {
      const a = base + s * 2;
      idx.push(a, a + 1, a + 3, a, a + 3, a + 2);
    }
  }
  const geo = new THREE.InstancedBufferGeometry();
  geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  geo.setAttribute('normal', new THREE.Float32BufferAttribute(nrm, 3));
  geo.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
  geo.setAttribute('bladeData', new THREE.Float32BufferAttribute(data, 4));
  geo.setAttribute('bladeRoot', new THREE.Float32BufferAttribute(roots, 2));
  geo.setIndex(idx);
  geo.instanceCount = grid * grid;
  geo.boundingSphere = new THREE.Sphere(new THREE.Vector3(), 1e5);
  const tint = new THREE.Vector3(...map.def.atmosphere.grassTint);
  const water = map.world.water.length ? Math.max(...map.world.water.map((w) => w.level)) : -999;
  const uCam = { value: new THREE.Vector2() };
  const mat = new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 1, metalness: 0, side: THREE.DoubleSide, envMapIntensity: 0.35 });
  prepare(mat, [(s) => {
    s.uniforms.tHeight = { value: heightTex };
    s.uniforms.tSplat = { value: splatTex };
    s.uniforms.uTerr = { value: new THREE.Vector4(hf.origin, hf.size, water, cell) };
    s.uniforms.uGridCam = uCam;
    s.uniforms.uGrid = { value: grid };
    s.uniforms.uTime = G.uTime;
    s.uniforms.uWind = G.uWind;
    s.uniforms.uWindDir = G.uWindDir;
    s.uniforms.uTint = { value: tint };
    s.vertexShader = s.vertexShader
      .replace('#include <common>', `#include <common>
uniform sampler2D tHeight; uniform sampler2D tSplat; uniform vec4 uTerr; uniform vec2 uGridCam; uniform float uGrid; uniform float uTime; uniform float uWind; uniform vec2 uWindDir; uniform vec3 uTint;
attribute vec4 bladeData; attribute vec2 bladeRoot;
varying vec3 vGrassCol; varying float vGrassT;
${NOISE_GLSL}`)
      .replace('#include <begin_vertex>', /* glsl */ `
float gi = float(gl_InstanceID);
vec2 gcell = vec2(mod(gi, uGrid), floor(gi / uGrid)) - uGrid * 0.5;
vec2 origin = (floor(uGridCam / uTerr.w) + gcell) * uTerr.w;
vec2 jit = hash22(origin * 0.731) * uTerr.w;
vec3 transformed = position;
vec2 wxz = origin + jit + position.xz;
vec2 tuv = (wxz - uTerr.x) / uTerr.y;
float gh = texture2D(tHeight, tuv).r;
vec4 sp = texture2D(tSplat, tuv);
float e = uTerr.y / 512.0;
float gx = texture2D(tHeight, tuv + vec2(1.0 / 512.0, 0.0)).r - gh;
float gz = texture2D(tHeight, tuv + vec2(0.0, 1.0 / 512.0)).r - gh;
float slope = length(vec2(gx, gz)) / e;
float dens = 1.0 - max(max(sp.r * 1.2, sp.g * 1.5), max(sp.b * 1.5, sp.a * 1.5));
dens *= 1.0 - smoothstep(0.55, 0.9, slope);
dens *= step(uTerr.z + 0.25, gh);
float patchN = vnoiseP(wxz * 0.21, vec2(1e4)) * 0.65 + vnoiseP(wxz * 0.9, vec2(1e4)) * 0.35;
dens *= smoothstep(0.18, 0.5, patchN + 0.25);
float dist = length(wxz - cameraPosition.xz);
float fade = 1.0 - smoothstep(uGrid * uTerr.w * 0.32, uGrid * uTerr.w * 0.48, dist);
float nearFade = smoothstep(0.6, 2.2, dist);
float keep = step(bladeData.y, dens * fade * 1.15);
float hScale = (0.55 + patchN * 0.9) * keep * clamp(dens * 1.6, 0.0, 1.0) * mix(0.25, 1.0, nearFade);
transformed.y *= hScale;
// collapse rejected blades entirely onto their root
transformed.xz = bladeRoot + (transformed.xz - bladeRoot) * hScale;
// wind
float t = bladeData.x;
float wv = sin(uTime * 2.1 + dot(wxz, uWindDir) * 0.45 + bladeData.y * 6.0) * 0.6 + sin(uTime * 3.7 + wxz.x * 1.3) * 0.25;
vec2 bendv = uWindDir * (wv * 0.5 + 0.55) * uWind * t * t * 0.32 * bladeData.z;
transformed.xz += bendv;
transformed.y -= length(bendv) * 0.4 * t;
transformed.xz += origin + jit;
transformed.y += gh - 0.02;
float shade = vnoiseP(wxz * 0.05, vec2(1e4));
vec3 c0 = vec3(0.03, 0.05, 0.012), c1 = mix(vec3(0.13, 0.19, 0.05), vec3(0.25, 0.25, 0.1), shade);
vGrassCol = mix(c0, c1, smoothstep(0.0, 1.0, t)) * uTint * (0.85 + 0.3 * bladeData.y);
vGrassT = t;
`)
      .replace('#include <beginnormal_vertex>', '#include <beginnormal_vertex>\nobjectNormal = normalize(vec3(objectNormal.x, 1.6, objectNormal.z));');
    s.fragmentShader = s.fragmentShader
      .replace('#include <common>', '#include <common>\nvarying vec3 vGrassCol; varying float vGrassT;')
      .replace('#include <map_fragment>', 'diffuseColor.rgb = vGrassCol;')
      .replace('#include <aomap_fragment>', '#include <aomap_fragment>\nreflectedLight.indirectDiffuse *= mix(0.35, 1.0, vGrassT);');
  }, noFlipPatch], ['grass' + grid]);
  const mesh = new THREE.Mesh(geo, mat);
  mesh.frustumCulled = false;
  mesh.receiveShadow = true;
  mesh.castShadow = false;
  return { mesh, update(cam: THREE.Camera) { uCam.value.set(cam.position.x, cam.position.z); } };
}
