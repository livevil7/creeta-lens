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
    fs.writeFileSync(tempPath, payload, 'utf-8');
    fs.renameSync(tempPath, filePath);
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

module.exports = {
  installFailSoftHandlers,
  parseJson,
  readJsonInput,
  safeEnsureDir,
  safeLog,
  safeReadJson,
  safeWriteJson,
  withFileLock,
  writeJson,
};
