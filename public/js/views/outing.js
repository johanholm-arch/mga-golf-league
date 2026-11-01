// Year-end outing: RSVPs for the scramble and banquet, balanced scramble groups.
import { core, send, isCommish, isCaptain, myPlayer, signedIn } from '../core.js';
import { teamPlayers, pname, teeMinutes } from '../rules.js';
import { $, esc, attr, field, plural, options, confirmDialog, toast, openPrint } from '../ui.js';

const canRsvp = p => { const me = myPlayer(); return isCommish() || (me && (me.id === p.id || (isCaptain() && me.team === p.team))); };

export function render() {
  const L = core.L, c = core.c;
  if (!L.players.length) return '<div class="card empty">No players yet.</div>';
  const tot = L.players.length, nS = L.players.filter(p => p.eoyScramble).length, nB = L.players.filter(p => p.eoyBanquet).length;
  let h = `<div class="card"><h2>Year-end outing</h2>${signedIn() ? '<p class="muted small">Tick the boxes for yourself' + (isCaptain() ? ' or anyone on your team' : '') + '.</p>' : '<p class="notice">Sign in on the Account tab to RSVP.</p>'}<div class="stat"><span class="muted small">Coming to the Scramble</span><b>${nS} / ${tot}</b></div><div class="stat"><span class="muted small">Coming to the Banquet</span><b>${nB} / ${tot}</b></div></div>`;
  const grp = t => { const ps = teamPlayers(L, t.id); if (!ps.length) return ''; return `<div class="card"><h2>${esc(t.name)} <span class="muted small">· ${ps.filter(p => p.eoyScramble).length} scramble, ${ps.filter(p => p.eoyBanquet).length} banquet</span></h2><div class="scroll"><table><tr><th>Player</th><th class="n">Scramble</th><th class="n">Banquet</th></tr>${ps.map(p => `<tr><td>${esc(p.name)}</td>${['eoyScramble', 'eoyBanquet'].map(k => `<td class="n"><input type="checkbox" ${p[k] ? 'checked' : ''} ${canRsvp(p) ? '' : 'disabled'} data-change="rsvp" data-player="${attr(p.id)}" data-key="${k}" aria-label="${esc(p.name)} ${k === 'eoyScramble' ? 'scramble' : 'banquet'}"></td>`).join('')}</tr>`).join('')}</table></div></div>`; };
  h += L.teams.map(grp).join('') + grp({ id: '', name: 'No team' });
  h += groups(c);
  return h;
}

function groups(c) {
  const L = core.L, gs = L.eoyGroups || [];
  let h = `<div class="card"><h2>Scramble groups</h2>`;
  if (isCommish()) h += `<div class="row">${field('Players per group', `<input id="eoy_size" type="number" inputmode="numeric" min="2" max="8" class="num" value="${L.eoyGroupSize || 4}">`)}<button class="btn primary" data-act="genGroups">${gs.length ? 'Regenerate groups' : 'Generate groups'}</button>${gs.length ? '<button class="btn danger" data-act="clearGroups">Clear groups</button>' : ''}</div><p class="muted small">Groups are made from everyone who said yes to the Scramble, balanced by handicap so no group is stacked. Swap players afterwards if you like.</p>`;
  if (gs.length) h += `<div class="row"><button class="btn" data-act="printGroups">Print sign-in sheet</button></div>`;
  if (!gs.length) return h + `<p class="muted">${isCommish() ? 'No groups yet.' : 'Groups appear here once the Commissioner makes them.'}</p></div>`;
  const all = gs.flatMap((g, gi) => g.players.map(pid => ({ pid, gi })));
  gs.forEach((g, gi) => {
    h += `<div class="slot"><div class="matchhead"><div class="teams">Group ${gi + 1}</div>${isCaptain() ? field('Tee time', `<input class="short" value="${attr(g.tee || '')}" placeholder="e.g. 9:00 AM" data-change="groupTee" data-group="${attr(g.id)}">`) : (g.tee ? `<span class="pill">${esc(g.tee)}</span>` : '')}</div>
      <div class="scroll"><table><tr><th>Player</th><th class="n">Handicap</th>${isCommish() ? '<th>Swap with</th>' : ''}</tr>${g.players.map(pid => `<tr><td>${esc(pname(L, pid))}</td><td class="n">${c.cur[pid] ?? '–'}</td>${isCommish() ? `<td><select data-change="swap" data-a="${attr(pid)}" aria-label="Swap ${esc(pname(L, pid))} with">${options(all.filter(x => x.pid !== pid).map(x => ({ value: x.pid, label: `Group ${x.gi + 1} — ${pname(L, x.pid)}` })), '', '— choose —')}</select></td>` : ''}</tr>`).join('')}</table></div></div>`;
  });
  return h + '</div>';
}

export const actions = {
  async genGroups() { const gs = core.L.eoyGroups || []; if (gs.length && !await confirmDialog({ title: 'Regenerate the groups?', text: 'The current groups and any swaps are replaced.', ok: 'Regenerate' })) return; const r = await send({ type: 'generateGroups', size: $('eoy_size').value }); if (r) toast(`Made ${plural(r.result.groups, 'group')}`); },
  async clearGroups() { if (!await confirmDialog({ title: 'Clear the scramble groups?', ok: 'Clear', danger: true })) return; await send({ type: 'clearGroups' }); },
  printGroups() {
    const L = core.L, gs = [...(L.eoyGroups || [])].map((g, i) => ({ g, i })).sort((a, b) => teeMinutes(a.g.tee) - teeMinutes(b.g.tee));
    const rows = gs.map(({ g, i }) => `<tr><td>${esc(g.tee || '—')}</td><td>Group ${i + 1}: ${esc(g.players.map(id => pname(L, id)).join(', '))}</td><td></td><td></td><td></td><td></td></tr>`).join('');
    openPrint(`<!DOCTYPE html><html><head><meta charset="utf-8"><title>Scramble sign-in sheet</title><style>body{font:15px/1.4 Georgia,serif;color:#000;margin:30px}h1{font-size:22px;margin:0 0 2px}table{width:100%;border-collapse:collapse;margin-top:16px;table-layout:fixed}th,td{border:1px solid #000;padding:12px 8px;text-align:left;overflow-wrap:break-word}th{background:#eee;font-size:13px}col.tt{width:11%}col.mu{width:37%}col.pl{width:13%}@media print{body{margin:0}}</style></head><body><h1>${esc(L.settings.leagueName)} — Year-end Scramble</h1><p style="margin:0;color:#333">Sign-in sheet</p><table><colgroup><col class="tt"><col class="mu"><col class="pl"><col class="pl"><col class="pl"><col class="pl"></colgroup><tr><th>Tee time</th><th>Group</th><th></th><th></th><th></th><th></th></tr>${rows}</table><script>window.onload=()=>setTimeout(()=>window.print(),200)<\/script></body></html>`);
  },
};
export const changes = {
  rsvp(d, el) { send({ type: 'setRsvp', playerId: d.player, key: d.key, value: el.checked }); },
  groupTee(d, el) { send({ type: 'setGroupTee', groupId: d.group, tee: el.value }); },
  swap(d, el) { if (el.value) send({ type: 'swapGroupPlayers', a: d.a, b: el.value }); },
};
