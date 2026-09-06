/* Moving a host's own element into a uikit container, and putting it back
   exactly where it was.
 *
 * This is the trick the whole module rests on. uikit does not re-implement a
 * host's panels; it MOVES them. A moved element is the same element, so its
 * event listeners, its internal state, its scroll position and every
 * getElementById that points at it keep working — nothing in the host has to
 * know it was rearranged. The alternative, re-rendering a host's panel from a
 * description of it, means reimplementing every panel in the app and getting
 * all of them subtly wrong.
 *
 * ADOPTION MUST BE EXACTLY REVERSIBLE, and that is the invariant this file is
 * accountable for. A half-restored DOM is worse than no feature at all: the
 * user turns the layout off to get their app back and the app is still broken.
 * So the home is recorded as (parent, nextSibling) at the FIRST adoption and
 * never updated.
 *
 * THE LOAN. An adopted element is NOT wrapped — see runtime/render.js for why
 * a wrapper is unusable against a real host's CSS — so the few things uikit
 * needs to express about a node have to be written onto the borrowed element
 * itself. That set is deliberately tiny and fixed:
 *
 *   hidden            a property, and the only one that can have had a prior
 *                     value worth restoring, so it is snapshotted here
 *   data-uikit-*      attributes; uikit's own namespace, so absent before and
 *                     removed after
 *   --uikit-*         inline custom properties; same reasoning
 *
 * Two of the three can only ever be removed, which is why release() is still
 * a short function. Anything outside that set is not uikit's to touch.
 *
 * RELEASE RUNS IN REVERSE. Siblings adopted out of one parent are put back
 * newest-first, so each one's recorded nextSibling is already home by the time
 * it is needed. Restoring forwards works for simple cases and quietly reverses
 * pairs in nested ones.
 *
 * The home element can also legitimately vanish while we hold the child — the
 * host tore down a panel that had already been adopted. That is reported, not
 * thrown: the caller is usually mid-teardown and cannot do anything useful
 * with an exception except leave the rest of the DOM unrestored.
 */

export function createAdopter() {
  /* Insertion-ordered: Map iteration order is insertion order, which is what
     makes "release in reverse" a reverse of this list and not a guess. */
  const homes = new Map();

  /* Record where an element lives, WITHOUT moving it.
   *
   * This is the call the renderer actually uses. Since an adopted element is
   * not wrapped, it is positioned by the same child-ordering pass as every
   * other node, and by the time that pass runs the home must already be
   * recorded — read the parent after the move and "home" is wherever the
   * layout just put it, which is how an element gets restored to the place it
   * was borrowed INTO rather than the place it came from.
   *
   * Claiming twice is a no-op: the first claim is the only true one. */
  function claim(el) {
    if (!el) return false;
    if (!homes.has(el)) {
      homes.set(el, {
        parent: el.parentNode || null,
        next: el.nextSibling || null,
        hidden: el.hidden,
      });
    }
    return true;
  }

  function adopt(el, container) {
    if (!el || !container || el === container) return false;
    claim(el);
    /* Already in the right place: appending would still be a DOM mutation, and
       on an element holding focus or a running transition that is not free. */
    if (el.parentNode !== container) container.appendChild(el);
    return true;
  }

  /* Undo the loan. Called before the element goes home, so a caller that only
     wants to stop expressing a layout on it can do that without moving it. */
  function unlend(el, home) {
    el.hidden = home.hidden;
    for (const attr of [...el.attributes]) {
      if (attr.name.startsWith("data-uikit-")) el.removeAttribute(attr.name);
    }
    const style = el.style;
    for (let i = style.length - 1; i >= 0; i--) {
      const name = style[i];
      if (name.startsWith("--uikit-")) style.removeProperty(name);
    }
    if (!el.getAttribute("style")) el.removeAttribute("style");
  }

  function restore(el, home, problems) {
    unlend(el, home);
    if (!home.parent) {
      // Never had a parent: it was detached when we took it. Detach it again.
      if (el.parentNode) el.parentNode.removeChild(el);
      return;
    }
    if (!home.parent.isConnected && home.parent.nodeType === 1 && !home.parent.parentNode) {
      problems.push({ code: "home-detached", el });
    }
    /* The recorded sibling may have been moved by the host, or adopted by us
       and not yet released. Appending is the honest fallback: the element is
       back under the parent it belongs to, in the only position we can still
       justify. */
    if (home.next && home.next.parentNode === home.parent) {
      home.parent.insertBefore(el, home.next);
    } else {
      home.parent.appendChild(el);
    }
  }

  return {
    adopt,
    claim,

    /* Is this element currently held, and where did it come from? */
    holds(el) {
      return homes.has(el);
    },
    homeOf(el) {
      return homes.get(el) || null;
    },
    size() {
      return homes.size;
    },

    release(el) {
      const home = homes.get(el);
      if (!home) return [];
      const problems = [];
      restore(el, home, problems);
      homes.delete(el);
      return problems;
    },

    releaseAll() {
      const problems = [];
      for (const el of [...homes.keys()].reverse()) {
        restore(el, homes.get(el), problems);
      }
      homes.clear();
      return problems;
    },
  };
}
