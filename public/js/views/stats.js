// Stats: questions, week summaries, hole difficulty, scoring mix, trends and the full team table.
import { core, render as rerender } from '../core.js';
import { TEAM_FMT, sortedWeeks, matches, standings, pairCalc, scrambleCalc, matchPoints, holeStrokes, siRanks, sum, tname, pname, player } from '../rules.js';
import { $, esc, attr, field, options, f1, sg, pts, fmtShort, fmtDate } from '../ui.js';

const rounds = () => { const L = core.L, c = core.c, R = []; sortedWeeks(L).forEach(w => Object.entries(c.res[w.id]).forEach(([id, r]) => R.push({ w, id, ...r }))); return R; };

export function render() {
  const L = core.L, c = core.c, R = rounds();
  let h = askBox();
  if (!R.length) return h + '<div class="card empty">More statistics appear once complete scorecards are entered.</div>';
  h += weekSummary(R);
  const hd = L.course.par.map((_, i) => sum(R.map(r => r.h[i] - r.pr[i])) / R.length), mx = Math.max(...hd), mn = Math.min(...hd);
  const rk = siRanks(L.course), nd = L.course.par.map((_, i) => sum(R.map(r => (r.h[i] - holeStrokes(r.hc, rk[i])) - r.pr[i])) / R.length), nmx = Math.max(...nd), nmn = Math.min(...nd);
  const bars = (vals, lo, hi) => vals.map((v, i) => `<tr><td>Hole ${i + 1}</td><td class="n">${v > 0 ? '+' : ''}${f1(v)}</td><td style="width:55%"><div class="bar-h"><i style="width:${hi === lo ? 50 : 8 + (v - lo) / (hi - lo) * 92}%"></i></div></td></tr>`).join('');
  h += `<div class="card"><h2>Hole difficulty</h2><p class="muted small">Average strokes over par. Longer bar means harder. Hardest: hole ${hd.indexOf(mx) + 1}. Easiest: hole ${hd.indexOf(mn) + 1}.</p><div class="scroll"><table>${bars(hd, mn, mx)}</table></div><details><summary>After handicap strokes</summary><div class="scroll"><table>${bars(nd, nmn, nmx)}</table></div></details></div>`;
  const all = R.flatMap(r => r.h.map((s, i) => s - r.pr[i])), mix = [['Eagle or better', x => x <= -2], ['Birdie', x => x === -1], ['Par', x => x === 0], ['Bogey', x => x === 1], ['Double bogey or worse', x => x >= 2]];
  h += `<div class="card"><h2>Scoring mix</h2><div class="scroll"><table>${mix.map(([n, f]) => { const k = all.filter(f).length, p = k / all.length * 100; return `<tr><td>${n}</td><td class="n">${k}</td><td class="n">${Math.round(p)}%</td><td style="width:45%"><div class="bar-h"><i style="width:${p}%"></i></div></td></tr>`; }).join('')}</table></div></div>`;
  const pl = {}; R.forEach(r => (pl[r.id] = pl[r.id] || []).push(r.g));
  h += `<div class="card"><h2>Player trends</h2><div class="scroll"><table><tr><th>Player</th><th class="n">Rounds</th><th class="n">Average</th><th class="n">Best</th><th class="n">Last</th><th>Trend</th></tr>${Object.entries(pl).sort((a, b) => pname(L, a[0]).localeCompare(pname(L, b[0]))).map(([id, g]) => { const a = sum(g) / g.length; let t = '–'; if (g.length >= 4) { const l = g.slice(-3), e = g.slice(0, -3), d = sum(l) / 3 - sum(e) / e.length; t = d < -.05 ? `▼ ${f1(-d)} better` : d > .05 ? `▲ ${f1(d)} worse` : 'steady'; } return `<tr><td>${esc(pname(L, id))}</td><td class="n">${g.length}</td><td class="n">${f1(a)}</td><td class="n">${Math.min(...g)}</td><td class="n">${g[g.length - 1]}</td><td>${t}</td></tr>`; }).join('')}</table></div><p class="muted small">Trend compares the last 3 rounds with the rounds before them.</p></div>`;
  h += `<div class="card"><h2>Week by week</h2><div class="scroll"><table><tr><th>Week</th><th class="n">Rounds</th><th class="n">Avg gross</th><th>Low gross</th><th>Low net</th></tr>${sortedWeeks(L).map(w => { const r = R.filter(x => x.w.id === w.id); if (!r.length) return ''; const lg = r.reduce((a, b) => b.g < a.g ? b : a), ln = r.reduce((a, b) => b.n < a.n ? b : a); return `<tr><td>${fmtShort(w.date)}</td><td class="n">${r.length}</td><td class="n">${f1(sum(r.map(x => x.g)) / r.length)}</td><td>${esc(pname(L, lg.id))} ${lg.g}</td><td>${esc(pname(L, ln.id))} ${ln.n}</td></tr>`; }).join('')}</table></div></div>`;
  const rows = standings(L, c);
  h += `<div class="card"><h2>Team statistics</h2><div class="scroll"><table><tr><th class="n">#</th><th>Team</th><th class="n">Points</th><th class="n">Avg pts/wk</th><th class="n">Net vs par</th><th class="n">Gross vs par</th><th class="n">Avg gross</th><th class="n">Avg scramble</th><th class="n">Avg alt shot</th></tr>${rows.map((r, i) => `<tr><td class="n">${i + 1}</td><td>${esc(r.n)}</td><td class="n"><b>${pts(r.pts)}</b></td><td class="n">${r.mw ? f1(r.pts / r.mw) : '–'}</td><td class="n">${r.rounds ? sg(r.net) : '–'}</td><td class="n">${r.rounds ? sg(r.gross) : '–'}</td><td class="n">${r.rounds ? f1(r.grossSum / r.rounds) : '–'}</td><td class="n">${r.scrRounds ? f1(r.scrGrossSum / r.scrRounds) : '–'}</td><td class="n">${r.altRounds ? f1(r.altGrossSum / r.altRounds) : '–'}</td></tr>`).join('')}</table></div><p class="muted small">Net and gross vs par add up every individual round the team's players have posted. Scramble and Alternate Shot averages are the team's combined gross score in that format.</p></div>`;
  return h;
}

function weekSummary(R) {
  const L = core.L, c = core.c, W = sortedWeeks(L).filter(w => R.some(r => r.w.id === w.id) || matches(w).some(m => scrambleCalc(L, c, w, m).ready)); if (!W.length) return '';
  if (!core.ui.statsWk || !W.find(w => w.id === core.ui.statsWk)) core.ui.statsWk = W[W.length - 1].id;
  const w = W.find(x => x.id === core.ui.statsWk), wr = R.filter(r => r.w.id === w.id);
  let h = `<div class="card"><h2>Week summary</h2><div class="row">${field('Week', `<select data-change="statsWeek">${options(W.map(x => ({ value: x.id, label: fmtDate(x.date) })), w.id)}</select>`)}</div>`;
  const bul = [];
  if (TEAM_FMT[w.type]) {
    const ms2 = matches(w).map(m => ({ m, sc: scrambleCalc(L, c, w, m) })).filter(x => x.sc.ready);
    if (!ms2.length) return h + `<p class="muted">No complete ${esc(w.type)} scores for this week.</p></div>`;
    const allTot = ms2.flatMap(({ m, sc }) => [{ t: m.a, v: sc.totA }, { t: m.b, v: sc.totB }]), low = allTot.reduce((a, b) => b.v < a.v ? b : a);
    bul.push(`Low team net: <b>${esc(tname(L, low.t))}</b> with ${low.v}.`);
  } else {
    if (!wr.length) return h + '<p class="muted">No complete scorecards for this week.</p></div>';
    const lg = wr.reduce((a, b) => b.g < a.g ? b : a), hg = wr.reduce((a, b) => b.g > a.g ? b : a), ln = wr.reduce((a, b) => b.n < a.n ? b : a);
    const avg = sum(wr.map(r => r.g)) / wr.length, prior = R.filter(r => r.w.date < w.date), priorAvg = prior.length ? sum(prior.map(r => r.g)) / prior.length : null;
    const diffs = wr.flatMap(r => r.h.map((s, i) => s - r.pr[i])), eagles = diffs.filter(d => d <= -2).length, birdies = diffs.filter(d => d === -1).length, aces = wr.flatMap(r => r.h.filter(s => s === 1)).length;
    let worst = null; wr.forEach(r => r.h.forEach((s, i) => { const d = s - r.pr[i]; if (!worst || d > worst.d) worst = { d, r, i, s }; }));
    bul.push(`Low gross: <b>${esc(pname(L, lg.id))}</b> shot ${lg.g} (${sg(lg.g - lg.par)}).`, `Low net: <b>${esc(pname(L, ln.id))}</b> with ${ln.n}.`, `Toughest round: <b>${esc(pname(L, hg.id))}</b> shot ${hg.g} (${sg(hg.g - hg.par)}).`);
    if (aces) bul.push(`${aces} hole-in-one${aces === 1 ? '' : 's'}! 🎉`);
    if (eagles) bul.push(`${eagles} eagle${eagles === 1 ? '' : 's'} or better.`);
    bul.push(`${birdies} birdie${birdies === 1 ? '' : 's'} made.`);
    if (worst) bul.push(`Blow-up hole: <b>${esc(pname(L, worst.r.id))}</b> took ${worst.s} on hole ${worst.i + 1} (${sg(worst.d)}).`);
    if (priorAvg != null) { const d = avg - priorAvg; bul.push(`The field averaged ${f1(avg)}, ${d < 0 ? f1(-d) + ' strokes better' : f1(d) + ' strokes worse'} than the ${f1(priorAvg)} season average coming in.`); }
  }
  h += `<ul class="tips">${bul.map(b => `<li>${b}</li>`).join('')}</ul>`;
  const rows = matches(w).map(m => summary(w, m)).filter(Boolean);
  if (rows.length) h += `<h3>Match by match</h3><div class="scroll"><table><tr><th>Matchup</th><th class="n">Score</th><th>Winner</th><th>Turning point</th><th>Standout</th></tr>${rows.map(s => `<tr><td>${esc(tname(L, s.m.a))} vs ${esc(tname(L, s.m.b))}</td><td class="n">${pts(s.mp.a)} – ${pts(s.mp.b)}</td><td>${s.winner ? esc(tname(L, s.winner)) : 'Tied'}</td><td>${s.forfeit ? `Forfeit${s.reason ? ': ' + esc(s.reason) : ''}` : s.winner ? (s.wireToWire ? `Led from the first hole` : `Hole ${s.turn}`) : '–'}</td><td>${s.standout ? esc(s.standout.name) + ' (' + s.standout.net + ' net)' : '–'}</td></tr>`).join('')}</table></div><p class="muted small">Turning point is the hole after which the winner never trailed again. Standout is the lowest net score in the matchup.</p>`;
  return h + '</div>';
}
function summary(w, m) {
  const L = core.L, c = core.c, mp = matchPoints(L, c, w, m); if (!mp.ready) return null;
  const winner = mp.a > mp.b ? m.a : mp.b > mp.a ? m.b : null;
  if (mp.forfeit) return { m, mp, winner, forfeit: true, reason: m.forfeit && m.forfeit.reason };
  let adv = null, standout = null;
  if (TEAM_FMT[w.type]) { const sc = scrambleCalc(L, c, w, m); if (sc.ready) adv = sc.netA.map((v, i) => sc.netB[i] - v); }
  else { const pc = pairCalc(L, c, w, m); if (pc.ready) adv = pc.tSumB.map((v, i) => v - pc.tSumA[i]); let best = null; pc.pairs.forEach(x => [x.pair.pa, x.pair.pb].forEach(pid => { const r = c.res[w.id][pid]; if (r && (!best || r.n < best.r.n)) best = { pid, r }; })); if (best) standout = { name: pname(L, best.pid), net: best.r.n }; }
  let turn = null, wireToWire = false;
  if (adv && winner) { const want = winner === m.a ? 1 : -1; let cum = 0, lastAgainst = -1; adv.forEach((d, i) => { cum += d; const s = Math.sign(cum); if (s !== 0 && s !== want) lastAgainst = i; }); wireToWire = lastAgainst === -1; turn = Math.min(9, lastAgainst + 2); }
  return { m, mp, winner, turn, wireToWire, standout };
}

// ---------- Ask a question ----------
function examples() { const L = core.L, ex = ['Who has the lowest handicap?', 'Show the standings', 'Which hole is hardest?', 'What is the scoring mix?', 'Top 5 net scores this season', 'What is the average gross score?']; if (L.players[0]) ex.push(`What is ${L.players[0].name}'s handicap?`); if (L.teams[1]) ex.push(`How did ${L.teams[0].name} do against ${L.teams[1].name}?`); return ex; }
function askBox() { return `<div class="card"><h2>Ask a question</h2><div class="row">${field('Question', '<input id="nlqQ" class="w" style="min-width:16em" placeholder="e.g. who has the lowest handicap?" data-enter="ask">')}<button class="btn primary" data-act="ask">Ask</button></div><div class="row">${examples().map(e => `<button class="btn small" data-act="askEx" data-q="${attr(e)}">${esc(e)}</button>`).join('')}</div><div id="nlqOut"></div></div>`; }
function answer(q) {
  const L = core.L, c = core.c, ql = q.toLowerCase(), R = rounds();
  const teams = L.teams.filter(t => ql.includes(t.name.toLowerCase())).sort((a, b) => b.name.length - a.name.length);
  let pl = null; L.players.forEach(p => { const n = p.name.toLowerCase(); if (n.length >= 2 && ql.includes(n) && (!pl || n.length > pl.name.length)) pl = p; });
  if (!pl) L.players.forEach(p => { const f = p.name.toLowerCase().split(' ')[0]; if (f.length >= 3 && new RegExp('\\b' + f + '\\b').test(ql) && !pl) pl = p; });
  const table = (cols, rows, align) => `<div class="scroll"><table><tr>${cols.map((x, i) => `<th${align && align[i] ? ' class="n"' : ''}>${esc(x)}</th>`).join('')}</tr>${rows.map(r => `<tr>${r.map((v, i) => `<td${align && align[i] ? ' class="n"' : ''}>${esc(String(v))}</td>`).join('')}</tr>`).join('')}</table></div>`;
  const stat = (label, value, sub) => `<div class="stat"><span class="muted small">${esc(label)}</span><b>${esc(String(value))}</b><span class="muted small">${esc(sub || '')}</span></div>`;
  const nnum = () => { const m = ql.match(/\d+/); return m ? Math.max(1, Math.min(20, +m[0])) : 5; };
  if (/standing|leaderboard|who.*(winning|leading)/.test(ql) && !pl) { const rows = standings(L, c); return rows.length ? { text: 'Current standings.', viz: table(['Team', 'Points', 'Record'], rows.map(r => [r.n, pts(r.pts), r.mw ? `${r.win}–${r.mw - r.win}` : '–']), [0, 1, 1]) } : null; }
  if (/hardest|toughest|easiest/.test(ql) && /hole/.test(ql) && R.length) { const hd = L.course.par.map((_, i) => sum(R.map(r => r.h[i] - r.pr[i])) / R.length), hard = /hard|tough/.test(ql), idx = hard ? hd.indexOf(Math.max(...hd)) : hd.indexOf(Math.min(...hd)); return { text: `Hole ${idx + 1} is the ${hard ? 'hardest' : 'easiest'}, averaging ${sg(+f1(hd[idx]))} against par.`, viz: table(['Hole', 'Avg vs par'], hd.map((v, i) => [`Hole ${i + 1}`, (v > 0 ? '+' : '') + f1(v)]), [0, 1]) }; }
  if (/(top|best|lowest).*net|net.*(top|best|lowest)/.test(ql) && R.length) { const n = nnum(), s = [...R].sort((a, b) => a.n - b.n).slice(0, n); return { text: `Top ${s.length} net scores this season.`, viz: table(['Player', 'Week', 'Net'], s.map(r => [pname(L, r.id), fmtShort(r.w.date), r.n]), [0, 0, 1]) }; }
  if (/(top|best|lowest).*gross|gross.*(top|best|lowest)/.test(ql) && R.length) { const n = nnum(), s = [...R].sort((a, b) => a.g - b.g).slice(0, n); return { text: `Top ${s.length} gross scores this season.`, viz: table(['Player', 'Week', 'Gross'], s.map(r => [pname(L, r.id), fmtShort(r.w.date), r.g]), [0, 0, 1]) }; }
  if (pl && /handicap/.test(ql)) { const h = c.cur[pl.id]; return { text: `${pl.name}'s handicap is ${h ?? 'not set yet'}.`, viz: stat(pl.name, h ?? '–', '9-hole handicap') }; }
  if (/(lowest|highest|best|worst).*handicap/.test(ql)) { let ps = L.players.slice(); if (teams.length) ps = ps.filter(p => p.team === teams[0].id); ps = ps.filter(p => c.cur[p.id] != null).sort((a, b) => c.cur[a.id] - c.cur[b.id]); if (/highest|worst/.test(ql)) ps.reverse(); if (!ps.length) return null; return { text: `${/highest|worst/.test(ql) ? 'Highest' : 'Lowest'} handicap${teams.length ? ' on ' + teams[0].name : ''}: ${ps[0].name} at ${c.cur[ps[0].id]}.`, viz: table(['Player', 'Team', 'Handicap'], ps.slice(0, 8).map(p => [p.name, tname(L, p.team), c.cur[p.id]]), [0, 0, 1]) }; }
  if (!pl && !teams.length && /(average|avg)/.test(ql) && /net/.test(ql) && R.length) { const a = sum(R.map(r => r.n)) / R.length; return { text: `League-wide average net score is ${f1(a)} across ${R.length} rounds.`, viz: stat('Average net', f1(a), R.length + ' rounds') }; }
  if (!pl && !teams.length && /(average|avg)/.test(ql) && /(gross|score)/.test(ql) && R.length) { const a = sum(R.map(r => r.g)) / R.length; return { text: `League-wide average gross score is ${f1(a)} across ${R.length} rounds.`, viz: stat('Average gross', f1(a), R.length + ' rounds') }; }
  if (pl && /(birdie|eagle)/.test(ql)) { const rs = R.filter(r => r.id === pl.id), d = rs.flatMap(r => r.h.map((s, i) => s - r.pr[i])), eagle = /eagle/.test(ql), n = eagle ? d.filter(x => x <= -2).length : d.filter(x => x === -1).length; return { text: `${pl.name} has made ${n} ${eagle ? 'eagle' : 'birdie'}${n === 1 ? '' : 's'} this season.`, viz: stat(pl.name, n, eagle ? 'Eagles or better' : 'Birdies') }; }
  if (pl && /(trend|improv|getting)/.test(ql)) { const d = c.hist[pl.id] || []; if (d.length < 2) return { text: `Not enough rounds yet to show a trend for ${pl.name}.` }; const last = d.slice(-5), dir = last[last.length - 1] < last[0] ? 'improving' : last[last.length - 1] > last[0] ? 'trending higher' : 'holding steady'; return { text: `${pl.name} is ${dir}. Last ${last.length} rounds against par: ${last.map(sg).join(', ')}.` }; }
  if (pl && /net/.test(ql)) { const rs = R.filter(r => r.id === pl.id); if (!rs.length) return { text: `${pl.name} hasn't posted a complete round yet.` }; const a = sum(rs.map(r => r.n)) / rs.length; return { text: `${pl.name} averages ${f1(a)} net over ${rs.length} round${rs.length === 1 ? '' : 's'}.`, viz: stat(pl.name, f1(a), rs.length + ' rounds') }; }
  if (pl && /(gross|score|average|avg)/.test(ql)) { const rs = R.filter(r => r.id === pl.id); if (!rs.length) return { text: `${pl.name} hasn't posted a complete round yet.` }; const a = sum(rs.map(r => r.g)) / rs.length; return { text: `${pl.name} averages ${f1(a)} gross over ${rs.length} round${rs.length === 1 ? '' : 's'}.`, viz: stat(pl.name, f1(a), rs.length + ' rounds') }; }
  if (teams.length >= 2) { const [ta, tb] = teams, res = []; sortedWeeks(L).forEach(w => matches(w).forEach(m => { if ((m.a === ta.id && m.b === tb.id) || (m.a === tb.id && m.b === ta.id)) { const mp = matchPoints(L, c, w, m); if (mp.ready) res.push({ w, a: m.a === ta.id ? mp.a : mp.b, b: m.a === ta.id ? mp.b : mp.a }); } })); if (!res.length) return { text: `${ta.name} and ${tb.name} haven't played each other yet (or the scores aren't complete).` }; const sA = sum(res.map(r => r.a)), sB = sum(res.map(r => r.b)); return { text: `${ta.name} vs ${tb.name}: ${pts(sA)} – ${pts(sB)} over ${res.length} week${res.length === 1 ? '' : 's'}.`, viz: table(['Week', ta.name, tb.name], res.map(r => [fmtShort(r.w.date), pts(r.a), pts(r.b)]), [0, 1, 1]) }; }
  if (teams.length && !pl && /(average|avg|gross|score)/.test(ql)) { const t = teams[0], rs = R.filter(r => (player(L, r.id) || {}).team === t.id); if (!rs.length) return { text: `No complete rounds yet for ${t.name}.` }; const a = sum(rs.map(r => r.g)) / rs.length; return { text: `${t.name} averages ${f1(a)} gross across ${rs.length} rounds.`, viz: stat(t.name, f1(a), rs.length + ' rounds') }; }
  if (/scoring mix|birdie.*bogey|distribution/.test(ql) && R.length) { const all = R.flatMap(r => r.h.map((s, i) => s - r.pr[i])), mix = [['Eagle+', x => x <= -2], ['Birdie', x => x === -1], ['Par', x => x === 0], ['Bogey', x => x === 1], ['Double+', x => x >= 2]]; return { text: `Scoring mix across ${all.length} holes played this season.`, viz: table(['Result', 'Share'], mix.map(([n, f]) => [n, Math.round(all.filter(f).length / all.length * 100) + '%']), [0, 1]) }; }
  return null;
}
function ask(q) { const out = $('nlqOut'); if (!q) { out.innerHTML = ''; return; } const a = answer(q); out.innerHTML = a ? `<p class="lead" style="margin-top:12px">${esc(a.text)}</p>${a.viz || ''}` : '<p class="muted" style="margin-top:12px">Not sure how to answer that. Try one of the example questions, or ask about a player\'s handicap, the standings, the hardest hole, or two teams against each other.</p>'; }

export const actions = { ask() { ask($('nlqQ').value.trim()); }, askEx(d) { $('nlqQ').value = d.q; ask(d.q); } };
export const changes = { statsWeek(d, el) { core.ui.statsWk = el.value; rerender(true); } };
