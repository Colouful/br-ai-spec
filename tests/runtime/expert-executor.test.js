const assert = require('assert');
const fs = require('fs');
const os = require('os');
const path = require('path');
const runner = require('../../bin/task-orchestrator-runner');
const expertExecutor = require('../../bin/expert-executor');
const expertDispatch = require('../../bin/expert-dispatch');

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

function writeJsonFile(targetDir, relPath, value) {
  writeProjectFile(targetDir, relPath, JSON.stringify(value, null, 2));
}

function createWorkspace() {
  const targetDir = fs.mkdtempSync(path.join(os.tmpdir(), 'br-ai-spec-executor-test-'));
  writeProjectFile(targetDir, 'package.json', JSON.stringify({
    name: 'executor-smoke',
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
  return targetDir;
}

function bootstrapRun(targetDir) {
  copyFixture(targetDir, 'task-orchestrator-bootstrap-reply.md', 'task-orchestrator-turn.json');
  return runner.advanceRunner({ target: targetDir });
}

function readCurrentRun(targetDir) {
  return JSON.parse(fs.readFileSync(path.join(targetDir, '.ai-spec', 'current-run.json'), 'utf8'));
}

function assertMissingCurrentArtifacts(targetDir) {
  assert.ok(!fs.existsSync(path.join(targetDir, '.ai-spec', 'internal', 'current-dispatch.json')));
  assert.ok(!fs.existsSync(path.join(targetDir, '.ai-spec', 'internal', 'current-execution.json')));
  assert.ok(!fs.existsSync(path.join(targetDir, '.ai-spec', 'internal', 'current-runtime-action.json')));
}

function main() {
  const targetDir = createWorkspace();
  const bootstrap = bootstrapRun(targetDir);
  assert.strictEqual(bootstrap.applied.adapter_action, 'bootstrap');
  assert.strictEqual(bootstrap.recorded.dispatch.role, 'requirement-analyst');

  writeProjectFile(targetDir, 'openspec/changes/runtime-smoke-demo/proposal.md', [
    '# Proposal',
    '',
    '## Goal',
    '- Build a demo product card page for runtime smoke validation.',
    '',
    '## Scope',
    '- Keep the page small and aligned with repository conventions.',
    '',
    '## Risk',
    '- No real API integration in this smoke case.',
  ].join('\n'));
  writeProjectFile(targetDir, 'openspec/changes/runtime-smoke-demo/tasks.md', [
    '# Tasks',
    '',
    '- [ ] Create the page container and component structure',
    '- [ ] Register the route and lazy loading entry',
    '- [ ] Keep mock data and style variables aligned',
    '- [ ] Capture implementation notes for review',
  ].join('\n'));

  let result = expertExecutor.applyExecution({
    target: targetDir,
    payload: path.join(fixturesDir, 'current-execution-requirement-analyst.json'),
    advanceRuntime: true,
  });
  assert.strictEqual(result.payload.openspec_action, 'propose');
  assert.deepStrictEqual(result.validation.required_outputs, [
    'openspec/changes/runtime-smoke-demo/proposal.md',
    'openspec/changes/runtime-smoke-demo/tasks.md',
  ]);
  assert.strictEqual(result.runtime_transition.payload.action, 'handoff');
  assert.strictEqual(result.runtime_transition.applied.current_role, 'frontend-implementer');
  assert.strictEqual(readCurrentRun(targetDir).current_role, 'frontend-implementer');
  assertMissingCurrentArtifacts(targetDir);

  expertDispatch.applyDispatch({
    target: targetDir,
    payload: path.join(fixturesDir, 'current-dispatch-frontend-implementer.json'),
  });
  result = expertExecutor.applyExecution({
    target: targetDir,
    payload: path.join(fixturesDir, 'current-execution-frontend-implementer.json'),
    advanceRuntime: true,
  });
  assert.strictEqual(result.payload.openspec_action, 'apply');
  assert.deepStrictEqual(result.validation.required_inputs, [
    'openspec/changes/runtime-smoke-demo/proposal.md',
    'openspec/changes/runtime-smoke-demo/tasks.md',
  ]);
  assert.strictEqual(result.runtime_transition.payload.action, 'handoff');
  assert.strictEqual(result.runtime_transition.applied.current_role, 'code-guardian');
  assert.strictEqual(readCurrentRun(targetDir).current_role, 'code-guardian');
  assertMissingCurrentArtifacts(targetDir);

  expertDispatch.applyDispatch({
    target: targetDir,
    payload: path.join(fixturesDir, 'current-dispatch-code-guardian.json'),
  });
  writeProjectFile(targetDir, 'openspec/changes/runtime-smoke-demo/checklist.md', '# checklist');
  writeProjectFile(targetDir, 'openspec/changes/runtime-smoke-demo/iterations.md', '# iterations');
  result = expertExecutor.applyExecution({
    target: targetDir,
    payload: path.join(fixturesDir, 'current-execution-code-guardian.json'),
    advanceRuntime: true,
  });
  assert.strictEqual(result.payload.openspec_action, 'verify');
  assert.deepStrictEqual(result.validation.required_outputs, [
    'openspec/changes/runtime-smoke-demo/checklist.md',
    'openspec/changes/runtime-smoke-demo/iterations.md',
  ]);
  assert.strictEqual(result.runtime_transition.payload.action, 'complete');
  assert.strictEqual(result.runtime_transition.payload.openspec_action, 'archive');
  let currentRun = readCurrentRun(targetDir);
  assert.strictEqual(currentRun.status, 'success');
  assert.strictEqual(currentRun.current_role, 'code-guardian');
  assertMissingCurrentArtifacts(targetDir);

  const runtimeActionTarget = createWorkspace();
  bootstrapRun(runtimeActionTarget);
  writeProjectFile(runtimeActionTarget, 'openspec/changes/runtime-smoke-demo/proposal.md', '# Proposal');
  writeProjectFile(runtimeActionTarget, 'openspec/changes/runtime-smoke-demo/tasks.md', '# Tasks');
  writeProjectFile(runtimeActionTarget, 'openspec/changes/runtime-smoke-demo/checklist.md', '# checklist');
  writeProjectFile(runtimeActionTarget, 'openspec/changes/runtime-smoke-demo/iterations.md', '# iterations');
  result = expertExecutor.applyRuntimeActionData({
    target: runtimeActionTarget,
    advanceRuntime: true,
    payloadData: {
      schema_version: 1,
      kind: 'task-orchestrator-runtime-action',
      action: 'complete',
      status: 'success',
      to_role: 'code-guardian',
      message: 'manual archive closeout',
    },
  });
  assert.ok(result.payload.run_id, 'expected run_id to be hydrated from current-run');
  assert.strictEqual(result.payload.openspec_action, 'archive');
  currentRun = readCurrentRun(runtimeActionTarget);
  assert.strictEqual(currentRun.status, 'success');
  assert.strictEqual(currentRun.current_role, 'code-guardian');

  const registryOverrideTarget = createWorkspace();
  bootstrapRun(registryOverrideTarget);
  writeJsonFile(registryOverrideTarget, '.agents/registry/roles.json', {
    version: 1,
    roles: {
      'requirement-analyst': {
        runtime_transition: {
          action: 'handoff',
          to_role: 'frontend-implementer',
          next_role: 'code-guardian',
          status: 'running',
          message: 'registry override handoff message',
        },
      },
    },
  });
  writeProjectFile(registryOverrideTarget, 'openspec/changes/runtime-smoke-demo/proposal.md', [
    '# Proposal',
    '',
    '## Goal',
    '- Override transition message from project registry.',
    '',
    '## Scope',
    '- Keep compact proposal sufficient for the micro gate.',
  ].join('\n'));
  writeProjectFile(registryOverrideTarget, 'openspec/changes/runtime-smoke-demo/tasks.md', [
    '# Tasks',
    '',
    '- [ ] Step one',
    '- [ ] Step two',
    '- [ ] Step three',
  ].join('\n'));
  result = expertExecutor.applyExecution({
    target: registryOverrideTarget,
    payload: path.join(fixturesDir, 'current-execution-requirement-analyst.json'),
    advanceRuntime: true,
  });
  assert.strictEqual(result.runtime_transition.payload.message, 'registry override handoff message');

  console.log('expert-executor test passed: execution semantics advance runtime-state with propose/apply/verify/archive linkage');
}

main();
