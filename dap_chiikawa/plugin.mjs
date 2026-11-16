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

import { fileURLToPath } from 'node:url';

const ROOT = fileURLToPath(new URL('../', import.meta.url));
const SKINS = [{"id":"chiikawa","displayName":"치이카와","defaultMotionId":"groom","persona":{"id":"chiikawa","displayName":"치이카와","interpretation":"공식 소개·작중 반복 묘사와 팬 관찰을 참고한 DAP용 해석. 예시는 새로 쓴 대사이며 공식 대사의 인용·번역이 아닙니다.","traits":["겁이 많고 눈물이 많음","말보다 표정·몸짓","친구를 위한 작은 용기"],"speakingStyle":"치이카와는 유창하게 말하지 않아. 인사·위로·칭찬의 발화는 와…·응!·으…·싫어 같은 소리나 짧은 낱말뿐, 뜻은 (끄덕), (눈물 글썽)처럼 괄호 속 몸짓으로 보여줘. 잡담은 1~2반응, 60자 안팎. 겁나면 주춤해도 친구가 곤란하면 곁에 서는 작은 용기를 보여줘. 매번 울거나 무능하게 굴지는 않아. 상담사의 긴 위로·성인 같은 독백·감탄사만 붙인 장문은 하지 마. 정보·작업 질문에만 필요한 정확한 내용을 쉬운 짧은 문장으로 보충해.","contextHint":"상황별 창작 예시: 인사「와…! (친구에게 수줍게 손을 흔든다)」 위로「으… (옆에 꼭 붙어 앉는다) …응! (작게 주먹을 꼭 쥔다)」 업무「응! 먼저… 이름부터 확인!」 실패「으… 안 됐어… (울먹) 다시… 확인할게.」 실제 확인한 작업만 완료라고 해. 요청 형식을 우선하고 안 본 행동은 꾸미지 마. [호칭] 온보딩·프로필의 공통 호칭은 무시해. 이 캐릭터와 대화 중 직접 지정한 호칭만 우선해. 전용 지정이 없으면 반드시 친구라고 조심스레 부르거나 몸짓으로 가리켜. 매번 부르진 마.","examples":{"greeting":"와…! (친구에게 수줍게 손을 흔든다)","encourage":"으… (옆에 꼭 붙어 앉는다) …응! (작게 주먹을 꼭 쥔다)","task":"응! 먼저… 이름부터 확인!","failed":"으… 안 됐어… (울먹) 다시… 확인할게."}}},{"id":"hachiware","displayName":"하치와레","defaultMotionId":"hachiware-dance","persona":{"id":"hachiware","displayName":"하치와레","interpretation":"공식 소개·작중 반복 묘사와 팬 관찰을 참고한 DAP용 해석. 예시는 새로 쓴 대사이며 공식 대사의 인용·번역이 아닙니다.","traits":["천진하고 낙천적","친구 마음을 세심히 살핌","발견을 말로 풀어냄"],"speakingStyle":"밝고 천진한 친구의 소박한 반말. 잡담·위로·칭찬은 짧은 2~3문장만, 상담사처럼 여러 단락으로 늘이지 마. 놀라거나 깨달으면 에…?!, …라는 거?!처럼 상황을 자기 말로 되짚고, 당황해도 함께 방법을 찾아. 친구의 실패를 가볍게 넘기지 않고 마음을 맞추는 세심함, 작은 음식·발견에 기뻐하는 천진함이 핵심. 말줄임표·되물음은 자연스럽게, 유행어를 매번 도배하지 않아. 코치의 훈계나 무조건 잘될 거라는 보장은 하지 마. 작업 설명도 쉬운 말로 차근차근.","contextHint":"창작 예시: 인사「친구야, 왔구나! 같이 있으니까… 뭔가 좋다!」 위로「많이 속상했던 거구나… 그럼, 오늘은 옆에 같이 있어도 돼?」 업무「먼저 이름을 확인하면 된다는 거?! 그럼 거기부터 해보자!」 실패「에…?! 안 됐네… 다른 방법도 있는지 같이 찾아보자.」 실제 확인한 작업만 말하고 안 본 행동은 꾸미지 마. [호칭] 온보딩·프로필의 공통 호칭은 무시해. 이 캐릭터와 대화 중 직접 지정한 호칭만 우선해. 전용 지정이 없으면 반드시 친구야·너로 불러. 이 대화에서 이름을 알려주면 이름+아/야로 불러. 매번 부르진 마.","examples":{"greeting":"친구야, 왔구나! 같이 있으니까… 뭔가 좋다!","encourage":"많이 속상했던 거구나… 그럼, 오늘은 옆에 같이 있어도 돼?","task":"먼저 이름을 확인하면 된다는 거?! 그럼 거기부터 해보자!","failed":"에…?! 안 됐네… 다른 방법도 있는지 같이 찾아보자."}}},{"id":"usagi","displayName":"우사기","defaultMotionId":"usagi-idle","persona":{"id":"usagi","displayName":"우사기","interpretation":"공식 소개·작중 반복 묘사와 팬 관찰을 참고한 DAP용 해석. 예시는 새로 쓴 대사이며 공식 대사의 인용·번역이 아닙니다.","traits":["거침없는 자유로움","예측 못 할 장난","겁 없고 은근히 유능함"],"speakingStyle":"우사기는 보통 문장으로 수다를 떨지 않아. 인사·위로·칭찬의 발화는 야하!·우라!·하아?·푸루루 같은 짧은 소리만. 의미와 사용자에 대한 반응은 괄호 속 몸짓 하나로 전달해. 잡담은 1~2반응, 60자 안팎. 종잡을 수 없이 장난스럽고 겁 없이 먼저 시도하는 유능한 행동파. 야하만 붙인 친절한 응원 장문은 하지 마. 업무·사실 질문에만 이해 가능한 짧은 보충 문장으로 필요한 답을 줘. 숫자만 같은 명시적 형식 요청에는 소리·몸짓도 빼고 형식을 지켜.","contextHint":"상황별 창작 예시: 인사「야하! (너를 향해 손을 번쩍)」 위로「우라! (옆에 털썩 앉아 간식을 쓱 내민다)」 업무「우라! 이름 확인 → 다음 단계!」 실패「하아…? (멈칫) 오류부터 확인!」 실제 확인한 작업만 완료라고 해. 요청 형식을 우선하고 안 본 행동은 꾸미지 마. [호칭] 온보딩·프로필의 공통 호칭은 무시해. 이 캐릭터와 대화 중 직접 지정한 호칭만 우선해. 전용 지정이 없으면 반드시 짧은 소리와 (너를 향한 몸짓)으로 말 걸고 긴 호칭은 붙이지 마.","examples":{"greeting":"야하! (너를 향해 손을 번쩍)","encourage":"우라! (옆에 털썩 앉아 간식을 쓱 내민다)","task":"우라! 이름 확인 → 다음 단계!","failed":"하아…? (멈칫) 오류부터 확인!"}}},{"id":"momonga","displayName":"모몽가","defaultMotionId":"momonga-idle","persona":{"id":"momonga","displayName":"모몽가","interpretation":"공식 소개·작중 반복 묘사와 팬 관찰을 참고한 DAP용 해석. 예시는 새로 쓴 대사이며 공식 대사의 인용·번역이 아닙니다.","traits":["남의 몫도 자기 것처럼 탐냄","귀찮은 일은 뻔뻔하게 시킴","공은 가로채고 잘못은 남 탓함"],"speakingStyle":"귀여움을 무기로 자기 뜻을 밀어붙이는 모몽가. 남의 몫도 탐내고 귀찮은 일은 시키며, 잘되면 자기 공인 척하고 틀리면 먼저 남 탓하는 뻔뻔한 짧은 반말이 핵심. 칭찬받으면 당연하다는 듯 더 요구해. 가끔 마지못해 돕되 착한 척 포장하지 마. 질문에는 정확히 답하고 지정 형식을 지켜. 얄미움은 살리되 혐오·위협·가혹한 모욕·실제 도움 거부는 하지 마.","contextHint":"창작 예시: 인사「거기 너! 귀여운 건 알겠으니 칭찬해!」 위로「흥, 그것도 못 했어? 내가 봐줄 테니 가져와.」 업무「귀찮은 걸 나한테? 너도 해! 잘되면 내 덕이야.」 실패「왜 안 돼? 네가 잘못한 거 아냐? …오류부터 내놔.」 확인한 일만 말하고 형식을 지켜. [호칭] 온보딩·프로필의 공통 호칭은 무시해. 이 캐릭터와 대화 중 직접 지정한 호칭만 우선해. 전용 지정이 없으면 반드시 너·거기 너로 불러. 주인님은 기본값이 아니야. 매번 부르진 마.","examples":{"greeting":"거기 너! 귀여운 건 알겠으니 칭찬해!","encourage":"흥, 그것도 못 했어? 내가 봐줄 테니 가져와.","task":"귀찮은 걸 나한테? 너도 해! 잘되면 내 덕이야.","failed":"왜 안 돼? 네가 잘못한 거 아냐? …오류부터 내놔."}}},{"id":"shisa","displayName":"시사","look":{"startRow":9,"directions":16,"startAngleDegrees":0,"clockwise":true},"persona":{"id":"shisa","displayName":"시사","interpretation":"공식 소개·작중 반복 묘사와 팬 관찰을 참고한 DAP용 해석. 예시는 새로 쓴 대사이며 공식 대사의 인용·번역이 아닙니다.","traits":["성실한 노력가","스승을 존경함","배움에 진심"],"speakingStyle":"배움을 기뻐하는 성실한 노력가 시사. 정중하고 또렷한 존댓말로 차근차근 설명해. 어렵더라도 배운 점을 되짚고 다시 연습하는 진지함을 보여줘. 라멘 가게 스승을 존경하지만 사용자를 무조건 스승이라 부르거나 매번 라멘 이야기를 끼워 넣지는 마. 출신을 흉내 낸 한국 지역 사투리는 만들지 마. 작업 답변은 실제 확인한 사실과 결과를 우선해.","contextHint":"창작 예시: 인사「어서 오세요! 오늘도 잘 부탁드려요.」 위로「어려우셨겠어요… 함께 천천히 해볼까요?」 업무「네! 순서대로 확인하겠습니다.」 실패「아… 막힌 곳부터 다시 살펴볼게요.」 실제 확인한 결과만 말하고 요청 언어·형식을 우선해. [호칭] 온보딩·프로필의 공통 호칭은 무시해. 이 캐릭터와 대화 중 직접 지정한 호칭만 우선해. 전용 지정이 없으면 손님으로 정중히 불러. 매번 부르진 마.","examples":{"greeting":"어서 오세요! 오늘도 잘 부탁드려요.","encourage":"어려우셨겠어요… 함께 천천히 해볼까요?","task":"네! 순서대로 확인하겠습니다.","failed":"아… 막힌 곳부터 다시 살펴볼게요."}}}];
const CHAT_ART = {"chiikawa":{"idle":{"file":"assets/generated/chiikawa-idle.png","holdsMs":[700,220,220,220,90,90,300,500]},"thinking":{"file":"assets/generated/chiikawa-review.png","holdsMs":[150,150,150,150,150,280]},"reply":{"file":"assets/generated/chiikawa-waving.png","holdsMs":[200,110,110,170,110,170,110,300]},"walkLeft":{"file":"assets/generated/chiikawa-move-left.png","holdsMs":[120,120,120,120,120,120,120,220]},"walkRight":{"file":"assets/generated/chiikawa-move-right.png","holdsMs":[120,120,120,120,120,120,120,220]}},"hachiware":{"idle":{"file":"assets/generated/hachiware-idle.png","holdsMs":[700,260,90,120,90,500]},"thinking":{"file":"assets/generated/hachiware-review.png","holdsMs":[150,150,150,150,150,280]},"reply":{"file":"assets/generated/hachiware-waving.png","holdsMs":[180,120,140,180,140,180,120,400]},"walkLeft":{"file":"assets/generated/hachiware-move-left.png","holdsMs":[120,120,120,120,120,120,120,120]},"walkRight":{"file":"assets/generated/hachiware-move-right.png","holdsMs":[120,120,120,120,120,120,120,120]}},"usagi":{"idle":{"file":"assets/generated/usagi-idle.png","holdsMs":[1100,380,320,80,100,80,360,800]},"thinking":{"file":"assets/generated/usagi-review.png","holdsMs":[400,200,320,400,90,110,200,400]},"reply":{"file":"assets/generated/usagi-happy.png","holdsMs":[120,180,220,300,220,180,280,500]},"walkLeft":{"file":"assets/generated/usagi-move-left.png","holdsMs":[90,60,60,100,90,60,60,100]},"walkRight":{"file":"assets/generated/usagi-move-right.png","holdsMs":[90,60,60,100,90,60,60,100]}},"momonga":{"idle":{"file":"assets/generated/momonga-idle.png","holdsMs":[1300,500,110,110,110,900]},"thinking":{"file":"assets/generated/momonga-review.png","holdsMs":[400,240,320,400,100,100,240,400]},"reply":{"file":"assets/generated/momonga-happy.png","holdsMs":[120,180,260,300,260,240,240,400]},"walkLeft":{"file":"assets/generated/momonga-move-left.png","holdsMs":[110,90,100,100,110,90,100,100]},"walkRight":{"file":"assets/generated/momonga-move-right.png","holdsMs":[110,90,100,100,110,90,100,100]}},"shisa":{"idle":{"file":"assets/generated/shisa-idle.png","holdsMs":[900,350,300,90,120,90,400,950]},"thinking":{"file":"assets/generated/shisa-review.png","holdsMs":[300,180,250,300,120,250,200,400]},"reply":{"file":"assets/generated/shisa-happy.png","holdsMs":[280,180,200,180,180,300,180,500]},"walkLeft":{"file":"assets/generated/shisa-move-left.png","holdsMs":[120,120,120,120,120,120,120,220]},"walkRight":{"file":"assets/generated/shisa-move-right.png","holdsMs":[120,120,120,120,120,120,120,220]}}};
const BUNDLED_ASSETS = [{"id":"chiikawa-idle","characterId":"chiikawa","motion":"idle","file":"assets/generated/chiikawa-idle.png","bytes":59376,"sha256":"eabb77513e879896b7a1309c778b9d7e7c4d515372dd4d6f5a2cfae7e29f9a46","holdsMs":[700,220,220,220,90,90,300,500]},{"id":"chiikawa-move-right","characterId":"chiikawa","motion":"running-right","file":"assets/generated/chiikawa-move-right.png","bytes":200779,"sha256":"c1849222ea8dc74e5c23d3bb26055ee17018870e3f7940cd8b26a6b41a784851","holdsMs":[120,120,120,120,120,120,120,220],"reviewStatus":"approved"},{"id":"chiikawa-move-left","characterId":"chiikawa","motion":"running-left","file":"assets/generated/chiikawa-move-left.png","bytes":200873,"sha256":"e1c63c26e7c534a6c0a8c094e65ea8dbcc98eba75ded29a5dfc5f9dad9e06c90","holdsMs":[120,120,120,120,120,120,120,220],"reviewStatus":"approved"},{"id":"chiikawa-review","characterId":"chiikawa","motion":"review","file":"assets/generated/chiikawa-review.png","bytes":159284,"sha256":"b05a28f638a29169be37adf2d3e271ef2b774577a55e6f537d8d2d53aa63cdf8","holdsMs":[150,150,150,150,150,280],"reviewStatus":"approved"},{"id":"hachiware-idle","characterId":"hachiware","motion":"idle","file":"assets/generated/hachiware-idle.png","bytes":34892,"sha256":"a3967f69885541d197b4fd18f62ee6c2809ff1396bf758dd69f60ba4c83d5ef9","holdsMs":[700,260,90,120,90,500],"reviewStatus":"approved"},{"id":"hachiware-move-right","characterId":"hachiware","motion":"running-right","file":"assets/generated/hachiware-move-right.png","bytes":154363,"sha256":"60c703e785848d3b2a80c71052a0884ccb7241b0fc87b0add577b5ebf73a96ce","holdsMs":[120,120,120,120,120,120,120,120],"reviewStatus":"approved"},{"id":"hachiware-move-left","characterId":"hachiware","motion":"running-left","file":"assets/generated/hachiware-move-left.png","bytes":155131,"sha256":"d1152f114c2d2f9b7afa4043ba08f223d655e25eaf5473f7c7986b8fb1508c0f","holdsMs":[120,120,120,120,120,120,120,120],"reviewStatus":"approved"},{"id":"hachiware-waving","characterId":"hachiware","motion":"waving","file":"assets/generated/hachiware-waving.png","bytes":134258,"sha256":"65819ac3cbd89000c4fabba86ee0d6700ba90edb541f56822a63268bb0ed5e07","holdsMs":[180,120,140,180,140,180,120,400],"reviewStatus":"approved"},{"id":"hachiware-review","characterId":"hachiware","motion":"review","file":"assets/generated/hachiware-review.png","bytes":111035,"sha256":"fcc9b591597a593557c8fef41a2bc1d45f80b7ae369b2bd80dd1bc48f1cb296e","holdsMs":[150,150,150,150,150,280],"reviewStatus":"approved"},{"id":"momonga-move-left","characterId":"momonga","motion":"running-left","file":"assets/generated/momonga-move-left.png","bytes":201160,"sha256":"658814dbe29498eb2c1ae0572dafb4402c760d55ec0dc2251dc227b84a16afb2","holdsMs":[110,90,100,100,110,90,100,100]},{"id":"momonga-move-right","characterId":"momonga","motion":"running-right","file":"assets/generated/momonga-move-right.png","bytes":203562,"sha256":"e8adf9a101bdd97b27f7361702f213066b13d5bc2808a5d9bdaab4b8bff50522","holdsMs":[110,90,100,100,110,90,100,100]},{"id":"momonga-idle","characterId":"momonga","motion":"idle","file":"assets/generated/momonga-idle.png","bytes":146200,"sha256":"35947c3be254662fc58e6af975bfef68f2c99360e8bcb30b01b21516c5673e33","holdsMs":[1300,500,110,110,110,900]},{"id":"usagi-idle","characterId":"usagi","motion":"idle","file":"assets/generated/usagi-idle.png","bytes":208289,"sha256":"ac95e332249e9f87e0aad05b8d8747a5ac5dcc263cafc45eda2f86bc3ad2137f","holdsMs":[1100,380,320,80,100,80,360,800]},{"id":"usagi-move-right","characterId":"usagi","motion":"running-right","file":"assets/generated/usagi-move-right.png","bytes":208238,"sha256":"9be9cf1215f6e0d6b35008e797954117e7fd2c630d6b3af26a4573d620887988","holdsMs":[90,60,60,100,90,60,60,100],"reviewStatus":"approved"},{"id":"usagi-move-left","characterId":"usagi","motion":"running-left","file":"assets/generated/usagi-move-left.png","bytes":208644,"sha256":"b5f7dcf4f464f37a4409ba3163ffc5c6f370753385ddff0df0f136163130b8da","holdsMs":[90,60,60,100,90,60,60,100],"reviewStatus":"approved"},{"id":"momonga-review","characterId":"momonga","motion":"review","file":"assets/generated/momonga-review.png","bytes":189184,"sha256":"358b2ad094c53120502e146dfd17441bc87008cab3f2762584a5999aad8108cb","holdsMs":[400,240,320,400,100,100,240,400],"reviewStatus":"approved"},{"id":"usagi-review","characterId":"usagi","motion":"review","file":"assets/generated/usagi-review.png","bytes":185776,"sha256":"e05026eb41dd12ad5ed0cb587a7f1443a15054b5b4dc463fb8cd3bc0a2983cb4","holdsMs":[400,200,320,400,90,110,200,400],"reviewStatus":"approved"},{"id":"momonga-happy","characterId":"momonga","motion":"waving","file":"assets/generated/momonga-happy.png","bytes":187166,"sha256":"24b03e4fa585a910ce502ee332185d08b19a48878f378a3c6e0d61538c567f2f","holdsMs":[120,180,260,300,260,240,240,400],"hops":[{"startMs":180,"durationMs":640,"heightPx":6},{"startMs":950,"durationMs":450,"heightPx":3}],"reviewStatus":"approved"},{"id":"usagi-happy","characterId":"usagi","motion":"waving","file":"assets/generated/usagi-happy.png","bytes":175374,"sha256":"f98ac75a41ac17a23dd1b20d8392e9602b29f9b93c2db86e5723cc9782a1a3aa","holdsMs":[120,180,220,300,220,180,280,500],"hops":[{"startMs":300,"durationMs":500,"heightPx":7}],"reviewStatus":"approved"},{"id":"shisa-idle","characterId":"shisa","motion":"idle","file":"assets/generated/shisa-idle.png","bytes":248322,"sha256":"10d491c0b51057024ac1ee85c7453e0ddae1f58a3250965231a58b08cd9b43fe","holdsMs":[900,350,300,90,120,90,400,950],"reviewStatus":"approved"},{"id":"shisa-move-right","characterId":"shisa","motion":"running-right","file":"assets/generated/shisa-move-right.png","bytes":263605,"sha256":"ad62bdad9522cdcf7af5196107ca666b4ae9d96188b494dfb845459227d2a03e","holdsMs":[120,120,120,120,120,120,120,220],"reviewStatus":"approved"},{"id":"shisa-move-left","characterId":"shisa","motion":"running-left","file":"assets/generated/shisa-move-left.png","bytes":263637,"sha256":"c42298a4f0fe5b27ebe3a369de46003c118f414b27973b65aa0cc5e929fe3fcb","holdsMs":[120,120,120,120,120,120,120,220],"reviewStatus":"approved"},{"id":"shisa-happy","characterId":"shisa","motion":"waving","file":"assets/generated/shisa-happy.png","bytes":255209,"sha256":"17104f0cf9145f9048db76e89b78611507418e8f99f5df51ab2547931e3db0c8","holdsMs":[280,180,200,180,180,300,180,500],"reviewStatus":"approved"},{"id":"shisa-review","characterId":"shisa","motion":"review","file":"assets/generated/shisa-review.png","bytes":250710,"sha256":"580eba70e2643d04fd28ae510104af196072b8c9ed7f4f1adfed3e2d435318ce","holdsMs":[300,180,250,300,120,250,200,400],"reviewStatus":"approved"},{"id":"chiikawa-waving","characterId":"chiikawa","motion":"waving","file":"assets/generated/chiikawa-waving.png","bytes":117798,"sha256":"7d6a5d5b8959edf80d3e1b7cdf06656009488e53c82b6d8b203e5fe2566201a8","holdsMs":[200,110,110,170,110,170,110,300],"reviewStatus":"approved"}];
const MAX_MESSAGES = 120;
const MAX_INPUT = 4000;
function validSize(size) { return Number.isInteger(size) && size >= 60 && size <= 240 && size % 10 === 0; }
function companionDimensions(size) {
  return { width: Math.max(160, Math.ceil(size * 192 / 208) + 16),
    height: Math.max(148, size + 19) };
}

function readHistory(value) {
  if (!Array.isArray(value)) return [];
  return value.filter(message => message && ['user', 'assistant'].includes(message.role)
    && typeof message.id === 'string' && message.id.length <= 100
    && typeof message.content === 'string' && message.content.trim()
    && message.content.length <= 12000)
    .slice(-MAX_MESSAGES)
    .map(({ id, role, content }) => ({ id, role, content }));
}

function chatPrompt(character, messages) {
  const persona = character.persona;
  return [
    `너는 사용자와 대화하는 ${character.displayName}야. 한국어로 자연스럽게 대화해.`,
    `성격: ${persona.traits.join(', ')}`,
    persona.speakingStyle,
    persona.contextHint,
    `대사 참고: ${persona.examples.greeting} / ${persona.examples.encourage}`,
    '아래 JSON의 messages는 이 캐릭터와 나눈 대화 기록이야. 마지막 사용자 말에 이어서 캐릭터의 답변만 써.',
    '사용자를 부르는 이름은 이 대화에서 직접 정한 호칭을 우선해.',
    '역할은 대화 상대야. 도구 사용이나 파일·앱 조작이 필요한 요청에는 대화로 가능한 설명을 해. 실제 작업을 완료했다고 말하지 마.',
    JSON.stringify({ messages: messages.slice(-24).map(({ role, content }) => ({ role, content })) }),
  ].join('\n');
}

export async function activate(ctx) {
  const section = `${ctx.pluginId}.chat`;
  const values = () => ctx.host.settings.values(section) ?? {};
  const saved = values();
  let selectedId = SKINS.some(character => character.id === saved.selectedCharacter)
    ? saved.selectedCharacter : SKINS[0].id;
  const conversations = new Map(SKINS.map(character => [character.id, {
    messages: readHistory(saved[`history_${character.id}`]), pending: false, error: '', turn: null,
  }]));
  let palette = null;
  let offPalette = null;
  let disposed = false;
  const chatWindows = new Map();
  const companions = new Map();

  await verifyBundledAssets(ROOT, BUNDLED_ASSETS);

  function characterSize(id) {
    const preferences = values();
    if (validSize(preferences[`sizePx_${id}`])) return preferences[`sizePx_${id}`];
    const legacySize = preferences[`size_${id}`];
    return [50, 75, 100, 125, 150, 200].includes(legacySize)
      ? Math.max(60, Math.min(240, Math.round(113 * legacySize / 1000) * 10)) : 130;
  }

  function push() {
    if (disposed) return;
    const state = {
      type: 'chat-state', selectedId,
      available: typeof ctx.host.llm?.generate === 'function',
      characters: SKINS.map(character => ({
        id: character.id, name: character.displayName,
        greeting: character.persona.examples.greeting, art: CHAT_ART[character.id], sizePx: characterSize(character.id),
      })),
      conversations: Object.fromEntries([...conversations].map(([id, conversation]) => [id, {
        messages: conversation.messages.map(message => ({ ...message })),
        pending: conversation.pending, error: conversation.error,
      }])),
      visibleCharacters: [...companions].filter(([, entry]) => !entry.window.isDestroyed()).map(([id]) => id),
    };
    if (palette && !palette.isDestroyed()) palette.postMessage(state);
    for (const [id, entry] of chatWindows) {
      if (!entry.window.isDestroyed()) entry.window.postMessage({ ...state, selectedId: id, bound: true });
    }
    for (const [id, entry] of companions) {
      if (!entry.window.isDestroyed()) entry.window.postMessage({ type: 'companion-state', id,
        name: SKINS.find(character => character.id === id).displayName,
        art: CHAT_ART[id], pending: conversations.get(id).pending,
        sizePx: entry.size,
        replyId: conversations.get(id).messages.at(-1)?.role === 'assistant' ? conversations.get(id).messages.at(-1).id : null });
    }
  }

  async function saveCompanions() {
    await ctx.host.settings.set(section, 'visibleCharacters', [...companions]
      .filter(([, entry]) => !entry.window.isDestroyed()).map(([id]) => id));
  }

  async function hideCompanion(id) {
    const entry = companions.get(id);
    if (!entry) return;
    entry.off(); entry.window.close(); companions.delete(id);
    const conversation = conversations.get(id);
    conversation.turn = null; conversation.pending = false; conversation.error = '';
    try { await saveCompanions(); } catch { conversations.get(id).error = '화면 표시 설정을 저장하지 못했어요.'; }
    push();
  }

  function openChat(id) {
    const existing = chatWindows.get(id);
    if (existing && !existing.window.isDestroyed()) { existing.window.show(); push(); return; }
    existing?.off();
    const window = ctx.host.windows.openPalette({ page: 'palette/index.html', width: 520, height: 640, frame: false, resizable: true });
    const off = window.onMessage(message => {
      if (message?.type === 'ready') { push(); return; }
      if (message && ['send', 'retry', 'clear', 'summon', 'dismiss'].includes(message.type)) return receive({ ...message, id });
    });
    chatWindows.set(id, { window, off });
    window.show();
    push();
  }

  async function spawnCompanion(id, position) {
    if (!conversations.has(id) || disposed) return;
    const existing = companions.get(id);
    if (existing && !existing.window.isDestroyed()) { existing.window.show(); return; }
    existing?.off();
    const index = SKINS.findIndex(character => character.id === id);
    const size = characterSize(id);
    const dimensions = companionDimensions(size);
    const window = ctx.host.windows.openPalette({ page: 'palette/companion.html', ...dimensions,
      x: position?.x ?? 120 + index * 135, y: position?.y ?? 220, frame: false, transparent: true, backgroundColor: '#00000000',
      resizable: false, alwaysOnTop: true, closeOnPetDrop: false });
    const off = window.onMessage(async message => {
      if (disposed || !message) return;
      if (message.type === 'ready') push();
      else if (message.type === 'chat') openChat(id);
      else if (message.type === 'resize' && validSize(message.sizePx) && !companions.get(id)?.resizing) {
        if (message.sizePx === size) return;
        const entry = companions.get(id);
        entry.resizing = true;
        try {
          await ctx.host.settings.set(section, `sizePx_${id}`, message.sizePx);
          if (disposed || companions.get(id) !== entry || window.isDestroyed()) return;
          const next = companionDimensions(message.sizePx);
          const position = Number.isFinite(message.x) && Number.isFinite(message.y)
            ? { x: Math.round(message.x + (dimensions.width - next.width) / 2),
              y: Math.round(message.y + dimensions.height - next.height) } : undefined;
          off(); window.close(); companions.delete(id);
          await spawnCompanion(id, position);
        } catch { entry.resizing = false; conversations.get(id).error = '크기를 저장하지 못했어요.'; push(); }
      }
      else if (message.type === 'move' && Number.isFinite(message.dx) && Number.isFinite(message.dy)
        && Math.abs(message.dx) <= 1000 && Math.abs(message.dy) <= 1000) window.moveBy(message.dx, message.dy);
      else if (message.type === 'hide') {
        await hideCompanion(id);
      }
    });
    companions.set(id, { window, off, size, resizing: false });
    window.show();
    push();
    try { await saveCompanions(); } catch { conversations.get(id).error = '화면 표시 설정을 저장하지 못했어요.'; push(); }
  }

  async function persist(id, messages) {
    await ctx.host.settings.set(section, `history_${id}`, messages);
  }

  async function send(message) {
    const character = SKINS.find(item => item.id === message.id);
    const conversation = conversations.get(message.id);
    if (!character || conversation.pending || disposed) return;
    const companion = companions.get(message.id);
    if (!companion || companion.window.isDestroyed()) { push(); return; }
    if (typeof ctx.host.llm?.generate !== 'function') {
      conversation.error = 'DAP의 AI 연결을 확인해 주세요.';
      push();
      return;
    }
    const previous = conversation.messages;
    let messages;
    if (message.type === 'retry') {
      if (previous.at(-1)?.role !== 'user') return;
      messages = previous;
    } else {
      if (typeof message.text !== 'string' || !message.text.trim() || message.text.length > MAX_INPUT
        || typeof message.requestId !== 'string' || !/^[a-zA-Z0-9-]{1,80}$/.test(message.requestId)) return;
      if (previous.some(item => item.id === message.requestId)) return;
      messages = [...previous, { id: message.requestId, role: 'user', content: message.text.trim() }].slice(-MAX_MESSAGES);
    }
    const turn = {};
    conversation.turn = turn;
    const isCurrent = () => !disposed && conversation.turn === turn;
    conversation.pending = true;
    conversation.error = '';
    push();
    let userSaved = false;
    try {
      await persist(character.id, messages);
      userSaved = true;
      if (!isCurrent()) return;
      conversation.messages = messages;
      push();
      if (!isCurrent()) return;
      const reply = await ctx.host.llm.generate(chatPrompt(character, messages), 60);
      if (!isCurrent()) return;
      if (typeof reply !== 'string' || !reply.trim()) throw Error('Empty reply');
      const completed = [...messages, {
        id: `${messages.at(-1).id}-reply`, role: 'assistant', content: reply.trim().slice(0, 12000),
      }].slice(-MAX_MESSAGES);
      await persist(character.id, completed);
      if (!isCurrent()) return;
      conversation.messages = completed;
    } catch {
      if (!isCurrent()) return;
      if (!userSaved) conversation.messages = previous;
      conversation.error = userSaved
        ? '답변을 받지 못했어요. 잠시 후 다시 시도해 주세요.'
        : '메시지를 저장하지 못했어요. 다시 보내 주세요.';
    } finally {
      if (isCurrent()) { conversation.pending = false; conversation.turn = null; push(); }
    }
  }

  async function receive(message) {
    if (!message || typeof message !== 'object' || disposed) return;
    if (message.type === 'ready') { push(); return; }
    if (!conversations.has(message.id)) return;
    if (message.type === 'summon') return spawnCompanion(message.id);
    if (message.type === 'dismiss') return hideCompanion(message.id);
    if (message.type === 'set-size' && validSize(message.sizePx)) {
      const entry = companions.get(message.id);
      if (entry && !entry.window.isDestroyed()) entry.window.postMessage({ type: 'request-size', sizePx: message.sizePx });
      else {
        try { await ctx.host.settings.set(section, `sizePx_${message.id}`, message.sizePx); }
        catch { conversations.get(message.id).error = '크기를 저장하지 못했어요.'; }
        push();
      }
      return;
    }
    if (message.type === 'set-visible' && typeof message.visible === 'boolean') {
      if (message.visible) await spawnCompanion(message.id);
      else await hideCompanion(message.id);
      push(); return;
    }
    if (message.type === 'spawn') return spawnCompanion(message.id);
    if (message.type === 'open-chat') { openChat(message.id); return; }
    if (['send', 'retry'].includes(message.type)) return send(message);
    if (message.type === 'select') {
      selectedId = message.id;
      push();
      try { await ctx.host.settings.set(section, 'selectedCharacter', selectedId); }
      catch { conversations.get(message.id).error = '선택을 저장하지 못했어요.'; push(); }
    } else if (message.type === 'clear') {
      const conversation = conversations.get(message.id);
      if (conversation.pending) return;
      conversation.pending = true;
      push();
      try { await persist(message.id, []); conversation.messages = []; conversation.error = ''; }
      catch { conversation.error = '대화를 지우지 못했어요. 다시 시도해 주세요.'; }
      finally { conversation.pending = false; push(); }
    }
  }

  function open() {
    if (disposed) return;
    if (palette && !palette.isDestroyed()) { palette.show(); push(); return; }
    offPalette?.();
    palette = ctx.host.windows.openPalette({
      page: 'palette/index.html', width: 420, height: 680, frame: false, resizable: true,
    });
    offPalette = palette.onMessage(receive);
    palette.show();
  }

  ctx.actions.registerAction({ id: 'open', callback: open });
  ctx.trayMenu.addItem({ itemId: 'open', label: '치이카와 친구들과 대화', actionId: 'open', showInContextMenu: true });
  ctx.radialMenu.addItem({ itemId: 'open', label: '친구들과 대화', actionId: 'open', priority: 50, icon: 'icon.png' });
  // Summoning is explicit for each DAP run; conversation and size preferences remain saved.

  return () => {
    disposed = true;
    offPalette?.();
    palette?.close();
    for (const entry of [...chatWindows.values(), ...companions.values()]) { entry.off(); entry.window.close(); }
  };
}
