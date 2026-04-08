const fs = require('fs');
const path = require('path');
const runner = require('../bin/task-orchestrator-runner');
const {
  inferDeliveryProfile,
  inferArtifactProfile,
  inferComplexity,
  inferRiskLevel,
  recordRunInputUpdate,
} = require('../bin/runtime-state');
const {
  resolveRuntimePaths,
  getExistingPath,
  getExistingRelPath,
} = require('../bin/runtime-paths');
const {
  getRoleRuntimeConfig,
  getFlowRuntimeConfig,
  getRuleRuntimeConfig,
  getSkillRuntimeConfig,
} = require('../bin/runtime-registry');
const {
  getRuntimeTransition,
} = require('../bin/execution-semantics');
const PACKAGE_ROOT = path.resolve(__dirname, '..');

const START_INSTRUCTION_FILES = [
  '.agents/roles/common/task-orchestrator-run-plan-template.md',
];

const CONTINUE_INSTRUCTION_FILES = [];

const DISPATCH_INSTRUCTION_FILES = [];

const FALLBACK_RULE_SOURCE_CANDIDATES = {
  'project-overview': {
    vue: ['.agents/rules/01-项目概述.md', '.agents/rules/profiles/vue/01-项目概述.md'],
    react: ['.agents/rules/01-项目概述.md', '.agents/rules/profiles/react/01-项目概述.md'],
    default: ['.agents/rules/01-项目概述.md'],
  },
  'project-structure': {
    vue: ['.agents/rules/03-项目结构.md', '.agents/rules/profiles/vue/03-项目结构.md'],
    react: ['.agents/rules/03-项目结构.md', '.agents/rules/profiles/react/03-项目结构.md'],
    default: ['.agents/rules/03-项目结构.md'],
  },
  'component-standard': {
    vue: ['.agents/rules/04-组件规范.md', '.agents/rules/profiles/vue/04-组件规范.md'],
    react: ['.agents/rules/04-组件规范.md', '.agents/rules/profiles/react/04-组件规范.md'],
    default: ['.agents/rules/04-组件规范.md'],
  },
  'api-standard': {
    default: ['.agents/rules/05-API规范.md', '.agents/rules/common/05-API规范.md'],
  },
  'route-standard': {
    vue: ['.agents/rules/06-路由规范.md', '.agents/rules/profiles/vue/06-路由规范.md'],
    react: ['.agents/rules/06-路由规范.md', '.agents/rules/profiles/react/06-路由规范.md'],
    default: ['.agents/rules/06-路由规范.md'],
  },
  'store-standard': {
    vue: ['.agents/rules/07-状态管理.md', '.agents/rules/profiles/vue/07-状态管理.md'],
    react: ['.agents/rules/07-状态管理.md', '.agents/rules/profiles/react/07-状态管理.md'],
    default: ['.agents/rules/07-状态管理.md'],
  },
  'style-standard': {
    vue: ['.agents/rules/09-样式规范.md', '.agents/rules/profiles/vue/09-样式规范.md'],
    react: ['.agents/rules/09-样式规范.md', '.agents/rules/profiles/react/09-样式规范.md'],
    default: ['.agents/rules/09-样式规范.md'],
  },
  'coding-standard': {
    default: ['.agents/rules/02-编码规范.md', '.agents/rules/common/02-编码规范.md'],
  },
  'test-standard': {
    default: ['.agents/rules/11-测试规范.md', '.agents/rules/common/11-测试规范.md'],
  },
  'format-check-standard': {
    default: ['.agents/rules/13-代码格式化与检查.md', '.agents/rules/common/13-代码格式化与检查.md'],
  },
  'audit-report-standard': {
    default: ['.agents/rules/14-审计汇报规范.md', '.agents/rules/common/14-审计汇报规范.md'],
  },
};

const FALLBACK_ROLE_RULE_IDS = {
  'task-orchestrator': ['project-overview', 'project-structure', 'api-standard', 'route-standard', 'style-standard'],
  'requirement-analyst': ['project-overview', 'project-structure', 'api-standard', 'route-standard', 'style-standard'],
  'frontend-implementer': ['project-structure', 'component-standard', 'route-standard', 'api-standard', 'store-standard', 'style-standard'],
  'code-guardian': ['coding-standard', 'api-standard', 'route-standard', 'style-standard', 'test-standard', 'format-check-standard', 'audit-report-standard'],
};

const FALLBACK_SKILL_SOURCE_CANDIDATES = {
  'create-proposal': {
    default: ['.agents/skills/common/create-proposal/SKILL.md'],
  },
  'design-analysis': {
    default: ['.agents/skills/common/design-analysis/SKILL.md'],
  },
  'create-view': {
    vue: ['.agents/skills/profiles/vue/create-view/SKILL.md'],
  },
  'create-component': {
    vue: ['.agents/skills/profiles/vue/create-component/SKILL.md'],
    react: ['.agents/skills/profiles/react/create-component/SKILL.md'],
    default: ['.agents/skills/profiles/vue/create-component/SKILL.md'],
  },
  'create-route': {
    vue: ['.agents/skills/profiles/vue/create-route/SKILL.md'],
    react: ['.agents/skills/profiles/react/create-route/SKILL.md'],
  },
  'create-api': {
    vue: ['.agents/skills/profiles/vue/create-api/SKILL.md'],
    react: ['.agents/skills/profiles/react/create-api/SKILL.md'],
  },
  'create-store': {
    vue: ['.agents/skills/profiles/vue/create-store/SKILL.md'],
    react: ['.agents/skills/profiles/react/create-store/SKILL.md'],
  },
  'theme-variables': {
    vue: ['.agents/skills/profiles/vue/theme-variables/SKILL.md'],
    react: ['.agents/skills/profiles/react/theme-variables/SKILL.md'],
  },
  'execute-task': {
    default: ['.agents/skills/common/execute-task/SKILL.md'],
  },
  'create-test': {
    default: ['.agents/skills/common/create-test/SKILL.md'],
  },
  'ui-verification': {
    default: ['.agents/skills/common/ui-verification/SKILL.md'],
  },
  'web-design-guidelines': {
    default: ['.agents/skills/common/web-design-guidelines/SKILL.md'],
  },
};

const FALLBACK_ROLE_SKILL_PRIORITY = {
  'requirement-analyst': ['create-proposal', 'design-analysis'],
  'frontend-implementer': ['create-view', 'create-route', 'create-api', 'theme-variables', 'create-component', 'create-store', 'execute-task'],
  'code-guardian': ['ui-verification', 'web-design-guidelines', 'create-test'],
};

const FALLBACK_ROLE_OPENSPEC_RULE_SECTIONS = {
  'requirement-analyst': ['proposal', 'tasks'],
  'frontend-implementer': ['tasks', 'design'],
  'code-guardian': ['tasks', 'specs', 'checklist', 'iterations'],
};

const DEFAULT_FLOW_ID = 'prd-to-delivery';
const DEFAULT_FLOW_CONSTRAINTS = {
  required_roles: ['requirement-analyst', 'frontend-implementer', 'code-guardian'],
  approval_gates: ['before-implementation', 'before-delivery'],
  required_artifacts: ['proposal.md', 'tasks.md', 'checklist.md', 'iterations.md'],
};

const MICRO_ROLE_EXTRAS = {
  'task-orchestrator': {
    goal: '用最小 run-plan 编排微型任务，保留三专家但收口产物和说明。',
    must_do: [
      '明确 delivery_profile=micro 与 artifact_profile=compact',
      '优先按仓库现状复用目录、路由、mock 和样式承载方式',
    ],
    must_not: [
      '不要为了微型任务扩展额外专家或发明新流程',
    ],
  },
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
    '只记录当前变更真正需要的增量规范和关键验收场景。',
    '保留可测试的结论，不展开无关背景说明。'
  ],
  checklist: [
    'checklist.md 只保留关键检查项、阻断项和最终放行结论。',
    '检查项必须能回指 proposal/tasks/specs 或实现证据。'
  ],
  iterations: [
    'iterations.md 只记录问题、修正动作和残留风险。',
    '避免输出泛泛复盘，聚焦本轮变更。'
  ],
};

const ROLE_GUIDANCE = {
  'task-orchestrator': {
    goal: '基于项目事实编排流程、门禁和专家交接，不直接承担具体实现。',
    must_do: [
      '先看项目现状、规则和风险，再决定交付档位、门禁和第一跳专家',
      '将仓库可推断的事实转成 assumptions 或 routing constraints，而不是重复回问用户',
      '对高风险和审批场景明确给出下一步，不允许隐式放行',
    ],
    must_not: [
      '不要越权替代 requirement-analyst、frontend-implementer 或 code-guardian 的职责',
      '不要在 proposal/tasks/checklist/iterations 缺失时跳过门禁直接推进',
    ],
  },
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

const FALLBACK_ROLE_RULE_CONSTRAINT_PROFILES = {
  default: {
    'task-orchestrator': {
      must_follow: [
        '首轮编排必须优先吸收仓库现状与规则，再决定 flow、delivery_profile 和人工确认点。',
        '能从仓库结构、项目规则推断的路由/API/mock/样式事实，优先转成 assumptions 或 routing constraints。',
      ],
      blocked_when: [
        '高风险领域的流程、安全、合规、风控或权限边界仍未确认时，不得放行到 frontend-implementer。',
      ],
    },
    'requirement-analyst': {
      must_follow: [
        '先把项目定位、目录落点、路由/API/样式约定吸收到 proposal/tasks，不要把规范已明确的信息重复写成 missing_inputs。',
        '需求收敛必须落到当前仓库可实施的页面、路由、接口或 mock 落点，而不是抽象方案。',
      ],
      blocked_when: [
        '高风险领域的流程、安全、合规、风控或权限边界仍未确认时，必须维持 before-implementation 门禁。',
      ],
    },
    'frontend-implementer': {
      must_follow: [
        '优先复用现有目录、路由、请求封装、状态管理和样式变量约定。',
        '实现前先对齐 proposal/tasks 的范围与落点，不要自行扩 scope。',
      ],
      blocked_when: [
        'proposal/tasks 未落盘或仍处于 before-implementation 审批门禁时，禁止改业务代码。',
      ],
    },
    'code-guardian': {
      must_follow: [
        '以 proposal/tasks 和项目规则为准检查实现，而不是只做泛化 lint。',
        '必须给出阻断项、非阻断项和交付建议，不能写成模糊建议列表。',
      ],
      blocked_when: [
        '存在与项目规范冲突的目录、路由、API、样式或测试问题时，不得给 complete 结论。',
      ],
    },
  },
  vue: {
    'task-orchestrator': {
      must_follow: [
        'Vue 页面类任务优先以 src/views、src/router/modules、src/api、src/api/types、src/style.css 等当前仓库落点编排。',
        '若仓库缺少 vue-router 或请求层骨架，要先把“补骨架还是保持占位入口”写进编排约束。',
        'mock-first、真实接口、Pinia/store 与主题变量策略需要在首轮编排时明确，不留到实现阶段临时猜。'
      ],
    },
    'requirement-analyst': {
      must_follow: [
        '页面任务优先对齐 src/views/<page>/index.vue 与 src/router/modules/<module>.ts 的落点约定。',
        '若为 mock 或占位页，明确写清 src/mock 或本地 mock 方案，以及“不接真实 API”的边界。',
        '样式和视觉约束需对齐主题 CSS 变量，不要把硬编码颜色或自由样式当默认方案。',
      ],
    },
    'frontend-implementer': {
      must_follow: [
        'Vue 视图优先落在 src/views/<page>/index.vue；页面专用组件落在 src/views/<page>/components/。',
        '路由统一放在 src/router/modules/，页面路由必须懒加载，并补齐 meta.title / requiresAuth 等项目约定。',
        '接口统一走 src/api/<module>.ts 与 src/api/types/<module>.ts，组件或页面里禁止直接调 request。',
        '状态管理统一走 Pinia 和 src/store/modules/；mock-first 场景优先本地状态，不预建复杂 store。',
        '样式必须使用主题变量和 scoped/CSS Modules，禁止硬编码颜色值。',
      ],
    },
    'code-guardian': {
      must_follow: [
        '核查页面是否落在 src/views、路由是否落在 src/router/modules，并保持动态导入。',
        '核查 API 是否通过 src/api 封装、类型是否放在 src/api/types，页面中未直接调 request。',
        '核查样式是否使用主题变量、scoped 或 CSS Modules，而不是硬编码全局样式。',
        '核查 Pinia/store、mock 与 proposal/tasks 的边界是否一致，避免“演示页写成生产页”。',
      ],
    },
  },
};

const ROLE_RULE_REPO_SPECIFIC = {
  vue: {
    'task-orchestrator': {
      repo_specific: (facts) => [
        facts.routeEntry ? `当前路由入口为 ${facts.routeEntry}，优先按现有路由骨架编排。` : '仓库尚未检测到路由入口；页面类任务需先明确补路由骨架还是保留占位入口。',
        facts.apiDir ? `当前 API 目录为 ${facts.apiDir}${facts.apiTypesDir ? `，类型目录为 ${facts.apiTypesDir}` : ''}。` : '仓库尚未检测到 API 模块目录；真实接口任务需先明确请求层承载方式。',
        facts.styleEntry ? `当前样式入口为 ${facts.styleEntry}，需沿用主题变量与现有样式承载方式。` : null,
      ].filter(Boolean),
    },
    'requirement-analyst': {
      repo_specific: (facts) => [
        facts.routeModulesDir ? `当前仓库已有路由模块目录 ${facts.routeModulesDir}，proposal/tasks 需要按该目录组织。` : '若项目尚未接入 vue-router，需要在 proposal/tasks 明确是补路由还是保持占位入口。',
        facts.viewsDir ? `页面目录以 ${facts.viewsDir} 为准，任务拆解要写清页面落点。` : null,
      ].filter(Boolean),
    },
    'frontend-implementer': {
      repo_specific: (facts) => [
        facts.routeEntry ? `当前路由入口为 ${facts.routeEntry}。` : '仓库尚未检测到路由入口，若需新增路由必须先补路由骨架。',
        facts.requestConfig ? `当前请求层配置入口为 ${facts.requestConfig}。` : facts.apiDir ? `当前 API 目录为 ${facts.apiDir}，新增接口时保持模块化拆分。` : '仓库尚未检测到 API 封装入口，如需真实接口需先补请求层约定。',
        facts.styleEntry ? `当前样式入口为 ${facts.styleEntry}，新增样式要沿用主题变量。` : null,
      ].filter(Boolean),
    },
    'code-guardian': {
      repo_specific: (facts) => [
        facts.routeModulesDir ? `重点核对 ${facts.routeModulesDir} 下的路由模块是否与页面落点一致。` : null,
        facts.mockDir ? `重点核对 ${facts.mockDir} 中的 mock 是否与演示范围一致。` : null,
      ].filter(Boolean),
    },
  },
};

const MICRO_ROLE_SKILL_ALLOWLIST = {
  'requirement-analyst': ['create-proposal', 'design-analysis'],
  'frontend-implementer': ['create-view', 'create-component', 'create-route', 'theme-variables'],
  'code-guardian': ['ui-verification', 'web-design-guidelines'],
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

function buildReadableTargetFromCandidates(targetDir, candidates, options = {}) {
  const normalized = Array.isArray(candidates) ? candidates.filter(Boolean) : [];
  if (normalized.length === 0) {
    return null;
  }

  for (const candidate of normalized) {
    const targetPath = path.join(targetDir, candidate);
    if (fs.existsSync(targetPath)) {
      return {
        ...buildFileTarget(targetDir, candidate, options),
        origin: 'target',
      };
    }
  }

  for (const candidate of normalized) {
    const packagePath = path.join(PACKAGE_ROOT, candidate);
    if (fs.existsSync(packagePath)) {
      const isDirectory = candidate.endsWith('/') || fs.statSync(packagePath).isDirectory();
      return {
        kind: isDirectory ? 'directory' : 'file',
        path: packagePath,
        rel_path: candidate,
        exists: true,
        required: Boolean(options.required),
        label: options.label || null,
        origin: 'package',
      };
    }
  }

  return {
    ...buildFileTarget(targetDir, normalized[0], options),
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

function loadPackageManifest(targetDir) {
  const packagePath = path.join(targetDir, 'package.json');
  if (!fs.existsSync(packagePath)) {
    return null;
  }

  return JSON.parse(fs.readFileSync(packagePath, 'utf8'));
}

function hasDependency(pkg, names) {
  if (!pkg) {
    return false;
  }

  const deps = {
    ...(pkg.dependencies || {}),
    ...(pkg.devDependencies || {}),
    ...(pkg.peerDependencies || {}),
  };

  return names.some((name) => Object.prototype.hasOwnProperty.call(deps, name));
}

function detectProjectProfile(targetDir) {
  const pkg = loadPackageManifest(targetDir);
  if (hasDependency(pkg, ['vue', 'vue-router', 'pinia'])) {
    return 'vue';
  }
  if (hasDependency(pkg, ['react', 'react-dom', 'react-router-dom'])) {
    return 'react';
  }
  return 'default';
}

function detectProjectLanguage(targetDir, pkg) {
  if (hasDependency(pkg, ['typescript']) || fs.existsSync(path.join(targetDir, 'tsconfig.json'))) {
    return 'TypeScript';
  }
  return 'JavaScript';
}

function detectBuildTool(pkg) {
  if (hasDependency(pkg, ['vite'])) {
    return 'Vite';
  }
  if (hasDependency(pkg, ['next'])) {
    return 'Next.js';
  }
  if (hasDependency(pkg, ['nuxt'])) {
    return 'Nuxt';
  }
  if (hasDependency(pkg, ['webpack'])) {
    return 'Webpack';
  }
  return 'unknown';
}

function detectPackageManager(targetDir) {
  if (fs.existsSync(path.join(targetDir, 'pnpm-lock.yaml'))) {
    return 'pnpm';
  }
  if (fs.existsSync(path.join(targetDir, 'yarn.lock'))) {
    return 'yarn';
  }
  if (fs.existsSync(path.join(targetDir, 'package-lock.json'))) {
    return 'npm';
  }
  return 'unknown';
}

function findExistingRelPath(targetDir, candidates) {
  for (const candidate of candidates) {
    if (fs.existsSync(path.join(targetDir, candidate))) {
      return candidate;
    }
  }
  return null;
}

function collectRepoConventions(targetDir, projectProfile) {
  const routeEntry = findExistingRelPath(targetDir, ['src/router/index.ts', 'src/router/index.js']);
  const routeModulesDir = findExistingRelPath(targetDir, ['src/router/modules']);
  const viewsDir = findExistingRelPath(targetDir, ['src/views']);
  const apiDir = findExistingRelPath(targetDir, ['src/api']);
  const apiTypesDir = findExistingRelPath(targetDir, ['src/api/types']);
  const mockDir = findExistingRelPath(targetDir, ['src/mock', 'src/mocks']);
  const storeModulesDir = findExistingRelPath(targetDir, ['src/store/modules', 'src/stores/modules', 'src/store']);
  const styleEntry = findExistingRelPath(targetDir, ['src/styles', 'src/style.css', 'src/style.scss', 'src/styles/variables.scss']);
  const requestConfig = findExistingRelPath(targetDir, [
    'src/config/requestConfig.ts',
    'src/config/requestConfig.js',
    'src/lib/request.ts',
    'src/libs/request.ts',
    'src/utils/request.ts',
  ]);
  const appEntry = findExistingRelPath(targetDir, ['src/App.vue', 'src/App.tsx', 'src/App.jsx']);
  const mainEntry = findExistingRelPath(targetDir, ['src/main.ts', 'src/main.js', 'src/main.tsx', 'src/main.jsx']);
  const projectContextPath = findExistingRelPath(targetDir, ['context/PROJECT.md']);

  return {
    project_profile: projectProfile,
    projectContextPath,
    routeEntry,
    routeModulesDir,
    viewsDir,
    apiDir,
    apiTypesDir,
    mockDir,
    storeModulesDir,
    styleEntry,
    requestConfig,
    appEntry,
    mainEntry,
  };
}

function buildProjectContextGuidance(targetDir, projectProfile, runState = null) {
  const pkg = loadPackageManifest(targetDir);
  const facts = collectRepoConventions(targetDir, projectProfile);
  const routing = facts.routeEntry
    ? `${projectProfile === 'vue' ? 'vue-router' : 'router'} @ ${facts.routeEntry}${facts.routeModulesDir ? ` + ${facts.routeModulesDir}` : ''}`
    : '仓库未检测到显式路由入口';
  const stateManagement = facts.storeModulesDir
    ? `${projectProfile === 'vue' ? 'Pinia/store' : 'store'} @ ${facts.storeModulesDir}`
    : '未检测到全局状态目录';
  const apiLayer = facts.apiDir
    ? `${facts.apiDir}${facts.apiTypesDir ? ` + ${facts.apiTypesDir}` : ''}${facts.requestConfig ? `；请求入口 ${facts.requestConfig}` : ''}`
    : '未检测到 src/api 目录';
  const mockStrategy = facts.mockDir
    ? `mock 数据目录 ${facts.mockDir}`
    : '未检测到独立 mock 目录';

  return {
    framework: projectProfile === 'default' ? 'unknown' : projectProfile,
    language: detectProjectLanguage(targetDir, pkg),
    build_tool: detectBuildTool(pkg),
    package_manager: detectPackageManager(targetDir),
    delivery_profile: runState?.delivery_profile || null,
    artifact_profile: runState?.artifact_profile || null,
    routing,
    state_management: stateManagement,
    api_layer: apiLayer,
    mock_strategy: mockStrategy,
    style_system: facts.styleEntry ? `样式入口 ${facts.styleEntry}` : '未检测到显式样式入口',
    context_source: facts.projectContextPath || null,
  };
}

function inferRoutingStrategy(repoConventions, rawInput) {
  const text = String(rawInput || '');
  if (repoConventions.routeEntry) {
    return repoConventions.routeModulesDir
      ? `复用现有路由入口 ${repoConventions.routeEntry} 与模块目录 ${repoConventions.routeModulesDir}`
      : `复用现有路由入口 ${repoConventions.routeEntry}`;
  }
  if (/页面|列表|详情|欢迎|登录|路由|router|page/i.test(text)) {
    return '仓库未检测到显式路由入口；页面类任务需先补路由骨架或在 proposal/tasks 中明确占位入口方案';
  }
  return '当前任务不强依赖新增路由，优先保持现有入口结构';
}

function inferApiStrategy(repoConventions, rawInput) {
  const text = String(rawInput || '');
  if (repoConventions.requestConfig) {
    return `复用请求入口 ${repoConventions.requestConfig}${repoConventions.apiDir ? `，并沿用 ${repoConventions.apiDir}` : ''} 进行模块拆分`;
  }
  if (repoConventions.apiDir) {
    return `沿用 ${repoConventions.apiDir}${repoConventions.apiTypesDir ? ` + ${repoConventions.apiTypesDir}` : ''} 进行接口与类型拆分`;
  }
  if (/接口|api|请求|分页|搜索|筛选|状态|重试|支付|订单|用户/i.test(text)) {
    return '仓库尚未检测到稳定 API 封装入口；真实接口任务需先建立请求层或在 proposal/tasks 中明确占位方案';
  }
  return '当前任务不强依赖真实接口，优先保持最小数据流';
}

function inferMockStrategy(repoConventions, rawInput) {
  const text = String(rawInput || '');
  if (repoConventions.mockDir) {
    return /mock|演示|占位/i.test(text)
      ? `优先沿用 ${repoConventions.mockDir} 承载演示数据`
      : `${repoConventions.mockDir} 可作为 mock-first 兜底方案`;
  }
  if (/mock|演示|占位/i.test(text)) {
    return '仓库未检测到独立 mock 目录；若采用演示版，需要在 proposal/tasks 中明确本地 mock 或页面内占位方案';
  }
  return '未显式声明 mock-first，按真实接口交付评估';
}

function inferStateStrategy(repoConventions) {
  if (repoConventions.storeModulesDir) {
    return `全局状态沿用 ${repoConventions.storeModulesDir}，避免重复造轮子`;
  }
  return '未检测到全局状态目录；优先本地状态，避免预建复杂 store';
}

function inferStyleStrategy(repoConventions) {
  if (repoConventions.styleEntry) {
    return `样式沿用 ${repoConventions.styleEntry} 与主题变量体系`;
  }
  return '仓库未检测到显式样式入口；需先确认主题变量与样式承载方式';
}

function inferRiskDrivers(rawInput, repoConventions) {
  const text = String(rawInput || '');
  const drivers = [];
  const patterns = [
    { pattern: /支付|收款|交易|退款|psp/i, label: '支付/交易域' },
    { pattern: /登录|认证|oauth|权限|短信|验证码|token/i, label: '认证/权限域' },
    { pattern: /安全|风控|合规|敏感|审计/i, label: '安全/风控/合规域' },
    { pattern: /先不说|暂未|未确定|待定|后续补/i, label: '关键约束尚未确认' },
  ];
  for (const item of patterns) {
    if (item.pattern.test(text)) {
      drivers.push(item.label);
    }
  }
  if (!repoConventions.routeEntry && /页面|列表|详情|欢迎|登录|路由|router|page/i.test(text)) {
    drivers.push('页面任务但仓库未检测到显式路由入口');
  }
  if (!repoConventions.requestConfig && !repoConventions.apiDir && /接口|api|请求|分页|搜索|筛选|状态|重试/i.test(text)) {
    drivers.push('接口任务但仓库未检测到稳定 API 封装入口');
  }
  return [...new Set(drivers)];
}

function buildOrchestratorGuidance(targetDir, runState = null, userInput = null) {
  const selectedFlowId = runState?.flow?.id || DEFAULT_FLOW_ID;
  const flowDefinition = loadFlowDefinition(targetDir, selectedFlowId);
  const projectProfile = detectProjectProfile(targetDir);
  const repoConventions = collectRepoConventions(targetDir, projectProfile);
  const rawInput = userInput || runState?.trigger?.latest_user_input || runState?.trigger?.raw_input || null;
  const riskLevel = runState?.task?.risk_level || inferRiskLevel({
    rawInput,
    taskType: null,
    deliveryProfile: runState?.delivery_profile || null,
    flowId: selectedFlowId,
  });
  const deliveryProfile = runState?.delivery_profile || inferDeliveryProfile({
    rawInput,
    taskType: null,
    riskLevel,
    flowId: selectedFlowId,
  });
  const artifactProfile = runState?.artifact_profile || inferArtifactProfile({
    deliveryProfile,
  });
  const complexity = runState?.complexity || runState?.task?.complexity || inferComplexity({
    deliveryProfile,
    riskLevel,
  });
  const projectContextGuidance = buildProjectContextGuidance(targetDir, projectProfile, {
    ...(runState || {}),
    delivery_profile: deliveryProfile,
    artifact_profile: artifactProfile,
  });
  const roleRuleContract = buildRoleRuleContract(
    targetDir,
    'task-orchestrator',
    deliveryProfile,
    projectProfile,
    repoConventions,
  );
  const riskDrivers = inferRiskDrivers(rawInput, repoConventions);
  const pendingGate = runState?.pending_gate || null;
  const hasBeforeImplementationGate = flowDefinition.approval_gates.includes('before-implementation');
  const expectedGate = pendingGate || (riskLevel === 'high' && hasBeforeImplementationGate ? 'before-implementation' : null);
  const resumeRole = expectedGate === 'before-implementation'
    ? inferApprovalResumeRoleFromFlow(targetDir, runState, flowDefinition)
    : null;

  return {
    project_context: projectContextGuidance,
    repo_conventions: buildRepoConventionGuidance(repoConventions),
    role: buildRoleGuidance('task-orchestrator', deliveryProfile),
    role_rule_contract: roleRuleContract,
    routing_constraints: {
      selected_flow: flowDefinition.id,
      required_experts: flowDefinition.required_roles,
      first_handoff: runState?.plan?.first_handoff || flowDefinition.first_handoff,
      route_strategy: inferRoutingStrategy(repoConventions, rawInput),
      api_strategy: inferApiStrategy(repoConventions, rawInput),
      mock_strategy: inferMockStrategy(repoConventions, rawInput),
      state_strategy: inferStateStrategy(repoConventions),
      style_strategy: inferStyleStrategy(repoConventions),
      route_bootstrap_required: Boolean(!repoConventions.routeEntry && /页面|列表|详情|欢迎|登录|路由|router|page/i.test(String(rawInput || ''))),
    },
    risk_contract: {
      risk_level: riskLevel,
      complexity,
      drivers: riskDrivers,
      before_implementation_gate: riskLevel === 'high' && hasBeforeImplementationGate ? 'before-implementation' : null,
      manual_confirmation_required: riskLevel === 'high' && hasBeforeImplementationGate,
      escalation_rule: riskLevel === 'high' && hasBeforeImplementationGate
        ? '需求收敛后必须进入 before-implementation 审批门禁，再决定是否放行实现'
        : '按三专家协同自动推进，必要时仅在异常或门禁场景下阻断',
    },
    approval_contract: {
      gates: flowDefinition.approval_gates,
      pending_gate: pendingGate,
      expected_gate: expectedGate,
      required_when: [
        '支付、认证、权限、安全、风控、合规等高风险领域',
        '关键流程或约束仍未确认，继续实现会显著放大返工成本',
      ],
      approve_resume_to_role: resumeRole,
      approval_examples: [
        '我同意按当前 proposal 的范围继续实现',
        '按演示版范围继续推进',
        '批准当前提案，继续到实现阶段',
      ],
    },
    orchestration_contract: {
      selected_flow: flowDefinition.id,
      delivery_profile: deliveryProfile,
      artifact_profile: artifactProfile,
      change_id: runState?.task?.change_id || null,
      required_experts: flowDefinition.required_roles,
      required_artifacts: flowDefinition.required_artifacts,
      assumptions_policy: [
        '仓库结构、项目规则和现有代码可推断的信息优先转成 assumptions',
        '只在高风险、不可逆或规则冲突时把缺口升级为审批或阻断',
      ],
      missing_inputs_policy: [
        '规范中已明确、仓库中已存在的事实不要重复标成 missing_inputs',
        '高风险且无法可靠推断的边界必须显式升级为审批点',
      ],
      handoff_policy: flowDefinition.handoff_policy,
      completion_policy: flowDefinition.completion_policy,
      repo_alignment: [
        repoConventions.viewsDir ? `页面目录优先对齐 ${repoConventions.viewsDir}` : '页面目录需先与仓库结构对齐',
        repoConventions.routeEntry ? `路由入口优先对齐 ${repoConventions.routeEntry}` : '未检测到路由入口时，页面任务需先明确骨架方案',
        repoConventions.apiDir ? `API 模块优先对齐 ${repoConventions.apiDir}` : '真实接口任务需先明确 API 承载方式',
        repoConventions.styleEntry ? `样式入口优先对齐 ${repoConventions.styleEntry}` : '样式承载方式需先明确',
      ],
    },
  };
}

function buildCodeGuardianEvidenceTargets(targetDir, repoConventions) {
  const relPaths = [
    repoConventions.projectContextPath,
    repoConventions.appEntry,
    repoConventions.mainEntry,
    repoConventions.routeEntry,
    repoConventions.routeModulesDir,
    repoConventions.apiDir,
    repoConventions.apiTypesDir,
    repoConventions.requestConfig,
    repoConventions.mockDir,
    repoConventions.storeModulesDir,
    repoConventions.styleEntry,
  ].filter(Boolean);

  return relPaths.map((relPath) => buildReadableTarget(targetDir, relPath, {
    label: `review evidence: ${relPath}`,
  }));
}

function buildVerificationExpectations(targetDir, projectContextGuidance) {
  const pkg = loadPackageManifest(targetDir);
  const scripts = pkg && typeof pkg.scripts === 'object' ? pkg.scripts : {};
  const packageManager = projectContextGuidance?.package_manager || detectPackageManager(targetDir);
  const commands = [];

  if (typeof scripts.typecheck === 'string') {
    commands.push(`${packageManager} run typecheck`);
  } else if (
    projectContextGuidance?.framework === 'vue' &&
    projectContextGuidance?.language === 'TypeScript'
  ) {
    commands.push(`${packageManager} exec vue-tsc --noEmit`);
  }

  if (typeof scripts.lint === 'string') {
    commands.push(`${packageManager} run lint`);
  }
  if (typeof scripts.test === 'string') {
    commands.push(`${packageManager} run test`);
  }
  if (typeof scripts.build === 'string') {
    commands.push(`${packageManager} run build`);
  }

  return [...new Set(commands)];
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
  const roleId = frontmatter.id || null;
  const registryEntry = getRoleRuntimeConfig(targetDir, roleId);

  return {
    id: roleId,
    name: frontmatter.name || registryEntry?.name || null,
    source: sourceRelPath,
    preferred_skills: Array.isArray(frontmatter.preferred_skills)
      ? frontmatter.preferred_skills
      : Array.isArray(registryEntry?.preferred_skills)
      ? registryEntry.preferred_skills
      : [],
    reads: Array.isArray(frontmatter.reads) ? frontmatter.reads : [],
    writes: Array.isArray(frontmatter.writes) ? frontmatter.writes : [],
    handoff_to: Array.isArray(frontmatter.handoff_to)
      ? frontmatter.handoff_to
      : Array.isArray(registryEntry?.handoff_to)
      ? registryEntry.handoff_to
      : [],
  };
}

function normalizeStringArray(value) {
  if (!Array.isArray(value)) {
    return [];
  }
  return value.map((item) => String(item || '').trim()).filter(Boolean);
}

function normalizeFlowArtifactHints(values) {
  return normalizeStringArray(values).map((item) => {
    if (item.includes('/')) {
      return path.basename(item);
    }
    return item;
  });
}

function loadFlowDefinition(targetDir, flowId = DEFAULT_FLOW_ID) {
  const registryEntry = getFlowRuntimeConfig(targetDir, flowId) || {};
  const sourceRel = registryEntry.source || null;
  let frontmatter = {};

  if (sourceRel) {
    const sourceTarget = buildReadableTarget(targetDir, sourceRel);
    if (sourceTarget.exists) {
      frontmatter = parseFrontmatter(fs.readFileSync(sourceTarget.path, 'utf8'));
    }
  }

  const requiredRoles = normalizeStringArray(registryEntry.required_roles || frontmatter.required_roles);
  const approvalGates = normalizeStringArray(registryEntry.approval_gates || frontmatter.approval_gates);
  const requiredArtifacts = normalizeFlowArtifactHints(
    registryEntry.required_artifacts ||
    registryEntry.core_artifacts ||
    frontmatter.artifacts,
  );
  const resolvedRequiredRoles = requiredRoles.length > 0
    ? requiredRoles
    : DEFAULT_FLOW_CONSTRAINTS.required_roles;
  const resolvedApprovalGates = approvalGates.length > 0
    ? approvalGates
    : DEFAULT_FLOW_CONSTRAINTS.approval_gates;
  const resolvedRequiredArtifacts = requiredArtifacts.length > 0
    ? requiredArtifacts
    : DEFAULT_FLOW_CONSTRAINTS.required_artifacts;
  const firstHandoff = registryEntry.first_handoff || resolvedRequiredRoles[0] || null;

  return {
    id: flowId,
    name: registryEntry.name || frontmatter.name || flowId,
    source: sourceRel || null,
    default_schema: registryEntry.default_schema || null,
    artifact_profile: registryEntry.artifact_profile || null,
    required_roles: resolvedRequiredRoles,
    approval_gates: resolvedApprovalGates,
    required_artifacts: resolvedRequiredArtifacts,
    first_handoff: firstHandoff,
    handoff_policy: registryEntry.handoff_policy || `task-orchestrator -> ${resolvedRequiredRoles.join(' -> ')} -> terminal`,
    completion_policy: registryEntry.completion_policy || `${resolvedRequiredArtifacts.join(', ')} 缺一不可`,
  };
}

function resolveRoleOpenSpecSections(targetDir, roleId) {
  const registryEntry = getRoleRuntimeConfig(targetDir, roleId);
  const configured = normalizeStringArray(registryEntry?.openspec_rule_sections);
  if (configured.length > 0) {
    return configured;
  }
  return FALLBACK_ROLE_OPENSPEC_RULE_SECTIONS[roleId] || [];
}

function resolveNextRole(targetDir, flowId, roleId, roleDefinition = null) {
  const transition = getRuntimeTransition(targetDir, flowId, roleId);
  if (transition?.to_role) {
    return transition.to_role;
  }
  return roleDefinition?.handoff_to?.[0] || null;
}

function inferApprovalResumeRoleFromFlow(targetDir, runState, flowDefinition) {
  const currentRole = runState?.current_role || flowDefinition.first_handoff || null;
  if (!currentRole) {
    return null;
  }

  const anchorNextRole = runState?.anchor?.stage?.next_role || null;
  if (anchorNextRole) {
    return anchorNextRole;
  }

  return resolveNextRole(targetDir, flowDefinition.id, currentRole, null);
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
  const actorId = turn.actor?.id || null;
  const deliveryProfile = turn.summary?.delivery_profile || turn.input?.delivery_profile || null;
  const compactUserReport = deliveryProfile === 'micro';
  const allowCodeWrite = actorId === 'frontend-implementer';
  const forbiddenSkills = allowCodeWrite
    ? []
    : ['create-view', 'create-component', 'theme-variables', 'create-route', 'create-api', 'create-store', 'execute-task'];

  const standardUserReportContract = {
    style: 'standard-concise',
    max_lines: 8,
    required_sections: ['交付结论', '验证结果', '残留风险'],
    optional_sections: ['下一步'],
    max_bullets_per_section: 1,
    preferred_sentence_count: 4,
    forbidden_items: [
      '协议推进细节（如 protocol-step / protocol-advance / protocol-update / approve）',
      'scratch JSON、current-run/current-dispatch/current-execution 等运行态文件名',
      '逐条罗列 OpenSpec 文件名',
      '逐条罗列 created/updated 文件清单',
      '过细的实现结构描述或组件内部实现细节',
      '无必要的绝对/相对文件路径',
      '阶段说明（语义）式回放或逐角色完成播报',
      '对内说明、内部注释或实现者自述',
      '默认附加本地执行提示（如 pnpm dev、浏览器打开路径等）',
    ],
  };

  return {
    ...turn,
    commands,
    enforcement: {
      execute_current_command_first: false,
      current_command: null,
      current_command_already_executed: true,
      entry_command: commands.current,
      allowed_actor: actorId,
      auto_continue_same_session: true,
      must_consume_returned_turn: true,
      no_natural_language_handoff: true,
      announce_before_work: turn.announcements?.enter || null,
      announce_after_work: turn.announcements?.exit || null,
      allow_code_write: allowCodeWrite,
      forbidden_before_current_command: [],
      forbidden_skills: forbiddenSkills,
    },
    requires_advance: requiresAdvance,
    finalize_contract: turn.status === 'ready'
      ? {
          required: true,
          advance_command: commands.advance,
          update_command: commands.update,
          when: '完成当前轮次的所有 writes 后，必须先执行 advance，再对用户汇报',
          continue_rule: 'advance 返回后，直接消费返回结果中的 turn；不要 sleep、tail、timeout、cat 日志或重复执行 step/advance',
          user_report: compactUserReport
            ? '微型任务最终摘要改为三句式：交付结论、验证结果、残留风险，各一句；不要写文件路径、实现结构细节或命令名。'
            : '标准任务最终摘要保持简洁：只保留关键结果、验证结果、残留风险，必要时补一句下一步；不要写协议细节、文件路径或长篇实现说明。',
          user_report_contract: compactUserReport
            ? {
                style: 'compact',
                max_lines: 5,
                required_sections: ['交付结论', '验证结果', '残留风险'],
                one_sentence_per_section: true,
                max_bullets_per_section: 1,
                preferred_sentence_count: 3,
                forbidden_items: [
                  '重复转述 checklist.md 内容',
                  '重复转述 iterations.md 内容',
                  '逐条罗列 created/updated 文件',
                  '逐条罗列 OpenSpec 文件名',
                  '任何文件路径',
                  '组件/页面内部实现结构细节',
                  '具体命令名或协议推进细节',
                  '阶段说明（语义）式回放或逐角色完成播报',
                  '默认附加本地执行提示（如 pnpm dev、浏览器打开路径等）',
                ],
              }
            : standardUserReportContract,
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

function selectRoleSkills(targetDir, roleId, skills, deliveryProfile) {
  if (!Array.isArray(skills)) {
    return [];
  }

  if (deliveryProfile !== 'micro') {
    return skills;
  }

  const allowlist = resolveRoleMicroSkillAllowlist(targetDir, roleId);
  if (!Array.isArray(allowlist) || allowlist.length === 0) {
    return skills;
  }

  return skills.filter((item) => allowlist.includes(item?.id || item));
}

function getSourceCandidates(entry, projectProfile, fallbackConfig = null) {
  const configured = entry && typeof entry === 'object'
    ? (entry.sourceByProfile?.[projectProfile] || entry.source || null)
    : null;
  if (configured) {
    return [configured];
  }

  const config = fallbackConfig;
  if (!config) {
    return [];
  }
  return config[projectProfile] || config.default || [];
}

function resolveRoleRuleIds(targetDir, roleId) {
  const registryEntry = getRoleRuntimeConfig(targetDir, roleId);
  const configured = normalizeStringArray(registryEntry?.rule_ids);
  if (configured.length > 0) {
    return configured;
  }
  return FALLBACK_ROLE_RULE_IDS[roleId] || [];
}

function resolveRoleRuleConstraintProfiles(targetDir, roleId, projectProfile) {
  const registryEntry = getRoleRuntimeConfig(targetDir, roleId) || {};
  const configuredProfiles = registryEntry.rule_contract_profiles && typeof registryEntry.rule_contract_profiles === 'object'
    ? registryEntry.rule_contract_profiles
    : {};
  const fallbackProfiles = FALLBACK_ROLE_RULE_CONSTRAINT_PROFILES;

  const configuredDefault = configuredProfiles.default && typeof configuredProfiles.default === 'object'
    ? configuredProfiles.default
    : {};
  const configuredScoped = configuredProfiles[projectProfile] && typeof configuredProfiles[projectProfile] === 'object'
    ? configuredProfiles[projectProfile]
    : {};
  const fallbackDefault = fallbackProfiles.default?.[roleId] || {};
  const fallbackScoped = fallbackProfiles[projectProfile]?.[roleId] || {};

  return {
    default: {
      must_follow: normalizeStringArray(
        configuredDefault.must_follow !== undefined ? configuredDefault.must_follow : fallbackDefault.must_follow,
      ),
      blocked_when: normalizeStringArray(
        configuredDefault.blocked_when !== undefined ? configuredDefault.blocked_when : fallbackDefault.blocked_when,
      ),
    },
    scoped: {
      must_follow: normalizeStringArray(
        configuredScoped.must_follow !== undefined ? configuredScoped.must_follow : fallbackScoped.must_follow,
      ),
      blocked_when: normalizeStringArray(
        configuredScoped.blocked_when !== undefined ? configuredScoped.blocked_when : fallbackScoped.blocked_when,
      ),
    },
  };
}

function buildRoleRuleContract(targetDir, roleId, deliveryProfile, projectProfile, repoConventions) {
  const ruleIds = resolveRoleRuleIds(targetDir, roleId);
  const sourceRules = ruleIds
    .map((ruleId) => {
      const target = buildReadableTargetFromCandidates(
        targetDir,
        getSourceCandidates(
          getRuleRuntimeConfig(targetDir, ruleId),
          projectProfile,
          FALLBACK_RULE_SOURCE_CANDIDATES[ruleId],
        ),
        {
        required: true,
        label: `${roleId} rule: ${ruleId}`,
      },
      );
      if (!target) {
        return null;
      }
      return {
        id: ruleId,
        path: target.rel_path,
        target,
        focus: ruleId,
      };
    })
    .filter(Boolean);

  const resolvedConstraintProfiles = resolveRoleRuleConstraintProfiles(targetDir, roleId, projectProfile);
  const scopedConstraints = resolvedConstraintProfiles.scoped;
  const fallbackConstraints = resolvedConstraintProfiles.default;
  const mustFollow = [
    ...(fallbackConstraints.must_follow || []),
    ...(scopedConstraints.must_follow || []),
  ];
  const blockedWhen = [
    ...(fallbackConstraints.blocked_when || []),
    ...(scopedConstraints.blocked_when || []),
  ];
  const fallbackRepoSpecific = ROLE_RULE_REPO_SPECIFIC.default?.[roleId] || {};
  const scopedRepoSpecific = ROLE_RULE_REPO_SPECIFIC[projectProfile]?.[roleId] || {};
  const repoSpecific = [
    ...((typeof fallbackRepoSpecific.repo_specific === 'function' ? fallbackRepoSpecific.repo_specific(repoConventions) : fallbackRepoSpecific.repo_specific) || []),
    ...((typeof scopedRepoSpecific.repo_specific === 'function' ? scopedRepoSpecific.repo_specific(repoConventions) : scopedRepoSpecific.repo_specific) || []),
  ].filter(Boolean);

  return {
    source_rules: sourceRules.map((item) => ({
      id: item.id,
      path: item.path,
      focus: item.focus,
    })),
    read_targets: sourceRules.map((item) => item.target),
    must_follow: mustFollow,
    repo_specific: repoSpecific,
    blocked_when: blockedWhen,
    profile: projectProfile,
    delivery_profile: deliveryProfile,
  };
}

function buildSkillTarget(targetDir, skillId, projectProfile) {
  const candidates = getSourceCandidates(
    getSkillRuntimeConfig(targetDir, skillId),
    projectProfile,
    FALLBACK_SKILL_SOURCE_CANDIDATES[skillId],
  );
  if (candidates.length === 0) {
    return null;
  }
  return buildReadableTargetFromCandidates(targetDir, candidates, {
    required: true,
    label: `skill: ${skillId}`,
  });
}

function normalizeSkillIds(skills) {
  if (!Array.isArray(skills)) {
    return [];
  }
  return skills
    .map((item) => (typeof item === 'string' ? item : item?.id))
    .filter(Boolean);
}

function resolveRoleSkillPriority(targetDir, roleId, selectedSkills) {
  const registryEntry = getRoleRuntimeConfig(targetDir, roleId);
  const configured = normalizeStringArray(registryEntry?.skill_priority || registryEntry?.preferred_skills);
  if (configured.length > 0) {
    return configured;
  }
  const normalized = normalizeSkillIds(selectedSkills);
  if (normalized.length > 0) {
    return normalized;
  }
  return FALLBACK_ROLE_SKILL_PRIORITY[roleId] || [];
}

function resolveRoleMicroSkillAllowlist(targetDir, roleId) {
  const registryEntry = getRoleRuntimeConfig(targetDir, roleId);
  const configured = normalizeStringArray(registryEntry?.micro_skill_allowlist);
  if (configured.length > 0) {
    return configured;
  }
  return MICRO_ROLE_SKILL_ALLOWLIST[roleId] || [];
}

function choosePrimarySkillIds(targetDir, roleId, selectedSkills, repoConventions, userRequest = null) {
  const ordered = resolveRoleSkillPriority(targetDir, roleId, selectedSkills);
  const selected = new Set(normalizeSkillIds(selectedSkills));
  const requestText = String(userRequest || '');

  return ordered.filter((skillId) => {
    if (!selected.has(skillId)) {
      return false;
    }
    if (skillId === 'create-route') {
      return Boolean(repoConventions.routeEntry || repoConventions.routeModulesDir || /路由|route|页面|page/i.test(requestText));
    }
    if (skillId === 'create-api') {
      return Boolean(repoConventions.apiDir || repoConventions.requestConfig || /接口|api|请求|支付|订单|列表/i.test(requestText));
    }
    if (skillId === 'create-store') {
      return Boolean(repoConventions.storeModulesDir || /store|状态|pinia/i.test(requestText));
    }
    return true;
  }).slice(0, roleId === 'frontend-implementer' ? 4 : 3);
}

function buildRoleSkillContract(targetDir, roleId, selectedSkills, deliveryProfile, projectProfile, repoConventions, userRequest = null) {
  const normalized = normalizeSkillIds(selectedSkills);
  const primaryIds = choosePrimarySkillIds(targetDir, roleId, selectedSkills, repoConventions, userRequest);
  const targetIds = primaryIds.length > 0 ? primaryIds : normalized.slice(0, roleId === 'frontend-implementer' ? 4 : 3);
  const readTargets = targetIds
    .map((id) => buildSkillTarget(targetDir, id, projectProfile))
    .filter(Boolean);

  return {
    selected: normalized.map((id) => {
      const target = buildSkillTarget(targetDir, id, projectProfile);
      return {
        id,
        path: target?.rel_path || null,
        purpose: SKILL_GUIDANCE[id] || null,
        mode: targetIds.includes(id) ? 'primary' : 'secondary',
      };
    }),
    primary_skills: targetIds,
    read_targets: readTargets,
    execution_order: targetIds,
    delivery_profile: deliveryProfile,
    note: '优先按 primary_skills 的顺序阅读并调用技能；其余技能仅在当前实现范围明确需要时再展开。',
  };
}

function buildRuleHints(roleId, deliveryProfile, roleRuleContract = null) {
  const hints = Array.isArray(roleRuleContract?.source_rules)
    ? roleRuleContract.source_rules.map((item) => path.basename(item.path))
    : [];
  if (deliveryProfile === 'micro') {
    return hints.slice(0, 3);
  }
  return hints;
}

function buildOpenSpecGuidance(targetDir, roleId, deliveryProfile) {
  const config = loadOpenSpecRuleSections(targetDir);
  const sectionNames = resolveRoleOpenSpecSections(targetDir, roleId);
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

function buildRepoConventionGuidance(repoConventions) {
  return {
    project_context: repoConventions.projectContextPath || null,
    app_entry: repoConventions.appEntry || null,
    main_entry: repoConventions.mainEntry || null,
    views_dir: repoConventions.viewsDir || null,
    route_entry: repoConventions.routeEntry || null,
    route_modules_dir: repoConventions.routeModulesDir || null,
    api_dir: repoConventions.apiDir || null,
    api_types_dir: repoConventions.apiTypesDir || null,
    request_config: repoConventions.requestConfig || null,
    mock_dir: repoConventions.mockDir || null,
    store_modules_dir: repoConventions.storeModulesDir || null,
    style_entry: repoConventions.styleEntry || null,
  };
}

function buildRoleSpecificContract(
  roleId,
  roleRuleContract,
  roleSkillContract,
  repoConventions,
  deliveryProfile,
  targetDir = null,
  projectContextGuidance = null,
) {
  const base = {
    delivery_profile: deliveryProfile,
    primary_skills: roleSkillContract.primary_skills,
    required_rules: roleRuleContract.source_rules.map((item) => item.path),
    repo_alignment: roleRuleContract.repo_specific,
  };

  if (roleId === 'requirement-analyst') {
    return {
      ...base,
      summary: '先按项目规则把需求收敛成 proposal/tasks，再把高风险缺口转成门禁或待确认项。',
      expected_outputs: ['proposal.md', 'tasks.md'],
      must_resolve: [
        '页面/路由/API/mock/样式落点需和仓库约定一致',
        '能从项目规则与代码推断的信息优先转成 assumptions',
      ],
    };
  }

  if (roleId === 'frontend-implementer') {
    return {
      ...base,
      summary: '按 proposal/tasks 与项目目录、路由、API、样式约定完成实现，不擅自扩 scope。',
      implementation_focus: [
        repoConventions.viewsDir ? `页面落点优先对齐 ${repoConventions.viewsDir}` : '页面落点需与仓库 views 约定一致',
        repoConventions.routeModulesDir ? `路由修改优先对齐 ${repoConventions.routeModulesDir}` : '若新增路由，需先确认路由入口与模块组织方式',
        repoConventions.apiDir ? `接口封装优先对齐 ${repoConventions.apiDir}` : '若涉及真实接口，需先确认 API 封装入口',
      ],
    };
  }

  if (roleId === 'code-guardian') {
    const verificationExpectations = targetDir
      ? buildVerificationExpectations(targetDir, projectContextGuidance)
      : [];
    const evidenceTargets = [
      repoConventions.projectContextPath,
      repoConventions.appEntry,
      repoConventions.mainEntry,
      repoConventions.routeEntry,
      repoConventions.routeModulesDir,
      repoConventions.apiDir,
      repoConventions.apiTypesDir,
      repoConventions.requestConfig,
      repoConventions.mockDir,
      repoConventions.storeModulesDir,
      repoConventions.styleEntry,
    ].filter(Boolean);

    return {
      ...base,
      summary: '按 proposal/tasks 和项目规范核查目录落点、路由/API/样式/Test 合规性，再给交付结论。',
      review_focus: [
        '页面/组件/路由/API/mock/store 是否落到正确目录',
        '实现边界是否仍符合 proposal/tasks 与审批限制',
        '样式是否继续使用主题变量与作用域样式',
      ],
      evidence_targets: evidenceTargets,
      blocking_checks: [
        repoConventions.viewsDir ? `页面或组件是否落在 ${repoConventions.viewsDir} 约定范围` : '页面或组件落点是否符合仓库结构约定',
        repoConventions.routeModulesDir ? `路由是否落在 ${repoConventions.routeModulesDir} 并保持懒加载/meta 约定` : '新增路由是否先补齐路由骨架并符合模块组织方式',
        repoConventions.apiDir ? `接口是否经由 ${repoConventions.apiDir} 封装，页面/组件未直接调 request` : '涉及真实接口时是否先建立统一 API 封装入口',
        repoConventions.styleEntry ? `样式是否沿用 ${repoConventions.styleEntry} 及主题变量，不存在硬编码颜色或全局污染` : '样式是否继续使用主题变量和作用域样式',
        '实现是否越过 proposal/tasks 或审批约束，把演示页扩成生产能力',
      ],
      scope_guard: [
        '只按 proposal/tasks 与已批准范围审查，不接受静默扩 scope',
        '高风险领域未批准的真实支付、敏感采集、风控/权限逻辑必须继续阻断',
        'mock / 占位实现不得伪装成可直接上线的真实交付',
      ],
      verification_expectations: verificationExpectations,
      output_requirements: [
        'checklist.md 需要区分通过、未通过、阻断项与建议放行结论',
        'iterations.md 需要沉淀问题、修正动作、残留风险与下轮提醒',
      ],
    };
  }

  return base;
}

function looksLikeApprovalInput(input) {
  const text = String(input || '').trim();
  if (!text) {
    return false;
  }

  return [
    /同意/,
    /批准/,
    /通过审批/,
    /可以继续/,
    /继续\b/,
    /继续实现/,
    /继续开发/,
    /开始\b/,
    /愿意/,
    /按 proposal 继续/,
    /按提案继续/,
    /审批通过/,
  ].some((pattern) => pattern.test(text));
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

function buildExecutionContract(targetDir, runtimePaths, dispatch, roleDefinition, writes, deliveryProfile) {
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

  const flowId = dispatch.flow?.id || DEFAULT_FLOW_ID;
  const nextRole = resolveNextRole(targetDir, flowId, dispatch.role?.id, roleDefinition);
  if (nextRole) {
    contract.default_next_role = nextRole;
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
  const flowDefinition = loadFlowDefinition(targetDir, DEFAULT_FLOW_ID);
  const riskLevel = inferRiskLevel({
    rawInput: userInput,
    taskType: null,
    deliveryProfile: null,
  });
  const deliveryProfile = inferDeliveryProfile({
    rawInput: userInput,
    taskType: null,
    riskLevel,
    flowId: flowDefinition.id,
  });
  const artifactProfile = inferArtifactProfile({
    deliveryProfile,
  });
  const complexity = inferComplexity({
    deliveryProfile,
    riskLevel,
  });
  const orchestratorGuidance = buildOrchestratorGuidance(targetDir, {
    delivery_profile: deliveryProfile,
    artifact_profile: artifactProfile,
    complexity,
    task: {
      risk_level: riskLevel,
    },
    flow: {
      id: flowDefinition.id,
    },
  }, userInput);

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
      risk_level: riskLevel,
    },
    input: {
      user_request: userInput || null,
    },
    reads: buildCommandTargets(targetDir, START_INSTRUCTION_FILES),
    writes: [
      buildFileTarget(targetDir, runtimePaths.tmpTaskOrchestratorTurn.relPath, {
        required: true,
        label: 'task-orchestrator turn inbox',
      }),
    ],
    expected_output: [
      '输出最小 run-plan JSON',
      `在 run-plan 中明确 delivery_profile=${deliveryProfile} 与 artifact_profile=${artifactProfile}`,
      `写入 ${runtimePaths.tmpTaskOrchestratorTurn.relPath}`,
    ],
    guidance: {
      ...orchestratorGuidance,
      routing: {
        selected_flow: flowDefinition.id,
        delivery_profile: deliveryProfile,
        artifact_profile: artifactProfile,
        complexity,
        risk_level: riskLevel,
        note: riskLevel === 'high'
          ? '当前需求涉及高风险领域：仍按三专家协同推进，但 requirement 阶段后将进入 before-implementation 审批门禁。'
          : deliveryProfile === 'micro'
            ? '当前需求更适合微型交付档位：保留三专家，但产物使用短版 compact 规格。'
            : '当前需求更适合标准交付档位：保留完整门禁与完整 OpenSpec 产物。',
      },
      orchestrator_contract: {
        kind: 'run-plan',
        write_to: runtimePaths.tmpTaskOrchestratorTurn.relPath,
        required_fields: [
          'kind',
          'flow.id',
          'plan.first_handoff',
          'delivery_profile',
          'artifact_profile',
        ],
        allowed_kinds: ['run-plan', 'task-orchestrator-bootstrap'],
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
  const orchestratorGuidance = buildOrchestratorGuidance(
    targetDir,
    currentArtifacts.run,
    currentArtifacts.run?.trigger?.latest_user_input || currentArtifacts.run?.trigger?.raw_input || null,
  );
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
      buildFileTarget(targetDir, runtimePaths.tmpTaskOrchestratorTurn.relPath, {
        required: true,
        label: 'task-orchestrator turn inbox',
      }),
    ],
    expected_output: expectedOutput,
    guidance: {
      ...orchestratorGuidance,
      orchestrator_contract: {
        kind: 'task-orchestrator-runtime-action',
        write_to: runtimePaths.tmpTaskOrchestratorTurn.relPath,
        required_fields: [
          'kind',
          'action',
          'run_id',
        ],
        allowed_actions: ['handoff', 'approve', 'resume', 'gate-blocked', 'complete', 'fail', 'cancel'],
      },
    },
  }), {
    userInput: currentArtifacts.run?.trigger?.latest_user_input || currentArtifacts.run?.trigger?.raw_input || null,
  });
}

function buildApprovalGateTurn(targetDir, status, currentArtifacts) {
  const pendingGate = currentArtifacts.run?.pending_gate || null;
  const flowDefinition = loadFlowDefinition(targetDir, currentArtifacts.run?.flow?.id || DEFAULT_FLOW_ID);
  const orchestratorGuidance = buildOrchestratorGuidance(
    targetDir,
    currentArtifacts.run,
    currentArtifacts.run?.trigger?.latest_user_input || currentArtifacts.run?.trigger?.raw_input || null,
  );
  const resumeRole = pendingGate === 'before-implementation'
    ? inferApprovalResumeRoleFromFlow(targetDir, currentArtifacts.run, flowDefinition)
    : currentArtifacts.run?.current_role || null;
  const blockedReason = pendingGate === 'before-implementation'
    ? '支付/认证/安全/风控等关键约束未获人工确认，当前不能进入实现阶段。'
    : '当前审批门禁尚未解除，流程不能继续推进。';
  const reads = [
    buildFileTarget(targetDir, path.join('.ai-spec', 'current-run.json'), {
      required: true,
      label: 'current run-state',
    }),
  ];

  if (currentArtifacts.run?.artifacts?.proposal) {
    reads.push(buildReadableTarget(targetDir, currentArtifacts.run.artifacts.proposal, {
      label: 'proposal for approval review',
    }));
  }

  if (currentArtifacts.run?.artifacts?.tasks) {
    reads.push(buildReadableTarget(targetDir, currentArtifacts.run.artifacts.tasks, {
      label: 'tasks for approval review',
    }));
  }

  return attachProtocolContracts(attachActorPresentation({
    kind: 'ai-protocol-turn',
    status: 'blocked',
    mode: 'approval-gate',
    actor: {
      id: 'task-orchestrator',
      type: 'orchestrator',
    },
    command: '/spec-continue',
    reason: `run is waiting at approval gate "${pendingGate}"`,
    summary: buildSummary(status, currentArtifacts.run),
    input: {
      user_request: currentArtifacts.run?.trigger?.raw_input || null,
      pending_gate: pendingGate,
      current_role: currentArtifacts.run?.current_role || null,
      delivery_profile: currentArtifacts.run?.delivery_profile || null,
      artifact_profile: currentArtifacts.run?.artifact_profile || null,
    },
    reads: dedupeTargets(reads),
    writes: [],
    expected_output: [
      `当前停在 ${pendingGate}，等待人工确认`,
      '只用简洁摘要告诉用户当前状态、关键原因、下一步',
      `收到明确批准意见后，先记录审批说明，再让用户重新执行 /spec-continue 恢复到 ${resumeRole || '下一位专家'}`,
    ],
    guidance: {
      ...orchestratorGuidance,
      approval_gate: {
        gate: pendingGate,
        status: 'waiting-approval',
        required_user_action: '明确批准或拒绝当前 proposal / tasks 的实现范围与限制条件',
        blocked_rule: '在人工确认前，禁止继续实现或调用 protocol-advance 推进到下一专家',
        blocked_reason: blockedReason,
        resume_to_role: resumeRole,
        resume_rule: `收到明确批准意见后，先执行 turn.commands.update 记录审批说明，再由用户重新执行 /spec-continue 恢复到 ${resumeRole || '下一位专家'}`,
        user_report_contract: {
          style: 'approval-compact',
          max_lines: 4,
          required_sections: ['当前状态', '关键原因', '下一步'],
          one_sentence_per_section: true,
          max_bullets_per_section: 1,
          preferred_sentence_count: 3,
          forbidden_items: [
            '长篇阶段说明',
            '逐条罗列 proposal.md / tasks.md 内容',
            '逐条列现有仓库文件路径',
            '输出交付结论 / 验证结果 / 残留风险三段式',
            '协议执行过程描述',
            '命令行细节或多步操作解释',
            '对内说明、内部注释或实现者自述',
            '任何本地执行提示或额外操作指南',
          ],
        },
      },
    },
  }), {
    userInput: currentArtifacts.run?.trigger?.latest_user_input || currentArtifacts.run?.trigger?.raw_input || null,
  });
}

function buildUpdateReviewTurn(targetDir, status, currentArtifacts) {
  const runtimePaths = resolveRuntimePaths(targetDir);
  const flowDefinition = loadFlowDefinition(targetDir, currentArtifacts.run?.flow?.id || DEFAULT_FLOW_ID);
  const recentUpdates = Array.isArray(currentArtifacts.run?.input_updates)
    ? currentArtifacts.run.input_updates.slice(-3)
    : [];
  const latestInput = currentArtifacts.run?.trigger?.latest_user_input || null;
  const orchestratorGuidance = buildOrchestratorGuidance(targetDir, currentArtifacts.run, latestInput);
  const pendingGate = currentArtifacts.run?.pending_gate || null;
  const approvalIntent = pendingGate ? looksLikeApprovalInput(latestInput) : false;
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
      buildFileTarget(targetDir, runtimePaths.tmpTaskOrchestratorTurn.relPath, {
        required: true,
        label: 'task-orchestrator turn inbox',
      }),
    ],
    expected_output: approvalIntent
      ? [
          '将用户的审批意见吸收到运行态',
          `针对 ${pendingGate} 产出 action=approve 的最小 runtime-action`,
          '审批通过后恢复到下一位可执行专家，而不是继续停在 waiting-approval',
        ]
      : [
          '吸收新的用户输入并更新当前假设、边界或交接策略',
          '若补充输入会影响当前阶段，优先产出最小 runtime-action 或 gate 结论',
          '处理完成后清除 pending_input_update 标记',
    ],
    guidance: {
      ...orchestratorGuidance,
      approval_gate: pendingGate
        ? {
            gate: pendingGate,
      approval_intent_detected: approvalIntent,
      latest_user_input: latestInput,
      resume_to_role: pendingGate === 'before-implementation'
              ? inferApprovalResumeRoleFromFlow(targetDir, currentArtifacts.run, flowDefinition)
              : currentArtifacts.run?.current_role || null,
            next_step: approvalIntent
              ? `生成 action=approve 的 runtime-action，清除 pending_gate，并恢复到 ${
                pendingGate === 'before-implementation'
                  ? (inferApprovalResumeRoleFromFlow(targetDir, currentArtifacts.run, flowDefinition) || '下一位专家')
                  : (currentArtifacts.run?.current_role || '当前角色')
              }`
              : '若未获得明确批准，保持 waiting-approval，不要放行到实现阶段',
          }
        : null,
      orchestrator_contract: {
        write_to: runtimePaths.tmpTaskOrchestratorTurn.relPath,
        allowed_kinds: ['run-plan', 'task-orchestrator-runtime-action'],
      },
    },
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
  const flowId = dispatch.flow?.id || currentArtifacts.run?.flow?.id || DEFAULT_FLOW_ID;
  const deliveryProfile = currentArtifacts.run?.delivery_profile || 'standard';
  const artifactProfile = currentArtifacts.run?.artifact_profile || inferArtifactProfile({
    deliveryProfile,
  });
  const projectProfile = detectProjectProfile(targetDir);
  const repoConventions = collectRepoConventions(targetDir, projectProfile);
  const projectContextGuidance = buildProjectContextGuidance(targetDir, projectProfile, currentArtifacts.run);

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
  const selectedSkills = selectRoleSkills(
    targetDir,
    dispatch.role?.id,
    Array.isArray(dispatch.execution?.skills) && dispatch.execution.skills.length > 0
      ? dispatch.execution.skills
      : roleDefinition.preferred_skills,
    deliveryProfile,
  );
  const roleRuleContract = buildRoleRuleContract(
    targetDir,
    dispatch.role?.id,
    deliveryProfile,
    projectProfile,
    repoConventions,
  );
  const roleSkillContract = buildRoleSkillContract(
    targetDir,
    dispatch.role?.id,
    selectedSkills,
    deliveryProfile,
    projectProfile,
    repoConventions,
    dispatch.task?.raw_goal || currentArtifacts.run?.trigger?.raw_input || null,
  );
  const roleSpecificContract = dispatch.role?.id
    ? buildRoleSpecificContract(
        dispatch.role?.id,
        roleRuleContract,
        roleSkillContract,
        repoConventions,
        deliveryProfile,
        targetDir,
        projectContextGuidance,
      )
    : null;
  const projectContextRead = repoConventions.projectContextPath
    ? buildReadableTarget(targetDir, repoConventions.projectContextPath, {
        label: 'project stable context',
      })
    : null;
  const nextRole = dispatch.execution?.next_role || resolveNextRole(targetDir, flowId, dispatch.role?.id, roleDefinition);
  if (projectContextRead) {
    reads.push(projectContextRead);
  }
  for (const item of roleRuleContract.read_targets) {
    reads.push(item);
  }
  for (const item of roleSkillContract.read_targets) {
    reads.push(item);
  }
  if (dispatch.role?.id === 'code-guardian') {
    for (const item of buildCodeGuardianEvidenceTargets(targetDir, repoConventions)) {
      reads.push(item);
    }
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
      flow_id: flowId,
      current_role: dispatch.execution?.current_role || dispatch.role.id,
      next_role: nextRole,
      delivery_profile: deliveryProfile,
      artifact_profile: artifactProfile,
    },
    preferred_skills: selectedSkills,
    reads: dedupeTargets(reads),
    writes: dedupeTargets(writes),
    expected_output: [...new Set(expectedOutput)],
    execution_contract: buildExecutionContract(targetDir, runtimePaths, dispatch, roleDefinition, writes, deliveryProfile),
    guidance: {
      project_context: projectContextGuidance,
      repo_conventions: buildRepoConventionGuidance(repoConventions),
      role: buildRoleGuidance(dispatch.role?.id, deliveryProfile),
      role_rule_contract: roleRuleContract,
      role_skill_contract: roleSkillContract,
      analysis_contract: dispatch.role?.id === 'requirement-analyst'
        ? roleSpecificContract
        : null,
      implementation_contract: dispatch.role?.id === 'frontend-implementer'
        ? roleSpecificContract
        : null,
      review_contract: dispatch.role?.id === 'code-guardian'
        ? roleSpecificContract
        : null,
      rule_hints: buildRuleHints(dispatch.role?.id, deliveryProfile, roleRuleContract),
      skills: buildSkillGuidance(
        selectedSkills.map((item) => (typeof item === 'string' ? { id: item } : item)),
      ),
      openspec_rules: buildOpenSpecGuidance(targetDir, dispatch.role?.id, deliveryProfile),
    },
    handoff_to: nextRole ? [nextRole] : roleDefinition.handoff_to,
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
    return buildApprovalGateTurn(targetDir, status, currentArtifacts);
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
