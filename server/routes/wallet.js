import { sendJson, readBody } from '../http.js';
import { randomUUID } from 'node:crypto';
import { NETWORK } from '../config.js';
import { fromAtomic, toAtomic, txHash } from '../utils.js';
import { transactions, policy, spentThisMonth, log } from '../store.js';
import { chain, wallet, funding, ownerChallenges, saveOwner, refreshBalance, facilitatorTransfer, transferRequirements, recordFunding } from '../wallet.js';

const requireChain = (res) => (chain ? false : (sendJson(res, 400, { error: 'Povezava denarnice deluje samo v načinu Base Sepolia (npm run start:sepolia).' }), true));

export function registerWalletRoutes(route) {
  route('GET', '/api/transactions', async (req, res) => {
    await refreshBalance();
    sendJson(res, 200, { transactions, funding, wallet, budget: { limit: policy.monthlyBudget, spent: spentThisMonth() } });
  });
  route('POST', '/api/wallet/challenge', async (req, res) => {
    if (requireChain(res)) return;
    const { address } = await readBody(req);
    if (!/^0x[0-9a-fA-F]{40}$/.test(address || '')) return sendJson(res, 400, { error: 'neveljaven naslov' });
    const message = `CyberAgent Marketplace\n\nPovezujem svojo denarnico ${address} z denarnico glavnega agenta ${wallet.address}.\nVračila neporabljenih sredstev naj gredo na ta naslov.\n\nOznaka: ${randomUUID()}`;
    ownerChallenges.set(address.toLowerCase(), message);
    sendJson(res, 200, { message });
  });

  route('POST', '/api/wallet/owner', async (req, res) => {
    if (requireChain(res)) return;
    const { address, signature } = await readBody(req);
    const message = ownerChallenges.get(String(address).toLowerCase());
    if (!message) return sendJson(res, 400, { error: 'najprej zahtevaj sporočilo za podpis' });
    ownerChallenges.delete(address.toLowerCase());
    const ok = await chain.verifyOwner(address, message, signature).catch(() => false);
    if (!ok) return sendJson(res, 400, { error: 'podpis ne ustreza naslovu' });
    wallet.owner = { address, linkedAt: new Date().toISOString() };
    saveOwner();
    log('skrbnik', 'Povezana lastnikova denarnica', address);
    sendJson(res, 200, { owner: wallet.owner });
  });

  route('DELETE', '/api/wallet/owner', (req, res) => {
    if (wallet.owner) log('skrbnik', 'Odstranjena lastnikova denarnica', wallet.owner.address);
    wallet.owner = null;
    saveOwner();
    sendJson(res, 200, { owner: null });
  });

  // Polnitev: lastnik v MetaMasku podpiše avtorizacijo EIP-3009 (brez plina), facilitator izvede prenos.
  route('POST', '/api/wallet/deposit', async (req, res) => {
    if (requireChain(res)) return;
    if (!wallet.owner) return sendJson(res, 400, { error: 'denarnica ni povezana' });
    const { authorization: a, signature } = await readBody(req);
    if (!a || !signature) return sendJson(res, 400, { error: 'manjka podpisana avtorizacija' });
    if (a.from.toLowerCase() !== wallet.owner.address.toLowerCase()) return sendJson(res, 400, { error: 'pošiljatelj ni povezana denarnica' });
    if (a.to.toLowerCase() !== wallet.address.toLowerCase()) return sendJson(res, 400, { error: 'prejemnik ni denarnica agenta' });
    const amount = fromAtomic(a.value);
    if (!(amount > 0 && amount <= 50)) return sendJson(res, 400, { error: 'znesek mora biti med 0 in 50 USDC' });
    try {
      const payment = { x402Version: 1, scheme: 'exact', network: NETWORK, payload: { signature, authorization: a } };
      const tx = await facilitatorTransfer(payment, transferRequirements(wallet.address, a.value, 'Polnitev denarnice glavnega agenta'));
      await refreshBalance();
      log('skrbnik', 'Polnitev denarnice agenta', `${amount} USDC iz ${a.from.slice(0, 10)}… (${tx.slice(0, 12)}…)`);
      sendJson(res, 200, { funding: recordFunding('polnitev', amount, tx, a.from), wallet });
    } catch (err) {
      sendJson(res, 400, { error: `Polnitev ni uspela: ${err.message}` });
    }
  });

  // Vračilo: agent podpiše prenos celotnega stanja na povezano denarnico.
  route('POST', '/api/wallet/refund', async (req, res) => {
    if (requireChain(res)) return;
    if (!wallet.owner) return sendJson(res, 400, { error: 'denarnica ni povezana' });
    await refreshBalance();
    if (wallet.balance <= 0) return sendJson(res, 400, { error: 'denarnica agenta je prazna' });
    const value = toAtomic(wallet.balance);
    const now = Math.floor(Date.now() / 1000);
    const authorization = { from: wallet.address, to: wallet.owner.address, value, validAfter: String(now - 5), validBefore: String(now + 300), nonce: txHash() };
    try {
      const signature = await chain.signAuthorization(authorization);
      const payment = { x402Version: 1, scheme: 'exact', network: NETWORK, payload: { signature, authorization } };
      const tx = await facilitatorTransfer(payment, transferRequirements(wallet.owner.address, value, 'Vračilo neporabljenih sredstev'));
      const amount = fromAtomic(value);
      await refreshBalance();
      log('skrbnik', 'Vračilo neporabljenih sredstev', `${amount} USDC → ${wallet.owner.address.slice(0, 10)}… (${tx.slice(0, 12)}…)`);
      sendJson(res, 200, { funding: recordFunding('vračilo', amount, tx, wallet.owner.address), wallet });
    } catch (err) {
      sendJson(res, 400, { error: `Vračilo ni uspelo: ${err.message}` });
    }
  });
}
