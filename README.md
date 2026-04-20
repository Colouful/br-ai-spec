# ai-spec-auto

`ai-spec-auto` 是一套面向前端项目的 AI 规范驱动开发底座。它把项目规则、专家资产、IDE 命令入口、OpenSpec 交付产物和 `.ai-spec` 运行状态放进同一个项目里，让 AI 开发不再只停留在对话里，而是能够按统一约束执行、留痕、归档和复用。

如果只保留一句对外口径，建议统一成下面这句：

> 它不是单个 AI 工具的替代品，而是一套把需求、实现、检查、归档串成团队开发链路的项目级交付底座。

当前主场景：

- Vue 3 / React 前端项目
- Cursor / Claude Code
- 规范驱动开发、提案到交付闭环、增量需求更新

## 解决什么问题

团队把 AI 引入研发后，最常遇到的不是“模型不会写代码”，而是下面几类治理问题：

- 需求还没收敛，AI 已经开始改代码，后续返工成本高。
- 规则、目录、接口、路由、测试等约定散落在文档和口头经验里，难以稳定复用。
- 过程只存在于聊天记录中，缺少可追溯、可归档的交付产物。
- 新功能和低风险小修经常混用同一套流程，不利于效率和治理平衡。

`ai-spec-auto` 当前要解决的就是这些问题：  
让高风险需求走完整交付链，让低风险小修走轻量链，同时让两类任务都留下可读、可查、可复盘的工程痕迹。

## 推荐安装

默认安装就是完整安装：规范 + IDE 适配 + OpenSpec。

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

当前包通过内网 npm registry 分发。  
这不是代码运行时依赖，而是安装来源依赖。

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

其中：

- `UI UX Pro Max` 归属 `design-collaborator` 链路，主要用于 Figma 解析、标注提取和 UI/UX 设计决策
- 它不属于 `frontend-implementer` 的默认技能集
- 如需安装完整版资源，可显式使用 `--uipro`

`L1 / L2 / L3` 仍然保留为兼容参数，但不再是主路径概念。  
如果没有特别原因，直接使用默认安装即可。

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

默认情况下，`/spec-start` 会以 `auto（自动） + none（无阻塞审核）` 启动主流程，直接自动推进需求开发；只有在你显式切到 `main-flow-blocking（主流程阻塞审核）` 时，才会恢复人工审核门禁。

如果你走 OpenSpec 提案流：

- Cursor：`/opsx-propose`、`/opsx-apply`、`/opsx-archive`、`/opsx-explore`
- Claude Code 等：`/opsx:propose`、`/opsx:apply`、`/opsx:archive`、`/opsx:explore`

### 小需求怎么走

| 场景 | 推荐入口 | 默认结果 |
| --- | --- | --- |
| 新的大需求、新功能、跨模块改动 | `/spec-start` 或自然语言描述 | 进入 `prd-to-delivery` |
| 当前 run / 未归档 change 里的小修正 | `/spec-update` 或自然语言补充 | 复用原 change，走 `patch / scope-delta` |
| 归档前发现实现不对 | 自然语言：`先别归档，这里改成...` | 走 `archive-fix`，回退到对应专家 |
| 已归档内容补一个修正 | 自然语言：`给上个归档变更补个修正...` | 走 `followup-patch`，新开补丁 change |
| 全新、低风险、单点小修正 | 自然语言直接描述 | 进入 `bugfix-to-verification`，留痕写到 `.ai-spec/history/<run-id>/` |

判断原则：

- 只要涉及新增 API、路由、全局状态、权限/支付/合规、跨模块范围变化，就升级回 `prd-to-delivery`
- 只要你明确要求“留痕 / 归档 / 评审 / spec”，即使需求很小，也优先走完整 OpenSpec

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

## 后续规划

后续规划建议按三段推进，而不是同时把所有入口和平台能力全部拉开。

### 短期

- 继续把 `prd-to-delivery` 主链和 `bugfix-to-verification` 轻量链跑稳
- 降低 `init / sync / manifest` 的接入摩擦
- 让普通开发者先用起来，不被底层协议细节拦在门外

### 中期

- 让 Hub 负责资产管理与场景组合
- 让 `manifest` 成为能力组合的稳定描述
- 补齐 `git worktree` 支持，把“一需求一工作目录”收口成标准能力，支撑多需求并行开发
- 让 CLI 和 IDE 入口承担更轻量的状态提示与切换能力

### 中长期

- 补齐 `OpenClaw` 对接，形成远程入口与团队协同控制面
- 让远程触发、审批放行、状态查询、结果回传围绕 `.ai-spec` 和 OpenSpec 产物统一展开
- 在条件成熟后，把 CI/CD 校验纳入统一治理链，形成从本地开发到持续交付的一体化约束

## 推广与埋点统计

后续统计的重点不应只是“装了多少次工具”，而应回答“这套方法是否形成了稳定闭环”。

建议后续埋点优先围绕四类事件建设：

| 层次 | 建议埋点 | 主要看什么 |
| --- | --- | --- |
| 接入 | `init / sync / manifest / check` 的执行次数、项目数、profile、IDE、场景方案来源 | 判断是否真正进入项目，而不是停留在介绍阶段 |
| 运行 | `/spec-start / update / continue / status` 的调用次数、流程选择结果、门禁阻断点、auto-fix 回环次数 | 判断流程是否跑起来、卡在哪一步 |
| 复用 | 场景方案、专家、规则、技能在不同项目中的复用次数 | 判断资产是否开始沉淀为团队能力 |
| 结果 | 归档成功率、失败原因、阻断原因、从发起到归档的耗时 | 判断交付闭环是否稳定形成 |

对管理视角而言，更值得长期观察的是三个趋势：

- 同类需求是否越来越少依赖个人记忆
- 常见任务是否越来越多通过统一资产完成
- 一次交付结束后，结果是否能够反馈回规则、流程和方案设计

## 文档入口

如果只从一个入口开始阅读，优先看第四阶段文档入口。

- [第四阶段文档入口](docs/four/README.md)
- [开发最佳实践指南](docs/four/开发最佳实践指南.md)
- [需求示例：从发起到归档](docs/four/需求示例-从发起到归档.md)
- [项目介绍与运行机制说明](docs/four/项目介绍与运行机制说明.md)
- [架构设计与治理说明](docs/four/架构设计与治理说明.md)
- [5 分钟快速上手](docs/quick-start.md)
- [安装指南](docs/install-guide.md)
- [文档索引](docs/README.md)
- [OpenSpec / 协议流说明](docs/openspec-guide.md)
- [小需求与补丁修正指南](docs/four/小需求与补丁修正指南.md)
- [培训大纲](docs/training-outline.md)
- [协议与专家增强记录](docs/paser_three/协议与专家增强记录.md)
- [主流程专家优化记录](docs/paser_three/主流程专家优化记录.md)

## 兼容说明

这些能力都继续保留：

- `install.sh` / `install.ps1`
- `--level L1/L2/L3`
- `--custom-rules`
- 细粒度 `update`
- Monorepo 目标选择
- `configs/` 增量补齐

这轮收口的重点是：

- 安装实现统一到 Node 核心
- Bash / PowerShell 只保留薄壳入口
- README 收成产品入口页
- registry 说明集中、统一

协议主链、专家链和运行时状态机没有因为这轮入口收口而改变。
