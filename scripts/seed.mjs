// Builds a realistic sample league through the public API: 10 teams, 40 players, a generated
// schedule, 4 weeks of scores (one Scramble). Used by `SEED=1 npm run dev` and by the screenshot script.
const call = async (handler, method, route, body, token) => {
  const req = new Request('http://x/api/' + route, { method, headers: { 'content-type': 'application/json', ...(token ? { authorization: 'Bearer ' + token } : {}) }, body: body ? JSON.stringify(body) : undefined });
  const res = await handler(req, { ip: '127.0.0.1' }); const out = await res.json();
  if (!res.ok) throw new Error(route + ': ' + out.error); return out;
};
let seedRand = 7; const rnd = () => { seedRand = (seedRand * 1103515245 + 12345) & 0x7fffffff; return seedRand / 0x7fffffff; };

export async function seedLeague(handler) {
  const op = (K, o) => call(handler, 'POST', 'op', { op: o }, K);
  const b = await call(handler, 'POST', 'bootstrap', { name: 'Jim Allen', team: 'Eagles', year: '2026', pin: '1234', code: process.env.SETUP_CODE, leagueName: 'Monday Night Golf League' });
  const K = b.token;
  await call(handler, 'POST', 'joincode', { code: 'DEMO' }, K);
  await op(K, { type: 'setCourse', par: [4, 4, 3, 5, 4, 4, 3, 4, 5], hcp: [3, 7, 17, 1, 9, 5, 15, 11, 13] });
  const teamNames = ['Hackers', 'Mulligans', 'Sandbaggers', 'Birdie Boys', 'Fore Play', 'Bogey Men', 'Par-Tee', 'Slice Kings', 'Duffers'];
  for (const n of teamNames) await op(K, { type: 'addTeam', name: n });
  let st = (await call(handler, 'GET', 'state', null, K)).state, Y = st.years[0];
  const first = ['Bob', 'Dave', 'Rick', 'Tom', 'Bill', 'Gary', 'Mike', 'Steve', 'Ron', 'Don', 'Ken', 'Larry', 'Jerry', 'Ed', 'Al', 'Frank', 'Pete', 'Carl', 'Hank', 'Walt', 'Ray', 'Lou', 'Joe', 'Hal', 'Sam', 'Art', 'Max', 'Ted', 'Phil', 'Gus', 'Vic', 'Roy', 'Ned', 'Ben', 'Cal', 'Doug', 'Earl', 'Fred', 'Glen'];
  const last = ['Baker', 'Carter', 'Dunn', 'Evans', 'Foster', 'Grant', 'Hayes', 'Irwin', 'Jones', 'Kemp', 'Lane', 'Mason', 'Nash', 'Owens', 'Price', 'Quinn', 'Reed', 'Stone', 'Tate', 'Usher'];
  let fi = 0;
  for (const t of Y.teams) { const need = t.name === 'Eagles' ? 3 : 4; for (let i = 0; i < need; i++) { const n = first[fi] + ' ' + last[(fi * 7) % last.length]; fi++; await op(K, { type: 'addPlayer', name: n, team: t.id, hcp0: 2 + Math.floor(rnd() * 12) }); } }
  st = (await call(handler, 'GET', 'state', null, K)).state; Y = st.years[0];
  for (const t of Y.teams) { const cap = Y.players.find(p => p.team === t.id && p.role !== 'commissioner'); await op(K, { type: 'editPlayer', playerId: cap.id, fields: { role: 'captain' } }); }
  await op(K, { type: 'generateSchedule', startDate: '2026-05-04', weekType: 'Regular' });
  st = (await call(handler, 'GET', 'state', null, K)).state; Y = st.years[0];
  const weeks = [...Y.weeks].sort((a, b) => a.date.localeCompare(b.date));
  await op(K, { type: 'setWeekType', weekId: weeks[2].id, weekType: 'Scramble' });
  for (let wi = 0; wi < 4; wi++) {
    const w = weeks[wi];
    for (const m of w.matchups) {
      const pa = Y.players.filter(p => p.team === m.a), pb = Y.players.filter(p => p.team === m.b);
      if (wi === 2) {
        await op(K, { type: 'setScrPlayer', weekId: w.id, matchupId: m.id, side: 'a', idx: 0, playerId: pa[0].id }); await op(K, { type: 'setScrPlayer', weekId: w.id, matchupId: m.id, side: 'a', idx: 1, playerId: pa[1].id });
        await op(K, { type: 'setScrPlayer', weekId: w.id, matchupId: m.id, side: 'b', idx: 0, playerId: pb[0].id }); await op(K, { type: 'setScrPlayer', weekId: w.id, matchupId: m.id, side: 'b', idx: 1, playerId: pb[1].id });
        for (let h = 0; h < 9; h++) { await op(K, { type: 'setTeamScore', weekId: w.id, matchupId: m.id, side: 'a', hole: h, value: st.course.par[h] + (rnd() < .35 ? -1 : 0) }); await op(K, { type: 'setTeamScore', weekId: w.id, matchupId: m.id, side: 'b', hole: h, value: st.course.par[h] + (rnd() < .35 ? -1 : 0) }); }
        continue;
      }
      for (let s = 0; s < 2; s++) { if (pa[s]) await op(K, { type: 'setPair', weekId: w.id, matchupId: m.id, slot: s, side: 'pa', playerId: pa[s].id }); if (pb[s]) await op(K, { type: 'setPair', weekId: w.id, matchupId: m.id, slot: s, side: 'pb', playerId: pb[s].id }); }
      for (const p of [...pa, ...pb]) { if (wi === 3 && rnd() < .3) continue; for (let h = 0; h < 9; h++) await op(K, { type: 'setScore', weekId: w.id, playerId: p.id, hole: h, value: st.course.par[h] + Math.floor(rnd() * 3) + (rnd() < .12 ? -1 : 0) }); }
    }
  }
  for (const p of Y.players) if (rnd() < .6) await op(K, { type: 'setRsvp', playerId: p.id, key: 'eoyScramble', value: true });
  return { token: K, state: (await call(handler, 'GET', 'state', null, K)).state };
}
