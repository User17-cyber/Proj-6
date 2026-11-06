// Keyboard and mouse (pointer lock). Presses are latched until the simulation consumes them
// so a quick tap between two ticks is never lost.

import { Btn } from '../shared/types';

export interface Bindings {
  forward: string; back: string; left: string; right: string;
  sprint: string; jump: string; kick: string; ability1: string; ability2: string; thrust: string;
  camera: string; scoreboard: string; chat: string;
}
export const DEFAULT_BINDINGS: Bindings = {
  forward: 'KeyW', back: 'KeyS', left: 'KeyA', right: 'KeyD',
  sprint: 'ShiftLeft', jump: 'Space', kick: 'KeyF', ability1: 'KeyQ', ability2: 'KeyE', thrust: 'KeyR',
  camera: 'KeyV', scoreboard: 'Tab', chat: 'Enter',
};

export class Input {
  keys = new Set<string>();
  mouse = 0; // bitmask of held mouse buttons
  latched = 0;
  yaw = 0;
  pitch = 0;
  sensitivity = 1;
  invertY = false;
  locked = false;
  enabled = false;
  wheel = 0;
  bindings: Bindings = { ...DEFAULT_BINDINGS };
  /** one-shot key presses for UI (Tab, V, Escape...) */
  private pressedKeys = new Set<string>();
  onLockChange: ((locked: boolean) => void) | null = null;

  constructor(private el: HTMLElement) {
    window.addEventListener('keydown', (e) => {
      if ((e.target as HTMLElement)?.tagName === 'INPUT' || (e.target as HTMLElement)?.tagName === 'TEXTAREA') return;
      if (this.enabled && (e.code === 'Tab' || e.code === 'Space' || e.code.startsWith('Arrow'))) e.preventDefault();
      if (!this.keys.has(e.code)) {
        this.pressedKeys.add(e.code);
        this.latch(this.codeToBtn(e.code));
      }
      this.keys.add(e.code);
    });
    window.addEventListener('keyup', (e) => this.keys.delete(e.code));
    window.addEventListener('blur', () => { this.keys.clear(); this.mouse = 0; });
    el.addEventListener('mousedown', (e) => {
      if (!this.enabled) return;
      if (!this.locked) { this.requestLock(); return; }
      this.mouse |= 1 << e.button;
      this.latch(e.button === 0 ? Btn.Attack : e.button === 2 ? Btn.Block : e.button === 1 ? Btn.Thrust : 0);
      e.preventDefault();
    });
    window.addEventListener('mouseup', (e) => { this.mouse &= ~(1 << e.button); });
    el.addEventListener('contextmenu', (e) => e.preventDefault());
    window.addEventListener('mousemove', (e) => {
      if (!this.locked || !this.enabled) return;
      const s = 0.0022 * this.sensitivity;
      this.yaw -= e.movementX * s;
      this.pitch -= e.movementY * s * (this.invertY ? -1 : 1);
      this.pitch = Math.max(-1.35, Math.min(1.35, this.pitch));
    });
    window.addEventListener('wheel', (e) => { this.wheel += Math.sign(e.deltaY); }, { passive: true });
    document.addEventListener('pointerlockchange', () => {
      this.locked = document.pointerLockElement === this.el;
      if (!this.locked) { this.mouse = 0; }
      this.onLockChange?.(this.locked);
    });
  }

  requestLock() {
    const r = (this.el as HTMLElement & { requestPointerLock: (o?: unknown) => Promise<void> | void }).requestPointerLock({ unadjustedMovement: true });
    if (r && typeof (r as Promise<void>).catch === 'function') (r as Promise<void>).catch(() => { try { this.el.requestPointerLock(); } catch { /* ignore */ } });
  }
  exitLock() { if (document.pointerLockElement) document.exitPointerLock(); }

  private codeToBtn(code: string): number {
    const b = this.bindings;
    if (code === b.jump) return Btn.Jump;
    if (code === b.kick) return Btn.Kick;
    if (code === b.ability1) return Btn.Ability1;
    if (code === b.ability2) return Btn.Ability2;
    if (code === b.thrust) return Btn.Thrust;
    return 0;
  }
  private latch(b: number) { if (this.enabled) this.latched |= b; }

  /** Buttons for the next simulation step (held | latched presses). */
  buttons(): number { return this.held() | this.latched; }

  /** Buttons physically held right now. */
  held(): number {
    let b = 0;
    const k = this.keys, B = this.bindings;
    if (this.mouse & 1) b |= Btn.Attack;
    if (this.mouse & 4) b |= Btn.Block;
    if (this.mouse & 2) b |= Btn.Thrust;
    if (k.has(B.sprint) || k.has('ShiftRight')) b |= Btn.Sprint;
    if (k.has(B.jump)) b |= Btn.Jump;
    if (k.has(B.kick)) b |= Btn.Kick;
    if (k.has(B.ability1)) b |= Btn.Ability1;
    if (k.has(B.ability2)) b |= Btn.Ability2;
    if (k.has(B.thrust)) b |= Btn.Thrust;
    return b;
  }
  /** RMB is "block" for melee and "aim" for archers. */
  get rmb() { return (this.mouse & 4) !== 0; }
  get mmb() { return (this.mouse & 2) !== 0; }
  clearLatched() { this.latched = 0; }

  move(): { mx: number; mz: number } {
    const k = this.keys, B = this.bindings;
    let mx = 0, mz = 0;
    if (k.has(B.forward) || k.has('ArrowUp')) mz += 1;
    if (k.has(B.back) || k.has('ArrowDown')) mz -= 1;
    if (k.has(B.left) || k.has('ArrowLeft')) mx -= 1;
    if (k.has(B.right) || k.has('ArrowRight')) mx += 1;
    return { mx, mz };
  }

  consumeKey(code: string): boolean {
    if (this.pressedKeys.has(code)) { this.pressedKeys.delete(code); return true; }
    return false;
  }
  endFrame() { this.pressedKeys.clear(); this.wheel = 0; }
}
