/* Keep the whole value editor above visible phone controls, including their
   actual height after font scaling or a context change. Coordinates are CSS px. */
export function dimensionEditorPosition(box, width, height, clientX, clientY, obstacles = []) {
  const gap = 10;
  const bottom = Math.min(box.bottom, ...obstacles.filter(r => r.width > 0 && r.height > 0 && r.right > box.left && r.left < box.right && r.top > box.top).map(r => r.top));
  const maxHeight = Math.max(0, bottom - box.top - gap * 2);
  const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
  return {
    x: clamp((Number.isFinite(clientX) ? clientX - box.left : box.width / 2) + 16, gap, Math.max(gap, box.width - width - gap)),
    y: clamp((Number.isFinite(clientY) ? clientY - box.top : box.height / 2) - 28, gap, Math.max(gap, bottom - box.top - Math.min(height, maxHeight) - gap)),
    maxHeight,
  };
}
