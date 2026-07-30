# lens — Skill navigator & plan-first execution engine for Claude Code

Scans all installed plugins (Skills, MCP tools, LSP servers), recommends the best match, and executes it. Plan-first execution with /cp.

## Version

- Current: **v3.26.0**
- Updated: 2026-07-30
- Source of truth: `.claude-plugin/plugin.json`
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
| `/c` | Single skill navigator | Scan → Recommend → Execute → Discover |
| `/cc` | 개발(빌드) — 병렬 멀티에이전트 엔진 | Scan → Multi-Match → Parallel Execute → Synthesize |
| `/cp` | 계획 엔진 — **3등급(fast/standard/deep)** | 등급은 **위험도**로 판정(분량 아님). `/cp fast|standard|deep <요청>` 명시 지정 + **양방향 불일치 가드**(낮춰=강한경고/높여=가벼운안내). 골격 **What→Why(6하원칙)→🧰실행전략→How→💡시사점/주의점/SideEffect→✅Review(검증수단)**. deep = 6축 fan-out + **Codex 하드게이트** + 빌드레디 태스크 + 되묻기 0 (구 `/cpp` 흡수) |
| `/ccp` | Power Verify (개발 후 전체 리뷰·QA·수정) | `/cc`가 만든/가동 중인 것 → 실제 실행 베이스라인 → 4렌즈 적대적 검증 → 만장일치 게이트 → 최소 수복(안전장치) → 증거 리포트(verified true/false) |
| `/cps` | Repo orientation doc | Scan docs → Assemble 4 sections → Diff gate → Write → Conditional CLAUDE.md pointer |
| `/cr` | Creeta Research (라이브 딥리서치) | Refine topic → Read live-research substrate → multi-angle parallel gather (Exa·GitHub·YouTube·community·RSS) → cross-check conflicts → report to conversation (no file saved) |
| `/crv` | Self-modernization audit | Load registry → probe/web native capabilities → classify KEEP/THIN/OBSOLETE + upgrade/ergonomics → (deep) conversation mining → report + /cp handoff → stamp |
| `/ci` | Install sync (per-user) | Dry-run diff (manifest ↔ installed) → 4-bucket preview (install/remove/foreign/ok) → approve → install missing (marketplace add + `install --scope user`) → remove **only excluded** (backup + per-item confirm) → foreign report-only → re-diff. Self-protecting: never uninstalls Lens. Backend `lib/install-sync.js` |

- `/c <request>` picks the best one skill and runs it
- `/cc <request>` runs ALL relevant skills as parallel Task agents, then synthesizes outputs
- `/cp <request>` generates a work plan document, gets user approval, then executes
- `/cps` generates/updates `docs/START_HERE.md` — a repo's first-read orientation + question-routing entry point
- `/ci` syncs installed plugins to a per-user manifest (`~/.claude/lens/manifest.json`): installs missing, removes only explicitly-excluded (backup + per-item confirm), reports foreign read-only
- Any command with no args shows full skill inventory

## Hooks (5)

| Hook | Event | File | When |
|------|-------|------|------|
| SessionStart | Session start (once) | `hooks/session-start.js` | Scans plugins, caches results, loads memory, inits dashboard + plans dir, injects context |
| UserPromptSubmit | Every message | `scripts/user-prompt-handler.js` | Keyword matching for auto-suggest; `/command` override for explicit invocation |
| PreToolUse | Before Task tool | `hooks/pre-tool-task.js` | Registers sub-agent as "running" in dashboard |
| PostToolUse | After Task tool | `hooks/post-tool-task.js` | Marks sub-agent "done" or "error", records duration |
| Stop | Session end | `hooks/stop.js` | Finalizes session, marks orphaned agents as error |

## Libraries (lib/)

| Module | File | Key Exports | Description |
|--------|------|-------------|-------------|
| Skill Scanner | `skill-scanner.js` | `scanInstalledSkills()`, `formatSkillTable()`, `detectDomain()` | Scans `~/.claude/plugins/cache/`. Skills, MCP, LSP, Hybrid. 24 domain patterns. 4-level env var path resolution |
| Keyword Matcher | `keyword-matcher.js` | `matchKeywords()`, `saveScanCache()`, `formatKeywordTable()` | Dynamic keyword map from scan results. Zero hardcoded mappings. Cache at `.lens-cache.json` |
| Memory Store | `memory-store.js` | `loadMemory()`, `saveMemory()`, `recordSessionStart()`, `recordSkillUsage()`, `recordPlanCreation()` | Persists at `~/.claude/lens/.lens-memory.json`. Usage counts, recent skills, plan history |
| Plugin Registry | `plugin-registry.js` | `searchRegistry()`, `KNOWN_PLUGINS` | Installable-plugin discovery. `KNOWN_PLUGINS` is currently **empty** (registry disabled); kept as an opt-in extension point. Per-message auto-suggest is **off by default** (`autoRecommend:false`) — native Skills auto-discovery handles routing |
| Agent Tracker | `agent-tracker.js` | `initSession()`, `registerAgent()`, `completeAgent()`, `endSession()` | Tracks Task agent lifecycle in `.lens/agent-dashboard.json`. Atomic writes, error logs |
| Plan Manager | `plan-manager.js` | `getPlansDir()`, `ensurePlansDir()`, `getStatePath()`, `generateSlug()`, `generateFileName()`, `generatePlanId()`, `savePlanState()`, `loadPlanState()`, `listPlans()`, `formatPlanSummary()`, `generatePlanContent()`, `parsePlanFrontmatter()`, `updatePlanStatus()`, `validatePlanStructure()`, `REQUIRED_SECTIONS`, `extractGoal()`, `extractPlanBTriggers()` | Plan file naming (`YYYY-MM-DD-slug.md`), Goal-first document generation (8-lang headers), YAML frontmatter parsing, status lifecycle, state at `.lens/plan-state.json`. v3.4+ `extractGoal` / `extractPlanBTriggers` 는 `/cc` 핸드오프 진입 시 SUCCESS_CRITERIA 와 Plan B Trigger 매칭에 사용 |

## Folder Structure

```
lens/
├── .claude-plugin/
│   ├── plugin.json            # Plugin manifest (version source of truth)
│   └── marketplace.json       # Marketplace registration
├── skills/
│   ├── c/SKILL.md             # /c — single skill navigator
│   ├── cc/SKILL.md            # /cc — parallel multi-agent engine
│   └── cp/SKILL.md            # /cp — plan-first execution
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
│   ├── keyword-matcher.js     # Dynamic keyword matching
│   ├── memory-store.js        # Session memory persistence
│   ├── plugin-registry.js     # Known plugins for discovery
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
| `autoRecommend` | `true` | Suggest skills via UserPromptSubmit hook |
| `showReport` | `true` | Show "Lens Tip" line when a skill matches |
| `minMatchScore` | `5` | Minimum keyword match score for auto-suggestions |
| `memoryPath` | `null` | Custom memory file path (null = `~/.claude/lens/`) |
| `customKeywords` | `[]` | Additional keyword-to-skill mappings |
| `planDir` | `null` | Custom plan file directory (null = project `docs/`) |
| `defaultPlanLanguage` | `null` | Force plan language (null = auto-detect from user) |
| `saveSynthesisResults` | `true` | Save /cc synthesis results to .lens/results/ |
| `resultsDir` | `null` | Custom results directory (null = `.lens/results/`) |
| `autoRecommend` | `false` | (v3.13: default off) Per-message skill auto-suggest. Native Skills auto-discovery routes instead |
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
| `.lens-cache.json` | Plugin root | Scan results cache for UserPromptSubmit |
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
