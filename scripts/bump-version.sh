#!/bin/bash
# Lens version bump script
# Usage: ./scripts/bump-version.sh <new_version>
# Example: ./scripts/bump-version.sh 1.8.0

set -e

# Detect GNU vs BSD sed for cross-platform compatibility
if sed --version >/dev/null 2>&1; then
  SEDI=(-i)
else
  SEDI=(-i '')
fi

NEW_VERSION="$1"

if [ -z "$NEW_VERSION" ]; then
  echo "Usage: $0 <new_version>"
  echo "Example: $0 1.8.0"
  exit 1
fi

# Strip leading 'v' if provided
NEW_VERSION="${NEW_VERSION#v}"

# Validate semver format
if ! echo "$NEW_VERSION" | grep -qE '^[0-9]+\.[0-9]+\.[0-9]+$'; then
  echo "Error: Version must be in MAJOR.MINOR.PATCH format (e.g., 1.8.0)"
  exit 1
fi

# Get current version from plugin.json
# Use sed instead of grep -oP for Windows Git Bash compatibility (PCRE locale issue)
CURRENT=$(sed -n 's/.*"version"[[:space:]]*:[[:space:]]*"\([0-9]\+\.[0-9]\+\.[0-9]\+\)".*/\1/p' .claude-plugin/plugin.json | head -1)
echo "Current version: v$CURRENT"
echo "New version:     v$NEW_VERSION"
echo ""

if [ "$CURRENT" = "$NEW_VERSION" ]; then
  echo "Error: New version is the same as current version."
  exit 1
fi

TODAY=$(date +%Y-%m-%d)

echo "=== Updating dual-runtime release metadata ==="

# Regex patterns match ANY v MAJOR.MINOR(.PATCH)? — the patch segment is
# optional so 2-part banners (e.g. "Lens v3.1", "Lens Multi v3.4") are caught
# too. Earlier 3-part-only patterns silently skipped those, leaving the c/cc/cs
# skill banners stuck for several releases.

# 1. .claude-plugin/plugin.json
sed "${SEDI[@]}" -E "s/\"version\": \"[0-9]+\.[0-9]+\.[0-9]+\"/\"version\": \"$NEW_VERSION\"/" .claude-plugin/plugin.json
echo "[1] .claude-plugin/plugin.json"

# 2. .codex-plugin/plugin.json
sed "${SEDI[@]}" -E "s/\"version\": \"[0-9]+\.[0-9]+\.[0-9]+\"/\"version\": \"$NEW_VERSION\"/" .codex-plugin/plugin.json
echo "[2] .codex-plugin/plugin.json"

# 3. .claude-plugin/marketplace.json (version + ref)
sed "${SEDI[@]}" -E "s/\"version\": \"[0-9]+\.[0-9]+\.[0-9]+\"/\"version\": \"$NEW_VERSION\"/" .claude-plugin/marketplace.json
sed "${SEDI[@]}" -E "s/\"ref\": \"v[0-9]+\.[0-9]+\.[0-9]+\"/\"ref\": \"v$NEW_VERSION\"/" .claude-plugin/marketplace.json
echo "[3] .claude-plugin/marketplace.json"

# 3. hooks/hooks.json
sed "${SEDI[@]}" -E "s/Lens v[0-9]+\.[0-9]+\.[0-9]+/Lens v$NEW_VERSION/g" hooks/hooks.json
echo "[4] hooks/hooks.json"

# 4. hooks/session-start.js (multiple occurrences)
sed "${SEDI[@]}" -E "s/Lens v[0-9]+\.[0-9]+\.[0-9]+/Lens v$NEW_VERSION/g" hooks/session-start.js
echo "[5] hooks/session-start.js"

# 5b. Canonical dual-runtime skill entry points
find skills -mindepth 2 -maxdepth 2 -name SKILL.md -exec \
  sed "${SEDI[@]}" -E "s/v[0-9]+\.[0-9]+\.[0-9]+/v$NEW_VERSION/g" {} \;
echo "[6] skills/*/SKILL.md"

# 5. skills/c/SKILL.md
sed "${SEDI[@]}" -E "s/Lens v[0-9]+\.[0-9]+(\.[0-9]+)?/Lens v$NEW_VERSION/g" skills/c/references/claude-workflow.md
echo "[7] skills/c/reference"

# 6. skills/cc/SKILL.md
sed "${SEDI[@]}" -E "s/Lens Multi v[0-9]+\.[0-9]+(\.[0-9]+)?/Lens Multi v$NEW_VERSION/g" skills/cc/references/claude-workflow.md
echo "[8] skills/cc/reference"

# 7. skills/cp/SKILL.md
sed "${SEDI[@]}" -E "s/Lens Plan v[0-9]+\.[0-9]+(\.[0-9]+)?/Lens Plan v$NEW_VERSION/g" skills/cp/references/claude-workflow.md
echo "[9] skills/cp/reference"


# 7c. skills/ccp/SKILL.md (Lens Power Verify banner — distinct prefix)
sed "${SEDI[@]}" -E "s/Lens Power Verify v[0-9]+\.[0-9]+(\.[0-9]+)?/Lens Power Verify v$NEW_VERSION/g" skills/ccp/references/claude-workflow.md
echo "[10] skills/ccp/reference"

# 8. skills/cs/SKILL.md (banner + "currently X.Y.Z" prose)
sed "${SEDI[@]}" -E "s/Lens Sync v[0-9]+\.[0-9]+(\.[0-9]+)?/Lens Sync v$NEW_VERSION/g" skills/cs/references/claude-workflow.md
sed "${SEDI[@]}" -E "s/currently [0-9]+\.[0-9]+\.[0-9]+/currently $NEW_VERSION/g" skills/cs/references/claude-workflow.md
echo "[11] skills/cs/reference"

# 8b. skills/ci/SKILL.md (Creeta Install banner in the table row)
sed "${SEDI[@]}" -E "s/Creeta Install v[0-9]+\.[0-9]+(\.[0-9]+)?/Creeta Install v$NEW_VERSION/g" skills/ci/references/claude-workflow.md
echo "[12] skills/ci/reference"

# 9. CLAUDE.md (Current version + Updated date)
sed "${SEDI[@]}" -E "s/Current: \*\*v[0-9]+\.[0-9]+\.[0-9]+\*\*/Current: **v$NEW_VERSION**/" CLAUDE.md
sed "${SEDI[@]}" -E "s/Updated: [0-9]{4}-[0-9]{2}-[0-9]{2}/Updated: $TODAY/" CLAUDE.md
echo "[13] CLAUDE.md"

# 10. README.md (title)
sed "${SEDI[@]}" -E "s/^# Lens v[0-9]+\.[0-9]+\.[0-9]+/# Lens v$NEW_VERSION/" README.md
echo "[14] README.md"

# 11. AGENTS.md (Codex repository briefing)
sed "${SEDI[@]}" -E "s/Current release: \*\*v[0-9]+\.[0-9]+\.[0-9]+\*\*/Current release: **v$NEW_VERSION**/" AGENTS.md
echo "[15] AGENTS.md"

# 10. CHANGELOG.md - prepend new section header (user fills in details).
# Uses awk because git-bash sed can choke on multi-line substitutions.
awk -v ver="$NEW_VERSION" -v today="$TODAY" '
NR==1 {
  print "## [" ver "] - " today
  print ""
  print "### Added (v" ver ")"
  print ""
  print "### Changed (v" ver ")"
  print ""
  print "### Fixed (v" ver ")"
  print ""
}
{ print }
' CHANGELOG.md > CHANGELOG.md.tmp && mv CHANGELOG.md.tmp CHANGELOG.md
echo "[--] CHANGELOG.md (template added - fill in details)"

echo ""
echo "=== Verification ==="

# Check new version appears in all files
COUNT=$(grep -rl "v$NEW_VERSION\|\"$NEW_VERSION\"" \
  .claude-plugin/plugin.json \
  .codex-plugin/plugin.json \
  .claude-plugin/marketplace.json \
  hooks/hooks.json \
  hooks/session-start.js \
  skills/c/SKILL.md \
  skills/cc/SKILL.md \
  skills/cp/SKILL.md \
  skills/ccp/SKILL.md \
  skills/cs/SKILL.md \
  skills/ci/SKILL.md \
  CLAUDE.md \
  AGENTS.md \
  README.md \
  CHANGELOG.md 2>/dev/null | wc -l)

echo "Version-bearing release files found: $COUNT"

# Check only release metadata and the current banners. Behavioral references
# legitimately discuss historical versions, so recursively grepping all skill
# prose creates permanent false positives.
CURRENT_LINES=$(
  {
    grep -hE '"version":|"ref": "v|Lens v' \
      .claude-plugin/plugin.json \
      .codex-plugin/plugin.json \
      .claude-plugin/marketplace.json \
      hooks/hooks.json \
      hooks/session-start.js
    find skills -mindepth 2 -maxdepth 2 -name SKILL.md -exec head -n 5 {} \;
    head -n 12 skills/c/references/claude-workflow.md
    head -n 12 skills/cc/references/claude-workflow.md
    head -n 12 skills/cp/references/claude-workflow.md
    head -n 12 skills/ccp/references/claude-workflow.md
    head -n 12 skills/cs/references/claude-workflow.md
    head -n 12 skills/ci/references/claude-workflow.md
    grep -hE '^# Lens v|Current: \*\*v|Current release: \*\*v' README.md CLAUDE.md AGENTS.md
  } 2>/dev/null
)
STALE=$(printf '%s\n' "$CURRENT_LINES" \
  | grep -oE "v?[0-9]+\.[0-9]+\.[0-9]+" \
  | sed 's/^/v/' \
  | sed 's/^vv/v/' \
  | sort -u \
  | grep -v "^v$NEW_VERSION$" || true)

if [ -n "$STALE" ]; then
  echo ""
  echo "WARNING: stale version strings still found:"
  echo "$STALE"
  echo ""
  echo "Inspect the release metadata and current banner lines listed above."
else
  echo "Stale versions: clean (all references are v$NEW_VERSION)"
fi

echo ""
echo "=== Next steps ==="
echo "1. Edit CHANGELOG.md - fill in Added/Changed/Fixed details"
echo "2. git add -A && git commit -m \"chore: bump version to v$NEW_VERSION\""
echo "3. git tag v$NEW_VERSION"
echo "4. git push origin master --tags"
echo "5. gh release create v$NEW_VERSION --title \"v$NEW_VERSION — ...\" --latest"
