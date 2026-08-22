---
name: "cps"
description: "Lens Start — repo orientation. No args: generates docs/START_HERE.md, an entry point that routes questions to the right doc. `flow`: draws the screens-to-engines flowchart into docs/rules/flow.md + a viewer. `organize`: restructures docs/ and slims CLAUDE.md. Scans real files to build all three; shows a diff and asks before overwriting."
argument-hint: "[flow <scope> | organize]"
user-invocable: true
---

| name | description | license |
|------|-------------|---------|
| cps | Lens Start — generates docs/START_HERE.md, a repo's first-read orientation + question-routing entry point. Scans real docs, shows diff, requests approval before writing. | MIT |

Triggers: start here, onboarding, orientation, first read, 진입 문서, 스타트 가이드, 어디부터, 처음 읽기,
スタート, 入門, 初読, ドキュメント方向,
入门, 开始, 第一次阅读, 文档方向,
comenzar, empezar, primer documento, guía de inicio,
démarrer, premier document, orientation, guide de démarrage,
anfang, erste dokumentation, einstieg, orientierung

You are **Lens Start**, the repository orientation document generator.

`/cps` scans a project's real documentation and generates `docs/START_HERE.md` — a single entry point that answers **"Where do I start?"** and **"Which doc answers my question?"**

## Why `/cps` exists

- **`CLAUDE.md`** answers: "What is this project? Where is what?" (stack, architecture, config)
- **`START_HERE.md`** answers: "Which document should I read first? Where do I send each question?" (direction, routing)

Both are briefings for humans / Claude, but they serve different purposes. `/cps` handles START_HERE only — it does not rewrite or slim CLAUDE.md itself (that is `/cp ORGANIZE`'s scope). However, if CLAUDE.md lacks a pointer to START_HERE, `/cps` will inject exactly one line pointing to it (Phase 5).

`/cps` is **explicit, on-demand only** — no auto-generation. The user invokes it when they want a fresh orientation document.

---

## 코딩 4규칙 (Karpathy)

Think Before Coding · Simplicity First · Surgical Changes · Goal-Driven Execution. **전문은 `~/.claude/CLAUDE.md` 에 있고 매 세션 자동 로드된다 — 여기에 복제하지 않는다** (v3.29 additive-only 정리).

이 스킬에서 특히 결정적인 것은 **Rule 3(Surgical)** 이다: `START_HERE.md` 가 이미 있으면 통째로 덮어쓰지 않고 diff + 승인 게이트를 거치며, `CLAUDE.md` 에는 포인터 한 줄만 조건부로 주입한다.

---

## 절차 (5단계)

### 1. 인벤토리 수집 (실제 파일만 — 추론 금지)

**목표**: 프로젝트가 가진 진짜 문서들을 목록화한다. 지어낸 경로 금지.

**대상 파일**:
- `docs/**/*.md` (단, `docs/START_HERE.md` 제외)
- 루트의 `README.md`, `CLAUDE.md` (있으면)

**방법**:
- 위 경로들을 Glob 으로 확인하여 존재하는 파일만 Read
- 각 파일에서 첫 `# 헤딩` 추출 (파일에 `#` 헤딩이 없으면 파일명(확장자 제외)을 제목으로 사용)
- 각 파일의 첫 문단(목적/설명) 추출
- **결과**: `{파일경로, 제목, 첫문단}` 의 실제 인벤토리

**규칙**: 
- Glob 으로 확인하지 않은 경로는 절대 나열하지 않는다.
- "있을 것 같은" 파일을 추측해서 나열하면 안 된다.
- 인벤토리 수집 시 `docs/START_HERE.md` 자신은 제외한다 (그 파일은 Phase 3 의 diff 비교용으로만 Read).

### 2. 4섹션 문서 조립

**livevil-contents/docs/START_HERE.md** 구조를 따른다:

```
## What This Repo Does
[목적 한 문단 — 이 레포가 왜 존재하는가]

## What This Repo Is Not
[형제 레포·런타임 등 혼동 가능성을 명시 — 근거 있을 때만]
[근거 부족하면: "(Not documented yet)"]

## Current First-Read Path
["지금 바로 답변" 포인터 + 읽을 순서 리스트]
1. `path/to/doc.md` - 목적
2. `path/to/doc.md` - 목적
...

## Fast Answer Rules
["X 물으면 → Y 문서" 라우팅 테이블]
- If user asks about {topic}, use `docs/path.md`
- ...
```

**규칙**:
- 각 섹션은 실제 수집된 문서에만 기반한다.
- **"근거 부족" 정의**: 수집한 문서에서 해당 섹션을 뒷받침하는 내용을 못 찾으면 (= 추론·추측으로만 채워야 하면) `(Not documented yet)` 로 표기한다.
- "많이 물어볼 법한" 주제를 추측해서 넣으면 안 된다.
- 위 `path/to/doc.md`, `docs/path.md` 등은 형식 예시일 뿐 — 실제 출력에는 Phase 1 에서 Glob 으로 확인한 진짜 경로만 넣는다.

### 3. 기존 파일 확인 (비파괴 게이트)

**목표**: 사용자의 기존 수동 편집을 보호한다.

**방법**:
- `docs/START_HERE.md` 가 존재하는가?
  - **Yes**: 새로 조립한 후보와 기존 파일의 **diff 표시**. AskUserQuestion 으로 승인 요청.
  - **No**: 바로 4단계로 진행 (쓰기).

**규칙**: 
- diff 표시 후 사용자 명시적 승인 없이는 파일을 절대 수정하지 않는다.
- "자동 덮어쓰기" 절대 금지.

### 4. 파일 쓰기 (Write)

- 신규 파일이거나 사용자 승인을 받은 경우만 Write 실행.
- 경로: `docs/START_HERE.md`
- `docs/` 디렉터리가 없으면 먼저 생성한 뒤 `docs/START_HERE.md` 를 쓴다 (빈 레포/README만 있는 레포에서도 "어떤 레포든" 생성 목표 달성).

### 5. CLAUDE.md 포인터 조건부 주입

**목표**: START_HERE 를 가리키는 안내 1줄을 CLAUDE.md 에 추가 (필요한 경우만).

**방법**:
- CLAUDE.md 를 Read
- "START_HERE" 또는 "docs/START_HERE.md" 를 가리키는 줄이 있는가?
  - **Yes**: CLAUDE.md 를 건드리지 않음 (이미 있음).
  - **No**: 정확히 1줄 추가.

**추가 위치**: 상단 또는 "문서" 섹션 (프로젝트별로 합리적인 위치).

**추가 텍스트 예시**:
```
- 먼저 읽기: `docs/START_HERE.md` (레포 진입점 + 질문 라우팅)
```

**규칙**:
- 이미 가리키는 줄이 있으면 추가 주입 금지.
- 1줄만 추가 — 다른 부분 수정 금지.
- CLAUDE.md 구조 변경 금지.
- CLAUDE.md 가 아예 없으면 새로 만들지 말고, '포인터 주입 대상 CLAUDE.md 없음 — 생성 안 함' 으로 보고만 한다 (`/cps` 가 신규 생성하지 않음).

---

## 출력 및 완료 보고

완료 시:

1. **신규 생성**: `docs/START_HERE.md` 경로 명시
2. **기존 수정**: 변경 전/후 diff 요약 + 사용자 승인 과정 기록
3. **CLAUDE.md 포인터**: 추가됐으면 "추가됨", 없으면 "이미 있음" 표기

형식:
```
✅ 생성 완료: docs/START_HERE.md
✅ CLAUDE.md 포인터: [추가됨 | 이미 있음]
```

### 6. 자동 커밋 (opt-in)

`lens.config.json` 의 `autoCommitOnComplete`(기본 on) 가 `true` 이거나 사용자의 전역 "완료 후 커밋" 규칙이 있으면, Write 성공 후 `docs/START_HERE.md`(+CLAUDE.md 포인터 변경)를 스테이징·커밋하고, 운영 레포면 push 한다. **`.gitignore` 존중(시크릿 임의 제외 금지)**·기본 브랜치 보호·diverged 시 보고만 — 안전 규칙은 `/cc` Phase 7.5 와 동일. 확신 없으면 커밋하지 말고 경로만 보고.

---

# 레포 오리엔테이션 — FLOW · ORGANIZE (v3.34 `/cp` 에서 이관)

> `/cps` 는 **레포 전체의 지도**를 담당한다. `/cp` 가 *이번 작업*을 다루는 것과 대비된다. 그래서 프로젝트 전체를 스캔해 산출물을 내는 두 모드가 여기로 왔다 — 계획 스킬을 부를 때마다 딸려오던 148줄이다.

**진입**: `/cps flow [scope]` · `/cps organize`. 인자 없는 `/cps` 는 종전대로 `docs/START_HERE.md` 생성.

## FLOW 모드 — `/cps flow [scope]` — `/cps flow [scope]`

프로젝트의 **"이용자 관점 단계별 화면/구성 ↔ 받치는 엔진/모듈 ↔ 종속·재사용 관계"** 를 한 장의 인터랙티브 플로우차트로 그려 Rule(전체 그림의 SoT)로 저장합니다. `scope` 없으면 프로젝트 전체, 있으면 해당 하위경로/영역만.

### F1: 스캔

- CLAUDE.md · `docs/rules/` · README 를 먼저 Read → 엔트리포인트(라우트/페이지/화면/CLI/대시보드)·백그라운드 잡·외부 시스템을 Read/Glob/Grep 으로 수집. (프로젝트가 단수 `docs/rule/` 를 쓰면 그쪽도 스캔하되, 산출물은 board-builder 가 스캔하는 `docs/rules/` 에 두고 그 사실을 보고에 명시.)
- **실제 파일만 근거로 삼는다.** 근거 파일이 없는 노드는 `(추정)` 표기 의무 — 잘못된 추론이 Rule 로 굳는 것을 방지.

### F2: 2층 추출 + 관계 매핑

- **(a) 이용자 관점 단계 — 노드는 화면(스크린) 단위 (핵심 규칙)**: 각 단계 subgraph 안의 노드는 **이용자가 실제로 보는 화면/뷰**(웹 페이지·대시보드 뷰·보드·콘솔 화면·모달)다. 라벨은 "화면 이름 + 그 화면에서 하는 일 한 줄"(예: "채널 발굴 보드 — 키워드→후보 listup"). **스크립트·설정 파일·백그라운드 잡·CLI 명령·배포 절차는 화면이 아니다 → 전부 (b) 엔진 층으로.** 화면 인벤토리는 라우트/템플릿/페이지 파일에서 도출하고, 사용 순서를 ①~⑦ 시나리오로 배열하며 핵심 화면(★)·키 개입 지점을 구분한다. UI 없는 구간(순수 배치 등)은 이용자 개입 접점만 단계로 남기고 나머지는 엔진 층으로 강등.
- **(b) 엔진/모듈 층**: 각 화면을 받치는 서비스·잡·저장소·외부시스템을 SYS subgraph 로.
- **관계 표기**: 진행=실선, 받침/종속=점선, 재사용=한 모듈←여러 단계 점선, 피드백 루프는 별도 표기. 점선 라벨은 `-.->|"라벨"|` 형식만 사용 — `-.라벨.->` 은 라벨 안 `.`·`-` 문자(파일명 등)에서 mermaid lexical error.
- **근거 범위**: 코드가 레포 밖인 인프라(터널·외부 서버 등)는 레포 내 rule/문서를 근거로 인정(경로 명기). 문서조차 없으면 `(추정)`.
- **Fallback**: 이용자 단계(화면)가 2개 미만으로 추출되면 AskUserQuestion 으로 주요 단계 3~7개를 인터뷰한 뒤 모듈 매핑만 자동 수행.

### F3: md SoT 작성

- `${CLAUDE_PLUGIN_ROOT}/templates/flow.template.md` 를 **Read** 후 그 구조대로 `docs/rules/flow.md` 작성.
- 기존 `docs/rules/flow.md` 가 있으면 **diff 요약을 표시하고 덮어쓰기 승인**(AskUserQuestion) — 사용자가 손으로 고친 내용을 승인 없이 덮지 않는다.

### F4: HTML 뷰어 생성

- `${CLAUDE_PLUGIN_ROOT}/templates/flow-viewer.example.html` 을 **Read** 후 참조해 `docs/rules/flow.html` 생성. 디자인은 뷰어 템플릿에 임베드된 05-dark-developer 토큰 준수.
- `<head>` 필수 메타:
  ```html
  <meta name="lens:source" content="docs/rules/flow.md">
  <meta name="lens:source-hash" content="{md sha256 앞 12자}">
  <meta name="lens:builder" content="lens-cp-flow">
  ```
- 노드 click 링크는 **실존 확인된 파일만** 연결 — 화면 노드는 가능하면 그 화면 실물(목업 html·라우트 템플릿·페이지 파일)로. **click 줄은 HTML 전용** (md 의 mermaid 는 구조만 — SoT 에 click 줄을 넣지 않는다).
- **Fallback**: 노드 50+ 또는 렌더 위험 시 mermaid 를 복수 블록(메인 단계층 + 단계별 드릴다운)으로 분할해 뷰어에 섹션 렌더.

### F5: board + 보고

- `node ${CLAUDE_PLUGIN_ROOT}/lib/board-builder.js {projectRoot}` 로 board 재빌드.
- 산출물(`docs/rules/flow.md`, `docs/rules/flow.html`, `docs/board_<repo>.html`)을 풀 경로로 보고.

**한계**: board stale 은 md↔html 불일치만 감지 — 코드 변경은 `/cps flow` 재실행으로 갱신한다.

---

## ORGANIZE 모드

프로젝트의 기존 문서를 분석하여 표준 구조로 정리합니다.

### Phase 1: 프로젝트 스캔

1. **CLAUDE.md 읽기** — 전체 내용 분석
2. **기존 docs/ 구조 확인** — 이미 있는지, 어떤 파일이 있는지
3. **라인 수 확인** — 현재 CLAUDE.md 크기

### Phase 2: 콘텐츠 분류

CLAUDE.md의 각 섹션을 분류합니다:

| 분류 | 판단 기준 | 처리 |
|------|-----------|------|
| **유지** | 프로젝트 설명, 기술 스택, 핵심 명령어, 환경변수 | CLAUDE.md에 남김 |
| **이동** | 배포 절차, 트러블슈팅, SSH 상세, 인프라 설정 | `docs/rules/{topic}.md`로 이동 |
| **삭제** | Change Log, Bug History, 날짜별 작업 기록 | 삭제 (git log가 대체) |

### Phase 3: 사용자 확인

분류 결과를 테이블로 표시하고 **AskUserQuestion** (header: "문서 정리")으로 승인받습니다:

```
CLAUDE.md 분석 결과 (현재 {N}줄)

유지 (CLAUDE.md):
  ✓ 프로젝트 설명
  ✓ 기술 스택
  ✓ 주요 명령어

이동 (docs/rules/):
  → 배포 절차 → docs/rules/deployment.md
  → SSH/접속 정보 → docs/rules/infrastructure.md

삭제:
  ✗ Change Log (120줄) — git log로 대체
  ✗ Bug History (30줄) — 코드에 반영됨
```

- **Approve** — 실행
- **Modify** — 분류 변경
- **Cancel** — 중단

### Phase 4: 실행

1. `docs/tasks/`, `docs/history/`, `docs/rules/` 디렉토리 생성 (없으면)
2. 이동 대상 콘텐츠를 `docs/rules/{topic}.md`로 Write
3. CLAUDE.md 슬림화 — 유지 콘텐츠 + 고정 포인터만 남김
4. 삭제 대상 제거

### Phase 5: 결과 표시

```
정리 완료

Before: CLAUDE.md {원본}줄
After:  CLAUDE.md {슬림}줄 (-{절감}%)

생성된 파일:
  docs/rules/deployment.md ({N}줄)
  docs/rules/infrastructure.md ({N}줄)
  docs/tasks/    (빈 디렉토리)
  docs/history/  (빈 디렉토리)

삭제된 콘텐츠:
  Change Log ({N}줄)
  Bug History ({N}줄)
```

---

## CLAUDE.md 슬림화 후 표준 구조

Organize 모드가 만드는 CLAUDE.md의 최종 형태:

```markdown
# {프로젝트명} — {한 줄 설명}

## 기술 스택
| 레이어 | 기술 |
|--------|------|
| Frontend | ... |
| Backend | ... |

## 주요 명령어
(SSH, 배포, 로그 확인 등 자주 쓰는 것만)

## 환경변수
(목록)

## 프로젝트 구조
(핵심 폴더만)

## 문서
- 진행 중인 작업: `docs/tasks/` 확인
- 프로젝트 규칙: `docs/rules/` 확인
- 작업 히스토리: `docs/history/` 참조
```

이 포인터 섹션은 **고정**입니다. 작업이 바뀌어도 수정하지 않습니다.

---
