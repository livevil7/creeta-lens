#!/usr/bin/env node
/**
 * Lens - Install Sync (/ci backend)
 * Deterministic diff + dry-run + manifest management for the /ci skill.
 *
 * A per-user manifest at ~/.claude/lens/manifest.json (Claude Code) or
 * ~/.codex/lens/manifest.json (Codex) declares which plugins SHOULD be
 * installed and which SHOULD be removed. This module diffs that manifest
 * against the selected host's actual install state and
 * classifies every plugin into one of four buckets:
 *
 *   toInstall - in manifest.plugins but not installed (+ missing marketplaces)
 *   toRemove  - in manifest.excluded AND installed (the ONLY removal candidates)
 *   foreign   - installed but not in manifest.plugins nor excluded (report only)
 *   ok        - in manifest.plugins AND installed
 *
 * Safety model (Constitution): manifest-absent plugins are NEVER auto-removed;
 * they surface as `foreign` and are reported, never uninstalled. `lens@CreetaCorp`
 * (self) is hard-guarded out of toRemove/foreign so /ci can never uninstall Lens.
 *
 * This file only READS install state and reads/writes the manifest. It never
 * runs plugin install/remove commands — that is the SKILL.md's job.
 *
 * Usage:
 *   node lib/install-sync.js --runtime claude|codex --manifest-path
 *   node lib/install-sync.js --list-installed [--json]  list installed plugin ids
 *   node lib/install-sync.js --dry-run [--json]         4-bucket preview (installs/removes NOTHING)
 *   node lib/install-sync.js --list-manifest [--json]   show manifest contents
 *   node lib/install-sync.js --add <spec> [what]        add plugin to manifest.plugins
 *   node lib/install-sync.js --remove <spec>            move plugin plugins->excluded
 *
 * Cross-platform: Windows (Git Bash) + macOS + Linux. os.homedir() based paths.
 */

'use strict';

const fs = require('fs');
const os = require('os');
const path = require('path');
const { spawnSync } = require('child_process');

const CLAUDE_HOME = process.env.CLAUDE_HOME || path.join(os.homedir(), '.claude');
const CODEX_HOME = process.env.CODEX_HOME || path.join(os.homedir(), '.codex');
const LENS_DIR = path.join(CLAUDE_HOME, 'lens');
const MANIFEST_PATH = path.join(LENS_DIR, 'manifest.json');
const PLUGINS_DIR = path.join(CLAUDE_HOME, 'plugins');
const REGISTRY_PATH = path.join(PLUGINS_DIR, 'installed_plugins.json');

const SELF_SPEC = 'lens@CreetaCorp';

const EMPTY_MANIFEST = {
  $schema: 'lens-install-manifest/v1',
  marketplaces: {},
  plugins: [],
  deps: {},
  excluded: {},
};

// ---------- self-protection ----------

/** A spec is Lens itself if it is lens@CreetaCorp or any id whose name is `lens`. */
function isSelf(spec) {
  if (!spec) return false;
  const name = String(spec).split('@', 1)[0];
  return spec === SELF_SPEC || name === 'lens';
}

// ---------- CLI resolution (ported from cu.py _resolve) ----------

/**
 * Resolve an executable to a full path. On Windows, spawn without shell cannot
 * find a .cmd shim, so we probe the standard extensions against PATH entries.
 */
function resolveExe(exe) {
  const isWin = process.platform === 'win32';
  const exts = isWin
    ? (process.env.PATHEXT || '.COM;.EXE;.BAT;.CMD').split(';').filter(Boolean)
    : [''];
  const dirs = (process.env.PATH || '').split(path.delimiter).filter(Boolean);
  for (const dir of dirs) {
    for (const ext of exts) {
      const candidate = path.join(dir, exe + ext);
      try {
        if (fs.existsSync(candidate) && fs.statSync(candidate).isFile()) return candidate;
      } catch { /* ignore */ }
    }
  }
  return exe; // fall back to bare name; spawn may still resolve it
}

function normalizeRuntime(runtime) {
  const value = String(runtime || process.env.LENS_RUNTIME || 'claude').toLowerCase();
  if (value !== 'claude' && value !== 'codex') {
    throw new Error(`Unsupported runtime "${value}" (expected claude or codex)`);
  }
  return value;
}

function getManifestPath(runtime) {
  return path.join(normalizeRuntime(runtime) === 'codex' ? CODEX_HOME : CLAUDE_HOME, 'lens', 'manifest.json');
}

function resolveCodexExe() {
  if (process.env.CODEX_CLI_PATH && fs.existsSync(process.env.CODEX_CLI_PATH)) {
    return process.env.CODEX_CLI_PATH;
  }

  // Codex Desktop exposes the executable path to bundled tools through its
  // config. Reading this literal is safer on Windows than the WindowsApps alias,
  // which can exist on PATH but reject direct child-process execution.
  const configPath = path.join(CODEX_HOME, 'config.toml');
  try {
    const config = fs.readFileSync(configPath, 'utf8');
    const match = config.match(/CODEX_CLI_PATH\s*=\s*['"]([^'"]+)['"]/);
    if (match && fs.existsSync(match[1])) return match[1];
  } catch { /* use PATH fallback */ }

  return resolveExe('codex');
}

function runHostCli(executable, args) {
  const resolved = executable;
  // On Windows, `claude` resolves to a .cmd/.bat shim which spawnSync cannot
  // exec directly (EINVAL) without a shell. Use shell:true there, quoting the
  // exe path so spaces survive. On POSIX, spawn the resolved binary directly.
  const isWin = process.platform === 'win32';
  const useShell = isWin && /\.(cmd|bat)$/i.test(resolved);
  try {
    let p;
    if (useShell) {
      const quoted = [`"${resolved}"`, ...args.map((a) => `"${a}"`)].join(' ');
      p = spawnSync(quoted, {
        encoding: 'utf-8', timeout: 120000, windowsHide: true, shell: true,
      });
    } else {
      p = spawnSync(resolved, args, {
        encoding: 'utf-8', timeout: 120000, windowsHide: true,
      });
    }
    if (p.error) return { rc: 127, out: '', err: String(p.error.message || p.error) };
    return { rc: p.status == null ? 1 : p.status, out: (p.stdout || '').trim(), err: (p.stderr || '').trim() };
  } catch (e) {
    return { rc: 127, out: '', err: String(e.message || e) };
  }
}

function runClaude(args) {
  return runHostCli(resolveExe('claude'), args);
}

function runCodex(args) {
  return runHostCli(resolveCodexExe(), args);
}

// ---------- manifest loader ----------

/**
 * Read ~/.claude/lens/manifest.json. If absent, create an empty template and
 * return it. JSON parse failure throws a clear error (with the offending path).
 */
function loadManifest(manifestPath = MANIFEST_PATH) {
  if (!fs.existsSync(manifestPath)) {
    fs.mkdirSync(path.dirname(manifestPath), { recursive: true });
    writeManifest(EMPTY_MANIFEST, manifestPath);
    return { manifest: clone(EMPTY_MANIFEST), created: true };
  }
  let raw;
  try {
    raw = fs.readFileSync(manifestPath, 'utf-8');
  } catch (e) {
    throw new Error(`Cannot read manifest at ${manifestPath}: ${e.message}`);
  }
  let data;
  try {
    data = JSON.parse(raw);
  } catch (e) {
    throw new Error(`Invalid JSON in manifest ${manifestPath}: ${e.message}`);
  }
  // Fill any missing top-level keys so downstream code never crashes on drift.
  const manifest = Object.assign(clone(EMPTY_MANIFEST), data);
  if (!Array.isArray(manifest.plugins)) manifest.plugins = [];
  if (!manifest.marketplaces || typeof manifest.marketplaces !== 'object') manifest.marketplaces = {};
  if (!manifest.excluded || typeof manifest.excluded !== 'object') manifest.excluded = {};
  if (!manifest.deps || typeof manifest.deps !== 'object') manifest.deps = {};
  return { manifest, created: false };
}

/** Atomic write: temp file in the same dir, then rename over the target. */
function writeManifest(manifest, manifestPath = MANIFEST_PATH) {
  fs.mkdirSync(path.dirname(manifestPath), { recursive: true });
  const tmp = manifestPath + '.tmp-' + process.pid;
  fs.writeFileSync(tmp, JSON.stringify(manifest, null, 2) + '\n', 'utf-8');
  fs.renameSync(tmp, manifestPath);
}

function clone(o) {
  return JSON.parse(JSON.stringify(o));
}

// ---------- installed-state collection ----------

/** Parse installed_plugins.json (cu.py fallback path). Returns array of {id, installPath, version, scope}. */
function readRegistry(registryPath = REGISTRY_PATH) {
  if (!fs.existsSync(registryPath)) return [];
  let data;
  try {
    data = JSON.parse(fs.readFileSync(registryPath, 'utf-8'));
  } catch {
    return [];
  }
  const out = [];
  for (const [fullName, entries] of Object.entries(data.plugins || {})) {
    if (!entries || !entries.length) continue;
    const e = entries[0];
    out.push({
      id: fullName,
      version: e.version || null,
      scope: e.scope || null,
      installPath: e.installPath || null,
    });
  }
  return out;
}

/** Parse the (non-JSON) `claude plugin marketplace list` output → array of marketplace names. */
function parseMarketplaceList(text) {
  const names = [];
  for (const line of text.split(/\r?\n/)) {
    // Lines look like:  "  ❯ CreetaCorp"  — the name is the last whitespace token.
    const m = line.match(/^\s*[❯>*]\s+(\S.*?)\s*$/);
    if (m) names.push(m[1].trim());
  }
  return names;
}

/**
 * Collect install state. Primary: `claude plugin list --json`
 * ([{id,version,scope,enabled,installPath}]). Fallback: installed_plugins.json.
 * Marketplaces come from `claude plugin marketplace list` (text-parsed).
 */
function readInstalled(runtime = 'claude') {
  runtime = normalizeRuntime(runtime);
  if (runtime === 'codex') return readInstalledCodex();

  let plugins = [];
  let source = 'registry';

  const listed = runClaude(['plugin', 'list', '--json']);
  if (listed.rc === 0 && listed.out) {
    try {
      const arr = JSON.parse(listed.out);
      if (Array.isArray(arr) && arr.length) {
        plugins = arr.map((p) => ({
          id: p.id,
          version: p.version || null,
          scope: p.scope || null,
          installPath: p.installPath || null,
        }));
        source = 'cli';
      }
    } catch { /* fall through to registry */ }
  }
  if (!plugins.length) {
    plugins = readRegistry();
    source = 'registry';
  }

  let marketplaces = [];
  const mkt = runClaude(['plugin', 'marketplace', 'list']);
  if (mkt.rc === 0 && mkt.out) marketplaces = parseMarketplaceList(mkt.out);

  return { plugins, marketplaces, source };
}

function parseCodexPluginList(text) {
  try {
    const data = JSON.parse(text);
    const entries = Array.isArray(data) ? data : data.installed;
    if (!Array.isArray(entries)) return [];
    return entries
      .filter((p) => p && p.installed !== false && p.pluginId)
      .map((p) => ({
        id: p.pluginId,
        version: p.version || null,
        scope: 'user',
        installPath: p.source?.source === 'local' ? p.source.path || null : null,
        enabled: p.enabled !== false,
        marketplace: p.marketplaceName || null,
        marketplaceSource: p.marketplaceSource || null,
      }));
  } catch {
    return [];
  }
}

function parseCodexMarketplaceList(text) {
  try {
    const data = JSON.parse(text);
    const entries = Array.isArray(data) ? data : data.marketplaces;
    return Array.isArray(entries)
      ? entries.filter((m) => m && m.name).map((m) => m.name)
      : [];
  } catch {
    return [];
  }
}

function readInstalledCodex() {
  const listed = runCodex(['plugin', 'list', '--json']);
  const plugins = listed.rc === 0 ? parseCodexPluginList(listed.out) : [];
  const mkt = runCodex(['plugin', 'marketplace', 'list', '--json']);
  const marketplaces = mkt.rc === 0 ? parseCodexMarketplaceList(mkt.out) : [];
  return { plugins, marketplaces, source: listed.rc === 0 ? 'codex-cli' : 'unavailable' };
}

// ---------- diff engine ----------

/** Marketplace part of a `<name>@<marketplace>` spec, or null. */
function marketplaceOf(spec) {
  const at = String(spec).indexOf('@');
  return at >= 0 ? spec.slice(at + 1) : null;
}

/**
 * Classify every plugin into toInstall / toRemove / foreign / ok.
 *
 * Safety:
 *   - toRemove is ONLY manifest.excluded ∩ installed.
 *   - foreign is installed − managed − excluded (report only, never removed).
 *   - lens (self) is hard-guarded out of toRemove and foreign.
 */
function diff(manifest, installed) {
  const installedIds = new Set(installed.plugins.map((p) => p.id));
  const installedByIdInfo = new Map(installed.plugins.map((p) => [p.id, p]));
  const marketplacesInstalled = new Set(installed.marketplaces || []);

  const managed = (manifest.plugins || [])
    .map((p) => (typeof p === 'string' ? { spec: p } : p))
    .filter((p) => p && p.spec);
  const managedSpecs = new Set(managed.map((p) => p.spec));
  const excludedSpecs = Object.keys(manifest.excluded || {});
  const excludedSet = new Set(excludedSpecs);

  // toInstall: managed but not installed. Also flag the marketplace if unregistered.
  const toInstall = [];
  for (const p of managed) {
    if (installedIds.has(p.spec)) continue;
    const mkt = marketplaceOf(p.spec);
    const mktName = mkt || null;
    const needsMarketplace = mktName && !marketplacesInstalled.has(mktName);
    toInstall.push({
      spec: p.spec,
      what: p.what || null,
      marketplace: mktName,
      marketplaceSource: (manifest.marketplaces || {})[mktName] || null,
      needsMarketplace: !!needsMarketplace,
    });
  }

  // toRemove: excluded ∩ installed, EXCEPT self.
  const toRemove = [];
  for (const spec of excludedSpecs) {
    if (isSelf(spec)) continue;
    if (!installedIds.has(spec)) continue;
    const info = installedByIdInfo.get(spec) || {};
    toRemove.push({
      spec,
      reason: manifest.excluded[spec] || '',
      installPath: info.installPath || null,
      scope: info.scope || null,
    });
  }

  // foreign: installed − managed − excluded − self.
  const foreign = [];
  for (const p of installed.plugins) {
    if (managedSpecs.has(p.id)) continue;
    if (excludedSet.has(p.id)) continue;
    if (isSelf(p.id)) continue;
    foreign.push({ spec: p.id, version: p.version || null, installPath: p.installPath || null });
  }

  // ok: managed ∩ installed.
  const ok = [];
  for (const p of managed) {
    if (installedIds.has(p.spec)) ok.push({ spec: p.spec, what: p.what || null });
  }

  return { toInstall, toRemove, foreign, ok };
}

// ---------- preview render ----------

function preview(d, asJson) {
  if (asJson) return JSON.stringify(d, null, 2);
  const lines = [];
  const fmtInstall = (i) =>
    i.spec + (i.needsMarketplace ? `  (+marketplace ${i.marketplace})` : '') + (i.what ? `  — ${i.what}` : '');
  const fmtRemove = (r) => `${r.spec}  (excluded: "${r.reason || ''}")`;
  const fmtForeign = (f) => f.spec + (f.version ? `  (v${f.version})` : '');
  const fmtOk = (o) => o.spec;

  lines.push(`설치할 것 (${d.toInstall.length}):`);
  d.toInstall.forEach((i) => lines.push('   • ' + fmtInstall(i)));
  lines.push('');
  lines.push(`제거할 것 (${d.toRemove.length}):   ← 백업 + 항목별 확인 후`);
  d.toRemove.forEach((r) => lines.push('   • ' + fmtRemove(r)));
  lines.push('');
  lines.push(`목록 밖 · 그대로 둠 (${d.foreign.length}):   ← 지우려면 manifest.excluded 에 추가`);
  d.foreign.forEach((f) => lines.push('   • ' + fmtForeign(f)));
  lines.push('');
  lines.push(`이미 맞음 (${d.ok.length}):`);
  d.ok.forEach((o) => lines.push('   • ' + fmtOk(o)));
  return lines.join('\n');
}

// ---------- manifest editing ----------

/** Add a plugin spec to manifest.plugins (no-op if already present). */
function addPlugin(spec, what, manifestPath = MANIFEST_PATH) {
  const { manifest } = loadManifest(manifestPath);
  const exists = (manifest.plugins || []).some((p) => (typeof p === 'string' ? p : p.spec) === spec);
  if (!exists) {
    manifest.plugins.push(what ? { spec, what } : { spec });
    // If it was previously excluded, un-exclude it (add wins over prior removal).
    if (manifest.excluded && manifest.excluded[spec]) delete manifest.excluded[spec];
    writeManifest(manifest, manifestPath);
  }
  return manifest;
}

/** Move a plugin from manifest.plugins into manifest.excluded (queues removal). */
function removePlugin(spec, reason, manifestPath = MANIFEST_PATH) {
  const { manifest } = loadManifest(manifestPath);
  manifest.plugins = (manifest.plugins || []).filter(
    (p) => (typeof p === 'string' ? p : p.spec) !== spec
  );
  if (!manifest.excluded) manifest.excluded = {};
  manifest.excluded[spec] = reason || 'removed via /ci remove';
  writeManifest(manifest, manifestPath);
  return manifest;
}

/** Mark a plugin excluded without requiring it to be in plugins[]. */
function excludePlugin(spec, reason, manifestPath = MANIFEST_PATH) {
  return removePlugin(spec, reason, manifestPath);
}

// ---------- CLI ----------

function main(argv) {
  const args = argv.slice(2);
  const asJson = args.includes('--json');
  const has = (f) => args.includes(f);
  const valAfter = (f) => {
    const i = args.indexOf(f);
    return i >= 0 && i + 1 < args.length ? args[i + 1] : null;
  };

  let runtime;
  try {
    runtime = normalizeRuntime(valAfter('--runtime'));
  } catch (err) {
    console.error('ERR: ' + err.message);
    return 1;
  }

  // Allow a custom manifest path for testing / non-default homes.
  const manifestPath = valAfter('--manifest-path-file') || getManifestPath(runtime);

  if (has('--manifest-path')) {
    const { manifest, created } = loadManifest(manifestPath);
    void manifest;
    console.log(manifestPath + (created ? '  (created empty template)' : ''));
    return 0;
  }

  if (has('--list-manifest')) {
    const { manifest } = loadManifest(manifestPath);
    if (asJson) {
      console.log(JSON.stringify(manifest, null, 2));
    } else {
      const specs = (manifest.plugins || []).map((p) => (typeof p === 'string' ? p : p.spec));
      console.log('plugins:  ' + (specs.join(', ') || '(none)'));
      console.log('excluded: ' + (Object.keys(manifest.excluded || {}).join(', ') || '(none)'));
    }
    return 0;
  }

  if (has('--add')) {
    const spec = valAfter('--add');
    if (!spec) { console.error('ERR: --add requires <spec>'); return 1; }
    // Optional [what]: the first positional arg after <spec> that is not a flag.
    const idx = args.indexOf('--add');
    const what = args[idx + 2] && !args[idx + 2].startsWith('--') ? args[idx + 2] : null;
    addPlugin(spec, what, manifestPath);
    console.log(`added ${spec} to manifest.plugins`);
    return 0;
  }

  if (has('--remove')) {
    const spec = valAfter('--remove');
    if (!spec) { console.error('ERR: --remove requires <spec>'); return 1; }
    removePlugin(spec, null, manifestPath);
    console.log(`moved ${spec} from plugins → excluded`);
    return 0;
  }

  if (has('--list-installed')) {
    const installed = readInstalled(runtime);
    if (asJson) {
      console.log(JSON.stringify(installed, null, 2));
    } else {
      console.log('source: ' + installed.source);
      console.log('plugins: ' + installed.plugins.map((p) => p.id).join(', '));
      console.log('marketplaces: ' + installed.marketplaces.join(', '));
    }
    return 0;
  }

  if (has('--dry-run')) {
    const { manifest } = loadManifest(manifestPath);
    const installed = readInstalled(runtime);
    const d = diff(manifest, installed);
    console.log(preview(d, asJson));
    return 0;
  }

  console.error(
    'usage: install-sync.js [--runtime claude|codex] --manifest-path | --list-installed [--json] | ' +
    '--dry-run [--json] | --list-manifest [--json] | --add <spec> [what] | --remove <spec>'
  );
  return 1;
}

if (require.main === module) {
  process.exit(main(process.argv));
}

module.exports = {
  MANIFEST_PATH,
  getManifestPath,
  normalizeRuntime,
  EMPTY_MANIFEST,
  isSelf,
  loadManifest,
  writeManifest,
  readRegistry,
  parseMarketplaceList,
  parseCodexPluginList,
  parseCodexMarketplaceList,
  readInstalled,
  diff,
  preview,
  addPlugin,
  removePlugin,
  excludePlugin,
};
