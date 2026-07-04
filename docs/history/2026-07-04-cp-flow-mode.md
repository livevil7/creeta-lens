# Lens 3.23.x 통합 업그레이드 — `/cp flow` 신설 + Fable 하네스 규칙 이식 — 완료

**완료일**: 2026-07-04

## 요약

`/cp flow` FLOW 모드를 신설해 어떤 프로젝트든 "이용자 관점 단계별 **화면** ↔ 받치는 엔진/모듈 ↔ 종속·재사용 관계"를 한 장의 인터랙티브 Mermaid 플로우차트(`docs/rules/flow.md` SoT + `flow.html` 뷰, 05-dark-developer 토큰)로 그려 프로젝트의 Rule 로 저장하게 했다. 동시에 공개 추출본(asgeirtj/system_prompts_leaks 의 Claude Code 2.1.172 Fable 프롬프트)에서 하네스 규칙을 선별·재서술해 `docs/rules/harness-rules.md` SoT + 6개 스킬(c·cc·ccp·cp·cpp·cr)에 역할별로 인라인했다. **v3.23.0**(본편) + **v3.23.1**(dogfood 피드백 패치)로 릴리즈.

## 주요 결정 사항

- **단계 층 노드 = 화면(스크린) 단위 (v3.23.1 — 사용자 반려로 확정)**: 초판 스펙("화면/명령의 사용 순서")이 느슨해 dogfood 산출물이 스크립트/작업 단위로 묶임 → 사용자 반려. F2(a)를 "이용자가 실제로 보는 화면/뷰만 단계 노드, 스크립트·설정·잡·CLI 는 전부 엔진 층으로 강등"으로 강제. 화면 인벤토리는 라우트/템플릿/페이지 파일에서 도출.
- **Additive-only 이식 원칙 (fable-prompts 의 Lossless Transformation 교훈)**: Claude Code 하네스가 이미 강제하는 규칙은 스킬에 재복붙하지 않는다. 예외 3가지 — ① 워커 디스패치 프롬프트(서브에이전트에서 준수가 약해지는 규칙 재강조) ② 하네스가 못 미치는 Lens 특화 지점(Monitor 필터·보고 템플릿·Codex 호출·승인 게이트) ③ 자주 위반되는 규칙의 3중 반복. 스킬당 ~40줄 상한, 삭제 0줄(순수 삽입).
- **출처 취급**: 비공식 추출본이므로 원문 복붙 금지 — 원칙만 재서술 + 기준 버전(2.1.172) 명시 + 이후 `/crv` 감사에서 재대조 채널화. 충돌 3건(모델 할당·승인 게이트·5분 보고)은 전부 Lens 설계 유지로 심사 기록.
- **md = SoT, HTML = 파생 뷰** 유지 + **CONVERT `doc_kind: flow` 가드** (Codex 듀얼트랙이 발견한 함정 — 미가드 시 `/cp html` 이 flow 뷰어를 task 6-slide 덱으로 덮음. `planner: cpp` 확인보다 선행).
- **디자인 SoT**: `livevil-setting/design/05-dark-developer/design.md` 토큰을 뷰어 템플릿에 임베드(타 머신 livevil-setting 부재 대비). 폰트만 한국어 커버리지로 Pretendard 유지(편차 명기).
- **mermaid 점선 라벨 가드** (dogfood 실측 버그): `-.라벨.->` 은 라벨 안 `.`·`-` 에서 lexical error → `-.->|"라벨"|` 형식만.

## 변경 파일

- 신규: `templates/flow.template.md`, `templates/flow-viewer.example.html`, `docs/rules/harness-rules.md`
- 수정: `skills/cp/SKILL.md`(FLOW 모드 42줄 + 라우팅 예약어 + CONVERT 가드 + 규칙 8줄), `skills/c/SKILL.md`(+20), `skills/cc/SKILL.md`(+27), `skills/ccp/SKILL.md`(+16), `skills/cpp/SKILL.md`(+12), `skills/cr/SKILL.md`(+14), `CHANGELOG.md`, `README.md`, `CLAUDE.md`, `docs/START_HERE.md`
- dogfood 산출물(livevil-boost 레포, commit `1bf78f2`): `docs/rules/flow.md`, `docs/rules/flow.html`, `docs/board_livevil-boost.html`
- 릴리즈: creeta-lens `f3120e2`(v3.23.0 tag) + v3.23.1 tag, 로컬 플러그인 3.23.1 설치

## 테스트 & 검증

- Supervisor(실파일 재검증) 92/100 pass — 워커 5개 산출물 + 통합성(하네스 블록이 디스패치 프롬프트 코드펜스 **안**에 위치함을 펜스 짝 분석으로 확정). Codex 리뷰는 180초 내 판정 미산출로 미완 → Supervisor 단독 게이트로 degrade(정직 기록).
- QA 검증표 auto 6/6 pass: 산출물 존재(ls) / Playwright 실렌더(svg=true, err=none — 반려 전 21노드, 재생성 후 24노드) / board 카드(stale=false, 해시 일치) / 6개 스킬 grep 커버 / 설치본 3.23.x 버전 / CONVERT 가드(doc_kind 분기 선행 + 생성 html slide 클래스 0).
- dogfood 2회: 1차(모듈 단위) 사용자 반려 → 스펙 수정 → 2차(화면 단위 — 대시보드 실존 화면 9 + 접점 2 + 엔진 12) 렌더 검증 통과.

## 추가 사항

- 후속 보류: board FLOW badge, loop-until-dry 의 /cc 반영, CHANGELOG 의 빈 `[3.22.0]` 중복 헤더 정리.
- 한계 명시: board stale 은 md↔html 불일치만 감지 — 코드 변경은 `/cp flow` 재실행으로 갱신.
- harness-rules.md 는 Claude Code 버전업 시 `/crv` 재대조 대상.
