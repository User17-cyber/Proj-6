// Keyboard and mouse (pointer lock). Presses are latched until the simulation consumes them
// so a quick tap between two ticks is never lost.

import { Btn } from '../shared/types';

export interface Bindings {
  forward: string; back: string; left: string; right: string;
  sprint: string; jump: string; kick: string; ability1: string; ability2: string; thrust: string;
  /** raise the shield / guard (as well as right mouse) */
  guard: string;
  camera: string; scoreboard: string; chat: string;
}
export const DEFAULT_BINDINGS: Bindings = {
  forward: 'KeyW', back: 'KeyS', left: 'KeyA', right: 'KeyD',
  sprint: 'ShiftLeft', jump: 'Space', kick: 'KeyF', ability1: 'KeyQ', ability2: 'KeyE', thrust: 'KeyR', guard: 'Digit3',
  camera: 'KeyV', scoreboard: 'Tab', chat: 'Enter',
};

/** Actions a player's own extra keybinds can trigger. */
export type BindAction = 'attack' | 'guard' | 'thrust' | 'kick' | 'ability1' | 'ability2' | 'sprint' | 'jump' | 'forward' | 'back' | 'left' | 'right' | 'camera';
export const BIND_ACTIONS: [BindAction, string][] = [
  ['attack', 'Attack (hold for a heavy blow)'], ['guard', 'Guard / raise shield'], ['thrust', 'Thrust'], ['kick', 'Kick'],
  ['ability1', 'First ability'], ['ability2', 'Second ability'], ['sprint', 'Sprint'], ['jump', 'Jump'],
  ['forward', 'Advance'], ['back', 'Fall back'], ['left', 'Step left'], ['right', 'Step right'], ['camera', 'Change view'],
];
/** An extra key the player has added: any key, or a mouse side button (Mouse3/Mouse4). */
export interface CustomBind { code: string; action: BindAction }

const ACTION_BTN: Partial<Record<BindAction, number>> = {
  attack: Btn.Attack, guard: Btn.Block, thrust: Btn.Thrust, kick: Btn.Kick, ability1: Btn.Ability1, ability2: Btn.Ability2, sprint: Btn.Sprint, jump: Btn.Jump,
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
  custom: CustomBind[] = [];
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
      // side buttons work like keys, for the player's own keybinds
      if (e.button >= 3) { const code = `Mouse${e.button}`; if (!this.keys.has(code)) { this.pressedKeys.add(code); this.latch(this.codeToBtn(code)); } this.keys.add(code); }
      e.preventDefault();
    });
    window.addEventListener('mouseup', (e) => { this.mouse &= ~(1 << e.button); if (e.button >= 3) this.keys.delete(`Mouse${e.button}`); });
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
    if (code === b.guard) return Btn.Block;
    let btn = 0;
    for (const c of this.custom) if (c.code === code) btn |= ACTION_BTN[c.action] ?? 0;
    return btn;
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
    if (k.has(B.guard)) b |= Btn.Block;
    for (const c of this.custom) if (k.has(c.code)) b |= ACTION_BTN[c.action] ?? 0;
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
    for (const c of this.custom) {
      if (!k.has(c.code)) continue;
      if (c.action === 'forward') mz += 1; else if (c.action === 'back') mz -= 1;
      else if (c.action === 'left') mx -= 1; else if (c.action === 'right') mx += 1;
    }
    mx = Math.max(-1, Math.min(1, mx)); mz = Math.max(-1, Math.min(1, mz));
    return { mx, mz };
  }

  consumeKey(code: string): boolean {
    if (this.pressedKeys.has(code)) { this.pressedKeys.delete(code); return true; }
    return false;
  }
  /** A one-shot press of an action's main key or any of the player's own keys for it. */
  consumeAction(action: BindAction, main: string): boolean {
    let hit = this.consumeKey(main);
    for (const c of this.custom) if (c.action === action && this.consumeKey(c.code)) hit = true;
    return hit;
  }
  endFrame() { this.pressedKeys.clear(); this.wheel = 0; }
}
