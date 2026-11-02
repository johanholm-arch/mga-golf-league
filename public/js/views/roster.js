// Roster: teams and players. Everyone can look; what you can edit depends on your role.
import { core, send, isCommish, isCaptain, myPlayer, render as rerender } from '../core.js';
import { api } from '../api.js';
import { teamPlayers, personOf, roleOf } from '../rules.js';
import { $, esc, attr, field, options, plural, confirmDialog, toast, showError } from '../ui.js';

const ROLE_OPTS = [{ value: 'player', label: 'Player' }, { value: 'captain', label: 'Captain' }, { value: 'commissioner', label: 'Commissioner' }];
const canEditTeam = t => isCommish() || (isCaptain() && myPlayer() && myPlayer().team === t.id);

export function render() {
  const L = core.L, me = myPlayer();
  let h = `<div class="card tight"><div class="row center"><span class="pill"><b>${plural(L.teams.length, 'team')}</b></span><span class="pill"><b>${plural(L.players.length, 'player')}</b></span>${isCommish() ? `<span class="muted small">Captains can edit their own team's details. Only you can add or remove teams and players.</span>` : me ? `<span class="muted small">You can edit your own name, phone and email.${isCaptain() ? ' As captain you can also edit your team\'s details.' : ''}</span>` : ''}</div></div>`;
  if (isCommish()) {
    h += `<div class="card"><h2>Add a team</h2><div class="row">${field('Team name', '<input id="tn" maxlength="40" data-enter="addTeam">')}<button class="btn primary" data-act="addTeam">Add team</button></div></div>`;
    h += `<div class="card"><h2>Add a player</h2>${L.teams.length ? `<div class="row">${field('Name', '<input id="pn" maxlength="60" autocomplete="off">')}${field('Team', `<select id="pt">${options(L.teams.map(t => ({ value: t.id, label: t.name })), '')}</select>`)}${field('Starting handicap (9-hole)', '<input id="ph0" type="number" inputmode="numeric" min="0" max="18" class="num" value="0">', '0 to 18. Replaced by their real handicap after their first round.')}</div><div class="row">${field('Phone (optional)', '<input id="pph" type="tel" autocomplete="off" maxlength="30">')}${field('Email (optional)', '<input id="pe" type="email" autocomplete="off" maxlength="120">')}<button class="btn primary" data-act="addPlayer">Add player</button></div>` : '<p class="muted">Add a team first. Every player belongs to a team.</p>'}</div>`;
  }
  if (!L.teams.length) h += '<div class="card empty">No teams yet.</div>';
  for (const t of L.teams) h += teamCard(t);
  const loose = teamPlayers(L, '');
  if (loose.length) h += teamCard({ id: '', name: 'No team' });
  return h;
}

function teamCard(t) {
  const L = core.L, ps = teamPlayers(L, t.id), open = core.ui.expandedTeams.has(t.id), edit = canEditTeam(t) && t.id;
  let h = `<div class="card"><div class="matchhead"><div class="row center" style="margin:0">
    <button class="btn small icon" data-act="toggleTeam" data-team="${attr(t.id)}" aria-expanded="${open}" aria-label="${open ? 'Collapse' : 'Expand'} ${attr(t.name)}">${open ? '▾' : '▸'}</button>
    ${edit ? `<input value="${attr(t.name)}" maxlength="40" data-change="renameTeam" data-team="${attr(t.id)}" aria-label="Team name" style="font-weight:700;font-size:1.1rem;width:14em">` : `<h2 style="margin:0">${esc(t.name)}</h2>`}
    <span class="muted">${plural(ps.length, 'player')}</span></div>
    ${isCommish() && t.id ? `<button class="btn small danger" data-act="deleteTeam" data-team="${attr(t.id)}" data-name="${attr(t.name)}">Delete team</button>` : ''}</div>`;
  if (open) h += ps.length ? playersTable(t, ps) : '<p class="muted">No players on this team yet.</p>';
  return h + '</div>';
}

function playersTable(t, ps) {
  const L = core.L, me = myPlayer();
  const rows = ps.map(p => {
    const mine = me && me.id === p.id, editAll = isCommish(), editSome = editAll || (isCaptain() && me && me.team === p.team) || mine;
    const txt = (k, v) => `<input class="w" value="${attr(v)}" data-change="editPlayer" data-player="${attr(p.id)}" data-field="${k}" aria-label="${k}">`;
    const contact = k => ('email' in p || 'phone' in p) ? (editSome ? txt(k, p[k] || '') : esc(p[k] || '')) : '<span class="muted">–</span>';
    return `<tr><td>${editSome ? txt('name', p.name) : esc(p.name)}</td><td>${contact('phone')}</td><td>${contact('email')}</td>
      <td class="n">${editAll || (isCaptain() && me && me.team === p.team && !mine) ? `<input type="number" inputmode="numeric" min="0" max="18" class="num" value="${p.hcp0}" data-change="editPlayer" data-player="${attr(p.id)}" data-field="hcp0" aria-label="Starting handicap">` : p.hcp0}</td>
      <td>${editAll ? `<select data-change="editPlayer" data-player="${attr(p.id)}" data-field="team">${options(L.teams.map(x => ({ value: x.id, label: x.name })), p.team)}</select>` : esc(t.name)}</td>
      <td>${editAll ? `<select data-change="editPlayer" data-player="${attr(p.id)}" data-field="role">${options(ROLE_OPTS, roleOf(p))}</select>` : esc(ROLE_OPTS.find(r => r.value === roleOf(p)).label)}</td>
      ${editAll ? `<td style="white-space:nowrap">${core.accounts.includes(personOf(p)) && !mine ? `<button class="btn small" data-act="resetLogin" data-person="${attr(personOf(p))}" data-name="${attr(p.name)}">Reset login</button> ` : core.accounts.includes(personOf(p)) ? '' : '<span class="muted small">No account yet</span> '}<button class="btn small danger" data-act="deletePlayer" data-player="${attr(p.id)}" data-name="${attr(p.name)}">Delete</button></td>` : ''}</tr>`;
  }).join('');
  return `<div class="scroll"><table><tr><th>Name</th><th>Phone</th><th>Email</th><th class="n">Start hcp</th><th>Team</th><th>Role</th>${isCommish() ? '<th></th>' : ''}</tr>${rows}</table></div>
    <p class="muted small">Start hcp is the 9-hole starting handicap, used until the player has posted a round.${isCommish() ? ' "Reset login" clears someone\'s PIN so they can set up their account again.' : ''}</p>`;
}

export const actions = {
  toggleTeam(d) { const s = core.ui.expandedTeams; s.has(d.team) ? s.delete(d.team) : s.add(d.team); rerender(true); },
  async addTeam() { const name = $('tn').value.trim(); if (!name) return showError('Type a team name first.'); const r = await send({ type: 'addTeam', name }); if (r) { core.ui.expandedTeams.add(r.result.teamId); rerender(true); toast(`Added ${name}`); } },
  async addPlayer() {
    const name = $('pn').value.trim(); if (!name) return showError('Type the player\'s name first.');
    const r = await send({ type: 'addPlayer', name, team: $('pt').value, email: $('pe').value, phone: $('pph').value, hcp0: $('ph0').value });
    if (r) { core.ui.expandedTeams.add($('pt').value); rerender(true); toast(`Added ${name}`); const i = $('pn'); if (i) i.focus(); }
  },
  async deleteTeam(d) {
    const n = teamPlayers(core.L, d.team).length;
    if (!await confirmDialog({ title: `Delete ${d.name}?`, text: `This removes the team${n ? `, its ${plural(n, 'player')}` : ''} and its matchups from the schedule. You can restore it from Recently deleted on the League tab for 30 days.`, ok: 'Delete team', danger: true })) return;
    if (await send({ type: 'deleteTeam', teamId: d.team })) toast(`${d.name} moved to Recently deleted`);
  },
  async deletePlayer(d) {
    if (!await confirmDialog({ title: `Remove ${d.name} from the Roster?`, text: 'Their past scores stay on the scorecards. You can restore them from Recently deleted on the League tab for 30 days.', ok: 'Remove player', danger: true })) return;
    if (await send({ type: 'deletePlayer', playerId: d.player })) toast(`${d.name} moved to Recently deleted`);
  },
  async resetLogin(d) {
    if (!await confirmDialog({ title: `Reset ${d.name}'s login?`, text: 'Their PIN is cleared and any phone or computer they are signed in on is signed out. They set up their account again on the Account tab with the join code.', ok: 'Reset login' })) return;
    try { await api('/reset', { method: 'POST', body: JSON.stringify({ person: d.person }) }); core.accounts = core.accounts.filter(x => x !== d.person); rerender(true); toast(`${d.name} can now set up a new PIN`); } catch (e) { showError(e.message); }
  },
};
export const changes = {
  renameTeam(d, el) { const name = el.value.trim(); if (!name) { showError('A team name can\'t be empty.'); el.value = core.L.teams.find(t => t.id === d.team).name; return; } send({ type: 'renameTeam', teamId: d.team, name }); },
  editPlayer(d, el) { const v = el.value; send({ type: 'editPlayer', playerId: d.player, fields: { [d.field]: v } }); },
};
