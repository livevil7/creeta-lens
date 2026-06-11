---
plan_id: plan_ccp_power_verify_v3160
date: 2026-06-11
planner: cpp
target_version: v3.16.0
status: approved
---

# /ccp (Lens Power Verify) 신설 + 5분 진행보고 규칙 — 빌드레디 계획

> `/cpp` 로 작성. Codex 교차 협의(S4) 반영본. spine: 🎯목표·📜Constitution·✅EARS검증·🛠빌드레디실행·진행상황.

## 🎯 목표 — 무엇이 가능해지는가 (사용자 입장)

- 사용자가 이미 구현된 무엇이든(기능·PR·화면·방금 빌드) `/ccp` 에 주면, **"진짜로 작동하는가"를 실제 실행(Playwright 등)으로 증명**받는다. 안 되면 고쳐서 **확실히 마무리**될 때까지, 또는 정직하게 "안 됨 + 막힌 지점"으로 끝난다.
- 검증은 **여러 적대적 시각**(깨려고 시도하는 N명)으로 — 한 명의 "되는 것 같다"가 아니라.
- `/cc`·`/cp`·`/cpp`·`/ccp` 모두 **장시간 작업 시 5분마다 진행 보고**한다 (침묵 금지).

🎬 **사용 장면**: 사용자가 "이 검수 화면 진짜 제대로 되는지 확실히 해줘" → `/ccp` 가 앱을 실제로 띄워(Playwright) 클릭·관측 → 4 렌즈가 각자 깨려고 시도 → 빈/에러 상태에서 깨지는 것 발견 → 최소 수복 → 재검증 → "전부 통과(증거 첨부)" 또는 "verified=false + 막힌 지점 2개 + 다음 액션".

**완료의 정의 (Done = ?):**

> `/ccp` 가 임의의 기존 산출물에 대해 실제 실행 증거와 함께 "작동 확인" 또는 "verified=false+blocking"을 내고, 4 렌즈 적대적 검증과 안전장치(파괴적 변경 차단·5회/예산 cap)가 동작한다.

## ✅ 검증 — EARS

| # | EARS | 확인 방법 | 통과 판정 | 종류 |
|---|------|----------|----------|------|
| 1 | WHEN 새 세션 시작, THEN 인벤토리는 `/ccp` 를 SHALL 표시 | `skills/ccp/SKILL.md` + SessionStart | 목록에 /ccp | auto |
| 2 | WHEN /ccp 가 검증, THEN 4 렌즈 적대적 검증을 SHALL 수행 | SKILL.md 렌즈 섹션 | 4 렌즈 명시 | auto |
| 3 | WHEN blocking refute 1+ , THEN done 선언을 SHALL 차단 | SKILL.md 게이트 | blocking=0 만 pass | auto |
| 4 | WHEN 파괴적 변경(배포·DB·대량삭제·결제/메일), THEN 승인 없이 SHALL 금지 | SKILL.md 안전장치 | 명시됨 | auto |
| 5 | WHEN 장시간 작업, THEN 4개 스킬은 5분 진행보고를 SHALL 수행 | /cc·/cp·/cpp·/ccp grep "5분" | 4개 모두 | auto |
| 6 | WHEN 릴리즈 tag 푸시, THEN 재설치 cache는 ccp/ 를 SHALL 포함 | cache 3.16.0/skills/ccp | 존재 | auto |

## 📜 Constitution — 불변 조항

1. **출처 불문 standalone 감사** — /ccp 의 경계: `/cc`="만들면서 검증", `/ccp`="이미 만들어진 것을 적대적으로 독립 감사해 증거화·수복". (Codex 합의)
2. **read-only 우선 · 파괴적 금지** — "무슨 수를 써서라도"는 read-only 검증까지. 배포·DB migration·대량삭제·외부 결제/메일은 dry-run 또는 승인 없이 금지. (Codex critical)
3. **정직한 종료** — 못 끝내면 done 금지 → verified=false + blocking + 다음 액션.
4. **Surgical** — pass 한 축 freeze, 실패 축만 수복. /cc·/cp 무수정(단 5분 규칙 1줄만).

## 🔀 Codex 교차 협의 (S4)

- **합의**: /cc 와 중복 리스크 큼 → 경계 한 문장으로 구별("출처 불문 적대적 독립 감사"). 4 렌즈(기능·엣지·회귀·UX), 만장일치 게이트(과반 아님).
- **Codex 채택(분기)**: "무슨 수를 써서라도" 위험 → read-only 우선 + 파괴적 차단. 무한루프 방지(5회+예산+동일실패 2회 전략전환+3회 승인). 실패=verified=false.

## 🛠 빌드레디 실행

- [ ] T1 `skills/ccp/SKILL.md` 신설 — 배너 "Lens Power Verify v3.16.0", 핵심 루프(증거수집→4렌즈 반박→최소수복→재검증→증거리포트) + 안전장치 + 5분 보고. 검증: 파일 존재 + 배너 grep. 의존: 없음
- [ ] T2 [P] `skills/cc/SKILL.md` 기본값 #2: "2분"→"5분". 검증: grep "5분". 의존: 없음
- [ ] T3 [P] `skills/cp/SKILL.md` 절대규칙에 5분 보고 1줄. 검증: grep. 의존: 없음
- [ ] T4 [P] `skills/cpp/SKILL.md` 절대규칙에 5분 보고 1줄. 검증: grep. 의존: 없음
- [ ] T5 `scripts/bump-version.sh` +ccp(Lens Power Verify 배너), 12→13. 의존: T1
- [ ] T6 [P] `CLAUDE.md` Skills 표 +/ccp 행 + v3.16.0 feat. 의존: 없음
- [ ] T7 [P] `README.md` /ccp 섹션. 의존: 없음
- [ ] T8 `bump-version.sh 3.16.0` + CHANGELOG. 의존: T5,T6,T7
- [ ] T9 commit + tag v3.16.0 + push. 의존: T8
- [ ] T10 재설치 + cache ccp/ 검증. 의존: T9

## ⚠️ 리스크

- **R1(높음) /cc 중복** → 경계 명문화 + "이미 만들어진 것 감사" 진입점으로 차별. 같은 작업이면 /cc 권유(다운그레이드 가드).
- **R2(높음) 파괴적 부작용** → Constitution 2조 안전장치(read-only 우선·승인 게이트).
- **R3(중간) 무한 수복** → 5회+예산+전략전환+승인 cap.

## 진행상황
- **마지막 업데이트**: 2026-06-11
- **현재 경로**: ✅ 완료·배포 (commit 1bb756b, tag v3.16.0 push, 캐시 3.16.0 갱신 — ccp/ + 5분 4스킬 확인)
- **재개 포인트**: 없음. 새 세션 재시작 시 인벤토리에 `/ccp` 등장. (`/cp done` 으로 아카이브 가능.)
- **남은 후속(선택)**: gh release 생성, done-sweep cpp/ccp 마커 인식(v2).
