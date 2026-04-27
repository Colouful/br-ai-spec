const fs = require('fs');
const path = require('path');
const { ensureDir } = require('../../project/json-utils');
const { SYNC_ACTIONS, PROFILES } = require('../ide-types');

function buildCursorRuleContent() {
  return [
    '---',
    'description: ai-spec-auto 项目规范入口',
    'alwaysApply: true',
    '---',
    '',
    '# ai-spec-auto Cursor 规则入口',
    '',
    '本项目通过 `ai-spec-auto` 管理规则、技能、命令和上下文索引。',
    '',
    '## 读取顺序',
    '',
    '1. `.agents/registry/ide-registry.json`',
    '2. `.agents/registry/registry.index.json`',
    '3. `.ai-spec/context-index.json`',
    '4. `.ai-spec/ai-spec.lock.json`',
    '',
    '## 执行要求',
    '',
    '- 不要跳过索引直接读取所有资产。',
    '- 不要上传源码、原始提示词、原始响应、绝对路径或密钥。',
    '- 先判断当前任务属于 React / Vue 前端开发、组件修改、路由修改、状态管理还是测试修复。',
    '- 再按需读取对应 Rule / Skill。',
  ].join('\n');
}

function buildCommandContent(commandName, profile) {
  const profileLabel = profile === PROFILES.REACT ? 'React' : profile === PROFILES.VUE ? 'Vue' : '前端';

  if (commandName === 'spec-start') {
    return [
      `# /spec-start`,
      '',
      '请按 `ai-spec-auto` 规范启动一个新需求。',
      '',
      '执行前先读取：',
      '',
      '1. `.agents/registry/ide-registry.json`',
      '2. `.agents/registry/registry.index.json`',
      '3. `.ai-spec/context-index.json`',
      '4. `.ai-spec/ai-spec.lock.json`',
      '',
      '要求：',
      '',
      '- 先确认需求范围。',
      `- 再判断 ${profileLabel} 技术栈。`,
      '- 只读取必要 Rule / Skill。',
      '- 不要直接修改业务代码，除非已经进入实现阶段。',
      '- 所有输出使用中文。',
    ].join('\n');
  }

  if (commandName === 'spec-update') {
    return [
      `# /spec-update`,
      '',
      '请按 `ai-spec-auto` 规范补充或修正当前需求。',
      '',
      '执行前先读取：',
      '',
      '1. `.ai-spec/current-run.json`（如果有）',
      '2. `.ai-spec/project.json`',
      '3. `.agents/registry/ide-registry.json`',
      '',
      '要求：',
      '',
      '- 先确认当前 run 状态再补充。',
      '- 补充内容须与原有需求上下文一致。',
      '- 所有输出使用中文。',
    ].join('\n');
  }

  if (commandName === 'spec-status') {
    return [
      `# /spec-status`,
      '',
      '查看当前 `ai-spec-auto` 运行状态。',
      '',
      '读取 `.ai-spec/current-run.json`，输出当前阶段、已完成的步骤、待处理的步骤。',
      '',
      '所有输出使用中文。',
    ].join('\n');
  }

  return '';
}

class CursorAdapter {
  /**
   * 生成 Cursor IDE 指针文件列表
   * @param {{ profile: string }} context
   * @returns {Array<{ relativePath: string, content: string, type: string }>}
   */
  generateFiles(context = {}) {
    const profile = context.profile || PROFILES.AUTO;
    return [
      {
        relativePath: '.cursor/rules/ai-spec-auto.mdc',
        content: buildCursorRuleContent(),
        type: 'pointer-rule',
      },
      {
        relativePath: '.cursor/commands/spec-start.md',
        content: buildCommandContent('spec-start', profile),
        type: 'command',
      },
      {
        relativePath: '.cursor/commands/spec-update.md',
        content: buildCommandContent('spec-update', profile),
        type: 'command',
      },
      {
        relativePath: '.cursor/commands/spec-status.md',
        content: buildCommandContent('spec-status', profile),
        type: 'command',
      },
    ];
  }

  /**
   * 写入所有 Cursor 指针文件到目标目录
   * @param {string} rootDir
   * @param {{ dryRun?: boolean, profile?: string }} options
   * @returns {Array<{ path: string, action: string }>}
   */
  write(rootDir, options = {}) {
    const files = this.generateFiles({ profile: options.profile });
    const results = [];

    for (const file of files) {
      const filePath = path.join(rootDir, file.relativePath);
      const exists = fs.existsSync(filePath);
      const action = exists ? SYNC_ACTIONS.UPDATE : SYNC_ACTIONS.CREATE;

      if (!options.dryRun) {
        ensureDir(path.dirname(filePath));
        fs.writeFileSync(filePath, `${file.content}\n`, 'utf8');
      }

      results.push({
        path: file.relativePath,
        action,
      });
    }

    return results;
  }

  /**
   * 检查 Cursor 指针文件是否存在
   * @param {string} rootDir
   * @returns {Array<{ path: string, exists: boolean }>}
   */
  check(rootDir) {
    return this.generateFiles().map((file) => ({
      path: file.relativePath,
      exists: fs.existsSync(path.join(rootDir, file.relativePath)),
    }));
  }
}

module.exports = {
  CursorAdapter,
  buildCursorRuleContent,
  buildCommandContent,
};
