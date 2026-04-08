const assert = require('assert');
const fs = require('fs');
const os = require('os');
const path = require('path');
const protocolWorkflow = require('../../internal/ai-protocol-workflow');
const { archiveChange } = require('../../bin/archive-change');
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

function advance(targetDir) {
  return runner.advanceRunner({
    target: targetDir,
  });
}

function status(targetDir) {
  return runner.buildStatus(targetDir);
}

function step(targetDir, userInput = null) {
  return protocolWorkflow.advanceProtocolStep({
    target: targetDir,
    userInput,
  });
}

function listTurnTargets(turn) {
  return turn.writes.map((item) => item.rel_path || item.value);
}

function writeRuntimeActionInbox(targetDir, value) {
  writeProjectFile(targetDir, '.ai-spec/internal/tmp/current-runtime-action.json', JSON.stringify(value, null, 2));
}

function writeExecutionInbox(targetDir, value) {
  writeProjectFile(targetDir, '.ai-spec/internal/tmp/current-execution.json', JSON.stringify(value, null, 2));
}

function main() {
  const targetDir = fs.mkdtempSync(path.join(os.tmpdir(), 'br-ai-spec-runner-test-'));
  writeProjectFile(targetDir, 'package.json', JSON.stringify({
    name: 'runner-smoke',
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
  writeProjectFile(targetDir, 'src/api/order.ts', 'export function getOrderListApi() {}');
  writeProjectFile(targetDir, 'src/api/types/order.ts', 'export interface Order {}');
  writeProjectFile(targetDir, 'src/mock/order.ts', 'export const orderMock = [];');
  writeProjectFile(targetDir, 'src/store/modules/demo/index.ts', 'export const useDemoStore = () => ({})');
  writeProjectFile(targetDir, 'src/styles/variables.scss', ':root {}');
  writeProjectFile(targetDir, 'context/PROJECT.md', '# PROJECT');

  let workflow = step(targetDir, '创建一个商品组件');
  assert.strictEqual(workflow.advanced, null);
  assert.strictEqual(workflow.turn.mode, 'start');
  assert.strictEqual(workflow.turn.actor.id, 'task-orchestrator');
  assert.strictEqual(workflow.turn.command, '/spec-start');
  assert.strictEqual(workflow.turn.guidance.project_context.framework, 'vue');
  assert.strictEqual(workflow.turn.guidance.repo_conventions.route_modules_dir, 'src/router/modules');
  assert.strictEqual(workflow.turn.guidance.routing_constraints.first_handoff, 'requirement-analyst');
  assert.ok(workflow.turn.guidance.routing_constraints.route_strategy.includes('src/router/index.ts'));
  assert.ok(workflow.turn.guidance.orchestration_contract.required_experts.includes('code-guardian'));
  assert.ok(workflow.turn.guidance.role_rule_contract.source_rules.some((item) => item.path.includes('01-项目概述.md')));
  assert.deepStrictEqual(listTurnTargets(workflow.turn), ['.ai-spec/internal/tmp/task-orchestrator-turn.json']);

  copyFixture(targetDir, 'task-orchestrator-bootstrap-reply.md', 'task-orchestrator-turn.json');
  let report = advance(targetDir);
  assert.strictEqual(report.kind, 'task-orchestrator-runner-advance-result');
  assert.strictEqual(report.consumed.kind, 'task-orchestrator-turn');
  assert.strictEqual(report.applied.adapter_action, 'bootstrap');
  assert.strictEqual(report.applied.run_id, 'run_20260331_160700_smoke');
  assert.strictEqual(report.recorded.dispatch.role, 'requirement-analyst');
  assert.deepStrictEqual(report.next_expected.files, ['.ai-spec/internal/tmp/current-execution.json']);

  workflow = step(targetDir);
  assert.strictEqual(workflow.turn.mode, 'execute');
  assert.strictEqual(workflow.turn.actor.id, 'requirement-analyst');
  assert.strictEqual(workflow.turn.command, 'requirement-analyst');
  assert.strictEqual(workflow.turn.guidance.project_context.framework, 'vue');
  assert.strictEqual(workflow.turn.guidance.project_context.language, 'TypeScript');
  assert.strictEqual(workflow.turn.guidance.repo_conventions.route_modules_dir, 'src/router/modules');
  assert.ok(Array.isArray(workflow.turn.guidance.role_rule_contract.source_rules));
  assert.ok(workflow.turn.guidance.role_rule_contract.source_rules.some((item) => item.path.includes('05-API规范.md')));
  assert.ok(Array.isArray(workflow.turn.guidance.role_skill_contract.primary_skills));
  assert.ok(workflow.turn.guidance.role_skill_contract.primary_skills.includes('create-proposal'));
  assert.ok(workflow.turn.guidance.analysis_contract);
  assert.deepStrictEqual(listTurnTargets(workflow.turn), [
    '.ai-spec/internal/tmp/current-execution.json',
    'openspec/changes/runtime-smoke-demo/proposal.md',
    'openspec/changes/runtime-smoke-demo/specs/ui/spec.md',
    'openspec/changes/runtime-smoke-demo/tasks.md',
  ]);

  writeProjectFile(targetDir, 'openspec/changes/runtime-smoke-demo/proposal.md', [
    '# 变更提案：runtime-smoke-demo',
    '',
    '## 目标',
    '- 新增一个商品组件演示页，验证协议链与页面落点约定。',
    '',
    '## 范围',
    '- 页面放在 src/views，保留最小 mock 数据与组件结构。',
    '',
    '## 风险',
    '- 当前仅演示协议流，不接真实 API。',
  ].join('\n'));
  writeProjectFile(targetDir, 'openspec/changes/runtime-smoke-demo/specs/ui/spec.md', [
    '## 新增需求',
    '',
    '### 需求：商品演示页',
    '',
    '系统必须提供一个最小商品演示页，用于协议链验证。',
    '',
    '#### 场景：查看商品演示页',
    '',
    '- **已知** 当前仅提供 mock 数据',
    '- **当** 用户进入商品演示页',
    '- **则** 页面展示本地 mock 列表且不请求真实接口',
  ].join('\n'));
  writeProjectFile(targetDir, 'openspec/changes/runtime-smoke-demo/tasks.md', [
    '# 实施任务',
    '',
    '- [ ] 创建页面与基础组件结构',
    '- [ ] 补齐路由入口与懒加载配置',
    '- [ ] 保持 mock 数据与样式变量约定',
  ].join('\n'));
  copyFixture(targetDir, 'current-execution-requirement-analyst.json', 'current-execution.json');
  report = advance(targetDir);
  assert.strictEqual(report.consumed.kind, 'expert-execution');
  assert.strictEqual(report.recorded.execution.role, 'requirement-analyst');
  assert.strictEqual(report.recorded.runtime_action.action, 'handoff');
  assert.strictEqual(report.applied.adapter_action, 'handoff');
  assert.strictEqual(report.applied.current_role, 'frontend-implementer');
  assert.strictEqual(report.recorded.dispatch.role, 'frontend-implementer');
  assert.deepStrictEqual(report.next_expected.files, ['.ai-spec/internal/tmp/current-execution.json']);

  workflow = step(targetDir);
  assert.strictEqual(workflow.turn.mode, 'execute');
  assert.strictEqual(workflow.turn.actor.id, 'frontend-implementer');
  assert.strictEqual(workflow.turn.command, 'frontend-implementer');
  assert.ok(workflow.turn.guidance.implementation_contract);
  assert.ok(workflow.turn.guidance.role_skill_contract.primary_skills.includes('create-route'));
  assert.ok(
    workflow.turn.guidance.role_skill_contract.read_targets.some((item) => item.rel_path === '.agents/skills/profiles/vue/create-route/SKILL.md' && item.exists),
  );
  assert.deepStrictEqual(listTurnTargets(workflow.turn), [
    '.ai-spec/internal/tmp/current-execution.json',
    'code',
    'implementation-notes',
  ]);

  copyFixture(targetDir, 'current-execution-frontend-implementer.json', 'current-execution.json');
  report = advance(targetDir);
  assert.strictEqual(report.recorded.execution.role, 'frontend-implementer');
  assert.strictEqual(report.recorded.runtime_action.action, 'handoff');
  assert.strictEqual(report.applied.adapter_action, 'handoff');
  assert.strictEqual(report.applied.current_role, 'code-guardian');
  assert.strictEqual(report.recorded.dispatch.role, 'code-guardian');
  assert.deepStrictEqual(report.next_expected.files, ['.ai-spec/internal/tmp/current-execution.json']);

  workflow = step(targetDir);
  assert.strictEqual(workflow.turn.mode, 'execute');
  assert.strictEqual(workflow.turn.actor.id, 'code-guardian');
  assert.strictEqual(workflow.turn.command, 'code-guardian');
  assert.ok(workflow.turn.guidance.review_contract);
  assert.ok(workflow.turn.guidance.role_rule_contract.source_rules.some((item) => item.path.includes('14-审计汇报规范.md')));
  assert.ok(workflow.turn.guidance.review_contract.evidence_targets.includes('src/router/index.ts'));
  assert.ok(workflow.turn.guidance.review_contract.evidence_targets.includes('src/api'));
  assert.ok(workflow.turn.guidance.review_contract.blocking_checks.some((item) => item.includes('src/api')));
  assert.ok(workflow.turn.guidance.review_contract.scope_guard.some((item) => item.includes('proposal/tasks')));
  assert.ok(workflow.turn.guidance.review_contract.verification_expectations.includes('pnpm run build'));
  assert.deepStrictEqual(listTurnTargets(workflow.turn), [
    '.ai-spec/internal/tmp/current-execution.json',
    'openspec/changes/runtime-smoke-demo/checklist.md',
    'openspec/changes/runtime-smoke-demo/iterations.md',
  ]);

  writeProjectFile(targetDir, 'openspec/changes/runtime-smoke-demo/checklist.md', '# checklist');
  writeProjectFile(targetDir, 'openspec/changes/runtime-smoke-demo/iterations.md', '# iterations');
  copyFixture(targetDir, 'current-execution-code-guardian.json', 'current-execution.json');
  report = advance(targetDir);
  assert.strictEqual(report.consumed.kind, 'expert-execution');
  assert.strictEqual(report.recorded.execution.role, 'code-guardian');
  assert.strictEqual(report.recorded.runtime_action.action, 'gate-blocked');
  assert.strictEqual(report.applied.adapter_action, 'gate-blocked');
  assert.strictEqual(report.applied.status, 'waiting-approval');
  assert.strictEqual(report.applied.pending_gate, 'before-archive');
  assert.strictEqual(report.next_expected.producer, 'task-orchestrator');

  workflow = step(targetDir);
  assert.strictEqual(workflow.turn.status, 'blocked');
  assert.strictEqual(workflow.turn.mode, 'approval-gate');
  assert.strictEqual(workflow.turn.guidance.approval_gate.gate, 'before-archive');
  assert.strictEqual(workflow.turn.guidance.approval_gate.resume_to_role, 'archive-change');

  writeRuntimeActionInbox(targetDir, {
    schema_version: 1,
    kind: 'task-orchestrator-runtime-action',
    action: 'approve',
    gate: 'before-archive',
    to_role: 'archive-change',
    message: 'archive approved',
  });
  report = advance(targetDir);
  assert.strictEqual(report.recorded.runtime_action.action, 'approve');
  assert.strictEqual(report.applied.adapter_action, 'approve');
  assert.strictEqual(report.applied.current_role, 'archive-change');
  assert.strictEqual(report.recorded.dispatch.role, 'archive-change');

  workflow = step(targetDir);
  assert.strictEqual(workflow.turn.mode, 'execute');
  assert.strictEqual(workflow.turn.actor.id, 'archive-change');
  assert.ok(workflow.turn.guidance.role_skill_contract.primary_skills.includes('archive-change'));
  assert.strictEqual(workflow.turn.enforcement.execute_current_command_first, true);
  assert.strictEqual(workflow.turn.enforcement.current_command_finalizes_run, true);
  assert.ok(workflow.turn.enforcement.current_command.includes('ai-spec archive-change --target . --change-id'));
  assert.ok(workflow.turn.enforcement.current_command.includes('--complete-run'));
  assert.ok(workflow.turn.enforcement.current_command.includes('runtime-smoke-demo'));
  assert.strictEqual(workflow.turn.requires_advance, false);
  assert.strictEqual(workflow.turn.execution_contract, null);
  assert.ok(!listTurnTargets(workflow.turn).includes('.ai-spec/internal/tmp/current-execution.json'));

  const archiveResult = archiveChange({
    target: targetDir,
    changeId: 'runtime-smoke-demo',
    completeRun: true,
  });
  assert.strictEqual(archiveResult.status, 'success');
  assert.strictEqual(archiveResult.runtime_transition.state.status, 'success');
  assert.strictEqual(archiveResult.runtime_transition.state.current_role, 'archive-change');

  workflow = step(targetDir);
  assert.strictEqual(workflow.turn.status, 'terminal');
  assert.strictEqual(workflow.turn.actor, null);
  assert.strictEqual(workflow.turn.command, null);

  const currentRunPath = path.join(targetDir, '.ai-spec', 'current-run.json');
  assert.ok(fs.existsSync(currentRunPath), 'expected current-run.json to exist after replay');

  const currentRun = JSON.parse(fs.readFileSync(currentRunPath, 'utf8'));
  assert.strictEqual(currentRun.run_id, 'run_20260331_160700_smoke');
  assert.strictEqual(currentRun.status, 'success');
  assert.strictEqual(currentRun.current_role, 'archive-change');
  assert.strictEqual(currentRun.events.length, 6);
  assert.ok(currentRun.artifacts.proposal.includes('openspec/changes/archive/'));
  assert.ok(fs.existsSync(path.join(targetDir, 'openspec/specs/ui/spec.md')));

  const runnerStatus = status(targetDir);
  assert.strictEqual(runnerStatus.kind, 'task-orchestrator-runner-status');
  assert.strictEqual(runnerStatus.current.run_status, 'success');
  assert.strictEqual(runnerStatus.pending_inputs.length, 0);
  assert.strictEqual(runnerStatus.next_expected.producer, null);

  const consumedDir = path.join(targetDir, '.ai-spec', 'internal', 'runner', 'consumed');
  if (fs.existsSync(consumedDir)) {
    const consumedFiles = fs.readdirSync(consumedDir);
    assert.ok(consumedFiles.length >= 0);
  }

  console.log('task-orchestrator runner test passed: AI protocol flow reaches archive confirmation and terminal success');
}

main();
