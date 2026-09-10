// A DOM dialog suspends the requested action, never the render/event loop.
let pendingDecision = null;
export function dismissModelerDecision() {
  if (pendingDecision) pendingDecision(null);
}
export function modelerDecisionOpen() { return !!pendingDecision; }
export function askModelerDecision(host, options) {
  dismissModelerDecision();
  return new Promise((resolve) => {
    const previous = document.activeElement;
    const dialog = document.createElement('dialog');
    dialog.id = 'mdDecision';
    dialog.className = 'md-decision';
    dialog.setAttribute('aria-labelledby', 'mdDecisionTitle');
    dialog.setAttribute('aria-describedby', 'mdDecisionMessage');
    const title = document.createElement('h2'); title.id = 'mdDecisionTitle'; title.textContent = options.title;
    const message = document.createElement('p'); message.id = 'mdDecisionMessage'; message.textContent = options.message;
    const actions = document.createElement('div'); actions.className = 'md-decision-actions';
    const cancel = document.createElement('button'); cancel.type = 'button'; cancel.dataset.decision = 'cancel'; cancel.textContent = options.cancel;
    const accept = document.createElement('button'); accept.type = 'button'; accept.dataset.decision = 'accept'; accept.textContent = options.accept;
    actions.append(cancel, accept); dialog.append(title, message, actions); host.appendChild(dialog);
    let settled = false;
    const finish = (accepted) => {
      if (settled) return;
      settled = true; pendingDecision = null;
      dialog.close(); dialog.remove();
      if (previous && previous.isConnected) previous.focus({ preventScroll: true });
      resolve(accepted);
    };
    if (options.dismiss) {
      const dismiss = document.createElement('button'); dismiss.type = 'button';
      dismiss.dataset.decision = 'dismiss'; dismiss.textContent = options.dismiss;
      dismiss.addEventListener('click', () => finish(null)); actions.appendChild(dismiss);
    }
    pendingDecision = finish;
    cancel.addEventListener('click', () => finish(false));
    accept.addEventListener('click', () => finish(true));
    dialog.addEventListener('cancel', (event) => { event.preventDefault(); finish(null); });
    dialog.addEventListener('close', () => finish(null));
    dialog.addEventListener('keydown', (event) => event.stopPropagation());
    dialog.showModal(); (options.focusAccept ? accept : cancel).focus();
  });
}
