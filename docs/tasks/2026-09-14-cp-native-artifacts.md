---
plan_id: 2026-09-14-cp-native-artifacts
planner: cp
planner_model: fable (세션 자체)
grade: 기본
created: 2026-09-14
status: executing
approved_at: 2026-09-14T21:45+09:00
approved_via: AskUserQuestion
approval_note: "지금 실행 — 이대로 구현 (4차, 인벤토리 88 → 포함 75)"
repo: creeta-lens
base: master
branch: feat/cp-native-artifacts
pr: null
refs: []
---

# /cp 양식 강제 해제 + 계획서는 각 플랫폼 아티팩트로 보여준다

대표 지적(2026-09-14): *"cp 로 작성하는 양식이 너무 템플렛화 되어 있고, 이 스킬을 grok·codex 다 공통으로 쓰는데 md·html 로 만드는 걸 너무 강제해 놔서 각 플랫폼의 기획문서 아티팩트를 하나도 못 쓰고 보기 어려운 md 로만 기획서를 만들고 있다."*

## 🎯 목표

- `/cp` 가 어느 엔진(Claude Code · Codex · Grok)에서 돌든, 승인을 묻기 전에 **그 플랫폼이 가진 보기 좋은 화면**으로 계획서가 뜬다 — Claude 는 Artifact URL, Codex 는 대화 안 인라인 시각화, Grok 은 브라우저에 렌더된 문서.
- 계획서의 **모양이 주제를 따른다.** 열다섯 칸짜리 고정 골격이 아니라, 기계가 읽는 최소 계약 여섯 개만 지키면 제목·순서·나머지는 작업이 정한다.
- 슬라이드 HTML 덱·`_shared.css`·보드 HTML 을 만드는 파이프라인이 Lens 에서 사라진다(`/cp`·`/cd`·`/cps`·`/crv` 전부). md 는 **저장용**(게이트·Todo 파생·`/cc` 인계가 읽는 원본)으로만 남는다.
- 세 엔진이 **같은 버전**의 스킬을 읽고, 플러그인 루트 환경변수가 없는 엔진에서도 게이트 명령이 실제로 돈다.
- 계획서에 **신규 / 개선** 두 종류가 있다는 것을 스킬이 안다 — 개선형은 반드시 **AS-IS → TO-BE** 를 싣는다.
- 실행 Todo 는 **그 엔진의 네이티브 todo 도구**(Claude `TodoWrite` · Codex `update_plan` · Grok `todo_write`)로 등록되고, 계획서 모양이 템플릿과 달라도 파생기가 "없다"고 되돌려 보내지 않는다.
- **승인이 사람 순서로, 한 번만, 보고 뒤에** 온다 — 첫 화면에 결정할 것·직접 할 일·리스크가 보이고, 질문창은 보고 없이 못 뜨며, Execute 뒤 /cc 가 다시 묻지 않는다.
- **Modify 가 싸다** — 바뀐 것만 보여주고 같은 링크가 갱신되며, 페이지 댓글이 그대로 수정 지시가 된다.
- **훅·게이트가 조용하다** — 오탐 4종·반복 잔소리·워크스페이스 루트 오판·죽은 명령 안내가 사라진다.

**Done:** 같은 요청으로 `/cp` 를 Claude Code·Codex·Grok 에서 한 번씩 돌렸을 때, 세 곳 모두 "저장했습니다" 가 아니라 **읽을 수 있는 화면(URL·인라인·브라우저 창)** 이 먼저 뜨고, 세 계획서의 섹션 구성이 서로 달라도 게이트를 통과한다.

## ❓ 왜

- **지금 벌어지는 일(실측)**: 2026-09 계획서 41건 중 HTML 덱이 있는 건 6건, 35건이 md 뿐이다. snapholo-data 의 Codex·Grok 작성분은 전부 md 뿐이다. 즉 HTML 강제는 지켜지지도 않으면서, 지키려는 엔진은 자기 플랫폼의 아티팩트 대신 파일 덱에 매달린다.
- **강제 문구가 세 군데서 서로 모순된다**: Phase 2.6 "필수 — 산출물 게이트 강제" ↔ Phase 5.0 §4 "`<id>.html` 존재하는가?" 바로 밑에 "HTML 슬라이드는 필수가 아니다(v3.34)" ↔ "HTML 보고서 뷰" 절 "승인 게이트를 막지 않는다". 엔진마다 다른 문장을 골라 읽는다.
- **띄우기가 로컬 파일 기준으로 설계됐다**: `show-report.js` 는 `docs/tasks/<id>.html` 을 OS 브라우저로 열고, 없으면 원문을 `<pre>` 로 감싼 페이지를 연다. Artifact 는 SSH 일 때만 쓰는 폴백이다. Codex 의 `visualize` 는 아예 언급이 없다.
- **양식이 곧 내용을 눌렀다**: 코드 게이트(`REQUIRED_SECTIONS`)는 6개(+deep 3)만 보는데, SKILL.md 의 166줄 리터럴 골격은 `##` 15개 + 표 4개를 보여주고, 산문 §5 "내용 완전성 게이트" 가 🧰 실행전략·💡 시사점·✅ 검증전략을 추가로 강제한다. 모델은 규칙보다 예시의 모양을 따른다(v3.32 진단과 같은 기전).
- **세 엔진의 실행 조건이 다르다**: Codex 는 `~/.codex/plugins/cache/CreetaCorp/lens/3.24.0` — **열네 버전 전** 캐시를 읽는다(레포의 `.codex-plugin/plugin.json` 이 3.24.0 고정, `bump-version.sh` 9곳에 없음). Codex 는 `skills/` 만 로드하고 훅이 없으며 `${CLAUDE_PLUGIN_ROOT}` 가 비어 있어 `node ${CLAUDE_PLUGIN_ROOT}/…` 게이트 한 줄이 전부 무동작이다. Grok 은 `~/.claude/plugins/installed_plugins.json` 을 자동으로 읽어 v3.38 스킬과 훅을 그대로 쓰지만 인라인 아티팩트 표면이 없다(README 실측: 출력은 plain/json/streaming-json 뿐).
- **안 하면**: 대표가 매번 md 원문을 탐색기에서 찾아 읽는다(2026-09-04 지적의 재발). 세 엔진의 계획서 품질이 캐시 버전 우연에 좌우된다.

## 🔎 UX 전수 조사 결과 (2026-09-14 20:00–21:10, 워크플로 `wf_45c59006-0a5`)

- 발굴자 9개(전사 65개·Codex 799·Grok 1,020 세션·메모리 54·CHANGELOG·계획서 14건 정독·스킬 전량·엔진 표면·외부 벤치마크·훅 코드) → 원본 145건 → 병합 101후보(계획서에 이미 있음 6). 3렌즈 검증은 7건만 끝나고 **세션 한도로 죽었다**(에이전트 315개 큐잉 — 내 설계 잘못, 상한 없음. 메모리 `trap-workflow-fanout-burns-session-limit` 에 기록). 검증된 7건 중 6건은 "이미 계획서에 있음" 으로 확인.
- 나머지 94건은 발굴자 증거(인용·날짜·파일)만으로 아래 인벤토리 44~88 에 실었다. **재검증은 하지 않는다** — 구현 시 각 항목의 ✅ 행이 검증을 대신한다.
- 배치: **이 계획서에 얹음 35행(44–78)** = 승인 화면·질문·Modify·게이트/훅 소음·문서 언어·조사·레인. **계획서 2(실행·완료 UX)로 넘김 8행(80–87)** = /cc 실행 규칙·진행상황 갱신·/cd 재설계·실행 보고·BACKLOG·다중 레포. 제외 2행(79·88).
- 가장 센 신호 5개(발굴자 3개 이상이 독립적으로 짚음): 이중 승인(U14) · 승인 화면 계측치 우선(U25) · Modify 후 "바뀐 것" 없음(U16) · `/cp done` 죽은 명령(U54) · /cd 인터뷰 되묻기(U55).

## 📋 작업 인벤토리

| # | 작업 항목 | 출처 | 반영 위치 | 상태 |
|---|---|---|---|---|
| 1 | 166줄 리터럴 골격 삭제 → 6개 계약(+deep 3)만 `##` 로 요구, 제목·순서·나머지 섹션은 주제가 정한다 | 대표 요청 "템플렛화" | How A-1 | 포함 |
| 2 | 산문 §5 내용 완전성 게이트(🧰·💡·✅검증전략 강제) 삭제, 검증 수단은 ✅ 검증 안의 한 항목으로 | 조사(SKILL.md 5.0 §5) | How A-2 | 포함 |
| 3 | 골격의 🔀 3자 합성·⚠️ 사전 리스크·❓ 미해결·진행상황 자리표시자 제거(해당 Phase 가 결과 있을 때만 붙임) | 조사(SKILL.md 328–493) | How A-3 | 포함 |
| 4 | 📋 작업 인벤토리 + 커버리지 게이트 + Todo 파생은 **유지** — 누락 방지는 골격이 아니라 이게 한다 | 2026-07-15·08-17 대표 지시 | How A-4 · 🚫 | 포함 |
| 5 | /cp Phase 2.6(HTML+board 생성) 삭제 | 대표 요청 "md·html 강제" | How B-1 | 포함 |
| 6 | /cp Phase 5.0 §4 산출물 게이트에서 `<id>.html`·`board_*.html` 제거 — md 만 | 조사(모순 3곳) | How B-1 | 포함 |
| 7 | /cp Phase 4.5 step 1 "HTML·board 재생성" 삭제 | 조사 | How B-1 | 포함 |
| 8 | `/cp html <md>` CONVERT 모드 삭제 + "HTML 보고서 뷰 + Task Board" 절 삭제 | 조사 | How B-1 | 포함 |
| 9 | 절대 규칙의 `docs/tasks/<id>.html`·`board_<repo>.html` 풀경로 링크 요구 삭제 | 조사(SKILL.md 1035) | How B-1 | 포함 |
| 10 | /cd Phase 3.5(history 덱 + board 재빌드) 절 통째 삭제 | 조사(cd SKILL.md 298–304) · 결정 1 | How B-2 | 포함 |
| 11 | /crv Phase 4 덱 생성 문구 삭제 | 조사(crv SKILL.md 80) | How B-2 | 포함 |
| 12 | `templates/report-conversion-spec.md` · `report-plan.example.html` · `report-history.example.html` 삭제 | 조사 | How B-3 | 포함 |
| 13 | `templates/report-shared.css` 삭제 — 소비자는 슬라이드 덱과 board-builder 의 `docs/_shared.css` 배포(439행)뿐, 둘 다 사라진다 | 조사(board-builder.js:439) · 결정 1 | How B-3 | 포함 |
| 14 | Phase 4.5 를 플랫폼 네이티브로 재정의 — 판별은 env 가 아니라 **도구 표면**(Artifact 도구 → visualize 스킬 → 브라우저) | 대표 요청 "각 플랫폼 아티팩트" | How C-1 | 포함 |
| 15 | Claude: Artifact 발행이 **기본 경로**(폴백 아님), `artifact-design` 스킬 로드 후 읽히는 페이지로 | 조사(현 SKILL.md 4.5 §3) | How C-1 | 포함 |
| 16 | Codex: `visualize` 스킬로 스레드 시각화 디렉터리에 프래그먼트 작성 + `visualize{"path":…}` 참조 | 조사(~/.codex/plugins/cache/openai-bundled/visualize/1.0.37) | How C-1 | 포함 |
| 17 | Grok·헤드리스: md 를 **렌더한** HTML(헤더·표·목록·코드) 을 브라우저로 — 현 `<pre>` 원문 프리뷰 대체. 의존성 0 인 소형 렌더러를 `lib/` 에 | 조사(report-viewer.js renderPreview) | How C-2 | 포함 |
| 18 | `show-report.js --shown <method> <ref> <id>` 로 기록 통일, `SHOWN_METHODS` = artifact · inline · browser | 조사(report-viewer.js:43) | How C-3 | 포함 |
| 19 | SSH·헤드리스 `remote` 정직성 조항 유지 — 승인 화면 첫 줄에 실패 명시 | 조사(harness-rules §4.8) | How C-3 · 🚫 | 포함 |
| 20 | 아티팩트 페이지 내용 규칙: md 원문 복붙 금지, 읽는 순서(목표→왜→인벤토리→어떻게→검증→리스크)로 재배치, 인벤토리 표 전량 | 대표 "보기 어렵게" | How C-4 | 포함 |
| 21 | `.codex-plugin/plugin.json` 을 `bump-version.sh` 10번째 대상으로 추가 | 조사(3.24.0 고정) | How D-1 | 포함 |
| 22 | Codex 재설치(`codex plugin add lens@CreetaCorp`, 로컬 마켓플레이스)로 캐시 3.24.0 → 새 버전 | 조사 | How D-1 · 검증 | 포함 |
| 23 | `${CLAUDE_PLUGIN_ROOT}` 의존 제거 — SKILL.md 상단 한 줄(`LENS_ROOT` = 이 SKILL.md 두 단계 위, env 비면 그것) + /cp 의 `node ${CLAUDE_PLUGIN_ROOT}/…` 전부 치환 | 조사(Codex·Grok env 부재) | How D-2 | 포함 |
| 24 | `hooks/post-tool-plan-doc.js` 힌트 문구를 새 Phase 4.5 로 갱신(Grok 도 이 훅을 읽는다) | 조사(hooks.json·Grok README 2341) | How D-3 | 포함 |
| 25 | CLAUDE.md · README · `docs/rules/harness-rules.md` §4.8 · CHANGELOG 갱신 | 레포 관례 | How E-1 | 포함 |
| 26 | `lib/report-viewer.test.js` 의 프리뷰·html 우선 단언 수정 + 렌더러 테스트 추가, 전 테스트 PASS | 레포 관례 | How E-2 · 검증 | 포함 |
| 27 | 메모리 2건 갱신 — `feedback_lens_skill_mandatory_steps`(2026-05-21 "HTML 덱 필수" 지시)·`feedback_lens_read_md_and_html` 이 오늘 지시로 뒤집힘 | 조사(메모리) | How E-3 | 포함 |
| 28 | /cc·/cd·/cps 의 `${CLAUDE_PLUGIN_ROOT}` 치환 — Codex·Grok 에서 /cc·/cd 가 맨몸으로 도는 원인의 절반(U95) | 조사 · UX 조사 U95 | How D-2 | 포함 (조사 후 승격) |
| 29 | 각 레포에 이미 생성된 `docs/tasks/*.html`·`docs/history/*.html`·`docs/_shared.css`·`board_*.html` 삭제 | 조사 | — | 제외: 레포별 파일 정리는 이 플러그인 변경과 별건. 남겨도 아무것도 깨지지 않는다 |
| 30 | /cp 본문의 나머지 Phase(0.5 3중 조사·2.4 합성·3 Pre-mortem·4 Todo 파생·5 게이트) 재설계 | 조사 | — | 제외: 요청 밖. 이번엔 양식·산출물·띄우기만 건드린다 |
| 31 | `lib/board-builder.js`(491줄) + `templates/board.template.html` 삭제 — 보드 파이프라인 통째 제거 | 결정 1(대표, 2026-09-14) | How B-4 | 포함 |
| 32 | /cps 의 board 재빌드 한 줄(199행) 삭제 + "board-builder 가 스캔하는 `docs/rules/`" 문구(169행) 를 "`docs/rules/`" 로 | 결정 1 | How B-4 | 포함 |
| 33 | `lens.config.json` 의 죽은 키 `reportFormat`·`buildBoard` 제거 — 코드 소비자 0 실측 | 조사(grep) · 결정 1 | How B-4 | 포함 |
| 34 | `docs/rules/branch-lifecycle.md` 의 board 문구 5곳(134·148·150·313·458) 과 `capability-assumptions.json` 69·75 의 "md/html/board" 를 md 기준으로 정리 | 조사 · 결정 1 | How E-1 | 포함 |
| 35 | 메모리 `lens-board-builder-flat-scan.md` 폐기 표시(보드 자체가 사라짐) | 조사(메모리) · 결정 1 | How E-3 | 포함 |
| 36 | `.lens/pr-cache.json` — board-builder 만 쓰던 캐시. 코드 삭제 후 각 레포에 남는 파일은 손대지 않음 | 조사(grep) | — | 제외: 인벤토리 29 와 같은 이유. 읽는 코드가 없어져 무해 |
| 37 | **신규 / 개선 구분** — frontmatter `kind: 신규\|개선` 을 Phase 0 에서 정한다. `개선` 이면 `## AS-IS → TO-BE`(별칭: AS-IS · As-Is/To-Be · 현재→변경 · Before/After) 가 필수 — `plan-manager.js` 에 `KIND_REQUIRED_SECTIONS` 와 별칭을 **추가**(기존 6개 계약 불변) | 대표 추가 지시 4 | How A-5 | 포함 |
| 38 | **Todo 는 엔진 네이티브 도구로** — Phase 4 문구를 "Claude `TodoWrite` · Codex `update_plan` · Grok `todo_write`, 그 엔진에 있는 것으로 등록" 으로. 도구명은 실측(Grok README 606행 · Codex 세션 로그) | 대표 추가 지시 5 | How A-6 | 포함 |
| 39 | **`deriveTodoItems` 모양 결합 해제** — Plan A 탐색을 `SECTION_ALIASES['Plan A']`(How·🛠·어떻게)로, 단계는 How 아래 **모든 체크박스 + 단계형 소제목 아래 불릿**, 단계 0건은 `warnings`(성공기준+인벤토리로 진행) — `valid:false` 는 목표 0 · 인벤토리 0 일 때만 | 대표 추가 지시 5 · 실측(이 계획서 valid:false) | How A-6 | 포함 |
| 40 | **훅·show-report 의 레포 루트를 파일 경로에서 잡는다** — `…/docs/tasks/x.md` 의 세 단계 위. `CLAUDE_PROJECT_DIR`·cwd 는 그다음 | 실측(이 턴 10회 오경보) | How D-4 | 포함 |
| 41 | 37·39·40 의 테스트 — `plan-coverage.test.js`(kind 게이트·단계 warning)·`report-viewer.test.js`(루트 해석) | 레포 관례 | How E-2 | 포함 |
| 42 | **네이티브 todo 도구가 없는 세션의 폴백** — 이 VS Code 확장 세션엔 `TodoWrite` 가 아예 없다(도구 목록·ToolSearch 실측 2026-09-14). 그런 세션에서는 계획서 md 의 `## 📌 진행 체크리스트` 를 Todo 원장으로 쓰고, "update todo" 는 그 섹션 갱신을 뜻한다. "도구가 없다" 로 되묻지 않는다 | 실측(대표 "update todo" 요청) | How A-6 | 포함 |
| 43 | **TodoWrite 부재의 근본 원인 = 환경 플래그** — Claude Code 2.1.235+ 가 Claude 5 계열에서 todo/task 도구를 기본 숨김(바이너리 변경 로그 원문) + VS Code 확장이 `CLAUDE_CODE_ENABLE_TASKS=0` 하드코딩. 처방 `CLAUDE_CODE_ENABLE_TODO_TOOLS=1` 을 `~/.claude/settings.json` env 에 (이 머신 2026-09-14 적용 — 편집 즉시 실행 중 세션에 TodoWrite 등장, 핫리로드 실측). 정본 `livevil-setting/claude-code/settings.json` 에도 반영. Phase 4 문구에 "도구가 안 보이면 이 플래그부터" 한 줄 | 실측(`claude -p` 3종 프로브 + 라이브 세션) | How A-6 · D-5 | 포함 |
| 44 | **승인 화면 재설계** — 순서: 링크 → 목표+Done → 🙋 대표 결정 N건(질문·추천·왜 데이터로 못 정하나) → 대표가 직접 할 일 N건(✅ manual 행 수) → ⚠️ 리스크 상위 ≤5 표(심각도·어디·무엇·권고) → 다음 행동. 계측치(커버리지·Todo·브랜치 출처·모델)는 `🔧 검사` 한 줄로 접는다. base 위험은 사람 말("병합되면 곧바로 운영 배포되는 레포"). 아티팩트·md 최상단에 같은 결정 블록 고정 | UX 조사 U25·U29·U12·U26·U28·U27 | How F-1 | 포함 |
| 45 | **선택지는 결과 문장으로** — Approve/Modify/Execute 대신 "지금 실행(라이브 단계에서 다시 묻음)" / "고칠 곳 있음" / "계획만 보관". Codex·Grok 은 번호 문장 | UX 조사 U24 | How F-1 | 포함 |
| 46 | **보고 → 질문 순서를 훅으로 강제** — `hooks/pre-tool-ask.js`: AskUserQuestion 직전 assistant 텍스트가 없으면 block(사유 표시). 질문 페이로드 규약: 발견 1~3줄 / 옵션별 결과 / 추천+이유 / 마지막 옵션 "더 설명해 줘". 옵션 preview 에 목표·AS-IS/TO-BE·리스크 | UX 조사 U09·U10 · 메모리 feedback_report_before_asking_approval | How F-2 | 포함 |
| 47 | **승인 전 질문창 5곳 → 1곳** — 등급·base·모드는 승인 화면 표시+기본값으로 내리고, 질문은 모호 요청 1개만. deep 의 "Codex 없이 진행 이라고 타이핑" → 옵션 2개+미감지 사유·복구 명령. 게이트 거부의 "게이트 우회 타이핑" → 옵션, 회귀는 1회 자동·2회째 보고 | UX 조사 U11·U44·U43 | How F-2 | 포함 |
| 48 | **게이트 문구 두 층** — `problems` 를 user/dev 로 나누고 화면엔 user 층만("Phase 1 회귀" 금지) | UX 조사 U45 | How F-2 · H-1 | 포함 |
| 49 | **승인 응답을 기록** — frontmatter `status: planned\|approved\|executing\|blocked\|done` + `approved_at/approved_via/approval_note`, `## 🧭 결정` 아래 `- Q → A (날짜)` append(별칭 Decisions). Approve 응답 끝 "다음: /cc <id>" 고정, /cp 무인자에 "이어갈 계획 N건", /cc 페이로드 없이 부르면 approved 계획에서 재구성 | UX 조사 U22·U23 | How F-3 | 포함 |
| 50 | **이중 승인 제거** — 핸드오프 페이로드에 `[APPROVED]` 블록(누가·언제·범위), /cc 진입(1.5)은 보고만 하고 진행, 분해가 계획과 다를 때만 재승인. Modify 응답에 실행 지시가 들어 있으면 재승인 생략 → 변경 요약+URL 한 블록 후 /cc | UX 조사 U14·U15 | How F-4 | 포함 |
| 51 | **`/goal` 복붙 안내 절 삭제** — 어떤 형태로도 사용자에게 명령을 되돌려주지 않는다 | UX 조사 U60 | How F-5 | 포함 |
| 52 | **엔진 무관 승인 정의** — 승인 = 텍스트 고정 블록 + 선택지 3 ("마지막 3줄 계약"). Claude 는 AskUserQuestion, Codex 는 `request_user_input`, Grok 은 평문 번호. 내부 검증어(해시·슬라이드 수) 금지 | UX 조사 U81 | How F-6 | 포함 |
| 53 | **스킬 첫 60줄 = 계약 카드** — Codex 는 앞 180~210줄만 읽는다(세션 로그 실측). 6개 계약·띄우기·Todo·승인 정의를 첫 60줄에, 검증 "앞 200줄만 읽어도 통과" | UX 조사 U82 | How F-6 | 포함 |
| 54 | **"이 세션에 Lens vX 로드됨/안 됨" 첫 줄 규약** — 스킬 안 실린 엔진에서 /cp 가 조용히 일반 답변으로 흐르는 것 차단, 없으면 설치 명령 | UX 조사 U83 | How F-6 | 포함 |
| 55 | **승인 직전·최종 보고 직후 푸시 알림** — `PushNotification`(Claude), Notification 훅 OS 토스트, Codex 는 config notify | UX 조사 U79 | How F-7 | 포함 |
| 56 | **Modify 규약** — `🔁 이번 판에서 바뀐 것` 블록 필수, Artifact 는 같은 URL 재발행(favicon 생략), 브라우저는 같은 파일 덮어쓰기, Pre-mortem 은 델타만. 스킬 재로딩 금지·바뀐 섹션만 Edit·diff 3줄 재보고(Codex 8분 사례). `--check` 실패 문구 "Phase 2.7" → 4.5 정정 | UX 조사 U16·U17·U101 | How G-1 | 포함 |
| 57 | **띄우기 기록에 md sha256** — `--check` 가 해시 불일치면 `stale` 반환 → 재띄우기 요구(Modify 후 옛 탭 승인 차단) | UX 조사 U18 | How G-1 | 포함 |
| 58 | **아티팩트 댓글 = Modify 입력** — 발행 직후 watch, 댓글 1건 = 인벤토리 행 1건(출처 "댓글") → 반영/반대 → 같은 URL 재발행 → reply·resolve. 페이지 안 승인/수정/실행 버튼(Artifact `db`), Codex visualize 프래그먼트는 `sendFollowUpMessage` 버튼 | UX 조사 U19·U80 | How G-2 | 포함 |
| 59 | **"직접 고침" 옵션 + 되받는 규약** — md 를 편집기로 열고 "고쳤다" 후 되읽어 게이트 재실행·바뀐 섹션 요약. Modify 요청마다 "받아들임 / 반대(🎯 기준) / 확인 질문" 중 하나를 먼저 적고 바꾼다(줏대 없음 지적) | UX 조사 U20·U21 | How G-3 | 포함 |
| 60 | **화면 개선형 = 실측 수치 AS-IS/TO-BE 표 + 시안** — `kind: 개선` 이고 화면이면 ① 라이브 수치로 AS-IS/TO-BE ② 클릭 가능한 시안(Artifact/visualize) ③ Modify 는 표·시안만 재표시. #37 확장 | UX 조사 U04 | How A-5 · G-4 | 포함 |
| 61 | **게이트 오탐 4종** — 자리표시자 정규식이 코드 스팬·펜스·표 셀 제외 + missing→warnings; 셀 안 `\|` 는 코드 스팬 건너뛰기·오른쪽 끝에서 세기; 상태 셀 첫 토큰 정확 일치(`in` 부분일치 제거)+"보류" 상태; Todo 개수는 최상위 불릿만·단계-인벤토리 정규화 병합·표시 "목표 M · 실행 N" | UX 조사 U46·U47·U48·U49 | How H-1 | 포함 |
| 62 | **훅 상태 파일 전부 레포 루트로** — `resolveProjectRoot` 를 hook-utils 공용으로(git toplevel 우선), 다섯 훅 전부 사용, `.tmp` 잔해 정리. Stop 게이트가 워크스페이스 루트 세션에서 거짓 통과하던 것 포함. #40 확장 | UX 조사 U64·U63 | How H-2 | 포함 |
| 63 | **진행보고 훅 정직화** — "대기 N초째" 를 마지막 신호 기준으로, 종료 계열 도구(KillShell·TaskStop)는 disarm, SendMessage 제외, 되살림은 간격 조건. /cp 조사 단계에도 적용(생존 실측 강제) | UX 조사 U65·U66·U70 | How H-2 | 포함 |
| 64 | **계획서 훅 힌트 억제** — status approved/executing 이면 승인용 문구 생략, 같은 결과 해시 재주입 억제(이 턴 10회 반복) | UX 조사 U67 | How H-2 | 포함 |
| 65 | **Stop 차단·원장 소음** — 첫 차단은 사용자에게 보이는 systemMessage, block 은 2회째부터·상한 2. 게이트 원장은 /cd 가 closeLedger, created==updated 원장은 세션 경계에서 stale. 세션 배너는 compact·fork 재출력 금지 | UX 조사 U61·U62·U68 | How H-2 | 포함 |
| 66 | **/cc 진입 게이트 "경고 후 진행" + 별칭 확장** — 현행 41건 중 39건 구조 fail·41건 Todo fail. 누락은 실행 전 채워 넣고 첫 줄에 명시, 별칭은 실제 83건에서 추출, 별칭 미스는 warnings. /cd 파싱도 SECTION_ALIASES 기준·status/kind/planner_model 만 필수 | UX 조사 U42·U41 | How H-3 | 포함 |
| 67 | **트리거 소음** — `/cp …` 뒤가 의문문·평가어면 OVERRIDE 생략(명령형만 강제); "완료·정리" 는 /cp 트리거에서 제거하고 /cd 를 Skill 로 직접 호출; 죽은 `/cp done` 안내 전부 `/cd` 로(grep 0건 테스트) | UX 조사 U69·U59·U54 | How H-4 | 포함 |
| 68 | **문서 안 절대경로·비밀 셸 경고** — post-tool-plan-doc 에 경고 2종(이 컴퓨터 전용 경로·40줄 초과/Read-Host 셸) | UX 조사 U100 | How H-5 | 포함 |
| 69 | **문서 언어 게이트** — 문서 첫머리 "문제 / 해야 할 것 / 대표 결정" 3줄 필수, validatePlanStructure 가 🎯·❓·요약의 백틱·snake_case·경로를 warning. 인벤토리 "반영 위치" 는 사람 말+헤딩 앵커(렌더러가 앵커 생성). "이번엔 안 한다" 정본 = 📋 제외행(🚧 는 링크만, 🚫 는 경로만). 승인표·보고는 박스 문자 금지·마크다운 표 | UX 조사 U34·U35·U36·U94 | How I-1 | 포함 |
| 70 | **리스크 표 하나** — 사전 리스크·레지스터·교차 협의를 표 하나(출처 열)로, 원문은 `.lens/verify` 링크. Blocker 는 키워드가 아니라 "영향 높음+되돌리기 불가" 행으로 판정, "알고 승인" 옵션 | UX 조사 U37 | How I-1 | 포함 |
| 71 | **한국어 우선 표기** — deep 검증표 EARS → 한국어 3열(언제/무엇이/어떻게 되어야); 사람 보는 자리(승인 화면·목록·preview title)엔 md 첫 H1 을 slug 앞에; 렌더러가 frontmatter 를 배지 한 줄로 접고 원문은 "문서 정보" 접힘 | UX 조사 U38·U39·U40 | How I-1 · C-2 | 포함 |
| 72 | **조사 단계 정의·조기 보고** — P0.6 = 3축(history·코드 실측·rules) + "읽은 근거 문서" 목록을 승인 화면에; Phase 0 직후 질문 아닌 보고 4줄(목표/Done/등급/브랜치); preflight 에 fetch+behind 수 → 🧭 에 "⚠️ 로컬 N커밋 뒤처짐"; 조사 결과 `docs/tasks/<id>.research.md` 저장·재진입 시 재사용 표시 | UX 조사 U74·U71·U75·U73 | How I-2 | 포함 |
| 73 | **외부 레인 상태를 승인 화면에** — "🔀 외부 조사: codex ok(4분) · grok 실패(사유)" 줄, 미도착이면 "기다릴까요" 결정 항목, 늦은 의견은 덧붙임(#30 의 일부 승격) | UX 조사 U72 | How I-3 | 포함 |
| 74 | **"대표가 눌러 주는 단계" 금지 판정** — Phase 3 고정 질문: 사람이 눌러야 하는 단계가 있는가 → 대표면 자동 판정으로 바꾸거나 🚫 사유 | UX 조사 U85 | How I-4 | 포함 |
| 75 | **띄우기 레인 보강** — Artifact 다음·브라우저 앞에 SendUserFile(렌더 HTML/PDF) 레인, `SHOWN_METHODS` 에 sendfile; 임시 경로 보고 금지; `--shown` 이 frontmatter `shown:` 에도 URL 기록·렌더러 배지 링크 | UX 조사 U78·U77·U93 | How C-1 · C-3 | 포함 |
| 76 | **Todo 등록 내용 규칙** — 등록 = 🎯 목표 + 📋 포함 행(스킬 진행 단계 금지), step 접두어 [목표]/[실행], "[목표] 는 검증 전 completed 금지". /cc·/cd 문구도 치환, Grok 승인 화면에 "Ctrl+T 로 확인", /cc 인계 시 `--resume` 한 줄 | UX 조사 U08·U96 | How A-6 | 포함 |
| 77 | **kind 세 번째 값 `조사보고`** — 🎯 질문·📊 근거·💡 결론·🙋 결정만, 산출은 보고서 1장(비교·분석 요청에 계획서 골격이 나오던 것) | UX 조사 U33 | How A-5 | 포함 |
| 78 | Grok 대화형 /cp 실사용 0건(Grok 세션 70개 전부 Lens 가 띄운 레인) — 결정 2(브라우저 렌더)는 유지하되 우선순위 최하. 렌더러는 `claude -p`·SSH 에도 쓰이므로 만든다 | UX 조사 U84 | How C-2 | 포함 (우선순위 최하) |
| 79 | `/cp quick` 간이 등급(6계약+인벤토리+Todo 만) | UX 조사 U32 | — | 제외: 등급 체계 변경은 별건 — 양식이 풀리면 기본 등급이 이미 가벼워지는지 먼저 본다 |
| 80 | 승인 1회 = Plan A 전 단계 무정지(중간 정지는 파괴적·외부 비용·스코프 변경 3종만), Execute 옵션 "자동/단계마다 확인", `--only` 부분 실행 | UX 조사 U13·U30·U31 | — | 제외: 계획서 2(실행·완료 UX)로 — /cc 실행 규칙 변경 |
| 81 | 진행상황 요약 5줄+접힘 로그·approved_sha 스냅샷, Worker/Supervisor/QA 마다 재개 포인트 Edit + frontmatter last_update/resume_point | UX 조사 U50·U51 | — | 제외: 계획서 2 — /cc 실행 중 문서 갱신 |
| 82 | 낡은 계획서 폐기 판정(status superseded), /cc Phase 7 에서 /cd 자동 진입, SessionStart 에 "안 닫힌 task N·미병합 브랜치 N" | UX 조사 U52·U53 | — | 제외: 계획서 2 — /cd 수명주기 |
| 83 | /cd 완료 인터뷰 자동 채움(history 초안 → "이대로 기록/고칠 것" 1회), history = 원문 이관+`## 완료` 절, 브랜치·PR 상태 사람 말 4종+다음 행동, pr-manual 아닌 레포는 PR→머지→history 한 실행 | UX 조사 U55·U56·U57·U58 | — | 제외: 계획서 2 — /cd 재설계 |
| 84 | 실행 보고 규약 — 화면 증거(URL+캡처+조회 일치), 운영 레포면 /cs+배포+라이브 실측 auto 게이트, 진행 보고 카드(변화/누적/막힌 것/다음/결정), /cc 7·/cd 4 에도 띄우기, 편차 N건·추가 질문 N회 필수, 막힘 고정 블록 | UX 조사 U86·U87·U88·U89·U90·U99 | — | 제외: 계획서 2 — /cc 보고 형식 |
| 85 | /cc 실행 중 아티팩트를 진행 보드로 같은 URL 재발행, 사이드바 고정/완료판 전환, 실행 중 scope_change 감지 confirm | UX 조사 U91·U92·U98 | — | 제외: 계획서 2 — /cc 실행 표면 |
| 86 | 남은 것·별건 적재 `docs/tasks/BACKLOG.md` + /cp 무인자·승인 블록에 상위 3건 | UX 조사 U76 | — | 제외: 계획서 2 — 단, 이 계획서의 "계획서 2" 항목이 첫 BACKLOG 다 |
| 87 | 여러 레포 작업의 `repos:` 목록 순회(/cc·/cd) | UX 조사 U97 | — | 제외: 계획서 2 — L 공수, 다중 레포는 branch-lifecycle.md 가 범위 밖으로 못 박음 |
| 88 | 검증 3렌즈 미실행 후보 94건 — 조사 워크플로가 세션 한도로 죽어 U08 이후는 발굴자 증거만 있다 | 실측(wf_45c59006-0a5 실패) | — | 제외: 재검증은 하지 않는다 — 발굴자 증거(인용·날짜)가 붙은 것만 위에 실었고, 검증은 구현 시 각 항목의 ✅ 행이 대신한다 |

## 🧭 결정 (2026-09-14 대표 답변)

1. **보드(`docs/board_<repo>.html`)** — ~~ⓐ `/cp` 에서만 빼기~~ → **ⓑ 보드 파이프라인 통째 제거**로 확정. `lib/board-builder.js`·`templates/board.template.html`·`report-shared.css` 삭제, `/cp`·`/cd`·`/cps`·`/crv` 에서 board 호출 전부 제거(인벤토리 10·13·31~35). 이미 만들어진 `docs/board_*.html` 파일은 손대지 않는다.
2. **Grok 레인** — **브라우저로 렌더된 문서**로 확정. 다른 표면 없음.
3. **6개 계약 유지** — 🎯 목표 · ❓ 왜 · 📋 인벤토리 · 🛠 어떻게 · ✅ 검증 · 🚫 건드리지 않는 것. 권고대로 유지(이의 없음). 커버리지 게이트·Todo 파생·`/cc` 인계가 이 여섯 헤더를 파싱한다.

**대표 추가 지시 2건 (2026-09-14, 승인 대기 중)**

4. **신규 vs 개선** — *"기획안이 처음 task 를 시작해서 목표를 세울 때가 있고, 기존 것을 변경·수정할 때가 있어. 기존 것을 개선할 때는 반드시 AS-IS → TO-BE 가 들어가야 한다."* → frontmatter `kind: 신규|개선` 을 Phase 0 에서 정하고, `개선` 이면 `## AS-IS → TO-BE` 섹션이 코드 게이트 필수(인벤토리 37).
5. **Todo 는 각 엔진의 네이티브 도구로, 그리고 "없다"고 찡찡대는 것은 결함이 맞다** — *"클로드에서 내가 update todo 를 하면 뭐가 계속 없다고만 찡찡거리던데? 이게 맞아?"* → **아니다, 두 가지 결함을 실측했다.**
   - ① `deriveTodoItems` 가 **템플릿 모양에 묶여 있다.** 이 계획서(6개 계약은 다 있음)를 돌리면 `valid:false` — `"🛠 Plan A 섹션이 없다 — Phase 1 회귀"`. `## 🛠 어떻게` 아래 `### A.` 소절과 불릿은 단계로 안 읽고, `#### 단계` 밑 체크박스만 읽는다. 양식을 풀면 이 나무람이 **모든** 계획서에 뜬다(인벤토리 39).
   - ③ (21:00 추가) 근본 원인은 **환경 플래그** — Claude Code 2.1.235+ 가 Claude 5 계열에서 todo 도구를 숨기고 VS Code 확장이 `ENABLE_TASKS=0` 을 박는다. 고쳤다(#43).
   - ② 훅 `post-tool-plan-doc.js` 가 **레포 루트를 잘못 잡는다.** `CLAUDE_PROJECT_DIR` 이 VS Code 확장 세션에서 비어 있고(실측) cwd 가 워크스페이스 루트(`Documents/Git`)라, 띄우기 기록은 `creeta-lens/.lens/report-shown.json` 에 남았는데 훅은 `Documents/Git/.lens/` 를 보고 "띄워라" 를 편집마다 반복했다 — 이 턴에서 10회(인벤토리 40).

## 🛠 어떻게

### A. 양식 → 계약

- **A-1** `skills/cp/SKILL.md` Phase 2.5: 리터럴 골격(현 328–493) 을 지우고 다음으로 바꾼다 — "frontmatter + `##` 헤더 여섯 개(deep 은 아홉)가 계약. `SECTION_ALIASES` 가 받는 어떤 표기든 된다(한국어·영어·이모지). 순서·제목·그 밖의 섹션은 이 작업이 정한다. 자리표시자 없음." 골격 대신 **좋은 예 1개·나쁜 예 1개** 를 각 두 줄로.
- **A-2** Phase 5.0 §5(내용 완전성 게이트) 삭제. "검증 수단(무엇으로·어디까지·어떻게 보고)" 요구는 ✅ 검증 표의 설명 한 줄로 이동.
- **A-3** 🔀 3자 합성·⚠️ 사전 리스크·❓ 미해결 질문·진행상황은 Phase 2.4·3·`/cc` 가 결과가 있을 때 `##` 로 **추가**한다고만 적는다.
- **A-4** Phase 2.45(인벤토리)·5.0 §4.6(커버리지)·§4.5(구조 게이트) 는 문장 그대로 둔다.
- **A-5** 신규 / 개선: Phase 0 에 "이 계획이 **처음 세우는 것**인가, **있는 것을 바꾸는 것**인가" 판정을 넣고 frontmatter `kind:` 에 적는다. `개선` 이면 `## AS-IS → TO-BE` 가 계약에 더해진다(현재 무엇이 어떻게 돌아가는지 → 바뀐 뒤 무엇이 어떻게 달라지는지, 실측 근거 포함). `plan-manager.js` 에 `KIND_REQUIRED_SECTIONS = { 개선: ['AsIsToBe'] }` + `SECTION_ALIASES.AsIsToBe` 추가, `validatePlanStructure(content, grade, kind)` 로 확장(기존 호출은 그대로 동작). `kind` 없는 문서는 신규로 본다(레거시 호환).
- **A-6** Todo: Phase 4 를 "파생 → **그 엔진의 네이티브 todo 도구**로 등록"으로 고친다 — Claude `TodoWrite` · Codex `update_plan` · Grok `todo_write`. **도구가 없는 세션**(VS Code 확장 세션 실측: `TodoWrite` 부재)에서는 계획서의 `## 📌 진행 체크리스트` 섹션이 원장이다 — 같은 항목을 체크박스로 적고, "update todo" 요청은 이 섹션을 갱신하는 것으로 처리한다. `deriveTodoItems` 는 ① Plan A 를 `SECTION_ALIASES['Plan A']` 로 찾고(`## 🛠 어떻게` 도 통과) ② How 아래 **모든 체크박스** + **단계형 소제목**(단계·Steps·절차·Tasks) 아래 불릿을 단계로 읽고 ③ 단계 0건은 `warnings` 로 내려 성공기준 + 인벤토리만으로 등록을 진행한다. `valid:false` 는 목표 0 또는 인벤토리 0 일 때만. 승인 화면의 개수 표시는 그대로.

### B. HTML 덱 파이프라인 제거

- **B-1** `/cp`: Phase 2.6 삭제 · 5.0 §4 를 "`docs/tasks/<id>.md` 존재" 하나로 · 4.5 step 1 삭제 · 자동 모드 감지의 `html` 예약어 삭제 · "다른 스킬로 옮긴 모드" 표의 `/cp html` 행 삭제 · "HTML 보고서 뷰 + Task Board" 절 삭제 · 절대 규칙 "산출물 링크는 풀 경로" 를 md 와 띄운 대상(URL·인라인·창)만으로.
- **B-2** `/cd` Phase 3.5 절 통째 삭제. `/crv` Phase 4 의 덱·board 문장 삭제.
- **B-3** `templates/report-conversion-spec.md`·`report-plan.example.html`·`report-history.example.html`·`report-shared.css` 삭제.
- **B-4** 보드 파이프라인 제거 — `lib/board-builder.js`·`templates/board.template.html` 삭제, `/cps` 의 board 재빌드 한 줄(199행) 삭제 + 169행 문구 정리, `lens.config.json` 의 `reportFormat`·`buildBoard` 키 제거. CLAUDE.md 폴더 구조·README 219행의 board 문구도 함께.

### C. 띄우기 = 플랫폼 네이티브 (Phase 4.5 재정의)

- **C-1** 판별은 **도구 표면**으로, 위에서부터 첫 번째 것을 쓴다:
  1. `Artifact` 도구가 있다(Claude Code) → `artifact-design` 스킬 로드 → 계획서를 읽히는 페이지로 발행 → `node "$LENS_ROOT/scripts/show-report.js" --shown artifact <URL> <id>`.
  2. `visualize` 스킬이 있다(Codex 앱) → 스레드 시각화 디렉터리에 프래그먼트 작성, 응답에 `visualize{"path":"…"}` 한 줄 → `--shown inline <path> <id>`.
  3. 둘 다 없다(Grok CLI·`claude -p`·SSH 아님) → `show-report.js docs/tasks/<id>.md` 가 md 를 렌더한 `.lens/preview/<id>.html` 을 브라우저로 → `browser`.
- **C-2** `lib/report-viewer.js` `renderPreview`: `<pre>` 원문 → 마크다운 렌더(제목·단락·목록·표·코드·인용·굵게·링크). 외부 의존성 없이 `lib/md-render.js` 로 분리. 렌더 실패 시 지금의 `<pre>` 로 폴백(문서를 망가뜨리느니 원문). `resolveTarget` 의 "html 우선" 은 삭제.
- **C-3** `scripts/show-report.js` 에 `--shown <method> <ref> <id>` 추가(`--artifact` 는 별칭으로 유지). `SHOWN_METHODS` = `artifact` · `inline` · `browser`. `remote`·`failed`·`missing` 처리와 승인 첫 줄 실패 명시는 그대로.
- **C-4** 페이지 규칙(세 레인 공통): 원문 복붙 금지, 읽는 순서 = 목표 → 왜 → 인벤토리(전량) → 어떻게 → 검증 → 리스크(있을 때) → 결정 요청. 원문에 없는 수치 금지.

### D. 세 엔진 동일 버전·동일 동작

- **D-1** `scripts/bump-version.sh` 에 `.codex-plugin/plugin.json` 추가(10/10). 릴리즈 후 `codex plugin add lens@CreetaCorp` 로 캐시 교체 → `codex plugin list` 로 버전 확인.
- **D-2** `/cp` SKILL.md 상단에 "`LENS_ROOT`: `CLAUDE_PLUGIN_ROOT` 가 있으면 그것, 없으면 이 SKILL.md 의 두 단계 위 폴더" 한 줄. 본문의 `${CLAUDE_PLUGIN_ROOT}` 를 `"$LENS_ROOT"` 로 치환(Phase 0.5·3.2·4·4.5·5.0 의 명령 9곳).
- **D-3** `hooks/post-tool-plan-doc.js` 의 `showHint` 를 C-1 문구로.
- **D-5** todo 도구 플래그: Phase 4 에 "Claude 5 세션에서 TodoWrite/TaskCreate 가 안 보이면 `CLAUDE_CODE_ENABLE_TODO_TOOLS=1` 이 빠진 것 — `~/.claude/settings.json` env 에 넣으면 실행 중 세션에도 바로 뜬다. 그전까지는 📌 체크리스트 폴백" 한 줄. 이 머신은 오늘 적용(검증: `claude -p --model claude-fable-5-1` 도구 목록 + 라이브 세션에 TodoWrite 등장).
- **D-4** 레포 루트 해석: `post-tool-plan-doc.js`·`report-viewer.js`·`show-report.js` 가 **대상 파일 경로**(`…/docs/tasks/x.md` → 세 단계 위)에서 루트를 잡고, 없을 때만 `CLAUDE_PROJECT_DIR` → cwd 순. 워크스페이스 루트에서 연 세션(이 세션이 그렇다)에서 `.lens/` 상태가 엉뚱한 곳에 쌓이는 것을 끊는다.

### E. 정리

- **E-1** CLAUDE.md(버전 노트·Report Viewer 행·폴더 구조·board 언급) · README(v3.37 문단·219행) · `docs/rules/harness-rules.md` §4.8(처방 문단을 세 레인으로; 268·300행의 board 실측은 역사 기록이라 그대로) · `branch-lifecycle.md` 5곳 · `capability-assumptions.json` 2곳 · CHANGELOG.
- **E-2** 테스트: `lib/report-viewer.test.js` 수정(프리뷰 렌더·루트 해석) + `lib/md-render.test.js` 신설 + `lib/plan-coverage.test.js` 에 kind 게이트·단계 warning·기존 61건 회귀 픽스처, `node --test lib/` 전부 PASS.
- **E-3** 메모리: `feedback_lens_skill_mandatory_steps.md` 를 "2026-09-14 뒤집힘 — HTML 덱·board 폐지, 플랫폼 아티팩트로" 로 갱신, `feedback_lens_read_md_and_html.md` 에 "html 은 더 이상 생성 대상 아님" 추가, `lens-board-builder-flat-scan.md` 폐기 표시.

### F. 승인 화면·질문 (UX 조사 반영)

- **F-1** Phase 5.1 고정 블록을 **사람 순서**로 다시 쓴다: ① 띄운 링크 ② 🎯 목표 + Done 한 줄 ③ 🙋 대표 결정 N건(각각 질문·추천·왜 데이터로 못 정하나) ④ 대표가 직접 할 일 N건(✅ manual 행 + 판정 단계 수) ⑤ ⚠️ 리스크 상위 ≤5 표 ⑥ 다음 행동. 계측치는 `🔧 검사: 커버리지 39/4 · Todo 목표 6·실행 39 · base master(upstream) · 모델 fable` 한 줄. base 가 배포 브랜치면 사람 말 경고(`lens.config.json deployOnMerge`). 선택지 3개는 결과 문장. 아티팩트·md 최상단에 같은 결정 블록.
- **F-2** `hooks/pre-tool-ask.js`(PreToolUse: AskUserQuestion) — 직전 assistant 메시지에 텍스트가 없으면 block + 사유. 질문 페이로드 규약을 절대 규칙에. 승인 전 질문은 모호 요청 1개로 제한(등급·base·모드는 표시+기본값). 자유 텍스트 타이핑 요구("Codex 없이 진행"·"게이트 우회") 전부 옵션으로. `problems` user/dev 두 층.
- **F-3** Phase 6 Approve: frontmatter `status`(enum)·`approved_at`·`approved_via`·`approval_note` 기록 + `## 🧭 결정` append. 응답 끝 "다음: /cc <id>". /cp 무인자 스캔에 "이어갈 계획(approved) N건". /cc 가 페이로드 없이 불리면 approved 계획에서 페이로드 재구성.
- **F-4** 핸드오프 페이로드 `[APPROVED]` 블록. /cc Phase 1.5 는 보고만 하고 진행(분해가 계획과 다를 때만 재승인). Modify 응답에 실행 지시가 있으면 재승인 생략.
- **F-5** "Goal-enforced 실행(/goal)" 절 삭제.
- **F-6** 승인 정의를 엔진 무관 텍스트 계약으로. SKILL.md 첫 60줄 = 계약 카드(6계약·kind·띄우기 레인·Todo·승인 3줄·LENS_ROOT). 첫 줄 "Lens vX 로드됨" 규약.
- **F-7** 승인 직전·최종 보고 직후 `PushNotification`(있을 때만), Notification 훅으로 OS 토스트.

### G. Modify (UX 조사 반영)

- **G-1** Phase 6 Modify: `🔁 이번 판에서 바뀐 것` 블록 → 바뀐 섹션만 Edit → 같은 URL 재발행(브라우저는 같은 파일) → Pre-mortem 델타만 → 표시 기록 갱신. 스킬 재로딩 금지. `--check` 는 md sha256 비교로 `stale` 반환.
- **G-2** Artifact 발행 직후 `watch`. 댓글 1건 = 인벤토리 행 1건(출처 "댓글 · 날짜") → 반영 또는 반대(🎯 기준) → 재발행 → `reply`·`resolve`. 페이지 안 승인/수정/실행 버튼은 `artifact-capabilities`(db) 로 — 눌린 값은 다음 입력 시 읽어 반영. Codex 는 visualize 프래그먼트에 `sendFollowUpMessage` 버튼.
- **G-3** 5.1 옵션 "직접 고침"(편집기로 열기 → "고쳤다" → 되읽고 게이트 재실행). Modify 요청마다 받아들임/반대/확인 질문을 먼저 적는다.
- **G-4** `kind: 개선` + 화면 변경이면 AS-IS/TO-BE 는 **라이브 수치**로, 시안(Artifact/visualize)을 함께 띄우고 Modify 는 표·시안만 재표시.

### H. 게이트·훅 소음 (UX 조사 반영)

- **H-1** `plan-manager.js`: 자리표시자 검사에서 코드 스팬·펜스·표 셀 제외 + warnings 로; 표 파서가 코드 스팬 안 `\|` 무시·오른쪽 끝에서 열 세기; 상태 판정 첫 토큰 정확 일치 + "보류"; `deriveTodoItems` 최상위 불릿만·단계/인벤토리 정규화 병합; `problems` 두 층.
- **H-2** `hook-utils.resolveProjectRoot(filePath|cwd)` — git toplevel 우선 → 다섯 훅 전부. 진행보고 훅: 마지막 신호 기준·종료 도구 disarm·SendMessage 제외. 계획서 훅: status 별 힌트·동일 해시 억제. Stop: 첫 차단 systemMessage·block 상한 2. 원장: /cd closeLedger·stale. 세션 배너: compact/fork 재출력 금지.
- **H-3** /cc 진입 게이트 = 경고 후 진행(누락은 실행 전 채우고 첫 줄 명시). `SECTION_ALIASES` 를 실제 계획서 83건에서 추출해 확장. /cd 1.2 파싱 = 별칭 + 체크리스트 + git 판정.
- **H-4** `scripts/user-prompt-handler.js`: `/cp` 뒤가 의문문·평가어면 OVERRIDE 생략. `/cp` 트리거에서 "완료·정리" 제거, 완료 후보는 `/cd` Skill 직접 호출. `/cp done` 문구 전부 `/cd`.
- **H-5** `post-tool-plan-doc.js` 경고 2종(절대경로·긴 셸/Read-Host).

### I. 문서 언어·조사·레인 (UX 조사 반영)

- **I-1** 문서 첫머리 "문제 / 해야 할 것 / 대표 결정" 3줄 필수 + 언어 warning. 반영 위치 = 사람 말 + 앵커. "안 한다" 정본 = 📋 제외행. 리스크 표 하나(출처 열) + Blocker 재정의 + "알고 승인". EARS → 한국어 3열. H1 우선 표기. 박스 문자 금지.
- **I-2** P0.6 3축 정의 + "읽은 근거" 목록. Phase 0 직후 4줄 보고. preflight behind 수 표시. `<id>.research.md` 저장·재사용.
- **I-3** 5.1 에 "🔀 외부 조사" 상태 줄, 미도착은 결정 항목.
- **I-4** Phase 3 고정 질문 "사람이 눌러야 하는 단계가 있는가".
- **I-5** 띄우기 레인: Artifact → visualize → SendUserFile → 브라우저. `shown:` frontmatter.

### 막힐 수 있는 지점 → 대안

- Codex 앱이 `visualize` 참조를 **CLI(`codex exec`)에서는 렌더하지 않는다** → CLI 실행이면 3번(브라우저) 레인으로 내려간다. 판별은 `visualize` 스킬의 존재가 아니라 "이 세션이 인라인을 렌더할 수 있는가" 인데, 스킬 유무가 그 대리 신호다. 실측에서 틀리면 Codex 는 항상 3번으로 고정한다.
- 마크다운 렌더러가 표를 깨뜨린다 → 표 파싱 실패 시 그 블록만 `<pre>` 로 두고 나머지는 렌더한다(문서 전체 폴백은 마지막 수단).

## ✅ 검증

검증 수단: 유닛 테스트(자동) + 세 엔진에서 `/cp` 실제 1회씩(수동, 화면·창 제목·URL 확인) + Codex 플러그인 버전 조회.

| # | 됐다는 신호 | 확인 방법 | 통과 | 종류 |
|---|---|---|---|---|
| 1 | 골격이 계약으로 바뀌었다 | `grep -c "^## " skills/cp/SKILL.md` 의 Phase 2.5 리터럴 블록 부재, `validatePlanStructure` 테스트 PASS | 리터럴 골격 0, 테스트 PASS | auto |
| 2 | HTML 덱·board 지시가 사라졌다 | `grep -rn "slide\|report-conversion\|_shared.css\|/cp html\|board-builder\|board_" skills/ templates/ lib/ hooks/ scripts/` | 0건 | auto |
| 3 | Claude Code 에서 `/cp` 가 Artifact URL 을 띄운다 | 이 계획서로 실측 — 승인 화면 첫 줄에 URL, `.lens/report-shown.json` 에 `method: artifact` | URL 열림 | manual |
| 4 | Codex 앱에서 `/cp` 가 인라인 시각화를 띄운다 | Codex 앱에서 `/cp` 1회, 응답에 `visualize{…}` 참조 + 화면에 렌더 | 인라인 표시 | manual |
| 5 | Grok 에서 `/cp` 가 렌더된 문서를 브라우저로 연다 | `grok` 에서 `/cp` 1회, 창 제목이 계획 id, 표·제목이 렌더됨(`<pre>` 아님) | 창 열림 + 렌더 | manual |
| 6 | Codex 가 같은 버전을 읽는다 | `codex plugin list` 의 lens 버전 = `.claude-plugin/plugin.json` | 일치 | auto |
| 7 | 플러그인 루트 env 없이 게이트가 돈다 | `env -u CLAUDE_PLUGIN_ROOT bash -c 'node "$LENS_ROOT/scripts/show-report.js" --check x'` 가 JSON 을 낸다 | JSON 출력 | auto |
| 8 | 회귀 없음 | `node --test lib/` + `bash tests/*.sh` | 전부 PASS | auto |
| 9 | 메모리가 뒤집힘을 기록한다 | 두 메모리 파일에 2026-09-14 항목 | 존재 | auto |
| 10 | 템플릿 모양이 아닌 계획서도 Todo 가 파생된다 | 이 계획서로 `deriveTodoItems` 실행 | `valid:true`, 단계는 warning, 목표 4 + 인벤토리 37 | auto |
| 11 | 훅이 띄운 기록을 제대로 찾는다 | 워크스페이스 루트 cwd 에서 `docs/tasks/*.md` Edit 후 훅 출력 | "띄워라" 힌트 없음 | auto |
| 12 | 개선형 계획서는 AS-IS → TO-BE 없이 통과 못 한다 | `kind: 개선` + 섹션 없는 픽스처로 `validatePlanStructure` | `missing: ['AsIsToBe']` | auto |
| 13 | 세 엔진 각자의 todo 도구에 등록된다 | 검증 3·4·5 실측 때 Claude TodoWrite 목록 · Codex 플랜 패널 · Grok TODO 패널(Ctrl+T) 확인 | 항목 수 = 승인 화면 개수 | manual |
| 14 | 승인 화면이 사람 순서다 | 검증 3 실측의 승인 메시지 첫 6줄 | 링크→목표→결정→직접 할 일→리스크→다음 행동, 계측치는 한 줄 | manual |
| 15 | 보고 없이 질문창이 못 뜬다 | 직전 텍스트 없이 AskUserQuestion 호출하는 픽스처로 `pre-tool-ask.js` | block + 사유 | auto |
| 16 | 승인이 한 번이다 | 검증 3 에서 Execute 후 /cc 진입까지 질문 수 | 0 | manual |
| 17 | 게이트 오탐 4종이 없다 | 중괄호 `id` 표기·셀 안 `\|`·"포함 안 함"·하위 불릿 픽스처로 structure/coverage/todo | 오탐 0 | auto |
| 18 | 훅 상태가 레포 `.lens/` 에만 쌓인다 | 워크스페이스 루트 cwd 로 다섯 훅 실행 후 `Documents/Git/.lens` 신규 파일 | 0 | auto |
| 19 | Modify 가 바뀐 것만 보여준다 | 검증 3 에서 Modify 1회 → 응답에 🔁 블록, 같은 URL, `--check` stale 판정 | 전부 | manual |
| 20 | 아티팩트 댓글이 Modify 로 들어온다 | 계획서 페이지에 댓글 1건 → 다음 턴 인벤토리 행 추가 + reply·resolve | 반영됨 | manual |
| 21 | 죽은 명령·복붙 안내가 없다 | `grep -rn "/cp done\|/goal" skills/` | 0건 | auto |
| 22 | Codex 가 앞 200줄만 읽어도 계약을 안다 | SKILL.md 1~60줄만 프롬프트로 준 헤드리스 실행이 6계약·띄우기·승인 3줄을 답함 | 전부 | auto |

## 📌 진행 체크리스트 (TodoWrite 와 동기 — 2026-09-14 20:05 KST)

**상태: 승인 대기.** UX 전수 조사(`wf_45c59006-0a5`) 결과를 합쳐 다시 승인을 여쭙는다. TodoWrite 는 20:00 에 `CLAUDE_CODE_ENABLE_TODO_TOOLS=1` 로 복구돼 같은 목록이 세션 Todo 에도 올라가 있다.

성공 기준 (Goal level — QA 통과 시에만 완료)
- [ ] G1 세 엔진 모두 승인 전에 플랫폼 화면(URL·인라인·브라우저)으로 계획서가 뜬다
- [ ] G2 계획서 모양이 주제를 따르고 6개 계약만 지키면 게이트를 통과한다
- [ ] G3 HTML 덱·보드 파이프라인이 Lens 에서 사라진다
- [ ] G4 세 엔진이 같은 버전을 읽고 플러그인 루트 env 없이도 게이트가 돈다
- [ ] G5 신규/개선을 구분하고 개선형은 AS-IS → TO-BE 를 싣는다
- [ ] G6 Todo 가 엔진 네이티브 도구(없으면 이 섹션)로 등록되고 파생기가 되돌려 보내지 않는다

실행 항목 (execution level)
- [x] 계획서 초안 + Artifact 발행 (v2, 3차)
- [x] 대표 결정 반영 — 보드 통째 제거 · Grok 브라우저 · 신규/개선 · 네이티브 Todo · 결함 3건
- [x] TodoWrite 부재 원인 규명 + 픽스 (`CLAUDE_CODE_ENABLE_TODO_TOOLS=1`) — 이 머신·정본·Mac Mini, 커밋 `54640e6`
- [x] UX 전수 조사 결과 합치기 → 인벤토리 44–88 추가 (얹음 35 · 계획서 2 로 8 · 제외 2) → How F~I 신설 → 검증 14–22 추가
- [x] Artifact 재발행 → 보고 → 승인 (2026-09-14 21:45 "지금 실행")
- [x] 게이트·훅·뷰어 코드 + 테스트 — 16개 스위트 전부 통과, 워크스페이스 계획서 105건 회귀 0 (완전 통과 19→33)
- [x] 보드·덱 파이프라인 삭제, /cp SKILL.md 재작성(1041→471줄), /cc·/cd·/cps·/crv 문구
- [x] 문서 정리 → 커밋(7172229 · b5647ad) → v3.39.0 PR #10 병합 · 태그 `v3.39.0` = 8d320ac → 브랜치 삭제
- [x] Codex 재설치 — 캐시 3.24.0 → **3.39.0** (`codex plugin list`: lens@CreetaCorp installed, enabled 3.39.0 · md-render 있음 · board-builder 없음) — 검증 6
- [x] Claude 플러그인 3.38.0 → 3.39.0 (`claude plugin update` — **재시작해야 훅 적용**)
- [x] 브라우저 레인 렌더 실측(창 없이) — 이 계획서가 제목·표 2·h2 9·배지 6 으로 렌더, frontmatter 원문 벽 없음
- [x] 검증 22 — Grok 헤드리스에 SKILL.md **앞 60줄만** 주고 물음 → 계약 섹션·AS-IS→TO-BE·띄우기 순서·선택지 3·엔진별 Todo 도구 5문항 전부 정답
- [ ] 실측(사람 화면): Claude 재시작 후 `/cp` 1회(검증 3·14·15·16·19·20) · Codex 앱 `/cp` 1회(검증 4·13) · Grok `/cp` 1회(검증 5) ← **남음 — 세션 재시작이 필요**
- [ ] Mac Mini 등 다른 머신 `/lens-upgrade`
- [ ] 계획서 2 (실행·완료 UX, 인벤토리 80–87)

### 편차 기록 (계획 ↔ 실제)
- **D-2 `LENS_ROOT` → `${CLAUDE_PLUGIN_ROOT}` 유지**: 계획은 SKILL 명령의 플러그인 경로를 `$LENS_ROOT` 로 바꾸는 것이었다. 구현 중 확장 바이너리를 확인하니 Claude Code 는 스킬 본문의 `${CLAUDE_PLUGIN_ROOT}` 를 **불러올 때 실제 경로로 치환**한다(치환 함수 실측). `$LENS_ROOT` 로 바꾸면 Claude Code 에서 오히려 빈 경로가 된다. 그래서 자리표시자는 그대로 두고 계약 카드 2번에 "Codex·Grok 에서 글자 그대로 보이면 SKILL.md 두 단계 위 경로로 바꿔 실행" 을 적었다. 훅 메시지는 런타임에 아는 절대경로를 직접 적는다.
- **#43 처방 범위 축소**: VS Code `claudeCode.environmentVariables` 는 건드리지 않았다 — `~/.claude/settings.json` env 한 곳으로 실행 중 세션에 TodoWrite 가 떴다(실측).
- **#36 과 별개로 `.lens/plan-doc-hook.json` 신설**: 계획서 훅의 동일 메시지 반복 억제용 상태 파일.
- **UX 조사 워크플로 과소비**: 에이전트 315개 큐잉 → 세션 한도 소진(메모리 `trap-workflow-fanout-burns-session-limit`). 후보 101건은 journal 에서 회수해 인벤토리 44~88 에 반영했다.
- [ ] A 양식→계약 (#1–4, 37–39)
- [ ] B HTML 덱·보드 파이프라인 제거 (#5–13, 31–33)
- [ ] C 띄우기 = 플랫폼 네이티브 (#14–20)
- [ ] D 세 엔진 동일 버전·루트 해석 (#21–24, 40)
- [ ] E 문서·테스트·메모리 (#25–27, 34–35, 41–42)
- [ ] 검증 1–13 실행 → 릴리즈 → Codex 재설치 → 커밋·동기화

## 🚫 건드리지 않는 것

- `lib/plan-manager.js` 의 `REQUIRED_SECTIONS` 6개·기존 `SECTION_ALIASES` 항목·`validatePlanCoverage` 의 판정 규칙·`deriveTodoItems` 의 목표/인벤토리 파생 — 계약 그 자체. **추가만 한다**(A-5 의 kind 게이트, A-6 의 단계 관용). 기존 계획서 61건이 지금 통과하면 바꾼 뒤에도 통과해야 한다(회귀 테스트로 고정).
- Phase 2.45 인벤토리 + 커버리지 게이트 + Todo 파생 문구 — 2026-07-15·08-17 대표 지시의 실행체. 양식을 풀어도 누락 방지는 이게 한다.
- `harness-rules.md` §4.8 의 정직성 조항(SSH 는 `remote`, 실패는 첫 줄에) — 방향은 같고 레인만 는다.
- `/cc`·`/cd`·`/cps`·`/cs` 의 다른 절 — `${CLAUDE_PLUGIN_ROOT}` 치환은 별건(인벤토리 28).
- 각 레포에 이미 있는 `docs/**/*.html`·`docs/_shared.css`·`board_*.html`·`.lens/pr-cache.json` — 지우지 않는다(인벤토리 29·36). 이 레포(creeta-lens)의 것도 같다.
