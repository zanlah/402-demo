import { S } from '../core/state.js';
import { api } from '../core/api.js';
import { $, esc, usdc, pct, dateTime, STATUS_CHIP } from '../core/format.js';
import { on } from '../core/events.js';

export async function loadOrg() {
  [S.data.org, S.data.reports] = await Promise.all([api('/api/org'), api('/api/campaign-reports')]);
}

function sparkline(vals) {
  if (!vals.length) return '';
  const w = 90, h = 24;
  const pts = vals.map((v, i) => `${(i / (vals.length - 1)) * w},${h - v * h}`).join(' ');
  return `<svg width="${w}" height="${h}" viewBox="0 -2 ${w} ${h + 4}"><polyline points="${pts}" fill="none" stroke="var(--ok)" stroke-width="2" stroke-linejoin="round"/></svg>`;
}

export function orgView() {
  const o = S.data.org;
  return `
    <span class="eyebrow">PREGLED USPOSABLJANJA</span><h1>Rezultati skupin</h1>
    <p class="sub">Preglejte izvedene kampanje in odzive skupin. Učni kazalniki se prikažejo šele pri najmanj ${o.kThreshold} prejemnikih in ${o.kThreshold} različnih sodelujočih.</p>
    ${campaignReportsHtml()}
    <details class="card sample-analytics"><summary>Vzorčna analitika organizacije · ilustrativni podatki</summary><p class="muted">Spodnje številke ponazarjajo prikaz večje organizacije. Niso rezultati vaših kampanj.</p><div class="grid cols-4">
      <div class="card stat"><div class="label">Vključenih zaposlenih</div><div class="value">${o.employees}</div></div>
      <div class="card stat"><div class="label">Stopnja prijav</div><div class="value">${pct(o.reportRate)}</div><div class="hint">ključni kazalnik vedenja</div></div>
      <div class="card stat"><div class="label">Stopnja klikov</div><div class="value">${pct(o.clickRate)}</div></div>
      <div class="card stat"><div class="label">Mediani čas do prijave</div><div class="value">${o.medianMinutes} min</div></div>
    </div>
    <div class="card" style="margin-top:16px">
      <h2>Po oddelkih</h2>
      <div class="table-wrap"><table>
        <tr><th>Oddelek</th><th>Oseb</th><th>Prijave</th><th>Kliki</th><th>Čas do prijave</th><th>Trend prijav (${o.months[0]}–${o.months.at(-1)})</th><th>Najšibkejša taktika</th></tr>
        ${o.departments.map((d) => d.hidden
          ? `<tr class="rejected"><td>${esc(d.name)}</td><td>${d.n}</td><td colspan="5"><span class="chip">Skrito zaradi anonimnosti (manj kot ${o.kThreshold} oseb)</span></td></tr>`
          : `<tr><td><b>${esc(d.name)}</b></td><td>${d.n}</td><td>${pct(d.report)}</td><td>${pct(d.click)}</td><td>${d.minutes} min</td><td>${sparkline(d.trend)}</td><td><span class="chip warn">${esc(d.weakLabel)}</span></td></tr>`).join('')}
      </table></div>
    </div>
    <div class="card" style="margin-top:16px">
      <h2>Ranljivost po taktikah (delež klikov)</h2>
      ${o.tactics.map((t) => `<div class="bar-row"><span>${esc(t.label)}</span><div class="bar"><i style="width:${t.clickRate * 100 * 2}%;background:var(--warn)"></i></div><span class="small">${pct(t.clickRate)}</span></div>`).join('')}
      <p class="small muted" style="margin-bottom:0">Merimo vedenje (prijave, čas odziva), ne le klikov, saj je prijava tisto, kar organizacijo dejansko zaščiti.</p>
    </div></details>`;
}
function campaignReportsHtml() {
  const reports = S.data.reports || [];
  return `<div class="row-actions page-actions"><a class="btn primary" href="#/agent">Nova kampanja →</a><a class="btn" href="#/skupine">Uredi skupine</a></div><section class="card"><div class="section-heading"><h2>Izvedene in načrtovane kampanje</h2><button class="btn sm" data-export-reports ${reports.length ? '' : 'disabled'}>Izvozi CSV</button></div>${reports.length ? `<div class="table-wrap"><table><tr><th>Kampanja / skupina</th><th>Prejemniki</th><th>Stanje</th><th>Strošek</th><th>Prijave</th><th>Kliki</th><th>Mediani odziv</th></tr>${reports.map(r => `<tr><td><b>${esc(r.name)}</b><div class="small muted">${esc(r.groupName)} · ${dateTime(r.createdAt)}</div></td><td>${r.recipients}</td><td><span class="chip ${STATUS_CHIP[r.status]?.[0] || ''}">${esc(STATUS_CHIP[r.status]?.[1] || r.status)}</span><div class="small muted">Dostavljeno: ${r.delivered}</div></td><td>${usdc(r.cost)}</td>${r.hidden ? '<td colspan="3"><span class="chip">Rezultati skriti</span><div class="small muted">Potrebnih je najmanj 5 prejemnikov in 5 različnih sodelujočih.</div></td>' : `<td>${pct(r.reportRate)}</td><td>${pct(r.clickRate)}</td><td>${r.medianSeconds === null ? '–' : `${r.medianSeconds} s`}</td>`}</tr>`).join('')}</table></div>` : '<div class="empty-state"><h3>Tu bodo rezultati vaših kampanj.</h3><p>Uvozite zaposlene, ustvarite skupino in odobrite prvo kampanjo.</p><a href="#/uporabniki" class="btn">Začni z uvozom →</a></div>'}<p class="small muted">Osebnih odgovorov skrbnik ne vidi. Poročilo vsebuje podatke kampanj iz trenutnega zagona prototipa.</p></section>`;
}
function exportReports() {
  const rows = [['Kampanja', 'Skupina', 'Prejemniki', 'Dostavljeno', 'Strošek USDC', 'Prijave', 'Kliki', 'Mediani odziv (s)'], ...S.data.reports.map(r => [r.name, r.groupName, r.recipients, r.delivered, r.cost, r.hidden ? 'Skrito' : pct(r.reportRate), r.hidden ? 'Skrito' : pct(r.clickRate), r.hidden ? 'Skrito' : r.medianSeconds ?? ''])];
  const csv = '\uFEFF' + rows.map(row => row.map(v => '"' + String(v).replace(/^[=+@-]/, "'$&").replaceAll('"', '""') + '"').join(';')).join('\r\n');
  const url = URL.createObjectURL(new Blob([csv], { type: 'text/csv;charset=utf-8' }));
  const a = document.createElement('a'); a.href = url; a.download = 'porocilo-kampanj.csv'; a.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

export function bindReportsEvents() {
  on('click', '[data-export-reports]', exportReports);
}
