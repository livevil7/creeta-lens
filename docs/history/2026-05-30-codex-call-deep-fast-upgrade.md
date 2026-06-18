# Codex 호출 업그레이드 — 깊게(xhigh) + 빠르게(priority) + drift/잔재 정리 — 완료

**완료일**: 2026-05-30

## 요약
lens가 codex를 부를 때 항상 가장 깊은 추론(`model_reasoning_effort=xhigh`)과 가능한 한 빠른 처리(`service_tier=priority`)로, 깨짐 없는 본문 수거(`-o`)로 호출하도록 표준 호출을 고정했다. 동시에 문서에 남아 있던 모델 drift(GPT-5.2 표기 → 실제는 gpt-5.5)와 취약한 텍스트 파싱(`^codex$`~`^tokens used$` awk 추출)·숫자 timeout 잔재(`timeout 30`)를 제거했다. 또한 `/cc`의 Claude 역할(Worker·Supervisor·QA)을 opus로 상향하고 Monitor만 haiku로 남겼다. SoT는 `docs/rules/codex-integration.md` 한 곳에서 고치고 `cp`/`cc` SKILL.md는 "§N 참조"로 통일했다.

## 주요 결정 사항
- **SoT 단일화 (Plan A)**: 호출 패턴·파싱·에러처리를 중앙 규칙 `codex-integration.md` 한 곳에서만 고치고, SKILL.md에 흩어진 직접 인용은 "§4/§5 참조"로 바꿨다. 외과적 변경 + 버전 전파는 `bump-version.sh`가 11곳을 일괄 처리하므로 수동 편집 대상이 아니다.
- **깊이·속도 우선 (토큰 비용 비고려)**: 사용자 방침에 따라 `gpt-5.5` + `xhigh`(깊게) + `priority`(빠르게) + `-o`(깨짐 없는 수거)로 고정. priority는 부하 시 큐 우선권일 뿐 소규모 작업엔 무효과일 수 있다는 점을 문서에 명시해 "빨라진다"는 오해를 방지했다.
- **숫자 timeout 폐기**: codex 호출은 background 병렬이라 느려도 기다리지 않는다. gate에서 ready면 수거, 아니면 degrade하고 Claude가 단독으로 끝까지 진행한다. 영원히 hang해도 Claude를 막지 않으며 세션 종료(Stop 훅)가 orphan을 정리하므로 숫자 timeout이 불필요하다.
- **`-o` 파일명 race 방지**: Phase 0.5·2.4·4.5가 background 병렬이라 같은 임시 파일을 쓰면 덮어쓰기 위험이 있다. `/tmp/codex_<phase>_<무작위>.txt` 고유 파일명 컨벤션을 §5 표준으로 박았다.
- **Claude 역할 모델 상향 (opus 우선)**: substantive 작업(Worker Easy/Medium/Hard, Supervisor, QA)은 전부 opus로 매핑. Monitor만 haiku로 남겼다 — 대시보드 상태 폴링만 하므로 opus의 품질 이득이 0인 유일 예외다.
- **죽은 설명 강등**: `-o`로 본문만 받으면 §5의 "원본 출력 예시"가 추출에 더는 안 쓰이므로 삭제 대신 "참고용 — 추출은 -o 권장"으로 강등해 오해를 막았다.

## 변경 파일
- `docs/rules/codex-integration.md` — 중앙 규칙(SoT): §4 표준 호출에 `-m gpt-5.5 -c model_reasoning_effort=xhigh -c service_tier=priority -o` 추가, §5 파싱을 `-o` 본문 수거+고유 파일명 규칙으로 교체, §7 timeout 행/스니펫 제거, 모델 표기 5.2→5.5, 성능 표 갱신
- `skills/cp/SKILL.md` — Phase 0.5/2.4/3.2의 codex 인용을 §4/§5 참조로 통일, timeout 어휘 제거
- `skills/cc/SKILL.md` — Phase 4.5 codex 인용을 §4/§5 참조로 통일 + Model Assignment Table(한글·영문 2곳)·난이도 매핑·ASCII 다이어그램을 opus 상향에 맞게 갱신
- `CHANGELOG.md` — v3.11.0 항목 추가
- `CLAUDE.md` (creeta-lens) — Version feat 1줄 추가
- (일괄) `plugin.json` / marketplace / hooks / SKILL.md 등 11곳 — `bump-version.sh 3.11.0`

## 테스트 & 검증
✅검증표 7개 항목 중 자동 판정 5개(#1·#2·#3·#6·#7) 전부 통과:
- **#1** 표준 호출 라인에 `-m gpt-5.5` + `model_reasoning_effort=xhigh` + `service_tier=priority` + `-o` 모두 존재
- **#2** 세 파일의 활성 코드에 취약 파싱(`tokens used`, `awk '/^codex/'`)·`timeout 30` 잔재 0건 (설명 텍스트 제외)
- **#3** 세 파일에서 모델 지칭 `5.2` 0건 (Phase 번호와 무관)
- **#6** `cc/SKILL.md`에서 Worker(Easy/Medium/Hard)·Supervisor·QA = opus, Monitor만 haiku로 표기
- **#7** `cp/SKILL.md` Phase 3.1 pre-mortem이 기존대로 opus 유지(다운그레이드 없음)

배포·설치 검증(#5)도 통과: commit `b7c195f` + tag `v3.11.0` push → livevil7/creeta-lens(= CreetaCorp/lens, 동일 레포), `scripts/upgrade.sh`로 캐시 3.11.0 설치 및 `plugin list` v3.11.0 확인.

codex 미응답 degrade(#4, manual)는 본 작업 진행 중 실증됐다: Phase 0.5 Codex 독립조사가 sandbox 정책으로 `codex exec --help` 차단 + 한글 출력 mojibake로 degrade했고, Claude가 `-o` 동작을 직접 실측 검증(최종 답변 본문만 파일로 떨굼 확인)하며 단독으로 작업을 완료했다 — 본 작업이 인코딩하려던 graceful degrade의 실증 사례다.

## 추가 사항
- **머신 간 전파**: `bump-version.sh`는 이 레포만 갱신한다. 이 PC는 Claude Code 재시작 후 3.11.0이 활성화되며(작업 당시 세션은 3.10.0 캐시), Mac Mini 등 다른 머신은 push 후 `/lens-upgrade`로 반영해야 한다. 검증 #5는 이 PC 한정이다.
- **호환성 fallback (Plan B, 미발동)**: `service_tier=priority` 또는 `-o`가 다른 codex 빌드/계정에서 거부·부재면 부가분만 빼고 핵심(xhigh 깊이 + 모델 drift 제거)은 살리는 경로를 문서화했으나, 이 머신에서는 실호출 검증을 통과해 발동하지 않았다.
- **후속 진화 (별도, 미완 아님)**: 이후 v3.19.0에서 `priority` → `service_tier=fast`, `xhigh` → 입력 규모 분기(소규모 xhigh / 대규모 high)로 진화했다. 이는 본 작업의 후속 진화이지 미완 항목이 아니다.
