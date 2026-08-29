/* The harness drives Chrome over a WebSocket. When that socket goes — a page
 * closing, a browser killed, a crash — every request already on it can never
 * be answered. Those promises used to dangle, and because the per-request
 * timeout is unref'd nothing failed them either, so node:test saw a file that
 * had passed every assertion and still had a promise outstanding and cancelled
 * it. It showed up only when the browser files ran together, where several
 * Chromes competing for the CPU mean a request is nearly always in flight at
 * close. These tests need no browser.
 */
import test from "node:test";
import assert from "node:assert/strict";
import { EventEmitter } from "node:events";
import { access, mkdtemp } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { CDP, closeHarnessResources, waitForOpen } from "../tools/browser_harness.mjs";

/* Enough of a ws to drive the client: it records what was sent and lets a test
   decide whether a reply, a close, or an error happens next. */
class FakeSocket extends EventEmitter {
  constructor() { super(); this.sent = []; this.throwOnSend = null; }
  send(raw) {
    if (this.throwOnSend) throw new Error(this.throwOnSend);
    this.sent.push(JSON.parse(raw));
  }
  reply(id, result) { this.emit("message", JSON.stringify({ id, result })); }
}

const settled = (promise) => {
  let state = "pending";
  promise.then(() => { state = "resolved"; }, () => { state = "rejected"; });
  // one macrotask is enough for an already-settled promise to report
  return new Promise((r) => setTimeout(() => r(state), 0));
};

test("a request answered before the socket dies still resolves", async () => {
  const socket = new FakeSocket(), cdp = new CDP(socket);
  const pending = cdp.send("Runtime.evaluate", { expression: "1" });
  assert.equal(socket.sent[0].method, "Runtime.evaluate");
  socket.reply(socket.sent[0].id, { value: 1 });
  assert.deepEqual(await pending, { value: 1 });
});

test("a request still in flight when the socket closes rejects instead of dangling", async () => {
  const socket = new FakeSocket(), cdp = new CDP(socket);
  const pending = cdp.send("Page.captureScreenshot");
  assert.equal(await settled(pending), "pending", "nothing has answered it yet");
  socket.emit("close");
  assert.equal(await settled(pending), "rejected", "the request outlived its socket");
  await assert.rejects(pending, /CDP connection closed/);
  assert.equal(cdp.pending.size, 0, "the pending map is emptied");
});

test("a socket error fails the requests riding on it", async () => {
  const socket = new FakeSocket(), cdp = new CDP(socket);
  const pending = cdp.send("Runtime.evaluate");
  socket.emit("error", new Error("ECONNRESET"));
  await assert.rejects(pending, /ECONNRESET/);
});

test("close() fails what is in flight without waiting for the close event", async () => {
  const socket = new FakeSocket(), cdp = new CDP(socket);
  const pending = cdp.send("Runtime.evaluate");
  cdp.fail("closed");                    // what page.close() does before terminate
  assert.equal(await settled(pending), "rejected");
});

test("requests made after the socket is gone reject rather than throwing", async () => {
  const socket = new FakeSocket(), cdp = new CDP(socket);
  socket.emit("close");
  await assert.rejects(cdp.send("Runtime.evaluate"), /CDP connection closed/);
});

test("a send that throws does not leave its own request outstanding", async () => {
  const socket = new FakeSocket(), cdp = new CDP(socket);
  socket.throwOnSend = "not opened";
  await assert.rejects(cdp.send("Runtime.evaluate"), /not opened/);
  assert.equal(cdp.pending.size, 0);
});

/* The point of the whole exercise: an abandoned request must not surface as an
   unhandled rejection and take down a run that has otherwise passed. */
test("nobody has to await a request that died with the page", async () => {
  const seen = [];
  const onUnhandled = (reason) => seen.push(reason);
  process.on("unhandledRejection", onUnhandled);
  try {
    const socket = new FakeSocket(), cdp = new CDP(socket);
    cdp.send("Runtime.evaluate");        // deliberately not awaited
    socket.emit("close");
    await new Promise((r) => setTimeout(r, 20));
  } finally {
    process.off("unhandledRejection", onUnhandled);
  }
  assert.deepEqual(seen, [], "an abandoned request was reported as unhandled");
});

/* Same disease in the other half of the connect path: waiting on "open" with
   no failure branch hangs forever on a socket that dies first. */
test("waiting for a socket to open can fail", async () => {
  const failing = new FakeSocket();
  const opening = waitForOpen(failing, "test socket", 200);
  failing.emit("error", new Error("ECONNREFUSED"));
  await assert.rejects(opening, /test socket failed: ECONNREFUSED/);

  const closing = new FakeSocket();
  const second = waitForOpen(closing, "test socket", 200);
  closing.emit("close");
  await assert.rejects(second, /closed before it opened/);

  const silent = new FakeSocket();
  await assert.rejects(waitForOpen(silent, "test socket", 50), /did not open/);

  const good = new FakeSocket();
  const third = waitForOpen(good, "test socket", 200);
  good.emit("open");
  assert.equal(await third, good, "a socket that opens resolves with itself");
});

test("a request made after close is not an unhandled rejection either", async () => {
  const seen = [];
  const onUnhandled = (reason) => seen.push(reason);
  process.on("unhandledRejection", onUnhandled);
  try {
    const socket = new FakeSocket(), cdp = new CDP(socket);
    socket.emit("close");
    cdp.send("Runtime.evaluate");        // a late call from an abandoned path
    await new Promise((r) => setTimeout(r, 20));
  } finally {
    process.off("unhandledRejection", onUnhandled);
  }
  assert.deepEqual(seen, []);
});

test("partial harness startup is fully cleaned up", async () => {
  const profile = await mkdtemp(join(tmpdir(), "mf-harness-test-"));
  const calls = [];
  const child = new EventEmitter();
  Object.assign(child, {
    pid: 12345, exitCode: null, signalCode: null,
    kill(signal) {
      calls.push("kill:" + signal);
      this.signalCode = signal;
      queueMicrotask(() => this.emit("exit", null, signal));
      return true;
    },
  });
  const cdp = { fail: (why) => calls.push("page-fail:" + why) };
  const pageWs = { terminate: () => calls.push("page-terminate") };
  const browser = {
    fail: (why) => calls.push("browser-fail:" + why),
    ws: { terminate: () => calls.push("browser-terminate") },
  };
  const app = { close: async () => { calls.push("server-close"); } };

  await closeHarnessResources({ app, profile, child, browser, pageWs, cdp });

  assert.deepEqual(calls, [
    "page-fail:closed", "browser-fail:closed", "page-terminate",
    "browser-terminate", "kill:SIGKILL", "server-close",
  ]);
  await assert.rejects(access(profile), /ENOENT/, "the temporary Chrome profile was left behind");
});
