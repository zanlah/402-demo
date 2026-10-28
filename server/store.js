import { randomUUID } from 'node:crypto';
import { round } from './utils.js';

export const policy = {
  monthlyBudget: 3.0,
  maxPerTx: 0.25,
  minRating: 4.0,
  requireApproval: true,
  allowlistOnly: true,
  verifiedOnly: true,
  dataMinimization: true,
  maxSimsPerMonth: 6,
  retentionDays: 90,
  channels: { email: true, sms: true, chat: true, glas: false },
  blockedTopics: ['odpuščanje', 'odpoved', 'bonus', 'plača', 'zdravje', 'bolezen', 'smrt', 'nesreča', 'družina'],
  workHours: { from: 8, to: 16 },
};

// ---------------------------------------------------------------------------
// Uporabniki (imenik organizacije) in stanje
// Ime in e-pošta ostaneta v organizaciji. Glavni agent in zunanji agenti vidijo samo psevdonim, vlogo in oddelek.
// ---------------------------------------------------------------------------
export const users = [];
export const sessions = new Map();
export const groups = [];
export const messages = []; // nabiralniki vseh uporabnikov (polje userId)
export const deliveries = []; // simulacije, ki čakajo na naključni čas dostave
export const transactions = [];
export const plans = new Map();
export const audit = [];

export function log(actor, action, detail = '') {
  audit.unshift({ at: new Date().toISOString(), actor, action, detail });
  if (audit.length > 200) audit.pop();
}

export function addMessage(m) {
  const msg = { id: randomUUID().slice(0, 8), receivedAt: new Date().toISOString(), read: false, resolved: null, ...m };
  messages.unshift(msg);
  messages.sort((a, b) => b.receivedAt.localeCompare(a.receivedAt));
  return msg;
}

export const minutesAgo = (m) => new Date(Date.now() - m * 60000).toISOString();
export const userById = (id) => users.find((u) => u.id === id);
export const sessionUser = req => userById(req.session?.userId);
export const userMessages = (u) => messages.filter((m) => m.userId === u.id);
const monthKey = (iso) => iso.slice(0, 7);
export const spentThisMonth = () => {
  const m = monthKey(new Date().toISOString());
  return round(transactions.filter((t) => monthKey(t.at) === m).reduce((s, t) => s + t.amount, 0), 4);
};
export const simsThisMonth = (u) => {
  const m = monthKey(new Date().toISOString());
  return messages.filter((x) => x.userId === u.id && x.simulation && monthKey(x.receivedAt) === m).length + deliveries.filter((d) => d.userId === u.id).length;
};
