---
name: install-ai-spec-auto
description: 当用户要求给当前项目接入 ai-spec-auto(安装工具)、自动执行 init(初始化安装) 命令、安装规则/技能/OpenSpec(需求规范流程) 或完成首次安装时，使用本技能自动检查前置条件、推断 profile(技术栈) 与安装目标，并在当前项目执行安装和自检。
compatibility: 需要当前工作区可执行 Node.js(运行时) 与 npm(包管理工具) 或 pnpm(包管理工具)，目标项目通常应包含 package.json，并且能够访问 @ex 内网 registry(包仓库)。
metadata:
  version: "1.1.0"
---

# ai-spec-auto 安装初始化

## 定位

本技能负责把 `ai-spec-auto(安装工具)` 安装到当前项目，并执行首次 `init(初始化安装)`。

职责边界：

- 本技能负责安装前检查、命令执行、安装后自检与结果摘要
- `project-init(项目规范初始化)` 负责安装完成后的项目规则生成，不负责首次安装
- `update(更新)`、`check(自检)`、`uninstall(卸载)` 不属于本技能主路径

## 触发条件

当用户表达以下意思时，调用本技能：

- "给当前项目安装 ai-spec-auto"
- "帮我在这个仓库执行 init"
- "帮我把这套规范接入当前项目"
- "自动初始化安装规则和技能"
- "给别人项目快速装上这套 ai 规范"
- "在当前项目执行 ai-spec-auto init"

以下场景不要触发：

- 用户明确要执行 `project-init(项目规范初始化)`
- 用户只想执行 `update(更新)`、`check(自检)` 或 `uninstall(卸载)`
- 用户想创建一个新的 `skill(技能)`
- 用户只是问安装文档位置，没有要求执行安装

## 执行原则

- 默认直接执行命令，不先输出长篇安装说明
- 尽量使用显式参数，避免用户卡在交互式选择
- 能自动推断的内容就自动推断；只有高风险歧义时才确认
- 默认启用 `--custom-rules(自定义规则)`，让 `init(初始化安装)` 自动勾选当前支持按项目自定义生成的全部规则
- 已安装项目优先提醒使用 `check(自检)` 或 `update(更新)`，除非用户明确要求重装

## 安装前核对清单

- [ ] 当前目录或目标目录是要安装的业务项目，通常存在 `package.json`
- [ ] 本机可执行 `node(运行时)` 与 `npm(包管理工具)` 或 `pnpm(包管理工具)`
- [ ] `~/.npmrc` 已配置 `@ex:registry=http://nodejs.100credit.cn/`
- [ ] 已判断当前项目是否已安装，避免误把重复安装当成首次接入

## 自动判断规则

### 1. 是否已安装

以下任一条件成立，都视为项目已经接入过：

- 存在 `.ai-spec/install-state.json`
- 存在 `.agents/`
- 存在 `openspec/`

处理方式：

- 已安装且用户没有明确要求重装：优先执行 `check(自检)`，必要时建议 `update(更新)`
- 已安装且用户明确要求重装：允许继续执行 `init(初始化安装)`，但要先说明会覆盖受管安装产物

### 2. 推断 profile(技术栈)

按下面顺序判断：

1. `package.json` 中存在 `vue`、`@vitejs/plugin-vue`、`nuxt` 等依赖，判定为 `vue`
2. `package.json` 中存在 `react`、`next`、`@vitejs/plugin-react` 等依赖，判定为 `react`
3. 无法可靠判断时，默认按 `vue` 执行，并在执行前用一句话说明该假设
4. 若同时明显命中 `vue` 与 `react`，且用户未指明目标子项目，先确认，不要擅自选择

### 3. 判断安装目标

- 当前目录本身就是业务包：直接对 `.(当前目录)` 安装
- `Monorepo(多包仓库)` 根目录且用户明确给出子包路径：使用 `--package <path>`
- `Monorepo` 根目录下存在多个前端子包且用户未说明：先确认目标子包
- 单包仓库：直接执行 `init .`

### 4. 选择命令入口

优先使用下面命令：

```bash
npx @ex/ai-spec-auto@latest init . --profile <vue|react> --custom-rules
```

如命中 `Monorepo(多包仓库)` 子包，则使用：

```bash
npx @ex/ai-spec-auto@latest init . --profile <vue|react> --custom-rules --package <subpath>
```

仅在“当前工作区就是 `ai-spec-auto(安装工具)` 源码仓库，且用户明确要走本地源码调试安装”时，才改用：

```bash
node ./bin/cli.js init <target> --profile <vue|react> --custom-rules
```

### 5. 自定义规则选择策略

本技能默认把 `--custom-rules(自定义规则)` 作为首次安装命令的一部分。

原因：

- 底层 `install-workflow(安装主链)` 已支持在非交互模式下把全部可自定义规则自动选中
- 这样安装完成后，`project-init(项目规范初始化)` 会按项目事实补齐和刷新这些规则，而不是沿用固定模板
- 这符合“自动初始化安装”的目标，不需要用户再手动进入交互界面逐条勾选

当前底层支持自动全选的规则是：

- `01-项目概述.md`
- `03-项目结构.md`
- `04-组件规范.md`
- `05-API规范.md`
- `06-路由规范.md`
- `07-状态管理.md`
- `09-样式规范.md`

如果用户明确要求“沿用标准模板，不要自定义规则”，才改用 `--standard-rules(标准规则)`，不要同时传两者。

## 标准工作流

Progress:
- [ ] 1. 读取 `package.json`、目录结构、`.npmrc`
- [ ] 2. 判断是否已安装、是否 `Monorepo(多包仓库)`、是否能推断 `profile(技术栈)`
- [ ] 3. 组装并实际执行 `init(初始化安装)` 命令
- [ ] 4. 安装完成后执行 `check(自检)` 或核对关键安装产物
- [ ] 5. 输出简短安装摘要，并提示下一步执行 `project-init(项目规范初始化)`

## 详细步骤

### 第一步：环境与仓库检查

至少检查以下事实：

- `package.json` 是否存在
- `node -v`、`npm -v` 是否可用
- `~/.npmrc` 是否包含 `@ex:registry=http://nodejs.100credit.cn/`
- 是否已存在 `.ai-spec/install-state.json`、`.agents/`、`openspec/`

如果发现 `registry(包仓库)` 配置缺失：

- 明确告诉用户当前阻塞点
- 给出准确修复命令
- 不要假装已经安装成功

### 第二步：构造非交互命令

默认应显式传入 `--profile(技术栈)`，避免安装过程进入交互式选择。
默认还应显式传入 `--custom-rules(自定义规则)`，让所有支持按项目自定义的规则自动全选。

默认安装命令：

```bash
npx @ex/ai-spec-auto@latest init . --profile <vue|react> --custom-rules
```

如用户提供 `manifest(安装清单)`，命令改为：

```bash
npx @ex/ai-spec-auto@latest init . --profile <vue|react> --custom-rules --manifest <file-or-url>
```

如是 `Monorepo(多包仓库)` 子包：

```bash
npx @ex/ai-spec-auto@latest init . --profile <vue|react> --custom-rules --package <subpath>
```

说明：

- 非交互模式下，若传入 `--custom-rules(自定义规则)`，安装流程会自动把当前支持的可自定义规则全部选中
- 这些规则当前是 `01/03/04/05/06/07/09`
- 若未传 `--custom-rules`，非交互模式会退回标准规则，这不是本技能的默认策略
- 不要省略 `--profile`，否则容易进入错误技术栈或交互式选择

### 第三步：执行安装

- 真正执行命令，不要只把命令贴给用户
- 执行前用一句话说明：安装目标、推断出的 `profile(技术栈)`、是否命中 `Monorepo(多包仓库)` 子包
- 若项目已安装且用户没有明确要求重装，不要强行再跑 `init(初始化安装)`

### 第四步：安装后验证

优先执行：

```bash
npx @ex/ai-spec-auto@latest check .
```

如果当前环境不适合再次走 `npx(包执行命令)`，至少核对：

- `.agents/`
- `.ai-spec/install-state.json`
- `openspec/`（完整安装时）
- `.cursor/`、`.claude/` 等 `IDE(开发工具)` 入口目录

### 第五步：结果摘要

结果摘要至少包含：

- 安装目标目录
- 实际执行的命令
- 判定出的 `profile(技术栈)`
- 是否首次安装 / 已安装改走 `check(自检)`
- 验证结果
- 下一步建议：`project-init(项目规范初始化)` 或“初始化项目规范”

## Gotchas(易错点)

- 不要把 `project-init(项目规范初始化)` 当成首次安装命令
- 不要忘记追加 `--custom-rules(自定义规则)`，否则非交互模式会回退到标准规则
- 不要声称“支持全部规则自定义”；当前只支持 `01/03/04/05/06/07/09`
- 不要在 `Monorepo(多包仓库)` 根目录存在多个子包时擅自安装到根目录
- 不要漏掉 `@ex:registry(内网包仓库)` 检查，否则 `npx(包执行命令)` 很可能失败
- 不要只输出命令，不实际执行
- 已安装项目如果只需要检查状态，优先走 `check(自检)`，不要机械重复 `init(初始化安装)`

## 验证标准

1. 已成功执行 `init(初始化安装)` 或在已安装场景下正确改走 `check(自检)`
2. 用户能从摘要里看到安装目标、命令、技术栈和验证结果
3. 输出明确区分“安装完成”与“下一步执行 `project-init(项目规范初始化)`”

## 资源导航

- [README.md](/Users/lizhenwei/workspace/vueworkspace/bairong/br-ai-spec/README.md)
- [docs/install-guide.md](/Users/lizhenwei/workspace/vueworkspace/bairong/br-ai-spec/docs/install-guide.md)
- [bin/install-workflow.js](/Users/lizhenwei/workspace/vueworkspace/bairong/br-ai-spec/bin/install-workflow.js)
