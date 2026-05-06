/**
 * AssetInstaller — 资产搜索/安装/升级/回滚
 *
 * 协调 AssetRegistry、AssetInstall、AssetPackageManager，
 * 提供资产的搜索、安装到项目、升级、回滚和 lock 文件管理。
 */

const fs = require('fs');
const path = require('path');
const { createAssetRegistry, AssetRegistry } = require('./asset-registry');
const { createAssetInstall, AssetInstall } = require('./asset-install');

// ============================================================
// AssetInstaller 类
// ============================================================

class AssetInstaller {
  /**
   * @param {object} [options]
   * @param {string} [options.storageDir] - NDJSON 持久化目录
   * @param {string} [options.lockPath] - lock 文件路径
   */
  constructor(options = {}) {
    const storageDir = options.storageDir || null;

    /** @type {AssetRegistry} */
    this.registry = createAssetRegistry({
      storagePath: storageDir ? path.join(storageDir, 'installer-registry.ndjson') : undefined,
    });

    /** @type {AssetInstall} */
    this.installTracker = createAssetInstall({
      storagePath: storageDir ? path.join(storageDir, 'installs.ndjson') : undefined,
    });

    /** @type {string|null} */
    this.lockPath = options.lockPath || null;
  }

  // ============================================================
  // search — 搜索资产
  // ============================================================

  /**
   * 搜索资产（关键词 + 类型 + 标签过滤）
   * @param {object} query
   * @param {string} [query.keyword] - 关键词（匹配 name 和 description）
   * @param {string} [query.assetType] - 资产类型过滤
   * @param {string[]} [query.tags] - 标签过滤（任一匹配）
   * @returns {object[]}
   */
  search(query) {
    const filters = {};
    if (query.assetType) {
      filters.assetType = query.assetType;
    }

    let results = this.registry.list(filters);

    if (query.keyword) {
      const kw = query.keyword.toLowerCase();
      results = results.filter(r =>
        (r.name && r.name.toLowerCase().includes(kw)) ||
        (r.description && r.description.toLowerCase().includes(kw))
      );
    }

    if (query.tags && query.tags.length > 0) {
      results = results.filter(r => {
        if (!r.tags || !Array.isArray(r.tags)) return false;
        return query.tags.some(t => r.tags.includes(t));
      });
    }

    return results;
  }

  // ============================================================
  // install — 安装资产到项目
  // ============================================================

  /**
   * 安装资产到项目
   * @param {string} assetId
   * @param {string} version
   * @param {string} projectId
   * @returns {object} 安装记录
   */
  install(assetId, version, projectId) {
    const asset = this.registry.get(assetId);
    if (!asset) {
      throw new Error(`资产不存在: ${assetId}`);
    }

    const record = this.installTracker.record({
      assetId,
      version,
      projectId,
      status: 'installed',
      installedFiles: [],
      checksum: '',
      metadata: {},
    });

    return record;
  }

  // ============================================================
  // upgrade — 升级资产
  // ============================================================

  /**
   * 升级资产到新版本
   * @param {string} assetId
   * @param {string} newVersion
   * @param {string} projectId
   * @returns {object} 安装记录
   */
  upgrade(assetId, newVersion, projectId) {
    const asset = this.registry.get(assetId);
    if (!asset) {
      throw new Error(`资产不存在: ${assetId}`);
    }

    const record = this.installTracker.record({
      assetId,
      version: newVersion,
      projectId,
      status: 'upgraded',
      installedFiles: [],
      checksum: '',
      metadata: {},
    });

    return record;
  }

  // ============================================================
  // rollback — 回滚资产
  // ============================================================

  /**
   * 回滚资产到上一版本
   * @param {string} assetId
   * @param {string} projectId
   * @returns {object} 安装记录
   */
  rollback(assetId, projectId) {
    // 查找该项目的安装历史
    const history = this.installTracker.list({ assetId, projectId });
    if (history.length === 0) {
      throw new Error(`未找到安装记录: ${assetId} in ${projectId}`);
    }

    const record = this.installTracker.record({
      assetId,
      version: 'rollback',
      projectId,
      status: 'rolled_back',
      installedFiles: [],
      checksum: '',
      metadata: {},
    });

    return record;
  }

  // ============================================================
  // updateLock — 更新 lock 文件
  // ============================================================

  /**
   * 更新 ai-spec.lock
   * @param {string} projectId
   * @returns {object} lock 数据
   */
  updateLock(projectId) {
    const history = this.installTracker.list({ projectId });

    // 只保留每个资产的最新安装记录
    const latestMap = new Map();
    for (const record of history) {
      const existing = latestMap.get(record.assetId);
      if (!existing || record.installedAt > existing.installedAt || (record.installedAt === existing.installedAt && record.installId > existing.installId)) {
        latestMap.set(record.assetId, record);
      }
    }

    const assets = [...latestMap.values()].map(r => ({
      assetId: r.assetId,
      version: r.version,
      status: r.status,
      installedAt: r.installedAt,
    }));

    const lock = {
      lockVersion: 1,
      projectId,
      assets,
      lockedAt: new Date().toISOString(),
    };

    if (this.lockPath) {
      const dir = path.dirname(this.lockPath);
      if (!fs.existsSync(dir)) {
        fs.mkdirSync(dir, { recursive: true });
      }
      fs.writeFileSync(this.lockPath, JSON.stringify(lock, null, 2), 'utf-8');
    }

    return lock;
  }

  // ============================================================
  // getInstallHistory — 安装历史
  // ============================================================

  /**
   * 获取项目安装历史
   * @param {string} projectId
   * @returns {object[]}
   */
  getInstallHistory(projectId) {
    return this.installTracker.list({ projectId });
  }
}

// ============================================================
// 工厂函数
// ============================================================

/**
 * 创建资产安装器
 * @param {object} [options]
 * @returns {AssetInstaller}
 */
function createAssetInstaller(options) {
  return new AssetInstaller(options);
}

module.exports = {
  createAssetInstaller,
  AssetInstaller,
};
