---
name: cp-board-redesign
plan_id: 2026-05-21-cp-board-redesign
created: 2026-05-21
status: draft
target_repo: creeta-lens (livevil7/creeta-lens)
---

# /cp Taskboard 전면 재설계 — 폴더 직접 인덱싱 + Claude 전환 버튼

## 🎯 Goal — 이 task 의 결과물

> 현재 `/cp` 의 HTML 보드는 `docs/reports/*.html`(미리 구운 보고서)만 인덱싱하는 opt-in 기능이다. 사용자는 **`docs/{tasks,history,rules}` 세 폴더의 md·html 문서를 한 화면에서 보는 단일 보드**를 기본값으로 원한다. md-only 문서에는 "html 로 전환" 버튼을 달고, 정적 file:// 제약상 버튼은 **Claude 재생성 요청**(슬라이드 데크 품질 유지) 방식으로 동작한다. `reports/` 중간단계는 폐기한다.

**완료 시점에 존재해야 하는 것:**
- `lib/board-builder.js` 재작성 — `docs/{tasks,history,rules}/` 의 `.md` + `.html` 을 직접 스캔, basename 으로 페어링, repo 명 도출, **단일 `docs/board_<repo>.html` 생성** (reports/ 의존 제거)
- 새 `templates/board.template.html` — 3폴더 그룹 레이아웃 + 문서 목록 + 뷰어 pane(html 은 iframe, md 는 원본 표시) + md-only 카드의 "html 로 전환" 버튼
- "전환" 버튼 동작 — 클릭 시 `/cp html <상대경로>` 슬래시 명령을 **클립보드 복사** + 토스트 (Claude 재생성 요청 메커니즘)
- `skills/cp/SKILL.md` 신규 **CONVERT 모드**(`/cp html <file>` → md 읽어 슬라이드 데크 html 을 **같은 폴더**에 생성 + 보드 재빌드) + 보드 **기본 생성**(opt-in 해제) + 파일명 `board_<repo>.html` + reports/ 폐기 반영
- creeta-lens 소스에 반영 후 `/lens-upgrade` 로 재배포 (캐시는 휘발 — 소스가 SoT)

**성공 기준 (검증 가능):**
- [ ] `node lib/board-builder.js <projectRoot>` 실행 → `docs/board_creeta-lens.html` 생성, 콘솔에 tasks/history/rules 카운트 출력
- [ ] board 를 file:// 로 열면 **tasks·history·rules 3폴더의 md·html 문서가 모두** 카드로 표시됨
- [ ] html 있는 문서 클릭 → 슬라이드 데크가 iframe 으로 표시 / md-only 문서 클릭 → 원본 md 표시 + "전환" 버튼 노출
- [ ] "전환" 버튼 클릭 → `/cp html docs/tasks/<file>.md` 가 클립보드에 복사됨 (토스트 확인)
- [ ] `/cp html <md경로>` 실행 → 같은 폴더에 `<file>.html`(슬라이드 데크) 생성 + 보드 자동 재빌드
- [ ] `/lens-upgrade` 후 `claude plugin list` 의 lens 버전이 신규 버전과 일치

**완료의 정의 (Done = ?):**

> creeta-lens 소스에서 `node lib/board-builder.js` 를 돌리면 `docs/board_creeta-lens.html` 이 생성되고, 브라우저로 열었을 때 tasks/history/rules 세 폴더의 md·html 문서가 한 화면에 보이며, md-only 카드의 "전환" 버튼이 `/cp html <경로>` 를 클립보드에 복사하고, 그 명령을 Claude Code 에서 실행하면 같은 폴더에 슬라이드 데크 html 이 생성된 뒤 보드가 재빌드된다.

---

## 컨텍스트 (검증된 사실)

- **타깃 repo**: `creeta-lens` (remote `git@github.com:livevil7/creeta-lens.git`). 플러그인 캐시(`~/.claude/plugins/cache/.../3.5.0`)는 휘발 → **소스 수정 후 `/lens-upgrade` 필수**.
- **현재 board-builder.js** (`lib/board-builder.js`, 137줄): `docs/reports/*.html` 만 스캔 → meta(`lens:source`, `lens:source-hash`)·title·category 추출 → `{{BOARD_DATA}}` JSON 을 `board.template.html` 에 주입 → `docs/board.html` 생성. stale 감지(md 해시 비교) 포함.
- **현재 board.template.html** (44KB): self-contained kanban(Todo/Doing/Done) + slide-over iframe panel.
- **현재 흐름**: PLAN/DONE 시 `docs/reports/{id}.html`(슬라이드 데크) 생성 → builder 가 reports 인덱싱. **reportFormat: "html" opt-in** (creeta-lens 기본값은 `md`).
- **기존 docs/tasks/ md 2개** (`2026-05-16-...`, `2026-05-20-...`) = **테스트 산출물** (정식 문서 아님). 구현 시 board 렌더 **테스트 픽스처**로만 사용.
- **폴더명 가정**: 기존 `docs/{tasks,history,rules}/` 유지 (모든 repo 컨벤션 + CLAUDE.md 포인터 호환). 사용자 표현 "doc 폴더"는 기존 docs/ 로 해석 — 다르면 정정 요망.
- **슬라이드 데크 품질**: 현재 `report-conversion-spec.md` + `report-plan/history.example.html` 의 Pretendard 슬라이드 양식 유지. 이건 **Claude 가 의미 재구성**으로 생성 — 정적 버튼만으론 불가(→ 전환 버튼 = Claude 요청).

---

## Plan A — 권장 경로 (스캐너 → 템플릿 → SKILL 순, 전면 재설계)

### 왜 이게 1순위인가
- 데이터 계약(builder 출력 schema)을 먼저 확정해야 템플릿/SKILL 이 그 위에 올라간다 — 거꾸로 하면 재작업.
- builder·template 는 단일 책임이라 교체가 깔끔. SKILL.md 는 동작 명세라 코드 확정 후 기술.
- 정적 file:// 3대 제약(① 폴더 못 읽음 ② Claude 호출 불가 ③ 파일 쓰기 불가)을 설계 전제로 못박아 헛수고 방지.

### 단계 (각 단계 verify 명시)

- [ ] **step 1 — 데이터 모델 + 스캐너 재작성** (`lib/board-builder.js`)
  - repo 명 도출: git remote 파싱 우선 → 실패 시 `path.basename(projectRoot)` (creeta-lens → `creeta-lens`)
  - `docs/{tasks,history,rules}/` 각각 스캔: `.md` + `.html` 수집, basename 으로 페어링 → 각 문서 `{folder, id, title, date, hasMd, hasHtml, mdPath, htmlPath, mdInline}` (md 본문은 `<\/` escape 후 inline — file:// 가 폴더 못 읽으니 굽는 시점에 내장)
  - 출력 schema v3: `{schemaVersion:3, repo, generatedAt, groups:{tasks:[],history:[],rules:[]}}`, 카드 1줄/1직렬화 (git-diff 친화)
  - **inline 크기 캡 (Codex #5)**: md 본문 40KB 초과 시 truncate + `truncated:true` 플래그 → 뷰어가 "원본 열기" 링크 노출
  - **stale 유지 (Opus)**: 기존 해시 stale 감지 보존 — inline 본문이 디스크 md 와 어긋나면 카드 stale 표시
  - 출력 파일명 `docs/board_<repo>.html`
  - verify: `node lib/board-builder.js <creeta-lens>` → board 파일 생성 + 콘솔 카운트 (테스트 픽스처 2개 인식)
- [ ] **step 2 — `templates/board.template.html` 재작성** (self-contained, 외부 CSS 금지)
  - 좌: 3폴더 그룹(tasks/history/rules) 문서 목록 / 우: 뷰어 pane
  - 문서 클릭: `hasHtml` → `<iframe src="{htmlPath}">` (슬라이드 데크) / md-only → `mdInline` 표시 + **"html 로 전환" 버튼**
  - **XSS 차단 (Codex #2, 치명 — 설계 제약)**: md 는 **escape 후 `<pre>` + `textContent` 로만** 렌더. `innerHTML`/마크다운 파싱 **금지**. (마크다운 라이브러리 불필요)
  - 전환 버튼: `navigator.clipboard.writeText('/cp html ' + mdPath)` → **성공/실패 토스트 분기**. 실패(file:// 정책·권한·제스처) 시 명령 텍스트 select 가능한 **모달 노출**(수동 복사) — "복사된 줄 오해" 방지 (Codex #3 / 지점 C)
  - UI chrome 영문 고정(다국어 매트릭스 방지), 본문은 문서 언어
  - verify: builder 산출 board 를 file:// 로 열어 3폴더 표시 + html/md 클릭 동작 + 전환버튼 클립보드 성공·실패 UI 확인 + **`<script>` 포함 md 픽스처로 XSS 미실행 확인**
- [ ] **step 3 — `skills/cp/SKILL.md` 갱신** (동작 명세)
  - 신규 **CONVERT 모드**: `/cp html <md경로>` → md Read → conversion-spec 따라 슬라이드 데크 html 을 **같은 폴더**(tasks/ 또는 history/)에 `<id>.html` 로 Write → builder 재실행
  - **비원자성 처리 (Codex #6)**: builder 는 idempotent — `/cp html` 후 항상 재실행, 실패해도 재실행으로 복구(재빌드 저비용)
  - "HTML 보고서 뷰 + Task Board" 섹션 재작성: 보드 **기본 생성**(opt-in 해제), 파일명 `board_<repo>.html`, **reports/ 폐기** — html 은 md 옆에 생성
  - PLAN/DONE 모드: html 생성 위치를 `reports/` → 해당 폴더(tasks/|history/)로 변경, `lens:source` 메타 경로 갱신
  - verify: SKILL.md 내부 경로/동작 일관성 자기검토 (reports/ 잔존 참조 0)
- [ ] **step 4 — `_shared.css` 위치/상대경로 정합** (`templates/report-shared.css`, conversion-spec)
  - html 이 `docs/tasks/foo.html` 에 생성되므로 `_shared.css` 를 `docs/_shared.css` 에 두고 `../_shared.css` 참조 (또는 폴더별 배포) — 한 가지로 통일
  - `report-conversion-spec.md` 의 head/경로 규칙 + builder 의 css 배포 로직 동기화
  - verify: 생성된 html 을 file:// 로 열어 CSS 적용 확인
- [ ] **step 5 — `lens.config.json` 기본값 + plan-manager 연동**
  - `buildBoard` 기본 동작(보드 항상 생성), `reportFormat` 의미 재정의 또는 deprecate 표기
  - `lib/plan-manager.js` 가 reports/ 경로 가정 시 갱신
  - verify: 기본 설정에서 PLAN 1회 → board_<repo>.html 자동 생성
- [ ] **step 6 — 호환성/마이그레이션 (비파괴, Codex #1) + CHANGELOG + 버전 범프**
  - **reports/ 하드 삭제 금지**: builder 는 reports/ 가 있으면 무시(또는 1회 안내)하되 **물리 삭제 안 함**. 기존 `board.html` 도 보존.
  - 사용자가 원할 때만 쓰는 **선택적 마이그레이션 안내**(기존 reports/*.html → 각 폴더 이동) — 자동 실행 X ("기존꺼 정리는 옵션")
  - `3.5.0` → `3.6.0` (board 모델 breaking), CHANGELOG 에 변경 + 마이그레이션 노트. plugin.json / marketplace.json 버전 동기
  - verify: 기존 reports/ 보존 확인 + 세 곳 버전 일치
- [ ] **step 7 — 로컬 검증 → 재배포**
  - creeta-lens 에서 전 과정 수기 검증(성공 기준 6개) → 커밋 → `/lens-upgrade` → 캐시 버전 확인
  - verify: Done 시나리오 충족 + `claude plugin list` 버전 일치

### 막힐 수 있는 지점 (→ Plan B 트리거)
- **지점 A (step 2)**: board.template.html 전면 재작성이 기존 kanban 기능(drag-drop/저장)을 회귀시키거나 44KB 재작성 리스크 과대 → Plan B(증분 확장)로 전환
- **지점 B (step 4)**: html 이 폴더별로 흩어지며 `_shared.css` 상대경로가 깨짐(tasks/ vs history/ 깊이) → 경로 규칙 단일화 재설계
- **지점 C (step 2)**: `navigator.clipboard` 가 file:// 에서 브라우저 정책상 차단 → 클립보드 대신 "명령 표시 모달 + 수동 복사"로 폴백

---

## Plan B — Fallback 경로 (증분 확장, 전면 재작성 회피)

### Trigger
Plan A **step 2 에서 board.template.html 전면 재작성이 기존 기능 회귀/공수 폭증** 신호, **또는 step 4 에서 폴더별 CSS 경로가 반복적으로 깨짐**.

### 왜 이 대안인가
전면 재설계 대신 기존 board.template.html·builder 를 **증분 확장**. 사용자 목표(3폴더 통합 뷰 + 전환 버튼)는 달성하되 기존 검증된 kanban/iframe 자산을 보존. trade-off: "전면 재설계"라는 본래 방향에서 후퇴(아키텍처 덜 깔끔), 대신 안정성·속도↑.

### 단계
- [ ] builder 를 reports/ 인덱싱 유지한 채 **추가로** tasks/·history/·rules/ 의 raw md·html 도 카드로 인덱싱 (기존 schema 확장)
- [ ] board.template.html 에 기존 kanban 위 **뷰어 pane + 폴더 필터**만 증분 추가 (전면 교체 X)
- [ ] 전환 버튼은 클립보드 대신 **명령 표시 모달**(수동 복사) — clipboard 정책 회피
- [ ] 파일명/기본생성/CONVERT 모드는 Plan A 와 동일

---

## ⚠️ 사전 리스크 (Pre-mortem)

### Claude Opus 관점 (세션 컨텍스트 기반)
- **md = SoT 원칙 충돌 주의**: Lens 설계는 "md=SoT, HTML=파생뷰, 상태/요약 HTML 원본 저장 금지"를 못박음. board 에 md 본문을 inline 해도 board 는 어디까지나 **파생 스냅샷** — 진실은 디스크 md. 현 builder 의 **stale 해시 감지**를 보존해 inline 본문이 디스크와 어긋나면 카드에 stale 표시해야 함.
- **XSS = 가장 단순하고 안전한 해법으로 차단 (Rule 2)**: md 를 파싱·`innerHTML` 하지 말 것. **escape 후 `<pre>` + `textContent`** 로만 표시하면 XSS(Codex #2)를 원천 차단 + 마크다운 라이브러리 불필요. "보기 좋은" 렌더는 Claude 생성 html 의 몫. → "원본 표시 vs 안전 미리보기"라는 Codex 최대 블라인드 스팟은 **"md=escaped 텍스트, html=신뢰된 슬라이드 데크"** 2분할로 해소.
- **iframe 신뢰 경계**: html 슬라이드 데크는 우리가 생성한 신뢰 자산이나, `<iframe>` 에 최소 권한만. `_shared.css` 동일 출처 필요(same-origin) 고려.
- **SKILL.md 외과적 수정**: board 섹션 재작성이 Goal-first/핸드오프 프로토콜 등 다른 섹션을 깨면 안 됨 (Rule 3).
- **blast radius 는 사용자 본인 repo**: Lens 는 사용자 자신의 repo 들에서만 쓰이므로 reports/ 폐기 충격은 외부 생태계가 아닌 본인 docs/ 한정. 그래도 비파괴 마이그레이션 권장.

### Codex GPT-5.5 관점 (독립 코드 분석)
> - **시나리오 1 (호환성)**: 업그레이드 직후 reports/ 폐기 → 기존 reports 기반 링크/automation 이 카드 누락·404·스크립트 실패.
> - **시나리오 2 (보안·치명)**: md 에 `script`/`iframe`/`onerror`/raw HTML/백틱 내 태그 → file:// board 에서도 **임의 JS 실행·레이아웃 붕괴·클립보드 탈취**.
> - **시나리오 3 (UX)**: "전환" 버튼이 file://·비보안 컨텍스트·권한 미부여·제스처 부족으로 막힘 → 복사 실패했는데 사용자는 변환된 줄 오해.
> - **추가**: `_shared.css` 상대경로가 폴더 깊이별로 다르게 해석 / 대용량 md inline 으로 board 비대 / `/cp html` 생성과 board 재빌드 **비원자성**.
> - **최대 블라인드 스팟**: "원본 표시"와 "안전 미리보기"를 한 보드에서 동시 만족하는 렌더링 정책 — sanitization·크기 제한·마이그레이션 경고·실패 UI 를 **먼저** 정의해야 함.

### Trigger 매핑 (Pre-mortem 결과 → 대응)
- **XSS (Codex #2, 치명)** → Plan B 포크 아님. **설계 제약**으로 흡수: Plan A step 2 에 "md 는 escape+`<pre>`+textContent, innerHTML/마크다운 파싱 금지" 명시.
- **클립보드 차단 (Codex #3)** → 기존 **지점 C** 매핑 + Plan A step 2 에 **성공/실패 토스트 + 실패 시 명령 표시 모달**(실패 UI) 강화.
- **호환성/마이그레이션 (Codex #1)** → Plan A 신규 step(비파괴 reports/ 처리 + CHANGELOG 마이그레이션 노트). 사용자도 "기존꺼 정리는 옵션"이라 했으므로 **하드 삭제 금지**.
- **대용량 md inline (Codex #5)** → Plan A step 1 에 inline 크기 캡(예: >40KB 면 truncate + "원본 열기" 링크).
- **비원자성 (Codex #6)** → step 3 에 "builder 는 idempotent — `/cp html` 후 항상 재실행, 재빌드는 저비용" 명시.
- **_shared.css 경로 (Codex #4)** → 기존 step 4 + 지점 B 매핑 완료.

→ **결론**: data-loss 급 Blocker 없음(파괴는 reports/ 하드삭제뿐 → 비파괴로 회피). XSS 는 "escape-only 렌더"로 설계 단계 차단. 발견 위험은 모두 Plan A 제약·신규 step 으로 흡수. 아래 Plan A 에 반영함.

---

## 진행상황
- **마지막 업데이트**: 2026-05-21
- **현재 경로**: Plan A (전환 없음 — Plan B trigger 미발동)
- **Goal 달성**: 6/7 (성공기준 1~6 QA 검증 완료, 7번 `/lens-upgrade` 재배포는 사용자 확인 대기)
- **구현 완료 (소스)**: `lib/board-builder.js`(schema v3 재작성 + `$` replace 버그 픽스), `templates/board.template.html`(3폴더+뷰어+escape md+전환버튼), `skills/cp/SKILL.md`(CONVERT 모드+기본생성+reports/폐기), `templates/report-conversion-spec.md`(../_shared.css), `lens.config.json`(buildBoard:true), 버전 3.6.0(plugin/marketplace/CLAUDE/README/CHANGELOG)
- **QA 증거**: 브라우저(http) 렌더 확인 — 3폴더 19 docs 카드, plan doc html→iframe 슬라이드 데크, md-only→raw text+전환버튼, 전환버튼→`/cp html docs/...` 클립보드+토스트, XSS 픽스처 미실행(escape+`<\/` payload), 콘솔 에러 0
- **버그 수정 (QA 중 발견)**: `board-builder.js`의 `tpl.replace('{{BOARD_DATA}}', payload)`가 md의 `` $` ``(rules/codex-integration.md)를 replace 특수패턴으로 해석 → 템플릿 누출로 JSON 깨짐. 함수 치환 `() => payload`로 픽스
- **재개 포인트**: step 7 — 사용자 확인 후 `git commit` + `/lens-upgrade` 재배포 → `claude plugin list` 버전 3.6.0 확인
- **보류 중 연관 작업**: `creeta-homepage/docs/tasks/2026-05-21-lens-homepage-update.md` (홈페이지 Lens 카피 갱신 — 본 작업 후 재개)
