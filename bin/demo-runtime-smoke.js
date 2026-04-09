#!/usr/bin/env node
const fs = require('fs');
const path = require('path');
const protocolWorkflow = require('../internal/ai-protocol-workflow');
const { archiveChange } = require('./archive-change');
const runner = require('./task-orchestrator-runner');

const pkgRoot = path.join(__dirname, '..');
const defaultTarget = path.join(process.cwd(), '.tmp', 'runtime-smoke-demo');

function parseArgs(argv) {
  const args = [...argv];
  const options = {
    target: defaultTarget,
    userInput: '新增一个商品 mock 页面',
    json: false,
    pretty: true,
  };

  while (args.length > 0) {
    const arg = args.shift();

    if (!arg.startsWith('-') && options.target === defaultTarget) {
      options.target = arg;
      continue;
    }

    switch (arg) {
      case '--target':
        options.target = args.shift();
        break;
      case '--user-input':
        options.userInput = args.shift();
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

  return options;
}

function printUsage() {
  console.log(`Usage:
  ai-spec demo-runtime-smoke [target] [options]

Options:
  --target <dir>         Demo target directory (default: ./.tmp/runtime-smoke-demo)
  --user-input <text>    Demo requirement text
  --json                 Print JSON only
  --pretty               Print readable summary (default)
  --help                 Show this help
`);
}

function ensureEmptyTarget(targetDir) {
  if (!fs.existsSync(targetDir)) {
    fs.mkdirSync(targetDir, { recursive: true });
    return;
  }

  const entries = fs.readdirSync(targetDir);
  if (entries.length > 0) {
    throw new Error(`Demo target is not empty: ${targetDir}`);
  }
}

function ensureDir(dirPath) {
  fs.mkdirSync(dirPath, { recursive: true });
}

function writeFile(targetDir, relPath, content) {
  const filePath = path.join(targetDir, relPath);
  ensureDir(path.dirname(filePath));
  fs.writeFileSync(filePath, content.endsWith('\n') ? content : `${content}\n`, 'utf8');
}

function writeJson(targetDir, relPath, value) {
  writeFile(targetDir, relPath, `${JSON.stringify(value, null, 2)}\n`);
}

function copyDirRecursive(sourceDir, targetDir) {
  ensureDir(targetDir);
  for (const entry of fs.readdirSync(sourceDir, { withFileTypes: true })) {
    const sourcePath = path.join(sourceDir, entry.name);
    const targetPath = path.join(targetDir, entry.name);
    if (entry.isDirectory()) {
      copyDirRecursive(sourcePath, targetPath);
      continue;
    }
    ensureDir(path.dirname(targetPath));
    fs.copyFileSync(sourcePath, targetPath);
  }
}

function buildRunId() {
  const now = new Date();
  const pad = (value) => String(value).padStart(2, '0');
  return [
    'run',
    `${now.getFullYear()}${pad(now.getMonth() + 1)}${pad(now.getDate())}`,
    `${pad(now.getHours())}${pad(now.getMinutes())}${pad(now.getSeconds())}`,
    'demo',
  ].join('_');
}

function scaffoldDemoTarget(targetDir) {
  ensureEmptyTarget(targetDir);

  writeFile(targetDir, 'package.json', JSON.stringify({
    name: 'runtime-smoke-demo',
    private: true,
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
  writeFile(targetDir, 'pnpm-lock.yaml', 'lockfileVersion: 9.0');
  writeFile(targetDir, 'src/router/index.ts', [
    'export const routes = [];',
    'export const router = { routes };',
  ].join('\n'));
  writeFile(targetDir, 'src/router/modules/demo.ts', 'export default [];');
  writeFile(targetDir, 'src/views/demo/index.vue', '<template><div>demo entry</div></template>');
  writeFile(targetDir, 'src/api/order.ts', 'export function getOrderListApi() { return []; }');
  writeFile(targetDir, 'src/api/types/order.ts', 'export interface Order { id: string; }');
  writeFile(targetDir, 'src/mock/order.ts', 'export const orderMock = [];');
  writeFile(targetDir, 'src/store/modules/demo/index.ts', 'export const useDemoStore = () => ({})');
  writeFile(targetDir, 'src/styles/variables.scss', ':root {}');
  writeFile(targetDir, 'context/PROJECT.md', [
    '# PROJECT',
    '',
    '- Framework: Vue 3',
    '- Language: TypeScript',
    '- Goal: runtime smoke demo for expert-delivery flow',
  ].join('\n'));

  const configTemplate = path.join(pkgRoot, 'openspec', 'config.yaml.template');
  writeFile(targetDir, path.join('openspec', 'config.yaml'), fs.readFileSync(configTemplate, 'utf8'));

  const schemaSource = path.join(pkgRoot, 'openspec', 'schemas', 'expert-delivery');
  const schemaTarget = path.join(targetDir, 'openspec', 'schemas', 'expert-delivery');
  copyDirRecursive(schemaSource, schemaTarget);
}

function createBootstrapPayload(runId, userInput, changeId) {
  return {
    schema_version: 1,
    kind: 'task-orchestrator-bootstrap',
    run_plan: {
      schema_version: 1,
      kind: 'run-plan',
      run_id: runId,
      status: 'planned',
      task: {
        type: 'page-development',
        raw_input: userInput,
        input_kind: 'natural-language',
        risk_level: 'low',
      },
      flow: {
        id: 'prd-to-delivery',
        name: '需求到交付',
        source: 'runtime-smoke-demo',
      },
      artifacts: [
        `openspec/changes/${changeId}/proposal.md`,
        `openspec/changes/${changeId}/specs/`,
        `openspec/changes/${changeId}/design.md`,
        `openspec/changes/${changeId}/tasks.md`,
        'code',
        `openspec/changes/${changeId}/checklist.md`,
        `openspec/changes/${changeId}/iterations.md`,
      ],
      plan: {
        required_roles: [
          'requirement-analyst',
          'frontend-implementer',
          'code-guardian',
        ],
        activated_optional_roles: [],
        skipped_optional_roles: [],
        first_handoff: 'requirement-analyst',
        approval_gates: ['before-implementation', 'before-archive'],
      },
      missing_inputs: [
        '组件目录位置未明确，采用最小 mock 页面默认结构',
      ],
      warnings: [],
      errors: [],
      next_action: '先交给 requirement-analyst 收敛任务',
    },
    task_anchor: {
      schema_version: 1,
      kind: 'task-anchor',
      run_id: runId,
      task: {
        raw_goal: userInput,
        change_id: changeId,
        input_kind: 'natural-language',
      },
      stage: {
        flow_id: 'prd-to-delivery',
        current_role: 'requirement-analyst',
        next_role: 'frontend-implementer',
      },
      constraints: {
        rules: ['component-standard'],
        must_not: ['不要跳过规则检查'],
      },
      artifacts: {
        proposal: `openspec/changes/${changeId}/proposal.md`,
        specs: `openspec/changes/${changeId}/specs/`,
        design: `openspec/changes/${changeId}/design.md`,
        tasks: `openspec/changes/${changeId}/tasks.md`,
      },
      expected_output: [
        '补齐 proposal',
        '输出 specs',
        '输出 design',
        '输出 tasks',
        '列出缺失输入',
      ],
    },
  };
}

function createExecutionPayload(runId, roleId, roleName, executionSteps) {
  return {
    schema_version: 1,
    kind: 'expert-execution',
    run_id: runId,
    status: 'completed',
    role: {
      id: roleId,
      name: roleName,
    },
    flow: {
      id: 'prd-to-delivery',
    },
    execution_plan: {
      execution_steps: executionSteps,
    },
    markdown: `# ${roleId} execution`,
  };
}

function writeRequirementArtifacts(targetDir, changeId) {
  writeFile(targetDir, `openspec/changes/${changeId}/proposal.md`, [
    `# 变更提案：${changeId}`,
    '',
    '## 目标',
    '- 新增一个商品 mock 页面，用于验证 expert-delivery 主链可运行。',
    '',
    '## 范围',
    '- 新增商品 mock 页面。',
    '- 新增最小路由模块。',
    '- 新增最小 mock 数据。',
    '',
    '## 非目标',
    '- 不接真实 API。',
    '- 不引入复杂状态管理。',
    '',
    '## 风险',
    '- 当前演示为确定性 replay，不代表真实 AI IDE 全自动执行。',
  ].join('\n'));

  writeFile(targetDir, `openspec/changes/${changeId}/specs/ui/spec.md`, [
    '## 新增需求',
    '',
    '### 需求：商品 mock 页面',
    '',
    '系统必须提供一个商品 mock 页面，用于验证 expert-delivery 主链可运行。',
    '',
    '#### 场景：进入商品 mock 页面',
    '',
    '- **已知** 当前场景只使用本地 mock 数据',
    '- **当** 用户进入商品 mock 页面',
    '- **则** 页面展示本地商品列表，不请求真实接口',
  ].join('\n'));

  writeFile(targetDir, `openspec/changes/${changeId}/specs/api/spec.md`, [
    '## 新增需求',
    '',
    '### 需求：演示接口约束',
    '',
    '系统必须明确当前示例只消费本地 mock 数据，不发起真实商品接口请求。',
    '',
    '#### 场景：页面初始化',
    '',
    '- **已知** 当前为 runtime smoke 演示',
    '- **当** 页面初始化',
    '- **则** 只读取本地 mock 模块，不调用远程 API',
  ].join('\n'));

  writeFile(targetDir, `openspec/changes/${changeId}/design.md`, [
    '# 技术设计',
    '',
    '## 实现落点',
    '- 页面落在 `src/views/products/mock/index.vue`',
    '- 路由落在 `src/router/modules/products.ts`',
    '- mock 数据落在 `src/mock/products.ts`',
    '',
    '## 约束',
    '- 当前示例只验证 runtime 主链，不接真实 API',
    '- 继续复用现有 Vue 目录和路由约定',
  ].join('\n'));

  writeFile(targetDir, `openspec/changes/${changeId}/tasks.md`, [
    '# 实施任务',
    '',
    '- [ ] 创建商品 mock 页面与最小组件结构',
    '- [ ] 补齐路由模块并保留懒加载约定',
    '- [ ] 落最小 mock 数据文件',
    '- [ ] 产出 checklist 和 iterations 完成交付闭环',
  ].join('\n'));
}

function writeImplementationArtifacts(targetDir) {
  writeFile(targetDir, 'src/views/products/mock/index.vue', [
    '<template>',
    '  <section class="product-mock-page">',
    '    <h1>商品 Mock 页面</h1>',
    '    <ul>',
    '      <li v-for="item in productMock" :key="item.id">',
    '        <strong>{{ item.name }}</strong>',
    '        <span>{{ item.price }}</span>',
    '      </li>',
    '    </ul>',
    '  </section>',
    '</template>',
    '',
    '<script setup lang="ts">',
    "import { productMock } from '../../../mock/products';",
    '</script>',
    '',
    '<style scoped>',
    '.product-mock-page {',
    '  padding: 24px;',
    '}',
    '',
    '.product-mock-page ul {',
    '  display: grid;',
    '  gap: 12px;',
    '  list-style: none;',
    '  padding: 0;',
    '}',
    '</style>',
  ].join('\n'));

  writeFile(targetDir, 'src/router/modules/products.ts', [
    'export default [',
    '  {',
    "    path: '/products/mock',",
    "    name: 'ProductsMock',",
    "    component: () => import('../../views/products/mock/index.vue'),",
    '  },',
    '];',
  ].join('\n'));

  writeFile(targetDir, 'src/mock/products.ts', [
    'export const productMock = [',
    "  { id: 'p-001', name: '演示商品 A', price: '99.00' },",
    "  { id: 'p-002', name: '演示商品 B', price: '129.00' },",
    '];',
  ].join('\n'));
}

function writeGuardianArtifacts(targetDir, changeId) {
  writeFile(targetDir, `openspec/changes/${changeId}/checklist.md`, [
    '# 检查清单',
    '',
    '- [x] proposal.md 已存在',
    '- [x] tasks.md 已存在',
    '- [x] 页面与路由已落盘',
    '- [x] mock 数据已落盘',
    '- [x] 当前示例达到 runtime smoke 演示目标',
  ].join('\n'));

  writeFile(targetDir, `openspec/changes/${changeId}/iterations.md`, [
    '# 迭代记录',
    '',
    '## 当前结论',
    '- 当前为确定性最小示例，主链已闭环。',
    '',
    '## 后续可扩展',
    '- 接入真实 AI IDE 轮次。',
    '- 接入真实业务 API 与页面样式。',
    '- 增加审批门禁与更真实的 verify 证据。',
  ].join('\n'));
}

function writeBootstrapTurn(targetDir, payload) {
  writeJson(targetDir, '.ai-spec/internal/tmp/task-orchestrator-turn.json', payload);
}

function writeExecutionInbox(targetDir, payload) {
  writeJson(targetDir, '.ai-spec/internal/tmp/current-execution.json', payload);
}

function runDemoRuntimeSmoke(options = {}) {
  const targetDir = path.resolve(options.target || defaultTarget);
  const userInput = options.userInput || '新增一个商品 mock 页面';
  const runId = options.runId || buildRunId();
  const changeId = options.changeId || 'runtime-smoke-demo';

  scaffoldDemoTarget(targetDir);

  const start = protocolWorkflow.advanceProtocolStep({
    target: targetDir,
    userInput,
  });

  writeBootstrapTurn(targetDir, createBootstrapPayload(runId, userInput, changeId));
  const afterBootstrap = runner.advanceRunner({ target: targetDir });

  const requirementTurn = protocolWorkflow.advanceProtocolStep({ target: targetDir });
  writeRequirementArtifacts(targetDir, changeId);
  writeExecutionInbox(targetDir, createExecutionPayload(
    runId,
    'requirement-analyst',
    '需求解析专家',
    ['补齐 proposal', '输出 spec', '输出 tasks'],
  ));
  const afterRequirement = runner.advanceRunner({ target: targetDir });

  const implementationTurn = protocolWorkflow.advanceProtocolStep({ target: targetDir });
  writeImplementationArtifacts(targetDir);
  writeExecutionInbox(targetDir, createExecutionPayload(
    runId,
    'frontend-implementer',
    '前端实现专家',
    ['完成最小页面实现', '补齐路由与 mock 数据'],
  ));
  const afterImplementation = runner.advanceRunner({ target: targetDir });

  const guardianTurn = protocolWorkflow.advanceProtocolStep({ target: targetDir });
  writeGuardianArtifacts(targetDir, changeId);
  writeExecutionInbox(targetDir, createExecutionPayload(
    runId,
    'code-guardian',
    '规范守护者',
    ['检查范围与产物', '输出 checklist 与 iterations', '等待归档确认'],
  ));
  const afterGuardian = runner.advanceRunner({ target: targetDir });

  const archiveGate = protocolWorkflow.advanceProtocolStep({ target: targetDir });
  writeJson(targetDir, '.ai-spec/internal/tmp/current-runtime-action.json', {
    schema_version: 1,
    kind: 'task-orchestrator-runtime-action',
    action: 'approve',
    gate: 'before-archive',
    to_role: 'archive-change',
    message: 'demo archive approved',
  });
  const afterArchiveApproval = runner.advanceRunner({ target: targetDir });

  const archiveTurn = protocolWorkflow.advanceProtocolStep({ target: targetDir });
  const afterArchive = archiveChange({
    target: targetDir,
    changeId,
    completeRun: true,
  });

  const terminal = protocolWorkflow.advanceProtocolStep({ target: targetDir });
  const currentRun = JSON.parse(fs.readFileSync(path.join(targetDir, '.ai-spec', 'current-run.json'), 'utf8'));

  return {
    kind: 'demo-runtime-smoke-result',
    target: targetDir,
    user_input: userInput,
    run_id: runId,
    change_id: changeId,
    turns: {
      start: {
        actor: start.turn.actor?.id || null,
        command: start.turn.command || null,
        mode: start.turn.mode || null,
      },
      requirement_analyst: {
        actor: requirementTurn.turn.actor?.id || null,
        command: requirementTurn.turn.command || null,
      },
      frontend_implementer: {
        actor: implementationTurn.turn.actor?.id || null,
        command: implementationTurn.turn.command || null,
      },
      code_guardian: {
        actor: guardianTurn.turn.actor?.id || null,
        command: guardianTurn.turn.command || null,
      },
      archive_gate: {
        status: archiveGate.turn.status || null,
        gate: archiveGate.turn.guidance?.approval_gate?.gate || null,
      },
      archive_change: {
        actor: archiveTurn.turn.actor?.id || null,
        command: archiveTurn.turn.command || null,
      },
      terminal: {
        status: terminal.turn.status || null,
        actor: terminal.turn.actor?.id || null,
      },
    },
    applied: {
      bootstrap: afterBootstrap.applied.adapter_action,
      requirement: afterRequirement.applied.adapter_action,
      implementation: afterImplementation.applied.adapter_action,
      guardian: afterGuardian.applied.adapter_action,
      archive_approval: afterArchiveApproval.applied.adapter_action,
      archive: afterArchive.runtime_transition?.state?.status || afterArchive.status,
    },
    current_run: {
      status: currentRun.status,
      current_role: currentRun.current_role,
      events: Array.isArray(currentRun.events) ? currentRun.events.length : 0,
      artifacts: currentRun.artifacts || null,
    },
    outputs: [
      '.ai-spec/current-run.json',
      'openspec/specs/ui/spec.md',
      'openspec/specs/api/spec.md',
      'src/views/products/mock/index.vue',
      'src/router/modules/products.ts',
      'src/mock/products.ts',
    ],
    note: 'This demo replays deterministic expert outputs to verify the current expert-delivery runtime chain.',
  };
}

function printPretty(result) {
  console.log('runtime smoke demo completed');
  console.log(`target: ${result.target}`);
  console.log(`run_id: ${result.run_id}`);
  console.log(`change_id: ${result.change_id}`);
  console.log(`current_run.status: ${result.current_run.status}`);
  console.log(`current_run.events: ${result.current_run.events}`);
  console.log('outputs:');
  for (const item of result.outputs) {
    console.log(`  - ${item}`);
  }
  console.log('note:');
  console.log(`  ${result.note}`);
}

function main(argv = process.argv.slice(2)) {
  try {
    const options = parseArgs(argv);
    if (options.help) {
      printUsage();
      return 0;
    }

    const result = runDemoRuntimeSmoke(options);
    if (options.json) {
      process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
    } else {
      printPretty(result);
    }
    return 0;
  } catch (error) {
    console.error(error.message || error);
    return 1;
  }
}

module.exports = {
  runDemoRuntimeSmoke,
  main,
};

if (require.main === module) {
  process.exit(main());
}
