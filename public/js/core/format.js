export const $ = (sel, el = document) => el.querySelector(sel);
export const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);
export const usdc = (n, d = 2) => `${Number(n).toFixed(d)} USDC`;
export const pct = (x) => `${Math.round(x * 100)} %`;
export const time = (iso) => new Date(iso).toLocaleTimeString('sl-SI', { hour: '2-digit', minute: '2-digit' });
export const dateTime = (iso) => new Date(iso).toLocaleString('sl-SI', { day: 'numeric', month: 'numeric', hour: '2-digit', minute: '2-digit' });
export const shortTime = (iso) => (new Date(iso).toDateString() === new Date().toDateString() ? time(iso) : new Date(iso).toLocaleDateString('sl-SI', { day: 'numeric', month: 'numeric' }));
export const CH_ICON = { email: '@', sms: '::', chat: '#', glas: '~' };
export const OUTCOME = {
  success: ['ok', 'Prijavljeno'],
  fail: ['bad', 'Nasedli'],
  neutral: ['warn', 'Prezrto'],
};
export const short = (h) => `${h.slice(0, 10)}…${h.slice(-6)}`;
export const addrLink = (w) => (w.explorer ? `<a href="${esc(w.explorer)}" target="_blank" rel="noopener" style="color:inherit">${esc(short(w.address))}</a>` : esc(short(w.address)));
export const txCell = (t) => (t.explorer ? `<a href="${esc(t.explorer)}" target="_blank" rel="noopener" title="${esc(t.txHash)}">${esc(t.txHash.slice(0, 12))}… ↗</a>` : `<span title="${esc(t.txHash)}">${esc(t.txHash.slice(0, 12))}…</span>`);
export const STATUS_CHIP = {
  pending: ['warn', 'Čaka na odobritev'], approved: ['blue', 'Odobreno'], running: ['blue', 'V izvajanju'], done: ['ok', 'Zaključeno'],
  partial: ['warn', 'Delno zaključeno'], rejected: ['bad', 'Zavrnjeno'], failed: ['bad', 'Neuspešno'], no_agent: ['bad', 'Ni primernega agenta'],
  planned: ['', 'Načrtovano'],
};
