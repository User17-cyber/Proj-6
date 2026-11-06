import { Renderer } from './render/renderer';
import { buildWorldView } from './render/world';
import { buildMap } from '../shared/world/maps/index';
import { setupParade, paradeCamera } from './debugKnights';

// Temporary world viewer (replaced by the full app).
async function boot() {
  const params = new URLSearchParams(location.search);
  const mapId = params.get('view') ?? 'bodiam';
  const camIdx = Number(params.get('cam') ?? 0);
  const quality = Number(params.get('q') ?? 2) as 0 | 1 | 2 | 3;
  const canvas = document.getElementById('game') as HTMLCanvasElement;
  const r = new Renderer(canvas, { quality, renderScale: 1, ao: quality >= 1 && !params.has('noao'), bloom: !params.has('nobloom'), fov: 62, shadowQuality: quality });
  const map = buildMap(mapId);
  const world = await buildWorldView(r, map, (p, l) => console.log('load', p, l));
  if (params.has('env')) r.scene.environmentIntensity = Number(params.get('env'));
  if (params.has('sun') && r.csm) for (const l of r.csm.lights) l.intensity = Number(params.get('sun'));
  if (params.has('debug')) {
    world.root.updateMatrixWorld(true);
    world.root.traverse((o) => {
      const m = o as unknown as { isMesh?: boolean; geometry?: { boundingBox: { max: { y: number }; min: { y: number } } | null; computeBoundingBox(): void }; name: string; material?: { type: string } };
      if (!m.isMesh || !m.geometry) return;
      if (!m.geometry.boundingBox) m.geometry.computeBoundingBox();
      const bb = m.geometry.boundingBox!;
      if (bb.max.y > 60) console.log('tall', o.type, m.material?.type, JSON.stringify(bb));
    });
  }
  if (params.has('hide')) for (const name of params.get('hide')!.split(',')) { const o = world.root.getObjectByName(name); if (o) o.visible = false; }
  const c = map.camera[camIdx % map.camera.length];
  r.camera.position.set(c.x, c.y, c.z);
  r.camera.lookAt(c.tx, c.ty, c.tz);
  if (params.has('pos')) {
    const [x, y, z, tx, ty, tz] = params.get('pos')!.split(',').map(Number);
    r.camera.position.set(x, y, z);
    r.camera.lookAt(tx, ty, tz);
  }
  let parade: ((dt: number) => void) | null = null;
  if (params.has('knights')) { parade = setupParade(r, world, params); paradeCamera(r, params, world); }
  let last = performance.now();
  let frames = 0;
  const maxFrames = Number(params.get('frames') ?? 0);
  const loop = () => {
    const now = performance.now();
    const dt = Math.min(0.05, (now - last) / 1000);
    last = now;
    world.update(dt);
    if (parade) parade(params.has('frames') ? 1 / 30 : dt);
    r.render(dt);
    frames++;
    if (maxFrames && frames >= maxFrames) { (window as unknown as { __ready: boolean; __stats: unknown }).__ready = true; (window as unknown as { __stats: unknown }).__stats = { ...r.stats }; return; }
    if (frames === 8) (window as unknown as { __ready: boolean }).__ready = true;
    requestAnimationFrame(loop);
  };
  loop();
}
boot().catch((e) => { console.error(e); (window as unknown as { __error: string }).__error = String(e?.stack ?? e); });
