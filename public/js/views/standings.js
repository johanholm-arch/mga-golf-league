// Standings: what every member looks at first. Kept to the columns that decide the season.
import { core } from '../core.js';
import { standings, playoffSize, sortedWeeks, matches } from '../rules.js';
import { esc, pts, fmtShort } from '../ui.js';

export function render() {
  const L = core.L, c = core.c, rows = standings(L, c), P = playoffSize(L);
  if (!L.teams.length) return `<div class="card empty">No teams yet.${core.me && core.me.role === 'commissioner' ? ' Add teams and players on the <b>Roster</b> tab to get started.' : ' The Commissioner adds teams on the Roster tab.'}</div>`;
  const W = sortedWeeks(L), played = W.filter(w => Object.keys(c.res[w.id] || {}).length || matches(w).some(m => m.forfeit)).length;
  const br = 2 ** Math.ceil(Math.log2(Math.max(2, P))), direct = br - P;   // teams that skip the play-in
  const status = i => i >= P ? ['out', 'Out'] : (br !== P && i >= direct) ? ['playin', 'Play-in'] : ['in', 'In'];
  const any = rows.some(r => r.mw);
  let h = `<div class="card"><h2>Team standings</h2>`;
  h += `<p class="muted small">${played ? `After ${played} of ${W.length} weeks.` : 'No results yet.'} ${L.teams.length >= P ? `Top ${P} make the playoffs${br !== P ? ` (seeds ${direct + 1} to ${P} play in)` : ''}.` : ''}</p>`;
  h += `<div class="scroll"><table><tr><th class="n">#</th><th>Team</th><th class="n">Points</th><th class="n">Record</th><th class="n">Last week</th><th>Playoffs</th></tr>`;
  h += rows.map((r, i) => { const [cls, txt] = status(i); return `<tr><td class="n">${i + 1}</td><td><b>${esc(r.n)}</b></td><td class="n big">${pts(r.pts)}</td><td class="n">${r.mw ? `${r.win}–${r.mw - r.win}` : '–'}</td><td class="n">${r.last == null ? '–' : pts(r.last)}</td><td>${L.teams.length >= P ? `<span class="status ${cls}">${txt}</span>` : ''}</td></tr>`; }).join('');
  h += `</table></div>`;
  h += `<details><summary>How points work</summary><div class="small muted"><p>Each week's matchup is worth 3 points: 1 for each of the two pairs' matches and 1 Team Point for the lowest net score on each hole. A tied match splits the point.</p><p>Scramble and Alternate Shot weeks are worth 3 points to the team with the lower net score (1.5 each on a tie). A forfeit gives all 3 points to the other team.</p><p>Ties in the standings are broken by total net score against par. More team statistics are on the <b>Stats</b> tab.</p></div></details></div>`;
  if (!any) h += `<div class="card empty">Points appear here once the first scorecards are complete.</div>`;
  return h;
}
