// End-to-end: the real server function against the in-memory blob store (see loader.mjs).
import { test, before, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { reset } from './mock-blobs.mjs';

process.env.SESSION_SECRET = 'test-secret-that-is-long-enough';
process.env.SETUP_CODE = 'Setup123';
const { default: handler } = await import('../netlify/functions/api.mjs');

const call = async (method, route, body, token, headers = {}) => {
  const req = new Request('http://x/api/' + route, { method, headers: { 'content-type': 'application/json', ...(token ? { authorization: 'Bearer ' + token } : {}), ...headers }, body: body ? JSON.stringify(body) : undefined });
  const res = await handler(req, { ip: headers.ip || '1.2.3.4' });
  return { status: res.status, headers: res.headers, body: res.status === 304 ? null : await res.json() };
};
const get = (token, headers) => call('GET', 'state', null, token, headers);
const op = (token, o) => call('POST', 'op', { op: o }, token);

async function setup() {
  reset();
  const b = await call('POST', 'bootstrap', { name: 'Jim Commish', team: 'Eagles', year: '2026', pin: '1234', code: 'Setup123', leagueName: 'Monday Golf' });
  assert.equal(b.status, 200, JSON.stringify(b.body));
  const K = b.body.token, joinCode = b.body.joinCode;
  const st = (await get(K)).body.state, A = st.years[0].teams[0].id;
  await op(K, { type: 'addTeam', name: 'Hackers' });
  const B = (await get(K)).body.state.years[0].teams[1].id;
  await op(K, { type: 'addPlayer', name: 'Bob Player', team: A, email: 'bob@x.com', phone: '555' });
  await op(K, { type: 'addPlayer', name: 'Cal Captain', team: B });
  let L = (await get(K)).body.state.years[0];
  const bob = L.players.find(p => p.name.startsWith('Bob')), cal = L.players.find(p => p.name.startsWith('Cal'));
  await op(K, { type: 'editPlayer', playerId: cal.id, fields: { role: 'captain' } });
  const cb = await call('POST', 'claim', { person: bob.person, pin: '5678', joinCode });
  assert.equal(cb.status, 200, JSON.stringify(cb.body));
  const cc = await call('POST', 'claim', { person: cal.person, pin: '9999', joinCode: joinCode.toLowerCase() });
  assert.equal(cc.status, 200);
  return { K, P: cb.body.token, C: cc.body.token, joinCode, A, B, bob, cal };
}

test('bootstrap once, setup code checked, PIN must be digits', async () => {
  reset();
  let r = await call('POST', 'bootstrap', { name: 'J', team: 'T', year: '2026', pin: 'abcdef', code: 'Setup123' });
  assert.equal(r.status, 400); assert.match(r.body.error, /4 to 6 digits/);
  r = await call('POST', 'bootstrap', { name: 'J', team: 'T', year: '2026', pin: '1234', code: 'wrong' });
  assert.equal(r.status, 403);
  r = await call('POST', 'bootstrap', { name: 'J', team: 'T', year: '2026', pin: '1234', code: 'Setup123' });
  assert.equal(r.status, 200); assert.match(r.body.joinCode, /^[A-Z0-9]{6}$/);
  r = await call('POST', 'bootstrap', { name: 'J', team: 'T', year: '2026', pin: '1234', code: 'Setup123' });
  assert.equal(r.status, 409);
  const s = await get(); assert.equal(s.body.needsSetup, false); assert.equal(s.body.state.settings.leagueName, 'MGA');
});

test('public state hides contact details and the join code; ETag gives 304', async () => {
  const { K, P } = await setup();
  const pub = await get();
  const players = pub.body.state.years[0].players;
  assert.ok(players.every(p => !('email' in p) && !('phone' in p)));
  assert.equal(pub.body.joinCode, undefined); assert.equal(pub.body.me, null); assert.equal(pub.body.state.years[0].trash, undefined);
  const again = await get(null, { 'if-none-match': pub.headers.get('etag') });
  assert.equal(again.status, 304);
  const mine = await get(P);
  const me = mine.body.state.years[0].players.find(p => p.name.startsWith('Bob'));
  assert.equal(me.email, 'bob@x.com'); assert.equal(mine.body.me.role, 'player');
  assert.ok(mine.body.state.years[0].players.filter(p => p.id !== me.id).every(p => !('email' in p)));
  const boss = await get(K);
  assert.equal(boss.body.joinCode.length, 6); assert.ok(boss.body.trash); assert.ok(boss.body.state.years[0].players.every(p => 'email' in p));
});

test('claim needs the join code and a roster name; login locks after 5 wrong PINs', async () => {
  const { joinCode, bob, cal } = await setup();
  let r = await call('POST', 'claim', { person: bob.person, pin: '1111', joinCode });
  assert.equal(r.status, 409);
  r = await call('POST', 'claim', { person: 'nobody', pin: '1111', joinCode });
  assert.equal(r.status, 404);
  r = await call('POST', 'claim', { person: cal.person, pin: '1111', joinCode: 'NOPE' });
  assert.equal(r.status, 403);
  for (let i = 0; i < 5; i++) { r = await call('POST', 'login', { person: bob.person, pin: '0000' }); assert.equal(r.status, 401); }
  r = await call('POST', 'login', { person: bob.person, pin: '5678' });
  assert.equal(r.status, 429);
});

test('rate limit per connection', async () => {
  await setup();
  let last;
  for (let i = 0; i < 31; i++) last = await call('POST', 'login', { person: 'ghost', pin: '0000' }, null, { ip: '9.9.9.9' });
  assert.equal(last.status, 429); assert.match(last.body.error, /Too many attempts/);
  const other = await call('POST', 'login', { person: 'ghost', pin: '0000' }, null, { ip: '8.8.8.8' });
  assert.equal(other.status, 401);
});

test('players may score but not delete; captains may schedule; nothing without a token', async () => {
  const { K, P, C, A, B, bob } = await setup();
  let r = await op(null, { type: 'addWeek', date: '2026-05-06' }); assert.equal(r.status, 401);
  r = await op(P, { type: 'addWeek', date: '2026-05-06' }); assert.equal(r.status, 403);
  r = await op(C, { type: 'addWeek', date: '2026-05-06' }); assert.equal(r.status, 200);
  const wid = r.body.result.weekId;
  r = await op(P, { type: 'setScore', weekId: wid, playerId: bob.id, hole: 0, value: 4 }); assert.equal(r.status, 200);
  assert.equal(r.body.state.years[0].weeks[0].sc[bob.id][0], 4);
  r = await op(P, { type: 'setScore', weekId: wid, playerId: bob.id, hole: 0, value: 44 }); assert.equal(r.status, 400);
  r = await op(P, { type: 'deleteWeek', weekId: wid }); assert.equal(r.status, 403); assert.match(r.body.error, /Commissioner/);
  r = await op(C, { type: 'deleteWeek', weekId: wid }); assert.equal(r.status, 403);
  r = await op(K, { type: 'deleteWeek', weekId: wid }); assert.equal(r.status, 200);
  assert.equal(r.body.trash.weeks.length, 1);
  r = await op(K, { type: 'nonsense' }); assert.equal(r.status, 400);
});

test('two saves at the same moment both land (conditional write + retry)', async () => {
  const { K, P, C, bob, cal } = await setup();
  const w = await op(K, { type: 'addWeek', date: '2026-05-06' }); const wid = w.body.result.weekId;
  const [a, b] = await Promise.all([
    op(P, { type: 'setScore', weekId: wid, playerId: bob.id, hole: 0, value: 4 }),
    op(C, { type: 'setScore', weekId: wid, playerId: cal.id, hole: 0, value: 5 }),
  ]);
  assert.equal(a.status, 200); assert.equal(b.status, 200);
  const sc = (await get()).body.state.years[0].weeks[0].sc;
  assert.equal(sc[bob.id][0], 4); assert.equal(sc[cal.id][0], 5);
  assert.notEqual(a.body.rev, b.body.rev);
});

test('reset login signs the old device out; changing your PIN too', async () => {
  const { K, P, joinCode, bob } = await setup();
  let r = await call('POST', 'reset', { person: bob.person }, P); assert.equal(r.status, 403);
  r = await call('POST', 'reset', { person: bob.person }, K); assert.equal(r.status, 200);
  r = await get(P); assert.equal(r.body.me, null);            // old token no longer identifies anyone
  r = await op(P, { type: 'setRsvp', playerId: bob.id, key: 'eoyBanquet', value: true }); assert.equal(r.status, 401);
  r = await call('POST', 'claim', { person: bob.person, pin: '2468', joinCode }); assert.equal(r.status, 200);
  const P2 = r.body.token;
  r = await call('POST', 'pin', { oldPin: '0000', newPin: '1357' }, P2); assert.equal(r.status, 401);
  r = await call('POST', 'pin', { oldPin: '2468', newPin: '1357' }, P2); assert.equal(r.status, 200);
  const P3 = r.body.token;
  assert.equal((await get(P2)).body.me, null); assert.equal((await get(P3)).body.me.name, 'Bob Player');
});

test('backup download and join code are Commissioner-only; restore round-trips', async () => {
  const { K, P } = await setup();
  assert.equal((await call('GET', 'backup', null, P)).status, 403);
  const bk = await call('GET', 'backup', null, K);
  assert.equal(bk.status, 200); assert.match(bk.headers.get('content-disposition'), /Monday-Golf-backup/);
  assert.equal((await call('POST', 'joincode', { code: 'golf2027' }, P)).status, 403);
  const jc = await call('POST', 'joincode', { code: 'golf2027' }, K); assert.equal(jc.body.joinCode, 'GOLF2027');
  await op(K, { type: 'setLeagueName', name: 'Renamed' });
  const r = await op(K, { type: 'restoreBackup', state: bk.body.state }); assert.equal(r.status, 200);
  assert.equal(r.body.state.settings.leagueName, 'Monday Golf');
});

test('data from the previous app version is picked up on first load', async () => {
  reset();
  const { getStore } = await import('./mock-blobs.mjs');
  const s = getStore({ name: 'mga' });
  await s.setJSON('state', { years: [{ id: 'y1', label: '2025', teams: [{ id: 't1', name: 'Old Team' }], players: [{ id: 'p1', name: 'Old Jim', team: 't1', hcp0: 4, role: 'commissioner' }], weeks: [] }], activeYearId: 'y1', course: { par: [4, 4, 3, 5, 4, 4, 3, 4, 5], hcp: [1, 2, 3, 4, 5, 6, 7, 8, 9] } });
  await s.setJSON('meta', { rev: 17, setupDone: true });
  const r = await get();
  assert.equal(r.body.rev, 17); assert.equal(r.body.needsSetup, false); assert.equal(r.body.state.years[0].players[0].person, 'p1');
});
