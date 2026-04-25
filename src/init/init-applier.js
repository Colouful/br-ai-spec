const { ContextIndexWriter } = require('../project/context-index-writer');
const { LockFileWriter } = require('../project/lock-file-writer');
const { PolicyConfigWriter } = require('../project/policy-config-writer');
const { ProjectConfigWriter } = require('../project/project-config-writer');
const { RegistryIndexWriter } = require('../project/registry-index-writer');
const { WorkspaceConfigWriter } = require('../project/workspace-config-writer');
const { IdePointerInjector } = require('./ide-pointer-injector');
const { ManifestInstaller } = require('./manifest-installer');
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
    this.hubClient = options.hubClient || new HubClient();
    this.visualReporter = options.visualReporter || new VisualReporter();
  }

  async apply(rootDir, plan, options = {}) {
    this.manifestInstaller.install(plan);
    const writtenFiles = [];
    const now = options.now || new Date().toISOString();

    const projectResult = this.projectConfigWriter.write(rootDir, plan, { now });
    writtenFiles.push(projectResult);

    const policyResult = this.policyConfigWriter.write(rootDir, plan, { now });
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
