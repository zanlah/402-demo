// CyberAgent Marketplace – prototip
// Strežnik brez zunanjih odvisnosti. Vsebuje:
//   1. specializirane agente kot plačljive HTTP storitve (x402: 402 Payment Required → X-PAYMENT → 200)
//   2. facilitator: simuliran (/facilitator/verify, /facilitator/settle) ali javni na Base Sepolia (X402_MODE=sepolia)
//   3. glavnega AI-agenta, ki analizira uporabnika, izbere agenta na tržnici in plača storitev
//   4. API za spletni vmesnik (nabiralnik, napredek, tržnica, plačila, organizacija, pravila)

import http from 'node:http';
import { createHash, createHmac, randomBytes, randomUUID } from 'node:crypto';
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { readFile } from 'node:fs/promises';
import { extname, join, normalize } from 'node:path';
import { fileURLToPath } from 'node:url';
import { TACTICS, CHANNELS, LEGIT_MESSAGES, generateScenario, scenarioText } from './scenarios.js';
import { createChain, EXPLORER, FACILITATOR_URL, FAUCET } from './chain.js';

const PORT = Number(process.env.PORT) || 4020;
const BASE = `http://localhost:${PORT}`;
const PUBLIC_DIR = fileURLToPath(new URL('./public/', import.meta.url));
// simulacija: lokalni facilitator in denarnica v pomnilniku; sepolia: pravi podpisi in poravnava na testnem omrežju
const REAL = process.env.X402_MODE === 'sepolia';

// ---------------------------------------------------------------------------
// x402 konstante (USDC na Base Sepolia – testno omrežje; denar ni pravi)
// ---------------------------------------------------------------------------
const NETWORK = 'base-sepolia';
const USDC_ASSET = '0x036CbD53842c5426634e7929541eC2318f3dCF7e';
const DECIMALS = 6;
const toAtomic = (usd) => String(Math.round(usd * 10 ** DECIMALS));
const fromAtomic = (atomic) => Number(atomic) / 10 ** DECIMALS;
const addressFor = (seed) => '0x' + createHash('sha256').update(seed).digest('hex').slice(0, 40);
const txHash = () => '0x' + randomBytes(32).toString('hex');
const b64 = (obj) => Buffer.from(JSON.stringify(obj)).toString('base64');
const unb64 = (str) => JSON.parse(Buffer.from(str, 'base64').toString('utf8'));
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const round = (n, d = 2) => Math.round(n * 10 ** d) / 10 ** d;

// Denarnica glavnega agenta. V simulaciji je podpis HMAC namesto EIP-712, ker je facilitator simuliran.
const WALLET_KEY = randomBytes(32);
const wallet = { address: addressFor('glavni-agent'), balance: 10.0, mode: REAL ? 'sepolia' : 'simulacija', network: 'base-sepolia', explorer: null, faucet: null };
const signers = new Map([[wallet.address, WALLET_KEY]]);
const usedNonces = new Set();

// ---------------------------------------------------------------------------
// Tržnica agentov
// ---------------------------------------------------------------------------
const ALL_TACTICS = Object.keys(TACTICS);
const agents = [
  { id: 'mailforge', name: 'MailForge', vendor: 'Phishlab d.o.o.', kind: 'generator', channel: 'email', tactics: ['avtoriteta', 'nujnost', 'radovednost'], price: 0.12, rating: 4.7, verified: true, allowlisted: true, requiresPersonalData: false, description: 'Realistična e-poštna phishing sporočila s petimi stopnjami težavnosti.' },
  { id: 'trustchain', name: 'TrustChain', vendor: 'SecureSim GmbH', kind: 'generator', channel: 'email', tactics: ['zaupanje'], price: 0.18, rating: 4.9, verified: true, allowlisted: true, requiresPersonalData: false, description: 'Simulira prevzem obstoječe e-poštne niti znanega sodelavca (thread hijacking).' },
  { id: 'devbait', name: 'DevBait', vendor: 'RedTeam Labs', kind: 'generator', channel: 'email', tactics: ['tehnicni', 'nujnost'], price: 0.1, rating: 4.5, verified: true, allowlisted: true, requiresPersonalData: false, techFocus: true, description: 'Napadi na tehnično osebje: GitHub, CI/CD, dostopni žetoni.' },
  { id: 'smishlab', name: 'SmishLab', vendor: 'MobileSec', kind: 'generator', channel: 'sms', tactics: ['nujnost'], price: 0.06, rating: 4.4, verified: true, allowlisted: true, requiresPersonalData: false, description: 'SMS prevare (smishing): paketi, doplačila, zaklep računa.' },
  { id: 'chatbait', name: 'ChatBait', vendor: 'CollabSec', kind: 'generator', channel: 'chat', tactics: ['zaupanje', 'tehnicni'], price: 0.09, rating: 4.6, verified: true, allowlisted: true, requiresPersonalData: false, techFocus: true, description: 'Sporočila v Teams/Slack: lažna IT podpora, zahteve za kode MFA.' },
  { id: 'voicemimic', name: 'VoiceMimic', vendor: 'SynthVoice AI', kind: 'generator', channel: 'glas', tactics: ['avtoriteta'], price: 0.45, rating: 4.8, verified: true, allowlisted: false, requiresPersonalData: false, description: 'Glasovna sporočila s sintetiziranim glasom (vishing). Zahteva posebno odobritev.' },
  { id: 'osint', name: 'OSINT Profiler', vendor: 'DeepTrace', kind: 'generator', channel: 'email', tactics: ['zaupanje', 'avtoriteta'], price: 0.3, rating: 4.3, verified: true, allowlisted: true, requiresPersonalData: true, description: 'Iz javnih virov (LinkedIn, splet) zbere osebne podatke za ciljno usmerjen napad.' },
  { id: 'cheapphish', name: 'CheapPhish', vendor: 'neznan', kind: 'generator', channel: 'email', tactics: ALL_TACTICS, price: 0.02, rating: 3.1, verified: false, allowlisted: false, requiresPersonalData: false, description: 'Poceni masovno generiranje phishing predlog. Ponudnik ni preverjen.' },
  { id: 'ethicsguard', name: 'EthicsGuard QA', vendor: 'TrustLab', kind: 'reviewer', channel: null, tactics: [], price: 0.02, rating: 4.8, verified: true, allowlisted: true, requiresPersonalData: false, description: 'Neodvisen pregled realističnosti in etičnosti simulacije pred dostavo.' },
].map((a) => ({ ...a, payTo: addressFor(a.id), calls: 0, earned: 0 }));
const agentById = (id) => agents.find((a) => a.id === id);

const chain = REAL ? createChain(agents.map((a) => a.id)) : null;
if (chain) {
  wallet.address = chain.payerAddress;
  wallet.balance = 0;
  wallet.explorer = `${EXPLORER}/address/${chain.payerAddress}`;
  wallet.faucet = FAUCET;
  agents.forEach((a) => (a.payTo = chain.agentAddresses[a.id]));
}

// Lastnikova denarnica (MetaMask): polni denarnico agenta in prejme vračilo neporabljenih sredstev.
// Povezava in zgodovina polnitev se shranita na disk, ker sredstva na verigi preživijo ponovni zagon.
const OWNER_FILE = fileURLToPath(new URL('./.lastnik.json', import.meta.url));
const saved = REAL && existsSync(OWNER_FILE) ? JSON.parse(readFileSync(OWNER_FILE, 'utf8')) : {};
wallet.owner = saved.owner || null;
const funding = saved.funding || []; // polnitve in vračila (niso poraba, zato ne štejejo v proračun)
const saveOwner = () => REAL && writeFileSync(OWNER_FILE, JSON.stringify({ owner: wallet.owner, funding }, null, 2));
const ownerChallenges = new Map();

// Javni facilitator si deli račun za plin z mnogimi uporabniki, zato poravnava občasno pade zaradi tekme
// za nonce. Ponovni poskus je varen: podpisano avtorizacijo EIP-3009 lahko veriga porabi le enkrat.
async function settleWithRetry(url, body, attempts = 6) {
  let last;
  for (let i = 0; i < attempts; i++) {
    if (i) await sleep(2000 * i);
    last = await postJson(url, body);
    if (last.body.success) return last;
    console.warn(`Poravnava ni uspela (poskus ${i + 1}/${attempts}): ${shortError(last.body)}`);
  }
  return last;
}
const shortError = (b) => String(b.errorReason || b.error || b.invalidReason || 'neznana napaka').split(/\n| URL: | Request body: /)[0].slice(0, 200);

// Neposreden prenos USDC prek javnega facilitatorja: podpisano avtorizacijo EIP-3009 preveri in poravna na verigi.
async function facilitatorTransfer(payment, requirements) {
  const body = { x402Version: 1, paymentPayload: payment, paymentRequirements: requirements };
  const verify = await postJson(`${FACILITATOR_URL}/verify`, body);
  if (!verify.body.isValid) throw new Error(shortError(verify.body));
  const settle = await settleWithRetry(`${FACILITATOR_URL}/settle`, body);
  if (!settle.body.success) throw new Error(shortError(settle.body));
  return settle.body.transaction;
}

function transferRequirements(payTo, value, description) {
  return { scheme: 'exact', network: NETWORK, maxAmountRequired: value, resource: `${BASE}/api/wallet`, description, mimeType: 'application/json', payTo, maxTimeoutSeconds: 300, asset: USDC_ASSET, extra: { name: 'USDC', version: '2' } };
}

function recordFunding(type, amount, transaction, address) {
  const f = { id: randomUUID().slice(0, 8), at: new Date().toISOString(), type, amount, address, txHash: transaction, explorer: `${EXPLORER}/tx/${transaction}` };
  funding.unshift(f);
  saveOwner();
  return f;
}

// V pravem načinu je stanje denarnice stanje USDC na verigi.
async function refreshBalance() {
  if (!chain) return;
  try {
    wallet.balance = round(await chain.usdcBalance(), 6);
  } catch (err) {
    console.error('Branje stanja USDC ni uspelo:', err.shortMessage || err.message);
  }
}

// ---------------------------------------------------------------------------
// Pravila organizacije (nadzor stroškov, podatkov, etike)
// ---------------------------------------------------------------------------
const policy = {
  monthlyBudget: 3.0,
  maxPerTx: 0.25,
  minRating: 4.0,
  requireApproval: true,
  allowlistOnly: true,
  verifiedOnly: true,
  dataMinimization: true,
  maxSimsPerMonth: 6,
  channels: { email: true, sms: true, chat: true, glas: false },
  blockedTopics: ['odpuščanje', 'odpoved', 'bonus', 'plača', 'zdravje', 'bolezen', 'smrt', 'nesreča', 'družina'],
  workHours: { from: 8, to: 16 },
};

// ---------------------------------------------------------------------------
// Uporabniki (imenik organizacije) in stanje
// Ime in e-pošta ostaneta v organizaciji. Glavni agent in zunanji agenti vidijo samo psevdonim, vlogo in oddelek.
// ---------------------------------------------------------------------------
const users = [];
let activeUserId = null; // uporabnik, čigar nabiralnik je prikazan v pogledu »Zaposleni«
const messages = []; // nabiralniki vseh uporabnikov (polje userId)
const deliveries = []; // simulacije, ki čakajo na naključni čas dostave
const transactions = [];
const plans = new Map();
const audit = [];

function log(actor, action, detail = '') {
  audit.unshift({ at: new Date().toISOString(), actor, action, detail });
  if (audit.length > 200) audit.pop();
}

function addMessage(m) {
  const msg = { id: randomUUID().slice(0, 8), receivedAt: new Date().toISOString(), read: false, resolved: null, ...m };
  messages.unshift(msg);
  messages.sort((a, b) => b.receivedAt.localeCompare(a.receivedAt));
  return msg;
}

const minutesAgo = (m) => new Date(Date.now() - m * 60000).toISOString();
const userById = (id) => users.find((u) => u.id === id);
const activeUser = () => userById(activeUserId);
const userMessages = (u) => messages.filter((m) => m.userId === u.id);

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

// Preprost uvoz CSV: glava z ime, e-pošta, vloga, oddelek (jezik neobvezno), ločilo vejica ali podpičje.
const CSV_COLUMNS = {
  name: ['ime', 'ime in priimek', 'name'],
  email: ['email', 'e-pošta', 'e-posta', 'eposta', 'mail'],
  role: ['vloga', 'role', 'delovno mesto'],
  department: ['oddelek', 'department'],
  language: ['jezik', 'language'],
};

function parseUsersCsv(text) {
  const lines = String(text || '').split(/\r?\n/).map((l) => l.trim()).filter(Boolean);
  if (lines.length < 2) return { error: 'CSV mora imeti vrstico z glavo in vsaj enega uporabnika.' };
  const sep = lines[0].includes(';') ? ';' : ',';
  const split = (l) => l.split(sep).map((c) => c.trim().replace(/^"|"$/g, ''));
  const header = split(lines[0]).map((h) => h.toLowerCase());
  const col = Object.fromEntries(Object.entries(CSV_COLUMNS).map(([k, names]) => [k, header.findIndex((h) => names.includes(h))]));
  const missing = ['name', 'email', 'role', 'department'].filter((k) => col[k] < 0);
  if (missing.length) return { error: `Manjkajo stolpci: ${missing.map((k) => CSV_COLUMNS[k][0]).join(', ')}.` };
  const rows = [];
  const errors = [];
  lines.slice(1).forEach((l, i) => {
    const c = split(l);
    const row = Object.fromEntries(Object.entries(col).map(([k, idx]) => [k, idx >= 0 ? c[idx] || '' : '']));
    if (!row.name || !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(row.email) || !row.role || !row.department) {
      errors.push(`vrstica ${i + 2}: manjka podatek ali neveljaven e-naslov`);
      return;
    }
    rows.push({ ...row, email: row.email.toLowerCase(), language: row.language || 'sl' });
  });
  return { rows, errors };
}

function importUsers(rows, includeNew) {
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

function setIncluded(u, included) {
  u.included = included;
  if (!included) {
    // izključenemu uporabniku se nedostavljene simulacije prekličejo
    for (let i = deliveries.length - 1; i >= 0; i--) if (deliveries[i].userId === u.id) deliveries.splice(i, 1);
  }
}

const publicUser = (u) => ({
  id: u.id,
  name: u.name,
  email: u.email,
  role: u.role,
  department: u.department,
  language: u.language,
  included: u.included,
  level: u.level,
  points: u.points,
  simulations: u.history.length,
  reported: u.history.filter((h) => h.outcome === 'success').length,
  skipReason: skipReason(u), // zakaj uporabnik trenutno ne more v nov plan (null = lahko)
});

// Imenik (kdo je uvožen in kdo je vključen) se shrani na disk, da preživi ponovni zagon.
// Zgodovina odzivov, nabiralniki in plani ostanejo v pomnilniku kot preostanek prototipa.
const USERS_FILE = fileURLToPath(new URL('./.uporabniki.json', import.meta.url));
const DIRECTORY_FIELDS = ['id', 'name', 'email', 'role', 'department', 'language', 'included'];
const saveUsers = () =>
  writeFileSync(USERS_FILE, JSON.stringify(users.map((u) => Object.fromEntries(DIRECTORY_FIELDS.map((k) => [k, u[k]]))), null, 2));

const demoUser = addUser({ id: 'U-1042', name: 'Luka Horvat', email: 'luka.horvat@podjetje.si', role: 'Razvijalec', department: 'Razvoj' });
deliverBaseline(demoUser);
activeUserId = demoUser.id;
if (existsSync(USERS_FILE)) {
  for (const saved of JSON.parse(readFileSync(USERS_FILE, 'utf8'))) {
    const u = userById(saved.id);
    if (u) Object.assign(u, saved);
    else addUser(saved);
  }
}

const monthKey = (iso) => iso.slice(0, 7);
const spentThisMonth = () => {
  const m = monthKey(new Date().toISOString());
  return round(transactions.filter((t) => monthKey(t.at) === m).reduce((s, t) => s + t.amount, 0), 4);
};
const simsThisMonth = (u) => {
  const m = monthKey(new Date().toISOString());
  return messages.filter((x) => x.userId === u.id && x.simulation && monthKey(x.receivedAt) === m).length + deliveries.filter((d) => d.userId === u.id).length;
};

// ---------------------------------------------------------------------------
// Simuliran facilitator x402
// ---------------------------------------------------------------------------
function signAuthorization(authorization) {
  return '0x' + createHmac('sha256', WALLET_KEY).update(JSON.stringify(authorization)).digest('hex');
}

function verifyPayment(paymentPayload, req) {
  if (paymentPayload?.x402Version !== 1) return { isValid: false, invalidReason: 'invalid_x402_version' };
  if (paymentPayload.scheme !== req.scheme || paymentPayload.network !== req.network) return { isValid: false, invalidReason: 'invalid_scheme_or_network' };
  const { signature, authorization: a } = paymentPayload.payload || {};
  if (!a || !signature) return { isValid: false, invalidReason: 'invalid_payload' };
  const key = signers.get(a.from);
  if (!key) return { isValid: false, invalidReason: 'unknown_payer' };
  const expected = '0x' + createHmac('sha256', key).update(JSON.stringify(a)).digest('hex');
  if (expected !== signature) return { isValid: false, invalidReason: 'invalid_signature' };
  if (a.to.toLowerCase() !== req.payTo.toLowerCase()) return { isValid: false, invalidReason: 'invalid_recipient' };
  if (BigInt(a.value) < BigInt(req.maxAmountRequired)) return { isValid: false, invalidReason: 'insufficient_amount' };
  const now = Math.floor(Date.now() / 1000);
  if (now < Number(a.validAfter) || now > Number(a.validBefore)) return { isValid: false, invalidReason: 'expired' };
  if (usedNonces.has(a.nonce)) return { isValid: false, invalidReason: 'nonce_already_used' };
  if (fromAtomic(a.value) > wallet.balance) return { isValid: false, invalidReason: 'insufficient_funds' };
  return { isValid: true, payer: a.from };
}

function settlePayment(paymentPayload, req) {
  const v = verifyPayment(paymentPayload, req);
  if (!v.isValid) return { success: false, errorReason: v.invalidReason, network: NETWORK };
  const a = paymentPayload.payload.authorization;
  usedNonces.add(a.nonce);
  const amount = fromAtomic(a.value);
  wallet.balance = round(wallet.balance - amount, 6);
  const agent = agents.find((x) => x.payTo === a.to);
  if (agent) agent.earned = round(agent.earned + amount, 6);
  return { success: true, transaction: txHash(), network: NETWORK, payer: a.from };
}

// ---------------------------------------------------------------------------
// Plačljiva storitev agenta (strežniška stran x402)
// ---------------------------------------------------------------------------
function paymentRequirements(agent) {
  return {
    scheme: 'exact',
    network: NETWORK,
    maxAmountRequired: toAtomic(agent.price),
    resource: `${BASE}/x402/agents/${agent.id}/service`,
    description: agent.kind === 'reviewer' ? `${agent.name}: pregled simulacije` : `${agent.name}: generiranje simulacije`,
    mimeType: 'application/json',
    payTo: agent.payTo,
    maxTimeoutSeconds: 60,
    asset: USDC_ASSET,
    extra: { name: 'USDC', version: '2' },
  };
}

function runAgentService(agent, input) {
  if (agent.kind === 'reviewer') {
    const text = scenarioText(input.scenario || {}).toLowerCase();
    const issues = policy.blockedTopics.filter((t) => text.includes(t.toLowerCase().slice(0, 6)));
    const d = input.scenario?.difficulty || 1;
    return {
      reviewer: agent.name,
      ethicsOk: issues.length === 0,
      issues,
      realism: round(0.55 + d * 0.08 + Math.random() * 0.05, 2),
      notes: issues.length ? `Najdene prepovedane teme: ${issues.join(', ')}` : 'Brez čustveno škodljivih tem. Primerno za dostavo.',
    };
  }
  if (agent.requiresPersonalData && !input.personalData) {
    return { error: 'Agent zahteva osebne podatke, ki jih ni prejel.' };
  }
  const scenario = generateScenario({ channel: agent.channel, tactic: input.tactic, difficulty: input.difficulty, role: input.role, department: input.department, variant: input.variant });
  return { generator: agent.name, scenario };
}

async function handleAgentService(req, res, agent) {
  const requirements = paymentRequirements(agent);
  const header = req.headers['x-payment'];
  if (!header) {
    return sendJson(res, 402, { x402Version: 1, error: 'X-PAYMENT header is required', accepts: [requirements] });
  }
  let payment;
  try {
    payment = unb64(header);
  } catch {
    return sendJson(res, 402, { x402Version: 1, error: 'invalid_payment_header', accepts: [requirements] });
  }
  const facilitator = REAL ? FACILITATOR_URL : `${BASE}/facilitator`;
  const verify = await postJson(`${facilitator}/verify`, { x402Version: 1, paymentPayload: payment, paymentRequirements: requirements });
  if (!verify.body.isValid) {
    return sendJson(res, 402, { x402Version: 1, error: shortError(verify.body), accepts: [requirements] });
  }
  const input = await readBody(req);
  const result = runAgentService(agent, input);
  const settle = await settleWithRetry(`${facilitator}/settle`, { x402Version: 1, paymentPayload: payment, paymentRequirements: requirements });
  if (!settle.body.success) {
    return sendJson(res, 402, { x402Version: 1, error: shortError(settle.body), accepts: [requirements] });
  }
  if (REAL) agent.earned = round(agent.earned + fromAtomic(requirements.maxAmountRequired), 6);
  agent.calls += 1;
  res.setHeader('X-PAYMENT-RESPONSE', b64(settle.body));
  res.setHeader('Access-Control-Expose-Headers', 'X-PAYMENT-RESPONSE');
  sendJson(res, 200, result);
}

// ---------------------------------------------------------------------------
// Glavni AI-agent
// ---------------------------------------------------------------------------
function analyzeUser(user) {
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
function evaluateAgents(user, tactic, lastChannel, reserved = 0) {
  const reviewer = agentById('ethicsguard');
  const budgetLeft = round(policy.monthlyBudget - spentThisMonth() - reserved, 4);
  return agents
    .filter((a) => a.kind === 'generator')
    .map((a) => {
      const reasons = [];
      if (!a.tactics.includes(tactic)) reasons.push('ne pokriva taktike');
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

// Uporabnik ne dobi nove simulacije, dokler se ne odzove na prejšnjo (ali ta še čaka na dostavo).
const hasOpenSimulation = (u) => userMessages(u).some((m) => m.simulation && !m.resolved) || deliveries.some((d) => d.userId === u.id);

function skipReason(u) {
  if (!u) return 'uporabnik ne obstaja';
  if (!u.included) return 'ni vključen v program simulacij';
  if (hasOpenSimulation(u)) return 'še ni odziva na prejšnjo simulacijo';
  if (simsThisMonth(u) >= policy.maxSimsPerMonth) return `dosežena omejitev ${policy.maxSimsPerMonth} simulacij na mesec`;
  return null;
}

function planItem(user, reserved) {
  const analysis = analyzeUser(user);
  const lastChannel = userMessages(user).find((m) => m.simulation)?.channel;
  const candidates = evaluateAgents(user, analysis.tactic, lastChannel, reserved);
  const chosen = candidates.find((c) => c.eligible);
  const reviewer = agentById('ethicsguard');
  return {
    userId: user.id,
    analysis: { ...analysis, tacticLabel: TACTICS[analysis.tactic].label },
    candidates,
    chosen: chosen ? { id: chosen.id, name: chosen.name, price: chosen.price, channel: chosen.channel } : null,
    estimatedCost: chosen ? round(chosen.price + reviewer.price, 4) : 0,
    dataShared: { vloga: user.role, oddelek: user.department, jezik: user.language, taktika: analysis.tactic, tezavnost: analysis.difficulty, razlicica: user.stats[analysis.tactic].seen },
    status: chosen ? 'planned' : 'no_agent',
  };
}

// En plan zajema vse izbrane uporabnike: ena odobritev, nato plačilo x402 in simulacija za vsakega posebej.
function createPlan(userIds) {
  const reviewer = agentById('ethicsguard');
  const items = [];
  const skipped = [];
  let reserved = 0;
  for (const id of new Set(userIds)) {
    const u = userById(id);
    const reason = skipReason(u);
    if (reason) {
      skipped.push({ userId: id, reason });
      continue;
    }
    const item = planItem(u, reserved);
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
    requiresApproval: policy.requireApproval,
    status: ready.length ? (policy.requireApproval ? 'pending' : 'approved') : 'no_agent',
  };
  plans.set(plan.id, plan);
  log('glavni agent', 'Pripravljen plan', `${ready.length} uporabnikov, ocena ${plan.estimatedCost} USDC${skipped.length ? `, ${skipped.length} izpuščenih` : ''}`);
  return plan;
}

// Klient x402 na strani glavnega agenta: zahteva → 402 → preveri pravila → podpiše → ponovi
async function payAndCall(agent, input, emit) {
  const url = `${BASE}/x402/agents/${agent.id}/service`;
  emit('step', { kind: 'request', title: `Zahteva storitve: ${agent.name}`, detail: `POST ${url.replace(BASE, '')}` });
  await sleep(500);
  const first = await postJson(url, input);
  if (first.status !== 402) throw new Error(`Pričakovan 402, prejet ${first.status}`);
  const req = first.body.accepts[0];
  emit('step', { kind: 'http402', title: '402 Payment Required', detail: `${fromAtomic(req.maxAmountRequired)} USDC → ${req.payTo.slice(0, 10)}…`, json: first.body });
  await sleep(600);

  const amount = fromAtomic(req.maxAmountRequired);
  await refreshBalance();
  const checks = [
    ['omrežje je testno', req.network === NETWORK],
    ['prejemnik ustreza registru tržnice', req.payTo === agent.payTo],
    [`znesek ≤ limit na transakcijo (${policy.maxPerTx})`, amount <= policy.maxPerTx],
    [`znesek ≤ preostanek proračuna (${round(policy.monthlyBudget - spentThisMonth(), 2)})`, amount <= policy.monthlyBudget - spentThisMonth()],
    ['dovolj sredstev v denarnici', amount <= wallet.balance],
  ];
  emit('step', { kind: 'policy', title: 'Preverjanje pravil porabe', checks: checks.map(([label, ok]) => ({ label, ok })) });
  if (checks.some(([, ok]) => !ok)) throw new Error('Plačilo zavrnjeno zaradi pravil porabe');
  await sleep(500);

  const now = Math.floor(Date.now() / 1000);
  const authorization = {
    from: wallet.address,
    to: req.payTo,
    value: req.maxAmountRequired,
    validAfter: String(now - 5),
    validBefore: String(now + req.maxTimeoutSeconds),
    nonce: txHash(),
  };
  const signature = chain ? await chain.signAuthorization(authorization, req.extra) : signAuthorization(authorization);
  const payment = { x402Version: 1, scheme: req.scheme, network: req.network, payload: { signature, authorization } };
  emit('step', { kind: 'sign', title: `Podpis avtorizacije plačila (EIP-3009${chain ? ', EIP-712' : ', simulirano'})`, detail: `nonce ${authorization.nonce.slice(0, 14)}…`, json: payment });
  await sleep(600);

  if (chain) emit('step', { kind: 'info', title: 'Poravnava na verigi', detail: `Facilitator ${FACILITATOR_URL} preveri podpis in izvede prenos USDC na Base Sepolia …` });
  const second = await postJson(url, input, { 'X-PAYMENT': b64(payment) });
  if (second.status !== 200) throw new Error(`Plačilo ni uspelo: ${second.body.error}`);
  const settlement = unb64(second.headers.get('x-payment-response'));
  await refreshBalance();
  const tx = {
    id: randomUUID().slice(0, 8),
    at: new Date().toISOString(),
    agentId: agent.id,
    agentName: agent.name,
    amount,
    asset: 'USDC',
    network: settlement.network,
    txHash: settlement.transaction,
    explorer: chain ? `${EXPLORER}/tx/${settlement.transaction}` : null,
    payTo: req.payTo,
    purpose: req.description,
  };
  transactions.unshift(tx);
  log('glavni agent', 'Plačilo x402', `${amount} USDC → ${agent.name} (${tx.txHash.slice(0, 12)}…)`);
  emit('step', { kind: 'paid', title: `200 OK – plačano ${amount} USDC`, detail: `tx ${settlement.transaction.slice(0, 18)}…`, json: { 'X-PAYMENT-RESPONSE': settlement }, tx });
  await sleep(400);
  return { body: second.body, tx };
}

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
    if (!user.included) throw new Error(`Uporabnik ${user.id} je bil medtem izključen iz programa`);
    emit('step', { kind: 'info', title: 'Minimizacija podatkov', detail: `Pošiljam samo: ${Object.entries(item.dataShared).map(([k, v]) => `${k}=${v}`).join(', ')}` });
    await sleep(300);
    const gen = await payAndCall(generator, { tactic: item.analysis.tactic, difficulty: item.analysis.difficulty, role: user.role, department: user.department, language: user.language, variant: item.dataShared.razlicica }, emit);
    const scenario = gen.body.scenario;
    emit('step', { kind: 'info', title: 'Prejeta simulacija', detail: `${CHANNELS[scenario.channel]} · »${scenario.subject}« · težavnost ${scenario.difficulty}` });

    const rev = await payAndCall(reviewer, { scenario }, emit);
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

async function executePlan(plan, emit) {
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

// ---------------------------------------------------------------------------
// Odziv uporabnika na sporočilo
// ---------------------------------------------------------------------------
function respond(msg, actionId, responseMs) {
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
    agentName: msg.agentName,
  });
  log('uporabnik ' + user.id, 'Odziv na simulacijo', `${action.label} → ${outcome}`);

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

// ---------------------------------------------------------------------------
// Anonimizirana analitika organizacije (k-anonimnost: oddelki z < 5 osebami skriti)
// ---------------------------------------------------------------------------
const ORG = [
  { name: 'Razvoj', n: 24, click: 0.21, report: 0.46, minutes: 14, trend: [0.18, 0.24, 0.29, 0.35, 0.41, 0.46], weak: 'tehnicni' },
  { name: 'Finance', n: 11, click: 0.27, report: 0.38, minutes: 22, trend: [0.12, 0.17, 0.22, 0.28, 0.33, 0.38], weak: 'avtoriteta' },
  { name: 'Prodaja', n: 17, click: 0.34, report: 0.29, minutes: 31, trend: [0.1, 0.13, 0.17, 0.21, 0.26, 0.29], weak: 'nujnost' },
  { name: 'IT', n: 6, click: 0.17, report: 0.61, minutes: 7, trend: [0.38, 0.44, 0.49, 0.53, 0.58, 0.61], weak: 'zaupanje' },
  { name: 'Kadrovska služba', n: 5, click: 0.25, report: 0.4, minutes: 19, trend: [0.2, 0.23, 0.3, 0.33, 0.37, 0.4], weak: 'radovednost' },
  { name: 'Uprava', n: 3, click: 0.3, report: 0.35, minutes: 25, trend: [], weak: 'nujnost' },
];
function orgAnalytics() {
  const visible = ORG.filter((d) => d.n >= 5);
  const total = ORG.reduce((s, d) => s + d.n, 0);
  const avg = (k) => round(visible.reduce((s, d) => s + d[k] * d.n, 0) / visible.reduce((s, d) => s + d.n, 0), 2);
  return {
    kThreshold: 5,
    employees: total,
    clickRate: avg('click'),
    reportRate: avg('report'),
    medianMinutes: 16,
    months: ['maj', 'jun', 'jul', 'avg', 'sep', 'okt'],
    departments: ORG.map((d) => (d.n >= 5 ? { ...d, weakLabel: TACTICS[d.weak].label, hidden: false } : { name: d.name, n: d.n, hidden: true })),
    tactics: ALL_TACTICS.map((t, i) => ({ key: t, label: TACTICS[t].label, clickRate: [0.31, 0.29, 0.38, 0.24, 0.19][i] })),
  };
}

// ---------------------------------------------------------------------------
// HTTP
// ---------------------------------------------------------------------------
function sendJson(res, status, data) {
  res.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8' });
  res.end(JSON.stringify(data));
}

async function readBody(req) {
  if (req._body !== undefined) return req._body;
  const chunks = [];
  for await (const c of req) chunks.push(c);
  const raw = Buffer.concat(chunks).toString('utf8');
  try {
    req._body = raw ? JSON.parse(raw) : {};
  } catch {
    req._body = {};
  }
  return req._body;
}

async function postJson(url, body, headers = {}) {
  const r = await fetch(url, { method: 'POST', headers: { 'Content-Type': 'application/json', ...headers }, body: JSON.stringify(body) });
  return { status: r.status, headers: r.headers, body: await r.json() };
}

const routes = [];
function route(method, pattern, handler) {
  const keys = [];
  const re = new RegExp('^' + pattern.replace(/:(\w+)/g, (_, k) => (keys.push(k), '([^/]+)')) + '$');
  routes.push({ method, re, keys, handler });
}

function publicState() {
  const user = activeUser();
  return {
    user,
    users: users.map(({ id, name, department, included }) => ({ id, name, department, included })),
    wallet,
    budget: { limit: policy.monthlyBudget, spent: spentThisMonth() },
    sims: { thisMonth: simsThisMonth(user), max: policy.maxSimsPerMonth },
    pendingDeliveries: deliveries.filter((d) => d.userId === user.id).map((d) => ({ id: d.id, deliverAt: d.deliverAt, channel: d.message.channel })),
    tactics: TACTICS,
    channels: CHANNELS,
  };
}

// --- facilitator
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

// --- API za vmesnik
route('GET', '/api/state', async (req, res) => {
  await refreshBalance();
  sendJson(res, 200, publicState());
});
route('GET', '/api/messages', (req, res) => sendJson(res, 200, userMessages(activeUser())));
route('POST', '/api/messages/:id/read', (req, res, p) => {
  const m = messages.find((x) => x.id === p.id);
  if (m) m.read = true;
  sendJson(res, 200, { ok: true });
});
route('POST', '/api/messages/:id/action', async (req, res, p) => {
  const m = messages.find((x) => x.id === p.id);
  if (!m) return sendJson(res, 404, { error: 'ni sporočila' });
  const { action, responseMs } = await readBody(req);
  const result = respond(m, action, Number(responseMs) || 0);
  sendJson(res, result.error ? 400 : 200, { ...result, state: publicState(), item: m });
});
route('POST', '/api/deliveries/:id/deliver', (req, res, p) => {
  const i = deliveries.findIndex((d) => d.id === p.id);
  if (i < 0) return sendJson(res, 404, { error: 'ni dostave' });
  const [d] = deliveries.splice(i, 1);
  const msg = addMessage(d.message);
  log('sistem', 'Simulacija dostavljena', `${msg.agentName}, ${CHANNELS[msg.channel]}`);
  sendJson(res, 200, { message: msg, state: publicState() });
});

// --- uporabniki: uvoz, vključitev v program, preklop prikaza
route('GET', '/api/users', (req, res) => sendJson(res, 200, users.map(publicUser)));
route('POST', '/api/users/import', async (req, res) => {
  const { csv, includeNew = true } = await readBody(req);
  const parsed = parseUsersCsv(csv);
  if (parsed.error) return sendJson(res, 400, { error: parsed.error });
  const result = importUsers(parsed.rows, Boolean(includeNew));
  saveUsers();
  log('skrbnik', 'Uvoz uporabnikov', `${result.added} novih, ${result.updated} posodobljenih${parsed.errors.length ? `, ${parsed.errors.length} preskočenih` : ''}`);
  sendJson(res, 200, { ...result, skipped: parsed.errors, users: users.map(publicUser) });
});
route('POST', '/api/users/include', async (req, res) => {
  const { ids = [], department, included } = await readBody(req);
  const targets = department ? users.filter((u) => u.department === department) : users.filter((u) => ids.includes(u.id));
  targets.forEach((u) => setIncluded(u, Boolean(included)));
  saveUsers();
  log('skrbnik', included ? 'Vključeni v program' : 'Izključeni iz programa', department ? `oddelek ${department} (${targets.length})` : targets.map((u) => u.id).join(', '));
  sendJson(res, 200, users.map(publicUser));
});
route('POST', '/api/users/:id/activate', (req, res, p) => {
  if (!userById(p.id)) return sendJson(res, 404, { error: 'ni uporabnika' });
  activeUserId = p.id;
  sendJson(res, 200, publicState());
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

route('POST', '/api/agent/plan', async (req, res) => {
  const { userIds } = await readBody(req);
  const ids = Array.isArray(userIds) ? userIds : [activeUserId];
  if (!ids.length) return sendJson(res, 400, { error: 'Izberite vsaj enega uporabnika.' });
  sendJson(res, 200, createPlan(ids));
});
route('GET', '/api/agent/plans', (req, res) => sendJson(res, 200, [...plans.values()].reverse()));
route('POST', '/api/agent/plans/:id/deliver', (req, res, p) => {
  const due = deliveries.filter((d) => d.planId === p.id);
  due.forEach((d) => {
    deliveries.splice(deliveries.indexOf(d), 1);
    addMessage(d.message);
  });
  const plan = plans.get(p.id);
  if (plan) plan.delivered = true;
  log('sistem', 'Simulacije dostavljene', `plan ${p.id}: ${due.length}`);
  sendJson(res, 200, { delivered: due.length, state: publicState() });
});
route('POST', '/api/agent/plans/:id/decision', async (req, res, p) => {
  const plan = plans.get(p.id);
  if (!plan) return sendJson(res, 404, { error: 'ni plana' });
  if (plan.status !== 'pending') return sendJson(res, 409, { error: 'plan ni v čakanju' });
  const { approve } = await readBody(req);
  plan.status = approve ? 'approved' : 'rejected';
  log('skrbnik', approve ? 'Plan odobren' : 'Plan zavrnjen', `${plan.items.filter((i) => i.chosen).length} uporabnikov, ${plan.estimatedCost} USDC`);
  sendJson(res, 200, plan);
});
route('GET', '/api/agent/plans/:id/execute', async (req, res, p) => {
  const plan = plans.get(p.id);
  res.writeHead(200, { 'Content-Type': 'text/event-stream', 'Cache-Control': 'no-cache', Connection: 'keep-alive' });
  const emit = (event, data) => res.write(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`);
  if (!plan || plan.status !== 'approved') {
    emit('step', { kind: 'error', title: 'Plan ni odobren', detail: plan ? `status: ${plan.status}` : 'ni plana' });
    emit('done', { plan });
    return res.end();
  }
  await executePlan(plan, emit);
  res.end();
});

route('GET', '/api/transactions', async (req, res) => {
  await refreshBalance();
  sendJson(res, 200, { transactions, funding, wallet, budget: { limit: policy.monthlyBudget, spent: spentThisMonth() } });
});

// --- lastnikova denarnica (samo način Base Sepolia)
const requireChain = (res) => (chain ? false : (sendJson(res, 400, { error: 'Povezava denarnice deluje samo v načinu Base Sepolia (npm run start:sepolia).' }), true));

route('POST', '/api/wallet/challenge', async (req, res) => {
  if (requireChain(res)) return;
  const { address } = await readBody(req);
  if (!/^0x[0-9a-fA-F]{40}$/.test(address || '')) return sendJson(res, 400, { error: 'neveljaven naslov' });
  const message = `CyberAgent Marketplace\n\nPovezujem svojo denarnico ${address} z denarnico glavnega agenta ${wallet.address}.\nVračila neporabljenih sredstev naj gredo na ta naslov.\n\nOznaka: ${randomUUID()}`;
  ownerChallenges.set(address.toLowerCase(), message);
  sendJson(res, 200, { message });
});

route('POST', '/api/wallet/owner', async (req, res) => {
  if (requireChain(res)) return;
  const { address, signature } = await readBody(req);
  const message = ownerChallenges.get(String(address).toLowerCase());
  if (!message) return sendJson(res, 400, { error: 'najprej zahtevaj sporočilo za podpis' });
  ownerChallenges.delete(address.toLowerCase());
  const ok = await chain.verifyOwner(address, message, signature).catch(() => false);
  if (!ok) return sendJson(res, 400, { error: 'podpis ne ustreza naslovu' });
  wallet.owner = { address, linkedAt: new Date().toISOString() };
  saveOwner();
  log('skrbnik', 'Povezana lastnikova denarnica', address);
  sendJson(res, 200, { owner: wallet.owner });
});

route('DELETE', '/api/wallet/owner', (req, res) => {
  if (wallet.owner) log('skrbnik', 'Odstranjena lastnikova denarnica', wallet.owner.address);
  wallet.owner = null;
  saveOwner();
  sendJson(res, 200, { owner: null });
});

// Polnitev: lastnik v MetaMasku podpiše avtorizacijo EIP-3009 (brez plina), facilitator izvede prenos.
route('POST', '/api/wallet/deposit', async (req, res) => {
  if (requireChain(res)) return;
  if (!wallet.owner) return sendJson(res, 400, { error: 'denarnica ni povezana' });
  const { authorization: a, signature } = await readBody(req);
  if (!a || !signature) return sendJson(res, 400, { error: 'manjka podpisana avtorizacija' });
  if (a.from.toLowerCase() !== wallet.owner.address.toLowerCase()) return sendJson(res, 400, { error: 'pošiljatelj ni povezana denarnica' });
  if (a.to.toLowerCase() !== wallet.address.toLowerCase()) return sendJson(res, 400, { error: 'prejemnik ni denarnica agenta' });
  const amount = fromAtomic(a.value);
  if (!(amount > 0 && amount <= 50)) return sendJson(res, 400, { error: 'znesek mora biti med 0 in 50 USDC' });
  try {
    const payment = { x402Version: 1, scheme: 'exact', network: NETWORK, payload: { signature, authorization: a } };
    const tx = await facilitatorTransfer(payment, transferRequirements(wallet.address, a.value, 'Polnitev denarnice glavnega agenta'));
    await refreshBalance();
    log('skrbnik', 'Polnitev denarnice agenta', `${amount} USDC iz ${a.from.slice(0, 10)}… (${tx.slice(0, 12)}…)`);
    sendJson(res, 200, { funding: recordFunding('polnitev', amount, tx, a.from), wallet });
  } catch (err) {
    sendJson(res, 400, { error: `Polnitev ni uspela: ${err.message}` });
  }
});

// Vračilo: agent podpiše prenos celotnega stanja na povezano denarnico.
route('POST', '/api/wallet/refund', async (req, res) => {
  if (requireChain(res)) return;
  if (!wallet.owner) return sendJson(res, 400, { error: 'denarnica ni povezana' });
  await refreshBalance();
  if (wallet.balance <= 0) return sendJson(res, 400, { error: 'denarnica agenta je prazna' });
  const value = toAtomic(wallet.balance);
  const now = Math.floor(Date.now() / 1000);
  const authorization = { from: wallet.address, to: wallet.owner.address, value, validAfter: String(now - 5), validBefore: String(now + 300), nonce: txHash() };
  try {
    const signature = await chain.signAuthorization(authorization);
    const payment = { x402Version: 1, scheme: 'exact', network: NETWORK, payload: { signature, authorization } };
    const tx = await facilitatorTransfer(payment, transferRequirements(wallet.owner.address, value, 'Vračilo neporabljenih sredstev'));
    const amount = fromAtomic(value);
    await refreshBalance();
    log('skrbnik', 'Vračilo neporabljenih sredstev', `${amount} USDC → ${wallet.owner.address.slice(0, 10)}… (${tx.slice(0, 12)}…)`);
    sendJson(res, 200, { funding: recordFunding('vračilo', amount, tx, wallet.owner.address), wallet });
  } catch (err) {
    sendJson(res, 400, { error: `Vračilo ni uspelo: ${err.message}` });
  }
});
route('GET', '/api/org', (req, res) => sendJson(res, 200, orgAnalytics()));
route('GET', '/api/policy', (req, res) => sendJson(res, 200, policy));
route('PUT', '/api/policy', async (req, res) => {
  const body = await readBody(req);
  for (const k of ['monthlyBudget', 'maxPerTx', 'minRating', 'maxSimsPerMonth']) if (body[k] !== undefined) policy[k] = Number(body[k]);
  for (const k of ['requireApproval', 'allowlistOnly', 'verifiedOnly', 'dataMinimization']) if (body[k] !== undefined) policy[k] = Boolean(body[k]);
  if (body.channels) Object.assign(policy.channels, body.channels);
  if (Array.isArray(body.blockedTopics)) policy.blockedTopics = body.blockedTopics.map(String).filter(Boolean);
  log('skrbnik', 'Pravila posodobljena', JSON.stringify(body).slice(0, 140));
  sendJson(res, 200, policy);
});
route('GET', '/api/audit', (req, res) => sendJson(res, 200, audit));

const MIME = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8', '.svg': 'image/svg+xml' };

const server = http.createServer(async (req, res) => {
  const url = new URL(req.url, BASE);
  try {
    for (const r of routes) {
      const m = r.method === req.method && url.pathname.match(r.re);
      if (m) {
        const params = Object.fromEntries(r.keys.map((k, i) => [k, decodeURIComponent(m[i + 1])]));
        return await r.handler(req, res, params);
      }
    }
    if (req.method !== 'GET') return sendJson(res, 404, { error: 'ni najdeno' });
    const file = normalize(join(PUBLIC_DIR, url.pathname === '/' ? 'index.html' : url.pathname));
    if (!file.startsWith(PUBLIC_DIR)) return sendJson(res, 403, { error: 'prepovedano' });
    const data = await readFile(file);
    res.writeHead(200, { 'Content-Type': MIME[extname(file)] || 'application/octet-stream' });
    res.end(data);
  } catch (err) {
    if (err.code === 'ENOENT') return sendJson(res, 404, { error: 'ni najdeno' });
    console.error(err);
    if (!res.headersSent) sendJson(res, 500, { error: err.message });
  }
});

server.listen(PORT, async () => {
  console.log(`CyberAgent Marketplace teče na ${BASE}`);
  if (!chain) {
    console.log(`Denarnica glavnega agenta: ${wallet.address} (${wallet.balance} USDC, ${NETWORK}, simulirano)`);
    return;
  }
  await refreshBalance();
  console.log(`Način: Base Sepolia (pravi x402, facilitator ${FACILITATOR_URL})`);
  console.log(`Denarnica glavnega agenta: ${wallet.address}`);
  console.log(`Stanje: ${wallet.balance} USDC  ·  ${wallet.explorer}`);
  if (wallet.balance < 0.2) console.log(`Za plačila potrebuje testne USDC: ${FAUCET} (omrežje Base Sepolia, zgornji naslov).`);
});
