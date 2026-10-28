import { TACTICS, CHANNELS } from '../scenarios.js';
import { users, policy, sessionUser, simsThisMonth, spentThisMonth } from './store.js';
import { publicUser } from './directory.js';
import { wallet } from './wallet.js';

export function publicState(req) {
  const common = { session: req.session, tactics: TACTICS, channels: CHANNELS, retentionDays: policy.retentionDays };
  if (req.session.role === 'employee') {
    const user = sessionUser(req);
    const { history, ...profile } = user;
    return { ...common, user: { ...profile, history: history.map(({ agentName, ...h }) => h) },
      sims: { thisMonth: simsThisMonth(user), max: policy.maxSimsPerMonth }, pendingDeliveries: [] };
  }
  return { ...common, users: users.map(publicUser), wallet,
    budget: { limit: policy.monthlyBudget, spent: spentThisMonth() },
    sims: { max: policy.maxSimsPerMonth }, pendingDeliveries: [] };
}
