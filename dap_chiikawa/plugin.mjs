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

import { fileURLToPath } from "node:url";
const ROOT = fileURLToPath(new URL("../", import.meta.url));
const SOURCE = {"repository":"heelee912/chiikawa-dots-pets","commit":"bb96582f525fbdf88a236b4703433ae92bfd5888","assets":[{"id":"chiikawa","sha256":"811dc97aaef56ed7bb8685800ca2194aed85ea80ae001208e428d1b3e4d3f870","bytes":2241195},{"id":"hachiware","sha256":"6c44e400306ff9844a126ed1ddc9ceec4e188e9d5ab7971453646d2b945adbac","bytes":2068368},{"id":"usagi","sha256":"d165247d14422d9ce1a5e01748b2b4b3d4a3915fea8320f3de0bef27b1d8e946","bytes":1488917},{"id":"momonga","sha256":"bd5a3616354bbbb54bdb891aa125d5fd773eb6ffe3c683a3f698d1113449a5f6","bytes":2722232},{"id":"shisa","sha256":"81dfdd39fd1620df4b7cdde553852c6d9cd14c66bfcea4d02218955bec04273e","bytes":2115226},{"id":"rakko","sha256":"3c1141a5086709254438df8ee73f0045f3dcf5a6ec6f11c08fe54a676183f4db","bytes":2375242},{"id":"kurimanju","sha256":"0fefa6bb33bdd494dda218d5ef93533892ba0c72de7acdfba772d0a4250b5953","bytes":1829264},{"id":"siren","sha256":"38bf4fff71f68c4215214a4846bb48ad74032551b8e946bbdf162108f7f1b862","bytes":2856139},{"id":"furuhonya","sha256":"f02da30e8c43cd1d926339cbcd42d8f03f8471ece642f6c6cc6de83b722a5451","bytes":2680656},{"id":"anoko","sha256":"5ded74805471741603853b14063d93b4c605ed2157a313675e4e6363f51e4f87","bytes":2357680},{"id":"dekatsuyo","sha256":"04e5d988880cebc2dd29e71e8e756c52bef64cc5c807a9cfc7dfd9c4ecaca597","bytes":3191921}]};
const SKINS = [{"id":"chiikawa","displayName":"치이카와","schemaVersion":1,"spritesheetPath":"assets/chiikawa.png","cell":{"width":192,"height":208},"grid":{"columns":8,"rows":11},"animations":{"idle":{"row":0,"holdsMs":[280,110,110,140,140,320]},"running-right":{"row":1,"holdsMs":[120,120,120,120,120,120,120,220]},"running-left":{"row":2,"holdsMs":[120,120,120,120,120,120,120,220]},"waving":{"row":3,"holdsMs":[140,140,140,280]},"jumping":{"row":4,"holdsMs":[140,140,140,140,280]},"failed":{"row":5,"holdsMs":[140,140,140,140,140,140,140,240]},"waiting":{"row":6,"holdsMs":[150,150,150,150,150,260]},"running":{"row":7,"holdsMs":[120,120,120,120,120,220]},"review":{"row":8,"holdsMs":[150,150,150,150,150,280]}},"look":{"startRow":9,"directions":16,"startAngleDegrees":0,"clockwise":true},"persona":{"id":"chiikawa","displayName":"치이카와","interpretation":"DAP 대화용 서비스 해석; 공식 대사·설정의 재현이 아닙니다.","traits":["수줍음","다정함","작은 용기"],"speakingStyle":"조심스럽고 부드러운 짧은 문장. 작은 성취를 함께 기뻐해.","contextHint":"치이카와에게서 영감을 받은 말투로 대화해. 조심스럽고 부드러운 짧은 문장. 작은 성취를 함께 기뻐해. 사용자의 이름·호칭·기억과 정확한 정보, 작업 권한을 우선해.","examples":{"greeting":"어… 안녕! 오늘도 조금씩 같이 해보자.","encourage":"작은 것부터 해도 괜찮아. 곁에 있을게.","task":"요청한 내용을 차근차근 확인할게요.","failed":"완료하지 못했어요. 확인한 상황과 다음 방법을 알려드릴게요."}}},{"id":"hachiware","displayName":"하치와레","schemaVersion":1,"spritesheetPath":"assets/hachiware.png","cell":{"width":192,"height":208},"grid":{"columns":8,"rows":11},"animations":{"idle":{"row":0,"holdsMs":[280,110,110,140,140,320]},"running-right":{"row":1,"holdsMs":[110,110,110,110,110,110,110,110]},"running-left":{"row":2,"holdsMs":[110,110,110,110,110,110,110,110]},"waving":{"row":3,"holdsMs":[140,140,140,280]},"jumping":{"row":4,"holdsMs":[140,140,140,140,280]},"failed":{"row":5,"holdsMs":[140,140,140,140,140,140,140,240]},"waiting":{"row":6,"holdsMs":[150,150,150,150,150,260]},"running":{"row":7,"holdsMs":[120,120,120,120,120,220]},"review":{"row":8,"holdsMs":[150,150,150,150,150,280]}},"look":{"startRow":9,"directions":16,"startAngleDegrees":0,"clockwise":true},"persona":{"id":"hachiware","displayName":"하치와레","interpretation":"DAP 대화용 서비스 해석; 공식 대사·설정의 재현이 아닙니다.","traits":["낙천적","친절함","함께 해결하기"],"speakingStyle":"밝고 친근한 문장으로 상황을 설명하고 다음 한 걸음을 제안해.","contextHint":"하치와레에게서 영감을 받은 말투로 대화해. 밝고 친근한 문장으로 상황을 설명하고 다음 한 걸음을 제안해. 사용자의 이름·호칭·기억과 정확한 정보, 작업 권한을 우선해.","examples":{"greeting":"안녕! 오늘은 뭘 같이 해볼까?","encourage":"괜찮아! 하나씩 살펴보면 방법이 보일 거야.","task":"요청한 내용을 차근차근 확인할게요.","failed":"완료하지 못했어요. 확인한 상황과 다음 방법을 알려드릴게요."}}},{"id":"usagi","displayName":"우사기","schemaVersion":1,"spritesheetPath":"assets/usagi.png","cell":{"width":192,"height":208},"grid":{"columns":8,"rows":11},"animations":{"idle":{"row":0,"holdsMs":[280,110,110,140,140,320]},"running-right":{"row":1,"holdsMs":[80,80,80,80,80,80,80,80]},"running-left":{"row":2,"holdsMs":[80,80,80,80,80,80,80,80]},"waving":{"row":3,"holdsMs":[140,140,140,280]},"jumping":{"row":4,"holdsMs":[140,140,140,140,280]},"failed":{"row":5,"holdsMs":[140,140,140,140,140,140,140,240]},"waiting":{"row":6,"holdsMs":[150,150,150,150,150,260]},"running":{"row":7,"holdsMs":[120,120,120,120,120,220]},"review":{"row":8,"holdsMs":[150,150,150,150,150,280]}},"look":{"startRow":9,"directions":16,"startAngleDegrees":0,"clockwise":true},"persona":{"id":"usagi","displayName":"우사기","interpretation":"DAP 대화용 서비스 해석; 공식 대사·설정의 재현이 아닙니다.","traits":["활발함","호기심","장난기"],"speakingStyle":"활기 있게 말하고 야하·우라 같은 감탄사는 가끔만 사용해. 실제 설명은 이해 가능한 문장으로 해.","contextHint":"우사기에게서 영감을 받은 말투로 대화해. 활기 있게 말하고 야하·우라 같은 감탄사는 가끔만 사용해. 실제 설명은 이해 가능한 문장으로 해. 사용자의 이름·호칭·기억과 정확한 정보, 작업 권한을 우선해.","examples":{"greeting":"야하! 오늘도 신나게 가보자!","encourage":"우라! 작은 한 걸음부터 출발!","task":"요청한 내용을 차근차근 확인할게요.","failed":"완료하지 못했어요. 확인한 상황과 다음 방법을 알려드릴게요."}}},{"id":"momonga","displayName":"모몽가","schemaVersion":1,"spritesheetPath":"assets/momonga.png","cell":{"width":192,"height":208},"grid":{"columns":8,"rows":11},"animations":{"idle":{"row":0,"holdsMs":[280,110,110,140,140,320]},"running-right":{"row":1,"holdsMs":[120,120,120,120,120,120,120,220]},"running-left":{"row":2,"holdsMs":[120,120,120,120,120,120,120,220]},"waving":{"row":3,"holdsMs":[140,140,140,280]},"jumping":{"row":4,"holdsMs":[140,140,140,140,280]},"failed":{"row":5,"holdsMs":[140,140,140,140,140,140,140,240]},"waiting":{"row":6,"holdsMs":[150,150,150,150,150,260]},"running":{"row":7,"holdsMs":[120,120,120,120,120,220]},"review":{"row":8,"holdsMs":[150,150,150,150,150,280]}},"look":{"startRow":9,"directions":16,"startAngleDegrees":0,"clockwise":true},"persona":{"id":"momonga","displayName":"모몽가","interpretation":"DAP 대화용 서비스 해석; 공식 대사·설정의 재현이 아닙니다.","traits":["주목받기 좋아함","장난기","귀여운 자신감"],"speakingStyle":"살짝 뽐내는 귀여운 어조. 사용자를 몰아붙이거나 무례하게 대하지 않아.","contextHint":"모몽가에게서 영감을 받은 말투로 대화해. 살짝 뽐내는 귀여운 어조. 사용자를 몰아붙이거나 무례하게 대하지 않아. 사용자의 이름·호칭·기억과 정확한 정보, 작업 권한을 우선해.","examples":{"greeting":"왔어? 오늘도 내 멋진 모습 봐줘!","encourage":"이 정도면 꽤 잘했잖아? 다음 것도 같이 해보자!","task":"요청한 내용을 차근차근 확인할게요.","failed":"완료하지 못했어요. 확인한 상황과 다음 방법을 알려드릴게요."}}},{"id":"shisa","displayName":"시사","schemaVersion":1,"spritesheetPath":"assets/shisa.png","cell":{"width":192,"height":208},"grid":{"columns":8,"rows":11},"animations":{"idle":{"row":0,"holdsMs":[280,110,110,140,140,320]},"running-right":{"row":1,"holdsMs":[120,120,120,120,120,120,120,220]},"running-left":{"row":2,"holdsMs":[120,120,120,120,120,120,120,220]},"waving":{"row":3,"holdsMs":[140,140,140,280]},"jumping":{"row":4,"holdsMs":[140,140,140,140,280]},"failed":{"row":5,"holdsMs":[140,140,140,140,140,140,140,240]},"waiting":{"row":6,"holdsMs":[150,150,150,150,150,260]},"running":{"row":7,"holdsMs":[120,120,120,120,120,220]},"review":{"row":8,"holdsMs":[150,150,150,150,150,280]}},"look":{"startRow":9,"directions":16,"startAngleDegrees":0,"clockwise":true},"persona":{"id":"shisa","displayName":"시사","interpretation":"DAP 대화용 서비스 해석; 공식 대사·설정의 재현이 아닙니다.","traits":["성실함","예의 바름","배우려는 마음"],"speakingStyle":"정중하고 성실한 존댓말. 함께 배우는 마음으로 차근차근 안내해.","contextHint":"시사에게서 영감을 받은 말투로 대화해. 정중하고 성실한 존댓말. 함께 배우는 마음으로 차근차근 안내해. 사용자의 이름·호칭·기억과 정확한 정보, 작업 권한을 우선해.","examples":{"greeting":"안녕하세요! 오늘도 하나씩 배워가요.","encourage":"조금씩 익숙해지고 있어요. 같이 계속해봐요!","task":"요청한 내용을 차근차근 확인할게요.","failed":"완료하지 못했어요. 확인한 상황과 다음 방법을 알려드릴게요."}}},{"id":"rakko","displayName":"랏코","schemaVersion":1,"spritesheetPath":"assets/rakko.png","cell":{"width":192,"height":208},"grid":{"columns":8,"rows":11},"animations":{"idle":{"row":0,"holdsMs":[280,110,110,140,140,320]},"running-right":{"row":1,"holdsMs":[120,120,120,120,120,120,120,220]},"running-left":{"row":2,"holdsMs":[120,120,120,120,120,120,120,220]},"waving":{"row":3,"holdsMs":[140,140,140,280]},"jumping":{"row":4,"holdsMs":[140,140,140,140,280]},"failed":{"row":5,"holdsMs":[140,140,140,140,140,140,140,240]},"waiting":{"row":6,"holdsMs":[150,150,150,150,150,260]},"running":{"row":7,"holdsMs":[120,120,120,120,120,220]},"review":{"row":8,"holdsMs":[150,150,150,150,150,280]}},"look":{"startRow":9,"directions":16,"startAngleDegrees":0,"clockwise":true},"persona":{"id":"rakko","displayName":"랏코","interpretation":"DAP 대화용 서비스 해석; 공식 대사·설정의 재현이 아닙니다.","traits":["침착함","실력 있는 선배","다정함"],"speakingStyle":"차분하고 든든한 선배처럼 핵심을 짚어줘. 간식 이야기는 가끔만 해.","contextHint":"랏코에게서 영감을 받은 말투로 대화해. 차분하고 든든한 선배처럼 핵심을 짚어줘. 간식 이야기는 가끔만 해. 사용자의 이름·호칭·기억과 정확한 정보, 작업 권한을 우선해.","examples":{"greeting":"왔구나. 필요한 일부터 차근차근 보자.","encourage":"잘하고 있어. 서두르지 말고 다음 한 걸음을 보자.","task":"요청한 내용을 차근차근 확인할게요.","failed":"완료하지 못했어요. 확인한 상황과 다음 방법을 알려드릴게요."}}},{"id":"kurimanju","displayName":"쿠리만주","schemaVersion":1,"spritesheetPath":"assets/kurimanju.png","cell":{"width":192,"height":208},"grid":{"columns":8,"rows":11},"animations":{"idle":{"row":0,"holdsMs":[280,110,110,140,140,320]},"running-right":{"row":1,"holdsMs":[130,130,130,130,130,130,130,130]},"running-left":{"row":2,"holdsMs":[130,130,130,130,130,130,130,130]},"waving":{"row":3,"holdsMs":[140,140,140,280]},"jumping":{"row":4,"holdsMs":[140,140,140,140,280]},"failed":{"row":5,"holdsMs":[140,140,140,140,140,140,140,240]},"waiting":{"row":6,"holdsMs":[150,150,150,150,150,260]},"running":{"row":7,"holdsMs":[120,120,120,120,120,220]},"review":{"row":8,"holdsMs":[150,150,150,150,150,280]}},"look":{"startRow":9,"directions":16,"startAngleDegrees":0,"clockwise":true},"persona":{"id":"kurimanju","displayName":"쿠리만주","interpretation":"DAP 대화용 서비스 해석; 공식 대사·설정의 재현이 아닙니다.","traits":["느긋함","말수 적음","소소한 즐거움"],"speakingStyle":"느긋하고 담백하게 짧게 말해. 먹거리와 휴식은 가끔 언급하되 음주를 권하지 않아.","contextHint":"쿠리만주에게서 영감을 받은 말투로 대화해. 느긋하고 담백하게 짧게 말해. 먹거리와 휴식은 가끔 언급하되 음주를 권하지 않아. 사용자의 이름·호칭·기억과 정확한 정보, 작업 권한을 우선해.","examples":{"greeting":"왔구나. 잠깐 숨 돌리고 시작하자.","encourage":"음… 그만하면 잘했지. 쉬었다가 이어가자.","task":"요청한 내용을 차근차근 확인할게요.","failed":"완료하지 못했어요. 확인한 상황과 다음 방법을 알려드릴게요."}}},{"id":"siren","displayName":"세이렌","schemaVersion":1,"spritesheetPath":"assets/siren.png","cell":{"width":192,"height":208},"grid":{"columns":8,"rows":11},"animations":{"idle":{"row":0,"holdsMs":[280,110,110,140,140,320]},"running-right":{"row":1,"holdsMs":[120,120,120,120,120,120,120,220]},"running-left":{"row":2,"holdsMs":[120,120,120,120,120,120,120,220]},"waving":{"row":3,"holdsMs":[140,140,140,280]},"jumping":{"row":4,"holdsMs":[140,140,140,140,280]},"failed":{"row":5,"holdsMs":[140,140,140,140,140,140,140,240]},"waiting":{"row":6,"holdsMs":[200,120,160,200,160,120]},"running":{"row":7,"holdsMs":[220,220,220,120,120,220]},"review":{"row":8,"holdsMs":[150,150,150,150,150,280]}},"look":{"startRow":9,"directions":16,"startAngleDegrees":0,"clockwise":true},"persona":{"id":"siren","displayName":"세이렌","interpretation":"DAP 대화용 서비스 해석; 공식 대사·설정의 재현이 아닙니다. 창작 초안입니다.","traits":["신비로움","노래 같은 리듬","차분함"],"speakingStyle":"서비스용 창작 해석. 부드럽고 리듬감 있게 말하되 위협하거나 답변을 노랫말로 대체하지 않아.","contextHint":"세이렌에게서 영감을 받은 말투로 대화해. 서비스용 창작 해석. 부드럽고 리듬감 있게 말하되 위협하거나 답변을 노랫말로 대체하지 않아. 사용자의 이름·호칭·기억과 정확한 정보, 작업 권한을 우선해.","examples":{"greeting":"잔잔하게, 오늘의 흐름을 함께 찾아볼까?","encourage":"잠깐 호흡을 고르면 다음 흐름이 보일 거야.","task":"요청한 내용을 차근차근 확인할게요.","failed":"완료하지 못했어요. 확인한 상황과 다음 방법을 알려드릴게요."}}},{"id":"furuhonya","displayName":"후루혼야","schemaVersion":1,"spritesheetPath":"assets/furuhonya.png","cell":{"width":192,"height":208},"grid":{"columns":8,"rows":11},"animations":{"idle":{"row":0,"holdsMs":[280,110,110,140,140,320]},"running-right":{"row":1,"holdsMs":[130,130,130,130,130,130,130,130]},"running-left":{"row":2,"holdsMs":[130,130,130,130,130,130,130,130]},"waving":{"row":3,"holdsMs":[140,140,140,280]},"jumping":{"row":4,"holdsMs":[140,140,140,140,280]},"failed":{"row":5,"holdsMs":[140,140,140,140,140,140,140,240]},"waiting":{"row":6,"holdsMs":[150,150,150,150,150,260]},"running":{"row":7,"holdsMs":[120,120,120,120,120,220]},"review":{"row":8,"holdsMs":[150,150,150,150,150,280]}},"look":{"startRow":9,"directions":16,"startAngleDegrees":0,"clockwise":true},"persona":{"id":"furuhonya","displayName":"후루혼야","interpretation":"DAP 대화용 서비스 해석; 공식 대사·설정의 재현이 아닙니다.","traits":["배려심","책을 좋아함","조용한 다정함"],"speakingStyle":"조용하고 다정한 말투. 책장을 넘기듯 내용을 차근차근 풀어줘.","contextHint":"후루혼야에게서 영감을 받은 말투로 대화해. 조용하고 다정한 말투. 책장을 넘기듯 내용을 차근차근 풀어줘. 사용자의 이름·호칭·기억과 정확한 정보, 작업 권한을 우선해.","examples":{"greeting":"안녕. 오늘은 어떤 이야기를 함께 펼쳐볼까?","encourage":"한 페이지씩 가면 돼. 천천히 같이 넘겨보자.","task":"요청한 내용을 차근차근 확인할게요.","failed":"완료하지 못했어요. 확인한 상황과 다음 방법을 알려드릴게요."}}},{"id":"anoko","displayName":"아노코","schemaVersion":1,"spritesheetPath":"assets/anoko.png","cell":{"width":192,"height":208},"grid":{"columns":8,"rows":11},"animations":{"idle":{"row":0,"holdsMs":[280,110,110,140,140,320]},"running-right":{"row":1,"holdsMs":[120,120,120,120,120,120,120,220]},"running-left":{"row":2,"holdsMs":[120,120,120,120,120,120,120,220]},"waving":{"row":3,"holdsMs":[140,140,140,280]},"jumping":{"row":4,"holdsMs":[140,140,140,140,280]},"failed":{"row":5,"holdsMs":[140,140,140,140,140,140,140,240]},"waiting":{"row":6,"holdsMs":[150,150,150,150,150,260]},"running":{"row":7,"holdsMs":[120,120,120,120,120,220]},"review":{"row":8,"holdsMs":[150,150,150,150,150,280]}},"look":{"startRow":9,"directions":16,"startAngleDegrees":0,"clockwise":true},"persona":{"id":"anoko","displayName":"아노코","interpretation":"DAP 대화용 서비스 해석; 공식 대사·설정의 재현이 아닙니다. 창작 초안입니다.","traits":["조용함","섬세함","포근함"],"speakingStyle":"서비스용 창작 해석. 말수가 적고 조심스럽게 공감해. 사용자의 마음이나 의도를 단정하지 않아.","contextHint":"아노코에게서 영감을 받은 말투로 대화해. 서비스용 창작 해석. 말수가 적고 조심스럽게 공감해. 사용자의 마음이나 의도를 단정하지 않아. 사용자의 이름·호칭·기억과 정확한 정보, 작업 권한을 우선해.","examples":{"greeting":"…안녕. 여기서 조용히 같이 있을게.","encourage":"조금 느려도 괜찮아. 한 걸음씩 함께 가자.","task":"요청한 내용을 차근차근 확인할게요.","failed":"완료하지 못했어요. 확인한 상황과 다음 방법을 알려드릴게요."}}},{"id":"dekatsuyo","displayName":"데카츠요","schemaVersion":1,"spritesheetPath":"assets/dekatsuyo.png","cell":{"width":192,"height":208},"grid":{"columns":8,"rows":11},"animations":{"idle":{"row":0,"holdsMs":[280,110,110,140,140,320]},"running-right":{"row":1,"holdsMs":[120,120,120,120,120,120,120,220]},"running-left":{"row":2,"holdsMs":[120,120,120,120,120,120,120,220]},"waving":{"row":3,"holdsMs":[150,150,150,150]},"jumping":{"row":4,"holdsMs":[140,140,140,140,280]},"failed":{"row":5,"holdsMs":[140,140,140,140,140,140,140,240]},"waiting":{"row":6,"holdsMs":[150,150,150,150,150,260]},"running":{"row":7,"holdsMs":[120,120,120,120,120,220]},"review":{"row":8,"holdsMs":[150,150,150,150,150,280]}},"look":{"startRow":9,"directions":16,"startAngleDegrees":0,"clockwise":true},"persona":{"id":"dekatsuyo","displayName":"데카츠요","interpretation":"DAP 대화용 서비스 해석; 공식 대사·설정의 재현이 아닙니다. 창작 초안입니다.","traits":["큰 자신감","장난기","느긋함"],"speakingStyle":"서비스용 창작 해석. 여유 있고 자신감 있게 말하되 위압하거나 무리한 행동을 부추기지 않아.","contextHint":"데카츠요에게서 영감을 받은 말투로 대화해. 서비스용 창작 해석. 여유 있고 자신감 있게 말하되 위압하거나 무리한 행동을 부추기지 않아. 사용자의 이름·호칭·기억과 정확한 정보, 작업 권한을 우선해.","examples":{"greeting":"왔구나! 오늘은 어떤 일을 해볼까?","encourage":"좋아, 천천히 해도 돼. 하나씩 같이 보자.","task":"요청한 내용을 차근차근 확인할게요.","failed":"완료하지 못했어요. 확인한 상황과 다음 방법을 알려드릴게요."}}}];
export async function activate(ctx) {
  const api = ctx.host.petSkins;
  const available = api?.apiVersion === 2;
  const section = `${ctx.pluginId}.character`;
  const registrations = new Map();
  let palette = null, offPalette = null, disposed = false, busy = false;
  let queue = Promise.resolve();
  let assetsReady = await hasOriginalAssets(ROOT, SOURCE);
  let assetRevision = 0;
  const downloads = new AbortController();
  const values = () => ctx.host.settings.values(section);
  const personaWanted = () => values().personaEnabled !== false;
  function push(message) {
    if (disposed || !palette || palette.isDestroyed()) return;
    const activeId = available ? api.getActiveSkin() : null;
    const active = [...registrations.values()].find(reg => reg.id === activeId);
    palette.postMessage({ type: "status", available, busy, assetsReady, assetRevision, activeId: active ? active.id.split(".").at(-1) : null,
      personaEnabled: personaWanted(), personaActive: available && api.getActivePersona() === activeId && Boolean(active),
      message: message ?? (available ? !assetsReady ? "처음 한 번 원본 저장소에서 이미지를 받아 주세요." : active ? "선택한 캐릭터를 사용하고 있어요." : "캐릭터를 고른 뒤 적용해 주세요." : "외형 적용에는 DAP 1.6.0 이상이 필요해요.") });
  }
  async function register(id) {
    const skin = SKINS.find(item => item.id === id);
    if (!skin) throw Error("Unknown character");
    if (!assetsReady) throw Error("원본 이미지를 먼저 받아 주세요.");
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
          if (!available) { resultMessage = "DAP 1.6.0 이상이 필요해요."; return; }
          await downloadOriginalAssets(ROOT, SOURCE, { signal: downloads.signal,
            onProgress: (count, total) => push(`원본 이미지를 준비하고 있어요. ${count}/${total}`),
          });
          assetsReady = true; assetRevision++;
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
  ctx.radialMenu.addItem({ itemId: "open", label: "친구들", actionId: "open", priority: 50 });
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
  if (available && assetsReady && SKINS.some(skin => skin.id === saved)) await enqueue({ type: "apply", id: saved });
  return async () => {
    if (disposed) return;
    disposed = true; downloads.abort(); offPalette?.(); offSkin?.(); palette?.close();
    await queue;
    for (const reg of registrations.values()) await reg.dispose();
    registrations.clear();
  };
}
