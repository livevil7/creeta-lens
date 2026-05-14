#!/usr/bin/env node
/**
 * Lens Sync — SessionStart auto-pull hook.
 *
 * Runs `git-sync-all.sh pull` on session start to bring incoming changes from
 * other machines. Push is NOT automatic — that requires explicit /cs invocation.
 *
 * Opt-out: set LENS_SYNC_AUTO_PULL=0 in env.
 *
 * Cross-platform: resolves Bash path for Windows (Git for Windows), macOS, Linux.
 *
 * Fail-soft: any error (missing bash, no repos, network failure) is logged but
 * does not break the Claude Code session start.
 */

"use strict";

const { spawn, spawnSync } = require("node:child_process");
const fs = require("node:fs");
const path = require("node:path");
const os = require("node:os");

function log(msg) {
  // Use stderr so the line never collides with structured stdout from other hooks
  process.stderr.write(`[lens-sync] ${msg}\n`);
}

if (process.env.LENS_SYNC_AUTO_PULL === "0") {
  log("auto-pull disabled by LENS_SYNC_AUTO_PULL=0");
  process.exit(0);
}

const pluginRoot = process.env.CLAUDE_PLUGIN_ROOT || path.resolve(__dirname, "..");
const script = path.join(pluginRoot, "scripts", "git-sync-all.sh");

if (!fs.existsSync(script)) {
  log(`script not found: ${script}`);
  process.exit(0);
}

function findBash() {
  const platform = os.platform();
  if (process.env.GIT_BASH && fs.existsSync(process.env.GIT_BASH)) {
    return process.env.GIT_BASH;
  }
  if (process.env.BASH_PATH && fs.existsSync(process.env.BASH_PATH)) {
    return process.env.BASH_PATH;
  }
  if (platform === "win32") {
    // Common Git for Windows install paths
    const candidates = [
      "C:/Program Files/Git/bin/bash.exe",
      "C:/Program Files (x86)/Git/bin/bash.exe",
      `${process.env.LOCALAPPDATA}/Programs/Git/bin/bash.exe`,
      "C:/msys64/usr/bin/bash.exe",
    ];
    for (const c of candidates) {
      if (c && fs.existsSync(c)) return c;
    }
    const where = spawnSync("where.exe", ["bash"], { encoding: "utf-8", windowsHide: true });
    const first = (where.stdout || "").split(/\r?\n/).map((s) => s.trim()).find(Boolean);
    if (first) return first;
    // Last resort: hope `bash` is on PATH (WSL or Cygwin)
    return "bash";
  }
  const command = spawnSync("command", ["-v", "bash"], { encoding: "utf-8", shell: true });
  const found = (command.stdout || "").trim();
  return found || "/bin/bash";
}

const bash = findBash();
log(`pulling all repos via ${bash}`);

// Quote the script path for cross-platform safety
const child = spawn(bash, [script, "pull"], {
  stdio: ["ignore", "pipe", "pipe"],
  windowsHide: true,
  detached: false,
});

let buf = "";
child.stdout.on("data", (chunk) => { buf += chunk.toString(); });
child.stderr.on("data", (chunk) => { buf += chunk.toString(); });

const timer = setTimeout(() => {
  log("pull timed out after 90s; continuing session anyway");
  try { child.kill(); } catch {}
}, 85_000);

child.on("close", (code) => {
  clearTimeout(timer);
  // Print the script's report so the user sees pull results in the session log
  if (buf.trim()) {
    process.stderr.write(buf);
  }
  if (code !== 0) {
    log(`exit code ${code}`);
  }
  process.exit(0);
});

child.on("error", (err) => {
  clearTimeout(timer);
  log(`spawn error: ${err.message}`);
  process.exit(0);
});
