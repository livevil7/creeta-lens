# Lens 관제 모드 · 일괄 마감 · 한 단어 승인 · 멈춘 계획 알림 — 완료

**완료일**: 2026-11-08

## 요약
관제 세션 1개 + 역할 세션 여럿으로 일하는 방식을 Lens 가 정식으로 받도록 확장했다: 관제 명령 `/ct` 신설, `/cd` 관제 일괄 마감(끝난 세션만, 전→후 숫자), `/cp` 한 단어·부분·생략 승인, `/cc` 가 시작·끝·멈춤을 계획서에 기록하고 멈춘 계획을 세 곳 첫 줄에 노출, 계획서 작성 모델 등급별 배분. 릴리스 v3.53.0(2026-10-24, GitHub Release, SJ-OMEN `/lens-upgrade` 3.53.0 확인). 같은 판에 모델 배분 기본값 sonnet(32a251e)도 반영. 브랜치 `feat/control-mode-approval-loop` 는 master 에 직접 반영돼 로컬 tip ed881cb 가 origin/master 의 조상이다(병합 커밋 없음). Goal 5/5, QA 실측 5/5, 자동 완료 조건 13/13.

## 주요 결정 사항
- 계획서 모델 = 난이도 배분 확정(대표 2026-10-23): 기본 등급은 상위 모델 세션이 직접, deep 만 최상위.
- d1 공용 계획 채널(2026-10-03) 겹침 → 이번 계획으로 흡수, 그 계획은 1단계만 끝난 것으로 마감.
- d2 승인 질문 생략 → 네 가지 조건(기본 등급 · 🙋 0 · Blocker 0 · 정지 지점 없음)을 모두 만족할 때만 생략.
- 실행 승인 "지금 실행"(2026-10-23 23:52 KST). 모델 배분: 어렵지 않은 일은 sonnet(대표 2026-10-24, 인벤토리 #43).
- Codex 사전 부검 15건 전부 반영(인벤토리 34 → 42행). 9회 Codex 리뷰(지적 14건 → 반영 14건, 마지막 PASS), Supervisor 87/100.
- 편차 9건 요약: 관제 표식은 참여 세션 id 목록+범위+12시간 만료로 단순화 · `--take-over` 등은 `on` 재호출로 대체 · `/cd` 는 표에 적은 가지·워크트리만 삭제(`<branch>-*` 자동 포함 안 함) · 반환 키 `kept` → `skipped` · 단건 `/cd` Phase 4 는 여전히 레포 전체 `--finish`(다음 개선 후보) · grade 없음/`standard` 는 기본으로 판정 · cancelled 사유는 lens-gate 출력에만 · 새 가지 병합 오탐 방지 · 기존 실패 `plan-coverage.test.js` 별도 수정(138c75b).

## 변경 파일
`git diff --stat 64af4c9 ed881cb`(시작 SHA → tip): 45개 파일, +2,670 / -153. 커밋: 138c75b, 6d99389, 78b27ed, 32a251e, ed881cb.
- 신규: `skills/ct/SKILL.md`, `lib/control-mode.js`(+test), `lib/cd-manager.js`(+test), `lib/plan-scan.js`(+test), `templates/ct-board.html`(+test), `templates/ct-assign.md`
- 훅: `hooks/pre-tool-ask.js`, `hooks/pre-tool-plan-doc.js`, `hooks/post-tool-plan-doc.js`, `hooks/session-start.js`, `hooks/hooks.json` 및 각 테스트
- 스킬·템플릿: `skills/cc/SKILL.md`, `skills/cd/SKILL.md`, `skills/cp/SKILL.md`, `skills/ci/SKILL.md`, `skills/cs/SKILL.md`, `templates/cp-questions.html`(+test)
- 라이브러리·스크립트: `lib/plan-manager.js`, `lib/gate-ledger.test.js`, `lib/plan-coverage.test.js`, `scripts/lens-cli.js`(+test), `scripts/lens-gate.js`, `scripts/prune_branches.py`, `scripts/prune_finish.test.py`, `scripts/bump-version.sh`
- 문서·메타: `CHANGELOG.md`, `CLAUDE.md`, `README.md`, `docs/START_HERE.md`, `docs/rules/harness-rules.md`, `.claude-plugin/*.json`, `.codex-plugin/plugin.json`, 이 계획서와 `.research.md`

## 테스트 & 검증
검증 1~14(auto) 전부 통과: plan-scan(5분류·재개 포인트·맡은 세션 없음→즉시 멈춤) · gate-ledger/lens-gate(executing→done, 포기 1건→blocked) · session-start(캐시만, 1초 이내) · cp-questions/ct-board · plan-coverage(부분 승인 파생) · pre-tool-plan-doc(모델 게이트 6케이스) · pre-tool-ask(E7 7케이스) · parked 통과 · cd-manager · prune_finish(기존 7 + 신규 6) · lens-cli 라우팅 · 계획서 게이트 `valid true` · 멈춘 계획 스캔 실측(N≥2, `.lens/plan-scan.json` 생성) · `bump-version.sh 3.53.0` 배너 전부 확인.
검증 15~18(manual, 대표 확인)은 미수행.

## 추가 사항
대표가 2026-11-08 마감을 승인했으나 아래는 계획서상 미완으로 남아 있다.
- 대표 확인 4건(검증 15~18):
  - 15: 관제 `/ct` 로 두 세션에 배정 → 두 세션의 `[이름]` 보고 6줄이 관제에 오고 관제판 세션 표에 보임.
  - 16: 승인 질문에 채팅 「a」, 다른 계획에 「c 1-5」 → 전자 approved + 같은 턴 `/cc` 시작, 후자 6행 이후 보류 + 🔁 블록.
  - 17: 관제판 결정에 답 → 세션이 5요소 메시지로 재질문 없이 진행. 작업 세션 하나를 끈 뒤 `/ct 점검` 첫 줄에 「멈춘 계획 1건 — 체크 N/M」.
  - 18: `/ct 마감` 묶음 승인 뒤 전→후 표(끝난 계획만 history, 남은 워크트리 그대로, In Review 구분) 및 머신별 `/lens-upgrade` 뒤 새 세션 배너 v3.53.0.
- 다른 PC `/lens-upgrade` 미확인(SJ-OMEN 만 확인됨).
- 후속: 2026-10-03 공용 계획 채널을 1단계 완료로 `/cd` 마감(d1). 실행 여부는 이 계획서에 기록 없음.
- 단건 `/cd` 를 `--only` 로 바꾸는 것은 다음 개선 후보.
