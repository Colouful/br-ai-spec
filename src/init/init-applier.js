const fs = require('fs');
const path = require('path');
const { ContextIndexWriter } = require('../project/context-index-writer');
const { LockFileWriter } = require('../project/lock-file-writer');
const { PolicyConfigWriter } = require('../project/policy-config-writer');
const { ProjectConfigWriter } = require('../project/project-config-writer');
const { RegistryIndexWriter } = require('../project/registry-index-writer');
const { WorkspaceConfigWriter } = require('../project/workspace-config-writer');
const { IdePointerInjector } = require('./ide-pointer-injector');
const { IdeLinker } = require('./ide-linker');
const { ManifestInstaller, MANIFEST_TO_PROFILE } = require('./manifest-installer');
const { HubClient } = require('../hub/hub-client');
const { resolveHubConfig } = require('../hub/hub-config');
const { VisualReporter } = require('../visual/visual-reporter');
const pkg = require('../../package.json');

class InitApplier {
  constructor(options = {}) {
    this.manifestInstaller = options.manifestInstaller || new ManifestInstaller();
    this.projectConfigWriter = options.projectConfigWriter || new ProjectConfigWriter();
    this.policyConfigWriter = options.policyConfigWriter || new PolicyConfigWriter();
    this.workspaceConfigWriter = options.workspaceConfigWriter || new WorkspaceConfigWriter();
    this.lockFileWriter = options.lockFileWriter || new LockFileWriter();
    this.registryIndexWriter = options.registryIndexWriter || new RegistryIndexWriter();
    this.contextIndexWriter = options.contextIndexWriter || new ContextIndexWriter();
    this.idePointerInjector = options.idePointerInjector || new IdePointerInjector();
    this.ideLinker = options.ideLinker || new IdeLinker();
    this.hubClient = options.hubClient || new HubClient();
    this.visualReporter = options.visualReporter || new VisualReporter();
  }

  async apply(rootDir, plan, options = {}) {
    const writtenFiles = [];
    const installResult = this.manifestInstaller.install(plan);
    for (const asset of installResult.assets || []) {
      writtenFiles.push({
        path: asset,
        action: 'create',
        description: '安装本地资产文件',
      });
    }
    // 在写入 IDE 指针文件之前先创建符号链接，防止 IdePointerInjector
    // 把 .cursor/rules/ 创建为普通目录
    this.ideLinker.link(rootDir);

    const now = options.now || new Date().toISOString();

    const projectResult = this.projectConfigWriter.write(rootDir, plan, { now });
    writtenFiles.push(projectResult);

    // 写入 manifest.json，供 project-init 等技能读取 profile 信息
    this._writeManifest(rootDir, plan, now);

    const policyResult = this.policyConfigWriter.write(rootDir, plan, { now, visualUrl: options.visualUrl });
    writtenFiles.push(policyResult);

    const workspaceResult = this.workspaceConfigWriter.write(rootDir, plan, { now });
    if (workspaceResult) {
      writtenFiles.push(workspaceResult);
    }

    const context = {
      projectId: projectResult.data.projectId,
      workspaceId: workspaceResult?.data?.workspaceId || '',
    };

    writtenFiles.push(this.lockFileWriter.write(rootDir, plan, context, { now }));
    writtenFiles.push(this.registryIndexWriter.write(rootDir, plan, context, { now }));
    writtenFiles.push(this.contextIndexWriter.write(rootDir, context, { now }));
    writtenFiles.push(...this.idePointerInjector.write(rootDir));

    const result = {
      projectId: context.projectId,
      workspaceId: context.workspaceId,
      writtenFiles: writtenFiles.map((item) => ({
        path: item.path,
        action: item.action,
      })),
      warnings: [],
    };
    await this.reportInstallRecord(rootDir, plan, context, result, options);
    await this.reportProjectState(rootDir, result, options);
    return result;
  }

  _writeManifest(rootDir, plan, now) {
    const manifestPath = path.join(rootDir, '.ai-spec', 'manifest.json');
    const existing = fs.existsSync(manifestPath)
      ? JSON.parse(fs.readFileSync(manifestPath, 'utf8'))
      : {};

    const manifestSlug = plan.packages[0]?.recommendedManifest?.slug || null;
    const profile = MANIFEST_TO_PROFILE[manifestSlug] || null;
    const profiles = profile ? [profile] : [];

    const next = {
      ...existing,
      profiles,
      profile: profiles[0] || null,
      generated_at: now,
    };

    if (plan.packages && plan.packages.length > 0) {
      next.packages = plan.packages.map((pkg) => ({
        name: pkg.name,
        path: pkg.path,
        manifest: pkg.recommendedManifest?.slug || null,
      }));
    }

    fs.mkdirSync(path.dirname(manifestPath), { recursive: true });
    fs.writeFileSync(manifestPath, JSON.stringify(next, null, 2) + '\n', 'utf8');
  }

  async reportInstallRecord(rootDir, plan, context, result, options = {}) {
    const hubConfig = resolveHubConfig(rootDir, { hubUrl: options.hubUrl });
    const manifest = plan.packages.find((item) => item.recommendedManifest)?.recommendedManifest || null;
    if (!hubConfig.url || !manifest) return;
    try {
      await this.hubClient.createInstallRecord({
        projectId: context.projectId,
        workspaceId: context.workspaceId || '',
        manifest: {
          slug: manifest.slug,
          version: manifest.version || '1.0.0',
        },
        packages: plan.packages.map((item) => ({
          packageId: item.packageId,
          path: item.path,
          manifest: item.recommendedManifest ? {
            slug: item.recommendedManifest.slug,
            version: item.recommendedManifest.version || '1.0.0',
          } : null,
        })),
        installedAt: new Date().toISOString(),
        client: {
          name: 'br-ai-spec',
          version: pkg.version || '',
        },
      }, { hubUrl: hubConfig.url });
    } catch (error) {
      result.warnings.push(`Install Record 上报失败，不影响本地 init：${error.message}`);
    }
  }

  async reportProjectState(rootDir, result, options = {}) {
    const report = await this.visualReporter.reportProjectState(rootDir, {
      visualUrl: options.visualUrl,
      eventId: `project-state:${result.projectId}:init-apply`,
    });
    if (report.warning) {
      result.warnings.push(report.warning);
    }
  }
}

module.exports = {
  InitApplier,
};
