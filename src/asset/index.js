const {
  ASSET_PACKAGE_VERSION,
  ASSET_TYPES,
  ASSET_SOURCES,
  VALID_ASSET_TYPES,
  VALID_ASSET_SOURCES,
  createAssetPackage,
  validateAssetPackage,
  computeAssetChecksum,
  guessAssetType,
  buildAssetIdentity,
} = require('./asset-package');

const { AssetPackageManager } = require('./asset-package-manager');

module.exports = {
  // asset-package schema
  ASSET_PACKAGE_VERSION,
  ASSET_TYPES,
  ASSET_SOURCES,
  VALID_ASSET_TYPES,
  VALID_ASSET_SOURCES,
  createAssetPackage,
  validateAssetPackage,
  computeAssetChecksum,
  guessAssetType,
  buildAssetIdentity,
  // asset-package-manager
  AssetPackageManager,
};
