import { installAgentBridge } from './agent_runtime.js';
// Prepare code during boot, but construct/restore the dock only on first use.
import * as panel from './ui_agent.js';

let pending = null, initialized = false;
const forwardedEvents = ['agent-tutor-intervention', 'agent-external-proposal'];
function loadPanel() {
  if (!pending) {
    panel.initAgent(false);
    forwardedEvents.forEach(type => window.removeEventListener(type, forward));
    pending = Promise.resolve(panel);
  }
  return pending;
}
function report(error) { console.error('Agent panel failed to load', error); }
function forward(event) {
  const type = event.type, detail = event.detail;
  loadPanel().then(() => window.dispatchEvent(new CustomEvent(type, { detail }))).catch(report);
}
export function initAgent() {
  if (initialized) return;
  initialized = true;
  // The command/preview bridge remains available before the optional UI is constructed.
  installAgentBridge();
  const launch = document.getElementById('agentBtn');
  if (launch) launch.onclick = () => {
    try { loadPanel(); panel.toggleAgent(); } catch (error) { report(error); }
  };
  forwardedEvents.forEach(type => window.addEventListener(type, forward));
  window.addEventListener('agent-panel-ready', () => {
    forwardedEvents.forEach(type => window.removeEventListener(type, forward));
  }, { once: true });
}
export function askAgent(text) {
  if (!text || !String(text).trim()) return false;
  loadPanel().then(module => module.askAgent(text)).catch(report);
  return true;
}
