/* Visual icon picker popover for in-place icon selection.
 *
 * Provides a searchable visual grid of normalized icons rendered via the host
 * ctx.icons contract, with instant filtering, selection, and reset to default.
 */

export function openIconPicker(options) {
  const {
    document: doc,
    anchor,
    currentIcon,
    icons,
    t = (_, fb) => fb,
    onSelect,
    onReset,
    onClose,
  } = options || {};

  if (!doc) return null;

  const existing = doc.querySelector(".uikit-ins-icon-picker");
  if (existing) {
    if (typeof existing.__cleanup === "function") existing.__cleanup();
    existing.remove();
  }

  const popover = doc.createElement("div");
  popover.className = "uikit-ins uikit-ins-icon-picker";
  popover.setAttribute("role", "dialog");
  popover.setAttribute("aria-label", t("uikit_ins_icon_select", "Select icon"));

  const header = doc.createElement("div");
  header.className = "uikit-ins-picker-header";
  const title = doc.createElement("span");
  title.className = "uikit-ins-picker-title";
  title.textContent = t("uikit_ins_icon_select", "Select icon");
  const closeBtn = doc.createElement("button");
  closeBtn.type = "button";
  closeBtn.className = "uikit-ins-picker-close";
  closeBtn.setAttribute("aria-label", t("uikit_ins_cancel", "Close"));
  closeBtn.textContent = "×";
  closeBtn.addEventListener("click", () => cleanup(true));
  header.append(title, closeBtn);
  popover.appendChild(header);

  const searchInput = doc.createElement("input");
  searchInput.type = "search";
  searchInput.className = "uikit-ins-input uikit-ins-icon-search";
  searchInput.placeholder = t("uikit_ins_icon_search", "Search icons…");
  popover.appendChild(searchInput);

  const grid = doc.createElement("div");
  grid.className = "uikit-ins-icon-grid";
  grid.setAttribute("role", "listbox");
  popover.appendChild(grid);

  const iconList = (icons && typeof icons.list === "function") ? icons.list() : [];

  function renderGrid(filter = "") {
    grid.replaceChildren();
    const query = filter.toLowerCase().trim();
    const filtered = query
      ? iconList.filter((name) => name.toLowerCase().includes(query))
      : iconList;

    if (!filtered.length) {
      const empty = doc.createElement("div");
      empty.className = "uikit-ins-picker-empty";
      empty.textContent = t("uikit_ins_no_results", "No icons found");
      grid.appendChild(empty);
      return;
    }

    for (const name of filtered) {
      const btn = doc.createElement("button");
      btn.type = "button";
      btn.className = "uikit-ins-icon-btn";
      if (name === currentIcon) btn.classList.add("is-active");
      btn.setAttribute("title", name);
      btn.setAttribute("aria-label", name);
      btn.setAttribute("role", "option");
      btn.dataset.iconName = name;

      const span = doc.createElement("span");
      span.className = "uikit-ins-icon-preview";
      if (icons && typeof icons.render === "function") {
        icons.render(name, span);
      } else {
        span.setAttribute("data-uikit-icon", name);
      }
      btn.appendChild(span);

      btn.addEventListener("click", () => {
        if (typeof onSelect === "function") onSelect(name);
        cleanup(false);
      });
      grid.appendChild(btn);
    }
  }

  renderGrid();

  searchInput.addEventListener("input", () => {
    renderGrid(searchInput.value);
  });

  const footer = doc.createElement("div");
  footer.className = "uikit-ins-picker-footer";
  const resetBtn = doc.createElement("button");
  resetBtn.type = "button";
  resetBtn.className = "uikit-ins-btn uikit-ins-picker-reset";
  resetBtn.textContent = t("uikit_ins_token_reset", "Reset to default");
  resetBtn.addEventListener("click", () => {
    if (typeof onReset === "function") onReset();
    cleanup(false);
  });
  footer.appendChild(resetBtn);
  popover.appendChild(footer);

  doc.body.appendChild(popover);

  if (anchor && typeof anchor.getBoundingClientRect === "function") {
    const rect = anchor.getBoundingClientRect();
    const popRect = popover.getBoundingClientRect();
    let left = rect.left;
    let top = rect.bottom + 4;
    if (left + popRect.width > doc.documentElement.clientWidth - 8) {
      left = doc.documentElement.clientWidth - popRect.width - 8;
    }
    if (top + popRect.height > doc.documentElement.clientHeight - 8) {
      top = rect.top - popRect.height - 4;
    }
    popover.style.left = Math.max(8, left) + "px";
    popover.style.top = Math.max(8, top) + "px";
  }

  function onKeyDown(e) {
    if (e.key === "Escape") {
      e.preventDefault();
      e.stopPropagation();
      cleanup(true);
    }
  }

  function onPointerDown(e) {
    if (!popover.contains(e.target) && (!anchor || !anchor.contains(e.target))) {
      cleanup(true);
    }
  }

  function cleanup(notifyClose = true) {
    doc.removeEventListener("keydown", onKeyDown, true);
    doc.removeEventListener("pointerdown", onPointerDown, true);
    if (popover.parentNode) popover.parentNode.removeChild(popover);
    if (notifyClose && typeof onClose === "function") onClose();
  }

  popover.__cleanup = cleanup;
  doc.addEventListener("keydown", onKeyDown, true);
  doc.addEventListener("pointerdown", onPointerDown, true);

  searchInput.focus();
  return popover;
}
