# Chiikawa Friends for DAP

치이카와 친구들 11명의 외형과 이름·성격·말투를 선택하는 DAP 플러그인입니다. **DAP 1.6.1 이상**, manifest v2, `petSkins` API v2를 사용합니다.

[플러그인 다운로드](https://github.com/o-min222/dap-chiikawa-friends/releases/latest) · [원본 이미지 저장소](https://github.com/heelee912/chiikawa-dots-pets) · [DAP 개발 문서](https://project-undonghae.github.io/desk-ai-pet/developers.html#ai-build)

> DAP 커뮤니티 카탈로그에 등록되어 있습니다. **DAP 1.6.1 이상**이 필요하며, 스킨 API가 없는 구버전에서는 사용할 수 없습니다.

## 설치와 첫 실행

DAP 1.6.1 이상에서 **설정 → 플러그인 → Chiikawa Friends → 설치**를 누릅니다. 이미 설치했다면 **업데이트 확인**을 눌러 최신 버전으로 업데이트하세요. 목록에 바로 나타나지 않으면 DAP를 다시 실행해 카탈로그를 새로 받습니다.

펫을 클릭하면 원형 메뉴의 **친구들** 항목에 5종 캐릭터 단체 이미지가 표시됩니다. 해당 아이콘을 눌러 선택창을 엽니다.

설치 후 펫의 **친구들** 메뉴를 열고 **원본 이미지 받기**를 누른 뒤 캐릭터를 적용합니다.

### ZIP으로 수동 설치할 때

1. GitHub Releases에서 `dap-chiikawa-friends-v1.4.1.zip`을 받아 풉니다.
2. 아래 폴더 바로 안에 `plugin.yaml`이 오도록 파일을 복사하고 DAP를 다시 실행합니다.
3. DAP 트레이 또는 펫 메뉴에서 **치이카와 친구들 / 친구들**을 엽니다.
4. **원본 이미지 받기**를 누릅니다. 11개 이미지 약 26MB를 원본 GitHub 저장소에서 직접 받아 SHA-256과 크기를 확인합니다. 준비가 끝나면 캐릭터를 고르고 **적용**을 누르세요.

| OS | 플러그인 폴더 |
|---|---|
| macOS | `~/Library/Application Support/dap/plugins/io.github.o-min222.chiikawa_friends/` |
| Windows | `%APPDATA%\dap\plugins\io.github.o-min222.chiikawa_friends\` |

기존 한 캐릭터용 `chiikawa_skin`은 끄면 중복 메뉴를 피할 수 있습니다. 같은 id의 v1.0.0 로컬 팩은 v1.3.1으로 교체할 수 있습니다. 기존 이미지가 원본 해시와 일치하면 재사용합니다.

카탈로그의 **설치 / 업데이트**를 누르면 코드가 GitHub에서 내려옵니다. 카탈로그는 검토한 버전 태그를 가리킵니다. 설치·업데이트 때 실행하는 빌드나 npm 설치는 없습니다.

## 캐릭터와 동작

치이카와, 하치와레, 우사기, 모몽가, 시사, 랏코, 쿠리만쥬, 세이렌, 후루혼야, 아노코, 데카츠요를 제공합니다.

- 기존 9개 모션과 새 모션 14개. 치이카와의 수면·먹기·그루밍·잡힘·성공·춤, 하치와레 기타 춤, 모몽가의 쉬기·좌우 이동·잡힘·먹기·수면·꼬리 춤을 제공합니다.
- **DAP 1.6.7 이상**에서는 새 행동을 독립 재생합니다. DAP 1.6.1~1.6.6은 기존 슬롯과 호환되는 쉬기·이동·성공/인사·춤/점프만 적용하며 수면·먹기·그루밍·잡힘은 기존 대체 동작을 유지합니다. 원래 점프와 새 춤을 구분하려면 본체도 업데이트하세요.
- 선택창은 실제 연결된 모션과 16방향 시선을 미리 보여 줍니다.
- 캐릭터별 성격 카드와 예시 대사. **캐릭터 이름·성격·말투 사용**을 끄면 외형만 적용합니다.
- **기본 외형으로**를 누르거나 플러그인을 끄면 기존 외형·이름·말투로 돌아갑니다.
- 캐릭터 적용 시 대화창 이름과 AI 자기소개·자기 지칭도 해당 캐릭터로 바뀝니다. 사용자 이름·사용자에 대한 호칭·기억은 유지합니다. 진행 중인 답변은 시작 시 캐릭터를 유지하고 다음 답변부터 새 캐릭터를 반영합니다.
- 적용 선택은 재실행 시 복원합니다. 다른 외형이 적용되면 저장한 자동 복원 선택을 지웁니다.

성격·말투는 공식 소개와 반복 묘사, 팬들이 관찰하는 특징을 바탕으로 다시 구성했습니다. 치이카와·우사기·쿠리만쥬는 잡담에서 짧은 소리와 몸짓 중심, 하치와레는 소박한 반말과 되물음, 모몽가는 제멋대로인 요구·투정을 사용합니다. 계산·작업 질문에는 필요한 내용과 사용자가 지정한 출력 형식을 우선합니다. [설정 근거·예시 적용 방식](PERSONAS.md)을 참고하세요. 한국어 예시는 새로 쓴 대사이며 공식 번역의 재현이 아닙니다. 실제 펫의 16방향 시선은 미지원이며 선택 창에서만 미리 볼 수 있습니다.

## 이미지와 네트워크

**다운로드한 원본 스프라이트 PNG·GIF·동영상은 배포하지 않습니다.** 코드·모션 메타데이터·대화용 해석, 새로 생성한 14개 모션 스트립(`assets/generated/`)과 원형 메뉴 아이콘 `icon.png`(256×256, 512KB 이하)를 배포합니다. 생성 모션은 SHA-256으로 검증하며 원본 캐릭터 시트는 사용자 PC에서만 조합합니다. 아이콘은 생성형 이미지 도구로 제작한 단체 일러스트이며 애니메이션 원본 파일이 아닙니다. DAP 온라인 설치기의 20MB 제한을 지킵니다.

이미지는 사용자가 다운로드 버튼을 눌렀을 때만 원본 저장소의 고정 커밋 `bb96582f525fbdf88a236b4703433ae92bfd5888`에서 받습니다. 요청 주소·해시·바이트 수는 `assets/originals.json`과 생성된 진입 파일에 고정돼 있습니다. 다른 서버나 추적 서비스는 사용하지 않습니다.

파일은 플러그인의 `assets/` 안에만 저장하며, 심볼릭 링크·경로 이동을 거부합니다. 다운로드를 마친 뒤 검증하고 원자적으로 저장하므로 실패한 파일을 스킨으로 적용하지 않습니다. 중간 실패 시 다시 누르면 검증된 파일은 건너뜁니다. 플러그인을 끄면 진행 중인 다운로드도 취소합니다.

코드 업데이트 시 DAP 설치기가 플러그인 폴더를 교체하므로 이미지를 다시 받아야 할 수 있습니다. 기본 활성화만으로 네트워크 요청을 보내지 않습니다. 캐릭터 선택·말투 설정은 DAP 설정 저장소에 유지됩니다.

## 권한과 실행 환경

`window.palette`: 선택창. `pet.skin`: 외형과 선택적 이름·성격·말투 전환.

플러그인 진입 파일은 DAP의 기존 trusted in-process 모델에서 실행됩니다. 다운로드는 main 쪽의 `fetch`와 Node 내장 파일·암호화 모듈로 처리하며, 팔레트는 외부 네트워크에 접근하지 않습니다. 가상의 network 권한을 선언하지 않습니다. 외부 npm 모듈 의존성은 없습니다.

## 개발·릴리스

Node 22 이상이 필요합니다. 외부 npm 의존성이 없어 `npm install` 없이 개발할 수 있습니다. ZIP 패키징에만 Python 3이 필요합니다.

```sh
npm run verify
npm run dev
```

`verify`는 빌드·테스트·배포 검사를 차례로 실행합니다. `dev`는 `src/`와 두 JSON 메타데이터 파일의 변경을 감지해 자동 빌드하며, `Ctrl+C`로 종료합니다. 팔레트 HTML·CSS·JS는 빌드 없이 직접 수정합니다. 아래 명령은 개별 실행용입니다.

```sh
npm run build
npm test
npm run check
```

`src/plugin.template.mjs`·`src/assets.mjs` 또는 `assets/catalog.json`·`assets/originals.json`을 수정하면 `npm run build`로 `dap_chiikawa/plugin.mjs`를 다시 만드세요. 배포 파일에는 Node 내장 모듈만 import하며, 사용자는 빌드할 필요가 없습니다.

### Windows에서 DAP에 개발본 적용

이 저장소는 DAP 안에서 실행하는 플러그인입니다. `npm run dev`는 자동 빌드만 하며 DAP에 복사하거나 앱을 다시 로드하지 않습니다. DAP 1.6.1 이상에서 실행하세요.

1. DAP을 완전히 종료하고, 기존 `%APPDATA%\dap\plugins\io.github.o-min222.chiikawa_friends\` 폴더를 다른 위치에 백업합니다.
2. 프로젝트 루트의 PowerShell에서 아래 명령을 실행합니다. 코드와 메타데이터만 덮어쓰며, 설치 폴더의 기존 원본 이미지는 유지합니다.

```powershell
npm run verify
if ($LASTEXITCODE -ne 0) { throw '개발본 검증에 실패했습니다.' }
$pluginDir = Join-Path $env:APPDATA 'dap\plugins\io.github.o-min222.chiikawa_friends'
New-Item -ItemType Directory -Path $pluginDir -Force | Out-Null
Copy-Item -Path plugin.yaml,icon.png,README.md,NOTICE.md,PERSONAS.md -Destination $pluginDir -Force
Copy-Item -Path dap_chiikawa,palette,assets -Destination $pluginDir -Recurse -Force
```

3. DAP을 다시 실행하고 **친구들** 메뉴에서 변경 사항을 확인합니다. 이미지가 준비되지 않았다면 **원본 이미지 받기**를 누릅니다. 코드를 수정할 때마다 복사와 DAP 재시작을 반복합니다.

원본 이미지는 DAP 설치 폴더에서 받으세요. 소스 저장소의 `assets/`에 원본 이미지를 넣으면 배포 검사와 패키징이 의도적으로 실패합니다. 배포 ZIP은 `npm run pack`으로 `dist/`에 생성합니다. Windows에서 `python3` 명령이 없다면 `python scripts/package.py`를 실행하세요.

### 생성 모션 개발과 본체 연동

승인된 정렬 스트립과 작업 메타데이터가 `dist/chiikawa-motion-v3/`에 있을 때 `node scripts/prepare-motion-pack.mjs`로 생성 자산과 해시 목록을 갱신합니다. 일반 사용자는 이 작업 없이 배포 ZIP을 설치하면 됩니다.

본체가 제공하는 `petSkins.supportedMotions`를 확인하여 독립 모션을 연결합니다. 원본 11행을 보존한 뒤 생성 행을 추가하며, 다운로드 검증용 원본은 덮어쓰지 않습니다. 같은 내용은 같은 해시 파일명으로 재사용합니다. 성공 모션은 큰 점프와 작은 반동을 연속 곡선으로 재생합니다.

모몽가의 먼저 말걸기와 말풍선·채팅 동시 표시는 DAP 본체 1.6.7의 별도 확장입니다. 기존 방해금지·작업 중·조용히 설정과 쿨다운을 따릅니다. 본체 변경 근거는 `host-patches/`에 보관합니다.

### 릴리스

1. `plugin.yaml`과 `package.json` 버전을 같이 올립니다.
2. 빌드·테스트·검사를 통과한 소스를 main에 올립니다.
3. 같은 버전 태그를 push하면 Windows/Linux 자동 검사 뒤 원본 스프라이트를 제외한 ZIP과 SHA-256을 GitHub Releases에 게시합니다.
4. `Project-Undonghae/dap-plugins`의 `ref`를 새 버전 태그로 갱신하는 PR을 만듭니다.

배포 ZIP은 `python3 scripts/package.py`로 로컬에서도 생성할 수 있습니다. 검증된 루트 `icon.png`만 이미지 예외로 포함합니다. 모션 목록에 해시가 고정된 생성 PNG 이외의 PNG·GIF·동영상이 있으면 검사를 중단합니다. 원본 스프라이트를 이 저장소나 릴리스에 추가하지 마세요.

## 출처

[원본 chiikawa-dots-pets](https://github.com/heelee912/chiikawa-dots-pets), [공식 캐릭터 소개](https://www.chiikawaofficial.com/characters). 비공식 팬 제작물입니다. 캐릭터·이름의 권리는 나가노 및 각 권리자에게 있습니다. 원본의 개인 이용·재배포·상업 이용 안내를 따르세요. 자세한 범위는 `NOTICE.md` 참조.
