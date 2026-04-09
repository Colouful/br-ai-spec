#!/usr/bin/env node
const fs = require('fs');
const path = require('path');
const {
  resolveRuntimePaths,
  getExistingPath,
  getCandidatePaths,
  shouldPersistHistory,
} = require('./runtime-paths');

function printUsage() {
  console.log(`Usage:
  ai-spec runtime-state init --run-plan <file> [options]
  ai-spec runtime-state bootstrap --payload <file> [options]
  ai-spec runtime-state bootstrap --stdin [options]
  ai-spec runtime-state handoff --to-role <role> [options]
  ai-spec runtime-state approve [options]
  ai-spec runtime-state resume [options]
  ai-spec runtime-state gate-blocked [options]
  ai-spec runtime-state complete [options]
  ai-spec runtime-state fail [options]
  ai-spec runtime-state cancel [options]
  ai-spec runtime-state status [options]

Options:
  --target <dir>           Target project directory (default: .)
  --run-plan <file>        Path to run-plan JSON file
  --task-anchor <file>     Optional path to task-anchor JSON file
  --payload <file>         Path to task-orchestrator bootstrap payload JSON file
  --stdin                  Read bootstrap payload JSON from stdin
  --run-id <id>            Override generated run id
  --to-role <role>         Target role for handoff update
  --next-role <role>       Next role after current handoff
  --from-role <role>       Explicit source role override
  --gate <id>              Expected approval gate id
  --pending-gate <id>      Pending approval gate id
  --clear-pending-gate     Clear current pending gate
  --message <text>         Event message override
  --error <text>           Failure detail appended to errors list
  --event-type <type>      Event type override (default: role-handoff)
  --status <status>        planned | running | waiting-approval | blocked | success | failed | cancelled
  --trigger-source <src>   Trigger source (default: ide-skill)
  --entry <entry>          Entry role (default: task-orchestrator)
  --raw-input <text>       Raw user input override
  --change-id <id>         Change id override
  --json                   Print JSON result
  --pretty                 Print readable summary (default)
  --help                   Show this help
`);
}

function parseArgs(argv) {
  const args = [...argv];
  const command = args.shift();
  const options = {
    target: '.',
    triggerSource: 'ide-skill',
    entry: 'task-orchestrator',
    pretty: true,
    json: false,
  };

  while (args.length > 0) {
    const arg = args.shift();
    switch (arg) {
      case '--target':
        options.target = args.shift();
        break;
      case '--run-plan':
        options.runPlan = args.shift();
        break;
      case '--task-anchor':
      case '--anchor':
        options.taskAnchor = args.shift();
        break;
      case '--payload':
        options.payload = args.shift();
        break;
      case '--stdin':
        options.stdin = true;
        break;
      case '--run-id':
        options.runId = args.shift();
        break;
      case '--to-role':
        options.toRole = args.shift();
        break;
      case '--next-role':
        options.nextRole = args.shift();
        break;
      case '--from-role':
        options.fromRole = args.shift();
        break;
      case '--gate':
        options.gate = args.shift();
        break;
      case '--pending-gate':
        options.pendingGate = args.shift();
        break;
      case '--clear-pending-gate':
        options.clearPendingGate = true;
        break;
      case '--message':
        options.message = args.shift();
        break;
      case '--error':
        options.error = args.shift();
        break;
      case '--event-type':
        options.eventType = args.shift();
        break;
      case '--status':
        options.status = args.shift();
        break;
      case '--trigger-source':
        options.triggerSource = args.shift();
        break;
      case '--entry':
        options.entry = args.shift();
        break;
      case '--raw-input':
        options.rawInput = args.shift();
        break;
      case '--change-id':
        options.changeId = args.shift();
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

function readJsonFile(filePath, label) {
  const raw = fs.readFileSync(filePath, 'utf8');
  try {
    return JSON.parse(raw);
  } catch (error) {
    throw new Error(`${label} is not valid JSON: ${filePath}`);
  }
}

function readJsonFromStdin(label) {
  const raw = fs.readFileSync(0, 'utf8');
  if (!raw.trim()) {
    throw new Error(`${label} stdin is empty`);
  }
  try {
    return JSON.parse(raw);
  } catch (error) {
    throw new Error(`${label} stdin is not valid JSON`);
  }
}

function assertRunPlan(runPlan, filePath) {
  if (!runPlan || typeof runPlan !== 'object') {
    throw new Error(`Invalid run-plan object: ${filePath}`);
  }
  if (runPlan.kind !== 'run-plan') {
    throw new Error(`Expected kind "run-plan" but got "${runPlan.kind || 'undefined'}": ${filePath}`);
  }
  if (!runPlan.flow || !runPlan.flow.id) {
    throw new Error(`run-plan is missing flow.id: ${filePath}`);
  }
  if (!runPlan.plan || !runPlan.plan.first_handoff) {
    throw new Error(`run-plan is missing plan.first_handoff: ${filePath}`);
  }
}

function pad2(value) {
  return String(value).padStart(2, '0');
}

function createRunId(now = new Date()) {
  const y = now.getFullYear();
  const m = pad2(now.getMonth() + 1);
  const d = pad2(now.getDate());
  const hh = pad2(now.getHours());
  const mm = pad2(now.getMinutes());
  const ss = pad2(now.getSeconds());
  const rand = Math.random().toString(36).slice(2, 6);
  return `run_${y}${m}${d}_${hh}${mm}${ss}_${rand}`;
}

function slugifyValue(value) {
  return String(value || '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .replace(/-{2,}/g, '-');
}

function deriveChangeId({ explicitChangeId, rawInput, taskType, runId }) {
  const normalizedExplicit = slugifyValue(explicitChangeId);
  if (normalizedExplicit) {
    return normalizedExplicit;
  }

  const normalizedInput = slugifyValue(rawInput);
  if (normalizedInput) {
    return normalizedInput.slice(0, 64);
  }

  const normalizedTaskType = slugifyValue(taskType) || 'change';
  const normalizedRunId = slugifyValue(runId) || 'run';
  return `${normalizedTaskType}-${normalizedRunId}`.slice(0, 96);
}

const FLOW_APPROVAL_RESUME_ROLE_HINTS = {
  'prd-to-delivery': {
    'requirement-analyst': 'frontend-implementer',
    'frontend-implementer': 'code-guardian',
    'code-guardian': 'archive-change',
    'archive-change': 'archive-change',
  },
};

function inferApprovalResumeRole(state, options = {}) {
  if (options.toRole || options.nextRole) {
    return options.toRole || options.nextRole;
  }

  const anchorNextRole = state.anchor?.stage?.next_role || null;
  if (anchorNextRole) {
    return anchorNextRole;
  }

  const flowId = state.flow?.id || null;
  const currentRole = state.current_role || null;
  const hintedRole = flowId && currentRole
    ? FLOW_APPROVAL_RESUME_ROLE_HINTS[flowId]?.[currentRole] || null
    : null;
  if (hintedRole) {
    return hintedRole;
  }

  return state.current_role || state.anchor?.stage?.current_role || state.plan?.first_handoff || null;
}

const MICRO_TASK_TYPES = new Set([
  'page-development',
  'component-development',
  'bugfix',
  'bug-fix',
  'problem-fix',
  'issue-fix',
  'style-update',
  'route-update',
]);

const MICRO_INPUT_PATTERNS = [
  /mock/i,
  /mock数据/,
  /示例数据/,
  /静态/,
  /单页/,
  /单一页面/,
  /简单页面/,
  /简单组件/,
  /列表页面/,
  /登录页面/,
  /注册页面/,
  /商品列表页面/,
  /原型/,
];

const STANDARD_INPUT_PATTERNS = [
  /重构/,
  /权限/,
  /支付/,
  /认证/,
  /oauth/i,
  /短信/,
  /多步骤/,
  /多页面/,
  /复杂/,
  /真实接口/,
  /核心模块/,
  /状态联动/,
  /合规/,
  /安全/,
];

const HIGH_RISK_INPUT_PATTERNS = [
  /支付/,
  /认证/,
  /oauth/i,
  /短信/,
  /权限/,
  /安全/,
  /合规/,
  /风控/,
  /收款/,
  /交易/,
];

const DEFERRED_DETAIL_PATTERNS = [
  /先不说/,
  /先不提供/,
  /暂不说/,
  /暂不提供/,
  /暂未确定/,
  /未明确/,
  /待定/,
  /后续再说/,
  /后面再说/,
];

function inferRiskLevel({ explicitRiskLevel, rawInput, taskType, deliveryProfile }) {
  const normalizedExplicit = String(explicitRiskLevel || '').trim().toLowerCase();
  if (normalizedExplicit === 'low' || normalizedExplicit === 'medium' || normalizedExplicit === 'high') {
    return normalizedExplicit;
  }

  let score = 0;
  const input = String(rawInput || '');
  const normalizedTaskType = String(taskType || '').trim().toLowerCase();

  if (deliveryProfile === 'standard') {
    score += 1;
  }

  if (normalizedTaskType.includes('payment') || normalizedTaskType.includes('auth') || normalizedTaskType.includes('security')) {
    score += 2;
  }

  for (const pattern of HIGH_RISK_INPUT_PATTERNS) {
    if (pattern.test(input)) {
      score += 2;
      break;
    }
  }

  for (const pattern of DEFERRED_DETAIL_PATTERNS) {
    if (pattern.test(input)) {
      score += 2;
      break;
    }
  }

  if (score >= 4) {
    return 'high';
  }
  if (score >= 2) {
    return 'medium';
  }
  return 'low';
}

function inferDeliveryProfile({ explicitProfile, flowId, taskType, rawInput, riskLevel }) {
  const normalizedExplicit = String(explicitProfile || '').trim().toLowerCase();
  if (normalizedExplicit === 'micro' || normalizedExplicit === 'standard') {
    return normalizedExplicit;
  }

  let score = 0;

  if (MICRO_TASK_TYPES.has(String(taskType || '').trim().toLowerCase())) {
    score += 1;
  }

  const input = String(rawInput || '');
  for (const pattern of MICRO_INPUT_PATTERNS) {
    if (pattern.test(input)) {
      score += 2;
      break;
    }
  }

  for (const pattern of STANDARD_INPUT_PATTERNS) {
    if (pattern.test(input)) {
      score -= 2;
      break;
    }
  }

  const normalizedRisk = String(riskLevel || '').trim().toLowerCase();
  if (normalizedRisk === 'low') {
    score += 1;
  } else if (normalizedRisk === 'high') {
    score -= 2;
  }

  if (flowId && flowId !== 'prd-to-delivery') {
    score -= 1;
  }

  return score >= 2 ? 'micro' : 'standard';
}

function inferArtifactProfile({ explicitProfile, deliveryProfile }) {
  const normalizedExplicit = String(explicitProfile || '').trim().toLowerCase();
  if (normalizedExplicit === 'compact' || normalizedExplicit === 'full') {
    return normalizedExplicit;
  }

  return deliveryProfile === 'micro' ? 'compact' : 'full';
}

function inferComplexity({ explicitComplexity, deliveryProfile, riskLevel }) {
  const normalizedExplicit = String(explicitComplexity || '').trim().toLowerCase();
  if (normalizedExplicit === 'low' || normalizedExplicit === 'medium' || normalizedExplicit === 'high') {
    return normalizedExplicit;
  }

  const normalizedRisk = String(riskLevel || '').trim().toLowerCase();
  if (normalizedRisk === 'high') {
    return 'high';
  }
  if (normalizedRisk === 'medium') {
    return 'medium';
  }

  return deliveryProfile === 'micro' ? 'low' : 'medium';
}

function normalizeSpecsArtifactPath(relPath) {
  const value = String(relPath || '').trim();
  if (!value) {
    return null;
  }

  const normalized = value.replace(/[\\/]+$/, '');
  if (/[\\/]specs$/.test(normalized)) {
    return normalized;
  }

  const match = normalized.match(/^(.*[\\/]specs)(?:[\\/].+)?$/);
  return match ? match[1] : normalized;
}

function buildDefaultArtifacts(changeId) {
  if (!changeId) {
    return {
      proposal: null,
      specs: null,
      design: null,
      tasks: null,
      checklist: null,
      iterations: null,
      additional: [],
    };
  }

  const baseDir = `openspec/changes/${changeId}`;
  return {
    proposal: `${baseDir}/proposal.md`,
    specs: `${baseDir}/specs`,
    design: `${baseDir}/design.md`,
    tasks: `${baseDir}/tasks.md`,
    checklist: `${baseDir}/checklist.md`,
    iterations: `${baseDir}/iterations.md`,
    additional: [],
  };
}

function mergeArtifacts(baseArtifacts, inferredArtifacts) {
  const additional = [
    ...(Array.isArray(baseArtifacts?.additional) ? baseArtifacts.additional : []),
    ...(Array.isArray(inferredArtifacts?.additional) ? inferredArtifacts.additional : []),
  ];

  const merged = {
    proposal: inferredArtifacts?.proposal || baseArtifacts?.proposal || null,
    specs: normalizeSpecsArtifactPath(inferredArtifacts?.specs || baseArtifacts?.specs || null),
    design: inferredArtifacts?.design || baseArtifacts?.design || null,
    tasks: inferredArtifacts?.tasks || baseArtifacts?.tasks || null,
    checklist: inferredArtifacts?.checklist || baseArtifacts?.checklist || null,
    iterations: inferredArtifacts?.iterations || baseArtifacts?.iterations || null,
    additional: Array.from(new Set(additional.filter(Boolean))),
  };

  if (merged.additional.length === 0) {
    delete merged.additional;
  }

  return merged;
}

function inferArtifacts(artifacts) {
  const normalized = {
    proposal: null,
    specs: null,
    design: null,
    tasks: null,
    checklist: null,
    iterations: null,
    additional: [],
  };

  if (!artifacts) {
    return normalized;
  }

  if (artifacts && typeof artifacts === 'object' && !Array.isArray(artifacts)) {
    const directKeys = ['proposal', 'specs', 'design', 'tasks', 'checklist', 'iterations'];
    for (const key of directKeys) {
      if (typeof artifacts[key] === 'string' && artifacts[key].trim()) {
        normalized[key] = key === 'specs'
          ? normalizeSpecsArtifactPath(artifacts[key])
          : artifacts[key];
      }
    }

    const additional = artifacts.additional;
    if (typeof additional === 'string' && additional.trim()) {
      normalized.additional.push(additional);
    } else if (Array.isArray(additional)) {
      normalized.additional.push(...additional.filter((item) => typeof item === 'string' && item.trim()));
    }

    if (normalized.additional.length === 0) {
      delete normalized.additional;
    }

    return normalized;
  }

  if (!Array.isArray(artifacts)) {
    return normalized;
  }

  for (const item of artifacts) {
    if (typeof item !== 'string') {
      continue;
    }
    if (item.endsWith('/proposal.md')) {
      normalized.proposal = item;
      continue;
    }
    if (/[\\/]specs(?:[\\/].+)?$/.test(item)) {
      normalized.specs = normalizeSpecsArtifactPath(item);
      continue;
    }
    if (item.endsWith('/design.md')) {
      normalized.design = item;
      continue;
    }
    if (item.endsWith('/tasks.md')) {
      normalized.tasks = item;
      continue;
    }
    if (item.endsWith('/checklist.md')) {
      normalized.checklist = item;
      continue;
    }
    if (item.endsWith('/iterations.md')) {
      normalized.iterations = item;
      continue;
    }
    normalized.additional.push(item);
  }

  if (normalized.additional.length === 0) {
    delete normalized.additional;
  }

  return normalized;
}

function sanitizeAnchor(taskAnchor) {
  if (!taskAnchor || typeof taskAnchor !== 'object') {
    return null;
  }
  return {
    kind: taskAnchor.kind || 'task-anchor',
    task: taskAnchor.task || null,
    stage: taskAnchor.stage || null,
    constraints: taskAnchor.constraints || null,
    artifacts: taskAnchor.artifacts || null,
    expected_output: taskAnchor.expected_output || [],
  };
}

function normalizeBootstrapPayload(payload, sourceLabel) {
  if (!payload || typeof payload !== 'object') {
    throw new Error(`Invalid bootstrap payload: ${sourceLabel}`);
  }

  if (payload.kind === 'run-plan') {
    return {
      runPlan: payload,
      taskAnchor: null,
    };
  }

  const runPlan = payload.run_plan || payload.runPlan || null;
  const taskAnchor = payload.task_anchor || payload.taskAnchor || null;

  if (!runPlan) {
    throw new Error(`Bootstrap payload is missing run_plan: ${sourceLabel}`);
  }

  return { runPlan, taskAnchor };
}

function buildRunState({ runPlan, taskAnchor, options, now, source }) {
  const runId = options.runId || runPlan.run_id || createRunId(now);
  const createdAt = now.toISOString();
  const rawInput =
    options.rawInput ||
    runPlan.task?.raw_input ||
    taskAnchor?.task?.raw_goal ||
    null;
  const changeId = deriveChangeId({
    explicitChangeId: options.changeId || runPlan.task?.change_id || taskAnchor?.task?.change_id || null,
    rawInput,
    taskType: runPlan.task?.type || null,
    runId,
  });
  const deliveryProfile = inferDeliveryProfile({
    explicitProfile: runPlan.delivery_profile || runPlan.flow?.delivery_profile || runPlan.plan?.delivery_profile || null,
    flowId: runPlan.flow?.id || null,
    taskType: runPlan.task?.type || null,
    rawInput,
    riskLevel: runPlan.task?.risk_level || null,
  });
  const riskLevel = inferRiskLevel({
    explicitRiskLevel: runPlan.task?.risk_level || null,
    rawInput,
    taskType: runPlan.task?.type || null,
    deliveryProfile,
  });
  const artifactProfile = inferArtifactProfile({
    explicitProfile: runPlan.artifact_profile || runPlan.plan?.artifact_profile || null,
    deliveryProfile,
  });
  const complexity = inferComplexity({
    explicitComplexity: runPlan.complexity || runPlan.task?.complexity || null,
    deliveryProfile,
    riskLevel,
  });
  const artifacts = mergeArtifacts(buildDefaultArtifacts(changeId), inferArtifacts(runPlan.artifacts));
  const currentRole = runPlan.plan?.first_handoff || null;
  const approvalGates = Array.isArray(runPlan.plan?.approval_gates)
    ? runPlan.plan.approval_gates
    : [];
  const pendingGate =
    options.pendingGate ||
    runPlan.pending_gate ||
    runPlan.plan?.pending_gate ||
    null;
  const sanitizedAnchor = sanitizeAnchor(taskAnchor);
  const anchor = sanitizedAnchor
    ? {
        ...sanitizedAnchor,
        task: {
          ...(sanitizedAnchor.task || {}),
          change_id: sanitizedAnchor.task?.change_id || changeId,
        },
        artifacts: mergeArtifacts(
          buildDefaultArtifacts(changeId),
          inferArtifacts(sanitizedAnchor.artifacts || artifacts),
        ),
      }
    : null;
  const initMessage = source?.bootstrapPayload
    ? 'runtime-state initialized from task-orchestrator bootstrap payload'
    : 'runtime-state initialized from run-plan';

  return {
    schema_version: 1,
    kind: 'run-state',
    run_id: runId,
    mode: runPlan.mode || 'auto',
    delivery_profile: deliveryProfile,
    artifact_profile: artifactProfile,
    complexity,
    status: options.status || runPlan.status || 'planned',
    trigger: {
      source: options.triggerSource,
      entry: options.entry,
      raw_input: rawInput,
      latest_user_input: rawInput,
      latest_input_at: rawInput ? createdAt : null,
    },
    task: {
      change_id: changeId,
      input_kind: runPlan.task?.input_kind || taskAnchor?.task?.input_kind || 'unknown',
      risk_level: riskLevel,
      type: runPlan.task?.type || null,
      complexity,
    },
    flow: {
      id: runPlan.flow?.id || null,
      name: runPlan.flow?.name || null,
      source: runPlan.flow?.source || null,
      delivery_profile: deliveryProfile,
      artifact_profile: artifactProfile,
    },
    plan: {
      required_roles: runPlan.plan?.required_roles || [],
      activated_optional_roles: runPlan.plan?.activated_optional_roles || [],
      skipped_optional_roles: runPlan.plan?.skipped_optional_roles || [],
      approval_gates: approvalGates,
      first_handoff: currentRole,
      delivery_profile: deliveryProfile,
      artifact_profile: artifactProfile,
    },
    current_role: currentRole,
    pending_input_update: false,
    pending_gate: pendingGate,
    artifacts,
    assumptions: Array.isArray(runPlan.assumptions) ? runPlan.assumptions : [],
    missing_inputs: runPlan.missing_inputs || [],
    warnings: runPlan.warnings || [],
    errors: runPlan.errors || [],
    input_updates: [],
    anchor,
    events: [
      {
        at: createdAt,
        type: 'run-created',
        status: options.status || runPlan.status || 'planned',
        message: initMessage,
      },
    ],
    timestamps: {
      created_at: createdAt,
      updated_at: createdAt,
    },
  };
}

function listMissingOpenSpecArtifacts(targetDir, state, artifactKeys) {
  const artifactMap = mergeArtifacts(
    buildDefaultArtifacts(state.task?.change_id || state.anchor?.task?.change_id || null),
    inferArtifacts(state.artifacts || null),
  );
  const missing = [];

  for (const key of artifactKeys) {
    const relPath = artifactMap[key];
    if (!relPath) {
      missing.push(`artifact:${key}`);
      continue;
    }

    const absolutePath = path.join(targetDir, relPath);
    if (!fs.existsSync(absolutePath)) {
      missing.push(relPath);
    }
  }

  return missing;
}

function assertRequiredOpenSpecArtifacts(targetDir, state, action, toRole) {
  if (state.flow?.id !== 'prd-to-delivery') {
    return;
  }

  if (!state.task?.change_id) {
    throw new Error(`Cannot ${action} prd-to-delivery run without task.change_id`);
  }

  let requiredArtifacts = [];
  if (action === 'handoff' && toRole === 'frontend-implementer') {
    requiredArtifacts = ['proposal', 'specs', 'design', 'tasks'];
  } else if (action === 'complete') {
    requiredArtifacts = ['proposal', 'specs', 'design', 'tasks', 'checklist', 'iterations'];
  }

  if (requiredArtifacts.length === 0) {
    return;
  }

  const missingArtifacts = listMissingOpenSpecArtifacts(targetDir, state, requiredArtifacts);
  if (missingArtifacts.length > 0) {
    throw new Error(
      `Cannot ${action} prd-to-delivery run; missing required OpenSpec artifacts: ${missingArtifacts.join(', ')}`,
    );
  }
}

function ensureDir(dirPath) {
  fs.mkdirSync(dirPath, { recursive: true });
}

function writeJsonFile(filePath, value) {
  fs.writeFileSync(filePath, `${JSON.stringify(value, null, 2)}\n`, 'utf8');
}

function readRunStateFile(filePath) {
  const state = readJsonFile(filePath, 'run-state');
  if (!state || typeof state !== 'object' || state.kind !== 'run-state') {
    throw new Error(`Invalid run-state object: ${filePath}`);
  }
  if (!state.run_id) {
    throw new Error(`run-state is missing run_id: ${filePath}`);
  }
  return state;
}

function loadTaskAnchor(taskAnchorPath, taskAnchorData = null) {
  if (taskAnchorData) {
    return taskAnchorData;
  }
  return taskAnchorPath ? readJsonFile(taskAnchorPath, 'task-anchor') : null;
}

function saveUpdatedRunState({ historyRunPath, currentRunPath, syncCurrent, state }) {
  if (historyRunPath) {
    writeJsonFile(historyRunPath, state);
  }
  if (syncCurrent) {
    writeJsonFile(currentRunPath, state);
  }
}

function recordRunInputUpdate(options) {
  if (!options.userInput || !String(options.userInput).trim()) {
    throw new Error('Missing required argument: userInput');
  }

  const targetDir = path.resolve(process.cwd(), options.target || '.');
  const { currentRunPath, historyRunPath, state, syncCurrent } = resolveRunStatePaths(targetDir, options.runId);

  if (['success', 'failed', 'cancelled'].includes(String(state.status || '').toLowerCase())) {
    throw new Error(`Cannot update terminal run: ${state.run_id}`);
  }

  const now = new Date();
  const userInput = String(options.userInput).trim();
  const update = {
    at: now.toISOString(),
    text: userInput,
    source: options.source || 'protocol-update',
  };

  const nextInputUpdates = [...(Array.isArray(state.input_updates) ? state.input_updates : []), update].slice(-20);
  const event = buildStateEvent({
    state,
    options: {
      ...options,
      toRole: state.current_role || state.plan?.first_handoff || null,
      clearPendingGate: false,
      message: `user input updated: ${userInput}`,
    },
    now,
    defaults: {
      status: state.status || 'running',
      eventType: 'user-input-updated',
      message: `user input updated: ${userInput}`,
      pendingGate: state.pending_gate ?? null,
    },
  });

  const updatedState = {
    ...state,
    pending_input_update: true,
    trigger: {
      ...(state.trigger || {}),
      latest_user_input: userInput,
      latest_input_at: now.toISOString(),
    },
    input_updates: nextInputUpdates,
    events: [...(Array.isArray(state.events) ? state.events : []), event],
    timestamps: {
      ...(state.timestamps || {}),
      updated_at: now.toISOString(),
    },
  };

  saveUpdatedRunState({ historyRunPath, currentRunPath, syncCurrent, state: updatedState });

  return {
    status: 'success',
    target: targetDir,
    artifacts: {
      current_run: syncCurrent ? currentRunPath : null,
      run_history: historyRunPath,
    },
    state: updatedState,
    update,
  };
}

function writeRunState({ targetDir, runPlan, taskAnchor, options, source }) {
  const now = new Date();
  const state = buildRunState({ runPlan, taskAnchor, options, now, source });
  const runtimePaths = resolveRuntimePaths(targetDir);
  const persistHistory = shouldPersistHistory();
  if (persistHistory) {
    ensureDir(runtimePaths.runsDir.path);
  }
  ensureDir(path.dirname(runtimePaths.currentRun.path));

  const currentRunPath = runtimePaths.currentRun.path;
  const historyRunPath = persistHistory
    ? path.join(runtimePaths.runsDir.path, `${state.run_id}.json`)
    : null;

  writeJsonFile(currentRunPath, state);
  if (historyRunPath) {
    writeJsonFile(historyRunPath, state);
  }

  return {
    status: 'success',
    target: targetDir,
    artifacts: {
      current_run: currentRunPath,
      run_history: historyRunPath,
    },
    state,
    source: {
      run_plan: source.runPlan || null,
      task_anchor: source.taskAnchor || null,
      bootstrap_payload: source.bootstrapPayload || null,
    },
  };
}

function resolveRunStatePaths(targetDir, runId) {
  const runtimePaths = resolveRuntimePaths(targetDir);
  const aiSpecDir = runtimePaths.aiSpecDir.path;
  const currentRunPath = runtimePaths.currentRun.path;
  let historyRunPath = null;
  let state = null;
  const currentState = fs.existsSync(currentRunPath)
    ? readRunStateFile(currentRunPath)
    : null;

  if (runId) {
    if (currentState && currentState.run_id === runId) {
      state = currentState;
    }
    for (const candidateDir of getCandidatePaths(runtimePaths.runsDir)) {
      const candidatePath = path.join(candidateDir, `${runId}.json`);
      if (fs.existsSync(candidatePath)) {
        historyRunPath = candidatePath;
        if (!state) {
          state = readRunStateFile(historyRunPath);
        }
        break;
      }
    }
    if (!state) {
      throw new Error(`run-state history file not found for run_id: ${runId}`);
    }
  } else {
    if (!fs.existsSync(currentRunPath)) {
      throw new Error(`current run-state file not found: ${currentRunPath}`);
    }
    state = currentState;
    const candidateHistory = getExistingPath({
      path: path.join(runtimePaths.runsDir.path, `${state.run_id}.json`),
      legacyPaths: getCandidatePaths(runtimePaths.runsDir).map((dirPath) => path.join(dirPath, `${state.run_id}.json`)).slice(1),
    });
    historyRunPath = fs.existsSync(candidateHistory) ? candidateHistory : null;
  }

  return {
    aiSpecDir,
    currentRunPath,
    historyRunPath,
    state,
    syncCurrent: Boolean(currentState && currentState.run_id === state.run_id),
  };
}

function buildHandoffEvent({ state, options, now }) {
  const fromRole = options.fromRole || state.current_role || state.plan?.first_handoff || null;
  const toRole = options.toRole;
  const eventType = options.eventType || 'role-handoff';
  const message =
    options.message ||
    `handoff from ${fromRole || 'unknown'} to ${toRole}`;

  return {
    at: now.toISOString(),
    type: eventType,
    status: options.status || state.status || 'running',
    from_role: fromRole,
    to_role: toRole,
    pending_gate:
      options.clearPendingGate ? null :
      (Object.prototype.hasOwnProperty.call(options, 'pendingGate') ? options.pendingGate || null : state.pending_gate || null),
    message,
  };
}

function buildStateEvent({ state, options, now, defaults = {} }) {
  const fromRole = options.fromRole || defaults.fromRole || state.current_role || state.plan?.first_handoff || null;
  const toRole = options.toRole || defaults.toRole || null;
  const pendingGate = options.clearPendingGate
    ? null
    : (Object.prototype.hasOwnProperty.call(options, 'pendingGate')
      ? options.pendingGate || null
      : defaults.pendingGate ?? state.pending_gate ?? null);
  const status = options.status || defaults.status || state.status || 'running';
  const eventType = options.eventType || defaults.eventType || 'state-updated';
  const message = options.message || defaults.message || eventType;

  return {
    at: now.toISOString(),
    type: eventType,
    status,
    from_role: fromRole,
    to_role: toRole,
    pending_gate: pendingGate,
    message,
  };
}

function updateAnchorForRole(existingAnchor, taskAnchor, toRole, nextRole) {
  const sanitizedAnchor = taskAnchor ? sanitizeAnchor(taskAnchor) : existingAnchor || null;
  if (!sanitizedAnchor) {
    return null;
  }
  return {
    ...sanitizedAnchor,
    stage: {
      ...(sanitizedAnchor.stage || {}),
      current_role: toRole ?? sanitizedAnchor.stage?.current_role ?? null,
      next_role: nextRole ?? sanitizedAnchor.stage?.next_role ?? null,
    },
  };
}

function handoffRunState(options) {
  if (!options.toRole) {
    throw new Error('Missing required argument: --to-role <role>');
  }

  const targetDir = path.resolve(process.cwd(), options.target || '.');
  const taskAnchorPath = options.taskAnchor
    ? path.resolve(process.cwd(), options.taskAnchor)
    : null;
  const { currentRunPath, historyRunPath, state, syncCurrent } = resolveRunStatePaths(targetDir, options.runId);
  assertRequiredOpenSpecArtifacts(targetDir, state, 'handoff', options.toRole);
  const taskAnchor = loadTaskAnchor(taskAnchorPath, options.taskAnchorData || null);
  const sanitizedAnchor = updateAnchorForRole(
    state.anchor || null,
    taskAnchor,
    options.toRole,
    options.nextRole,
  );
  const now = new Date();
  const event = buildHandoffEvent({ state, options, now });
  const updatedState = {
    ...state,
    status: options.status || 'running',
    current_role: options.toRole,
    pending_input_update: false,
    pending_gate: options.clearPendingGate
      ? null
      : (Object.prototype.hasOwnProperty.call(options, 'pendingGate') ? options.pendingGate || null : state.pending_gate || null),
    anchor: sanitizedAnchor,
    events: [...(Array.isArray(state.events) ? state.events : []), event],
    timestamps: {
      ...(state.timestamps || {}),
      updated_at: now.toISOString(),
    },
  };

  saveUpdatedRunState({ historyRunPath, currentRunPath, syncCurrent, state: updatedState });

  return {
    status: 'success',
    target: targetDir,
    artifacts: {
      current_run: syncCurrent ? currentRunPath : null,
      run_history: historyRunPath,
    },
    state: updatedState,
    source: {
      task_anchor: taskAnchorPath,
    },
    handoff: {
      from_role: event.from_role || null,
      to_role: options.toRole,
      next_role: options.nextRole || null,
    },
  };
}

function approveRunState(options) {
  const targetDir = path.resolve(process.cwd(), options.target || '.');
  const taskAnchorPath = options.taskAnchor
    ? path.resolve(process.cwd(), options.taskAnchor)
    : null;
  const { currentRunPath, historyRunPath, state, syncCurrent } = resolveRunStatePaths(targetDir, options.runId);
  const activeGate = state.pending_gate || null;
  const requestedGate = options.gate || activeGate;

  if (!activeGate) {
    throw new Error('No pending approval gate found');
  }
  if (options.gate && activeGate && options.gate !== activeGate) {
    throw new Error(`Pending gate mismatch: current is "${activeGate}", requested "${options.gate}"`);
  }

  const toRole = inferApprovalResumeRole(state, options);
  const taskAnchor = loadTaskAnchor(taskAnchorPath, options.taskAnchorData || null);
  const anchor = updateAnchorForRole(state.anchor || null, taskAnchor, toRole, options.nextRole);
  const now = new Date();
  const event = buildStateEvent({
    state,
    options: { ...options, toRole, clearPendingGate: true },
    now,
    defaults: {
      status: 'running',
      eventType: 'gate-cleared',
      message: `approval cleared for ${requestedGate}`,
      pendingGate: null,
    },
  });

  const updatedState = {
    ...state,
    status: options.status || 'running',
    current_role: toRole,
    pending_input_update: false,
    pending_gate: null,
    anchor,
    events: [...(Array.isArray(state.events) ? state.events : []), event],
    timestamps: {
      ...(state.timestamps || {}),
      updated_at: now.toISOString(),
    },
  };

  saveUpdatedRunState({ historyRunPath, currentRunPath, syncCurrent, state: updatedState });

  return {
    status: 'success',
    target: targetDir,
    artifacts: {
      current_run: syncCurrent ? currentRunPath : null,
      run_history: historyRunPath,
    },
    state: updatedState,
    source: {
      task_anchor: taskAnchorPath,
      gate: requestedGate,
    },
    handoff: {
      from_role: event.from_role || null,
      to_role: toRole,
      next_role: options.nextRole || null,
    },
  };
}

function resumeRunState(options) {
  const targetDir = path.resolve(process.cwd(), options.target || '.');
  const taskAnchorPath = options.taskAnchor
    ? path.resolve(process.cwd(), options.taskAnchor)
    : null;
  const { currentRunPath, historyRunPath, state, syncCurrent } = resolveRunStatePaths(targetDir, options.runId);
  const toRole = state.pending_gate
    ? inferApprovalResumeRole(state, options)
    : (options.toRole || state.current_role || state.anchor?.stage?.current_role || state.plan?.first_handoff || null);
  const taskAnchor = loadTaskAnchor(taskAnchorPath, options.taskAnchorData || null);
  const anchor = updateAnchorForRole(state.anchor || null, taskAnchor, toRole, options.nextRole);
  const now = new Date();
  const event = buildStateEvent({
    state,
    options: { ...options, toRole, clearPendingGate: true },
    now,
    defaults: {
      status: 'running',
      eventType: 'run-resumed',
      message: `resumed run at ${toRole || 'unknown'}`,
      pendingGate: null,
    },
  });

  const updatedState = {
    ...state,
    status: options.status || 'running',
    current_role: toRole,
    pending_input_update: false,
    pending_gate: options.clearPendingGate === false ? state.pending_gate || null : null,
    anchor,
    events: [...(Array.isArray(state.events) ? state.events : []), event],
    timestamps: {
      ...(state.timestamps || {}),
      updated_at: now.toISOString(),
    },
  };

  saveUpdatedRunState({ historyRunPath, currentRunPath, syncCurrent, state: updatedState });

  return {
    status: 'success',
    target: targetDir,
    artifacts: {
      current_run: syncCurrent ? currentRunPath : null,
      run_history: historyRunPath,
    },
    state: updatedState,
    source: {
      task_anchor: taskAnchorPath,
    },
  };
}

function statusRunState(options) {
  const targetDir = path.resolve(process.cwd(), options.target || '.');
  const { currentRunPath, historyRunPath, state, syncCurrent } = resolveRunStatePaths(targetDir, options.runId);
  const events = Array.isArray(state.events) ? state.events : [];
  const lastEvent = events.length > 0 ? events[events.length - 1] : null;

  return {
    status: 'success',
    target: targetDir,
    artifacts: {
      current_run: syncCurrent ? currentRunPath : null,
      run_history: historyRunPath,
    },
    summary: {
      run_id: state.run_id,
      mode: state.mode || null,
      delivery_profile: state.delivery_profile || null,
      artifact_profile: state.artifact_profile || null,
      complexity: state.complexity || state.task?.complexity || null,
      status: state.status || null,
      flow_id: state.flow?.id || null,
      current_role: state.current_role || null,
      pending_input_update: Boolean(state.pending_input_update),
      input_update_count: Array.isArray(state.input_updates) ? state.input_updates.length : 0,
      pending_gate: state.pending_gate || null,
      updated_at: state.timestamps?.updated_at || null,
      last_event: lastEvent,
    },
    state,
  };
}

function gateBlockedRunState(options) {
  const targetDir = path.resolve(process.cwd(), options.target || '.');
  const taskAnchorPath = options.taskAnchor
    ? path.resolve(process.cwd(), options.taskAnchor)
    : null;
  const { currentRunPath, historyRunPath, state, syncCurrent } = resolveRunStatePaths(targetDir, options.runId);
  const requestedGate = options.gate || options.pendingGate || state.pending_gate || null;
  const nextStatus = options.status || (requestedGate ? 'waiting-approval' : 'blocked');
  const taskAnchor = loadTaskAnchor(taskAnchorPath, options.taskAnchorData || null);
  const toRole = options.toRole || state.current_role || null;
  const anchor = updateAnchorForRole(state.anchor || null, taskAnchor, toRole, options.nextRole);
  const now = new Date();
  const event = buildStateEvent({
    state,
    options: { ...options, pendingGate: requestedGate, toRole },
    now,
    defaults: {
      status: nextStatus,
      eventType: 'gate-blocked',
      message: requestedGate
        ? `waiting for ${requestedGate} approval`
        : 'run blocked',
      pendingGate: requestedGate,
    },
  });

  const updatedState = {
    ...state,
    status: nextStatus,
    current_role: toRole,
    pending_input_update: false,
    pending_gate: requestedGate,
    anchor,
    events: [...(Array.isArray(state.events) ? state.events : []), event],
    timestamps: {
      ...(state.timestamps || {}),
      updated_at: now.toISOString(),
    },
  };

  saveUpdatedRunState({ historyRunPath, currentRunPath, syncCurrent, state: updatedState });

  return {
    status: 'success',
    target: targetDir,
    artifacts: {
      current_run: syncCurrent ? currentRunPath : null,
      run_history: historyRunPath,
    },
    state: updatedState,
    source: {
      task_anchor: taskAnchorPath,
      gate: requestedGate,
    },
  };
}

function completeRunState(options) {
  const targetDir = path.resolve(process.cwd(), options.target || '.');
  const taskAnchorPath = options.taskAnchor
    ? path.resolve(process.cwd(), options.taskAnchor)
    : null;
  const { currentRunPath, historyRunPath, state, syncCurrent } = resolveRunStatePaths(targetDir, options.runId);
  if (options.skipArtifactCheck !== true) {
    assertRequiredOpenSpecArtifacts(targetDir, state, 'complete', options.toRole || state.current_role || null);
  }
  const toRole = options.toRole || state.current_role || null;
  const taskAnchor = loadTaskAnchor(taskAnchorPath, options.taskAnchorData || null);
  const anchor = updateAnchorForRole(state.anchor || null, taskAnchor, toRole, options.nextRole);
  const nextArtifacts = options.artifactsData
    ? mergeArtifacts(
        mergeArtifacts(buildDefaultArtifacts(state.task?.change_id || state.anchor?.task?.change_id || null), inferArtifacts(state.artifacts || null)),
        inferArtifacts(options.artifactsData),
      )
    : state.artifacts;
  const now = new Date();
  const event = buildStateEvent({
    state,
    options: { ...options, toRole, clearPendingGate: true },
    now,
    defaults: {
      status: 'success',
      eventType: 'run-completed',
      message: 'run completed',
      pendingGate: null,
    },
  });

  const updatedState = {
    ...state,
    status: options.status || 'success',
    current_role: toRole,
    pending_input_update: false,
    pending_gate: null,
    artifacts: nextArtifacts,
    anchor,
    events: [...(Array.isArray(state.events) ? state.events : []), event],
    timestamps: {
      ...(state.timestamps || {}),
      updated_at: now.toISOString(),
      finished_at: now.toISOString(),
    },
  };

  saveUpdatedRunState({ historyRunPath, currentRunPath, syncCurrent, state: updatedState });

  return {
    status: 'success',
    target: targetDir,
    artifacts: {
      current_run: syncCurrent ? currentRunPath : null,
      run_history: historyRunPath,
    },
    state: updatedState,
    source: {
      task_anchor: taskAnchorPath,
    },
  };
}

function failRunState(options) {
  const targetDir = path.resolve(process.cwd(), options.target || '.');
  const taskAnchorPath = options.taskAnchor
    ? path.resolve(process.cwd(), options.taskAnchor)
    : null;
  const { currentRunPath, historyRunPath, state, syncCurrent } = resolveRunStatePaths(targetDir, options.runId);
  const toRole = options.toRole || state.current_role || null;
  const taskAnchor = loadTaskAnchor(taskAnchorPath, options.taskAnchorData || null);
  const anchor = updateAnchorForRole(state.anchor || null, taskAnchor, toRole, options.nextRole);
  const now = new Date();
  const errorMessage = options.error || options.message || 'run failed';
  const event = buildStateEvent({
    state,
    options: { ...options, toRole, clearPendingGate: true, message: errorMessage },
    now,
    defaults: {
      status: 'failed',
      eventType: 'run-failed',
      message: errorMessage,
      pendingGate: null,
    },
  });

  const updatedErrors = [...(Array.isArray(state.errors) ? state.errors : [])];
  if (errorMessage) {
    updatedErrors.push(errorMessage);
  }

  const updatedState = {
    ...state,
    status: options.status || 'failed',
    current_role: toRole,
    pending_input_update: false,
    pending_gate: null,
    anchor,
    errors: updatedErrors,
    events: [...(Array.isArray(state.events) ? state.events : []), event],
    timestamps: {
      ...(state.timestamps || {}),
      updated_at: now.toISOString(),
      finished_at: now.toISOString(),
    },
  };

  saveUpdatedRunState({ historyRunPath, currentRunPath, syncCurrent, state: updatedState });

  return {
    status: 'success',
    target: targetDir,
    artifacts: {
      current_run: syncCurrent ? currentRunPath : null,
      run_history: historyRunPath,
    },
    state: updatedState,
    source: {
      task_anchor: taskAnchorPath,
      error: options.error || null,
    },
  };
}

function cancelRunState(options) {
  const targetDir = path.resolve(process.cwd(), options.target || '.');
  const taskAnchorPath = options.taskAnchor
    ? path.resolve(process.cwd(), options.taskAnchor)
    : null;
  const { currentRunPath, historyRunPath, state, syncCurrent } = resolveRunStatePaths(targetDir, options.runId);
  const toRole = options.toRole || state.current_role || null;
  const taskAnchor = loadTaskAnchor(taskAnchorPath, options.taskAnchorData || null);
  const anchor = updateAnchorForRole(state.anchor || null, taskAnchor, toRole, options.nextRole);
  const now = new Date();
  const cancelMessage = options.message || 'run cancelled';
  const event = buildStateEvent({
    state,
    options: { ...options, toRole, clearPendingGate: true, message: cancelMessage },
    now,
    defaults: {
      status: 'cancelled',
      eventType: 'run-cancelled',
      message: cancelMessage,
      pendingGate: null,
    },
  });

  const updatedState = {
    ...state,
    status: options.status || 'cancelled',
    current_role: toRole,
    pending_input_update: false,
    pending_gate: null,
    anchor,
    events: [...(Array.isArray(state.events) ? state.events : []), event],
    timestamps: {
      ...(state.timestamps || {}),
      updated_at: now.toISOString(),
      finished_at: now.toISOString(),
    },
  };

  saveUpdatedRunState({ historyRunPath, currentRunPath, syncCurrent, state: updatedState });

  return {
    status: 'success',
    target: targetDir,
    artifacts: {
      current_run: syncCurrent ? currentRunPath : null,
      run_history: historyRunPath,
    },
    state: updatedState,
    source: {
      task_anchor: taskAnchorPath,
    },
  };
}

function initRunState(options) {
  const targetDir = path.resolve(process.cwd(), options.target || '.');
  const runPlanPath = path.resolve(process.cwd(), options.runPlan);
  const taskAnchorPath = options.taskAnchor
    ? path.resolve(process.cwd(), options.taskAnchor)
    : null;

  const runPlan = readJsonFile(runPlanPath, 'run-plan');
  assertRunPlan(runPlan, runPlanPath);

  const taskAnchor = taskAnchorPath
    ? readJsonFile(taskAnchorPath, 'task-anchor')
    : null;

  return writeRunState({
    targetDir,
    runPlan,
    taskAnchor,
    options,
    source: {
      runPlan: runPlanPath,
      taskAnchor: taskAnchorPath,
      bootstrapPayload: null,
    },
  });
}

function bootstrapRunState(options) {
  const targetDir = path.resolve(process.cwd(), options.target || '.');
  const inputCount = [
    Boolean(options.payload),
    Boolean(options.stdin),
    Boolean(options.payloadData),
  ].filter(Boolean).length;
  const hasInput = inputCount > 0;

  if (!hasInput) {
    throw new Error('Missing bootstrap input: use --payload <file> or --stdin');
  }
  if (inputCount > 1) {
    throw new Error('Use only one bootstrap input: --payload <file>, --stdin, or payloadData');
  }

  const payloadSource = options.payloadData
    ? 'memory-payload'
    : options.payload
    ? path.resolve(process.cwd(), options.payload)
    : 'stdin';
  const payload = options.payloadData
    ? options.payloadData
    : options.payload
    ? readJsonFile(payloadSource, 'bootstrap payload')
    : readJsonFromStdin('bootstrap payload');

  const { runPlan, taskAnchor } = normalizeBootstrapPayload(payload, payloadSource);
  assertRunPlan(runPlan, payloadSource);

  return writeRunState({
    targetDir,
    runPlan,
    taskAnchor,
    options,
    source: {
      runPlan: payloadSource,
      taskAnchor: payloadSource,
      bootstrapPayload: payloadSource,
    },
  });
}

function printPretty(result, action = 'init') {
  if (action === 'handoff') {
    console.log('run-state updated');
  } else if (action === 'approve') {
    console.log('run-state approved');
  } else if (action === 'resume') {
    console.log('run-state resumed');
  } else if (action === 'gate-blocked') {
    console.log('run-state blocked');
  } else if (action === 'status') {
    console.log('run-state status');
  } else if (action === 'complete') {
    console.log('run-state completed');
  } else if (action === 'fail') {
    console.log('run-state failed');
  } else if (action === 'cancel') {
    console.log('run-state cancelled');
  } else {
    console.log('run-state initialized');
  }
  console.log(`  target: ${result.target}`);
  console.log(`  run_id: ${result.state.run_id}`);
  console.log(`  current: ${result.artifacts.current_run}`);
  if (result.artifacts.run_history) {
    console.log(`  history: ${result.artifacts.run_history}`);
  }
  console.log(`  mode: ${result.state.mode || 'n/a'}`);
  console.log(`  delivery_profile: ${result.state.delivery_profile || 'n/a'}`);
  console.log(`  artifact_profile: ${result.state.artifact_profile || 'n/a'}`);
  console.log(`  complexity: ${result.state.complexity || result.state.task?.complexity || 'n/a'}`);
  if (action === 'status') {
    console.log(`  status: ${result.state.status || 'n/a'}`);
    console.log(`  current_role: ${result.state.current_role || 'n/a'}`);
    console.log(`  pending_gate: ${result.state.pending_gate || 'n/a'}`);
  } else if (action === 'handoff') {
    console.log(`  current_role: ${result.state.current_role || 'n/a'}`);
    console.log(`  from_role: ${result.handoff?.from_role || 'n/a'}`);
    console.log(`  to_role: ${result.handoff?.to_role || 'n/a'}`);
  } else if (
    action === 'approve' ||
    action === 'resume' ||
    action === 'gate-blocked' ||
    action === 'complete' ||
    action === 'fail'
  ) {
    console.log(`  status: ${result.state.status || 'n/a'}`);
    console.log(`  current_role: ${result.state.current_role || 'n/a'}`);
    console.log(`  pending_gate: ${result.state.pending_gate || 'n/a'}`);
  } else {
    console.log(`  first_handoff: ${result.state.plan.first_handoff || 'n/a'}`);
  }
  if (result.source.bootstrap_payload) {
    console.log(`  bootstrap_payload: ${result.source.bootstrap_payload}`);
  }
}

function main(argv = process.argv.slice(2)) {
  const { command, options } = parseArgs(argv);

  if (!command || options.help || command === '--help' || command === '-h' || command === 'help') {
    printUsage();
    return 0;
  }

  if (command === 'init') {
    if (!options.runPlan) {
      throw new Error('Missing required argument: --run-plan <file>');
    }

    const result = initRunState(options);

    if (options.json) {
      console.log(JSON.stringify(result, null, 2));
    } else {
      printPretty(result, 'init');
    }

    return 0;
  }

  if (command === 'bootstrap') {
    const result = bootstrapRunState(options);

    if (options.json) {
      console.log(JSON.stringify(result, null, 2));
    } else {
      printPretty(result, 'bootstrap');
    }

    return 0;
  }

  if (command === 'handoff') {
    const result = handoffRunState(options);

    if (options.json) {
      console.log(JSON.stringify(result, null, 2));
    } else {
      printPretty(result, 'handoff');
    }

    return 0;
  }

  if (command === 'approve') {
    const result = approveRunState(options);

    if (options.json) {
      console.log(JSON.stringify(result, null, 2));
    } else {
      printPretty(result, 'approve');
    }

    return 0;
  }

  if (command === 'resume') {
    const result = resumeRunState(options);

    if (options.json) {
      console.log(JSON.stringify(result, null, 2));
    } else {
      printPretty(result, 'resume');
    }

    return 0;
  }

  if (command === 'gate-blocked') {
    const result = gateBlockedRunState(options);

    if (options.json) {
      console.log(JSON.stringify(result, null, 2));
    } else {
      printPretty(result, 'gate-blocked');
    }

    return 0;
  }

  if (command === 'status') {
    const result = statusRunState(options);

    if (options.json) {
      console.log(JSON.stringify(result, null, 2));
    } else {
      printPretty(result, 'status');
    }

    return 0;
  }

  if (command === 'complete') {
    const result = completeRunState(options);

    if (options.json) {
      console.log(JSON.stringify(result, null, 2));
    } else {
      printPretty(result, 'complete');
    }

    return 0;
  }

  if (command === 'fail') {
    const result = failRunState(options);

    if (options.json) {
      console.log(JSON.stringify(result, null, 2));
    } else {
      printPretty(result, 'fail');
    }

    return 0;
  }

  if (command === 'cancel') {
    const result = cancelRunState(options);

    if (options.json) {
      console.log(JSON.stringify(result, null, 2));
    } else {
      printPretty(result, 'cancel');
    }

    return 0;
  }

  if (
    command !== 'init' &&
    command !== 'bootstrap' &&
    command !== 'handoff' &&
    command !== 'approve' &&
    command !== 'resume' &&
    command !== 'gate-blocked' &&
    command !== 'status' &&
    command !== 'complete' &&
    command !== 'fail' &&
    command !== 'cancel'
  ) {
    throw new Error(`Unsupported runtime-state command: ${command}`);
  }
}

if (require.main === module) {
  try {
    const exitCode = main();
    process.exit(exitCode);
  } catch (error) {
    console.error(`runtime-state error: ${error.message}`);
    process.exit(1);
  }
}

module.exports = {
  main,
  parseArgs,
  createRunId,
  normalizeSpecsArtifactPath,
  inferDeliveryProfile,
  inferArtifactProfile,
  inferComplexity,
  inferRiskLevel,
  inferArtifacts,
  buildRunState,
  recordRunInputUpdate,
  readRunStateFile,
  resolveRunStatePaths,
  initRunState,
  bootstrapRunState,
  normalizeBootstrapPayload,
  handoffRunState,
  approveRunState,
  resumeRunState,
  gateBlockedRunState,
  statusRunState,
  completeRunState,
  failRunState,
  cancelRunState,
};
