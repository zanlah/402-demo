import { S } from '../core/state.js';
import { $, esc, pct, dateTime, CH_ICON, OUTCOME } from '../core/format.js';

export function progressView() {
  const u = S.state.user;
  const h = u.history;
  const reported = h.filter((x) => x.outcome === 'success').length;
  const avgMs = h.length ? h.reduce((s, x) => s + x.responseMs, 0) / h.length : 0;
  const tactics = Object.entries(u.stats);
  return `
    <div class="row-actions page-actions"><button class="btn primary" data-next-learning>Naslednja vaja →</button></div><h1>Moj napredek</h1>
    <p class="sub">${esc(u.name)} · psevdonim ${esc(u.id)} · ${esc(u.role)}, oddelek ${esc(u.department)}</p>
    <div class="grid cols-4">
      <div class="card stat"><div class="label">Stopnja težavnosti</div><div class="value">${u.level} / 5</div><div class="meter"><i style="width:${u.level * 20}%"></i></div></div>
      <div class="card stat"><div class="label">Točke budnosti</div><div class="value">${u.points}</div><div class="hint">+10 za vsako prijavo, več za hitro prijavo</div></div>
      <div class="card stat"><div class="label">Prepoznane simulacije</div><div class="value">${reported} / ${h.length}</div><div class="hint">${h.length ? pct(reported / h.length) : '–'} uspešnost</div></div>
      <div class="card stat"><div class="label">Povprečen čas odziva</div><div class="value">${h.length ? Math.max(1, Math.round(avgMs / 1000)) + ' s' : '–'}</div><div class="hint">od odprtja do dejanja</div></div>
    </div>
    <div class="grid cols-2" style="margin-top:16px">
      <div class="card">
        <h2>Odpornost po taktikah</h2>
        ${tactics.map(([k, s]) => {
          const rate = s.seen ? s.reported / s.seen : 0;
          return `<div class="bar-row"><span>${esc(S.state.tactics[k].label)}</span><div class="bar"><i style="width:${rate * 100}%;background:${s.failed ? 'var(--warn)' : 'var(--ok)'}"></i></div><span class="small muted">${s.seen ? `${s.reported}/${s.seen}` : 'novo'}</span></div>`;
        }).join('')}
        <p class="small muted" style="margin-bottom:0">Naslednje vaje utrjujejo veščine, ki jih še vadite, in postopoma uvajajo nove taktike.</p>
      </div>
      <div class="card">
        <h2>Zasebnost</h2>
        <p style="margin-top:0">Vaši posamični rezultati so vidni samo vam. Skrbnik vidi skupinske kazalnike kampanj z vsaj 5 prejemniki in 5 različnimi sodelujočimi.</p>
        <p>Zunanji agenti nikoli ne prejmejo vašega imena, e-poštnega naslova ali vsebine nabiralnika. Prejmejo le vlogo, oddelek, jezik in težavnost.</p>
        <p class="muted small" style="margin-bottom:0">Vaj je največ ${S.state.sims.max} na mesec. Osebne odgovore hranimo največ ${S.state.retentionDays} dni; v prototipu se izbrišejo tudi ob ponovnem zagonu.</p>
      </div>
    </div>
    <div class="card" style="margin-top:16px">
      <h2>Zgodovina simulacij</h2>
      ${h.length ? `<div class="table-wrap"><table>
        <tr><th>Čas</th><th>Sporočilo</th><th>Taktika</th><th>Težavnost</th><th>Vaše dejanje</th><th>Izid</th></tr>
        ${h.map((x) => `<tr><td>${dateTime(x.at)}</td><td>${CH_ICON[x.channel]} ${esc(x.subject === 'SMS' || x.subject === 'Teams' ? S.state.channels[x.channel] : x.subject)}</td><td><span class="chip">${esc(S.state.tactics[x.tactic].label)}</span></td><td>${x.difficulty}/5</td><td>${esc(x.action)}${x.explanation ? `<div class="small muted">Vaša razlaga: ${esc(x.explanation)}</div>` : ''}</td><td><span class="chip ${OUTCOME[x.outcome][0]}">${OUTCOME[x.outcome][1]}</span></td></tr>`).join('')}
      </table></div>` : `<p class="muted">Še ni odzivov. V nabiralniku se skriva simulacija. Jo najdete?</p>`}
    </div>`;
}
