import { reportError } from './ui.js';

// Delegated listeners survive view updates; async failures share one error display.
export function on(eventName, selector, handler) {
  document.addEventListener(eventName, event => {
    const target = event.target.closest(selector);
    if (!target) return;
    try { Promise.resolve(handler(target, event)).catch(reportError); }
    catch (error) { reportError(error); }
  });
}
