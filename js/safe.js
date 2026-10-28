// Small, dependency-free guards for values that cross scene/import boundaries.
export function escapeHTML(value) {
  return String(value == null ? "" : value).replace(/[&<>"']/g, (ch) => ({
    "&": "&amp;",
    "<": "&lt;",
    ">": "&gt;",
    '"': "&quot;",
    "'": "&#39;",
  })[ch]);
}

// Data links must have an explicit allowed scheme; never resolve against the page.
export function safeHref(url, { allow = ["http:", "https:", "mailto:"] } = {}) {
  if (typeof url !== "string" || /[\u0000-\u001f\u007f-\u009f\\]/.test(url)) return "";
  const value = url.trim();
  if (!/^[a-z][a-z0-9+.-]*:/i.test(value)) return "";
  try {
    const parsed = new URL(value);
    if (!allow.includes(parsed.protocol)) return "";
    if ((parsed.protocol === "http:" || parsed.protocol === "https:") && !/^https?:\/\/[^/\s]/i.test(value)) return "";
    return parsed.href;
  } catch {
    return "";
  }
}

// Display names / chat handles that may later land in innerHTML. Strip control
// chars and hard-cap length so a peer cannot bloat the DOM or smuggle markup.
export function sanitizeDisplayName(value, maxLen) {
  const n = Math.max(1, maxLen == null ? 48 : maxLen);
  return String(value == null ? "" : value)
    .replace(/[\u0000-\u001f\u007f]/g, "")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, n);
}

// Custom models always use their own namespace. Besides making HTML/data
// attributes safe, this prevents an import from replacing a built-in builder.
export function validCustomModelKey(value) {
  return typeof value === "string" && /^cm_[A-Za-z0-9_-]{1,64}$/.test(value);
}
