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

已发布到公共 npm，包名 `@br-ai/ai-spec-auto`，**无需额外配置 registry**。默认安装即完整安装：规范 + IDE 适配 + OpenSpec。

```bash
npx @br-ai/ai-spec-auto@latest init .
```

常用维护命令：

```bash
npx @br-ai/ai-spec-auto@latest update .      # 更新已安装资产
npx @br-ai/ai-spec-auto@latest check .       # 检查安装完整性
npx @br-ai/ai-spec-auto@latest uninstall .   # 卸载
```

也支持脚本入口（薄壳，转发到 Node 核心，能力完全一致）：

```bash
# macOS / Linux
bash install.sh init .
bash install.sh update .
```

```powershell
# Windows PowerShell
.\install.ps1 init .
.\install.ps1 update .
```

<details>
<summary>内部用户：从内网 registry 安装（历史 <code>@ex</code> 包）</summary>

内部环境若仍使用内网分发的历史包 `@ex/ai-spec-auto`，需先在 `~/.npmrc` 中配置安装来源（这不是代码运行时依赖，而是安装来源依赖）：

```ini
@ex:registry=http://nodejs.100credit.cn/
```

配置完成后再执行 `npx @ex/ai-spec-auto@latest init .`。

</details>

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

## 使用方式：命令与参数

### 两条安装路径

| 路径 | 命令 | 适用 | 行为 |
| --- | --- | --- | --- |
| 默认完整安装（手动 / 交互） | `init .` | 大多数项目 | 直接落地 `.agents` / IDE 适配 / OpenSpec；未指定 profile 时交互选择或默认 `vue` |
| 推荐安装（自动扫描 + Hub 推荐） | `init . --recommend` | 想让工具自动判断技术栈 | 先扫描技术栈，再结合 Hub / 本地推荐生成 InitPlan；`--dry-run` 预览、`--yes` 写入 |

```bash
# 默认完整安装
npx @br-ai/ai-spec-auto@latest init .

# 自动推荐安装：先预览，再确认写入
npx @br-ai/ai-spec-auto@latest init . --recommend --dry-run
npx @br-ai/ai-spec-auto@latest init . --recommend --yes
```

### init 参数（默认完整安装路径）

| 参数 | 取值 | 默认 | 说明 |
| --- | --- | --- | --- |
| `--profile <id>` | `vue` / `react` / `nestjs` / `springboot` / `node-tooling` | `vue` | 指定技术栈；不传则交互选择 |
| `--profiles <a,b>` | 逗号分隔 | — | 一次安装多个技术栈 |
| `--package <subpath>` | 如 `packages/web` | — | Monorepo 安装到子包 |
| `--workspace-root` | — | 否 | Monorepo 在仓库根安装 |
| `--custom-rules` | — | — | 启用可定制规则全集 |
| `--standard-rules` | — | — | 使用标准规则集 |
| `--ide <list>` | `default` / `all` / `cursor,claude` | `default` | IDE 适配范围，`default`=cursor+claude |
| `--lint` / `--no-lint` | — | 交互询问 | 是否安装 lint 配置 |
| `--husky` / `--no-husky` | — | 交互询问 | 是否安装提交钩子 |
| `--uipro` / `--no-uipro` | — | 交互询问 | 是否安装 UI UX Pro Max |
| `--manifest <path\|url>` | — | — | 按本地 / 远程 Manifest 安装 |
| `--level <L1\|L2\|L3>` | — | `L3` | 兼容参数，不再是主路径概念 |
| `-y` / `--force` | — | 否 | **强制覆盖**已存在的 `.agents`（跳过确认） |

### init 参数（`--recommend` 自动推荐路径）

| 参数 | 说明 |
| --- | --- |
| `--recommend` | 启用「扫描 + 推荐」 |
| `--dry-run` | 只输出 InitPlan，不写盘 |
| `--yes` / `-y` | 确认并写入 |
| `--json` | 以 JSON 输出 |
| `--manifest <slug>` | 指定 Hub 上的 Manifest slug |
| `--hub-url <url>` | Hub 地址 |
| `--visual-url <url>` | 写入时的 Visual 上报地址 |
| `--no-hub-fallback` | Hub 失败时不降级到本地推荐 |

> ⚠️ `-y` 在两条路径含义不同：默认安装里是「**强制覆盖**已有 `.agents`」，推荐安装里是「**确认写入** InitPlan」。

### update：更新已安装资产

不传 `--profile` / `--ide` 时会**自动继承**项目已安装的 manifest 配置；只更新部分内容可叠加 `--skip-*`。

```bash
# 全量更新
npx @br-ai/ai-spec-auto@latest update .

# 只更新规则与命令，跳过技能、配置、OpenSpec
npx @br-ai/ai-spec-auto@latest update . --skip-skills --skip-configs --skip-openspec
```

| 参数 | 说明 |
| --- | --- |
| `--skip-skills` / `--skip-configs` / `--skip-commands` / `--skip-ide-links` / `--skip-openspec` / `--skip-uipro` | 跳过对应部分更新 |
| `--force-update-rules` / `--no-force-update-rules` | 是否覆盖本地已改动的规则 |
| `--no-self-upgrade` | 关闭自举自升级 |
| `--profile` / `--ide` | 覆盖自动继承的配置 |

### check / sync：自动双模式

`check` 与 `sync` 会按项目状态自动分流：当存在 `.ai-spec/ai-spec.lock.json` 或 `.agents/registry.index.json` 时，走「完整性校验 / 缓存同步」模式（基于 lock 校验 checksum、检测资产篡改）；否则走传统文件检查 / Manifest 同步。

| 命令 | 说明 |
| --- | --- |
| `check .` | 检查安装完整性、资产是否被篡改 |
| `sync . [--hub-url <url>]` | 按 lock 将远程资产同步到本机全局缓存 |

### Monorepo / 自定义规则示例

```bash
# 指定技术栈
npx @br-ai/ai-spec-auto@latest init . --profile react

# Monorepo 安装到子包
npx @br-ai/ai-spec-auto@latest init . --package packages/web

# 启用自定义规则
npx @br-ai/ai-spec-auto@latest init . --custom-rules
```

### Hub（资产中心）

```bash
npx @br-ai/ai-spec-auto@latest hub search react --kind manifest --hub http://localhost:3000
npx @br-ai/ai-spec-auto@latest hub install react-standard-delivery . --hub http://localhost:3000 --mode standard --profile react --ide cursor
npx @br-ai/ai-spec-auto@latest hub diff .
npx @br-ai/ai-spec-auto@latest hub sync . --yes
npx @br-ai/ai-spec-auto@latest hub rollback 1.0.0 .
npx @br-ai/ai-spec-auto@latest hub runtime-report . --run-id run-100 --stage test --status success --duration-ms 1200
```

安装成功后会写入 `.agents/registry/hub-lock.json`（Hub 锁文件），Visual（可视化控制台）会基于它展示当前 Manifest、资产版本、本地改动和高风险资产。`hub runtime-report`（运行上报）会读取锁文件中的资产清单，把本次 run（运行）的阶段、状态、耗时和失败原因回传到 Hub，用于成功率、失败原因和推荐等级分析。

### 自动与手动一览

| 能力 | 自动 | 手动 / 可控 |
| --- | --- | --- |
| 技术栈识别 | `scan`、`init --recommend` 自动扫描并推荐 profile | `init --profile <id>` 显式指定 |
| CLI 自升级 | `update` 触发自举升级（registry 上有新版时自动升级并重跑） | `--no-self-upgrade` 关闭 |
| 更新配置继承 | `update` 不传 `--profile/--ide` 时自动沿用已装 manifest | 显式传参覆盖 |
| 安装确认 | `--yes` / `-y` 跳过交互 | 省略则进入交互选择 |
| 需求主流程 | `/spec-start` 默认 `auto + none`，自动推进开发 | 切到 `main-flow-blocking` 启用人工审核门禁 |

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

## 匿名使用统计

`bin/telemetry/` 是一个 **隔离的切面模块**，用于向私有部署的
[`br-ai-spec-visual`](https://github.com/Colouful/br-ai-spec-visual) 上报 CLI 安装与使用情况（`init/update/sync/check/help`）。

### 默认行为（零配置）

从当前版本起，仓库内置默认上报地址 `bin/telemetry/defaults.json`，**装包即启用**，首次运行会打印一次性提示：

```text
[ai-spec-auto] 已开启匿名使用统计（可通过 AI_SPEC_TELEMETRY_DISABLED=1 关闭）
```

上报是 **fire-and-forget**，带 500ms 健康探测 + 2s 请求超时，服务端不可达时自动跳过且主流程零感知。

### 如果你不想参与上报

任选其一：

```bash
# 方式 A：环境变量（临时/会话级）
export AI_SPEC_TELEMETRY_DISABLED=1

# 方式 B：用户配置（永久，跨 shell 会话）
mkdir -p ~/.ai-spec-auto
echo '{"disabled": true}' > ~/.ai-spec-auto/config.json
```

### 配置优先级（高 → 低）

1. **环境变量**
2. **`~/.ai-spec-auto/config.json`**（用户主目录，含 secret 请 `chmod 600`）
3. **`bin/telemetry/defaults.json`**（仓库默认，**禁止写入 secret**）

### 可配置字段

| 字段 | 环境变量 | 用户配置 key | 仓库默认 | 说明 |
| --- | --- | --- | --- | --- |
| Visual 地址 | `AI_SPEC_VISUAL_URL` | `visualUrl` | `visualUrl` | 空值则不发送 |
| 总开关 | `AI_SPEC_TELEMETRY_DISABLED=1` | `disabled: true` | `disabled` | 任一源为真即关闭 |
| 鉴权密钥 | `AI_SPEC_TELEMETRY_SECRET` | `secret` | **不支持** | 与服务端 `.env` 一致，作为 `X-Telemetry-Secret` 头携带 |
| 调试输出 | `AI_SPEC_TELEMETRY_DEBUG=1` | — | — | 仅环境变量，平时保持静默 |

### 典型场景

| 场景 | 做法 |
| --- | --- |
| 使用官方默认 Visual，无 secret | **什么都不配**，装包即用 |
| 使用官方默认 Visual，服务端开了 secret | 设置 `AI_SPEC_TELEMETRY_SECRET=<值>` 或写入用户配置 |
| 本地联调指向本机 Visual | `export AI_SPEC_VISUAL_URL=http://127.0.0.1:3000` |
| 个人不想参与匿名统计 | `export AI_SPEC_TELEMETRY_DISABLED=1` |
| 排查上报链路问题 | `export AI_SPEC_TELEMETRY_DEBUG=1` 后再跑命令 |

### 用户配置文件示例

```jsonc
// ~/.ai-spec-auto/config.json —— 所有字段都是可选的
{
  "visualUrl": "http://127.0.0.1:3000",
  "secret": "与服务端 AI_SPEC_TELEMETRY_SECRET 一致",
  "disabled": false
}
```

文件缺失、权限不足或 JSON 非法时，遥测会静默回退到仓库默认，**不会让 CLI 报错**。

### 隐私与健壮性保证

- **唯一标识**：来自 `node-machine-id`（`optionalDependencies`，缺失时用 `sha256(mac+user+host)` 兜底）。
- **项目路径**：以 SHA256 哈希形式上报，不包含源码、绝对路径、用户名密钥。
- **健康探测**：上报前 `HEAD /api/health`（500ms 超时）；失败写入本地缓存，60 秒冷却窗口内后续 CLI 调用直接跳过探测。
- **删除即失效**：整个 `bin/telemetry/` 目录被移除、`node-machine-id` 缺失、`defaults.json` 损坏，任一情况下 CLI 都正常工作。
