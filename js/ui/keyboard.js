/* The planner's keyboard shortcuts: the global keydown handler, constraint
   verbs and the shortcuts sheet, lifted out of initUI, split out of
   js/ui/init_ui.js. It shares the editor's state through live imports from
   ./init_ui.js. */
import { pushHistory } from "../history.js";
import { t } from "../i18n.js";
import { applyNodePairRelation, togglePinSelected } from "../interaction.js";
import { render2D } from "../plan2d.js";
import { activeEditor } from "../pro_shell.js";
import { S } from "../state.js";
import { fillProps } from "../ui_props.js";
import { refreshTree } from "../ui_tree.js";
import { renderWarnPanel } from "../ui_warn.js";
import { flash, lavaModule, openModal } from "../ui.js";
import { isWalk } from "../view3d.js";
import { addWallRelation, solveWallCons } from "../wall_constraints.js";
import { runAction } from "./run_action.js";
import { uiLocals } from "./ui_locals.js";

// lifted out of initUI()
function showShortcuts() {
  if (uiLocals.shortcutsModal) {
    uiLocals.shortcutsModal.close();
    uiLocals.shortcutsModal = null;
    return;
  }
  var SECTIONS = [
    ["keys_sec_general", [
      ["Ctrl+S", "k_save"],
      ["Ctrl+O", "k_import"],
      ["Ctrl+E", "k_export"],
      ["?", "k_help"],
    ]],
    ["keys_sec_edit", [
      ["Ctrl+Z", "k_undo"],
      ["Ctrl+Y", "k_redo"],
      ["Ctrl+D", "k_dup"],
      ["Ctrl+A", "k_selall"],
      ["Ctrl+G", "k_group"],
      ["Ctrl+Shift+G", "k_ungroup"],
      ["Del", "k_del"],
      ["R", "k_rot"],
      ["← ↑ → ↓", "k_nudge"],
      ["Esc", "k_esc"],
    ]],
    ["keys_sec_tools", [["1 2 3 4 5", "k_tools"]]],
    ["keys_sec_draft", [
      ["0…9", "k_typedim"],
      ["Tab", "k_typetab"],
      ["Enter", "k_typeok"],
      ["F3", "k_osnap"],
      ["F8", "k_ortho"],
      ["F9", "k_gridsnap"],
    ]],
    ["keys_sec_view", [
      ["F", "k_frame"],
      ["W", "k_walk"],
      ["P", "k_photo"],
      ["C", "k_rc"],
    ]],
    ["keys_sec_nav3d", [
      ["Drag", "k_orbit"],
      ["Shift+Drag / MMB / RMB", "k_pan"],
      ["← ↑ → ↓ / WASD", "k_navmove"],
      ["Q E", "k_navheight"],
      ["+ −", "k_navzoom"],
      ["Wheel", "k_navwheel"],
      ["Double-click", "k_navfocus"],
    ]],
    ["keys_sec_con", [
      ["Ctrl+Shift+P", "k_conParallel"],
      ["Ctrl+Shift+O", "k_conPerp"],
      ["Ctrl+Shift+C", "k_conCollinear"],
      ["Ctrl+Shift+E", "k_conEqual"],
      ["Ctrl+Shift+F", "k_conPin"],
      ["Ctrl+Shift+J", "k_conJoin"],
      ["Ctrl+Shift+M", "k_conSym"],
      ["Alt+drag", "k_conOverride"],
      ["Tab", "k_snapCycle"],
      ["Shift+E/M/I/R/F", "k_snapOnly"],
    ]],
    ["keys_sec_walk", [
      ["WASD", "k_move"],
      ["V", "k_walkview"],
      ["G", "k_hit"],
    ]],
    ["keys_sec_uikit", [
      ["Ctrl+Alt+E", "k_uikit_toggle"],
      ["Ctrl+Alt+U", "k_uikit_reset"],
      ["Tab", "k_uikit_select"],
      ["← ↑ → ↓", "k_uikit_move"],
      ["Alt+Arrow", "k_uikit_moveout"],
      ["Ctrl+G", "k_uikit_group"],
      ["Ctrl+Shift+G", "k_uikit_ungroup"],
      ["Del", "k_uikit_hide"],
      ["Esc", "k_uikit_exit"],
    ]],
  ];
  var m = openModal(t("keys_title"));
  uiLocals.shortcutsModal = m;
  m.onClose(function () {
    uiLocals.shortcutsModal = null;
  });
  var wrap = document.createElement("div");
  wrap.className = "keys-grid";
  SECTIONS.forEach(function (sec) {
    var h = document.createElement("div");
    h.className = "keys-sec";
    h.textContent = t(sec[0]);
    wrap.appendChild(h);
    sec[1].forEach(function (row) {
      var r = document.createElement("div");
      r.className = "keys-row";
      var k = document.createElement("span");
      k.className = "keys-combo";
      // split on spaces so each key gets its own <kbd> cap
      row[0].split(" ").forEach(function (part) {
        var kb = document.createElement("kbd");
        kb.textContent = uiLocals.macCap(part);
        k.appendChild(kb);
      });
      var d = document.createElement("span");
      d.className = "keys-desc";
      d.textContent = t(row[1]);
      r.appendChild(k);
      r.appendChild(d);
      wrap.appendChild(r);
    });
  });
  m.body.appendChild(wrap);
  var hint = document.createElement("div");
  hint.className = "t keys-hint";
  hint.textContent = t("keys_hint");
  m.body.appendChild(hint);
  var closeBtn = document.createElement("button");
  closeBtn.className = "btn-accent";
  closeBtn.textContent = t("keys_close");
  closeBtn.addEventListener("click", function () {
    m.close();
    uiLocals.shortcutsModal = null;
  });
  m.actions.appendChild(closeBtn);
  m.overlay.addEventListener("click", function (e) {
    if (e.target === m.overlay) uiLocals.shortcutsModal = null;
  });
  closeBtn.focus();
}

// lifted out of initUI()
function wireKeyboardShortcuts() {
  // ---- global keyboard shortcuts ----
  // Editor-wide accelerators. Canvas/selection keys (tools, nudge, rotate) stay
  // in interaction.js; these are the app-level ones that mirror menu items.
  document.addEventListener("keydown", function (e) {
    var ae = document.activeElement;
    if (ae && /INPUT|SELECT|TEXTAREA/.test(ae.tagName)) return;
    if (isWalk()) return; // walk/drive modes own the keyboard
    if (lavaModule && lavaModule.lavaActive()) return;
    var mod = e.ctrlKey || e.metaKey;
    /* The cabinet designer covers the plan and has its own keys (arrows,
       Delete, Ctrl+C/V, V/H/X, "?" for its own sheet). The plan's accelerators
       must not act on the hidden plan behind it — W walked off into the plan,
       F reframed it, Ctrl+D/A/G duplicated, selected and grouped plan items,
       and "?" opened the planner's sheet over the designer's. Saving, opening
       and exporting the project still go through. */
    if (activeEditor() === "cab" && !(mod && !e.altKey && !e.shiftKey && /^[soe]$/i.test(e.key))) return;
    /* Constraint verbs: Ctrl/Cmd+Shift+letter, acting on whatever is selected.
       Authoring a relation used to mean selecting, then finding the right
       button in the inspector, then clicking the target — fine once, tiring
       for the twentieth. Behind a modifier rather than on bare letters
       because the bare ones are already spoken for (F frames, W walks,
       P photographs) and a drafting verb that fires while you meant to frame
       the view is worse than no shortcut. Checked BEFORE the plain Ctrl block,
       which does not test shiftKey and would otherwise export the project on
       Ctrl+Shift+E. */
    if (mod && e.shiftKey && !e.altKey) {
      var ck = e.key.toLowerCase(), verb = CON_KEYS[ck];
      if (verb) { e.preventDefault(); runConVerb(verb); return; }
    }
    /* Ctrl/Cmd+Alt+E opens the interface customizer. It has to be tested here,
       before the two blocks below that bail out on Alt entirely.
       e.code, NOT e.key: on macOS Option+E is a dead key for the acute accent,
       so the event arrives with key "´" and a shortcut written against the
       letter silently never fires on a Mac. The physical key is the only
       reliable identity for an Alt combination. Routed through runAction so
       the menu item and the shortcut cannot drift apart. */
    if (mod && e.altKey && !e.shiftKey && e.code === "KeyE") {
      e.preventDefault();
      runAction("uikitCustomize");
      return;
    }
    if (mod && !e.altKey) {
      var k = e.key.toLowerCase();
      if (k === "s") { e.preventDefault(); runAction("save"); }
      else if (k === "o") { e.preventDefault(); runAction("importjson"); }
      else if (k === "e") { e.preventDefault(); runAction("exportjson"); }
      else if (k === "d") { e.preventDefault(); runAction("dupSel"); }
      else if (k === "g") {
        e.preventDefault();
        runAction(e.shiftKey ? "ungroupItems" : "groupItems");
      } else if (k === "a") { e.preventDefault(); uiLocals.selectAllItems(); }
      return;
    }
    if (e.altKey) return;
    if (e.key === "F1") {
      e.preventDefault();
      runAction("plannerTutorial");
    } else if (e.key === "?" || (e.key === "/" && e.shiftKey)) {
      e.preventDefault();
      uiLocals.showShortcuts();
    } else if (e.key === "f" || e.key === "F") {
      e.preventDefault();
      runAction("frame");
    } else if (e.key === "w" || e.key === "W") {
      e.preventDefault();
      runAction("walk");
    } else if (e.key === "p" || e.key === "P") {
      e.preventDefault();
      runAction("photo");
    } else if (e.key === "c" || e.key === "C") {
      // C for "car" — the RC race was menu-only, which made the whole mode
      // easy to never find. RC's own keymap runs capture-first and stops
      // propagation, so inside the mode C still cycles the camera.
      e.preventDefault();
      runAction("rc");
    }
  });

  /* One letter per relation, chosen for the word rather than the internal
     type name: F for fix, J for join, M for mirror, C for collinear. */
  var CON_KEYS = {
    p: "parallel",
    o: "perpendicular",
    c: "collinear",
    e: "equal",
    f: "pin",
    j: "coincident",
    m: "symmetric",
  };

  /* Apply a relation to the current selection, working out from what IS
     selected what the verb should mean: "equal" is equal length between two
     walls and equal angles between two corners, because that is the same
     intent expressed about different geometry. */
  function runConVerb(verb) {
    var sel = S.sel;
    if (!sel) return flash(t("wc_needSel"), "error");

    if (verb === "pin") {
      if (sel.kind === "node" || sel.kind === "nodes") return void togglePinSelected();
      return flash(t("wc_needCorner"), "error");
    }
    if (sel.kind === "nodes" && sel.refs.length === 2) {
      if (verb === "coincident") return void applyNodePairRelation("coincident");
      if (verb === "symmetric") return void applyNodePairRelation("symmetric");
      if (verb === "equal") return void applyNodePairRelation("equalAngle");
      return flash(t("wc_needWalls"), "error");
    }
    if (sel.kind === "walls" && sel.refs.length === 2) {
      var type = verb === "equal" ? "equalLength" : verb;
      if (["parallel", "perpendicular", "collinear", "equalLength"].indexOf(type) === -1)
        return flash(t("wc_needCorner"), "error");
      pushHistory();
      // the palette's convention: first selected is driven, second is the held
      // reference — the keyboard must not quietly reverse it
      var made = addWallRelation(type, sel.refs[0].id, sel.refs[1].id);
      if (!made) return flash(t("wc_failed"), "error");
      solveWallCons();
      S.dirty3D = true;
      fillProps(); render2D(); refreshTree(); renderWarnPanel(true);
      return void flash(t("wc_added", { v: t("wc_add" + type.charAt(0).toUpperCase() + type.slice(1)) }));
    }
    flash(t("wc_needTwo"), "error");
  }
}

export { showShortcuts, wireKeyboardShortcuts };
