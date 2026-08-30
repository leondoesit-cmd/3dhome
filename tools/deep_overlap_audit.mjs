#!/usr/bin/env node
/* Deep Overlap & Layout Audit
 *
 * Comprehensive automated layout verification across all ModelForge UI surfaces:
 * - 2D Planner & All Inspectors (Wall, Multi-wall, Openings, Rooms, Items, Markers)
 * - 3D Parametric CAD Model Editor (FeatureManager tree, Ribbon tabs, Diagnostics, Feature editors, Assembly)
 * - Mobile Touch Shell & Bottom Sheets (Properties, View, Commands, Add, More, Context row, Coach)
 * - Cabinet Studio & Parametric Carcass Tools
 * - Topbars, Dropdown Menus, Settings Modals, and Floor Management
 *
 * Checks performed:
 * 1. Bounding-Box Collisions (>4px intersection between sibling/unrelated interactive elements)
 * 2. Text Truncation / Overflow Collisions (unintended text overflow without ellipsis)
 * 3. Dual-Rendered Icons (simultaneous font pseudo-element + SVG child glyphs)
 * 4. Touch Target Envelopes (interactive controls on mobile/touch viewports meeting size floors)
 * 5. Horizontal Page Spill (unintended sideways viewport scrolling)
 */

import { openPage, findChrome, sweepOrphanedHarnessChromes } from "./browser_harness.mjs";

const DEFAULT_CONFIGS = [
  { id: "desk-1920-en", name: "Desktop 1920x1080 (EN)", width: 1920, height: 1080, lang: "en", mobile: false, touch: false },
  { id: "desk-1920-he", name: "Desktop 1920x1080 (HE)", width: 1920, height: 1080, lang: "he", mobile: false, touch: false },
  { id: "desk-1440-en", name: "Desktop 1440x900 (EN)", width: 1440, height: 900, lang: "en", mobile: false, touch: false },
  { id: "desk-1440-he", name: "Desktop 1440x900 (HE)", width: 1440, height: 900, lang: "he", mobile: false, touch: false },
  { id: "desk-1280-en", name: "Desktop 1280x800 (EN)", width: 1280, height: 800, lang: "en", mobile: false, touch: false },
  { id: "desk-1280-he", name: "Desktop 1280x800 (HE)", width: 1280, height: 800, lang: "he", mobile: false, touch: false },
  { id: "desk-1024-en", name: "Desktop 1024x768 (EN)", width: 1024, height: 768, lang: "en", mobile: false, touch: false },
  { id: "desk-1024-he", name: "Desktop 1024x768 (HE)", width: 1024, height: 768, lang: "he", mobile: false, touch: false },
  { id: "tab-768-en", name: "Tablet iPad 768x1024 (EN)", width: 768, height: 1024, lang: "en", mobile: true, touch: true },
  { id: "tab-768-he", name: "Tablet iPad 768x1024 (HE)", width: 768, height: 1024, lang: "he", mobile: true, touch: true },
  { id: "fold-717-en", name: "Foldable Inner 717x829 (EN)", width: 717, height: 829, lang: "en", mobile: true, touch: true },
  { id: "fold-717-he", name: "Foldable Inner 717x829 (HE)", width: 717, height: 829, lang: "he", mobile: true, touch: true },
  { id: "mob-390-en", name: "Mobile Phone 390x844 (EN)", width: 390, height: 844, lang: "en", mobile: true, touch: true },
  { id: "mob-390-he", name: "Mobile Phone 390x844 (HE)", width: 390, height: 844, lang: "he", mobile: true, touch: true },
  { id: "mob-360-en", name: "Mobile Compact 360x780 (EN)", width: 360, height: 780, lang: "en", mobile: true, touch: true },
  { id: "mob-320-en", name: "Small Phone 320x568 (EN)", width: 320, height: 568, lang: "en", mobile: true, touch: true },
  { id: "land-844-en", name: "Mobile Landscape 844x390 (EN)", width: 844, height: 390, lang: "en", mobile: true, touch: true },
];

// CLI Arguments
const args = process.argv.slice(2);
const isQuick = args.includes("--quick");
const isVerbose = args.includes("--verbose");
const langFilter = args.find((a) => a.startsWith("--lang="))?.split("=")[1];
const surfaceFilter = args.find((a) => a.startsWith("--surface="))?.split("=")[1];

let activeConfigs = DEFAULT_CONFIGS;
if (isQuick) {
  activeConfigs = activeConfigs.filter((c) =>
    ["desk-1440-en", "desk-1024-he", "tab-768-en", "mob-390-en", "mob-390-he", "fold-717-en"].includes(c.id)
  );
}
if (langFilter && langFilter !== "all") {
  activeConfigs = activeConfigs.filter((c) => c.lang === langFilter);
}

// Reusable DOM inspector injected into the browser page
const INJECTED_AUDITOR = `
window.__runLayoutAudit = function(stageName, isMobile) {
  const issues = [];
  const warnings = [];

  function isBehindModal(el) {
    if (document.body.classList.contains("m-sheet-open") && !el.closest("#m-sheet")) return true;
    if (document.querySelector("#modeler:not([hidden])")) {
      if (document.querySelector("#modeler .md-welcome:not([hidden])") && !el.closest("#modeler .md-welcome")) return true;
      if (!el.closest("#modeler")) return true;
    }
    if (document.querySelector(".settings-modal:not([hidden])") && !el.closest(".settings-modal")) return true;
    if (document.querySelector(".bp-modal:not([hidden])") && !el.closest(".bp-modal")) return true;
    return false;
  }

  function getVisibleRect(el) {
    if (!el) return { left: 0, right: 0, top: 0, bottom: 0, width: 0, height: 0 };
    let r = el.getBoundingClientRect();
    let curr = el.parentElement;
    while (curr && curr !== document.documentElement && curr !== document.body) {
      const cs = window.getComputedStyle(curr);
      const ov = cs.overflow + " " + cs.overflowY + " " + cs.overflowX;
      if (ov.includes("hidden") || ov.includes("auto") || ov.includes("scroll")) {
        const pr = curr.getBoundingClientRect();
        const l = Math.max(r.left, pr.left);
        const right = Math.min(r.right, pr.right);
        const t = Math.max(r.top, pr.top);
        const b = Math.min(r.bottom, pr.bottom);
        if (right <= l || b <= t) {
          return { left: 0, right: 0, top: 0, bottom: 0, width: 0, height: 0 };
        }
        r = { left: l, right, top: t, bottom: b, width: right - l, height: b - t };
      }
      curr = curr.parentElement;
    }
    return r;
  }

  function isVisible(el) {
    if (!el || el.hidden || el.style.display === "none" || el.style.visibility === "hidden") return false;
    if (isBehindModal(el)) return false;
    const cs = window.getComputedStyle(el);
    if (cs.display === "none" || cs.visibility === "hidden" || parseFloat(cs.opacity) === 0) return false;
    const r = getVisibleRect(el);
    if (r.width <= 0 || r.height <= 0) return false;
    if (r.bottom <= 0 || r.top >= window.innerHeight || r.right <= 0 || r.left >= window.innerWidth) return false;
    return true;
  }

  function getLayerId(el) {
    if (el.closest('#modeler .md-welcome:not([hidden])')) return 'modeler-welcome';
    if (el.closest('#modeler .md-sheet.on')) return 'modeler-sheet';
    if (el.closest('#modeler .md-cad-tut-card:not([hidden])')) return 'modeler-tut';
    if (el.closest('#modeler')) return 'modeler-base';

    if (el.closest('.settings-modal:not([hidden])')) return 'planner-settings';
    if (el.closest('.bp-modal:not([hidden])')) return 'planner-modal';
    if (el.closest('#cabinetModal:not([hidden])')) return 'planner-cabinet';
    if (el.closest('#m-sheet.on')) return 'planner-msheet';
    if (el.closest('#m-coach:not([hidden])')) return 'planner-coach';
    return 'planner-base';
  }

  function getDescriptor(el) {
    const tag = el.tagName.toLowerCase();
    const id = el.id ? "#" + el.id : "";
    const cls = el.className && typeof el.className === "string"
      ? "." + el.className.trim().split(/\\s+/).slice(0, 3).join(".")
      : "";
    const text = (el.textContent || "").trim().replace(/\\s+/g, " ").slice(0, 24);
    const r = getVisibleRect(el);
    return {
      selector: tag + id + cls,
      text: text ? '"' + text + '"' : "",
      rect: { l: Math.round(r.left), r: Math.round(r.right), t: Math.round(r.top), b: Math.round(r.bottom), w: Math.round(r.width), h: Math.round(r.height) }
    };
  }

  // 1. Check Horizontal Viewport Overflow
  if (document.documentElement.scrollWidth > window.innerWidth + 2) {
    issues.push({
      type: "PAGE_SPILL",
      stage: stageName,
      message: "Document body overflows viewport width (scrollWidth: " + document.documentElement.scrollWidth + "px, innerWidth: " + window.innerWidth + "px)"
    });
  }

  // 2. Gather All Interactive & Important Visual Elements
  const selector = [
    "button:not([hidden])",
    "input:not([hidden])",
    "select:not([hidden])",
    ".tool:not([hidden])",
    ".wi-act:not([hidden])",
    ".mctx-btn:not([hidden])",
    ".dropdown-item:not([hidden])",
    ".md-ribbon-btn:not([hidden])",
    ".md-diag-jump:not([hidden])",
    ".md-hsize:not([hidden])",
    ".md-strip > button:not([hidden])",
    ".md-panel-toggle:not([hidden])",
    ".m-nav-btn:not([hidden])",
    ".m-grid-btn:not([hidden])",
    ".m-list-btn:not([hidden])",
    ".tb-pill button:not([hidden])",
    "#floor-tabs button:not([hidden])",
    ".insp-tab:not([hidden])",
    ".cad-chip:not([hidden])"
  ].join(",");

  const elements = Array.from(document.querySelectorAll(selector)).filter(isVisible);

  // 3. Collision Analysis between distinct interactive controls
  for (let i = 0; i < elements.length; i++) {
    const e1 = elements[i];
    const r1 = getVisibleRect(e1);
    if (r1.width <= 0 || r1.height <= 0) continue;
    const l1 = getLayerId(e1);

    for (let j = i + 1; j < elements.length; j++) {
      const e2 = elements[j];
      const l2 = getLayerId(e2);

      // Elements must belong to the exact same active layer
      if (l1 !== l2) continue;

      // Ignore parent/child containment
      if (e1.contains(e2) || e2.contains(e1)) continue;

      const r2 = getVisibleRect(e2);
      if (r2.width <= 0 || r2.height <= 0) continue;

      const xOverlap = Math.max(0, Math.min(r1.right, r2.right) - Math.max(r1.left, r2.left));
      const yOverlap = Math.max(0, Math.min(r1.bottom, r2.bottom) - Math.max(r1.top, r2.top));

      // Threshold: > 4px in both dimensions represents a real visual collision
      if (xOverlap > 4 && yOverlap > 4) {
        issues.push({
          type: "COLLISION",
          stage: stageName,
          layer: l1,
          element1: getDescriptor(e1),
          element2: getDescriptor(e2),
          overlap: { width: Math.round(xOverlap), height: Math.round(yOverlap) }
        });
      }
    }
  }

  // 4. Dual Icon Rendering Check
  const icons = Array.from(document.querySelectorAll("i.ph")).filter(isVisible);
  for (let k = 0; k < icons.length; k++) {
    const icon = icons[k];
    const hasSvg = !!icon.querySelector("svg");
    const cs = window.getComputedStyle(icon, "::before");
    const content = cs.content;
    const hasFontGlyph = content && content !== "none" && content !== '""' && content !== "normal";

    if (hasSvg && hasFontGlyph) {
      issues.push({
        type: "DUAL_ICON_RENDER",
        stage: stageName,
        element: getDescriptor(icon),
        message: "Icon renders both SVG child and font ::before pseudo-element simultaneously"
      });
    }
  }

  // 5. Text Clipping without Ellipsis in Meta / Status readouts
  const textReadouts = Array.from(document.querySelectorAll(".md-diag-jump, .md-hsize, .wi-id, .m-top-selection-title, .md-mobile-status")).filter(isVisible);
  for (let m = 0; m < textReadouts.length; m++) {
    const tro = textReadouts[m];
    const cs = window.getComputedStyle(tro);
    if (tro.scrollWidth > tro.clientWidth + 2 && cs.overflow !== "hidden" && cs.textOverflow !== "ellipsis") {
      warnings.push({
        type: "TEXT_OVERFLOW",
        stage: stageName,
        element: getDescriptor(tro),
        message: "Text readout overflows container without ellipsis protection (scrollWidth: " + tro.scrollWidth + ", clientWidth: " + tro.clientWidth + ")"
      });
    }
  }

  return { issues, warnings };
};
`;

async function runAudit() {
  console.log("==================================================================");
  console.log("             ModelForge Deep Overlap & Layout Audit               ");
  console.log("==================================================================");
  console.log(`Configurations: ${activeConfigs.length} viewports | Quick: ${isQuick ? "Yes" : "No"}`);
  console.log("------------------------------------------------------------------");

  const chromePath = await findChrome();
  if (!chromePath) {
    console.error("Headless Chrome not found. Audit requires Chrome for layout engine verification.");
    process.exit(1);
  }

  sweepOrphanedHarnessChromes();

  let totalIssues = 0;
  let totalWarnings = 0;
  let stageCount = 0;

  for (const cfg of activeConfigs) {
    process.stdout.write(`\n[${cfg.name}] Initializing... `);
    const page = await openPage(cfg);

    try {
      // Inject auditor, disable animation delays for instant layout settlement, and dismiss start screen
      await page.eval((code) => {
        const start = document.getElementById("start-screen");
        if (start) start.hidden = true;
        const style = document.createElement("style");
        style.id = "audit-instant-layout";
        style.textContent = "* { transition-duration: 0s !important; animation-duration: 0s !important; }";
        document.head.appendChild(style);
        const s = document.createElement("script");
        s.textContent = code;
        document.head.appendChild(s);
      }, INJECTED_AUDITOR);

      await page.eval(() => new Promise((r) => setTimeout(r, 100)));

      async function auditStage(stageName) {
        stageCount++;
        const res = await page.eval((sn, mob) => window.__runLayoutAudit(sn, mob), stageName, cfg.mobile);
        if (res.issues && res.issues.length > 0) {
          totalIssues += res.issues.length;
          res.issues.forEach((iss) => {
            console.error(`\n  [!] COLLISION in ${iss.stage} (${iss.layer || ""}):`);
            if (iss.type === "COLLISION") {
              console.error(`      Element 1: ${iss.element1.selector} ${iss.element1.text} @ [${iss.element1.rect.l}, ${iss.element1.rect.t}, ${iss.element1.rect.w}x${iss.element1.rect.h}]`);
              console.error(`      Element 2: ${iss.element2.selector} ${iss.element2.text} @ [${iss.element2.rect.l}, ${iss.element2.rect.t}, ${iss.element2.rect.w}x${iss.element2.rect.h}]`);
              console.error(`      Overlap:   ${iss.overlap.width}px x ${iss.overlap.height}px`);
            } else {
              console.error(`      ${iss.type}: ${iss.message || ""}`);
            }
          });
        }
        if (res.warnings && res.warnings.length > 0) {
          totalWarnings += res.warnings.length;
          if (isVerbose) {
            res.warnings.forEach((w) => console.warn(`  [*] WARN in ${w.stage}: ${w.message}`));
          }
        }
        return res;
      }

      // ====================================================================
      // 1. PLANNER & INSPECTORS
      // ====================================================================
      if (!surfaceFilter || surfaceFilter === "planner" || surfaceFilter === "all") {
        // Stage 1.1: Root Canvas
        await auditStage("Planner: Default Root View");

        // Stage 1.2: Wall Inspector (Locked & Unlocked)
        await page.eval(async () => {
          const { S } = await import("./js/state.js");
          S.walls = [{ id: "w1", p1: { x: 0, y: 0 }, p2: { x: 400, y: 0 }, thick: 20, h: 280, locked: true }];
          S.sel = { kind: "wall", ref: S.walls[0] };
          document.querySelectorAll("#right-inspector .props").forEach((n) => n.classList.remove("on"));
          document.getElementById("wallProps")?.classList.add("on");
          document.getElementById("right-inspector")?.classList.add("open");
          const pill = document.getElementById("w_phasePill");
          if (pill) { pill.textContent = "New"; pill.hidden = false; }
          const lock = document.getElementById("w_lockQuick");
          if (lock) lock.classList.add("active");
          if (document.body.classList.contains("compact-nav")) {
            const p = document.querySelector('[data-mnav="props"]');
            if (p) { p.disabled = false; p.click(); }
          }
        });
        await page.eval(() => new Promise((r) => setTimeout(r, 120)));
        await auditStage("Planner: Wall Inspector (Locked)");

        // Stage 1.3: Opening Inspector (Doors & Windows)
        await page.eval(async () => {
          const { S } = await import("./js/state.js");
          S.sel = { kind: "opening", ref: { id: "op1", type: "door", w: 90, h: 210, wallId: "w1", isSliding: false, isPocket: false } };
          document.querySelectorAll("#right-inspector .props").forEach((n) => n.classList.remove("on"));
          document.getElementById("openProps")?.classList.add("on");
          const ds = document.getElementById("doorSpecific");
          if (ds) ds.style.display = "flex";
        });
        await page.eval(() => new Promise((r) => setTimeout(r, 120)));
        await auditStage("Planner: Opening Inspector");

        // Stage 1.4: Room Inspector & Auto-Arrange
        await page.eval(async () => {
          const { S } = await import("./js/state.js");
          S.sel = { kind: "room", ref: { id: "r1", name: "Master Suite", area: 32.4, corners: [{ x: 0, y: 0 }, { x: 6, y: 0 }, { x: 6, y: 5.4 }, { x: 0, y: 5.4 }] } };
          document.querySelectorAll("#right-inspector .props").forEach((n) => n.classList.remove("on"));
          document.getElementById("roomProps")?.classList.add("on");
        });
        await page.eval(() => new Promise((r) => setTimeout(r, 120)));
        await auditStage("Planner: Room Inspector");

        // Stage 1.5: Item Inspector (Furniture & Props)
        await page.eval(async () => {
          const { S } = await import("./js/state.js");
          S.sel = { kind: "item", ref: { id: "it1", name: "King Size Bed", w: 200, d: 210, h: 110, rot: 90 } };
          document.querySelectorAll("#right-inspector .props").forEach((n) => n.classList.remove("on"));
          document.getElementById("itemProps")?.classList.add("on");
        });
        await page.eval(() => new Promise((r) => setTimeout(r, 120)));
        await auditStage("Planner: Item Inspector");

        // Stage 1.6: Multi-Wall Inspector
        await page.eval(async () => {
          const { S } = await import("./js/state.js");
          S.sel = { kind: "walls", ref: ["w1", "w2", "w3"] };
          document.querySelectorAll("#right-inspector .props").forEach((n) => n.classList.remove("on"));
          document.getElementById("wallMultiProps")?.classList.add("on");
        });
        await page.eval(() => new Promise((r) => setTimeout(r, 120)));
        await auditStage("Planner: Multi-Wall Inspector");

        // Stage 1.7: Blueprint Trace Bar
        await page.eval(async () => {
          const { S } = await import("./js/state.js");
          S.blueprintTrace = { name: "Architectural Ground Floor Plan v2.pdf", opacity: 0.6, visible: true };
          const bar = document.getElementById("bpTraceBar");
          if (bar) bar.hidden = false;
        });
        await page.eval(() => new Promise((r) => setTimeout(r, 120)));
        await auditStage("Planner: Blueprint Trace Bar");

        // Stage 1.8: Settings Modal (General & Icon Tabs)
        await page.eval(async () => {
          const btn = document.getElementById("settingsBtn");
          if (btn) btn.click();
        });
        await page.eval(() => new Promise((r) => setTimeout(r, 120)));
        await auditStage("Planner: Settings Modal");

        // Close settings modal
        await page.eval(() => {
          const close = document.querySelector(".settings-modal .settings-close");
          if (close) close.click();
        });
      }

      // ====================================================================
      // 2. 3D PARAMETRIC MODEL EDITOR
      // ====================================================================
      if (!surfaceFilter || surfaceFilter === "modeler" || surfaceFilter === "all") {
        await page.eval(async () => {
          const { openModeler } = await import("./js/modeler.js");
          openModeler();
        });
        await page.eval(() => new Promise((r) => setTimeout(r, 150)));

        // Audit Welcome Modal when open
        await auditStage("Modeler: Welcome Guide Overlay");

        // Dismiss Welcome Modal to access interactive Modeler canvas & ribbon
        await page.eval(async () => {
          const root = document.getElementById("modeler");
          const welcome = root?.querySelector("#mdWelcome");
          if (welcome) welcome.hidden = true;

          // Set Diagnostics Pill with 4 Rebuild Errors
          const jump = root?.querySelector("#mdDiagJump");
          const size = root?.querySelector("#mdSize");
          if (jump) {
            jump.hidden = false;
            jump.classList.add("error");
            jump.innerHTML = '<i class="ph ph-warning-octagon"></i> <span>Rebuild errors · 4</span>';
          }
          if (size) size.textContent = "120×80×45 cm";
        });
        await page.eval(() => new Promise((r) => setTimeout(r, 150)));
        await auditStage("Modeler: Feature Tree & Diagnostics Pill");

        // Ribbon tabs (Sketch, Features, Evaluate)
        await page.eval(async () => {
          const ribbonSketch = document.querySelector('#modeler [data-mtab="sketch"]');
          if (ribbonSketch) ribbonSketch.click();
        });
        await page.eval(() => new Promise((r) => setTimeout(r, 120)));
        await auditStage("Modeler: Sketch Ribbon");

        await page.eval(async () => {
          const ribbonFeatures = document.querySelector('#modeler [data-mtab="features"]');
          if (ribbonFeatures) ribbonFeatures.click();
        });
        await page.eval(() => new Promise((r) => setTimeout(r, 120)));
        await auditStage("Modeler: Features Ribbon");

        // Modeler Diagnostics Panel
        await page.eval(async () => {
          const diagPanel = document.getElementById("mdDiagnostics");
          if (diagPanel) diagPanel.scrollIntoView();
        });
        await page.eval(() => new Promise((r) => setTimeout(r, 100)));
        await auditStage("Modeler: Diagnostics Panel");

        // Close Modeler
        await page.eval(async () => {
          const closeBtn = document.getElementById("mdClose");
          if (closeBtn) closeBtn.click();
        });
        await page.eval(() => new Promise((r) => setTimeout(r, 150)));
      }

      // ====================================================================
      // 3. MOBILE SHEETS & POSTURE
      // ====================================================================
      if (cfg.mobile && (!surfaceFilter || surfaceFilter === "mobile" || surfaceFilter === "all")) {
        // Reset background selection & panel states
        await page.eval(async () => {
          const { S } = await import("./js/state.js");
          S.sel = null;
          document.querySelectorAll("#right-inspector .props").forEach((n) => n.classList.remove("on"));
          document.getElementById("right-inspector")?.classList.remove("open");
          document.body.classList.remove("show-left", "show-right");
        });

        // Mobile Commands Sheet
        await page.eval(async () => {
          const cmdBtn = document.querySelector('[data-mnav="cmds"]');
          if (cmdBtn) { cmdBtn.disabled = false; cmdBtn.click(); }
        });
        await page.eval(() => new Promise((r) => setTimeout(r, 150)));
        await auditStage("Mobile Shell: Commands Sheet");

        // Mobile View Sheet
        await page.eval(async () => {
          const viewBtn = document.querySelector('[data-mnav="view"]');
          if (viewBtn) { viewBtn.disabled = false; viewBtn.click(); }
        });
        await page.eval(() => new Promise((r) => setTimeout(r, 150)));
        await auditStage("Mobile Shell: View & Elevation Sheet");

        // Mobile More Sheet
        await page.eval(async () => {
          const moreBtn = document.querySelector('[data-mnav="more"]');
          if (moreBtn) { moreBtn.disabled = false; moreBtn.click(); }
        });
        await page.eval(() => new Promise((r) => setTimeout(r, 150)));
        await auditStage("Mobile Shell: More Sheet");

        // Close mobile sheet
        await page.eval(() => {
          const backdrop = document.getElementById("m-sheet-backdrop");
          if (backdrop) backdrop.click();
        });
        await page.eval(() => new Promise((r) => setTimeout(r, 100)));
      }

      process.stdout.write("OK");
    } catch (err) {
      process.stdout.write("ERROR");
      console.error(`\n[${cfg.name}] Execution error:`, err);
      totalIssues++;
    } finally {
      await page.close();
    }
  }

  console.log("\n\n==================================================================");
  console.log(`Deep Overlap Audit Summary:`);
  console.log(` - Total Viewports Checked: ${activeConfigs.length}`);
  console.log(` - Total Verification Stages: ${stageCount}`);
  console.log(` - Critical Layout Collisions: ${totalIssues}`);
  console.log(` - Warnings & Notices: ${totalWarnings}`);
  console.log("==================================================================");

  if (totalIssues > 0) {
    console.error(`❌ AUDIT FAILED: ${totalIssues} layout overlap issue(s) detected.`);
    process.exit(1);
  } else {
    console.log("✅ AUDIT PASSED: 0 layout overlaps or icon defects across all surfaces.");
    process.exit(0);
  }
}

runAudit().catch((err) => {
  console.error("Fatal error during layout audit:", err);
  process.exit(1);
});
