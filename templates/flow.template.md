---
doc_kind: flow
updated: {YYYY-MM-DD}
scope: {전체 | 하위영역}
source_repo: {repo}
---

<!--
  flow.template.md — /cp flow 모드 작성용 reference. 런타임 코드가 읽지 않는다 —
  Claude 가 Read 후 {중괄호} placeholder 를 실제 값으로 치환·모방해 생성한다.

  ★ 이 md 가 SoT 다. flow-viewer HTML 은 이 문서에서 파생된 *뷰*이며,
    내용 수정은 항상 md 먼저 → HTML 재생성 순서를 지킨다.
    (뷰어 양식: templates/flow-viewer.example.html)
-->

# {project} — 이용자 플로우 & 엔진 맵

> {한 줄 소개 — 이 플로우가 다루는 서비스/영역과 관점}

## ① 이용자 단계 정의

| 단계 | 화면·구성 | 목적 | 근거 (파일 경로) |
|------|-----------|------|------------------|
| ① {단계 이름} | {이 단계의 화면·구성 요소 요약} | {이용자 관점에서 이 단계가 해주는 것} | `{src/routes/…}` |
| ② {단계 이름} | {…} | {…} | `{…}` |
| ③ {단계 이름} | {…} | {…} | `{…}` (추정) |

## ② 모듈(엔진) 인벤토리

여러 단계가 같은 모듈을 쓰면 "사용하는 단계"에 전부 적어 **재사용을 가시화**한다.

| 모듈 | 역할 | 코드 경로 | 사용하는 단계 |
|------|------|-----------|----------------|
| {모듈 A} | {한 줄 역할} | `{lib/…}` | ①, ③ |
| {모듈 B} | {한 줄 역할} | `{…}` | ② |

## ③ 플로우차트

<!--
  문법은 원본(livevil-boost flow.html) 계승:
  - subgraph = 단계/엔진 묶음, classDef = 노드 종류별 스타일
  - 실선(-->) = 이용자 진행, 점선(-.->) = 엔진 받침·종속, ~~~ = 배치용 투명 링크
  - 두 단계 이상이 같은 엔진을 점선으로 가리키면 = 재사용
-->

```mermaid
flowchart TB
  classDef hub fill:#312e81,stroke:#818cf8,stroke-width:2.5px,color:#e0e7ff;
  classDef star fill:#1e1b4b,stroke:#6366f1,stroke-width:2px,color:#c7d2fe;
  classDef sys fill:#0b2818,stroke:#3fb950,stroke-width:1.5px,color:#c9f7d4;

  entry([{진입점}]) --> s1["① {단계 이름}<br/>{화면 한 줄}"]:::hub

  subgraph P2["② {단계 이름}"]
    s2a["{화면}<br/>{구성 요약}"]:::star --> s2b["{후속 화면}"]
  end
  s1 --> s2a

  subgraph P3["③ {단계 이름}"]
    s3["{화면}"]:::star
  end
  s2b -->|"{전이 조건}"| s3

  subgraph SYS["받치는 엔진 — 화면 뒤에서 도는 모듈"]
    m1["{모듈 A}<br/>{코드 경로 요약}"]:::sys
    m2["{모듈 B} (추정)"]:::sys
  end
  s3 ~~~ m1

  s2a -.-> m1
  s3 -.-> m1
  s2b -.-> m2
  m1 -.{피드백 라벨}.-> s1
```

## ④ 근거 규칙

- 모든 단계·모듈 행과 플로우차트 노드는 **실제 파일 경로 근거**가 있어야 한다 (①표 "근거"·②표 "코드 경로" 칼럼).
- **실제 파일 근거 없는 노드는 라벨에 `(추정)` 표기 의무.** 예: `m2["{모듈 B} (추정)"]`. 근거 확보 시 `(추정)` 제거.
