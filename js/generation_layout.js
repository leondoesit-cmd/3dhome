import {requirementDraft} from './draft_requirements.js';
import {polygonBooleanArea} from './polygon_area.js';
import {footprint} from './layout_analysis.js';
// Basic layouts for small and large apartments
const LAYOUTS = {
  small: {
    w: 600, d: 700,
    rooms: [
      { name: "Living / Kitchen", x0: 0, z0: 300, x1: 600, z1: 700, floor: "wood" },
      { name: "Bedroom", x0: 200, z0: 0, x1: 600, z1: 300, floor: "wood" },
      { name: "Bathroom", x0: 0, z0: 0, x1: 200, z1: 300, floor: "tiles" }
    ],
    doors: [
      { from: "Living / Kitchen", to: "Bedroom", width: 80, s: 100 },
      { from: "Living / Kitchen", to: "Bathroom", width: 70, s: 100 },
      { from: "Outside", to: "Living / Kitchen", width: 90, s: 50, wall: "bottom" }
    ],
    windows: [
      { room: "Living / Kitchen", width: 120, height: 120, sill: 90 },
      { room: "Bedroom", width: 120, height: 120, sill: 90 },
      { room: "Bathroom", width: 60, height: 60, sill: 140 }
    ]
  },
  /* The presentation showcase: a single-storey family house, about
     55' x 33', with an open living / dining / kitchen wing and a sleeping
     wing off a central hall (js/demo_house.js). */
  showcase: {
    w: 1680, d: 1000,
    rooms: [
      { name: "Living Room", roomType: "living", x0: 0, z0: 0, x1: 620, z1: 520, floor: "wood" },
      { name: "Dining", roomType: "dining", x0: 620, z0: 0, x1: 1040, z1: 520, floor: "wood" },
      { name: "Kitchen", roomType: "kitchen", x0: 1040, z0: 0, x1: 1680, z1: 520, floor: "porcelain" },
      { name: "Master Bedroom", roomType: "masterBedroom", x0: 0, z0: 520, x1: 560, z1: 1000, floor: "laminate" },
      { name: "Hall", roomType: "corridor", x0: 560, z0: 520, x1: 1040, z1: 720, floor: "wood" },
      { name: "Bathroom", roomType: "bathroom", x0: 560, z0: 720, x1: 800, z1: 1000, floor: "tiles" },
      { name: "Ensuite", roomType: "ensuite", x0: 800, z0: 720, x1: 1040, z1: 1000, floor: "mosaic" },
      { name: "Bedroom 2", roomType: "bedroom", x0: 1040, z0: 520, x1: 1400, z1: 1000, floor: "laminate" },
      { name: "Study", roomType: "office", x0: 1400, z0: 520, x1: 1680, z1: 1000, floor: "parquet" }
    ],
    doors: [
      { from: "Hall", to: "Living Room", width: 120, s: 60, isPassage: true },
      { from: "Living Room", to: "Dining", width: 200, s: 160, isPassage: true },
      { from: "Dining", to: "Kitchen", width: 220, s: 150, isPassage: true },
      { from: "Hall", to: "Master Bedroom", width: 90, s: 40 },
      { from: "Hall", to: "Bathroom", width: 80, s: 40 },
      { from: "Hall", to: "Ensuite", width: 80, s: 40 },
      { from: "Hall", to: "Bedroom 2", width: 90, s: 40 },
      { from: "Kitchen", to: "Study", width: 85, s: 60 },
      { from: "Outside", to: "Living Room", width: 110, s: 260, wall: "top" }
    ],
    windows: [
      { room: "Living Room", width: 260, height: 210, sill: 10 },
      { room: "Dining", width: 200, height: 160, sill: 60 },
      { room: "Kitchen", width: 180, height: 110, sill: 100 },
      { room: "Master Bedroom", width: 180, height: 140, sill: 80 },
      { room: "Bedroom 2", width: 150, height: 140, sill: 80 },
      { room: "Study", width: 130, height: 140, sill: 80 },
      { room: "Bathroom", width: 70, height: 60, sill: 150 },
      { room: "Ensuite", width: 70, height: 60, sill: 150 }
    ]
  },
  large: {
    w: 1000, d: 900,
    rooms: [
      { name: "Living Room", x0: 400, z0: 400, x1: 1000, z1: 900, floor: "wood" },
      { name: "Kitchen", x0: 0, z0: 400, x1: 400, z1: 900, floor: "tiles" },
      { name: "Corridor", x0: 400, z0: 250, x1: 600, z1: 400, floor: "wood" },
      { name: "Master Bedroom", x0: 600, z0: 0, x1: 1000, z1: 400, floor: "wood" },
      { name: "Bedroom 2", x0: 0, z0: 0, x1: 400, z1: 400, floor: "wood" },
      { name: "Bathroom", x0: 400, z0: 0, x1: 600, z1: 250, floor: "tiles" }
    ],
    doors: [
      { from: "Corridor", to: "Living Room", width: 120, s: 100, isPassage: true },
      { from: "Living Room", to: "Kitchen", width: 150, s: 200, isPassage: true },
      { from: "Corridor", to: "Master Bedroom", width: 80, s: 50 },
      { from: "Corridor", to: "Bedroom 2", width: 80, s: 50 },
      { from: "Corridor", to: "Bathroom", width: 70, s: 50 },
      { from: "Outside", to: "Living Room", width: 90, s: 100, wall: "bottom" }
    ],
    windows: [
      { room: "Living Room", width: 200, height: 200, sill: 20 },
      { room: "Kitchen", width: 100, height: 120, sill: 90 },
      { room: "Master Bedroom", width: 120, height: 120, sill: 90 },
      { room: "Bedroom 2", width: 120, height: 120, sill: 90 },
      { room: "Bathroom", width: 60, height: 60, sill: 140 }
    ]
  }
};

// Randomized procedural layouts (same schema as LAYOUTS)
function seededRandom(seed) {
  var value = (Number(seed) >>> 0) || 1;
  return function() {
    value = (value * 1664525 + 1013904223) >>> 0;
    return value / 4294967296;
  };
}
function rnd(a, b, random) { return a + random() * (b - a); }
function ri(a, b, random) { return Math.round(rnd(a, b, random) / 10) * 10; }

function randomLayout(seed) {
  var random = seededRandom(seed);
  if (random() < 0.45) {
    // 1-bedroom flat: open living/kitchen strip + bedroom & bathroom strip
    const w = ri(620, 760, random), d = ri(680, 840, random);
    const split = ri(Math.max(300, d * 0.4), d * 0.47, random);
    const bathW = ri(180, 220, random);
    return {
      w, d,
      rooms: [
        { name: "Living / Kitchen", x0: 0, z0: split, x1: w, z1: d, floor: "wood" },
        { name: "Bedroom", x0: bathW, z0: 0, x1: w, z1: split, floor: "wood" },
        { name: "Bathroom", x0: 0, z0: 0, x1: bathW, z1: split, floor: "tiles" }
      ],
      doors: [
        { from: "Living / Kitchen", to: "Bedroom", width: 80, s: 100 },
        { from: "Living / Kitchen", to: "Bathroom", width: 70, s: 100 },
        { from: "Outside", to: "Living / Kitchen", width: 90, s: 60, wall: "bottom" }
      ],
      windows: [
        { room: "Living / Kitchen", width: ri(120, 200, random), height: 120, sill: 90 },
        { room: "Bedroom", width: 120, height: 120, sill: 90 },
        { room: "Bathroom", width: 60, height: 60, sill: 140 }
      ]
    };
  }
  // 2-bedroom: kitchen|living bottom row, bedrooms + bath off a corridor on top
  const w = ri(900, 1200, random), d = ri(800, 1000, random);
  const kx = ri(w * 0.3, w * 0.42, random);        // kitchen / living split
  const zSplit = ri(Math.max(400, d * 0.42), d * 0.5, random); // enough depth for usable bedrooms/bath
  const bx1 = kx + ri(230, 260, random);           // service core wide enough for real fixtures
  const corridorDepth = ri(100, 130, random);      // usable circulation without wasting bedroom area
  const corrZ = zSplit - corridorDepth;
  return {
    w, d,
    rooms: [
      { name: "Living Room", x0: kx, z0: zSplit, x1: w, z1: d, floor: "wood" },
      { name: "Kitchen", x0: 0, z0: zSplit, x1: kx, z1: d, floor: "tiles" },
      { name: "Corridor", x0: kx, z0: corrZ, x1: bx1, z1: zSplit, floor: "wood" },
      { name: "Master Bedroom", x0: bx1, z0: 0, x1: w, z1: zSplit, floor: "wood" },
      { name: "Bedroom 2", x0: 0, z0: 0, x1: kx, z1: zSplit, floor: "wood" },
      { name: "Bathroom", x0: kx, z0: 0, x1: bx1, z1: corrZ, floor: "tiles" }
    ],
    doors: [
      { from: "Corridor", to: "Living Room", width: 120, s: 100, isPassage: true },
      { from: "Living Room", to: "Kitchen", width: 150, s: 200, isPassage: true },
      { from: "Corridor", to: "Master Bedroom", width: 80, s: 50 },
      { from: "Corridor", to: "Bedroom 2", width: 80, s: 50 },
      { from: "Corridor", to: "Bathroom", width: 70, s: 50 },
      { from: "Outside", to: "Living Room", width: 90, s: 100, wall: "bottom" }
    ],
    windows: [
      { room: "Living Room", width: ri(160, 240, random), height: 200, sill: 20 },
      { room: "Kitchen", width: 100, height: 120, sill: 90 },
      { room: "Master Bedroom", width: ri(120, 160, random), height: 120, sill: 90 },
      { room: "Bedroom 2", width: 120, height: 120, sill: 90 },
      { room: "Bathroom", width: 60, height: 60, sill: 140 }
    ]
  };
}


export function generationPlan(size, replace, state, seed, constraints={}) {
  if(constraints.requirements?.length){
    const occupied=[...state.nodes,...(state.items||[]).flatMap(item=>footprint(item))].filter(p=>Number.isFinite(p.x)&&Number.isFinite(p.z));
    const x=replace?0:occupied.length?Math.max(...occupied.map(n=>n.x))+500:2000;
    const result=requirementDraft(constraints.requirements,constraints.boundary,{x,z:0});
    if(!result.ok)throw new Error(result.reason+(result.unplaced?': '+result.unplaced:''));
    if(!replace&&constraints.boundary&&occupied.length){
      const xs=occupied.map(p=>p.x),zs=occupied.map(p=>p.z),loX=Math.min(...xs)-20,hiX=Math.max(...xs)+20,loZ=Math.min(...zs)-20,hiZ=Math.max(...zs)+20;
      const existing=[{x:loX,z:loZ},{x:hiX,z:loZ},{x:hiX,z:hiZ},{x:loX,z:hiZ}];
      if(result.layout.rooms.some(r=>polygonBooleanArea([[[{x:r.x0-5,z:r.z0-5},{x:r.x1+5,z:r.z0-5},{x:r.x1+5,z:r.z1+5},{x:r.x0-5,z:r.z1+5}]],[existing]],s=>s[0]&&s[1])>1e-6))throw new Error('requirements-existing');
    }
    return result.layout;
  }
  let layout;
  if (size === "random") {
    layout = randomLayout(seed);
  } else {
    layout = LAYOUTS[size] || LAYOUTS["small"];
    // Clone layout because we might shift it
    layout = JSON.parse(JSON.stringify(layout));
  }

  if (!replace) {
     let shiftX = 2000;
     let shiftZ = 0;
     
     // Find max X in current scene to append next to it
     if (state.nodes.length > 0) {
        let maxx = Math.max(...state.nodes.map(n => n.x));
        shiftX = maxx + 500;
     }

     layout.rooms.forEach(r => { r.x0+=shiftX; r.x1+=shiftX; r.z0+=shiftZ; r.z1+=shiftZ; });
  }

  return layout;
}
