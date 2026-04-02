#!/usr/bin/env node
const workflow = require('../internal/ai-protocol-workflow');
const runner = require('./task-orchestrator-runner');

function parseArgs(argv) {
  const args = [...argv];
  const options = {
    target: '.',
    userInput: null,
    json: false,
    pretty: true,
  };

  while (args.length > 0) {
    const arg = args.shift();

    if (!arg.startsWith('-') && options.target === '.') {
      options.target = arg;
      continue;
    }

    switch (arg) {
      case '--target':
        options.target = args.shift();
        break;
      case '--user-input':
        options.userInput = args.shift();
        break;
      case '--json':
        options.json = true;
        options.pretty = false;
        break;
      case '--pretty':
        options.pretty = true;
        options.json = false;
        break;
      case '--help':
      case '-h':
        options.help = true;
        break;
      default:
        throw new Error(`Unknown argument: ${arg}`);
    }
  }

  return options;
}

function printUsage(mode) {
  const command = mode === 'advance'
    ? 'protocol-advance'
    : mode === 'update'
    ? 'protocol-update'
    : 'protocol-step';
  console.log(`Usage:
  ai-spec ${command} [target] [options]

Options:
  --target <dir>         Target project directory (default: .)
  --user-input <text>    User requirement or follow-up text
  --json                 Print JSON only
  --pretty               Print readable summary (default)
  --help                 Show this help
`);
}

function formatActor(actor) {
  if (!actor) {
    return '(none)';
  }
  const type = actor.type ? ` [${actor.type}]` : '';
  const label = actor.label ? ` | ${actor.label}` : '';
  return `${actor.id || '(unknown)'}${type}${label}`;
}

function formatTargets(items) {
  if (!Array.isArray(items) || items.length === 0) {
    return ['(none)'];
  }

  return items.map((item) => {
    if (item.kind === 'symbolic') {
      return item.value;
    }
    return item.rel_path || item.path || '(unknown)';
  });
}

function printTurn(turn) {
  console.log(`kind: ${turn.kind}`);
  console.log(`status: ${turn.status}`);
  console.log(`mode: ${turn.mode}`);
  console.log(`actor: ${formatActor(turn.actor)}`);
  if (turn.announcements?.enter) {
    console.log(`announce_enter: ${turn.announcements.enter}`);
  }
  if (turn.announcements?.exit) {
    console.log(`announce_exit: ${turn.announcements.exit}`);
  }
  console.log(`command: ${turn.command || '(none)'}`);
  console.log(`reason: ${turn.reason || '(none)'}`);
  console.log('summary:');
  for (const [key, value] of Object.entries(turn.summary || {})) {
    console.log(`  ${key}: ${value ?? '(none)'}`);
  }
  console.log('reads:');
  for (const item of formatTargets(turn.reads)) {
    console.log(`  - ${item}`);
  }
  console.log('writes:');
  for (const item of formatTargets(turn.writes)) {
    console.log(`  - ${item}`);
  }
  console.log('expected_output:');
  for (const item of turn.expected_output || ['(none)']) {
    console.log(`  - ${item}`);
  }
  if (turn.commands) {
    console.log('commands:');
    for (const [key, value] of Object.entries(turn.commands)) {
      console.log(`  ${key}: ${value}`);
    }
  }
  console.log(`requires_advance: ${turn.requires_advance ? 'yes' : 'no'}`);
  if (turn.finalize_contract) {
    console.log('finalize_contract:');
    console.log(`  required: ${turn.finalize_contract.required ? 'yes' : 'no'}`);
    console.log(`  advance_command: ${turn.finalize_contract.advance_command || '(none)'}`);
    console.log(`  update_command: ${turn.finalize_contract.update_command || '(none)'}`);
    console.log(`  when: ${turn.finalize_contract.when || '(none)'}`);
  }
  if (turn.execution_contract) {
    console.log('execution_contract:');
    console.log(`  kind: ${turn.execution_contract.kind || '(none)'}`);
    console.log(`  delivery_profile: ${turn.execution_contract.delivery_profile || '(none)'}`);
    console.log(`  artifact_profile: ${turn.execution_contract.artifact_profile || '(none)'}`);
    console.log(`  write_to: ${turn.execution_contract.write_to || '(none)'}`);
    console.log(`  next_advance_command: ${turn.execution_contract.next_advance_command || '(none)'}`);
    console.log('  required_fields:');
    for (const item of turn.execution_contract.required_fields || ['(none)']) {
      console.log(`    - ${item}`);
    }
    console.log('  required_artifacts:');
    for (const item of turn.execution_contract.required_artifacts || ['(none)']) {
      console.log(`    - ${item}`);
    }
  }
  if (turn.guidance) {
    if (turn.guidance.routing) {
      console.log(`guidance.routing.delivery_profile: ${turn.guidance.routing.delivery_profile || '(none)'}`);
      console.log(`guidance.routing.artifact_profile: ${turn.guidance.routing.artifact_profile || '(none)'}`);
      console.log(`guidance.routing.complexity: ${turn.guidance.routing.complexity || '(none)'}`);
    }
    if (turn.guidance.role?.goal) {
      console.log(`guidance.goal: ${turn.guidance.role.goal}`);
    }
    if (turn.guidance.role?.delivery_profile) {
      console.log(`guidance.role.delivery_profile: ${turn.guidance.role.delivery_profile}`);
    }
    if (turn.guidance.role?.artifact_profile) {
      console.log(`guidance.role.artifact_profile: ${turn.guidance.role.artifact_profile}`);
    }
    if (Array.isArray(turn.guidance.rule_hints) && turn.guidance.rule_hints.length > 0) {
      console.log('guidance.rule_hints:');
      for (const item of turn.guidance.rule_hints) {
        console.log(`  - ${item}`);
      }
    }
    if (turn.guidance.openspec_rules?.source) {
      console.log(`guidance.openspec_rules.source: ${turn.guidance.openspec_rules.source}`);
    }
    if (Array.isArray(turn.guidance.openspec_rules?.sections) && turn.guidance.openspec_rules.sections.length > 0) {
      console.log('guidance.openspec_rules.sections:');
      for (const section of turn.guidance.openspec_rules.sections) {
        console.log(`  - ${section.name}`);
      }
    }
  }
}

function printStep(result) {
  console.log(`kind: ${result.kind}`);
  console.log(`target: ${result.target}`);
  console.log(`runner advanced: ${result.advanced ? 'yes' : 'no'}`);
  if (result.advanced) {
    console.log(`advanced status: ${result.advanced.status || '(none)'}`);
    console.log(`consumed kind: ${result.advanced.consumed?.kind || '(none)'}`);
  }
  console.log('runner_status:');
  console.log(`  run_id: ${result.runner_status?.current?.run_id || '(none)'}`);
  console.log(`  run_status: ${result.runner_status?.current?.run_status || '(none)'}`);
  console.log(`  current_role: ${result.runner_status?.current?.current_role || '(none)'}`);
  console.log(`  pending_inputs: ${(result.runner_status?.pending_inputs || []).length}`);
  console.log('turn:');
  printTurn(result.turn);
}

function printUpdate(result) {
  console.log(`kind: ${result.kind}`);
  console.log(`target: ${result.target}`);
  console.log(`updated: ${result.updated?.status || '(none)'}`);
  console.log(`run_id: ${result.updated?.state?.run_id || '(none)'}`);
  console.log(`latest_user_input: ${result.updated?.state?.trigger?.latest_user_input || '(none)'}`);
  console.log('turn:');
  printTurn(result.turn);
}

function buildStepPreview(options) {
  return {
    kind: 'ai-protocol-step-preview',
    target: options.target,
    runner_status: runner.buildStatus(options.target),
    turn: workflow.buildProtocolTurn({
      target: options.target,
      userInput: options.userInput || null,
    }),
  };
}

function main(mode, argv) {
  const options = parseArgs(argv);
  if (options.help) {
    printUsage(mode);
    return 0;
  }

  const result = mode === 'advance'
    ? workflow.advanceProtocolStep({
      target: options.target,
      userInput: options.userInput || null,
    })
    : mode === 'update'
    ? workflow.updateProtocolInput({
      target: options.target,
      userInput: options.userInput || null,
    })
    : buildStepPreview(options);

  if (options.json) {
    process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
  } else {
    if (mode === 'advance') {
      printStep(result);
    } else if (mode === 'update') {
      printUpdate(result);
    } else {
      printTurn(result.turn);
    }
  }

  return 0;
}

module.exports = {
  main,
};
