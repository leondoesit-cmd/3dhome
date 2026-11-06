/* Drawing sheet zone marks, projection symbol and title block text, split out
   of js/cad_sheet.js. It shares the editor's state through live imports from
   ../cad_sheet.js. */
import { sheetTitleMeta } from "../core/custom_properties.js";
import { drawingImageItem } from "../core/drawing_image.js";
import { ORTHO_VIEWS, isOrthoView } from "../core/hidden_line.js";
import {
  ANCHORS, LINE_STYLES, TEXT_SIZES, circle, clamp, createView, esc, line,
  poly, rect, round3, scaleLabel, sheetFrame, text, titleBlockBox,
} from "../cad_sheet.js";

/* Zone letters and numbers around the border: how a reader says "the boss in
   C3" over the phone. */
function zoneMarks(frame) {
  const items = [];
  const columns = Math.max(4, Math.round(frame.w / 105) * 2);
  const rows = Math.max(3, Math.round(frame.h / 105) * 2);
  const stepX = frame.w / columns, stepY = frame.h / rows;
  const letters = "ABCDEFGH";
  for (let i = 0; i < columns; i++) {
    const x = frame.x0 + stepX * i;
    if (i) {
      items.push(line(x, frame.y0, x, frame.y0 + 4, "thin"));
      items.push(line(x, frame.y1 - 4, x, frame.y1, "thin"));
    }
    const label = String(columns - i);
    items.push(text(x + stepX / 2, frame.y0 + 3.4, label, { size: TEXT_SIZES.small, anchor: "middle", color: "#6b7280" }));
    items.push(text(x + stepX / 2, frame.y1 - 1.2, label, { size: TEXT_SIZES.small, anchor: "middle", color: "#6b7280" }));
  }
  for (let i = 0; i < rows; i++) {
    const y = frame.y0 + stepY * i;
    if (i) {
      items.push(line(frame.x0, y, frame.x0 + 4, y, "thin"));
      items.push(line(frame.x1 - 4, y, frame.x1, y, "thin"));
    }
    const label = letters[rows - 1 - i] || "";
    items.push(text(frame.x0 + 2, y + stepY / 2 + 1, label, { size: TEXT_SIZES.small, anchor: "middle", color: "#6b7280" }));
    items.push(text(frame.x1 - 2, y + stepY / 2 + 1, label, { size: TEXT_SIZES.small, anchor: "middle", color: "#6b7280" }));
  }
  return items;
}

/* With the frustum's narrow end at left, third-angle has the end view at left
   and first-angle at right (ISO 128-3 figures 5/7; Planchard 2021 page 2-16).
   Rotating both views together preserves the convention; swapping only their
   positions changes it. Keep the two views separated and centred on one axis. */
function projectionSymbol(x, y, height, first) {
  const items = [];
  const r1 = height * 0.42, r2 = height * 0.24;
  const length = height * 1.25, gap = height * 0.32;
  const circleX = first ? x + length + gap + r1 : x + r1;
  const tipX = first ? x : x + 2 * r1 + gap;
  const baseX = tipX + length;
  items.push(circle(circleX, y, r1, "frame"));
  items.push(circle(circleX, y, r2, "frame"));
  items.push(poly([
    { x: baseX, y: y - r1 }, { x: tipX, y: y - r2 }, { x: tipX, y: y + r2 }, { x: baseX, y: y + r1 },
  ], "frame", { closed: true }));
  items.push(line(baseX, y - r1, baseX, y + r1, "frame"));
  items.push(line(tipX, y - r2, tipX, y + r2, "frame"));
  items.push(line(x - 1, y, x + 2 * r1 + gap + length + 1, y, "center"));
  items.push(line(circleX, y - r1 - 1, circleX, y + r1 + 1, "center"));
  return items;
}

function sheetTextWidth(value, size) {
  return [...String(value || "")].reduce((width, char) => width + (/[MW@]/.test(char) ? .9 : /[ilI1.,:;!|]/.test(char) ? .3 : .58) * size, 0);
}

// Bold capitals and SVG tracking need more room than ordinary metadata.
function sheetTitleWidth(value, size) {
  return [...String(value || "")].reduce((width, char) => width +
    (/[MW@]/.test(char) ? 1 : /[ilI1.,:;!| ]/.test(char) ? .34 : /[A-Z]/.test(char) ? .8 : .64) * size, 0);
}

function sheetTitleLines(value, maxWidth, size) {
  let remaining = String(value || "").trim().replace(/\s+/g, " ");
  const lines = [];
  while (remaining && lines.length < 2) {
    if (sheetTitleWidth(remaining, size) <= maxWidth) { lines.push(remaining); break; }
    let count = remaining.length;
    while (count > 0 && sheetTitleWidth(remaining.slice(0, count), size) > maxWidth) count--;
    if (lines.length === 1) {
      while (count > 0 && sheetTitleWidth(remaining.slice(0, count) + "…", size) > maxWidth) count--;
      lines.push(remaining.slice(0, count).trimEnd() + "…");
      break;
    }
    const space = remaining.lastIndexOf(" ", count);
    if (space > 0) count = space;
    lines.push(remaining.slice(0, count));
    remaining = remaining.slice(count).trimStart();
  }
  return lines;
}

function sheetFieldText(value, maxWidth) {
  let label = String(value || "—");
  for (let size = TEXT_SIZES.meta; size >= 1.8; size -= .1) {
    if (sheetTextWidth(label, size) <= maxWidth) return { label, size };
  }
  while (label && sheetTextWidth(label + "…", 1.8) > maxWidth) label = label.slice(0, -1);
  return { label: label + "…", size: 1.8 };
}

function titleBlockItems(doc, provider, sheetScale) {
  const box = titleBlockBox(doc);
  const meta = Object.assign({}, doc.title, provider?.meta || {});
  if (doc.title.sources) Object.assign(meta, sheetTitleMeta(doc, provider?.model));
  const items = [rect(box.x, box.y, box.w, box.h, "frame", { fill: "#ffffff" })];
  const rowY = [box.y + box.h * 0.42, box.y + box.h * 0.68];
  items.push(line(box.x, rowY[0], box.x + box.w, rowY[0], "frame"));
  items.push(line(box.x, rowY[1], box.x + box.w, rowY[1], "frame"));
  const colX = box.x + box.w * 0.58;
  items.push(line(colX, rowY[0], colX, box.y + box.h, "frame"));
  const midX = box.x + box.w * 0.29, thirdX = box.x + box.w * 0.79;
  items.push(line(midX, rowY[1], midX, box.y + box.h, "frame"));
  items.push(line(thirdX, rowY[1], thirdX, box.y + box.h, "frame"));

  const field = (x, y, caption, value, maxWidth, options = {}) => {
    const fitted = sheetFieldText(value, maxWidth);
    items.push(text(x, y, caption, { size: TEXT_SIZES.small, color: "#6b7280" }));
    items.push(text(x, y + 4.6, fitted.label, Object.assign({ size: fitted.size, weight: "600" }, options)));
  };
  items.push(text(box.x + 3, box.y + 6.4, meta.company || meta.author || "", { size: TEXT_SIZES.meta, weight: "600", color: "#334155" }));
  items.push(text(box.x + box.w - 3, box.y + 6.4, meta.date || "", { size: TEXT_SIZES.small, anchor: "end", color: "#6b7280" }));
  const title = String(meta.title || "");
  const titleWidth = box.w - Math.max(31, sheetTitleWidth("REV " + (meta.revision || "A"), TEXT_SIZES.view) + 9); // revision, padding and frame
  const single = sheetTitleLines(title, titleWidth, TEXT_SIZES.title);
  if (single.length === 1 && !single[0].endsWith("…")) {
    items.push(text(box.x + 3, rowY[0] - 2.4, single[0], { size: TEXT_SIZES.title, weight: "bold", fullText: title }));
  } else {
    const lines = sheetTitleLines(title, titleWidth, 3.2);
    lines.forEach((line, index) => items.push(text(box.x + 3, box.y + 11.2 + index * 4.2, line, { size: 3.2, weight: "bold", fullText: title })));
  }

  field(box.x + 3, rowY[0] + 3.4, "MATERIAL", meta.material, box.w * .3 - 6);
  field(box.x + box.w * 0.3, rowY[0] + 3.4, "FINISH", meta.finish, box.w * .28 - 6);
  field(colX + 3, rowY[0] + 3.4, "MASS", meta.mass, box.w * .42 - 6);
  field(box.x + 3, rowY[1] + 3.4, "DRAWN", meta.author, box.w * .29 - 6);
  field(midX + 3, rowY[1] + 3.4, "DWG NO.", meta.number, box.w * .29 - 6);
  field(colX + 3, rowY[1] + 3.4, "SCALE", scaleLabel(sheetScale) + " · " + (doc.units || "mm") + (doc.secondaryUnits ? " ["+doc.secondaryUnits+"]" : ""), box.w * .21 - 6);
  field(thirdX + 3, rowY[1] + 3.4, "SHEET", (meta.sheet || 1) + " / " + (meta.sheets || 1), box.w * .21 - 6);
  items.push(text(box.x + box.w - 3, rowY[0] - 2.4, "REV " + (meta.revision || "A"), { size: TEXT_SIZES.view, anchor: "end", weight: "bold" }));

  /* The angle symbol and the general tolerance note sit above the block, where
     ISO 7200 puts the data that applies to the whole sheet. */
  const symbolY = box.y - 7;
  items.push(...projectionSymbol(box.x + 3, symbolY, 5, doc.projection === "first"));
  items.push(text(box.x + 22, symbolY + 1.6, (doc.projection === "first" ? "FIRST" : "THIRD") + " ANGLE", { size: TEXT_SIZES.small, color: "#6b7280" }));
  if (meta.tolerance) {
    items.push(text(box.x + box.w - 3, symbolY + 1.6, "GENERAL TOL " + meta.tolerance, { size: TEXT_SIZES.small, anchor: "end", color: "#6b7280" }));
  }
  return items;
}

/* Wrap at word boundaries, including long unbroken part numbers. Only unusually
   long cells truncate; their complete document property remains in the tooltip. */
function bomCellLines(value, width, size, maxLines) {
  let remaining = String(value || "—").trim().replace(/\s+/g, " ");
  const lines = [];
  while (remaining && lines.length < maxLines) {
    if (sheetTextWidth(remaining, size) <= width) { lines.push(remaining); remaining = ""; break; }
    let count = remaining.length;
    while (count > 1 && sheetTextWidth(remaining.slice(0, count), size) > width) count--;
    if (lines.length === maxLines - 1) {
      while (count > 0 && sheetTextWidth(remaining.slice(0, count) + "…", size) > width) count--;
      lines.push(remaining.slice(0, count).trimEnd() + "…");
      break;
    }
    const space = remaining.lastIndexOf(" ", count);
    if (space > 0) count = space;
    lines.push(remaining.slice(0, count).trimEnd());
    remaining = remaining.slice(count).trimStart();
  }
  return lines.length ? lines : ["—"];
}

/* One measurement drives view clearance, balloon obstacles and the table itself.
   A maximum of three lines keeps the parts list inside the drawing area. */
function layoutBomTable(doc, rows) {
  const box = titleBlockBox(doc);
  const width = box.w, header = 6, lineHeight = 3.2;
  const frame = sheetFrame(doc);
  const x = frame.x0 + 6, y = frame.y0 + 6;
  const available = Math.max(6, box.y - y - header - 12);
  const maxLines = clamp(Math.floor((available / rows.length - 2) / lineHeight), 1, 3);
  const columns = [0.1, 0.25, 0.3, 0.25, 0.1];
  const measured = rows.map((row, index) => {
    const values = [String(row.item ?? index + 1), row.partNumber || "", row.description || row.name || "", row.material || "", String(row.qty ?? row.quantity ?? 1)];
    const cells = values.map((value, column) => {
      const cellWidth = columns[column] * width - 3;
      let size = TEXT_SIZES.meta, lines = bomCellLines(value, cellWidth, size, maxLines);
      if (lines.at(-1).endsWith("…")) {
        size = TEXT_SIZES.small;
        lines = bomCellLines(value, cellWidth, size, maxLines);
      }
      return {value, size, lines};
    });
    return {cells, height: Math.max(6, 2 + Math.max(...cells.map(cell => cell.lines.length)) * lineHeight)};
  });
  return {x, y, width, header, lineHeight, columns, rows: measured, height: header + measured.reduce((sum, row) => sum + row.height, 0)};
}

/* Reserve a top band for the parts list so it cannot cover a view or caption. */
function bomTableItems(layout) {
  const {x, y, width, height, header, columns, rows, lineHeight} = layout;
  const items = [rect(x, y, width, height, "frame", { fill: "#ffffff" })];
  let cursor = x;
  const edges = columns.map((fraction) => { cursor += fraction * width; return cursor; });
  edges.slice(0, -1).forEach((edge) => items.push(line(edge, y, edge, y + height, "frame")));
  items.push(line(x, y + header, x + width, y + header, "frame"));
  const captions = ["ITEM", "PART NUMBER", "DESCRIPTION", "MATERIAL", "QTY"];
  let left = x;
  captions.forEach((caption, index) => {
    items.push(text(left + 1.5, y + header - 1.6, caption, { size: TEXT_SIZES.small, weight: "600", color: "#6b7280" }));
    left = edges[index];
  });
  let rowTop = y + header;
  rows.forEach((row) => {
    let cell = x;
    row.cells.forEach((fitted, column) => {
      const firstBaseline = rowTop + (row.height - fitted.lines.length * lineHeight) / 2 + 2.8;
      fitted.lines.forEach((label, index) => items.push(text(cell + 1.5, firstBaseline + index * lineHeight, label, { size: fitted.size, fullText: fitted.value })));
      cell = edges[column];
    });
    rowTop += row.height;
    items.push(line(x, rowTop, x + width, rowTop, "thin"));
  });
  return items;
}

function strokeAttrs(styleName) {
  const style = LINE_STYLES[styleName];
  if (!style) return 'fill="none" stroke="#101418" stroke-width="0.3"';
  return 'fill="none" stroke="' + style.color + '" stroke-width="' + style.width + '"' +
    (style.dash ? ' stroke-dasharray="' + style.dash.join(" ") + '"' : "");
}

/* The same item list the canvas paints, as an SVG page in real millimetres —
   so an exported sheet prints at the size the title block claims. */
export function sceneToSvg(scene, options = {}) {
  const { paper } = scene;
  const parts = [];
  for (const item of scene.items) {
    if (item.type === "image") {
      drawingImageItem(item,paper);
      parts.push('<image x="'+round3(item.x)+'" y="'+round3(item.y)+'" width="'+round3(item.w)+'" height="'+round3(item.h)+'" preserveAspectRatio="none" href="'+esc(item.dataUrl)+'"/>');
    } else if (item.type === "rect") {
      parts.push('<rect x="' + round3(item.x) + '" y="' + round3(item.y) + '" width="' + round3(item.w) +
        '" height="' + round3(item.h) + '" ' + (item.fill ? 'fill="' + item.fill + '" ' : 'fill="none" ') +
        (item.style === "paper" ? 'stroke="none"' : strokeAttrs(item.style).replace(/fill="none" /, "")) + "/>");
    } else if (item.type === "line") {
      parts.push('<line x1="' + round3(item.x1) + '" y1="' + round3(item.y1) + '" x2="' + round3(item.x2) +
        '" y2="' + round3(item.y2) + '" ' + strokeAttrs(item.style) + "/>");
    } else if (item.type === "circle") {
      parts.push('<circle cx="' + round3(item.cx) + '" cy="' + round3(item.cy) + '" r="' + round3(item.r) +
        '" ' + strokeAttrs(item.style) + "/>");
    } else if (item.type === "ellipse") {
      if(Math.abs(item.a1-item.a0)>=Math.PI*2-1e-10)parts.push('<ellipse cx="'+round3(item.cx)+'" cy="'+round3(item.cy)+'" rx="'+round3(item.rx)+'" ry="'+round3(item.ry)+'" transform="rotate('+round3(item.rotation*180/Math.PI)+' '+round3(item.cx)+' '+round3(item.cy)+')" '+strokeAttrs(item.style)+'/>');
      else {
        const point=a=>({x:item.cx+item.rx*Math.cos(a)*Math.cos(item.rotation)-item.ry*Math.sin(a)*Math.sin(item.rotation),y:item.cy+item.rx*Math.cos(a)*Math.sin(item.rotation)+item.ry*Math.sin(a)*Math.cos(item.rotation)}),a=point(item.a0),b=point(item.a1);
        parts.push('<path d="M'+round3(a.x)+','+round3(a.y)+'A'+round3(item.rx)+','+round3(item.ry)+' '+round3(item.rotation*180/Math.PI)+' '+(Math.abs(item.a1-item.a0)>Math.PI?1:0)+' '+(item.anticlockwise?0:1)+' '+round3(b.x)+','+round3(b.y)+'" '+strokeAttrs(item.style)+'/>');
      }
    } else if (item.type === "arc") {
      const x1 = item.cx + Math.cos(item.a0) * item.r, y1 = item.cy + Math.sin(item.a0) * item.r;
      const x2 = item.cx + Math.cos(item.a1) * item.r, y2 = item.cy + Math.sin(item.a1) * item.r;
      const large = Math.abs(item.a1 - item.a0) > Math.PI ? 1 : 0;
      parts.push('<path d="M' + round3(x1) + "," + round3(y1) + "A" + round3(item.r) + "," + round3(item.r) +
        " 0 " + large + (item.anticlockwise ? ' 0 ' : ' 1 ') + round3(x2) + "," + round3(y2) + '" ' + strokeAttrs(item.style) + "/>");
    } else if (item.type === "poly") {
      if(item.paths) {
        const path=item.paths.map(points=>"M"+points.map(point=>round3(point.x)+","+round3(point.y)).join("L")+"Z").join("");
        parts.push('<path d="'+path+'" fill="'+item.fill+'" stroke="'+item.fill+'" stroke-width="0.035" stroke-linejoin="round"/>');
        continue;
      }
      const points = item.pts.map((point) => round3(point.x) + "," + round3(point.y)).join(" ");
      parts.push("<" + (item.closed ? "polygon" : "polyline") + ' points="' + points + '" ' +
        (item.fill ? 'fill="' + item.fill + '"'+(item.shaded ? ' stroke="'+item.fill+'" stroke-width="0.035" stroke-linejoin="round"' : ' stroke="none"') : strokeAttrs(item.style)) + "/>");
    } else if (item.type === "text") {
      const transform = item.rotate ? ' transform="rotate(' + round3(item.rotate) + " " + round3(item.x) + " " + round3(item.y) + ')"' : "";
      parts.push('<text x="' + round3(item.x) + '" y="' + round3(item.y) + '" font-size="' + round3(item.size) +
        '" text-anchor="' + (ANCHORS[item.anchor] || "start") + '" fill="' + (item.color || "#101418") + '"' +
        (item.baseline==="top"?' dominant-baseline="text-before-edge"':item.baseline==="bottom"?' dominant-baseline="text-after-edge"':"") +
        (item.weight ? ' font-weight="' + item.weight + '"' : "") + transform + ">" +
        (item.fullText && item.fullText !== item.text ? "<title>" + esc(item.fullText) + "</title>" : "") + esc(item.text) + "</text>");
    }
  }
  const pixelScale = options.pixelsPerMm || 1;
  return '<svg xmlns="http://www.w3.org/2000/svg" width="' + round3(paper.w * pixelScale) + 'mm" height="' +
    round3(paper.h * pixelScale) + 'mm" viewBox="0 0 ' + round3(paper.w) + " " + round3(paper.h) + '">' +
    '<style>text{font-family:"ISOCPEUR","Helvetica Neue",Arial,sans-serif;letter-spacing:.02em}</style>' +
    '<rect width="' + round3(paper.w) + '" height="' + round3(paper.h) + '" fill="#ffffff"/>' +
    parts.join("") + "</svg>";
}

export function addViewToSheet(doc, dir, options = {}) {
  const view = createView(dir, options);
  if (!doc.views.length) view.primary = true;
  doc.views.push(view);
  return view;
}

function independentBaseView(view) {
  return !!view && !view.section && !view.alignedSection && !view.detail && !view.auxiliary
    && (isOrthoView(view.dir) || view.dir === 'iso');
}

function viewRemovalIds(doc, id) {
  const removedIds = new Set([id]);
  // Sections/details are dependent views, including Details of Details.
  let changed = true;
  while (changed) {
    changed = false;
    for (const view of doc.views) {
      if (removedIds.has(view.id) || !(view.section || view.alignedSection || view.detail || view.auxiliary)) continue;
      if ([view.parent, view.section?.from,view.alignedSection?.from, view.detail?.from,view.auxiliary?.from].some(parent => removedIds.has(parent))) {
        removedIds.add(view.id);
        changed = true;
      }
    }
  }
  return removedIds;
}

export function canRemoveViewFromSheet(doc, id) {
  if (!(doc.views || []).some(view => view.id === id)) return false;
  const removedIds = viewRemovalIds(doc, id);
  return doc.views.some(view => !removedIds.has(view.id) && independentBaseView(view));
}

export function removeViewFromSheet(doc, id) {
  if (!doc.views.some(view => view.id === id)) return false;
  const removedIds = viewRemovalIds(doc, id);
  doc.views = doc.views.filter(view => !removedIds.has(view.id));
  doc.dims = (doc.dims || []).filter(dim => !removedIds.has(dim.viewId));
  doc.notes = (doc.notes || []).filter(note => !removedIds.has(note.leader?.viewId));
  const primary = doc.views.find(view => view.primary && independentBaseView(view))
    || doc.views.find(independentBaseView) || doc.views[0];
  for (const view of doc.views) view.primary = view === primary;
  return true;
}

export function nextSectionTag(doc) {
  const used = new Set((doc.views || []).map((view) => view.section?.tag || view.alignedSection?.tag || view.detail?.tag).filter(Boolean));
  for (const letter of "ABCDEFGHJKLMNPQRSTUV") if (!used.has(letter)) return letter;
  return "A";
}

/* Which views may be added: the six principal directions plus pictorials, minus
   the ones already on the sheet. */
export function availableViewDirs(doc) {
  const taken = new Set((doc.views || []).filter((view) => !view.section && !view.detail).map((view) => view.dir));
  return [...ORTHO_VIEWS, "iso", "isoleft"].filter((dir) => !taken.has(dir));
}

export { bomTableItems, layoutBomTable, titleBlockItems, zoneMarks };
