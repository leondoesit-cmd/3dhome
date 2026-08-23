/* A real-layout test harness, in ~200 lines and no new dependencies.
 *
 * The string-matching tests in tests/*.test.mjs can tell you a CSS rule EXISTS.
 * They cannot tell you the grid it belongs to resolved five 97px tracks inside
 * a 375px sheet and clipped Hole wizard off the end — that needs a layout
 * engine. jsdom has none, so it would not have caught that bug either.
 *
 * So: serve the app over node:http, drive headless Chrome over CDP using the
 * `ws` client the relay already depends on, and read getBoundingClientRect()
 * from the real thing. Every test that needs this skips itself when Chrome is
 * not installed, so `npm test` stays green on a machine or CI box without one.
 */
import { createServer } from "node:http";
import { spawn } from "node:child_process";
import { readFile, mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, extname, normalize } from "node:path";
import { fileURLToPath } from "node:url";
import { WebSocket } from "ws";

const ROOT = fileURLToPath(new URL("..", import.meta.url));

const MIME = {
  ".html": "text/html", ".js": "text/javascript", ".mjs": "text/javascript",
  ".css": "text/css", ".json": "application/json", ".svg": "image/svg+xml",
  ".png": "image/png", ".jpg": "image/jpeg", ".webp": "image/webp",
  ".woff2": "font/woff2", ".wasm": "application/wasm", ".glb": "model/gltf-binary",
};

/* ---- static server ------------------------------------------------------ */

export async function serveApp() {
  const server = createServer(async (req, res) => {
    // strip the query and pin every path inside the repo
    let path = decodeURIComponent(req.url.split("?")[0]);
    if (path.endsWith("/")) path += "index.html";
    const abs = join(ROOT, normalize(path).replace(/^(\.\.[/\\])+/, ""));
    if (!abs.startsWith(ROOT)) {
      res.writeHead(403).end("forbidden");
      return;
    }
    try {
      const body = await readFile(abs);
      res.writeHead(200, {
        "content-type": MIME[extname(abs).toLowerCase()] || "application/octet-stream",
        "cache-control": "no-store",
      });
      res.end(body);
    } catch {
      res.writeHead(404).end("not found");
    }
  });
  await new Promise((r) => server.listen(0, "127.0.0.1", r));
  return {
    origin: "http://127.0.0.1:" + server.address().port,
    // server.close() alone waits out every keep-alive socket Chrome is holding,
    // which is ~30s of a test run spent watching an idle browser exit
    close: () =>
      new Promise((resolve, reject) => {
        /* Start the graceful close first, then evict keep-alive connections.
           Calling closeAllConnections before close leaves a small race where
           Chrome can open one last connection between the two calls and the
           close callback never resolves. That stranded the node:test after
           hook after every assertion had already passed. */
        const timer = setTimeout(() => {
          server.closeAllConnections();
          reject(new Error("browser harness server did not close"));
        }, 5000);
        server.close((error) => {
          clearTimeout(timer);
          error ? reject(error) : resolve();
        });
        server.closeAllConnections();
      }),
  };
}

/* ---- chrome ------------------------------------------------------------- */

const CHROME_CANDIDATES = [
  process.env.CHROME_PATH,
  "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome",
  "/Applications/Chromium.app/Contents/MacOS/Chromium",
  "/usr/bin/google-chrome",
  "/usr/bin/chromium",
  "/usr/bin/chromium-browser",
].filter(Boolean);

export async function findChrome() {
  const { access } = await import("node:fs/promises");
  for (const p of CHROME_CANDIDATES) {
    try {
      await access(p);
      return p;
    } catch {}
  }
  return null;
}

/* ---- a minimal CDP client ----------------------------------------------- */

class CDP {
  constructor(ws) {
    this.ws = ws;
    this.id = 0;
    this.pending = new Map();
    this.consoleErrors = [];
    ws.on("message", (raw) => {
      const msg = JSON.parse(raw);
      if (msg.id && this.pending.has(msg.id)) {
        const { resolve, reject, timer } = this.pending.get(msg.id);
        clearTimeout(timer);
        this.pending.delete(msg.id);
        msg.error ? reject(new Error(msg.error.message)) : resolve(msg.result);
      } else if (msg.method === "Runtime.exceptionThrown") {
        this.consoleErrors.push(
          msg.params.exceptionDetails.exception?.description ||
            msg.params.exceptionDetails.text,
        );
      }
    });
  }
  send(method, params = {}) {
    const id = ++this.id;
    this.ws.send(JSON.stringify({ id, method, params }));
    return new Promise((resolve, reject) => {
      // unref'd AND cleared on reply: an un-cleared 30s timer per request keeps
      // the event loop alive long after the test has finished
      const timer = setTimeout(() => {
        if (this.pending.delete(id)) reject(new Error(method + " timed out"));
      }, 30000);
      timer.unref?.();
      this.pending.set(id, { resolve, reject, timer });
    });
  }
}

/* ---- the page object the tests actually use ----------------------------- */

export async function openPage({ width = 375, height = 812, lang = "en", mobile = undefined, touch = undefined } = {}) {
  const bin = await findChrome();
  if (!bin) return null;
  const isMobile = mobile !== undefined ? !!mobile : (width <= 768);
  const isTouch = touch !== undefined ? !!touch : isMobile;

  const app = await serveApp();
  const profile = await mkdtemp(join(tmpdir(), "mf-harness-"));
  const child = spawn(
    bin,
    [
      "--headless=new",
      "--remote-debugging-port=0",
      "--user-data-dir=" + profile,
      "--no-first-run",
      "--no-default-browser-check",
      /* No GPU and no SwiftShader: the editor's three.js preview throws on a
         null WebGL context here, which callers filter out (see NO_GL in
         tests/model_editor_layout.browser.mjs). Software GL would render it for
         real but costs minutes per run — this harness tests chrome LAYOUT, and
         layout does not depend on whether the viewport painted a model. */
      "--disable-gpu",
      "--hide-scrollbars",
      "--window-size=" + width + "," + height,
      "about:blank",
    ],
    { stdio: ["ignore", "ignore", "pipe"] },
  );

  // Chrome prints the DevTools ws endpoint on stderr once it is listening
  const wsUrl = await new Promise((resolve, reject) => {
    let buf = "";
    const timer = setTimeout(() => reject(new Error("chrome did not start")), 20000);
    child.stderr.on("data", (d) => {
      buf += d;
      const m = buf.match(/ws:\/\/[^\s]+/);
      if (m) {
        clearTimeout(timer);
        resolve(m[0]);
      }
    });
    child.on("exit", (c) => reject(new Error("chrome exited early: " + c)));
  });

  const browser = new CDP(new WebSocket(wsUrl));
  await new Promise((r) => browser.ws.once("open", r));
  const { targetId } = await browser.send("Target.createTarget", { url: "about:blank" });
  const pageWs = new WebSocket(wsUrl.replace(/\/devtools\/browser\/.*$/, "/devtools/page/" + targetId));
  const cdp = new CDP(pageWs);
  await new Promise((r) => pageWs.once("open", r));

  await cdp.send("Page.enable");
  await cdp.send("Runtime.enable");
  await cdp.send("Emulation.setDeviceMetricsOverride", {
    width, height, deviceScaleFactor: 1, mobile: isMobile,
  });
  await cdp.send("Emulation.setTouchEmulationEnabled", isTouch ? { enabled: true, maxTouchPoints: 5 } : { enabled: false });

  const page = {
    consoleErrors: cdp.consoleErrors,

    async eval(fn, ...args) {
      const expr = "(" + fn.toString() + ")(" + args.map((a) => JSON.stringify(a)).join(",") + ")";
      const { result, exceptionDetails } = await cdp.send("Runtime.evaluate", {
        expression: expr,
        awaitPromise: true,
        returnByValue: true,
      });
      if (exceptionDetails)
        throw new Error(exceptionDetails.exception?.description || exceptionDetails.text);
      return result.value;
    },

    async goto(path = "/") {
      await cdp.send("Page.navigate", { url: app.origin + path });
      await new Promise((r) => {
        const done = (m) => {
          if (m.method === "Page.loadEventFired") {
            cdp.ws.off("message", listener);
            r();
          }
        };
        const listener = (raw) => done(JSON.parse(raw));
        cdp.ws.on("message", listener);
      });
      // give the ES-module graph a beat to boot and paint
      await page.eval(() => new Promise((r) => requestAnimationFrame(() => setTimeout(r, 350))));
    },

    async setLang(l) {
      await page.eval((v) => localStorage.setItem("home3d_lang", v), l);
    },

    async resize(w, h, { mobile = undefined, touch = undefined } = {}) {
      const isMob = mobile !== undefined ? !!mobile : (w <= 768);
      const isTch = touch !== undefined ? !!touch : isMob;
      await cdp.send("Emulation.setDeviceMetricsOverride", {
        width: w, height: h, deviceScaleFactor: 1, mobile: isMob,
      });
      await cdp.send("Emulation.setTouchEmulationEnabled", isTch ? { enabled: true, maxTouchPoints: 5 } : { enabled: false });
      await page.eval(() => new Promise((r) => setTimeout(r, 250)));
    },

    async close() {
      // These are test-only CDP transports. A graceful WebSocket close waits
      // for a peer acknowledgement that can never arrive once Chrome begins
      // shutting down, leaving node:test alive after every assertion passed.
      try { pageWs.terminate(); browser.ws.terminate(); } catch {}
      // A process terminated by a signal keeps exitCode=null; signalCode is
      // the completed-state signal in that case. Registering an `exit` waiter
      // after such a Chrome has already gone creates a promise that can never
      // settle (most visible when node:test runs both browser files together).
      const exited = child.exitCode != null || child.signalCode != null
        ? Promise.resolve()
        : new Promise((resolve) => child.once("exit", resolve));
      child.kill("SIGKILL");
      await Promise.race([
        exited,
        new Promise((resolve) => {
          setTimeout(resolve, 3000);
        }),
      ]);
      await app.close();
      await rm(profile, { recursive: true, force: true }).catch(() => {});
    },
  };

  await page.goto("/");
  if (lang !== "en") {
    await page.setLang(lang);
    await page.goto("/");
  }
  return page;
}
