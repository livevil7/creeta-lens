---
planner: cpp
plan_id: cr-research-rename-crv
date: 2026-07-01
refs: [live-research-substrate]
---

# `/cr` = Creeta Research 신설 + 기존 Lens Review → `/crv` 개명

> 두 갈래: (A) 기존 /cr(Lens Review)를 /crv로 **깨끗이 개명**(11+파일 배선), (B) 비워진 /cr에 **creeta research**(라이브 다각도 딥리서치→대화 보고) 신설. 순서 중요: A 먼저(충돌 제거) → B.

## 🎯 What — 목표 (사람 언어)

- **A**: 지금 `/cr`이던 "Lens 자가 현대화 감사"가 **`/crv`**로 옮겨져, 예전처럼 SessionStart 알림·감사가 그대로 동작한다(이름만 바뀜).
- **B**: 사용자가 `/cr <주제>`를 치면, agent-reach·insane-search로 그 주제를 **여러 각도(웹검색·GitHub·YouTube·커뮤니티·RSS)로 라이브 딥리서치**해서, **인용을 곁들인 보고를 대화로** 받는다(파일 저장 안 함).

**🎬 사용 장면:**
- (A) 세션 시작 → 예전 "🩺 자가 감사 N일 경과 — `/crv` 재감사 권장" 알림(문구가 /cr→/crv). 사용자 `/crv` → 기존 감사 파이프라인 그대로.
- (B) 사용자 `/cr "요즘 SolidJS vs Svelte 현업 반응"` → 스킬이 live-research.md대로 Exa 검색 + GitHub 저장소 활동 + YouTube/Reddit/X 반응 + RSS를 **병렬 다각도** 수집 → "오늘 기준 A진영은 …, B진영은 …(출처 URL·날짜)" 형태로 **대화에 보고**(파일 안 남김). 도구 없으면 deep-research/web 폴백.

**완료의 정의 (Done = ?):**
> `/crv`가 기존 Lens Review와 동일하게 동작하고(알림·stamp·scope guard 포함, 문구가 crv), 새 `/cr`이 임의 주제를 라이브 다각도로 조사해 인용 포함 보고를 대화로 내며 파일을 저장하지 않고, 세션 스킬표에 /cr(research)·/crv(review)가 각각 노출된다.

## ❓ Why — 왜 (6하원칙)

- **왜 지금**: 사용자가 /cr을 "creeta research"로 쓰고 싶어함. 현재 /cr은 Lens Review로 점유 → 충돌. Review는 SessionStart nudge·capability-audit에 배선돼 있어 **깨끗한 개명**이 필요(방치하면 알림이 죽은 /cr을 가리킴).
- **무엇을**: (A) 개명 전 배선 이전. (B) 라이브 리서치 스킬 신설(substrate 소비).
- **누구를 위해**: Review는 Lens 유지보수자(나), Research는 모든 사용자.
- **어디서**: `skills/cr`↔`skills/crv`, `lib/capability-audit.js`, `hooks/session-start.js`, `docs/rules/capability-assumptions.json`, `docs/START_HERE.md`, `scripts/bump-version.sh`, `CLAUDE.md`, `README.md`.
- **어떻게**: git mv + 문자열 배선 이전(A) → 신규 skills/cr/SKILL.md(B).
- **안 하면**: 이름 충돌로 둘 중 하나 안 뜸 + 알림이 존재하지 않는 명령 안내.

## 🧰 실행 전략 & 자원

- **난이도**: A=medium(배선 다수·정확도 요구), B=small~medium(신규 SKILL.md, substrate 소비).
- **권장 모델**: sonnet. 개명은 grep 전수라 신중.
- **병렬 실행**: A 먼저(직렬) → B. B는 ①-substrate 의존.
- **활용 스킬**: `docs/rules/live-research.md`(①), 기존 deep-research(차별화 대상·폴백).
- **기존 자원 (Codex가 밝힌 blast radius)**: `skills/cr/SKILL.md`(name·triggers·**scope guard**·**stamp** 문구), `lib/capability-audit.js`(상단주석·사용처주석·**nudge 3문자열** L114/119/124·CLI설명), `hooks/session-start.js`(주석 L58/118), `docs/rules/capability-assumptions.json`(description + **affects_lens에 신규행 필요** — 현재 skills/cr 미참조), `docs/START_HERE.md`(스킬 목록), `scripts/bump-version.sh`(버전-bearing 스킬 목록·카운트), `CLAUDE.md`(스킬표·설정설명·폴더구조), `README.md`(사용법).

## 📜 Constitution (이 작업 불변 조항)

1. **개명은 무손실** — Review 기능·알림·stamp·scope guard가 /crv로 **완전히** 이전. 죽은 /cr 참조 0 (전수 grep로 확인).
2. **신규 /cr 안전 (Codex)** — creeta research는 (a) **파일 저장 안 함**(대화 보고만), (b) **출처(URL·날짜) 보고 의무**, (c) **로컬/비공개 코드를 외부 서비스로 유출 금지**(쿼리에 사내 코드·시크릿 넣지 않기), (d) **스코프 가드 없음**(아무 레포/컨텍스트서 동작 — Review와 반대).
3. **deep-research와 차별** — 중복 아님을 명시: creeta research = 무키 라이브채널(agent-reach) + 차단우회(insane-search) 특화. 범용 웹리서치는 deep-research로 안내 가능.
4. **Surgical** — 개명 외 다른 스킬 무수정. 신규 /cr은 substrate 참조(호출법 복붙 금지).
5. **역사문서 불변** — `docs/history/2026-06-05-*audit*`는 과거 기록이라 개명 대상 아님(그대로 둠).

## 🛠 How — 빌드레디 실행

### Part A — 개명 /cr → /crv (충돌 제거, 먼저)

- [ ] **A1** 스킬 폴더 이동 + 내부 식별자
      파일: `skills/cr/` → `skills/crv/` (`git mv skills/cr skills/crv`), `skills/crv/SKILL.md`
      변경: frontmatter `name: "cr"`→`"crv"`, `argument-hint` 유지, triggers의 `/cr`→`/crv`, 본문 `/cr`→`/crv`(scope guard·stamp 안내·"You are Lens Review" 유지). 배너 "Lens Review" 문자열은 유지(bump-version이 잡는 배너 패턴 확인).
      검증: `grep -rn "/cr\b" skills/crv/SKILL.md` → 0 (모두 /crv), `ls skills/cr` → 없음(이동됨)
      의존: 없음 (Part A 시작점)

- [ ] **A2** capability-audit.js nudge 3문자열 + 주석
      파일: `lib/capability-audit.js`
      변경: L114/119/124 nudge 문자열의 `` `/cr` ``→`` `/crv` `` (3곳), 상단 주석 L2/4/10 "for /cr modernization"·"skills/cr/SKILL.md"→crv, L67 "Called by /cr"→/crv. `stamp` CLI 계약 자체는 불변(경로만).
      검증: `grep -n "/cr\b" lib/capability-audit.js` → 0 (모두 /crv)
      의존: A1

- [ ] **A3** session-start.js nudge 주석
      파일: `hooks/session-start.js`
      변경: L58/118 주석 "/cr capability-audit nudge"→"/crv …". `formatAuditNudge` 호출 로직 불변(문구는 capability-audit.js가 생성 — A2에서 처리됨).
      검증: `grep -n "/cr\b" hooks/session-start.js` → 0
      의존: A2

- [ ] **A4** capability-assumptions.json — description + affects_lens 신규행
      파일: `docs/rules/capability-assumptions.json`
      변경: description의 "/cr 가"→"/crv 가". **Codex 지적**: affects_lens에 현재 skills/cr가 없음 → /crv(자가감사)를 감사 대상에 넣으려면 해당 capability 행의 affects_lens에 `skills/crv/SKILL.md` 추가(또는 신규 행). Review 스킬 자신을 audit 대상에 포함.
      검증: `grep -c "skills/cr\b" capability-assumptions.json` → 0, `grep -c "crv" ...` → ≥1
      의존: A1

- [ ] **A5** 사용자·릴리즈 문서 배선
      파일: `docs/START_HERE.md`, `CLAUDE.md`, `README.md`, `scripts/bump-version.sh`
      변경: 스킬 목록/표/사용법의 `/cr`(review)→`/crv`. bump-version.sh 스킬 목록에 skills/crv 반영(경로 변경) + 카운트 유지. (Review 배너 치환 라인이 있으면 경로 갱신.)
      검증: `grep -rn "skills/cr\b\|/cr\b.*[Rr]eview" docs/START_HERE.md CLAUDE.md README.md scripts/bump-version.sh` → 0 잔재
      의존: A1

- [ ] **A6** 전수 잔재 스캔 (개명 무손실 게이트)
      파일: 레포 전체(역사문서 제외)
      변경: 없음(검사). `grep -rn "/cr\b" --include=*.md --include=*.js --include=*.json . | grep -v docs/history | grep -v skills/crv` → **/cr이 review를 뜻하는 잔재 0** 확인. (신규 /cr=research 도입 후엔 /cr이 research를 뜻하므로 이 스캔은 A 완료 직후·B 전에 수행.)
      검증: 위 grep 결과 0행 (또는 전부 research 문맥)
      의존: A1~A5

### Part B — 신규 `/cr` = Creeta Research (개명 후)

- [ ] **B1** skills/cr/SKILL.md 신설 — frontmatter + 정체성
      파일: `creeta-lens/skills/cr/SKILL.md` (새 파일, 빈 폴더에)
      변경: frontmatter `name: "cr"`, user-invocable, `argument-hint: "<주제>"`, triggers(`/cr`, creeta research, 딥리서치, 라이브 조사, research, 深度调研, リサーチ…). 본문: "You are **Creeta Research** — 라이브 다각도 딥리서치". 정체성: deep-research와 차별(무키 라이브채널+차단우회), **스코프 가드 없음**.
      검증: frontmatter 파싱 OK, `grep -c "creeta research\|Creeta Research" skills/cr/SKILL.md` ≥1
      의존: A6 (개명 완료 후)

- [ ] **B2** 리서치 파이프라인 절 (substrate 소비 + 다각도)
      파일: `skills/cr/SKILL.md`
      변경: 흐름 —
      1) 주제 정제(모호하면 1질문).
      2) `docs/rules/live-research.md` **Read** → 도구 감지.
      3) **다각도 병렬 수집**(Task 도구 or 순차): Exa 시맨틱검색 / GitHub(관련 repo·이슈·PR) / YouTube(관련 영상 자막) / 커뮤니티(V2EX·Reddit via agent-reach) / RSS / 필요시 insane-search로 차단 URL. 각 축 1~2줄 요약+출처.
      4) 교차·상충 정리(적대적: 열광 vs 회의 양면).
      5) **대화로 보고**(파일 저장 안 함): 한 줄 결론 → 축별 발견(출처 URL+날짜) → 상충/합의 → 시사점.
      검증: `grep -c "live-research\|다각도\|출처" skills/cr/SKILL.md` ≥2
      의존: B1, ①-substrate

- [ ] **B3** 안전·폴백·차별 절 (Codex)
      파일: `skills/cr/SKILL.md`
      변경: (a) **파일 저장 안 함** 명시(산출=대화). (b) **로컬/비공개 코드·시크릿을 외부 쿼리에 넣지 않기**(유출 금지). (c) 출처 URL+발행일 의무. (d) 도구 미설치 → deep-research/web 폴백 + 표기. (e) "범용 웹리서치만이면 deep-research가 나을 수 있음" 안내(중복 회피).
      검증: `grep -c "저장.*안\|유출\|폴백\|deep-research" skills/cr/SKILL.md` ≥3
      의존: B1

- [ ] **B4** 릴리즈 배선 (신규 스킬 등록)
      파일: `scripts/bump-version.sh`(skills/cr 추가), `docs/START_HERE.md`·`CLAUDE.md`·`README.md`(스킬 목록에 /cr=research, /crv=review 둘 다), `CHANGELOG.md`
      변경: /cr(research)·/crv(review)를 문서·버전목록에 등록. bump-version.sh 카운트 갱신(기존13 + ci + crv경로 + cr신규).
      검증: `grep -c "creeta research\|/cr\b" README.md docs/START_HERE.md` ≥1, bump-version.sh에 skills/cr·skills/crv 모두 존재
      의존: B1~B3

- [ ] **B5** 버전 bump + 태그 (①③④ 통합 릴리즈 권장)
      파일: `scripts/bump-version.sh` 실행, git
      변경: `bash scripts/bump-version.sh <next>` → commit + `git tag v<next>` + push(**태그 필수** — 없으면 옛 코드 설치).
      검증: `git tag \| grep v<next>` 존재, `/lens-upgrade` 후 세션에 /cr·/crv 노출
      의존: A·B 전부

## 💡 시사점 · ⚠️ 주의점 · 🔀 Side Effect

- **💡 시사점**: /cr(research)·/cpp(라이브화)가 같은 substrate라 라이브리서치 능력이 일관되게 성장. Review는 /crv로 안전 이전.
- **⚠️ 주의점 (Codex)**: 개명은 **전수 grep 게이트(A6)** 없으면 죽은 /cr 참조가 알림·감사에 남는다. capability-assumptions affects_lens는 현재 skills/cr 미참조라 **신규행 추가** 안 하면 /crv가 자가감사 대상서 누락. 신규 /cr은 **로컬 코드 외부유출** 리스크 — 쿼리 위생 규칙 필수.
- **🔀 Side Effect**: SessionStart 알림 문구·capability-audit 상태파일 경로가 /crv 기준으로. 스킬 개수 +1(research 신규, review는 이동). board·done-sweep 무영향. 캐시↔소스 드리프트 — 태그 push+upgrade 필요.

## ✅ Review — 검증 (EARS)

**검증 전략**: 개명은 grep 전수(잔재 0) + 세션 재시작 후 /crv 알림·동작 관측. 신규 /cr은 실제 주제로 1회 실행해 다각도 수집·대화보고·파일미저장 관측(도구 있는 이 PC). 폴백은 수동 시나리오.

| # | EARS | 확인 방법 | 통과 판정 | 종류 |
|---|------|----------|----------|------|
| 1 | WHEN 개명 완료, THEN /cr(review) 잔재가 SHALL 0 | `grep -rn "/cr\b" (역사·research 제외)` | 0행 | auto |
| 2 | WHEN 세션 시작, THEN 자가감사 알림이 /crv를 SHALL 안내 | SessionStart additionalContext | "/crv" 문구 | manual |
| 3 | WHEN /crv 실행, THEN 기존 Review 파이프라인이 SHALL 동작(stamp 포함) | /crv 실행 + `.lens/capability-audit-state.json` 갱신 | lastAuditAt 갱신 | manual |
| 4 | WHEN /cr <주제> 실행, THEN 다각도 라이브 조사 + 출처 포함 보고를 SHALL 대화로 출력 | /cr 실제 실행 | 출처 URL+날짜 포함 보고, 파일 0 | manual |
| 5 | WHEN 도구 미설치, THEN /cr은 deep-research/web으로 SHALL 폴백 | 폴백 문구/경로 확인 | "폴백" 표기 | manual |
| 6 | WHEN affects_lens, THEN /crv가 감사대상으로 SHALL 등록 | `grep crv capability-assumptions.json` | ≥1 | auto |
| 7 | WHEN 배포, THEN 태그 존재 + 세션에 /cr·/crv 둘 다 노출 | `git tag` + 세션 스킬표 | 둘 다 | manual |

## 🔀 Codex 교차 협의

- **합의(고신뢰)**: 개명 blast radius가 내 초안(skills/cr·capability-audit·session-start·capability-assumptions·README/CLAUDE)보다 넓음 — **bump-version.sh·docs/START_HERE.md·scope guard·stamp 문구·nudge 3문자열**까지 (반영 A1/A2/A5). affects_lens 신규행 필요(A4).
- **Codex 신규 리스크→반영**: 신규 /cr에 **파일저장 금지·출처보고·로컬코드 유출금지**를 별도로 박아야 함(B3, Constitution 2조).
- **분기 없음**: A→B 순서·개명 방식에 이견 없음.

## 진행상황
- **마지막 업데이트**: 2026-07-01
- **현재 경로**: 계획 승인 대기 (①-substrate 선행, A→B 순서)
- **재개 포인트**: 승인 시 Part A(A1 git mv)부터, A6 게이트 통과 후 Part B
