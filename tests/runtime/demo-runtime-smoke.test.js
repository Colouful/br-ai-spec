const assert = require('assert');
const fs = require('fs');
const os = require('os');
const path = require('path');
const demo = require('../../bin/demo-runtime-smoke');

function main() {
  const targetDir = fs.mkdtempSync(path.join(os.tmpdir(), 'br-ai-spec-demo-runtime-'));
  const result = demo.runDemoRuntimeSmoke({
    target: targetDir,
    userInput: '新增一个商品 mock 页面',
    runId: 'run_20260408_100000_demo',
  });

  assert.strictEqual(result.kind, 'demo-runtime-smoke-result');
  assert.strictEqual(result.current_run.status, 'success');
  assert.strictEqual(result.turns.start.actor, 'task-orchestrator');
  assert.strictEqual(result.turns.requirement_analyst.actor, 'requirement-analyst');
  assert.strictEqual(result.turns.frontend_implementer.actor, 'frontend-implementer');
  assert.strictEqual(result.turns.code_guardian.actor, 'code-guardian');
  assert.strictEqual(result.turns.terminal.status, 'terminal');

  const requiredOutputs = [
    '.ai-spec/current-run.json',
    'openspec/config.yaml',
    'openspec/schemas/expert-delivery/schema.yaml',
    'openspec/changes/runtime-smoke-demo/proposal.md',
    'openspec/changes/runtime-smoke-demo/tasks.md',
    'openspec/changes/runtime-smoke-demo/checklist.md',
    'openspec/changes/runtime-smoke-demo/iterations.md',
    'src/views/products/mock/index.vue',
    'src/router/modules/products.ts',
    'src/mock/products.ts',
  ];

  for (const relPath of requiredOutputs) {
    assert.ok(fs.existsSync(path.join(targetDir, relPath)), `expected output file: ${relPath}`);
  }

  const currentRun = JSON.parse(fs.readFileSync(path.join(targetDir, '.ai-spec', 'current-run.json'), 'utf8'));
  assert.strictEqual(currentRun.status, 'success');
  assert.strictEqual(currentRun.run_id, 'run_20260408_100000_demo');
  assert.strictEqual(currentRun.task.change_id, 'runtime-smoke-demo');

  console.log('demo runtime smoke test passed: minimal expert-delivery example reaches success');
}

main();
