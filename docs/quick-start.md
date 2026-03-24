# 5 分钟快速上手

## 你将获得什么

安装 **ex-ai-spec** 后，在前端项目（Vue / React Profile）中，AI 编码助手会按团队约定处理 **目录结构、组件拆分、API 命名、样式变量** 等，减少每次对话重复「背诵」项目规则。

**一体化能力**：`.agents/rules` 与 `.agents/skills` 负责编码约束与操作步骤；**L2** 起通过 **IDE 链接** 与 **`.cursor/mcp.json`** 接入接口文档、设计稿、浏览器验收等上下文；**L3** 再增加 **`openspec/`**（OpenSpec），与 `.agents` 通过 **`openspec/config.yaml`** 桥接，支撑 **`/opsx:*` 提案 → 实施 → 归档** 与 `create-proposal` 等技能的完整闭环。详见仓库根目录 README 中的「一体化能力与关键路径」。

## 安装（与 README 一致）

### 方式一：npx 一键安装（推荐）

在**目标前端项目根目录**执行，无需先克隆规范库：

```bash
# 交互式安装（引导选择技术栈与层级）
npx @ex/ai-spec init

# 指定参数（示例：Vue + 团队完整方案含 OpenSpec）
npx @ex/ai-spec init --profile vue --level L3
```

> 首次使用前需配置私有源（仅一次）：在 `~/.npmrc` 中添加  
> `@ex:registry=http://nodejs.100credit.cn/`

更新 / 检查 / 卸载：

```bash
npx @ex/ai-spec update
npx @ex/ai-spec check
npx @ex/ai-spec uninstall
```

也可全局安装后使用：`npm install -g @ex/ai-spec`，再执行 `ai-spec init ...`。

> Windows 下 npx 安装器会自动选用 PowerShell 脚本，无需额外配置。

### 方式二：克隆规范库后使用脚本

```bash
git clone http://git.100credit.cn/zhenwei.li/ex-ai-spec.git
cd ex-ai-spec

bash install.sh init /path/to/your-project
# 或显式指定（与脚本默认一致：L3）
bash install.sh init /path/to/your-project --profile vue --level L3
# 不要 OpenSpec 时用 --level L2
```

**Windows PowerShell**（首次可执行 `Set-ExecutionPolicy -Scope CurrentUser -ExecutionPolicy RemoteSigned`）：

```powershell
git clone http://git.100credit.cn/zhenwei.li/ex-ai-spec.git
cd ex-ai-spec
.\install.ps1 init C:\path\to\your-project --profile vue --level L3
```

与 npx 相同，支持 `update`、`check`、`uninstall` 子命令。

### 安装层级

| 层级 | 内容 | 适合场景 |
|------|------|----------|
| **L1** | 只安装 `.agents`（规范 + 技能） | 快速试用、个人体验 |
| **L2** | `.agents` + IDE 适配层 + MCP 模板 | 团队编码规范 + 外部上下文（**不含** OpenSpec，需显式 `--level L2`） |
| **L3** | L2 + OpenSpec（`openspec/`） | **默认安装层级、团队主推**：需求治理与归档闭环，与 `.agents` 一体联动 |

### 技术栈 Profile

| Profile | 技术栈 |
|---------|--------|
| **react** | React + TypeScript（优先；纯 JS 见 02-编码规范）+ Vite + Zustand + Ant Design |
| **vue** | Vue 3 + TypeScript（优先；纯 JS 见 02-编码规范）+ Vite + Pinia + Vue Router |

### Monorepo / pnpm workspace

若仓库根目录存在 **`pnpm-workspace.yaml`** 或根 **`package.json`** 含 **`workspaces`**，在安装脚本看来即 **Monorepo**。在**工作区根**执行 `npx @ex/ai-spec init` 时：

- **交互终端**：会提示选择「在根目录安装」或「输入子包相对路径」（如 `packages/web`），推荐把规范与 lint/husky 依赖落在**具体前端应用包**内。
- **非交互**（CI、管道输入）：不会停顿；脚本会打印建议在子包执行的示例命令，并**默认仍在根目录**继续安装。若要在子包安装且无需交互，请使用：
  - `npx @ex/ai-spec init . --package packages/your-app`（路径相对**工作区根**），或
  - 先 `cd` 到子包再执行 `npx @ex/ai-spec init`，或
  - 环境变量 `EX_AI_SPEC_WORKSPACE_PACKAGE=packages/your-app`（与 `--package` 等价）。
- **确需在根 `package.json` 安装依赖**（pnpm）：使用 `pnpm add -w <包名>`；详见 `.agents/rules/common/08-通用约束.md` 中「pnpm workspace」说明。

`install.sh` / `install.ps1` 同样支持 **`--package <path>`** 与 **`--workspace-root`**（强制根目录、跳过上述交互）。

## 安装后必做事项

### 1. 填写项目信息

编辑（或在 AI IDE 中说 **「初始化项目规范」** 让 AI 生成）：

- `.agents/rules/01-项目概述.md` — 项目定位与技术栈
- `.agents/rules/03-项目结构.md` — 目录结构

### 2. 配置 MCP（L2 / L3）（可选：仅在使用 MCP 时配置）

- **默认状态**：Cursor 中各 MCP 服务多为**关闭/未启用**，属于正常情况，不代表安装失败。
- **建议顺序**：打开 **Cursor → 设置 → MCP**，按需**启用**目标服务 → 再编辑 `.cursor/mcp.json`，把 ApiFox 等条目中的 **`project-id`**、**`access-token`** 等占位符换成真实值。
- **不需要的服务**可保持关闭；若配置里某条目带有 **`disabled`**（或与 IDE 版本对应的禁用字段），请在**填好凭证后再启用**，避免未配置即连接报错。

### 3. L3：确认 OpenSpec

若使用 **`--level L3`**，确认已生成 **`openspec/`**（含 `config.yaml`、`changes/` 等），并阅读 [openspec-guide.md](openspec-guide.md) 跑通最小工作流。`create-proposal` 委托的 **`/opsx:propose`** 等命令依赖该目录与 OpenSpec CLI。

### L3 最简操作流程（命令速查）

1. **创建提案**：**Cursor** 用 `/opsx-propose [名称或描述]`；**Claude Code** 等用 `/opsx:propose [名称或描述]`。自然语言如「帮我创建一个变更提案」会先走 `create-proposal` 前置分析，再委托上述命令生成产物。
2. **产物位置**：`openspec/changes/<change-name>/`（含 `proposal.md`、`tasks.md`、`design.md` 等）。实施清单以该目录下的 **`tasks.md`** 为准，勿与仓库根目录其它待办文件混用。
3. **实施（execute-task）**：**Cursor** 用 `/opsx-apply`；**Claude Code** 等用 `/opsx:apply`。该路径会按 **execute-task** 四步循环逐条执行（头脑风暴 → TDD → 双重审查 → 状态更新），不要跳过流程、对照清单直接写代码。同义说法：「开始执行任务」「应用变更」。
4. **归档**：**Cursor** 用 `/opsx-archive`；**Claude Code** 等用 `/opsx:archive`。

更多命令、参数与 IDE 差异见 [openspec-guide.md](openspec-guide.md)。

## 开始使用

安装完成后，在 AI IDE 中正常对话即可；AI 会按 `.agents` 中的 Rules / Skills 执行。

### 高频场景

| 你想做什么 | 对 AI 说 |
|------------|----------|
| 新建组件 | 「创建一个用户列表组件」 |
| 新建页面 | 「新增一个订单详情页」 |
| 接新接口 | 「对接用户列表接口」 |
| 分析设计稿 | 「分析这个 Figma 设计稿」 |
| 创建提案（L3） | 「帮我创建一个变更提案」 |

## 验证安装

```bash
npx @ex/ai-spec check
# 或（在克隆的规范库目录下）
bash install.sh check /path/to/your-project
```

## 更新规范

```bash
npx @ex/ai-spec update
# 或
bash install.sh update /path/to/your-project --profile vue
```

更新**不会**覆盖 `01-项目概述.md` 和 `03-项目结构.md`（项目特有规则）。

## 延伸阅读

- [install-guide.md](install-guide.md) — 安装脚本参数与机制
- [openspec-guide.md](openspec-guide.md) — L3 / OpenSpec 使用说明
- [training-outline.md](training-outline.md) — 团队培训大纲
