#!/bin/bash
# Lens version bump script
# Usage: ./scripts/bump-version.sh <new_version>
# Example: ./scripts/bump-version.sh 1.8.0

set -e

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
CURRENT=$(grep -oP '"version": "\K[^"]+' .claude-plugin/plugin.json)
echo "Current version: v$CURRENT"
echo "New version:     v$NEW_VERSION"
echo ""

if [ "$CURRENT" = "$NEW_VERSION" ]; then
  echo "Error: New version is the same as current version."
  exit 1
fi

TODAY=$(date +%Y-%m-%d)

echo "=== Updating 9 files ==="

# 1. .claude-plugin/plugin.json
sed -i "s/\"version\": \"$CURRENT\"/\"version\": \"$NEW_VERSION\"/" .claude-plugin/plugin.json
echo "[1/9] .claude-plugin/plugin.json"

# 2. .claude-plugin/marketplace.json (version + ref)
sed -i "s/\"version\": \"$CURRENT\"/\"version\": \"$NEW_VERSION\"/" .claude-plugin/marketplace.json
sed -i "s/\"ref\": \"v$CURRENT\"/\"ref\": \"v$NEW_VERSION\"/" .claude-plugin/marketplace.json
echo "[2/9] .claude-plugin/marketplace.json"

# 3. hooks/hooks.json
sed -i "s/Lens v$CURRENT/Lens v$NEW_VERSION/g" hooks/hooks.json
echo "[3/9] hooks/hooks.json"

# 4. hooks/session-start.js (4 occurrences)
sed -i "s/Lens v$CURRENT/Lens v$NEW_VERSION/g" hooks/session-start.js
echo "[4/9] hooks/session-start.js"

# 5. skills/c/SKILL.md
sed -i "s/Lens v$CURRENT/Lens v$NEW_VERSION/g" skills/c/SKILL.md
echo "[5/9] skills/c/SKILL.md"

# 6. skills/cc/SKILL.md
sed -i "s/Lens Multi v$CURRENT/Lens Multi v$NEW_VERSION/g" skills/cc/SKILL.md
echo "[6/9] skills/cc/SKILL.md"

# 7. skills/cp/SKILL.md
sed -i "s/Lens Plan v$CURRENT/Lens Plan v$NEW_VERSION/g" skills/cp/SKILL.md
echo "[7/9] skills/cp/SKILL.md"

# 8. CLAUDE.md (Current version + add to Recent Changes)
sed -i "s/Current: \*\*v$CURRENT\*\*/Current: **v$NEW_VERSION**/" CLAUDE.md
sed -i "s/Updated: [0-9]\{4\}-[0-9]\{2\}-[0-9]\{2\}/Updated: $TODAY/" CLAUDE.md
echo "[8/9] CLAUDE.md"

# 9. CHANGELOG.md - prepend new section header (user fills in details)
CHANGELOG_HEADER="## [$NEW_VERSION] - $TODAY\n\n### Added (v$NEW_VERSION)\n\n### Changed (v$NEW_VERSION)\n\n### Fixed (v$NEW_VERSION)\n"
sed -i "1s/^/$(echo -e "$CHANGELOG_HEADER")\n/" CHANGELOG.md
echo "[9/9] CHANGELOG.md (template added - fill in details)"

echo ""
echo "=== Verification ==="

# Check new version appears in all files
COUNT=$(grep -rl "v$NEW_VERSION\|\"$NEW_VERSION\"" \
  .claude-plugin/plugin.json \
  .claude-plugin/marketplace.json \
  hooks/hooks.json \
  hooks/session-start.js \
  skills/c/SKILL.md \
  skills/cc/SKILL.md \
  skills/cp/SKILL.md \
  CLAUDE.md \
  CHANGELOG.md 2>/dev/null | wc -l)

echo "Files with v$NEW_VERSION: $COUNT/9"

# Check old version remnants (excluding CHANGELOG and docs)
OLD_COUNT=$(grep -rl "v$CURRENT\|\"$CURRENT\"" \
  .claude-plugin/ hooks/ skills/ CLAUDE.md 2>/dev/null | wc -l)

if [ "$OLD_COUNT" -gt 0 ]; then
  echo ""
  echo "WARNING: Old version v$CURRENT still found in:"
  grep -rl "v$CURRENT\|\"$CURRENT\"" .claude-plugin/ hooks/ skills/ CLAUDE.md 2>/dev/null
else
  echo "Old version v$CURRENT: clean (0 remnants)"
fi

echo ""
echo "=== Next steps ==="
echo "1. Edit CHANGELOG.md - fill in Added/Changed/Fixed details"
echo "2. git add -A && git commit -m \"chore: bump version to v$NEW_VERSION\""
echo "3. git tag v$NEW_VERSION"
echo "4. git push origin master --tags"
echo "5. gh release create v$NEW_VERSION --title \"v$NEW_VERSION — ...\" --latest"
