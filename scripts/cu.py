#!/usr/bin/env python3
"""
Lens /cu — multi-source updater.

Sources: winget / npm-global / vscode-ext / claude-plugin / cli-special / pip-global / brew.
Package managers enumerate their own items — no per-tool hardcoding. A source
that is not installed on this machine simply drops out (per-machine principle).

Two modes:
  cu.py scan              Emit JSON object {"items": [...], "source_errors": [...]}
  cu.py upgrade <id>      Run the upgrade for one item by id.

Item shape (scan output, "items" array):
  {
    "id":        "<source>:<pkg>"  e.g. "winget:Git.Git", "npm:wrangler",
                 "plugin:lens@CreetaCorp", "cli:claude", "vscode:__all__", "pip:__all__",
    "kind":      category label ("cli" | "plugin" | "winget" | "npm" | "vscode" | "pip" | "brew"),
    "source":    "winget" | "npm" | "vscode" | "plugin" | "cli" | "pip" | "brew",
    "name":      human label (winget names may be console-width truncated — display only,
                 never used for decisions),
    "installed": version string or null,
    "latest":    version string or null (lookup failed / not knowable),
    "needs_update": true | false | null — null when unknown OR when installed/latest
                 have different shapes (semver vs SHA). Shape mismatch is NEVER true.
    "risk":      "auto" | "hold" | "never"
                 auto  = run without asking, hold = only via /cu all,
                 never = not even /cu all (data-directory software, winget itself, drivers, pip),
    "hold_reason": string or null (why not auto),
    "upgrade_cmd": shell hint (always shown to the user),
    "can_auto":  true if this script can run the upgrade itself,
    "note":      optional one-liner shown alongside the item
  }

"source_errors": [{"source": "...", "error": "..."}] — REAL failures only
(timeout, parse failure). A package manager that is simply not installed is
not an error; that source just doesn't appear.

`cu.py scan --snapshot` also writes the full result to
~/.claude/lens/cu-last-scan.json so post-upgrade "what changed from what" is
recoverable. Only the pre-upgrade scan passes the flag — a plain `scan` never
writes, so the mandatory post-run rescan cannot clobber the record it is meant
to be compared against. A requested snapshot that cannot be written is fatal
(exit 1) rather than a warning, so upgrades never proceed without the record.

Exit codes:
  scan:    0 on success, 1 on unrecoverable error
  upgrade: 0 success, 1 failure, 2 unknown id, 3 auto-upgrade not supported
           (user must run the printed command themselves)
"""

import json
import os
import platform
import re
import shutil
import subprocess
import sys
import unicodedata
import urllib.error
import urllib.request
from pathlib import Path

# Force UTF-8 stdout on Windows so Korean labels don't mojibake in bash output.
for _stream in (sys.stdout, sys.stderr):
    if hasattr(_stream, "reconfigure"):
        try:
            _stream.reconfigure(encoding="utf-8")
        except Exception:
            pass

HOME = Path.home()
PLUGINS_DIR = HOME / ".claude" / "plugins"
SNAPSHOT_PATH = HOME / ".claude" / "lens" / "cu-last-scan.json"

# ---------- 위험도/중복 정책 (SoT — 정책 전부가 이 블록에 모여 있어야 감사 가능) ----------
#
# risk 3단계:
#   auto  — 묻지 않고 실행 (플러그인 전부 / npm patch·minor / vscode 집계 /
#           winget 중 아래 조건 미해당 전부)
#   hold  — 기본 실행 안 함, /cu all 로만 (메이저 점프 / 언어 런타임 /
#           시스템 구성요소 / 비승격+머신스코프 / 버전 파싱 불가)
#   never — /cu all 로도 실행 안 함, 명령만 제시 (데이터 디렉터리 보유 SW /
#           winget 자신 / 드라이버류 / pip 글로벌) — Pre-mortem P1

# id 부분 일치(소문자) — 언어 런타임·시스템 구성요소 → hold
HOLD_KEYWORDS = (
    "nodejs", "python", "java", "jdk",            # 언어 런타임
    "vcredist", "microsoft.edge", "microsoft.teams",  # 시스템 구성요소
)

# id 토큰 정확 일치(소문자) — 데이터 디렉터리 보유 SW·드라이버류 → never
# 부분 일치를 쓰면 "redis" ⊂ "vcredist" 오매칭으로 엉뚱한 항목이 영구 제외된다
NEVER_KEYWORDS = (
    "postgresql", "mysql", "mariadb", "mongodb", "redis",  # 데이터 디렉터리
    "driver",                                              # 드라이버류
)

# winget id 정확 일치 → never (winget이 자기 자신을 올리는 중 이후 호출 불안정)
NEVER_WINGET_IDS = {"Microsoft.AppInstaller"}

# winget 은 "올릴 것이 없음"도 0 이 아닌 코드로 끝낸다 — 정상 상태이지 실패가 아니다.
# 종료코드는 로케일과 무관하므로 영어 메시지 문자열보다 판정 근거로 안전하다.
#
# ⚠️ winget 은 HRESULT 를 종료코드로 낸다. Python subprocess 는 32비트 원값을
# 그대로 받지만 셸(bash)은 하위 1바이트만 보여준다 — **같은 상황이 2316632107 과
# 43 으로 달리 보인다.** 셸에서 잰 값을 그대로 상수로 쓰면 Python 경로에서 전혀
# 안 맞는다(실측으로 당한 함정). 양쪽 표현을 모두 인정한다.
# 실측 (winget 1.29.280):
#   0x8A15002B (2316632107, low 43) "No available upgrade found."
#   0x8A150014 (2316632084, low 20) "No installed package found matching input criteria."
WINGET_NOTHING_TO_DO_RC = (0x8A15002B, 0x8A150014)
WINGET_NOTHING_TO_DO_LOW = (0x2B, 0x14)


def _winget_nothing_to_do(rc):
    """winget 종료코드가 "올릴 것 없음"인가 — HRESULT 원값과 셸 마스킹값 모두 인정."""
    return rc in WINGET_NOTHING_TO_DO_RC or (rc & 0xFF) in WINGET_NOTHING_TO_DO_LOW

# special 항목이 있으면 같은 대상의 generic 항목을 제거 (이중 업그레이드 방지)
SPECIAL_DEDUP = {
    "cli:claude": ("npm:@anthropic-ai/claude-code",),
}


def _resolve(exe):
    """Resolve an executable name to a full path; needed on Windows where
    subprocess.run([\"claude\"]) without shell=True cannot find a .cmd shim."""
    found = shutil.which(exe)
    return found or exe


def run(cmd, **kw):
    if cmd and isinstance(cmd, list):
        cmd = [_resolve(cmd[0])] + cmd[1:]
    try:
        p = subprocess.run(cmd, capture_output=True, text=True,
                            encoding="utf-8", errors="replace", timeout=120, **kw)
        return p.returncode, (p.stdout or "").strip(), (p.stderr or "").strip()
    except FileNotFoundError:
        return 127, "", "not found"
    except subprocess.TimeoutExpired:
        return 124, "", "timeout"


def github_json(url):
    req = urllib.request.Request(url, headers={"User-Agent": "lens-cu"})
    try:
        with urllib.request.urlopen(req, timeout=10) as r:
            return json.loads(r.read())
    except (urllib.error.URLError, urllib.error.HTTPError, TimeoutError, ValueError):
        return None


def _strip_v(v):
    if not v:
        return v
    return v.lstrip("v").removeprefix("rust-v")


def github_latest_tag(repo):
    data = github_json(f"https://api.github.com/repos/{repo}/releases/latest")
    if data and isinstance(data, dict):
        return _strip_v(data.get("tag_name"))
    # Some repos (e.g. openai/codex) tag releases without using GitHub "latest"
    tags = github_json(f"https://api.github.com/repos/{repo}/tags?per_page=1")
    if tags and isinstance(tags, list) and tags:
        return _strip_v(tags[0].get("name"))
    return None


# ---------- Version comparison / risk classification ----------

def _version_form(v):
    """'sha' (hex commit), 'ver' (leading digit), or None (unparseable)."""
    if not v:
        return None
    v = _strip_v(str(v).strip())
    if re.fullmatch(r"[0-9a-fA-F]{7,40}", v) and not v.isdigit():
        return "sha"
    if v[:1].isdigit():
        return "ver"
    return None


def compare_versions(installed, latest):
    """needs_update 판정. 형태가 다르면(semver vs SHA 등) None — 절대 True 금지.

    이 가드가 agentmemory/insane-search 오탐(semver ↔ HEAD SHA 비교)의 재발을
    막는 유일한 지점이므로, needs_update 계산은 반드시 여기 한 곳으로 모은다 (R4).
    """
    if not installed or not latest:
        return None
    fi, fl = _version_form(installed), _version_form(latest)
    if fi is None or fl is None or fi != fl:
        return None
    a = _strip_v(str(installed).strip())
    b = _strip_v(str(latest).strip())
    if fi == "sha":
        a, b = a.lower(), b.lower()
        # 12자 축약 SHA vs 전체 SHA 는 prefix 일치를 동일로 본다
        return not (a.startswith(b) or b.startswith(a))
    return a != b


def _major_component(v):
    if not v:
        return None
    m = re.match(r"v?(\d+)", str(v).strip())
    return int(m.group(1)) if m else None


def is_major_jump(installed, latest):
    """첫 숫자 성분 비교. 파싱 불가 시 True(보수적 — 판단 불가를 auto로 넘기지 않는다)."""
    a, b = _major_component(installed), _major_component(latest)
    if a is None or b is None:
        return True
    return a != b


def _never_token_hit(pkg_id):
    """NEVER_KEYWORDS 토큰 검사 — classify_risk 와 never_reason 의 공용 판정.

    토큰 정확 일치가 기본이다(`redis` 가 `vcredist` 를 잡으면 VC++ 재배포
    패키지가 영구 제외돼 버린다). 다만 드라이버는 이름이 거의 항상 복합어라
    (`Intel.WirelessDriver` → 토큰 `wirelessdriver`) 접미사까지 본다.
    """
    tokens = set(re.split(r"[^a-z0-9]+", (pkg_id or "").lower()))
    if any(k in tokens for k in NEVER_KEYWORDS):
        return True
    return any(t.endswith("driver") for t in tokens)


def classify_risk(source, pkg_id, installed, latest, elevated, user_scope_ids):
    """→ (risk, hold_reason). risk in ('auto','hold','never'). 정책 상수가 SoT."""
    if source in ("plugin", "cli", "vscode"):
        return ("auto", None)
    if source == "pip":
        return ("never", "시스템 파이썬 의존성 — 자동 갱신 제외")
    low = (pkg_id or "").lower()
    if source in ("winget", "brew"):
        if pkg_id in NEVER_WINGET_IDS:
            return ("never", "winget 자신 — 업그레이드 중 winget 호출 불안정")
        if _never_token_hit(pkg_id):
            return ("never", "데이터 디렉터리 보유/드라이버류 — 자동 갱신 영구 제외")
        if any(k in low for k in HOLD_KEYWORDS):
            return ("hold", "언어 런타임·시스템 구성요소")
        if source == "winget" and not elevated and pkg_id not in (user_scope_ids or set()):
            return ("hold", "관리자 권한 필요 (머신 스코프 패키지 + 비승격 셸)")
    if _major_component(installed) is None or _major_component(latest) is None:
        return ("hold", "버전 파싱 불가 — 보수적 보류")
    if is_major_jump(installed, latest):
        return ("hold", "메이저 버전 점프")
    return ("auto", None)


def dedup_items(items):
    """SPECIAL_DEDUP 규칙으로 중복 제거 — special 항목이 있으면 generic 항목을 뺀다."""
    present = {it["id"] for it in items}
    remove = set()
    for special_id, generic_ids in SPECIAL_DEDUP.items():
        if special_id in present:
            remove.update(generic_ids)
    return [it for it in items if it["id"] not in remove]


def upgrade_targets(items, mode):
    """실행 대상 산출. default → auto만, all → auto+hold. never는 어느 모드에도 불포함.

    이미 최신인 항목(`needs_update is False`)은 제외한다. 스캔은 최신 여부와
    무관하게 설치된 플러그인·CLI 를 전부 내보내므로, risk 만 보고 실행하면
    무관한 항목 하나가 낡았을 때 **최신 플러그인까지 전부 재설치**된다.

    `needs_update is None`(최신 조회 불가)은 기본적으로 제외하되, `aggregate`
    항목은 예외다 — VS Code 확장 일괄 갱신은 개별 최신 조회 수단이 없어 항상
    None 이지만 실행 자체가 의도된 동작이다.
    """
    # 화이트리스트로 판정한다 — `mode != "default"` 로 뒤집으면 오타·빈 문자열
    # 같은 미지의 값이 전부 hold 를 포함시킨다(fail-open). 판단 불가는 보수적으로.
    allowed = ("auto", "hold") if mode == "all" else ("auto",)
    out = []
    for it in items:
        if it.get("risk") not in allowed:
            continue
        nu = it.get("needs_update")
        if nu is False:
            continue
        if nu is None and not it.get("aggregate"):
            continue
        out.append(it)
    return out


def never_reason(item_id):
    """item_id 가 never 등급이면 사유 문자열, 아니면 None.

    classify_risk 와 **같은 정책 상수**로 판정한다 — 두 곳이 갈라지면 한쪽이
    거짓말을 한다. id 만 보므로 스캔·네트워크 비용이 0이다.

    upgrade_targets 로 걸러도 cmd_upgrade 는 별도 진입점이라 그 필터를 거치지
    않는다. never 는 되돌릴 수 없는 항목이므로, 거부는 호출자(에이전트)의
    필터링에 의존하지 않고 **패키지 매니저가 실제로 돌기 직전 이 지점에서**
    코드로 강제한다.
    """
    source, _, rest = item_id.partition(":")
    if source == "pip":
        return "시스템 파이썬 의존성 — 자동 갱신 제외"
    if source in ("winget", "brew"):
        if rest in NEVER_WINGET_IDS:
            return "winget 자신 — 업그레이드 중 winget 호출 불안정"
        if _never_token_hit(rest):
            return "데이터 디렉터리 보유/드라이버류 — 자동 갱신 영구 제외"
    return None


# ---------- winget table parsing ----------

def _cell_to_index(line, cell):
    """winget은 표시 폭(display cell) 기준으로 컬럼을 정렬한다. CJK 문자가 섞인
    행은 문자 인덱스 < 표시 폭이 되므로 표시 폭 → 문자 인덱스로 변환한다.
    ASCII 행은 그대로 통과한다."""
    if line.isascii():
        return min(cell, len(line))
    w = 0
    for i, ch in enumerate(line):
        if w >= cell:
            return i
        w += 2 if unicodedata.east_asian_width(ch) in ("W", "F") else 1
    return len(line)


# winget 헤더는 OS 표시 언어를 따른다. 영문 라벨만 찾으면 비영문 로케일에서 표 전체를
# 못 읽고 소스가 통째로 조용히 빠진다 (2026-08-08 한국어 Windows 실측: 21건 -> 0건 보고).
# 별칭은 **구체적인 것부터** 둔다 - 한국어 Id 컬럼은 "장치 ID" 이고, 여기서 "ID" 를 먼저
# 맞히면 컬럼 시작이 "장치" 가 아니라 "ID" 로 잡혀 경계가 오른쪽으로 밀린다.
WINGET_HEADER_ALIASES = {
    "Id":        ("장치 ID", "장치ID", "Id", "ID"),
    "Version":   ("버전", "Version"),
    "Available": ("사용 가능", "사용가능", "Available"),
    "Source":    ("원본", "Source"),
}


def _display_width(text):
    """문자열의 콘솔 표시 폭. CJK(W/F)는 2칸."""
    return sum(2 if unicodedata.east_asian_width(ch) in ("W", "F") else 1 for ch in text)


def _find_header_label(header, aliases):
    """별칭 중 처음 걸리는 것의 **표시 폭 오프셋**을 돌려준다.

    문자 인덱스가 아니라 표시 폭이어야 한다 - _cell_to_index() 가 표시 폭을 입력으로
    받기 때문이다. ASCII 헤더는 둘이 같아 종전 동작이 그대로 유지되지만, 한글 헤더에서는
    달라서 문자 인덱스를 쓰면 컬럼 경계가 왼쪽으로 밀린다.
    """
    for alias in aliases:
        if alias.isascii():
            m = re.search(r"\b" + re.escape(alias) + r"\b", header)
        else:
            m = re.search(re.escape(alias), header)
        if m:
            return _display_width(header[:m.start()])
    return None


def _winget_header_cols(header):
    """헤더 행에서 Id/Version/Available/Source 컬럼 시작 **표시 폭**을 산출."""
    pos = {col: _find_header_label(header, aliases)
           for col, aliases in WINGET_HEADER_ALIASES.items()}
    if pos["Id"] is None or pos["Version"] is None or pos["Available"] is None:
        return None
    return pos


def _looks_like_winget_header(line):
    """헤더 후보인가 - Id/Version/Available 세 라벨이 로케일 무관하게 다 보이는가."""
    return all(_find_header_label(line, WINGET_HEADER_ALIASES[c]) is not None
               for c in ("Id", "Version", "Available"))


def parse_winget_upgrade(text):
    """winget upgrade --include-unknown 출력 → [{'id','name','installed','latest'}].

    - 헤더 행의 컬럼 시작 위치로 경계를 산출한다 (단순 split()은
      "Microsoft Visual C++ 2015-2022 Redistributable (x64)" 같은 이름에서 깨진다).
    - id 컬럼만 판정에 신뢰한다 (P3 — 이름은 콘솔 폭에 따라 …로 잘리므로 보고용).
    - 구분선/요약줄/빈 줄은 제외. 그 외 파싱 불가 행은 stderr로 알리고 건너뛴다.
    """
    items = []
    cols = None
    for raw in (text or "").splitlines():
        line = raw.rstrip()
        s = line.strip()
        if not s:
            continue
        if _looks_like_winget_header(line):
            got = _winget_header_cols(line)
            if got:
                cols = got  # 두 번째 표 섹션이 나오면 경계 재산출
                continue
        if cols is None:
            continue  # 헤더 전 진행률/잡음
        if set(s) <= {"-"}:
            continue  # 구분선
        if re.fullmatch(r"\d+ upgrades? available\.?", s):
            continue  # 요약줄
        i_id = _cell_to_index(line, cols["Id"])
        i_ver = _cell_to_index(line, cols["Version"])
        i_avail = _cell_to_index(line, cols["Available"])
        i_src = _cell_to_index(line, cols["Source"]) if cols["Source"] is not None else len(line)
        pkg_id = line[i_id:i_ver].strip()
        installed = line[i_ver:i_avail].strip()
        latest = line[i_avail:i_src].strip()
        if not pkg_id or " " in pkg_id:
            print(f"cu: winget 행 파싱 건너뜀: {s[:80]!r}", file=sys.stderr)
            continue
        items.append({
            "id": pkg_id,
            "name": line[:i_id].strip(),
            "installed": installed,
            "latest": latest,
        })
    return items


# ---------- Source scanners (each returns (items, error_or_None)) ----------

def scan_winget():
    if platform.system() != "Windows" or not shutil.which("winget"):
        return [], None
    rc, out, err = run(["winget", "upgrade", "--include-unknown"])
    if rc == 124:
        return [], "winget: timeout"
    rows = parse_winget_upgrade(out)
    # "올릴 것 없음"이 먼저다 — 이건 정상 결과이고 표도 헤더도 없다. 아래 실패
    # 판정보다 앞에 두지 않으면 전부 최신인 머신에서 winget 이 고장난 것처럼 보고된다.
    if not rows and (_winget_nothing_to_do(rc)
                     or re.search(r"No (available upgrade|installed package)", out)):
        return [], None
    # winget 은 실패해도 진단문을 stdout 으로 낸다. "stdout 이 비었나"로 성공을
    # 판정하면 그 경우가 성공으로 통과하고, 파싱할 표가 없으니 결과가 빈 목록이
    # 되어 **소스 전체가 조용히 사라진다** — 사용자에겐 "winget 최신"으로 보인다.
    # 판정 기준은 stdout 유무가 아니라 "행을 실제로 파싱했는가"다.
    if rc != 0 and not rows:
        return [], f"winget: exit {rc} {(err or out).strip()[:160]}"
    m = re.search(r"(\d+) upgrades? available", out)
    if not rows and m and int(m.group(1)) > 0:
        return [], "winget: 표 파싱 실패 (upgrades available 표시됨)"
    # 헤더/요약줄 탐지는 영어 컬럼명에 의존한다. 비영어 로케일 머신에서는 출력이
    # 있는데도 한 행도 못 읽고, 위의 영어 요약줄 가드마저 안 걸려 "winget 최신"으로
    # 조용히 보고될 수 있다. 출력이 있는데 헤더를 못 찾았으면 실패로 올린다.
    if not rows and out.strip() and not any(
            _winget_header_cols(ln) for ln in out.splitlines()):
        return [], "winget: 표 헤더 미발견 (로케일 차이 가능) — 목록을 읽지 못했습니다"
    items = []
    for r in rows:
        items.append({
            "id": f"winget:{r['id']}",
            "kind": "winget",
            "source": "winget",
            "name": r["name"] or r["id"],
            "installed": r["installed"],
            "latest": r["latest"],
            "upgrade_cmd": (
                f"winget upgrade --id {r['id']} --silent "
                "--accept-source-agreements --accept-package-agreements "
                "--disable-interactivity"
            ),
            "can_auto": True,
            "note": None,
        })
    return items, None


def _is_elevated():
    rc, _, _ = run(["net", "session"])
    return rc == 0


def _winget_user_scope_ids():
    """비승격일 때만 호출 (P6). user 스코프로 설치된 winget id 집합."""
    rc, out, _ = run(["winget", "list", "--scope", "user"])
    if not out:
        return set()
    ids = set()
    pos = None
    for line in out.splitlines():
        s = line.strip()
        if not s:
            continue
        if pos is None:
            m_id = re.search(r"\bId\b", line)
            m_ver = re.search(r"\bVersion\b", line)
            if m_id and m_ver:
                pos = (m_id.start(), m_ver.start())
            continue
        if set(s) <= {"-"}:
            continue
        cand = line[_cell_to_index(line, pos[0]):_cell_to_index(line, pos[1])].strip()
        if cand and " " not in cand:
            ids.add(cand)
    return ids


def scan_npm_global():
    if not shutil.which("npm"):
        return [], None
    # npm은 outdated 존재 시 exit 1이 정상 (W4) — 종료코드가 아니라 stdout JSON으로 판정
    rc, out, err = run(["npm", "outdated", "-g", "--depth=0", "--json"])
    if rc == 124:
        return [], "npm: timeout"
    if not out:
        return ([], None) if rc in (0, 1) else ([], f"npm: exit {rc} {err[:120]}")
    try:
        data = json.loads(out)
    except ValueError:
        return [], "npm: JSON 파싱 실패"
    if isinstance(data, dict) and "error" in data:
        return [], f"npm: {data['error'].get('summary', 'error')}"
    items = []
    for pkg, info in data.items():
        items.append({
            "id": f"npm:{pkg}",
            "kind": "npm",
            "source": "npm",
            "name": pkg,
            "installed": info.get("current"),
            "latest": info.get("latest"),
            "upgrade_cmd": f"npm install -g {pkg}@latest",
            "can_auto": True,
            "note": None,
        })
    return items, None


def _find_code():
    found = shutil.which("code")
    if found:
        return found
    base = Path(os.environ.get("LOCALAPPDATA", "")) / "Programs" / "Microsoft VS Code" / "bin"
    for cand in (base / "code.cmd", base / "code"):
        if cand.exists():
            return str(cand)
    return None


def scan_vscode_ext():
    """개별 확장은 열거하지 않는다 — CLI에 최신 조회 수단이 없다. 단일 집계 항목
    하나만 내고, 업그레이드는 `code --update-extensions` 1회 + 전후 diff 보고."""
    code = _find_code()
    if not code:
        return [], None
    return [{
        "id": "vscode:__all__",
        "kind": "vscode",
        "source": "vscode",
        "name": "VS Code 확장 일괄 갱신",
        "installed": None,
        "latest": None,
        "upgrade_cmd": "code --update-extensions",
        "can_auto": True,
        "aggregate": True,   # needs_update 를 알 수 없어도 실행 대상 — 아래 upgrade_targets 참조
        "note": "개별 최신 조회 수단 없음 — 실행 전후 --list-extensions diff로 결과 보고",
    }], None


def scan_pip_global():
    if not shutil.which("pip"):
        return [], None
    rc, out, err = run(["pip", "list", "--outdated", "--format=json"])
    if rc == 124:
        return [], "pip: timeout"
    if rc != 0:
        return [], f"pip: exit {rc} {err[:120]}"
    try:
        data = json.loads(out or "[]")
    except ValueError:
        return [], "pip: JSON 파싱 실패"
    if not data:
        return [], None
    # P4: 개별 열거 금지 — 집계 1행 (hold 목록 도배로 진짜 결정 대상이 묻히는 것 방지)
    n = len(data)
    return [{
        "id": "pip:__all__",
        "kind": "pip",
        "source": "pip",
        "name": f"pip 글로벌 outdated {n}건",
        "installed": None,
        "latest": None,
        "upgrade_cmd": "pip list --outdated  # 개별 확인 후 직접 판단",
        "can_auto": False,
        "note": None,
        "risk": "never",
        "hold_reason": f"시스템 파이썬 의존성 — 자동 갱신 제외 (outdated {n}건)",
    }], None


def scan_brew():
    if not shutil.which("brew"):
        return [], None
    rc, out, err = run(["brew", "outdated", "--json=v2"])
    if rc == 124:
        return [], "brew: timeout"
    if rc != 0:
        return [], f"brew: exit {rc} {err[:120]}"
    try:
        data = json.loads(out or "{}")
    except ValueError:
        return [], "brew: JSON 파싱 실패"
    items = []
    for section in ("formulae", "casks"):
        for f in data.get(section) or []:
            name = f.get("name")
            if not name:
                continue
            installed = (f.get("installed_versions") or [None])[-1]
            items.append({
                "id": f"brew:{name}",
                "kind": "brew",
                "source": "brew",
                "name": name,
                "installed": installed,
                "latest": f.get("current_version"),
                "upgrade_cmd": f"brew upgrade {name}",
                "can_auto": True,
                "note": None,
            })
    return items, None


# ---------- CLI scanner (special-path only) ----------

def scan_claude():
    rc, out, _ = run(["claude", "--version"])
    if rc != 0 or not out:
        return None
    installed = out.split()[0]
    return {
        "id": "cli:claude",
        "kind": "cli",
        "source": "cli",
        "name": "Claude Code",
        "installed": installed,
        "latest": github_latest_tag("anthropics/claude-code"),
        "upgrade_cmd": "claude update",
        "can_auto": True,
        "note": "전용 `claude update` 경로 — npm generic 재설치로 대체 금지 (자기 자신 실행 중)",
    }


# ---------- Plugin scanner ----------

def _marketplace_remote_url(marketplace):
    """마켓플레이스 원격 URL. 클론의 git origin → known_marketplaces.json 순.
    (공식 마켓플레이스 클론은 .git 없이 배포되므로 레지스트리 폴백이 필수)"""
    mp_root = PLUGINS_DIR / "marketplaces" / marketplace
    if mp_root.exists():
        rc, url, _ = run(["git", "-C", str(mp_root), "remote", "get-url", "origin"])
        if rc == 0 and url:
            return url
    km = PLUGINS_DIR / "known_marketplaces.json"
    if km.exists():
        try:
            src = (json.loads(km.read_text(encoding="utf-8"))
                   .get(marketplace) or {}).get("source") or {}
        except Exception:
            return None
        if src.get("url"):
            return src["url"]
        if src.get("repo"):
            return f"https://github.com/{src['repo']}.git"
    return None


def _marketplace_origin_head(marketplace):
    """Return short SHA of marketplace remote HEAD, or None."""
    url = _marketplace_remote_url(marketplace)
    if not url:
        return None
    rc, out, _ = run(["git", "ls-remote", url, "HEAD"])
    if rc != 0 or not out:
        return None
    sha = out.split()[0]
    return sha[:12] if sha else None


def _marketplace_latest(name, marketplace, installed):
    """Look up latest version of plugin <name> in marketplace <marketplace>.

    Resolution order (설계 3):
      1. plugin.version in marketplace manifest
      2. version in marketplaces/<mp>/<source>/.claude-plugin/plugin.json
         (source가 './plugin' 같은 로컬 상대경로인 마켓플레이스 — 오탐의 근본 수정)
      3. plugin.source.ref (github source pinned to a tag)
      4. marketplace remote HEAD short SHA — 설치본도 SHA일 때만 (semver↔SHA 비교 금지)
      5. None — 추측하지 않는다
    """
    mp_root = PLUGINS_DIR / "marketplaces" / marketplace
    if not mp_root.exists():
        return None
    entry = None
    for mf in (mp_root / ".claude-plugin" / "marketplace.json", mp_root / "marketplace.json"):
        if not mf.exists():
            continue
        try:
            data = json.loads(mf.read_text(encoding="utf-8"))
        except Exception:
            continue
        plugins = data.get("plugins")
        if isinstance(plugins, list):
            entry = next((p for p in plugins if p.get("name") == name), None)
        elif isinstance(plugins, dict):
            entry = plugins.get(name)
        if entry:
            break
    if entry:
        ver = entry.get("version")
        if ver:
            return _strip_v(ver)
        src = entry.get("source")
        if isinstance(src, str) and src.startswith("."):
            pj = mp_root / src / ".claude-plugin" / "plugin.json"
            if pj.exists():
                try:
                    ver = json.loads(pj.read_text(encoding="utf-8")).get("version")
                    if ver:
                        return _strip_v(ver)
                except Exception:
                    pass
        if isinstance(src, dict):
            ref = src.get("ref")
            if ref:
                return _strip_v(ref)
        ref = entry.get("ref")
        if ref:
            return _strip_v(ref)
    if _version_form(installed) == "sha":
        return _marketplace_origin_head(marketplace)
    return None


def scan_plugins():
    reg = PLUGINS_DIR / "installed_plugins.json"
    if not reg.exists():
        return []
    try:
        data = json.loads(reg.read_text(encoding="utf-8"))
    except Exception:
        return []
    out = []
    for full_name, entries in (data.get("plugins") or {}).items():
        if not entries:
            continue
        entry = entries[0]
        if "@" in full_name:
            name, marketplace = full_name.split("@", 1)
        else:
            name, marketplace = full_name, ""
        installed = entry.get("version") or "?"
        # 레지스트리가 버전을 모르는 플러그인(context7·playwright)은 커밋 SHA가
        # 곧 설치 버전 — SHA 대 SHA 비교가 성립하도록 대체한다.
        if installed == "unknown":
            installed = entry.get("gitCommitSha") or "?"
        latest = _marketplace_latest(name, marketplace, installed) if marketplace else None
        # claude-plugins-official uses git SHAs; truncate for display parity
        if installed and len(installed) > 12 and all(c in "0123456789abcdef" for c in installed):
            installed = installed[:12]
        if latest and len(latest) > 12 and all(c in "0123456789abcdef" for c in latest):
            latest = latest[:12]
        is_lens = (name == "lens")
        out.append({
            "id": f"plugin:{full_name}",
            "kind": "plugin",
            "source": "plugin",
            "name": full_name,
            "installed": _strip_v(installed) or installed,
            "latest": latest,
            "upgrade_cmd": (
                f"claude plugin update {full_name}"
                if not is_lens else
                "/lens-upgrade (위임)"
            ),
            "can_auto": True,
            "note": "lens 자체는 /lens-upgrade 스크립트로 위임" if is_lens else None,
        })
    return out


# ---------- Aggregate ----------

def cmd_scan(write_snapshot=False):
    items = []
    source_errors = []
    # cli-special: 전용 업데이트 경로가 있는 것만 (claude / lens 플러그인)
    it = scan_claude()
    if it:
        items.append(it)
    items.extend(scan_plugins())
    for src_name, fn in (
        ("winget", scan_winget),
        ("npm", scan_npm_global),
        ("vscode", scan_vscode_ext),
        ("pip", scan_pip_global),
        ("brew", scan_brew),
    ):
        got, err = fn()
        items.extend(got)
        if err:
            source_errors.append({"source": src_name, "error": err})
    items = dedup_items(items)
    # 승격 판정은 winget 항목이 있을 때만, --scope user 조회는 비승격일 때만 (P6)
    winget_present = any(i["source"] == "winget" for i in items)
    elevated = _is_elevated() if winget_present else True
    user_scope_ids = _winget_user_scope_ids() if (winget_present and not elevated) else set()
    for i in items:
        i["needs_update"] = compare_versions(i.get("installed"), i.get("latest"))
        if "risk" not in i:  # pip 집계행은 스캐너가 건수 포함 사유를 미리 채운다 (P4)
            pkg = i["id"].split(":", 1)[1]
            i["risk"], i["hold_reason"] = classify_risk(
                i["source"], pkg, i.get("installed"), i.get("latest"),
                elevated, user_scope_ids)
    payload = json.dumps({"items": items, "source_errors": source_errors},
                         indent=2, ensure_ascii=False)
    # 사전 스냅샷 — 무확인 실행 후 "무엇이 어떤 버전에서 갔는지" 사후 재구성용 (T5).
    # **명시 요청(`scan --snapshot`)일 때만 쓴다.** 모든 스캔이 같은 경로에 쓰면
    # 실행 후 필수 재스캔이 업그레이드 전 상태를 덮어써서, 정작 필요한 시점에
    # before/after 대조가 불가능해진다.
    if write_snapshot:
        try:
            SNAPSHOT_PATH.parent.mkdir(parents=True, exist_ok=True)
            SNAPSHOT_PATH.write_text(payload, encoding="utf-8")
        except OSError as e:
            # 경고만 내고 성공으로 끝내면, 감사 기록 없이 무확인 업그레이드가
            # 진행된다 — 정작 "무엇이 올라갔나"를 물어야 할 때 답할 수 없다.
            # 명시 요청된 스냅샷이 실패하면 실패로 끝낸다.
            print(f"cu: 스냅샷 저장 실패 ({e}) — 사전 기록 없이 업그레이드하면 "
                  "사후 대조가 불가능합니다", file=sys.stderr)
            return 1
    print(payload)
    return 0


# ---------- Upgrade dispatch ----------

def _upgrade_claude():
    claude = _resolve("claude")
    print(f">>> {claude} update")
    return subprocess.call([claude, "update"])


def _upgrade_lens():
    # Find the active lens install path from installed_plugins.json
    reg = PLUGINS_DIR / "installed_plugins.json"
    if not reg.exists():
        print("ERR: installed_plugins.json missing", file=sys.stderr)
        return 1
    data = json.loads(reg.read_text(encoding="utf-8"))
    entries = (data.get("plugins") or {}).get("lens@CreetaCorp") or []
    if not entries:
        print("ERR: lens@CreetaCorp not installed", file=sys.stderr)
        return 1
    install_path = Path(entries[0].get("installPath", ""))
    script = install_path / "scripts" / "upgrade.sh"
    if not script.exists():
        # fall back to repo-local copy (dev mode)
        repo_script = Path(__file__).resolve().parent / "upgrade.sh"
        if repo_script.exists():
            script = repo_script
        else:
            print(f"ERR: upgrade.sh not found at {script}", file=sys.stderr)
            return 1
    print(f">>> bash {script} --yes")
    return subprocess.call(["bash", str(script), "--yes"])


def _plugin_scope_info(full_name):
    """Return (scope, project_path) for an installed plugin from the registry.

    `claude plugin update` defaults to --scope user; plugins installed at
    local/project scope fail with "not installed at scope user" unless the
    actual scope is passed. local/project scopes also resolve by cwd, so we
    return the projectPath to run the update from.
    """
    reg = PLUGINS_DIR / "installed_plugins.json"
    if not reg.exists():
        return None, None
    try:
        data = json.loads(reg.read_text(encoding="utf-8"))
    except Exception:
        return None, None
    entries = (data.get("plugins") or {}).get(full_name) or []
    if not entries:
        return None, None
    e = entries[0]
    return e.get("scope"), e.get("projectPath")


def _upgrade_plugin_generic(full_name):
    claude = _resolve("claude")
    scope, project_path = _plugin_scope_info(full_name)
    cmd = [claude, "plugin", "update", full_name]
    if scope:
        cmd += ["--scope", scope]
    # local/project scopes resolve by cwd → run from the plugin's project dir
    cwd = None
    if scope in ("local", "project") and project_path and Path(project_path).exists():
        cwd = project_path
    print(">>> " + " ".join(cmd) + (f"   (cwd={cwd})" if cwd else ""))
    return subprocess.call(cmd, cwd=cwd)


def _upgrade_winget(pkg_id):
    winget = _resolve("winget")
    args = [
        winget, "upgrade", "--id", pkg_id,
        "--silent",
        "--accept-source-agreements",
        "--accept-package-agreements",
        "--disable-interactivity",
    ]
    # 상한 가드 — `--disable-interactivity` 는 winget 내부 프롬프트만 막고 OS 의
    # UAC 대화상자는 못 막는다. /cu all 로 머신 스코프 항목을 올리다 권한 상승
    # 창이 뜨면 여기서 무한 대기한다(R2 잔여 경로). 죽이고 안내로 넘긴다.
    #
    # 재시도 1회 — winget 은 설정된 소스 중 하나(예: msstore)가 일시적으로
    # 죽어도 명령 전체를 실패시킨다. 실측: `0x8a15003b Rest API internal error`
    # 로 5건이 전부 exit 59 였고, 같은 명령을 한 번 더 돌리자 통과했다. 한 번의
    # 일시 장애로 그날의 자동 갱신이 통째로 날아가지 않게 한다.
    for attempt in (1, 2):
        print(">>> " + " ".join(args) + (f"   (재시도 {attempt})" if attempt > 1 else ""))
        try:
            rc = subprocess.call(args, timeout=600)
        except subprocess.TimeoutExpired:
            print(f"winget 업그레이드가 600초를 넘겨 중단했습니다 ({pkg_id}) — "
                  "UAC 권한 상승 대기로 보입니다. 관리자 셸에서 직접 실행하세요.",
                  file=sys.stderr)
            return 1
        # 종료코드 규약(0/1/2/3)을 지킨다 — winget 의 원시 코드를 그대로 넘기면
        # 호출자가 해석할 수 없는 값(43, 59 …)이 새어 나간다. 원시 코드는 진단용
        # 으로 출력하고, 반환은 규약 값으로 사상한다.
        if rc == 0:
            return 0
        if _winget_nothing_to_do(rc):
            print(f"winget: 올릴 것 없음 (winget rc={rc})")
            return 0
        if attempt == 2:
            print(f"winget 업그레이드 실패 ({pkg_id}, winget rc={rc})", file=sys.stderr)
            return 1
        print(f"winget exit {rc} — 소스 일시 장애 가능. 한 번 재시도합니다.",
              file=sys.stderr)


def _upgrade_npm(pkg):
    npm = _resolve("npm")
    print(f">>> {npm} install -g {pkg}@latest")
    return subprocess.call([npm, "install", "-g", f"{pkg}@latest"])


def _upgrade_vscode_all():
    code = _find_code()
    if not code:
        print("ERR: code CLI not found", file=sys.stderr)
        return 1
    _, before, _ = run([code, "--list-extensions", "--show-versions"])
    print(f">>> {code} --update-extensions")
    rc = subprocess.call([code, "--update-extensions"])
    _, after, _ = run([code, "--list-extensions", "--show-versions"])
    changed = sorted(set(after.splitlines()) - set(before.splitlines()))
    if changed:
        print("업데이트된 확장:")
        for line in changed:
            print(f"  {line}")
    else:
        print("변경된 확장 없음 (diff 0건)")
    return rc


def _upgrade_brew(name):
    brew = _resolve("brew")
    print(f">>> {brew} upgrade {name}")
    return subprocess.call([brew, "upgrade", name])


def cmd_upgrade(item_id):
    # never 등급은 여기서 무조건 거부한다. /cu all 이든 직접 호출이든 관계없다.
    reason = never_reason(item_id)
    if reason:
        print(f"거부 — never 등급: {reason}")
        print(f"  자동 갱신 대상이 아닙니다. 직접 판단해 실행하세요: {item_id}")
        return 3
    if item_id == "cli:claude":
        return _upgrade_claude()
    if item_id.startswith("plugin:"):
        full_name = item_id[len("plugin:"):]
        if full_name == "lens@CreetaCorp":
            return _upgrade_lens()
        return _upgrade_plugin_generic(full_name)
    if item_id.startswith("winget:"):
        return _upgrade_winget(item_id.split(":", 1)[1])
    if item_id.startswith("npm:"):
        return _upgrade_npm(item_id.split(":", 1)[1])
    if item_id == "vscode:__all__":
        return _upgrade_vscode_all()
    if item_id.startswith("brew:"):
        return _upgrade_brew(item_id.split(":", 1)[1])
    print(f"ERR: unknown id {item_id}", file=sys.stderr)
    return 2


# ---------- Entry ----------

def main():
    if len(sys.argv) < 2:
        print("usage: cu.py scan | cu.py upgrade <id>", file=sys.stderr)
        return 1
    mode = sys.argv[1]
    if mode == "scan":
        return cmd_scan(write_snapshot="--snapshot" in sys.argv[2:])
    if mode == "upgrade":
        if len(sys.argv) < 3:
            print("usage: cu.py upgrade <id>", file=sys.stderr)
            return 1
        return cmd_upgrade(sys.argv[2])
    print(f"unknown mode: {mode}", file=sys.stderr)
    return 1


if __name__ == "__main__":
    sys.exit(main())
