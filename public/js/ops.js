// Every change to the league is an "operation" applied by this module, both in the
// browser (for instant feedback) and on the server (the copy that counts). The server
// checks the caller's role with canDo() and the result with validateState().
import {
  HOLES, DEF_PAR, DEF_SI, WTYPES, TEAM_FMT, ROLES, MAX_HCP, MIN_PLAYOFF, MAX_PLAYOFF,
  calc, roundRobin, seedOrder, buildGroups, normPO, bracketSlots, playoffSize, isDate, addDays, to12h, clampHcp, roleOf, personOf, matches,
} from './rules.js';

export const STATE_VERSION = 2;
export const TRASH_DAYS = 30;

const rand = () => Math.random().toString(36).slice(2, 9);
export let uid = rand;
/** Tests inject a deterministic id generator. */
export function setUid(fn) { uid = fn || rand; }

const str = (v, max = 80) => String(v ?? '').trim().slice(0, max);
const err = m => { const e = new Error(m); e.status = 400; return e; };
const forbid = m => { const e = new Error(m); e.status = 403; return e; };

// ---------- state shape ----------
export function emptyYear(label) {
  return { id: uid(), label, teams: [], players: [], weeks: [], playoffs: normPO(), eoyGroups: [], eoyGroupSize: 4, trash: { weeks: [], teams: [], players: [] } };
}
export function emptyState() {
  return { version: STATE_VERSION, settings: { leagueName: 'MGA', playoffSize: 10 }, course: { par: [...DEF_PAR], hcp: [...DEF_SI] }, years: [], activeYearId: null };
}
export function activeYear(st) { return st && st.years ? st.years.find(y => y.id === st.activeYearId) || null : null; }

/** Flat view of the active year used by rules.js and the views. */
export function view(st) {
  const y = activeYear(st) || emptyYear('');
  return { teams: y.teams, players: y.players, weeks: y.weeks, playoffs: y.playoffs, eoyGroups: y.eoyGroups, eoyGroupSize: y.eoyGroupSize, trash: y.trash, year: y, course: st.course, settings: st.settings, years: st.years };
}

/** Bring older saved data up to the current shape. Safe to call repeatedly. */
export function migrate(st) {
  if (!st || typeof st !== 'object') st = emptyState();
  st.settings = Object.assign({ leagueName: 'MGA', playoffSize: 10 }, st.settings || {});
  st.course = st.course && Array.isArray(st.course.par) ? st.course : { par: [...DEF_PAR], hcp: [...DEF_SI] };
  if (!Array.isArray(st.years) || !st.years.length) {
    // Very old single-year shape.
    const y = emptyYear(String(new Date().getFullYear()));
    y.teams = st.teams || []; y.players = st.players || []; y.weeks = st.weeks || [];
    st.years = [y]; st.activeYearId = y.id;
  }
  for (const y of st.years) {
    y.teams = y.teams || []; y.players = y.players || []; y.weeks = y.weeks || [];
    y.playoffs = normPO(y.playoffs); y.eoyGroups = y.eoyGroups || []; y.eoyGroupSize = y.eoyGroupSize || 4;
    y.trash = Object.assign({ weeks: [], teams: [], players: [] }, y.trash || {});
    for (const p of y.players) { p.person = p.person || p.id; p.role = ROLES.includes(p.role) ? p.role : 'player'; p.email = p.email || ''; p.phone = p.phone || ''; p.hcp0 = clampHcp(p.hcp0); }
    const card = a => { const out = Array(HOLES).fill(''); (Array.isArray(a) ? a : []).slice(0, HOLES).forEach((v, i) => { const n = Math.round(+v); out[i] = v === '' || v == null || isNaN(n) || n < 1 || n > 15 ? '' : n; }); return out; };
    for (const w of y.weeks) {
      w.sc = w.sc || {}; w.matchups = w.matchups || []; w.pairs = w.pairs || []; w.type = WTYPES.includes(w.type) ? w.type : 'Regular';
      for (const k of Object.keys(w.sc)) w.sc[k] = card(w.sc[k]);
      for (const m of w.matchups) { m.tee = m.tee || ''; for (const k of ['scA', 'scB']) if (m[k]) m[k] = card(m[k]); for (const k of ['scrA', 'scrB']) if (m[k]) m[k] = [m[k][0] || '', m[k][1] || '']; }
      w.pairs = w.pairs.filter(p => p && p.id).map(p => ({ id: p.id, m: p.m, slot: +p.slot, pa: p.pa || '', pb: p.pb || '' }));
    }
  }
  if (!st.activeYearId || !st.years.find(y => y.id === st.activeYearId)) st.activeYearId = st.years[0].id;
  delete st.teams; delete st.players; delete st.weeks; delete st.playoffs; delete st.eoyGroups; delete st.eoyGroupSize;
  st.version = STATE_VERSION;
  return st;
}

/** Remove trash older than TRASH_DAYS. Returns true if anything was removed. */
export function pruneTrash(st, now = Date.now()) {
  let changed = false; const cutoff = now - TRASH_DAYS * 864e5;
  for (const y of st.years) for (const k of ['weeks', 'teams', 'players']) { const before = y.trash[k].length; y.trash[k] = y.trash[k].filter(t => t.deletedAt > cutoff); if (y.trash[k].length !== before) changed = true; }
  return changed;
}

// ---------- permissions ----------
// What each role may do. Scores, pairs and forfeits: any signed-in member (league decision, Nov 2026).
const PLAYER = new Set(['setScore', 'setTeamScore', 'setPair', 'setScrPlayer', 'setForfeit', 'clearForfeit', 'setRsvp', 'editPlayer']);
const CAPTAIN = new Set([...PLAYER, 'addWeek', 'setWeekType', 'addMatchup', 'deleteMatchup', 'setMatchupTee', 'setGroupTee']);
// Everything else is Commissioner-only.

export const DESTRUCTIVE = new Set(['deleteWeek', 'deleteWeekRange', 'deleteAllWeeks', 'deleteTeam', 'deletePlayer', 'deleteYear', 'resetPlayoffs', 'clearGroups', 'restoreBackup', 'generateSchedule']);

/** Returns null if the caller may apply op, otherwise a plain-language reason. */
export function canDo(op, caller, st) {
  if (!caller) return 'Please sign in on the Account tab to make changes';
  const role = roleOf(caller);
  if (role === 'commissioner') return null;
  if (role === 'captain' && CAPTAIN.has(op.type)) return checkScoped(op, caller, st, true);
  if (PLAYER.has(op.type)) return checkScoped(op, caller, st, false);
  return 'Only the League Commissioner can do that';
}
function checkScoped(op, caller, st, captain) {
  const L = view(st);
  if (op.type === 'setRsvp') {
    const p = L.players.find(x => x.id === op.playerId); if (!p) return 'Player not found';
    if (p.id === caller.id) return null;
    if (captain && p.team === caller.team) return null;
    return captain ? 'Captains can only RSVP for their own team' : 'You can only RSVP for yourself';
  }
  if (op.type === 'editPlayer') {
    const p = L.players.find(x => x.id === op.playerId); if (!p) return 'Player not found';
    const keys = Object.keys(op.fields || {});
    if (keys.some(k => k === 'role')) return 'Only the League Commissioner can change roles';
    if (p.id === caller.id) return keys.every(k => ['email', 'phone', 'name'].includes(k)) ? null : 'You can only change your own name, email and phone';
    if (captain && p.team === caller.team) return keys.every(k => ['email', 'phone', 'name', 'hcp0'].includes(k)) ? null : 'Captains can change their team\'s names, contact details and starting handicaps';
    return captain ? 'Captains can only edit their own team' : 'You can only edit your own details';
  }
  return null;
}

// ---------- operations ----------
function week(L, id) { const w = L.weeks.find(x => x.id === id); if (!w) throw err('That week no longer exists (it may have been deleted)'); return w; }
function matchup(w, id) { const m = matches(w).find(x => x.id === id); if (!m) throw err('That matchup no longer exists'); return m; }
function holeVal(v) { if (v === '' || v == null) return ''; const n = Math.round(+v); if (isNaN(n) || n < 1 || n > 15) throw err('Scores must be between 1 and 15'); return n; }
function holeIdx(i) { const n = +i; if (!Number.isInteger(n) || n < 0 || n >= HOLES) throw err('Bad hole number'); return n; }
function hasScores(w) { return Object.values(w.sc || {}).some(a => a.some(v => v !== '' && v != null)) || matches(w).some(m => (m.scA || []).some(v => v !== '') || (m.scB || []).some(v => v !== '')); }

const OPS = {
  // ----- scores -----
  setScore(st, L, op) { const w = week(L, op.weekId); if (!L.players.find(p => p.id === op.playerId)) throw err('Player not found'); const a = w.sc[op.playerId] || (w.sc[op.playerId] = Array(HOLES).fill('')); a[holeIdx(op.hole)] = holeVal(op.value); },
  setTeamScore(st, L, op) { const w = week(L, op.weekId), m = matchup(w, op.matchupId); if (!TEAM_FMT[w.type]) throw err('Team scores are only for Scramble and Alternate Shot weeks'); const key = op.side === 'b' ? 'scB' : 'scA'; const a = m[key] || (m[key] = Array(HOLES).fill('')); a[holeIdx(op.hole)] = holeVal(op.value); },
  // ----- pairs -----
  setPair(st, L, op) { const w = week(L, op.weekId), m = matchup(w, op.matchupId); const slot = +op.slot; if (![0, 1].includes(slot)) throw err('Bad pair slot'); const side = op.side === 'pb' ? 'pb' : 'pa'; const pid = str(op.playerId, 20); if (pid && (L.players.find(p => p.id === pid) || {}).team !== (side === 'pa' ? m.a : m.b)) throw err('That player is not on that team'); let p = w.pairs.find(x => x.m === m.id && x.slot === slot); if (!p) { p = { id: uid(), m: m.id, slot, pa: '', pb: '' }; w.pairs.push(p); } p[side] = pid; },
  setScrPlayer(st, L, op) { const w = week(L, op.weekId), m = matchup(w, op.matchupId); const key = op.side === 'b' ? 'scrB' : 'scrA'; const idx = +op.idx; if (![0, 1].includes(idx)) throw err('Bad slot'); const pid = str(op.playerId, 20); if (pid && (L.players.find(p => p.id === pid) || {}).team !== (key === 'scrA' ? m.a : m.b)) throw err('That player is not on that team'); m[key] = m[key] || ['', '']; m[key][idx] = pid; },
  setForfeit(st, L, op) { const w = week(L, op.weekId), m = matchup(w, op.matchupId); if (!['a', 'b', 'tie'].includes(op.winner)) throw err('Pick an outcome first'); m.forfeit = { winner: op.winner, reason: str(op.reason, 120) }; },
  clearForfeit(st, L, op) { const w = week(L, op.weekId), m = matchup(w, op.matchupId); delete m.forfeit; },
  // ----- schedule -----
  addWeek(st, L, op) { if (!isDate(op.date)) throw err('Pick a date for the week'); if (L.weeks.find(w => w.date === op.date)) throw err('There is already a week on that date'); const type = WTYPES.includes(op.weekType) ? op.weekType : 'Regular'; const w = { id: uid(), date: op.date, type, sc: {}, matchups: [], pairs: [] }; L.weeks.push(w); return { weekId: w.id }; },
  setWeekType(st, L, op) { const w = week(L, op.weekId); if (!WTYPES.includes(op.weekType)) throw err('Unknown week format'); w.type = op.weekType; },
  addMatchup(st, L, op) { const w = week(L, op.weekId); if (op.a === op.b) throw err('Pick two different teams'); if (!L.teams.find(t => t.id === op.a) || !L.teams.find(t => t.id === op.b)) throw err('Team not found'); if (matches(w).some(m => (m.a === op.a && m.b === op.b) || (m.a === op.b && m.b === op.a))) throw err('That matchup is already scheduled this week'); const m = { id: uid(), a: op.a, b: op.b, tee: str(op.tee, 30) }; w.matchups.push(m); return { matchupId: m.id }; },
  deleteMatchup(st, L, op) { const w = week(L, op.weekId); matchup(w, op.matchupId); w.matchups = w.matchups.filter(m => m.id !== op.matchupId); w.pairs = w.pairs.filter(p => p.m !== op.matchupId); },
  setMatchupTee(st, L, op) { const w = week(L, op.weekId); matchup(w, op.matchupId).tee = str(op.tee, 30); },
  deleteWeek(st, L, op) { const w = week(L, op.weekId); L.weeks = L.year.weeks = L.weeks.filter(x => x.id !== w.id); L.trash.weeks.push({ deletedAt: Date.now(), item: w, hadScores: hasScores(w) }); },
  deleteWeekRange(st, L, op) { if (!isDate(op.start) || !isDate(op.end)) throw err('Pick both a start and an end date'); if (op.start > op.end) throw err('The start date must be before the end date'); const gone = L.weeks.filter(w => w.date >= op.start && w.date <= op.end); if (!gone.length) throw err('No weeks found in that date range'); L.year.weeks = L.weeks.filter(w => !gone.includes(w)); gone.forEach(w => L.trash.weeks.push({ deletedAt: Date.now(), item: w, hadScores: hasScores(w) })); return { removed: gone.length }; },
  deleteAllWeeks(st, L, op) { const gone = L.weeks; L.year.weeks = []; gone.forEach(w => L.trash.weeks.push({ deletedAt: Date.now(), item: w, hadScores: hasScores(w) })); return { removed: gone.length }; },
  generateSchedule(st, L, op) {
    if (!isDate(op.startDate)) throw err('Pick a season start date first');
    if (L.teams.length < 2) throw err('Add at least 2 teams on the Roster tab first');
    const fmt = WTYPES.includes(op.weekType) ? op.weekType : 'Regular', rr = roundRobin(L.teams.map(t => t.id));
    let nw = 0, nm = 0; const teeSum = {}, teeCount = {}; L.teams.forEach(t => { teeSum[t.id] = 0; teeCount[t.id] = 0; });
    const avgRank = id => teeCount[id] ? teeSum[id] / teeCount[id] : 0;
    rr.forEach((roundPairs, r) => {
      const dateStr = addDays(op.startDate, r * 7);
      let wk = L.weeks.find(x => x.date === dateStr);
      if (!wk) { wk = { id: uid(), date: dateStr, type: fmt, sc: {}, matchups: [], pairs: [] }; L.weeks.push(wk); nw++; }
      else { if (hasScores(wk)) throw err(`The week of ${dateStr} already has scores entered. Delete it first if you really want to regenerate.`); wk.matchups = []; wk.pairs = []; delete wk.bye; }
      const real = roundPairs.filter(p => p[0] && p[1]), byePair = roundPairs.find(p => !p[0] || !p[1]);
      if (byePair) wk.bye = byePair[0] || byePair[1];
      const ordered = [...real].sort((a, b) => Math.max(avgRank(b[0]), avgRank(b[1])) - Math.max(avgRank(a[0]), avgRank(a[1])));
      ordered.forEach((pair, i) => { const mins = 972 + 9 * i; wk.matchups.push({ id: uid(), a: pair[0], b: pair[1], tee: to12h(Math.floor(mins / 60) % 24, mins % 60) }); nm++; [pair[0], pair[1]].forEach(tid => { teeSum[tid] += i; teeCount[tid]++; }); });
    });
    return { weeks: rr.length, matchups: nm, newWeeks: nw };
  },
  // ----- roster -----
  addTeam(st, L, op) { const name = str(op.name, 40); if (!name) throw err('Type a team name first'); if (L.teams.some(t => t.name.toLowerCase() === name.toLowerCase())) throw err('There is already a team with that name'); const t = { id: uid(), name }; L.teams.push(t); return { teamId: t.id }; },
  renameTeam(st, L, op) { const t = L.teams.find(x => x.id === op.teamId); if (!t) throw err('Team not found'); const name = str(op.name, 40); if (!name) throw err('A team name can\'t be empty'); t.name = name; },
  deleteTeam(st, L, op) {
    const t = L.teams.find(x => x.id === op.teamId); if (!t) throw err('Team not found');
    const players = L.players.filter(p => p.team === t.id), removed = [];
    L.year.teams = L.teams.filter(x => x.id !== t.id); L.year.players = L.players.filter(p => p.team !== t.id);
    L.year.weeks.forEach(w => { const bad = matches(w).filter(m => m.a === t.id || m.b === t.id); if (bad.length) { removed.push({ weekId: w.id, matchups: bad, pairs: w.pairs.filter(p => bad.some(m => m.id === p.m)) }); w.matchups = w.matchups.filter(m => !bad.includes(m)); w.pairs = w.pairs.filter(p => !bad.some(m => m.id === p.m)); } if (w.bye === t.id) delete w.bye; });
    L.playoffs.seeds = L.playoffs.seeds.filter(id => id !== t.id);
    L.trash.teams.push({ deletedAt: Date.now(), item: t, players, removed });
  },
  addPlayer(st, L, op) { const name = str(op.name, 60); if (!name) throw err('Type the player\'s name first'); if (!L.teams.find(t => t.id === op.team)) throw err('Pick a team for the player'); const id = uid(); L.players.push({ id, person: id, name, team: op.team, email: str(op.email, 120), phone: str(op.phone, 30), hcp0: clampHcp(op.hcp0), role: 'player' }); return { playerId: id }; },
  editPlayer(st, L, op) {
    const p = L.players.find(x => x.id === op.playerId); if (!p) throw err('Player not found'); const f = op.fields || {};
    if ('name' in f) { const n = str(f.name, 60); if (!n) throw err('A player\'s name can\'t be empty'); p.name = n; }
    if ('email' in f) p.email = str(f.email, 120); if ('phone' in f) p.phone = str(f.phone, 30);
    if ('hcp0' in f) p.hcp0 = clampHcp(f.hcp0);
    if ('team' in f) { if (!L.teams.find(t => t.id === f.team)) throw err('Team not found'); if (p.team !== f.team) { p.team = f.team; L.year.weeks.forEach(w => { w.pairs.forEach(x => { if (x.pa === p.id) x.pa = ''; if (x.pb === p.id) x.pb = ''; }); matches(w).forEach(m => { ['scrA', 'scrB'].forEach(k => { if (m[k]) m[k] = m[k].map(id => id === p.id ? '' : id); }); }); }); } }
    if ('role' in f) { if (!ROLES.includes(f.role)) throw err('Unknown role'); p.role = f.role; }
  },
  deletePlayer(st, L, op) { const p = L.players.find(x => x.id === op.playerId); if (!p) throw err('Player not found'); if (roleOf(p) === 'commissioner' && L.players.filter(x => roleOf(x) === 'commissioner').length === 1) throw err('The league needs at least one Commissioner. Make someone else Commissioner first.'); L.year.players = L.players.filter(x => x.id !== p.id); L.year.weeks.forEach(w => { w.pairs.forEach(x => { if (x.pa === p.id) x.pa = ''; if (x.pb === p.id) x.pb = ''; }); matches(w).forEach(m => { ['scrA', 'scrB'].forEach(k => { if (m[k]) m[k] = m[k].map(id => id === p.id ? '' : id); }); }); }); L.eoyGroups.forEach(g => { g.players = g.players.filter(id => id !== p.id); }); L.trash.players.push({ deletedAt: Date.now(), item: p }); },
  restoreTrash(st, L, op) {
    const kind = op.kind, list = L.trash[kind]; if (!list) throw err('Nothing to restore');
    const i = list.findIndex(t => t.item.id === op.id); if (i < 0) throw err('That item is no longer in Recently deleted');
    const [t] = list.splice(i, 1);
    if (kind === 'weeks') { if (L.weeks.find(w => w.date === t.item.date)) throw err('There is already a week on that date now. Delete it first to restore this one.'); L.year.weeks.push(t.item); }
    if (kind === 'players') { if (!L.teams.find(x => x.id === t.item.team)) throw err('That player\'s team no longer exists. Restore the team first.'); L.year.players.push(t.item); }
    if (kind === 'teams') { L.year.teams.push(t.item); t.players.forEach(p => { if (!L.players.find(x => x.id === p.id)) L.year.players.push(p); }); (t.removed || []).forEach(r => { const w = L.weeks.find(x => x.id === r.weekId); if (w) { w.matchups.push(...r.matchups); w.pairs.push(...r.pairs); } }); }
  },
  emptyTrash(st, L, op) { L.year.trash = { weeks: [], teams: [], players: [] }; },
  // ----- course, years, settings -----
  setCourse(st, L, op) { const par = (op.par || []).map(v => Math.max(3, Math.min(6, Math.round(+v) || 4))), hcp = (op.hcp || []).map(v => Math.max(1, Math.min(18, Math.round(+v) || 1))); if (par.length !== HOLES || hcp.length !== HOLES) throw err('The course needs 9 holes'); st.course = { par, hcp }; },
  setLeagueName(st, L, op) { const n = str(op.name, 60); if (!n) throw err('The league needs a name'); st.settings.leagueName = n; },
  setPlayoffSize(st, L, op) { const n = Math.round(+op.size); if (!(n >= MIN_PLAYOFF && n <= MAX_PLAYOFF)) throw err(`Playoff size must be between ${MIN_PLAYOFF} and ${MAX_PLAYOFF}`); st.settings.playoffSize = n; L.playoffs.links = {}; L.playoffs.overrides = {}; },
  switchYear(st, L, op) { if (!st.years.find(y => y.id === op.yearId)) throw err('League Year not found'); st.activeYearId = op.yearId; },
  newYear(st, L, op) {
    const label = str(op.label, 20); if (!label) throw err('Name the new League Year first (e.g. 2027)');
    if (st.years.some(y => y.label.toLowerCase() === label.toLowerCase())) throw err('That League Year name is already used');
    const c = calc(L), y = emptyYear(label), idMap = {};
    y.teams = L.teams.map(t => { const nid = uid(); idMap[t.id] = nid; return { id: nid, name: t.name }; });
    y.players = L.players.map(p => ({ id: uid(), person: personOf(p), name: p.name, team: idMap[p.team] || '', email: p.email || '', phone: p.phone || '', hcp0: c.cur[p.id] != null ? c.cur[p.id] : clampHcp(p.hcp0), role: roleOf(p) }));
    st.years.push(y); st.activeYearId = y.id; return { yearId: y.id };
  },
  deleteYear(st, L, op) { if (st.years.length <= 1) throw err('You need at least one League Year. Create a new one before deleting this.'); const y = st.years.find(x => x.id === op.yearId); if (!y) throw err('League Year not found'); st.years = st.years.filter(x => x.id !== y.id); if (st.activeYearId === y.id) st.activeYearId = st.years[st.years.length - 1].id; },
  // ----- playoffs -----
  generateSeeds(st, L, op) { const ord = seedOrder(L, calc(L)), P = playoffSize(L); if (ord.length < P) throw err(`The playoffs are set to ${P} teams but the league has ${ord.length}. Change the playoff size on the League tab.`); L.playoffs.seeds = ord.slice(0, P).map(x => x.id); L.playoffs.links = {}; L.playoffs.overrides = {}; },
  moveSeed(st, L, op) { const po = L.playoffs, i = +op.index, j = i + (+op.dir); if (!(i >= 0 && i < po.seeds.length && j >= 0 && j < po.seeds.length)) throw err('Bad seed move'); const t = po.seeds[i]; po.seeds[i] = po.seeds[j]; po.seeds[j] = t; po.links = {}; po.overrides = {}; },
  linkSlot(st, L, op) {
    const slotId = str(op.slotId, 10); if (!isDate(op.date)) throw err('Pick a date first');
    const { rounds } = bracketSlots(Math.min(playoffSize(L), L.playoffs.seeds.length)); if (!rounds.flat().find(s => s.id === slotId)) throw err('Bad bracket slot');
    if (!L.teams.find(t => t.id === op.teamA) || !L.teams.find(t => t.id === op.teamB)) throw err('Team not found');
    let wk = L.weeks.find(x => x.date === op.date); if (!wk) { wk = { id: uid(), date: op.date, type: 'Regular', sc: {}, matchups: [], pairs: [] }; L.weeks.push(wk); }
    let m = matches(wk).find(x => (x.a === op.teamA && x.b === op.teamB) || (x.a === op.teamB && x.b === op.teamA));
    const tee = str(op.tee, 30); if (!m) { m = { id: uid(), a: op.teamA, b: op.teamB, tee }; wk.matchups.push(m); } else if (tee) m.tee = tee;
    L.playoffs.links[slotId] = { weekId: wk.id, matchupId: m.id };
  },
  unlinkSlot(st, L, op) { delete L.playoffs.links[str(op.slotId, 10)]; },
  setOverride(st, L, op) { if (!L.teams.find(t => t.id === op.teamId)) throw err('Team not found'); L.playoffs.overrides[str(op.slotId, 10)] = op.teamId; },
  clearOverride(st, L, op) { delete L.playoffs.overrides[str(op.slotId, 10)]; },
  resetPlayoffs(st, L, op) { L.year.playoffs = normPO(); },
  // ----- year-end outing -----
  setRsvp(st, L, op) { const p = L.players.find(x => x.id === op.playerId); if (!p) throw err('Player not found'); if (!['eoyScramble', 'eoyBanquet'].includes(op.key)) throw err('Bad RSVP'); p[op.key] = !!op.value; },
  generateGroups(st, L, op) { const size = Math.max(2, Math.min(8, Math.round(+op.size) || 4)); L.year.eoyGroupSize = size; const groups = buildGroups(L, calc(L), size, uid); if (!groups.length) throw err('No one has said yes to the Scramble yet'); L.year.eoyGroups = groups; return { groups: groups.length }; },
  swapGroupPlayers(st, L, op) { let ga, ia = -1, gb, ib = -1; L.eoyGroups.forEach(g => { const i = g.players.indexOf(op.a); if (i >= 0) { ga = g; ia = i; } const j = g.players.indexOf(op.b); if (j >= 0) { gb = g; ib = j; } }); if (!ga || !gb) throw err('Player not in a group'); ga.players[ia] = op.b; gb.players[ib] = op.a; },
  setGroupTee(st, L, op) { const g = L.eoyGroups.find(x => x.id === op.groupId); if (!g) throw err('Group not found'); g.tee = str(op.tee, 30); },
  clearGroups(st, L, op) { L.year.eoyGroups = []; },
  // ----- backup -----
  restoreBackup(st, L, op) { const next = migrate(JSON.parse(JSON.stringify(op.state || null))); const why = validateState(next); if (why) throw err('That backup file is not valid: ' + why); for (const k of Object.keys(st)) delete st[k]; Object.assign(st, next); },
};

export const OP_TYPES = Object.keys(OPS);

/** Apply op to st in place. Throws an Error with .status 400 on a bad op. Returns any result info. */
export function applyOp(st, op) {
  if (!op || typeof op !== 'object' || !OPS[op.type]) throw err('Unknown operation');
  const L = view(st);
  return OPS[op.type](st, L, op) || {};
}

// ---------- validation ----------
const isId = v => typeof v === 'string' && v.length > 0 && v.length <= 24;
const isStr = (v, max) => typeof v === 'string' && v.length <= max;
const isCard = a => Array.isArray(a) && a.length === HOLES && a.every(v => v === '' || (Number.isInteger(v) && v >= 1 && v <= 15));

/** Returns null if the state is well-formed, otherwise a reason. */
export function validateState(st) {
  try {
    if (!st || typeof st !== 'object') return 'no data';
    if (!st.settings || !isStr(st.settings.leagueName, 60) || !st.settings.leagueName) return 'league name';
    const ps = +st.settings.playoffSize; if (!(ps >= MIN_PLAYOFF && ps <= MAX_PLAYOFF)) return 'playoff size';
    if (!st.course || !Array.isArray(st.course.par) || st.course.par.length !== HOLES || !st.course.par.every(v => Number.isInteger(v) && v >= 3 && v <= 6)) return 'course par';
    if (!Array.isArray(st.course.hcp) || st.course.hcp.length !== HOLES || !st.course.hcp.every(v => Number.isInteger(v) && v >= 1 && v <= 18)) return 'course stroke index';
    if (!Array.isArray(st.years) || !st.years.length || st.years.length > 50) return 'years';
    if (!st.years.find(y => y.id === st.activeYearId)) return 'active year';
    const ylabels = new Set();
    for (const y of st.years) {
      if (!isId(y.id) || !isStr(y.label, 20) || !y.label) return 'year label';
      if (ylabels.has(y.id)) return 'duplicate year id'; ylabels.add(y.id);
      if (!Array.isArray(y.teams) || y.teams.length > 64) return 'teams';
      const tids = new Set(); for (const t of y.teams) { if (!isId(t.id) || tids.has(t.id) || !isStr(t.name, 40) || !t.name.trim()) return 'team'; tids.add(t.id); }
      if (!Array.isArray(y.players) || y.players.length > 500) return 'players';
      const pids = new Set();
      for (const p of y.players) {
        if (!isId(p.id) || pids.has(p.id) || !isId(p.person) || !isStr(p.name, 60) || !p.name.trim()) return 'player';
        pids.add(p.id); if (p.team && !tids.has(p.team)) return `player ${p.name} has an unknown team`;
        if (!isStr(p.email || '', 120) || !isStr(p.phone || '', 30)) return 'player contact';
        if (!Number.isInteger(p.hcp0) || p.hcp0 < 0 || p.hcp0 > MAX_HCP) return 'starting handicap';
        if (!ROLES.includes(roleOf(p))) return 'role';
      }
      if (!y.players.some(p => roleOf(p) === 'commissioner')) return 'every League Year needs a Commissioner';
      if (!Array.isArray(y.weeks) || y.weeks.length > 200) return 'weeks';
      const wids = new Set(), dates = new Set();
      for (const w of y.weeks) {
        if (!isId(w.id) || wids.has(w.id) || !isDate(w.date) || dates.has(w.date) || !WTYPES.includes(w.type)) return 'week';
        wids.add(w.id); dates.add(w.date);
        if (w.bye && !tids.has(w.bye)) return 'bye team';
        if (!w.sc || typeof w.sc !== 'object') return 'scores';
        for (const [pid, card] of Object.entries(w.sc)) { if (!isId(pid) || !isCard(card)) return 'scorecard'; }
        if (!Array.isArray(w.matchups) || w.matchups.length > 64) return 'matchups';
        const mids = new Set();
        for (const m of w.matchups) {
          if (!isId(m.id) || mids.has(m.id) || !tids.has(m.a) || !tids.has(m.b) || m.a === m.b || !isStr(m.tee || '', 30)) return 'matchup';
          mids.add(m.id);
          if (m.forfeit && (!['a', 'b', 'tie'].includes(m.forfeit.winner) || !isStr(m.forfeit.reason || '', 120))) return 'forfeit';
          for (const k of ['scrA', 'scrB']) if (m[k] && (!Array.isArray(m[k]) || m[k].length !== 2 || !m[k].every(id => id === '' || pids.has(id)))) return 'team players';
          for (const k of ['scA', 'scB']) if (m[k] && !isCard(m[k])) return 'team scorecard';
        }
        if (!Array.isArray(w.pairs)) return 'pairs';
        for (const p of w.pairs) { if (!isId(p.id) || !mids.has(p.m) || ![0, 1].includes(p.slot) || !(p.pa === '' || pids.has(p.pa)) || !(p.pb === '' || pids.has(p.pb))) return 'pair'; }
      }
      const po = y.playoffs; if (!po || !Array.isArray(po.seeds) || !po.seeds.every(id => tids.has(id)) || new Set(po.seeds).size !== po.seeds.length) return 'seeds';
      if (typeof po.links !== 'object' || typeof po.overrides !== 'object') return 'playoffs';
      for (const l of Object.values(po.links)) if (!l || !isId(l.weekId) || !isId(l.matchupId)) return 'playoff link';
      for (const t of Object.values(po.overrides)) if (!tids.has(t)) return 'playoff winner';
      if (!Array.isArray(y.eoyGroups)) return 'groups';
      for (const g of y.eoyGroups) if (!isId(g.id) || !isStr(g.tee || '', 30) || !Array.isArray(g.players) || !g.players.every(id => pids.has(id))) return 'group';
      if (!y.trash || !['weeks', 'teams', 'players'].every(k => Array.isArray(y.trash[k]) && y.trash[k].length <= 500)) return 'trash';
    }
    return null;
  } catch (e) { return 'unexpected shape'; }
}

/** Size guard: the league must stay well under the 1 MB request cap. */
export function tooBig(st) { return JSON.stringify(st).length > 900_000; }
