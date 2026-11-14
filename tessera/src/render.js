'use strict';
/* Three.js scene: terrain shader, sky, clouds, particles and the first-person held item. */

const TERRAIN_VS = `
attribute vec3 aColor;
attribute vec4 aData;
varying vec3 vColor; varying vec2 vUv; varying vec4 vData; varying float vDist; varying vec3 vWorld;
void main() {
  vColor = aColor; vUv = uv; vData = aData;
  vec4 wp = modelMatrix * vec4(position, 1.0);
  vWorld = wp.xyz;
  vec4 mv = viewMatrix * wp;
  vDist = length(mv.xyz);
  gl_Position = projectionMatrix * mv;
}`;

/* Every surface detail is made of axis-aligned rectangles computed from the face uv. */
const TERRAIN_FS = `
precision highp float;
uniform vec3 uSky; uniform vec3 uFogColor; uniform float uFogNear; uniform float uFogFar; uniform float uTime;
varying vec3 vColor; varying vec2 vUv; varying vec4 vData; varying float vDist; varying vec3 vWorld;
float hash(vec2 p) { vec3 q = fract(vec3(p.xyx) * 0.1031); q += dot(q, q.yzx + 33.33); return fract((q.x + q.y) * q.z); }
bool inRect(vec2 uv, float x0, float y0, float x1, float y1) { return uv.x > x0 && uv.x < x1 && uv.y > y0 && uv.y < y1; }
void main() {
  float packed = floor(vData.x + 0.5);
  float tile = floor(packed / 64.0);
  int pat = int(packed - tile * 64.0 + 0.5);
  vec2 uv = vUv;
  vec3 c = vColor;
  float a = 1.0, m = 1.0;
  bool lit = true;
  float detail = 1.0 - smoothstep(34.0, 80.0, vDist);
  float e = min(min(uv.x, 1.0 - uv.x), min(uv.y, 1.0 - uv.y));
  float bevel = e < 0.045 ? 0.94 : 1.0;
  float dap = 1.0 + (hash(floor(uv * 4.0) + tile * 1.7) - 0.5) * 0.07;

  if (pat == 0) { m = bevel; }
  else if (pat == 1) { m = dap; }
  else if (pat == 2) {
    float row = floor(uv.y * 4.0);
    float sx = uv.x * 2.0 + mod(row, 2.0) * 0.5;
    m = 1.0 + (hash(vec2(floor(sx) + row * 3.0, tile)) - 0.5) * 0.12;
    if (fract(sx) < 0.05 || fract(uv.y * 4.0) < 0.13) m = 0.74;
  } else if (pat == 3) {
    float row = floor(uv.y * 4.0);
    m = 1.0 + (hash(vec2(row, tile)) - 0.5) * 0.1;
    if (fract(uv.y * 4.0) < 0.1 || fract(uv.x + hash(vec2(row * 3.1, tile))) < 0.035) m = 0.78;
  } else if (pat == 4) {
    m = 1.0 + (hash(vec2(floor(uv.x * 6.0), tile)) - 0.5) * 0.2;
    if (inRect(fract(uv * vec2(3.0, 2.0) + hash(vec2(tile, 1.0))), 0.1, 0.1, 0.22, 0.6)) m *= 0.84;
  } else if (pat == 5) {
    float d = max(abs(uv.x - 0.5), abs(uv.y - 0.5)) * 2.0;
    m = mod(floor(d * 5.0), 2.0) < 0.5 ? 1.0 : 0.9;
    if (d > 0.8) m = 0.6;
  } else if (pat >= 6 && pat <= 8) {
    m = dap * bevel;
    vec2 g = floor(uv * 5.0), f = fract(uv * 5.0);
    if (hash(g + tile * 3.3) > 0.7 && g.x > 0.5 && g.x < 3.5 && g.y > 0.5 && g.y < 3.5 || hash(g + tile * 5.1) > 0.9) {
      c = pat == 6 ? vec3(0.14, 0.15, 0.17) : pat == 7 ? vec3(0.88, 0.64, 0.47) : vec3(0.36, 0.92, 0.84);
      m = f.y > 0.72 ? 1.18 : (f.x > 0.75 ? 0.82 : 1.0);
    }
  } else if (pat == 9) {
    float t = 0.78 - step(0.5, hash(vec2(floor(uv.x * 8.0), tile))) * 0.125;
    if (uv.y < t) { c = vec3(0.541, 0.384, 0.267); m = dap; if (uv.y > t - 0.05) m *= 0.86; }
    else m = dap;
  } else if (pat == 10) {
    vec2 f = fract(uv * 3.0);
    m = (f.x < 0.07 || f.y < 0.07 || f.x > 0.93 || f.y > 0.93) ? 0.6 : 1.0;
    if (e < 0.05) m = 0.5;
  } else if (pat == 11) {
    if (uv.y > 0.8) m = 1.1; else if (uv.y > 0.72) m = 0.66;
    else if (uv.x < 0.16 || uv.x > 0.84) m = 0.9; else m = 0.72;
    if (inRect(uv, 0.3, 0.3, 0.38, 0.62) || inRect(uv, 0.3, 0.54, 0.56, 0.62) || inRect(uv, 0.62, 0.2, 0.7, 0.62)) m = 1.25;
  } else if (pat == 12) {
    m = e < 0.07 ? 0.7 : 1.0;
    if (abs(uv.y - 0.64) < 0.035) m = 0.6;
    if (inRect(uv, 0.41, 0.46, 0.59, 0.7)) { c = vec3(0.95, 0.82, 0.42); m = 1.0; }
  } else if (pat == 13) {
    m = fract(uv.y * 4.0) < 0.4 ? 0.78 : 1.0;
  } else if (pat == 14) {
    a = e < 0.08 ? 0.9 : 0.2;
    if (inRect(uv, 0.2, 0.55, 0.3, 0.82) || inRect(uv, 0.36, 0.7, 0.42, 0.82)) { a = 0.55; c = vec3(1.0); }
  } else if (pat == 15) {
    a = 0.74;
    vec2 cell = floor(vWorld.xz * 2.0);
    float hc = hash(cell);
    float ph = uTime * 0.45 + hc * 7.0;
    float glint = hash(cell + floor(ph)) > 0.93 ? sin(fract(ph) * 3.14159) : 0.0;
    m = 1.0 + 0.04 * sin(uTime * 1.1 + vWorld.x * 0.7 + vWorld.z * 1.1) + glint * 0.3 * detail;
    a += glint * 0.15 * detail;
  } else if (pat == 17) {
    if (uv.y > 0.66) { c = vec3(0.96, 0.95, 0.92); m = inRect(uv, 0.1, 0.72, 0.9, 0.94) ? 1.0 : 0.88; }
    else m = uv.y > 0.58 ? 0.8 : (e < 0.05 ? 0.9 : 1.0);
  } else if (pat == 18) {
    lit = false; c = vColor * (e < 0.12 ? 1.0 : 1.18);
  } else if (pat == 19) {
    float row = floor(uv.y * 4.0);
    float sx = uv.x * 2.0 + mod(row, 2.0) * 0.5;
    m = 0.84 + 0.24 * fract(uv.y * 4.0) + (hash(vec2(floor(sx) + row * 3.0, tile)) - 0.5) * 0.08;
    if (fract(sx) < 0.05) m = 0.72;
  } else if (pat == 20) {
    m = 1.0 + (hash(floor(uv * 3.0) + tile * 1.3) - 0.5) * 0.12;
    if (hash(floor(uv * 8.0) + tile * 2.9) > 0.93) m = 1.2;
  } else if (pat == 21) {
    m = fract(uv.x * 8.0) < 0.25 ? 0.86 : 1.0;
    if (abs(uv.y - 0.3) < 0.04 || abs(uv.y - 0.7) < 0.04) m = 0.68;
  } else if (pat == 22) {
    m = 1.0 + (hash(floor(uv * 8.0) + tile) - 0.5) * 0.06;
  } else if (pat == 23) {
    m = e < 0.08 ? 0.8 : (e < 0.16 ? 1.12 : 1.0);
    if (inRect(uv, 0.24, 0.62, 0.46, 0.7) || inRect(uv, 0.24, 0.5, 0.3, 0.7)) m = 1.3;
  } else if (pat == 24) {
    m = fract(uv.x * 4.0) < 0.18 ? 0.8 : 1.0;
    if (hash(floor(uv * vec2(4.0, 6.0)) + tile) > 0.8 && fract(uv.y * 6.0) > 0.7) m *= 1.15;
  } else if (pat == 25) {
    float row = floor(uv.y * 3.0);
    m = 1.0 + (hash(vec2(row, floor(vWorld.y + 0.001 - uv.y * 0.5))) - 0.5) * 0.1;
    if (fract(uv.y * 3.0) < 0.09) m *= 0.9;
  } else if (pat == 26) {
    float h = hash(floor(uv * 4.0) + tile * 2.3);
    m = h > 0.72 ? 1.08 : (h < 0.24 ? 0.9 : 1.0);
  } else if (pat == 27) {
    m = bevel;
    if (inRect(uv, 0.15, 0.6, 0.5, 0.66) || inRect(uv, 0.55, 0.25, 0.85, 0.3)) m = 1.12;
  }
  c *= mix(1.0, m, max(detail, 0.25));
  if (lit) {
    vec3 light = max(uSky * vData.z, vec3(1.0, 0.84, 0.6) * vData.w);
    light = max(light, vec3(0.045, 0.05, 0.065));
    c *= light * vData.y;
  }
  c = mix(c, uFogColor, smoothstep(uFogNear, uFogFar, vDist));
  gl_FragColor = vec4(c, a);
}`;

const SKY_VS = `varying vec3 vDir; void main() { vDir = position; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }`;
const SKY_FS = `precision highp float; uniform vec3 uZenith; uniform vec3 uHorizon; varying vec3 vDir;
void main() { float h = normalize(vDir).y; vec3 c = mix(uHorizon, uZenith, pow(clamp(h, 0.0, 1.0), 0.5)); gl_FragColor = vec4(c, 1.0); }`;

class Renderer {
  constructor(canvas) {
    this.r = new THREE.WebGLRenderer({ canvas, antialias: true, powerPreference: 'high-performance' });
    this.r.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
    this.r.autoClear = false;
    this.scene = new THREE.Scene();
    this.camera = new THREE.PerspectiveCamera(72, 1, 0.08, 900);
    this.camera.rotation.order = 'YXZ';
    this.uniforms = {
      uSky: { value: new THREE.Vector3(1, 1, 1) }, uFogColor: { value: new THREE.Vector3(0.7, 0.85, 1) },
      uFogNear: { value: 60 }, uFogFar: { value: 110 }, uTime: { value: 0 },
    };
    this.matO = new THREE.ShaderMaterial({ vertexShader: TERRAIN_VS, fragmentShader: TERRAIN_FS, uniforms: this.uniforms });
    this.matT = new THREE.ShaderMaterial({ vertexShader: TERRAIN_VS, fragmentShader: TERRAIN_FS, uniforms: this.uniforms, transparent: true, depthWrite: false, side: THREE.DoubleSide });
    this.scene.fog = new THREE.Fog(0xb4d8ff, 60, 110);
    this.ambient = new THREE.AmbientLight(0xffffff, 0.7);
    this.sunLight = new THREE.DirectionalLight(0xffffff, 0.6);
    this.scene.add(this.ambient, this.sunLight);
    this.chunkGroup = new THREE.Group();
    this.scene.add(this.chunkGroup);
    this.buildSky();
    this.buildClouds();
    this.buildParticles();
    this.buildSelection();
    this.buildHand();
    this.resize();
    window.addEventListener('resize', () => this.resize());
  }

  resize() {
    const w = window.innerWidth, h = window.innerHeight;
    this.r.setSize(w, h, false);
    this.camera.aspect = w / h; this.camera.updateProjectionMatrix();
    this.handCam.aspect = w / h; this.handCam.updateProjectionMatrix();
  }

  /* ---------- chunks ---------- */
  makeMesh(buf, mat) {
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.BufferAttribute(buf.pos, 3));
    g.setAttribute('aColor', new THREE.BufferAttribute(buf.col, 3));
    g.setAttribute('uv', new THREE.BufferAttribute(buf.uv, 2));
    g.setAttribute('aData', new THREE.BufferAttribute(buf.dat, 4));
    g.setIndex(new THREE.BufferAttribute(buf.idx, 1));
    return new THREE.Mesh(g, mat);
  }
  setChunkMesh(chunk, res) {
    this.dropChunkMesh(chunk);
    const place = (m, order) => {
      m.position.set(chunk.cx * CHUNK, 0, chunk.cz * CHUNK);
      m.geometry.boundingSphere = new THREE.Sphere(new THREE.Vector3(8, res.maxY / 2, 8), Math.hypot(11.4, res.maxY / 2) + 1);
      m.renderOrder = order;
      m.matrixAutoUpdate = false; m.updateMatrix();
      this.chunkGroup.add(m);
    };
    if (res.o.n) { chunk.mesh = this.makeMesh(res.o, this.matO); place(chunk.mesh, 0); }
    if (res.t.n) { chunk.meshT = this.makeMesh(res.t, this.matT); place(chunk.meshT, 5); }
  }
  dropChunkMesh(chunk) {
    for (const k of ['mesh', 'meshT']) {
      const m = chunk[k];
      if (!m) continue;
      this.chunkGroup.remove(m); m.geometry.dispose(); chunk[k] = null;
    }
  }

  /* ---------- sky ---------- */
  buildSky() {
    this.skyU = { uZenith: { value: new THREE.Vector3() }, uHorizon: { value: new THREE.Vector3() } };
    this.sky = new THREE.Mesh(new THREE.BoxGeometry(600, 600, 600), new THREE.ShaderMaterial({ vertexShader: SKY_VS, fragmentShader: SKY_FS, uniforms: this.skyU, side: THREE.BackSide, depthWrite: false, depthTest: false }));
    this.sky.renderOrder = -10; this.sky.frustumCulled = false;
    this.scene.add(this.sky);
    const flat = (size, color, opacity) => {
      const m = new THREE.Mesh(new THREE.PlaneGeometry(size, size), new THREE.MeshBasicMaterial({ color, transparent: true, opacity, fog: false, depthWrite: false }));
      m.frustumCulled = false;
      return m;
    };
    this.sun = new THREE.Group();
    const halo = flat(92, 0xfff2c0, 0.16), halo2 = flat(64, 0xffefb0, 0.28), core = flat(42, 0xfffbe6, 1);
    halo.renderOrder = -9; halo2.renderOrder = -8.5; core.renderOrder = -8;
    this.sun.add(halo, halo2, core);
    this.sunCore = core; this.sunHalo = [halo, halo2];
    this.moon = new THREE.Group();
    const disc = flat(34, 0xe8eefc, 1); disc.renderOrder = -8;
    this.moon.add(disc);
    for (const [x, y, s] of [[-7, 5, 8], [6, -6, 10], [8, 8, 5], [-9, -8, 4]]) {
      const cr = flat(s, 0xc3cde6, 1); cr.position.set(x, y, 0.1); cr.renderOrder = -7; this.moon.add(cr);
    }
    this.scene.add(this.sun, this.moon);
    /* stars: square points */
    const n = 700, pos = new Float32Array(n * 3), rng = mulberry32(77);
    for (let i = 0; i < n; i++) {
      const u = rng() * 2 - 1, t = rng() * Math.PI * 2, s = Math.sqrt(1 - u * u);
      pos[i * 3] = Math.cos(t) * s * 500; pos[i * 3 + 1] = u * 500; pos[i * 3 + 2] = Math.sin(t) * s * 500;
    }
    const sg = new THREE.BufferGeometry();
    sg.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    this.stars = new THREE.Points(sg, new THREE.PointsMaterial({ color: 0xffffff, size: 2.2, sizeAttenuation: false, transparent: true, opacity: 0, fog: false, depthWrite: false }));
    this.stars.renderOrder = -9.5; this.stars.frustumCulled = false;
    this.scene.add(this.stars);
  }

  /* time runs 0..1 over a full day: daylight is the first 62%, night the rest */
  updateSky(time, camPos, viewDist, underwater) {
    const DAY = 0.62;
    const ang = time < DAY ? time / DAY * Math.PI : Math.PI + (time - DAY) / (1 - DAY) * Math.PI;
    const s = Math.sin(ang), c = Math.cos(ang);
    const day = smoothstep(-0.14, 0.24, s);
    const glow = Math.max(0, 1 - Math.abs(s) * 3.4);
    const mix3 = (a, b, t) => [lerp(a[0], b[0], t), lerp(a[1], b[1], t), lerp(a[2], b[2], t)];
    let zen = mix3([0.015, 0.025, 0.075], [0.22, 0.5, 0.93], day);
    let hor = mix3([0.05, 0.07, 0.15], [0.74, 0.87, 0.98], day);
    hor = mix3(hor, [0.99, 0.6, 0.36], glow * 0.78);
    zen = mix3(zen, [0.42, 0.34, 0.62], glow * 0.45);
    let light = mix3([0.27, 0.31, 0.47], [1, 1, 1], day);
    light = mix3(light, [1, 0.82, 0.66], glow * 0.5 * day);
    let near = viewDist * 0.55, far = viewDist * 0.97;
    if (underwater) { hor = [0.1 * (0.3 + day * 0.7), 0.32 * (0.3 + day * 0.7), 0.55 * (0.3 + day * 0.7)]; zen = hor; near = 1; far = 26; }
    this.skyU.uZenith.value.set(zen[0], zen[1], zen[2]);
    this.skyU.uHorizon.value.set(hor[0], hor[1], hor[2]);
    this.uniforms.uSky.value.set(light[0], light[1], light[2]);
    this.uniforms.uFogColor.value.set(hor[0], hor[1], hor[2]);
    this.uniforms.uFogNear.value = near; this.uniforms.uFogFar.value = far;
    this.scene.fog.color.setRGB(hor[0], hor[1], hor[2]); this.scene.fog.near = near; this.scene.fog.far = far;
    this.ambient.intensity = 0.32 + day * 0.42;
    this.ambient.color.setRGB(light[0], light[1], light[2]);
    this.sunLight.intensity = 0.1 + day * 0.55;
    this.sunLight.position.set(c * 0.6 + 0.2, Math.abs(s) + 0.35, 0.45);
    this.sky.position.copy(camPos);
    this.stars.position.copy(camPos);
    this.stars.rotation.z = ang * 0.5;
    this.stars.material.opacity = (1 - day) * 0.9;
    this.stars.visible = day < 0.98 && !underwater;
    const D = 420;
    this.sun.position.set(camPos.x + c * D, camPos.y + s * D, camPos.z + D * 0.18);
    this.sun.lookAt(camPos);
    this.moon.position.set(camPos.x - c * D, camPos.y - s * D, camPos.z - D * 0.18);
    this.moon.lookAt(camPos);
    this.sun.visible = s > -0.2 && !underwater; this.moon.visible = s < 0.2 && !underwater;
    this.sunCore.material.color.setRGB(1, lerp(0.72, 0.98, 1 - glow), lerp(0.45, 0.9, 1 - glow));
    this.cloudMat.color.setRGB(lerp(0.3, 1, day), lerp(0.33, lerp(1, 0.86, glow), day), lerp(0.45, lerp(1, 0.8, glow), day));
    this.clouds.visible = !underwater;
    this.dayFactor = day; this.sunHeight = s;
  }

  /* ---------- clouds: flat slabs on a coarse grid ---------- */
  buildClouds() {
    this.cloudMat = new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.9, fog: false, depthWrite: false });
    const geo = new THREE.BoxGeometry(1, 1, 1);
    /* bake a soft top-to-bottom shade into the slab */
    const colors = new Float32Array(geo.attributes.position.count * 3);
    for (let i = 0; i < geo.attributes.position.count; i++) {
      const ny = geo.attributes.normal.getY(i), nx = geo.attributes.normal.getX(i);
      const v = ny > 0.5 ? 1 : ny < -0.5 ? 0.8 : nx !== 0 ? 0.9 : 0.94;
      colors[i * 3] = colors[i * 3 + 1] = colors[i * 3 + 2] = v;
    }
    geo.setAttribute('color', new THREE.BufferAttribute(colors, 3));
    this.cloudMat.vertexColors = true;
    this.cloudMax = 1400;
    this.clouds = new THREE.InstancedMesh(geo, this.cloudMat, this.cloudMax);
    this.clouds.frustumCulled = false; this.clouds.renderOrder = 4;
    this.scene.add(this.clouds);
    this.cloudNoise = new Simplex(4242);
    this.cloudKey = '';
  }
  updateClouds(camPos, time) {
    const CELL = 14, R = 22, drift = time * 1.4;
    const gx = Math.floor((camPos.x - drift) / CELL), gz = Math.floor(camPos.z / CELL);
    const key = gx + ',' + gz;
    this.clouds.position.set(drift, 0, 0);
    if (key === this.cloudKey) return;
    this.cloudKey = key;
    const m = new THREE.Matrix4();
    let n = 0;
    for (let dz = -R; dz <= R && n < this.cloudMax; dz++) for (let dx = -R; dx <= R && n < this.cloudMax; dx++) {
      const x = gx + dx, z = gz + dz;
      const v = this.cloudNoise.fbm2(x / 9, z / 7, 2);
      if (v < 0.16) continue;
      const edge = 1 - smoothstep(R * 0.7, R, Math.max(Math.abs(dx), Math.abs(dz)));
      if (edge <= 0.02) continue;
      const tall = (3 + Math.floor((v - 0.16) * 14)) * edge;
      m.makeScale(CELL, tall, CELL);
      m.setPosition(x * CELL + CELL / 2, 132 + tall / 2, z * CELL + CELL / 2);
      this.clouds.setMatrixAt(n++, m);
    }
    this.clouds.count = n;
    this.clouds.instanceMatrix.needsUpdate = true;
  }

  /* ---------- particles: little cubes ---------- */
  buildParticles() {
    this.pMax = 320;
    this.pMesh = new THREE.InstancedMesh(new THREE.BoxGeometry(1, 1, 1), new THREE.MeshLambertMaterial({ color: 0xffffff }), this.pMax);
    this.pMesh.instanceColor = new THREE.InstancedBufferAttribute(new Float32Array(this.pMax * 3), 3);
    this.pMesh.frustumCulled = false;
    this.scene.add(this.pMesh);
    this.parts = [];
    this.pM = new THREE.Matrix4();
  }
  burst(x, y, z, color, count, speed, size) {
    for (let i = 0; i < count; i++) {
      if (this.parts.length >= this.pMax) this.parts.shift();
      const k = 0.8 + Math.random() * 0.4;
      this.parts.push({
        x: x + (Math.random() - 0.5) * 0.6, y: y + (Math.random() - 0.5) * 0.6, z: z + (Math.random() - 0.5) * 0.6,
        vx: (Math.random() - 0.5) * speed, vy: Math.random() * speed * 0.9 + 1, vz: (Math.random() - 0.5) * speed,
        life: 0.5 + Math.random() * 0.5, s: (size || 0.12) * (0.6 + Math.random() * 0.8), r: color[0] * k, g: color[1] * k, b: color[2] * k,
      });
    }
  }
  updateParticles(dt) {
    const ps = this.parts, col = this.pMesh.instanceColor.array, m = this.pM;
    let n = 0;
    for (let i = ps.length - 1; i >= 0; i--) {
      const p = ps[i];
      p.life -= dt;
      if (p.life <= 0) { ps.splice(i, 1); continue; }
      p.vy -= 18 * dt; p.x += p.vx * dt; p.y += p.vy * dt; p.z += p.vz * dt;
    }
    for (const p of ps) {
      const s = p.s * Math.min(1, p.life * 4);
      m.makeScale(s, s, s); m.setPosition(p.x, p.y, p.z);
      this.pMesh.setMatrixAt(n, m);
      col[n * 3] = p.r; col[n * 3 + 1] = p.g; col[n * 3 + 2] = p.b;
      n++;
    }
    this.pMesh.count = n;
    this.pMesh.instanceMatrix.needsUpdate = true;
    this.pMesh.instanceColor.needsUpdate = true;
  }

  /* ---------- block selection outline and break overlay ---------- */
  buildSelection() {
    const eg = new THREE.EdgesGeometry(new THREE.BoxGeometry(1.004, 1.004, 1.004));
    this.sel = new THREE.LineSegments(eg, new THREE.LineBasicMaterial({ color: 0x10131a, transparent: true, opacity: 0.75, fog: false }));
    this.sel.visible = false;
    this.crack = new THREE.Mesh(new THREE.BoxGeometry(1.006, 1.006, 1.006), new THREE.MeshBasicMaterial({ color: 0x0c0e14, transparent: true, opacity: 0, depthWrite: false, fog: false }));
    this.crack.visible = false;
    this.scene.add(this.sel, this.crack);
  }
  setSelection(hit, progress) {
    if (!hit) { this.sel.visible = false; this.crack.visible = false; return; }
    const d = BLOCKS[hit.id];
    const h = d.shape === 'cube' || d.shape === 'box' ? Math.max(d.height, d.id === B.CHEST ? 0.9 : d.height) : 0.9;
    this.sel.visible = true;
    this.sel.position.set(hit.x + 0.5, hit.y + h / 2, hit.z + 0.5);
    this.sel.scale.set(1, h, 1);
    this.crack.visible = progress > 0;
    if (progress > 0) {
      const k = 1 - Math.floor(progress * 5) / 5 * 0.0;
      this.crack.position.copy(this.sel.position);
      this.crack.scale.set(k, h * k, k);
      this.crack.material.opacity = 0.12 + Math.floor(progress * 6) / 6 * 0.5;
    }
  }

  /* ---------- held item ---------- */
  buildHand() {
    this.handScene = new THREE.Scene();
    this.handCam = new THREE.PerspectiveCamera(60, 1, 0.01, 10);
    this.handAmb = new THREE.AmbientLight(0xffffff, 0.75);
    this.handDir = new THREE.DirectionalLight(0xffffff, 0.5);
    this.handDir.position.set(-0.4, 1, 0.6);
    this.handScene.add(this.handAmb, this.handDir);
    this.handPivot = new THREE.Group();
    this.handScene.add(this.handPivot);
    this.handItem = -1;
    this.handMeshes = {};
  }
  itemMesh(id) {
    if (this.handMeshes[id]) return this.handMeshes[id];
    const it = ITEMS[id];
    let mesh;
    if (!it) {
      /* bare arm */
      mesh = new THREE.Mesh(new THREE.BoxGeometry(0.22, 0.7, 0.22), new THREE.MeshLambertMaterial({ color: 0xe0ac7e }));
      const sleeve = new THREE.Mesh(new THREE.BoxGeometry(0.25, 0.3, 0.25), new THREE.MeshLambertMaterial({ color: 0x3f7fbf }));
      sleeve.position.y = -0.3; mesh.add(sleeve);
    } else if (it.sprite) mesh = spriteMesh(it.sprite);
    else mesh = blockItemMesh(id);
    this.handMeshes[id] = mesh;
    return mesh;
  }
  updateHand(id, swing, bob, light, dt) {
    if (id !== this.handItem) {
      while (this.handPivot.children.length) this.handPivot.remove(this.handPivot.children[0]);
      const mesh = this.itemMesh(id);
      const it = ITEMS[id];
      mesh.rotation.set(0, 0, 0); mesh.position.set(0, 0, 0); mesh.scale.setScalar(1);
      if (!it) { mesh.scale.setScalar(0.62); mesh.rotation.set(-1.15, 0, 0.25); mesh.position.set(0.04, -0.1, 0); }
      else if (it.sprite) { mesh.scale.setScalar(0.34); mesh.rotation.set(0, -1.2, 0.1); mesh.position.set(0, 0.02, 0); }
      else { mesh.scale.setScalar(0.17); mesh.rotation.set(0.28, 0.75, 0); mesh.position.set(0.02, -0.02, 0); }
      this.handPivot.add(mesh);
      this.handItem = id;
      this.handDrop = 1;
    }
    this.handDrop = Math.max(0, (this.handDrop || 0) - dt * 5);
    const sw = Math.sin(Math.min(1, swing) * Math.PI);
    const sw2 = Math.sin(Math.sqrt(Math.min(1, swing)) * Math.PI);
    this.handPivot.position.set(0.4 - sw2 * 0.16 + Math.cos(bob) * 0.012, -0.3 - this.handDrop * 0.4 + sw * 0.05 - Math.abs(Math.sin(bob)) * 0.014, -0.72 - sw * 0.12);
    this.handPivot.rotation.set(-sw * 1.2, sw2 * 0.4, sw2 * 0.25);
    this.handAmb.intensity = 0.25 + light * 0.6;
    this.handDir.intensity = light * 0.5;
  }

  render() {
    this.r.clear();
    this.r.render(this.scene, this.camera);
    this.r.clearDepth();
    this.r.render(this.handScene, this.handCam);
  }
}

/* A sprite extruded into pixel-sized boxes: the pixelated look of every tool and weapon. */
function spriteMesh(grid, depth) {
  const pos = [], col = [], idx = [], nor = [];
  const D = (depth || 1) / 16 / 2;
  const filled = (x, y) => x >= 0 && y >= 0 && x < 16 && y < 16 && grid[y * 16 + x] >= 0;
  const quad = (v, n, c, k) => {
    const b = pos.length / 3;
    for (const p of v) { pos.push(p[0], p[1], p[2]); nor.push(n[0], n[1], n[2]); col.push(c[0] * k, c[1] * k, c[2] * k); }
    idx.push(b, b + 1, b + 2, b, b + 2, b + 3);
  };
  for (let y = 0; y < 16; y++) for (let x = 0; x < 16; x++) {
    const v = grid[y * 16 + x];
    if (v < 0) continue;
    const c = hexRGB(v);
    const x0 = (x - 8) / 16, x1 = x0 + 1 / 16, y1 = (8 - y) / 16, y0 = y1 - 1 / 16;
    quad([[x0, y0, D], [x1, y0, D], [x1, y1, D], [x0, y1, D]], [0, 0, 1], c, 1);
    quad([[x1, y0, -D], [x0, y0, -D], [x0, y1, -D], [x1, y1, -D]], [0, 0, -1], c, 1);
    if (!filled(x + 1, y)) quad([[x1, y0, D], [x1, y0, -D], [x1, y1, -D], [x1, y1, D]], [1, 0, 0], c, 0.82);
    if (!filled(x - 1, y)) quad([[x0, y0, -D], [x0, y0, D], [x0, y1, D], [x0, y1, -D]], [-1, 0, 0], c, 0.82);
    if (!filled(x, y - 1)) quad([[x0, y1, D], [x1, y1, D], [x1, y1, -D], [x0, y1, -D]], [0, 1, 0], c, 0.92);
    if (!filled(x, y + 1)) quad([[x0, y0, -D], [x1, y0, -D], [x1, y0, D], [x0, y0, D]], [0, -1, 0], c, 0.7);
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('normal', new THREE.Float32BufferAttribute(nor, 3));
  g.setAttribute('color', new THREE.Float32BufferAttribute(col, 3));
  g.setIndex(idx);
  return new THREE.Mesh(g, new THREE.MeshLambertMaterial({ vertexColors: true }));
}

function blockItemMesh(id) {
  const d = BLOCKS[id];
  const g = new THREE.BoxGeometry(1, d.shape === 'plant' ? 1 : Math.min(1, d.height + (d.id === B.LANTERN ? -0.4 : 0)), 1);
  if (d.shape === 'plant') g.scale(0.35, 1, 0.35);
  if (d.id === B.LANTERN) g.scale(0.5, 1, 0.5);
  const n = g.attributes.position.count, col = new Float32Array(n * 3);
  const side = blockBaseColor(d, 'side'), top = blockBaseColor(d, 'top'), bot = d.bottom || side;
  for (let i = 0; i < n; i++) {
    const ny = g.attributes.normal.getY(i);
    const c = ny > 0.5 ? top : ny < -0.5 ? bot : side;
    col[i * 3] = c[0]; col[i * 3 + 1] = c[1]; col[i * 3 + 2] = c[2];
  }
  g.setAttribute('color', new THREE.BufferAttribute(col, 3));
  const mat = d.light > 0 ? new THREE.MeshBasicMaterial({ vertexColors: true }) : new THREE.MeshLambertMaterial({ vertexColors: true, transparent: d.alpha, opacity: d.alpha ? 0.6 : 1 });
  return new THREE.Mesh(g, mat);
}
