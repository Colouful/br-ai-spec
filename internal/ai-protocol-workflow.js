const fs = require('fs');
const path = require('path');
const runner = require('../bin/task-orchestrator-runner');
const {
  resolveRuntimePaths,
  getExistingPath,
  getExistingRelPath,
} = require('../bin/runtime-paths');
const PACKAGE_ROOT = path.resolve(__dirname, '..');

const START_INSTRUCTION_FILES = [
  '.agents/commands/common/spec-start.md',
  '.agents/roles/common/task-orchestrator.md',
  '.agents/roles/common/task-orchestrator-run-plan-template.md',
  '.agents/roles/common/task-anchor-spec.md',
  '.agents/roles/common/task-orchestrator-bootstrap-payload.md',
  '.agents/roles/common/task-orchestrator-output-extractor-spec.md',
];

const CONTINUE_INSTRUCTION_FILES = [
  '.agents/commands/common/spec-continue.md',
  '.agents/roles/common/task-orchestrator.md',
  '.agents/roles/common/task-orchestrator-adapter-payload.md',
  '.agents/roles/common/task-orchestrator-output-extractor-spec.md',
  '.agents/roles/common/task-orchestrator-runtime-hooks.md',
];

const DISPATCH_INSTRUCTION_FILES = [
  '.agents/roles/common/task-orchestrator.md',
  '.agents/roles/common/expert-dispatch-spec.md',
];

function resolveTargetDir(target) {
  return path.resolve(process.cwd(), target || '.');
}

function readJsonIfExists(filePath) {
  if (!fs.existsSync(filePath)) {
    return null;
  }
  return JSON.parse(fs.readFileSync(filePath, 'utf8'));
}

function buildFileTarget(targetDir, relPath, options = {}) {
  const absolutePath = path.join(targetDir, relPath);
  const exists = fs.existsSync(absolutePath);
  const isDirectory = relPath.endsWith('/') || (exists && fs.statSync(absolutePath).isDirectory());

  return {
    kind: isDirectory ? 'directory' : 'file',
    path: absolutePath,
    rel_path: relPath,
    exists,
    required: Boolean(options.required),
    label: options.label || null,
  };
}

function buildReadableTarget(targetDir, relPath, options = {}) {
  const targetPath = path.join(targetDir, relPath);
  if (fs.existsSync(targetPath)) {
    return {
      ...buildFileTarget(targetDir, relPath, options),
      origin: 'target',
    };
  }

  const packagePath = path.join(PACKAGE_ROOT, relPath);
  if (fs.existsSync(packagePath)) {
    const isDirectory = relPath.endsWith('/') || fs.statSync(packagePath).isDirectory();
    return {
      kind: isDirectory ? 'directory' : 'file',
      path: packagePath,
      rel_path: relPath,
      exists: true,
      required: Boolean(options.required),
      label: options.label || null,
      origin: 'package',
    };
  }

  return {
    ...buildFileTarget(targetDir, relPath, options),
    origin: 'target',
  };
}

function buildSymbolicTarget(value, options = {}) {
  return {
    kind: 'symbolic',
    value,
    required: Boolean(options.required),
    label: options.label || null,
  };
}

function dedupeTargets(targets) {
  const seen = new Set();
  const result = [];

  for (const item of targets) {
    const key = item.kind === 'symbolic'
      ? `symbolic:${item.value}`
      : `${item.kind}:${item.rel_path}`;
    if (seen.has(key)) {
      continue;
    }
    seen.add(key);
    result.push(item);
  }

  return result;
}

function parseScalar(value) {
  const trimmed = value.trim();
  if (trimmed === '') {
    return '';
  }
  if (trimmed === '[]') {
    return [];
  }
  if (
    (trimmed.startsWith('"') && trimmed.endsWith('"')) ||
    (trimmed.startsWith("'") && trimmed.endsWith("'"))
  ) {
    return trimmed.slice(1, -1);
  }
  return trimmed;
}

function parseFrontmatter(fileContent) {
  const lines = fileContent.split('\n');
  if (lines[0] !== '---') {
    return {};
  }

  const endIndex = lines.indexOf('---', 1);
  if (endIndex === -1) {
    return {};
  }

  const frontmatterLines = lines.slice(1, endIndex);
  const data = {};
  let currentKey = null;

  for (const line of frontmatterLines) {
    const listMatch = line.match(/^\s*-\s+(.*)$/);
    if (listMatch && currentKey) {
      if (!Array.isArray(data[currentKey])) {
        data[currentKey] = [];
      }
      data[currentKey].push(parseScalar(listMatch[1]));
      continue;
    }

    const keyMatch = line.match(/^([A-Za-z0-9_-]+):\s*(.*)$/);
    if (!keyMatch) {
      currentKey = null;
      continue;
    }

    const [, key, rawValue] = keyMatch;
    if (rawValue.trim() === '') {
      data[key] = [];
      currentKey = key;
      continue;
    }

    data[key] = parseScalar(rawValue);
    currentKey = null;
  }

  return data;
}

function loadRoleDefinition(targetDir, sourceRelPath) {
  if (!sourceRelPath) {
    return null;
  }

  const sourceTarget = buildReadableTarget(targetDir, sourceRelPath);
  if (!sourceTarget.exists) {
    return null;
  }

  const content = fs.readFileSync(sourceTarget.path, 'utf8');
  const frontmatter = parseFrontmatter(content);

  return {
    id: frontmatter.id || null,
    name: frontmatter.name || null,
    source: sourceRelPath,
    preferred_skills: Array.isArray(frontmatter.preferred_skills) ? frontmatter.preferred_skills : [],
    reads: Array.isArray(frontmatter.reads) ? frontmatter.reads : [],
    writes: Array.isArray(frontmatter.writes) ? frontmatter.writes : [],
    handoff_to: Array.isArray(frontmatter.handoff_to) ? frontmatter.handoff_to : [],
  };
}

function resolveTemplateVariables(value, context) {
  if (typeof value !== 'string') {
    return value;
  }

  return value
    .replace(/<change-id>/g, context.changeId || '__missing_change_id__')
    .replace(/<run-id>/g, context.runId || '__missing_run_id__');
}

function convertTargetSpec(targetDir, rawValue, context, options = {}) {
  const resolvedValue = resolveTemplateVariables(rawValue, context);
  if (resolvedValue === 'code' || resolvedValue === 'implementation-notes') {
    return buildSymbolicTarget(resolvedValue, options);
  }
  return buildFileTarget(targetDir, resolvedValue, options);
}

function buildCommandTargets(targetDir, relPaths) {
  return relPaths.map((relPath) => buildReadableTarget(targetDir, relPath, { required: true }));
}

function loadCurrentArtifacts(targetDir) {
  const runtimePaths = resolveRuntimePaths(targetDir);
  return {
    run: readJsonIfExists(runtimePaths.currentRun.path),
    dispatch: readJsonIfExists(getExistingPath(runtimePaths.currentDispatch)),
    execution: readJsonIfExists(getExistingPath(runtimePaths.currentExecutionJson)),
  };
}

function buildSummary(status) {
  return {
    run_id: status.current.run_id || null,
    run_status: status.current.run_status || null,
    current_role: status.current.current_role || null,
    pending_gate: status.current.pending_gate || null,
    next_expected_producer: status.next_expected.producer || null,
  };
}

function buildStartTurn(targetDir, userInput) {
  const runtimePaths = resolveRuntimePaths(targetDir);
  return {
    kind: 'ai-protocol-turn',
    status: userInput ? 'ready' : 'waiting-input',
    mode: 'start',
    actor: {
      id: 'task-orchestrator',
      type: 'orchestrator',
    },
    command: '/spec-start',
    reason: userInput
      ? 'no active run-state found; start a new AI delivery run from the incoming requirement'
      : 'no active run-state found; waiting for a new requirement input',
    summary: {
      run_id: null,
      run_status: null,
      current_role: null,
      pending_gate: null,
      next_expected_producer: 'task-orchestrator',
    },
    input: {
      user_request: userInput || null,
    },
    reads: buildCommandTargets(targetDir, START_INSTRUCTION_FILES),
    writes: [
      buildFileTarget(targetDir, runtimePaths.tmpTaskOrchestratorReply.relPath, {
        required: true,
        label: 'task-orchestrator reply inbox',
      }),
    ],
    expected_output: [
      '输出 task-orchestrator-bootstrap Markdown reply',
      '在 reply 中包含唯一合法 json 代码块',
      '写入 .ai-spec/internal/tmp/task-orchestrator-reply.md',
    ],
  };
}

function buildDispatchTurn(targetDir, status, currentArtifacts) {
  const runtimePaths = resolveRuntimePaths(targetDir);
  return {
    kind: 'ai-protocol-turn',
    status: 'ready',
    mode: 'dispatch',
    actor: {
      id: 'task-orchestrator',
      type: 'orchestrator',
    },
    command: 'task-orchestrator:dispatch',
    reason: status.next_expected.reason,
    summary: buildSummary(status),
    input: {
      user_request: currentArtifacts.run?.trigger?.raw_input || null,
      flow_id: currentArtifacts.run?.flow?.id || null,
    },
    reads: dedupeTargets([
      ...buildCommandTargets(targetDir, DISPATCH_INSTRUCTION_FILES),
      buildFileTarget(targetDir, path.join('.ai-spec', 'current-run.json'), {
        required: true,
        label: 'current run-state',
      }),
    ]),
    writes: [
      buildFileTarget(targetDir, runtimePaths.tmpCurrentDispatch.relPath, {
        required: true,
        label: 'expert dispatch inbox',
      }),
    ],
    expected_output: [
      '根据 current-run 选择当前专家并产出 expert-dispatch',
      '将当前任务锚点和期望输出裁剪到当前专家可执行粒度',
    ],
  };
}

function buildContinueTurn(targetDir, status, currentArtifacts) {
  const runtimePaths = resolveRuntimePaths(targetDir);
  const expectedOutput = currentArtifacts.run?.pending_gate
    ? ['基于当前审批点产出最小 runtime-action']
    : ['基于当前专家执行结果产出最小 runtime-action'];

  const reads = [
    ...buildCommandTargets(targetDir, CONTINUE_INSTRUCTION_FILES),
    buildFileTarget(targetDir, path.join('.ai-spec', 'current-run.json'), {
      required: true,
      label: 'current run-state',
    }),
  ];

  if (currentArtifacts.execution) {
    reads.push(
      buildFileTarget(targetDir, getExistingRelPath(runtimePaths.currentExecutionJson), {
        required: true,
        label: 'current expert execution',
      }),
    );
  }

  return {
    kind: 'ai-protocol-turn',
    status: 'ready',
    mode: 'continue',
    actor: {
      id: 'task-orchestrator',
      type: 'orchestrator',
    },
    command: '/spec-continue',
    reason: status.next_expected.reason,
    summary: buildSummary(status),
    input: {
      user_request: currentArtifacts.run?.trigger?.raw_input || null,
      current_role: currentArtifacts.run?.current_role || null,
      pending_gate: currentArtifacts.run?.pending_gate || null,
    },
    reads: dedupeTargets(reads),
    writes: [
      buildFileTarget(targetDir, runtimePaths.tmpTaskOrchestratorReply.relPath, {
        required: true,
        label: 'task-orchestrator reply inbox',
      }),
    ],
    expected_output: expectedOutput,
  };
}

function buildExpertTurn(targetDir, status, currentArtifacts) {
  const dispatch = currentArtifacts.dispatch;
  if (!dispatch) {
    throw new Error('Cannot build expert turn without a recorded current expert dispatch');
  }
  const runtimePaths = resolveRuntimePaths(targetDir);

  const roleSource = dispatch.role?.source || null;
  const roleDefinition = loadRoleDefinition(targetDir, roleSource) || {
    id: dispatch.role?.id || null,
    name: dispatch.role?.name || null,
    source: roleSource,
    preferred_skills: Array.isArray(dispatch.role?.preferred_skills) ? dispatch.role.preferred_skills : [],
    reads: [],
    writes: [],
    handoff_to: [],
  };

  const context = {
    changeId: dispatch.task?.change_id || currentArtifacts.run?.task?.change_id || null,
    runId: dispatch.run_id || currentArtifacts.run?.run_id || null,
  };

  const reads = [
    buildFileTarget(targetDir, path.join('.ai-spec', 'current-run.json'), {
      required: true,
      label: 'current run-state',
    }),
    buildFileTarget(targetDir, getExistingRelPath(runtimePaths.currentDispatch), {
      required: true,
      label: 'current expert dispatch',
    }),
  ];

  if (roleDefinition.source) {
    reads.push(buildReadableTarget(targetDir, roleDefinition.source, {
      required: true,
      label: `${dispatch.role.id} role definition`,
    }));
  }

  for (const item of roleDefinition.reads) {
    const resolvedValue = resolveTemplateVariables(item, context);
    if (resolvedValue === 'code' || resolvedValue === 'implementation-notes') {
      reads.push(buildSymbolicTarget(resolvedValue));
    } else {
      reads.push(buildReadableTarget(targetDir, resolvedValue));
    }
  }

  const writes = [
    buildFileTarget(targetDir, runtimePaths.tmpCurrentExecution.relPath, {
      required: true,
      label: 'expert execution inbox',
    }),
  ];

  for (const item of roleDefinition.writes) {
    writes.push(convertTargetSpec(targetDir, item, context));
  }

  return {
    kind: 'ai-protocol-turn',
    status: 'ready',
    mode: 'execute',
    actor: {
      id: dispatch.role.id,
      name: dispatch.role.name || roleDefinition.name || null,
      type: 'expert',
      source: roleDefinition.source || null,
    },
    command: dispatch.role.id,
    reason: status.next_expected.reason,
    summary: buildSummary(status),
    input: {
      user_request: dispatch.task?.raw_goal || currentArtifacts.run?.trigger?.raw_input || null,
      change_id: context.changeId,
      flow_id: dispatch.flow?.id || currentArtifacts.run?.flow?.id || null,
      current_role: dispatch.execution?.current_role || dispatch.role.id,
      next_role: dispatch.execution?.next_role || roleDefinition.handoff_to[0] || null,
    },
    preferred_skills: Array.isArray(dispatch.execution?.skills) && dispatch.execution.skills.length > 0
      ? dispatch.execution.skills
      : roleDefinition.preferred_skills,
    reads: dedupeTargets(reads),
    writes: dedupeTargets(writes),
    expected_output: Array.isArray(dispatch.execution?.expected_output)
      ? dispatch.execution.expected_output
      : [],
    handoff_to: roleDefinition.handoff_to,
  };
}

function buildProtocolTurn(options = {}) {
  const targetDir = resolveTargetDir(options.target);
  const status = runner.buildStatus(targetDir);
  const userInput = options.userInput || null;

  if (status.pending_inputs.length > 0) {
    return {
      kind: 'ai-protocol-turn',
      status: 'blocked',
      mode: 'consume-inbox',
      actor: {
        id: 'runner',
        type: 'runtime',
      },
      command: 'advance-runner',
      reason: status.next_expected.reason,
      summary: buildSummary(status),
      input: {
        pending_inputs: status.pending_inputs,
      },
      reads: [],
      writes: [],
      expected_output: [],
    };
  }

  if (!status.current.run_id) {
    return buildStartTurn(targetDir, userInput);
  }

  if (status.next_expected.producer === null) {
    if (userInput) {
      return buildStartTurn(targetDir, userInput);
    }

    return {
      kind: 'ai-protocol-turn',
      status: 'terminal',
      mode: 'terminal',
      actor: null,
      command: null,
      reason: status.next_expected.reason,
      summary: buildSummary(status),
      input: {
        user_request: null,
      },
      reads: [],
      writes: [],
      expected_output: [],
    };
  }

  const currentArtifacts = loadCurrentArtifacts(targetDir);

  if (status.current.execution_role) {
    return buildContinueTurn(targetDir, status, currentArtifacts);
  }

  if (status.current.dispatch_role) {
    return buildExpertTurn(targetDir, status, currentArtifacts);
  }

  if (status.current.pending_gate) {
    return buildContinueTurn(targetDir, status, currentArtifacts);
  }

  return buildDispatchTurn(targetDir, status, currentArtifacts);
}

function advanceProtocolStep(options = {}) {
  const targetDir = resolveTargetDir(options.target);
  const before = runner.buildStatus(targetDir);
  let advanced = null;

  if (before.pending_inputs.length > 0) {
    advanced = runner.advanceRunner({
      target: targetDir,
    });
  }

  return {
    kind: 'ai-protocol-step',
    target: targetDir,
    advanced,
    runner_status: runner.buildStatus(targetDir),
    turn: buildProtocolTurn({
      target: targetDir,
      userInput: options.userInput || null,
    }),
  };
}

module.exports = {
  buildProtocolTurn,
  advanceProtocolStep,
  loadRoleDefinition,
  parseFrontmatter,
};
