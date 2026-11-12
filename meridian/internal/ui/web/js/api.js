// Client for the Meridian service API.

const KEY = 'meridian-token';

function readToken() {
  const m = location.hash.match(/token=([0-9a-f]{32,128})/);
  if (m) {
    try { sessionStorage.setItem(KEY, m[1]); } catch { /* storage may be blocked */ }
    history.replaceState(null, '', location.pathname + location.search + '#home');
    return m[1];
  }
  try { return sessionStorage.getItem(KEY) || ''; } catch { return ''; }
}

export const token = readToken();

export class ApiError extends Error {
  constructor(message, status) { super(message); this.status = status; }
}

export async function api(method, path, body) {
  const opts = { method, headers: { Authorization: 'Bearer ' + token } };
  if (body !== undefined) {
    opts.headers['Content-Type'] = 'application/json';
    opts.body = JSON.stringify(body);
  }
  let res;
  try {
    res = await fetch(path, opts);
  } catch {
    throw new ApiError('The Meridian service is not reachable.', 0);
  }
  const text = await res.text();
  let data = null;
  try { data = text ? JSON.parse(text) : null; } catch { data = text; }
  if (!res.ok) throw new ApiError((data && data.error) || `Request failed (${res.status})`, res.status);
  return data;
}

export const get = (p) => api('GET', p);
export const post = (p, b) => api('POST', p, b ?? {});
export const put = (p, b) => api('PUT', p, b);
export const patch = (p, b) => api('PATCH', p, b);
export const del = (p) => api('DELETE', p);

// Server-sent events over fetch, so the token can travel in a header.
export function stream(path, onEvent, onState) {
  let stopped = false;
  let delay = 500;
  async function run() {
    while (!stopped) {
      try {
        const res = await fetch(path, { headers: { Authorization: 'Bearer ' + token } });
        if (!res.ok || !res.body) throw new Error('stream ' + res.status);
        onState(true);
        delay = 500;
        const reader = res.body.getReader();
        const dec = new TextDecoder();
        let buf = '';
        for (;;) {
          const { value, done } = await reader.read();
          if (done) break;
          buf += dec.decode(value, { stream: true });
          let i;
          while ((i = buf.indexOf('\n\n')) >= 0) {
            const chunk = buf.slice(0, i);
            buf = buf.slice(i + 2);
            let ev = 'message', data = '';
            for (const line of chunk.split('\n')) {
              if (line.startsWith('event: ')) ev = line.slice(7);
              else if (line.startsWith('data: ')) data += line.slice(6);
            }
            if (data) {
              try { onEvent(ev, JSON.parse(data)); } catch { /* ignore bad frames */ }
            }
          }
        }
      } catch { /* fall through to retry */ }
      onState(false);
      await new Promise((r) => setTimeout(r, delay));
      delay = Math.min(delay * 2, 5000);
    }
  }
  run();
  return () => { stopped = true; };
}
