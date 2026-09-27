// MGA league server. Stores the league in Netlify Blobs and checks who is allowed to change what.
import { getStore } from '@netlify/blobs';
import crypto from 'node:crypto';

const TOKEN_DAYS = 180;
const MAX_FAILS = 5, LOCK_MINUTES = 15;

const json = (status, body) => new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' } });
const store = () => getStore({ name: 'mga', consistency: 'strong' });
const secret = () => { const s = process.env.SESSION_SECRET; if (!s || s.length < 16) throw new Error('Server not configured: SESSION_SECRET is missing or too short (see setup guide)'); return s; };

// ---------- PINs and sign-in tokens ----------
function hashPin(pin) { const salt = crypto.randomBytes(16).toString('hex'); return { salt, hash: crypto.scryptSync(pin, salt, 64).toString('hex') }; }
function checkPin(pin, rec) { try { const a = crypto.scryptSync(pin, rec.salt, 64), b = Buffer.from(rec.hash, 'hex'); return a.length === b.length && crypto.timingSafeEqual(a, b); } catch { return false; } }
function makeToken(person) {
  const body = Buffer.from(JSON.stringify({ person, exp: Date.now() + TOKEN_DAYS * 864e5 })).toString('base64url');
  return body + '.' + crypto.createHmac('sha256', secret()).update(body).digest('base64url');
}
function readToken(req) {
  const h = req.headers.get('authorization') || ''; if (!h.startsWith('Bearer ')) return null;
  const [body, sig] = h.slice(7).split('.'); if (!body || !sig) return null;
  const good = crypto.createHmac('sha256', secret()).update(body).digest('base64url');
  if (sig.length !== good.length || !crypto.timingSafeEqual(Buffer.from(sig), Buffer.from(good))) return null;
  try { const p = JSON.parse(Buffer.from(body, 'base64url').toString()); return p.exp > Date.now() ? p.person : null; } catch { return null; }
}

// ---------- data helpers ----------
const personOf = p => p.person || p.id;
const activeYear = st => st && st.years ? st.years.find(y => y.id === st.activeYearId) : null;
const findPerson = (st, person) => { const y = activeYear(st); return y ? (y.players || []).find(p => personOf(p) === person) : null; };
function stable(v) { if (Array.isArray(v)) return '[' + v.map(stable).join(',') + ']'; if (v && typeof v === 'object') return '{' + Object.keys(v).filter(k => v[k] !== undefined).sort().map(k => JSON.stringify(k) + ':' + stable(v[k])).join(',') + '}'; return JSON.stringify(v ?? null); }
const normPO = p => ({ seeds: (p && p.seeds) || [], links: (p && p.links) || {}, overrides: (p && p.overrides) || {} });
const same = (a, b) => stable(a) === stable(b);

async function loadAll(s) {
  const [state, meta, creds] = await Promise.all([s.get('state', { type: 'json' }), s.get('meta', { type: 'json' }), s.get('creds', { type: 'json' })]);
  return { state, meta: meta || { rev: 0 }, creds: creds || {} };
}
async function saveState(s, state, meta) { meta.rev = (meta.rev || 0) + 1; await s.setJSON('state', state); await s.setJSON('meta', meta); return meta.rev; }

// Things only the Commissioner may change. Returns a message if a non-Commissioner tried.
function commissionerOnlyChange(oldS, newS) {
  if (newS.activeYearId !== oldS.activeYearId) return 'Only the League Commissioner can change the League Year';
  const ids = x => (x.years || []).map(y => y.id + '|' + y.label).sort().join(',');
  if (ids(newS) !== ids(oldS)) return 'Only the League Commissioner can add, rename or delete League Years';
  if (!same(newS.course, oldS.course)) return 'Only the League Commissioner can change the course';
  for (const ny of newS.years) {
    const oy = oldS.years.find(y => y.id === ny.id);
    if (ny.id !== oldS.activeYearId && !same(ny, oy)) return 'Only the League Commissioner can change other League Years';
    if (!same(normPO(ny.playoffs), normPO(oy.playoffs))) return 'Only the League Commissioner can change the playoffs';
    const oldRoles = Object.fromEntries((oy.players || []).map(p => [p.id, p.role || 'player']));
    for (const p of ny.players || []) {
      const was = oldRoles[p.id] ?? 'player';
      if ((p.role || 'player') !== was) return 'Only the League Commissioner can change roles';
    }
  }
  return null;
}

export default async (req) => {
  const route = new URL(req.url).pathname.replace(/^\/api\/?/, '').replace(/\/$/, '');
  try {
    const s = store();
    const { state, meta, creds } = await loadAll(s);
    const body = req.method === 'POST' ? await req.json().catch(() => ({})) : {};

    if (route === 'state' && req.method === 'GET')
      return json(200, { state, rev: meta.rev || 0, accounts: Object.keys(creds), needsSetup: !meta.setupDone });

    if (route === 'bootstrap' && req.method === 'POST') {
      if (meta.setupDone) return json(409, { error: 'This league is already set up' });
      const code = process.env.SETUP_CODE;
      if (!code) return json(500, { error: 'Server not configured: SETUP_CODE is missing (see setup guide)' });
      if (String(body.code || '') !== code) return json(403, { error: 'Wrong setup code' });
      const name = String(body.name || '').trim(), team = String(body.team || '').trim(), year = String(body.year || '').trim(), pin = String(body.pin || '');
      if (!name || !team || !year || pin.length < 6) return json(400, { error: 'Name, team, League Year and a 6+ character PIN are required' });
      const id = () => crypto.randomBytes(5).toString('hex');
      const yid = id(), tid = id(), pid = id();
      const st = { years: [{ id: yid, label: year, teams: [{ id: tid, name: team }], players: [{ id: pid, person: pid, name, team: tid, email: '', phone: '', hcp0: 0, role: 'commissioner' }], weeks: [], playoffs: normPO(), eoyGroups: [], eoyGroupSize: 4 }], activeYearId: yid, course: { par: [4, 4, 3, 5, 4, 4, 3, 4, 5], hcp: [1, 2, 3, 4, 5, 6, 7, 8, 9] } };
      creds[pid] = hashPin(pin); await s.setJSON('creds', creds);
      meta.setupDone = true; await saveState(s, st, meta);
      return json(200, { token: makeToken(pid), person: pid });
    }

    if (route === 'claim' && req.method === 'POST') {
      const person = String(body.person || ''), pin = String(body.pin || '');
      if (pin.length < 6) return json(400, { error: 'PIN must be at least 6 characters' });
      if (!findPerson(state, person)) return json(404, { error: 'That name is not on the Roster for this League Year' });
      if (creds[person]) return json(409, { error: 'That account is already set up — sign in instead' });
      creds[person] = hashPin(pin); await s.setJSON('creds', creds);
      return json(200, { token: makeToken(person), person });
    }

    if (route === 'login' && req.method === 'POST') {
      const person = String(body.person || ''), pin = String(body.pin || ''), rec = creds[person];
      if (!rec) return json(401, { error: 'No account for that name yet — use "Set up your account"' });
      if (rec.lockedUntil && rec.lockedUntil > Date.now()) return json(429, { error: 'Too many wrong PINs — try again in a few minutes' });
      if (!checkPin(pin, rec)) {
        rec.fails = (rec.fails || 0) + 1; if (rec.fails >= MAX_FAILS) { rec.lockedUntil = Date.now() + LOCK_MINUTES * 6e4; rec.fails = 0; }
        await s.setJSON('creds', creds); return json(401, { error: 'Incorrect PIN' });
      }
      if (!findPerson(state, person)) return json(403, { error: 'You are not on the Roster for the current League Year' });
      if (rec.fails || rec.lockedUntil) { delete rec.fails; delete rec.lockedUntil; await s.setJSON('creds', creds); }
      return json(200, { token: makeToken(person), person });
    }

    // Everything below needs a signed-in person on the current Roster
    const who = readToken(req), caller = who && findPerson(state, who);
    if (!caller) return json(401, { error: 'Please sign in on the Account tab to make changes' });
    const commish = caller.role === 'commissioner';

    if (route === 'reset' && req.method === 'POST') {
      if (!commish) return json(403, { error: 'Only the League Commissioner can reset a login' });
      delete creds[String(body.person || '')]; await s.setJSON('creds', creds);
      return json(200, { ok: true });
    }

    if (route === 'state' && req.method === 'POST') {
      const next = body.state;
      if (!next || !Array.isArray(next.years) || !next.years.length || !next.years.find(y => y.id === next.activeYearId)) return json(400, { error: 'Invalid data' });
      if (body.baseRev !== (meta.rev || 0)) return json(409, { error: 'Someone else saved first' });
      if (!commish) { const why = commissionerOnlyChange(state, next); if (why) return json(403, { error: why }); }
      const clean = { years: next.years, activeYearId: next.activeYearId, course: next.course };
      if (!findPerson(clean, who) && !commish) return json(403, { error: 'You cannot remove yourself from the Roster' });
      const rev = await saveState(s, clean, meta);
      return json(200, { rev });
    }

    return json(404, { error: 'Not found' });
  } catch (e) {
    return json(500, { error: e.message || 'Server error' });
  }
};

export const config = { path: '/api/*' };
