const assert = require('assert');
const fs = require('fs');
const os = require('os');
const path = require('path');
const protocolWorkflow = require('../../internal/ai-protocol-workflow');
const runner = require('../../bin/task-orchestrator-runner');

const fixturesDir = path.join(__dirname, 'fixtures');

function copyFixture(targetDir, fixtureName, inboxName) {
  const inboxDir = path.join(targetDir, '.ai-spec', 'internal', 'tmp');
  fs.mkdirSync(inboxDir, { recursive: true });
  fs.copyFileSync(path.join(fixturesDir, fixtureName), path.join(inboxDir, inboxName));
}

function writeProjectFile(targetDir, relPath, content) {
  const filePath = path.join(targetDir, relPath);
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(filePath, `${content}\n`, 'utf8');
}

function createWorkspace(prefix) {
  const targetDir = fs.mkdtempSync(path.join(os.tmpdir(), prefix));
  writeProjectFile(targetDir, 'package.json', JSON.stringify({
    name: 'protocol-update-fast-path',
    scripts: {
      build: 'vite build',
      lint: 'eslint .',
      test: 'vitest run',
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
  }, null, 2));
  writeProjectFile(targetDir, 'pnpm-lock.yaml', 'lockfileVersion: 9.0');
  writeProjectFile(targetDir, 'src/router/index.ts', 'export const router = {}');
  writeProjectFile(targetDir, 'src/router/modules/demo.ts', 'export default []');
  writeProjectFile(targetDir, 'src/views/demo/index.vue', '<template><div /></template>');
  writeProjectFile(targetDir, 'src/mock/order.ts', 'export const orderMock = [];');
  writeProjectFile(targetDir, 'src/styles/variables.scss', ':root {}');
  writeProjectFile(targetDir, 'context/PROJECT.md', '# PROJECT');
  return targetDir;
}

function bootstrapRun(targetDir) {
  copyFixture(targetDir, 'task-orchestrator-bootstrap-reply.md', 'task-orchestrator-turn.json');
  return runner.advanceRunner({ target: targetDir });
}

function readCurrentRun(targetDir) {
  return JSON.parse(fs.readFileSync(path.join(targetDir, '.ai-spec', 'current-run.json'), 'utf8'));
}

function setupRunToArchiveGate(targetDir) {
  const bootstrap = bootstrapRun(targetDir);
  assert.strictEqual(bootstrap.applied.adapter_action, 'bootstrap');

  writeProjectFile(targetDir, 'openspec/changes/runtime-smoke-demo/proposal.md', [
    '# Proposal',
    '',
    '## Goal',
    '- Validate before-archive fast path with a complete compact proposal.',
    '',
    '## Scope',
    '- Keep the demo page in the current mock-only delivery boundary.',
    '- Reuse the repository layout instead of introducing unrelated refactors.',
    '',
    '## Risk',
    '- No real API integration in this verification workspace.',
  ].join('\n'));
  writeProjectFile(targetDir, 'openspec/changes/runtime-smoke-demo/specs/product-demo/spec.md', [
    '## 新增需求',
    '',
    '### 需求：商品演示页',
    '',
    '系统必须提供一个最小商品演示页，用于 fast path 验证。',
    '',
    '#### 场景：进入演示页',
    '',
    '- **已知** 当前场景只使用本地 mock 数据',
    '- **当** 用户进入商品演示页',
    '- **则** 页面展示本地 mock 内容，不请求真实接口',
  ].join('\n'));
  writeProjectFile(targetDir, 'openspec/changes/runtime-smoke-demo/design.md', [
    '# 技术设计',
    '',
    '## 实现落点',
    '- 页面保留最小 mock 结构',
    '- 不引入真实接口层与额外状态管理',
    '',
    '## 约束',
    '- 只验证归档门禁 fast path，不扩展本次变更范围',
  ].join('\n'));
  writeProjectFile(targetDir, 'openspec/changes/runtime-smoke-demo/tasks.md', [
    '# Tasks',
    '',
    '- [ ] Create mock page',
    '- [ ] Wire route placeholder',
    '- [ ] Prepare review notes',
  ].join('\n'));

  copyFixture(targetDir, 'current-execution-requirement-analyst.json', 'current-execution.json');
  let report = runner.advanceRunner({ target: targetDir });
  assert.strictEqual(report.applied.current_role, 'frontend-implementer');

  copyFixture(targetDir, 'current-execution-frontend-implementer.json', 'current-execution.json');
  report = runner.advanceRunner({ target: targetDir });
  assert.strictEqual(report.applied.current_role, 'code-guardian');

  writeProjectFile(targetDir, 'openspec/changes/runtime-smoke-demo/checklist.md', '# Checklist');
  writeProjectFile(targetDir, 'openspec/changes/runtime-smoke-demo/iterations.md', '# Iterations');
  copyFixture(targetDir, 'current-execution-code-guardian.json', 'current-execution.json');
  report = runner.advanceRunner({ target: targetDir });
  assert.strictEqual(report.applied.pending_gate, 'before-archive');

  const currentRun = readCurrentRun(targetDir);
  assert.strictEqual(currentRun.status, 'waiting-approval');
  assert.strictEqual(currentRun.pending_gate, 'before-archive');
}

function main() {
  const approveTarget = createWorkspace('br-ai-spec-fast-approve-');
  setupRunToArchiveGate(approveTarget);

  let result = protocolWorkflow.updateProtocolInput({
    target: approveTarget,
    userInput: '归档',
  });
  let currentRun = readCurrentRun(approveTarget);

  assert.strictEqual(result.fast_path.executed, true);
  assert.strictEqual(result.fast_path.action, 'archive-approved');
  assert.strictEqual(result.fast_path.requires_followup_turn, false);
  assert.strictEqual(result.turn.status, 'terminal');
  assert.strictEqual(currentRun.status, 'success');
  assert.strictEqual(currentRun.current_role, 'archive-change');
  assert.strictEqual(currentRun.pending_gate, null);
  assert.ok(result.fast_path.archived_to.includes('openspec/changes/archive/'));
  assert.ok(fs.existsSync(path.join(approveTarget, 'openspec/specs/product-demo/spec.md')));
  assert.ok(!fs.existsSync(path.join(approveTarget, 'openspec/changes/runtime-smoke-demo')));

  const skipTarget = createWorkspace('br-ai-spec-fast-skip-');
  setupRunToArchiveGate(skipTarget);

  result = protocolWorkflow.updateProtocolInput({
    target: skipTarget,
    userInput: '先不归档',
  });
  currentRun = readCurrentRun(skipTarget);

  assert.strictEqual(result.fast_path.executed, true);
  assert.strictEqual(result.fast_path.action, 'complete-without-archive');
  assert.strictEqual(result.fast_path.requires_followup_turn, false);
  assert.strictEqual(result.turn.status, 'terminal');
  assert.strictEqual(currentRun.status, 'success');
  assert.strictEqual(currentRun.current_role, 'code-guardian');
  assert.strictEqual(currentRun.pending_gate, null);
  assert.ok(fs.existsSync(path.join(skipTarget, 'openspec/changes/runtime-smoke-demo')));
  assert.ok(!fs.existsSync(path.join(skipTarget, 'openspec/changes/archive')));

  console.log('protocol-update fast-path test passed: before-archive decisions resolve locally without extra AI turn');
}

main();
