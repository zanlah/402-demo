import { S, refreshState } from './state.js';
import { api } from './api.js';
import { $ } from './format.js';
import { renderChrome } from './chrome.js';
import { reportError } from './ui.js';

let views = {};
let signedOutView;

// The entry point supplies views so features never import one another through the router.
export function configureRouter(viewRegistry, loginView) {
  views = viewRegistry;
  signedOutView = loginView;
  window.addEventListener('hashchange', () => {
    window.scrollTo(0, 0);
    render().catch(reportError);
  });
}

export const currentView = () => (location.hash.replace('#/', '') || (S.state?.session.role === 'admin' ? 'organizacija' : 'nabiralnik')).split('?')[0];

export async function render(reload = true) {
  if (!S.state) return signedOutView();
  const employee = S.state.session.role === 'employee';
  const requested = currentView();
  const allowed = employee ? ['nabiralnik', 'napredek'] : Object.keys(views).filter(v => !['nabiralnik', 'napredek'].includes(v));
  const name = allowed.includes(requested) ? requested : allowed[0];
  if (name !== requested) { location.hash = '#/' + name; return; }
  const [load, view] = views[name];
  if (reload) {
    await refreshState();
    if (load) await load();
    if (employee && !S.messages.length) S.messages = await api('/api/messages');
  }
  document.querySelectorAll('.nav a').forEach((a) => a.classList.toggle('active', a.dataset.view === name));
  $('#view').innerHTML = view();
  renderChrome(name);
}
