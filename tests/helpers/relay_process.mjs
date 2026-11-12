// A real relay child process for HTTP/WebSocket behaviour tests, plus raw
// clients that can send what browsers never would (any Host header, malformed
// frames). Every relay gets its own port, identity file and backup folder.
import { spawn } from "node:child_process";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { once } from "node:events";
import { request } from "node:http";
import { connect, createServer } from "node:net";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { waitForRelay } from "./relay_readiness.mjs";

export async function freePort() {
  const server = createServer();
  await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
  const port = server.address().port;
  await new Promise((resolve) => server.close(resolve));
  return port;
}

export async function startRelay(t, env = {}, { identities = {} } = {}) {
  const port = await freePort();
  const scratch = await mkdtemp(join(tmpdir(), "home3d-relay-"));
  const identitiesFile = env.HOME3D_IDENTITIES_FILE || join(scratch, "identities.json");
  if (!env.HOME3D_IDENTITIES_FILE) await writeFile(identitiesFile, JSON.stringify(identities));
  const child = spawn(process.execPath, ["server/relay.mjs", String(port)], {
    cwd: new URL("../..", import.meta.url),
    env: {
      ...process.env,
      HOME3D_IDENTITIES_FILE: identitiesFile,
      HOME3D_MODEL_BACKUP_DIR: join(scratch, "backups"),
      HOME3D_PRODSIZE_CACHE_FILE: join(scratch, "prodsize-cache.json"),
      ...env,
    },
    stdio: ["ignore", "pipe", "pipe"],
  });
  let logs = "";
  const collect = (chunk) => { logs = (logs + chunk.toString()).slice(-16384); };
  child.stdout.on("data", collect);
  child.stderr.on("data", collect);
  t.after(async () => {
    if (child.exitCode === null && child.signalCode === null) {
      const exited = once(child, "exit");
      child.kill("SIGTERM");
      await exited;
    }
    await rm(scratch, { recursive: true, force: true });
  });
  await waitForRelay(`http://127.0.0.1:${port}/api/ping`, child);
  return { port, child, identitiesFile, origin: `http://127.0.0.1:${port}`, get logs() { return logs; } };
}

// node:http instead of fetch: fetch will not send an arbitrary Host header.
export function rawRequest(port, { method = "GET", path = "/", headers = {}, body } = {}) {
  return new Promise((resolve, reject) => {
    const req = request(
      { host: "127.0.0.1", port, method, path, headers: { host: `127.0.0.1:${port}`, ...headers } },
      (res) => {
        const chunks = [];
        res.on("data", (chunk) => chunks.push(chunk));
        res.on("end", () =>
          resolve({ status: res.statusCode, headers: res.headers, text: Buffer.concat(chunks).toString("utf8") }),
        );
      },
    );
    req.on("error", reject);
    if (body != null) req.write(body);
    req.end();
  });
}

// Opens a WebSocket (handshake done) and resolves with the raw socket.
export function openSocket(port, origin, headers = {}) {
  return new Promise((resolve, reject) => {
    const socket = connect(port, "127.0.0.1");
    let head = "";
    const onData = (chunk) => {
      head += chunk.toString("latin1");
      if (!head.includes("\r\n\r\n")) return;
      socket.off("data", onData);
      const status = Number((head.match(/^HTTP\/1\.1 (\d+)/) || [])[1]);
      if (status === 101) resolve(socket);
      else {
        socket.destroy();
        reject(new Error("upgrade refused: " + status));
      }
    };
    socket.on("data", onData);
    socket.on("error", reject);
    socket.on("connect", () =>
      socket.write(
        "GET / HTTP/1.1\r\n" +
          `Host: 127.0.0.1:${port}\r\n` +
          "Upgrade: websocket\r\nConnection: Upgrade\r\n" +
          "Sec-WebSocket-Version: 13\r\nSec-WebSocket-Key: dGhlIHNhbXBsZSBub25jZQ==\r\n" +
          Object.entries(headers).map(([name, value]) => `${name}: ${value}\r\n`).join("") +
          `Origin: ${origin}\r\n\r\n`,
      ),
    );
  });
}

// A client frame (clients must mask) carrying `text`; opcode 1 = text.
export function maskedFrame(text, opcode = 1, fin = true) {
  const payload = Buffer.from(text, "utf8");
  const mask = Buffer.from([0x12, 0x34, 0x56, 0x78]);
  const n = payload.length;
  const first = (fin ? 0x80 : 0) | opcode;
  let head;
  if (n < 126) head = Buffer.from([first, 0x80 | n]);
  else if (n < 65536) {
    head = Buffer.alloc(4);
    head[0] = first;
    head[1] = 0x80 | 126;
    head.writeUInt16BE(n, 2);
  } else {
    head = Buffer.alloc(10);
    head[0] = first;
    head[1] = 0x80 | 127;
    head.writeBigUInt64BE(BigInt(n), 2);
  }
  const masked = Buffer.from(payload.map((byte, i) => byte ^ mask[i & 3]));
  return Buffer.concat([head, mask, masked]);
}
