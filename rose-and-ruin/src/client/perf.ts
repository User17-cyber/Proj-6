// Frame profiler: per-stage CPU times, frame rate, draw calls and triangles across every
// pass. Toggle the overlay with F3 (or open the page with ?perf).

export class Perf {
  enabled = false;
  private el: HTMLElement | null = null;
  private t: Record<string, number> = {};
  private sum: Record<string, number> = {};
  private order: string[] = [];
  private frames = 0;
  private wall = 0;
  private timer = 0;
  /** last published averages (also readable by tests as window.__perf) */
  stats: Record<string, number> = {};

  constructor(on: boolean) { if (on) this.toggle(); }

  toggle() {
    this.enabled = !this.enabled;
    if (this.enabled && !this.el) {
      this.el = document.createElement('div');
      this.el.style.cssText = 'position:fixed;right:8px;bottom:8px;z-index:80;font:12px/1.35 ui-monospace,Menlo,Consolas,monospace;color:#e8dbbd;background:rgba(10,8,6,.82);padding:8px 10px;border:1px solid rgba(201,162,79,.5);white-space:pre;pointer-events:none';
      document.body.appendChild(this.el);
    }
    if (this.el) this.el.style.display = this.enabled ? '' : 'none';
  }

  begin(name: string) { this.t[name] = performance.now(); }
  end(name: string) {
    const d = performance.now() - (this.t[name] ?? performance.now());
    if (!(name in this.sum)) { this.sum[name] = 0; this.order.push(name); }
    this.sum[name] += d;
  }

  /** Call once per frame with the frame's wall time and the renderer counters. */
  frame(dt: number, info: { calls: number; triangles: number }, extra: Record<string, number | string>) {
    this.frames++;
    this.wall += dt;
    this.sum.calls = (this.sum.calls ?? 0) + info.calls;
    this.sum.tris = (this.sum.tris ?? 0) + info.triangles;
    this.timer += dt;
    if (this.timer < 0.5) return;
    const n = this.frames;
    const s: Record<string, number> = { fps: n / this.wall, frameMs: (this.wall / n) * 1000, calls: this.sum.calls / n, tris: this.sum.tris / n };
    for (const k of this.order) s[k] = this.sum[k] / n;
    this.stats = s;
    (window as unknown as { __perf: Record<string, number> }).__perf = s;
    if (this.enabled && this.el) {
      const lines = [`${s.fps.toFixed(0)} fps  ${s.frameMs.toFixed(1)} ms`, `draws ${s.calls.toFixed(0)}  tris ${(s.tris / 1e6).toFixed(2)}M`];
      for (const k of this.order) lines.push(`${k.padEnd(8)} ${s[k].toFixed(2)} ms`);
      for (const [k, v] of Object.entries(extra)) lines.push(`${k.padEnd(8)} ${typeof v === 'number' ? v.toFixed(2) : v}`);
      this.el.textContent = lines.join('\n');
    }
    this.frames = 0; this.wall = 0; this.timer = 0;
    for (const k of Object.keys(this.sum)) this.sum[k] = 0;
  }
}
