// App shell: header, navigation, event dispatch and the polling loop.
import { core, render as rerender, load, applyServer, isCommish, signedIn, role } from './core.js';
import { startPolling, saveState, session } from './api.js';
import { $, esc, toast, showError, clearError, narrow } from './ui.js';
import * as standings from './views/standings.js';
import * as schedule from './views/schedule.js';
import * as scorecard from './views/scorecard.js';
import * as handicaps from './views/handicaps.js';
import * as playoffs from './views/playoffs.js';
import * as outing from './views/outing.js';
import * as stats from './views/stats.js';
import * as roster from './views/roster.js';
import * as league from './views/league.js';
import * as account from './views/account.js';

const I = {
  standings: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M4 20h16M6 20V10M12 20V4M18 20v-7"/></svg>',
  schedule: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="3" y="5" width="18" height="16" rx="2"/><path d="M3 10h18M8 3v4M16 3v4"/></svg>',
  scorecard: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M5 3h14v18H5zM8 8h8M8 12h8M8 16h5"/></svg>',
  handicaps: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/></svg>',
  more: '<svg viewBox="0 0 24 24" fill="currentColor"><circle cx="5" cy="12" r="2"/><circle cx="12" cy="12" r="2"/><circle cx="19" cy="12" r="2"/></svg>',
};
const VIEWS = { standings, schedule, scorecard, handicaps, playoffs, outing, stats, roster, league, account };
const TABS = [
  ['standings', 'Standings'], ['schedule', 'Schedule'], ['scorecard', 'Scorecard'], ['handicaps', 'Handicaps'],
  ['playoffs', 'Playoffs'], ['outing', 'Outing'], ['stats', 'Stats'], ['roster', 'Roster'], ['league', 'League'], ['account', 'Account'],
];
const PRIMARY = ['standings', 'schedule', 'scorecard', 'handicaps'];
const visibleTabs = () => TABS.filter(([id]) => id !== 'league' || isCommish()).map(([id, label]) => [id, id === 'account' && !signedIn() ? 'Sign in' : label]);

function setTab(id) { core.tab = id; core.ui.more = false; localStorage.setItem('mga_tab', id); clearError(); rerender(true); window.scrollTo({ top: 0 }); }

function renderAll() {
  const S = core.S, L = core.L;
  document.title = S ? S.settings.leagueName : 'League';
  $('leagueName').textContent = S ? S.settings.leagueName : 'League';
  $('yearLine').textContent = S ? `League Year ${L.year.label}` : '';
  $('who').innerHTML = core.me
    ? `<span class="chip">${esc(core.me.name)} · ${esc({ commissioner: 'Commissioner', captain: 'Captain' }[role()] || 'Player')}</span><span id="save" class="save"></span><button class="btn small" data-act="signOut">Sign out</button>`
    : (core.loaded && !core.needsSetup ? `<span class="muted">Viewing only</span><button class="btn small primary" data-act="tab" data-tab="account">Sign in</button>` : '');
  const tabs = visibleTabs();
  if (!tabs.find(([id]) => id === core.tab)) core.tab = 'standings';
  $('nav').innerHTML = tabs.map(([id, label]) => `<button data-act="tab" data-tab="${id}" class="${id === core.tab ? 'on' : ''}" ${id === core.tab ? 'aria-current="page"' : ''}>${esc(label)}</button>`).join('');
  const moreOn = !PRIMARY.includes(core.tab);
  $('bar').innerHTML = PRIMARY.map(id => { const t = tabs.find(x => x[0] === id); return `<button data-act="tab" data-tab="${id}" class="${id === core.tab ? 'on' : ''}">${I[id]}${esc(t[1])}</button>`; }).join('')
    + `<button data-act="more" class="${moreOn ? 'on' : ''}" aria-expanded="${core.ui.more}">${I.more}More</button>`;
  let html = '';
  if (!core.loaded) html = '<div class="card empty">Loading the league…</div>';
  else if (core.needsSetup) html = account.render();
  else if (!S) html = '<div class="card empty">No league data yet.</div>';
  else html = VIEWS[core.tab].render();
  if (core.ui.more && narrow()) html += `<div class="scrim" data-act="closeMore"></div><div class="sheet" role="dialog" aria-label="More sections">${tabs.filter(([id]) => !PRIMARY.includes(id)).map(([id, label]) => `<button data-act="tab" data-tab="${id}" class="${id === core.tab ? 'on' : ''}">${esc(label)}</button>`).join('')}</div>`;
  $('view').innerHTML = html;
  const v = VIEWS[core.tab]; if (core.loaded && !core.needsSetup && S && v.update) v.update();
  paintSave(saveState.status);
}
core.render = renderAll;

function paintSave(s) { const e = $('save'); if (!e) return; e.className = 'save' + (s === 'error' ? ' error' : ''); e.textContent = { saving: 'Saving…', saved: 'Saved ✓', error: 'Not saved', idle: '' }[s] || ''; }
saveState.listeners.push(paintSave);

// ---------- events ----------
const ACTIONS = Object.assign({
  tab: d => setTab(d.tab),
  more: () => { core.ui.more = !core.ui.more; rerender(true); },
  closeMore: () => { core.ui.more = false; rerender(true); },
  dismissError: () => clearError(),
  signOut: () => { session.clear(); core.me = null; core.trash = null; core.joinCode = ''; load(true).then(() => rerender(true)); toast('Signed out'); },
}, ...Object.values(VIEWS).map(v => v.actions || {}));
const CHANGES = Object.assign({}, ...Object.values(VIEWS).map(v => v.changes || {}));
const INPUTS = Object.assign({}, ...Object.values(VIEWS).map(v => v.inputs || {}));

document.addEventListener('click', e => {
  const el = e.target.closest('[data-act]'); if (!el) return;
  const fn = ACTIONS[el.dataset.act]; if (!fn) return;
  e.preventDefault();
  Promise.resolve(fn(el.dataset, el, e)).catch(err => showError(err.message || String(err)));
});
document.addEventListener('change', e => {
  const el = e.target.closest('[data-change]'); if (!el) return;
  const fn = CHANGES[el.dataset.change]; if (!fn) return;
  Promise.resolve(fn(el.dataset, el, e)).catch(err => showError(err.message || String(err)));
});
document.addEventListener('input', e => {
  const el = e.target.closest('[data-input]'); if (!el) return;
  const fn = INPUTS[el.dataset.input]; if (!fn) return;
  Promise.resolve(fn(el.dataset, el, e)).catch(err => showError(err.message || String(err)));
});
document.addEventListener('keydown', e => {
  if (e.key === 'Enter' && e.target.matches('input[data-enter]')) { const b = document.querySelector(`[data-act="${e.target.dataset.enter}"]`); if (b) { e.preventDefault(); b.click(); } }
  if (e.key === 'Escape' && core.ui.more) { core.ui.more = false; rerender(true); }
});
window.matchMedia('(max-width: 720px)').addEventListener('change', () => rerender(true));

// ---------- start ----------
renderAll();
load(true).then(() => { if (core.needsSetup) core.tab = 'account'; rerender(true); })
  .catch(e => { core.loaded = true; rerender(true); showError(e.message); });
startPolling(d => { applyServer(d); rerender(); }, () => core.tab === 'scorecard' ? 5000 : 45000);
