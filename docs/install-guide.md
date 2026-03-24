# install.sh 安装脚本详解

ex-ai-spec 规范库安装工具 v0.0.16，适用于 macOS / Linux / Git Bash / WSL。

## 推荐入口（npx）

在**目标前端项目根目录**优先使用 **npx**（无需先克隆本仓库），与仓库根目录 [README.md](../README.md) 一致：

```bash
npx @ex/ai-spec init
npx @ex/ai-spec update
npx @ex/ai-spec check
npx @ex/ai-spec uninstall
```

> 首次使用需在 `~/.npmrc` 配置私有源：`@ex:registry=http://nodejs.100credit.cn/`

**本文档**侧重 **`install.sh` / `install.ps1` 的参数、合并机制与排错**；npx 底层仍会调用同源脚本。

---

## 一、基本用法

```bash
bash install.sh <命令> [目标目录] [选项]
```

### 四个命令

| 命令 | 说明 | 示例 |
|------|------|------|
| `init` | 首次安装到目标项目 | `bash install.sh init ~/my-project` |
| `update` | 更新规范（保留项目特有规则） | `bash install.sh update ~/my-project` |
| `check` | 检查安装状态与链接有效性 | `bash install.sh check ~/my-project` |
| `uninstall` | 卸载规范库 | `bash install.sh uninstall ~/my-project` |

目标目录默认为当前目录（`.`）。

---

## 二、核心参数

### --profile（技术栈选择）

| 值 | 技术栈 | Profile 内条数（合并前） |
|----|--------|--------------------------|
| `vue`（默认） | Vue 3 + TS + Vite + Pinia + Vue Router | 6 条技术栈规范 + 6 个技能 |
| `react` | React + TS + Vite + Zustand + Ant Design | 6 条技术栈规范 + 7 个技能 |

安装时将 **`common/`**（**7 条通用规范** + **10 个通用技能**）与选中 profile 的 **6 条规范** + **上表技能数** 合并到目标项目 **`.agents/`** 扁平目录，合计 **13 条规范**；技能合计 **Vue：16 个**、**React：17 个**。

### --level（安装层级）

| 层级 | 安装内容 | 适合场景 |
|------|----------|----------|
| `L1` | 只安装 `.agents/`（rules + skills） | 个人试用、最小接入 |
| `L2` | `.agents/` + IDE 适配层（软链接）+ MCP 模板 | 团队编码规范 + 外部上下文（**不含** OpenSpec，需显式 `--level L2`） |
| `L3`（**默认**） | L2 全部 + **OpenSpec**（`openspec/`、OPSX；与 `.agents` 经 `config.yaml` **一体安装**） | **团队主推**：需求治理与归档闭环 |

### --ide（IDE 选择）

| 值 | 说明 |
|----|------|
| `default`（默认） | Cursor + Claude Code |
| `all` | 为 Cursor、Claude Code、OpenCode、Trae 全部创建适配 |
| `cursor` | 仅 Cursor |
| `claude` | 仅 Claude Code |
| `opencode` | 仅 OpenCode |
| `trae` | 仅 Trae |

### --repo（自定义仓库地址）

覆盖默认的规范库 Git 地址。也可通过环境变量 `BR_AI_SPEC_REPO` 设置。

---

## 三、安装流程详解

### init 命令完整流程

```
bash install.sh init /path/to/project --profile vue
```
（未指定 `--level` 时脚本默认为 **L3**；不要 OpenSpec 时加 `--level L2`。）

执行步骤如下：

```
1. 交互式引导（无参数时）
   ├── 选择技术栈 Profile（react / vue）
   └── 选择安装层级（L1 / L2 / L3）

2. 检测规范源
   ├── 从规范库目录运行？→ 使用本地文件
   └── 否 → 克隆/更新到 ~/.ex-ai-spec / 缓存

3. 复制 .agents/（Profile 合并）
   ├── rules: common/*.md + profiles/<profile>/*.md → 扁平 .agents/rules/
   ├── skills: common/*/ + profiles/<profile>/*/ → 扁平 .agents/skills/
   └── 保护项目特有规则（01-项目概述、03-项目结构 已存在则跳过）

4.（L2/L3）创建 IDE 链接
   ├── rules: 整体软链接 → ../.agents/rules
   └── skills: 逐个 skill 目录软链接（给 OpenSpec 留空间）

5.（L2/L3）复制 Cursor 额外文件
   └── mcp.json（仅在不存在时复制）

6.（仅 L3）配置 OpenSpec
   ├── 检测 openspec CLI 是否安装
   ├── 运行 openspec init --tools <ide>
   └── 合并增强版 config.yaml（注入 context + rules）

7. 检查工具环境（git / node / npx / openspec）

8. 输出安装报告 + 后续步骤
```

### update 命令流程

与 init 类似，但要求 `.agents/` 已存在。核心差异：
- 通用规范和技能会全量更新
- `01-项目概述.md` 和 `03-项目结构.md` 若已存在则**跳过不覆盖**
- IDE 链接会重新校验和创建

### check 命令检查项

| 检查项 | 说明 |
|--------|------|
| `.agents/rules/` 是否存在 | 规范文件数量 |
| `.agents/skills/` 是否存在 | 技能目录数量 |
| `.<ide>/rules` 软链接是否有效 | 逐个 IDE 检查 |
| `.<ide>/skills` 链接数量 | 逐个 IDE 检查 |
| `openspec/` 是否存在 | config.yaml、specs/、changes/ |
| 工具环境 | git、node、npx、openspec |

### uninstall 命令

需要用户确认（y/N），移除内容：
- 所有 IDE 目录中的 skills 链接和 rules 链接
- 清空 IDE 目录（如无其他内容）
- 删除整个 `.agents/` 目录

---

## 四、关键机制

### Profile 合并

源仓库按 `common/` + `profiles/` 分层组织规范和技能，安装时合并为扁平目录：

```
源仓库:                              目标项目:
.agents/rules/common/02-编码规范.md    →  .agents/rules/02-编码规范.md
.agents/rules/common/05-API规范.md     →  .agents/rules/05-API规范.md
.agents/rules/profiles/vue/01-项目概述.md → .agents/rules/01-项目概述.md
.agents/rules/profiles/vue/04-组件规范.md → .agents/rules/04-组件规范.md
```

用户在目标项目中看到的始终是简洁的扁平结构。

### 项目特有规则保护

`01-项目概述.md` 和 `03-项目结构.md` 是项目特有规则：
- **init** 时：如已存在则跳过，不覆盖
- **update** 时：同样跳过，不覆盖
- 其他规范文件：每次 update 全量覆盖

### Skills 链接策略

Skills 目录采用**逐个 skill 目录链接**（而非整体软链接），原因是 L3 级别的 OpenSpec 需要在 `.cursor/skills/` 中写入自己的 skill 文件：

```
.cursor/skills/
├── create-component/ -> ../../.agents/skills/create-component  # ex-ai-spec （链接）
├── create-api/ -> ../../.agents/skills/create-api              # ex-ai-spec （链接）
├── openspec-propose/                                           # OpenSpec 自动生成
└── openspec-apply-change/                                      # OpenSpec 自动生成
```

### OpenSpec 集成（L3）

L3 安装时的 OpenSpec 配置流程：

1. 检测 `openspec` CLI 是否可用
2. 未安装 → 提示安装命令，创建基础骨架目录
3. 已安装 → 运行 `openspec init --tools <ide>` 自动生成 skills + commands
4. 将 `config.yaml.template` 中的 `context` 和 `rules` 字段合并到 `openspec/config.yaml`

这让 OpenSpec 流程自动引用 ex-ai-spec 的规范和技能，两者通过 **`openspec/config.yaml`** 桥接，与 **`.agents`** 同属本规范库交付的一体能力（非独立外挂）。

### 规范源检测

脚本启动时自动检测规范来源：

| 场景 | 行为 |
|------|------|
| 从规范库目录直接运行 | 使用本地 `.agents/` 文件 |
| 从其他位置运行 | 克隆/更新规范库到 `~/.ex-ai-spec /` 缓存 |

缓存目录可通过环境变量 `BR_AI_SPEC_CACHE` 自定义。

---

## 五、环境变量

| 变量 | 默认值 | 说明 |
|------|--------|------|
| `BR_AI_SPEC_REPO` | `http://git.100credit.cn/zhenwei.li/ex-ai-spec.git` | 规范库 Git 地址 |
| `BR_AI_SPEC_CACHE` | `~/.ex-ai-spec ` | 本地缓存目录 |

---

## 六、常用示例

```bash
# npx（在目标项目根目录，与 README 一致；未写 --level 时默认为 L3）
npx @ex/ai-spec init --profile vue
npx @ex/ai-spec init --profile vue --level L2
npx @ex/ai-spec init --profile react

# 交互式安装（推荐新用户，会引导选择）
bash install.sh init

# Vue / React 项目标准接入（默认 L3，含 OpenSpec）
bash install.sh init ~/projects/my-vue-app --profile vue
bash install.sh init ~/projects/my-react-app --profile react

# 仅安装 Cursor 适配
bash install.sh init ~/projects/my-app --ide cursor

# 更新规范（保留项目特有规则）
bash install.sh update ~/projects/my-app --profile vue

# 检查安装状态
bash install.sh check ~/projects/my-app

# 卸载
bash install.sh uninstall ~/projects/my-app

# 远程一行安装
curl -sSL <raw-url>/install.sh | bash -s -- init . --profile vue
```

---

## 七、跨平台支持

**Windows**：若使用 **PowerShell**，请使用仓库内 **`install.ps1`**（与 `install.sh` 功能对齐）；下文表格含 Git Bash / WSL 与原生 Windows 的差异说明。

| 平台 | 链接方式 | 说明 |
|------|----------|------|
| macOS / Linux | `ln -s`（符号链接） | 默认方式 |
| Windows (Git Bash / WSL) | `mklink /J`（Junction） | 无需管理员权限，自动检测 |
| Windows (PowerShell) | 使用 `install.ps1` | 独立的 PowerShell 版本 |

脚本通过 `OSTYPE` 环境变量自动检测平台并选择合适的链接方式。

### Windows PowerShell 注意事项

Windows PowerShell 默认禁止执行 `.ps1` 脚本（`Restricted` 策略）。首次使用前需放开执行策略：

```powershell
# 方式一：修改当前用户策略（仅需执行一次）
Set-ExecutionPolicy -Scope CurrentUser -ExecutionPolicy RemoteSigned

# 方式二：仅本次会话放开
Set-ExecutionPolicy -Scope Process -ExecutionPolicy Bypass

# 方式三：单次绕过，不修改任何策略
powershell -ExecutionPolicy Bypass -File .\install.ps1 init .
```
