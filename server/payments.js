import { createHmac, randomUUID } from 'node:crypto';
import { EXPLORER, FACILITATOR_URL } from '../chain.js';
import { BASE, NETWORK } from './config.js';
import { fromAtomic, round, txHash, sleep, unb64, b64 } from './utils.js';
import { policy, transactions, spentThisMonth, log } from './store.js';
import { WALLET_KEY, signers, usedNonces, wallet, chain, refreshBalance } from './wallet.js';
import { agents } from './marketplace.js';
import { postJson } from './http.js';

function signAuthorization(authorization) {
  return '0x' + createHmac('sha256', WALLET_KEY).update(JSON.stringify(authorization)).digest('hex');
}

export function verifyPayment(paymentPayload, req) {
  if (paymentPayload?.x402Version !== 1) return { isValid: false, invalidReason: 'invalid_x402_version' };
  if (paymentPayload.scheme !== req.scheme || paymentPayload.network !== req.network) return { isValid: false, invalidReason: 'invalid_scheme_or_network' };
  const { signature, authorization: a } = paymentPayload.payload || {};
  if (!a || !signature) return { isValid: false, invalidReason: 'invalid_payload' };
  const key = signers.get(a.from);
  if (!key) return { isValid: false, invalidReason: 'unknown_payer' };
  const expected = '0x' + createHmac('sha256', key).update(JSON.stringify(a)).digest('hex');
  if (expected !== signature) return { isValid: false, invalidReason: 'invalid_signature' };
  if (a.to.toLowerCase() !== req.payTo.toLowerCase()) return { isValid: false, invalidReason: 'invalid_recipient' };
  if (BigInt(a.value) < BigInt(req.maxAmountRequired)) return { isValid: false, invalidReason: 'insufficient_amount' };
  const now = Math.floor(Date.now() / 1000);
  if (now < Number(a.validAfter) || now > Number(a.validBefore)) return { isValid: false, invalidReason: 'expired' };
  if (usedNonces.has(a.nonce)) return { isValid: false, invalidReason: 'nonce_already_used' };
  if (fromAtomic(a.value) > wallet.balance) return { isValid: false, invalidReason: 'insufficient_funds' };
  return { isValid: true, payer: a.from };
}

export function settlePayment(paymentPayload, req) {
  const v = verifyPayment(paymentPayload, req);
  if (!v.isValid) return { success: false, errorReason: v.invalidReason, network: NETWORK };
  const a = paymentPayload.payload.authorization;
  usedNonces.add(a.nonce);
  const amount = fromAtomic(a.value);
  wallet.balance = round(wallet.balance - amount, 6);
  const agent = agents.find((x) => x.payTo === a.to);
  if (agent) agent.earned = round(agent.earned + amount, 6);
  return { success: true, transaction: txHash(), network: NETWORK, payer: a.from };
}
export async function payAndCall(agent, input, emit) {
  const url = `${BASE}/x402/agents/${agent.id}/service`;
  emit('step', { kind: 'request', title: `Zahteva storitve: ${agent.name}`, detail: `POST ${url.replace(BASE, '')}` });
  await sleep(500);
  const first = await postJson(url, input);
  if (first.status !== 402) throw new Error(`Pričakovan 402, prejet ${first.status}`);
  const req = first.body.accepts[0];
  emit('step', { kind: 'http402', title: '402 Payment Required', detail: `${fromAtomic(req.maxAmountRequired)} USDC → ${req.payTo.slice(0, 10)}…`, json: first.body });
  await sleep(600);

  const amount = fromAtomic(req.maxAmountRequired);
  await refreshBalance();
  const checks = [
    ['ponudnik je še vedno odobren in preverjen', agent.allowlisted && agent.verified],
    ['storitev ne zahteva osebnih podatkov', !agent.requiresPersonalData],
    ['kanal ostaja dovoljen', agent.kind === 'reviewer' || policy.channels[agent.channel]],
    ['ocena ponudnika ustreza pravilom', agent.rating >= policy.minRating],
    ['omrežje je testno', req.network === NETWORK],
    ['prejemnik ustreza registru tržnice', req.payTo === agent.payTo],
    [`znesek ≤ limit na transakcijo (${policy.maxPerTx})`, amount <= policy.maxPerTx],
    [`znesek ≤ preostanek proračuna (${round(policy.monthlyBudget - spentThisMonth(), 2)})`, amount <= policy.monthlyBudget - spentThisMonth()],
    ['dovolj sredstev v denarnici', amount <= wallet.balance],
  ];
  emit('step', { kind: 'policy', title: 'Preverjanje pravil porabe', checks: checks.map(([label, ok]) => ({ label, ok })) });
  if (checks.some(([, ok]) => !ok)) throw new Error('Plačilo zavrnjeno zaradi pravil porabe');
  await sleep(500);

  const now = Math.floor(Date.now() / 1000);
  const authorization = {
    from: wallet.address,
    to: req.payTo,
    value: req.maxAmountRequired,
    validAfter: String(now - 5),
    validBefore: String(now + req.maxTimeoutSeconds),
    nonce: txHash(),
  };
  const signature = chain ? await chain.signAuthorization(authorization, req.extra) : signAuthorization(authorization);
  const payment = { x402Version: 1, scheme: req.scheme, network: req.network, payload: { signature, authorization } };
  emit('step', { kind: 'sign', title: `Podpis avtorizacije plačila (EIP-3009${chain ? ', EIP-712' : ', simulirano'})`, detail: `nonce ${authorization.nonce.slice(0, 14)}…`, json: payment });
  await sleep(600);

  if (chain) emit('step', { kind: 'info', title: 'Poravnava na verigi', detail: `Facilitator ${FACILITATOR_URL} preveri podpis in izvede prenos USDC na Base Sepolia …` });
  const second = await postJson(url, input, { 'X-PAYMENT': b64(payment) });
  if (second.status !== 200) throw new Error(`Plačilo ni uspelo: ${second.body.error}`);
  const settlement = unb64(second.headers.get('x-payment-response'));
  await refreshBalance();
  const tx = {
    id: randomUUID().slice(0, 8),
    at: new Date().toISOString(),
    agentId: agent.id,
    agentName: agent.name,
    amount,
    asset: 'USDC',
    network: settlement.network,
    txHash: settlement.transaction,
    explorer: chain ? `${EXPLORER}/tx/${settlement.transaction}` : null,
    payTo: req.payTo,
    purpose: req.description,
  };
  transactions.unshift(tx);
  log('glavni agent', 'Plačilo x402', `${amount} USDC → ${agent.name} (${tx.txHash.slice(0, 12)}…)`);
  emit('step', { kind: 'paid', title: `200 OK – plačano ${amount} USDC`, detail: `tx ${settlement.transaction.slice(0, 18)}…`, json: { 'X-PAYMENT-RESPONSE': settlement }, tx });
  await sleep(400);
  return { body: second.body, tx };
}
