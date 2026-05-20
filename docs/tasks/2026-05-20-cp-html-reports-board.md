---
id: plan_cp_html_reports_board
type: plan
version: 2
created: 2026-05-20
updated: 2026-05-20
status: draft
generator: lens/plan (hand)
language: ko
parent: null
refs: [livevil-contents/docs/reports/_conversion-spec.md, livevil-contents/docs/board.html]
---

# Work Plan / cp 에 보고서 HTML 양식 + Task Board 녹이기

> 출처 컨텍스트: livevil-contents 에서 검증한 reports HTML 양식 + board.html 인덱스를
> lens cp 의 범용 기능으로 승격하는 기획.

---

## 🎯 Goal — 결과물

**완료 시점에 존재해야 하는 것:**

- `/cp` 가 만든 task/history 문서를 **Pretendard 미니멀 보고서 HTML** 로 볼 수 있다 (livevil-contents `reports/2026-05-13-publish-date-restore.html` 양식).
- 프로젝트의 모든 보고서를 한눈에 보는 **Task Board** (`docs/board.html`) — 카드 클릭 시 오른쪽 panel 에 iframe 으로 보고서 즉시 표시.
- 이 양식/board 가 **lens 소스(creeta-lens)에 들어가** 모든 프로젝트에서 `/cp` 만으로 동작 (livevil-contents 전용 아님).
- `/lens-upgrade` 후에도 살아남는다 (소스 레포 반영).

**성공 기준 (검증 가능):**

- [ ] **G1**: 임의의 새 프로젝트에서 `/cp {task}` 호출 → `docs/reports/{id}.html` 생성 (Pretendard/단일 blue/슬라이드 양식)
- [ ] **G2**: `/cp` DONE 처리 → history 보고서도 동일 양식 HTML
- [ ] **G3**: `docs/board.html` 이 reports/ 의 보고서들을 카드로 나열, 카드 클릭 → panel iframe 으로 즉시 표시
- [ ] **G4**: `_shared.css` 등 양식 자산이 cp 실행 시 프로젝트에 자동 배포됨
- [ ] **G5**: `/lens-upgrade` 실행 후 기능 유지 (creeta-lens 소스에 커밋됨)
- [ ] **G6**: 기존 md 기반 워크플로우 사용 프로젝트가 깨지지 않음 (하위 호환 또는 opt-in)

**완료의 정의 (Done = ?):**

> 새 프로젝트에서 `/cp` 한 번으로 보고서 HTML + board 가 만들어지고, lens upgrade 후에도 유지되며, 기존 md-only 프로젝트도 안 깨진다.

---

## 현재 lens cp 아키텍처 (분석)

| 요소 | 위치 | 역할 |
|------|------|------|
| 지침 | `skills/cp/SKILL.md` (v3.4 Goal-first) | Claude 행동 규칙. PLAN/DONE/ORGANIZE 모드 |
| 문서 생성 | `lib/plan-manager.js` `generatePlanContent()` | **코드로 md 생성** — frontmatter + Goal/PlanA/PlanB/Risks/Status, 다국어 8개 |
| 템플릿 | `templates/plan.template.md` | placeholder 템플릿 (md) |
| 상태 SoT | `.lens/plan-state.json` + md frontmatter | id/status/createdAt 추적 |
| 목록 | `plan-manager.js` `listPlans()` | `docs/` 의 **`.md` 만** 인식 |
| board | (없음) | plan-state.json 의 텍스트 요약만 |

## ⚠️ 핵심 충돌 — 두 철학

| | lens cp (현재) | livevil-contents 방식 |
|---|---|---|
| 데이터 SoT | md (frontmatter + state.json) | HTML (reports/{id}.html) |
| 생성 주체 | **코드 결정론** (plan-manager.js) | **Claude hand-craft** (의미 분석/재구성) |
| 빌더 언어 | Node / JS (lib/) | Python (seed/build) |
| 다국어 | 8개 언어 | 한국어 |
| 시각화 | 텍스트 md | 슬라이드 보고서 (KPI/Before-After/timeline) |
| board | 없음 | iframe panel 인덱스 |

**근본 긴장**: 코드 생성은 일관·빠름·다국어이나 "단순 템플릿 fill" 이라 *의미 분석 시각화*가 안 됨. hand-craft 는 풍부하나 일관성이 지침에 의존하고 느림. livevil 에서 사용자가 택한 건 hand-craft (Python auto-gen 명시 거부).

---

## Plan A — 권장 경로: 하이브리드 (데이터 md + 뷰 HTML + JS board 빌더)

### 왜 이게 1순위인가

lens 의 강점(상태추적·다국어·결정론)을 죽이지 않고, livevil 의 강점(시각 보고서·board)을 **레이어로 추가**. md 를 폐기하지 않고 "데이터/상태"로 남기되, 사람이 보는 "뷰"는 HTML 보고서. board 빌더는 lens 네이티브(JS).

### 단계

- [ ] **S1. 양식 자산을 templates/ 에 추가**: `report-shared.css` (livevil `_shared.css` 이식), `report-plan.template.html` (task 6슬라이드), `report-history.template.html` (history 8슬라이드), `report-conversion-spec.md` (작성 규칙)
- [ ] **S2. SKILL.md 갱신**: PLAN/DONE 모드에 "보고서 HTML 뷰 작성" 단계 추가. Claude 가 templates/report-*.html 양식을 Read → 의미 분석 → `docs/reports/{id}.html` 작성. md(데이터) + HTML(뷰) 병행 명시.
- [ ] **S3. board 빌더를 lib/board-builder.js 로**: livevil `seed_board_from_md.py` + `build_board_html.py` 를 JS 포팅. `docs/reports/*.html` 스캔 → 메타 추출 → `docs/board.html` 생성. iframe panel UI 포함.
- [ ] **S4. plan-manager.js 확장**: `listPlans()` 가 `.html` 도 인식. 보고서 경로 헬퍼 추가.
- [ ] **S5. lens.config.json 옵션**: `reportFormat: "html" | "md"` (기본 md = 하위호환, html = opt-in), `buildBoard: true|false`.
- [ ] **S6. 자산 배포 로직**: cp 첫 실행 시 `report-shared.css` 를 프로젝트 `docs/reports/` 로 복사 (없으면).
- [ ] **S7. 하위호환 검증**: 기존 md-only 프로젝트가 reportFormat 미설정 시 기존대로 동작.
- [ ] **S8. creeta-lens 소스 커밋 + 버전 bump + /lens-upgrade 검증**.

### 막힐 수 있는 지점 (→ Plan B 트리거)

- S3 board 빌더 JS 포팅이 Python 대비 공수 큼: file:// fetch 제약·한글 파일명·iframe 보안 → JS 빌더가 2일 넘어가면 Plan B.
- S2 에서 "md + HTML 병행" 이 사용자의 livevil "md 폐기" 선호와 충돌하면 → Plan B (HTML 네이티브).

## Plan B — Fallback: SKILL 지침 + 템플릿 자산만 (코드 변경 최소)

### Trigger

Plan A 의 JS 빌더/plan-manager 확장이 과투자로 판명되거나, 사용자가 "코드는 건드리지 말고 지침만" 을 원할 때.

### 왜 이 대안인가

livevil-contents 에서 실제로 검증된 최소 경로 그대로. plan-manager.js 코드 생성 경로는 그대로 두고(또는 비활성), SKILL.md 지침 + templates/ HTML 자산만 추가. board 빌더는 작은 단일 스크립트 또는 수동. 코드 리스크 0, 단 일관성은 SKILL 지침 강도에 의존.

### 단계

- [ ] templates/ 에 report HTML 양식 + _shared.css + spec 추가
- [ ] SKILL.md 에 "reports/{id}.html 작성" 지침 + reference Read 강제
- [ ] board 는 단일 self-contained HTML 빌더 1개 (JS 또는 수동), 또는 프로젝트별 선택
- [ ] reportFormat opt-in, 미설정 시 기존 md

## ⚠️ 사전 리스크

### Claude Opus 관점 (세션 컨텍스트 기반)

1. **lens 정체성 변화 위험** — lens cp 의 핵심 가치는 *결정론적 코드 생성 + 다국어 + 상태추적*. hand-craft HTML 보고서는 그 반대(LLM 의존, 비결정론). 둘을 한 스킬에 섞으면 cp 가 "코드 생성기인가 LLM 작가인가" 정체성 혼란. → **reportFormat opt-in 으로 명확히 분리**, 기본은 기존 md.
2. **livevil "md 폐기" vs lens "md 데이터 유지" 모순** — 사용자는 livevil 에서 md 를 폐기하고 HTML 을 SoT 로 했음. 그러나 lens 는 plan-state.json + frontmatter 가 상태 SoT 라 md 폐기 시 상태추적/listPlans/`/cc` 핸드오프(extractGoal, extractPlanBTriggers)가 다 깨짐. → **lens 에서는 md 가 SoT, HTML 은 파생 뷰**가 안전. 이 차이를 사용자에게 명시 필요.
3. **board 빌더 Python→JS 포팅 공수** — livevil 빌더는 Python. lens 는 Node. 재작성이지 이식이 아님. Goal-first 구조(deliverables/criteria/planA/planB)를 슬라이드로 매핑하는 로직도 새로 짜야. → 공수 과소평가 경계, Plan B(지침+자산만) 항상 열어둠.

### Codex GPT-5.5 관점 (독립 분석)

1. **md 갱신 ↔ HTML 재생성 누락** → board 에 오래된 진행률/결론 표시. (수동 편집/예외종료/partial write 트리거)
2. **경로 깨짐** → reports/{id}.html + board iframe 이 프로젝트별 base path·Windows 경로·GitHub Pages 에서 깨져 빈 panel.
3. **/lens-upgrade 가 템플릿/빌더 덮어씀** → reportFormat 설정·커스텀 CSS·생성물과 충돌, 보드 사라지거나 구HTML+신md 혼재.
- **범용화 함정**: 다국어 8개를 HTML UI 문구까지 확장 시 번역 누락·레이아웃 깨짐. Pretendard 의존은 오프라인/사내망/라이선스 문제. reports 디렉터리 충돌·CSP·iframe 차단.
- **이중 SoT 정합성**: md 가 진짜 데이터면 HTML 은 *항상 파생물*. HTML 에 상태/요약 저장 시작하면 drift 필연. **생성 시점·입력 md 해시·builder 버전을 HTML 에 기록, 불일치 시 재생성.**

### 통합 결론 — 계획 수정 사항

두 모델 모두 **이중 SoT drift** 와 **upgrade 충돌**을 최대 위험으로 지목. 수정:

- **HTML = 순수 파생물 강제**: reports HTML 에 상태/요약을 *원본으로* 저장 금지. 각 HTML head 에 `<meta name="lens:source" content="{md경로}">`, `<meta name="lens:source-hash">`, `<meta name="lens:builder-version">` 기록. board 빌더가 md 해시 불일치 감지 시 "stale" 표시 + 재생성 권고. → Codex 이중SoT/누락 대응.
- **자산은 덮어쓰지 않게 분리**: `report-shared.css` 는 lens 가 *최초 1회만* 복사(이미 있으면 skip), 사용자 커스텀 보존. 빌더/템플릿은 lens 소스에 두고 프로젝트엔 생성물만. `/lens-upgrade` 가 프로젝트 생성물 안 건드림. → Codex upgrade 충돌 대응.
- **경로는 상대경로 + 동일 폴더 강제**: board.html 과 reports/ 는 같은 docs/ 하위, 상대경로만. 배포(GitHub Pages)는 scope 밖으로 명시 (로컬 file:// + 같은 폴더 http 만 지원).
- **Pretendard fallback**: CDN 실패 대비 `font-family` 에 system-ui fallback 명시 (이미 _shared.css 에 있음). 오프라인 환경은 "CDN 필요" 한계로 문서화.
- **다국어는 보고서 본문만, UI chrome 은 영문 고정**: 슬라이드 콘텐츠는 plan 언어 따르되 page-no/eyebrow 등 UI 라벨은 영문 고정 → 번역 매트릭스 폭발 방지.
- **md SoT 유지 확정 (Plan A 의 A2)**: lens 에서는 md 가 데이터/상태 SoT, HTML 은 파생 뷰. livevil 의 "md 폐기" 와 다름을 사용자에게 명시하고 동의받는다.

## 진행상황

- **Updated**: 2026-05-20
- **현재 경로**: Plan A (하이브리드). 데이터 모델 = **md SoT + HTML 파생 뷰** (사용자 확정).
- **구현 완료 (이번 세션)**:
  - S1 ✅ `templates/`: report-shared.css, report-conversion-spec.md, report-history.example.html, report-plan.example.html, board.template.html
  - S2 ✅ `skills/cp/SKILL.md`: "HTML 보고서 뷰 + Task Board (reportFormat: html — opt-in)" 섹션 추가
  - S5 ✅ `lens.config.json`: `reportFormat: "md"` (기본), `buildBoard: false`
  - S3 ✅ `lib/board-builder.js`: reports 스캔 → board.html, iframe panel, lens:source-hash stale 감지. **livevil-contents 3카드 검증 통과** (카드 클릭 → iframe panel 동작)
  - S6 ✅ board-builder 가 `_shared.css` 최초 1회 배포 (있으면 skip)
  - S4 ⏭️ 스킵 — md=SoT 라 listPlans=md 가 올바름. 보고서 경로는 SKILL 지침이 명시.
  - S7 ✅ 하위호환 — reportFormat 기본 md + plan-manager.js 무변경 → md-only 프로젝트 무영향 (구조적 보장)
- **재개 포인트**: S8 — creeta-lens 커밋 + 버전 bump + `/lens-upgrade` 검증 (사용자 확인 후)

## Status

**Status**: executing
