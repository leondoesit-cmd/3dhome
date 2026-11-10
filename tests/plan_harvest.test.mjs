import test from "node:test";
import assert from "node:assert/strict";
import {
  parseRobots, robotsGroup, robotsAllows, robotsStatusPolicy, sitemapLocs, isSitemapIndex,
  blockReason, extractLinks, pageScore, pdfWanted, siteDomain,
  extractImages, imageScore, originalImageUrl, imageType,
} from "../tools/plan_harvest_lib.mjs";

test("robots: our group beats *, longest rule wins, Allow wins ties, wildcards and $", () => {
  const robots = parseRobots([
    "User-agent: *",
    "Disallow: /wp-admin/",
    "Disallow: /*.pdf$",
    "Allow: /wp-admin/admin-ajax.php",
    "Crawl-delay: 5",
    "",
    "User-agent: GPTBot",
    "Disallow: /",
    "Sitemap: https://x.co.il/sitemap_index.xml",
  ].join("\n"));
  assert.deepEqual(robots.sitemaps, ["https://x.co.il/sitemap_index.xml"]);
  const star = robotsGroup(robots);
  assert.equal(star.delay, 5);
  assert.equal(robotsAllows(star, "/wp-admin/options.php"), false);
  assert.equal(robotsAllows(star, "/wp-admin/admin-ajax.php"), true);
  assert.equal(robotsAllows(star, "/uploads/plan.pdf"), false);
  assert.equal(robotsAllows(star, "/uploads/plan.pdf?v=2"), true, "$ anchors the end");
  assert.equal(robotsAllows(star, "/project/yama"), true);
  const named = robotsGroup(parseRobots("User-agent: ModelForgePlanBench\nDisallow: /\n\nUser-agent: *\nDisallow:"));
  assert.equal(robotsAllows(named, "/anything"), false, "a group naming us overrides *");
  assert.equal(robotsAllows(robotsGroup(parseRobots("User-agent: *\nDisallow:")), "/a"), true, "empty Disallow allows all");
});

test("robots.txt status: 4xx means no file (CDNs 403 it), 429/5xx means stay away", () => {
  assert.equal(robotsStatusPolicy(200), "rules");
  assert.equal(robotsStatusPolicy(404), "allow-all");
  assert.equal(robotsStatusPolicy(403), "allow-all");
  assert.equal(robotsStatusPolicy(429), "disallow");
  assert.equal(robotsStatusPolicy(503), "disallow");
});

test("robots: Hebrew paths match their percent-encoded form", () => {
  const group = robotsGroup(parseRobots("User-agent: *\nDisallow: /פרויקטים/סגור/"));
  assert.equal(robotsAllows(group, "/%D7%A4%D7%A8%D7%95%D7%99%D7%A7%D7%98%D7%99%D7%9D/%D7%A1%D7%92%D7%95%D7%A8/x"), false);
});

test("sitemaps: index vs urlset, CDATA and entities", () => {
  const index = "<sitemapindex><sitemap><loc>https://a.co.il/projects-sitemap.xml</loc></sitemap></sitemapindex>";
  assert.ok(isSitemapIndex(index));
  assert.deepEqual(sitemapLocs("<urlset><url><loc><![CDATA[https://a.co.il/p?a=1&amp;b=2]]></loc></url></urlset>"), ["https://a.co.il/p?a=1&b=2"]);
});

test("block detection: status codes and challenge pages stop a host", () => {
  assert.equal(blockReason(403, "text/html", ""), "http 403");
  assert.equal(blockReason(429, "", ""), "http 429");
  assert.equal(blockReason(200, "text/html", "<script src=\"https://challenges.cloudflare.com/x\"></script>"), "bot wall");
  assert.equal(blockReason(200, "text/html", "<title>פרויקט ים מרינה</title>"), null);
  assert.equal(blockReason(404, "text/html", ""), null);
});

test("links: anchors keep their text, bare and escaped PDF URLs are found", () => {
  const html = `<title>ים מרינה | דימרי</title>
    <a href="/project/yama">ים מרינה</a>
    <a href="https://cdn.prod.website-files.com/6a/6a70_C%202%20%D7%97%D7%93%D7%A8%D7%99%D7%9D.pdf" class="btn"><span>הורדת PDF</span> 2 חדרים</a>
    <script>var d={"file":"https:\\/\\/a.co.il\\/wp-content\\/uploads\\/2025\\/01\\/plan-4.pdf"}</script>
    <iframe src="/viewer.html?file=/docs/apt%206.pdf"></iframe>
    <a href="mailto:x@y.z">mail</a>`;
  const { pages, pdfs } = extractLinks(html, "https://www.dimri.co.il/project/yama-marina");
  assert.deepEqual(pages.map((p) => p.url), ["https://www.dimri.co.il/project/yama"]);
  const urls = pdfs.map((p) => p.url);
  assert.ok(urls.includes("https://cdn.prod.website-files.com/6a/6a70_C%202%20%D7%97%D7%93%D7%A8%D7%99%D7%9D.pdf"));
  assert.ok(urls.includes("https://a.co.il/wp-content/uploads/2025/01/plan-4.pdf"));
  assert.equal(pdfs.find((p) => p.url.includes("6a70")).label, "הורדת PDF 2 חדרים");
});

test("scoring: project/plan pages first, careers and media never; plan PDFs kept, legal ones dropped", () => {
  assert.ok(pageScore("https://a.co.il/project/yama-marina") > pageScore("https://a.co.il/about"));
  assert.ok(pageScore("https://a.co.il/%D7%A4%D7%A8%D7%95%D7%99%D7%A7%D7%98%D7%99%D7%9D/") > 0, "Hebrew 'projects' slug");
  assert.equal(pageScore("https://a.co.il/careers/engineer"), null);
  assert.equal(pageScore("https://a.co.il/wp-content/uploads/hero.jpg"), null);
  assert.equal(pdfWanted("https://a.co.il/uploads/plan-apt-11.pdf", "4 חדרים"), true);
  assert.equal(pdfWanted("https://a.co.il/uploads/privacy-policy.pdf"), false);
  assert.equal(pdfWanted("https://a.co.il/uploads/x.pdf", "מחירון"), false);
  assert.equal(pdfWanted("https://a.co.il/uploads/%D7%AA%D7%A0%D7%90%D7%99-%D7%A9%D7%99%D7%9E%D7%95%D7%A9.pdf", "תנאי שימוש באתר"), false);
});

test("images: largest srcset, lazy-load attributes, CSS backgrounds; logos and icons skipped", () => {
  const html = `
    <img src="/wp-content/uploads/2025/01/salon-300x200.jpg" srcset="/u/salon-300x200.jpg 300w, /u/salon-1024x683.jpg 1024w" alt="הדמיית סלון">
    <img data-src="https://cdn.x.com/kitchen.webp" src="data:image/gif;base64,R0lG" alt="מטבח">
    <div style="background-image: url('/u/lobby.png')"></div>
    <img src="/u/logo-dimri.png" alt="דמרי"><img src="/u/icon-phone.svg"><img src="/u/x.jpg" alt="facebook">`;
  const imgs = extractImages(html, "https://www.a.co.il/project/yama");
  assert.deepEqual(imgs.map((i) => i.url), [
    "https://www.a.co.il/u/salon-1024x683.jpg", "https://cdn.x.com/kitchen.webp", "https://www.a.co.il/u/lobby.png",
  ]);
  assert.equal(imgs[0].alt, "הדמיית סלון");
  assert.ok(imageScore(imgs[0].url, imgs[0].alt) > imageScore("https://www.a.co.il/u/aerial.jpg", "מבט על"));
  assert.equal(originalImageUrl("https://a.co.il/u/salon-1024x683.jpg"), "https://a.co.il/u/salon.jpg");
  assert.equal(originalImageUrl("https://a.co.il/u/2024-plan.jpg"), "https://a.co.il/u/2024-plan.jpg");
});

test("image type from bytes", () => {
  assert.equal(imageType(Buffer.from([0xff, 0xd8, 0xff, 0xe0, 0, 0, 0, 0, 0, 0, 0, 0])), "jpg");
  assert.equal(imageType(Buffer.from("RIFF\0\0\0\0WEBPVP8 ", "latin1")), "webp");
  assert.equal(imageType(Buffer.from("<html><body>", "latin1")), null);
});

test("site domain groups a developer's microsites", () => {
  assert.equal(siteDomain("sunn.carasso-nadlan.co.il"), "carasso-nadlan.co.il");
  assert.equal(siteDomain("www.dimri.co.il"), "dimri.co.il");
  assert.equal(siteDomain("youvalim.com"), "youvalim.com");
  assert.equal(siteDomain("cdn.prod.website-files.com"), "website-files.com");
});
