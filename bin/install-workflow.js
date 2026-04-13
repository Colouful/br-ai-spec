#!/usr/bin/env node
const fs = require('fs');
const os = require('os');
const path = require('path');
const { spawnSync } = require('child_process');
const readline = require('readline/promises');
const {
  readProfilesRegistry,
  resolveProfileId,
  getProfileEntries,
  formatSupportedProfiles,
} = require('./profile-registry');

const PKG_ROOT = path.join(__dirname, '..');
const VERSION = '2.0.0';
const DEFAULT_PROFILE = 'vue';
const DEFAULT_LEVEL = 'L3';
const DEFAULT_IDE_FILTER = 'default';
const DEFAULT_IDES = ['cursor', 'claude'];
const ALL_IDES = ['claude', 'cursor', 'opencode', 'trae'];
const IDE_AUTOLINK_EXCLUDED_SKILLS = new Set(['using-superpowers']);
const PROJECT_SPECIFIC_RULES = new Set(['01-项目概述.md', '03-项目结构.md']);
const CUSTOMIZABLE_RULES = [
  ['01-项目概述.md', '项目定位、技术栈、业务边界、关键约束'],
  ['03-项目结构.md', '目录树、分层设计、模块职责、组织约定'],
  ['04-组件规范.md', 'SFC 结构、Props/Emits、组件目录、拆分策略'],
  ['05-API规范.md', '接口目录、请求封装、命名约定、错误处理'],
  ['06-路由规范.md', '路由配置、懒加载、导航守卫、目录结构'],
  ['07-状态管理.md', 'Store 目录、模块划分、命名约定'],
  ['09-样式规范.md', 'CSS Modules/Scoped、主题变量、全局样式'],
];
const PROFILE_SUMMARIES = {
  vue: 'Vue 3 + TypeScript + Pinia + Vue Router',
  react: 'React + TypeScript + Antd + Zustand',
};

const C = {
  red: '\x1b[31m',
  green: '\x1b[32m',
  yellow: '\x1b[33m',
  blue: '\x1b[34m',
  bold: '\x1b[1m',
  reset: '\x1b[0m',
};

function color(text, token) {
  if (!process.stdout.isTTY) {
    return text;
  }
  return `${C[token] || ''}${text}${C.reset}`;
}

function info(msg) {
  console.log(`${color('ℹ', 'blue')} ${msg}`);
}

function ok(msg) {
  console.log(`${color('✔', 'green')} ${msg}`);
}

function warn(msg) {
  console.log(`${color('⚠', 'yellow')} ${msg}`);
}

function err(msg) {
  console.error(`${color('✖', 'red')} ${msg}`);
}

function isInteractive() {
  return Boolean(process.stdin.isTTY && process.stdout.isTTY);
}

function isWindows() {
  return process.platform === 'win32';
}

function getSourceDir() {
  if (process.env.BR_AI_SPEC_LOCAL && fs.existsSync(path.join(process.env.BR_AI_SPEC_LOCAL, '.agents'))) {
    return process.env.BR_AI_SPEC_LOCAL;
  }
  if (fs.existsSync(path.join(PKG_ROOT, '.agents'))) {
    return PKG_ROOT;
  }
  const cacheDir = process.env.BR_AI_SPEC_CACHE || path.join(os.homedir(), '.ai-spec-auto');
  const repo = process.env.BR_AI_SPEC_REPO || 'http://git.100credit.cn/zhenwei.li/ai-spec-auto.git';
  const branch = process.env.BR_AI_SPEC_BRANCH || 'main';
  if (fs.existsSync(path.join(cacheDir, '.git'))) {
    spawnSync('git', ['-C', cacheDir, 'pull', '--quiet'], { stdio: 'ignore' });
  } else {
    const cloned = spawnSync('git', ['clone', '--quiet', '-b', branch, repo, cacheDir], { stdio: 'inherit' });
    if (cloned.status !== 0) {
      throw new Error(`克隆规范库失败: ${repo}`);
    }
  }
  return cacheDir;
}

function normalizeList(value) {
  if (!value) return [];
  if (Array.isArray(value)) return [...new Set(value.map((item) => String(item || '').trim()).filter(Boolean))];
  return [...new Set(String(value).split(',').map((item) => item.trim()).filter(Boolean))];
}

function parseArgs(argv) {
  const args = [...argv];
  const options = {
    command: '',
    target: '.',
    profile: DEFAULT_PROFILE,
    level: DEFAULT_LEVEL,
    ideFilter: DEFAULT_IDE_FILTER,
    rulesStrategy: 'ask',
    customRules: [],
    installLint: 'ask',
    installHusky: 'ask',
    uipro: 'ask',
    updateSkills: 'yes',
    updateRules: 'yes',
    updateConfigs: 'yes',
    updateCommands: 'yes',
    updateIdeLinks: 'yes',
    updateOpenSpec: 'yes',
    updateUipro: 'no',
    force: false,
    workspacePackageSubpath: '',
    workspaceRoot: false,
    profileExplicit: false,
    levelExplicit: false,
  };

  while (args.length > 0) {
    const arg = args.shift();
    switch (arg) {
      case 'init':
      case 'update':
      case 'check':
      case 'uninstall':
      case 'help':
        if (!options.command) {
          options.command = arg;
        } else if (options.target === '.') {
          options.target = arg;
        } else {
          throw new Error(`Unknown argument: ${arg}`);
        }
        break;
      case '--profile':
        options.profile = requireArg(arg, args);
        options.profileExplicit = true;
        break;
      case '--level':
        options.level = requireArg(arg, args).toUpperCase();
        options.levelExplicit = true;
        break;
      case '--ide':
        options.ideFilter = requireArg(arg, args);
        break;
      case '--standard-rules':
        options.rulesStrategy = 'standard';
        options.customRules = [];
        break;
      case '--custom-rules':
        options.rulesStrategy = 'custom';
        options.customRules = CUSTOMIZABLE_RULES.map(([name]) => name);
        break;
      case '--lint':
        options.installLint = 'yes';
        break;
      case '--no-lint':
        options.installLint = 'no';
        break;
      case '--husky':
        options.installHusky = 'yes';
        break;
      case '--no-husky':
        options.installHusky = 'no';
        break;
      case '--uipro':
        options.uipro = 'yes';
        break;
      case '--no-uipro':
        options.uipro = 'no';
        break;
      case '--update-rules':
        options.updateRules = 'yes';
        break;
      case '--no-update-rules':
        options.updateRules = 'no';
        break;
      case '--skip-skills':
        options.updateSkills = 'no';
        break;
      case '--skip-configs':
        options.updateConfigs = 'no';
        break;
      case '--skip-commands':
        options.updateCommands = 'no';
        break;
      case '--update-commands':
        options.updateCommands = 'yes';
        break;
      case '--skip-ide-links':
        options.updateIdeLinks = 'no';
        break;
      case '--skip-openspec':
        options.updateOpenSpec = 'no';
        break;
      case '--skip-uipro':
        options.updateUipro = 'no';
        break;
      case '--update-uipro':
        options.updateUipro = 'yes';
        break;
      case '--package':
        options.workspacePackageSubpath = requireArg(arg, args);
        break;
      case '--workspace-root':
        options.workspaceRoot = true;
        break;
      case '-y':
      case '--force':
        options.force = true;
        break;
      case '-h':
      case '--help':
        options.command = 'help';
        break;
      default:
        if (!arg.startsWith('-') && options.target === '.') {
          options.target = arg;
          break;
        }
        throw new Error(`Unknown argument: ${arg}`);
    }
  }

  if (!options.command) {
    options.command = 'help';
  }
  return options;
}

function requireArg(flag, args) {
  const next = args.shift();
  if (!next || next.startsWith('--')) {
    throw new Error(`选项 ${flag} 需要一个参数值`);
  }
  return next;
}

function commandExists(name) {
  const probe = spawnSync(name, ['--version'], { stdio: 'ignore' });
  return probe.status === 0;
}

function runCommand(command, args, options = {}) {
  const result = spawnSync(command, args, {
    cwd: options.cwd || process.cwd(),
    env: { ...process.env, ...(options.env || {}) },
    stdio: options.stdio || 'inherit',
    shell: false,
    encoding: options.encoding || 'utf8',
  });
  return result;
}

function readJson(filePath, label = filePath) {
  try {
    return JSON.parse(fs.readFileSync(filePath, 'utf8'));
  } catch (error) {
    throw new Error(`${label} 不是合法 JSON: ${filePath}`);
  }
}

function writeJson(filePath, value) {
  ensureDir(path.dirname(filePath));
  fs.writeFileSync(filePath, `${JSON.stringify(value, null, 2)}\n`, 'utf8');
}

function ensureDir(dirPath) {
  fs.mkdirSync(dirPath, { recursive: true });
}

function copyFile(sourcePath, destPath, options = {}) {
  if (!fs.existsSync(sourcePath)) return false;
  ensureDir(path.dirname(destPath));
  if (options.skipExisting && fs.existsSync(destPath)) {
    return false;
  }
  fs.copyFileSync(sourcePath, destPath);
  return true;
}

function removePath(targetPath) {
  if (!fs.existsSync(targetPath)) {
    return;
  }
  try {
    fs.rmSync(targetPath, { recursive: true, force: true });
  } catch (error) {
    try {
      fs.unlinkSync(targetPath);
    } catch (_) {
      // ignore
    }
  }
}

function copyDirReplace(sourceDir, destDir) {
  if (!fs.existsSync(sourceDir)) {
    return false;
  }
  removePath(destDir);
  ensureDir(path.dirname(destDir));
  fs.cpSync(sourceDir, destDir, { recursive: true });
  return true;
}

function walkFiles(rootDir) {
  if (!fs.existsSync(rootDir)) return [];
  const results = [];
  const stack = [rootDir];
  while (stack.length > 0) {
    const current = stack.pop();
    for (const entry of fs.readdirSync(current, { withFileTypes: true })) {
      if (entry.name === '.DS_Store') continue;
      const fullPath = path.join(current, entry.name);
      if (entry.isDirectory()) {
        stack.push(fullPath);
      } else {
        results.push(fullPath);
      }
    }
  }
  return results.sort();
}

function copyDirIncremental(sourceDir, destDir, options = {}) {
  if (!fs.existsSync(sourceDir)) {
    return false;
  }
  let copiedAny = false;
  for (const filePath of walkFiles(sourceDir)) {
    const rel = path.relative(sourceDir, filePath);
    const firstSegment = rel.split(path.sep)[0];
    const baseName = path.basename(filePath);
    if (options.skipHuskyArtifacts && (firstSegment === '.husky' || baseName === '.lintstagedrc' || baseName === 'commitlint.config.js')) {
      continue;
    }
    const destPath = path.join(destDir, rel);
    ensureDir(path.dirname(destPath));
    if (options.skipExisting && fs.existsSync(destPath)) {
      info(`  跳过已存在: ${rel.split(path.sep).join('/')}`);
      continue;
    }
    fs.copyFileSync(filePath, destPath);
    copiedAny = true;
  }
  return copiedAny;
}

function createDirLink(targetAbsolute, linkPath) {
  removePath(linkPath);
  ensureDir(path.dirname(linkPath));
  if (isWindows()) {
    fs.symlinkSync(targetAbsolute, linkPath, 'junction');
  } else {
    const rel = path.relative(path.dirname(linkPath), targetAbsolute) || '.';
    fs.symlinkSync(rel, linkPath);
  }
}

function normalizeIdeFilter(value) {
  const raw = String(value || DEFAULT_IDE_FILTER).trim();
  if (raw === 'default') return [...DEFAULT_IDES];
  if (raw === 'all') return [...ALL_IDES];
  const list = normalizeList(raw);
  const unknown = list.filter((item) => !ALL_IDES.includes(item));
  if (unknown.length > 0) {
    throw new Error(`Unsupported ides: ${unknown.join(', ')}`);
  }
  return list;
}

function readPackageJson(filePath) {
  if (!fs.existsSync(filePath)) return null;
  return readJson(filePath, 'package.json');
}

function pkgJsonHasWorkspaces(dir) {
  const pkg = readPackageJson(path.join(dir, 'package.json'));
  return Boolean(pkg && pkg.workspaces);
}

function findMonorepoWorkspaceRoot(startDir) {
  let current = path.resolve(startDir);
  while (true) {
    if (fs.existsSync(path.join(current, 'pnpm-workspace.yaml')) || pkgJsonHasWorkspaces(current)) {
      return current;
    }
    const parent = path.dirname(current);
    if (parent === current) {
      return null;
    }
    current = parent;
  }
}

function detectInstalledProfile(targetDir, profilesRegistry) {
  const manifestPath = path.join(targetDir, '.ai-spec', 'manifest.json');
  if (fs.existsSync(manifestPath)) {
    const manifest = readJson(manifestPath, 'existing manifest');
    const resolved = resolveProfileId(profilesRegistry, manifest.profile);
    if (resolved) {
      return resolved;
    }
  }
  return DEFAULT_PROFILE;
}

function detectInstalledLevel(targetDir) {
  if (fs.existsSync(path.join(targetDir, 'openspec'))) {
    return 'L3';
  }
  if (ALL_IDES.some((ide) => fs.existsSync(path.join(targetDir, `.${ide}`)))) {
    return 'L2';
  }
  return 'L1';
}

async function ask(question, defaultValue = '') {
  const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
  try {
    const prompt = defaultValue ? `${question} [默认 ${defaultValue}]: ` : `${question}: `;
    const answer = await rl.question(prompt);
    return answer.trim() || defaultValue;
  } finally {
    rl.close();
  }
}

async function confirm(question, defaultYes = false) {
  const hint = defaultYes ? '(Y/n)' : '(y/N)';
  const answer = (await ask(`${question} ${hint}`, defaultYes ? 'Y' : 'N')).toLowerCase();
  if (!answer) {
    return defaultYes;
  }
  return answer === 'y' || answer === 'yes';
}

async function selectFromList(title, items, defaultIndex = 0) {
  console.log('');
  info(title);
  items.forEach((item, index) => {
    console.log(`  ${index + 1}) ${item.label}${item.desc ? ` — ${item.desc}` : ''}`);
  });
  console.log('');
  const answer = await ask(`请选择 (1-${items.length})`, String(defaultIndex + 1));
  const index = Number(answer) - 1;
  if (Number.isInteger(index) && index >= 0 && index < items.length) {
    return items[index].value;
  }
  return items[defaultIndex].value;
}

async function selectRulesStrategy(options) {
  if (!isInteractive() || options.rulesStrategy !== 'ask') {
    options.rulesStrategy = options.rulesStrategy === 'ask' ? 'standard' : options.rulesStrategy;
    return;
  }

  const strategy = await selectFromList('规则安装策略：', [
    { value: 'standard', label: '使用标准规范', desc: '直接使用规范库中的规则，适合快速接入' },
    { value: 'custom', label: '根据项目自定义', desc: '跳过部分规则，后续由 /project-init 按项目生成' },
  ], 0);
  options.rulesStrategy = strategy;
  if (strategy !== 'custom') {
    options.customRules = [];
    return;
  }

  console.log('');
  info('选择需要根据项目自定义的规则（输入编号切换，回车确认）：');
  CUSTOMIZABLE_RULES.forEach(([fileName, desc], index) => {
    const defaultSelected = PROJECT_SPECIFIC_RULES.has(fileName);
    console.log(`  ${index + 1}) [${defaultSelected ? 'x' : ' '}] ${fileName.replace('.md', '')} — ${desc}`);
  });
  const answer = await ask('输入编号（逗号分隔，留空表示保留默认 01/03）', '');
  const selected = new Set(['01-项目概述.md', '03-项目结构.md']);
  if (answer) {
    for (const token of answer.split(',')) {
      const idx = Number(token.trim()) - 1;
      if (!Number.isInteger(idx) || idx < 0 || idx >= CUSTOMIZABLE_RULES.length) {
        continue;
      }
      const name = CUSTOMIZABLE_RULES[idx][0];
      if (selected.has(name)) {
        selected.delete(name);
      } else {
        selected.add(name);
      }
    }
  }
  options.customRules = CUSTOMIZABLE_RULES.map(([name]) => name).filter((name) => selected.has(name));
  ok(`以下规则将根据项目自定义：${options.customRules.map((name) => `\n  • ${name}`).join('')}`);
}

async function selectInitChoices(options, profilesRegistry) {
  if (!isInteractive()) {
    if (options.installLint === 'ask') options.installLint = 'yes';
    if (options.installHusky === 'ask') options.installHusky = 'no';
    if (options.uipro === 'ask') options.uipro = 'no';
    if (options.rulesStrategy === 'ask') options.rulesStrategy = 'standard';
    return;
  }

  if (!options.profileExplicit) {
    const profileItems = Object.entries(getProfileEntries(profilesRegistry)).map(([id, entry]) => ({
      value: id,
      label: id,
      desc: PROFILE_SUMMARIES[id] || entry.label || id,
    }));
    options.profile = await selectFromList('选择技术栈 Profile：', profileItems, Math.max(0, profileItems.findIndex((item) => item.value === DEFAULT_PROFILE)));
    ok(`已选择 Profile: ${options.profile}`);
  }

  await selectRulesStrategy(options);

  if (options.uipro === 'ask') {
    console.log('');
    info('是否安装 UI UX Pro Max 设计智能技能？');
    console.log('  提供 67 种 UI 风格、161 套配色方案、57 组字体搭配、99 条 UX 准则');
    options.uipro = (await confirm('安装 UI UX Pro Max?', true)) ? 'yes' : 'no';
    ok(options.uipro === 'yes' ? '将安装 UI UX Pro Max' : '跳过 UI UX Pro Max');
  }

  if (options.installLint === 'ask') {
    console.log('');
    info('是否安装 ESLint + Prettier + Stylelint 配置？');
    options.installLint = (await confirm('安装 lint/format 工具?', true)) ? 'yes' : 'no';
    ok(options.installLint === 'yes' ? '将安装 lint/format 工具' : '跳过 lint/format 工具');
  }

  if (options.installHusky === 'ask') {
    console.log('');
    info('是否安装 Husky 提交校验（husky + lint-staged + commitlint）？');
    options.installHusky = (await confirm('安装提交校验?', false)) ? 'yes' : 'no';
    ok(options.installHusky === 'yes' ? '将安装提交校验' : '跳过提交校验');
  }
}

async function resolveMonorepoTarget(targetDir, options) {
  const resolvedTarget = path.resolve(targetDir);
  const workspaceRoot = findMonorepoWorkspaceRoot(resolvedTarget);
  if (!workspaceRoot) {
    return resolvedTarget;
  }

  if (resolvedTarget !== workspaceRoot) {
    if (fs.existsSync(path.join(resolvedTarget, 'package.json'))) {
      info(`检测到 Monorepo，当前安装目标为子包: ${resolvedTarget}（工作区根: ${workspaceRoot}）`);
    }
    return resolvedTarget;
  }

  const requestedSubPath = options.workspacePackageSubpath || process.env.EX_AI_SPEC_WORKSPACE_PACKAGE || '';
  if (requestedSubPath) {
    const candidate = path.resolve(workspaceRoot, requestedSubPath);
    if (!fs.existsSync(candidate) || !fs.existsSync(path.join(candidate, 'package.json'))) {
      throw new Error(`Monorepo 子包路径无效: ${candidate}`);
    }
    ok(`已根据 --package / EX_AI_SPEC_WORKSPACE_PACKAGE 将安装目标设为: ${candidate}`);
    return candidate;
  }

  if (options.workspaceRoot) {
    return workspaceRoot;
  }

  if (!isInteractive()) {
    warn(`检测到 Monorepo（工作区根: ${workspaceRoot}），非交互模式将继续在根目录安装。`);
    warn(`如需安装到子包，请使用: npx @ex/ai-spec-auto@latest init . --package packages/your-app`);
    return workspaceRoot;
  }

  console.log('');
  info(`检测到 Monorepo（pnpm / npm workspaces），工作区根目录: ${workspaceRoot}`);
  info('规范与 lint/husky 等依赖将写入「安装目标」目录及其 package.json。');
  console.log('  1) 在工作区根目录继续安装');
  console.log('  2) 改为在具体子包中安装（推荐）');
  console.log('  若仅在根 package.json 添加依赖，pnpm 可使用: pnpm add -w <包名>');
  const choice = await ask('请选择 [1/2]', '2');
  if (choice === '1') {
    return workspaceRoot;
  }
  for (let i = 0; i < 3; i += 1) {
    const rel = (await ask('请输入子包相对路径（相对工作区根，如 packages/web）', '')).replace(/^\/+|\/+$/g, '');
    if (!rel) {
      warn('路径不能为空');
      continue;
    }
    const candidate = path.resolve(workspaceRoot, rel);
    if (!fs.existsSync(candidate)) {
      warn(`目录不存在: ${candidate}`);
      continue;
    }
    if (!fs.existsSync(path.join(candidate, 'package.json'))) {
      warn(`该目录下缺少 package.json: ${candidate}`);
      continue;
    }
    ok(`安装目标已切换为: ${candidate}`);
    return candidate;
  }
  throw new Error('多次输入无效的子包路径，请使用 --package 显式指定');
}

function testNodeEnv() {
  const result = spawnSync('node', ['--version'], { encoding: 'utf8' });
  if (result.status !== 0) {
    throw new Error('未检测到 Node.js 环境');
  }
  const version = result.stdout.trim();
  const major = Number(version.replace(/^v/, '').split('.')[0]);
  if (!Number.isFinite(major) || major < 18) {
    throw new Error(`Node.js 版本过低: ${version} (最低要求: v18)`);
  }
  ok(`Node.js ${version} 环境就绪`);
}

function detectPkgManager(targetDir) {
  if (fs.existsSync(path.join(targetDir, 'pnpm-lock.yaml')) && commandExists('pnpm')) {
    return 'pnpm';
  }
  if (commandExists('pnpm')) {
    return 'pnpm';
  }
  if (commandExists('npm')) {
    return 'npm';
  }
  return '';
}

function readSourcePackageField(sourceDir, field) {
  const sourcePkgPath = path.join(sourceDir, 'package.json');
  if (!fs.existsSync(sourcePkgPath)) return null;
  const pkg = readJson(sourcePkgPath, 'source package.json');
  if (field === 'ident') {
    return pkg.name && pkg.version ? `${pkg.name}@${pkg.version}` : null;
  }
  if (field === 'name') return pkg.name || null;
  if (field === 'registry') return pkg.publishConfig?.registry || null;
  return null;
}

function installDevDependencies(targetDir, pkgManager, packages) {
  if (!pkgManager) return { status: 1 };
  const args = pkgManager === 'pnpm'
    ? ['add', '-D', ...packages]
    : ['install', '-D', ...packages];
  const withWorkspace = pkgManager === 'pnpm' && fs.existsSync(path.join(targetDir, 'pnpm-workspace.yaml'));
  const finalArgs = withWorkspace ? ['add', '-w', '-D', ...packages] : args;
  return runCommand(pkgManager, finalArgs, { cwd: targetDir, stdio: 'inherit' });
}

function syncCommands(targetDir, sourceDir, ideName, overwrite) {
  const commonDir = path.join(sourceDir, '.agents', 'commands', 'common');
  const ideDir = path.join(sourceDir, '.agents', 'commands', ideName);
  const destDir = path.join(targetDir, `.${ideName}`, 'commands');
  ensureDir(destDir);
  for (const dir of [commonDir, ideDir]) {
    if (!fs.existsSync(dir)) continue;
    for (const entry of fs.readdirSync(dir)) {
      if (!entry.endsWith('.md')) continue;
      const sourcePath = path.join(dir, entry);
      const destPath = path.join(destDir, entry);
      if (fs.existsSync(destPath) && !overwrite) {
        info(`  跳过已存在命令: ${entry}`);
        continue;
      }
      copyFile(sourcePath, destPath);
    }
  }
  if (fs.existsSync(destDir)) {
    ok(`.${ideName}/commands/ 已同步`);
  }
}

function getProfileDirs(sourceDir, profileId, profilesRegistry) {
  const entry = getProfileEntries(profilesRegistry)[profileId];
  if (!entry) {
    throw new Error(`Unsupported profile: ${profileId}. Supported profiles: ${formatSupportedProfiles(profilesRegistry)}`);
  }
  return {
    rulesDir: path.join(sourceDir, entry.rules_dir),
    skillsDir: path.join(sourceDir, entry.skills_dir),
    configsDir: path.join(sourceDir, entry.configs_dir),
  };
}

function isCustomRule(ruleName, options) {
  return options.rulesStrategy === 'custom' && options.customRules.includes(ruleName);
}

function copyAgents(targetDir, sourceDir, profilesRegistry, options, copyMode = {}) {
  const agentsDir = path.join(targetDir, '.agents');
  const rulesOut = path.join(agentsDir, 'rules');
  const skillsOut = path.join(agentsDir, 'skills');
  ensureDir(rulesOut);
  ensureDir(skillsOut);

  const { rulesDir, skillsDir } = getProfileDirs(sourceDir, options.profile, profilesRegistry);
  const commonRulesDir = path.join(sourceDir, '.agents', 'rules', 'common');
  const commonSkillsDir = path.join(sourceDir, '.agents', 'skills', 'common');

  if (!copyMode.skipRules) {
    info(`同步 rules (common + ${path.relative(sourceDir, rulesDir).split(path.sep).join('/')}) ...`);
    for (const sourceRuleDir of [commonRulesDir, rulesDir]) {
      if (!fs.existsSync(sourceRuleDir)) continue;
      for (const fileName of fs.readdirSync(sourceRuleDir).filter((name) => name.endsWith('.md'))) {
        const sourcePath = path.join(sourceRuleDir, fileName);
        const destPath = path.join(rulesOut, fileName);
        if (isCustomRule(fileName, options)) {
          info(`跳过自定义规则: ${fileName}（保留项目自定义）`);
          continue;
        }
        if (PROJECT_SPECIFIC_RULES.has(fileName) && fs.existsSync(destPath)) {
          warn(`跳过项目特有规则: ${fileName}（已存在）`);
          continue;
        }
        copyFile(sourcePath, destPath);
        if (PROJECT_SPECIFIC_RULES.has(fileName)) {
          info(`已生成模板: ${fileName} → 请根据项目实际情况修改`);
        }
      }
    }
    copyFile(path.join(sourceDir, '.agents', 'rules', 'README.md'), path.join(rulesOut, 'README.md'));
  } else {
    info('跳过 rules 同步（用户选择不更新规则）');
  }

  if (!copyMode.skipSkills) {
    info(`同步 skills (common + ${path.relative(sourceDir, skillsDir).split(path.sep).join('/')}) ...`);
    for (const sourceSkillsDir of [commonSkillsDir, skillsDir]) {
      if (!fs.existsSync(sourceSkillsDir)) continue;
      for (const entry of fs.readdirSync(sourceSkillsDir, { withFileTypes: true })) {
        if (!entry.isDirectory()) continue;
        copyDirReplace(path.join(sourceSkillsDir, entry.name), path.join(skillsOut, entry.name));
      }
    }
    copyFile(path.join(sourceDir, '.agents', 'skills', 'README.md'), path.join(skillsOut, 'README.md'));
  } else {
    info('跳过 skills 同步（用户选择不更新技能）');
  }

  ok(`.agents/ 同步完成 (profile: ${options.profile})`);
}

function copyConfigs(targetDir, sourceDir, profilesRegistry, options, skipExisting = true) {
  const commonDir = path.join(sourceDir, 'configs', 'common');
  const { configsDir } = getProfileDirs(sourceDir, options.profile, profilesRegistry);
  let copied = false;
  const skipHuskyArtifacts = options.installHusky !== 'yes' && !fs.existsSync(path.join(targetDir, '.husky'));

  if (skipHuskyArtifacts) {
    info('提交校验相关配置（.husky / .lintstagedrc / commitlint）将跳过同步');
  }

  if (fs.existsSync(commonDir)) {
    info('同步 lint/format 配置 (common) ...');
    copied = copyDirIncremental(commonDir, targetDir, { skipExisting, skipHuskyArtifacts }) || copied;
  }
  if (fs.existsSync(configsDir)) {
    info(`同步 lint/format 配置 (${path.relative(sourceDir, configsDir).split(path.sep).join('/')}) ...`);
    copied = copyDirIncremental(configsDir, targetDir, { skipExisting, skipHuskyArtifacts }) || copied;
  }

  if (copied) ok('lint/format 配置部署完成');
  else info('未找到 lint/format 配置模板，跳过');
}

function installLocalCli(targetDir, sourceDir, pkgManager, pending) {
  const targetPkg = path.join(targetDir, 'package.json');
  if (!fs.existsSync(targetPkg)) {
    warn('未找到 package.json，跳过本地 ai-spec-auto CLI 安装');
    return;
  }
  if (!pkgManager) {
    warn('无可用的包管理器，跳过本地 ai-spec-auto CLI 安装');
    return;
  }

  const forcedLocal = Boolean(process.env.BR_AI_SPEC_FORCE_LOCAL_CLI);
  const installSpec = forcedLocal
    ? sourceDir
    : (readSourcePackageField(sourceDir, 'ident') || sourceDir);
  const registry = readSourcePackageField(sourceDir, 'registry');
  const packageName = readSourcePackageField(sourceDir, 'name');
  const scopeName = packageName && packageName.startsWith('@') ? packageName.split('/')[0] : '';
  const args = pkgManager === 'pnpm' ? ['add', '-D', installSpec] : ['install', '-D', installSpec];
  if (registry) {
    args.push('--registry', registry);
    if (scopeName) {
      args.push(`--${scopeName}:registry=${registry}`);
    }
  }
  info(`正在使用 ${pkgManager} 安装项目内 ai-spec-auto CLI ...`);
  info(`  source: ${forcedLocal ? `${installSpec} (forced local path)` : `${installSpec}${registry ? ` via ${registry}` : ''}`}`);
  const result = runCommand(pkgManager, args, { cwd: targetDir, stdio: 'inherit' });
  if (result.status !== 0) {
    pending.failures.push(`本地 ai-spec-auto CLI 安装失败：请在 ${targetDir} 手动执行 ${pkgManager} ${args.join(' ')}`);
    return;
  }
  ok('项目内 ai-spec-auto CLI 已就绪 (./node_modules/.bin/ai-spec-auto)');
}

function installLintDeps(targetDir, pkgManager, options, pending) {
  if (!fs.existsSync(path.join(targetDir, 'package.json'))) {
    pending.failures.push('lint/format：未找到 package.json，已跳过依赖安装。');
    return;
  }
  if (!pkgManager) {
    pending.failures.push('lint/format：无可用的包管理器，无法安装 ESLint 等依赖。');
    return;
  }
  const deps = ['eslint', 'prettier', 'stylelint', 'stylelint-config-standard'];
  if (options.profile === 'vue') {
    deps.push('stylelint-config-html', 'stylelint-config-recommended-vue', 'postcss-html');
  }
  info(`正在使用 ${pkgManager} 安装 lint/format 依赖，请稍候 ...`);
  info(`  ${deps.join(' ')}`);
  const result = installDevDependencies(targetDir, pkgManager, deps);
  if (result.status !== 0) {
    pending.failures.push(`lint/format 依赖安装失败：请在 ${targetDir} 手动安装 ${deps.join(' ')}`);
    return;
  }
  ok('lint/format 依赖安装完成');
}

function installCommitHooks(targetDir, pkgManager, pending) {
  if (!fs.existsSync(path.join(targetDir, 'package.json'))) {
    pending.failures.push('提交校验：未找到 package.json，已跳过依赖安装。');
    return;
  }
  if (!pkgManager) {
    pending.failures.push('提交校验：无可用的包管理器，无法安装 husky 等依赖。');
    return;
  }
  const deps = ['husky@8', 'lint-staged@15', '@commitlint/cli@19', '@commitlint/config-conventional@19'];
  info(`正在使用 ${pkgManager} 安装提交校验依赖，请稍候 ...`);
  info(`  ${deps.join(' ')}`);
  const result = installDevDependencies(targetDir, pkgManager, deps);
  if (result.status !== 0) {
    pending.failures.push(`提交校验依赖安装失败：请在 ${targetDir} 手动安装 ${deps.join(' ')}`);
    return;
  }
  info('初始化 husky ...');
  const huskyResult = runCommand('npx', ['husky', 'install'], { cwd: targetDir, stdio: 'inherit' });
  if (huskyResult.status !== 0) {
    pending.failures.push(`husky install 失败：请在 ${targetDir} 手动执行 npx husky install`);
    return;
  }
  ok('提交校验工具链安装完成 (husky@8 + lint-staged + commitlint)');
}

function createIdeLinks(targetDir, sourceDir, options) {
  for (const ide of normalizeIdeFilter(options.ideFilter)) {
    const ideDir = path.join(targetDir, `.${ide}`);
    ensureDir(ideDir);
    createDirLink(path.join(targetDir, '.agents', 'rules'), path.join(ideDir, 'rules'));
    const ideSkillsDir = path.join(ideDir, 'skills');
    ensureDir(ideSkillsDir);

    const agentsSkillsDir = path.join(targetDir, '.agents', 'skills');
    if (fs.existsSync(agentsSkillsDir)) {
      for (const entry of fs.readdirSync(agentsSkillsDir, { withFileTypes: true })) {
        if (!entry.isDirectory()) continue;
        if (entry.name === 'common' || entry.name === 'profiles') continue;
        const linkPath = path.join(ideSkillsDir, entry.name);
        if (IDE_AUTOLINK_EXCLUDED_SKILLS.has(entry.name)) {
          removePath(linkPath);
          continue;
        }
        createDirLink(path.join(agentsSkillsDir, entry.name), linkPath);
      }
    }
    ok(`.${ide}/ 链接就绪`);
  }

  if (normalizeIdeFilter(options.ideFilter).includes('cursor')) {
    const mcpSrc = path.join(sourceDir, '.cursor', 'mcp.json');
    const mcpDest = path.join(targetDir, '.cursor', 'mcp.json');
    if (fs.existsSync(mcpSrc) && !fs.existsSync(mcpDest)) {
      copyFile(mcpSrc, mcpDest);
      info('.cursor/mcp.json 已生成（请在 Cursor「设置 → MCP」中按需启用并完成凭证配置）');
    }
    syncCommands(targetDir, sourceDir, 'cursor', options.updateCommands === 'yes');
  }

  if (normalizeIdeFilter(options.ideFilter).includes('claude')) {
    syncCommands(targetDir, sourceDir, 'claude', options.updateCommands === 'yes');
  }
}

function ensureOpenSpecDirs(targetDir) {
  ensureDir(path.join(targetDir, 'openspec', 'specs'));
  ensureDir(path.join(targetDir, 'openspec', 'changes', 'archive'));
  ensureDir(path.join(targetDir, 'openspec', 'schemas'));
}

function setupOpenSpec(targetDir, sourceDir, options, pkgManager, pending) {
  info('配置 OpenSpec ...');
  const openspecAvailable = spawnSync('npx', ['openspec', '--version'], { stdio: 'ignore' }).status === 0;
  if (!openspecAvailable) {
    if (!pkgManager) {
      pending.failures.push('OpenSpec CLI 不可用，且未检测到包管理器。请手动安装 @fission-ai/openspec。');
    } else {
      info('正在全局安装 @fission-ai/openspec ...');
      const install = pkgManager === 'pnpm'
        ? runCommand('pnpm', ['add', '-g', '@fission-ai/openspec@latest'], { stdio: 'inherit' })
        : runCommand('npm', ['install', '-g', '@fission-ai/openspec@latest'], { stdio: 'inherit' });
      if (install.status !== 0 || spawnSync('npx', ['openspec', '--version'], { stdio: 'ignore' }).status !== 0) {
        pending.failures.push('OpenSpec CLI 自动安装失败，请手动执行 npm install -g @fission-ai/openspec@latest');
      } else {
        ok('openspec CLI 已安装并可用');
      }
    }
  } else {
    ok('openspec CLI 可用');
  }

  ensureOpenSpecDirs(targetDir);
  const toolsArg = normalizeIdeFilter(options.ideFilter).join(',');
  const configYaml = path.join(targetDir, 'openspec', 'config.yaml');
  const configYml = path.join(targetDir, 'openspec', 'config.yml');
  if (spawnSync('npx', ['openspec', '--version'], { stdio: 'ignore' }).status === 0) {
    if (!fs.existsSync(configYaml) && !fs.existsSync(configYml)) {
      info('运行 openspec init ...');
      const init = runCommand('npx', ['openspec', 'init', '--tools', toolsArg, '--force'], { cwd: targetDir, stdio: 'inherit' });
      if (init.status !== 0) {
        pending.failures.push(`openspec init 失败：请在 ${targetDir} 手动执行 npx openspec init --tools "${toolsArg}"`);
      }
    } else {
      info('openspec/ 已存在，运行 openspec update ...');
      const update = runCommand('npx', ['openspec', 'update', '--force'], { cwd: targetDir, stdio: 'inherit' });
      if (update.status !== 0) {
        pending.failures.push(`openspec update 失败：请在 ${targetDir} 手动执行 npx openspec update --force`);
      }
    }
  }

  const schemaSrc = path.join(sourceDir, 'openspec', 'schemas');
  const schemaDst = path.join(targetDir, 'openspec', 'schemas');
  if (fs.existsSync(schemaSrc)) {
    for (const entry of fs.readdirSync(schemaSrc, { withFileTypes: true })) {
      if (!entry.isDirectory()) continue;
      copyDirReplace(path.join(schemaSrc, entry.name), path.join(schemaDst, entry.name));
    }
  }

  const template = path.join(sourceDir, 'openspec', 'config.yaml.template');
  if (fs.existsSync(template)) {
    const templateRaw = fs.readFileSync(template, 'utf8');
    const templateSchemaLine = templateRaw.split(/\r?\n/).find((line) => /^schema:\s*/.test(line)) || '';
    if (!fs.existsSync(configYaml)) {
      copyFile(template, configYaml);
      ok('openspec/config.yaml 已创建');
    } else {
      let current = fs.readFileSync(configYaml, 'utf8');
      if (!/^context:/m.test(current)) {
        const contextIdx = templateRaw.indexOf('context:');
        if (contextIdx >= 0) {
          current = `${current.replace(/\s*$/, '\n\n')}${templateRaw.slice(contextIdx)}`;
        }
        ok('config.yaml 已增量补充 rules 子键');
      }
      if (templateSchemaLine) {
        if (/^schema:\s*/m.test(current)) {
          current = current.replace(/^schema:\s*.*$/m, templateSchemaLine);
        } else {
          current = `${templateSchemaLine}\n\n${current}`;
        }
      }
      fs.writeFileSync(configYaml, current, 'utf8');
    }
  }
  ok('OpenSpec 配置完成');
}

function setupUipro(targetDir, pkgManager, pending) {
  const skillDir = path.join(targetDir, '.agents', 'skills', 'ui-ux-pro-max');
  if (fs.existsSync(path.join(skillDir, 'SKILL.md'))) {
    ok('UI UX Pro Max 已安装，跳过');
    return;
  }
  if (!pkgManager) {
    pending.failures.push('UI UX Pro Max：无可用的包管理器，无法全局安装 uipro-cli。');
    return;
  }

  const hasUipro = commandExists('uipro');
  if (!hasUipro) {
    info('安装 uipro-cli ...');
    const install = pkgManager === 'pnpm'
      ? runCommand('pnpm', ['add', '-g', 'uipro-cli'], { stdio: 'inherit' })
      : runCommand('npm', ['install', '-g', 'uipro-cli'], { stdio: 'inherit' });
    if (install.status !== 0 || !commandExists('uipro')) {
      pending.failures.push('uipro-cli 全局安装失败，请手动执行 npm install -g uipro-cli');
      return;
    }
    ok('uipro-cli 安装成功');
  }

  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'ai-spec-auto-uipro-'));
  info('下载 UI UX Pro Max 资源 ...');
  const init = runCommand('uipro', ['init', '--ai', 'cursor'], { cwd: tmpDir, stdio: 'inherit' });
  if (init.status !== 0) {
    pending.failures.push('uipro init 失败，请检查网络后重试。');
    removePath(tmpDir);
    return;
  }
  const sourceDir = path.join(tmpDir, '.shared', 'ui-ux-pro-max');
  if (!fs.existsSync(sourceDir)) {
    pending.failures.push('UI UX Pro Max 资源目录缺失，可能是 uipro-cli 版本或网络问题。');
    removePath(tmpDir);
    return;
  }
  ensureDir(path.join(skillDir, 'data'));
  fs.cpSync(sourceDir, path.join(skillDir, 'data'), { recursive: true });
  const promptFile = path.join(tmpDir, '.cursor', 'commands', 'ui-ux-pro-max.md');
  if (fs.existsSync(promptFile)) {
    const prompt = fs.readFileSync(promptFile, 'utf8').replace(/\.shared\/ui-ux-pro-max\//g, 'data/');
    fs.writeFileSync(path.join(skillDir, 'SKILL.md'), `---\nname: ui-ux-pro-max\ndescription: AI 设计智能技能，提供 67 种 UI 风格、161 套配色方案、57 组字体搭配、99 条 UX 准则。当需要 AI 自主做出 UI/UX 设计决策时使用本技能。\n---\n\n${prompt}`, 'utf8');
  } else {
    fs.writeFileSync(path.join(skillDir, 'SKILL.md'), `---\nname: ui-ux-pro-max\ndescription: AI 设计智能技能，提供 67 种 UI 风格、161 套配色方案、57 组字体搭配、99 条 UX 准则。当需要 AI 自主做出 UI/UX 设计决策时使用本技能。\n---\n\n# UI UX Pro Max\n\n本技能为 AI 注入专业 UI/UX 设计决策能力。\n`, 'utf8');
  }
  removePath(tmpDir);
  ok('UI UX Pro Max 安装完成');
}

function getSelectedAiInitRules(options) {
  const selected = new Set(['01-项目概述.md', '03-项目结构.md']);
  if (options.rulesStrategy === 'custom') {
    for (const name of options.customRules) {
      selected.add(name);
    }
  }
  return [...selected];
}

function printTools(level, uiproSelected) {
  info('工具环境：');
  if (commandExists('git')) {
    const version = spawnSync('git', ['--version'], { encoding: 'utf8' }).stdout.trim().replace(/^git version\s+/, '');
    ok(`  git ${version}`);
  } else {
    warn('  git 未安装');
  }
  if (commandExists('node')) {
    ok(`  node ${spawnSync('node', ['--version'], { encoding: 'utf8' }).stdout.trim()}`);
  } else {
    warn('  node 未安装');
  }
  if (commandExists('npx')) {
    ok('  npx 可用');
  } else {
    warn('  npx 不可用');
  }
  if (level === 'L3') {
    if (spawnSync('npx', ['openspec', '--version'], { stdio: 'ignore' }).status === 0) {
      ok('  openspec 已安装');
    } else {
      warn('  openspec 未安装');
    }
  }
  if (uiproSelected === 'yes' || commandExists('python3')) {
    if (commandExists('python3')) {
      const py = spawnSync('python3', ['--version'], { encoding: 'utf8' });
      ok(`  python3 ${(py.stdout || py.stderr).trim().replace(/^Python\s+/, '')}`);
    } else if (uiproSelected === 'yes') {
      warn('  python3 未安装（UI UX Pro Max 搜索脚本需要）');
    }
  }
}

function printInstallReport(targetDir, options, pending) {
  console.log('');
  console.log(color('════════════════════════════════════════', 'bold'));
  if (pending.failures.length > 0 || pending.configs.length > 0) {
    info('规范与配置文件已同步到项目。');
    warn(`存在 ${pending.failures.length + pending.configs.length} 项待处理（见文末汇总）。`);
  } else {
    ok('安装完成！');
  }
  console.log(color('════════════════════════════════════════', 'bold'));
  console.log('');
  info('安装配置：');
  console.log(`  Profile:  ${color(options.profile, 'bold')}`);
  console.log(`  安装模型: ${color(options.level === DEFAULT_LEVEL ? 'default (full)' : 'compatibility override', 'bold')}`);
  if (options.level !== DEFAULT_LEVEL) {
    console.log(`  兼容层级: ${color(options.level, 'bold')}`);
  }
  console.log(`  IDE:      ${color(options.ideFilter, 'bold')}`);
  console.log(`  UIPro:    ${color(options.uipro, 'bold')}`);
  console.log(`  AIInit:   ${color('no', 'bold')}`);
  console.log('');
  info('已部署内容：');
  console.log(`  ${color('✔', 'green')} .agents/rules + skills (profile: ${options.profile})`);
  console.log(`  ${options.installLint === 'yes' ? color('✔', 'green') : color('—', 'yellow')} lint/format 配置${options.installLint === 'yes' ? ' (.prettierrc, .eslintrc, .stylelintrc)' : '（已跳过）'}`);
  console.log(`  ${options.installHusky === 'yes' ? color('✔', 'green') : color('—', 'yellow')} 提交校验${options.installHusky === 'yes' ? ' (.husky, .lintstagedrc, commitlint.config.js)' : '（已跳过）'}`);
  if (fs.existsSync(path.join(targetDir, '.agents', 'skills', 'ui-ux-pro-max', 'SKILL.md'))) {
    console.log(`  ${color('✔', 'green')} UI UX Pro Max 设计智能技能`);
  }
  if (options.level !== 'L1') {
    console.log(`  ${color('✔', 'green')} IDE 适配 (.cursor, .claude)`);
  }
  console.log('');
  info('提醒事项：');
  console.log('  1. 当前包通过内网 npm registry 分发；首次接入前，请在 ~/.npmrc 中配置 @ex:registry=http://nodejs.100credit.cn/');
  if (options.level !== 'L1') {
    console.log('  2. 配置 .cursor/mcp.json（按需启用 MCP）');
    console.log(`     ${color('→', 'yellow')} 先在 Cursor 设置 → MCP 中按需启用目标服务，再补齐凭证`);
    console.log('  3. 首次运行 /spec-start / /spec-continue / /spec-update 时，如 Cursor 提示执行 ai-spec-auto 命令');
    console.log(`     ${color('→', 'yellow')} 请选择 Always allow for this workspace，避免宿主桥命令被权限弹窗打断`);
  }
  console.log('');
  console.log(color('────────────────────────────────────────────────────────────', 'bold'));
  console.log(`  ${color('★ 项目初始化不会在安装后自动执行，请在 AI IDE 中手动触发：', 'bold')}`);
  console.log(`    推荐触发方式：${color('/project-init', 'bold')}（或输入“初始化项目规范” / “project-init”）`);
  console.log('    触发后 AI 将生成：');
  for (const rule of getSelectedAiInitRules(options)) {
    console.log(`    • ${rule}`);
  }
  console.log(color('────────────────────────────────────────────────────────────', 'bold'));
  if (pending.failures.length > 0 || pending.configs.length > 0) {
    console.log('');
    if (pending.failures.length > 0) {
      console.log(color('════════════════════════════════════════', 'red'));
      console.log(color('  待处理事项（安装或命令失败，请逐项处理）', 'red'));
      console.log(color('════════════════════════════════════════', 'red'));
      for (const item of pending.failures) {
        console.log(`  ${color('•', 'red')} ${item}`);
      }
    }
    if (pending.configs.length > 0) {
      console.log(color('════════════════════════════════════════', 'yellow'));
      console.log(color('  配置提醒（非安装失败）', 'yellow'));
      console.log(color('════════════════════════════════════════', 'yellow'));
      for (const item of pending.configs) {
        console.log(`  ${color('•', 'yellow')} ${item}`);
      }
    }
  }
}

async function handleInit(options) {
  const sourceDir = getSourceDir();
  const profilesRegistry = readProfilesRegistry(sourceDir);
  options.profile = resolveProfileId(profilesRegistry, options.profile) || DEFAULT_PROFILE;

  testNodeEnv();
  const targetDir = await resolveMonorepoTarget(options.target, options);
  console.log('');
  info(`ai-spec-auto  v${VERSION} | ${os.platform()} ${os.arch()} | Node ${process.version}`);
  info(`初始化项目: ${targetDir}`);
  console.log('');

  if (fs.existsSync(path.join(targetDir, '.agents'))) {
    warn('目标项目已包含 .agents/ 目录');
    console.log(`  如果只需更新规范，请使用: ${color('npx @ex/ai-spec-auto@latest update .', 'bold')}`);
    console.log('');
    if (!options.force && isInteractive()) {
      const goOn = await confirm('继续初始化将覆盖现有规范（01/03 和自定义规则除外），确认？', false);
      if (!goOn) {
        info('已取消');
        return 0;
      }
    }
  }

  const pkgManager = detectPkgManager(targetDir);
  if (pkgManager) {
    ok(`使用包管理器: ${pkgManager}${commandExists(pkgManager) ? ` (${spawnSync(pkgManager, ['--version'], { encoding: 'utf8' }).stdout.trim()})` : ''}`);
  } else {
    warn('未检测到 npm 或 pnpm，后续依赖安装会跳过');
  }

  await selectInitChoices(options, profilesRegistry);
  if (!['L1', 'L2', 'L3'].includes(options.level)) {
    options.level = DEFAULT_LEVEL;
  }

  const pending = { failures: [], configs: [] };
  info(`使用 npm 包内规范库: ${sourceDir}`);
  copyAgents(targetDir, sourceDir, profilesRegistry, options);
  installLocalCli(targetDir, sourceDir, pkgManager, pending);
  if (options.installLint === 'yes') {
    copyConfigs(targetDir, sourceDir, profilesRegistry, options, true);
    installLintDeps(targetDir, pkgManager, options, pending);
  }
  if (options.installHusky === 'yes') {
    installCommitHooks(targetDir, pkgManager, pending);
  }
  if (options.uipro === 'yes') {
    setupUipro(targetDir, pkgManager, pending);
  }
  if (options.level !== 'L1') {
    createIdeLinks(targetDir, sourceDir, options);
    pending.configs.push('.cursor/mcp.json：在 Cursor 设置 → MCP 中按需启用服务后，再补齐 project-id、access-token 等凭证。');
  }
  if (options.level === 'L3') {
    setupOpenSpec(targetDir, sourceDir, options, pkgManager, pending);
  }
  printTools(options.level, options.uipro);
  printInstallReport(targetDir, options, pending);
  return pending.failures.length > 0 ? 1 : 0;
}

async function handleUpdate(options) {
  const targetDir = path.resolve(options.target);
  if (!fs.existsSync(path.join(targetDir, '.agents'))) {
    throw new Error(`${targetDir} 未找到 .agents/，请先运行 init`);
  }
  const sourceDir = getSourceDir();
  const profilesRegistry = readProfilesRegistry(sourceDir);
  if (!options.profileExplicit) {
    options.profile = detectInstalledProfile(targetDir, profilesRegistry);
  } else {
    options.profile = resolveProfileId(profilesRegistry, options.profile) || DEFAULT_PROFILE;
  }
  if (!options.levelExplicit) {
    options.level = detectInstalledLevel(targetDir);
  }
  const pkgManager = detectPkgManager(targetDir);
  info(`更新规范: ${targetDir}`);
  if (options.rulesStrategy === 'ask') {
    await selectRulesStrategy(options);
  }
  if (options.rulesStrategy === 'ask') options.rulesStrategy = 'standard';
  if (fs.existsSync(path.join(targetDir, '.agents', 'skills', 'ui-ux-pro-max')) && options.updateUipro !== 'yes') {
    options.updateUipro = 'yes';
  }
  if (options.uipro === 'yes') {
    options.updateUipro = 'yes';
  }

  if (isInteractive()) {
    console.log('');
    info('请选择要更新的模块（输入编号切换，回车继续）：');
    const items = [
      ['updateSkills', 'Skills（技能）'],
      ['updateRules', 'Rules（规范规则）'],
      ['updateConfigs', 'Configs（lint/format）'],
      ['updateCommands', 'Commands（命令模板）'],
      ['updateIdeLinks', 'IDE Links（IDE 链接）'],
      ['updateOpenSpec', 'OpenSpec'],
      ['updateUipro', 'UI UX Pro Max'],
    ];
    items.forEach(([key, label], index) => console.log(`  ${index + 1}) [${options[key] === 'yes' ? 'Y' : 'N'}] ${label}`));
    const answer = await ask('输入要切换的编号（逗号分隔）', '');
    if (answer) {
      for (const token of answer.split(',')) {
        const idx = Number(token.trim()) - 1;
        if (!Number.isInteger(idx) || idx < 0 || idx >= items.length) continue;
        const key = items[idx][0];
        options[key] = options[key] === 'yes' ? 'no' : 'yes';
      }
    }
  }

  console.log('');
  console.log(color('── 变更摘要 ──', 'bold'));
  console.log(`  Skills:   ${options.updateSkills === 'yes' ? '更新' : '跳过'}`);
  console.log(`  Rules:    ${options.updateRules === 'yes' ? '更新（保留项目特有/自定义）' : '跳过'}`);
  console.log(`  Configs:  ${options.updateConfigs === 'yes' ? '同步（已存在的不覆盖）' : '跳过'}`);
  console.log(`  Commands: ${options.updateCommands === 'yes' ? '同步（覆盖已有命令）' : '同步（仅补新增）'}`);
  console.log(`  IDE Links:${options.updateIdeLinks === 'yes' ? ' 重建' : ' 跳过'}`);
  console.log(`  OpenSpec: ${options.level === 'L3' && options.updateOpenSpec === 'yes' ? '更新' : '跳过'}`);
  console.log(`  UIPro:    ${options.updateUipro === 'yes' ? '重新安装' : '跳过'}`);
  console.log('');

  const pending = { failures: [], configs: [] };
  if (options.updateSkills === 'yes' || options.updateRules === 'yes') {
    copyAgents(targetDir, sourceDir, profilesRegistry, options, {
      skipRules: options.updateRules !== 'yes',
      skipSkills: options.updateSkills !== 'yes',
    });
  }
  installLocalCli(targetDir, sourceDir, pkgManager, pending);
  if (options.updateConfigs === 'yes') {
    copyConfigs(targetDir, sourceDir, profilesRegistry, options, true);
  }
  if (options.level !== 'L1') {
    if (options.updateIdeLinks === 'yes') {
      createIdeLinks(targetDir, sourceDir, options);
    }
    syncCommands(targetDir, sourceDir, 'cursor', options.updateCommands === 'yes');
    syncCommands(targetDir, sourceDir, 'claude', options.updateCommands === 'yes');
  }
  if (options.level === 'L3' && options.updateOpenSpec === 'yes') {
    setupOpenSpec(targetDir, sourceDir, options, pkgManager, pending);
  }
  if (options.updateUipro === 'yes') {
    removePath(path.join(targetDir, '.agents', 'skills', 'ui-ux-pro-max'));
    setupUipro(targetDir, pkgManager, pending);
  }
  ok(`更新完成 (profile: ${options.profile}, compatibility level: ${options.level})`);
  if (pending.failures.length > 0) {
    pending.failures.forEach((item) => warn(item));
  }
  return pending.failures.length > 0 ? 1 : 0;
}

function handleCheck(options) {
  const targetDir = path.resolve(options.target);
  let hasIssue = false;
  console.log('');
  info(`═══ 安装状态检查: ${targetDir} ═══`);
  console.log('');
  const agentsDir = path.join(targetDir, '.agents');
  if (fs.existsSync(agentsDir)) {
    ok('.agents/ 存在');
    if (fs.existsSync(path.join(agentsDir, 'rules'))) ok('  rules/ 存在');
    else { err('  rules/ 缺失'); hasIssue = true; }
    if (fs.existsSync(path.join(agentsDir, 'skills'))) ok('  skills/ 存在');
    else { err('  skills/ 缺失'); hasIssue = true; }
  } else {
    err('.agents/ 不存在');
    hasIssue = true;
  }
  const localCli = path.join(targetDir, 'node_modules', '.bin', isWindows() ? 'ai-spec-auto.cmd' : 'ai-spec-auto');
  if (fs.existsSync(localCli)) ok('./node_modules/.bin/ai-spec-auto 可用');
  else { err('./node_modules/.bin/ai-spec-auto 缺失'); hasIssue = true; }

  for (const ide of ALL_IDES) {
    const ideDir = path.join(targetDir, `.${ide}`);
    if (!fs.existsSync(ideDir)) {
      warn(`.${ide}/ 不存在`);
      continue;
    }
    const rulesLink = path.join(ideDir, 'rules');
    if (fs.existsSync(rulesLink)) ok(`.${ide}/rules 链接有效`);
    else { err(`.${ide}/rules 链接无效`); hasIssue = true; }
    const skillsDir = path.join(ideDir, 'skills');
    if (fs.existsSync(skillsDir)) {
      ok(`.${ide}/skills (${fs.readdirSync(skillsDir).length} 个链接)`);
    } else {
      warn(`.${ide}/skills 不存在`);
    }
  }

  if (fs.existsSync(path.join(targetDir, 'openspec'))) {
    ok('openspec/ 存在');
  } else {
    info('openspec/ 不存在（默认完整安装会生成；兼容 L1/L2 可无）');
  }
  printTools(detectInstalledLevel(targetDir), fs.existsSync(path.join(targetDir, '.agents', 'skills', 'ui-ux-pro-max')) ? 'yes' : 'no');
  console.log('');
  if (hasIssue) {
    err('存在问题，建议运行: npx @ex/ai-spec-auto@latest init .');
    return 1;
  }
  ok('全部检查通过');
  return 0;
}

function uninstallPackageDeps(targetDir, packages) {
  const pkgManager = detectPkgManager(targetDir);
  if (!pkgManager) return;
  runCommand(pkgManager, ['uninstall', ...packages], { cwd: targetDir, stdio: 'ignore' });
}

async function handleUninstall(options) {
  const targetDir = path.resolve(options.target);
  warn(`将移除 ${targetDir} 下的规范库文件`);
  console.log('  包括: .agents/、IDE 链接、lint/format 配置、husky hooks、相关依赖');
  console.log('');
  if (!options.force && isInteractive()) {
    const goOn = await confirm('确认？', false);
    if (!goOn) {
      info('已取消');
      return 0;
    }
  }
  for (const ide of ALL_IDES) {
    const ideDir = path.join(targetDir, `.${ide}`);
    if (fs.existsSync(ideDir)) {
      removePath(path.join(ideDir, 'rules'));
      removePath(path.join(ideDir, 'skills'));
      const remaining = fs.readdirSync(ideDir, { withFileTypes: true }).filter((entry) => entry.name !== '.' && entry.name !== '..');
      if (remaining.length === 0) {
        removePath(ideDir);
      }
    }
  }
  removePath(path.join(targetDir, '.agents'));
  for (const fileName of ['.prettierrc.json', '.prettierignore', '.stylelintrc.json', '.stylelintignore', '.eslintrc.js', '.eslintrc.cjs', '.eslintignore', '.lintstagedrc', 'commitlint.config.js', '.editorconfig']) {
    removePath(path.join(targetDir, fileName));
  }
  removePath(path.join(targetDir, '.husky'));
  const pkgPath = path.join(targetDir, 'package.json');
  if (fs.existsSync(pkgPath)) {
    const pkg = readJson(pkgPath, 'package.json');
    if (pkg.scripts?.prepare && String(pkg.scripts.prepare).includes('husky')) {
      delete pkg.scripts.prepare;
      if (Object.keys(pkg.scripts).length === 0) delete pkg.scripts;
      writeJson(pkgPath, pkg);
    }
  }
  uninstallPackageDeps(targetDir, ['husky', 'lint-staged', '@commitlint/cli', '@commitlint/config-conventional']);
  uninstallPackageDeps(targetDir, ['eslint', 'prettier', 'stylelint', 'stylelint-config-standard', 'stylelint-config-html', 'stylelint-config-recommended-vue', 'postcss-html']);
  ok('卸载完成');
  return 0;
}

function printUsage() {
  console.log(`${color('ai-spec-auto', 'bold')} 安装工具\n`);
  console.log('推荐入口：');
  console.log('  npx @ex/ai-spec-auto@latest init .');
  console.log('  npx @ex/ai-spec-auto@latest update .');
  console.log('  npx @ex/ai-spec-auto@latest sync .');
  console.log('  npx @ex/ai-spec-auto@latest check .');
  console.log('');
  console.log('说明：');
  console.log('  - 默认安装为完整安装（规范 + IDE 适配 + OpenSpec）');
  console.log('  - L1/L2/L3 仅保留为兼容参数，不再作为主路径概念');
  console.log('  - 当前包通过内网 npm registry 分发，首次使用前请先配置 @ex:registry=http://nodejs.100credit.cn/');
  console.log('');
  console.log('命令：');
  console.log('  init [dir]        首次安装到目标项目');
  console.log('  update [dir]      更新规范，支持细粒度模块选择');
  console.log('  sync [dir]        按 manifest / profile 同步规范资产');
  console.log('  check [dir]       检查安装状态');
  console.log('  uninstall [dir]   卸载规范库');
  console.log('');
  console.log('常用选项：');
  console.log('  --profile <name>           技术栈（vue | react）');
  console.log('  --level <L1|L2|L3>         兼容参数，默认仍等价完整安装');
  console.log('  --standard-rules           使用标准规则集');
  console.log('  --custom-rules             启用自定义规则模式');
  console.log('  --package <path>           Monorepo 下指定子包');
  console.log('  --workspace-root           Monorepo 下显式在根目录安装');
  console.log('  --uipro / --no-uipro       安装或跳过 UI UX Pro Max');
  console.log('  --lint / --no-lint         安装或跳过 lint/format');
  console.log('  --husky / --no-husky       安装或跳过提交校验');
  console.log('  --skip-skills              update 时跳过 skills');
  console.log('  --skip-configs             update 时跳过 configs');
  console.log('  --skip-commands            update 时仅补新增命令模板');
  console.log('  --skip-ide-links           update 时跳过 IDE 链接');
  console.log('  --skip-openspec            update 时跳过 OpenSpec 更新');
  console.log('  --skip-uipro               update 时跳过 UI UX Pro Max 更新');
  console.log('  --manifest <path|url>      sync 时指定安装清单');
  console.log('  --dry-run                  sync 时仅预览，不落盘');
  console.log('');
}

async function main(argv) {
  try {
    if (argv[0] === 'sync') {
      const sync = require('./sync');
      return await sync.main(argv.slice(1));
    }

    const options = parseArgs(argv);
    switch (options.command) {
      case 'help':
        printUsage();
        return 0;
      case 'init':
        return await handleInit(options);
      case 'update':
        return await handleUpdate(options);
      case 'check':
        return handleCheck(options);
      case 'uninstall':
        return await handleUninstall(options);
      default:
        printUsage();
        return 1;
    }
  } catch (error) {
    err(error.message);
    return 1;
  }
}

module.exports = { main };

if (require.main === module) {
  main(process.argv.slice(2)).then((code) => process.exit(code));
}
