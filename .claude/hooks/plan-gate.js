#!/usr/bin/env node
// PreToolUse plan gate — hard rule 13 as code. While docs/PLAN.md carries
// `> Approval: PENDING`, no SOURCE file may be created or edited: the plan
// needs a human sign-off before build work starts. Docs, kit config, and
// planning artifacts stay writable (planning is exactly what PENDING is for).
// An active feature lane is exempt — its doc approval is its own rule-13-scoped
// gate and it never touches the main PLAN. Fail-OPEN on any error: a hook bug
// must never wedge the tool loop. Pure Node, cross-platform, zero deps.
'use strict';
const fs = require('fs');
const path = require('path');

const silent = () => process.exit(0);
const deny = (reason) => {
  process.stdout.write(JSON.stringify({
    hookSpecificOutput: { hookEventName: 'PreToolUse', permissionDecision: 'deny', permissionDecisionReason: reason },
  }));
  process.exit(0);
};

let input = '';
process.stdin.setEncoding('utf8');
process.stdin.on('data', (d) => (input += d));
process.stdin.on('end', () => {
  let evt;
  try { evt = JSON.parse(input); } catch (_) { return silent(); }
  try { run(evt); } catch (_) { silent(); }
});

function run(evt) {
  const MUTATORS = new Set(['Edit', 'Write', 'MultiEdit', 'NotebookEdit']);
  if (!MUTATORS.has(evt.tool_name || '')) return silent();

  const projectDir = process.env.CLAUDE_PROJECT_DIR || evt.cwd || '.';
  const read = (f) => { try { return fs.readFileSync(path.join(projectDir, f), 'utf8'); } catch (_) { return null; } };

  const plan = read(path.join('docs', 'PLAN.md'));
  if (!plan) return silent();                              // no plan world (e.g. /quick-only repo)
  const approval = plan.match(/^>\s*Approval:\s*(.+)$/m);
  if (!approval) return silent();                          // not our PLAN format — don't guess
  if (!/pending/i.test(approval[1])) return silent();      // signed off — build away

  // the feature lane carries its own scoped approval and never edits the main PLAN.
  const state = read(path.join('docs', 'STATE.md')) || '';
  if (/^\s*feature:\s*\S+\s*\(active\)/m.test(state)) return silent();

  const file = String((evt.tool_input || {}).file_path || (evt.tool_input || {}).notebook_path || '');
  if (!file) return silent();
  const rel = path.relative(projectDir, path.resolve(projectDir, file)).split(path.sep).join('/');

  // writable while PENDING: planning + docs + kit + repo meta — never product source.
  const ALLOW = [
    /^docs\//, /^\.claude\//, /^\.cursor\//, /^\.github\//, /^\.aider/, /^\.git/,
    /^(README|AGENTS|CLAUDE|GEMINI|CHANGELOG|LICENSE)[^/]*$/i, /^[^/]+\.md$/,
  ];
  if (ALLOW.some((re) => re.test(rel))) return silent();

  deny(
    `PLAN-APPROVAL gate (hard rule 13): docs/PLAN.md still reads "> Approval: PENDING", ` +
    `so source changes are blocked (attempted: ${rel}). Get the plan signed off first — ` +
    `run /overview's PLAN-APPROVAL step (or /replan, then re-approve) and stamp the header ` +
    `"> Approval: approved <date> v<n>". Planning artifacts under docs/ stay writable.`
  );
}
