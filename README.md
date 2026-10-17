# Chiikawa Friends for DAP

치이카와 친구들 11명의 외형과 성격·말투를 선택하는 DAP 플러그인입니다. **DAP 1.6.0 이상**, manifest v2, `petSkins` API v2를 사용합니다.

[플러그인 다운로드](https://github.com/o-min222/dap-chiikawa-friends/releases/latest) · [원본 이미지 저장소](https://github.com/heelee912/chiikawa-dots-pets) · [DAP 개발 문서](https://project-undonghae.github.io/desk-ai-pet/developers.html#ai-build)

> 현재 DAP 1.6.0 공식 배포는 Apple 계약 확인·공증 문제로 보류 중입니다. 1.6.0 개발 빌드에서 사용할 수 있으며, 기존 1.4.1에는 스킨 API가 없습니다. 공식 카탈로그 등록은 앱 배포 후 진행합니다.

## 설치와 첫 실행

1. GitHub Releases에서 `dap-chiikawa-friends-v1.1.0.zip`을 받아 풉니다.
2. 아래 폴더 바로 안에 `plugin.yaml`이 오도록 파일을 복사하고 DAP를 다시 실행합니다.
3. DAP 트레이 또는 펫 메뉴에서 **치이카와 친구들 / 친구들**을 엽니다.
4. **원본 이미지 받기**를 누릅니다. 11개 이미지 약 26MB를 원본 GitHub 저장소에서 직접 받아 SHA-256과 크기를 확인합니다. 준비가 끝나면 캐릭터를 고르고 **적용**을 누르세요.

| OS | 플러그인 폴더 |
|---|---|
| macOS | `~/Library/Application Support/dap/plugins/io.github.o-min222.chiikawa_friends/` |
| Windows | `%APPDATA%\dap\plugins\io.github.o-min222.chiikawa_friends\` |

기존 한 캐릭터용 `chiikawa_skin`은 끄면 중복 메뉴를 피할 수 있습니다. 같은 id의 v1.0.0 로컬 팩은 v1.1.0으로 교체할 수 있습니다. 기존 이미지가 원본 해시와 일치하면 재사용합니다.

DAP 카탈로그 등록 뒤에는 **설정 → 플러그인 → 설치 / 업데이트**로 코드가 GitHub에서 내려옵니다. 카탈로그는 검토한 버전 태그를 가리킵니다. 설치·업데이트 때 실행하는 빌드나 npm 설치는 없습니다.

## 캐릭터와 동작

치이카와, 하치와레, 우사기, 모몽가, 시사, 랏코, 쿠리만쥬, 세이렌, 후루혼야, 아노코, 데카츠요를 제공합니다.

- 9개 모션과 원본 프레임별 시간. 선택창에서 16방향 시선 미리보기.
- 캐릭터별 성격 카드와 예시 대사. **캐릭터 말투 사용**을 끄면 외형만 적용합니다.
- **기본 외형으로**를 누르거나 플러그인을 끄면 기존 외형·말투로 돌아갑니다.
- 사용자 이름·호칭·기억과 기존 화자 표시 이름은 유지합니다. 대화가 진행 중이면 다음 대화부터 새 말투를 반영합니다.
- 적용 선택은 재실행 시 복원합니다. 다른 외형이 적용되면 저장한 자동 복원 선택을 지웁니다.

성격은 서비스용 해석이며 공식 설정·대사의 재현이 아닙니다. 세이렌·아노코·데카츠요는 창작 초안입니다. 실제 펫의 16방향 시선과 실제 LLM 답변 품질은 별도 확인이 필요합니다.

## 이미지와 네트워크

**이 저장소와 릴리스에는 PNG·GIF·동영상이 없습니다.** 코드와 모션 메타데이터·대화용 해석을 배포합니다. 이미지 재배포를 피하고 DAP 온라인 설치기의 20MB 제한을 지킵니다.

이미지는 사용자가 다운로드 버튼을 눌렀을 때만 원본 저장소의 고정 커밋 `bb96582f525fbdf88a236b4703433ae92bfd5888`에서 받습니다. 요청 주소·해시·바이트 수는 `assets/originals.json`과 생성된 진입 파일에 고정돼 있습니다. 다른 서버나 추적 서비스는 사용하지 않습니다.

파일은 플러그인의 `assets/` 안에만 저장하며, 심볼릭 링크·경로 이동을 거부합니다. 다운로드를 마친 뒤 검증하고 원자적으로 저장하므로 실패한 파일을 스킨으로 적용하지 않습니다. 중간 실패 시 다시 누르면 검증된 파일은 건너뜁니다. 플러그인을 끄면 진행 중인 다운로드도 취소합니다.

코드 업데이트 시 DAP 설치기가 플러그인 폴더를 교체하므로 이미지를 다시 받아야 할 수 있습니다. 기본 활성화만으로 네트워크 요청을 보내지 않습니다. 캐릭터 선택·말투 설정은 DAP 설정 저장소에 유지됩니다.

## 권한과 실행 환경

`window.palette`: 선택창. `pet.skin`: 외형과 선택적 말투 전환.

플러그인 진입 파일은 DAP의 기존 trusted in-process 모델에서 실행됩니다. 다운로드는 main 쪽의 `fetch`와 Node 내장 파일·암호화 모듈로 처리하며, 팔레트는 외부 네트워크에 접근하지 않습니다. 가상의 network 권한을 선언하지 않습니다. 외부 npm 모듈 의존성은 없습니다.

## 개발·릴리스

Node 22 이상에서:

```sh
npm run build
npm test
npm run check
```

`src/plugin.template.mjs`·`src/assets.mjs` 또는 `assets/catalog.json`·`assets/originals.json`을 수정하면 `npm run build`로 `dap_chiikawa/plugin.mjs`를 다시 만드세요. 배포 파일에는 Node 내장 모듈만 import하며, 사용자는 빌드할 필요가 없습니다.

1. `plugin.yaml`과 `package.json` 버전을 같이 올립니다.
2. 빌드·테스트·검사를 통과한 소스를 main에 올립니다.
3. 같은 버전 태그를 push하면 Windows/Linux 자동 검사 뒤 이미지 없는 ZIP과 SHA-256을 GitHub Releases에 게시합니다.
4. `Project-Undonghae/dap-plugins`의 `ref`를 새 버전 태그로 갱신하는 PR을 만듭니다.

배포 ZIP은 `python3 scripts/package.py`로 로컬에서도 생성할 수 있습니다. PNG가 있으면 패키징을 중단합니다. 이미지를 이 저장소나 릴리스에 추가하지 마세요.

## 출처

[원본 chiikawa-dots-pets](https://github.com/heelee912/chiikawa-dots-pets), [공식 캐릭터 소개](https://www.chiikawaofficial.com/characters). 비공식 팬 제작물입니다. 캐릭터·이름의 권리는 나가노 및 각 권리자에게 있습니다. 원본의 개인 이용·재배포·상업 이용 안내를 따르세요. 자세한 범위는 `NOTICE.md` 참조.
