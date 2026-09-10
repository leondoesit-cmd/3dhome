import test from "node:test";
import assert from "node:assert/strict";
import { openPage, findChrome } from "../tools/browser_harness.mjs";
const opts = await findChrome() ? {} : { skip: "no Chrome found" };

test("guided placement is one undo step; checklist survives JSON and floor changes", opts, async () => {
  const page = await openPage({ width: 1280, height: 900, mobile: false, touch: false });
  try {
    const result = await page.eval(async () => {
      const { S } = await import("/js/state.js");
      const { editPlanningGuide } = await import("/js/ui_planning_guide.js");
      const { updateRoomGhost, commitRoomStamp, armRoomStamp } = await import("/js/interaction.js");
      const { undo, redo } = await import("/js/history.js");
      const { detectRooms } = await import("/js/geometry.js");
      const { sceneObject, applyData } = await import("/js/ui.js");
      const { addFloor, switchFloor } = await import("/js/floors.js");
      const { checklistStatus } = await import("/js/planning_guide.js");
      document.querySelector('[data-start="recreate"]').click();
      const intention = S.workspace.guidance.intention;
      const added = editPlanningGuide({ action: "add", id: "guest", name: "Guest bedroom", type: "bedroom" });
      armRoomStamp("bedroom", { checklistId: "guest" });
      updateRoomGhost(0, 0);
      const committed = commitRoomStamp();
      const placed = checklistStatus(S, detectRooms())[0];
      const walls = S.walls.length;
      undo();
      const undone = { walls: S.walls.length, entry: checklistStatus(S, detectRooms())[0] };
      redo();
      const redone = checklistStatus(S, detectRooms())[0];
      const originalFloor = S.workspace.activeFloor;
      addFloor("Upstairs", 300, false);
      const otherFloor = checklistStatus(S, detectRooms())[0];
      switchFloor(originalFloor);
      const returned = checklistStatus(S, detectRooms())[0];
      const json = JSON.stringify(sceneObject(true));
      await applyData(JSON.parse(json));
      const loaded = checklistStatus(S, detectRooms())[0];
      await applyData({ nodes: [], walls: [], openings: [], items: [], roomMeta: {} });
      const oldFile = S.workspace.guidance;
      return { intention, added: added.ok, committed: committed?.ok, placed, walls, undone, redone, otherFloor, returned, loaded, oldFile };
    });
    assert.equal(result.intention, "recreate");
    assert.equal(result.added, true);
    assert.equal(result.committed, true);
    assert.equal(result.walls, 4);
    assert.equal(result.placed.status, "placed");
    assert.equal(result.undone.walls, 0);
    assert.equal(result.undone.entry.status, "unplaced");
    assert.equal(result.redone.roomHid, result.placed.roomHid);
    assert.equal(result.otherFloor.status, "other_floor");
    assert.equal(result.returned.status, "placed");
    assert.equal(result.loaded.roomHid, result.placed.roomHid);
    assert.equal(result.oldFile.enabled, false);
    assert.equal(result.oldFile.rooms.length, 0);
  } finally { await page.close(); }
});

for (const lang of ["en", "he"]) test("guide controls fit a 390px sheet in " + lang, opts, async () => {
  const page = await openPage({ width: 390, height: 844, mobile: true, touch: true });
  try {
    const result = await page.eval(async (lang) => {
      const { setLang } = await import("/js/i18n.js");
      const { editPlanningGuide, openPlanningGuide, renderPlanningGuide } = await import("/js/ui_planning_guide.js");
      await setLang(lang);
      document.querySelector('[data-start="explore"]').click();
      editPlanningGuide({ action: "add", id: "a", type: "bedroom", name: "A bedroom with a long name" });
      openPlanningGuide(); renderPlanningGuide();
      document.querySelectorAll("#planningGuide details").forEach((node) => { node.open = true; });
      await new Promise(requestAnimationFrame);
      const name = document.querySelector('[data-entry-id="a"] input');
      name.focus(); name.value = "Renamed with keyboard";
      name.dispatchEvent(new Event("change", { bubbles: true }));
      const keptFocus = document.activeElement?.value === "Renamed with keyboard";
      await new Promise(requestAnimationFrame);
      const host = document.getElementById("planningGuide");
      const box = host.getBoundingClientRect();
      const controls = [...host.querySelectorAll("button,input,select")].map((control) => {
        const bounds = control.getBoundingClientRect();
        return { label: control.textContent, x: bounds.x, right: bounds.right, width: bounds.width };
      });
      return { keptFocus, visible: box.width > 0 && box.height > 0, panel: document.getElementById("left-sidebar").dataset.left,
        horizontalOverflow: document.documentElement.scrollWidth > window.innerWidth, controls };
    }, lang);
    assert.equal(result.keptFocus, true);
    assert.equal(result.visible, true);
    assert.equal(result.panel, "project");
    assert.equal(result.horizontalOverflow, false);
    for (const control of result.controls) {
      assert.ok(control.width > 0 && control.x >= -1 && control.right <= 391, JSON.stringify(control));
    }
  } finally { await page.close(); }
});
