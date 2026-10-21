import {readFile,writeFile} from 'node:fs/promises';
import {planMotions,PRODUCTION_MOTIONS} from '../src/motions.mjs';
const root=new URL('../',import.meta.url);
const read=async name=>JSON.parse(await readFile(new URL(name,root),'utf8'));
const catalog=await read('assets/catalog.json'),pack=await read('assets/motions.json'),source=await read('assets/originals.json');
const coverage=Object.fromEntries(catalog.map(s=>[s.id,planMotions(s,pack).coverage]));
const verifier=await readFile(new URL('src/assets.mjs',root),'utf8');
const upstream=await readFile(new URL('src/upstream.mjs',root),'utf8');
const motions=await readFile(new URL('src/motions.mjs',root),'utf8');
const template=await readFile(new URL('src/plugin.template.mjs',root),'utf8');
await writeFile(new URL('dap_chiikawa/plugin.mjs',root),verifier+'\n'+upstream+'\n'+motions+'\n'+template
 .replace('__SKINS_JSON__',JSON.stringify(catalog)).replace('__SOURCE_JSON__',JSON.stringify(source))
 .replace('__MOTIONS_JSON__',JSON.stringify(pack)).replace('__ASSETS_JSON__',JSON.stringify(pack)).replace('__COVERAGE_JSON__',JSON.stringify(coverage)));
await writeFile(new URL('assets/catalog.js',root),'window.CHIIKAWA_SKINS = '+JSON.stringify(catalog)+';\nwindow.CHIIKAWA_COVERAGE = '+JSON.stringify(coverage)+';\n');
await writeFile(new URL('assets/coverage.json',root),JSON.stringify(coverage,null,2)+'\n');
const labels={idle:'대기','running-right':'오른쪽 이동','running-left':'왼쪽 이동',waving:'쓰다듬기·기쁨 반응',failed:'실패·오류',running:'일하기',review:'생각 중',sleep:'수면',feed_munch:'먹기',groom:'그루밍',grabbed:'잡힘',success:'작업 성공',dance:'춤',working_v2:'일하기 변형 (선택)'};
const triggers={idle:'일반 대기', 'running-right':'배회·호출 이동', 'running-left':'배회·호출 이동',waving:'클릭 시 약 2초 기쁨 반응 (선택 보강)',failed:'작업 오류 (error)',running:'작업 중 (working)',review:'채팅 응답 대기 (thinking → headtilt; 춤·수면 중 제외)',sleep:'자율 수면·수면 메뉴',feed_munch:'먹이 주기',groom:'자율 그루밍',grabbed:'마우스 드래그',success:'작업 성공 (success)',dance:'음악 감지·춤',working_v2:'작업 시작 선택기; 없으면 일하기 공유'};
const lines=['# DAP에 연결된 모션 제작 현황','','DAP 1.6.11의 상태 선택과 렌더러 연결을 기준으로 제작합니다. 한 모션씩 미리보기 확인 후 교체하며, 미제작 동작은 기존 패키지를 유지합니다.','','자체 = 승인된 새 모션, 원본 유지 = 기존 패키지의 연결 모션, 일하기 공유 = 추가 버전 없이 기본 일하기 재생.','','| 연결 동작 | 실제 호출 | '+catalog.map(s=>s.displayName).join(' | ')+' |','|---|---|'+catalog.map(()=>'---').join('|')+'|'];
for(const key of PRODUCTION_MOTIONS)lines.push('| '+labels[key]+' | '+triggers[key]+' | '+catalog.map(s=>({ready:'자체',upstream:'원본 유지',shared:'일하기 공유'})[coverage[s.id][key].status]).join(' | ')+' |');
lines.push('','`jumping`·`waiting`은 구형 스킨 검증/폴백용 호환 슬롯으로만 유지합니다. 현재 독립 행동의 제작 목록과 선택창에서는 제외합니다. 인사 전용 동작은 없으며 `waving`은 쓰다듬기 기쁨 반응입니다.','',
'기준 소스: DAP `app/packages/core/src/pet/pet-controller.ts`, `pet-states.ts`, `index.ts`, `app/electron/renderer/src/pet-skin-animation.ts`. 등록 가능한 키와 실제 호출되는 행동을 구분합니다.','',
'우사기는 클릭 기쁨·자율·이동·일하기·먹기·수면·드래그·춤·채팅 생각 중의 모든 필수 동작을 자체 이미지로 교체했습니다. 오류는 대기, 성공 호환 슬롯은 클릭 기쁨을 공유합니다. 실패·성공·독립 점프·기다림과 두 번째 일하기는 필수 제작에서 제외합니다.','',
'성공은 SuccessState 정의와 스킨 키만 있고 일반 작업 완료/에이전트 종료에서는 진입하지 않습니다. 오류는 외부 pet.context의 activity=error를 직접 받을 때만 진입하며, 일반 AI_REQUEST_ERROR는 말풍선을 표시하고 생각 중 상태를 대기로 돌립니다. 기존 호환 키·원본은 유지하고 신규 제작은 보류합니다. 우사기 성공 초안도 보관만 합니다. 그루밍은 한쪽으로 “하아?” 하는 갸웃하기만 유지합니다.','',
'외부 소스는 heelee912/chiikawa-dots-pets의 고정 커밋과 SHA-256으로 검증합니다. 미교체 동작이 있는 하치와레만 내려받으며, 승인된 자체 모션만 교체합니다. 치이카와·모몽가·우사기는 최초 설치부터 외부 원본 없이 시트를 조합하고 바로 적용·재시작 복원할 수 있습니다. 하치와레 최종 전환 시 고정 소스 메타데이터와 다운로드 코드를 제거합니다.','');
lines.push('v2.1.0 채팅 응답 대기(review): 모몽가 턱 짚고 갸웃하기 8프레임·2.2초와 우사기 팔짱 끼고 하아? 8프레임·2.12초를 승인본으로 적용했습니다. 채팅 전송 후 AI 응답을 기다리는 동안 thinking/headtilt 경로에서 재생합니다. 그루밍·일하기 슬롯은 그대로 유지합니다.','');
lines.push('모몽가 클릭 기쁨(waving): 2026-10-19 승인된 8프레임·2초 모션을 적용했습니다. 두 앞발을 들고 눈웃음을 지으며 작게 폴짝인 뒤 기존 대기 프레임으로 돌아옵니다. 모몽가의 모든 필수 동작을 자체 이미지로 구성하며, 오류는 대기 이미지를 재사용하고 성공 호환 슬롯은 기쁨 반응을 공유합니다. 모몽가 원본 다운로드는 생략합니다.','');
lines.push('우사기 클릭 기쁨(waving): 2026-10-19 승인된 8프레임·2초 모션을 적용했습니다. 모은 앞발을 들고 눈웃음으로 작게 폴짝한 뒤 기존 대기 프레임으로 돌아옵니다. 시작·끝 프레임은 승인된 대기와 픽셀까지 같으며, 모몽가·우사기의 모든 연결 슬롯은 자체 이미지만 사용합니다.','');
lines.push('치이카와 대기(idle): 2026-10-20 승인된 8프레임 모션을 적용했습니다. 승인된 기존 얼굴·몸 픽셀을 유지하고, 양팔을 내린 자세에서 1~2픽셀 호흡과 짧은 눈 깜빡임을 재생합니다.','');
lines.push('치이카와 좌우 이동(running-right·running-left): 승인된 8프레임 자체 자산을 플러그인에 포함합니다. 설치 시 외부 원본을 내려받지 않으며 양 방향 모두 같은 1.06초 보행 타이밍을 사용합니다.','');
lines.push('하치와레 좌우 이동(running-right·running-left): 짧고 둥근 발과 몸통의 무게 이동으로 구성한 8프레임 자체 보행을 적용했습니다. 왼쪽 이동은 오른쪽 승인본을 프레임별로 정확히 반전하며 양 방향 모두 0.96초 타이밍을 사용합니다.','');
lines.push('하치와레 쓰다듬기·기쁨 반응(waving): 대기 자세에서 짧은 앞발을 들고 눈웃음하며 두 번 흔든 뒤 돌아오는 8프레임·1.46초 자체 모션을 적용했습니다.','');
lines.push('하치와레 일하기(running): 새싹을 잡고 힘을 준 뒤 뿌리가 빠지고 반동하는 5프레임·0.86초 자체 모션을 적용했습니다.','');
lines.push('하치와레 수면(sleep): 이불과 베개는 고정하고 얼굴 주변의 작은 호흡만 움직이는 6프레임·2.3초 자체 모션을 적용했습니다.','');
lines.push('하치와레 먹기(feed_munch): 주먹밥을 든 네 완결 전신 자세를 여덟 프레임으로 연결한 1.16초 자체 모션을 적용했습니다.','');
lines.push('하치와레 그루밍(groom): 한쪽 앞발이 볼에서 관자와 귀 쪽으로 올라갔다 돌아오는 네 완결 전신 자세·0.95초 자체 모션을 적용했습니다.','');
lines.push('하치와레 일하기 변형(working_v2): 책상에서 초록 연필로 공부하는 3프레임·0.62초 자체 모션을 적용했습니다.','');
lines.push('치이카와 쓰다듬기·기쁨 반응(waving): 고정 원본의 보이는 픽셀을 유지한 8프레임 팔 흔들기와 1.28초 타이밍을 적용했습니다.','');
lines.push('치이카와 일하기(running): 승인된 5프레임 새싹 뽑기 모션을 적용했습니다. 몸을 낮춰 힘을 준 뒤 뿌리가 빠지고 반동하는 0.86초 루프입니다.','');
lines.push('치이카와 생각 중(review): 생각 구름 없이 고정 원본의 6프레임 고개 기울이기와 1.03초 타이밍을 적용했습니다.','');
lines.push('치이카와 일하기 변형(working_v2): 책상에서 초록 연필로 공부하는 승인 3프레임·0.62초 모션을 선택형 작업 동작으로 적용했습니다.','');
await writeFile(new URL('MOTIONS.md',root),lines.join('\n'));
console.log(`Built ${catalog.length} characters; ${pack.length} approved strips; upstream fallback retained until replacement completes`);
