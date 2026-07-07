// PWA 아이콘 PNG 생성 — 외부 의존성 없이 순수 Node(zlib)로 픽셀 그리기
// 초록 배경 + 마을 회관 모티브(갈색 집 + 빨간 지붕 + 금색 깃발)
import { deflateSync } from 'node:zlib';
import { writeFileSync, mkdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');

function crc32(buf) {
  let table = crc32.table;
  if (!table) {
    table = crc32.table = new Int32Array(256);
    for (let n = 0; n < 256; n++) {
      let c = n;
      for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
      table[n] = c;
    }
  }
  let c = 0xffffffff;
  for (let i = 0; i < buf.length; i++) c = table[(c ^ buf[i]) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}

function chunk(type, data) {
  const len = Buffer.alloc(4);
  len.writeUInt32BE(data.length);
  const body = Buffer.concat([Buffer.from(type, 'ascii'), data]);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(body));
  return Buffer.concat([len, body, crc]);
}

function encodePNG(size, pixels) {
  const sig = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(size, 0);
  ihdr.writeUInt32BE(size, 4);
  ihdr[8] = 8; // bit depth
  ihdr[9] = 6; // RGBA
  const raw = Buffer.alloc(size * (size * 4 + 1));
  for (let y = 0; y < size; y++) {
    raw[y * (size * 4 + 1)] = 0; // filter none
    pixels.copy(raw, y * (size * 4 + 1) + 1, y * size * 4, (y + 1) * size * 4);
  }
  return Buffer.concat([
    sig,
    chunk('IHDR', ihdr),
    chunk('IDAT', deflateSync(raw, { level: 9 })),
    chunk('IEND', Buffer.alloc(0)),
  ]);
}

function drawIcon(size) {
  const px = Buffer.alloc(size * size * 4);
  const set = (x, y, r, g, b, a = 255) => {
    if (x < 0 || y < 0 || x >= size || y >= size) return;
    const i = (y * size + x) * 4;
    px[i] = r; px[i + 1] = g; px[i + 2] = b; px[i + 3] = a;
  };
  const rect = (x0, y0, x1, y1, r, g, b) => {
    for (let y = Math.floor(y0); y < y1; y++) for (let x = Math.floor(x0); x < x1; x++) set(x, y, r, g, b);
  };
  const s = size;
  // 배경: 초록 그라데이션 + 둥근 모서리 느낌은 maskable이라 그냥 꽉 채움
  for (let y = 0; y < s; y++) {
    const t = y / s;
    for (let x = 0; x < s; x++) set(x, y, Math.round(45 + 20 * t), Math.round(122 - 30 * t), Math.round(58 - 10 * t));
  }
  // 잔디 마름모
  const cx = s / 2, cy = s * 0.58;
  for (let y = 0; y < s; y++) {
    for (let x = 0; x < s; x++) {
      if (Math.abs(x - cx) / (s * 0.42) + Math.abs(y - cy) / (s * 0.24) <= 1) set(x, y, 99, 165, 74);
    }
  }
  // 집 본체 (갈색)
  rect(s * 0.34, s * 0.42, s * 0.66, s * 0.62, 168, 112, 61);
  // 지붕 (빨강 삼각형)
  for (let y = Math.floor(s * 0.24); y < s * 0.44; y++) {
    const t = (y - s * 0.24) / (s * 0.2);
    const half = t * s * 0.2 + s * 0.02;
    rect(cx - half, y, cx + half, y + 1, 201, 52, 46);
  }
  // 문
  rect(s * 0.45, s * 0.52, s * 0.55, s * 0.62, 90, 58, 32);
  // 깃대 + 금색 깃발
  rect(s * 0.63, s * 0.12, s * 0.65, s * 0.3, 90, 58, 32);
  for (let y = Math.floor(s * 0.12); y < s * 0.2; y++) {
    const t = (y - s * 0.12) / (s * 0.08);
    rect(s * 0.65, y, s * 0.65 + (1 - Math.abs(t - 0.5) * 2) * s * 0.12 + s * 0.02, y + 1, 255, 215, 94);
  }
  return encodePNG(size, px);
}

mkdirSync(join(root, 'public', 'icons'), { recursive: true });
for (const size of [192, 512]) {
  writeFileSync(join(root, 'public', 'icons', `icon-${size}.png`), drawIcon(size));
  console.log(`generated icon-${size}.png`);
}
