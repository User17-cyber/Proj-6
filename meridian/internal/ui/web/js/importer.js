// Adding locations: config files, pasted text, or setting up a server.
import { h, icon, replace, flag, toast, copy } from './util.js';
import { post, get, token } from './api.js';
import { state, countryName, refreshLocations } from './state.js';
import { openModal, closeModal } from './modal.js';
import { connect } from './home.js';

export { openModal, closeModal };

// --- zip support (provider downloads are often a .zip of .conf files) ---

async function unzipConfs(buf) {
  const v = new DataView(buf);
  let eocd = -1;
  for (let i = buf.byteLength - 22; i >= Math.max(0, buf.byteLength - 65557); i--) {
    if (v.getUint32(i, true) === 0x06054b50) { eocd = i; break; }
  }
  if (eocd < 0) throw new Error('not a zip file');
  const count = v.getUint16(eocd + 10, true);
  let p = v.getUint32(eocd + 16, true);
  const out = [];
  const dec = new TextDecoder();
  for (let n = 0; n < count && out.length < 500; n++) {
    if (v.getUint32(p, true) !== 0x02014b50) break;
    const method = v.getUint16(p + 10, true);
    const csize = v.getUint32(p + 20, true);
    const nlen = v.getUint16(p + 28, true), elen = v.getUint16(p + 30, true), clen = v.getUint16(p + 32, true);
    const local = v.getUint32(p + 42, true);
    const name = dec.decode(new Uint8Array(buf, p + 46, nlen));
    p += 46 + nlen + elen + clen;
    if (!/\.conf$/i.test(name) || name.includes('__MACOSX')) continue;
    const lnlen = v.getUint16(local + 26, true), lelen = v.getUint16(local + 28, true);
    const data = new Uint8Array(buf, local + 30 + lnlen + lelen, csize);
    let text;
    if (method === 0) text = dec.decode(data);
    else if (method === 8) text = await new Response(new Blob([data]).stream().pipeThrough(new DecompressionStream('deflate-raw'))).text();
    else continue;
    out.push({ name: name.split('/').pop(), text });
  }
  return out;
}

async function readFiles(fileList) {
  const files = [];
  for (const f of fileList) {
    if (f.size > 4 * 1024 * 1024) { toast(`${f.name} is too large`, true); continue; }
    if (/\.zip$/i.test(f.name)) {
      try { files.push(...(await unzipConfs(await f.arrayBuffer()))); } catch (e) { toast(`${f.name}: ${e.message}`, true); }
    } else {
      files.push({ name: f.name, text: await f.text() });
    }
  }
  return files;
}

async function importFiles(files, resultsEl) {
  if (!files.length) return;
  try {
    const res = await post('/api/locations/import', { files });
    await refreshLocations();
    const ok = res.filter((r) => !r.error);
    replace(resultsEl, res.map((r) => h('div', { class: 'result ' + (r.error ? 'bad' : 'ok') },
      icon(r.error ? 'x' : 'check'),
      h('div', null,
        h('b', null, r.name || 'Pasted config'),
        r.error ? h('div', { class: 'muted' }, r.error)
          : h('div', { class: 'muted' }, `${r.updated ? 'Updated' : 'Added'} as ${r.location.name}${r.location.country ? ' · ' + countryName(r.location.country) : ' · country will be detected on first connection'}`),
        (r.warnings || []).map((w) => h('div', { class: 'muted' }, 'Note: ' + w))))));
    if (ok.length) toast(`${ok.length} location${ok.length > 1 ? 's' : ''} added`);
  } catch (e) {
    toast(e.message, true);
  }
}

// --- the dialog ---

export function openImport(tab = 'file') {
  const body = h('div');
  const tabs = h('div', { class: 'tabs', role: 'tablist' });
  const panes = { file: filePane, paste: pastePane, server: serverPane };
  const names = { file: 'Config files', paste: 'Paste config', server: 'My own server' };
  const show = (t) => {
    replace(tabs, Object.keys(panes).map((k) => h('button', { role: 'tab', class: k === t ? 'active' : '', 'aria-selected': k === t, onclick: () => show(k) }, names[k])));
    replace(body, tabs, panes[t]());
  };
  show(tab);
  openModal('Add a location', [body], [h('button', { class: 'btn', onclick: closeModal }, 'Done')], { wide: true });
}

function filePane() {
  const results = h('div', { class: 'results' });
  const input = h('input', { type: 'file', multiple: true, accept: '.conf,.zip,text/plain', class: 'sr' });
  const drop = h('label', { class: 'drop', tabindex: 0 },
    icon('file'),
    h('b', null, 'Drop WireGuard .conf files or a .zip here'),
    h('span', null, 'or click to choose files'),
    input);
  input.addEventListener('change', async () => importFiles(await readFiles(input.files), results));
  drop.addEventListener('dragover', (e) => { e.preventDefault(); drop.classList.add('over'); });
  drop.addEventListener('dragleave', () => drop.classList.remove('over'));
  drop.addEventListener('drop', async (e) => {
    e.preventDefault();
    drop.classList.remove('over');
    importFiles(await readFiles(e.dataTransfer.files), results);
  });
  return h('div', null,
    drop,
    h('p', { class: 'muted', style: { fontSize: '13px' } },
      'Where to get configs: Mullvad (Account → WireGuard configuration → download a zip of every server), Proton VPN (Downloads → WireGuard configuration), IVPN, AirVPN, Windscribe and most other providers offer them. Meridian places each one on the map from its name and checks the real exit country when you connect.'),
    results);
}

function pastePane() {
  const ta = h('textarea', { class: 'input', rows: 12, placeholder: '[Interface]\nPrivateKey = …\nAddress = 10.64.0.2/32\nDNS = 10.64.0.1\n\n[Peer]\nPublicKey = …\nAllowedIPs = 0.0.0.0/0, ::/0\nEndpoint = 203.0.113.10:51820', spellcheck: 'false' });
  const name = h('input', { class: 'input', placeholder: 'Name (optional), e.g. "Home server" or "nl-ams"' });
  const results = h('div', { class: 'results' });
  return h('div', null,
    h('label', { class: 'f' }, 'WireGuard configuration', ta),
    h('label', { class: 'f mt' }, 'Name', name),
    h('div', { class: 'row mt' }, h('span', { class: 'spacer' }),
      h('button', { class: 'btn primary', onclick: () => importFiles([{ name: name.value.trim(), text: ta.value }], results) }, icon('plus'), 'Add location')),
    results);
}

function serverPane() {
  const host = h('input', { class: 'input', placeholder: '203.0.113.10', autocomplete: 'off', spellcheck: 'false' });
  const port = h('input', { class: 'input', value: '22', inputmode: 'numeric' });
  const user = h('input', { class: 'input', value: 'root', autocomplete: 'off' });
  const pass = h('input', { class: 'input', type: 'password', placeholder: 'Server password', autocomplete: 'off' });
  const key = h('textarea', { class: 'input hidden', rows: 5, placeholder: '-----BEGIN OPENSSH PRIVATE KEY-----', spellcheck: 'false' });
  const keyPass = h('input', { class: 'input hidden', type: 'password', placeholder: 'Key passphrase (if any)', autocomplete: 'off' });
  const useKey = h('input', { type: 'checkbox' });
  useKey.addEventListener('change', () => {
    pass.classList.toggle('hidden', useKey.checked);
    key.classList.toggle('hidden', !useKey.checked);
    keyPass.classList.toggle('hidden', !useKey.checked);
  });
  const adblock = h('input', { type: 'checkbox', checked: true });
  const log = h('div', { class: 'progress-log hidden' });
  const outcome = h('div');
  const go = h('button', { class: 'btn primary' }, icon('server'), 'Set up server');

  go.addEventListener('click', async () => {
    if (!host.value.trim()) return toast('Enter the server address', true);
    go.disabled = true;
    log.classList.remove('hidden');
    log.textContent = 'Connecting…\n';
    replace(outcome);
    try {
      const job = await post('/api/servers/setup', {
        host: host.value.trim(), port: parseInt(port.value, 10) || 22, user: user.value.trim() || 'root',
        password: useKey.checked ? '' : pass.value, privateKey: useKey.checked ? key.value : '', passphrase: keyPass.value,
        serverAdBlock: adblock.checked,
      });
      pass.value = '';
      for (;;) {
        await new Promise((r) => setTimeout(r, 900));
        const st = await get(`/api/servers/setup/${job.id}`);
        log.textContent = st.log.join('\n');
        log.scrollTop = log.scrollHeight;
        if (st.state === 'done') {
          await refreshLocations();
          const loc = state.locations.find((l) => l.id === st.locationId);
          replace(outcome, h('div', { class: 'result ok mt' }, icon('check'),
            h('div', { style: { flex: '1' } }, h('b', null, `${loc ? loc.name : 'Your server'} is ready`),
              h('div', { class: 'muted' }, loc && loc.country ? `Added as a location in ${countryName(loc.country)}.` : 'Added as a location.')),
            h('button', { class: 'btn primary small', onclick: () => { closeModal(); connect(st.locationId); } }, 'Connect now')));
          break;
        }
        if (st.state === 'failed') {
          replace(outcome, h('div', { class: 'result bad mt' }, icon('x'), h('div', null, h('b', null, 'Setup failed'), h('div', { class: 'muted' }, st.error))));
          break;
        }
      }
    } catch (e) {
      replace(outcome, h('div', { class: 'result bad mt' }, icon('x'), h('div', null, e.message)));
    } finally {
      go.disabled = false;
    }
  });

  const scriptBtn = h('button', { class: 'btn small', onclick: async () => {
    const res = await fetch('/api/server-script', { headers: { Authorization: 'Bearer ' + token } });
    const a = h('a', { href: URL.createObjectURL(await res.blob()), download: 'meridian-server.sh' });
    document.body.append(a); a.click(); a.remove();
  } }, icon('down'), 'Download install script');

  return h('div', null,
    h('div', { class: 'steps' },
      h('div', { class: 'step' }, h('b', null, 'Rent a small Linux server where you want to appear'),
        h('p', null, 'Any provider works: Hetzner, DigitalOcean, Vultr, Linode, OVH, AWS Lightsail and others have servers in dozens of cities for about $4–6 a month. Choose Ubuntu 22.04 or newer, or Debian 12, and note its IP address and root password (or SSH key).')),
      h('div', { class: 'step' }, h('b', null, 'Let Meridian set it up'),
        h('p', null, 'Meridian connects over SSH, installs WireGuard, a private DNS resolver and a firewall, and adds the server here. Your password is used once and never stored.'),
        h('div', { class: 'form-grid' },
          h('label', { class: 'f' }, 'Server IP address', host),
          h('label', { class: 'f' }, 'SSH port', port),
          h('label', { class: 'f full' }, 'Username', user),
          h('label', { class: 'f full' }, 'Password', pass),
          h('label', { class: 'row full', style: { fontSize: '13px' } }, useKey, 'Use an SSH private key instead'),
          h('div', { class: 'full' }, key), h('div', { class: 'full' }, keyPass),
          h('label', { class: 'row full', style: { fontSize: '13px' } }, adblock, 'Also block ads on the server for phones using the WireGuard app')),
        h('div', { class: 'row mt' }, scriptBtn, h('span', { class: 'spacer' }), go),
        log, outcome),
      h('div', { class: 'step' }, h('b', null, 'Prefer to do it yourself?'),
        h('p', null, 'Download the script above, copy it to the server and run it there. It prints a config to paste into the "Paste config" tab:'),
        h('div', { class: 'code' }, h('pre', null, 'scp meridian-server.sh root@SERVER:\nssh root@SERVER bash meridian-server.sh'),
          h('button', { class: 'icon-btn', 'aria-label': 'Copy', onclick: () => copy('scp meridian-server.sh root@SERVER:\nssh root@SERVER bash meridian-server.sh') }, icon('copy'))))));
}
