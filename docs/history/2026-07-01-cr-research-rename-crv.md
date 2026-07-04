# `/cr` = Creeta Research 신설 + 기존 Lens Review → `/crv` 개명 — 완료

**완료일**: 2026-07-01

## 요약
두 갈래를 순서대로 완료했다: (A) 기존 `/cr`(Lens Review, 자가 현대화 감사)을 `/crv`로 무손실 개명해 이름 충돌을 제거하고, (B) 비워진 `/cr`에 **Creeta Research**(agent-reach + insane-search 기반 라이브 다각도 딥리서치 → 대화로 인용 보고, 파일 저장 안 함)를 신설했다. **v3.22.0으로 출시**됐다(commit fe20cb2, tag v3.22.0).

## 주요 결정 사항
- **A(개명) 먼저 → B(신설) 순서**: `/cr` 이름 충돌을 먼저 제거해야 신규 스킬이 안전하게 자리 잡음. 순서에 Codex 이견 없음.
- **개명은 무손실**: Review의 기능·SessionStart 알림·stamp·scope guard가 `/crv`로 완전 이전. Codex가 blast radius를 초안보다 넓게 교정 — `lib/capability-audit.js`의 nudge 3문자열(L114/119/124)·주석, `hooks/session-start.js` 주석, `docs/rules/capability-assumptions.json`의 affects_lens에 crv 신규 등록(기존엔 skills/cr 미참조라 자가감사 대상 누락 위험)까지 포함.
- **신규 /cr 안전 규칙 (Codex)**: (a) 파일 저장 안 함 — 산출은 대화 보고만, (b) 출처 URL + 발행일 보고 의무, (c) 로컬/비공개 코드·시크릿을 외부 쿼리에 넣지 않음(유출 금지), (d) 스코프 가드 없음 — 아무 레포/컨텍스트에서 동작(Review와 반대).
- **deep-research와 차별**: creeta research = 무키 라이브채널(agent-reach) + WAF 차단우회(insane-search) 특화. 범용 웹리서치만이면 deep-research 폴백/안내.
- **substrate 소비**: 호출 명령을 SKILL.md에 복붙하지 않고 `docs/rules/live-research.md`(단일 SoT)를 참조.
- **역사문서 불변**: `docs/history/2026-06-05-*audit*`의 과거 `/cr` 표기는 개명 대상에서 제외.

## 변경 파일
- `skills/cr/` → `skills/crv/` — 기존 Lens Review 스킬 폴더 이동 + 내부 식별자(/crv) 전환
- `skills/cr/SKILL.md` — 신규 Creeta Research 스킬 (다각도 파이프라인 + 안전·폴백·차별 절)
- `lib/capability-audit.js` — nudge 3문자열 + 주석 /cr → /crv
- `hooks/session-start.js` — nudge 주석 갱신
- `docs/rules/capability-assumptions.json` — description 갱신 + affects_lens에 crv 등록
- `docs/rules/codex-integration.md` — /crv 참조 갱신 (CHANGELOG 명시)
- `CLAUDE.md` · `README.md` — 스킬 표/사용법에 /cr(research)·/crv(review) 반영
- 릴리즈 배선 — `scripts/bump-version.sh`, `docs/START_HERE.md`, `CHANGELOG.md`

## 테스트 & 검증
- task 계획의 EARS 7건(개명 잔재 0 grep 게이트 / SessionStart 알림 /crv 문구 / /crv 감사 파이프라인 동작 / /cr 다각도 인용 보고 / 도구 미설치 폴백 / affects_lens 등록 / 태그 + 세션 노출) 중 개명 무손실은 전수 grep 게이트(A6), 신규 /cr은 실제 실행 관측으로 확인하도록 설계됐다.
- 이 문서는 사후 아카이브라 당시 개별 검증 로그는 남아 있지 않다. 다만 **v3.22.0 릴리즈·설치로 최종 확인** — `skills/cr/`·`skills/crv/`가 레포에 실존하고, `/cr`(research)·`/crv`(review) 둘 다 세션 스킬 목록에 정상 노출된다(2026-07-04 확인).

## 추가 사항
- 신규 `/cr`은 외부 서비스로 쿼리를 보내는 스킬 — 로컬 코드 유출 금지 규칙이 SKILL.md에 박혀 있으나, 프롬프트 위생은 실행 시마다 준수 필요.
