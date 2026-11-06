/* The CAD editor's small DOM builders (el, btn, tabs, tab strips, command and
   relation buttons) that buildDOM and the panes use, split out of js/modeler.js.
   It shares the editor's state through live imports from ../modeler.js. */
import { KEY_TOOL } from "../modeler_commands.js";
import { cadIcon } from "../modeler_icons.js";
import { t } from "../modeler_strings.js";
import {
  CONSTRAINT_DEFS, pushUndo, root, syncUndoButtons,
} from "../modeler.js";

function el(tag, cls, html) {
  var e = document.createElement(tag);
  if (cls) e.className = cls;
  if (html != null) e.innerHTML = html;
  return e;
}
function btn(label, cb, cls) {
  var b = el("button", cls || "", label);
  if (cls === "md-quick-apply") {
    // Both the form button and the mobile confirmation corner use this
    // handler, even when the duplicate form actions are hidden.
    var pending = false;
    b.modelerApply = async function () {
      if (pending || b.disabled) return;
      pending = true;
      try { return await cb.apply(b, arguments); }
      finally { pending = false; }
    };
    b.addEventListener("click", b.modelerApply);
  } else b.addEventListener("click", cb);
  return b;
}

function bindDocumentTextField(selector, readValue, writeValue, undoLabel, commitOnInput) {
  var input=root.querySelector(selector);
  var gesture=0;
  function commit(){
    var next=input.value.trim();
    if(readValue()===next)return;
    pushUndo(undoLabel,commitOnInput ? selector+":"+gesture : undefined);writeValue(next);syncUndoButtons();
  }
  // Description must survive another Settings control refreshing the header
  // before blur. Consecutive input events still share a single undo step.
  if(commitOnInput)input.addEventListener("input",commit);
  input.addEventListener("change",commit);
  input.addEventListener("blur",function(){commit();gesture++;});
  input.addEventListener("keydown",function(event){
    if(event.key!=="Enter")return;
    event.preventDefault();event.stopPropagation();commit();gesture++;
  });
}
/* The one greyed affordance in the editor: `aria-disabled` plus `.unavailable`,
   never the `disabled` attribute. A disabled button suppresses its own tooltip,
   and the tooltip is the only place the *reason* a command cannot run is
   written — so the button stays enabled and its handler turns the click into
   that same explanation. */
function markUnavailable(button, why, label) {
  if (!button) return button;
  button.classList.toggle("unavailable", !!why);
  button.setAttribute("aria-disabled", why ? "true" : "false");
  button.title = why || label || "";
  return button;
}

function namedButton(button, label) {
  if (!button) return button;
  button.setAttribute("aria-label", label);
  button.title = label;
  return button;
}

// tools carry their key in the caption so the shortcut is learnable in passing
function kt(label, key) { return label + " · " + key; }

/* Panel tabs are named, not guessed at. `ico("tab", …)` produced a 40px square
   whose only clue was a hover caption, so five of them read as five mystery
   buttons; a strip of labelled tabs is both smaller and self-explaining. */
function tab(id, icon, label, title, extra) {
  return '<button type="button" role="tab" aria-selected="false" data-tab="' + id + '" aria-label="' + (title || label) + '" title="' + (title || label) + '">' +
    cadIcon(icon || id) + '<span>' + label + "</span>" + (extra || "") + "</button>";
}
function tabstrip(side, tabs, extra) {
  var label = side === "L" ? "Model browser" : "Selection inspector";
  return '<div class="md-strip" data-strip="' + side + '" role="tablist" aria-label="' + label + '">' + tabs.join("") + (extra || "") + "</div>";
}

/* A labelled CommandManager button — the one place each command lives, so it
   is spelled out rather than left to a glyph.
   `full` is the unabbreviated name for the tooltip and for screen readers. The
   caption itself can be terse because the group heading right underneath
   already supplies the noun: "Rectangle" under "Sketch" says everything
   "Sketch rectangle" did, in half the ribbon.
   There is no icon argument: every command id is itself an icon key in
   modeler_icons.js, so the glyph follows from the command. */
function commandButton(id, label, key, cls, full) {
  var name = full || label;
  return (
    '<button type="button" class="md-command ' + (cls || "") + '" data-command="' + id +
    '" aria-label="' + name + '" title="' + name + (key ? " · " + key : "") + '">' +
    cadIcon(id) + '<span>' + label + "</span>" +
    (key ? '<kbd>' + key + "</kbd>" : "") + "</button>"
  );
}

/* Glyph-only, deliberately. Seven labelled commands are four ribbon columns
   (~440px) and the Sketch pane has ~314px of slack at 1280px, so captions here
   would push the pane into a horizontal scroll. Relations are the one group in
   this editor with conventional glyphs everybody already reads, so the word
   lives in aria-label and the tooltip — and stays in the DOM, because the
   borrowed phone sheet shows it again (see .md-command-glyph in styles.css).
   `data-relation`, not `data-command`: these are not catalog commands, and
   syncCommandManager would keep clearing the greyed state they carry. */
function relationButton(id) {
  var d = CONSTRAINT_DEFS.filter(function (x) { return x.id === id; })[0];
  if (!d) return "";
  var name = t(d.label);
  return (
    '<button type="button" class="md-command md-command-glyph" data-relation="' + id +
    '" aria-label="' + name + '" title="' + name + " — " + d.need + '">' +
    cadIcon(d.icon) + "<span>" + name + "</span></button>"
  );
}

/* Every letter key that picks a tool, straight out of the map the key handler
   reads, so the shortcut sheet cannot claim a binding the editor does not have.
   Each tool id names its own `tool_<id>` string. */
function toolKeyRows() {
  return Object.keys(KEY_TOOL).map(function (key) {
    return [t("tool_" + KEY_TOOL[key]), key.toUpperCase()];
  });
}

/* `rank` is "secondary" for the groups a phone collapses behind their heading.
   It is inert on the desktop ribbon, which lays every group out side by side —
   it only tells the borrowed-into-a-sheet stylesheet which headings are
   drawers, so 23 commands stop arriving as one endless column. */
/* A ribbon group, addressed by its own i18n KEY rather than by the words that
   key happens to produce.
 *
   The key is what is stable: it does not move when the wording is edited, it
   does not differ between English and Hebrew, and it is already unique. That
   makes `data-mdgroup` an identity a saved layout can still resolve after a
   release — which is what uikit needs to let a user rearrange this ribbon, and
   it is why the label is looked up here instead of at each of the fourteen
   call sites. */
function commandGroup(key, commands, rank) {
  return '<div class="md-command-group" data-mdgroup="' + key +
    '" data-cmdgroup="' + (rank || "primary") + '">' +
    '<div class="md-command-items">' + commands.join("") +
    '</div><span class="md-command-group-label">' + t(key) + "</span></div>";
}

export {
  bindDocumentTextField, btn, commandButton, commandGroup, el, kt,
  markUnavailable, namedButton, relationButton, tab, tabstrip, toolKeyRows,
};
