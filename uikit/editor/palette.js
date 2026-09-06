/* Hidden-item recovery and unused registry entries. The palette never guesses
 * a destination: each available item lists only compatible visible
 * containers and the user chooses one before placing it. */

import { containerAccepts } from "./policy.js";

export function createPalette(context) {
  const ctx = context || {};
  const doc = ctx.document;
  const uikit = ctx.uikit;
  const t = ctx.t || ((_, fallback) => fallback);
  let query = "";

  const root = doc.createElement("details");
  root.className = "uikit-ins-browser uikit-ins-palette";
  const summary = doc.createElement("summary");
  const summaryText = doc.createElement("span");
  summaryText.textContent = t("uikit_ins_items", "Items");
  const count = doc.createElement("span");
  count.className = "uikit-ins-summary-count";
  summary.append(summaryText, count);
  root.appendChild(summary);

  const search = doc.createElement("input");
  search.type = "search";
  search.className = "uikit-ins-input uikit-ins-search";
  search.placeholder = t("uikit_ins_search_items", "Search items");
  search.setAttribute("aria-label", search.placeholder);
  root.appendChild(search);

  const hiddenTitle = doc.createElement("strong");
  hiddenTitle.className = "uikit-ins-subtitle";
  hiddenTitle.textContent = t("uikit_ins_hidden_items", "Hidden in this layout");
  root.appendChild(hiddenTitle);
  const hiddenList = doc.createElement("div");
  hiddenList.className = "uikit-ins-item-list";
  root.appendChild(hiddenList);

  const availTitle = doc.createElement("strong");
  availTitle.className = "uikit-ins-subtitle";
  availTitle.textContent = t("uikit_ins_available_items", "Available items");
  root.appendChild(availTitle);
  const variantNote = doc.createElement("p");
  variantNote.className = "uikit-ins-note";
  root.appendChild(variantNote);
  const availableList = doc.createElement("div");
  availableList.className = "uikit-ins-item-list";
  root.appendChild(availableList);

  function title(item) {
    return ctx.titleFor ? ctx.titleFor(item) : item.title || item.label || item.id;
  }

  function matches(item) {
    if (!query) return true;
    const text = title(item).toLowerCase();
    const id = (item.id || "").toLowerCase();
    return text.includes(query) || id.includes(query);
  }

  function empty(parent, text) {
    const p = doc.createElement("p");
    p.className = "uikit-ins-empty";
    p.textContent = text;
    parent.appendChild(p);
  }

  function hiddenRow(node) {
    const row = doc.createElement("div");
    row.className = "uikit-ins-item-row";
    const label = doc.createElement("span");
    label.textContent = title(node);
    label.title = label.textContent;
    const show = doc.createElement("button");
    show.type = "button";
    show.textContent = t("uikit_ins_show", "Show");
    show.addEventListener("click", () => ctx.show(node.id));
    row.append(label, show);
    hiddenList.appendChild(row);
  }

  function compatible(entry, nodes) {
    return (nodes || []).filter((node) => containerAccepts(node, entry, uikit && uikit.registry));
  }

  function availableRow(entry, nodes, structural) {
    const row = doc.createElement("div");
    row.className = "uikit-ins-item-row uikit-ins-place-row";
    const label = doc.createElement("span");
    label.textContent = title(entry);
    label.title = label.textContent;
    const destinations = compatible(entry, nodes);
    const select = doc.createElement("select");
    select.className = "uikit-ins-place-target";
    select.setAttribute("aria-label", t("uikit_ins_destination", "Destination") + ": " + title(entry));

    const preferredId = typeof ctx.selectedContainerId === "function"
      ? ctx.selectedContainerId()
      : ctx.selectedContainerId;
    const preferredTarget = preferredId
      ? destinations.find((d) => d.id === preferredId)?.id
      : null;

    for (const target of destinations) {
      const option = doc.createElement("option");
      option.value = target.id;
      option.textContent = title(target);
      if (preferredTarget && target.id === preferredTarget) option.selected = true;
      select.appendChild(option);
    }
    if (preferredTarget) select.value = preferredTarget;

    const place = doc.createElement("button");
    place.type = "button";
    place.textContent = t("uikit_ins_add", "Add");
    place.disabled = !structural || !destinations.length;
    const reason = !structural
      ? t("uikit_ins_base_only", "Switch to All screens to add or move items.")
      : !destinations.length
        ? t("uikit_ins_no_destination", "No compatible destination is available.") : "";
    if (reason) {
      place.title = reason;
      place.setAttribute("aria-label", title(entry) + ": " + reason);
    }
    place.addEventListener("click", () => ctx.place(entry, select.value));
    row.append(label, select, place);
    availableList.appendChild(row);
  }

  function availableEntries() {
    if (!uikit || !uikit.doc || !uikit.registry) return [];
    const reg = uikit.registry;
    const ids = typeof reg.ids === "function" ? reg.ids() : [];
    const used = new Set();
    for (const id of Object.keys(uikit.doc.nodes || {})) {
      const node = uikit.doc.nodes[id];
      if (node && node.ref) used.add(node.ref);
      used.add(id);
    }
    const out = [];
    for (const id of ids) {
      const entry = typeof reg.get === "function" ? reg.get(id) : null;
      if (!entry || entry.source) continue;
      if (entry.kind === "command") out.push(entry);
      else if (!used.has(id)) out.push(entry);
    }
    return out;
  }

  function unplacedCount() {
    return availableEntries().length;
  }

  function sync(nodes) {
    const all = nodes || [];
    const rootId = (ctx.rootId && ctx.rootId())
      || (uikit.doc && uikit.doc.variants && uikit.doc.variants.base && uikit.doc.variants.base.root)
      || (uikit.resolved() && uikit.resolved().root)
      || (all[0] && all[0].id);
    const hidden = all.filter((node) => node.id !== rootId && node.hidden);
    const availCount = unplacedCount();
    const total = hidden.length + availCount;
    count.textContent = total ? String(total) : "";
    if (total) {
      const details = `${hidden.length} ${t("uikit_ins_hidden", "Hidden").toLowerCase()}, ${availCount} ${t("uikit_ins_available_items", "Available items").toLowerCase()}`;
      count.title = details;
      count.setAttribute("aria-label", details);
    } else {
      count.removeAttribute("title");
      count.removeAttribute("aria-label");
    }

    // Defer unplaced traversal until the disclosure is open
    if (!root.open) return;

    hiddenList.replaceChildren();
    const shownHidden = hidden.filter(matches);
    if (!shownHidden.length) empty(hiddenList, t("uikit_ins_no_hidden", "No hidden items."));
    else for (const node of shownHidden) hiddenRow(node);

    availableList.replaceChildren();
    const shownAvailable = availableEntries().filter(matches);
    const structural = uikit.variant === "base";
    variantNote.textContent = structural ? "" : t(
      "uikit_ins_base_only",
      "Switch to All screens to add or move items."
    );
    if (!shownAvailable.length) empty(availableList, t("uikit_ins_no_available", "No available items."));
    else for (const entry of shownAvailable) availableRow(entry, all, structural);
  }

  search.addEventListener("input", () => {
    query = search.value.trim().toLocaleLowerCase();
    ctx.refresh();
  });
  root.addEventListener("toggle", () => {
    if (root.open) ctx.refresh();
  });

  return {
    element: root,
    sync,
    open: () => {
      root.open = true;
      ctx.refresh();
    },
  };
}
