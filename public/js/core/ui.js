import { $, esc } from './format.js';

export function showModal(html) {
  const m = $('#modal');
  m.innerHTML = `<div class="modal" role="dialog" aria-modal="true" aria-label="Razlaga vaje" tabindex="-1">${html}</div>`;
  m.hidden = false;
  const dialog = m.querySelector('.modal');
  dialog.scrollTop = 0;
  dialog.focus({ preventScroll: true });
}
export function closeModal() {
  $('#modal').hidden = true;
  $('#view').focus({ preventScroll: true });
}
let toastTimer;
export function toast(html, ms = 4500) {
  const t = $('#toast');
  t.innerHTML = html;
  t.hidden = false;
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => (t.hidden = true), ms);
}

export function clearToast() {
  clearTimeout(toastTimer);
  $('#toast').hidden = true;
}
export function reportError(error) {
  toast(esc(error?.message || 'Dejanje ni uspelo. Poskusite znova.'), 7000);
}
export function bindUiEvents() {
  $('#modal').addEventListener('click', e => {
    if (e.target.id === 'modal' || e.target.closest('[data-close]')) closeModal();
  });
  document.addEventListener('keydown', e => {
    if (e.key === 'Escape') closeModal();
    if (e.key !== 'Tab' || $('#modal').hidden) return;
    const focusable = [...$('#modal').querySelectorAll('button, a[href], input, textarea, select')].filter(el => !el.disabled);
    if (e.shiftKey && (document.activeElement === focusable[0] || document.activeElement === $('#modal .modal'))) { e.preventDefault(); focusable.at(-1)?.focus(); }
    else if (!e.shiftKey && document.activeElement === focusable.at(-1)) { e.preventDefault(); focusable[0]?.focus(); }
  });
}
