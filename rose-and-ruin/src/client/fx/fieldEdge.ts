// The edge of the field of battle: a line of stakes with a rope slung between them, and a pennant
// here and there, so the bound the hosts may not pass is plain to see on the ground.

import * as THREE from 'three';
import type { StaticWorld } from '../../shared/world/world';

const STEP = 3.2;

export function buildFieldEdge(W: StaticWorld): THREE.Group {
  const g = new THREE.Group();
  g.name = 'field-edge';
  const b = W.bounds, inset = 0.6;
  const corners: [number, number][] = [
    [b.minX + inset, b.minZ + inset], [b.maxX - inset, b.minZ + inset],
    [b.maxX - inset, b.maxZ - inset], [b.minX + inset, b.maxZ - inset],
  ];
  // stakes along each side, kept only on open dry ground (walls, cliffs and water bound themselves)
  const posts: ([number, number, number] | null)[] = [];
  for (let s = 0; s < 4; s++) {
    const [ax, az] = corners[s], [bx, bz] = corners[(s + 1) % 4];
    const n = Math.max(1, Math.round(Math.hypot(bx - ax, bz - az) / STEP));
    for (let i = 0; i < n; i++) {
      const x = ax + ((bx - ax) * i) / n, z = az + ((bz - az) * i) / n;
      const y = W.groundAt(x, z, 999);
      const ok = W.walkable(x, z, y) && W.dry(x, z, y, -0.1) && !W.pointBlocked(x, y + 0.8, z, 0.3);
      posts.push(ok ? [x, y, z] : null);
    }
  }
  const kept = posts.filter((p): p is [number, number, number] => !!p);
  if (!kept.length) return g;
  const wood = new THREE.MeshStandardMaterial({ color: 0x5e4630, roughness: 0.9 });
  const rope = new THREE.MeshStandardMaterial({ color: 0xb59a6a, roughness: 1 });
  const m = new THREE.Matrix4(), q = new THREE.Quaternion(), v = new THREE.Vector3(), sc = new THREE.Vector3();
  const stake = new THREE.CylinderGeometry(0.045, 0.06, 1.3, 6);
  stake.translate(0, 0.55, 0);
  const sim = new THREE.InstancedMesh(stake, wood, kept.length);
  kept.forEach((p, i) => {
    q.setFromAxisAngle(v.set(1, 0, 0), Math.sin(p[0] * 3.1 + p[2] * 1.7) * 0.06);
    m.compose(new THREE.Vector3(p[0], p[1], p[2]), q, sc.set(1, 1, 1));
    sim.setMatrixAt(i, m);
  });
  sim.castShadow = true;
  g.add(sim);
  // rope between each pair of neighbouring stakes that both stand
  const spans: [number, number, number, number, number, number][] = [];
  for (let i = 0; i < posts.length; i++) {
    const a = posts[i], c = posts[(i + 1) % posts.length];
    if (!a || !c) continue;
    if (Math.abs(a[1] - c[1]) > 2.2) continue;
    spans.push([a[0], a[1] + 1.05, a[2], c[0], c[1] + 1.05, c[2]]);
  }
  if (spans.length) {
    const seg = new THREE.CylinderGeometry(0.014, 0.014, 1, 4);
    seg.rotateX(Math.PI / 2);
    const rim = new THREE.InstancedMesh(seg, rope, spans.length);
    const up = new THREE.Vector3(0, 0, 1);
    spans.forEach((s, i) => {
      const d = new THREE.Vector3(s[3] - s[0], s[4] - s[1], s[5] - s[2]);
      const len = d.length();
      q.setFromUnitVectors(up, d.normalize());
      m.compose(new THREE.Vector3((s[0] + s[3]) / 2, (s[1] + s[4]) / 2 - 0.06, (s[2] + s[5]) / 2), q, sc.set(1, 1, len));
      rim.setMatrixAt(i, m);
    });
    g.add(rim);
  }
  // a red pennant every so often
  const cloth = new THREE.MeshStandardMaterial({ color: 0x8e1c1c, roughness: 0.85, side: THREE.DoubleSide });
  const flag = new THREE.BufferGeometry();
  flag.setAttribute('position', new THREE.Float32BufferAttribute([0, 0, 0, 0, -0.32, 0, 0.5, -0.16, 0], 3));
  flag.computeVertexNormals();
  const every = Math.max(1, Math.round(22 / STEP));
  const flags = kept.filter((_, i) => i % every === 0);
  const fim = new THREE.InstancedMesh(flag, cloth, flags.length);
  flags.forEach((p, i) => {
    q.setFromAxisAngle(v.set(0, 1, 0), (p[0] * 0.37 + p[2] * 0.11) % (Math.PI * 2));
    m.compose(new THREE.Vector3(p[0], p[1] + 1.2, p[2]), q, sc.set(1, 1, 1));
    fim.setMatrixAt(i, m);
  });
  g.add(fim);
  return g;
}
