---
name: public-distribution-hardening
plan_id: 2026-05-21-public-distribution-hardening
description: Lens v3.6.4 — 범용 공개 배포 하드닝 (하드코딩/개인정보 제거 + cross-platform 버그 수정) 완료
status: done
completed: 2026-05-21
---

# Lens 범용 공개 배포 하드닝 — 완료

**완료일**: 2026-05-21 · **릴리스**: v3.6.4

## 요약

낯선 사용자가 받아 써도 개인 identity 노출·끊긴 포인터·플랫폼 깨짐이 없도록 Lens 플러그인을 정리했다. 5개 스킬 + 스크립트 + manifest/template을 **병렬 4-에이전트**로 코드리뷰(raw ~70건) → Karpathy 기준 필터링(15건 채택, 9건 거부) → 6워커 병렬 수정 → QA 실측 → **v3.6.4** 릴리스 + `/lens-upgrade` 설치 검증까지 완료.

## 주요 결정 사항

- **Karpathy Rule 2로 강하게 필터링** — 에이전트가 제안한 env var 남발(`LENS_DOCS_DIR`/`LENS_MAX_*`/`LENS_*_TIMEOUT_MS` 등 8종), 엔터프라이즈 드라이브 대응, 스키마 마이그레이션 등 **요청 안 한 speculative 유연화 9건을 의도적으로 거부**. 배포 안전성과 직결된 것만 채택.
- **marketplace 이름은 유지, repo URL만 정정** — `"name": "CreetaCorp"`·설치키 `lens@CreetaCorp`는 식별자라 보존, stale `CreetaCorp/lens` repo URL만 실재 레포 `livevil7/creeta-lens`로.
- **M1 마켓플레이스 sync = pull-only 가드** — `/cs`가 플러그인 자기 repo로 auto-commit/push하면 위험 → marketplace 경로는 fetch+ff-pull만.
- **M7은 소프트 경고 대신 하드 게이트** — `/cp`가 md만 남기고 끝나던 구조적 결함을 "필수" 문구 반복(증상)이 아니라 **Phase 5.0 산출물 게이트**(md+html+board 3종 존재 검사)로 강제.
- **creetacorp remote 푸시 제외** — origin(livevil7/creeta-lens)으로 redirect되는 동일 레포라 origin만 푸시. 사용자가 의문 제기한 remote는 안 건드림.
- **dedup 버그는 거부** — 에이전트가 BLOCKER로 본 "Windows stat inode dedup 깨짐"은 실측 결과 정상 작동이라 제외(과진단 정정).

## 변경 파일 (23개, commit `fbf6c46`)

- **스크립트**: `scripts/git-sync-all.sh` (B1 author·M1 marketplace·M5 push remote·M6 scan roots), `scripts/upgrade.py` (M3 dry-run fetch·M4 동적 브랜치), `scripts/bump-version.sh` (M2 BSD sed)
- **manifest/README**: `.claude-plugin/plugin.json`, `.claude-plugin/marketplace.json`, `README.md` (B2 URL)
- **스킬**: `skills/cp/SKILL.md` (M7 게이트·N1·N6 `{lens}`·GPT-5.2), `skills/c|cc|cs/SKILL.md` (N1·N2·N4)
- **템플릿/docs**: `templates/report-plan.example.html`·`report-history.example.html`·`report-shared.css`·`board.template.html` (N3), `docs/rules/codex-integration.md` (N5)
- **기타**: `.gitignore` (`.agents/` 추가), `CHANGELOG.md`, `CLAUDE.md`, `hooks/hooks.json`·`session-start.js` (버전 bump), task 문서 2종

## 테스트 & 검증

QA를 텍스트 검토가 아닌 **실제 명령**으로 수행 (7개 성공기준 전부 PASS):

- `grep` 0건 — 강제 commit identity / `/c/Users`·`C:/Users`·`/Users/user` 절대경로 / `livevil-setting`·`spotedcrypto`·`livevil-contents`·`namane`·`GPT-5.2` 개인 컨텍스트 (CHANGELOG·docs/history 제외)
- `grep "CreetaCorp/lens"` .claude-plugin/·README = 0 (`"name":"CreetaCorp"`만 잔존, 의도)
- `bash -n` (git-sync-all.sh·bump-version.sh) + `ast.parse` (upgrade.py) 전부 OK
- `/cs` 마켓플레이스 root(line 35) + pull-only 가드(line 138) 구조 확인
- `/cp` Phase 5.0 산출물 게이트 텍스트 확인
- **`/lens-upgrade` 실측** — 마켓플레이스가 origin에서 v3.6.4 pull → 설치 → 검증: registry 1 entry, `claude plugin list` = v3.6.4

QA가 워커 자기보고가 놓친 3건(cp/SKILL.md의 GPT-5.2, board.template.html의 livevil-contents, example의 namane)을 잡아 추가 수정 — "trust but verify"로 누락 차단.

## 추가 사항

- **Claude Code 재시작 필요** — 현재 세션은 캐시 v3.6.3로 동작. 재시작해야 v3.6.4 로드.
- **stale task 2건 잔존** — `docs/tasks/2026-05-16-cp-goal-first-overhaul.md`(v3.4.0 shipped), `2026-05-20-cp-html-reports-board.md`(v3.6.0 shipped)는 이번에 archive 안 함. 별도 `/cp done`으로 정리 가능.
- **메모리 기록** — `/cp` 필수 단계(HTML+board) 건너뛰기 금지를 feedback 메모리에 저장(세션 중 2회 발생).
- GitHub 릴리스: https://github.com/livevil7/creeta-lens/releases/tag/v3.6.4
