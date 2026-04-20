#!/usr/bin/env node
const path = require('path');

const pkgRoot = path.join(__dirname, '..');
const args = process.argv.slice(2);
const env = { ...process.env, BR_AI_SPEC_LOCAL: pkgRoot };
const opts = { stdio: 'inherit', cwd: process.cwd(), env };
const INSTALL_COMMANDS = new Set(['init', 'update', 'check', 'uninstall', 'sync', 'help']);

(async () => {
  try {
    if (args.length === 0 || INSTALL_COMMANDS.has(args[0])) {
      const installWorkflow = require('./install-workflow');
      process.exit(await installWorkflow.main(args));
    }

    if (args[0] === 'runtime-state') {
      const runtimeState = require('./runtime-state');
      process.exit(runtimeState.main(args.slice(1)));
    }

    if (args[0] === 'validate-registry') {
      const validateRegistry = require('./validate-registry');
      process.exit(validateRegistry.main(args.slice(1)));
    }

    if (args[0] === 'task-orchestrator-adapter') {
      throw new Error('task-orchestrator-adapter is a legacy internal fallback; use ai-spec-auto protocol-step / protocol-advance / protocol-update instead');
    }

    if (args[0] === 'task-orchestrator-extractor') {
      throw new Error('task-orchestrator-extractor is a legacy internal fallback; use ai-spec-auto protocol-step / protocol-advance / protocol-update instead');
    }

    if (args[0] === 'task-orchestrator-runner') {
      throw new Error('task-orchestrator-runner is an internal runtime module; call it from the AI host layer instead of ai-spec-auto CLI');
    }

    if (args[0] === 'protocol-step') {
      const protocolWorkflow = require('./protocol-workflow');
      process.exit(protocolWorkflow.main('step', args.slice(1)));
    }

    if (args[0] === 'protocol-advance') {
      const protocolWorkflow = require('./protocol-workflow');
      process.exit(protocolWorkflow.main('advance', args.slice(1)));
    }

    if (args[0] === 'protocol-update') {
      const protocolWorkflow = require('./protocol-workflow');
      process.exit(protocolWorkflow.main('update', args.slice(1)));
    }

    if (args[0] === 'protocol-stop') {
      const protocolWorkflow = require('./protocol-workflow');
      process.exit(protocolWorkflow.main('stop', args.slice(1)));
    }

    if (args[0] === 'protocol-status') {
      const protocolWorkflow = require('./protocol-workflow');
      process.exit(protocolWorkflow.main('status', args.slice(1)));
    }

    if (args[0] === 'expert-dispatch') {
      const expertDispatch = require('./expert-dispatch');
      process.exit(expertDispatch.main(args.slice(1)));
    }

    if (args[0] === 'expert-executor') {
      const expertExecutor = require('./expert-executor');
      process.exit(expertExecutor.main(args.slice(1)));
    }

    if (args[0] === 'demo-runtime-smoke') {
      const demoRuntimeSmoke = require('./demo-runtime-smoke');
      process.exit(demoRuntimeSmoke.main(args.slice(1)));
    }

    if (args[0] === 'archive-change') {
      const archiveChange = require('./archive-change');
      process.exit(archiveChange.main(args.slice(1)));
    }

    if (args[0] === 'visual-bridge') {
      const visualBridge = require('./visual-bridge');
      process.exit(await visualBridge.main(args.slice(1)));
    }

    throw new Error(`Unknown command: ${args[0]}`);
  } catch (e) {
    if (e && e.message && !e.cmd) {
      console.error(e.message);
    }
    process.exit(e.status || 1);
  }
})();
