/* Markdown for tools/perf_planner.mjs: one "## Planner probes — <label>"
   section in perf-baseline.md per labelled run, replaced when the same label
   runs again, other sections left alone. */
import { existsSync, readFileSync, writeFileSync } from "node:fs";

const v = (x) => (x == null ? "—" : String(x));

function spritesRows(r) {
  const rows = [];
  for (const k of ["sprites_cold", "sprites_warm"]) {
    const s = r[k];
    if (!s) continue;
    const bake = s.counters && (s.counters.drawPrepared || s.counters.bake);
    rows.push(`| ${k} | ${v(s.firstPictureMs)} | ${v(s.allPicturesMs)}${s.timedOut ? " (timeout)" : ""} | ${v(s.long && s.long.longestMs)} | ` +
      `${v(s.long && s.long.count)} | ${bake ? bake.n : 0} | ${v(s.persistedAtSwitch)}/${v(s.itemsAtSwitch)} | ${v(s.before && s.before.cache)} |`);
  }
  const z = r.sprites_zoom;
  if (z) {
    const bake = z.counters && (z.counters.drawPrepared || z.counters.bake);
    rows.push(`| sprites_zoom (${z.scFrom}→${z.scTo}) | — | ${v(z.allExactAfterZoomMs)}${z.timedOut ? " (timeout)" : ""} | ${v(z.long.longestMs)} | ${v(z.long.count)} | ${bake ? bake.n : 0} | — | — |`);
  }
  if (!rows.length) return [];
  return ["| scenario | first picture ms | all exact ms | longest task ms | long tasks | bakes | on disk at switch | cached before |",
    "|---|--:|--:|--:|--:|--:|--:|--:|", ...rows, ""];
}

function presRows(p) {
  if (!p) return [];
  return [`pres_paint (${p.items} items): technical model ${p.technical.modelMs} ms / paint, presentation model ${p.presentation.modelMs} ms ` +
    `(drawItemPresentation ${p.presentation.drawItemPresentationMs} ms); pan: ${p.pan.modelPerMove} model paints / move, ${p.pan.modelMsPerMove} ms model / move.`, ""];
}

function mepRows(r) {
  const out = [];
  const i = r.mep_2d_idle;
  if (i) out.push(`mep_2d_idle: ${i.hudPaintsPerSec} HUD paints/s, ${i.hudMsPerPaint} ms HUD/paint (drawMEP ${i.drawMEPMsPerPaint}, signature ${i.sigMsPerPaint}), ` +
    `rAF ${i.rafFps} fps, main thread busy ${i.profile ? Math.round((i.profile.busyMs / (i.seconds * 1000)) * 100) : "?"} %.`, "");
  const d = r.mep_2d_drag;
  if (d) {
    out.push("| drag (mep_2d_drag) | grabbed | frame p50 ms | clashes ms/move | status ms/move | signature ms/move | model ms/move | panel ms/move | clashes calls | status calls | makeRouter | panel renders |",
      "|---|---|--:|--:|--:|--:|--:|--:|--:|--:|--:|--:|");
    for (const k of Object.keys(d)) {
      if (!d[k] || !d[k].msPerMove) continue;
      const g = d[k];
      out.push(`| ${k} | ${v(g.grabbed)} | ${v(g.moveFrameMs && g.moveFrameMs.p50)} | ${g.msPerMove.clashes} | ${g.msPerMove.status} | ${g.msPerMove.signature} | ` +
        `${g.msPerMove.model} | ${g.msPerMove.panel} | ${g.calls.computeMEPClashes} | ${g.calls.computeMEPStatus} | ${g.calls.makeRouter} | ${g.calls.renderPanel} |`);
    }
    if (d.profile) out.push("", `drag main-thread busy: ${d.profile.busyMs} ms over all three gestures (${Object.keys(d).length - 1} × 30 moves).`);
    out.push("");
  }
  const rt = r.mep_route;
  if (rt) out.push(`mep_route: started ${rt.started}; frame p50 ${v(rt.moveFrameMs && rt.moveFrameMs.p50)} ms; makeRouter ${rt.calls.makeRouter} calls ` +
    `(${rt.msPerMove.makeRouter} ms/move), wallPath ${rt.msPerMove.wallPath} ms/move, routeResolve ${rt.msPerMove.routeResolve} ms/move; busy ${rt.profile ? rt.profile.busyMs : "?"} ms / ${rt.moves} moves.`, "");
  const m = r.mep_3d;
  if (m) {
    const reb = m.rebuild || {};
    out.push(`mep_3d (${m.system}): draw calls with MEP ${v(m.withMEP.drawCalls)}` + (m.withMEPNoXray ? ` (under-floor x-ray off: ${v(m.withMEPNoXray.drawCalls)})` : "") +
      ` vs without ${v(m.withoutMEP.drawCalls)}; MEP meshes ${m.mepMeshes.meshes} ` +
      `(+${m.mepMeshes.instanced} instanced) of ${m.allMeshes.meshes}; rebuild3D ${v(reb.rebuild3D && reb.rebuild3D.ms)} ms (buildMEP3D ${v(reb.buildMEP3D && reb.buildMEP3D.ms)}); ` +
      `toggle a system (panel eye) until the new frame is drawn: off ${v(m.toggleOff.drawnMs)} ms, on ${v(m.toggleOn.drawnMs)} ms ` +
      `(with 2 settle frames + GPU drain: ${m.toggleOff.ms} / ${m.toggleOn.ms} ms; full rebuild3D calls ${m.toggleOff.counters.rebuild3D ? m.toggleOff.counters.rebuild3D.n : 0}).`, "");
  }
  return out;
}

function rebuildRows(r) {
  const pr = r.planner_rebuild;
  if (!pr) return [];
  const row = (name, x) => {
    const last = x.runs[x.runs.length - 1] || {};
    const med = (k) => { const a = x.runs.map((q) => q[k]).sort((p, q) => p - q); return a[Math.floor(a.length / 2)]; };
    return `| ${name} | ${x.items} | ${med("rebuild3D")} | ${med("structure")} | ${med("items")} | ${med("mep")} | ${last.itemSig ? last.itemSig.n + " / " + last.itemSig.ms : "—"} | ` +
      `${x.meshes.meshes} | ${x.itemMeshes.meshes} | ${x.pipelinesAfterFirstCompile ? (x.pipelinesAfterFirstCompile.createRenderPipelineAsync || 0) + (x.pipelinesAfterFirstCompile.createRenderPipeline || 0) : "—"} |`;
  };
  const rows = ["| planner_rebuild | items | rebuild3D ms | structure | items | MEP | itemSig n / ms | meshes | item meshes | pipelines |",
    "|---|--:|--:|--:|--:|--:|--:|--:|--:|--:|", row("apartment", pr)];
  if (pr.big) rows.push(row(`tiled ×copies`, pr.big));
  return [...rows, ""];
}

export function renderSection(out) {
  const r = {};
  for (const [k, x] of Object.entries(out.results)) if (x && !x.error) r[k] = x;
  const lines = [`## Planner probes — ${out.label}`, "",
    `Generated ${out.date} by \`node tools/perf_planner.mjs\` · ${out.backend} · real GPU Chrome · scene ${JSON.stringify(out.scene || {})}` +
    (out.bigScene ? ` · tiled scene ${JSON.stringify(out.bigScene)}` : ""), ""];
  lines.push(...spritesRows(r), ...presRows(r.pres_paint), ...mepRows(r), ...rebuildRows(r));
  const failed = Object.entries(out.results).filter(([, x]) => x && x.error).map(([k, x]) => k + ": " + x.error.split(String.fromCharCode(10))[0]);
  if (failed.length) lines.push("Failed: " + failed.join("; "), "");
  if (out.errors.length) lines.push("Errors: " + out.errors.join("; "), "");
  return lines.join("\n");
}

export function writeReport(out, mdPath) {
  const section = renderSection(out);
  let md = existsSync(mdPath) ? readFileSync(mdPath, "utf8") : "# Performance baseline\n";
  const head = `## Planner probes — ${out.label}`;
  const start = md.indexOf(head);
  if (start >= 0) {
    const next = md.indexOf("\n## ", start + head.length);
    md = md.slice(0, start) + section + (next >= 0 ? md.slice(next) : "\n");
  } else md = md.replace(/\s*$/, "\n\n") + section + "\n";
  // Windows: a file another process has open fails with UNKNOWN now and then
  for (let i = 0; ; i++) {
    try { writeFileSync(mdPath, md); if (readFileSync(mdPath, "utf8") === md) return; } catch (e) { if (i >= 20) throw e; }
    if (i >= 20) throw new Error("could not write " + mdPath);
    Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, 250);
  }
}
