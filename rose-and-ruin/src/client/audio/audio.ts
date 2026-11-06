// WebAudio engine: buses, convolution reverb, HRTF-positioned one-shots with voice limiting,
// looping ambiences and a small procedural score.

import * as THREE from 'three';
import * as S from './sfx';

type Bank = { gen: S.Gen; variants: number; bufs: AudioBuffer[] };

export interface PlayOpts { pos?: { x: number; y: number; z: number }; vol?: number; rate?: number; rateVar?: number; bus?: 'sfx' | 'voice' | 'ui'; delay?: number; maxDist?: number }

export class AudioEngine {
  ctx: AudioContext | null = null;
  private master!: GainNode;
  private buses: Record<string, GainNode> = {};
  private reverbSend!: GainNode;
  private banks = new Map<string, Bank>();
  private active = 0;
  private listenerPos = new THREE.Vector3();
  private loops = new Map<string, { src: AudioBufferSourceNode; gain: GainNode }>();
  volumes = { master: 0.8, sfx: 1, music: 0.55, ambience: 0.7 };
  private music: Music | null = null;

  constructor() {
    const reg = (name: string, gen: S.Gen, variants = 5) => this.banks.set(name, { gen, variants, bufs: [] });
    reg('clang', S.clang, 8); reg('parry', S.clang, 4); reg('shield', S.shieldThud, 5);
    reg('flesh', S.hitFlesh, 6); reg('plate', S.hitPlate, 5);
    reg('whoosh', S.whoosh(false), 5); reg('whooshHeavy', S.whoosh(true), 4);
    reg('kick', S.kickThud, 3); reg('bow', S.bowTwang, 4); reg('thunk', S.arrowThunk, 5);
    reg('step', S.step(0), 6); reg('stepArmour', S.step(1), 6);
    reg('grunt', S.voice(0), 8); reg('pain', S.voice(1), 8); reg('death', S.voice(2), 8); reg('shout', S.voice(3), 5);
    reg('horn', S.horn([146.8, 220, 293.7]), 1); reg('hornLow', S.horn([110, 98, 73.4]), 1); reg('hornShort', S.horn([196, 293.7]), 1);
    reg('drum', S.drum, 4);
    reg('battle', S.battleLoop, 1); reg('wind', S.windLoop(false), 1); reg('surf', S.windLoop(true), 1); reg('fire', S.fireLoop, 1);
    reg('tick', S.uiTick, 1); reg('hit', S.hitTick, 1); reg('killSting', S.killSting, 1);
  }

  /** Must be called from a user gesture. */
  init() {
    if (this.ctx) { if (this.ctx.state === 'suspended') this.ctx.resume(); return; }
    const AC = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
    if (!AC) return;
    const ctx = new AC({ latencyHint: 'interactive' });
    this.ctx = ctx;
    const comp = ctx.createDynamicsCompressor();
    comp.threshold.value = -14; comp.knee.value = 12; comp.ratio.value = 4; comp.attack.value = 0.004; comp.release.value = 0.2;
    this.master = ctx.createGain();
    this.master.gain.value = this.volumes.master;
    this.master.connect(comp).connect(ctx.destination);
    // reverb: synthetic stone-yard impulse
    const conv = ctx.createConvolver();
    conv.buffer = this.impulse(2.4);
    this.reverbSend = ctx.createGain();
    this.reverbSend.gain.value = 0.35;
    this.reverbSend.connect(conv).connect(this.master);
    for (const b of ['sfx', 'voice', 'ui', 'music', 'ambience']) {
      const g = ctx.createGain();
      g.gain.value = b === 'music' ? this.volumes.music : b === 'ambience' ? this.volumes.ambience : this.volumes.sfx;
      g.connect(this.master);
      if (b === 'sfx' || b === 'voice') g.connect(this.reverbSend);
      this.buses[b] = g;
    }
    this.music = new Music(this, ctx, this.buses.music);
  }

  private impulse(secs: number) {
    const ctx = this.ctx!;
    const len = Math.floor(ctx.sampleRate * secs);
    const b = ctx.createBuffer(2, len, ctx.sampleRate);
    for (let ch = 0; ch < 2; ch++) {
      const d = b.getChannelData(ch);
      for (let i = 0; i < len; i++) {
        const t = i / ctx.sampleRate;
        d[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / len, 2.2) * (t < 0.012 ? t / 0.012 : 1) * (Math.random() < 0.002 && t < 0.15 ? 3 : 1);
      }
    }
    return b;
  }

  setVolumes(v: Partial<AudioEngine['volumes']>) {
    Object.assign(this.volumes, v);
    if (!this.ctx) return;
    this.master.gain.value = this.volumes.master;
    this.buses.music.gain.value = this.volumes.music;
    this.buses.ambience.gain.value = this.volumes.ambience;
    for (const b of ['sfx', 'voice', 'ui']) this.buses[b].gain.value = this.volumes.sfx;
  }

  buffer(name: string): AudioBuffer | null {
    const bank = this.banks.get(name);
    if (!bank || !this.ctx) return null;
    // the first take of a sound is made on demand; further variants are synthesised in idle
    // moments so a busy fight never waits on the synthesiser
    if (!bank.bufs.length) bank.bufs.push(bank.gen(this.ctx, 1 + name.length * 17));
    if (bank.bufs.length < bank.variants) this.queue(name);
    return bank.bufs[Math.floor(Math.random() * bank.bufs.length)];
  }

  private pending = new Set<string>();
  private genTimer = 0;
  private queue(name: string) {
    this.pending.add(name);
    if (!this.genTimer) this.genTimer = window.setTimeout(this.genStep, 50);
  }
  /** Synthesise variants for a few milliseconds at a time. */
  private genStep = () => {
    this.genTimer = 0;
    const ctx = this.ctx;
    if (!ctx) return;
    const t0 = performance.now();
    for (const name of this.pending) {
      const bank = this.banks.get(name)!;
      if (bank.bufs.length < bank.variants) bank.bufs.push(bank.gen(ctx, bank.bufs.length + 1 + name.length * 17));
      if (bank.bufs.length >= bank.variants) this.pending.delete(name);
      if (performance.now() - t0 > 5) break;
    }
    if (this.pending.size) this.genTimer = window.setTimeout(this.genStep, 40);
  };

  /** Prepare every sound in the background so the first fight has no hitches. */
  warm() {
    if (!this.ctx) return;
    for (const [name, bank] of this.banks) if (bank.bufs.length < bank.variants) this.queue(name);
  }

  setListener(pos: THREE.Vector3, fwd: THREE.Vector3, up: THREE.Vector3) {
    if (!this.ctx) return;
    this.listenerPos.copy(pos);
    const l = this.ctx.listener;
    const t = this.ctx.currentTime;
    if (l.positionX) {
      l.positionX.setValueAtTime(pos.x, t); l.positionY.setValueAtTime(pos.y, t); l.positionZ.setValueAtTime(pos.z, t);
      l.forwardX.setValueAtTime(fwd.x, t); l.forwardY.setValueAtTime(fwd.y, t); l.forwardZ.setValueAtTime(fwd.z, t);
      l.upX.setValueAtTime(up.x, t); l.upY.setValueAtTime(up.y, t); l.upZ.setValueAtTime(up.z, t);
    } else {
      (l as unknown as { setPosition(x: number, y: number, z: number): void }).setPosition(pos.x, pos.y, pos.z);
    }
  }

  play(name: string, o: PlayOpts = {}) {
    const ctx = this.ctx;
    if (!ctx || ctx.state !== 'running') return;
    let vol = o.vol ?? 1;
    if (o.pos) {
      const d = this.listenerPos.distanceTo(_v.set(o.pos.x, o.pos.y, o.pos.z));
      const maxD = o.maxDist ?? 90;
      if (d > maxD) return;
      if (this.active > 28 && d > 12) return;
      if (this.active > 40) return;
    }
    const b = this.buffer(name);
    if (!b) return;
    const src = ctx.createBufferSource();
    src.buffer = b;
    const rv = o.rateVar ?? 0.08;
    src.playbackRate.value = (o.rate ?? 1) * (1 + (Math.random() * 2 - 1) * rv);
    const g = ctx.createGain();
    g.gain.value = vol;
    let node: AudioNode = src.connect(g);
    if (o.pos) {
      const p = ctx.createPanner();
      p.panningModel = 'HRTF';
      p.distanceModel = 'inverse';
      p.refDistance = 2.5;
      p.rolloffFactor = 1.1;
      p.maxDistance = 400;
      p.positionX.value = o.pos.x; p.positionY.value = o.pos.y; p.positionZ.value = o.pos.z;
      node = node.connect(p);
    }
    node.connect(this.buses[o.bus ?? 'sfx']);
    this.active++;
    src.onended = () => { this.active--; };
    src.start(ctx.currentTime + (o.delay ?? 0));
    void vol;
  }

  loop(id: string, name: string, vol: number, bus: 'ambience' | 'sfx' = 'ambience') {
    const ctx = this.ctx;
    if (!ctx) return;
    let l = this.loops.get(id);
    if (!l) {
      const b = this.buffer(name);
      if (!b) return;
      const src = ctx.createBufferSource();
      src.buffer = b; src.loop = true;
      const gain = ctx.createGain();
      gain.gain.value = 0;
      src.connect(gain).connect(this.buses[bus]);
      src.start();
      l = { src, gain };
      this.loops.set(id, l);
    }
    l.gain.gain.setTargetAtTime(vol, ctx.currentTime, 0.4);
  }
  stopLoops() {
    for (const [, l] of this.loops) { try { l.src.stop(); } catch { /* already stopped */ } }
    this.loops.clear();
  }

  musicMode(mode: 'menu' | 'battle' | 'victory' | 'defeat' | 'off') { this.music?.setMode(mode); }
  musicIntensity(x: number) { this.music?.setIntensity(x); }
  update(dt: number) { this.music?.update(dt); }
}

const _v = new THREE.Vector3();

/** A small generative score: lute over a drone for the menu, war drums for battle. */
class Music {
  private mode: 'menu' | 'battle' | 'victory' | 'defeat' | 'off' = 'off';
  private next = 0;
  private step = 0;
  private drone: { oscs: OscillatorNode[]; gain: GainNode; filt: BiquadFilterNode } | null = null;
  private intensity = 0;
  private lutes = new Map<number, AudioBuffer>();
  // D dorian, two octaves
  private scale = [146.83, 164.81, 174.61, 196.0, 220.0, 246.94, 261.63, 293.66, 329.63, 349.23, 392.0, 440.0];
  private phrase: number[] = [];

  constructor(private eng: AudioEngine, private ctx: AudioContext, private out: GainNode) {}

  setIntensity(x: number) { this.intensity = x; }

  setMode(m: Music['mode']) {
    if (m === this.mode) return;
    this.mode = m;
    this.step = 0;
    this.next = this.ctx.currentTime + 0.3;
    if (m === 'menu') this.startDrone(0.08); else if (m === 'battle') this.startDrone(0.05); else this.stopDrone();
    if (m === 'victory') { this.eng.play('horn', { bus: 'ui', vol: 0.9, rateVar: 0 }); this.eng.play('drum', { bus: 'ui', vol: 0.8, delay: 0.1 }); }
    if (m === 'defeat') this.eng.play('hornLow', { bus: 'ui', vol: 0.8, rateVar: 0 });
  }

  private startDrone(level: number) {
    const ctx = this.ctx;
    if (!this.drone) {
      const gain = ctx.createGain(); gain.gain.value = 0;
      const filt = ctx.createBiquadFilter(); filt.type = 'lowpass'; filt.frequency.value = 500; filt.Q.value = 0.7;
      filt.connect(gain).connect(this.out);
      const oscs = [73.42, 110, 146.83].map((f, i) => {
        const o = ctx.createOscillator(); o.type = i === 2 ? 'triangle' : 'sawtooth'; o.frequency.value = f; o.detune.value = (i - 1) * 4;
        const g = ctx.createGain(); g.gain.value = i === 2 ? 0.25 : 0.4;
        o.connect(g).connect(filt); o.start();
        return o;
      });
      this.drone = { oscs, gain, filt };
    }
    this.drone.gain.gain.setTargetAtTime(level, ctx.currentTime, 1.5);
  }
  private stopDrone() { if (this.drone) this.drone.gain.gain.setTargetAtTime(0, this.ctx.currentTime, 1.2); }

  private lute(f: number) {
    let b = this.lutes.get(f);
    if (!b) { b = S.pluck(f)(this.ctx, Math.round(f)); this.lutes.set(f, b); }
    return b;
  }

  private note(f: number, at: number, vol: number) {
    const src = this.ctx.createBufferSource();
    src.buffer = this.lute(f);
    const g = this.ctx.createGain(); g.gain.value = vol;
    src.connect(g).connect(this.out);
    src.start(at);
  }

  update(_dt: number) {
    const ctx = this.ctx;
    if (this.mode === 'off' || this.mode === 'victory' || this.mode === 'defeat') return;
    if (this.drone) this.drone.filt.frequency.setTargetAtTime(420 + 260 * Math.sin(ctx.currentTime * 0.1) + this.intensity * 400, ctx.currentTime, 0.5);
    while (this.next < ctx.currentTime + 0.25) {
      const t = this.next;
      if (this.mode === 'menu') {
        const beat = 0.78;
        if (this.step % 16 === 0) this.phrase = this.makePhrase();
        const deg = this.phrase[this.step % 16];
        if (deg >= 0) this.note(this.scale[deg], t, 0.5);
        if (this.step % 4 === 0) this.note(this.scale[0] / 2, t, 0.35);
        if (this.step % 8 === 6) this.note(this.scale[4] / 2, t, 0.25);
        this.next += beat * (this.step % 4 === 3 ? 1.5 : 1);
      } else {
        // battle: drums swell with the fighting around the listener
        const beat = 0.5;
        const pattern = [1, 0, 0.5, 0, 1, 0, 0.6, 0.4];
        const v = pattern[this.step % 8] * (0.25 + this.intensity * 0.75);
        if (v > 0.05) this.eng.play('drum', { bus: 'ui', vol: v * 0.55, rate: this.step % 8 === 0 ? 0.9 : 1.05, rateVar: 0.02, delay: Math.max(0, t - ctx.currentTime) });
        this.next += beat;
      }
      this.step++;
    }
  }

  private makePhrase(): number[] {
    const motifs = [[4, 5, 7, 5, 4, 2, 4, -1], [7, 6, 4, 5, 4, 2, 0, -1], [0, 2, 4, 2, 3, 2, 0, -1], [4, 7, 8, 7, 5, 4, 5, -1], [9, 8, 7, 5, 4, 5, 2, -1]];
    const a = motifs[Math.floor(Math.random() * motifs.length)];
    const b = motifs[Math.floor(Math.random() * motifs.length)];
    return [...a, ...b];
  }
}
