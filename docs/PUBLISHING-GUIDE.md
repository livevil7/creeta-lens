# Lens Publishing Guide

플러그인 배포 및 등록 가이드.

## 1. Anthropic 공식 디렉토리

**공식 레포**: [anthropics/claude-plugins-official](https://github.com/anthropics/claude-plugins-official)

### 제출 방법

**제출 폼** 사용 (권장): https://clau.de/plugin-directory-submission

제출 후 Anthropic 심사를 거쳐 `external_plugins/lens/` 폴더로 등록됨.

### 등록 후 설치 방법 (유저)

```bash
# 방법 1: 직접 설치
/plugin install lens@claude-plugin-directory

# 방법 2: Discover 탭에서 검색
/plugin > Discover > "lens"
```

## 2. 커뮤니티 등록

| 대상 | Stars | 제출 방법 |
|------|-------|-----------|
| [hesreallyhim/awesome-claude-code](https://github.com/hesreallyhim/awesome-claude-code) | 25k+ | PR → Plugin 섹션에 추가 |
| [ccplugins/awesome-claude-code-plugins](https://github.com/ccplugins/awesome-claude-code-plugins) | 500+ | PR → Productivity 카테고리 |
| [obra/superpowers-marketplace](https://github.com/obra/superpowers-marketplace) | 500+ | marketplace.json PR |

### PR 템플릿 (awesome list)

```markdown
- [lens](https://github.com/CreetaCorp/lens) - Skill navigator for Claude Code. Scans all plugins, recommends the best match, and executes — single (/c), parallel (/cc), or plan-first (/cp). 8 languages.
```

## 3. 독립 마켓플레이스 (현재 방식)

유저가 직접 레포를 마켓플레이스로 추가:

```bash
# 마켓플레이스 추가
/plugin marketplace add CreetaCorp/lens

# 플러그인 설치
/plugin install lens@CreetaCorp
```

## 4. --plugin-dir (개발용)

```bash
git clone https://github.com/CreetaCorp/lens.git
claude --plugin-dir ./lens
```

캐시 없이 디렉토리에서 직접 로드. 개발/테스트 전용.
