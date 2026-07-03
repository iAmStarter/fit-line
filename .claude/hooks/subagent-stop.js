#!/usr/bin/env node
// SubagentStop hook. Appends a trace line, keeps the log bounded. Cross-platform.
'use strict';
const fs = require('fs');
const path = require('path');

try { process.chdir(process.env.CLAUDE_PROJECT_DIR || '.'); } catch (_) {}

fs.mkdirSync('docs/.snapshots', { recursive: true });
const log = path.join('docs/.snapshots', 'agent-trace.log');
const d = new Date();
const p2 = (n) => String(n).padStart(2, '0');
const ts = `${p2(d.getHours())}:${p2(d.getMinutes())}:${p2(d.getSeconds())}`;

let lines = [];
try { lines = fs.readFileSync(log, 'utf8').split('\n').filter(Boolean); } catch (_) {}
lines.push(`${ts} subagent finished`);
fs.writeFileSync(log, lines.slice(-50).join('\n') + '\n');
