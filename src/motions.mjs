import { inflateSync, deflateSync } from 'node:zlib';
import { readFile as readMotionFile, writeFile as writeMotionFile, rename as renameMotionFile } from 'node:fs/promises';
import { join as motionJoin } from 'node:path';
import { createHash as motionHash, randomUUID as motionUuid } from 'node:crypto';

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
// Renderer-compatible slots. A renderer mapping alone does not establish a normal UI trigger.
export const ACTIVE_MOTIONS = [...LEGACY_MOTIONS.filter(key=>!['jumping','waiting'].includes(key)),...EXTRA_MOTIONS];
// Success has no normal transition; error requires explicit external pet.context input.
export const PRODUCTION_MOTIONS = ACTIVE_MOTIONS.filter(key=>!['success','failed'].includes(key));
const ORIGINAL_FALLBACK = {sleep:'waiting',feed_munch:'running',groom:'waiting',grabbed:'waiting',success:'waving',dance:'jumping'};
export function planMotions(skin, pack) {
  const byKey = new Map(pack.filter(m=>m.characterId===skin.id && !['deferred','awaiting-user-review'].includes(m.reviewStatus)).map(m=>[m.motion,m]));
  const original = key => {
    const clip=skin.animations?.[key];
    if(!clip)throw Error(`Missing upstream motion ${skin.id}/${key}`);
    return {id:`upstream-${skin.id}-${key}`,motion:key,source:'upstream',sourceRow:clip.row,file:skin.spritesheetPath,holdsMs:clip.holdsMs,...skin.originalAsset};
  };
  const choices={};
  for(const key of PRODUCTION_MOTIONS){
    choices[key]=byKey.get(key) ?? (key==='working_v2' ? choices.running : original(ORIGINAL_FALLBACK[key]??key));
  }
  const needsOriginal=Object.values(choices).some(m=>m.source==='upstream');
  choices.failed=byKey.get('failed') ?? (needsOriginal ? original('failed') : choices.idle);
  choices.success=byKey.get('success') ?? choices.waving;
  // Required by older skin validators; neither is a new animation-production task.
  choices.jumping=choices.dance;
  choices.waiting=choices.idle;
  const coverage=Object.fromEntries(ACTIVE_MOTIONS.map(key=>[key,{
    status:key==='working_v2'&&!byKey.has(key)?'shared':choices[key].source==='upstream'?'upstream':'ready',
    production:PRODUCTION_MOTIONS.includes(key),
    motionId:choices[key].id,
    source:choices[key].source??'generated',
  }]));
  return {choices,coverage};
}

/** Replace approved rows; keep unreplaced actions from the pinned upstream sheet. */
export async function prepareMotionSkin(root, skin, pack, extended, workingVariants=false, outputFile) {
  if(outputFile && !/^assets\/atlases\/[a-z-]+\.png$/.test(outputFile))throw Error('Invalid atlas output path');
  const {choices}=planMotions(skin,pack);
  const keys=[...LEGACY_MOTIONS,...(extended?EXTRA_MOTIONS.filter(key=>key!=='working_v2'||workingVariants):[])];
  const motions=[...new Map(keys.map(key=>[choices[key].id,choices[key]])).values()];
  const rowBytes=1536*208*4,pixels=Buffer.alloc(rowBytes*motions.length);
  if(!motions.length||motions.length*208>4096)throw Error('Invalid atlas dimensions');
  let original;
  for(const [index,motion] of motions.entries()){
    const upstream=motion.source==='upstream';
    if(upstream){if(motion.file!==`assets/${skin.id}.png`)throw Error('Invalid original motion path');}
    else if(!/^assets\/generated\/[a-z-]+\.png$/.test(motion.file))throw Error('Invalid generated motion path');
    let strip=original;
    if(!upstream||!strip){
      const bytes=await readMotionFile(motionJoin(root,motion.file));
      if(bytes.length!==motion.bytes||motionHash('sha256').update(bytes).digest('hex')!==motion.sha256)throw Error('Motion artwork integrity check failed');
      strip=decodeMotionPng(bytes);
      if(strip.width!==1536||strip.height!==(upstream?2288:208))throw Error('Invalid motion dimensions');
      if(upstream)original=strip;
    }
    if(upstream){
      strip.pixels.subarray(motion.sourceRow*rowBytes,(motion.sourceRow+1)*rowBytes).copy(pixels,index*rowBytes);
    }else strip.pixels.copy(pixels,index*rowBytes);
  }
  const animations=Object.fromEntries(keys.map(key=>{
    const motion=choices[key],clip={row:motions.findIndex(m=>m.id===motion.id),holdsMs:motion.holdsMs};
    if(extended&&motion.hops)clip.hops=motion.hops;
    return [key,clip];
  }));
  const bytes=encodeMotionPng({width:1536,height:208*motions.length,pixels});
  if(bytes.length>8_000_000)throw Error('Combined motion atlas exceeds the DAP limit');
  const path=outputFile??`assets/${skin.id}-motion-${motionHash('sha256').update(bytes).digest('hex').slice(0,16)}.png`;
  const destination=motionJoin(root,path),temporary=`${destination}.${motionUuid()}.part`;
  await writeMotionFile(temporary,bytes);await renameMotionFile(temporary,destination);
  return {id:skin.id,displayName:skin.displayName,schemaVersion:1,spritesheetPath:path,cell:{width:192,height:208},grid:{columns:8,rows:motions.length},animations,persona:skin.persona};
}
