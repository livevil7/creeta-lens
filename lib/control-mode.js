/**
 * Lens - Control mode marker (v3.53.0)
 *
 * /ct (skills/ct/SKILL.md) writes one marker while a control session runs several
 * work sessions. Owner, 2026-10-16: 작업 세션은 자기 창에서 대표에게 묻지 않고 관제에
 * 보낸다. hooks/pre-tool-ask.js reads the marker and refuses AskUserQuestion only in
 * the sessions listed as participants — unrelated sessions and the control session
 * itself are never touched.
 *
 * The hook cannot call ListAgents, so "control is gone" is judged by age alone: a
 * marker not refreshed (on / heartbeat) for FRESH_HOURS is treated as absent.
 *
 * File: env LENS_CONTROL_FILE, else <configDir>/lens/control.json
 * Shape: { name, sessionId, board, participants: [id], scope, createdAt, updatedAt }
 * Nothing here throws on a broken file — a bad marker must never trap a session.
 */

'use strict';

const fs = require('fs');
const path = require('path');
const { safeEnsureDir, safeReadJson, safeWriteJson } = require('./hook-utils');
const { configDir } = require('./session-store');

const FRESH_HOURS = 12;

function controlPath() {
  return process.env.LENS_CONTROL_FILE || path.join(configDir(), 'lens', 'control.json');
}

function readControl() {
  const c = safeReadJson(controlPath(), null);
  return c && typeof c === 'object' && c.sessionId ? c : null;
}

function isFresh(ctrl, now = Date.now()) {
  const at = Date.parse((ctrl && ctrl.updatedAt) || '');
  return !Number.isNaN(at) && now - at <= FRESH_HOURS * 3600 * 1000;
}

function save(c) {
  const file = controlPath();
  return safeEnsureDir(path.dirname(file)) && safeWriteJson(file, c);
}

/** Start or re-register. A fresh marker owned by another session is not taken over. */
function writeControl({ name, sessionId, board = '', participants = [], scope = '' } = {}) {
  if (!name || !sessionId) return { ok: false, reason: 'name 과 sessionId 가 필요하다' };
  const prev = readControl();
  if (prev && prev.sessionId !== sessionId && isFresh(prev)) {
    return { ok: false, reason: `이미 관제 중: ${prev.name} (세션 ${prev.sessionId}, 갱신 ${prev.updatedAt})`, owner: prev };
  }
  const now = new Date().toISOString();
  const control = {
    name: String(name),
    sessionId: String(sessionId),
    board: String(board || ''),
    participants: participants.map(String).filter(id => id && id !== String(sessionId)),
    scope: String(scope || ''),
    createdAt: prev && prev.sessionId === sessionId ? prev.createdAt : now,
    updatedAt: now,
  };
  return save(control) ? { ok: true, control } : { ok: false, reason: `쓰기 실패: ${controlPath()}` };
}

/** Only the owning control session clears the marker. */
function clearControl(sessionId) {
  const prev = readControl();
  if (!prev) return { ok: true, cleared: false };
  if (prev.sessionId !== sessionId) return { ok: false, reason: `소유 관제가 아니다: ${prev.name} (세션 ${prev.sessionId})` };
  fs.rmSync(controlPath(), { force: true });
  return { ok: true, cleared: true };
}

function heartbeat(sessionId) {
  const prev = readControl();
  if (!prev || prev.sessionId !== sessionId) return { ok: false, reason: '이 세션이 소유한 관제 표식이 없다' };
  prev.updatedAt = new Date().toISOString();
  return save(prev) ? { ok: true, control: prev } : { ok: false, reason: `쓰기 실패: ${controlPath()}` };
}

/** Refusal text for AskUserQuestion in `sessionId`, or null (allow). */
function askProblem(sessionId, now = Date.now()) {
  if (!sessionId) return null;
  const c = readControl();
  if (!c || !isFresh(c, now) || c.sessionId === sessionId) return null;
  if (!Array.isArray(c.participants) || !c.participants.includes(sessionId)) return null;
  return `관제 모드 — SendMessage(to ${c.name})로 무엇·선택지·추천·영향·되돌리기를 보내세요. `
    + '대표가 이 창에서 직접 지시한 건이면 이 세션을 LENS_ASK_GUARD=0 으로 다시 띄우세요.';
}

module.exports = { FRESH_HOURS, controlPath, readControl, writeControl, clearControl, heartbeat, isFresh, askProblem };
