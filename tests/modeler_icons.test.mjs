import test from "node:test";
import assert from "node:assert/strict";
import { cadIcon, CAD_ICONS, CAD_ICON_KEYS, ICON_ALIASES } from "../js/modeler_icons.js";

test("paper primitives have distinct vector outlines and do not borrow dimension or CAD polygon icons",()=>{
  const keys=['sheetline','sheetpolyline','sheetrect','sheetcircle','sheetarc','sheetellipse'];
  const glyphs=keys.map(key=>cadIcon(key));
  assert.equal(new Set(glyphs).size,keys.length);
  glyphs.forEach(glyph=>assert.ok(glyph.startsWith('<svg')));
  assert.notEqual(cadIcon('sheetline'),cadIcon('dim'));
  assert.notEqual(cadIcon('sheetpolyline'),cadIcon('spoly'));
  assert.notEqual(cadIcon('sheetarc'),cadIcon('sarc'));
});
test("drawing image, format and section actions have distinct semantic vector glyphs",()=>{
  for(const keys of [
    ['insertimage','insertprojectimage','editimage'],
    ['saveformat','applyformat','savetemplate','newtemplate'],
    ['drawingsection','alignedsection','brokenout','breakview']
  ]){
    const glyphs=keys.map(key=>cadIcon(key));
    glyphs.forEach((glyph,index)=>assert.ok(glyph.startsWith('<svg'),keys[index]));
    assert.equal(new Set(glyphs).size,keys.length);
  }
});
test("CAD centerpoint arc marks its center rather than a third rim pick",()=>{
  assert.notEqual(cadIcon('sarc'),cadIcon('arc3point'));
  assert.match(cadIcon('sarc'),/cx="10" cy="15"/);
  assert.match(cadIcon('arc3point'),/cx="10" cy="8"/);
  assert.match(cadIcon('sarc'),/stroke-dasharray/);
});
import { FEATURE_CATALOG } from "../js/core/feature_catalog.js";
import { buildCommandCatalog } from "../js/modeler_commands.js";

test("every CAD icon renders valid SVG with correct attributes", () => {
  CAD_ICON_KEYS.forEach((key) => {
    const html = cadIcon(key);
    assert.ok(html.startsWith("<svg"), `Icon ${key} should start with <svg`);
    assert.ok(html.endsWith("</svg>"), `Icon ${key} should end with </svg>`);
    assert.ok(html.includes('viewBox="0 0 20 20"'), `Icon ${key} should have 20x20 viewBox`);
    assert.ok(html.includes('class="md-cad-icon"'), `Icon ${key} should have md-cad-icon class`);
  });
});

test("cadIcon accepts extra classes and aliases", () => {
  const withClass = cadIcon("extrude", "primary-icon");
  assert.ok(withClass.includes("primary-icon"));

  // Check alias resolution
  const fromPhosphor = cadIcon("ph-cube");
  assert.ok(fromPhosphor.startsWith("<svg"));

  const fromScissor = cadIcon("ph-scissors");
  assert.ok(fromScissor.startsWith("<svg"));
});

test("layer, deposition and component-pattern ribbon actions have distinct genuine SVG glyphs",()=>{
  const keys=['layeranalysis','fffslice','componentpattern','editcomponentpattern','removecomponentpattern'];
  const glyphs=keys.map(key=>{const html=cadIcon(key);assert.ok(html.startsWith('<svg'),key);return html;});
  assert.equal(new Set(glyphs).size,keys.length);
});

test("all features in FEATURE_CATALOG have corresponding CAD icons", () => {
  Object.keys(FEATURE_CATALOG).forEach((type) => {
    const spec = FEATURE_CATALOG[type];
    const iconHtml = cadIcon(spec.icon || type);
    assert.ok(iconHtml.startsWith("<svg"), `Feature ${type} (${spec.icon}) should resolve to CAD SVG`);
  });
});

test("all commands in buildCommandCatalog have corresponding CAD icons", () => {
  const catalog = buildCommandCatalog({
    t: (key) => key,
    editor: { docType: "part", def: { parts: [] }, kernelBusy: false, assembly: null },
    closedSketchProfile: () => null,
    activeParts: () => [],
  });

  catalog.forEach((cmd) => {
    const iconHtml = cadIcon(cmd.id || cmd.icon);
    assert.ok(iconHtml.startsWith("<svg"), `Command ${cmd.id} (${cmd.icon}) should resolve to CAD SVG`);
  });
});

/* cadIcon resolves a ribbon button through `id -> ICON_ALIASES -> CAD_ICONS`, so
   two different commands that land on the same CAD_ICONS key draw the same
   button — which is how "export bundle" and "import bundle" ended up identical. */
test("distinct ribbon commands do not share a drawing", () => {
  const catalog = buildCommandCatalog({
    t: (key) => key,
    editor: { docType: "part", def: { parts: [] }, kernelBusy: false, assembly: null },
    closedSketchProfile: () => null,
    activeParts: () => [],
  });

  // Deliberate: the same concept offered on the Sketch and the Features tab.
  const SHARED_BY_DESIGN = [
    ["mirror", "mirrorfeature"],
    ["pattern", "patternfeature"],
  ].map((pair) => pair.slice().sort().join("|"));

  const resolve = (name) => {
    let key = name;
    if (!CAD_ICONS[key] && ICON_ALIASES[key]) key = ICON_ALIASES[key];
    return CAD_ICONS[key] ? key : null;
  };

  const byIcon = new Map();
  catalog.forEach((cmd) => {
    const key = resolve(cmd.id || cmd.icon);
    assert.ok(key, `Command ${cmd.id} should resolve to a hand-drawn CAD icon`);
    if (!byIcon.has(key)) byIcon.set(key, []);
    byIcon.get(key).push(cmd.id);
  });

  byIcon.forEach((ids, key) => {
    const unique = [...new Set(ids)];
    if (unique.length < 2) return;
    unique.forEach((a, i) => unique.slice(i + 1).forEach((b) => {
      const pair = [a, b].sort().join("|");
      assert.ok(
        SHARED_BY_DESIGN.includes(pair),
        `Commands ${a} and ${b} both draw the "${key}" icon; give one its own drawing or allowlist the pair`,
      );
    }));
  });
});
