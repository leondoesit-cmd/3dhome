/* Which presentation of the layout is on screen right now.
 *
 * uikit does not decide what a phone is. The host does, because the host
 * already has that judgement written down and tested — in 3dhome it is
 * chromePosture(), an eight-device matrix that knows an iPhone on its side is
 * not an unfolded Fold. Re-deriving it here from a width would be a second,
 * worse copy of a decision the app has already made.
 *
 * So the contract is one function: choose(size) -> variant name. The default
 * is "base", which is the honest answer for a host that has not opted in.
 */

export function createVariants(options) {
  const opts = options || {};
  const view = opts.window || (typeof window !== "undefined" ? window : null);
  const choose = typeof opts.choose === "function" ? opts.choose : () => "base";
  const onChange = typeof opts.onChange === "function" ? opts.onChange : null;

  let current = null;
  let listening = false;

  function size() {
    return { w: view ? view.innerWidth || 0 : 0, h: view ? view.innerHeight || 0 : 0 };
  }

  function evaluate() {
    let name;
    try {
      name = choose(size());
    } catch (_) {
      name = "base";
    }
    return name || "base";
  }

  /* Fires only when the NAME changes. A resize that stays inside the same
     breakpoint must not cost a re-render — dragging a window edge would
     otherwise rebuild the chrome on every frame. */
  function refresh() {
    const next = evaluate();
    if (next === current) return false;
    current = next;
    if (onChange) onChange(current);
    return true;
  }

  const onResize = () => refresh();

  current = evaluate();

  return {
    current() {
      return current;
    },
    set(name) {
      if (!name || name === current) return false;
      current = name;
      if (onChange) onChange(current);
      return true;
    },
    refresh,
    watch() {
      if (listening || !view) return;
      view.addEventListener("resize", onResize);
      listening = true;
    },
    stop() {
      if (!listening || !view) return;
      view.removeEventListener("resize", onResize);
      listening = false;
    },
  };
}
