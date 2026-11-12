import test from "node:test";
import assert from "node:assert/strict";
import { cleanAnswer, nameHint, ITEMS } from "../tools/plan_image_sort.mjs";

test("name hint: CDN hash prefixes and separators are dropped; alt text is quoted", () => {
  const row = { url: "https://cdn.example.com/abc/6a73262ba3e2f8c90be4e6d9_RavShauli_A_Bedroom_01.jpg", label: "חדר שינה" };
  assert.equal(nameHint(row), 'Hints (may be wrong): file name "RavShauli A Bedroom 01", alt text "חדר שינה".');
  assert.equal(nameHint({ url: "not a url" }), "");
});

test("clean answer: interiors keep room, style and known items once; other kinds are reset", () => {
  const room = cleanAnswer({ kind: "interior", room: "kitchen", style: "modern", floor: "tile", items: ["fridge", "fridge", "spaceship", "hob"] });
  assert.deepEqual(room, { kind: "interior", room: "kitchen", style: "modern", floor: "tile", items: ["fridge", "hob"] });
  assert.deepEqual(cleanAnswer({ kind: "exterior", room: "kitchen", style: "modern", floor: "tile", items: ["sofa"] }),
    { kind: "exterior", room: "none", style: "none", floor: "none", items: [] });
  assert.equal(cleanAnswer({ kind: "selfie" }), null);
  assert.ok(ITEMS.includes("sofa") && ITEMS.includes("bathtub"));
});
