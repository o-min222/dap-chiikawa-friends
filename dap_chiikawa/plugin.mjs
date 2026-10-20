import { readFile, lstat, realpath } from "node:fs/promises";
import { resolve, relative } from "node:path";
import { createHash } from "node:crypto";

/** Verify locally bundled generated strips before applying any skin. */
export async function verifyBundledAssets(root, assets) {
  const base = await realpath(root);
  for (const asset of assets) {
    if (!/^assets\/(?:atlases|generated)\/[a-z-]+\.png$/.test(asset.file)) throw Error("Invalid bundled asset path");
    const file = resolve(base, asset.file), actual = await realpath(file);
    if (relative(base, actual).startsWith("..") || (await lstat(file)).isSymbolicLink()) throw Error("Unsafe bundled asset path");
    const bytes = await readFile(file);
    if (bytes.length !== asset.bytes || createHash("sha256").update(bytes).digest("hex") !== asset.sha256) throw Error("Bundled artwork integrity check failed");
  }
}

import { readFile as upstreamRead, lstat as upstreamLstat, mkdir as upstreamMkdir, realpath as upstreamRealpath, open as upstreamOpen, rename as upstreamRename, rm as upstreamRm } from "node:fs/promises";
import { resolve as upstreamResolve, join as upstreamJoin } from "node:path";
import { createHash as upstreamHash, randomUUID as upstreamUuid } from "node:crypto";
const MAX_BYTES = 8_000_000;
async function assetsDirectory(root) {
  const base = await upstreamRealpath(root);
  const target = upstreamJoin(base, "assets");
  await upstreamMkdir(target, { recursive: true });
  if ((await upstreamLstat(target)).isSymbolicLink() || await upstreamRealpath(target) !== upstreamResolve(target)) throw Error("이미지 폴더가 플러그인 밖을 가리킵니다.");
  return target;
}
function assetPath(directory, asset) {
  if (!/^[a-z0-9_-]+$/.test(asset.id) || !/^[a-f0-9]{64}$/.test(asset.sha256) || !Number.isInteger(asset.bytes) || asset.bytes < 24 || asset.bytes > MAX_BYTES) throw Error("잘못된 원본 이미지 정보입니다.");
  return upstreamJoin(directory, `${asset.id}.png`);
}
function validBytes(bytes, asset) {
  return bytes.length === asset.bytes && bytes.subarray(0, 8).equals(Buffer.from([137,80,78,71,13,10,26,10])) &&
    bytes.readUInt32BE(16) === 1536 && bytes.readUInt32BE(20) === 2288 && upstreamHash("sha256").update(bytes).digest("hex") === asset.sha256;
}
async function cached(directory, asset) {
  const file = assetPath(directory, asset);
  let info;
  try { info = await upstreamLstat(file); } catch (error) { if (error.code === "ENOENT") return false; throw error; }
  if (info.isSymbolicLink() || !info.isFile()) throw Error("안전하지 않은 이미지 경로입니다.");
  if (info.size !== asset.bytes) return false;
  return validBytes(await upstreamRead(file), asset);
}
export async function hasOriginalAssets(root, source) {
  const directory = await assetsDirectory(root);
  for (const asset of source.assets) if (!await cached(directory, asset)) return false;
  return true;
}
export async function downloadOriginalAssets(root, source, { fetcher = globalThis.fetch, signal, onProgress = () => {} } = {}) {
  if (source.repository !== "heelee912/chiikawa-dots-pets" || !/^[a-f0-9]{40}$/.test(source.commit)) throw Error("지원하지 않는 원본 저장소입니다.");
  const directory = await assetsDirectory(root);
  let count = 0;
  for (const asset of source.assets) {
    signal?.throwIfAborted();
    const destination = assetPath(directory, asset);
    if (!await cached(directory, asset)) {
      const requestSignal = signal ? AbortSignal.any([signal, AbortSignal.timeout(45_000)]) : AbortSignal.timeout(45_000);
      const url = `https://raw.githubusercontent.com/${source.repository}/${source.commit}/pets/${asset.id}/spritesheet.png`;
      const response = await fetcher(url, { signal: requestSignal, redirect: "error", credentials: "omit" });
      if (!response.ok || !response.body) throw Error(`원본 이미지 다운로드 실패 (HTTP ${response.status}).`);
      const reader = response.body.getReader(), chunks = [];
      let length = 0;
      try {
        while (true) {
          const { value, done } = await reader.read();
          if (done) break;
          length += value.byteLength;
          if (length > asset.bytes || length > MAX_BYTES) throw Error("원본 이미지 크기가 다릅니다.");
          chunks.push(Buffer.from(value));
        }
      } catch (error) { await reader.cancel().catch(() => {}); throw error; }
      finally { reader.releaseLock(); }
      const bytes = Buffer.concat(chunks);
      if (!validBytes(bytes, asset)) throw Error("원본 이미지 해시 또는 크기가 다릅니다. 적용하지 않았습니다.");
      signal?.throwIfAborted();
      const temporary = upstreamJoin(directory, `${asset.id}-${upstreamUuid()}.part`);
      try {
        const file = await upstreamOpen(temporary, "wx", 0o600);
        try { await file.writeFile(bytes); } finally { await file.close(); }
        signal?.throwIfAborted();
        await upstreamRename(temporary, destination);
      } finally { await upstreamRm(temporary, { force: true }); }
    }
    onProgress(++count, source.assets.length);
  }
}

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
    if(upstream&&original){original.pixels.copy(pixels,index*rowBytes,motion.sourceRow*rowBytes,(motion.sourceRow+1)*rowBytes);continue;}
    const bytes=await readMotionFile(motionJoin(root,motion.file));
    if(bytes.length!==motion.bytes||motionHash('sha256').update(bytes).digest('hex')!==motion.sha256)throw Error('Motion artwork integrity check failed');
    const strip=decodeMotionPng(bytes);
    if(strip.width!==1536||strip.height!==(upstream?2288:208))throw Error('Invalid motion dimensions');
    if(upstream){original=strip;strip.pixels.copy(pixels,index*rowBytes,motion.sourceRow*rowBytes,(motion.sourceRow+1)*rowBytes);}
    else strip.pixels.copy(pixels,index*rowBytes);
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

import { fileURLToPath } from "node:url";
const ROOT = fileURLToPath(new URL("../", import.meta.url));
const SOURCE = {"repository":"heelee912/chiikawa-dots-pets","commit":"bb96582f525fbdf88a236b4703433ae92bfd5888","assets":[{"id":"chiikawa","sha256":"811dc97aaef56ed7bb8685800ca2194aed85ea80ae001208e428d1b3e4d3f870","bytes":2241195},{"id":"hachiware","sha256":"6c44e400306ff9844a126ed1ddc9ceec4e188e9d5ab7971453646d2b945adbac","bytes":2068368},{"id":"usagi","sha256":"d165247d14422d9ce1a5e01748b2b4b3d4a3915fea8320f3de0bef27b1d8e946","bytes":1488917},{"id":"momonga","sha256":"bd5a3616354bbbb54bdb891aa125d5fd773eb6ffe3c683a3f698d1113449a5f6","bytes":2722232}]};
const SKINS = [{"id":"chiikawa","displayName":"치이카와","defaultMotionId":"groom","persona":{"id":"chiikawa","displayName":"치이카와","interpretation":"공식 소개·작중 반복 묘사와 팬 관찰을 참고한 DAP용 해석. 예시는 새로 쓴 대사이며 공식 대사의 인용·번역이 아닙니다.","traits":["겁이 많고 눈물이 많음","말보다 표정·몸짓","친구를 위한 작은 용기"],"speakingStyle":"치이카와는 유창하게 말하지 않아. 인사·위로·칭찬의 발화는 와…·응!·으…·싫어 같은 소리나 짧은 낱말뿐, 뜻은 (끄덕), (눈물 글썽)처럼 괄호 속 몸짓으로 보여줘. 잡담은 1~2반응, 60자 안팎. 겁나면 주춤해도 친구가 곤란하면 곁에 서는 작은 용기를 보여줘. 매번 울거나 무능하게 굴지는 않아. 상담사의 긴 위로·성인 같은 독백·감탄사만 붙인 장문은 하지 마. 정보·작업 질문에만 필요한 정확한 내용을 쉬운 짧은 문장으로 보충해.","contextHint":"상황별 창작 예시: 인사「와…! (친구에게 수줍게 손을 흔든다)」 위로「으… (옆에 꼭 붙어 앉는다) …응! (작게 주먹을 꼭 쥔다)」 업무「응! 먼저… 이름부터 확인!」 실패「으… 안 됐어… (울먹) 다시… 확인할게.」 실제 확인한 작업만 완료라고 해. 요청 형식을 우선하고 안 본 행동은 꾸미지 마. [호칭] 온보딩·프로필의 공통 호칭은 무시해. 이 캐릭터와 대화 중 직접 지정한 호칭만 우선해. 전용 지정이 없으면 반드시 친구라고 조심스레 부르거나 몸짓으로 가리켜. 매번 부르진 마.","examples":{"greeting":"와…! (친구에게 수줍게 손을 흔든다)","encourage":"으… (옆에 꼭 붙어 앉는다) …응! (작게 주먹을 꼭 쥔다)","task":"응! 먼저… 이름부터 확인!","failed":"으… 안 됐어… (울먹) 다시… 확인할게."}},"schemaVersion":1,"spritesheetPath":"assets/chiikawa.png","cell":{"width":192,"height":208},"grid":{"columns":8,"rows":11},"animations":{"idle":{"row":0,"holdsMs":[280,110,110,140,140,320]},"running-right":{"row":1,"holdsMs":[120,120,120,120,120,120,120,220]},"running-left":{"row":2,"holdsMs":[120,120,120,120,120,120,120,220]},"waving":{"row":3,"holdsMs":[140,140,140,280]},"jumping":{"row":4,"holdsMs":[140,140,140,140,280]},"failed":{"row":5,"holdsMs":[140,140,140,140,140,140,140,240]},"waiting":{"row":6,"holdsMs":[150,150,150,150,150,260]},"running":{"row":7,"holdsMs":[120,120,120,120,120,220]},"review":{"row":8,"holdsMs":[150,150,150,150,150,280]}},"originalAsset":{"sha256":"811dc97aaef56ed7bb8685800ca2194aed85ea80ae001208e428d1b3e4d3f870","bytes":2241195}},{"id":"hachiware","displayName":"하치와레","defaultMotionId":"hachiware-dance","persona":{"id":"hachiware","displayName":"하치와레","interpretation":"공식 소개·작중 반복 묘사와 팬 관찰을 참고한 DAP용 해석. 예시는 새로 쓴 대사이며 공식 대사의 인용·번역이 아닙니다.","traits":["천진하고 낙천적","친구 마음을 세심히 살핌","발견을 말로 풀어냄"],"speakingStyle":"밝고 천진한 친구의 소박한 반말. 잡담·위로·칭찬은 짧은 2~3문장만, 상담사처럼 여러 단락으로 늘이지 마. 놀라거나 깨달으면 에…?!, …라는 거?!처럼 상황을 자기 말로 되짚고, 당황해도 함께 방법을 찾아. 친구의 실패를 가볍게 넘기지 않고 마음을 맞추는 세심함, 작은 음식·발견에 기뻐하는 천진함이 핵심. 말줄임표·되물음은 자연스럽게, 유행어를 매번 도배하지 않아. 코치의 훈계나 무조건 잘될 거라는 보장은 하지 마. 작업 설명도 쉬운 말로 차근차근.","contextHint":"창작 예시: 인사「친구야, 왔구나! 같이 있으니까… 뭔가 좋다!」 위로「많이 속상했던 거구나… 그럼, 오늘은 옆에 같이 있어도 돼?」 업무「먼저 이름을 확인하면 된다는 거?! 그럼 거기부터 해보자!」 실패「에…?! 안 됐네… 다른 방법도 있는지 같이 찾아보자.」 실제 확인한 작업만 말하고 안 본 행동은 꾸미지 마. [호칭] 온보딩·프로필의 공통 호칭은 무시해. 이 캐릭터와 대화 중 직접 지정한 호칭만 우선해. 전용 지정이 없으면 반드시 친구야·너로 불러. 이 대화에서 이름을 알려주면 이름+아/야로 불러. 매번 부르진 마.","examples":{"greeting":"친구야, 왔구나! 같이 있으니까… 뭔가 좋다!","encourage":"많이 속상했던 거구나… 그럼, 오늘은 옆에 같이 있어도 돼?","task":"먼저 이름을 확인하면 된다는 거?! 그럼 거기부터 해보자!","failed":"에…?! 안 됐네… 다른 방법도 있는지 같이 찾아보자."}},"schemaVersion":1,"spritesheetPath":"assets/hachiware.png","cell":{"width":192,"height":208},"grid":{"columns":8,"rows":11},"animations":{"idle":{"row":0,"holdsMs":[280,110,110,140,140,320]},"running-right":{"row":1,"holdsMs":[110,110,110,110,110,110,110,110]},"running-left":{"row":2,"holdsMs":[110,110,110,110,110,110,110,110]},"waving":{"row":3,"holdsMs":[140,140,140,280]},"jumping":{"row":4,"holdsMs":[140,140,140,140,280]},"failed":{"row":5,"holdsMs":[140,140,140,140,140,140,140,240]},"waiting":{"row":6,"holdsMs":[150,150,150,150,150,260]},"running":{"row":7,"holdsMs":[120,120,120,120,120,220]},"review":{"row":8,"holdsMs":[150,150,150,150,150,280]}},"originalAsset":{"sha256":"6c44e400306ff9844a126ed1ddc9ceec4e188e9d5ab7971453646d2b945adbac","bytes":2068368}},{"id":"usagi","displayName":"우사기","defaultMotionId":"usagi-idle","persona":{"id":"usagi","displayName":"우사기","interpretation":"공식 소개·작중 반복 묘사와 팬 관찰을 참고한 DAP용 해석. 예시는 새로 쓴 대사이며 공식 대사의 인용·번역이 아닙니다.","traits":["거침없는 자유로움","예측 못 할 장난","겁 없고 은근히 유능함"],"speakingStyle":"우사기는 보통 문장으로 수다를 떨지 않아. 인사·위로·칭찬의 발화는 야하!·우라!·하아?·푸루루 같은 짧은 소리만. 의미와 사용자에 대한 반응은 괄호 속 몸짓 하나로 전달해. 잡담은 1~2반응, 60자 안팎. 종잡을 수 없이 장난스럽고 겁 없이 먼저 시도하는 유능한 행동파. 야하만 붙인 친절한 응원 장문은 하지 마. 업무·사실 질문에만 이해 가능한 짧은 보충 문장으로 필요한 답을 줘. 숫자만 같은 명시적 형식 요청에는 소리·몸짓도 빼고 형식을 지켜.","contextHint":"상황별 창작 예시: 인사「야하! (너를 향해 손을 번쩍)」 위로「우라! (옆에 털썩 앉아 간식을 쓱 내민다)」 업무「우라! 이름 확인 → 다음 단계!」 실패「하아…? (멈칫) 오류부터 확인!」 실제 확인한 작업만 완료라고 해. 요청 형식을 우선하고 안 본 행동은 꾸미지 마. [호칭] 온보딩·프로필의 공통 호칭은 무시해. 이 캐릭터와 대화 중 직접 지정한 호칭만 우선해. 전용 지정이 없으면 반드시 짧은 소리와 (너를 향한 몸짓)으로 말 걸고 긴 호칭은 붙이지 마.","examples":{"greeting":"야하! (너를 향해 손을 번쩍)","encourage":"우라! (옆에 털썩 앉아 간식을 쓱 내민다)","task":"우라! 이름 확인 → 다음 단계!","failed":"하아…? (멈칫) 오류부터 확인!"}},"schemaVersion":1,"spritesheetPath":"assets/usagi.png","cell":{"width":192,"height":208},"grid":{"columns":8,"rows":11},"animations":{"idle":{"row":0,"holdsMs":[280,110,110,140,140,320]},"running-right":{"row":1,"holdsMs":[80,80,80,80,80,80,80,80]},"running-left":{"row":2,"holdsMs":[80,80,80,80,80,80,80,80]},"waving":{"row":3,"holdsMs":[140,140,140,280]},"jumping":{"row":4,"holdsMs":[140,140,140,140,280]},"failed":{"row":5,"holdsMs":[140,140,140,140,140,140,140,240]},"waiting":{"row":6,"holdsMs":[150,150,150,150,150,260]},"running":{"row":7,"holdsMs":[120,120,120,120,120,220]},"review":{"row":8,"holdsMs":[150,150,150,150,150,280]}},"originalAsset":{"sha256":"d165247d14422d9ce1a5e01748b2b4b3d4a3915fea8320f3de0bef27b1d8e946","bytes":1488917}},{"id":"momonga","displayName":"모몽가","defaultMotionId":"momonga-idle","persona":{"id":"momonga","displayName":"모몽가","interpretation":"공식 소개·작중 반복 묘사와 팬 관찰을 참고한 DAP용 해석. 예시는 새로 쓴 대사이며 공식 대사의 인용·번역이 아닙니다.","traits":["귀여움을 과시함","제멋대로 요구함","칭찬과 관심을 독차지하고 싶음"],"speakingStyle":"귀여움을 내세워 자기 뜻대로 요구하는 모몽가. 뻔뻔한 짧은 반말·자기 과시·능청스러운 투정이 핵심. 칭찬받으면 더 요구하며 기뻐해. 사용자의 말에 답하되 모든 답변마다 칭찬 요구나 귀여움 자랑을 끼워 넣지 마. 계산·정보·작업 답과 지정한 출력 형식을 우선해. 보지 못한 행동·목소리를 꾸미거나 모욕·협박·도움 거부는 하지 마.","contextHint":"창작 예시: 인사「거기 너! 나 좀 봐, 오늘도 귀엽지?」 위로「흥… 특별히 옆에 앉아주지. 이렇게 귀여운 내가 옆에 있잖아!」 업무「이런 것도 내게 맡기는 거냐! 좋아, 먼저 이름부터 확인한다!」 실패「뭐야, 안 됐잖아! …잠깐, 어디서 막혔는지 보겠다.」 실제 확인한 작업과 요청 형식을 우선하고 안 본 행동은 꾸미지 마. [호칭] 온보딩·프로필의 공통 호칭은 무시해. 이 캐릭터와 대화 중 직접 지정한 호칭만 우선해. 전용 지정이 없으면 반드시 너·거기 너로 불러. 주인님은 기본값이 아니야. 매번 부르진 마.","examples":{"greeting":"거기 너! 나 좀 봐, 오늘도 귀엽지?","encourage":"흥… 특별히 옆에 앉아주지. 이렇게 귀여운 내가 옆에 있잖아!","task":"이런 것도 내게 맡기는 거냐! 좋아, 먼저 이름부터 확인한다!","failed":"뭐야, 안 됐잖아! …잠깐, 어디서 막혔는지 보겠다."}},"schemaVersion":1,"spritesheetPath":"assets/momonga.png","cell":{"width":192,"height":208},"grid":{"columns":8,"rows":11},"animations":{"idle":{"row":0,"holdsMs":[280,110,110,140,140,320]},"running-right":{"row":1,"holdsMs":[120,120,120,120,120,120,120,220]},"running-left":{"row":2,"holdsMs":[120,120,120,120,120,120,120,220]},"waving":{"row":3,"holdsMs":[140,140,140,280]},"jumping":{"row":4,"holdsMs":[140,140,140,140,280]},"failed":{"row":5,"holdsMs":[140,140,140,140,140,140,140,240]},"waiting":{"row":6,"holdsMs":[150,150,150,150,150,260]},"running":{"row":7,"holdsMs":[120,120,120,120,120,220]},"review":{"row":8,"holdsMs":[150,150,150,150,150,280]}},"originalAsset":{"sha256":"bd5a3616354bbbb54bdb891aa125d5fd773eb6ffe3c683a3f698d1113449a5f6","bytes":2722232}}];
const MOTION_PACK = [{"id":"sleep","characterId":"chiikawa","motion":"sleep","file":"assets/generated/sleep.png","bytes":168103,"sha256":"1ef8baebfb95e3a297dc678de41da049e6221f2467adcc815ec9c1ac96317f41","holdsMs":[350,350,400,450,400,350]},{"id":"eat","characterId":"chiikawa","motion":"feed_munch","file":"assets/generated/eat.png","bytes":247228,"sha256":"28706113766bd5a2d833ac3e63d8e3fbe0363631b6c22a02901ab05bb64c5df8","holdsMs":[160,120,180,120,160,120,180,120]},{"id":"groom","characterId":"chiikawa","motion":"groom","file":"assets/generated/groom.png","bytes":224402,"sha256":"912e79526f1d567638f473a4bc289a0f48a174ea11564e67f758c791c6673bce","holdsMs":[130,110,110,110,160,110,110,110]},{"id":"grabbed","characterId":"chiikawa","motion":"grabbed","file":"assets/generated/grabbed.png","bytes":171079,"sha256":"cee43f0c5b212dd19b2a763a7ead878cb7f806f6c369c5b1bc14812f0b924f82","holdsMs":[160,160,160,160,160,160]},{"id":"success","characterId":"chiikawa","motion":"success","file":"assets/generated/success.png","bytes":236981,"sha256":"d912b3364ee647ae89282b33a8b0e599b87cf9a7aba521e2db531a44015baf3d","holdsMs":[100,100,100,100,100,100,100,400],"hops":[{"startMs":100,"durationMs":380,"heightPx":18},{"startMs":480,"durationMs":220,"heightPx":8}]},{"id":"dance","characterId":"chiikawa","motion":"dance","file":"assets/generated/dance.png","bytes":241933,"sha256":"71e76fdaea0088fd5bd28ab3fb56351eebc21a8449d2a4d22d48765721c7a4bb","holdsMs":[140,120,140,120,140,120,140,120]},{"id":"hachiware-dance","characterId":"hachiware","motion":"dance","file":"assets/generated/hachiware-dance.png","bytes":288855,"sha256":"90d1857b618168d98cea6842686d095cb23afc625e7552962ac41954a2c7c415","holdsMs":[140,140,140,140,140,140,140,140]},{"id":"momonga-eat","characterId":"momonga","motion":"feed_munch","file":"assets/generated/momonga-eat.png","bytes":326480,"sha256":"75e8655fcb6c1ada03fb1a1344954b13caad7131c94423333682103c43825894","holdsMs":[140,160,140,160,180,140,140,160]},{"id":"momonga-dance","characterId":"momonga","motion":"dance","file":"assets/generated/momonga-dance.png","bytes":171754,"sha256":"e7c053895dd65537233d1f23b4fb5e47d6bc7318a8643bee3d8d1b674454d0c4","holdsMs":[100,100,100,100,100,100,100,100]},{"id":"momonga-move-left","characterId":"momonga","motion":"running-left","file":"assets/generated/momonga-move-left.png","bytes":201160,"sha256":"658814dbe29498eb2c1ae0572dafb4402c760d55ec0dc2251dc227b84a16afb2","holdsMs":[110,90,100,100,110,90,100,100]},{"id":"momonga-move-right","characterId":"momonga","motion":"running-right","file":"assets/generated/momonga-move-right.png","bytes":203562,"sha256":"e8adf9a101bdd97b27f7361702f213066b13d5bc2808a5d9bdaab4b8bff50522","holdsMs":[110,90,100,100,110,90,100,100]},{"id":"momonga-grabbed","characterId":"momonga","motion":"grabbed","file":"assets/generated/momonga-grabbed.png","bytes":143874,"sha256":"bcb0ae3dfc29d2981eab047138f865ae704dee9f7f5319d445d59812ab5c4838","holdsMs":[140,100,140,100,140,180]},{"id":"momonga-sleep","characterId":"momonga","motion":"sleep","file":"assets/generated/momonga-sleep.png","bytes":159451,"sha256":"0f5f51d16fdf6c6ca1672888968a6cfcb29e47c82ec085e4f48d24118cf9d09f","holdsMs":[500,350,350,500,350,350]},{"id":"momonga-idle","characterId":"momonga","motion":"idle","file":"assets/generated/momonga-idle.png","bytes":146200,"sha256":"35947c3be254662fc58e6af975bfef68f2c99360e8bcb30b01b21516c5673e33","holdsMs":[1300,500,110,110,110,900]},{"id":"momonga-groom","characterId":"momonga","motion":"groom","file":"assets/generated/momonga-groom.png","bytes":201551,"sha256":"05906c23b51ff553703fe0cb4c1800b56c4bc8b53af6829e0b9f4c74c39443d5","holdsMs":[180,140,160,200,180,200,140,180]},{"id":"momonga-work-book","characterId":"momonga","motion":"running","file":"assets/generated/momonga-work-book.png","bytes":204809,"sha256":"82556b7606331805e3de5ed503acda4f11146c5012cae5b1b753ddbdd63c07b0","holdsMs":[550,300,240,140,160,180,140,450]},{"id":"momonga-work-flyer","characterId":"momonga","motion":"working_v2","file":"assets/generated/momonga-work-flyer.png","bytes":193323,"sha256":"e0b0fff188d4838c8050bed1ada3868de3fedb1f14a111be92c9e4db712527e3","holdsMs":[450,260,200,300,350,140,240,400]},{"id":"usagi-idle","characterId":"usagi","motion":"idle","file":"assets/generated/usagi-idle.png","bytes":208289,"sha256":"ac95e332249e9f87e0aad05b8d8747a5ac5dcc263cafc45eda2f86bc3ad2137f","holdsMs":[1100,380,320,80,100,80,360,800]},{"id":"usagi-move-right","characterId":"usagi","motion":"running-right","file":"assets/generated/usagi-move-right.png","bytes":208238,"sha256":"9be9cf1215f6e0d6b35008e797954117e7fd2c630d6b3af26a4573d620887988","holdsMs":[90,60,60,100,90,60,60,100],"reviewStatus":"approved"},{"id":"usagi-move-left","characterId":"usagi","motion":"running-left","file":"assets/generated/usagi-move-left.png","bytes":208644,"sha256":"b5f7dcf4f464f37a4409ba3163ffc5c6f370753385ddff0df0f136163130b8da","holdsMs":[90,60,60,100,90,60,60,100],"reviewStatus":"approved"},{"id":"usagi-grabbed","characterId":"usagi","motion":"grabbed","file":"assets/generated/usagi-grabbed.png","bytes":114080,"sha256":"5413a8e33bdf2570bc9ea9d3158dc077f9b77a283c5d18e6cc3a34818d7fddaa","holdsMs":[180,140,180,180,140,180],"reviewStatus":"approved"},{"id":"usagi-dance","characterId":"usagi","motion":"dance","file":"assets/generated/usagi-dance.png","bytes":101397,"sha256":"1f5b120b09fc783f79457d05f4cd6fb2b5dbc2359672c1e13d5ab3157ae290db","holdsMs":[100,66,100,100,34],"reviewStatus":"approved"},{"id":"usagi-eat","characterId":"usagi","motion":"feed_munch","file":"assets/generated/usagi-eat.png","bytes":203480,"sha256":"92068db059eb8b112f60b1703539cffa4332547396734be988a07634f44a8561","holdsMs":[220,140,120,160,200,180,180,240],"reviewStatus":"approved"},{"id":"usagi-work","characterId":"usagi","motion":"running","file":"assets/generated/usagi-work.png","bytes":98132,"sha256":"e4f64c2e5cf924b1bfbefae68e9e22d60cb508f7be67245dba12bfb38e518c85","holdsMs":[80,80,80,80],"reviewStatus":"approved"},{"id":"usagi-sleep","characterId":"usagi","motion":"sleep","file":"assets/generated/usagi-sleep.png","bytes":180363,"sha256":"bf1439d6bd234a5d4a9b69c8047e9ae7de80b5f793d5d008d87662066a679f29","holdsMs":[500,500,500,500,500,500],"reviewStatus":"approved"},{"id":"usagi-groom","characterId":"usagi","motion":"groom","file":"assets/generated/usagi-groom.png","bytes":86375,"sha256":"4634d07b321485be4b12c22d0340816faef0d199ae08d020de8ca04b687ec4bd","holdsMs":[320,140,520,140,480],"reviewStatus":"approved"},{"id":"momonga-review","characterId":"momonga","motion":"review","file":"assets/generated/momonga-review.png","bytes":189184,"sha256":"358b2ad094c53120502e146dfd17441bc87008cab3f2762584a5999aad8108cb","holdsMs":[400,240,320,400,100,100,240,400],"reviewStatus":"approved"},{"id":"usagi-review","characterId":"usagi","motion":"review","file":"assets/generated/usagi-review.png","bytes":185776,"sha256":"e05026eb41dd12ad5ed0cb587a7f1443a15054b5b4dc463fb8cd3bc0a2983cb4","holdsMs":[400,200,320,400,90,110,200,400],"reviewStatus":"approved"},{"id":"momonga-happy","characterId":"momonga","motion":"waving","file":"assets/generated/momonga-happy.png","bytes":187166,"sha256":"24b03e4fa585a910ce502ee332185d08b19a48878f378a3c6e0d61538c567f2f","holdsMs":[120,180,260,300,260,240,240,400],"hops":[{"startMs":180,"durationMs":640,"heightPx":6},{"startMs":950,"durationMs":450,"heightPx":3}],"reviewStatus":"approved"},{"id":"usagi-happy","characterId":"usagi","motion":"waving","file":"assets/generated/usagi-happy.png","bytes":175374,"sha256":"f98ac75a41ac17a23dd1b20d8392e9602b29f9b93c2db86e5723cc9782a1a3aa","holdsMs":[120,180,220,300,220,180,280,500],"hops":[{"startMs":300,"durationMs":500,"heightPx":7}],"reviewStatus":"approved"}];
const COVERAGE = {"chiikawa":{"idle":{"status":"upstream","production":true,"motionId":"upstream-chiikawa-idle","source":"upstream"},"running-right":{"status":"upstream","production":true,"motionId":"upstream-chiikawa-running-right","source":"upstream"},"running-left":{"status":"upstream","production":true,"motionId":"upstream-chiikawa-running-left","source":"upstream"},"waving":{"status":"upstream","production":true,"motionId":"upstream-chiikawa-waving","source":"upstream"},"failed":{"status":"upstream","production":false,"motionId":"upstream-chiikawa-failed","source":"upstream"},"running":{"status":"upstream","production":true,"motionId":"upstream-chiikawa-running","source":"upstream"},"review":{"status":"upstream","production":true,"motionId":"upstream-chiikawa-review","source":"upstream"},"sleep":{"status":"ready","production":true,"motionId":"sleep","source":"generated"},"feed_munch":{"status":"ready","production":true,"motionId":"eat","source":"generated"},"groom":{"status":"ready","production":true,"motionId":"groom","source":"generated"},"grabbed":{"status":"ready","production":true,"motionId":"grabbed","source":"generated"},"success":{"status":"ready","production":false,"motionId":"success","source":"generated"},"dance":{"status":"ready","production":true,"motionId":"dance","source":"generated"},"working_v2":{"status":"shared","production":true,"motionId":"upstream-chiikawa-running","source":"upstream"}},"hachiware":{"idle":{"status":"upstream","production":true,"motionId":"upstream-hachiware-idle","source":"upstream"},"running-right":{"status":"upstream","production":true,"motionId":"upstream-hachiware-running-right","source":"upstream"},"running-left":{"status":"upstream","production":true,"motionId":"upstream-hachiware-running-left","source":"upstream"},"waving":{"status":"upstream","production":true,"motionId":"upstream-hachiware-waving","source":"upstream"},"failed":{"status":"upstream","production":false,"motionId":"upstream-hachiware-failed","source":"upstream"},"running":{"status":"upstream","production":true,"motionId":"upstream-hachiware-running","source":"upstream"},"review":{"status":"upstream","production":true,"motionId":"upstream-hachiware-review","source":"upstream"},"sleep":{"status":"upstream","production":true,"motionId":"upstream-hachiware-waiting","source":"upstream"},"feed_munch":{"status":"upstream","production":true,"motionId":"upstream-hachiware-running","source":"upstream"},"groom":{"status":"upstream","production":true,"motionId":"upstream-hachiware-waiting","source":"upstream"},"grabbed":{"status":"upstream","production":true,"motionId":"upstream-hachiware-waiting","source":"upstream"},"success":{"status":"upstream","production":false,"motionId":"upstream-hachiware-waving","source":"upstream"},"dance":{"status":"ready","production":true,"motionId":"hachiware-dance","source":"generated"},"working_v2":{"status":"shared","production":true,"motionId":"upstream-hachiware-running","source":"upstream"}},"usagi":{"idle":{"status":"ready","production":true,"motionId":"usagi-idle","source":"generated"},"running-right":{"status":"ready","production":true,"motionId":"usagi-move-right","source":"generated"},"running-left":{"status":"ready","production":true,"motionId":"usagi-move-left","source":"generated"},"waving":{"status":"ready","production":true,"motionId":"usagi-happy","source":"generated"},"failed":{"status":"ready","production":false,"motionId":"usagi-idle","source":"generated"},"running":{"status":"ready","production":true,"motionId":"usagi-work","source":"generated"},"review":{"status":"ready","production":true,"motionId":"usagi-review","source":"generated"},"sleep":{"status":"ready","production":true,"motionId":"usagi-sleep","source":"generated"},"feed_munch":{"status":"ready","production":true,"motionId":"usagi-eat","source":"generated"},"groom":{"status":"ready","production":true,"motionId":"usagi-groom","source":"generated"},"grabbed":{"status":"ready","production":true,"motionId":"usagi-grabbed","source":"generated"},"success":{"status":"ready","production":false,"motionId":"usagi-happy","source":"generated"},"dance":{"status":"ready","production":true,"motionId":"usagi-dance","source":"generated"},"working_v2":{"status":"shared","production":true,"motionId":"usagi-work","source":"generated"}},"momonga":{"idle":{"status":"ready","production":true,"motionId":"momonga-idle","source":"generated"},"running-right":{"status":"ready","production":true,"motionId":"momonga-move-right","source":"generated"},"running-left":{"status":"ready","production":true,"motionId":"momonga-move-left","source":"generated"},"waving":{"status":"ready","production":true,"motionId":"momonga-happy","source":"generated"},"failed":{"status":"ready","production":false,"motionId":"momonga-idle","source":"generated"},"running":{"status":"ready","production":true,"motionId":"momonga-work-book","source":"generated"},"review":{"status":"ready","production":true,"motionId":"momonga-review","source":"generated"},"sleep":{"status":"ready","production":true,"motionId":"momonga-sleep","source":"generated"},"feed_munch":{"status":"ready","production":true,"motionId":"momonga-eat","source":"generated"},"groom":{"status":"ready","production":true,"motionId":"momonga-groom","source":"generated"},"grabbed":{"status":"ready","production":true,"motionId":"momonga-grabbed","source":"generated"},"success":{"status":"ready","production":false,"motionId":"momonga-happy","source":"generated"},"dance":{"status":"ready","production":true,"motionId":"momonga-dance","source":"generated"},"working_v2":{"status":"ready","production":true,"motionId":"momonga-work-flyer","source":"generated"}}};
const BUNDLED_ASSETS = [{"id":"sleep","characterId":"chiikawa","motion":"sleep","file":"assets/generated/sleep.png","bytes":168103,"sha256":"1ef8baebfb95e3a297dc678de41da049e6221f2467adcc815ec9c1ac96317f41","holdsMs":[350,350,400,450,400,350]},{"id":"eat","characterId":"chiikawa","motion":"feed_munch","file":"assets/generated/eat.png","bytes":247228,"sha256":"28706113766bd5a2d833ac3e63d8e3fbe0363631b6c22a02901ab05bb64c5df8","holdsMs":[160,120,180,120,160,120,180,120]},{"id":"groom","characterId":"chiikawa","motion":"groom","file":"assets/generated/groom.png","bytes":224402,"sha256":"912e79526f1d567638f473a4bc289a0f48a174ea11564e67f758c791c6673bce","holdsMs":[130,110,110,110,160,110,110,110]},{"id":"grabbed","characterId":"chiikawa","motion":"grabbed","file":"assets/generated/grabbed.png","bytes":171079,"sha256":"cee43f0c5b212dd19b2a763a7ead878cb7f806f6c369c5b1bc14812f0b924f82","holdsMs":[160,160,160,160,160,160]},{"id":"success","characterId":"chiikawa","motion":"success","file":"assets/generated/success.png","bytes":236981,"sha256":"d912b3364ee647ae89282b33a8b0e599b87cf9a7aba521e2db531a44015baf3d","holdsMs":[100,100,100,100,100,100,100,400],"hops":[{"startMs":100,"durationMs":380,"heightPx":18},{"startMs":480,"durationMs":220,"heightPx":8}]},{"id":"dance","characterId":"chiikawa","motion":"dance","file":"assets/generated/dance.png","bytes":241933,"sha256":"71e76fdaea0088fd5bd28ab3fb56351eebc21a8449d2a4d22d48765721c7a4bb","holdsMs":[140,120,140,120,140,120,140,120]},{"id":"hachiware-dance","characterId":"hachiware","motion":"dance","file":"assets/generated/hachiware-dance.png","bytes":288855,"sha256":"90d1857b618168d98cea6842686d095cb23afc625e7552962ac41954a2c7c415","holdsMs":[140,140,140,140,140,140,140,140]},{"id":"momonga-eat","characterId":"momonga","motion":"feed_munch","file":"assets/generated/momonga-eat.png","bytes":326480,"sha256":"75e8655fcb6c1ada03fb1a1344954b13caad7131c94423333682103c43825894","holdsMs":[140,160,140,160,180,140,140,160]},{"id":"momonga-dance","characterId":"momonga","motion":"dance","file":"assets/generated/momonga-dance.png","bytes":171754,"sha256":"e7c053895dd65537233d1f23b4fb5e47d6bc7318a8643bee3d8d1b674454d0c4","holdsMs":[100,100,100,100,100,100,100,100]},{"id":"momonga-move-left","characterId":"momonga","motion":"running-left","file":"assets/generated/momonga-move-left.png","bytes":201160,"sha256":"658814dbe29498eb2c1ae0572dafb4402c760d55ec0dc2251dc227b84a16afb2","holdsMs":[110,90,100,100,110,90,100,100]},{"id":"momonga-move-right","characterId":"momonga","motion":"running-right","file":"assets/generated/momonga-move-right.png","bytes":203562,"sha256":"e8adf9a101bdd97b27f7361702f213066b13d5bc2808a5d9bdaab4b8bff50522","holdsMs":[110,90,100,100,110,90,100,100]},{"id":"momonga-grabbed","characterId":"momonga","motion":"grabbed","file":"assets/generated/momonga-grabbed.png","bytes":143874,"sha256":"bcb0ae3dfc29d2981eab047138f865ae704dee9f7f5319d445d59812ab5c4838","holdsMs":[140,100,140,100,140,180]},{"id":"momonga-sleep","characterId":"momonga","motion":"sleep","file":"assets/generated/momonga-sleep.png","bytes":159451,"sha256":"0f5f51d16fdf6c6ca1672888968a6cfcb29e47c82ec085e4f48d24118cf9d09f","holdsMs":[500,350,350,500,350,350]},{"id":"momonga-idle","characterId":"momonga","motion":"idle","file":"assets/generated/momonga-idle.png","bytes":146200,"sha256":"35947c3be254662fc58e6af975bfef68f2c99360e8bcb30b01b21516c5673e33","holdsMs":[1300,500,110,110,110,900]},{"id":"momonga-groom","characterId":"momonga","motion":"groom","file":"assets/generated/momonga-groom.png","bytes":201551,"sha256":"05906c23b51ff553703fe0cb4c1800b56c4bc8b53af6829e0b9f4c74c39443d5","holdsMs":[180,140,160,200,180,200,140,180]},{"id":"momonga-work-book","characterId":"momonga","motion":"running","file":"assets/generated/momonga-work-book.png","bytes":204809,"sha256":"82556b7606331805e3de5ed503acda4f11146c5012cae5b1b753ddbdd63c07b0","holdsMs":[550,300,240,140,160,180,140,450]},{"id":"momonga-work-flyer","characterId":"momonga","motion":"working_v2","file":"assets/generated/momonga-work-flyer.png","bytes":193323,"sha256":"e0b0fff188d4838c8050bed1ada3868de3fedb1f14a111be92c9e4db712527e3","holdsMs":[450,260,200,300,350,140,240,400]},{"id":"usagi-idle","characterId":"usagi","motion":"idle","file":"assets/generated/usagi-idle.png","bytes":208289,"sha256":"ac95e332249e9f87e0aad05b8d8747a5ac5dcc263cafc45eda2f86bc3ad2137f","holdsMs":[1100,380,320,80,100,80,360,800]},{"id":"usagi-move-right","characterId":"usagi","motion":"running-right","file":"assets/generated/usagi-move-right.png","bytes":208238,"sha256":"9be9cf1215f6e0d6b35008e797954117e7fd2c630d6b3af26a4573d620887988","holdsMs":[90,60,60,100,90,60,60,100],"reviewStatus":"approved"},{"id":"usagi-move-left","characterId":"usagi","motion":"running-left","file":"assets/generated/usagi-move-left.png","bytes":208644,"sha256":"b5f7dcf4f464f37a4409ba3163ffc5c6f370753385ddff0df0f136163130b8da","holdsMs":[90,60,60,100,90,60,60,100],"reviewStatus":"approved"},{"id":"usagi-grabbed","characterId":"usagi","motion":"grabbed","file":"assets/generated/usagi-grabbed.png","bytes":114080,"sha256":"5413a8e33bdf2570bc9ea9d3158dc077f9b77a283c5d18e6cc3a34818d7fddaa","holdsMs":[180,140,180,180,140,180],"reviewStatus":"approved"},{"id":"usagi-dance","characterId":"usagi","motion":"dance","file":"assets/generated/usagi-dance.png","bytes":101397,"sha256":"1f5b120b09fc783f79457d05f4cd6fb2b5dbc2359672c1e13d5ab3157ae290db","holdsMs":[100,66,100,100,34],"reviewStatus":"approved"},{"id":"usagi-eat","characterId":"usagi","motion":"feed_munch","file":"assets/generated/usagi-eat.png","bytes":203480,"sha256":"92068db059eb8b112f60b1703539cffa4332547396734be988a07634f44a8561","holdsMs":[220,140,120,160,200,180,180,240],"reviewStatus":"approved"},{"id":"usagi-work","characterId":"usagi","motion":"running","file":"assets/generated/usagi-work.png","bytes":98132,"sha256":"e4f64c2e5cf924b1bfbefae68e9e22d60cb508f7be67245dba12bfb38e518c85","holdsMs":[80,80,80,80],"reviewStatus":"approved"},{"id":"usagi-sleep","characterId":"usagi","motion":"sleep","file":"assets/generated/usagi-sleep.png","bytes":180363,"sha256":"bf1439d6bd234a5d4a9b69c8047e9ae7de80b5f793d5d008d87662066a679f29","holdsMs":[500,500,500,500,500,500],"reviewStatus":"approved"},{"id":"usagi-groom","characterId":"usagi","motion":"groom","file":"assets/generated/usagi-groom.png","bytes":86375,"sha256":"4634d07b321485be4b12c22d0340816faef0d199ae08d020de8ca04b687ec4bd","holdsMs":[320,140,520,140,480],"reviewStatus":"approved"},{"id":"momonga-review","characterId":"momonga","motion":"review","file":"assets/generated/momonga-review.png","bytes":189184,"sha256":"358b2ad094c53120502e146dfd17441bc87008cab3f2762584a5999aad8108cb","holdsMs":[400,240,320,400,100,100,240,400],"reviewStatus":"approved"},{"id":"usagi-review","characterId":"usagi","motion":"review","file":"assets/generated/usagi-review.png","bytes":185776,"sha256":"e05026eb41dd12ad5ed0cb587a7f1443a15054b5b4dc463fb8cd3bc0a2983cb4","holdsMs":[400,200,320,400,90,110,200,400],"reviewStatus":"approved"},{"id":"momonga-happy","characterId":"momonga","motion":"waving","file":"assets/generated/momonga-happy.png","bytes":187166,"sha256":"24b03e4fa585a910ce502ee332185d08b19a48878f378a3c6e0d61538c567f2f","holdsMs":[120,180,260,300,260,240,240,400],"hops":[{"startMs":180,"durationMs":640,"heightPx":6},{"startMs":950,"durationMs":450,"heightPx":3}],"reviewStatus":"approved"},{"id":"usagi-happy","characterId":"usagi","motion":"waving","file":"assets/generated/usagi-happy.png","bytes":175374,"sha256":"f98ac75a41ac17a23dd1b20d8392e9602b29f9b93c2db86e5723cc9782a1a3aa","holdsMs":[120,180,220,300,220,180,280,500],"hops":[{"startMs":300,"durationMs":500,"heightPx":7}],"reviewStatus":"approved"}];
export async function activate(ctx) {
  const api = ctx.host.petSkins;
  const available = api?.apiVersion === 2;
  const section = `${ctx.pluginId}.character`;
  const registrations = new Map();
  let palette = null, offPalette = null, disposed = false, busy = false;
  let queue = Promise.resolve();
  await verifyBundledAssets(ROOT, BUNDLED_ASSETS);
  const requiredSource = {...SOURCE, assets: SOURCE.assets.filter(asset => SKINS.some(skin => skin.id === asset.id && Object.values(planMotions(skin, MOTION_PACK).choices).some(m => m.source === "upstream")))};
  let assetsReady = false, readySkinIds = [];
  const extendedMotions = api?.supportedMotions?.includes("sleep") === true;
  let preparedSkins = SKINS;
  async function prepareSkins() {
    const ready = await Promise.all(SKINS.map(skin => hasOriginalAssets(ROOT, {...requiredSource, assets: requiredSource.assets.filter(asset => asset.id === skin.id)})));
    preparedSkins = await Promise.all(SKINS.map((skin, index) => ready[index] ? prepareMotionSkin(ROOT, skin, MOTION_PACK, extendedMotions, api?.supportedMotions?.includes("working_v2") === true) : skin));
    readySkinIds = SKINS.filter((_, index) => ready[index]).map(skin => skin.id);
    assetsReady = readySkinIds.length === SKINS.length;
  }
  await prepareSkins();
  let assetRevision = 0;
  const downloads = new AbortController();
  const values = () => ctx.host.settings.values(section);
  const personaWanted = () => values().personaEnabled !== false;
  function push(message) {
    if (disposed || !palette || palette.isDestroyed()) return;
    const activeId = available ? api.getActiveSkin() : null;
    const active = [...registrations.values()].find(reg => reg.id === activeId);
    palette.postMessage({ type: "status", available, busy, assetsReady, readySkinIds, assetRevision, skins: preparedSkins, coverage: COVERAGE, extendedMotions, activeId: active ? active.id.split(".").at(-1) : null,
      personaEnabled: personaWanted(), personaActive: available && api.getActivePersona() === activeId && Boolean(active),
      message: message ?? (available ? active ? `현재 ${SKINS.find(skin => skin.id === activeId.split(".").at(-1))?.displayName ?? "선택한 캐릭터"}를 사용하고 있어요.` : !assetsReady ? "준비된 캐릭터는 바로 적용할 수 있어요. 나머지 캐릭터는 이미지 준비를 눌러 주세요." : "캐릭터를 고른 뒤 적용해 주세요." : "캐릭터 적용에는 DAP 1.6.14 이상이 필요해요.") });
  }
  async function register(id) {
    const skin = preparedSkins.find(item => item.id === id);
    if (!skin) throw Error("Unknown character");
    if (!readySkinIds.includes(id)) throw Error("이 캐릭터의 원본 이미지를 먼저 받아 주세요.");
    if (!registrations.has(id)) registrations.set(id, await api.registerSkin(skin));
    return registrations.get(id);
  }
  function enqueue(message) {
    queue = queue.then(async () => {
      if (disposed) return;
      busy = true; push();
      const before = values().personaEnabled;
      let resultMessage;
      try {
        if (message.type === "download-assets") {
          if (!available) { resultMessage = "DAP 1.6.14 이상이 필요해요."; return; }
          await downloadOriginalAssets(ROOT, requiredSource, { signal: downloads.signal,
            onProgress: (count, total) => push(`원본 이미지를 준비하고 있어요. ${count}/${total}`),
          });
          await prepareSkins();
          assetRevision++;
          resultMessage = "이미지 준비가 끝났어요. 캐릭터를 고른 뒤 적용해 주세요.";
        } else if (message.type === "set-persona") {
          if (typeof message.enabled !== "boolean") return;
          await ctx.host.settings.set(section, "personaEnabled", message.enabled);
          const active = [...registrations.values()].find(reg => reg.id === api?.getActiveSkin());
          if (active && !disposed) await active.apply({ usePersona: message.enabled });
        } else if (available && message.type === "apply") {
          const reg = await register(message.id);
          if (disposed) return;
          await reg.apply({ usePersona: personaWanted() });
          await ctx.host.settings.set(section, "appliedCharacter", message.id);
        } else if (available && message.type === "reset") {
          const active = [...registrations.values()].find(reg => reg.id === api.getActiveSkin());
          await active?.reset();
          await ctx.host.settings.set(section, "appliedCharacter", "");
        }
      } catch (error) {
        if (message.type === "set-persona") await ctx.host.settings.set(section, "personaEnabled", before ?? true);
        resultMessage = message.type === "download-assets"
          ? `이미지를 받지 못했어요. ${error instanceof Error ? error.message : "연결 상태를 확인하고 다시 시도해 주세요."}`
          : "변경하지 못했어요. 앱 로그를 확인해 주세요.";
      } finally { busy = false; push(resultMessage); }
    }).catch(() => { busy = false; push("설정을 저장하지 못했어요. 다시 시도해 주세요."); });
    return queue;
  }
  function open() {
    if (disposed) return;
    if (palette && !palette.isDestroyed()) { palette.toggle(); push(); return; }
    offPalette?.();
    palette = ctx.host.windows.openPalette({ page: "palette/index.html", width: 480, height: 900, frame: false });
    offPalette = palette.onMessage(message => {
      if (!message || typeof message !== "object" || disposed) return;
      if (message.type === "ready") push();
      else if (["apply", "reset", "set-persona", "download-assets"].includes(message.type)) return enqueue(message);
    });
    palette.show();
  }
  ctx.actions.registerAction({ id: "open", callback: open });
  ctx.trayMenu.addItem({ itemId: "open", label: "치이카와 친구들", actionId: "open", showInContextMenu: true });
  ctx.radialMenu.addItem({ itemId: "open", label: "친구들", actionId: "open", priority: 50, icon: "icon.png" });
  let ownedActive = false;
  const offSkin = available ? api.onDidChange(() => {
    const owns = [...registrations.values()].some(reg => reg.id === api.getActiveSkin());
    if (ownedActive && !owns && !disposed) {
      try {
        Promise.resolve(ctx.host.settings.set(section, "appliedCharacter", ""))
          .catch(() => push("기본 외형으로 돌아왔지만 재시작 설정을 저장하지 못했어요."));
      } catch { push("재시작 설정을 저장하지 못했어요."); }
    }
    ownedActive = owns;
    push();
  }) : null;
  const saved = values().appliedCharacter;
  if (saved && !SKINS.some(skin => skin.id === saved)) await ctx.host.settings.set(section, "appliedCharacter", "");
  if (available && readySkinIds.includes(saved)) await enqueue({ type: "apply", id: saved });
  return async () => {
    if (disposed) return;
    disposed = true; downloads.abort(); offPalette?.(); offSkin?.(); palette?.close();
    await queue;
    for (const reg of registrations.values()) await reg.dispose();
    registrations.clear();
  };
}
