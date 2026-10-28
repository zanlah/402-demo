import { generateScenario, scenarioText } from '../scenarios.js';
import { FACILITATOR_URL } from '../chain.js';
import { BASE, NETWORK, USDC_ASSET, REAL } from './config.js';
import { toAtomic, fromAtomic, round, b64, unb64 } from './utils.js';
import { policy } from './store.js';
import { shortError, settleWithRetry } from './wallet.js';
import { sendJson, readBody, postJson } from './http.js';

function paymentRequirements(agent) {
  return {
    scheme: 'exact',
    network: NETWORK,
    maxAmountRequired: toAtomic(agent.price),
    resource: `${BASE}/x402/agents/${agent.id}/service`,
    description: agent.kind === 'reviewer' ? `${agent.name}: pregled simulacije` : `${agent.name}: generiranje simulacije`,
    mimeType: 'application/json',
    payTo: agent.payTo,
    maxTimeoutSeconds: 60,
    asset: USDC_ASSET,
    extra: { name: 'USDC', version: '2' },
  };
}

function runAgentService(agent, input) {
  if (agent.kind === 'reviewer') {
    const text = scenarioText(input.scenario || {}).toLowerCase();
    const issues = policy.blockedTopics.filter((t) => text.includes(t.toLowerCase().slice(0, 6)));
    const d = input.scenario?.difficulty || 1;
    return {
      reviewer: agent.name,
      ethicsOk: issues.length === 0,
      issues,
      realism: round(0.55 + d * 0.08 + Math.random() * 0.05, 2),
      notes: issues.length ? `Najdene prepovedane teme: ${issues.join(', ')}` : 'Brez čustveno škodljivih tem. Primerno za dostavo.',
    };
  }
  if (agent.requiresPersonalData && !input.personalData) {
    return { error: 'Agent zahteva osebne podatke, ki jih ni prejel.' };
  }
  const scenario = generateScenario({ channel: agent.channel, tactic: input.tactic, difficulty: input.difficulty, role: input.role, department: input.department, variant: input.variant });
  return { generator: agent.name, scenario };
}

export async function handleAgentService(req, res, agent) {
  const requirements = paymentRequirements(agent);
  const header = req.headers['x-payment'];
  if (!header) {
    return sendJson(res, 402, { x402Version: 1, error: 'X-PAYMENT header is required', accepts: [requirements] });
  }
  let payment;
  try {
    payment = unb64(header);
  } catch {
    return sendJson(res, 402, { x402Version: 1, error: 'invalid_payment_header', accepts: [requirements] });
  }
  const facilitator = REAL ? FACILITATOR_URL : `${BASE}/facilitator`;
  const verify = await postJson(`${facilitator}/verify`, { x402Version: 1, paymentPayload: payment, paymentRequirements: requirements });
  if (!verify.body.isValid) {
    return sendJson(res, 402, { x402Version: 1, error: shortError(verify.body), accepts: [requirements] });
  }
  const input = await readBody(req);
  const result = runAgentService(agent, input);
  const settle = await settleWithRetry(`${facilitator}/settle`, { x402Version: 1, paymentPayload: payment, paymentRequirements: requirements });
  if (!settle.body.success) {
    return sendJson(res, 402, { x402Version: 1, error: shortError(settle.body), accepts: [requirements] });
  }
  if (REAL) agent.earned = round(agent.earned + fromAtomic(requirements.maxAmountRequired), 6);
  agent.calls += 1;
  res.setHeader('X-PAYMENT-RESPONSE', b64(settle.body));
  res.setHeader('Access-Control-Expose-Headers', 'X-PAYMENT-RESPONSE');
  sendJson(res, 200, result);
}
