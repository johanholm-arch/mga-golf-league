// Talks to the server. Keeps the sign-in token, queues operations one at a time and polls for
// other people's changes only while the page is visible and someone is using it.
const API = '/api';
const IDLE_MS = 30 * 60 * 1000;

export const session = {
  token: localStorage.getItem('mga_token') || null,
  person: localStorage.getItem('mga_person') || null,
  set(d) { this.token = d.token; this.person = d.person; localStorage.setItem('mga_token', d.token); localStorage.setItem('mga_person', d.person); },
  clear() { this.token = null; this.person = null; localStorage.removeItem('mga_token'); localStorage.removeItem('mga_person'); },
};

export async function api(path, opts = {}) {
  opts.headers = Object.assign({ 'Content-Type': 'application/json' }, opts.headers || {});
  if (session.token) opts.headers.Authorization = 'Bearer ' + session.token;
  let r;
  try { r = await fetch(API + path, opts); }
  catch { const e = new Error('Could not reach the league server. Check your connection and try again.'); e.status = 0; throw e; }
  if (r.status === 304) return { notModified: true };
  let d = null; try { d = await r.json(); } catch { /* no body */ }
  if (!r.ok) { const e = new Error((d && d.error) || `Request failed (${r.status})`); e.status = r.status; e.data = d; throw e; }
  d.etag = r.headers.get('etag');
  return d;
}

let etag = null;
/** Fetch the league. Returns null when nothing changed since the last fetch. */
export async function fetchState(force) {
  const d = await api('/state', { headers: !force && etag ? { 'If-None-Match': etag } : {} });
  if (d.notModified) return null;
  etag = d.etag; return d;
}
export function resetEtag() { etag = null; }

// ---------- operation queue ----------
const queue = []; let running = false;
export const saveState = { status: 'idle', listeners: [] };
function setStatus(s) { saveState.status = s; saveState.listeners.forEach(f => f(s)); }
/** Send an operation; resolves with the server's answer. Operations run strictly in order. */
export function sendOp(op) {
  return new Promise((resolve, reject) => { queue.push({ op, resolve, reject }); pump(); });
}
async function pump() {
  if (running) return; running = true;
  while (queue.length) {
    const { op, resolve, reject } = queue.shift();
    setStatus('saving');
    try { const d = await api('/op', { method: 'POST', body: JSON.stringify({ op }) }); etag = null; setStatus('saved'); resolve(d); }
    catch (e) { setStatus('error'); reject(e); }
  }
  running = false;
}
export const pending = () => running || queue.length > 0;

// ---------- polling ----------
let lastActive = Date.now(), timer = null, onUpdate = null, intervalFor = () => 45000;
['pointerdown', 'keydown', 'touchstart', 'scroll'].forEach(ev => document.addEventListener(ev, () => { const wasIdle = Date.now() - lastActive > IDLE_MS; lastActive = Date.now(); if (wasIdle) poll(); }, { passive: true }));
document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'visible') poll(); });

export function startPolling(update, interval) { onUpdate = update; intervalFor = interval; schedule(); }
function schedule() { clearTimeout(timer); timer = setTimeout(poll, intervalFor()); }
async function poll() {
  clearTimeout(timer);
  if (document.visibilityState === 'visible' && Date.now() - lastActive < IDLE_MS && !pending()) {
    try { const d = await fetchState(false); if (d && onUpdate) onUpdate(d); } catch { /* try again later */ }
  }
  schedule();
}
export const refreshNow = poll;
