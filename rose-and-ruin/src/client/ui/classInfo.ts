// Class descriptions shared by the armoury and the death screen.

import { CLASSES, CLASS_IDS, ABILITIES, SHIELDS, type ClassId } from '../../shared/data/classes';
import { WEAPONS } from '../../shared/data/weapons';
import { icon } from './icons';

export function esc(s: string): string {
  return s.replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]!);
}

const pips = (n: number) => `<div class="pips">${[1, 2, 3, 4, 5].map((i) => `<i class="${i <= n ? 'on' : ''}"></i>`).join('')}</div>`;

export function keyLabel(code: string): string {
  if (code.startsWith('Key')) return code.slice(3);
  if (code.startsWith('Digit')) return code.slice(5);
  if (code === 'ShiftLeft' || code === 'ShiftRight') return 'Shift';
  if (code === 'Space') return 'Space';
  if (code === 'Mouse3') return 'Mouse back';
  if (code === 'Mouse4') return 'Mouse forward';
  if (code.startsWith('Numpad')) return 'Num ' + code.slice(6);
  if (code.startsWith('Arrow')) return code.slice(5) + ' arrow';
  return code;
}

/** Attack speed as pips: ×0.85 (slowest) is one, ×1.15 (quickest) is five. */
const attackWord = (v: number) => v === 1 ? 'swings at ordinary speed' : `swings ${Math.round(Math.abs(v - 1) * 100)}% ${v > 1 ? 'faster' : 'slower'}`;
const attackPips = (v: number) => Math.max(1, Math.min(5, Math.round((v - 0.85) / 0.075) + 1));

export function classDetailHtml(cls: ClassId, keys: [string, string] = ['Q', 'E']): string {
  const c = CLASSES[cls];
  const w = WEAPONS[c.weapon];
  const r = c.ratings;
  const abil = c.abilities.map((id, i) => {
    const a = ABILITIES[id];
    return `<div class="abil"><div class="ic">${icon(a.icon)}<kbd>${keys[i]}</kbd></div><div><b>${esc(a.name)}</b> <span class="cd">· ${a.cooldown}s</span><div>${esc(a.description)}</div></div></div>`;
  }).join('');
  return `
    <h3>${esc(c.name)}</h3>
    <div class="ttl">${esc(c.title)}</div>
    <p>${esc(c.description)}</p>
    <div class="stats">
      <span>Attack</span>${pips(r.attack)}
      <span>Defence</span>${pips(r.defence)}
      <span>Attack speed</span>${pips(attackPips(c.attackSpeed))}
      <span>Footspeed</span>${pips(r.speed)}
      <span>Reach</span>${pips(r.reach)}
      <span>Mastery</span>${pips(r.difficulty)}
    </div>
    ${abil}
    <div class="armour-line">${esc(c.armourDesc)} · ${c.hp} vigour · ${attackWord(c.attackSpeed)} · ${esc(w.name)}${c.shield ? ` &amp; ${SHIELDS[c.shield].name} (${SHIELDS[c.shield].hp} durability)` : ''}</div>`;
}

/** Compact selectable class list. Returns a setter for the selection. */
export function classList(container: HTMLElement, selected: ClassId, onSelect: (c: ClassId) => void, withKeys = true): (c: ClassId) => void {
  container.innerHTML = '';
  const btns = new Map<ClassId, HTMLButtonElement>();
  CLASS_IDS.forEach((id, i) => {
    const c = CLASSES[id];
    const b = document.createElement('button');
    b.className = 'classbtn' + (id === selected ? ' sel' : '');
    b.innerHTML = `${icon(id)}<div><div class="cn">${esc(c.name)}</div><div class="ct">${esc(c.title)}</div></div>${withKeys ? `<kbd>${i + 1}</kbd>` : '<span></span>'}`;
    b.addEventListener('click', () => onSelect(id));
    container.appendChild(b);
    btns.set(id, b);
  });
  return (c: ClassId) => { for (const [id, b] of btns) b.classList.toggle('sel', id === c); };
}
