const asBytes = (value) => {
  if (value instanceof Uint8Array) return value;
  if (value instanceof ArrayBuffer) return new Uint8Array(value);
  if (ArrayBuffer.isView(value)) return new Uint8Array(value.buffer, value.byteOffset, value.byteLength);
  throw new TypeError("Binary payload requires bytes");
};

function checksum(bytes) {
  let hash = 2166136261;
  for (const value of bytes) hash = Math.imul(hash ^ value, 16777619);
  return (hash >>> 0).toString(16).padStart(8, "0");
}

function bytesToBase64(bytes) {
  if (globalThis.Buffer) return globalThis.Buffer.from(bytes).toString("base64");
  let binary = "";
  const chunkSize = 0x8000;
  for (let offset = 0; offset < bytes.length; offset += chunkSize) {
    binary += String.fromCharCode(...bytes.subarray(offset, offset + chunkSize));
  }
  return btoa(binary);
}

function base64ToBytes(value) {
  if (globalThis.Buffer) return new Uint8Array(globalThis.Buffer.from(value, "base64"));
  const binary = atob(value), bytes = new Uint8Array(binary.length);
  for (let index = 0; index < binary.length; index++) bytes[index] = binary.charCodeAt(index);
  return bytes;
}

export function encodeBinaryPayload(value, options = {}) {
  const bytes = asBytes(value);
  return {
    version: 1,
    encoding: "base64",
    format: String(options.format || "binary").toLowerCase(),
    mediaType: options.mediaType || "application/octet-stream",
    byteLength: bytes.byteLength,
    checksum: checksum(bytes),
    data: bytesToBase64(bytes),
  };
}

export function decodeBinaryPayload(payload) {
  if (!payload || payload.version !== 1 || payload.encoding !== "base64" || typeof payload.data !== "string") {
    throw new Error("Unsupported binary payload");
  }
  const bytes = base64ToBytes(payload.data);
  if (Number(payload.byteLength) !== bytes.byteLength) throw new Error("Binary payload length mismatch");
  if (payload.checksum && payload.checksum !== checksum(bytes)) throw new Error("Binary payload checksum mismatch");
  return bytes;
}
