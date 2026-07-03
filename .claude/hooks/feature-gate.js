#!/usr/bin/env node
// Stop hook — the feature-lane gate. While a /feature run is active
// (docs/STATE.md has `feature: <slug> (active)`), the session may not end
// with unchecked gates in docs/features/<slug>/GATES.md — and a CHECKED gate
// whose artifact is verifiable must have the artifact on disk (a ticked box
// with no TEST-PLAN.md behind it is treated as unchecked). Suites staying
// green is still proven by the steps themselves; this hook proves the
// deliverables exist. Pure Node, cross-platform, zero deps.
'use strict';
const fs = require('fs');
const path = require('path');

try { process.chdir(process.env.CLAUDE_PROJECT_DIR || '.'); } catch (_) {}

const allow = () => process.exit(0);
const block = (reason) => { process.stdout.write(JSON.stringify({ decision: 'block', reason }) + '\n'); process.exit(0); };
const read = (f) => { try { return fs.readFileSync(f, 'utf8'); } catch (_) { return null; } };

// stdin: hook input JSON. stop_hook_active=true means we already blocked once
// this stop — allow through to avoid an infinite block loop.
let input = {};
try { input = JSON.parse(fs.readFileSync(0, 'utf8') || '{}'); } catch (_) {}
if (input.stop_hook_active) allow();

const state = read(path.join('docs', 'STATE.md'));
if (!state) allow();

// an ACTIVE feature arms the full gate; a DONE feature still gets artifact
// verification (done-with-fake-gates must not slip through by never stopping
// while active). `(parked — reason)` disarms entirely.
const mActive = state.match(/^\s*feature:\s*([A-Za-z0-9._-]+)\s*\(active\)/m);
const mDone = state.match(/^\s*feature:\s*([A-Za-z0-9._-]+)\s*\(done\)/m);
const m = mActive || mDone;
if (!m) allow();
const slug = m[1];
const isDone = !mActive;

const gates = read(path.join('docs', 'features', slug, 'GATES.md'));
if (!gates) block(
  `Feature "${slug}" is active in docs/STATE.md but docs/features/${slug}/GATES.md is missing. ` +
  `Recreate the gate checklist (see /feature step 0c), or park the run: set ` +
  `"feature: ${slug} (parked — <reason>)" in docs/STATE.md.`
);

const open = gates.split('\n').filter((l) => /^\s*- \[ \]/.test(l)).map((l) => l.replace(/^\s*- \[ \]\s*/, '').trim());
const checked = gates.split('\n').filter((l) => /^\s*- \[[xX]\]/.test(l)).map((l) => l.replace(/^\s*- \[[xX]\]\s*/, '').trim());

// artifact verification — a checked gate must have its deliverable on disk.
const fdir = path.join('docs', 'features', slug);
const featureDoc = read(path.join(fdir, 'FEATURE.md')) || '';
const ARTIFACTS = {
  'mini-plan':      () => fs.existsSync(path.join(fdir, 'PLAN.md')) || `docs/features/${slug}/PLAN.md is missing`,
  'contract-probe': () => fs.existsSync(path.join(fdir, 'CONTRACTS.md')) || `docs/features/${slug}/CONTRACTS.md is missing`,
  'test-plan':      () => fs.existsSync(path.join(fdir, 'TEST-PLAN.md')) || `docs/features/${slug}/TEST-PLAN.md is missing`,
  'token-stamp':    () => /^##\s*Token stamp/mi.test(featureDoc) || `FEATURE.md has no "## Token stamp" section`,
  'summary':        () => /^##\s*Summary/mi.test(featureDoc) || `FEATURE.md has no "## Summary" section`,
  'memory-queued':  () => fs.existsSync(path.join('docs', 'WISDOM-QUEUE.md')) || `docs/WISDOM-QUEUE.md is missing`,
};
const fake = [];
for (const g of checked) {
  const check = ARTIFACTS[g];
  if (!check) continue;
  const r = check();
  if (r !== true) fake.push(`${g} (${r})`);
}
if (fake.length) block(
  `Feature "${slug}": ${fake.length} gate(s) are checked but their artifacts do not exist — ` +
  `${fake.join(' · ')}. A gate is done when its deliverable is on disk, not when the box is ticked. ` +
  `Produce the artifact(s) (see /feature), or untick the gate(s) and finish the step.`
);

if (isDone) {
  if (open.length) block(
    `Feature "${slug}" is marked (done) in docs/STATE.md but GATES.md still has ` +
    `${open.length} unchecked gate(s): ${open.join(' · ')}. Finish them, or set the state ` +
    `to "feature: ${slug} (active)" / "(parked — <reason>)" to reflect reality.`
  );
  allow();
}

if (open.length === 0) block(
  `Feature "${slug}": all gates are checked but docs/STATE.md still says (active). ` +
  `Finish the close-out: set "feature: ${slug} (done)" in docs/STATE.md (/feature step 8).`
);

block(
  `Feature "${slug}" has ${open.length} unchecked gate(s): ${open.join(' · ')}. ` +
  `Finish those steps and tick each box in docs/features/${slug}/GATES.md, ` +
  `or park the run: set "feature: ${slug} (parked — <reason>)" in docs/STATE.md ` +
  `and record the blocker in docs/features/${slug}/BLOCKED.md.`
);
