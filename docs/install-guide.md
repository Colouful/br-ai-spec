# 安装指南

这份文档聚焦安装层：命令、参数、兼容项、Monorepo、自定义规则和排错。  
主路径请优先按 [README](/Users/lizhenwei/workspace/vueworkspace/bairong/br-ai-spec/README.md) 和 [5 分钟快速上手](/Users/lizhenwei/workspace/vueworkspace/bairong/br-ai-spec/docs/quick-start.md) 执行。

## 1. 推荐入口

默认推荐：

```bash
npx @ex/ai-spec-auto@latest init .
npx @ex/ai-spec-auto@latest update .
npx @ex/ai-spec-auto@latest check .
npx @ex/ai-spec-auto@latest uninstall .
```

兼容脚本入口也保留：

```bash
bash install.sh init .
bash install.sh update .
```

```powershell
.\install.ps1 init .
.\install.ps1 update .
```

`install.sh` 和 `install.ps1` 现在都是**薄壳入口**，真正逻辑统一由 Node 核心实现。

## 2. 内网 registry 说明

当前包通过**内网 npm registry**分发。  
这不是“代码依赖”，而是**安装来源依赖**。

首次使用前，在 `~/.npmrc` 中配置：

```ini
@ex:registry=http://nodejs.100credit.cn/
```

完成后再执行：

```bash
npx @ex/ai-spec-auto@latest init .
```

## 3. 默认安装模型

默认安装就是**完整安装**，等价于原来的完整能力：

- `.agents/rules`
- `.agents/skills`
- `.cursor` / `.claude` 适配
- `openspec/`

因此用户主路径不再强调 `L1 / L2 / L3`。

### `L1 / L2 / L3` 现在的定位

- 仍然保留为**兼容参数**
- 不再作为 README / 快速上手的主叙事
- 只有在你明确需要兼容旧安装模式时才使用

如果你需要：

```bash
npx @ex/ai-spec-auto@latest init . --level L1
npx @ex/ai-spec-auto@latest init . --level L2
npx @ex/ai-spec-auto@latest init . --level L3
```

## 4. init 会问什么

交互式 `init` 默认只会问这些：

- Profile
- Monorepo 安装目标（若命中）
- 规则策略（标准 / 根据项目自定义）
- UIPro
- lint/format
- husky

默认不会再把 `L1 / L2 / L3` 当成必答题。

## 5. 常用参数

### 技术栈

```bash
npx @ex/ai-spec-auto@latest init . --profile vue
npx @ex/ai-spec-auto@latest init . --profile react
```

### 自定义规则

```bash
npx @ex/ai-spec-auto@latest init . --custom-rules
npx @ex/ai-spec-auto@latest init . --standard-rules
```

可自定义规则范围固定为：

- `01-项目概述.md`
- `03-项目结构.md`
- `04-组件规范.md`
- `05-API规范.md`
- `06-路由规范.md`
- `07-状态管理.md`
- `09-样式规范.md`

说明：

- `01/03` 始终属于项目特有规则
- 其它被选为自定义的规则在安装时不会从规范库落盘
- 后续由 `/project-init` 按项目实际情况补生成

### Monorepo

如果在工作区根安装，命中 Monorepo 时会提示：

- 在根目录继续安装
- 或切到具体子包安装

也可以直接显式指定：

```bash
npx @ex/ai-spec-auto@latest init . --package packages/web
npx @ex/ai-spec-auto@latest init . --workspace-root
```

环境变量也支持：

```bash
EX_AI_SPEC_WORKSPACE_PACKAGE=packages/web npx @ex/ai-spec-auto@latest init .
```

### UIPro / lint / husky

```bash
npx @ex/ai-spec-auto@latest init . --uipro
npx @ex/ai-spec-auto@latest init . --no-uipro
npx @ex/ai-spec-auto@latest init . --lint
npx @ex/ai-spec-auto@latest init . --no-lint
npx @ex/ai-spec-auto@latest init . --husky
npx @ex/ai-spec-auto@latest init . --no-husky
```

### update 细粒度控制

```bash
npx @ex/ai-spec-auto@latest update . --skip-skills
npx @ex/ai-spec-auto@latest update . --skip-configs
npx @ex/ai-spec-auto@latest update . --skip-commands
npx @ex/ai-spec-auto@latest update . --skip-ide-links
npx @ex/ai-spec-auto@latest update . --skip-openspec
npx @ex/ai-spec-auto@latest update . --skip-uipro
npx @ex/ai-spec-auto@latest update . --update-commands
npx @ex/ai-spec-auto@latest update . --update-uipro
npx @ex/ai-spec-auto@latest update . --update-rules
npx @ex/ai-spec-auto@latest update . --no-update-rules
```

交互式 `update` 也支持直接勾选模块，不必先记这些参数。

## 6. configs 同步策略

`configs/` 下的文件现在采用**增量补齐**策略：

- 缺什么补什么
- 已有文件不整份覆盖
- `.husky/` 等目录配置也按目录内补缺处理

这意味着目标项目里你已经手改过的配置，不会因为一次 `update` 被整份顶掉。

## 7. OpenSpec / MCP / 本地 CLI

### OpenSpec

默认完整安装会配置 `openspec/`。

行为：

- 未存在时执行 `openspec init`
- 已存在时执行 `openspec update`
- 同步 `openspec/schemas`
- 增量补齐 `config.yaml`

### MCP

若生成了 `.cursor/mcp.json`：

- 先去 Cursor 设置 → MCP 里按需启用服务
- 再填写 `project-id`、`access-token` 等凭证

### 本地 CLI

安装流程会在目标项目内安装：

```bash
./node_modules/.bin/ai-spec-auto
```

这样 IDE 命令和宿主桥就可以稳定调用项目内版本。

## 8. Windows / PowerShell

PowerShell 入口仍然支持：

```powershell
.\install.ps1 init .
```

现在它只负责：

- Windows 入口
- Node 检测
- 转发到 `node .\bin\cli.js`

如果遇到执行策略问题，可使用：

```powershell
powershell -ExecutionPolicy Bypass -File .\install.ps1 init .
```

## 9. 常见排错

### 1）`npx @ex/ai-spec-auto@latest init .` 拉不到包

通常是 registry 没配。

检查 `~/.npmrc`：

```ini
@ex:registry=http://nodejs.100credit.cn/
```

### 2）安装完成但 Cursor 没法执行协议命令

首次运行 `/spec-start`、`/spec-continue`、`/spec-update`、`/spec-stop`、`/spec-status` 时：

- 如果 Cursor 弹出命令执行确认
- 请选择 `Always allow for this workspace`

### 3）Monorepo 装到根目录了，其实想装子包

重新执行并显式指定：

```bash
npx @ex/ai-spec-auto@latest init . --package packages/web
```

### 4）UIPro 没装上

可以后补：

```bash
npx @ex/ai-spec-auto@latest update . --uipro
```

### 5）只想看当前状态

```bash
npx @ex/ai-spec-auto@latest check .
```

## 10. 相关文档

- [README](/Users/lizhenwei/workspace/vueworkspace/bairong/br-ai-spec/README.md)
- [5 分钟快速上手](/Users/lizhenwei/workspace/vueworkspace/bairong/br-ai-spec/docs/quick-start.md)
- [OpenSpec / 协议流说明](/Users/lizhenwei/workspace/vueworkspace/bairong/br-ai-spec/docs/openspec-guide.md)
- [文档索引](/Users/lizhenwei/workspace/vueworkspace/bairong/br-ai-spec/docs/README.md)
