import { sendJson, readBody } from '../http.js';
import { CHANNELS } from '../../scenarios.js';
import { groups, plans, deliveries, addMessage, log } from '../store.js';
import { createPlan, validatePlan } from '../planning.js';
import { executePlan } from '../execution.js';
import { publicState } from '../public-state.js';

let executingPlan = false;

export function registerCampaignRoutes(route) {
  route('POST', '/api/agent/plan', async (req, res) => {
    const { userIds, groupId, name } = await readBody(req);
    const group = groups.find(g => g.id === groupId);
    if (groupId && !group) return sendJson(res, 404, { error: 'Ni skupine.' });
    const ids = group ? group.memberIds : Array.isArray(userIds) ? userIds : [];
    if (!ids.length) return sendJson(res, 400, { error: 'Izberite vsaj enega uporabnika ali skupino.' });
    const settings = group ? { ...group, groupId: group.id, groupName: group.name } : {};
    settings.name = String(name || group?.name || 'Varnostno usposabljanje').slice(0, 100);
    sendJson(res, 200, createPlan(ids, settings));
  });
  route('GET', '/api/agent/plans', (req, res) => sendJson(res, 200, [...plans.values()].reverse()));
  route('POST', '/api/agent/plans/:id/deliver', (req, res, p) => {
    const plan = plans.get(p.id);
    if (!plan || !['done', 'partial'].includes(plan.status)) return sendJson(res, 409, { error: 'Kampanja še ni pripravljena za dostavo.' });
    const due = deliveries.filter((d) => d.planId === p.id);
    due.forEach((d) => {
      deliveries.splice(deliveries.indexOf(d), 1);
      addMessage(d.message);
    });
    if (plan) plan.delivered = true;
    log('sistem', 'Simulacije dostavljene', `plan ${p.id}: ${due.length}`);
    sendJson(res, 200, { delivered: due.length, state: publicState(req) });
  });
  route('POST', '/api/agent/plans/:id/decision', async (req, res, p) => {
    const plan = plans.get(p.id);
    if (!plan) return sendJson(res, 404, { error: 'ni plana' });
    if (plan.status !== 'pending') return sendJson(res, 409, { error: 'plan ni v čakanju' });
    const { approve, checklist } = await readBody(req);
    if (approve && !['recipients', 'cost', 'privacy'].every(k => checklist?.[k] === true)) return sendJson(res, 400, { error: 'Pred odobritvijo potrdite prejemnike, stroške in zasebnost.' });
    if (approve) {
      const error = validatePlan(plan);
      if (error) return sendJson(res, 409, { error });
      plan.approvedAt = new Date().toISOString();
    }
    plan.status = approve ? 'approved' : 'rejected';
    log('skrbnik', approve ? 'Plan odobren' : 'Plan zavrnjen', `${plan.items.filter((i) => i.chosen).length} uporabnikov, ${plan.estimatedCost} USDC`);
    sendJson(res, 200, plan);
  });
  route('GET', '/api/agent/plans/:id/execute', async (req, res, p) => {
    const plan = plans.get(p.id);
    res.writeHead(200, { 'Content-Type': 'text/event-stream', 'Cache-Control': 'no-cache', Connection: 'keep-alive' });
    const emit = (event, data) => res.write(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`);
    const validation = plan && plan.status === 'approved' ? validatePlan(plan) : 'Plan ni odobren.';
    if (validation || executingPlan) {
      emit('step', { kind: 'error', title: 'Izvedba blokirana', detail: executingPlan ? 'Druga kampanja se še izvaja.' : validation });
      emit('done', { plan });
      return res.end();
    }
    executingPlan = true;
    try { await executePlan(plan, emit); } finally { executingPlan = false; res.end(); }
  });
  route('POST', '/api/deliveries/:id/deliver', (req, res, p) => {
    const i = deliveries.findIndex((d) => d.id === p.id);
    if (i < 0) return sendJson(res, 404, { error: 'ni dostave' });
    const [d] = deliveries.splice(i, 1);
    const msg = addMessage(d.message);
    log('sistem', 'Simulacija dostavljena', `${msg.agentName}, ${CHANNELS[msg.channel]}`);
    sendJson(res, 200, { message: msg, state: publicState(req) });
  });
}
