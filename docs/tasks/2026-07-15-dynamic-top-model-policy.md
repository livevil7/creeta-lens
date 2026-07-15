---
title: Lens 모델 정책 전환 — 고정 모델명 폐지, "항상 그 시점의 최고 모델" 자동 추종
date: 2026-07-15
planner: cp
grade: standard
status: in-progress
refs: [docs/rules/codex-integration.md, docs/rules/harness-rules.md, docs/rules/capability-assumptions.json]
---

# Lens 모델 정책 전환 — 고정 모델명 폐지, "항상 그 시점의 최고 모델" 자동 추종

## 🎯 What — 목표 (무엇이 가능해지는가)

**이 작업이 끝나면 가능해지는 것:**

- Lens가 부리는 모든 일꾼(계획 조사·코드 작성·검토·품질 검증)이 **업무 난이도에 맞는 등급의 모델**로 일하되, **가장 어려운 업무는 항상 그 시점의 가장 똑똑한 모델**이 맡는다. 새 AI 모델이 출시되어도 **문서를 사람이 고치지 않아도** 이 배분이 자동으로 따라간다.
- 오늘 기준으로는: 어려운 업무(설계·검토·검증)는 **Fable**(현재 1등)이, 중간 업무(코드 작성·분석)는 중간 모델이, 단순 업무(파일 읽기·상태 확인)는 경량 모델이 맡고, codex 검증 파트너는 **GPT-5.6-Sol**(현재 1등)로 실행된다. 지금은 최고 난이도 자리에 한 세대 전 모델(opus, gpt-5.5)이 이름으로 못박혀 있어 그보다 낮은 두뇌로 돌고 있다.
- ⚠️ 사용자 정정 반영 (2026-07-15 Modify): "최고 모델을 전 역할에 무차별 배정"이 아니다 — **난이도별 배분이 원칙**이고, 사다리의 각 칸이 모델 세대와 함께 자동으로 올라가는 것이 이 작업의 본질이다.

**완료의 정의 (Done = ?):**

> 이 컴퓨터에서 Lens의 계획·실행·검증이 문서 수정 없이 난이도별 적정 모델(최고 난이도 = Fable, codex = GPT-5.6-Sol, 단순 업무 = 경량 모델)로 도는 것이 실제 실행으로 확인되고, 다음 세대 모델이 나와도 같은 배분 규칙이 자동 적용된다는 것이 새 버전(v3.24.0)으로 출시되어 있다.

## ❓ Why — 왜 해야 하는가 (6하원칙)

- **왜 지금**: 2026년 7월 현재 상위 모델 Fable(Claude 계열)과 GPT-5.6-Sol(OpenAI 계열)이 이미 출시되어 있는데, Lens의 지시문에는 한 세대 전 모델 이름(opus, gpt-5.5)이 못박혀 있다. gpt-5.5는 codex의 모델 순위표에서 이미 **7위까지 밀려난 상태**다. 즉 Lens의 모든 품질 검증이 지금 이 순간에도 한 단계 낮은 두뇌로 돌고 있다.
- **무엇을**: 못박힌 모델 이름을 "난이도별 모델 사다리" 규칙으로 교체한다 — 사다리의 각 칸(경량/중간/최상위)은 이름이 아니라 상대 위치라서 모델 세대가 바뀌면 자동으로 올라가고, **최고 난이도 칸은 항상 그 시점의 1등 모델**이 된다.
- **어떻게**: Claude 쪽은 "난이도 사다리(Easy=경량/Medium=중간/Hard=최상위) + 최상위 칸은 세션 물려받기 우선" 규칙으로, codex 쪽은 컴퓨터에 저장된 모델 순위표에서 1등을 자동으로 골라주는 한 줄짜리 자동 선택기(resolver)로 — codex는 이종 검증 파트너라 모델은 1등 고정이고 난이도는 추론 깊이 다이얼(소규모 xhigh/대규모 high, 기존 규칙)로 배분한다. (상세는 🛠 How)
- **누구를 위해**: Lens를 쓰는 모든 작업 — 이 사용자의 전 프로젝트에서 이뤄지는 계획·실행·검증의 품질.
- **어디서**: creeta-lens 리포를 고쳐 새 버전으로 출시 → 이 컴퓨터부터 적용, 다른 컴퓨터는 각자 업데이트 시 적용.
- **안 하면**: 모델 세대가 바뀔 때마다 이번 같은 수동 개정 작업을 반복해야 하고, 누군가 알아차리고 고치기 전까지는 낮은 품질의 모델로 검증이 돈다. 이번에도 gpt-5.5가 7위로 밀릴 때까지 아무도 몰랐다.

## 📖 용어 풀이 (운영자용 — 이 문서를 읽는 데 필요한 개념)

| 용어 | 쉬운 설명 |
|------|-----------|
| **모델** | AI의 두뇌 등급. 높은 모델일수록 더 깊게 생각한다. Claude 계열은 haiku < sonnet < opus < **fable** 순, OpenAI 계열은 현재 **gpt-5.6-sol**이 1등. |
| **하드코딩** | 문서나 프로그램에 이름을 "못박아" 둔 것. 세상이 바뀌어도 못박은 값은 스스로 안 바뀐다. |
| **세션 모델** | 사용자가 지금 Claude Code를 켤 때 고른 모델. 이 사용자는 항상 최신 최고 모델로 켠다. |
| **상속(물려받기)** | Lens가 일꾼을 띄울 때 모델을 따로 지정하지 않으면, 일꾼이 세션 모델을 그대로 물려받는 것. 세션이 1등 모델이면 일꾼도 자동으로 1등. |
| **Task tool enum** | Claude가 부하 일꾼을 띄울 때 고를 수 있는 두뇌 목록. Claude Code 프로그램이 관리하며, 새 모델이 나오면 목록에 자동으로 추가된다. 현재: sonnet, opus, haiku, **fable**. |
| **모델 순위표 (models_cache.json)** | codex 프로그램이 각 컴퓨터에 저장해 두는 "지금 쓸 수 있는 모델 목록 + 순위" 파일. OpenAI가 새 모델을 내면 이 파일이 자동 갱신된다. 실측: 1위 gpt-5.6-sol, 2위 gpt-5.6-terra, 3위 gpt-5.6-luna, 7위 gpt-5.5. |
| **resolver(자동 선택기)** | 순위표에서 1등을 자동으로 골라주는 한 줄짜리 명령. 사람이 이름을 알 필요가 없다. |
| **fallback(2안)** | 1안이 실패했을 때 자동으로 넘어가는 예비 경로. |
| **marketplace 태그** | Lens 새 버전을 출시할 때 git에 붙이는 버전 꼬리표. **꼬리표를 안 올리면 다른 컴퓨터가 옛 버전을 설치**한다 (과거 실제 사고 이력 있음). |

## 🧰 실행 전략 & 자원

- **난이도**: medium — 파일 9개, 수정 지점 약 45곳 + 출시 절차. 단, 새로 만드는 로직은 자동 선택기 한 줄뿐이고 나머지는 지시문 텍스트 교체라 위험도는 낮은 편.
- **권장 모델**: 이 세션(Fable)이 직접 실행. 계획 승인 후 /cc 핸드오프 시에도 새 규칙(최상위 상속) 그대로 적용됨.
- **병렬 실행**: 파일 수정은 순차 (스킬 문서끼리 서로를 참조하므로 일관성 유지가 우선). 검증 7건 중 5건은 병렬 실행 가능. Pre-mortem은 ultracode 워크플로로 4명의 회의론자(skeptic)를 병렬 배포해 계획의 허점을 공격시킴.
- **활용 도구**: node (Lens가 이미 board-builder로 의존 — 추가 설치 불필요), git, codex CLI. Playwright 불필요 (화면 작업 아님).
  - ⚠️ 자동 선택기를 python으로 짜면 안 되는 이유: Windows에서 `python3` 명령은 Microsoft Store 안내 프로그램(가짜)이 가로채는 함정이 있다(실측 이력). node는 Lens가 이미 쓰고 있어 안전.
- **기존 자원 재사용**:
  - `scripts/bump-version.sh` — 버전 번호를 **14곳**에 일괄 갱신하는 출시 스크립트 (스크립트 직접 확인 실측 — 메모리의 "11곳"은 낡은 정보).
  - `lib/board-builder.js` — 작업 보드 HTML 재생성.
  - `docs/rules/capability-assumptions.json` + `/crv` 감사 — Lens가 스스로 낡은 부분을 감지하는 기존 체계. 여기에 "모델 순위표 감시"를 추가해 미래 드리프트를 자동 감지.
  - `docs/rules/codex-integration.md`의 기존 400-fallback 설계 (모델 이름이 서버에서 거부되면 이름 없이 재시도) — 폐기하지 않고 유지.

## 🛠 How — 어떻게 (Plan A / Plan B)

### Plan A — 권장 경로

#### 설계 원칙 (왜 이 방식이 1순위인가)

1. **이름을 지우고 규칙을 남긴다.** "opus를 써라"(이름)가 아니라 "목록의 1등을 써라"(규칙)로 바꾸면, 목록은 Claude Code와 codex 프로그램이 알아서 갱신하므로 Lens는 영원히 고칠 필요가 없다.
2. **Claude 쪽 — 난이도 사다리 + TOP 규칙 (사용자 Modify 반영 2026-07-15)**:
   - **배분의 원칙은 업무 난이도다.** 최고 모델을 전 역할에 무차별 배정하지 않는다 (사용자 공식 지시 — 기존 /cc의 "품질 우선, 토큰 비용 비고려로 전부 opus" 철학은 이번에 폐기).
   - **난이도 사다리 (각 칸은 이름이 아니라 상대 위치 — 모델 세대와 함께 자동 상승)**:
     - **Easy** (파일 읽기·검색·자료 수집·단순 수정·상태 확인) = **경량 티어** (현재 haiku)
     - **Medium** (코드 작성·분석·디버깅·콘텐츠 작성) = **중간 티어** (현재 sonnet)
     - **Hard** (설계·복잡한 리팩토링·보안·계획·심층 검토·적대적 검증) = **최상위 티어 = TOP**
   - **TOP의 판정 절차**: 세션 모델이 두뇌 목록(Task tool enum) 최상위와 같거나 상위(예: Fable)면 **모델 지정 생략(상속)**, 미만이면 **목록 최상위를 명시 지정** (현재 fable, 목록에 없으면 opus). 미래에 낯선 이름의 새 모델이 나와 우열 판별이 안 될 때는 상속이 안전 기본값.
   - **Supervisor·QA는 "최고 사용 티어와 동급"**: TOP worker가 하나라도 있으면 Supervisor/QA도 TOP — "주니어가 시니어 코드를 리뷰"하는 역전 방지 (기존 /c의 승격 로직을 /cc에도 일반화). Monitor는 항상 haiku (단순 폴링 — 상위 모델 품질 이득 0, 실측 근거 기존 문서에 있음).
   - 이 사다리로 /c(기존 경제 티어제)와 /cc(기존 전부-opus)가 **동일 규칙으로 통일**된다. harness-rules.md §4.1의 상속 조항은 Hard 티어의 기본 경로로 승격.
3. **Codex 쪽 — 순위표 1등 자동 선택 (resolver, Pre-mortem 반영 강화판)**: 매 호출 직전에 컴퓨터의 모델 순위표에서 1등을 뽑아 `-m`으로 전달. **빈 값이 `-m ""`으로 흘러들어가지 않도록** 인자를 분기한다 (Pre-mortem blocker 2건의 해소책).
   ```bash
   CODEX_MODEL=$(node -e "const p=require('path'),os=require('os');const d=require(p.join(os.homedir(),'.codex','models_cache.json'));const m=d.models.filter(x=>x.visibility==='list'&&x.supported_in_api!==false).sort((a,b)=>(a.priority??99)-(b.priority??99))[0];if(!m||!m.slug)process.exit(1);console.log(m.slug)" 2>/dev/null) || CODEX_MODEL=""
   MODEL_ARG=(); if [ -n "$CODEX_MODEL" ]; then MODEL_ARG=(-m "$CODEX_MODEL"); else echo "⚠️ 모델 resolver 실패 — codex config 기본 모델로 진행"; fi
   timeout 180 codex exec ... "${MODEL_ARG[@]}" ...   # 400 거부 시 → MODEL_ARG 비우고 1회 재시도 (기존 fallback 유지)
   ```
   - 강화 포인트 (Pre-mortem 27건 중 runtime 렌즈 반영): ① `path.join` — OS 무관 경로 정규화. ② `if(!m||!m.slug)process.exit(1)` — 빈 배열이면 명시적 실패 (TypeError로 비결정 종료 금지). ③ `|| CODEX_MODEL=""` — 실패 시 항상 빈 값으로 확정. ④ `MODEL_ARG` 배열 분기 — 빈 값이 `-m ""`으로 전달되는 사고 원천 차단. ⑤ 플래그 echo가 스킬 실행 대화에 남아 결과 보고에 그대로 복사됨 (기록 위치 = codex 호출 직후 stdout → 각 스킬의 결과 문서/보고 상단에 복사 의무).
   - 실측 완료 (2026-07-15, 이 컴퓨터): 성공 경로 → `gpt-5.6-sol` 반환 + 실호출 EXIT 0 ("SOL-OK") + `service_tier=fast` 통과. 실패 경로(파일 부재 모사) → 빈 값 + 플래그 경로 정상 작동.
   - `supported_in_api` 필터는 Codex 듀얼트랙 조사가 제안한 것을 채택 (API로 못 쓰는 모델이 뽑히는 사고 방지).
4. **조용한 강등 금지**: fallback으로 낮은 모델/기본 모델로 넘어가면 반드시 결과 문서에 "⚠️ 모델 resolver 실패 — config 기본 모델로 진행" 플래그를 남긴다. (Codex 조사가 지적한 "몰래 낮은 모델로 도는" 위험을 플래그 의무로 해소.)
5. **깊이 다이얼은 안 건드린다**: 기존 규칙(소규모 xhigh / 대규모 high + timeout 180초)은 그대로 유효 — gpt-5.6-sol도 xhigh/high 단계를 동일하게 지원함을 실측 확인. (신설된 max/ultra 단계는 이번 범위 밖 — 후속 검토 과제.)
6. **과거 기록은 안 고친다**: docs/history/, CHANGELOG.md의 과거 항목, CLAUDE.md 버전 히스토리, "실측(gpt-5.5)" 같은 측정 출처 표기는 역사적 사실이므로 그대로 둔다. 고치는 건 "앞으로 이렇게 하라"는 지시문만.

#### 단계 (수정 지점 전량 — 파일별 inline)

**[A] docs/rules/codex-integration.md — codex 호출 규칙의 원본(SoT), 7개 지점**

- [ ] A1. 9행: "(이 확장 빌드가 노출하는 모델: `gpt-5.5`)" → "(모델은 머신의 모델 순위표에서 최상위를 자동 선택 — §4 resolver)"
- [ ] A2. §4 표준 호출 블록(75~78행): 호출 앞에 위 resolver 한 줄 추가 + `-m gpt-5.5`를 `-m "$CODEX_MODEL"`로 교체. resolver 실패 시 `-m` 생략 + 플래그 규칙 명기.
- [ ] A3. 91행: "`-m gpt-5.5` — 모델 명시 고정. config 기본값에 의존하지 않고…" → "`-m "$CODEX_MODEL"` — 순위표 1등 동적 지정. 특정 이름에 의존하지 않으며, 데스크톱 앱에서 사용자가 바꾼 config 기본값에도 의존하지 않는다."
- [ ] A4. §6(114~116행) fallback 규칙: 기존 "400이면 -m 빼고 재시도" 유지 + "resolver 실패(순위표 부재/스키마 변경)면 -m 생략" 경로 추가 + "어느 fallback이든 발동 시 결과 문서에 ⚠️ 플래그 의무" 추가.
- [ ] A5. 165행: "gpt-5.5는 영문 응답 기본값이므로" → "codex 모델은 영문 응답이 기본값이므로" (모델 무관 일반화).
- [ ] A6. §8(222행) `codex exec review` 호출: `-m gpt-5.5` → `-m "$CODEX_MODEL"` (resolver 재사용).
- [ ] A7. 101행 "실측(gpt-5.5)"은 측정 당시 모델 표기(역사적 사실)이므로 **유지**. 대신 괄호로 "(gpt-5.6-sol도 xhigh/high 지원 실측 확인 2026-07-15)" 한 줄 병기.

**[B] docs/rules/capability-assumptions.json — /crv 자기 감사 항목, 5개 지점**

> ⚠️ 편집 안전 규칙 (Pre-mortem deploy 렌즈 반영): 이 파일은 JSON — 라인 단위 sed 편집 금지. Edit 도구의 문자열 정밀 교체만 사용하고, **B1~B5 완료 직후 `node -e "require('./docs/rules/capability-assumptions.json')"` 로 파싱 검증** (exit 0 필수). 깨지면 /crv 감사 전체가 죽는다.

- [ ] B1. 15행(task-dispatch 항목 purpose): "모델 티어 배정(haiku/sonnet/opus)" → "(haiku/sonnet/최상위 티어)" 갱신.
- [ ] B2. 23행: "Task model enum이 [sonnet,opus,haiku]로 닫혀 있어" → "[sonnet,opus,haiku,fable]로 확장됐고 계속 자람" — 낡은 사실 갱신.
- [ ] B3. 189행: "gpt-5.5/service_tier=priority는 서버측 검증" → 동적 resolver 문구로 갱신.
- [ ] B4. 198행(codex-call-params 항목 purpose): "호출 파라미터(gpt-5.5, …)" → "(models_cache.json resolver, …)".
- [ ] B5. 200행(gap_closed_signal): "gpt-5.5가 서버에서 폐기되면 400" → "models_cache.json 스키마 변경/부재 시 resolver가 빈 값 반환 → fallback 플래그 발생 빈도로 감지. Task enum 최상위가 fable이 아니게 되면(새 모델 등장) 스킬 문서의 '현재 fable' 예시 표기가 낡음 — /crv가 개정 제안" — **미래 모델 드리프트를 Lens가 스스로 감지하는 채널**.

**[C] docs/rules/harness-rules.md §4.1 (92~95행) — 1개 지점**

- [ ] C1. 심사 결론 보강: "고정 할당(opus) 유지 + 불확실하면 상속" → "**상속이 기본**(세션 모델이 최상위 티어일 때), 명시 spawn 시 Task enum 최상위(현재 fable). 고정 이름 할당은 폐지(v3.24.0)". 심사 기록 형식은 유지하되 결론을 개정 (개정일 명기).

**[D] skills/cc/SKILL.md — 병렬 실행 엔진, 15개 지점 (사용자 Modify 반영: 전부-TOP이 아니라 난이도 사다리로 전환)**

> /cc는 지금 "품질 우선(토큰 비용 비고려) — 전 역할 opus 고정"인데, 이 철학 자체를 폐기하고 /c와 같은 **난이도 사다리**로 통일한다 (사용자 지시 2026-07-15). Monitor=haiku는 유지, Supervisor/QA는 "최고 사용 티어 동급" 승격 로직.

- [ ] D1. 156행 (모델 정책 선언부): "품질 우선 (토큰 비용 비고려): substantive 역할은 항상 `opus`" → **"난이도 기반 배분: Worker는 난이도 사다리(Easy=경량(현재 haiku)/Medium=중간(현재 sonnet)/Hard=TOP)로 배정"** + TOP 정의 1회 명기: "TOP = 세션 모델이 enum 최상위와 같거나 상위면 지정 생략(상속), 미만이면 enum 최상위 명시(현재 fable, 없으면 opus)."
- [ ] D2. 157행: 상속 문구를 TOP 정의의 판정 절차로 통합 (Hard 티어에서 세션 ≥ 최상위 = 상속이 기본).
- [ ] D3. 162~167행 모델 테이블 재작성: Worker(Easy)=`haiku`(경량 티어) / Worker(Medium)=`sonnet`(중간 티어) / Worker(Hard)=`TOP` / Monitor=`haiku` 유지(사유: 폴링뿐 — 상위 모델 품질 이득 0) / Supervisor=`최고 사용 Worker 티어와 동급`(TOP worker 있으면 TOP) / QA=`최고 사용 Worker 티어와 동급`.
- [ ] D4. 125·132행 아키텍처 다이어그램 라벨: "opus model" → "assigned model (난이도별)".
- [ ] D5. 258~261행 Worker 할당 규칙: "모든 Worker는 `opus`(품질 우선)" → 난이도별 배분 규칙으로 재작성 — "Easy(단순 작업): 경량 티어(현재 haiku) / Medium(코드·분석): 중간 티어(현재 sonnet) / Hard(복잡한 아키텍처): TOP". 난이도 라벨이 참고용이 아니라 **배정 기준**으로 복원됨.
- [ ] D6. 285~287행 할당 예시 테이블: 난이도별 예시로 — Medium 행=`sonnet`, Easy 행=`haiku`, Hard 행=`fable`(TOP 현재 값).
- [ ] D7. 385행: "할당된 모델 (opus — Monitor만 haiku)" → "(난이도별 배정 모델 — Monitor는 haiku)".
- [ ] D8. 513행: "Supervisor 모델 = `opus` 고정" → "= 최고 사용 Worker 티어와 동급 (TOP worker 있으면 TOP)" + 역전 방지 사유 유지.
- [ ] D9. 515행: "(opus)를 Task 도구로 spawn" → "(위 규칙으로 정한 모델)".
- [ ] D10. 521행 Supervisor 프롬프트: "당신의 모델은 opus입니다" → "당신은 Worker 최고 티어와 동급 모델입니다".
- [ ] D11. 690행: "QA Agent (opus 모델)" → "(최고 사용 Worker 티어와 동급)".
- [ ] D12. 917~921행 사용 예시: 난이도별로 — 프로젝트 초기화(Easy)=haiku, 컴포넌트/페이지(Medium)=sonnet, 대시보드 시각화·E2E(Hard/Medium)=fable/sonnet ×5행 재배정.
- [ ] D13. 589행 codex review 호출: `-m gpt-5.5` → resolver + `"${MODEL_ARG[@]}"` (§4 참조 문구).
- [ ] D14. 599행 구버전 fallback 문구: `-m gpt-5.5` → resolver 결과 사용으로 교체.
- [ ] D15. 115행 "Monitor Agent (Haiku)" — 변경 없음 확인만.

**[E] skills/c/SKILL.md — 단일 워커 엔진, 10개 지점 (변경 최소 — /c는 이미 난이도 사다리. Hard 칸만 opus→TOP으로 올리면 /cc와 동일 규칙이 된다)**

- [ ] E1. 103행: "Assign model (haiku/sonnet/opus)" → "(haiku/sonnet/TOP)".
- [ ] E2. 161행: "**Hard** → `opus`" → "→ `TOP` (Task enum 최상위, 현재 fable)".
- [ ] E3. 244행: "(haiku/sonnet/opus)" → "(haiku/sonnet/TOP)".
- [ ] E4. 378~382행 Supervisor 승격 규칙: "`opus` worker 존재 → Supervisor = `opus`" → "TOP worker 존재 → Supervisor = TOP" (역전 방지 사유 문구도 동일 교체).
- [ ] E5. 390행: "(opus/sonnet)" → "(TOP/sonnet)".
- [ ] E6. 391행: "opus인 경우:" → "TOP인 경우:".
- [ ] E7. 612행 상속 노트: 이미 올바름 — "기본" 승격 문구로만 보강 (D2와 동일 취지).
- [ ] E8. 619~620행 테이블: Worker(hard) `opus` → `TOP`, Supervisor "sonnet/opus" → "sonnet/TOP".
- [ ] E9. 673행 예시: "(Hard, opus, general)" → "(Hard, fable, general)".
- [ ] E10. 751행: "sonnet → opus 업그레이드" → "sonnet → TOP".

**[F] skills/ccp/SKILL.md — QA/검증 엔진, 2개 지점**

> /ccp의 역할들은 성격상 전부 Hard 난이도(적대적 검증·정밀 수복 — 기존 문서 스스로 "얕으면 못 깬다"고 명기)라서, 난이도 사다리를 적용하면 자연히 TOP이 된다. 무차별 배정이 아니라 난이도 판정의 결과.

- [ ] F1. 107행: "4 Skeptic 병렬 배포(각 opus)" → "(각 TOP — 적대적 검증은 Hard 난이도)".
- [ ] F2. 196~198행 역할 테이블: Inspector·Skeptic×4·Repairer `opus` → `TOP` (난이도 근거 병기, 진행 모니터 `haiku` 유지).

**[G] skills/cp/SKILL.md — 계획 엔진, 4개 지점**

- [ ] G1. 318행 문서 템플릿: "권장 모델: {haiku / sonnet / opus}" → "{haiku / sonnet / TOP}".
- [ ] G2. 405~470행 Pre-mortem 절: 명칭 "Opus Pre-mortem" → "Claude Pre-mortem (TOP)" + 415행 "세션 모델이 opus면 내부 수행, 그 외엔 opus agent spawn" → "세션 모델이 최상위 티어면 내부 수행, 그 외엔 TOP agent spawn" (411·436·442·460·469·470행의 Opus 표기 일괄).
- [ ] G3. 441행 codex 호출: `-m gpt-5.5` → resolver + `-m "$CODEX_MODEL"`.
- [ ] G4. TOP 정의 문구 1회 삽입 (D1과 동일 문구 — 스킬은 런타임에 자기 문서만 읽으므로 스킬마다 정의 필요).

**[H] skills/cpp/SKILL.md — 심층 계획 엔진, 3개 지점**

- [ ] H1. 92행 실행전략 항목: "권장 모델(haiku/sonnet/opus)" → "(haiku/sonnet/TOP)".
- [ ] H2. 168행 codex 표준 호출: `-m gpt-5.5` → resolver + `-m "$CODEX_MODEL"`.
- [ ] H3. TOP 정의 문구 1회 삽입.

**[I] 출시 (릴리즈) — 5단계**

- [ ] I1. CHANGELOG.md에 v3.24.0 항목 작성 (무엇이 왜 바뀌었나).
- [ ] I2. CLAUDE.md Version 섹션에 v3.24.0 한 줄 추가 (기존 히스토리 형식 그대로).
- [ ] I3. `bash scripts/bump-version.sh 3.24.0` — 버전 번호 **14곳** 일괄 갱신 (스크립트의 "Files with v3.24.0: 14/14" 검증 출력 확인).
- [ ] I4. **순서 엄수**: ① `git add -A && git commit` (marketplace.json의 `ref: v3.24.0` 갱신이 **커밋에 포함**된 것 확인 — 커밋 전에 태그를 만들면 태그가 옛 ref를 가리키는 사고) → ② `git tag v3.24.0` → ③ `git push origin master --tags` → ④ 검증: `git show v3.24.0:.claude-plugin/marketplace.json | grep ref` 출력이 `v3.24.0`. **태그 필수** — marketplace가 태그를 보고 설치하므로 태그 없이 push만 하면 다른 컴퓨터에 옛 코드가 설치된다 (실제 사고 이력).
- [ ] I5. 이 컴퓨터에 새 버전 반영 (`claude plugin update` 또는 /lens-upgrade) 후 설치 버전 3.24.0 확인. 다른 컴퓨터(Mac Mini 등)는 각자 다음 /ci·/lens-upgrade 때 자동 반영 (이번 범위 밖, 기록만).

**변경하지 않는 것 (명시)**: skills/cr·cs·cu·ci·cps·crv (모델 배정 없음 — grep 실측 0건), docs/history/* 전부, CHANGELOG 과거 항목, CLAUDE.md 버전 히스토리(17행의 gpt-5.5 언급 포함), codex-integration.md 101행 실측 표기, Monitor/QA의 haiku 배정(/c의 QA=haiku 포함 — 경제형 설계 유지).

#### 막힐 수 있는 지점 (→ Plan B 트리거)

- **T1**: resolver 한 줄이 이 컴퓨터 Git Bash에서 실행 실패 (node 경로·따옴표 문제) → 문법 조정 1회 재시도, 그래도 실패하면 **Plan B-1** 전환.
- **T2**: `codex exec -m gpt-5.6-sol`이 400 거부 (검증 완료라 가능성 낮음) → **Plan B-1** 전환.
- **T3**: Task tool로 fable 명시 spawn이 거부됨 (권한/플랜 문제) → **Plan B-2** 전환.
- **T4**: 출시 후 marketplace 설치가 옛 버전 (태그 문제) → I4 재실행 (lens-release-process 절차 재점검).

### Plan B — Fallback 경로

#### B-1 (codex 쪽): 런타임 자동 선택 포기 → "현재 1등 이름 고정 + 자동 감시"

- **Trigger**: Plan A의 T1 (resolver 실행 불가) 또는 T2 (동적 선택 모델 400 거부).
- **왜 이 대안인가**: 자동 "추종"은 포기하지만 자동 "감지"는 유지하는 절충. 문서에 `-m gpt-5.6-sol`을 명시하되, capability-assumptions.json 감시 항목에 "순위표 1위 ≠ 문서 명시 모델이면 /crv가 개정 알림"을 넣는다. 다음 세대 모델이 나오면 사람이 고치긴 해야 하지만, Lens가 낡았다고 스스로 알려준다. trade-off: 수동 개정 1회/세대 발생.
- **단계**: [ ] §4에 `-m gpt-5.6-sol` 고정 표기 → [ ] capability-assumptions.json에 순위표 대조 감시 항목 추가 → [ ] 나머지 A3~A6·D13~14·G3·H2는 고정 이름 기준으로 동일 진행 → [ ] Claude 쪽(C·D~F·G~H의 TOP 규칙)은 Plan A 그대로 (Claude 쪽은 T1~T2와 무관).

#### B-2 (Claude 쪽): fable 명시 spawn 불가 → "상속 단일 규칙"

- **Trigger**: Plan A의 T3 (fable 지정 spawn 거부).
- **왜 이 대안인가**: 이 사용자의 세션은 항상 최상위 모델이므로, 명시 지정 없이 "전 역할 상속(지정 생략)"만으로도 사실상 동일 품질. trade-off: 세션을 낮은 모델로 켠 경우 일꾼도 낮아짐 (이 사용자 패턴에선 발생 확률 낮음).
- **단계**: [ ] TOP 정의를 "항상 지정 생략(상속). Monitor만 haiku 명시"로 단순화 → [ ] 테이블·예시의 fable 표기를 "(상속)"으로 교체.

### 🔀 듀얼 합성 (Claude ‖ Codex gpt-5.6-sol — P0.5 병렬 독립 조사)

**합의 (고신뢰 — 그대로 채택):**
- 순위표(models_cache.json)에서 visibility=list 중 priority 최소를 뽑는 resolver 방식 — 양측 동일 결론. Codex의 `supported_in_api` 필터 추가 제안 채택.
- 구모델명 정적 스윕(grep 0건 확인) + 실제 Task=fable·codex=gpt-5.6-sol 실행 통합시험 + capability-assumptions·릴리즈 버전 갱신 — 양측 동일.
- 대상 파일: skills 5종(c/cc/ccp/cp/cpp) + rules 3종 + bump-version.sh — 거의 일치.

**분기 → 해소 (4건):**
1. **새 rule 문서(model-selection.md) 신설**(Codex) vs **기존 문서 확장**(Claude) → **기존 확장 채택**. 근거: 스킬이 실행 중 읽는 텍스트는 자기 SKILL.md뿐이고, codex 호출의 SoT는 이미 codex-integration.md로 확립돼 있다. 새 문서를 만들면 SoT가 분산되고 스킬은 어차피 그걸 안 읽는다.
2. **`-m` 생략 fallback 폐기, 실패 시 중단(fail-closed)**(Codex) vs **fallback 유지**(Claude) → **유지 + 강등 플래그 의무** 절충. 근거: "이종검증이 조용히 죽는 대신 기본값으로라도 돈다"는 graceful degrade가 Lens의 확립 원칙(§7)이고, 순위표 파일이 없는 컴퓨터(데스크톱 앱 없이 CLI만 있는 서버)가 존재할 수 있다. Codex가 우려한 "몰래 낮은 모델로 도는" 위험은 플래그 의무로 해소.
3. **Monitor까지 최고 모델**(Codex) vs **haiku 유지**(Claude) → **haiku 유지**. 근거: cc/SKILL.md 165행에 실측 사유 명문 ("상태 폴링뿐이라 품질 이득 0") — 기존 설계 의도가 명확.
4. **skills/cr/SKILL.md 포함**(Codex) vs 제외 → **제외**. 근거: grep 실측 — cr에는 모델 배정이 한 건도 없음 (하네스 규칙 문구뿐).

**Codex가 낸 리스크 중 계획에 반영된 것:**
- "캐시 누락·오염 → 잘못된 모델/호출 실패" → fallback + 플래그 의무 + capability-assumptions 감시 (B5).
- "Claude enum에는 순위 정보가 없어 미래 이름의 우열 오판 가능" → 인정. 판별 불확실 시 **상속이 안전 기본값**이라는 문구를 TOP 정의에 포함 + /crv의 enum drift 감사 (B2·B5). 완전 자동 보장은 불가함을 문서에 정직하게 명기.
- "분산된 예제·fallback에 옛 이름 잔존 → 특정 경로만 옛 모델로 실행" → 검증 3번(정적 스윕 0건)으로 차단.

### ⚠️ 사전 리스크 (Pre-mortem — 2026-07-15 수행)

수행 방식: ① Claude Fable 세션 분석(컨텍스트 기반) + ② Codex gpt-5.6-sol 독립 조사(P0.5에서 통합) + ③ **ultracode 워크플로 — 4명의 적대적 회의론자(runtime·consistency·deploy·design 렌즈) 병렬 공격, 27건 수집** 후 중복 제거·계획 반영.

#### Claude Fable 관점 (세션 컨텍스트 기반)

- 컨벤션 위반 없음: resolver는 `os.homedir()` 기반 portable (머신 하드코딩 금지 원칙 준수). capability-assumptions.json은 필드 내 문자열만 교체하므로 /crv 호환.
- 과거 결정과의 모순 없음: "소규모 xhigh/대규모 high + 180s" 규칙 유지, /cc "품질 우선" 철학은 TOP 규칙이 그대로 계승, /c 경제 티어는 설계 의도대로 보존.
- 가장 막힐 가능성이 큰 지점: 리포를 고쳐도 이 컴퓨터의 실행은 플러그인 캐시(3.23.1)에서 나오므로 **I5(플러그인 업데이트) 전까지는 반영 안 됨** — 검증 7번이 이걸 잡는다.

#### Skeptic 패널 핵심 발견 (27건 중 채택·반영 완료 — 계획 본문에 이미 흡수됨)

| # | 렌즈 | 발견 (심각도) | 계획 반영 |
|---|------|--------------|----------|
| 1 | runtime | resolver 빈 결과가 `-m ""`으로 흘러 조용한 강등 (**blocker**) | Plan A-3 강화판: `process.exit(1)` + `MODEL_ARG` 배열 분기 + 실패 경로 실측 완료 |
| 2 | runtime | 순위표 파일 부재(require 에러) 시 비결정 종료 (high) | `\|\| CODEX_MODEL=""` 확정 처리 + path.join 정규화. 실패 경로 실측 통과 |
| 3 | runtime·consistency | "플래그 의무"의 기록 위치 불명 (high) | 기록 위치 확정: 호출 직후 stdout echo → 각 스킬 결과 보고 상단 복사 의무 (A4에 명기) |
| 4 | deploy | bump-version은 11곳이 아니라 **14곳** (high) | I3 수정 + "14/14" 검증 출력 확인 절차화 |
| 5 | deploy | 커밋 전 태그 생성 시 marketplace ref가 옛 버전을 가리킴 (high) | I4 순서 엄수(①커밋→②태그→③push→④`git show` 검증) 명문화 |
| 6 | deploy | capability-assumptions.json 라인 편집 시 JSON 파손 → /crv 사망 (high) | [B] 편집 안전 규칙: Edit 정밀 교체 + node 파싱 검증 의무 |
| 7 | design | 세션이 낮은 모델일 때 상속이 품질을 낮춤 (high) | TOP 정의에 판정 절차 명시: "세션 ≥ enum 최상위면 상속, 미만이면 enum 최상위 **명시**" |
| 8 | design | enum에 순위 정보 없음 — 미래 새 이름 우열 오판 가능 (high) | 수용된 한계로 정직하게 명기 + 판별 불확실 시 상속 = 안전 기본값 + /crv enum drift 감사(B5) |
| 9 | design | 순위표 priority가 "성능 순위"가 아닐 가능성 (medium) | 실측 반박: 1위 설명 "Latest frontier" — 설명·순서 일치 확인. 잔여 위험은 /crv 감사로 커버 |
| 10 | design | 신설 추론 단계(max/ultra) 미활용 (medium) | 범위 밖 명기 유지 + B5 감시에 "reasoning_levels 확장 감지" 포함 |
| 11 | consistency | 검증 grep의 제외 규칙 모호 (medium) | 검증 3 명령을 호출형(`-m gpt-5.5`) 기준으로 명확화 + resolver 삽입 지점 전수 grep(검증 4) |
| 12 | runtime | Mac Mini 등 타 OS에서 resolver 미검증 (medium) | 검증 8 신설: ssh macmini에서 resolver 실측 |

기각한 발견: "TOP 정의 중앙화(include 방식)" — 스킬은 런타임에 자기 SKILL.md만 읽으므로 include 불가, 동일 문구 복붙 + /crv 불일치 감사가 현실적 방안 (듀얼 합성 분기 1과 동일 근거). "fail-closed(-m 생략 fallback 폐기)" — graceful degrade 원칙 유지 (듀얼 합성 분기 2에서 이미 해소).

#### Trigger 매핑 (Pre-mortem 결과 → Plan B 전환점)

- 발견 1·2·3 → Plan A 설계 보강으로 해소 (트리거 아님 — 사전 차단).
- 발견 4·5·6 → 실행 절차 보강 (I3·I4·B 안전 규칙). T4(태그 사고)와 매핑.
- 발견 7·8 → TOP 정의 문구 보강. T3(fable spawn 거부 → Plan B-2)와 매핑.
- 발견 12 → 검증 8 신설. 실패 시 T1 계열 (resolver 크로스플랫폼) → Plan B-1.
- **Blocker 판정**: 보안 치명·데이터 손실·비가역 단계 없음 — 발견된 blocker 2건은 구현 디테일이며 계획 반영으로 해소 완료. Modify 강제 사유 아님.

## 💡 시사점 · ⚠️ 주의점 · 🔀 Side Effect

- **💡 시사점**: 모델 세대 교체가 "문서 개정 이벤트"에서 "무이벤트"로 바뀐다. /c(경제 티어제)와 /cc(전부-opus)로 갈라져 있던 모델 정책이 **하나의 난이도 사다리로 통일**되고, /cc의 토큰 비용은 v3.11 "전부 opus" 대비 절감된다 (Easy/Medium 업무가 경량·중간 티어로 내려가므로). capability-assumptions 감시 체계가 기능 축에 이어 모델 축까지 커버하게 된다. 이후 gpt-5.6 세대의 신설 추론 단계(max, ultra — "자동 작업 위임" 포함)를 Lens 깊이 분기에 편입할지가 자연스러운 후속 과제.
- **⚠️ 주의점**: ① 출시 시 태그 누락 = 다른 컴퓨터에 옛 코드 설치 (실측 사고 이력 — I4 절차 엄수). ② 이 계획은 지시문(문서) 교체라 되돌리기 쉽지만, 출시 후에는 버전이 박제되므로 되돌리려면 새 패치 버전이 필요. ③ Mac Mini 등 다른 컴퓨터의 codex에 순위표 파일이 없을 수 있음 — fallback이 커버하지만 플래그 발생 여부를 다음 사용 시 확인 권장.
- **🔀 Side Effect (파급)**: /c·/cc·/ccp·/cp·/cpp 5개 스킬의 모델 배정 문구 전부, /crv 감사 항목 2건, harness-rules 심사 기록 1건. 다른 스킬(cr·cs·cu·ci·cps·crv 본문)은 무영향 (grep 실측 0건). 실행 중인 다른 프로젝트에는 영향 없음 (Lens 문서만 변경).

## ✅ Review — 검증 (증거 + 어떻게 검증할지)

**검증 전략**: 7건 전부 이 세션에서 직접 명령을 실행해 검증하고(대화에 증거 잔존), 각 행의 pass/fail을 최종 보고에 표로 제시한다. 범위: 이 컴퓨터에서의 실행 검증 + 리포·출시 상태 검증까지 (다른 컴퓨터 반영은 범위 밖 — 기록만).

| # | 목표가 됐다는 신호 | 확인 방법 (명령/관측) | 통과 판정 | 종류 |
|---|------------------|----------------------|----------|------|
| 1 | codex가 쓸 모델을 스스로 1등으로 찾아낸다 | 문서에 적힌 resolver 한 줄을 bash로 실행 | 출력 = `gpt-5.6-sol` | auto |
| 2 | codex 실호출이 그 모델로 성공한다 | §4 표준 호출(resolver 포함) 실행 | EXIT 0 + 본문 수신 | auto |
| 3 | 옛 모델 이름이 지시문에 남아있지 않다 | `grep -rn "m gpt-5.5" skills/ docs/rules/` | 0건 (호출형 기준. 실측 표기 101행·역사 기록은 제외 대상) | auto |
| 4 | Claude 일꾼 지시문이 난이도 사다리 + TOP 규칙으로 바뀌었다 | `grep -n "TOP\|fable\|사다리" skills/*/SKILL.md` 역할 테이블 | 5개 스킬 전부에서 사다리(경량/중간/TOP) 정의+테이블 확인, "전부 opus" 문구 0건 | auto |
| 5 | 실제로 fable 일꾼이 뜬다 | Task tool로 model=fable 에이전트 1개 spawn (1문장 과제) | 정상 응답 수신 | auto |
| 6 | 새 버전이 출시됐다 | `git tag --list v3.24.0` + `git status -sb` | 태그 존재 + 원격 push 완료 | auto |
| 7 | 이 컴퓨터의 Lens가 새 버전이다 | installed_plugins 확인 (`claude plugin list` 또는 캐시 디렉토리) | 3.24.0 | auto |
| 8 | 다른 OS에서도 자동 선택기가 안전하다 | `ssh macmini`로 resolver 한 줄 실행 (Pre-mortem 발견 12) | 1등 slug 반환 **또는** 빈 값+플래그 경로 (둘 다 pass — 조용한 오작동만 fail) | auto |
| 9 | 감사 설정 파일이 깨지지 않았다 | `node -e "require('./docs/rules/capability-assumptions.json')"` (Pre-mortem 발견 6) | exit 0 | auto |

## 진행상황

- **마지막 업데이트**: 2026-07-15
- **현재 경로**: Plan A
- **완료**: Goal 정의 → Codex 듀얼트랙 조사·합성 → 계획 작성 → Pre-mortem(4-skeptic 27건 → 12건 채택 반영, blocker 2건 사전 해소) → 강화판 resolver 실측 통과
- **Modify 이력 (2026-07-15)**: 사용자 정정 — "최고 모델 무차별 배정 금지, 업무 난이도에 맞춰 배분". Claude 축을 "전 역할 TOP" → "난이도 사다리(Easy=경량/Medium=중간/Hard=TOP, 각 칸 자동 상승)"로 재설계. /cc의 v3.11 "전부 opus(품질 우선·비용 비고려)" 철학 공식 폐기, /c와 사다리 통일. codex는 1등 모델 유지 + 난이도는 깊이 다이얼(기존 xhigh/high).
- **실행 (2026-07-15, /cc)**: [A]~[H] 전 수정 완료 (rules 3종 + 스킬 5종 + cc P4.5 resolver 인라인 — Supervisor 지적 반영). Supervisor(fable) 82점 pass — fable spawn 실측 겸용. Codex 리뷰는 대형 diff로 180s 초과 → §7 degrade(Supervisor 단독 게이트, timeout 가드 라이브 실증). 검증: V1 resolver=gpt-5.6-sol ✓ / V2 §4 E2E EXIT 0+"V324-OK" ✓ / V3 옛 이름 호출형 0건 ✓ / V4 5개 스킬 사다리 반영 ✓ / V5 fable spawn ✓ / V8 Mac Mini 플래그 경로 정상 ✓ / V9 JSON 파싱 ✓. V6(태그)·V7(플러그인) 출시 단계에서.
- **[I] 출시 완료 (2026-07-15)**: 커밋 9fd7182 → 태그 v3.24.0 → push → `git show v3.24.0:.claude-plugin/marketplace.json` ref=v3.24.0 확인 (V6 ✓) → 이 컴퓨터 플러그인 3.23.1→3.24.0 업데이트 (V7 ✓).
- **Goal 달성**: 3/3 ✓ — 검증 9/9 전량 pass.
- **재개 포인트**: 완료 — /cp done 으로 history 전환 권장. (다른 컴퓨터는 각자 /lens-upgrade·/ci 시 자동 반영)
