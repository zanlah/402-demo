import { S, refreshState } from '../core/state.js';
import { api } from '../core/api.js';
import { $ } from '../core/format.js';
import { render, currentView } from '../core/router.js';
import { toast } from '../core/ui.js';
import { on } from '../core/events.js';
import { logHtml } from './campaign-view.js';

export async function loadAgent() {
  [S.data.plans, S.data.users, S.data.groups] = await Promise.all([api('/api/agent/plans'), api('/api/users'), api('/api/groups')]);
  if (S.plan) S.plan = S.data.plans.find(p => p.id === S.plan.id) || null;
  else S.plan = S.data.plans.find(p => ['pending', 'approved'].includes(p.status)) || null;
  // privzeto so izbrani vsi, ki so trenutno lahko v testu
  if (!S.pick) S.pick = new Set(S.data.users.filter((u) => !u.skipReason).map((u) => u.id));
  for (const u of S.data.users) if (u.skipReason) S.pick.delete(u.id);
}
async function makePlan(userIds = [...S.pick]) {
  S.planError = null;
  S.runLog = [];
  try {
    S.plan = await api('/api/agent/plan', { method: 'POST', body: { userIds, groupId: S.campaignGroup || undefined, name: S.campaignName } });
  } catch (e) {
    S.plan = null;
    S.planError = e.message;
  }
  await render();
  if (S.plan?.status === 'approved') runPlan();
}

async function decide(approve) {
  S.plan = await api(`/api/agent/plans/${S.plan.id}/decision`, { method: 'POST', body: { approve, checklist: Object.fromEntries(['recipients', 'cost', 'privacy'].map(k => [k, !!document.querySelector(`[data-approval="${k}"]`)?.checked])) } });
  await render();
  if (approve) runPlan();
}

function runPlan() {
  if (S.running) return;
  S.running = true;
  S.runLog = [];
  const updateLog = () => {
    const el = $('#log');
    if (el) el.innerHTML = logHtml();
  };
  updateLog();
  const es = new EventSource(`/api/agent/plans/${S.plan.id}/execute`);
  es.addEventListener('step', (e) => {
    S.runLog.push(JSON.parse(e.data));
    updateLog();
  });
  es.addEventListener('done', async (e) => {
    es.close();
    S.running = false;
    const d = JSON.parse(e.data);
    if (d.plan) S.plan = d.plan;
    await refreshState();
    if (currentView() === 'agent') render();
    const n = d.plan?.items.filter((i) => i.status === 'done').length;
    if (n) toast(`Pripravljenih in plačanih simulacij: ${n}.`);
    else toast('Kampanja ni bila izvedena. Preverite dnevnik in pravila porabe.', 7000);
  });
  es.onerror = () => {
    es.close();
    S.running = false;
    toast('Povezava z izvajanjem je bila prekinjena. Osvežite kampanjo in preverite dejansko stanje; plačila se ne ponovijo samodejno.', 9000);
  };
}

async function deliverPlan(id) {
  const r = await api(`/api/agent/plans/${id}/deliver`, { method: 'POST' });
  if (S.plan?.id === id) S.plan.delivered = true;
  S.state = r.state;
  render();
  toast(`Dostavljenih simulacij: ${r.delivered}. Zaposleni jih vidi ob prijavi v svoj učni portal.`, 7000);
}

export function bindCampaignEvents() {
  on('click', '[data-plan]', () => makePlan());
  on('click', '[data-run-plan]', runPlan);
  on('click', '[data-deliver-plan]', button => deliverPlan(button.dataset.deliverPlan));
  on('click', '[data-decide]', button => decide(button.dataset.decide === '1'));
  on('click', '[data-pick]', button => {
    S.pick = new Set(button.dataset.pick === 'all' ? S.data.users.filter(u => !u.skipReason).map(u => u.id) : []);
    return render(false);
  });
  on('click', '[data-pick-dept]', button => {
    const ids = S.data.users.filter(u => !u.skipReason && u.department === button.dataset.pickDept).map(u => u.id);
    const allOn = ids.every(id => S.pick.has(id));
    ids.forEach(id => allOn ? S.pick.delete(id) : S.pick.add(id));
    return render(false);
  });
  on('click', '[data-open-plan]', button => {
    S.plan = S.data.plans.find(p => p.id === button.dataset.openPlan);
    S.planError = null;
    return render(false);
  });
  on('change', '[data-pick-user]', input => {
    input.checked ? S.pick.add(input.dataset.pickUser) : S.pick.delete(input.dataset.pickUser);
    return render(false);
  });
  on('change', '[data-approval]', () => {
    $('[data-decide="1"]').disabled = ![...document.querySelectorAll('[data-approval]')].every(input => input.checked);
  });
  on('change', '#campaign-group', input => { S.campaignGroup = input.value; return render(false); });
  on('input', '#campaign-name', input => { S.campaignName = input.value; });
}
