// Rain: streaks falling through a box that travels with the camera, slanted by the wind. Each
// drop is a short line segment; when it reaches the ground (or the bottom of the box) it is
// returned to the top.

import * as THREE from 'three';

export class Rain {
  readonly mesh: THREE.LineSegments;
  private pos: Float32Array;
  private drops: Float32Array; // x, y, z, speed for each drop (relative to the box)
  private n: number;
  private readonly W = 70; private readonly H = 34;

  constructor(amount: number, quality: number, private wind: number) {
    this.n = Math.round((quality >= 3 ? 9000 : quality >= 2 ? 6000 : 3500) * Math.max(0.2, Math.min(1, amount)));
    this.pos = new Float32Array(this.n * 6);
    this.drops = new Float32Array(this.n * 4);
    for (let i = 0; i < this.n; i++) {
      this.drops[i * 4] = (Math.random() - 0.5) * this.W;
      this.drops[i * 4 + 1] = Math.random() * this.H;
      this.drops[i * 4 + 2] = (Math.random() - 0.5) * this.W;
      this.drops[i * 4 + 3] = 16 + Math.random() * 6;
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.BufferAttribute(this.pos, 3).setUsage(THREE.DynamicDrawUsage));
    const m = new THREE.LineBasicMaterial({ color: 0xb8c4d0, transparent: true, opacity: 0.32 * Math.min(1, amount + 0.2), depthWrite: false, fog: true });
    this.mesh = new THREE.LineSegments(g, m);
    this.mesh.frustumCulled = false;
    this.mesh.renderOrder = 5;
    this.mesh.userData.noReflect = true;
  }

  update(dt: number, cam: THREE.Vector3, ground: (x: number, z: number) => number) {
    const d = this.drops, p = this.pos, W = this.W, H = this.H;
    const wx = this.wind * 3.2, wz = this.wind * 1.4;
    const by = cam.y - H * 0.45;
    for (let i = 0; i < this.n; i++) {
      const o = i * 4;
      d[o + 1] -= d[o + 3] * dt;
      d[o] += wx * dt; d[o + 2] += wz * dt;
      // keep the box centred on the camera
      if (d[o] > W / 2) d[o] -= W; else if (d[o] < -W / 2) d[o] += W;
      if (d[o + 2] > W / 2) d[o + 2] -= W; else if (d[o + 2] < -W / 2) d[o + 2] += W;
      const x = cam.x + d[o], z = cam.z + d[o + 2];
      let y = by + d[o + 1];
      if (d[o + 1] < 0 || (i & 7) === 0 && y < ground(x, z)) { d[o + 1] += H; y = by + d[o + 1]; }
      const len = 0.035 * d[o + 3];
      const q = i * 6;
      p[q] = x; p[q + 1] = y; p[q + 2] = z;
      p[q + 3] = x - wx * 0.035; p[q + 4] = y + len; p[q + 5] = z - wz * 0.035;
    }
    (this.mesh.geometry.getAttribute('position') as THREE.BufferAttribute).needsUpdate = true;
  }
}
