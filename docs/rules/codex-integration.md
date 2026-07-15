# Codex CLI 연동 규칙

Lens v3.1에서 OpenAI Codex CLI를 활용한 pre-mortem 이종 모델 검증의 표준 규칙.

## 1. 개요

### Codex CLI란

- OpenAI가 제공하는 codex 전용 CLI 도구 (모델은 머신의 모델 순위표에서 최상위를 자동 선택 — §4 resolver. 2026-07 현재 1등: `gpt-5.6-sol`)
- 로컬 셸에서 비대화형 호출 가능 (`codex exec`)
- ChatGPT Plus/Pro/Max 구독으로 인증 (별도 API 키 불필요)

### Lens가 Codex를 사용하는 이유

- **이종 모델 병렬 검증**: Claude 계열과 다른 아키텍처/학습 데이터의 모델로 교차 검증
- **블라인드 스팟 해소**: 단일 모델 편향(유사한 추론 경로, 동일한 놓침)을 상쇄
- **비용 효율**: Plus/Pro/Max 구독 내에서 추가 과금 없이 활용

### 사용 지점 (v3.9+)

Codex 는 단순 "Claude 결과 검토자"가 아니라 **공동 조사자·공동 검증자**다. 네 지점에서 이종 모델 더블 검증을 수행한다:

- `/cp PLAN` **Phase 0.5 — 병렬 독립 조사**: Goal 정의 직후 Codex 가 레포를 스스로 읽고 자기 접근안+리스크를 제시 (Claude 의 Plan A 설계와 병렬). 결과는 Phase 2.4 에서 합성.
- `/cp PLAN` **Phase 2.4 — 듀얼 합성·교차검증**: Claude 안과 Codex 안의 합의/분기 분류 → 분기 재검증.
- `/cp PLAN` **Phase 3 — Pre-mortem**: 통합안의 최종 리스크 점검 (Phase 0.5 에서 Codex 조사가 이미 돌았으면 Opus 단독, 아니면 Codex 병렬).
- `/cc` **Phase 4.5 — 코드리뷰 게이트**: 매 반복의 코드 변경을 Codex 가 독립 리뷰. Supervisor pass + Codex pass 둘 다여야 진행.

**trivial 작업(오타·변수명·한 줄 수정)은 모든 지점 skip** — 불필요한 호출 회피. Codex 부재/실패는 항상 graceful degrade (Claude/Supervisor 단독 진행 + 플래그 기록, 블로킹 금지). **단 예외 — `/cpp` S4 교차 협의는 하드 게이트**(Constitution 2조): 미감지/미인증 시 degrade 하지 않고 **정지·보고**한다(사용자가 "Codex 없이 진행" 명시 시만 1회 우회). 위 graceful degrade 는 `/cp`·`/cc` 의 듀얼검증 지점에 적용된다.

## 2. 사전 조건 감지

Claude Code 세션에서 Codex CLI가 설치·로그인됐는지 3단계 fallback으로 확인한다.

### 단계 1: PATH 확인

```bash
command -v codex
```

`/usr/local/bin/codex` 등 경로가 출력되면 사용 가능.

### 단계 2: VSCode ChatGPT 확장 번들 경로

PATH에 없을 경우, VSCode ChatGPT 확장에 포함된 바이너리를 탐색한다.

```bash
ls $HOME/.vscode/extensions/openai.chatgpt-*/bin/windows-x86_64/codex.exe 2>/dev/null | head -1
```

출력된 절대경로를 `CODEX_BIN` 변수에 저장하여 이후 호출에 사용한다.

### 단계 3: 감지 실패

위 두 단계 모두 실패하면 `codex_available=false` 로 마킹한다.

**Fallback 동작**: Pre-mortem은 Opus 단독으로 수행하고, 결과 문서에 다음 문구를 명시한다.

> Codex 미설치 — 단일 모델 pre-mortem

## 3. 인증 확인

```bash
codex login status
```

- 정상 응답: `Logged in using ChatGPT`
- 미인증 상태: 사용자에게 `codex login`을 수동 실행하도록 안내
- 로그인 URL이 자동으로 브라우저에 열리므로 대화형 실행 필요

미인증 상태에서 호출하면 에러가 발생하므로 반드시 선제적으로 확인한다.

## 4. 표준 호출 패턴

```bash
# ① 모델 resolver (v3.24+) — 순위표 1등을 매 호출 직전 동적 선택. 이름을 문서에 못박지 않는다.
CODEX_MODEL=$(node -e "const p=require('path'),os=require('os');const d=require(p.join(os.homedir(),'.codex','models_cache.json'));const m=d.models.filter(x=>x.visibility==='list'&&x.supported_in_api!==false).sort((a,b)=>(a.priority??99)-(b.priority??99))[0];if(!m||!m.slug)process.exit(1);console.log(m.slug)" 2>/dev/null) || CODEX_MODEL=""
MODEL_ARG=(); if [ -n "$CODEX_MODEL" ]; then MODEL_ARG=(-m "$CODEX_MODEL"); else echo "⚠️ 모델 resolver 실패 — codex config 기본 모델로 진행"; fi

# ② 표준 호출
OUT=$(mktemp /tmp/codex_XXXXXX.txt)   # 고유 파일명 — 병렬 호출 충돌 방지
DEPTH=xhigh                            # 소규모; 대규모 리뷰·협의는 high (§"깊이 분기")
timeout 180 codex exec --skip-git-repo-check \
  "${MODEL_ARG[@]}" \
  -c model_reasoning_effort="$DEPTH" \
  -c service_tier=fast \
  -o "$OUT" \
  "프롬프트 내용"
RC=$?                                  # 124 = 180초 초과 (§7)
# 응답 본문은 "$OUT" 에 떨어진다 (§5). RC==124 면 부분 본문 수거 or degrade.
```

### 플래그 설명

- `exec` — 비대화형 1회 응답 모드. TUI를 띄우지 않고 결과 출력
- `--skip-git-repo-check` — 현재 디렉토리가 git repo가 아니어도 실행 허용. Pre-mortem은 repo와 무관하므로 필수
- `"${MODEL_ARG[@]}"` — **순위표 1등 동적 지정 (v3.24+)**: `~/.codex/models_cache.json`(codex 가 자동 갱신하는 모델 순위표)에서 `visibility=list` + `supported_in_api` 중 `priority` 최소(=1등, 2026-07 현재 `gpt-5.6-sol`) slug 를 매 호출 직전 선택. 특정 모델명을 문서에 못박지 않고, 사용자가 데스크톱 앱에서 바꾼 config 기본값에도 의존하지 않는다. resolver 실패(순위표 부재·스키마 변경·빈 목록) 시 배열이 비어 `-m` 자체가 생략되고(빈 `-m ""` 전달 원천 차단) ⚠️ 플래그를 stdout 에 남긴다 — **이 플래그는 호출한 스킬의 결과 보고 상단에 복사 의무** (조용한 강등 금지)
- `timeout 180` — **상한 가드(v3.19+)**: codex 가 180초 안에 못 끝내면 강제 종료(exit 124). 무한 동기 대기를 차단한다. 초과 시 §7 — `-o` 부분 본문이 있으면 "미완" 표기로 수거, 없으면 degrade. (coreutils `timeout` — git-bash/mac/linux 공통)
- `-c model_reasoning_effort="$DEPTH"` — **깊이 다이얼**: 입력 규모로 분기(§"깊이 분기"). 소규모(pre-mortem 200단어·빠른 조사)=`xhigh`, 대규모(전체 diff 리뷰·딥스펙 전량 협의)=`high`. 토큰 비용 비고려 방침은 유지하되, 대규모 xhigh 의 시간 비선형 폭증만 회피.
- `-c service_tier=fast` — **속도 다이얼**: API 부하 시 큐 우선권. *별개 다이얼*이라 깊이와 동시 적용 가능. (현행 codex 0.137+ 정식 키는 `fast`; 과거 `priority` 는 동일 동작의 **레거시 별칭**으로 아직 매핑되나 미래 제거 대비 `fast` 로 통일. 라이브 실측 EXIT 0)
- `-o "$OUT"` — 최종 답변 본문만 파일로 출력. 메타(`session id`/`tokens used`) 섞인 stdout을 awk로 파싱할 필요가 없다

### 깊이 분기 — 소규모 xhigh / 대규모 high (v3.19+)

깊이와 속도는 **독립 다이얼**이다. `reasoning_effort` 는 추론 토큰량(품질·깊이), `service_tier` 는 큐 우선권(지연)을 조절한다 — 한쪽이 다른 쪽을 깎지 않는다.

**xhigh 는 입력이 작을 때만 빠르다.** 실측(gpt-5.5; 2026-07-15 gpt-5.6-sol 도 xhigh/high 단계 동일 지원 확인 — 깊이 분기 규칙은 모델 세대 무관 유지): 소규모에서 `low` 는 `xhigh` 보다 토큰 ~6배 + 속도 이득 0 → 소규모는 xhigh 가 오히려 싸고 빠르다. **그러나 입력이 크면(전체 diff 리뷰·딥스펙 전량 협의) xhigh 의 추론 시간은 비선형으로 폭증**한다. `service_tier=fast` 는 raw 속도가 아니라 **혼잡 시 큐 우선권**이라 compute-bound 인 이 폭증을 깎지 못한다. 따라서 깊이를 입력 규모로 분기한다:

| 호출 지점 | 입력 규모 | DEPTH |
|---|---|---|
| Pre-mortem (200단어 제한) | 작음 | `xhigh` |
| `/cp` P0.5 독립 조사 | 중 (background·비대기) | `xhigh` |
| `/cc` P4.5 코드리뷰 (전체 diff) | **큼** | `high` |
| `/cpp` S4 교차 협의 (딥스펙 전량) | **큼** | `high` |

소규모 xhigh 는 메모리 룰(소규모 xhigh always) 그대로 보존한다. **대규모만 high 로 내려 시간을 잡고, 모든 지점에 `timeout 180`(§7) 을 공통 적용**한다. `fast`(구 `priority`) 는 큰 작업/혼잡 시 보험이며 해는 없다 → 유지.

### 모델·티어 드리프트 대비 (버전 무관 fallback)

동적 지정 모델과 `service_tier` 는 **서버측 검증**이라, OpenAI 가 모델을 폐기/리네임하면 호출이 런타임 400(`invalid_request_error`)으로 죽는다. 머신 하드코딩 금지 원칙에 따라 fallback 은 3단:

- **resolver 실패** (순위표 부재·스키마 변경·빈 목록): `MODEL_ARG` 가 비어 `-m` 자체가 생략됨(§4 ① — codex config 기본 모델 사용) + ⚠️ 플래그 출력. **플래그는 호출한 스킬의 결과 보고에 복사 의무** — 조용한 강등 금지.
- **모델 400**: 동적 선택된 모델이 400(invalid model)이면 **`MODEL_ARG` 를 비우고 1회 재시도** (codex config 기본 모델 사용). 특정 모델명에 영구 의존하지 않는다.
- **티어**: `service_tier=fast` 가 거부되면 `-c service_tier` 자체를 생략하고 재시도 (기본 티어). `fast`/`priority` 둘 다 미지원인 구버전 대비.
- 이 fallback 은 graceful — 이종검증이 조용히 죽는 대신 기본값으로라도 돈다. 깨짐은 `/crv` 감사가 `codex --version` + `models_cache.json` probe(순위표 스키마·1등 slug 변동)로 선제 감지.

> 참고: codex 바이너리 절대경로는 `CODEX_BIN=$(ls $HOME/.vscode/extensions/openai.chatgpt-*/bin/windows-x86_64/codex.exe 2>/dev/null | head -1)` 로 잡고 `"$CODEX_BIN"` 으로 호출 (PATH 부재 시, §2 단계 2).

## 5. 응답 수거

`-o "$OUT"` 플래그를 쓰면 codex 가 **최종 답변 본문만** 해당 파일에 쓴다. 메타(`session id`/`tokens used`)가 섞인 stdout 을 파싱할 필요가 없다.

### 본문 읽기

```bash
BODY=$(cat "$OUT")
```

읽은 `$BODY` 를 결과 문서에 삽입한다. **고유 파일명 필수** — Phase 0.5·2.4·4.5 가 background 병렬로 동시에 돌 수 있으므로, `mktemp /tmp/codex_XXXXXX.txt` 같은 고유 경로를 호출마다 새로 잡아 덮어쓰기를 막는다.

### (참고) -o 없이 stdout 만 받은 경우

구버전 codex 등으로 `-o` 를 못 쓰면 stdout 에 메타가 섞인다. 본문은 `^codex$` 라벨 다음 줄 ~ `^tokens used$` 이전 줄이며, 폴백 추출은:

```bash
BODY=$(echo "$OUTPUT" | awk '/^codex$/{flag=1; next} /^tokens used$/{flag=0} flag')
```

`-o` 가 동작하는 환경에선 이 awk 폴백을 쓰지 않는다.

## 6. Pre-mortem 프롬프트 템플릿

```
다음 작업 계획의 허점을 찾아주세요. 200단어 이내, 순수 텍스트.

## 계획
{계획 문서의 목표 + 기술적 접근 섹션}

## 평가 관점
1. 실패할 수 있는 3가지 시나리오 (구체적 트리거 + 결과)
2. 누락된 엣지 케이스
3. 기술적 블라인드 스팟

JSON 형식 사용하지 말고 한국어로 답변.
```

### 템플릿 설계 의도

- **200단어 제한**: 응답 시간 단축, 핵심 허점에 집중
- **순수 텍스트**: 파싱 편의성 (JSON/마크다운 파싱 불필요)
- **3가지 시나리오 강제**: 단일 실패 모드가 아닌 다중 관점 유도
- **한국어 명시**: codex 모델은 영문 응답이 기본값이므로 명시적 지시 필요

## 7. 에러 처리 — 180초 상한 + 부분 수집/degrade (v3.19+)

모든 codex 호출은 `timeout 180`(§4) 으로 감싼다. 두 층위의 보호가 있다:

1. **background 비대기 지점**(`/cp` P0.5 조사 등): Claude 는 애초에 기다리지 않고 자기 작업을 진행하다 gate 에서 ready 면 수거·미완이면 degrade. (기존 동작 — `timeout` 은 orphan 강제 정리 보너스.)
2. **동기·하드게이트 지점**(`/cpp` S4, `/cc` P4.5 더블게이트): codex 결과를 받아야 진행하므로 **실제로 대기**한다. 여기서 `timeout 180` 이 **무한 대기를 끊는 핵심**이다. 180초 초과(exit 124) 시:
   - **`-o $OUT` 자유형**: `$OUT` 에 부분 본문이 있으면 **"⚠️ Codex 부분 결과(180s 초과·미완)"** 로 표기해 수거·반영한다. 비어있으면 degrade. (codex 가 최종본만 쓰면 부분 수거 불가 — best-effort.)
   - **`--json` 구조화 review**: 부분 JSON 은 파싱 불가 → degrade("Codex 리뷰 미완 — 단독 게이트").

codex 가 느리든 hang 하든 180초면 무조건 끊긴다. orphan 프로세스는 `timeout` kill + 세션 종료(Stop 훅)가 정리한다.

| 상황 | 대응 |
|------|------|
| **180초 초과 (exit 124)** | $OUT 부분 본문 있으면 "미완" 표기 수거, 없으면 degrade. **무한 대기 금지.** |
| **gate 시점에 미완 (background)** | 기다리지 않고 degrade — "Codex 미완 — 단독 진행" 플래그 기록 |
| **인증 만료 / 호출 실패** | "Codex 실패: {요약}" 기록 후 Claude/Opus 단독 진행 |
| **stderr 에러** | 결과 섹션에 "Codex 에러" 블록으로 포함 (블로킹 금지) |

> **하드게이트 예외 주의**: `/cpp` S4 는 Codex *부재/미인증* 시 degrade 금지(정지·보고)지만, *180초 초과* 는 다르다 — codex 는 응답 중이었으므로 부분 결과를 "미완 협의"로 반영하고 진행하되, 커버리지 공백이 남으면 S5 회귀로 보강(§8.5). 무한 대기로 사용자를 잡지 않는다.

## 8. 비용 및 성능 가이드

| 항목 | 값 |
|------|-----|
| Pre-mortem 1회당 토큰 사용량 | 가변 — **비용 비고려**(깊이·속도 우선 방침). xhigh 는 소규모에서 오히려 토큰이 적음 |
| 응답 시간 | 소규모 pre-mortem ~5–10초(xhigh). 대규모 리뷰·협의=high + `timeout 180` 상한(§7). 부하 시 fast 가 큐 우선권 |
| 과금 | ChatGPT Plus/Pro/Max 구독 시 별도 과금 없음 |

### 주의사항

- 구독 등급에 따라 일일 사용량 제한 존재 (구체 수치는 OpenAI 공식 페이지 참조)
- 연속 호출 시 rate limit 가능 — pre-mortem 1회/계획이면 일반적으로 문제 없음
- 로컬 네트워크 상태에 따라 응답 시간 변동

## 8.5 듀얼 검증 호출 패턴 (v3.9+)

§4 표준 호출 + §5 응답 수거 + §7 에러 처리를 그대로 공유한다. 조사·리뷰에 추가되는 규칙:

### 병렬성 — run_in_background

조사(Phase 0.5)·코드리뷰(Phase 4.5)는 Claude 의 본 작업과 **진짜 병렬**이어야 한다. Bash tool 의 `run_in_background: true` 로 Codex 를 띄우고, Claude 는 자기 작업(Plan A 설계 / Supervisor 검토)을 진행한 뒤 백그라운드 출력을 수거한다. sleep/폴링 금지 — 완료 알림을 받는다. **gate 도달 시 ready 면 수거, 미완이면 기다리지 않고 degrade**(§7) — 숫자 timeout 없음.

### 파일 접근 — 프로젝트 루트에서 실행

Pre-mortem 은 repo 무관(`--skip-git-repo-check`)이지만, **조사·코드리뷰는 Codex 가 파일을 읽어야** 한다. 반드시 프로젝트 루트(cwd)에서 `codex exec` 를 호출 — Codex 는 cwd 의 파일에 접근한다.

### 프롬프트 / 판정

- **Phase 0.5 독립 조사**: "이 작업을 직접 조사하고 독립 실행 계획을 제안" (권장 접근 / 리스크 3 / 관련 파일). 전체 템플릿은 `skills/cp/SKILL.md` Phase 0.5.
- **Phase 4.5 코드리뷰 (구조화·git-aware — v3.13+ 권장)**: 자유형 "이 diff 를 리뷰" 프롬프트 + 수동 diff 주입 + 본문 마지막 줄 awk `PASS`/`FAIL` 파싱은 **취약**(diff 잘림·텍스트 휴리스틱). 대신 **`codex exec review`** 가 git 을 직접 읽고 구조화 판정을 낸다 (현행 0.137+ 라이브 실측 확인):

  ```bash
  # 모델 resolver (§4 ①) 를 먼저 실행해 MODEL_ARG 준비 — 이름 하드코딩 금지
  SCHEMA=$(mktemp /tmp/codex_schema_XXXXXX.json)   # {verdict: pass|fail, high_findings:[...]}
  RES=$(mktemp /tmp/codex_review_XXXXXX.json)
  timeout 180 codex exec review --uncommitted \
    "${MODEL_ARG[@]}" -c model_reasoning_effort=high -c service_tier=fast \
    --output-schema "$SCHEMA" --ephemeral --json > "$RES" 2>/dev/null
  # 판정: $RES 의 verdict==fail 또는 high_findings 비어있지 않음 → FAIL
  # 깊이=high (전체 diff 는 대규모 입력 → xhigh 폭증 회피, §"깊이 분기").
  # exit 124(180s 초과) → 구조화 JSON 불완전이면 degrade (§7).
  ```

  - `--uncommitted` (또는 `--base <branch>`) — Codex 가 작업트리 변경을 직접 읽음. **수동 diff 주입 제거**.
  - `--output-schema` — `{verdict, high_findings}` 구조 강제. **awk PASS/FAIL 휴리스틱 제거**.
  - `--ephemeral` — 세션 비영속. orphan 정리(Stop 훅) 의존 완화.
  - ⚠️ **반드시 `codex exec review`** — bare `codex review` 는 `--output-schema`/`--ephemeral` 미노출. `exec review` 만이 review 인자(`--uncommitted/--base`)와 exec 플래그를 동시 노출.
  - **fallback**: `codex exec review` 미지원 구버전이면 기존 자유형 diff 리뷰 + `PASS`/`FAIL`+`[high]` 파싱 (graceful degrade). 전체 템플릿은 `skills/cc/SKILL.md` Phase 4.5.
- **합성/게이트**: 조사 결과는 Claude 가 합의/분기로 분류해 통합 (Phase 2.4). 리뷰 결과는 Supervisor 와 AND 게이트 (둘 다 pass 여야 진행).

## 9. 관련 파일 / 외부 참조

### 로컬

- 스킬: `~/.claude/skills/codex-review/SKILL.md` — Claude Code 안에서 `/codex-review` 호출용 (별도 설치 완료)
- Lens PLAN 모드: `~/.claude/plugins/lens/skills/cp/` — Phase 2.5에서 본 문서 참조

### 외부

- 공식 CLI 문서: <https://developers.openai.com/codex/cli/>
- GitHub 저장소: <https://github.com/openai/codex>
- ChatGPT 구독 정책: <https://openai.com/chatgpt/pricing/>
