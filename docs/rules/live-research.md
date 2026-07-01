# Live Research substrate (agent-reach + insane-search)

> Lens 스킬(`/cpp` S2, `/cr`)이 "현재 라이브 정보"(최신 릴리즈·트렌드·이슈·커뮤니티 반응)를 가져오는 표준 경로.
> 도구 미설치 시 폴백까지 규정. **SoT — 스킬은 이 문서를 참조만 한다**(호출법을 각자 재구현하지 않는다).

이 문서는 순수 규칙 문서다. Lens 는 `agent-reach`·`insane-search` 를 **강제 설치하지 않는다** — "있으면 쓰고 없으면 폴백"만 규정한다. 두 도구는 Lens 외부 플러그인이므로, 미설치가 "실패"가 아니라 "폴백"이 되어야 한다.

---

## 0. 감지 (호출 전 1회)

라이브 조사 단계에 들어가면, 스킬은 **먼저 아래를 판정**해 어느 경로를 쓸지 고른다.

### agent-reach (무키 라이브 채널)

```bash
# PATH 우선, 없으면 표준 설치 경로 확인
command -v agent-reach \
  || ls ~/.agent-reach-venv/Scripts/agent-reach.exe   # Windows
  # unix:  ls ~/.agent-reach-venv/bin/agent-reach
```

- Windows: `~/.agent-reach-venv/Scripts/agent-reach.exe`
- unix(macOS/Linux): `~/.agent-reach-venv/bin/agent-reach`
- 또는 PATH 에 `agent-reach` 가 잡히면 그대로 사용.

감지되면 **채널별 백엔드 상태**를 확인한다(무키 6~7채널만 즉시 가용, 나머지는 인증 필요):

```bash
agent-reach doctor --json
```

→ 각 플랫폼의 `active_backend` 로 지금 어떤 채널이 살아 있는지 확인 후 호출표(§1)를 고른다.

### insane-search (WAF 우회 fetch)

- 플러그인 스킬 존재로 감지: 세션의 스킬 목록에 `insane-search` 가 있는지, 또는
  ```bash
  ls ~/.claude/plugins/cache/*/insane-search/*/ 2>/dev/null
  ```
- 있으면 `python -m engine "<URL>"` 사용 가능(§2).

### 판정

- 둘 다 감지 → §1·§2 직접 명령 사용.
- 하나만 감지 → 있는 것만 쓰고, 없는 쪽은 §3 폴백.
- **둘 다 없음 → §3 폴백 모드로 진행**(절대 멈추지 않음).

---

## 1. 라이브 채널 (agent-reach)

감지되면 아래 실측 명령을 쓴다. 로그인 채널·재시도 체인 등 복잡한 라우팅은 **agent-reach 스킬에 위임**한다(그쪽 `references/*.md` 가 관리 — 여기서 재구현하지 않는다).

| 의도 | 명령 |
|------|------|
| 시맨틱 웹검색(트렌드·최신) | `mcporter call 'exa.web_search_exa(query: "...", numResults: 5)'` |
| 웹페이지 읽기(마크다운화) | `curl -s "https://r.jina.ai/<URL>"` |
| GitHub 리포/이슈/PR | `gh search repos "q" --sort updated --limit N` / `gh search issues "q" --limit N` |
| YouTube 자막 | `yt-dlp --write-auto-sub --sub-lang "ko,en" --skip-download -o "/tmp/%(id)s" "<URL>"` → 생성된 json3/vtt 파싱 |
| V2EX 핫 토픽 | `curl -s https://www.v2ex.com/api/topics/hot.json -H "User-Agent: lens/1.0"` |
| RSS/Atom 피드 | `curl -s "<feed_url>"` 후 항목 파싱 |
| 플랫폼 라우팅 일반(小红书·트위터/X·B站·Reddit·LinkedIn 등) | **agent-reach 스킬에 위임** — 채널별 백엔드·재시도 체인은 그쪽이 관리 |

## 2. 차단 우회 fetch (insane-search)

WebFetch 가 402/403/blocked 를 반환하거나 WAF/봇 차단이 있는 특정 공개 URL 은:

```bash
python -m engine "<URL>"
```

- yt-dlp·Jina Reader·공개 API·WAF-프로파일 fetch 체인(TLS impersonation, 모바일 URL 변환, 실제 Chrome)을 자동으로 순차 시도한다.
- **§6 안전 한계를 반드시 지킨다**(페이월·로그인 우회 금지 등).

---

## 3. 폴백 (도구 없을 때)

미설치는 **실패가 아니라 폴백**이다. 조용히 대체하고, 조사보고에 한 줄만 남긴다.

- **agent-reach 없음** → `deep-research` 스킬(있으면) → 없으면 네이티브 `WebSearch` / `WebFetch`.
- **insane-search 없음** → `WebFetch` → 막히면 Jina Reader(`curl -s "https://r.jina.ai/<URL>"`).

폴백을 탄 경우 조사보고에 다음 한 줄을 남긴다:

> 라이브 채널 없음(폴백: `<대체 수단>`)

절대 **"라이브 조사 실패"로 멈추지 않는다.** 최선의 폴백 수단으로 계속 진행하고, 어떤 경로를 썼는지만 명시한다.

---

## 4. 신선도 규율

라이브 데이터는 "지금 참인가"가 핵심이다.

- 라이브 인용은 **출처 URL + 발행일**을 병기한다.
- 발행일이 오래된 소스는 "라이브 아님"으로 표기한다(오래된 정보를 최신 신호로 오인하지 않도록).
- 발행일을 못 구하면 "발행일 불명"으로 명시하고, 라이브 신호로 단정하지 않는다.

---

## 5. 누가 참조하나

이 문서를 참조하는 스킬:

- **`/cpp`** — S2(전방위 fan-out 조사)의 축③ 라이브 신호 조사.
- **`/cr`** — creeta research(라이브 다각도 딥리서치).

스킬을 추가하거나 참조 방식을 바꿀 때 **이 목록을 갱신한다.** 새 Lens 스킬이 라이브 데이터를 필요로 하면, 호출법을 재발명하지 말고 이 문서만 참조한다(agent-reach 채널이 늘면 §1 표 한 곳만 갱신).

---

## 6. 안전 한계 (insane-search)

`insane-search`(`python -m engine`)는 **접근이 막힌 정당한 공개 정보를 조회**하기 위한 도구다. 우회 능력을 오남용하지 않는다.

- **(a) 로그인/유료 페이월 우회 금지** — 인증·결제 뒤의 콘텐츠를 강제로 뚫지 않는다.
- **(b) robots·ToS 위반 대량 크롤 금지** — 사이트 정책을 무시한 대량 수집 금지.
- **(c) 개인정보·비공개 리소스 조회 금지** — 공개 의도가 없는 데이터는 다루지 않는다.
- **(d) 실패는 terminal 로 인정** — `auth_required` / `paywall` / `404` 등은 최종 실패로 받아들이고 멈춘다. **무한 재시도 금지.**

---

## 셸 규칙 (Windows cp949 함정)

- **한글 content 를 셸에 직접 넣지 않는다** — Windows cp949 인코딩에서 깨진다. `--data-binary @file` 또는 파일 경유로 전달한다.
- 임시 파일은 `/tmp/` 에 둔다(예: `-o "/tmp/%(id)s"`).
- 큰 본문·자막은 파일로 받아 파싱한다(셸 인라인 금지).
