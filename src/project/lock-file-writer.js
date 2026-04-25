const path = require('path');
const { createChecksum, readJsonIfExists, writeJson } = require('./json-utils');

class LockFileWriter {
  write(rootDir, plan, context = {}, options = {}) {
    const filePath = path.join(rootDir, '.ai-spec/ai-spec.lock.json');
    const existing = readJsonIfExists(filePath);
    const now = options.now || new Date().toISOString();
    const manifest = plan.packages[0]?.recommendedManifest || null;
    const doc = {
      schemaVersion: '1.0.0',
      projectId: context.projectId || '',
      workspaceId: context.workspaceId || '',
      hub: {
        url: plan.hub?.url || '',
      },
      manifest: manifest ? {
        slug: manifest.slug,
        version: manifest.version || '1.0.0',
        checksum: manifest.checksum || createChecksum(`${manifest.slug}@${manifest.version || '1.0.0'}`),
        installedAt: existing?.manifest?.installedAt || now,
      } : null,
      assets: [],
      overlays: [],
      sharedContracts: [],
    };

    writeJson(filePath, doc);
    return {
      path: '.ai-spec/ai-spec.lock.json',
      fullPath: filePath,
      action: existing ? 'update' : 'create',
      data: doc,
    };
  }
}

module.exports = {
  LockFileWriter,
};
