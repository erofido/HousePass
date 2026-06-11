/**
 * Generate the PWA icon set from the HousePass brand mark with zero image
 * dependencies: shapes are rasterised with signed-distance maths and packed
 * into PNGs by hand (zlib does the compression).
 *
 *   node scripts/gen-icons.mjs   → public/icons/*.png
 */
import { deflateSync } from "node:zlib";
import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";

const TEAL = [0x16, 0xb6, 0xa6];
const INK = [0x0c, 0x14, 0x22];
const PAPER = [0xfb, 0xfc, 0xfe];

/* ------------------------- brand mark geometry -------------------------- */
// Design space is 48x48 (matches src/components/Brand.tsx):
// rounded square, door arch stroke, pass dot.

function distToSegment(px, py, x1, y1, x2, y2) {
  const dx = x2 - x1;
  const dy = y2 - y1;
  const t = Math.max(0, Math.min(1, ((px - x1) * dx + (py - y1) * dy) / (dx * dx + dy * dy)));
  const cx = x1 + t * dx;
  const cy = y1 + t * dy;
  return Math.hypot(px - cx, py - cy);
}

/** Distance to the door stroke (two jambs + upper arch), stroke radius 2. */
function doorDistance(x, y) {
  const d1 = distToSegment(x, y, 16, 20, 16, 36);
  const d2 = distToSegment(x, y, 32, 20, 32, 36);
  const d3 = y <= 20 ? Math.abs(Math.hypot(x - 24, y - 20) - 8) : Infinity;
  return Math.min(d1, d2, d3);
}

function roundedRectInside(x, y, size, radius) {
  const r = radius;
  const cx = Math.max(r, Math.min(size - r, x));
  const cy = Math.max(r, Math.min(size - r, y));
  return Math.hypot(x - cx, y - cy) <= r;
}

/**
 * Colour at a point in 48-space.
 * fullBleed: square background to every edge (maskable / apple touch).
 */
function colourAt(x, y, fullBleed) {
  const inBg = fullBleed ? true : roundedRectInside(x - 2, y - 2, 44, 12) && x >= 2 && x <= 46 && y >= 2 && y <= 46;
  if (!inBg) return null;
  if (Math.hypot(x - 24, y - 30) <= 3.5) return PAPER;
  if (doorDistance(x, y) <= 2) return INK;
  return TEAL;
}

/* ------------------------------ rasteriser ------------------------------ */

function renderIcon(size, { fullBleed = false, contentScale = 1 } = {}) {
  const rgba = Buffer.alloc(size * size * 4);
  const ss = 2; // 2x2 supersampling for clean edges
  for (let py = 0; py < size; py++) {
    for (let px = 0; px < size; px++) {
      let r = 0, g = 0, b = 0, a = 0;
      for (let sy = 0; sy < ss; sy++) {
        for (let sx = 0; sx < ss; sx++) {
          // map pixel to design space, optionally shrinking content to the centre
          const fx = (px + (sx + 0.5) / ss) / size;
          const fy = (py + (sy + 0.5) / ss) / size;
          const dx = (fx - 0.5) / contentScale + 0.5;
          const dy = (fy - 0.5) / contentScale + 0.5;
          let c = null;
          if (dx >= 0 && dx <= 1 && dy >= 0 && dy <= 1) {
            c = colourAt(dx * 48, dy * 48, fullBleed && contentScale === 1);
          }
          if (!c && fullBleed) c = TEAL; // background outside scaled content
          if (c) {
            r += c[0]; g += c[1]; b += c[2]; a += 255;
          }
        }
      }
      const n = ss * ss;
      const o = (py * size + px) * 4;
      rgba[o] = Math.round(r / n);
      rgba[o + 1] = Math.round(g / n);
      rgba[o + 2] = Math.round(b / n);
      rgba[o + 3] = Math.round(a / n);
    }
  }
  return rgba;
}

/* ------------------------------ PNG writer ------------------------------ */

const CRC_TABLE = (() => {
  const t = new Uint32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    t[n] = c >>> 0;
  }
  return t;
})();

function crc32(buf) {
  let c = 0xffffffff;
  for (const byte of buf) c = CRC_TABLE[(c ^ byte) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}

function chunk(type, data) {
  const out = Buffer.alloc(12 + data.length);
  out.writeUInt32BE(data.length, 0);
  out.write(type, 4, "ascii");
  data.copy(out, 8);
  out.writeUInt32BE(crc32(out.subarray(4, 8 + data.length)), 8 + data.length);
  return out;
}

function encodePng(size, rgba) {
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(size, 0);
  ihdr.writeUInt32BE(size, 4);
  ihdr[8] = 8;  // bit depth
  ihdr[9] = 6;  // colour type RGBA
  // raw scanlines, each prefixed with filter byte 0
  const raw = Buffer.alloc(size * (size * 4 + 1));
  for (let y = 0; y < size; y++) {
    raw[y * (size * 4 + 1)] = 0;
    rgba.copy(raw, y * (size * 4 + 1) + 1, y * size * 4, (y + 1) * size * 4);
  }
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk("IHDR", ihdr),
    chunk("IDAT", deflateSync(raw, { level: 9 })),
    chunk("IEND", Buffer.alloc(0)),
  ]);
}

/* --------------------------------- main --------------------------------- */

const outDir = join(process.cwd(), "public", "icons");
mkdirSync(outDir, { recursive: true });

const targets = [
  ["icon-192.png", 192, {}],
  ["icon-512.png", 512, {}],
  // maskable: full-bleed background, mark shrunk into the 80% safe zone
  ["maskable-512.png", 512, { fullBleed: true, contentScale: 0.72 }],
  ["apple-touch-icon.png", 180, { fullBleed: true, contentScale: 0.85 }],
];

for (const [name, size, opts] of targets) {
  writeFileSync(join(outDir, name), encodePng(size, renderIcon(size, opts)));
  console.log(`✓ public/icons/${name}`);
}
