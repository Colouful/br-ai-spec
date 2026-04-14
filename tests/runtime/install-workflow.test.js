const assert = require('assert');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { PassThrough, Writable } = require('stream');
const { spawnSync } = require('child_process');
const { __test__ } = require('../../bin/install-workflow');

const repoRoot = path.join(__dirname, '..', '..');
const { selectCustomRuleList } = __test__;

function createWorkspace(prefix) {
  return fs.mkdtempSync(path.join(os.tmpdir(), prefix));
}

function writeJson(filePath, value) {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(filePath, `${JSON.stringify(value, null, 2)}\n`, 'utf8');
}

function writeExecutable(filePath, content) {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(filePath, content, 'utf8');
  fs.chmodSync(filePath, 0o755);
}

function createFakePackageManagerBin(targetDir) {
  const fakeBinDir = path.join(targetDir, 'fake-pkg-bin');
  const script = `#!/bin/sh
if [ "$1" = "--version" ]; then
  echo "9.0.0"
  exit 0
fi
if [ "$1" = "uninstall" ]; then
  shift
  node - "$PWD/package.json" "$@" <<'NODE'
const fs = require('fs');
const pkgPath = process.argv[2];
const packages = process.argv.slice(3);
const pkg = JSON.parse(fs.readFileSync(pkgPath, 'utf8'));
for (const name of packages) {
  if (pkg.dependencies) delete pkg.dependencies[name];
  if (pkg.devDependencies) delete pkg.devDependencies[name];
}
if (pkg.dependencies && Object.keys(pkg.dependencies).length === 0) delete pkg.dependencies;
if (pkg.devDependencies && Object.keys(pkg.devDependencies).length === 0) delete pkg.devDependencies;
fs.writeFileSync(pkgPath, JSON.stringify(pkg, null, 2) + '\\n', 'utf8');
NODE
  exit 0
fi
exit 0
`;
  writeExecutable(path.join(fakeBinDir, 'pnpm'), script);
  writeExecutable(path.join(fakeBinDir, 'npm'), script);
  return fakeBinDir;
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

async function withMockTTY(run) {
  const originalStdin = Object.getOwnPropertyDescriptor(process, 'stdin');
  const originalStdout = Object.getOwnPropertyDescriptor(process, 'stdout');

  const input = new PassThrough();
  input.isTTY = true;
  input.setRawMode = () => {};

  const outputChunks = [];
  const output = new Writable({
    write(chunk, _encoding, callback) {
      outputChunks.push(Buffer.isBuffer(chunk) ? chunk.toString('utf8') : String(chunk));
      callback();
    },
  });
  output.isTTY = true;

  Object.defineProperty(process, 'stdin', { configurable: true, value: input });
  Object.defineProperty(process, 'stdout', { configurable: true, value: output });

  try {
    return await run({
      input,
      getOutput() {
        return outputChunks.join('');
      },
    });
  } finally {
    Object.defineProperty(process, 'stdin', originalStdin);
    Object.defineProperty(process, 'stdout', originalStdout);
  }
}

async function verifyInteractiveCustomRuleSelectionUsesSpaceToggle() {
  const options = { rulesStrategy: 'custom', customRules: [] };

  await withMockTTY(async ({ input, getOutput }) => {
    const selection = selectCustomRuleList(options, {
      defaultRules: ['01-项目概述.md', '03-项目结构.md'],
      hint: '默认已勾选 01/03（项目概述、项目结构），可按空格取消',
    });

    setImmediate(() => {
      input.write('\x1b[B');
      input.write('\x1b[B');
      input.write(' ');
      input.write('\r');
    });

    await selection;

    const output = getOutput();
    assert.ok(output.includes('空格选中/取消'));
    assert.ok(!output.includes('1) ['));
  });

  assert.deepStrictEqual(options.customRules, [
    '01-项目概述.md',
    '03-项目结构.md',
    '04-组件规范.md',
  ]);
}

async function verifyInteractiveEmptySelectionFallsBackToStandard() {
  const options = { rulesStrategy: 'custom', customRules: [] };

  await withMockTTY(async ({ input }) => {
    const selection = selectCustomRuleList(options, {
      defaultRules: ['01-项目概述.md', '03-项目结构.md'],
      hint: '默认已勾选 01/03（项目概述、项目结构），可按空格取消',
      emptySelectionLabel: '未选择任何自定义规则，将使用标准规范。',
    });

    setImmediate(() => {
      input.write(' ');
      input.write('\x1b[B');
      input.write(' ');
      input.write('\r');
    });

    await selection;
  });

  assert.strictEqual(options.rulesStrategy, 'standard');
  assert.deepStrictEqual(options.customRules, []);
}

async function main() {
  await verifyInteractiveCustomRuleSelectionUsesSpaceToggle();
  await verifyInteractiveEmptySelectionFallsBackToStandard();

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

  const syncOnlyTarget = createWorkspace('ai-spec-sync-check-');
  writeJson(path.join(syncOnlyTarget, 'package.json'), {
    name: 'sync-check-smoke',
    version: '1.0.0',
  });
  fs.mkdirSync(path.join(syncOnlyTarget, '.agents', 'rules'), { recursive: true });
  fs.mkdirSync(path.join(syncOnlyTarget, '.agents', 'skills'), { recursive: true });
  writeJson(path.join(syncOnlyTarget, '.ai-spec', 'manifest.json'), {
    profile: 'vue',
    rules: ['project-overview'],
    skills: ['create-proposal'],
  });
  writeJson(path.join(syncOnlyTarget, '.ai-spec', 'lock.json'), {
    manifest: { profile: 'vue' },
  });

  result = runCli(['check', syncOnlyTarget]);
  assert.strictEqual(result.status, 0, result.stderr);
  assert.ok(result.stdout.includes('sync --manifest 同步资源'));

  const manifestInitTarget = createWorkspace('ai-spec-init-manifest-');
  writeJson(path.join(manifestInitTarget, 'package.json'), {
    name: 'init-manifest-smoke',
    version: '1.0.0',
  });
  fs.mkdirSync(path.join(manifestInitTarget, '.agents', 'rules'), { recursive: true });
  const manifestPath = path.join(manifestInitTarget, 'prd-to-delivery.manifest.json');
  writeJson(manifestPath, {
    schema_version: 1,
    manifest_type: 'hub-install',
    profile: 'vue',
    ides: ['cursor', 'claude'],
    scenario_packages: [],
    roles: ['task-orchestrator'],
    skills: ['create-proposal'],
    rules: ['api-standard'],
    entry_role: 'task-orchestrator',
  });
  const fakeBinDir = path.join(manifestInitTarget, 'fake-bin');
  writeExecutable(
    path.join(fakeBinDir, 'npx'),
    `#!/bin/sh
if [ "$1" = "--version" ]; then
  echo "10.0.0"
  exit 0
fi
if [ "$1" = "openspec" ]; then
  exit 0
fi
echo "unexpected npx invocation: $@" >&2
exit 1
`,
  );

  result = runCli(
    ['init', manifestInitTarget, '--manifest', manifestPath, '--custom-rules', '--no-lint', '--no-husky', '--no-uipro'],
    { PATH: `${fakeBinDir}:${process.env.PATH || ''}` },
  );
  assert.strictEqual(result.status, 0, result.stderr);
  assert.ok(result.stdout.includes('init-with-manifest'));
  assert.ok(result.stdout.includes('目标项目已包含 .agents/ 目录'));
  assert.ok(fs.existsSync(path.join(manifestInitTarget, '.agents', 'skills', 'create-proposal', 'SKILL.md')));
  assert.ok(!fs.existsSync(path.join(manifestInitTarget, '.agents', 'skills', 'create-api')));
  assert.ok(fs.existsSync(path.join(manifestInitTarget, '.agents', 'rules', '05-API规范.md')));
  assert.ok(!fs.existsSync(path.join(manifestInitTarget, '.agents', 'rules', '01-项目概述.md')));
  assert.ok(fs.existsSync(path.join(manifestInitTarget, '.cursor', 'commands', 'opsx-propose.md')));
  assert.ok(fs.existsSync(path.join(manifestInitTarget, 'node_modules', '.bin', 'ai-spec-auto')) || fs.existsSync(path.join(manifestInitTarget, 'node_modules', '.bin', 'ai-spec-auto.cmd')));
  assert.ok(result.stdout.includes('预校验通过'));
  assert.ok(result.stdout.includes('/project-init'));
  assert.ok(result.stdout.includes('/spec-start'));
  const writtenManifest = JSON.parse(fs.readFileSync(path.join(manifestInitTarget, '.ai-spec', 'manifest.json'), 'utf8'));
  assert.deepStrictEqual(writtenManifest.local_preferences.project_init.custom_rules, [
    '01-项目概述.md',
    '03-项目结构.md',
    '04-组件规范.md',
    '05-API规范.md',
    '06-路由规范.md',
    '07-状态管理.md',
    '09-样式规范.md',
  ]);

  const invalidManifestInitTarget = createWorkspace('ai-spec-init-manifest-invalid-');
  writeJson(path.join(invalidManifestInitTarget, 'package.json'), {
    name: 'init-manifest-invalid-smoke',
    version: '1.0.0',
  });
  const invalidManifestPath = path.join(invalidManifestInitTarget, 'broken.manifest.json');
  writeJson(invalidManifestPath, {
    schema_version: 1,
    manifest_type: 'hub-install',
    profile: 'vue',
    ides: ['cursor'],
    roles: ['task-orchestrator'],
    skills: ['missing-skill'],
    rules: ['api-standard'],
    entry_role: 'task-orchestrator',
  });
  result = runCli(
    ['init', invalidManifestInitTarget, '--manifest', invalidManifestPath, '--no-lint', '--no-husky', '--no-uipro'],
    { PATH: `${fakeBinDir}:${process.env.PATH || ''}` },
  );
  assert.notStrictEqual(result.status, 0);
  assert.ok(result.stderr.includes('Unknown skill（技能） id'));
  assert.ok(!fs.existsSync(path.join(invalidManifestInitTarget, '.agents')));
  assert.ok(!fs.existsSync(path.join(invalidManifestInitTarget, 'node_modules', '.bin', 'ai-spec-auto')));

  const updateScopeTarget = createWorkspace('ai-spec-update-ide-scope-');
  writeJson(path.join(updateScopeTarget, 'package.json'), {
    name: 'update-ide-scope-smoke',
    version: '1.0.0',
  });
  result = runCli(['init', updateScopeTarget, '--profile', 'vue', '--level', 'L2', '--ide', 'cursor', '--no-lint', '--no-husky', '--no-uipro']);
  assert.strictEqual(result.status, 0, result.stderr);
  assert.ok(!fs.existsSync(path.join(updateScopeTarget, '.claude')));

  result = runCli(['update', updateScopeTarget, '--skip-skills', '--skip-configs', '--skip-openspec', '--skip-uipro']);
  assert.strictEqual(result.status, 0, result.stderr);
  assert.ok(fs.existsSync(path.join(updateScopeTarget, '.cursor', 'commands', 'opsx-propose.md')));
  assert.ok(!fs.existsSync(path.join(updateScopeTarget, '.claude', 'commands', 'spec-start.md')));

  result = runCli(['update', updateScopeTarget, '--ide', 'claude', '--skip-skills', '--skip-configs', '--skip-openspec', '--skip-uipro']);
  assert.strictEqual(result.status, 0, result.stderr);
  assert.ok(fs.existsSync(path.join(updateScopeTarget, '.claude', 'commands', 'spec-start.md')));

  const uninstallTarget = createWorkspace('ai-spec-uninstall-managed-');
  const uninstallFakeBin = createFakePackageManagerBin(uninstallTarget);
  writeJson(path.join(uninstallTarget, 'package.json'), {
    name: 'uninstall-managed-smoke',
    version: '1.0.0',
    scripts: {
      prepare: 'husky install',
    },
    devDependencies: {
      '@ex/ai-spec-auto': '0.0.60',
      eslint: '^9.0.0',
      prettier: '^3.0.0',
    },
  });
  fs.mkdirSync(path.join(uninstallTarget, '.agents', 'skills'), { recursive: true });
  fs.mkdirSync(path.join(uninstallTarget, '.cursor', 'commands'), { recursive: true });
  fs.mkdirSync(path.join(uninstallTarget, '.ai-spec'), { recursive: true });
  fs.writeFileSync(path.join(uninstallTarget, '.cursor', 'commands', 'opsx-propose.md'), '# cmd\n', 'utf8');
  fs.writeFileSync(path.join(uninstallTarget, '.eslintrc.js'), 'module.exports = {};\n', 'utf8');
  fs.writeFileSync(path.join(uninstallTarget, '.prettierrc.json'), '{}\n', 'utf8');
  writeJson(path.join(uninstallTarget, '.ai-spec', 'manifest.json'), { profile: 'vue', ides: ['cursor'] });
  writeJson(path.join(uninstallTarget, '.ai-spec', 'lock.json'), { resolved: {} });
  writeJson(path.join(uninstallTarget, '.ai-spec', 'sources.json'), { assets: [] });
  writeJson(path.join(uninstallTarget, '.ai-spec', 'install-state.json'), {
    schema_version: 1,
    managed_paths: ['.agents', '.cursor/commands/opsx-propose.md'],
    created_config_files: ['.eslintrc.js'],
    added_dev_dependencies: ['@ex/ai-spec-auto', 'eslint'],
    package_json: {
      prepare_script: 'husky install',
    },
  });
  result = runCli(['uninstall', uninstallTarget, '-y'], { PATH: `${uninstallFakeBin}:${process.env.PATH || ''}` });
  assert.strictEqual(result.status, 0, result.stderr);
  const uninstallPkg = JSON.parse(fs.readFileSync(path.join(uninstallTarget, 'package.json'), 'utf8'));
  assert.ok(!fs.existsSync(path.join(uninstallTarget, '.agents')));
  assert.ok(!fs.existsSync(path.join(uninstallTarget, '.cursor', 'commands', 'opsx-propose.md')));
  assert.ok(!fs.existsSync(path.join(uninstallTarget, '.eslintrc.js')));
  assert.ok(fs.existsSync(path.join(uninstallTarget, '.prettierrc.json')));
  assert.ok(!('prepare' in (uninstallPkg.scripts || {})));
  assert.ok(!('@ex/ai-spec-auto' in (uninstallPkg.devDependencies || {})));
  assert.ok(!('eslint' in (uninstallPkg.devDependencies || {})));
  assert.ok('prettier' in (uninstallPkg.devDependencies || {}));
  assert.ok(!fs.existsSync(path.join(uninstallTarget, '.ai-spec')));

  const uninstallPrepareKeepTarget = createWorkspace('ai-spec-uninstall-prepare-keep-');
  const uninstallPrepareFakeBin = createFakePackageManagerBin(uninstallPrepareKeepTarget);
  writeJson(path.join(uninstallPrepareKeepTarget, 'package.json'), {
    name: 'uninstall-prepare-keep-smoke',
    version: '1.0.0',
    scripts: {
      prepare: 'custom && husky install',
    },
    devDependencies: {
      eslint: '^9.0.0',
    },
  });
  fs.mkdirSync(path.join(uninstallPrepareKeepTarget, '.agents'), { recursive: true });
  fs.mkdirSync(path.join(uninstallPrepareKeepTarget, '.ai-spec'), { recursive: true });
  writeJson(path.join(uninstallPrepareKeepTarget, '.ai-spec', 'install-state.json'), {
    schema_version: 1,
    managed_paths: ['.agents'],
    created_config_files: [],
    added_dev_dependencies: ['eslint'],
    package_json: {
      prepare_script: 'husky install',
    },
  });
  result = runCli(['uninstall', uninstallPrepareKeepTarget, '-y'], { PATH: `${uninstallPrepareFakeBin}:${process.env.PATH || ''}` });
  assert.strictEqual(result.status, 0, result.stderr);
  const keepPreparePkg = JSON.parse(fs.readFileSync(path.join(uninstallPrepareKeepTarget, 'package.json'), 'utf8'));
  assert.strictEqual(keepPreparePkg.scripts.prepare, 'custom && husky install');

  const legacyUninstallTarget = createWorkspace('ai-spec-uninstall-legacy-');
  const legacyFakeBin = createFakePackageManagerBin(legacyUninstallTarget);
  writeJson(path.join(legacyUninstallTarget, 'package.json'), {
    name: 'uninstall-legacy-smoke',
    version: '1.0.0',
    devDependencies: {
      eslint: '^9.0.0',
    },
  });
  fs.mkdirSync(path.join(legacyUninstallTarget, '.agents'), { recursive: true });
  fs.mkdirSync(path.join(legacyUninstallTarget, '.cursor', 'commands'), { recursive: true });
  fs.mkdirSync(path.join(legacyUninstallTarget, '.ai-spec'), { recursive: true });
  fs.writeFileSync(path.join(legacyUninstallTarget, '.cursor', 'commands', 'opsx-propose.md'), '# cmd\n', 'utf8');
  fs.writeFileSync(path.join(legacyUninstallTarget, '.eslintrc.js'), 'module.exports = {};\n', 'utf8');
  writeJson(path.join(legacyUninstallTarget, '.ai-spec', 'manifest.json'), { profile: 'vue', ides: ['cursor'] });
  writeJson(path.join(legacyUninstallTarget, '.ai-spec', 'lock.json'), { resolved: {} });
  writeJson(path.join(legacyUninstallTarget, '.ai-spec', 'sources.json'), { assets: [] });
  result = runCli(['uninstall', legacyUninstallTarget, '-y'], { PATH: `${legacyFakeBin}:${process.env.PATH || ''}` });
  assert.strictEqual(result.status, 0, result.stderr);
  const legacyPkg = JSON.parse(fs.readFileSync(path.join(legacyUninstallTarget, 'package.json'), 'utf8'));
  assert.ok(!fs.existsSync(path.join(legacyUninstallTarget, '.agents')));
  assert.ok(!fs.existsSync(path.join(legacyUninstallTarget, '.cursor', 'commands', 'opsx-propose.md')));
  assert.ok(fs.existsSync(path.join(legacyUninstallTarget, '.eslintrc.js')));
  assert.ok('eslint' in (legacyPkg.devDependencies || {}));

  result = runInstallWrapper(['help']);
  assert.strictEqual(result.status, 0, result.stderr);
  assert.ok(result.stdout.includes('npx @ex/ai-spec-auto@latest init .'));
  assert.ok(result.stdout.includes('npx @ex/ai-spec-auto@latest init . --manifest <file-or-url>'));

  console.log('install workflow test passed: node installer core handles init/check, and thin bash wrapper forwards help to the node workflow');
}

main().catch((error) => {
  console.error(error.stack || error.message);
  process.exit(1);
});
