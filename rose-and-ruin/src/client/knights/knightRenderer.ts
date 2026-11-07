// Rendering of every knight (and corpse) on the field.
//
// Each class's whole harness (every armour piece, the weapon, the shield) and the skinned
// body underneath are merged into a few meshes per class: one per surface group (plate &
// cloth, double-sided cloth, heraldry), at three levels of detail. Vertices carry the bone
// they ride on (two, blended, for the body) and a surface id; the shader skins them from a
// texture of bone matrices and looks the surface up in a small table over texture arrays.
// A hundred knights therefore cost a handful of draw calls instead of hundreds.
//
// Near knights draw at full detail, far ones from a clustered mesh; shadows and water
// reflections use the coarsest mesh, and knights cast only into the nearer shadow cascades.

import * as THREE from 'three';
import { mergeGeometries, mergeVertices } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { CLASS_IDS, type ClassId } from '../../shared/data/classes';
import { KITS, pieceGeometry, type MatKey, type PieceDef } from './kits';
import { B, BONE_COUNT } from './skeleton';
import { BIND, bodyGeometry, HEAD_INV, REGION, SLOTS, SLOT_WEAPON, SLOT_OFFHAND, SLOT_DAGGER } from './body';
import { packedPbrPatch, prepare, type Patch } from '../render/materials';
import type { TextureBaker } from '../render/textures';
import { drawShield, drawTabard, TEAM_COLORS } from '../render/heraldry';
import { NOISE_GLSL } from '../render/glsl';
import { PASS } from '../render/passes';

export interface KnightDrawable {
  bones: THREE.Matrix4[];
  weapon: THREE.Matrix4 | null;
  offhand: THREE.Matrix4;
  daggerOut: boolean;
  bowBend: number;
  nock: THREE.Vector3;
  arrowNocked: boolean;
  aimYaw: number; aimPitch: number;
}

// ------------------------------------------------------------------ surfaces
interface Surf { layer: number; color: number; rough: number; metal: number; env: number; nScale: number; rep: number; team: number; ao: number }
const LAYERS = ['steel', 'mail', 'leather', 'cloth', 'quilt', 'timber', 'planks', 'skin'];
const L = (n: string) => LAYERS.indexOf(n);
const S = (layer: string, color: number, o: Partial<Surf> = {}): Surf => ({ layer: L(layer), color, rough: 1, metal: 0, env: 1, nScale: 1, rep: 1, team: 0, ao: 1, ...o });
const SURFS: Record<string, Surf> = {
  steel: S('steel', 0xc8cbd0, { metal: 1, env: 1.7, nScale: 0.35, ao: 0 }),
  steelBright: S('steel', 0xd8dbe0, { metal: 1, rough: 0.72, env: 1.8, nScale: 0.25, ao: 0 }),
  steelDark: S('steel', 0x5a5d62, { metal: 1, rough: 1.2, env: 1.5, nScale: 0.4, ao: 0 }),
  brass: S('steel', 0xc9a050, { metal: 1, rough: 1.1, env: 1.2, ao: 0 }),
  // mail over padding: a rough metal that still scatters some light in the shade
  mail: S('mail', 0xd2d4d8, { metal: 0.78, rough: 0.9, env: 1.6, nScale: 1.3, rep: 3, ao: 0.45 }),
  leather: S('leather', 0x9a7356),
  leatherDark: S('leather', 0x4a3226),
  grip: S('leather', 0x3a261a, { rep: 4 }),
  cloth: S('cloth', 0xffffff, { team: 1, rep: 2 }),
  clothDark: S('cloth', 0x2e2a26, { rep: 2 }),
  quilt: S('quilt', 0xc2b294, { rep: 1.5 }),
  wood: S('timber', 0xb08860),
  shieldBack: S('planks', 0x8a6a4a),
  void: S('cloth', 0x050303, { env: 0, ao: 0 }),
  plume: S('cloth', 0xffffff, { team: 2 }),
  brig: S('cloth', 0xffffff, { team: 3, rep: 2 }),
  skin: S('skin', 0xffffff, { env: 0.55, nScale: 0.7, rep: 2 }),
  doublet: S('cloth', 0x5b4c3c, { rep: 2.5 }),
  hose: S('cloth', 0x4b4136, { rep: 3 }),
  hoseLivery: S('cloth', 0xffffff, { team: 4, rep: 3 }),
};
const SURF_KEYS = Object.keys(SURFS);
const SURF_ID = (k: string) => SURF_KEYS.indexOf(k);
const SKIN_ID = SURF_ID('skin');

/** What each class wears under its harness: torso, arms, legs, neck, head. */
const BODY_SURF: Record<ClassId, [string, string, string, string, string]> = {
  manatarms: ['doublet', 'doublet', 'hose', 'skin', 'skin'],
  vanguard: ['doublet', 'doublet', 'hose', 'skin', 'skin'],
  halberdier: ['mail', 'mail', 'hoseLivery', 'skin', 'skin'],
  banneret: ['doublet', 'doublet', 'hose', 'skin', 'skin'],
  longbowman: ['quilt', 'doublet', 'hoseLivery', 'skin', 'skin'],
  errant: ['mail', 'mail', 'hoseLivery', 'skin', 'skin'],
  pavisier: ['mail', 'mail', 'hoseLivery', 'skin', 'skin'],
  bachelor: ['doublet', 'doublet', 'hose', 'skin', 'skin'],
};

const SKIN_TONES = [0xe3b49b, 0xd9a080, 0xc98e6c, 0xb57b5a].map((c) => new THREE.Color(c));
const HAIR_COLS = [0x2a1d14, 0x4a3020, 0x6b4428, 0x8e6436, 0xb08a58, 0x1a1512, 0x8a8682].map((c) => new THREE.Color(c));

type Group = 'front' | 'cloth' | 'herald';
const GROUPS: Group[] = ['front', 'cloth', 'herald'];
const groupOf = (m: MatKey): Group => (m === 'tabard' || m === 'shieldFace' ? 'herald' : m === 'cloth' ? 'cloth' : 'front');

// ------------------------------------------------------------------ shaders
const SKIN_VERT_PARS = /* glsl */ `
uniform highp sampler2D tBones; uniform highp sampler2D tBonesStatic; uniform int uDynRows;
attribute vec2 aBones; attribute float aW; attribute float aMat; attribute float aFlags;
attribute vec4 aI0; attribute vec4 aI1;
mat4 rrBone(float slot) {
  int x = int(slot + 0.5) * 3; int y = int(aI0.x + 0.5);
  vec4 a, b, c;
  // rows past the live ones belong to settled corpses, posed once in their own texture
  if (y >= uDynRows) { y -= uDynRows; a = texelFetch(tBonesStatic, ivec2(x, y), 0); b = texelFetch(tBonesStatic, ivec2(x + 1, y), 0); c = texelFetch(tBonesStatic, ivec2(x + 2, y), 0); }
  else { a = texelFetch(tBones, ivec2(x, y), 0); b = texelFetch(tBones, ivec2(x + 1, y), 0); c = texelFetch(tBones, ivec2(x + 2, y), 0); }
  return mat4(a.x, b.x, c.x, 0.0, a.y, b.y, c.y, 0.0, a.z, b.z, c.z, 0.0, a.w, b.w, c.w, 1.0);
}
mat4 rrSkinM() {
  mat4 m = rrBone(aBones.x);
  if (aW > 0.001) m = m * (1.0 - aW) + rrBone(aBones.y) * aW;
  return m;
}
vec3 rrPlace(vec3 p, mat4 m) {
  // the head and helmet collapse away in first person
  if (aFlags > 1.5 && aI0.z > 0.5) return vec3(0.0, -1e4, 0.0);
#ifndef RR_DEPTH
  // first person: the rest of the body and harness go too (they would bob across the view);
  // only the forearms, hands and what they hold remain. The shadow keeps the whole man.
  if (aI0.z > 1.5) {
    float b = aW > 0.5 ? aBones.y : aBones.x;
    bool keep = b > 16.5 || (b > 5.5 && b < 7.5) || (b > 8.5 && b < 10.5);
    if (!keep) return vec3(0.0, -1e4, 0.0);
  }
#endif
  return (m * vec4(p, 1.0)).xyz;
}`;

/** Skinning for the lit materials (normals too). */
const skinPatch: Patch = (s) => {
  s.vertexShader = s.vertexShader
    .replace('#include <common>', '#include <common>\n' + SKIN_VERT_PARS + '\nmat4 rrSM;')
    .replace('#include <beginnormal_vertex>', '#include <beginnormal_vertex>\nrrSM = rrSkinM();\nobjectNormal = mat3(rrSM) * objectNormal;')
    .replace('#include <begin_vertex>', '#include <begin_vertex>\ntransformed = rrPlace(transformed, rrSM);');
};
/** Skinning for the shadow depth material (no normals there). */
const depthSkinPatch: Patch = (s) => {
  s.vertexShader = s.vertexShader
    .replace('#include <common>', '#include <common>\n#define RR_DEPTH\n' + SKIN_VERT_PARS)
    .replace('#include <begin_vertex>', '#include <begin_vertex>\ntransformed = rrPlace(transformed, rrSkinM());');
};

const N = SURF_KEYS.length;
const UBER_FRAG_PARS = /* glsl */ `
precision highp sampler2DArray;
uniform sampler2DArray tKnAlb; uniform sampler2DArray tKnNrm;
uniform vec4 uPalA[${N}]; uniform vec4 uPalB[${N}]; uniform vec4 uPalC[${N}];
uniform vec3 uTeamCol[2]; uniform vec3 uTeamCol2[2];
uniform vec3 uSkinTone[4]; uniform vec3 uHairCol[7];
uniform mat4 uHeadInv; uniform int uKnDebug;
flat varying float vMat; flat varying vec4 vLook; flat varying float vTeam;
varying vec3 vObj; varying vec2 vWear; varying vec2 vUvK;
${NOISE_GLSL}
vec4 rrNrmS; float rrRough; float rrMetal; float rrEnv; float rrAoK; float rrNScale; float rrBlood;
vec3 rrTeam(float mode) {
  vec3 a = mix(uTeamCol[0], uTeamCol[1], vTeam);
  if (mode < 1.5) return a;
  if (mode < 2.5) return mix(uTeamCol[0], uTeamCol2[1], vTeam);
  if (mode < 3.5) return a * 0.75;
  return a * 0.42;
}
vec3 rrFace(vec3 col, inout float rough) {
  vec3 p = (uHeadInv * vec4(vObj, 1.0)).xyz;
  float tone = vLook.y * 3.0;
  vec3 skin = mix(mix(uSkinTone[0], uSkinTone[1], clamp(tone, 0.0, 1.0)), mix(uSkinTone[2], uSkinTone[3], clamp(tone - 2.0, 0.0, 1.0)), clamp(tone - 1.0, 0.0, 1.0));
  int hi = int(vLook.z * 6.99);
  vec3 hair = uHairCol[hi];
  col *= skin;
  if (p.y < -0.02) return col;
  float front = smoothstep(-0.055, -0.08, p.z);
  float ax = abs(p.x);
  // warmth on cheeks, nose and ears; shadowed eye sockets
  float cheek = exp(-pow((ax - 0.05) / 0.022, 2.0) - pow((p.y - 0.07) / 0.022, 2.0)) * front;
  col = mix(col, col * vec3(1.08, 0.86, 0.82), cheek * 0.35);
  col = mix(col, col * vec3(1.05, 0.84, 0.8), exp(-pow(p.x / 0.012, 2.0) - pow((p.y - 0.072) / 0.01, 2.0)) * front * 0.5);
  vec2 e = vec2(ax - 0.033, p.y - 0.104);
  float sock = exp(-dot(e / vec2(0.024, 0.016), e / vec2(0.024, 0.016)));
  col *= 1.0 - 0.32 * sock * front;
  // eyes: white, iris, pupil, and a lid line above
  float eye = (1.0 - smoothstep(0.75, 1.0, length(e / vec2(0.0125, 0.0055)))) * front;
  float iris = 1.0 - smoothstep(0.6, 1.0, length(e) / 0.0052);
  float pupil = 1.0 - smoothstep(0.4, 1.0, length(e) / 0.0021);
  vec3 irisCol = mix(vec3(0.16, 0.1, 0.06), vec3(0.22, 0.3, 0.34), step(0.6, fract(vLook.w * 7.13)));
  vec3 eyeCol = mix(vec3(0.78, 0.75, 0.7), irisCol, iris);
  eyeCol = mix(eyeCol, vec3(0.015), pupil);
  col = mix(col, eyeCol, eye);
  float lid = (1.0 - smoothstep(0.0, 0.0016, abs(e.y - 0.0052 + e.x * e.x * 18.0))) * step(abs(e.x), 0.0135) * front;
  col *= 1.0 - 0.6 * lid;
  // brows
  vec2 bw = vec2(ax - 0.034, p.y - 0.1215 - (ax - 0.034) * 0.12);
  float brow = (1.0 - smoothstep(0.6, 1.0, length(bw / vec2(0.019, 0.0042)))) * front;
  col = mix(col, hair * 0.8, brow * 0.9);
  // lips and the line of the mouth
  float lips = (1.0 - smoothstep(0.55, 1.0, length(vec2(p.x / 0.02, (p.y - 0.036) / 0.0062)))) * front;
  col = mix(col, col * vec3(0.82, 0.5, 0.46), lips * 0.7);
  float mouth = (1.0 - smoothstep(0.0, 0.0011, abs(p.y - 0.036 + p.x * p.x * 2.5))) * step(ax, 0.018) * front;
  col *= 1.0 - 0.6 * mouth;
  // beard and stubble below the cheekbones, hair on the crown and the back
  float beardAmt = vLook.x;
  float jaw = smoothstep(0.072, 0.05, p.y + 0.012 * front) * (1.0 - lips);
  float bn = vnoiseP(p.xy * 900.0 + p.z * 300.0, vec2(1e4));
  float beard = jaw * smoothstep(0.0, 0.2, beardAmt) * mix(0.35, 1.0, smoothstep(0.35, 0.9, beardAmt));
  col = mix(col, mix(col * 0.82, hair, smoothstep(0.35, 0.9, beardAmt)) * (0.85 + 0.3 * bn), beard);
  float moust = exp(-pow(p.x / 0.024, 2.0) - pow((p.y - 0.047) / 0.006, 2.0)) * front * smoothstep(0.55, 0.9, beardAmt);
  col = mix(col, hair * (0.8 + 0.3 * bn), moust);
  float hairLine = smoothstep(0.15, 0.165, p.y + 0.03 * (1.0 - front) - 0.01 * sin(p.x * 60.0));
  float back = smoothstep(-0.01, 0.03, p.z) * smoothstep(0.03, 0.07, p.y);
  float hm = max(hairLine, back * (1.0 - smoothstep(0.6, 0.85, abs(p.x) / 0.08) * 0.0));
  float hn = vnoiseP(vec2(atan(p.x, p.z) * 40.0, p.y * 300.0), vec2(1e4));
  col = mix(col, hair * (0.7 + 0.45 * hn), clamp(hm, 0.0, 1.0));
  rough = mix(rough, 0.75, max(clamp(hm, 0.0, 1.0), beard));
  return col;
}`;

const uberPatch: Patch = (s) => {
  s.vertexShader = s.vertexShader
    .replace('#include <common>', '#include <common>\nflat varying float vMat; flat varying vec4 vLook; flat varying float vTeam; varying vec3 vObj; varying vec2 vWear; varying vec2 vUvK;')
    .replace('#include <begin_vertex>', '#include <begin_vertex>\nvMat = aMat; vLook = vec4(aI0.w, aI1.z, aI1.w, fract(aI0.x * 0.618)); vTeam = aI0.y; vObj = position; vWear = aI1.xy; vUvK = uv;');
  s.fragmentShader = s.fragmentShader
    .replace('#include <common>', '#include <common>\n' + UBER_FRAG_PARS)
    .replace('#include <map_fragment>', /* glsl */ `
{
  int mi = int(vMat + 0.5);
  vec4 pa = uPalA[mi], pb = uPalB[mi], pc = uPalC[mi];
  vec2 kuv = vUvK * pc.x;
  vec4 alb = texture(tKnAlb, vec3(kuv, pa.w));
  rrNrmS = texture(tKnNrm, vec3(kuv, pa.w));
  vec3 tint = pc.y > 0.5 ? rrTeam(pc.y) : pa.rgb;
  rrRough = pb.x * alb.a; rrMetal = pb.y; rrEnv = pb.z; rrNScale = pb.w; rrAoK = pc.z;
  diffuseColor.rgb *= alb.rgb * tint;
  if (mi == ${SKIN_ID}) diffuseColor.rgb = rrFace(diffuseColor.rgb, rrRough);
  // blood and mud from object-space noise, driven per knight
  vec3 o = vObj * 9.0;
  float n = vnoiseP(o.xy + o.z * 1.7, vec2(1e4)) * 0.55 + vnoiseP(o.zy * 2.3 + 7.0, vec2(1e4)) * 0.3 + vnoiseP(o.xz * 6.0, vec2(1e4)) * 0.15;
  float drip = vnoiseP(vec2(o.x * 3.0 + o.z * 2.0, o.y * 0.6), vec2(1e4));
  rrBlood = smoothstep(1.0 - vWear.x * 0.85, 1.0 - vWear.x * 0.85 + 0.08, n * 0.75 + drip * 0.35);
  diffuseColor.rgb = mix(diffuseColor.rgb, vec3(0.12, 0.008, 0.004), rrBlood * 0.92);
  float legs = smoothstep(0.75, 0.35, vObj.y);
  float mudN = vnoiseP(o.xz * 0.7 + o.y * 0.4 + 3.0, vec2(1e4));
  float mudW = min(1.0, vWear.y * mix(0.6, 1.6, legs));
  float mud = smoothstep(1.0 - mudW, 1.0 - mudW + 0.25, mudN) * mudW;
  diffuseColor.rgb = mix(diffuseColor.rgb, vec3(0.13, 0.1, 0.07), mud * 0.85);
  // campaign grime: soot and old dirt everywhere, heavier low down
  float grime = vnoiseP(o.xy * 0.9 + o.z * 0.6, vec2(1e4)) * 0.6 + vnoiseP(o.zy * 4.0 + 11.0, vec2(1e4)) * 0.4;
  diffuseColor.rgb *= mix(1.0, 0.62 + 0.25 * grime, 0.55 + 0.25 * legs);
  rrRough = mix(rrRough, 1.0, 0.25 * grime);
}`)
    .replace('#include <roughnessmap_fragment>', 'float roughnessFactor = clamp(mix(rrRough, 0.22, rrBlood * 0.7), 0.04, 1.0);')
    .replace('#include <metalnessmap_fragment>', 'float metalnessFactor = rrMetal * (1.0 - rrBlood * 0.85);')
    .replace('#include <normal_fragment_maps>', /* glsl */ `
{
  vec3 mapN = rrNrmS.xyz * 2.0 - 1.0;
  mapN.xy *= rrNScale;
  normal = normalize(tbn * mapN);
}`)
    .replace('#include <aomap_fragment>', /* glsl */ `
{
  float rrAo = mix(1.0, rrNrmS.a, rrAoK);
  reflectedLight.indirectDiffuse *= rrAo;
  reflectedLight.indirectSpecular *= mix(1.0, rrAo, 0.6);
}
#include <aomap_fragment>`)
    .replace('#include <lights_fragment_maps>', '#include <lights_fragment_maps>\n#if defined( RE_IndirectSpecular )\n radiance *= rrEnv;\n#endif')
    .replace('#include <dithering_fragment>', `#include <dithering_fragment>
if (uKnDebug == 1) gl_FragColor = vec4(diffuseColor.rgb, 1.0);
if (uKnDebug == 2) gl_FragColor = vec4(vec3(rrNrmS.a), 1.0);
if (uKnDebug == 3) gl_FragColor = vec4(vec3(roughnessFactor), 1.0);
if (uKnDebug == 4) gl_FragColor = vec4(normal * 0.5 + 0.5, 1.0);
if (uKnDebug == 5) gl_FragColor = vec4(vec3(metalnessFactor), 1.0);`);
};

/** Heraldry (tabards, shield faces): team and piece choose the panel of a shared atlas. */
const heraldPatch: Patch = (s) => {
  s.vertexShader = s.vertexShader
    .replace('#include <common>', '#include <common>\nvarying vec3 vObjH; varying vec2 vWearH;')
    .replace('#include <uv_vertex>', '#include <uv_vertex>\nvMapUv = vec2(((aMat > 0.5 ? 2.0 : 0.0) + aI0.y + 0.01 + clamp(uv.x, 0.0, 1.0) * 0.98) * 0.25, uv.y);')
    .replace('#include <begin_vertex>', '#include <begin_vertex>\nvObjH = position; vWearH = aI1.xy;');
  s.fragmentShader = s.fragmentShader
    .replace('#include <common>', `#include <common>\nvarying vec3 vObjH; varying vec2 vWearH;\n${NOISE_GLSL}\nfloat rrBloodH = 0.0;`)
    .replace('#include <map_fragment>', /* glsl */ `#include <map_fragment>
{
  vec3 o = vObjH * 9.0;
  float n = vnoiseP(o.xy + o.z * 1.7, vec2(1e4)) * 0.55 + vnoiseP(o.zy * 2.3 + 7.0, vec2(1e4)) * 0.3 + vnoiseP(o.xz * 6.0, vec2(1e4)) * 0.15;
  rrBloodH = smoothstep(1.0 - vWearH.x * 0.85, 1.0 - vWearH.x * 0.85 + 0.08, n);
  diffuseColor.rgb = mix(diffuseColor.rgb, vec3(0.12, 0.008, 0.004), rrBloodH * 0.92);
  float mudN = vnoiseP(o.xz * 0.7 + o.y * 0.4 + 3.0, vec2(1e4));
  float mud = smoothstep(1.0 - vWearH.y * 0.6, 1.0 - vWearH.y * 0.6 + 0.25, mudN) * vWearH.y;
  diffuseColor.rgb = mix(diffuseColor.rgb, vec3(0.13, 0.1, 0.07), mud * 0.7);
}`);
};

// ------------------------------------------------------------------ geometry
const ATTRS = ['position', 'normal', 'uv', 'aBones', 'aW', 'aMat', 'aFlags'];

function slotOf(p: PieceDef): number {
  if (typeof p.mount === 'number') return p.mount;
  if (p.mount === 'weapon') return SLOT_WEAPON;
  if (p.mount === 'offhand' || p.mount === 'bow') return SLOT_OFFHAND;
  return SLOT_DAGGER;
}

function prepPiece(p: PieceDef, matId: number): THREE.BufferGeometry {
  let g = pieceGeometry(p).clone();
  if (g.index) g = g.toNonIndexed();
  if (!g.attributes.normal) g.computeVertexNormals();
  if (!g.attributes.uv) g.setAttribute('uv', new THREE.Float32BufferAttribute(new Float32Array(g.attributes.position.count * 2), 2));
  const slot = slotOf(p);
  if (slot < BONE_COUNT) g.applyMatrix4(BIND.bones[slot]);
  const n = g.attributes.position.count;
  g.setAttribute('aBones', new THREE.Float32BufferAttribute(new Float32Array(n * 2).fill(slot), 2));
  g.setAttribute('aW', new THREE.Float32BufferAttribute(new Float32Array(n), 1));
  g.setAttribute('aMat', new THREE.Float32BufferAttribute(new Float32Array(n).fill(matId), 1));
  g.setAttribute('aFlags', new THREE.Float32BufferAttribute(new Float32Array(n).fill(p.head ? 2 : 0), 1));
  for (const k of Object.keys(g.attributes)) if (!ATTRS.includes(k)) g.deleteAttribute(k);
  return g;
}

/** Classes whose helm hides the whole head. */
const CLOSED_HELM = new Set<ClassId>(['vanguard', 'banneret', 'bachelor']);

function prepBody(cls: ClassId): THREE.BufferGeometry {
  const src = bodyGeometry(!CLOSED_HELM.has(cls));
  const g = src.toNonIndexed();
  const reg = g.attributes.aRegion as THREE.BufferAttribute;
  const n = reg.count;
  const mats = new Float32Array(n), flags = new Float32Array(n);
  const map = BODY_SURF[cls];
  for (let i = 0; i < n; i++) {
    const r = reg.getX(i);
    mats[i] = SURF_ID(map[r]);
    flags[i] = r === REGION.head || r === REGION.neck ? 2 : 0;
  }
  g.setAttribute('aMat', new THREE.Float32BufferAttribute(mats, 1));
  g.setAttribute('aFlags', new THREE.Float32BufferAttribute(flags, 1));
  g.deleteAttribute('aRegion');
  return g;
}

/**
 * Vertex-clustering simplification for distant knights: vertices of the same bone, surface
 * and facing that fall in one grid cell are merged, and collapsed triangles dropped.
 */
function cluster(src: THREE.BufferGeometry, cell: number, coarse = false): THREE.BufferGeometry {
  const pos = src.attributes.position as THREE.BufferAttribute, nrm = src.attributes.normal as THREE.BufferAttribute;
  const uv = src.attributes.uv as THREE.BufferAttribute, bones = src.attributes.aBones as THREE.BufferAttribute;
  const w = src.attributes.aW as THREE.BufferAttribute, mat = src.attributes.aMat as THREE.BufferAttribute, fl = src.attributes.aFlags as THREE.BufferAttribute;
  const index = src.index!;
  const n = pos.count;
  const remap = new Int32Array(n);
  const keys = new Map<string, number>();
  const acc: number[] = []; // x y z nx ny nz u v w count b0 b1 mat flags
  for (let i = 0; i < n; i++) {
    const x = pos.getX(i), y = pos.getY(i), z = pos.getZ(i);
    const nx = nrm.getX(i), ny = nrm.getY(i), nz = nrm.getZ(i);
    const ax = Math.abs(nx), ay = Math.abs(ny), az = Math.abs(nz);
    const face = ax > ay && ax > az ? (nx > 0 ? 0 : 1) : ay > az ? (ny > 0 ? 2 : 3) : nz > 0 ? 4 : 5;
    // bones and facing always stay apart (skinning, two-sided plates); the coarse level
    // lets neighbouring surfaces of one bone merge, which only shows as blended colour far off
    const k = coarse
      ? `${bones.getX(i)}|${face}|${Math.floor(x / cell)}|${Math.floor(y / cell)}|${Math.floor(z / cell)}`
      : `${bones.getX(i)}|${bones.getY(i)}|${Math.round(w.getX(i) * 2)}|${mat.getX(i)}|${fl.getX(i)}|${face}|${Math.floor(x / cell)}|${Math.floor(y / cell)}|${Math.floor(z / cell)}`;
    let c = keys.get(k);
    if (c === undefined) {
      c = keys.size;
      keys.set(k, c);
      acc.push(0, 0, 0, 0, 0, 0, 0, 0, 0, 0, bones.getX(i), bones.getY(i), mat.getX(i), fl.getX(i));
    }
    const o = c * 14;
    acc[o] += x; acc[o + 1] += y; acc[o + 2] += z; acc[o + 3] += nx; acc[o + 4] += ny; acc[o + 5] += nz;
    acc[o + 6] += uv.getX(i); acc[o + 7] += uv.getY(i); acc[o + 8] += w.getX(i); acc[o + 9] += 1;
    remap[i] = c;
  }
  const m = keys.size;
  const P = new Float32Array(m * 3), Nn = new Float32Array(m * 3), U = new Float32Array(m * 2), Bn = new Float32Array(m * 2), Wt = new Float32Array(m), M = new Float32Array(m), F = new Float32Array(m);
  for (let c = 0; c < m; c++) {
    const o = c * 14, k = acc[o + 9];
    P[c * 3] = acc[o] / k; P[c * 3 + 1] = acc[o + 1] / k; P[c * 3 + 2] = acc[o + 2] / k;
    const l = Math.hypot(acc[o + 3], acc[o + 4], acc[o + 5]) || 1;
    Nn[c * 3] = acc[o + 3] / l; Nn[c * 3 + 1] = acc[o + 4] / l; Nn[c * 3 + 2] = acc[o + 5] / l;
    U[c * 2] = acc[o + 6] / k; U[c * 2 + 1] = acc[o + 7] / k; Wt[c] = acc[o + 8] / k;
    Bn[c * 2] = acc[o + 10]; Bn[c * 2 + 1] = acc[o + 11]; M[c] = acc[o + 12]; F[c] = acc[o + 13];
  }
  const idx: number[] = [];
  const seen = new Set<string>();
  for (let t = 0; t < index.count; t += 3) {
    const a = remap[index.getX(t)], b = remap[index.getX(t + 1)], c = remap[index.getX(t + 2)];
    if (a === b || b === c || a === c) continue;
    const key = a < b ? (a < c ? `${a},${b < c ? b : c},${b < c ? c : b}` : `${c},${a},${b}`) : (b < c ? `${b},${a < c ? a : c},${a < c ? c : a}` : `${c},${b},${a}`);
    if (seen.has(key + (a < b ? '+' : '-'))) continue;
    seen.add(key + (a < b ? '+' : '-'));
    idx.push(a, b, c);
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.BufferAttribute(P, 3));
  g.setAttribute('normal', new THREE.BufferAttribute(Nn, 3));
  g.setAttribute('uv', new THREE.BufferAttribute(U, 2));
  g.setAttribute('aBones', new THREE.BufferAttribute(Bn, 2));
  g.setAttribute('aW', new THREE.BufferAttribute(Wt, 1));
  g.setAttribute('aMat', new THREE.BufferAttribute(M, 1));
  g.setAttribute('aFlags', new THREE.BufferAttribute(F, 1));
  g.setIndex(idx);
  return g;
}

function mergeIndexed(parts: THREE.BufferGeometry[]): THREE.BufferGeometry | null {
  if (!parts.length) return null;
  const merged = mergeGeometries(parts, false);
  if (!merged) return null;
  return mergeVertices(merged, 1e-5);
}

interface ClassGeo { lod: Record<Group, (THREE.BufferGeometry | null)[]> }
const classGeoCache = new Map<ClassId, ClassGeo>();

function classGeometry(cls: ClassId): ClassGeo {
  const hit = classGeoCache.get(cls);
  if (hit) return hit;
  const full: Record<Group, THREE.BufferGeometry[]> = { front: [], cloth: [], herald: [] };
  const lean: Record<Group, THREE.BufferGeometry[]> = { front: [], cloth: [], herald: [] };
  for (const p of KITS[cls]) {
    const grp = groupOf(p.mat);
    const id = grp === 'herald' ? (p.mat === 'shieldFace' ? 1 : 0) : SURF_ID(p.mat);
    const g = prepPiece(p, id);
    full[grp].push(g);
    if (!p.detail) lean[grp].push(g);
  }
  const body = prepBody(cls);
  full.front.push(body);
  lean.front.push(body);
  const out: ClassGeo = { lod: { front: [], cloth: [], herald: [] } };
  for (const grp of GROUPS) {
    const l0 = mergeIndexed(full[grp]);
    const base = mergeIndexed(lean[grp]);
    const l1 = base ? cluster(base, 0.032) : null;
    const l2 = base ? cluster(base, 0.075, true) : null;
    out.lod[grp] = [l0, l1, l2];
  }
  classGeoCache.set(cls, out);
  return out;
}

// ------------------------------------------------------------------ renderer
interface Bucket { i0: THREE.InstancedBufferAttribute; i1: THREE.InstancedBufferAttribute; count: number; geos: THREE.InstancedBufferGeometry[] }

const SHEATH = new THREE.Matrix4().compose(new THREE.Vector3(-0.17, -0.06, -0.05), new THREE.Quaternion().setFromEuler(new THREE.Euler(2.6, 0, 0.3)), new THREE.Vector3(1, 1, 1));
const HIDDEN = new THREE.Matrix4().makeScale(0, 0, 0);
const _m = new THREE.Matrix4(), _v = new THREE.Vector3(), _v2 = new THREE.Vector3(), _q = new THREE.Quaternion(), _s = new THREE.Vector3();

export class KnightRenderer {
  readonly group = new THREE.Group();
  private boneTex: THREE.DataTexture;
  private boneData: Float32Array;
  private rows = 0;
  /** per class: [near, mid, far, shadow & reflection] */
  private buckets = new Map<ClassId, Bucket[]>();
  private lines: { mesh: THREE.InstancedMesh; count: number; cap: number };
  private uniforms: Record<string, THREE.IUniform>;

  private staticData: Float32Array;
  private staticTex: THREE.DataTexture;
  private statics: { cls: ClassId; team: number; blood: number; mud: number; seed: number }[] = [];

  /** detail: Ultimate's doubled armour, mail and cloth texture resolution */
  constructor(private baker: TextureBaker, readonly capacity: number, readonly staticCap = 0, detail = false) {
    this.group.name = 'knights';
    this.boneData = new Float32Array(SLOTS * 3 * 4 * capacity);
    this.boneTex = new THREE.DataTexture(this.boneData, SLOTS * 3, capacity, THREE.RGBAFormat, THREE.FloatType);
    this.boneTex.minFilter = this.boneTex.magFilter = THREE.NearestFilter;
    this.boneTex.generateMipmaps = false;
    this.boneTex.needsUpdate = true;
    this.staticData = new Float32Array(SLOTS * 3 * 4 * Math.max(1, staticCap));
    this.staticTex = new THREE.DataTexture(this.staticData, SLOTS * 3, Math.max(1, staticCap), THREE.RGBAFormat, THREE.FloatType);
    this.staticTex.minFilter = this.staticTex.magFilter = THREE.NearestFilter;
    this.staticTex.generateMipmaps = false;
    this.staticTex.needsUpdate = true;
    const instCap = capacity + staticCap;
    const arr = baker.array(LAYERS, detail ? 1 : 0.5);
    const palA: THREE.Vector4[] = [], palB: THREE.Vector4[] = [], palC: THREE.Vector4[] = [];
    for (const k of SURF_KEYS) {
      const s = SURFS[k];
      const c = new THREE.Color(s.color);
      palA.push(new THREE.Vector4(c.r, c.g, c.b, s.layer));
      palB.push(new THREE.Vector4(s.rough, s.metal, s.env, s.nScale));
      palC.push(new THREE.Vector4(s.rep, s.team, s.ao, 0));
    }
    this.uniforms = {
      tBones: { value: this.boneTex }, tBonesStatic: { value: this.staticTex }, uDynRows: { value: capacity },
      tKnAlb: { value: arr.map }, tKnNrm: { value: arr.normal },
      uPalA: { value: palA }, uPalB: { value: palB }, uPalC: { value: palC },
      uTeamCol: { value: [new THREE.Color(TEAM_COLORS[0][0]), new THREE.Color(TEAM_COLORS[1][0])] },
      uTeamCol2: { value: [new THREE.Color(TEAM_COLORS[0][1]), new THREE.Color(TEAM_COLORS[1][1])] },
      uSkinTone: { value: SKIN_TONES },
      uHairCol: { value: HAIR_COLS },
      uHeadInv: { value: HEAD_INV },
      uKnDebug: { value: Number(new URLSearchParams(location.search).get('kdebug') ?? 0) },
    };
    const U = this.uniforms;
    const share: Patch = (s) => { for (const [k, v] of Object.entries(U)) s.uniforms[k] = v; };
    const flatN = new THREE.DataTexture(new Uint8Array([128, 128, 255, 255]), 1, 1);
    flatN.needsUpdate = true;
    const uber = (side: THREE.Side) => prepare(new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 1, metalness: 1, normalMap: flatN, side }), [share, skinPatch, uberPatch], ['knightUber', String(side)]);
    const front = uber(THREE.FrontSide), cloth = uber(THREE.DoubleSide);
    const atlas = heraldryAtlas();
    const clothSet = baker.get('cloth', undefined, detail ? 'hd' : '', detail ? 1 : 0.5);
    const herald = prepare(new THREE.MeshStandardMaterial({ map: atlas, normalMap: clothSet.normal, normalScale: new THREE.Vector2(0.5, 0.5), roughness: 0.95, side: THREE.DoubleSide }), [share, skinPatch, packedPbrPatch, heraldPatch], ['knightHerald']);
    const depth = new THREE.MeshDepthMaterial();
    depth.onBeforeCompile = (s) => { share(s as THREE.WebGLProgramParametersWithUniforms); depthSkinPatch(s as THREE.WebGLProgramParametersWithUniforms); };
    depth.customProgramCacheKey = () => 'knightDepth';
    const mats: Record<Group, THREE.Material> = { front, cloth, herald };
    for (const cls of CLASS_IDS) {
      const geo = classGeometry(cls);
      const bks: Bucket[] = [];
      for (let b = 0; b < 4; b++) {
        const i0 = new THREE.InstancedBufferAttribute(new Float32Array(instCap * 4), 4).setUsage(THREE.DynamicDrawUsage) as THREE.InstancedBufferAttribute;
        const i1 = new THREE.InstancedBufferAttribute(new Float32Array(instCap * 4), 4).setUsage(THREE.DynamicDrawUsage) as THREE.InstancedBufferAttribute;
        const bucket: Bucket = { i0, i1, count: 0, geos: [] };
        for (const grp of GROUPS) {
          // near: full detail; mid: clustered; far and shadows: coarse
          const src = geo.lod[grp][Math.min(b, 2)];
          if (!src || !src.index || src.index.count === 0) continue;
          const g = new THREE.InstancedBufferGeometry();
          for (const k of ATTRS) if (src.attributes[k]) g.setAttribute(k, src.attributes[k]);
          g.setIndex(src.index);
          g.setAttribute('aI0', i0);
          g.setAttribute('aI1', i1);
          g.instanceCount = 0;
          g.boundingSphere = new THREE.Sphere(new THREE.Vector3(), 1e5);
          const mesh = new THREE.Mesh(g, mats[grp]);
          mesh.frustumCulled = false;
          mesh.customDepthMaterial = depth;
          if (b < 3) {
            // the near, mid and far meshes: main view only
            mesh.castShadow = false;
            mesh.receiveShadow = true;
            mesh.onBeforeRender = () => { g.instanceCount = PASS.reflect ? 0 : bucket.count; };
          } else {
            // coarse meshes of the knights near the camera: shadows of the near cascades, reflections
            mesh.castShadow = true;
            mesh.receiveShadow = false;
            mesh.onBeforeRender = () => { g.instanceCount = PASS.reflect ? bucket.count : 0; };
            mesh.onBeforeShadow = (_r, _o, _c, shadowCam) => { g.instanceCount = PASS.knightShadowCams.has(shadowCam) ? bucket.count : 0; };
          }
          mesh.name = `${cls}-${grp}-${b}`;
          this.group.add(mesh);
          bucket.geos.push(g);
        }
        bks.push(bucket);
      }
      this.buckets.set(cls, bks);
    }
    // bow strings and nocked arrows
    const lineMat = prepare(new THREE.MeshStandardMaterial({ color: 0xd8d0bc, roughness: 0.8 }));
    const lg = new THREE.CylinderGeometry(1, 1, 1, 5, 1, true);
    lg.translate(0, 0.5, 0);
    const lm = new THREE.InstancedMesh(lg, lineMat, capacity * 3);
    lm.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    lm.count = 0; lm.frustumCulled = false; lm.castShadow = false;
    this.group.add(lm);
    this.lines = { mesh: lm, count: 0, cap: capacity * 3 };
  }

  /** A corpse that has come to rest: pose it once; it is then drawn with drawStatic(). Returns -1 when full. */
  addStatic(cls: ClassId, team: number, d: KnightDrawable, blood: number, mud: number, seed = 0): number {
    const i = this.statics.length;
    if (i >= this.staticCap) return -1;
    writePose(this.staticData, i * SLOTS * 12, d);
    this.statics.push({ cls, team, blood, mud, seed });
    this.staticTex.needsUpdate = true;
    return i;
  }
  drawStatic(i: number, lod: number, shadow: boolean) {
    const st = this.statics[i];
    if (!st) return;
    this.enqueue(st.cls, st.team, this.capacity + i, st.blood, st.mud, lod, false, st.seed, shadow);
  }
  clearStatic() { this.statics.length = 0; }

  begin() {
    this.rows = 0;
    for (const bks of this.buckets.values()) for (const b of bks) b.count = 0;
    this.lines.count = 0;
  }

  /**
   * Queue one knight. lod: 0 near, 1 mid, 2 far; `shadow` adds him to the shadow and
   * reflection set. `seed` picks his face, skin and hair.
   */
  /** hideHead: true hides the head (first-person helm), 2 hides all but forearms, hands and held arms */
  draw(cls: ClassId, team: number, d: KnightDrawable, blood: number, mud: number, lod: number, hideHead: boolean | 2, seed = 0, shadow = true) {
    if (this.rows >= this.capacity) return;
    const row = this.rows++;
    writePose(this.boneData, row * SLOTS * 12, d);
    this.enqueue(cls, team, row, blood, mud, lod, hideHead, seed, shadow);
    if (cls === 'longbowman') this.bowString(d);
  }

  private enqueue(cls: ClassId, team: number, row: number, blood: number, mud: number, lod: number, hideHead: boolean | 2, seed: number, shadow: boolean) {
    const h = hash(seed);
    const beard = (h & 255) / 255, skin = ((h >>> 8) & 255) / 255, hair = ((h >>> 16) & 255) / 255;
    const bks = this.buckets.get(cls)!;
    const put = (b: Bucket) => {
      const k = b.count++;
      b.i0.setXYZW(k, row, team, hideHead === 2 ? 2 : hideHead ? 1 : 0, beard < 0.25 ? 0 : beard);
      b.i1.setXYZW(k, blood, mud, skin, hair);
    };
    put(bks[Math.max(0, Math.min(2, lod))]);
    if (shadow) put(bks[3]);
  }

  private line(a: THREE.Vector3, b: THREE.Vector3, r: number) {
    const L = this.lines;
    if (L.count >= L.cap) return;
    _v.subVectors(b, a);
    const len = _v.length();
    if (len < 1e-4) return;
    _q.setFromUnitVectors(_v2.set(0, 1, 0), _v.divideScalar(len));
    _m.compose(a, _q, _s.set(r, len, r));
    L.mesh.setMatrixAt(L.count++, _m);
  }

  private bowString(d: KnightDrawable) {
    const top = _t1.set(0, 0.92, -0.01 + d.bowBend * 0.09).applyMatrix4(d.offhand);
    const bot = _t2.set(0, -0.92, -0.01 + d.bowBend * 0.09).applyMatrix4(d.offhand);
    if (d.arrowNocked || d.bowBend > 0.02) {
      this.line(top, d.nock, 0.0028);
      this.line(d.nock, bot, 0.0028);
    } else this.line(top, bot, 0.0028);
    if (d.arrowNocked) {
      _dir.set(-Math.sin(d.aimYaw) * Math.cos(d.aimPitch), Math.sin(d.aimPitch), -Math.cos(d.aimYaw) * Math.cos(d.aimPitch));
      _t3.setFromMatrixPosition(d.offhand).sub(d.nock).normalize();
      _t3.lerp(_dir, 0.2).normalize();
      this.line(d.nock, _t4.copy(d.nock).addScaledVector(_t3, 0.82), 0.0045);
    }
  }

  end() {
    for (const bks of this.buckets.values()) for (const b of bks) {
      if (b.count) { b.i0.needsUpdate = true; b.i1.needsUpdate = true; }
      for (const g of b.geos) g.instanceCount = b.count;
    }
    if (this.rows) {
      this.boneTex.needsUpdate = true;
    }
    const L = this.lines;
    L.mesh.count = L.count;
    if (L.count) L.mesh.instanceMatrix.needsUpdate = true;
  }

  /** draw calls the knights cost in the main view this frame */
  get drawCalls() { let n = 0; for (const bks of this.buckets.values()) for (const b of bks.slice(0, 3)) if (b.count) n += b.geos.length; return n; }
}

/** All 20 matrix slots of one knight's pose. */
function writePose(D: Float32Array, o0: number, d: KnightDrawable) {
  for (let i = 0; i < BONE_COUNT; i++) writeRows(D, o0 + i * 12, _m.multiplyMatrices(d.bones[i], BIND.inv[i]));
  writeRows(D, o0 + SLOT_WEAPON * 12, d.weapon ?? HIDDEN);
  writeRows(D, o0 + SLOT_OFFHAND * 12, d.offhand);
  if (d.daggerOut && d.weapon) writeRows(D, o0 + SLOT_DAGGER * 12, d.weapon);
  else writeRows(D, o0 + SLOT_DAGGER * 12, _m.multiplyMatrices(d.bones[B.pelvis], SHEATH));
}

/** Write the top three rows of a matrix (the affine part) as three RGBA texels. */
function writeRows(D: Float32Array, o: number, m: THREE.Matrix4) {
  const e = m.elements;
  D[o] = e[0]; D[o + 1] = e[4]; D[o + 2] = e[8]; D[o + 3] = e[12];
  D[o + 4] = e[1]; D[o + 5] = e[5]; D[o + 6] = e[9]; D[o + 7] = e[13];
  D[o + 8] = e[2]; D[o + 9] = e[6]; D[o + 10] = e[10]; D[o + 11] = e[14];
}

function hash(x: number) {
  let h = (x + 0x9e3779b9) | 0;
  h = Math.imul(h ^ (h >>> 16), 0x85ebca6b);
  h = Math.imul(h ^ (h >>> 13), 0xc2b2ae35);
  return (h ^ (h >>> 16)) >>> 0;
}

/** Tabards and shield faces of both houses in one texture: [tabard L | tabard Y | shield L | shield Y]. */
function heraldryAtlas(): THREE.CanvasTexture {
  const P = 512;
  const c = document.createElement('canvas');
  c.width = P * 4; c.height = P;
  const ctx = c.getContext('2d')!;
  // each panel is painted on its own canvas (the painters work on whole-canvas pixels)
  const panel = (w: number, h: number, paint: (g: CanvasRenderingContext2D) => void) => {
    const pc = document.createElement('canvas');
    pc.width = w; pc.height = h;
    paint(pc.getContext('2d')!);
    return pc;
  };
  for (let t = 0; t < 2; t++) {
    ctx.drawImage(panel(P, P, (g) => drawTabard(g, P, P, t)), t * P, 0);
    // the shield art is laid out at 256x384; the shield's UVs span the panel either way
    ctx.drawImage(panel(256, 384, (g) => drawShield(g, 256, 384, t, 0)), (2 + t) * P, 0, P, P);
  }
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = 4;
  tex.generateMipmaps = true;
  tex.minFilter = THREE.LinearMipmapLinearFilter;
  return tex;
}

const _t1 = new THREE.Vector3(), _t2 = new THREE.Vector3(), _t3 = new THREE.Vector3(), _t4 = new THREE.Vector3(), _dir = new THREE.Vector3();
