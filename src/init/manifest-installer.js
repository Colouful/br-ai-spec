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

class HubClient {
  async resolveManifest(_slug, _version) {
    return null;
  }
}

class ManifestInstaller {
  constructor(options = {}) {
    this.hubClient = options.hubClient || new HubClient();
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

  install(plan) {
    return {
      source: 'mock-local',
      manifest: plan.packages[0]?.recommendedManifest || null,
      assets: [],
      overlays: [],
      sharedContracts: [],
    };
  }
}

module.exports = {
  FRAMEWORK_MANIFESTS,
  HubClient,
  ManifestInstaller,
};
