// GPU texture baker. Every surface in the game gets a tileable PBR set generated on the GPU
// at load time:
//   map       : albedo (sRGB) in RGB, roughness in A
//   normalMap : tangent-space normal in RGB, ambient occlusion in A
// Terrain layers are baked into texture arrays so the splat shader needs only two samplers.

import * as THREE from 'three';
import { NOISE_GLSL } from './glsl';

export interface PbrSet { map: THREE.Texture; normal: THREE.Texture; key: string }

type GenDef = { glsl: string; uniforms?: Record<string, THREE.IUniform>; normalStrength?: number };

const VERT = /* glsl */ `
varying vec2 vUv;
void main() { vUv = uv; gl_Position = vec4(position.xy, 0.0, 1.0); }
`;

/** Each generator defines: void gen(vec2 uv, out float h, out vec3 col, out float rough, out float ao) */
export const GENERATORS: Record<string, GenDef> = {
  // Cut-stone ashlar coursing for curtain walls and towers. uTint = stone colour.
  ashlar: {
    uniforms: { uTint: { value: new THREE.Color(0.62, 0.57, 0.5) }, uRows: { value: 6 }, uCols: { value: 3 }, uVar: { value: 0.34 } },
    normalStrength: 6,
    glsl: /* glsl */ `
uniform vec3 uTint; uniform float uRows; uniform float uCols; uniform float uVar;
void gen(vec2 uv, out float h, out vec3 col, out float rough, out float ao) {
  float row = floor(uv.y * uRows);
  float fy = fract(uv.y * uRows);
  float off = hash12(vec2(row, 7.1)) ;
  float x = fract(uv.x + off);
  // irregular joints along the course
  float prev = 0.0, next = 1.0; float idx = 0.0;
  for (int k = 0; k < 6; k++) {
    if (float(k) >= uCols) break;
    float b = (float(k) + 0.5 + (hash12(vec2(row, float(k))) - 0.5) * 0.55) / uCols;
    if (x >= b) { prev = b; idx = float(k) + 1.0; } else { next = min(next, b); }
  }
  float nb = (0.5 + (hash12(vec2(row, 0.0)) - 0.5) * 0.55) / uCols + 1.0;
  if (idx >= uCols) next = nb;
  float bw = (next - prev) * uCols;     // in "block" units
  float ex = min(x - prev, next - x) * uCols * 2.2;
  float ey = min(fy, 1.0 - fy) * 1.0;
  vec2 bid = vec2(row, idx + floor(uv.x + off) * 17.0);
  float chip = fbmP(uv * vec2(24.0, 24.0), 24.0, 4) * 0.08;
  float edge = min(ex, ey) + chip;
  float mortar = smoothstep(0.035, 0.085, edge);
  float bevel = smoothstep(0.03, 0.22, edge);
  float surf = fbmP(uv * 16.0 + bid, 16.0, 5);
  float pits = 1.0 - smoothstep(0.0, 0.08, worleyP(uv * 40.0, vec2(40.0), 1.0).x);
  float face = 0.7 + 0.3 * hash12(bid + 3.1);
  h = mix(0.12 + 0.05 * surf, 0.82 * face + 0.1 * bevel + 0.07 * surf - 0.05 * pits, mortar);
  vec3 stone = uTint * (1.0 + uVar * (hash12(bid) - 0.5) * 2.0);
  stone *= vec3(1.0 + 0.06 * (hash12(bid + 9.0) - 0.5), 1.0, 1.0 - 0.06 * (hash12(bid + 5.0) - 0.5));
  stone *= 0.84 + 0.26 * vfbmP(uv * 32.0, 32.0, 4);
  stone *= 1.0 - 0.18 * pits;
  vec3 mort = vec3(0.36, 0.34, 0.3) * (0.75 + 0.3 * vfbmP(uv * 60.0, 60.0, 3));
  stone *= 0.8 + 0.35 * vfbmP(uv * 5.0 + bid * 0.1, 5.0, 3);
  col = mix(mort, stone, mortar);
  rough = mix(0.97, 0.78 + 0.12 * vfbmP(uv * 20.0, 20.0, 3), mortar);
  ao = mix(0.45, 1.0, smoothstep(0.0, 0.12, edge)) * (1.0 - 0.3 * pits);
}` },

  // Random rubble masonry (field stones in mortar).
  rubble: {
    uniforms: { uTint: { value: new THREE.Color(0.5, 0.49, 0.46) }, uScale: { value: 7 } },
    normalStrength: 7,
    glsl: /* glsl */ `
uniform vec3 uTint; uniform float uScale;
void gen(vec2 uv, out float h, out vec3 col, out float rough, out float ao) {
  vec2 p = uv * vec2(uScale, uScale * 1.6);
  vec4 w = worleyP(p, vec2(uScale, uScale * 1.6), 0.85);
  float joint = w.y - w.x;
  float m = smoothstep(0.04, 0.16, joint + 0.05 * fbmP(uv * 30.0, 30.0, 3));
  float dome = 1.0 - w.x * w.x;
  float surf = fbmP(uv * 18.0 + w.zw, 18.0, 5);
  h = mix(0.1, 0.55 + 0.35 * dome + 0.1 * surf, m);
  vec3 c = uTint * (0.75 + 0.5 * hash12(w.zw));
  c *= vec3(1.0 + 0.1 * (hash12(w.zw + 4.0) - 0.5), 1.0, 1.0 - 0.1 * (hash12(w.zw + 8.0) - 0.5));
  c *= 0.85 + 0.25 * vfbmP(uv * 40.0, 40.0, 3);
  vec3 mort = vec3(0.5, 0.48, 0.43) * (0.8 + 0.25 * vfbmP(uv * 70.0, 70.0, 2));
  col = mix(mort, c, m);
  rough = mix(0.98, 0.82, m);
  ao = mix(0.4, 1.0, smoothstep(0.0, 0.25, joint)) ;
}` },

  cobble: {
    normalStrength: 8,
    glsl: /* glsl */ `
void gen(vec2 uv, out float h, out vec3 col, out float rough, out float ao) {
  vec4 w = worleyP(uv * 9.0, vec2(9.0), 0.7);
  float joint = w.y - w.x;
  float m = smoothstep(0.05, 0.22, joint);
  float dome = sqrt(max(0.0, 1.0 - w.x * w.x * 1.4));
  float surf = fbmP(uv * 32.0, 32.0, 4);
  h = mix(0.05 + 0.05 * surf, 0.45 + 0.45 * dome + 0.06 * surf, m);
  vec3 stone = vec3(0.42, 0.4, 0.37) * (0.7 + 0.55 * hash12(w.zw));
  stone *= 0.85 + 0.25 * vfbmP(uv * 50.0, 50.0, 3);
  vec3 dirt = vec3(0.24, 0.19, 0.14) * (0.8 + 0.3 * vfbmP(uv * 64.0, 64.0, 3));
  col = mix(dirt, stone, m);
  rough = mix(0.95, 0.62 + 0.2 * hash12(w.zw + 1.0), m);
  ao = mix(0.35, 1.0, smoothstep(0.0, 0.3, joint));
}` },

  flagstone: {
    normalStrength: 6,
    glsl: /* glsl */ `
void gen(vec2 uv, out float h, out vec3 col, out float rough, out float ao) {
  vec2 p = uv * vec2(3.0, 4.0);
  float row = floor(p.y);
  p.x += hash12(vec2(row, 3.0)) * 0.6;
  vec2 cell = floor(p); vec2 f = fract(p);
  float e = min(min(f.x, 1.0 - f.x) * 1.3, min(f.y, 1.0 - f.y));
  e += fbmP(uv * 20.0, 20.0, 3) * 0.04;
  float m = smoothstep(0.02, 0.06, e);
  float surf = fbmP(uv * 12.0 + cell, 12.0, 5);
  float crack = smoothstep(0.02, 0.0, abs(fbmP(uv * 6.0 + cell * 3.0, 6.0, 4)) - 0.005) * 0.6;
  h = mix(0.15, 0.75 + 0.12 * surf - 0.2 * crack, m);
  vec3 c = vec3(0.5, 0.47, 0.42) * (0.82 + 0.3 * hash12(mod(cell, vec2(3.0, 4.0))));
  c *= 0.85 + 0.2 * vfbmP(uv * 40.0, 40.0, 3);
  col = mix(vec3(0.26, 0.22, 0.17), c, m) * (1.0 - 0.3 * crack);
  rough = mix(0.95, 0.72, m);
  ao = mix(0.45, 1.0, smoothstep(0.0, 0.1, e));
}` },

  // Meadow turf seen from above: tufts, dead blades, specks of soil and clover.
  grass: {
    normalStrength: 3,
    glsl: /* glsl */ `
void gen(vec2 uv, out float h, out vec3 col, out float rough, out float ao) {
  float n1 = vfbmP(uv * 8.0, 8.0, 5);
  float n2 = vfbmP(uv * 64.0, 64.0, 3);
  float blades = 0.0;
  for (int i = 0; i < 3; i++) {
    float s = 90.0 + float(i) * 37.0;
    vec2 q = uv * s; q.x += sin(q.y * 0.3 + float(i)) * 0.3;
    blades += smoothstep(0.55, 0.95, vnoiseP(q * vec2(1.0, 0.18), vec2(s, s * 0.18))) * 0.34;
  }
  float soil = smoothstep(0.62, 0.8, vfbmP(uv * 24.0 + 3.0, 24.0, 4));
  float clover = smoothstep(0.78, 0.9, vnoiseP(uv * 48.0 + 7.0, vec2(48.0)));
  h = 0.35 + 0.35 * blades + 0.15 * n2 - 0.2 * soil;
  vec3 g1 = vec3(0.085, 0.15, 0.035), g2 = vec3(0.2, 0.26, 0.065), dry = vec3(0.34, 0.31, 0.16);
  vec3 c = mix(g1, g2, n1);
  c = mix(c, dry, smoothstep(0.6, 0.85, vfbmP(uv * 12.0 + 11.0, 12.0, 4)) * 0.55);
  c *= 0.78 + 0.45 * blades;
  c = mix(c, vec3(0.13, 0.2, 0.06), clover * 0.6);
  c = mix(c, vec3(0.2, 0.15, 0.1), soil * 0.75);
  col = c;
  rough = 0.86 + 0.1 * n2;
  ao = 0.7 + 0.3 * blades;
}` },

  // Trodden earth and mud with pebbles and wet patches.
  dirt: {
    normalStrength: 5,
    glsl: /* glsl */ `
void gen(vec2 uv, out float h, out vec3 col, out float rough, out float ao) {
  float n = fbmP(uv * 6.0, 6.0, 6);
  vec4 w = worleyP(uv * 30.0, vec2(30.0), 0.9);
  float pebble = smoothstep(0.26, 0.08, w.x) * step(0.78, hash12(w.zw));
  float wet = smoothstep(0.2, 0.45, vfbmP(uv * 4.0 + 2.0, 4.0, 4) - 0.3) * 0.7;
  float clods = vfbmP(uv * 40.0, 40.0, 4);
  h = 0.45 + 0.25 * n + 0.18 * clods + 0.3 * pebble - 0.25 * wet;
  vec3 soil = mix(vec3(0.25, 0.19, 0.13), vec3(0.36, 0.28, 0.19), clods);
  soil *= 0.85 + 0.3 * vfbmP(uv * 16.0, 16.0, 3);
  vec3 peb = vec3(0.38, 0.35, 0.3) * (0.75 + 0.4 * hash12(w.zw + 2.0));
  vec3 c = mix(soil, peb, pebble * 0.75);
  c = mix(c, c * 0.55, wet);
  col = c;
  rough = mix(0.93, 0.55, wet * (1.0 - pebble));
  ao = 0.75 + 0.25 * clods;
}` },

  sand: {
    normalStrength: 3,
    glsl: /* glsl */ `
void gen(vec2 uv, out float h, out vec3 col, out float rough, out float ao) {
  float warp = fbmP(uv * 3.0, 3.0, 3);
  float ripple = sin((uv.y * 22.0 + warp * 2.0) * 6.2831853) * 0.5 + 0.5;
  float grain = vnoiseP(uv * 256.0, vec2(256.0));
  float shells = smoothstep(0.92, 0.97, vnoiseP(uv * 70.0 + 9.0, vec2(70.0)));
  h = 0.4 + 0.25 * ripple + 0.1 * grain + 0.2 * fbmP(uv * 8.0, 8.0, 4);
  vec3 c = mix(vec3(0.62, 0.55, 0.42), vec3(0.72, 0.65, 0.5), vfbmP(uv * 10.0, 10.0, 4));
  c *= 0.92 + 0.12 * grain;
  c = mix(c, vec3(0.85, 0.82, 0.76), shells);
  col = c;
  rough = 0.9;
  ao = 0.85 + 0.15 * ripple;
}` },

  rock: {
    uniforms: { uTint: { value: new THREE.Color(0.27, 0.26, 0.24) } },
    normalStrength: 14,
    glsl: /* glsl */ `
uniform vec3 uTint;
void gen(vec2 uv, out float h, out vec3 col, out float rough, out float ao) {
  vec2 p = uv * 4.0;
  float strata = fbmP(vec2(uv.x * 2.0, uv.y * 10.0), 2.0, 5);
  float ridge = 1.0 - abs(fbmP(p, 4.0, 6));
  vec4 w = worleyP(uv * 6.0, vec2(6.0), 1.0);
  float crack = smoothstep(0.08, 0.0, w.y - w.x);
  h = 0.3 + 0.35 * ridge + 0.2 * strata - 0.35 * crack + 0.1 * fbmP(uv * 40.0, 40.0, 3);
  vec3 c = uTint * (0.75 + 0.4 * vfbmP(uv * 12.0, 12.0, 5));
  c *= 1.0 - 0.45 * crack;
  float lichen = smoothstep(0.7, 0.8, vfbmP(uv * 20.0 + 5.0, 20.0, 4));
  c = mix(c, vec3(0.5, 0.52, 0.36), lichen * 0.5);
  float moss = smoothstep(0.66, 0.8, vfbmP(uv * 6.0 + 1.0, 6.0, 4));
  c = mix(c, vec3(0.16, 0.2, 0.08), moss * 0.6);
  col = c;
  rough = 0.86 - 0.1 * ridge;
  ao = 1.0 - 0.6 * crack;
}` },

  // Weathered oak boards (bridge decks, carts, doors).
  planks: {
    uniforms: { uTint: { value: new THREE.Color(0.38, 0.28, 0.19) } },
    normalStrength: 5,
    glsl: /* glsl */ `
uniform vec3 uTint;
void gen(vec2 uv, out float h, out vec3 col, out float rough, out float ao) {
  float boards = 6.0;
  float bx = uv.x * boards; float bi = floor(bx); float fx = fract(bx);
  float vy = uv.y + hash12(vec2(bi, 1.0));
  float seg = floor(vy * 2.0);
  float fy = fract(vy * 2.0);
  vec2 id = vec2(bi, seg);
  float gap = smoothstep(0.0, 0.04, fx) * smoothstep(1.0, 0.96, fx) * smoothstep(0.0, 0.01, fy) * smoothstep(1.0, 0.99, fy);
  float grain = fbmP(vec2(uv.x * boards * 3.0 + hash12(id) * 9.0, uv.y * 40.0), boards * 3.0, 4);
  float rings = sin((uv.x * boards * 12.0 + grain * 3.0 + hash12(id) * 20.0)) * 0.5 + 0.5;
  float knot = smoothstep(0.12, 0.0, length((vec2(fx, fy) - hash22(id)) * vec2(1.0, 3.0))) ;
  h = mix(0.05, 0.6 + 0.15 * grain + 0.06 * rings - 0.1 * knot, gap);
  vec3 c = uTint * (0.72 + 0.5 * hash12(id + 5.0));
  c *= 0.8 + 0.3 * rings * (0.6 + 0.4 * grain);
  c = mix(c, c * 0.45, knot);
  c *= mix(0.9, 1.08, vfbmP(uv * 6.0, 6.0, 3));
  // grey weathering
  c = mix(c, vec3(luma(c)) * vec3(1.0, 0.98, 0.95), 0.35);
  col = c * gap + (1.0 - gap) * vec3(0.05, 0.04, 0.03);
  rough = 0.82 - 0.1 * rings;
  ao = mix(0.3, 1.0, gap);
}` },

  // Hewn oak beams and posts.
  timber: {
    normalStrength: 4,
    glsl: /* glsl */ `
void gen(vec2 uv, out float h, out vec3 col, out float rough, out float ao) {
  float grain = fbmP(vec2(uv.x * 8.0, uv.y * 64.0), 8.0, 5);
  float cracks = smoothstep(0.03, 0.0, abs(gnoiseP(vec2(uv.x * 16.0, uv.y * 3.0), vec2(16.0, 3.0))) - 0.01);
  float adze = sin(uv.y * 6.2831853 * 18.0 + grain * 2.0) * 0.5 + 0.5;
  h = 0.5 + 0.2 * grain + 0.05 * adze - 0.4 * cracks;
  vec3 c = mix(vec3(0.16, 0.11, 0.07), vec3(0.27, 0.19, 0.12), vfbmP(vec2(uv.x * 6.0, uv.y * 30.0), 6.0, 4));
  c *= 1.0 - 0.6 * cracks;
  col = c;
  rough = 0.78;
  ao = 1.0 - 0.5 * cracks;
}` },

  // Lime-washed wattle and daub with soot and damp.
  daub: {
    normalStrength: 3,
    glsl: /* glsl */ `
void gen(vec2 uv, out float h, out vec3 col, out float rough, out float ao) {
  float n = fbmP(uv * 6.0, 6.0, 6);
  float fine = vfbmP(uv * 60.0, 60.0, 3);
  float flake = smoothstep(0.7, 0.75, vfbmP(uv * 14.0 + 4.0, 14.0, 4));
  h = 0.5 + 0.2 * n + 0.08 * fine - 0.2 * flake;
  vec3 c = vec3(0.78, 0.74, 0.64) * (0.88 + 0.16 * n);
  c = mix(c, vec3(0.48, 0.4, 0.3), flake);
  c *= 1.0 - 0.25 * smoothstep(0.3, 1.0, 1.0 - uv.y) * vfbmP(vec2(uv.x * 20.0, uv.y * 2.0), 20.0, 3);
  col = c;
  rough = 0.93;
  ao = 0.85 + 0.15 * n;
}` },

  thatch: {
    normalStrength: 7,
    glsl: /* glsl */ `
void gen(vec2 uv, out float h, out vec3 col, out float rough, out float ao) {
  float rows = 10.0;
  float r = floor(uv.y * rows); float fy = fract(uv.y * rows);
  float straws = vnoiseP(vec2(uv.x * 220.0, uv.y * 8.0 + r * 3.0), vec2(220.0, 8.0));
  float straws2 = vnoiseP(vec2(uv.x * 130.0 + 3.0, uv.y * 5.0), vec2(130.0, 5.0));
  float layer = smoothstep(0.0, 0.25, fy) * (1.0 - 0.35 * smoothstep(0.6, 1.0, fy));
  float clump = vfbmP(uv * vec2(10.0, 4.0), 4.0, 4);
  h = 0.25 + 0.45 * layer + 0.2 * straws + 0.1 * straws2;
  vec3 straw = mix(vec3(0.42, 0.34, 0.2), vec3(0.6, 0.5, 0.3), straws);
  vec3 old = vec3(0.32, 0.3, 0.26);
  vec3 c = mix(straw, old, 0.45 + 0.35 * clump);
  float mosss = smoothstep(0.65, 0.85, vfbmP(uv * 5.0 + 2.0, 5.0, 4));
  c = mix(c, vec3(0.2, 0.24, 0.12), mosss * 0.5);
  c *= 0.75 + 0.3 * layer;
  col = c;
  rough = 0.95;
  ao = 0.55 + 0.45 * layer;
}` },

  slate: {
    normalStrength: 6,
    glsl: /* glsl */ `
void gen(vec2 uv, out float h, out vec3 col, out float rough, out float ao) {
  float rows = 12.0, cols = 8.0;
  float r = floor(uv.y * rows); float fy = fract(uv.y * rows);
  float x = uv.x * cols + mod(r, 2.0) * 0.5 + (hash12(vec2(r, 2.0)) - 0.5) * 0.2;
  float ci = floor(x); float fx = fract(x);
  vec2 id = vec2(mod(ci, cols), r);
  float e = smoothstep(0.0, 0.05, fx) * smoothstep(1.0, 0.95, fx);
  float lip = smoothstep(0.0, 0.08, fy);
  h = (0.3 + 0.6 * fy) * e * lip + 0.05 * fbmP(uv * 30.0, 30.0, 3);
  vec3 c = vec3(0.2, 0.22, 0.25) * (0.75 + 0.5 * hash12(id));
  c *= 0.85 + 0.25 * vfbmP(uv * 40.0, 40.0, 3);
  float lichen = smoothstep(0.75, 0.85, vfbmP(uv * 9.0 + 3.0, 9.0, 4));
  c = mix(c, vec3(0.52, 0.5, 0.38), lichen * 0.4);
  col = c;
  rough = 0.62 + 0.2 * hash12(id + 1.0);
  ao = mix(0.35, 1.0, e * lip) * (0.6 + 0.4 * fy);
}` },

  tile: {
    normalStrength: 6,
    glsl: /* glsl */ `
void gen(vec2 uv, out float h, out vec3 col, out float rough, out float ao) {
  float rows = 14.0, cols = 10.0;
  float r = floor(uv.y * rows); float fy = fract(uv.y * rows);
  float x = uv.x * cols + mod(r, 2.0) * 0.5;
  float fx = fract(x); vec2 id = vec2(mod(floor(x), cols), r);
  float curve = sin(fx * 3.14159);
  h = curve * (0.35 + 0.6 * fy) + 0.04 * fbmP(uv * 40.0, 40.0, 3);
  vec3 c = vec3(0.45, 0.2, 0.12) * (0.75 + 0.45 * hash12(id));
  c *= 0.85 + 0.2 * vfbmP(uv * 30.0, 30.0, 3);
  c = mix(c, vec3(0.3, 0.3, 0.22), smoothstep(0.7, 0.85, vfbmP(uv * 8.0, 8.0, 4)) * 0.5);
  col = c;
  rough = 0.75;
  ao = (0.45 + 0.55 * curve) * (0.55 + 0.45 * fy);
}` },

  lead: {
    normalStrength: 2,
    glsl: /* glsl */ `
void gen(vec2 uv, out float h, out vec3 col, out float rough, out float ao) {
  float sx = fract(uv.x * 4.0);
  float seam = smoothstep(0.0, 0.03, sx) * smoothstep(1.0, 0.97, sx);
  float n = fbmP(uv * 8.0, 8.0, 5);
  h = 0.5 + 0.4 * (1.0 - seam) + 0.08 * n;
  col = vec3(0.36, 0.37, 0.38) * (0.8 + 0.25 * n);
  col = mix(col, vec3(0.6, 0.62, 0.6), smoothstep(0.6, 0.9, vfbmP(uv * 6.0, 6.0, 3)) * 0.4);
  rough = 0.55 + 0.2 * n;
  ao = 0.9 + 0.1 * seam;
}` },

  // Woven wool / linen for tabards, surcoats, banners and tents.
  cloth: {
    normalStrength: 2.5,
    glsl: /* glsl */ `
void gen(vec2 uv, out float h, out vec3 col, out float rough, out float ao) {
  vec2 p = uv * 160.0;
  vec2 c = floor(p); vec2 f = fract(p);
  float warp = mod(c.x + c.y, 2.0);
  float thread = warp > 0.5 ? sin(f.x * 3.14159) : sin(f.y * 3.14159);
  float slub = vnoiseP(uv * vec2(40.0, 400.0), vec2(40.0, 400.0)) * 0.3;
  float dirt = vfbmP(uv * 5.0, 5.0, 5);
  h = 0.4 + 0.4 * thread + slub * 0.3;
  col = vec3(1.0) * (0.86 + 0.12 * thread) * (0.82 + 0.18 * dirt);
  rough = 0.88;
  ao = 0.75 + 0.25 * thread;
}` },

  // Riveted mail rings.
  mail: {
    normalStrength: 8,
    glsl: /* glsl */ `
void gen(vec2 uv, out float h, out vec3 col, out float rough, out float ao) {
  vec2 p = uv * vec2(48.0, 64.0);
  float row = floor(p.y);
  p.x += mod(row, 2.0) * 0.5;
  vec2 f = fract(p) - 0.5;
  float r = length(f * vec2(1.0, 1.25));
  float ring = smoothstep(0.42, 0.36, r) * smoothstep(0.18, 0.26, r);
  // neighbours overlap
  vec2 f2 = fract(p + vec2(0.5, 0.5)) - 0.5;
  float r2 = length(f2 * vec2(1.0, 1.25));
  float ring2 = smoothstep(0.42, 0.36, r2) * smoothstep(0.18, 0.26, r2);
  float rr = max(ring, ring2 * 0.9);
  h = rr * (0.7 + 0.3 * sin(atan(f.y, f.x) * 2.0));
  float grime = vfbmP(uv * 8.0, 8.0, 4);
  col = vec3(0.6, 0.6, 0.62) * mix(0.25, 1.0, rr) * (0.75 + 0.3 * grime);
  rough = mix(0.9, 0.42 + 0.25 * grime, rr);
  ao = mix(0.2, 1.0, rr);
}` },

  leather: {
    normalStrength: 3,
    glsl: /* glsl */ `
void gen(vec2 uv, out float h, out vec3 col, out float rough, out float ao) {
  vec4 w = worleyP(uv * 40.0, vec2(40.0), 1.0);
  float pores = smoothstep(0.0, 0.25, w.y - w.x);
  float n = fbmP(uv * 6.0, 6.0, 5);
  float crease = smoothstep(0.04, 0.0, abs(fbmP(uv * 3.0 + 4.0, 3.0, 4)) - 0.01);
  h = 0.5 + 0.12 * pores + 0.2 * n - 0.25 * crease;
  col = vec3(0.3, 0.19, 0.11) * (0.78 + 0.3 * n) * (1.0 - 0.3 * crease);
  rough = 0.6 + 0.2 * n;
  ao = 0.8 + 0.2 * pores;
}` },

  // Quilted padded jack (gambeson).
  quilt: {
    normalStrength: 5,
    glsl: /* glsl */ `
void gen(vec2 uv, out float h, out vec3 col, out float rough, out float ao) {
  vec2 p = uv * vec2(6.0, 10.0);
  vec2 f = fract(p);
  float puff = sin(f.x * 3.14159) * (0.85 + 0.15 * sin(f.y * 3.14159));
  float seam = smoothstep(0.0, 0.08, f.x) * smoothstep(1.0, 0.92, f.x);
  vec2 q = uv * 160.0; float weave = sin(q.x * 3.14) * sin(q.y * 3.14);
  h = 0.25 + 0.6 * puff * seam + 0.04 * weave;
  float dirt = vfbmP(uv * 4.0, 4.0, 5);
  col = vec3(0.58, 0.5, 0.38) * (0.8 + 0.2 * puff) * (0.78 + 0.25 * dirt);
  rough = 0.92;
  ao = 0.55 + 0.45 * puff * seam;
}` },

  // Plate steel: hammer dimples, polishing marks and scratches (used as detail on armour).
  steel: {
    normalStrength: 1.6,
    glsl: /* glsl */ `
void gen(vec2 uv, out float h, out vec3 col, out float rough, out float ao) {
  vec4 w = worleyP(uv * 14.0, vec2(14.0), 1.0);
  float dimple = w.x * w.x;
  float polish = vnoiseP(vec2(uv.x * 400.0, uv.y * 6.0), vec2(400.0, 6.0));
  float scratch = 0.0;
  for (int i = 0; i < 4; i++) {
    float a = hash12(vec2(float(i), 3.0)) * 3.14159;
    vec2 d = vec2(cos(a), sin(a));
    float t = dot(uv, d) * 60.0 + hash12(vec2(float(i), 9.0)) * 10.0;
    float line = smoothstep(0.03, 0.0, abs(fract(t + gnoiseP(uv * 8.0, vec2(8.0)) * 0.5) - 0.5));
    scratch += line * step(0.6, vnoiseP(uv * 10.0 + float(i), vec2(10.0)));
  }
  float grime = vfbmP(uv * 6.0, 6.0, 5);
  h = 0.5 + 0.25 * dimple + 0.04 * polish - 0.1 * scratch;
  col = vec3(1.0) * (0.92 + 0.08 * grime);
  rough = clamp(0.2 + 0.25 * grime + 0.08 * polish + 0.25 * scratch, 0.0, 1.0);
  ao = 1.0;
}` },

  bark: {
    normalStrength: 9,
    glsl: /* glsl */ `
void gen(vec2 uv, out float h, out vec3 col, out float rough, out float ao) {
  vec2 p = vec2(uv.x * 8.0, uv.y * 3.0);
  float ridge = 1.0 - abs(fbmP(p + vec2(fbmP(p * 2.0, 8.0, 3) * 0.5, 0.0), 8.0, 5));
  ridge = pow(ridge, 3.0);
  h = 0.2 + 0.8 * ridge;
  vec3 c = mix(vec3(0.12, 0.1, 0.08), vec3(0.32, 0.28, 0.24), ridge);
  float lichen = smoothstep(0.7, 0.8, vfbmP(uv * vec2(10.0, 6.0), 6.0, 4));
  c = mix(c, vec3(0.38, 0.42, 0.28), lichen * 0.5);
  col = c;
  rough = 0.9;
  ao = 0.4 + 0.6 * ridge;
}` },

  water: {
    normalStrength: 2,
    glsl: /* glsl */ `
void gen(vec2 uv, out float h, out vec3 col, out float rough, out float ao) {
  float n = fbmP(uv * 4.0, 4.0, 4) * 0.6 + fbmP(uv * 16.0 + 3.0, 16.0, 4) * 0.4;
  h = n * 0.5 + 0.5;
  col = vec3(1.0); rough = 0.05; ao = 1.0;
}` },
};

const HEIGHT_FRAG = (g: string) => `
${NOISE_GLSL}
${g}
varying vec2 vUv;
void main() { float h; vec3 c; float r; float ao; gen(vUv, h, c, r, ao); gl_FragColor = vec4(h, ao, 0.0, 1.0); }
`;
const ALBEDO_FRAG = (g: string) => `
${NOISE_GLSL}
${g}
varying vec2 vUv;
void main() { float h; vec3 c; float r; float ao; gen(vUv, h, c, r, ao); gl_FragColor = vec4(clamp(c, 0.0, 1.0), clamp(r, 0.03, 1.0)); }
`;
const NORMAL_FRAG = /* glsl */ `
uniform sampler2D uH; uniform float uTexel; uniform float uStrength;
varying vec2 vUv;
void main() {
  float l = texture2D(uH, fract(vUv - vec2(uTexel, 0.0))).r;
  float r = texture2D(uH, fract(vUv + vec2(uTexel, 0.0))).r;
  float d = texture2D(uH, fract(vUv - vec2(0.0, uTexel))).r;
  float u = texture2D(uH, fract(vUv + vec2(0.0, uTexel))).r;
  vec4 c = texture2D(uH, vUv);
  vec3 n = normalize(vec3((l - r) * uStrength, (d - u) * uStrength, 1.0));
  gl_FragColor = vec4(n * 0.5 + 0.5, c.g);
}
`;

export class TextureBaker {
  private quad: THREE.Mesh;
  private scene = new THREE.Scene();
  private cam = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1);
  private cache = new Map<string, PbrSet>();
  private anisotropy: number;

  constructor(private renderer: THREE.WebGLRenderer, public baseSize = 1024) {
    const geo = new THREE.PlaneGeometry(2, 2);
    this.quad = new THREE.Mesh(geo);
    this.quad.frustumCulled = false;
    this.scene.add(this.quad);
    this.anisotropy = Math.min(8, renderer.capabilities.getMaxAnisotropy());
  }

  private draw(mat: THREE.ShaderMaterial, target: THREE.WebGLRenderTarget, layer = 0) {
    this.quad.material = mat;
    const prev = this.renderer.getRenderTarget();
    this.renderer.setRenderTarget(target, layer);
    this.renderer.render(this.scene, this.cam);
    this.renderer.setRenderTarget(prev);
  }

  private makeTarget(size: number, srgb: boolean, array = 0): THREE.WebGLRenderTarget {
    const opts: THREE.RenderTargetOptions = {
      generateMipmaps: true,
      minFilter: THREE.LinearMipmapLinearFilter,
      magFilter: THREE.LinearFilter,
      wrapS: THREE.RepeatWrapping,
      wrapT: THREE.RepeatWrapping,
      type: THREE.UnsignedByteType,
      depthBuffer: false,
      colorSpace: srgb ? THREE.SRGBColorSpace : THREE.NoColorSpace,
      anisotropy: this.anisotropy,
    };
    const t = array > 0 ? new THREE.WebGLArrayRenderTarget(size, size, array, opts) : new THREE.WebGLRenderTarget(size, size, opts);
    t.texture.wrapS = t.texture.wrapT = THREE.RepeatWrapping;
    t.texture.anisotropy = this.anisotropy;
    return t;
  }

  private bakeInto(name: string, size: number, aT: THREE.WebGLRenderTarget, nT: THREE.WebGLRenderTarget, layer: number, overrides?: Record<string, unknown>) {
    const def = GENERATORS[name];
    if (!def) throw new Error('no generator ' + name);
    const uniforms: Record<string, THREE.IUniform> = {};
    for (const [k, u] of Object.entries(def.uniforms ?? {})) {
      const v = overrides && k in overrides ? overrides[k] : u.value;
      uniforms[k] = { value: (v as { clone?: () => unknown })?.clone ? (v as { clone: () => unknown }).clone() : v };
    }
    const hT = new THREE.WebGLRenderTarget(size, size, { type: THREE.HalfFloatType, depthBuffer: false, wrapS: THREE.RepeatWrapping, wrapT: THREE.RepeatWrapping, minFilter: THREE.NearestFilter, magFilter: THREE.NearestFilter, generateMipmaps: false });
    const hMat = new THREE.ShaderMaterial({ vertexShader: VERT, fragmentShader: HEIGHT_FRAG(def.glsl), uniforms, depthTest: false, depthWrite: false });
    const aMat = new THREE.ShaderMaterial({ vertexShader: VERT, fragmentShader: ALBEDO_FRAG(def.glsl), uniforms, depthTest: false, depthWrite: false });
    const nMat = new THREE.ShaderMaterial({
      vertexShader: VERT, fragmentShader: NORMAL_FRAG, depthTest: false, depthWrite: false,
      uniforms: { uH: { value: hT.texture }, uTexel: { value: 1 / size }, uStrength: { value: (def.normalStrength ?? 4) * (size / 1024) * 1.0 } },
    });
    this.draw(hMat, hT);
    this.draw(aMat, aT, layer);
    this.draw(nMat, nT, layer);
    hMat.dispose(); aMat.dispose(); nMat.dispose(); hT.dispose();
  }

  /** Bake (or fetch) a 2D PBR set. `variant` distinguishes uniform overrides. */
  get(name: string, overrides?: Record<string, unknown>, variant = '', sizeMul = 1): PbrSet {
    const key = name + ':' + variant;
    const hit = this.cache.get(key);
    if (hit) return hit;
    const size = Math.max(128, Math.round(this.baseSize * sizeMul));
    const aT = this.makeTarget(size, true);
    const nT = this.makeTarget(size, false);
    this.bakeInto(name, size, aT, nT, 0, overrides);
    const set = { map: aT.texture, normal: nT.texture, key };
    this.cache.set(key, set);
    return set;
  }

  /** Bake several generators into texture arrays (terrain layers). */
  array(names: string[], sizeMul = 1): { map: THREE.Texture; normal: THREE.Texture } {
    const size = Math.max(256, Math.round(this.baseSize * sizeMul));
    const aT = this.makeTarget(size, true, names.length);
    const nT = this.makeTarget(size, false, names.length);
    names.forEach((n, i) => this.bakeInto(n, size, aT, nT, i));
    return { map: aT.texture, normal: nT.texture };
  }

  /** A canvas-drawn texture (heraldry, leaf atlas, decals...). */
  canvas(key: string, w: number, h: number, draw: (ctx: CanvasRenderingContext2D, w: number, h: number) => void, srgb = true): THREE.Texture {
    const hit = this.cache.get('cv:' + key);
    if (hit) return hit.map;
    const c = document.createElement('canvas');
    c.width = w; c.height = h;
    const ctx = c.getContext('2d')!;
    draw(ctx, w, h);
    const t = new THREE.CanvasTexture(c);
    t.colorSpace = srgb ? THREE.SRGBColorSpace : THREE.NoColorSpace;
    t.anisotropy = this.anisotropy;
    t.wrapS = t.wrapT = THREE.RepeatWrapping;
    t.generateMipmaps = true;
    t.minFilter = THREE.LinearMipmapLinearFilter;
    this.cache.set('cv:' + key, { map: t, normal: t, key });
    return t;
  }
}
