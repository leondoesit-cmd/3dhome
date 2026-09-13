/* Customize-mode inspector.
 *
 * The host application stays visible and selectable, so this is deliberately
 * NON-MODAL. Document-capture listeners in designer.js yield to `.uikit-ins`;
 * the inspector stops the later bubble path so host shortcuts never see form
 * editing or its button clicks.
 */

import { resolveText } from "../model/resolve.js";
import { scopeTokens } from "../model/layout_scope.js";
import { handlesFor } from "./resize.js";
import { createPalette } from "./palette.js";
import { createTreeBrowser } from "./tree.js";
import { openIconPicker } from "./icon_picker.js";
import { containerAccepts } from "./policy.js";

const FIELD_TAG = "inspector";

export function createInspector(context) {
  const ctx = context || {};
  const doc = ctx.document;
  const uikit = ctx.uikit;
  const ops = ctx.ops;
  const icons = ctx.icons || null;
  const t = ctx.t || ((_, fallback) => fallback);

  let root = null;
  let current = null;
  let presetScope = null;
  let iconPicker = null;
  let els = {};

  function el(tag, className, parent) {
    const node = doc.createElement(tag);
    if (className) node.className = className;
    if (parent) parent.appendChild(node);
    return node;
  }

  function row(parent, labelText) {
    const wrap = el("label", "uikit-ins-row", parent);
    const span = el("span", "uikit-ins-label", wrap);
    span.textContent = labelText;
    return wrap;
  }

  function button(parent, text, className) {
    const node = el("button", className || null, parent);
    node.type = "button";
    node.textContent = text;
    return node;
  }

  function fallbackIcon(node) {
    if (!node) return null;
    if (icons && typeof icons.iconFor === "function") {
      return icons.iconFor(node);
    }
    return node.icon || (node.entry && node.entry.icon) || null;
  }

  function findAncestorChain(rootNode, targetId, chain = []) {
    if (!rootNode) return null;
    const current = chain.concat(rootNode);
    if (rootNode.id === targetId) return current;
    for (const child of rootNode.children || []) {
      const found = findAncestorChain(child, targetId, current);
      if (found) return found;
    }
    return null;
  }

  function build() {
    root = el("section", "uikit-ins");
    root.setAttribute("role", "region");
    root.setAttribute("aria-label", t("uikit_ins_title", "Customize interface"));

    const head = el("header", "uikit-ins-head", root);
    els.title = el("strong", "uikit-ins-title", head);
    els.title.textContent = t("uikit_ins_title", "Customize interface");
    el("span", "uikit-ins-subtitle", head).textContent = t(
      "uikit_ins_subtitle", "Make this workspace yours"
    );
    const headActions = el("div", "uikit-ins-head-actions", head);
    els.undo = button(headActions, t("uikit_ins_undo", "Undo"), "uikit-ins-head-action");
    els.redo = button(headActions, t("uikit_ins_redo", "Redo"), "uikit-ins-head-action");
    els.discard = button(headActions, t("uikit_ins_discard", "Discard"), "uikit-ins-head-action");
    els.discard.title = t("uikit_ins_discard_hint", "Discard changes from this customization session");
    els.done = button(headActions, t("uikit_ins_done", "Done"), "uikit-ins-done");

    els.live = el("div", "uikit-sr-only", root);
    els.live.setAttribute("role", "status");
    els.live.setAttribute("aria-live", "polite");
    els.live.textContent = t("uikit_ins_started", "Customize mode started.");

    els.scroll = el("div", "uikit-ins-scroll", root);
    els.empty = el("div", "uikit-ins-empty", els.scroll);
    el("strong", null, els.empty).textContent = t(
      "uikit_ins_empty",
      "Select a panel or toolbar to edit it."
    );
    el("span", null, els.empty).textContent = t(
      "uikit_ins_hint",
      "Click to select · drag to move · Shift-click to select more."
    );

    buildPresets();
    buildNodeSection();
    els.note = el("div", "uikit-ins-note uikit-ins-feedback", els.scroll);
    buildBrowsers();
    buildDocSection();

    wire();
    doc.body.appendChild(root);
    if (icons && typeof icons.list === "function") fillIcons();
    return root;
  }

  function buildBrowsers() {
    els.treeBrowser = createTreeBrowser({
      document: doc,
      t,
      icons,
      command: ctx.command,
      select: (id) => ctx.command("select", { id }),
      setFocus: ctx.setFocus,
      focus: ctx.focus,
      nodeFor: ctx.nodeFor,
      parentFor: ctx.parentFor,
      registry: uikit.registry,
      containerAccepts: (container, moving) => containerAccepts(container, moving, uikit.registry),
      titleFor: ctx.titleFor,
      hasElement: (id) => ctx.hasElement && ctx.hasElement(id),
      isRenameEverywhere: () => !!(els.everywhere && els.everywhere.checked),
    });
    els.scroll.appendChild(els.treeBrowser.element);
    els.palette = createPalette({
      document: doc,
      uikit,
      t,
      hasElement: (id) => ctx.hasElement(id),
      selection: () => ctx.selection(),
      rootId: () => (uikit.doc && uikit.doc.variants && uikit.doc.variants.base && uikit.doc.variants.base.root)
        || (uikit.resolved() && uikit.resolved().root)
        || null,
      show: (id) => ctx.command("setHidden", { id, hidden: false }),
      place: (entry, parent) => ctx.command("place", { entry, parent }),
      refresh: () => paint(),
      titleFor: ctx.titleFor,
      selectedContainerId: () => {
        const ids = typeof ctx.selection === "function" ? ctx.selection() : [];
        const id = ids.length ? ids[ids.length - 1] : null;
        if (!id) return null;
        const node = ctx.nodeFor ? ctx.nodeFor(id) : null;
        if (node && node.children) return id;
        const parent = ctx.parentFor ? ctx.parentFor(id) : null;
        return parent ? parent.id : null;
      },
    });
    els.scroll.appendChild(els.palette.element);
  }

  function buildNodeSection() {
    els.node = el("section", "uikit-ins-node", els.scroll);
    els.breadcrumbs = el("nav", "uikit-ins-breadcrumbs", els.node);
    els.breadcrumbs.setAttribute("aria-label", t("uikit_ins_hierarchy", "Hierarchy"));
    const selectionHead = el("div", "uikit-ins-selection-head", els.node);
    els.headerIcon = el("button", "uikit-ins-header-icon", selectionHead);
    els.headerIcon.type = "button";
    els.selectionTitle = el("strong", "uikit-ins-selection-title", selectionHead);
    els.kind = el("span", "uikit-ins-kind", selectionHead);
    els.body = el("div", "uikit-ins-body", els.node);

    /* A reset beside each parameter, and it appears only when that parameter
       is actually overridden. That makes the panel answer a second question
       for free: the rows with an arrow are the rows you changed. */
    function resetter(host, title, run) {
      const btn = doc.createElement("button");
      btn.type = "button";
      btn.className = "uikit-ins-reset-one";
      btn.title = title;
      btn.setAttribute("aria-label", title);
      btn.hidden = true;
      const glyph = el("span", "uikit-ins-reset-glyph", btn);
      if (icons && typeof icons.render === "function" && typeof icons.iconFor === "function") {
        icons.render(icons.iconFor({ kind: "action:reset" }), glyph);
      } else {
        glyph.textContent = "\u21ba";
      }
      btn.addEventListener("click", (e) => {
        e.preventDefault();
        e.stopPropagation();
        run();
      });
      host.appendChild(btn);
      return btn;
    }

    const labelRow = row(els.body, t("uikit_ins_label", "Name"));
    els.label = el("input", "uikit-ins-input", labelRow);
    els.label.type = "text";
    els.label.setAttribute("data-uikit-field", "label");
    els.labelReset = resetter(labelRow, t("uikit_ins_reset_this", "Reset this"),
      () => ctx.command("resetField", { id: selected(), field: "label" }));

    const everywhereRow = el("label", "uikit-ins-check", els.body);
    els.everywhere = el("input", null, everywhereRow);
    els.everywhere.type = "checkbox";
    el("span", null, everywhereRow).textContent = t(
      "uikit_ins_everywhere",
      "Rename app text in this language"
    );
    /* Its own reset, because its reach is its own: this undoes the wording
       everywhere that string appears, which the per-item reset must not do
       silently. */
    els.textReset = resetter(everywhereRow, t("uikit_ins_reset_this", "Reset this"), () => {
      const node = nodeOf(selected());
      const key = node && node.entry ? node.entry.textKey || node.entry.id : null;
      if (key) {
        const lang = ctx.lang();
        const bucket = uikit.doc.overrides?.text?.[lang];
        ctx.command("resetText", { key, lang: bucket && Object.prototype.hasOwnProperty.call(bucket, key) ? lang : "*" });
      }
    });

    const iconRow = row(els.body, t("uikit_ins_icon", "Icon"));
    els.icon = el("input", "uikit-ins-input", iconRow);
    els.icon.type = "text";
    els.icon.setAttribute("data-uikit-field", "icon");
    els.icon.setAttribute("list", "uikit-ins-icons");
    els.iconReset = resetter(iconRow, t("uikit_ins_reset_this", "Reset this"),
      () => ctx.command("resetField", { id: selected(), field: "icon" }));
    els.iconList = el("datalist", null, root);
    els.iconList.id = "uikit-ins-icons";

    els.wRow = row(els.body, t("uikit_ins_width", "Width"));
    els.w = el("input", "uikit-ins-num", els.wRow);
    els.w.type = "number";
    els.w.inputMode = "decimal";
    els.w.setAttribute("aria-label", t("uikit_ins_width_px", "Width in pixels"));
    els.sizeReset = resetter(els.wRow, t("uikit_ins_reset_this", "Reset this"),
      () => {
        const id = selected();
        if (!id) return;
        let next = ops.resetField(uikit.doc, { id, field: "size", variant: uikit.variant, defaults: uikit.defaults });
        next = ops.resetField(next, { id, field: "rect", variant: uikit.variant, defaults: uikit.defaults });
        apply("Reset size", next);
      });

    els.hRow = row(els.body, t("uikit_ins_height", "Height"));
    els.h = el("input", "uikit-ins-num", els.hRow);
    els.h.type = "number";
    els.h.inputMode = "decimal";
    els.h.setAttribute("aria-label", t("uikit_ins_height_px", "Height in pixels"));

    const hiddenRow = el("label", "uikit-ins-check", els.body);
    els.hidden = el("input", null, hiddenRow);
    els.hidden.type = "checkbox";
    el("span", null, hiddenRow).textContent = t("uikit_ins_hidden", "Hidden");
    els.hiddenReset = resetter(hiddenRow, t("uikit_ins_reset_this", "Reset this"),
      () => ctx.command("resetField", { id: selected(), field: "hidden" }));

    /* Where the item sits is not a PATCHABLE field — it is its parent's child
       list — so it gets a row of its own rather than a control to type into. */
    els.posRow = el("div", "uikit-ins-check uikit-ins-pos", els.body);
    el("span", null, els.posRow).textContent = t("uikit_ins_moved", "Moved from its original place");
    els.posReset = resetter(els.posRow, t("uikit_ins_reset_position", "Move back to its original place"),
      () => ctx.command("resetPosition", { id: selected() }));

    const actions = el("div", "uikit-ins-actions", els.node);
    els.group = button(actions, t("uikit_ins_group", "Group"));
    els.ungroup = button(actions, t("uikit_ins_ungroup", "Ungroup"));
    els.addItem = button(actions, t("uikit_ins_add_item", "Add item"));
    els.addDivider = button(actions, t("uikit_ins_add_divider", "Add divider"));
    els.addMenu = button(actions, t("uikit_ins_add_menu", "Add menu"));
    els.createSubmenu = button(actions, t("uikit_ins_create_submenu", "Create submenu"));
    els.reset = button(actions, t("uikit_ins_reset_selected", "Reset selected"));
  }

  /* Everything here applies to the layout rather than the selected node. */
  function buildDocSection() {
    const section = el("details", "uikit-ins-browser uikit-ins-settings", els.scroll);
    el("summary", null, section).textContent = t("uikit_ins_settings", "Layout & appearance");
    const wrap = el("section", "uikit-ins-doc", section);

    const variantRow = el("div", "uikit-ins-row uikit-ins-variant", wrap);
    el("span", "uikit-ins-label", variantRow).textContent = t("uikit_ins_variant", "Applies to");
    const variantValue = el("span", "uikit-ins-variant-value", variantRow);
    els.variant = el("strong", "uikit-ins-variant-name", variantValue);
    els.variantHint = el("span", "uikit-ins-variant-hint", variantValue);

    const presetRow = row(els.presetsBody, t("uikit_ins_preset", "Current"));
    els.preset = el("select", "uikit-ins-input uikit-ins-preset", presetRow);
    const blank = doc.createElement("option");
    blank.value = "";
    blank.textContent = t("uikit_ins_custom", "Custom");
    els.preset.appendChild(blank);
    for (const preset of uikit.presets()) {
      const option = doc.createElement("option");
      option.value = preset.id;
      const label = (ctx.t && preset.key ? ctx.t(preset.key, preset.label) : null) || preset.label || preset.id;
      option.textContent = label;
      els.preset.appendChild(option);
    }

    els.tokens = el("div", "uikit-ins-tokens", wrap);
    els.tokenControls = new Map();
    for (const spec of ctx.tokens || []) buildToken(els.tokens, spec);

    const resets = el("div", "uikit-ins-actions uikit-ins-layout-resets", wrap);
    els.resetVariant = button(
      resets,
      t("uikit_ins_reset_variant", "Reset this screen size")
    );
    els.resetAll = button(
      resets,
      t("uikit_ins_restore_defaults", "Restore default layout"),
      "uikit-ins-danger"
    );
    els.resetAll.setAttribute("aria-expanded", "false");

    els.confirm = el("div", "uikit-ins-confirm", wrap);
    els.confirm.hidden = true;
    els.confirm.setAttribute("role", "alert");
    el("p", null, els.confirm).textContent = t(
      "uikit_ins_restore_confirm",
      "Restore the default layout? All saved interface customizations will be cleared."
    );
    const confirmActions = el("div", "uikit-ins-actions", els.confirm);
    els.confirmExport = button(
      confirmActions,
      t("uikit_ins_export_backup", "Export backup")
    );
    els.confirmCancel = button(confirmActions, t("uikit_ins_cancel", "Cancel"));
    els.confirmReset = button(
      confirmActions,
      t("uikit_ins_restore", "Restore"),
      "uikit-ins-danger"
    );

    const io = el("div", "uikit-ins-actions", wrap);
    els.export = button(io, t("uikit_ins_export", "Export"));
    els.import = button(io, t("uikit_ins_import", "Import"));
    els.file = el("input", null, wrap);
    els.file.type = "file";
    els.file.accept = ".json,application/json";
    els.file.hidden = true;
    els.file.setAttribute("aria-label", t("uikit_ins_import", "Import"));
  }

  function buildPresets() {
    els.presets = el("details", "uikit-ins-browser uikit-ins-presets", els.scroll);
    els.presets.open = true;
    el("summary", null, els.presets).textContent = t("uikit_ins_presets", "Presets & saved layouts");
    els.presetsBody = el("div", "uikit-ins-presets-body", els.presets);
    el("p", "uikit-ins-preset-hint", els.presetsBody).textContent = t(
      "uikit_ins_presets_hint", "Presets and saved layouts apply to this screen size. Other screen sizes keep their settings. Undo returns to your previous layout."
    );
    els.scope = el("strong", "uikit-ins-scope", els.presetsBody);
    els.presetGrid = el("div", "uikit-ins-preset-grid", els.presetsBody);
    paintPresetCards();
    el("strong", "uikit-ins-saved-title", els.presetsBody).textContent = t("uikit_ins_saved", "Your saved layouts");
    const saveRow = row(els.presetsBody, t("uikit_ins_layout_name", "Layout name"));
    els.saveName = el("input", "uikit-ins-input", saveRow);
    els.saveName.type = "text";
    els.saveName.maxLength = 60;
    els.saveName.placeholder = t("uikit_ins_layout_placeholder", "e.g. My workspace");
    const saveActions = el("div", "uikit-ins-actions", els.presetsBody);
    els.saveLayout = button(saveActions, t("uikit_ins_save_layout", "Save current layout"));
    els.savedList = el("div", "uikit-ins-saved-list", els.presetsBody);
    els.savedStatus = el("span", "uikit-ins-note", els.presetsBody);
    els.savedStatus.setAttribute("role", "status");
    const save = () => {
      if (!els.saveName.value.trim()) { els.saveName.focus(); return; }
      const ok = uikit.saveNamedLayout(els.saveName.value);
      els.savedStatus.textContent = ok ? t("uikit_ins_layout_saved", "Saved in this browser.")
        : t("uikit_ins_layout_save_failed", "Could not save. Export a backup from Layout & appearance.");
      if (ok) { els.saveName.value = ""; paintSavedLayouts(); }
    };
    els.saveLayout.addEventListener("click", save);
    els.saveName.addEventListener("keydown", (event) => {
      if (event.key === "Enter") { event.preventDefault(); save(); }
    });
    paintSavedLayouts();
  }

  function paintPresetCards() {
    els.presetGrid.replaceChildren();
    els.presetCards = new Map();
    for (const preset of uikit.presets()) {
      const card = button(els.presetGrid, "", "uikit-ins-preset-card");
      card.setAttribute("data-preset", preset.id);
      card.setAttribute("aria-pressed", "false");
      const name = (preset.key && t(preset.key, preset.label)) || preset.label || preset.id;
      card.setAttribute("aria-label", t("uikit_ins_apply", "Apply") + " " + name);
      const preview = el("span", "uikit-ins-preset-preview", card);
      preview.setAttribute("aria-hidden", "true");
      preview.style.setProperty("--preset-accent", preset.preview?.accent || "#4f46e5");
      preview.style.setProperty("--preset-sidebar", preset.preview?.sidebar || "26%");
      for (const part of ["bar", "side", "canvas", "inspector"]) el("span", "uikit-ins-preview-" + part, preview);
      el("strong", null, card).textContent = name;
      el("span", "uikit-ins-preset-description", card).textContent = preset.description || "";
      card.addEventListener("click", () => {
        uikit.applyPreset(preset.id);
        ctx.onChanged();
      });
      els.presetCards.set(preset.id, card);
    }
  }

  function paintSavedLayouts() {
    els.savedList.replaceChildren();
    const layouts = uikit.savedLayouts();
    if (!layouts.length) {
      el("span", "uikit-ins-note", els.savedList).textContent = t("uikit_ins_no_saved", "Save your manual edits here to reuse them later.");
    }
    for (const layout of layouts) {
      const savedRow = el("div", "uikit-ins-saved-row", els.savedList);
      const load = button(savedRow, layout.name, "uikit-ins-saved-layout");
      const remove = button(savedRow, t("uikit_ins_delete_layout", "Delete saved layout"), "uikit-ins-delete-layout");
      remove.title = remove.textContent;
      remove.textContent = "×";
      remove.setAttribute("aria-label", t("uikit_ins_delete_layout", "Delete saved layout") + ": " + layout.name);
      remove.addEventListener("click", () => {
        const ok = uikit.deleteNamedLayout(layout.id);
        els.savedStatus.textContent = ok ? t("uikit_ins_layout_deleted", "Saved layout deleted.") : t("uikit_ins_delete_failed", "Could not delete the saved layout.");
        if (ok) paintSavedLayouts();
      });
      load.title = t("uikit_ins_load_layout", "Load saved layout");
      load.addEventListener("click", () => {
        const ok = uikit.loadNamedLayout(layout.id);
        els.savedStatus.textContent = ok ? t("uikit_ins_layout_loaded", "Layout loaded. You can keep editing or Undo to go back.")
          : t("uikit_ins_layout_missing", "This saved layout is no longer available.");
        ctx.onChanged();
      });
    }
  }

  function buildToken(parent, spec) {
    const label = (ctx.t && spec.key ? ctx.t(spec.key, spec.label) : null) || spec.label || spec.name;
    const wrap = row(parent, label);
    const control = el("span", "uikit-ins-token-control", wrap);
    const input = el("input", "uikit-ins-input", control);
    input.type = spec.type === "color" ? "color" : spec.type === "length" ? "range" : "text";
    if (input.type === "range") {
      input.min = spec.min == null ? 0 : spec.min;
      input.max = spec.max == null ? 32 : spec.max;
      input.step = spec.step == null ? 1 : spec.step;
    }
    input.setAttribute("data-token", spec.name);
    input.setAttribute("aria-label", label);
    const value = el("output", "uikit-ins-token-value", control);
    value.setAttribute("data-token-value", spec.name);
    const reset = button(control, t("uikit_ins_token_reset", "Reset"), "uikit-ins-token-reset");
    reset.setAttribute(
      "aria-label",
      t("uikit_ins_token_reset", "Reset") + " " + label
    );

    input.addEventListener("input", () => {
      const shown = input.type === "range" ? input.value + (spec.unit || "px") : input.value;
      value.textContent = shown;
      let next = ops.setToken(uikit.doc, { id: null, name: spec.name, value: shown, variant: uikit.variant });
      if (spec.name === "--accent") {
        next = ops.setToken(next, {
          id: null,
          name: "--accent-hover", variant: uikit.variant,
          value: darkenHex(shown, 0.86),
        });
      }
      apply("Theme", next, FIELD_TAG + ":tok:" + spec.name);
    });
    reset.addEventListener("click", () => {
      let next = ops.setToken(uikit.doc, { id: null, name: spec.name, value: null, variant: uikit.variant });
      if (spec.name === "--accent") {
        next = ops.setToken(next, { id: null, name: "--accent-hover", value: null, variant: uikit.variant });
      }
      apply("Theme", next);
    });
    els.tokenControls.set(spec.name, { input, value, reset, spec });
  }

  function darkenHex(value, factor) {
    const expanded = String(value || "").replace(/^#([0-9a-f])([0-9a-f])([0-9a-f])$/i, "#$1$1$2$2$3$3");
    const match = expanded.match(/^#([0-9a-f]{6})$/i);
    if (!match) return value;
    const number = Number.parseInt(match[1], 16);
    const part = (shift) => Math.max(
      0,
      Math.min(255, Math.round(((number >> shift) & 255) * factor))
    );
    return "#" + [part(16), part(8), part(0)]
      .map((item) => item.toString(16).padStart(2, "0")).join("");
  }

  function fillIcons() {
    let names = [];
    try { names = icons.list() || []; } catch (_) { names = []; }
    els.iconList.replaceChildren();
    for (const name of names.slice(0, 400)) {
      const option = doc.createElement("option");
      option.value = name;
      els.iconList.appendChild(option);
    }
  }

  function selected() {
    const ids = ctx.selection();
    return ids.length ? ids[ids.length - 1] : null;
  }

  function nodeOf(id) {
    return ctx.nodeFor(id);
  }

  function apply(label, next, tag) {
    if (!next || next === uikit.doc) return false;
    uikit.apply(label, next, tag);
    uikit.refreshNow();
    ctx.onChanged();
    return true;
  }

  function exportLayout() {
    const text = uikit.exportLayout();
    const url = URL.createObjectURL(new Blob([text], { type: "application/json" }));
    const link = doc.createElement("a");
    link.href = url;
    link.download = (ctx.exportName || "layout") + ".uilayout.json";
    doc.body.appendChild(link);
    link.click();
    link.remove();
    setTimeout(() => URL.revokeObjectURL(url), 30000);
  }

  function closeConfirm(focusTrigger) {
    els.confirm.hidden = true;
    els.resetAll.setAttribute("aria-expanded", "false");
    if (focusTrigger) els.resetAll.focus();
  }

  function wire() {
    els.undo.addEventListener("click", () => ctx.command("undo"));
    els.redo.addEventListener("click", () => ctx.command("redo"));
    els.discard.addEventListener("click", () => ctx.command("cancelSession"));
    els.done.addEventListener("click", () => ctx.command("exit"));

    els.label.addEventListener("input", () => {
      const id = selected();
      if (!id) return;
      const value = els.label.value;
      if (els.everywhere.checked) {
        const node = nodeOf(id);
        const key = node && node.entry ? node.entry.textKey || node.entry.id : null;
        if (!key) return;
        // Null explicitly inherits app text, even over a base label in a variant.
        const next = ops.retitle(uikit.doc, { id, label: null, variant: uikit.variant });
        apply("Rename", ops.setText(next, {
          key, lang: ctx.lang(), value,
        }), FIELD_TAG + ":text:" + key);
      } else {
        apply("Rename", ops.retitle(uikit.doc, {
          id, label: value, variant: uikit.variant,
        }), FIELD_TAG + ":label:" + id);
      }
    });
    els.everywhere.addEventListener("change", () => paint());

    els.icon.addEventListener("input", () => {
      const id = selected();
      if (!id) return;
      apply("Icon", ops.reicon(uikit.doc, {
        id, icon: els.icon.value || null, variant: uikit.variant,
      }), FIELD_TAG + ":icon:" + id);
    });

    const sizeChanged = () => {
      const id = selected();
      if (!id) return;
      const node = nodeOf(id);
      const constraints = (node && node.constraints) || {};
      const w = els.w.value === "" ? null : Number(els.w.value);
      const h = els.h.value === "" ? null : Number(els.h.value);
      const size = w == null && h == null ? null : {};
      if (size && w != null) size.w = w;
      if (size && h != null) size.h = h;
      const min = { w: constraints.minW ?? 1, h: constraints.minH ?? 1 };
      const max = { w: constraints.maxW, h: constraints.maxH };
      const next = node?.rect
        ? ops.setRect(uikit.doc, { id, variant: uikit.variant,
          rect: { ...node.rect, ...ops.clampSize(size, min, max) } })
        : ops.resize(uikit.doc, { id, size, variant: uikit.variant, min, max });
      apply("Resize", next, FIELD_TAG + ":size:" + id);
    };
    els.w.addEventListener("input", sizeChanged);
    els.h.addEventListener("input", sizeChanged);

    els.hidden.addEventListener("change", () => {
      if (selected()) {
        ctx.command("hide");
        if (els.hidden.checked && els.palette && typeof els.palette.open === "function") {
          els.palette.open();
        }
      }
    });
    els.group.addEventListener("click", () => ctx.command("group"));
    els.ungroup.addEventListener("click", () => ctx.command("ungroup"));
    els.addItem.addEventListener("click", () => {
      if (els.palette && typeof els.palette.open === "function") els.palette.open();
    });
    els.addDivider.addEventListener("click", () => ctx.command("insertSeparator"));
    els.addMenu.addEventListener("click", () => ctx.command("insertMenu"));
    els.createSubmenu.addEventListener("click", () => ctx.command("createSubmenu"));
    els.reset.addEventListener("click", () => ctx.command("resetNode"));

    els.preset.addEventListener("change", () => {
      const id = els.preset.value;
      if (!id) return;
      uikit.applyPreset(id);
      ctx.onChanged();
    });
    els.resetVariant.addEventListener("click", () => ctx.command("resetVariant"));

    els.export.addEventListener("click", exportLayout);
    els.import.addEventListener("click", () => els.file.click());
    els.file.addEventListener("change", () => {
      const file = els.file.files && els.file.files[0];
      if (!file) return;
      const reader = new FileReader();
      reader.onload = () => {
        const result = uikit.importLayout(String(reader.result || ""));
        note(result.ok
          ? result.problems.length
            ? t("uikit_ins_imported_partly", "Imported, with parts this build could not read.")
            : t("uikit_ins_imported", "Imported.")
          : t("uikit_ins_import_failed", "That file is not a layout."));
        ctx.onChanged();
      };
      reader.onerror = reader.onabort = () => note(t("uikit_ins_read_failed", "Could not read file."));
      try { reader.readAsText(file); } catch (_) { reader.onerror(); }
      els.file.value = "";
    });

    els.resetAll.addEventListener("click", () => {
      els.confirm.hidden = false;
      els.resetAll.setAttribute("aria-expanded", "true");
      els.confirmReset.focus();
    });
    els.confirmCancel.addEventListener("click", () => closeConfirm(true));
    els.confirmExport.addEventListener("click", exportLayout);
    els.confirmReset.addEventListener("click", () => {
      closeConfirm(false);
      ctx.command("reset");
    });

    root.addEventListener("keydown", (event) => event.stopPropagation());
    root.addEventListener("pointerdown", (event) => event.stopPropagation());
    root.addEventListener("click", (event) => event.stopPropagation());
  }

  /* Is this parameter set AT THE LEVEL the reset would clear? In a variant
     that means the patch entry and not the base value underneath it, because
     clearing here uncovers the base rather than erasing it. */
  function isOverridden(id, field) {
    const d = uikit.doc;
    const node = d && d.nodes && d.nodes[id];
    if (!node) return false;
    if (uikit.variant && uikit.variant !== "base") {
      const v = d.variants && d.variants[uikit.variant];
      const patch = v && v.patch && v.patch[id];
      return !!(patch && Object.prototype.hasOwnProperty.call(patch, field));
    }
    return JSON.stringify(node[field]) !== JSON.stringify(uikit.defaults?.nodes?.[id]?.[field]);
  }

  /* Has this item been moved out of the place the shipped layout put it?
     Compared as parent AND index, so a reorder inside one container counts —
     that is a move the user made and can undo here. */
  function isMoved(id) {
    const defaults = uikit.defaults;
    if (!defaults || !defaults.nodes || !uikit.doc || uikit.variant !== "base") return false;
    const placeIn = (source) => {
      for (const key of Object.keys(source.nodes || {})) {
        const kids = source.nodes[key] && source.nodes[key].children;
        if (Array.isArray(kids)) {
          const at = kids.indexOf(id);
          if (at >= 0) return key + ":" + at;
        }
      }
      return null;
    };
    const was = placeIn(defaults);
    return was != null && was !== placeIn(uikit.doc);
  }

  function textOverrideKey(node) {
    return node && node.entry ? node.entry.textKey || node.entry.id : null;
  }

  function hasTextOverride(node) {
    const key = textOverrideKey(node);
    const text = key && uikit.doc.overrides && uikit.doc.overrides.text;
    if (!text) return false;
    const lang = ctx.lang();
    return !!((text[lang] && Object.prototype.hasOwnProperty.call(text[lang], key)) ||
              (text["*"] && Object.prototype.hasOwnProperty.call(text["*"], key)));
  }

  function paint() {
    if (!root) return;
    paintDoc();
    els.undo.disabled = !uikit.history.canUndo();
    els.redo.disabled = !uikit.history.canRedo();

    const id = selected();
    const node = id ? nodeOf(id) : null;
    if (node && id !== current) els.presets.open = false;
    if (id !== current && iconPicker) {
      iconPicker.__cleanup(false);
      iconPicker = null;
    }
    els.node.hidden = !node;
    els.empty.hidden = !!node;
    if (!node) {
      els.selectionTitle.textContent = "";
      els.kind.textContent = "";
      /* The node actions live below this early return, so leaving them alone
         here left whatever the last selection enabled: Group, Ungroup and
         Reset stayed clickable with nothing selected, and did nothing when
         clicked. A control that is offered has to work. */
      els.group.disabled = true;
      els.ungroup.disabled = true;
      els.addItem.disabled = true;
      els.addDivider.disabled = true;
      els.addMenu.disabled = true;
      els.createSubmenu.disabled = true;
      els.reset.disabled = true;
      root.classList.remove("uikit-ins-at-start");
      current = null;
      return;
    }

    const focused = doc.activeElement;
    if (id !== current) els.everywhere.checked = false;
    els.selectionTitle.textContent = (ctx.titleFor ? ctx.titleFor(node) : null) || node.label || node.ref || node.id;
    const entryKind = node.entry && node.entry.kind;
    const kindKey = entryKind === "menu" ? "menu"
      : entryKind === "panel" && node.type === "item" ? "panel"
      : node.type;
    const kindFallback = {
      dock: "Workspace layout",
      bar: "Toolbar",
      stack: "Sidebar column",
      group: "Tool group",
      menu: "Menu",
      panel: "Panel",
      item: "Button",
      separator: "Divider",
    }[kindKey] || node.type;
    const kindLabel = t("uikit_kind_" + kindKey, kindFallback);
    const unavailable = node.type === "item" && node.entry && ctx.hasElement && !ctx.hasElement(id);
    els.kind.textContent = kindLabel
      + (node.tombstone ? " · " + t("uikit_ins_missing", "Missing") : "")
      + (unavailable ? " · " + t("uikit_ins_unavailable", "Unavailable here") : "");

    els.headerIcon.className = "uikit-ins-header-icon";
    els.headerIcon.replaceChildren();
    const headIconInner = doc.createElement("span");
    els.headerIcon.appendChild(headIconInner);
    const headIconName = fallbackIcon(node);
    if (icons && typeof icons.render === "function") {
      icons.render(headIconName, headIconInner);
    } else if (headIconName) {
      headIconInner.setAttribute("data-uikit-icon", headIconName);
    }
    els.headerIcon.style.cursor = "pointer";
    els.headerIcon.title = t("uikit_ins_icon_select", "Change icon");
    els.headerIcon.setAttribute("aria-label", els.headerIcon.title);
    els.headerIcon.setAttribute("aria-haspopup", "dialog");
    els.headerIcon.onclick = () => {
      iconPicker = openIconPicker({
        document: doc,
        anchor: els.headerIcon,
        currentIcon: node.icon || null,
        icons,
        t,
        onSelect: (iconName) => ctx.command("reicon", { id: node.id, icon: iconName }),
        onReset: () => ctx.command("reicon", { id: node.id, icon: null }),
      });
    };

    const treeRoot = ctx.tree ? ctx.tree() : null;
    const chain = findAncestorChain(treeRoot, id) || [node];
    els.breadcrumbs.replaceChildren();
    for (let i = 0; i < chain.length; i++) {
      const item = chain[i];
      const isLast = i === chain.length - 1;
      const crumb = doc.createElement(isLast ? "span" : "button");
      if (!isLast) crumb.type = "button";
      crumb.className = "uikit-ins-crumb";
      if (isLast) crumb.setAttribute("aria-current", "page");

      const crumbIcon = doc.createElement("span");
      crumbIcon.className = "uikit-ins-crumb-icon";
      const iconName = fallbackIcon(item);
      if (icons && typeof icons.render === "function") {
        icons.render(iconName, crumbIcon);
      } else if (iconName) {
        crumbIcon.setAttribute("data-uikit-icon", iconName);
      }
      crumb.appendChild(crumbIcon);

      const crumbText = doc.createElement("span");
      crumbText.textContent = (ctx.titleFor ? ctx.titleFor(item) : null) || item.label || item.id;
      crumb.appendChild(crumbText);

      if (!isLast) {
        crumb.addEventListener("click", () => {
          if (typeof ctx.setFocus === "function") ctx.setFocus(item.id);
          ctx.command("select", { id: item.id });
        });
      }
      els.breadcrumbs.appendChild(crumb);

      if (!isLast) {
        const sep = doc.createElement("span");
        sep.className = "uikit-ins-crumb-sep";
        sep.textContent = "›";
        sep.setAttribute("aria-hidden", "true");
        els.breadcrumbs.appendChild(sep);
      }
    }

    if (els.label !== focused) {
      els.label.value = els.everywhere.checked
        ? resolveText(uikit.doc, textOverrideKey(node), ctx.lang()) ?? node.entry?.title ?? ""
        : node.label == null ? "" : node.label;
      els.label.placeholder = (node.entry && node.entry.title) || node.ref || "";
    }
    els.everywhere.disabled = !(node.entry && (node.entry.textKey || node.entry.id));

    /* One arrow per parameter, and only where there is something to undo. */
    els.labelReset.hidden = !isOverridden(id, "label");
    els.iconReset.hidden = !isOverridden(id, "icon");
    els.sizeReset.hidden = !(isOverridden(id, "size") || isOverridden(id, "rect"));
    els.hiddenReset.hidden = !isOverridden(id, "hidden");
    els.textReset.hidden = !hasTextOverride(node);
    els.posRow.hidden = !isMoved(id);
    els.posReset.hidden = els.posRow.hidden;

    /* "Reset selected" is the wrong words for one thing. The button does the
       same work either way; what changes is whether it is describing an item
       or a selection. */
    const many = ctx.selection().length > 1;
    els.reset.textContent = many
      ? t("uikit_ins_reset_selected", "Reset selected")
      : t("uikit_ins_reset_node", "Reset to default");
    els.reset.title = els.reset.textContent;

    if (els.icon !== focused) {
      els.icon.value = node.icon == null ? "" : node.icon;
      els.icon.placeholder = (node.entry && node.entry.icon) || "";
    }

    const handles = handlesFor(node, ctx.parentFor(id));
    const showW = handles.includes("e") || handles.includes("w");
    const showH = handles.includes("n") || handles.includes("s");
    els.wRow.hidden = !showW;
    els.hRow.hidden = !showH;
    (showW ? els.wRow : els.hRow).appendChild(els.sizeReset);
    const dimensions = node.rect || node.size;
    if (els.w !== focused) els.w.value = dimensions?.w ?? "";
    if (els.h !== focused) els.h.value = dimensions?.h ?? "";

    els.hidden.checked = !!node.hidden;
    els.hidden.disabled = !!(node.constraints && node.constraints.hide === false);
    els.group.disabled = ctx.selection().length < 2;
    els.ungroup.disabled = !!ctx.ungroupProblem(id);
    const parentNode = ctx.parentFor(id);
    const parentIsMenu = !!(parentNode && parentNode.entry && parentNode.entry.kind === "menu");
    const selfIsMenu = !!(node.entry && node.entry.kind === "menu");
    const canPlaceIn = !!(node.children || parentNode);
    els.addItem.disabled = !canPlaceIn;
    els.addDivider.disabled = !(selfIsMenu || parentIsMenu);
    els.addMenu.disabled = !(selfIsMenu || (parentNode && parentNode.children));
    els.createSubmenu.disabled = !(ctx.selection().length >= 2 && parentIsMenu);
    els.reset.disabled = false;
    avoidSelection(id);
    current = id;
  }

  function avoidSelection(id) {
    const view = doc.defaultView;
    if (!view || view.innerWidth <= 600 || !ctx.rectFor) {
      root.classList.remove("uikit-ins-at-start");
      return;
    }
    const selectedRect = ctx.rectFor(id);
    if (!selectedRect || !selectedRect.w || !selectedRect.h) return;
    const inspectorRect = root.getBoundingClientRect();
    const width = inspectorRect.width;
    const height = inspectorRect.height;
    const inset = 16;
    const top = view.innerHeight - inset - height;
    const rtl = view.getComputedStyle(root).direction === "rtl";
    const endLeft = rtl ? inset : view.innerWidth - inset - width;
    const startLeft = rtl ? view.innerWidth - inset - width : inset;
    const overlaps = (left) => selectedRect.x < left + width
      && selectedRect.x + selectedRect.w > left
      && selectedRect.y < top + height
      && selectedRect.y + selectedRect.h > top;
    root.classList.toggle("uikit-ins-at-start", overlaps(endLeft) && !overlaps(startLeft));
  }

  function paintDoc() {
    const focused = doc.activeElement;
    if (presetScope !== uikit.variant) {
      presetScope = uikit.variant;
      paintPresetCards();
      paintSavedLayouts();
      els.savedStatus.textContent = "";
      els.saveName.value = "";
      els.preset.replaceChildren();
      const custom = el("option", null, els.preset);
      custom.value = "";
      custom.textContent = t("uikit_ins_custom", "Custom");
      for (const preset of uikit.presets()) {
        const option = el("option", null, els.preset);
        option.value = preset.id;
        option.textContent = preset.label || preset.id;
      }
    }
    const variantKey = "uikit_ins_variant_" + uikit.variant;
    const variantFallback = uikit.variant === "base" ? "All screens"
      : uikit.variant === "phone" ? "Phone"
      : uikit.variant === "compact" ? "Compact" : uikit.variant;
    els.variant.textContent = t(variantKey, variantFallback);
    els.scope.textContent = els.variant.textContent;
    els.variantHint.textContent = uikit.variant === "base"
      ? "" : t("uikit_ins_this_size", "This size only");
    els.variant.setAttribute("data-base", uikit.variant === "base" ? "1" : "0");

    const variant = uikit.doc.variants && uikit.doc.variants[uikit.variant];
    els.resetVariant.disabled = uikit.variant === "base"
      || !variant || (!Object.keys(variant.patch || {}).length && !variant.tokens);

    const matching = typeof uikit.matchingPreset === "function" ? uikit.matchingPreset() || "" : "";
    if (els.preset !== focused) els.preset.value = matching;
    for (const [id, card] of els.presetCards) card.setAttribute("aria-pressed", String(id === matching));

    const tokens = scopeTokens(uikit.doc, uikit.variant);
    for (const [name, control] of els.tokenControls) {
      if (control.input === focused) continue;
      const shown = tokens[name] == null ? control.spec.fallback : tokens[name];
      if (shown == null) continue;
      control.input.value = control.input.type === "range" ? parseFloat(shown) || 0 : shown;
      control.value.textContent = String(shown);
      control.reset.disabled = tokens[name] == null;
    }
    if (els.treeBrowser) els.treeBrowser.sync(ctx.tree(), ctx.selection());
    if (els.palette) els.palette.sync(ctx.nodes());
  }

  function note(text) {
    if (els.note) els.note.textContent = text || "";
  }

  return {
    mount() {
      if (!root) build();
      root.hidden = false;
      paint();
      return root;
    },
    unmount() {
      if (iconPicker) iconPicker.__cleanup(false);
      iconPicker = null;
      if (els.treeBrowser && typeof els.treeBrowser.destroy === "function") {
        els.treeBrowser.destroy();
      }
      if (root && root.parentNode) root.parentNode.removeChild(root);
      root = null;
      els = {};
      current = null;
    },
    retranslate() {
      if (!root) return;
      const view = els.treeBrowser?.saveView();
      const open = [...root.querySelectorAll("details")].map(el => el.open);
      const focus = doc.activeElement;
      const controls = [...root.querySelectorAll("input, select, button")];
      const focusIndex = controls.indexOf(focus);
      const draft = focus?.tagName === "INPUT" && !["checkbox", "file"].includes(focus.type) ? focus.value : null;
      const caret = focus?.selectionStart;
      const everywhere = els.everywhere.checked;
      const saveName = els.saveName.value;
      const scrollTop = els.scroll.scrollTop;
      const confirm = !els.confirm.hidden;
      if (iconPicker) iconPicker.__cleanup(false);
      iconPicker = null;
      els.treeBrowser?.destroy();
      root.remove(); root = null; els = {}; current = null; presetScope = null;
      build();
      els.everywhere.checked = everywhere;
      els.saveName.value = saveName;
      paint();
      [...root.querySelectorAll("details")].forEach((el, i) => { el.open = !!open[i]; });
      if (view) els.treeBrowser.restoreView(view);
      els.confirm.hidden = !confirm;
      els.resetAll.setAttribute("aria-expanded", String(confirm));
      els.scroll.scrollTop = scrollTop;
      const nextFocus = view?.editingNodeId ? root.querySelector(".uikit-ins-tree-inline-input")
        : [...root.querySelectorAll("input, select, button")][focusIndex];
      if (nextFocus) {
        if (draft != null && nextFocus.tagName === "INPUT") nextFocus.value = draft;
        nextFocus.focus();
        if (caret != null && typeof nextFocus.setSelectionRange === "function" && nextFocus.type === "text") nextFocus.setSelectionRange(caret, caret);
      }
    },
    dismissConfirmation() {
      if (!els.confirm || els.confirm.hidden) return false;
      closeConfirm(true);
      return true;
    },
    sync: paint,
    note,
    openPalette() {
      if (els.palette && typeof els.palette.open === "function") {
        els.palette.open();
      }
    },
    element: () => root,
  };
}
