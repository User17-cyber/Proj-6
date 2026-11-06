// Material plumbing: every material in the world goes through `prepare()` so that it gets
// cascaded shadows, the shared height fog with sun in-scattering, and any extra shader
// patches (packed PBR maps, wind, weathering, instanced wear...).

import * as THREE from 'three';
import type { PbrSet } from './textures';

type Shader = THREE.WebGLProgramParametersWithUniforms;
export type Patch = (s: Shader) => void;

/** Uniforms shared by reference across all materials. */
export const G = {
  uTime: { value: 0 },
  uWindDir: { value: new THREE.Vector2(1, 0.3).normalize() },
  uWind: { value: 0.4 },
  uFogColor: { value: new THREE.Color(0.7, 0.72, 0.75) },
  uFogSun: { value: new THREE.Color(1, 0.9, 0.7) },
  uFogDensity: { value: 0.003 },
  uFogFalloff: { value: 0.035 },
  uFogBase: { value: 0 },
  uSunDir: { value: new THREE.Vector3(0.5, 0.5, 0.2).normalize() },
  uCamPos: { value: new THREE.Vector3() },
};

const FOG_PARS_FRAG = /* glsl */ `
uniform vec3 uFogColor; uniform vec3 uFogSun; uniform float uFogDensity; uniform float uFogFalloff; uniform float uFogBase; uniform vec3 uSunDir;
varying vec3 vRRWorld;
vec3 rrFog(vec3 col, vec3 wp) {
  vec3 ro = cameraPosition; vec3 rd = wp - ro; float dist = length(rd); rd /= max(dist, 1e-4);
  float a = uFogDensity * exp(-uFogFalloff * (ro.y - uFogBase));
  float by = uFogFalloff * rd.y;
  float amt = abs(by) > 1e-4 ? a * (1.0 - exp(-by * dist)) / by : a * dist;
  float f = 1.0 - exp(-max(amt, 0.0));
  float sun = pow(max(dot(rd, uSunDir), 0.0), 7.0);
  return mix(col, mix(uFogColor, uFogSun, sun * 0.8), f);
}
`;
const WORLD_VARY = /* glsl */ `varying vec3 vRRWorld;`;
const WORLD_CALC = /* glsl */ `
{
  vec4 rrw = vec4(transformed, 1.0);
  #ifdef USE_BATCHING
    rrw = batchingMatrix * rrw;
  #endif
  #ifdef USE_INSTANCING
    rrw = instanceMatrix * rrw;
  #endif
  rrw = modelMatrix * rrw;
  vRRWorld = rrw.xyz;
}
`;

function fogPatch(s: Shader) {
  s.uniforms.uFogColor = G.uFogColor;
  s.uniforms.uFogSun = G.uFogSun;
  s.uniforms.uFogDensity = G.uFogDensity;
  s.uniforms.uFogFalloff = G.uFogFalloff;
  s.uniforms.uFogBase = G.uFogBase;
  s.uniforms.uSunDir = G.uSunDir;
  s.vertexShader = s.vertexShader
    .replace('#include <common>', '#include <common>\n' + WORLD_VARY)
    .replace('#include <project_vertex>', '#include <project_vertex>\n' + WORLD_CALC);
  s.fragmentShader = s.fragmentShader
    .replace('#include <common>', '#include <common>\n' + FOG_PARS_FRAG)
    .replace('#include <fog_fragment>', 'gl_FragColor.rgb = rrFog(gl_FragColor.rgb, vRRWorld);');
}

/** Read roughness from map.a and AO from normalMap.a (the baker's packing). */
export const packedPbrPatch: Patch = (s) => {
  s.fragmentShader = s.fragmentShader
    .replace('#include <roughnessmap_fragment>', /* glsl */ `
float roughnessFactor = roughness;
#ifdef USE_MAP
  roughnessFactor *= texture2D(map, vMapUv).a;
#endif`)
    .replace('#include <aomap_fragment>', /* glsl */ `
#ifdef USE_NORMALMAP
{
  float rrAo = mix(1.0, texture2D(normalMap, vNormalMapUv).a, rrAoStrength);
  reflectedLight.indirectDiffuse *= rrAo;
  #if defined( USE_CLEARCOAT )
    clearcoatSpecularIndirect *= rrAo;
  #endif
  #if defined( USE_SHEEN )
    sheenSpecularIndirect *= rrAo;
  #endif
  #if defined( USE_ENVMAP ) && defined( STANDARD )
    reflectedLight.indirectSpecular *= computeSpecularOcclusion( saturate( dot( geometryNormal, geometryViewDir ) ), rrAo, material.roughness );
  #endif
}
#endif
#include <aomap_fragment>`)
    .replace('#include <common>', '#include <common>\nuniform float rrAoStrength;');
  s.uniforms.rrAoStrength = { value: 1 };
};

interface Registered { mat: THREE.Material; patches: Patch[]; keys: string[]; csmHook: ((s: Shader, r: THREE.WebGLRenderer) => void) | null }
const registry: Registered[] = [];
let csmRef: { setupMaterial(m: THREE.Material): void } | null = null;

function rebuildHook(r: Registered) {
  const m = r.mat as THREE.Material & { onBeforeCompile: (s: Shader, renderer: THREE.WebGLRenderer) => void };
  const csmHook = r.csmHook;
  m.onBeforeCompile = (s, rr) => {
    if (csmHook) csmHook.call(m, s, rr);
    for (const p of r.patches) p(s);
  };
  const key = r.keys.join('|');
  m.customProgramCacheKey = () => key;
  m.needsUpdate = true;
}

/** Register a material with the world pipeline. `fog` defaults to true. */
export function prepare<T extends THREE.Material>(mat: T, patches: Patch[] = [], keys: string[] = [], o: { fog?: boolean; shadows?: boolean } = {}): T {
  const all: Patch[] = [];
  const k: string[] = [];
  if (o.fog !== false) { all.push(fogPatch); k.push('fog'); }
  all.push(...patches);
  k.push(...keys);
  const r: Registered = { mat, patches: all, keys: k, csmHook: null };
  registry.push(r);
  tag(mat);
  if (csmRef && o.shadows !== false) attachCsm(r);
  else rebuildHook(r);
  return mat;
}

function attachCsm(r: Registered) {
  if (!csmRef) return;
  csmRef.setupMaterial(r.mat);
  r.csmHook = (r.mat as unknown as { onBeforeCompile: (s: Shader, rr: THREE.WebGLRenderer) => void }).onBeforeCompile;
  rebuildHook(r);
}

/** Called when the cascaded shadow system is (re)created. */
export function setCsm(csm: { setupMaterial(m: THREE.Material): void } | null) {
  csmRef = csm;
  for (const r of registry) {
    if (csm) attachCsm(r);
    else { r.csmHook = null; rebuildHook(r); }
  }
}

/** Forget materials of a disposed world (those tagged with the given world id). */
export function unregisterWorld(worldId: number) {
  for (let i = registry.length - 1; i >= 0; i--) {
    if (worldTag.get(registry[i].mat) === worldId) { registry[i].mat.dispose(); registry.splice(i, 1); }
  }
}
const worldTag = new WeakMap<THREE.Material, number>();
let currentWorld = 0;
/** Materials created while a world is being built are tagged with it. */
export function beginWorld(id: number) { currentWorld = id; }
export function endWorld() { currentWorld = 0; }
function tag(m: THREE.Material) { if (currentWorld) worldTag.set(m, currentWorld); }

/** Double-sided foliage keeps one lighting normal on both faces (no back-face flip). */
export const noFlipPatch: Patch = (s) => {
  s.fragmentShader = s.fragmentShader.replace('#include <normal_fragment_begin>', THREE.ShaderChunk.normal_fragment_begin.replace('normal *= faceDirection;', '').replace('normal = normal * faceDirection;', ''));
};

/** Standard PBR surface from a baked set. */
export function pbr(set: PbrSet, o: {
  color?: THREE.ColorRepresentation; roughness?: number; metalness?: number; normalScale?: number; repeat?: [number, number];
  side?: THREE.Side; envMapIntensity?: number; physical?: boolean; sheen?: number; sheenColor?: THREE.ColorRepresentation; clearcoat?: number;
  patches?: Patch[]; keys?: string[]; vertexColors?: boolean; aoStrength?: number;
} = {}): THREE.MeshStandardMaterial {
  const Ctor = o.physical ? THREE.MeshPhysicalMaterial : THREE.MeshStandardMaterial;
  const m = new Ctor({
    color: o.color ?? 0xffffff,
    roughness: o.roughness ?? 1,
    metalness: o.metalness ?? 0,
    map: set.map,
    normalMap: set.normal,
    normalScale: new THREE.Vector2(o.normalScale ?? 1, o.normalScale ?? 1),
    side: o.side ?? THREE.FrontSide,
    envMapIntensity: o.envMapIntensity ?? 1,
    vertexColors: o.vertexColors ?? false,
  });
  if (o.physical) {
    const p = m as THREE.MeshPhysicalMaterial;
    if (o.sheen) { p.sheen = o.sheen; p.sheenColor = new THREE.Color(o.sheenColor ?? 0xffffff); p.sheenRoughness = 0.7; }
    if (o.clearcoat) { p.clearcoat = o.clearcoat; p.clearcoatRoughness = 0.3; }
  }
  const extra: Patch[] = [packedPbrPatch];
  const keys = ['pbr'];
  if (o.repeat) {
    // textures are shared, so repetition goes through a uv transform patch
    const sc = new THREE.Vector2(o.repeat[0], o.repeat[1]);
    extra.push((s) => {
      s.uniforms.rrUvScale = { value: sc };
      s.vertexShader = s.vertexShader
        .replace('#include <common>', '#include <common>\nuniform vec2 rrUvScale;')
        .replace('#include <uv_vertex>', '#include <uv_vertex>\n#ifdef USE_MAP\n vMapUv *= rrUvScale;\n#endif\n#ifdef USE_NORMALMAP\n vNormalMapUv *= rrUvScale;\n#endif');
    });
    keys.push('uvs');
  }
  if (o.aoStrength !== undefined) {
    const v = o.aoStrength;
    extra.push((s) => { s.uniforms.rrAoStrength.value = v; });
    keys.push('ao' + v);
  }
  extra.push(...(o.patches ?? []));
  keys.push(...(o.keys ?? []));
  return prepare(m, extra, keys);
}
