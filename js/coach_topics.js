/* The planner coach's topics: what each tip says, when it applies and whether
   it may show by itself. Pure data and predicates — no DOM — so Node can test
   every topic against small fake states. The card and the light-bulb live in
   js/coach.js.

   Topic shape: { id, when(ctx) -> bool, auto, title, steps: [key | {key, when}],
   anim, actions: [{ id, label, primary, when? }], scope(ctx) -> string }.
   title / steps / labels are keys into TXT below ([en, he] pairs, kept out of
   the size-frozen js/i18n/*.js). `scope` names the context a tip belongs to:
   an automatic tip shows once per scope (once per empty upper storey, once
   ever for the stairs) until it is muted. */
import { getLang } from "./i18n.js";
import { floorAbove, floorBelow, referenceShown } from "./floors.js";

const TXT = {
  bulb: ["What can I do here?", "מה אפשר לעשות כאן?"],
  close: ["Close", "סגירה"],
  mute: ["Don't show this again", "אל תציג שוב"],
  autoOff: ["Turn off automatic tips", "כבה טיפים אוטומטיים"],
  autoOn: ["Turn automatic tips back on", "הפעל שוב טיפים אוטומטיים"],
  autoOffDone: ["Automatic tips are off. The light bulb still shows them.", "הטיפים האוטומטיים כבויים. הנורה עדיין מציגה אותם."],
  other: ["Other tips", "טיפים נוספים"],

  upperTitle: ["You are on {floor}", "אתם ב{floor}"],
  upperName: ["Starting an upper floor", "מתחילים קומה עליונה"],
  upper1: ["{floor} sits {height} above {below}.", "{floor} נמצאת {height} מעל {below}."],
  upper2: ["The faint dashed outline is {below}, shown underneath so you can line walls up with it.", "הקו המקווקו והחיוור הוא {below}, שמוצגת מתחת כדי שתוכלו ליישר אליה את הקירות."],
  upper3: ["The hatched box is where the stairs from {below} come up. It follows the stairs: to change it, edit the stairs on {below}.", "המלבן המקווקו הוא המקום שבו עולות המדרגות מ{below}. הוא צמוד למדרגות: כדי לשנות אותו, ערכו את המדרגות ב{below}."],
  upper4: ["Start by copying the walls of the floor below, or draw your own.", "התחילו בהעתקת הקירות של הקומה שמתחת, או שרטטו קירות משלכם."],

  stairsTitle: ["Shaping the stairs", "עיצוב המדרגות"],
  stairs1: ["Shape them in the inspector under “Stair design”: straight, L or U, landings or winders, which way they turn, and the width.", "עצבו אותן בחלונית המאפיינים תחת „תכנון מדרגות”: ישרות, L או U, פודסט או מדרגות מסתובבות, כיוון הפנייה והרוחב."],
  stairs2: ["The read-out under it checks them against the building code.", "השורה שמתחת בודקת אותן מול תקנות הבנייה."],
  stairs3: ["Turn them with the round handle on the plan, or press R.", "סובבו אותן בעזרת הידית העגולה בתוכנית, או הקישו R."],
  stairs4: ["The opening in the floor above follows them.", "הפתח ברצפת הקומה שמעל עוקב אחריהן."],

  firstTitle: ["Your first plan", "התוכנית הראשונה שלכם"],
  first1: ["Draw a room: pick the Wall tool and click its corners on the plan; click the first corner again to close it.", "שרטטו חדר: בחרו בכלי הקיר ולחצו על הפינות בתוכנית; לחיצה חוזרת על הפינה הראשונה סוגרת אותו."],
  first2: ["Add a door: pick Door and click on a wall.", "הוסיפו דלת: בחרו בכלי הדלת ולחצו על קיר."],
  first3: ["Open 3D to see what you drew.", "פתחו את תצוגת התלת־ממד כדי לראות את מה ששרטטתם."],

  aCopy: ["Copy walls from the floor below", "העתק קירות מהקומה שמתחת"],
  aToggle: ["Show / hide the floor below", "הצג / הסתר את הקומה שמתחת"],
  aDraw: ["Draw walls", "שרטט קירות"],
  aRotate: ["Rotate 90°", "סובב 90°"],
  aMore: ["More guides", "מדריכים נוספים"],
};

export function coachText(key, vars) {
  const pair = TXT[key];
  let text = pair ? (getLang() === "he" ? pair[1] : pair[0]) : key;
  if (vars) text = text.replace(/\{(\w+)\}/g, (m, k) => (vars[k] != null ? vars[k] : m));
  return text;
}

export const COACH_TEXT = TXT;

function list(v) { return Array.isArray(v) ? v : []; }
function wallList(scene) {
  if (!scene || typeof scene !== "object") return [];
  if (Array.isArray(scene.walls)) return scene.walls;
  return scene.spatial && Array.isArray(scene.spatial.walls) ? scene.spatial.walls : [];
}
function floorInfo(f) {
  return f ? { id: f.id, name: String(f.name || ""), elevation: Number(f.elevation) || 0 } : null;
}

/* Everything a topic may ask about, from an S-like state. Pure. */
export function coachContext(state) {
  const st = state && typeof state === "object" ? state : {};
  const ws = st.workspace && typeof st.workspace === "object" ? st.workspace : {};
  const floors = list(ws.floors);
  const active = floors.find((f) => f && f.id === ws.activeFloor) || null;
  const below = active ? floorBelow(ws) : null;
  const above = active ? floorAbove(ws) : null;
  const sel = st.sel && typeof st.sel === "object" ? st.sel : null;
  const selType = sel && sel.kind === "item" && sel.ref ? (sel.ref.type || null) : null;
  return {
    activeId: active ? active.id : "",
    floorCount: floors.length,
    floor: floorInfo(active),
    below: floorInfo(below),
    above: floorInfo(above),
    belowWalls: below ? wallList(below.scene).length : 0,
    wallCount: list(st.walls).length,
    itemCount: list(st.items).length,
    empty: list(st.walls).length === 0,
    hasStairVoid: list(st.slabOpenings).some((o) => o && o.stairsId != null),
    selKind: sel ? sel.kind || null : null,
    selType,
    selId: sel && sel.ref && sel.ref.id != null ? sel.ref.id : null,
    referenceShown: referenceShown(ws),
  };
}

export const COACH_TOPICS = [
  {
    id: "upper_floor_empty",
    name: "upperName",
    auto: true,
    when: (c) => !!c.below && c.empty,
    scope: (c) => c.activeId,
    title: "upperTitle",
    steps: ["upper1", "upper2", { key: "upper3", when: (c) => c.hasStairVoid }, "upper4"],
    anim: "upper",
    actions: [
      { id: "copyWalls", label: "aCopy", primary: true, when: (c) => c.empty && c.belowWalls > 0 },
      { id: "toggleRef", label: "aToggle", when: (c) => c.floorCount > 1 },
      { id: "drawWalls", label: "aDraw" },
    ],
  },
  {
    id: "stairs_selected",
    general: true,
    auto: true,
    when: (c) => c.selType === "stairs",
    scope: () => "",
    title: "stairsTitle",
    steps: ["stairs1", "stairs2", "stairs3", "stairs4"],
    anim: "stairs",
    actions: [{ id: "rotate90", label: "aRotate", primary: true, when: (c) => c.selType === "stairs" }],
  },
  {
    id: "first_plan",
    general: true,
    auto: false,
    when: (c) => c.empty && !c.below,
    scope: (c) => c.activeId,
    title: "firstTitle",
    steps: ["first1", "first2", "first3"],
    anim: "first",
    actions: [
      { id: "drawWalls", label: "aDraw", primary: true },
      { id: "moreGuides", label: "aMore" },
    ],
  },
];

export function coachTopic(id) {
  return COACH_TOPICS.find((topic) => topic.id === id) || null;
}

export function topicSteps(topic, ctx) {
  return list(topic && topic.steps).filter((s) => typeof s === "string" || !s.when || s.when(ctx))
    .map((s) => (typeof s === "string" ? s : s.key));
}

export function topicActions(topic, ctx) {
  return list(topic && topic.actions).filter((a) => !a.when || a.when(ctx));
}

export function topicScopeKey(topic, ctx) {
  return topic.id + ":" + (typeof topic.scope === "function" ? topic.scope(ctx) : "");
}

/* What the light-bulb opens: the first topic that applies, else the first-plan
   guide. Muting does not apply here — the bulb always answers. */
export function bulbTopic(ctx) {
  return COACH_TOPICS.find((topic) => topic.when(ctx)) || coachTopic("first_plan");
}

/* The topic that may open by itself now, or null. */
export function autoTopic(ctx, prefs) {
  const p = normalizeCoachPrefs(prefs);
  if (p.off) return null;
  return COACH_TOPICS.find((topic) => topic.auto && !p.muted[topic.id] && topic.when(ctx) && !p.seen[topicScopeKey(topic, ctx)]) || null;
}

/* A topic that applies here and has not been opened in this context: the
   bulb's dot. `opened` is a Set of topicScopeKey values. */
export function pendingTopic(ctx, opened) {
  return COACH_TOPICS.find((topic) => topic.when(ctx) && !(opened && opened.has(topicScopeKey(topic, ctx)))) || null;
}

/* ---- persistence: one localStorage key, every access guarded ---- */
export const COACH_STORE_KEY = "planner.coach.v1";
const SEEN_CAP = 60;

export function normalizeCoachPrefs(raw) {
  const r = raw && typeof raw === "object" ? raw : {};
  const obj = (v) => (v && typeof v === "object" && !Array.isArray(v) ? v : {});
  const muted = {}, seen = {};
  Object.keys(obj(r.muted)).forEach((k) => { if (r.muted[k]) muted[k] = true; });
  Object.keys(obj(r.seen)).slice(-SEEN_CAP).forEach((k) => { if (r.seen[k]) seen[k] = true; });
  return { muted, seen, off: r.off === true };
}

export function readCoachPrefs(storage) {
  try {
    const raw = storage && typeof storage.getItem === "function" ? storage.getItem(COACH_STORE_KEY) : null;
    return normalizeCoachPrefs(raw ? JSON.parse(raw) : null);
  } catch (_) {
    return normalizeCoachPrefs(null);
  }
}

export function writeCoachPrefs(storage, prefs) {
  try {
    if (!storage || typeof storage.setItem !== "function") return false;
    storage.setItem(COACH_STORE_KEY, JSON.stringify(normalizeCoachPrefs(prefs)));
    return true;
  } catch (_) {
    return false;
  }
}
