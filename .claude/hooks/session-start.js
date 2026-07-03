#!/usr/bin/env node
// SessionStart hook. stdout is injected into the agent's context every session.
// Pure Node, cross-platform (macOS / Windows / Linux) — no bash/jq/python needed.
'use strict';
const fs = require('fs');
const path = require('path');
const os = require('os');
const { execSync } = require('child_process');

try { process.chdir(process.env.CLAUDE_PROJECT_DIR || '.'); } catch (_) {}

const out = [];
const emit = (s = '') => out.push(s);
const read = (f) => { try { return fs.readFileSync(f, 'utf8'); } catch (_) { return null; } };
const exists = (f) => fs.existsSync(f);
const sh = (cmd) => { try { return execSync(cmd, { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] }); } catch (_) { return ''; } };

emit('=== iStartSoftFlow AUTO-CONTEXT (injected by hook, NOT optional) ===');
emit('');

// 1. git state
emit('## Git');
emit('branch: ' + (sh('git branch --show-current').trim() || 'n/a'));
const uncommitted = sh('git status --short').split('\n').filter((l) => l.trim() !== '').length;
emit('uncommitted: ' + uncommitted + ' file(s)');
for (const l of sh('git log --oneline -3').replace(/\n+$/, '').split('\n').filter(Boolean)) emit('  ' + l);
emit('');

// 2. active state (cap size — STATE.md is meant to stay small)
const state = read('docs/STATE.md');
if (state !== null) {
  emit('## STATE.md (current position - READ THIS FIRST)');
  const sl = state.replace(/\n$/, '').split('\n');
  for (const l of sl.slice(0, 40)) emit(l);
  if (sl.length > 40) emit(`… (+${sl.length - 40} more — STATE.md should be small; trim it)`);
  emit('');
} else {
  emit('## STATE.md missing -> run /overview to bootstrap the project.');
  emit('');
}

// 2b. active sprint (sprint layer) — surface goal + burndown if one is active
const sprintMatch = (state || '').match(/^\s*sprint:\s*(\d+)\s*\(active\)/m);
if (sprintMatch) {
  const sf = read(`docs/sprints/sprint-${sprintMatch[1]}.md`);
  if (sf !== null) {
    emit(`## Sprint ${sprintMatch[1]} (active)`);
    const goal = (sf.match(/goal:\s*(.+)/i) || [])[1];
    if (goal) emit('goal: ' + goal.trim());
    const burn = sf.split('\n').find((l) => /burndown|remaining|pts? left|[▁▂▃▄▅▆▇█]/i.test(l));
    if (burn) emit('burndown: ' + burn.trim());
    emit(`see docs/sprints/sprint-${sprintMatch[1]}.md for the full sprint.`);
    emit('');
  }
}

// 3. issue log — inject only OPEN issues (resolved ones stay in the file for
//    grep, but are NOT re-paid in tokens every session). Capped.
const issues = read('docs/ISSUES.md');
if (issues !== null) {
  const blocks = [];
  let cur = null;
  for (const l of issues.split('\n')) {
    if (/^### /.test(l)) { if (cur) blocks.push(cur); cur = [l]; }
    else if (cur) cur.push(l);
  }
  if (cur) blocks.push(cur);
  const open = blocks.filter((b) => b.some((l) => /- \[ \]/.test(l)));
  emit(`## ISSUES.md (${open.length} open) - grep this file before debugging anything`);
  if (open.length) {
    const flat = open.flat();
    for (const l of flat.slice(0, 50)) emit(l);
    if (flat.length > 50) emit('… (more — grep docs/ISSUES.md for full detail)');
  } else {
    emit('(no open issues)');
  }
  emit('');
}

// 3b. research index — token economy: inject only the 5 newest rows, each
// truncated; the full table stays on disk for grep, sessions don't re-pay it.
const idx = read('docs/research/INDEX.md');
if (idx !== null) {
  const rows = idx.split('\n').filter((l) => /^\|\s*\d{4}-\d{2}-\d{2}/.test(l));
  emit(`## research/INDEX.md (${rows.length} prior investigations)`);
  emit('grep this before any new research or debugging.');
  for (const l of rows.slice(-5)) emit('  ' + (l.length > 220 ? l.slice(0, 217) + '…' : l));
  if (rows.length > 5) emit(`  … (+${rows.length - 5} older — grep docs/research/INDEX.md)`);
  emit('');
}

// 3d. shared KB — pull latest + load snapshot
const KB_CONFIG = '.claude/kb-config.json';
let kbActive = false;
if (exists(KB_CONFIG)) {
  let cfg = {}; try { cfg = JSON.parse(read(KB_CONFIG) || '{}'); } catch (_) {}
  let kbPath = cfg.kb_path || '';
  if (kbPath.startsWith('~')) kbPath = path.join(os.homedir(), kbPath.slice(1));
  if (kbPath && exists(kbPath) && fs.statSync(kbPath).isDirectory()) {
    emit('## Shared KB');
    let pulled = true;
    try { execSync(`git -C "${kbPath}" pull --ff-only --quiet`, { stdio: 'ignore' }); } catch (_) { pulled = false; }
    emit(pulled ? 'KB pulled: OK' : 'KB pull skipped (offline or conflict — using local copy)');

    const cut = new Date(); cut.setMonth(cut.getMonth() - 6);
    const cutoff = cut.toISOString().slice(0, 10);
    const today = new Date().toISOString().slice(0, 10);
    const kbIndex = path.join(kbPath, 'INDEX.md');
    if (exists(kbIndex)) {
      const lines = (read(kbIndex) || '').split('\n').filter((l) => l && !l.startsWith('#'));
      const snap = [`# KB snapshot — loaded ${today}`, `# Stale = created date older than ${cutoff}`, ''];
      let stale = 0, total = 0;
      for (const line of lines) {
        if (line.includes('|')) total++;
        const entryDate = (line.split('|')[0] || '').trim();
        if (/^\d{4}-\d{2}-\d{2}$/.test(entryDate) && entryDate < cutoff) { snap.push('[STALE] ' + line); stale++; }
        else snap.push(line);
      }
      try { fs.mkdirSync('docs', { recursive: true }); fs.writeFileSync('docs/.kb-snapshot.md', snap.join('\n') + '\n'); } catch (_) {}
      emit(`KB snapshot loaded: ${total} entries (${stale} stale — researcher will re-research these)`);
      emit('Snapshot at docs/.kb-snapshot.md — researcher reads this before web search.');
    } else {
      emit(`KB INDEX.md not found at ${kbPath} — run /store-wisdom to populate it.`);
    }
    emit('');
    kbActive = true;
  } else {
    emit('## Shared KB: configured but path not found (' + (cfg.kb_path || '') + ')');
    emit('Fix kb_path in .claude/kb-config.json (or re-run: npx create-issflow).');
    emit('');
  }
}

// 4. hard rule reminder
emit('## RULES (enforced this session)');
emit('- AUTO mode (default) governs the DEV loop: follow the plan — decide + log +');
emit('  continue, do NOT stop to ask. (Planning / grill still asks — that part is fine.)');
emit('  Hard-stops only: security / irreversible-or-outbound actions / contradictory spec.');
emit('- caveman ULTRA mode is active.');
emit('- PLAN-APPROVAL gate (rule 13): no /phase or /sprint while STATE `plan:` reads');
emit('  PENDING — the plan needs a human sign-off via /overview first.');
emit('- before debugging ANY error: grep ISSUES.md AND research/INDEX.md first.');
emit('- debug attempts: WARN at 2; cap 3. AUTO: log + park the slice + continue (batched');
emit('  report at the phase boundary). GUIDED: stop and ask you.');
emit('- end of every phase: run /synthesize, then /clear.');
emit('- small obvious change? use /quick, not /phase.');
emit('- token economy: keep context lean. Delegate noisy work to subagents (they');
emit('  return summaries). If one phase grows past ~50% of the model window, split');
emit('  it or /synthesize -> /clear — do not coast to auto-compact.');
if (kbActive) {
  emit('- KB active: researcher checks docs/.kb-snapshot.md before web search.');
  emit('- learned something worth keeping? run /store-wisdom.');
}
emit('=== END AUTO-CONTEXT ===');

process.stdout.write(out.join('\n') + '\n');
