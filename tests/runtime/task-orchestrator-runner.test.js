const assert = require('assert');
const fs = require('fs');
const os = require('os');
const path = require('path');
const protocolWorkflow = require('../../internal/ai-protocol-workflow');
const runner = require('../../bin/task-orchestrator-runner');

const fixturesDir = path.join(__dirname, 'fixtures');

function copyFixture(targetDir, fixtureName, inboxName) {
  const inboxDir = path.join(targetDir, '.ai-spec', 'tmp');
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

function main() {
  const targetDir = fs.mkdtempSync(path.join(os.tmpdir(), 'br-ai-spec-runner-test-'));

  let workflow = step(targetDir, '创建一个商品组件');
  assert.strictEqual(workflow.advanced, null);
  assert.strictEqual(workflow.turn.mode, 'start');
  assert.strictEqual(workflow.turn.actor.id, 'task-orchestrator');
  assert.strictEqual(workflow.turn.command, '/spec-start');
  assert.deepStrictEqual(listTurnTargets(workflow.turn), ['.ai-spec/tmp/task-orchestrator-reply.md']);

  copyFixture(targetDir, 'task-orchestrator-bootstrap-reply.md', 'task-orchestrator-reply.md');
  let report = advance(targetDir);
  assert.strictEqual(report.kind, 'task-orchestrator-runner-advance-result');
  assert.strictEqual(report.consumed.kind, 'task-orchestrator-reply');
  assert.strictEqual(report.applied.adapter_action, 'bootstrap');
  assert.strictEqual(report.applied.run_id, 'run_20260331_160700_smoke');
  assert.deepStrictEqual(report.next_expected.files, ['.ai-spec/tmp/current-dispatch.json']);

  workflow = step(targetDir);
  assert.strictEqual(workflow.turn.mode, 'dispatch');
  assert.strictEqual(workflow.turn.actor.id, 'task-orchestrator');
  assert.strictEqual(workflow.turn.command, 'task-orchestrator:dispatch');
  assert.deepStrictEqual(listTurnTargets(workflow.turn), ['.ai-spec/tmp/current-dispatch.json']);

  copyFixture(targetDir, 'current-dispatch-requirement-analyst.json', 'current-dispatch.json');
  report = advance(targetDir);
  assert.strictEqual(report.consumed.kind, 'expert-dispatch');
  assert.strictEqual(report.recorded.dispatch.role, 'requirement-analyst');
  assert.deepStrictEqual(report.next_expected.files, ['.ai-spec/tmp/current-execution.json']);

  workflow = step(targetDir);
  assert.strictEqual(workflow.turn.mode, 'execute');
  assert.strictEqual(workflow.turn.actor.id, 'requirement-analyst');
  assert.strictEqual(workflow.turn.command, 'requirement-analyst');
  assert.deepStrictEqual(listTurnTargets(workflow.turn), [
    '.ai-spec/tmp/current-execution.json',
    'openspec/changes/runtime-smoke-demo/proposal.md',
    'openspec/changes/runtime-smoke-demo/tasks.md',
  ]);

  writeProjectFile(targetDir, 'openspec/changes/runtime-smoke-demo/proposal.md', '# proposal');
  writeProjectFile(targetDir, 'openspec/changes/runtime-smoke-demo/tasks.md', '# tasks');
  copyFixture(targetDir, 'current-execution-requirement-analyst.json', 'current-execution.json');
  report = advance(targetDir);
  assert.strictEqual(report.consumed.kind, 'expert-execution');
  assert.strictEqual(report.recorded.execution.role, 'requirement-analyst');
  assert.deepStrictEqual(report.next_expected.files, [
    '.ai-spec/tmp/task-orchestrator-reply.md',
    '.ai-spec/tmp/current-runtime-action.json',
  ]);

  workflow = step(targetDir);
  assert.strictEqual(workflow.turn.mode, 'continue');
  assert.strictEqual(workflow.turn.actor.id, 'task-orchestrator');
  assert.strictEqual(workflow.turn.command, '/spec-continue');
  assert.deepStrictEqual(listTurnTargets(workflow.turn), ['.ai-spec/tmp/task-orchestrator-reply.md']);

  copyFixture(targetDir, 'task-orchestrator-handoff-reply.md', 'task-orchestrator-reply.md');
  report = advance(targetDir);
  assert.strictEqual(report.consumed.kind, 'task-orchestrator-reply');
  assert.strictEqual(report.recorded.runtime_action.action, 'handoff');
  assert.strictEqual(report.applied.adapter_action, 'handoff');
  assert.strictEqual(report.applied.current_role, 'frontend-implementer');
  assert.deepStrictEqual(report.next_expected.files, ['.ai-spec/tmp/current-dispatch.json']);

  workflow = step(targetDir);
  assert.strictEqual(workflow.turn.mode, 'dispatch');
  assert.strictEqual(workflow.turn.actor.id, 'task-orchestrator');
  assert.strictEqual(workflow.turn.command, 'task-orchestrator:dispatch');

  copyFixture(targetDir, 'current-dispatch-frontend-implementer.json', 'current-dispatch.json');
  report = advance(targetDir);
  assert.strictEqual(report.recorded.dispatch.role, 'frontend-implementer');
  assert.deepStrictEqual(report.next_expected.files, ['.ai-spec/tmp/current-execution.json']);

  workflow = step(targetDir);
  assert.strictEqual(workflow.turn.mode, 'execute');
  assert.strictEqual(workflow.turn.actor.id, 'frontend-implementer');
  assert.strictEqual(workflow.turn.command, 'frontend-implementer');
  assert.deepStrictEqual(listTurnTargets(workflow.turn), [
    '.ai-spec/tmp/current-execution.json',
    'code',
    'implementation-notes',
  ]);

  copyFixture(targetDir, 'current-execution-frontend-implementer.json', 'current-execution.json');
  report = advance(targetDir);
  assert.strictEqual(report.recorded.execution.role, 'frontend-implementer');
  assert.deepStrictEqual(report.next_expected.files, [
    '.ai-spec/tmp/task-orchestrator-reply.md',
    '.ai-spec/tmp/current-runtime-action.json',
  ]);

  workflow = step(targetDir);
  assert.strictEqual(workflow.turn.mode, 'continue');
  assert.strictEqual(workflow.turn.actor.id, 'task-orchestrator');
  assert.strictEqual(workflow.turn.command, '/spec-continue');

  copyFixture(targetDir, 'task-orchestrator-code-guardian-handoff-reply.md', 'task-orchestrator-reply.md');
  report = advance(targetDir);
  assert.strictEqual(report.consumed.kind, 'task-orchestrator-reply');
  assert.strictEqual(report.recorded.runtime_action.action, 'handoff');
  assert.strictEqual(report.applied.adapter_action, 'handoff');
  assert.strictEqual(report.applied.current_role, 'code-guardian');
  assert.deepStrictEqual(report.next_expected.files, ['.ai-spec/tmp/current-dispatch.json']);

  workflow = step(targetDir);
  assert.strictEqual(workflow.turn.mode, 'dispatch');
  assert.strictEqual(workflow.turn.actor.id, 'task-orchestrator');
  assert.strictEqual(workflow.turn.command, 'task-orchestrator:dispatch');

  copyFixture(targetDir, 'current-dispatch-code-guardian.json', 'current-dispatch.json');
  report = advance(targetDir);
  assert.strictEqual(report.consumed.kind, 'expert-dispatch');
  assert.strictEqual(report.recorded.dispatch.role, 'code-guardian');
  assert.deepStrictEqual(report.next_expected.files, ['.ai-spec/tmp/current-execution.json']);

  workflow = step(targetDir);
  assert.strictEqual(workflow.turn.mode, 'execute');
  assert.strictEqual(workflow.turn.actor.id, 'code-guardian');
  assert.strictEqual(workflow.turn.command, 'code-guardian');
  assert.deepStrictEqual(listTurnTargets(workflow.turn), [
    '.ai-spec/tmp/current-execution.json',
    'openspec/changes/runtime-smoke-demo/checklist.md',
    'openspec/changes/runtime-smoke-demo/iterations.md',
  ]);

  writeProjectFile(targetDir, 'openspec/changes/runtime-smoke-demo/checklist.md', '# checklist');
  writeProjectFile(targetDir, 'openspec/changes/runtime-smoke-demo/iterations.md', '# iterations');
  copyFixture(targetDir, 'current-execution-code-guardian.json', 'current-execution.json');
  report = advance(targetDir);
  assert.strictEqual(report.consumed.kind, 'expert-execution');
  assert.strictEqual(report.recorded.execution.role, 'code-guardian');
  assert.deepStrictEqual(report.next_expected.files, [
    '.ai-spec/tmp/task-orchestrator-reply.md',
    '.ai-spec/tmp/current-runtime-action.json',
  ]);

  workflow = step(targetDir);
  assert.strictEqual(workflow.turn.mode, 'continue');
  assert.strictEqual(workflow.turn.actor.id, 'task-orchestrator');
  assert.strictEqual(workflow.turn.command, '/spec-continue');

  copyFixture(targetDir, 'task-orchestrator-complete-reply.md', 'task-orchestrator-reply.md');
  report = advance(targetDir);
  assert.strictEqual(report.consumed.kind, 'task-orchestrator-reply');
  assert.strictEqual(report.recorded.runtime_action.action, 'complete');
  assert.strictEqual(report.applied.adapter_action, 'complete');
  assert.strictEqual(report.applied.status, 'success');
  assert.strictEqual(report.next_expected.producer, null);
  assert.deepStrictEqual(report.next_expected.files, []);

  workflow = step(targetDir);
  assert.strictEqual(workflow.turn.status, 'terminal');
  assert.strictEqual(workflow.turn.actor, null);
  assert.strictEqual(workflow.turn.command, null);

  const currentRunPath = path.join(targetDir, '.ai-spec', 'current-run.json');
  assert.ok(fs.existsSync(currentRunPath), 'expected current-run.json to exist after replay');

  const currentRun = JSON.parse(fs.readFileSync(currentRunPath, 'utf8'));
  assert.strictEqual(currentRun.run_id, 'run_20260331_160700_smoke');
  assert.strictEqual(currentRun.status, 'success');
  assert.strictEqual(currentRun.current_role, 'code-guardian');
  assert.strictEqual(currentRun.events.length, 4);

  const runnerStatus = status(targetDir);
  assert.strictEqual(runnerStatus.kind, 'task-orchestrator-runner-status');
  assert.strictEqual(runnerStatus.current.run_status, 'success');
  assert.strictEqual(runnerStatus.pending_inputs.length, 0);
  assert.strictEqual(runnerStatus.next_expected.producer, null);

  const consumedDir = path.join(targetDir, '.ai-spec', 'runner', 'consumed');
  const consumedFiles = fs.readdirSync(consumedDir);
  assert.strictEqual(consumedFiles.length, 10);

  console.log('task-orchestrator runner test passed: AI protocol flow reaches code delivery terminal success');
}

main();
