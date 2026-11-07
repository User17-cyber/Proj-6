// Terrain: chunked heightfield mesh with distance LODs and skirts, a five-layer splat shader
// (turf, trodden earth, cobbles, sand, rock) with height-based blending, slope rock, wetness
// near water and anti-tiling, plus a far ring of hills out to the horizon.

import * as THREE from 'three';
import type { BuiltMap } from '../../shared/world/mapgen';
import type { Heightfield } from '../../shared/world/world';
import { Noise2 } from '../../shared/rng';
import { prepare, G } from './materials';
import type { TextureBaker } from './textures';
import { NOISE_GLSL } from './glsl';

const CHUNK = 64;

export interface TerrainView {
  group: THREE.Group;
  heightTex: THREE.DataTexture;
  splatTex: THREE.DataTexture;
  update(cam: THREE.Camera): void;
  dispose(): void;
}

export function heightTexture(hf: Heightfield): THREE.DataTexture {
  const data = new Uint16Array(hf.n * hf.n);
  for (let i = 0; i < data.length; i++) data[i] = THREE.DataUtils.toHalfFloat(hf.h[i]);
  const t = new THREE.DataTexture(data, hf.n, hf.n, THREE.RedFormat, THREE.HalfFloatType);
  t.minFilter = THREE.LinearFilter; t.magFilter = THREE.LinearFilter;
  t.wrapS = t.wrapT = THREE.ClampToEdgeWrapping;
  t.flipY = false;
  t.needsUpdate = true;
  return t;
}

function splatTexture(hf: Heightfield): THREE.DataTexture {
  const t = new THREE.DataTexture(hf.paint, hf.n, hf.n, THREE.RGBAFormat, THREE.UnsignedByteType);
  t.minFilter = THREE.LinearFilter; t.magFilter = THREE.LinearFilter;
  t.wrapS = t.wrapT = THREE.ClampToEdgeWrapping;
  t.flipY = false;
  t.needsUpdate = true;
  return t;
}

function chunkGeometry(hf: Heightfield, x0: number, z0: number, step: number, skirt: number): THREE.BufferGeometry {
  const segs = Math.round(CHUNK / step);
  const n = segs + 1;
  const vcount = n * n + 4 * n;
  const pos = new Float32Array(vcount * 3);
  const nrm = new Float32Array(vcount * 3);
  const idx: number[] = [];
  const tmp = { x: 0, y: 0, z: 0 };
  let v = 0;
  for (let j = 0; j < n; j++) for (let i = 0; i < n; i++) {
    const x = x0 + i * step, z = z0 + j * step;
    pos[v * 3] = x; pos[v * 3 + 1] = hf.height(x, z); pos[v * 3 + 2] = z;
    hf.normal(x, z, tmp);
    nrm[v * 3] = tmp.x; nrm[v * 3 + 1] = tmp.y; nrm[v * 3 + 2] = tmp.z;
    v++;
  }
  for (let j = 0; j < segs; j++) for (let i = 0; i < segs; i++) {
    const a = j * n + i, b = a + 1, c = a + n, d = c + 1;
    // alternate the diagonal for a less regular look
    if ((i + j) & 1) idx.push(a, c, b, b, c, d); else idx.push(a, c, d, a, d, b);
  }
  // skirts hide cracks between LODs
  const edge = (getIdx: (k: number) => number, flip: boolean) => {
    const start = v;
    for (let k = 0; k < n; k++) {
      const s = getIdx(k);
      pos[v * 3] = pos[s * 3]; pos[v * 3 + 1] = pos[s * 3 + 1] - skirt; pos[v * 3 + 2] = pos[s * 3 + 2];
      nrm[v * 3] = nrm[s * 3]; nrm[v * 3 + 1] = nrm[s * 3 + 1]; nrm[v * 3 + 2] = nrm[s * 3 + 2];
      v++;
    }
    for (let k = 0; k < n - 1; k++) {
      const a = getIdx(k), b = getIdx(k + 1), c = start + k, d = start + k + 1;
      // both windings: skirts must hide cracks from either side
      idx.push(a, b, c, b, d, c, a, c, b, b, c, d);
    }
    void flip;
  };
  edge((k) => k, false);
  edge((k) => (n - 1) * n + k, true);
  edge((k) => k * n, true);
  edge((k) => k * n + n - 1, false);
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  g.setAttribute('normal', new THREE.BufferAttribute(nrm, 3));
  g.setIndex(idx);
  g.computeBoundingSphere();
  g.computeBoundingBox();
  return g;
}

/** Shader patch that turns a MeshStandardMaterial into the splatted terrain surface. */
function terrainPatch(o: { albedo: THREE.Texture; normal: THREE.Texture; splat: THREE.Texture; origin: number; size: number; water: number; tint: THREE.Vector3; far: boolean }) {
  return (s: THREE.WebGLProgramParametersWithUniforms) => {
    s.uniforms.tAlb = { value: o.albedo };
    s.uniforms.tNrm = { value: o.normal };
    s.uniforms.tSplat = { value: o.splat };
    s.uniforms.uTerr = { value: new THREE.Vector4(o.origin, o.size, o.water, o.far ? 1 : 0) };
    s.uniforms.uGrassTint = { value: o.tint };
    s.vertexShader = s.vertexShader
      .replace('#include <common>', '#include <common>\nvarying vec3 vTW; varying vec3 vTN;')
      .replace('#include <worldpos_vertex>', '#include <worldpos_vertex>\nvTW = (modelMatrix * vec4(transformed, 1.0)).xyz; vTN = normalize(mat3(modelMatrix) * objectNormal);');
    s.fragmentShader = s.fragmentShader
      .replace('#include <common>', `#include <common>
precision highp sampler2DArray;
uniform sampler2DArray tAlb; uniform sampler2DArray tNrm; uniform sampler2D tSplat; uniform vec4 uTerr; uniform vec3 uGrassTint;
varying vec3 vTW; varying vec3 vTN;
${NOISE_GLSL}
vec3 rrTN; float rrRough;
vec4 tri(sampler2DArray t, float layer, vec3 p, vec3 w, float sc) {
  return texture(t, vec3(p.zy * sc, layer)) * w.x + texture(t, vec3(p.xz * sc, layer)) * w.y + texture(t, vec3(p.xy * sc, layer)) * w.z;
}
// anti-tiling: two lookups at rotated/scaled UVs blended by a macro noise
vec4 at(sampler2DArray t, float layer, vec2 uv, float k) {
  vec2 uv2 = mat2(0.8, -0.6, 0.6, 0.8) * uv * 0.71 + 0.37;
  return mix(texture(t, vec3(uv, layer)), texture(t, vec3(uv2, layer)), k);
}
`)
      .replace('#include <map_fragment>', /* glsl */ `
vec3 tw = vTW; vec3 tn = normalize(vTN);
vec2 suv = (tw.xz - uTerr.x) / uTerr.y;
vec4 sp = uTerr.w > 0.5 ? vec4(0.0) : texture2D(tSplat, clamp(suv, 0.0, 1.0));
float mac = vnoiseP(tw.xz * 0.018, vec2(1e4)) * 0.6 + vnoiseP(tw.xz * 0.07, vec2(1e4)) * 0.4;
float mac2 = vnoiseP(tw.xz * 0.11 + 31.0, vec2(1e4));
float dist = length(tw - cameraPosition);
float slope = 1.0 - tn.y;
float wRock = max(sp.a, smoothstep(0.32, 0.55, slope + (mac2 - 0.5) * 0.12));
float wSand = sp.b;
float wCob = sp.g;
float wDirt = sp.r;
// worn ground around paths: break the paint edge with noise
wDirt = clamp(wDirt * (0.75 + 0.5 * mac2) + smoothstep(0.78, 0.95, mac) * 0.25, 0.0, 1.0);
float k = smoothstep(0.35, 0.65, mac);
vec2 uvG = tw.xz / 3.2, uvD = tw.xz / 4.5, uvC = tw.xz / 3.0, uvS = tw.xz / 5.0;
vec4 aG = at(tAlb, 0.0, uvG, k), nG = at(tNrm, 0.0, uvG, k);
vec4 aD = at(tAlb, 1.0, uvD, k), nD = at(tNrm, 1.0, uvD, k);
vec4 aC = texture(tAlb, vec3(uvC, 2.0)), nC = texture(tNrm, vec3(uvC, 2.0));
vec4 aS = at(tAlb, 3.0, uvS, k), nS = at(tNrm, 3.0, uvS, k);
vec3 tw3 = pow(abs(tn), vec3(4.0)); tw3 /= dot(tw3, vec3(1.0));
vec4 aR = mix(tri(tAlb, 4.0, tw, tw3, 1.0 / 7.0), tri(tAlb, 4.0, tw, tw3, 1.0 / 23.0), 0.45), nR = tri(tNrm, 4.0, tw, tw3, 1.0 / 7.0);
aR.rgb *= mix(0.55, 1.05, smoothstep(0.2, 0.8, vnoiseP(tw.xy * 0.13 + tw.zy * 0.11, vec2(1e4)))) * (1.0 - 0.35 * smoothstep(0.45, 0.85, slope));
// distant: fold in a larger scale lookup to hide repetition
float far = smoothstep(25.0, 140.0, dist);
if (far > 0.01) {
  aG = mix(aG, texture(tAlb, vec3(uvG * 0.23, 0.0)), far * 0.6);
  aD = mix(aD, texture(tAlb, vec3(uvD * 0.25, 1.0)), far * 0.5);
}
// height-weighted blend (AO channel is a good height proxy)
float hG = nG.a, hD = nD.a, hC = nC.a, hS = nS.a, hR = nR.a;
float wG = 1.0;
float bw[5];
bw[0] = wG * (1.0 - wDirt) * (1.0 - wCob) * (1.0 - wSand) * (1.0 - wRock);
bw[1] = wDirt * (1.0 - wCob) * (1.0 - wRock);
bw[2] = wCob * (1.0 - wRock);
bw[3] = wSand * (1.0 - wRock) * (1.0 - wCob);
bw[4] = wRock;
float hh[5]; hh[0] = hG; hh[1] = hD; hh[2] = hC; hh[3] = hS; hh[4] = hR;
float mx = 0.0;
for (int i = 0; i < 5; i++) { bw[i] = bw[i] + hh[i] * bw[i] * 1.5; mx = max(mx, bw[i]); }
float sum = 0.0;
for (int i = 0; i < 5; i++) { bw[i] = max(bw[i] - mx * 0.55, 0.0); sum += bw[i]; }
for (int i = 0; i < 5; i++) bw[i] /= max(sum, 1e-4);
vec3 gcol = aG.rgb * uGrassTint * mix(vec3(0.82, 1.0, 0.78), vec3(1.25, 1.05, 0.7), smoothstep(0.25, 0.85, mac)) * (0.75 + 0.4 * mac2);
gcol = mix(gcol, gcol * vec3(0.7, 0.78, 0.6), smoothstep(0.62, 0.78, vnoiseP(tw.xz * 0.35, vec2(1e4))) * 0.6);
vec4 alb = vec4(gcol, aG.a) * bw[0] + aD * bw[1] + aC * bw[2] + aS * bw[3] + aR * bw[4];
vec4 nrm = nG * bw[0] + nD * bw[1] + nC * bw[2] + nS * bw[3] + nR * bw[4];
rrTN = nrm.xyz * 2.0 - 1.0;
rrRough = alb.a;
// damp ground near water
float wet = uTerr.z > -50.0 ? smoothstep(uTerr.z + 0.9, uTerr.z + 0.05, tw.y) : 0.0;
alb.rgb *= mix(1.0, 0.55, wet);
rrRough = mix(rrRough, 0.25, wet * 0.8);
diffuseColor.rgb *= alb.rgb;
`)
      .replace('#include <normal_fragment_maps>', /* glsl */ `
{
  vec3 T = normalize(cross(tn, vec3(0.0, 0.0, 1.0)));
  vec3 B = normalize(cross(T, tn));
  vec3 n = rrTN; n.xy *= 1.2 * (1.0 - smoothstep(60.0, 220.0, dist) * 0.7);
  vec3 wn = normalize(T * n.x + B * n.y + tn * max(n.z, 0.2));
  normal = normalize((viewMatrix * vec4(wn, 0.0)).xyz);
}
`)
      .replace('#include <roughnessmap_fragment>', 'float roughnessFactor = roughness * rrRough;')
      .replace('#include <aomap_fragment>', `#include <aomap_fragment>
{ float tao = mix(1.0, nrm.a, 0.6); reflectedLight.indirectDiffuse *= tao; reflectedLight.indirectSpecular *= tao; }`);
  };
}

export function buildTerrain(map: BuiltMap, baker: TextureBaker, quality: number): TerrainView {
  const hf = map.world.terrain;
  const group = new THREE.Group();
  group.name = 'terrain';
  const layers = baker.array(['grass', 'dirt', 'cobble', 'sand', 'rock'], quality >= 3 ? 2 : quality <= 0 ? 0.5 : 1);
  const splat = splatTexture(hf);
  const heightTex = heightTexture(hf);
  const water = map.world.water.length ? Math.min(...map.world.water.map((w) => w.level)) : -999;
  const tint = new THREE.Vector3(...map.def.atmosphere.grassTint);
  const mat = new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 1, metalness: 0 });
  prepare(mat, [terrainPatch({ albedo: layers.map, normal: layers.normal, splat, origin: hf.origin, size: hf.size, water, tint, far: false })], ['terrain']);
  const farMat = new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 1, metalness: 0 });
  prepare(farMat, [terrainPatch({ albedo: layers.map, normal: layers.normal, splat, origin: hf.origin, size: hf.size, water, tint, far: true })], ['terrainFar']);

  interface Chunk { lods: THREE.BufferGeometry[]; mesh: THREE.Mesh; cx: number; cz: number; cur: number }
  const chunks: Chunk[] = [];
  const steps = quality >= 2 ? [1, 2, 4] : [2, 4, 8];
  const per = Math.floor(hf.size / CHUNK);
  for (let j = 0; j < per; j++) for (let i = 0; i < per; i++) {
    const x0 = hf.origin + i * CHUNK, z0 = hf.origin + j * CHUNK;
    const lods = steps.map((st) => chunkGeometry(hf, x0, z0, st, 2.5));
    const mesh = new THREE.Mesh(lods[0], mat);
    mesh.receiveShadow = true;
    mesh.castShadow = true;
    mesh.matrixAutoUpdate = false;
    group.add(mesh);
    chunks.push({ lods, mesh, cx: x0 + CHUNK / 2, cz: z0 + CHUNK / 2, cur: 0 });
  }

  // far ring: hills to the horizon
  const ring = farRing(map);
  const ringMesh = new THREE.Mesh(ring, farMat);
  ringMesh.receiveShadow = true;
  ringMesh.matrixAutoUpdate = false;
  group.add(ringMesh);

  return {
    group, heightTex, splatTex: splat,
    update(cam) {
      for (const c of chunks) {
        const d = Math.hypot(c.cx - cam.position.x, c.cz - cam.position.z);
        const lod = d < (quality >= 4 ? 220 : 110) ? 0 : d < (quality >= 4 ? 400 : 230) ? 1 : 2;
        if (lod !== c.cur) { c.cur = lod; c.mesh.geometry = c.lods[lod]; }
      }
    },
    dispose() {
      for (const c of chunks) c.lods.forEach((g) => g.dispose());
      ring.dispose(); mat.dispose(); farMat.dispose(); splat.dispose(); heightTex.dispose();
    },
  };
}

function farRing(map: BuiltMap): THREE.BufferGeometry {
  const hf = map.world.terrain;
  const half = hf.size / 2;
  const noise = new Noise2(0x5eed ^ map.def.id.length * 977);
  const sea = map.world.water.find((w) => w.kind === 'sea' || w.kind === 'river');
  const radial = 46, around = 160;
  const pos: number[] = [], nrm: number[] = [], idx: number[] = [];
  const hAt = (x: number, z: number) => {
    const cx = THREE.MathUtils.clamp(x, -half + 1, half - 1), cz = THREE.MathUtils.clamp(z, -half + 1, half - 1);
    const edge = hf.height(cx, cz);
    const out = Math.max(Math.abs(x) - half, Math.abs(z) - half, 0);
    if (out <= 0) return edge;
    const t = THREE.MathUtils.smoothstep(out, 0, 700);
    let hills = 14 + 30 * noise.fbm(x / 900, z / 900, 4) + 70 * Math.max(0, noise.ridged(x / 1400, z / 1400, 3) - 0.45);
    if (sea && edge < sea.level + 1.5) hills = Math.min(hills, sea.level - 6 - out * 0.02 - edge);
    return edge + hills * t - Math.min(out, 60) * 0.02;
  };
  for (let r = 0; r <= radial; r++) {
    // rings start inside the heightfield square's inscribed region and grow geometrically
    const rad = (half - 2) * Math.pow(18, r / radial);
    for (let a = 0; a <= around; a++) {
      const th = (a / around) * Math.PI * 2;
      // map the first ring onto the square boundary so it meets the chunked terrain
      let x = Math.cos(th) * rad, z = Math.sin(th) * rad;
      if (r === 0) {
        const k = (half - 2) / Math.max(Math.abs(Math.cos(th)), Math.abs(Math.sin(th)));
        x = Math.cos(th) * k; z = Math.sin(th) * k;
      } else {
        const k0 = (half - 2) / Math.max(Math.abs(Math.cos(th)), Math.abs(Math.sin(th)));
        const kr = Math.max(k0 + 2, rad + (k0 - (half - 2)) * (1 - r / radial));
        x = Math.cos(th) * kr; z = Math.sin(th) * kr;
      }
      const y = hAt(x, z) - (r === 0 ? 0.15 : 0);
      pos.push(x, y, z);
      nrm.push(0, 1, 0);
    }
  }
  const W = around + 1;
  for (let r = 0; r < radial; r++) for (let a = 0; a < around; a++) {
    const i0 = r * W + a, i1 = i0 + 1, i2 = i0 + W, i3 = i2 + 1;
    idx.push(i0, i1, i2, i1, i3, i2);
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('normal', new THREE.Float32BufferAttribute(nrm, 3));
  g.setIndex(idx);
  g.computeVertexNormals();
  g.computeBoundingSphere();
  return g;
}

export { G };
