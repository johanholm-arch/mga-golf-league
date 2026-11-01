// The league's scoring rules. A change that shifts a handicap or a match point by accident fails here.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { H, Hp, holeStrokes, siRanks, calc, pairCalc, scrambleCalc, matchPoints, standings, roundRobin, bracketSlots, computeBracket, buildGroups, addDays, localToday, teeMinutes } from '../public/js/rules.js';
import { emptyState, emptyYear, view, setUid } from '../public/js/ops.js';

let n = 0; setUid(() => 'id' + (++n));

function league() {
  const st = emptyState(); const y = emptyYear('2026'); st.years.push(y); st.activeYearId = y.id;
  st.course = { par: [4, 4, 3, 5, 4, 4, 3, 4, 5], hcp: [3, 7, 17, 1, 9, 5, 15, 11, 13] };
  y.teams.push({ id: 'A', name: 'Eagles' }, { id: 'B', name: 'Hackers' });
  const pl = (id, team, hcp0, role = 'player') => y.players.push({ id, person: id, name: id, team, email: '', phone: '', hcp0, role });
  pl('a1', 'A', 5, 'commissioner'); pl('a2', 'A', 10); pl('b1', 'B', 8); pl('b2', 'B', 3);
  return { st, y };
}
const PAR = [4, 4, 3, 5, 4, 4, 3, 4, 5];

test('handicap is 90% of the last-5 average differential, rounded, 0..18', () => {
  assert.equal(H([]), null);
  assert.equal(H([10]), 9);
  assert.equal(H([10, 10, 10, 10, 10, 20]), Math.round((10 * 4 + 20) / 5 * .9)); // only the last 5 count
  assert.equal(H([-5, -5]), 0);
  assert.equal(H([40, 40]), 18);
  assert.equal(Hp([], { hcp0: 7 }), 7);
  assert.equal(Hp([], { hcp0: 30 }), 18);
});

test('strokes go to the hardest holes first, one extra lap for every 9', () => {
  assert.equal(holeStrokes(0, 1), 0);
  assert.equal(holeStrokes(3, 1), 1); assert.equal(holeStrokes(3, 3), 1); assert.equal(holeStrokes(3, 4), 0);
  assert.equal(holeStrokes(9, 9), 1);
  assert.equal(holeStrokes(11, 1), 2); assert.equal(holeStrokes(11, 3), 1);
  assert.deepEqual(siRanks({ hcp: [3, 7, 17, 1, 9, 5, 15, 11, 13] }), [2, 4, 9, 1, 5, 3, 8, 6, 7]);
});

test('regular week: pair points, team point and totals', () => {
  const { st, y } = league();
  const w = { id: 'w1', date: '2026-05-06', type: 'Regular', sc: {}, matchups: [{ id: 'm1', a: 'A', b: 'B', tee: '' }], pairs: [{ id: 'p1', m: 'm1', slot: 0, pa: 'a1', pb: 'b1' }, { id: 'p2', m: 'm1', slot: 1, pa: 'a2', pb: 'b2' }] };
  y.weeks.push(w);
  w.sc.a1 = [4, 4, 3, 5, 4, 4, 3, 4, 5];           // even par, hcp 5
  w.sc.b1 = [5, 5, 4, 6, 5, 5, 4, 5, 6];           // +9 gross, hcp 8: gets 3 strokes on ranks 1..3 (holes 4, 1, 6)
  w.sc.a2 = [6, 6, 5, 7, 6, 6, 5, 6, 7];           // hcp 10
  w.sc.b2 = [4, 4, 3, 5, 4, 4, 3, 4, 5];           // hcp 3, a2 gets 7 strokes
  const L = view(st), c = calc(L), pc = pairCalc(L, c, w, w.matchups[0]);
  assert.equal(pc.pairs[0].higher, 'b'); assert.equal(pc.pairs[0].diff, 3);
  assert.deepEqual(pc.pairs[0].netB, [4, 5, 4, 5, 5, 4, 4, 5, 6]);
  assert.deepEqual(pc.pairs[0].pt, [1, 0]);           // a1 wins 6 holes to 0
  assert.deepEqual(pc.pairs[1].pt, [0, 1]);           // b2 wins
  assert.deepEqual(pc.teamPt, [0.5, 0.5]);           // low-ball: a1 and b2 are both level par net, every hole ties
  assert.equal(pc.totA, 1.5); assert.equal(pc.totB, 1.5);
  const mp = matchPoints(L, c, w, w.matchups[0]); assert.equal(mp.ready, true); assert.equal(mp.a + mp.b, 3);
});

test('incomplete cards do not count and a pair with one card is not ready', () => {
  const { st, y } = league();
  const w = { id: 'w1', date: '2026-05-06', type: 'Regular', sc: { a1: [4, 4, 3, 5, 4, 4, 3, 4, ''] }, matchups: [{ id: 'm1', a: 'A', b: 'B', tee: '' }], pairs: [{ id: 'p1', m: 'm1', slot: 0, pa: 'a1', pb: 'b1' }] };
  y.weeks.push(w);
  const L = view(st), c = calc(L);
  assert.equal(c.res.w1.a1, undefined);
  assert.equal(pairCalc(L, c, w, w.matchups[0]).ready, false);
  assert.equal(matchPoints(L, c, w, w.matchups[0]).ready, false);
});

test('forfeits award 3-0, 0-3 or 1.5-1.5', () => {
  const { st, y } = league(); const L = view(st), c = calc(L);
  const w = { id: 'w', date: '2026-05-06', type: 'Regular', sc: {}, matchups: [], pairs: [] };
  assert.deepEqual(matchPoints(L, c, w, { forfeit: { winner: 'a' } }), { ready: true, a: 3, b: 0, forfeit: true });
  assert.deepEqual(matchPoints(L, c, w, { forfeit: { winner: 'b' } }), { ready: true, a: 0, b: 3, forfeit: true });
  assert.deepEqual(matchPoints(L, c, w, { forfeit: { winner: 'tie' } }), { ready: true, a: 1.5, b: 1.5, forfeit: true });
});

test('scramble: combined handicap over 4 (alternate shot over 2), 3 points to the lower net', () => {
  const { st, y } = league();
  const m = { id: 'm1', a: 'A', b: 'B', tee: '', scrA: ['a1', 'a2'], scrB: ['b1', 'b2'], scA: [4, 4, 3, 5, 4, 4, 3, 4, 5], scB: [4, 4, 3, 5, 4, 4, 3, 4, 5] };
  const w = { id: 'w1', date: '2026-05-06', type: 'Scramble', sc: {}, matchups: [m], pairs: [] };
  y.weeks.push(w);
  let L = view(st), c = calc(L), sc = scrambleCalc(L, c, w, m);
  assert.equal(sc.hcpA, Math.round(15 / 4)); assert.equal(sc.hcpB, Math.round(11 / 4));
  assert.equal(sc.higher, 'a'); assert.deepEqual(sc.pts, [3, 0]);   // equal gross, A gets a stroke
  w.type = 'Alternate Shot'; L = view(st); c = calc(L); sc = scrambleCalc(L, c, w, m);
  assert.equal(sc.hcpA, Math.round(15 / 2)); assert.equal(sc.hcpB, Math.round(11 / 2));
  // Scramble scores never feed individual handicaps
  assert.deepEqual(c.hist.a1, []);
});

test('standings: points then net; weeks without matchups rank by team net', () => {
  const { st, y } = league();
  const w = { id: 'w1', date: '2026-05-06', type: 'Regular', sc: { a1: PAR, a2: PAR, b1: PAR.map(p => p + 1), b2: PAR.map(p => p + 1) }, matchups: [], pairs: [] };
  y.weeks.push(w);
  const L = view(st), rows = standings(L, calc(L));
  assert.equal(rows[0].n, 'Eagles'); assert.equal(rows[0].pts, 2); assert.equal(rows[1].pts, 1);
  assert.equal(rows[0].win, 1); assert.equal(rows[1].win, 0);
});

test('round robin: every team plays every other exactly once, odd counts get one bye each', () => {
  const ids = ['t1', 't2', 't3', 't4', 't5'];
  const rr = roundRobin(ids); assert.equal(rr.length, 5);
  const seen = new Set(), byes = {};
  rr.forEach(round => round.forEach(([a, b]) => { if (!a || !b) { byes[a || b] = (byes[a || b] || 0) + 1; return; } const k = [a, b].sort().join('-'); assert.ok(!seen.has(k), 'repeat ' + k); seen.add(k); }));
  assert.equal(seen.size, 10); ids.forEach(id => assert.equal(byes[id], 1));
});

test('bracket: 10 teams gives two play-ins and the classic 1 v 8/9, 4 v 5, 3 v 6, 2 v 7/10', () => {
  const br = bracketSlots(10);
  assert.equal(br.size, 16); assert.deepEqual(br.names, ['Play-in', 'Quarter-finals', 'Semi-finals', 'Championship']);
  const r1 = br.rounds[0].filter(s => !s.bye).map(s => [s.a.seed, s.b.seed]);
  assert.deepEqual(r1, [[8, 9], [7, 10]]);
  assert.equal(br.rounds[0].filter(s => s.bye).length, 6);
  const br8 = bracketSlots(8); assert.deepEqual(br8.names, ['Quarter-finals', 'Semi-finals', 'Championship']);
  assert.deepEqual(br8.rounds[0].map(s => [s.a.seed, s.b.seed]), [[1, 8], [4, 5], [2, 7], [3, 6]]);
  assert.deepEqual(bracketSlots(2).names, ['Championship']);
  assert.deepEqual(bracketSlots(12).names, ['Play-in', 'Quarter-finals', 'Semi-finals', 'Championship']);
});

test('computeBracket: byes advance, linked results decide, overrides win, champion emerges', () => {
  const st = emptyState(); const y = emptyYear('2026'); st.years.push(y); st.activeYearId = y.id;
  for (let i = 1; i <= 4; i++) { y.teams.push({ id: 't' + i, name: 'T' + i }); y.players.push({ id: 'p' + i, person: 'p' + i, name: 'P' + i, team: 't' + i, email: '', phone: '', hcp0: 0, role: i === 1 ? 'commissioner' : 'player' }); }
  st.settings.playoffSize = 3; y.playoffs.seeds = ['t1', 't2', 't3'];
  const w = { id: 'w1', date: '2026-08-01', type: 'Regular', sc: {}, matchups: [{ id: 'm1', a: 't3', b: 't2', forfeit: { winner: 'a', reason: '' } }], pairs: [] };
  y.weeks.push(w);
  y.playoffs.links = { r1m1: { weekId: 'w1', matchupId: 'm1' } };   // seeds 2 v 3, flipped sides in the matchup
  let L = view(st), b = computeBracket(L, calc(L));
  assert.equal(b.winners.r1m0, 't1');          // seed 1 has a bye
  assert.equal(b.winners.r1m1, 't3');          // t3 won by forfeit even though it is listed second in the slot
  assert.deepEqual(b.teamsFor.r2m0, ['t1', 't3']); assert.equal(b.champion, null);
  y.playoffs.overrides = { r2m0: 't3' }; L = view(st); b = computeBracket(L, calc(L));
  assert.equal(b.champion, 't3');
});

test('scramble groups: serpentine by handicap, group size honoured', () => {
  const { st, y } = league(); y.players.forEach(p => p.eoyScramble = true);
  y.players.push({ id: 'c1', person: 'c1', name: 'c1', team: 'A', email: '', phone: '', hcp0: 12, role: 'player', eoyScramble: true });
  let k = 0; const groups = buildGroups(view(st), calc(view(st)), 2, () => 'g' + (++k));
  assert.equal(groups.length, 3);
  assert.deepEqual(groups.map(g => g.players), [['b2'], ['a1', 'c1'], ['b1', 'a2']]);   // handicaps 3,5,8,10,12 dealt 1-2-3 then 3-2
});

test('dates: local today and add days never drift across time zones or DST', () => {
  assert.match(localToday(), /^\d{4}-\d{2}-\d{2}$/);
  assert.equal(localToday(new Date(2026, 4, 6, 23, 30)), '2026-05-06');
  assert.equal(addDays('2026-03-04', 7), '2026-03-11');   // across the US DST change
  assert.equal(addDays('2026-12-28', 7), '2027-01-04');
  assert.equal(teeMinutes('4:30 PM'), 990); assert.equal(teeMinutes('12:05 am'), 5); assert.equal(teeMinutes('later'), 9999);
});
