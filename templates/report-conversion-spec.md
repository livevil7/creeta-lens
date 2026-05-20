# Reports HTML 변환 규칙 (conversion spec)

> lens cp 가 만드는 모든 `docs/reports/*.html` 보고서는 이 규칙을 따른다. 일관성의 단일 기준.
> **reference 구현 (작성 전 반드시 Read):**
> - history 양식 (완료 보고서, 8슬라이드): `report-history.example.html`
> - task 양식 (계획 보고서, 6슬라이드): `report-plan.example.html`
>
> **md SoT 원칙**: HTML 은 `docs/` 의 md plan/history 에서 파생된 *뷰*다. 상태/요약을 HTML 에
> 원본으로 저장하지 않는다. 각 HTML `<head>` 에 출처를 기록한다:
> ```html
> <meta name="lens:source" content="docs/{md파일명}">
> <meta name="lens:source-hash" content="{md내용 sha256 앞12자}">
> <meta name="lens:builder" content="lens-cp/3.x">
> ```
> board 빌더가 md 해시 불일치를 감지하면 해당 카드를 "stale" 로 표시하고 재생성을 권고한다.

## 파일 규칙

- **파일명**: `{YYYY-MM-DD}-{slug}.html` — 원본 md 파일명과 동일 (확장자만 .html).
- **CSS**: 인라인 금지. `<link rel="stylesheet" href="_shared.css">` 만 사용.
- **폰트**: Pretendard CDN link (reference의 head 그대로 복사).
- **JS**: 하단 progress rail + crumb 스크립트만 (reference 그대로). 그 외 JS 금지.
- **self-contained 아님**: `_shared.css`와 같은 폴더(`reports/`)에 있어야 동작.

## 공통 head (복사해서 사용)

```html
<!DOCTYPE html>
<html lang="ko">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>{제목} · 보고서</title>
<link rel="stylesheet" type="text/css" href="https://cdn.jsdelivr.net/gh/orioncactus/pretendard@v1.3.9/dist/web/variable/pretendardvariable-dynamic-subset.css">
<link rel="stylesheet" href="_shared.css">
</head>
```

## 공통 하단 스크립트 (복사해서 사용)

```html
<script>
(() => {
  const rail = document.getElementById("rail");
  const crumbNow = document.getElementById("crumb-now");
  const slides = Array.from(document.querySelectorAll(".slide"));
  document.getElementById("crumb-total").textContent = String(slides.length).padStart(2, "0");
  function tick() {
    const h = document.documentElement;
    rail.style.width = Math.min(100, Math.max(0, h.scrollTop / (h.scrollHeight - h.clientHeight) * 100)) + "%";
    let idx = 0;
    for (let i = 0; i < slides.length; i++) {
      if (slides[i].getBoundingClientRect().top <= window.innerHeight * 0.4) idx = i;
    }
    crumbNow.textContent = String(idx + 1).padStart(2, "0");
  }
  document.addEventListener("scroll", tick, { passive: true });
  tick();
})();
</script>
```

상단 고정 요소 (body 첫 부분):
```html
<div class="rail"><div id="rail"></div></div>
<div class="crumb"><span id="crumb-now">01</span> / <b id="crumb-total">08</b></div>
<main class="deck"> ... slides ... </main>
```

## 슬라이드 구성

### history 양식 (완료 보고서) — 최대 8슬라이드
순서: **Cover → At a glance → Problem → How it works → Decisions → Validation → Files → What's next**

| 슬라이드 | id | 원본 md 매핑 | CSS 컴포넌트 |
|----------|-----|--------------|--------------|
| Cover | `#cover` | 제목 + `## 요약` 첫 문장 + 핵심 숫자 1개 | `.meta .h-title .lede .hero` |
| At a glance | `#glance` | 요약/결정에서 추출한 핵심 KPI 3~6개 | `.kpi-grid .kpi` |
| Problem | `#problem` | 요약의 "왜 했나" / Before-After 있으면 | `.compare .panel.warn/.good` (생략 가능) |
| How it works | `#how` | 파이프라인/단계가 있으면 | `.pipe .step` (생략 가능) |
| Decisions | `#decisions` | `## 주요 결정 사항` | `.dec-list .dec` |
| Validation | `#validate` | `## 테스트 & 검증` | `.timeline ol li` |
| Files | `#files` | `## 변경 파일` (그룹별) | `.files-grid .file-card` |
| What's next | `#next` | `## 추가 사항` | `.next-grid .next` + `.signature` |

### task 양식 (계획 보고서) — 최대 6슬라이드
순서: **Cover → At a glance → Goal → Plan → Risks → Resume**

| 슬라이드 | id | 원본 md 매핑 | CSS 컴포넌트 |
|----------|-----|--------------|--------------|
| Cover | `#cover` | 제목 + 의도/사용자 의도 첫 문장 + 핵심 숫자 | `.meta(.badge.task) .h-title .lede .hero` |
| At a glance | `#glance` | 목표 개수/진행률/체크리스트 수 등 | `.kpi-grid .kpi` |
| Goal | `#goal` | `## 목표` (검증 가능한 목표 체크리스트) | `.goal-list .goal(.done)` |
| Plan | `#plan` | `## 체크리스트` (Phase/단계) | `.pipe .step` 또는 `.timeline` |
| Risks | `#risks` | `## ⚠️ 사전 리스크` | `.next-grid .next.warn` |
| Resume | `#resume` | `## 재개 포인트` | `.next` 또는 `.timeline` |

## 일관성 규칙 (배치 불문 고정)

1. **날짜 표기**: Cover meta = `YYYY-MM-DD`. 본문 내 날짜도 `YYYY-MM-DD` (점/슬래시 혼용 금지).
2. **page-no**: 각 슬라이드 `.page-no`는 `NN / 총개수 · SECTION이름` (대문자 영문 섹션명).
3. **상태 badge**: history = `<span class="badge">Done</span>` (초록), task = `<span class="badge task">Task</span>` (파랑).
4. **숫자 강조**: KPI/hero 숫자는 원문에 실제 있는 수치만. 없는 숫자 지어내기 금지.
5. **슬라이드 밀도**: 원본 내용 없으면 해당 슬라이드 **생략**. 억지로 채우지 않는다. 빈약한 문서는 3~4슬라이드도 OK.
6. **강조 색**: 좋은 결과/성공 = `.good`(초록), 문제/리스크 = `.warn`(빨강), 핵심 수치/링크 = `.accent`(파랑). 그 외 색 금지.
7. **인라인 강조**: `<strong>`은 핵심 키워드만. `<code>`는 파일명/명령/식별자.
8. **signature**: history 마지막 슬라이드 하단에 `.signature` (인용 한 줄 + repo·날짜). task는 생략 가능.

## 변환 후 누락 검증 체크리스트 (각 보고서 작성 직후)

원본 md와 대조하여 다음이 보고서에 보존됐는지 확인:
- [ ] 원제목 (제목 의미 손실 없음)
- [ ] 완료일/작성일
- [ ] 핵심 결정 사항 전부 (개수 일치)
- [ ] 미완료 작업 / 후속 사항
- [ ] 참조 링크 (메모리/다른 문서 링크 보존)
- [ ] 변경 파일 목록 (개수 일치)
- [ ] 원문에 있던 수치 (지어낸 숫자 없음)
