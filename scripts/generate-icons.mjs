// Generates temporary placeholder PWA icons (solid background + a centered
// circle mark) as real PNG files, with no external dependencies. These exist
// so the manifest and Phase 0 acceptance criteria (installable PWA) are
// satisfiable without real brand art — replace with designed icons before
// this app matters to look at.
import { deflateSync } from "node:zlib";
import { writeFileSync, mkdirSync } from "node:fs";
import { fileURLToPath } from "node:url";
import path from "node:path";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const outDir = path.join(__dirname, "..", "public", "icons");
mkdirSync(outDir, { recursive: true });

const BACKGROUND = [15, 23, 42, 255]; // slate-900
const MARK = [226, 232, 240, 255]; // slate-200

function crc32(buf) {
  let c;
  const table = (crc32.table ??= (() => {
    const t = new Uint32Array(256);
    for (let n = 0; n < 256; n++) {
      c = n;
      for (let k = 0; k < 8; k++) {
        c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
      }
      t[n] = c >>> 0;
    }
    return t;
  })());
  let crc = 0xffffffff;
  for (let i = 0; i < buf.length; i++) {
    crc = table[(crc ^ buf[i]) & 0xff] ^ (crc >>> 8);
  }
  return (crc ^ 0xffffffff) >>> 0;
}

function chunk(type, data) {
  const typeBuf = Buffer.from(type, "ascii");
  const lenBuf = Buffer.alloc(4);
  lenBuf.writeUInt32BE(data.length, 0);
  const crcBuf = Buffer.alloc(4);
  crcBuf.writeUInt32BE(crc32(Buffer.concat([typeBuf, data])), 0);
  return Buffer.concat([lenBuf, typeBuf, data, crcBuf]);
}

/** Solid background with a centered circular mark — a plain, legible placeholder. */
function renderPixels(size, { maskableSafeZone = false } = {}) {
  const raw = Buffer.alloc(size * (1 + size * 4));
  const cx = size / 2;
  const cy = size / 2;
  // Maskable icons need important content inside the ~80% "safe zone" —
  // shrink the mark radius accordingly.
  const radius = size * (maskableSafeZone ? 0.3 : 0.32);

  for (let y = 0; y < size; y++) {
    let offset = y * (1 + size * 4);
    raw[offset] = 0; // filter type: None
    offset += 1;
    for (let x = 0; x < size; x++) {
      const dx = x - cx + 0.5;
      const dy = y - cy + 0.5;
      const inside = dx * dx + dy * dy <= radius * radius;
      const [r, g, b, a] = inside ? MARK : BACKGROUND;
      raw[offset++] = r;
      raw[offset++] = g;
      raw[offset++] = b;
      raw[offset++] = a;
    }
  }
  return raw;
}

function encodePng(size, options) {
  const signature = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]);

  const ihdrData = Buffer.alloc(13);
  ihdrData.writeUInt32BE(size, 0);
  ihdrData.writeUInt32BE(size, 4);
  ihdrData[8] = 8; // bit depth
  ihdrData[9] = 6; // color type: RGBA
  ihdrData[10] = 0;
  ihdrData[11] = 0;
  ihdrData[12] = 0;

  const raw = renderPixels(size, options);
  const idatData = deflateSync(raw);

  return Buffer.concat([
    signature,
    chunk("IHDR", ihdrData),
    chunk("IDAT", idatData),
    chunk("IEND", Buffer.alloc(0)),
  ]);
}

const targets = [
  { file: "icon-192.png", size: 192 },
  { file: "icon-512.png", size: 512 },
  { file: "icon-maskable-512.png", size: 512, maskableSafeZone: true },
  { file: "apple-touch-icon.png", size: 180 },
];

for (const { file, size, maskableSafeZone } of targets) {
  const png = encodePng(size, { maskableSafeZone });
  writeFileSync(path.join(outDir, file), png);
  console.log(`wrote ${file} (${size}x${size})`);
}
