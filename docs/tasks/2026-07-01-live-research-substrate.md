---
planner: cpp
plan_id: live-research-substrate
date: 2026-07-01
refs: [ci-creeta-install, cpp-live-research, cr-creeta-research-rename]
---

# 라이브 리서치 substrate — `docs/rules/live-research.md`

> 4개 계획의 **토대**. /cpp(라이브화)와 /cr(creeta research)이 **똑같이 참조**하는 단일 규칙 문서. 이것부터 만들어야 B·C가 중복 없이 얹힌다.

## 🎯 What — 목표 (사람 언어)

- Lens 스킬이 "오늘의 인터넷 정보"(최신 릴리즈·트렌드·이슈·커뮤니티 반응)를 가져올 때 **어디를 어떻게 두드리는지가 한 곳에 정의**되어, 여러 스킬이 각자 재발명하지 않는다.
- 그 도구(agent-reach·insane-search)가 **안 깔린 사용자 환경에서도**, 스킬이 멈추지 않고 기존 수단(deep-research·웹검색)으로 **조용히 폴백**한다.

**🎬 사용 장면:** `/cpp`나 `/cr`이 조사 단계에서 이 문서를 Read → "라이브 신호가 필요하네" 판단 → 문서의 호출표대로 `mcporter call exa...` / `python -m engine <URL>` 실행 → 결과를 조사보고에 반영. agent-reach가 없는 남의 PC에서 같은 스킬을 돌리면, 문서의 폴백 절에 따라 `deep-research`로 대체하고 "라이브 채널 없음(폴백)" 한 줄을 남긴다.

**완료의 정의 (Done = ?):**
> `docs/rules/live-research.md`가 존재하고, /cpp·/cr SKILL.md가 그 문서를 참조하며, 문서만 읽고도 (도구 있음/없음) 두 경로의 정확한 명령을 골라낼 수 있다.

## ❓ Why — 왜 (6하원칙)

- **왜 지금**: B(/cpp 라이브화)와 C(/cr)가 **같은 호출법·같은 폴백 규칙**을 필요로 한다. 각 스킬에 복붙하면 드리프트(한쪽만 고쳐짐)가 확정된다. 규칙은 한 곳(SoT)에 두고 참조가 정석.
- **무엇을**: agent-reach(무키 라이브 채널)·insane-search(WAF 우회 fetch) 호출법 + 미설치 감지·폴백 규칙 + 신선도 규율(출처·발행일 인용).
- **누구를 위해**: /cpp·/cr을 실행하는 Claude(에이전트) 자신, 그리고 이 플러그인을 쓰는 **모든 사용자**(도구 유무 무관).
- **어디서**: `creeta-lens/docs/rules/live-research.md`.
- **어떻게**: 새 규칙 문서 1개 신설(순수 문서, 코드 0). 기존 스킬은 참조 한 줄만 추가(각자 계획서에서).
- **안 하면**: /cpp와 /cr이 각자 다른 호출법을 갖게 되고, agent-reach 미설치 사용자에게서 두 스킬이 서로 다르게 깨진다.

## 🧰 실행 전략 & 자원

- **난이도**: small (순수 문서 1개, 코드 0).
- **권장 모델**: sonnet (문서 작성).
- **병렬 실행**: 단일 — 의존 없는 선행 토대라 가장 먼저 1개 에이전트.
- **활용 스킬**: 없음(문서). 단 내용의 정확성은 이 세션에서 실측한 agent-reach 7/15 채널·insane-search engine 경로에 근거.
- **기존 자원**: `~/.claude/skills/agent-reach/SKILL.md`(호출표 원본), insane-search `python -m engine`, 기존 `deep-research`·`context7`·네이티브 WebSearch/WebFetch(폴백 대상). `docs/rules/codex-integration.md`(규칙 문서 스타일 벤치마크).

## 📜 Constitution (이 작업 불변 조항)

1. **문서만** — 코드·스킬 로직 무수정(참조 추가는 각 스킬 계획서 소관).
2. **폴백 필수** — 도구 미설치가 "실패"가 아니라 "폴백"이 되도록 규칙에 명시(dormant 스캐폴딩 금지 원칙).
3. **위임 우선** — agent-reach가 이미 네이티브 스킬이므로, substrate는 호출법을 **재구현하지 말고 "agent-reach 스킬을 쓰라"**로 위임(중복 회피, surgical).
4. **No-Site-Name 준수 안 함 대상 아님** — 이건 Lens 문서라 플랫폼명 예시 허용(agent-reach/insane-search는 도구명, 사이트 하드코딩 아님).

## 🛠 How — 빌드레디 실행

> 산출물 = `docs/rules/live-research.md` 1개. 아래 태스크가 그 문서의 **완성 내용**을 규정한다(실행=복사).

- [ ] **T1** `docs/rules/live-research.md` 신설 — 헤더 + 목적 절
      파일: `creeta-lens/docs/rules/live-research.md`
      변경: 아래 구조로 작성 —
      ```markdown
      # Live Research substrate (agent-reach + insane-search)
      > Lens 스킬(/cpp S2, /cr)이 "현재 라이브 정보"를 가져오는 표준 경로.
      > 도구 미설치 시 폴백까지 규정. SoT — 스킬은 이 문서를 참조만 한다.
      ```
      검증: `test -f docs/rules/live-research.md` → 존재
      의존: 없음

- [ ] **T2** [P] 도구 감지 절 작성 (스킬이 실행 초입에 돌리는 판정)
      파일: 위 문서에 `## 0. 감지 (호출 전 1회)` 섹션
      변경: 정확한 감지 명령 —
      - agent-reach: `command -v agent-reach || ls ~/.agent-reach-venv/Scripts/agent-reach.exe`(win) / `~/.agent-reach-venv/bin/agent-reach`(unix). 있으면 `agent-reach doctor --json`으로 채널별 active_backend 확인.
      - insane-search: 플러그인 스킬 존재 확인(`ls ~/.claude/plugins/cache/*/insane-search/*/` 또는 스킬 목록). 있으면 `python -m engine <URL>` 사용 가능.
      - 둘 다 없으면 → "폴백 모드"로 진행(T4).
      검증: 문서에 win/unix 경로 + doctor 명령이 모두 명시됨
      의존: T1

- [ ] **T3** [P] 라이브 채널 호출표 작성 (agent-reach 위임 + 직접 명령)
      파일: 위 문서 `## 1. 라이브 채널 (agent-reach)` + `## 2. 차단 우회 fetch (insane-search)`
      변경: 실측 검증된 명령 그대로 —
      | 의도 | 명령 |
      |---|---|
      | 시맨틱 웹검색(트렌드·최신) | `mcporter call 'exa.web_search_exa(query: "...", numResults: 5)'` |
      | 웹페이지 읽기 | `curl -s "https://r.jina.ai/<URL>"` |
      | GitHub 리포/이슈/PR | `gh search repos "q" --sort updated --limit N` / `gh search issues` |
      | YouTube 자막 | `yt-dlp --write-auto-sub --sub-lang "ko,en" --skip-download -o "/tmp/%(id)s" "<URL>"` → json3/vtt 파싱 |
      | V2EX 핫 | `curl -s https://www.v2ex.com/api/topics/hot.json -H "User-Agent: lens/1.0"` |
      | RSS/Atom | `curl -s "<feed>"` 파싱 |
      | 플랫폼 라우팅 일반 | **agent-reach 스킬에 위임**(로그인 채널·재시도 체인은 그쪽 references가 관리) |
      | 차단(403/WAF)된 특정 URL | `python -m engine "<URL>"` (insane-search) |
      + 규칙: **한글 content를 셸에 직접 넣지 말 것**(cp949 깨짐 — `--data-binary @file` 또는 파일 경유). 임시파일은 `/tmp/`.
      검증: 각 행이 이 세션에서 실측된 명령과 일치(Exa·yt-dlp·engine)
      의존: T1

- [ ] **T4** 폴백 규칙 절 작성 (미설치 = 실패 아님)
      파일: 위 문서 `## 3. 폴백 (도구 없을 때)`
      변경: agent-reach 없음 → `deep-research` 스킬(있으면) → 없으면 네이티브 `WebSearch`/`WebFetch`. insane-search 없음 → `WebFetch`/jina(`r.jina.ai`). **폴백 시 조사보고에 "라이브 채널 없음(폴백: X)" 한 줄 남긴다.** 절대 "라이브 조사 실패"로 멈추지 않는다.
      검증: 문서에 2단 폴백(agent-reach→deep-research→web / insane→webfetch)이 명시됨
      의존: T1

- [ ] **T5** 신선도 규율 절 + 참조 안내
      파일: 위 문서 `## 4. 신선도 규율` + `## 5. 누가 참조하나`
      변경: (a) 라이브 인용은 **출처 URL + 발행일** 병기, 발행일 오래된 소스는 "라이브 아님" 표기. (b) 이 문서를 참조하는 스킬 = `/cpp`(S2 축③), `/cr`(creeta research). 스킬 추가/변경 시 여기 목록 갱신.
      검증: 문서에 인용 규율 + 참조 스킬 목록 존재
      의존: T1

- [ ] **T6** [Codex] WAF 우회 안전한계 절 추가 (insane-search 오남용 방지)
      파일: 위 문서 `## 6. 안전 한계 (insane-search)`
      변경: insane-search(`python -m engine`)는 **접근이 막힌 정당한 공개 정보 조회용**. 규칙: (a) 로그인/유료 페이월 우회 금지, (b) robots·ToS 위반 대량 크롤 금지, (c) 개인정보·비공개 리소스 조회 금지, (d) 실패(auth_required/paywall/404)는 terminal로 인정하고 멈춘다(무한 재시도 금지). 이 한계를 문서에 명시.
      검증: `grep -c "안전\|페이월\|robots" docs/rules/live-research.md` → ≥1
      의존: T1

- [ ] **T7** [Codex] 배선 — 참조처 등록 (문서만 만들고 끝내지 않기)
      파일: `creeta-lens/CLAUDE.md` (라이브러리/rules 섹션), `creeta-lens/docs/START_HERE.md` (rules 목록), `creeta-lens/docs/rules/release-guide.md` (rules 인벤토리에 있으면)
      변경: 세 곳에 "docs/rules/live-research.md — 라이브리서치 substrate(/cpp·/cr 참조)" 한 줄씩 등록. (실제 /cpp·/cr SKILL.md의 참조 추가는 각 스킬 계획서 T에서.)
      검증: `grep -rl "live-research" CLAUDE.md docs/START_HERE.md` → ≥1 파일
      의존: T1~T5

- [ ] **T8** CHANGELOG 한 줄 (버전 bump은 후속 계획들과 함께 — 여기선 문서만)
      파일: `creeta-lens/CHANGELOG.md`
      변경: 다음 버전 항목에 "docs/rules/live-research.md 신설 — /cpp·/cr 공유 라이브리서치 규칙" 한 줄.
      검증: `grep -n live-research CHANGELOG.md` → 1행
      의존: T1~T7

## 💡 시사점 · ⚠️ 주의점 · 🔀 Side Effect

- **💡 시사점**: 이후 어떤 Lens 스킬도 라이브 데이터가 필요하면 이 문서만 참조하면 된다(재발명 0). agent-reach 채널이 늘면 이 표 한 곳만 갱신.
- **⚠️ 주의점**: agent-reach·insane-search는 **Lens 외부 플러그인** → Lens가 강제 설치하지 않는다(문서는 "있으면 쓰고 없으면 폴백"만 규정). 강제 의존으로 오해하면 남의 환경에서 스킬이 깨진다.
- **🔀 Side Effect**: 이 문서 자체는 아무 코드도 안 건드림(blast radius 0). 실제 파급은 이를 **참조하는** /cpp·/cr 계획서에서 발생.

## ✅ Review — 검증 (EARS)

**검증 전략**: 로컬 파일 존재 + 내용 grep(문서 작업이라 실행 검증은 파일·grep). Playwright/staging 불필요.

| # | EARS | 확인 방법 | 통과 판정 | 종류 |
|---|------|----------|----------|------|
| 1 | WHEN 문서 신설 완료, THEN 파일이 SHALL 존재 | `test -f docs/rules/live-research.md` | exit 0 | auto |
| 2 | WHEN 도구 있음, THEN 문서는 Exa·engine 명령을 SHALL 제공 | `grep -c "web_search_exa\|python -m engine" docs/rules/live-research.md` | ≥2 | auto |
| 3 | WHEN 도구 없음, THEN 문서는 폴백 경로를 SHALL 명시 | `grep -c "폴백\|deep-research\|WebFetch" ...` | ≥2 | auto |
| 4 | WHEN 스킬이 참조, THEN 참조 스킬 목록이 SHALL 존재 | `grep -n "/cpp\|/cr" docs/rules/live-research.md` | ≥1 | auto |

## 🔀 Codex 교차 협의

- **합의(고신뢰)**: 문서만 만들면 부족 — /cpp·/cr SKILL.md가 명시 Read하도록 배선 + CLAUDE.md·START_HERE·release-guide 등록 필요(반영 T7).
- **Codex 신규 리스크→반영**: (a) agent-reach/insane-search **설치 감지·명령경로·실패출력·출처표기** 누락 → T2/T3/T5로 보강. (b) **WAF 우회 안전한계**(페이월·robots·비공개 금지, terminal 실패 인정) 누락 → T6 신설.
- **분기 없음**: substrate=단일 SoT 참조 방식에 이견 없음.

## 진행상황
- **마지막 업데이트**: 2026-07-01
- **현재 경로**: 계획 승인 대기
- **재개 포인트**: 승인 시 T1부터
