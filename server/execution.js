import { randomUUID } from 'node:crypto';
import { CHANNELS } from '../scenarios.js';
import { round, sleep } from './utils.js';
import { policy, deliveries, plans, userById, simsThisMonth, addMessage, log } from './store.js';
import { agentById } from './marketplace.js';
import { skipReason } from './directory.js';
import { payAndCall } from './payments.js';

function randomDeliveryTime() {
  const d = new Date();
  d.setDate(d.getDate() + 1 + Math.floor(Math.random() * 4));
  if (d.getDay() === 6) d.setDate(d.getDate() + 2);
  if (d.getDay() === 0) d.setDate(d.getDate() + 1);
  const { from, to } = policy.workHours;
  d.setHours(from + Math.floor(Math.random() * (to - from)), Math.floor(Math.random() * 60), 0, 0);
  return d.toISOString();
}

async function executeItem(plan, item, emit) {
  item.status = 'running';
  const user = userById(item.userId);
  const generator = agentById(item.chosen.id);
  const reviewer = agentById(plan.reviewer.id);
  try {
    if (!reviewer.allowlisted || !reviewer.verified || reviewer.price > policy.maxPerTx || reviewer.rating < policy.minRating) throw new Error('Etični pregledovalec ni več dovoljen.');
    const unavailable = skipReason(user);
    if (unavailable) throw new Error(unavailable);
    if (plan.settings.frequency && simsThisMonth(user) >= plan.settings.frequency) throw new Error('Dosežena pogostost skupine.');
    emit('step', { kind: 'info', title: 'Minimizacija podatkov', detail: `Pošiljam samo: ${Object.entries(item.dataShared).map(([k, v]) => `${k}=${v}`).join(', ')}` });
    await sleep(300);
    const gen = await payAndCall(generator, { tactic: item.analysis.tactic, difficulty: item.analysis.difficulty, role: user.role, department: user.department, language: user.language, variant: item.dataShared.razlicica }, emit);
    item.totalCost = gen.tx.amount;
    const scenario = gen.body.scenario;
    emit('step', { kind: 'info', title: 'Prejeta simulacija', detail: `${CHANNELS[scenario.channel]} · »${scenario.subject}« · težavnost ${scenario.difficulty}` });

    const rev = await payAndCall(reviewer, { scenario }, emit);
    item.totalCost = round(item.totalCost + rev.tx.amount, 4);
    emit('step', { kind: rev.body.ethicsOk ? 'ok' : 'error', title: `Etični pregled: ${rev.body.ethicsOk ? 'odobreno' : 'zavrnjeno'}`, detail: `${rev.body.notes} Realističnost ${Math.round(rev.body.realism * 100)} %.` });
    if (!rev.body.ethicsOk) throw new Error('Simulacija ni prestala etičnega pregleda');

    const delivery = {
      id: randomUUID().slice(0, 8),
      deliverAt: randomDeliveryTime(),
      planId: plan.id,
      userId: user.id,
      message: {
        ...scenario,
        userId: user.id,
        planId: plan.id,
        simulation: true,
        agentId: generator.id,
        agentName: generator.name,
        cost: round(gen.tx.amount + rev.tx.amount, 4),
        txHashes: [gen.tx.txHash, rev.tx.txHash],
        realism: rev.body.realism,
        reason: item.analysis.reason,
      },
    };
    deliveries.push(delivery);
    item.status = 'done';
    item.totalCost = delivery.message.cost;
    item.deliveryId = delivery.id;
    log('glavni agent', 'Simulacija načrtovana', `${user.id}, dostava ob naključnem času: ${delivery.deliverAt}`);
    emit('step', { kind: 'ok', title: 'Simulacija načrtovana', detail: `Dostava ob naključnem času v delovnem času: ${new Date(delivery.deliverAt).toLocaleString('sl-SI')}` });
  } catch (err) {
    item.status = 'failed';
    item.error = err.message;
    log('glavni agent', 'Izvedba neuspešna', `${user.id}: ${err.message}`);
    emit('step', { kind: 'error', title: 'Izvedba za uporabnika prekinjena', detail: err.message });
  }
}

export async function executePlan(plan, emit) {
  plan.status = 'running';
  const ready = plan.items.filter((i) => i.chosen);
  for (const [n, item] of ready.entries()) {
    emit('step', { kind: 'user', title: `Uporabnik ${item.userId} (${n + 1}/${ready.length})`, detail: `${item.analysis.tacticLabel}, težavnost ${item.analysis.difficulty}/5 · ${item.chosen.name}` });
    await executeItem(plan, item, emit);
  }
  const done = ready.filter((i) => i.status === 'done').length;
  plan.totalCost = round(ready.reduce((s, i) => s + (i.totalCost || 0), 0), 4);
  plan.status = done === ready.length ? 'done' : done ? 'partial' : 'failed';
  emit('step', { kind: done ? 'ok' : 'error', title: `Zaključeno: ${done}/${ready.length} simulacij načrtovanih`, detail: `Skupaj plačano ${plan.totalCost} USDC` });
  emit('done', { plan });
}

export function startDeliveryScheduler() {
  // Deliver only scenarios produced by an explicitly approved campaign.
  return setInterval(() => {
    const now = Date.now();
    for (let i = deliveries.length - 1; i >= 0; i--) {
      const delivery = deliveries[i];
      if (Date.parse(delivery.deliverAt) > now) continue;
      deliveries.splice(i, 1);
      if (userById(delivery.userId)?.included && plans.get(delivery.planId)?.approvedAt) addMessage(delivery.message);
    }
  }, 10000).unref();
}
