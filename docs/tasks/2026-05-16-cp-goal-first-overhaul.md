# /cp + /cc 를 Goal-first 구조로 동시 개편

**작성일**: 2026-05-16
**작성자**: livev + Claude Opus 4.7
**대상 버전**: lens v3.3.3 → v3.4.0
**규모**: medium-large (코드 + 2개 스킬 문서 + 템플릿 + 핸드오프 프로토콜)

> **이 task의 제1 원칙**: **Goal은 모든 것의 최상위다.** 문서의 다른 모든 섹션(Plan A, Plan B, Pre-mortem, 진행상황)은 Goal에 종속된 보조 자료다. 실행 엔진(/cc)은 Goal 달성을 위해 Plan A/B 사이를 자유롭게 전환할 수 있으나, **Goal 자체는 절대 양보하지 않는다**. Goal이 약하면 reject, Goal이 달성되지 않으면 절대 done 처리하지 않는다.

---

## 🎯 Goal — 이 task의 결과물

**완료 시점에 존재해야 하는 것:**
- `skills/cp/SKILL.md` 가 **Phase 0(Goal Definition) → Phase 1(Plan A) → Phase 2(Plan B) → Phase 2.5(Pre-mortem)** 순서로 재구성된 상태
- `skills/cc/SKILL.md` 가 **Goal-aware 실행 엔진**으로 격상된 상태 — plan 문서의 Goal 섹션을 최우선 로드, Goal 검증 기준 미달 시 Plan A↔Plan B 자동 전환, Goal 달성 전 done 처리 차단
- `lib/plan-manager.js` 의 `REQUIRED_SECTIONS` / `generatePlanContent()` / **신규 `extractGoal()` 함수** 가 새 구조의 마크다운을 생성/파싱하는 상태
- `templates/plan.template.md` 가 새 구조 reference로 갱신된 상태
- **/cp↔/cc 핸드오프 프로토콜** 이 SKILL.md 양쪽에 명문화된 상태 (어떤 필드를 어떤 형식으로 전달하는지)
- `CHANGELOG.md` 에 `v3.4.0` entry 추가, `plugin.json` 버전 bump

**성공 기준 (검증 가능):**
- [ ] `/cp <임의 task>` 실행 시 생성되는 문서가 `## 🎯 Goal`, `## Plan A`, `## Plan B`, `## ⚠️ 사전 리스크`, `## 진행상황` 5개 섹션을 순서대로 포함한다
- [ ] `/cc` 가 plan 문서 경로를 받아 실행할 때 **첫 동작은 Goal 섹션 파싱 + 성공 기준 체크박스 추출**이다 (TodoWrite의 첫 항목들이 성공 기준이어야 함)
- [ ] `/cc` 가 Plan A 진행 중 막혔다고 판단하면 **자동으로 task 문서의 Plan B Trigger와 매칭 → Plan B로 전환** (사용자 개입 없이)
- [ ] `/cc` 의 모든 성공 기준 체크박스가 yes 가 되기 전엔 **"완료" 보고를 차단** — 미달 항목 명시하고 retry/Plan B/사용자 개입 요청 중 하나를 선택
- [ ] `validatePlanStructure()` 가 새 REQUIRED_SECTIONS 기준으로 통과/실패한다
- [ ] medium 이상 규모 task에서 Plan B 섹션이 비어있으면 Phase 4 Approve가 거부된다 (small은 Plan B 생략 허용)
- [ ] Goal이 "동사+산출물" 형식이 아니면 Phase 4 Approve가 거부된다 (예: "API 개선" → reject / "POST /api/users가 201 반환" → accept)
- [ ] 8개 언어(EN/KO/JA/ZH/ES/FR/DE/IT)의 헤더 dict에 Goal / Plan A / Plan B / Trigger 키가 모두 채워져 있다
- [ ] 기존 `docs/tasks/` 의 v3.3.x 형식 문서는 그대로 읽힌다 (parsePlanFrontmatter 호환성 유지)

**완료의 정의 (Done = ?):**

> 새 lens 빌드를 install 한 뒤 임의 프로젝트에서 `/cp redis 캐싱 도입` → Approve → `/cc` 자동 핸드오프 시나리오를 돌렸을 때:
>
> 1. `/cp` 가 Goal-first 마크다운 파일 저장
> 2. `/cc` 가 Goal 섹션의 성공 기준 N개를 TodoWrite에 등록
> 3. Plan A 진행 → 1개 step 실패 시뮬레이션 (e.g. 강제 에러) 시 Plan B Trigger 매칭 + 자동 전환
> 4. 모든 성공 기준이 yes 가 될 때까지 루프, 미달 항목 잔존 시 done 보고 거부
> 5. 최종 보고에 "Goal 달성: 5/5 ✓" 형식 명시

---

## Plan A — 권장 경로: 6개 파일 동시 인플레이스 수정

### 왜 이게 1순위인가

- 여섯 파일이 의미적으로 한 덩어리 (cp 스킬 + cc 스킬 + 코드 생성기/파서 + 템플릿 + 버전 기록 + 플러그인 매니페스트) — 따로 머지하면 중간 상태가 깨진 빌드가 됨.
- 인플레이스 수정은 diff가 명확해서 리뷰가 쉽고, git history 한 커밋으로 묶을 수 있음.
- Goal 게이트는 SKILL.md 본문만으로 LLM 셀프 검열로 강제 (코드 게이트는 백업).
- `/cc` 의 Goal 루프 로직도 SKILL.md 명세 + LLM 준수로 처리 (별도 런타임 코드 신설 불필요).

### 단계

- [ ] **A1. `/cp` SKILL.md PLAN 모드 재구성** ([skills/cp/SKILL.md](skills/cp/SKILL.md))
  - 현재 Phase 1 (분석) → Phase 0 (Goal & Deliverable) 으로 격상, 분석은 Phase 0의 보조 단계로 흡수
  - Phase 2 (문서 작성)의 마크다운 템플릿을 Goal/Plan A/Plan B/Pre-mortem/진행상황 5섹션으로 교체
  - "문서 품질 규칙" 에 **Goal 품질 게이트** 추가: "Goal은 '동사+산출물' 형태 / 검증 가능한 성공 기준 ≥1개 필수"
  - Plan B 의무화 규칙 명시: "medium 이상 필수, small은 'Plan B 불필요' 라인으로 생략 가능"
  - Phase 2.5 Pre-mortem 본문에 "Plan A 약점 → Plan B Trigger 연결" 문단 추가
  - Phase 4 Approve 직전에 Goal 게이트 + Plan B 게이트 체크 로직 명시
  - **Phase 5 Execute 분기에 핸드오프 프로토콜 명시** (아래 별도 섹션 참조)
- [ ] **A2. `/cc` SKILL.md Goal-aware 실행 엔진으로 격상** ([skills/cc/SKILL.md](skills/cc/SKILL.md))
  - 진입 시점에 **plan 문서 경로** 받으면 즉시 Goal 섹션 파싱 (없으면 사용자 입력에서 Goal을 추출 후 사용자 확인)
  - Goal의 "검증 가능한 성공 기준" 체크박스 N개 → TodoWrite의 **최우선 항목**으로 등록 (Plan A의 step들은 그 아래)
  - 매 step 완료 후 **Goal 검증 기준 재평가** — 통과한 항목 체크
  - Plan A의 step 이 실패하면 task 문서의 **"막힐 수 있는 지점"** 의 Trigger 와 매칭 시도 → 매칭되면 자동으로 Plan B로 전환 (전환 사실은 사용자에게 알림만)
  - 매칭 안 되는 실패면 사용자에게 "Plan B 전환 / 재시도 / 중단" 3지선다 AskUserQuestion
  - **종료 게이트**: 모든 성공 기준 yes 가 될 때까지 done 보고 차단. 미달 항목 있으면 "X/N 미달 — 다음 액션 선택" 강제
  - 최종 보고 포맷: "Goal 달성: N/N ✓" 또는 "Goal 미달성: X/N (미달 항목: [...])"
- [ ] **A3. plan-manager.js 코드 갱신** ([lib/plan-manager.js](lib/plan-manager.js))
  - `REQUIRED_SECTIONS` 배열을 `['Goal', 'Plan A', 'Plan B', 'Risks', 'Status']` 로 교체
  - `generatePlanContent()` 의 섹션 생성 로직을 새 구조로 재작성
  - **신규 함수 `extractGoal(planContent)`** 추가 — `/cc` 가 plan 문서에서 Goal 섹션 + 성공 기준 체크박스 배열을 파싱하는 데 사용
  - **신규 함수 `extractPlanBTriggers(planContent)`** 추가 — Plan A의 "막힐 수 있는 지점" 리스트를 추출해 Plan B Trigger 와 매핑
  - 8개 언어 헤더 dict 에 `goal`, `planA`, `planB`, `trigger`, `deliverable`, `successCriteria` 키 추가
  - `parsePlanFrontmatter()` 는 손대지 않음 (frontmatter 구조 동일)
  - `validatePlanStructure()` 는 새 REQUIRED_SECTIONS 로 자동 적용됨
- [ ] **A4. plan.template.md 갱신** ([templates/plan.template.md](templates/plan.template.md))
  - 새 구조 reference로 본문 교체 (runtime은 안 읽지만 AI 컨텍스트용)
- [ ] **A5. 버전 & 변경 이력**
  - `.claude-plugin/plugin.json` version `3.3.3` → `3.4.0`
  - `CHANGELOG.md` 에 v3.4.0 entry 추가 (breaking: plan 문서 구조 변경 + /cc 실행 모델 변경)
  - `CLAUDE.md` Version 섹션 갱신
- [ ] **A6. 수동 검증 시나리오**
  - **S1**: 임의 디렉토리에서 `/cp 테스트 작업` 호출 → 생성 파일이 새 구조인지 확인
  - **S2**: 기존 v3.3.x 형식 task 파일이 있는 프로젝트에서 `/cp` 무인자 호출 → 활성 작업 목록이 그대로 뜨는지 확인
  - **S3**: Goal이 약한 입력 ("뭔가 개선해줘") 으로 호출 → Phase 4에서 reject 메시지 뜨는지 확인
  - **S4**: `/cp` Approve 후 Execute 선택 → `/cc` 가 핸드오프 받아 Goal 섹션부터 TodoWrite 등록하는지 확인
  - **S5**: Plan A 의 한 step 을 강제 실패시킴 → `/cc` 가 자동으로 Plan B Trigger 매칭 + 전환하는지 확인
  - **S6**: 마지막 성공 기준 1개 미달 상태에서 `/cc` 가 done 보고를 시도하는지 → **차단되어야 함**

### 막힐 수 있는 지점 (→ Plan B 트리거)

- **T1. generatePlanContent 재작성이 길어져 diff 가 300줄 넘어감** → 리뷰 불가, 회귀 위험 ↑ → Plan B 진입
- **T2. 8개 언어 헤더 번역이 어색해서 사용자가 외부 검수 원함** → Plan B 의 점진 적용
- **T3. 기존 task 문서들(이미 작성된 livevil-contents/Returns-Homepage 등의 docs/tasks)이 새 validatePlanStructure 에서 죄다 실패함** → Plan B 의 호환 모드
- **T4. `/cc` Goal 루프가 무한 루프에 빠짐** (성공 기준이 모호해 영원히 yes 가 안 됨) → Plan B 의 "최대 N회 재시도 후 사용자 개입" 로직
- **T5. `/cc` 가 Plan A의 step 실패 신호를 잘못 인지해 불필요하게 Plan B로 자주 전환** → Plan B 의 "Trigger 매칭 임계값 상향 / 사용자 confirm 모드"

---

## Plan B — Fallback: 2개 SKILL.md만 우선, 코드는 호환 모드 + Goal 루프는 사용자 confirm 모드

### Trigger

Plan A의 **A3 단계에서 T1/T3 발생** (diff > 300줄 또는 기존 task 문서 호환성 깨짐) **또는 A2/A6 의 S5/S6 에서 T4/T5 발생** (Goal 루프 무한 / Plan B 오발동) 시 즉시 전환.

### 왜 이 대안인가

- 두 SKILL.md만 먼저 바꾸면 **LLM이 새 구조 + Goal 루프를 따르지만, 코드 게이트는 호환** — 점진 마이그레이션.
- Goal 루프 무한 위험은 **"최대 3회 재시도 후 사용자 confirm 강제"** 로 안전 장치 추가.
- Plan B 오발동 위험은 **자동 전환을 사용자 confirm 모드로 강등** — 자동성은 줄지만 신뢰성 ↑.
- Trade-off: 검증이 LLM 셀프 체크에 의존 + 자동성 일부 포기 → 일시적 마찰 ↑. 하지만 회귀/무한 루프 사고보단 낫다.

### 단계

- [ ] **B1. cp SKILL.md + cc SKILL.md 만 v3.4.0 으로 인플레이스 교체** (A1 + A2 와 동일)
- [ ] **B2. plan-manager.js 는 최소 변경**
  - `REQUIRED_SECTIONS` 에 새 섹션 **추가만** (기존 섹션도 유지) → 신규/구식 둘 다 통과
  - `generatePlanContent()` 는 손대지 않음 (LLM이 SKILL.md 따라 직접 마크다운 작성하므로 코드 생성기는 백업용)
  - `extractGoal()` / `extractPlanBTriggers()` 는 신설하되 best-effort (실패해도 throw 안 함, null 반환)
- [ ] **B3. `/cc` Goal 루프에 안전 장치 강제**
  - 최대 재시도 횟수 = **3회** (SKILL.md 본문에 명시)
  - 3회 초과 시 사용자 AskUserQuestion: "Goal 미달성 — 계속 / Plan B 전환 / 중단"
  - Plan A↔B 자동 전환을 **사용자 confirm 모드** 로 강등 (Trigger 매칭 시 "Plan B 로 전환할까요?" 묻기)
- [ ] **B4. 버전 bump 는 minor 가 아니라 patch** (`3.3.3` → `3.3.4`) — breaking 아님을 시그널
- [ ] **B5. 후속 task 생성**: `docs/tasks/YYYY-MM-DD-cc-goal-loop-automation.md` 로 "Goal 자동 루프 활성화" 별도 task 분리
- [ ] **B6. CHANGELOG에 "SKILL.md only — code generator unchanged, /cc auto-transition gated behind user confirm" 명시**

---

## /cp ↔ /cc 핸드오프 프로토콜 (신설 — Goal-first의 핵심)

> 이 프로토콜은 양쪽 SKILL.md 본문에 **동일 표현**으로 박혀야 한다. 어느 한쪽만 갱신되면 핸드오프가 깨진다.

### 핸드오프 시점

`/cp` Phase 5 의 사용자 선택이 **Execute** 일 때.

### 전달 페이로드 (Skill tool 호출 시)

`/cp` 는 `Skill` 도구로 `lens:cc` 를 호출하면서 다음 구조의 컨텍스트를 프롬프트에 첨부:

```text
[HANDOFF FROM /cp]
plan_doc_path: docs/tasks/YYYY-MM-DD-{slug}.md
plan_id: {plan-id-from-frontmatter}
original_request: {사용자 원본 요청}

[GOAL — 최우선, 절대 양보 금지]
{Goal 섹션 본문 전체}

[SUCCESS_CRITERIA — TodoWrite의 최상위 항목으로 등록할 것]
- [ ] {기준 1}
- [ ] {기준 2}
...

[CURRENT_PATH] Plan A
[PLAN_A_STEPS] {Plan A 체크리스트}
[PLAN_A_FAILURE_TRIGGERS] {막힐 수 있는 지점 리스트 — Plan B 매칭 키}
[PLAN_B_TRIGGERS] {Plan B Trigger 리스트}
[PLAN_B_STEPS] {Plan B 체크리스트}
```

### /cc 의 진입 동작 (이 페이로드를 받았을 때)

1. `plan_doc_path` 읽기 → 페이로드와 일치 확인 (drift 방지)
2. SUCCESS_CRITERIA → TodoWrite 최상위 항목 N개 등록 (status: pending)
3. PLAN_A_STEPS → TodoWrite 하위 항목으로 등록 (Goal 기준 아래)
4. 실행 루프 진입 — 각 step 종료 후 **SUCCESS_CRITERIA 재평가**, 통과 항목 자동 체크
5. step 실패 신호 발생 → PLAN_A_FAILURE_TRIGGERS 와 매칭 시도
6. 매칭 → PLAN_B_TRIGGERS 확인 → Plan B 단계로 전환 (CURRENT_PATH 갱신)
7. 매칭 실패 → AskUserQuestion: "Plan B 전환 / 재시도 / 중단"
8. 모든 SUCCESS_CRITERIA yes 가 될 때까지 루프
9. 최종 보고: "Goal 달성: N/N ✓" + task 문서의 `## 진행상황` 섹션 갱신 (`현재 경로`, `마지막 업데이트`)

### 절대 규칙

- `/cc` 는 SUCCESS_CRITERIA 미달 상태에서 **절대 done 처리 금지**
- `/cc` 는 Goal 자체를 수정할 권한 **없음** — 약하다고 판단되면 사용자에게 "Goal 재정의가 필요합니다 — /cp Modify 권장" 회신
- Plan A↔B 전환은 task 문서를 수정하지 않음 (현재 경로만 `## 진행상황` 에 기록)
- 핸드오프 페이로드와 plan 문서가 불일치하면 **plan 문서를 SoT 로 신뢰** (`/cp` 가 그 후에 수정한 흔적일 수 있음)

---

## ⚠️ 사전 리스크 (Pre-mortem)

> Phase 2.5에서 Opus + Codex 병렬 분석 후 채울 자리. 현재는 placeholder.

### Claude Opus 관점 (세션 컨텍스트 기반)
_(미실행 — Phase 2.5에서 작성)_

### Codex GPT-5.2 관점 (독립 코드 분석)
_(미실행 — Phase 2.5에서 작성)_

### Trigger 매핑 (Pre-mortem 결과 → Plan B 전환점)
- Pre-mortem 에서 발견된 약점은 Plan A의 "막힐 수 있는 지점" 섹션으로 흡수
- 같은 약점이 Plan B의 Trigger 와 매칭되는지 확인 → 매칭되지 않으면 Plan B에 새 Trigger 추가

---

## 진행상황

- **마지막 업데이트**: 2026-05-16
- **현재 경로**: Plan A (A1~A6 의 install 단계까지 완료, S1~S6 수동 검증 대기)
- **Goal 달성**: 코드/배포 5.5/6 ✓ — smoke test 8개 언어 통과 + v3.4.0 push (origin + creetacorp, tag v3.4.0 annotated) + `/lens-upgrade` 전체 phase 통과 (registry single entry / `claude plugin list` 확인 / installed_plugins.json 백업 보관). 마지막 0.5 는 Claude Code restart 후 S1~S6 실사용 검증.
- **재개 포인트**: **Claude Code 재시작 필요** (스크립트가 running CLI 를 재시작하지 못함). 재시작 후 S1~S6 시나리오 실행. 미달 항목 발견 시 task 문서 갱신 + 재진입.
- **git 상태**:
  - `0e7bdaf feat: v3.4.0 - Goal-first plan structure (BREAKING)` (8 files, +857/-200)
  - `cdc2529 chore: bump marketplace.json to v3.4.0` (1 file, +3/-3)
  - `v3.4.0` annotated tag → ba666b9 → 두 remote 모두 보유 (origin + creetacorp)
- **완료된 deliverable**:
  - ✓ `skills/cp/SKILL.md` Phase 0~6 + 핸드오프 프로토콜 + 핵심 원칙/절대 규칙 갱신
  - ✓ `skills/cc/SKILL.md` Phase 0 신설 + Phase 5.0 자동 전환 + Phase 7.4 진행상황 갱신 + 절대 규칙 보강 + v3.4 라벨링
  - ✓ `lib/plan-manager.js` REQUIRED_SECTIONS / generatePlanContent (8개 언어 dict) / extractGoal / extractPlanBTriggers / SECTION_ALIASES 다국어 validate / exports
  - ✓ `templates/plan.template.md` 새 구조 reference + lint disable
  - ✓ `.claude-plugin/plugin.json` 3.3.3 → 3.4.0
  - ✓ `CHANGELOG.md` v3.4.0 entry (BREAKING + Changed + Added + Migration notes)
  - ✓ `CLAUDE.md` Version 섹션 + plan-manager.js exports 목록 갱신

---

## 참고 — 이 task 문서 자체가 dogfooding 이다

이 문서는 **변경하려는 신규 구조를 미리 적용해서 작성**됐다. 즉:

| 기존 /cp 가 만들었을 구조 | 이 task 문서 (신규 구조) |
|---|---|
| 목표 → 체크리스트 → 기술적 접근 → 리스크 | 🎯 Goal (최우선·절대) → Plan A → Plan B → 핸드오프 프로토콜 → Pre-mortem → 진행상황 |
| Plan B 없음 (리스크 섹션이 대체) | Plan B Trigger + 단계 명시 + 자동 전환 규칙 |
| Goal 이 체크리스트와 섞임 | Goal 이 최상단 + 검증 기준 분리 + "Done = ?" 명시 |
| /cc 핸드오프 시 단순 요청 전달 | Goal + 성공 기준 + Trigger 매핑까지 구조화 페이로드로 전달 |
| /cc 가 step 완료 시 done 보고 | /cc 가 SUCCESS_CRITERIA 전부 yes 되기 전엔 done 차단 |

만약 이 문서가 읽힐 만하고 작업의 "어디서 막히면 어디로 갈지 + 무엇이 되어야 끝인지" 가 명확하다면, 신규 구조가 기존보다 낫다는 1차 증거다.
