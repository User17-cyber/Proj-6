// Renderer: WebGL2 + cascaded sun shadows + N8AO ambient occlusion + bloom + filmic AgX
// grading + SMAA. Quality presets trade resolution, shadow cascades and effects.

import * as THREE from 'three';
import { EffectComposer, RenderPass, EffectPass, BloomEffect, SMAAEffect, SMAAPreset, Effect, DepthOfFieldEffect } from 'postprocessing';
import { N8AOPostPass } from 'n8ao';
import { CSM } from 'three/examples/jsm/csm/CSM.js';
import { setCsm, G } from './materials';
import { PASS } from './passes';

export type Quality = 0 | 1 | 2 | 3;
export const QUALITY_NAMES = ['Low', 'Medium', 'High', 'Ultra'] as const;

export interface GfxSettings {
  quality: Quality;
  renderScale: number;
  ao: boolean;
  bloom: boolean;
  fov: number;
  shadowQuality: Quality;
  /** lower the resolution automatically when frames run long */
  adaptive?: boolean;
}

const GRADE_FRAG = /* glsl */ `
uniform float exposure; uniform vec3 wb; uniform float contrast; uniform float saturation; uniform float vignette;
uniform float grain; uniform float gtime; uniform float hurt; uniform float desat; uniform vec3 shadowTint; uniform vec3 highTint; uniform float flash;
const mat3 LIN709_TO_2020 = mat3(0.6274, 0.0691, 0.0164, 0.3293, 0.9195, 0.0880, 0.0433, 0.0113, 0.8956);
const mat3 LIN2020_TO_709 = mat3(1.6605, -0.1246, -0.0182, -0.5876, 1.1329, -0.1006, -0.0728, -0.0083, 1.1187);
vec3 agxContrast(vec3 x) {
  vec3 x2 = x * x; vec3 x4 = x2 * x2;
  return 15.5 * x4 * x2 - 40.14 * x4 * x + 31.96 * x4 - 6.868 * x2 * x + 0.4298 * x2 + 0.1191 * x - 0.00232;
}
vec3 agx(vec3 color) {
  const mat3 inset = mat3(vec3(0.856627153315983, 0.137318972929847, 0.11189821299995), vec3(0.0951212405381588, 0.761241990602591, 0.0767994186031903), vec3(0.0482516061458583, 0.101439036467562, 0.811302368396859));
  const mat3 outset = mat3(vec3(1.1271005818144368, -0.1413297634984383, -0.14132976349843826), vec3(-0.11060664309660323, 1.157823702216272, -0.11060664309660294), vec3(-0.016493938717834573, -0.016493938717834257, 1.2519364065950405));
  const float minEv = -12.47393, maxEv = 4.026069;
  color = LIN709_TO_2020 * color;
  color = inset * color;
  color = max(color, 1e-10);
  color = log2(color);
  color = (color - minEv) / (maxEv - minEv);
  color = clamp(color, 0.0, 1.0);
  color = agxContrast(color);
  color = outset * color;
  color = pow(max(vec3(0.0), color), vec3(2.2));
  color = LIN2020_TO_709 * color;
  return clamp(color, 0.0, 1.0);
}
void mainImage(const in vec4 inputColor, const in vec2 uv, out vec4 outputColor) {
  vec3 c = inputColor.rgb * exposure * wb;
  c += flash;
  c = agx(c);
  vec3 g = pow(c, vec3(1.0 / 2.2));
  float l = dot(g, vec3(0.2126, 0.7152, 0.0722));
  g = mix(vec3(l), g, saturation * (1.0 - desat));
  g = (g - 0.5) * contrast + 0.5;
  g *= mix(shadowTint, highTint, smoothstep(0.05, 0.85, l));
  vec2 d = uv - 0.5;
  float r = length(d * vec2(1.3, 1.0));
  g *= 1.0 - vignette * smoothstep(0.3, 0.95, r * 1.25);
  float edge = smoothstep(0.25, 0.85, r * 1.35);
  g = mix(g, vec3(0.32, 0.015, 0.01), clamp(hurt * edge, 0.0, 0.85));
  float n = fract(sin(dot(uv * (gtime + 1.7), vec2(12.9898, 78.233))) * 43758.5453) - 0.5;
  g += n * grain;
  outputColor = vec4(pow(clamp(g, 0.0, 1.0), vec3(2.2)), inputColor.a);
}`;

/** Replace NaN/inf pixels and clamp extreme highlights before bloom. */
class SanitizeEffect extends Effect {
  constructor() {
    super('SanitizeEffect', `void mainImage(const in vec4 inputColor, const in vec2 uv, out vec4 outputColor) {
  vec3 c = inputColor.rgb;
  if (any(isnan(c)) || any(isinf(c))) c = vec3(0.0);
  outputColor = vec4(min(max(c, vec3(0.0)), vec3(256.0)), inputColor.a);
}`);
  }
}

export class GradeEffect extends Effect {
  constructor() {
    super('GradeEffect', GRADE_FRAG, {
      uniforms: new Map<string, THREE.Uniform>([
        ['exposure', new THREE.Uniform(1)],
        ['wb', new THREE.Uniform(new THREE.Vector3(1, 1, 1))],
        ['contrast', new THREE.Uniform(1.17)],
        ['saturation', new THREE.Uniform(0.86)],
        ['vignette', new THREE.Uniform(0.46)],
        ['grain', new THREE.Uniform(0.034)],
        ['gtime', new THREE.Uniform(0)],
        ['hurt', new THREE.Uniform(0)],
        ['desat', new THREE.Uniform(0)],
        ['shadowTint', new THREE.Uniform(new THREE.Vector3(0.94, 0.97, 1.0))],
        ['highTint', new THREE.Uniform(new THREE.Vector3(1.04, 1.0, 0.9))],
        ['flash', new THREE.Uniform(0)],
      ]),
    });
  }
  u(name: string) { return this.uniforms.get(name)!; }
}

export class Renderer {
  readonly renderer: THREE.WebGLRenderer;
  readonly scene = new THREE.Scene();
  readonly camera: THREE.PerspectiveCamera;
  composer!: EffectComposer;
  grade = new GradeEffect();
  private bloom!: BloomEffect;
  private ao: N8AOPostPass | null = null;
  private dofPass: EffectPass | null = null;
  dof: DepthOfFieldEffect | null = null;
  csm: CSM | null = null;
  settings: GfxSettings;
  private sun = { dir: new THREE.Vector3(0.4, 0.6, 0.3).normalize(), color: new THREE.Color(1, 0.95, 0.9), intensity: 3 };
  private w = 1; private h = 1;
  /** adaptive resolution multiplier and its frame-time average */
  private dyn = 1;
  private emaMs = 16.7;
  private adaptT = 0;
  private frame = 0;
  private pendingResize = false;

  constructor(readonly canvas: HTMLCanvasElement, settings: GfxSettings) {
    this.settings = settings;
    this.renderer = new THREE.WebGLRenderer({ canvas, antialias: false, powerPreference: 'high-performance', stencil: false, depth: true, alpha: false, preserveDrawingBuffer: false });
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;
    this.renderer.toneMapping = THREE.NoToneMapping;
    this.renderer.shadowMap.enabled = true;
    this.renderer.shadowMap.type = THREE.PCFShadowMap;
    // counters accumulate over every pass of a frame; the app resets them per frame
    this.renderer.info.autoReset = false;
    this.camera = new THREE.PerspectiveCamera(settings.fov, 1, 0.08, 6000);
    this.scene.background = new THREE.Color(0x777777);
    this.buildComposer();
    this.resize();
    window.addEventListener('resize', () => { this.pendingResize = true; });
  }

  private buildComposer() {
    this.composer?.dispose();
    const q = this.settings.quality;
    this.composer = new EffectComposer(this.renderer, { frameBufferType: THREE.HalfFloatType, multisampling: 0 });
    this.composer.addPass(new RenderPass(this.scene, this.camera));
    this.ao = null;
    if (this.settings.ao && q >= 1) {
      const ao = new N8AOPostPass(this.scene, this.camera, Math.max(1, this.w), Math.max(1, this.h));
      ao.configuration.aoRadius = 1.6;
      ao.configuration.distanceFalloff = 0.9;
      ao.configuration.intensity = 2.4;
      ao.configuration.aoSamples = q >= 3 ? 12 : q === 2 ? 8 : 6;
      ao.configuration.denoiseSamples = q >= 3 ? 6 : 4;
      ao.configuration.denoiseRadius = 10;
      ao.configuration.halfRes = false;
      ao.configuration.depthAwareUpsampling = true;
      ao.configuration.gammaCorrection = false;
      ao.configuration.screenSpaceRadius = false;
      this.composer.addPass(ao);
      this.ao = ao;
    }
    this.dof = new DepthOfFieldEffect(this.camera, { focusDistance: 0.02, focalLength: 0.05, bokehScale: 3.0, height: 480 });
    this.dofPass = new EffectPass(this.camera, this.dof);
    this.dofPass.enabled = false;
    this.composer.addPass(this.dofPass);
    this.bloom = new BloomEffect({ luminanceThreshold: 1.05, luminanceSmoothing: 0.4, intensity: this.settings.bloom ? 0.6 : 0, mipmapBlur: true, radius: 0.72, levels: q >= 2 ? 8 : 6 });
    // keep sun glints from overflowing the half-float buffer: an infinite or NaN pixel
    // would be smeared across the whole screen by the bloom blur as a black flash
    this.composer.addPass(new EffectPass(this.camera, new SanitizeEffect()));
    this.composer.addPass(new EffectPass(this.camera, this.bloom, this.grade));
    this.composer.addPass(new EffectPass(this.camera, new SMAAEffect({ preset: q >= 2 ? SMAAPreset.HIGH : SMAAPreset.MEDIUM })));
  }

  setDof(on: boolean, focusDist = 6, aperture = 3) {
    if (!this.dofPass || !this.dof) return;
    this.dofPass.enabled = on;
    if (on) {
      this.dof.cocMaterial.worldFocusDistance = focusDist;
      this.dof.cocMaterial.worldFocusRange = Math.max(2, focusDist * 0.6);
      this.dof.bokehScale = aperture;
    }
  }

  applySettings(s: GfxSettings) {
    const rebuild = s.quality !== this.settings.quality || s.ao !== this.settings.ao || s.shadowQuality !== this.settings.shadowQuality;
    this.settings = s;
    this.camera.fov = s.fov;
    this.camera.updateProjectionMatrix();
    if (rebuild) { this.buildComposer(); this.setupShadows(); }
    this.bloom.intensity = s.bloom ? 0.6 : 0;
    this.resize();
  }

  /** (Re)create cascaded shadows for the current sun. */
  setSun(dir: THREE.Vector3, color: THREE.Color, intensity: number) {
    this.sun.dir.copy(dir); this.sun.color.copy(color); this.sun.intensity = intensity;
    this.setupShadows();
  }

  private setupShadows() {
    if (this.csm) {
      for (const l of this.csm.lights) { this.scene.remove(l); this.scene.remove(l.target); l.dispose(); }
      this.csm.dispose();
      this.csm = null;
    }
    const sq = this.settings.shadowQuality;
    const cascades = [1, 2, 3, 4][sq];
    this.csm = new CSM({
      camera: this.camera,
      parent: this.scene,
      cascades,
      maxFar: [120, 220, 320, 420][sq],
      mode: 'practical',
      shadowMapSize: [1024, 2048, 2048, 4096][sq],
      lightDirection: this.sun.dir.clone().negate(),
      lightIntensity: this.sun.intensity,
      lightNear: 1,
      lightFar: 1400,
      lightMargin: 160,
      shadowBias: -0.00012,
    });
    this.csm.fade = true;
    for (const l of this.csm.lights) {
      l.color.copy(this.sun.color);
      l.shadow.normalBias = 0.035;
      l.shadow.radius = 2;
    }
    // knights cast into the two nearest cascades only (beyond that their shadows are specks)
    PASS.knightShadowCams.clear();
    this.csm.lights.slice(0, 2).forEach((l) => PASS.knightShadowCams.add(l.shadow.camera));
    setCsm(this.csm);
    this.csm.updateFrustums();
  }

  /**
   * Adaptive resolution: drop the render scale when frames run past ~45 fps, raise it again
   * while they keep up with ~57 fps. Changes are coarse and spaced out (resizing is costly).
   */
  adapt(frameMs: number) {
    if (this.settings.adaptive === false) { if (this.dyn !== 1) { this.dyn = 1; this.pendingResize = true; } return; }
    if (frameMs > 250) return; // a hitch (loading, tab switch) is not a trend
    this.emaMs = this.emaMs * 0.93 + frameMs * 0.07;
    this.adaptT += frameMs;
    if (this.adaptT < 1500) return;
    let next = this.dyn;
    if (this.emaMs > 22.5 && this.dyn > 0.5) next = Math.max(0.5, Math.round(this.dyn * 0.85 * 20) / 20);
    else if (this.emaMs < 17.6 && this.dyn < 1) next = Math.min(1, Math.round(this.dyn * 1.12 * 20) / 20);
    this.adaptT = 0;
    // resizing clears the canvas, so it waits for the start of the next frame (no blank frame)
    if (next !== this.dyn) { this.dyn = next; this.pendingResize = true; }
  }

  resize() {
    // a pixel ratio above 1 multiplies every full-screen effect; only Ultra goes beyond it
    const dpr = Math.min(window.devicePixelRatio || 1, this.settings.quality >= 3 ? 1.5 : 1);
    const scale = this.settings.renderScale * this.dyn;
    this.w = Math.max(1, Math.floor(window.innerWidth));
    this.h = Math.max(1, Math.floor(window.innerHeight));
    this.renderer.setPixelRatio(dpr * scale);
    this.renderer.setSize(this.w, this.h, false);
    this.canvas.style.width = this.w + 'px';
    this.canvas.style.height = this.h + 'px';
    this.composer.setSize(this.w, this.h, false);
    this.camera.aspect = this.w / this.h;
    this.camera.updateProjectionMatrix();
    this.csm?.updateFrustums();
  }

  /** passes rendered before the main frame (planar reflections) */
  readonly preRender: (() => void)[] = [];

  render(dt: number) {
    if (this.pendingResize) { this.pendingResize = false; this.resize(); }
    this.frame++;
    // far shadow cascades hold static scenery and distant crowds: refresh them every third frame
    if (this.csm) {
      const L = this.csm.lights;
      for (let i = 0; i < L.length; i++) {
        const sh = L[i].shadow;
        if (i < 2) { sh.autoUpdate = true; continue; }
        sh.autoUpdate = false;
        if ((this.frame + i) % 3 === 0) sh.needsUpdate = true;
      }
    }
    G.uTime.value += dt;
    G.uCamPos.value.copy(this.camera.position);
    this.grade.u('gtime').value = (this.grade.u('gtime').value + dt) % 100;
    this.camera.updateMatrixWorld();
    this.csm?.update();
    for (const f of this.preRender) f();
    this.composer.render(dt);
  }

  get stats() { return this.renderer.info.render; }
  /** resolution multiplier actually in use (settings x adaptive scaling) */
  get effectiveScale() { return this.settings.renderScale * this.dyn; }
}
