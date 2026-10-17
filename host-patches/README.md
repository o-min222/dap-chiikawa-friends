# 모몽가 먼저 말걸기와 채팅 동시 표시

플러그인의 모몽가 말투 지침과 별도로 DAP 본체에 적용하는 패치입니다. 기준은 DAP 1.6.5 소스 `46e42a6ee23a080be806c8279f76f41ca93df989`입니다. 개발 체크아웃은 이 프로젝트의 `dist/dap-host-momonga/`에 있으며 설치된 앱과 사용자 채팅 데이터는 수정하지 않았습니다.

- 모몽가의 캐릭터 말투가 활성화된 때만 칭찬 요구·귀여움 자랑·가벼운 질문을 먼저 말걸기 화제로 제공합니다.
- 기존 한가함·작업 중·펫 숨김·방해금지·말걸기 끄기·쿨다운 검사를 그대로 따릅니다. 기본 조용히 설정은 입력 중단 90분 / 발화 후 쿨다운 120분, 균형 설정은 45분 / 60분입니다. 별도 타이머로 빈도를 늘리지 않습니다.
- AI 답변은 한 번만 생성합니다. 기존 대화 기록에 저장된 메시지 id로 열린 채팅창에 즉시 표시하고, 같은 답변을 말풍선에 전달합니다. 사용자가 답하면 그 내용을 대화 이력으로 이어갑니다.
- 다른 캐릭터의 기존 먼저 말걸기 동작과 대사 설정은 유지합니다. 모몽가 전용 화제는 다른 캐릭터나 말투 끄기 상태에서 생성하지 않습니다.

본체 소스 저장소 루트에서 적용합니다. 작업 파일과 충돌하면 강제로 덮어쓰지 말고 해당 변경과 병합하세요.

```powershell
git apply --check 'C:/Users/dudal/OneDrive/문서/ChatGPT/DAP Plugin/host-patches/momonga-companion.patch'
git apply 'C:/Users/dudal/OneDrive/문서/ChatGPT/DAP Plugin/host-patches/momonga-companion.patch'
cd app
pnpm install --frozen-lockfile
pnpm -r build
pnpm --filter @dap/electron-main exec vitest run test/momonga-proactive.test.ts test/proactive-speech.test.ts test/chat-pipeline.integration.test.ts --maxWorkers=1 --minWorkers=1
```

본체 재빌드와 플러그인 개발본 적용 후 사용할 수 있습니다. 플러그인만 업데이트하면 평소 채팅 말투 지침은 반영되지만 본체의 열린 채팅창 동시 표시는 활성화되지 않습니다. 생성 idle과 나머지 13개 모션은 플러그인 1.4.0에 포함됩니다. 모든 독립 동작과 본체 채팅 연동은 DAP 1.6.7부터 지원합니다.

검증: 모몽가 전용 화제와 캐릭터 전환·끄기·작업 중·쿨다운, 같은 메시지의 말풍선/열린 채팅/기록 전달, 사용자 답장의 이력 연결을 실제 DAP 대화 파이프라인에 가짜 LLM을 주입해 검사했습니다. 실제 구독 LLM 호출이나 실행 중인 앱 변경은 하지 않았습니다.

## 독립 모션 확장 (DAP 1.6.7)

`independent-motions.patch`는 본체의 스킨 검증기·capability·렌더러·테스트·API 문서를 확장합니다. 기준 소스는 1.6.6의 `c80f0bf085d08c359174afcffee821ddbf6896b5`이며 기존 API v2와 9개 모션의 대체 규칙을 유지합니다. 수면·먹기·그루밍·잡힘·성공·춤의 동명 클립이 있으면 먼저 사용합니다. 점프는 춤과 독립적입니다.

플러그인 1.4.0은 사용자 PC에서 원본 행을 보존하고 생성 행을 추가합니다. 공개 릴리스에는 합성된 원본 시트를 올리지 않습니다. `supportedMotions`가 없는 구형 본체에는 기존 11행만 등록합니다.

## 읽기 두 버전과 먼저 말걸기 (DAP 1.6.8)

momonga-working.patch는 기존 WorkingMotionPicker가 선택하는 working_v2를 스킨에서도 지원합니다. 책과 전단지를 작업 시작 시 50:50으로 선택하며 작업 중 유지합니다. 모몽가 먼저 말하기는 입력 정지 2분, 발화 후 15분 간격으로 조정하고 꺼짐·방해금지·작업/대화 중·숨김 조건을 유지합니다.
