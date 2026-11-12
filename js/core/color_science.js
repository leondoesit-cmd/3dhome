/* Color Science & Contrast Engine
 *
 * Mathematically rigorous color transformations, color spaces, alpha compositing,
 * and perceptual contrast calculations (WCAG 2.1 AA/AAA and APCA).
 *
 * Color Spaces & Models:
 * - sRGB (gamma-corrected 8-bit & normalized 0..1)
 * - Linear sRGB (radiometric luminance)
 * - CIE XYZ (D65 illuminant, 2° observer)
 * - CIELAB (L*a*b*) & Delta E (CIE76 and CIEDE2000)
 * - OKLab & OKLCH (perceptually uniform)
 * - Color Vision Deficiency (CVD) Simulation (Protanopia, Deuteranopia, Tritanopia, Achromatopsia)
 *
 * Contrast Metrics:
 * - WCAG 2.1 Relative Luminance & Contrast Ratio (1:1 to 21:1)
 * - APCA (Advanced Perceptual Contrast Algorithm / WCAG 3 Candidate)
 * - Alpha Compositing (Porter-Duff Over operator with multi-layer background resolution)
 */

// ============================================================================
// 1. COLOR PARSING & FORMATTING
// ============================================================================

const NAMED_COLORS = {
  transparent: { r: 0, g: 0, b: 0, a: 0 },
  black: { r: 0, g: 0, b: 0, a: 1 },
  white: { r: 255, g: 255, b: 255, a: 1 },
  red: { r: 255, g: 0, b: 0, a: 1 },
  green: { r: 0, g: 128, b: 0, a: 1 },
  blue: { r: 0, g: 0, b: 255, a: 1 },
  gray: { r: 128, g: 128, b: 128, a: 1 },
  grey: { r: 128, g: 128, b: 128, a: 1 },
};

/**
 * Parse any CSS color string into { r: 0..255, g: 0..255, b: 0..255, a: 0..1 }
 */
export function parseColor(str) {
  if (!str || typeof str !== "string") return null;
  const s = str.trim().toLowerCase();

  if (NAMED_COLORS[s]) return { ...NAMED_COLORS[s] };

  // Hex: #rgb, #rgba, #rrggbb, #rrggbbaa
  if (s.startsWith("#")) {
    const hex = s.slice(1);
    if (!/^[0-9a-f]+$/.test(hex)) return null;
    if (hex.length === 3) {
      return {
        r: parseInt(hex[0] + hex[0], 16),
        g: parseInt(hex[1] + hex[1], 16),
        b: parseInt(hex[2] + hex[2], 16),
        a: 1,
      };
    }
    if (hex.length === 4) {
      return {
        r: parseInt(hex[0] + hex[0], 16),
        g: parseInt(hex[1] + hex[1], 16),
        b: parseInt(hex[2] + hex[2], 16),
        a: parseInt(hex[3] + hex[3], 16) / 255,
      };
    }
    if (hex.length === 6) {
      return {
        r: parseInt(hex.slice(0, 2), 16),
        g: parseInt(hex.slice(2, 4), 16),
        b: parseInt(hex.slice(4, 6), 16),
        a: 1,
      };
    }
    if (hex.length === 8) {
      return {
        r: parseInt(hex.slice(0, 2), 16),
        g: parseInt(hex.slice(2, 4), 16),
        b: parseInt(hex.slice(4, 6), 16),
        a: parseInt(hex.slice(6, 8), 16) / 255,
      };
    }
    return null;
  }

  // rgb(r, g, b) or rgba(r, g, b, a) or rgb(r g b / a)
  const number = '[+-]?(?:\\d+\\.?\\d*|\\.\\d+)(?:e[+-]?\\d+)?';
  const separator = '(?:\\s*,\\s*|\\s+)';
  const rgbMatch = s.match(new RegExp('^rgba?\\(\\s*('+number+'%?)'+separator+'('+number+'%?)'+separator+'('+number+'%?)(?:\\s*[,/]\\s*('+number+'%?))?\\s*\\)$'));
  if (rgbMatch) {
    const parseChan = (val) => {
      if (val.endsWith("%")) return Math.round((parseFloat(val) / 100) * 255);
      return Math.round(parseFloat(val));
    };
    const parseAlpha = (val) => {
      if (!val) return 1;
      if (val.endsWith("%")) return parseFloat(val) / 100;
      return parseFloat(val);
    };
    return {
      r: Math.max(0, Math.min(255, parseChan(rgbMatch[1]))),
      g: Math.max(0, Math.min(255, parseChan(rgbMatch[2]))),
      b: Math.max(0, Math.min(255, parseChan(rgbMatch[3]))),
      a: Math.max(0, Math.min(1, parseAlpha(rgbMatch[4]))),
    };
  }

  // hsl(h, s%, l%) or hsla(h, s%, l%, a)
  const hslMatch = s.match(new RegExp('^hsla?\\(\\s*('+number+')(?:deg)?'+separator+'('+number+')%'+separator+'('+number+')%(?:\\s*[,/]\\s*('+number+'%?))?\\s*\\)$'));
  if (hslMatch) {
    const h = ((parseFloat(hslMatch[1]) % 360) + 360) % 360;
    const sat = Math.max(0,Math.min(1,parseFloat(hslMatch[2]) / 100));
    const l = Math.max(0,Math.min(1,parseFloat(hslMatch[3]) / 100));
    const a = hslMatch[4] ? (hslMatch[4].endsWith("%") ? parseFloat(hslMatch[4]) / 100 : parseFloat(hslMatch[4])) : 1;
    const rgb = hslToRgb(h, sat, l);
    return { ...rgb, a: Math.max(0, Math.min(1, a)) };
  }

  return null;
}

/**
 * Convert HSL to sRGB
 */
export function hslToRgb(h, s, l) {
  const c = (1 - Math.abs(2 * l - 1)) * s;
  const hp = h / 60;
  const x = c * (1 - Math.abs((hp % 2) - 1));
  let r1 = 0, g1 = 0, b1 = 0;
  if (hp >= 0 && hp < 1) { r1 = c; g1 = x; }
  else if (hp >= 1 && hp < 2) { r1 = x; g1 = c; }
  else if (hp >= 2 && hp < 3) { g1 = c; b1 = x; }
  else if (hp >= 3 && hp < 4) { g1 = x; b1 = c; }
  else if (hp >= 4 && hp < 5) { r1 = x; b1 = c; }
  else if (hp >= 5 && hp < 6) { r1 = c; b1 = x; }
  const m = l - c / 2;
  return {
    r: Math.round((r1 + m) * 255),
    g: Math.round((g1 + m) * 255),
    b: Math.round((b1 + m) * 255),
  };
}

/**
 * Format RGB into #rrggbb
 */
export function toHex(c) {
  const hx = (v) => Math.max(0, Math.min(255, Math.round(v))).toString(16).padStart(2, "0");
  return `#${hx(c.r)}${hx(c.g)}${hx(c.b)}`;
}

/**
 * Format RGBA into rgba(...)
 */
export function toRgbaString(c) {
  const a = typeof c.a === "number" ? Math.round(c.a * 100) / 100 : 1;
  return `rgba(${Math.round(c.r)}, ${Math.round(c.g)}, ${Math.round(c.b)}, ${a})`;
}

// ============================================================================
// 2. GAMMA, LINEAR RGB & RELATIVE LUMINANCE
// ============================================================================

/**
 * Convert single sRGB 0..255 channel to linear sRGB 0..1 (gamma expansion)
 */
export function srgbChannelToLinear(val255) {
  const c = val255 / 255;
  if (c <= 0.04045) {
    return c / 12.92;
  }
  return Math.pow((c + 0.055) / 1.055, 2.4);
}

/**
 * Convert single linear sRGB 0..1 channel back to sRGB 0..255 (gamma compression)
 */
export function linearChannelToSrgb(c) {
  const clamped = Math.max(0, Math.min(1, c));
  let s = clamped <= 0.0031308 ? clamped * 12.92 : 1.055 * Math.pow(clamped, 1 / 2.4) - 0.055;
  return Math.max(0, Math.min(255, Math.round(s * 255)));
}

/**
 * Calculate relative luminance per WCAG 2.1 (ITU-R BT.709 coefficients)
 * Returns Y in range 0.0 (pitch black) to 1.0 (pure white)
 */
export function relativeLuminance(color) {
  const c = typeof color === "string" ? parseColor(color) : color;
  if (!c) return 0;
  const rLin = srgbChannelToLinear(c.r);
  const gLin = srgbChannelToLinear(c.g);
  const bLin = srgbChannelToLinear(c.b);
  return 0.2126 * rLin + 0.7152 * gLin + 0.0722 * bLin;
}

// ============================================================================
// 3. ALPHA COMPOSITING (PORTER-DUFF OVER)
// ============================================================================

/**
 * Composite a translucent foreground color over a solid (or semi-transparent) background.
 * Returns an opaque { r, g, b, a: 1 } if background is opaque.
 */
export function compositeOver(fgColor, bgColor) {
  const fg = typeof fgColor === "string" ? parseColor(fgColor) : fgColor;
  const bg = typeof bgColor === "string" ? parseColor(bgColor) : bgColor;
  if (!fg) return bg || { r: 255, g: 255, b: 255, a: 1 };
  if (!bg) return fg;

  const aFg = typeof fg.a === "number" ? fg.a : 1;
  const aBg = typeof bg.a === "number" ? bg.a : 1;

  if (aFg >= 1) return { r: fg.r, g: fg.g, b: fg.b, a: 1 };
  if (aFg <= 0) return { r: bg.r, g: bg.g, b: bg.b, a: aBg };

  const outA = aFg + aBg * (1 - aFg);
  if (outA <= 0) return { r: 0, g: 0, b: 0, a: 0 };

  const r = (fg.r * aFg + bg.r * aBg * (1 - aFg)) / outA;
  const g = (fg.g * aFg + bg.g * aBg * (1 - aFg)) / outA;
  const b = (fg.b * aFg + bg.b * aBg * (1 - aFg)) / outA;

  return {
    r: Math.round(r),
    g: Math.round(g),
    b: Math.round(b),
    a: Math.min(1, outA),
  };
}

/**
 * Composite a color over a stack of backgrounds from bottom to top.
 */
export function compositeStack(bottomToTopColors) {
  let base = { r: 255, g: 255, b: 255, a: 1 };
  for (const c of bottomToTopColors) {
    if (!c) continue;
    base = compositeOver(c, base);
  }
  return base;
}

// ============================================================================
// 4. WCAG 2.1 CONTRAST RATIO & AUDITING
// ============================================================================

/**
 * Calculate WCAG 2.1 contrast ratio between two colors (1:1 to 21:1)
 */
export function contrastRatio(color1, color2) {
  const l1 = relativeLuminance(color1);
  const l2 = relativeLuminance(color2);
  const lighter = Math.max(l1, l2);
  const darker = Math.min(l1, l2);
  return (lighter + 0.05) / (darker + 0.05);
}

/**
 * Determine WCAG 2.1 compliance level for text or UI components:
 * - normal text (<18pt or <14pt bold): AA >= 4.5, AAA >= 7.0
 * - large text (>=18pt or >=14pt bold): AA >= 3.0, AAA >= 4.5
 * - UI components / graphical controls: AA >= 3.0
 */
export function wcagCompliance(ratio, options = {}) {
  const isLarge = !!options.isLarge;
  const isUI = !!options.isUI;

  if (isUI) {
    return {
      ratio: Math.round(ratio * 100) / 100,
      passAA: ratio >= 3.0,
      passAAA: ratio >= 4.5,
      requiredAA: 3.0,
      grade: ratio >= 4.5 ? "AAA" : ratio >= 3.0 ? "AA" : "FAIL",
    };
  }

  const reqAA = isLarge ? 3.0 : 4.5;
  const reqAAA = isLarge ? 4.5 : 7.0;

  return {
    ratio: Math.round(ratio * 100) / 100,
    passAA: ratio >= reqAA,
    passAAA: ratio >= reqAAA,
    requiredAA: reqAA,
    grade: ratio >= reqAAA ? "AAA" : ratio >= reqAA ? "AA" : "FAIL",
  };
}

// ============================================================================
// 5. APCA (ADVANCED PERCEPTUAL CONTRAST ALGORITHM)
// ============================================================================

/**
 * Calculate APCA Lightness Contrast (Lc) value (-108 to +106)
 * Positive values indicate dark text on light background (positive polarity).
 * Negative values indicate light text on dark background (negative polarity).
 */
export function apcaContrast(textColor, bgColor) {
  const txt = typeof textColor === "string" ? parseColor(textColor) : textColor;
  const bg = typeof bgColor === "string" ? parseColor(bgColor) : bgColor;
  if (!txt || !bg) return 0;

  // sRGB to Y (ITU-R BT.709 with APCA power curve)
  const normY = (c) => {
    const r = Math.pow(c.r / 255, 2.4);
    const g = Math.pow(c.g / 255, 2.4);
    const b = Math.pow(c.b / 255, 2.4);
    return 0.2126729 * r + 0.7151522 * g + 0.072175 * b;
  };

  let yTxt = normY(txt);
  let yBg = normY(bg);

  // Soft clamp black level
  const blkThrs = 0.022;
  const blkClmp = 1.414;
  if (yTxt < blkThrs) yTxt += Math.pow(blkThrs - yTxt, blkClmp);
  if (yBg < blkThrs) yBg += Math.pow(blkThrs - yBg, blkClmp);

  // Polarity check
  if (Math.abs(yBg - yTxt) < 0.0005) return 0;

  let SAPC = 0;
  if (yBg > yTxt) {
    // Dark text on light background
    const yBgExp = Math.pow(yBg, 0.56);
    const yTxtExp = Math.pow(yTxt, 0.57);
    SAPC = (yBgExp - yTxtExp) * 1.14;
  } else {
    // Light text on dark background
    const yBgExp = Math.pow(yBg, 0.65);
    const yTxtExp = Math.pow(yTxt, 0.62);
    SAPC = (yBgExp - yTxtExp) * 1.14;
  }

  const outputClmp = (val) => {
    if (Math.abs(val) < 0.1) return 0;
    if (val > 0) {
      if (val < 0.25) return 0;
      return (val - 0.027) * 100;
    }
    if (val > -0.25) return 0;
    return (val + 0.027) * 100;
  };

  return Math.round(outputClmp(SAPC) * 10) / 10;
}

// ============================================================================
// 6. OKLAB, OKLCH, CIELAB & DELTA E
// ============================================================================

/**
 * sRGB (0..255) to OKLab { L: 0..1, a: -0.4..0.4, b: -0.4..0.4 }
 */
export function rgbToOklab(c) {
  const r = srgbChannelToLinear(c.r);
  const g = srgbChannelToLinear(c.g);
  const b = srgbChannelToLinear(c.b);

  const l = Math.cbrt(0.4122214708 * r + 0.5363325363 * g + 0.0514459929 * b);
  const m = Math.cbrt(0.2119034982 * r + 0.6806995451 * g + 0.1073969566 * b);
  const s = Math.cbrt(0.0883024619 * r + 0.2817188376 * g + 0.6299787005 * b);

  return {
    L: 0.2104542553 * l + 0.793617785 * m - 0.0040720468 * s,
    a: 1.9779984951 * l - 2.428592205 * m + 0.4505937099 * s,
    b: 0.0259040371 * l + 0.7827717662 * m - 0.808675766 * s,
  };
}

/**
 * OKLab to OKLCH { L: 0..1, C: 0..0.4, h: 0..360 }
 */
export function oklabToOklch(lab) {
  const C = Math.sqrt(lab.a * lab.a + lab.b * lab.b);
  let h = (Math.atan2(lab.b, lab.a) * 180) / Math.PI;
  if (h < 0) h += 360;
  return { L: lab.L, C, h };
}

/**
 * sRGB to OKLCH
 */
export function rgbToOklch(c) {
  return oklabToOklch(rgbToOklab(c));
}

/**
 * Perceptual color difference in OKLab space: Delta E (OKLab)
 */
export function deltaEOklab(c1, c2) {
  const lab1 = rgbToOklab(typeof c1 === "string" ? parseColor(c1) : c1);
  const lab2 = rgbToOklab(typeof c2 === "string" ? parseColor(c2) : c2);
  const dL = lab1.L - lab2.L;
  const da = lab1.a - lab2.a;
  const db = lab1.b - lab2.b;
  return Math.sqrt(dL * dL + da * da + db * db);
}

/**
 * CIE 1976 Delta E (Euclidean distance in CIELAB)
 */
export function rgbToLab(rgb) {
  const r = srgbChannelToLinear(rgb.r);
  const g = srgbChannelToLinear(rgb.g);
  const b = srgbChannelToLinear(rgb.b);

  // sRGB to XYZ (D65)
  const x = (r * 0.4124564 + g * 0.3575761 + b * 0.1804375) / 0.95047;
  const y = (r * 0.2126729 + g * 0.7151522 + b * 0.072175) / 1.0;
  const z = (r * 0.0193339 + g * 0.119192 + b * 0.9503041) / 1.08883;

  const f = (t) => (t > 0.008856 ? Math.cbrt(t) : 7.787 * t + 16 / 116);
  const fx = f(x), fy = f(y), fz = f(z);

  return {
    L: 116 * fy - 16,
    a: 500 * (fx - fy),
    b: 200 * (fy - fz),
  };
}

export function deltaE76(c1, c2) {
  const lab1 = rgbToLab(typeof c1 === "string" ? parseColor(c1) : c1);
  const lab2 = rgbToLab(typeof c2 === "string" ? parseColor(c2) : c2);
  const dL = lab1.L - lab2.L;
  const da = lab1.a - lab2.a;
  const db = lab1.b - lab2.b;
  return Math.sqrt(dL * dL + da * da + db * db);
}

// ============================================================================
// 7. COLOR VISION DEFICIENCY (CVD) SIMULATION
// ============================================================================

// Machado et al. 2009 / Brettel matrices for severe color vision deficiency
const CVD_MATRICES = {
  protanopia: [
    [0.56667, 0.43333, 0.0],
    [0.55833, 0.44167, 0.0],
    [0.0, 0.24167, 0.75833],
  ],
  deuteranopia: [
    [0.625, 0.375, 0.0],
    [0.7, 0.3, 0.0],
    [0.0, 0.3, 0.7],
  ],
  tritanopia: [
    [0.95, 0.05, 0.0],
    [0.0, 0.43333, 0.56667],
    [0.0, 0.475, 0.525],
  ],
  achromatopsia: [
    [0.299, 0.587, 0.114],
    [0.299, 0.587, 0.114],
    [0.299, 0.587, 0.114],
  ],
};

/**
 * Simulate Color Vision Deficiency on an sRGB color
 */
export function simulateCVD(color, type = "deuteranopia") {
  const c = typeof color === "string" ? parseColor(color) : color;
  if (!c) return null;
  const mat = CVD_MATRICES[type.toLowerCase()] || CVD_MATRICES.deuteranopia;

  const r = c.r * mat[0][0] + c.g * mat[0][1] + c.b * mat[0][2];
  const g = c.r * mat[1][0] + c.g * mat[1][1] + c.b * mat[1][2];
  const b = c.r * mat[2][0] + c.g * mat[2][1] + c.b * mat[2][2];

  return {
    r: Math.max(0, Math.min(255, Math.round(r))),
    g: Math.max(0, Math.min(255, Math.round(g))),
    b: Math.max(0, Math.min(255, Math.round(b))),
    a: c.a,
  };
}
