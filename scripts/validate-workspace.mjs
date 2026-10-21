#!/usr/bin/env node
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

const root = process.cwd();
const run = (cmd, args, label, optional = false) => {
  const result = spawnSync(cmd, args, { cwd: root, encoding: 'utf8' });
  if (result.error?.code === 'ENOENT' && optional) {
    console.log(`SKIP ${label}: ${cmd} is not installed in this environment.`);
    return true;
  }
  if (result.stdout) process.stdout.write(result.stdout);
  if (result.stderr) process.stderr.write(result.stderr);
  if (result.status !== 0) {
    console.error(`FAIL ${label} (exit ${result.status ?? 'unknown'})`);
    process.exitCode = 1;
    return false;
  }
  console.log(`PASS ${label}`);
  return true;
};

for (const file of ['web/firebase-config.js', 'web/tiktok-label-import.js', 'web/roll-platform-bridge.js', 'scripts/preflight.mjs', 'scripts/run-business-tests.mjs']) {
  run(process.execPath, ['--check', file], `JavaScript syntax: ${file}`);
}
run(process.execPath, ['scripts/preflight.mjs'], 'workspace preflight');
run(process.execPath, ['scripts/run-business-tests.mjs'], 'business and iOS contract suite');

// Parse executable inline script tags so edits in index.html get syntax-checked too.
const html = fs.readFileSync(path.join(root, 'web/index.html'), 'utf8');
const blocks = [];
const scriptRegex = /<script\b([^>]*)>([\s\S]*?)<\/script\s*>/gi;
for (const match of html.matchAll(scriptRegex)) {
  const attrs = match[1] || '';
  const body = match[2] || '';
  if (/\bsrc\s*=/.test(attrs) || !body.trim()) continue;
  const type = attrs.match(/\btype\s*=\s*["']?([^\s"'>]+)/i)?.[1]?.toLowerCase();
  if (type && !['text/javascript', 'application/javascript', 'module'].includes(type)) continue;
  blocks.push(body);
}
const temp = fs.mkdtempSync(path.join(os.tmpdir(), 'roll-ios-inline-'));
try {
  for (let i = 0; i < blocks.length; i++) {
    const file = path.join(temp, `${i + 1}.js`);
    fs.writeFileSync(file, blocks[i]);
    run(process.execPath, ['--check', file], `inline JavaScript block ${i + 1}`);
  }
  console.log(`Inline JavaScript blocks checked: ${blocks.length}`);
} finally {
  fs.rmSync(temp, { recursive: true, force: true });
}

run('python3', ['reference/tools/preflight.py'], 'saved Android V26.2.92 reference preflight', true);
run('swiftc', ['-frontend', '-parse', 'native/ios/Plugins/RollPlatformPlugin.swift'], 'Swift syntax parse only (not SDK typecheck/build)', true);

if (process.exitCode) process.exit(process.exitCode);
console.log('VALIDATION PASS. This script does not generate an Xcode project, compile/sign an IPA, configure Drive OAuth, or test a physical iPhone.');
