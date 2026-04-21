/**
 * Visual Config Loader
 * 
 * 功能：加载 .ai-spec/visual-config.json 配置文件
 * 优先级：
 * 1. .ai-spec/visual-config.json（项目级）
 * 2. ~/.ai-spec/visual-config.json（用户级）
 * 3. 环境变量覆盖
 */

const fs = require('fs');
const path = require('path');
const os = require('os');

/**
 * 加载 visual 配置
 * @returns {VisualConfig | null}
 */
function loadVisualConfig() {
  // 优先级 1: 项目级配置
  const projectConfigPath = path.join(process.cwd(), '.ai-spec/visual-config.json');
  let config = loadConfigFromFile(projectConfigPath);

  // 优先级 2: 用户级配置
  if (!config) {
    const userConfigPath = path.join(os.homedir(), '.ai-spec/visual-config.json');
    config = loadConfigFromFile(userConfigPath);
  }

  if (!config) {
    return null;
  }

  // 优先级 3: 环境变量覆盖
  config = applyEnvironmentOverrides(config);

  // 校验必填字段
  if (!validateConfig(config)) {
    console.warn('[visual-hooks] config validation failed');
    return null;
  }

  return config;
}

/**
 * 从文件加载配置
 * @param {string} filePath
 * @returns {VisualConfig | null}
 */
function loadConfigFromFile(filePath) {
  if (!fs.existsSync(filePath)) {
    return null;
  }

  try {
    const content = fs.readFileSync(filePath, 'utf-8');
    const config = JSON.parse(content);
    console.log(`[visual-hooks] config loaded from: ${filePath}`);
    return config;
  } catch (err) {
    console.warn(`[visual-hooks] failed to load config from ${filePath}:`, err.message);
    return null;
  }
}

/**
 * 应用环境变量覆盖
 * @param {VisualConfig} config
 * @returns {VisualConfig}
 */
function applyEnvironmentOverrides(config) {
  const overrides = { ...config };

  if (process.env.AI_SPEC_VISUAL_ENABLED !== undefined) {
    overrides.enabled = process.env.AI_SPEC_VISUAL_ENABLED === 'true';
  }

  if (process.env.AI_SPEC_VISUAL_URL) {
    overrides.visual_url = process.env.AI_SPEC_VISUAL_URL;
  }

  if (process.env.AI_SPEC_VISUAL_WORKSPACE_ID) {
    overrides.workspace_id = process.env.AI_SPEC_VISUAL_WORKSPACE_ID;
  }

  if (process.env.AI_SPEC_VISUAL_PUSH_TIMEOUT_MS) {
    overrides.push_timeout_ms = parseInt(process.env.AI_SPEC_VISUAL_PUSH_TIMEOUT_MS, 10);
  }

  return overrides;
}

/**
 * 校验配置
 * @param {VisualConfig} config
 * @returns {boolean}
 */
function validateConfig(config) {
  if (!config.visual_url) {
    console.warn('[visual-hooks] config missing: visual_url');
    return false;
  }

  if (!config.workspace_id) {
    console.warn('[visual-hooks] config missing: workspace_id');
    return false;
  }

  // 校验 visual_url 格式
  try {
    new URL(config.visual_url);
  } catch (err) {
    console.warn('[visual-hooks] invalid visual_url:', config.visual_url);
    return false;
  }

  return true;
}

/**
 * 创建默认配置示例文件
 * @param {string} targetPath
 */
function createConfigExample(targetPath) {
  const exampleConfig = {
    $schema: 'https://schemas.br-ai-spec.internal/visual-config.schema.json',
    enabled: false,
    visual_url: 'http://localhost:3000',
    workspace_id: 'my-project',
    workspace_name: '项目显示名称',
    push_mode: 'hook',
    push_timeout_ms: 3000,
    retry_times: 1,
    collector_schedule: null
  };

  try {
    const dir = path.dirname(targetPath);
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }

    fs.writeFileSync(
      targetPath,
      JSON.stringify(exampleConfig, null, 2),
      'utf-8'
    );

    console.log(`[visual-hooks] config example created: ${targetPath}`);
    return true;
  } catch (err) {
    console.warn(`[visual-hooks] failed to create config example:`, err.message);
    return false;
  }
}

module.exports = {
  loadVisualConfig,
  createConfigExample
};
