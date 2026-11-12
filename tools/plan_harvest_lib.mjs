// Pure helpers for the floor-plan harvester (tools/plan_harvest.mjs): robots.txt
// parsing and matching, sitemap and link extraction, bot-wall detection and
// page/PDF scoring. No network or disk here, so tests can drive every rule.

export const USER_AGENT = "ModelForgePlanBench/0.1 (floor-plan research crawler; one request per 3 s per host)";
export const UA_TOKEN = "modelforgeplanbench";

// robots.txt -> { groups: [{ agents, rules: [{ allow, path }], delay }], sitemaps }
export function parseRobots(text) {
  const groups = [];
  const sitemaps = [];
  let group = null;
  let lastWasAgent = false;
  for (const raw of String(text || "").split(/\r?\n/)) {
    const line = raw.replace(/#.*$/, "").trim();
    const m = /^([A-Za-z-]+)\s*:\s*(.*)$/.exec(line);
    if (!m) continue;
    const key = m[1].toLowerCase();
    const value = m[2].trim();
    if (key === "sitemap") { if (value) sitemaps.push(value); continue; }
    if (key === "user-agent") {
      if (!lastWasAgent || !group) { group = { agents: [], rules: [], delay: 0 }; groups.push(group); }
      group.agents.push(value.toLowerCase());
      lastWasAgent = true;
      continue;
    }
    lastWasAgent = false;
    if (!group) continue;
    if (key === "allow" || key === "disallow") {
      if (value || key === "allow") group.rules.push({ allow: key === "allow", path: value });
    } else if (key === "crawl-delay") {
      const d = Number(value);
      if (Number.isFinite(d) && d > 0) group.delay = d;
    }
  }
  return { groups, sitemaps };
}

// The group for our token if one names us, else the "*" group(s).
export function robotsGroup(robots, token = UA_TOKEN) {
  const ours = robots.groups.filter((g) => g.agents.some((a) => a !== "*" && token.includes(a)));
  const chosen = ours.length ? ours : robots.groups.filter((g) => g.agents.includes("*"));
  return {
    rules: chosen.flatMap((g) => g.rules),
    delay: Math.max(0, ...chosen.map((g) => g.delay)),
  };
}

function ruleRegex(path) {
  const anchored = path.endsWith("$");
  const body = (anchored ? path.slice(0, -1) : path)
    .split("*").map((s) => s.replace(/[.+?^${}()|[\]\\]/g, "\\$&")).join(".*");
  return new RegExp("^" + body + (anchored ? "$" : ""));
}

function decodedPath(path) {
  try { return decodeURI(path); } catch { return path; }
}

// Longest matching rule wins; Allow wins a tie (RFC 9309).
export function robotsAllows(group, pathAndQuery) {
  let best = null;
  const candidates = [pathAndQuery, decodedPath(pathAndQuery)];
  for (const rule of group.rules) {
    if (!rule.path) continue;
    const re = ruleRegex(rule.path);
    if (!candidates.some((p) => re.test(p))) continue;
    if (!best || rule.path.length > best.path.length || (rule.path.length === best.path.length && rule.allow)) best = rule;
  }
  return !best || best.allow;
}

// What a robots.txt response status means (RFC 9309 §2.3.1): 2xx = use its
// rules; other 4xx = no robots.txt, crawl allowed (common on CDNs, which 403
// a missing object); 429 or 5xx = unreachable, treat as fully disallowed.
export function robotsStatusPolicy(status) {
  if (status >= 200 && status < 300) return "rules";
  if (status === 429 || status >= 500) return "disallow";
  if (status >= 400) return "allow-all";
  return "allow-all";
}

export function sitemapLocs(xml) {
  return [...String(xml || "").matchAll(/<loc>\s*(?:<!\[CDATA\[)?([^<\]]+?)(?:\]\]>)?\s*<\/loc>/gi)]
    .map((m) => m[1].replace(/&amp;/g, "&").trim());
}

export function isSitemapIndex(xml) {
  return /<sitemapindex[\s>]/i.test(String(xml || ""));
}

const BOT_WALL = /challenges\.cloudflare\.com|cf-chl-|cf_chl_|Just a moment\.\.\.|Attention Required|verify you are human|px-captcha|g-recaptcha|hcaptcha\.com|perimeterx|datadome|Access denied|Request unsuccessful\. Incapsula/i;

// A response that means "stop crawling this host".
export function blockReason(status, contentType, body) {
  if (status === 401 || status === 403 || status === 429 || status === 451 || status === 503) return "http " + status;
  if (/html/i.test(contentType || "") && BOT_WALL.test(String(body || "").slice(0, 20000))) return "bot wall";
  return null;
}

function stripTags(html) {
  return html.replace(/<script[\s\S]*?<\/script>|<style[\s\S]*?<\/style>/gi, " ")
    .replace(/<[^>]+>/g, " ").replace(/&nbsp;/g, " ").replace(/&amp;/g, "&").replace(/\s+/g, " ").trim();
}

export function pageTitle(html) {
  const m = /<title[^>]*>([\s\S]*?)<\/title>/i.exec(String(html || ""));
  return m ? stripTags(m[1]).slice(0, 160) : "";
}

function resolve(href, base) {
  try {
    const url = new URL(href.replace(/\\\//g, "/").replace(/&amp;/g, "&").trim(), base);
    if (url.protocol !== "http:" && url.protocol !== "https:") return null;
    url.hash = "";
    return url.href;
  } catch { return null; }
}

// Anchors with their visible text, plus bare PDF URLs anywhere in the page
// (JSON blobs, data attributes, viewer iframes like ?file=...pdf).
export function extractLinks(html, base) {
  const text = String(html || "");
  const pages = new Map();
  const pdfs = new Map();
  const addPdf = (url, label) => {
    if (url && !pdfs.has(url)) pdfs.set(url, label || "");
    else if (url && label && !pdfs.get(url)) pdfs.set(url, label);
  };
  for (const m of text.matchAll(/<a\b[^>]*?\bhref\s*=\s*(["'])(.*?)\1[^>]*>([\s\S]*?)<\/a>/gi)) {
    const url = resolve(m[2], base);
    if (!url) continue;
    const label = stripTags(m[3]).slice(0, 120);
    if (/\.pdf$/i.test(new URL(url).pathname)) addPdf(url, label);
    else if (!pages.has(url)) pages.set(url, label);
  }
  const flat = text.replace(/\\\//g, "/");
  for (const m of flat.matchAll(/(?:https?:)?\/\/[^\s"'<>()]+?\.pdf(?![a-z0-9])(?:\?[^\s"'<>()]*)?/gi)) {
    addPdf(resolve(m[0].startsWith("//") ? "https:" + m[0] : m[0], base), "");
  }
  for (const m of flat.matchAll(/\b(?:href|src|data-[a-z-]+)\s*=\s*(["'])([^"']+?\.pdf(?:\?[^"']*)?)\1/gi)) {
    addPdf(resolve(m[2], base), "");
  }
  return {
    pages: [...pages].map(([url, label]) => ({ url, label })),
    pdfs: [...pdfs].map(([url, label]) => ({ url, label })),
  };
}

const IMAGE_EXT = /\.(?:jpe?g|png|webp)(?:$|\?)/i;
const NOT_CONTENT = /logo|icon|favicon|sprite|avatar|badge|arrow|button|banner-small|placeholder|loader|spinner|flag|social|whatsapp|facebook|instagram|youtube|map-?pin|marker/i;

// Largest candidate of a srcset ("a.jpg 480w, b.jpg 1200w").
function largestFromSrcset(srcset) {
  let best = null, bestW = -1;
  for (const part of srcset.split(",")) {
    const [url, size] = part.trim().split(/\s+/);
    const w = size ? parseFloat(size) * (size.endsWith("x") ? 1000 : 1) : 0;
    if (url && w > bestW) { best = url; bestW = w; }
  }
  return best;
}

/**
 * Content images on a page: <img> (src, srcset — largest — and lazy-load
 * data-* attributes), <source srcset> and inline CSS background images.
 * Logos, icons and social buttons are skipped. Returns [{ url, alt }].
 */
export function extractImages(html, base) {
  const text = String(html || "");
  const found = new Map();
  const add = (raw, alt = "") => {
    if (!raw) return;
    const url = resolve(raw, base);
    if (!url || !IMAGE_EXT.test(new URL(url).pathname) || NOT_CONTENT.test(url) || NOT_CONTENT.test(alt)) return;
    if (!found.has(url) || (alt && !found.get(url))) found.set(url, alt);
  };
  for (const m of text.matchAll(/<(img|source)\b([^>]*)>/gi)) {
    const attrs = m[2];
    const attr = (name) => (new RegExp(`\\b${name}\\s*=\\s*(["'])(.*?)\\1`, "i").exec(attrs) || [])[2];
    const alt = stripTags(attr("alt") || attr("title") || "").slice(0, 160);
    const set = attr("data-srcset") || attr("srcset");
    add((set && largestFromSrcset(set)) || attr("data-lazy-src") || attr("data-src") || attr("data-original") || attr("src"), alt);
  }
  for (const m of text.matchAll(/background(?:-image)?\s*:\s*url\(\s*(["']?)([^"')]+)\1\s*\)/gi)) add(m[2]);
  return [...found].map(([url, alt]) => ({ url, alt }));
}

/** WordPress-style thumbnail URL → its full-size original ("x-1024x683.jpg" → "x.jpg"). */
export function originalImageUrl(url) {
  return url.replace(/-\d{2,5}x\d{2,5}(?=\.(?:jpe?g|png|webp)(?:$|\?))/i, "");
}

/** File extension from the first bytes, or null when not a JPEG/PNG/WebP. */
export function imageType(bytes) {
  if (bytes.length < 12) return null;
  if (bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff) return "jpg";
  if (bytes[0] === 0x89 && bytes[1] === 0x50 && bytes[2] === 0x4e && bytes[3] === 0x47) return "png";
  if (bytes.subarray(0, 4).toString("latin1") === "RIFF" && bytes.subarray(8, 12).toString("latin1") === "WEBP") return "webp";
  return null;
}

// Interior renders and photos ("הדמיה", "סלון", "interior"…) rank first.
const INTERIOR_WORDS = /הדמי|פנים|סלון|מטבח|חדר|אמבט|רחצה|מרפס|לובי|עיצוב|interior|render|living|kitchen|bedroom|bath|lobby|design|apartment|gallery|גלרי/i;
export function imageScore(url, alt = "", pageTitle = "") {
  let decoded = url;
  try { decoded = decodeURIComponent(url); } catch { /* keep raw */ }
  return (INTERIOR_WORDS.test(decoded) ? 2 : 0) + (INTERIOR_WORDS.test(alt) ? 2 : 0) + (INTERIOR_WORDS.test(pageTitle) ? 1 : 0);
}

const PLAN_WORDS =/project|פרויקט|פרוייקט|apartment|דיר|plan|תוכני|תכני|תשריט|קומ|floor|building|בניין|בנין|מגרש|lot|model|דגם|חדרים|rooms|neighborhood|שכונ|residen|מגורים/i;
const SKIP_PAGES = /career|קריירה|דרושים|jobs|investor|משקיעים|news|blog|כתבות|מגזין|privacy|פרטיות|terms|תקנון|accessib|נגישות|contact|צור-קשר|login|cart|wp-admin|wp-json|feed|tag\/|author\/|\/en\/|\/ru\/|\/fr\/|\/ar\//i;

// Higher = crawl sooner; null = never.
export function pageScore(url, label = "") {
  if (SKIP_PAGES.test(url)) return null;
  if (/\.(?:jpe?g|png|gif|webp|svg|zip|docx?|xlsx?|mp4|mp3)(?:$|\?)/i.test(url)) return null;
  let score = 0;
  let decoded = url;
  try { decoded = decodeURIComponent(url); } catch { /* keep raw */ }
  if (PLAN_WORDS.test(decoded)) score += 2;
  if (PLAN_WORDS.test(label)) score += 1;
  return score;
}

const SKIP_PDFS = /privacy|פרטיות|terms|תקנון|תנאי.?שימוש|accessib|נגישות|מחירון|price|career|דרושים|דוח|report|financial|כספי|presentation|מצגת-משקיעים|esg|קיימות|הצהרת|declaration|policy|מדיניות/i;

export function pdfWanted(url, label = "") {
  let decoded = url;
  try { decoded = decodeURIComponent(url); } catch { /* keep raw */ }
  return !SKIP_PDFS.test(decoded) && !SKIP_PDFS.test(label);
}

// Registrable-ish domain for grouping a developer's subdomain microsites:
// last three labels for *.co.il / *.org.il style, else last two.
export function siteDomain(host) {
  const parts = String(host).toLowerCase().replace(/^www\./, "").split(".");
  const n = /^(co|org|net|ac|gov|muni)$/.test(parts[parts.length - 2] || "") ? 3 : 2;
  return parts.slice(-n).join(".");
}
