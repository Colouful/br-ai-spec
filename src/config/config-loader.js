const fs = require('fs');
const os = require('os');
const path = require('path');
const { DEFAULT_CONFIG } = require('./defaults');

function isPlainObject(value) {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

function deepMerge(...objects) {
  const output = {};
  for (const object of objects) {
    if (!isPlainObject(object)) continue;
    for (const [key, value] of Object.entries(object)) {
      if (isPlainObject(value) && isPlainObject(output[key])) {
        output[key] = deepMerge(output[key], value);
      } else if (Array.isArray(value)) {
        output[key] = [...value];
      } else if (isPlainObject(value)) {
        output[key] = deepMerge(value);
      } else if (value !== undefined) {
        output[key] = value;
      }
    }
  }
  return output;
}

function readJsonIfExists(filePath) {
  if (!filePath || !fs.existsSync(filePath)) return null;
  try {
    return JSON.parse(fs.readFileSync(filePath, 'utf8'));
  } catch (error) {
    const wrapped = new Error(`配置文件解析失败：${filePath}。请检查 JSON 格式。`);
    wrapped.code = 'VALIDATION_FAILED';
    wrapped.cause = error;
    throw wrapped;
  }
}

function normalizeCliOptions(cliOptions = {}) {
  const normalized = { ...cliOptions };
  if (cliOptions.executor && !normalized.execution) {
    normalized.execution = { executor: cliOptions.executor };
    delete normalized.executor;
  }
  if (cliOptions.mode && !normalized.execution?.mode) {
    normalized.execution = { ...(normalized.execution || {}), mode: cliOptions.mode };
    delete normalized.mode;
  }
  return normalized;
}

function forcePrivacyPolicy(config) {
  return deepMerge(config, {
    privacyPolicy: {
      uploadSourceCode: false,
      uploadAbsolutePath: false,
      uploadUserName: false,
      uploadRawPrompt: false,
      uploadRawResponse: false,
      uploadFileContent: false,
    },
  });
}

class ConfigLoader {
  async load(input = {}) {
    const rootDir = path.resolve(input.rootDir || process.cwd());
    const globalConfigPath = input.globalConfigPath || path.join(os.homedir(), '.ai-spec-auto', 'config.json');
    const workspaceConfig = readJsonIfExists(path.join(rootDir, '.ai-spec', 'workspace.json'));
    const projectConfig = readJsonIfExists(path.join(rootDir, '.ai-spec', 'project.json'));
    const policyConfig = readJsonIfExists(path.join(rootDir, '.ai-spec', 'policy.json'));
    const globalConfig = readJsonIfExists(globalConfigPath);
    const cliOptions = normalizeCliOptions(input.cliOptions || {});

    const merged = deepMerge(
      DEFAULT_CONFIG,
      globalConfig,
      input.manifestConfig,
      input.agentProfile,
      workspaceConfig,
      projectConfig,
      policyConfig,
      input.runConfig,
      cliOptions,
    );

    return forcePrivacyPolicy(merged);
  }
}

module.exports = {
  ConfigLoader,
  deepMerge,
  readJsonIfExists,
};
