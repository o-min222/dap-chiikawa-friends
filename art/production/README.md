# DAP Assistant 에셋

코랄 단발, 커서 머리핀, 남색 재킷과 청록 폴더 가방을 가진 DAP 조수의 제작 원본과 투명 애니메이션 팩이다. 작업별 생성 기록은 `higgsfield-jobs.json`, 행동 지시는 `motion-briefs.json`, 연속 테이크 구성은 `motion-takes.json`에 보관한다.

전체 37개 클립, 원본 24fps 프레임 6,801개를 포함한다. 기본 행동 16종, 추가 상호작용 11종, 시선 8방향과 대기 변형 2개로 구성한다.

저장소에는 실행에 필요한 아틀라스 PNG와 클립 JSON을 포함한다. `python scripts/build-assistant-plugin.py`로 플러그인 폴더와 ZIP을 만들 수 있다. 512px 프레임 ZIP, 원본 테이크, 영상·WebP 검수본과 통합 ZIP은 로컬 제작 출력물이며, 아래 제작·미리보기 명령은 해당 출력물이 있는 환경에서 사용한다.

## 미리보기

현재 로컬 검수 주소는 [모션 검수 화면](http://127.0.0.1:8765/preview.html)이다. 준비·반복·복귀를 이어 보는 연결 재생, 전체 원본 프레임, 구간별 재생, 밝고 어두운 배경, 일시정지와 프레임 탐색을 지원한다. 조용한 감상·설명하기·드래그·시선의 일부 구간은 왕복·역방향 재생으로 이어진다.

서버를 다시 실행할 때는 저장소 루트에서 실행한다.

```powershell
python -m http.server 8765 --bind 127.0.0.1 --directory art/production
```

## 클립 파일

- `frames-512.zip`은 512×512 투명 RGBA PNG 시퀀스다. 최종 팩은 `<motion>/<motion>_00000.png`부터 시작하는 본체용 이름을 사용한다. 채택한 동작 구간의 모든 원본 프레임을 보존한다.
- `atlas-*.png`은 2048×2048 PNG다. 256×256 셀을 페이지당 최대 64개 배치하며, 페이지와 프레임 위치는 메타데이터에서 읽는다.
- `clip.json`은 실제 FPS, 전체 프레임 수, 프레임별 표시 시간, 발 기준점과 재생 구간을 담는다.
- `preview.webp`은 전체 보존 구간의 반복 미리보기다. `loop-preview.webp`은 별도로 검수한 반복 구간의 미리보기다.
- `action-preview.webp`이 있는 클립은 준비·반복·복귀를 연결한 미리보기를 제공한다.
- `contact-sheet.jpg`은 전체 구간의 12개 시점을 모은 검수 이미지다.

영상은 현재 960×960, 24fps로 생성됐다. 프레임별 표시 시간은 밀리초 단위 반올림 경계를 사용해 41ms와 42ms로 배분한다. 512px PNG의 발 기준점은 `(256, 448)`, 256px 아틀라스의 기준점은 `(128, 224)`다. 각 클립의 중립 기준 프레임에서 정한 스케일과 위치를 전체 프레임에 동일하게 적용해 실제 체중 이동을 보존한다. 시선 클립은 `--reference-frame 0`으로 테이크 첫 프레임의 배치 기준을 공유한다. `sourceAlignmentFrame`은 이 기준 프레임의 원본 인덱스다.

`--layout-reference`는 투명 RGBA 기준 그림의 좌표와 크기를 공유한다. 기준 이미지와 영상은 같은 캔버스 비율을 사용하고, `sourceAlignmentImage`에 기준 PNG 이름을 기록한다.

노트북 테이크의 시작·종료 이미지는 실제 `idle-quiet` 0번 프레임이다. `--source-transform keyframes/laptop-v4-source-transform.json`은 그 서 있는 자세에서 정한 한 번의 고정 배율과 기준점을 네 클립의 모든 프레임에 적용한다. `sourceAlignmentFile`에 사용한 파일 이름을 기록한다.

`--color-transform keyframes/laptop-v4-color-transform.json`은 실제 대기 프레임과 생성 영상의 시작 자세를 비교해 구한 고정 RGB 행렬과 오프셋이다. 동일한 색 변환을 네 클립의 전체 픽셀과 전체 프레임에 적용하며 알파를 보존한다. `colorCalibrationFile`에 보정 파일을 기록한다. 색 보정은 PNG·아틀라스·미리보기에 반영되어 있고 런타임은 완성된 RGBA 값을 그대로 표시한다. 팔레트 비교와 보정 기준의 수치는 `keyframes/laptop-v4-palette-review.json`에 보관한다.

## 재생 메타데이터

`format`은 `dap-assistant-frame-sequence`다. 프레임 인덱스는 0부터 시작한다. `startFrame`은 포함하고 `endFrameExclusive`는 다음 구간의 첫 프레임이다. `sourceStartFrame`과 `sourceEndFrameExclusive`는 원본 테이크 안에서 추출한 범위를 기록한다.

- `frames`의 `page`, `x`, `y`로 아틀라스 셀을 선택하고 `durationMs`만큼 표시한다.
- `phases.entry`는 준비 구간을 한 번 재생한다.
- `phases.loop`는 작업이나 대화 상태가 이어지는 동안 반복한다.
- `phases.exit`는 복귀 구간을 한 번 재생한다.
- 구간의 `playback`은 준비·복귀에 `once`, 반복에 `loop`를 기록한다. 검수 화면도 반복 구간을 계속 재생한다.
- `direction`이 `alternate`인 반복 구간은 정방향과 역방향을 이어서 재생한다. 끝 프레임과 시작 프레임을 중복하지 않는 순서인 `[start … end-1, end-2 … start+1]`을 사용한다.
- `reverse`는 역방향으로 한 번 재생한다. `alternate-reverse`는 역방향부터 시작해 왕복한다. 설명하기는 손을 내리는 실제 구간을 역방향으로 준비 동작에 사용해 중립 자세에서 부드럽게 시작한다.
- `playRange`는 단발 동작에서 사용할 범위다. 전체 원본 구간은 `frames`에 보존한다.
- `playRange.direction`도 준비·반복·복귀와 같은 방향 규칙을 따른다. 이번 노트북 4종은 모두 정방향 원본 구간을 사용한다.

`entryPose`와 `exitPose`가 있으면 구간의 시작·종료 자세를 나타낸다. `cancel`은 메모를 들고 있던 작업을 멈추고 가방에 넣는 단발 반응이다. 시작 자세는 `memo-held`, 종료 자세는 `standing-neutral`이며, 연결 재생도 이 자세 흐름을 보여준다.

`resume`는 실제 중립 자세에서 준비를 시작하도록 앞 구간과 원본 20프레임을 겹쳐 추출했다. 클립 프레임 수를 합산하면 이 공유 구간도 각 클립에 포함된다. `error`는 양손을 내린 135번 프레임에서 재생을 마치며, 뒤의 원본 프레임도 ZIP과 전체 원본 미리보기에 보존한다.

노트북 작업은 공통 테이크 721프레임을 보존한다. 기본 연결 재생은 서기에서 앉고 노트북을 꺼내 여는 준비 0~152번, 타이핑 반복 153~322번, 정리하고 일어서는 복귀 552~720번을 사용한다. 호출·휴식 반응은 각각 별도 클립으로도 제공한다. 전체 원본 모드는 공통 테이크의 모든 행동을 순서대로 보여준다.

| 노트북 클립 | 원본 범위 | 보존 프레임 |
|---|---|---:|
| laptop-working | 0~720 | 721 |
| work-interrupt | 336~431 | 96 |
| work-stretch | 432~551 | 120 |
| work-finish | 552~720 | 169 |

네 클립은 같은 테이크의 프레임을 공유한다. 팩의 프레임 합계에는 각 클립에 보존된 공유 프레임도 포함된다. `keyframes/laptop-proportion-review-light.jpg`는 기존 대기, 수정본 시작 자세와 실제 작업 PNG를 같은 512px 캔버스에 놓은 비교다. `keyframes/laptop-entry-review.jpg`는 서기에서 작업까지의 전환을 보여준다.

좌우 걷기의 준비에는 시선 이동, 체중 이동, 첫 발 들기와 착지, 골반·어깨가 따라 도는 중간 자세를 포함했다. 반복과 복귀는 발구름 자세가 맞는 원본 시점으로 연결한다. 복귀는 보폭을 정리하며 정면으로 돌아와 양발을 모으는 동작이다. 반가움은 발을 붙인 상태에서 작은 상체 기울임과 느슨한 손 모으기, 미소와 고개 끄덕임으로 표현했다.

검수 페이지의 연결 재생은 준비, 반복 두 회와 복귀를 이어서 보여준다. 단발 동작도 검수를 위해 지정 범위를 반복 표시하며, 전체 원본은 보존된 전체 프레임을 반복해 보여준다. 실제 상태 재생에서는 단발 동작의 `playRange`와 준비·반복·복귀 구간을 따른다. 왕복 재생은 조용한 감상의 느린 고개·호흡, 말할 때의 미세한 손·호흡, 승인 대기의 메모 든 호흡, 잡힌 동안의 다리 움직임과 목표를 바라보는 시선에 적용했다.

## 360도 시선

화면 둘레의 상하좌우와 대각선 8방향에 대응하는 `gaze-e`, `gaze-se`, `gaze-s`, `gaze-sw`, `gaze-w`, `gaze-nw`, `gaze-n`, `gaze-ne`를 제공한다. 방향별로 72~73개, 총 577개의 원본 24fps 프레임을 보존한다. 각 클립은 정면에서 시선을 옮기는 준비, 목표를 바라보는 응시, 정면으로 돌아오는 복귀로 구성한다. 몸통과 발은 정면 자세를 유지한다. 일부 준비·복귀는 중립으로 돌아오는 실제 프레임을 역방향으로 사용하며, 응시는 왕복 재생한다. 연결 재생의 모든 인접 프레임 인덱스가 1씩 이동하는 것을 확인했다.

`asset-pack.json`의 `gaze`는 화면 좌표 기준을 기록한다. 오른쪽이 0도이고 시계 방향으로 45도씩 증가한다. 마우스 위치와 얼굴 중심의 차이로 각도를 구해 가까운 방향을 선택한다. 방향 선택은 8개 구간이며, 각 구간 안의 시간 애니메이션은 생성된 원본 프레임을 사용한다.

목표가 유지되면 응시 구간을 반복하고, 시선 추적이 끝나면 복귀를 재생한다. 방향이 바뀔 때는 현재 동작의 복귀와 다음 방향의 준비를 연결한다. 본체 렌더러가 33도 히스테리시스로 경계 부근의 잦은 전환을 줄인다. 대기 중 커서에 반응하며 수면·드래그·작업은 해당 동작을 우선한다.

## DAP 연결

`C:/Users/dudal/project/dap-merge-check2` 개발 본체에 `schemaVersion: 2` 다중 페이지 아틀라스 로더와 진입·반복·복귀 재생을 구현했다. 실제 에이전트 활동은 노트북 작업으로, 답변 말풍선은 말하기로, 음성과 선택 요청은 듣기·승인 대기로 연결한다. 메인 프로세스가 걷기 준비와 방향 전환 동안 위치를 보류한다. 렌더러는 원본 프레임 시간표와 발 기준점을 사용하며 캔버스의 가로 압축을 방지한다.

`python scripts/build-assistant-plugin.py`가 `outputs/dap-assistant-plugin`과 ZIP을 만든다. 이 패키지는 256px 아틀라스, 시간표와 포스터를 포함한다. `assistant/plugin.yaml`은 기존 manifest v2와 `pet.skin` 권한을 사용한다. 실행 시 `supportedSkinVersions`에 2가 있는지 확인한다. 로컬 설치 경로는 `%APPDATA%/dap/plugins/local.dap.assistant`이며, 최초 활성화 시 DAP Assistant를 적용하고 이후 선택을 저장한다. 대용량 패키지는 로컬 플러그인 폴더에 배치한다.

실제 Electron의 `pet.html`, 샌드박스 프리로드와 `dap-plugin` 프로토콜로 37클립·6,801프레임을 검증했다. 노트북 진입·반복·복귀, 앉은 상태 중단·재개, 음악 감상과 춤 전환, 8방향 커서 반응, 드래그 중단, 걷기 준비·방향 전환의 위치 보류와 Workspace/Crew 오프스크린 재생을 확인했다. 기존 캐릭터 미리보기를 종료하고 개발 본체를 실행해 `local.dap.assistant.assistant`의 실제 활성화를 확인했다. 실제 Codex 활동 신호에 따라 노트북 반복 구간이 재생되며 캔버스 프레임도 갱신된다.

기본 모션과 조수 상호작용의 이벤트 설계는 [제작 계획](../dap-assistant-motion-plan.md)에 정리했다. `headtilt`와 `review`는 선택된 생각하기 에셋에 연결한다. 본체의 `working_v2`는 `laptop-working`을, 메모 검토는 `working-v2`를 사용한다.

음악 재생 동작 이름 `music-playing`은 조용한 감상용 `music-listening` 에셋에 연결한다. `musicPlayback.variants`는 조용한 감상과 신나는 `dance`를 함께 제공한다. DAP의 `onAudio(true/false)`와 오디오 감지의 dance 상태에 음악 반응 에셋을 연결한다. 준비는 한 번, 재생 중에는 반복, 일시정지·종료에서는 복귀 구간을 사용한다. 현재 오디오 감지는 시스템 출력 소리를 대상으로 하며, 호스트의 상태 복귀 흐름을 따른다.

일하는 모습은 `working`의 메모 읽기, `working-v2`의 손끝으로 짚어 검토하기, `success`의 결과 전달로 구성한다. `self-play`는 혼자 한 발로 균형을 잡아보고 살짝 휘청한 뒤 웃으며 정면으로 돌아오는 동작이다. `idleActivities`에 등록해 대기 중의 낮은 우선순위 행동으로 연결한다.

`laptop-working`은 기본 서기에서 무릎을 굽혀 균형을 잡고 다리를 편안하게 접어 앉는다. 가방에서 작은 아이보리색 노트북을 꺼내 무릎 위에 놓고 열어 타이핑한다. 짧은 팔다리, 머리의 물리적 크기와 발밑 좌표를 유지한다. `work-interrupt`는 부름에 눈과 고개를 들고 작업으로 돌아온다. `work-stretch`는 손을 접힌 무릎에 쉬며 목과 어깨를 푼 뒤 키보드로 돌아온다. `work-finish`와 기본 작업의 복귀 구간은 덮개를 닫고 같은 가방에 넣은 뒤, 균형을 잡으며 다리를 풀고 일어서서 기본 자세로 끝난다. 실제 결과의 무릎 위 노트북과 접힌 다리 자세를 채택했다. 시작·종료 자세는 `entryPose`와 `exitPose`를 따른다.

## 제작 명령

```powershell
python scripts/export-assistant-motion.py art/production/takes/take-social.mp4 art/production/motions/greeting --motion greeting --start-frame 0 --end-frame 144
python scripts/export-assistant-motion.py art/production/takes/take-laptop-working-v4.mp4 art/production/motions/laptop-working --motion laptop-working --start-frame 0 --end-frame 721 --source-transform art/production/keyframes/laptop-v4-source-transform.json --color-transform art/production/keyframes/laptop-v4-color-transform.json
python scripts/build-assistant-preview.py
python scripts/build-assistant-pack.py --archive
python scripts/build-assistant-plugin.py
```

Higgsfield에는 `DAP Assistant`라는 Reference Element를 등록했다. 참조 ID는 `05d384a2-ec9d-4951-8738-85731dbbe46e`다. 생성 요청에는 무료 이벤트의 `use_unlim=true`를 사용했다.

모션 구성은 CZN 뷰어의 준비·반복·마무리 구간과 자세 전환을 참고했다. [CZN Animation Viewer](https://bennosleep.github.io/czn-animation-viewer/)
