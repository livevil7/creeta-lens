# /cu plugin scope + winget UTF-8 + /cc UI/UX 스킬 의무 할당 — 완료

**완료일**: 2026-06-18

## 요약
`/cu`(Lens Update)가 local/project scope 플러그인을 user scope로만 갱신하려다 "not installed at scope user"로 실패하던 버그와, winget의 UTF-8 박스문자에서 리더 스레드가 cp949 디코드로 죽어 출력이 비어 gh를 "winget 미감지"로 오탐하던 버그를 한 번에 수정했다. 동시에 `/cc`(Lens Multi) Phase 1.3에 화면·UI 서브태스크의 ui-ux-pro-max 스킬 의무 할당을 추가했다. marketplace `source.ref`가 고정 태그라 소스 수정만으로는 dormant 상태가 되므로 v3.19.0 → v3.20.0 bump + commit + tag + push로 전파했고, 활성 캐시에도 핫미러해 즉시 적용했다.

## 주요 결정 사항
- **scope를 installed_plugins.json에서 실측해 전달**: `_plugin_scope_info()`로 각 플러그인의 실제 scope를 읽어 `--scope <scope>`로 넘기고, local/project scope는 `projectPath`를 cwd로 실행. user scope만 가정하던 기존 동작이 context7·playwright(local scope) 갱신을 깨던 원인이라 실측 기반으로 전환.
- **run()에 UTF-8 강제 디코딩**: `encoding="utf-8", errors="replace"`를 추가. winget이 출력하는 UTF-8 박스문자(0xe2…)를 cp949로 읽던 리더 스레드가 UnicodeDecodeError로 죽어 winget 출력이 비고, 그 결과 gh가 "winget 미감지—수동 안내"로 오탐되던 연쇄를 끊음. scan stderr 노이즈도 함께 제거.
- **ui-ux-pro-max는 재설치하지 않음**: 이미 `~/.claude/skills/ui-ux-pro-max`에 설치돼 있음을 확인. `/cc` SKILL.md Phase 1.3에 기존 "필수 실행 스킬" 메커니즘으로 의무 할당만 추가하고, 미설치 머신은 네이티브 UI/UX 베스트프랙티스로 graceful degrade하도록 설계.
- **bump + 핫미러 동시 전파**: marketplace `source.ref`가 고정 태그라 소스 수정만으로는 휴면 상태이므로 3.19.0 → 3.20.0 bump·commit·tag·push로 정식 전파. 동시에 활성 캐시(`cache/CreetaCorp/lens/3.19.0`)의 `cu.py`·`cc/SKILL.md`를 핫미러해 이 PC에서 즉시 동작하게 함.

## 변경 파일
- `scripts/cu.py` — `_plugin_scope_info()` 추가, `_upgrade_plugin_generic()`의 scope/cwd 처리, `run()` UTF-8 디코딩
- `skills/cc/SKILL.md` — Phase 1.3 화면·UI 서브태스크 ui-ux-pro-max 의무 할당
- bump 13파일 — `plugin.json`, `marketplace.json`, `CHANGELOG.md`, `CLAUDE.md`, `README.md`, hooks ×2, skills SKILL.md ×6 배너
- 메모리 — `cu-winget-false-negative-windows.md` + `MEMORY.md` 인덱스를 "v3.20.0에서 코드 수정됨—수동 워크어라운드 불필요"로 갱신

## 테스트 & 검증
실측으로 확인:
- ✅ `/cu scan`에서 cp949 traceback 사라짐 + gh `can_auto=True` (winget 소스 감지)
- ✅ `context7` plugin `update --scope local` exit 0 (local scope 갱신 정상)
- ✅ GitHub Release `isLatest=true` (v3.20.0 commit 4f1f606, tag push, Latest 지정)

## 추가 사항
- (선택) Mac Mini 등 타 머신은 `/lens-upgrade`로 3.20.0 반영
- (선택) 라벨 정리를 위해 이 PC도 `/lens-upgrade` + 재시작
