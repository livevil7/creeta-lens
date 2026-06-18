# /cpp (Lens Power Plan) 신설 — 빌드레디 심층 계획 엔진 — 완료

**완료일**: 2026-06-11

## 요약

되묻기 0을 목표로 하는 빌드레디 심층 계획 엔진 `/cpp`(Lens Power Plan)를 신설했다. 사용자가 `/cpp <요청>`을 입력하면 그대로 실행만 하면 완성품이 나오는 계획서가 산출되며, 계획서 맨 앞에는 항상 "이게 끝나면 무엇을 할 수 있게 되는가"가 사용자 언어로 박힌다. 9스테이지 파이프라인(목표 잠금 → Clarify-to-Zero → 6축 fan-out 조사 → body-adaptive 딥스펙 → Codex 교차 협의 → 빌드레디 태스크 → EARS 검증 → self-check → /cc 핸드오프)을 SKILL.md 골격으로 구현했고, 기존 `/cp`는 한 줄도 건드리지 않은 채 신규 폴더로 격리했다. v3.15.0으로 배포 완료(commit 247dbc0, tag v3.15.0).

## 주요 결정 사항

- **`/cp` 무수정, 신규 폴더 격리**: 가벼운 계획은 `/cp`, "끝장 계획"은 `/cpp`로 역할을 분리. `/cp`·`lib/*`·기존 skill을 일절 수정하지 않는 surgical 원칙을 Constitution 3번으로 못 박았다.
- **Codex 교차 협의를 양보 불가 하드게이트로**: graceful-degrade를 금지하고, Codex 미감지 시 조용히 진행하지 않고 정지·보고하도록 했다. 다만 Codex 일시 다운의 불편(R2)을 고려해 사용자가 1회성으로 명시 우회할 수 있는 문구를 남겼다.
- **목표는 사용자 언어로 잠금(Goal-Locked)**: 목표 문장에 함수/HTTP/SQL/경로 같은 기술 토큰을 0개로 강제. 약한 목표는 승인 거부(`/cp` v3.8 계승).
- **Body-Adaptive 구조**: spine(목표·Constitution·검증·실행·진행상황)만 고정하고 나머지는 주제가 구조를 정하게 했다. 도메인 라우터로 UI는 ASCII 와이어프레임+요소스펙+상태, API는 계약서를 산출.
- **벤치마크 기반 채택**: Spec Kit(Constitution/clarify/analyze), Kiro(EARS/waves), Superpowers(빌드레디 태스크 포맷)에서 검증된 패턴만 채택. BMAD 다중 페르소나·별도 CLI·7-커맨드 분리는 과함으로 미채택(`/cpp`는 단일 명령).
- **깊이 ≠ 장황(R1)**: power가 토큰 폭발로 변질되지 않도록 TL;DR 의무화와 "불필요 섹션 금지" 게이트를 SKILL.md에 명시. 깊이는 정보 밀도지 분량이 아니다.

## 변경 파일

- `skills/cpp/SKILL.md` (신규) — 배너 "Lens Power Plan v3.15.0", 9스테이지 파이프라인
- `scripts/bump-version.sh` — cpp 배너 sed 라인 + 검증 목록 추가, 파일 카운트 11→12
- `CLAUDE.md` — Skills 표에 `/cpp` 행 + v3.15.0 feat 노트
- `README.md` — skills 섹션 `/cpp` 1줄
- `CHANGELOG` — v3.15.0 항목

## 테스트 & 검증

6개 EARS 검증 항목(WHEN/THEN/SHALL)으로 됐다는 증거를 정의하고 충족 확인:

- 새 세션 인벤토리에 `/cpp` 표시 — `skills/cpp/SKILL.md` 폴더만 생성하면 `plugin.json`의 `"skills": "./skills/"` 자동 등록으로 등장(cps가 hooks/scripts 하드코딩 0건인데도 인벤토리에 뜨는 것으로 확정).
- `/cpp` 목표 문장에 기술 토큰 0개 — 목표 섹션 검사.
- UI 요청 시 와이어프레임+요소스펙+상태+문구 4요소 포함.
- Codex 미감지 시 진행 정지·보고 — SKILL.md Codex 게이트 명시.
- 릴리즈 tag 푸시 후 재설치 cache가 `skills/cpp/` 포함 — `bump-version.sh 3.15.0`으로 12/12 파일 갱신·stale 0 확인, commit + `git tag v3.15.0` + push, `/lens-upgrade` 재설치로 캐시 3.15.0의 cpp/ 디렉토리 존재 확인.
- `/cp`·board·`/cc` 핸드오프 회귀 0 — 기존 동작 점검.

## 추가 사항

남은 후속(모두 선택):

- gh release 생성.
- done-sweep의 cpp 마커 인식(v2) — cpp 문서가 `## Plan A` 부재로 "수동확인필요"로 분류될 수 있는 안전한 degrade를 보강.
- UI 렌더 목업 — 현재는 ASCII 와이어프레임만 지원.
