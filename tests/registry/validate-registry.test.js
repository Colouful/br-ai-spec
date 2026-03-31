const assert = require('assert');
const path = require('path');
const { spawnSync } = require('child_process');

const repoRoot = path.join(__dirname, '..', '..');
const validCases = [
  {
    name: 'valid-minimal',
    fixtureDir: path.join(__dirname, 'fixtures', 'valid-minimal'),
    expectedSummary: {
      rule_count: 1,
      skill_count: 1,
      role_count: 1,
      flow_count: 1,
      scenario_package_count: 1,
    },
  },
];

const invalidCases = [
  {
    name: 'invalid-scenario-missing-role',
    fixtureDir: path.join(__dirname, 'fixtures', 'invalid-scenario-missing-role'),
    expectedError: 'references unknown role: missing-role',
  },
  {
    name: 'invalid-missing-source',
    fixtureDir: path.join(__dirname, 'fixtures', 'invalid-missing-source'),
    expectedError: 'references missing source: .agents/rules/common/missing-source-rule.md',
  },
  {
    name: 'invalid-missing-support-file',
    fixtureDir: path.join(__dirname, 'fixtures', 'invalid-missing-support-file'),
    expectedError: 'roles.json support file is missing: .agents/roles/common/missing-support-file.md',
  },
  {
    name: 'invalid-domains-type',
    fixtureDir: path.join(__dirname, 'fixtures', 'invalid-domains-type'),
    expectedError: 'rules.json entry "demo-rule" domains must be an array',
  },
];

function run(args) {
  return spawnSync('node', ['./bin/cli.js', ...args], {
    cwd: repoRoot,
    encoding: 'utf8',
  });
}

function runInvalidCase(testCase) {
  const result = run(['validate-registry', '--source', testCase.fixtureDir, '--json']);

  assert.strictEqual(
    result.status,
    1,
    `expected validate-registry to fail for ${testCase.name}, got ${result.status}\nstderr:\n${result.stderr}`
  );

  assert.ok(result.stdout.trim(), 'expected validate-registry to print JSON output');

  const report = JSON.parse(result.stdout);
  assert.strictEqual(report.kind, 'registry-validation-result');
  assert.strictEqual(report.status, 'failed');
  assert.ok(
    report.errors.some((item) => item.includes(testCase.expectedError)),
    `expected "${testCase.expectedError}" for ${testCase.name}, got:\n${report.errors.join('\n')}`
  );
}

function runValidCase(testCase) {
  const result = run(['validate-registry', '--source', testCase.fixtureDir, '--json']);

  assert.strictEqual(
    result.status,
    0,
    `expected validate-registry to pass for ${testCase.name}, got ${result.status}\nstderr:\n${result.stderr}`
  );

  assert.ok(result.stdout.trim(), 'expected validate-registry to print JSON output');

  const report = JSON.parse(result.stdout);
  assert.strictEqual(report.kind, 'registry-validation-result');
  assert.strictEqual(report.status, 'success');
  assert.deepStrictEqual(report.errors, []);
  assert.deepStrictEqual(report.summary, testCase.expectedSummary);
}

function main() {
  for (const testCase of validCases) {
    runValidCase(testCase);
  }

  for (const testCase of invalidCases) {
    runInvalidCase(testCase);
  }

  console.log(
    `registry test passed: ${validCases.length} valid fixture(s) and ${invalidCases.length} invalid fixture(s) behave as expected`
  );
}

main();
