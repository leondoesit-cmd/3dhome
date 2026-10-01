/* A render function that cannot be re-entered.

   The editor's render() draws the scene and then runs overlay hooks (handle
   readouts, the sketch canvas repaint, view buttons). If any of those, or a
   material callback, asks for another render while one is in flight, the two
   calls nest, and a chain of them ends as "RangeError: Maximum call stack size
   exceeded" inside three's renderBufferDirect. A nested request is not
   performed on the spot: it is remembered, and honoured once, after the
   outer render has finished and unwound (through `defer`, normally
   requestAnimationFrame), so the last requested state is still painted. */
export function guardRenderReentry(render, defer) {
  let running = false, again = false, deferred = false;
  const guarded = function (...args) {
    if (running) { again = true; return undefined; }
    running = true;
    try { return render.apply(this, args); }
    finally {
      running = false;
      if (again && !deferred) {
        again = false;
        deferred = true;
        (defer || ((fn) => setTimeout(fn, 0)))(() => { deferred = false; guarded(); });
      }
    }
  };
  guarded.isRendering = () => running;
  return guarded;
}
