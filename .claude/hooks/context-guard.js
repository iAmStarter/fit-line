#!/usr/bin/env node
'use strict';
// PreToolUse context watchdog (iStartSoftFlow). Two tiers, one hook:
//   warnPct  -> non-blocking nudge (additionalContext) once per climb into the band
//   gatePct  -> HARD block of NEW build work (Edit/Write to SOURCE files)
// Delegation (Task) is the prescribed escape — a subagent runs in its OWN context
// and returns a terse summary, so it SHRINKS orchestrator context, never grows it.
// Blocking it would force the orchestrator to build inline (worse). So Task is
// never gated; only direct source mutations by the orchestrator are.
// Reads REAL token usage from the transcript. Fail-OPEN: any error -> allow,
// never wedge the tool loop on a hook bug.
const path = require('path');
const fs = require('fs');

const silent = () => process.exit(0);
const out = (obj) => { process.stdout.write(JSON.stringify(obj)); process.exit(0); };

let input = '';
process.stdin.setEncoding('utf8');
process.stdin.on('data', (d) => (input += d));
process.stdin.on('end', () => {
  let evt;
  try { evt = JSON.parse(input); } catch (_) { return silent(); }
  try { run(evt); } catch (_) { silent(); }
});

function run(evt) {
  const projectDir = process.env.CLAUDE_PROJECT_DIR || evt.cwd || '.';
  let ctx;
  try { ctx = require(path.join(projectDir, '.claude/hooks/lib/ctx.js')); } catch (_) { return silent(); }
  const cfg = ctx.loadConfig(projectDir);
  const warn = cfg.warnPct || 60;
  const gate = cfg.gatePct || 78;

  const u = ctx.contextUsage(evt.transcript_path, cfg);
  if (!u) return silent();

  const tool = evt.tool_name || '';
  const ti = evt.tool_input || {};
  const band = u.pct >= gate ? 'gate' : u.pct >= warn ? 'warn' : 'ok';
  const BLOCKABLE = new Set(['Edit', 'Write', 'MultiEdit', 'NotebookEdit']);

  // HARD GATE — block new build mutations; reason is fed to the model.
  if (band === 'gate' && BLOCKABLE.has(tool) && !isEscape(tool, ti)) {
    return out({
      hookSpecificOutput: {
        hookEventName: 'PreToolUse',
        permissionDecision: 'deny',
        permissionDecisionReason: gateReason(u, gate),
      },
    });
  }

  // NON-BLOCKING WARN — emit once each time we climb into a higher band.
  const bandFile = path.join(projectDir, 'docs/.snapshots/.ctx-band');
  const rank = (b) => (b === 'gate' ? 2 : b === 'warn' ? 1 : 0);
  let prev = 'ok';
  try { prev = (fs.readFileSync(bandFile, 'utf8').trim() || 'ok'); } catch (_) {}

  if (rank(band) !== rank(prev)) {
    try { fs.mkdirSync(path.dirname(bandFile), { recursive: true }); fs.writeFileSync(bandFile, band); } catch (_) {}
  }
  if (rank(band) > rank(prev) && band !== 'ok') {
    return out({
      hookSpecificOutput: {
        hookEventName: 'PreToolUse',
        additionalContext: band === 'gate' ? gateReason(u, gate) : warnReason(u, warn, gate),
      },
    });
  }
  return silent();
}

// Checkpoint/logging writes (docs/**, STATE/ISSUES/snapshots) are never blocked,
// so the model always has an escape path out of the gate. (Task delegation is not
// in BLOCKABLE at all — see the header note — so it needs no escape carve-out.)
function isEscape(tool, ti) {
  const fp = ti.file_path || ti.path || ti.notebook_path || '';
  return /(^|\/)docs\//.test(fp) || /STATE\.md|ISSUES\.md|\.snapshots\//.test(fp);
}

const fmt = (n) => (n >= 1000 ? Math.round(n / 1000) + 'k' : String(n));

function gateReason(u, gate) {
  return [
    `⛔ CONTEXT GATE — ${u.pct}% (${fmt(u.tokens)}/${fmt(u.window)} tok), เกิน ${gate}% = หยุดเปิดงาน build ใหม่.`,
    'ทำก่อนไปต่อ:',
    '  1) ปิด/commit งานค้างให้จบ (Bash/git ไม่ถูก block)',
    '  2) /synthesize  (อัด handoff docs — subagent นี้ไม่ถูก block)',
    '  3) /clear       (session ใหม่ บางลง)',
    'build ต่อหลัง clear. กลาง irreversible op? ใช้ Bash ปิดให้จบก่อน clear.',
    'ปลดล็อกชั่วคราว: เพิ่ม gatePct ใน .claude/flow-config.json.',
  ].join('\n');
}

function warnReason(u, warn, gate) {
  return [
    `⚠️ CONTEXT ${u.pct}% (${fmt(u.tokens)}/${fmt(u.window)} tok) — แตะ warn band ${warn}%.`,
    `วางแผนปิด phase: ทยอย /synthesize → /clear ก่อนถึง gate ${gate}% (เลยจุดนั้น hook block งาน build ใหม่).`,
    'Delegate งาน noisy ให้ subagent เพื่อกัน context โต.',
  ].join('\n');
}
