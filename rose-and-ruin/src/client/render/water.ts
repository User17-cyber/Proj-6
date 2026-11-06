// Moats, rivers and the sea: scrolling wave normals, planar reflections of the castle and
// the knights (a mirrored camera rendered at reduced resolution), fresnel, sun glints, and
// depth-based transparency/colour using the terrain heightfield.

import * as THREE from 'three';
import type { BuiltMap } from '../../shared/world/mapgen';
import type { WaterBody } from '../../shared/world/world';
import { prepare, G } from './materials';
import { PASS } from './passes';
import type { TextureBaker } from './textures';

/** Shared reflection state read by every water material. */
export const REFL = {
  tReflect: { value: null as THREE.Texture | null },
  uReflMatrix: { value: new THREE.Matrix4() },
  uReflLevel: { value: -9999 },
  uReflOn: { value: 0 },
};

export class PlanarReflection {
  private rt: THREE.WebGLRenderTarget;
  private cam = new THREE.PerspectiveCamera();
  private frame = 0;
  private hidden: THREE.Object3D[] = [];

  constructor(private scale: number, private every: number) {
    this.rt = new THREE.WebGLRenderTarget(4, 4, { type: THREE.HalfFloatType, depthBuffer: true, stencilBuffer: false });
    this.rt.texture.generateMipmaps = false;
    this.rt.texture.minFilter = THREE.LinearFilter;
    this.rt.texture.magFilter = THREE.LinearFilter;
    REFL.tReflect.value = this.rt.texture;
  }

  /** Render the mirrored view for the water body nearest the camera. */
  render(renderer: THREE.WebGLRenderer, scene: THREE.Scene, camera: THREE.PerspectiveCamera, water: WaterBody[], root: THREE.Object3D) {
    this.frame++;
    if (this.frame % this.every !== 0 && REFL.uReflOn.value > 0) return;
    const p = camera.position;
    let best: WaterBody | null = null, bd = Infinity;
    for (const w of water) {
      const dx = Math.max(w.minX - p.x, 0, p.x - w.maxX), dz = Math.max(w.minZ - p.z, 0, p.z - w.maxZ);
      const d = Math.hypot(dx, dz) + Math.abs(p.y - w.level) * 0.5;
      if (d < bd && p.y > w.level + 0.05) { bd = d; best = w; }
    }
    if (!best || bd > 260) { REFL.uReflOn.value = 0; return; }
    const L = best.level;
    // nothing to reflect into when the water is off screen
    _box.min.set(Math.max(best.minX, p.x - 3000), L - 0.1, Math.max(best.minZ, p.z - 3000));
    _box.max.set(Math.min(best.maxX, p.x + 3000), L + 0.1, Math.min(best.maxZ, p.z + 3000));
    _frus.setFromProjectionMatrix(_pm.multiplyMatrices(camera.projectionMatrix, camera.matrixWorldInverse));
    if (!_frus.intersectsBox(_box)) return;
    // size the target to the drawing buffer
    const size = renderer.getDrawingBufferSize(_size);
    const w = Math.max(16, Math.floor(size.x * this.scale)), h = Math.max(16, Math.floor(size.y * this.scale));
    if (this.rt.width !== w || this.rt.height !== h) this.rt.setSize(w, h);
    // mirrored camera
    const vc = this.cam;
    vc.position.set(p.x, 2 * L - p.y, p.z);
    const fwd = camera.getWorldDirection(_f); fwd.y = -fwd.y;
    vc.up.set(0, 1, 0).applyQuaternion(camera.quaternion); vc.up.y = -vc.up.y;
    vc.lookAt(_t.copy(vc.position).add(fwd));
    vc.fov = camera.fov; vc.aspect = camera.aspect; vc.near = camera.near; vc.far = camera.far;
    vc.updateProjectionMatrix();
    vc.updateMatrixWorld();
    vc.matrixWorldInverse.copy(vc.matrixWorld).invert();
    // texture matrix: world -> reflection uv
    REFL.uReflMatrix.value.set(0.5, 0, 0, 0.5, 0, 0.5, 0, 0.5, 0, 0, 0.5, 0.5, 0, 0, 0, 1)
      .multiply(vc.projectionMatrix).multiply(vc.matrixWorldInverse);
    // oblique near plane at the water surface (Lengyel), so nothing below it is drawn
    _plane.setFromNormalAndCoplanarPoint(_n.set(0, 1, 0), _t.set(0, L, 0)).applyMatrix4(vc.matrixWorldInverse);
    _clip.set(_plane.normal.x, _plane.normal.y, _plane.normal.z, _plane.constant);
    const e = vc.projectionMatrix.elements;
    _q.set((Math.sign(_clip.x) + e[8]) / e[0], (Math.sign(_clip.y) + e[9]) / e[5], -1, (1 + e[10]) / e[14]);
    _clip.multiplyScalar(2 / _clip.dot(_q));
    e[2] = _clip.x; e[6] = _clip.y; e[10] = _clip.z + 1 - 0.003; e[14] = _clip.w;
    vc.projectionMatrixInverse.copy(vc.projectionMatrix).invert();
    // render without the water, grass and screen-facing effects; reuse this frame's shadows
    this.hidden.length = 0;
    root.traverseVisible((o) => { if (o.userData.noReflect || o.name === 'water') this.hidden.push(o); });
    for (const o of this.hidden) o.visible = false;
    const sm = renderer.shadowMap.autoUpdate;
    renderer.shadowMap.autoUpdate = false;
    const camPos = _c.copy(G.uCamPos.value);
    G.uCamPos.value.copy(vc.position);
    const prevTarget = renderer.getRenderTarget();
    renderer.setRenderTarget(this.rt);
    renderer.clear();
    PASS.reflect = true;
    renderer.render(scene, vc);
    PASS.reflect = false;
    renderer.setRenderTarget(prevTarget);
    G.uCamPos.value.copy(camPos);
    renderer.shadowMap.autoUpdate = sm;
    for (const o of this.hidden) o.visible = true;
    REFL.uReflLevel.value = L;
    REFL.uReflOn.value = 1;
  }

  dispose() {
    this.rt.dispose();
    REFL.uReflOn.value = 0;
    REFL.tReflect.value = null;
  }
}

const _size = new THREE.Vector2(), _f = new THREE.Vector3(), _t = new THREE.Vector3(), _n = new THREE.Vector3(), _c = new THREE.Vector3();
const _plane = new THREE.Plane(), _clip = new THREE.Vector4(), _q = new THREE.Vector4();
const _box = new THREE.Box3(), _frus = new THREE.Frustum(), _pm = new THREE.Matrix4();

export function buildWater(map: BuiltMap, baker: TextureBaker, heightTex: THREE.DataTexture): THREE.Group {
  const group = new THREE.Group();
  group.name = 'water';
  const hf = map.world.terrain;
  const waves = baker.get('water', undefined, '', 0.5);
  for (const w of map.world.water) {
    const sea = w.kind === 'sea';
    // the sea runs to the horizon; land hides the parts of the plane it covers
    const geo = sea ? new THREE.PlaneGeometry(9000, 9000, 1, 1) : new THREE.PlaneGeometry(Math.min(w.maxX, 2000) - Math.max(w.minX, -2000), Math.min(w.maxZ, 2000) - Math.max(w.minZ, -2000), 1, 1);
    geo.rotateX(-Math.PI / 2);
    if (sea) geo.translate(0, w.level, 0);
    else geo.translate((Math.max(w.minX, -2000) + Math.min(w.maxX, 2000)) / 2, w.level, (Math.max(w.minZ, -2000) + Math.min(w.maxZ, 2000)) / 2);
    const murky = w.kind === 'moat' ? new THREE.Color(0.018, 0.026, 0.016) : w.kind === 'river' ? new THREE.Color(0.02, 0.03, 0.024) : new THREE.Color(0.012, 0.03, 0.038);
    const mat = new THREE.MeshStandardMaterial({ color: murky, roughness: 0.09, metalness: 0.0, transparent: true, normalMap: waves.normal, envMapIntensity: 0.75 });
    prepare(mat, [(s) => {
      s.uniforms.tHeight = { value: heightTex };
      s.uniforms.uTerr = { value: new THREE.Vector4(hf.origin, hf.size, w.level, sea ? 1 : 0) };
      s.uniforms.uTime = G.uTime;
      s.uniforms.uDeep = { value: murky };
      s.uniforms.tReflect = REFL.tReflect;
      s.uniforms.uReflMatrix = REFL.uReflMatrix;
      s.uniforms.uReflLevel = REFL.uReflLevel;
      s.uniforms.uReflOn = REFL.uReflOn;
      s.vertexShader = s.vertexShader
        .replace('#include <common>', '#include <common>\nvarying vec3 vWW;')
        .replace('#include <worldpos_vertex>', '#include <worldpos_vertex>\nvWW = (modelMatrix * vec4(transformed, 1.0)).xyz;');
      s.fragmentShader = s.fragmentShader
        .replace('#include <common>', '#include <common>\nuniform sampler2D tHeight; uniform vec4 uTerr; uniform float uTime; uniform vec3 uDeep; varying vec3 vWW;\nuniform sampler2D tReflect; uniform mat4 uReflMatrix; uniform float uReflLevel; uniform float uReflOn;\nvec3 gWaveN = vec3(0.0, 0.0, 1.0);')
        .replace('#include <normal_fragment_maps>', /* glsl */ `
{
  vec2 p = vWW.xz;
  vec3 n1 = texture2D(normalMap, p * 0.045 + vec2(uTime * 0.012, uTime * 0.008)).xyz * 2.0 - 1.0;
  vec3 n2 = texture2D(normalMap, p * 0.11 - vec2(uTime * 0.017, -uTime * 0.011)).xyz * 2.0 - 1.0;
  vec3 n3 = texture2D(normalMap, p * 0.31 + vec2(uTime * 0.03, uTime * 0.021)).xyz * 2.0 - 1.0;
  vec3 wn = normalize(vec3((n1.xy + n2.xy * 0.7 + n3.xy * 0.35) * (uTerr.w > 0.5 ? 0.55 : 0.32), 1.0));
  gWaveN = wn;
  vec3 worldN = normalize(vec3(wn.x, wn.z, wn.y));
  normal = normalize((viewMatrix * vec4(worldN, 0.0)).xyz);
}`)
        .replace('#include <alphamap_fragment>', /* glsl */ `#include <alphamap_fragment>
{
  vec2 tuv = (vWW.xz - uTerr.x) / uTerr.y;
  float ground = (tuv.x < 0.0 || tuv.y < 0.0 || tuv.x > 1.0 || tuv.y > 1.0) ? uTerr.z - 30.0 : texture2D(tHeight, tuv).r;
  float depth = max(uTerr.z - ground, 0.0);
  float a = smoothstep(0.0, 1.6, depth);
  diffuseColor.a = mix(0.25, 0.97, a);
  diffuseColor.rgb = mix(vec3(0.16, 0.15, 0.1), uDeep, smoothstep(0.0, 2.5, depth));
}`)
        .replace('#include <opaque_fragment>', /* glsl */ `
{
  vec3 V = normalize(cameraPosition - vWW);
  float cosT = max(dot(V, vec3(0.0, 1.0, 0.0)), 0.0);
  float fres = pow(1.0 - cosT, 4.0);
  diffuseColor.a = clamp(diffuseColor.a + fres * 0.5, 0.0, 1.0);
  if (uReflOn > 0.5 && abs(uTerr.z - uReflLevel) < 0.05) {
    vec4 ruv = uReflMatrix * vec4(vWW, 1.0);
    vec2 uv = ruv.xy / ruv.w + gWaveN.xy * (uTerr.w > 0.5 ? 0.055 : 0.042);
    // a living surface never mirrors perfectly
    vec3 refl = texture2D(tReflect, clamp(uv, vec2(0.001), vec2(0.999))).rgb * 0.9;
    // Schlick fresnel for water (F0 = 0.02), slightly softened by the ripples
    float F = 0.02 + 0.98 * pow(1.0 - cosT, 5.0);
    F = clamp(F * 0.95 + 0.04, 0.0, 1.0);
    outgoingLight = mix(outgoingLight, refl, F);
    diffuseColor.a = clamp(max(diffuseColor.a, F * 1.2), 0.0, 1.0);
  }
}
#include <opaque_fragment>`);
    }], ['water' + w.kind]);
    const mesh = new THREE.Mesh(geo, mat);
    mesh.receiveShadow = true;
    mesh.renderOrder = 5;
    group.add(mesh);
  }
  return group;
}
