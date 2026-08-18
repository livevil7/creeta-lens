# lens — Plan-first execution engine for Claude Code

Plan-first execution engine for Claude Code: plan with /cp, build in parallel with /cc, sync repos with /cs, keep machine tooling current with /cu and /ci.

## Version

- Current: **v3.33.0**
- Updated: 2026-08-18
- Source of truth: `.claude-plugin/plugin.json`
- v3.33.0 feat/fix: **`/cs` 가 체크아웃된 브랜치 하나만 따라잡고 있었다.** 소유자 지적 *"로컬 커밋 따라잡는게 기본적으로 CS에 있어야 하는거 아니야?"*(2026-08-18). 발단은 `snapholo` 가 `/cs` 를 정상 완주하고도 아무것도 못 받은 것. 진단 둘이 서로를 가리고 있었다 — ① **pull 이 `@{u}`(HEAD 의 upstream) 만 봤다** → 체크아웃 안 된 브랜치는 후보에조차 없어 몇 번을 돌려도 뒤처진 채 `변경 없음` 으로 보고됐다. 실측: `Returns_ERP_v20` 로컬 `main` **194커밋** 뒤(staging 체크아웃), `snapholo` **226커밋** 뒤(task 브랜치 체크아웃). ERP 는 `staging → main` 승격이 배포 절차라 낡은 로컬 main 위 승격 = 사고. ② **`fetch` 에 `--prune` 이 없었다** → 지워진 원격의 트래킹 ref 가 영구 잔존하고, 그걸 추적하는 로컬 브랜치는 `0/0`="최신"으로 보인다. **①을 가리는 기전이 정확히 이것.** 실측 8개 repo 39개. 처방: ① **`fetch --prune`** ② **다중 브랜치 따라잡기** — `fetch <remote> <br>:<br>` 로 워킹트리·체크아웃 불변, ff 아니면 git 이 거부. 조건 3개 전부 충족 시에만(같은 **이름**의 원격 추적 / 고유커밋 0 / 실제 뒤처짐) — 이름 조건이 없으면 `feat/x → origin/main`(실측 배선)이 base 복제본이 된다. 다른 워크트리 점유 브랜치는 조용히 건너뜀 ③ HEAD 는 최신인데 다른 브랜치만 전진한 repo 를 `변경 없음` → **`📥 Pulled`** 로 재분류(`repo (main +194)`). 테스트 S11·S12 신설, 88 → **98/98 PASS**. 상세: `CHANGELOG.md`.
- v3.32.0 feat/fix: **`/cp` 가 양식에 맞춰 내용을 버리는 것을 멈춘다.** 소유자 지적 *"양식에 너무 얽매여서 해야 할 것들을 너무 줄여서 너무 빼먹는다"*(2026-08-17, 2026-07-15 재발). **산문 처방(원칙 0, v3.21)은 두 번 졌다** — 진단 ① 리터럴 템플릿이 섹션마다 불릿 2개·표 1행을 보여줘 *예시의 모양*이 산문 규칙을 이겼다 ② `Pre-mortem 최대 12건`·`분량은 합격 기준이 아니다` 같은 **셀 수 있는 캡**이 원칙과 공존했다(캡이 이긴다) ③ **누락을 잡는 검사가 없었다** — 게이트는 섹션의 *존재*만 봤고 조사 결과가 문서에 실렸는지 대조하는 단계가 0. 누락 비용이 0 이라 압축이 무료였다. 처방: ① **📋 작업 인벤토리(커버리지 원장) + Phase 2.45 신설** — 문서 쓰기 *전에* 요청·조사·대화 언급을 전수 수집해 항목마다 **포함(+반영 위치)** 또는 **제외(+사유)** 확정 ② **`validatePlanCoverage()` 코드 게이트**(Phase 5.0 §4.6 · Deep S7) — 포함인데 위치 공란 / 제외인데 사유 없음 = reject. 승인 화면에 `인벤토리 N건 → 포함 M / 제외 K` 표시 ③ **원칙 0-A** — "템플릿은 크기 예시가 아니라 섹션 계약", 예시의 항목 수 따라하기 금지 + **섹션 목록은 최소집합이지 상한이 아니다**(주제가 요구하면 새 `##` 생성) ④ 반복 섹션 6곳 anti-exemplar 앵커 · 필수 본문 7→8 · 부록표에 열린 행 ⑤ **fix**: 12건 캡 제거(캡은 항목당 표현 길이지 항목 수가 아니다), "분량은 합격 기준이 아니다" 양방향 명시, 슬라이드 6장 캡은 HTML 뷰 전용(md 가 SoT). 테스트 `lib/plan-coverage.test.js` 16/16. 상세: `CHANGELOG.md`.
- v3.31.0 breaking: **`/cs` 가 미러가 된다 — 런이 끝나면 클라우드가 곧 최신.** 근거는 소유자의 목적 진술 *"병합을 하던 뭘 하던 그건 모르겠고, 깔끔하게 클라우드에 올려놓고 다른 컴에서 그대로 받아 작업"*(2026-08-14) — **"PR 보장" 전제 자체가 철회됐다**(경위: `docs/rules/branch-lifecycle.md` §8). ① **기본이 base 직push 미러** — `sync/` 브랜치·PR·`gh` 불필요, ff 전제(force 금지, 거부되면 로컬 커밋 보존 → 다음 런 재시도). ② **`LENS_SYNC_PR` 의미 반전** — 기본 `0`(미러), `1` 이 레거시 PR-and-merge opt-in. `LENS_SYNC_AUTO_MERGE` 는 레거시 경로 전용. ③ **성공 = 불변식**(로컬==origin/base ∧ dirty 0 ∧ 열린 sync PR 0) — 미충족은 사유 버킷으로, "겉보기 32/32" 뒤에 미병합이 숨지 않는다. ④ **reconcile 신설** — 자기 `sync/` 잔여물을 매 런 회수(열린 PR 병합·삭제, 병합 증명된 브랜치만 atomic 이중 lease 삭제, 미증명 보존). 실측 부채: 열린 자동 PR 6건·잔여 브랜치 14개, 회수한 런 0. ⑤ `syncPolicy: "pr-manual"`(ERP=배포 게이트, staging 하드가드 이중화) · task 브랜치 가드 스크립트 이관 · base 밖 브랜치 나이 보고(7일↑ 경고). ⑥ **fix**: 머지 실패가 `pushed` 로 집계되던 결함, 미병합 시 `reset --hard` 유실 기전(2026-08-02 기전) 제거, `--json` 무효 JSON 2줄, `for-each-ref` glob 이 `sync/x` 를 놓치던 문제. 상세: `CHANGELOG.md`.
- v3.30.0 feat/fix: **미릴리즈 18커밋 정리 릴리즈.** ① **브랜치 생명주기 병합** — 2주간 `feat/branch-lifecycle` 에 갇혀 있던 작업(Codex 12차 리뷰, P1 26건·P2 30건 수정)을 v3.29.0 위로 병합. 충돌 5건 해소: `/c`·`/ccp` 는 master 의 삭제 채택(v3.29 폐지 결정 존중), `harness-rules.md` 는 양쪽 §4.5 번호 충돌을 §4.7 이동으로 해소. ② **진행보고 2분 복원** — v3.29.0 의 5분은 사용자 전역 지침("2분 주기")에 대한 회귀였다. **수행 주체는 Leader 유지**(Monitor 폐지 그대로) — 누가/얼마나자주 두 축은 독립. ③ **fix: `/cu` winget 소스가 한국어 Windows 에서 통째로 누락** — 21건→0건 조용한 실패. 원인 2개(영문 전용 헤더 라벨 + 컬럼 위치를 문자 인덱스로 반환했으나 소비자는 표시 폭을 기대). 로케일 별칭은 구체적인 것부터(`장치 ID` > `ID`). 실캡처 픽스처 + 회귀 테스트 3건, 71/71. 상세: `CHANGELOG.md`.
- v3.29.0 breaking: **하네스 감축 — 네이티브가 흡수한 규율 걷어내기.** LLM 세대가 오르며 Lens 가 대신 강제하던 규율이 Claude Code 하네스로 흡수됐다. 라이브 세션(2.1.222) 시스템 프롬프트·도구 설명과 문장 단위 대조 후 중복 제거. ① **`/c`·`/ccp` 스킬 폐지** — `/c`(777줄)는 하네스 본체+TodoWrite 가 기본 수행, `/ccp`(228줄)는 Workflow Quality patterns 과 항목명까지 1:1 + `claude ultrareview`·`/code-review`·`/security-review` 가 대체(실행 증명 축은 `/cc` P6 QA 존치). ② **전담 Monitor 에이전트 폐지** — 하네스가 완료 시 본체를 자동 재호출하고 `ScheduleWakeup` 설명이 폴링을 금지한다. **진행보고 의무는 유지, 수행 주체만 Leader 본체로.** ③ **오케스트레이션 규율 6항목·QA 패턴 4항목·"침묵은 성공이 아니다" 삭제** — 전부 Agent·Workflow·Monitor 도구 설명에 존재. ④ **Karpathy 4규칙 전문 복붙 12곳 → 1곳**(`/cc` 워커 dispatch — 서브에이전트는 전역 지침을 못 읽음). ⑤ **SessionStart 주입 4,804B → 603B** — 스킬표·추천규칙·Suggestion Line 제거(호스트가 이미 제공), 키워드 추천기 `lib` 2개+캐시+죽은 설정 4키 삭제. ⑥ `harness-rules.md` §4.5(Rule 1↔되묻기 충돌 심사)·§4.6(Monitor 폐지)·§5(추적표) 신설, §1 예외 3→2(만능 우회로 폐지, 남은 예외의 전제가 미검증임을 명시). ⑦ **fix: 슬래시 OVERRIDE 가 v3.13 이후 무동작이었다** — `autoRecommend:false` 조기 반환이 그 아래 OVERRIDE 까지 죽이고 있었음, 복구·실측. 상세: `CHANGELOG.md` + `docs/history/2026-08-07-harness-thinning-audit.md`.
- v3.28.0 fix: **`/cs` 가 조용히 덜 하고 있던 것 3건** — ① **홈 직하 repo 를 통째로 놓쳤다.** 루트가 `Documents/Git`·`projects`·`git` 뿐이라 홈 바로 밑 repo 는 어디에도 안 걸렸다. 실측: Mac Mini 36개 중 **32개만** 돌고 있었고, 빠진 4개에 **Claude 파일 메모리가 사는 `livevil-setting`** 이 있었다 → `$HOME` 을 루트에 추가(dedup 로 중복 없음). ② **없어진 원격 13개를 매번 '실패'로 쌓았다** → `⚠️ 원격 없음` 분리 + 재시도 스킵 + `--json` 에 `missing_remote`. ③ **SessionStart 자동 pull 이 헤드리스 `claude -p` 에도 붙는다**(실측 누적 20,027 세션) → 환경 스니핑 대신 **최소 간격 가드**(기본 30분, `LENS_SYNC_PULL_INTERVAL_MIN`). ⚠️ 무인 서버는 여전히 cron 이 답이다. 상세: `CHANGELOG.md`.
- v3.27.0 breaking: **`/cs` PR-only → PR-and-merge** — PR 은 "무엇을 올렸는지"의 기록이지 통과 게이트가 아니다. v3.25.0 이 자동 머지를 잘라내면서 **1순위 목적(전 레포 GitHub 동기화)이 막혀 있었다** — 병합 전까지 변경이 로컬 워킹트리에도 다른 머신에도 없어 라이브 메모리가 두 번 사라졌고(2026-08-02 17개·2026-08-04) PR 3건 방치로 Mac Mini 가 26커밋 뒤처졌다. 원인은 목적의 전도 — 당시 사용자 선택은 "PR + 자동 머지"였는데 Codex 의 *"auto-merge 면 PR 은 기록용 포장"* 반박이 채택됐다. **그 "기록용 포장"이 이 도구가 원한 것 그 자체였다.** 이제 PR 생성 후 같은 실행에서 병합하고, 거부되면 `미병합` 으로 보고한다. 되감기의 진짜 원인은 `reset --hard` 가 아니라 **base 가 커밋을 못 받는 것**이었다(커밋은 sync 브랜치에 있으므로 `checkout base` 만으로 빠진다). 탈출구 `LENS_SYNC_AUTO_MERGE=0`. 상세: `CHANGELOG.md`.
- v3.25.0 feat/breaking: **계획 엔진 개편**. ① **`/cpp` 폐지 → `/cp deep` 흡수** (3등급 fast/standard/deep, 트리거 22개 이관, `planner: cpp` 하위호환). ② **등급 기준 = 분량이 아니라 위험도** + `/cp fast|standard|deep` 명시 지정 + **양방향 불일치 가드**(낮춰=강한경고/높여=가벼운안내). ③ **골격 신규 필수**: 🚧비목표·🔀**검토된 대안**·🚫DO NOT CHANGE·⚠️리스크 레지스터·❓미해결 질문(차단만 0). 필수 7 + 조건부 부록. ④ **실행 진입 게이트**(`/cc`·`/c`) — 작성 시점은 우회 경로가 많아 실행 시점에 검사. 미달 시 실행 거부. ⑤ **되먹임 고리** — 핸드오프 4블록 확장 + worker 프롬프트 주입 + 편차 기록 + 실행 지표(추가 질문 수). ⑥ **모델 상속 폐기** — 모든 spawn 모델 명시, `/ccp` TOP 6→1, `/cc` 연쇄승격→위험도 기반, TOP 상한. 계측 훅 배선. ⑦ **`/cs` PR-only** — 커밋 **전** 브랜치 분기, fail-closed, base=upstream, 미병합≠동기화완료. ⑧ `validatePlanStructure` 부활(v3.4 골격에서 3세대 드리프트). ⑨ 진행보고 생존확인 의무. ⑩ codex 타임아웃 규모분기(180/300/600). 상세: `CHANGELOG.md` + `docs/tasks/2026-07-20-lens-plan-engine-overhaul.md`.
- v3.24.0 feat: **모델 정책 전환 — 고정 모델명 폐지, 난이도 사다리 + 최신 최고 모델 자동 추종** (사용자 지시: 무차별 최고 모델 배정 금지). ① Claude 축 — Easy=경량(현재 haiku)/Medium=중간(현재 sonnet)/Hard=**TOP**(세션이 enum 최상위 이상이면 상속, 미만이면 enum 최상위 명시 — 현재 fable). 칸=상대 위치라 모델 세대와 함께 자동 상승. `/c`·`/cc` 사다리 통일(`/cc` v3.11 "전부 opus" 폐기), `/ccp`=Hard 성격→TOP, Supervisor/QA=최고 Worker 티어 동급, Monitor=haiku. ② codex 축 — `-m gpt-5.5` 폐지 → **resolver**(`~/.codex/models_cache.json` priority-1 동적 선택, 현재 gpt-5.6-sol) + `MODEL_ARG` 배열 분기(빈 `-m ""` 차단) + ⚠️ 강등 플래그 의무. ③ capability-assumptions에 모델 드리프트 감시 채널. 상세: `CHANGELOG.md` + `docs/rules/codex-integration.md` §4·§6 + `docs/rules/harness-rules.md` §4.1.
- v3.23.0 feat: **`/cp flow` 신설 + Fable 하네스 규칙 이식**. ① FLOW 모드 — 프로젝트의 "이용자 단계별 화면 ↔ 엔진/모듈 ↔ 종속·재사용"을 한 장의 인터랙티브 플로우차트로 그려 `docs/rules/flow.md`(SoT)+`flow.html`(뷰, **05-dark-developer 토큰**) = 전체 그림 Rule. 템플릿 쌍(`templates/flow.template.md`+`flow-viewer.example.html`, livevil-boost 일반화) + CONVERT `doc_kind: flow` 가드(flow 뷰어가 task 덱으로 덮이는 사고 차단). ② 하네스 규칙 — 공개 추출본(Claude Code 2.1.172 Fable, 비공식·재서술) 기반 `docs/rules/harness-rules.md` SoT + 6개 스킬 역할별 인라인(워커 "작업 규율"·Monitor "침묵은 성공이 아니다"·/cc 오케스트레이션 규율·/ccp QA 패턴·/cp·/cpp elicitation gate·/cr 리서치 규율). **additive-only 원칙**(하네스가 이미 강제하면 재복붙 금지). 상세: `CHANGELOG.md`.
- v3.21.1 fix: **`/cc` 병렬 미실행 + 스킬 미활용 회귀 수정** (13에이전트 조사+적대적 검증). ① Worker 가 **Task 도구에 바인딩 안 됨** — 어느 버전에도 "Task 도구로 spawn" 지시가 없어(멘션 0건) Leader 가 혼자 순차 처리/텍스트 나열로 빠짐 → Phase 3.2 에 "Task 도구 N회 병렬 호출(순차 await 금지)" 구체 directive 복원. ② **Supervisor 스킬 감사 슬래시 불일치**(v3.20.0 도입) — Worker `Skill invoked: ui-ux-pro-max`(슬래시 없음) vs 감사 `/{skill_name}`(슬래시) → 정상 호출도 0점→재할당 루프. 매칭 문자열 통일. ③ Phase 1.3 가 주입된 스킬 인벤토리 표를 SoT 로 참조하도록 명시. 상세: `CHANGELOG.md`.
- v3.21.0 feat: **계획서 과잉요약 차단 + 필수 섹션 확장** — 계획 md 가 `/cc` 실행 TodoWrite 보다 짧게 요약되던 근본 원인(brevity 조항 vs 누락금지 모순)을 **원칙 0 "간결=군더더기 제거이지 누락이 아니다"**(최상위 override, 충돌 시 완전성 승, **계획 md ≥ 실행 Todo**)로 차단. `/cpp` "항목당 한 줄"→"필요한 만큼"(천장 오해 제거), spine 6→8섹션. 신규 필수: **🧰 실행 전략&자원**(난이도·권장 모델·병렬 에이전트수[ultracode]·활용 설치 스킬 자동감지·기존 자원), **💡 시사점/⚠️ 주의점/🔀 Side Effect**, **✅ 검증 전략**(Playwright/데이터/staging·범위·보고 명시), **❓ Why=6하원칙**. 양쪽 게이트 강제(`/cp` Phase 5.0 내용완전성·`/cpp` S6/S7). 상세: `CHANGELOG.md`.
- v3.18.0 feat: **`/cpp` 대형 기획안 재포지셔닝** — Codex 협의·HTML 슬라이드 등 모든 글자수/분량 캡 해제, 큰 작업이면 항목 전량 수록. `/cp`=간결(캡 유지). 분량캡의 원래 목적(코딩 주저리 차단)을 **"항목당 사용자 언어 한 줄+전량+체크리스트"**로 대체. 신규 **task-deep HTML 양식**(슬라이드 무제한, Plan N장), `/cp html` 이 `planner: cpp` 감지해 task-deep 위임(6장 회귀 차단). 상세: `CHANGELOG.md`.
- v3.17.0 feat: 계획 스킬(`/cp`·`/cpp`)을 **What / Why / How / Review** 4대 골격으로 통일 + **❓ Why(왜) 신규 필수 섹션**(문제·동기·안 하면 생기는 비용 — 비면 게이트 reject, Fast 도 한 줄 필수). `/cp` 문서 템플릿 What→Why→How→Review 재배치(Plan A/B 는 How 하위로, 내용 보존)·Goal 게이트 4→5조건, `/cpp` spine 5→6섹션·S0/S7 Why, `/cc` 핸드오프에 `[WHY]` 블록. 더불어 **`/cc`↔`/ccp` 경계 재조준** — `/cc`=개발(빌드), `/ccp`=개발됐거나 가동 중인 것 전체 리뷰→QA→수정(핵심 페어 `/cc`→`/ccp`, 메커니즘 불변). 상세: `CHANGELOG.md`.
- v3.16.0 feat: 신규 skill **`/ccp`** (Lens Power Verify) — 적대적 검증·수복 엔진. 이미 만들어진 것(출처 불문 — 다른 세션·수동·PR·방금 빌드)을 받아 **실제 실행(Playwright/앱/curl)으로 작동 증명** → **4 렌즈 적대적 다중검증**(기능·엣지·회귀·UX, UI면 +접근성/반응형, API면 +보안/권한) → **만장일치 게이트**(blocking refute 1+면 fail) → 최소 수복(실패 축만, pass 축 freeze) → 증거 리포트(verified true/false). 경계(Codex 합의): `/cc`=만들면서 검증, `/ccp`=이미 만들어진 것 독립 감사. **안전장치**(Codex): read-only 우선·파괴적(배포·DB·결제·대량삭제) 승인 게이트·5회+예산 cap·동일실패 2회 전략전환·정직한 종료(verified=false). 더불어 **5분 진행보고 공통 규칙** — `/cc`(2→5분)·`/cp`·`/cpp`·`/ccp` 모두 장시간 작업 시 5분 주기 진행보고. 상세: `CHANGELOG.md` + `docs/tasks/2026-06-11-ccp-power-verify.md`.
- v3.15.0 feat: 신규 skill **`/cpp`** (Lens Power Plan) — 빌드레디 심층 계획 엔진. `/cp` 와 의도된 **fast/deep 페어**. 사용자 언어 목표(고정)만 잠그고 본문은 **주제 적응형**(고정 Plan A/B 폐기), 전방위 fan-out 조사(6축 병렬 서브에이전트), 도메인 딥스펙(UI→ASCII 와이어프레임+상태+문구+데이터바인딩), **Codex 교차 협의 양보불가 하드게이트**(미감지=정지·보고), 빌드레디 태스크(경로+변경+검증+[P]/의존), EARS 검증. 벤치마크: GitHub Spec Kit(constitution/clarify/analyze)·AWS Kiro(EARS/waves)·obra Superpowers(writing-plans). 더불어 **`/cp` 슬림화** — 속도 등급(Fast/Standard) 도입: Fast 는 Codex·Plan B·Pre-mortem·HTML 슬라이드 skip 후 Goal→Plan A→md+board→승인 직행(빠른 수정용), Deep 신호는 `/cpp` 로 라우팅. Goal 은 등급 무관 항상 필수. 상세: `CHANGELOG.md` + `docs/tasks/2026-06-11-cpp-power-plan.md`.
- v3.11.0 feat: codex 호출 + Claude 실행을 **깊게+빠르게**로 통일(토큰 비용 비고려). codex 표준 호출에 `-m gpt-5.5 -c model_reasoning_effort=xhigh -c service_tier=priority -o "$OUT"`(깊이·속도 독립 다이얼), `-o` 본문 수거+고유 파일명. `/cc` Worker/Supervisor/QA → `opus` 고정(Monitor만 haiku). 군더더기 제거: blocking timeout(background 모델과 모순) + 취약한 stdout awk 파싱. 모델 drift 정리(GPT-5.2→gpt-5.5). 실측 근거: low 추론은 xhigh보다 토큰 6배+속도 이득 0. 상세: `CHANGELOG.md` + `docs/rules/codex-integration.md` §4·§5·§7.
- v3.10.0 feat: 신규 skill **`/cps`** (Lens Start) — 어떤 레포든 `docs/START_HERE.md`(레포 first-read 진입점 + 질문 라우팅)를 실제 docs 스캔 기반으로 생성. 인벤토리는 추론 금지(허구 경로 0, 근거 부족은 `(Not documented yet)`), 기존 파일은 diff+승인 게이트(비파괴), CLAUDE.md 포인터는 없을 때만 1줄 조건부 주입. 더불어 **`/cp done` 강화** — 새 task 만이 아니라 `docs/tasks/` 의 기존 task 를 전수 재평가해 "완료추정/진행중/수동확인필요" 자동 분류 + 완료추정 일괄 아카이브 제안(신호 상충 시 안전쪽 우선, 자동삭제 금지, DONE Phase 2~4 불변). 상세: `CHANGELOG.md`.
- v3.9.0 feat: Codex 를 **공동 조사자·검증자**로 격상 — 이종 모델 더블 검증. `/cp` Phase 0.5(Codex 병렬 독립 조사) + Phase 2.4(듀얼 합성·교차검증, `🔀 듀얼 합성` 섹션), `/cc` Phase 4.5(Codex 코드리뷰 게이트 — Supervisor+Codex 둘 다 pass 여야 진행). trivial 제외 항상, Codex 부재 시 graceful degrade. 산출물 링크 풀 경로 강제. 상세: `CHANGELOG.md` + `docs/rules/codex-integration.md` §8.5.
- v3.8.0 feat: `/cp` Goal 을 **사람 중심 2층 구조**로 전환 — 🎯 목표는 "무엇이 가능해지는가"(사람 언어, 기술 토큰 금지), 기술 증거(`201`/`user row` 등)는 전부 ✅검증 표로 격리. Goal 인터뷰(Phase 0.0), 서브골 분해(0.2), 검증표 `종류`(auto/manual) 칼럼, Goal 게이트에 기술토큰·매핑 검사 추가. `lib/plan-manager.js` 전면 동기화(8-lang dict / generatePlanContent / extractGoal 다국어 헤더). 상세: `CHANGELOG.md`.
- v3.7.0 feat: plan 문서에 `✅ 검증(Verification)` 섹션 신설(필수, `REQUIRED_SECTIONS`) — 각 성공 기준의 검증 방법+기대 결과 표. 네이티브 Claude Code `/goal` 연동(`/cp` 가 `/goal` 명령 emit, `/cc` 가 증거를 transcript 에 명시). placeholder 정규식이 `%{}`/`${}` 오판하던 회귀 수정. 상세: `CHANGELOG.md`.
- v3.6.2 fix: `/cp` PLAN/DONE 흐름에 HTML 보고서+board 생성을 **필수 Phase(2.6 / 3.5)** 로 박음 — 부록 섹션에만 있어 md 만 나오던 문제 해결. `reportFormat` opt-in 무관, 한 번에 md+HTML+board 산출. 상세: `CHANGELOG.md`.
- v3.6.1 fix: board "convert to html" 버튼이 `file://`(비보안 컨텍스트)에서 clipboard 차단 시 수동복사 모달로 폴백 (`isSecureContext` 게이트). 상세: `CHANGELOG.md`.
- v3.6.0 breaking: `/cp` board 전면 재설계 — `docs/{tasks,history,rules}/` 3-폴더 통합 인덱스 `board_<repo>.html` 생성 (schema v3), `/cp html <md>` CONVERT 모드 신설, `docs/reports/` 폴더 폐지 (비파괴적: 기존 reports/ + board.html 그대로 보존). 상세: `CHANGELOG.md`.
- v3.4.0 breaking: plan 문서가 Goal-first 구조로 전환 (`Goal → Plan A → Plan B → Risks → Progress → Status`). `/cc` 는 Goal-aware 실행 엔진으로 격상 (SUCCESS_CRITERIA 미달 시 done 차단, Plan A↔B 사용자 confirm 전환). 상세: `CHANGELOG.md`.

## Skills

| Skill | Description | Workflow |
|-------|-------------|----------|
| `/cc` | 개발(빌드) — 병렬 멀티에이전트 엔진 | Scan → Multi-Match → Parallel Execute → Synthesize |
| `/cp` | 계획 엔진 — **3등급(fast/standard/deep)** | 등급은 **위험도**로 판정(분량 아님). `/cp fast|standard|deep <요청>` 명시 지정 + **양방향 불일치 가드**(낮춰=강한경고/높여=가벼운안내). 골격 **What→Why(6하원칙)→🧰실행전략→How→💡시사점/주의점/SideEffect→✅Review(검증수단)**. deep = 6축 fan-out + **Codex 하드게이트** + 빌드레디 태스크 + 되묻기 0 (구 `/cpp` 흡수) |
| `/cps` | Repo orientation doc | Scan docs → Assemble 4 sections → Diff gate → Write → Conditional CLAUDE.md pointer |
| `/cr` | Creeta Research (라이브 딥리서치) | Refine topic → Read live-research substrate → multi-angle parallel gather (Exa·GitHub·YouTube·community·RSS) → cross-check conflicts → report to conversation (no file saved) |
| `/crv` | Self-modernization audit | Load registry → probe/web native capabilities → classify KEEP/THIN/OBSOLETE + upgrade/ergonomics → (deep) conversation mining → report + /cp handoff → stamp |
| `/ci` | Install sync (per-user) | Dry-run diff (manifest ↔ installed) → 4-bucket preview (install/remove/foreign/ok) → approve → install missing (marketplace add + `install --scope user`) → remove **only excluded** (backup + per-item confirm) → foreign report-only → re-diff. Self-protecting: never uninstalls Lens. Backend `lib/install-sync.js` |

- `/cc <request>` decomposes the request and runs the pieces as parallel Task agents, then synthesizes outputs
- `/cp <request>` generates a work plan document, gets user approval, then executes
- `/cps` generates/updates `docs/START_HERE.md` — a repo's first-read orientation + question-routing entry point
- `/ci` syncs installed plugins to a per-user manifest (`~/.claude/lens/manifest.json`): installs missing, removes only explicitly-excluded (backup + per-item confirm), reports foreign read-only
- Any command with no args shows full skill inventory

## Hooks (5)

| Hook | Event | File | When |
|------|-------|------|------|
| SessionStart | Session start (once) | `hooks/session-start.js` | Loads session memory + plan history, inits dashboard + plans dir, emits the `/crv` staleness nudge. **Injects no skill inventory** (v3.29 — the host already provides one) |
| UserPromptSubmit | Every message | `scripts/user-prompt-handler.js` | `/command` override only (v3.29) — forces the Skill tool to fire immediately on an explicit slash command. Keyword auto-suggest removed |
| PreToolUse | Before Task tool | `hooks/pre-tool-task.js` | Registers sub-agent as "running" in dashboard |
| PostToolUse | After Task tool | `hooks/post-tool-task.js` | Marks a **synchronous** sub-agent `done`/`error` with its duration. A **background** launch is marked `launched` (completion never observed) — never `done`, and excluded from "all complete" wording |
| PostToolUse | After every tool | `hooks/post-tool-progress.js` | Enforces the 2-minute progress-report rule: injects a reminder when background work is in flight and the last report is over 2 minutes old. Silent otherwise |
| Stop | Every turn end | `hooks/stop.js` | Finalizes the session and sweeps orphaned `running`/`pending` agents to `error`. **`launched` is exempt** — an unobserved agent is not a failed one |

## Libraries (lib/)

| Module | File | Key Exports | Description |
|--------|------|-------------|-------------|
| Skill Scanner | `skill-scanner.js` | `scanInstalledSkills()`, `formatSkillTable()`, `detectDomain()` | Scans `~/.claude/plugins/cache/`. Skills, MCP, LSP, Hybrid. Used only for the SessionStart one-line count since v3.29 |
| Memory Store | `memory-store.js` | `loadMemory()`, `saveMemory()`, `recordSessionStart()`, `recordSkillUsage()`, `recordPlanCreation()` | Persists at `~/.claude/lens/.lens-memory.json`. Usage counts, recent skills, plan history |
| Agent Tracker | `agent-tracker.js` | `initSession()`, `registerAgent()`, `completeAgent()`, `endSession()` | Tracks Task agent lifecycle in `.lens/agent-dashboard.json`. Atomic writes, error logs |
| Plan Manager | `plan-manager.js` | `getPlansDir()`, `ensurePlansDir()`, `getStatePath()`, `generateSlug()`, `generateFileName()`, `generatePlanId()`, `savePlanState()`, `loadPlanState()`, `listPlans()`, `formatPlanSummary()`, `generatePlanContent()`, `parsePlanFrontmatter()`, `updatePlanStatus()`, `validatePlanStructure()`, `validatePlanCoverage()`, `REQUIRED_SECTIONS`, `extractGoal()`, `extractPlanBTriggers()` | Plan file naming (`YYYY-MM-DD-slug.md`), Goal-first document generation (8-lang headers), YAML frontmatter parsing, status lifecycle, state at `.lens/plan-state.json`. v3.4+ `extractGoal` / `extractPlanBTriggers` 는 `/cc` 핸드오프 진입 시 SUCCESS_CRITERIA 와 Plan B Trigger 매칭에 사용. **v3.32+ `validatePlanCoverage` = 커버리지 원장 게이트** — `validatePlanStructure` 가 섹션의 *존재*를 보는 반면 이쪽은 **항목의 누락**을 본다(📋 작업 인벤토리 표: 포함이면 반영 위치, 제외면 사유). `/cp` Phase 5.0 게이트 4.6 · Deep S7 에서 호출. 테스트 `lib/plan-coverage.test.js` (16단언) |

## Folder Structure

```
lens/
├── .claude-plugin/
│   ├── plugin.json            # Plugin manifest (version source of truth)
│   └── marketplace.json       # Marketplace registration
├── skills/
│   ├── cc/SKILL.md            # /cc — parallel multi-agent engine
│   ├── cp/SKILL.md            # /cp — plan-first execution (3 grades)
│   └── …                      # ci, cps, cr, crv, cs, cu, lens-upgrade
├── hooks/
│   ├── hooks.json             # Hook registration (5 hooks)
│   ├── session-start.js       # SessionStart handler
│   ├── pre-tool-task.js       # PreToolUse (Task) handler
│   ├── post-tool-task.js      # PostToolUse (Task) handler
│   └── stop.js                # Stop handler
├── scripts/
│   └── user-prompt-handler.js # UserPromptSubmit handler
├── lib/
│   ├── skill-scanner.js       # Plugin scanner (Skills, MCP, LSP)
│   ├── memory-store.js        # Session memory persistence
│   ├── agent-tracker.js       # Agent dashboard state management
│   └── plan-manager.js        # Plan document management
├── templates/                     # AI reference only — code (generatePlanContent) does NOT read these at runtime
│   ├── plan.template.md           # /cp work plan structure reference
│   ├── execution-result.template.md # Post-execution result structure reference
│   └── synthesis.template.md      # /cc synthesis output structure reference
├── docs/
│   ├── DOCUMENTATION-GUIDE.md # Documentation standards
│   └── DOCUMENT-CONVENTIONS.md # Document writing conventions
├── lens.config.json          # Runtime configuration
├── CLAUDE.md                  # This file (AI briefing)
├── CHANGELOG.md               # Version history
├── README.md                  # User-facing documentation
└── LICENSE                    # MIT
```

## Configuration (lens.config.json)

| Option | Default | Description |
|--------|---------|-------------|
| `memoryPath` | `null` | Custom memory file path (null = `~/.claude/lens/`) |
| `planDir` | `null` | Custom plan file directory (null = project `docs/`) |
| `defaultPlanLanguage` | `null` | Force plan language (null = auto-detect from user) |
| `saveSynthesisResults` | `true` | Save /cc synthesis results to .lens/results/ |
| `resultsDir` | `null` | Custom results directory (null = `.lens/results/`) |
| `autoCommitOnComplete` | `true` | `/cc`/`/cps`: auto commit+sync after gates pass. Respects `.gitignore` (does NOT extra-filter secrets — user version-controls secrets deliberately); branch-first; diverged→report-only. Set `false` to opt out |
| `capabilityAuditNudge` | `true` | Show `/crv` staleness nudge at session start (Lens repo only, no network) |
| `capabilityAuditIntervalDays` | `30` | Days before the `/crv` audit is considered stale |

## Detection Targets

| Type | Detection Method | Example |
|------|-----------------|---------|
| Skill | `skills/*/SKILL.md`, `commands/*.md` | `/commit`, `/pdca` |
| MCP | `.mcp.json` (direct + `mcpServers` wrapper) | context7, playwright |
| LSP | `lspServers` in `plugin.json` | typescript |
| Hybrid | Skill + MCP in same plugin | Marked with `hasMcp` flag |

## Runtime Files (git-ignored)

| File | Location | Purpose |
|------|----------|---------|
| `.lens-memory.json` | `~/.claude/lens/` | Session memory (usage counts, history) |
| `agent-dashboard.json` | `.lens/` (project root) | Agent lifecycle tracking |
| `plan-state.json` | `.lens/` (project root) | Plan status tracking (draft→approved→completed) |
| `*.md` plan files | `docs/` (project root) | Work plan documents (`YYYY-MM-DD-slug.md`). Config `planDir` overrides |
| `*.md` synthesis files | `.lens/results/` | `/cc` synthesis results (when `saveSynthesisResults` is true) |

## Languages

EN, KO, JA, ZH, ES, FR, DE, IT (8 languages)

## 문서

- 먼저 읽기: [docs/START_HERE.md](docs/START_HERE.md) — 레포 진입점 + 질문 라우팅
- 진행 중인 작업: `docs/tasks/` 확인
- 프로젝트 규칙: `docs/rules/` 확인
- 라이브 리서치: [docs/rules/live-research.md](docs/rules/live-research.md) — 라이브리서치 substrate(/cpp·/cr 참조)
- 작업 히스토리: `docs/history/` 참조
- 변경 이력: [CHANGELOG.md](CHANGELOG.md)
