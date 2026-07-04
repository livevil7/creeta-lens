---
planner: cp
plan_id: cp-flow-and-harness-rules
date: 2026-07-04
refs: []
---

# Lens 3.23.0 통합 업그레이드 — `/cp flow` 신설 + Fable 하네스 규칙 이식

> 워크스트림 A: 어떤 프로젝트에서든 `/cp flow` 한 번으로 "이용자 단계별 화면 ↔ 받치는 엔진/모듈 ↔ 종속·재사용 관계"를 한 장의 인터랙티브 플로우차트로 그려 Rule 로 저장한다.
> 워크스트림 B: 공개된 Fable 5 시스템 프롬프트 추출본(asgeirtj/system_prompts_leaks)에서 하네스 규칙을 선별해 Lens 스킬들(/c·/cc·/ccp·/cp·/cpp·/cr)에 **쪼개서** 이식한다.

## 🎯 What — 목표 (사람 언어)

**이 작업이 끝나면 가능해지는 것:**
- **[A]** 어떤 프로젝트에서든 `/cp flow`를 실행하면, 그 서비스의 **이용자 관점 단계별 화면/구성 → 그 화면들을 뒤에서 받치는 엔진/모듈 → 서로의 종속·재사용 관계**를 한 장의 그림으로 볼 수 있다. 그 그림은 프로젝트의 **규칙(Rule) 문서로 저장**되어 사람이든 Claude든 전체 그림을 먼저 보고 시작할 수 있고, board 에서 카드로 열람되며, 낡으면 낡았다는 표시가 뜬다.
- **[B]** Lens 의 각 스킬이 실행하는 워커·감독·QA·리서치가, 최신 Claude Code 하네스(Fable 5 세대)가 자기 에이전트에게 강제하는 것과 같은 수준의 **작업 규율**(정직 보고·끝까지 실행·검증 패턴·오케스트레이션 패턴)을 따르게 된다 — 각 스킬의 역할에 맞는 규칙만 골라서.

**완료의 정의 (Done = ?):**

> Lens 3.23.0 설치 후, ① 임의 프로젝트에서 `/cp flow` 실행 시 docs/rules/ 에 플로우 문서+인터랙티브 그림이 생겨 브라우저에서 한눈에 보이고, ② 여섯 개 스킬 본문에 역할별 하네스 규칙 섹션이 들어가 있으며 그 원본 인벤토리가 rules 문서로 존재한다.

## ❓ Why — 왜 해야 하는가

- **[A] 푸는 문제**: 프로젝트가 커질수록 "전체 그림"(단계·화면·엔진·종속·재사용)이 소유자 머릿속에만 있다. 매 세션·협업자가 재파악하는 비용이 반복 발생. understand-anything 은 범위가 넓고 산출물 품질이 실사용 수준이 아니다. livevil-boost 에 수작업으로 만든 flow.html 이 정확히 원하는 형태 — 이걸 스킬화해 모든 프로젝트에 재사용한다.
- **[B] 푸는 문제**: Fable 5 세대 Claude Code 하네스에는 에이전트 작업 품질을 끌어올리는 정제된 규칙이 대거 들어갔다(정직 보고, 턴 종료 규율, adversarial verify, pipeline 오케스트레이션 등). Lens 워커/감독/QA 프롬프트는 Karpathy 4규칙까지만 반영된 상태 — 이 격차를 지금 흡수하면 Lens 가 배포하는 모든 워커의 품질이 한 번에 오른다. 공개 추출본이 정리된 지금이 이식 적기.
- **안 하면**: [A] 세션마다 전체 그림 재구성 비용, 설계 어긋남(모듈 중복 개발·종속 파악 실패), Rule 부재로 세션마다 제각각 판단. [B] 워커의 완료 과대보고·중간 멈춤·침묵 모니터 같은 고질 문제가 스킬 지침 부재 상태로 지속.
- **누구를 위해**: 사용자 본인 + 매 세션의 Claude + 이후 협업자.

## 🧰 실행 전략 & 자원

- **난이도**: medium~large — 코드 로직은 거의 없음(본체는 SKILL.md 설계 + 템플릿 + rules 문서). 파일 수가 많아짐(A: 템플릿 2 + SKILL 1 + 문서 3 / B: rules 1 + SKILL 6). 1~2일.
- **권장 모델**: 현 세션(Fable) — 스킬 본문·규칙 선별이 언어 설계 작업.
- **병렬 실행**: 조사 단계는 병렬 에이전트 2개로 **이미 완료**(하네스 규칙 인벤토리 확보). 적용 단계는 단일 순차 — 같은 SKILL.md 들을 건드려 병렬 이득 없음.
- **활용 스킬**: 검증에 Playwright MCP(flow.html 렌더). 문서 규칙은 기존 lens 컨벤션.
- **기존 자원·시스템**:
  - `livevil-boost/docs/design/dashboard/flow.html` — 뷰어 껍데기(다크 테마·legend·zoom/pan·Mermaid 11 ESM·클릭 링크)를 일반화해 템플릿으로.
  - `lib/board-builder.js` — 이미 `docs/rules/` 스캔·md+html 쌍·stale 해시. **수정 불필요, 재빌드만.**
  - `templates/plan.template.md`+`report-plan.example.html` 쌍 패턴 — flow 도 동일 패턴.
  - **하네스 규칙 인벤토리 (조사 완료)** — Claude Code 2.1.172 Fable 프롬프트 8카테고리(커뮤니케이션/턴종료/정직보고/도구/오케스트레이션/코드/계획/기타) + claude.ai Fable 프롬프트(글쓰기/리서치/계획/도구) + fable-prompts 적응 방법론(Lossless Transformation·additive-only 교훈). 원문 로컬 사본: scratchpad `cc-fable-prompt.md`·`fable-ai-prompt.md`.
  - `scripts/bump-version.sh` — 11곳 일괄 버전 갱신 + tag 릴리즈.

## 🛠 How — 어떻게 (Plan A / Plan B)

### Plan A — 권장 경로

#### 왜 이게 1순위인가
- **[A]** lens 확립 원칙 "md = SoT, HTML = 파생 뷰" + 기존 CONVERT(`/cp html`) 라우팅 패턴을 그대로 타면 신규 코드 없이 SKILL.md 지침 + 템플릿만으로 완성 (Simplicity First). board-builder 가 이미 `docs/rules/` 를 스캔하므로 board 통합이 공짜. 분석을 결정론 스크립트가 아닌 **Claude 의미 분석 + 실제 파일 근거 규율**로 두면 스택 무관 범용성이 나오고, "이용자 단계 × 받치는 엔진" 2층으로 스코프를 고정해 understand-anything 식 범위 폭발을 막는다.
- **[B]** **Additive-only 이식 원칙** (fable-prompts 의 Cline 교훈을 Lens 에 적용): Claude Code 위에서 도는 Lens 는 하네스가 **이미 강제하는** 규칙(병렬 호출, 전용 도구 우선 등)을 재복붙하지 않는다 — 토큰 낭비 + 중복. 이식 가치가 있는 것은 ① **워커 디스패치 프롬프트**(서브에이전트에서 준수가 약해지는 규칙의 재강조), ② 하네스가 강제 못 하는 **Lens 특화 지점**(모니터 필터, 보고 템플릿, Codex 호출, 승인 게이트), ③ 자주 위반되는 규칙의 **3중 반복**(규칙 본문+self-check+위반 결과 — 원문 스타일의 drift 저항 구조). 전량 복붙이 아니라 역할별 선별이 곧 품질이다.

#### 단계 — 워크스트림 A: `/cp flow`
- [ ] **T1. 템플릿 2개 추가** — verify: 두 파일 존재 + placeholder 문서화
  - `templates/flow.template.md`: frontmatter(`doc_kind: flow`, `updated`, `scope`) + ① 단계 정의 표(단계·화면/구성·목적) + ② 모듈 인벤토리 표(모듈·역할·코드 경로·사용하는 단계 = 재사용 가시화) + ③ mermaid 코드블록(원본) + ④ 근거 각주(추정 노드는 `(추정)` 표기).
  - `templates/flow-viewer.example.html`: livevil-boost flow.html 일반화 — 타이틀/legend/단계 바/mermaid 소스만 치환 지점, zoom·pan·클릭 스크립트 유지. `<head>` 에 `lens:source`/`lens:source-hash`/`lens:builder=lens-cp-flow` 메타(board stale 감지 호환).
  - **디자인 SoT (사용자 지시 2026-07-04)**: 뷰어는 `livevil-setting/design/05-dark-developer/design.md` 토큰(색·헤어라인 보더·타이포 스케일·radius·모션·인디고 단일 강조)을 준수해 생성. 폰트만 한국어 커버리지를 위해 Pretendard 유지(Inter 대체 — 편차 사유 명기). 토큰은 템플릿에 임베드(타 머신에 livevil-setting 부재 대비).
- [ ] **T2. `skills/cp/SKILL.md` 에 FLOW 모드 신설** — verify: 라우팅 표에 `/cp flow` 명시
  - 라우팅: `/cp flow [scope]` → FLOW 모드 (`flow` 는 예약어. 단 `flow` 뒤에 자연어 문장이 붙으면 PLAN 모드로 해석).
  - **F1 스캔**: CLAUDE.md·docs/rules·README → 엔트리포인트(라우트/페이지/화면/CLI/대시보드)·백그라운드 잡·외부 시스템 수집. **실제 파일만 근거** — 근거 없는 노드는 `(추정)` 표기 의무.
  - **F2 2층 추출 + 관계 매핑**: (a) 이용자 관점 단계 — 화면/명령 사용 순서를 ①~⑦ 시나리오로, 핵심 화면(★)·키 개입 구분. (b) 엔진/모듈 층 — 각 화면을 받치는 서비스·잡·저장소·외부시스템을 SYS subgraph 로. 관계: 진행=실선, 받침/종속=점선, 재사용=한 모듈←여러 단계 점선, 피드백 루프.
  - **F3 md SoT**: `docs/rules/flow.md` (템플릿 기반). 기존 파일 있으면 **diff 요약 후 덮어쓰기 승인**.
  - **F4 HTML**: `docs/rules/flow.html`. click 링크는 **실존 확인된 파일만**.
  - **F5 board 재빌드** + 산출물 풀 경로 보고.
- [ ] **T3. CONVERT 모드 가드 (Codex 발견 함정)** — verify: CONVERT 절에 분기 명시
  - `/cp html <path>` 가 frontmatter `doc_kind: flow` 감지 시 task 6-slide 양식이 아니라 **flow 뷰어로 재생성**. (미가드 시 flow.html 이 task 덱으로 덮이는 사고.)

#### 단계 — 워크스트림 B: 하네스 규칙 이식
- [ ] **T4. `docs/rules/harness-rules.md` SoT 신설** — verify: 파일 존재 + 스킬 매핑 표 포함
  - 조사된 인벤토리를 **재서술**(원문 문구 복붙 금지 — 라이선스·정확성 리스크 회피)로 정리: 규칙명 + 실질 로직 + 적용 스킬 매핑 표 + 기준 버전(Claude Code 2.1.172 추출본, 비공식) 명시.
  - **Additive-only 판정 기준** 명문화: "Claude Code 하네스가 이미 강제하는가? → yes 면 스킬에 안 넣는다(워커 프롬프트 재강조 예외)."
- [ ] **T5. 스킬별 발췌 인라인 (쪼개서 반영)** — verify: 6개 SKILL.md 각각에 규칙 섹션 존재
  - **/c + /cc (워커 디스패치 프롬프트에 삽입)**: 자율 실행(되묻기 차단 + 마지막 문단 검사 — 워커가 "할까요?" 로 멈추는 것 방지) / 결과 충실 보고(실패는 실패라고, 헤징 금지) / 완료 마킹 엄격 기준(FULLY 만 completed) / 구조화 보고(최종 메시지 완결성 — 워커 최종 보고에 결론 선행) / 상태 변경 명령 전 증거 검사.
  - **/c + /cc (Leader·Monitor 절에 삽입)**: 워커 결과 릴레이 의무(사용자에게 재서술) / **모니터 필터 "침묵은 성공이 아니다"**(모든 terminal state 매치 — Monitor agent 지침 직결) / 위임 후 중복 작업 금지 / 에이전트 재사용(SendMessage 연속성).
  - **/cc (오케스트레이션 절)**: pipeline 기본·barrier 정당화 / 하이브리드 스카우팅(정찰 후 fan-out) / 요청 규모 스케일링("빨리" vs "철저히") / loop-until-dry(발견형 작업).
  - **/ccp (QA 파이프라인)**: adversarial verify 강화("불확실하면 refuted=true 기본") / perspective-diverse 4렌즈(기존과 합치 확인) / **완결성 비평가**(P6 전 "빠진 것" 검사 신설) / 침묵 캡 금지(top-N 잘랐으면 명시) / self-check 패턴(산출 직전 yes/no 목록).
  - **/cp + /cpp (계획)**: elicitation gate(묻기 전 대화·코드에서 자체 확인, 질문 1개 지향·3 ceiling — S1 Clarify 와 합치) / 계획 승인 = 전용 게이트(요구사항 질문은 승인 전에 끝냄, 승인 질문에 섞지 않음) / 충분하면 행동·재논의 금지.
  - **/cr (리서치)**: Unrecognized Entity Rule(모르는 대상은 답 전 무조건 검색) / effort scaling(단순 1회·중간 3~5·심층 5~10) / snippet 불신·전문 fetch / 출처 위계(원출처>2차) + SEO 오염 영역 선택적 회의주의 / "없음" 과신 금지.
  - **공통 보고 규칙 (각 스킬 보고 절)**: 결론 선행 / 가독성>간결성(단편·화살표 체인 금지 — 원칙 0 과 합치) / 내부 기제 내레이션 금지 / 산출물 링크 후 긴 후기 금지.
  - 스킬당 추가 상한 **~40줄** (비대화 방지 — 상한 초과 시 harness-rules.md 참조 포인터로 대체).
- [ ] **T6. 충돌 심사 + 해소 기록** — verify: harness-rules.md 에 충돌 해소 절 존재
  - Lens **모델 할당 테이블** vs 원문 "모델 오버라이드 절제" → Lens 할당은 명시적 확신 케이스로 정당(유지), 단 "불확실하면 상속" 문구 보강.
  - Lens **AskUserQuestion 필수 게이트**(승인) vs 원문 "되묻기 차단" → 승인 게이트는 파괴적/스코프 결정이라 원문 예외에 해당(유지). 그 외 중간 질문만 차단.
  - Lens **5분 진행보고** vs 원문 "푸시 알림 절제" → 진행보고는 대화 내 한 줄이라 충돌 아님(유지).

#### 단계 — 공통 마무리
- [ ] **T7. 문서 갱신** — verify: 3개 파일 반영
  - `CHANGELOG.md` 3.23.0(A+B), `README.md` 스킬 표, `docs/START_HERE.md`.
- [ ] **T8. 릴리즈** — verify: tag push + 설치 확인
  - `scripts/bump-version.sh 3.23.0` → commit → **tag 3.23.0 push** (marketplace `source.ref`=태그 함정) → `claude plugin update lens@CreetaCorp`.
- [ ] **T9. 실전 검증 (dogfood)** — verify: ✅ 검증 표 통과
  - [A] livevil-boost 에서 `/cp flow` → 산출물 2개 + Playwright 렌더 + board 카드 + 수작업 원본과 품질 비교.
  - [B] `/c` 소형 작업 1회 스모크 → 워커 최종 보고가 결론 선행 + 충실 보고 형식인지 확인.

#### 막힐 수 있는 지점 (→ Plan B 트리거)
- **F2 노드 폭발**: 큰 레포에서 노드 50+ → Mermaid 렌더 붕괴·가독성 상실 → Plan B-1.
- **F2 이용자 단계 추출 실패**: 화면 없는 순수 백엔드/라이브러리형 → 단계 개념 안 잡힘 → Plan B-2.
- **`flow` 라우팅 오인**: `/cp flow` 가 PLAN 모드로 새 task 문서 생성 → T2 예약어 명시로 예방.
- **T5 스킬 비대**: 40줄 상한 초과 스킬 발생 → Plan B-3.

### Plan B — Fallback 경로

#### Trigger
- **B-1**: 단일 다이어그램 노드 50+ 또는 Mermaid 렌더 실패 시.
- **B-2**: 이용자 단계가 2개 미만으로 추출될 때.
- **B-3**: T5 인라인이 스킬당 40줄을 넘거나, 스모크에서 규칙 미준수(희석)가 관찰될 때.

#### 왜 이 대안인가
- B-1(계층 분할)은 한 장의 개관성을 일부 희생하고 렌더 안정성·가독성 확보 — 메인+드릴다운 구조라 "한눈에"는 메인 층에서 유지.
- B-2(단계 인터뷰)는 자동성을 희생하고 잘못된 추론이 Rule 로 굳는 최악 실패를 방지.
- B-3(포인터화)은 인라인 즉효성을 희생하고 컨텍스트 무게·규칙 희석을 방지 — 스킬엔 5줄 요약+참조만, 본문은 harness-rules.md.

#### 단계
- [ ] **B-1**: flow.md mermaid 를 복수 블록 분할 — 메인(단계 층) + 단계별 드릴다운(모듈 층). flow.html 은 같은 뷰어에 탭/섹션 렌더.
- [ ] **B-2**: AskUserQuestion 으로 주요 단계 3~7개 인터뷰 → 뼈대에 모듈 매핑만 자동.
- [ ] **B-3**: 해당 스킬의 규칙 섹션을 "핵심 5줄 + `docs/rules/harness-rules.md` 참조"로 축약. 단 워커 디스패치 프롬프트 내 규칙은 축약 불가(워커는 파일 접근 보장 없음) — 워커용은 문구 자체를 더 압축.

### 🔀 듀얼 합성 (Claude ‖ Codex — 워크스트림 A)

**합의 (고신뢰):**
- FLOW = `/cp html` CONVERT 패턴의 **명시 인자 모드**. 산출물 = `docs/rules/flow.md`(SoT)+`flow.html`(파생 뷰)+`lens:source*` 메타. **board-builder 수정 불필요.** 분석은 실제 파일 근거 + 2층 + 종속·재사용 매핑. Mermaid 대형 그래프가 1차 리스크.

**분기 → 해소:**
- **템플릿 구성**: Claude=뷰어 1개 / Codex=md+html 쌍 → **채택=Codex 안** (레포 기존 패턴이 md template + html example 쌍. md=SoT 원칙상 md 템플릿이 본체).
- **CONVERT 충돌 가드**: Codex 가 발견한 함정 (docs/rules/ md 가 "task 양식 기본 적용"으로 변환돼 flow 뷰어가 6-slide 덱으로 덮임) → **채택** (T3, `doc_kind: flow` 분기).
- **추정 노드 표기**: Codex 제안 → **채택** (F1 규율 병합 — 오추론의 Rule 화 완화).
- **board FLOW badge**: Codex 제안(선택) → **보류** (Simplicity First).

*워크스트림 B 는 Codex 병렬 조사 대신 병렬 리서치 에이전트 2개(Claude Code 프롬프트 / claude.ai 프롬프트+적응 방법론)로 독립 조사 수행 — 소스가 코드가 아닌 문서라 Codex 코드분석의 이점이 없음.*

### ⚠️ 사전 리스크 (Pre-mortem)

#### Claude (Fable, 세션 컨텍스트 기반 — 현 세션 모델이 Opus 급 이상이라 직접 수행)

1. **[A] 범용 방법론의 프로젝트별 품질 편차** — 화면 있는 서비스(livevil-boost)는 잘 뽑히지만, CLI+대시보드 혼합(returns-bidding)·설정 레포(livevil-setting) 류에서 "이용자 단계"가 억지로 생성될 수 있음. 이질 프로젝트 1개를 추가 dogfood 대상으로 권고.
2. **[A] stale 감지의 실효 한계** — board 해시는 **md↔html 불일치**만 감지한다. 코드가 바뀌어도 flow.md 가 안 바뀌면 낡음 표시가 안 뜸. "낡으면 표시" 목표는 md-html 계층에서만 참 — flow.md frontmatter `updated` + 재실행 권고 문구로 한계를 명시하고 과장하지 않는다.
3. **[A] `/cp` 스킬 본문 비대** — FLOW 절 추가로 cp/SKILL.md 가 더 무거워짐. FLOW 절은 압축 서술(방법론 핵심만), 뷰어 세부는 템플릿 파일에 위임.
4. **[B] 규칙 희석** — 워커 프롬프트가 Karpathy 4규칙 + 하네스 규칙 + 태스크 지시로 길어지면 중요 신호가 묻힘. 40줄 상한 + 기존 규칙과 중복되는 항목은 병합(신설 아님) + 위반 관찰 시 B-3 포인터화.
5. **[B] 추출본 부정확·버전 드리프트** — 소스는 비공식 추출본이고 Claude Code 버전업마다 하네스 내장 규칙이 바뀜. 재서술 + 기준 버전(2.1.172) 명시 + 이후 `/crv` 감사에서 재대조.
6. **[B] 스모크 검증의 주관성** — 검증 6(워커 보고 형식)은 manual 1회 관찰. 판정을 "① 첫 문장이 결과 서술인가 ② 실패/스킵이 있으면 명시됐는가" 2항 체크리스트로 고정해 자의성 축소.

#### Codex 관점
Phase 0.5 듀얼트랙 기수행으로 skip (v3.9 중복 회피) — Codex 의 리스크 시각(CONVERT 덮어쓰기 함정, Mermaid/CDN 렌더 실패, 빈약한 문서에서 추론이 SoT 오염)은 🔀 듀얼 합성에서 이미 Plan 에 반영됨.

#### Trigger 매핑 (Pre-mortem → Plan B 전환점)
- 리스크 1 → **B-2**(단계 인터뷰) 트리거와 매핑됨.
- 리스크 4 → **B-3**(포인터화) 트리거와 매핑됨.
- 리스크 2·5 는 Plan B 불요 — 한계 명시·주기 재대조로 처리 (⚠️ 주의점에 반영).
- Blocker 키워드(보안 치명·data loss·비가역) 없음 — 정상 승인 게이트 진행.

## 💡 시사점 · ⚠️ 주의점 · 🔀 Side Effect

- **💡 시사점**: [A] flow.md 가 Rule 이 되면 이후 `/cp`·`/cc` 계획에 "전체 그림 대조"(계획이 flow 의 어느 단계·모듈을 건드리나 자동 표기)를 붙일 토대가 생김. understand-anything 의존 제거. [B] harness-rules.md 는 이후 Claude Code 버전업 때마다 `/crv`(self-modernization audit)가 재대조할 기준선이 됨 — 일회성 이식이 아니라 지속 동기화 채널.
- **⚠️ 주의점**: ① 잘못 추출된 flow 가 Rule 로 굳으면 이후 세션 오염 — `(추정)` 표기+승인 게이트가 방어선. ② 사용자가 손으로 고친 flow.md 를 diff 승인 없이 덮지 않음. ③ Mermaid 11 ESM+Pretendard CDN 의존(오프라인 미지원) — 기존 lens HTML 과 동일한 수용 리스크. ④ [B] 출처는 **비공식 추출본** — 정확성·최신성 보증 불가. 원문 문구를 그대로 이식하지 않고 원칙을 재서술(라이선스·정확성 동시 회피), 기준 버전 명시. ⑤ [B] 규칙 과다는 역효과(희석) — additive-only + 40줄 상한 엄수.
- **🔀 Side Effect (파급)**: ① `skills/cp/SKILL.md` 본문 증가(FLOW 절) + 6개 SKILL.md 각 +수십 줄 — 스킬 로드 컨텍스트 무게 증가(상한으로 관리). ② `/cp` 라우팅에 `flow` 예약어 — "flow" 시작 일반 요청과 구분 규칙 필요. ③ board rules 그룹 카드 +1. ④ report-conversion-spec.md 판별이 3분기(cpp/폴더/doc_kind)로 증가. ⑤ 워커 디스패치 프롬프트가 길어져 워커 1회 호출 토큰 증가 — 압축 서술로 완화.

## ✅ Review — 검증 (증거 + 어떻게 검증할지)

**검증 전략**: [A] livevil-boost 실제 실행 — 파일 생성 `ls`/`grep`(auto), 렌더는 **Playwright 로 file:// 열어 svg 확인**(auto), 추출 품질은 수작업 원본과 비교(manual). [B] SKILL.md 규칙 섹션은 grep(auto), 행동 변화는 `/c` 소형 스모크로 워커 보고 형식 관찰(manual). 결과는 대화에 명령 출력으로 남기고 최종 보고에 산출물 풀 경로 링크.

| # | 목표가 됐다는 신호 | 확인 방법 (명령/관측) | 통과 판정 | 종류 |
|---|------------------|----------------------|----------|------|
| 1 | [A] FLOW 산출물 생성 | livevil-boost 에서 `/cp flow` 후 `ls docs/rules/flow.*` | flow.md + flow.html 존재 | auto |
| 2 | [A] 인터랙티브 렌더 정상 | Playwright 로 flow.html 열기 → `.mermaid svg` 존재 + #err 미표시 | svg 렌더, 에러 없음 | auto |
| 3 | [A] board 카드 노출 | `grep -c "flow" docs/board_livevil-boost.html` | ≥1 | auto |
| 4 | [A] 추출 품질 2층 | 생성 flow vs 수작업 원본(design/dashboard/flow.html) 비교 | 단계 층·엔진 층·점선 종속 존재, 치명적 오추출 없음 | manual |
| 5 | [B] 규칙 SoT + 6스킬 반영 | `ls docs/rules/harness-rules.md` + `grep -l "하네스 규칙" skills/*/SKILL.md \| wc -l` | 파일 존재 + 6 | auto |
| 6 | [B] 워커 행동 반영 | `/c` 소형 작업 스모크 → 워커 최종 보고 관찰 | 결론 선행 + 실패/스킵 명시 보고 | manual |
| 7 | 릴리즈 반영 | `claude plugin update lens@CreetaCorp` 후 버전 | 3.23.0 | auto |
| 8 | [A] CONVERT 가드 | `/cp html docs/rules/flow.md` 실행 | task 덱 아닌 flow 뷰어로 재생성 | auto |

## 진행상황
- **마지막 업데이트**: 2026-07-04
- **현재 경로**: Plan A (완주 — Plan B 미발동)
- **Goal 달성**: 3/3 ✓ (검증 auto 6/6 pass + manual 1건은 사용자 피드백 반영 재생성으로 해소)
- **릴리즈**: v3.23.0 (본편) + v3.23.1 (dogfood 피드백 패치 — F2 단계 층=화면 단위 강제, click HTML 전용, mermaid 라벨 가드, 단수 rule 폴더, 근거 범위)
- **재개 포인트**: 완료 — `/cp done` 으로 History 전환 권장. 후속 아이디어(보류): board FLOW badge, loop-until-dry cc 반영, CHANGELOG 의 빈 [3.22.0] 중복 헤더 정리
