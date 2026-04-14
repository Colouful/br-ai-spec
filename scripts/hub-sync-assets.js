#!/usr/bin/env node

const fs = require("fs");
const path = require("path");

const PROJECT_ROOT = process.cwd();
const DEFAULT_BASE_URL = "http://localhost:3000";
const DEFAULT_HUB_PROJECT = path.resolve(PROJECT_ROOT, "../skill-q-platform");
const DEFAULT_CONFIG_PATH = path.resolve(PROJECT_ROOT, "scripts/hub-sync-assets.config.json");
const DEFAULT_CONFIG_EXAMPLE_PATH = path.resolve(
  PROJECT_ROOT,
  "scripts/hub-sync-assets.config.example.json",
);

const TEXT_FILE_EXTENSIONS = new Set([
  ".md",
  ".mdx",
  ".txt",
  ".json",
  ".jsonc",
  ".yaml",
  ".yml",
  ".js",
  ".cjs",
  ".mjs",
  ".ts",
  ".tsx",
  ".jsx",
  ".css",
  ".scss",
  ".sass",
  ".less",
  ".html",
  ".xml",
  ".svg",
  ".sh",
  ".ps1",
  ".py",
  ".sql",
  ".toml",
  ".env",
  ".gitignore",
  ".npmrc",
]);

function main() {
  const options = parseArgs(process.argv.slice(2));
  if (options.help) {
    printHelp();
    return;
  }

  run(options).catch((error) => {
    const message = error instanceof Error ? error.message : String(error);
    console.error(`[hub-sync] failed: ${message}`);
    process.exitCode = 1;
  });
}

async function run(cliOptions) {
  const config = loadConfig(cliOptions.configPath);
  const resolved = resolveRuntimeOptions(cliOptions, config);
  const client = new HubClient(resolved);

  const shouldUseAdminSession =
    !resolved.skipRoles ||
    !resolved.skipScenarios ||
    resolved.hasAdminAuthInput;
  if (shouldUseAdminSession) {
    await client.ensureAdminSession();
  }

  const categories = resolved.skipSkills && resolved.skipRules
    ? { skill: [], rule: [] }
    : client.hasAdminSession()
      ? await loadCategories(client, resolved)
      : { skill: [], rule: [] };
  const skillBrowseItems = !client.hasAdminSession() || (resolved.skipSkills && resolved.skipRoles && resolved.skipScenarios)
    ? []
    : await loadBrowseItems(client, "skill", resolved);
  const ruleBrowseItems = !client.hasAdminSession() || (resolved.skipRules && resolved.skipRoles && resolved.skipScenarios)
    ? []
    : await loadBrowseItems(client, "rule", resolved);
  const roleResponse = resolved.skipRoles && resolved.skipScenarios
    ? { items: [] }
    : await client.getJson("/api/admin/roles");
  const scenarioResponse = resolved.skipScenarios
    ? { items: [] }
    : await client.getJson("/api/admin/scenarios");

  const localRegistries = {
    skills: readJson(path.resolve(PROJECT_ROOT, ".agents/registry/skills.json")).skills || {},
    rules: readJson(path.resolve(PROJECT_ROOT, ".agents/registry/rules.json")).rules || {},
    roles: readJson(path.resolve(PROJECT_ROOT, ".agents/registry/roles.json")).roles || {},
    scenarios:
      readJson(path.resolve(PROJECT_ROOT, ".agents/registry/scenario-packages.json")).scenario_packages || {},
  };

  const hubState = {
    categories,
    skillsBySlug: indexBy(skillBrowseItems.items || [], "slug"),
    rulesBySlug: indexBy(ruleBrowseItems.items || [], "slug"),
    rolesBySlug: indexBy(roleResponse.items || [], "slug"),
    scenariosBySlug: indexBy(scenarioResponse.items || [], "slug"),
  };

  const summary = {
    skill: { created: 0, updated: 0, versioned: 0, skipped: 0 },
    rule: { created: 0, updated: 0, versioned: 0, skipped: 0 },
    role: { created: 0, updated: 0, versioned: 0, skipped: 0 },
    scenario: { created: 0, updated: 0, skipped: 0 },
  };

  if (!resolved.skipRules) {
    await syncRules({
      client,
      resolved,
      config,
      localRules: localRegistries.rules,
      hubState,
      summary,
    });
  }

  if (!resolved.skipSkills) {
    await syncSkills({
      client,
      resolved,
      config,
      localSkills: localRegistries.skills,
      hubState,
      summary,
    });
  }

  if (!resolved.skipRoles) {
    await syncRoles({
      client,
      resolved,
      config,
      localRoles: localRegistries.roles,
      hubState,
      summary,
    });
  }

  if (!resolved.skipScenarios) {
    await syncScenarios({
      client,
      resolved,
      config,
      localScenarios: localRegistries.scenarios,
      hubState,
      summary,
    });
  }

  printSummary(summary, resolved.dryRun);
}

function parseArgs(argv) {
  const args = {
    help: false,
    dryRun: false,
    baseUrl: undefined,
    hubProject: undefined,
    configPath: DEFAULT_CONFIG_PATH,
    adminEmail: undefined,
    adminPassword: undefined,
    adminCookie: undefined,
    adminSecret: undefined,
    agentApiKey: undefined,
    skills: undefined,
    rules: undefined,
    roles: undefined,
    scenarios: undefined,
  };

  for (let index = 0; index < argv.length; index += 1) {
    const current = argv[index];
    if (current === "--help" || current === "-h") {
      args.help = true;
      continue;
    }
    if (current === "--dry-run") {
      args.dryRun = true;
      continue;
    }
    const next = argv[index + 1];
    if (current === "--base-url") {
      args.baseUrl = next;
      index += 1;
      continue;
    }
    if (current === "--hub-project") {
      args.hubProject = next;
      index += 1;
      continue;
    }
    if (current === "--config") {
      args.configPath = next ? path.resolve(PROJECT_ROOT, next) : DEFAULT_CONFIG_PATH;
      index += 1;
      continue;
    }
    if (current === "--admin-email") {
      args.adminEmail = next;
      index += 1;
      continue;
    }
    if (current === "--admin-password") {
      args.adminPassword = next;
      index += 1;
      continue;
    }
    if (current === "--admin-cookie") {
      args.adminCookie = next;
      index += 1;
      continue;
    }
    if (current === "--admin-secret") {
      args.adminSecret = next;
      index += 1;
      continue;
    }
    if (current === "--agent-api-key") {
      args.agentApiKey = next;
      index += 1;
      continue;
    }
    if (current === "--skills") {
      args.skills = next;
      index += 1;
      continue;
    }
    if (current === "--rules") {
      args.rules = next;
      index += 1;
      continue;
    }
    if (current === "--roles") {
      args.roles = next;
      index += 1;
      continue;
    }
    if (current === "--scenarios") {
      args.scenarios = next;
      index += 1;
      continue;
    }
    throw new Error(`unknown argument: ${current}`);
  }

  return args;
}

function printHelp() {
  console.log(`
Usage:
  node ./scripts/hub-sync-assets.js [options]

Options:
  --dry-run                    Only print planned operations
  --base-url <url>             Hub base url, default http://localhost:3000
  --hub-project <path>         Hub project path, default ../skill-q-platform
  --config <path>              Private config path, default scripts/hub-sync-assets.config.json
  --admin-email <email>        Hub admin email for login
  --admin-password <pwd>       Hub admin password for login
  --admin-cookie <cookie>      Existing admin_session cookie
  --admin-secret <secret>      HUB_ADMIN_SECRET, used for skill/rule version author bypass
  --agent-api-key <key>        Agent API key, required when Hub enforces upload login for skill/rule version updates
  --skills <all|csv|none>      Sync selected skills
  --rules <all|csv|none>       Sync selected rules
  --roles <all|csv|none>       Sync selected roles
  --scenarios <all|csv|none>   Sync selected scenarios
  --help                       Show help

Examples:
  node ./scripts/hub-sync-assets.js --dry-run
  node ./scripts/hub-sync-assets.js --skills create-api,create-route --rules none
  node ./scripts/hub-sync-assets.js --config scripts/hub-sync-assets.config.json

Notes:
  - If you pass http://localhost:3000/admin, the script will normalize it to http://localhost:3000.
  - skill/rule can run without admin login when your local Hub allows direct upload APIs.
  - Existing skill/rule resources need version publishing for file changes. If Hub requires upload login,
    you must provide --agent-api-key or config hub.agentApiKey for those version updates.
  - existing skill/rule updates usually still need --admin-secret or --agent-api-key.
  - roles/scenarios are admin-only and still require the admin session.
  - A config example is available at ${path.relative(PROJECT_ROOT, DEFAULT_CONFIG_EXAMPLE_PATH)}.
`.trim());
}

function loadConfig(configPath) {
  if (!configPath || !fs.existsSync(configPath)) {
    return {};
  }
  return readJson(configPath);
}

function resolveRuntimeOptions(cliOptions, config) {
  const hubProjectDir = path.resolve(
    PROJECT_ROOT,
    cliOptions.hubProject || config?.hub?.projectDir || DEFAULT_HUB_PROJECT,
  );
  const envFileValues = loadEnvOverrides(hubProjectDir);

  const baseUrl = normalizeBaseUrl(
    cliOptions.baseUrl ||
      process.env.HUB_SYNC_BASE_URL ||
      config?.hub?.baseUrl ||
      DEFAULT_BASE_URL,
  );

  const adminSecret =
    cliOptions.adminSecret ||
    process.env.HUB_ADMIN_SECRET ||
    process.env.HUB_SYNC_ADMIN_SECRET ||
    config?.hub?.adminSecret ||
    envFileValues.HUB_ADMIN_SECRET ||
    "";

  return {
    baseUrl,
    hubProjectDir,
    adminEmail:
      cliOptions.adminEmail ||
      process.env.HUB_SYNC_ADMIN_EMAIL ||
      config?.hub?.adminEmail ||
      "",
    adminPassword:
      cliOptions.adminPassword ||
      process.env.HUB_SYNC_ADMIN_PASSWORD ||
      config?.hub?.adminPassword ||
      "",
    adminCookie:
      cliOptions.adminCookie ||
      process.env.HUB_SYNC_ADMIN_COOKIE ||
      config?.hub?.adminSessionCookie ||
      "",
    adminSecret,
    agentApiKey:
      cliOptions.agentApiKey ||
      process.env.HUB_SYNC_AGENT_API_KEY ||
      config?.hub?.agentApiKey ||
      "",
    hasAdminAuthInput: Boolean(
      cliOptions.adminCookie ||
        process.env.HUB_SYNC_ADMIN_COOKIE ||
        config?.hub?.adminSessionCookie ||
        ((cliOptions.adminEmail ||
          process.env.HUB_SYNC_ADMIN_EMAIL ||
          config?.hub?.adminEmail) &&
          (cliOptions.adminPassword ||
            process.env.HUB_SYNC_ADMIN_PASSWORD ||
            config?.hub?.adminPassword)),
    ),
    dryRun: Boolean(cliOptions.dryRun),
    config,
    skillSelection: normalizeSelection(cliOptions.skills),
    ruleSelection: normalizeSelection(cliOptions.rules),
    roleSelection: normalizeSelection(cliOptions.roles),
    scenarioSelection: normalizeSelection(cliOptions.scenarios),
    skipSkills: isSelectionNone(normalizeSelection(cliOptions.skills)),
    skipRules: isSelectionNone(normalizeSelection(cliOptions.rules)),
    skipRoles: isSelectionNone(normalizeSelection(cliOptions.roles)),
    skipScenarios: isSelectionNone(normalizeSelection(cliOptions.scenarios)),
  };
}

function normalizeSelection(value) {
  if (!value) return { mode: "all", values: new Set() };
  const trimmed = String(value).trim();
  if (!trimmed || trimmed === "all") {
    return { mode: "all", values: new Set() };
  }
  if (trimmed === "none") {
    return { mode: "none", values: new Set() };
  }
  return {
    mode: "pick",
    values: new Set(
      trimmed
        .split(",")
        .map((item) => item.trim())
        .filter(Boolean),
    ),
  };
}

function isSelectionNone(selection) {
  return selection.mode === "none";
}

function loadEnvOverrides(hubProjectDir) {
  const files = [".env.local", ".env.development.local", ".env", ".env.development"];
  const merged = {};
  for (const filename of files) {
    const filePath = path.join(hubProjectDir, filename);
    if (!fs.existsSync(filePath)) continue;
    Object.assign(merged, parseEnvLikeFile(fs.readFileSync(filePath, "utf8")));
  }
  return merged;
}

function parseEnvLikeFile(content) {
  const output = {};
  for (const rawLine of content.split(/\r?\n/)) {
    const line = rawLine.trim();
    if (!line || line.startsWith("#")) continue;
    const match = line.match(/^([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*)$/);
    if (!match) continue;
    let value = match[2].trim();
    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1);
    }
    output[match[1]] = value;
  }
  return output;
}

function normalizeBaseUrl(input) {
  const url = new URL(String(input));
  url.pathname = "";
  url.search = "";
  url.hash = "";
  return url.toString().replace(/\/$/, "");
}

class HubClient {
  constructor(options) {
    this.baseUrl = options.baseUrl;
    this.adminEmail = options.adminEmail;
    this.adminPassword = options.adminPassword;
    this.cookie = options.adminCookie || "";
    this.adminSecret = options.adminSecret || "";
    this.agentApiKey = options.agentApiKey || "";
    this.dryRun = options.dryRun;
  }

  hasAdminSession() {
    return Boolean(this.cookie);
  }

  async ensureAdminSession() {
    if (!this.cookie) {
      if (!this.adminEmail || !this.adminPassword) {
        throw new Error(
          "missing admin auth: provide --admin-email/--admin-password, --admin-cookie, or hub config",
        );
      }
      await this.login();
    }
    await this.getJson("/api/admin/auth/me");
  }

  async login() {
    const response = await fetch(`${this.baseUrl}/api/admin/auth/login`, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        accept: "application/json",
      },
      body: JSON.stringify({
        email: this.adminEmail,
        password: this.adminPassword,
      }),
    });
    if (!response.ok) {
      throw new Error(`admin login failed: ${await readErrorText(response)}`);
    }
    const cookies = getResponseCookies(response);
    const adminSession = cookies.find((cookie) => cookie.startsWith("admin_session="));
    if (!adminSession) {
      throw new Error("admin login succeeded but no admin_session cookie was returned");
    }
    this.cookie = adminSession;
  }

  async getJson(pathname) {
    return this.requestJson(pathname, { method: "GET" });
  }

  async postJson(pathname, body) {
    return this.requestJson(pathname, {
      method: "POST",
      headers: {
        "content-type": "application/json",
      },
      body: JSON.stringify(body),
    });
  }

  async postForm(pathname, formData) {
    const response = await fetch(`${this.baseUrl}${pathname}`, {
      method: "POST",
      headers: this.buildHeaders({}),
      body: formData,
    });
    if (!response.ok) {
      throw new Error(await readErrorText(response));
    }
    return unwrapApiResponse(await response.json());
  }

  async requestJson(pathname, init) {
    const response = await fetch(`${this.baseUrl}${pathname}`, {
      ...init,
      headers: this.buildHeaders(init.headers || {}),
    });
    if (!response.ok) {
      throw new Error(await readErrorText(response));
    }
    return unwrapApiResponse(await response.json());
  }

  buildHeaders(headers) {
    const next = {
      accept: "application/json",
      ...headers,
    };
    if (this.cookie) {
      next.cookie = this.cookie;
    }
    if (this.adminSecret) {
      next["x-hub-admin-secret"] = this.adminSecret;
    }
    if (this.agentApiKey) {
      next.authorization = `Bearer ${this.agentApiKey}`;
    }
    return next;
  }
}

async function loadCategories(client) {
  const [skill, rule] = await Promise.all([
    client.getJson("/api/admin/categories?resourceType=skill"),
    client.getJson("/api/admin/categories?resourceType=rule"),
  ]);
  return {
    skill: skill.items || [],
    rule: rule.items || [],
  };
}

async function loadBrowseItems(client, resourceType) {
  const pageSize = 100;
  let page = 1;
  let total = 0;
  const items = [];
  do {
    const response = await client.getJson(
      `/api/admin/resources/browse?resourceType=${resourceType}&page=${page}&pageSize=${pageSize}`,
    );
    total = Number(response.total || 0);
    items.push(...(response.items || []));
    page += 1;
  } while (items.length < total);
  return { items };
}

async function syncRules(context) {
  const ids = selectResourceIds(context.localRules, context.resolved.ruleSelection);
  for (const ruleId of ids) {
    const local = context.localRules[ruleId];
    const desired = buildRuleAsset(ruleId, local, context);
    if (!desired) {
      context.summary.rule.skipped += 1;
      continue;
    }

    const existing = context.hubState.rulesBySlug[desired.slug];
    if (!existing) {
      if (!desired.categorySlug) {
        warn(`rule ${ruleId}: missing categorySlug, skip create`);
        context.summary.rule.skipped += 1;
        continue;
      }
      if (context.resolved.dryRun) {
        const publicExisting = await fetchPublicResource(context.client, "rule", desired.slug);
        info(`rule ${ruleId}: ${publicExisting ? "update" : "create"}`);
        if (publicExisting) {
          context.summary.rule.updated += 1;
        } else {
          context.summary.rule.created += 1;
        }
        continue;
      }

      const createResult = await createSkillRuleOrNull({
        type: "rule",
        desired,
        client: context.client,
      });
      if (createResult?.created) {
        info(`rule ${ruleId}: created`);
        context.summary.rule.created += 1;
        context.hubState.rulesBySlug[desired.slug] = {
          id: createResult.resource?.id || desired.slug,
          slug: desired.slug,
          name: desired.name,
          registryId: desired.registryId,
          manifestId: desired.manifestId,
          tags: desired.tags,
          supportedProfiles: desired.supportedProfiles,
          categoryName: createResult.resource?.category?.name || desired.categorySlug,
        };
        continue;
      }
    }

    const metadataPatch =
      existing && context.client.hasAdminSession()
        ? buildSkillRuleMetadataPatch("rule", desired, existing)
        : buildSkillRuleFullPatch(desired);
    if (metadataPatch) {
      if (context.resolved.dryRun) {
        info(`rule ${ruleId}: update metadata`);
      } else {
        await context.client.postJson(`/api/rules/${encodeURIComponent(desired.slug)}`, metadataPatch);
        info(`rule ${ruleId}: metadata updated`);
      }
      context.summary.rule.updated += 1;
    }

    const versionChanged = await ensureSkillRuleVersion({
      type: "rule",
      desired,
      slug: desired.slug,
      client: context.client,
      dryRun: context.resolved.dryRun,
    });
    if (versionChanged === "versioned") {
      context.summary.rule.versioned += 1;
    } else if (!metadataPatch) {
      context.summary.rule.skipped += 1;
    }

    context.hubState.rulesBySlug[desired.slug] = {
      ...existing,
      name: desired.name,
      registryId: desired.registryId,
      manifestId: desired.manifestId,
      tags: desired.tags,
      supportedProfiles: desired.supportedProfiles,
    };
  }
}

async function syncSkills(context) {
  const ids = selectResourceIds(context.localSkills, context.resolved.skillSelection);
  for (const skillId of ids) {
    const local = context.localSkills[skillId];
    const desired = buildSkillAsset(skillId, local, context);
    if (!desired) {
      context.summary.skill.skipped += 1;
      continue;
    }

    const existing = context.hubState.skillsBySlug[desired.slug];
    if (!existing) {
      if (!desired.categorySlug) {
        warn(`skill ${skillId}: missing categorySlug, skip create`);
        context.summary.skill.skipped += 1;
        continue;
      }
      if (context.resolved.dryRun) {
        const publicExisting = await fetchPublicResource(context.client, "skill", desired.slug);
        info(`skill ${skillId}: ${publicExisting ? "update" : "create"}`);
        if (publicExisting) {
          context.summary.skill.updated += 1;
        } else {
          context.summary.skill.created += 1;
        }
        continue;
      }

      const createResult = await createSkillRuleOrNull({
        type: "skill",
        desired,
        client: context.client,
      });
      if (createResult?.created) {
        info(`skill ${skillId}: created`);
        context.summary.skill.created += 1;
        context.hubState.skillsBySlug[desired.slug] = {
          id: createResult.resource?.id || desired.slug,
          slug: desired.slug,
          name: desired.name,
          registryId: desired.registryId,
          manifestId: desired.manifestId,
          tags: desired.tags,
          supportedProfiles: desired.supportedProfiles,
          categoryName: createResult.resource?.category?.name || desired.categorySlug,
        };
        continue;
      }
    }

    const metadataPatch =
      existing && context.client.hasAdminSession()
        ? buildSkillRuleMetadataPatch("skill", desired, existing)
        : buildSkillRuleFullPatch(desired);
    if (metadataPatch) {
      if (context.resolved.dryRun) {
        info(`skill ${skillId}: update metadata`);
      } else {
        await context.client.postJson(`/api/skills/${encodeURIComponent(desired.slug)}`, metadataPatch);
        info(`skill ${skillId}: metadata updated`);
      }
      context.summary.skill.updated += 1;
    }

    const versionChanged = await ensureSkillRuleVersion({
      type: "skill",
      desired,
      slug: desired.slug,
      client: context.client,
      dryRun: context.resolved.dryRun,
    });
    if (versionChanged === "versioned") {
      context.summary.skill.versioned += 1;
    } else if (!metadataPatch) {
      context.summary.skill.skipped += 1;
    }

    context.hubState.skillsBySlug[desired.slug] = {
      ...existing,
      name: desired.name,
      registryId: desired.registryId,
      manifestId: desired.manifestId,
      tags: desired.tags,
      supportedProfiles: desired.supportedProfiles,
    };
  }
}

async function syncRoles(context) {
  const ids = selectResourceIds(context.localRoles, context.resolved.roleSelection);
  for (const roleId of ids) {
    const local = context.localRoles[roleId];
    const desired = await buildRoleAsset(roleId, local, context);
    if (!desired) {
      context.summary.role.skipped += 1;
      continue;
    }

    const existing = context.hubState.rolesBySlug[desired.slug];
    if (!existing) {
      if (context.resolved.dryRun) {
        info(`role ${roleId}: create`);
        context.summary.role.created += 1;
      } else {
        await context.client.postJson("/api/admin/roles", desired.payload);
        info(`role ${roleId}: created`);
        context.summary.role.created += 1;
        const refreshed = await context.client.getJson("/api/admin/roles");
        context.hubState.rolesBySlug = indexBy(refreshed.items || [], "slug");
      }
      continue;
    }

    const existingPayload = normalizeRoleResponseToPayload(existing);
    if (deepEqual(existingPayload, desired.payload)) {
      context.summary.role.skipped += 1;
      info(`role ${roleId}: no changes`);
      continue;
    }
    const needsVersion = await roleVersionWouldChange({
      client: context.client,
      slug: existing.slug,
      desiredVersionFiles: desired.versionFiles,
    });

    if (context.resolved.dryRun) {
      info(`role ${roleId}: update${needsVersion ? " + version" : ""}`);
      context.summary.role.updated += 1;
      if (needsVersion) {
        context.summary.role.versioned += 1;
      }
      continue;
    }

    await context.client.postJson("/api/admin/roles/update", {
      id: existing.id,
      ...desired.payload,
    });
    await ensureRoleVersion({
      client: context.client,
      slug: existing.slug,
      desiredVersionFiles: desired.versionFiles,
      dryRun: false,
    });
    info(`role ${roleId}: updated`);
    context.summary.role.updated += 1;
    if (needsVersion) {
      context.summary.role.versioned += 1;
    }

    const refreshed = await context.client.getJson("/api/admin/roles");
    context.hubState.rolesBySlug = indexBy(refreshed.items || [], "slug");
  }
}

async function syncScenarios(context) {
  const ids = selectResourceIds(context.localScenarios, context.resolved.scenarioSelection);
  for (const scenarioId of ids) {
    const local = context.localScenarios[scenarioId];
    const desired = buildScenarioAsset(scenarioId, local, context);
    if (!desired) {
      context.summary.scenario.skipped += 1;
      continue;
    }

    const existing = context.hubState.scenariosBySlug[desired.slug];
    if (!existing) {
      if (context.resolved.dryRun) {
        info(`scenario ${scenarioId}: create`);
        context.summary.scenario.created += 1;
      } else {
        await context.client.postJson("/api/admin/scenarios", desired.payload);
        info(`scenario ${scenarioId}: created`);
        context.summary.scenario.created += 1;
        const refreshed = await context.client.getJson("/api/admin/scenarios");
        context.hubState.scenariosBySlug = indexBy(refreshed.items || [], "slug");
      }
      continue;
    }

    const existingPayload = normalizeScenarioResponseToPayload(existing);
    if (deepEqual(existingPayload, desired.payload)) {
      context.summary.scenario.skipped += 1;
      info(`scenario ${scenarioId}: no changes`);
      continue;
    }

    if (context.resolved.dryRun) {
      info(`scenario ${scenarioId}: update`);
      context.summary.scenario.updated += 1;
      continue;
    }

    await context.client.postJson("/api/admin/scenarios/update", {
      id: existing.id,
      ...desired.payload,
    });
    info(`scenario ${scenarioId}: updated`);
    context.summary.scenario.updated += 1;

    const refreshed = await context.client.getJson("/api/admin/scenarios");
    context.hubState.scenariosBySlug = indexBy(refreshed.items || [], "slug");
  }
}

function buildSkillAsset(skillId, local, context) {
  const override = context.config?.resources?.skills?.[skillId] || {};
  const files = collectSkillFiles(local, skillId);
  if (files.length === 0) {
    warn(`skill ${skillId}: no files collected`);
    return null;
  }

  const primaryFile = pickPrimaryTextFile(files, "SKILL.md") || files[0];
  const parsed = parseFrontmatterFile(primaryFile.content, "skill");
  const name = override.name || parsed.name || skillId;
  const description = override.description || parsed.description || `Sync from local skill ${skillId}`;
  const supportedProfiles = override.supportedProfiles || Object.keys(local.sourceByProfile || {});
  const domains = Array.isArray(local.domains) ? local.domains : [];
  const categorySlug = resolveCategorySlug({
    type: "skill",
    resourceId: skillId,
    override,
    domains,
    categories: context.hubState.categories.skill,
    config: context.config,
  });

  return {
    slug: override.slug || skillId,
    registryId: override.registryId || skillId,
    manifestId: override.manifestId || override.registryId || skillId,
    name,
    description,
    longDescription: override.longDescription || "",
    author: override.author || context.config?.defaults?.author || "Hub Admin",
    categorySlug,
    tags: uniqueKeepOrder(override.tags || domains),
    supportedProfiles: uniqueKeepOrder(supportedProfiles),
    downloadPolicy: override.downloadPolicy || context.config?.defaults?.downloadPolicy || "login",
    files,
  };
}

function buildRuleAsset(ruleId, local, context) {
  const override = context.config?.resources?.rules?.[ruleId] || {};
  const files = collectRuleFiles(local);
  if (files.length === 0) {
    warn(`rule ${ruleId}: no files collected`);
    return null;
  }

  const primaryFile = files[0];
  const parsed = parseFrontmatterFile(primaryFile.content, "rule");
  const name = override.name || parsed.name || ruleId;
  const description = override.description || parsed.description || `Sync from local rule ${ruleId}`;
  const supportedProfiles = override.supportedProfiles || Object.keys(local.sourceByProfile || {});
  const domains = Array.isArray(local.domains) ? local.domains : [];
  const categorySlug = resolveCategorySlug({
    type: "rule",
    resourceId: ruleId,
    override,
    domains,
    categories: context.hubState.categories.rule,
    config: context.config,
  });

  return {
    slug: override.slug || ruleId,
    registryId: override.registryId || ruleId,
    manifestId: override.manifestId || override.registryId || ruleId,
    name,
    description,
    longDescription: override.longDescription || "",
    author: override.author || context.config?.defaults?.author || "Hub Admin",
    categorySlug,
    tags: uniqueKeepOrder(override.tags || domains),
    supportedProfiles: uniqueKeepOrder(supportedProfiles),
    downloadPolicy: override.downloadPolicy || context.config?.defaults?.downloadPolicy || "login",
    files,
  };
}

async function buildRoleAsset(roleId, local, context) {
  const override = context.config?.resources?.roles?.[roleId] || {};
  const sourcePath = path.resolve(PROJECT_ROOT, local.source);
  if (!fs.existsSync(sourcePath)) {
    warn(`role ${roleId}: source not found ${local.source}`);
    return null;
  }

  const uploadParsed = await parseRoleWithHub(context.client, sourcePath);
  const registrySkillSlugs = uniqueKeepOrder([
    ...(Array.isArray(local.skill_priority) ? local.skill_priority : []),
    ...(Array.isArray(local.micro_skill_allowlist) ? local.micro_skill_allowlist : []),
    ...(Array.isArray(uploadParsed.roleData.preferredSkills) ? uploadParsed.roleData.preferredSkills : []),
  ]);
  const registryRuleSlugs = uniqueKeepOrder(Array.isArray(local.rule_ids) ? local.rule_ids : []);
  const skillIds = registrySkillSlugs
    .map((slug) => context.hubState.skillsBySlug[slug]?.id)
    .filter(Boolean);
  const ruleIds = registryRuleSlugs
    .map((slug) => context.hubState.rulesBySlug[slug]?.id)
    .filter(Boolean);
  const domainIds = resolveRoleDomainIds({
    override,
    local,
    uploadParsed,
    config: context.config,
  });
  const name = override.name || uploadParsed.roleData.name || local.name || roleId;
  const slug = override.slug || uploadParsed.roleData.slug || roleId;
  const payload = {
    name,
    slug,
    registryId: override.registryId || roleId,
    manifestId: override.manifestId || override.registryId || roleId,
    author: override.author || context.config?.defaults?.author || "Hub Admin",
    description: override.description || uploadParsed.roleData.description || `${name} role`,
    longDescription: override.longDescription || null,
    publishStatus: override.publishStatus || context.config?.defaults?.rolePublishStatus || "draft",
    roleStatus: override.roleStatus || local.status || uploadParsed.roleData.roleStatus || "draft",
    tags: uniqueKeepOrder(override.tags || local.domains || []),
    supportedProfiles: uniqueKeepOrder(override.supportedProfiles || local.profiles || []),
    triggers: uniqueKeepOrder(override.triggers || uploadParsed.roleData.triggers || []),
    preferredSkills: uniqueKeepOrder(override.preferredSkills || registrySkillSlugs),
    reads: uniqueKeepOrder(override.reads || uploadParsed.roleData.reads || []),
    writes: uniqueKeepOrder(override.writes || uploadParsed.roleData.writes || []),
    handoffTo: uniqueKeepOrder(override.handoffTo || uploadParsed.roleData.handoffTo || []),
    rolePositioning: override.rolePositioning || uploadParsed.sections.rolePositioning || null,
    workingPrinciples: uniqueKeepOrder(
      override.workingPrinciples || uploadParsed.sections.workingPrinciples || [],
    ),
    requiredSteps: uniqueKeepOrder(override.requiredSteps || uploadParsed.sections.requiredSteps || []),
    executionContract: override.executionContract || uploadParsed.sections.executionContract || null,
    outputStandard: override.outputStandard || uploadParsed.sections.outputStandard || null,
    prohibitedActions: uniqueKeepOrder(
      override.prohibitedActions || uploadParsed.sections.prohibitedActions || [],
    ),
    handoffNotes: override.handoffNotes || uploadParsed.sections.handoffNotes || null,
    skillIds,
    ruleIds,
    domainIds,
  };

  const versionFiles = buildRoleVersionFiles({
    ...payload,
    skillSlugs: registrySkillSlugs,
    ruleSlugs: registryRuleSlugs,
    domainSlugs: uniqueKeepOrder(override.domainSlugs || local.domains || uploadParsed.roleData.domains || []),
  });

  return {
    slug,
    payload,
    versionFiles,
  };
}

function buildScenarioAsset(scenarioId, local, context) {
  const override = context.config?.resources?.scenarios?.[scenarioId] || {};
  const roleItems = [];
  for (const roleSlug of local.roles || []) {
    const role = context.hubState.rolesBySlug[roleSlug];
    if (!role) {
      warn(`scenario ${scenarioId}: role ${roleSlug} not found in Hub, skip scenario`);
      return null;
    }
    roleItems.push({
      id: role.id,
      isOptional: Array.isArray(override.optionalRoles) && override.optionalRoles.includes(roleSlug),
    });
  }

  const explicitSkillIds = (local.skills || [])
    .map((slug) => context.hubState.skillsBySlug[slug]?.id)
    .filter(Boolean);
  const explicitRuleIds = (local.rules || [])
    .map((slug) => context.hubState.rulesBySlug[slug]?.id)
    .filter(Boolean);
  const roleSkillIds = roleItems.flatMap((item) => {
    const role = findRoleById(context.hubState, item.id);
    return role ? (role.skillLinks || []).map((link) => link.skillId).filter(Boolean) : [];
  });
  const roleRuleIds = roleItems.flatMap((item) => {
    const role = findRoleById(context.hubState, item.id);
    return role ? (role.ruleLinks || []).map((link) => link.ruleId).filter(Boolean) : [];
  });
  const skillIds = uniqueKeepOrder([...explicitSkillIds, ...roleSkillIds]);
  const ruleIds = uniqueKeepOrder([...explicitRuleIds, ...roleRuleIds]);
  const domainIds = resolveScenarioDomainIds({
    scenario: local,
    override,
    roleItems,
    hubState: context.hubState,
    config: context.config,
  });
  const supportedProfiles = uniqueKeepOrder(
    override.supportedProfiles ||
      local.profiles ||
      context.config?.defaults?.scenarioSupportedProfiles ||
      ["vue", "react"],
  );
  const name = override.name || scenarioId;
  const payload = {
    name,
    slug: override.slug || scenarioId,
    description:
      override.description ||
      `自动同步场景方案，入口 ${override.entryRoleSlug || local.roles?.[0] || "unknown"}，角色链路：${(local.roles || []).join(" -> ")}`,
    longDescription: override.longDescription || null,
    publishStatus: override.publishStatus || context.config?.defaults?.scenarioPublishStatus || "draft",
    tags: uniqueKeepOrder(override.tags || local.domains || []),
    supportedProfiles,
    recommendedIdes: uniqueKeepOrder(
      override.recommendedIdes || context.config?.defaults?.scenarioRecommendedIdes || ["cursor"],
    ),
    entryRoleId: resolveScenarioEntryRoleId(override, local, context.hubState),
    isFeatured:
      typeof override.isFeatured === "boolean"
        ? override.isFeatured
        : Boolean(context.config?.defaults?.scenarioFeatured),
    roles: roleItems,
    skillIds,
    ruleIds,
    domainIds,
  };

  if (!payload.entryRoleId && roleItems.length > 0) {
    payload.entryRoleId = roleItems[0].id;
  }

  return {
    slug: payload.slug,
    payload,
  };
}

async function ensureSkillRuleVersion({ type, desired, slug, client, dryRun }) {
  const versions = await client.getJson(`/api/${type === "skill" ? "skills" : "rules"}/${encodeURIComponent(slug)}/versions`);
  const latest = Array.isArray(versions)
    ? versions.find((item) => item && item.isLatest) || versions[0]
    : null;
  const currentFiles = normalizeFiles(latest?.files || []);
  const desiredFiles = normalizeFiles(desired.files || []);
  if (deepEqual(currentFiles, desiredFiles)) {
    info(`${type} ${slug}: version files unchanged`);
    return "unchanged";
  }

  if (dryRun) {
    info(`${type} ${slug}: publish version`);
    return "versioned";
  }

  const nextVersion = suggestNextPatchVersion(
    Array.isArray(versions) ? versions.map((item) => item.version).filter(Boolean) : [],
  );
  try {
    await client.postJson(`/api/${type === "skill" ? "skills" : "rules"}/${encodeURIComponent(slug)}/versions`, {
      version: nextVersion,
      changelog: "sync from local registry",
      files: desired.files,
      isLatest: true,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    if (message.includes("请先登录后再上传")) {
      throw new Error(
        `${type} ${slug}: version update requires agent login. Provide --agent-api-key or hub.agentApiKey.`,
      );
    }
    throw error;
  }
  info(`${type} ${slug}: version ${nextVersion} created`);
  return "versioned";
}

async function ensureRoleVersion({ client, slug, desiredVersionFiles, dryRun }) {
  const needsChange = await roleVersionWouldChange({
    client,
    slug,
    desiredVersionFiles,
  });
  if (!needsChange) {
    info(`role ${slug}: version files unchanged`);
    return;
  }
  if (dryRun) {
    info(`role ${slug}: publish version`);
    return;
  }
  const versions = await client.getJson(`/api/roles/${encodeURIComponent(slug)}/versions`);
  const nextVersion = suggestNextPatchVersion(
    Array.isArray(versions) ? versions.map((item) => item.version).filter(Boolean) : [],
  );
  await client.postJson(`/api/roles/${encodeURIComponent(slug)}/versions`, {
    version: nextVersion,
    changelog: "sync from local registry",
    isLatest: true,
  });
  info(`role ${slug}: version ${nextVersion} created`);
}

async function roleVersionWouldChange({ client, slug, desiredVersionFiles }) {
  const versions = await client.getJson(`/api/roles/${encodeURIComponent(slug)}/versions`);
  const latest = Array.isArray(versions)
    ? versions.find((item) => item && item.isLatest) || versions[0]
    : null;
  const currentFiles = normalizeFiles(latest?.files || []);
  const desiredFiles = normalizeFiles(desiredVersionFiles || []);
  return !deepEqual(currentFiles, desiredFiles);
}

function collectSkillFiles(local, skillId) {
  const sourcePaths = resolveSourcePaths(local);
  if (sourcePaths.length === 0) return [];
  const absoluteSkillDirs = uniqueKeepOrder(
    sourcePaths.map((relativePath) => path.dirname(path.resolve(PROJECT_ROOT, relativePath))),
  );
  const baseDir = commonAncestor(absoluteSkillDirs);
  const fileEntries = [];
  for (const skillDir of absoluteSkillDirs) {
    for (const absoluteFile of walkFiles(skillDir)) {
      const buffer = fs.readFileSync(absoluteFile);
      if (looksBinary(buffer, absoluteFile)) {
        warn(`skill ${skillId}: skipped binary file ${path.relative(PROJECT_ROOT, absoluteFile)}`);
        continue;
      }
      const relativePath = toPosixPath(path.relative(baseDir, absoluteFile));
      fileEntries.push({
        name: path.basename(absoluteFile),
        path: relativePath,
        content: buffer.toString("utf8"),
      });
    }
  }
  return normalizeFiles(fileEntries);
}

function collectRuleFiles(local) {
  const sourcePaths = resolveSourcePaths(local);
  if (sourcePaths.length === 0) return [];
  const absoluteFiles = uniqueKeepOrder(sourcePaths.map((relativePath) => path.resolve(PROJECT_ROOT, relativePath)));
  const baseDir = commonAncestor(absoluteFiles.map((absoluteFile) => path.dirname(absoluteFile)));
  return normalizeFiles(
    absoluteFiles.map((absoluteFile) => ({
      name: path.basename(absoluteFile),
      path: toPosixPath(path.relative(baseDir, absoluteFile)),
      content: fs.readFileSync(absoluteFile, "utf8"),
    })),
  );
}

function resolveSourcePaths(local) {
  if (local.source) {
    return [local.source];
  }
  if (local.sourceByProfile && typeof local.sourceByProfile === "object") {
    return Object.keys(local.sourceByProfile)
      .sort()
      .map((key) => local.sourceByProfile[key])
      .filter(Boolean);
  }
  return [];
}

async function parseRoleWithHub(client, sourcePath) {
  const buffer = fs.readFileSync(sourcePath);
  const form = new FormData();
  form.set("kind", "role");
  form.set("mode", "zip");
  form.set("file", new Blob([buffer]), path.basename(sourcePath));
  return client.postForm("/api/upload", form);
}

function resolveCategorySlug({ type, resourceId, override, domains, categories, config }) {
  if (override.categorySlug) return override.categorySlug;
  const categoryMap = config?.categoryMap?.[type] || {};
  if (categoryMap[resourceId]) return categoryMap[resourceId];
  for (const domain of domains || []) {
    if (categoryMap[`domain:${domain}`]) {
      return categoryMap[`domain:${domain}`];
    }
  }
  const defaultKey = type === "skill" ? "skillCategorySlug" : "ruleCategorySlug";
  if (config?.defaults?.[defaultKey]) return config.defaults[defaultKey];
  if (Array.isArray(categories) && categories.length === 1) {
    return categories[0].slug;
  }
  return null;
}

function buildSkillRuleMetadataPatch(type, desired, existing) {
  const patch = {};
  const existingCategorySlug = existing.categorySlug || null;
  if (desired.name && desired.name !== existing.name) patch.name = desired.name;
  if (desired.slug && desired.slug !== existing.slug) patch.slug = desired.slug;
  if (desired.registryId !== undefined && desired.registryId !== existing.registryId) {
    patch.registryId = desired.registryId;
  }
  if (desired.manifestId !== undefined && desired.manifestId !== existing.manifestId) {
    patch.manifestId = desired.manifestId;
  }
  patch.description = desired.description;
  patch.longDescription = desired.longDescription || null;
  patch.author = desired.author;
  if (desired.categorySlug && desired.categorySlug !== existingCategorySlug) {
    patch.categorySlug = desired.categorySlug;
  }
  patch.tags = desired.tags;
  patch.supportedProfiles = desired.supportedProfiles;
  patch.downloadPolicy = desired.downloadPolicy;
  return Object.keys(patch).length > 0 ? patch : null;
}

function buildSkillRuleFullPatch(desired) {
  return {
    name: desired.name,
    slug: desired.slug,
    registryId: desired.registryId,
    manifestId: desired.manifestId,
    description: desired.description,
    longDescription: desired.longDescription || null,
    author: desired.author,
    categorySlug: desired.categorySlug,
    tags: desired.tags,
    supportedProfiles: desired.supportedProfiles,
    downloadPolicy: desired.downloadPolicy,
  };
}

async function createSkillRuleOrNull({ type, desired, client }) {
  try {
    const response = await client.postJson(`/${type === "skill" ? "api/skills" : "api/rules"}`, {
      name: desired.name,
      slug: desired.slug,
      registryId: desired.registryId,
      manifestId: desired.manifestId,
      description: desired.description,
      longDescription: desired.longDescription,
      author: desired.author,
      categorySlug: desired.categorySlug,
      tags: desired.tags,
      supportedProfiles: desired.supportedProfiles,
      downloadPolicy: desired.downloadPolicy,
      initialFiles: desired.files,
    });
    return {
      created: true,
      resource: response?.[type] || response || null,
    };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    if (isConflictMessage(message)) {
      return { created: false, resource: null };
    }
    throw error;
  }
}

async function fetchPublicResource(client, type, slug) {
  try {
    return await client.getJson(`/api/${type === "skill" ? "skills" : "rules"}/${encodeURIComponent(slug)}`);
  } catch {
    return null;
  }
}

function resolveRoleDomainIds({ override, local, uploadParsed, config }) {
  const explicit = Array.isArray(override.domainIds) ? override.domainIds : [];
  if (explicit.length > 0) {
    return explicit;
  }
  const configMap = config?.domainIdMap || {};
  const mapped = uniqueKeepOrder([
    ...(Array.isArray(local.domains) ? local.domains : []),
    ...(Array.isArray(uploadParsed.roleData.domains) ? uploadParsed.roleData.domains : []),
  ])
    .map((slug) => configMap[slug])
    .filter(Boolean);
  if (mapped.length > 0) {
    return mapped;
  }
  if (Array.isArray(uploadParsed.mappedDomainIds) && uploadParsed.mappedDomainIds.length > 0) {
    return uniqueKeepOrder(uploadParsed.mappedDomainIds);
  }
  return [];
}

function resolveScenarioDomainIds({ scenario, override, roleItems, hubState, config }) {
  if (Array.isArray(override.domainIds) && override.domainIds.length > 0) {
    return uniqueKeepOrder(override.domainIds);
  }
  const domainMap = config?.domainIdMap || {};
  const mapped = uniqueKeepOrder(Array.isArray(scenario.domains) ? scenario.domains : [])
    .map((slug) => domainMap[slug])
    .filter(Boolean);
  if (mapped.length > 0) {
    return mapped;
  }
  const roleDomainIds = [];
  for (const roleItem of roleItems) {
    const role = Object.values(hubState.rolesBySlug).find((item) => item.id === roleItem.id);
    if (role && Array.isArray(role.domainLinks)) {
      roleDomainIds.push(...role.domainLinks.map((link) => link.domainId).filter(Boolean));
    }
  }
  return uniqueKeepOrder(roleDomainIds);
}

function resolveScenarioEntryRoleId(override, local, hubState) {
  if (override.entryRoleId) return override.entryRoleId;
  if (override.entryRoleSlug && hubState.rolesBySlug[override.entryRoleSlug]) {
    return hubState.rolesBySlug[override.entryRoleSlug].id;
  }
  const firstRoleSlug = Array.isArray(local.roles) ? local.roles[0] : null;
  return firstRoleSlug && hubState.rolesBySlug[firstRoleSlug]
    ? hubState.rolesBySlug[firstRoleSlug].id
    : null;
}

function normalizeRoleResponseToPayload(item) {
  return {
    name: item.name,
    slug: item.slug,
    registryId: item.registryId || null,
    manifestId: item.manifestId || null,
    author: item.author,
    description: item.description,
    longDescription: item.longDescription || null,
    publishStatus: item.publishStatus,
    roleStatus: item.roleStatus,
    tags: normalizeStringArray(item.tags),
    supportedProfiles: normalizeStringArray(item.supportedProfiles),
    triggers: normalizeStringArray(item.triggers),
    preferredSkills: normalizeStringArray(item.preferredSkills),
    reads: normalizeStringArray(item.reads),
    writes: normalizeStringArray(item.writes),
    handoffTo: normalizeStringArray(item.handoffTo),
    rolePositioning: item.rolePositioning || null,
    workingPrinciples: normalizeStringArray(item.workingPrinciples),
    requiredSteps: normalizeStringArray(item.requiredSteps),
    executionContract: item.executionContract || null,
    outputStandard: item.outputStandard || null,
    prohibitedActions: normalizeStringArray(item.prohibitedActions),
    handoffNotes: item.handoffNotes || null,
    skillIds: (item.skillLinks || []).map((link) => link.skillId),
    ruleIds: (item.ruleLinks || []).map((link) => link.ruleId),
    domainIds: (item.domainLinks || []).map((link) => link.domainId),
  };
}

function normalizeScenarioResponseToPayload(item) {
  return {
    name: item.name,
    slug: item.slug,
    description: item.description,
    longDescription: item.longDescription || null,
    publishStatus: item.publishStatus,
    tags: normalizeStringArray(item.tags),
    supportedProfiles: normalizeStringArray(item.supportedProfiles),
    recommendedIdes: normalizeStringArray(item.recommendedIdes),
    entryRoleId: item.entryRoleId || null,
    isFeatured: Boolean(item.isFeatured),
    roles: (item.roles || []).map((link) => ({
      id: link.roleId,
      isOptional: Boolean(link.isOptional),
    })),
    skillIds: (item.skills || []).map((link) => link.skillId),
    ruleIds: (item.rules || []).map((link) => link.ruleId),
    domainIds: (item.domainLinks || []).map((link) => link.domainId),
  };
}

function buildRoleVersionFiles(input) {
  return normalizeFiles([
    {
      name: `${input.slug}.role.json`,
      path: `.hub/roles/${input.slug}.role.json`,
      content: JSON.stringify(
        {
          name: input.name,
          slug: input.slug,
          author: input.author,
          description: input.description,
          longDescription: input.longDescription ?? null,
          publishStatus: input.publishStatus,
          roleStatus: input.roleStatus,
          supportedProfiles: input.supportedProfiles,
          tags: input.tags,
          triggers: input.triggers,
          preferredSkills: input.preferredSkills,
          reads: input.reads,
          writes: input.writes,
          handoffTo: input.handoffTo,
          skills: input.skillSlugs,
          rules: input.ruleSlugs,
          capabilityDomains: input.domainSlugs,
          sections: {
            rolePositioning: input.rolePositioning ?? null,
            workingPrinciples: input.workingPrinciples,
            requiredSteps: input.requiredSteps,
            executionContract: input.executionContract ?? null,
            outputStandard: input.outputStandard ?? null,
            prohibitedActions: input.prohibitedActions,
            handoffNotes: input.handoffNotes ?? null,
          },
        },
        null,
        2,
      ),
    },
  ]);
}

function walkFiles(rootDir) {
  const results = [];
  const stack = [rootDir];
  while (stack.length > 0) {
    const current = stack.pop();
    const entries = fs.readdirSync(current, { withFileTypes: true });
    for (const entry of entries) {
      if (entry.name === ".DS_Store") continue;
      const absolutePath = path.join(current, entry.name);
      if (entry.isDirectory()) {
        if (entry.name === ".git" || entry.name === "node_modules") continue;
        stack.push(absolutePath);
        continue;
      }
      results.push(absolutePath);
    }
  }
  results.sort();
  return results;
}

function commonAncestor(paths) {
  if (!Array.isArray(paths) || paths.length === 0) {
    return PROJECT_ROOT;
  }
  const split = paths.map((item) => path.resolve(item).split(path.sep).filter(Boolean));
  const minLength = Math.min(...split.map((parts) => parts.length));
  const shared = [];
  for (let index = 0; index < minLength; index += 1) {
    const value = split[0][index];
    if (split.every((parts) => parts[index] === value)) {
      shared.push(value);
    } else {
      break;
    }
  }
  const prefix = path.isAbsolute(paths[0]) ? path.sep : "";
  return prefix + shared.join(path.sep);
}

function parseFrontmatterFile(content, type) {
  const trimmed = content.trimStart();
  if (!trimmed.startsWith("---")) {
    return {};
  }
  const match = trimmed.match(/^---\s*\n([\s\S]*?)\n---\s*\n?([\s\S]*)$/);
  if (!match) {
    return {};
  }
  const meta = {};
  for (const line of match[1].split(/\r?\n/)) {
    const parsed = line.match(/^([A-Za-z0-9_-]+)\s*:\s*(.*)$/);
    if (!parsed) continue;
    let value = parsed[2].trim();
    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1);
    }
    meta[parsed[1].toLowerCase()] = value;
  }
  const name =
    meta.name || meta.title || meta["display-name"] || (type === "skill" ? meta.skill : meta.rule);
  const description = meta.description || meta.summary || meta.desc;
  return {
    name: typeof name === "string" ? name : undefined,
    description: typeof description === "string" ? description : undefined,
  };
}

function pickPrimaryTextFile(files, filename) {
  return files.find((file) => path.basename(file.path).toLowerCase() === filename.toLowerCase()) || null;
}

function normalizeFiles(files) {
  return [...files]
    .map((file) => ({
      name: file.name,
      path: toPosixPath(file.path),
      ...(typeof file.content === "string" ? { content: file.content } : {}),
    }))
    .sort((left, right) => left.path.localeCompare(right.path));
}

function normalizeStringArray(value) {
  if (!Array.isArray(value)) return [];
  return value.filter((item) => typeof item === "string");
}

function looksBinary(buffer, absolutePath) {
  const extension = path.extname(absolutePath).toLowerCase();
  if (TEXT_FILE_EXTENSIONS.has(extension)) {
    return false;
  }
  if (!extension && path.basename(absolutePath).startsWith(".")) {
    return false;
  }
  return buffer.includes(0);
}

function suggestNextPatchVersion(currentVersions) {
  const parsed = currentVersions
    .map((value) => {
      const match = String(value).trim().match(/^(\d+)\.(\d+)\.(\d+)$/);
      if (!match) return null;
      return {
        major: Number(match[1]),
        minor: Number(match[2]),
        patch: Number(match[3]),
      };
    })
    .filter(Boolean);
  if (parsed.length === 0) return "1.0.0";
  parsed.sort((left, right) => {
    if (left.major !== right.major) return right.major - left.major;
    if (left.minor !== right.minor) return right.minor - left.minor;
    return right.patch - left.patch;
  });
  const latest = parsed[0];
  return `${latest.major}.${latest.minor}.${latest.patch + 1}`;
}

function selectResourceIds(registry, selection) {
  const all = Object.keys(registry);
  if (selection.mode === "all") return all;
  if (selection.mode === "none") return [];
  return all.filter((id) => selection.values.has(id));
}

function uniqueKeepOrder(items) {
  const output = [];
  const seen = new Set();
  for (const item of items || []) {
    if (!item) continue;
    if (seen.has(item)) continue;
    seen.add(item);
    output.push(item);
  }
  return output;
}

function toPosixPath(filePath) {
  return filePath.split(path.sep).join("/");
}

function deepEqual(left, right) {
  return JSON.stringify(left) === JSON.stringify(right);
}

function isConflictMessage(message) {
  return (
    typeof message === "string" &&
    (message.includes("已存在") ||
      message.includes("409") ||
      message.includes("duplicate") ||
      message.includes("Unique"))
  );
}

function indexBy(items, key) {
  const output = {};
  for (const item of items || []) {
    if (!item || !item[key]) continue;
    output[item[key]] = item;
  }
  return output;
}

function findRoleById(hubState, id) {
  return Object.values(hubState.rolesBySlug || {}).find((item) => item.id === id) || null;
}

function unwrapApiResponse(payload) {
  if (
    payload &&
    typeof payload === "object" &&
    Object.prototype.hasOwnProperty.call(payload, "data") &&
    Object.prototype.hasOwnProperty.call(payload, "code")
  ) {
    return payload.data;
  }
  return payload;
}

function getResponseCookies(response) {
  if (typeof response.headers.getSetCookie === "function") {
    return response.headers.getSetCookie().map((cookie) => cookie.split(";")[0]);
  }
  const cookie = response.headers.get("set-cookie");
  return cookie ? [cookie.split(";")[0]] : [];
}

async function readErrorText(response) {
  const text = await response.text();
  try {
    const parsed = JSON.parse(text);
    return parsed?.error || parsed?.message || text;
  } catch {
    return text || `${response.status} ${response.statusText}`;
  }
}

function readJson(filePath) {
  return JSON.parse(fs.readFileSync(filePath, "utf8"));
}

function warn(message) {
  console.warn(`[hub-sync] warn: ${message}`);
}

function info(message) {
  console.log(`[hub-sync] ${message}`);
}

function printSummary(summary, dryRun) {
  console.log("");
  console.log(`[hub-sync] ${dryRun ? "dry-run summary" : "summary"}`);
  console.log(
    JSON.stringify(summary, null, 2),
  );
}

main();
