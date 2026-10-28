import { S } from '../core/state.js';
import { api } from '../core/api.js';
import { $, esc, usdc, CH_ICON } from '../core/format.js';
import { render } from '../core/router.js';
import { toast } from '../core/ui.js';
import { on } from '../core/events.js';

export async function loadMarket() {
  S.data.agents = await api('/api/agents');
}

export function marketView() {
  const list = S.data.agents;
  return `
    <h1>Tržnica agentov</h1>
    <p class="sub">Specializirani agenti ponujajo plačljive storitve prek HTTP. Cena velja za en klic in se plača z mikroplačilom x402. Glavni agent lahko uporabi samo agente na odobrenem seznamu.</p>
    <div class="grid cols-3">
      ${list.map((a) => `
        <div class="card agent-card">
          <div class="top">
            <div><div class="name">${esc(a.name)}</div><div class="small muted">${esc(a.vendor)}</div></div>
            <div class="price">${usdc(a.price)}<div class="small muted" style="font-weight:400;text-align:right">na klic</div></div>
          </div>
          <div class="muted">${esc(a.description)}</div>
          <div>
            ${a.kind === 'reviewer' ? '<span class="chip blue">Pregled kakovosti</span>' : `<span class="chip blue">${CH_ICON[a.channel]} ${esc(S.state.channels[a.channel])}</span>`}
            ${a.tactics.map((t) => `<span class="chip">${esc(S.state.tactics[t].label)}</span>`).join('')}
          </div>
          <div>
            <span class="chip ${a.verified ? 'ok' : 'bad'}">${a.verified ? 'Preverjen ponudnik' : 'Nepreverjen'}</span>
            ${a.requiresPersonalData ? '<span class="chip bad">Zahteva osebne podatke</span>' : '<span class="chip ok">Brez osebnih podatkov</span>'}
          </div>
          <div class="foot">
            <span>★ ${a.rating} · ${a.calls} klicev · ${usdc(a.earned)}</span>
            <label class="switch"><input type="checkbox" data-allow="${a.id}" ${a.allowlisted ? 'checked' : ''}>Odobren</label>
          </div>
        </div>`).join('')}
    </div>`;
}

export function bindMarketEvents() {
  on('change', '[data-allow]', async input => {
    await api(`/api/agents/${input.dataset.allow}/allowlist`, { method: 'POST', body: { allowlisted: input.checked } });
    toast(`${input.checked ? 'Dodano na' : 'Odstranjeno z'} odobrenega seznama.`);
    return render();
  });
}
