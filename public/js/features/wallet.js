import { S } from '../core/state.js';
import { api } from '../core/api.js';
import { $, esc, usdc, dateTime, short, txCell } from '../core/format.js';
import { render } from '../core/router.js';
import { toast } from '../core/ui.js';

const USDC = '0x036CbD53842c5426634e7929541eC2318f3dCF7e';
export const BASE_SEPOLIA = { chainId: '0x14a34', chainName: 'Base Sepolia', nativeCurrency: { name: 'Ether', symbol: 'ETH', decimals: 18 }, rpcUrls: ['https://sepolia.base.org'], blockExplorerUrls: ['https://sepolia.basescan.org'] };
export const eth = (method, params = []) => window.ethereum.request({ method, params });
const toHex = (bytes) => '0x' + [...bytes].map((b) => b.toString(16).padStart(2, '0')).join('');
const mmError = (err) => (err?.code === 4001 ? 'Zavrnjeno v MetaMasku.' : err?.message || String(err));

async function ensureBaseSepolia() {
  try {
    await eth('wallet_switchEthereumChain', [{ chainId: BASE_SEPOLIA.chainId }]);
  } catch (err) {
    if (err.code === 4902 || err?.data?.originalError?.code === 4902) await eth('wallet_addEthereumChain', [BASE_SEPOLIA]);
    else throw err;
  }
}

export async function mmBalance(address) {
  const raw = await eth('eth_call', [{ to: USDC, data: '0x70a08231' + address.slice(2).toLowerCase().padStart(64, '0') }, 'latest']);
  return Number(BigInt(raw)) / 1e6;
}

async function walletTask(label, fn) {
  if (!window.ethereum) return toast('MetaMask ni nameščen. Namesti razširitev z <a href="https://metamask.io" target="_blank" rel="noopener">metamask.io</a> in osveži stran.', 7000);
  S.mm.busy = label;
  render(false);
  try {
    await fn();
  } catch (err) {
    toast(esc(mmError(err)), 7000);
  } finally {
    S.mm.busy = null;
    await render();
  }
}

export const connectWallet = () =>
  walletTask('Poveži denarnico in podpiši sporočilo v MetaMasku …', async () => {
    const [address] = await eth('eth_requestAccounts');
    await ensureBaseSepolia();
    const { message } = await api('/api/wallet/challenge', { method: 'POST', body: { address } });
    const signature = await eth('personal_sign', [toHex(new TextEncoder().encode(message)), address]);
    await api('/api/wallet/owner', { method: 'POST', body: { address, signature } });
    toast('Denarnica povezana.');
  });

export const depositFunds = (amount) =>
  walletTask('Podpiši polnitev v MetaMasku …', async () => {
    const { wallet } = S.data.tx;
    const from = wallet.owner.address;
    if (!(amount > 0)) throw new Error('Vnesi znesek, večji od 0.');
    const [account] = await eth('eth_requestAccounts');
    if (account.toLowerCase() !== from.toLowerCase()) throw new Error(`V MetaMasku izberi povezani račun ${from.slice(0, 10)}…`);
    await ensureBaseSepolia();
    const available = await mmBalance(from);
    if (amount > available) throw new Error(`V MetaMasku imaš le ${usdc(available)}.`);
    const now = Math.floor(Date.now() / 1000);
    const authorization = { from, to: wallet.address, value: String(Math.round(amount * 1e6)), validAfter: String(now - 5), validBefore: String(now + 300), nonce: toHex(crypto.getRandomValues(new Uint8Array(32))) };
    const typed = {
      types: {
        EIP712Domain: [{ name: 'name', type: 'string' }, { name: 'version', type: 'string' }, { name: 'chainId', type: 'uint256' }, { name: 'verifyingContract', type: 'address' }],
        TransferWithAuthorization: [{ name: 'from', type: 'address' }, { name: 'to', type: 'address' }, { name: 'value', type: 'uint256' }, { name: 'validAfter', type: 'uint256' }, { name: 'validBefore', type: 'uint256' }, { name: 'nonce', type: 'bytes32' }],
      },
      primaryType: 'TransferWithAuthorization',
      domain: { name: 'USDC', version: '2', chainId: 84532, verifyingContract: USDC },
      message: authorization,
    };
    const signature = await eth('eth_signTypedData_v4', [from, JSON.stringify(typed)]);
    S.mm.busy = 'Facilitator izvaja prenos na verigi …';
    render(false);
    const r = await api('/api/wallet/deposit', { method: 'POST', body: { authorization, signature } });
    toast(`Agentu nakazano ${usdc(r.funding.amount)}. <a href="${esc(r.funding.explorer)}" target="_blank" rel="noopener">Transakcija ↗</a>`, 7000);
  });

export async function refundFunds() {
  const { wallet } = S.data.tx;
  if (!confirm(`Vrnem ${usdc(wallet.balance)} iz denarnice agenta na ${wallet.owner.address}?`)) return;
  S.mm.busy = 'Agent vrača sredstva, facilitator izvaja prenos …';
  render(false);
  try {
    const r = await api('/api/wallet/refund', { method: 'POST' });
    toast(`Vrnjeno ${usdc(r.funding.amount)}. <a href="${esc(r.funding.explorer)}" target="_blank" rel="noopener">Transakcija ↗</a>`, 7000);
  } catch (err) {
    toast(esc(err.message), 7000);
  }
  S.mm.busy = null;
  await render();
}

// MetaMask testnih žetonov ne pozna sam, zato mu USDC na Base Sepolia dodamo (wallet_watchAsset).
export const watchUsdc = () =>
  walletTask('Potrdi dodajanje USDC v MetaMasku …', async () => {
    await ensureBaseSepolia();
    const added = await eth('wallet_watchAsset', { type: 'ERC20', options: { address: USDC, symbol: 'USDC', decimals: 6 } });
    toast(added ? 'USDC dodan v MetaMask. Stanje vidiš na omrežju Base Sepolia.' : 'Dodajanje preklicano.');
  });

export async function unlinkWallet() {
  await api('/api/wallet/owner', { method: 'DELETE' });
  toast('Povezava z denarnico odstranjena.');
  await render();
}

export function ownerWalletCard() {
  const { wallet, funding } = S.data.tx;
  const busy = S.mm.busy ? `<p class="small" style="margin-top:10px">⏳ ${esc(S.mm.busy)}</p>` : '';
  const dis = S.mm.busy ? 'disabled' : '';
  if (!wallet.owner) {
    return `<div class="card" style="margin-top:16px">
      <h2>Lastnikova denarnica (MetaMask)</h2>
      <p class="muted">Poveži svojo denarnico, da lahko polniš denarnico glavnega agenta in dobiš vrnjena neporabljena sredstva. Agent tvojega ključa nikoli ne vidi. Porabi lahko le, kar mu nakažeš, in to v okviru pravil porabe.</p>
      <button class="btn primary" data-wallet="connect" ${dis}>Poveži MetaMask</button>${busy}
    </div>`;
  }
  const o = wallet.owner;
  return `<div class="card" style="margin-top:16px">
    <h2>Lastnikova denarnica (MetaMask)</h2>
    <div class="grid cols-3" style="margin-top:8px">
      <div><div class="small muted">Povezan naslov</div><div class="mono"><a href="https://sepolia.basescan.org/address/${esc(o.address)}" target="_blank" rel="noopener">${esc(short(o.address))} ↗</a></div></div>
      <div><div class="small muted">Stanje v MetaMasku</div><b>${S.mm.balance == null ? '–' : usdc(S.mm.balance)}</b></div>
      <div><div class="small muted">Denarnica agenta</div><b>${usdc(wallet.balance)}</b></div>
    </div>
    <form id="deposit-form" style="display:flex;gap:8px;flex-wrap:wrap;align-items:center;margin-top:14px">
      <input type="number" name="amount" min="0.01" max="50" step="0.01" value="1" style="width:110px" ${dis}> <span class="small">USDC</span>
      <button class="btn primary" ${dis}>Napolni agenta</button>
      <button type="button" class="btn" data-wallet="refund" ${dis || (wallet.balance <= 0 ? 'disabled' : '')}>Vrni neporabljeno (${usdc(wallet.balance)})</button>
      <button type="button" class="btn sm" data-wallet="watch" ${dis}>Prikaži USDC v MetaMasku</button>
      <button type="button" class="btn sm danger" data-wallet="unlink" ${dis}>Prekini povezavo</button>
    </form>
    <p class="small muted" style="margin-top:8px">Polnitev v MetaMasku samo podpišeš (EIP-3009). Prenos izvede facilitator x402, zato ETH za plin ni potreben.</p>${busy}
    ${funding.length ? `<div class="table-wrap" style="margin-top:12px"><table>
      <tr><th>Čas</th><th>Vrsta</th><th>Znesek</th><th>Tx</th></tr>
      ${funding.map((f) => `<tr><td>${dateTime(f.at)}</td><td>${f.type === 'polnitev' ? 'Polnitev agenta' : 'Vračilo lastniku'}</td><td><b>${f.type === 'polnitev' ? '+' : '−'}${usdc(f.amount)}</b></td><td class="mono">${txCell(f)}</td></tr>`).join('')}
    </table></div>` : ''}
  </div>`;
}
