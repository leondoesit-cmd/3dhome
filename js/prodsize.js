// Real-world product dimensions: search the web for a brand + model and pull
// the physical size, so a catalog model can be rescaled to the real thing.
//
// This module is deliberately dependency-free and DOM-free so the SAME code
// runs in the browser (js/ui_prodsize.js) and in Node (server/relay.mjs, which
// does the actual fetching — retailer sites send no CORS headers, so the page
// itself can never read them).
//
// Pipeline:  query → web search → candidate pages → dimension candidates →
//            score/cluster → {w,d,h} in cm.
// Every step is pure except `lookupProduct`, which takes its transport as an
// argument (`opts.get`) and therefore stays testable and environment-agnostic.

/* ---- units ---------------------------------------------------------------- */

// multiplier → cm. Hebrew forms are normalized (gershayim → ASCII ") first.
var UNITS = [
  ['mm', 0.1], ['מ"מ', 0.1], ["ממ", 0.1],
  ["cm", 1], ['ס"מ', 1], ["סמ", 1],
  ["m", 100], ["meter", 100], ["metre", 100], ["מטר", 100], ["מ'", 100],
  ["in", 2.54], ["inch", 2.54], ["inches", 2.54], ['"', 2.54], ["''", 2.54],
  ["אינץ", 2.54], ["אינץ'", 2.54], ["אינטש", 2.54],
  ["ft", 30.48], ["feet", 30.48], ["foot", 30.48], ["'", 30.48],
];
var UNIT_RE =
  '(?:mm|cm|m|meters?|metres?|in(?:ch(?:es)?)?|"|\'\'|ft|feet|foot|ס"מ|סמ|מ"מ|ממ|מטר|מ\'|אינץ\'?|אינטש)';
// a number, optionally with a mixed fraction ("78 3/8") or comma decimal
var NUM_RE = "\\d{1,4}(?:[.,]\\d{1,3})?(?:\\s+\\d{1,2}\\s*/\\s*\\d{1,2})?|\\d{1,2}\\s*/\\s*\\d{1,2}";

// Hebrew punctuation gershayim/geresh are typographic twins of " and ' and
// appear interchangeably on Israeli retail pages — fold them before matching.
export function normalizeText(s) {
  return String(s || "")
    .replace(/[״“”″]/g, '"') // gershayim + curly/prime quotes — all mean inches here
    .replace(/[׳‘’′]/g, "'")
    .replace(/[‎‏‪-‮]/g, "") // bidi marks
    .replace(/ /g, " ");
}

export function unitFactor(u) {
  if (!u) return null;
  u = normalizeText(u).trim().toLowerCase().replace(/\.$/, "");
  for (var i = 0; i < UNITS.length; i++) if (UNITS[i][0] === u) return UNITS[i][1];
  if (/^meters?$|^metres?$/.test(u)) return 100;
  return null;
}

// "78 3/8" → 78.375 · "55,5" → 55.5 · "3/4" → 0.75
export function readNumber(s) {
  s = normalizeText(s).trim();
  var mixed = s.match(/^(\d+(?:[.,]\d+)?)\s+(\d+)\s*\/\s*(\d+)$/);
  if (mixed) return parseFloat(mixed[1].replace(",", ".")) + +mixed[2] / +mixed[3];
  var frac = s.match(/^(\d+)\s*\/\s*(\d+)$/);
  if (frac) return +frac[1] / +frac[2];
  var v = parseFloat(s.replace(/,/g, "."));
  return isFinite(v) ? v : null;
}

// One measurement → cm. `dflt` is the unit assumed when the page states none;
// a bare number over 300 is almost certainly mm (a 1400mm sofa, not 14m).
export function toCm(numStr, unitStr, dflt) {
  var n = readNumber(numStr);
  if (n == null || !isFinite(n) || n <= 0) return null;
  var f = unitFactor(unitStr);
  if (f == null) f = dflt || (n > 300 ? 0.1 : 1);
  var cm = n * f;
  return cm > 0.5 && cm < 2000 ? Math.round(cm * 10) / 10 : null;
}

/* ---- HTML → text + structured data ---------------------------------------- */

export function htmlToText(html) {
  var t = String(html || "")
    .replace(/<(script|style|noscript|svg)[^>]*>[\s\S]*?<\/\1>/gi, " ")
    .replace(/<!--[\s\S]*?-->/g, " ")
    .replace(/<\/(td|th|li|tr|p|div|dt|dd|h[1-6])>/gi, " · ")
    .replace(/<br\s*\/?>/gi, " · ")
    .replace(/<[^>]+>/g, " ");
  return normalizeText(decodeEntities(t)).replace(/\s+/g, " ").trim();
}

export function decodeEntities(s) {
  var named = { amp: "&", lt: "<", gt: ">", quot: '"', apos: "'", nbsp: " ", times: "×", quot2: '"' };
  return String(s || "")
    .replace(/&#x([0-9a-f]+);/gi, function (_, h) { return cp(parseInt(h, 16)); })
    .replace(/&#(\d+);/g, function (_, d) { return cp(+d); })
    .replace(/&([a-z]+\d?);/gi, function (m, n) {
      n = n.toLowerCase();
      return named[n] != null ? named[n] : m;
    });
  function cp(n) {
    try { return String.fromCodePoint(n); } catch (e) { return " "; }
  }
}

export function pageTitle(html) {
  var m = String(html || "").match(/<title[^>]*>([\s\S]{0,300}?)<\/title>/i);
  var t = m ? normalizeText(decodeEntities(m[1])).replace(/\s+/g, " ").trim() : "";
  if (!t) {
    var og = String(html || "").match(/<meta[^>]+property=["']og:title["'][^>]+content=["']([^"']{1,200})["']/i);
    if (og) t = normalizeText(decodeEntities(og[1])).trim();
  }
  return t;
}

// schema.org Product blocks — the highest-quality source by far: the retailer
// states width/depth/height itself instead of us guessing from prose.
export function parseJsonLd(html) {
  var out = [], re = /<script[^>]+application\/ld\+json[^>]*>([\s\S]*?)<\/script>/gi, m;
  while ((m = re.exec(html))) {
    var raw = decodeEntities(m[1]).trim();
    var j = null;
    try { j = JSON.parse(raw); } catch (e) { continue; }
    walk(j, 0);
  }
  return out;
  function walk(n, depth) {
    if (!n || depth > 6) return;
    if (Array.isArray(n)) return n.forEach(function (x) { walk(x, depth + 1); });
    if (typeof n !== "object") return;
    var ty = n["@type"];
    ty = Array.isArray(ty) ? ty.join(" ") : String(ty || "");
    if (/Product|IndividualProduct|ProductModel/i.test(ty)) out.push(n);
    for (var k in n) if (k !== "@type") walk(n[k], depth + 1);
  }
}

// schema.org values come as "78 3/8 \"", "140 cm", 140, or a QuantitativeValue
function ldLength(v) {
  if (v == null) return null;
  if (typeof v === "number") return toCm(String(v), null, null);
  if (typeof v === "object") {
    var val = v.value != null ? v.value : v["@value"];
    var u = v.unitCode || v.unitText || null;
    var UC = { CMT: "cm", MMT: "mm", MTR: "m", INH: "in", FOT: "ft" };
    if (u && UC[String(u).toUpperCase()]) u = UC[String(u).toUpperCase()];
    return val == null ? null : toCm(String(val), u, null);
  }
  var s = normalizeText(String(v)).trim();
  var m = s.match(new RegExp("^(" + NUM_RE + ")\\s*(" + UNIT_RE + ")?", "i"));
  return m ? toCm(m[1], m[2], null) : null;
}

/* ---- dimension extraction -------------------------------------------------- */

var AXIS_WORDS = [
  ["w", '(?:width|wide|breadth|רוחב|רוֹחַב)'],
  ["d", "(?:depth|deep|עומק)"],
  ["l", "(?:length|long|אורך)"],
  ["h", "(?:height|high|tall|גובה)"],
  ["dia", '(?:diameter|dia\\.?|ø|קוטר)'],
];

// Labeled measurements anywhere in the page text: "Width: 140 cm",
// "רוחב 140 ס\"מ", "Height (cm): 90". Returns {w,d,l,h,dia} in cm.
export function labeledDims(text) {
  var out = {};
  AXIS_WORDS.forEach(function (aw) {
    var axis = aw[0], word = aw[1];
    // label [ (unit) ] [:=] [filler] number [unit]
    // the filler matters: dimensions.com writes prose — "width of 66.125" (168 cm)"
    var re = new RegExp(
      word + "\\s*(?:\\(\\s*(" + UNIT_RE + ")\\s*\\))?\\s*[:=]?\\s*" +
        "(?:of|is|are|measures|approx\\.?|about|around|up to|~|כ-|של)?\\s*(" +
        NUM_RE + ")\\s*(" + UNIT_RE + ")?",
      "gi",
    );
    var m, vals = [];
    while ((m = re.exec(text))) {
      var cm = toCm(m[2], m[3] || m[1], null);
      if (cm != null) vals.push(cm);
      if (vals.length > 6) break;
    }
    // "140 cm wide" — the reversed order English prose uses
    if (axis !== "dia") {
      var re2 = new RegExp("(" + NUM_RE + ")\\s*(" + UNIT_RE + ")\\s*(?:" + word + ")", "gi");
      while ((m = re2.exec(text))) {
        var cm2 = toCm(m[1], m[2], null);
        if (cm2 != null) vals.push(cm2);
        if (vals.length > 8) break;
      }
    }
    if (vals.length) out[axis] = vals[0];
  });
  return out;
}

// Compact form: "140 x 60 x 90 cm", "W140xD60xH90", "140×200 ס\"מ".
// Returns an ordered list of triples/pairs with whatever axis letters were given.
export function compactDims(text) {
  var pre = "(?:\\(?\\s*(W|D|H|L|ר|ע|ג|א|רוחב|עומק|גובה|אורך)\\s*\\)?\\s*[:.]?\\s*)?";
  var num = "(" + NUM_RE + ")\\s*(" + UNIT_RE + ")?";
  var sep = "\\s*[x×*✕]\\s*";
  var re = new RegExp(pre + num + sep + pre + num + sep + pre + num, "gi");
  var out = [], m;
  while ((m = re.exec(text)) && out.length < 8) {
    var trail = text.slice(re.lastIndex, re.lastIndex + 12).match(new RegExp("^\\s*(" + UNIT_RE + ")", "i"));
    var unit = m[3] || m[6] || m[9] || (trail && trail[1]) || null;
    var v = [
      { tag: m[1], cm: toCm(m[2], m[3] || unit, null) },
      { tag: m[4], cm: toCm(m[5], m[6] || unit, null) },
      { tag: m[7], cm: toCm(m[8], m[9] || unit, null) },
    ];
    if (v.every(function (x) { return x.cm != null; })) out.push(v);
  }
  return out;
}

var TAG_AXIS = {
  w: "w", d: "d", h: "h", l: "l",
  ר: "w", ע: "d", ג: "h", א: "l",
  רוחב: "w", עומק: "d", גובה: "h", אורך: "l",
};

/* ---- mapping to the model's own frame -------------------------------------- */

// Our local frame is x=width, z=depth, y=height (see furniture.js). A product
// page may give width/depth/length/diameter in any mix, so fold them down.
export function foldAxes(d) {
  var o = { w: d.w != null ? d.w : null, d: d.d != null ? d.d : null, h: d.h != null ? d.h : null };
  if (d.dia != null) {
    if (o.w == null) o.w = d.dia;
    if (o.d == null) o.d = d.dia;
  }
  // "length" is the depth axis for anything you lie/sit on (bed, sofa, table)
  // unless depth was already given, in which case it is the long horizontal one.
  if (d.l != null) {
    if (o.d == null) o.d = d.l;
    else if (o.w == null) o.w = d.l;
  }
  return o;
}

// An unlabeled triple ("140 x 60 x 90") carries no axis order. Pick the
// permutation closest in proportion to the model we already have — a real
// product of the same category has roughly the shape of our stock model.
export function orderTriple(vals, hint) {
  var perms = [[0,1,2],[0,2,1],[1,0,2],[1,2,0],[2,0,1],[2,1,0]];
  var ref = [hint && hint.w || 60, hint && hint.d || 60, hint && hint.h || 90];
  var best = null, bestErr = Infinity;
  perms.forEach(function (p) {
    var err = 0;
    for (var i = 0; i < 3; i++) err += Math.abs(Math.log(vals[p[i]] / ref[i]));
    if (err < bestErr) { bestErr = err; best = p; }
  });
  return { w: vals[best[0]], d: vals[best[1]], h: vals[best[2]], err: bestErr };
}

// Is this a believable size for this kind of furniture at all?
// A page usually lists several products, so a "spec table" can easily pair one
// model's width with another's depth. Any axis more than 5× off the model we
// are replacing is rejected outright rather than averaged away — that is what
// caught a fridge parsed as 75.6 × 4 × 177.8 cm.
export function plausible(dims, hint) {
  var ok = true, score = 0, n = 0;
  ["w", "d", "h"].forEach(function (k) {
    var v = dims[k];
    if (v == null) return;
    if (v < 2 || v > (k === "h" ? 400 : 800)) ok = false;
    if (hint && hint[k]) {
      var r = Math.abs(Math.log(v / hint[k]));
      if (r > 1.61) ok = false; // >5× the catalog model in either direction
      score += r < 0.35 ? 1 : r < 0.9 ? 0.6 : r < 1.6 ? 0.2 : -0.6;
      n++;
    }
  });
  return { ok: ok, fit: n ? score / n : 0.4 };
}

/* ---- one page → dimension candidates --------------------------------------- */

var BRAND_STOP = /^(the|a|an|new|for|and|של|עם)$/i;

export function candidatesFromPage(page, hint, query) {
  var html = page.html || "", url = page.url || "", out = [];
  var host = hostOf(url);
  var text = htmlToText(html).slice(0, 240000);
  var title = page.title || pageTitle(html) || url;
  var qTokens = String(query || "")
    .toLowerCase()
    .split(/[^\p{L}\p{N}]+/u)
    .filter(function (s) { return s.length > 2 && !BRAND_STOP.test(s); });
  var hostBonus = qTokens.some(function (tk) { return host.indexOf(tk) >= 0; }) ? 0.18 : 0;
  var titleHits = qTokens.filter(function (tk) { return title.toLowerCase().indexOf(tk) >= 0; }).length;
  var titleBonus = qTokens.length ? Math.min(0.22, (titleHits / qTokens.length) * 0.22) : 0;

  function push(dims, conf, how, name) {
    var f = foldAxes(dims);
    if (f.w == null && f.d == null && f.h == null) return;
    var pl = plausible(f, hint);
    if (!pl.ok) return;
    var have = ["w", "d", "h"].filter(function (k) { return f[k] != null; }).length;
    out.push({
      w: f.w, d: f.d, h: f.h,
      url: url, host: host, title: name || title, how: how,
      conf: clamp01(conf + hostBonus + titleBonus + have * 0.06 + pl.fit * 0.2),
    });
  }

  // 1. structured product data — trusted most
  parseJsonLd(html).forEach(function (p) {
    var dims = {
      w: ldLength(p.width), d: ldLength(p.depth), h: ldLength(p.height), l: ldLength(p.length),
    };
    var nm = typeof p.name === "string" ? normalizeText(p.name).trim() : "";
    if (dims.w != null || dims.d != null || dims.h != null || dims.l != null)
      push(dims, 0.55, "jsonld", nm || title);
  });

  // 2. explicitly labeled prose/spec tables
  var lab = labeledDims(text);
  if (Object.keys(lab).length) push(lab, 0.34 + Math.min(3, Object.keys(lab).length) * 0.04, "labeled");

  // 3. compact "a x b x c" triples — ordered by tag when tagged, by shape if not
  compactDims(text).forEach(function (tri) {
    var tagged = {}, n = 0;
    tri.forEach(function (v) {
      var ax = v.tag && TAG_AXIS[normalizeText(v.tag).toLowerCase()];
      if (ax && tagged[ax] == null) { tagged[ax] = v.cm; n++; }
    });
    if (n >= 2) push(tagged, 0.36, "compact-tagged");
    else {
      var ord = orderTriple(tri.map(function (v) { return v.cm; }), hint);
      push({ w: ord.w, d: ord.d, h: ord.h }, 0.2 - Math.min(0.12, ord.err * 0.05), "compact");
    }
  });

  return out;
}

function clamp01(v) { return Math.max(0, Math.min(1, v)); }

export function hostOf(u) {
  try { return new URL(u).hostname.replace(/^www\./, ""); } catch (e) { return ""; }
}

/* ---- ranking --------------------------------------------------------------- */

// Independent sources agreeing on a size is the strongest signal there is, so
// cluster near-identical candidates (5% tolerance) and reward the cluster.
export function rankCandidates(cands) {
  var groups = [];
  cands.forEach(function (c) {
    for (var i = 0; i < groups.length; i++) {
      if (near(groups[i].rep, c)) {
        groups[i].members.push(c);
        if (c.conf > groups[i].rep.conf) groups[i].rep = c;
        return;
      }
    }
    groups.push({ rep: c, members: [c] });
  });
  var out = groups.map(function (g) {
    var hosts = {};
    g.members.forEach(function (m) { hosts[m.host] = 1; });
    var nHosts = Object.keys(hosts).length;
    var best = g.members.slice().sort(function (a, b) { return b.conf - a.conf; })[0];
    return {
      w: best.w, d: best.d, h: best.h,
      url: best.url, host: best.host, title: best.title, how: best.how, img: best.img || null,
      sources: Object.keys(hosts),
      conf: clamp01(best.conf + Math.min(0.25, (nHosts - 1) * 0.12)),
    };
  });
  return out.sort(function (a, b) { return b.conf - a.conf; });

  function near(a, b) {
    var keys = ["w", "d", "h"], seen = 0;
    for (var i = 0; i < keys.length; i++) {
      var x = a[keys[i]], y = b[keys[i]];
      if (x == null || y == null) continue;
      if (Math.abs(x - y) > Math.max(2, x * 0.05)) return false;
      seen++;
    }
    return seen >= 2;
  }
}

/* ---- web search ------------------------------------------------------------ */

var SKIP_HOSTS =
  /(^|\.)(facebook|instagram|tiktok|twitter|x|youtube|pinterest|linkedin|reddit|quora|wikipedia|ebay)\.[a-z.]+$/i;

// Engines are tried in order and the first one that returns any hit wins.
// None of them is dependable on its own: DuckDuckGo answers 202 with a
// challenge page once you burst it, Mojeek shows a captcha, Bing/Ecosia hide
// their links behind JS. Brave's HTML page is the sturdiest fallback.
export function searchUrls(query, lang) {
  var q = encodeURIComponent(query);
  var kl = lang === "he" ? "il-he" : "us-en";
  return [
    "https://html.duckduckgo.com/html/?kl=" + kl + "&q=" + q,
    "https://search.brave.com/search?q=" + q,
    "https://lite.duckduckgo.com/lite/?kl=" + kl + "&q=" + q,
    "https://www.mojeek.com/search?q=" + q,
  ];
}

/* ---- IKEA: a first-party provider ------------------------------------------
   IKEA is by far the most-asked-for brand and its own search endpoint states
   the size as "80x28x202 ס\"מ" (W×D×H) — no scraping, no rendering, no
   captcha. Used only when the query actually names IKEA. */
export function ikeaSearchUrl(query, lang) {
  var loc = lang === "he" ? "il/he" : "us/en";
  return (
    "https://sik.search.blue.cdtapps.com/" + loc + "/search-result-page?q=" +
    encodeURIComponent(query.replace(/ikea|איקאה/gi, "").trim()) + "&types=PRODUCT&size=8"
  );
}

export function parseIkea(jsonText, hint) {
  var d;
  try { d = JSON.parse(jsonText); } catch (e) { return []; }
  var items = [];
  try { items = d.searchResultPage.products.main.items || []; } catch (e) { return []; }
  var out = [];
  items.forEach(function (it) {
    var p = it.product || {};
    var mt = normalizeText(p.itemMeasureReferenceText || "");
    var nums = mt.match(new RegExp(NUM_RE, "g")) || [];
    // "210/79 ל'" is a volume in liters, not a size — only x-separated forms count
    if (!/[x×*]/i.test(mt) || nums.length < 2) return;
    // the us/en catalog states inches ("31 1/2x11x79 1/2 \""), il/he states cm
    var unit = /ס"מ|סמ|cm/.test(mt) ? "cm" : /"|''|inch/.test(mt) ? '"' : null;
    var vals = nums.slice(0, 3).map(function (n) { return toCm(n, unit, 1); });
    if (vals.some(function (v) { return v == null; })) return;
    // IKEA always writes width × depth × height (a 2-number bed is width × length)
    var dims = vals.length >= 3 ? { w: vals[0], d: vals[1], h: vals[2] } : { w: vals[0], d: vals[1] };
    var pl = plausible(dims, hint);
    if (!pl.ok) return;
    out.push({
      w: dims.w != null ? dims.w : null,
      d: dims.d != null ? dims.d : null,
      h: dims.h != null ? dims.h : null,
      url: p.pipUrl || "https://www.ikea.com/",
      host: "ikea.com",
      title: [p.name, p.typeName, mt].filter(Boolean).join(" · "),
      how: "ikea",
      img: p.mainImageUrl || null,
      conf: Math.max(0.35, Math.min(0.97, 0.7 + (vals.length >= 3 ? 0.12 : 0) + pl.fit * 0.15)),
    });
  });
  return out;
}

// DuckDuckGo wraps every hit in a redirect: /l/?uddg=<encoded target>;
// Brave/Mojeek link straight out, which means their own navigation looks just
// like a result — hence the engine-host filter and the challenge-page check.
// (A captcha page silently returned "blog.mojeek.com, community.mojeek.com…"
// as the top hits before that check existed.)
var CHALLENGE = /verification required|complete the challenge|unusual traffic|captcha|detected anomal/i;
var ENGINE_AFFILIATED = /(^|\.)(mojeek\.com|buttondown\.email|mastodon\.social|brave\.com|duckduckgo\.com|duck\.com)$/i;

export function parseSearchResults(html, engineUrl) {
  if (CHALLENGE.test(String(html).slice(0, 60000))) return [];
  var engineHost = hostOf(engineUrl || "").split(".").slice(-2).join(".");
  var out = [], seen = {}, m;
  var re = /uddg=([^&"'\s]+)/gi;
  while ((m = re.exec(html))) {
    var u;
    try { u = decodeURIComponent(m[1]); } catch (e) { continue; }
    add(u);
  }
  if (!out.length) {
    var re2 = /<a[^>]+href="(https?:\/\/[^"]+)"/gi;
    while ((m = re2.exec(html))) add(decodeEntities(m[1]));
  }
  return out;
  function add(u) {
    var h = hostOf(u);
    if (!h || SKIP_HOSTS.test(h) || ENGINE_AFFILIATED.test(h)) return;
    if (engineHost && h.slice(-engineHost.length) === engineHost) return;
    if (/\.(pdf|jpg|png|gif|zip|mp4)(\?|$)/i.test(u)) return;
    if (seen[u]) return;
    seen[u] = 1;
    out.push(u);
  }
}

// Three shots at the engine. The bare query finds the product page (often a
// JS-rendered shop that yields nothing); the two spec-flavored variants pull up
// server-rendered spec sheets and dimension aggregators, which is where the
// numbers actually are. Measured: "Bosch KGN39VLEB" alone found nothing,
// "… dimensions height width depth cm" found the correct 60×66×203.
export function buildQueries(query) {
  var q = String(query || "").trim();
  var he = /[֐-׿]/.test(q);
  var qs = [q];
  if (!/dimension|מידות|גודל/i.test(q)) qs.push(q + (he ? ' מידות ס"מ' : " dimensions cm"));
  if (!/spec|מפרט/i.test(q))
    qs.push(q + (he ? " מפרט טכני רוחב עומק גובה" : " specifications width depth height"));
  return { queries: qs, lang: he ? "he" : "en" };
}

/* ---- orchestration --------------------------------------------------------- */

// `get(url)` must resolve to {ok, status, text, url} — injected so the browser
// can call the relay proxy while the relay itself calls the real internet.
// `opts.url` skips search entirely and reads one product page the user pasted.
export async function lookupProduct(query, opts) {
  opts = opts || {};
  var get = opts.get,
    hint = opts.hint || null,
    maxPages = opts.maxPages || 6,
    stagger = opts.stagger || 0,
    onStep = opts.onStep || function () {};
  if (!get) throw new Error("lookupProduct needs opts.get");

  if (opts.url) {
    onStep("page", opts.url);
    var one = await safeGet(get, opts.url);
    var cs = [];
    if (one && one.ok)
      try { cs = candidatesFromPage({ url: one.url || opts.url, html: one.text }, hint, query); } catch (e) {}
    return {
      query: query, url: opts.url, results: rankCandidates(cs).slice(0, opts.limit || 8),
      scanned: one && one.ok ? 1 : 0,
      errors: one && one.ok ? [] : ["fetch " + hostOf(opts.url) + " " + ((one && one.status) || "failed")],
    };
  }

  var bq = buildQueries(query);
  var errors = [];

  // IKEA answers authoritatively about its own catalog; run it alongside search.
  // Locale follows the app's language, not just the query's script, so a Hebrew
  // user searching "IKEA MALM" still gets the Israeli catalog (in cm).
  var ikeaP = /ikea|איקאה/i.test(query)
    ? safeGet(get, ikeaSearchUrl(query, opts.lang || bq.lang)).then(function (r) {
        return r && r.ok ? parseIkea(r.text, hint) : [];
      })
    : Promise.resolve([]);

  // every query variant, in parallel — each falls back to the next engine.
  // The stagger keeps three simultaneous hits from tripping the engines' own
  // burst protection (DuckDuckGo starts answering 202 challenge pages).
  var lists = await Promise.all(
    bq.queries.map(async function (q, qi) {
      if (stagger && qi) await sleep(stagger * qi);
      var engines = searchUrls(q, bq.lang);
      for (var e = 0; e < engines.length; e++) {
        onStep("search", q);
        var r = await safeGet(get, engines[e]);
        if (!r || !r.ok) {
          errors.push("search " + hostOf(engines[e]) + " " + ((r && r.status) || "failed"));
          continue;
        }
        var hits = parseSearchResults(r.text, engines[e]);
        if (hits.length) return hits;
        errors.push("search " + hostOf(engines[e]) + " blocked");
      }
      return [];
    }),
  );

  // Round-robin across the variants so the spec-flavored searches always get
  // slots — taking the first N of a concatenated list would spend them all on
  // the bare query's (usually unscrapable) shop pages.
  var urls = [], seen = {}, depth = 0;
  for (; depth < 12 && urls.length < maxPages * 3; depth++)
    for (var li = 0; li < lists.length; li++) {
      var u = lists[li][depth];
      if (u && !seen[u]) { seen[u] = 1; urls.push(u); }
    }
  // at most two pages per host, so one shop can't fill every slot
  var perHost = {}, picked = [];
  urls.forEach(function (u) {
    var h = hostOf(u);
    perHost[h] = (perHost[h] || 0) + 1;
    if (perHost[h] <= 2 && picked.length < maxPages) picked.push(u);
  });

  var pages = await Promise.all(
    picked.map(function (u) {
      onStep("page", u);
      return safeGet(get, u).then(function (r) {
        return r && r.ok ? { url: r.url || u, html: r.text } : null;
      });
    }),
  );

  var cands = await ikeaP;
  pages.filter(Boolean).forEach(function (p) {
    try { cands = cands.concat(candidatesFromPage(p, hint, query)); } catch (err) { errors.push(String(err)); }
  });
  var ranked = rankCandidates(cands);
  return {
    query: query,
    results: ranked.slice(0, opts.limit || 8),
    scanned: pages.filter(Boolean).length,
    errors: errors,
  };
}

function sleep(ms) {
  return new Promise(function (r) { setTimeout(r, ms); });
}
async function safeGet(get, url) {
  try { return await get(url); } catch (e) { return { ok: false, status: 0, text: "", error: String(e) }; }
}

/* ---- applying a result to an item ------------------------------------------ */

// Keep whatever the source did not state, round to whole cm, and respect the
// same clamps the manual W/D/H inputs use (see bindNum in ui.js).
export function applyDims(item, dims) {
  var out = { w: item.w, d: item.d, h: item.h };
  if (dims.w != null) out.w = Math.max(5, Math.min(800, Math.round(dims.w)));
  if (dims.d != null) out.d = Math.max(5, Math.min(800, Math.round(dims.d)));
  if (dims.h != null) out.h = Math.max(2, Math.min(400, Math.round(dims.h)));
  return out;
}

export function fmtDims(d) {
  function n(v) { return v == null ? "—" : Math.round(v); }
  return n(d.w) + " × " + n(d.d) + " × " + n(d.h);
}
