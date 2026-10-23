# 조사 결과 — 2026-10-23-control-mode-approval-loop

조사 시각 2026-10-23 23:00~23:12 KST · SJ-OMEN · creeta-lens master 64af4c9 (원격과 같음)
조사 레인: codex 2 (cdscan, pastrules — 원문 `.lens/delegate/cdscan-codex.out`, `.lens/delegate/pastrules-codex.out`) · opus 1 (승인·상태 코드) · sonnet 1 (SJ-ROG 멈춘 계획 9건)
근거 분석: 대표 지시 1,641건 분석 보고 https://claude.ai/artifact/LDAd7pY2twdYyb1eU6aY6j · livevil-setting `claude-memory/lens-style-gap-analysis-2026-10-23.md` · `claude-memory/feedback_one_control_session_orchestrates_all.md`(관제 손 규칙 정본) · `feedback_report_progress_to_control_session.md` · `trap-session-restart-renames-and-orphans-work.md`

## A. 대표 작업 방식 (분석 실측, 10-12~23)
- /cp 직접 14 · /cd 직접 22(12번은 여러 세션 동시) · /cc 직접 0, /cp 승인 뒤 자동 /cc 12회(세션 10).
- 세션 배정·감독·마감 지시 ≈90 · 한 단어 승인 ≈77 · 부분 승인 ≈10 · 끊어 보냄 ≈36묶음 · 「이게 뭐야」 되묻기 ≈37 · 「언제까지」 ≈20 · 끊긴 뒤 이어서 ≈19.
- 대표 원문: 「업무 분배를 한나한테 몰아서 주네/ … 관제 시스템 맞아?」(10-23) · 「왜 저기 작업자들 세션들이 너한테 보고를 안하고 각자 자기 세션에서 물어봐 … 구경하냐?」(10-16) · 「작업자들이 껏다켜서 다들 하다가 말았어. 하던거 다 하라고」(10-16) · 「아티팩트 자동답장이 뭔데? 나한테 아무것도 안 왔는데? … 클릭도 안 되는데?」(10-20) · 「공유 그림을 제외하곤 지금 다 반영 지금 바로」(10-18) · 「Goal 0/7 … 왜 진행 안되고 있는데?」(10-23) · 「머지가 되지 않은 폴더가 엄청 많은데」(10-16) · 관제 /cd 일괄에 작업자 「아니 너는 아직 할게 많이 남았는데」(10-15).
- 10-23 추가 지시(이 계획 중): 「/cp 할때 꼭 fable을 쓰는 규칙도 바꾸긴 해야할듯.」

## B. 승인·상태 코드 (opus, 경로:줄)
- 승인은 산문뿐. 코드가 approved_via 등을 읽는 곳 0건. 경로 셋: 페이지 approve(skills/cp/SKILL.md:24,305,352) · 질문창 `실행 승인`(:360) · 채팅(:309,345; approved_via `채팅` 정의 :439). 선택지 셋 고정(:23,305,354-358). Phase 6 세 갈래만(:362-376). 한 단어 해석·부분 승인·질문 생략 규칙 없음.
- /cp 인자 없음 스캔 = 산문만(:105-112). lens-cli plan 은 structure|coverage|todo|gate 뿐(scripts/lens-cli.js:92-131,138) — scan 없음.
- /cc: status 를 쓰는 곳은 7.4 「Goal 전부 달성이면 done」 한 줄(skills/cc/SKILL.md:1002). executing 은 시작 때도 안 씀. 미달·중단이면 approved 그대로. 이 레포에도 멈춘 계획: docs/tasks/2026-09-14-cp-native-artifacts.md·2026-10-03-shared-plan-channel.md(executing), 2026-08-23-cc-gate-ledger.md(in_progress), 2026-07-25-…(in-progress).
- 원장에 planDoc 저장(lib/gate-ledger.js:477). closeLedger(:576-590)·lens-gate close(scripts/lens-gate.js:288-290)에서 planDoc status 를 쓰는 것이 최소 지점. create(:218-224)에서 executing. closeLedger 는 미충족이 있어도 close 를 거부하지 않음.
- 함정: pm.updatePlanStatus 허용 어휘 draft|approved|executing|completed|failed|cancelled — done·blocked 거부(lib/plan-manager.js:560-563), plan-state.json 동기화는 parsedFm.id 있을 때만(:591). 게이트 0개면 원장 안 만듦(cc:364) → 원장 없는 실행은 스캔이 잡아야.
- pre-tool-ask.js: AskUserQuestion 만 대상(:169). ① 직전 보고 40자 미만 거부(:48,100-115) ② 이 세션 원장 열려 있으면 header 6종 외 거부(:52,147-164), activeRun(:124-144). 관제 개념 코드 0건. 최소안: 관제 표식 파일(~/.claude/lens/control.json {name,sessionId,updatedAt}) + lens-cli control on|off + controlProblem() — 표식 있고 신선하고 session_id 가 관제가 아니면 거부, 문구 「SendMessage(to 관제)로 무엇·선택지·추천·영향·되돌리기」. 테스트 경로 env(LENS_LEDGER_INDEX 방식, gate-ledger.js:95, pre-tool-ask.test.js:28). kill switch LENS_ASK_GUARD=0 유지. 페이지 질문 블록은 훅이 못 막음 → 산문도 고침. 표식이 남으면 모든 세션 질문창이 막힘 → 만료 필수. 대표가 그 세션에 직접 지시한 예외는 훅이 구분 못 함.
- stop.js: 백그라운드 있으면 통과(:71-75,105-124), 미충족 auto 게이트면 막고 같은 상태 2회 뒤 해제(:152-215, gate-ledger.js:69,371-405), 닫힌 원장 제외(gate-ledger.js:302-305).
- templates/cp-questions.html: JSON {plan_id, questions:[{id,text,hint?,type choice|multi|text, options 문자열|{label,desc?,text?}, other?}]}(:7-12,30-41). 부분 승인 선택지 {label:"일부만 실행",desc:"행 번호·범위",text:true} 바로 가능, 직렬화 lensCpAnswerText 무관(:66-75). 테스트가 승인 선택지 정확히 셋을 단정(templates/cp-questions.test.js:81-86). JSON.parse 에 try 없음(:85) → 손으로 채운 JSON 이 깨지면 문항·버튼·복사 칸이 전부 안 뜸 = 10-20 증상과 모양 같음(추정, 재현 안 함).
- session-start.js: 언어 줄·/crv·Session Memory·Recent Plans(레거시 plan-state.json, plan-manager.js:212-229) 주입(:103-107,217-236). 작업공간 루트에서 열면 projectRoot 가 작업공간이라 비어 보임(lib/hook-utils.js:221-242) → 한 단계 아래 */docs/tasks 까지. 시간 상한 5초(hooks.json) → git 호출 금지. once 무시(:177-180) → compact/fork 제외(NEW_CONVERSATION_SOURCES :182).

## C. /cd (codex cdscan)
- 한 레포 안 여러 계획서 순차 마감은 지원(skills/cd/SKILL.md:86). 여러 레포·여러 세션 마감, Notion 상태, 운영 반영 확인 = 없음.
- 완료 추정: 체크리스트 ≥80% 또는 검증표 전부 통과 또는 출시 기록(:34-50). 미체크 1개 있어도 막는 규칙 없음, 마감 시 todo 전부 completed(:226,328,337). /cd 자체 게이트 원장 검사 없음.
- 정리: prune_branches.py --finish 가 그 레포 전체 병합 브랜치·워크트리 정리(:1410,1521), 「원격 삭제 N·로컬 N·워크트리 N」 텍스트 출력(:1469), --finish --json 거부(:1521), exit 0 ≠ 전부 정리(:1460).
- 위험: ① 마지막 정리가 레포 전체 대상 → 관제에서 돌리면 다른 세션이 쓰는 워크트리 삭제 가능(SKILL.md:345, prune:1159) ② 같은 레포 동시 마감은 base SHA lease 거부 → 레포 간 병렬·같은 레포 직렬 ③ autoDeleteMergedBranch:false 를 Phase 4 --finish 가 무시(SKILL.md:288,345) ④ git add -u docs/tasks 가 남의 계획 변경까지 stage(SKILL.md:340) ⑤ /cd 질문 header 가 pre-tool-ask 허용 6종 밖(SKILL.md:68).
- 최소 지점: cd SKILL 입력을 {repo,plan,session} 목록으로 · 새 lib/cd-manager.js inspectTask()(읽기 전용 마감 가능/보류 판정, gate-ledger loadLedgers·gateState·summarize 재사용 — Stop 용 evaluate 의 만료·manual 제외 정책은 쓰지 말 것) + lens-cli 진입점 · prune finish() 결과 구조화·--finish --json 허용. 테스트: lib/git-branch-entry.test.js · lib/gate-ledger.test.js · hooks/stop.test.js · hooks/pre-tool-ask.test.js · scripts/prune_finish.test.py (cd 전용 테스트 없음).

## D. 과거 결정·규칙 (codex pastrules)
- 2026-10-03 공용 계획 채널(docs/tasks/2026-10-03-shared-plan-channel.md, executing): 1단계 현황판만 실행. 인벤토리 #21 「/cc 가 executing·blocked 기록」(:134) · :395 「session-start 가 답 도착 계획 알림」 = 이번 (f)(g)와 겹침. 기각: 승인 후 꺼진 세션 자동 실행, AgentMemory 연락망·lease, 서명 없는 승인 파일(:651).
- 2026-09-14 무정지 실행(:25,66): 승인 1회=끝까지, 정지 3종. **항목 선택 실행 `--only` 는 「대표가 필요하다고 할 때까지 보류」** — 지금 대표가 부분 승인 ≈10회로 필요를 보였다. 기각: 「계획에 배포 적혀 있으면 추가 확인 없이 실행」(:103).
- 2026-09-14 cp-native-artifacts(:104,135): 이중 승인 제거, 승인 메타. 낡은 계획 처리·/cd 재설계·다중 레포 순회 = 별도 후속으로 분리됨(= 이번).
- 2026-06-05 현대화 감사: `/cx` 세션 핸드오프 신설을 native resume 와 중복이라 DROP. progress-pulse DROP. SessionStart 의 조용한 정체 알림 선례, 전역 nag·cron 회피.
- 2026-08-07 하네스 감축: 보고만 하는 별도 에이전트 부활 = 기존 결정과 충돌. 진행보고 책임은 Leader.
- 2026-04-11 「폴더=상태, status 불필요」는 낡은 규칙 — 복원 금지.
- 규칙: harness-rules.md — 네이티브가 주는 일반 오케스트레이션 규칙 복붙 금지, Lens 고유 계약만(:12,45) · 보고 먼저·페이지와 질문창 중복 금지·watch 목록 판정(:277,307) · 대표 본인 댓글 머리표(:314) · 세션 상태는 세션별, 계획 원장은 레포별, 다른 세션 원장으로 현재 세션 막기 금지(:297) · Stop 강제 재개·반복 차단 부활 금지(:302) · 훅 fail-soft, timeout 초(:305). document-conventions.md 상태 전이(:138,246) — 스킬과 어휘 불일치. branch-lifecycle.md(:127,137,273).
- 릴리스: 새 스킬·훅·설정 = MINOR 이상. bump-version.sh → CHANGELOG → 버전 커밋 → 태그 → push → GitHub Release(release-guide.md:5,53,161). 캐시는 버전 단위. bump 검증 목록 12경로(bump-version.sh:126, 문서의 13/11 은 낡음).
- 새 스킬 추가 시: skills/<명령>/SKILL.md 신규(폴더 자동 발견, 중앙 등록 없음) · .claude-plugin/plugin.json·marketplace.json·.codex-plugin/plugin.json 버전 · CLAUDE.md 스킬 표 · README · docs/START_HERE.md · docs/rules/harness-rules.md · 필요 시 hooks/hooks.json · scripts/bump-version.sh 배너 목록(:80) · CHANGELOG. 선례 docs/history/2026-07-01-ci-creeta-install.md:15.
- 재사용: lib/session-store.js(~/.claude/lens/sessions/<id>/, progress·dashboard·blocks, 잠금·7일 정리) · lib/agent-tracker.js(세션 안 에이전트만) · show-report.js(표시 증거, 승인 증거 아님) · [APPROVED] 인계(scope 는 항목 수 — 항목 ID 별 부분 승인 모델 없음).
- 불일치: 「계획만 보관」도 status approved → 멈춤 알림 오탐. 실행 의도 구분 필요. ListAgents 사용 0건.
- lens.config.json: nonStopActions·autoCommitOnComplete·gateEnforcement·autoDeleteMergedBranch·protectedBranches 등. 관제·부분 승인·정체 알림 키 없음. config `version: 1.7.0` 은 플러그인 판이 아님.

## E. SJ-ROG 멈춘 계획 9건 (sonnet)
| 계획 | status | 분류 | 근거 |
|---|---|---|---|
| ko-missing-cards | approved | 판정 불가(끝났을 가능성) | 진행상황·체크리스트 없음, 관련 PR #155~157 병합 |
| ko-mirror-pc | approved | 일부만(T5 이후) | 체크 2/7, origin 가지에 미병합 인계 커밋 2 |
| cardmarket-price-guide | approved | 일부만(체크 미반영) | 체크 0/6 인데 T1·T3·T5 병합 |
| mkt-daily-pipeline | approved | 실제로 거의 끝남 | 운영 8단계 ok, 원장 24/25, 10-29 확인만 남음 |
| jp-card-price-outreach | approved | 대표 손 대기 | 구현·설치 끝, mac-001 로그인 대기 |
| megan-warmup | approved | 판정 불가 | branch·진행상황 없음, 관련 커밋 다수 |
| format-menu-restructure | approved | 다른 계획으로 대체 | 조사보고, 후속 PR #5 |
| creeta-lens-only-free-news | executing | 일부만 | 운영 배포, 원장 6/8, 문서 커밋 1 미병합 |
| referral-invite | executing | 일부만(진행 중) | #164·#166 병합, 진행상황은 「/cc 시작」에서 멈춤 |
자동 신호 제안: ① 가지가 병합·삭제됐는데 status approved/executing → 「닫을 때」 ② 진행상황 마지막 갱신·mtime N일(예 3일) 무갱신 → 「멈춤」 ③ 원장 unmet 과 체크리스트 대조, 원장 없으면 「검사 기록 없음」. **대기 사유 칸**(대표 손 대기 등) 없으면 정당한 대기와 방치를 구분 못 함.
