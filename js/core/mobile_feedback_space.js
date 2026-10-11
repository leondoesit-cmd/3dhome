/* Drawing guidance occupies its own gutter above every visible bottom shelf. */
export function mobileFeedbackSpace(pane, hintHeight, overlays = []) {
  const tops = overlays.filter(r => r.width > 0 && r.height > 0 && r.right > pane.left && r.left < pane.right && r.top > pane.top).map(r => r.top);
  return {footer:Math.max(0, pane.bottom - Math.min(pane.bottom, ...tops) + (tops.length ? 8 : 0)), gutter:Math.max(56, hintHeight + 16)};
}
