import { TACTICS } from '../scenarios.js';
import { ALL_TACTICS } from './config.js';
import { users, messages, policy, userById } from './store.js';

export function respond(msg, actionId, responseMs, explanation = '') {
  if (msg.resolved) return { error: 'Sporočilo je že obravnavano.' };
  if (!msg.simulation) {
    msg.resolved = { action: actionId, at: new Date().toISOString() };
    if (actionId === 'report') {
      return { outcome: 'false_positive', title: 'Hvala za previdnost', message: 'To sporočilo je bilo pristno, a prijava ni napaka. Boljše preveriti kot nasesti.', points: 0 };
    }
    return { outcome: 'legit', title: 'V redu', message: 'Pristno sporočilo.', points: 0 };
  }
  const action = msg.actions.find((a) => a.id === actionId);
  if (!action) return { error: 'Neznano dejanje.' };
  const outcome = action.outcome;
  const user = userById(msg.userId);
  const s = user.stats[msg.tactic];
  s.seen += 1;
  if (outcome === 'fail') s.failed += 1;
  if (outcome === 'success') s.reported += 1;

  const levelBefore = user.level;
  if (outcome === 'success') user.level = Math.min(5, user.level + 1);
  if (outcome === 'fail') user.level = Math.max(1, user.level - 1);
  const points = outcome === 'success' ? 10 + Math.max(0, 5 - Math.floor(responseMs / 60000)) : outcome === 'neutral' ? 2 : 0;
  user.points += points;

  msg.resolved = { action: actionId, outcome, at: new Date().toISOString(), responseMs };
  user.history.unshift({
    at: msg.resolved.at,
    messageId: msg.id,
    subject: msg.subject,
    channel: msg.channel,
    tactic: msg.tactic,
    difficulty: msg.difficulty,
    outcome,
    action: action.label,
    responseMs,
    explanation: String(explanation).slice(0, 500),
  });
  // Individual learning outcomes never enter the administrator's audit trail.

  const t = TACTICS[msg.tactic];
  const titles = { success: 'Odlično, prepoznali ste napad', fail: 'To je bila simulacija napada', neutral: 'Niste nasedli, a niste prijavili' };
  const texts = {
    success: 'Sporočilo ste prijavili. Prav tako bi ravnali ob pravem napadu, saj prijava zaščiti tudi sodelavce.',
    fail: 'Ni panike, zato vadimo. Ni se zgodilo nič, vaši podatki niso nikamor odšli. Poglejte znake, ki bi vas lahko opozorili.',
    neutral: 'Sporočila niste odprli, kar je dobro. Ob pravem napadu je prijava pomembna, ker varnostni ekipi omogoči, da zaščiti še druge.',
  };
  return {
    outcome,
    title: titles[outcome],
    message: texts[outcome],
    tactic: { key: msg.tactic, ...t },
    redFlags: msg.redFlags,
    points,
    levelBefore,
    levelAfter: user.level,
  };
}
export function purgeExpiredLearning() {
  const cutoff = Date.now() - policy.retentionDays * 86400000;
  for (const u of users) {
    const kept = u.history.filter(h => Date.parse(h.at) >= cutoff);
    if (kept.length === u.history.length) continue;
    u.history = kept;
    u.stats = Object.fromEntries(ALL_TACTICS.map(t => [t, { seen: 0, failed: 0, reported: 0 }]));
    for (const h of kept) {
      const stat = u.stats[h.tactic];
      stat.seen++;
      if (h.outcome === 'fail') stat.failed++;
      if (h.outcome === 'success') stat.reported++;
    }
    u.points = kept.reduce((sum, h) => sum + (h.outcome === 'success' ? 10 + Math.max(0, 5 - Math.floor(h.responseMs / 60000)) : h.outcome === 'neutral' ? 2 : 0), 0);
    u.level = 2;
    for (const h of [...kept].reverse()) u.level = Math.max(1, Math.min(5, u.level + (h.outcome === 'success' ? 1 : h.outcome === 'fail' ? -1 : 0)));
  }
  for (let i = messages.length - 1; i >= 0; i--) {
    if (messages[i].resolved && Date.parse(messages[i].resolved.at) < cutoff) messages.splice(i, 1);
  }
}
export function learnerMessage(m) {
  const { agentId, agentName, cost, txHashes, reason, realism, planId, ...message } = m;
  return message;
}
