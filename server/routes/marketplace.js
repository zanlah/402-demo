import { sendJson, readBody } from '../http.js';
import { agents, agentById } from '../marketplace.js';
import { log } from '../store.js';
import { verifyPayment, settlePayment } from '../payments.js';
import { handleAgentService } from '../agent-service.js';

export function registerMarketplaceRoutes(route) {
  route('POST', '/facilitator/verify', async (req, res) => {
    const { paymentPayload, paymentRequirements } = await readBody(req);
    sendJson(res, 200, verifyPayment(paymentPayload, paymentRequirements));
  });
  route('POST', '/facilitator/settle', async (req, res) => {
    const { paymentPayload, paymentRequirements } = await readBody(req);
    sendJson(res, 200, settlePayment(paymentPayload, paymentRequirements));
  });

  // --- plačljive storitve agentov
  route('POST', '/x402/agents/:id/service', async (req, res, p) => {
    const agent = agentById(p.id);
    if (!agent) return sendJson(res, 404, { error: 'agent ne obstaja' });
    await readBody(req);
    return handleAgentService(req, res, agent);
  });
  route('GET', '/api/agents', (req, res) => sendJson(res, 200, agents.map(({ ...a }) => a)));
  route('POST', '/api/agents/:id/allowlist', async (req, res, p) => {
    const a = agentById(p.id);
    if (!a) return sendJson(res, 404, { error: 'ni agenta' });
    const { allowlisted } = await readBody(req);
    a.allowlisted = Boolean(allowlisted);
    log('skrbnik', a.allowlisted ? 'Agent dodan na odobreni seznam' : 'Agent odstranjen z odobrenega seznama', a.name);
    sendJson(res, 200, a);
  });
}
