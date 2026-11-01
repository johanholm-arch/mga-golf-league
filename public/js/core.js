// Shared app state and the one way to change the league: send(op).
import { applyOp, canDo, migrate, view, activeYear } from './ops.js';
import { calc, roleOf } from './rules.js';
import { sendOp, session, fetchState, resetEtag } from './api.js';
import { showError, clearError } from './ui.js';

export const core = {
  S: null, L: null, me: null, rev: 0, accounts: [], needsSetup: false, joinCode: '', trash: null, loaded: false,
  tab: localStorage.getItem('mga_tab') || 'standings',
  ui: { wk: null, statsWk: null, expandedWeeks: new Set(), expandedTeams: new Set(), pairEdit: new Set(), forfeitEdit: new Set(), more: false, filter: '' },
  render: null,   // set by app.js
  dirty: false,
};

export const role = () => roleOf(core.me);
export const isCommish = () => role() === 'commissioner';
export const isCaptain = () => role() === 'captain' || isCommish();
export const signedIn = () => !!core.me;
export const myPlayer = () => core.me ? core.L.players.find(p => p.id === core.me.playerId) || null : null;

/** Rebuild the league view and derived numbers after any change to core.S. */
export function refresh() { core.L = view(core.S); core.c = calc(core.L); }

export function applyServer(d) {
  if (d.state) core.S = migrate(d.state); else if (!core.S) core.S = null;
  if ('rev' in d) core.rev = d.rev;
  if ('accounts' in d) core.accounts = d.accounts;
  if ('needsSetup' in d) core.needsSetup = !!d.needsSetup;
  if ('me' in d) { core.me = d.me; if (d.me) core.me.playerId = d.me.playerId; }
  if ('joinCode' in d) core.joinCode = d.joinCode;
  core.trash = d.trash || null;
  if (core.S && d.trash) { const y = activeYear(core.S); if (y) y.trash = d.trash; }   // only the Commissioner receives this
  core.loaded = true;
  if (core.S) refresh();
}

/** Someone is typing: don't rebuild the page under them. */
export function typing() { const a = document.activeElement; return !!a && /^(INPUT|SELECT|TEXTAREA)$/.test(a.tagName) && a.type !== 'checkbox' && a.type !== 'button'; }

/** Re-render unless the person is mid-edit, in which case render once they finish. */
export function render(force) {
  if (!force && typing()) { core.dirty = true; return; }
  core.dirty = false; core.render && core.render();
}
document.addEventListener('focusout', () => { setTimeout(() => { if (core.dirty && !typing()) render(); }, 150); });

/** Load the league from the server. */
export async function load(force) {
  const d = await fetchState(force);
  if (d) { applyServer(d); return true; }
  return false;
}

/**
 * Apply an operation here immediately, then send it. If the server refuses, the local copy is
 * replaced with the server's. opts.update is called instead of a full render (used while typing).
 */
export async function send(op, opts = {}) {
  clearError();
  const me = myPlayer();
  const why = canDo(op, me, core.S); if (why) { showError(why); return null; }
  const snapshot = JSON.stringify(core.S);
  try { applyOp(core.S, op); } catch (e) { showError(e.message); return null; }
  refresh(); opts.update ? opts.update() : render(opts.force);
  try {
    const d = await sendOp(op); applyServer(d);
    opts.update ? opts.update() : render(opts.force);
    return d;
  } catch (e) {
    core.S = JSON.parse(snapshot); refresh();
    if (e.status === 401) { session.clear(); core.me = null; showError('Your sign-in has expired or was reset. Please sign in again on the Account tab, then redo that change.'); }
    else if (e.status === 0) showError(e.message + ' That change was not saved.');
    else showError(e.message);
    resetEtag(); try { await load(true); } catch { /* keep local */ }
    render(true);
    return null;
  }
}
