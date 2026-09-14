/**
 * Shared helpers for Claude Code hooks.
 *
 * Hook failures should never block a Claude Code session. These helpers keep
 * stdin parsing, JSON output, and filesystem reads fail-soft and consistent.
 */

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

function installFailSoftHandlers(label) {
  const name = label || 'lens-hook';
  process.on('uncaughtException', (err) => {
    safeLog(`${name} uncaught exception: ${err.message}`);
    writeJson({});
    process.exit(0);
  });
  process.on('unhandledRejection', (err) => {
    const message = err && err.message ? err.message : String(err);
    safeLog(`${name} unhandled rejection: ${message}`);
    writeJson({});
    process.exit(0);
  });
}

function safeLog(message) {
  try {
    process.stderr.write(`[lens] ${message}\n`);
  } catch {}
}

function writeJson(value) {
  try {
    process.stdout.write(`${JSON.stringify(value || {})}\n`);
  } catch {
    try { process.stdout.write('{}\n'); } catch {}
  }
}

function readJsonInput() {
  if (process.env.CLAUDE_HOOK_INPUT) {
    const parsed = parseJson(process.env.CLAUDE_HOOK_INPUT);
    if (parsed) return parsed;
  }

  if (process.argv[2]) {
    const parsed = parseJson(process.argv[2]);
    return parsed || { userMessage: process.argv[2] };
  }

  if (!hasReadableStdin()) return {};

  try {
    const data = fs.readFileSync(0, 'utf-8').trim();
    if (!data) return {};
    return parseJson(data) || {};
  } catch {
    return {};
  }
}

function hasReadableStdin() {
  try {
    if (process.stdin.isTTY) return false;
    // On Windows, PowerShell pipes may not report as FIFO via fstatSync(0).
    // If stdin is not a TTY, readFileSync(0) returns promptly in Claude hooks
    // and in normal shell pipelines.
    return true;
  } catch {
    return false;
  }
}

function parseJson(text) {
  try {
    return JSON.parse(text);
  } catch {
    return null;
  }
}

function safeReadJson(filePath, fallback = null) {
  try {
    if (!filePath || !fs.existsSync(filePath)) return fallback;
    return JSON.parse(fs.readFileSync(filePath, 'utf-8'));
  } catch {
    return fallback;
  }
}

function safeEnsureDir(dirPath) {
  try {
    if (!dirPath) return false;
    if (!fs.existsSync(dirPath)) fs.mkdirSync(dirPath, { recursive: true });
    return true;
  } catch {
    return false;
  }
}

function safeWriteJson(filePath, data, { atomic = true } = {}) {
  try {
    const dir = path.dirname(filePath);
    if (!safeEnsureDir(dir)) return false;
    const payload = JSON.stringify(data, null, 2);
    if (!atomic) {
      fs.writeFileSync(filePath, payload, 'utf-8');
      return true;
    }
    const tempPath = `${filePath}.${process.pid}.${Date.now()}.${crypto.randomBytes(3).toString('hex')}.tmp`;
    try {
      fs.writeFileSync(tempPath, payload, 'utf-8');
      fs.renameSync(tempPath, filePath);
    } finally {
      // A failed rename (Windows EPERM on a locked target) used to leave the temp
      // behind — 37~40 `.tmp` files accumulated in one `.lens/` (v3.39).
      try { if (fs.existsSync(tempPath)) fs.unlinkSync(tempPath); } catch {}
    }
    return true;
  } catch {
    try {
      fs.writeFileSync(filePath, JSON.stringify(data, null, 2), 'utf-8');
      return true;
    } catch {
      return false;
    }
  }
}

function sleepMs(ms) {
  try {
    Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, ms);
  } catch {
    const until = Date.now() + ms;
    while (Date.now() < until) {}
  }
}

function withFileLock(lockPath, fn, { timeoutMs = 1500, staleMs = 30000 } = {}) {
  const start = Date.now();
  safeEnsureDir(path.dirname(lockPath));

  while (Date.now() - start < timeoutMs) {
    let fd = null;
    try {
      fd = fs.openSync(lockPath, 'wx');
      fs.writeFileSync(fd, `${process.pid}\n${new Date().toISOString()}\n`, 'utf-8');
      try {
        return fn();
      } finally {
        try { fs.closeSync(fd); } catch {}
        try { fs.unlinkSync(lockPath); } catch {}
      }
    } catch (err) {
      if (fd !== null) {
        try { fs.closeSync(fd); } catch {}
      }

      if (err && err.code === 'EEXIST') {
        try {
          const ageMs = Date.now() - fs.statSync(lockPath).mtimeMs;
          if (ageMs > staleMs) fs.unlinkSync(lockPath);
        } catch {}
        sleepMs(25);
        continue;
      }
      throw err;
    }
  }

  throw new Error(`Timed out waiting for lock: ${lockPath}`);
}

/**
 * The repository a hook is acting for (v3.39).
 *
 * Every hook used `CLAUDE_PROJECT_DIR || process.cwd()`. In a workspace session
 * (VS Code opened on a folder of 20+ repos) both point at the workspace, not at
 * the repo being worked on — measured 2026-09-14: the plan-doc hook looked for
 * `Documents/Git/.lens/report-shown.json` while the record sat in
 * `creeta-lens/.lens/`, and repeated "띄워라" on ten consecutive edits; the Stop
 * gate read an empty `.lens/gates` and silently passed.
 *
 * Order: the file being acted on (a `docs/tasks|history|rules/` path names its
 * repo exactly; otherwise its git toplevel) → the git toplevel of the hook's cwd
 * → CLAUDE_PROJECT_DIR → cwd. The home directory is never treated as a repo.
 */
function resolveProjectRoot({ filePath, cwd } = {}) {
  const home = path.resolve(require('os').homedir());
  const findRepo = start => {
    let dir = path.resolve(start);
    for (;;) {
      if (dir === home) return null;
      try { if (fs.existsSync(path.join(dir, '.git'))) return dir; } catch {}
      const up = path.dirname(dir);
      if (up === dir) return null;
      dir = up;
    }
  };
  const base = cwd || process.env.CLAUDE_PROJECT_DIR || process.cwd();
  if (filePath) {
    const abs = path.resolve(base, String(filePath));
    const m = abs.split(path.sep).join('/').match(/^(.*)\/docs\/(?:tasks|history|rules)\/[^/]+$/);
    if (m) return path.resolve(m[1]);
    const repo = findRepo(path.dirname(abs));
    if (repo) return repo;
  }
  return findRepo(base) || process.env.CLAUDE_PROJECT_DIR || base;
}

module.exports = {
  installFailSoftHandlers,
  resolveProjectRoot,
  parseJson,
  readJsonInput,
  safeEnsureDir,
  safeLog,
  safeReadJson,
  safeWriteJson,
  withFileLock,
  writeJson,
};
