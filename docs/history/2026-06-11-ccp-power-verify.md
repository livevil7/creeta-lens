# /ccp (Lens Power Verify) 신설 + 5분 진행보고 규칙 — 완료

**완료일**: 2026-06-11

## 요약
이미 만들어진 산출물(기능·PR·화면·방금 빌드)을 출처 불문 독립적으로 적대적 감사하고, Playwright 등으로 실제 실행해 "진짜 작동하는가"를 증거화하며 최소 수복까지 책임지는 `/ccp` (Lens Power Verify) 스킬을 신설했다. `/cc`("만들면서 검증")와 `/ccp`("이미 만들어진 것을 독립 감사")의 경계를 한 문장으로 명문화했고, 4 렌즈(기능·엣지·회귀·UX) 적대적 검증과 파괴적 변경 차단·무한루프 방지·정직한 종료 같은 안전장치를 함께 박았다. 더불어 `/cc`·`/cp`·`/cpp`·`/ccp` 네 스킬에 공통 5분 진행보고 규칙을 추가했다. v3.16.0으로 배포 완료(commit 1bb756b, tag v3.16.0).

## 주요 결정 사항
- **출처 불문 standalone 감사로 경계 확정** — Codex 교차 협의(S4)에서 `/cc`와 중복 리스크가 크다고 판단, `/cc`="만들면서 검증" ↔ `/ccp`="이미 만들어진 것을 적대적으로 독립 감사해 증거화·수복"으로 한 문장 차별화. 같은 작업이면 `/cc`를 권유하는 다운그레이드 가드도 둠.
- **read-only 우선 · 파괴적 변경 차단** — "무슨 수를 써서라도 검증"을 read-only 범위까지로 한정. 배포·DB migration·대량삭제·외부 결제/메일은 dry-run 또는 승인 없이 금지(Codex critical 반영).
- **만장일치 게이트** — 4 렌즈 중 blocking refute가 1개라도 있으면 done 선언 차단(과반이 아닌 만장일치).
- **정직한 종료** — 못 끝내면 done 금지, `verified=false` + blocking + 다음 액션으로 마감.
- **무한루프 방지 cap** — 5회 + 예산 + 동일 실패 2회 시 전략 전환 + 3회 승인 cap으로 무한 수복 방지.
- **Surgical** — pass한 검증 축은 freeze, 실패 축만 수복. `/cc`·`/cp`는 5분 규칙 1줄 외 무수정.

## 변경 파일
- `skills/ccp/SKILL.md` (신설 — 배너 "Lens Power Verify v3.16.0", 증거수집→4렌즈 반박→최소수복→재검증→증거리포트 루프 + 안전장치 + 5분 보고)
- `skills/cc/SKILL.md` (기본값 #2 "2분"→"5분")
- `skills/cp/SKILL.md` (절대규칙에 5분 보고 1줄)
- `skills/cpp/SKILL.md` (절대규칙에 5분 보고 1줄)
- `scripts/bump-version.sh` (+ccp 배너, 12→13)
- `CLAUDE.md` (Skills 표 +/ccp 행 + v3.16.0 feat)
- `README.md` (/ccp 섹션)
- `CHANGELOG.md` (v3.16.0)

## 테스트 & 검증
EARS 6항목 전부 auto 검증으로 통과:
- ✅ 새 세션 시작 시 인벤토리에 `/ccp` 표시 (SKILL.md + SessionStart)
- ✅ `/ccp` 검증 시 4 렌즈 적대적 검증 수행 (SKILL.md 렌즈 섹션)
- ✅ blocking refute 1+ 시 done 선언 차단 (blocking=0만 pass)
- ✅ 파괴적 변경(배포·DB·대량삭제·결제/메일) 승인 없이 금지 (SKILL.md 안전장치 명시)
- ✅ 장시간 작업 시 4개 스킬 모두 5분 진행보고 ("5분" grep 4개 모두 적중)
- ✅ 릴리즈 tag 푸시 후 재설치 cache에 ccp/ 포함 (cache 3.16.0/skills/ccp 존재 확인)

배포 검증: commit 1bb756b, tag v3.16.0 push, 캐시 3.16.0 갱신에서 ccp/ + 5분 4스킬 모두 확인.

## 추가 사항
남은 후속(선택): gh release 생성, done-sweep의 cpp/ccp 마커 인식(v2). 둘 다 필수가 아니며 본 작업의 완료 정의에는 포함되지 않음.
