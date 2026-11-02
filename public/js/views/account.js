// Sign in, first-time setup, account creation, PIN change, display preferences.
import { core, load, render as rerender, signedIn } from '../core.js';
import { api, session, resetEtag } from '../api.js';
import { personOf, tname } from '../rules.js';
import { $, esc, field, options, toast, showError, clearError } from '../ui.js';

const pinField = (id, label, hint) => field(label, `<input id="${id}" type="password" inputmode="numeric" pattern="[0-9]*" maxlength="6" autocomplete="off" class="short" data-pin="1">`, hint);
const showPins = () => `<label class="check"><input type="checkbox" data-change="showPins"> Show PINs</label>`;
const prefs = () => {
  const theme = localStorage.getItem('mga_theme') || 'auto', size = localStorage.getItem('mga_size') || 'normal';
  return `<div class="card"><h2>Display</h2><div class="row">${field('Colours', `<select data-change="theme">${options([{ value: 'light', label: 'Light' }, { value: 'dark', label: 'Dark' }, { value: 'auto', label: 'Match my phone or computer' }], theme)}</select>`)}${field('Text size', `<select data-change="size">${options([{ value: 'normal', label: 'Normal' }, { value: 'large', label: 'Larger' }], size)}</select>`)}</div><p class="muted small">These settings are saved on this device only.</p></div>`;
};

export function render() {
  const L = core.L;
  if (core.needsSetup) return `<div class="card"><h2>First-time setup</h2><p>Nobody has set up this league yet. This creates the League Commissioner account (that's you). You will need the setup code chosen when the site was created.</p>
    <div class="row">${field('League name', '<input id="bs_league" class="w" placeholder="e.g. Monday Night Golf League" maxlength="60">')}</div>
    <div class="row">${field('Your name', '<input id="bs_name" autocomplete="name">')}${field('Your team\'s name', '<input id="bs_team">')}${field('League Year', `<input id="bs_year" class="short" value="${new Date().getFullYear()}">`)}</div>
    <div class="row">${pinField('bs_pin', 'Choose a PIN', '4 to 6 digits')}${pinField('bs_pin2', 'Repeat PIN')}${field('Setup code', '<input id="bs_code" type="password" autocomplete="off">')}</div>
    <div class="row center">${showPins()}<button class="btn primary" data-act="bootstrap">Create league</button></div></div>`;
  let h = '';
  if (signedIn()) {
    h += `<div class="card"><h2>Signed in</h2><p class="lead">You are signed in as <b>${esc(core.me.name)}</b> (${esc({ commissioner: 'League Commissioner', captain: 'Team Captain' }[core.me.role] || 'Player')}).</p><p class="muted small">You stay signed in on this device for 6 months. Use Sign out on a shared computer.</p><button class="btn" data-act="signOut">Sign out</button></div>`;
    h += `<div class="card"><h2>Change my PIN</h2><div class="row">${pinField('cp_old', 'Current PIN')}${pinField('cp_new', 'New PIN', '4 to 6 digits')}${pinField('cp_new2', 'Repeat new PIN')}</div><div class="row center">${showPins()}<button class="btn primary" data-act="changePin">Change PIN</button></div></div>`;
    return h + prefs();
  }
  const opts = list => options(list.map(p => ({ value: personOf(p), label: `${p.name} — ${tname(L, p.team)}` })), '', 'Pick your name');
  const claimed = L.players.filter(p => core.accounts.includes(personOf(p))).sort((a, b) => a.name.localeCompare(b.name));
  const unclaimed = L.players.filter(p => !core.accounts.includes(personOf(p))).sort((a, b) => a.name.localeCompare(b.name));
  h += `<div class="card"><h2>Sign in</h2><p class="muted">Anyone can look at the league without signing in. Sign in to enter scores or RSVP.</p>`;
  h += claimed.length ? `<div class="row">${field('Your name', `<select id="li_name">${opts(claimed)}</select>`)}${pinField('li_pin', 'PIN')}</div><div class="row center">${showPins()}<button class="btn primary" data-act="login">Sign in</button></div><p class="muted small">Forgotten your PIN? Ask the Commissioner to reset it, then set up your account again below.</p>` : '<p class="muted">Nobody has set up an account yet.</p>';
  h += '</div>';
  h += `<div class="card"><h2>Set up your account</h2>`;
  h += unclaimed.length ? `<p class="muted">First time here? Pick your name, type the league's join code (ask your Commissioner or captain) and choose a PIN.</p><div class="row">${field('Your name', `<select id="cl_name">${opts(unclaimed)}</select>`)}${field('Join code', '<input id="cl_code" class="short" autocomplete="off" autocapitalize="characters">')}</div><div class="row">${pinField('cl_pin', 'Choose a PIN', '4 to 6 digits')}${pinField('cl_pin2', 'Repeat PIN')}</div><div class="row center">${showPins()}<button class="btn primary" data-act="claim">Create my account</button></div>` : '<p class="muted">Everyone on the Roster already has an account. If your name is missing, ask the Commissioner to add you to the Roster.</p>';
  h += '</div>';
  return h + prefs();
}

const v = id => ($(id) ? $(id).value : '').trim();
const pinOk = (pin, pin2) => { if (!/^\d{4,6}$/.test(pin)) { showError('The PIN must be 4 to 6 digits (numbers only).'); return false; } if (pin2 !== undefined && pin !== pin2) { showError('The two PINs you typed are different. Please type them again.'); return false; } return true; };
async function signedInWith(d, msg) { session.set(d); resetEtag(); await load(true); core.tab = 'standings'; rerender(true); toast(msg); }

export const actions = {
  async bootstrap() {
    clearError();
    if (!v('bs_name') || !v('bs_team') || !v('bs_year')) return showError('Fill in your name, your team\'s name and the League Year.');
    if (!pinOk(v('bs_pin'), v('bs_pin2'))) return;
    try { const d = await api('/bootstrap', { method: 'POST', body: JSON.stringify({ leagueName: v('bs_league'), name: v('bs_name'), team: v('bs_team'), year: v('bs_year'), pin: v('bs_pin'), code: $('bs_code').value }) }); await signedInWith(d, 'League created. You are the Commissioner.'); core.tab = 'league'; rerender(true); } catch (e) { showError(e.message); }
  },
  async login() {
    clearError(); const person = v('li_name'); if (!person) return showError('Pick your name from the list first.');
    try { const d = await api('/login', { method: 'POST', body: JSON.stringify({ person, pin: v('li_pin') }) }); await signedInWith(d, 'Signed in'); } catch (e) { showError(e.message); }
  },
  async claim() {
    clearError(); const person = v('cl_name'); if (!person) return showError('Pick your name from the list first.');
    if (!v('cl_code')) return showError('Type the league\'s join code.');
    if (!pinOk(v('cl_pin'), v('cl_pin2'))) return;
    try { const d = await api('/claim', { method: 'POST', body: JSON.stringify({ person, pin: v('cl_pin'), joinCode: v('cl_code') }) }); await signedInWith(d, 'Your account is ready and you are signed in.'); } catch (e) { showError(e.message); }
  },
  async changePin() {
    clearError(); if (!pinOk(v('cp_new'), v('cp_new2'))) return;
    try { const d = await api('/pin', { method: 'POST', body: JSON.stringify({ oldPin: v('cp_old'), newPin: v('cp_new') }) }); session.set(d); toast('PIN changed'); rerender(true); } catch (e) { showError(e.message); }
  },
};
export const changes = {
  showPins(d, el) { document.querySelectorAll('input[data-pin]').forEach(i => i.type = el.checked ? 'text' : 'password'); document.querySelectorAll('input[data-change="showPins"]').forEach(c => c.checked = el.checked); },
  theme(d, el) { if (el.value === 'auto') { localStorage.removeItem('mga_theme'); delete document.documentElement.dataset.theme; } else { localStorage.setItem('mga_theme', el.value); document.documentElement.dataset.theme = el.value; } },
  size(d, el) { if (el.value === 'large') { localStorage.setItem('mga_size', 'large'); document.documentElement.dataset.size = 'large'; } else { localStorage.removeItem('mga_size'); delete document.documentElement.dataset.size; } },
};
