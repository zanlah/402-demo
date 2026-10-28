import { S } from '../core/state.js';
import { api } from '../core/api.js';
import { $, esc, usdc, dateTime, txCell } from '../core/format.js';
import { on } from '../core/events.js';
import { BASE_SEPOLIA, eth, mmBalance, ownerWalletCard, connectWallet, depositFunds, refundFunds, watchUsdc, unlinkWallet } from './wallet.js';

export async function loadPayments() {
  S.data.tx = await api('/api/transactions');
  const owner = S.data.tx.wallet.owner;
  // Stanje v MetaMasku preberemo brez poziva, če je denarnica že na Base Sepolia.
  S.mm.balance = null;
  if (owner && window.ethereum) {
    try {
      if ((await eth('eth_chainId')) === BASE_SEPOLIA.chainId) S.mm.balance = await mmBalance(owner.address);
    } catch {}
  }
}
export function paymentsView() {
  const { transactions, budget, wallet } = S.data.tx;
  const byAgent = {};
  transactions.forEach((t) => (byAgent[t.agentName] = (byAgent[t.agentName] || 0) + t.amount));
  const maxA = Math.max(0.01, ...Object.values(byAgent));
  return `
    <h1>Plačila x402</h1>
    <p class="sub">Vsa mikroplačila, ki jih je glavni agent izvedel pri specializiranih agentih. ${wallet.mode === 'sepolia' ? 'Omrežje: Base Sepolia (testno). Plačila so prave transakcije USDC na verigi, poravna jih javni facilitator x402.' : 'Omrežje: Base Sepolia (testno, simulirano). Za prava plačila zaženi <code>npm run start:sepolia</code>.'}</p>
    ${wallet.mode === 'sepolia' && wallet.balance < 0.2 ? `<div class="card" style="margin-bottom:16px;border-color:#e0a800"><b>Denarnica agenta nima dovolj testnih USDC.</b> Napolni jo iz svoje denarnice spodaj ali pa na <a href="${esc(wallet.faucet)}" target="_blank" rel="noopener">Circle faucet</a> izberi Base Sepolia in vnesi naslov <span class="mono">${esc(wallet.address)}</span>. ETH ni potreben, plin plača facilitator.</div>` : ''}
    <div class="grid cols-4">
      <div class="card stat"><div class="label">Porabljeno ta mesec</div><div class="value">${usdc(budget.spent)}</div><div class="meter"><i style="width:${(budget.spent / budget.limit) * 100}%"></i></div><div class="hint">limit ${usdc(budget.limit)}</div></div>
      <div class="card stat"><div class="label">Število plačil</div><div class="value">${transactions.length}</div></div>
      <div class="card stat"><div class="label">Povprečno plačilo</div><div class="value">${transactions.length ? usdc(budget.spent / transactions.length, 3) : '–'}</div></div>
      <div class="card stat"><div class="label">Stanje denarnice</div><div class="value">${usdc(wallet.balance)}</div></div>
    </div>
    ${wallet.mode === 'sepolia' ? ownerWalletCard() : ''}
    <div class="card" style="margin-top:16px">
      <h2>Kako poteka plačilo</h2>
      <div class="flow">
        <div><b>1. Zahteva</b>Glavni agent pokliče storitev agenta brez plačila.</div>
        <div><b>2. 402 Payment Required</b>Agent vrne ceno, prejemnika, žeton (USDC) in omrežje.</div>
        <div><b>3. Pravila in podpis</b>Preveri limit, proračun in register, nato podpiše avtorizacijo in jo pošlje v glavi X-PAYMENT.</div>
        <div><b>4. Poravnava</b>Facilitator preveri in poravna plačilo, agent vrne rezultat in X-PAYMENT-RESPONSE.</div>
      </div>
    </div>
    <div class="grid" style="grid-template-columns:minmax(0,2fr) minmax(0,1fr);margin-top:16px">
      <div class="card">
        <h2>Transakcije</h2>
        ${transactions.length ? `<div class="table-wrap"><table>
          <tr><th>Čas</th><th>Agent</th><th>Namen</th><th>Znesek</th><th>Tx</th></tr>
          ${transactions.map((t) => `<tr><td>${dateTime(t.at)}</td><td>${esc(t.agentName)}</td><td class="muted">${esc(t.purpose)}</td><td><b>${usdc(t.amount)}</b></td><td class="mono">${txCell(t)}</td></tr>`).join('')}
        </table></div>` : '<p class="muted">Še ni plačil. Odzovite se na simulacijo v nabiralniku in odobrite plan glavnega agenta.</p>'}
      </div>
      <div class="card">
        <h2>Poraba po agentih</h2>
        ${Object.keys(byAgent).length ? Object.entries(byAgent).map(([n, v]) => `<div class="bar-row" style="grid-template-columns:110px 1fr 72px"><span>${esc(n)}</span><div class="bar"><i style="width:${(v / maxA) * 100}%"></i></div><span class="small">${usdc(v)}</span></div>`).join('') : '<p class="muted">–</p>'}
      </div>
    </div>`;
}

export function bindPaymentsEvents() {
  on('click', '[data-wallet]', button => ({ connect: connectWallet, refund: refundFunds, unlink: unlinkWallet, watch: watchUsdc })[button.dataset.wallet]());
  on('submit', '#deposit-form', (form, event) => {
    event.preventDefault();
    return depositFunds(Number(new FormData(form).get('amount')));
  });
}
