import { randomBytes, randomUUID } from 'node:crypto';
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { createChain, EXPLORER, FACILITATOR_URL, FAUCET } from '../chain.js';
import { BASE, REAL, NETWORK, USDC_ASSET } from './config.js';
import { addressFor, round, sleep } from './utils.js';
import { agents } from './marketplace.js';
import { postJson } from './http.js';

export const WALLET_KEY = randomBytes(32);
export const wallet = { address: addressFor('glavni-agent'), balance: 10.0, mode: REAL ? 'sepolia' : 'simulacija', network: 'base-sepolia', explorer: null, faucet: null };
export const signers = new Map([[wallet.address, WALLET_KEY]]);
export const usedNonces = new Set();
export const chain = REAL ? createChain(agents.map((a) => a.id)) : null;
if (chain) {
  wallet.address = chain.payerAddress;
  wallet.balance = 0;
  wallet.explorer = `${EXPLORER}/address/${chain.payerAddress}`;
  wallet.faucet = FAUCET;
  agents.forEach((a) => (a.payTo = chain.agentAddresses[a.id]));
}

// Lastnikova denarnica (MetaMask): polni denarnico agenta in prejme vračilo neporabljenih sredstev.
// Povezava in zgodovina polnitev se shranita na disk, ker sredstva na verigi preživijo ponovni zagon.
const OWNER_FILE = fileURLToPath(new URL('../.lastnik.json', import.meta.url));
const saved = REAL && existsSync(OWNER_FILE) ? JSON.parse(readFileSync(OWNER_FILE, 'utf8')) : {};
wallet.owner = saved.owner || null;
export const funding = saved.funding || []; // polnitve in vračila (niso poraba, zato ne štejejo v proračun)
export const saveOwner = () => REAL && writeFileSync(OWNER_FILE, JSON.stringify({ owner: wallet.owner, funding }, null, 2));
export const ownerChallenges = new Map();

// Javni facilitator si deli račun za plin z mnogimi uporabniki, zato poravnava občasno pade zaradi tekme
// za nonce. Ponovni poskus je varen: podpisano avtorizacijo EIP-3009 lahko veriga porabi le enkrat.
export async function settleWithRetry(url, body, attempts = 6) {
  let last;
  for (let i = 0; i < attempts; i++) {
    if (i) await sleep(2000 * i);
    last = await postJson(url, body);
    if (last.body.success) return last;
    console.warn(`Poravnava ni uspela (poskus ${i + 1}/${attempts}): ${shortError(last.body)}`);
  }
  return last;
}
export const shortError = (b) => String(b.errorReason || b.error || b.invalidReason || 'neznana napaka').split(/\n| URL: | Request body: /)[0].slice(0, 200);

// Neposreden prenos USDC prek javnega facilitatorja: podpisano avtorizacijo EIP-3009 preveri in poravna na verigi.
export async function facilitatorTransfer(payment, requirements) {
  const body = { x402Version: 1, paymentPayload: payment, paymentRequirements: requirements };
  const verify = await postJson(`${FACILITATOR_URL}/verify`, body);
  if (!verify.body.isValid) throw new Error(shortError(verify.body));
  const settle = await settleWithRetry(`${FACILITATOR_URL}/settle`, body);
  if (!settle.body.success) throw new Error(shortError(settle.body));
  return settle.body.transaction;
}

export function transferRequirements(payTo, value, description) {
  return { scheme: 'exact', network: NETWORK, maxAmountRequired: value, resource: `${BASE}/api/wallet`, description, mimeType: 'application/json', payTo, maxTimeoutSeconds: 300, asset: USDC_ASSET, extra: { name: 'USDC', version: '2' } };
}

export function recordFunding(type, amount, transaction, address) {
  const f = { id: randomUUID().slice(0, 8), at: new Date().toISOString(), type, amount, address, txHash: transaction, explorer: `${EXPLORER}/tx/${transaction}` };
  funding.unshift(f);
  saveOwner();
  return f;
}

// V pravem načinu je stanje denarnice stanje USDC na verigi.
export async function refreshBalance() {
  if (!chain) return;
  try {
    wallet.balance = round(await chain.usdcBalance(), 6);
  } catch (err) {
    console.error('Branje stanja USDC ni uspelo:', err.shortMessage || err.message);
  }
}
