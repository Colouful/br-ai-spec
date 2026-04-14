# Hub 资产同步脚本说明

这份说明对应当前项目里的本地脚本 [scripts/hub-sync-assets.js](/Users/lizhenwei/workspace/vueworkspace/bairong/br-ai-spec/scripts/hub-sync-assets.js)。

目标只有一个：把当前仓库维护的 `skill / rule / 专家 / 场景方案` 批量同步到本地启动的 Hub 平台，减少在管理弹窗里重复上传文档的成本。

## 适用范围

脚本当前覆盖 4 类资产：

- `skill`
- `rule`
- `role`
- `scenario`

本地来源分别是：

- `skill`: [.agents/registry/skills.json](/Users/lizhenwei/workspace/vueworkspace/bairong/br-ai-spec/.agents/registry/skills.json)
- `rule`: [.agents/registry/rules.json](/Users/lizhenwei/workspace/vueworkspace/bairong/br-ai-spec/.agents/registry/rules.json)
- `role`: [.agents/registry/roles.json](/Users/lizhenwei/workspace/vueworkspace/bairong/br-ai-spec/.agents/registry/roles.json)
- `scenario`: [.agents/registry/scenario-packages.json](/Users/lizhenwei/workspace/vueworkspace/bairong/br-ai-spec/.agents/registry/scenario-packages.json)

## 脚本能力

- 支持新增和更新
- 支持 `--dry-run`
- 支持只同步指定资源
- `role` 解析直接复用 Hub 的 `/api/upload`
- `skill / rule` 会对比最新版本文件，只有文件变化才发新版本
- `scenario` 会自动聚合显式绑定的 role/skill/rule

脚本默认不会改主链流程或本项目 runtime，只是把本地 registry 和资产文档同步到 Hub。

当前脚本分两条通道：

- `skill / rule`
  - 优先走开放接口
  - 本地环境允许时可以不登录
- `role / scenario`
  - 继续走 `/api/admin/*`
  - 需要管理员会话

## 前置条件

1. Hub 本地服务已经启动
2. Hub 地址可访问
3. 如果要同步 `role / scenario`，需要拿到 Hub 管理员登录方式

你当前环境里的默认地址可以直接用：

```text
http://localhost:3000/admin
```

脚本内部会自动归一化成：

```text
http://localhost:3000
```

## 认证说明

脚本分三类认证：

### 1. 管理员会话

只用于：

- 获取现有 role/scenario 列表
- 创建和更新 role/scenario
- 可选地读取 admin 分类和资源列表，给 skill/rule 做更精准 diff

可用方式：

- `--admin-email` + `--admin-password`
- `--admin-cookie`
- 或在本地私有配置里写 `hub.adminEmail / hub.adminPassword / hub.adminSessionCookie`

### 2. Agent API Key

只在一种情况必须要有：

- 现有 `skill / rule` 需要发新版本
- 并且 Hub 开启了“上传必须登录”

原因是 Hub 的 `skill / rule` 版本接口会走上传登录校验；仅有管理员 cookie 不一定够。

所以如果你发现脚本报这类错误：

```text
version update requires agent login
```

就补：

- `--agent-api-key`
- 或配置 `hub.agentApiKey`

### 3. HUB_ADMIN_SECRET

如果你不想登录，但要更新现有的 `skill / rule`，本地建议补：

- `--admin-secret`
- 或配置 `hub.adminSecret`

它主要用于：

- 现有 `skill / rule` 的作者校验绕过
- 避免作者名和 agent 归属不完全一致时被拦住

但它不能替代 `/api/admin/*` 的管理员登录。

脚本会优先从这些地方找：

- 命令行参数
- 当前 shell 环境变量
- `scripts/hub-sync-assets.config.json`
- Hub 项目目录下的 `.env.local / .env / .env.development*`

## 配置文件

示例配置在：

- [scripts/hub-sync-assets.config.example.json](/Users/lizhenwei/workspace/vueworkspace/bairong/br-ai-spec/scripts/hub-sync-assets.config.example.json)

实际本地私有配置建议新建：

- `scripts/hub-sync-assets.config.json`

这个文件已经建议加入 `.gitignore`，避免把凭据提交进仓库。

## 最常用命令

先看计划：

```bash
node ./scripts/hub-sync-assets.js --dry-run --config scripts/hub-sync-assets.config.json
```

全量同步：

```bash
node ./scripts/hub-sync-assets.js --config scripts/hub-sync-assets.config.json
```

只同步专家和场景方案：

```bash
node ./scripts/hub-sync-assets.js --skills none --rules none --roles all --scenarios all --config scripts/hub-sync-assets.config.json
```

只同步几个 skill：

```bash
node ./scripts/hub-sync-assets.js --skills create-api,create-route,theme-variables --rules none --roles none --scenarios none --config scripts/hub-sync-assets.config.json
```

只同步 `skill / rule`，不走管理员登录：

```bash
node ./scripts/hub-sync-assets.js \
  --skills all \
  --rules all \
  --roles none \
  --scenarios none \
  --config scripts/hub-sync-assets.config.json
```

## 同步策略

### skill

- 从 `skills.json` 读取 `source` 或 `sourceByProfile`
- 单路径 skill 会上传整个 skill 目录
- 多 profile skill 会把 profile 目录内容一起打成同一组版本文件
- 创建时优先直连 `POST /api/skills`
- 更新时优先直连 `POST /api/skills/:slug`
- 版本对比走 `/api/skills/:slug/versions`
- 只有文件变化才发 patch version

### rule

- 从 `rules.json` 读取 `source` 或 `sourceByProfile`
- 规则通常是 markdown 单文件
- 创建时优先直连 `POST /api/rules`
- 更新时优先直连 `POST /api/rules/:slug`
- 版本对比走 `/api/rules/:slug/versions`
- 只有文件变化才发 patch version

### role

- 从 `roles.json` 读取 `source`
- 解析复用 Hub 的 `/api/upload?kind=role`
- 创建和更新走 `/api/admin/roles` / `/api/admin/roles/update`
- skill/rule 关联优先从 registry 元数据拿：
  - `rule_ids`
  - `skill_priority`
  - `micro_skill_allowlist`
- domain 会按以下顺序解析：
  - `resources.roles.<id>.domainIds`
  - `domainIdMap`
  - Hub `/api/upload` 自动匹配出来的 `mappedDomainIds`
- 更新后会自动补 role version 快照

### scenario

- 从 `scenario-packages.json` 读取基础链路
- 创建和更新走 `/api/admin/scenarios` / `/api/admin/scenarios/update`
- 默认把 `roles` 当成必选角色链
- `optionalRoles` 通过本地 config 覆盖
- `entryRoleSlug` 通过本地 config 指定；没配时默认取第一个角色
- `skillIds / ruleIds` 会自动聚合：
  - 场景显式声明的 skill/rule
  - 关联 role 上已经挂载的 skill/rule

## 场景方案建议

当前 `scenario-packages.json` 比较轻，所以推荐把下面这些内容放进本地 config 覆盖：

- `name`
- `description`
- `longDescription`
- `entryRoleSlug`
- `optionalRoles`
- `recommendedIdes`
- `supportedProfiles`
- `tags`
- `isFeatured`

也就是说：

- registry 继续维护“安装组合”
- config 负责补 Hub 场景页需要的展示和交互字段

这样不会污染当前仓库已有 registry 结构，也不会影响主链流程。

## category 和 domain 的处理

### category

`skill / rule` 创建时必须有 category。

脚本会按这个顺序找：

1. `resources.skills|rules.<id>.categorySlug`
2. `categoryMap.skill|rule.<id>`
3. `categoryMap.skill|rule.domain:<domain>`
4. `defaults.skillCategorySlug / defaults.ruleCategorySlug`
5. 如果当前拿到了 admin 分类且该资源类型只有一个分类，就直接用那个

如果还是找不到，脚本会跳过创建并报 warning。

### domain

`role / scenario` 的 domainId 优先级：

1. 资源级覆盖
2. `domainIdMap`
3. role 上传解析得到的 `mappedDomainIds`
4. scenario 回退到已选 role 的 domainLinks

## 不影响现有流程的边界

这套脚本只负责 Hub 资产同步，不会：

- 改 `.agents/flows/*`
- 改 runtime flow 选择
- 改主链 `requirement-analyst -> frontend-implementer -> code-guardian -> archive-change`
- 改命令语义

它只是把当前仓库里已经确定的资产，通过 Hub API 同步过去。

## 推荐执行顺序

如果你第一次接入，建议按这个顺序：

1. 先填 `scripts/hub-sync-assets.config.json`
2. 跑一次 `--dry-run`
3. 先同步 `rule / skill`
4. 确认 Hub 里已有真实 skill/rule 资源后，再同步 `role`
5. 最后同步 `scenario`

原因很直接：

- role 依赖 skill/rule 的 Hub 真实 ID
- scenario 依赖 role 的 Hub 真实 ID

## 已知限制

- `skill / rule` 在无管理员模式下，会优先走直连接口；如果资源已存在，更新通常仍建议补 `adminSecret` 或 `agentApiKey`
- 如果 Hub 开启上传登录，已有 `skill / rule` 发版本必须提供 agent API key
- `scenario-packages.json` 本身没有描述类字段，所以更推荐通过 config 补全场景展示信息
- 脚本目前是本地运行工具，不会自动监听文件变化

## 相关文件

- [scripts/hub-sync-assets.js](/Users/lizhenwei/workspace/vueworkspace/bairong/br-ai-spec/scripts/hub-sync-assets.js)
- [scripts/hub-sync-assets.config.example.json](/Users/lizhenwei/workspace/vueworkspace/bairong/br-ai-spec/scripts/hub-sync-assets.config.example.json)
- [.agents/registry/skills.json](/Users/lizhenwei/workspace/vueworkspace/bairong/br-ai-spec/.agents/registry/skills.json)
- [.agents/registry/rules.json](/Users/lizhenwei/workspace/vueworkspace/bairong/br-ai-spec/.agents/registry/rules.json)
- [.agents/registry/roles.json](/Users/lizhenwei/workspace/vueworkspace/bairong/br-ai-spec/.agents/registry/roles.json)
- [.agents/registry/scenario-packages.json](/Users/lizhenwei/workspace/vueworkspace/bairong/br-ai-spec/.agents/registry/scenario-packages.json)
