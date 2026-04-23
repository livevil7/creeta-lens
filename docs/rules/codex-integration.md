# Codex CLI 연동 규칙

Lens v3.1에서 OpenAI Codex CLI를 활용한 pre-mortem 이종 모델 검증의 표준 규칙.

## 1. 개요

### Codex CLI란

- OpenAI가 제공하는 GPT-5.2-Codex 전용 CLI 도구
- 로컬 셸에서 비대화형 호출 가능 (`codex exec`)
- ChatGPT Plus/Pro/Max 구독으로 인증 (별도 API 키 불필요)

### Lens가 Codex를 사용하는 이유

- **이종 모델 병렬 검증**: Claude Opus와 다른 아키텍처/학습 데이터의 모델로 교차 검증
- **블라인드 스팟 해소**: 단일 모델 편향(유사한 추론 경로, 동일한 놓침)을 상쇄
- **비용 효율**: Plus/Pro/Max 구독 내에서 추가 과금 없이 활용

### v3.1 사용 지점

- `/cp PLAN` 모드의 **Phase 2.5 Pre-mortem** — Opus + Codex 병렬 호출
- 각 모델이 독립적으로 계획의 허점을 지적하고, 결과를 병합하여 계획에 반영

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
ls /c/Users/ADMIN/.vscode/extensions/openai.chatgpt-*/bin/windows-x86_64/codex.exe 2>/dev/null | head -1
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
codex exec --skip-git-repo-check "프롬프트 내용"
```

### 플래그 설명

- `exec` — 비대화형 1회 응답 모드. TUI를 띄우지 않고 stdout으로 결과 출력
- `--skip-git-repo-check` — 현재 디렉토리가 git repo가 아니어도 실행 허용. Pre-mortem은 repo와 무관하므로 필수

### Windows 환경 호출 예

```bash
CODEX_BIN=$(ls /c/Users/ADMIN/.vscode/extensions/openai.chatgpt-*/bin/windows-x86_64/codex.exe 2>/dev/null | head -1)
"$CODEX_BIN" exec --skip-git-repo-check "프롬프트 내용"
```

## 5. 응답 파싱

Codex의 stdout에는 메타 정보가 섞여 있다. 본문만 추출해야 한다.

### 원본 출력 예시

```
reasoning summaries: none
session id: 019db...
--------
user
{전송한 프롬프트}
codex
{실제 응답 본문}
tokens used
5,617
```

### 본문 추출 규칙

- 시작: `^codex$` 라벨 다음 줄
- 끝: `^tokens used$` 이전 줄

### Bash 추출 스니펫

```bash
OUTPUT=$(codex exec --skip-git-repo-check "$PROMPT" 2>&1)
BODY=$(echo "$OUTPUT" | awk '/^codex$/{flag=1; next} /^tokens used$/{flag=0} flag')
```

추출된 `$BODY`를 pre-mortem 결과 문서에 삽입한다.

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
- **한국어 명시**: GPT-5.2는 영문 응답 기본값이므로 명시적 지시 필요

## 7. 에러 처리

| 에러 유형 | 대응 |
|----------|------|
| **Timeout (30초 초과)** | Codex 호출 중단, Opus 단독으로 pre-mortem 진행 |
| **인증 만료** | 결과 문서에 "Codex 인증 만료 — Opus 단독 pre-mortem 진행" 기록 |
| **일반 실패** | stderr를 pre-mortem 결과 섹션에 "Codex 에러" 블록으로 포함 |

### Timeout 구현 예

```bash
BODY=$(timeout 30 bash -c "$CODEX_CMD" 2>&1) || BODY="[Codex timeout — Opus 단독 진행]"
```

## 8. 비용 및 성능 가이드

| 항목 | 값 |
|------|-----|
| Pre-mortem 1회당 토큰 사용량 | 약 5K ~ 10K tokens |
| 응답 시간 | 10 ~ 30초 (GPT-5.2 추론 시간 포함) |
| 과금 | ChatGPT Plus/Pro/Max 구독 시 별도 과금 없음 |

### 주의사항

- 구독 등급에 따라 일일 사용량 제한 존재 (구체 수치는 OpenAI 공식 페이지 참조)
- 연속 호출 시 rate limit 가능 — pre-mortem 1회/계획이면 일반적으로 문제 없음
- 로컬 네트워크 상태에 따라 응답 시간 변동

## 9. 관련 파일 / 외부 참조

### 로컬

- 스킬: `~/.claude/skills/codex-review/SKILL.md` — Claude Code 안에서 `/codex-review` 호출용 (별도 설치 완료)
- Lens PLAN 모드: `~/.claude/plugins/lens/skills/cp/` — Phase 2.5에서 본 문서 참조

### 외부

- 공식 CLI 문서: <https://developers.openai.com/codex/cli/>
- GitHub 저장소: <https://github.com/openai/codex>
- ChatGPT 구독 정책: <https://openai.com/chatgpt/pricing/>
