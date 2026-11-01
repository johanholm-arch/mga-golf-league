// Scorecard: hole-by-hole entry. A wide table on desktop; hole-per-row on phones.
import { core, send, signedIn, myPlayer, render as rerender } from '../core.js';
import { HOLES, TEAM_FMT, sortedWeeks, matches, pairsOf, teamPlayers, tname, pname, player, pairCalc, scrambleCalc, matchPoints, holeStrokes, siRanks, sum, teeMinutes } from '../rules.js';
import { $, esc, attr, field, options, fmtDate, fmtShort, pts, sg, initials, narrow, confirmDialog, toast, showError } from '../ui.js';
import { currentWeekId, pairEditor } from './schedule.js';

const dis = () => signedIn() ? '' : 'disabled';
const scoreInput = (pid, i, v, label) => `<span class="sc-wrap"><input class="sc" id="g_${attr(pid)}_${i}" type="text" inputmode="numeric" pattern="[0-9]*" maxlength="2" autocomplete="off" value="${attr(v ?? '')}" data-input="score" data-player="${attr(pid)}" data-hole="${i}" aria-label="${attr(label)} hole ${i + 1}" ${dis()}><span class="dot" id="d_${attr(pid)}_${i}" aria-hidden="true"></span></span>`;
const teamInput = (mid, side, i, v, label) => `<span class="sc-wrap"><input class="sc" id="sg_${attr(mid)}_${side}_${i}" type="text" inputmode="numeric" pattern="[0-9]*" maxlength="2" autocomplete="off" value="${attr(v ?? '')}" data-input="teamScore" data-matchup="${attr(mid)}" data-side="${side}" data-hole="${i}" aria-label="${attr(label)} hole ${i + 1}" ${dis()}><span class="dot" id="sd_${attr(mid)}_${side}_${i}" aria-hidden="true"></span></span>`;
const card = (w, pid) => (w.sc || {})[pid] || [];

export function render() {
  const L = core.L, W = sortedWeeks(L);
  if (!W.length) return `<div class="card empty">No weeks on the schedule yet.${core.me && core.me.role !== 'player' ? ' Add weeks on the <b>Schedule</b> tab.' : ''}</div>`;
  if (!core.ui.wk || !W.find(w => w.id === core.ui.wk)) core.ui.wk = currentWeekId(L);
  const w = W.find(x => x.id === core.ui.wk), cur = currentWeekId(L);
  let h = `<div class="card tight"><div class="row center">${field('Week', `<select data-change="pickWeek" style="font-weight:700">${options(W.map(x => ({ value: x.id, label: `${fmtDate(x.date)}${x.type && x.type !== 'Regular' ? ' · ' + x.type : ''}${x.id === cur ? ' (this week)' : ''}` })), w.id)}</select>`)}<span class="pill">${esc(w.type || 'Regular')}</span></div>${signedIn() ? '' : '<p class="notice" style="margin:10px 0 0">You are viewing this scorecard. <button class="btn small primary" data-act="tab" data-tab="account">Sign in</button> to enter scores.</p>'}</div>`;
  if (!L.players.length) return h + '<div class="card empty">Add players on the Roster tab first.</div>';
  const ms = [...matches(w)].sort((a, b) => teeMinutes(a.tee) - teeMinutes(b.tee));
  if (ms.length) {
    const sched = new Set(ms.flatMap(m => [m.a, m.b])), rest = L.teams.filter(t => !sched.has(t.id)), loose = teamPlayers(L, '');
    const hasRest = rest.some(t => teamPlayers(L, t.id).length) || loose.length;
    let show = ms, showRest = hasRest;
    if (narrow()) {
      // One matchup at a time on a phone. Default to the signed-in person's own matchup.
      const mine = myPlayer(), own = mine ? ms.find(m => m.a === mine.team || m.b === mine.team) : null;
      if (!core.ui.match || (core.ui.match !== 'rest' && !ms.find(m => m.id === core.ui.match))) core.ui.match = own ? own.id : ms[0].id;
      const opts = ms.map(m => ({ value: m.id, label: `${tname(L, m.a)} vs ${tname(L, m.b)}${m.tee ? ' · ' + m.tee : ''}` })); if (hasRest) opts.push({ value: 'rest', label: 'Not scheduled this week' });
      h += `<div class="card tight">${field('Matchup', `<select data-change="pickMatch" style="font-weight:700;width:100%">${options(opts, core.ui.match)}</select>`)}</div>`;
      show = core.ui.match === 'rest' ? [] : ms.filter(m => m.id === core.ui.match); showRest = core.ui.match === 'rest';
    }
    for (const m of show) h += matchCard(w, m);
    const blocks = showRest ? rest.map(t => teamBlock(w, t)).join('') + (loose.length ? teamBlock(w, { id: '', name: 'No team' }) : '') : '';
    if (blocks) h += `<div class="card"><h2>Not scheduled this week</h2><p class="muted small">Rounds entered here still count towards handicaps.</p>${blocks}</div>`;
  } else {
    h += `<div class="card"><h2>Scores</h2><p class="muted small">No matchups this week, so points go by team net score.</p>${L.teams.map(t => teamBlock(w, t)).join('')}${teamPlayers(L, '').length ? teamBlock(w, { id: '', name: 'No team' }) : ''}</div>`;
  }
  h += `<div class="card"><details><summary>How to read the scorecard</summary><div class="small muted"><p>Type each player's gross score for every hole. A round only counts once all 9 holes are in.</p><p>A yellow box with a dot (●) means that player gets a stroke on that hole from the handicap difference with their opponent. The smaller number under each score is the net score; green means that side won the hole.</p>${TEAM_FMT[w.type] ? `<p>${esc(w.type)} week: enter one team score per hole. Strokes come from the two players' combined handicaps divided by ${TEAM_FMT[w.type]}. Lower net total takes all 3 points (1.5 each on a tie). These scores do not affect individual handicaps.</p>` : '<p>Each matchup is worth 3 points: one per pair (the pair that wins more holes) and one Team Point for the lower of each team\'s two net scores on each hole.</p>'}</div></details></div>`;
  return h;
}

function matchCard(w, m) {
  const L = core.L, ta = tname(L, m.a), tb = tname(L, m.b), edit = core.ui.pairEdit.has(m.id), ff = core.ui.forfeitEdit.has(m.id);
  let h = `<div class="card"><div class="matchhead"><div><h2>${esc(ta)} vs ${esc(tb)}</h2><div class="muted small">${m.tee ? esc(m.tee) + ' · ' : ''}<span class="score-line" id="ms_${attr(m.id)}"></span></div></div>
    ${signedIn() ? `<div class="row center" style="margin:0"><button class="btn small" data-act="togglePairs" data-matchup="${attr(m.id)}" aria-expanded="${edit}">${edit ? 'Done' : TEAM_FMT[w.type] ? 'Choose players' : 'Change pairs'}</button><button class="btn small" data-act="toggleForfeit" data-matchup="${attr(m.id)}" aria-expanded="${ff}">${ff ? 'Done' : m.forfeit ? 'Forfeit recorded' : 'Record a forfeit'}</button></div>` : ''}</div>`;
  if (edit) h += `<div class="slot">${pairEditor(w, m)}</div>`;
  if (ff) h += forfeitForm(m, ta, tb);
  if (m.forfeit) { const mp = matchPoints(L, core.c, w, m); return h + `<p class="lead"><b>Forfeit${m.forfeit.reason ? ': ' + esc(m.forfeit.reason) : ''}.</b> ${esc(ta)} ${pts(mp.a)} – ${pts(mp.b)} ${esc(tb)}</p></div>`; }
  h += TEAM_FMT[w.type] ? (narrow() ? scrambleNarrow(w, m) : scrambleWide(w, m)) : (narrow() ? regularNarrow(w, m) : regularWide(w, m));
  return h + '</div>';
}

function forfeitForm(m, ta, tb) {
  const cur = m.forfeit || {};
  return `<div class="slot"><div class="row">${field('Outcome', `<select id="ff_win_${attr(m.id)}">${options([{ value: 'a', label: `${ta} wins by forfeit` }, { value: 'b', label: `${tb} wins by forfeit` }, { value: 'tie', label: 'Double forfeit: 1.5 points each' }], cur.winner || '', '— choose —')}</select>`)}${field('Reason (optional)', `<input id="ff_why_${attr(m.id)}" value="${attr(cur.reason || '')}" placeholder="e.g. weather" maxlength="120">`)}<button class="btn primary" data-act="saveForfeit" data-matchup="${attr(m.id)}">Save forfeit</button>${m.forfeit ? `<button class="btn danger" data-act="clearForfeit" data-matchup="${attr(m.id)}">Remove forfeit</button>` : ''}</div></div>`;
}

const hdrWide = () => { const L = core.L; return `<tr><th>Player</th>${Array.from({ length: HOLES }, (_, i) => `<th class="n">${i + 1}</th>`).join('')}<th class="n">Total</th><th class="n">Hcp</th><th class="n">Net</th></tr><tr class="sub"><td>Par</td>${L.course.par.map(p => `<td class="n">${p}</td>`).join('')}<td class="n">${sum(L.course.par)}</td><td></td><td></td></tr><tr class="sub"><td>Stroke index</td>${L.course.hcp.map(v => `<td class="n">${v}</td>`).join('')}<td colspan="3"></td></tr>`; };
const playerRowsWide = (w, p) => `<tr><td>${esc(p.name)}</td>${Array.from({ length: HOLES }, (_, i) => `<td class="cell">${scoreInput(p.id, i, card(w, p.id)[i], p.name)}</td>`).join('')}<td class="n big" id="t_${attr(p.id)}"></td><td class="n" id="h_${attr(p.id)}"></td><td class="n big" id="n_${attr(p.id)}"></td></tr><tr class="sub"><td>net</td>${Array.from({ length: HOLES }, (_, i) => `<td class="n" id="pn_${attr(p.id)}_${i}"></td>`).join('')}<td colspan="3"></td></tr>`;

function regularWide(w, m) {
  const L = core.L, prs = pairsOf(w, m.id).filter(p => p.pa && p.pb), paired = new Set(prs.flatMap(p => [p.pa, p.pb]));
  let h = `<div class="scroll"><table>${hdrWide()}`;
  if (!prs.length) h += `<tr><td colspan="13" class="muted">No pairs set yet. Use <b>Change pairs</b> to choose who plays whom; points are awarded once pairs are set.</td></tr>`;
  prs.forEach((p, idx) => {
    h += `<tr class="hd"><td colspan="10">Pair ${idx + 1}: ${esc(pname(L, p.pa))} vs ${esc(pname(L, p.pb))}</td><td colspan="3" class="n">Points: <span id="ppt_${attr(p.id)}">–</span></td></tr>`;
    h += playerRowsWide(w, player(L, p.pa)) + playerRowsWide(w, player(L, p.pb));
  });
  if (prs.length) h += `<tr class="hd"><td colspan="10">Team Point (lowest net on each hole)</td><td colspan="3" class="n">Points: <span id="tpt_${attr(m.id)}">–</span></td></tr>
    <tr><td class="muted">${esc(tname(L, m.a))} low net</td>${Array.from({ length: HOLES }, (_, i) => `<td class="n" id="tpa_${attr(m.id)}_${i}"></td>`).join('')}<td colspan="3"></td></tr>
    <tr><td class="muted">${esc(tname(L, m.b))} low net</td>${Array.from({ length: HOLES }, (_, i) => `<td class="n" id="tpb_${attr(m.id)}_${i}"></td>`).join('')}<td colspan="3"></td></tr>
    <tr class="sub"><td>Hole winner</td>${Array.from({ length: HOLES }, (_, i) => `<td class="n" id="tph_${attr(m.id)}_${i}"></td>`).join('')}<td colspan="3"></td></tr>`;
  h += `<tr class="hd"><td colspan="13">Match: <span id="mt_${attr(m.id)}">–</span></td></tr>`;
  const others = [...teamPlayers(L, m.a), ...teamPlayers(L, m.b)].filter(p => !paired.has(p.id));
  if (others.length) h += `<tr class="hd"><td colspan="13">Also playing (counts for handicap only)</td></tr>` + others.map(p => playerRowsWide(w, p)).join('');
  return h + '</table></div>';
}

function narrowPairTable(w, pa, pb) {
  const L = core.L;
  const col = (p, i) => p ? `<td class="cell">${scoreInput(p.id, i, card(w, p.id)[i], p.name)}<div class="net" id="pn_${attr(p.id)}_${i}"></div></td>` : '<td></td>';
  let h = `<div class="scroll"><table><tr><th class="n">Hole</th><th class="n">Par</th><th class="n">${esc(pa.name)}</th><th class="n">${pb ? esc(pb.name) : ''}</th></tr>`;
  for (let i = 0; i < HOLES; i++) h += `<tr><td class="n hole-h">${i + 1}<div class="net">SI ${L.course.hcp[i]}</div></td><td class="n">${L.course.par[i]}</td>${col(pa, i)}${col(pb, i)}</tr>`;
  const tot = p => p ? `<td class="n"><span class="big" id="t_${attr(p.id)}"></span><div class="net">hcp <span id="h_${attr(p.id)}"></span> · net <b id="n_${attr(p.id)}"></b></div></td>` : '<td></td>';
  h += `<tr class="hd"><td class="n">Total</td><td class="n">${sum(L.course.par)}</td>${tot(pa)}${tot(pb)}</tr></table></div>`;
  return h;
}
function regularNarrow(w, m) {
  const L = core.L, prs = pairsOf(w, m.id).filter(p => p.pa && p.pb), paired = new Set(prs.flatMap(p => [p.pa, p.pb]));
  let h = '';
  if (!prs.length) h += `<p class="muted">No pairs set yet. Use <b>Change pairs</b> to choose who plays whom; points are awarded once pairs are set.</p>`;
  prs.forEach((p, idx) => { h += `<div class="player-card"><div class="matchhead"><b>Pair ${idx + 1}</b><span>Points: <b id="ppt_${attr(p.id)}">–</b></span></div>${narrowPairTable(w, player(L, p.pa), player(L, p.pb))}</div>`; });
  if (prs.length) h += `<div class="player-card"><div class="matchhead"><b>Team Point</b><span>Points: <b id="tpt_${attr(m.id)}">–</b></span></div><div class="muted small">Lowest net on each hole. Hole winners:</div><div class="scroll"><table><tr>${Array.from({ length: HOLES }, (_, i) => `<td class="n" id="tph_${attr(m.id)}_${i}" style="padding:6px 2px"></td>`).join('')}</tr></table></div></div>`;
  h += `<p class="score-line">Match: <span id="mt_${attr(m.id)}">–</span></p>`;
  const others = [...teamPlayers(L, m.a), ...teamPlayers(L, m.b)].filter(p => !paired.has(p.id));
  if (others.length) { h += `<div class="player-card"><b>Also playing</b> <span class="muted small">(counts for handicap only)</span>`; for (let i = 0; i < others.length; i += 2) h += narrowPairTable(w, others[i], others[i + 1]); h += '</div>'; }
  return h;
}

function scrambleWide(w, m) {
  const L = core.L, who = ids => (ids || []).filter(Boolean).map(id => pname(L, id)).join(' / ') || 'choose 2 players';
  const row = (side, tid, ids, sc) => `<tr><td>${esc(tname(L, tid))}<div class="muted small">${esc(who(ids))}</div></td>${Array.from({ length: HOLES }, (_, i) => `<td class="cell">${teamInput(m.id, side, i, sc[i], tname(L, tid))}</td>`).join('')}<td class="n big" id="st_${attr(m.id)}_${side}"></td><td class="n" id="sh_${attr(m.id)}_${side}"></td><td class="n big" id="snt_${attr(m.id)}_${side}"></td></tr><tr class="sub"><td>net</td>${Array.from({ length: HOLES }, (_, i) => `<td class="n" id="sn_${attr(m.id)}_${side}_${i}"></td>`).join('')}<td colspan="3"></td></tr>`;
  return `<div class="scroll"><table>${hdrWide().replace('<th>Player</th>', '<th>Team</th>')}${row('a', m.a, m.scrA, m.scA || [])}${row('b', m.b, m.scrB, m.scB || [])}<tr class="hd"><td colspan="13">Points: <span id="spt_${attr(m.id)}">–</span></td></tr></table></div>`;
}
function scrambleNarrow(w, m) {
  const L = core.L, who = ids => (ids || []).filter(Boolean).map(id => pname(L, id)).join(' / ') || 'choose 2 players';
  const col = (side, tid, sc, i) => `<td class="cell">${teamInput(m.id, side, i, sc[i], tname(L, tid))}<div class="net" id="sn_${attr(m.id)}_${side}_${i}"></div></td>`;
  let h = `<div class="muted small">${esc(tname(L, m.a))}: ${esc(who(m.scrA))} · ${esc(tname(L, m.b))}: ${esc(who(m.scrB))}</div><div class="scroll"><table><tr><th class="n">Hole</th><th class="n">Par</th><th class="n">${esc(tname(L, m.a))}</th><th class="n">${esc(tname(L, m.b))}</th></tr>`;
  for (let i = 0; i < HOLES; i++) h += `<tr><td class="n hole-h">${i + 1}<div class="net">SI ${L.course.hcp[i]}</div></td><td class="n">${L.course.par[i]}</td>${col('a', m.a, m.scA || [], i)}${col('b', m.b, m.scB || [], i)}</tr>`;
  const tot = side => `<td class="n"><span class="big" id="st_${attr(m.id)}_${side}"></span><div class="net">hcp <span id="sh_${attr(m.id)}_${side}"></span> · net <b id="snt_${attr(m.id)}_${side}"></b></div></td>`;
  h += `<tr class="hd"><td class="n">Total</td><td class="n">${sum(L.course.par)}</td>${tot('a')}${tot('b')}</tr></table></div><p class="score-line">Points: <span id="spt_${attr(m.id)}">–</span></p>`;
  return h;
}

function teamBlock(w, t) {
  const L = core.L, ps = teamPlayers(L, t.id); if (!ps.length) return '';
  let h = `<div class="player-card"><div class="matchhead"><b>${esc(t.name)}</b><span>Team net vs par: <b id="tt_${attr(t.id)}">–</b></span></div>`;
  if (narrow()) { for (let i = 0; i < ps.length; i += 2) h += narrowPairTable(w, ps[i], ps[i + 1]); }
  else h += `<div class="scroll"><table>${hdrWide()}${ps.map(p => playerRowsWide(w, p)).join('')}</table></div>`;
  return h + '</div>';
}

/** Fill in totals, nets, strokes and points without rebuilding the inputs. */
export function update() {
  const L = core.L, c = core.c, w = L.weeks.find(x => x.id === core.ui.wk); if (!w) return;
  const rk = siRanks(L.course), set = (id, v) => { const e = $(id); if (e) e.textContent = v; }, cls = (id, k, on) => { const e = $(id); if (e) e.classList.toggle(k, !!on); };
  const paired = new Set();
  for (const m of matches(w)) {
    if (m.forfeit) { const mp = matchPoints(L, c, w, m); set('ms_' + m.id, `${pts(mp.a)} – ${pts(mp.b)}`); continue; }
    if (TEAM_FMT[w.type]) {
      const sc = scrambleCalc(L, c, w, m);
      ['a', 'b'].forEach(side => {
        const g = side === 'a' ? sc.gTotA : sc.gTotB, hc = side === 'a' ? sc.hcpA : sc.hcpB, nt = side === 'a' ? sc.totA : sc.totB;
        set(`st_${m.id}_${side}`, g ?? ''); set(`sh_${m.id}_${side}`, hc ?? '–'); set(`snt_${m.id}_${side}`, nt ?? '');
        for (let i = 0; i < HOLES; i++) {
          const strokes = sc.hcpA != null && sc.higher === side && holeStrokes(sc.diff, rk[i]) > 0;
          cls(`sg_${m.id}_${side}_${i}`, 'stroke', strokes); set(`sd_${m.id}_${side}_${i}`, strokes ? '●' : '');
          const mine = sc.ready ? (side === 'a' ? sc.netA[i] : sc.netB[i]) : null, other = sc.ready ? (side === 'a' ? sc.netB[i] : sc.netA[i]) : null;
          set(`sn_${m.id}_${side}_${i}`, mine ?? ''); cls(`sn_${m.id}_${side}_${i}`, 'win', sc.ready && mine < other);
        }
      });
      set('spt_' + m.id, sc.ready ? `${pts(sc.pts[0])} – ${pts(sc.pts[1])}` : '–');
      set('ms_' + m.id, sc.ready ? `${pts(sc.pts[0])} – ${pts(sc.pts[1])}` : 'no result yet');
      continue;
    }
    const pc = pairCalc(L, c, w, m);
    for (const x of pc.pairs) {
      const p = x.pair; paired.add(p.pa); paired.add(p.pb);
      ['a', 'b'].forEach(side => {
        const pid = side === 'a' ? p.pa : p.pb;
        for (let i = 0; i < HOLES; i++) {
          const strokes = x.higher === side && holeStrokes(x.diff, rk[i]) > 0;
          cls(`g_${pid}_${i}`, 'stroke', strokes); set(`d_${pid}_${i}`, strokes ? '●' : '');
          const mine = x.ready ? (side === 'a' ? x.netA[i] : x.netB[i]) : null, other = x.ready ? (side === 'a' ? x.netB[i] : x.netA[i]) : null;
          set(`pn_${pid}_${i}`, mine ?? ''); cls(`pn_${pid}_${i}`, 'win', x.ready && mine < other);
        }
      });
      set('ppt_' + p.id, x.ready ? `${pts(x.pt[0])} – ${pts(x.pt[1])}` : '–');
    }
    if (pc.ready) {
      for (let i = 0; i < HOLES; i++) {
        set(`tpa_${m.id}_${i}`, pc.tSumA[i]); cls(`tpa_${m.id}_${i}`, 'win', pc.tSumA[i] < pc.tSumB[i]);
        set(`tpb_${m.id}_${i}`, pc.tSumB[i]); cls(`tpb_${m.id}_${i}`, 'win', pc.tSumB[i] < pc.tSumA[i]);
        set(`tph_${m.id}_${i}`, pc.tSumA[i] < pc.tSumB[i] ? initials(tname(L, m.a)) : pc.tSumB[i] < pc.tSumA[i] ? initials(tname(L, m.b)) : '–');
      }
      set('tpt_' + m.id, `${pts(pc.teamPt[0])} – ${pts(pc.teamPt[1])}`);
    } else { for (let i = 0; i < HOLES; i++) { set(`tpa_${m.id}_${i}`, ''); set(`tpb_${m.id}_${i}`, ''); set(`tph_${m.id}_${i}`, ''); } set('tpt_' + m.id, '–'); }
    const line = pc.ready || pc.pairs.some(x => x.ready) ? `${tname(L, m.a)} ${pts(pc.totA)} – ${pts(pc.totB)} ${tname(L, m.b)}` : 'no result yet';
    set('mt_' + m.id, line + (pc.pairs.some(x => x.ready) ? ' (of 3)' : '')); set('ms_' + m.id, line);
  }
  for (const p of L.players) {
    const r = c.res[w.id][p.id], b = c.hb[w.id][p.id];
    set('t_' + p.id, r ? r.g : ''); set('h_' + p.id, b ?? '–'); set('n_' + p.id, r ? r.n : '');
    if (paired.has(p.id)) continue;
    for (let i = 0; i < HOLES; i++) { cls(`g_${p.id}_${i}`, 'stroke', false); set(`d_${p.id}_${i}`, ''); set(`pn_${p.id}_${i}`, r ? r.h[i] - holeStrokes(b, rk[i]) : ''); }
  }
  for (const t of [...L.teams, { id: '' }]) { const e = $('tt_' + t.id); if (!e) continue; const ps = teamPlayers(L, t.id).map(p => c.res[w.id][p.id]).filter(Boolean); e.textContent = ps.length ? sg(sum(ps.map(r => r.n - r.par))) : '–'; }
}

function advance(el, v) { if (!(v.length === 2 || (v.length === 1 && +v >= 3))) return; const all = [...document.querySelectorAll('input.sc:not([disabled])')], i = all.indexOf(el); if (i >= 0 && all[i + 1]) { all[i + 1].focus(); all[i + 1].select(); } }

export const actions = {
  togglePairs(d) { const s = core.ui.pairEdit; s.has(d.matchup) ? s.delete(d.matchup) : s.add(d.matchup); rerender(true); },
  toggleForfeit(d) { const s = core.ui.forfeitEdit; s.has(d.matchup) ? s.delete(d.matchup) : s.add(d.matchup); rerender(true); },
  async saveForfeit(d) { const win = $('ff_win_' + d.matchup).value; if (!win) return showError('Choose the outcome first.'); core.ui.forfeitEdit.delete(d.matchup); if (await send({ type: 'setForfeit', weekId: core.ui.wk, matchupId: d.matchup, winner: win, reason: $('ff_why_' + d.matchup).value })) toast('Forfeit recorded'); },
  async clearForfeit(d) { if (!await confirmDialog({ title: 'Remove the forfeit?', text: 'The match goes back to being decided by scores.', ok: 'Remove forfeit' })) return; core.ui.forfeitEdit.delete(d.matchup); await send({ type: 'clearForfeit', weekId: core.ui.wk, matchupId: d.matchup }); },
};
export const changes = {
  pickWeek(d, el) { core.ui.wk = el.value; core.ui.match = null; core.ui.pairEdit = new Set(); core.ui.forfeitEdit = new Set(); rerender(true); },
  pickMatch(d, el) { core.ui.match = el.value; rerender(true); },
};
export const inputs = {
  score(d, el) { const v = el.value.replace(/\D/g, '').slice(0, 2); if (v !== el.value) el.value = v; if (v && (+v < 1 || +v > 15)) { el.setCustomValidity('1 to 15'); return; } el.setCustomValidity(''); send({ type: 'setScore', weekId: core.ui.wk, playerId: d.player, hole: +d.hole, value: v === '' ? '' : +v }, { update }); advance(el, v); },
  teamScore(d, el) { const v = el.value.replace(/\D/g, '').slice(0, 2); if (v !== el.value) el.value = v; if (v && (+v < 1 || +v > 15)) { el.setCustomValidity('1 to 15'); return; } el.setCustomValidity(''); send({ type: 'setTeamScore', weekId: core.ui.wk, matchupId: d.matchup, side: d.side, hole: +d.hole, value: v === '' ? '' : +v }, { update }); advance(el, v); },
};
