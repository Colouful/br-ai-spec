#!/usr/bin/env node
const fs = require('fs');
const path = require('path');

function printUsage() {
  console.log(`Usage:
  ai-spec expert-dispatch apply --payload <file> [options]
  ai-spec expert-dispatch apply --stdin [options]
  ai-spec expert-dispatch clear [options]

Options:
  --target <dir>         Target project directory (default: .)
  --payload <file>       Path to expert-dispatch JSON file
  --stdin                Read expert-dispatch JSON from stdin
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

function createDispatchId(roleId, now = new Date()) {
  const iso = now.toISOString().replace(/[:.]/g, '-');
  return `${iso}__${roleId}`;
}

function validateDispatchPayload(payload, sourceLabel) {
  if (!payload || typeof payload !== 'object') {
    throw new Error(`Invalid dispatch payload: ${sourceLabel}`);
  }
  if (payload.kind !== 'expert-dispatch') {
    throw new Error(`Expected kind "expert-dispatch" but got "${payload.kind || 'undefined'}": ${sourceLabel}`);
  }
  if (!payload.run_id) {
    throw new Error(`Dispatch payload is missing run_id: ${sourceLabel}`);
  }
  if (!payload.role || typeof payload.role !== 'object' || !payload.role.id) {
    throw new Error(`Dispatch payload is missing role.id: ${sourceLabel}`);
  }
}

function normalizeDispatchPayload(payload) {
  const normalized = JSON.parse(JSON.stringify(payload));
  normalized.schema_version = normalized.schema_version || 1;
  normalized.kind = 'expert-dispatch';
  normalized.dispatch_id = normalized.dispatch_id || createDispatchId(normalized.role.id);
  normalized.generated_at = normalized.generated_at || new Date().toISOString();
  return normalized;
}

function writeDispatchArtifacts(targetDir, payload) {
  const aiSpecDir = path.join(targetDir, '.ai-spec');
  const dispatchesDir = path.join(aiSpecDir, 'dispatches', payload.run_id);
  ensureDir(dispatchesDir);

  const currentDispatchPath = path.join(aiSpecDir, 'current-dispatch.json');
  const dispatchRecordPath = path.join(dispatchesDir, `${payload.dispatch_id}.json`);

  writeJson(currentDispatchPath, payload);
  writeJson(dispatchRecordPath, payload);

  return {
    current_dispatch: currentDispatchPath,
    dispatch_record: dispatchRecordPath,
  };
}

function applyDispatch(options) {
  const targetDir = path.resolve(options.target || '.');
  const sourcePath = options.payload
    ? path.resolve(process.cwd(), options.payload)
    : 'stdin';

  const rawPayload = options.payload
    ? readJson(sourcePath, 'expert-dispatch')
    : readJsonFromStdin('expert-dispatch');

  validateDispatchPayload(rawPayload, sourcePath);
  const payload = normalizeDispatchPayload(rawPayload);
  const artifacts = writeDispatchArtifacts(targetDir, payload);

  return {
    status: 'success',
    target: targetDir,
    source: sourcePath,
    artifacts,
    payload,
  };
}

function clearDispatch(options) {
  const targetDir = path.resolve(options.target || '.');
  const aiSpecDir = path.join(targetDir, '.ai-spec');
  const currentDispatchPath = path.join(aiSpecDir, 'current-dispatch.json');

  if (fs.existsSync(currentDispatchPath)) {
    fs.unlinkSync(currentDispatchPath);
  }

  return {
    status: 'success',
    target: targetDir,
    artifacts: {
      current_dispatch: currentDispatchPath,
    },
  };
}

function printPretty(result, command) {
  console.log(`expert-dispatch ${command}`);
  console.log(`  target: ${result.target}`);
  if (result.payload) {
    console.log(`  run_id: ${result.payload.run_id}`);
    console.log(`  role: ${result.payload.role.id}`);
    console.log(`  dispatch_id: ${result.payload.dispatch_id}`);
    console.log(`  current_dispatch: ${result.artifacts.current_dispatch}`);
  } else {
    console.log(`  current_dispatch: ${result.artifacts.current_dispatch}`);
  }
}

function main(argv = process.argv.slice(2)) {
  const { command, options } = parseArgs(argv);

  if (!command || options.help || command === 'help' || command === '--help' || command === '-h') {
    printUsage();
    return 0;
  }

  if (command === 'apply') {
    const inputCount = [Boolean(options.payload), Boolean(options.stdin)].filter(Boolean).length;
    if (inputCount === 0) {
      throw new Error('Missing dispatch input: use --payload <file> or --stdin');
    }
    if (inputCount > 1) {
      throw new Error('Use either --payload <file> or --stdin, not both');
    }

    const result = applyDispatch(options);
    if (options.json) {
      console.log(JSON.stringify(result, null, 2));
    } else {
      printPretty(result, command);
    }
    return 0;
  }

  if (command === 'clear') {
    const result = clearDispatch(options);
    if (options.json) {
      console.log(JSON.stringify(result, null, 2));
    } else {
      printPretty(result, command);
    }
    return 0;
  }

  throw new Error(`Unsupported expert-dispatch command: ${command}`);
}

module.exports = {
  main,
  applyDispatch,
  clearDispatch,
  validateDispatchPayload,
  normalizeDispatchPayload,
};

if (require.main === module) {
  try {
    process.exit(main());
  } catch (error) {
    console.error(`expert-dispatch error: ${error.message}`);
    process.exit(1);
  }
}
