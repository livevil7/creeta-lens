---
plan_id: 2026-09-22-lens-runtime-fixes
planner: cp
planner_model: fable (세션 위임)
kind: 개선
grade: 기본
created: 2026-09-22
status: approved
approved_at: 2026-09-22T13:25:00+09:00
approved_via: 채팅
approval_note: "지금 실행을 하고 agentmemonry는 제대로 작동을 안하면 되게 해야지."
shown: https://claude.ai/artifact/YTX2D6fQkx5ExRo14jtmcJ
repo: creeta-lens
base: master
branch: fix/lens-runtime-fixes
pr: null
refs: []
---

# Lens 훅·스킬 실사용 오류 일괄 수정

문제: Lens 가 백그라운드 작업 대기·사장님 답 대기를 "일이 안 끝났다" 로 오판해 턴을 붙잡고 내부 점검 문구를 화면에 띄운다. 질문창은 대화 기록이 늦게 써지는 탓에 거부되고, 진행보고 시계·에이전트 현황판·차단 횟수가 세션이 아니라 폴더 단위라 동시에 도는 세션끼리 섞인다. 커밋 뒤 Codex 검토는 빈 변경분에 "통과" 를 낸다.
해야 할 것: 훅·라이브러리·스크립트 36건과 스킬 문구 11건을 3.48.0 한 릴리스로 고친다. 실제 조건(기록 지연·두 세션·백그라운드 대기)을 재현하는 테스트를 먼저 만들고, 푸시 전에 분기 코드로 새 세션 재현을 돌린 뒤 이 컴퓨터에 설치해 다시 확인한다.
대표 결정: 끝남 — 지금 실행, agentmemory 는 끄지 않고 제대로 작동하게 고친다(2026-09-22). **Lens 밖이지만 가장 큰 문제 — livevil-contents 유튜브 자막 자동 실행의 폐기된 토큰(3,557회 중 성공 59회, 401 인데도 재시도) → 별도 작업 최우선 권고.**

## 🎯 목표

- Claude 가 백그라운드 작업을 기다리거나 사장님께 묻는 동안에는 Lens 가 턴을 억지로 이어 가게 하지 않고, 내부 점검 문구가 사장님 화면에 뜨지 않는다.
- 보고를 쓴 뒤 띄운 질문창이 실제로 뜬다. 기록이 늦어 판단할 수 없으면 막지 않는다.
- 여러 세션을 동시에 돌려도 서로의 진행보고 독촉·에이전트 현황·차단 횟수·위임 기록이 섞이지 않는다.
- Codex 교차 검증이 커밋 뒤에도 실제 작업 전체를 검토하고, 검토할 게 없으면 "통과" 대신 "검증 못 함" 을 낸다.
- 계획서 작성과 완료 조건 기록을 Lens 가 준 명령만으로 할 수 있어, 모델이 훅을 뜯어보거나 기록을 손으로 고치거나 베끼지 않는다. 완료 조건의 증거는 Lens 가 직접 검사를 돌려 남긴다.
- /cp 가 첫 계획서 링크를 먼저 보여 주고, HTML 손작업 없이 md 를 그대로 띄운다.
- Lens 상태 파일이 어느 레포에서도 git 변경으로 잡히지 않는다.
- 이 컴퓨터에서 파이썬이 한글을 출력하다 죽지 않는다.

Done: 새 Lens 를 이 컴퓨터에 설치한 뒤 ① 백그라운드 에이전트를 띄우고 턴을 끝내도 차단·해제 문구가 안 뜨고 ② 두 세션을 동시에 돌려도 진행보고 독촉 시각이 틀리지 않고 ③ 다음 /cp 승인 질문창이 실제로 뜬다.

## ❓ 왜

- 오늘 스냅홀로 속도 작업에서 턴 차단 6회가 전부 워커를 기다리는 중에 일어났다. 9월 21일에는 해제 문구가 52회 화면에 떠 사장님이 "왜 자꾸 나오는데? 나한테 보이게 하지를 말아" 라고 했고, 그 결과 "사람 확인 조건은 넣지 않는다" 는 메모리가 생겨 완료 조건 장치가 사실상 꺼졌다.
- 질문창은 9월 14일 전 약 150회가 전부 떴는데 9월 16일 이후 31회 중 1회만 떴다. 거부 34회 중 26회는 보고가 실제로 먼저 있었다. 사장님은 "왜 글로 묻냐" 를 보고 있다.
- 커밋 직후 Codex 검토가 빈 변경분에 "통과" 를 냈고, 같은 커밋을 사람이 지정해 다시 돌리자 Returns ERP 에서 다른 셀러 자원에 접근하는 보안 결함이 나왔다. 사장님 규칙이 "커밋은 무조건" 이라 이 구멍은 매번 열린다.
- 계획서 작성자 검사가 위임받은 최상위 모델을 부모 모델로 오판해 거부했고, 에이전트가 4분 동안 훅을 뜯어본 뒤 위임 기록을 다른 레포로 베껴 통과했다. 그 베낀 기록이 지금도 남아 그 레포의 검사는 누구에게나 열려 있다.
- 안 고치면: 매 실행마다 헛턴과 잘못된 독촉이 쌓이고, 사장님은 Lens 경고를 무시하게 되어 진짜 경고도 묻히며, 안전장치가 메모리 규칙으로 하나씩 꺼진다.

## AS-IS → TO-BE

| 항목 | 지금(실측) | 바뀐 뒤 | 근거 |
|---|---|---|---|
| 백그라운드 대기 중 턴 종료 | 오늘 차단 6회 전부 "worker still running" 직후, 전 세션 연속 차단 40회 중 대기 16회+ | 서브에이전트·워크플로·팀원 작업이 진행 중이면 통과, 기록만 남김(개발 서버·감시처럼 상시 떠 있는 작업은 대기로 안 침) | A1 · Pre-mortem |
| 사람 확인·질문 뒤 종료 | 40회 중 7회가 글 질문 직후 차단 | manual 조건은 차단 사유가 아니다 — "사용자 답 대기" 상태 | A2 |
| 차단 횟수 | 원장 시각만 바뀌어도 0부터, cwd 옮기면 재차단(09-18 5시간 무변화에 "막기→해제" 8회+) | 세션+미충족 목록 기준, 상한 2회 뒤 해제는 상태당 1회 | A3 · Codex |
| 사장님 화면의 문구 | 09-21 해제 문구 52회, "이어서 작업합니다" 가 실제로는 대기 중 | 사용자 화면용 문구 0건, 모델 전용 사유만 | A4 · A5 |
| 질문창 | 09-16 이후 31회 중 1회 통과, 거부 34회 중 26회는 보고가 있었음 | 보고 뒤 질문창이 뜬다. 현재 호출이 기록에 없으면 판단 보류(통과) | B1 |
| 진행보고 시계 | "19914초 경과"(실제 985초), 알림 28건 중 13건 5분 이상 부풀림, 워커 기록 22개에 29회 | 세션별 시계, 서브에이전트 호출 무시, 사용자 메시지에도 갱신 | C1 · C2 |
| 에이전트 현황판 | 세션 3개 에이전트 13개가 한 파일에 전부 launched, 다른 세션 시작이 통째 초기화 | 세션별 현황판, 완료 이벤트로 launched 해소 | C3 · C4 · D4 |
| Workflow 추적 | 24회 "done (102ms)" 로 거짓 완료, 이름 "unnamed-task" | 백그라운드 런치로 기록, 이름 반영, 진행보고 무장 | D1 · D2 · D3 |
| 계획서 작성자 검사 | 위임받은 최상위 모델 서브에이전트를 거부 → 위임 기록 베끼기 | 서브에이전트 식별 + 세션 단위 위임 기록(진행 중 포함) | E1 · E2 · E3 |
| 완료 조건 증거 | 손으로 쓴 exit:0 6건, 실행 불가한 라벨("live probe cards first") | Lens 가 검사를 직접 실행해 기록, 생성 시 실행 가능 여부 확인 | G1 · G2 |
| 원장 조작 | 원장 JSON 을 python 으로 직접 수술, node 한 줄 명령에서 백슬래시 유실 6회·따옴표 사고 7회 | lens-gate 명령 6종(status·run·evidence·abandon·reopen·close) | G4 · G5 |
| 커밋 뒤 Codex 검토 | 34파일 +4,681줄 커밋 직후 37바이트 "pass" | 계획 base 와의 공통 조상 이후 전체 diff, 빈 diff 는 "검증 못 함" | H1 |
| 훅 제한 시간 | 3000·5000·90000 을 밀리초로 적음 = 50분·83분·25시간 | 초 단위 3·5·90 | J1 · Codex |
| 사용자 입력 훅 | 입력 필드 이름이 틀려 한 번도 작동 안 함 | 공식 필드로 읽고, 진행보고 시계 갱신 용도로 전환 | J2 · Codex |
| 상태 파일과 git | snapholo 41개 등 9개 레포에서 추적·상시 "수정됨" | 만들 때 로컬 제외 등록, 기존 추적분 해제 | J3 |
| 첫 계획서 링크까지 | 55~89분(조사 12~37분 + 최상위 모델 작성·중계 25~40분 + HTML 손작업 3.5~12분 일부 겹침) | 목표·인벤토리 초안 링크를 먼저, 조사 상한, md 그대로 발행 | F1 · F2 |
| 컴팩션 뒤 언어 | 영어 답변 49건, 지적 뒤에도 재발 | 컴팩션 시 "사용자 언어로 답한다" 재주입 | F6 |
| 파이썬 한글 출력 | 4개 세션 35회+ 인코딩 오류 | 환경변수 2개로 0회 | K1 |

## 📋 작업 인벤토리

| # | 작업 항목 | 출처 | 반영 위치 | 상태 |
|---|---|---|---|---|
| 1 | A1 백그라운드 대기 중 종료 차단 → Stop 입력의 진행 중 백그라운드 작업 목록에 서브에이전트·워크플로·팀원 타입이 있으면 통과(상시 shell·monitor 는 대기로 안 침, 필드 없을 때 폴백 규칙 명시) | A1 · 2a412ea0 · Codex 1위 · Pre-mortem | 어떻게 · 1차 — 종료 검사 | 포함 |
| 2 | A2 사람 확인 조건·질문 종료 때문에 차단 → manual 조건은 차단 사유에서 제외, "사용자 답 대기" 상태 | A2 · 18f26c40 | 어떻게 · 1차 — 종료 검사 | 포함 |
| 3 | A3 차단 횟수가 원장 원문 해시·cwd 별이라 계속 초기화 → 세션+scope 키, 미충족 조건 목록만으로 해시, 사용자 수준 저장 | A3 · b0a8c4aa · ea3dcf2b · Codex | 어떻게 · 1차 — 종료 검사 · 1차 — 세션 상태 저장소 | 포함 |
| 4 | A4+A5 차단·해제 문구가 사장님 화면에 뜸(해제 뒤에도 매 턴, "이어서 작업합니다" 부정확) → 사용자 화면용 문구 제거, 모델 전용 사유만, 해제 알림은 상태당 1회 | A4 · A5 · ea3dcf2b 52회 | 어떻게 · 1차 — 종료 검사 | 포함 |
| 5 | A6 닫힌 원장 재개 불가 → 탈출용 포기·"abandoned" 오염 → 재개 + 사후 증거 | A6 · 18f26c40 · b0a8c4aa | 어떻게 · 1차 — 완료 조건 원장과 lens-gate | 포함 |
| 6 | A7/A8 `stop_hook_active` 미사용, 차단 전에 세션 완료·보고 시각 기록 → 순서 교정 | A7 · A8 · Codex | 어떻게 · 1차 — 종료 검사 | 포함 |
| 7 | B1 질문창 거짓 거부 → 현재 호출(`tool_use_id`)이 아직 기록에 없으면 판단 보류(통과). 테스트에 "기록 지연" 재현 추가 | B1 · 2a412ea0 · Codex 2위 | 어떻게 · 1차 — 질문창 검사 · 1차 — 실제 조건 재현 테스트 | 포함 |
| 8 | B3 /cc 사람 확인이 질문창에 막힘 → 사용자 문장 답("1")도 확인으로 인정, 기록 CLI | B3 · ea3dcf2b | 어떻게 · 1차 — 질문창 검사 · 2차 — /cc·/cd 문구 | 포함 |
| 9 | C1 진행보고 시계를 세션·워커가 공유 → session_id 별 사용자 수준 저장, 서브에이전트(`agent_id`) 호출 무시 | C1 · ea3dcf2b · 80ff31ad · 18f26c40 | 어떻게 · 1차 — 세션 상태 저장소 · 1차 — 진행보고·현황판 | 포함 |
| 10 | C2 시계가 사용자 메시지·턴 중 보고에 안 갱신 → UserPromptSubmit 에서 갱신, "보고 시각" 의미 교정 | C2 · 18f26c40 · Codex | 어떻게 · 1차 — 진행보고·현황판 · 1차 — 훅 설정·입력 계약·업그레이드 | 포함 |
| 11 | C3 에이전트 현황판을 세션이 공유·다른 세션이 초기화 → session_id 분리 | C3 · 18f26c40 · 8bceeb1b · Codex 4위 | 어떻게 · 1차 — 세션 상태 저장소 | 포함 |
| 12 | C4 launched 영구 누적·긴 안내문 반복 → SubagentStop·완료로 해결 처리, 안내문 한 줄 | C4 · 18f26c40 81회 46KB | 어떻게 · 1차 — 백그라운드 작업 추적 | 포함 |
| 13 | D1 Workflow 백그라운드 실행을 "완료" 로 기록 → 공용 Workflow 봉투 판별 | D1 · ea3dcf2b 14회 · 18f26c40 10회 · Codex 3위 | 어떻게 · 1차 — 백그라운드 작업 추적 | 포함 |
| 14 | D2 Workflow 이름 "unnamed-task" → meta.name | D2 · Codex | 어떻게 · 1차 — 백그라운드 작업 추적 | 포함 |
| 15 | D3 진행보고 훅의 Workflow 분기 도달 불가 → 분기 순서 | D3 · Codex 재현 | 어떻게 · 1차 — 진행보고·현황판 | 포함 |
| 16 | D4 실패 이벤트 미배선·설명문으로 작업 연결 → `tool_use_id`/`agent_id` 연결, 실패 처리 | D4 · Codex 8위 | 어떻게 · 1차 — 백그라운드 작업 추적 | 포함 |
| 17 | E1 fable 서브에이전트가 부모 모델로 판정돼 거부 → 위임 기록 위조 → 서브에이전트 식별(`agent_id` + 서브에이전트 기록의 모델), 위임 기록을 세션 단위 한 곳에 | E1 · ea3dcf2b · Codex 5위 | 어떻게 · 1차 — 계획서 작성자·모델 검사 · 1차 — 세션 상태 저장소 | 포함 |
| 18 | E2 진행 중인 비동기 fable 위임 미인정 → 세션 단위 위임 기록에 launched 포함 | E2 · 2a412ea0 | 어떻게 · 1차 — 계획서 작성자·모델 검사 | 포함 |
| 19 | E3 무관·실패·다른 세션 fable 기록으로 통과 → 세션 일치 검사(Bash 우회 탐지는 제외 — 57행) | E3 · Codex · 18f26c40 | 어떻게 · 1차 — 계획서 작성자·모델 검사 | 포함 |
| 20 | E4 Workflow 가 모델 검사 밖(313개 전부 opus) → 스크립트의 agent() 호출에 model 없으면 거부, 총 수 60 초과 경고(스크립트가 입력에 있을 때만 — 이름으로 부른 저장 워크플로는 건너뜀) | E4 · 18f26c40 · Pre-mortem | 어떻게 · 1차 — 계획서 작성자·모델 검사 | 포함 |
| 21 | E6 Agent 호출이 막힌 컨텍스트 → 거부 문구에 끄는 법·사유 기록 안내 | E6 · 5b11f539 | 어떻게 · 1차 — 계획서 작성자·모델 검사 | 포함 |
| 22 | G1 완료 조건 증거 자기신고 → 원장이 check 명령을 직접 실행해 결과 기록(lens-gate run). 새 판정은 schema 2 원장에만 — 업그레이드 전 열린 schema 1 원장은 종전 판정 | G1 · 18f26c40 · Codex · Pre-mortem | 어떻게 · 1차 — 완료 조건 원장과 lens-gate | 포함 |
| 23 | G2 auto 조건 check 가 실행 불가능한 라벨 → 원장 생성 시 한 번 실행해 보고 실행 불가면 거부 | G2 · 2a412ea0 | 어떻게 · 1차 — 완료 조건 원장과 lens-gate | 포함 |
| 24 | G4 포기·기준 수정 API 없음 → lens-gate CLI(status · run · evidence · abandon · reopen · close) | G4 · b0a8c4aa · ea3dcf2b | 어떻게 · 1차 — 완료 조건 원장과 lens-gate | 포함 |
| 25 | G5 `node -e` 한 줄 템플릿 → CLI 로 교체(백슬래시·따옴표 사고 제거) | G5 · 18f26c40 13회 | 어떻게 · 1차 — 완료 조건 원장과 lens-gate · 2차 — /cc·/cd 문구 | 포함 |
| 26 | G6 gate-ledger.js NUL 바이트 → 이스케이프 문자열 | G6 | 어떻게 · 1차 — 완료 조건 원장과 lens-gate | 포함 |
| 27 | G10 브랜치 진입 판정 늘 "물어봄" → 실행 중 계획서 파일은 dirty 에서 제외, 사유 중복 제거 | G10 · /cc 진입 7회 | 어떻게 · 1차 — 브랜치·교차 검증·완료 판정 | 포함 |
| 28 | H1 커밋 뒤 빈 diff 로 PASS → 계획 base 와의 merge-base 비교, 빈 diff 는 "검증 못 함" | H1 · 18f26c40 · ea3dcf2b | 어떻게 · 1차 — 브랜치·교차 검증·완료 판정 | 포함 |
| 29 | H2 cross-verify ↔ codex-review 인자 불일치 → 맞춤 | H2 · ea3dcf2b | 어떻게 · 1차 — 브랜치·교차 검증·완료 판정 | 포함 |
| 30 | H3 타임아웃 원인 불명 → stderr 로그 보존 | H3 · 이 세션 p05 · Codex | 어떻게 · 1차 — 브랜치·교차 검증·완료 판정 | 포함 |
| 31 | I1 /cd 가 브랜치 삭제 후 병합 판정 불가 → 병합 커밋 메시지·기록된 tip 으로 판정 | I1 · 18f26c40 6개 중 4개 unknown | 어떻게 · 1차 — 브랜치·교차 검증·완료 판정 · 2차 — /cc·/cd 문구 | 포함 |
| 32 | J1 hooks.json timeout 단위 착각(50분·83분·25시간) → 초 단위로 교정 | J1 · Codex 10위 · 공식 문서 | 어떻게 · 1차 — 훅 설정·입력 계약·업그레이드 | 포함 |
| 33 | J2 user-prompt-handler 무작동 → 입력 `prompt` 로 교정하되 "AskUserQuestion 을 부르지 마라" OVERRIDE 주입은 제거(고치면 질문창을 또 막음) — C2 시계 갱신 용도로 전환 | J2 · Codex 7위 · 대화 기록 OVERRIDE 0건 | 어떻게 · 1차 — 훅 설정·입력 계약·업그레이드 | 포함 |
| 34 | J3a `.lens/` 가 git 에 섞임 → `.lens` 만들 때 그 레포 `.git/info/exclude` 에 등록(로컬 전용) | J3 · 9개 레포 | 어떻게 · 1차 — 훅 설정·입력 계약·업그레이드 | 포함 |
| 35 | J4 계획서 게이트 중복 억제가 세션 무관, `grade: "deep"` 따옴표 파싱 → 교정 | J4 · Codex | 어떻게 · 1차 — 훅 설정·입력 계약·업그레이드 | 포함 |
| 36 | 업그레이드가 실행 중 세션의 훅 경로(캐시)를 지우는지 확인·대응(Codex 조건부 — 롤아웃 직결) | Codex 조건부 · scripts/upgrade.py | 어떻게 · 1차 — 훅 설정·입력 계약·업그레이드 | 포함 |
| 37 | B2 질문창 거부 시 대체 질문 → "선택지 전부를 본문에" 규칙 | B2 · 80ff31ad | 어떻게 · 2차 — /cp 문구와 컴팩션 재주입 | 포함 |
| 38 | E5 fable 위임 전경 10~26분 무보고 → 백그라운드로 띄우고 진행보고, 조사 끝난 뒤 '작성만' 위임 | E5 · 18f26c40 · 2a412ea0 | 어떻게 · 2차 — /cp 문구와 컴팩션 재주입 | 포함 |
| 39 | F1 HTML 손작업(3.5~12분·md/html 이중 관리) → "md 파일을 그대로 Artifact 로 발행" 명시(Artifact 도구는 스킬이 요구하면 md 허용), artifact-design 로드·페이지 재작성 지시 삭제 | F1 · ea3dcf2b · 18f26c40 · 사용자 정정 | 어떻게 · 2차 — /cp 문구와 컴팩션 재주입 | 포함 |
| 40 | F2 첫 링크까지 55~89분(조사 12~37분 + fable 작성·중계 25~40분) → 목표·인벤토리가 서면 초안 링크 먼저, 비평·Codex 는 표시 뒤 병렬, 조사 시간 상한 | F2 · ea3dcf2b | 어떻게 · 2차 — /cp 문구와 컴팩션 재주입 | 포함 |
| 41 | F3 완성 보고에 링크 누락 → 보고 첫 줄 링크 고정 | F3 · ea3dcf2b | 어떻게 · 2차 — /cp 문구와 컴팩션 재주입 | 포함 |
| 42 | F4 할 일 목록 빔·낡음·89건 → Phase 0 뼈대 등록, 실행 항목 10~15개로 묶기, "deferred 면 ToolSearch 로 불러와라" 로 문구 교정 | F4 · ea3dcf2b · 18f26c40 | 어떻게 · 2차 — /cp 문구와 컴팩션 재주입 | 포함 |
| 43 | F6 컴팩션 뒤 영어 → compact SessionStart 출력에 "사용자 언어로 답한다" 한 줄 재주입 | F6 · ea3dcf2b 49건 | 어떻게 · 2차 — /cp 문구와 컴팩션 재주입 | 포함 |
| 44 | G3 manual/auto 기준 없음 + 메모리 충돌 → 측정 가능하면 auto 강제, manual 은 차단 아님·보고 한 줄, 사용자 화면에 내부 용어 금지 | G3 · 메모리 충돌 | 어떻게 · 2차 — /cc·/cd 문구 | 포함 |
| 45 | G7 정지 규칙이 staging/운영 구분 없음 → lens.config 레포별 "멈추지 않아도 되는 행동"(Returns_ERP_v20: staging 배포·staging DB — 사장님 09-01·09-10·09-18 발언 근거), 기본은 운영 배포·운영 DB 만 멈춤 | G7 · 사장님 발언 3건 | 어떻게 · 2차 — /cc·/cd 문구 | 포함 |
| 46 | G8 리더 커밋이 실행 중 워커의 임시 상태 포함 → 미해결 워커(background_tasks) 있으면 커밋 보류 | G8 · 18f26c40 09-18 11:09 | 어떻게 · 2차 — /cc·/cd 문구 | 포함 |
| 47 | G9 실행 뒤 계획서 체크박스·status 미갱신 → 조건 충족 시 체크, 승격 시 status 갱신 | G9 · 08-25부터 8건 | 어떻게 · 2차 — /cc·/cd 문구 | 포함 |
| 48 | E1 잔여물: snapholo-data/.lens 의 위조 위임 기록 항목 + `agent-dashboard.json.bak-20260921-planner` 정리 | E1 · 실측(파일 존재 확인) | 어떻게 · 정리·환경·문서 | 포함 |
| 49 | J3b 이미 추적 중인 .lens 파일 해제: snapholo 41 · livevil-boost 14 · Docs·Returns-Doc·Stage·livevil-connectable·namane-blog·namane-mkt 각 1(그 레포에 다른 세션이 작업 중이면 끝난 뒤). 해제 대상은 런타임 상태 파일(agent-dashboard · progress-report-state · gate-block-state · report-shown · *.tmp)로 한정 — 추적 해제 커밋을 다른 컴퓨터가 pull 하면 그쪽 작업트리에서 파일이 지워지므로 `verify`·`bench`·`preview`·`type` 같은 검증 산출물은 `docs/` 참조 grep 뒤 참조 0 인 것만 | J3 · Pre-mortem | 어떻게 · 정리·환경·문서 | 포함 |
| 50 | K1 이 컴퓨터 `~/.claude/settings.json` env 에 PYTHONUTF8=1 · PYTHONIOENCODING=utf-8(이 컴퓨터만 — livevil-setting 에 settings.json 정본은 없다, 다른 컴퓨터는 73행과 함께 보류) | K1 · 35회+ · Pre-mortem | 어떻게 · 정리·환경·문서 | 포함 |
| 51 | K3 워크스페이스 markdownlint 노이즈 규칙(MD060 등) 끄기 — 워크스페이스 루트 `.markdownlint.json` 을 새로 만든다(`.vscode/` 는 없음 — 실측) — 낮음 | K3 · 43회 1.32MB · Pre-mortem | 어떻게 · 정리·환경·문서 | 포함 |
| 52 | 메모리 정합: `feedback_hide_internal_gate_prompts` 를 새 동작(내부 문구 비노출·manual 비차단)에 맞게 고치고, `trap-lens-gate-ledger-evidence-contract` 를 lens-gate CLI 기준으로 갱신 | G3 · G5 | 어떻게 · 정리·환경·문서 | 포함 |
| 53 | 문서: harness-rules.md · CLAUDE.md · CHANGELOG 갱신 | 레포 관례 | 어떻게 · 정리·환경·문서 | 포함 |
| 54 | 실제 런타임 재현 테스트 추가(기록 지연 · Stop background_tasks · 두 세션 · Workflow 봉투 · 빈 diff · 서브에이전트 모델) — 기존 테스트가 실제 조건을 안 담았다는 Codex 지적 | Codex 테스트 표 | 어떻게 · 1차 — 실제 조건 재현 테스트 | 포함 |
| 55 | 릴리스 3.48.0: 버전 범프·CHANGELOG·태그 → creeta-lens master 푸시(정지 지점: 모든 컴퓨터가 받는 배포) → 이 컴퓨터 업그레이드 → 설치본에 수정 식별자 grep 확인(버전 문자열은 증거 아님) | 릴리스 가이드 | 어떻게 · 릴리스 | 포함 |
| 56 | C5 원장 파일명 충돌·색인 24h | C5 · Codex | — | 제외: 관측 0건, 재발 시 |
| 57 | E3 일부: Bash 로 docs/tasks 에 쓰는 우회 탐지 | E3 · 18f26c40 | — | 제외: 명령 문자열 추측은 오탐을 부르고 관측 1건 |
| 58 | F5 스킬 본문 과대(cc 83KB 등) | F5 | — | 제외: 규칙 전체 재작성이라 이번 수정과 섞으면 검증 불가, 별도 계획 |
| 59 | H3 일부: FAIL/UNVERIFIED 를 exit code 로 구분 | H3 · Codex | — | 제외: 호출부가 판정 문자열을 읽는 계약이라 바꾸면 기존 흐름이 깨짐 |
| 60 | J5 계획서 자리표시자 오탐 | J5 · 18f26c40 | — | 제외: 추정, 3.39 완화 뒤 관측 0 |
| 61 | Codex 나머지 조건부(설치 목록 첫 항목만 봄, 동기화 스탬프 선기록, 출력 파일 이름 충돌, .git 파일 worktree 등) | Codex 표 | — | 제외: 관측 0건, 다음 감사로 |
| 62 | K4 livevil-contents 유튜브 자막 추출 자동 실행 토큰 폐기(3,557건 중 성공 59) | K4 | — | 제외: Lens 밖·자격증명 → 별도 작업 최우선 권고(문서 맨 위 결정 줄에 표시) |
| 63 | K5 Playwright 9222 연결 실패 | K5 | — | 제외: Aside 기본 정책으로 완화됨 |
| 64 | K6 auto-mode 분류기 차단 | K6 | — | 제외: Claude Code 기능 |
| 65 | K7 권한 확인 피로 | K7 | — | 제외: 허용 목록 변경은 대표가 직접 정할 일(`/fewer-permission-prompts` 안내만) |
| 66 | K8 Claude Docs 500·API 529 | K8 | — | 제외: 서버 일시 장애 |
| 67 | K9 원격 PowerShell 따옴표·코드페이지 | K9 | — | 제외: Lens 밖, 재발 시 트랩 메모리 보강 |
| 68 | K10 gptaku 알림·checkout-guard 경고 | K10 | — | 제외: 사용자 스크립트, 영향 미미 |
| 69 | K11 Aside 조작 중 화면 방해 | K11 | — | 제외: 모델 판단 문제, 기존 GUI 규칙 영역 |
| 70 | K12 세션 재개 시 백그라운드 작업 유실 | K12 | — | 제외: Claude Code 동작 |
| 71 | K13 프로그래매틱 자동 실행에서 Lens 훅 부재 | K13 | — | 제외: 도구 없는 추출이라 영향 없음 |
| 72 | K2 agentmemory 가 제대로 작동하게 한다 — 실측 원인: 맥미니 서버에 요약 LLM 이 설정돼 있지 않아(`resilient(noop)`) 요약 10,816회가 전부 실패, 서버 메모리 97%로 상태 "critical"(느려지면 훅에 제한 시간이 없어 파일 도구가 최대 10분 정지), 이 세션의 연결 실패는 서버 문제가 아니라 시작 때 남은 실패 기록으로 건너뛴 것(같은 날 다른 세션 6/6 연결 성공) | K2 · ea3dcf2b · 8bceeb1b · 이 세션 실측 · 대표 지시 | 어떻게 · agentmemory 복구 | 포함 |
| 73 | 다른 컴퓨터 설치본 검증 — 푸시 후 각 컴퓨터가 받는지(macmini MCP 연결 실패 중) | 롤아웃 | 🚀 롤아웃·롤백 | 보류: 각 컴퓨터 접근 확인 뒤 |
| 74 | (신규) 워크스페이스 루트 `.lens/` 에 원자적 쓰기 실패 잔해 `agent-dashboard.json.*.tmp` 38개(5월~8월) — 세션 저장소 이전 뒤 구 상태 파일과 함께 정리, 쓰기 실패 시 임시 파일 삭제를 공용 저장 함수에 추가 | 이 계획서 작성 중 실측 · Codex(무잠금 쓰기 지적) | 어떻게 · 1차 — 세션 상태 저장소 · 정리·환경·문서 | 포함 |

## 🛠 어떻게

권장 경로 하나로 간다. 1차(훅·lib·스크립트 — 테스트 먼저) → 2차(스킬 문구) → 정리·환경·문서 → 릴리스. 모든 훅 변경은 **fail-open** 이 원칙이다 — 어떤 예외·판단 불가도 "통과" 로 떨어진다.

### 1차 — 세션 상태 저장소 (공통 기반)

C·A3·E1·E2 의 공통 뿌리는 "상태가 세션이 아니라 폴더 단위" 다. 이것을 먼저 옮긴다.

- [ ] `lib/session-store.js` 신설 — 훅 입력의 `session_id` 로 사용자 수준 폴더를 정한다: `~/.claude/lens/sessions/<session_id>/`(`CLAUDE_CONFIG_DIR` 가 있으면 그 아래 — Codex 지적). 안에 `progress.json`(진행보고 시계) · `dashboard.json`(에이전트 현황판) · `blocks.json`(차단 카운터) · `delegations.json`(위임 기록) 네 파일. cwd 와 무관하다.
- [ ] `session_id` 가 입력에 없으면(외부 실행·구버전) 종전 경로(`<레포>/.lens/…`)로 폴백한다 — 죽지 않고 예전처럼 동작.
- [ ] `agent_id` 가 입력에 있으면 서브에이전트 호출이다 — 진행보고 시계·차단 카운터는 건드리지 않고, 현황판에는 `agent_id` 로만 기록한다.
- [ ] `lib/agent-tracker.js` `getDashboardPath()` · `hooks/post-tool-progress.js` `getStatePath()` · `hooks/stop.js` `blockStatePath` · `hooks/pre-tool-plan-doc.js` `topTierDelegated()` 가 전부 이 모듈을 쓴다. `resolveProjectRoot({})` 로 루트를 추측하는 호출을 없앤다.
- [ ] `hooks/session-start.js`: `startup` 에서 7일 지난 세션 폴더를 지운다. `initSession()` 은 자기 세션 폴더만 만든다 — 다른 세션의 현황판을 초기화하는 경로가 사라진다(C3).
- [ ] `lib/hook-utils.js` `safeWriteJson`: 원자적 교체가 실패하면 남긴 `.tmp` 를 지운다(74행). 구 레포 수준 상태 파일은 코드가 지우지 않는다(정리 단계에서 손으로).
- [ ] 막힐 지점: 게이트 원장(`.lens/gates/`)은 **옮기지 않는다** — 원장은 계획(scope)에 속하고 레포에 남아야 /cd 가 닫는다. 원장의 사용자 수준 색인은 그대로 두되 세션 필터는 종전대로 `sessionId` 로 한다.

### 1차 — 종료 검사

- [ ] `hooks/stop.js` 순서 교정(A7/A8): 입력 읽기 → 게이트 판정 → **차단이면** 사유만 내고 끝(세션 완료 기록·보고 시계 스탬프 없음) → **통과면** 그때 `endSession()` 과 시계 스탬프.
- [ ] A1: `background_tasks` 중 `type` 이 `subagent`·`workflow`·`teammate`·`cloud session` 인 항목이 하나라도 있으면 판정 자체를 건너뛰고 통과(출력 없음). `shell`·`monitor`·`MCP task` 는 대기로 치지 않는다 — 개발 서버·감시·/loop 처럼 세션 내내 떠 있는 작업이 게이트를 영원히 끄는 것을 막는다(Pre-mortem). 시계는 스탬프하되 세션은 완료로 찍지 않는다 — 턴은 끝났지만 실행은 안 끝났다.
- [ ] A2: `lib/gate-ledger.js` `evaluate()` 가 `kind: manual` 게이트를 `outstanding` 에서 빼고 `awaitingUser` 목록으로 따로 낸다. `decideBlock()` 은 `outstanding` 만 본다. manual 만 남은 원장은 차단하지 않는다.
- [ ] A3: 카운터 키 = `session_id` + scope, 해시 = 미충족 게이트 id 를 정렬해 이은 문자열(원장 원문·시각 제외). 저장은 세션 저장소 `blocks.json`. 상한(`MAX_BLOCKS` 2)은 유지.
- [ ] A4+A5: 차단 출력은 `decision: block` + `reason` 만(사용자 화면용 `systemMessage` 삭제). 사유 문구는 "완료 조건 N건 미확인 — `lens-gate status` 로 보고 `lens-gate run` 으로 검사를 돌리거나 `lens-gate abandon` 으로 사유를 남겨라" 로 바꾼다("이어서 작업합니다" 삭제). 해제 알림은 `hookSpecificOutput.additionalContext` 로 같은 미충족 해시당 1회만.
- [ ] `stop_hook_active` 가 참이고 미충족 해시가 직전 차단과 같으면 카운터만 올린다(지금과 같음) — 새 로직은 아니지만 테스트로 고정한다.
- [ ] 막힐 지점 → 우회로는 아래 `우회로` 절.

### 1차 — 질문창 검사

- [ ] `hooks/pre-tool-ask.js` B1: 기록 꼬리에서 `tool_use` 블록의 `id === input.tool_use_id` 인 assistant 항목을 찾는다. **없으면 기록이 아직 안 써진 것 — 판단 보류 = 통과.** 있으면 그 항목까지의 창에서 보고 글을 센다(종전 40자 규칙). `MIN_CHARS` 는 그대로.
- [ ] B3: 허용 header `검증 확인` 은 그대로. 거부 문구에 "사용자가 글로 답하면 그 답이 확인이다 — `lens-gate evidence <scope> <id> --confirmed-by 대표 --note '답 원문'` 으로 기록" 을 싣는다.
- [ ] 테스트 `hooks/pre-tool-ask.test.js`: 대화 기록 2a412ea0 을 질문 줄까지 자른 픽스처(보고 1,835자 포함)와 보고 줄을 뺀 픽스처, 그리고 **`tool_use_id` 가 아직 없는** 픽스처 3종을 추가한다.

### 1차 — 진행보고·현황판

- [ ] `hooks/post-tool-progress.js` C1: 상태를 세션 저장소에서 읽고 쓴다. `agent_id` 가 있으면 즉시 종료(워커는 메인 시계를 안 건드린다).
- [ ] C2 "보고 시각" 의미 교정: `lastReportAt` 을 `lastContactAt`(사장님이 마지막으로 화면을 본 시각 = 턴 종료·사용자 메시지) 과 `lastReminderAt`(마지막 독촉) 으로 나눈다. 독촉은 둘 중 늦은 시각 기준 120초. 독촉 문구는 "마지막 접점 이후 N초" 로.
- [ ] D3: `isBackgroundSignal()` 에서 **Workflow 분기를 먼저** 본다(`SPAWN_TOOLS` 의 Agent 봉투 검사보다 앞). 판별은 아래 공용 봉투 모듈.

### 1차 — 백그라운드 작업 추적

- [ ] `lib/spawn-envelope.js` 신설 — `classify(toolName, toolInput, toolResponse)` 가 `agent-async` · `workflow-async` · `foreground` · `unknown` 과 식별자(agentId · runId)를 돌려준다. `post-tool-task.js` 와 `post-tool-progress.js` 가 같은 함수를 쓴다(D1). `unknown` 은 done 이 아니라 `launched` 로 남긴다.
- [ ] D2: Workflow 는 `tool_input.name` 을 이름으로.
- [ ] D4: `hooks/pre-tool-task.js` 가 `tool_use_id` 를 현황판 항목에 기록하고, `hooks/post-tool-task.js` 는 `tool_use_id` 로 먼저 잇고 설명문 매칭은 폴백으로만. `hooks/hooks.json` 에 `SubagentStop`(matcher 없음 → `hooks/subagent-stop.js`: `agent_id` 로 `launched → done`) 과 `PostToolUseFailure`(`Task|Agent|Workflow` → `hooks/post-tool-task.js --failed`: `tool_use_id` 로 `error`) 를 배선한다.
- [ ] C4: launched 가 완료 이벤트로 풀리므로 누적이 멈춘다. 남은 launched 안내문은 한 줄("미확정 N건") 로 줄이고 개수가 바뀔 때만 낸다.
- [ ] 막힐 지점: 비동기 봉투의 `agentId` 와 `SubagentStop` 의 `agent_id` 가 같은 값인지 문서에 없다. 구현 전 실측 1회(백그라운드 에이전트 1개 띄우고 두 값 비교). 다르면 SubagentStop 은 "같은 세션에서 가장 오래된 launched" 를 푼다 — 병렬 오귀속은 있어도 영구 launched 보다 낫다.

### 1차 — 계획서 작성자·모델 검사

- [ ] `hooks/pre-tool-plan-doc.js` E1: 입력에 `agent_id` 가 있으면 서브에이전트다. 먼저 서브에이전트 기록(`<transcript_path 폴더>/<session_id>/subagents/agent-<agent_id>.jsonl`)의 마지막 assistant 모델을 읽는다. 읽히면 그 모델로 판정. 못 읽으면 세션 저장소 `delegations.json` 에 이 세션의 TOP 위임이 `running`·`launched`·`done` 으로 있으면 통과(E2). 부모 기록의 모델은 `agent_id` 가 없을 때만 본다.
- [ ] E3: 위임 기록은 세션 저장소에만 쓰고 읽는다 — 다른 세션·다른 레포 기록은 구조상 안 보인다. `error` 인 위임은 자격이 아니다.
- [ ] E4: `hooks/pre-tool-task.js` 가 Workflow 의 `tool_input.script` 를 정적으로 본다 — `agent(` 호출마다 인자 안에 `model` 이 있는지. 하나라도 없으면 거부(사유에 그 호출 위치). `agent(` 개수가 60 을 넘거나 반복문 안에 있어 셀 수 없으면 경고(차단 아님). `tool_input.script` 가 **있을 때만** 검사한다 — 저장된 워크플로를 `name` 으로 부르면 스크립트가 입력에 없으므로 건너뛴다(거부하지 않는다).
- [ ] E6: 거부 문구 끝에 "Agent 를 부를 수 없는 컨텍스트면 `LENS_PLANNER_GATE=0` 으로 끄고 계획서 `planner_model` 에 사유를 적어라" 한 줄.
- [ ] 막힐 지점: 서브에이전트 기록 경로 규칙은 공식 문서의 예시(`…/abc123/subagents/agent-def456.jsonl`)에서 유도한 것이다. 실측에서 다르면 위임 기록 폴백만으로 판정한다(그래도 E1 사고는 재발하지 않는다 — 부모 세션이 fable 을 띄운 기록이 같은 저장소에 있다).

### 1차 — 완료 조건 원장과 lens-gate

- [ ] `scripts/lens-gate.js` 신설(G4) — `status [scope]` · `create <scope> --plan <md> --goal <문장> --gates <json 파일>` · `run <scope> [gateId]` · `evidence <scope> <gateId> --note --confirmed-by` · `abandon <scope> <gateId> --reason` · `reopen <scope> [gateId]` · `close <scope>`. 출력은 JSON 한 줄, 인자는 셸 인용이 필요 없는 형태(파일·플래그).
- [ ] G1: `run` 이 원장의 `check` 를 bash(win32 는 git-bash)로 직접 실행해 exit·출력(뒤 600자)을 `recordEvidence` 에 넘기고 `evidence.source = "lens-gate run"` 을 찍는다. 원장 `schema` 를 2 로 올리고, **`gateState()` 의 "auto 게이트는 `source` 가 runner 일 때만 `met`" 규칙은 `lens-gate create` 가 만든 schema 2 원장에만 적용한다.** schema 1(업그레이드 전에 열린 원장 — 오늘 snapholo 2a412ea0 처럼 API 로 증거를 넣은 것)은 종전 판정 그대로 — 아니면 업그레이드 직후 열려 있던 원장이 전부 미충족으로 뒤집혀 재차단된다(Pre-mortem). 구 훅(3.47.0)의 `loadLedgers` 는 `schema` 값을 검사하지 않고 `gates` 배열만 보므로(현 코드 확인) schema 2 원장도 읽는다.
- [ ] G2: `create` 가 auto 게이트마다 `check` 를 한 번 실행해 본다(상한 120초). exit 126·127(실행 불가·명령 없음)이면 원장을 만들지 않고 그 게이트를 지목한다. 시간 초과·다른 실패는 "실행 가능하나 미충족" 으로 인정하고 생성한다.
- [ ] A6: `reopen` 이 `closedAt` 을 비우거나 `abandoned` 게이트를 `unmet` 으로 되돌리며 `reopenedAt` 을 남긴다. 그 뒤 `run` 으로 증거를 붙이면 정상 `met`.
- [ ] G6: `lib/gate-ledger.js` 275·293·305행의 NUL·\x01 원문 바이트를 `\u0000`·`\u0001` 이스케이프로.
- [ ] G5: 스킬의 `node -e` 한 줄 8곳을 CLI 로 바꾼다 — 원장 4곳(`skills/cc/SKILL.md` 310·820·830·907행)은 `lens-gate`, git-branch·plan-manager 4곳(cc 223·262·282, cd 113·138, cp 203·254·290)은 얇은 래퍼 `scripts/lens-cli.js`(`branch entry|ownership|merged`, `plan todo|structure|preflight`)로. 래퍼는 인자를 넘기고 JSON 을 찍을 뿐 판정 로직을 갖지 않는다.

### 1차 — 브랜치·교차 검증·완료 판정

- [ ] G10 `lib/git-branch.js` `entryDecision()`: dirty 판정에서 실행하려는 계획서 파일(인자로 받은 `planDoc`)과 `.lens/` 를 뺀다. `reasons` 는 중복 제거.
- [ ] H1 `scripts/codex-review.sh --mode review --base <branch>`: diff = 작업트리 + 스테이징 + untracked + **`git diff $(git merge-base origin/<base> HEAD)..HEAD`**. `.lens/` 경로 제외. 합친 diff 가 비면 Codex 를 부르지 않고 `{"verdict":"unverified","reason":"empty diff"}` 를 쓴다. `scripts/cross-verify.sh` 는 계획서 frontmatter `base:` 를 읽어 `--base` 로 넘긴다.
- [ ] H2: `cross-verify.sh` 가 `--out <dir>` 를 받아 레인 출력 폴더로 쓰고, `codex-review.sh` 의 `--out` 은 기본값(임시 파일)을 가진다. 두 스크립트의 usage 주석을 같은 인자 표로.
- [ ] H3: 두 스크립트 모두 stderr 를 `<out>.stderr.log` 로 남긴다. 타임아웃이면 결과 파일에 `{"verdict":"unverified","reason":"timeout <초>s"}` 를 쓴다(빈 파일 금지). 판정 문자열 계약은 그대로(59행 제외 유지).
- [ ] I1 `mergedState()`: 원격·로컬 ref 가 둘 다 없을 때 ① `git log origin/<base> --merges --grep "<branch>"` 의 병합 커밋 ② 계획서 frontmatter `last_tip:`(아래 /cc 문구에서 기록) 이 base 조상이면 `merged-deleted` 로 판정하고 `reason` 에 근거를 쓴다. 둘 다 없으면 지금처럼 `unknown`.

### 1차 — 훅 설정·입력 계약·업그레이드

- [ ] J1 `hooks/hooks.json`: timeout 3000→3 · 5000→5 · 90000→90(초). `SubagentStop`·`PostToolUseFailure` 배선 추가(위 D4).
- [ ] J2 `scripts/user-prompt-handler.js`: 입력을 `input.prompt` 로 읽는다. OVERRIDE `systemMessage` 주입은 **삭제**(질문창 금지 문구가 B1 을 또 막는다. Claude Code 가 슬래시 명령을 자체 처리하므로 손실 없음 — 대화 기록에 OVERRIDE 0건으로 확인). 대신 세션 저장소 `progress.json` 의 `lastContactAt` 을 갱신한다(C2). 출력은 빈 JSON.
- [ ] J3a `lib/hook-utils.js` 에 `ensureLensDir(root)`: `.lens` 를 만들 때 `git rev-parse --git-path info/exclude` 가 가리키는 파일에 `.lens/` 한 줄을 없으면 붙인다(worktree 의 `.git` 파일도 처리). git 이 아니면 건너뜀. 모든 `.lens` 생성 지점이 이 함수를 쓴다.
- [ ] J4 `hooks/post-tool-plan-doc.js`: 중복 억제 키에 `session_id` 를 넣고, `grade()` 가 따옴표를 벗긴다.
- [ ] 36 `scripts/upgrade.py`: 이 Claude Code(2.1.278)가 `.in_use` 마커를 실제로 쓰는지 실행 중 세션의 캐시 폴더를 열어 확인한다. 쓰지 않으면(가능성 높음) 정책을 "직전 설치 버전 폴더 1개는 항상 보존, 그보다 오래된 것만 삭제" 로 바꾼다 — 실행 중 세션의 훅 경로가 살아남는다. 롤백(이전 버전 재설치)도 이 보존 폴더로 즉시 가능하다.

### 1차 — 실제 조건 재현 테스트

기존 테스트가 실제 조건을 안 담았다는 Codex 지적(표 11건)을 그대로 테스트 목록으로 쓴다. 코드보다 먼저 쓴다.

- [ ] `hooks/stop.test.js` 신설: 공식 Stop payload 재생 — `background_tasks` 에 subagent 1건 → 통과·출력 없음 / shell 만 1건 → 정상 판정(미충족이면 차단) / manual 만 미충족 → 통과 / 메타데이터만 바뀐 원장 5회 → 2회 차단 뒤 해제 1회, 이후 침묵 / `stop_hook_active` 참 / 필드 없는 구버전 payload 폴백 / 깨진 세션 저장소 → 통과.
- [ ] `hooks/pre-tool-ask.test.js` 추가: 기록 지연(현재 `tool_use_id` 부재) / 2a412ea0 질문 줄까지 재생 / 보고 줄 제거.
- [ ] `hooks/post-tool-progress.test.js` 신설: 두 `session_id` 동시 → 각자 시계 / `agent_id` 호출 무시 / 실제 Workflow 봉투 문자열(산문·구조화 두 철자) → 무장 / 사용자 메시지 뒤 독촉 시각.
- [ ] `hooks/post-tool-task.test.js` 신설: Workflow 봉투 → launched + 이름 / SubagentStop → done / PostToolUseFailure → error / 같은 설명 병렬 2건이 `tool_use_id` 로 각자 연결.
- [ ] `hooks/pre-tool-plan-doc.test.js` 추가: `agent_id` + 서브에이전트 기록 fable → 통과 / 다른 세션 저장소의 fable → 거부 / error 위임 → 거부 / `grade: "deep"`.
- [ ] `hooks/pre-tool-task.test.js`: Workflow 스크립트에 model 없는 `agent(` → 거부 / 61개 → 경고(실제 훅 호출로, 소스 문자열 검사 금지).
- [ ] `lib/gate-ledger.test.js` 추가: schema 2 에서 `source` 없는 exit:0 → unmet / schema 1 에서 같은 증거 → met(종전 판정) / `run` 실행 후 met / `create` 가 exit 127 을 거부 / reopen.
- [ ] `tests/test_codex_review.sh` 신설: 임시 레포에서 커밋 뒤 diff 포함 / 빈 diff → unverified / 타임아웃 → stderr 로그 + unverified. `tests/test_cross_verify.sh` 에 `--out` 케이스.
- [ ] `lib/git-branch-entry.test.js` 추가: 계획서만 dirty → ask 아님 / 삭제된 브랜치 + 병합 커밋 메시지 → merged-deleted.
- [ ] `scripts/user-prompt-handler.test.js`: 공식 `prompt` payload 로 stdin 주입, OVERRIDE 0건·systemMessage 없음·시계 갱신.

### 2차 — /cp 문구와 컴팩션 재주입

`skills/cp/SKILL.md` 만 고친다. 규칙 층위는 안 바꾼다.

- [ ] F1 표시 레인 표(270행): artifact 행을 "**md 파일을 그대로 Artifact 로 발행한다** — 이 문장이 Artifact 도구가 요구하는 '스킬의 md 허용 지시' 다. 페이지를 다시 쓰지 않는다" 로. `artifact-design` 로드 지시·"읽히는 페이지"·"페이지에 담는 것" 블록(276~279행) 삭제. Modify 도 같은 md 를 같은 링크로 재발행.
- [ ] F2 순서: Phase 0 직후 목표·왜·인벤토리 초안을 md 로 저장 → 발행 → **링크를 먼저 보고**(계약 카드에 "첫 링크는 조사 전에" 한 줄) → 조사(에이전트 최대 6, 상한 15분 — 넘기면 있는 것으로 진행하고 보고에 명시) → 어떻게·검증·리스크를 채워 같은 링크 재발행 → Pre-mortem·Codex 레인은 재발행 **뒤** 병렬.
- [ ] E5: TOP 위임은 조사가 끝난 뒤 **'작성만'** 넘기고, `run_in_background: true` 로 띄워 2분 진행보고를 지킨다. 전경 위임 금지 한 줄.
- [ ] F3: 완성·수정 보고 첫 줄 = 링크(계약 카드 8번에 고정).
- [ ] F4: Phase 0 에서 뼈대(목표 N개 + 단계 4개)를 TodoWrite 에 등록, 실행 항목은 인벤토리 행을 10~15개 묶음으로. 22행의 "env 가 빠진 것이다" → "도구 목록에 없으면 deferred 다 — `ToolSearch` 로 `select:TodoWrite` 를 불러온다. 그래도 없으면 env 플래그" 로 교정.
- [ ] B2: 질문창이 거부되거나 글로 물을 때 "선택지 전부와 각 결과를 본문에 다시 적는다 — '위에 정리했다' 금지" 한 줄(계약 카드 8번 아래).
- [ ] F6 `hooks/session-start.js`: `source` 가 `compact`·`fork` 일 때 `additionalContext` 에 "사용자 언어로 답한다(이 사용자는 한국어·존댓말)" 한 줄을 넣는다. startup 경로는 그대로.

### 2차 — /cc·/cd 문구

- [ ] G3 `skills/cc/SKILL.md` Phase 0.5(원장 생성): "측정할 수 있으면 auto 다 — check 는 실행 가능한 명령이어야 하고 `lens-gate create` 가 확인한다. manual 은 차단 사유가 아니며 보고에 '대표 확인 필요: …' 한 줄로만 나간다. 사용자 화면에 게이트·원장·N/M 같은 내부 용어를 쓰지 않는다."
- [ ] G5·B3: 원장 명령 4곳을 `lens-gate` 로, git-branch 2곳을 `lens-cli branch` 로. 825행 manual 기록을 `lens-gate evidence --confirmed-by` 로. 사용자가 글로 답한 것도 확인으로 인정.
- [ ] G7: `lens.config.json` 에 `nonStopActions`(레포별 "멈추지 않아도 되는 행동" 목록, 기본 없음) 추가 — Returns_ERP_v20 에 `staging 배포`·`staging DB 변경`. 65행 정지 표를 "운영 배포·운영 DB 는 항상 멈춘다. staging 은 그 레포 `nonStopActions` 에 있을 때만 멈추지 않는다" 로. harness-rules §4.11 의 정지 3종 정의는 그대로.
- [ ] G8 7.5 자동 커밋: "이 세션의 현황판에 running·launched 워커가 있으면 커밋을 보류하고 보고한다. 워커가 끝난 뒤 커밋." 한 줄.
- [ ] G9 Phase 7: `lens-gate close` 결과의 met 목록으로 계획서 ✅ 표의 통과 칸과 📌 체크박스를 갱신하고 frontmatter `status` 를 `executing → done` 으로, 마지막 커밋 sha 를 `last_tip:` 에 기록(I1 의 판정 근거).
- [ ] I1 `skills/cd/SKILL.md` 113·138행: `lens-cli branch merged` 로 바꾸고, `merged-deleted` 의 새 근거 2종(병합 커밋 메시지·`last_tip`)을 6상태 설명에 추가.

### agentmemory 복구

사장님 지시(2026-09-22): 끄지 말고 제대로 작동하게. 서버는 맥미니(`io.livevil.agentmemory`, 포트 3111)에서 13일째 떠 있고, 이 컴퓨터는 훅·MCP 로 거기에 붙는다.

- [ ] 요약 LLM 연결: 맥미니 `~/.agentmemory/.env` 는 템플릿 그대로(전부 주석)라 공급자가 없다. 텍스트 LLM 규칙(Claude 구독 계정 체인, 메모리 `llm-text-chain-blex-then-sj`)에 맞춰 `AGENTMEMORY_PROVIDER`·`AGENTMEMORY_ALLOW_AGENT_SDK` 등 이 버전이 받는 변수로 Claude 구독 토큰을 연결한다(키는 `livevil-setting/env` 에서, 값은 커밋하지 않는다). 가벼운 모델을 쓴다. 이 버전이 구독 토큰을 못 받으면 우회로: 요약 기능만 끄고(`AUTO_COMPRESS` 끔) 검색·기록은 살린다 — 실패 로그 10,816회가 멈추는 것이 1차 목표.
- [ ] 메모리 상한: 서버가 힙 97%로 "critical" 이다. 노드 힙 상한을 올려(launchd 인자) 재시작하고, 46MB 로그를 회전한다. 재시작 뒤 health 가 `ok`·요약 성공 1건 이상인지 본다.
- [ ] 버전 맞춤: 서버 0.9.27 ↔ 이 컴퓨터 플러그인 0.9.29. 서버를 플러그인 버전에 맞춘다(되돌릴 수 있게 현재 버전 기록).
- [ ] 훅 멈춤 방지: 플러그인 훅에 제한 시간이 없어 서버가 느리면 파일 도구가 최대 10분 멈춘다. 플러그인 파일을 직접 고치면 업데이트 때 덮이므로, 먼저 이 버전의 클라이언트 쪽 제한 시간 변수(`AGENTMEMORY_PROBE_TIMEOUT_MS` 등)로 막고, 없으면 제작자 저장소(rohitg00/agentmemory)에 이슈로 남긴다.
- [ ] 연결 확인: 이 컴퓨터에서 `claude mcp list` 가 agentmemory 연결됨, 훅 1회 호출이 5초 안에 끝남.

### 정리·환경·문서

- [ ] 48: `snapholo-data/.lens/agent-dashboard.json` 에서 `mirroredFrom` 이 있는 위조 항목 제거, `.bak-20260921-planner` 삭제. 그 레포에 다른 세션이 작업 중이면 끝난 뒤.
- [ ] 74: 워크스페이스 루트 `.lens/` 의 `agent-dashboard.json.*.tmp` 38개와 구 상태 파일(현황판·시계·차단 카운터) 삭제 — 새 Lens 는 읽지 않는다.
- [ ] 49 J3b: 9개 레포에서 `.git/info/exclude` 에 `.lens/` 등록 + 추적 해제는 **런타임 상태 파일만** `git rm --cached`(agent-dashboard · progress-report-state · gate-block-state · report-shown · *.tmp). `.lens/verify`·`bench`·`preview`·`type` 등 나머지는 그 레포 `docs/` 에서 경로를 grep 해 참조 0 인 것만 해제 — 추적 해제 커밋을 다른 컴퓨터가 pull 하면 그쪽 작업트리에서 파일이 지워진다(Pre-mortem). 커밋은 각 레포 base 브랜치, 다른 세션 작업 중이면 끝난 뒤, 커밋 전 `git status` 로 타 변경 0 확인.
- [ ] 50 K1: 이 컴퓨터 `~/.claude/settings.json` env 에 `PYTHONUTF8=1` · `PYTHONIOENCODING=utf-8` 만. livevil-setting 에 settings.json 정본은 없다(실측 — 그 폴더엔 manifest·plugins 문서뿐). 다른 컴퓨터는 73행과 함께 보류.
- [ ] 51 K3: 워크스페이스 루트에 `.markdownlint.json` 을 새로 만들어 MD060 등 표·줄 규칙을 끈다(`.vscode/` 는 없다 — 실측. 낮음, 마지막에).
- [ ] 52 메모리: `feedback_hide_internal_gate_prompts.md` 의 "manual 게이트를 넣지 않는다" → "manual 은 차단 사유가 아니고 화면에 안 뜬다(3.48.0) — 측정 가능한 것은 auto 로" 로 고침. `trap-lens-gate-ledger-evidence-contract.md` 의 API·`node -e` 처방 → `lens-gate run` 기준으로.
- [ ] 53 문서: `docs/rules/harness-rules.md` 에 §4.12(세션 상태 저장소·Stop 대기 통과·질문창 판단 보류·lens-gate) 신설, §4.4·§4.7·§4.10·§4.11 의 바뀐 문장 교정. `CLAUDE.md` 버전 노트·모듈 표(session-store · spawn-envelope · lens-gate). `CHANGELOG.md` 3.48.0.

### 릴리스

- [ ] 코드 커밋(기능별로 나눠서) → 전체 테스트 → **푸시 전 실제 재현**: 분기 worktree 를 `claude -p --plugin-dir <worktree>` 로 실어 검증 28·29 를 돌린다. 설치본 3.47.0 이 같이 발화하지 않게 `--settings` 임시 파일로 `enabledPlugins` 의 lens 를 false 로 넘긴다. 그게 안 먹으면 검증 동안 `claude plugin disable lens@CreetaCorp` 뒤 재활성(실행 중 세션은 시작 때 읽은 설정을 유지) → `bash scripts/bump-version.sh 3.48.0` → 범프 커밋 → 태그 `v3.48.0`.
- [ ] **정지(비가역·외부영향): master 푸시 직전 1회 확인.**
- [ ] 푸시 + GitHub Release → 이 컴퓨터 `/lens-upgrade`(36 구현이 확인됐으면 실행 중 세션이 있어도 진행 — 그 세션들은 재시작 때 새 버전) → 설치본 grep(검증 27) → 설치본으로 검증 28 한 번 더 → 메모리 갱신.

### 우회로

- **`background_tasks` 필드가 오지 않는 버전**(`Array.isArray` 가 거짓 — 빈 배열은 "없음" 이지 "모름" 이 아니다): 세션 저장소 `progress.json` 이 무장돼 있고 마지막 신호가 180초 안이거나, 현황판에 이 세션의 `launched`·`running` 이 있으면 대기로 본다 → 통과. 둘 다 아니면 정상 판정. 이 폴백은 테스트로 고정한다.
- **세션 저장소 이전이 기존 원장과 충돌**: 원장은 안 옮기므로 충돌은 카운터뿐이다. 구 `gate-block-state.json` 은 읽지 않는다(카운터가 0부터 시작 — 상한 2회라 최악은 차단 2회). 업그레이드 시점에 실행 중인 세션은 36행 덕에 재시작 전까지 구 훅·구 파일로 계속 돌므로 실행 중 유실은 없다. 재시작 시점의 현황판 launched 유실은 resume 이 이미 백그라운드 작업을 잃는 것(K12)과 같은 크기다.
- **서브에이전트 기록 경로가 예시와 다름**: 위임 기록 폴백만으로 판정(위 E1 항목).
- **SubagentStop 의 `agent_id` 가 봉투 `agentId` 와 다름**: 같은 세션의 가장 오래된 launched 를 푼다(위 D4 항목).
- **`lens-gate create` 의 검사 1회 실행이 너무 느림**: 120초 상한 초과는 "실행 가능" 으로 인정하므로 생성은 막히지 않는다. 부작용이 있는 검사(배포·발송)는 애초에 auto 게이트가 아니다 — 원장 생성 전에 스킬이 걸러야 할 몫이고 G3 문구가 그 규칙이다.

## ✅ 검증

검증 전략: 훅은 공식 이벤트 payload 를 그대로 재생하는 서브프로세스 테스트로, 스크립트는 임시 레포로, 스킬 문구는 grep 으로, 실제 재현은 **푸시 전에** 분기 코드를 `claude -p --plugin-dir` 로 실어 돌리고 푸시 뒤 설치본 grep 과 재현 1회로 다시 본다. 버전 문자열은 증거가 아니다. manual 은 1건.

| # | 됐다는 신호 | 확인 방법 | 통과 | 종류(auto/manual) |
|---|---|---|---|---|
| 1 | 서브에이전트·워크플로가 돌고 있으면 턴 종료를 막지 않고, 상시 작업(shell)만 있으면 정상 판정한다 | `node hooks/stop.test.js` — `background_tasks` 에 subagent 1건 payload / shell 1건만 있는 payload | subagent: stdout `{}`·`decision` 없음·세션 상태 `completed` 아님 / shell 만: 미충족 원장이면 `decision: block` | auto |
| 2 | 사람 확인 조건만 남으면 막지 않는다 | 같은 테스트 — manual 게이트만 미충족인 원장 | `decision` 없음, `awaitingUser` 1건 | auto |
| 3 | 차단·해제 문구가 화면용으로 나가지 않고, 해제는 1회 | 같은 테스트 — 메타데이터만 바뀐 원장으로 Stop 5회 | 출력에 `systemMessage` 0건, 차단 2회 뒤 `additionalContext` 해제 1회, 이후 3회 침묵 | auto |
| 4 | 차단 전에 세션 완료·시계 스탬프를 하지 않는다 | 같은 테스트 — 차단 payload 뒤 세션 저장소 읽기 | `endedAt` null, `lastContactAt` 변화 없음 | auto |
| 5 | 필드 없는 구버전 payload 에서도 대기를 알아본다 | 같은 테스트 — `background_tasks` 키 없음 + 무장된 `progress.json` | 통과 | auto |
| 6 | 보고 뒤 질문창이 뜬다 | `node hooks/pre-tool-ask.test.js` — 2a412ea0 을 질문 줄까지 자른 픽스처 | allow | auto |
| 7 | 기록이 늦으면 판단을 보류한다 | 같은 테스트 — 현재 `tool_use_id` 가 기록에 없는 픽스처 | allow, 사유 없음 | auto |
| 8 | 보고가 진짜 없으면 여전히 막는다 | 같은 테스트 — `tool_use_id` 있고 보고 줄 제거 | deny + 사유 | auto |
| 9 | 두 세션의 진행보고 시계가 섞이지 않는다 | `node hooks/post-tool-progress.test.js` — session_id 두 개 동시 | 각 세션 독촉의 "N초" 가 자기 시계와 일치(±2초) | auto |
| 10 | 서브에이전트 호출이 메인 시계를 안 건드린다 | 같은 테스트 — `agent_id` 있는 payload 20회 | 메인 `progress.json` 변화 없음 | auto |
| 11 | 사용자 메시지가 시계를 갱신한다 | `node scripts/user-prompt-handler.test.js` — 공식 `prompt` payload | `lastContactAt` 갱신, stdout `{}`, OVERRIDE 0건 | auto |
| 12 | Workflow 실제 봉투가 launched 로 기록되고 진행보고를 무장한다 | `node hooks/post-tool-task.test.js` + progress 테스트 — 산문·구조화 두 철자 | 상태 `launched`, 이름 = `name`, `progress.json` 무장 | auto |
| 13 | 완료·실패 이벤트로 launched 가 풀린다 | 같은 테스트 — SubagentStop / PostToolUseFailure payload | `done` / `error`, "All N agents complete" 는 launched 0 일 때만 | auto |
| 14 | 다른 세션이 내 현황판을 초기화하지 않는다 | `node hooks/session-start.test.js` — 두 session_id 로 startup | 서로 다른 폴더, 기존 폴더 불변 | auto |
| 15 | 위임받은 최상위 모델 서브에이전트가 계획서를 쓴다 | `node hooks/pre-tool-plan-doc.test.js` — `agent_id` + 서브에이전트 기록 모델 fable | allow | auto |
| 16 | 다른 세션·실패한 위임은 자격이 아니다 | 같은 테스트 — 다른 세션 폴더의 fable / `error` 위임 | deny | auto |
| 17 | Workflow 스크립트도 모델을 명시해야 한다 | `node hooks/pre-tool-task.test.js` — model 없는 `agent(` / 61개 | deny / 경고(차단 아님) | auto |
| 18 | 새 원장의 증거는 Lens 가 검사를 돌려야 통과고, 업그레이드 전 원장은 뒤집히지 않는다 | `node lib/gate-ledger.test.js` — schema 2 원장에 API 로 exit:0 만 넘김 / `lens-gate run` / schema 1 원장에 API 로 exit:0 | unmet / met / met | auto |
| 19 | 실행 불가한 라벨은 원장이 되지 않는다 | `node scripts/lens-gate.js create` 에 check "live probe cards first" | 생성 거부, 게이트 id 지목 | auto |
| 20 | 포기한 게이트를 되살릴 수 있다 | `lens-gate abandon` → `reopen` → `run` | 마지막 상태 met, `reopenedAt` 존재 | auto |
| 21 | 원장 코드에 제어 바이트가 없다 | `grep -c -P '[\x00\x01]' lib/gate-ledger.js` | 0 | auto |
| 22 | 커밋 뒤에도 전체 diff 를 검토하고, 빈 diff 는 검증 못 함이다 | `bash tests/test_codex_review.sh` — 임시 레포 커밋 뒤 review / 변경 0 | diff 에 커밋 내용 포함 / `verdict: unverified` | auto |
| 23 | 인자 불일치와 타임아웃 원인 불명이 없다 | `bash tests/test_cross_verify.sh` — `--out` 전달 / 1초 timeout | exit 0 / `<out>.stderr.log` 존재 + `unverified` | auto |
| 24 | 삭제된 브랜치도 병합 판정이 난다 | `node lib/git-branch-entry.test.js` — 임시 레포 `merge --no-ff` 후 브랜치 삭제 | `merged-deleted` + 근거 | auto |
| 25 | 훅 제한 시간이 초 단위다 | `node -e` 로 `hooks/hooks.json` 의 모든 timeout 읽기 | 전부 ≤ 90 | auto |
| 26 | 상태 파일이 git 에 잡히지 않는다 | 임시 git 레포에서 훅 1회 실행 후 `git status --porcelain` | 0줄, `info/exclude` 에 `.lens/` | auto |
| 27 | 설치본이 수정본이다 | `grep -c "background_tasks" ~/.claude/plugins/cache/CreetaCorp/lens/3.48.0/hooks/stop.js` · `grep -c "tool_use_id" …/hooks/pre-tool-ask.js` · `ls …/scripts/lens-gate.js` | 각 ≥1, 파일 존재 | auto |
| 28 | 새 세션에서 백그라운드 에이전트를 띄우고 턴을 끝내도 문구가 없다 — **푸시 전** 분기 코드로, **푸시 뒤** 설치본으로 | 푸시 전: `claude -p --plugin-dir <분기 worktree> --settings <lens 비활성 임시 설정> --model haiku` 새 세션에 "백그라운드 Explore 1개 띄우고 턴 종료" 지시 / 푸시·설치 뒤: 같은 지시를 설치본으로. 출력 전문 grep | 두 번 다 "완료 조건"·"자동 해제"·"[Lens]" 0건 | auto |
| 29 | 두 세션 동시 실행에서 독촉 시각이 맞는다 | **푸시 전** `claude -p --plugin-dir <분기 worktree>`(28 과 같은 비활성 설정) 두 프로세스 동시(각각 백그라운드 Bash 3분), 각 출력의 "N초" 와 벽시계 대조 | 차이 ≤ 10초 | auto |
| 30 | 파이썬이 한글을 출력한다 | 새 셸에서 `python -c "print('한글')"` | 오류 없음 | auto |
| 31 | 잔여물과 추적이 정리됐다 | `snapholo-data/.lens/agent-dashboard.json` 에 `mirroredFrom` grep · 9개 레포에서 `git ls-files .lens` 출력 중 런타임 상태 파일(agent-dashboard · progress-report-state · gate-block-state · report-shown · .tmp) 개수 · 워크스페이스 `.lens/*.tmp` 개수 | 0 · 0 · 0 | auto |
| 32 | 스킬 문구가 바뀌었다 | `grep -c "artifact-design" skills/cp/SKILL.md` · `grep -c "node -e" skills/cc/SKILL.md skills/cd/SKILL.md` · `grep -c "nonStopActions" skills/cc/SKILL.md` · `grep -c "ToolSearch" skills/cp/SKILL.md` | 0 · 0 · ≥1 · ≥1 | auto |
| 33 | 컴팩션 뒤 언어 규칙이 재주입된다 | `hooks/session-start.js` 에 `source: compact` payload | `additionalContext` 에 "사용자 언어" 포함 | auto |
| 34 | 회귀 없음 | 변경 전후 `node --test hooks/*.test.js lib/*.test.js scripts/*.test.js` + `bash tests/*.sh` + `python scripts/cu.test.py` | 전부 PASS, 변경 전 통과 수 ≤ 변경 후 | auto |
| 35 | 메모리 2건이 새 동작을 말한다 | 두 메모리 파일에 `3.48.0` 과 `lens-gate` grep | 각 ≥1 | auto |
| 37 | agentmemory 가 제대로 작동한다 | 맥미니 `curl -H "Authorization: Bearer …" :3111/agentmemory/health` + 서버 로그 + 이 컴퓨터 `claude mcp list` | health `ok`(critical 아님), 재시작 뒤 요약 실패 0·성공 ≥1(또는 우회로 채택 시 요약 호출 0), MCP 연결됨 | auto |
| 36 | 다음 /cp 승인 질문창이 뜬다 | 이 릴리스 다음 /cp 의 승인 단계 | 질문창이 화면에 뜬다 | manual |

## 🚫 건드리지 않는 것

- `lib/gate-ledger.js` 의 `MAX_BLOCKS`(2)·`STALE_HOURS`·`gateState` 의 manual 판정 규칙 — 상한과 상태 정의는 그대로, 키·증거 출처만 바뀐다.
- `.lens/gates/` 원장 파일의 위치와 schema 1 원장의 판정 규칙 — /cd 와 색인이 읽는 계약. schema 2 는 `lens-gate create` 가 새로 만드는 원장에만 붙는다.
- `lib/plan-manager.js` 의 `REQUIRED_SECTIONS`·`SECTION_ALIASES`·커버리지·Todo 파생 — 계획서 계약 그 자체.
- `docs/rules/harness-rules.md` §4.11 의 정지 3종 정의와 "항상 멈추는 행동" 목록 — G7 은 레포별 예외 목록을 더할 뿐이다.
- `hooks/pre-tool-ask.js` 의 허용 header 6개와 40자 기준 — 판단 시점만 고친다.
- `scripts/delegate.sh`·`scripts/sync-pull.js`·`scripts/cu.py`·`lib/install-sync.js` — Codex 조건부 지적은 관측 0건(61행).
- `skills/cc/SKILL.md`·`skills/cp/SKILL.md`·`skills/cd/SKILL.md` 의 위 항목 외 절 — 본문 축소는 별도 계획(58행).
- 각 레포 `docs/**/*.html`·`.lens/pr-cache.json` 등 지난 릴리스가 남긴 파일 — 이번 범위 밖.

## ⚠️ 리스크

deep 권고: 다중 시스템(모든 컴퓨터·모든 세션의 훅) — 등급은 기본이지만 훅은 설치된 모든 컴퓨터의 모든 세션에 걸린다. 롤백 수단(이전 버전 재설치)이 있어 기본으로 두되, 아래 첫 두 행은 deep 수준으로 다룬다.

| 심각도 | 무엇이 잘못되나 | 트리거 | 대응 | 중단 조건 | 출처 |
|---|---|---|---|---|---|
| 치명 | 새 Stop 로직의 버그가 모든 컴퓨터의 세션을 가둔다 — 통과해야 할 턴을 막거나 예외로 죽는다 | 세션 저장소 읽기 실패·판정 예외·잘못된 block | fail-open 원칙(모든 예외 경로 → 통과, 테스트 5·회귀 34), `MAX_BLOCKS` 2 유지, 킬스위치 `LENS_GATE_ENFORCEMENT=0`, 최후 안전망은 Claude Code 의 연속 8회 차단 뒤 강제 종료 | **푸시 전** 검증 28(분기 코드를 `--plugin-dir` 로 실행)에서 차단·해제 문구가 1회라도 나오면 푸시하지 않는다. 푸시·설치 뒤 재검증 28 이 실패하면 롤백 | A · Codex 1위 · Pre-mortem |
| 높음 | 백그라운드 통과가 상시 작업(개발 서버·Monitor·/loop)에 걸려 그 세션에서는 게이트가 영원히 안 걸린다 | `shell`·`monitor` 타입 작업이 세션 내내 떠 있음 | 통과 대상을 `subagent`·`workflow`·`teammate`·`cloud session` 으로 한정, `shell`·`monitor`·`MCP task` 는 대기로 안 침(테스트 1) | — | Pre-mortem |
| 높음 | 새 증거 규칙이 업그레이드 전에 열린 원장을 미충족으로 뒤집어 직후 재차단된다 | 열린 원장(API 로 증거를 넣은 schema 1)이 있는 채 업그레이드 | 원장 schema 2 를 도입하고 새 규칙은 `lens-gate create` 원장에만, schema 1 은 종전 판정(테스트 18) | — | Pre-mortem |
| 높음 | 업그레이드가 실행 중 세션의 훅 경로(캐시 폴더)를 지워 그 세션의 훅이 조용히 꺼진다(non-blocking error) | 다른 세션이 도는 중에 `/lens-upgrade` | 36행(직전 버전 폴더 보존) — 실행 중 세션은 재시작 전까지 3.47.0 훅으로 계속 돈다 | 36 구현이 확인되지 않았으면 실행 중 세션 없을 때만 업그레이드 | Codex 조건부 · Pre-mortem |
| 높음 | 상태 저장소 이전 중 진행 중 실행의 현황판·차단 카운터가 유실된다 | 업그레이드 시점에 실행 중 /cc | 원장은 옮기지 않음(유실 대상은 세션 시작 시 재생성되는 4개 파일뿐), 구 파일은 코드가 지우지 않음, 36행 덕에 실행 중 세션은 구 훅·구 파일을 계속 씀 — 신구 공존 안전(구 훅은 레포 수준 상태, 새 훅은 세션 저장소, 서로 안 읽음) | 36 미구현이면 실행 중 /cc 세션 없을 때만 | C · 우회로 · Pre-mortem |
| 중 | 스킬 문구 변경이 사장님 기존 규칙(무정지 실행·보고 먼저)과 충돌한다 | G3(manual 비차단)·G7(staging 예외)·B2 | 정지 3종·"항상 멈추는 행동" 정의는 불변, staging 예외는 `nonStopActions` 에 적힌 레포만, 보고 먼저 규칙은 훅의 판단 시점만 고침. Supervisor+Codex 검토가 §4.11 위반을 짚으면 그 문구는 되돌린다 | 검토 지적 high 1건 이상이면 2차 문구는 다음 릴리스로 분리 | G3 · G7 · §4.11 |
| 중 | 질문창 판단 보류로 "보고 먼저" 규칙을 훅이 거의 판정하지 못한다 — 공식 문서상 기록은 보통 늦게 써진다 | 기록 지연(상시) | 받아들인다 — 지금은 질문창 자체가 안 뜬다. 규칙은 /cp 계약 카드 8번(스킬 문구)이 담당하고 훅은 기록이 있을 때만 판정한다 | — | B1 · Pre-mortem |
| 중 | `.lens` 추적 해제 커밋을 다른 컴퓨터가 pull 하면 그쪽 작업트리에서 파일이 삭제된다 — 계획서·기록이 참조하는 검증 산출물(`verify`·`bench`·`preview`·`type`)이 사라질 수 있다 | J3b 커밋 pull | 해제 대상을 런타임 상태 파일로 한정, 나머지는 `docs/` 참조 grep 뒤 참조 0 인 것만(49행) | 참조가 있는 파일은 추적 유지 | Pre-mortem |
| 중 | 동시 실행 중인 다른 세션의 레포(snapholo 등)에서 J3b 추적 해제 커밋이 그 세션의 변경과 섞인다 | 다른 세션이 작업 중인 레포에 커밋 | 49행 조건(끝난 뒤), 커밋 전 `git status` 로 타 변경 0 확인, `.lens` 만 스테이징 | 타 변경이 있으면 그 레포는 건너뛰고 보고 | J3 |
| 중 | `background_tasks` 폴백이 오판한다 — 대기를 완료로(차단 재발) 또는 완료를 대기로(원장이 안 닫힘) | 필드 없는 Claude Code 버전 | 폴백 근거 2개(무장된 시계·launched), 테스트 5 | — (오판은 상한 2회로 제한됨) | A1 · 우회로 |
| 중 | SubagentStop 의 `agent_id` 가 봉투 식별자와 달라 launched 가 안 풀린다 | 식별자 불일치 | 구현 전 실측 1회, 불일치면 시간순 폴백 | — | D4 |
| 중 | Codex 검토 범위가 커져(커밋 포함 300~650KB) 타임아웃이 잦아진다 | 큰 커밋 뒤 review | `.lens/`·생성물 제외, 파일당 60000바이트 상한 유지, 타임아웃은 `unverified` 로 정직하게 | — | H1 · H3 |
| 낮 | `lens-gate create` 의 검사 1회 실행이 느린 테스트를 두 번 돌린다 | auto 게이트가 전체 테스트 | 120초 상한, 초과는 실행 가능으로 인정 | — | G2 |
| 중 | agentmemory 요약이 켜지면 세션마다 Claude 구독 사용량을 쓴다 | 요약 LLM 연결 | 가벼운 모델, 요약만(자동 주입은 끈 채), 하루 사용량을 health 지표로 확인 | 구독 한도 경고가 뜨면 요약만 끄고 검색·기록은 유지 | 대표 지시 · 실측 |
| 중 | 맥미니 agentmemory 재시작 중 모든 컴퓨터의 기록이 잠깐 끊긴다 | 힙 상한 변경·버전 맞춤 재시작 | 재시작은 한 번에 묶고 수십 초 안에 끝냄, 훅은 실패해도 작업을 막지 않음 | health 가 5분 안에 안 돌아오면 이전 설정으로 되돌림 | 실측 |
| 낮 | 세션 저장소가 누적된다 | 세션 수 | startup 에서 7일 지난 폴더 정리 | — | 세션 저장소 |

## 🔀 합성

- **합의(Claude 조사 5개 + Codex 감사 독립)**: 상태 파일 세션 분리(C), Stop 게이트 재설계(A), 질문창 기록 지연(B1), Workflow 완료 오기록(D1), 빈 diff PASS(H1 — Claude 두 세션이 각자 발견), 계획서 작성자 판정(E1).
- **Codex 만**: timeout 단위(J1 — 공식 문서로 확인), user-prompt-handler 입력(J2 — 대화 기록 OVERRIDE 0건으로 확인), Workflow 진행보고 분기(D3 — 코드로 확인), 업그레이드 캐시 삭제(36 — 조건부, 실측 뒤 정책 변경), 테스트가 실제 조건을 안 담음(54 — 그대로 테스트 목록으로 채택).
- **분기 → 해소**: 사전 스캔의 "해제 184회" 를 18f26c40 조사 에이전트가 5회로 정정(메인 기록만 셈) — 이 계획서는 에이전트가 원문 대조한 숫자만 쓴다(09-21 ea3dcf2b 52회는 원문 대조 수치). 사용자 정정("HTML 때문에 느리다" 는 오진)은 F2 에 그대로 반영 — 원인은 조사와 최상위 모델 작성·중계다.
- **관제 Pre-mortem 반영(9건)**: 백그라운드 통과 타입 한정 · 질문창 판단 보류의 대가(훅은 기록이 있을 때만 판정, "보고 먼저" 는 사실상 스킬 계약 카드 8번이 지킨다 — 받아들임) · 원장 schema 2 분리 · `.lens` 추적 해제 범위 한정 · 푸시 전 `--plugin-dir` 재현 · 실행 중 세션이 있어도 업그레이드(36 전제) · settings 정본·`.vscode` 사실 교정 · Workflow 이름 호출 건너뜀.
- **이 계획서가 브리프와 다르게 판단한 것**: ① 74행 신규(워크스페이스 `.lens/` `.tmp` 잔해 38개) ② G5 의 CLI 를 원장용 `lens-gate` 와 얇은 래퍼 `lens-cli` 둘로 나눔 — 원장 명령과 브랜치·계획서 명령은 소비자가 다르다 ③ 36 은 "확인" 에서 그치지 않고 직전 버전 폴더 보존을 기본 정책으로 제안 — 롤백 수단이기도 하다 ④ G2 의 검사 1회 실행에 120초 상한과 "초과는 실행 가능" 규칙을 둠.

## 🧭 결정

- 이 계획대로 진행할까 → 지금 실행 (2026-09-22, 채팅)
- agentmemory 플러그인 끄기 / 유지 → 끄지 않는다. 왜 실패하는지 찾아 제대로 작동하게 한다 (2026-09-22, 채팅 — "agentmemonry는 제대로 작동을 안하면 되게 해야지"). 아래 옛 추천(끄기)은 채택되지 않았다 — 추천: 끄기. 지금 서버 연결이 실패해 기록은 안 쌓이면서 파일 도구가 최대 10분 멈추는 위험(제한 시간 없음)만 남았다. 데이터로 못 정하는 이유: 사장님이 이 기록을 얼마나 쓰는지는 대화 기록에 없다.

## 🚀 롤아웃·롤백

- **멈추는 곳**: creeta-lens master 푸시 직전 1회(정지:비가역·외부영향 — 모든 컴퓨터가 받는 배포). 그 외 없음(다른 레포의 추적 해제 커밋·이 컴퓨터 설정은 되돌릴 수 있다).
- **순서**: `fix/lens-runtime-fixes` 에서 테스트 먼저 → 코드 커밋 → 전체 테스트 전후 통과 → Supervisor+Codex 검토(`cross-verify.sh --mode review --base master`) → **푸시 전 실제 재현**(검증 28·29 를 `claude -p --plugin-dir <분기 worktree>` 로, 설치본은 `--settings` 로 비활성) → 범프 3.48.0·태그 → **정지** → 푸시·Release → 이 컴퓨터 `/lens-upgrade` → 설치본 grep(검증 27) → 설치본으로 검증 28 재실행 → 정리·메모리.
- **실행 중 세션과의 공존**: 36행(직전 버전 폴더 보존)이 확인되면 실행 중 세션이 있어도 업그레이드한다 — 사장님은 세션을 상시 병렬로 돌리므로 "세션 없을 때" 는 오지 않는다. 그 세션들은 재시작 때 새 버전을 받는다. 신구 훅 공존이 안전한 이유: 구 훅은 레포 수준 `.lens/` 상태를, 새 훅은 세션 저장소를 읽어 서로의 파일을 건드리지 않고, 원장은 schema 1·2 모두 구 훅이 읽는다(구 `loadLedgers` 는 `gates` 배열만 검사 — 현 코드 확인).
- **롤백 트리거**: 검증 27~29 중 하나라도 실패 / 설치 뒤 첫 세션에서 차단·해제 문구가 화면에 뜸 / 훅 오류 알림("hook error") 이 세션 시작에 뜸.
- **롤백 방법**: ① 이 컴퓨터 — 36행으로 보존된 3.47.0 캐시 폴더로 `installed_plugins.json` 의 버전을 되돌리고 재시작(즉시). ② 모든 컴퓨터 — master 에 되돌리기 커밋 + 3.48.1 태그를 릴리스 절차 그대로(다른 컴퓨터는 이 태그를 받는다).
- **다른 컴퓨터**: 보류(73행). macmini MCP 연결이 실패 중이라 접근을 확인한 뒤 각 컴퓨터에서 `/lens-upgrade` 와 검증 27 을 반복한다. 그전까지 다른 컴퓨터는 3.47.0 그대로 돈다 — 새 훅과 구 훅이 같은 레포의 `.lens/gates/` 원장을 함께 읽어도 schema 1·2 모두 구 훅이 읽으므로 깨지지 않는다.

## 진행상황

- **작업 브랜치**: `fix/lens-runtime-fixes` — 2026-09-22 이 계획의 실행이 `origin/master` 위에서 생성. 시작 SHA `b71e466`.
- **마지막 업데이트**: 2026-09-22
- **현재 경로**: 권장 경로
- **기준선(변경 전)**: node 테스트 파일 12개 전부 통과 · cross-verify 13 · delegate 22 · git-sync 110 · cu 71

### 편차 기록 (계획 ↔ 실제)
- 이번 실행은 완료 조건 목록(게이트 원장)을 만들지 않는다 → 설치된 3.47.0 의 종료 검사가 바로 이 계획이 고치는 결함(대기 중 차단·사장님 화면 문구)이라, 만들면 실행 내내 사장님 화면에 차단 문구가 뜬다(메모리 `feedback_hide_internal_gate_prompts` — 사장님 지시가 스킬 기본값보다 우선). 대신 검증 표 37행을 실행하고 증거를 최종 보고에 싣는다.
- 위임 기록 전용 파일(`delegations.json`)은 만들지 않고 세션 현황판(`dashboard.json`)의 에이전트 기록을 그대로 읽는다 → 같은 정보를 두 곳에 쓰지 않기 위해(단순화). 세션 저장소 파일은 3개(progress·dashboard·blocks).
