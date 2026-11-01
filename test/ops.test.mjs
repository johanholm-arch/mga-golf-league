// Operations, permissions, validation and migration.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { applyOp, canDo, validateState, migrate, emptyState, emptyYear, view, setUid, pruneTrash, TRASH_DAYS } from '../public/js/ops.js';

let n = 0; setUid(() => 'id' + (++n));
const PAR = [4, 4, 3, 5, 4, 4, 3, 4, 5];

function league() {
  const st = emptyState(); const y = emptyYear('2026'); st.years.push(y); st.activeYearId = y.id;
  y.teams.push({ id: 'A', name: 'Eagles' }, { id: 'B', name: 'Hackers' });
  const pl = (id, team, role = 'player') => y.players.push({ id, person: id, name: 'Name ' + id, team, email: '', phone: '', hcp0: 5, role });
  pl('c', 'A', 'commissioner'); pl('cap', 'A', 'captain'); pl('p', 'A'); pl('q', 'B');
  y.weeks.push({ id: 'w1', date: '2026-05-06', type: 'Regular', sc: {}, matchups: [{ id: 'm1', a: 'A', b: 'B', tee: '4:30 PM' }], pairs: [] });
  return st;
}
const who = (st, id) => view(st).players.find(p => p.id === id);

test('every fixture is valid to begin with', () => { assert.equal(validateState(league()), null); });

test('permissions: players score, captains schedule, only the Commissioner deletes', () => {
  const st = league(), P = who(st, 'p'), C = who(st, 'cap'), K = who(st, 'c');
  assert.equal(canDo({ type: 'setScore' }, null, st), 'Please sign in on the Account tab to make changes');
  assert.equal(canDo({ type: 'setScore' }, P, st), null);
  assert.equal(canDo({ type: 'setPair' }, P, st), null);
  assert.equal(canDo({ type: 'setForfeit' }, P, st), null);
  assert.equal(canDo({ type: 'addWeek' }, P, st), 'Only the League Commissioner can do that');
  assert.equal(canDo({ type: 'addWeek' }, C, st), null);
  assert.equal(canDo({ type: 'addMatchup' }, C, st), null);
  for (const t of ['deleteWeek', 'deleteAllWeeks', 'deleteTeam', 'deletePlayer', 'generateSchedule', 'setCourse', 'newYear', 'generateSeeds', 'restoreBackup', 'setLeagueName'])
    { assert.equal(canDo({ type: t }, C, st), 'Only the League Commissioner can do that', t); assert.equal(canDo({ type: t }, K, st), null, t); }
  // RSVP and own details
  assert.equal(canDo({ type: 'setRsvp', playerId: 'p' }, P, st), null);
  assert.equal(canDo({ type: 'setRsvp', playerId: 'q' }, P, st), 'You can only RSVP for yourself');
  assert.equal(canDo({ type: 'setRsvp', playerId: 'p' }, C, st), null);
  assert.equal(canDo({ type: 'setRsvp', playerId: 'q' }, C, st), 'Captains can only RSVP for their own team');
  assert.equal(canDo({ type: 'editPlayer', playerId: 'p', fields: { email: 'x' } }, P, st), null);
  assert.equal(canDo({ type: 'editPlayer', playerId: 'p', fields: { hcp0: 3 } }, P, st), 'You can only change your own name, email and phone');
  assert.equal(canDo({ type: 'editPlayer', playerId: 'p', fields: { hcp0: 3 } }, C, st), null);
  assert.equal(canDo({ type: 'editPlayer', playerId: 'p', fields: { role: 'captain' } }, C, st), 'Only the League Commissioner can change roles');
  assert.equal(canDo({ type: 'editPlayer', playerId: 'q', fields: { name: 'x' } }, C, st), 'Captains can only edit their own team');
});

test('scores: set, clear, reject out of range, team scores only on team weeks', () => {
  const st = league();
  applyOp(st, { type: 'setScore', weekId: 'w1', playerId: 'p', hole: 0, value: '5' });
  applyOp(st, { type: 'setScore', weekId: 'w1', playerId: 'p', hole: 8, value: 4 });
  assert.deepEqual(view(st).weeks[0].sc.p, [5, '', '', '', '', '', '', '', 4]);
  applyOp(st, { type: 'setScore', weekId: 'w1', playerId: 'p', hole: 0, value: '' });
  assert.equal(view(st).weeks[0].sc.p[0], '');
  assert.throws(() => applyOp(st, { type: 'setScore', weekId: 'w1', playerId: 'p', hole: 0, value: 16 }), /between 1 and 15/);
  assert.throws(() => applyOp(st, { type: 'setScore', weekId: 'w1', playerId: 'p', hole: 9, value: 4 }), /Bad hole/);
  assert.throws(() => applyOp(st, { type: 'setScore', weekId: 'nope', playerId: 'p', hole: 0, value: 4 }), /no longer exists/);
  assert.throws(() => applyOp(st, { type: 'setTeamScore', weekId: 'w1', matchupId: 'm1', side: 'a', hole: 0, value: 4 }), /only for Scramble/);
  applyOp(st, { type: 'setWeekType', weekId: 'w1', weekType: 'Scramble' });
  applyOp(st, { type: 'setTeamScore', weekId: 'w1', matchupId: 'm1', side: 'b', hole: 2, value: 3 });
  assert.equal(view(st).weeks[0].matchups[0].scB[2], 3);
  assert.equal(validateState(st), null);
});

test('pairs must come from the right team', () => {
  const st = league();
  applyOp(st, { type: 'setPair', weekId: 'w1', matchupId: 'm1', slot: 0, side: 'pa', playerId: 'p' });
  assert.throws(() => applyOp(st, { type: 'setPair', weekId: 'w1', matchupId: 'm1', slot: 0, side: 'pb', playerId: 'p' }), /not on that team/);
  applyOp(st, { type: 'setPair', weekId: 'w1', matchupId: 'm1', slot: 0, side: 'pb', playerId: 'q' });
  assert.deepEqual(view(st).weeks[0].pairs[0], { id: 'id' + n, m: 'm1', slot: 0, pa: 'p', pb: 'q' });
  assert.equal(validateState(st), null);
});

test('deleting a week moves it to Recently deleted and restore brings scores back', () => {
  const st = league();
  applyOp(st, { type: 'setScore', weekId: 'w1', playerId: 'p', hole: 0, value: 5 });
  applyOp(st, { type: 'deleteWeek', weekId: 'w1' });
  assert.equal(view(st).weeks.length, 0); assert.equal(view(st).trash.weeks.length, 1); assert.equal(view(st).trash.weeks[0].hadScores, true);
  assert.equal(validateState(st), null);
  applyOp(st, { type: 'restoreTrash', kind: 'weeks', id: 'w1' });
  assert.equal(view(st).weeks[0].sc.p[0], 5); assert.equal(view(st).trash.weeks.length, 0);
  // old trash is pruned
  applyOp(st, { type: 'deleteWeek', weekId: 'w1' });
  view(st).trash.weeks[0].deletedAt = Date.now() - (TRASH_DAYS + 1) * 864e5;
  assert.equal(pruneTrash(st), true); assert.equal(view(st).trash.weeks.length, 0);
});

test('deleting a team removes its players and matchups; restoring puts them all back', () => {
  const st = league();
  applyOp(st, { type: 'deleteTeam', teamId: 'B' });
  let L = view(st);
  assert.equal(L.teams.length, 1); assert.ok(!L.players.find(p => p.id === 'q')); assert.equal(L.weeks[0].matchups.length, 0);
  assert.equal(validateState(st), null);
  applyOp(st, { type: 'restoreTrash', kind: 'teams', id: 'B' });
  L = view(st);
  assert.equal(L.teams.length, 2); assert.ok(L.players.find(p => p.id === 'q')); assert.equal(L.weeks[0].matchups.length, 1);
  assert.equal(validateState(st), null);
});

test('the last Commissioner cannot be deleted', () => {
  const st = league();
  assert.throws(() => applyOp(st, { type: 'deletePlayer', playerId: 'c' }), /at least one Commissioner/);
  applyOp(st, { type: 'editPlayer', playerId: 'p', fields: { role: 'commissioner' } });
  applyOp(st, { type: 'deletePlayer', playerId: 'c' });
  assert.equal(validateState(st), null);
});

test('blank names are rejected', () => {
  const st = league();
  assert.throws(() => applyOp(st, { type: 'editPlayer', playerId: 'p', fields: { name: '   ' } }), /can't be empty/);
  assert.throws(() => applyOp(st, { type: 'renameTeam', teamId: 'A', name: '' }), /can't be empty/);
  assert.throws(() => applyOp(st, { type: 'addTeam', name: 'eagles' }), /already a team/);
});

test('generate schedule: round robin from a start date, refuses to wipe a week with scores', () => {
  const st = league(); applyOp(st, { type: 'addTeam', name: 'Mulligans' });
  const r = applyOp(st, { type: 'generateSchedule', startDate: '2026-05-13', weekType: 'Regular' });
  assert.equal(r.weeks, 3); assert.equal(r.matchups, 3);
  const L = view(st); assert.deepEqual(L.weeks.map(w => w.date).sort(), ['2026-05-06', '2026-05-13', '2026-05-20', '2026-05-27']);
  assert.ok(L.weeks.filter(w => w.date >= '2026-05-13').every(w => w.bye));
  applyOp(st, { type: 'setScore', weekId: L.weeks.find(w => w.date === '2026-05-13').id, playerId: 'p', hole: 0, value: 4 });
  assert.throws(() => applyOp(st, { type: 'generateSchedule', startDate: '2026-05-13', weekType: 'Regular' }), /already has scores/);
  assert.equal(validateState(st), null);
});

test('new League Year copies the roster forward with current handicaps and keeps person ids', () => {
  const st = league();
  applyOp(st, { type: 'newYear', label: '2027' });
  assert.equal(st.years.length, 2); assert.equal(view(st).year.label, '2027');
  const L = view(st); assert.equal(L.players.length, 4); assert.equal(L.players.find(p => p.person === 'c').role, 'commissioner');
  assert.equal(L.weeks.length, 0);
  assert.throws(() => applyOp(st, { type: 'newYear', label: '2027' }), /already used/);
  assert.equal(validateState(st), null);
});

test('playoff size drives seeding and the bracket', () => {
  const st = league();
  for (let i = 0; i < 8; i++) applyOp(st, { type: 'addTeam', name: 'T' + i });
  applyOp(st, { type: 'deleteTeam', teamId: 'B' });
  assert.throws(() => applyOp(st, { type: 'generateSeeds' }), /set to 10 teams but the league has 9/);
  applyOp(st, { type: 'restoreTrash', kind: 'teams', id: 'B' });
  applyOp(st, { type: 'generateSeeds' });
  assert.equal(view(st).playoffs.seeds.length, 10);
  applyOp(st, { type: 'setPlayoffSize', size: 8 }); applyOp(st, { type: 'generateSeeds' });
  assert.equal(view(st).playoffs.seeds.length, 8);
  assert.throws(() => applyOp(st, { type: 'setPlayoffSize', size: 1 }), /between 2 and 16/);
  assert.equal(validateState(st), null);
});

test('validation catches corrupt data', () => {
  const good = league(); assert.equal(validateState(good), null);
  const bad = x => { const st = league(); x(st); return validateState(st); };
  assert.ok(bad(st => st.course.par[0] = 9));
  assert.ok(bad(st => view(st).players[0].team = 'ZZ'));
  assert.ok(bad(st => view(st).weeks[0].sc.p = [1, 2, 3]));
  assert.ok(bad(st => view(st).weeks[0].sc.p = [1, 2, 3, 4, 5, 6, 7, 8, 99]));
  assert.ok(bad(st => view(st).weeks[0].date = '<b>hi</b>'));
  assert.ok(bad(st => view(st).players.forEach(p => p.role = 'player')));
  assert.ok(bad(st => st.settings.leagueName = ''));
  assert.ok(bad(st => view(st).weeks.push({ ...view(st).weeks[0], id: 'w2' })));   // duplicate date
});

test('migration upgrades the previous app version\'s data and cleans scorecards', () => {
  const old = { years: [{ id: 'y', label: '2025', teams: [{ id: 'A', name: 'Eagles' }], players: [{ id: 'p', name: 'Jim', team: 'A', hcp0: '7', role: 'commissioner' }], weeks: [{ id: 'w', date: '2025-05-06', sc: { p: [4, 4.5, '', null, 'x', 99, 3, 4, 5] }, matchups: [{ id: 'm', a: 'A', b: 'A' }] }] }], activeYearId: 'y', course: { par: PAR, hcp: [1, 2, 3, 4, 5, 6, 7, 8, 9] } };
  const st = migrate(JSON.parse(JSON.stringify(old)));
  assert.equal(st.version, 2); assert.equal(st.settings.leagueName, 'MGA'); assert.equal(st.settings.playoffSize, 10);
  const L = view(st);
  assert.equal(L.players[0].person, 'p'); assert.equal(L.players[0].hcp0, 7);
  assert.deepEqual(L.weeks[0].sc.p, [4, 5, '', '', '', '', 3, 4, 5]);
  assert.equal(L.weeks[0].type, 'Regular'); assert.deepEqual(L.trash, { weeks: [], teams: [], players: [] });
  // the one thing migrate cannot repair is reported by validation, not silently dropped
  assert.equal(validateState(st), 'matchup');
});

test('restoreBackup replaces the league with a validated copy', () => {
  const st = league(), other = league(); applyOp(other, { type: 'setLeagueName', name: 'Other League' });
  applyOp(st, { type: 'restoreBackup', state: other });
  assert.equal(st.settings.leagueName, 'Other League');
  assert.throws(() => applyOp(st, { type: 'restoreBackup', state: { hello: 1 } }), /not valid/);
});
