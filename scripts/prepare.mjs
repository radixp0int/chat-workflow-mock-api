import { existsSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
// Do not install hooks in a parent repository when this folder is not its root.
if (existsSync('.git') && process.env.HUSKY !== '0') {
  execFileSync('node', ['node_modules/husky/bin.js'], { stdio: 'inherit' });
}
