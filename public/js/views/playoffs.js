// Playoffs: seeds and a single-elimination bracket for any number of teams.
import { core, send, isCommish } from '../core.js';
import { computeBracket, playoffSize, tname, matchPoints, matches, sortedWeeks } from '../rules.js';
import { $, esc, attr, field, pts, plural, fmtDate, confirmDialog, toast, showError } from '../ui.js';

export function render() {
  const L = core.L, c = core.c, po = L.playoffs, P = playoffSize(L), commish = isCommish();
  let h = '';
  if (!commish) h += '<p class="notice">Only the League Commissioner can change seeds, schedule playoff matches or pick winners.</p>';
  h += `<div class="card"><h2>Seeding</h2><p class="muted small">${P} teams make the playoffs${L.teams.length < P ? `, but the league only has ${L.teams.length}. The Commissioner can change the number on the League tab.` : '.'} Seeds follow the standings: points, then net score against par.</p>`;
  if (commish) h += `<div class="row"><button class="btn primary" data-act="genSeeds" ${L.teams.length < P ? 'disabled' : ''}>${po.seeds.length ? 'Re-seed from the standings' : 'Seed from the standings'}</button>${po.seeds.length ? '<button class="btn danger" data-act="resetPlayoffs">Clear the playoffs</button>' : ''}</div>`;
  if (po.seeds.length) h += `<div class="scroll"><table><tr><th class="n">Seed</th><th>Team</th>${commish ? '<th></th>' : ''}</tr>${po.seeds.map((tid, i) => `<tr><td class="n big">${i + 1}</td><td>${esc(tname(L, tid))}</td>${commish ? `<td class="r">${i > 0 ? `<button class="btn small" data-act="moveSeed" data-i="${i}" data-dir="-1" aria-label="Move up">▲</button>` : ''} ${i < po.seeds.length - 1 ? `<button class="btn small" data-act="moveSeed" data-i="${i}" data-dir="1" aria-label="Move down">▼</button>` : ''}</td>` : ''}</tr>`).join('')}</table></div>${commish ? '<p class="muted small">Moving a seed clears scheduled playoff matches and picked winners, since the bracket changes.</p>' : ''}`;
  h += '</div>';
  if (!po.seeds.length) return h + `<div class="card empty">${commish ? 'Seed the playoffs once the regular season is done.' : 'The bracket appears once the Commissioner seeds the playoffs.'}</div>`;
  const { bracket, winners, teamsFor, champion } = computeBracket(L, c);
  if (champion) h += `<div class="card champ"><div class="muted">League Champion</div><b>🏆 ${esc(tname(L, champion))}</b></div>`;
  bracket.rounds.forEach((slots, ri) => {
    h += `<div class="card"><h2>${esc(bracket.names[ri])}</h2>`;
    const byes = slots.filter(s => s.bye).map(s => teamsFor[s.id][0] || teamsFor[s.id][1]).filter(Boolean);
    if (byes.length) h += `<div class="slot"><div class="teams">Straight through to the ${esc(bracket.names[ri + 1] || 'next round')}</div><div class="muted">${byes.map(t => `Seed ${po.seeds.indexOf(t) + 1} ${esc(tname(L, t))}`).join(' · ')}</div></div>`;
    slots.filter(s => !s.bye).forEach(s => { h += slotHtml(s, teamsFor[s.id], winners[s.id], po, c); });
    h += '</div>';
  });
  return h;
}

function slotHtml(s, [a, b], winner, po, c) {
  const L = core.L, commish = isCommish(), seedOf = t => po.seeds.indexOf(t) + 1;
  if (s.bye) { const t = a || b; return t ? `<div class="slot"><div class="teams">Seed ${seedOf(t)} ${esc(tname(L, t))}</div><div class="muted">Bye: straight through to the next round.</div></div>` : ''; }
  if (!a || !b) return `<div class="slot"><div class="muted">Waiting on earlier results.</div></div>`;
  const link = po.links[s.id]; let mp = null, wk = null;
  if (link) { wk = L.weeks.find(x => x.id === link.weekId); const m = wk ? matches(wk).find(x => x.id === link.matchupId) : null; if (wk && m) { const r = matchPoints(L, c, wk, m); mp = r.ready ? { a: m.a === a ? r.a : r.b, b: m.a === a ? r.b : r.a, forfeit: r.forfeit } : null; } }
  let h = `<div class="slot"><div class="teams">Seed ${seedOf(a)} ${esc(tname(L, a))} vs Seed ${seedOf(b)} ${esc(tname(L, b))}</div>`;
  if (link) h += `<div class="row center"><span class="muted">${wk ? `Scheduled for ${esc(fmtDate(wk.date))}` : 'Scheduled on a week that was deleted'}</span>${commish ? `<button class="btn small" data-act="unlink" data-slot="${s.id}">Unschedule</button>` : ''}</div>`;
  else if (commish) h += `<div class="row">${field('Play on', `<input type="date" class="date" id="po_date_${s.id}">`)}${field('Tee time', `<input class="short" id="po_tee_${s.id}" placeholder="optional">`)}<button class="btn primary" data-act="link" data-slot="${s.id}" data-a="${attr(a)}" data-b="${attr(b)}">Schedule this match</button></div>`;
  else h += '<div class="muted">Not scheduled yet.</div>';
  if (mp) h += `<p class="score-line">${esc(tname(L, a))} ${pts(mp.a)} – ${pts(mp.b)} ${esc(tname(L, b))}${mp.forfeit ? ' (forfeit)' : ''}</p>`; else if (link) h += '<p class="muted">Scheduled. Waiting on scores.</p>';
  if (winner) h += `<p><b>Winner: ${esc(tname(L, winner))}</b>${po.overrides[s.id] ? ` <span class="muted small">(picked by the Commissioner)</span> ${commish ? `<button class="btn small" data-act="clearOverride" data-slot="${s.id}">Undo</button>` : ''}` : ''}</p>`;
  else if (mp && mp.a === mp.b) h += `<p class="muted">Tied ${pts(mp.a)}–${pts(mp.b)}.${commish ? ' Pick the winner the way your league settles ties (chip-off, sudden death, coin flip):' : ' The Commissioner picks the winner.'}</p>${commish ? `<div class="row"><button class="btn" data-act="override" data-slot="${s.id}" data-team="${attr(a)}">${esc(tname(L, a))} won</button><button class="btn" data-act="override" data-slot="${s.id}" data-team="${attr(b)}">${esc(tname(L, b))} won</button></div>` : ''}`;
  else if (commish && !mp) h += `<details><summary>Decide this match without scores</summary><div class="row"><button class="btn" data-act="override" data-slot="${s.id}" data-team="${attr(a)}">${esc(tname(L, a))} won</button><button class="btn" data-act="override" data-slot="${s.id}" data-team="${attr(b)}">${esc(tname(L, b))} won</button></div></details>`;
  return h + '</div>';
}

export const actions = {
  async genSeeds() { const po = core.L.playoffs; if (po.seeds.length && !await confirmDialog({ title: 'Re-seed from the standings?', text: 'Scheduled playoff matches and picked winners are cleared.', ok: 'Re-seed' })) return; if (await send({ type: 'generateSeeds' })) toast('Seeds set from the standings'); },
  async resetPlayoffs() { if (!await confirmDialog({ title: 'Clear the playoffs?', text: 'Seeds, scheduled matches and winners are cleared. Weeks already on the schedule stay.', ok: 'Clear playoffs', danger: true })) return; await send({ type: 'resetPlayoffs' }); },
  async moveSeed(d) { await send({ type: 'moveSeed', index: +d.i, dir: +d.dir }); },
  async link(d) { const date = $('po_date_' + d.slot).value; if (!date) return showError('Pick a date for the match.'); if (await send({ type: 'linkSlot', slotId: d.slot, date, tee: $('po_tee_' + d.slot).value, teamA: d.a, teamB: d.b })) toast('Match scheduled. Set its format and pairs on the Schedule tab.'); },
  async unlink(d) { await send({ type: 'unlinkSlot', slotId: d.slot }); },
  async override(d) { if (!await confirmDialog({ title: `${tname(core.L, d.team)} won this match?`, text: 'This decides the match without scores. You can undo it.', ok: 'Yes' })) return; await send({ type: 'setOverride', slotId: d.slot, teamId: d.team }); },
  async clearOverride(d) { await send({ type: 'clearOverride', slotId: d.slot }); },
};
