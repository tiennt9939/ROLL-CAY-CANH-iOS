import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
const root = 'tools';
const files = fs.readdirSync(`reference/${root}`).filter(f => f.endsWith('_test.js')).sort();
let fails = 0;
for (const file of files) {
  const result = spawnSync('node', [path.join(root, file)], {
    cwd: 'reference',
    encoding: 'utf8'
  });
  if (result.status !== 0) {
    fails++;
    console.error(`FAIL ${file}\n${result.stdout || ''}\n${result.stderr || ''}`);
  }
}
console.log(`TOTAL=${files.length} FAILS=${fails}`);
process.exit(fails ? 1 : 0);
