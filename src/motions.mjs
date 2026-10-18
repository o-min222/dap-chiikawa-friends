import { inflateSync, deflateSync } from 'node:zlib';
import { readFile as readMotionFile, writeFile as writeMotionFile } from 'node:fs/promises';
import { join as motionJoin } from 'node:path';
import { createHash as motionHash } from 'node:crypto';

const PNG_HEADER = Buffer.from([137,80,78,71,13,10,26,10]);
function crc(bytes) {
  let value = 0xffffffff;
  for (const byte of bytes) { value ^= byte; for (let n = 0; n < 8; n++) value = (value >>> 1) ^ (0xedb88320 & -(value & 1)); }
  return (value ^ 0xffffffff) >>> 0;
}
function chunk(name, bytes) {
  const body = Buffer.concat([Buffer.from(name), bytes]), result = Buffer.alloc(body.length + 8);
  result.writeUInt32BE(bytes.length); body.copy(result, 4); result.writeUInt32BE(crc(body), result.length - 4);
  return result;
}
// Mechanical atlas packing only. Accept the bounded, non-interlaced RGBA assets we ship/download.
export function decodeMotionPng(bytes) {
  if (bytes.length > 8_000_000 || !bytes.subarray(0, 8).equals(PNG_HEADER)) throw Error('Invalid motion PNG');
  const width = bytes.readUInt32BE(16), height = bytes.readUInt32BE(20);
  if (width < 1 || width > 4096 || height < 1 || height > 4096 || width * height > 16_000_000 || bytes[24] !== 8 || bytes[25] !== 6 || bytes[28] !== 0) throw Error('Unsupported motion PNG format');
  const parts = [];
  for (let p = 8; p < bytes.length;) {
    const length = bytes.readUInt32BE(p), end = p + length + 12;
    if (end > bytes.length) throw Error('Truncated motion PNG');
    if (crc(bytes.subarray(p + 4, end - 4)) !== bytes.readUInt32BE(end - 4)) throw Error('Motion PNG checksum mismatch');
    if (bytes.toString('ascii', p + 4, p + 8) === 'IDAT') parts.push(bytes.subarray(p + 8, end - 4));
    p = end;
  }
  const stride = width * 4, raw = inflateSync(Buffer.concat(parts), { maxOutputLength: (stride + 1) * height });
  if (raw.length !== (stride + 1) * height) throw Error('Invalid motion scanlines');
  const pixels = Buffer.alloc(stride * height);
  for (let y = 0; y < height; y++) {
    const filter = raw[y * (stride + 1)];
    if (filter > 4) throw Error('Invalid PNG filter');
    for (let x = 0; x < stride; x++) {
      const i = y * stride + x, a = x >= 4 ? pixels[i - 4] : 0, b = y ? pixels[i - stride] : 0, c = y && x >= 4 ? pixels[i - stride - 4] : 0;
      const p = a + b - c, pa = Math.abs(p - a), pb = Math.abs(p - b), pc = Math.abs(p - c);
      const predicted = filter === 0 ? 0 : filter === 1 ? a : filter === 2 ? b : filter === 3 ? Math.floor((a + b) / 2) : pa <= pb && pa <= pc ? a : pb <= pc ? b : c;
      pixels[i] = (raw[y * (stride + 1) + x + 1] + predicted) & 255;
    }
  }
  return { width, height, pixels };
}
export function encodeMotionPng({ width, height, pixels }) {
  const header = Buffer.alloc(13); header.writeUInt32BE(width); header.writeUInt32BE(height, 4); header[8] = 8; header[9] = 6;
  const stride = width * 4, raw = Buffer.alloc((stride + 1) * height);
  for (let y = 0; y < height; y++) pixels.copy(raw, y * (stride + 1) + 1, y * stride, (y + 1) * stride);
  return Buffer.concat([PNG_HEADER, chunk('IHDR', header), chunk('IDAT', deflateSync(raw)), chunk('IEND', Buffer.alloc(0))]);
}
export const LEGACY_MOTIONS = ['idle','running-right','running-left','waving','jumping','failed','waiting','running','review'];
export const EXTRA_MOTIONS = ['sleep','feed_munch','groom','grabbed','success','dance','working_v2'];

export function planMotions(skin, pack) {
  const own = pack.filter(motion => motion.characterId === skin.id);
  const byKey = new Map(own.map(motion => [motion.motion, motion]));
  const idle = byKey.get('idle') ?? own.find(motion => motion.id === skin.defaultMotionId);
  if (!idle) throw Error(`No independent base artwork for ${skin.id}`);
  const choices = Object.fromEntries(LEGACY_MOTIONS.map(key => [key, byKey.get(key) ?? idle]));
  for (const key of ['waving','jumping']) choices[key] = byKey.get(key) ?? byKey.get('success') ?? idle;
  for (const key of EXTRA_MOTIONS) choices[key] = byKey.get(key) ?? choices[({success:'waving',dance:'jumping',feed_munch:'running'})[key] ?? 'waiting'];
  const coverage = Object.fromEntries(Object.entries(choices).map(([key,motion]) => [key, {
    status: motion.motion !== key ? 'substitute' : motion.reviewStatus === 'awaiting-user-review' ? 'review' : 'ready',
    motionId: motion.id,
  }]));
  return { choices, coverage };
}

/** Compose our generated strips only, without an original character sheet. */
export async function prepareMotionSkin(root, skin, pack, extended, workingVariants, outputFile) {
  if (!/^assets\/atlases\/[a-z-]+\.png$/.test(outputFile)) throw Error('Invalid atlas output path');
  const {choices} = planMotions(skin, pack);
  const keys = [...LEGACY_MOTIONS, ...(extended ? EXTRA_MOTIONS.filter(key => (key !== 'working_v2' || workingVariants) && pack.some(m => m.characterId === skin.id && m.motion === key)) : [])];
  const motions = [...new Map(keys.map(key => [choices[key].id,choices[key]])).values()];
  const rowBytes = 1536 * 208 * 4, pixels = Buffer.alloc(rowBytes * motions.length);
  if (!motions.length || motions.length * 208 > 4096) throw Error('Invalid atlas dimensions');
  for (const [index,motion] of motions.entries()) {
    if (!/^assets\/generated\/[a-z-]+\.png$/.test(motion.file)) throw Error('Invalid generated motion path');
    const bytes = await readMotionFile(motionJoin(root,motion.file));
    if (bytes.length !== motion.bytes || motionHash('sha256').update(bytes).digest('hex') !== motion.sha256) throw Error('Generated motion integrity check failed');
    const strip = decodeMotionPng(bytes);
    if (strip.width !== 1536 || strip.height !== 208) throw Error('Invalid generated strip dimensions');
    strip.pixels.copy(pixels,index*rowBytes);
  }
  const animations = Object.fromEntries(keys.map(key => {
    const motion=choices[key], clip={row:motions.findIndex(item=>item.id===motion.id),holdsMs:motion.holdsMs};
    if (extended && motion.hops) clip.hops=motion.hops;
    return [key,clip];
  }));
  const bytes=encodeMotionPng({width:1536,height:motions.length*208,pixels});
  if (bytes.length>8_000_000) throw Error('Combined motion atlas exceeds the DAP limit');
  await writeMotionFile(motionJoin(root,outputFile),bytes);
  return {id:skin.id,displayName:skin.displayName,schemaVersion:1,spritesheetPath:outputFile,
    cell:{width:192,height:208},grid:{columns:8,rows:motions.length},animations,persona:skin.persona};
}
