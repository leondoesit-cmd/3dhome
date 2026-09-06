/* Adoption, and the promise that it is exactly reversible.
 *
 * This is the phase-2 gate for uikit/. Everything else in the module is a pure
 * function of a JSON document and is tested without a browser; adoption is the
 * one part whose whole contract is about a real DOM — that a host's element can
 * be moved into a layout and put back so precisely that the markup is
 * byte-identical, listeners intact, with no leftover class or attribute.
 *
 * The test compares outerHTML of the host region before and after, which is a
 * blunt instrument on purpose: it catches a stray attribute, a lost whitespace
 * text node and a pair of siblings restored in the wrong order, none of which a
 * targeted assertion would think to look for. Whitespace matters here — the
 * fixture is indented HTML, so every element's recorded nextSibling is a text
 * node, which is exactly the case a naive appendChild restore gets wrong.
 *
 * The fixture is driven synchronously through refreshNow(): a render coalesced
 * into an animation frame is right for the app and useless for an assertion.
 */
import test from "node:test";
import assert from "node:assert/strict";
import { openPage, findChrome } from "../tools/browser_harness.mjs";

const chrome = await findChrome();
const opts = chrome ? {} : { skip: "no Chrome found (set CHROME_PATH)" };

let shared = null;

test.after(async () => {
  if (shared) await shared.close();
});

async function fixture(width = 1200, height = 800, query = "") {
  if (!shared) shared = await openPage({ width, height });
  else await shared.resize(width, height);
  await shared.goto("/uikit/demo/fixture.html" + query, { boot: false });
  await shared.eval(async () => {
    for (let i = 0; i < 200 && !window.__uikitReady; i++) {
      await new Promise((r) => setTimeout(r, 10));
    }
    if (!window.__uikitReady) throw new Error("uikit fixture never booted");
  });
  return shared;
}

test("a hand-written document renders, adopting the host's own elements", opts, async () => {
  const page = await fixture();
  const state = await page.eval(() => {
    const U = window.__uikit;
    U.ui.mount();
    U.render();
    const save = document.getElementById("host-save");
    const notes = document.getElementById("host-notes");
    const top = document.querySelector('[data-uikit-slot="top"]');
    const left = document.querySelector('[data-uikit-slot="left"]');
    return {
      problems: U.ui.problems,
      // the live elements moved, rather than being copied
      saveInLayout: !!(top && top.contains(save)),
      notesInLayout: !!(left && left.contains(notes)),
      saveParent: save.parentElement.getAttribute("data-uikit-id"),
      /* The loan, in full: an adopted element gains uikit's identity and
         nothing else. No class, no wrapper, no inline style — anything more
         and the host's own selectors stop meaning what they meant. */
      saveAttrs: [...save.attributes].map((a) => a.name).sort(),
      saveClass: save.className,
      saveIsBareChild: save.parentElement.classList.contains("uikit-node"),
      // the group is a real container holding both adopted buttons in order
      groupChildren: [...document.querySelector('[data-uikit-id="g:file"]').children]
        .map((el) => el.getAttribute("data-uikit-id")),
      // a placeable with no element of its own is built by uikit
      builtLabel: document.querySelector('[data-uikit-id="act:new"] .uikit-label').textContent,
      // a placeable the host renders itself gets a box and fills it
      customText: document.querySelector('[data-uikit-id="widget:clock"]').textContent,
      sideWidthVar: document.querySelector('[data-uikit-id="n:side"]').style.getPropertyValue("--uikit-w"),
      leftEmptyOfHost: document.getElementById("host-topbar").children.length,
    };
  });

  assert.deepEqual(state.problems, [], "the shipped layout is clean");
  assert.ok(state.saveInLayout, "the Save button is in the layout's top slot");
  assert.ok(state.notesInLayout, "the notes panel is in the left slot");
  assert.equal(state.saveParent, "g:file", "it sits directly in the group, with nothing in between");
  assert.deepEqual(state.saveAttrs, ["data-act", "data-uikit-id", "id"],
    "identity is the whole loan");
  assert.equal(state.saveClass, "", "uikit never puts its class on a borrowed element");
  assert.ok(state.saveIsBareChild, "the group is a real uikit container, not a wrapper per button");
  assert.deepEqual(state.groupChildren, ["act:save", "act:load"]);
  assert.equal(state.builtLabel, "New");
  assert.equal(state.customText, "12:00");
  assert.equal(state.sideWidthVar, "220px", "size is a custom property, not an inline width");
  assert.equal(state.leftEmptyOfHost, 1, "only the element the layout never claimed is left behind");
});

test("unmount gives the host back byte-identical markup", opts, async () => {
  const page = await fixture();
  const result = await page.eval(() => {
    const U = window.__uikit;
    const before = U.hostHTML();
    U.ui.mount();
    U.render();
    const moved = U.hostHTML();
    const problems = U.ui.unmount();
    return {
      before,
      moved,
      after: U.hostHTML(),
      problems,
      mountEmpty: document.getElementById("uikit-mount").innerHTML,
      rootClass: document.getElementById("uikit-mount").className,
      mountAttrs: [...document.getElementById("uikit-mount").attributes].map((a) => a.name).sort(),
    };
  });

  assert.notEqual(result.moved, result.before, "the elements really did leave");
  assert.equal(result.after, result.before, "and came back exactly");
  assert.deepEqual(result.problems, [], "nothing was reported as unrestorable");
  assert.equal(result.mountEmpty, "", "uikit removed every element it created");
  assert.equal(result.rootClass, "", "and the class it added to the mount");
  assert.deepEqual(result.mountAttrs, ["id"],
    "the mount is a bound container too, and is handed back as bare as it was lent");
});

test("adopted siblings are restored in the right order, not merely under the right parent", opts, async () => {
  const page = await fixture();
  const order = await page.eval(() => {
    const U = window.__uikit;
    U.ui.mount();
    U.render();
    U.ui.unmount();
    return [...document.getElementById("host-topbar").children].map((el) => el.id);
  });
  assert.deepEqual(order, ["host-save", "host-load", "host-tail"]);
});

test("a variant moves a panel between slots without re-adopting it", opts, async () => {
  const page = await fixture();
  const result = await page.eval(() => {
    const U = window.__uikit;
    U.ui.mount();
    U.render();
    const notes = document.getElementById("host-notes");
    notes.scrollTop = 0;
    notes.dataset.witness = "same-element"; // survives only if the node is not rebuilt

    const before = document.querySelector('[data-uikit-slot="left"]').contains(notes);
    U.ui.setVariant("phone");
    U.render();
    const after = document.querySelector('[data-uikit-slot="bottom"]').contains(notes);
    const witness = document.getElementById("host-notes").dataset.witness;

    U.ui.setVariant("base");
    U.render();
    const back = document.querySelector('[data-uikit-slot="left"]').contains(notes);
    return { before, after, back, witness, same: document.getElementById("host-notes") === notes };
  });

  assert.ok(result.before, "starts in the left slot");
  assert.ok(result.after, "the phone variant puts it in the bottom slot");
  assert.ok(result.back, "and switching back returns it");
  assert.ok(result.same, "it is the same element throughout");
  assert.equal(result.witness, "same-element", "the element was moved, never re-created");
});

test("teardown after a variant change still restores the original DOM", opts, async () => {
  const page = await fixture();
  const result = await page.eval(() => {
    const U = window.__uikit;
    const before = U.hostHTML();
    U.ui.mount();
    U.render();
    U.ui.setVariant("phone");
    U.render();
    const problems = U.ui.unmount();
    return { before, after: U.hostHTML(), problems };
  });
  assert.equal(result.after, result.before);
  assert.deepEqual(result.problems, []);
});

test("an op patches the layout without rebuilding what did not change", opts, async () => {
  const page = await fixture();
  const result = await page.eval(async () => {
    const U = window.__uikit;
    const { ops } = await import("../index.js");
    U.ui.mount();
    U.render();

    const save = document.getElementById("host-save");
    const clock = document.querySelector('[data-uikit-id="widget:clock"]');
    const before = [...document.querySelector('[data-uikit-id="g:file"]').children]
      .map((el) => el.getAttribute("data-uikit-id"));

    U.ui.apply("Reorder", ops.reorder(U.ui.doc, { id: "act:load", index: 0 }));
    U.render();

    const after = [...document.querySelector('[data-uikit-id="g:file"]').children]
      .map((el) => el.getAttribute("data-uikit-id"));

    // and a rename that touches only the built button
    U.ui.apply("Rename", ops.retitle(U.ui.doc, { id: "act:new", label: "Fresh" }));
    U.render();

    return {
      before,
      after,
      sameSave: document.getElementById("host-save") === save,
      sameClock: document.querySelector('[data-uikit-id="widget:clock"]') === clock,
      label: document.querySelector('[data-uikit-id="act:new"] .uikit-label').textContent,
      canUndo: U.ui.history.canUndo(),
    };
  });

  assert.deepEqual(result.before, ["act:save", "act:load"]);
  assert.deepEqual(result.after, ["act:load", "act:save"], "reordered");
  assert.ok(result.sameSave, "the adopted element was moved, not detached and rebuilt");
  assert.ok(result.sameClock, "the host-rendered widget was left alone entirely");
  assert.equal(result.label, "Fresh");
  assert.ok(result.canUndo);
});

test("undo returns the document, the DOM and the host's elements", opts, async () => {
  const page = await fixture();
  const result = await page.eval(async () => {
    const U = window.__uikit;
    const { ops } = await import("../index.js");
    const before = U.hostHTML();
    U.ui.mount();
    U.render();
    U.ui.apply("Hide", ops.hide(U.ui.doc, { id: "panel:notes", hidden: true }));
    U.render();
    const hidden = document.querySelector('[data-uikit-id="panel:notes"]').hidden;
    U.ui.undo();
    U.render();
    const shown = document.querySelector('[data-uikit-id="panel:notes"]').hidden;
    U.ui.unmount();
    return { hidden, shown, before, after: U.hostHTML() };
  });

  assert.equal(result.hidden, true, "hiding sets the wrapper's hidden, never the host element's style");
  assert.equal(result.shown, false);
  assert.equal(result.after, result.before, "and the host element survived being hidden");
});

/* The integration shape phase 3 actually uses: uikit renders into the host's
   own element rather than one it created. Restoring a BORROWED slot is a
   different path from deleting an owned one — the element stays, and only the
   attribute uikit put on it may go — and it is the path that touches markup
   the application still holds a reference to. */
test("a borrowed host element works as a slot and is handed back untagged", opts, async () => {
  const page = await fixture(1200, 800, "?slots=borrowed");
  const result = await page.eval(() => {
    const U = window.__uikit;
    if (!U.borrowed) throw new Error("fixture did not enter borrowed-slot mode");
    const before = U.hostHTML();
    U.ui.mount();
    U.render();

    const topbar = document.getElementById("host-topbar");
    const save = document.getElementById("host-save");
    const rendered = {
      slotIsHostElement: U.ui.slotFor("top") === topbar,
      tagged: topbar.getAttribute("data-uikit-slot"),
      saveInside: topbar.contains(save),
      // the element uikit never claimed is still there, and still last
      tailSurvived: !!document.getElementById("host-tail"),
    };

    const problems = U.ui.unmount();
    return {
      before,
      after: U.hostHTML(),
      rendered,
      problems,
      stillThere: !!document.getElementById("host-topbar"),
      tagAfter: document.getElementById("host-topbar").getAttribute("data-uikit-slot"),
    };
  });

  assert.ok(result.rendered.slotIsHostElement, "uikit rendered into the host's own topbar");
  assert.equal(result.rendered.tagged, "top");
  assert.ok(result.rendered.saveInside);
  assert.ok(result.rendered.tailSurvived, "a child uikit does not own is never removed");

  assert.ok(result.stillThere, "a borrowed element is never deleted, only released");
  assert.equal(result.tagAfter, null, "and the attribute uikit added is gone");
  assert.deepEqual(result.problems, []);
  assert.equal(result.after, result.before, "byte-identical, through a borrowed slot too");
});

test("syncChildren cleans up un-wanted created elements while preserving host elements", opts, async () => {
  const page = await fixture(1200, 800, "?slots=borrowed");
  const result = await page.eval(async () => {
    const { syncChildren } = await import("/uikit/runtime/render.js");
    const container = document.createElement("div");
    const hostHead = document.createElement("span");
    hostHead.id = "host-head";
    const created1 = document.createElement("button");
    created1.id = "created-btn";
    const wanted1 = document.createElement("div");
    wanted1.id = "wanted-div";
    const created2 = document.createElement("hr");
    created2.id = "created-sep";
    const hostTail = document.createElement("span");
    hostTail.id = "host-tail";

    container.appendChild(hostHead);
    container.appendChild(created1);
    container.appendChild(wanted1);
    container.appendChild(created2);
    container.appendChild(hostTail);

    const created = new Set([created1, created2]);
    syncChildren(container, [wanted1], created);

    return {
      children: [...container.children].map((c) => c.id),
      created1InDom: container.contains(created1),
      created2InDom: container.contains(created2),
      hostHeadInDom: container.contains(hostHead),
      hostTailInDom: container.contains(hostTail),
    };
  });

  assert.deepEqual(result.children, ["host-head", "wanted-div", "host-tail"], "only wanted and host children remain");
  assert.equal(result.created1InDom, false, "leading/mid created orphan was removed");
  assert.equal(result.created2InDom, false, "trailing created orphan was removed");
  assert.equal(result.hostHeadInDom, true, "leading host element untouched");
  assert.equal(result.hostTailInDom, true, "trailing host element untouched");
});
