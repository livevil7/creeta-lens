# 2026-03-02 Lens 플러그인 설치/버전관리 문제 분석 보고서

## 1. 요약

Lens 플러그인(`lens@CreetaCorp`, v1.7.0)의 마켓플레이스 등록 구조를 Anthropic 공식 플러그인(`claude-plugins-official`) 및 bkit(`popup-studio-ai`)와 비교 분석한 결과, **3가지 구조적 문제**를 확인함.

---

## 2. 3개 마켓플레이스 비교

### 2-1. known_marketplaces.json (마켓플레이스 등록 방식)

| 항목 | Anthropic 공식 | bkit | Lens |
|------|---------------|------|-------|
| source 타입 | `"github"` | `"github"` | **`"git"`** |
| 참조 방식 | `repo: "anthropics/claude-plugins-official"` | `repo: "popup-studio-ai/bkit-claude-code"` | **`url: "...lens.git"`** |
| 자동 업데이트 | 기본 활성화 | 수동 | 수동 |

**문제 #1**: Lens의 `"source": "git"`은 Claude Code 공식 스키마에 정의되지 않은 값.
- 공식 유효 값: `"github"`, `"url"`, `"npm"`, `"pip"`
- `"git"`이 실제로 동작하더라도 비공식이라 향후 업데이트에서 동작 보장 안됨
- `"github"` 타입은 GitHub API를 사용해 최적화된 다운로드 (tarball), `"url"`은 `git clone` 사용

```json
// 현재 (비공식)
"CreetaCorp": {
  "source": {
    "source": "git",
    "url": "https://github.com/CreetaCorp/lens.git"
  }
}

// 수정안 A: github 타입 (권장)
"CreetaCorp": {
  "source": {
    "source": "github",
    "repo": "CreetaCorp/lens"
  }
}

// 수정안 B: url 타입 (공식이지만 차선)
"CreetaCorp": {
  "source": {
    "source": "url",
    "url": "https://github.com/CreetaCorp/lens.git"
  }
}
```

### 2-2. marketplace.json (플러그인 카탈로그 구조)

| 항목 | Anthropic 공식 | bkit | Lens |
|------|---------------|------|-------|
| 마켓 repo | `anthropics/claude-plugins-official` | `popup-studio-ai/bkit-claude-code` | `CreetaCorp/lens` |
| 플러그인 참조 | `"./plugins/commit-commands"` (상대경로) | `{ source: "url", url: "...bkit-claude-code.git" }` | `{ source: "url", url: "...lens.git" }` |
| 마켓=플러그인 동일? | 아니오 (카탈로그 repo ≠ 플러그인 코드) | **부분적** (bkit 마켓 repo = bkit 플러그인 repo) | **완전 동일** |
| 플러그인 수 | 30+ | 2 (bkit, bkit-starter) | 1 (lens) |

**문제 #2**: Lens의 마켓플레이스 repo와 플러그인 repo가 완전히 동일한 repo.

이게 문제인 이유:
- 마켓플레이스 = 카탈로그 (어떤 플러그인들이 있는지 목록)
- 플러그인 = 실제 코드 (skills, hooks 등)
- 동일 repo면: marketplace.json이 **자기 자신을 가리킴** → 순환 참조

```
Lens 현재:
  CreetaCorp/lens (repo)
    ├── .claude-plugin/marketplace.json  → "lens" plugin source: lens.git (자기 자신)
    ├── skills/c/SKILL.md
    ├── skills/cc/SKILL.md
    └── skills/cp/SKILL.md

Anthropic 공식 패턴:
  anthropics/claude-plugins-official (카탈로그 repo)
    ├── .claude-plugin/marketplace.json  → 각 플러그인을 "./plugins/..." 상대경로로 참조
    ├── plugins/commit-commands/          → 플러그인 A
    ├── plugins/code-review/              → 플러그인 B
    └── external_plugins/playwright/      → 외부 플러그인 C

bkit 패턴:
  popup-studio-ai/bkit-claude-code (카탈로그 repo)
    ├── .claude-plugin/marketplace.json  → bkit, bkit-starter 각각 별도 URL로 참조
    (bkit 플러그인 코드도 같은 repo에 있지만, marketplace.json에서 url로 참조)
```

참고: bkit도 마켓 repo = 플러그인 repo이지만, 플러그인이 2개이고 별도 URL 참조를 사용. Lens은 1개 플러그인만 있으면서 자기 자신을 URL로 참조.

실제 Anthropic 공식은 **외부 플러그인**도 `source: "url"` 방식을 사용함:
```json
// Sentry (외부, 별도 repo)
{ "source": { "source": "url", "url": "https://github.com/getsentry/sentry-for-claude.git" } }

// commit-commands (내부, 같은 repo)
{ "source": "./plugins/commit-commands" }
```

→ Lens이 자체 호스팅이면 `"url"` 방식은 **유효**함. 다만 마켓=플러그인이 동일 repo인 것 자체가 구조적으로 깔끔하지 않음.

### 2-3. 버전 관리

| 항목 | Anthropic 공식 | bkit | Lens |
|------|---------------|------|-------|
| marketplace.json 버전 | 없음 (카탈로그) | `"1.5.3"` | 없음 |
| plugin.json 버전 | 없거나 `"1.0.0"` | `"1.5.3"` | `"1.7.0"` |
| installed_plugins.json 버전 | commit SHA (`55b58ec6e564`) | `"1.5.3"` | `"1.7.0"` |
| ref 필드 (버전 고정) | 없음 (HEAD 사용) | 없음 | 없음 |
| sha 필드 (커밋 고정) | 없음 | 없음 | 없음 |

**문제 #3**: 버전 핀 없이 항상 기본 브랜치 HEAD를 가져옴.

- `ref` 미지정 → `git clone`이 기본 브랜치 HEAD를 가져옴
- 개발 중인 불안정 코드가 바로 사용자에게 배포될 수 있음
- 정식 릴리스 프로세스가 없음

이건 사실 bkit, Anthropic 공식도 마찬가지:
- Anthropic 공식은 commit SHA만 기록 (`"55b58ec6e564"`)
- bkit은 semver 사용하지만 `ref`는 미지정

→ Lens만의 고유 문제는 아니지만, 안정성 향상을 위해 `ref: "v1.7.0"` 추가를 권장.

---

## 3. 실제 영향

### 문제 #1 (`source: "git"`) 의 영향

| 영향 | 설명 |
|------|------|
| 설치 불안정 | `"git"` 타입이 Claude Code 내부에서 어떻게 처리되는지 미정의. 동작할 수도 있고 특정 버전에서 실패할 수도 있음 |
| 자동 업데이트 실패 가능 | `claude plugins update` 시 `"git"` 타입을 인식 못할 수 있음 |
| 향후 호환성 | Claude Code 업데이트 시 비공식 소스 타입이 차단될 수 있음 |

### 문제 #2 (자기 참조 구조) 의 영향

| 영향 | 설명 |
|------|------|
| 확장성 | 플러그인을 추가하려면 repo 자체를 마켓플레이스처럼 관리해야 함 |
| 캐시 중복 | 마켓플레이스 캐시(marketplaces/)와 플러그인 캐시(cache/)에 같은 코드가 2벌 존재 |
| 업데이트 혼란 | 마켓플레이스 업데이트 = 플러그인 업데이트가 동시에 발생 |

### 문제 #3 (버전 핀 없음) 의 영향

| 영향 | 설명 |
|------|------|
| 불안정 배포 | 개발 중인 코드가 사용자에게 바로 적용 |
| 롤백 불가 | 이전 안정 버전으로 돌아갈 방법 없음 |
| 재현 불가 | 같은 "1.7.0"이라도 시점에 따라 다른 코드 |

---

## 4. 수정 권장사항

### 즉시 수정 가능 (사용자 측)

**known_marketplaces.json의 source 타입 변경:**

```json
// 변경 전
"CreetaCorp": {
  "source": {
    "source": "git",
    "url": "https://github.com/CreetaCorp/lens.git"
  }
}

// 변경 후
"CreetaCorp": {
  "source": {
    "source": "github",
    "repo": "CreetaCorp/lens"
  }
}
```

이것만으로도 설치/업데이트 안정성이 개선됨.

### Creeta 팀에 요청해야 하는 사항

| # | 수정 | 우선순위 | 이유 |
|---|------|----------|------|
| 1 | marketplace.json의 plugin source를 상대 경로(`"./"`)로 변경 | 높음 | 자기 참조 해소 |
| 2 | 릴리스 시 Git 태그 생성 + marketplace.json에 `ref` 추가 | 중간 | 안정 버전 핀 |
| 3 | Anthropic 공식 마켓플레이스에 제출 | 낮음 | 자동 업데이트, 신뢰성 |

**marketplace.json 수정 예시 (Creeta 팀):**

```json
{
  "plugins": [
    {
      "name": "lens",
      "source": "./",
      "version": "1.7.0"
    }
  ]
}
```

이렇게 하면 마켓플레이스 repo = 플러그인 repo인 구조에서도 상대 경로로 자신을 참조하여 깔끔해짐. Anthropic 공식 패턴(`"./plugins/..."`)과 동일한 방식.

---

## 5. 현재 동작하는 이유

`"source": "git"`이 비공식임에도 현재 동작하는 이유:
- Claude Code 내부에서 `"git"`과 `"url"` 타입을 동일하게 `git clone`으로 처리할 가능성이 높음
- 하지만 이건 우연히 동작하는 것이지 보장된 동작이 아님

---

작성일: 2026-03-02
작성자: Claude (livevil7 요청)
