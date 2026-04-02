#!/usr/bin/env node
const crypto = require('crypto');
const fs = require('fs');
const path = require('path');

const SUPPORTED_IDES = ['cursor', 'claude', 'opencode', 'trae'];
const DEFAULT_IDES = ['cursor', 'claude'];
const ALL_IDES = [...SUPPORTED_IDES];
const IDE_AUTOLINK_EXCLUDED_SKILLS = new Set(['using-superpowers']);

function printUsage() {
  console.log(`Usage:
  ai-spec sync [target] --manifest <local-manifest.json> [options]

Options:
  --manifest <file>       Local manifest JSON file path
  --profile <profile>     Override profile from manifest (react | vue)
  --ide <preset>          Override ides (default | all | cursor | claude | comma-separated)
  --json                  Print JSON output only
  --dry-run               Resolve only, do not write files
  --force                 Reserved for future conflict handling
  --help                  Show this help
`);
}

function parseArgs(argv) {
  const args = [...argv];
  const options = {
    target: '.',
    json: false,
    pretty: true,
    dryRun: false,
    force: false,
  };

  while (args.length > 0) {
    const arg = args.shift();
    if (!arg.startsWith('-') && options.target === '.') {
      options.target = arg;
      continue;
    }

    switch (arg) {
      case '--manifest':
        options.manifest = args.shift();
        break;
      case '--profile':
        options.profile = args.shift();
        break;
      case '--ide':
        options.ide = args.shift();
        break;
      case '--json':
        options.json = true;
        options.pretty = false;
        break;
      case '--dry-run':
        options.dryRun = true;
        break;
      case '--force':
        options.force = true;
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

function isHttpUrl(value) {
  return /^https?:\/\//i.test(String(value || ''));
}

function getSourceDir() {
  if (process.env.BR_AI_SPEC_LOCAL) {
    return process.env.BR_AI_SPEC_LOCAL;
  }
  return path.join(__dirname, '..');
}

function toPosix(value) {
  return value.split(path.sep).join('/');
}

function targetRel(targetDir, filePath) {
  return toPosix(path.relative(targetDir, filePath));
}

function ensureDir(dirPath) {
  fs.mkdirSync(dirPath, { recursive: true });
}

function shouldExposeSkillToIde(skillId) {
  return !IDE_AUTOLINK_EXCLUDED_SKILLS.has(skillId);
}

function readJsonFile(filePath, label) {
  const raw = fs.readFileSync(filePath, 'utf8');
  try {
    return JSON.parse(raw);
  } catch (error) {
    throw new Error(`${label} is not valid JSON: ${filePath}`);
  }
}

function readRegistryJson(sourceDir, fileName, rootKey) {
  const filePath = path.join(sourceDir, '.agents/registry', fileName);
  if (!fs.existsSync(filePath)) {
    throw new Error(`Registry file not found: ${filePath}`);
  }
  const data = readJsonFile(filePath, `Registry ${fileName}`);
  if (!data || typeof data !== 'object' || !data[rootKey] || typeof data[rootKey] !== 'object') {
    throw new Error(`Registry ${fileName} is missing root key "${rootKey}"`);
  }
  return data[rootKey];
}

function normalizeList(value) {
  if (!value) return [];
  if (Array.isArray(value)) {
    return [...new Set(value.map((item) => String(item).trim()).filter(Boolean))];
  }
  return [...new Set(String(value).split(',').map((item) => item.trim()).filter(Boolean))];
}

function normalizeIdes(value) {
  const raw = typeof value === 'string' ? value.trim() : value;
  if (!raw || (Array.isArray(raw) && raw.length === 0)) {
    return [...DEFAULT_IDES];
  }
  if (raw === 'default') {
    return [...DEFAULT_IDES];
  }
  if (raw === 'all') {
    return [...ALL_IDES];
  }

  const items = normalizeList(raw);
  const unknown = items.filter((item) => !SUPPORTED_IDES.includes(item));
  if (unknown.length > 0) {
    throw new Error(`Unsupported ides: ${unknown.join(', ')}`);
  }
  return items;
}

function walkFiles(rootDir, predicate) {
  const results = [];
  if (!fs.existsSync(rootDir)) {
    return results;
  }
  const stack = [rootDir];
  while (stack.length > 0) {
    const current = stack.pop();
    const entries = fs.readdirSync(current, { withFileTypes: true });
    for (const entry of entries) {
      if (entry.name === '.DS_Store') {
        continue;
      }
      const fullPath = path.join(current, entry.name);
      if (entry.isDirectory()) {
        stack.push(fullPath);
        continue;
      }
      if (!predicate || predicate(fullPath, entry)) {
        results.push(fullPath);
      }
    }
  }
  return results.sort();
}

function readSkillCatalog(sourceDir) {
  const skillRegistry = readRegistryJson(sourceDir, 'skills.json', 'skills');
  const catalog = {
    common: new Map(),
    profiles: {
      react: new Map(),
      vue: new Map(),
    },
    domains: new Map(),
  };

  const skillsRoot = path.join(sourceDir, '.agents/skills');
  const skillFiles = walkFiles(skillsRoot, (filePath) => filePath.endsWith('/SKILL.md'));
  for (const filePath of skillFiles) {
    const rel = toPosix(path.relative(sourceDir, filePath));
    const dirRel = toPosix(path.dirname(rel));
    const id = path.basename(path.dirname(filePath));
    const entry = {
      id,
      sourceDirRel: dirRel,
      sourceFileRel: rel,
      domains: normalizeList(skillRegistry[id]?.domains),
    };

    if (rel.startsWith('.agents/skills/common/')) {
      catalog.common.set(id, entry);
    } else if (rel.startsWith('.agents/skills/profiles/react/')) {
      catalog.profiles.react.set(id, entry);
    } else if (rel.startsWith('.agents/skills/profiles/vue/')) {
      catalog.profiles.vue.set(id, entry);
    } else if (rel.startsWith('.agents/skills/domains/')) {
      catalog.domains.set(id, entry);
    }
  }

  return catalog;
}

function loadSyncRegistry(sourceDir) {
  return {
    roles: readJsonFile(path.join(sourceDir, '.agents/registry/roles.json'), 'Registry roles.json'),
    rules: readRegistryJson(sourceDir, 'rules.json', 'rules'),
    scenarioPackages: readRegistryJson(sourceDir, 'scenario-packages.json', 'scenario_packages'),
    flows: readJsonFile(path.join(sourceDir, '.agents/registry/flows.json'), 'Registry flows.json'),
  };
}

function readRoleCatalog(roleRegistry) {
  const catalog = new Map();
  for (const [id, entry] of Object.entries(roleRegistry.roles || {})) {
    if (!entry || typeof entry !== 'object' || !entry.source) {
      continue;
    }
    catalog.set(id, {
      id,
      name: entry.name || id,
      status: entry.status || 'unknown',
      domains: normalizeList(entry.domains),
      sourceRel: entry.source,
    });
  }
  return catalog;
}

function readFlowCatalog(flowRegistry) {
  const catalog = new Map();
  for (const [id, entry] of Object.entries(flowRegistry.flows || {})) {
    if (!entry || typeof entry !== 'object' || !entry.source) {
      continue;
    }
    catalog.set(id, {
      id,
      name: entry.name || id,
      status: entry.status || 'unknown',
      sourceRel: entry.source,
    });
  }
  return catalog;
}

function resolveSkill(id, profile, catalog) {
  return (
    catalog.profiles[profile]?.get(id) ||
    catalog.common.get(id) ||
    catalog.domains.get(id) ||
    null
  );
}

function resolveRule(id, profile, ruleRegistry) {
  const entry = ruleRegistry[id];
  if (!entry) {
    return null;
  }
  if (entry.sourceByProfile) {
    const source = entry.sourceByProfile[profile];
    if (!source) {
      return null;
    }
    return { id, sourceRel: source, domains: entry.domains || [] };
  }
  return { id, sourceRel: entry.source, domains: entry.domains || [] };
}

function normalizeManifest(rawManifest, existingManifest, options) {
  const manifest = {
    schema_version: Number(rawManifest?.schema_version || existingManifest?.schema_version || 1),
    manifest_type: rawManifest?.manifest_type || existingManifest?.manifest_type || 'hub-install',
    name: rawManifest?.name || existingManifest?.name || null,
    description: rawManifest?.description || existingManifest?.description || null,
    version: rawManifest?.version || existingManifest?.version || null,
    profile: options.profile || rawManifest?.profile || existingManifest?.profile || null,
    ides: normalizeIdes(options.ide || rawManifest?.ides || existingManifest?.ides || 'default'),
    scenario_packages: normalizeList(rawManifest?.scenario_packages || existingManifest?.scenario_packages),
    roles: normalizeList(rawManifest?.roles || existingManifest?.roles),
    skills: normalizeList(rawManifest?.skills || existingManifest?.skills),
    rules: normalizeList(rawManifest?.rules || existingManifest?.rules),
    entry_role: rawManifest?.entry_role || existingManifest?.entry_role || null,
    tags: normalizeList(rawManifest?.tags || existingManifest?.tags),
    constraints: rawManifest?.constraints || existingManifest?.constraints || null,
    notes: normalizeList(rawManifest?.notes || existingManifest?.notes),
    sources: Array.isArray(rawManifest?.sources) ? rawManifest.sources : Array.isArray(existingManifest?.sources) ? existingManifest.sources : [],
  };

  if (!manifest.profile) {
    throw new Error('Manifest is missing profile（技术栈）');
  }
  if (!['react', 'vue'].includes(manifest.profile)) {
    throw new Error(`Unsupported profile: ${manifest.profile}`);
  }

  return manifest;
}

function sha256Json(value) {
  return `sha256:${crypto.createHash('sha256').update(JSON.stringify(value)).digest('hex')}`;
}

function hashDirectory(dirPath) {
  if (!fs.existsSync(dirPath)) {
    return null;
  }
  const hash = crypto.createHash('sha256');
  const files = walkFiles(dirPath, () => true);
  for (const filePath of files) {
    const rel = toPosix(path.relative(dirPath, filePath));
    hash.update(rel);
    hash.update(fs.readFileSync(filePath));
  }
  return hash.digest('hex');
}

function unique(values) {
  return [...new Set(values.filter(Boolean))];
}

function resolveManifest(manifest, catalogs, registry) {
  const warnings = [];
  const roleIds = new Set(manifest.roles);
  const skillIds = new Set(manifest.skills);
  const ruleIds = new Set(manifest.rules);
  const domains = new Set();

  for (const scenarioId of manifest.scenario_packages) {
    const scenario = registry.scenarioPackages[scenarioId];
    if (!scenario) {
      warnings.push(`Unknown scenario_package（场景方案包）: ${scenarioId}`);
      continue;
    }
    for (const roleId of scenario.roles || []) roleIds.add(roleId);
    for (const skillId of scenario.skills || []) skillIds.add(skillId);
    for (const ruleId of scenario.rules || []) ruleIds.add(ruleId);
    for (const domain of scenario.domains || []) domains.add(domain);
  }

  const resolvedRoles = [];
  for (const roleId of roleIds) {
    const entry = catalogs.roles.get(roleId);
    if (!entry) {
      throw new Error(`Unknown role（专家角色） id: ${roleId}`);
    }
    resolvedRoles.push(entry);
    for (const domain of entry.domains || []) domains.add(domain);
  }

  const resolvedSkills = [];
  for (const skillId of skillIds) {
    const entry = resolveSkill(skillId, manifest.profile, catalogs.skills);
    if (!entry) {
      throw new Error(`Unknown skill（技能） id for profile "${manifest.profile}": ${skillId}`);
    }
    resolvedSkills.push(entry);
    for (const domain of entry.domains || []) domains.add(domain);
  }

  const resolvedRules = [];
  for (const ruleId of ruleIds) {
    const entry = resolveRule(ruleId, manifest.profile, registry.rules);
    if (!entry) {
      throw new Error(`Unknown rule（规则） id for profile "${manifest.profile}": ${ruleId}`);
    }
    resolvedRules.push(entry);
    for (const domain of entry.domains || []) domains.add(domain);
  }

  const installedFlows = [...catalogs.flows.values()]
    .filter((entry) => entry.status === 'active')
    .map((entry) => entry.id);

  if (!manifest.entry_role) {
    manifest.entry_role = resolvedRoles.some((entry) => entry.id === 'task-orchestrator')
      ? 'task-orchestrator'
      : resolvedRoles[0]?.id || null;
  }

  if (manifest.entry_role && !resolvedRoles.some((entry) => entry.id === manifest.entry_role)) {
    throw new Error(`entry_role（默认入口角色） is not included in resolved roles: ${manifest.entry_role}`);
  }

  return {
    warnings,
    resolved: {
      domains: unique([...domains]),
      installed_flows: installedFlows,
      roles: resolvedRoles,
      skills: resolvedSkills,
      rules: resolvedRules,
    },
  };
}

function readExistingManifest(targetDir) {
  const manifestPath = path.join(targetDir, '.ai-spec/manifest.json');
  if (!fs.existsSync(manifestPath)) {
    return null;
  }
  return readJsonFile(manifestPath, 'Existing manifest');
}

function writeJsonTracked(targetDir, filePath, value, changes) {
  const content = `${JSON.stringify(value, null, 2)}\n`;
  return writeTextTracked(targetDir, filePath, content, changes);
}

function writeTextTracked(targetDir, filePath, content, changes) {
  ensureDir(path.dirname(filePath));
  const rel = targetRel(targetDir, filePath);
  if (!fs.existsSync(filePath)) {
    fs.writeFileSync(filePath, content, 'utf8');
    changes.created.push(rel);
    return;
  }
  const current = fs.readFileSync(filePath, 'utf8');
  if (current === content) {
    if (!changes.skipped.includes(rel)) {
      changes.skipped.push(rel);
    }
    return;
  }
  fs.writeFileSync(filePath, content, 'utf8');
  changes.updated.push(rel);
}

function copyFileTracked(sourceDir, targetDir, sourceRel, destRel, changes) {
  const sourcePath = path.join(sourceDir, sourceRel);
  const destPath = path.join(targetDir, destRel);
  const content = fs.readFileSync(sourcePath);
  ensureDir(path.dirname(destPath));
  const rel = targetRel(targetDir, destPath);

  if (!fs.existsSync(destPath)) {
    fs.writeFileSync(destPath, content);
    changes.created.push(rel);
    return;
  }

  const current = fs.readFileSync(destPath);
  if (Buffer.compare(current, content) === 0) {
    if (!changes.skipped.includes(rel)) {
      changes.skipped.push(rel);
    }
    return;
  }

  fs.writeFileSync(destPath, content);
  changes.updated.push(rel);
}

function copyDirectoryTracked(sourceDir, targetDir, sourceDirRel, destDirRel, changes) {
  const sourcePath = path.join(sourceDir, sourceDirRel);
  const destPath = path.join(targetDir, destDirRel);
  const existsBefore = fs.existsSync(destPath);
  const sourceHash = hashDirectory(sourcePath);
  const destHash = existsBefore ? hashDirectory(destPath) : null;
  const rel = targetRel(targetDir, destPath);

  if (existsBefore && sourceHash && destHash && sourceHash === destHash) {
    if (!changes.skipped.includes(rel)) {
      changes.skipped.push(rel);
    }
    return;
  }

  ensureDir(destPath);
  const files = walkFiles(sourcePath, () => true);
  for (const filePath of files) {
    const relInsideDir = path.relative(sourcePath, filePath);
    const destFile = path.join(destPath, relInsideDir);
    const sourceBuffer = fs.readFileSync(filePath);
    ensureDir(path.dirname(destFile));
    fs.writeFileSync(destFile, sourceBuffer);
  }
  if (existsBefore) {
    if (!changes.updated.includes(rel)) {
      changes.updated.push(rel);
    }
  } else {
    if (!changes.created.includes(rel)) {
      changes.created.push(rel);
    }
  }
}

function ensureSymlinkTracked(targetDir, linkPath, linkTarget, changes) {
  ensureDir(path.dirname(linkPath));
  const rel = targetRel(targetDir, linkPath);
  let existedBefore = false;

  try {
    const stat = fs.lstatSync(linkPath);
    existedBefore = true;
    if (stat.isSymbolicLink()) {
      const currentTarget = fs.readlinkSync(linkPath);
      if (currentTarget === linkTarget) {
        if (!changes.skipped.includes(rel)) {
          changes.skipped.push(rel);
        }
        return;
      }
      fs.unlinkSync(linkPath);
    } else {
      fs.rmSync(linkPath, { recursive: true, force: true });
    }
  } catch (error) {
    existedBefore = false;
  }

  fs.symlinkSync(linkTarget, linkPath);
  if (existedBefore) {
    if (!changes.updated.includes(rel)) {
      changes.updated.push(rel);
    }
  } else {
    if (!changes.created.includes(rel)) {
      changes.created.push(rel);
    }
  }
}

function removePathTracked(targetDir, targetPath, changes) {
  const rel = targetRel(targetDir, targetPath);
  try {
    const stat = fs.lstatSync(targetPath);
    if (stat.isSymbolicLink()) {
      fs.unlinkSync(targetPath);
    } else {
      fs.rmSync(targetPath, { recursive: true, force: true });
    }
    if (!changes.updated.includes(rel) && !changes.created.includes(rel)) {
      changes.updated.push(rel);
    }
  } catch (error) {
    // Already absent; nothing to do.
  }
}

function installRoles(sourceDir, targetDir, resolvedRoles, roleRegistry, changes) {
  for (const supportFile of roleRegistry.support_files || []) {
    copyFileTracked(sourceDir, targetDir, supportFile, supportFile, changes);
  }

  const copiedDomainReadmes = new Set();
  for (const role of resolvedRoles) {
    copyFileTracked(sourceDir, targetDir, role.sourceRel, role.sourceRel, changes);
    const domainReadme = role.sourceRel.match(/^\.agents\/roles\/domains\/([^/]+)\//);
    if (domainReadme) {
      const domainReadmeRel = `.agents/roles/domains/${domainReadme[1]}/README.md`;
      if (!copiedDomainReadmes.has(domainReadmeRel) && fs.existsSync(path.join(sourceDir, domainReadmeRel))) {
        copyFileTracked(sourceDir, targetDir, domainReadmeRel, domainReadmeRel, changes);
        copiedDomainReadmes.add(domainReadmeRel);
      }
    }
  }
}

function installSkills(sourceDir, targetDir, resolvedSkills, changes) {
  copyFileTracked(sourceDir, targetDir, '.agents/skills/README.md', '.agents/skills/README.md', changes);
  for (const skill of resolvedSkills) {
    copyDirectoryTracked(sourceDir, targetDir, skill.sourceDirRel, `.agents/skills/${skill.id}`, changes);
  }
}

function installRules(sourceDir, targetDir, resolvedRules, changes) {
  copyFileTracked(sourceDir, targetDir, '.agents/rules/README.md', '.agents/rules/README.md', changes);
  for (const rule of resolvedRules) {
    const destRel = `.agents/rules/${path.basename(rule.sourceRel)}`;
    copyFileTracked(sourceDir, targetDir, rule.sourceRel, destRel, changes);
  }
}

function installFlows(sourceDir, targetDir, catalogs, flowRegistry, changes) {
  for (const supportFile of flowRegistry.support_files || []) {
    copyFileTracked(sourceDir, targetDir, supportFile, supportFile, changes);
  }
  for (const flow of catalogs.flows.values()) {
    copyFileTracked(sourceDir, targetDir, flow.sourceRel, flow.sourceRel, changes);
  }
}

function installIdeAssets(sourceDir, targetDir, ides, resolvedSkills, changes) {
  const commandsDir = path.join(sourceDir, '.agents/commands/common');
  const commandFiles = fs.existsSync(commandsDir)
    ? fs.readdirSync(commandsDir).filter((name) => name.endsWith('.md')).sort()
    : [];

  for (const ide of ides) {
    const ideDir = path.join(targetDir, `.${ide}`);
    ensureDir(ideDir);
    ensureSymlinkTracked(targetDir, path.join(ideDir, 'rules'), '../.agents/rules', changes);
    ensureDir(path.join(ideDir, 'skills'));

    for (const skill of resolvedSkills) {
      const linkPath = path.join(ideDir, 'skills', skill.id);
      if (!shouldExposeSkillToIde(skill.id)) {
        removePathTracked(targetDir, linkPath, changes);
        continue;
      }
      const linkTarget = `../../.agents/skills/${skill.id}`;
      ensureSymlinkTracked(targetDir, linkPath, linkTarget, changes);
    }

    for (const fileName of commandFiles) {
      copyFileTracked(sourceDir, targetDir, `.agents/commands/common/${fileName}`, `.${ide}/commands/${fileName}`, changes);
    }

    if (ide === 'cursor') {
      const sourceMcp = path.join(sourceDir, '.cursor/mcp.json');
      if (fs.existsSync(sourceMcp)) {
        copyFileTracked(sourceDir, targetDir, '.cursor/mcp.json', '.cursor/mcp.json', changes);
      }
    }
  }
}

function buildLock(manifest, targetDir, manifestSource, resolved, cliVersion) {
  return {
    schema_version: 1,
    lock_type: 'local-install-lock',
    generated_at: new Date().toISOString(),
    target: {
      path: targetRel(targetDir, targetDir) || '.',
      profile: manifest.profile,
      ides: manifest.ides,
    },
    source: {
      manifest: manifestSource,
      manifest_type: manifest.manifest_type,
    },
    request: {
      scenario_packages: manifest.scenario_packages,
      roles: manifest.roles,
      skills: manifest.skills,
      rules: manifest.rules,
    },
    resolved: {
      domains: resolved.domains,
      installed_flows: resolved.installed_flows,
      roles: resolved.roles.map((item) => item.id),
      skills: resolved.skills.map((item) => item.id),
      rules: resolved.rules.map((item) => item.id),
    },
    assets: {
      roles: resolved.roles.map((item) => ({ id: item.id, version: 'workspace' })),
      skills: resolved.skills.map((item) => ({ id: item.id, version: 'workspace' })),
      rules: resolved.rules.map((item) => ({ id: item.id, version: 'workspace' })),
      flows: resolved.installed_flows.map((id) => ({ id, version: 'workspace' })),
    },
    installer: {
      command: 'ai-spec sync',
      cli_version: cliVersion,
      mode: 'normal',
    },
    integrity: {
      manifest_hash: sha256Json(manifest),
      resolved_hash: sha256Json({
        domains: resolved.domains,
        installed_flows: resolved.installed_flows,
        roles: resolved.roles.map((item) => item.id),
        skills: resolved.skills.map((item) => item.id),
        rules: resolved.rules.map((item) => item.id),
      }),
    },
    status: 'success',
  };
}

function buildSources(manifest, manifestSource, resolved, sourceDir) {
  const assets = [];

  for (const role of resolved.roles) {
    assets.push({
      kind: 'role',
      id: role.id,
      source_type: 'local',
      source_ref: `local://${role.sourceRel}`,
      local_path: role.sourceRel,
    });
  }

  for (const skill of resolved.skills) {
    assets.push({
      kind: 'skill',
      id: skill.id,
      source_type: 'local',
      source_ref: `local://${skill.sourceDirRel}`,
      local_path: `.agents/skills/${skill.id}`,
    });
  }

  for (const rule of resolved.rules) {
    assets.push({
      kind: 'rule',
      id: rule.id,
      source_type: 'local',
      source_ref: `local://${rule.sourceRel}`,
      local_path: `.agents/rules/${path.basename(rule.sourceRel)}`,
    });
  }

  for (const flowId of resolved.installed_flows) {
    assets.push({
      kind: 'flow',
      id: flowId,
      source_type: 'local',
      source_ref: `local://.agents/flows/common/${flowId}.md`,
      local_path: `.agents/flows/common/${flowId}.md`,
    });
  }

  return {
    schema_version: 1,
    sources_type: 'local-install-sources',
    generated_at: new Date().toISOString(),
    manifest: {
      type: manifest.manifest_type,
      source: manifestSource,
    },
    registries: [
      {
        type: 'local-workspace',
        name: 'br-ai-spec-local',
        path: sourceDir,
      },
    ],
    assets,
  };
}

function printPretty(result, isDryRun) {
  const noun = isDryRun ? 'sync-plan（同步计划）' : 'sync-result（同步结果）';
  console.log(`${noun}: ${result.status}`);
  console.log(`target（目标项目）: ${result.target.path}`);
  console.log(`profile（技术栈）: ${result.target.profile}`);
  console.log(`ides（IDE 列表）: ${result.target.ides.join(', ')}`);
  console.log(`roles（专家角色）: ${result.resolved.roles.join(', ') || '(none)'}`);
  console.log(`skills（技能）: ${result.resolved.skills.join(', ') || '(none)'}`);
  console.log(`rules（规则）: ${result.resolved.rules.join(', ') || '(none)'}`);
  console.log(`domains（能力域）: ${result.resolved.domains.join(', ') || '(none)'}`);
  if (Array.isArray(result.resolved.installed_flows)) {
    console.log(`installed_flows（已安装流程模板）: ${result.resolved.installed_flows.join(', ') || '(none)'}`);
  }
  if (result.changes) {
    console.log(`created（新建）: ${result.changes.created.length}`);
    console.log(`updated（更新）: ${result.changes.updated.length}`);
    console.log(`skipped（跳过）: ${result.changes.skipped.length}`);
    console.log(`conflicts（冲突）: ${result.changes.conflicts.length}`);
  }
  if (result.warnings.length > 0) {
    console.log(`warnings（警告）:`);
    for (const warning of result.warnings) {
      console.log(`- ${warning}`);
    }
  }
  if (result.errors.length > 0) {
    console.log(`errors（错误）:`);
    for (const error of result.errors) {
      console.log(`- ${error}`);
    }
  }
}

function buildPlan(targetDir, manifestSource, manifest, resolvedResult) {
  return {
    schema_version: 1,
    kind: 'sync-plan',
    status: 'planned',
    target: {
      path: targetDir,
      profile: manifest.profile,
      ides: manifest.ides,
    },
    source: {
      manifest: manifestSource,
      manifest_type: manifest.manifest_type,
    },
    request: {
      scenario_packages: manifest.scenario_packages,
      roles: manifest.roles,
      skills: manifest.skills,
      rules: manifest.rules,
    },
    resolved: {
      domains: resolvedResult.resolved.domains,
      installed_flows: resolvedResult.resolved.installed_flows,
      roles: resolvedResult.resolved.roles.map((item) => item.id),
      skills: resolvedResult.resolved.skills.map((item) => item.id),
      rules: resolvedResult.resolved.rules.map((item) => item.id),
    },
    warnings: resolvedResult.warnings,
    errors: [],
  };
}

function dedupeChanges(changes) {
  return {
    created: unique(changes.created),
    updated: unique(changes.updated.filter((item) => !changes.created.includes(item))),
    skipped: unique(changes.skipped.filter((item) => !changes.created.includes(item) && !changes.updated.includes(item))),
    conflicts: unique(changes.conflicts),
  };
}

function main(argv) {
  try {
    const options = parseArgs(argv);
    if (options.help) {
      printUsage();
      return 0;
    }

    const sourceDir = getSourceDir();
    const registryValidation = require('./validate-registry').validateRegistry(sourceDir);
    if (registryValidation.status !== 'success') {
      throw new Error(`Registry validation failed with ${registryValidation.errors.length} error(s). Run "ai-spec validate-registry" for details.`);
    }
    const targetDir = path.resolve(options.target || '.');
    const cliVersion = require(path.join(sourceDir, 'package.json')).version || '0.0.0';

    const manifestInput = options.manifest
      ? options.manifest
      : path.join(targetDir, '.ai-spec/manifest.json');

    if (!manifestInput) {
      throw new Error('sync（同步） requires --manifest（安装清单） or an existing .ai-spec/manifest.json');
    }

    if (isHttpUrl(manifestInput)) {
      throw new Error(`Remote manifest URL is not supported yet in current sync（同步） implementation: ${manifestInput}`);
    }

    const manifestPath = path.resolve(manifestInput);
    if (!fs.existsSync(manifestPath)) {
      throw new Error(`Manifest file not found: ${manifestPath}`);
    }

    const rawManifest = readJsonFile(manifestPath, 'Manifest');
    const existingManifest = readExistingManifest(targetDir);
    const manifest = normalizeManifest(rawManifest, existingManifest, options);
    const registry = loadSyncRegistry(sourceDir);
    const catalogs = {
      roles: readRoleCatalog(registry.roles),
      skills: readSkillCatalog(sourceDir),
      flows: readFlowCatalog(registry.flows),
    };
    const resolvedResult = resolveManifest(manifest, catalogs, registry);

    const plan = buildPlan(targetDir, manifestPath, manifest, resolvedResult);
    if (options.dryRun) {
      if (options.json) {
        process.stdout.write(`${JSON.stringify(plan, null, 2)}\n`);
      } else {
        printPretty(plan, true);
      }
      return 0;
    }

    const changes = {
      created: [],
      updated: [],
      skipped: [],
      conflicts: [],
    };

    installRoles(sourceDir, targetDir, resolvedResult.resolved.roles, registry.roles, changes);
    installSkills(sourceDir, targetDir, resolvedResult.resolved.skills, changes);
    installRules(sourceDir, targetDir, resolvedResult.resolved.rules, changes);
    installFlows(sourceDir, targetDir, catalogs, registry.flows, changes);
    installIdeAssets(sourceDir, targetDir, manifest.ides, resolvedResult.resolved.skills, changes);

    const aiSpecDir = path.join(targetDir, '.ai-spec');
    ensureDir(aiSpecDir);

    const manifestOutPath = path.join(aiSpecDir, 'manifest.json');
    const lockOutPath = path.join(aiSpecDir, 'lock.json');
    const sourcesOutPath = path.join(aiSpecDir, 'sources.json');

    writeJsonTracked(targetDir, manifestOutPath, manifest, changes);
    const lock = buildLock(manifest, targetDir, manifestPath, resolvedResult.resolved, cliVersion);
    writeJsonTracked(targetDir, lockOutPath, lock, changes);
    const sources = buildSources(manifest, manifestPath, resolvedResult.resolved, sourceDir);
    writeJsonTracked(targetDir, sourcesOutPath, sources, changes);
    const normalizedChanges = dedupeChanges(changes);

    const result = {
      schema_version: 1,
      kind: 'sync-result',
      status: 'success',
      target: {
        path: targetDir,
        profile: manifest.profile,
        ides: manifest.ides,
      },
      source: {
        manifest: manifestPath,
        manifest_type: manifest.manifest_type,
      },
      request: {
        scenario_packages: manifest.scenario_packages,
        roles: manifest.roles,
        skills: manifest.skills,
        rules: manifest.rules,
      },
      resolved: {
        domains: resolvedResult.resolved.domains,
        installed_flows: resolvedResult.resolved.installed_flows,
        roles: resolvedResult.resolved.roles.map((item) => item.id),
        skills: resolvedResult.resolved.skills.map((item) => item.id),
        rules: resolvedResult.resolved.rules.map((item) => item.id),
      },
      changes: normalizedChanges,
      artifacts: {
        manifest: '.ai-spec/manifest.json',
        lock: '.ai-spec/lock.json',
        sources: '.ai-spec/sources.json',
      },
      warnings: resolvedResult.warnings,
      errors: [],
    };

    if (options.json) {
      process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
    } else {
      printPretty(result, false);
    }

    return 0;
  } catch (error) {
    console.error(`sync（同步） failed: ${error.message}`);
    return 1;
  }
}

module.exports = { main };

if (require.main === module) {
  process.exit(main(process.argv.slice(2)));
}
