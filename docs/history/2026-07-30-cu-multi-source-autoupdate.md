# /cu 고도화 — 다중 소스 전수 스캔 + 무확인 자동 업데이트 — 완료

**완료일**: 2026-07-30
**출시**: v3.26.0 (커밋 `c4b7237` + `fcd3bc5`, 태그 `v3.26.0`)

## 요약

`/cu` 를 "아는 도구 3개 확인기"에서 **이 머신의 업데이트 관제**로 바꿨다. 도구 이름을 손으로 적어두던 방식을 버리고 패키지 매니저 7종(winget·npm-global·vscode-ext·claude-plugin·cli-special·pip-global·brew)이 스스로 열거하게 했고, 매 실행마다 뜨던 확인 게이트를 제거해 `auto` 등급을 묻지 않고 실행한다. 되돌리기 어려운 것은 `hold`/`never` 로 분리했다.

**착수 근거는 실측이었다** — `/cu` 가 업데이트 대기 **25건 중 0건**을 보고하고 있었다. winget 설치 143개 중 19개, npm 글로벌 8개 중 6개가 낡은 채였고 VS Code 확장 40여 개는 목록에 존재조차 없었다. 못 찾은 게 아니라 **찾지 않았다**: `cu.py` 가 함수 3개(claude·codex·gh)를 하드코딩으로 부르는 구조라 목록에 없는 도구는 영원히 안 보였다. 여기에 플러그인 버전 **오탐 2건**(최신인데 "업데이트 있음")까지 겹쳐 표 전체가 신뢰를 잃은 상태였다.

## 주요 결정 사항

- **소스 단위 열거로 전환** — CLI 하나당 함수 하나를 쓰는 구조를 버렸다. 패키지 매니저가 이미 전체 목록을 알고 있으므로 그쪽에 물어본다. 결과적으로 새 도구를 깔면 코드 수정 없이 목록에 편입되고, `cli:codex`·`cli:gh` 전용 스캐너는 삭제됐다(각각 npm·winget 이 잡는다).
- **확인 게이트 제거는 정책으로 구현** — 질문을 없애되 판단은 남겼다. 매번 묻는 대신 위험도를 미리 정해두고 안전한 것만 실행한다.
- **`never` 3단계를 신설** (Pre-mortem P1) — 처음 설계는 2단계(`auto`/`hold`)에 `/cu all` 이 hold 전량을 실행하는 것이었다. 그런데 hold 에 PostgreSQL 이 있어 **`/cu all` 오타 한 번으로 DB 마이그레이션이 일어난다.** "사용자가 `all` 을 타이핑했으니 승인"이라는 논리는 되돌릴 수 없는 손실을 정당화하지 못하므로, `/cu all` 로도 실행되지 않는 층을 뒀다.
- **`never` 를 문서가 아니라 코드로 강제** — 이것이 이번 작업의 가장 중요한 수정이다. 상세는 아래 "검증" 참조.
- **정책을 파일 상단 상수 한 블록에 집결** — `HOLD_KEYWORDS`/`NEVER_KEYWORDS`/`NEVER_WINGET_IDS`/`SPECIAL_DEDUP`. 조건이 코드 곳곳에 흩어지면 "왜 이게 hold 인가"를 추적할 수 없다.
- **판단 불가는 항상 보수적으로** — 버전 파싱 실패, 형태 불일치, 미지의 mode 값은 전부 안전한 쪽(hold / `None` / auto 제외)으로 떨어뜨렸다.
- **위험도를 설정 파일로 빼지 않았다** — 요청하지 않은 설정 가능성이고, 파일이 없을 때·깨졌을 때 처리가 붙는다. 조정이 필요해지면 그때 뺀다.
- **LLM 에게 위험도 판단을 위임하지 않았다** — 실행 정책은 결정적이어야 한다. 인증·네트워크·모델 변경으로 정책이 흔들리고 "왜 이게 올라갔나"를 재현할 수 없다.
- **fixture 는 실캡처만** — 손으로 쓰면 컬럼 폭이 실물과 어긋나 "테스트는 통과하는데 파서는 깨지는" 최악의 조합이 된다.

## 변경 파일

**구현**

- `scripts/cu.py` — 497줄 → 약 900줄. 소스 스캐너 7종 + 계약 함수 6개(`parse_winget_upgrade`·`compare_versions`·`is_major_jump`·`classify_risk`·`dedup_items`·`upgrade_targets`) + `never_reason` 실행 경계 게이트 + 정책 상수 블록 + 사전 스냅샷
- `scripts/cu.test.py` (신규) — 단위 테스트 68개
- `tests/fixtures/winget-upgrade.txt` (신규) — 실제 `winget upgrade` 출력 캡처
- `tests/fixtures/winget-cjk-rows.txt` (신규) — 실제 한글 패키지명 행 캡처
- `tests/fixtures/npm-outdated.json` (신규) — 실제 `npm outdated -g --json` 캡처

**문서**

- `skills/cu/SKILL.md` — 절차 전면 재작성(확인 게이트 제거·3모드·3단 위험도표·실행 전 예고·재스캔 규칙 교체·`source_errors` 보고 의무·승격 일괄 명령)
- `README.md` — `/cu` 절 갱신 (파괴적 변경 고지 포함)
- `CHANGELOG.md` — v3.26.0 항목
- `docs/tasks/2026-07-30-cu-multi-source-autoupdate.md` + `.html` — 계획서 (이 history 로 이관)

**릴리즈 부수 변경** — `.claude-plugin/marketplace.json`·`plugin.json`, `CLAUDE.md`, `hooks/hooks.json`, `hooks/session-start.js`, `skills/{c,cc,ccp,ci,cp,cs}/SKILL.md` (버전 문자열 44곳), `docs/board_creeta-lens.html`

## 테스트 & 검증

**단위 테스트**: `python scripts/cu.test.py` → **68/68 passed, exit 0**

**실측 검증** (레포의 `scripts/cu.sh` 직접 호출)

| 목표 | 결과 |
|---|---|
| 종류를 가리지 않고 한 목록 | 소스 6종 **34항목** (winget 19·plugin 6·npm 6·cli 1·vscode 1·pip 1), 중복 0, `source_errors` 없음. 개편 전 9~10항목 |
| 고르지 않아도 최신으로 | **auto 9건 실제 업그레이드** (winget 5 + npm 4). 업그레이드 중 확인 질문 0회. 재스캔에서 34 → 25항목 |
| 되돌리기 어려운 것은 미실행 | hold 14 · never 3 **버전 전부 불변** — PostgreSQL 18.4-1 · Node 24.15.0 · Python 3.13.13 · VCRedist 14.44.35211.0 · AppInstaller 1.29.279.0 · railway 4.65.0 · shopify 3.94.3 |
| 플러그인 버전 정확 | 오탐 2건 해소(agentmemory `0.9.28→0.9.28 False`, insane-search `0.13.0→0.13.0 False`), ❓2건 판정 성립(context7·playwright SHA 대 SHA) |

`bash scripts/cu.sh upgrade winget:PostgreSQL.PostgreSQL.18` → **실행 없이 exit 3 거부**, PostgreSQL `18.4-1` 유지.

**더블 게이트가 결함 14건을 잡았다.** Codex(2라운드) + Supervisor 가 검토했고, 1라운드는 양쪽 모두 **fail** 이었다.

가장 중요한 지적은 두 리뷰어가 **독립적으로 같은 것**을 짚은 것이다 — `never` 등급이 **문서로만 막혀 있고 코드로는 열려 있었다.** `upgrade_targets()` 가 never 를 제외하도록 설계했지만 **실행 흐름은 그 함수를 경유하지 않는다**(에이전트가 스캔 JSON 을 읽고 `cu.sh upgrade <id>` 를 개별 호출). 즉 `upgrade_targets` 는 테스트에서만 불리는 죽은 방어선이었고, 에이전트가 판단을 한 번 틀리면 DB 가 올라갔다. 실행 경계(`cmd_upgrade`)에 `never_reason()` 게이트를 넣어 해소했다.

**실행해보지 않으면 못 잡을 함정 3건**

- **winget HRESULT 마스킹** — Python `subprocess` 는 32비트 원값(`0x8A15002B` = 2316632107)을 받지만 셸은 하위 1바이트(43)만 보여준다. 셸에서 잰 값을 상수로 쓰면 Python 경로에서 하나도 안 맞는다. 실제로 이 함정에 빠졌다가 실측으로 발견했다. 양쪽 표현을 모두 인정하고, winget 원시 코드를 종료코드 규약(0/1/2/3)으로 사상해 해석 불가한 값이 새어 나가지 않게 했다.
- **소스 일시 장애** — msstore REST API 오류(`0x8A15003B`)로 winget 5건이 전부 실패했고, 같은 명령 재시도로 통과했다. 한 번의 일시 장애로 그날의 자동 갱신이 통째로 날아가지 않도록 재시도 1회를 넣었다.
- **CJK 표시폭** — winget 은 표시 폭으로 컬럼을 정렬하므로 한글 이름 행은 문자 인덱스가 어긋난다. 이 머신 출력에 실제로 한글 패키지명(`AVC 인코더 비디오 확장`)이 있어 가설이 아닌 라이브 경로였다.

**그 외 수정된 결함**: `upgrade_targets` fail-open(`mode != "default"` 라 오타가 hold 를 해제) · 최신 항목까지 매번 재설치 · `/cu scan` 이 실제로 업그레이드 실행 · 소스 실패 시 "모두 최신" 종료 · 사후 재스캔이 사전 스냅샷 파괴 · winget 실패가 소스를 조용히 삭제 · 비영어 로케일 0건 · 드라이버 복합어 누락 · `/cu all` UAC 무한 대기 · README 계약 불일치 · stderr 한글 mojibake.

## 추가 사항

**⚠️ 출시됐지만 이 머신에서 활성이 아니다.** 활성 플러그인 캐시는 `~/.claude/plugins/cache/CreetaCorp/lens/3.25.0` 이고 거기의 `cu.py` 는 구버전이다(계약 함수 0/3). `/cu` 를 치면 여전히 옛 스캐너가 돈다. 활성화: `/lens-upgrade` → **Claude Code 완전 재시작**. 이번 검증은 전부 레포의 `scripts/cu.sh` 를 직접 호출해 수행했다.

**승격 커버리지 한계.** 비승격 셸에서는 winget 19건 중 auto 가 **5건뿐**이다. Git 2.54→2.55 · AWS CLI · Tailscale · WeChat · QMK Toolbox · Futuremark 6건은 위험해서가 아니라 **권한 때문에** hold 로 갔다. 관리자 권한 세션에서는 auto 가 된다. `SKILL.md` 가 PowerShell `foreach` 루프 한 줄을 제시하도록 해뒀다 — winget 은 `--id` 중복을 거부하므로(exit 2) 단일 명령으로는 묶을 수 없다.

**context7·playwright 는 재시작 대기 상태.** `claude plugin update` 가 `refreshed from source. Restart to apply changes.` 로 응답했고, 재시작 전까지 레지스트리 SHA 가 안 바뀌므로 `/cu` 가 계속 대기로 표시한다 — 실패가 아니라 정직한 상태다.

**후속 (이번 범위 밖)**

- **Mac Mini(brew) 실측** — `brew` 스캐너는 자리를 만들었으나 Windows 에서만 검증했다.
- **`lib/install-sync.js` 일관성** — 조사 결과 그쪽은 설치 유무만 대조하고 최신 버전 해석 로직이 아예 없어 이번 규칙과 충돌하지 않는다. 후속 태스크 불필요로 판정.

**되먹임으로 남길 것**

- **계획 단계에서 파일 단위 충돌을 태스크 분할에 반영해야 한다.** T1~T5 를 병렬 태스크로 쪼갰지만 전부 같은 `cu.py` 를 수정하므로 실제로는 직렬화가 강제됐다. Pre-mortem 이 T3·T4 만 지적했는데 실은 T1~T5 전체가 같은 문제였다.
- **mtime 부재는 에이전트 사망 근거가 못 된다.** 배포 8분 시점에 산출물이 없다는 이유로 "Worker 3개 사망"으로 판단하고 직접 실행 전환을 선언했으나 오판이었다 — 세 Worker 모두 정상 동작했다(212·294·854초 완료). 대형 계획서를 읽는 동안은 산출물이 없는 것이 정상이며, 생존 판정 기준은 완료 알림이어야 한다.
- **실행 지표**: 추가 질문 0회(승인 게이트 2회는 스킬 규정 절차라 제외) · 편차 15건 · 게이트 통과(구조 `valid:true`, 차단 질문 0, 우회 없음)
