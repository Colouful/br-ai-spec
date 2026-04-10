#!/usr/bin/env node
const assert = require('assert');
const cp = require('child_process');
const fs = require('fs');
const path = require('path');

const repoRoot = path.join(__dirname, '..');
const fixturesDir = path.join(repoRoot, 'tests', 'runtime', 'fixtures');

function parseArgs(argv) {
  const options = {
    targetRoot: null,
    output: null,
    packageName: require(path.join(repoRoot, 'package.json')).name,
  };

  const args = [...argv];
  while (args.length > 0) {
    const arg = args.shift();
    switch (arg) {
      case '--target-root':
        options.targetRoot = args.shift();
        break;
      case '--output':
        options.output = args.shift();
        break;
      case '--package-name':
        options.packageName = args.shift();
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

function printUsage() {
  console.log(`Usage:
  node scripts/post-publish-auto-fix-check.js --target-root <dir> [options]

Options:
  --output <file>         Write JSON result to file
  --package-name <name>   Package name to inspect in target node_modules
  --help                  Show this help
`);
}

function ensureDir(dirPath) {
  fs.mkdirSync(dirPath, { recursive: true });
}

function resetDir(dirPath) {
  fs.rmSync(dirPath, { recursive: true, force: true });
  ensureDir(dirPath);
}

function writeFile(baseDir, relPath, content) {
  const filePath = path.join(baseDir, relPath);
  ensureDir(path.dirname(filePath));
  fs.writeFileSync(filePath, `${String(content)}\n`, 'utf8');
}

function writePackageJson(baseDir, buildExitCode) {
  const pkg = {
    name: 'auto-fix-cli-demo',
    scripts: {
      build: `node -e "process.exit(${buildExitCode})"`,
      lint: 'node -e "process.exit(0)"',
      test: 'node -e "process.exit(0)"',
    },
    dependencies: {
      vue: '^3.5.0',
      'vue-router': '^4.4.0',
      pinia: '^3.0.0',
      vite: '^6.0.0',
    },
    devDependencies: {
      typescript: '^5.0.0',
    },
  };
  writeFile(baseDir, 'package.json', JSON.stringify(pkg, null, 2));
}

function seedWorkspace(baseDir, buildExitCode) {
  resetDir(baseDir);
  writePackageJson(baseDir, buildExitCode);
  writeFile(baseDir, 'pnpm-lock.yaml', 'lockfileVersion: 9.0');
  writeFile(baseDir, 'src/router/index.ts', 'export const router = {}');
  writeFile(baseDir, 'src/router/modules/demo.ts', 'export default []');
  writeFile(baseDir, 'src/views/demo/index.vue', '<template><div /></template>');
  writeFile(baseDir, 'src/api/order.ts', 'export function getOrderListApi() {}');
  writeFile(baseDir, 'src/api/types/order.ts', 'export interface Order {}');
  writeFile(baseDir, 'src/mock/order.ts', 'export const orderMock = [];');
  writeFile(baseDir, 'src/store/modules/demo/index.ts', 'export const useDemoStore = () => ({})');
  writeFile(baseDir, 'src/styles/variables.scss', ':root {}');
  writeFile(baseDir, 'context/PROJECT.md', '# PROJECT');
}

function seedOpenSpecArtifacts(baseDir) {
  writeFile(baseDir, 'openspec/changes/runtime-smoke-demo/proposal.md', [
    '# 变更提案：runtime-smoke-demo',
    '',
    '## 目标',
    '- 新增一个商品组件演示页，验证 auto-fix 回环。',
    '',
    '## 范围',
    '- 页面放在 src/views，保留最小 mock 数据与组件结构。',
    '',
    '## 风险',
    '- 当前仅演示协议流，不接真实 API。',
  ].join('\n'));

  writeFile(baseDir, 'openspec/changes/runtime-smoke-demo/specs/ui/spec.md', [
    '## 新增需求',
    '',
    '### 需求：商品演示页',
    '',
    '系统必须提供一个最小商品演示页，用于 auto-fix 验证。',
    '',
    '#### 场景：查看商品演示页',
    '',
    '- **已知** 当前仅提供 mock 数据',
    '- **当** 用户进入商品演示页',
    '- **则** 页面展示本地 mock 列表且不请求真实接口',
  ].join('\n'));

  writeFile(baseDir, 'openspec/changes/runtime-smoke-demo/design.md', [
    '# 技术设计',
    '',
    '## 实现落点',
    '- 页面落在 src/views',
    '- 路由落在 src/router/modules',
    '- mock 数据落在 src/mock',
  ].join('\n'));

  writeFile(baseDir, 'openspec/changes/runtime-smoke-demo/tasks.md', [
    '# 实施任务',
    '',
    '- [ ] 创建页面与基础组件结构',
    '- [ ] 补齐路由入口与懒加载配置',
    '- [ ] 保持 mock 数据与样式变量约定',
  ].join('\n'));
}

function copyFixture(baseDir, fixtureName, inboxName) {
  const inboxDir = path.join(baseDir, '.ai-spec', 'internal', 'tmp');
  ensureDir(inboxDir);
  fs.copyFileSync(path.join(fixturesDir, fixtureName), path.join(inboxDir, inboxName));
}

function readJson(filePath) {
  return JSON.parse(fs.readFileSync(filePath, 'utf8'));
}

function relativeTo(baseDir, filePath) {
  return path.relative(baseDir, filePath) || '.';
}

function runCli(targetRoot, args) {
  const cliPath = path.join(targetRoot, 'node_modules', '.bin', 'ai-spec');
  const raw = cp.execFileSync(cliPath, [...args, '--json'], {
    cwd: targetRoot,
    encoding: 'utf8',
    env: process.env,
  });
  return JSON.parse(raw);
}

function buildPackageJsonPath(targetRoot, packageName) {
  return path.join(targetRoot, 'node_modules', ...packageName.split('/'), 'package.json');
}

function buildResult(targetRoot, packageName) {
  const demoDir = path.join(targetRoot, '.tmp', 'auto-fix-cli-demo');
  seedWorkspace(demoDir, 1);

  copyFixture(demoDir, 'task-orchestrator-bootstrap-reply.md', 'task-orchestrator-turn.json');
  let advanceResult = runCli(targetRoot, ['protocol-advance', '--target', demoDir]);
  assert.strictEqual(advanceResult.advanced.recorded.dispatch.role, 'requirement-analyst');

  seedOpenSpecArtifacts(demoDir);
  copyFixture(demoDir, 'current-execution-requirement-analyst.json', 'current-execution.json');
  advanceResult = runCli(targetRoot, ['protocol-advance', '--target', demoDir]);
  assert.strictEqual(advanceResult.advanced.applied.current_role, 'frontend-implementer');
  assert.strictEqual(advanceResult.advanced.recorded.dispatch.role, 'frontend-implementer');

  copyFixture(demoDir, 'current-execution-frontend-implementer.json', 'current-execution.json');
  advanceResult = runCli(targetRoot, ['protocol-advance', '--target', demoDir]);
  assert.strictEqual(advanceResult.advanced.recorded.execution.role, 'frontend-implementer');
  assert.strictEqual(advanceResult.advanced.applied.current_role, 'frontend-implementer');
  assert.strictEqual(advanceResult.advanced.recorded.dispatch.role, 'frontend-implementer');

  const currentRunAfterFailure = readJson(path.join(demoDir, '.ai-spec', 'current-run.json'));
  assert.strictEqual(currentRunAfterFailure.auto_fix.active, true);
  assert.strictEqual(currentRunAfterFailure.auto_fix.attempts, 1);
  assert.strictEqual(currentRunAfterFailure.verification.overall_status, 'failed');
  assert.strictEqual(currentRunAfterFailure.auto_fix.last_failed_steps[0].name, 'build');

  const implementerTurn = runCli(targetRoot, ['protocol-step', '--target', demoDir]);
  assert.strictEqual(implementerTurn.turn.actor.id, 'frontend-implementer');
  assert.strictEqual(implementerTurn.turn.guidance.implementation_contract.auto_fix.active, true);
  assert.strictEqual(
    implementerTurn.turn.guidance.implementation_contract.latest_verification.overall_status,
    'failed',
  );

  writePackageJson(demoDir, 0);
  copyFixture(demoDir, 'current-execution-frontend-implementer.json', 'current-execution.json');
  advanceResult = runCli(targetRoot, ['protocol-advance', '--target', demoDir]);
  assert.strictEqual(advanceResult.advanced.applied.current_role, 'code-guardian');
  assert.strictEqual(advanceResult.advanced.recorded.dispatch.role, 'code-guardian');

  const currentRunAfterFix = readJson(path.join(demoDir, '.ai-spec', 'current-run.json'));
  assert.strictEqual(currentRunAfterFix.auto_fix.active, false);
  assert.strictEqual(currentRunAfterFix.auto_fix.attempts, 1);
  assert.strictEqual(currentRunAfterFix.verification.overall_status, 'passed');

  const guardianTurn = runCli(targetRoot, ['protocol-step', '--target', demoDir]);
  assert.strictEqual(guardianTurn.turn.actor.id, 'code-guardian');
  assert.strictEqual(guardianTurn.turn.guidance.review_contract.latest_auto_fix.attempts, 1);
  assert.strictEqual(
    guardianTurn.turn.guidance.review_contract.latest_verification.overall_status,
    'passed',
  );

  const repoMapPath = path.join(demoDir, '.ai-spec', 'repo-map.json');
  const repoMap = readJson(repoMapPath);
  const checkpointsDir = path.join(demoDir, '.ai-spec', 'checkpoints');

  return {
    ok: true,
    target_root: targetRoot,
    demo_dir: demoDir,
    installed_version: readJson(buildPackageJsonPath(targetRoot, packageName)).version,
    current_run_path: path.join(demoDir, '.ai-spec', 'current-run.json'),
    repo_map_path: repoMapPath,
    first_failure: {
      current_role: currentRunAfterFailure.current_role,
      verification: currentRunAfterFailure.verification.overall_status,
      auto_fix: currentRunAfterFailure.auto_fix,
      checkpoint_count: currentRunAfterFailure.checkpoint_count,
      last_checkpoint: currentRunAfterFailure.last_checkpoint,
    },
    after_fix: {
      current_role: currentRunAfterFix.current_role,
      verification: currentRunAfterFix.verification.overall_status,
      auto_fix: currentRunAfterFix.auto_fix,
      checkpoint_count: currentRunAfterFix.checkpoint_count,
      last_checkpoint: currentRunAfterFix.last_checkpoint,
    },
    guardian_review_contract: {
      latest_auto_fix: guardianTurn.turn.guidance.review_contract.latest_auto_fix,
      latest_verification: guardianTurn.turn.guidance.review_contract.latest_verification,
    },
    repo_map_paths: repoMap.paths,
    checkpoints: fs.existsSync(checkpointsDir)
      ? fs.readdirSync(checkpointsDir).flatMap((runId) => {
        const runDir = path.join(checkpointsDir, runId);
        return fs.readdirSync(runDir).map((name) => relativeTo(demoDir, path.join(runDir, name)));
      })
      : [],
  };
}

function main(argv) {
  const options = parseArgs(argv);
  if (options.help || !options.targetRoot) {
    printUsage();
    return options.help ? 0 : 1;
  }

  let result;
  try {
    result = buildResult(path.resolve(options.targetRoot), options.packageName);
  } catch (error) {
    result = {
      ok: false,
      error: {
        message: error.message,
        stack: error.stack,
      },
    };
  }

  const payload = `${JSON.stringify(result, null, 2)}\n`;
  if (options.output) {
    ensureDir(path.dirname(path.resolve(options.output)));
    fs.writeFileSync(path.resolve(options.output), payload, 'utf8');
  }
  process.stdout.write(payload);
  return result.ok ? 0 : 1;
}

if (require.main === module) {
  process.exit(main(process.argv.slice(2)));
}

module.exports = {
  main,
};
