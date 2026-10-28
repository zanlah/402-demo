import { S, refreshState } from '../core/state.js';
import { api } from '../core/api.js';
import { $, esc, time } from '../core/format.js';
import { render } from '../core/router.js';
import { toast } from '../core/ui.js';
import { on } from '../core/events.js';

export async function loadRules() {
  [S.data.policy, S.data.audit] = await Promise.all([api('/api/policy'), api('/api/audit')]);
}

export function rulesView() {
  const p = S.data.policy;
  const num = (k, label, step, help) => `<div class="field"><label>${label}</label><input type="number" name="${k}" value="${p[k]}" step="${step}" min="0"><div class="help">${help}</div></div>`;
  return `
    <h1>Pravila in zasebnost</h1>
    <p class="sub">Okvir, znotraj katerega glavni agent deluje samostojno: stroški, podatki, etika in pogostost.</p>
    <form class="card" id="policy-form">
      <h2>Stroški</h2>
      <div class="form-grid">
        ${num('monthlyBudget', 'Mesečni proračun (USDC)', '0.5', 'Agent ne more porabiti več, tudi če ima sredstva.')}
        ${num('maxPerTx', 'Največ na transakcijo (USDC)', '0.01', 'Dražji agenti so samodejno izločeni.')}
        ${num('minRating', 'Najnižja ocena agenta', '0.1', 'Agenti z nižjo oceno so izločeni.')}
        ${num('maxSimsPerMonth', 'Največ simulacij na osebo na mesec', '1', 'Preprečuje nadlegovanje in »treniranje obratno«.')}
      </div>
      <h2 style="margin-top:22px">Nadzor in podatki</h2>
      <div class="form-grid">
        <div class="tip"><b>Obvezna odobritev kampanje</b><br>Brez izrecne potrditve IT-skrbnika ni nakupa ali pošiljanja. Uporabijo se samo preverjeni, odobreni ponudniki brez zahtev po osebnih podatkih.</div>



      </div>
      <h2 style="margin-top:22px">Zasebnost in hramba</h2><div class="form-grid">${num('retentionDays', 'Hramba osebnih učnih rezultatov (dni)', '1', '1–365 dni. Starejši odgovori in obravnavana sporočila se izbrišejo. V tem prototipu se učni podatki izbrišejo tudi ob ponovnem zagonu.')}<div class="tip">Zaposleni vidi svoje odgovore in napredek. IT-skrbnik vidi imenik, stroške ter skupinske kazalnike za najmanj 5 sodelujočih. Imenik in skupine ostanejo lokalno shranjeni do ročnega izbrisa.</div></div>
      <h2 style="margin-top:22px">Kanali</h2>
      <div class="row-actions">
        ${Object.entries(p.channels).map(([k, v]) => `<label class="switch"><input type="checkbox" name="ch_${k}" ${v ? 'checked' : ''}>${esc(S.state.channels[k])}</label>`).join('')}
      </div>
      <h2 style="margin-top:22px">Etične meje</h2>
      <div class="field"><label>Prepovedane teme (ločene z vejico)</label><input type="text" name="blockedTopics" value="${esc(p.blockedTopics.join(', '))}"><div class="help">Simulacije s temi temami (npr. lažna odpuščanja ali bonusi) zavrne etični pregled.</div></div>
      <div class="row-actions" style="margin-top:18px"><button class="btn primary" type="submit">Shrani pravila</button></div>
    </form>
    <div class="card" style="margin-top:16px">
      <h2>Revizijska sled</h2>
      <div class="audit">${S.data.audit.map((a) => `<div><span class="muted">${time(a.at)}</span><b>${esc(a.actor)}</b><span>${esc(a.action)}${a.detail ? ` <span class="muted">– ${esc(a.detail)}</span>` : ''}</span></div>`).join('')}</div>
    </div>`;
}

async function savePolicy(form) {
  const f = new FormData(form);
  const body = {
    retentionDays: f.get('retentionDays'),
    monthlyBudget: f.get('monthlyBudget'),
    maxPerTx: f.get('maxPerTx'),
    minRating: f.get('minRating'),
    maxSimsPerMonth: f.get('maxSimsPerMonth'),
    channels: Object.fromEntries(Object.keys(S.data.policy.channels).map((k) => [k, f.has('ch_' + k)])),
    blockedTopics: String(f.get('blockedTopics')).split(',').map((s) => s.trim()).filter(Boolean),
  };
  await api('/api/policy', { method: 'PUT', body });
  await refreshState();
  toast('Pravila shranjena. Veljajo za naslednji plan.');
  render();
}

export function bindRulesEvents() {
  on('submit', '#policy-form', (form, event) => { event.preventDefault(); return savePolicy(form); });
}
