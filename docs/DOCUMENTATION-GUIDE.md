# Creet 문서화 가이드

> creet 프로젝트의 문서 작성 표준 및 체계 정의서

---

## 1. 문서 체계 개요

### 1.1 원칙

creet의 문서는 **읽는 대상**에 따라 역할이 분리된다.

| 문서 | 대상 독자 | 핵심 질문 |
|------|-----------|-----------|
| `CLAUDE.md` | Claude (AI 에이전트) | "이 프로젝트가 뭐고, 뭐가 어디 있지?" |
| `README.md` | 외부 사용자 (GitHub) | "이걸 왜 쓰고, 어떻게 설치하지?" |
| `CHANGELOG.md` | 개발자 / 기여자 | "뭐가 바뀌었지?" |
| `plugin.json` | Claude Code 런타임 | "이 플러그인의 이름, 버전, 메타데이터는?" |

**문서 간 정보 중복 금지.** 한 곳에서 정의하고, 나머지는 링크로 참조한다.

### 1.2 버전 단일 원천 (Single Source of Truth)

```
plugin.json의 "version" 필드 = 프로젝트의 공식 버전
```

다른 모든 파일에서 버전을 표기할 때는 `plugin.json`의 값을 따른다.
버전을 하드코딩하는 파일 목록:

| 파일 | 위치 | 형태 |
|------|------|------|
| `.claude-plugin/plugin.json` | `"version"` 필드 | **원천** |
| `hooks/hooks.json` | `"description"` 문자열 | 참조 |
| `hooks/session-start.js` | `systemMessage` 문자열 | 참조 |
| `skills/c/SKILL.md` | frontmatter `description` | 참조 |
| `skills/cc/SKILL.md` | frontmatter `description` | 참조 |
| `skills/cp/SKILL.md` | frontmatter `description` | 참조 |
| `creet.config.json` | `"version"` 필드 | 참조 |

릴리스 시 위 파일들의 버전 문자열을 **일괄 업데이트**한다.

---

## 2. CLAUDE.md 작성 규칙

### 2.1 목적

Claude가 이 파일 **하나만 읽으면** creet 전체를 파악할 수 있어야 한다.
세션 시작 시 자동으로 로드되므로, 가장 중요한 문서다.

### 2.2 구조 (필수 섹션, 순서 고정)

```markdown
# creet — [한 줄 정의]

## 버전
- 현재: vX.Y.Z
- 마지막 업데이트: YYYY-MM-DD

## 스킬
| 스킬 | 설명 | 워크플로우 |
(각 스킬의 핵심 동작을 1-2줄로)

## 훅
| 훅 | 이벤트 | 파일 | 설명 |
(5개 훅 전체, 트리거 조건 포함)

## 라이브러리 (lib/)
| 모듈 | 파일 | 핵심 함수 | 설명 |
(각 모듈의 주요 export 함수 나열)

## 폴더 구조
(전체 파일 트리 + 각 파일 한 줄 역할)

## 설정
| 옵션 | 기본값 | 설명 |
(creet.config.json 옵션 전체)

## 감지 대상
| 타입 | 감지 방법 | 예시 |
(Skill, MCP, LSP, Hybrid)

## 알려진 이슈 / TODO
(현재 알려진 버그나 미완성 항목)

## 변경 이력 요약
(최근 2-3개 버전만 한 줄씩. 상세는 CHANGELOG.md 참조)
```

### 2.3 작성 규칙

| 규칙 | 설명 |
|------|------|
| **200줄 이내** | Claude의 자동 메모리 파일은 200줄 이후 잘림. 반드시 지킨다 |
| **코드 블록 금지** | 구현 코드를 넣지 않는다. 파일 경로와 함수명만 표기 |
| **테이블 우선** | 산문보다 테이블이 정보 밀도가 높다. 가능하면 테이블 사용 |
| **링크로 위임** | 상세 내용은 `CHANGELOG.md`, `README.md`, 소스코드로 링크 |
| **현재 상태만** | 과거 히스토리는 CHANGELOG에. CLAUDE.md는 "지금" 상태만 기술 |
| **파일 역할 전수 기록** | 새 파일 추가 시 반드시 폴더 구조 섹션에 반영 |

### 2.4 업데이트 시점

- 새 파일 추가/삭제 시
- 새 스킬 또는 훅 추가 시
- 버전 릴리스 시
- 설정 옵션 변경 시

---

## 3. README.md 작성 규칙

### 3.1 목적

GitHub에서 creet을 발견한 **외부 사용자**가 5분 안에 설치하고 사용할 수 있게 한다.

### 3.2 구조 (필수 섹션, 순서 고정)

```markdown
# Creet

[한 줄 소개]

## The Problem
(왜 이 플러그인이 필요한지)

## The Solution
(사용 예시 — 코드 블록으로)

## Installation
(3가지 옵션: GitHub clone, curl, local plugin)

## Usage
### /c — [설명]
### /cc — [설명]
(사용 예시 테이블)

## How It Works
(각 스킬의 워크플로우 — 번호 리스트로)

## Features
(불릿 리스트)

## Configuration
(creet.config.json 옵션 테이블)

## Requirements

## License
```

### 3.3 작성 규칙

| 규칙 | 설명 |
|------|------|
| **내부 구현 상세 없음** | 아키텍처, 파일 구조, 함수명 등은 README에 넣지 않는다 |
| **설치가 최우선** | Installation 섹션은 반드시 Usage 전에 온다 |
| **복사-붙여넣기 가능** | 설치 명령어는 그대로 복사해서 터미널에 붙여넣을 수 있어야 한다 |
| **스크린샷/예시 우선** | "어떻게 보이는지"를 먼저 보여주고 설명은 뒤에 |
| **버전 하드코딩 금지** | README 본문에 버전 번호를 넣지 않는다 (금방 낡음) |

### 3.4 README에 넣지 않는 것

- 파일별 역할 설명 (→ `CLAUDE.md`)
- 버전별 변경 이력 (→ `CHANGELOG.md`)
- 훅 상세 동작 원리 (→ `CLAUDE.md`)
- 라이브러리 모듈 API (→ 소스코드 JSDoc)

---

## 4. CHANGELOG.md 작성 규칙

### 4.1 목적

모든 버전의 변경사항을 **누락 없이** 기록한다.
코드의 실제 상태와 항상 일치해야 한다.

### 4.2 형식 (Keep a Changelog 기반)

```markdown
## [X.Y.Z] - YYYY-MM-DD

### Added (vX.Y.Z)
- **기능명** — 설명. `관련파일.js`

### Changed (vX.Y.Z)
- **변경 대상** — 무엇이 어떻게 바뀌었는지. `관련파일.js`

### Fixed (vX.Y.Z)
- **버그명** — 무엇이 어떻게 고쳐졌는지. `관련파일.js`

### Removed (vX.Y.Z)
- **제거 대상** — 왜 제거했는지
```

### 4.3 작성 규칙

| 규칙 | 설명 |
|------|------|
| **최신 버전이 맨 위** | 역순 시간순 (newest first) |
| **관련 파일 명시** | 각 항목 끝에 백틱으로 파일명 표기 |
| **카테고리 태그** | Added, Changed, Fixed, Removed 중 해당하는 것만 사용 |
| **버전 태그 표기** | 각 카테고리 제목에 `(vX.Y.Z)` 붙여서 접혀도 구분 가능 |
| **커밋과 1:1** | 하나의 릴리스 커밋 = 하나의 CHANGELOG 엔트리 |

### 4.4 CHANGELOG에 넣지 않는 것

- 미래 계획 (→ TODO나 Issues)
- 사용법 설명 (→ `README.md`)
- 아키텍처 결정 이유 (→ `CLAUDE.md` 또는 커밋 메시지)

---

## 5. plugin.json 작성 규칙

### 5.1 목적

Claude Code 런타임이 읽는 메타데이터 + **버전의 단일 원천**.

### 5.2 필수 필드

```json
{
  "name": "creet",
  "version": "X.Y.Z",
  "description": "[/c와 /cc의 핵심 기능을 포함한 50단어 이내 설명]",
  "author": {
    "name": "Creeta",
    "email": "creet@creeta.com",
    "url": "https://www.creeta.com"
  },
  "repository": "https://github.com/Creeta-creet/creet",
  "license": "MIT",
  "keywords": [...]
}
```

### 5.3 규칙

| 규칙 | 설명 |
|------|------|
| **description에 버전 넣지 않음** | description은 기능 설명만. 버전은 version 필드에 |
| **keywords 최신 유지** | 새 기능 추가 시 관련 키워드도 추가 |

---

## 6. 소스코드 내 문서화 규칙

### 6.1 파일 헤더 주석

모든 `.js` 파일 첫 줄에 역할 설명:

```javascript
/**
 * Creet - [모듈명]
 * [한 줄 설명]
 */
```

### 6.2 함수 JSDoc

export되는 함수에만 JSDoc 작성:

```javascript
/**
 * [한 줄 설명]
 * @param {Type} name - 설명
 * @returns {Type} 설명
 */
```

### 6.3 버전 문자열

소스코드 내 버전 문자열은 `plugin.json`을 런타임에 읽는 것이 이상적이나,
현재는 하드코딩되어 있으므로 릴리스 체크리스트에서 일괄 업데이트한다.

---

## 7. 릴리스 체크리스트

새 버전 릴리스 시 반드시 수행:

```
[ ] 1. plugin.json "version" 업데이트
[ ] 2. hooks.json "description" 버전 문자열 업데이트
[ ] 3. session-start.js systemMessage 버전 문자열 업데이트
[ ] 4. skills/c/SKILL.md description 버전 문자열 업데이트
[ ] 5. skills/cc/SKILL.md description 버전 문자열 업데이트 (해당 시)
[ ] 6. skills/cp/SKILL.md description 버전 문자열 업데이트 (해당 시)
[ ] 7. creet.config.json "version" 업데이트
[ ] 8. CHANGELOG.md에 새 버전 엔트리 추가
[ ] 9. CLAUDE.md 버전 + 변경사항 반영
[ ] 10. README.md 변경사항 반영 (사용자에게 영향 있는 경우만)
[ ] 11. git commit + tag + push
[ ] 12. GitHub Release 생성
```

---

## 8. 문서 흐름도

```
                    ┌─────────────────────┐
                    │    plugin.json       │
                    │  (버전 단일 원천)     │
                    └──────────┬──────────┘
                               │
              ┌────────────────┼────────────────┐
              │                │                │
              ▼                ▼                ▼
     ┌────────────┐   ┌──────────────┐   ┌───────────┐
     │  CLAUDE.md  │   │  README.md   │   │ CHANGELOG │
     │ (AI 브리핑) │   │ (사용자 가이드)│   │ (변경 이력)│
     └──────┬─────┘   └──────────────┘   └───────────┘
            │
            │ Claude가 세션 시작 시 읽음
            │
            ▼
     ┌─────────────────────────────┐
     │  소스코드 (필요시만 읽기)     │
     │  hooks/, lib/, scripts/,    │
     │  skills/                    │
     └─────────────────────────────┘
```

**Claude 읽기 순서**: `CLAUDE.md` (필수) → `CHANGELOG.md` (필요시) → 소스코드 (수정 시)
**사용자 읽기 순서**: `README.md` (필수) → `CHANGELOG.md` (업데이트 확인 시)

---

## 9. 현재 상태 진단 및 조치 사항

### 9.1 버전 불일치

| 파일 | 현재 | 조치 |
|------|------|------|
| `plugin.json` | v1.5.0 | 최종 버전으로 통일 |
| `hooks.json` | v1.6.0 | plugin.json에 맞춤 |
| `session-start.js` | v1.6.0 | plugin.json에 맞춤 |
| `creet.config.json` | v1.4.0 | plugin.json에 맞춤 |
| `skills/c/SKILL.md` | v1.5.0 | plugin.json에 맞춤 |
| `README.md` 설정 예시 | v1.3.0 | 버전 번호 제거 |

### 9.2 CHANGELOG 누락

v1.6.0에 해당하는 기능이 코드에 존재하지만 CHANGELOG에 미기록:
- `agent-tracker.js` 모듈 전체
- `pre-tool-task.js`, `post-tool-task.js`, `stop.js` 훅 3개
- `session-start.js`에 대시보드 초기화 추가
- `hooks.json`에 PreToolUse, PostToolUse, Stop 훅 등록

### 9.3 CLAUDE.md 불완전

현재 CLAUDE.md에 누락된 정보:
- 훅 5개 중 3개 미기록 (PreToolUse, PostToolUse, Stop)
- `agent-tracker.js` 모듈 미기록
- 알려진 이슈/TODO 섹션 없음
- 설정 옵션 테이블 없음
- 감지 대상 타입 테이블 없음

### 9.4 README.md 불일치

- Architecture 섹션에 `agent-tracker.js`, 새 훅 3개 미포함
- Configuration 예시 버전이 v1.3.0
- Features 섹션에 에이전트 대시보드 미언급
