import test from "node:test";
import assert from "node:assert/strict";
import {
  isDarkSketchCanvas,
  getDimensionPalette,
  drawSketchDimensions,
  drawConstraintGlyphs,
} from "../js/sketch_dimensions.js";
import { sketchStatusColor } from "../js/modeler_inference.js";
import { contrastRatio, parseColor } from "../js/core/color_science.js";

test("sketch dimension palette provides high contrast across dark and light canvases", () => {
  const darkPalette = getDimensionPalette({ isDark: true });
  const darkCanvasColors = ["#111827", "#17181b", "#0e1219", "#202124", "#1b1f27"];

  for (const bg of darkCanvasColors) {
    const bgRgb = parseColor(bg);

    const drivingContrast = contrastRatio(parseColor(darkPalette.driving), bgRgb);
    assert.ok(
      drivingContrast >= 7.0,
      `Dark canvas driving contrast ${drivingContrast.toFixed(2)}:1 on ${bg} must be >= 7:1 (WCAG AAA)`
    );

    const drivenContrast = contrastRatio(parseColor(darkPalette.driven), bgRgb);
    assert.ok(
      drivenContrast >= 7.0,
      `Dark canvas driven contrast ${drivenContrast.toFixed(2)}:1 on ${bg} must be >= 7:1 (WCAG AAA)`
    );

    const conflictContrast = contrastRatio(parseColor(darkPalette.conflict), bgRgb);
    assert.ok(
      conflictContrast >= 7.0,
      `Dark canvas conflict contrast ${conflictContrast.toFixed(2)}:1 on ${bg} must be >= 7:1 (WCAG AAA)`
    );

    const selectedContrast = contrastRatio(parseColor(darkPalette.selected), bgRgb);
    assert.ok(
      selectedContrast >= 4.5,
      `Dark canvas selected contrast ${selectedContrast.toFixed(2)}:1 on ${bg} must be >= 4.5:1 (WCAG AA)`
    );

    const glyphOkContrast = contrastRatio(parseColor(darkPalette.glyphOk), bgRgb);
    assert.ok(
      glyphOkContrast >= 7.0,
      `Dark canvas glyph contrast ${glyphOkContrast.toFixed(2)}:1 on ${bg} must be >= 7:1 (WCAG AAA)`
    );
  }

  const lightPalette = getDimensionPalette({ isDark: false });
  const lightCanvasColors = ["#ffffff", "#f5f2eb", "#f8fafc"];

  for (const bg of lightCanvasColors) {
    const bgRgb = parseColor(bg);

    const drivingContrast = contrastRatio(parseColor(lightPalette.driving), bgRgb);
    assert.ok(
      drivingContrast >= 4.5,
      `Light canvas driving contrast ${drivingContrast.toFixed(2)}:1 on ${bg} must be >= 4.5:1`
    );

    const drivenContrast = contrastRatio(parseColor(lightPalette.driven), bgRgb);
    assert.ok(
      drivenContrast >= 4.5,
      `Light canvas driven contrast ${drivenContrast.toFixed(2)}:1 on ${bg} must be >= 4.5:1`
    );

    const conflictContrast = contrastRatio(parseColor(lightPalette.conflict), bgRgb);
    assert.ok(
      conflictContrast >= 4.5,
      `Light canvas conflict contrast ${conflictContrast.toFixed(2)}:1 on ${bg} must be >= 4.5:1`
    );

    const selectedContrast = contrastRatio(parseColor(lightPalette.selected), bgRgb);
    assert.ok(
      selectedContrast >= 4.0,
      `Light canvas selected contrast ${selectedContrast.toFixed(2)}:1 on ${bg} must be >= 4.0:1`
    );
  }
});

test("drawSketchDimensions renders labels with backdrop masking and selected border", () => {
  const sketch = {
    points: [
      { id: "p1", x: 0, y: 0 },
      { id: "p2", x: 5, y: 0 },
      { id: "c1", x: 10, y: 10 },
    ],
    entities: [
      { id: "line1", type: "line", a: "p1", b: "p2" },
      { id: "circ1", type: "circle", c: "c1", r: 2 },
    ],
    constraints: [
      { id: "d1", type: "distance", entity: "line1", value: 5 },
      { id: "r1", type: "radius", entity: "circ1", value: 2 },
    ],
  };

  const fillRectCalls = [];
  const fillTextCalls = [];
  const strokeRectCalls = [];

  const ctx = {
    save() {},
    restore() {},
    beginPath() {},
    moveTo() {},
    lineTo() {},
    stroke() {},
    measureText(text) { return { width: text.length * 8 }; },
    fillRect(x, y, w, h) { fillRectCalls.push({ x, y, w, h, fillStyle: this.fillStyle }); },
    strokeRect(x, y, w, h) { strokeRectCalls.push({ x, y, w, h, strokeStyle: this.strokeStyle }); },
    fillText(text, x, y) { fillTextCalls.push({ text, x, y, fillStyle: this.fillStyle }); },
  };

  const toPx = (x, y) => ({ x: x * 10, y: y * 10 });

  // Draw in dark mode with selected dimension d1
  drawSketchDimensions(ctx, sketch, 1, toPx, [], { selectedId: "d1", isDark: true });

  assert.equal(fillTextCalls.length, 2);
  assert.equal(fillTextCalls[0].text, "5 cm");
  assert.equal(fillTextCalls[1].text, "R 2 cm");

  // Both dimensions should receive backdrop masking
  assert.ok(fillRectCalls.length >= 2, "Both dimensions must have backdrop pills");
  assert.equal(fillRectCalls[0].fillStyle, "rgba(15, 23, 42, 0.86)");

  // Selected dimension should have strokeRect border
  assert.ok(strokeRectCalls.length >= 1, "Selected dimension must have a strokeRect border");
  assert.equal(strokeRectCalls[0].strokeStyle, "#fb923c");
});

test("drawConstraintGlyphs renders with high contrast glyphs and subtle mask", () => {
  const sketch = {
    points: [
      { id: "p1", x: 0, y: 0 },
      { id: "p2", x: 5, y: 0 },
    ],
    entities: [
      { id: "line1", type: "line", a: "p1", b: "p2" },
    ],
    constraints: [
      { id: "h1", type: "horizontal", entity: "line1" },
    ],
  };

  const glyphTexts = [];
  const maskBoxes = [];

  const ctx = {
    save() {},
    restore() {},
    fillRect(x, y, w, h) { maskBoxes.push({ x, y, w, h, fillStyle: this.fillStyle }); },
    fillText(text, x, y) { glyphTexts.push({ text, x, y, fillStyle: this.fillStyle }); },
  };

  const toPx = (x, y) => ({ x: x * 10, y: y * 10 });

  drawConstraintGlyphs(ctx, sketch, toPx, [], { isDark: true });

  assert.equal(glyphTexts.length, 1);
  assert.equal(glyphTexts[0].text, "—");
  assert.equal(glyphTexts[0].fillStyle, "#34d399", "Glyph must use high-contrast emerald in dark mode");
  assert.ok(maskBoxes.length >= 1, "Glyph must have subtle backdrop mask");
});

test("sketchStatusColor adapts to isDark mode while preserving light mode defaults", () => {
  // Light / default mode preservation
  assert.equal(sketchStatusColor("fully-defined"), "#1b2733");
  assert.equal(sketchStatusColor("under-defined"), "#2684c7");
  assert.equal(sketchStatusColor("conflicting"), "#d0342c");
  assert.equal(sketchStatusColor("fully-defined", { selected: true }), "#e08030");

  // Dark mode adaptations
  assert.equal(sketchStatusColor("fully-defined", { isDark: true }), "#f1f5f9");
  assert.equal(sketchStatusColor("under-defined", { isDark: true }), "#38bdf8");
  assert.equal(sketchStatusColor("conflicting", { isDark: true }), "#fca5a5");
  assert.equal(sketchStatusColor("fully-defined", { selected: true, isDark: true }), "#fb923c");
  assert.equal(sketchStatusColor("fully-defined", { construction: true, isDark: true }), "#94a3b8");
});
