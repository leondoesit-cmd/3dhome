// Small local-only temporal signal buffer for the adaptive tutor. It stores
// interaction categories, never raw text, pointer trails, or project files.

function clamp01(value) { return Math.max(0, Math.min(1, value)); }

export class AttentionTracker {
  constructor(options = {}) {
    this.now = options.now || Date.now;
    this.windowMs = options.windowMs || 10000;
    this.capacity = options.capacity || 60;
    this.events = [];
    this.pointer = null;
    this.jitter = 0;
  }

  record(type, payload = {}) {
    var event = { at: this.now(), type: String(type || "UNKNOWN"), payload: payload };
    this.events.push(event);
    if (this.events.length > this.capacity) this.events.splice(0, this.events.length - this.capacity);
    this.prune();
    return event;
  }

  pointerMove(x, y) {
    var now = this.now(), prior = this.pointer;
    if (!prior) { this.pointer = { x: x, y: y, at: now, dx: 0, dy: 0 }; return; }
    var dt = Math.max(1, now - prior.at), dx = x - prior.x, dy = y - prior.y;
    var distance = Math.hypot(dx, dy), speed = distance / dt;
    var reversed = prior.dx * dx + prior.dy * dy < 0;
    if (distance > 2 && speed < 0.35 && reversed) this.jitter = Math.min(30, this.jitter + 1);
    else this.jitter = Math.max(0, this.jitter - 0.08);
    this.pointer = { x: x, y: y, at: now, dx: dx, dy: dy };
  }

  prune() {
    var cutoff = this.now() - this.windowMs;
    while (this.events.length && this.events[0].at < cutoff) this.events.shift();
  }

  count(type) {
    this.prune();
    return this.events.filter(function (event) { return event.type === type; }).length;
  }

  score(state = {}) {
    this.prune();
    var score = 0;
    score += Math.min(0.4, this.count("UNDO") * 0.2);
    score += Math.min(0.3, this.count("DRAFT_CANCEL") * 0.15);
    score += Math.min(0.4, this.count("OPENING_EMPTY") * 0.2);
    score += Math.min(0.25, this.count("COMMAND_FAILED") * 0.125);
    if (this.jitter >= 4) score += Math.min(0.2, this.jitter / 50);
    if (Object.keys(state.ignoredWarnings || {}).length) score += 0.1;
    return clamp01(score);
  }

  snapshot(state = {}) {
    this.prune();
    var selection = state.sel || null, ref = selection && selection.ref;
    return {
      frictionScore: Math.round(this.score(state) * 100) / 100,
      activeTool: state.tool || "select",
      selected: selection ? {
        kind: selection.kind || "unknown",
        id: ref && ref.id != null ? ref.id : null,
      } : null,
      activeWarningCount: Object.keys(state.ignoredWarnings || {}).length,
      recentEvents: this.events.slice(-12).map(function (event) {
        return { type: event.type, ageMs: Math.max(0, Date.now() - event.at), payload: event.payload };
      }),
      pointerSearchScore: Math.round(Math.min(1, this.jitter / 10) * 100) / 100,
    };
  }

  clear() { this.events = []; this.pointer = null; this.jitter = 0; }
}

export const tutorAttention = new AttentionTracker();

