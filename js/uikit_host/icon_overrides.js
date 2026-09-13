/* The host owns icon placement. UIKit may restyle one command's glyph, never
   every glyph below a toolbar or panel, and must restore it on release. */
import { resolveIconName } from "../icon_settings.js";

export function createIconContract() {
  const originals = new Map();
  function restore(el) {
    const saved = originals.get(el);
    if (!saved) return;
    if (saved.className == null) saved.target.removeAttribute("class");
    else saved.target.setAttribute("class", saved.className);
    originals.delete(el);
  }
  return {
    apply(el, name) {
      const control = el.matches("button, [role=button], [role^=menuitem]")
        ? el : el.querySelector(":scope > .dropdown-trigger");
      const target = control?.querySelector(":scope > i.ph:not(.caret), :scope > .uikit-icon, :scope > span > i.ph:not(.caret)");
      if (!target) return;
      if (originals.has(el) && originals.get(el).target !== target) restore(el);
      if (!originals.has(el)) originals.set(el, { target, className: target.getAttribute("class") });
      const resolved = resolveIconName(name) || name;
      if (!/^(?:ph-)?[a-z0-9-]+$/i.test(resolved)) return;
      for (const cls of [...target.classList]) if (cls.startsWith("ph-")) target.classList.remove(cls);
      target.classList.add("ph", resolved.startsWith("ph-") ? resolved : "ph-" + resolved);
    },
    restore,
  };
}
