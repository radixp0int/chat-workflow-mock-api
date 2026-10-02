import { execFileSync } from 'node:child_process';
import { readdirSync, readFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';
const staged = process.argv.includes('--staged');
const git = (...args) => execFileSync('git', args, { encoding: 'utf8' });
let failed = false;
if (existsSync('.git')) {
  if (git('ls-files', '-u').trim()) {
    console.error('Unmerged index entries found. Resolve them before committing.');
    failed = true;
  }
  for (const state of ['MERGE_HEAD', 'REBASE_HEAD', 'CHERRY_PICK_HEAD', 'REVERT_HEAD']) {
    if (existsSync(git('rev-parse', '--git-path', state).trim())) {
      console.error(`Unfinished Git operation: ${state}`);
      failed = true;
    }
  }
}
function walk(dir) {
  return readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    if (['.git', 'node_modules', 'dist', 'coverage'].includes(entry.name)) return [];
    const path = join(dir, entry.name);
    return entry.isDirectory() ? walk(path) : [path];
  });
}
const files = staged
  ? git('diff', '--cached', '--name-only', '--diff-filter=ACMR', '-z').split('\0').filter(Boolean)
  : walk('.');
for (const file of files) {
  const text = staged ? git('show', `:${file}`) : readFileSync(file, 'utf8');
  if (text.includes('\0')) continue;
  if (/^(?:<{7,}|>{7,}|\|{7,})(?: .*|$)|^={7}$/m.test(text)) {
    console.error(`Conflict marker found in ${file}`);
    failed = true;
  }
}
if (failed) process.exitCode = 1;
