// Assembles the visual world for a map: sky & lighting, terrain, castle, props, vegetation,
// water and fire lights.

import * as THREE from 'three';
import type { BuiltMap } from '../../shared/world/mapgen';
import type { Renderer } from './renderer';
import { TextureBaker } from './textures';
import { buildSky, type SkyResult } from './sky';
import { buildTerrain, type TerrainView } from './terrain';
import { buildStructures, structureMaterials } from './structures';
import { buildProps, flagUniforms, type PropsView } from './props';
import { buildVegetation, type VegetationView } from './vegetation';
import { buildWater, PlanarReflection } from './water';
import { canvasTexture, drawBanner } from './heraldry';
import { G, unregisterWorld, beginWorld, endWorld } from './materials';

let worldCounter = 0;

export interface WorldView {
  map: BuiltMap;
  baker: TextureBaker;
  sky: SkyResult;
  root: THREE.Group;
  terrain: TerrainView;
  heightTex: THREE.DataTexture;
  fires: { x: number; y: number; z: number; color: number; intensity: number }[];
  update(dt: number): void;
  dispose(): void;
}

export async function buildWorldView(r: Renderer, map: BuiltMap, onProgress?: (p: number, label: string) => void): Promise<WorldView> {
  const q = r.settings.quality;
  const worldId = ++worldCounter;
  beginWorld(worldId);
  const step = async (p: number, label: string) => { onProgress?.(p, label); await new Promise((res) => setTimeout(res, 0)); };
  const baker = new TextureBaker(r.renderer, q >= 3 ? 1024 : q <= 0 ? 512 : 1024);
  await step(0.05, 'Raising the sky');
  const atm = map.def.atmosphere;
  const sky = await buildSky(r.renderer, atm);
  r.scene.environment = sky.envMap;
  r.scene.environmentIntensity = sky.envIntensity;
  r.scene.background = null;
  r.setSun(sky.sunDir, sky.sunColor, sky.sunIntensity);
  r.grade.u('exposure').value = atm.exposure;
  G.uWind.value = atm.wind;
  const root = new THREE.Group();
  root.name = 'world';
  root.add(sky.dome);
  await step(0.15, 'Quarrying stone and turf');
  const terrain = buildTerrain(map, baker, q);
  root.add(terrain.group);
  await step(0.4, 'Building the castle');
  const structs = buildStructures(map, structureMaterials(baker, q));
  root.add(structs);
  await step(0.6, 'Pitching tents');
  const flags = [canvasTexture(256, 512, (c, w, h) => drawBanner(c, w, h, 0)), canvasTexture(256, 512, (c, w, h) => drawBanner(c, w, h, 1))];
  const props: PropsView = buildProps(map, baker, (t) => flags[t]);
  root.add(props.group);
  await step(0.75, 'Planting the greenwood');
  const veg: VegetationView = buildVegetation(map, baker, q, terrain.heightTex, terrain.splatTex);
  root.add(veg.group);
  await step(0.88, 'Filling the moat');
  root.add(buildWater(map, baker, terrain.heightTex));
  // the castle and the knights mirrored in the moat (Medium and up)
  const reflection = q >= 1 && map.world.water.length ? new PlanarReflection(q >= 2 ? 0.5 : 0.33, q >= 2 ? 1 : 2) : null;
  const reflect = reflection ? () => reflection.render(r.renderer, r.scene, r.camera, map.world.water, root) : null;
  if (reflect) r.preRender.push(reflect);

  // fire lights: a small pool of point lights follows the camera to the nearest fires
  const fires = map.lights.map((l) => ({ ...l }));
  const pool: THREE.PointLight[] = [];
  const nLights = q >= 3 ? 8 : q === 2 ? 6 : q === 1 ? 3 : 0;
  for (let i = 0; i < nLights; i++) {
    const pl = new THREE.PointLight(0xff8a3a, 0, 16, 1.6);
    pl.castShadow = false;
    root.add(pl);
    pool.push(pl);
  }
  r.scene.add(root);
  endWorld();
  await step(1, 'Ready');

  let fireTimer = 0;
  const assigned: number[] = [];
  const tmp = new THREE.Vector3();
  return {
    map, baker, sky, root, terrain, heightTex: terrain.heightTex, fires,
    update(dt) {
      const cam = r.camera;
      terrain.update(cam);
      veg.update(cam, G.uTime.value);
      for (const u of flagUniforms) u.value = G.uTime.value;
      sky.dome.position.copy(cam.position);
      fireTimer -= dt;
      if (fireTimer <= 0 && pool.length) {
        fireTimer = 0.5;
        const order = fires.map((f, i) => ({ i, d: tmp.set(f.x, f.y, f.z).distanceToSquared(cam.position) })).sort((a, b) => a.d - b.d);
        assigned.length = 0;
        for (let k = 0; k < pool.length; k++) assigned.push(order[k]?.i ?? -1);
      }
      const t = G.uTime.value;
      pool.forEach((pl, k) => {
        const fi = assigned[k] ?? -1;
        if (fi < 0) { pl.intensity = 0; return; }
        const f = fires[fi];
        pl.position.set(f.x, f.y + 0.25, f.z);
        const flick = 0.82 + 0.12 * Math.sin(t * 13.1 + fi) + 0.08 * Math.sin(t * 29.7 + fi * 3.1);
        pl.intensity = f.intensity * flick * 1.4;
      });
    },
    dispose() {
      if (reflect) { const i = r.preRender.indexOf(reflect); if (i >= 0) r.preRender.splice(i, 1); }
      reflection?.dispose();
      r.scene.remove(root);
      root.traverse((o) => {
        const m = o as THREE.Mesh;
        if (m.geometry) m.geometry.dispose();
      });
      terrain.dispose(); veg.dispose(); props.dispose(); sky.dispose();
      flags.forEach((f) => f.dispose());
      unregisterWorld(worldId);
    },
  };
}
