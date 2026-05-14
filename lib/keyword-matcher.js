/**
 * Lens - Keyword Matcher Module
 * Dynamically builds keyword maps from scanner results.
 */

const path = require('path');
const { safeReadJson, safeWriteJson } = require('./hook-utils');

const PLUGIN_ROOT = path.resolve(__dirname, '..');
const CACHE_PATH = path.join(PLUGIN_ROOT, '.lens-cache.json');

function buildKeywordMap(scanResults) {
  return (scanResults || [])
    .filter((s) => s.triggers && s.triggers.length > 0)
    .map((s) => ({
      skill: s.name,
      domain: s.domain || 'General',
      keywords: s.triggers,
    }));
}

function saveScanCache(scanResults) {
  safeWriteJson(CACHE_PATH, scanResults || [], { atomic: true });
}

function loadCachedScanResults() {
  return safeReadJson(CACHE_PATH, []) || [];
}

function matchKeywords(message, scanResults, customMap) {
  const results = scanResults || loadCachedScanResults();
  const keywordMap = buildKeywordMap(results);

  if (customMap && Array.isArray(customMap)) {
    keywordMap.push(...customMap);
  }

  const lowerMsg = (message || '').toLowerCase();
  const matches = [];

  for (const entry of keywordMap) {
    let score = 0;
    for (const keyword of entry.keywords || []) {
      const normalized = String(keyword).toLowerCase();
      if (normalized && lowerMsg.includes(normalized)) {
        score += normalized.length;
      }
    }
    if (score > 0) {
      matches.push({
        skill: entry.skill,
        domain: entry.domain,
        score,
      });
    }
  }

  return matches.sort((a, b) => b.score - a.score);
}

function formatKeywordTable(scanResults) {
  const results = scanResults || loadCachedScanResults();
  const keywordMap = buildKeywordMap(results);

  if (keywordMap.length === 0) {
    return 'No keyword mappings detected (no skills with triggers found).';
  }

  let table = '| Domain | Skill | Sample Keywords |\n';
  table += '|--------|-------|-----------------|\n';

  for (const entry of keywordMap) {
    const samples = (entry.keywords || []).slice(0, 5).join(', ');
    const prefix = entry.domain === 'LSP' ? '' : '/';
    table += `| ${entry.domain} | ${prefix}${entry.skill} | ${samples} |\n`;
  }

  return table;
}

module.exports = {
  matchKeywords,
  formatKeywordTable,
  buildKeywordMap,
  saveScanCache,
  loadCachedScanResults,
};
