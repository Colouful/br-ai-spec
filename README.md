# ai-spec-auto

`ai-spec-auto` 是一套面向前端项目的 AI 协作安装器和规范资产包。它把项目规则、技能、IDE 适配和 OpenSpec 流程安装到同一个项目里，让 AI 助手按统一约束工作，而不是每次对话都从零解释。

当前主场景：
- Vue 3 / React 前端项目
- Cursor / Claude Code
- 规范驱动开发、提案到交付闭环、增量需求更新

## 推荐安装

默认安装就是**完整安装**：规范 + IDE 适配 + OpenSpec。

```bash
npx @ex/ai-spec-auto@latest init .
```

更新、检查、卸载：

```bash
npx @ex/ai-spec-auto@latest update .
npx @ex/ai-spec-auto@latest check .
npx @ex/ai-spec-auto@latest uninstall .
```

也支持脚本入口：

```bash
bash install.sh init .
bash install.sh update .
```

```powershell
.\install.ps1 init .
.\install.ps1 update .
```

## 内网 Registry 说明

当前包通过**内网 npm registry**分发。  
这不是代码运行时依赖，而是**安装来源依赖**。

首次接入前，请先在 `~/.npmrc` 中配置：

```ini
@ex:registry=http://nodejs.100credit.cn/
```

配置完成后，再执行：

```bash
npx @ex/ai-spec-auto@latest init .
```

## 默认会装什么

默认安装会把这些能力落到目标项目：

- `.agents/rules/`：项目规则
- `.agents/skills/`：技能与操作流程
- `.cursor/`、`.claude/`：IDE 适配与命令模板
- `openspec/`：OpenSpec 流程目录
- 可选的 lint / husky / UI UX Pro Max

`L1 / L2 / L3` 仍然保留为**兼容参数**，但不再是主路径概念。  
如果你没有特别原因，直接用默认安装即可。

## 安装后怎么开始

先做项目初始化：

- `/project-init`
- 或直接输入：`初始化项目规范`

然后开始实际需求：

- `/spec-start`：新建一个需求交付 run
- `/spec-update`：增量补充需求、修正方向、归档前修正说明
- `/spec-continue`：继续或恢复当前 run
- `/spec-stop`：暂停当前 run
- `/spec-status`：查看当前阶段、门禁和下一步

如果你走 OpenSpec 提案流：

- Cursor：`/opsx-propose`、`/opsx-apply`、`/opsx-archive`、`/opsx-explore`
- Claude Code 等：`/opsx:propose`、`/opsx:apply`、`/opsx:archive`、`/opsx:explore`

## 常见安装场景

指定技术栈：

```bash
npx @ex/ai-spec-auto@latest init . --profile vue
npx @ex/ai-spec-auto@latest init . --profile react
```

Monorepo 安装到子包：

```bash
npx @ex/ai-spec-auto@latest init . --package packages/web
```

启用自定义规则：

```bash
npx @ex/ai-spec-auto@latest init . --custom-rules
```

只更新一部分：

```bash
npx @ex/ai-spec-auto@latest update . --skip-skills --skip-configs --skip-openspec
```

## 文档入口

如果只从一个入口开始阅读，优先看第四阶段文档入口。

- [第四阶段文档入口](/Users/lizhenwei/workspace/vueworkspace/bairong/br-ai-spec/docs/four/README.md)
- [开发最佳实践指南](/Users/lizhenwei/workspace/vueworkspace/bairong/br-ai-spec/docs/four/开发最佳实践指南.md)
- [架构设计与治理说明](/Users/lizhenwei/workspace/vueworkspace/bairong/br-ai-spec/docs/four/架构设计与治理说明.md)
- [5 分钟快速上手](/Users/lizhenwei/workspace/vueworkspace/bairong/br-ai-spec/docs/quick-start.md)
- [安装指南](/Users/lizhenwei/workspace/vueworkspace/bairong/br-ai-spec/docs/install-guide.md)
- [文档索引](/Users/lizhenwei/workspace/vueworkspace/bairong/br-ai-spec/docs/README.md)
- [OpenSpec / 协议流说明](/Users/lizhenwei/workspace/vueworkspace/bairong/br-ai-spec/docs/openspec-guide.md)
- [培训大纲](/Users/lizhenwei/workspace/vueworkspace/bairong/br-ai-spec/docs/training-outline.md)
- [协议与专家增强记录](/Users/lizhenwei/workspace/vueworkspace/bairong/br-ai-spec/docs/paser_three/协议与专家增强记录.md)
- [项目介绍与运行机制说明](/Users/lizhenwei/workspace/vueworkspace/bairong/br-ai-spec/docs/paser_three/项目介绍与运行机制说明.md)

## 兼容说明

这些能力都继续保留：

- `install.sh` / `install.ps1`
- `--level L1/L2/L3`
- `--custom-rules`
- 细粒度 `update`
- Monorepo 目标选择
- `configs/` 增量补齐

这轮调整做的是：

- 安装实现统一到 Node 核心
- Bash / PowerShell 只保留薄壳入口
- README 收成入口页
- registry 说明集中、统一

协议主链、专家链和运行时状态机没有因为这轮安装收口而改变。
