#!/usr/bin/env node
const fs = require('fs');
const path = require('path');

function printUsage() {
  console.log(`Usage:
  ai-spec expert-executor apply --payload <file> [options]
  ai-spec expert-executor apply --stdin [options]
  ai-spec expert-executor apply-action --payload <file> [options]
  ai-spec expert-executor apply-action --stdin [options]
  ai-spec expert-executor clear [options]
  ai-spec expert-executor clear-action [options]

Options:
  --target <dir>         Target project directory (default: .)
  --payload <file>       Path to payload JSON file
  --stdin                Read payload JSON from stdin
  --json                 Print JSON result only
  --pretty               Print readable summary (default)
  --help                 Show this help
`);
}

function parseArgs(argv) {
  const args = [...argv];
  const command = args.shift();
  const options = {
    target: '.',
    pretty: true,
    json: false,
  };

  while (args.length > 0) {
    const arg = args.shift();
    switch (arg) {
      case '--target':
        options.target = args.shift();
        break;
      case '--payload':
        options.payload = args.shift();
        break;
      case '--stdin':
        options.stdin = true;
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

function ensureDir(dirPath) {
  fs.mkdirSync(dirPath, { recursive: true });
}

function writeJson(filePath, value) {
  fs.writeFileSync(filePath, `${JSON.stringify(value, null, 2)}\n`, 'utf8');
}

function writeText(filePath, value) {
  fs.writeFileSync(filePath, `${value}\n`, 'utf8');
}

function readJson(filePath, label) {
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

function createStampedId(prefix, suffix = '', now = new Date()) {
  const iso = now.toISOString().replace(/[:.]/g, '-');
  return suffix ? `${iso}__${suffix}` : `${prefix}_${iso}`;
}

function normalizeList(value) {
  if (!value) return [];
  if (Array.isArray(value)) return value.filter(Boolean);
  return [String(value)].filter(Boolean);
}

function renderExecutionMarkdown(payload) {
  if (payload.markdown && typeof payload.markdown === 'string') {
    return payload.markdown.trim();
  }

  const lines = [];
  lines.push('# 当前专家执行载荷');
  lines.push('');
  lines.push(`- run_id（运行 ID）: ${payload.run_id || 'n/a'}`);
  lines.push(`- role（专家角色）: ${payload.role?.id || 'n/a'}${payload.role?.name ? `（${payload.role.name}）` : ''}`);
  lines.push(`- execution_id（执行 ID）: ${payload.execution_id || 'n/a'}`);
  lines.push(`- status（状态）: ${payload.status || 'n/a'}`);
  if (payload.flow?.id) lines.push(`- flow（流程模板）: ${payload.flow.id}`);
  lines.push('');
  lines.push('## 执行摘要');
  const steps = normalizeList(payload.execution_plan?.execution_steps);
  if (steps.length === 0) {
    lines.push('- 无');
  } else {
    for (const step of steps) {
      lines.push(`- ${step}`);
    }
  }
  return lines.join('\n').trim();
}

function renderRuntimeActionMarkdown(payload) {
  if (payload.markdown && typeof payload.markdown === 'string') {
    return payload.markdown.trim();
  }

  const lines = [];
  lines.push('# 当前运行动作草案');
  lines.push('');
  lines.push(`- run_id（运行 ID）: ${payload.run_id || 'n/a'}`);
  lines.push(`- action（动作）: ${payload.action || 'n/a'}`);
  lines.push(`- from_role（来源专家）: ${payload.from_role || 'n/a'}`);
  if (payload.to_role) lines.push(`- to_role（目标专家）: ${payload.to_role}`);
  if (payload.next_role) lines.push(`- next_role（下一位专家）: ${payload.next_role}`);
  lines.push(`- status（状态）: ${payload.status || 'n/a'}`);
  if (payload.message) lines.push(`- message（说明）: ${payload.message}`);
  return lines.join('\n').trim();
}

function validateExecutionPayload(payload, sourceLabel) {
  if (!payload || typeof payload !== 'object') {
    throw new Error(`Invalid execution payload: ${sourceLabel}`);
  }
  if (payload.kind !== 'expert-execution') {
    throw new Error(`Expected kind "expert-execution" but got "${payload.kind || 'undefined'}": ${sourceLabel}`);
  }
  if (!payload.run_id) {
    throw new Error(`Execution payload is missing run_id: ${sourceLabel}`);
  }
  if (!payload.role || typeof payload.role !== 'object' || !payload.role.id) {
    throw new Error(`Execution payload is missing role.id: ${sourceLabel}`);
  }
}

function validateRuntimeActionPayload(payload, sourceLabel) {
  if (!payload || typeof payload !== 'object') {
    throw new Error(`Invalid runtime-action payload: ${sourceLabel}`);
  }
  if (payload.kind !== 'task-orchestrator-runtime-action') {
    throw new Error(`Expected kind "task-orchestrator-runtime-action" but got "${payload.kind || 'undefined'}": ${sourceLabel}`);
  }
  if (!payload.run_id) {
    throw new Error(`Runtime-action payload is missing run_id: ${sourceLabel}`);
  }
  if (!payload.action) {
    throw new Error(`Runtime-action payload is missing action: ${sourceLabel}`);
  }
}

function normalizeExecutionPayload(payload) {
  const normalized = JSON.parse(JSON.stringify(payload));
  normalized.schema_version = normalized.schema_version || 1;
  normalized.kind = 'expert-execution';
  normalized.execution_id = normalized.execution_id || createStampedId('execution', normalized.role.id);
  normalized.generated_at = normalized.generated_at || new Date().toISOString();
  normalized.markdown = renderExecutionMarkdown(normalized);
  return normalized;
}

function normalizeRuntimeActionPayload(payload) {
  const normalized = JSON.parse(JSON.stringify(payload));
  normalized.schema_version = normalized.schema_version || 1;
  normalized.kind = 'task-orchestrator-runtime-action';
  normalized.action_id = normalized.action_id || createStampedId('action', normalized.action);
  normalized.generated_at = normalized.generated_at || new Date().toISOString();
  normalized.markdown = renderRuntimeActionMarkdown(normalized);
  return normalized;
}

function writeExecutionArtifacts(targetDir, payload) {
  const aiSpecDir = path.join(targetDir, '.ai-spec');
  const executionsDir = path.join(aiSpecDir, 'executions', payload.run_id);
  ensureDir(executionsDir);

  const currentExecutionJson = path.join(aiSpecDir, 'current-execution.json');
  const currentExecutionMd = path.join(aiSpecDir, 'current-execution.md');
  const recordJson = path.join(executionsDir, `${payload.execution_id}.json`);
  const recordMd = path.join(executionsDir, `${payload.execution_id}.md`);

  writeJson(currentExecutionJson, payload);
  writeText(currentExecutionMd, payload.markdown);
  writeJson(recordJson, payload);
  writeText(recordMd, payload.markdown);

  return {
    current_execution_json: currentExecutionJson,
    current_execution_md: currentExecutionMd,
    execution_record_json: recordJson,
    execution_record_md: recordMd,
  };
}

function writeRuntimeActionArtifacts(targetDir, payload) {
  const aiSpecDir = path.join(targetDir, '.ai-spec');
  const actionDir = path.join(aiSpecDir, 'runtime-actions', payload.run_id);
  ensureDir(actionDir);

  const currentActionJson = path.join(aiSpecDir, 'current-runtime-action.json');
  const currentActionMd = path.join(aiSpecDir, 'current-runtime-action.md');
  const recordJson = path.join(actionDir, `${payload.action_id}.json`);
  const recordMd = path.join(actionDir, `${payload.action_id}.md`);

  writeJson(currentActionJson, payload);
  writeText(currentActionMd, payload.markdown);
  writeJson(recordJson, payload);
  writeText(recordMd, payload.markdown);

  return {
    current_runtime_action_json: currentActionJson,
    current_runtime_action_md: currentActionMd,
    runtime_action_record_json: recordJson,
    runtime_action_record_md: recordMd,
  };
}

function readPayloadFromOptions(options, label) {
  const inputCount = [Boolean(options.payload), Boolean(options.stdin)].filter(Boolean).length;
  if (inputCount === 0) {
    throw new Error(`Missing ${label} input: use --payload <file> or --stdin`);
  }
  if (inputCount > 1) {
    throw new Error('Use either --payload <file> or --stdin, not both');
  }

  const sourcePath = options.payload
    ? path.resolve(process.cwd(), options.payload)
    : 'stdin';

  const rawPayload = options.payload
    ? readJson(sourcePath, label)
    : readJsonFromStdin(label);

  return { sourcePath, rawPayload };
}

function applyExecution(options) {
  const targetDir = path.resolve(options.target || '.');
  const { sourcePath, rawPayload } = readPayloadFromOptions(options, 'expert-execution');
  validateExecutionPayload(rawPayload, sourcePath);
  const payload = normalizeExecutionPayload(rawPayload);
  const artifacts = writeExecutionArtifacts(targetDir, payload);

  return {
    status: 'success',
    target: targetDir,
    source: sourcePath,
    artifacts,
    payload,
  };
}

function applyExecutionData(options) {
  const targetDir = path.resolve(options.target || '.');
  const sourcePath = options.source || 'memory-payload';
  const rawPayload = options.payloadData;
  validateExecutionPayload(rawPayload, sourcePath);
  const payload = normalizeExecutionPayload(rawPayload);
  const artifacts = writeExecutionArtifacts(targetDir, payload);

  return {
    status: 'success',
    target: targetDir,
    source: sourcePath,
    artifacts,
    payload,
  };
}

function applyRuntimeAction(options) {
  const targetDir = path.resolve(options.target || '.');
  const { sourcePath, rawPayload } = readPayloadFromOptions(options, 'runtime-action');
  validateRuntimeActionPayload(rawPayload, sourcePath);
  const payload = normalizeRuntimeActionPayload(rawPayload);
  const artifacts = writeRuntimeActionArtifacts(targetDir, payload);

  return {
    status: 'success',
    target: targetDir,
    source: sourcePath,
    artifacts,
    payload,
  };
}

function applyRuntimeActionData(options) {
  const targetDir = path.resolve(options.target || '.');
  const sourcePath = options.source || 'memory-payload';
  const rawPayload = options.payloadData;
  validateRuntimeActionPayload(rawPayload, sourcePath);
  const payload = normalizeRuntimeActionPayload(rawPayload);
  const artifacts = writeRuntimeActionArtifacts(targetDir, payload);

  return {
    status: 'success',
    target: targetDir,
    source: sourcePath,
    artifacts,
    payload,
  };
}

function clearExecution(options) {
  const targetDir = path.resolve(options.target || '.');
  const aiSpecDir = path.join(targetDir, '.ai-spec');
  const currentExecutionJson = path.join(aiSpecDir, 'current-execution.json');
  const currentExecutionMd = path.join(aiSpecDir, 'current-execution.md');

  if (fs.existsSync(currentExecutionJson)) {
    fs.unlinkSync(currentExecutionJson);
  }
  if (fs.existsSync(currentExecutionMd)) {
    fs.unlinkSync(currentExecutionMd);
  }

  return {
    status: 'success',
    target: targetDir,
    artifacts: {
      current_execution_json: currentExecutionJson,
      current_execution_md: currentExecutionMd,
    },
  };
}

function clearRuntimeAction(options) {
  const targetDir = path.resolve(options.target || '.');
  const aiSpecDir = path.join(targetDir, '.ai-spec');
  const currentActionJson = path.join(aiSpecDir, 'current-runtime-action.json');
  const currentActionMd = path.join(aiSpecDir, 'current-runtime-action.md');

  if (fs.existsSync(currentActionJson)) {
    fs.unlinkSync(currentActionJson);
  }
  if (fs.existsSync(currentActionMd)) {
    fs.unlinkSync(currentActionMd);
  }

  return {
    status: 'success',
    target: targetDir,
    artifacts: {
      current_runtime_action_json: currentActionJson,
      current_runtime_action_md: currentActionMd,
    },
  };
}

function printPretty(result, command) {
  console.log(`expert-executor ${command}`);
  console.log(`  target: ${result.target}`);
  if (result.payload) {
    console.log(`  run_id: ${result.payload.run_id}`);
    if (result.payload.kind === 'expert-execution') {
      console.log(`  role: ${result.payload.role.id}`);
      console.log(`  execution_id: ${result.payload.execution_id}`);
      console.log(`  current_execution: ${result.artifacts.current_execution_json}`);
    } else {
      console.log(`  action: ${result.payload.action}`);
      console.log(`  current_runtime_action: ${result.artifacts.current_runtime_action_json}`);
    }
  } else {
    if (result.artifacts.current_execution_json) {
      console.log(`  current_execution: ${result.artifacts.current_execution_json}`);
    }
    if (result.artifacts.current_runtime_action_json) {
      console.log(`  current_runtime_action: ${result.artifacts.current_runtime_action_json}`);
    }
  }
}

function main(argv = process.argv.slice(2)) {
  const { command, options } = parseArgs(argv);

  if (!command || options.help || command === 'help' || command === '--help' || command === '-h') {
    printUsage();
    return 0;
  }

  if (command === 'apply' || command === 'run') {
    const result = applyExecution(options);
    if (options.json) {
      console.log(JSON.stringify(result, null, 2));
    } else {
      printPretty(result, command);
    }
    return 0;
  }

  if (command === 'apply-action' || command === 'finish') {
    const result = applyRuntimeAction(options);
    if (options.json) {
      console.log(JSON.stringify(result, null, 2));
    } else {
      printPretty(result, command);
    }
    return 0;
  }

  if (command === 'clear') {
    const result = clearExecution(options);
    if (options.json) {
      console.log(JSON.stringify(result, null, 2));
    } else {
      printPretty(result, command);
    }
    return 0;
  }

  if (command === 'clear-action') {
    const result = clearRuntimeAction(options);
    if (options.json) {
      console.log(JSON.stringify(result, null, 2));
    } else {
      printPretty(result, command);
    }
    return 0;
  }

  throw new Error(`Unsupported expert-executor command: ${command}`);
}

module.exports = {
  main,
  applyExecution,
  applyExecutionData,
  applyRuntimeAction,
  applyRuntimeActionData,
  clearExecution,
  clearRuntimeAction,
  validateExecutionPayload,
  validateRuntimeActionPayload,
  normalizeExecutionPayload,
  normalizeRuntimeActionPayload,
};

if (require.main === module) {
  try {
    process.exit(main());
  } catch (error) {
    console.error(`expert-executor error: ${error.message}`);
    process.exit(1);
  }
}
