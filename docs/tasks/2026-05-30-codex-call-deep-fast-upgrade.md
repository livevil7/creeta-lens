---
id: 2026-05-30-codex-call-deep-fast-upgrade
title: Codex 호출 업그레이드 — 깊게(xhigh) + 빠르게(priority) + drift/잔재 정리
status: draft
created: 2026-05-30
scale: medium
refs:
  - docs/rules/codex-integration.md
  - skills/cp/SKILL.md
  - skills/cc/SKILL.md
---

# Codex 호출 업그레이드 — 깊게(xhigh) + 빠르게(priority) + drift 정리

## 🎯 목표 — 무엇이 가능해지는가 (사람 언어)

**이 작업이 끝나면 가능해지는 것:**
- lens가 codex를 부를 때 **항상 가장 깊은 추론으로, 그리고 가능한 한 빠르게** 답을 받는다. (사용자 방침: 토큰 비용은 신경 안 씀 — 깊이·속도 우선)
- codex가 **느리거나 멈춰도** lens 작업이 멈추지 않고 Claude 혼자 끝까지 진행된다.
- lens 문서에 적힌 codex 모델/설정이 **실제로 돌아가는 것과 일치**한다 (5.2/5.5 혼동 제거).
- codex 응답을 **깨짐 없이** 읽어들인다 (취약한 텍스트 파싱 제거).
- `/cc`·`/cp` 실행 시 **Claude 쪽 작업(워커·슈퍼바이저·QA)도 항상 높은 모델(Opus)로** 수행된다. (codex와 동일 방침 — 깊이 우선, 비용 비고려)

**완료의 정의 (Done = ?):**

> `/cp` 또는 `/cc`를 실제로 한 번 돌렸을 때 codex가 "깊게+빠르게" 설정으로 호출되고, 응답이 깨짐 없이 수거되며, codex가 응답을 안 주거나 멈춰도 Claude가 작업을 끝까지 마치고, Claude 측 실행도 Opus로 돈다.

## ✅ 검증 — 이게 됐다는 증거 (기계가 판정)

| # | 목표가 됐다는 신호 | 확인 방법 (명령/관측) | 통과 판정 | 종류 |
|---|------------------|----------------------|----------|------|
| 1 | 표준 호출에 깊은+빠른 설정이 박혀 있다 | `codex-integration.md` §4 표준 호출 라인 확인 | `-m gpt-5.5` + `model_reasoning_effort=xhigh` + `service_tier=priority` + `-o` 모두 존재 | auto |
| 2 | 취약한 파싱/타임아웃 잔재가 없다 | 세 파일에서 `tokens used` / `awk '/\^codex/` / `timeout 30` grep | 활성 코드에 0건 (설명 텍스트 제외) | auto |
| 3 | 모델 표기가 실제와 일치 | 세 파일에서 `5\.2` grep | 모델 지칭 0건 (Phase 번호 `5.2`는 무관) | auto |
| 4 | codex 미응답 시 degrade 동작 | `/cp` 또는 `/cc`를 codex 끊은/없는 상태로 1회 실행 | Claude 단독으로 계획/실행 완료, "Codex 미사용" 플래그 기록 | manual |
| 5 | 설치본에 반영됨 | `bump-version.sh 3.11.0` 후 plugin.json + 캐시 동기화 | 새 버전 lens가 위 호출 규칙으로 동작 | manual |
| 6 | /cc Claude 역할이 높은 모델로 배정 | `cc/SKILL.md` Model Assignment Table 확인 | Worker(Easy/Medium/Hard)·Supervisor·QA = `opus`, Monitor만 `haiku` | auto |
| 7 | /cp Claude 작업이 Opus | `cp/SKILL.md` Phase 3.1 확인 | pre-mortem opus (기존 유지, 다운그레이드 없음) | auto |

## Plan A — 권장 경로

### 왜 이게 1순위인가
중앙 규칙 **`docs/rules/codex-integration.md` 한 곳이 SoT**다. 호출 패턴·파싱·에러처리를 여기서 고치면 `cp`/`cc` SKILL.md는 "§N 참조"로 따라온다. SKILL.md에 흩어진 직접 인용(`^codex$`~`tokens used`, `codex exec "..."`)만 참조로 바꾸면 됨 → 외과적. 버전 전파는 `bump-version.sh`가 11곳 일괄 처리하므로 수동 편집 대상 아님.

### 설정 결론 (확정)
`gpt-5.5` + `model_reasoning_effort=xhigh`(깊게) + `service_tier=priority`(빠르게) + `-o <file>`(깨짐 없는 수거). 토큰 비용 비고려.

### 단계 — 파일별 정확한 변경 (inline)

**A. `docs/rules/codex-integration.md` (중앙 규칙 · 핵심)**
- [ ] L9 `GPT-5.2-Codex 전용 CLI 도구` → `gpt-5.5 기반 (이 codex 확장 빌드가 노출하는 모델)` — verify: `5.2` 사라짐
- [ ] L75 §4 표준 호출: `codex exec --skip-git-repo-check "프롬프트"` → `codex exec --skip-git-repo-check -m gpt-5.5 -c model_reasoning_effort=xhigh -c service_tier=priority -o "$OUT" "프롬프트"`
- [ ] §4 플래그 설명에 `-m` / `-c model_reasoning_effort` / `-c service_tier` / `-o` 4개 추가 + "왜 xhigh+priority인가(깊게+빠르게, 토큰 비용 비고려; priority는 부하 시 큐 우선권이라 소규모엔 무효과일 수 있음)" 1단락
- [ ] §5 응답 파싱 (L90~120): `awk '/^codex$/.../^tokens used$/'` 스니펫 → **`-o "$OUT"`로 본문만 파일 수거** 방식으로 교체. "원본 출력 예시"는 참고로 남기되 추출 권장 경로를 -o로. **고유 파일명 규칙 명시** (`/tmp/codex_<phase>_<무작위>.txt`) — 동시 background 호출 충돌 방지
- [ ] L143 `GPT-5.2는 영문 응답 기본값` → `gpt-5.5는 영문 응답 기본값`
- [ ] §7 에러 처리 (L145~157): **Timeout(30초) 행 + `timeout 30 bash -c` 스니펫 제거**. 대체 문구: "호출은 background 병렬이라 codex가 느려도 기다리지 않는다 — gate에서 ready면 수거, 아니면 degrade. 영원히 hang하는 경우도 Claude를 막지 않으며 세션 종료(Stop 훅)가 orphan 정리. **숫자 timeout 불필요.**"
- [ ] L164 성능 표 `응답 시간 10~30초 (GPT-5.2 추론...)` → 실측치(xhigh 소규모 ~5–10초, priority는 부하 시 큐 우선)로 갱신 + 토큰 행에 "비용 비고려 — 깊이/속도 우선" 비고
- [ ] §8.5: 본문 추출이 §5 공유라 자동 반영. "ready면 수거 else degrade(기다리지 않음)" 1줄 보강

**B. `skills/cp/SKILL.md`**
- [ ] L208 Phase 0.5 step3 `` `^codex$`~`^tokens used$` 본문 추출로 수거 `` → `-o 출력 파일에서 본문 수거 (상세: codex-integration.md §5)`
- [ ] L238 Phase 2.4 step1 `백그라운드 Codex 출력에서 본문 추출. timeout/실패면…` → `-o 파일에서 본문 수거. 미완/실패면 기다리지 않고 Claude 단독 진행`
- [ ] L372 Phase 3.2 step2 `codex exec --skip-git-repo-check "..."` → `§4 표준 호출(-m/-c/-o 포함) 그대로` 참조로 통일
- [ ] L391 Phase 3.2 `timeout, 인증 만료 시…` → `미응답/실패 시 Opus 결과만 사용` (timeout 어휘 제거)

**C. `skills/cc/SKILL.md`**
- [ ] L528 Phase 4.5 step3 백그라운드 호출 → `§4 표준 호출(-m/-c/-o)` 참조 명시
- [ ] L548 Phase 4.5 step4 `본문 추출(`^codex$`~`^tokens used$`)` → `-o 파일에서 본문 수거`
- [ ] L549 Phase 4.5 step5 `실패/timeout` → `미응답/실패` (timeout 어휘 정리)

**E. `skills/cc/SKILL.md` — Claude 모델 배정 상향 (Opus 우선; 사용자 지시 2026-05-30)**
- [ ] Model Assignment Table (2곳: 한글 표 + 영문 "Model Assignment Table") 및 난이도 매핑 수정:
  - Worker Easy: `haiku` → `opus`
  - Worker Medium: `sonnet` → `opus`
  - Worker Hard: `opus` (유지)
  - Supervisor: `sonnet(기본)/opus(조건부)` → `opus` 고정
  - QA: `haiku` → `opus` (실제 검증 수행 — 품질 중요)
  - Monitor: `haiku` **유지** (대시보드 상태 폴링만 — opus 품질 이득 0, 유일 예외. 사유 1줄 명시)
- [ ] 난이도 라벨(Easy/Medium/Hard)은 유지하되 substantive 작업은 전부 opus로 매핑. "비용 효율"/"과잉 비용 회피" 문구 → "품질 우선(토큰 비용 비고려)"로 갱신
- [ ] ASCII 다이어그램 박스(`Monitor Agent (Haiku)` / `sonnet model` / `haiku model`)를 새 배정과 일치하게 갱신
- [ ] 본문 예시 테이블(worker 배정 예시들)을 새 표와 모순 없게 최소 갱신 (예시는 SoT 아님 — 표와 일관성만 맞춤)
- [ ] verify: `cc/SKILL.md`에서 Worker/Supervisor/QA가 opus, Monitor가 haiku로 표기됨

**F. `skills/cp/SKILL.md` — 확인만 (변경 없음)**
- [ ] Phase 3.1 pre-mortem이 이미 opus임을 확인 — 다운그레이드 지점 없음. /cp는 plan-only라 worker 미생성. (검증 #7)

**D. 버전 · 릴리즈**
- [ ] `bash scripts/bump-version.sh 3.11.0` (plugin.json/marketplace/hooks/SKILL.md 등 11곳 일괄)
- [ ] `CHANGELOG.md` v3.11.0 항목 추가 (codex 호출 깊게+빠르게 고정, drift/잔재 정리)
- [ ] `creeta-lens/CLAUDE.md` Version feat 1줄 추가
- [ ] (배포) commit + tag `v3.11.0` + push — marketplace `ref`가 태그를 가리킴. **사용자 승인 후 별도 실행**

### 막힐 수 있는 지점 (→ Plan B 트리거)
- `service_tier=priority`가 다른 codex 빌드/계정에서 **거부** → codex exec 에러
- `-o` 플래그가 구버전 codex(Mac Mini 등 다른 머신)에 **부재** → 호출 실패
- background 다중 호출이 **같은 -o 파일명** 사용 시 덮어쓰기

## Plan B — Fallback 경로

### Trigger
Plan A **A단계 적용 후 codex 실호출 테스트(검증 #4)** 에서 `service_tier` 또는 `-o`가 거부/부재로 에러나면 즉시 전환.

### 왜 이 대안인가
핵심 가치(xhigh 깊이 + 모델 drift 제거)는 모든 환경에서 안전. priority/-o는 **이 머신에서만 실측 검증**됨 — 다른 codex 빌드에서 다를 수 있다. 거부 시 부가분만 빼고 핵심은 살린다 (더 보수적, 호환성↑).

### 단계
- [ ] `service_tier=priority` 제거, `-m gpt-5.5 -c model_reasoning_effort=xhigh`만 유지
- [ ] `-o` 거부 시 §5 파싱은 기존 awk 유지(롤백), 단 model/xhigh/timeout 정리는 그대로 적용
- [ ] 거부된 플래그는 codex-integration.md에 "이 환경 미지원" 주석으로 사유 명시

## 🔀 듀얼 합성 (Claude ‖ Codex)

**단일 모델 — Codex 조사 degrade.** Phase 0.5 Codex 독립조사가 (1) sandbox 정책으로 `codex exec --help` 차단, (2) 한글 출력 인코딩 깨짐(mojibake)으로 실질 degrade. codex가 낸 유효 포인트 1개 = "`-o` 플래그 실제 동작을 로컬 CLI help로 확인하라" → **이미 Claude가 직접 실측으로 검증 완료**(-o가 최종 답변 본문만 파일로 떨굼 확인). 이는 본 작업이 인코딩하려는 *graceful degrade* 의 실증 사례이므로, Claude 단독안으로 진행하고 분기 없음.

## ⚠️ 사전 리스크 (Pre-mortem)

### Claude Opus 관점 (세션 컨텍스트 기반)
1. **죽은 설명 잔류**: `-o`로 본문만 받으면 §5의 "원본 출력 예시"(`reasoning summaries`/`session id`/`tokens used`)가 더 이상 추출에 안 쓰여 오해 유발. 삭제 말고 "참고용 — 추출은 -o 권장"으로 강등 필요.
2. **priority 오해**: 실측상 priority는 소규모 작업에 무효과(compute-bound). 문서에 "부하 시 큐 우선권일 뿐"을 안 적으면 "빨라진다"는 잘못된 기대. → §4 플래그 설명에 명시 (Plan A에 반영됨).
3. **-o 파일명 race (최대 위험)**: Phase 0.5·2.4·4.5가 background 병렬인데 같은 `/tmp/codex.txt`를 쓰면 덮어쓰기. §5에 **고유 파일명 컨벤션 1개**를 표준으로 박아야 함 (Plan A "고유 파일명 규칙"과 매핑).
4. **머신 간 전파**: `bump-version.sh`는 이 레포만 갱신. Mac Mini 등 다른 머신은 push 후 `/lens-upgrade` 해야 반영 — 검증 #5는 이 PC 한정. 완료 노트에 명시.

### Codex 관점 (독립 코드 분석)
Codex 미사용 — Phase 0.5 조사가 sandbox 차단 + 인코딩 깨짐으로 degrade (🔀 듀얼 합성 참조). 단일 모델 pre-mortem.

### Trigger 매핑 (Pre-mortem → Plan B 전환점)
- 리스크 3(파일명 race) → Plan A A단계 "고유 파일명 규칙 명시"로 흡수 (신규 Trigger 불요).
- 리스크 1·2 → Plan A 문구 단계로 흡수.
- Blocker 수준(보안/data loss/되돌릴 수 없는) **없음** — 모두 문서 편집, git revert 가능.

## 진행상황
- **마지막 업데이트**: 2026-05-30
- **현재 경로**: Plan A — 완료
- **상태**: A~F + D 적용 완료. **배포 완료** (commit `b7c195f` + tag `v3.11.0` push → livevil7/creeta-lens = CreetaCorp/lens, 동일 레포). **업그레이드 완료** (`scripts/upgrade.sh` → 캐시 3.11.0 설치, `plugin list` v3.11.0 확인). 검증 #1·#2·#3·#5·#6·#7 전부 통과.
- **재개 포인트**: 없음 — 작업 완료. 단 **이 PC는 Claude Code 재시작 후** 3.11.0이 활성화됨(현재 세션은 3.10.0 캐시 잡고 있음). 다른 머신은 `/lens-upgrade`. 정리는 `/cp done` 으로 history 이동.
