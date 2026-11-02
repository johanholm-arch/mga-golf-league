// Schedule: weeks, matchups, tee times and pairs.
import { core, send, isCommish, isCaptain, signedIn, render as rerender } from '../core.js';
import { WTYPES, TEAM_FMT, sortedWeeks, matches, pairsOf, teamPlayers, tname, pname, matchPoints, localToday, teeMinutes } from '../rules.js';
import { $, esc, attr, field, options, plural, fmtDate, pts, confirmDialog, toast, showError, openPrint } from '../ui.js';

const fmtOpts = WTYPES.map(t => ({ value: t, label: t }));
export function currentWeekId(L) { const W = sortedWeeks(L), today = localToday(); const past = W.filter(w => w.date <= today); return (past.length ? past[past.length - 1] : W[0] || {}).id || null; }

export function render() {
  const L = core.L, W = sortedWeeks(L);
  let h = '';
  if (!signedIn()) h += '<p class="notice">You are viewing the schedule. Sign in on the Account tab to set pairs.</p>';
  if (isCommish()) h += `<div class="card"><h2>Generate the season's schedule</h2><div class="row">${field('First week', `<input id="ly_start" type="date" class="date">`)}${field('Format', `<select id="ly_fmt">${options(fmtOpts, 'Regular')}</select>`)}<button class="btn primary" data-act="generate">Generate schedule</button></div>
    <details><summary>How it works</summary><p class="muted small">Every team plays every other team once, one week apart from the first week. With an odd number of teams, one team has a bye each week. Tee times start at 4:12 PM nine minutes apart and rotate so no team is always last. Afterwards you can change any week's format, tee times and matchups below.</p></details></div>`;
  if (isCaptain()) h += `<div class="card"><h2>Add a single week</h2><div class="row">${field('Date', `<input id="nw_date" type="date" class="date" value="${localToday()}">`)}${field('Format', `<select id="nw_fmt">${options(fmtOpts, 'Regular')}</select>`)}<button class="btn primary" data-act="addWeek">Add week</button></div></div>`;
  if (L.teams.length < 2) return h + '<div class="card empty">Add at least two teams on the Roster tab first.</div>';
  if (!W.length) return h + `<div class="card empty">No weeks yet.${isCommish() ? ' Generate the schedule above, or add a single week.' : ''}</div>`;
  const cur = currentWeekId(L);
  if (!core.ui.expandedWeeks.size && cur) core.ui.expandedWeeks.add(cur);
  for (const w of W) h += weekCard(w, w.id === cur);
  return h;
}

function weekCard(w, isCurrent) {
  const L = core.L, c = core.c, open = core.ui.expandedWeeks.has(w.id), ms = matches(w);
  let h = `<div class="card" id="wk_${attr(w.id)}"><div class="matchhead"><div class="row center" style="margin:0"><button class="btn small icon" data-act="toggleWeek" data-week="${attr(w.id)}" aria-expanded="${open}" aria-label="${open ? 'Collapse' : 'Expand'} week">${open ? '▾' : '▸'}</button><h2 style="margin:0">${fmtDate(w.date)}</h2>${isCurrent ? '<span class="status in">This week</span>' : ''}
    ${isCaptain() ? `<select data-change="weekType" data-week="${attr(w.id)}" aria-label="Format">${options(fmtOpts, w.type || 'Regular')}</select>` : `<span class="pill">${esc(w.type || 'Regular')}</span>`}
    ${w.bye ? `<span class="muted">Bye: ${esc(tname(L, w.bye))}</span>` : ''}</div>
    <div class="row center" style="margin:0"><button class="btn small" data-act="printSignIn" data-week="${attr(w.id)}">Print sign-in sheet</button>${isCommish() ? `<button class="btn small danger" data-act="deleteWeek" data-week="${attr(w.id)}">Delete week</button>` : ''}</div></div>`;
  if (!open) { h += `<p class="muted small" style="margin:0">${ms.length ? ms.map(m => `${esc(tname(L, m.a))} vs ${esc(tname(L, m.b))}${m.tee ? ' ' + esc(m.tee) : ''}`).join(' · ') : 'No matchups yet.'}</p>`; return h + '</div>'; }
  if (isCaptain()) h += `<div class="row"><b>Add matchup</b>${field('Home', `<select id="ma_${attr(w.id)}">${options(L.teams.map(t => ({ value: t.id, label: t.name })), '')}</select>`)}${field('Away', `<select id="mb_${attr(w.id)}">${options(L.teams.map(t => ({ value: t.id, label: t.name })), L.teams[1] ? L.teams[1].id : '')}</select>`)}${field('Tee time', `<input id="mt_${attr(w.id)}" class="short" placeholder="e.g. 5:30 PM">`)}<button class="btn" data-act="addMatchup" data-week="${attr(w.id)}">Add</button></div>`;
  if (!ms.length) h += '<p class="muted">No matchups scheduled for this week yet.</p>';
  for (const m of [...ms].sort((a, b) => teeMinutes(a.tee) - teeMinutes(b.tee))) h += matchupBlock(w, m);
  h += `<p class="muted small">${TEAM_FMT[w.type] ? `${esc(w.type)} week: pick the 2 players on each team who play. Their combined handicap sets the strokes on the Scorecard.` : 'Each matchup has two pairs. Set the pairs here or on the Scorecard tab. Without pairs, the whole team\'s net score decides the match.'}</p>`;
  return h + '</div>';
}

export function pairEditor(w, m) {
  const L = core.L, pa = teamPlayers(L, m.a), pb = teamPlayers(L, m.b), can = signedIn();
  if (!pa.length || !pb.length) return '<p class="muted">Both teams need players on the Roster before pairing.</p>';
  const sel = (list, val, attrs) => `<select ${attrs} ${can ? '' : 'disabled'}>${options(list.map(p => ({ value: p.id, label: p.name })), val, '— choose —')}</select>`;
  if (TEAM_FMT[w.type]) { const A = m.scrA || ['', ''], B = m.scrB || ['', '']; return `<div class="scroll"><table><tr><th></th><th>${esc(tname(L, m.a))}</th><th>${esc(tname(L, m.b))}</th></tr>${[0, 1].map(i => `<tr><td class="muted">Player ${i + 1}</td><td>${sel(pa, A[i], `data-change="scrPlayer" data-week="${attr(w.id)}" data-matchup="${attr(m.id)}" data-side="a" data-idx="${i}"`)}</td><td>${sel(pb, B[i], `data-change="scrPlayer" data-week="${attr(w.id)}" data-matchup="${attr(m.id)}" data-side="b" data-idx="${i}"`)}</td></tr>`).join('')}</table></div>`; }
  const pr = pairsOf(w, m.id);
  return `<div class="scroll"><table><tr><th></th><th>${esc(tname(L, m.a))}</th><th>${esc(tname(L, m.b))}</th></tr>${[0, 1].map(s => { const p = pr.find(x => x.slot === s) || { pa: '', pb: '' }; return `<tr><td class="muted">Pair ${s + 1}</td><td>${sel(pa, p.pa, `data-change="pair" data-week="${attr(w.id)}" data-matchup="${attr(m.id)}" data-slot="${s}" data-side="pa"`)}</td><td>${sel(pb, p.pb, `data-change="pair" data-week="${attr(w.id)}" data-matchup="${attr(m.id)}" data-slot="${s}" data-side="pb"`)}</td></tr>`; }).join('')}</table></div>`;
}

function matchupBlock(w, m) {
  const L = core.L, mp = matchPoints(L, core.c, w, m);
  return `<div class="slot"><div class="matchhead"><div class="teams">${esc(tname(L, m.a))} vs ${esc(tname(L, m.b))}${mp.ready ? ` <span class="muted">· ${pts(mp.a)} – ${pts(mp.b)}${mp.forfeit ? ' (forfeit)' : ''}</span>` : ''}</div>
    <div class="row center" style="margin:0">${isCaptain() ? field('Tee time', `<input class="short" value="${attr(m.tee || '')}" placeholder="e.g. 5:30 PM" data-change="tee" data-week="${attr(w.id)}" data-matchup="${attr(m.id)}">`) : (m.tee ? `<span class="pill">${esc(m.tee)}</span>` : '')}${isCaptain() ? `<button class="btn small danger" data-act="deleteMatchup" data-week="${attr(w.id)}" data-matchup="${attr(m.id)}">Remove</button>` : ''}</div></div>${pairEditor(w, m)}</div>`;
}

export function signInSheet(w) {
  const L = core.L;
  const ms = matches(w).sort((a, b) => teeMinutes(a.tee) - teeMinutes(b.tee));
  const rows = ms.length ? ms.map(m => `<tr><td>${esc(m.tee || '—')}</td><td>${esc(tname(L, m.a))} vs ${esc(tname(L, m.b))}</td><td></td><td></td><td></td><td></td></tr>`).join('') : '<tr><td colspan="6">No matchups scheduled this week.</td></tr>';
  return `<!DOCTYPE html><html><head><meta charset="utf-8"><title>${esc(fmtDate(w.date))} sign-in sheet</title><style>body{font:15px/1.4 Georgia,serif;color:#000;margin:30px}h1{font-size:22px;margin:0 0 2px}table{width:100%;border-collapse:collapse;margin-top:16px;table-layout:fixed}th,td{border:1px solid #000;padding:12px 8px;text-align:left;overflow-wrap:break-word}th{background:#eee;font-size:13px}col.tt{width:11%}col.mu{width:23%}col.pl{width:16.5%}@media print{body{margin:0}}</style></head><body><h1>${esc(L.settings.leagueName)} — ${esc(fmtDate(w.date))}${w.type && w.type !== 'Regular' ? ' — ' + esc(w.type) : ''}</h1><p style="margin:0;color:#333">Sign-in sheet</p><table><colgroup><col class="tt"><col class="mu"><col class="pl"><col class="pl"><col class="pl"><col class="pl"></colgroup><tr><th>Tee time</th><th>Matchup</th><th></th><th></th><th></th><th></th></tr>${rows}</table><script>window.onload=()=>setTimeout(()=>window.print(),200)<\/script></body></html>`;
}

export const actions = {
  toggleWeek(d) { const s = core.ui.expandedWeeks; s.has(d.week) ? s.delete(d.week) : s.add(d.week); rerender(true); },
  async generate() {
    const startDate = $('ly_start').value; if (!startDate) return showError('Pick the date of the first week.');
    const n = core.L.weeks.length;
    if (!await confirmDialog({ title: 'Generate the schedule?', text: `Creates a round robin for ${plural(core.L.teams.length, 'team')} starting ${fmtDate(startDate)}.${n ? ` Existing weeks on the same dates have their matchups replaced (weeks with scores are left alone).` : ''}`, ok: 'Generate' })) return;
    const r = await send({ type: 'generateSchedule', startDate, weekType: $('ly_fmt').value });
    if (r) { core.ui.expandedWeeks = new Set(); toast(`Generated ${plural(r.result.weeks, 'week')} with ${plural(r.result.matchups, 'matchup')}`); rerender(true); }
  },
  async addWeek() { const date = $('nw_date').value; if (!date) return showError('Pick a date for the week.'); const r = await send({ type: 'addWeek', date, weekType: $('nw_fmt').value }); if (r) { core.ui.expandedWeeks.add(r.result.weekId); rerender(true); toast('Week added'); } },
  async deleteWeek(d) { const w = core.L.weeks.find(x => x.id === d.week); if (!await confirmDialog({ title: `Delete the week of ${fmtDate(w.date)}?`, text: 'Its matchups, pairs and any scores go to Recently deleted on the League tab, where you can restore them for 30 days.', ok: 'Delete week', danger: true })) return; if (await send({ type: 'deleteWeek', weekId: d.week })) toast('Week moved to Recently deleted'); },
  async addMatchup(d) { const a = $('ma_' + d.week).value, b = $('mb_' + d.week).value; if (a === b) return showError('Pick two different teams.'); if (await send({ type: 'addMatchup', weekId: d.week, a, b, tee: $('mt_' + d.week).value })) toast('Matchup added'); },
  async deleteMatchup(d) { const w = core.L.weeks.find(x => x.id === d.week), m = matches(w).find(x => x.id === d.matchup); if (!await confirmDialog({ title: `Remove ${tname(core.L, m.a)} vs ${tname(core.L, m.b)}?`, text: 'The matchup and its pairs are removed from this week. Player scores already typed in are kept.', ok: 'Remove matchup', danger: true })) return; await send({ type: 'deleteMatchup', weekId: d.week, matchupId: d.matchup }); },
  printSignIn(d) { const w = core.L.weeks.find(x => x.id === d.week); if (w) openPrint(signInSheet(w)); },
};
export const changes = {
  weekType(d, el) { send({ type: 'setWeekType', weekId: d.week, weekType: el.value }); },
  tee(d, el) { send({ type: 'setMatchupTee', weekId: d.week, matchupId: d.matchup, tee: el.value }); },
  pair(d, el) { send({ type: 'setPair', weekId: d.week, matchupId: d.matchup, slot: +d.slot, side: d.side, playerId: el.value }); },
  scrPlayer(d, el) { send({ type: 'setScrPlayer', weekId: d.week, matchupId: d.matchup, side: d.side, idx: +d.idx, playerId: el.value }); },
};
