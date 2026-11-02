// Small UI helpers: escaping, formatting, messages and dialogs.
export const $ = id => document.getElementById(id);
export const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
export const attr = s => esc(s);
export const sg = n => n > 0 ? '+' + n : n === 0 ? 'E' : String(n);
export const f1 = n => (Math.round(n * 10) / 10).toFixed(1);
export const pts = n => Number.isInteger(n) ? String(n) : f1(n);
export const plural = (n, w) => `${n} ${w}${n === 1 ? '' : 's'}`;
export const initials = n => (n || '?').split(/\s+/).map(w => w[0]).join('').toUpperCase().slice(0, 4);

export function fmtDate(s, opts) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(String(s || ''))) return '(no date)';
  const d = new Date(s + 'T00:00:00');
  return d.toLocaleDateString(undefined, opts || { weekday: 'short', month: 'short', day: 'numeric', year: 'numeric' });
}
export const fmtShort = s => fmtDate(s, { weekday: 'short', month: 'short', day: 'numeric' });

export const narrow = () => window.matchMedia('(max-width: 720px)').matches;

/** Labelled form field. */
export const field = (label, control, hint) => `<label class="f"><span class="fl">${esc(label)}</span>${control}${hint ? `<span class="fh">${esc(hint)}</span>` : ''}</label>`;
export const options = (list, val, placeholder) => (placeholder ? `<option value="">${esc(placeholder)}</option>` : '') + list.map(o => `<option value="${attr(o.value)}" ${String(o.value) === String(val ?? '') ? 'selected' : ''}>${esc(o.label)}</option>`).join('');

// ---------- messages ----------
let toastTimer;
/** Brief confirmation that something worked. Not for errors. */
export function toast(text) {
  const m = $('toast'); m.textContent = text; m.classList.add('show'); m.setAttribute('role', 'status');
  clearTimeout(toastTimer); toastTimer = setTimeout(() => m.classList.remove('show'), 4000);
}
/** Problems stay on screen until the person dismisses them. */
export function showError(text) {
  const e = $('err'); $('errText').textContent = text; e.hidden = false;
  e.scrollIntoView({ block: 'nearest' });
}
export function clearError() { $('err').hidden = true; }

// ---------- dialogs ----------
/** Ask before doing something that is hard to undo. Resolves true if confirmed. */
export function confirmDialog({ title, text, ok = 'OK', danger = false }) {
  return new Promise(resolve => {
    const d = $('dlg');
    $('dlgTitle').textContent = title; $('dlgText').textContent = text || '';
    const okb = $('dlgOk'); okb.textContent = ok; okb.className = danger ? 'btn danger' : 'btn primary';
    const done = v => { d.close(); okb.onclick = null; $('dlgCancel').onclick = null; d.onclose = null; resolve(v); };
    okb.onclick = () => done(true); $('dlgCancel').onclick = () => done(false); d.onclose = () => resolve(false);
    d.showModal(); $('dlgCancel').focus();
  });
}

export function openPrint(html) {
  const w = window.open('', '_blank');
  if (!w) { showError('Your browser blocked the print window. Allow pop-ups for this site and try again.'); return; }
  w.document.open(); w.document.write(html); w.document.close();
}

/** Download a text file. */
export function download(name, text, type = 'application/json') {
  const a = document.createElement('a'); a.href = URL.createObjectURL(new Blob([text], { type })); a.download = name; document.body.appendChild(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(a.href), 2000);
}
