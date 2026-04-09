const fs = require('fs');
const path = require('path');
const {
  resolveProfileId,
} = require('./profile-registry');

const PACKAGE_ROOT = path.join(__dirname, '..');

function readJsonFile(filePath, label) {
  const raw = fs.readFileSync(filePath, 'utf8');
  try {
    return JSON.parse(raw);
  } catch (error) {
    throw new Error(`${label} is not valid JSON: ${filePath}`);
  }
}

function uniqueWorkspaceRoots(targetDir) {
  const roots = [PACKAGE_ROOT, path.resolve(targetDir || '.')];
  return [...new Set(roots)];
}

function mergeNamedEntries(baseEntries, overrideEntries) {
  const merged = {
    ...(baseEntries || {}),
  };

  for (const [id, entry] of Object.entries(overrideEntries || {})) {
    const nextEntry = {
      ...(merged[id] || {}),
    };
    if (entry && typeof entry === 'object' && !Array.isArray(entry)) {
      if (Object.prototype.hasOwnProperty.call(entry, 'source')) {
        delete nextEntry.sourceByProfile;
      }
      if (Object.prototype.hasOwnProperty.call(entry, 'sourceByProfile')) {
        delete nextEntry.source;
      }
    }
    merged[id] = {
      ...nextEntry,
      ...(entry || {}),
    };
  }

  return merged;
}

function loadRegistryFile(targetDir, fileName, objectKey) {
  const roots = uniqueWorkspaceRoots(targetDir);
  const loaded = [];

  for (const root of roots) {
    const filePath = path.join(root, '.agents', 'registry', fileName);
    if (!fs.existsSync(filePath)) {
      continue;
    }
    loaded.push({
      root,
      filePath,
      data: readJsonFile(filePath, fileName),
    });
  }

  if (loaded.length === 0) {
    return {
      version: 1,
      support_files: [],
      [objectKey]: {},
      _sources: [],
    };
  }

  const merged = {
    version: typeof loaded[0].data.version === 'number' ? loaded[0].data.version : 1,
    support_files: Array.isArray(loaded[0].data.support_files) ? [...loaded[0].data.support_files] : [],
    [objectKey]: {},
    _sources: loaded.map((item) => item.filePath),
  };

  for (const item of loaded) {
    if (typeof item.data.version === 'number') {
      merged.version = item.data.version;
    }
    if (Array.isArray(item.data.support_files)) {
      merged.support_files = [...item.data.support_files];
    }
    merged[objectKey] = mergeNamedEntries(merged[objectKey], item.data[objectKey]);
  }

  return merged;
}

function loadRolesRegistry(targetDir) {
  return loadRegistryFile(targetDir, 'roles.json', 'roles');
}

function loadFlowsRegistry(targetDir) {
  return loadRegistryFile(targetDir, 'flows.json', 'flows');
}

function loadRulesRegistry(targetDir) {
  return loadRegistryFile(targetDir, 'rules.json', 'rules');
}

function loadSkillsRegistry(targetDir) {
  return loadRegistryFile(targetDir, 'skills.json', 'skills');
}

function loadProfilesRegistry(targetDir) {
  return loadRegistryFile(targetDir, 'profiles.json', 'profiles');
}

function getRoleRuntimeConfig(targetDir, roleId) {
  if (!roleId) {
    return null;
  }
  const rolesRegistry = loadRolesRegistry(targetDir);
  return rolesRegistry.roles?.[roleId] || null;
}

function getFlowRuntimeConfig(targetDir, flowId) {
  if (!flowId) {
    return null;
  }
  const flowsRegistry = loadFlowsRegistry(targetDir);
  return flowsRegistry.flows?.[flowId] || null;
}

function getRuleRuntimeConfig(targetDir, ruleId) {
  if (!ruleId) {
    return null;
  }
  const rulesRegistry = loadRulesRegistry(targetDir);
  return rulesRegistry.rules?.[ruleId] || null;
}

function getSkillRuntimeConfig(targetDir, skillId) {
  if (!skillId) {
    return null;
  }
  const skillsRegistry = loadSkillsRegistry(targetDir);
  return skillsRegistry.skills?.[skillId] || null;
}

function resolveRuntimeProfileId(targetDir, profileId) {
  if (!profileId) {
    return null;
  }
  return resolveProfileId(loadProfilesRegistry(targetDir), profileId);
}

module.exports = {
  PACKAGE_ROOT,
  loadProfilesRegistry,
  loadRulesRegistry,
  loadSkillsRegistry,
  loadRolesRegistry,
  loadFlowsRegistry,
  getRuleRuntimeConfig,
  getSkillRuntimeConfig,
  getRoleRuntimeConfig,
  getFlowRuntimeConfig,
  resolveRuntimeProfileId,
};
