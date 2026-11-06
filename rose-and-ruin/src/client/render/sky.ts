// Sky & image-based lighting from real HDRIs (CC0, Poly Haven).
//  - a sky dome samples the high-res background (decoded from the compact JPEG encoding)
//  - the 1k HDR becomes the PMREM environment, rotated to the map's sun azimuth and with
//    the lower hemisphere replaced by a ground colour so armour reflects earth, not desert
//  - the sun direction and colour come from the HDRI itself (see tools/process_sky.py)

import * as THREE from 'three';
import { HDRLoader } from 'three/examples/jsm/loaders/HDRLoader.js';
import type { Atmosphere, SkyId } from '../../shared/world/mapgen';
import { G } from './materials';

export interface SkyManifestEntry {
  sunDir: [number, number, number]; sunElevationDeg: number; sunAzimuthDeg: number;
  sunColor: [number, number, number]; bgExposure: number; skyMedian: number; skyMean: number;
}

const BASE = './assets/sky/';
let manifestP: Promise<Record<SkyId, SkyManifestEntry>> | null = null;
export function skyManifest() {
  if (!manifestP) manifestP = fetch(BASE + 'manifest.json').then((r) => r.json());
  return manifestP;
}

const SKY_VERT = /* glsl */ `
varying vec3 vDir;
void main() {
  vDir = position;
  vec4 p = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
  gl_Position = p.xyww;
}`;
const SKY_FRAG = /* glsl */ `
uniform sampler2D uBg; uniform float uBgExp; uniform float uRot; uniform float uIntensity;
uniform vec3 uSunDir; uniform vec3 uSunColor; uniform float uSunDisc; uniform vec3 uFog; uniform float uHaze; uniform vec3 uGround;
varying vec3 vDir;
#define PI 3.141592653589793
void main() {
  vec3 d = normalize(vDir);
  float c = cos(uRot), s = sin(uRot);
  vec3 hd = vec3(c * d.x + s * d.z, d.y, -s * d.x + c * d.z);
  float sy = max(hd.y, 0.004);
  vec3 hs = normalize(vec3(hd.x, sy, hd.z));
  vec2 uv = vec2(atan(hs.z, hs.x) / (2.0 * PI) + 0.5, asin(clamp(hs.y, -1.0, 1.0)) / PI + 0.5);
  // explicit LOD: the atan seam would otherwise pick a tiny mip and draw a dark line
  vec3 e = textureLod(uBg, uv, 0.0).rgb;
  vec3 v = pow(e, vec3(2.2));
  vec3 col = v / max(vec3(1.0) - v, vec3(1e-3)) / uBgExp * uIntensity;
  // atmospheric haze toward the horizon, solid ground colour below it
  float haze = exp(-max(d.y, 0.0) * 9.0) * uHaze;
  col = mix(col, uFog, clamp(haze, 0.0, 1.0));
  col = mix(col, uGround, smoothstep(0.0, -0.06, d.y));
  float sd = dot(d, uSunDir);
  col += uSunColor * (smoothstep(0.99985, 0.99997, sd) * 60.0 + pow(max(sd, 0.0), 900.0) * 3.0) * uSunDisc;
  gl_FragColor = vec4(col, 1.0);
}`;

const ENV_FRAG = /* glsl */ `
uniform sampler2D uEnv; uniform float uRot; uniform vec3 uGround; uniform vec3 uFog; uniform float uHaze;
varying vec2 vUv;
#define PI 3.141592653589793
void main() {
  float phi = (vUv.x - 0.5) * 2.0 * PI;
  float th = (vUv.y - 0.5) * PI;
  vec3 d = vec3(cos(th) * cos(phi), sin(th), cos(th) * sin(phi));
  float c = cos(uRot), s = sin(uRot);
  vec3 hd = vec3(c * d.x + s * d.z, d.y, -s * d.x + c * d.z);
  vec2 uv = vec2(atan(hd.z, hd.x) / (2.0 * PI) + 0.5, asin(clamp(hd.y, -1.0, 1.0)) / PI + 0.5);
  vec3 col = texture2D(uEnv, uv).rgb;
  col = mix(col, uFog, clamp(exp(-max(d.y, 0.0) * 9.0) * uHaze * 0.7, 0.0, 1.0));
  col = mix(col, uGround, smoothstep(0.02, -0.12, d.y));
  gl_FragColor = vec4(col, 1.0);
}`;

export interface SkyResult {
  dome: THREE.Mesh;
  envMap: THREE.Texture;
  sunDir: THREE.Vector3;   // toward the sun
  sunColor: THREE.Color;
  sunIntensity: number;
  envIntensity: number;
  fogColor: THREE.Color;
  sunVisible: boolean;
  dispose(): void;
}

export async function buildSky(renderer: THREE.WebGLRenderer, atm: Atmosphere): Promise<SkyResult> {
  const man = (await skyManifest())[atm.sky];
  const hdr = new HDRLoader();
  hdr.setDataType(THREE.FloatType);
  const [envTex, bgTex] = await Promise.all([
    hdr.loadAsync(BASE + atm.sky + '_env.hdr'),
    new THREE.TextureLoader().loadAsync(BASE + atm.sky + '_bg.jpg'),
  ]);
  bgTex.colorSpace = THREE.NoColorSpace;
  bgTex.generateMipmaps = false;
  bgTex.minFilter = THREE.LinearFilter;
  bgTex.anisotropy = 4;
  envTex.mapping = THREE.EquirectangularReflectionMapping;
  envTex.minFilter = THREE.LinearFilter;
  envTex.magFilter = THREE.LinearFilter;
  envTex.generateMipmaps = false;

  // rotation that puts the HDRI's sun at the requested azimuth
  const rot = THREE.MathUtils.degToRad(atm.sunAzimuth - man.sunAzimuthDeg);
  const rotDir = (x: number, y: number, z: number) => {
    // world = R(+rot) * hdri   (inverse of the shader's world->hdri mapping)
    const c = Math.cos(rot), s = Math.sin(rot);
    return new THREE.Vector3(c * x - s * z, y, s * x + c * z);
  };
  const hdrSun = rotDir(man.sunDir[0], man.sunDir[1], man.sunDir[2]).normalize();
  let sunDir = hdrSun.clone();
  let sunVisible = true;
  if (atm.sunElevation !== undefined) {
    const az = Math.atan2(hdrSun.z, hdrSun.x);
    const el = THREE.MathUtils.degToRad(atm.sunElevation);
    sunDir = new THREE.Vector3(Math.cos(el) * Math.cos(az), Math.sin(el), Math.cos(el) * Math.sin(az));
    sunVisible = false;
  }

  // fog/horizon colour: average of the environment in a band just above the horizon
  const img = envTex.image as { data: Float32Array; width: number; height: number };
  const W = img.width, H = img.height;
  const fog = new THREE.Color(0, 0, 0);
  let cnt = 0;
  // robust average: skip the sun and its glare
  const capL = man.skyMedian * 2.5;
  for (let y = Math.floor(H * 0.43); y < Math.floor(H * 0.49); y++) {
    for (let x = 0; x < W; x += 4) {
      const i = (y * W + x) * 4;
      const r = img.data[i], g = img.data[i + 1], b = img.data[i + 2];
      const l = 0.2126 * r + 0.7152 * g + 0.0722 * b;
      const k = l > capL ? capL / l : 1;
      fog.r += r * k; fog.g += g * k; fog.b += b * k;
      cnt++;
    }
  }
  fog.multiplyScalar(1 / cnt);
  // HDR row 0 is the top of the image when flipY... the loader stores rows top-down; the band
  // above is chosen in both halves symmetric enough. Tint with the map's fog colour.
  const tint = new THREE.Color(atm.fogColor[0], atm.fogColor[1], atm.fogColor[2]);
  const fogLum = Math.max(0.05, fog.r * 0.2126 + fog.g * 0.7152 + fog.b * 0.0722);
  const fogColor = new THREE.Color(
    THREE.MathUtils.lerp(fog.r, tint.r * fogLum * 1.4, 0.5),
    THREE.MathUtils.lerp(fog.g, tint.g * fogLum * 1.4, 0.5),
    THREE.MathUtils.lerp(fog.b, tint.b * fogLum * 1.4, 0.5),
  ).multiplyScalar(atm.envIntensity);
  const sunColor = new THREE.Color(man.sunColor[0], man.sunColor[1], man.sunColor[2]);
  // the ground the armour reflects: dark turf lit by sky and sun
  const ground = new THREE.Color(0.16, 0.15, 0.1).multiplyScalar(fogLum * 0.9 + atm.sunIntensity * Math.max(0.1, sunDir.y) * 0.08);

  // processed environment
  const rt = new THREE.WebGLRenderTarget(W, H, { type: THREE.HalfFloatType, depthBuffer: false, generateMipmaps: false, minFilter: THREE.LinearFilter, magFilter: THREE.LinearFilter });
  const envMat = new THREE.ShaderMaterial({
    vertexShader: 'varying vec2 vUv; void main(){ vUv = uv; gl_Position = vec4(position.xy, 0.0, 1.0); }',
    fragmentShader: ENV_FRAG,
    uniforms: { uEnv: { value: envTex }, uRot: { value: rot }, uGround: { value: ground }, uFog: { value: fogColor.clone().multiplyScalar(1 / Math.max(0.01, atm.envIntensity)) }, uHaze: { value: atm.haze } },
    depthTest: false, depthWrite: false,
  });
  const quad = new THREE.Mesh(new THREE.PlaneGeometry(2, 2), envMat);
  quad.frustumCulled = false;
  const qs = new THREE.Scene(); qs.add(quad);
  const prev = renderer.getRenderTarget();
  renderer.setRenderTarget(rt);
  renderer.render(qs, new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1));
  renderer.setRenderTarget(prev);
  rt.texture.mapping = THREE.EquirectangularReflectionMapping;
  const pmrem = new THREE.PMREMGenerator(renderer);
  const envRT = pmrem.fromEquirectangular(rt.texture);
  pmrem.dispose();
  rt.dispose(); envMat.dispose(); quad.geometry.dispose();

  const domeMat = new THREE.ShaderMaterial({
    vertexShader: SKY_VERT,
    fragmentShader: SKY_FRAG,
    uniforms: {
      uBg: { value: bgTex }, uBgExp: { value: man.bgExposure }, uRot: { value: rot }, uIntensity: { value: atm.envIntensity },
      uSunDir: { value: sunDir }, uSunColor: { value: sunColor.clone().multiplyScalar(sunVisible ? 1 : 0) }, uSunDisc: { value: sunVisible ? 1 : 0 },
      uFog: { value: fogColor }, uHaze: { value: atm.haze }, uGround: { value: ground.clone().multiplyScalar(atm.envIntensity) },
    },
    side: THREE.BackSide,
    depthWrite: false,
    depthTest: true,
  });
  const dome = new THREE.Mesh(new THREE.SphereGeometry(5000, 64, 32), domeMat);
  dome.frustumCulled = false;
  dome.renderOrder = -1000;
  dome.matrixAutoUpdate = true;

  G.uFogColor.value.copy(fogColor);
  G.uFogSun.value.copy(sunColor).multiplyScalar(fogLum * 2.2 * atm.envIntensity).lerp(fogColor, 0.35);
  G.uFogDensity.value = atm.fogDensity;
  G.uFogFalloff.value = 1 / Math.max(5, atm.fogHeight);
  G.uSunDir.value.copy(sunDir);
  envTex.dispose();

  return {
    dome, envMap: envRT.texture, sunDir, sunColor, sunIntensity: atm.sunIntensity, envIntensity: atm.envIntensity, fogColor, sunVisible,
    dispose() { envRT.dispose(); bgTex.dispose(); domeMat.dispose(); dome.geometry.dispose(); },
  };
}
