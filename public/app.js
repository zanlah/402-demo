import { api } from './js/core/api.js';
import { refreshState } from './js/core/state.js';
import { configureRouter, render } from './js/core/router.js';
import { bindUiEvents, reportError } from './js/core/ui.js';
import { loginView, bindSessionEvents } from './js/features/session.js';
import { loadInbox, inboxView, bindInboxEvents } from './js/features/inbox.js';
import { progressView } from './js/features/progress.js';
import { loadUsers, usersView, bindUsersEvents } from './js/features/users.js';
import { loadGroups, groupsView, bindGroupsEvents } from './js/features/groups.js';
import { loadAgent, bindCampaignEvents } from './js/features/campaigns.js';
import { agentView } from './js/features/campaign-view.js';
import { loadMarket, marketView, bindMarketEvents } from './js/features/market.js';
import { loadPayments, paymentsView, bindPaymentsEvents } from './js/features/payments.js';
import { loadOrg, orgView, bindReportsEvents } from './js/features/reports.js';
import { loadRules, rulesView, bindRulesEvents } from './js/features/rules.js';

configureRouter({
  nabiralnik: [loadInbox, inboxView],
  napredek: [null, progressView],
  uporabniki: [loadUsers, usersView],
  skupine: [loadGroups, groupsView],
  agent: [loadAgent, agentView],
  trznica: [loadMarket, marketView],
  placila: [loadPayments, paymentsView],
  organizacija: [loadOrg, orgView],
  pravila: [loadRules, rulesView],
}, loginView);

for (const bind of [bindUiEvents, bindSessionEvents, bindInboxEvents, bindUsersEvents,
  bindGroupsEvents, bindCampaignEvents, bindMarketEvents, bindPaymentsEvents,
  bindReportsEvents, bindRulesEvents]) bind();

window.addEventListener('unhandledrejection', event => {
  event.preventDefault();
  reportError(event.reason);
});

async function init() {
  const { session } = await api('/api/session');
  if (session) { await refreshState(); await render(); }
  else loginView();
}
init().catch(reportError);
