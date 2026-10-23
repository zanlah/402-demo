const $ = (sel, el = document) => el.querySelector(sel);
const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);
const usdc = (n, d = 2) => `${Number(n).toFixed(d)} USDC`;
const pct = (x) => `${Math.round(x * 100)} %`;
const time = (iso) => new Date(iso).toLocaleTimeString('sl-SI', { hour: '2-digit', minute: '2-digit' });
const dateTime = (iso) => new Date(iso).toLocaleString('sl-SI', { day: 'numeric', month: 'numeric', hour: '2-digit', minute: '2-digit' });
const shortTime = (iso) => (new Date(iso).toDateString() === new Date().toDateString() ? time(iso) : new Date(iso).toLocaleDateString('sl-SI', { day: 'numeric', month: 'numeric' }));

async function api(path, { method = 'GET', body } = {}) {
  const r = await fetch(path, { method, headers: { 'Content-Type': 'application/json' }, body: body ? JSON.stringify(body) : undefined });
  const data = await r.json();
  if (!r.ok) throw Object.assign(new Error(data.error || r.statusText), { data });
  return data;
}

const S = {
  state: null,
  messages: [],
  selected: null,
  openedAt: 0,
  plan: null,
  planError: null,
  runLog: [],
  running: false,
  autoPlan: false,
  data: {},
  mm: { balance: null, busy: null },
};

const CH_ICON = { email: '✉', sms: '💬', chat: '#', glas: '☏' };
const OUTCOME = {
  success: ['ok', 'Prijavljeno'],
  fail: ['bad', 'Nasedli'],
  neutral: ['warn', 'Prezrto'],
};

// ---------------------------------------------------------------------------
// Ogrodje: stanje, meni, modal, obvestila
// ---------------------------------------------------------------------------
async function refreshState() {
  S.state = await api('/api/state');
  renderChrome();
}

function renderChrome() {
  const st = S.state;
  if (!st) return;
  const unread = S.messages.filter((m) => !m.read).length;
  $('#unread').textContent = unread || '';
  $('#pending').textContent = S.plan?.status === 'pending' ? '1' : '';
  const used = st.budget.spent / st.budget.limit;
  $('#wallet').innerHTML = `
    <div style="color:#fff;font-weight:600">Denarnica glavnega agenta</div>
    <div class="addr">${addrLink(st.wallet)} · ${st.wallet.mode === 'sepolia' ? 'Base Sepolia' : 'simulacija'}</div>
    <div class="row"><span>Stanje</span><b style="color:#fff">${usdc(st.wallet.balance)}</b></div>
    <div class="row"><span>Poraba ta mesec</span><span>${usdc(st.budget.spent)} / ${usdc(st.budget.limit)}</span></div>
    <div class="meter ${used > 0.8 ? 'bad' : ''}"><i style="width:${Math.min(100, used * 100)}%"></i></div>`;
}

const short = (h) => `${h.slice(0, 10)}…${h.slice(-6)}`;
const addrLink = (w) => (w.explorer ? `<a href="${esc(w.explorer)}" target="_blank" rel="noopener" style="color:inherit">${esc(short(w.address))}</a>` : esc(short(w.address)));
const txCell = (t) => (t.explorer ? `<a href="${esc(t.explorer)}" target="_blank" rel="noopener" title="${esc(t.txHash)}">${esc(t.txHash.slice(0, 12))}… ↗</a>` : `<span title="${esc(t.txHash)}">${esc(t.txHash.slice(0, 12))}…</span>`);

function showModal(html) {
  const m = $('#modal');
  m.innerHTML = `<div class="modal" role="dialog">${html}</div>`;
  m.hidden = false;
}
function closeModal() {
  $('#modal').hidden = true;
}
$('#modal').addEventListener('click', (e) => {
  if (e.target.id === 'modal' || e.target.closest('[data-close]')) closeModal();
});

let toastTimer;
function toast(html, ms = 4500) {
  const t = $('#toast');
  t.innerHTML = html;
  t.hidden = false;
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => (t.hidden = true), ms);
}

// ---------------------------------------------------------------------------
// Nabiralnik
// ---------------------------------------------------------------------------
const LEGIT_ACTIONS = [
  { id: 'reply', label: 'Odgovori' },
  { id: 'report', label: 'Prijavi kot phishing' },
  { id: 'ignore', label: 'Izbriši' },
];

function flagIndex(m) {
  return Object.fromEntries((m.redFlags || []).map((f, i) => [f.key, i + 1]));
}

function renderBody(m, showFlags) {
  const idx = flagIndex(m);
  let html = esc(m.body);
  html = html.replace(/\{\{(\w+)\|([\s\S]*?)\}\}/g, (_, k, txt) => (showFlags && idx[k] ? `<mark class="flag">${txt}<sup>${idx[k]}</sup></mark>` : txt));
  html = html.replace(/&lt;&lt;link&gt;&gt;/g, () => {
    if (!m.link) return '';
    const attach = /\.(pdf|zip)$/i.test(m.link.label);
    const inner = `${attach ? '📎 ' : ''}${esc(m.link.label)}`;
    const a = `<a class="fake-link ${attach ? 'attach' : ''}" data-real="${esc(m.link.real)}" data-link>${inner}</a>`;
    return showFlags && idx.link ? `<mark class="flag">${a}<sup>${idx.link}</sup></mark>` : a;
  });
  return html;
}

function messageItem(m) {
  const snippet = m.channel === 'email' ? m.subject : m.body.replace(/\{\{\w+\||\}\}|<<link>>/g, '').slice(0, 80);
  const res = m.resolved && m.simulation && OUTCOME[m.resolved.outcome];
  return `
    <div class="msg-item ${m.read ? '' : 'unread'} ${S.selected === m.id ? 'active' : ''}" data-id="${m.id}">
      <div class="ch">${CH_ICON[m.channel] || '✉'}</div>
      <div class="from">${esc(m.fromName)}</div>
      <div class="time">${shortTime(m.receivedAt)}</div>
      <div class="subj">${esc(snippet)}</div>
      ${res ? `<div class="res"><span class="chip ${res[0]}">Simulacija · ${res[1]}</span></div>` : ''}
    </div>`;
}

function readerHtml(m) {
  if (!m) return `<div class="empty">Izberite sporočilo</div>`;
  const showFlags = Boolean(m.resolved && m.simulation);
  const idx = flagIndex(m);
  const senderFlag = showFlags && idx.sender ? `<span class="flag-num">${idx.sender}</span>` : '';
  const addr = m.fromAddress && m.fromAddress !== 'SMS' ? `&lt;${esc(m.fromAddress)}&gt;` : '';
  const actions = (m.simulation ? m.actions.filter((a) => a.id !== 'click') : LEGIT_ACTIONS)
    .map((a) => `<button class="btn ${a.id === 'report' ? 'primary' : ''}" data-act="${a.id}" ${m.resolved ? 'disabled' : ''}>${esc(a.label)}</button>`)
    .join('');
  const header = m.channel === 'email'
    ? `<div class="subject">${esc(m.subject)}</div>`
    : `<div class="subject">${esc({ sms: 'SMS sporočilo', chat: 'Microsoft Teams – zasebno sporočilo', glas: 'Glasovna pošta' }[m.channel])}</div>`;
  const flags = showFlags
    ? `<div class="flags">
        <h3>Rdeče zastavice, ki bi vas morale opozoriti</h3>
        <ol>${m.redFlags.map((f, i) => `<li><span class="flag-num">${i + 1}</span> <b>${esc(f.title)}</b> – ${esc(f.explanation)}</li>`).join('')}</ol>
        <p class="small muted" style="margin:10px 0 0">Simulacijo je pripravil agent <b>${esc(m.agentName)}</b>${m.cost ? ` (strošek ${usdc(m.cost, 2)} prek x402)` : ''}. Taktika: ${esc(S.state.tactics[m.tactic].label)}, težavnost ${m.difficulty}/5.</p>
        ${m.reason ? `<p class="small muted" style="margin:6px 0 0">Zakaj ta simulacija: ${esc(m.reason)}</p>` : ''}
      </div>`
    : '';
  return `
    <button class="btn sm back-btn" data-back>← Nazaj</button>
    <div class="reader-head">
      ${header}
      <div class="sender">
        <div class="avatar">${esc(m.fromName.trim()[0])}</div>
        <div>
          <div><b>${esc(m.fromName)}</b> <span class="muted ${showFlags && idx.sender ? '' : ''}">${showFlags && idx.sender ? `<mark class="flag">${addr}</mark>` : addr}</span>${senderFlag}</div>
          <div class="small muted">${dateTime(m.receivedAt)} · za: jaz</div>
        </div>
      </div>
    </div>
    <div class="body ${m.channel}">${renderBody(m, showFlags)}</div>
    <div class="actions-bar">${actions}${m.resolved ? `<span class="muted small" style="align-self:center">Obravnavano</span>` : ''}</div>
    ${flags}`;
}

async function loadInbox() {
  S.messages = await api('/api/messages');
}

function inboxView() {
  const st = S.state;
  const pend = st.pendingDeliveries;
  const sel = S.messages.find((m) => m.id === S.selected);
  return `
    <h1>Nabiralnik</h1>
    <p class="sub">Delovni nabiralnik z vgrajenimi simulacijami. Simulacije so nenapovedane in pomešane med pristna sporočila.</p>
    ${pend.length ? `<div class="banner"><div class="grow"><b>${pend.length} ${pend.length === 1 ? 'simulacija čaka' : 'simulacij čaka'} na dostavo.</b> <span class="muted">Dostavljena bo ob naključnem času v delovnem času (${dateTime(pend[0].deliverAt)}), zato je ne morete pričakovati.</span></div><button class="btn primary sm" data-deliver="${pend[0].id}">Dostavi zdaj (demo)</button></div>` : ''}
    <div class="inbox ${sel ? 'reading' : ''}">
      <div class="msg-list">${S.messages.map(messageItem).join('')}</div>
      <div class="reader" id="reader">${readerHtml(sel)}</div>
    </div>`;
}

async function openMessage(id) {
  S.selected = id;
  S.openedAt = Date.now();
  const m = S.messages.find((x) => x.id === id);
  if (m && !m.read) {
    m.read = true;
    api(`/api/messages/${id}/read`, { method: 'POST' });
  }
  render(false);
}

async function act(actionId) {
  const m = S.messages.find((x) => x.id === S.selected);
  if (!m || m.resolved) return;
  const r = await api(`/api/messages/${m.id}/action`, { method: 'POST', body: { action: actionId, responseMs: Date.now() - S.openedAt } });
  Object.assign(m, r.item);
  S.state = r.state;
  renderChrome();
  render(false);
  if (!m.simulation) {
    if (r.outcome === 'false_positive') showFeedback(r, m);
    else toast(actionId === 'reply' ? 'Odgovor poslan.' : 'Sporočilo izbrisano.');
    return;
  }
  showFeedback(r, m);
}

function showFeedback(r, m) {
  if (r.outcome === 'false_positive') {
    return showModal(`
      <div class="hero false_positive"><div class="tag">Pristno sporočilo</div><h2>${esc(r.title)}</h2><p style="margin:0">${esc(r.message)}</p></div>
      <div class="content"><div class="row-actions"><button class="btn primary" data-close>V redu</button></div></div>`);
  }
  const levelTxt = r.levelAfter > r.levelBefore ? `Težavnost naslednjih simulacij se dvigne na ${r.levelAfter}/5.` : r.levelAfter < r.levelBefore ? `Težavnost se zniža na ${r.levelAfter}/5, da utrdite osnove.` : `Težavnost ostaja ${r.levelAfter}/5.`;
  showModal(`
    <div class="hero ${r.outcome}">
      <div class="tag">${r.outcome === 'fail' ? 'To je bila vaja' : r.outcome === 'success' ? 'Prepoznano' : 'Skoraj'}</div>
      <h2>${esc(r.title)}</h2>
      <p style="margin:0">${esc(r.message)}</p>
    </div>
    <div class="content">
      <h3>Uporabljena taktika: ${esc(r.tactic.label)}</h3>
      <p class="muted" style="margin-top:0">${esc(r.tactic.desc)}</p>
      <ol style="padding-left:0;list-style:none;margin:0">
        ${r.redFlags.map((f, i) => `<li style="margin-bottom:8px"><span class="flag-num">${i + 1}</span> <b>${esc(f.title)}</b> – ${esc(f.explanation)}</li>`).join('')}
      </ol>
      <div class="tip"><b>Nasvet:</b> ${esc(r.tactic.tip)}</div>
      <p class="small muted">${r.points ? `+${r.points} točk budnosti. ` : ''}${levelTxt} Rezultat vidite samo vi; organizacija vidi le anonimizirane podatke oddelka.</p>
      <div class="row-actions">
        <button class="btn" data-close>Poglej označeno sporočilo</button>
        <button class="btn primary" data-goto-agent>Kako glavni agent pripravi naslednjo simulacijo →</button>
      </div>
    </div>`);
}

// ---------------------------------------------------------------------------
// Moj napredek
// ---------------------------------------------------------------------------
function progressView() {
  const u = S.state.user;
  const h = u.history;
  const reported = h.filter((x) => x.outcome === 'success').length;
  const avgMs = h.length ? h.reduce((s, x) => s + x.responseMs, 0) / h.length : 0;
  const tactics = Object.entries(u.stats);
  return `
    <h1>Moj napredek</h1>
    <p class="sub">Psevdonim ${esc(u.id)} · ${esc(u.role)}, oddelek ${esc(u.department)}</p>
    <div class="grid cols-4">
      <div class="card stat"><div class="label">Stopnja težavnosti</div><div class="value">${u.level} / 5</div><div class="meter"><i style="width:${u.level * 20}%"></i></div></div>
      <div class="card stat"><div class="label">Točke budnosti</div><div class="value">${u.points}</div><div class="hint">+10 za vsako prijavo, več za hitro prijavo</div></div>
      <div class="card stat"><div class="label">Prepoznane simulacije</div><div class="value">${reported} / ${h.length}</div><div class="hint">${h.length ? pct(reported / h.length) : '–'} uspešnost</div></div>
      <div class="card stat"><div class="label">Povprečen čas odziva</div><div class="value">${h.length ? Math.max(1, Math.round(avgMs / 1000)) + ' s' : '–'}</div><div class="hint">od odprtja do dejanja</div></div>
    </div>
    <div class="grid cols-2" style="margin-top:16px">
      <div class="card">
        <h2>Odpornost po taktikah</h2>
        ${tactics.map(([k, s]) => {
          const rate = s.seen ? s.reported / s.seen : 0;
          return `<div class="bar-row"><span>${esc(S.state.tactics[k].label)}</span><div class="bar"><i style="width:${rate * 100}%;background:${s.failed ? 'var(--warn)' : 'var(--ok)'}"></i></div><span class="small muted">${s.seen ? `${s.reported}/${s.seen}` : 'novo'}</span></div>`;
        }).join('')}
        <p class="small muted" style="margin-bottom:0">Glavni agent izbira naslednjo taktiko glede na to, kje ste najbolj ranljivi ali kaj še niste vadili.</p>
      </div>
      <div class="card">
        <h2>Zasebnost</h2>
        <p style="margin-top:0">Vaši posamični rezultati so vidni samo vam. Skrbnik vidi le anonimizirane podatke na ravni oddelka, in sicer samo za oddelke z vsaj 5 osebami.</p>
        <p>Zunanji agenti nikoli ne prejmejo vašega imena, e-poštnega naslova ali vsebine nabiralnika. Prejmejo le vlogo, oddelek, jezik in težavnost.</p>
        <p class="muted small" style="margin-bottom:0">Simulacij je največ ${S.state.sims.max} na mesec, da vas ne preobremenjujemo.</p>
      </div>
    </div>
    <div class="card" style="margin-top:16px">
      <h2>Zgodovina simulacij</h2>
      ${h.length ? `<div class="table-wrap"><table>
        <tr><th>Čas</th><th>Sporočilo</th><th>Taktika</th><th>Težavnost</th><th>Vaše dejanje</th><th>Izid</th><th>Agent</th></tr>
        ${h.map((x) => `<tr><td>${dateTime(x.at)}</td><td>${CH_ICON[x.channel]} ${esc(x.subject === 'SMS' || x.subject === 'Teams' ? S.state.channels[x.channel] : x.subject)}</td><td><span class="chip">${esc(S.state.tactics[x.tactic].label)}</span></td><td>${x.difficulty}/5</td><td>${esc(x.action)}</td><td><span class="chip ${OUTCOME[x.outcome][0]}">${OUTCOME[x.outcome][1]}</span></td><td class="muted">${esc(x.agentName)}</td></tr>`).join('')}
      </table></div>` : `<p class="muted">Še ni odzivov. V nabiralniku se skriva simulacija. Jo najdete?</p>`}
    </div>`;
}

// ---------------------------------------------------------------------------
// Glavni agent
// ---------------------------------------------------------------------------
async function loadAgent() {
  S.data.plans = await api('/api/agent/plans');
}

function logHtml() {
  if (!S.runLog.length) return `<p class="muted" style="margin:0">${S.running ? 'Začenjam …' : 'Dnevnik izvajanja se prikaže po odobritvi plana.'}</p>`;
  const icon = { request: '→', http402: '402', policy: '§', sign: '✎', paid: '✓', ok: '✓', error: '!', info: 'i' };
  return S.runLog.map((s) => `
    <div class="step">
      <div class="dot ${s.kind}">${icon[s.kind] || '·'}</div>
      <div>
        <b>${esc(s.title)}</b>${s.detail ? `<div class="muted ${s.kind === 'request' || s.kind === 'sign' ? 'mono' : ''}">${esc(s.detail)}</div>` : ''}
        ${s.checks ? `<ul class="checks">${s.checks.map((c) => `<li class="${c.ok ? '' : 'no'}">${esc(c.label)}</li>`).join('')}</ul>` : ''}
        ${s.json ? `<details><summary class="small muted">Pokaži podatke</summary><pre>${esc(JSON.stringify(s.json, null, 2))}</pre></details>` : ''}
      </div>
    </div>`).join('') + (S.running ? `<div class="step"><div class="dot">…</div><div class="muted">v teku</div></div>` : '');
}

function planHtml(p) {
  if (S.planError) return `<div class="card"><h2>Plan ni bil pripravljen</h2><p class="muted">${esc(S.planError)}</p></div>`;
  if (!p) {
    return `<div class="card"><h2>Ni aktivnega plana</h2><p class="muted">Glavni agent pripravi plan po vsakem odzivu uporabnika na simulacijo. Lahko ga sprožite tudi ročno.</p><button class="btn primary" data-plan>Pripravi naslednjo simulacijo</button></div>`;
  }
  const statusChip = { pending: ['warn', 'Čaka na odobritev'], approved: ['blue', 'Odobreno'], running: ['blue', 'V izvajanju'], done: ['ok', 'Zaključeno'], rejected: ['bad', 'Zavrnjeno'], failed: ['bad', 'Neuspešno'], no_agent: ['bad', 'Ni primernega agenta'] }[p.status];
  return `
    <div class="card">
      <div style="display:flex;justify-content:space-between;align-items:center;gap:10px;margin-bottom:12px">
        <h2 style="margin:0">Plan #${esc(p.id)}</h2><span class="chip ${statusChip[0]}">${statusChip[1]}</span>
      </div>
      <div class="grid cols-2">
        <div>
          <h3>1. Analiza uporabnika ${esc(S.state.user.id)}</h3>
          <dl class="kv">
            <dt>Ciljna taktika</dt><dd><b>${esc(p.analysis.tacticLabel)}</b></dd>
            <dt>Težavnost</dt><dd>${p.analysis.difficulty}/5</dd>
            <dt>Utemeljitev</dt><dd>${esc(p.analysis.reason)}</dd>
          </dl>
        </div>
        <div>
          <h3>Podatki, ki zapustijo organizacijo</h3>
          <div>${Object.entries(p.dataShared).map(([k, v]) => `<span class="chip blue">${esc(k)}: ${esc(v)}</span>`).join('')}</div>
          <div style="margin-top:6px">${p.dataWithheld.map((x) => `<span class="chip">✗ ${esc(x)}</span>`).join('')}</div>
        </div>
      </div>
      <h3 style="margin-top:18px">2. Izbira agenta na tržnici</h3>
      <div class="table-wrap"><table>
        <tr><th>Agent</th><th>Kanal</th><th>Cena</th><th>Ocena</th><th>Točke</th><th>Odločitev</th></tr>
        ${p.candidates.map((c) => {
          const chosen = p.chosen?.id === c.id;
          return `<tr class="${chosen ? 'chosen' : c.eligible ? '' : 'rejected'}"><td><b>${esc(c.name)}</b></td><td>${esc(S.state.channels[c.channel])}</td><td>${usdc(c.price)}</td><td>★ ${c.rating}</td><td>${c.score ?? '–'}</td><td>${chosen ? '<span class="chip ok">Izbran</span>' : c.eligible ? '<span class="chip">Primeren, nižje točke</span>' : c.reasons.map((r) => `<span class="chip bad">${esc(r)}</span>`).join('')}</td></tr>`;
        }).join('')}
      </table></div>
      ${p.chosen ? `
      <h3 style="margin-top:18px">3. Naročilo in plačilo prek x402</h3>
      <dl class="kv">
        <dt>Generiranje</dt><dd>${esc(p.chosen.name)} · ${usdc(p.chosen.price)}</dd>
        <dt>Etični pregled</dt><dd>${esc(p.reviewer.name)} · ${usdc(p.reviewer.price)}</dd>
        <dt>Skupaj</dt><dd><b>${usdc(p.estimatedCost)}</b> <span class="muted">(preostanek proračuna ${usdc(S.state.budget.limit - S.state.budget.spent)})</span></dd>
      </dl>` : ''}
      ${p.status === 'pending' ? `
        <div class="banner" style="margin:16px 0 0;background:var(--warn-soft);border-color:#f1d9a8">
          <div class="grow"><b>Potrebna je človeška odobritev.</b> <span class="muted">Agent brez potrditve skrbnika ne naroči in ne plača nobene storitve.</span></div>
          <button class="btn danger sm" data-decide="0">Zavrni</button>
          <button class="btn ok sm" data-decide="1">Odobri in plačaj</button>
        </div>` : ''}
      ${['done', 'rejected', 'failed', 'no_agent'].includes(p.status) ? `<div class="row-actions" style="margin-top:16px">
        ${p.status === 'done' && S.state.pendingDeliveries.some((d) => d.id === p.deliveryId) ? `<button class="btn primary" data-deliver="${p.deliveryId}">Dostavi simulacijo zdaj (demo)</button>` : ''}
        <button class="btn" data-plan>Pripravi nov plan</button></div>` : ''}
    </div>`;
}

function agentView() {
  const st = S.state;
  const plans = (S.data.plans || []).filter((p) => p.id !== S.plan?.id).slice(0, 6);
  return `
    <h1>Glavni agent</h1>
    <p class="sub">Avtonomni kupec storitev: analizira uporabnika, izbere specializiranega agenta, plača prek x402 in načrtuje dostavo.</p>
    <div class="grid cols-4">
      <div class="card stat"><div class="label">Stanje denarnice</div><div class="value">${usdc(st.wallet.balance)}</div><div class="hint mono">${esc(st.wallet.address.slice(0, 14))}…</div></div>
      <div class="card stat"><div class="label">Mesečni proračun</div><div class="value">${usdc(st.budget.spent)}</div><div class="meter"><i style="width:${(st.budget.spent / st.budget.limit) * 100}%"></i></div><div class="hint">od ${usdc(st.budget.limit)}</div></div>
      <div class="card stat"><div class="label">Simulacije ta mesec</div><div class="value">${st.sims.thisMonth} / ${st.sims.max}</div><div class="hint">omejitev proti preobremenitvi</div></div>
      <div class="card stat"><div class="label">Stopnja uporabnika</div><div class="value">${st.user.level} / 5</div><div class="hint">prilagodljiva težavnost</div></div>
    </div>
    <div class="grid" style="grid-template-columns:minmax(0,1.5fr) minmax(0,1fr);margin-top:16px" id="agent-grid">
      <div>${planHtml(S.plan)}</div>
      <div class="card"><h2>Dnevnik izvajanja (x402)</h2><div class="log" id="log">${logHtml()}</div></div>
    </div>
    ${plans.length ? `<div class="card" style="margin-top:16px"><h2>Pretekli plani</h2><div class="table-wrap"><table>
      <tr><th>Čas</th><th>Taktika</th><th>Agent</th><th>Strošek</th><th>Status</th></tr>
      ${plans.map((p) => `<tr><td>${dateTime(p.createdAt)}</td><td>${esc(p.analysis.tacticLabel)} · ${p.analysis.difficulty}/5</td><td>${esc(p.chosen?.name || '–')}</td><td>${p.totalCost ? usdc(p.totalCost) : '–'}</td><td>${esc(p.status)}</td></tr>`).join('')}
    </table></div></div>` : ''}`;
}

async function makePlan() {
  S.planError = null;
  S.runLog = [];
  try {
    S.plan = await api('/api/agent/plan', { method: 'POST' });
  } catch (e) {
    S.plan = null;
    S.planError = e.message;
  }
  await render();
  if (S.plan?.status === 'approved') runPlan();
}

async function decide(approve) {
  S.plan = await api(`/api/agent/plans/${S.plan.id}/decision`, { method: 'POST', body: { approve } });
  await render();
  if (approve) runPlan();
}

function runPlan() {
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
    if (d.delivery) toast(`Simulacija je pripravljena in plačana. <a href="#/nabiralnik">Nabiralnik →</a>`);
  });
  es.onerror = () => {
    es.close();
    S.running = false;
  };
}

async function deliver(id) {
  const r = await api(`/api/deliveries/${id}/deliver`, { method: 'POST' });
  S.state = r.state;
  S.selected = null;
  closeModal();
  if (currentView() === 'nabiralnik') render();
  else location.hash = '#/nabiralnik';
  toast('Novo sporočilo v nabiralniku.');
}

// ---------------------------------------------------------------------------
// Tržnica
// ---------------------------------------------------------------------------
async function loadMarket() {
  S.data.agents = await api('/api/agents');
}

function marketView() {
  const list = S.data.agents;
  return `
    <h1>Tržnica agentov</h1>
    <p class="sub">Specializirani agenti ponujajo plačljive storitve prek HTTP. Cena velja za en klic in se plača z mikroplačilom x402. Glavni agent lahko uporabi samo agente na odobrenem seznamu.</p>
    <div class="grid cols-3">
      ${list.map((a) => `
        <div class="card agent-card">
          <div class="top">
            <div><div class="name">${esc(a.name)}</div><div class="small muted">${esc(a.vendor)}</div></div>
            <div class="price">${usdc(a.price)}<div class="small muted" style="font-weight:400;text-align:right">na klic</div></div>
          </div>
          <div class="muted">${esc(a.description)}</div>
          <div>
            ${a.kind === 'reviewer' ? '<span class="chip blue">Pregled kakovosti</span>' : `<span class="chip blue">${CH_ICON[a.channel]} ${esc(S.state.channels[a.channel])}</span>`}
            ${a.tactics.map((t) => `<span class="chip">${esc(S.state.tactics[t].label)}</span>`).join('')}
          </div>
          <div>
            <span class="chip ${a.verified ? 'ok' : 'bad'}">${a.verified ? 'Preverjen ponudnik' : 'Nepreverjen'}</span>
            ${a.requiresPersonalData ? '<span class="chip bad">Zahteva osebne podatke</span>' : '<span class="chip ok">Brez osebnih podatkov</span>'}
          </div>
          <div class="foot">
            <span>★ ${a.rating} · ${a.calls} klicev · ${usdc(a.earned)}</span>
            <label class="switch"><input type="checkbox" data-allow="${a.id}" ${a.allowlisted ? 'checked' : ''}>Odobren</label>
          </div>
        </div>`).join('')}
    </div>`;
}

// ---------------------------------------------------------------------------
// Plačila x402
// ---------------------------------------------------------------------------
async function loadPayments() {
  S.data.tx = await api('/api/transactions');
  const owner = S.data.tx.wallet.owner;
  // Stanje v MetaMasku preberemo brez poziva, če je denarnica že na Base Sepolia.
  S.mm.balance = null;
  if (owner && window.ethereum) {
    try {
      if ((await eth('eth_chainId')) === BASE_SEPOLIA.chainId) S.mm.balance = await mmBalance(owner.address);
    } catch {}
  }
}

// ---------------------------------------------------------------------------
// MetaMask: lastnikova denarnica polni denarnico agenta in prejme vračila
// Uporabnik podpisuje samo avtorizacije EIP-3009, prenos izvede facilitator, zato ETH za plin ni potreben.
// ---------------------------------------------------------------------------
const USDC = '0x036CbD53842c5426634e7929541eC2318f3dCF7e';
const BASE_SEPOLIA = { chainId: '0x14a34', chainName: 'Base Sepolia', nativeCurrency: { name: 'Ether', symbol: 'ETH', decimals: 18 }, rpcUrls: ['https://sepolia.base.org'], blockExplorerUrls: ['https://sepolia.basescan.org'] };
const eth = (method, params = []) => window.ethereum.request({ method, params });
const toHex = (bytes) => '0x' + [...bytes].map((b) => b.toString(16).padStart(2, '0')).join('');
const mmError = (err) => (err?.code === 4001 ? 'Zavrnjeno v MetaMasku.' : err?.message || String(err));

async function ensureBaseSepolia() {
  try {
    await eth('wallet_switchEthereumChain', [{ chainId: BASE_SEPOLIA.chainId }]);
  } catch (err) {
    if (err.code === 4902 || err?.data?.originalError?.code === 4902) await eth('wallet_addEthereumChain', [BASE_SEPOLIA]);
    else throw err;
  }
}

async function mmBalance(address) {
  const raw = await eth('eth_call', [{ to: USDC, data: '0x70a08231' + address.slice(2).toLowerCase().padStart(64, '0') }, 'latest']);
  return Number(BigInt(raw)) / 1e6;
}

async function walletTask(label, fn) {
  if (!window.ethereum) return toast('MetaMask ni nameščen. Namesti razširitev z <a href="https://metamask.io" target="_blank" rel="noopener">metamask.io</a> in osveži stran.', 7000);
  S.mm.busy = label;
  render(false);
  try {
    await fn();
  } catch (err) {
    toast(esc(mmError(err)), 7000);
  } finally {
    S.mm.busy = null;
    await render();
  }
}

const connectWallet = () =>
  walletTask('Poveži denarnico in podpiši sporočilo v MetaMasku …', async () => {
    const [address] = await eth('eth_requestAccounts');
    await ensureBaseSepolia();
    const { message } = await api('/api/wallet/challenge', { method: 'POST', body: { address } });
    const signature = await eth('personal_sign', [toHex(new TextEncoder().encode(message)), address]);
    await api('/api/wallet/owner', { method: 'POST', body: { address, signature } });
    toast('Denarnica povezana.');
  });

const depositFunds = (amount) =>
  walletTask('Podpiši polnitev v MetaMasku …', async () => {
    const { wallet } = S.data.tx;
    const from = wallet.owner.address;
    if (!(amount > 0)) throw new Error('Vnesi znesek, večji od 0.');
    const [account] = await eth('eth_requestAccounts');
    if (account.toLowerCase() !== from.toLowerCase()) throw new Error(`V MetaMasku izberi povezani račun ${from.slice(0, 10)}…`);
    await ensureBaseSepolia();
    const available = await mmBalance(from);
    if (amount > available) throw new Error(`V MetaMasku imaš le ${usdc(available)}.`);
    const now = Math.floor(Date.now() / 1000);
    const authorization = { from, to: wallet.address, value: String(Math.round(amount * 1e6)), validAfter: String(now - 5), validBefore: String(now + 300), nonce: toHex(crypto.getRandomValues(new Uint8Array(32))) };
    const typed = {
      types: {
        EIP712Domain: [{ name: 'name', type: 'string' }, { name: 'version', type: 'string' }, { name: 'chainId', type: 'uint256' }, { name: 'verifyingContract', type: 'address' }],
        TransferWithAuthorization: [{ name: 'from', type: 'address' }, { name: 'to', type: 'address' }, { name: 'value', type: 'uint256' }, { name: 'validAfter', type: 'uint256' }, { name: 'validBefore', type: 'uint256' }, { name: 'nonce', type: 'bytes32' }],
      },
      primaryType: 'TransferWithAuthorization',
      domain: { name: 'USDC', version: '2', chainId: 84532, verifyingContract: USDC },
      message: authorization,
    };
    const signature = await eth('eth_signTypedData_v4', [from, JSON.stringify(typed)]);
    S.mm.busy = 'Facilitator izvaja prenos na verigi …';
    render(false);
    const r = await api('/api/wallet/deposit', { method: 'POST', body: { authorization, signature } });
    toast(`Agentu nakazano ${usdc(r.funding.amount)}. <a href="${esc(r.funding.explorer)}" target="_blank" rel="noopener">Transakcija ↗</a>`, 7000);
  });

async function refundFunds() {
  const { wallet } = S.data.tx;
  if (!confirm(`Vrnem ${usdc(wallet.balance)} iz denarnice agenta na ${wallet.owner.address}?`)) return;
  S.mm.busy = 'Agent vrača sredstva, facilitator izvaja prenos …';
  render(false);
  try {
    const r = await api('/api/wallet/refund', { method: 'POST' });
    toast(`Vrnjeno ${usdc(r.funding.amount)}. <a href="${esc(r.funding.explorer)}" target="_blank" rel="noopener">Transakcija ↗</a>`, 7000);
  } catch (err) {
    toast(esc(err.message), 7000);
  }
  S.mm.busy = null;
  await render();
}

// MetaMask testnih žetonov ne pozna sam, zato mu USDC na Base Sepolia dodamo (wallet_watchAsset).
const watchUsdc = () =>
  walletTask('Potrdi dodajanje USDC v MetaMasku …', async () => {
    await ensureBaseSepolia();
    const added = await eth('wallet_watchAsset', { type: 'ERC20', options: { address: USDC, symbol: 'USDC', decimals: 6 } });
    toast(added ? 'USDC dodan v MetaMask. Stanje vidiš na omrežju Base Sepolia.' : 'Dodajanje preklicano.');
  });

async function unlinkWallet() {
  await api('/api/wallet/owner', { method: 'DELETE' });
  toast('Povezava z denarnico odstranjena.');
  await render();
}

function ownerWalletCard() {
  const { wallet, funding } = S.data.tx;
  const busy = S.mm.busy ? `<p class="small" style="margin-top:10px">⏳ ${esc(S.mm.busy)}</p>` : '';
  const dis = S.mm.busy ? 'disabled' : '';
  if (!wallet.owner) {
    return `<div class="card" style="margin-top:16px">
      <h2>Lastnikova denarnica (MetaMask)</h2>
      <p class="muted">Poveži svojo denarnico, da lahko polniš denarnico glavnega agenta in dobiš vrnjena neporabljena sredstva. Agent tvojega ključa nikoli ne vidi. Porabi lahko le, kar mu nakažeš, in to v okviru pravil porabe.</p>
      <button class="btn primary" data-wallet="connect" ${dis}>Poveži MetaMask</button>${busy}
    </div>`;
  }
  const o = wallet.owner;
  return `<div class="card" style="margin-top:16px">
    <h2>Lastnikova denarnica (MetaMask)</h2>
    <div class="grid cols-3" style="margin-top:8px">
      <div><div class="small muted">Povezan naslov</div><div class="mono"><a href="https://sepolia.basescan.org/address/${esc(o.address)}" target="_blank" rel="noopener">${esc(short(o.address))} ↗</a></div></div>
      <div><div class="small muted">Stanje v MetaMasku</div><b>${S.mm.balance == null ? '–' : usdc(S.mm.balance)}</b></div>
      <div><div class="small muted">Denarnica agenta</div><b>${usdc(wallet.balance)}</b></div>
    </div>
    <form id="deposit-form" style="display:flex;gap:8px;flex-wrap:wrap;align-items:center;margin-top:14px">
      <input type="number" name="amount" min="0.01" max="50" step="0.01" value="1" style="width:110px" ${dis}> <span class="small">USDC</span>
      <button class="btn primary" ${dis}>Napolni agenta</button>
      <button type="button" class="btn" data-wallet="refund" ${dis || (wallet.balance <= 0 ? 'disabled' : '')}>Vrni neporabljeno (${usdc(wallet.balance)})</button>
      <button type="button" class="btn sm" data-wallet="watch" ${dis}>Prikaži USDC v MetaMasku</button>
      <button type="button" class="btn sm danger" data-wallet="unlink" ${dis}>Prekini povezavo</button>
    </form>
    <p class="small muted" style="margin-top:8px">Polnitev v MetaMasku samo podpišeš (EIP-3009). Prenos izvede facilitator x402, zato ETH za plin ni potreben.</p>${busy}
    ${funding.length ? `<div class="table-wrap" style="margin-top:12px"><table>
      <tr><th>Čas</th><th>Vrsta</th><th>Znesek</th><th>Tx</th></tr>
      ${funding.map((f) => `<tr><td>${dateTime(f.at)}</td><td>${f.type === 'polnitev' ? 'Polnitev agenta' : 'Vračilo lastniku'}</td><td><b>${f.type === 'polnitev' ? '+' : '−'}${usdc(f.amount)}</b></td><td class="mono">${txCell(f)}</td></tr>`).join('')}
    </table></div>` : ''}
  </div>`;
}

function paymentsView() {
  const { transactions, budget, wallet } = S.data.tx;
  const byAgent = {};
  transactions.forEach((t) => (byAgent[t.agentName] = (byAgent[t.agentName] || 0) + t.amount));
  const maxA = Math.max(0.01, ...Object.values(byAgent));
  return `
    <h1>Plačila x402</h1>
    <p class="sub">Vsa mikroplačila, ki jih je glavni agent izvedel pri specializiranih agentih. ${wallet.mode === 'sepolia' ? 'Omrežje: Base Sepolia (testno). Plačila so prave transakcije USDC na verigi, poravna jih javni facilitator x402.' : 'Omrežje: Base Sepolia (testno, simulirano). Za prava plačila zaženi <code>npm run start:sepolia</code>.'}</p>
    ${wallet.mode === 'sepolia' && wallet.balance < 0.2 ? `<div class="card" style="margin-bottom:16px;border-color:#e0a800"><b>Denarnica agenta nima dovolj testnih USDC.</b> Napolni jo iz svoje denarnice spodaj ali pa na <a href="${esc(wallet.faucet)}" target="_blank" rel="noopener">Circle faucet</a> izberi Base Sepolia in vnesi naslov <span class="mono">${esc(wallet.address)}</span>. ETH ni potreben, plin plača facilitator.</div>` : ''}
    <div class="grid cols-4">
      <div class="card stat"><div class="label">Porabljeno ta mesec</div><div class="value">${usdc(budget.spent)}</div><div class="meter"><i style="width:${(budget.spent / budget.limit) * 100}%"></i></div><div class="hint">limit ${usdc(budget.limit)}</div></div>
      <div class="card stat"><div class="label">Število plačil</div><div class="value">${transactions.length}</div></div>
      <div class="card stat"><div class="label">Povprečno plačilo</div><div class="value">${transactions.length ? usdc(budget.spent / transactions.length, 3) : '–'}</div></div>
      <div class="card stat"><div class="label">Stanje denarnice</div><div class="value">${usdc(wallet.balance)}</div></div>
    </div>
    ${wallet.mode === 'sepolia' ? ownerWalletCard() : ''}
    <div class="card" style="margin-top:16px">
      <h2>Kako poteka plačilo</h2>
      <div class="flow">
        <div><b>1. Zahteva</b>Glavni agent pokliče storitev agenta brez plačila.</div>
        <div><b>2. 402 Payment Required</b>Agent vrne ceno, prejemnika, žeton (USDC) in omrežje.</div>
        <div><b>3. Pravila in podpis</b>Preveri limit, proračun in register, nato podpiše avtorizacijo in jo pošlje v glavi X-PAYMENT.</div>
        <div><b>4. Poravnava</b>Facilitator preveri in poravna plačilo, agent vrne rezultat in X-PAYMENT-RESPONSE.</div>
      </div>
    </div>
    <div class="grid" style="grid-template-columns:minmax(0,2fr) minmax(0,1fr);margin-top:16px">
      <div class="card">
        <h2>Transakcije</h2>
        ${transactions.length ? `<div class="table-wrap"><table>
          <tr><th>Čas</th><th>Agent</th><th>Namen</th><th>Znesek</th><th>Tx</th></tr>
          ${transactions.map((t) => `<tr><td>${dateTime(t.at)}</td><td>${esc(t.agentName)}</td><td class="muted">${esc(t.purpose)}</td><td><b>${usdc(t.amount)}</b></td><td class="mono">${txCell(t)}</td></tr>`).join('')}
        </table></div>` : '<p class="muted">Še ni plačil. Odzovite se na simulacijo v nabiralniku in odobrite plan glavnega agenta.</p>'}
      </div>
      <div class="card">
        <h2>Poraba po agentih</h2>
        ${Object.keys(byAgent).length ? Object.entries(byAgent).map(([n, v]) => `<div class="bar-row" style="grid-template-columns:110px 1fr 72px"><span>${esc(n)}</span><div class="bar"><i style="width:${(v / maxA) * 100}%"></i></div><span class="small">${usdc(v)}</span></div>`).join('') : '<p class="muted">–</p>'}
      </div>
    </div>`;
}

// ---------------------------------------------------------------------------
// Analitika organizacije
// ---------------------------------------------------------------------------
async function loadOrg() {
  S.data.org = await api('/api/org');
}

function sparkline(vals) {
  if (!vals.length) return '';
  const w = 90, h = 24;
  const pts = vals.map((v, i) => `${(i / (vals.length - 1)) * w},${h - v * h}`).join(' ');
  return `<svg width="${w}" height="${h}" viewBox="0 -2 ${w} ${h + 4}"><polyline points="${pts}" fill="none" stroke="var(--ok)" stroke-width="2" stroke-linejoin="round"/></svg>`;
}

function orgView() {
  const o = S.data.org;
  return `
    <h1>Analitika organizacije</h1>
    <p class="sub">Anonimiziran prikaz pripravljenosti. Posameznikov ni mogoče prepoznati, oddelki z manj kot ${o.kThreshold} osebami so skriti.</p>
    <div class="grid cols-4">
      <div class="card stat"><div class="label">Vključenih zaposlenih</div><div class="value">${o.employees}</div></div>
      <div class="card stat"><div class="label">Stopnja prijav</div><div class="value">${pct(o.reportRate)}</div><div class="hint">ključni kazalnik vedenja</div></div>
      <div class="card stat"><div class="label">Stopnja klikov</div><div class="value">${pct(o.clickRate)}</div></div>
      <div class="card stat"><div class="label">Mediani čas do prijave</div><div class="value">${o.medianMinutes} min</div></div>
    </div>
    <div class="card" style="margin-top:16px">
      <h2>Po oddelkih</h2>
      <div class="table-wrap"><table>
        <tr><th>Oddelek</th><th>Oseb</th><th>Prijave</th><th>Kliki</th><th>Čas do prijave</th><th>Trend prijav (${o.months[0]}–${o.months.at(-1)})</th><th>Najšibkejša taktika</th></tr>
        ${o.departments.map((d) => d.hidden
          ? `<tr class="rejected"><td>${esc(d.name)}</td><td>${d.n}</td><td colspan="5"><span class="chip">Skrito zaradi anonimnosti (manj kot ${o.kThreshold} oseb)</span></td></tr>`
          : `<tr><td><b>${esc(d.name)}</b></td><td>${d.n}</td><td>${pct(d.report)}</td><td>${pct(d.click)}</td><td>${d.minutes} min</td><td>${sparkline(d.trend)}</td><td><span class="chip warn">${esc(d.weakLabel)}</span></td></tr>`).join('')}
      </table></div>
    </div>
    <div class="card" style="margin-top:16px">
      <h2>Ranljivost po taktikah (delež klikov)</h2>
      ${o.tactics.map((t) => `<div class="bar-row"><span>${esc(t.label)}</span><div class="bar"><i style="width:${t.clickRate * 100 * 2}%;background:var(--warn)"></i></div><span class="small">${pct(t.clickRate)}</span></div>`).join('')}
      <p class="small muted" style="margin-bottom:0">Merimo vedenje (prijave, čas odziva), ne le klikov, saj je prijava tisto, kar organizacijo dejansko zaščiti.</p>
    </div>`;
}

// ---------------------------------------------------------------------------
// Pravila in nadzor
// ---------------------------------------------------------------------------
async function loadRules() {
  [S.data.policy, S.data.audit] = await Promise.all([api('/api/policy'), api('/api/audit')]);
}

function rulesView() {
  const p = S.data.policy;
  const toggle = (k, label, help) => `<div class="field"><label class="switch" style="color:var(--ink);font-size:14px"><input type="checkbox" name="${k}" ${p[k] ? 'checked' : ''}>${label}</label><div class="help">${help}</div></div>`;
  const num = (k, label, step, help) => `<div class="field"><label>${label}</label><input type="number" name="${k}" value="${p[k]}" step="${step}" min="0"><div class="help">${help}</div></div>`;
  return `
    <h1>Pravila in nadzor</h1>
    <p class="sub">Okvir, znotraj katerega glavni agent deluje samostojno: stroški, podatki, etika in pogostost.</p>
    <form class="card" id="policy-form">
      <h2>Stroški</h2>
      <div class="form-grid">
        ${num('monthlyBudget', 'Mesečni proračun (USDC)', '0.5', 'Agent ne more porabiti več, tudi če ima sredstva.')}
        ${num('maxPerTx', 'Največ na transakcijo (USDC)', '0.01', 'Dražji agenti so samodejno izločeni.')}
        ${num('minRating', 'Najnižja ocena agenta', '0.1', 'Agenti z nižjo oceno so izločeni.')}
        ${num('maxSimsPerMonth', 'Največ simulacij na osebo na mesec', '1', 'Preprečuje nadlegovanje in »treniranje obratno«.')}
      </div>
      <h2 style="margin-top:22px">Nadzor in podatki</h2>
      <div class="form-grid">
        ${toggle('requireApproval', 'Človeška odobritev vsakega plana', 'Brez odobritve agent ne plača ničesar.')}
        ${toggle('allowlistOnly', 'Samo agenti z odobrenega seznama', 'Seznam urejate na tržnici.')}
        ${toggle('verifiedOnly', 'Samo preverjeni ponudniki', 'Izloči neznane ponudnike.')}
        ${toggle('dataMinimization', 'Minimizacija podatkov (GDPR)', 'Izloči agente, ki zahtevajo osebne podatke.')}
      </div>
      <h2 style="margin-top:22px">Kanali</h2>
      <div class="row-actions">
        ${Object.entries(p.channels).map(([k, v]) => `<label class="switch"><input type="checkbox" name="ch_${k}" ${v ? 'checked' : ''}>${esc(S.state.channels[k])}</label>`).join('')}
      </div>
      <h2 style="margin-top:22px">Etične meje</h2>
      <div class="field"><label>Prepovedane teme (ločene z vejico)</label><input type="text" name="blockedTopics" value="${esc(p.blockedTopics.join(', '))}"><div class="help">Simulacije s temi temami (npr. lažna odpuščanja ali bonusi) zavrne etični pregled.</div></div>
      <div class="row-actions" style="margin-top:18px"><button class="btn primary" type="submit">Shrani pravila</button></div>
    </form>
    <div class="card" style="margin-top:16px">
      <h2>Revizijska sled</h2>
      <div class="audit">${S.data.audit.map((a) => `<div><span class="muted">${time(a.at)}</span><b>${esc(a.actor)}</b><span>${esc(a.action)}${a.detail ? ` <span class="muted">– ${esc(a.detail)}</span>` : ''}</span></div>`).join('')}</div>
    </div>`;
}

async function savePolicy(form) {
  const f = new FormData(form);
  const body = {
    monthlyBudget: f.get('monthlyBudget'),
    maxPerTx: f.get('maxPerTx'),
    minRating: f.get('minRating'),
    maxSimsPerMonth: f.get('maxSimsPerMonth'),
    requireApproval: f.has('requireApproval'),
    allowlistOnly: f.has('allowlistOnly'),
    verifiedOnly: f.has('verifiedOnly'),
    dataMinimization: f.has('dataMinimization'),
    channels: Object.fromEntries(Object.keys(S.data.policy.channels).map((k) => [k, f.has('ch_' + k)])),
    blockedTopics: String(f.get('blockedTopics')).split(',').map((s) => s.trim()).filter(Boolean),
  };
  await api('/api/policy', { method: 'PUT', body });
  await refreshState();
  toast('Pravila shranjena. Veljajo za naslednji plan.');
  render();
}

// ---------------------------------------------------------------------------
// Usmerjanje
// ---------------------------------------------------------------------------
const VIEWS = {
  nabiralnik: [loadInbox, inboxView],
  napredek: [null, progressView],
  agent: [loadAgent, agentView],
  trznica: [loadMarket, marketView],
  placila: [loadPayments, paymentsView],
  organizacija: [loadOrg, orgView],
  pravila: [loadRules, rulesView],
};
const currentView = () => (location.hash.replace('#/', '') || 'nabiralnik').split('?')[0];

async function render(reload = true) {
  const name = VIEWS[currentView()] ? currentView() : 'nabiralnik';
  const [load, view] = VIEWS[name];
  if (reload) {
    await refreshState();
    if (load) await load();
    if (!S.messages.length) S.messages = await api('/api/messages');
  }
  document.querySelectorAll('.nav a').forEach((a) => a.classList.toggle('active', a.dataset.view === name));
  $('#view').innerHTML = view();
  renderChrome();
}

window.addEventListener('hashchange', async () => {
  window.scrollTo(0, 0);
  await render();
  if (currentView() === 'agent' && S.autoPlan) {
    S.autoPlan = false;
    makePlan();
  }
});

document.addEventListener('click', (e) => {
  const t = e.target;
  const item = t.closest('.msg-item');
  if (item) return openMessage(item.dataset.id);
  if (t.closest('[data-back]')) {
    S.selected = null;
    return render(false);
  }
  if (t.closest('[data-link]')) {
    e.preventDefault();
    const m = S.messages.find((x) => x.id === S.selected);
    if (m?.simulation && !m.resolved) return act('click');
    return;
  }
  const actBtn = t.closest('[data-act]');
  if (actBtn) return act(actBtn.dataset.act);
  const del = t.closest('[data-deliver]');
  if (del) return deliver(del.dataset.deliver);
  if (t.closest('[data-goto-agent]')) {
    closeModal();
    S.autoPlan = !(S.plan && ['pending', 'running'].includes(S.plan.status));
    if (currentView() === 'agent') {
      S.autoPlan = false;
      return makePlan();
    }
    location.hash = '#/agent';
    return;
  }
  if (t.closest('[data-plan]')) return makePlan();
  const dec = t.closest('[data-decide]');
  if (dec) return decide(dec.dataset.decide === '1');
  const w = t.closest('[data-wallet]');
  if (w) return { connect: connectWallet, refund: refundFunds, unlink: unlinkWallet, watch: watchUsdc }[w.dataset.wallet]();
});

document.addEventListener('change', async (e) => {
  const allow = e.target.closest('[data-allow]');
  if (allow) {
    await api(`/api/agents/${allow.dataset.allow}/allowlist`, { method: 'POST', body: { allowlisted: allow.checked } });
    toast(`${allow.checked ? 'Dodano na' : 'Odstranjeno z'} odobrenega seznama.`);
    render();
  }
});

document.addEventListener('submit', (e) => {
  if (e.target.id === 'policy-form') {
    e.preventDefault();
    savePolicy(e.target);
  }
  if (e.target.id === 'deposit-form') {
    e.preventDefault();
    depositFunds(Number(new FormData(e.target).get('amount')));
  }
});

// Statusna vrstica kot v brskalniku: pokaže pravi cilj povezave ob prehodu z miško
document.addEventListener('mouseover', (e) => {
  const l = e.target.closest('[data-link]');
  const bar = $('#statusbar');
  if (l) {
    bar.textContent = l.dataset.real;
    bar.hidden = false;
  } else bar.hidden = true;
});

render();
