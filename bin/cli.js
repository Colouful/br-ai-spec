#!/usr/bin/env node
const { execFileSync } = require('child_process');
const path = require('path');

const pkgRoot = path.join(__dirname, '..');
const args = process.argv.slice(2);
const env = { ...process.env, BR_AI_SPEC_LOCAL: pkgRoot };
const opts = { stdio: 'inherit', cwd: process.cwd(), env };

try {
  if (process.platform === 'win32') {
    const ps1 = path.join(pkgRoot, 'install.ps1');
    const psArgs = ['-NoProfile', '-ExecutionPolicy', 'Bypass', '-File', ps1, ...args];
    try {
      execFileSync('pwsh', psArgs, opts);
    } catch (e) {
      if (e.code !== 'ENOENT') {
        process.exit(e.status ?? 1);
      }
      execFileSync('powershell', psArgs, opts);
    }
  } else {
    const sh = path.join(pkgRoot, 'install.sh');
    execFileSync('bash', [sh, ...args], opts);
  }
} catch (e) {
  process.exit(e.status || 1);
}
