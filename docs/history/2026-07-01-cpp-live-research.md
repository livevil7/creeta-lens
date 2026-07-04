# `/cpp` 라이브 리서치화 — S2 조사에 agent-reach + insane-search 주입 — 완료

**완료일**: 2026-07-01

## 요약
`/cpp`(Power Plan)의 S2 전방위 조사 축③(도메인 정석)에 라이브 리서치(agent-reach + insane-search)를 **조건부로** 주입했다 — 주제가 최신성·트렌드·저장소 현황·커뮤니티 반응에 민감할 때만 발동(강제 아님)하고, 도구 미설치 시 graceful degrade. S0 실행전략·S7 self-check도 정합했으며 S4 Codex 하드게이트는 무변경. `skills/cpp/SKILL.md` 단일 파일 외과 편집으로 **v3.22.0으로 출시**됐다(commit fe20cb2, tag v3.22.0).

## 주요 결정 사항
- **조건부 발동, 강제 아님 (Codex 핵심)**: 매 /cpp마다 라이브 조사를 강제하면 계획마다 수십 초 느려지고 네트워크 실패에 취약 — (a) 특정 URL/외부 리소스, (b) 최신 릴리즈·버전·트렌드 민감, (c) 커뮤니티 실이슈가 계획에 중요할 때만 발동. 순수 내부코드·trivial은 skip.
- **substrate 위임 (SoT 단일)**: 호출 명령을 SKILL.md에 복붙하지 않고 `docs/rules/live-research.md`의 감지→호출→폴백 절차를 참조.
- **축③만으로는 부족 — S0·S7 정합 (Codex 합의)**: S0 실행전략의 "활용 스킬 자동감지"에 라이브채널 인지 추가 + S7 self-check에 "라이브 신호가 유익한 주제였다면 live-research를 썼거나 폴백 사유가 조사보고에 표기됐는가" 체크 추가. 라이브 출처는 URL+발행일 병기(live-research §4).
- **폴백 명시**: 도구 미설치는 실패가 아니라 context7/deep-research/web/로컬조사로 degrade + 조사보고에 한 줄 표기.
- **Surgical**: `skills/cpp/SKILL.md`만 편집 — /cp·lib·다른 스킬 무수정, S4 Codex 하드게이트 흐름 불변.

## 변경 파일
- `skills/cpp/SKILL.md` — S2 축③ 확장 + 발동 조건 문단 + S0 실행전략 라이브채널 인지 + S7 self-check·조사보고 정합
- `CHANGELOG.md` — v3.22.0 Changed 항목 (버전 bump는 ①③④와 통합 릴리즈)

## 테스트 & 검증
- task 계획의 EARS 5건(축③ live-research 참조 grep / 발동조건 문단 존재 / 라이브민감 주제 실행 시 조사보고에 URL+날짜 인용 / 미설치 폴백 / 태그 존재) 중 문구 반영은 grep, 동작은 실제 /cpp 1회 실행 관측으로 설계됐다.
- 이 문서는 사후 아카이브라 당시 grep·실행 로그는 남아 있지 않다. 다만 **v3.22.0 릴리즈·설치로 최종 확인** — `skills/cpp/SKILL.md`에 변경이 반영된 채 tag v3.22.0으로 배포·설치됐고, 태그 존재(EARS 5)는 확인됐다(2026-07-04).

## 추가 사항
- 캐시↔소스 드리프트 주의 — 태그 push 후 `/lens-upgrade`를 해야 각 머신에 실제 반영된다(v3.22.0 릴리즈로 해소).
