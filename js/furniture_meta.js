// Furniture labels, prices, and library catalog tree.
import { getLang } from "./i18n.js";
import { cabPrice } from "./cabinet.js";
import { FURN } from "./furniture_models.js";

var FURN_EN = {
  base: "Base cabinet",
  tall: "Tall cabinet",
  island: "Island",
  sink: "Sink",
  cooktop: "Cooktop",
  oven: "Oven",
  dishwasher: "Dishwasher",
  fridge: "Fridge",
  wardrobe: "Wardrobe",
  cabsys: "Modular cabinet",
  sofa: "Sofa",
  armchair: "Armchair",
  bed: "Bed",
  table: "Table",
  chair: "Chair",
  tv: "TV",
  rug: "Rug",
  desk: "Desk",
  bookshelf: "Bookshelf",
  nightstand: "Nightstand",
  dresser: "Dresser",
  toilet: "Toilet",
  bathtub: "Bathtub",
  shower: "Shower",
  vanity: "Vanity",
  washer: "Washer",
  upper: "Upper cabinet",
  plant: "Plant",
  coffee: "Coffee table",
  sideTable: "Side table",
  tvunit: "TV unit",
  roundTable: "Round table",
  barstool: "Barstool",
  officeChair: "Office chair",
  piano: "Piano",
  crib: "Crib",
  bunk: "Bunk bed",
  mirror: "Mirror",
  wallMirror: "Wall mirror",
  art: "Wall art",
  ac: "AC unit",
  acDucted: "Ducted fan coil",
  acDiffuser: "Supply diffuser",
  acReturn: "Return grille",
  acCassette: "Cassette AC",
  acOutdoor: "Condenser unit",
  tvWall: "Wall-mounted TV",
  shoeCab: "Shoe cabinet",
  coatRack: "Coat rack",
  dryer: "Dryer",
  microwave: "Microwave",
  hood: "Range hood",
  aquarium: "Aquarium",
  bench: "Bench",
  stairs: "Stairs",
  fireplace: "Fireplace",
  pouf: "Pouf",
  dressTable: "Dressing table",
  radiator: "Radiator",
  ceilingLight: "Ceiling light",
  pendant: "Pendant light",
  floorLamp: "Floor lamp",
  wallLamp: "Wall lamp",
  tableLamp: "Table lamp",
  trackLight: "Track light",
  lightStrip: "Light strip",
  nft_pipe_75: "NFT Pipe 75mm",
  nft_pipe_110: "NFT Pipe 110mm",
  nft_pipe_160: "NFT Pipe 160mm",
  nft_square_12x12: "NFT Square Channel",
  dwc_bucket: "DWC Bucket",
  rdwc_header: "RDWC Header Tank",
  ebb_flow_tray: "Ebb & Flow Tray",
  tower_commercial: "Commercial Tower",
  tower_diy_pvc: "DIY PVC Tower",
  water_chiller: "Water Chiller",
  grow_tent: "Grow Tent",
  led_grow_light: "LED Grow Light",
  water_reservoir_60l: "Water Reservoir 60L",
  shade_net: "Shade Net",
  sideboard: "Sideboard",
  console: "Console table",
  stool: "Stool",
  recliner: "Recliner",
  pantry: "Pantry cabinet",
  filingCab: "Filing cabinet",
  wallShelf: "Floating shelf",
  floorMirror: "Arch mirror",
  clock: "Wall clock",
  curtain: "Curtain",
  whiteboard: "Whiteboard",
  speaker: "Floor speaker",
  soundbar: "Soundbar",
  wineFridge: "Wine fridge",
  coffeeMachine: "Espresso machine",
  toaster: "Toaster",
  kettle: "Kettle",
  waterHeater: "Water heater",
  printer: "Printer",
  bidet: "Bidet",
  pedestalSink: "Pedestal basin",
  towelRail: "Heated towel rail",
  laundryBasket: "Laundry basket",
  chandelier: "Chandelier",
  ceilingFan: "Ceiling fan"
};

export function flabel(type) {
  var f = FURN[type];
  if (!f) return type;
  return getLang() === "en" && FURN_EN[type] ? FURN_EN[type] : f.label;
}

var CATALOG_EN = {
  "furniture": "Furniture",
  "living": "Living Room",
  "bedroom": "Bedroom",
  "office": "Office",
  "decor": "Decor",
  "misc": "Miscellaneous",
  "appliances": "Appliances",
  "kitchen_apps": "Kitchen",
  "laundry": "Laundry & Cleaning",
  "climate": "Climate Control",
  "media": "Media",
  "computers": "Computers",
  "systems": "Systems",
  "peripherals": "Displays",
  "kitchen_bath": "Kitchen & Bath",
  "cabinets": "Cabinets",
  "plumbing": "Plumbing & Fixtures",
  "lighting": "Lighting",
  "lamps": "Lamps",
  "hydro": "Hydroponics",
  "systems_hydro": "Systems",
  "gear_hydro": "Equipment",
  "custom": "My Models",
  "mine": "Custom Models",
  "characters": "Characters",
  "humans": "Humans"
};

export function clabel(cat) {
  if (!cat) return "";
  return getLang() === "en" && CATALOG_EN[cat.id] ? CATALOG_EN[cat.id] : cat.label;
}

// Indicative retail prices in ILS (₪) per catalog item — powers the live cost /
// shopping-list estimate. Rough market figures, easy to tune in one place.
export const PRICE = {
  base: 800, tall: 1200, island: 3500, sink: 600, cooktop: 1500, oven: 2200,
  dishwasher: 2500, fridge: 4500, wardrobe: 2800, cabsys: 4200, sofa: 4000, armchair: 1800,
  bed: 3500, table: 1500, chair: 350, tv: 3000, rug: 800, desk: 1200,
  bookshelf: 900, nightstand: 500, dresser: 1400, toilet: 900, bathtub: 3000,
  shower: 2500, vanity: 1600, washer: 2200, upper: 700, plant: 250, coffee: 900,
  sideTable: 450, tvunit: 1500, roundTable: 1400, barstool: 500, officeChair: 1200,
  piano: 15000, crib: 1500, bunk: 3200, mirror: 500, wallMirror: 650, art: 600, ac: 3500,
  shoeCab: 700, coatRack: 300, dryer: 2500, microwave: 700, hood: 1800,
  aquarium: 2000, bench: 800, stairs: 6000, fireplace: 4000, pouf: 400,
  dressTable: 1300, radiator: 1200, ceilingLight: 400, floorLamp: 600, wallLamp: 250, tableLamp: 180,
  trackLight: 800, pendant: 600, lightStrip: 250, nft_pipe_75: 50, nft_pipe_110: 80, nft_pipe_160: 120, nft_square_12x12: 100,
  dwc_bucket: 70, rdwc_header: 150, ebb_flow_tray: 800, tower_commercial: 1500, tower_diy_pvc: 300,
  water_chiller: 2500, grow_tent: 600, led_grow_light: 1000, water_reservoir_60l: 120, shade_net: 450,
  sideboard: 2200, console: 900, stool: 300, recliner: 3200, pantry: 1900, filingCab: 900,
  wallShelf: 200, floorMirror: 900, clock: 220, curtain: 700, whiteboard: 600,
  speaker: 2400, soundbar: 1500, wineFridge: 3000, coffeeMachine: 2800, toaster: 250,
  kettle: 200, waterHeater: 1800, printer: 800, bidet: 800, pedestalSink: 1100,
  towelRail: 900, laundryBasket: 180, chandelier: 2200, ceilingFan: 1200,
  // ducted AC: the fan coil and condenser are the system, the grilles are per room
  tvWall: 3200, acDucted: 6500, acOutdoor: 4800, acCassette: 5200,
  acDiffuser: 260, acReturn: 320
};
export function itemPrice(it) {
  // A modular cabinet is priced from what it is actually made of — board area
  // by material plus the ironmongery — not from a flat catalogue figure.
  if (it && it.cab) return cabPrice(it);
  return (it && PRICE[it.type]) || 0;
}

// Category tree for the library grid UI (main.js renderFurnUI).
// `icon` is a Phosphor glyph and is required on every category AND subcategory:
// navigation tiles are drawn from it, so each one has to depict its own subject
// (a bed for bedroom, a washing machine for laundry) rather than borrow the
// picture of whichever item happens to sit first in the list.
export const CATALOG = [
  { id: "furniture", label: "ריהוט", icon: "ph-couch", sub: [
    { id: "living", label: "סלון", icon: "ph-couch", items: ["sofa", "armchair", "recliner", "pouf", "bench", "stool", "barstool", "table", "roundTable", "coffee", "sideTable", "console", "tvunit", "sideboard"] },
    { id: "bedroom", label: "חדר שינה", icon: "ph-bed", items: ["cabsys", "bed", "bunk", "crib", "wardrobe", "dresser", "nightstand", "dressTable"] },
    { id: "office", label: "משרד", icon: "ph-office-chair", items: ["desk", "officeChair", "chair", "bookshelf", "filingCab", "whiteboard"] },
    { id: "decor", label: "עיצוב משלים", icon: "ph-image-square", items: ["rug", "plant", "mirror", "wallMirror", "floorMirror", "art", "clock", "curtain", "wallShelf", "piano", "aquarium", "fireplace", "shoeCab", "coatRack"] },
    { id: "misc", label: "שונות", icon: "ph-stairs", items: ["stairs", "laundryBasket"] }
  ]},
  { id: "appliances", label: "מכשירי חשמל", icon: "ph-plug-charging", sub: [
    { id: "kitchen_apps", label: "מטבח", icon: "ph-oven", items: ["fridge", "oven", "cooktop", "microwave", "dishwasher", "hood", "wineFridge", "coffeeMachine", "toaster", "kettle"] },
    { id: "laundry", label: "כביסה וניקיון", icon: "ph-washing-machine", items: ["washer", "dryer"] },
    { id: "climate", label: "מיזוג", icon: "ph-snowflake", items: ["ac", "acCassette", "acDucted", "acDiffuser", "acReturn", "acOutdoor", "radiator", "waterHeater"] },
    { id: "media", label: "מדיה", icon: "ph-television", items: ["tv", "tvWall", "soundbar", "speaker"] }
  ]},
  { id: "computers", label: "מחשבים", icon: "ph-desktop-tower", sub: [
    { id: "systems", label: "מערכות", icon: "ph-laptop", items: ["desktop_pc", "laptop", "printer"] },
    { id: "peripherals", label: "מסכים", icon: "ph-monitor", items: ["monitor"] }
  ]},
  { id: "kitchen_bath", label: "מטבח ואמבטיה", icon: "ph-bathtub", sub: [
    { id: "cabinets", label: "ארונות מטבח", icon: "ph-lockers", items: ["cabsys", "base", "tall", "upper", "island", "pantry"] },
    { id: "plumbing", label: "קבועות ואינסטלציה", icon: "ph-shower", items: ["sink", "pedestalSink", "toilet", "bidet", "bathtub", "shower", "vanity", "towelRail"] }
  ]},
  { id: "lighting", label: "תאורה", icon: "ph-lightbulb", sub: [
    { id: "lamps", label: "מנורות", icon: "ph-lamp-pendant", items: ["ceilingLight", "pendant", "chandelier", "ceilingFan", "trackLight", "floorLamp", "wallLamp", "tableLamp", "lightStrip"] }
  ]},
  { id: "hydro", label: "הידרופוניקה", icon: "ph-plant", sub: [
    { id: "systems_hydro", label: "מערכות", icon: "ph-drop", items: ["nft_pipe_75", "nft_pipe_110", "nft_pipe_160", "nft_square_12x12", "dwc_bucket", "rdwc_header", "ebb_flow_tray", "tower_commercial", "tower_diy_pvc"] },
    { id: "gear_hydro", label: "ציוד מלווה", icon: "ph-toolbox", items: ["water_chiller", "grow_tent", "led_grow_light", "water_reservoir_60l", "shade_net"] }
  ]},
  { id: "custom", label: "מודלים שלי", icon: "ph-star", sub: [
    { id: "mine", label: "מודלים מותאמים", icon: "ph-shapes", items: [] }
  ]},
  { id: "characters", label: "דמויות", icon: "ph-users-three", sub: [
    { id: "humans", label: "אנשים", icon: "ph-person", items: ["man", "woman", "boy", "girl", "oldman", "oldwoman"] }
  ]}
];

