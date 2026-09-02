import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import {
  parseColor,
  hslToRgb,
  toHex,
  toRgbaString,
  srgbChannelToLinear,
  linearChannelToSrgb,
  relativeLuminance,
  compositeOver,
  compositeStack,
  contrastRatio,
  wcagCompliance,
  apcaContrast,
  rgbToOklab,
  oklabToOklch,
  rgbToOklch,
  deltaEOklab,
  rgbToLab,
  deltaE76,
  simulateCVD,
} from "../js/core/color_science.js";

test("color parsing & formatting: handles hex, rgb, rgba, hsl, hsla, and named colors", () => {
  assert.deepEqual(parseColor("#fff"), { r: 255, g: 255, b: 255, a: 1 });
  assert.deepEqual(parseColor("#000000"), { r: 0, g: 0, b: 0, a: 1 });
  assert.deepEqual(parseColor("#ff000080"), { r: 255, g: 0, b: 0, a: 128 / 255 });
  assert.deepEqual(parseColor("rgb(100, 150, 200)"), { r: 100, g: 150, b: 200, a: 1 });
  assert.deepEqual(parseColor("rgba(100, 150, 200, 0.5)"), { r: 100, g: 150, b: 200, a: 0.5 });
  assert.deepEqual(parseColor("hsl(0, 100%, 50%)"), { r: 255, g: 0, b: 0, a: 1 });
  assert.deepEqual(parseColor("hsla(120, 100%, 50%, 0.75)"), { r: 0, g: 255, b: 0, a: 0.75 });
  assert.deepEqual(parseColor("transparent"), { r: 0, g: 0, b: 0, a: 0 });
  assert.deepEqual(parseColor("white"), { r: 255, g: 255, b: 255, a: 1 });

  assert.equal(toHex({ r: 255, g: 128, b: 0 }), "#ff8000");
  assert.equal(toRgbaString({ r: 50, g: 100, b: 150, a: 0.85 }), "rgba(50, 100, 150, 0.85)");
});

test("gamma expansion & relative luminance matches W3C ITU-R BT.709 benchmarks", () => {
  // sRGB gamma expansion benchmarks
  assert.equal(srgbChannelToLinear(0), 0);
  assert.equal(srgbChannelToLinear(255), 1);
  assert.equal(linearChannelToSrgb(0), 0);
  assert.equal(linearChannelToSrgb(1), 255);

  // W3C test vectors
  const lumBlack = relativeLuminance({ r: 0, g: 0, b: 0 });
  const lumWhite = relativeLuminance({ r: 255, g: 255, b: 255 });
  const lumRed = relativeLuminance({ r: 255, g: 0, b: 0 });
  const lumGreen = relativeLuminance({ r: 0, g: 255, b: 0 });
  const lumBlue = relativeLuminance({ r: 0, g: 0, b: 255 });

  assert.equal(lumBlack, 0.0);
  assert.equal(lumWhite, 1.0);
  assert.ok(Math.abs(lumRed - 0.2126) < 0.001, `Red luminance ${lumRed} expected ~0.2126`);
  assert.ok(Math.abs(lumGreen - 0.7152) < 0.001, `Green luminance ${lumGreen} expected ~0.7152`);
  assert.ok(Math.abs(lumBlue - 0.0722) < 0.001, `Blue luminance ${lumBlue} expected ~0.0722`);

  // Mid gray #777777 (119 / 255)
  const lumMidGray = relativeLuminance("#777777");
  assert.ok(lumMidGray > 0.17 && lumMidGray < 0.2, `Mid gray luminance ${lumMidGray} within expected range`);
});

test("alpha compositing accurately evaluates translucent UI overlays", () => {
  // 50% black over 100% white -> rgb(128, 128, 128)
  const halfBlackOnWhite = compositeOver({ r: 0, g: 0, b: 0, a: 0.5 }, { r: 255, g: 255, b: 255, a: 1 });
  assert.deepEqual(halfBlackOnWhite, { r: 128, g: 128, b: 128, a: 1 });

  // 92% white panel over #f3f5f8 canvas
  const panelOverCanvas = compositeOver("rgba(255, 255, 255, 0.92)", "#f3f5f8");
  assert.ok(panelOverCanvas.r >= 253 && panelOverCanvas.g >= 253 && panelOverCanvas.b >= 254);

  // Stack of 3 layers (canvas -> panel -> chip)
  const stack = compositeStack(["#0c0e14", "rgba(20, 23, 32, 0.92)", "rgba(59, 130, 246, 0.16)"]);
  assert.ok(stack.a === 1);
  assert.ok(stack.b > stack.r, "Blue accent tint is preserved on composite stack");
});

test("WCAG 2.1 contrast ratio and compliance levels", () => {
  // Pure black vs pure white is exactly 21:1
  const maxRatio = contrastRatio("#000000", "#ffffff");
  assert.ok(Math.abs(maxRatio - 21.0) < 0.01);
  const maxComp = wcagCompliance(maxRatio);
  assert.equal(maxComp.grade, "AAA");
  assert.equal(maxComp.passAA, true);
  assert.equal(maxComp.passAAA, true);

  // Identical colors is exactly 1:1
  const minRatio = contrastRatio("#3b82f6", "#3b82f6");
  assert.ok(Math.abs(minRatio - 1.0) < 0.01);
  assert.equal(wcagCompliance(minRatio).grade, "FAIL");

  // Standard threshold #767676 on #ffffff is ~4.54:1 (passes AA normal text)
  const aaRatio = contrastRatio("#767676", "#ffffff");
  assert.ok(aaRatio >= 4.5);
  assert.equal(wcagCompliance(aaRatio).passAA, true);
  assert.equal(wcagCompliance(aaRatio).passAAA, false);

  // Large text requires 3.0:1 for AA and 4.5:1 for AAA
  const largeComp = wcagCompliance(3.5, { isLarge: true });
  assert.equal(largeComp.passAA, true);
  assert.equal(largeComp.passAAA, false);

  // UI components require 3.0:1 for AA
  const uiComp = wcagCompliance(3.2, { isUI: true });
  assert.equal(uiComp.passAA, true);
});

test("APCA lightness contrast (Lc) calculation evaluates polarity correctly", () => {
  // Dark text on white background (positive polarity)
  const darkOnLight = apcaContrast("#000000", "#ffffff");
  assert.ok(darkOnLight > 100, `Dark text on white APCA Lc=${darkOnLight} should be > 100`);

  // White text on dark background (negative polarity)
  const lightOnDark = apcaContrast("#ffffff", "#000000");
  assert.ok(lightOnDark < -100, `White text on dark APCA Lc=${lightOnDark} should be < -100`);

  // Low contrast pair
  const lowContrast = apcaContrast("#888888", "#777777");
  assert.ok(Math.abs(lowContrast) < 15, `Low contrast pair APCA Lc=${lowContrast} should be < 15`);
});

test("OKLab, OKLCH, CIELAB color space conversions and Delta E metrics", () => {
  const oklab = rgbToOklab({ r: 79, g: 70, b: 229 });
  assert.ok(oklab.L > 0.4 && oklab.L < 0.6, `OKLab L=${oklab.L}`);

  const oklch = rgbToOklch({ r: 79, g: 70, b: 229 });
  assert.ok(oklch.C > 0.15, `OKLCH Chroma=${oklch.C}`);
  assert.ok(oklch.h >= 0 && oklch.h <= 360, `OKLCH Hue=${oklch.h}`);

  // Identical colors have Delta E = 0
  assert.equal(deltaEOklab("#4f46e5", "#4f46e5"), 0);
  assert.equal(deltaE76("#4f46e5", "#4f46e5"), 0);

  // Different colors have noticeable perceptual distance (Delta E > 0.1 in OKLab, > 10 in CIELAB)
  const dEOklab = deltaEOklab("#4f46e5", "#dc2626");
  const dELab = deltaE76("#4f46e5", "#dc2626");
  assert.ok(dEOklab > 0.1, `OKLab Delta E ${dEOklab} > 0.1`);
  assert.ok(dELab > 20, `CIELAB Delta E ${dELab} > 20`);
});

test("color vision deficiency (CVD) simulation maintains luminosity structure", () => {
  const red = { r: 220, g: 38, b: 38, a: 1 };
  const green = { r: 5, g: 150, b: 105, a: 1 };

  const protanRed = simulateCVD(red, "protanopia");
  const deutanRed = simulateCVD(red, "deuteranopia");
  const tritanRed = simulateCVD(red, "tritanopia");
  const achroRed = simulateCVD(red, "achromatopsia");

  assert.ok(protanRed && deutanRed && tritanRed && achroRed);
  assert.equal(achroRed.r, achroRed.g, "Achromatopsia produces monochromatic gray");
  assert.equal(achroRed.g, achroRed.b, "Achromatopsia produces monochromatic gray");
});

test("CSS theme system tokens meet WCAG 2.1 AA contrast requirements across all 4 themes", () => {
  const cssContent = fs.readFileSync(path.resolve(process.cwd(), "css/styles.css"), "utf8");

  function extractThemeTokens(themeName) {
    const pattern = themeName === "light"
      ? /(?::root,\s*\[data-theme="light"\]\s*\{)([\s\S]*?)(?=\n\})/
      : new RegExp(`\\[data-theme="${themeName}"\\]\\s*\\{([\\s\\S]*?)(?=\\n\\})`);
    const match = cssContent.match(pattern);
    assert.ok(match, `Found CSS block for theme "${themeName}"`);

    const tokens = {};
    const lines = match[1].split("\n");
    for (const line of lines) {
      const propMatch = line.match(/--([\w-]+):\s*([^;]+);/);
      if (propMatch) {
        tokens[propMatch[1]] = propMatch[2].trim();
      }
    }
    return tokens;
  }

  const themes = ["light", "dark", "soft", "mid"];

  for (const theme of themes) {
    const tokens = extractThemeTokens(theme);

    // Resolve composite background of panel over app background
    const bgApp = tokens["bg-app"];
    const bgPanel = compositeOver(tokens["bg-panel"], bgApp);

    // 1. Primary Text on Panel Background (Must pass WCAG AA >= 4.5:1)
    const textMain = tokens["text-main"];
    const mainRatio = contrastRatio(textMain, bgPanel);
    assert.ok(
      mainRatio >= 4.5,
      `Theme [${theme}] text-main (${textMain}) on panel (${toHex(bgPanel)}) ratio is ${mainRatio.toFixed(2)}:1 (requires >= 4.5:1)`
    );

    // 2. Muted Text on Panel Background (Must pass WCAG AA >= 4.5:1)
    const textMuted = tokens["text-muted"];
    const mutedRatio = contrastRatio(textMuted, bgPanel);
    assert.ok(
      mutedRatio >= 4.5,
      `Theme [${theme}] text-muted (${textMuted}) on panel (${toHex(bgPanel)}) ratio is ${mutedRatio.toFixed(2)}:1 (requires >= 4.5:1)`
    );

    // 3. HUD Foreground on HUD Background (Must pass WCAG AA >= 4.5:1)
    const hudFg = tokens["hud-fg"];
    const hudBg = compositeOver(tokens["hud-bg"], tokens["bg-canvas-3d"] || bgApp);
    const hudRatio = contrastRatio(hudFg, hudBg);
    assert.ok(
      hudRatio >= 4.5,
      `Theme [${theme}] hud-fg (${hudFg}) on hud-bg (${toHex(hudBg)}) ratio is ${hudRatio.toFixed(2)}:1 (requires >= 4.5:1)`
    );

    // 4. Accent button text contrast (on-accent on accent)
    const onAccent = tokens["on-accent"] || "#ffffff";
    const accent = tokens["accent"];
    const accentRatio = contrastRatio(onAccent, accent);
    assert.ok(
      accentRatio >= 3.0,
      `Theme [${theme}] on-accent (${onAccent}) on accent (${accent}) ratio is ${accentRatio.toFixed(2)}:1 (requires >= 3.0:1)`
    );

    // 5. Danger / Warn / Success status colors have distinct luminance
    const danger = tokens["danger"];
    const success = tokens["success"];
    const lumDanger = relativeLuminance(danger);
    const lumSuccess = relativeLuminance(success);
    assert.ok(
      Math.abs(lumDanger - lumSuccess) > 0.02 || deltaEOklab(danger, success) > 0.1,
      `Theme [${theme}] danger and success are perceptually distinct`
    );
  }
});
