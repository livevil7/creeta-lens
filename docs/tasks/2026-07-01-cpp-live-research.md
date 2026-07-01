---
planner: cpp
plan_id: cpp-live-research
date: 2026-07-01
refs: [live-research-substrate]
---

# `/cpp` 라이브 리서치화 — S2 조사에 agent-reach + insane-search 주입

> /cpp가 계획을 짤 때 훈련지식이 아니라 "오늘의 릴리즈·트렌드·이슈·경쟁현황"을 조사해 반영하게 만든다. 단, 강제가 아니라 **필요할 때만**(Codex 교정).

## 🎯 What — 목표 (사람 언어)

- `/cpp`로 계획을 짤 때, 주제가 **최신 정보에 민감하면**(새 라이브러리 버전, 요즘 뜨는 접근, 커뮤니티가 겪는 이슈, 경쟁 제품 현황) 계획이 **오늘의 실제 데이터**를 근거로 선다 — 작년치 지식으로 낡은 계획을 짜지 않는다.
- 그 도구가 없는 사용자 환경에서도 `/cpp`는 멈추지 않고 **기존 수단(context7/deep-research/web)으로 조용히 대체**한다.

**🎬 사용 장면:** 사용자가 `/cpp "우리 앱에 최신 인증 라이브러리 붙이기"` → /cpp의 S2 조사 단계에서 "이건 라이브 신호가 필요"라 판단 → `docs/rules/live-research.md`대로 Exa로 "2026 최신 auth 라이브러리 비교"·GitHub로 해당 repo 최근 이슈·Reddit/X 반응을 수집 → 조사보고에 "오늘 기준 X가 정석, Y는 최근 deprecated" 반영 → 그 위에 빌드레디 계획. agent-reach 없는 PC면 deep-research로 대체하고 "라이브 채널 없음(폴백)" 표기.

**완료의 정의 (Done = ?):**
> `/cpp` S2가, 라이브 신호가 유익한 주제에서 `live-research.md`를 참조해 agent-reach/insane-search 조사를 수행하고(도구 있을 때) 그 결과를 조사보고에 반영하며, 도구가 없으면 명시적으로 폴백한다. trivial·내부코드-only 주제에선 라이브 조사를 강요하지 않는다.

## ❓ Why — 왜 (6하원칙)

- **왜 지금**: /cpp의 강점은 S2 전방위 조사인데, 현재 축③은 "context7 + deep-research"뿐이라 **실시간 커뮤니티·트렌드·저장소 최신상태**를 못 본다. agent-reach(무키 라이브)·insane-search(차단우회)가 이번에 설치돼 이 공백을 메울 수 있다.
- **무엇을**: S2 축③ 확장 + S0 실행전략의 "활용 스킬 자동감지"에 라이브채널 인지 + S7 self-check 정합 + 조건부 발동 규칙.
- **누구를 위해**: /cpp로 계획 짜는 사용자.
- **어디서**: `creeta-lens/skills/cpp/SKILL.md`(S0·S2·S7·산출물 조사보고 절).
- **어떻게**: SKILL.md 외과적 편집(다른 스킬 무수정). substrate 문서 참조.
- **안 하면**: /cpp 계획이 계속 "작년 지식 + 코드"에 갇혀, 빠르게 변하는 도메인에서 낡은 권장을 빌드레디로 정밀하게 만든다(잘못된 것을 잘 만듦).

## 🧰 실행 전략 & 자원

- **난이도**: small~medium (단일 SKILL.md 외과 편집 + substrate 참조).
- **권장 모델**: sonnet.
- **병렬 실행**: 단일. substrate(①)에 **의존**(참조 대상 문서가 먼저 있어야 함).
- **활용 스킬**: `docs/rules/live-research.md`(①), 기존 context7/deep-research(폴백).
- **기존 자원**: `skills/cpp/SKILL.md` S2 표(축①~⑥), S0 🧰실행전략 절, S7 self-check 리스트, 산출물 `## 🔬 조사 보고` 섹션.

## 📜 Constitution (이 작업 불변 조항)

1. **Surgical** — `skills/cpp/SKILL.md`만 편집. `/cp`·lib·다른 스킬 무수정.
2. **조건부, 강제 아님 (Codex 핵심)** — 매 /cpp마다 라이브 조사 강제 금지(느림·취약). **URL/최신성/외부동향이 유익한 주제에서만** 발동. trivial·순수 내부코드 리팩토링은 skip.
3. **폴백 명시** — 도구 미설치는 실패 아님. context7/deep-research/web/로컬조사로 degrade하고 조사보고에 한 줄 표기.
4. **substrate 위임** — 호출 명령을 SKILL.md에 복붙하지 말고 `live-research.md` 참조(SoT 단일).

## 🛠 How — 빌드레디 실행

- [ ] **T1** S2 축③ 확장 (조사 표에 라이브채널 명시)
      파일: `creeta-lens/skills/cpp/SKILL.md` (S2 표, 현재 축③ 행)
      변경: 축③ 행을
      `③ 도메인 정석 | 베스트 프랙티스 — 라이브러리 문서는 context7 MCP, 광범위 리서치는 deep-research`
      → `③ 도메인 정석 & 라이브 신호 | 베스트 프랙티스(라이브러리=context7 MCP). **최신성/트렌드/저장소 현황/커뮤니티 반응이 유익하면** docs/rules/live-research.md 대로 agent-reach(Exa·GitHub·YouTube·V2EX·RSS)+insane-search(차단URL). 도구 없으면 deep-research/web 폴백.`
      검증: `grep -n "live-research" skills/cpp/SKILL.md` → 축③ 근처 1행
      의존: ①-substrate 완료

- [ ] **T2** S2 발동 조건 문단 추가 (조건부 규칙 — Codex)
      파일: `skills/cpp/SKILL.md` (S2 섹션, 표 아래)
      변경: 한 문단 추가 — "**라이브 조사 발동 조건**: 주제가 (a) 특정 URL/외부 리소스를 다루거나 (b) 최신 릴리즈·버전·트렌드에 민감하거나 (c) 커뮤니티가 겪는 실이슈가 계획에 중요할 때만 live-research 채널을 쓴다. 순수 내부코드·trivial은 ①②④⑤⑥로 충분(라이브 skip). 발동 시 `docs/rules/live-research.md`의 감지→호출→폴백 절차를 따른다."
      검증: `grep -c "발동 조건\|라이브 조사" skills/cpp/SKILL.md` → ≥1
      의존: T1

- [ ] **T3** S0 🧰 실행전략 "활용 스킬 자동감지"에 라이브채널 인지 추가
      파일: `skills/cpp/SKILL.md` (S0 🧰 실행 전략 & 자원 bullet)
      변경: "활용할 설치 스킬" 예시에 "…라이브 트렌드·최신 릴리즈면 **agent-reach/insane-search**(live-research.md)…" 한 구절 추가(자동감지 목록에 편입).
      검증: `grep -n "agent-reach" skills/cpp/SKILL.md` → S0 근처 포함
      의존: T1

- [ ] **T4** S7 self-check + 산출물 조사보고 정합
      파일: `skills/cpp/SKILL.md` (S7 체크리스트, 산출물 `## 🔬 조사 보고` 언급)
      변경: S7에 체크 1줄 추가 — "[ ] 라이브 신호가 유익한 주제였다면 live-research를 썼거나(또는 불필요/미설치로 폴백) 그 사유가 조사보고에 표기됐는가?" + 조사보고 절에 "라이브 출처는 URL+발행일 병기(live-research §4)" 한 줄.
      검증: `grep -c "live-research\|라이브" skills/cpp/SKILL.md` S7 구간 ≥1
      의존: T1

- [ ] **T5** 버전 bump + CHANGELOG + 배포 태그
      파일: `scripts/bump-version.sh` 실행, `CHANGELOG.md`
      변경: `bash scripts/bump-version.sh <next>` (skills/cpp 배너 포함 13곳) → CHANGELOG에 "/cpp S2 라이브리서치(agent-reach+insane-search) 조건부 주입" → commit + `git tag v<next>` + push(마켓 source.ref 갱신 위해 **태그 필수**).
      검증: `git tag` 에 새 버전 존재 + `grep cpp CHANGELOG.md` 최신행
      의존: T1~T4 (+ ①,④ 함께 릴리즈 권장)

## 💡 시사점 · ⚠️ 주의점 · 🔀 Side Effect

- **💡 시사점**: /cpp가 "오늘의 현실" 위에 계획을 세우게 되어, 빠르게 변하는 도메인(프론트 라이브러리, AI 도구)에서 계획 신선도가 급상승. /cr(research)과 같은 substrate라 일관.
- **⚠️ 주의점 (Codex)**: 라이브 조사를 **모든** /cpp에 강제하면 매 계획이 수십초 느려지고 네트워크 실패에 취약 → 반드시 조건부(T2). Codex 하드게이트(S4)와 라이브조사는 별개 축이니 S4 흐름은 건드리지 않는다.
- **🔀 Side Effect**: `skills/cpp/SKILL.md`만 변경 → /cpp 동작에만 영향. 캐시(3.21.1)와 소스(3.21.2+) 드리프트 주의 — 태그 push 후 `/lens-upgrade` 해야 실제 반영. board·done-sweep 무영향(spine 불변).

## ✅ Review — 검증 (EARS)

**검증 전략**: SKILL.md 편집이라 grep으로 문구 반영 확인 + 실제 `/cpp`를 라이브민감 주제로 1회 돌려 조사보고에 라이브 출처가 들어오는지 관측(도구 있는 이 PC). 폴백은 agent-reach 임시 비활성 시나리오로 확인(수동).

| # | EARS | 확인 방법 | 통과 판정 | 종류 |
|---|------|----------|----------|------|
| 1 | WHEN S2 표 편집, THEN 축③에 live-research 참조가 SHALL 존재 | `grep -n live-research skills/cpp/SKILL.md` | ≥1행 | auto |
| 2 | WHEN 발동조건 문단, THEN 조건부(강제아님) 규칙이 SHALL 명시 | `grep "발동 조건" skills/cpp/SKILL.md` | 존재 | auto |
| 3 | WHEN 라이브민감 주제로 /cpp 실행, THEN 조사보고에 라이브 출처(URL+날짜)가 SHALL 포함 | 실제 /cpp 1회 실행 관측 | 조사보고에 라이브 인용 | manual |
| 4 | WHEN agent-reach 미설치 가정, THEN /cpp는 폴백하고 SHALL 멈추지 않음 | 폴백 경로 코드/문구 확인 | "폴백" 표기 존재 | manual |
| 5 | WHEN 버전 배포, THEN 태그가 SHALL 존재 | `git tag \| grep v<next>` | 존재 | auto |

## 🔀 Codex 교차 협의

- **합의(고신뢰)**: "S2 축③만 고치면 부족" — S0 실행전략·S7 self-check·조사보고 절까지 정합해야 일관(반영 T3/T4).
- **Codex 신규 리스크→반영**: 매 /cpp 라이브조사 강제는 느리고 취약 → **조건부 발동**으로 설계(T2, Constitution 2조). 미설치 명시 degrade(context7/deep-research/web/로컬).
- **분기 없음**: 주입 지점(S2 축③)에 이견 없음, 범위만 확장.

## 진행상황
- **마지막 업데이트**: 2026-07-01
- **현재 경로**: 계획 승인 대기 (①-substrate 선행 의존)
- **재개 포인트**: ① 완료 후 T1부터
