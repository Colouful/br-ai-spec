#!/usr/bin/env node
const fs = require('fs');
const path = require('path');

function printUsage() {
  console.log(`Usage:
  ai-spec validate-registry [options]

Options:
  --source <dir>          Source workspace root (default: current package)
  --json                  Print JSON result only
  --help                  Show this help
`);
}

function parseArgs(argv) {
  const args = [...argv];
  const options = {
    json: false,
    pretty: true,
    source: null,
  };

  while (args.length > 0) {
    const arg = args.shift();
    switch (arg) {
      case '--source':
        options.source = args.shift();
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

function getSourceDir(explicitSource) {
  if (explicitSource) {
    return path.resolve(explicitSource);
  }
  if (process.env.BR_AI_SPEC_LOCAL) {
    return process.env.BR_AI_SPEC_LOCAL;
  }
  return path.join(__dirname, '..');
}

function readJsonFile(filePath, label) {
  const raw = fs.readFileSync(filePath, 'utf8');
  try {
    return JSON.parse(raw);
  } catch (error) {
    throw new Error(`${label} is not valid JSON: ${filePath}`);
  }
}

function normalizeList(value) {
  if (!value) return [];
  if (Array.isArray(value)) {
    return value.map((item) => String(item).trim()).filter(Boolean);
  }
  return [];
}

function fileExists(sourceDir, relPath) {
  return fs.existsSync(path.join(sourceDir, relPath));
}

function assertArrayOfStrings(report, value, label) {
  if (!Array.isArray(value)) {
    report.errors.push(`${label} must be an array`);
    return [];
  }
  const invalid = value.filter((item) => typeof item !== 'string' || !item.trim());
  if (invalid.length > 0) {
    report.errors.push(`${label} must contain non-empty string items`);
  }
  return value;
}

function validateRulesRegistry(sourceDir, rulesRegistry, report) {
  if (typeof rulesRegistry.version !== 'number') {
    report.errors.push('rules.json version must be a number');
  }
  if (!rulesRegistry.rules || typeof rulesRegistry.rules !== 'object') {
    report.errors.push('rules.json is missing "rules" object');
    return new Set();
  }

  const ruleIds = new Set();
  for (const [ruleId, entry] of Object.entries(rulesRegistry.rules)) {
    ruleIds.add(ruleId);
    if (!entry || typeof entry !== 'object') {
      report.errors.push(`rules.json entry "${ruleId}" must be an object`);
      continue;
    }
    const hasSource = typeof entry.source === 'string';
    const hasSourceByProfile = entry.sourceByProfile && typeof entry.sourceByProfile === 'object';
    if (!hasSource && !hasSourceByProfile) {
      report.errors.push(`rules.json entry "${ruleId}" must define source or sourceByProfile`);
    }
    if (hasSource && !fileExists(sourceDir, entry.source)) {
      report.errors.push(`rules.json entry "${ruleId}" references missing source: ${entry.source}`);
    }
    if (hasSourceByProfile) {
      for (const [profile, relPath] of Object.entries(entry.sourceByProfile)) {
        if (!['react', 'vue'].includes(profile)) {
          report.errors.push(`rules.json entry "${ruleId}" has unsupported profile key: ${profile}`);
        }
        if (typeof relPath !== 'string' || !relPath.trim()) {
          report.errors.push(`rules.json entry "${ruleId}" sourceByProfile.${profile} must be a non-empty string`);
          continue;
        }
        if (!fileExists(sourceDir, relPath)) {
          report.errors.push(`rules.json entry "${ruleId}" references missing profile source: ${relPath}`);
        }
      }
    }
    if (entry.domains !== undefined) {
      assertArrayOfStrings(report, entry.domains, `rules.json entry "${ruleId}" domains`);
    }
  }

  return ruleIds;
}

function validateSkillsRegistry(skillsRegistry, report) {
  if (typeof skillsRegistry.version !== 'number') {
    report.errors.push('skills.json version must be a number');
  }
  if (!skillsRegistry.skills || typeof skillsRegistry.skills !== 'object') {
    report.errors.push('skills.json is missing "skills" object');
    return new Set();
  }

  const skillIds = new Set();
  for (const [skillId, entry] of Object.entries(skillsRegistry.skills)) {
    skillIds.add(skillId);
    if (!entry || typeof entry !== 'object') {
      report.errors.push(`skills.json entry "${skillId}" must be an object`);
      continue;
    }
    if (entry.domains !== undefined) {
      assertArrayOfStrings(report, entry.domains, `skills.json entry "${skillId}" domains`);
    }
  }

  return skillIds;
}

function validateRolesRegistry(sourceDir, rolesRegistry, report) {
  if (typeof rolesRegistry.version !== 'number') {
    report.errors.push('roles.json version must be a number');
  }
  if (rolesRegistry.support_files !== undefined) {
    const supportFiles = assertArrayOfStrings(report, rolesRegistry.support_files, 'roles.json support_files');
    for (const relPath of supportFiles) {
      if (!fileExists(sourceDir, relPath)) {
        report.errors.push(`roles.json support file is missing: ${relPath}`);
      }
    }
  }
  if (!rolesRegistry.roles || typeof rolesRegistry.roles !== 'object') {
    report.errors.push('roles.json is missing "roles" object');
    return new Set();
  }

  const roleIds = new Set();
  for (const [roleId, entry] of Object.entries(rolesRegistry.roles)) {
    roleIds.add(roleId);
    if (!entry || typeof entry !== 'object') {
      report.errors.push(`roles.json entry "${roleId}" must be an object`);
      continue;
    }
    if (typeof entry.source !== 'string' || !entry.source.trim()) {
      report.errors.push(`roles.json entry "${roleId}" must define source`);
    } else if (!fileExists(sourceDir, entry.source)) {
      report.errors.push(`roles.json entry "${roleId}" references missing source: ${entry.source}`);
    }
    if (entry.domains !== undefined) {
      assertArrayOfStrings(report, entry.domains, `roles.json entry "${roleId}" domains`);
    }
  }

  return roleIds;
}

function validateFlowsRegistry(sourceDir, flowsRegistry, report) {
  if (typeof flowsRegistry.version !== 'number') {
    report.errors.push('flows.json version must be a number');
  }
  if (flowsRegistry.support_files !== undefined) {
    const supportFiles = assertArrayOfStrings(report, flowsRegistry.support_files, 'flows.json support_files');
    for (const relPath of supportFiles) {
      if (!fileExists(sourceDir, relPath)) {
        report.errors.push(`flows.json support file is missing: ${relPath}`);
      }
    }
  }
  if (!flowsRegistry.flows || typeof flowsRegistry.flows !== 'object') {
    report.errors.push('flows.json is missing "flows" object');
    return new Set();
  }

  const flowIds = new Set();
  for (const [flowId, entry] of Object.entries(flowsRegistry.flows)) {
    flowIds.add(flowId);
    if (!entry || typeof entry !== 'object') {
      report.errors.push(`flows.json entry "${flowId}" must be an object`);
      continue;
    }
    if (typeof entry.source !== 'string' || !entry.source.trim()) {
      report.errors.push(`flows.json entry "${flowId}" must define source`);
    } else if (!fileExists(sourceDir, entry.source)) {
      report.errors.push(`flows.json entry "${flowId}" references missing source: ${entry.source}`);
    }
  }

  return flowIds;
}

function validateScenarioPackagesRegistry(scenariosRegistry, report, ids) {
  if (typeof scenariosRegistry.version !== 'number') {
    report.errors.push('scenario-packages.json version must be a number');
  }
  if (!scenariosRegistry.scenario_packages || typeof scenariosRegistry.scenario_packages !== 'object') {
    report.errors.push('scenario-packages.json is missing "scenario_packages" object');
    return;
  }

  for (const [scenarioId, entry] of Object.entries(scenariosRegistry.scenario_packages)) {
    if (!entry || typeof entry !== 'object') {
      report.errors.push(`scenario-packages.json entry "${scenarioId}" must be an object`);
      continue;
    }

    const roles = assertArrayOfStrings(report, entry.roles || [], `scenario-packages.json entry "${scenarioId}" roles`);
    const skills = assertArrayOfStrings(report, entry.skills || [], `scenario-packages.json entry "${scenarioId}" skills`);
    const rules = assertArrayOfStrings(report, entry.rules || [], `scenario-packages.json entry "${scenarioId}" rules`);
    if (entry.domains !== undefined) {
      assertArrayOfStrings(report, entry.domains, `scenario-packages.json entry "${scenarioId}" domains`);
    }

    for (const roleId of roles) {
      if (!ids.roles.has(roleId)) {
        report.errors.push(`scenario-packages.json entry "${scenarioId}" references unknown role: ${roleId}`);
      }
    }
    for (const skillId of skills) {
      if (!ids.skills.has(skillId)) {
        report.errors.push(`scenario-packages.json entry "${scenarioId}" references unknown skill: ${skillId}`);
      }
    }
    for (const ruleId of rules) {
      if (!ids.rules.has(ruleId)) {
        report.errors.push(`scenario-packages.json entry "${scenarioId}" references unknown rule: ${ruleId}`);
      }
    }
  }
}

function validateRegistry(sourceDir) {
  const report = {
    schema_version: 1,
    kind: 'registry-validation-result',
    status: 'success',
    source: sourceDir,
    checked_files: [],
    warnings: [],
    errors: [],
  };

  const registryDir = path.join(sourceDir, '.agents/registry');
  if (!fs.existsSync(registryDir)) {
    report.errors.push(`Registry directory not found: ${registryDir}`);
    report.status = 'failed';
    return report;
  }

  const rulesPath = path.join(registryDir, 'rules.json');
  const skillsPath = path.join(registryDir, 'skills.json');
  const rolesPath = path.join(registryDir, 'roles.json');
  const flowsPath = path.join(registryDir, 'flows.json');
  const scenariosPath = path.join(registryDir, 'scenario-packages.json');

  const rulesRegistry = readJsonFile(rulesPath, 'rules.json');
  const skillsRegistry = readJsonFile(skillsPath, 'skills.json');
  const rolesRegistry = readJsonFile(rolesPath, 'roles.json');
  const flowsRegistry = readJsonFile(flowsPath, 'flows.json');
  const scenariosRegistry = readJsonFile(scenariosPath, 'scenario-packages.json');

  report.checked_files.push(
    '.agents/registry/rules.json',
    '.agents/registry/skills.json',
    '.agents/registry/roles.json',
    '.agents/registry/flows.json',
    '.agents/registry/scenario-packages.json'
  );

  const ruleIds = validateRulesRegistry(sourceDir, rulesRegistry, report);
  const skillIds = validateSkillsRegistry(skillsRegistry, report);
  const roleIds = validateRolesRegistry(sourceDir, rolesRegistry, report);
  const flowIds = validateFlowsRegistry(sourceDir, flowsRegistry, report);
  validateScenarioPackagesRegistry(scenariosRegistry, report, {
    roles: roleIds,
    skills: skillIds,
    rules: ruleIds,
    flows: flowIds,
  });

  if (report.errors.length > 0) {
    report.status = 'failed';
  }

  report.summary = {
    rule_count: ruleIds.size,
    skill_count: skillIds.size,
    role_count: roleIds.size,
    flow_count: flowIds.size,
    scenario_package_count: Object.keys(scenariosRegistry.scenario_packages || {}).length,
  };

  return report;
}

function printPretty(report) {
  console.log(`registry-validation（注册表校验）: ${report.status}`);
  console.log(`source（源码目录）: ${report.source}`);
  if (report.summary) {
    console.log(`rules（规则）: ${report.summary.rule_count}`);
    console.log(`skills（技能）: ${report.summary.skill_count}`);
    console.log(`roles（专家角色）: ${report.summary.role_count}`);
    console.log(`flows（流程模板）: ${report.summary.flow_count}`);
    console.log(`scenario_packages（场景方案包）: ${report.summary.scenario_package_count}`);
  }
  if (report.warnings.length > 0) {
    console.log('warnings（警告）:');
    for (const warning of report.warnings) {
      console.log(`- ${warning}`);
    }
  }
  if (report.errors.length > 0) {
    console.log('errors（错误）:');
    for (const error of report.errors) {
      console.log(`- ${error}`);
    }
  }
}

function main(argv) {
  try {
    const options = parseArgs(argv);
    if (options.help) {
      printUsage();
      return 0;
    }

    const sourceDir = getSourceDir(options.source);
    const report = validateRegistry(sourceDir);

    if (options.json) {
      process.stdout.write(`${JSON.stringify(report, null, 2)}\n`);
    } else {
      printPretty(report);
    }

    return report.status === 'success' ? 0 : 1;
  } catch (error) {
    console.error(`validate-registry（校验注册表） failed: ${error.message}`);
    return 1;
  }
}

module.exports = {
  validateRegistry,
  main,
};

if (require.main === module) {
  process.exit(main(process.argv.slice(2)));
}
