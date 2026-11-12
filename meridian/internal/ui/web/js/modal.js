// A single reusable dialog.
import { h, icon, replace } from './util.js';

let onClose = null;

export function openModal(title, body, foot, opts = {}) {
  const dlg = document.getElementById('modal');
  const close = h('button', { class: 'icon-btn', 'aria-label': 'Close', onclick: closeModal }, icon('x'));
  replace(dlg,
    h('div', { class: 'modal-head' }, h('h2', null, title), close),
    h('div', { class: 'modal-body' }, body),
    foot && foot.length ? h('div', { class: 'modal-foot' }, foot) : null);
  dlg.style.width = opts.wide ? 'min(760px, calc(100vw - 32px))' : '';
  onClose = opts.onClose || null;
  if (!dlg.open) dlg.showModal();
  dlg.onclose = () => { const f = onClose; onClose = null; if (f) f(); };
  return dlg;
}

export function closeModal() {
  const dlg = document.getElementById('modal');
  if (dlg.open) dlg.close();
}
