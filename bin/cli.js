#!/usr/bin/env node
const { execFileSync } = require('child_process');
const path = require('path');

const pkgRoot = path.join(__dirname, '..');
const args = process.argv.slice(2);
const env = { ...process.env, BR_AI_SPEC_LOCAL: pkgRoot };
const opts = { stdio: 'inherit', cwd: process.cwd(), env };

try {
  if (args[0] === 'runtime-state') {
    const runtimeState = require('./runtime-state');
    process.exit(runtimeState.main(args.slice(1)));
  }

  if (args[0] === 'sync') {
    const sync = require('./sync');
    process.exit(sync.main(args.slice(1)));
  }

  if (args[0] === 'validate-registry') {
    const validateRegistry = require('./validate-registry');
    process.exit(validateRegistry.main(args.slice(1)));
  }

  if (args[0] === 'task-orchestrator-adapter') {
    const adapter = require('./task-orchestrator-adapter');
    process.exit(adapter.main(args.slice(1)));
  }

  if (args[0] === 'task-orchestrator-extractor') {
    const extractor = require('./task-orchestrator-extractor');
    process.exit(extractor.main(args.slice(1)));
  }

  if (process.platform === 'win32') {
    const ps1 = path.join(pkgRoot, 'install.ps1');
    execFileSync('powershell', [
      '-ExecutionPolicy', 'Bypass', '-File', ps1, ...args
    ], opts);
  } else {
    const sh = path.join(pkgRoot, 'install.sh');
    execFileSync('bash', [sh, ...args], opts);
  }
} catch (e) {
  process.exit(e.status || 1);
}
