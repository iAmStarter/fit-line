#!/usr/bin/env node
// PreCompact hook. Fires before auto/manual compaction. Snapshots the live
// position so a post-compact session can recover. Pure Node, cross-platform.
'use strict';
const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

try { process.chdir(process.env.CLAUDE_PROJECT_DIR || '.'); } catch (_) {}

const sh = (cmd) => { try { return execSync(cmd, { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] }); } catch (_) { return ''; } };
const read = (f) => { try { return fs.readFileSync(f, 'utf8'); } catch (_) { return null; } };

fs.mkdirSync('docs/.snapshots', { recursive: true });
const d = new Date();
const p2 = (n) => String(n).padStart(2, '0');
const stamp = `${d.getFullYear()}${p2(d.getMonth() + 1)}${p2(d.getDate())}-${p2(d.getHours())}${p2(d.getMinutes())}${p2(d.getSeconds())}`;
const snap = path.join('docs/.snapshots', `precompact-${stamp}.md`);

const state = read('docs/STATE.md');
const body = [
  `# Pre-compact snapshot ${stamp}`, '',
  '## Git',
  sh('git status --short').replace(/\n+$/, ''),
  sh('git diff --stat').replace(/\n+$/, ''),
  '',
  '## STATE.md at compact time',
  state !== null ? state.replace(/\n$/, '') : '(no STATE.md)',
  '',
].join('\n');
fs.writeFileSync(snap, body);

// keep the 5 newest precompact snapshots
const old = fs.readdirSync('docs/.snapshots')
  .filter((f) => /^precompact-.*\.md$/.test(f))
  .map((f) => ({ f, t: fs.statSync(path.join('docs/.snapshots', f)).mtimeMs }))
  .sort((a, b) => b.t - a.t)
  .slice(5);
for (const { f } of old) { try { fs.unlinkSync(path.join('docs/.snapshots', f)); } catch (_) {} }

process.stdout.write(`Context was compacted. Recovery snapshot saved at ${snap}.\n`);
process.stdout.write('STATE.md and ISSUES.md were re-injected by the SessionStart hook - trust those.\n');
