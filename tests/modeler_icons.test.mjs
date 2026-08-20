import test from "node:test";
import assert from "node:assert/strict";
import { cadIcon, CAD_ICONS, CAD_ICON_KEYS, ICON_ALIASES } from "../js/modeler_icons.js";
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
