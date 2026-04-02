const fs = require('fs');
const path = require('path');
const runner = require('../bin/task-orchestrator-runner');
const {
  inferDeliveryProfile,
  inferArtifactProfile,
  inferComplexity,
  recordRunInputUpdate,
} = require('../bin/runtime-state');
const {
  resolveRuntimePaths,
  getExistingPath,
  getExistingRelPath,
} = require('../bin/runtime-paths');
const PACKAGE_ROOT = path.resolve(__dirname, '..');

const START_INSTRUCTION_FILES = [
  '.agents/commands/common/spec-start.md',
  '.agents/roles/common/task-orchestrator.md',
  '.agents/roles/common/task-orchestrator-run-plan-template.md',
  '.agents/roles/common/task-anchor-spec.md',
  '.agents/roles/common/task-orchestrator-bootstrap-payload.md',
  '.agents/roles/common/task-orchestrator-output-extractor-spec.md',
];

const CONTINUE_INSTRUCTION_FILES = [
  '.agents/commands/common/spec-continue.md',
  '.agents/roles/common/task-orchestrator.md',
  '.agents/roles/common/task-orchestrator-adapter-payload.md',
  '.agents/roles/common/task-orchestrator-output-extractor-spec.md',
  '.agents/roles/common/task-orchestrator-runtime-hooks.md',
];

const DISPATCH_INSTRUCTION_FILES = [
  '.agents/roles/common/task-orchestrator.md',
  '.agents/roles/common/expert-dispatch-spec.md',
];

const ROLE_RULE_HINTS = {
  'requirement-analyst': [
    '.agents/rules/01-项目概述.md',
    '.agents/rules/03-项目结构.md',
    '.agents/rules/05-API规范.md',
    '.agents/rules/06-路由规范.md',
    '.agents/rules/09-样式规范.md',
  ],
  'frontend-implementer': [
    '.agents/rules/03-项目结构.md',
    '.agents/rules/04-组件规范.md',
    '.agents/rules/06-路由规范.md',
    '.agents/rules/09-样式规范.md',
    '.agents/rules/11-测试规范.md',
  ],
  'code-guardian': [
    '.agents/rules/02-编码规范.md',
    '.agents/rules/09-样式规范.md',
    '.agents/rules/11-测试规范.md',
    '.agents/rules/13-代码格式化与检查.md',
    '.agents/rules/14-审计汇报规范.md',
  ],
};

const ROLE_OPENSPEC_RULE_SECTIONS = {
  'requirement-analyst': ['proposal', 'tasks'],
  'frontend-implementer': ['tasks', 'design'],
  'code-guardian': ['tasks', 'specs'],
};

const MICRO_ROLE_EXTRAS = {
  'requirement-analyst': {
    goal: '用短版 proposal.md 和 tasks.md 收敛需求，不写实现代码。',
    must_do: [
      'proposal.md 只保留目标、范围、默认假设、风险四块',
      'tasks.md 保持 3-5 条可执行任务，覆盖实现与验收',
    ],
    must_not: [
      '不要把微型任务写成长篇方案说明',
    ],
  },
  'frontend-implementer': {
    goal: '基于短版 proposal/tasks 做最小必要实现，优先复用现有结构。',
    must_do: [
      '保持改动最小化，优先就地复用现有页面、组件、样式变量和 mock 约定',
      '实现说明只保留当前变更、验证结果和残留风险',
    ],
    must_not: [
      '不要为了“看起来完整”而扩展无关范围',
    ],
  },
  'code-guardian': {
    goal: '用短版 checklist.md 和 iterations.md 完成交付守护，明确阻断项。',
    must_do: [
      'checklist.md 使用最小核查清单，直接给出通过/不通过',
      'iterations.md 只记录问题、修正动作和残留风险',
    ],
    must_not: [
      '不要输出泛泛而谈的长篇审查结论',
    ],
  },
};

const MICRO_OPENSPEC_RULES = {
  proposal: [
    '短版 proposal 只保留目标、范围、默认假设、风险/待确认四块。',
    '若为页面或组件任务，明确落点路径或目录，不写长篇背景说明。',
    '若为 mock 任务，显式说明不接真实 API。'
  ],
  tasks: [
    '短版 tasks 保持 3-5 条可执行任务，覆盖实现与最小验收。',
    '每条任务都要可落盘、可验证，避免空标题。',
    '保持改动最小化，聚焦本次请求。'
  ],
  design: [
    '只保留当前实现真正需要的结构与样式约束。',
    '继续使用主题变量和既有目录结构。'
  ],
  specs: [
    '只记录关键检查项、阻断项和最终结论。',
    '保留可测试的验收结论，不展开长篇复盘。'
  ],
};

const ROLE_GUIDANCE = {
  'requirement-analyst': {
    goal: '把需求收敛成可执行的 proposal.md 和 tasks.md，不写实现代码。',
    must_do: [
      '先明确目标、范围、非目标、关键假设和风险',
      'proposal.md 需要能支撑后续实现和验收',
      'tasks.md 必须是可执行任务清单，而不是空标题模板',
    ],
    must_not: [
      '不要直接开始写 Vue/TS/CSS 代码',
      '不要在 proposal.md 和 tasks.md 未落盘前宣称本阶段完成',
    ],
  },
  'frontend-implementer': {
    goal: '基于 proposal.md 和 tasks.md 完成当前范围内的前端实现。',
    must_do: [
      '先读 proposal.md 和 tasks.md 再改代码',
      '严格在当前变更范围内实现，不顺手扩 scope',
      '实现完成后写 expert-execution 回执并等待下一轮编排',
    ],
    must_not: [
      '不要重新定义需求边界',
      '不要跳过实现验证直接宣称交付完成',
    ],
  },
  'code-guardian': {
    goal: '基于 proposal、tasks 和实现结果做交付前检查，产出 checklist.md 和 iterations.md。',
    must_do: [
      '明确区分阻断项和非阻断项',
      'checklist.md 记录检查项和结论',
      'iterations.md 记录问题、修正动作和残留风险',
    ],
    must_not: [
      '不要在 checklist.md 和 iterations.md 未落盘前给 complete 结论',
      '不要把明显问题写成模糊建议',
    ],
  },
};

const SKILL_GUIDANCE = {
  'create-proposal': '用于快速形成 proposal/tasks 的结构和变更说明。',
  'design-analysis': '用于整理页面结构、信息层级和交互要点。',
  'create-view': '用于创建或调整 Vue 页面文件与页面目录结构。',
  'create-component': '用于拆分和实现 Vue 组件。',
  'create-route': '用于新增或调整页面路由。',
  'create-api': '用于创建接口定义与请求封装。',
  'create-store': '用于新增或调整全局状态。',
  'theme-variables': '用于处理主题变量与样式约束。',
  'execute-task': '用于按任务清单逐项推进实现。',
  'create-test': '用于补充测试文件或测试建议。',
  'ui-verification': '用于 UI 验收与页面核查。',
  'web-design-guidelines': '用于规则和体验审查。',
};

function resolveTargetDir(target) {
  return path.resolve(process.cwd(), target || '.');
}

function readJsonIfExists(filePath) {
  if (!fs.existsSync(filePath)) {
    return null;
  }
  return JSON.parse(fs.readFileSync(filePath, 'utf8'));
}

function buildFileTarget(targetDir, relPath, options = {}) {
  const absolutePath = path.join(targetDir, relPath);
  const exists = fs.existsSync(absolutePath);
  const isDirectory = relPath.endsWith('/') || (exists && fs.statSync(absolutePath).isDirectory());

  return {
    kind: isDirectory ? 'directory' : 'file',
    path: absolutePath,
    rel_path: relPath,
    exists,
    required: Boolean(options.required),
    label: options.label || null,
  };
}

function buildReadableTarget(targetDir, relPath, options = {}) {
  const targetPath = path.join(targetDir, relPath);
  if (fs.existsSync(targetPath)) {
    return {
      ...buildFileTarget(targetDir, relPath, options),
      origin: 'target',
    };
  }

  const packagePath = path.join(PACKAGE_ROOT, relPath);
  if (fs.existsSync(packagePath)) {
    const isDirectory = relPath.endsWith('/') || fs.statSync(packagePath).isDirectory();
    return {
      kind: isDirectory ? 'directory' : 'file',
      path: packagePath,
      rel_path: relPath,
      exists: true,
      required: Boolean(options.required),
      label: options.label || null,
      origin: 'package',
    };
  }

  return {
    ...buildFileTarget(targetDir, relPath, options),
    origin: 'target',
  };
}

function buildSymbolicTarget(value, options = {}) {
  return {
    kind: 'symbolic',
    value,
    required: Boolean(options.required),
    label: options.label || null,
  };
}

function dedupeTargets(targets) {
  const seen = new Set();
  const result = [];

  for (const item of targets) {
    const key = item.kind === 'symbolic'
      ? `symbolic:${item.value}`
      : `${item.kind}:${item.rel_path}`;
    if (seen.has(key)) {
      continue;
    }
    seen.add(key);
    result.push(item);
  }

  return result;
}

function parseScalar(value) {
  const trimmed = value.trim();
  if (trimmed === '') {
    return '';
  }
  if (trimmed === '[]') {
    return [];
  }
  if (
    (trimmed.startsWith('"') && trimmed.endsWith('"')) ||
    (trimmed.startsWith("'") && trimmed.endsWith("'"))
  ) {
    return trimmed.slice(1, -1);
  }
  return trimmed;
}

function parseFrontmatter(fileContent) {
  const lines = fileContent.split('\n');
  if (lines[0] !== '---') {
    return {};
  }

  const endIndex = lines.indexOf('---', 1);
  if (endIndex === -1) {
    return {};
  }

  const frontmatterLines = lines.slice(1, endIndex);
  const data = {};
  let currentKey = null;

  for (const line of frontmatterLines) {
    const listMatch = line.match(/^\s*-\s+(.*)$/);
    if (listMatch && currentKey) {
      if (!Array.isArray(data[currentKey])) {
        data[currentKey] = [];
      }
      data[currentKey].push(parseScalar(listMatch[1]));
      continue;
    }

    const keyMatch = line.match(/^([A-Za-z0-9_-]+):\s*(.*)$/);
    if (!keyMatch) {
      currentKey = null;
      continue;
    }

    const [, key, rawValue] = keyMatch;
    if (rawValue.trim() === '') {
      data[key] = [];
      currentKey = key;
      continue;
    }

    data[key] = parseScalar(rawValue);
    currentKey = null;
  }

  return data;
}

function parseOpenSpecRules(fileContent) {
  const lines = fileContent.split('\n');
  const sections = {};
  let inRules = false;
  let currentSection = null;

  for (const rawLine of lines) {
    const line = rawLine.replace(/\r$/, '');

    if (!inRules) {
      if (line.trim() === 'rules:') {
        inRules = true;
      }
      continue;
    }

    if (/^[A-Za-z0-9_-]+:\s*$/.test(line)) {
      break;
    }

    const sectionMatch = line.match(/^  ([A-Za-z0-9_-]+):\s*$/);
    if (sectionMatch) {
      currentSection = sectionMatch[1];
      sections[currentSection] = [];
      continue;
    }

    const listMatch = line.match(/^    -\s+(.*)$/);
    if (listMatch && currentSection) {
      sections[currentSection].push(parseScalar(listMatch[1]));
      continue;
    }
  }

  return sections;
}

function loadRoleDefinition(targetDir, sourceRelPath) {
  if (!sourceRelPath) {
    return null;
  }

  const sourceTarget = buildReadableTarget(targetDir, sourceRelPath);
  if (!sourceTarget.exists) {
    return null;
  }

  const content = fs.readFileSync(sourceTarget.path, 'utf8');
  const frontmatter = parseFrontmatter(content);

  return {
    id: frontmatter.id || null,
    name: frontmatter.name || null,
    source: sourceRelPath,
    preferred_skills: Array.isArray(frontmatter.preferred_skills) ? frontmatter.preferred_skills : [],
    reads: Array.isArray(frontmatter.reads) ? frontmatter.reads : [],
    writes: Array.isArray(frontmatter.writes) ? frontmatter.writes : [],
    handoff_to: Array.isArray(frontmatter.handoff_to) ? frontmatter.handoff_to : [],
  };
}

function loadOpenSpecRuleSections(targetDir) {
  const candidateTargets = [
    buildReadableTarget(targetDir, 'openspec/config.yaml'),
    buildReadableTarget(targetDir, 'openspec/config.yaml.template'),
  ];

  for (const target of candidateTargets) {
    if (!target.exists) {
      continue;
    }

    const content = fs.readFileSync(target.path, 'utf8');
    return {
      source: target.rel_path,
      sections: parseOpenSpecRules(content),
    };
  }

  return {
    source: null,
    sections: {},
  };
}

function resolveTemplateVariables(value, context) {
  if (typeof value !== 'string') {
    return value;
  }

  return value
    .replace(/<change-id>/g, context.changeId || '__missing_change_id__')
    .replace(/<run-id>/g, context.runId || '__missing_run_id__');
}

function convertTargetSpec(targetDir, rawValue, context, options = {}) {
  const resolvedValue = resolveTemplateVariables(rawValue, context);
  if (resolvedValue === 'code' || resolvedValue === 'implementation-notes') {
    return buildSymbolicTarget(resolvedValue, options);
  }
  return buildFileTarget(targetDir, resolvedValue, options);
}

function buildCommandTargets(targetDir, relPaths) {
  return relPaths.map((relPath) => buildReadableTarget(targetDir, relPath, { required: true }));
}

function loadCurrentArtifacts(targetDir) {
  const runtimePaths = resolveRuntimePaths(targetDir);
  return {
    run: readJsonIfExists(runtimePaths.currentRun.path),
    dispatch: readJsonIfExists(getExistingPath(runtimePaths.currentDispatch)),
    execution: readJsonIfExists(getExistingPath(runtimePaths.currentExecutionJson)),
  };
}

function buildSummary(status, runState = null) {
  return {
    run_id: status.current.run_id || null,
    run_status: status.current.run_status || null,
    current_role: status.current.current_role || null,
    pending_gate: status.current.pending_gate || null,
    next_expected_producer: status.next_expected.producer || null,
    delivery_profile: runState?.delivery_profile || null,
    artifact_profile: runState?.artifact_profile || null,
    complexity: runState?.complexity || runState?.task?.complexity || null,
    pending_input_update: Boolean(runState?.pending_input_update),
    input_update_count: Array.isArray(runState?.input_updates) ? runState.input_updates.length : 0,
  };
}

function shellQuote(value) {
  return `'${String(value || '').replace(/'/g, `'\\''`)}'`;
}

function buildProtocolCommands(userInput = null) {
  const advance = './node_modules/.bin/ai-spec protocol-advance --target . --json';
  const step = userInput
    ? `./node_modules/.bin/ai-spec protocol-step --target . --user-input ${shellQuote(userInput)} --json`
    : './node_modules/.bin/ai-spec protocol-step --target . --json';
  const update = userInput
    ? `./node_modules/.bin/ai-spec protocol-update --target . --user-input ${shellQuote(userInput)} --json`
    : './node_modules/.bin/ai-spec protocol-update --target . --user-input "<补充需求>" --json';

  return {
    step,
    advance,
    update,
  };
}

function attachProtocolContracts(turn, options = {}) {
  const commands = buildProtocolCommands(options.userInput || turn.input?.latest_user_input || turn.input?.user_request || null);
  commands.current = turn.mode === 'start' ? commands.step : commands.advance;
  const requiresAdvance = turn.status === 'ready';

  return {
    ...turn,
    commands,
    requires_advance: requiresAdvance,
    finalize_contract: turn.status === 'ready'
      ? {
          required: true,
          advance_command: commands.advance,
          update_command: commands.update,
          when: '完成当前轮次的所有 writes 后，必须先执行 advance，再对用户汇报',
          user_report: '只输出阶段语义和最终摘要，不回显 scratch JSON',
        }
      : null,
  };
}

function buildSkillGuidance(skills) {
  if (!Array.isArray(skills)) {
    return [];
  }

  return skills
    .filter((item) => item && typeof item === 'object' && item.id)
    .map((item) => ({
      id: item.id,
      guidance: SKILL_GUIDANCE[item.id] || null,
    }));
}

function buildRuleHints(roleId, deliveryProfile) {
  const hints = (ROLE_RULE_HINTS[roleId] || []).map((relPath) => path.basename(relPath));
  if (deliveryProfile === 'micro') {
    return hints.slice(0, 4);
  }
  return hints;
}

function buildOpenSpecGuidance(targetDir, roleId, deliveryProfile) {
  const config = loadOpenSpecRuleSections(targetDir);
  const sectionNames = ROLE_OPENSPEC_RULE_SECTIONS[roleId] || [];
  const artifactProfile = inferArtifactProfile({
    deliveryProfile,
  });

  return {
    source: config.source,
    profile: artifactProfile,
    sections: sectionNames
      .filter((name) => Array.isArray(config.sections[name]) && config.sections[name].length > 0)
      .map((name) => ({
        name,
        profile: artifactProfile,
        source_rule_count: config.sections[name].length,
        rules: deliveryProfile === 'micro'
          ? MICRO_OPENSPEC_RULES[name] || config.sections[name].slice(0, 3)
          : config.sections[name],
      })),
  };
}

function buildRoleGuidance(roleId, deliveryProfile) {
  const base = ROLE_GUIDANCE[roleId];
  if (!base) {
    return null;
  }

  if (deliveryProfile !== 'micro') {
    return {
      ...base,
      delivery_profile: 'standard',
      artifact_profile: 'full',
    };
  }

  const extras = MICRO_ROLE_EXTRAS[roleId] || {};
  return {
    goal: extras.goal || base.goal,
    must_do: [...(base.must_do || []), ...(extras.must_do || [])],
    must_not: [...(base.must_not || []), ...(extras.must_not || [])],
    delivery_profile: 'micro',
    artifact_profile: 'compact',
  };
}

function buildExecutionContract(runtimePaths, dispatch, roleDefinition, writes, deliveryProfile) {
  const artifactWrites = writes
    .filter((item) => item.kind === 'file' && item.rel_path !== runtimePaths.tmpCurrentExecution.relPath)
    .map((item) => item.rel_path);
  const artifactProfile = inferArtifactProfile({
    deliveryProfile,
  });

  const contract = {
    kind: 'expert-execution',
    write_to: runtimePaths.tmpCurrentExecution.relPath,
    delivery_profile: deliveryProfile,
    artifact_profile: artifactProfile,
    required_fields: [
      'kind',
      'run_id',
      'dispatch_id',
      'role.id',
      'status',
      'summary',
      'artifacts',
      'next_action',
    ],
    required_artifacts: artifactWrites,
    next_advance_command: './node_modules/.bin/ai-spec protocol-advance --target . --json',
  };

  if (dispatch.role?.id === 'frontend-implementer') {
    contract.required_fields.push('verification');
  }

  if (dispatch.role?.id === 'requirement-analyst') {
    contract.required_fields.push('assumptions');
  }

  if (Array.isArray(roleDefinition.handoff_to) && roleDefinition.handoff_to.length > 0) {
    contract.default_next_role = roleDefinition.handoff_to[0];
  }

  return contract;
}

function buildExpertExpectedOutput(dispatch, writes, runtimePaths, deliveryProfile = 'standard') {
  const outputs = [];

  if (dispatch.role?.id === 'requirement-analyst') {
    outputs.push(deliveryProfile === 'micro' ? '完成短版 openspec proposal.md' : '完成 openspec proposal.md');
    outputs.push(deliveryProfile === 'micro' ? '完成短版 openspec tasks.md' : '完成 openspec tasks.md');
  } else if (dispatch.role?.id === 'frontend-implementer') {
    outputs.push('完成当前范围内的代码实现');
  } else if (dispatch.role?.id === 'code-guardian') {
    outputs.push(deliveryProfile === 'micro' ? '完成短版 openspec checklist.md' : '完成 openspec checklist.md');
    outputs.push(deliveryProfile === 'micro' ? '完成短版 openspec iterations.md' : '完成 openspec iterations.md');
  }

  const artifactWrites = writes
    .filter((item) => item.kind === 'file' && item.rel_path !== runtimePaths.tmpCurrentExecution.relPath)
    .map((item) => item.rel_path);

  for (const relPath of artifactWrites) {
    outputs.push(`写入 ${relPath}`);
  }

  outputs.push(`写入 ${runtimePaths.tmpCurrentExecution.relPath}`);
  outputs.push('产出合法的 expert-execution JSON 回执');
  outputs.push('完成后立即执行 protocol-advance 推进下一轮');

  return [...new Set(outputs)];
}

function buildActorPresentation(actorId, mode) {
  switch (actorId) {
    case 'task-orchestrator':
      return {
        label: '任务主代理',
        enter: '当前阶段：任务主代理（task-orchestrator）',
        exit: mode === 'start'
          ? '任务主代理已完成首轮编排'
          : '任务主代理已完成当前编排',
      };
    case 'requirement-analyst':
      return {
        label: '需求解析专家',
        enter: '当前阶段：需求解析专家（requirement-analyst）',
        exit: '需求解析专家已完成 proposal 与 tasks',
      };
    case 'frontend-implementer':
      return {
        label: '前端实现专家',
        enter: '当前阶段：前端实现专家（frontend-implementer）',
        exit: '前端实现专家已完成代码实现',
      };
    case 'code-guardian':
      return {
        label: '规范守护专家',
        enter: '当前阶段：规范守护专家（code-guardian）',
        exit: '规范守护专家已完成 checklist 与 iterations',
      };
    case 'runner':
      return {
        label: '运行时推进器',
        enter: '当前阶段：运行时推进器（runner）',
        exit: '运行时推进器已完成当前态消费',
      };
    default:
      return {
        label: actorId || null,
        enter: actorId ? `当前阶段：${actorId}` : null,
        exit: actorId ? `${actorId} 已完成当前轮次` : null,
      };
  }
}

function attachActorPresentation(turn) {
  if (!turn.actor?.id) {
    return turn;
  }

  const presentation = buildActorPresentation(turn.actor.id, turn.mode);
  return {
    ...turn,
    actor: {
      ...turn.actor,
      label: turn.actor.label || presentation.label,
    },
    announcements: {
      enter: presentation.enter,
      exit: presentation.exit,
    },
  };
}

function buildStartTurn(targetDir, userInput) {
  const runtimePaths = resolveRuntimePaths(targetDir);
  const deliveryProfile = inferDeliveryProfile({
    rawInput: userInput,
    taskType: null,
    riskLevel: 'low',
    flowId: 'prd-to-delivery',
  });
  const artifactProfile = inferArtifactProfile({
    deliveryProfile,
  });
  const complexity = inferComplexity({
    deliveryProfile,
    riskLevel: 'low',
  });

  return attachProtocolContracts(attachActorPresentation({
    kind: 'ai-protocol-turn',
    status: userInput ? 'ready' : 'waiting-input',
    mode: 'start',
    actor: {
      id: 'task-orchestrator',
      type: 'orchestrator',
    },
    command: '/spec-start',
    reason: userInput
      ? 'no active run-state found; start a new AI delivery run from the incoming requirement'
      : 'no active run-state found; waiting for a new requirement input',
    summary: {
      run_id: null,
      run_status: null,
      current_role: null,
      pending_gate: null,
      next_expected_producer: 'task-orchestrator',
      delivery_profile: deliveryProfile,
      artifact_profile: artifactProfile,
      complexity,
    },
    input: {
      user_request: userInput || null,
    },
    reads: buildCommandTargets(targetDir, START_INSTRUCTION_FILES),
    writes: [
      buildFileTarget(targetDir, runtimePaths.tmpTaskOrchestratorReply.relPath, {
        required: true,
        label: 'task-orchestrator reply inbox',
      }),
    ],
    expected_output: [
      '输出 task-orchestrator-bootstrap Markdown reply',
      '在 reply 中包含唯一合法 json 代码块',
      `在 run-plan 中明确 delivery_profile=${deliveryProfile} 与 artifact_profile=${artifactProfile}`,
      '写入 .ai-spec/internal/tmp/task-orchestrator-reply.md',
    ],
    guidance: {
      routing: {
        selected_flow: 'prd-to-delivery',
        delivery_profile: deliveryProfile,
        artifact_profile: artifactProfile,
        complexity,
        note: deliveryProfile === 'micro'
          ? '当前需求更适合微型交付档位：保留三专家，但产物使用短版 compact 规格。'
          : '当前需求更适合标准交付档位：保留完整门禁与完整 OpenSpec 产物。',
      },
    },
  }), { userInput });
}

function buildDispatchTurn(targetDir, status, currentArtifacts) {
  const runtimePaths = resolveRuntimePaths(targetDir);
  return attachProtocolContracts(attachActorPresentation({
    kind: 'ai-protocol-turn',
    status: 'ready',
    mode: 'dispatch',
    actor: {
      id: 'task-orchestrator',
      type: 'orchestrator',
    },
    command: 'task-orchestrator:dispatch',
    reason: status.next_expected.reason,
    summary: buildSummary(status, currentArtifacts.run),
    input: {
      user_request: currentArtifacts.run?.trigger?.raw_input || null,
      flow_id: currentArtifacts.run?.flow?.id || null,
      delivery_profile: currentArtifacts.run?.delivery_profile || null,
      artifact_profile: currentArtifacts.run?.artifact_profile || null,
    },
    reads: dedupeTargets([
      ...buildCommandTargets(targetDir, DISPATCH_INSTRUCTION_FILES),
      buildFileTarget(targetDir, path.join('.ai-spec', 'current-run.json'), {
        required: true,
        label: 'current run-state',
      }),
    ]),
    writes: [
      buildFileTarget(targetDir, runtimePaths.tmpCurrentDispatch.relPath, {
        required: true,
        label: 'expert dispatch inbox',
      }),
    ],
    expected_output: [
      '根据 current-run 选择当前专家并产出 expert-dispatch',
      '将当前任务锚点和期望输出裁剪到当前专家可执行粒度',
    ],
  }), {
    userInput: currentArtifacts.run?.trigger?.latest_user_input || currentArtifacts.run?.trigger?.raw_input || null,
  });
}

function buildContinueTurn(targetDir, status, currentArtifacts) {
  const runtimePaths = resolveRuntimePaths(targetDir);
  const expectedOutput = currentArtifacts.run?.pending_gate
    ? ['基于当前审批点产出最小 runtime-action']
    : ['基于当前专家执行结果产出最小 runtime-action'];

  const reads = [
    ...buildCommandTargets(targetDir, CONTINUE_INSTRUCTION_FILES),
    buildFileTarget(targetDir, path.join('.ai-spec', 'current-run.json'), {
      required: true,
      label: 'current run-state',
    }),
  ];

  if (currentArtifacts.execution) {
    reads.push(
      buildFileTarget(targetDir, getExistingRelPath(runtimePaths.currentExecutionJson), {
        required: true,
        label: 'current expert execution',
      }),
    );
  }

  return attachProtocolContracts(attachActorPresentation({
    kind: 'ai-protocol-turn',
    status: 'ready',
    mode: 'continue',
    actor: {
      id: 'task-orchestrator',
      type: 'orchestrator',
    },
    command: '/spec-continue',
    reason: status.next_expected.reason,
    summary: buildSummary(status, currentArtifacts.run),
    input: {
      user_request: currentArtifacts.run?.trigger?.raw_input || null,
      current_role: currentArtifacts.run?.current_role || null,
      pending_gate: currentArtifacts.run?.pending_gate || null,
      delivery_profile: currentArtifacts.run?.delivery_profile || null,
      artifact_profile: currentArtifacts.run?.artifact_profile || null,
    },
    reads: dedupeTargets(reads),
    writes: [
      buildFileTarget(targetDir, runtimePaths.tmpTaskOrchestratorReply.relPath, {
        required: true,
        label: 'task-orchestrator reply inbox',
      }),
    ],
    expected_output: expectedOutput,
  }), {
    userInput: currentArtifacts.run?.trigger?.latest_user_input || currentArtifacts.run?.trigger?.raw_input || null,
  });
}

function buildUpdateReviewTurn(targetDir, status, currentArtifacts) {
  const runtimePaths = resolveRuntimePaths(targetDir);
  const recentUpdates = Array.isArray(currentArtifacts.run?.input_updates)
    ? currentArtifacts.run.input_updates.slice(-3)
    : [];
  const reads = [
    ...buildCommandTargets(targetDir, CONTINUE_INSTRUCTION_FILES),
    buildFileTarget(targetDir, path.join('.ai-spec', 'current-run.json'), {
      required: true,
      label: 'current run-state',
    }),
  ];

  if (currentArtifacts.dispatch) {
    reads.push(
      buildFileTarget(targetDir, getExistingRelPath(runtimePaths.currentDispatch), {
        required: true,
        label: 'current expert dispatch',
      }),
    );
  }

  if (currentArtifacts.execution) {
    reads.push(
      buildFileTarget(targetDir, getExistingRelPath(runtimePaths.currentExecutionJson), {
        required: true,
        label: 'current expert execution',
      }),
    );
  }

  return attachProtocolContracts(attachActorPresentation({
    kind: 'ai-protocol-turn',
    status: 'ready',
    mode: 'update-review',
    actor: {
      id: 'task-orchestrator',
      type: 'orchestrator',
    },
    command: '/spec-continue',
    reason: 'new user input has been appended; task-orchestrator must reconcile it before normal progression',
    summary: buildSummary(status, currentArtifacts.run),
    input: {
      user_request: currentArtifacts.run?.trigger?.raw_input || null,
      latest_user_input: currentArtifacts.run?.trigger?.latest_user_input || null,
      input_updates: recentUpdates,
      current_role: currentArtifacts.run?.current_role || null,
      pending_gate: currentArtifacts.run?.pending_gate || null,
      delivery_profile: currentArtifacts.run?.delivery_profile || null,
      artifact_profile: currentArtifacts.run?.artifact_profile || null,
    },
    reads: dedupeTargets(reads),
    writes: [
      buildFileTarget(targetDir, runtimePaths.tmpTaskOrchestratorReply.relPath, {
        required: true,
        label: 'task-orchestrator reply inbox',
      }),
    ],
    expected_output: [
      '吸收新的用户输入并更新当前假设、边界或交接策略',
      '若补充输入会影响当前阶段，优先产出最小 runtime-action 或 gate 结论',
      '处理完成后清除 pending_input_update 标记',
    ],
  }), {
    userInput: currentArtifacts.run?.trigger?.latest_user_input || null,
  });
}

function buildExpertTurn(targetDir, status, currentArtifacts) {
  const dispatch = currentArtifacts.dispatch;
  if (!dispatch) {
    throw new Error('Cannot build expert turn without a recorded current expert dispatch');
  }
  const runtimePaths = resolveRuntimePaths(targetDir);

  const roleSource = dispatch.role?.source || null;
  const roleDefinition = loadRoleDefinition(targetDir, roleSource) || {
    id: dispatch.role?.id || null,
    name: dispatch.role?.name || null,
    source: roleSource,
    preferred_skills: Array.isArray(dispatch.role?.preferred_skills) ? dispatch.role.preferred_skills : [],
    reads: [],
    writes: [],
    handoff_to: [],
  };

  const context = {
    changeId: dispatch.task?.change_id || currentArtifacts.run?.task?.change_id || null,
    runId: dispatch.run_id || currentArtifacts.run?.run_id || null,
  };
  const deliveryProfile = currentArtifacts.run?.delivery_profile || 'standard';
  const artifactProfile = currentArtifacts.run?.artifact_profile || inferArtifactProfile({
    deliveryProfile,
  });

  const reads = [
    buildFileTarget(targetDir, path.join('.ai-spec', 'current-run.json'), {
      required: true,
      label: 'current run-state',
    }),
    buildFileTarget(targetDir, getExistingRelPath(runtimePaths.currentDispatch), {
      required: true,
      label: 'current expert dispatch',
    }),
  ];

  for (const item of roleDefinition.reads) {
    const resolvedValue = resolveTemplateVariables(item, context);
    if (resolvedValue === '.agents/rules/' || resolvedValue === '.agents/rules') {
      continue;
    }
    if (resolvedValue === 'code' || resolvedValue === 'implementation-notes') {
      reads.push(buildSymbolicTarget(resolvedValue));
    } else {
      const isProjectContext = resolvedValue === 'context/PROJECT.md';
      const isOpenSpecPath = resolvedValue.startsWith('openspec/');
      if (isProjectContext || isOpenSpecPath) {
        reads.push(buildReadableTarget(targetDir, resolvedValue));
      }
    }
  }

  const writes = [
    buildFileTarget(targetDir, runtimePaths.tmpCurrentExecution.relPath, {
      required: true,
      label: 'expert execution inbox',
    }),
  ];

  for (const item of roleDefinition.writes) {
    writes.push(convertTargetSpec(targetDir, item, context));
  }

  const expectedOutput = Array.isArray(dispatch.execution?.expected_output) && dispatch.execution.expected_output.length > 0
    ? [...dispatch.execution.expected_output]
    : [];
  for (const item of buildExpertExpectedOutput(dispatch, writes, runtimePaths, deliveryProfile)) {
    expectedOutput.push(item);
  }

  return attachProtocolContracts(attachActorPresentation({
    kind: 'ai-protocol-turn',
    status: 'ready',
    mode: 'execute',
    actor: {
      id: dispatch.role.id,
      name: dispatch.role.name || roleDefinition.name || null,
      type: 'expert',
      source: roleDefinition.source || null,
    },
    command: dispatch.role.id,
    reason: status.next_expected.reason,
    summary: buildSummary(status, currentArtifacts.run),
    input: {
      user_request: dispatch.task?.raw_goal || currentArtifacts.run?.trigger?.raw_input || null,
      change_id: context.changeId,
      flow_id: dispatch.flow?.id || currentArtifacts.run?.flow?.id || null,
      current_role: dispatch.execution?.current_role || dispatch.role.id,
      next_role: dispatch.execution?.next_role || roleDefinition.handoff_to[0] || null,
      delivery_profile: deliveryProfile,
      artifact_profile: artifactProfile,
    },
    preferred_skills: Array.isArray(dispatch.execution?.skills) && dispatch.execution.skills.length > 0
      ? dispatch.execution.skills
      : roleDefinition.preferred_skills,
    reads: dedupeTargets(reads),
    writes: dedupeTargets(writes),
    expected_output: [...new Set(expectedOutput)],
    execution_contract: buildExecutionContract(runtimePaths, dispatch, roleDefinition, writes, deliveryProfile),
    guidance: {
      role: buildRoleGuidance(dispatch.role?.id, deliveryProfile),
      rule_hints: buildRuleHints(dispatch.role?.id, deliveryProfile),
      skills: buildSkillGuidance(
        Array.isArray(dispatch.execution?.skills) && dispatch.execution.skills.length > 0
          ? dispatch.execution.skills
          : roleDefinition.preferred_skills.map((id) => ({ id })),
      ),
      openspec_rules: buildOpenSpecGuidance(targetDir, dispatch.role?.id, deliveryProfile),
    },
    handoff_to: roleDefinition.handoff_to,
  }), {
    userInput: currentArtifacts.run?.trigger?.latest_user_input || currentArtifacts.run?.trigger?.raw_input || null,
  });
}

function buildProtocolTurn(options = {}) {
  const targetDir = resolveTargetDir(options.target);
  const status = runner.buildStatus(targetDir);
  const userInput = options.userInput || null;

  if (status.pending_inputs.length > 0) {
    return attachProtocolContracts(attachActorPresentation({
      kind: 'ai-protocol-turn',
      status: 'blocked',
      mode: 'consume-inbox',
      actor: {
        id: 'runner',
        type: 'runtime',
      },
      command: 'advance-runner',
      reason: status.next_expected.reason,
      summary: buildSummary(status),
      input: {
        pending_inputs: status.pending_inputs,
      },
      reads: [],
      writes: [],
      expected_output: [],
    }), { userInput });
  }

  if (!status.current.run_id) {
    return buildStartTurn(targetDir, userInput);
  }

  if (status.next_expected.producer === null) {
    if (userInput) {
      return buildStartTurn(targetDir, userInput);
    }

    return attachProtocolContracts({
      kind: 'ai-protocol-turn',
      status: 'terminal',
      mode: 'terminal',
      actor: null,
      command: null,
      reason: status.next_expected.reason,
      summary: buildSummary(status),
      input: {
        user_request: null,
      },
      reads: [],
      writes: [],
      expected_output: [],
    }, { userInput });
  }

  const currentArtifacts = loadCurrentArtifacts(targetDir);

  if (currentArtifacts.run?.pending_input_update) {
    return buildUpdateReviewTurn(targetDir, status, currentArtifacts);
  }

  if (status.current.execution_role) {
    return buildContinueTurn(targetDir, status, currentArtifacts);
  }

  if (status.current.dispatch_role) {
    return buildExpertTurn(targetDir, status, currentArtifacts);
  }

  if (status.current.pending_gate) {
    return buildContinueTurn(targetDir, status, currentArtifacts);
  }

  return buildDispatchTurn(targetDir, status, currentArtifacts);
}

function advanceProtocolStep(options = {}) {
  const targetDir = resolveTargetDir(options.target);
  const before = runner.buildStatus(targetDir);
  let advanced = null;

  if (before.pending_inputs.length > 0) {
    advanced = runner.advanceRunner({
      target: targetDir,
    });
  }

  return {
    kind: 'ai-protocol-step',
    target: targetDir,
    advanced,
    runner_status: runner.buildStatus(targetDir),
    turn: buildProtocolTurn({
      target: targetDir,
      userInput: options.userInput || null,
    }),
  };
}

function updateProtocolInput(options = {}) {
  const targetDir = resolveTargetDir(options.target);
  const userInput = options.userInput || null;
  if (!userInput) {
    throw new Error('Missing required argument: --user-input <text>');
  }

  const updated = recordRunInputUpdate({
    target: targetDir,
    userInput,
    source: 'protocol-update',
  });

  return {
    kind: 'ai-protocol-input-update',
    target: targetDir,
    updated,
    runner_status: runner.buildStatus(targetDir),
    turn: buildProtocolTurn({
      target: targetDir,
      userInput,
    }),
  };
}

module.exports = {
  buildProtocolTurn,
  advanceProtocolStep,
  updateProtocolInput,
  loadRoleDefinition,
  parseFrontmatter,
};
