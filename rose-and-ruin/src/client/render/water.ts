// Moats, rivers and the sea: scrolling wave normals, fresnel reflections of the sky, sun
// glints, and depth-based transparency/colour using the terrain heightfield.

import * as THREE from 'three';
import type { BuiltMap } from '../../shared/world/mapgen';
import { prepare, G } from './materials';
import type { TextureBaker } from './textures';

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
      s.vertexShader = s.vertexShader
        .replace('#include <common>', '#include <common>\nvarying vec3 vWW;')
        .replace('#include <worldpos_vertex>', '#include <worldpos_vertex>\nvWW = (modelMatrix * vec4(transformed, 1.0)).xyz;');
      s.fragmentShader = s.fragmentShader
        .replace('#include <common>', '#include <common>\nuniform sampler2D tHeight; uniform vec4 uTerr; uniform float uTime; uniform vec3 uDeep; varying vec3 vWW;')
        .replace('#include <normal_fragment_maps>', /* glsl */ `
{
  vec2 p = vWW.xz;
  vec3 n1 = texture2D(normalMap, p * 0.045 + vec2(uTime * 0.012, uTime * 0.008)).xyz * 2.0 - 1.0;
  vec3 n2 = texture2D(normalMap, p * 0.11 - vec2(uTime * 0.017, -uTime * 0.011)).xyz * 2.0 - 1.0;
  vec3 n3 = texture2D(normalMap, p * 0.31 + vec2(uTime * 0.03, uTime * 0.021)).xyz * 2.0 - 1.0;
  vec3 wn = normalize(vec3((n1.xy + n2.xy * 0.7 + n3.xy * 0.35) * (uTerr.w > 0.5 ? 0.55 : 0.32), 1.0));
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
  float fres = pow(1.0 - max(dot(V, vec3(0.0, 1.0, 0.0)), 0.0), 4.0);
  diffuseColor.a = clamp(diffuseColor.a + fres * 0.5, 0.0, 1.0);
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
