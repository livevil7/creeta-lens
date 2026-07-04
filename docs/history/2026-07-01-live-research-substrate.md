# 라이브 리서치 substrate — `docs/rules/live-research.md` — 완료

**완료일**: 2026-07-01

## 요약
Lens 스킬(`/cpp` S2, `/cr`)이 "현재 라이브 정보"(최신 릴리즈·트렌드·이슈·커뮤니티 반응)를 가져오는 표준 경로를 단일 SoT 문서 `docs/rules/live-research.md`로 신설했다. agent-reach(무키 라이브 채널)·insane-search(WAF 우회 fetch)의 감지·호출법 + 미설치 시 폴백 규칙(deep-research → WebSearch/WebFetch) + 신선도 규율(출처 URL·발행일 병기) + insane-search 안전 한계를 규정하며, **v3.22.0으로 출시**됐다(commit fe20cb2, tag v3.22.0). 4개 계획(/ci·/cr·/cpp 라이브화)의 선행 토대.

## 주요 결정 사항
- **단일 SoT 참조 방식**: /cpp와 /cr이 같은 호출법·같은 폴백 규칙을 쓰므로 각 스킬에 복붙하면 드리프트 확정 — 규칙은 이 문서 한 곳에 두고 스킬은 참조만 한다(Codex 이견 없음).
- **폴백 필수 = 미설치는 실패가 아님**: agent-reach 없음 → deep-research → 네이티브 WebSearch/WebFetch, insane-search 없음 → WebFetch/jina 2단 폴백. 폴백 시 조사보고에 "라이브 채널 없음(폴백: X)" 한 줄만 남기고 절대 멈추지 않는다(dormant 스캐폴딩 금지 원칙).
- **위임 우선**: agent-reach는 이미 네이티브 스킬이므로 플랫폼 라우팅 일반은 재구현하지 않고 "agent-reach 스킬에 위임"(중복 회피).
- **insane-search 안전 한계 (Codex 신규 리스크 반영)**: 로그인/유료 페이월 우회 금지, robots·ToS 위반 대량 크롤 금지, 개인정보·비공개 리소스 조회 금지, terminal 실패(auth_required/paywall/404)는 인정하고 멈춤(무한 재시도 금지).
- **문서만 만들고 끝내지 않기 (Codex)**: `CLAUDE.md`·`docs/START_HERE.md`에 참조 등록. 실제 /cpp·/cr SKILL.md의 참조 배선은 각 스킬 계획 소관.
- **문서 구조**: §0 감지(호출 전 1회, win/unix 경로 + doctor) → §1 라이브 채널 호출표(Exa·jina·GitHub·YouTube·V2EX·RSS) → §2 차단 우회 fetch → §3 폴백 → §4 신선도 규율 → §5 참조 스킬 목록 → §6 안전 한계 + 셸 규칙(Windows cp949 함정).

## 변경 파일
- `docs/rules/live-research.md` — 신규 (본 substrate 문서, 코드 0)
- `CLAUDE.md` · `docs/START_HERE.md` — 참조 등록 한 줄씩
- `CHANGELOG.md` — v3.22.0 Added 항목

## 테스트 & 검증
- task 계획의 EARS 4건(파일 존재 / Exa·engine 명령 제공 / 폴백 경로 명시 / 참조 스킬 목록 존재)은 전부 auto(파일 존재 + grep) 검증으로 설계됐다.
- 이 문서는 사후 아카이브라 당시 grep 로그는 남아 있지 않다. 다만 **v3.22.0 릴리즈·설치로 최종 확인** — `docs/rules/live-research.md`가 레포에 실존하고 §0~§6 + 셸 규칙 절이 모두 존재하며, 소비자인 `/cr`·`/cpp`가 v3.22.0에 함께 출시돼 실사용 중이다(2026-07-04 확인).

## 추가 사항
- agent-reach·insane-search는 Lens 외부 플러그인 — Lens가 강제 설치하지 않는다(있으면 쓰고 없으면 폴백). 강제 의존으로 오해 금지.
- agent-reach 채널이 늘거나 참조 스킬이 추가되면 이 문서의 호출표·§5 목록만 갱신하면 된다.
