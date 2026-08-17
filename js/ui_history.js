// The history panel — one widget shared by every editor that holds an
// edit_history.js tree (the plan, the CAD modeler and the cabinet designer).
//
// It draws the tree, not a list. Steps run oldest first with a marker on the
// one you are looking at; a step you rolled back past and then edited away
// from leaves its branch standing beside the new one, indented under the fork,
// so both futures stay clickable. Clicking any step rolls the model to it.
//
// The second thing it does is answer "what happened to THIS?". Every step
// knows which objects it touched, so scoping the panel to the selected object
// — a room, a cupboard, a column, a part — keeps only the steps that touched
// it OR anything under it, and folds the rest into a "…" you can open. The
// chips on each row name what it touched; clicking one selects that object in
// the editor, which re-scopes the panel to it.
//
//   var panel = createHistoryPanel(H, {
//     title: "History",
//     scope: function () { return currentSelectionId(); },
//     onPick: function (id) { selectInEditor(id); },
//   });
//   host.appendChild(panel.el);
//   // H's onChange should call panel.refresh()

import { getLang } from "./i18n.js";

var TXT = {
  history: ["היסטוריה", "History"],
  start: ["מצב פתיחה", "Opened"],
  step: ["שלב", "Step"],
  rolled: ["גלגול לאחור", "Rolled back"],
  hereTip: ["חזרה למצב הזה", "Roll the model back to here"],
  empty: ["אין עדיין שינויים", "Nothing yet"],
  all: ["הכל", "All"],
  sel: ["הנבחר", "Selection"],
  scopeTip: ["רק שינויים של האובייקט הנבחר וכל מה שמתחתיו", "Only steps that touched the selected object or anything under it"],
  allTip: ["כל השינויים במסמך", "Every step in the document"],
  noSel: ["בחרו אובייקט כדי לראות את ההיסטוריה שלו", "Select an object to see its own history"],
  noneFor: ["אין שינויים לאובייקט הזה", "Nothing touched this object"],
  more: ["עוד", "more"],
  hidden: ["שלבים אחרים", "other steps"],
  branches: ["ענפים", "branches"],
  branchTip: ["מכאן יוצאות כמה גרסאות — כל אחת עדיין זמינה", "This step forks — every branch below is still reachable"],
  otherBranch: ["ענף נטוש", "Abandoned branch"],
  aheadTip: ["קדימה בהיסטוריה", "Ahead of the marker"],
  chipTip: ["בחירת האובייקט הזה", "Select this object"],
  add: ["נוסף", "added"],
  edit: ["שונה", "changed"],
  del: ["נמחק", "deleted"],
  vAdd: ["הוספה", "Added"],
  vEdit: ["שינוי", "Changed"],
  vDel: ["מחיקה", "Deleted"],
  objects: ["אובייקטים", "objects"],
};
/* Plural nouns for a derived label, per object kind. Every editor's kinds are
   listed together because they never collide and one table beats three. */
var KINDS = {
  wall: ["קירות", "walls"],
  opening: ["פתחים", "openings"],
  item: ["פריטים", "items"],
  room: ["חדרים", "rooms"],
  marker: ["נקודות", "points"],
  mep: ["תשתיות", "services"],
  part: ["חלקים", "parts"],
  sketch: ["סקיצות", "sketches"],
  entity: ["ישויות", "entities"],
  dim: ["מידות", "dimensions"],
  feature: ["פעולות", "features"],
  component: ["רכיבים", "components"],
  mate: ["קשרים", "mates"],
  column: ["עמודות", "columns"],
  section: ["תאים", "compartments"],
  door: ["דלתות", "doors"],
};
function T(k) {
  return TXT[k][getLang() === "en" ? 1 : 0];
}
function kindWord(k) {
  var e = KINDS[k];
  return e ? e[getLang() === "en" ? 1 : 0] : T("objects");
}
var CHANGE_ICON = { add: "+", edit: "~", del: "−" };
var VERB = { add: "vAdd", edit: "vEdit", del: "vDel" };
var MAX_CHIPS = 3;

/* Most edits in this app never named themselves — the plan alone pushes eighty
   unlabelled steps — so a step with no label says what it DID, read off the
   objects it touched. "·" instead of a conjugated verb phrase keeps it correct
   in both languages. */
function derivedLabel(s) {
  var t = s.targets;
  if (!t.length) return s.root ? T("start") : T("step");
  var change = t[0].change,
    kind = t[0].kind,
    same = t.every(function (x) {
      return x.change === change;
    });
  if (!same) return T("vEdit") + " · " + t.length + " " + T("objects");
  if (t.length === 1) return T(VERB[change]) + " · " + t[0].label;
  var oneKind = t.every(function (x) {
    return x.kind === kind;
  });
  return T(VERB[change]) + " · " + t.length + " " + (oneKind ? kindWord(kind) : T("objects"));
}

export function createHistoryPanel(H, opts) {
  opts = opts || {};
  /* "all" shows the document, "scope" follows the editor's selection. The
     choice is sticky, and it opens on "all": a panel that silently hides most
     of the history because something happened to be selected reads as a bug.
     One click on the selection chip turns following on, and from then on every
     pick re-scopes without asking again. */
  var mode = opts.mode === "scope" ? "scope" : "all",
    opened = {}, // which "… n other steps" gaps the user has unfolded
    frame = 0;

  var el = document.createElement("div");
  el.className = "hist-panel";

  var head = document.createElement("div");
  head.className = "hist-head";
  var headName = document.createElement("span");
  headName.textContent = opts.title || T("history");
  var headNote = document.createElement("span");
  headNote.className = "hist-note";
  head.appendChild(headName);
  head.appendChild(headNote);

  // scope switch: the whole document, or the selected object and its children
  var bar = document.createElement("div");
  bar.className = "hist-scope";
  var bAll = document.createElement("button");
  bAll.type = "button";
  bAll.className = "hist-tab";
  var bSel = document.createElement("button");
  bSel.type = "button";
  bSel.className = "hist-tab hist-tab-sel";
  bar.appendChild(bAll);
  bar.appendChild(bSel);
  bAll.addEventListener("click", function () {
    mode = "all";
    refreshNow();
  });
  bSel.addEventListener("click", function () {
    mode = "scope";
    refreshNow();
  });

  var list = document.createElement("div");
  list.className = "hist-list";

  /* A host that already has a heading of its own (the plan's collapsible
     sidebar section) passes head:false — two titles stacked on one panel read
     as two panels. The branch note still has to go somewhere, so it moves in
     with the scope switch. */
  if (opts.head === false) {
    headNote.classList.add("solo");
    bar.appendChild(headNote);
  } else el.appendChild(head);
  el.appendChild(bar);
  el.appendChild(list);

  function scopeId() {
    if (!opts.scope) return null;
    try {
      var v = opts.scope();
      return v == null ? null : String(v);
    } catch (err) {
      return null;
    }
  }
  function scopeName(id) {
    if (opts.scopeLabel) {
      var s = opts.scopeLabel(id);
      if (s) return s;
    }
    return H.labelOf(id) || String(id);
  }

  function chip(t) {
    var c = document.createElement("button");
    c.type = "button";
    c.className = "hist-chip " + t.change;
    c.textContent = t.label;
    c.title = t.label + " · " + T(t.change) + (opts.onPick ? " · " + T("chipTip") : "");
    if (opts.onPick)
      c.addEventListener("click", function (ev) {
        ev.stopPropagation();
        opts.onPick(t.id);
      });
    else c.disabled = true;
    var m = document.createElement("i");
    m.textContent = CHANGE_ICON[t.change] || "";
    c.insertBefore(m, c.firstChild);
    return c;
  }

  function stepRow(s) {
    var row = document.createElement("button");
    row.type = "button";
    row.className =
      "hist-step" +
      (s.current ? " current" : "") +
      (s.rel === "future" ? " ahead" : "") +
      (s.rel === "other" ? " other" : "") +
      (s.branch ? " fork" : "");
    // indentation is the branch depth; deep chains stop widening so a long
    // session cannot push the labels off a narrow panel
    row.style.setProperty("--d", String(Math.min(s.depth, 6)));
    row.title =
      T("hereTip") +
      (s.rel === "other" ? " · " + T("otherBranch") : s.rel === "future" ? " · " + T("aheadTip") : "") +
      (s.time ? " · " + new Date(s.time).toLocaleTimeString() : "");

    var dot = document.createElement("span");
    dot.className = "hist-dot";
    row.appendChild(dot);

    var body = document.createElement("span");
    body.className = "hist-body";
    var name = document.createElement("span");
    name.className = "hist-name";
    name.textContent = s.label || derivedLabel(s);
    body.appendChild(name);

    if (s.targets.length) {
      var chips = document.createElement("span");
      chips.className = "hist-chips";
      s.targets.slice(0, MAX_CHIPS).forEach(function (t) {
        chips.appendChild(chip(t));
      });
      if (s.targets.length > MAX_CHIPS) {
        var rest = document.createElement("span");
        rest.className = "hist-chip more";
        rest.textContent = "+" + (s.targets.length - MAX_CHIPS);
        rest.title = s.targets
          .slice(MAX_CHIPS)
          .map(function (t) {
            return t.label;
          })
          .join(", ");
        chips.appendChild(rest);
      }
      body.appendChild(chips);
    }
    row.appendChild(body);

    if (s.branch) {
      var f = document.createElement("span");
      f.className = "hist-fork";
      f.textContent = "⑂";
      f.title = T("branchTip");
      row.appendChild(f);
    }
    row.addEventListener("click", function () {
      H.jump(s.i);
    });
    return row;
  }

  // a run of steps the scope filter hid, foldable so the tree keeps its shape
  function gapRow(key, n) {
    var g = document.createElement("button");
    g.type = "button";
    g.className = "hist-gap";
    g.textContent = "··· " + n + " " + T("hidden");
    g.addEventListener("click", function () {
      opened[key] = !opened[key];
      refreshNow();
    });
    return g;
  }

  function refreshNow() {
    frame = 0;
    var steps = H.tree(),
      sid = scopeId(),
      scoped = mode === "scope" && sid != null,
      ids = scoped ? H.scope(sid) : null;

    // header: what the tree is holding beyond the branch you are on
    var branches = H.branches();
    headName.textContent = opts.title || T("history");
    headNote.textContent = branches ? "⑂ " + branches : H.canRedo() ? "↷" : "";
    headNote.title = branches ? branches + " " + T("branches") : H.canRedo() ? T("rolled") : "";
    el.classList.toggle("rolled", H.canRedo());

    /* Re-read every label here rather than only at build time: the plan's panel
       is built once and lives through language switches (the overlays rebuild
       their whole chrome instead, but this costs nothing there). */
    bAll.textContent = T("all");
    bAll.title = T("allTip");
    bSel.title = T("scopeTip");
    bSel.textContent = sid != null ? scopeName(sid) : T("sel");
    bSel.disabled = sid == null;
    bAll.classList.toggle("on", !scoped);
    bSel.classList.toggle("on", scoped);

    list.textContent = "";
    if (!steps.length || (steps.length === 1 && !opts.showBaseline)) {
      list.appendChild(note(T("empty")));
      return;
    }

    var shown = 0,
      gap = [],
      cur = null;
    steps.forEach(function (s, i) {
      var keep = !scoped || s.root || H.touches(s.i, ids);
      if (!keep) {
        gap.push(s);
        return;
      }
      flushGap(i);
      var row = stepRow(s);
      if (s.current) cur = row;
      list.appendChild(row);
      shown++;
    });
    flushGap(steps.length);

    if (scoped && shown <= 1) list.appendChild(note(T("noneFor")));
    if (!scoped && sid == null && opts.scope) list.appendChild(note(T("noSel")));
    // keep the marker in view: it is the only row whose position matters
    if (cur && cur.scrollIntoView) cur.scrollIntoView({ block: "nearest" });

    function flushGap(at) {
      if (!gap.length) return;
      var run = gap,
        key = "g" + (at - run.length);
      gap = [];
      function draw(s) {
        var r = stepRow(s);
        r.classList.add("dim");
        if (s.current) cur = r;
        list.appendChild(r);
      }
      if (opened[key]) {
        list.appendChild(gapRow(key, run.length));
        run.forEach(draw);
        return;
      }
      /* A folded run that contains the marker would leave the panel with no
         marker at all, so that step is drawn anyway — and then it is not one
         of the steps the fold is hiding. */
      var hidden = run.filter(function (s) {
        return !s.current;
      });
      if (hidden.length) list.appendChild(gapRow(key, hidden.length));
      run.forEach(function (s) {
        if (s.current) draw(s);
      });
    }
  }
  function note(txt) {
    var e = document.createElement("div");
    e.className = "hist-empty";
    e.textContent = txt;
    return e;
  }

  /* Refreshes are coalesced into the next frame. Callers fire this from the
     history's onChange, which runs BEFORE the edit it announced has actually
     been made — waiting a frame is what lets the top step show what it did
     instead of showing it one edit late. */
  function refresh() {
    if (frame) return;
    frame = requestAnimationFrame(refreshNow);
  }

  refreshNow();
  return {
    el: el,
    refresh: refresh,
    refreshNow: refreshNow,
    setMode: function (m) {
      mode = m === "all" ? "all" : "scope";
      refreshNow();
    },
  };
}
