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
- `/cc` **Phase 4.5 — 코드리뷰 게이트**: 매 반복의 코드 변경을 Codex 와 Grok 이 각각 독립 리뷰. **Supervisor pass + Codex pass + Grok pass** 셋 다여야 진행 (v3.36 — 3중 검증, §8.6). 죽은 레인은 투표하지 않되 침묵을 pass 로 세지 않는다.

**trivial 작업(오타·변수명·한 줄 수정)은 모든 지점 skip** — 불필요한 호출 회피. Codex 부재/실패는 항상 graceful degrade (Claude/Supervisor 단독 진행 + 플래그 기록, 블로킹 금지). **단 예외 — `/cp deep` S4 교차 협의는 하드 게이트**(Constitution 2조): 미감지/미인증 시 degrade 하지 않고 **정지·보고**한다(사용자가 "Codex 없이 진행" 명시 시만 1회 우회). 위 graceful degrade 는 `/cp`·`/cc` 의 듀얼검증 지점에 적용된다.

## 1.5 호출 불변식 — 타임아웃의 진짜 원인 (v3.36, 2026-09-01 실측)

「codex 가 느리다」로 보이던 것의 대부분은 모델이 아니라 **배관**이었다. 아래 세 가지를 지키지 않으면 호출은 결과 없이 상한까지 매달린다. 상한을 올리는 처방은 이 셋 중 어느 것도 고치지 못한다.

### ① stdin 을 반드시 닫는다 — `</dev/null`

`codex exec` 와 `grok -p` 는 **파이프된 stdin 을 프롬프트에 덧붙인다** (`codex exec --help`: "If stdin is piped and a prompt is also provided, stdin is appended as a `<stdin>` block"). Claude Code Bash 도구의 stdin 은 EOF 가 오지 않는 열린 파이프라, codex 는 첫 토큰을 내기 전에 **영구 대기**한다 — 세션 배너조차 찍히지 않는다.

실측(동일 프롬프트·동일 모델·순차 실행):

| stdin | 결과 |
| --- | --- |
| 미차단 (v3.35 까지의 `codex-review.sh`) | **3/3 전부 상한까지 행, 산출 0바이트** |
| `</dev/null` 차단 | **3/3 성공, 6–8초** |

세션 누적 12회 중 미차단은 2회만 성공했다(**≈83% 실패**). 이것이 「입력이 크면 느려진다」로 오독돼 v3.25 의 상한 180→600 처방을 낳았다. **상한을 올려도 0바이트가 나온 이유가 바로 이것이다** — 대기하고 있던 것은 추론이 아니라 오지 않는 EOF 였다.

### ② 프롬프트를 argv 로 넘기지 않는다 — `- < FILE`

`codex exec "$(cat 프롬프트)"` 는 OS 인자 길이 한도에서 죽는다. 실측: 214KB 를 argv 로 = `rc 126 Argument list too long` 이 **0초에** 발생, 같은 바이트를 stdin 으로 = `rc 0` 6초. diff 를 주입하는 리뷰 호출은 수백 KB 로 쉽게 커지므로 argv 경로는 금지다. `-` 를 프롬프트 자리에 두고 파일을 리다이렉트한다 — 파일은 EOF 를 주므로 ①과 충돌하지 않는다.

### ③ 하네스 상한이 스크립트 상한보다 낮다

Claude Code Bash 도구의 기본 상한은 **120초**(최대 600초)다. 스크립트에 `--timeout 300` 을 걸어도 도구가 120초에 먼저 죽이면 **종료 코드 3 도, 부분 출력도 남지 않는다** — 호출자는 degrade 판단조차 못 하고 그냥 실패로 본다. 따라서 외부 레인 호출은 반드시 둘 중 하나다:

- **`run_in_background: true`** (기본 — Claude 는 자기 작업을 계속하고 완료 알림에서 수거한다)
- 동기라면 Bash 도구의 `timeout` 을 스크립트 상한보다 **크게 명시** (`--timeout 420` 이면 `timeout: 450000`)

> 이 세 불변식은 전부 `scripts/codex-review.sh` · `scripts/grok-review.sh` 안에 들어가 있다. 호출자는 `scripts/cross-verify.sh` 한 줄만 쓰면 되고, 지켜야 할 것은 ③(background 또는 명시 timeout) 하나뿐이다.

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
DEPTH=xhigh                            # 소규모; 대규모 리뷰·협의는 high (§"깊이·시간 분기")
TMO=180                                # 소규모 180 / 중 300 / 대규모 600 (§"깊이·시간 분기")
timeout "$TMO" codex exec --skip-git-repo-check \
  "${MODEL_ARG[@]}" \
  -c model_reasoning_effort="$DEPTH" \
  -c service_tier=fast \
  -o "$OUT" \
  "프롬프트 내용"
RC=$?                                  # 124 = $TMO 초과 (§7)
# 응답 본문은 "$OUT" 에 떨어진다 (§5). RC==124 면 부분 본문 수거 or degrade.
```

### 플래그 설명

- `exec` — 비대화형 1회 응답 모드. TUI를 띄우지 않고 결과 출력
- `--skip-git-repo-check` — 현재 디렉토리가 git repo가 아니어도 실행 허용. Pre-mortem은 repo와 무관하므로 필수
- `"${MODEL_ARG[@]}"` — **순위표 1등 동적 지정 (v3.24+)**: `~/.codex/models_cache.json`(codex 가 자동 갱신하는 모델 순위표)에서 `visibility=list` + `supported_in_api` 중 `priority` 최소(=1등, 2026-07 현재 `gpt-5.6-sol`) slug 를 매 호출 직전 선택. 특정 모델명을 문서에 못박지 않고, 사용자가 데스크톱 앱에서 바꾼 config 기본값에도 의존하지 않는다. resolver 실패(순위표 부재·스키마 변경·빈 목록) 시 배열이 비어 `-m` 자체가 생략되고(빈 `-m ""` 전달 원천 차단) ⚠️ 플래그를 stdout 에 남긴다 — **이 플래그는 호출한 스킬의 결과 보고 상단에 복사 의무** (조용한 강등 금지)
- `timeout "$TMO"` — **상한 가드(v3.19+, v3.25 규모 분기)**: codex 가 제한 시간 안에 못 끝내면 강제 종료(exit 124). 무한 동기 대기를 차단한다. **상한은 입력 규모로 분기**한다(소규모 180 / 중 300 / 대규모 600 — §"깊이·시간 분기"). 초과 시 §7 — `-o` 부분 본문이 있으면 "미완" 표기로 수거, 없으면 degrade. (coreutils `timeout` — git-bash/mac/linux 공통)
- `-c model_reasoning_effort="$DEPTH"` — **깊이 다이얼**: 입력 규모로 분기(§"깊이 분기"). 소규모(pre-mortem 200단어·빠른 조사)=`xhigh`, 대규모(전체 diff 리뷰·딥스펙 전량 협의)=`high`. 토큰 비용 비고려 방침은 유지하되, 대규모 xhigh 의 시간 비선형 폭증만 회피.
- `-c service_tier=fast` — **속도 다이얼**: API 부하 시 큐 우선권. *별개 다이얼*이라 깊이와 동시 적용 가능. (현행 codex 0.137+ 정식 키는 `fast`; 과거 `priority` 는 동일 동작의 **레거시 별칭**으로 아직 매핑되나 미래 제거 대비 `fast` 로 통일. 라이브 실측 EXIT 0)
- `-o "$OUT"` — 최종 답변 본문만 파일로 출력. 메타(`session id`/`tokens used`) 섞인 stdout을 awk로 파싱할 필요가 없다

### 깊이·시간 분기 — 소규모 xhigh·180s / 대규모 high·600s (v3.19+, 시간 축 v3.25+)

깊이와 속도는 **독립 다이얼**이다. `reasoning_effort` 는 추론 토큰량(품질·깊이), `service_tier` 는 큐 우선권(지연)을 조절한다 — 한쪽이 다른 쪽을 깎지 않는다.

**xhigh 는 입력이 작을 때만 빠르다.** 실측(gpt-5.5; 2026-07-15 gpt-5.6-sol 도 xhigh/high 단계 동일 지원 확인 — 깊이 분기 규칙은 모델 세대 무관 유지): 소규모에서 `low` 는 `xhigh` 보다 토큰 ~6배 + 속도 이득 0 → 소규모는 xhigh 가 오히려 싸고 빠르다. **그러나 입력이 크면(전체 diff 리뷰·딥스펙 전량 협의) xhigh 의 추론 시간은 비선형으로 폭증**한다. `service_tier=fast` 는 raw 속도가 아니라 **혼잡 시 큐 우선권**이라 compute-bound 인 이 폭증을 깎지 못한다. 따라서 깊이를 입력 규모로 분기한다:

| 호출 지점 | 입력 규모 | DEPTH | TMO | 실행 |
| --- | --- | --- | --- | --- |
| Pre-mortem (200단어 제한) | 작음 | `xhigh` | `180` | 동기 |
| `/cp` P0.5 독립 조사 | 중 (background·비대기) | `xhigh` | `300` | background |
| `/cc` P4.5 코드리뷰 (전체 diff) | **큼** | `high` | `600` | **background 필수** |
| `/cp deep` S4 교차 협의 (딥스펙 전량) | **큼** | `high` | `600` | **background 필수** |

소규모 xhigh 는 메모리 룰(소규모 xhigh always) 그대로 보존한다. 대규모는 high 로 내려 추론 시간을 잡는다.

**시간 축을 규모로 분기하는 이유 (v3.25 — 실측 2회)**: 깊이만 분기하고 시간은 180초로 고정했더니, **대규모 협의가 반복적으로 상한에 걸려 죽었다.** ① 2026-07-15 모델정책 작업 — 대형 diff 리뷰가 180s 초과 → Supervisor 단독 게이트로 degrade. ② 2026-07-20 계획엔진 개편 협의 — `high`로도 180s 초과, `-o` 본문 **0바이트**. 두 사례 모두 "작업이 클수록 교차검증이 사라지는" 방향이라, 하드게이트가 가장 필요한 순간에 정확히 무력화된다. 깊이만 규모에 맞추고 시간을 안 맞춘 것이 설계 결함이었다.

**대규모는 background 필수**: `timeout 600` 을 동기로 걸면 Bash 도구 상한(600초)과 정면 충돌하고 사용자를 10분간 붙잡는다. 대규모 호출은 `run_in_background: true` 로 띄우고 Claude 는 자기 작업을 진행하다 완료 알림에서 수거한다(§9와 동일 패턴). 이러면 시간을 늘려도 사용자 대기는 0이다.

**시간을 늘려도 안 풀리는 것 — 프롬프트가 탐색을 유발할 때**: 위 ②에서 실패의 직접 원인은 시간만이 아니라 프롬프트가 *"레포를 직접 읽고 답하라"* 로 codex 에게 무제한 파일 탐색을 시킨 것이었다. 대규모 협의는 **판단에 필요한 사실을 프롬프트에 담아 주고 탐색 범위를 명시적으로 제한**한다(예: "아래 사실만으로 답하라. 탐색은 최대 3개 파일"). 시간 상한은 안전망이지 탐색 예산이 아니다.

`fast`(구 `priority`) 는 큰 작업/혼잡 시 보험이며 해는 없다 → 유지.

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

## 7. 에러 처리 — 규모별 상한 + 부분 수집/degrade (v3.19+, 규모 분기 v3.25+)

모든 codex 호출은 `timeout "$TMO"`(§4) 로 감싼다. **상한은 고정 180 이 아니라 입력 규모로 정한다**(180/300/600 — §"깊이·시간 분기"). 두 층위의 보호가 있다:

1. **background 비대기 지점**(`/cp` P0.5 조사, 모든 대규모 호출): Claude 는 애초에 기다리지 않고 자기 작업을 진행하다 gate 에서 ready 면 수거·미완이면 degrade. (기존 동작 — `timeout` 은 orphan 강제 정리 보너스.) **대규모는 상한이 600 이므로 반드시 이 경로로 띄운다** — 동기로 걸면 Bash 도구 상한과 충돌하고 사용자를 10분 붙잡는다.
2. **동기·하드게이트 지점**(`/cp deep` S4, `/cc` P4.5 더블게이트): codex 결과를 받아야 진행하므로 **실제로 대기**한다. 여기서 `timeout` 이 **무한 대기를 끊는 핵심**이다. 상한 초과(exit 124) 시:
   - **`-o $OUT` 자유형**: `$OUT` 에 부분 본문이 있으면 **"⚠️ Codex 부분 결과($TMO 초과·미완)"** 로 표기해 수거·반영한다. 비어있으면 degrade.
     > ⚠️ **부분 수거는 실제로는 거의 안 된다 (실측 2026-07-20)**: `-o` 는 최종본을 쓰는 것으로 보인다 — exit 124 시 `$OUT` 이 **0바이트**였다. "부분 수거"에 기대지 말고 **애초에 상한을 규모에 맞게 잡는 것**이 1차 방어다. 부분 수거는 best-effort 2차 방어로만 취급한다.
   - **`--json` 구조화 review**: 부분 JSON 은 파싱 불가 → degrade("Codex 리뷰 미완 — 단독 게이트").

codex 가 느리든 hang 하든 상한이면 무조건 끊긴다. orphan 프로세스는 `timeout` kill + 세션 종료(Stop 훅)가 정리한다.

**초과가 반복되면 상한을 올리기 전에 프롬프트를 먼저 의심한다**: 실측 실패 2건 모두 원인이 "codex 에게 레포 무제한 탐색을 시킨 프롬프트"였다. 대규모 협의는 판단에 필요한 사실을 프롬프트에 담고 탐색 범위를 명시 제한한다(§"깊이·시간 분기").

| 상황 | 대응 |
|------|------|
| **상한 초과 (exit 124)** | $OUT 부분 본문 있으면 "미완" 표기 수거, 없으면 degrade. 같은 지점에서 2회 이상 반복되면 **상한·프롬프트 범위를 재조정**(규칙 개정 사유). **무한 대기 금지.** |
| **gate 시점에 미완 (background)** | 기다리지 않고 degrade — "Codex 미완 — 단독 진행" 플래그 기록 |
| **인증 만료 / 호출 실패** | "Codex 실패: {요약}" 기록 후 Claude/Opus 단독 진행 |
| **stderr 에러** | 결과 섹션에 "Codex 에러" 블록으로 포함 (블로킹 금지) |

> **하드게이트 예외 주의**: `/cp deep` S4 는 Codex *부재/미인증* 시 degrade 금지(정지·보고)지만, *180초 초과* 는 다르다 — codex 는 응답 중이었으므로 부분 결과를 "미완 협의"로 반영하고 진행하되, 커버리지 공백이 남으면 S5 회귀로 보강(§8.5). 무한 대기로 사용자를 잡지 않는다.

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
- **Phase 4.5 코드리뷰 (구조화 — v3.36 개정)**: 종전 권장이던 **`codex exec review --uncommitted` 는 폐기**한다. git 을 직접 읽어 diff 주입이 필요 없다는 장점은 실재했지만, CLI 가 `--uncommitted` 와 `[PROMPT]` 의 **병용을 거부**해서 **탐색 범위를 지시할 방법이 없다**. 실측(2026-09-01, 이 레포): 300초 동안 레포 전역 `rg`·PowerShell 을 **22회** 돌리고 644KB 의 JSONL 만 남긴 채 **판정을 못 냈다** — 게이트가 존재 이유인 바로 그 상황에서 죽은 것이다. §7 의 "초과가 반복되면 상한보다 프롬프트를 먼저 의심하라"가 여기에 그대로 적용되는데, 이 레시피에는 의심할 프롬프트 자리 자체가 없었다.

  대신 **diff 를 주입한 평범한 `codex exec` + `--output-schema`** 를 쓴다. 구조화 판정(=awk PASS/FAIL 휴리스틱 제거)은 그대로 유지하면서 탐색 상한을 프롬프트로 걸 수 있다. 배관은 전부 `scripts/codex-review.sh --mode review` 안에 있으므로 호출자가 이 형태를 손으로 쓸 일은 없다:

  ```bash
  # 실제 호출은 이 한 줄이다 (레인 2개 동시 — §8.6)
  bash "${CLAUDE_PLUGIN_ROOT}/scripts/cross-verify.sh" --mode review --tag p45
  ```

  스크립트가 안에서 하는 일: ① 작업트리 diff + **미추적 파일 본문**(60KB 상한, 넘으면 잘렸다고 **표기** — 조용한 절단은 반만 읽은 파일을 pass 시킨다)을 모아 ② 탐색 상한("파일 최대 5개, 레포 전역 grep 금지")과 함께 프롬프트 파일로 만들고 ③ `-` + 파일 리다이렉트로 **stdin 을 통해** 넘긴다(§1.5 ①②) ④ `--output-schema` 로 `{verdict, high_findings}` 를 강제하고 `-o` 로 **최종 메시지만** 받는다(644KB 이벤트 스트림을 파싱할 일이 없다) ⑤ `-s read-only` 로 샌드박스를 좁힌다 — 리뷰 대상 diff 는 신뢰할 수 없는 입력이고, 사용자 `config.toml` 기본값은 `danger-full-access` 다.

  ⚠️ **스키마에 `"additionalProperties": false` 가 없으면 서버가 400 을 낸다** (`Invalid schema for response_format ... 'additionalProperties' is required to be supplied and to be false`). v3.35 까지의 스키마에는 이게 빠져 있었다 — `exec review` 가 애초에 최종 메시지에 도달하지 못해 드러나지 않았을 뿐이다.

- **합성/게이트**: 조사 결과는 Claude 가 합의/분기로 분류해 통합 (Phase 2.4). 리뷰 결과는 Supervisor 와 AND 게이트 (둘 다 pass 여야 진행).

## 8.6 세 번째 레인 — Grok (v3.36)

게이트가 Supervisor + Codex 두 레인이던 동안, **둘 다 프론티어 추론 모델이라 학습 분포가 겹쳤다.** 겹치는 블라인드 스팟에서는 둘이 나란히 통과시킨다 — 게이트가 있는데도 조용히 새는 경우다. Grok 은 벤더·학습셋·툴 루프가 모두 달라서 그가 반대하는 지점이 정확히 앞의 둘이 볼 수 없던 지점이다. Grok Build CLI 는 **구독**(세션 인증, API 키 아님)이라 호출당 추가 비용이 0 이다.

- **스크립트**: `scripts/grok-review.sh` — 플래그·종료 코드가 `codex-review.sh` 와 **동일**하다. 네 번째 레인이 필요하면 이 파일을 복사하는 것이 추가 절차의 전부다.
- **인증 감지**: `~/.grok/auth.json` 이 비어있지 않은지만 본다. 네트워크 프로브는 호출마다 왕복을 더하므로 쓰지 않는다.
- **읽기 전용 자세**: `--tools read_file,grep,list_dir --disable-web-search`. 리뷰 대상 diff 는 **신뢰할 수 없는 입력**이고, `--always-approve` 와 `bash`·`search_replace` 가 함께 있으면 남의 패치에 심긴 프롬프트 인젝션이 로컬 코드 실행이 된다. 허용목록이라 오타가 나면 **시끄럽게** 실패한다(거부목록은 조용히 위험한 툴을 남긴다).
- **`--sandbox strict` 는 쓰지 않는다**: 그 아래서 `read_file` 이 `tool_output_error` 를 내고 에이전트가 실패한 호출을 상한까지 재시도했다 — 300초·0바이트 대 14초·정상 판정(2026-09-01 실측). 쓰기·실행 표면을 없애는 것은 허용목록이지 strict 가 아니다.
- **구조화 출력**: `--json-schema` 는 `--output-format json` 을 함의하며, 모델의 답은 봉투의 `.text` 에 **JSON 문자열로** 들어온다. 스크립트가 이걸 벗겨서 codex 레인과 **같은 `{verdict, high_findings}` 모양**으로 `$OUT` 에 쓴다 — 호출자가 봉투 형식 두 개를 배울 일이 없다.

### 남은 리스크 — 읽기 노출 (수용, v3.36)

리뷰 대상 diff 는 원리적으로 신뢰할 수 없는 입력이고, 두 레인 모두 **읽기 도구는 계속 쥐고 있다.** 따라서 악의적 diff 에 심긴 프롬프트 인젝션이 로컬 파일을 읽어 외부 모델 요청에 실을 여지는 남는다 (`-s read-only` 는 *쓰기*를 막을 뿐 읽기 범위를 좁히지 않는다). 막은 것과 남긴 것을 분명히 해 둔다:

- **막았다**: 쓰기·셸 실행(허용목록에 `bash`·`search_replace` 없음, codex 는 `-s read-only`), 그리고 **심볼릭 링크 역참조** — 레포 밖을 가리키는 미추적 링크 하나면 그 대상 파일이 통째로 프롬프트에 실렸다.
- **남겼다**: 레포 내 파일 읽기. 리뷰어에게서 읽기를 뺏으면 지적의 근거를 확인할 수 없어 "정보 부족으로 판단 불가"만 내놓는 레인이 된다(실측 — 그 응답이 high 지적으로 올라가 게이트를 거짓 차단했다).
- **전제**: `/cc` 가 리뷰하는 diff 는 **자기 Worker 가 방금 쓴 것**이다. 외부 PR 처럼 제3자가 쓴 diff 를 이 레인에 물릴 때는 이 전제가 깨지므로, 그때는 시크릿이 레포 안에 없는지 먼저 확인한다.

### 오케스트레이터 — `scripts/cross-verify.sh`

레인 2개를 **동시에** 띄우고 판정을 합쳐 세 종류의 줄로 보고한다. 이게 호출자가 아는 전부다:

```
LANE codex status=ok      verdict=fail findings=3 elapsed=256s out=.lens/verify/p45-codex.out
LANE grok  status=ok      verdict=pass findings=0 elapsed=14s  out=.lens/verify/p45-grok.out
FINDING codex path/to/file.ts:120 — 무엇이 왜 틀렸나
VERDICT FAIL lanes_ok=2 lanes_down=0
```

- **죽은 레인은 투표하지 않는다** — `timeout`·`unavailable`·`unparsable` 은 `lanes_down` 으로 세고 게이트는 나머지로 계속한다. 침묵을 pass 로 세면 도구가 깨지는 바로 그 순간에 게이트가 약해진다.
- **종료 코드에 판정을 싣지 않는다** — 0 이 아닌 종료는 「스크립트 자체가 깨졌다」와 구분되지 않고, 그 둘을 구분 못 하는 리뷰 게이트는 인프라 오류에서 fail-open 한다. 판정은 `VERDICT` 줄로만 읽는다.
- 레인 출력은 실행 **전에** 비운다. 감지·인증 단계에서 죽은 헬퍼는 자기 `: > $OUT` 에 도달하지 못해 지난 실행의 판정이 그 경로에 남고, 낡은 FAIL 이 새 FAIL 로 읽히는 것은 게이트가 작동하는 것처럼 보이기 때문에 가장 나쁜 오답이다.

## 9. 관련 파일 / 외부 참조

### 로컬

- 스킬: `~/.claude/skills/codex-review/SKILL.md` — Claude Code 안에서 `/codex-review` 호출용 (별도 설치 완료)
- Lens PLAN 모드: `~/.claude/plugins/lens/skills/cp/` — Phase 2.5에서 본 문서 참조

### 외부

- 공식 CLI 문서: <https://developers.openai.com/codex/cli/>
- GitHub 저장소: <https://github.com/openai/codex>
- ChatGPT 구독 정책: <https://openai.com/chatgpt/pricing/>
