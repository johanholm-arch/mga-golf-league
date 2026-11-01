// League rules: handicaps, match scoring, standings, schedule and playoff maths.
// Pure functions only (no DOM, no network) so the same code runs in the browser,
// on the server and in the tests. `L` is a "league view": the active year's
// teams, players, weeks and playoffs plus the course (see view() in ops.js).

export const HOLES = 9;
export const DEF_PAR = [4, 4, 3, 5, 4, 4, 3, 4, 5];
export const DEF_SI = [1, 2, 3, 4, 5, 6, 7, 8, 9];
export const WTYPES = ['Regular', 'Alternate Shot', 'Scramble'];
export const TEAM_FMT = { Scramble: 4, 'Alternate Shot': 2 };
export const ROLES = ['player', 'captain', 'commissioner'];
export const MAX_HCP = 18;

export const sum = a => a.reduce((x, y) => x + y, 0);
export const roleOf = p => (p && p.role) || 'player';
export const personOf = p => p.person || p.id;
export const matches = w => w.matchups || [];
export const pairsOf = (w, mid) => (w.pairs || []).filter(p => p.m === mid);
export const isHole = v => v !== '' && v != null && !isNaN(v) && +v >= 1 && +v <= 15;
export const fullCard = a => Array.isArray(a) && a.length === HOLES && a.every(isHole);

/** A player's completed 9-hole card for a week, or null. */
export const done = (w, id) => { const h = (w.sc || {})[id]; return fullCard(h) ? h.map(Number) : null; };

export const sortedWeeks = L => [...L.weeks].sort((a, b) => a.date.localeCompare(b.date));
export const teamPlayers = (L, tid) => L.players.filter(p => (p.team || '') === (tid || ''));
export const team = (L, id) => L.teams.find(t => t.id === id) || null;
export const player = (L, id) => L.players.find(p => p.id === id) || null;
export const tname = (L, id) => (team(L, id) || { name: 'No team' }).name;
export const pname = (L, id) => (player(L, id) || { name: '?' }).name;

/** 9-hole handicap: 90% of the average differential over the last 5 rounds, 0..18. */
export const H = d0 => d0.length ? Math.min(MAX_HCP, Math.max(0, Math.round(sum(d0.slice(-5)) / Math.min(d0.length, 5) * .9))) : null;
export const clampHcp = v => Math.max(0, Math.min(MAX_HCP, Math.round(+v || 0)));
/** Handicap in play: computed if the player has rounds, otherwise their starting handicap. */
export const Hp = (d, p) => { const h = H(d); return h == null ? clampHcp(p.hcp0) : h; };
/** Strokes received on a hole, given the handicap difference and the hole's rank (1 = hardest of the 9). */
export const holeStrokes = (hcp, rank) => { if (hcp == null) return 0; const hh = Math.max(0, hcp); return Math.floor(hh / 9) + (rank <= (hh % 9) ? 1 : 0); };
/** Rank of each hole (1..9) by stroke index, lowest index = rank 1. Ties keep hole order. */
export const siRanks = course => { const idx = course.hcp.map((_, i) => i).sort((a, b) => course.hcp[a] - course.hcp[b] || a - b); const rk = Array(HOLES); idx.forEach((h, r) => rk[h] = r + 1); return rk; };

/** Per-week results, handicap in play before each week, current handicaps and differential history. */
export function calc(L) {
  const hist = {}, res = {}, hb = {};
  const poWeeks = new Set(Object.values((L.playoffs && L.playoffs.links) || {}).map(l => l.weekId));
  const par = sum(L.course.par);
  for (const w of sortedWeeks(L)) {
    res[w.id] = {}; hb[w.id] = {};
    for (const p of L.players) {
      const d = hist[p.id] || (hist[p.id] = []);
      const b = Hp(d, p); hb[w.id][p.id] = b;
      const h = done(w, p.id); if (!h) continue;
      const g = sum(h);
      res[w.id][p.id] = { g, hc: b, n: g - b, h, pr: L.course.par, par };
      if (!poWeeks.has(w.id)) d.push(g - par);
    }
  }
  const cur = {}; L.players.forEach(p => { cur[p.id] = Hp(hist[p.id] || [], p); });
  return { res, hb, cur, hist };
}

/** Team net vs par for a week with no matchups (sum over every player who posted). */
export const tnet = (L, c, w, t) => { const r = c.res[w.id], ps = L.players.filter(p => (p.team || '') === (t.id || '') && r[p.id]); return ps.length ? sum(ps.map(p => r[p.id].n - r[p.id].par)) : null; };

/** Regular-week matchup: two head-to-head pairs plus a Team Point on low-ball per hole. */
export function pairCalc(L, c, w, m) {
  const rk = siRanks(L.course), pairs = pairsOf(w, m.id).filter(p => p.pa && p.pb), res = [];
  pairs.forEach(p => {
    const hcpA = c.hb[w.id][p.pa], hcpB = c.hb[w.id][p.pb];
    if (hcpA == null || hcpB == null) { res.push({ pair: p, ready: false, diff: 0, higher: null }); return; }
    const diff = Math.abs(hcpA - hcpB), higher = hcpA > hcpB ? 'a' : hcpB > hcpA ? 'b' : null;
    const ra = c.res[w.id][p.pa], rb = c.res[w.id][p.pb];
    if (!ra || !rb) { res.push({ pair: p, ready: false, diff, higher }); return; }
    const netA = [], netB = []; let wa = 0, wb = 0;
    for (let i = 0; i < HOLES; i++) {
      const sA = higher === 'a' ? holeStrokes(diff, rk[i]) : 0, sB = higher === 'b' ? holeStrokes(diff, rk[i]) : 0;
      const na = ra.h[i] - sA, nb = rb.h[i] - sB; netA.push(na); netB.push(nb);
      if (na < nb) wa++; else if (nb < na) wb++;
    }
    const pt = wa > wb ? [1, 0] : wb > wa ? [0, 1] : [0.5, 0.5];
    res.push({ pair: p, ready: true, netA, netB, higher, diff, pt, holesA: wa, holesB: wb });
  });
  const ready = res.filter(x => x.ready);
  let teamPt = null; const tSumA = Array(HOLES).fill(0), tSumB = Array(HOLES).fill(0);
  if (ready.length) {
    let twa = 0, twb = 0;
    for (let i = 0; i < HOLES; i++) {
      tSumA[i] = Math.min(...ready.map(x => x.netA[i])); tSumB[i] = Math.min(...ready.map(x => x.netB[i]));
      if (tSumA[i] < tSumB[i]) twa++; else if (tSumB[i] < tSumA[i]) twb++;
    }
    teamPt = twa > twb ? [1, 0] : twb > twa ? [0, 1] : [0.5, 0.5];
  }
  const totA = sum(res.map(x => x.ready ? x.pt[0] : 0)) + (teamPt ? teamPt[0] : 0);
  const totB = sum(res.map(x => x.ready ? x.pt[1] : 0)) + (teamPt ? teamPt[1] : 0);
  return { pairs: res, tSumA, tSumB, teamPt, totA, totB, ready: ready.length > 0 };
}

/** Scramble / Alternate Shot matchup: one team score per side, strokes from combined handicaps. */
export function scrambleCalc(L, c, w, m) {
  const scrA = (m.scrA || []).filter(Boolean), scrB = (m.scrB || []).filter(Boolean), div = TEAM_FMT[w.type] || 4;
  let hcpA = null, hcpB = null, diff = null, higher = null;
  const hb = c.hb[w.id] || {};
  if (scrA.length === 2 && scrB.length === 2 && [...scrA, ...scrB].every(id => hb[id] != null)) {
    hcpA = Math.round((hb[scrA[0]] + hb[scrA[1]]) / div); hcpB = Math.round((hb[scrB[0]] + hb[scrB[1]]) / div);
    diff = Math.abs(hcpA - hcpB); higher = hcpA > hcpB ? 'a' : hcpB > hcpA ? 'b' : null;
  }
  const gA = m.scA || [], gB = m.scB || [];
  const doneA = fullCard(gA), doneB = fullCard(gB);
  const gTotA = doneA ? sum(gA.map(Number)) : null, gTotB = doneB ? sum(gB.map(Number)) : null;
  let netA = null, netB = null, totA = null, totB = null, pts = null;
  if (hcpA != null && doneA && doneB) {
    const rk = siRanks(L.course); netA = []; netB = [];
    for (let i = 0; i < HOLES; i++) {
      const sA = higher === 'a' ? holeStrokes(diff, rk[i]) : 0, sB = higher === 'b' ? holeStrokes(diff, rk[i]) : 0;
      netA.push(+gA[i] - sA); netB.push(+gB[i] - sB);
    }
    totA = sum(netA); totB = sum(netB); pts = totA < totB ? [3, 0] : totB < totA ? [0, 3] : [1.5, 1.5];
  }
  return { scrA, scrB, hcpA, hcpB, diff, higher, netA, netB, totA, totB, gTotA, gTotB, pts, ready: pts != null };
}

/** Points for a matchup, honouring forfeits. */
export function matchPoints(L, c, w, m) {
  if (m.forfeit) {
    const win = m.forfeit.winner;
    if (win === 'a') return { ready: true, a: 3, b: 0, forfeit: true };
    if (win === 'b') return { ready: true, a: 0, b: 3, forfeit: true };
    return { ready: true, a: 1.5, b: 1.5, forfeit: true };
  }
  if (TEAM_FMT[w.type]) { const sc = scrambleCalc(L, c, w, m); return { ready: sc.ready, a: sc.ready ? sc.pts[0] : null, b: sc.ready ? sc.pts[1] : null }; }
  const pc = pairCalc(L, c, w, m), ready = pc.pairs.some(x => x.ready);
  return { ready, a: ready ? pc.totA : null, b: ready ? pc.totB : null };
}

/** Season standings. Weeks without matchups rank every team by net score. */
export function standings(L, c) {
  const t = {}, W = sortedWeeks(L);
  L.teams.forEach(x => t[x.id] = { id: x.id, n: x.name, pts: 0, net: 0, gross: 0, grossSum: 0, rounds: 0, pw: 0, mw: 0, win: 0, last: null, scrGrossSum: 0, scrRounds: 0, altGrossSum: 0, altRounds: 0 });
  W.forEach((w, wi) => {
    const ms = matches(w);
    if (ms.length) {
      ms.forEach(m => {
        if (TEAM_FMT[w.type] && !m.forfeit) {
          const sc = scrambleCalc(L, c, w, m), gk = w.type === 'Scramble' ? 'scrGrossSum' : 'altGrossSum', rk2 = w.type === 'Scramble' ? 'scrRounds' : 'altRounds';
          [[m.a, sc.gTotA], [m.b, sc.gTotB]].forEach(([tid, g]) => { if (g == null) return; const rec = t[tid]; if (!rec) return; rec[gk] += g; rec[rk2]++; });
        }
        const mp = matchPoints(L, c, w, m); if (!mp.ready) return;
        [[m.a, mp.a, mp.b], [m.b, mp.b, mp.a]].forEach(([tid, pts, opp]) => { const rec = t[tid]; if (!rec) return; rec.pts += pts; rec.mw++; if (pts > opp) rec.win++; if (wi === W.length - 1) rec.last = pts; });
      });
    } else {
      const sc = L.teams.map(x => ({ id: x.id, net: tnet(L, c, w, x) })).filter(x => x.net !== null).sort((a, b) => a.net - b.net), N = sc.length;
      sc.forEach(s => { const f = sc.findIndex(o => o.net === s.net), k = sc.filter(o => o.net === s.net).length; let p = 0; for (let j = 0; j < k; j++) p += N - f - j; p /= k; const r = t[s.id]; r.pts += p; r.mw++; if (f === 0) r.win++; if (wi === W.length - 1) r.last = p; });
    }
    L.teams.forEach(x => {
      const rs = L.players.filter(p => p.team === x.id).map(p => c.res[w.id][p.id]).filter(Boolean);
      if (rs.length) { const rec = t[x.id]; rec.net += sum(rs.map(r => r.n - r.par)); rec.gross += sum(rs.map(r => r.g - r.par)); rec.grossSum += sum(rs.map(r => r.g)); rec.rounds += rs.length; rec.pw++; }
    });
  });
  return Object.values(t).sort((a, b) => b.pts - a.pts || a.net - b.net);
}

/** Playoff seeding order: match points, then net vs par (same tiebreak as standings). */
export const seedOrder = (L, c) => standings(L, c).map(r => ({ id: r.id, pts: r.pts, net: r.net }));

/** Round robin pairings (circle method). null stands for the bye slot. */
export function roundRobin(teamIds) {
  let teams = [...teamIds]; if (teams.length % 2) teams.push(null);
  const n = teams.length, half = n / 2, rounds = n - 1; let arr = teams.slice(); const schedule = [];
  for (let r = 0; r < rounds; r++) {
    const pairs = []; for (let i = 0; i < half; i++) pairs.push([arr[i], arr[n - 1 - i]]);
    schedule.push(pairs); const fixed = arr[0], rest = arr.slice(1); rest.unshift(rest.pop()); arr = [fixed, ...rest];
  }
  return schedule;
}

// ---------- Playoffs: single elimination for any number of teams ----------
export const MIN_PLAYOFF = 2, MAX_PLAYOFF = 16;
export function playoffSize(L) { const n = +(L.settings && L.settings.playoffSize) || 10; return Math.max(MIN_PLAYOFF, Math.min(MAX_PLAYOFF, n)); }

/** Bracket slots for P teams: round 1 is a play-in when the field is not a power of two. */
export function bracketSlots(P) {
  const B = 2 ** Math.ceil(Math.log2(Math.max(2, P)));
  let order = [1, 2]; while (order.length < B) { const n = order.length * 2 + 1, next = []; for (const s of order) next.push(s, n - s); order = next; }
  const rounds = []; let prev = null, r = 1;
  for (let size = B / 2; size >= 1; size /= 2, r++) {
    const slots = [];
    for (let i = 0; i < size; i++) {
      const id = `r${r}m${i}`;
      if (r === 1) { const a = order[2 * i], b = order[2 * i + 1]; slots.push({ id, round: r, a: { seed: a }, b: { seed: b }, bye: a > P || b > P }); }
      else slots.push({ id, round: r, a: { from: prev[2 * i].id }, b: { from: prev[2 * i + 1].id }, bye: false });
    }
    rounds.push(slots); prev = slots;
  }
  const hasByes = rounds[0].some(s => s.bye);
  const names = rounds.map((slots, i) => slots.length === 1 ? 'Championship' : slots.length === 2 ? 'Semi-finals' : slots.length === 4 ? 'Quarter-finals' : (i === 0 && hasByes) ? 'Play-in' : `Round of ${slots.length * 2}`);
  return { size: B, rounds, names };
}

export function normPO(p) { return { seeds: (p && p.seeds) || [], links: (p && p.links) || {}, overrides: (p && p.overrides) || {} }; }

/** Resolve the bracket: which teams are in each slot and who has won. */
export function computeBracket(L, c) {
  const po = normPO(L.playoffs), P = Math.min(playoffSize(L), po.seeds.length), br = bracketSlots(P);
  const winners = {}, teamsFor = {}, seedTeam = s => s <= P ? po.seeds[s - 1] || null : null;
  br.rounds.forEach(slots => slots.forEach(s => {
    const a = s.a.seed ? seedTeam(s.a.seed) : winners[s.a.from] || null;
    const b = s.b.seed ? seedTeam(s.b.seed) : winners[s.b.from] || null;
    teamsFor[s.id] = [a, b];
    if (s.round === 1 && s.bye) { winners[s.id] = a || b; return; }
    if (po.overrides[s.id]) { winners[s.id] = po.overrides[s.id]; return; }
    if (!a || !b) return;
    const link = po.links[s.id]; if (!link) return;
    const wk = L.weeks.find(x => x.id === link.weekId); if (!wk) return;
    const m = matches(wk).find(x => x.id === link.matchupId); if (!m) return;
    const mp = matchPoints(L, c, wk, m); if (!mp.ready) return;
    const flip = m.a !== a; const pa = flip ? mp.b : mp.a, pb = flip ? mp.a : mp.b;
    if (pa > pb) winners[s.id] = a; else if (pb > pa) winners[s.id] = b;
  }));
  const finalId = br.rounds[br.rounds.length - 1][0].id;
  return { bracket: br, winners, teamsFor, champion: winners[finalId] || null, P };
}

/** Serpentine draft of scramble groups balanced by handicap. */
export function buildGroups(L, c, size, uid) {
  const elig = L.players.filter(p => p.eoyScramble).sort((a, b) => (c.cur[a.id] ?? a.hcp0 ?? 0) - (c.cur[b.id] ?? b.hcp0 ?? 0));
  if (!elig.length) return [];
  const nGroups = Math.max(1, Math.ceil(elig.length / size)), groups = Array.from({ length: nGroups }, () => ({ id: uid(), tee: '', players: [] }));
  let idx = 0, round = 0;
  while (idx < elig.length) { const order = [...Array(nGroups).keys()]; if (round % 2) order.reverse(); for (const gi of order) { if (idx >= elig.length) break; groups[gi].players.push(elig[idx].id); idx++; } round++; }
  return groups;
}

// ---------- dates ----------
/** Today's date in the browser's/caller's local time zone as YYYY-MM-DD. */
export function localToday(d = new Date()) { return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`; }
export const isDate = s => typeof s === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(s) && !isNaN(new Date(s + 'T00:00:00'));
/** Add days to a YYYY-MM-DD string without time zone drift. */
export function addDays(s, n) { const [y, m, d] = s.split('-').map(Number); const dt = new Date(y, m - 1, d + n); return localToday(dt); }
export const to12h = (h, m) => { const ap = h >= 12 ? 'PM' : 'AM'; let hh = h % 12; if (hh === 0) hh = 12; return hh + ':' + String(m).padStart(2, '0') + ' ' + ap; };
export const teeMinutes = t => { const mm = String(t || '').trim().match(/^(\d{1,2}):(\d{2})\s*([AaPp][Mm])?/); if (!mm) return 9999; let h = +mm[1]; const mi = +mm[2], ap = (mm[3] || '').toUpperCase(); if (ap === 'PM' && h !== 12) h += 12; if (ap === 'AM' && h === 12) h = 0; return h * 60 + mi; };
