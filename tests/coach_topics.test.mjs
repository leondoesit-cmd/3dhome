// The planner coach's topics (js/coach_topics.js): the context they read, when
// each applies, what the bulb opens, what may open by itself, and the guarded
// persistence that must survive storage that throws.
import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import {
  COACH_STORE_KEY, COACH_TEXT, COACH_TOPICS, autoTopic, bulbTopic, coachContext, coachTopic,
  normalizeCoachPrefs, pendingTopic, readCoachPrefs, topicActions, topicScopeKey, topicSteps, writeCoachPrefs,
} from "../js/coach_topics.js";

const ground = { id: "g", name: "Ground floor", elevation: 0, scene: { spatial: { walls: [{ id: 1 }, { id: 2 }] } } };
const upper = { id: "u", name: "Floor 1", elevation: 300, scene: { walls: [] } };

function state(over = {}) {
  return { workspace: { activeFloor: "u", floors: [ground, upper] }, walls: [], items: [], slabOpenings: [], sel: null, ...over };
}

test("coachContext reads storeys, emptiness, voids and the selection", () => {
  const c = coachContext(state({ slabOpenings: [{ id: 5, stairsId: 9 }] }));
  assert.equal(c.activeId, "u");
  assert.equal(c.floorCount, 2);
  assert.equal(c.below.id, "g");
  assert.equal(c.above, null);
  assert.equal(c.belowWalls, 2);
  assert.equal(c.empty, true);
  assert.equal(c.hasStairVoid, true);
  assert.equal(c.selType, null);
  assert.equal(c.referenceShown, false);

  const g = coachContext(state({ workspace: { activeFloor: "g", floors: [ground, upper], referenceFloor: "u", showReferenceFloor: true },
    walls: [{}], sel: { kind: "item", ref: { id: 3, type: "stairs" } } }));
  assert.equal(g.below, null);
  assert.equal(g.above.id, "u");
  assert.equal(g.empty, false);
  assert.equal(g.selType, "stairs");
  assert.equal(g.referenceShown, true);

  // and survives nothing at all
  const none = coachContext(null);
  assert.equal(none.floorCount, 0);
  assert.equal(none.empty, true);
});

test("each topic applies where it should", () => {
  const upperEmpty = coachTopic("upper_floor_empty"), stairs = coachTopic("stairs_selected"), first = coachTopic("first_plan");
  assert.equal(upperEmpty.when(coachContext(state())), true);
  assert.equal(upperEmpty.when(coachContext(state({ walls: [{}] }))), false, "not once it has walls");
  assert.equal(upperEmpty.when(coachContext(state({ workspace: { activeFloor: "g", floors: [ground, upper] } }))), false, "not on the ground floor");
  const sel = coachContext(state({ walls: [{}], sel: { kind: "item", ref: { type: "stairs" } } }));
  assert.equal(stairs.when(sel), true);
  assert.equal(stairs.when(coachContext(state({ sel: { kind: "item", ref: { type: "sofa" } } }))), false);
  assert.equal(first.when(coachContext({ workspace: { activeFloor: "g", floors: [ground] }, walls: [] })), true);
  assert.equal(first.auto, false, "the first-plan guide is the bulb's fallback, never automatic");

  // the stairwell step only when there is a void; copy only while empty
  const steps = topicSteps(upperEmpty, coachContext(state()));
  assert.ok(!steps.includes("upper3"));
  assert.ok(topicSteps(upperEmpty, coachContext(state({ slabOpenings: [{ stairsId: 1 }] }))).includes("upper3"));
  assert.deepEqual(topicActions(upperEmpty, coachContext(state())).map((a) => a.id), ["copyWalls", "toggleRef", "drawWalls"]);
  assert.ok(!topicActions(upperEmpty, coachContext(state({ walls: [{}] }))).some((a) => a.id === "copyWalls"));
});

test("the bulb opens the best topic, ignoring muting; auto shows respect it", () => {
  const ctx = coachContext(state());
  assert.equal(bulbTopic(ctx).id, "upper_floor_empty");
  assert.equal(bulbTopic(coachContext(state({ walls: [{}] }))).id, "first_plan", "fallback");

  assert.equal(autoTopic(ctx, null).id, "upper_floor_empty");
  assert.equal(autoTopic(ctx, { muted: { upper_floor_empty: true } }), null, "muted");
  assert.equal(autoTopic(ctx, { off: true }), null, "automatic tips off");
  const seen = { seen: { [topicScopeKey(coachTopic("upper_floor_empty"), ctx)]: true } };
  assert.equal(autoTopic(ctx, seen), null, "once per storey");
  const other = coachContext(state({ workspace: { activeFloor: "u2", floors: [ground, upper, { id: "u2", elevation: 600, scene: {} }] } }));
  assert.equal(autoTopic(other, seen).id, "upper_floor_empty", "but again on another empty storey");
  assert.equal(bulbTopic(ctx).id, "upper_floor_empty", "the bulb ignores muting");

  // the dot: something applies that has not been opened here
  const opened = new Set();
  assert.equal(pendingTopic(ctx, opened).id, "upper_floor_empty");
  opened.add(topicScopeKey(coachTopic("upper_floor_empty"), ctx));
  assert.equal(pendingTopic(ctx, opened), null);
});

test("preferences persist under one key and survive storage that throws", () => {
  const mem = new Map();
  const ok = { getItem: (k) => (mem.has(k) ? mem.get(k) : null), setItem: (k, v) => mem.set(k, v) };
  assert.deepEqual(readCoachPrefs(ok), { muted: {}, seen: {}, off: false });
  assert.equal(writeCoachPrefs(ok, { muted: { stairs_selected: true }, seen: { "a:": true }, off: true }), true);
  assert.deepEqual([...mem.keys()], [COACH_STORE_KEY]);
  assert.equal(COACH_STORE_KEY, "planner.coach.v1");
  assert.deepEqual(readCoachPrefs(ok), { muted: { stairs_selected: true }, seen: { "a:": true }, off: true });

  const broken = { getItem() { throw new Error("SecurityError"); }, setItem() { throw new Error("QuotaExceeded"); } };
  assert.deepEqual(readCoachPrefs(broken), { muted: {}, seen: {}, off: false });
  assert.equal(writeCoachPrefs(broken, { off: true }), false);
  assert.deepEqual(readCoachPrefs(null), { muted: {}, seen: {}, off: false });
  assert.equal(writeCoachPrefs(undefined, {}), false);
  mem.set(COACH_STORE_KEY, "{not json");
  assert.deepEqual(readCoachPrefs(ok), { muted: {}, seen: {}, off: false });
  assert.deepEqual(normalizeCoachPrefs({ muted: [1], seen: "x", off: "yes" }), { muted: {}, seen: {}, off: false });
});

test("every topic string exists in both languages", () => {
  const keys = new Set(["bulb", "close", "mute", "autoOff", "autoOn", "autoOffDone", "other"]);
  for (const topic of COACH_TOPICS) {
    assert.ok(topic.id && typeof topic.when === "function" && typeof topic.auto === "boolean" && topic.anim, topic.id);
    keys.add(topic.title);
    topic.steps.forEach((s) => keys.add(typeof s === "string" ? s : s.key));
    topic.actions.forEach((a) => keys.add(a.label));
  }
  for (const key of keys) {
    const pair = COACH_TEXT[key];
    assert.ok(Array.isArray(pair) && pair.length === 2, key);
    assert.ok(pair[0].trim() && pair[1].trim(), key + " has text in both");
    assert.match(pair[1], /[֐-׿]/, key + " Hebrew is Hebrew");
    const vars = (s) => (s.match(/\{\w+\}/g) || []).sort().join();
    assert.equal(vars(pair[0]), vars(pair[1]), key + " uses the same placeholders");
  }
});

test("the coach is wired: action, tool search, bulb, stylesheet", async () => {
  const read = (p) => readFile(new URL("../" + p, import.meta.url), "utf8");
  const [view, search, coach, html, css] = await Promise.all(
    ["js/ui/view_actions.js", "js/tool_search.js", "js/coach.js", "index.html", "css/coach.css"].map(read));
  assert.match(view, /act === "coachTips"\) \(await import\("\.\.\/coach\.js"\)\)\.openCoach\(\)/);
  assert.match(search, /action: "coachTips"/);
  assert.match(coach, /bar\.querySelector\("\.ps-allcmds"\)/);
  assert.match(coach, /addEventListener\("planner-selection", coachEvaluate\)/);
  assert.match(html, /href="css\/coach\.css"/);
  assert.match(css, /@media \(prefers-reduced-motion: no-preference\)/, "motion only when it is welcome");
  assert.doesNotMatch(css.replace(/\/\*[\s\S]*?\*\//g, ""), /transition\s*:/, "no transitions at all");
});
