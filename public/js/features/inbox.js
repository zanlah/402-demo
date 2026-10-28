import { S } from '../core/state.js';
import { api } from '../core/api.js';
import { $, esc, time, dateTime, shortTime, CH_ICON, OUTCOME } from '../core/format.js';
import { render, currentView } from '../core/router.js';
import { toast, closeModal } from '../core/ui.js';
import { on } from '../core/events.js';
import { showFeedback } from './feedback.js';

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
    const a = `<button type="button" class="fake-link ${attach ? 'attach' : ''}" data-real="${esc(m.link.real)}" data-link>${inner}</button>`;
    return showFlags && idx.link ? `<mark class="flag">${a}<sup>${idx.link}</sup></mark>` : a;
  });
  return html;
}

function messageItem(m) {
  const snippet = m.channel === 'email' ? m.subject : m.body.replace(/\{\{\w+\||\}\}|<<link>>/g, '').slice(0, 80);
  const res = m.resolved && m.simulation && OUTCOME[m.resolved.outcome];
  return `
    <div role="button" tabindex="0" class="msg-item ${m.read ? '' : 'unread'} ${S.selected === m.id ? 'active' : ''}" data-id="${m.id}">
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
        <p class="small muted" style="margin:10px 0 0">Taktika: ${esc(S.state.tactics[m.tactic].label)}, težavnost ${m.difficulty}/5.</p>
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
    ${m.link ? `<details class="link-check"><summary>Preveri pravi naslov povezave</summary><code>${esc(m.link.real)}</code><p class="small muted">Pred klikom primerjajte domeno z uradnim naslovom pošiljatelja.</p></details>` : ''}
    ${!m.resolved ? '<label class="reflection">Kaj vas je prepričalo ali opozorilo? <span class="muted">(neobvezno, vidno samo vam)</span><textarea id="reflection" maxlength="500" placeholder="Npr. nenavaden naslov pošiljatelja …"></textarea></label>' : ''}
    <div class="actions-bar">${actions}${m.resolved ? `<span class="muted small" style="align-self:center">Obravnavano</span>` : ''}</div>
    ${flags}${m.resolved ? `<div class="row-actions next-actions"><button class="btn primary" data-next-learning>Naslednja vaja →</button><a class="btn" href="#/napredek">Moj napredek</a></div>` : ''}`;
}

export async function loadInbox() {
  S.messages = await api('/api/messages');
}

export function inboxView() {
  const st = S.state;
  const pend = st.pendingDeliveries;
  const sel = S.messages.find((m) => m.id === S.selected);
  return `
    <span class="eyebrow">VAJA · RAZLAGA · NAPREDEK</span><h1>Moje vaje</h1>
    <p class="sub">Vzemite si trenutek in preverite sporočilo. Nekatera so varna, druga skrivajo prevaro. Vsak odziv je priložnost za učenje.</p>
    ${st.user.included ? '' : `<div class="banner"><div class="grow"><b>${esc(st.user.name)} ni vključen v program simulacij.</b> <span class="muted">Za vključitev se obrnite na IT-skrbnika.</span></div></div>`}
    ${pend.length ? `<div class="banner"><div class="grow"><b>${pend.length} ${pend.length === 1 ? 'simulacija čaka' : 'simulacij čaka'} na dostavo.</b> <span class="muted">Dostavljena bo ob naključnem času v delovnem času (${dateTime(pend[0].deliverAt)}), zato je ne morete pričakovati.</span></div><button class="btn primary sm" data-deliver="${pend[0].id}">Dostavi zdaj (demo)</button></div>` : ''}
    <div class="learning-strip"><span>◉ <b>Vaši odgovori so zasebni.</b> Organizacija prejme le skupinske rezultate.</span><button class="btn primary" data-next-learning>Nadaljuj z vajo →</button></div>
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
  const r = await api(`/api/messages/${m.id}/action`, { method: 'POST', body: { action: actionId, responseMs: Date.now() - S.openedAt, explanation: $('#reflection')?.value || '' } });
  Object.assign(m, r.item);
  S.state = r.state;
  render(false);
  if (!m.simulation) {
    if (r.outcome === 'false_positive') showFeedback(r, m);
    else toast(actionId === 'reply' ? 'Odgovor poslan.' : 'Sporočilo izbrisano.');
    return;
  }
  showFeedback(r, m);
}
async function nextLearning() {
  const r = await api('/api/learning/next', { method: 'POST' });
  closeModal();
  await loadInbox();
  S.selected = r.message.id;
  S.openedAt = Date.now();
  if (currentView() !== 'nabiralnik') location.hash = '#/nabiralnik';
  else await render();
  await api(`/api/messages/${S.selected}/read`, { method: 'POST' });
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

export function bindInboxEvents() {
  on('click', '.msg-item', item => openMessage(item.dataset.id));
  on('keydown', '.msg-item', (item, event) => {
    if (['Enter', ' '].includes(event.key)) { event.preventDefault(); return openMessage(item.dataset.id); }
  });
  on('click', '[data-back]', () => { S.selected = null; return render(false); });
  on('click', '[data-link]', (_, event) => {
    event.preventDefault();
    const message = S.messages.find(m => m.id === S.selected);
    if (message?.simulation && !message.resolved) return act('click');
  });
  on('click', '[data-act]', button => act(button.dataset.act));
  on('click', '[data-deliver]', button => deliver(button.dataset.deliver));
  on('click', '[data-next-learning]', nextLearning);
  document.addEventListener('mouseover', event => {
    const link = event.target.closest('[data-link]');
    const bar = $('#statusbar');
    if (link) { bar.textContent = link.dataset.real; bar.hidden = false; }
    else bar.hidden = true;
  });
}
