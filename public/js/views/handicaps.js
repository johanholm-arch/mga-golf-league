// Handicaps: current 9-hole handicap per player with the rounds behind it.
import { core } from '../core.js';
import { teamPlayers } from '../rules.js';
import { esc, sg } from '../ui.js';

export function render() {
  const L = core.L, c = core.c;
  if (!L.players.length) return '<div class="card empty">No players yet.</div>';
  const grp = t => {
    const ps = teamPlayers(L, t.id).sort((a, b) => (c.cur[a.id] ?? 99) - (c.cur[b.id] ?? 99) || a.name.localeCompare(b.name)); if (!ps.length) return '';
    return `<div class="card"><h2>${esc(t.name)}</h2><div class="scroll"><table><tr><th>Player</th><th class="n">Handicap</th><th class="n">Rounds</th><th>Last 5 rounds (vs par)</th></tr>${ps.map(p => { const d = c.hist[p.id] || []; return `<tr><td>${esc(p.name)}</td><td class="n big">${c.cur[p.id] ?? '–'}</td><td class="n">${d.length}</td><td>${d.slice(-5).map(sg).join(', ') || `<span class="muted">none yet (starting handicap ${p.hcp0})</span>`}</td></tr>`; }).join('')}</table></div></div>`;
  };
  return L.teams.map(grp).join('') + grp({ id: '', name: 'No team' })
    + `<div class="card"><details open><summary>How handicaps work</summary><div class="small muted"><p>Your handicap is on the 9-hole scale: 90% of your average score against par over your last 5 rounds, rounded to a whole number, from 0 to 18.</p><p>Until you have played a round, your handicap is the starting handicap entered on the Roster. Scramble and Alternate Shot weeks do not count towards handicaps. Playoff matches do not either.</p></div></details></div>`;
}
