const fs = require('fs');
const path = require('path');
const { createChecksum } = require('../project/json-utils');
const { MANIFEST_CONFIDENCE, PROJECT_KINDS } = require('./types');

const FRAMEWORK_MANIFESTS = Object.freeze({
  nextjs: 'frontend-react-nextjs-standard',
  'react-vite': 'frontend-react-vite-standard',
  'react-webpack': 'frontend-react-standard',
  'vue-vite': 'frontend-vue-vite-standard',
  'spring-boot': 'backend-java-springboot-standard',
  'spring-mvc': 'backend-java-springmvc-legacy-standard',
  'spring-cloud': 'backend-java-springcloud-standard',
  nestjs: 'backend-node-nestjs-standard',
  fastapi: 'backend-python-fastapi-standard',
  go: 'backend-go-standard',
});

/** 需要从 br-ai-spec 复制到目标项目的 .agents 子目录 */
const AGENT_ASSET_DIRS = ['rules', 'skills', 'roles', 'commands', 'flows', 'orchestration', 'templates'];

class HubClient {
  async resolveManifest(_slug, _version) {
    return null;
  }
}

/** 递归复制目录 */
function copyDirSync(src, dest) {
  fs.mkdirSync(dest, { recursive: true });
  for (const entry of fs.readdirSync(src, { withFileTypes: true })) {
    const srcPath = path.join(src, entry.name);
    const destPath = path.join(dest, entry.name);
    if (entry.isDirectory()) {
      copyDirSync(srcPath, destPath);
    } else if (entry.isSymbolicLink()) {
      // 跳过符号链接，改为复制目标内容
      try {
        const realPath = fs.realpathSync(srcPath);
        if (fs.statSync(realPath).isDirectory()) {
          copyDirSync(realPath, destPath);
        } else {
          fs.copyFileSync(realPath, destPath);
        }
      } catch (_) {
        // symlink 无法解析则跳过
      }
    } else {
      fs.copyFileSync(srcPath, destPath);
    }
  }
}

class ManifestInstaller {
  constructor(options = {}) {
    this.hubClient = options.hubClient || new HubClient();
    this.pkgRoot = options.pkgRoot || path.join(__dirname, '..', '..');
  }

  recommendForPackage(pkg, options = {}) {
    if (options.manualManifestSlug) {
      return {
        slug: options.manualManifestSlug,
        version: '1.0.0',
        score: 100,
        reasons: ['用户通过 --manifest 手动指定 Manifest'],
        warnings: ['这是用户手动指定的 Manifest，未接入真实 Hub API 校验'],
        requiresConfirmation: false,
        checksum: createChecksum(`${options.manualManifestSlug}@1.0.0`),
      };
    }

    const primary = pkg.primary || null;
    if (!primary) {
      return null;
    }

    if (pkg.projectKind === PROJECT_KINDS.CLI_TOOL) {
      return null;
    }
    if (pkg.projectKind === PROJECT_KINDS.LIBRARY && (primary.tags || []).includes('frontend')) {
      return null;
    }

    const framework = primary?.framework || null;
    const slug = FRAMEWORK_MANIFESTS[framework];
    if (!slug) {
      return null;
    }

    const score = primary?.confidence || 0;
    if (score < MANIFEST_CONFIDENCE.REQUIRE_CONFIRM) {
      return null;
    }

    const reasons = [];

    reasons.push(`根据 scanner primary ${framework} 推荐 ${slug}`);
    for (const reason of primary?.reasons || []) {
      reasons.push(reason);
    }

    return {
      slug,
      version: '1.0.0',
      score,
      reasons,
      warnings: score < MANIFEST_CONFIDENCE.AUTO_SELECT ? ['技术栈识别置信度低于 80，需要人工确认'] : [],
      requiresConfirmation: score < MANIFEST_CONFIDENCE.AUTO_SELECT,
      checksum: createChecksum(`${slug}@1.0.0`),
    };
  }

  /**
   * 将 br-ai-spec 的 .agents 资产复制到目标项目
   * @param {{ workspace: { rootDir: string } }} plan
   * @returns {{ source: string, manifest: object, assets: string[], overlays: string[], sharedContracts: string[] }}
   */
  install(plan) {
    const rootDir = plan.workspace?.rootDir;
    if (!rootDir) {
      return {
        source: 'local',
        manifest: plan.packages[0]?.recommendedManifest || null,
        assets: [],
        overlays: [],
        sharedContracts: [],
      };
    }

    const sourceAgentsDir = path.join(this.pkgRoot, '.agents');
    const targetAgentsDir = path.join(rootDir, '.agents');

    if (!fs.existsSync(sourceAgentsDir)) {
      return {
        source: 'local',
        manifest: plan.packages[0]?.recommendedManifest || null,
        assets: [],
        overlays: [],
        sharedContracts: [],
        warnings: ['本地 .agents 源目录不存在，未安装资产文件'],
      };
    }

    const installedAssets = [];

    for (const dir of AGENT_ASSET_DIRS) {
      const srcDir = path.join(sourceAgentsDir, dir);
      const destDir = path.join(targetAgentsDir, dir);

      if (!fs.existsSync(srcDir)) continue;

      try {
        // 如果目标已存在，先删除再复制（确保最新）
        if (fs.existsSync(destDir)) {
          fs.rmSync(destDir, { recursive: true, force: true });
        }
        copyDirSync(srcDir, destDir);
        installedAssets.push(`.agents/${dir}/`);
      } catch (error) {
        // 复制失败的目录不阻断整体流程
        installedAssets.push(`.agents/${dir}/ (失败: ${error.message})`);
      }
    }

    return {
      source: 'local',
      manifest: plan.packages[0]?.recommendedManifest || null,
      assets: installedAssets,
      overlays: [],
      sharedContracts: [],
    };
  }
}

module.exports = {
  AGENT_ASSET_DIRS,
  FRAMEWORK_MANIFESTS,
  HubClient,
  ManifestInstaller,
  copyDirSync,
};
