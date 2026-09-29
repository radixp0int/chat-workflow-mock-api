import assert from 'node:assert/strict';
import { test } from 'node:test';
import { mkdtempSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { execFileSync, spawnSync } from 'node:child_process';
const guard = resolve('scripts/check-conflicts.mjs');
test('conflict guard reads staged blobs even when working file is clean', () => {
  const cwd = mkdtempSync(join(tmpdir(), 'demo-guard-'));
  const git = (...args) => execFileSync('git', args, { cwd });
  try {
    git('init', '-q');
    writeFileSync(join(cwd, 'file.ts'), '<'.repeat(7) + ' branch\nconst x = 1;\n');
    git('add', 'file.ts');
    writeFileSync(join(cwd, 'file.ts'), 'const x = 1;\n');
    assert.equal(spawnSync(process.execPath, [guard, '--staged'], { cwd }).status, 1);
    git('add', 'file.ts');
    assert.equal(spawnSync(process.execPath, [guard, '--staged'], { cwd }).status, 0);
    writeFileSync(join(cwd, 'untracked.ts'), '>'.repeat(7) + ' branch\n');
    assert.equal(spawnSync(process.execPath, [guard], { cwd }).status, 1);
  } finally {
    rmSync(cwd, { recursive: true, force: true });
  }
});
