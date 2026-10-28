import { randomUUID } from 'node:crypto';
import { TACTICS, CHANNELS } from '../scenarios.js';
import { ALL_TACTICS } from './config.js';
import { round } from './utils.js';
import { policy, plans, userById, userMessages, spentThisMonth, simsThisMonth, log } from './store.js';
import { wallet } from './wallet.js';
import { agents, agentById } from './marketplace.js';
import { skipReason } from './directory.js';
import { ORG } from './analytics.js';

export function analyzeUser(user) {
  const last = user.history[0];
  if (last && last.outcome === 'fail') {
    return {
      tactic: last.tactic,
      difficulty: user.level,
      reason: `Uporabnik je nasedel taktiki »${TACTICS[last.tactic].label}«. Ponovna vaja na isti taktiki pri težavnosti ${user.level}, da utrdi prepoznavanje.`,
    };
  }
  if (!last) {
    // brez lastne zgodovine izhaja iz anonimizirane analitike: najšibkejša taktika oddelka
    const weak = ORG.find((d) => d.name === user.department && d.n >= 5)?.weak;
    if (weak) {
      return { tactic: weak, difficulty: user.level, reason: `Prva simulacija. Uporabnik še nima zgodovine, zato agent izhaja iz najšibkejše taktike oddelka ${user.department}: »${TACTICS[weak].label}«.` };
    }
  }
  const ranked = ALL_TACTICS
    .filter((t) => t !== last?.tactic)
    .map((t) => {
      const s = user.stats[t];
      const failRate = s.seen ? s.failed / s.seen : 0.5; // neznano = srednje tveganje
      return { t, score: failRate + (s.seen === 0 ? 0.2 : 0) - s.seen * 0.05 };
    })
    .sort((a, b) => b.score - a.score);
  const tactic = ranked[0].t;
  const why = last?.outcome === 'success'
    ? `Uporabnik je prepoznal prejšnji napad, zato se težavnost dvigne na ${user.level}.`
    : last?.outcome === 'neutral'
      ? 'Uporabnik sporočilo prezrl, a ga ni prijavil. Težavnost ostane enaka.'
      : 'Prva simulacija.';
  const novelty = user.stats[tactic].seen === 0 ? 'še ni bila preizkušena' : 'ima najvišje tveganje';
  return { tactic, difficulty: user.level, reason: `${why} Taktika »${TACTICS[tactic].label}« ${novelty}.` };
}

// reserved: znesek, ki so ga v istem planu že rezervirali uporabniki pred tem
function evaluateAgents(user, tactic, lastChannel, reserved = 0, settings = {}) {
  const reviewer = agentById('ethicsguard');
  const budgetLeft = round(policy.monthlyBudget - spentThisMonth() - reserved, 4);
  return agents
    .filter((a) => a.kind === 'generator')
    .map((a) => {
      const reasons = [];
      if (!a.tactics.includes(tactic)) reasons.push('ne pokriva taktike');
      if (settings.channels && !settings.channels.includes(a.channel)) reasons.push('kanal ni izbran za kampanjo');
      if (!policy.channels[a.channel]) reasons.push(`kanal »${CHANNELS[a.channel]}« je onemogočen`);
      if (policy.allowlistOnly && !a.allowlisted) reasons.push('ni na odobrenem seznamu');
      if (policy.verifiedOnly && !a.verified) reasons.push('ponudnik ni preverjen');
      if (a.rating < policy.minRating) reasons.push(`ocena ${a.rating} < ${policy.minRating}`);
      if (policy.dataMinimization && a.requiresPersonalData) reasons.push('zahteva osebne podatke');
      if (a.price > policy.maxPerTx) reasons.push(`cena ${a.price} > limit ${policy.maxPerTx}`);
      if (a.price + reviewer.price > budgetLeft) reasons.push('presega preostanek proračuna');
      if (a.price + reviewer.price > wallet.balance - reserved) reasons.push('premalo sredstev v denarnici');
      const eligible = reasons.length === 0;
      const fit = (a.techFocus && /razvij|admin|devops|inženir|\bit\b/i.test(user.role) ? 4 : 0) + (a.channel !== lastChannel ? 3 : 0);
      const score = round(a.rating * 20 - a.price * 30 + fit, 1);
      return { id: a.id, name: a.name, channel: a.channel, price: a.price, rating: a.rating, eligible, reasons, score: eligible ? score : null };
    })
    .sort((x, y) => (y.score ?? -1) - (x.score ?? -1));
}
function planItem(user, reserved, settings = {}) {
  const analysis = analyzeUser(user);
  if (settings.difficulty) {
    analysis.difficulty = settings.difficulty;
    analysis.reason = `Zahtevnost skupine: ${settings.difficulty}/5. Prilagojena taktika glede na učni profil.`;
  }
  if (settings.channels?.length) {
    const supported = agents.filter(a => a.kind === 'generator' && settings.channels.includes(a.channel) && policy.channels[a.channel]).flatMap(a => a.tactics);
    if (!supported.includes(analysis.tactic) && supported.length) analysis.tactic = supported[0];
  }
  const lastChannel = userMessages(user).find((m) => m.simulation)?.channel;
  const candidates = evaluateAgents(user, analysis.tactic, lastChannel, reserved, settings);
  const chosen = candidates.find((c) => c.eligible);
  const reviewer = agentById('ethicsguard');
  return {
    userId: user.id,
    analysis: { ...analysis, reason: 'Taktika je prilagojena učnim potrebam in dovoljenim kanalom. Osebni odzivi ostanejo zasebni.', tacticLabel: TACTICS[analysis.tactic].label },
    candidates,
    chosen: chosen ? { id: chosen.id, name: chosen.name, price: chosen.price, channel: chosen.channel } : null,
    estimatedCost: chosen ? round(chosen.price + reviewer.price, 4) : 0,
    dataShared: { vloga: user.role, oddelek: user.department, jezik: user.language, taktika: analysis.tactic, tezavnost: analysis.difficulty, razlicica: user.stats[analysis.tactic].seen },
    status: chosen ? 'planned' : 'no_agent',
  };
}

// En plan zajema vse izbrane uporabnike: ena odobritev, nato plačilo x402 in simulacija za vsakega posebej.
export function createPlan(userIds, settings = {}) {
  const reviewer = agentById('ethicsguard');
  const items = [];
  const skipped = [];
  let reserved = 0;
  for (const id of new Set(userIds)) {
    const u = userById(id);
    const reason = skipReason(u) || (settings.frequency && simsThisMonth(u) >= settings.frequency ? 'dosežena pogostost skupine' : null);
    if (reason) {
      skipped.push({ userId: id, reason });
      continue;
    }
    const item = planItem(u, reserved, settings);
    reserved = round(reserved + item.estimatedCost, 4);
    items.push(item);
  }
  const ready = items.filter((i) => i.chosen);
  const plan = {
    id: randomUUID().slice(0, 8),
    createdAt: new Date().toISOString(),
    items,
    skipped,
    reviewer: { id: reviewer.id, name: reviewer.name, price: reviewer.price },
    estimatedCost: reserved,
    dataWithheld: ['ime in priimek', 'e-poštni naslov', 'vsebina nabiralnika', 'zgodovina odzivov'],
    name: settings.name || 'Varnostno usposabljanje',
    groupId: settings.groupId || null,
    groupName: settings.groupName || 'Izbrani zaposleni',
    settings,
    requiresApproval: true,
    status: ready.length ? 'pending' : 'no_agent',
  };
  plans.set(plan.id, plan);
  log('glavni agent', 'Pripravljen plan', `${ready.length} uporabnikov, ocena ${plan.estimatedCost} USDC${skipped.length ? `, ${skipped.length} izpuščenih` : ''}`);
  return plan;
}
export function validatePlan(plan) {
  const ready = plan.items.filter(i => i.chosen);
  if (plan.estimatedCost > policy.monthlyBudget - spentThisMonth() + 0.000001) return 'Skupni strošek presega preostali mesečni proračun.';
  if (plan.estimatedCost > wallet.balance) return 'V denarnici ni dovolj sredstev za celotno kampanjo.';
  for (const item of ready) {
    const reason = skipReason(userById(item.userId));
    if (reason) return `Prejemnik ni več pripravljen: ${reason}. Pripravite nov načrt.`;
    if (plan.settings.frequency && simsThisMonth(userById(item.userId)) >= plan.settings.frequency) return 'Dosežena pogostost skupine.';
    for (const id of [item.chosen.id, plan.reviewer.id]) {
      const a = agentById(id);
      if (!a?.allowlisted || !a.verified || a.requiresPersonalData || a.price > policy.maxPerTx || a.rating < policy.minRating || (a.channel && !policy.channels[a.channel])) return 'Ponudnik ne ustreza več pravilom. Pripravite nov načrt.';
    }
  }
  return null;
}
