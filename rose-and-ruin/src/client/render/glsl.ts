// Shared GLSL: hashes, tileable value/gradient noise, fbm and Worley cells.
// All "p" functions take a period so the baked textures tile seamlessly.

export const NOISE_GLSL = /* glsl */ `
float hash12(vec2 p) { vec3 p3 = fract(vec3(p.xyx) * .1031); p3 += dot(p3, p3.yzx + 33.33); return fract((p3.x + p3.y) * p3.z); }
vec2 hash22(vec2 p) { vec3 p3 = fract(vec3(p.xyx) * vec3(.1031, .1030, .0973)); p3 += dot(p3, p3.yzx + 33.33); return fract((p3.xx + p3.yz) * p3.zy); }
vec3 hash32(vec2 p) { vec3 p3 = fract(vec3(p.xyx) * vec3(.1031, .1030, .0973)); p3 += dot(p3, p3.yxz + 33.33); return fract((p3.xxy + p3.yzz) * p3.zyx); }

// periodic value noise (period in lattice cells)
float vnoiseP(vec2 p, vec2 period) {
  vec2 i = floor(p); vec2 f = fract(p);
  vec2 u = f * f * f * (f * (f * 6.0 - 15.0) + 10.0);
  float a = hash12(mod(i, period));
  float b = hash12(mod(i + vec2(1.0, 0.0), period));
  float c = hash12(mod(i + vec2(0.0, 1.0), period));
  float d = hash12(mod(i + vec2(1.0, 1.0), period));
  return mix(mix(a, b, u.x), mix(c, d, u.x), u.y);
}
// periodic gradient noise, returns ~[-1,1]
float gnoiseP(vec2 p, vec2 period) {
  vec2 i = floor(p); vec2 f = fract(p);
  vec2 u = f * f * f * (f * (f * 6.0 - 15.0) + 10.0);
  vec2 ga = hash22(mod(i, period)) * 2.0 - 1.0;
  vec2 gb = hash22(mod(i + vec2(1.0, 0.0), period)) * 2.0 - 1.0;
  vec2 gc = hash22(mod(i + vec2(0.0, 1.0), period)) * 2.0 - 1.0;
  vec2 gd = hash22(mod(i + vec2(1.0, 1.0), period)) * 2.0 - 1.0;
  float a = dot(ga, f), b = dot(gb, f - vec2(1.0, 0.0)), c = dot(gc, f - vec2(0.0, 1.0)), d = dot(gd, f - vec2(1.0, 1.0));
  return 1.6 * mix(mix(a, b, u.x), mix(c, d, u.x), u.y);
}
float fbmP(vec2 p, float period, int oct) {
  float s = 0.0, a = 0.5, n = 0.0; vec2 per = vec2(period);
  for (int i = 0; i < 8; i++) {
    if (i >= oct) break;
    s += a * gnoiseP(p, per); n += a;
    p *= 2.0; per *= 2.0; a *= 0.5;
  }
  return s / n;
}
float vfbmP(vec2 p, float period, int oct) {
  float s = 0.0, a = 0.5, n = 0.0; vec2 per = vec2(period);
  for (int i = 0; i < 8; i++) {
    if (i >= oct) break;
    s += a * vnoiseP(p, per); n += a;
    p *= 2.0; per *= 2.0; a *= 0.5;
  }
  return s / n;
}
// periodic Worley: x = F1, y = F2, zw = cell id
vec4 worleyP(vec2 p, vec2 period, float jitter) {
  vec2 i = floor(p); vec2 f = fract(p);
  float f1 = 9.0, f2 = 9.0; vec2 id = vec2(0.0);
  for (int y = -1; y <= 1; y++) for (int x = -1; x <= 1; x++) {
    vec2 g = vec2(float(x), float(y));
    vec2 c = mod(i + g, period);
    vec2 o = hash22(c) * jitter + (1.0 - jitter) * 0.5;
    vec2 r = g + o - f;
    float d = dot(r, r);
    if (d < f1) { f2 = f1; f1 = d; id = c; } else if (d < f2) { f2 = d; }
  }
  return vec4(sqrt(f1), sqrt(f2), id);
}
float luma(vec3 c) { return dot(c, vec3(0.2126, 0.7152, 0.0722)); }
`;
