import { readFile, lstat, mkdir, realpath, open, rename, rm } from "node:fs/promises";
import { resolve, join } from "node:path";
import { createHash, randomUUID } from "node:crypto";
const MAX_BYTES = 8_000_000;
async function assetsDirectory(root) {
  const base = await realpath(root);
  const target = join(base, "assets");
  await mkdir(target, { recursive: true });
  if ((await lstat(target)).isSymbolicLink() || await realpath(target) !== resolve(target)) throw Error("이미지 폴더가 플러그인 밖을 가리킵니다.");
  return target;
}
function assetPath(directory, asset) {
  if (!/^[a-z0-9_-]+$/.test(asset.id) || !/^[a-f0-9]{64}$/.test(asset.sha256) || !Number.isInteger(asset.bytes) || asset.bytes < 24 || asset.bytes > MAX_BYTES) throw Error("잘못된 원본 이미지 정보입니다.");
  return join(directory, `${asset.id}.png`);
}
function validBytes(bytes, asset) {
  return bytes.length === asset.bytes && bytes.subarray(0, 8).equals(Buffer.from([137,80,78,71,13,10,26,10])) &&
    bytes.readUInt32BE(16) === 1536 && bytes.readUInt32BE(20) === 2288 && createHash("sha256").update(bytes).digest("hex") === asset.sha256;
}
async function cached(directory, asset) {
  const file = assetPath(directory, asset);
  let info;
  try { info = await lstat(file); } catch (error) { if (error.code === "ENOENT") return false; throw error; }
  if (info.isSymbolicLink() || !info.isFile()) throw Error("안전하지 않은 이미지 경로입니다.");
  if (info.size !== asset.bytes) return false;
  return validBytes(await readFile(file), asset);
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
      const temporary = join(directory, `${asset.id}-${randomUUID()}.part`);
      try {
        const file = await open(temporary, "wx", 0o600);
        try { await file.writeFile(bytes); } finally { await file.close(); }
        signal?.throwIfAborted();
        await rename(temporary, destination);
      } finally { await rm(temporary, { force: true }); }
    }
    onProgress(++count, source.assets.length);
  }
}
