#!/usr/bin/env node
const fs = require('fs');
const path = require('path');
const extractor = require('./task-orchestrator-extractor');
const adapter = require('./task-orchestrator-adapter');
const expertDispatch = require('./expert-dispatch');
const expertExecutor = require('./expert-executor');
const {
  resolveRuntimePaths,
  getExistingPath,
  getCandidatePaths,
  shouldPersistHistory,
} = require('./runtime-paths');

const INBOX_SPECS = [
  {
    kind: 'task-orchestrator-reply',
    pathKey: 'tmpTaskOrchestratorReply',
    producer: 'task-orchestrator',
  },
  {
    kind: 'expert-dispatch',
    pathKey: 'tmpCurrentDispatch',
    producer: 'task-orchestrator',
  },
  {
    kind: 'expert-execution',
    pathKey: 'tmpCurrentExecution',
    producer: 'current-expert',
  },
  {
    kind: 'task-orchestrator-runtime-action',
    pathKey: 'tmpCurrentRuntimeAction',
    producer: 'task-orchestrator',
  },
];

const TERMINAL_STATUSES = new Set(['success', 'failed', 'cancelled']);

function printUsage() {
  console.log(`Internal usage:
  require('./task-orchestrator-runner').advanceRunner({ target })
  require('./task-orchestrator-runner').buildStatus(target)
  require('./task-orchestrator-runner').replayReplies({ target, replies })

Options:
  --reply <file>         Path to a task-orchestrator Markdown reply file; can be repeated
  --target <dir>         Target project directory (default: .)
  --json                 Print JSON result
  --pretty               Print readable summary (default)
  --help                 Show this help
`);
}

function parseArgs(argv) {
  const args = [...argv];
  const command = args.shift();
  const options = {
    target: '.',
    replies: [],
    pretty: true,
    json: false,
  };

  while (args.length > 0) {
    const arg = args.shift();
    switch (arg) {
      case '--reply':
        options.replies.push(args.shift());
        break;
      case '--target':
        options.target = args.shift();
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

  return { command, options };
}

function readTextFile(filePath, label) {
  const raw = fs.readFileSync(filePath, 'utf8');
  if (!raw.trim()) {
    throw new Error(`${label} is empty: ${filePath}`);
  }
  return raw;
}

function readJsonFile(filePath, label) {
  const raw = fs.readFileSync(filePath, 'utf8');
  try {
    return JSON.parse(raw);
  } catch (error) {
    throw new Error(`${label} is not valid JSON: ${filePath}`);
  }
}

function ensureDir(dirPath) {
  fs.mkdirSync(dirPath, { recursive: true });
}

function loadJsonIfExists(filePath, label) {
  if (!fs.existsSync(filePath)) {
    return null;
  }
  return readJsonFile(filePath, label);
}

function resolvePendingInputs(targetDir) {
  const runtimePaths = resolveRuntimePaths(targetDir);
  const pending = [];

  for (const spec of INBOX_SPECS) {
    const entry = runtimePaths[spec.pathKey];
    for (const candidatePath of getCandidatePaths(entry)) {
      if (!fs.existsSync(candidatePath)) {
        continue;
      }

      pending.push({
        ...spec,
        path: candidatePath,
        relPath: candidatePath === entry.path ? entry.relPath : entry.legacyRelPath,
        exists: true,
      });
      break;
    }
  }

  return pending;
}

function loadCurrentArtifacts(targetDir) {
  const runtimePaths = resolveRuntimePaths(targetDir);
  return {
    run: loadJsonIfExists(runtimePaths.currentRun.path, 'current run-state'),
    dispatch: loadJsonIfExists(getExistingPath(runtimePaths.currentDispatch), 'current dispatch'),
    execution: loadJsonIfExists(getExistingPath(runtimePaths.currentExecutionJson), 'current execution'),
    runtimeAction: loadJsonIfExists(getExistingPath(runtimePaths.currentRuntimeActionJson), 'current runtime action'),
  };
}

function buildNextExpected(targetDir) {
  const pendingInputs = resolvePendingInputs(targetDir);
  const runtimePaths = resolveRuntimePaths(targetDir);
  if (pendingInputs.length > 0) {
    return {
      producer: 'runner',
      files: pendingInputs.map((item) => item.relPath),
      reason: 'runner inbox still has pending input; consume it before requesting new AI output',
    };
  }

  const current = loadCurrentArtifacts(targetDir);

  if (!current.run) {
    return {
      producer: 'task-orchestrator',
      files: [runtimePaths.tmpTaskOrchestratorReply.relPath],
      reason: 'no current run-state yet; waiting for task-orchestrator bootstrap or runtime reply',
    };
  }

  if (TERMINAL_STATUSES.has(current.run.status)) {
    return {
      producer: null,
      files: [],
      reason: 'run is already in terminal state',
    };
  }

  if (current.execution) {
    return {
      producer: 'task-orchestrator',
      files: [
        runtimePaths.tmpTaskOrchestratorReply.relPath,
        runtimePaths.tmpCurrentRuntimeAction.relPath,
      ],
      reason: 'expert execution has been recorded; waiting for task-orchestrator runtime action',
    };
  }

  if (current.dispatch) {
    return {
      producer: current.dispatch.role?.id || 'current-expert',
      files: [runtimePaths.tmpCurrentExecution.relPath],
      reason: 'current expert dispatch is active; waiting for expert execution output',
    };
  }

  if (current.run.pending_gate) {
    return {
      producer: 'task-orchestrator',
      files: [
        runtimePaths.tmpTaskOrchestratorReply.relPath,
        runtimePaths.tmpCurrentRuntimeAction.relPath,
      ],
      reason: `run is waiting at approval gate "${current.run.pending_gate}"`,
    };
  }

  return {
    producer: 'task-orchestrator',
    files: [runtimePaths.tmpCurrentDispatch.relPath],
    reason: 'run-state is ready for the next expert dispatch',
  };
}

function buildStatus(targetDir) {
  const pendingInputs = resolvePendingInputs(targetDir);
  const current = loadCurrentArtifacts(targetDir);
  const nextExpected = buildNextExpected(targetDir);

  return {
    kind: 'task-orchestrator-runner-status',
    status: pendingInputs.length > 1 ? 'blocked' : 'ready',
    target: targetDir,
    pending_inputs: pendingInputs.map((item) => ({
      kind: item.kind,
      producer: item.producer,
      path: item.relPath,
    })),
    current: {
      run_id: current.run?.run_id || null,
      run_status: current.run?.status || null,
      current_role: current.run?.current_role || null,
      pending_gate: current.run?.pending_gate || null,
      dispatch_role: current.dispatch?.role?.id || null,
      execution_role: current.execution?.role?.id || null,
      runtime_action: current.runtimeAction?.action || null,
    },
    next_expected: nextExpected,
  };
}

function archiveConsumedInput(targetDir, filePath, kind) {
  if (!shouldPersistHistory()) {
    fs.unlinkSync(filePath);
    return null;
  }

  const runtimePaths = resolveRuntimePaths(targetDir);
  const consumedDir = runtimePaths.runnerConsumedDir.path;
  ensureDir(consumedDir);

  const stamp = new Date().toISOString().replace(/[:.]/g, '-');
  const archivedPath = path.join(consumedDir, `${stamp}__${kind}__${path.basename(filePath)}`);
  fs.renameSync(filePath, archivedPath);

  return archivedPath;
}

function summarizeAppliedState(applied) {
  if (!applied || !applied.result || !applied.result.state) {
    return null;
  }

  return {
    adapter_action: applied.adapter_action,
    run_id: applied.result.state.run_id || null,
    status: applied.result.state.status || null,
    current_role: applied.result.state.current_role || null,
    pending_gate: applied.result.state.pending_gate || null,
  };
}

function advanceRunner(options) {
  const targetDir = path.resolve(process.cwd(), options.target || '.');
  const pendingInputs = resolvePendingInputs(targetDir);

  if (pendingInputs.length === 0) {
    return {
      kind: 'task-orchestrator-runner-advance-result',
      status: 'idle',
      target: targetDir,
      consumed: null,
      recorded: null,
      applied: null,
      next_expected: buildNextExpected(targetDir),
    };
  }

  if (pendingInputs.length > 1) {
    const pendingLabels = pendingInputs.map((item) => item.relPath).join(', ');
    throw new Error(`runner inbox has multiple pending inputs: ${pendingLabels}`);
  }

  const pending = pendingInputs[0];
  let recorded = null;
  let applied = null;

  if (pending.kind === 'task-orchestrator-reply') {
    const replyText = readTextFile(pending.path, 'task-orchestrator reply');
    const extracted = extractor.extractPayloadFromText(replyText, pending.path);

    if (extracted.action === 'bootstrap') {
      applied = adapter.attachDispatch(adapter.applyPayload({
        action: extracted.action,
        payload: extracted.payload,
        options: { target: targetDir },
        payloadSource: pending.path,
      }), { target: targetDir });
    } else {
      recorded = {
        runtime_action: expertExecutor.applyRuntimeActionData({
          target: targetDir,
          payloadData: extracted.payload,
          source: pending.path,
        }),
      };
      applied = adapter.attachDispatch(adapter.applyPayload({
        action: recorded.runtime_action.payload.action,
        payload: recorded.runtime_action.payload,
        options: { target: targetDir },
        payloadSource: pending.path,
      }), { target: targetDir });
    }
  } else if (pending.kind === 'expert-dispatch') {
    recorded = {
      dispatch: expertDispatch.applyDispatch({
        target: targetDir,
        payload: pending.path,
      }),
    };
  } else if (pending.kind === 'expert-execution') {
    recorded = {
      execution: expertExecutor.applyExecution({
        target: targetDir,
        payload: pending.path,
      }),
    };
  } else if (pending.kind === 'task-orchestrator-runtime-action') {
    recorded = {
      runtime_action: expertExecutor.applyRuntimeAction({
        target: targetDir,
        payload: pending.path,
      }),
    };
    applied = adapter.attachDispatch(adapter.applyPayload({
      action: recorded.runtime_action.payload.action,
      payload: recorded.runtime_action.payload,
      options: { target: targetDir },
      payloadSource: pending.path,
    }), { target: targetDir });
  } else {
    throw new Error(`unsupported runner input kind: ${pending.kind}`);
  }

  const archivedTo = archiveConsumedInput(targetDir, pending.path, pending.kind);

  return {
    kind: 'task-orchestrator-runner-advance-result',
    status: 'success',
    target: targetDir,
    consumed: {
      kind: pending.kind,
      producer: pending.producer,
      path: pending.relPath,
      archived_to: archivedTo,
    },
    recorded: recorded
      ? {
          dispatch: recorded.dispatch
            ? {
                run_id: recorded.dispatch.payload.run_id,
                role: recorded.dispatch.payload.role.id,
                dispatch_id: recorded.dispatch.payload.dispatch_id,
              }
            : null,
          execution: recorded.execution
            ? {
                run_id: recorded.execution.payload.run_id,
                role: recorded.execution.payload.role.id,
                execution_id: recorded.execution.payload.execution_id,
              }
            : null,
          runtime_action: recorded.runtime_action
            ? {
                run_id: recorded.runtime_action.payload.run_id,
                action: recorded.runtime_action.payload.action,
                action_id: recorded.runtime_action.payload.action_id,
              }
            : null,
        }
      : null,
    applied: summarizeAppliedState(applied),
    next_expected: buildNextExpected(targetDir),
  };
}

function replayReplies(options) {
  const targetDir = path.resolve(process.cwd(), options.target || '.');
  const steps = [];
  let lastApplied = null;

  for (let index = 0; index < options.replies.length; index += 1) {
    const replyPath = path.resolve(process.cwd(), options.replies[index]);
    const replyText = readTextFile(replyPath, 'task-orchestrator reply');
    const extracted = extractor.extractPayloadFromText(replyText, replyPath);
    const applied = adapter.attachDispatch(adapter.applyPayload({
      action: extracted.action,
      payload: extracted.payload,
      options: {
        target: targetDir,
      },
      payloadSource: replyPath,
    }), {
      target: targetDir,
    });

    lastApplied = applied;
    steps.push({
      index: index + 1,
      reply: replyPath,
      extraction: extracted.extraction,
      action: applied.adapter_action,
      run_id: applied.result?.state?.run_id || null,
      status: applied.result?.state?.status || null,
      current_role: applied.result?.state?.current_role || null,
      pending_gate: applied.result?.state?.pending_gate || null,
    });
  }

  const finalState = lastApplied?.result?.state || null;
  return {
    kind: 'task-orchestrator-runner-result',
    status: 'success',
    target: targetDir,
    steps,
    summary: {
      step_count: steps.length,
      run_id: finalState?.run_id || null,
      status: finalState?.status || null,
      current_role: finalState?.current_role || null,
      pending_gate: finalState?.pending_gate || null,
    },
    state: finalState,
  };
}

function printPretty(result) {
  if (result.kind === 'task-orchestrator-runner-status') {
    console.log('task-orchestrator runner status');
    console.log(`  target: ${result.target}`);
    console.log(`  run_id: ${result.current.run_id || 'n/a'}`);
    console.log(`  run_status: ${result.current.run_status || 'n/a'}`);
    console.log(`  current_role: ${result.current.current_role || 'n/a'}`);
    console.log(`  pending_gate: ${result.current.pending_gate || 'n/a'}`);
    console.log(`  pending_inputs: ${result.pending_inputs.length}`);
    for (const pending of result.pending_inputs) {
      console.log(`  pending -> ${pending.kind} @ ${pending.path}`);
    }
    console.log(`  next_expected: ${result.next_expected.producer || 'none'}`);
    for (const file of result.next_expected.files) {
      console.log(`    - ${file}`);
    }
    return;
  }

  if (result.kind === 'task-orchestrator-runner-advance-result') {
    console.log('task-orchestrator runner advanced');
    console.log(`  target: ${result.target}`);
    console.log(`  status: ${result.status}`);
    if (result.consumed) {
      console.log(`  consumed: ${result.consumed.kind} <- ${result.consumed.path}`);
      console.log(`  archived_to: ${result.consumed.archived_to}`);
    }
    if (result.applied) {
      console.log(`  adapter_action: ${result.applied.adapter_action}`);
      console.log(`  run_id: ${result.applied.run_id || 'n/a'}`);
      console.log(`  run_status: ${result.applied.status || 'n/a'}`);
      console.log(`  current_role: ${result.applied.current_role || 'n/a'}`);
    }
    console.log(`  next_expected: ${result.next_expected.producer || 'none'}`);
    for (const file of result.next_expected.files) {
      console.log(`    - ${file}`);
    }
    return;
  }

  console.log('task-orchestrator runner replayed');
  console.log(`  target: ${result.target}`);
  console.log(`  steps: ${result.summary.step_count}`);
  console.log(`  run_id: ${result.summary.run_id || 'n/a'}`);
  console.log(`  status: ${result.summary.status || 'n/a'}`);
  console.log(`  current_role: ${result.summary.current_role || 'n/a'}`);
  console.log(`  pending_gate: ${result.summary.pending_gate || 'n/a'}`);

  for (const step of result.steps) {
    console.log(`  [${step.index}] ${step.action} <- ${step.reply}`);
  }
}

function main(argv = process.argv.slice(2)) {
  const { command, options } = parseArgs(argv);

  if (!command || options.help || command === 'help' || command === '--help' || command === '-h') {
    printUsage();
    return 0;
  }

  if (command === 'status') {
    const result = buildStatus(path.resolve(process.cwd(), options.target || '.'));
    if (options.json) {
      console.log(JSON.stringify(result, null, 2));
    } else {
      printPretty(result);
    }
    return 0;
  }

  if (command === 'advance') {
    const result = advanceRunner(options);
    if (options.json) {
      console.log(JSON.stringify(result, null, 2));
    } else {
      printPretty(result);
    }
    return 0;
  }

  if (command !== 'replay') {
    throw new Error(`Unsupported task-orchestrator-runner command: ${command}`);
  }

  if (options.replies.length === 0) {
    throw new Error('Missing runner input: use --reply <file> at least once');
  }

  const result = replayReplies(options);

  if (options.json) {
    console.log(JSON.stringify(result, null, 2));
  } else {
    printPretty(result);
  }

  return 0;
}

if (require.main === module) {
  try {
    const exitCode = main();
    process.exit(exitCode);
  } catch (error) {
    console.error(`task-orchestrator-runner error: ${error.message}`);
    process.exit(1);
  }
}

module.exports = {
  main,
  parseArgs,
  buildStatus,
  advanceRunner,
  replayReplies,
};
