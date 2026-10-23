---
plan_id: 2026-10-23-control-mode-approval-loop
planner: cp
planner_model: fable (세션 위임)
kind: 개선
grade: 기본
created: 2026-10-23
status: executing
status_at: 2026-10-23T21:18:27.184Z
waiting_on: "대표 승인: v3.53.0 태그·Release · 대표 확인 4건"
approved_at: 2026-10-23T23:52+09:00
approved_via: artifact + AskUserQuestion
approval_note: "[d1] 이번 계획으로 흡수하고, 그 계획은 1단계만 끝난 것으로 마감 (추천) · [d2] 네 가지 조건을 다 만족할 때만 생략 (추천) · [approve] 지금 실행"
repo: creeta-lens
base: master
branch: feat/control-mode-approval-loop
pr: null
last_tip: 6d99389780a84c049edf600a717f027925ab4db0
refs: [https://claude.ai/artifact/LDAd7pY2twdYyb1eU6aY6j, docs/tasks/2026-10-23-control-mode-approval-loop.research.md, docs/tasks/2026-10-03-shared-plan-channel.md, docs/tasks/2026-09-14-cc-nonstop-execution.md]
shown: https://claude.ai/artifact/UjNe5owEnFx8M8sRPx5eqw
---

# Lens 관제 모드 · 일괄 마감 · 한 단어 승인 · 멈춘 계획 알림

문제: 대표는 관제 세션 1개 + 역할 세션 여럿으로 일하는데, Lens 는 한 세션 안의 계획→실행만 알고 관제 규칙은 메모리 파일 손 규칙으로만 돈다. 승인된 계획이 중간에 멈춰도 아무도 모르고, 채팅 한 단어·일부 범위 승인은 스킬이 정식으로 받지 못한다.
해야 할 것: 관제 명령 /ct 신설 · /cd 를 관제에서 한 번에 끝난 세션만 마감 · /cp 승인을 한 단어·부분·생략까지 정식화 · /cc 가 시작·끝·멈춤을 계획서에 남기고 멈춘 계획을 세 곳 첫 줄에 보이기 · 계획서 작성 모델을 등급별로.
대표 결정: 확정 1건(계획서 모델 = 난이도 배분) · 물을 것 2건(d1 공용 계획 채널 겹침 처리 · d2 승인 질문 생략 조건).

## 🔁 이번 판에서 바뀐 것

Codex 사전 부검(.lens/verify/premortem-codex.out) 15건 전부 반영 — 인벤토리 34→42행, 단계 24→26, Blocker 0→1.

- 부분 승인이 실행 목록까지 이어진다 — 단계에 인벤토리 행 번호, 미승인 행만 가진 단계·검증·목표는 파생에서 제외(「/cc 변경 없음」 폐기, B2).
- 원장 닫힘 ≠ 목표 완료 — 미충족·포기·무효 전부 0일 때만 done(A2). 세션이 꺼져 executing 이 남으면 /ct 점검이 세션 목록과 대조해 즉시 멈춤 후보(A3·E5) · Done 문장 수정.
- 세션 시작은 스캔 캐시만, 「Recent Plans」도 같은 캐시(정본 하나, A4) · lens-cli 라우팅 정리(A5).
- /cd 일괄: 승인된 정확한 가지·워크트리 목록을 마지막 정리까지, pr-manual 은 In Review, 묶음 승인이 정지 지점(D2·D4).
- 관제: 표식은 참여 세션만 거부(E7) · 관제판은 기존 질문 블록 전송 재사용 + 승인 전달 5요소(E4) · 관제 모드면 /cc 가 /cd 를 안 부름(E8) · /ct 는 Claude Code 전용(E1).
- parked 를 승인 뒤 상태 목록에, 모델 게이트 Edit 경로·opus 위임·남은 TOP 문구(C), 릴리스 뒤 머신별 업그레이드 확인(F2·검증 18). d2 는 미결정 그대로(B3).

## 🎯 목표

- 대표가 관제 세션에 한 번 말하면 관제가 역할 이름이 붙은 세션들에 일을 나누고, 보고 6줄을 모으고, 결정을 관제판 한 장에 모아 받아 답을 전달한다.
- 관제에서 한 번 부르면 끝난 세션의 계획만 마감되고, 정리 결과가 폴더·가지·워크트리 수 전→후 숫자로 남는다.
- 대표가 채팅에 한 단어나 행 번호로 답해도 그대로 승인되어 실행되고, 결정할 것이 없는 계획은 승인 질문 없이 바로 간다.
- 승인된 계획이 중간에 멈추면 관제 점검·계획 목록·세션 시작 첫 줄에 「멈춘 계획 N건 — 어디서」가 보인다.
- 계획서는 등급에 맞는 모델이 쓴다 — 기본 등급은 상위 모델 세션이 직접, 되돌리기 어려운 deep 만 최상위.

Done: 관제 세션에서 「서버·수집 세션에 이 일 나눠」 → 두 세션이 [이름] 보고 6줄을 관제에 보내고, 관제판에 결정이 모이고, 대표가 채팅에 「a」로 답하면 해당 세션이 실행하며, 실행 중이던 세션이 꺼지면(그 계획을 맡은 세션이 세션 목록에 없거나 쉬는데 상태는 실행 중) 다음 /ct 점검 첫 줄에 「멈춘 계획 1건 — 체크 3/8 · 재개 포인트 …」가 뜬다.

## ❓ 왜

2주(10-12~23) 대표 지시 1,641건 분석: 세션 배정·감독·마감 지시 약 90회가 Lens 밖(메모리 손 규칙 45줄)에서 돌았고, 한 단어 승인 약 77회·부분 승인 약 10회를 /cp 가 정식으로 받지 못했다. SJ-ROG 계획서는 승인 7·실행 중 2 가 멈춘 채 완료 1뿐이고(마케팅 daily 0/7), 이 레포에도 멈춘 계획이 4건 남아 있다. 대표 원문: 「관제 시스템 맞아?」(10-23) · 「작업자들이 껐다 켜서 다들 하다가 말았어」(10-16) · 「Goal 0/7 … 왜 진행 안되고 있는데?」(10-23). 안 하면 대표가 계속 관제 노릇을 손으로 하고, 멈춘 계획이 며칠씩 묻히며, fable 강제 규칙이 기본 등급 계획마다 토큰을 태운다.

## AS-IS → TO-BE

| 항목 | 지금(실측) | 바뀐 뒤 | 근거 |
|---|---|---|---|
| 관제 | 메모리 파일 손 규칙 45줄 · 레포에 ListAgents 사용 0건 | /ct 스킬 하나 — 세션 표·역할 배정·보고 6줄·관제판·주기 점검·재시작 복구 | 조사 D · 메모리 정본 |
| 작업 세션의 대표 질문 | 관제 모드여도 각 세션이 질문창을 띄움(훅에 관제 개념 0건) | 관제 표식이 켜져 있으면 작업 세션 질문창을 훅이 거부하고 「관제로 보내라」 안내 | 조사 B |
| /cd | 한 레포·한 세션 · 정리는 레포 전체 · 숫자는 텍스트 · 종료 코드 0 ≠ 전부 정리 | 관제에서 한 번: 세션별 읽기 전용 판정 → 끝난 것만 묶음 승인(정지 지점) · 정리는 승인된 가지·워크트리 목록만 · 결과 JSON 으로 전→후 숫자 · pr-manual 은 In Review | 조사 C · codex |
| 승인 | 선택지 셋·산문뿐 · 한 단어·부분 승인 규칙 없음 | 직전 턴이 승인 질문이면 한 단어·번호 = 그 선택지 · 「일부만 실행」= 행 번호 → 나머지 행과 그 행만 가진 단계·검증은 실행 목록에서 빠짐 · 채팅 선택지 한 줄 | 조사 A·B · codex |
| 계획 상태 | /cc 는 끝날 때 done 한 줄만 · 시작·중단 기록 없음 · 「계획만 보관」도 approved | 시작 executing · 끝 done(미충족·포기·무효 전부 0)/blocked(+사유) · 보관 parked · 대기 사유 칸 | 조사 B·D·E · codex |
| 멈춘 계획 노출 | /cp 인자 없음 스캔은 산문 · 코드 0 | plan scan 명령 → /cp 인자 없음 · /ct 점검(맡은 세션 없음·idle 이면 즉시) 첫 줄 · 세션 시작은 스캔 캐시 한 줄 「멈춘 계획 N건 — 어디서」 | 조사 B · codex |
| 계획서 작성 모델 | 등급 무관 fable 강제(훅) | 기본 = opus 이상 세션이 직접 · deep = fable | 대표 10-23 확정 |

## 📋 작업 인벤토리

| # | 작업 항목 | 출처 | 반영 위치 | 상태 |
|---|---|---|---|---|
| 1 | 관제 모드 새 명령 — ListAgents/SendMessage 로 여러 세션 묶기 | 요청 ① | 어떻게 E1 · /ct 스킬 | 포함 |
| 2 | 역할 이름 배정(이름=세션 표, 보낼 때마다 ListAgents 재확인) | 요청 ① | 어떻게 E2 | 포함 |
| 3 | 역할 기준 배분(idle 우선 · 같은 레포 동시 금지 · 새로 뜬 세션은 대표 입력 확인 뒤) | 요청 ① | 어떻게 E2 | 포함 |
| 4 | 보고 6줄 수집 — 배정 지시문 기본 문안에 포함 | 요청 ① | 어떻게 E3 | 포함 |
| 5 | 관제판 한 장에 결정 모으기 · 대표 답 전달 — 기존 질문 블록 전송 경로 재사용, 새 답 DB·깨우기 안 만듦 | 요청 ① · codex | 어떻게 E4 | 포함 |
| 6 | 주기 점검(배정대로 하는지 · 워크트리 겹침 · waiting · 관제판 답) | 요청 ① | 어떻게 E5 | 포함 |
| 7 | 재시작 뒤 재지시(이름 재매핑 · 하던 일 식별 · 완주 지시) | 요청 ① | 어떻게 E6 | 포함 |
| 8 | 메모리 손 규칙을 스킬로 옮김(Lens 고유 계약만, 네이티브 일반 규칙 복붙 금지) | 요청 ① · 하네스 규칙 | 어떻게 E1~E6 | 포함 |
| 9 | /cd 일괄 마감 — 세션별 남은 일 판정 후 끝난 세션만(레포 간 병렬 · 같은 레포 직렬) | 요청 ② | 어떻게 D1·D4 | 포함 |
| 10 | 정리 결과 폴더·가지·워크트리 수 전→후 증명(결과 JSON) | 요청 ② | 어떻게 D2 | 포함 |
| 11 | Notion 작업 상태·운영 반영 확인 — 확인 항목 보고까지, 쓰기는 Notion 연결 있을 때만 | 요청 ② | 어떻게 D4 | 포함 |
| 12 | 채팅 한 단어 승인 정식 인정(직전 턴이 승인 질문일 때만) | 요청 ③ | 어떻게 B1 | 포함 |
| 13 | 행 번호·범위로 부분 승인 — 「일부만 실행」 선택지 · 미승인 행은 보류 · 그 행만 가진 단계·검증·목표는 실행 목록에서 제외(파생 함수 수정) | 요청 ③ · 09-14 보류 항목 · codex 재현 | 어떻게 B2 | 포함 |
| 14 | 결정할 게 없으면 승인 질문 생략 | 요청 ③ | 어떻게 B3 · 🧭 d2 | 포함 |
| 15 | 관제 모드면 질문은 관제판으로 | 요청 ③ | 어떻게 B4 · E4 | 포함 |
| 16 | 페이지 블록이 안 보일 때 채팅에도 선택지 한 줄 | 요청 ③ | 어떻게 B1 | 포함 |
| 17 | /cc 종료 시 계획서 상태 갱신 강제(시작 executing · 끝 done/blocked+사유 · 취소 구분) | 요청 ④ | 어떻게 A1·A2 | 포함 |
| 18 | 멈춘 계획을 /cp 인자 없음 · 관제 점검 첫 줄에 「N건 — 어디서 멈췄나」 | 요청 ④ | 어떻게 A3·A4 | 포함 |
| 19 | 계획서 작성 모델을 난이도로 — 기본 등급은 opus 이상이면 세션이 직접, deep 은 fable · 5.0 게이트 표 등 남은 TOP 강제 문구 전부 · Edit 경로·opus 위임 기록 판정 | 대표 10-23 추가 지시(확정) · codex | 어떻게 C1·C2 | 포함 |
| 20 | 관제 표식(참여 세션 id·범위·소유 관제) + 질문창 훅이 참여 세션만 거부(만료 · 관제 부재 시 통과 · 탈출구) | 조사 B · codex | 어떻게 E7 | 포함 |
| 21 | 「계획만 보관」을 approved 와 구분되는 parked 로 — 멈춤 오탐 방지 | 조사 D 불일치 1 | 어떻게 A2·B3 | 포함 |
| 22 | 세션 시작 한 줄 알림 — 스캔 캐시 읽기만(캐시 시각 표시 · compact/fork 제외 · 직접 스캔 없음) | 조사 B · codex | 어떻게 A4 | 포함 |
| 23 | 대기 사유 칸 waiting_on — 정당한 대기와 방치 구분 | 조사 E | 어떻게 A1·A3 | 포함 |
| 24 | /cd 정리 범위를 그 계획 가지·워크트리로 제한(다른 세션 워크트리 보호) | 조사 C 위험 ① | 어떻게 D2 | 포함 |
| 25 | /cd 가 autoDeleteMergedBranch 를 마지막 정리에서도 존중 · git add 는 그 계획 경로만 | 조사 C 위험 ③④ | 어떻게 D3 | 포함 |
| 26 | /cd 질문 header 를 질문창 훅 허용 목록에 추가 | 조사 C 위험 ⑤ | 어떻게 E7 | 포함 |
| 27 | 질문 블록 JSON 깨짐 방어(try + 안내 문구) — 10-20 「클릭도 안 되는데」 증상 대비 | 조사 B | 어떻게 B5 | 포함 |
| 28 | /ct 배선(CLAUDE.md 스킬 표 · README · START_HERE · harness-rules · bump 배너) + v3.53.0 릴리스 | 조사 D 선례 | 어떻게 F | 포함 |
| 29 | 공용 계획 채널 계획(10-03) 인벤토리 #21·A5 세션 시작 알림과 겹침 처리 | 조사 D · d1 답 | 어떻게 A2·A4(흡수) · 실행 끝에 그 계획을 /cd 로 1단계 완료 마감 | 포함 |
| 30 | 메모리 파일에 「정본은 /ct 스킬」 포인터 한 줄 | 요청 ① 후속 | — | 보류: 다른 레포(livevil-setting) — 이 계획 /cd 뒤 관제 세션이 한 줄 |
| 31 | 보고만 하는 별도 감시 에이전트 | 조사 D | — | 제외: 2026-08-07 하네스 감축 결정과 충돌 — 진행보고 책임은 관제 세션 본인 |
| 32 | 승인 후 꺼진 세션을 자동으로 다시 실행 | 조사 D | — | 제외: 2026-10-03 기각 — 멈춘 계획은 알리기만, 재지시는 관제(E6)가 한다 |
| 33 | Stop 훅의 강제 재개·반복 차단으로 멈춤 방지 | 조사 D | — | 제외: 하네스 규칙이 부활 금지 — 알림은 세션 시작·점검 첫 줄로만 |
| 34 | 관제·부분 승인·멈춤 일수용 lens.config.json 새 키 | 조사 D | — | 제외: 요청에 없는 설정 가능성 — 멈춤 기준 3일은 상수, 필요해지면 그때 |
| 35 | 관제 모드면 /cc 는 끝나도 /cd 를 부르지 않고 관제에 완료 보고 — 마감은 관제 | codex(cc 자동 마감과 충돌) | 어떻게 E8 · E3 | 포함 |
| 36 | parked 를 계획서 훅 두 개의 승인 뒤 상태 목록에 추가 | codex | 어떻게 B3 | 포함 |
| 37 | lens-cli plan 라우팅 정리(분기 전 파일 읽기 제거) + 옵션 파싱 테스트 | codex | 어떻게 A5 | 포함 |
| 38 | /ct 는 Claude Code 전용 — Codex 에서는 한 줄 안내로 끝 | codex | 어떻게 E1 | 포함 |
| 39 | 상태 정본 하나 — 세션 시작 「Recent Plans」를 스캔 캐시로(plan-state 읽기 제거) | codex | 어떻게 A4 | 포함 |
| 40 | 관제 → 작업 세션 승인 전달 5요소 계약(계획 id · 결정 id · 승인 행 번호 · 대표 답 원문 · 출처) | codex · 하네스 규칙 | 어떻게 E4 · B4 | 포함 |
| 41 | pr-manual 레포는 일괄 마감 보고에 「In Review」로 구분 | codex | 어떻게 D4 | 포함 |
| 42 | 릴리스 뒤 머신별 /lens-upgrade + 새 세션 로드 확인 | codex | 어떻게 F2 · 검증 18 | 포함 |

## 🛠 어떻게

권장 경로는 상태 고리(A)부터다 — 멈춘 계획 노출(A3·A4)·/cd 판정(D1)·/ct 점검(E5)이 전부 같은 판정 함수를 읽으므로 먼저 만들어야 뒤가 짧아진다. 묶음은 서로 독립이라 A 다음은 B~E 병렬 가능, F 는 마지막. 정지 지점 2곳: /ct 마감의 묶음 승인(D4) · 태그 push·GitHub Release(F2). 이 계획서 자체는 전 행 승인을 전제하므로 단계에 행 번호를 달지 않았다(B2 가 도입하는 표기).

### A. 상태 고리 · 멈춘 계획 스캔

- [x] A1 상태 한 줄 쓰기 — 새 `lib/plan-scan.js` 에 `setPlanStatus(docPath, status, {reason})`: frontmatter `status:` 한 줄만 바꾸고 `blocked_reason:`·`waiting_on:`·`status_at:` 을 넣거나 지운다. 기존 `updatePlanStatus` 는 어휘가 달라(done·blocked 거부) 쓰지 않고 건드리지 않는다. 진입점 `node scripts/lens-cli.js plan status <doc> <executing|done|blocked|parked|cancelled> [--reason …] [--waiting-on …]`. 테스트 `lib/plan-scan.test.js`.
- [x] A2 /cc 고리 — `scripts/lens-gate.js` create 가 executing 을, close 가 `summarize()` 의 미충족·포기·무효가 **전부 0** 일 때만 done, 아니면 blocked(+어느 게이트가 왜)를 A1 로 쓴다 — 원장 닫힘 ≠ 목표 완료(cc 969행 「포기 하나면 부분 완료」와 일치). 취소는 `close --status cancelled --reason`. `--plan` 은 레포 루트 기준으로 저장, 문서 없음·쓰기 실패는 경고만, `reopen` 은 executing 복귀. `lib/gate-ledger.test.js` 631행의 문서 없는 `--plan x.md` 는 그대로 통과. 원장 없는 실행은 `skills/cc/SKILL.md` 시작·7.4 종료 절에서 `plan status` 직접 호출.
- [x] A3 멈춘 계획 판정 — `lib/plan-scan.js` `scanPlans(root, {days:3, git:false, sessions:null})`: status 정규화(planned/draft=계획 · approved=승인됨 · executing/in_progress/in-progress=실행 중 · blocked/failed=멈춤 · done/completed=끝 · parked=보관 · cancelled=취소 · 그 밖=판정 불가). 「멈춘 계획」= ① blocked ② approved·executing 인데 진행상황 마지막 갱신·파일 수정이 3일 지났고 waiting_on 이 빈 것 ③ `sessions`(ListAgents 결과)가 있으면 executing 인데 맡은 세션(진행상황의 세션 이름·원장 sessionId)이 없거나 idle — 즉시. 「어디서」= 재개 포인트 → 체크박스 N/M → 열린 원장 미충족 수 → 「검사 기록 없음」. waiting_on 있으면 「대기 중(사유)」. 가지 병합은 `git:true` 때만. 결과를 `.lens/plan-scan.json`(스캔 시각)에 쓴다. 진입점 `lens-cli plan scan <root> [--git] [--sessions] [--json]`. `skills/cp/SKILL.md` 「모드 판별」 인자 없음 절을 이 호출로.
- [x] A4 세션 시작 한 줄 — `hooks/session-start.js` 는 스캔하지 않고 `.lens/plan-scan.json`(루트, 없으면 바로 아래 폴더들)만 읽어 N>0 이면 `[Lens] 멈춘 계획 N건 (스캔 HH:MM 기준) — /cp 로 보기`, 캐시 없으면 침묵. 같은 캐시로 「Recent Plans」(plan-state.json)를 대체해 정본을 문서 하나로 — plan-state 를 읽는 곳이 세션 시작뿐이라 A1 동기화보다 작다. compact/fork 는 기존 분기로 제외. 훅 5초는 전체 상한(세션 정리·플러그인 스캔·git 3초 포함) — 캐시 읽기는 파일 1개. `hooks/session-start.test.js` 5 케이스(캐시 1건 · 없음 · compact · 하위 폴더 · 실행 시간 상한).
- [x] A5 lens-cli 라우팅 — `plan()` 이 분기 전에 파일을 읽어 `scan <디렉터리>` 를 못 받는다(39·92행) → 명령별 인자 해석 뒤 읽기. `--reason` `--waiting-on` `--git` `--json` `--sessions` 파싱과 `plan status`·`plan scan`·`cd inspect`·`control` 라우팅 테스트 `scripts/lens-cli.test.js`(신규).

### B. 승인 방식 (/cp)

- [x] B1 한 단어·채팅 선택지 — `skills/cp/SKILL.md` 계약 카드 8·Phase 6 에 「직전 턴이 승인 질문이면 한 단어·번호·글자(a/1/ㅇ/지금 실행)를 해당 선택지로 받는다, 아니면 평문」 규칙과 5.1 보고 `🗳` 줄에 채팅 답 선택지 한 줄(`a 지금 실행 · b 고칠 곳 있음 · c 일부만 실행 · d 보관`)을 추가. 모호하면 선택지를 다시 한 줄 쓰고 묻는다.
- [x] B2 부분 승인 — `templates/cp-questions.html` approve 선택지에 `{label:"일부만 실행", desc:"행 번호·범위", text:true}` 추가, `templates/cp-questions.test.js` 81~86행의 「정확히 셋」 단정을 넷으로. 승인 범위를 실행 목록까지 잇는다: `deriveTodoItems`(`lib/plan-manager.js` 1202·1260행)가 목표·단계를 인벤토리와 따로 모아 미승인 단계가 샌다(codex 재현). 어떻게 절 체크박스에 `(#n,#m)` 행 번호를 두고, 파생 때 포함 행이 없는 단계·그 단계만 가리키는 검증·그 행들만의 목표를 뺀다(행 번호 없는 단계는 전부). Phase 6: 「일부만 실행 → 미승인 행을 `보류: 대표 부분 승인 대기` 로, 🔁 블록, approved 기록, approval_note 에 행 번호」. `lib/plan-coverage.test.js` 부분 승인 케이스.
- [x] B3 질문 생략·보관 — 승인 질문 생략은 **d2 답에 따라** Phase 5 에 적는다(미결정 — 답이 오기 전엔 지금처럼 항상 묻는다). 「계획만 보관」은 `status: parked` 로 기록(approved_* 유지), /cc 는 parked 를 승인된 문서로 받는다 — `skills/cc/SKILL.md` 417행에 parked 추가, `hooks/pre-tool-plan-doc.js` 66행·`hooks/post-tool-plan-doc.js` 69행 `PAST_APPROVAL` 에 parked 추가(보관 계획 수정은 승인 뒤 갱신과 같이 통과). 테스트 각 1 케이스.
- [x] B4 관제 모드면 관제판으로 — Phase 4.5 「질문은 페이지 안에서」에 「관제 표식에 이 세션이 참여 세션으로 있으면 질문 블록을 싣지 않고 결정 묶음(계획 id · 결정 id · 선택지·추천 · 영향 · 되돌리기)을 SendMessage(to 관제)로 보낸다」 분기. 승인으로 받는 것은 E4 의 5요소 메시지가 왔을 때만 — 「관제가 전했다」만으로는 승인이 아니다.
- [x] B5 블록 깨짐 방어 — `templates/cp-questions.html` 85행 JSON.parse 를 try 로 감싸 실패 시 「질문 블록을 읽지 못했습니다 — 채팅으로 답해 주세요」 문구를 그 자리에 그린다. 테스트 1 케이스.

### C. 계획서 작성 모델 규칙

- [x] C1 훅 — `hooks/pre-tool-plan-doc.js` 가 쓰려는 문서의 `grade:` 를 읽어 기본이면 상위 티어(opus) 이상 통과, deep 이면 fable 만. `TIER_ORDER = ['haiku','sonnet','opus','fable']` 로 비교, 거부 문구도 등급별. Edit/MultiEdit 는 디스크가 아니라 **변경 후 내용**(old→new 적용)에서 grade 를 읽는다(140행). 위임 기록 판정(165행)은 등급이 요구하는 티어 이상이면 인정 — 기본 등급은 opus 위임 기록도 통과. `hooks/pre-tool-plan-doc.test.js` 6 케이스: opus+기본 통과 · opus+deep 거부 · sonnet+기본 거부 · Edit 로 grade 를 deep 으로 바꾸는 opus 거부 · opus 위임 기록+기본 통과 · 서브에이전트 모델 판정.
- [x] C2 문서 — `skills/cp/SKILL.md` 계약 카드 12 · 「계획은 TOP 티어가 쓴다」 절 · Phase 0 6번 저장 위치 · **5.0 게이트 표 「작성 모델」 행(328행)** 과 그 밖 TOP 강제 문구 전부(`grep -n "TOP" skills/cp/SKILL.md` 로 전수)를 「기본 = opus 이상 세션이 직접(docs/tasks 에), 미만은 opus 위임 · deep = fable, 미만은 fable 위임」 으로. `docs/rules/harness-rules.md` 4.1 v3.37 보강 절에 v3.53 개정 한 줄(대표 10-23 원문). `skills/cc/SKILL.md` 는 grep 으로 계획 모델 문구가 있으면 같이(조사에서 직접 문구 0건).

### D. /cd 일괄 마감

- [x] D1 읽기 전용 판정 — 새 `lib/cd-manager.js` `inspectTask(docPath)`: 체크박스·검증표·진행상황 + 그 계획 원장(`loadLedgers`·`gateState`·`summarize` 재사용, Stop 용 `evaluate` 의 만료·manual 제외 정책은 쓰지 않음) + waiting_on → `{closable, reasons[], remaining[], ledger:'none'|…}`. 진입점 `lens-cli cd inspect <doc> [--json]`. 테스트 `lib/cd-manager.test.js` 3 케이스.
- [x] D2 정확한 대상 목록·결과 JSON — `scripts/prune_branches.py` `--finish --json` 허용, `--finish --only <branch>[,…]` 조합 거부(1521행) 해소 — 대상은 **그 계획 가지와 `<branch>-*` 작업자 가지**와 그 워크트리만. `finish()` 는 `{removed_remote[], removed_local[], removed_worktrees[], kept[{name,reason}], failed[{name,stage,reason}], base_updated}` 반환, CLI 는 `--json` 이면 그 객체·아니면 지금 텍스트, `SystemExit` 는 failed 있으면 1(1477·1670행). 부분 삭제(1174행)·base 최신화 실패는 failed 로. `scripts/prune_finish.test.py` 6 케이스: 범위 밖 병합·푸시·clean 워크트리 보존 · 복수 대상 · lease 거부→failed · 부분 실패 JSON · 재실행 · 기존 7 결과 유지.
- [x] D3 설정·커밋 범위 — `skills/cd/SKILL.md` Phase 4 가 `autoDeleteMergedBranch:false` 면 `--finish` 를 건너뛰고 보고에 적는다. `git add -u docs/tasks` → 그 계획의 task·sidecar·history 경로만.
- [x] D4 일괄 절차 — `skills/cd/SKILL.md` 에 입력 `{repo, plan, session}` 목록 모드: 레포마다 D1 로 전건 판정 → 끝난 것만 **묶음 승인 한 번(정지 지점 — 표에 레포 / 계획 / 지울 가지·워크트리 목록, 관제 모드면 관제판으로)** → 레포 간 병렬·같은 레포 직렬 → 레포마다 마지막에 `--finish --json --only <승인된 가지 목록>` 한 번(전체 `--finish` 는 부르지 않는다) → 보고 표 「레포 / 계획 / 판정(완료 · In Review · 보류) / 폴더·가지·워크트리 전→후」. pr-manual 레포는 PR 까지 만들고 「In Review」로 구분해 다음 마감 때 다시(cd 180행 계약 그대로). Notion·운영 반영은 계획서 검증표의 manual 행과 「배포 기록」 유무를 확인 항목으로 보고하고, Notion MCP 가 연결돼 있을 때만 상태를 쓰며 없으면 「Notion 미반영」 한 줄.

### E. /ct 관제탑 스킬

- [x] E1 `skills/ct/SKILL.md` 신설 — 첫 줄 배너 `Lens Control v3.53.0 로드됨`. **Claude Code 전용** — ListAgents·SendMessage·Artifact 가 없는 엔진(Codex)에서는 「/ct 는 Claude Code 전용입니다」 한 줄로 끝난다. 시작 때 `lens-cli control on --name <이름> --board <url> --sessions <id,…>`, 참여 세션이 바뀌면 `control add|remove`, 끝낼 때 `off`. 네이티브가 주는 일반 오케스트레이션은 쓰지 않고 아래 Lens 고유 계약만.
- [x] E2 세션 표·배정 규칙 — 표 = ListAgents 실측(이름·busy/idle/waiting) + 역할 이름 열. 보낼 때마다 ListAgents 로 이름을 다시 맞춘다(탭 이름 바꾸면 연락용 이름도 바뀜). 배정은 역할 기준 · idle 우선 · 같은 레포 두 세션 금지(`git worktree list`) · 새로 뜬 세션은 그 세션 기록 첫 user 메시지를 보고 대표가 시킨 것만 · 대표 지시 범위 밖 일은 만들지 않는다 · 관제는 계획·구현을 직접 하지 않는다.
- [x] E3 배정 지시문 기본 문안 — `templates/ct-assign.md`: 답 첫머리 `[이름]` · 보고 6줄(제목 / 레포·가지·워크트리 / 끝·남은 N/M / 대표 결정 필요(선택지+추천) / 겹치는 레포·파일 / 예상 완료) · 대표에게 직접 묻지 말고 관제로(무엇·선택지·추천·영향·되돌리기) · 관제가 전한 관제판 답 = 승인, 재질문 금지 · 대표가 그 창에서 직접 지시하면 그 지시 우선 + 관제에 한 줄 · 끝나면 /cd 를 부르지 않고 관제에 완료 보고(마지막 커밋 sha · 가지 · 워크트리) 뒤 「완료했습니다」 — 정리는 관제 마감(D4) 때.
- [x] E4 관제판 한 장 — 새 답 DB·깨우기 경로를 만들지 않는다. 관제판 = comments capability 페이지 + 기존 `templates/cp-questions.html` 질문 블록(결정마다 `choice`, plan_id 칸에 관제 id) — [답변 보내기] 가 `sendToClaude`(163행)로 관제 세션을 깨운다(watch `auto-replies armed` 확인, 아니면 복사 칸→채팅, 159행 fallback 그대로). `templates/ct-board.html` 은 세션 표 + 블록 자리만 있는 얇은 틀, `templates/ct-board.test.js` 는 블록 원문 포함·script 구문만. 답 처리: 알림이 오면 열린 스레드 전부를 시각순으로(알림 일부만 오는 실측). 올리기 전 그 세션 최신 결과로 질문을 맞추고 이미 고른 것은 확정으로. **승인 전달 5요소** — 관제→작업 세션 SendMessage 는 `plan_id · 결정 id · 승인 행 번호 · 대표 답 원문 · 출처(페이지 owner 머리표 / 채팅)` 를 담고, 작업 세션은 다섯이 자기 계획과 맞을 때만 승인(수정 전 질문의 답·다른 계획의 「a」 구분).
- [x] E5 주기 점검 — `/ct 점검`(보고가 올 때마다 · 배정 전에도): 첫 줄 `lens-cli plan scan <작업공간> --git --sessions <ListAgents 결과>` 의 「멈춘 계획 N건 — 어디서」(맡은 세션이 없거나 idle 인 executing 은 즉시) → ② 세션 기록 끝 tool_use 로 배정대로 하는지 → ③ 레포마다 워크트리·고친 파일 겹침 → ④ waiting 세션은 허용 창 멈춤인지 보고 대표에게 → ⑤ 관제판 답. 보고는 표 한 장, 「진행 중」은 실측 없이 쓰지 않는다.
- [x] E6 재시작 복구 — ListAgents 로 이름 재매핑 → 세션 기록·워크트리로 하던 일 식별 → 끝 보고 없이 멈춘 세션에 표현을 바꿔 같은 일을 다시 넣거나 나눠 넘긴다 · safeguards 로 멈춘 기록(informational) 감시 · `/ct 마감` 은 D4 호출.
- [x] E7 관제 표식·질문창 훅 — `lib/control-mode.js`: 경로 `session-store.js` `configDir()` 아래 `lens/control.json`, 내용 `{name, sessionId, board, sessions:[{id, role, repo}], heartbeatAt, updatedAt}`. `lens-cli control on|add|remove|off|status [--heartbeat] [--take-over]` — 재등록·인수·해제는 소유 관제(sessionId 일치)만, 다른 세션의 on 은 기존 소유를 보이고 거부. 신선 = 갱신 뒤 12시간. `hooks/pre-tool-ask.js` `controlProblem()`: 표식이 신선하고 **이 세션이 참여 목록에 있고** 관제가 아닐 때만 거부 — 무관 세션은 그대로. 훅은 ListAgents 를 못 부르므로 /ct 점검이 `--heartbeat` 를 적고, 심박 30분 끊기면 관제 연락 불가로 보고 거부하지 않는다. 거부 문구 「관제 모드 — SendMessage(to <관제 이름>)로 무엇·선택지·추천·영향·되돌리기를 보내세요. 대표가 이 창에서 직접 지시한 건이면 이 세션 env `LENS_ASK_GUARD=0`(settings env 또는 재시작 때)으로 다시 열어 물으세요」. 허용 header 에 /cd 의 `작업 완료 — 기존 task 정리` 추가. 테스트 경로 env `LENS_CONTROL_FILE`, `hooks/pre-tool-ask.test.js` 7 케이스(참여+신선 거부 · 무관 통과 · 관제 통과 · 만료 통과 · 심박 끊김 통과 · LENS_ASK_GUARD=0 · /cd header). `hooks/hooks.json` 은 바꾸지 않는다(49행 배선 기존).
- [x] E8 관제 모드의 /cc 마감 분기 — `skills/cc/SKILL.md` 975·1005행(목표 달성 시 자동 /cd): 이 세션이 표식의 참여 세션이면 /cd 를 부르지 않고 관제에 완료 보고(계획 id · 마지막 커밋 sha · 가지 · 워크트리 · 미충족 0 증거), 마감은 관제가 D4 로. 아니면 지금처럼.

### F. 문서·릴리스

- [x] F1 배선 — `CLAUDE.md` 스킬 표 · `README.md` · `docs/START_HERE.md` · `docs/rules/harness-rules.md`(관제·승인 전달·상태 판정 계약 정본) · `scripts/bump-version.sh` 배너 치환·검증 목록에 `skills/ct/SKILL.md`(Lens Control) 추가, 분모 갱신 · `docs/rules/release-guide.md` 파일 수(13곳·11파일 혼재, Codex manifest 누락)를 bump 검증 목록 기준으로 · `CHANGELOG.md` 3.53.0.
- [ ] F2 릴리스·적용 — `bash scripts/bump-version.sh 3.53.0` → CHANGELOG 확정 → 버전 커밋 → 태그 → push → GitHub Release(release-guide 순서). **정지 지점: 태그 push·GitHub Release 직전 1회.** 릴리스는 적용이 아니다 — 뒤이어 머신별 `/lens-upgrade` 와 새 세션에서 `Lens Control v3.53.0 로드됨` 배너 확인(검증 18, 대표 확인).

### 우회로

- 트리거 1 — E7 에서 관제 세션 자신의 질문까지 막힘(재시작으로 session_id 가 바뀜): /ct 가 시작·점검마다 `control on --take-over` 로 id 를 재등록한다. 그래도 막히면 그 세션만 `LENS_ASK_GUARD=0`, 훅 배선은 유지.
- 트리거 2 — D2 에서 `finish()` 구조화가 diff 150줄을 넘김: `--finish` 를 부르지 않고 /cd Phase 2.5(그 계획 가지·워크트리 삭제, 이미 있음)를 승인 목록만큼 반복하며, 전→후 숫자는 `git worktree list`·`git branch -r` 세기로 낸다. 레포 전체 정리는 /cs 에 남긴다.

## ✅ 검증

검증 전략: 코드가 바뀐 곳은 그 파일의 테스트 명령을 레포 루트에서 돌려 종료 코드 0 과 새 케이스 통과를 본다. 스킬 산문은 이 계획서를 게이트로 통과시키고 대표가 Done 시나리오를 실제 세션에서 한 번 밟는다. 결과는 보고에 명령·종료 코드·케이스 수로 적는다.

| # | 됐다는 신호 | 확인 방법 | 통과 | 종류 |
|---|---|---|---|---|
| 1 | 상태 한 줄 쓰기·멈춘 계획 판정이 맞다 | `node lib/plan-scan.test.js` | ✅ 종료 0 · 5분류 + 재개 포인트 + 「맡은 세션 없음→즉시 멈춤」 + 캐시 파일 쓰기 | auto |
| 2 | /cc 가 시작·끝에 상태를 남기고 원장 닫힘 ≠ 완료 | `node lib/gate-ledger.test.js` 뒤 임시 계획서로 `lens-gate.js create` → `grep -c "status: executing"` · 전부 충족 `close` → `status: done` · 포기 1건 `close` → `status: blocked` + `blocked_reason` | ✅ 각 1 · 631행 문서 없는 `--plan` 그대로 통과 | auto |
| 3 | 세션 시작 한 줄 = 캐시만 | `node hooks/session-start.test.js` | ✅ 캐시 1건→한 줄(시각 포함) · 캐시 없음→없음 · compact→없음 · 하위 폴더 캐시 · 실행 1초 이내 | auto |
| 4 | 승인 선택지 넷·블록 깨짐 방어·관제판이 같은 블록 | `node templates/cp-questions.test.js` · `node templates/ct-board.test.js` | ✅ 종료 0 · 「일부만 실행」text:true · 깨진 JSON 안내 문구 · ct-board 가 블록 원문 포함 | auto |
| 5 | 부분 승인이 실행 목록에 반영 | `node lib/plan-coverage.test.js` | ✅ 포함 1행 → 그 행의 단계·검증·목표만 파생, 미승인 행만 가진 단계 0 | auto |
| 6 | 계획서 모델 게이트가 등급별로 판정 | `node hooks/pre-tool-plan-doc.test.js` | ✅ C1 의 6 케이스 통과 · `grep -c "TOP 이 썼다" skills/cp/SKILL.md` = 0 | auto |
| 7 | 관제 표식이 참여 세션 질문창만 막는다 | `node hooks/pre-tool-ask.test.js` | ✅ E7 의 7 케이스 통과 · 기존 케이스 유지 | auto |
| 8 | parked 가 승인 뒤 상태로 통과 | `node hooks/pre-tool-plan-doc.test.js` · `node hooks/post-tool-plan-doc.test.js` | ✅ parked 문서 Edit 통과 1 케이스씩 | auto |
| 9 | /cd 읽기 전용 판정 | `node lib/cd-manager.test.js` | ✅ 전부 충족→closable · 미충족 1→reasons 에 사유 · 원장 없음→ledger none | auto |
| 10 | 정리 대상 제한·결과 JSON | `python scripts/prune_finish.test.py` | ✅ 기존 7 결과 유지 + D2 의 6 케이스 · failed 있으면 종료 1 | auto |
| 11 | lens-cli 라우팅·옵션 | `node scripts/lens-cli.test.js` | ✅ `plan scan <dir>` 동작 · `--reason/--waiting-on/--git/--json/--sessions` 파싱 · `control`·`cd inspect` 라우팅 | auto |
| 12 | 이 계획서가 게이트를 통과 | `node scripts/lens-cli.js plan gate docs/tasks/2026-10-23-control-mode-approval-loop.md` | ✅ valid true | auto |
| 13 | 멈춘 계획 스캔이 실측과 맞다 | `node scripts/lens-cli.js plan scan . --git` | ✅ 첫 줄에 N≥2 · 목록에 2026-10-03 공용 계획 채널·2026-09-14 cp-native-artifacts · `.lens/plan-scan.json` 생성 | auto |
| 14 | 릴리스 배너 전부 | `bash scripts/bump-version.sh 3.53.0` | ✅ 검증 목록 전부 ✓ · `grep -c "Lens Control v3.53.0" skills/ct/SKILL.md` = 1 | auto |
| 15 | 관제 배정 → 보고 6줄 도착 | 대표: 관제 세션에서 `/ct` 로 두 세션에 배정 | 두 세션의 `[이름]` 보고 6줄이 관제에 오고 관제판 세션 표에 보임 | manual |
| 16 | 한 단어·부분 승인 | 대표: 승인 질문에 채팅 「a」 · 다른 계획에 「c 1-5」 | 전자 approved + 같은 턴 /cc 시작 · 후자 6행 이후 보류 + 🔁 블록 | manual |
| 17 | 관제판 답 전달 → 멈춤 노출 | 대표: 관제판 결정에 답 · 작업 세션 하나를 끈 뒤 `/ct 점검` | 세션이 5요소 메시지로 재질문 없이 진행 · 점검 첫 줄에 「멈춘 계획 1건 — 체크 N/M」 | manual |
| 18 | 일괄 마감 숫자 · 릴리스 적용 | 대표: `/ct 마감` 묶음 승인 뒤 전→후 표 · 머신별 `/lens-upgrade` 뒤 새 세션 | 끝난 계획만 history, 남은 워크트리 그대로, In Review 구분 · 배너 v3.53.0 | manual |

## 🚫 건드리지 않는 것

- `lib/plan-manager.js` `updatePlanStatus` 어휘·plan-state 동기화 — 옛 호출자용, A1 이 대신 쓴다 · `.lens/plan-state.json` 은 쓰지도 않고 세션 시작이 더는 읽지 않는다(A4)
- `hooks/hooks.json` — 관제용 훅 등록 없음(질문·계획서 훅 배선 기존)
- `hooks/stop.js` 차단 정책 · `lib/gate-ledger.js` `evaluate()` — 멈춤 알림을 Stop 에 얹지 않는다(인벤토리 #33)
- `scripts/prune_branches.py` 의 `classify`·`prune` 판정 로직 — D2 는 입출력·범위만
- `lens.config.json` 키 — 새 키 없음(#34)
- `docs/tasks/` 옛 계획서의 status — 스캔은 읽기만, 고치지 않는다
- `docs/tasks/2026-10-03-shared-plan-channel.md` — d1 결정 전까지 그대로
- 다른 스킬(/cs·/cu·/ci·/cr·/cps·/crv) · livevil-setting 메모리 파일(다른 레포, #30)

## ⚠️ 리스크

| 심각도 | 무엇이 잘못되나 | 트리거 | 대응 | 중단 조건 | 출처 |
|---|---|---|---|---|---|
| 높음 | **Blocker** — 일괄 정리가 다른 세션 워크트리·가지를 지움(병합 증명은 코드 보존 증거지 「그 폴더를 안 쓴다」는 증거가 아님) | 전체 `--finish` 호출 | 승인된 정확한 목록만 `--only` · 묶음 승인이 정지 지점(대표가 지울 목록을 보고 누름) · dirty·미푸시 보호 유지 · 안 되면 우회로 2 | prune 「범위 밖 clean 워크트리 보존」 실패 | 조사 C ① · codex |
| 높음 | 관제 표식이 남아 참여 세션 질문창이 막힘 | 관제 off 없이 종료 | 참여 세션만 대상 · 12시간 만료 · 심박 30분 끊기면 통과 · `LENS_ASK_GUARD=0` | 만료·심박 없이 배선 금지 | 조사 B · codex |
| 높음 | 부분 승인인데 미승인 단계·목표가 실행됨 | 파생 함수가 목표·단계를 따로 모음 | 행 번호 연결 + plan-coverage 테스트 | 검증 5 실패 | codex 재현 |
| 높음 | 원장 닫힘을 완료로 오판(포기·무효만 있는 실행이 done) | 미충족 0 만 봄 | 미충족·포기·무효 전부 0 일 때만 done | — | codex(gate-ledger 624) |
| 높음 | 부분 성공을 전체 완료로 보고 | 종료 코드 0 만 믿음 | `--json` failed 로 판단 · failed 있으면 종료 1 · 전→후 실측 | failed 비어 있지 않으면 「미완」 | 조사 C ③ · codex |
| 중간 | 세션이 꺼져 executing 이 남고 3일 묻힘 | close 미호출 | /ct 점검이 세션 목록과 대조해 즉시 멈춤 후보 | — | codex |
| 중간 | 멈춤 오탐 — 보관·정당한 대기·옛 문서 | parked·waiting_on 없는 옛 문서 | 옛 어휘는 「판정 불가」 · status 안 고침 | — | 조사 D·E |
| 중간 | 관제판 답이 관제를 못 깨움 | watch armed 아님 · 전원 결정 대기 | 기존 `sendToClaude` 재사용 · armed 확인 · 아니면 복사 칸→채팅 · 점검마다 열린 스레드 전부 | — | codex · 메모리 10-17 |
| 중간 | 관제가 전한 「승인」이 다른 계획·옛 질문의 답 | 출처 없는 전달 | 5요소 계약, 안 맞으면 승인 아님 | — | codex · 하네스 규칙 |
| 중간 | 등급 자기 신고로 모델 완화 우회 | 훅이 frontmatter grade 만 읽음 | Edit 변경 후 내용으로 판정 · 등급 출처가 승인 화면에 — 대표 확정 아래 수용 | — | Pre-mortem |
| 중간 | 한 단어를 다른 질문의 답으로 오해 | 직전 턴이 승인 질문 아님 | 직전 턴 조건 · 모호하면 선택지 다시 | — | 조사 B |
| 중간 | 같은 레포 두 계획 동시 마감 lease 거부 | 병렬 호출 | 레포 간 병렬·같은 레포 직렬 · 거부는 failed 로 | — | 조사 C ② |
| 낮음 | 세션 시작 훅 5초 초과 · 상태 정본 둘 | 직접 스캔 · 옛 Recent Plans | 캐시 읽기만 · 시간 상한 테스트 | — | codex |
| 낮음 | 질문 블록 JSON 깨져 아무것도 안 보임 | 손으로 채운 JSON | try + 안내 문구 · 채팅 선택지 | — | 조사 B |
| 낮음 | 릴리스 ≠ 적용(캐시 미반영 · 옛 세션) | bump 누락 · 업그레이드 안 함 | bump 검증 ✓ · 머신별 `/lens-upgrade` · 새 세션 배너 확인 | — | 조사 D · codex |
| 낮음 | Notion 미연결로 상태 확인·쓰기 불가 | MCP 미인증(이 세션 실측) | 「Notion 미반영」 · 쓰기 생략 | — | 이 세션 |

Blocker 1건 — 첫 행(워크트리·가지 삭제: 영향 높음 · 되돌리기 어려움). 정지 지점 2곳: /ct 마감 묶음 승인(D4) · 태그 push·GitHub Release(F2). 승인 「지금 실행」 설명에 「Blocker 1건을 알고 진행」.

## 🧭 결정

- 계획서 작성 모델을 등급별로 → **확정** (대표 2026-10-23 「/cp 할때 꼭 fable을 쓰는 규칙도 바꾸긴 해야할듯」 → 「난이도에 따라서 조절을 해야지 무조건은 아닌거 같으ㅁ」): 기본 등급은 opus 이상 세션이 직접 쓰고, deep 만 fable. 인벤토리 #19 · 어떻게 C.
- d1 공용 계획 채널 겹침 → **이번 계획으로 흡수하고, 그 계획은 1단계만 끝난 것으로 마감** (2026-10-23 대표, 페이지·질문창)
- d2 승인 질문 생략 → **네 가지 조건을 다 만족할 때만 생략** (2026-10-23 대표, 페이지·질문창) — B3 는 이 규칙으로 확정
- 실행 승인 → **지금 실행** (2026-10-23 23:52 KST)
- (승인 전 원문) 🙋 d1 공용 계획 채널(10-03, executing) 겹침 — 그 계획 인벤토리 #21(/cc executing·blocked 기록)·A5(세션 시작 알림)가 이번 A2·A4 와 같은 범위. **추천: 이번 계획으로 흡수하고 그 계획은 1단계(현황판)만 끝난 것으로 /cd 로 닫는다** — 2단계(사이트 승인 채널)는 필요할 때 새 계획으로. 대안: 그 계획을 열어 두고 이번은 A5 일부만 선행. 데이터로 못 정하는 이유: 2단계를 계속 갈지는 대표 업무 판단.
- 🙋 d2 「결정할 게 없으면 승인 질문 생략」 조건 — **추천: 기본 등급 · 🙋 0 · Blocker 0 · 정지 지점 없음일 때만 생략**하고 링크 + 「바로 실행합니다」 1줄 보고 뒤 /cc. 대안: 생략하지 않고 항상 묻는다. 데이터로 못 정하는 이유: 「안 본 문서 승인 금지」(2026-09-04·09-14 대표 지적)와 충돌하므로 어디까지 자동으로 갈지는 대표 판단. 답이 오기 전에는 지금처럼 항상 묻는다(B3).

## 🔀 합성

조사 레인 codex 2건(cdscan·pastrules)의 제안은 전부 채택 — cd-manager 읽기 전용 판정 · `--finish --json` · 정리 범위 제한 · parked 구분 · 상태 어휘 분열 · 한 단어 파서 없음. 사전 부검 codex 1회(xhigh, `.lens/verify/premortem-codex.out`) 15건:

- 합의(채택): 15건 전부 — 목록은 맨 위 🔁 블록, 반영 위치는 인벤토리 출처 칸 「codex」 행.
- 분기 → 해소: ① codex 「전역 질문 거부는 전달 경로 검증 뒤 붙여라」 vs 대표 10-16 지시(작업 세션은 자기 창에서 묻지 않는다) → 참여 세션만 거부하는 중간안(E7) — 무관 세션 차단 우려는 풀리고 대표 지시는 지킨다. ② codex 「ct-board 에 답 저장→깨우기→전달→중복 방지 테스트」 → 새 DB 를 안 만들기로 해 그 테스트는 불필요, cp-questions 재사용 확인으로 대체(E4). ③ 상태 정본: A1 이 plan-state 를 맞추기 vs 세션 시작이 캐시만 읽기 → 후자(읽는 곳이 세션 시작뿐이라 더 작다, A4).

## 진행상황

- **작업 브랜치**: `feat/control-mode-approval-loop` — 2026-10-23 이 계획의 실행이 `origin/master` 위에서 생성. 시작 SHA `64af4c9`.
- **마지막 업데이트**: 2026-10-23
- **현재 경로**: Plan A
- **Goal 달성**: 5/5 ✓ (QA 실측 재현 5/5 · 자동 완료 조건 13/13) — 대표 확인 4건(검증 15~18) 대기
- **재개 포인트**: v3.53.0 태그 push · GitHub Release(정지 지점 — 대표 승인 대기) → 머신별 /lens-upgrade → 대표 확인 4건 → /cd. 그 뒤 2026-10-03 공용 계획 채널을 1단계 완료로 /cd (d1)

### 편차 기록 (계획 ↔ 실제)
- E7 관제 표식 → 참여 세션 id 목록 + 범위만, 만료는 12시간 하나(30분 심박 규칙 없음) (이유: 관제가 잠깐 조용해도 참여 세션이 대표에게 직접 묻기 시작하면 관제 목적이 깨짐 — Leader 판단, ct SKILL 복구 절에 명시)
- E7·우회로 1 의 add/remove/--take-over → `on` 재호출 · 표식 파일 삭제 후 `on` 으로 대신 (이유: 작업자 계약 단순화)
- D2 `<branch>-*` 작업자 가지 자동 포함 → 표에 이름을 적은 것만 삭제 (이유: Blocker 방향으로 더 안전 — 다른 세션 가지일 수 있음, Leader 판단)
- D2 반환 키 `kept` → `skipped` · failed 에 stage 칸 없음 (SKILL·테스트와 일치)
- 단건 /cd Phase 4 는 여전히 레포 전체 `--finish` (이유: 승인 범위는 일괄 마감 — 단건까지 `--only` 로 바꾸는 것은 다음 개선 후보)
- C1 grade 없음·`standard` → 기본으로 판정(deep 만 fable) (이유: Supervisor 실측 — 레포 어휘 plan-manager 와 일치, 실제 문서 2건이 standard)
- A2 cancelled 사유는 문서가 아니라 lens-gate 출력에만 (이유: blocked_reason 은 blocked 전용 계약)
- A3 새 가지 병합 오탐 방지(시작 SHA 와 같으면 병합 아님) · 세션 시작 멈춤 줄을 systemMessage 에도 (작업자 판단)
- plan-coverage.test.js 의 기존 실패 1건(커밋된 .research.md 를 계획서로 검사) 수정 — 별도 커밋
- 반복 2: Codex p45 지적 3건(waiting_on 보존 · blocked+waiting 분류 · scan 텍스트 출력 누락) + Supervisor 지적 1건(grade 판정) 반영

### 실행 지표
- **추가 질문 수**: 0
- **편차 건수**: 9
- **반복**: 9회 Codex 리뷰(지적 14건 → 반영 14건, 마지막 PASS) · Supervisor 87/100 · QA 5/5
- **게이트**: 자동 13/13 통과 · 대표 확인 4건 대기
