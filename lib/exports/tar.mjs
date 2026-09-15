const BLOCK_SIZE = 512;
const encoder = new TextEncoder();

function utf8Length(value) {
  return encoder.encode(value).length;
}

function truncateUtf8(value, maxBytes) {
  let output = "";
  for (const char of value) {
    if (utf8Length(output + char) > maxBytes) break;
    output += char;
  }
  return output;
}

export function sanitizeTarPath(input) {
  const raw = typeof input === "string" ? input : "";
  const segments = raw.replace(/\\/g, "/").split("/").map((segment) => segment
    .replace(/[\u0000-\u001f\u007f]/g, "_")
    .trim())
    .filter((segment) => segment && segment !== "." && segment !== "..");
  const safe = segments.join("/") || "file";
  return truncateUtf8(safe, 255);
}

function splitUstarPath(input) {
  const path = sanitizeTarPath(input);
  if (utf8Length(path) <= 100) return { name: path, prefix: "" };
  const segments = path.split("/");
  for (let index = segments.length - 1; index > 0; index -= 1) {
    const name = segments.slice(index).join("/");
    const prefix = segments.slice(0, index).join("/");
    if (utf8Length(name) <= 100 && utf8Length(prefix) <= 155) return { name, prefix };
  }
  return { name: truncateUtf8(segments.at(-1) || "file", 100), prefix: "" };
}

function writeString(buffer, offset, length, value) {
  const bytes = encoder.encode(value);
  buffer.set(bytes.subarray(0, length), offset);
}

function writeOctal(buffer, offset, length, value) {
  const clean = Math.max(0, Math.trunc(Number(value) || 0));
  const text = clean.toString(8).padStart(length - 1, "0").slice(-(length - 1));
  writeString(buffer, offset, length, `${text}\0`);
}

export function buildTarHeader(input) {
  const size = Math.max(0, Math.trunc(Number(input.size) || 0));
  const mtimeSeconds = input.mtime instanceof Date
    ? Math.floor(input.mtime.getTime() / 1000)
    : Math.max(0, Math.trunc(Number(input.mtime) || 0));
  const { name, prefix } = splitUstarPath(input.path);
  const header = new Uint8Array(BLOCK_SIZE);
  writeString(header, 0, 100, name);
  writeOctal(header, 100, 8, input.mode ?? 0o644);
  writeOctal(header, 108, 8, 0);
  writeOctal(header, 116, 8, 0);
  writeOctal(header, 124, 12, size);
  writeOctal(header, 136, 12, mtimeSeconds);
  header.fill(0x20, 148, 156);
  header[156] = "0".charCodeAt(0);
  writeString(header, 257, 6, "ustar\0");
  writeString(header, 263, 2, "00");
  writeString(header, 345, 155, prefix);
  const checksum = header.reduce((sum, byte) => sum + byte, 0);
  const checksumText = checksum.toString(8).padStart(6, "0").slice(-6);
  writeString(header, 148, 8, `${checksumText}\0 `);
  return header;
}

async function* readBody(body) {
  if (typeof body === "string") {
    yield encoder.encode(body);
    return;
  }
  if (body instanceof Uint8Array) {
    yield body;
    return;
  }
  if (body instanceof ArrayBuffer) {
    yield new Uint8Array(body);
    return;
  }
  if (body && typeof body.getReader === "function") {
    const reader = body.getReader();
    try {
      for (;;) {
        const { done, value } = await reader.read();
        if (done) return;
        if (value instanceof Uint8Array) yield value;
        else if (value instanceof ArrayBuffer) yield new Uint8Array(value);
        else throw new Error("Unsupported TAR stream chunk type.");
      }
    } finally {
      reader.releaseLock();
    }
    return;
  }
  throw new Error("Unsupported TAR entry body.");
}

export async function* generateTarChunks(entries, options = {}) {
  const defaultMtime = options.mtime ?? 0;
  for await (const entry of entries) {
    const declaredSize = Math.max(0, Math.trunc(Number(entry.size) || 0));
    yield buildTarHeader({ ...entry, size: declaredSize, mtime: entry.mtime ?? defaultMtime });
    let written = 0;
    for await (const chunk of readBody(entry.body)) {
      if (!chunk.length) continue;
      written += chunk.length;
      if (written > declaredSize) throw new Error(`TAR entry ${sanitizeTarPath(entry.path)} exceeded its declared size.`);
      yield chunk;
    }
    if (written !== declaredSize) throw new Error(`TAR entry ${sanitizeTarPath(entry.path)} size mismatch.`);
    const padding = (BLOCK_SIZE - (written % BLOCK_SIZE)) % BLOCK_SIZE;
    if (padding) yield new Uint8Array(padding);
  }
  yield new Uint8Array(BLOCK_SIZE * 2);
}

export function textTarEntry(path, text, options = {}) {
  const body = typeof text === "string" ? text : String(text ?? "");
  return { path: sanitizeTarPath(path), size: encoder.encode(body).length, body, ...options };
}
