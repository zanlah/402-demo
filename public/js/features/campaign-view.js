import { S } from '../core/state.js';
import { $, esc, usdc, dateTime, STATUS_CHIP } from '../core/format.js';

const userName = (id) => S.state.users.find((u) => u.id === id)?.name || id;

export function logHtml() {
  if (!S.runLog.length) return `<p class="muted" style="margin:0">${S.running ? 'Začenjam …' : 'Dnevnik izvajanja se prikaže po odobritvi plana.'}</p>`;
  const icon = { user: '◉', request: '→', http402: '402', policy: '§', sign: '✎', paid: '✓', ok: '✓', error: '!', info: 'i' };
  // najnovejši koraki so na vrhu
  const running = S.running ? `<div class="step"><div class="dot">…</div><div class="muted">v teku</div></div>` : '';
  return running + [...S.runLog].reverse().map((s) => `
    <div class="step">
      <div class="dot ${s.kind}">${icon[s.kind] || '·'}</div>
      <div>
        <b>${esc(s.title)}</b>${s.detail ? `<div class="muted ${s.kind === 'request' || s.kind === 'sign' ? 'mono' : ''}">${esc(s.detail)}</div>` : ''}
        ${s.checks ? `<ul class="checks">${s.checks.map((c) => `<li class="${c.ok ? '' : 'no'}">${esc(c.label)}</li>`).join('')}</ul>` : ''}
        ${s.json ? `<details><summary class="small muted">Pokaži podatke</summary><pre>${esc(JSON.stringify(s.json, null, 2))}</pre></details>` : ''}
      </div>
    </div>`).join('');
}

function pickerHtml() {
  const group = S.data.groups.find(g => g.id === S.campaignGroup);
  const list = group ? S.data.users.filter(u => group.memberIds.includes(u.id)) : S.data.users;
  const ready = list.filter((u) => !u.skipReason);
  const depts = [...new Set(ready.map((u) => u.department))].sort((a, b) => a.localeCompare(b, 'sl'));
  const busy = S.running || ['pending', 'approved', 'running'].includes(S.plan?.status);
  return `
    <div class="card">
      <h2>1. Priprava kampanje</h2>${campaignFields()}
      <p class="muted" style="margin-top:0">Označite, kdo naj dobi naslednjo simulacijo. Glavni agent za vsakega izbranega analizira pretekle odzive in izbere taktiko, težavnost in agenta. Celoten plan odobrite enkrat.</p>
      <div class="row-actions" style="margin-bottom:10px" ${group ? 'hidden' : ''}>
        <button class="btn sm" data-pick="all">Vsi pripravljeni (${ready.length})</button>
        <button class="btn sm" data-pick="none">Počisti</button>
        ${depts.map((d) => `<button class="btn sm" data-pick-dept="${esc(d)}">${esc(d)}</button>`).join('')}
      </div>
      <div class="table-wrap"><table>
        <tr><th></th><th>Ime</th><th>Psevdonim</th><th>Oddelek</th><th>Vloga</th><th>Stanje</th></tr>
        ${list.map((u) => `<tr class="${u.skipReason ? 'rejected' : ''}">
          <td><input type="checkbox" data-pick-user="${esc(u.id)}" ${(group ? !u.skipReason : S.pick.has(u.id)) ? 'checked' : ''} ${u.skipReason || group ? 'disabled' : ''}></td>
          <td><b>${esc(u.name)}</b></td><td class="mono">${esc(u.id)}</td><td>${esc(u.department)}</td><td>${esc(u.role)}</td>
          <td>${u.skipReason ? `<span class="chip">${esc(u.skipReason)}</span>` : '<span class="chip ok">pripravljen</span>'}</td>
        </tr>`).join('')}
      </table></div>
      <div class="row-actions" style="margin-top:14px;align-items:center">
        <button class="btn primary" data-plan ${(S.pick.size || S.campaignGroup) && !busy ? '' : 'disabled'}>Pripravi načrt (${S.campaignGroup ? S.data.groups.find(g => g.id === S.campaignGroup)?.memberIds.length || 0 : S.pick.size})</button>
        ${busy ? '<span class="small muted">Najprej zaključite trenutni plan.</span>' : ''}
        <span class="small muted">Uporabnike uvozite in vključite v program na strani <a href="#/uporabniki">Uporabniki</a>.</span>
      </div>
    </div>`;
}
function itemDetails(it) {
  return `<details class="plan-item">
    <summary><b>${esc(userName(it.userId))}</b> <span class="muted">(${esc(it.userId)})</span> · ${esc(it.analysis.tacticLabel)} ${it.analysis.difficulty}/5 · ${esc(it.chosen?.name || 'ni agenta')}</summary>
    <div class="grid cols-2" style="margin-top:10px">
      <dl class="kv">
        <dt>Utemeljitev</dt><dd>${esc(it.analysis.reason)}</dd>
        ${it.error ? `<dt>Napaka</dt><dd>${esc(it.error)}</dd>` : ''}
      </dl>
      <div>
        <div class="small muted" style="margin-bottom:4px">Podatki, ki zapustijo organizacijo</div>
        ${Object.entries(it.dataShared).map(([k, v]) => `<span class="chip blue">${esc(k)}: ${esc(v)}</span>`).join('')}
      </div>
    </div>
    <div class="table-wrap" style="margin-top:8px"><table>
      <tr><th>Agent</th><th>Kanal</th><th>Cena</th><th>Ocena</th><th>Točke</th><th>Odločitev</th></tr>
      ${it.candidates.map((c) => {
        const chosen = it.chosen?.id === c.id;
        return `<tr class="${chosen ? 'chosen' : c.eligible ? '' : 'rejected'}"><td><b>${esc(c.name)}</b></td><td>${esc(S.state.channels[c.channel])}</td><td>${usdc(c.price)}</td><td>★ ${c.rating}</td><td>${c.score ?? '–'}</td><td>${chosen ? '<span class="chip ok">Izbran</span>' : c.eligible ? '<span class="chip">Primeren, nižje točke</span>' : c.reasons.map((r) => `<span class="chip bad">${esc(r)}</span>`).join('')}</td></tr>`;
      }).join('')}
    </table></div>
  </details>`;
}

function planHtml(p) {
  if (S.planError) return `<div class="card"><h2>Plan ni bil pripravljen</h2><p class="muted">${esc(S.planError)}</p></div>`;
  if (!p) return '';
  const chip = STATUS_CHIP[p.status];
  const ready = p.items.filter((i) => i.chosen);
  const hasDeliveries = p.items.some((i) => i.deliveryId) && !p.delivered;
  return `
    <div class="card">
      <div style="display:flex;justify-content:space-between;align-items:center;gap:10px;margin-bottom:12px">
        <h2 style="margin:0">${esc(p.name)} <span class="muted small">#${esc(p.id)}</span></h2><span class="chip ${chip[0]}">${chip[1]}</span>
      </div>
      <div class="table-wrap"><table>
        <tr><th>Uporabnik</th><th>Taktika</th><th>Težavnost</th><th>Agent</th><th>Kanal</th><th>Cena</th><th>Stanje</th></tr>
        ${p.items.map((it) => `<tr class="${it.chosen ? '' : 'rejected'}"><td><b>${esc(userName(it.userId))}</b> <span class="muted mono">${esc(it.userId)}</span></td><td>${esc(it.analysis.tacticLabel)}</td><td>${it.analysis.difficulty}/5</td><td>${esc(it.chosen?.name || '–')}</td><td>${it.chosen ? esc(S.state.channels[it.chosen.channel]) : '–'}</td><td>${it.chosen ? usdc(it.estimatedCost) : '–'}</td><td><span class="chip ${STATUS_CHIP[it.status][0]}">${STATUS_CHIP[it.status][1]}</span></td></tr>`).join('')}
        ${p.skipped.map((x) => `<tr class="rejected"><td><b>${esc(userName(x.userId))}</b> <span class="muted mono">${esc(x.userId)}</span></td><td colspan="6"><span class="chip">Izpuščen: ${esc(x.reason)}</span></td></tr>`).join('')}
      </table></div>
      <dl class="kv" style="margin-top:12px">
        <dt>Simulacij</dt><dd>${ready.length} · vsaka = generiranje + etični pregled (${esc(p.reviewer.name)}, ${usdc(p.reviewer.price)})</dd>
        <dt>Plačnik</dt><dd>Organizacija · denarnica glavnega agenta. Zaposleni ne plačuje.</dd><dt>Ciljna skupina</dt><dd>${esc(p.groupName)}</dd><dt>Skupaj</dt><dd><b>${usdc(p.totalCost ?? p.estimatedCost)}</b> <span class="muted">(preostanek proračuna ${usdc(S.state.budget.limit - S.state.budget.spent)})</span></dd>
        <dt>Ostane v organizaciji</dt><dd>${p.dataWithheld.map((x) => `<span class="chip">✗ ${esc(x)}</span>`).join('')}</dd>
      </dl>
      <h3 style="margin-top:16px">Analiza in izbira agenta po uporabnikih</h3>
      ${p.items.map(itemDetails).join('')}
      ${p.status === 'pending' ? `
        ${approvalChecklist()}<div class="banner" style="margin:16px 0 0;background:var(--warn-soft);border-color:#695735">
          <div class="grow"><b>Potrebna je človeška odobritev.</b> <span class="muted">Agent brez potrditve skrbnika ne naroči in ne plača nobene storitve.</span></div>
          <button class="btn danger sm" data-decide="0">Zavrni</button>
          <button class="btn ok sm" data-decide="1" disabled>Odobri kampanjo in plačaj (${usdc(p.estimatedCost)})</button>
        </div>` : ''}
      ${p.status === 'approved' ? '<div class="row-actions"><button class="btn primary" data-run-plan>Izvedi odobreno kampanjo →</button></div>' : ''}
      ${hasDeliveries && ['done', 'partial'].includes(p.status) ? `<div class="row-actions" style="margin-top:16px"><button class="btn primary" data-deliver-plan="${p.id}">Dostavi vse simulacije zdaj (demo)</button></div>` : ''}
    </div>`;
}

export function agentView() {
  const st = S.state;
  const plans = (S.data.plans || []).filter((p) => p.id !== S.plan?.id).slice(0, 6);
  return `
    <span class="eyebrow">PRIPRAVA → PREGLED → ODOBRITEV → DOSTAVA</span><h1>Kampanje</h1>
    <p class="sub">Izberite skupino in preglejte načrt. Glavni agent izbere ponudnike; IT-skrbnik potrdi prejemnike, plačilo in pošiljanje. Sporočila se dostavijo samo v predstavitveni učni portal.</p>
    <div class="grid cols-4">
      <div class="card stat"><div class="label">Stanje denarnice</div><div class="value">${usdc(st.wallet.balance)}</div><div class="hint mono">${esc(st.wallet.address.slice(0, 14))}…</div></div>
      <div class="card stat"><div class="label">Mesečni proračun</div><div class="value">${usdc(st.budget.spent)}</div><div class="meter"><i style="width:${(st.budget.spent / st.budget.limit) * 100}%"></i></div><div class="hint">od ${usdc(st.budget.limit)}</div></div>
      <div class="card stat"><div class="label">Pripravljenih za test</div><div class="value">${S.data.users.filter((u) => !u.skipReason).length} / ${S.data.users.length}</div><div class="hint">vključeni, brez odprte simulacije</div></div>
      <div class="card stat"><div class="label">Izbranih</div><div class="value">${S.campaignGroup ? S.data.groups.find(g => g.id === S.campaignGroup)?.memberIds.length || 0 : S.pick.size}</div><div class="hint">največ ${st.sims.max} simulacij na osebo na mesec</div></div>
    </div>
    <div style="margin-top:16px">${pickerHtml()}</div>
    ${S.plan || S.planError ? `<div class="grid" style="grid-template-columns:minmax(0,1.5fr) minmax(0,1fr);margin-top:16px" id="agent-grid">
      <div>${planHtml(S.plan)}</div>
      <div class="card"><h2>Dnevnik izvajanja (x402)</h2><div class="log" id="log">${logHtml()}</div></div>
    </div>` : ''}
    ${plans.length ? `<div class="card" style="margin-top:16px"><h2>Zgodovina kampanj</h2><div class="table-wrap"><table>
      <tr><th>Kampanja</th><th>Čas</th><th>Uporabnikov</th><th>Strošek</th><th>Status</th></tr>
      ${plans.map((p) => `<tr><td><button class="btn sm" data-open-plan="${p.id}">${esc(p.name)}</button></td><td>${dateTime(p.createdAt)}</td><td>${p.items.filter((i) => i.chosen).length}${p.skipped.length ? ` <span class="muted">(+${p.skipped.length} izpuščenih)</span>` : ''}</td><td>${p.totalCost ? usdc(p.totalCost) : '–'}</td><td>${esc(STATUS_CHIP[p.status][1])}</td></tr>`).join('')}
    </table></div></div>` : ''}`;
}
function campaignFields() {
  const group = S.data.groups.find(g => g.id === S.campaignGroup);
  return `<div class="form-grid campaign-fields"><div class="field"><label for="campaign-name">Ime kampanje</label><input id="campaign-name" type="text" maxlength="100" value="${esc(S.campaignName)}" placeholder="Npr. Jesensko preverjanje"></div><div class="field"><label for="campaign-group">Ciljna skupina</label><select id="campaign-group"><option value="">Ročna izbira zaposlenih</option>${S.data.groups.map(g => `<option value="${g.id}" ${g.id === S.campaignGroup ? 'selected' : ''}>${esc(g.name)} · ${g.memberIds.length} članov</option>`).join('')}</select></div></div>${group ? `<div class="tip"><b>${esc(group.name)}</b> · zahtevnost ${group.difficulty}/5 · največ ${group.frequency} vaj na mesec · ${group.channels.map(c => esc(S.state.channels[c])).join(', ')}<br>Načrt bo uporabil člane in nastavitve te skupine. Spodaj so prikazani člani izbrane skupine.</div>` : '<p class="small muted">Za različne kanale in zahtevnosti najprej ustvarite <a href="#/skupine">skupino</a>.</p>'}`;
}
function approvalChecklist() {
  return `<fieldset class="approval"><legend>3. Pregled pred odobritvijo</legend><p>Potrditev odobri nakup storitev in dostavo ob načrtovanem času v učni portal.</p>${[
    ['recipients', 'Preveril/-a sem prejemnike, kanale in zahtevnost.'],
    ['cost', 'Potrjujem skupni strošek generiranja in etičnih pregledov. Plača organizacija.'],
    ['privacy', `Potrjujem obseg posredovanih podatkov in hrambo odgovorov ${S.state.retentionDays} dni. Imena in e-naslovi ostanejo v organizaciji.`],
  ].map(([id, text]) => `<label><input type="checkbox" data-approval="${id}">${esc(text)}</label>`).join('')}</fieldset>`;
}
