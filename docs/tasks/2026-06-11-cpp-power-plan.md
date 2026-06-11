---
plan_id: plan_cpp_power_plan_v3150
date: 2026-06-11
planner: cpp
target_version: v3.15.0
status: approved
---

# /cpp (Lens Power Plan) 신설 — 빌드레디 심층 계획 엔진

> 이 문서 자체가 `/cpp`의 출력 견본이다. 고정된 것은 🎯목표·📜Constitution·✅검증·🛠실행·진행상황(spine)뿐, 나머지는 주제(=skill 설계)에 맞춰 구성했다.

## 🎯 목표 — 무엇이 가능해지는가 (사용자 입장)

이 작업이 끝나면 가능해지는 것:

- 사용자가 `/cpp <요청>`을 입력하면, **그대로 실행만 하면 완성품이 나오는** 계획서를 받는다. 받은 뒤 되묻기가 **0번**이 되도록.
- 그 계획서는 항상 맨 앞에 **"이게 끝나면 당신이 무엇을 할 수 있게 되는가"**(사용자 언어, 기술 토큰 금지)를 박는다.
- `/cpp`는 정해진 틀을 기계적으로 채우지 않는다. 주제가 UI면 ASCII 와이어프레임+요소별 스펙을, API면 계약서를 — 주제에 맞는 깊이로 낸다.
- **Codex와의 교차 협의가 반드시 거쳐진다** (양보 불가). 미감지 시 조용히 진행하지 않고 정지·보고한다.
- 기존 `/cp`는 그대로 둔다. 가벼운 계획은 `/cp`, "끝장 계획"은 `/cpp`.

🎬 **사용 장면**: 사용자가 `/cpp 리턴즈 ERP 검수 승인 화면 만들어`를 입력 → 화면에 무엇이 어디에 어떤 상태(빈/로딩/에러)로 보이는지·문구·데이터 바인딩·반응형·파일별 변경까지 그려진 계획서를 받고, 추가 질문 없이 `/cc`로 넘겨 구현한다.

**완료의 정의 (Done = ?):**

> 임의의 실전 요청을 `/cpp`에 넣었을 때, 나온 계획서를 제3자/새 세션이 추가 질문 0회로 그대로 구현해 의도한 결과물이 나오고, 그 과정에서 Codex 교차 협의 흔적이 문서에 남아 있다.

## ✅ 검증 — 됐다는 증거 (EARS 표기)

| # | EARS 검증 | 확인 방법 | 통과 판정 | 종류 |
|---|-----------|----------|----------|------|
| 1 | WHEN 새 세션 시작, THEN 인벤토리는 `/cpp`를 SHALL 표시 | `skills/cpp/SKILL.md` 존재 + SessionStart 스캔 | 목록에 `/cpp` | auto |
| 2 | WHEN /cpp가 목표를 출력, THEN 목표 문장은 기술 토큰을 0개 SHALL 포함 | 생성 계획서 목표 섹션 검사 | 함수/HTTP/SQL/경로 0 | auto |
| 3 | WHEN UI 요청, THEN 산출물은 와이어프레임+요소스펙+상태+문구를 SHALL 포함 | UI 샘플 1건 실행 | 4요소 존재 | manual |
| 4 | WHEN Codex 미감지, THEN /cpp는 진행을 SHALL 정지하고 보고 | SKILL.md Codex 게이트 검사 | 정지·보고 명시 | auto |
| 5 | WHEN 릴리즈 tag 푸시, THEN 재설치 cache는 cpp/를 SHALL 포함 | `~/.claude/plugins/cache/.../skills/cpp/` | 디렉토리 존재 | auto |
| 6 | WHEN 빌드 완료, THEN /cp·board·/cc 핸드오프는 회귀를 0 SHALL 발생 | 기존 동작 점검 | 회귀 0 | auto |

## 📜 Constitution — 불변 조항 (이 작업의 양보 불가 원칙)

1. **Goal-Locked**: 목표는 사용자 언어. 약하면 승인 거부. (`/cp` v3.8 계승)
2. **Codex 양보 불가**: 교차 협의는 하드 필수. 미감지 = 정지·보고 (graceful-degrade 금지).
3. **Surgical**: `/cp`·`lib/*`·기존 skill 무수정. `/cpp`는 신규 폴더로 격리.
4. **Body-Adaptive**: 불필요한 의식 섹션 금지. spine 외엔 주제가 구조를 정한다.

## 🔬 벤치마크 근거 (인기 스킬 4종 → 채택)

- **A. Constitution(불변조항)** ← GitHub Spec Kit `constitution.md`
- **B. Clarify-to-Zero(사전 모호성 제거)** ← Spec Kit `/clarify`
- **C. 교차일관성 게이트(Codex)** ← Spec Kit `/analyze` + `/cp` 듀얼트랙 격상
- **D. EARS 검증** ← AWS Kiro
- **E. 의존성 wave + 10–20분 태스크 사이징** ← Kiro waves
- **F. 빌드레디 태스크 포맷(경로+변경+검증)** ← obra Superpowers writing-plans
- 미채택: BMAD 다중 페르소나(과함), 별도 CLI(Lens는 이미 플러그인), 7-커맨드 분리(`/cpp`는 단일 명령)

## 🏗 /cpp 9스테이지 파이프라인 (= SKILL.md 골격)

```
S0 🎯 Goal + 🎬 사용장면 + 📜 Constitution (LOCKED)
S1 Clarify-to-Zero       — 모든 모호함 사전 해소, [?] 0 게이트
S2 전방위 Fan-out 조사    — Task 도구로 6축 병렬 서브에이전트
S3 Body-Adaptive 딥스펙   — 도메인 라우터 (UI→ASCII 와이어프레임)
S4 Codex 교차 협의·합성   — 양보불가 하드게이트, /analyze식 일관성검사
S5 빌드레디 태스크 플랜    — 경로+변경+검증+[P]+의존, 10–20분 단위
S6 ✅ EARS 검증           — WHEN/THEN/SHALL
S7 Self-Check 게이트       — "되묻기 0?" 체크리스트
S8 Approve → /cc 핸드오프  — 기존 프로토콜 재사용 + /goal 라인
```

**6축 조사(S2)**: ①코드현실 ②선행/유사사례 ③도메인정석(context7/deep-research) ④데이터·계약 ⑤엣지·실패 ⑥통합·파급

**도메인 라우터(S3)**:
| 도메인 | 딥스펙 |
|---|---|
| UI/화면 | 컴포넌트 인벤토리·요소별 내용(문구)·상태(빈/로딩/에러/성공)·**ASCII 와이어프레임**·인터랙션·데이터바인딩·반응형 |
| API/백엔드 | 엔드포인트 계약·스키마·에러분류·시퀀스(mermaid)·마이그레이션 |
| 리팩토링 | before/after·이동지도(파일·심볼)·불변식 |
| 콘텐츠/문서 | 아웃라인·섹션별 비트·acceptance 체크리스트 |
| 운영/인프라 | 변경전후·dry-run·롤백 |

## 🛠 빌드레디 실행 (파일 단위 — cps 등록 흔적 전수 추적 근거)

자동 등록: `plugin.json`의 `"skills": "./skills/"` → `skills/cpp/SKILL.md` 폴더만 생성하면 세션 인벤토리 자동 등장 (cps가 hooks/scripts에 하드코딩 0건인데도 인벤토리에 뜸으로 확정).

- [ ] **S1** `skills/cpp/SKILL.md` 신규 작성 — 배너 "Lens Power Plan v3.15.0", 9스테이지 → verify: 파일 존재 + 배너
- [ ] **S2** `scripts/bump-version.sh` — cpp 배너 sed 라인 추가 + 검증목록 추가 + `11→12` → verify: `bump-version.sh 3.15.0` 후 cpp 배너 갱신
- [ ] **S3** `CLAUDE.md` — Skills 표에 `/cpp` 행 + v3.15.0 feat 노트 → verify: grep cpp
- [ ] **S4** `README.md` — skills 섹션 `/cpp` 1줄 → verify: grep cpp
- [ ] **S5** `scripts/bump-version.sh 3.15.0` 실행 + CHANGELOG v3.15.0 채움 → verify: `Files with v3.15.0: 12/12`, stale 0
- [ ] **S6** commit + `git tag v3.15.0` + `git push origin master --tags` → verify: 원격 태그 존재
- [ ] **S7** `/lens-upgrade`(또는 재설치) → verify: cache `.../skills/cpp/` 존재

플랜매니저/`/cp` 무수정 (surgical). /cpp 문서는 직접 작성 + `board-builder.js` 재사용. 단, done-sweep이 `## Plan A` 부재로 cpp 문서를 "수동확인필요"로 분류할 수 있음 → 안전한 degrade, v2에서 마커 인식 보강 예정.

## ⚠️ 리스크 (이 작업에 실제로 중요한 것만)

- **R1(높음) 깊이≠장황**: power가 토큰폭발로 변질 → TL;DR 의무화 + "불필요 섹션 금지" 게이트를 SKILL.md에 명시. 깊이=정보밀도지 분량 아님.
- **R2(중간) Codex 하드게이트 과강성**: Codex 일시 다운 시 전면 정지가 불편 → 기본은 정지·보고, 사용자가 1회성으로 명시 우회 가능하게 문구화.
- **R3(낮음) bump 누락**: cpp 배너 stale → S2에서 즉시 반영(체크리스트 강제).

## 진행상황

- **마지막 업데이트**: 2026-06-11
- **현재 경로**: 빌드 진행 중 (S1 SKILL.md)
- **재개 포인트**: SKILL.md 작성 → 등록 → 버전 bump → 릴리즈
