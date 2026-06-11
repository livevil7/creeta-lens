# lens — Skill navigator & plan-first execution engine for Claude Code

Scans all installed plugins (Skills, MCP tools, LSP servers), recommends the best match, and executes it. Plan-first execution with /cp.

## Version

- Current: **v3.15.0**
- Updated: 2026-06-11
- Source of truth: `.claude-plugin/plugin.json`
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
| `/cc` | Parallel multi-agent engine | Scan → Multi-Match → Parallel Execute → Synthesize |
| `/cp` | Plan-first (fast/standard) | Speed tiers: Fast = Goal + checklist + board; Standard = Codex + Plan A/B + pre-mortem + HTML. Deep → /cpp |
| `/cpp` | Power Plan (deep, build-ready) | Goal+장면 → Clarify-to-zero → fan-out 조사(6축) → domain deep-spec → **Codex 협의(필수)** → build-ready tasks → EARS → approve |
| `/cps` | Repo orientation doc | Scan docs → Assemble 4 sections → Diff gate → Write → Conditional CLAUDE.md pointer |
| `/cr` | Self-modernization audit | Load registry → probe/web native capabilities → classify KEEP/THIN/OBSOLETE + upgrade/ergonomics → (deep) conversation mining → report + /cp handoff → stamp |

- `/c <request>` picks the best one skill and runs it
- `/cc <request>` runs ALL relevant skills as parallel Task agents, then synthesizes outputs
- `/cp <request>` generates a work plan document, gets user approval, then executes
- `/cps` generates/updates `docs/START_HERE.md` — a repo's first-read orientation + question-routing entry point
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
| `capabilityAuditNudge` | `true` | Show `/cr` staleness nudge at session start (Lens repo only, no network) |
| `capabilityAuditIntervalDays` | `30` | Days before the `/cr` audit is considered stale |

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
- 작업 히스토리: `docs/history/` 참조
- 변경 이력: [CHANGELOG.md](CHANGELOG.md)
