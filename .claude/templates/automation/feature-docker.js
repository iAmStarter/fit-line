#!/usr/bin/env node
// iStartSoftFlow — run the feature lane headless in Docker.
// Installed by `npx create-issflow --docker` as scripts/feature-docker.js.
// Pure Node, cross-platform (macOS / Windows / Linux). Needs: docker, ANTHROPIC_API_KEY.
//
//   node scripts/feature-docker.js docs/features/<slug>/FEATURE.md [--rebuild] [--worktree]
//
// What it does: build the runner image (Dockerfile.issflow) if missing, then run
// `claude -p "/feature <doc>"` inside an ephemeral container with THIS repo
// mounted at /work. The container is the sandbox — the run edits, tests, and
// commits on feature/<slug> in your working tree. Push/PR happen only if the
// doc's `> Automation:` header authorizes them AND credentials are available
// in the container; otherwise the branch stays local and pushing is yours.
//
// --worktree: parallel lane. Mounts a FRESH `git worktree` (../<repo>-feature-<slug>,
// on branch feature/<slug>) instead of your working tree, so 2–3 features can run
// concurrently without touching your checkout or each other. Each run needs its
// own doc + slug. Results come back as commits on feature/<slug> (visible from the
// main repo); remove the dir with `git worktree remove` after merge.
'use strict';
const fs = require('fs');
const path = require('path');
const { spawnSync } = require('child_process');

const IMAGE = process.env.ISSFLOW_IMAGE || 'issflow-runner';
const argv = process.argv.slice(2);
const rebuild = argv.includes('--rebuild');
const useWorktree = argv.includes('--worktree');
const doc = argv.find((a) => !a.startsWith('--'));

const die = (msg) => { console.error('feature-docker: ' + msg); process.exit(1); };
const run = (cmd, args, opts = {}) => spawnSync(cmd, args, { stdio: 'inherit', ...opts });

if (!doc) die('usage: node scripts/feature-docker.js <path/to/FEATURE.md> [--rebuild] [--worktree]');
const repo = process.cwd();
if (!fs.existsSync(path.join(repo, doc))) die(`Feature doc not found: ${doc} (run from the repo root)`);
if (!fs.existsSync(path.join(repo, '.claude', 'commands', 'feature.md'))) die('no .claude/commands/feature.md here — run from a repo with the kit installed');
if (!process.env.ANTHROPIC_API_KEY) die('ANTHROPIC_API_KEY is not set');

const dockerOk = spawnSync('docker', ['version'], { stdio: 'ignore' });
if (dockerOk.error || dockerOk.status !== 0) die('docker is not available');

const haveImage = spawnSync('docker', ['image', 'inspect', IMAGE], { stdio: 'ignore' }).status === 0;
if (!haveImage || rebuild) {
  const df = fs.existsSync(path.join(repo, 'Dockerfile.issflow'))
    ? 'Dockerfile.issflow'
    : path.join('.claude', 'templates', 'automation', 'Dockerfile');
  console.log(`feature-docker: building ${IMAGE} from ${df} …`);
  if (run('docker', ['build', '-t', IMAGE, '-f', df, '.']).status !== 0) die('image build failed');
}

// preflight: the kit's hooks (session-start, the feature gate) are Node
// scripts. An image without node — e.g. claude installed as a native binary,
// or a bring-your-own ISSFLOW_IMAGE built on a non-Node base — runs claude
// but every hook dies silently, so the gate enforcement is gone. Refuse early.
const nodeCheck = spawnSync('docker', ['run', '--rm', '--entrypoint', 'node', IMAGE, '--version'], { stdio: 'ignore' });
if (nodeCheck.status !== 0) die(
  `image "${IMAGE}" has no usable node — the kit's lifecycle hooks are Node scripts and cannot run. ` +
  `Use the shipped image (delete it + rerun with --rebuild), or base your custom image on Node >= 18 ` +
  `(e.g. FROM issflow-runner).`
);

// --worktree: isolate the run in its own checkout so features run in parallel.
let mountDir = repo;
if (useWorktree) {
  const slug = path.basename(path.dirname(path.resolve(repo, doc))) || 'feature';
  const wt = path.join(path.dirname(repo), `${path.basename(repo)}-feature-${slug}`);
  const branch = `feature/${slug}`;
  if (!fs.existsSync(wt)) {
    console.log(`feature-docker: creating worktree ${wt} on ${branch}`);
    const branchExists = spawnSync('git', ['rev-parse', '--verify', branch], { stdio: 'ignore' }).status === 0;
    const wtArgs = branchExists ? ['worktree', 'add', wt, branch] : ['worktree', 'add', '-b', branch, wt];
    if (run('git', wtArgs).status !== 0) die('git worktree add failed');
  }
  // the doc may only exist in the main tree so far — carry it into the worktree.
  const wtDoc = path.join(wt, doc);
  if (!fs.existsSync(wtDoc)) {
    fs.mkdirSync(path.dirname(wtDoc), { recursive: true });
    fs.copyFileSync(path.resolve(repo, doc), wtDoc);
  }
  mountDir = wt;
  console.log(`feature-docker: parallel lane — this run is isolated in ${wt}; your checkout stays untouched.`);
}

console.log(`feature-docker: running /feature ${doc} in ${IMAGE} (repo mounted at /work)`);
const args = [
  'run', '--rm',
  '--entrypoint', 'claude',
  '-v', `${mountDir}:/work`, '-w', '/work',
];
// a worktree's .git is a FILE pointing at the main repo's .git by absolute host
// path — mount the main repo at that same path so git resolves inside the
// container. (Path-identical mounts: Linux/macOS; on Windows use the default mode.)
if (useWorktree) args.push('-v', `${repo}:${repo}`);
args.push(
  '-e', 'ANTHROPIC_API_KEY',
  '-e', 'ISSFLOW_HEADLESS=1'
);
// pass git identity through when the host has one configured.
for (const k of ['GIT_AUTHOR_NAME', 'GIT_AUTHOR_EMAIL', 'GIT_COMMITTER_NAME', 'GIT_COMMITTER_EMAIL'])
  if (process.env[k]) args.push('-e', k);
args.push(IMAGE, '-p', `/feature ${doc}`, '--dangerously-skip-permissions');

const res = run('docker', args);
if (res.status !== 0) die(`run exited with status ${res.status} — see output above; blockers land in docs/features/<slug>/BLOCKED.md`);
console.log('feature-docker: done. Review the feature branch, then run /uat with the TEST-PLAN.');
