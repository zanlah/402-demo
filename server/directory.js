import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { LEGIT_MESSAGES, generateScenario } from '../scenarios.js';
import { ALL_TACTICS } from './config.js';
import { users, groups, deliveries, policy, log, addMessage, minutesAgo, userById, userMessages, simsThisMonth } from './store.js';

function newPseudonym() {
  let id;
  do id = `U-${1000 + Math.floor(Math.random() * 9000)}`;
  while (userById(id));
  return id;
}

function addUser({ name, email, role, department, language = 'sl', included = true, id = newPseudonym() }) {
  const u = {
    id,
    name,
    email,
    role,
    department,
    language,
    included,
    addedAt: new Date().toISOString(),
    level: 2,
    points: 0,
    stats: Object.fromEntries(ALL_TACTICS.map((t) => [t, { seen: 0, failed: 0, reported: 0 }])),
    history: [],
  };
  users.push(u);
  LEGIT_MESSAGES.forEach((m, i) => addMessage({ ...m, userId: u.id, simulation: false, receivedAt: minutesAgo(40 + i * 75) }));
  return u;
}

// Izhodiščna simulacija (predloga, brez plačila) za demo uporabnika. Uvoženi uporabniki prvo simulacijo dobijo prek plana.
function deliverBaseline(u) {
  addMessage({
    ...generateScenario({ channel: 'email', tactic: 'avtoriteta', difficulty: 2, role: u.role, department: u.department }),
    userId: u.id,
    simulation: true,
    agentId: 'baseline',
    agentName: 'Izhodiščna simulacija',
    cost: 0,
    receivedAt: minutesAgo(12),
  });
  log('sistem', 'Izhodiščna simulacija dostavljena', `${u.id}, taktika: avtoriteta, težavnost 2`);
}

export function importUsers(rows, includeNew) {
  let added = 0;
  let updated = 0;
  for (const r of rows) {
    const existing = users.find((u) => u.email === r.email);
    if (existing) {
      Object.assign(existing, { name: r.name, role: r.role, department: r.department, language: r.language });
      updated += 1;
    } else {
      addUser({ ...r, included: includeNew });
      added += 1;
    }
  }
  return { added, updated };
}

export function setIncluded(u, included) {
  u.included = included;
  if (!included) {
    // izključenemu uporabniku se nedostavljene simulacije prekličejo
    for (let i = deliveries.length - 1; i >= 0; i--) if (deliveries[i].userId === u.id) deliveries.splice(i, 1);
  }
}

export const publicUser = (u) => ({
  id: u.id,
  name: u.name,
  email: u.email,
  role: u.role,
  department: u.department,
  language: u.language,
  included: u.included,

  skipReason: skipReason(u), // zakaj uporabnik trenutno ne more v nov plan (null = lahko)
});

// Imenik (kdo je uvožen in kdo je vključen) se shrani na disk, da preživi ponovni zagon.
// Zgodovina odzivov, nabiralniki in plani ostanejo v pomnilniku kot preostanek prototipa.
const USERS_FILE = process.env.USERS_FILE || fileURLToPath(new URL('../.uporabniki.json', import.meta.url));
const GROUPS_FILE = process.env.GROUPS_FILE || fileURLToPath(new URL('../.skupine.json', import.meta.url));
export const saveGroups = () => writeFileSync(GROUPS_FILE, JSON.stringify(groups, null, 2));
const DIRECTORY_FIELDS = ['id', 'name', 'email', 'role', 'department', 'language', 'included'];
export const saveUsers = () =>
  writeFileSync(USERS_FILE, JSON.stringify(users.map((u) => Object.fromEntries(DIRECTORY_FIELDS.map((k) => [k, u[k]]))), null, 2));
const hasOpenSimulation = (u) => userMessages(u).some((m) => m.simulation && !m.resolved) || deliveries.some((d) => d.userId === u.id);

export function skipReason(u) {
  if (!u) return 'uporabnik ne obstaja';
  if (!u.included) return 'ni vključen v program simulacij';
  if (hasOpenSimulation(u)) return 'še ni odziva na prejšnjo simulacijo';
  if (simsThisMonth(u) >= policy.maxSimsPerMonth) return `dosežena omejitev ${policy.maxSimsPerMonth} simulacij na mesec`;
  return null;
}

export function initializeDirectory() {
  const demoUser = addUser({ id: 'U-1042', name: 'Luka Horvat', email: 'luka.horvat@podjetje.si', role: 'Razvijalec', department: 'Razvoj' });
  deliverBaseline(demoUser);

  if (existsSync(USERS_FILE)) {
    for (const saved of JSON.parse(readFileSync(USERS_FILE, 'utf8'))) {
      const u = userById(saved.id);
      if (u) Object.assign(u, saved);
      else addUser(saved);
    }
  }

  if (existsSync(GROUPS_FILE)) groups.push(...JSON.parse(readFileSync(GROUPS_FILE, 'utf8')));
}
