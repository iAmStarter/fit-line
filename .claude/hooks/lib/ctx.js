'use strict';
// Shared context-budget math for iStartSoftFlow watchdog hooks.
// Reads the live Claude Code transcript (JSONL) and reports how full the
// model's context window currently is — from the REAL token usage the API
// reported, not a heuristic. Pure Node, cross-platform.
const fs = require('fs');

// Known context windows by model-id substring. First match wins. The 1M
// Opus/Sonnet variants advertise "[1m]" in the model id.
const WINDOWS = [
  [/\[1m\]|-1m\b|:1m\b|1m-/i, 1000000],
  [/opus|sonnet|haiku|claude/i, 200000],
];

function inferWindow(model) {
  if (!model) return 200000;
  for (const [re, w] of WINDOWS) if (re.test(model)) return w;
  return 200000;
}

// Read project flow config; returns the `context` block or {}.
function loadConfig(projectDir) {
  try {
    const cfg = JSON.parse(fs.readFileSync(projectDir + '/.claude/flow-config.json', 'utf8'));
    return (cfg && cfg.context) || {};
  } catch (_) { return {}; }
}

// Read only the last `bytes` of a file (the recent assistant turns live at the
// tail of the JSONL — no need to load a multi-MB transcript on every tool).
function readTail(p, bytes) {
  const fd = fs.openSync(p, 'r');
  try {
    const size = fs.fstatSync(fd).size;
    const start = Math.max(0, size - bytes);
    const len = size - start;
    const buf = Buffer.alloc(len);
    fs.readSync(fd, buf, 0, len, start);
    return { text: buf.toString('utf8'), partial: start > 0 };
  } finally { fs.closeSync(fd); }
}

// Scan lines (newest first) for the most recent assistant usage block.
// input_tokens + cache_read + cache_creation == the full prompt size actually
// sent == current context occupancy.
function scanUsage(text, dropFirst) {
  const lines = text.split('\n');
  const lo = dropFirst ? 1 : 0; // first line may be a truncated tail fragment
  for (let i = lines.length - 1; i >= lo; i--) {
    const ln = lines[i].trim();
    if (!ln) continue;
    let obj;
    try { obj = JSON.parse(ln); } catch (_) { continue; }
    const m = obj && obj.message;
    if (m && m.role === 'assistant' && m.usage && typeof m.usage.input_tokens === 'number') {
      return { usage: m.usage, model: m.model || obj.model || null };
    }
  }
  return null;
}

function contextUsage(transcriptPath, cfg) {
  if (!transcriptPath) return null;
  let hit;
  try {
    const tail = readTail(transcriptPath, 512 * 1024);
    hit = scanUsage(tail.text, tail.partial);
    if (!hit && tail.partial) {
      // usage not in the tail window — fall back to a full read (rare).
      hit = scanUsage(fs.readFileSync(transcriptPath, 'utf8'), false);
    }
  } catch (_) { return null; }
  if (!hit) return null;
  const u = hit.usage;
  const tokens = (u.input_tokens || 0)
    + (u.cache_read_input_tokens || 0)
    + (u.cache_creation_input_tokens || 0);
  const window = (cfg && cfg.window) ? cfg.window : inferWindow(hit.model);
  return { tokens, window, model: hit.model, pct: Math.round((tokens / window) * 100) };
}

module.exports = { contextUsage, inferWindow, loadConfig, readTail, scanUsage };
