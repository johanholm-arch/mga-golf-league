// MGA league server. Stores the league in Netlify Blobs and checks who is allowed to change what.
// Every change arrives as an operation (see public/js/ops.js); the server applies it to the
// stored copy, validates the result and writes it back with a conditional write, so two people
// saving at once can never overwrite each other.
import { getStore } from '@netlify/blobs';
import crypto from 'node:crypto';
import { applyOp, canDo, validateState, migrate, pruneTrash, emptyYear, emptyState, view, tooBig } from '../../public/js/ops.js';
import { roleOf, personOf } from '../../public/js/rules.js';

const TOKEN_DAYS = 180;
const MAX_FAILS = 5, LOCK_MINUTES = 15;
const RATE_LIMIT = 30;            // sign-in style attempts per IP per hour
const KEEP_REVISIONS = 200;
const MAX_BODY = 1_000_000;
const PIN_RE = /^\d{4,6}$/;
const LEAGUE_KEY = 'league';

const json = (status, body, extra = {}) => new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json', 'Cache-Control': 'no-store', ...extra } });
const fail = (status, error) => json(status, { error });
const store = () => getStore({ name: 'mga', consistency: 'strong' });
const secret = () => { const s = process.env.SESSION_SECRET; if (!s || s.length < 16) throw new Error('Server not configured: SESSION_SECRET is missing or too short (see setup guide)'); return s; };

// ---------- PINs and sign-in tokens ----------
function hashPin(pin) { const salt = crypto.randomBytes(16).toString('hex'); return { salt, hash: crypto.scryptSync(pin, salt, 64).toString('hex') }; }
function checkPin(pin, rec) { try { const a = crypto.scryptSync(pin, rec.salt, 64), b = Buffer.from(rec.hash, 'hex'); return a.length === b.length && crypto.timingSafeEqual(a, b); } catch { return false; } }
function makeToken(person, rec) {
  const body = Buffer.from(JSON.stringify({ person, tv: rec.tv || 0, exp: Date.now() + TOKEN_DAYS * 864e5 })).toString('base64url');
  return body + '.' + crypto.createHmac('sha256', secret()).update(body).digest('base64url');
}
function readToken(req, creds) {
  const h = req.headers.get('authorization') || ''; if (!h.startsWith('Bearer ')) return null;
  const [body, sig] = h.slice(7).split('.'); if (!body || !sig) return null;
  const good = crypto.createHmac('sha256', secret()).update(body).digest('base64url');
  if (sig.length !== good.length || !crypto.timingSafeEqual(Buffer.from(sig), Buffer.from(good))) return null;
  try {
    const p = JSON.parse(Buffer.from(body, 'base64url').toString());
    if (!(p.exp > Date.now())) return null;
    const rec = creds[p.person]; if (!rec || (rec.tv || 0) !== (p.tv || 0)) return null;   // reset or PIN change signs old devices out
    return p.person;
  } catch { return null; }
}
const safeEqual = (a, b) => { const x = Buffer.from(String(a)), y = Buffer.from(String(b)); return x.length === y.length && crypto.timingSafeEqual(x, y); };

// ---------- storage ----------
async function loadLeague(s) {
  const got = await s.getWithMetadata(LEAGUE_KEY, { type: 'json' });
  if (got && got.data) return { rev: got.data.rev || 0, state: migrate(got.data.state), etag: got.etag, fresh: false };
  // First run, or data from the previous version of the app (separate 'state' and 'meta' blobs).
  const [old, meta] = await Promise.all([s.get('state', { type: 'json' }), s.get('meta', { type: 'json' })]);
  return { rev: (meta && meta.rev) || 0, state: old ? migrate(old) : null, etag: undefined, fresh: true };
}
async function saveLeague(s, league) {
  const rev = league.rev + 1, doc = { rev, state: league.state, savedAt: new Date().toISOString() };
  const opts = league.etag ? { onlyIfMatch: league.etag } : { onlyIfNew: true };
  const r = await s.setJSON(LEAGUE_KEY, doc, opts);
  if (!r.modified) return null;
  // Revision history: keep the last KEEP_REVISIONS saves so a mistake can be undone.
  await s.setJSON(`${LEAGUE_KEY}-rev-${rev}`, doc);
  if (rev > KEEP_REVISIONS) s.delete(`${LEAGUE_KEY}-rev-${rev - KEEP_REVISIONS}`).catch(() => {});
  return rev;
}
const loadMeta = async s => (await s.get('meta', { type: 'json' })) || { setupDone: false };
const loadCreds = async s => (await s.get('creds', { type: 'json' })) || {};

async function rateLimited(ip) {
  if (!ip) return false;
  const rl = getStore({ name: 'mga-ratelimit', consistency: 'strong' }), key = `rl-${ip}-${Math.floor(Date.now() / 36e5)}`;
  const n = ((await rl.get(key, { type: 'json' })) || 0) + 1;
  await rl.setJSON(key, n);
  return n > RATE_LIMIT;
}

/** What a given caller is allowed to see. Contact details are not public. */
function publicState(state, caller) {
  const out = JSON.parse(JSON.stringify(state));
  const role = roleOf(caller);
  for (const y of out.years) for (const p of y.players) {
    const mine = caller && p.id === caller.id, sameTeam = caller && role === 'captain' && p.team === caller.team;
    if (!(role === 'commissioner' || mine || sameTeam)) { delete p.email; delete p.phone; }
  }
  for (const y of out.years) delete y.trash;   // only the Commissioner sees Recently deleted (sent separately)
  return out;
}
const findPerson = (state, person) => state ? view(state).players.find(p => personOf(p) === person) || null : null;

export default async (req, context) => {
  const route = new URL(req.url).pathname.replace(/^\/api\/?/, '').replace(/\/$/, '');
  const ip = (context && context.ip) || req.headers.get('x-nf-client-connection-ip') || '';
  try {
    const s = store();
    let body = {};
    if (req.method === 'POST') {
      const len = +(req.headers.get('content-length') || 0); if (len > MAX_BODY) return fail(413, 'That request is too large');
      const text = await req.text(); if (text.length > MAX_BODY) return fail(413, 'That request is too large');
      try { body = text ? JSON.parse(text) : {}; } catch { return fail(400, 'Bad request'); }
    }
    const [league, meta, creds] = await Promise.all([loadLeague(s), loadMeta(s), loadCreds(s)]);
    const who = readToken(req, creds), caller = who && findPerson(league.state, who);
    const commish = roleOf(caller) === 'commissioner';

    if (route === 'state' && req.method === 'GET') {
      const tag = `"${league.rev}-${caller ? personOf(caller) + roleOf(caller) : 'public'}"`;
      if (req.headers.get('if-none-match') === tag) return new Response(null, { status: 304, headers: { ETag: tag, 'Cache-Control': 'no-store' } });
      const out = { rev: league.rev, needsSetup: !meta.setupDone, accounts: Object.keys(creds), state: league.state ? publicState(league.state, caller) : null, me: caller ? { person: personOf(caller), playerId: caller.id, role: roleOf(caller), name: caller.name } : null };
      if (commish) { out.joinCode = meta.joinCode || ''; out.trash = view(league.state).trash; }
      return json(200, out, { ETag: tag });
    }

    if (route === 'bootstrap' && req.method === 'POST') {
      if (meta.setupDone) return fail(409, 'This league is already set up');
      if (await rateLimited(ip)) return fail(429, 'Too many attempts from this connection. Try again in an hour.');
      const code = process.env.SETUP_CODE;
      if (!code) return fail(500, 'Server not configured: SETUP_CODE is missing (see setup guide)');
      if (!safeEqual(String(body.code || ''), code)) return fail(403, 'Wrong setup code');
      const name = String(body.name || '').trim(), team = String(body.team || '').trim(), year = String(body.year || '').trim(), pin = String(body.pin || ''), leagueName = String(body.leagueName || '').trim() || 'MGA';
      if (!name || !team || !year) return fail(400, 'Your name, your team\'s name and the League Year are all required');
      if (!PIN_RE.test(pin)) return fail(400, 'The PIN must be 4 to 6 digits');
      const st = emptyState(); st.settings.leagueName = leagueName.slice(0, 60);
      const y = emptyYear(year.slice(0, 20)); const tid = crypto.randomBytes(5).toString('hex'), pid = crypto.randomBytes(5).toString('hex');
      y.teams.push({ id: tid, name: team.slice(0, 40) }); y.players.push({ id: pid, person: pid, name: name.slice(0, 60), team: tid, email: '', phone: '', hcp0: 0, role: 'commissioner' });
      st.years.push(y); st.activeYearId = y.id;
      const why = validateState(st); if (why) return fail(400, 'Could not create the league: ' + why);
      creds[pid] = { ...hashPin(pin), tv: 0 }; await s.setJSON('creds', creds);
      meta.setupDone = true; meta.joinCode = crypto.randomBytes(3).toString('hex').toUpperCase(); await s.setJSON('meta', meta);
      const rev = await saveLeague(s, { rev: league.rev, state: st, etag: league.etag });
      if (!rev) return fail(409, 'The league was set up by someone else at the same moment. Refresh the page.');
      return json(200, { token: makeToken(pid, creds[pid]), person: pid, joinCode: meta.joinCode });
    }

    if (route === 'claim' && req.method === 'POST') {
      if (await rateLimited(ip)) return fail(429, 'Too many attempts from this connection. Try again in an hour.');
      const person = String(body.person || ''), pin = String(body.pin || ''), code = String(body.joinCode || '').trim().toUpperCase();
      if (!PIN_RE.test(pin)) return fail(400, 'The PIN must be 4 to 6 digits');
      if (!meta.joinCode || !safeEqual(code, meta.joinCode)) return fail(403, 'Wrong join code. Ask your Commissioner or captain for the league\'s join code.');
      if (!findPerson(league.state, person)) return fail(404, 'That name is not on the Roster for this League Year');
      if (creds[person]) return fail(409, 'That account is already set up. Sign in instead, or ask the Commissioner to reset it.');
      creds[person] = { ...hashPin(pin), tv: 0 }; await s.setJSON('creds', creds);
      return json(200, { token: makeToken(person, creds[person]), person });
    }

    if (route === 'login' && req.method === 'POST') {
      if (await rateLimited(ip)) return fail(429, 'Too many attempts from this connection. Try again in an hour.');
      const person = String(body.person || ''), pin = String(body.pin || ''), rec = creds[person];
      if (!rec) return fail(401, 'No account for that name yet. Use "Set up your account" below.');
      if (rec.lockedUntil && rec.lockedUntil > Date.now()) return fail(429, `Too many wrong PINs. Try again in ${Math.ceil((rec.lockedUntil - Date.now()) / 6e4)} minutes.`);
      if (!checkPin(pin, rec)) {
        rec.fails = (rec.fails || 0) + 1; if (rec.fails >= MAX_FAILS) { rec.lockedUntil = Date.now() + LOCK_MINUTES * 6e4; rec.fails = 0; }
        await s.setJSON('creds', creds); return fail(401, rec.lockedUntil ? `Incorrect PIN. Locked for ${LOCK_MINUTES} minutes.` : `Incorrect PIN (${MAX_FAILS - rec.fails} tries left)`);
      }
      if (!findPerson(league.state, person)) return fail(403, 'You are not on the Roster for the current League Year');
      if (rec.fails || rec.lockedUntil) { delete rec.fails; delete rec.lockedUntil; await s.setJSON('creds', creds); }
      return json(200, { token: makeToken(person, rec), person });
    }

    // Everything below needs a signed-in person on the current Roster
    if (!caller) return fail(401, 'Please sign in on the Account tab to make changes');

    if (route === 'pin' && req.method === 'POST') {
      const rec = creds[who]; const oldPin = String(body.oldPin || ''), newPin = String(body.newPin || '');
      if (!PIN_RE.test(newPin)) return fail(400, 'The new PIN must be 4 to 6 digits');
      if (!checkPin(oldPin, rec)) return fail(401, 'Your current PIN is not right');
      creds[who] = { ...hashPin(newPin), tv: (rec.tv || 0) + 1 }; await s.setJSON('creds', creds);
      return json(200, { token: makeToken(who, creds[who]), person: who });
    }

    if (route === 'reset' && req.method === 'POST') {
      if (!commish) return fail(403, 'Only the League Commissioner can reset a login');
      const person = String(body.person || ''); if (!creds[person]) return fail(404, 'That person has no account to reset');
      if (person === who) return fail(400, 'Use "Change my PIN" for your own account');
      delete creds[person]; await s.setJSON('creds', creds);
      return json(200, { ok: true });
    }

    if (route === 'joincode' && req.method === 'POST') {
      if (!commish) return fail(403, 'Only the League Commissioner can change the join code');
      const code = String(body.code || '').trim().toUpperCase(); if (!/^[A-Z0-9]{4,20}$/.test(code)) return fail(400, 'The join code must be 4 to 20 letters or numbers');
      meta.joinCode = code; await s.setJSON('meta', meta);
      return json(200, { joinCode: code });
    }

    if (route === 'backup' && req.method === 'GET') {
      if (!commish) return fail(403, 'Only the League Commissioner can download a backup');
      const name = (league.state.settings.leagueName || 'league').replace(/[^\w-]+/g, '-');
      return json(200, { app: 'mga-league', exportedAt: new Date().toISOString(), rev: league.rev, state: league.state }, { 'Content-Disposition': `attachment; filename="${name}-backup-${new Date().toISOString().slice(0, 10)}.json"` });
    }

    if (route === 'op' && req.method === 'POST') {
      const op = body.op; if (!op || typeof op !== 'object' || typeof op.type !== 'string') return fail(400, 'Bad request');
      // Apply to the stored copy; if someone else saved in between, reload and apply again.
      let current = league;
      for (let attempt = 0; attempt < 4; attempt++) {
        const me = findPerson(current.state, who); if (!me) return fail(403, 'You are no longer on the Roster for the current League Year');
        const why = canDo(op, me, current.state); if (why) return fail(403, why);
        const next = JSON.parse(JSON.stringify(current.state));
        let result; try { result = applyOp(next, op); } catch (e) { return fail(e.status || 400, e.message); }
        pruneTrash(next);
        const bad = validateState(next); if (bad) return fail(400, 'That change was not saved because it would leave the league in a bad state (' + bad + ')');
        if (tooBig(next)) return fail(413, 'The league data is too large. Delete old League Years or empty Recently deleted.');
        if (!findPerson(next, who) && roleOf(me) !== 'commissioner') return fail(403, 'You cannot remove yourself from the Roster');
        const rev = await saveLeague(s, { rev: current.rev, state: next, etag: current.etag });
        if (rev) { const after = findPerson(next, who); const out = { rev, result, state: publicState(next, after), me: after ? { person: who, playerId: after.id, role: roleOf(after), name: after.name } : null }; if (roleOf(after) === 'commissioner') out.trash = view(next).trash; return json(200, out); }
        current = await loadLeague(s);
      }
      return fail(409, 'The league is very busy right now. Your change was not saved. Please try again.');
    }

    return fail(404, 'Not found');
  } catch (e) {
    return fail(500, e.message || 'Server error');
  }
};

export const config = { path: '/api/*' };
