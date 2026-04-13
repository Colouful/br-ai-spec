const assert = require('assert');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { spawnSync } = require('child_process');

const repoRoot = path.join(__dirname, '..', '..');

function createWorkspace(prefix) {
  return fs.mkdtempSync(path.join(os.tmpdir(), prefix));
}

function writeJson(filePath, value) {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(filePath, `${JSON.stringify(value, null, 2)}\n`, 'utf8');
}

function runCli(args, extraEnv = {}) {
  return spawnSync('node', ['./bin/cli.js', ...args], {
    cwd: repoRoot,
    encoding: 'utf8',
    env: {
      ...process.env,
      BR_AI_SPEC_LOCAL: repoRoot,
      BR_AI_SPEC_FORCE_LOCAL_CLI: '1',
      ...extraEnv,
    },
  });
}

function runInstallWrapper(args, extraEnv = {}) {
  return spawnSync('bash', ['./install.sh', ...args], {
    cwd: repoRoot,
    encoding: 'utf8',
    env: {
      ...process.env,
      BR_AI_SPEC_LOCAL: repoRoot,
      BR_AI_SPEC_FORCE_LOCAL_CLI: '1',
      ...extraEnv,
    },
  });
}

async function main() {
  const target = createWorkspace('ai-spec-install-workflow-');
  writeJson(path.join(target, 'package.json'), {
    name: 'install-workflow-smoke',
    version: '1.0.0',
  });

  let result = runCli(['init', target, '--profile', 'vue', '--level', 'L1', '--no-lint', '--no-husky', '--no-uipro']);
  assert.strictEqual(result.status, 0, result.stderr);
  assert.ok(fs.existsSync(path.join(target, '.agents', 'rules', '01-项目概述.md')));
  assert.ok(fs.existsSync(path.join(target, '.agents', 'skills', 'create-proposal', 'SKILL.md')));
  assert.ok(fs.existsSync(path.join(target, 'node_modules', '.bin', 'ai-spec-auto')) || fs.existsSync(path.join(target, 'node_modules', '.bin', 'ai-spec-auto.cmd')));
  assert.ok(!fs.existsSync(path.join(target, '.cursor')));

  result = runCli(['check', target]);
  assert.strictEqual(result.status, 0, result.stderr);

  result = runInstallWrapper(['help']);
  assert.strictEqual(result.status, 0, result.stderr);
  assert.ok(result.stdout.includes('npx @ex/ai-spec-auto@latest init .'));

  console.log('install workflow test passed: node installer core handles init/check, and thin bash wrapper forwards help to the node workflow');
}

main().catch((error) => {
  console.error(error.stack || error.message);
  process.exit(1);
});
