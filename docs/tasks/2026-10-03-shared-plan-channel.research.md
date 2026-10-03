# 조사 결과 — 공용 계획 채널 + 전 컴퓨터 현황판 (2026-10-03 KST)

조사 에이전트 3개 (sonnet 2 · opus 1). 원문 요약을 빠짐없이 옮긴다.

## A. Lens /cp·/cc·/cd 현재 구조 (creeta-lens v3.51.0, sonnet)

- 띄우기 레인 3개: artifact(Claude) → inline(Codex visualize) → sendfile (skills/cp/SKILL.md:277-286). md 저장 · 화면은 HTML 페이지 (:21).
- 표시 기록: `<repo>/.lens/report-shown.json` (gitignore, 머신 로컬, 100개). stale = md sha256 앞 12자리 비교 (lib/report-viewer.js:46-144). frontmatter `shown:` 은 코드가 안 씀.
- 질문 블록: templates/cp-questions.html — 답 형식 `[Lens /cp 답변] <plan_id>` + `[id] 질문 → 답` (:66-75). 전송은 `window.claude.use('comments').sendToClaude` — Claude Artifact 전용 (:139-170). 4000B 넘거나 권한 없으면 복사 칸.
- 승인: artifact-auto-react 알림 → ArtifactComments read. **대표 본인 증명 = 플랫폼이 찍는 머리표 `[the user (owner), posted by the artifact…]`** (SKILL.md:379). 사이트로 옮기면 Access 이메일로 대체해야 함 — 없으면 승인 위조 가능.
- 훅(Claude 전용, hooks/hooks.json): pre-tool-ask(보고 없는 질문창 거부·/cc 중 질문 제한) · pre-tool-plan-doc(docs/tasks/*.md 쓰기 시 실제 모델 fable 검사) · post-tool-plan-doc(구조·커버리지 검사, 미표시 힌트, 차단 안 함) · pre/post-tool-task · progress · stop(게이트 원장) · session-start · sync-pull. 표시 게이트를 강제하는 훅은 없음.
- /cc 진행 기록: 계획서 `## 진행상황` 절 Edit, 검증표 ✅, 체크박스, last_tip. **`status: executing` 을 안 씀 — 마지막 `done` 만** (skills/cc/SKILL.md:1002). 원장 `.lens/gates/` · `~/.claude/lens/active-ledgers.json` · `~/.claude/lens/sessions/<sid>/` 전부 머신 로컬.
- 상태 어휘 분열: /cp `planned→approved→executing→blocked→done` (cp:201) vs lib/plan-manager.js:561 `draft|approved|executing|completed|failed|cancelled`. 실제 문서도 done/executing/in-progress/in_progress/planned 제각각. 예: docs/tasks/2026-08-14-cs-mirror-invariant.md 는 status planned 인데 본문은 T1~T8 완료.
- /cd: 병합·PR 을 git 으로 증명 후 docs/history/ 로 이관, 브랜치 lease 정리 (skills/cd/SKILL.md:97-306).
- Codex: 같은 SKILL.md, visualize/sendfile, 승인은 request_user_input. 페이지 질문 블록 못 씀. **Codex 플러그인엔 hooks 없음** — 규칙은 산문뿐 (.codex-plugin/plugin.json).
- 멀티머신: machine_id = 호스트명 도출 (livevil-setting/docs/rules/machine-identity.md 정본). Lens 코드엔 머신 식별 없음(os.hostname 0건).
- /cs (scripts/git-sync-all.sh): 레포별 fetch·ff·미러 push·sync/ 회수. `--json` 마지막 줄이 유일한 다레포 수집 결과. 계획서·승인 상태는 안 모음. 머신 한 대 기준, 결과 저장 안 함.
- lens.config.json: 플러그인 루트 한 파일, 레포 이름 키. 셸 파서는 단일 줄 평면 JSON 전제 (git-sync-all.sh:91-107).
- 테스트: package.json 없음, 파일별 직접 실행(`node lib/report-viewer.test.js`, `node templates/cp-questions.test.js`, `node hooks/pre-tool-ask.test.js`, `bash tests/test_git_sync.sh`). 릴리즈: `bash scripts/bump-version.sh X.Y.Z` (12파일) → 커밋 → 태그 → `git push origin master --tags` → gh release (docs/rules/release-guide.md:75-155). 캐시가 버전 키라 버전 올려야 반영.
- 손댈 파일(추론): lib/report-viewer.js·scripts/show-report.js(+test) `site` 방식 · 신규 CLI(publish/answers/…) · templates/cp-questions.html · skills/cp·cc·cd SKILL.md · hooks/post-tool-plan-doc.js 힌트 · lens.config.json · lib/plan-manager.js 상태 어휘 · CLAUDE.md·CHANGELOG·bump.

## B. livevil-data 문서함 docs.blex.co (origin/main f1dd2b5, sonnet) — 로컬 main 은 6커밋 뒤처짐

- 워커 라우트 (site/src/worker.mjs): 공개 `/d/<링크>`(비밀번호, 24h 쿠키, 5회 15분 잠금) · 관리 `adminRoute`(:211) 안 `/admin`, `/api/brands|templates|docs|links…`. **문서 생성·판 올리기 쓰기 API 없음** (쓰기 = 링크 발급·폐기·문서 소프트 삭제뿐).
- 인증 isAdmin(:205-209) = Access JWT 서명·aud·iss·exp 만. **이메일 검사 없음.** 비GET 은 Origin 다르면 403, 없으면 통과(:214-215).
- D1 (site/schema.sql): documents(id, company, format, title, doc_date, created_at, deleted_at, collection[doc|lecture|sample]) · versions(PK doc_id+version, files JSON) · links · access_log. R2 키 `docs/<docId>/v<판>/<파일>` 덮어쓰지 않음.
- 올리기 bin/publish.mjs: 워커 안 거치고 Cloudflare 직접 (wrangler d1 execute --remote / r2 object put), 토큰 = livevil-setting/env/livevil-data.env 의 **계정 전체 권한 토큰** (워커·R2·D1·Access 편집). 판 번호는 클라이언트가 MAX+1 → **동시 게시 경쟁**(1인 도구라 수용했던 위험, 다중 머신이면 깨짐).
- 서비스 토큰 없음 (코드 0건). Access 정책에 Service Auth 추가 필요 = 계정 설정 변경(멈추는 곳). 서비스 토큰 JWT 는 email 대신 common_name (추정, 미확인). 이메일 검사 없는 지금 구조에선 서비스 토큰이 링크 발급·삭제까지 다 할 수 있게 됨 → 권한 분리 필수.
- 답변 기능 없음. 미리보기 iframe sandbox="allow-scripts", CSP connect-src 'none' / form-action 'none' → **문서 HTML 안에서 답 못 받음**. 답변 칸은 iframe 밖 관리 셸(connect-src 'self', `api()` 헬퍼 admin.html:406).
- 렌더: bin/render.mjs → templates/<format>/render.mjs, 본문 lib/html.mjs(markdown-it, 표 지원, raw HTML·이미지 꺼짐). 형태 report/word/deck/lecture. **Lens 계획서 md 는 그대로 못 렌더** (company/format/title/date 필수, parseSource 예외). → `plan` 형식 신규(앞머리 어댑터·상태 배지·H2 목차·결정 표).
- 부딪히는 규칙: ① 문서함 개편 계획서 비목표 "편집·댓글·승인 흐름 제외" (2026-10-02-docs-groups-lecture-guides.md:110,355) — 번복 명시 필요 ② LLM 예약 실행 금지 — 승인 회수는 pull, 현황 수집은 비-LLM 스크립트 ③ Access 변경 = 멈추는 곳 ④ 새 경로는 adminRoute 안 `/api/` 아래 ⑤ sandbox·CSP 불변 ⑥ /d·links·versions·access_log 불변, 새 기능은 새 표 ⑦ 동시 게시 → 판 번호 서버 할당 ⑧ tests/live-script-clean.mjs: 워커 번들에 문서 제목 0건 ⑨ 계획서에 비밀 값 금지 → 업로드 전 시크릿 패턴 검사 ⑩ 무료 요금제(요청당 CPU 10ms, D1 쓰기 한도 미확인) → 현황판은 머신당 1행 upsert ⑪ Access 허용 이메일 sj@blex.co · livevil7@gmail.com (후자는 대시보드에만) ⑫ 화면 규칙: 설명 문장 금지·ui-ux-pro-max 선행·버튼 전수 클릭·dormant 금지.
- 테스트: `npm test` (node --test tests/*.test.mjs), 사이트 `node --test tests/site.test.mjs` (Miniflare 메모리 D1·R2, schema.sql 을 주석 제거 후 `;` 분리 적용). 라이브 `node tests/live-smoke.mjs` (LIVE SMOKE OK) · `node tests/live-script-clean.mjs`. 화면 tests/no-external·responsive·fullscreen.
- 배포 (site/README.md:32-42): `node bin/check-brands.mjs --write-index` → D1 스키마(`wrangler d1 execute --remote`, 마이그레이션 체계 없음) → 데이터 → `cd site && npx wrangler deploy`. 워커 먼저 올리면 관리 목록 500. 롤백 `wrangler rollback`(워커만), D1 Time Travel 금지.
- 바꿀 곳(제안): schema.sql 새 표 · auth.mjs 사람(email)/기계(common_name) 구분 · worker.mjs plan 묶음·기계용 API · admin.html 답변 패널·「현황」 탭 · lib/source.mjs plan 형식 · templates/plan 신규 · bin/push.mjs(fetch + CF-Access-Client-Id/Secret) · publish/import-html 묶음 허용 · tests · SKILL.md·README · Cloudflare 대시보드(서비스 토큰, 멈추는 곳).

## C. 전 컴퓨터 실측 + 수집 방식 (opus, 2026-10-03 11:15 KST, fetch 없음·GIT_OPTIONAL_LOCKS=0)

머신:
| machine_id | OS | 접속 | 역할 | SSH | python |
|---|---|---|---|---|---|
| sj-omen | Win11 | 이 PC | 개발 | — | 3.13.15 |
| sj-rog | Win | sj-rog 100.85.42.85 | 개발 | ✅ | 3.13.13 |
| sj-x1 | Win | sj-x1 100.83.153.94 | 개발(노트북) | ❌ TS 1일 오프라인 | ? |
| win002 | Win | win002 100.84.248.15 | 원격작업·snapholo 운영 | ✅ | 3.13.15 (python3 는 shim) |
| window-001 | Win | user@100.76.40.97 (별칭 없음) | 대기기 | ✅ 켜져 있음(메모리는 꺼짐) | 3.13.15 |
| macmini | macOS | -p 22 user@100.110.195.20 (2222 실패) | 상시 서버 | ✅ 22만 | 3.14.7 |
| mac-001 | macOS | mac-001 100.82.78.3 | 원격작업 | ✅ | 3.14.7 |
| sj-macbookair | macOS | TS 100.121.124.51, 기록 없음 | ? | 시도 안 함 | ? |
| namane-mkt | macOS | TS 29일 오프라인, 키 소실 | 마케팅 | ❌ | — |

⚠️ macmini 2222 포트 호스트키 변경 경고(REMOTE HOST IDENTIFICATION HAS CHANGED) — 우회 안 함.

레포 실측 (로컬 기준): 체크아웃 81 · dirty 15 · 추가 워크트리 19 · 미병합 14 · stash 24.
- sj-omen 21/1/0/1/0 (livevil-setting ahead1 behind30) · sj-rog 23/1/0/1/3 · win002 4/1/1/0/2 · window-001 2/1/11/0/2 (snapholo-data behind 402, fetch 09-16) · mac-001 4/1/2/3/1 (detached 1) · macmini 27/10/5/9/16 (`~/.livevil-growth` ahead 433, .livevil-rally behind74 dirty74, rba-staging dirty49, fetch 대부분 08-05).
- **/cs 사각지대**: git-sync-all.sh 의 `"$root"/*/` 가 점 폴더를 건너뜀 → macmini ~/.livevil-growth·.livevil-contents·.livevil-rally 동기화 누락.
- mac-001 Documents/GIT == Documents/Git (대소문자 무시) → inode 중복 제거 필요 (git-sync-all.sh 에 로직 있음).

수집 방식 비교: A 머신별 push→워커 / B 허브 SSH pull / C git 에 상태 파일 커밋 / D GitHub API.
- **C 는 이미 가동 중**(livevil-setting scripts/fleet-status.sh·fleet-sync.sh, fleet/status/, launchd com.livevil.fleet-sync·fleet-status, Windows \LensFleetSync) — **오늘 오보**: sj-omen 09:03 상태 커밋이 ahead1/behind30/dirty2 로 push 막힘 → macmini 10:00 보고가 sj-omen "2.0일째 보고 없음". win002 는 fleet-sync 미등록. 머신 이름이 원래 호스트명(users-mac-mini, mac001, sj_x1)이라 느슨 매칭. fleet-status.sh 는 ts[:19] 로 시간대 버림.
- B: macmini 에 나가는 별칭 없음, PS 5.1 인코딩·CLIXML, SSH 세션은 자격증명 관리자 없어 fetch 불가, 2222 키 문제.
- D: dirty·stash·워크트리·push 안 된 커밋 안 보임 → 핵심 누락. 병합·PR 정확도 보조로만.
- **추천 A** (+ D 선택 보조). 부품 재사용: 스케줄(\LensFleetSync, launchd fleet-sync), 기대 머신 목록 livevil-setting/claude-code/skills.json `fleet.machines`, 레포 탐색 GIT_ROOTS+후보+inode, 비밀 배포 livevil-setting env/. 구성: livevil-setting `scripts/git-fleet-report.py` (stdlib), machine_id 는 machine-identity.md 규칙, docs.blex.co 수집 경로로 POST, D1 머신별 최신값 upsert. 인증 = Access 서비스 토큰. 멈출 조건: STOP 파일·1회 60초·git 명령별 timeout·같은 해시면 업로드 생략(1시간 생존 신호)·연속 실패 시 간격 늘림. LLM 없음.

세션 신호:
- `~/.claude/sessions/<pid>.json`: pid, sessionId, cwd, status(busy/idle), statusUpdatedAt, name, entrypoint, version (sj-omen 8개 — cwd 가 전부 워크스페이스 루트라 레포 판정 불가)
- `~/.claude/projects/<cwd>/<sid>.jsonl`: 줄마다 cwd, gitBranch, sessionId, timestamp. mtime=마지막 활동. 본문 대화 원문 → 메타 필드만.
- `~/.claude/lens/sessions/<sid>/dashboard.json`·progress.json: Lens 세션·에이전트 수.
- `~/.codex/sessions/YYYY/MM/DD/rollout-*.jsonl` 첫 줄 session_meta(cwd, originator, cli_version) — mtime 으로만 활성 판정.
- `~/.claude.json` oauthAccount.emailAddress → 어느 계정 세션인지.
- 세션↔레포 연결은 busy 세션 + 최근 바뀐 레포로 추정.

위험: 수집기에서 fetch 금지(자격증명 창 대기·잠금 경쟁·느림) → FETCH_HEAD 시각을 "원격 기준 시각"으로 표시 · `GIT_OPTIONAL_LOCKS=0`·`GIT_TERMINAL_PROMPT=0` · 파일명·절대경로 안 보냄(레포명·브랜치·숫자만), 세션은 id·상태·mtime 만 · 꺼진 머신은 마지막 수신 시각·기대 목록 대비 "한 번도 보고 안 함" · 시각은 오프셋 ISO/epoch → 화면 KST · Windows python3 shim → `py -3`/`python` · launchd PATH /opt/homebrew/bin, LimitLoadToSessionType=Aqua 는 GUI 세션과 같이 죽은 이력.

## D. 관련 규칙·기억 (세션 컨텍스트)
- 자동으로 도는 건 파이썬만, LLM 타이머 금지, 멈출 조건 필수 (feedback_no_scheduled_llm)
- dormant 스캐폴딩 금지 — 라이브 가동까지 완료 (feedback_no_dormant_scaffolding)
- 절대경로·머신 하드코딩 금지 (feedback_no_machine_hardcoding)
- 보고는 바로 열리는 링크 · 승인 질문은 페이지 안 (feedback_report_with_openable_link, feedback_report_before_asking_approval)
- 승인 한 번이면 끝까지, 정지 3종(비가역·돈/외부 발송·범위 변경), 배포·DB 변경은 멈춤 (feedback_nonstop_after_approval)
- Codex 는 네트워크·git 차단 샌드박스로 쓴다 (codex-grok-sandbox-capabilities) → Codex 세션이 직접 docs.blex.co 를 못 부를 수 있음
- 텍스트 LLM = Claude 구독 2계정 체인, ChatGPT/Codex 는 이미지 전용(2026-09-20) — 단 대표는 이번 요청에서 Codex·Grok·기타를 개발 LLM 으로 열거함
- Grok 구독 해지(2026-09-15)
- 화면: ui-ux-pro-max 선행, 설명 문장 금지, 버튼 전수 클릭 320~1440, 어드민 = 요약·판정·다음행동 먼저
- livevil-setting 로컬은 항상 master, /cs reset --hard 주의
- 같은 레포를 다른 세션이 쓰면 worktree 로 분리
- win002 git ff 는 core.longpaths, PS 5.1 은 $LASTEXITCODE 확인

## E. 대표 제안(조사 중 추가) — "이건 일종의 메모리 기능, 지금 쓰는 메모리를 응용하면?" + AgentMemory 실측 (2026-10-03)
- AgentMemory 서버 = Mac Mini 100.110.195.20:3111 (Tailscale 사설망), Bearer 비밀키 1개를 전 머신·전 LLM 이 공유(livevil-setting/env/agentmemory.env). Claude 는 플러그인 MCP, Codex 는 scripts/agentmemory-shared.mjs MCP — MCP 는 Codex 샌드박스 밖에서 돌아 네트워크 막힘과 무관.
- 실측 REST: `GET /agentmemory/actions` → `{"actions":[],"success":true}` (작업 항목 기능 동작, 비어 있음) · `GET /slots` → "Memory slots not enabled" (AGENTMEMORY_SLOTS 플래그 꺼짐, MCP memory_slot_list 는 500) · leases(acquire/release/renew)·signals(agentId 필요) 엔드포인트 존재 · health 의 mem::summarize 실패 10,893 / 성공 4,777.
- 공통 메모리 계약: "파일 메모리가 정제된 사실의 기준이고 AgentMemory 는 검색 가능한 작업 기록", smart-search 가 저장된 기억을 누락하는 실측 있음.
- 판단 재료:
  - 장점: 전 머신 인증이 이미 끝남 · Codex 도 MCP 로 닿음 · 잠금(lease)으로 "같은 계획을 두 컴퓨터가 동시에 잡는 것"을 막을 수 있음 · 세션 작업 기록이 이미 자동으로 쌓임.
  - 단점: docs.blex.co(Cloudflare)는 사설망의 AgentMemory 에 못 닿음 → Mac Mini 에 다리 프로세스 하나 더 · 비밀키 1개를 모든 LLM 이 공유 → 어떤 LLM 이든 "승인됨"을 써넣을 수 있음(대표 본인 증명 불가) · 검색형 기억이라 "지금 상태"를 정확히 꺼내는 저장소로 약함 · 상태 칸 꺼짐 · Mac Mini 단일 장애점 · 외부 엔진(0.9.x) 업데이트로 API 변동 가능.
- 세션(Claude 오케스트레이터)의 추천: **수집기 한 줄기** — 각 머신의 파이썬 수집기가 10분마다 ① git 상태 ② 바뀐 계획서 md(docs/tasks/*.md 해시 비교) 를 docs.blex.co 로 올리고 ③ 대표 답변을 `<repo>/.lens/answers/<plan_id>.json` 으로 내려받는다. 그러면 Codex·Grok·기타 어떤 LLM 이든 "파일을 쓰고 파일을 읽기"만 하면 되고(네트워크·훅·플러그인 불필요), 출입증 종류도 하나다. Claude 는 같은 스크립트를 `--now`(즉시 올리기)·`--wait <id>`(답 올 때까지 30초 간격 확인, 상한 있음, 백그라운드 실행으로 세션 깨움)로 부른다. AgentMemory 는 지금처럼 결정·인계 기록용으로 유지, 채널로는 쓰지 않음. 잠금(lease) 대신 현황판이 "같은 브랜치·같은 계획을 두 곳에서 잡고 있음"을 경고(탐지).
- 대안(대표가 고를 수 있게 🙋 결정으로): **AgentMemory 연락망 혼합** — LLM 은 AgentMemory 작업 항목·잠금·신호로 계획 상태를 주고받고, Mac Mini 다리가 docs.blex.co 와 동기화. 승인 위조 방지는 다리가 Ed25519 서명, Lens 가 공개키로 검증.

## F. 대표 추가 발언 (2026-10-03, 계획서 작성 중) — 범위 축소 대안
"진정한 통합 관제 시스템으로 가는건 지금 단계에서 너무 어렵거나 관리포인트가 많으면, https://claude.ai/artifacts 여기에서 보이는 아티펙트를 그냥 doc.blex.co 안에 싹다 여러계정꺼를 다 모아서 볼수 있게만 하는것도 방법 (모아서 본다는건 기본으로 클로드내에서 아티팩트를 작성하고, 작성을 하고 나면 그 후에 복사본을 계속 doc.blex.co에 저장하고 업데이트하면서 관리를 하는거지."
→ 해석: 작성·승인은 지금처럼 Claude Artifact 에서, docs.blex.co 는 여러 계정 아티팩트의 복사본을 모아 보는 곳(보기 전용), 아티팩트가 갱신되면 복사본도 갱신. 조건부("너무 어렵거나 관리포인트가 많으면") — 관리 포인트 비교로 판단해 추천할 것.

---

# 부록 — 워크플로 Scout·설계·심사 원문 (2026-10-03, 요약 없이 그대로)

## Scout 1 — 훅·계정

# 안 B "복사본 자동 저장" 기술 조사: Claude Code 쪽

조사는 읽기 전용이었습니다. 임시 스크립트는 세션 scratchpad에만 두었고, SSH로는 `~/.claude.json`에서 필드 몇 개만 읽었습니다. (실측)은 직접 확인한 것, (추정)은 확인하지 못한 것입니다.

## 1. 훅으로 Artifact 호출을 잡을 수 있나

**훅 발동 (실측)**
- 이 PC 대화 기록 jsonl 1,085개 중 22개에 `"name":"Artifact"` tool_use가 147건 있습니다. 서브에이전트 호출 6건이 포함됩니다.
- 147건 모두에 `PostToolUse:Artifact` 훅 실행 기록이 붙어 있습니다.
- 실행된 것은 `creeta-lens/hooks/post-tool-progress.js`입니다. 매처가 없는 훅이고, 응답 시간은 67~176ms였습니다.
- 서브에이전트 호출에서도 훅이 돕니다.
- `creeta-lens/hooks/hooks.json`의 matcher는 도구 이름 정규식입니다(`"Task|Agent|Workflow"`, `"Write|Edit"`). 같은 형식으로 `"Artifact"`를 넣으면 될 것으로 보입니다(추정). 실행 기록에 `PostToolUse:Artifact`라는 도구 이름이 찍힌다는 점이 근거입니다.

**stdin에 들어오는 필드 (코드 근거)**
- Lens 훅이 읽는 필드는 다음과 같습니다.
  - `tool_name`, `tool_input.file_path` (`post-tool-plan-doc.js:129`)
  - `cwd` (`:141`), `session_id` (`:144`), `tool_use_id`
  - `tool_response` (`post-tool-task.js:26`)
  - 서브에이전트일 때 `agent_id`
- `lib/spawn-envelope.js:36`은 `tool_response ?? tool_output ?? tool_result ?? response`를 문자열, 배열, 객체 모두로 처리합니다.
- agentmemory 훅(`post-tool-use.mjs:48-74`)도 같은 필드를 읽습니다.
- Artifact의 `tool_response`가 문자열인지 구조체인지는 직접 캡처하지 못했습니다(추정). 대화 기록에는 두 형태가 다 있어서 훅은 둘 다 파싱해야 합니다.

**호출 입력 모양 (publish 계열 131건)**

| 필드 | 모양 |
|---|---|
| `file_path` | 거의 항상 있음 (HTML 경로) |
| `url` | 갱신 17건만 있음. 같은 file_path로 다시 발행하면 없음 |
| `files` | 18건. `{게시경로: 원본경로}` 맵 또는 리스트이고 `root`가 함께 옴. mp4·webp 같은 바이너리 포함 |
| `capabilities` | 40건, `{comments}` |
| 그 외 | `icon`, `label`, `description`, `title`, `action`. 타입 생성은 `type_url`+`auto_open` (2건) |

**결과 모양 (필드 구조만)**
- 텍스트 결과는 `Published <경로> at <URL> (Version N[, version id <epoch>-<hex4>])` 형태입니다. 뒤에 `Stored — contract 0.2.xx · capabilities comments · readable by only you`가 붙습니다.
- 대화 기록의 `toolUseResult`는 구조체입니다. 필드는 `artifact_id`(UUID), `url`, `version`(예: `1790178893-28d3`), `seq`(정수 판 번호), `updated`(bool), `path`, `title`, `audience`("owner"), `capabilities`, `contract`, `stored`, `icon`, `liveSubscription`입니다. 여러 파일을 올릴 때는 `files_written`이 추가됩니다.
- URL 형태는 두 가지입니다. `claude.ai/artifact/<22자>`가 124건이고 구형 `claude.ai/code/artifact/<uuid>`가 7건입니다. 고유 URL은 54개입니다.
- 오류 결과는 0건이라 `PostToolUseFailure` 모양은 못 봤습니다.

## 2. Lens가 띄울 때 로컬에 남는 것

**원본 HTML 위치 (실측)**
- 경로를 해석한 호출 중 scratchpad 임시 폴더가 77건, `.lens/drafts`가 36건, 나머지는 `docs/tasks`·`docs/history` 등입니다.
- scratchpad 77건 중 39건(51%)은 지금 이미 지워졌습니다. 그래서 복사는 훅 발동 시점에 해야 하고, 나중에 수집하는 방식은 안 됩니다.

**`.lens/report-shown.json`**
- 6개 레포에서 25건을 확인했습니다. `.gitignore:3`의 `.lens/`에 걸려 git에는 안 올라갑니다.
- 키는 `planId`, `shownAt`, `method`, `url`뿐이고 19건에만 `sha`가 있습니다. HTML 경로·md 경로·계정은 없습니다.
- 이 기록은 발행 뒤에 LLM이 `show-report.js --shown`을 따로 실행해야 써집니다. 그래서 훅이 도는 시점에는 새 계획서의 URL이 아직 없습니다.
- 훅은 이 파일이 필요 없습니다. `tool_input.file_path`와 응답에서 URL을 직접 얻습니다.

**훅이 plan_id와 md 원본을 아는 법**
- HTML 파일명이 plan_id입니다. 같은 폴더에 같은 이름의 `.md`가 있습니다(`creeta-lens/.lens/drafts/2026-10-03-shared-plan-channel.{html,md}`에서 확인). 위치는 `.lens/drafts/<id>`이거나 `docs/tasks/<id>`입니다.
- 레포 루트는 `lib/hook-utils.js:221`의 `resolveProjectRoot({filePath,cwd})`로 구합니다.
- 계획서가 아닌 아티팩트(주로 scratchpad의 임시 HTML)에는 plan_id가 없습니다.

## 3. 계정 식별

이 PC의 `~/.claude.json`에는 `oauthAccount`가 있습니다. 키는 `emailAddress`, `organizationName`, `organizationRole`, `billingType`, `profileFetchedAt`, `accountUuid` 등이며 이메일과 조직명도 있습니다.

| 머신 | 이메일 | 근거 |
|---|---|---|
| sj-omen (이 PC) | sj@blex.co | 조직 "sj@blex.co's Organization", admin. 프로필 갱신 10-03 10:54 KST |
| sj-rog | sj@blex.co | 프로필 갱신 10-02 20:19 KST |
| win002 | livevil7@gmail.com | 프로필 갱신 09-17 |
| macmini (`-p 22`) | livevil7@gmail.com | 프로필 갱신 06-29. 값이 오래됐지만 존재함 |
| mac-001 | 불명 | `~/.claude.json`은 있으나 `oauthAccount` 없음. `claude auth status`는 `loggedIn:false`. 마지막 대화 12.7일 전 |
| window-001 | 해당 없음 | `user` 프로필에 `~/.claude` 폴더가 아예 없음 |
| sj-x1 | 닿지 않음 | SSH timeout. Tailscale에서도 offline(1일 전까지 접속) |
| namane-mkt | 닿지 않음 | SSH timeout. offline 29일 |
| sj-macbookair | 시도 안 함 | Tailscale에는 보이지만 접속 기록이 없음 |

- 닿은 머신에서 확인된 계정은 이메일 2개뿐입니다. 대표가 말한 "클로드 3개" 중 나머지 하나는 찾지 못했습니다.
- mac-001의 `loggedIn:false`는 SSH 세션이라 macOS 키체인이 잠겼을 가능성이 있습니다(추정). `oauthAccount`가 없다는 점은 그대로입니다.
- `emailAddress`는 로그인 때 저장된 캐시이고, 환경변수 토큰 방식이면 `oauthAccount`가 없을 수 있습니다(추정). SSH 세션 환경에서 `CLAUDE_CODE_OAUTH_TOKEN`·`ANTHROPIC_API_KEY`가 설정돼 있지 않은 것만 확인했습니다.
- **발행 계정은 사후 귀속이 안 됩니다.** 대화 기록 줄에는 이메일이 없습니다.
  - 이 PC가 발행한 고유 URL 54개 중 45개가 현재 계정(sj@blex.co)의 `Artifact list` 40건에 없습니다.
  - 그중 09-24 발행분 하나를 `read`하니 "not found / not shared"가 나왔습니다.
  - "AI 업무진단 특강"은 이 PC 기록에 발행으로 남아 있는데 지금은 `(shared)`로 표시됩니다.
  - 따라서 이 PC는 과거에 다른 계정으로 발행한 적이 있다는 정황입니다. 삭제된 것과는 구분되지 않습니다(추정).
  - 반대로 현재 계정의 `(mine)` 38건 중 36건은 이 PC 기록에 없습니다. 다른 머신에서 만들었거나 claude.ai에서 만든 것으로 보이지만 어느 쪽인지는 구분할 수 없습니다.
  - 그래서 훅이 발행 순간에 `~/.claude.json`의 `emailAddress`를 같이 저장해야 합니다.

## 4. claude.ai 웹·데스크톱 채팅에서 만든 아티팩트

- **Claude Code 훅으로는 안 잡힙니다.** 훅은 Claude Code 프로세스 안에서만 돕니다(구조상 확정). 데스크톱 앱의 Code 탭은 Claude Code라서 훅이 돌고, 채팅 탭은 훅이 안 돕니다.
- **`claude` CLI에는 artifact 관련 하위 명령이 없습니다.** `claude --help` 전체에서 "artifact" 언급이 0건이었습니다(실측).
- **비인증 HTTP 가져오기는 막혀 있습니다.** `curl https://claude.ai/artifact/<id>`가 HTTP 403 Cloudflare "Just a moment" 챌린지를 돌려줬습니다(실측).
- **Artifact 도구의 `list`·`read`는 있지만 LLM 호출입니다.**
  - `list`는 계정 단위로 내려오고(40건), `read`는 본인 소유분의 원본 HTML을 줍니다. 타인 소유 `read`는 승인을 요구했고, 비대화형 세션에서는 거부됐습니다.
  - 스크립트가 직접 부를 수 없으니 "자동으로 도는 건 파이선만" 규칙과 충돌합니다.
  - 목록 행에는 만든 곳(웹/Code)이 표시되지 않습니다.
- **공식 공개 API는 아는 범위에서 없습니다** (추정, 미확인).
- 설정의 데이터 내보내기(zip)에 게시 아티팩트 HTML이 들어 있는지도 확인하지 못했습니다. 들어 있더라도 수동 절차입니다.
- claude.ai 내부 웹 API를 쿠키나 토큰으로 호출하는 방법은 비공식이라 불안정할 것입니다. 시험하지 않았고 권하지 않습니다.
- 결론: 웹·데스크톱 채팅에서 만든 아티팩트를 결정적(비-LLM)으로 가져오는 경로는 확인하지 못했습니다.

## 결론: 안 B 자동 복사의 범위

| 구분 | 내용 | 근거 |
|---|---|---|
| **되는 범위** | 이 머신 Claude Code(서브에이전트 포함)에서 Artifact를 발행하거나 갱신할 때마다 HTML을 즉시 복사 | 147/147 훅 발동 |
| | URL, 판(`seq`, `version`), 제목, 발행 시점 계정 이메일 기록 | 응답 필드와 `~/.claude.json` |
| | Lens 계획서의 plan_id와 md 원본 연결 | 파일명 규칙 |
| | 계정이 `~/.claude.json`에 남아 있는 머신(sj-omen, sj-rog, win002, macmini)에 같은 훅을 두는 것 | 표 3 |
| **조건부** | `files` 다중 파일(18건, 바이너리 포함)은 훅 시점에 원본 경로를 읽어야 함 | 경로 일부는 임시 폴더 |
| | `capabilities: comments`(40건)와 질문 블록은 복사본에서 동작하지 않음 → 보기 전용 | Lens `cp-questions.html`이 `window.claude.use('comments')`에 의존 |
| | 타입 생성 아티팩트(Slides 등, 2건)는 HTML이 아니라 데이터 파일이라 복사본이 렌더되지 않음 | 호출 모양 |
| **안 되는 범위** | claude.ai 웹·데스크톱 채팅에서 만든 아티팩트 | 훅 구조상 |
| | 훅을 설치하지 않았거나 로그인이 없는 머신(mac-001, window-001)과 닿지 않는 머신(sj-x1, namane-mkt, sj-macbookair) | 표 3 |
| | 이미 발행된 과거 아티팩트의 소급 수집 (원본 절반 소실, 소유 계정 불명) | 2번 통계 |
| | 페이지 안에서 스스로 저장한 새 판 (Claude Code 호출이 아니므로 훅 없음) | 도구 설명과 구조상 |

기술적으로 되는 것은 "앞으로 Claude Code에서 발행하는 것을 훅이 복사한다"까지입니다. 훅 설치 대상 머신은 sj-omen, sj-rog, win002, macmini 4대입니다. 여러 계정을 모아 본다는 목표 중 웹·데스크톱 채팅분과 과거분은 이 방식으로 채울 수 없습니다.

**실제로 읽거나 실행한 곳**
- `C:/Users/ADMIN/Documents/GIT/creeta-lens/hooks/hooks.json`
- 같은 레포의 `hooks/post-tool-plan-doc.js`, `post-tool-progress.js`, `post-tool-task.js`
- 같은 레포의 `lib/spawn-envelope.js`, `lib/report-viewer.js`
- `~/.claude/projects/**/*.jsonl`
- 원격 머신은 `~/.claude.json`의 필드만 읽었습니다.

## Scout 2 — 아티팩트 목록
**조사 결과 요약.** 이 세션 계정이 소유한 아티팩트는 37건이고, 공유받은 것은 2건입니다. 원본 HTML은 소유분만 가져올 수 있고, 다른 두 계정분은 이 세션에서 볼 수 없습니다. 표기는 [실측]과 [추정]으로 나눴습니다.

## 1. 목록 실측

- **mine (limit 50)**: 37건 [실측]. 50 미만이라 잘림은 없습니다.
- **all (limit 50)**: 39건 [실측]. 소유 37건에 공유받은 2건이 더해진 숫자입니다.
- **갱신 시각**: 목록은 날짜(YYYY-MM-DD)만 주고 시각과 시간대는 주지 않습니다. 그래서 KST 시각으로는 변환할 수 없습니다. 아래 날짜는 도구가 준 값 그대로입니다.
- **종류**: 제목 기준 [추정]입니다. 본문까지 확인한 것은 문서함 개편 계획 1건뿐입니다.

| 종류 | 건수 | 제목 (갱신일) |
|---|---|---|
| Lens 계획서로 보임 | 16 | 브랜드 화면 2단계 정리(10-03), 공용 계획 채널(10-03), 문서함 개편 계획(10-02), 디자인 시스템 1단계(10-02), 홈 무대 다듬기(10-02), 손님 화면 업데이트 경로(10-02), 손님 화면 분리 계획·snapholo 손님 로그인 계획·즉시구매 예약 주문 개편·만만 관리자 메뉴 정리(이상 10-01), 바이럴 계정 준비 순서·2026-09-22-lens-runtime-fixes.md(09-22), 전 소스 CID 채움 계획(09-21), 수집 엔진 재설계·리서치 엔진 재출발·세 계정 목표 재설정(09-04) |
| 조사·점검·결과 보고서 | 16 | 브랜치 정리 결과(10-03), 한국 시세 소스 가동 결과·한국어 시세 소스 조사·한국판 세트 이미지 빈칸·한글판 CID·PID 현황(10-02), 세트 이미지 상자 검수·손님 화면 속도 진단·snapholo 로그인 준비값·SnapHolo 프런트 UX 점검(10-01), 표기 차이 전수 점검·카드·세트 화면 속도(09-22), 헬로마켓 TLS 1.2 전환 판정(09-21), 4회차 계정별 발화 기록·모바일 잘림 감사·R1 전환 비교 5건(09-04), CORTIS 투입 검증 로그(09-03) |
| 브랜드·참조 문서 | 2 | 디자인 시스템 레퍼런스(10-02), 리턴즈 상표출원 지시서(08-19) |
| 기타(시안·프런트) | 3 | V1 뒷모습·V2 일러스트(09-04), 실루엣 변형 3안(09-04), SnapHolo User Frontend(08-20) |
| 공유받음(shared) | 2 | AI 업무진단 특강, 영상 받아쓰기 계획 (갱신일 미표시) |

날짜별로는 10-03이 3건, 10-02가 9건, 10-01이 8건, 09-21~22가 6건, 09-03~04가 9건, 08-19~20이 2건입니다. 합계는 37건입니다.

## 2. read 실측 (문서함 개편 계획)

- **Lens 계획서 여부**: 맞습니다. 본문에 `lens-cp-questions` 블록과 plan_id가 있고, 마지막 줄에 `docs/tasks/2026-10-02-docs-groups-lecture-guides.md (livevil-data)`가 원본이라고 적혀 있습니다.
- **원본 온전성**: 온전합니다. 저장된 파일은 80,155바이트이고 `wc -l`로 1619줄입니다. `</main>`과 `</html>`이 각각 1개씩 있어 끝까지 왔습니다.
- **헤더 정보**: 소유자는 본인이고 비공개입니다. 이 세션이 발행한 것이 아니라서 다른 세션이나 다른 머신에서 발행된 것으로 보입니다. 서버에 저장된 선언은 `contract 0.2.66`, `capabilities {"comments":{}}`입니다.
- **래퍼**: 서비스가 `<!doctype>`, viewport, 기본 style로 이루어진 래퍼를 씌워 저장합니다. 그래서 읽어 온 HTML은 작성자의 원본 파일과 바이트가 같지 않습니다.
- **외부 자원**:
  - Google Fonts `<link>`가 3행에 1개 있습니다(Noto Sans KR).
  - 그 외 http(s) URL은 0개입니다.
  - `<script src>`와 cdnjs는 0개입니다.
  - 인라인 script는 2개입니다. 하나는 질문 JSON이고, 다른 하나는 172행부터의 질문 JS입니다.
- **`window.claude` 사용**: 1곳(`window.claude.use('comments')`)이고 `sendToClaude`는 2건입니다. 이 답변 전송은 claude.ai 안에서만 동작합니다.
- **docs.blex.co에 복사했을 때** [추정, 조사 원문 B절의 CSP·no-external 규칙 기준]: 질문 블록은 죽고, Google Fonts 링크는 막힙니다.
- **저장 경로**: `C:\Users\ADMIN\.claude\projects\c--Users-ADMIN-Documents-GIT\28f406bb-4b76-49c9-a2fb-10efd537052c\tool-results\artifact-0abbf2b7-1790925499-d571.html`
- **변경 감지**: read 헤더에 `version 1790925499-d571` 같은 버전 id가 나옵니다. 목록은 날짜만 주므로 이 값이 변경 감지에 쓸 만합니다.

## 3. 다른 계정과 shared

- **다른 두 계정분은 못 봅니다.** `scope all`에 타 계정 소유분은 없고, 공유받은 2건만 보입니다.
- **shared 2건 읽기는 거부됐습니다.** `AI 업무진단 특강`을 read하려 하자 "남이 만든 것이라 승인이 필요하다"며 막혔습니다. 비대화형 세션이라 승인할 사람이 없었습니다. 그래서 공유분 내용과 크기는 확인하지 못했습니다.
- **공유분의 한계** [추정, 도구 설명 기준]: 타인 소유분은 요약본만 오고 갱신할 수 없습니다.
- **로컬 로그 대조**: `~/.claude/projects/*/*.jsonl`의 발행 결과 줄은 122줄입니다.
  - 고유 URL은 46개입니다. 하위 폴더까지 포함해도 같습니다.
  - 이 중 이 계정 목록(37+2)과 겹치는 것은 5개 이내입니다. 제가 ID를 옮겨 적어 대조한 값이라 오차가 있을 수 있습니다.
  - 따라서 이 PC에서 발행됐는데 이 계정 목록에 없는 URL이 41개 이상입니다.
  - 이 41개 이상은 다른 계정 소유이거나 삭제된 것으로 [추정]됩니다.
  - 반대로 이 계정 목록 37건 중 약 32건은 이 PC 로그에 흔적이 없습니다. 다른 PC에서 발행된 것으로 [추정]됩니다.
  - 그래서 로그만 세어서는 어느 계정의 전체 수도 알 수 없습니다.
- **최근 30일**: 46개 전부 30일 안입니다. 가장 오래된 로그가 2026-08-17(UTC)이라 로그 보존 문제는 아닙니다.

## 결론: 안 B 첫 가져오기(백카탈로그) 규모와 방법

**규모**
- 이 계정 소유 37건은 원본을 모두 읽을 수 있습니다. 1건이 약 80KB였으므로 전체는 3MB 안팎으로 [추정]됩니다.
- 공유받은 2건은 원본 확보가 불확실합니다.
- 나머지 두 계정분은 이 세션에서 셀 수 없습니다. 이 PC 로그에서 본 타 계정 발행분이 41개 이상이라, 3계정을 합치면 80건 안팎 이상으로 [추정]됩니다.

**방법**
1. 계정마다 그 계정으로 로그인된 Claude 세션에서 list를 부른 뒤 URL마다 read합니다. read가 완전한 HTML 파일을 저장하고 경로를 알려 주므로, 그 폴더를 스크립트로 docs.blex.co에 올리면 됩니다.
2. 올릴 때 복사본마다 세 가지를 처리해야 합니다.
   - Claude 래퍼를 벗길지 정합니다.
   - Google Fonts 링크를 지웁니다.
   - `window.claude` 질문 블록을 제거하고 읽기 전용으로 만듭니다.
3. 발행 결과 줄에는 원본 파일 경로가 남습니다. 예: `...\.lens\drafts\2026-10-03-brand-page-two-depth.html`. 앞으로 만드는 아티팩트는 발행 시점에 로컬 원본을 같이 올리는 편이 read보다 단순합니다.
4. 지속 동기화는 이 도구가 에이전트 세션 안에서만 호출됩니다. 파이썬 단독 수집이 가능한지는 확인하지 못했습니다(미확인). 이 점은 "자동 실행은 파이썬만" 규칙과 부딪힐 수 있습니다.

## Scout 3 — docs.blex.co 복사본

# 아티팩트 사본을 docs.blex.co에 올리는 일 조사 (안 B 기준, 안 A 대조 포함)

**결론:** 아티팩트 사본을 지금 그대로 올리면 대부분 올라가지 않습니다. 직접 읽어 본 최근 아티팩트 5개 중 4개가 Google Fonts를 불러오는데, 올리기 명령이 바깥 주소가 하나라도 있으면 거부합니다. 글꼴 줄만 빼고 대체 글꼴을 받아들이면 화면 규칙을 하나도 바꾸지 않고 올릴 수 있습니다. 머신마다 설치할 것과 비밀값이 가장 적은 올리기 경로는 워커에 기계용 업로드 API를 하나 다는 (b)입니다. 다만 Cloudflare 설정 변경이 필요해 그 지점에서 멈춰야 합니다.

근거 표기: 레포 코드는 `git show origin/main` 기준(f1dd2b5)입니다. 문장 끝 [실측]은 코드나 명령으로 직접 확인한 것, [추정]은 확인하지 못한 판단입니다. 조사 중 파일은 만들거나 고치지 않았습니다. 임시 파일은 세션 임시 폴더에만 두었습니다.

## 1. 열람·미리보기 화면에서 그대로 보이나

**보안 정책 값** (`site/src/worker.mjs:17-24`) [실측]
- 공통 부분: `default-src 'none'; script-src 'unsafe-inline'; style-src 'unsafe-inline'; img-src data: blob:; font-src data:; connect-src 'none'`
- `/d/<링크>` 열람: 공통 부분 + `base-uri 'none'; form-action 'none'; frame-ancestors 'none'; sandbox allow-scripts allow-downloads` (:19, :171)
- `/d/<링크>/f/<파일>`: `default-src 'none'; frame-ancestors 'none'; sandbox` + 첨부 다운로드 (:22, :168). 내려받기 전용이라 화면에 그리지 않습니다.
- `/api/docs/:id/v/:n/:file` 미리보기(HTML일 때): 공통 부분 + `frame-ancestors 'self'; sandbox allow-scripts` (:20, :319). 관리 화면의 미리보기 틀에도 `sandbox="allow-scripts"`가 걸려 있습니다 (`admin.html:385`).
- 시험이 이 값들을 문자 그대로 고정해 둡니다: `tests/site.test.mjs:225`, `:348`, `tests/admin-ui.test.mjs:206`, `:325`.

**아티팩트 표본 5개를 읽어 본 결과** (Artifact read로 원문 확인) [실측]
- Google Fonts `<link>`: 4개 (공용 계획 채널, 문서함 개편 계획, 디자인 시스템 레퍼런스, 손님 화면 속도 진단)
- cdnjs·jsdelivr 스크립트: 0개
- 인라인 스크립트와 `window.claude`: 1개 (문서함 개편 계획의 Lens 질문 블록)
- 플랫폼이 감싸 준 원문에는 `<meta charset>`가 있습니다. 반면 세션이 쓴 원본 파일은 `<title>`부터 시작하는 조각입니다. [실측·추정]

**요소별 동작**

| 요소 | 결과 | 근거 |
|---|---|---|
| Google Fonts `<link>` | 막힙니다. style-src와 font-src에 그 주소가 없습니다. 페이지 CSS에 적힌 대체 글꼴(Malgun Gothic 등)로 나오고 배치는 유지됩니다 | CSP [실측], 화면 결과 [추정] |
| cdnjs `<script>`(Chart.js·mermaid) | 막힙니다. 이어지는 초기화 코드가 오류를 내 차트가 빈칸으로 남습니다. cdn.tailwindcss.com을 쓰는 페이지라면 스타일 전체가 사라집니다 | [추정] |
| 인라인 스크립트 | 실행됩니다. 단 출처가 격리돼 localStorage·쿠키 접근은 예외가 나고, alert·print·새 창 열기·폼 제출·fetch는 막힙니다 | sandbox·connect-src [실측] |
| `window.claude` | 없습니다. Lens 질문 블록은 "복사해 채팅창에 붙여 주세요" 칸으로 내려앉습니다 (`creeta-lens/templates/cp-questions.html:152-168`). 그 밖의 런타임 기능은 동작하지 않습니다 | [실측 코드·추정 동작] |
| 바깥 이미지 | 막힙니다 (img-src는 data:·blob:만) | [실측] |

- **업로드 단계에서 먼저 막힙니다.** `bin/import-html.mjs:33-34`가 `src`나 `href`에 `https://`가 들어 있으면 거부합니다. preconnect 줄이나 일반 링크도 걸립니다. 그래서 표본 4/5는 지금 올리기가 실패합니다. [실측]
- **문자 깨짐 가능성:** import-html은 파일 형식을 문자셋 없이 `text/html`로만 적습니다(:57). 미리보기는 그 값을 그대로 보내므로(worker:125, 320), charset이 없는 조각 원본을 올리면 미리보기에서 한글이 깨질 수 있습니다. 열람 경로는 utf-8을 강제합니다(:171). [추정]

**깨질 때의 최소 대응 세 가지**

| 대응 | 비용 | 레포 규칙과 충돌 |
|---|---|---|
| CSP에 해당 주소만 허용 | 코드 1줄 + 고정 시험 2곳 수정. 정책이 전역이라 모든 문서에 적용됩니다. 묶음별로 정책을 나누면 미리보기 경로에 조회가 하나 더 필요합니다 | **큽니다.** 계획서가 "외부 요청 0"을 Codex 검토로 정한 통제로 적어 두었습니다 (`2026-09-29-brand-doc-system.md:256, :407`). import-html 거부 규칙도 풀어야 합니다. 바깥 열람자의 브라우저가 Google·cdnjs에 접속하게 됩니다 |
| 업로드 때 인라인 | 글꼴은 레포에 있는 `fontFaceCss()`(`lib/brand.mjs:96`, Pretendard 부분 글꼴 + JetBrains Mono)로 바꿔 넣을 수 있습니다. 실제 크기 예: 강의 덱은 Pretendard Variable 2,009KB가 들어가 파일 2,821KB가 됐습니다 [실측]. 스크립트는 올릴 때 받아서 넣어야 합니다 (mermaid는 수 MB [추정]) | 없음 |
| 대체 글꼴 수용 | 글꼴 `<link>` 줄을 지우는 정규식 1개 | 없음. 선례도 있습니다: 문서함 개편 계획의 docs 사본이 글꼴 줄과 질문 블록을 빼고, `@font-face` 없이 "Pretendard"라는 이름만 남긴 채 올라가 있습니다 (사본 69KB, 원본 80KB 비교) [실측] |

## 2. 쓰기 경로

**import-html 하는 일** [실측]
- 인자: `<완성.html> <회사> <YYYY-MM-DD> <slug> [제목] [--format report|lecture] [--collection doc|lecture|sample]`
- 회사·slug는 영문 소문자·숫자·`-`만 받습니다 (:27).
- 원본을 레포 `docs-src/<회사>/`에 씁니다 (:41). 머신마다 커밋 안 된 파일이 남는 원인이 됩니다.
- Playwright chromium으로 A4 PDF를 **항상** 만듭니다. 끄는 옵션이 없습니다 (:46-54).
- 문서 ID가 `회사-날짜-slug`입니다 (:61).

**publish 하는 일** [실측]
- wrangler로 D1을 직접 조회해 판 번호를 MAX+1로 정합니다 (:35).
- R2 put을 파일 수만큼, 그다음 D1 insert를 합니다.
- 두 머신이 동시에 올리면 같은 R2 키를 덮어쓰고, 판 행은 한쪽만 들어가 파일과 기록이 어긋납니다. [추정]

**인증값** [실측]
- 환경변수가 없으면 `livevil-setting/env/livevil-data.env`에서 읽습니다 (`bin/cf.mjs:16-29`).
- 이 파일은 gitignore 대상(`.gitignore:129 env/*.env`)입니다. 비밀값 원본인 services/ 폴더에도 없고, 이 PC(sj-omen)에는 아예 없습니다. 이 PC에는 livevil-data의 node_modules도 없습니다.

**올리기 경로 3안 비교**

| | (a) 머신마다 직접 | (b) 워커 기계용 API | (c) 중계 1대 |
|---|---|---|---|
| 머신당 설치 | 레포 클론 + `npm install`(의존성 10개, wrangler·playwright 포함) + chromium | 없음 (Lens 안 스크립트, Node 내장 fetch) | 없음 (전달 수단만: git push 또는 scp) |
| 머신당 비밀값 | 계정 전체 권한 토큰 파일, 손으로 복사 | 서비스 토큰 2값, livevil-setting env/solutions로 배포 | 없음 |
| 중앙에 늘어나는 것 | 없음 (단 아티팩트 탭은 워커 배포 필요) | Access 서비스 토큰 + 정책 (Cloudflare 설정 변경이라 멈출 지점) · D1 표 1 · 라우트 1 | 중계 머신에 레포·npm·chromium·토큰 1벌 + 파이썬 예약작업 1 (멈출 조건 포함) |
| 코드 변경 파일 | livevil-data 2~3 (ID·PDF 끄기·collection) + Lens 1~2 | worker·auth·schema·admin·site 시험 5 + Lens 스크립트·훅(또는 스킬)·시험 3 | (a)의 것 + 중계 스크립트 1 + Lens가 보낼 파일을 쌓는 것 1 |
| PDF·Playwright | 필수 | 불필요 (파일 목록에 view.html만 있으면 됨, publish.mjs:28) | 중계에만 |
| 판 번호 경쟁 | 남음 | 서버가 정하므로 사라짐 | 한 곳이 차례로 처리하므로 사라짐 |
| 반영 지연 | 수십 초 (wrangler 3회 이상 기동) [추정] | POST 1번 | macmini git pull 주기 30분 |
| 위험 | 계정 전체 토큰이 7대에 퍼짐 | 기계 신원으로 링크 발급·삭제를 못 하게 막는 권한 분리가 필수. 지금 isAdmin은 JWT 서명만 보고 이메일을 검사하지 않음 (worker:205-209, auth.mjs:82-100) [실측] | macmini 단일 장애점. git push가 막히는 일 실재 (어제 fleet 상태 보고가 이것 때문에 틀림) |

참고:
- 관리 화면은 워커 번들 안에 들어 있습니다 (worker:2 [실측]). 그래서 어느 경로든 「아티팩트」 탭을 만들려면 배포가 필요합니다.
- (b)에서 서비스 토큰 JWT에 이메일 대신 common_name이 실리는지는 확인하지 못했습니다 [추정].
- 안 B는 Claude 아티팩트만 대상이라, Codex의 네트워크 차단은 이 비교와 상관없습니다.

## 3. 문서 모델에 아티팩트 사본을 담을 자리

- **묶음 값 추가:** `artifact`를 넣을 곳은 `COLLECTIONS`(worker:26), publish:24, import-html:26 세 곳입니다. 관리 화면 탭(`admin.html:291-294`, `TAB_HASH` :401)도 함께 고칩니다. 열에 CHECK 제약이 없어 스키마 변경은 필요 없습니다 (`schema.sql:1`). [실측]
- **회사 칸 필수 문제:** company는 NOT NULL이고 publish도 요구합니다 (:27). 관리 화면은 브랜드 목록에 없는 값을 글자 그대로 보여 줍니다 (`admin.html:472`). 회사 칩은 브랜드 5곳만 만듭니다 (:447). 그래서 `artifact`를 자리값으로 넣거나 `blex`를 고정하면 스키마 변경 없이 됩니다. [실측]
- **재발행 = 같은 문서의 새 판:**
  - 지금 ID에 날짜가 들어가서, 다음 날 다시 올리면 새 문서가 생깁니다.
  - 아티팩트 짧은 ID(예: `MfXxjqZsJSScPdMCEcfXf5`)는 대소문자가 섞여 import-html slug 규칙에 걸립니다.
  - publish의 이름 검사(`safeName`, :26)는 대소문자를 허용합니다. 그래서 문서 ID를 `art-<아티팩트 ID>`로 고정하면, 기존 ON CONFLICT(:45-47)와 MAX+1 로직만으로 새 판이 쌓입니다.
  - 원본 URL·계정·머신·레포는 새 표 `artifact_src(doc_id PK, url UNIQUE, account, machine, repo, updated_at)`에 둡니다. "새 기능은 새 표" 규칙에 맞습니다. [설계 추정]
- **목록 거르기:** `/api/docs`는 지금 회사·형태·묶음·검색어만 받습니다 (worker:227-240). 다음을 더해야 합니다.
  - `DOC_SELECT`에 LEFT JOIN과 `account`·`machine`·`repo` 조건
  - 관리 화면에 그 칩들. 불러온 행으로 화면에서 만들면 새 API는 필요 없습니다.
  - 계정은 `~/.claude.json`의 oauthAccount, 머신은 machine-identity 규칙으로 정합니다 (조사 C).

## 4. 안 A 변경 목록 대비 안 B

| 안 A 변경 (조사 A·B절) | 안 B |
|---|---|
| schema 새 표 | 공유 (artifact_src 1개로 작음) |
| auth 사람/기계 구분 | (b) 경로일 때만 공유 |
| worker 계획 묶음·기계용 API | 일부 공유: 올리기 API 1개만. 답 내려받기는 불필요 |
| admin 답변 패널·「현황」 탭 | 답변 패널 불필요. 아티팩트 탭과 칩만. 현황 탭은 선택 |
| lib/source.mjs plan 형식 · templates/plan | 불필요 (완성 HTML을 그대로 올림) |
| bin/push.mjs (서비스 토큰 헤더) | (b)일 때 같은 것 |
| publish/import-html 묶음 허용 | 공유 (`artifact`) |
| Cloudflare 서비스 토큰 (멈출 지점) | (b)만 해당. (a)(c)는 불필요 |
| 승인 본인 증명 (Access 이메일 검사) | 불필요. 승인은 claude.ai 댓글 머리표 그대로 |
| 판 번호 서버 할당 | (b)·(c)는 저절로 해결, (a)는 경쟁이 남음 |
| Lens report-viewer site 방식 · show-report · 질문 블록 교체 | 불필요 |
| Lens skills cp/cc/cd · 상태 어휘 통일 | cp 스킬에 한 줄, 또는 Artifact 도구 뒤에 도는 훅 1개. 지금 Lens 훅 중 Artifact를 가로채는 것은 없음 (`hooks.json` [실측]). 훅이 받는 내용은 [추정] |
| 현황판 수집기 (조사 C) | 선택 (별도 묶음) |
| 문서함 비목표 "승인 흐름 제외" 번복 | 번복 안 함 |
| 업로드 전 비밀값 패턴 검사 · Lens 릴리즈 | 공유 |

**안 B의 한계** [추정]
- claude.ai 웹이나 데스크톱에서 만든 아티팩트는 Claude Code 훅을 거치지 않아 자동으로 모이지 않습니다. 이미 있는 것은 계정마다 Artifact list·read로 한 번씩 가져와야 합니다.
- 제목만 봐도 민감해 보이는 아티팩트가 있습니다 (예: 「snapholo 로그인 준비값」). 업로드 전 비밀값 검사가 필수입니다.

**참고한 파일**
- `C:/Users/ADMIN/Documents/GIT/livevil-data/` 의 origin/main: `site/src/worker.mjs`, `site/src/auth.mjs`, `site/src/admin.html`, `site/schema.sql`, `bin/import-html.mjs`, `bin/publish.mjs`, `bin/cf.mjs`, `tests/site.test.mjs`, `tests/no-external.mjs`
- `C:/Users/ADMIN/Documents/GIT/creeta-lens/templates/cp-questions.html`
- `C:/Users/ADMIN/Documents/GIT/livevil-setting/.gitignore`

## 안 A 설계
# 안 A 설계: 통합 관제 (공용 계획 채널 + 전 컴퓨터 현황판)

이번 조사에서는 파일을 만들거나 고치지 않았습니다. 근거는 [실측](파일:줄 또는 직접 돌린 명령)과 [추정]으로 나눴습니다.

## ① 요약

컴퓨터마다 작은 파이썬 수집기 하나가 10분마다 돕니다. 수집기는 그 컴퓨터의 레포 상태와 세션 상황, 바뀐 계획서를 docs.blex.co에 요청 1번으로 보냅니다. 레포 상태는 브랜치, 아직 커밋하지 않은 변경, 워크트리, stash입니다. 같은 요청의 응답으로 대표가 사이트에서 고른 답을 받아 그 레포 폴더에 파일로 내려놓습니다.

어느 LLM이든 "계획서 파일을 쓰고 답 파일을 읽는" 일만 하면 됩니다. 그래서 네트워크가 막힌 Codex도 참여할 수 있습니다. Claude는 기다리지 않도록 같은 수집기를 "지금 보내고, 답이 올 때까지 대기"로 직접 부릅니다.

대표 승인은 Cloudflare Access 로그인 이메일로 본인임을 확인합니다. 서버가 서명하고 승인한 판에 묶은 답만 유효하게 해서, LLM이 승인을 지어내거나 바뀐 계획서에 옛 승인을 쓰지 못하게 합니다. git으로 상태를 나르던 기존 fleet-status는 이것으로 대체합니다. 오늘 있었던 "sj-omen 2일째 보고 없음" 오보는 상태 커밋을 push하지 못해 생긴 것인데, 그런 일이 없어집니다. AgentMemory는 채널로 쓰지 않습니다.

**조사 E의 "수집기 한 줄기"에서 단순하게 바꾼 점**

1. 올리기와 답 받기를 요청 1번(`POST /api/m/sync`)으로 합쳤습니다. 기계용 API가 3개에서 1개로 줍니다.
2. 계획서 md를 서버가 아니라 관리 화면 브라우저에서 그립니다. 그래서 무료 요금제 CPU 10ms 위험이 없고, 조사 B가 제안한 `templates/plan`과 `lib/source.mjs`의 plan 형식이 필요 없습니다. 기존 `lib/html.mjs`는 `node:fs`와 playwright를 불러와 워커에 넣을 수 없습니다(lib/html.mjs:2-6 [실측]). markdown-it은 이미 의존성에 있습니다(package.json [실측]).
3. Access 앱을 새로 만들지 않습니다. 기존 앱에 Service Auth 정책 1개만 더하고, 사람과 기계는 워커가 이메일과 common_name으로 가립니다. 기존 앱은 `/admin`과 `/api`를 덮고 있습니다(site/README.md:16,39 [실측]).
4. 수집기 스케줄은 이미 하루 1번 도는 fleet-sync.sh가 등록합니다. 그래서 머신별로 손으로 설치할 것이 없습니다. fleet-sync는 "선언 상태를 각 머신이 당겨 적용"하는 구조입니다(fleet-sync.sh:3-17 [실측]).
5. 답에 Ed25519 서명과 승인한 판의 sha를 묶습니다(조사 E에 없던 것). 파일 채널은 그 머신의 LLM이 답 파일을 직접 써서 위조할 수 있기 때문입니다. 코드는 약 30줄입니다.

## ② 구성요소

| # | 구성요소 | 위치 | 내용 |
|---|---|---|---|
| 1 | 수집기 `git-fleet-report.py` | livevil-setting/scripts | 파이썬 표준 라이브러리만 씀. 10분 주기, `--now`·`--wait <id>`·`--print` |
| 2 | 스케줄 | 각 머신 | Windows 작업 스케줄러, macOS launchd. fleet-sync가 멱등 등록하고 선언에서 빠지면 해제 |
| 3 | 기계 출입증 | Access 서비스 토큰 | 값은 livevil-setting의 git 추적 비밀 저장소 env/solutions에 둠(.gitignore:51-52 [실측]) |
| 4 | 워커 API 4개와 정적 파일 1개 | 기존 brand-docs 워커 | sync(기계) · board · plans/:id · plans/:id/answers(사람) · /admin/md.js |
| 5 | D1 표 4개 | 기존 DB | machines · plans · plan_versions · plan_answers. 기존 4개 표는 바꾸지 않음 |
| 6 | 관리 화면 「현황」·「계획」 탭 | admin.html | 아래 화면 명세 |
| 7 | Lens 변경 | /cp, /cc, lens-cli, report-viewer, session-start | 아래 T8 |
| 8 | 모든 LLM 공통 계약 5줄 | shared-agent-context.md | 모든 도구가 시작할 때 자동으로 읽는 문서 |

**대표 본인 증명**
- 지금 `verifyAccessJwt`는 참/거짓만 돌려주고 이메일을 보지 않습니다(auth.mjs:82-101, worker.mjs:205-209 [실측]).
- 바꾼 뒤에는 payload를 돌려받아 다음처럼 가립니다.
  - 사람용 경로: `email ∈ ADMIN_EMAILS`(sj@blex.co, livevil7@gmail.com)일 때만 허용
  - 기계용 경로: `common_name === MACHINE_CLIENT_ID`일 때만 허용
- 서비스 토큰 JWT에 이메일 대신 common_name이 실린다는 점은 [추정]입니다. 운영 반영 단계에서 curl로 확인합니다.

**판 번호는 서버가 정함**
- `INSERT … SELECT COALESCE(MAX(ver),0)+1 … WHERE NOT EXISTS(같은 sha)` 한 문장으로 처리하고, `UNIQUE(plan_id, sha)`를 둡니다.
- 예전 판과 같은 sha가 다시 오면(오래된 사본) 무시합니다.
- 담당 머신은 마지막으로 새 판을 올린 머신입니다. 답은 담당 머신에만 내려가므로 두 머신이 같은 승인으로 동시에 실행하지 않습니다.

**승인 바인딩**
- 사람이 답을 보내면 서버가 `plan_id·판·sha·seq·답` 원문에 서명합니다.
- /cc는 서명과 "지금 md의 sha = 승인한 sha"를 둘 다 확인한 뒤에만 시작합니다. 둘 중 하나라도 다르면 다시 묻습니다.
- 답 원문 형식은 지금 쓰는 `[Lens /cp 답변] <plan_id>` + `[id] 질문 → 답`을 그대로 씁니다(templates/cp-questions.html:66-75 [실측]).

**상태 어휘 통일**
- 정본은 `planned → approved → executing → blocked → done`(+cancelled)입니다(skills/cp/SKILL.md:201 [실측]).
- 옛 값은 수집기가 바꿔 읽습니다: draft→planned, in-progress/in_progress→executing, completed→done, failed→blocked.
- 옛 문서는 고치지 않습니다. "상태는 planned인데 체크박스가 전부 [x]"면 「불일치」 배지를 붙입니다. 조사 A가 든 cs-mirror-invariant 사례가 이 경우입니다.
- `plan-manager.js:561`의 어휘도 맞춥니다. 이 함수는 호출하는 곳이 없습니다(grep 결과 export뿐 [실측]).

**Codex·기타 LLM 경로**
- Codex는 md를 쓰고, 다음 수집 때 올라가고, 대표가 답하면, 그다음 수집 때 `.lens/answers/<id>.json`으로 내려옵니다. Codex는 `node lens-cli.js answer <id> --wait`로 로컬 파일만 확인합니다. 왕복은 최대 약 20분입니다.
- Grok은 구독을 해지해서 해당이 없습니다.
- 그 밖의 CLI LLM은 공통 계약 5줄을 따르면 됩니다.
- claude.ai 웹 채팅은 레포가 없어 참여하지 못합니다.

**AgentMemory**
- 채널로도, 현황판으로도 쓰지 않습니다. 결정·인계 기록은 지금처럼 둡니다.
- 근거(조사 E):
  - 비밀키 1개를 모든 LLM이 같이 써서 승인을 위조할 수 있음
  - Cloudflare에서 사설망에 닿지 않아 다리 프로세스가 하나 더 필요함
  - 상태 칸이 꺼져 있음("Memory slots not enabled" [실측])
  - 요약 실패 10,893건 대 성공 4,777건
  - Mac Mini 한 대에 걸린 단일 장애점
- 잠금(lease) 대신 현황판이 「겹침」을 찾아 보여 줍니다.

**fleet-status 교체**
- fleet-sync 8절의 git 전송(fleet-sync.sh:314-341 [실측])은 로컬 `~/.claude/lens/fleet-sync.last.json`에 쓰는 것으로 바꿉니다. 수집기가 그 파일을 읽어 보냅니다.
- `fleet-status.sh`, `fleet/status/*.json` 5개, macmini fleet-status launchd는 지웁니다.

**현황판 화면** (설명 문장 없이 표·배지·한 단어로, 시각은 전부 KST)
- 맨 위 숫자 칩 5개: 승인대기 · 진행 · 멈춤 · 끊김 · 겹침
- 「계획」 표: 상태 · 제목 · 레포 · 머신 · 계정 · 진행 N/M · 갱신 · 판
  - 정렬은 승인대기 → 멈춤 → 진행 → 계획 → 완료 순입니다. 완료는 7일이 지나면 접습니다.
- 계획 화면: 본문(md 렌더), 답변 칸(md 안 `lens-questions` 블록으로 만든 폼), 판 칩, 승인 기록(이메일·시각)
- 「머신」 표: 머신 · 수신 · 배지(정상 20분 미만 / 늦음 2시간 미만 / 끊김 / 없음) · 레포 · 변경 · 미병합 · 워크트리 · stash · 세션 · 설정
  - 20분은 10분 주기 2회를 놓친 것입니다. 「없음」은 fleet.machines 기대 목록에 있는데 한 번도 보고하지 않은 머신입니다.
- 「레포」 표: 행은 레포, 열은 머신입니다. 칸에는 브랜치, ↑↓, 변경 배지를 넣습니다. 같은 브랜치를 두 머신이 동시에 고치고 있으면 「겹침」입니다.
- 「세션」 표: 머신 · 레포 · 브랜치 · 도구 · 계정 · 작업/대기 · 마지막
- 「원격기준」 열: FETCH_HEAD 시각. 수집기는 fetch하지 않으므로 앞섬/뒤처짐 숫자가 언제 기준인지 보여 줍니다.

## ③ 관리 포인트 계수표

| 항목 | 수 | 내용·근거 |
|---|---|---|
| 머신마다 새로 설치할 패키지 | **0** | 파이썬 3.13~3.14와 git은 이미 있음(조사 C). 스크립트는 livevil-setting을 당길 때 같이 옴 |
| 머신마다 추가되는 스케줄 | **+1** (10분) | 기대 목록 6대(skills.json fleet.machines [실측])면 +6. macmini fleet-status 해제 −1이라 순증 **5**. 하루 1번 도는 fleet-sync는 그대로 |
| 머신별 1회 손작업 | **0** / win002만 **1** | win002는 fleet-sync가 미등록(조사 C). SSH로 등록할 수 있다고 봄 [추정] |
| 새 비밀값 종류 | **2** | ① 서비스 토큰(ID+비밀): env/solutions/docs-blex.env ② 답 서명 개인키: 워커 secret에만 두고 머신에는 없음. 공개키는 Lens 코드 상수 |
| 새 중앙 서비스 | **0** | 기존 워커 1개 재사용 |
| Cloudflare 설정 | **2** | 정책 1개, 서비스 토큰 1개(새 앱 없음) |
| D1 표 | **+4** | 기존 표 변경 0 |
| API | **+4** (+정적 1) | |
| 워커 설정 | vars +2, secret +1 | |
| 코드 파일 | 신규 **4**, 수정 **18**, 삭제 **1** (+상태 파일 5) | livevil-data: 신규 1(plans.mjs), 수정 8(auth·worker·schema·admin.html·wrangler.toml·site.test·admin-ui.test·README) / livevil-setting: 신규 2(수집기와 그 시험), 수정 3(fleet-sync.sh·skills.json·shared-agent-context.md), 삭제 1 / creeta-lens: 신규 1(lens-cli.test.js), 수정 7. 그 밖에 릴리즈 스크립트가 기계적으로 고치는 파일 12개 |
| 대표가 계획마다 하는 단계 | **3** | 열기 → 고르기 → 보내기. Access 세션이 만료됐을 때만 로그인 +1. 지금 아티팩트와 같음 |
| LLM이 계획마다 하는 일 | Claude 2 명령, Codex 1 명령 | Claude는 `--now --wait`(백그라운드)와 `answer`, Codex는 `answer --wait` |
| 요청량 | 하루 약 864건 | 6대 × 144회. 무료 한도(하루 10만 요청) 안 [한도 수치는 추정] |

## ④ 단계 (빌드레디)

먼저 livevil-data 로컬 main을 ff합니다. origin보다 6커밋 뒤처져 있습니다(`git rev-list --count main..origin/main` → 6 [실측]).

- [ ] **T1 사람/기계 권한 분리**
  - 파일: site/src/auth.mjs, site/src/worker.mjs, wrangler.toml
  - 변경: 검증 함수가 payload를 돌려주게 하고, `isAdmin`은 이메일 허용 목록으로, `isMachine`은 common_name으로 가림
  - 검증: `node --test tests/site.test.mjs`에 4가지 경우를 넣어 모두 거부되는지 봄. 이메일 없는 JWT로 /api/docs, 허용 밖 이메일, 기계 JWT로 /api/docs, 사람 JWT로 /api/m/sync. 기존 경우는 전부 통과해야 함
  - 의존: 없음

- [ ] **T2 [P] 표 4개**
  - 파일: site/schema.sql
  - 변경: 줄 추가만
  - 검증: `git diff`에서 기존 4개 DDL이 그대로인지 보고, site.test에 schema를 적용해 통과하는지 봄

- [ ] **T3 API**
  - 파일: 신규 site/src/plans.mjs, worker 라우트
  - 변경:
    - sync: 상태 upsert(sha가 같으면 시각만), 판 할당, 담당 머신의 답 반환(같은 요청을 다시 보내도 결과가 같음)
    - answers: 최신 판의 sha가 아니면 409, Ed25519 서명
    - 상한: md 512KB, 요청 2MB 넘으면 413
  - 검증(site.test):
    - 같은 계획에 다른 sha 두 건 → 판 1·2
    - 같은 sha 재전송 → 판 그대로
    - 옛 판 sha → 무시
    - 서명이 `node:crypto`로 검증됨
    - 판이 바뀐 뒤 보낸 옛 sha 답 → 409
  - 의존: T1, T2

- [ ] **T4 화면**
  - 파일: admin.html, /admin/md.js(markdown-it 배포본을 텍스트 모듈로), wrangler.toml 규칙
  - 변경: ui-ux-pro-max 스킬을 먼저 씀
  - 검증: `tests/admin-ui.test.mjs`(탭, 폼 생성, KST 표시), no-external 시험, responsive 시험, Miniflare에서 320~1440 폭으로 버튼을 전부 눌러 봄
  - 의존: T3

- [ ] **T5 [P] 수집기**
  - 파일: livevil-setting `scripts/git-fleet-report.py`, `.test.py`
  - 변경:
    - machine_id: settings.json의 `AGENTMEMORY_PROJECT_NAME`에서 읽고, 없으면 호스트명 규칙(machine-identity.md §2 [실측])
    - 레포 탐색: fleet.gitRoots를 훑되 점 폴더도 포함(/cs 사각지대 해소), realpath로 중복 제거
    - 레포당 git 읽기 명령 5개: 각 10초 제한, `GIT_OPTIONAL_LOCKS=0`, `GIT_TERMINAL_PROMPT=0`, fetch 금지
    - 세션 정보는 허용 필드만 읽음. 세션 폴더의 `.key` 파일은 열지 않음(sessions 폴더 안 json 옆에 `.key` 파일이 있음 [실측])
    - 대화 기록 jsonl은 끝 4KB에서 cwd·gitBranch·timestamp만 읽음
    - 계정은 `oauthAccount.emailAddress`
    - 계획서에 비밀값 패턴이 걸리면 본문은 보내지 않고 배지만 보냄
    - 답 파일과 함께 `.lens/answers/.gitignore`(`*`)를 씀. 이 PC 레포 21개 중 10개가 `.lens/answers`를 무시하지 않기 때문(`git check-ignore` [실측])
    - 멈출 조건: STOP 파일, 한 번에 하나만 실행하는 잠금, 회당 60초, 연속 실패 시 간격 2배(최대 1시간), `--wait`는 30초 간격에 최대 2시간
  - 검증: `python scripts/git-fleet-report.test.py`. 출력 JSON에 절대경로·소켓경로·키 내용이 0건, 상태 정규화 표, 가짜 키가 든 계획서는 본문 미포함. `--print`로 sj-omen 21개 레포가 60초 안에 끝나는지 봄
  - 의존: 없음

- [ ] **T6 스케줄과 fleet-status 교체**
  - 파일: fleet-sync.sh, skills.json, fleet-status.sh(삭제)
  - 변경:
    - Windows: schtasks 10분 주기, python 절대경로는 `py -3`로 찾음
    - macOS: launchd StartInterval 600, Aqua 전용으로 묶지 않음
    - 8절은 로컬 파일 쓰기로 바꿈
  - 검증: `bash -n`, bash 3.2 규칙. 두 번 실행해도 중복 등록이 없고 `schtasks /Query`·`launchctl print`로 확인됨
  - 의존: **T9 운영 반영 뒤에 병합**

- [ ] **T7 비밀값 파일과 공통 계약 5줄**
  - 의존: T9-b

- [ ] **T8 [P] Lens 변경**
  - cp SKILL: 띄우기 1순위 레인을 `site`로(수집기와 토큰이 있을 때만), 아티팩트 레인은 2순위로 유지. 질문 JSON을 md 안 블록으로 옮김. 승인은 `lens-cli answer`가 OK일 때만
  - cc SKILL: 시작할 때 executing, 정지 지점에서 blocked와 `--now`, 끝날 때 done과 `--now`. sha가 다르면 시작을 거부
  - /cd: **변경 없음**. history로 옮긴 것을 다음 수집 때 완료로 봄
  - lens-cli.js: `answer` 하위 명령 추가
  - report-viewer.js:49,51: `site` 레인 추가
  - session-start.js: 답이 도착한 계획을 한 줄로 알림
  - plan-manager.js: 상태 어휘
  - 검증: `node lib/report-viewer.test.js`, `node scripts/lens-cli.test.js`(정상 서명은 통과, 답 한 글자를 바꾸면 거부, sha가 다르면 거부), `node lib/plan-coverage.test.js`, `node templates/cp-questions.test.js`, `node hooks/pre-tool-ask.test.js`

- [ ] **T9 정지 지점: 운영 반영 1회 묶음**
  - a. 서명 키 secret put → D1에 새 표 적용 → `npx wrangler deploy`
  - b. **a가 끝난 뒤에** Service Auth 정책과 토큰을 만듦. Cloudflare API 토큰은 `env/solutions/cloudflare.env`에 있음 [실측]
  - c. 라이브 확인(curl): 토큰 없음 → 401, 기계 토큰으로 /api/docs → 403, 기계 토큰으로 sync → 200. 이어서 `node tests/live-smoke.mjs`, `node tests/live-script-clean.mjs`
  - d. Lens bump → 태그 push → 릴리즈

- [ ] **T10 가동** (되돌릴 수 있어 정지 지점 아님)
  - T6·T7을 병합하고, 닿는 5대에서 /cs를 돌려 등록
  - 완료 판정: 현황판에 5대 「정상」, sj-x1 「끊김」. Claude 왕복 1건, Codex 왕복 1건 성공

## ⑤ 되는 것 / 안 되는 것

**되는 것**
- 어느 머신, 어느 Claude 계정, Codex에서 만든 계획이든 한 화면에서 보고 승인할 수 있습니다. 휴대폰에서도 Access 로그인으로 됩니다.
- 전 머신의 브랜치, 워크트리, 변경, stash, 미병합, 세션을 볼 수 있습니다.
- 꺼진 머신과 "한 번도 보고 안 함"을 따로 구분합니다.
- 같은 브랜치를 두 곳에서 고치면 「겹침」으로 경고합니다.
- 옛 판 승인과 LLM이 지어낸 승인을 막습니다.
- fleet-status 오보가 없어집니다.

**안 되는 것**
- Codex 답은 즉시 오지 않습니다(최대 약 20분).
- 원격 최신 상태는 보이지 않습니다. 수집기가 fetch하지 않아 "원격기준" 시각까지만 맞습니다.
- 다음 머신은 볼 수 없습니다.
  - 기대 목록 밖: window-001, sj-macbookair(대표 결정 ③)
  - 오프라인: sj-x1, namane-mkt
- claude.ai 웹 아티팩트는 모으지 못합니다(안 B 영역).
- 세션과 레포의 연결은 추정입니다. 이 PC 세션 8개의 cwd가 전부 워크스페이스 루트입니다(조사 C).
- Codex 계정 칸은 비어 있습니다. Codex 계정 파일은 조사하지 않았습니다.
- 문서함 개편 계획서의 비목표 "승인 흐름 제외"를 **번복**합니다(2026-10-02-docs-groups-lecture-guides.md:110,355, 조사 B).

## ⑥ 리스크 상위 10

| # | 심각도 | 무엇이 잘못되나 | 트리거 | 대응 |
|---|---|---|---|---|
| 1 | 높음 (Blocker 후보) | 기계 토큰으로 링크 발급·삭제까지 할 수 있게 됨 | 이메일 검사를 배포하기 전에 Service Auth 정책을 추가 | T9 순서를 a 다음 b로 고정. 기계 토큰으로 /api/docs가 403인지 curl로 확인한 뒤 가동 |
| 2 | 높음 | 계획서에 든 비밀값이 사이트에 올라감 | 계획서에 토큰을 붙여 넣음(예: 「snapholo 로그인 준비값」) | 업로드 전 패턴 검사. 걸리면 본문을 보내지 않음. 계획에는 /d 공유 링크를 만들지 않음 |
| 3 | 높음 | 수집기가 민감한 로컬 파일을 보냄 | `.key` 파일이나 대화 원문을 읽음 | 허용 필드 목록만 씀. 시험이 출력에서 금지 필드 0건인지 확인 |
| 4 | 높음 | 승인 위조, 또는 옛 판 승인으로 실행 | LLM이 답 파일을 직접 씀 | Ed25519 서명과 sha 바인딩. 검증에 실패하면 /cc가 시작하지 않음 |
| 5 | 중간 | 스케줄이 조용히 죽음 | python3 shim, launchd PATH, Aqua 세션 종료, win002 미등록 | 절대경로 python, Aqua 미사용. 현황판의 「늦음·끊김·없음」으로 드러남 |
| 6 | 중간 | 같은 계획을 두 머신이 실행 | 레포 동기화로 같은 계획서가 두 곳에 생김 | 답은 담당 머신에만 감. 「겹침」 배지 |
| 7 | 중간 | 사용자 작업과 git 잠금이 부딪힘 | 수집 중 index.lock | 읽기 명령만, `GIT_OPTIONAL_LOCKS=0`, fetch 금지, 명령별 10초 제한 |
| 8 | 중간 | common_name이 실리지 않음 [추정] | Access 서비스 토큰 JWT 형식이 예상과 다름 | T9-c에서 확인. 다르면 우회로: `/api` 밖 경로에 워커 secret bearer를 두고 상수 시간 비교 |
| 9 | 낮음 | 무료 요금제 한도 초과 | 수집기 버그로 반복 요청 | 한 번에 하나만 실행하는 잠금, 실패 시 간격 2배. 평소 하루 약 864건 |
| 10 | 낮음 | 상태 어휘 전환으로 기존 검사가 깨짐 | 옛 문서의 status 값 | 정규화는 수집기에서만 하고 옛 문서는 고치지 않음. coverage 시험 통과 확인 |

## ⑦ 작업량 (세션 수)

| 범위 | 세션 수 | 비고 |
|---|---|---|
| livevil-data (T1~T4) | 약 2 | 화면 클릭 검수가 큼 |
| 수집기와 fleet-sync (T5·T6) | 약 1 | |
| Lens (T8) | 약 1 | |
| 운영 반영과 가동 (T9·T10) | 약 1 | |
| **합계** | **4~5** | 근거는 위 신규·수정 파일 수와 시험 수입니다. 날짜는 정하지 않았습니다 |

## ⑧ 되돌리기

- **즉시 멈춤**
  - 머신 하나: STOP 파일
  - 전 머신 동시: Access 서비스 토큰 폐기
  - Lens는 site 레인이 실패하면 아티팩트 레인으로 넘어갑니다(T8 설계 조건).
- **워커**
  - `wrangler rollback`으로 이전 판으로 돌립니다.
  - 새 표 4개는 기존 표와 연결이 없어 남겨도 해가 없습니다. 지워야 하면 DROP 4개입니다. 새 표를 쓰는 곳은 plans.mjs뿐입니다.
- **livevil-setting**
  - git revert하면 fleet-status.sh와 8절이 돌아옵니다.
  - 선언에서 빠진 스케줄은 fleet-sync가 다음 회차에 해제합니다.
  - macmini fleet-status launchd는 다시 등록해야 합니다(1단계).
- **Lens**: 이전 태그로 /lens-upgrade하면 됩니다. 캐시가 버전 단위로 나뉘어 있습니다.
- **남는 것**: 레포의 `.lens/answers/`뿐입니다. 이 폴더는 자기 안에 gitignore를 두므로 지워도 됩니다.

**확인하지 못한 것 [추정]**
- 서비스 토큰 JWT의 common_name
- 워커 WebCrypto의 Ed25519 지원
- D1·Workers 무료 한도 수치
- Access 세션 유지 시간
- win002에 SSH로 스케줄을 등록할 수 있는지

**인증 필요**: 이 세션에서 MCP 서버 `higgs`와 `plugin:context7:context7`가 인증을 요구했습니다. 이번 조사에는 쓰지 않았지만, 필요하면 대화형 세션에서 `/mcp`로 인증해야 합니다.

**주요 근거 파일**
- `C:/Users/ADMIN/Documents/GIT/livevil-data/site/src/auth.mjs` · `worker.mjs` · `schema.sql` · `site/README.md` · `site/wrangler.toml` (origin/main f1dd2b5)
- `C:/Users/ADMIN/Documents/GIT/livevil-setting/scripts/fleet-sync.sh` · `fleet-status.sh` · `claude-code/skills.json` · `docs/rules/machine-identity.md`
- `C:/Users/ADMIN/Documents/GIT/creeta-lens/skills/cp/SKILL.md` · `skills/cc/SKILL.md` · `lib/report-viewer.js` · `lib/plan-manager.js` · `scripts/lens-cli.js` · `templates/cp-questions.html` · `hooks/hooks.json`

## 안 B 설계

**안 B — 아티팩트 모아보기: 설계 보고**

## ① 요약

안 B의 구조는 이렇습니다. Claude Code에서 아티팩트를 발행하는 순간 Lens 훅이 원본 HTML을 그 머신에 복사해 두고, 곧바로 docs.blex.co에 올립니다. 같은 아티팩트를 다시 발행하면 같은 문서에 새 판으로 쌓입니다.
- 머신마다 새로 설치할 프로그램과 예약 작업은 0개입니다.
- 늘어나는 것은 비밀값 1종(Access 서비스 토큰), D1 표 1개, 올리기 API 1개, 관리 화면 탭 1개입니다.
- 모이는 것은 보기뿐입니다. 승인은 지금처럼 각 계정의 claude.ai에서 합니다.
- 자동으로 모이지 않는 것이 있습니다.
  - Codex 계획서
  - claude.ai 채팅 안에서 만든 아티팩트: livevil7 계정 133건 중 39건 (실측)
  - Claude Design 4건
- 과거분은 대표님이 계정마다 한 번 부르는 가져오기 명령으로 채웁니다. 다만 도구 목록은 최신 50건까지만 줍니다. 그래서 livevil7 계정은 브라우저 목록에서 주소를 보충해야 합니다.
- 브랜치·워크트리 현황판은 안 B에 넣지 않고 별도 단계로 두기를 권합니다. 이때 안 B에서 만든 출입증을 그대로 씁니다.

## ② 구성요소

**복사 방아쇠 비교 → 훅 채택**

| 방아쇠 | 잡는 범위 | 원본 생존 | 주소·판·계정 | 판정 |
|---|---|---|---|---|
| Claude Code 훅 | 모든 발행, 서브에이전트 포함. 147건 중 147건 발동 (Scout 1) | 발행 순간에 복사 | 결과에서 바로 얻음 | 채택 |
| Lens 스크립트 (`show-report --shown`) | 계획서만 잡고, LLM이 명령을 불렀을 때만 동작 | 같음 | 주소는 LLM이 넘겨야 함 | 기각. 아티팩트 37건 중 계획서는 16건뿐 (Scout 2) |
| 수집기가 로컬 HTML을 나중에 수거 | 남아 있는 파일만 | scratchpad 원본 51%가 이미 삭제됨 (Scout 1) | 알 수 없음 | 기각. 스케줄도 필요함 |

**구성요소 목록**

1. **복사 훅** — 새 파일 `creeta-lens/hooks/post-tool-artifact.js`
   - `hooks.json`에 matcher `"Artifact"` 항목을 추가합니다. 기존 matcher가 도구 이름 정규식이라는 근거는 `hooks/hooks.json:39,71,81`입니다.
   - publish 결과에서 URL, `seq`, version id, 제목을 읽습니다.
   - `tool_input.file_path` 원본을 `~/.claude/lens/artifact-outbox/`(이하 "보낼 칸")에 복사합니다.
   - read, list, open, asset 업로드, `type_url` 생성은 무시합니다.
   - 항상 exit 0으로 끝나서 발행을 막지 않습니다. 마지막에 올리기 스크립트를 분리 실행합니다.
2. **올리기 스크립트** — 새 파일 `scripts/artifact-push.js` (Node 내장 fetch 사용)
   - 보낼 칸을 비웁니다. 순서는 변환 → 비밀값 검사 → POST입니다.
   - 실패한 항목은 보낼 칸에 남았다가 다음 발행이나 다음 세션 시작 때 다시 시도합니다. 그래서 스케줄이 필요 없습니다.
   - 멈출 조건은 네 가지입니다.
     - STOP 파일이 있으면 멈춤
     - 1회 실행은 20초까지
     - 같은 항목이 10번 실패하면 `failed/`로 옮겨 격리
     - 보낼 칸은 200건이 상한
3. **세션 시작 때 비우기** — 기존 `hooks/session-start.js`에 한 줄을 추가합니다. 보낼 칸이 비어 있지 않으면 2번을 분리 실행합니다.
4. **식별**
   - 계정: `~/.claude.json`의 `oauthAccount.emailAddress`를 먼저 봅니다. 없으면 `claude auth status`의 `email`을 씁니다(실측: JSON에 `"email":"sj@blex.co"`가 나옴). 그것도 없으면 '미상'으로 둡니다.
   - 머신: `AGENTMEMORY_PROJECT_NAME`의 `@` 뒤 값을 씁니다. machine-identity.md §2가 정한 설정 자리입니다. 없으면 호스트명 규칙으로 정합니다.
   - 레포: `resolveProjectRoot`(`lib/hook-utils.js:221`)가 돌려준 폴더의 이름만 씁니다.
   - plan_id: 원본이 `.lens/drafts` 또는 `docs/tasks`에 있고 같은 이름의 `.md`가 있을 때만 파일명으로 정합니다.
   - 절대경로는 보내지 않습니다.
5. **변환** (올리기 직전, 머신 쪽에서)
   - 원본에 doctype·charset·viewport가 없으면 앞에 붙입니다. 세션이 쓴 원본은 `<title>`부터 시작하는 조각이고(Scout 3), 문자셋이 없으면 미리보기에서 한글이 깨질 수 있습니다.
   - Google Fonts link와 preconnect를 지우고 대체 글꼴로 보이게 합니다. 선례로 문서함 개편 계획 사본이 이 방식으로 올라가 있습니다.
   - 그 밖의 바깥 script/link도 지우고, 지운 개수를 `ext:N` 표시로 남깁니다.
   - Lens 질문 블록은 `#lens-cp-ask{display:none}` 한 줄로 숨깁니다(`templates/cp-questions.html:16`).
   - 여러 파일로 된 아티팩트는 본 HTML만 올리고 '파일 빠짐'으로 표시합니다.
6. **비밀값 검사**
   - 검사 패턴은 `sk-ant-`, `ghp_`, `github_pat_`, `AKIA`, `xox[bp]-`, `-----BEGIN … PRIVATE KEY` 등입니다.
   - 걸리면 올리지 않고 `blocked/`로 옮깁니다.
   - 기존 스캐너는 없습니다. Lens, livevil-data bin·lib, livevil-setting scripts에서 패턴을 grep했고 0건이었습니다(실측).
7. **docs.blex.co 올리기 경로** — `POST /api/ingest/artifact`
   - Access 앱이 `/admin`과 `/api`를 덮고 있으므로(origin/main `site/README.md:39`) 이 경로는 서비스 토큰으로만 닿습니다.
   - 본문은 HTML 원문 그대로 받고, 메타데이터는 헤더 1개에 담습니다. 무료 요금제는 요청당 CPU 10ms라서 큰 JSON 파싱을 피하기 위해서입니다.
   - 판 번호는 서버가 정합니다. 지금 `publish.mjs:35`는 클라이언트가 MAX+1로 정해서 동시에 올리면 판 번호가 겹칩니다. 서버가 정하면 이 문제가 사라집니다.
   - sha가 직전 판과 같으면 '변화 없음'으로 끝냅니다.
   - 들어온 `seq`나 version epoch가 저장된 값 이하이면 늦게 도착한 옛 판으로 보고 무시합니다.
   - 저장 위치
     - R2: `docs/art-<URL끝조각>/v<n>/view.html`, 형식 `text/html; charset=utf-8`
     - documents 표: company `artifact`, collection `artifact`. company는 NOT NULL이라 자리값을 넣습니다(`schema.sql:1`).
     - 새 표 `artifact_src(doc_id PK, url UNIQUE, account, machine, repo, plan_id, seq, sha, flags, updated_at)`
   - 기존 links, versions, access_log 표는 바꾸지 않습니다.
8. **권한 분리**
   - `verifyAccessJwt`가 지금은 참/거짓만 돌려줍니다. 이것을 payload를 돌려주게 바꿉니다.
   - email이 있으면 사람으로 보고 지금 권한을 그대로 줍니다.
   - email이 없고 `common_name`이 `INGEST_CLIENT_ID`와 같으면 기계로 보고, 올리기 경로만 허용합니다.
   - 지금 isAdmin은 서명만 확인합니다(`worker.mjs:205-209`). 분리하지 않으면 서비스 토큰으로 링크 발급과 삭제까지 할 수 있게 됩니다.
9. **관리 화면 「아티팩트」 탭**
   - 표: `제목 | 계정 | 머신 | 레포 | 판 | 갱신(KST) | 표시`
   - 칩: 계정, 머신
   - 배지: 계획서 · 글꼴 · 외부 N · 파일 빠짐
   - 원본 열기는 아이콘 버튼으로 둡니다. 미리보기는 기존 서랍을 그대로 씁니다.
10. **가져오기 명령** — 새 Lens 스킬, 대표님이 부를 때만 실행합니다(타이머 아님)
    - 그 계정으로 로그인된 세션에서 Artifact list(mine)를 부릅니다.
    - 독립 아티팩트마다 read를 부르고, 저장된 파일을 `artifact-push.js --enqueue`로 보낼 칸에 넣습니다.
    - 서버가 sha로 중복을 거르므로 다시 돌려도 안전합니다.
    - 공유받은 것은 건너뜁니다. 주인 계정에서 가져오면 됩니다.
11. **출입증 배포**
    - 비밀값은 livevil-setting `env/solutions/docs-ingest.env`에 둡니다. git에 추적되는 비공개 자리이고, 기존 `agentmemory.env`와 같은 곳입니다(`git ls-files`, `.gitignore:51,129`).
    - `setup-shared-agent-context.py`가 각 머신의 settings.json env에 `LENS_ARTIFACT_MIRROR_ENV`를 넣습니다.
    - 이 변수가 없는 머신에서는 훅이 아무것도 하지 않습니다.

## ③ 관리 포인트 계수표

| 칸 | B 핵심 — b1 서비스 토큰 (권장) | B 핵심 — b2 우회: Access 밖 경로 + 워커 비밀 | 현황판을 붙일 때 추가분 (선택) | Codex 계획서 옵션 추가분 |
|---|---|---|---|---|
| 머신마다 설치할 것 | 프로그램 0개. 설정 1줄 × 4대(sj-omen, sj-rog, win002, macmini) | 같음 | 0 (python 있음. sj-x1은 미확인) | 0 |
| 스케줄 수 | 0 | 0 | 신규 0 (기존 fleet-sync 끝에 한 줄) + win002 등록 1건 | 0 |
| 비밀값 종류·배포 위치 | 1종 2값(토큰 ID·비밀) · env/solutions 1곳 | 1종 1값 · env/solutions와 wrangler secret 2곳 | 0 (같은 토큰 재사용) | 0 |
| 중앙 서비스·표·API | 새 서비스 0 · Access 토큰 1 + 정책 1 · 표 1 · API 1 · 탭 1 | Access 변경 0 · 표 1 · API 1 · 탭 1 | 표 +1 · API +1 · 탭 +1 | 0 |
| 코드 파일 신규/수정 | 신규 6 / 수정 11, 버전 올림 12파일 별도 | 신규 6 / 수정 10 | 신규 2 / 수정 5 | 수정 2 |
| 사람이 매번 하는 단계 | 0. 1회만: 정지 지점 승인 1번, 계정별 가져오기 1번씩(2~3번) | 같음 | 0 | 0. 단 다음 Claude 세션까지 늦어짐 |
| AgentMemory | 0 | 0 | 0 | 0 |

- 신규 6개: 훅·시험, 올리기·시험, 스킬, env 파일
- 수정 11개
  - livevil-data 7개: worker, auth, schema, admin, wrangler.toml, 시험 2개
  - Lens 3개: hooks.json, session-start, CHANGELOG
  - livevil-setting 1개: setup 스크립트
- b2의 단점: Access 밖에 쓰기 경로가 생깁니다. 문서함 계획 위험 3-2와 충돌합니다(`2026-10-02-docs-groups-lecture-guides.md:348` "새 최상위 경로를 adminRoute 밖에 두면 Access·JWT 검사가 없다").

## ④ 단계 (빌드레디)

**준비**
- [ ] T0 livevil-data 워크트리 `feat/artifact-mirror`를 origin/main(f1dd2b5)에서 만듭니다. 로컬 main은 6커밋 뒤처져 있습니다.

**서버 (livevil-data)** — Lens 작업과 병렬로 진행합니다.
- [ ] T1 `site/schema.sql`에 artifact_src 표를 추가합니다.
  - 검증: `node --test tests/site.test.mjs` 통과. Miniflare가 schema를 적용합니다.
- [ ] T2 `site/src/auth.mjs`와 `worker.mjs`의 사람/기계 신원을 분리합니다. 의존: T1
  - 검증: 기계 JWT로 다음 세 요청이 모두 403
    - `GET /api/docs`
    - `POST /api/docs/:id/links`
    - `DELETE /api/docs/:id`
  - 검증: 기계 JWT로 ingest는 200
  - 검증: 사람 JWT 기존 시험 전부 통과
- [ ] T3 ingest 경로를 만들고, `COLLECTIONS`(:26)에 `artifact`를 추가하고, `DOC_SELECT`에 LEFT JOIN을 넣습니다.
  - 검증 시험 8건
    - 새 아티팩트 → v1
    - 같은 sha → 판 안 늘어남
    - 내용 바뀜 → v2
    - 옛 seq → 무시
    - 바깥 주소 포함 → 422
    - 5MB 초과 → 413
    - id 형식 틀림 → 400
    - 동시 2건 → v2, v3 (판이 겹치지 않음)
- [ ] T4 `site/src/admin.html`에 탭을 만듭니다. ui-ux-pro-max 스킬을 먼저 씁니다.
  - 검증: `tests/admin-ui.test.mjs`, no-external, responsive 통과
- [ ] T5 `wrangler.toml`의 `[vars]`에 `INGEST_CLIENT_ID`를 넣습니다(비밀값 아님). README 배포 절에 표 생성 명령 1줄을 추가합니다.

**Lens (creeta-lens)**
- [ ] T6 `hooks/post-tool-artifact.js`와 시험을 만듭니다.
  - 먼저 실제 훅 stdin 1건을 OS 임시 폴더에 떠서 fixture로 씁니다. 응답이 문자열인지 구조체인지 아직 모르기 때문입니다(Scout 1 추정).
  - fixture 8종: 새 발행, 갱신, read/list, asset, type_url, files 맵, 원본 없음, 텍스트 응답
  - 검증: `node hooks/post-tool-artifact.test.js` 전부 통과, 실행 200ms 미만
- [ ] T7 `scripts/artifact-push.js`와 시험을 만듭니다. 가짜 서버는 `node:http`로 띄웁니다.
  - 검증 항목
    - 변환 5종
    - 비밀값 걸리면 전송 0건
    - 10번 실패하면 `failed/`로 이동
    - STOP 파일 있으면 전송 0건
    - 보낼 칸 상한
- [ ] T8 `hooks/hooks.json`에 항목을 추가하고 `hooks/session-start.js`에 한 줄을 넣습니다.
  - 검증: `node hooks/session-start.test.js` 통과, hooks.json JSON 파싱 정상
- [ ] T9 새 스킬 SKILL.md에 가져오기 절차를 씁니다.
  - 검증: 이 PC에서 sj@blex.co 계정으로 3건 시험 가져오기
- [ ] T10 CHANGELOG를 쓰고 `bash scripts/bump-version.sh 3.52.0`을 실행합니다.

**livevil-setting**
- [ ] T11 `scripts/setup-shared-agent-context.py`를 고칩니다.
  - `LENS_ARTIFACT_MIRROR_ENV`를 추가합니다.
  - 54행의 기본값 `'livevil@sj-omen'`을 호스트명 규칙으로 바꿉니다.
  - 검증: 두 번 실행해서 두 번째 출력의 `changed`가 빈 배열이고, `project`가 그 머신 이름이어야 합니다.

**정지 지점 — 한 번에 묶어 승인받습니다**
- [ ] T12 운영 반영
  - Access 서비스 토큰 `docs-ingest`를 발급하고, docs.blex.co 앱에 Service Auth 정책을 추가합니다.
  - `env/solutions/docs-ingest.env`를 커밋합니다.
  - D1에 `CREATE TABLE IF NOT EXISTS artifact_src …`를 `--remote`로 실행합니다. 표를 먼저 만들고 워커를 나중에 올립니다(README 순서).
  - `npx wrangler deploy`
  - Lens 태그를 push합니다.
- [ ] T13 라이브 확인
  - `node tests/live-smoke.mjs`가 LIVE SMOKE OK
  - `live-script-clean` 통과
  - 서비스 토큰으로 `GET /api/docs`를 curl하면 403
  - 시험 아티팩트를 발행하면 30초 안에 v1, 다시 발행하면 v2, 같은 내용으로 발행하면 판이 늘지 않음

**머신·과거분**
- [ ] T14 sj-rog, win002, macmini에서 pull → setup 실행 → Lens 갱신 → 시험 발행 1건 → 머신·계정 라벨이 맞는지 확인합니다. win002는 fleet-sync가 등록되어 있지 않아 수동으로 갱신합니다.
- [ ] T15 과거분 가져오기
  - sj@blex.co: 37건, 이 PC에서
  - livevil7: 독립 아티팩트 약 90건. list로 50건, 나머지 주소는 claude.ai/artifacts 목록에서 보충합니다. win002나 macmini 세션에서 실행합니다.
  - support@blex.co: 대표님 로그인 확인 후
  - 검증: 탭 건수 = 독립 아티팩트 수 − 비밀값에 걸린 수
- [ ] T16 화면 버튼을 320, 768, 1440 폭에서 전부 눌러 봅니다.

**우회로**
- 서비스 토큰 JWT에 `common_name`이 없거나 정책 추가가 막히면 b2로 갑니다. 단 위험 3-2 충돌은 대표님이 결정하셔야 합니다.
- '외부 N' 배지가 붙은 아티팩트가 10%를 넘으면, 올릴 때 cdnjs·jsdelivr 스크립트를 받아 파일 안에 넣습니다(1.5MB 상한).

## ⑤ 되는 것 / 안 되는 것 (대표님 원래 목표 대비)

| 대표님 목표 | 안 B에서 되는 것 | 안 B에서 빠지는 것 |
|---|---|---|
| 여러 계정 아티팩트를 한 곳에서 | Claude Code에서 새로 발행하는 것은 자동, 과거 독립 아티팩트는 가져오기로 | 채팅 안 아티팩트 39건과 Claude Design 4건(실측, 결정적 경로 없음). support@blex.co는 미확인 |
| 갱신 따라가기 | 재발행할 때마다 새 판 | 페이지가 스스로 저장한 판. /cc가 md만 고치고 재발행하지 않으면 진행 상황이 안 보임 |
| 공통으로 승인 | — | 안 됨. 승인은 각 계정의 claude.ai 댓글로 하고, 사본의 질문 칸은 숨김 |
| 어느 LLM이든 보고 | Claude만 | Codex는 아티팩트를 못 만듭니다. 계획서는 git md와 Codex 화면에만 남습니다. 옵션을 쓰면 다음 Claude 세션 때 원문 그대로 올라갑니다 |
| 어디까지 했나·반영됐나 / 브랜치·워크트리 | — | 안 B에는 없음. 현황판은 **별도 단계 권장**(③표 열 3) |
| 메모리 응용 | 쓸 자리가 없습니다 | 아래 참고 |
| 대상 머신 | sj-omen, sj-rog, win002, macmini 4대 | mac-001(로그인 없음), window-001(Claude 없음), sj-x1·namane-mkt(닿지 않음), sj-macbookair(기록 없음) |

- **현황판 쪽**: 별도 단계를 하기 전이라도, 기존 fleet-status의 오보 원인 세 가지만 고치면 "누가 뒤처졌나"는 보입니다. 세 원인은 `ts[:19]`로 시간대를 버리는 것, 원래 호스트명으로 느슨하게 맞추는 것, push가 막히는 것입니다.
- **메모리 쪽**: AgentMemory 훅은 이미 Artifact를 포함한 모든 도구 호출을 중앙 서버로 보냅니다(`post-tool-use.mjs`, matcher 없음). 그런데 `memory_recall "Artifact"` 결과 10건 중 Artifact 도구 기록은 0건이었습니다(실측). 그래서 색인으로 믿을 수 없습니다. 결정·인계 기록은 지금처럼 씁니다.

## ⑥ 리스크 상위 10

| 심각도 | 무엇이 잘못되나 | 트리거 | 대응 | 중단 조건 |
|---|---|---|---|---|
| 높음 | 민감 문서나 비밀값이 사본으로 퍼짐 | 제목에 'Relist AI 연결 키'(livevil7, 09-18), 'snapholo 로그인 준비값'(sj)이 있음. 채팅분에는 계약서·소송 이메일 | 비밀값 검사, 채팅분 제외, 링크 자동 발급 없음, 가져오기 전에 제목 목록 확인 | 통과한 판에서 비밀값 1건이라도 나오면 STOP, 해당 판 R2에서 삭제 |
| 높음 (Blocker 후보) | 서비스 토큰이 관리 권한 전부를 가짐 | 권한 분리 없이 정책만 추가 | T2의 403 시험 3건을 통과하기 전에는 정책 추가 금지 | 라이브 curl이 403이 아니면 토큰 즉시 폐기 |
| 중 | 계정 라벨이 틀림 | macmini 프로필 캐시가 06-29로 오래됨, 환경변수 토큰 세션 | auth status로 대조, 모르면 '미상' | — |
| 중 | 머신 라벨이 틀림 | setup 54행 기본값 sj-omen | T11에서 고치고 T14에서 확인 | — |
| 중 | 발행이 느려짐 | 큰 파일 | 훅은 복사만, 업로드는 분리, 항상 exit 0 | 시험에서 200ms를 넘으면 복사도 분리 |
| 중 | 사본이 조용히 쌓이지 않음 | 토큰 없는 머신, Lens 미갱신(win002) | 탭에 머신별 마지막 수신 시각 표시 | — |
| 중 | 화면이 깨짐 | 외부 스크립트, 여러 파일, 타입 아티팩트 | 배지 + 원본 열기 | — |
| 중 | 옛 판이 새 판을 덮음 | 재시도 순서가 뒤바뀜 | seq·epoch 비교 | — |
| 낮음 | 같은 아티팩트가 문서 두 개로 | 구형 URL(7건)과 신형이 섞임 | URL 끝 조각을 키로 씀 | — |
| 낮음 (Pre-mortem) | "다 모았다"고 믿고 claude.ai를 안 보게 됨 | 채팅분·미설치 머신이 빠져 있음 | 탭 첫 줄에 계정별 '가져오기 때 목록 수 / 사본 수' | — |

## ⑦ 작업량

| 항목 | 세션 |
|---|---|
| 서버 | 1 |
| Lens | 1 |
| 정지 지점 승인 + 배포 + 라이브 확인 + 4대 설정 | 0.5 |
| 과거분 가져오기 | 0.5 |
| **합계** | **약 3** |

- 현황판을 붙이면 1~1.5세션이 더 듭니다.
- Codex 옵션은 0.3세션이 더 듭니다.

## ⑧ 되돌리기

- **머신 한 대만 즉시**: STOP 파일을 두거나 환경변수를 지우면 훅이 아무것도 하지 않습니다.
- **전 머신**: Access 콘솔에서 서비스 토큰을 폐기하면 올리기가 401로 막힙니다. 이미 올라간 데이터는 그대로입니다.
- **코드**
  - Lens는 다음 릴리즈에서 matcher 항목을 지웁니다.
  - 워커는 `wrangler rollback`으로 되돌립니다(워커만 해당).
  - artifact_src 표와 R2 `docs/art-*`는 남겨도 해가 없습니다. 지우고 싶으면 collection이 `artifact`인 문서를 소프트 삭제합니다.
- 기존 문서·링크·열람 기록은 건드리지 않습니다. D1 Time Travel은 쓰지 않습니다(README).

## ⑨ 안 B로 시작해서 안 A로 넘어갈 때

**그대로 다시 쓰는 것**
- 서비스 토큰, Access 정책, 사람/기계 권한 분리 — 안 A에서도 반드시 해야 하는 변경과 같습니다.
- 서버의 판 번호 할당
- 머신·계정 식별 코드, 비밀값 검사, env 배포 자리
- 관리 화면의 탭 틀과 칩
- 아티팩트 사본 탭 자체 — 안 A에서도 보관함으로 계속 쓸 수 있습니다.

**버려지는 것**
- 많아야 훅과 변환 2파일입니다. 안 A는 md를 서버에서 렌더하기 때문입니다. 안 A와 함께 운영하면 이것도 버리지 않습니다.
- 가져오기 스킬은 1회성이라 그때쯤이면 이미 쓰임을 다한 상태입니다.

**안 A가 새로 해야 하는 것**
- plan 형식 렌더러
- 답변 패널과 승인 본인 증명
- 답 내려받기
- 현황판 수집기
- 문서함 계획 비목표 "승인 흐름 제외"의 번복

즉 안 B를 먼저 하면 안 A의 공통 기반 세 가지(출입증, 권한 분리, 서버 판 번호)를 미리 끝내게 됩니다.

---

**이번에 새로 확인한 것 (근거)**
- **Aside로 claude.ai/artifacts 확인** (2026-10-03 11:54 KST)
  - 브라우저 로그인 계정은 livevil7@gmail.com입니다.
  - 탭은 전체 / 내 항목 / 공유받음입니다.
  - 내 항목은 133건, 전체는 135건입니다.
  - 2025년~2026년 3월 항목 39건은 채팅 주소로 연결되고, 4건은 Claude Design 주소로 연결됩니다.
  - 목록에 어디서 만들었는지(채팅/Claude Code) 표시는 없습니다.
- **`claude auth status`** — JSON에 `email`이 나옵니다(sj@blex.co).
- **Artifact 도구 스키마** — list의 `limit` 최댓값이 50이고, `after`는 assets 목록에만 있습니다. 실제로 50건 넘게 조회해 본 것은 아니고 스키마로 판단했습니다(추정).
- **AgentMemory** — recall "Artifact" 결과 10건 중 Artifact 도구 기록은 0건이었습니다.
- **비밀값 스캐너** — 세 레포에서 0건입니다.
- **알려 드릴 발견**
  - livevil7 계정에 제목 'Relist AI 연결 키' 아티팩트가 있습니다. 내용은 열어 보지 않았습니다.
  - `setup-shared-agent-context.py:54`에 머신 이름 sj-omen이 기본값으로 박혀 있습니다.

**미확인 (추정)**
- 훅 stdin의 `tool_response` 형태
- 서비스 토큰 JWT에 `common_name`이 실리는지
- 셋째 계정(support@blex.co로 추정)에 아티팩트가 있는지
- 환경변수 토큰으로 돌리는 세션에서도 Artifact를 발행할 수 있는지

파일은 만들거나 고치지 않았습니다. Aside 세션은 읽기만 했습니다.

## 심사
## 독립 심사: 안 A와 안 B 비교

파일은 만들거나 고치지 않았습니다. 설계자가 쓴 핵심 숫자를 아래 명령으로 다시 대조했습니다: `git show origin/main`(f1dd2b5), fleet-sync, skills.json, setup 스크립트, hooks.json, `schtasks /Query`.

### 1. 같은 잣대 비교표

| 잣대 | 안 A (통합 관제) | 안 B (아티팩트 모아보기) |
|---|---|---|
| ① 공통으로 보기 | ○ 계획서는 Claude 전 계정과 Codex분이 모두 모입니다. △ 계획서가 아닌 조사·결과 보고서는 모이지 않습니다(이 계정 37건 중 21건). | △ Claude Code에서 발행한 것은 종류와 상관없이 모이고, 과거분은 가져오기로 채웁니다. × 채팅 안 아티팩트 39건, Design 4건, Codex분은 빠집니다. |
| ① 공통으로 승인 | ○ | × 지금처럼 계정별 claude.ai에서 합니다. |
| ① LLM이 받아 실행 | ○ Claude는 즉시 받고, Codex는 최대 약 20분 걸립니다. | △ 지금과 같습니다. 그 계정의 그 세션만 받습니다. |
| ① 어디까지 했나·반영됐나 | ○ 계획 상태와 현황판으로 보입니다. | × 현황판은 별도입니다. |
| ① 늘어나도 등록 한 번 | ○ 머신은 목록에 한 줄 넣으면 fleet-sync가 처리하고, 계정은 자동으로 잡힙니다. | △ 머신마다 setup을 실행해야 하고, 계정마다 가져오기를 한 번 해야 합니다. Claude가 아닌 LLM은 × |
| ② 관리 포인트 | 많습니다(아래 표). | 적습니다. |
| ③ 작업량 | 약 5세션 | 약 3세션 |
| ④ 리스크 | 기계 권한 분리(공통), 승인 경로가 잘못된 머신으로 갈 위험(아래 고친 점 1) | 기계 권한 분리(공통), 민감 문서가 퍼지는 면이 더 넓음 |
| ⑤ 되돌리기 | 가능합니다. 조각이 많고, fleet-status를 지운 경우 다시 등록해야 합니다. | 가능합니다. 단순합니다. |
| ⑥ 안 B에서 안 A로 넘어갈 때 | — | 다시 쓰는 것은 약 0.5세션 분량뿐입니다(아래 고친 점 3). |

### 2. 고친 관리 포인트 계수표

| 칸 | 안 A (설계자 → 고침) | 안 B 핵심 (설계자 → 고침) | 현황판만 따로 |
|---|---|---|---|
| 머신마다 새로 설치 | 0 → 0 | 0 → 0 | 0 |
| 머신마다 상시 스케줄 | +1(10분). 순증 5 → **지금 순증 4**(닿는 5대 등록 − macmini fleet-status 1). sj-x1이 돌아오면 5 | 0 → 0. 발행할 때만 훅이 돕니다. | +1(10분) |
| 머신별 1회 손작업 | 0, win002만 1 → 맞습니다. /cs가 fleet-sync를 실행합니다(creeta-lens scripts/git-sync-all.sh:813). | "설정 1줄 × 4대" → **setup을 손으로 4번 실행** + win002 Lens 수동 갱신 1번. 다른 머신의 Lens는 fleet-sync가 매일 자동 갱신합니다(fleet-sync.sh:159-192, skills.json:20). | 0, win002만 1 |
| 비밀값 | 2 → 2. 그리고 공개키를 Lens 코드에 상수로 박기 때문에 **키를 바꾸려면 Lens 릴리즈가 필요**합니다. | 1종 2값 → 맞습니다. | 1 |
| 중앙에 늘어나는 것 | D1 표 4, API 4, 정적 파일 1, Access 설정 2, vars 2, secret 1 → 맞습니다. | 표 1, API 1, 탭 1, Access 설정 2, var 1 → 맞습니다. | 표 1, API 1~2, 탭 1, Access 설정 2 |
| 코드 파일 | 신규 4 / 수정 18 → **신규 5**(md.js 빠뜨림) / **수정 약 21**(cp-questions 템플릿, report-viewer.test, session-start.test 빠뜨림) | 신규 6 / 수정 11 → **신규 코드 5**(env 파일은 비밀값) / **수정 약 13**(README, session-start.test 빠뜨림) | 신규 3 / 수정 약 8, Lens 변경 0 |
| 대표가 계획마다 하는 단계 | 3 → 3. 장소만 docs.blex.co로 바뀝니다. | 추가 0 → 맞습니다. | 0 |
| 대표가 한 번만 하는 단계 | 정지 지점 승인 1 | 정지 지점 승인 1 + 계정별 가져오기 2~3번 + livevil7 계정 50건 초과분 브라우저 보충 | 정지 지점 승인 1 |
| 안 B에 현황판을 붙일 때 | — | "스케줄 0(fleet-sync 끝에 한 줄)" → 이렇게 하면 **하루 1번만 갱신**됩니다. `\LensFleetSync`의 다음 실행이 10-04 09:00입니다(실측). 그래서 "어디까지 했나"를 보는 데는 쓸 수 없습니다. 10분 갱신으로 하면 머신당 +1이 되어 안 A와 같아집니다. | — |

**설계자 숫자에서 고친 점과 근거**

1. **안 A가 놓친 머신 이름 결함 (심각도 높음).**
   - 안 A의 수집기는 machine_id를 `AGENTMEMORY_PROJECT_NAME`에서 읽습니다.
   - 그런데 `setup-shared-agent-context.py:54`가 이 값이 없을 때 기본값 `'livevil@sj-omen'`을 넣습니다(실측).
   - 그러면 여러 머신이 모두 sj-omen으로 보고될 수 있습니다. 안 A는 답을 담당 머신에만 내려보내므로 **승인이 엉뚱한 머신으로 갈 수 있습니다.**
   - 안 B는 이 결함을 T11에서 고칩니다. 안 A도 같은 수정이 필요합니다.
2. **안 A에서 승인 도착 방식이 '도착 알림'에서 '주기 확인'으로 바뀝니다.**
   - 지금은 대표가 답하면 댓글이 그 세션으로 바로 옵니다(cp-questions.html:152-163, cp SKILL.md:308).
   - 안 A에서는 Claude가 `--wait`로 최대 2시간 백그라운드에서 기다립니다. 그런데 전역 규칙이 백그라운드 대기 중 2분마다 보고하라고 정하고 있어서, 오래 기다리면 토큰이 듭니다. 안 A 계수표에 이 비용이 없습니다.
3. **안 B에서 안 A로 넘어갈 때 다시 쓰는 범위를 과대평가했습니다.**
   - 안 B ⑨는 "안 A는 md를 서버에서 렌더"한다고 전제합니다. 그러나 안 A 최종 설계는 브라우저에서 렌더합니다.
   - 안 B의 식별·비밀값 검사 코드는 Node(Lens 훅)이고, 안 A의 수집기는 Python입니다. 언어가 달라 코드를 그대로 다시 쓸 수 없습니다. 판 번호도 쓰는 표가 달라서(plan_versions와 artifact_src) 방식만 같습니다.
   - 실제로 다시 쓰는 것은 권한 분리(두 안의 T1이 같음), Access 토큰과 정책, 비밀값 파일 위치, 관리 화면 탭 틀 정도입니다. 약 0.5세션 분량입니다.
4. **두 안 공통 Blocker 후보는 확인됐습니다.**
   - `verifyAccessJwt`는 참/거짓만 돌려주고(auth.mjs), isAdmin은 서명만 확인합니다(worker.mjs:205-209). 이메일을 보지 않습니다.
   - 그래서 권한 분리를 배포하기 전에 Service Auth 정책을 추가하면 서비스 토큰이 관리 권한 전부를 갖습니다.
   - 토큰을 폐기하면 되돌릴 수 있으므로, "되돌리기 불가"라는 엄밀한 Blocker 정의에는 맞지 않습니다.
5. **비밀값이 퍼질 수 있는 면은 안 B가 더 넓습니다.**
   - 안 B는 모든 아티팩트를 올리고 과거분도 가져옵니다. 제목만 봐도 「snapholo 로그인 준비값」, 「Relist AI 연결 키」 같은 것이 있습니다.
   - 안 A는 계획서 md만 올립니다.
   - 비밀값이 한 번 올라가면 그 값을 교체해야 하므로 이 부분은 되돌리기 어렵습니다.
6. **[추정] 두 안 모두 아직 확인하지 못한 것:** 서비스 토큰 JWT에 common_name이 실리는지. 안 A는 추가로 워커가 Ed25519 서명을 지원하는지도 미확인입니다.

### 3. 현황판을 독립 부품으로 볼 수 있나

**볼 수 있습니다.**
- 안 A의 sync 요청은 상태 보고와 계획서를 한 요청에 묶었을 뿐입니다. 머신 표와 현황판은 계획 표, 답, 서명, Lens 변경이 하나도 없어도 돌아갑니다.
- 현황판에 필요한 것은 다음뿐입니다.
  - 공통 기반: 권한 분리, 서비스 토큰
  - Python 수집기와 10분 스케줄
  - 표 1개, API 1개, 탭 1개
- 오늘 오보를 낸 fleet-status(git push가 막혀 상태가 안 올라감)도 이것으로 대체됩니다.
- 대표의 직접 질문 "브랜치·워크트리를 한 번에 볼 수 없나"에는 두 안 중 어느 쪽을 고르든 이 부품이 답합니다. 약 1.5~2세션입니다.

### 4. 추천: 현황판 먼저(공통 기반 포함) → 안 A 계획 채널 → 안 B는 선택

이유는 다음과 같습니다.
1. 대표가 처음 말한 문제 "어디까지 하다 말았는지, 어디까지 반영됐는지"와 브랜치·워크트리 질문은 현황판만 해결합니다. 안 B 단독으로는 이 부분이 0입니다.
2. 공통 기반을 Python 수집기와 같은 언어로 한 번 만들면, 안 A가 그대로 이어 씁니다. 안 B를 먼저 하면 위 고친 점 3처럼 다시 쓰는 범위가 작습니다.
3. 안 A의 관리 포인트가 안 B보다 많은 주된 원인은 10분 스케줄입니다. 그런데 이것은 현황판 몫이라, 현황판을 원하면 어느 길로 가도 생깁니다. 안 A의 계획 채널만 따로 보면 추가분은 서명키, 표 3개, API 3개, Lens 변경입니다.
4. 단계마다 멈출 수 있습니다. 현황판으로 충분하면 계획 채널은 하지 않아도 됩니다.
5. 총량은 현황판 1.5~2 + 계획 채널 3~3.5로 약 5세션입니다. 안 A를 한 번에 하는 것과 같습니다. 안 B는 서로 얽히지 않으니 나중에 따로 더해도 됩니다(+3).

단, 안 A나 이 단계 경로에 들어가려면 먼저 고친 점 1(setup 54행의 머신 이름)을 고쳐야 합니다.

### 5. 데이터로 못 정하고 대표 선호로 정해야 하는 지점

1. **승인 장소를 claude.ai에서 docs.blex.co로 옮길지.** 지금은 답이 즉시 도착합니다. 안 A로 가면 Claude는 기다리며 받고, Codex는 최대 20분 걸립니다. 대신 휴대폰에서 한 화면으로 승인할 수 있습니다.
2. **계획서가 아닌 조사·결과 보고서까지 여러 계정분을 모아 볼 가치.** 이것은 안 B만 주는 가치입니다.
3. **Codex로 계획을 얼마나 쓰는지.** 사용 빈도 데이터가 없습니다. 메모리에는 "Codex는 이미지 전용"과 "순수 코드는 Codex"가 함께 적혀 있습니다.
4. **머신마다 10분 주기 상시 수집기를 두는 것**을 관리 부담으로 받아들일지.
5. **문서함 개편 계획의 비목표 "승인 흐름 제외"를 번복할지.** 안 A에만 해당합니다.
6. **민감 문서 사본이 docs.blex.co에 쌓이는 것을 어디까지 허용할지.** 특히 안 B의 과거분 가져오기가 해당합니다.
7. **sj-macbookair와 window-001을 현황판에 넣을지.**

AgentMemory는 두 안 모두 채널로 쓰지 않는다고 같은 근거로 판단했고, 저도 동의합니다.

참고로 MCP 서버 `higgs`와 `plugin:context7:context7`가 인증을 요구합니다. 이번 심사에는 쓰지 않았습니다. 쓰려면 대화형 세션에서 `/mcp`로 인증해야 하고, 그 전까지는 이 기능을 쓸 수 없습니다.
