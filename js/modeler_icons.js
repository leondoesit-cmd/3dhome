// High-precision vector CAD icons for the Model Editor.
// Purpose-built to match the recognizable visual semantics of SolidWorks
// and professional parametric CAD environments.

function svg(paths, vb) {
  return '<svg class="md-cad-icon" viewBox="' + (vb || "0 0 20 20") + '" width="18" height="18" fill="none" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">' + paths + '</svg>';
}

function p(d, op, sw, extra) {
  return '<path d="' + d + '" fill="currentColor" fill-opacity="' + (op == null ? 0 : op) + '" stroke="currentColor" stroke-width="' + (sw || 1.35) + '" stroke-linecap="round" stroke-linejoin="round"' + (extra || "") + '/>';
}

function l(d, sw, extra) {
  return '<path d="' + d + '" fill="none" stroke="currentColor" stroke-width="' + (sw || 1.35) + '" stroke-linecap="round" stroke-linejoin="round"' + (extra || "") + '/>';
}

function colorPath(d, fill, stroke, sw, extra) {
  return '<path d="' + d + '" fill="' + (fill || "none") + '" stroke="' + (stroke || "currentColor") + '" stroke-width="' + (sw || 1.35) + '" stroke-linecap="round" stroke-linejoin="round"' + (extra || "") + '/>';
}

export const CAD_ICONS = {
  // Paper annotations have their own simple outlines; no feature/constraint marks.
  sheetline: () => l("M3 16 L17 4",1.8) + '<circle cx="3" cy="16" r="1.2" fill="currentColor"/><circle cx="17" cy="4" r="1.2" fill="currentColor"/>',
  sheetpolyline: () => l("M2 15 L7 5 L12 13 L18 4",1.8) + '<circle cx="7" cy="5" r="1.3" fill="currentColor"/><circle cx="12" cy="13" r="1.3" fill="currentColor"/>',
  sheetrect: () => l("M3 5 H17 V15 H3 Z",1.8) + l("M5 5 V7 H3",.8),
  sheetcircle: () => '<circle cx="10" cy="10" r="7" fill="none" stroke="currentColor" stroke-width="1.8"/><circle cx="10" cy="10" r="1" fill="currentColor"/>',
  sheetarc: () => l("M3 15 A7 7 0 0 1 17 15",1.8) + '<circle cx="3" cy="15" r="1.3" fill="currentColor"/><circle cx="10" cy="8" r="1.3" fill="currentColor"/><circle cx="17" cy="15" r="1.3" fill="currentColor"/>',
  sheetellipse: () => '<ellipse cx="10" cy="10" rx="8" ry="4.5" fill="none" stroke="currentColor" stroke-width="1.8"/>' + l("M10 8 V12 M8 10 H12",.8),
  insertimage: () => l("M2 3 H14 V16 H2 Z M3 13 L7 8 L11 13 M10 11 L13 8 M15 15 H19 M17 13 V17") + '<circle cx="11" cy="6" r="1" fill="currentColor"/>',
  insertprojectimage: () => l("M2 3 H13 V13 H2 Z M3 11 L6 7 L10 11 M12 14 L15 12 L18 14 L15 16 Z M12 14 V17 L15 19 L18 17 V14 M15 16 V19"),
  editimage: () => l("M2 3 H16 V10 M2 3 V16 H8 M3 13 L7 8 L11 12 M10 17 L11 13 L16 8 L19 11 L14 16 Z M15 9 L18 12"),
  saveformat: () => l("M2 2 H17 V12 M2 2 V18 H10 M4 13 H10 M7 13 V17 M13 15 H19 M16 12 V19 M14 17 L16 19 L18 17"),
  applyformat: () => l("M3 2 H17 V18 H3 Z M3 13 H17 M10 13 V18 M6 6 H14 M11 3 L14 6 L11 9"),
  savetemplate: () => l("M2 2 H11 L15 6 V12 M2 2 V17 H9 M11 2 V6 H15 M5 9 H11 M5 12 H9 M12 14 H18 V19 H12 Z M13 14 V16 H17 V14"),
  newtemplate: () => l("M3 4 H12 L16 8 V18 H3 Z M12 4 V8 H16 M6 2 H15 L18 5 M8 12 H12 M10 10 V14"),
  drawingsection: () => l("M3 4 H17 V16 H3 Z M9 2 V18",1.2) + colorPath("M6 3 L9 3 L7 5 M6 17 L9 17 L7 15","none","#2dd4bf",1.6),
  alignedsection: () => l("M3 4 H17 V16 H3 Z",1.2) + colorPath("M8 2 V10 L15 17 M5 3 H8 L6 5 M13 18 L15 17 L15 14","none","#2dd4bf",1.6),
  brokenout: () => l("M3 3 H17 V17 H3 Z M3 11 L7 9 L6 6 L11 7 L13 3 M4 14 L9 9 M7 16 L12 11",1.3),
  breakview: () => l("M2 5 H7 L5 8 L8 11 L5 14 L7 16 H2 Z M18 5 H12 L14 8 L11 11 L14 14 L12 16 H18 Z",1.5),
  layeranalysis: () => p("M3 5 L10 2 L17 5 L10 8 Z", .2) + l("M3 9 L10 12 L17 9 M3 13 L10 16 L17 13 M10 8 V16") + l("M5 5 H15", .9),
  fffslice: () => p("M7 2 H13 V6 L11 9 H9 L7 6 Z", .25) + l("M10 9 V11 M3 17 H17 M4 14 H16 M4 12 H8 M12 12 H16 M4 14 V17 M16 14 V17"),
  componentpattern: () => p("M2 2 H6 V6 H2 Z", .45) + p("M10 2 H14 V6 H10 Z M2 10 H6 V14 H2 Z M10 10 H14 V14 H10 Z", .15) + l("M7 4 H9 M4 7 V9 M15 16 H19 M17 14 V18"),
  editcomponentpattern: () => p("M2 2 H6 V6 H2 Z M10 2 H14 V6 H10 Z M2 10 H6 V14 H2 Z", .2) + l("M8 17 L10 12 L16 6 L19 9 L13 15 Z M15 7 L18 10"),
  removecomponentpattern: () => p("M2 2 H6 V6 H2 Z M10 2 H14 V6 H10 Z M2 10 H6 V14 H2 Z", .15) + l("M11 11 L18 18 M18 11 L11 18"),
  // Repeat the last committed operation: a return arrow around a small solid.
  repeatlast: function () {
    return l("M4 6 A7 7 0 1 1 3 13 M4 2 L4 6 L8 6") +
      p("M7 10 L11 8 L15 10 L15 14 L11 16 L7 14 Z", .18) +
      l("M7 10 L11 12 L15 10 M11 12 L11 16");
  },
  directcone: () => p("M10 2 L4 15 Q10 19 16 15 Z", .2) + l("M4 15 Q10 11 16 15 M10 2 L10 8"),
  refpoint: () => l("M10 2 V18 M2 10 H18") + p("M10 7 L13 10 L10 13 L7 10 Z", .35),
  sketchpoint: () => l("M3 10 H7 M13 10 H17 M10 3 V7 M10 13 V17") + p("M8 8 H12 V12 H8 Z", .4),
  sketchtext: () => l("M3 5 H17 M10 5 V17 M7 17 H13") + p("M3 3 H17 V5 H3 Z", .15),
  stocksize: () => p("M3 5 L11 2 L17 5 L9 8 Z", .2) + l("M3 5 V15 L9 18 L17 15 V5 M9 8 V18 M12 11 H16 M12 13 H15"),
  towalls: () => p("M2 6 L10 3 L18 6 L10 9 Z", .2) + l("M2 6 V15 L10 18 L18 15 V6 M10 9 V18 M5 8 V14 M15 8 V14"),
  finishpreview: () => p("M4 4 H16 V16 H4 Z", .2) + l("M4 12 L12 4 M8 16 L16 8") + colorPath("M12 12 L14 14 L18 10", "none", "#2dd4bf", 1.4),
  exportglb: () => p("M3 5 L10 2 L17 5 L10 8 Z", .2) + l("M3 5 V12 L10 15 L17 12 V5 M10 8 V15 M10 16 V19 M7 17 L10 19 L13 17"),
  equations: () => l("M3 4 H9 M6 2 V6 M3 10 H9 M3 14 H9 M13 9 H18 M13 13 H18") + p("M10 3 L12 7 L10 11 L12 15", .1),
  customprops: () => p("M4 3 H12 L16 7 V17 H4 Z", .15) + l("M12 3 V7 H16 M7 10 H13 M7 13 H13"),
  smartmates: () => p("M3 4 H9 V10 H3 Z", .15) + p("M11 10 H17 V16 H11 Z", .15) + colorPath("M8 12 L12 8 M10 8 L12 8 L12 10", "none", "#2dd4bf", 1.4),
  sheetmetal: () => l("M2 14 H10 V6 H18 M2 16 H12 V8 H18") + p("M10 6 H12 V14 H10 Z", .25),
  branch: () => l("M4 2 V12 Q4 16 8 16 H17 M4 8 Q4 12 8 12 H17") + p("M15 10 L18 12 L15 14 Z", .25),
  // ==========================================
  // 1. 3D FEATURES (SolidWorks Features)
  // ==========================================

  // Extruded Boss/Base: isometric solid block with upward material extrusion arrow
  extrude: function () {
    return (
      // Base/body isometric cube
      p("M3 13.5 L10 17 L17 13.5 L17 7.5 L10 4 L3 7.5 Z", 0.18, 1.3) +
      l("M10 4 L10 17 M3 7.5 L10 11 L17 7.5", 1.2) +
      // Top face highlighted
      p("M3 7.5 L10 4 L17 7.5 L10 11 Z", 0.45, 1.3) +
      // Upward yellow/accent extrusion arrow on right/top
      colorPath("M10 9 L10 1.5 M7.5 4 L10 1.5 L12.5 4", "none", "#e89a24", 1.65)
    );
  },

  // Extruded Cut: isometric block with pocket cut from top face and downward cut arrow
  extrudecut: function () {
    return (
      // Outer block with top pocket cut
      p("M3 13.5 L10 17 L17 13.5 L17 7.5 L13.5 5.75 L13.5 8.5 L10 10.25 L6.5 8.5 L6.5 5.75 L3 7.5 Z", 0.18, 1.3) +
      l("M10 10.25 L10 17 M3 7.5 L6.5 5.75 M17 7.5 L13.5 5.75", 1.2) +
      // Cut pocket cavity
      p("M6.5 5.75 L10 4 L13.5 5.75 L10 7.5 Z", 0.45, 1.1) +
      l("M6.5 5.75 L6.5 8.5 M13.5 5.75 L13.5 8.5 M10 7.5 L10 10.25", 1.1) +
      // Downward red cut arrow into the pocket
      colorPath("M10 1 L10 7.5 M7.5 5 L10 7.5 L12.5 5", "none", "#d0342c", 1.65)
    );
  },

  // Revolved Boss/Base: revolved cylindrical solid with dashed centerline and circular revolve arrow
  revolvefeature: function () {
    return (
      // Dashed centerline axis
      colorPath("M6 1.5 L6 18.5", "none", "#2684c7", 1.2, ' stroke-dasharray="2.5 1.5"') +
      // Revolved half-cylinder profile
      p("M6 4 L14 4 A4 1.8 0 0 1 14 16 L6 16 Z", 0.28, 1.3) +
      p("M14 4 A4 1.8 0 0 1 14 16 A4 1.8 0 0 1 14 4 Z", 0.45, 1.2) +
      // Circular revolve arrow
      colorPath("M3 10 A4.5 4.5 0 1 1 15 13.5", "none", "#e89a24", 1.5) +
      colorPath("M16 11 L15 14 L12 13", "none", "#e89a24", 1.4)
    );
  },

  /* Revolved Cut: the same lathe as revolvefeature, but the revolved profile is
     the groove taken out of a block rather than the body added. */
  revolvecutfeature: function () {
    return (
      // Block the groove is turned out of
      p("M3 3 L17 3 L17 17 L3 17 Z", 0.15, 1.3) +
      // Dashed centerline the profile turns about
      colorPath("M10 1 L10 19", "none", "#2684c7", 1.2, ' stroke-dasharray="2.5 1.5"') +
      // The turned groove, open to the right edge
      p("M17 7 L12 8.5 L12 11.5 L17 13 Z", 0.5, 1.25) +
      // Red revolve-and-remove arrow
      colorPath("M6.5 13 A4 4 0 1 0 6.5 7", "none", "#d0342c", 1.5) +
      colorPath("M5 5.5 L6.5 7 L5 8.5", "none", "#d0342c", 1.4)
    );
  },

  /* Swept Cut: the sweepfeature trajectory, driving a channel out of a face. */
  sweepcutfeature: function () {
    return (
      // The face the channel is cut into
      p("M2 6 L10 2 L18 6 L10 10 Z", 0.15, 1.25) +
      l("M2 6 L2 13 L10 17 L18 13 L18 6 M10 10 L10 17", 1.15) +
      // Guide trajectory
      colorPath("M3 8 C 7 5, 12 10, 17 7", "none", "#2684c7", 1.2, ' stroke-dasharray="2.2 1.5"') +
      // The channel the profile carves along it
      p("M3 10 C 7 7, 12 12, 17 9 L17 6.5 C 12 9.5, 7 4.5, 3 7.5 Z", 0.5, 1.2) +
      // Red remove arrow into the channel
      colorPath("M10 12.5 L10 16 M8.5 14.5 L10 16 L11.5 14.5", "none", "#d0342c", 1.5)
    );
  },

  // Swept Boss/Base: curved 3D trajectory spline with swept circular cross-section
  sweepfeature: function () {
    return (
      // Guide trajectory curve (spline)
      colorPath("M3.5 16.5 C 3.5 8, 10 12, 16.5 3.5", "none", "#2684c7", 1.2, ' stroke-dasharray="2.2 1.5"') +
      // Swept tube / profile along curve
      p("M2 15 C 2 7, 8.5 10.5, 15 2 L17.5 4.5 C 11 13, 4.5 9.5, 4.5 17.5 Z", 0.28, 1.35) +
      // Profile disc at start
      p("M2 15 C 2 13.6 3.1 12.5 4.5 12.5 C 5.9 12.5 7 13.6 7 15 C 7 16.4 5.9 17.5 4.5 17.5 C 3.1 17.5 2 16.4 2 15 Z", 0.55, 1.3) +
      // End disc
      p("M15 2 C 14.2 2.8 14.2 4.1 15 4.9 C 15.8 5.7 17.1 5.7 17.9 4.9 C 18.7 4.1 18.7 2.8 17.9 2 C 17.1 1.2 15.8 1.2 15 2 Z", 0.6, 1.2)
    );
  },

  // Lofted Boss/Base: smooth blend between bottom rectangular profile and top circular profile
  loftfeature: function () {
    return (
      // Bottom square/rectangular cross-section
      p("M3 15 L10 18 L17 15 L10 12 Z", 0.35, 1.3) +
      // Top circular/elliptical profile
      p("M10 3 C 13 3 15 4 15 5 C 15 6 13 7 10 7 C 7 7 5 6 5 5 C 5 4 7 3 10 3 Z", 0.55, 1.3) +
      // Loft blend transition ruled lines
      l("M3 15 C 4 10, 5 7, 5 5", 1.3) +
      l("M17 15 C 16 10, 15 7, 15 5", 1.3) +
      l("M10 18 C 10 12, 10 9, 10 7", 1.15, ' stroke-dasharray="2 1.5"')
    );
  },

  // Hole Wizard: counterbored hole cross-section with drill cone tip and center axis
  holefeature: function () {
    return (
      // Centerline
      colorPath("M10 1 L10 19", "none", "#2684c7", 1.1, ' stroke-dasharray="2.5 1.5"') +
      // Counterbore stepped hole cross-section
      p("M3 4 L6 4 L6 8 L8 8 L8 14 L10 16.5 L12 14 L12 8 L14 8 L14 4 L17 4", 0.15, 1.35) +
      // Surface plate lines
      l("M2 4 L6 4 M14 4 L18 4", 1.5) +
      // Counterbore step lines
      l("M6 8 L8 8 M12 8 L14 8", 1.3) +
      // Drill cone tip (118 deg)
      l("M8 14 L10 16.5 L12 14", 1.35)
    );
  },

  helixfeature: function () {
    return (
      colorPath("M10 2 C 14 4, 6 7, 10 9 C 14 11, 6 14, 10 16 C 12 17, 13 17.5, 14 18", "none", "#2684c7", 1.7) +
      l("M10 2 L10 18", 1.05) +
      p("M7 16 L10 18 L13 16", 0.2, 1.2)
    );
  },

  threadfeature: function () {
    return (
      p("M6 3 L14 3 L14 17 L6 17 Z", 0.15, 1.25) +
      l("M6 5.5 L14 6.5 M6 8 L14 9 M6 10.5 L14 11.5 M6 13 L14 14 M6 15.5 L14 16.5", 1.2) +
      colorPath("M4 3 L4 17 M16 3 L16 17", "none", "#2684c7", 1.15, ' stroke-dasharray="2 1.5"')
    );
  },

  knurlfeature: function () {
    return (
      p("M5 4 L15 4 L15 16 L5 16 Z", 0.12, 1.2) +
      l("M6 5 L14 9 M6 8 L14 12 M6 11 L14 15 M14 5 L6 9 M14 8 L6 12 M14 11 L6 15", 1.15) +
      colorPath("M5 4 L15 4 L15 16 L5 16 Z", "none", "#2684c7", 1.35)
    );
  },

  insertfeature: function () {
    return (
      p("M4 5 L16 5 L16 15 L4 15 Z", 0.2, 1.25) +
      p("M7 5 L13 5 L13 15 L7 15 Z", 0.7, 1.15) +
      colorPath("M4 5 L16 5 L16 15 L4 15 Z", "none", "#c4a35a", 1.4)
    );
  },

  config: function () {
    return (
      p("M3 5 L9 5 L9 15 L3 15 Z", 0.2, 1.2) +
      p("M11 5 L17 5 L17 15 L11 15 Z", 0.45, 1.2) +
      l("M6 8 L6 12 M14 8 L14 12", 1.3)
    );
  },

  // Fillet: isometric 90° solid corner with smooth rounded arc fillet and radius arrow
  filletfeature: function () {
    return (
      // Base corner with rounded fillet edge
      p("M3 17 L10 17 L17 10 L17 3 L10 3 C 5 3, 3 5, 3 10 Z", 0.25, 1.35) +
      // Original sharp corner ghost
      colorPath("M3 10 L3 3 L10 3", "none", "#8899aa", 1.1, ' stroke-dasharray="1.8 1.5"') +
      // Fillet tangent lines
      l("M10 3 L10 10 L3 10 M10 10 L17 10", 1.15) +
      // Rounded arc highlight (blue)
      colorPath("M3 10 C 3 5, 5 3, 10 3", "none", "#2684c7", 1.85) +
      // Radius 'R' dimension indicator
      colorPath("M5 5 L8 8", "none", "#2684c7", 1.2) +
      '<circle cx="8" cy="8" r="0.9" fill="#2684c7"/>'
    );
  },

  // Chamfer: isometric 90° corner with 45° beveled flat cut
  chamferfeature: function () {
    return (
      // Base corner with beveled chamfer face
      p("M3 17 L10 17 L17 10 L17 3 L12 3 L3 12 Z", 0.25, 1.35) +
      // Original sharp corner ghost
      colorPath("M3 12 L3 3 L12 3", "none", "#8899aa", 1.1, ' stroke-dasharray="1.8 1.5"') +
      // Chamfer bevel edge highlight
      colorPath("M3 12 L12 3", "none", "#e89a24", 1.85) +
      l("M12 3 L17 8 L8 17 L3 12", 1.15)
    );
  },

  // Shell: isometric open hollow box with uniform thin wall thickness
  shellfeature: function () {
    return (
      // Outer box
      p("M2 13.5 L10 17.5 L18 13.5 L18 6.5 L10 2.5 L2 6.5 Z", 0.15, 1.3) +
      l("M10 2.5 L10 17.5 M2 6.5 L10 10.5 L18 6.5", 1.15) +
      // Inner hollow cavity wall cutout
      p("M4 6.5 L10 3.5 L16 6.5 L10 9.5 Z", 0.45, 1.2) +
      l("M4 6.5 L4 12 L10 15 L16 12 L16 6.5", 1.25) +
      l("M10 9.5 L10 15", 1.15)
    );
  },

  /* Draft: a wall leaning off vertical, with the neutral plane it pivots on
     drawn as the dashed line at the top and the pull direction as the arrow. */
  domefeature: function () { return p("M3 13 A7 9 0 0 1 17 13 L17 15 Q10 19 3 15 Z",.2)+l("M3 13 Q10 17 17 13 M10 4 Q14 8 13 14",1); },
  dynamicmirror: function () { return l("M10 2 V18",1,' stroke-dasharray="2 2"')+p("M3 5 L7 9 L3 13 Z",.15)+p("M17 5 L13 9 L17 13 Z",.35)+l("M5 16 H15 M13 14 L15 16 L13 18"); },
  draftfeature: function () {
    return (
      // Tapered block: the right wall leans in going down, the left stays square
      p("M5 4 L15 4 L12.5 16 L7.5 16 Z", 0.2, 1.3) +
      // The vertical the drafted wall is measured against
      colorPath("M15 4 L15 16", "none", "#8899aa", 1.1, ' stroke-dasharray="1.8 1.5"') +
      // Neutral plane: the parting line the wall pivots on
      colorPath("M2.5 4 L17.5 4", "none", "#2684c7", 1.3, ' stroke-dasharray="2.5 1.5"') +
      // The draft angle itself, between the wall and the vertical
      colorPath("M15 10 A6 6 0 0 0 13.75 10", "none", "#e89a24", 1.5) +
      // Pull direction
      colorPath("M10 16.5 L10 18.5 M10 1.5 L10 3.5 M8 3.5 L10 1.5 L12 3.5", "none", "#e89a24", 1.5)
    );
  },

  /* Split Body: one isometric block parted along a plane, the two halves drawn
     apart so it reads as two bodies rather than one scored one. */
  splitbodyfeature: function () {
    return (
      // the half above the plane, lifted clear
      p("M3 7 L10 10 L17 7 L17 3.5 L10 0.5 L3 3.5 Z", 0.3, 1.2) +
      // and the half below it
      p("M3 16 L10 19 L17 16 L17 12.5 L10 9.5 L3 12.5 Z", 0.15, 1.2) +
      // the parting plane between them
      colorPath("M1.5 11 L18.5 11", "none", "#2684c7", 1.4, ' stroke-dasharray="2.6 1.6"')
    );
  },

  /* Move / Copy Body: a block and its ghost, with the offset arrow between. */
  movebodyfeature: function () {
    return (
      // the body where it was
      p("M1.5 13 L7 15.5 L12.5 13 L12.5 8 L7 5.5 L1.5 8 Z", 0.12, 1.15, ' stroke-dasharray="2.2 1.6"') +
      // and where it lands
      p("M7 15 L12.5 17.5 L18 15 L18 10 L12.5 7.5 L7 10 Z", 0.35, 1.25) +
      // the move itself
      colorPath("M6 4 L14 4 M11.6 1.8 L14 4 L11.6 6.2", "none", "#e89a24", 1.5)
    );
  },

  /* Rib: a triangular web bridging a floor and an upright wall — the shape a
     brace actually takes — with the amber gauge across it for the thickness. */
  ribfeature: function () {
    return (
      // the corner the rib braces: a floor and an upright
      l("M2.5 16.5 L17.5 16.5 M4.5 16.5 L4.5 3", 1.35) +
      // the web itself
      p("M5.5 15.5 L14.5 15.5 L5.5 5 Z", 0.35, 1.25) +
      // the thickness the feature is defined by
      colorPath("M8 12 L11.5 13.6 M8 12 L8 10.4 M11.5 13.6 L11.5 15.2", "none", "#e89a24", 1.3)
    );
  },

  /* Thicken: a surface sheet given a depth. The bright diamond is the face the
     feature starts from; the faint body under it is the slab it becomes, and
     the amber double arrow is the thickness that separates them. */
  thickenfeature: function () {
    return (
      // the sheet being thickened
      p("M3 7.5 L10 4 L17 7.5 L10 11 Z", 0.45, 1.3) +
      // the solid it becomes: the same sheet carried down by its thickness
      p("M3 7.5 L3 11.5 L10 15 L17 11.5 L17 7.5 L10 11 Z", 0.15, 1.3) +
      l("M10 11 L10 15", 1.15) +
      // witness lines out to the dimension
      colorPath("M17 7.5 L18.6 7.9 M17 11.5 L18.6 11.9", "none", "#8899aa", 1, ' stroke-dasharray="1.6 1.2"') +
      // the thickness itself
      colorPath("M18.6 7.9 L18.6 11.9 M17.6 8.9 L18.6 7.9 L19.6 8.9 M17.6 10.9 L18.6 11.9 L19.6 10.9", "none", "#e89a24", 1.3)
    );
  },

  // Linear Pattern: 2x2 grid array of feature blocks with X and Y direction vectors
  patternfeature: function () {
    return (
      // 4 feature blocks (2x2)
      p("M3 7 L6 8.5 L9 7 L9 4 L6 2.5 L3 4 Z", 0.55, 1.15) +
      p("M11 7 L14 8.5 L17 7 L17 4 L14 2.5 L11 4 Z", 0.25, 1.15) +
      p("M3 15 L6 16.5 L9 15 L9 12 L6 10.5 L3 12 Z", 0.25, 1.15) +
      p("M11 15 L14 16.5 L17 15 L17 12 L14 10.5 L11 12 Z", 0.25, 1.15) +
      // Direction 1 vector arrow (X)
      colorPath("M6 5.5 L13 5.5 M11 4 L13 5.5 L11 7", "none", "#2684c7", 1.4) +
      // Direction 2 vector arrow (Y)
      colorPath("M6 5.5 L6 12.5 M4.5 10.5 L6 12.5 L7.5 10.5", "none", "#2684c7", 1.4)
    );
  },

  // Circular Pattern: radial array of entities around center axis with circular rotation arrow
  circpattern: function () {
    return (
      // Center reference axis point
      '<circle cx="10" cy="10" r="1.5" fill="#2684c7"/>' +
      // Radial circle track
      colorPath("M10 3 A7 7 0 1 1 3 10", "none", "#2684c7", 1.1, ' stroke-dasharray="2 1.5"') +
      // Circular rotation arrow
      colorPath("M10 3 A7 7 0 0 1 17 10", "none", "#e89a24", 1.4) +
      colorPath("M18 8 L17 10.5 L14.5 9.5", "none", "#e89a24", 1.3) +
      // 4 arrayed instances
      '<circle cx="10" cy="3" r="1.8" fill="currentColor"/>' +
      '<circle cx="17" cy="10" r="1.8" fill="currentColor"/>' +
      '<circle cx="10" cy="17" r="1.8" fill="currentColor"/>' +
      '<circle cx="3" cy="10" r="1.8" fill="currentColor"/>'
    );
  },

  // Mirror: feature solid on left reflected across dashed mirror plane to right
  mirrorfeature: function () {
    return (
      // Vertical mirror plane (dashed)
      colorPath("M10 1.5 L10 18.5", "none", "#2684c7", 1.3, ' stroke-dasharray="2.5 1.5"') +
      // Left solid shape
      p("M2 13 L6 15 L8 13 L8 7 L4 5 L2 7 Z", 0.45, 1.25) +
      l("M2 7 L6 9 L8 7 M6 9 L6 15", 1.1) +
      // Right mirrored solid shape (translucent)
      p("M18 13 L14 15 L12 13 L12 7 L16 5 L18 7 Z", 0.2, 1.25) +
      l("M18 7 L14 9 L12 7 M14 9 L14 15", 1.1) +
      // Reflection arrow
      colorPath("M5 10 L15 10 M7 8.5 L5 10 L7 11.5 M13 8.5 L15 10 L13 11.5", "none", "#e89a24", 1.2)
    );
  },

  // Boolean / Combine: two intersecting solids with union/intersection highlight
  booleanfeature: function () {
    return (
      // Left body
      p("M3 13 L7 15 L11 13 L11 7 L7 5 L3 7 Z", 0.25, 1.25) +
      // Right body overlapping
      p("M9 15 L13 17 L17 15 L17 9 L13 7 L9 9 Z", 0.25, 1.25) +
      // Intersecting overlap zone
      p("M9 13 L11 13 L11 9 L9 9 Z", 0.65, 1.3, ' stroke="#2684c7"')
    );
  },

  // Reference Plane: tilted rectangular datum plane with 4 corner handles and normal
  refplane: function () {
    return (
      // Angled datum plane
      p("M3 14 L11 17 L17 6 L9 3 Z", 0.22, 1.3, ' stroke="#2684c7"') +
      // Grid lines on datum plane
      colorPath("M7 8.5 L14 11.5 M6 15.5 L13 4.5", "none", "#2684c7", 1.05, ' opacity="0.6"') +
      // 4 corner vertex handles
      '<circle cx="3" cy="14" r="1.1" fill="#2684c7"/>' +
      '<circle cx="11" cy="17" r="1.1" fill="#2684c7"/>' +
      '<circle cx="17" cy="6" r="1.1" fill="#2684c7"/>' +
      '<circle cx="9" cy="3" r="1.1" fill="#2684c7"/>'
    );
  },

  // Reference Axis: dashed centerline datum axis with dual arrows
  refaxis: function () {
    return (
      // Centerline with end arrows
      colorPath("M4 16 L16 4", "none", "#2684c7", 1.4, ' stroke-dasharray="3 1.5"') +
      colorPath("M4 12 L4 16 L8 16", "none", "#2684c7", 1.4) +
      colorPath("M12 4 L16 4 L16 8", "none", "#2684c7", 1.4) +
      '<circle cx="10" cy="10" r="1.2" fill="#2684c7"/>'
    );
  },

  // Coordinate System: 3D origin triad with X, Y, Z orthogonal axes
  coordsys: function () {
    return (
      // Origin point
      '<circle cx="6" cy="14" r="1.3" fill="currentColor"/>' +
      // X axis (Red / horizontal)
      colorPath("M6 14 L17 14 M14.5 12 L17 14 L14.5 16", "none", "#d0342c", 1.5) +
      // Y axis (Green / vertical)
      colorPath("M6 14 L6 3 M4 5.5 L6 3 L8 5.5", "none", "#17834f", 1.5) +
      // Z axis (Blue / angled isometric)
      colorPath("M6 14 L13 8 M10.5 8 L13 8 L13 10.5", "none", "#2684c7", 1.5)
    );
  },

  // Toolbox Screw / Fastener: hex-socket cap screw with threads
  stdscrew: function () {
    return (
      // Cylindrical screw head
      p("M5 3 L15 3 L15 7 L5 7 Z", 0.45, 1.3) +
      // Hex socket in head
      p("M8 4 L12 4 L13 5 L12 6 L8 6 L7 5 Z", 0.9, 1.1) +
      // Unthreaded shank
      p("M7 7 L13 7 L13 10 L7 10 Z", 0.25, 1.25) +
      // Threaded shank & point
      p("M7 10 L13 10 L13 16 L10 18 L7 16 Z", 0.35, 1.25) +
      // Helical thread lines
      l("M7 11.5 L13 12.5 M7 13.5 L13 14.5 M7 15.5 L13 16.5", 1.15)
    );
  },

  // Toolbox Fastener: standards library drawer the fastener is pulled from
  toolboxfastener: function () {
    return (
      // Fastener taken out of the library
      p("M6 1.5 L14 1.5 L14 4 L6 4 Z", 0.5, 1.25) +
      p("M8.5 4 L11.5 4 L11.5 7 L10 8.6 L8.5 7 Z", 0.3, 1.2) +
      l("M8.5 5.2 L11.5 5.8 M8.5 6.7 L11.5 7.3", 1.05) +
      // Library drawer cabinet
      p("M2 10.5 L18 10.5 L18 18.5 L2 18.5 Z", 0.15, 1.3) +
      l("M2 14.5 L18 14.5", 1.2) +
      colorPath("M8 12.5 L12 12.5 M8 16.5 L12 16.5", "none", "#e89a24", 1.35)
    );
  },

  // Toolbox Gear: precision spur gear with involute teeth and center bore
  stdgear: function () {
    var teeth = 8, d = "", step = 360 / teeth, rRoot = 5.2, rTip = 8.4, rHole = 2.4;
    for (var i = 0; i < teeth; i++) {
      var a = (i * step - 90) * Math.PI / 180;
      var a1 = (i * step - 90 - step * 0.22) * Math.PI / 180;
      var a2 = (i * step - 90 - step * 0.1) * Math.PI / 180;
      var a3 = (i * step - 90 + step * 0.1) * Math.PI / 180;
      var a4 = (i * step - 90 + step * 0.22) * Math.PI / 180;
      var p1 = [10 + rRoot * Math.cos(a1), 10 + rRoot * Math.sin(a1)];
      var p2 = [10 + rTip * Math.cos(a2), 10 + rTip * Math.sin(a2)];
      var p3 = [10 + rTip * Math.cos(a3), 10 + rTip * Math.sin(a3)];
      var p4 = [10 + rRoot * Math.cos(a4), 10 + rRoot * Math.sin(a4)];
      d += (i ? " L" : "M") + p1[0].toFixed(1) + " " + p1[1].toFixed(1) +
           " L" + p2[0].toFixed(1) + " " + p2[1].toFixed(1) +
           " L" + p3[0].toFixed(1) + " " + p3[1].toFixed(1) +
           " L" + p4[0].toFixed(1) + " " + p4[1].toFixed(1);
    }
    d += " Z";
    return (
      p(d, 0.35, 1.3) +
      '<circle cx="10" cy="10" r="' + rHole + '" fill="var(--bg-panel, #fff)" stroke="currentColor" stroke-width="1.3"/>' +
      '<rect x="9.3" y="7" width="1.4" height="2" fill="currentColor"/>'
    );
  },

  // Direct Primitives
  directbox: function () {
    return (
      p("M3 13.5 L10 17 L17 13.5 L17 7.5 L10 4 L3 7.5 Z", 0.22, 1.3) +
      l("M10 4 L10 17 M3 7.5 L10 11 L17 7.5", 1.2) +
      p("M3 7.5 L10 4 L17 7.5 L10 11 Z", 0.45, 1.3)
    );
  },
  directcyl: function () {
    return (
      p("M4 6 L4 14 A6 2.5 0 0 0 16 14 L16 6 A6 2.5 0 0 0 4 6 Z", 0.25, 1.3) +
      p("M4 6 A6 2.5 0 1 0 16 6 A6 2.5 0 1 0 4 6 Z", 0.55, 1.3)
    );
  },
  directsph: function () {
    return (
      '<circle cx="10" cy="10" r="7" fill="currentColor" fill-opacity="0.2" stroke="currentColor" stroke-width="1.35"/>' +
      '<ellipse cx="10" cy="10" rx="7" ry="2.6" fill="none" stroke="currentColor" stroke-width="1.15"/>' +
      '<ellipse cx="10" cy="10" rx="2.6" ry="7" fill="none" stroke="currentColor" stroke-width="1.15"/>'
    );
  },
  directpoly: function () {
    return (
      p("M4 7 L10 3.5 L16 7 L16 13 L10 16.5 L4 13 Z", 0.25, 1.3) +
      p("M4 7 L10 3.5 L16 7 L10 10.5 Z", 0.5, 1.25) +
      l("M10 10.5 L10 16.5", 1.25)
    );
  },
  directrev: function () {
    return (
      '<ellipse cx="10" cy="10" rx="7.5" ry="3.8" fill="currentColor" fill-opacity="0.15" stroke="currentColor" stroke-width="1.35"/>' +
      '<ellipse cx="10" cy="10" rx="3.2" ry="1.6" fill="var(--bg-panel, #fff)" stroke="currentColor" stroke-width="1.3"/>' +
      colorPath("M6 5 A7 3.5 0 0 1 15 7.5", "none", "#e89a24", 1.4) +
      colorPath("M15.5 5.5 L15 8 L12.5 7.5", "none", "#e89a24", 1.3)
    );
  },

  // ==========================================
  // 2. 2D SKETCH TOOLS (SolidWorks Sketch)
  // ==========================================

  // New Sketch: tilted sketch plane with drafting pencil sketching a line
  newsketch: function () {
    return (
      // Tilted sketch plane
      p("M2 14 L8 17 L17 9 L11 6 Z", 0.18, 1.25, ' stroke="#2684c7"') +
      colorPath("M5 10 L14 6", "none", "#2684c7", 1.1, ' stroke-dasharray="1.8 1.5"') +
      // Drafting pencil
      colorPath("M14 2 L17 5 L9 13 L6 14 L7 11 Z", "#e89a24", "#e89a24", 1.25) +
      colorPath("M6 14 L8 12", "none", "#333", 1.2)
    );
  },

  // Finish / Exit Sketch: SolidWorks Confirmation Corner exit sketch icon
  finishsketch: function () {
    return (
      // Sketch sheet grid
      p("M3 16 L12 16 L12 4 L3 4 Z", 0.15, 1.3) +
      l("M6 4 L6 16 M9 4 L9 16 M3 8 L12 8 M3 12 L12 12", 0.9, ' opacity="0.6"') +
      // Green checkmark in upper corner
      colorPath("M10 10 L13 13 L18 6", "none", "#17834f", 2.2)
    );
  },

  // Select / Pointer: precision CAD selection cursor arrow
  select: function () {
    return (
      colorPath("M4 2.5 L4 16 L8 12.5 L11.5 17.5 L13.5 16 L10 11 L14.5 11 Z", "currentColor", "currentColor", 1.3, ' fill-opacity="0.85"')
    );
  },

  // Line tool: slanted line segment with 2 endpoint vertex dots
  wall: function () {
    return (
      l("M4 16 L16 4", 1.6) +
      '<circle cx="4" cy="16" r="2" fill="#2684c7" stroke="currentColor" stroke-width="1.2"/>' +
      '<circle cx="16" cy="4" r="2" fill="#2684c7" stroke="currentColor" stroke-width="1.2"/>'
    );
  },

  // Corner Rectangle: rectangle with diagonal corner vertices 1 and 2
  centerrectangle: function () {
    return p("M3 5 L17 5 L17 15 L3 15 Z", 0.18, 1.35) +
      '<path d="M3 5L17 15M3 15L17 5" fill="none" stroke="currentColor" stroke-width=".8" stroke-dasharray="2 1"/>' +
      '<circle cx="10" cy="10" r="2" fill="#2684c7" stroke="currentColor" stroke-width="1.2"/>';
  },
  faceboundary: function () {
    return p("M2 3H18V17H2Z",0.1,1) + '<rect x="5" y="6" width="10" height="8" rx="2" fill="none" stroke="currentColor" stroke-width="1.5"/><path d="M2 10H5M15 10H18" stroke="#2684c7" stroke-width="1.5"/>';
  },
  srect: function () {
    return (
      p("M3 5 L17 5 L17 15 L3 15 Z", 0.18, 1.35) +
      // Corner vertex 1 (top-left)
      '<circle cx="3" cy="5" r="2" fill="#2684c7" stroke="currentColor" stroke-width="1.2"/>' +
      // Corner vertex 2 (bottom-right)
      '<circle cx="17" cy="15" r="2" fill="#2684c7" stroke="currentColor" stroke-width="1.2"/>'
    );
  },

  // Center Circle: circle with center point cross '+' and perimeter radius point
  scirc: function () {
    return (
      '<circle cx="10" cy="10" r="7" fill="currentColor" fill-opacity="0.15" stroke="currentColor" stroke-width="1.35"/>' +
      // Center crosshair
      l("M8.5 10 L11.5 10 M10 8.5 L10 11.5", 1.3, ' stroke="#2684c7"') +
      // Radius perimeter point
      '<circle cx="16.5" cy="10" r="1.8" fill="#2684c7" stroke="currentColor" stroke-width="1.1"/>'
    );
  },

  // 3-Point Arc: start, through, end — no centre mark, so it is not the centerpoint arc
  arc3point: function () {
    return (
      colorPath("M3 15 A7 7 0 0 1 17 15", "none", "currentColor", 1.6) +
      '<circle cx="3" cy="15" r="1.9" fill="#2684c7" stroke="currentColor" stroke-width="1.1"/>' +
      '<circle cx="10" cy="8" r="1.9" fill="#2684c7" stroke="currentColor" stroke-width="1.1"/>' +
      '<circle cx="17" cy="15" r="1.9" fill="#2684c7" stroke="currentColor" stroke-width="1.1"/>'
    );
  },

  // Tangent Arc: a line, then an arc that leaves its endpoint
  tangentarc: function () {
    return (
      l("M2 15 L11 15", 1.5) +
      colorPath("M11 15 C 11 7, 18 7, 18 15", "none", "#2684c7", 1.6) +
      '<circle cx="11" cy="15" r="1.8" fill="#2684c7" stroke="currentColor" stroke-width="1.1"/>'
    );
  },

  // Centerpoint Arc: centre, start and end
  sarc: function () {
    return (
      colorPath("M3 15 A7 7 0 0 1 17 15", "none", "currentColor", 1.6) +
      colorPath("M3 15 H17", "none", "#2684c7", .8, ' stroke-dasharray="2 1.5"') +
      '<circle cx="3" cy="15" r="1.4" fill="#2684c7" stroke="currentColor" stroke-width="1"/>' +
      '<circle cx="10" cy="15" r="1.9" fill="#2684c7" stroke="currentColor" stroke-width="1.1"/>' +
      '<circle cx="17" cy="15" r="1.4" fill="#2684c7" stroke="currentColor" stroke-width="1"/>'
    );
  },

  // Straight Slot: oblong slot with centerline, semicircle ends, and 4 points
  sslot: function () {
    return (
      p("M6 6 L14 6 A4 4 0 0 1 14 14 L6 14 A4 4 0 0 1 6 6 Z", 0.2, 1.35) +
      // Centerline
      colorPath("M6 10 L14 10", "none", "#2684c7", 1.2, ' stroke-dasharray="2 1.5"') +
      '<circle cx="6" cy="10" r="1.6" fill="#2684c7"/>' +
      '<circle cx="14" cy="10" r="1.6" fill="#2684c7"/>'
    );
  },

  // Regular Polygon: hexagon with inscribed circle & center point
  spoly: function () {
    return (
      p("M10 2.5 L16.5 6.2 L16.5 13.8 L10 17.5 L3.5 13.8 L3.5 6.2 Z", 0.18, 1.35) +
      colorPath("M10 5.5 A4.5 4.5 0 1 1 9.9 5.5", "none", "#2684c7", 1.05, ' stroke-dasharray="1.8 1.5"') +
      '<circle cx="10" cy="10" r="1.4" fill="#2684c7"/>'
    );
  },

  dimensionedpolygon: function () {
    return CAD_ICONS.spoly() + colorPath("M2 18.5 H18 M2 17.5 V19.5 M18 17.5 V19.5", "none", "#2684c7", 0.8);
  },

  // Ellipse: major axis, minor axis, and center point
  sell: function () {
    return (
      '<ellipse cx="10" cy="10" rx="8" ry="5" fill="currentColor" fill-opacity="0.18" stroke="currentColor" stroke-width="1.35"/>' +
      // Major axis line
      colorPath("M2 10 L18 10", "none", "#2684c7", 1.05, ' stroke-dasharray="2 1.5"') +
      // Minor axis line
      colorPath("M10 5 L10 15", "none", "#2684c7", 1.05, ' stroke-dasharray="2 1.5"') +
      '<circle cx="10" cy="10" r="1.3" fill="#2684c7"/>'
    );
  },

  // Smart Dimension: extension lines, double-headed dimension line, and callout
  dim: function () {
    return (
      // Witness extension lines
      l("M3 2 L3 13 M17 2 L17 13", 1.25) +
      // Dimension line with arrowheads
      colorPath("M3 7.5 L17 7.5 M6 5.5 L3 7.5 L6 9.5 M14 5.5 L17 7.5 L14 9.5", "none", "#2684c7", 1.4) +
      // Dimension numerical value box
      p("M7.5 12 L12.5 12 L12.5 17.5 L7.5 17.5 Z", 0.85, 1.15, ' fill="var(--bg-panel, #fff)" stroke="#2684c7"') +
      l("M9 14.7 L11 14.7", 1.2, ' stroke="#2684c7"')
    );
  },

  // Measure: two picked points on a model corner with the measured span
  // between them. Deliberately unlike `dim` — that one draws witness lines and
  // a value box for a driving sketch dimension; this one is an inspection of a
  // solid that changes nothing.
  measure: function () {
    return (
      // The corner of the body being measured
      l("M2 5.5 L2 18 L14.5 18", 1.3) +
      // The measured span, arrowed at both picks
      colorPath("M5.9 14.6 L14.1 6.4 M5.9 14.6 L6.3 11.6 M5.9 14.6 L8.9 14.2 M14.1 6.4 L13.7 9.4 M14.1 6.4 L11.1 6.8", "none", "#2684c7", 1.3) +
      // The two picked points
      '<circle cx="4.6" cy="15.9" r="1.9" fill="currentColor" fill-opacity="0.3" stroke="#2684c7" stroke-width="1.3"/>' +
      '<circle cx="15.4" cy="5.1" r="1.9" fill="currentColor" fill-opacity="0.3" stroke="#2684c7" stroke-width="1.3"/>'
    );
  },

  // Sketch Fillet: two lines meeting at a vertex, replaced by a tangent arc
  sketchfillet: function () {
    return (
      l("M3 17 L3 10") +
      l("M10 3 L17 3") +
      colorPath("M3 10 C 3 5, 5 3, 10 3", "none", "#2684c7", 1.85) +
      colorPath("M5 5 L8 8", "none", "#2684c7", 1.2) +
      '<circle cx="8" cy="8" r="0.9" fill="#2684c7"/>'
    );
  },

  // Trim Entities: scissors cutting across a sketch curve with trim dash
  trim: function () {
    return (
      // Red sketch line to be trimmed
      colorPath("M2 14 L8 14", "none", "#d0342c", 1.5) +
      colorPath("M8 14 L18 14", "none", "#d0342c", 1.3, ' stroke-dasharray="2 1.8"') +
      // Scissors cutting line
      l("M7 5 L13 11 M13 5 L7 11", 1.45) +
      '<circle cx="5.5" cy="4" r="2" fill="none" stroke="currentColor" stroke-width="1.25"/>' +
      '<circle cx="14.5" cy="4" r="2" fill="none" stroke="currentColor" stroke-width="1.25"/>'
    );
  },

  // Extend Entities: line segment extending with arrow to meet target boundary
  extend: function () {
    return (
      // Target boundary edge line
      l("M16 2 L16 18", 1.6) +
      // Source segment
      l("M3 10 L10 10", 1.45) +
      // Extension arrow & dashed path
      colorPath("M10 10 L15 10 M12.5 7.5 L15 10 L12.5 12.5", "none", "#2684c7", 1.5)
    );
  },

  // Offset Entities: base curve and equidistant offset curve with bidirectional arrows
  offset: function () {
    return (
      // Base curve
      l("M3 15 C 3 9, 9 5, 17 5", 1.55) +
      // Offset curve
      colorPath("M6 17 C 6 12, 12 8, 18 8", "none", "#2684c7", 1.35, ' stroke-dasharray="2.5 1.5"') +
      // Bidirectional offset distance arrows
      colorPath("M8 10 L11 13 M8.5 10 L8 10 L8 11.5 M10.5 13 L11 13 L11 11.5", "none", "#e89a24", 1.25)
    );
  },

  // Construction Geometry: long-dash short-dash centerline
  constr: function () {
    return (
      colorPath("M2 10 L7 10", "none", "#2684c7", 1.5) +
      '<circle cx="10" cy="10" r="1.3" fill="#2684c7"/>' +
      colorPath("M13 10 L18 10", "none", "#2684c7", 1.5) +
      // Perpendicular centerline tick mark
      colorPath("M10 6 L10 8 M10 12 L10 14", "none", "#2684c7", 1.2)
    );
  },

  // Convert / Project Entities: 3D model edge projecting down onto sketch plane
  project: function () {
    return (
      // 3D model edge in space
      l("M4 4 L14 4", 1.6) +
      // Projection downward rays
      colorPath("M4 4 L4 14 M14 4 L14 14", "none", "#2684c7", 1.1, ' stroke-dasharray="2 1.5"') +
      // Projected sketch plane entity
      colorPath("M4 14 L14 14", "none", "#17834f", 1.8) +
      // Downward projection arrow
      colorPath("M9 6 L9 12 M7 10 L9 12 L11 10", "none", "#2684c7", 1.35)
    );
  },

  // ==========================================
  // 3. EVALUATE TOOLS (SolidWorks Evaluate)
  // ==========================================

  // Rebuild / Regenerate: SolidWorks Rebuild Traffic Light (Red & Green)
  regen: function () {
    return (
      // Traffic light housing
      p("M6 2 L14 2 L14 18 L6 18 Z", 0.45, 1.3) +
      // Red stop light
      '<circle cx="10" cy="6" r="2.3" fill="#d0342c" stroke="#fff" stroke-width="0.8"/>' +
      // Green go light (rebuilt)
      '<circle cx="10" cy="14" r="2.3" fill="#17834f" stroke="#fff" stroke-width="0.8"/>'
    );
  },

  // Zoom to Fit: magnifying glass with four corner arrows pointing outward
  fit: function () {
    return (
      '<circle cx="9" cy="9" r="5" fill="currentColor" fill-opacity="0.1" stroke="currentColor" stroke-width="1.3"/>' +
      l("M13 13 L17.5 17.5", 1.6) +
      // 4 outward fit arrows
      colorPath("M6 3 L3 3 L3 6", "none", "#2684c7", 1.25) +
      colorPath("M12 3 L15 3 L15 6", "none", "#2684c7", 1.25) +
      colorPath("M3 12 L3 15 L6 15", "none", "#2684c7", 1.25)
    );
  },

  // Make Drawing from Part: 2D engineering drawing sheet with 3 orthographic views + Iso
  drawing: function () {
    return (
      // Drawing sheet border
      p("M2 2 L18 2 L18 18 L2 18 Z", 0.15, 1.3) +
      // Title block in bottom right
      p("M11 14 L18 14 L18 18 L11 18 Z", 0.4, 1.1) +
      // Top view box
      p("M4 4 L8 4 L8 7 L4 7 Z", 0.25, 1.1) +
      // Front view box
      p("M4 9 L8 9 L8 14 L4 14 Z", 0.25, 1.1) +
      // Right view box
      p("M10 9 L15 9 L15 12 L10 12 Z", 0.25, 1.1) +
      // Isometric view
      p("M12 4 L14.5 5.5 L17 4 L14.5 2.5 Z", 0.45, 1.05)
    );
  },

  // Mass Properties: dual-pan balance scale with center-of-mass centroid marker
  mass: function () {
    return (
      // Central balance pillar & base
      l("M10 2 L10 17 M6 17 L14 17", 1.35) +
      // Top balance beam
      l("M4 6 L16 6", 1.35) +
      // Left pan & chains
      l("M4 6 L2 12 L6 12 Z", 1.15) +
      // Right pan & chains
      l("M16 6 L14 12 L18 12 Z", 1.15) +
      // Centroid marker at center
      '<circle cx="10" cy="10" r="2" fill="#e89a24" stroke="currentColor" stroke-width="1"/>'
    );
  },

  // Standards Audit / Design Checker: validation badge with checkmark
  standards: function () {
    return (
      // Shield / certificate badge
      p("M10 2 L17 5 L17 11 C 17 15.5, 10 18.5, 10 18.5 C 10 18.5, 3 15.5, 3 11 L3 5 Z", 0.22, 1.35) +
      // Validation checkmark
      colorPath("M6.5 10.5 L9 13 L13.5 7.5", "none", "#17834f", 1.85)
    );
  },

  // Appearance / Paint Tool: 3D face being colored with angled paintbrush and color swatch dab
  paint: function () {
    return (
      // Face patch being painted
      p("M2 13 L8 16 L15 13 L9 10 Z", 0.35, 1.2) +
      // Paint stroke / color dab on face
      colorPath("M5 13 C 7 14, 10 13, 12 12.5", "none", "#3b82f6", 2) +
      // Angled paintbrush handle
      colorPath("M17 2 L13 6", "none", "#d97706", 1.8) +
      // Ferrule (metal collar)
      p("M13 6 L14 7 L12 9 L11 8 Z", 0.6, 1.2) +
      // Brush tip bristles touching the face
      colorPath("M11 8 C 10 9, 8 11.5, 7.5 13 C 8.5 12.5, 10.5 11, 12 9 Z", "#3b82f6", "#2563eb", 1.2)
    );
  },

  // 3D Notes / Annotation: callout note card with leader pointer line and anchor dot
  note: function () {
    return (
      // Anchor dot on 3D model surface
      colorPath("M4 16 A 1.5 1.5 0 1 1 4 13 A 1.5 1.5 0 1 1 4 16 Z", "#2563eb", "#2563eb", 1.2) +
      // Leader line from anchor to card
      colorPath("M4 14.5 L8 10", "none", "#2563eb", 1.3, ' stroke-dasharray="2 1.2"') +
      // Note callout card
      p("M8 3 L18 3 L18 12 L10 12 L8 14 Z", 0.25, 1.3) +
      // Text indicator lines inside note card
      l("M11 6 L15 6", 1.2) +
      l("M11 9 L16 9", 1.2)
    );
  },

  // Pack and Go (Bundle, export): taped package box with material leaving it
  bundle: function () {
    return (
      p("M3 9 L10 5.5 L17 9 L17 15 L10 18.5 L3 15 Z", 0.2, 1.3) +
      l("M10 5.5 L10 18.5 M3 9 L10 12.5 L17 9", 1.2) +
      // Strapping / box tape
      colorPath("M6.5 7.25 L6.5 16.75 M13.5 7.25 L13.5 16.75", "none", "#e89a24", 1.2) +
      // Out-bound transfer arrow (matches stepout)
      colorPath("M10 9.5 L10 1 M7.5 3.5 L10 1 L12.5 3.5", "none", "#e89a24", 1.65)
    );
  },

  // Import Bundle: the same package box with the transfer arrow coming back in
  bundlein: function () {
    return (
      p("M3 9 L10 5.5 L17 9 L17 15 L10 18.5 L3 15 Z", 0.2, 1.3) +
      l("M10 5.5 L10 18.5 M3 9 L10 12.5 L17 9", 1.2) +
      // Strapping / box tape
      colorPath("M6.5 7.25 L6.5 16.75 M13.5 7.25 L13.5 16.75", "none", "#e89a24", 1.2) +
      // In-bound transfer arrow (matches stepin)
      colorPath("M10 1 L10 9.5 M7.5 7 L10 9.5 L12.5 7", "none", "#2684c7", 1.65)
    );
  },

  // STEP / IGES Exchange (In / Out): CAD neutral solid with transfer arrows
  stepin: function () {
    return (
      p("M3 13.5 L10 17 L17 13.5 L17 7.5 L10 4 L3 7.5 Z", 0.18, 1.25) +
      l("M10 4 L10 17 M3 7.5 L10 11 L17 7.5", 1.15) +
      colorPath("M10 1 L10 8 M7.5 5.5 L10 8 L12.5 5.5", "none", "#2684c7", 1.65)
    );
  },
  stepout: function () {
    return (
      p("M3 13.5 L10 17 L17 13.5 L17 7.5 L10 4 L3 7.5 Z", 0.18, 1.25) +
      l("M10 4 L10 17 M3 7.5 L10 11 L17 7.5", 1.15) +
      colorPath("M10 8 L10 1 M7.5 3.5 L10 1 L12.5 3.5", "none", "#e89a24", 1.65)
    );
  },
  igesout: function () {
    return (
      p("M3 13.5 L10 17 L17 13.5 L17 7.5 L10 4 L3 7.5 Z", 0.18, 1.25) +
      l("M10 4 L10 17 M3 7.5 L10 11 L17 7.5", 1.15) +
      colorPath("M10 8 L10 1 M7.5 3.5 L10 1 L12.5 3.5", "none", "#17834f", 1.65)
    );
  },
  stlout: function () {
    return (
      p("M3 13.5 L10 17 L17 13.5 L17 7.5 L10 4 L3 7.5 Z", 0.18, 1.25) +
      l("M10 4 L10 17 M3 7.5 L10 11 L17 7.5", 1.15) +
      colorPath("M10 8 L10 1 M7.5 3.5 L10 1 L12.5 3.5", "none", "#9b5de5", 1.65) +
      colorPath("M4.5 12 L10 14.5 L15.5 12", "none", "#9b5de5", 0.9, ' stroke-dasharray="1.3 1"')
    );
  },
  dimensionedcircle: function () {
    return '<circle cx="10" cy="10" r="6" fill="currentColor" fill-opacity=".12" stroke="currentColor" stroke-width="1.3"/>' +
      '<path d="M3 17L17 3M3 13V17H7M13 3H17V7" fill="none" stroke="#2684c7" stroke-width="1.3"/>' +
      '<circle cx="10" cy="10" r="1" fill="currentColor"/>';
  },
  beltmate: function () {
    return '<path d="M6 4H14A6 6 0 0 1 14 16H6A6 6 0 0 1 6 4Z" fill="none" stroke="currentColor" stroke-width="1.4"/>' +
      '<circle cx="6" cy="10" r="3.5" fill="currentColor" fill-opacity=".12" stroke="#2684c7" stroke-width="1.2"/>' +
      '<circle cx="14" cy="10" r="3.5" fill="currentColor" fill-opacity=".12" stroke="#2684c7" stroke-width="1.2"/>' +
      '<path d="M5 9H7M6 8V12M13 9H15M14 8V12" stroke="currentColor" stroke-width="1"/>';
  },
  "3mfout": function () {
    return (
      p("M3 11 L9 14 L15 11 L15 5 L9 2 L3 5 Z", 0.18, 1.25) +
      colorPath("M3 5 L9 8 L15 5 M9 8 L9 14", "none", "#2684c7", 1.1) +
      colorPath("M3 14 L9 17 L15 14 M3 16 L9 19 L15 16", "none", "#17834f", 1.15) +
      colorPath("M17 9 L17 1 M15 3 L17 1 L19 3", "none", "#e89a24", 1.5)
    );
  },
  amfout: () => p("M3 3 H12 L16 7 V17 H3 Z", .12) +
    l("M12 3 V7 H16 M5 14 L8 9 L12 14 Z M8 9 V14 M5 14 L10 11 L12 14", 1) +
    colorPath("M17 14 V5 M15 7 L17 5 L19 7", "none", "#17834f", 1.5),
  printsetup: () => p("M3 7 H17 V14 H14 V18 H6 V14 H3 Z", .16) +
    l("M6 7 V2 H14 V7 M6 12 H14 V18 M9 15 H12 M15 10 H16", 1.2),
  gearmate: () => p("M6 2 L7 4 L9 4 L10 6 L9 8 L7 8 L6 10 L4 9 L3 7 L2 6 L3 4 L4 3 Z", .18, 1) +
    p("M14 10 L15 12 L17 12 L18 14 L17 16 L15 16 L14 18 L12 17 L11 15 L10 14 L11 12 L12 11 Z", .18, 1) +
    l("M4.5 6 H6.5 M13 14 H15") + colorPath("M9 9 L11 11", "none", "#e89a24", 1.5),
  symmetricmate: () => p("M2 6 H7 V14 H2 Z M13 6 H18 V14 H13 Z", .18) +
    l("M10 2 V18", 1.1, ' stroke-dasharray="2 1"') +
    colorPath("M4 4 H8 M6 2 L8 4 L6 6 M16 4 H12 M14 2 L12 4 L14 6", "none", "#2684c7", 1.1),

  // ==========================================
  // 4. ASSEMBLY TOOLS (SolidWorks Assembly)
  // ==========================================

  // Assembly: yellow component + green component mated together
  // Form subassembly: two distinct solids enclosed in one rigid group.
  formsubassembly: function () {
    return l("M4 2 H2 V18 H4 M16 2 H18 V18 H16", 1.2) +
      colorPath("M4 6 L8 4 L12 6 L12 10 L8 12 L4 10 Z", "#e89a24", "#e89a24", 1.1, ' fill-opacity="0.4"') +
      l("M4 6 L8 8 L12 6 M8 8 V12", 1) +
      colorPath("M8 12 L12 10 L16 12 L16 16 L12 18 L8 16 Z", "#17834f", "#17834f", 1.1, ' fill-opacity="0.4"') +
      l("M8 12 L12 14 L16 12 M12 14 V18", 1);
  },
  rackpinionmate: function () {
    return '<circle cx="10" cy="7" r="3" fill="currentColor" fill-opacity=".15" stroke="currentColor" stroke-width="1.2"/>' +
      l("M10 2 V4 M10 10 V12 M5 7 H7 M13 7 H15 M6.5 3.5 L8 5 M12 9 L13.5 10.5 M13.5 3.5 L12 5 M8 9 L6.5 10.5", 1.2) +
      p("M2 17 V14 H4 V12 H6 V14 H8 V12 H10 V14 H12 V12 H14 V14 H16 V12 H18 V17 Z", .2, 1) +
      colorPath("M4 19 H16 M4 19 L6 18 M16 19 L14 18", "none", "#2684c7", 1);
  },
  rotationlimitmate: function () {
    return l("M4 16 L4 4 M4 16 L16 8", 1.5) +
      colorPath("M4 7 A9 9 0 0 1 11.5 11 M2 7 H6 M10 9 L13 12", "none", "#e89a24", 1.3) +
      '<circle cx="4" cy="16" r="2" fill="currentColor"/>';
  },
  assembly: function () {
    return (
      // Yellow component block
      colorPath("M2 10.5 L7 13 L12 10.5 L12 5.5 L7 3 L2 5.5 Z", "#e89a24", "#e89a24", 1.25, ' fill-opacity="0.5"') +
      colorPath("M7 3 L7 13 M2 5.5 L7 8 L12 5.5", "none", "#e89a24", 1.1) +
      // Green component block interlocking
      colorPath("M8 14.5 L13 17 L18 14.5 L18 9.5 L13 7 L8 9.5 Z", "#17834f", "#17834f", 1.25, ' fill-opacity="0.55"') +
      colorPath("M13 7 L13 17 M8 9.5 L13 12 L18 9.5", "none", "#17834f", 1.1)
    );
  },

  // Insert Component: part block being inserted with plus icon
  components: function () {
    return (
      p("M3 13.5 L9 16.5 L15 13.5 L15 7.5 L9 4.5 L3 7.5 Z", 0.25, 1.25) +
      l("M9 4.5 L9 16.5 M3 7.5 L9 10.5 L15 7.5", 1.1) +
      // Green plus icon
      colorPath("M14 2 L18 2 M16 0 L16 4", "none", "#17834f", 1.75)
    );
  },

  // Mate: the famous SolidWorks Paperclip / Mate icon
  mates: function () {
    return (
      colorPath("M7 8 L7 14.5 A3.5 3.5 0 0 0 14 14.5 L14 5.5 A2.5 2.5 0 0 0 9 5.5 L9 13.5 A1.5 1.5 0 0 0 12 13.5 L12 7", "none", "#2684c7", 1.55)
    );
  },

  // Screw Mate: two mated components on a shared axis with a helical thread cue
  screwmate: function () {
    return (
      // Shared mate axis
      colorPath("M10 1 L10 19", "none", "#2684c7", 1.05, ' stroke-dasharray="2 1.5"') +
      // Upper component
      p("M5 4.2 L10 6 L15 4.2 L15 2.8 L10 1 L5 2.8 Z", 0.28, 1.2) +
      l("M5 2.8 L10 4.6 L15 2.8", 1.05) +
      // Lower component
      p("M5 17 L10 18.8 L15 17 L15 15.6 L10 13.8 L5 15.6 Z", 0.55, 1.2) +
      l("M5 15.6 L10 17.4 L15 15.6", 1.05) +
      // Helical screw relation between them
      colorPath("M10 6 C 14 7.6, 6 12.2, 10 13.8", "none", "#2684c7", 1.5)
    );
  },

  // Edit Component: in-context part editing
  partdoc: function () {
    return (
      p("M3 13.5 L10 17 L17 13.5 L17 7.5 L10 4 L3 7.5 Z", 0.45, 1.3, ' stroke="#2684c7"') +
      l("M10 4 L10 17 M3 7.5 L10 11 L17 7.5", 1.2) +
      colorPath("M14 2 L17 5 L16 6 L13 3 Z", "#e89a24", "#e89a24", 1.1)
    );
  },

  // Exploded View: parts blowing apart along exploded dashed trajectories
  explode: function () {
    return (
      // Center part
      p("M8 11 L10 12 L12 11 L12 9 L10 8 L8 9 Z", 0.6, 1.1) +
      // Top exploded part & path
      p("M7 4 L10 5.5 L13 4 L13 2.5 L10 1 L7 2.5 Z", 0.25, 1.1) +
      colorPath("M10 8 L10 5.5", "none", "#e89a24", 1.2, ' stroke-dasharray="1.8 1.5"') +
      // Bottom left exploded part & path
      p("M2 16.5 L4.5 17.5 L7 16.5 L7 15 L4.5 14 L2 15 Z", 0.25, 1.1) +
      colorPath("M8 11 L5 14", "none", "#e89a24", 1.2, ' stroke-dasharray="1.8 1.5"') +
      // Bottom right exploded part & path
      p("M13 16.5 L15.5 17.5 L18 16.5 L18 15 L15.5 14 L13 15 Z", 0.25, 1.1) +
      colorPath("M12 11 L15 14", "none", "#e89a24", 1.2, ' stroke-dasharray="1.8 1.5"')
    );
  },

  // Explode step: one part slides off its neighbour along a dashed chain leader
  explodestep: function () {
    return (
      // Fixed part
      p("M2 11 L4.5 12.2 L7 11 L7 8.8 L4.5 7.6 L2 8.8 Z", 0.6, 1.1) +
      // Moved part
      p("M12 11 L14.5 12.2 L17 11 L17 8.8 L14.5 7.6 L12 8.8 Z", 0.25, 1.1) +
      // Dashed leader and arrow head showing the step
      colorPath("M7 10 L11 10", "none", "#e89a24", 1.3, ' stroke-dasharray="1.8 1.4"') +
      colorPath("M10 8 L12.4 10 L10 12", "none", "#e89a24", 1.3) +
      // Step number tick
      colorPath("M4.5 14.5 L4.5 17.5 M2.9 16 L4.5 14.5 L6.1 16", "none", "currentColor", 1.1)
    );
  },

  // Motion Study: rotary motor with animation timeline
  motion: function () {
    return (
      // Central motor hub
      '<circle cx="10" cy="9" r="4.5" fill="currentColor" fill-opacity="0.25" stroke="currentColor" stroke-width="1.3"/>' +
      '<circle cx="10" cy="9" r="1.8" fill="#e89a24"/>' +
      // Rotation curved motion arrow
      colorPath("M10 2 A7 7 0 0 1 16 9", "none", "#e89a24", 1.45) +
      colorPath("M17.5 7 L16 9.5 L14 7.5", "none", "#e89a24", 1.35) +
      // Timeline bar at bottom
      l("M2 17 L18 17", 1.3) +
      '<rect x="8" y="15.5" width="4" height="3" rx="1" fill="#2684c7"/>'
    );
  },

  // Interference Detection: two overlapping bodies with red collision volume
  interference: function () {
    return (
      p("M2 11 L6 13 L10 11 L10 7 L6 5 L2 7 Z", 0.25, 1.2) +
      p("M10 13 L14 15 L18 13 L18 9 L14 7 L10 9 Z", 0.25, 1.2) +
      // Overlap volume in red
      p("M8 11 L12 11 L12 9 L8 9 Z", 0.85, 1.3, ' fill="#d0342c" stroke="#d0342c"') +
      // Warning spark
      colorPath("M10 2 L10 5 M8.5 3.5 L11.5 3.5", "none", "#d0342c", 1.4)
    );
  },

  // Bill of Materials: engineering parts list table
  bom: function () {
    return (
      p("M2 3 L18 3 L18 17 L2 17 Z", 0.15, 1.3) +
      // Header row
      p("M2 3 L18 3 L18 7 L2 7 Z", 0.45, 1.1) +
      // Column dividers
      l("M6 3 L6 17 M13 3 L13 17", 1.15) +
      // Row lines
      l("M2 10.5 L18 10.5 M2 14 L18 14", 1.1)
    );
  },

  // Isolate: single isolated part with ghosted surroundings
  isolate: function () {
    return (
      // Isolated solid in center
      p("M6 12 L10 14 L14 12 L14 8 L10 6 L6 8 Z", 0.65, 1.35, ' stroke="#2684c7"') +
      l("M10 6 L10 14 M6 8 L10 10 L14 8", 1.15) +
      // Ghosted bounding box
      colorPath("M2 4 L18 4 L18 16 L2 16 Z", "none", "#8899aa", 1.05, ' stroke-dasharray="2 1.5"')
    );
  },

  // ==========================================
  // 5. VIEWPORT HEADS-UP ORIENTATION & DISPLAY
  // ==========================================

  // Top View: orientation cube with TOP face highlighted
  view_top: function () {
    return (
      // Bottom cube faces (subtle)
      p("M3 13.5 L10 17 L17 13.5 L17 7.5 L10 4 L3 7.5 Z", 0.1, 1.2) +
      l("M10 11 L10 17 M3 7.5 L10 11 L17 7.5", 1.1) +
      // Top face highlighted in accent blue
      p("M3 7.5 L10 4 L17 7.5 L10 11 Z", 0.85, 1.4, ' fill="#2684c7" stroke="#2684c7"')
    );
  },

  // Front View: orientation cube with FRONT face highlighted
  view_front: function () {
    return (
      p("M3 13.5 L10 17 L17 13.5 L17 7.5 L10 4 L3 7.5 Z", 0.1, 1.2) +
      l("M10 4 L10 17 M10 4 L17 7.5 L10 11", 1.1) +
      // Front (left/bottom) face highlighted in accent blue
      p("M3 7.5 L10 11 L10 17 L3 13.5 Z", 0.85, 1.4, ' fill="#2684c7" stroke="#2684c7"')
    );
  },

  // Right View: orientation cube with RIGHT face highlighted
  view_right: function () {
    return (
      p("M3 13.5 L10 17 L17 13.5 L17 7.5 L10 4 L3 7.5 Z", 0.1, 1.2) +
      l("M10 4 L10 17 M3 7.5 L10 4 L10 11", 1.1) +
      // Right face highlighted in accent blue
      p("M10 11 L17 7.5 L17 13.5 L10 17 Z", 0.85, 1.4, ' fill="#2684c7" stroke="#2684c7"')
    );
  },

  // Isometric View: 3D cube with balanced shading on all 3 faces
  isoView: function () {
    return (
      p("M3 7.5 L10 4 L17 7.5 L10 11 Z", 0.55, 1.25) +
      p("M3 7.5 L10 11 L10 17 L3 13.5 Z", 0.22, 1.25) +
      p("M10 11 L17 7.5 L17 13.5 L10 17 Z", 0.38, 1.25)
    );
  },

  // Normal To: perpendicular eye / arrow looking straight into a planar face
  normalTo: function () {
    return (
      // Planar surface
      p("M2 5 L18 5 L18 15 L2 15 Z", 0.2, 1.3) +
      // Perpendicular normal vector arrow
      colorPath("M10 19 L10 9 M7.5 11.5 L10 9 L12.5 11.5", "none", "#2684c7", 1.65) +
      '<circle cx="10" cy="9" r="1.3" fill="#2684c7"/>'
    );
  },

  // Shaded with Edges: solid shaded cube with dark crisp edges
  solidView: function () {
    return (
      p("M3 7.5 L10 4 L17 7.5 L10 11 Z", 0.55, 1.4) +
      p("M3 7.5 L10 11 L10 17 L3 13.5 Z", 0.25, 1.4) +
      p("M10 11 L17 7.5 L17 13.5 L10 17 Z", 0.4, 1.4)
    );
  },

  // Transparent / Hidden Lines: translucent cube showing interior dashed hidden lines
  transparentView: function () {
    return (
      // Outer wireframe
      p("M3 13.5 L10 17 L17 13.5 L17 7.5 L10 4 L3 7.5 Z", 0.08, 1.3) +
      l("M10 4 L10 17 M3 7.5 L10 11 L17 7.5", 1.2) +
      // Internal hidden lines (dashed)
      colorPath("M3 13.5 L10 10.5 L17 13.5 M10 10.5 L10 4", "none", "#8899aa", 1.1, ' stroke-dasharray="2 1.5"')
    );
  },

  // Model Edges toggle: wireframe cube outline
  modelEdges: function () {
    return (
      p("M3 13.5 L10 17 L17 13.5 L17 7.5 L10 4 L3 7.5 Z", 0, 1.35) +
      l("M10 4 L10 17 M3 7.5 L10 11 L17 7.5", 1.3)
    );
  },

  // Zoom In
  zoomIn: function () {
    return (
      '<circle cx="9" cy="9" r="5" fill="none" stroke="currentColor" stroke-width="1.3"/>' +
      l("M13 13 L17.5 17.5", 1.5) +
      l("M6.5 9 L11.5 9 M9 6.5 L9 11.5", 1.3, ' stroke="#2684c7"')
    );
  },

  // Zoom Out
  zoomOut: function () {
    return (
      '<circle cx="9" cy="9" r="5" fill="none" stroke="currentColor" stroke-width="1.3"/>' +
      l("M13 13 L17.5 17.5", 1.5) +
      l("M6.5 9 L11.5 9", 1.3, ' stroke="#2684c7"')
    );
  },

  // Mode 3D
  mode3d: function () {
    return (
      p("M3 7.5 L10 4 L17 7.5 L10 11 Z", 0.5, 1.3) +
      p("M3 7.5 L10 11 L10 17 L3 13.5 Z", 0.22, 1.3) +
      p("M10 11 L17 7.5 L17 13.5 L10 17 Z", 0.38, 1.3)
    );
  },

  // Mode 2D Sketch
  mode2d: function () {
    return (
      p("M3 16 L17 16 L17 4 L3 4 Z", 0.15, 1.3) +
      colorPath("M6 13 L14 7", "none", "#2684c7", 1.6) +
      '<circle cx="6" cy="13" r="1.8" fill="#2684c7"/>' +
      '<circle cx="14" cy="7" r="1.8" fill="#2684c7"/>'
    );
  },

  // Mode Drawing
  modeDrawing: function () {
    return CAD_ICONS.drawing();
  },

  // ==========================================
  // 6. FEATUREMANAGER TREE TABS & ITEMS
  // ==========================================

  // FeatureManager Tree Tab
  treeTab: function () {
    return (
      l("M4 4 L4 16 M4 7 L10 7 M4 13 L10 13", 1.35) +
      p("M10 5.5 L16 5.5 L16 8.5 L10 8.5 Z", 0.45, 1.15) +
      p("M10 11.5 L16 11.5 L16 14.5 L10 14.5 Z", 0.45, 1.15)
    );
  },

  // Design Library Tab
  libTab: function () {
    return (
      p("M2 4.5 L7 4.5 L9 6.5 L18 6.5 L18 16 L2 16 Z", 0.2, 1.3) +
      p("M2 8.5 L18 8.5 L16 16 L4 16 Z", 0.55, 1.25)
    );
  },

  // Equations & Parameters Tab (f(x))
  paramsTab: function () {
    return (
      colorPath("M5 14 C 4 14, 3 13, 3 11 C 3 8, 6 6, 6 4 C 6 2.5, 5 2, 4 2 M2 7.5 L7 7.5", "none", "#2684c7", 1.45) +
      colorPath("M11 9 L15 15 M15 9 L11 15", "none", "#e89a24", 1.45)
    );
  },

  // Common CAD Confirmation / Status
  check: function () {
    return colorPath("M4 10 L8.5 14.5 L16 5.5", "none", "#17834f", 2.2);
  },
  cross: function () {
    return colorPath("M5 5 L15 15 M15 5 L5 15", "none", "#d0342c", 2.2);
  },
  pan: function () {
    return (
      p("M7 11 L7 4.5 C 7 3.7 7.7 3 8.5 3 C 9.3 3 10 3.7 10 4.5 L10 10 L10 4.5 C 10 3.7 10.7 3 11.5 3 C 12.3 3 13 3.7 13 4.5 L13 10 L13 5.5 C 13 4.7 13.7 4 14.5 4 C 15.3 4 16 4.7 16 5.5 L16 12 C 16 15.5 13 18 9.5 18 C 6 18 4 15.5 4 13 L4 8.5 C 4 7.7 4.7 7 5.5 7 C 6.3 7 7 7.7 7 8.5 Z", 0.25, 1.3)
    );
  },

  // Rollback bar indicator
  rollbackhere: function () {
    return (
      colorPath("M10 2 L10 12 M6.5 8.5 L10 12 L13.5 8.5", "none", "#2684c7", 1.75) +
      colorPath("M3 16 L17 16", "none", "#e89a24", 2.5)
    );
  },

  // Edit Feature
  editfeature: function () {
    return (
      colorPath("M14 2 L17 5 L9 13 L6 14 L7 11 Z", "#e89a24", "#e89a24", 1.25) +
      l("M12 4 L15 7", 1.1)
    );
  },

  // Section View: solid split by a highlighted clipping plane
  section: function () {
    return (
      p("M3 13.5 L9 16.5 L16.5 12.75 L16.5 6.75 L10.5 3.75 L3 7.5 Z", 0.18, 1.25) +
      l("M9 7.5 L9 16.5 M3 7.5 L9 10.5 L16.5 6.75", 1.05) +
      colorPath("M11.5 2 L6.5 18 M14.5 2 L9.5 18", "none", "#2dd4bf", 1.45) +
      colorPath("M6.5 18 L9.5 18 M11.5 2 L14.5 2", "none", "#2dd4bf", 1.15)
    );
  },
};

// Aliases mapping command IDs, feature names, and phosphor classes to CAD icons
export const ICON_ALIASES = {
  /* Selection operations have no drawn CAD glyph of their own; they fall
     through to Phosphor, which needs the ph- name rather than the command id.
     Without these the context menu drew an empty box where the icon goes. */
  selectloop: "ph-circle-notch",
  selecttangency: "ph-flow-arrow",
  selectconnected: "ph-graph",
  selectinvert: "ph-selection-inverse",
  selectgrow: "ph-arrows-out",
  selectshrink: "ph-arrows-in",
  selectsave: "ph-bookmark-simple",
  selectrecall: "ph-bookmarks-simple",
  // Feature Catalog names & command IDs
  extrudeCut: "extrudecut",
  revolve: "revolvefeature",
  revolveCut: "revolvecutfeature",
  sweepCut: "sweepcutfeature",
  sweep: "sweepfeature",
  loft: "loftfeature",
  fillet: "filletfeature",
  chamfer: "chamferfeature",
  shell: "shellfeature",
  dome: "domefeature",
  draft: "draftfeature",
  thicken: "thickenfeature",
  rib: "ribfeature",
  splitBody: "splitbodyfeature",
  moveBody: "movebodyfeature",
  pattern: "patternfeature",
  mirror: "mirrorfeature",
  boolean: "booleanfeature",
  hole: "holefeature",
  helix: "helixfeature",
  thread: "threadfeature",
  knurl: "knurlfeature",
  insert: "insertfeature",
  helixfeature: "helixfeature",
  threadfeature: "threadfeature",
  knurlfeature: "knurlfeature",
  insertfeature: "insertfeature",
  appearance: "insertfeature",
  config: "config",
  rect: "directbox",
  circle: "directcyl",
  sph: "directsph",
  poly: "directpoly",
  rev: "directrev",
  "ph-selection-background": "section",

  // Phosphor font classes
  "ph-cube": "extrude",
  "ph-scissors": "extrudecut",
  "ph-arrow-counter-clockwise": "revolvefeature",
  "ph-path": "sweepfeature",
  "ph-stack": "loftfeature",
  "ph-circle-dashed": "holefeature",
  "ph-corners-out": "filletfeature",
  "ph-corners-in": "chamferfeature",
  "ph-bowl-food": "shellfeature",
  "ph-angle": "draftfeature",
  "ph-stack-simple": "thickenfeature",
  "ph-triangle": "ribfeature",
  "ph-square-split-horizontal": "splitbodyfeature",
  "ph-arrows-out-cardinal": "movebodyfeature",
  "ph-dots-nine": "patternfeature",
  "ph-circles-three": "circpattern",
  "ph-flip-horizontal": "mirrorfeature",
  "ph-intersect": "booleanfeature",
  "ph-square-half": "refplane",
  "ph-axis-arrow": "refaxis",
  "ph-crosshair": "coordsys",
  "ph-screwdriver": "stdscrew",
  "ph-gear-six": "stdgear",
  "ph-cylinder": "directcyl",
  "ph-sphere": "directsph",
  "ph-polygon": "directpoly",
  "ph-spiral": "directrev",
  "ph-diamond": "knurlfeature",
  "ph-gear": "threadfeature",

  // Sketch Tools
  "ph-pencil-line": "newsketch",
  "ph-cursor": "select",
  "ph-line-segment": "wall",
  "ph-rectangle": "srect",
  "ph-bezier-curve": "sarc",
  "ph-pill": "sslot",
  "ph-hexagon": "spoly",
  "ph-circle": "sell",
  "ph-ruler": "dim",
  "ph-arrows-out-line-horizontal": "extend",
  "ph-check": "finishsketch",
  "ph-copy-simple": "offset",
  "ph-line-segments": "constr",
  "ph-projector-screen": "project",
  "ph-compass-tool": "mode2d",

  // Evaluate & Utilities
  "ph-arrows-clockwise": "regen",
  "ph-crosshair-simple": "fit",
  "ph-file-svg": "drawing",
  "ph-scales": "mass",
  "ph-seal-check": "standards",
  "ph-paint-brush": "paint",
  "ph-note-pencil": "note",
  "ph-package": "bundle",
  "ph-upload-simple": "stepin",
  "ph-file-step": "stepout",
  "ph-file-arrow-down": "igesout",

  // Assembly
  "ph-link": "mates",
  "ph-cube-focus": "partdoc",
  "ph-arrows-out": "explode",
  "ph-arrows-out-line-horizontal": "explodestep",
  "ph-play-circle": "motion",
  "ph-table": "bom",
  "ph-eye": "isolate",

  // Views & Display
  "ph-arrow-line-down": "view_top",
  "ph-arrow-line-right": "view_front",
  "ph-arrow-line-up": "view_right",
  "ph-arrows-in-cardinal": "normalTo",
  "ph-square": "modelEdges",
  "ph-hand": "pan",

  // Tabs
  "ph-tree-structure": "treeTab",
  "ph-folder-open": "libTab",
  "ph-sliders-horizontal": "paramsTab",
};

/**
 * Renders a precision CAD SVG icon.
 * @param {string} name - Icon name (e.g. "extrude", "dim", or "ph-pencil-line")
 * @param {string} [extraClass] - Optional CSS classes
 * @returns {string} SVG HTML string
 */
export function cadIcon(name, extraClass) {
  var key = name;
  if (!CAD_ICONS[key] && ICON_ALIASES[key]) key = ICON_ALIASES[key];
  var make = CAD_ICONS[key];
  if (!make) {
    /* Fall back to Phosphor on the RESOLVED key, not the name that was asked
       for: an alias pointing at a "ph-" class is how a command with no drawn
       glyph borrows one, and reading `name` here made every such alias emit a
       class that does not exist and draw an empty box. */
    return '<i class="ph ' + (key && key.startsWith("ph-") ? key : "ph-" + key) + (extraClass ? " " + extraClass : "") + '"></i>';
  }
  var svgMarkup = svg(make());
  if (extraClass) {
    svgMarkup = svgMarkup.replace('class="md-cad-icon"', 'class="md-cad-icon ' + extraClass + '"');
  }
  return svgMarkup;
}

export var CAD_ICON_KEYS = Object.keys(CAD_ICONS);
