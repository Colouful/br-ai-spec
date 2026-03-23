# br-ai-spec

AI Coding 团队规范库 — 让 AI 编码助手遵循统一的开发规范、工作流程和最佳实践。

支持的 AI IDE：**Cursor** | **Claude Code** | **OpenCode** | **Trae** | 以及 OpenSpec 支持的 25+ 种工具

## 快速开始

### npx 一键安装（推荐）

在项目根目录直接运行，无需克隆规范库：

```bash
# 交互式安装（引导选择技术栈和层级）
npx @bairong/ai-spec init

# 指定参数安装
npx @bairong/ai-spec init --profile vue --level L2
```

> 首次使用前需配置私有源（仅一次）：在 `~/.npmrc` 中添加 `@bairong:registry=https://your-private-registry.100credit.cn/`

更新规范 / 检查状态 / 卸载：

```bash
npx @bairong/ai-spec update          # 更新通用规范
npx @bairong/ai-spec check           # 检查安装状态
npx @bairong/ai-spec uninstall       # 卸载规范库
```

也可以全局安装后直接使用命令：

```bash
npm install -g @bairong/ai-spec
ai-spec init --profile react --level L2
```

> 跨平台支持：macOS/Linux 自动使用 Bash 脚本，Windows 自动使用 PowerShell 脚本，无需额外配置。

### 手动安装（Git 克隆）

```bash
# 克隆规范库
git clone http://git.100credit.cn/zhenwei.li/br-ai-spec.git
cd br-ai-spec

# 交互式安装（引导选择技术栈和层级）
bash install.sh init /path/to/your-project

# 指定参数安装
bash install.sh init /path/to/your-project --profile vue --level L2
```

**Windows PowerShell：**

```powershell
# 首次使用需放开脚本执行策略（仅需执行一次）
Set-ExecutionPolicy -Scope CurrentUser -ExecutionPolicy RemoteSigned

git clone http://git.100credit.cn/zhenwei.li/br-ai-spec.git
cd br-ai-spec

# 交互式安装（引导选择技术栈和层级）
.\install.ps1 init C:\path\to\your-project

# 指定参数安装
.\install.ps1 init C:\path\to\your-project --profile vue --level L2
```

> PS1 脚本与 Bash 脚本功能完全一致，支持交互选择、所有参数和全部安装层级。
> 如果不想修改全局策略，可使用单次绕过：`powershell -ExecutionPolicy Bypass -File .\install.ps1 init .`

**远程安装（无需手动克隆）：**

```bash
# Bash
curl -sSL <raw-url>/install.sh | bash -s -- init . --profile vue --level L2

# PowerShell
irm <raw-url>/install.ps1 | iex
```

安装完成后，在 AI IDE 中输入 **"初始化项目规范"** 即可自动分析项目并生成技术栈描述和目录结构规范。

### 技术栈 Profile

| Profile | 技术栈 | 规则数 | 技能数 |
|---------|--------|--------|--------|
| **react** | React + TS + Vite + Zustand + Ant Design + SCSS Modules | 13 | 7 |
| **vue** | Vue 3 + TS + Vite + Pinia + Vue Router + CSS Modules | 13 | 6 |

### 安装层级

| 层级 | 内容 | 适合场景 |
|------|------|----------|
| **L1** | 只安装 `.agents`（规范 + 技能） | 个人试用、快速体验 |
| **L2** | `.agents` + IDE 适配层 + MCP 模板 | 团队标准接入（默认） |
| **L3** | 全量安装含 OpenSpec 流程 | 需要需求治理与归档 |

### 脚本命令一览

| 命令 | 说明 |
|------|------|
| `install.sh init [dir]` | 首次接入：选择 Profile → 复制规范 → 创建链接 → 检查工具 |
| `install.sh update [dir]` | 更新通用规范（不覆盖项目特有规则 01/03，不覆盖 lint/husky 配置） |
| `install.sh check [dir]` | 检查安装状态、链接有效性、工具环境 |
| `install.sh uninstall [dir]` | 卸载规范库（含清理 lint 配置、husky 和相关依赖） |

### 可选参数

| 参数 | 说明 | 默认值 |
|------|------|--------|
| `--profile <name>` | 技术栈选择 (`react` / `vue`) | `vue` |
| `--level <L>` | 安装层级 (`L1` / `L2` / `L3`) | `L2` |
| `--ide <name>` | 指定 IDE (`default` / `cursor` / `claude` / `opencode` / `trae` / `all`) | `default`（cursor+claude） |
| `--uipro` | 安装 UI UX Pro Max 设计智能技能 | 交互询问 |
| `--no-uipro` | 跳过 UI UX Pro Max | - |
| `--repo <url>` | 自定义规范库地址 | 内置默认地址 |
| `--refresh-cache` | 清除本地缓存并重新克隆规范库 | - |
| `-y, --force` | 跳过确认提示（用于非交互卸载） | - |

---

## 架构概览

### 核心设计：单源多链接 + Profile 分层

`.agents/` 是唯一的规范维护源，按 **common + profiles** 分层组织：

```mermaid
graph LR
    subgraph Source["规范源 .agents/"]
        Common["common/<br/>通用规范+技能"]
        React["profiles/react/<br/>React 规范+技能"]
        Vue["profiles/vue/<br/>Vue 规范+技能"]
    end

    subgraph Installed["安装到目标项目"]
        Flat[".agents/<br/>rules/ + skills/<br/>(扁平合并)"]
    end

    Common -->|"install --profile react"| Flat
    React -->|合并| Flat
    Common -->|"install --profile vue"| Flat
    Vue -->|合并| Flat
```

各 IDE 通过软链接（macOS/Linux）或 Junction（Windows）引用同一份内容：

```mermaid
graph LR
    Agents[".agents/<br/>rules + skills"]
    Claude[".claude/"]
    Cursor[".cursor/"]
    OpenCode[".opencode/"]
    Trae[".trae/"]

    Claude -->|symlink| Agents
    Cursor -->|symlink| Agents
    OpenCode -->|symlink| Agents
    Trae -->|symlink| Agents
```

### 源仓库目录结构

```
br-ai-spec/
├── .agents/                          # 规范维护源
│   ├── rules/
│   │   ├── common/                   # 技术栈无关的通用规范（7 个）
│   │   │   ├── 02-编码规范.md
│   │   │   ├── 05-API规范.md
│   │   │   ├── 08-通用约束.md
│   │   │   ├── 10-文档规范.md
│   │   │   ├── 11-测试规范.md
│   │   │   ├── 12-Superpowers执行规范.md
│   │   │   └── 13-代码格式化与检查.md
│   │   └── profiles/
│   │       ├── react/                # React 技术栈规范（6 个）
│   │       │   ├── 01-项目概述.md ★
│   │       │   ├── 03-项目结构.md ★
│   │       │   ├── 04-组件规范.md
│   │       │   ├── 06-路由规范.md
│   │       │   ├── 07-状态管理.md
│   │       │   └── 09-样式规范.md
│   │       └── vue/                  # Vue 技术栈规范（同上结构）
│   │
│   └── skills/
│       ├── common/                   # 通用技能（10 个）
│       │   ├── create-proposal/      # 创建需求提案
│       │   ├── create-test/          # 创建测试用例
│       │   ├── design-analysis/      # 设计稿分析
│       │   ├── execute-task/         # Superpowers 模式执行任务
│       │   ├── find-skills/          # 搜索与安装技能
│       │   ├── project-init/         # 初始化项目规范
│       │   ├── skill-creator/        # 创建新技能
│       │   ├── ui-verification/      # UI 还原验收
│       │   ├── using-superpowers/    # 技能调度核心
│       │   └── web-design-guidelines/ # Web 设计规范审查
│       └── profiles/
│           ├── react/                # React 技能（7 个）
│           │   ├── create-api/
│           │   ├── create-component/
│           │   ├── create-route/
│           │   ├── create-store/
│           │   ├── theme-variables/
│           │   ├── vercel-composition-patterns/
│           │   └── vercel-react-best-practices/
│           └── vue/                  # Vue 技能（6 个）
│               ├── create-api/
│               ├── create-component/
│               ├── create-store/
│               ├── create-view/
│               ├── theme-variables/
│               └── vue-best-practices/
│
├── configs/                          # lint/format 配置模板
│   ├── common/                       # 所有 Profile 共享
│   │   ├── .editorconfig
│   │   ├── .prettierrc.json
│   │   ├── .prettierignore
│   │   ├── .stylelintrc.json
│   │   ├── .stylelintignore
│   │   ├── .lintstagedrc
│   │   ├── .husky/                   # pre-commit + commit-msg
│   │   └── commitlint.config.js
│   └── profiles/
│       ├── react/                    # React 特有配置
│       │   ├── .eslintrc.js
│       │   ├── .eslintignore
│       │   └── .stylelintrc.json
│       └── vue/                      # Vue 特有配置
│           ├── .eslintrc.cjs
│           └── .eslintignore
│
├── .cursor/
│   └── mcp.json                     # MCP 服务器配置模板
│
├── openspec/
│   ├── config.yaml.template         # OpenSpec 增强版配置模板
│   ├── specs/                        # （L3 安装后由 OpenSpec 管理）
│   └── changes/                      # （L3 安装后由 OpenSpec 管理）
│
├── docs/
│   ├── quick-start.md               # 5 分钟快速上手
│   ├── install-guide.md             # 详细安装指南
│   └── training-outline.md          # 2 小时团队培训大纲
│
├── install.sh                        # Bash 安装脚本（macOS/Linux/Git Bash/WSL）
└── install.ps1                       # PowerShell 安装脚本（Windows）
```

★ 标记的文件为项目特有规则模板，安装后需根据项目实际情况修改，update 不会覆盖。

---

## 规范体系：Rules + Skills

### 两层设计

- **Rules**：声明式规范，告诉 AI「什么能做、什么不能做」。按需加载，不会自动注入每次对话。
- **Skills**：过程式指令，告诉 AI「具体怎么做」。包含步骤、示例代码和检查清单。

### 通用规范（所有 Profile 共享）

| 规范 | 说明 |
|------|------|
| 02-编码规范 | TypeScript、命名、函数命名 |
| 05-API规范 | 接口命名、错误处理 |
| 08-通用约束 | 中文注释、占位元素 |
| 10-文档规范 | 注释与 JSDoc |
| 11-测试规范 | 测试覆盖与质量门禁 |
| 12-Superpowers执行规范 | 头脑风暴 → TDD → 双重审查 |
| 13-代码格式化与检查 | ESLint、Prettier、Stylelint、husky |

### 通用技能（所有 Profile 共享）

| 技能 | 说明 |
|------|------|
| using-superpowers | 技能调度核心，每次对话启动前检查适用技能 |
| execute-task | Superpowers 模式（头脑风暴 → TDD → 双重审查）执行开发任务 |
| create-proposal | 根据需求创建提案（设计稿分析 + 接口对接 + UI 验收） |
| design-analysis | 分析设计稿并梳理前端 UI 开发任务 |
| ui-verification | 以实际页面 vs 设计稿比对完成 UI 验收 |
| create-test | 按规范创建 Vitest 测试文件（命名、断言、Mock、覆盖率） |
| project-init | 自动分析项目并生成 01-项目概述 和 03-项目结构 |
| find-skills | 搜索和安装社区技能 |
| skill-creator | 创建新的自定义技能 |
| web-design-guidelines | 审查 UI 代码的 Web 设计规范合规性 |

### Profile 特定技能

| 技能 | React | Vue | 说明 |
|------|:-----:|:---:|------|
| create-component | ✓ | ✓ | 按团队规范创建和拆分组件 |
| create-route / create-view | ✓ | ✓ | 创建路由页面（React: route, Vue: view） |
| create-store | ✓ | ✓ | 创建全局状态（React: Zustand/Redux, Vue: Pinia） |
| create-api | ✓ | ✓ | 按规范创建 HTTP 接口封装 |
| theme-variables | ✓ | ✓ | 正确使用主题 CSS 变量 |
| vercel-react-best-practices | ✓ | - | React/Next.js 性能优化指南 |
| vercel-composition-patterns | ✓ | - | React 组合模式（复合组件等） |
| vue-best-practices | - | ✓ | Vue 3 Composition API 最佳实践与工作流 |

### Profile 特定规范

安装时根据 `--profile` 参数选择对应的技术栈规范和技能，合并到目标项目的 `.agents/` 扁平目录。

---

## OpenSpec 集成（L3）

br-ai-spec 与 OpenSpec 通过 `openspec/config.yaml` 一个文件桥接，职责完全分离：

- **br-ai-spec** 管理编码规范和业务技能（`.agents/`）
- **OpenSpec** 管理需求流程（propose → apply → archive）
- `config.yaml` 的 `context` 和 `rules` 字段让 OpenSpec 流程自动引用 br-ai-spec 规范

L3 安装时，`install.sh` 会自动运行 `openspec init`，生成 OpenSpec 的 skill 和 command 文件。

```bash
# 完整安装含 OpenSpec
bash install.sh init /path/to/project --profile react --level L3
```

---

## 团队接入指南

详见 [docs/quick-start.md](docs/quick-start.md)、[docs/install-guide.md](docs/install-guide.md) 和 [docs/training-outline.md](docs/training-outline.md)。

### 注意事项

| 事项 | 说明 |
|------|------|
| **项目特有规则** | `01-项目概述.md` 和 `03-项目结构.md` 必须根据项目实际情况填写，update 不会覆盖 |
| **lint/format 配置** | update 时不会覆盖已有的 lint、prettier、husky 等配置文件 |
| **MCP 配置** | `.cursor/mcp.json` 中的 token 和 project-id 是占位符，需替换为实际值 |
| **OpenSpec** | 仅 L3 级别安装，其他级别可忽略 |
| **Windows 链接** | 使用 Junction（`mklink /J`）替代 symlink，无需管理员权限 |
| **规范更新** | 定期运行 `install.sh update`（或 `.\install.ps1 update`）同步最新通用规范 |
| **缓存管理** | 规范库会缓存到 `~/.br-ai-spec/`，切换分支或强制刷新时使用 `--refresh-cache` |

---

## MCP 配置说明

`.cursor/mcp.json` 中预配置了以下 MCP 服务：

| 服务 | 用途 | 配置要求 |
|------|------|----------|
| ApiFox | 接口文档 | 需替换 `project-id` 和 `access-token` |
| Figma | 设计稿 | 使用 Figma MCP 官方服务 |
| Context7 | 文档检索 | 无需额外配置 |
| Playwright | 页面自动化 | 无需额外配置 |
| Pencil | VS Code 插件 | 需安装 Pencil 插件，路径按实际替换 |

---

## FAQ

**Q: 安装后 AI 没有遵循规范？**
A: 运行 `install.sh check`（或 `.\install.ps1 check`）确认链接有效。部分 IDE 需要重启才能识别新的规则文件。

**Q: Windows 上运行 `install.ps1` 提示"禁止运行脚本"怎么办？**
A: Windows PowerShell 默认禁止执行脚本。运行 `Set-ExecutionPolicy -Scope CurrentUser -ExecutionPolicy RemoteSigned` 放开策略（仅需一次），或使用 `powershell -ExecutionPolicy Bypass -File .\install.ps1 init .` 单次绕过。

**Q: PowerShell 脚本和 Bash 脚本功能一样吗？**
A: 是的。`install.ps1` v2.0 已与 `install.sh` 完全功能对齐，支持交互选择、所有参数和全部安装层级。Windows 团队成员也可以使用 Git Bash 运行 `install.sh`。

**Q: 如何在 React 和 Vue 之间切换？**
A: 运行 `install.sh init --profile vue`（或 `.\install.ps1 init --profile vue`）重新安装。会覆盖技术栈相关的规则文件（04/06/07/09），但已修改过的项目特有规则（01/03）会跳过。

**Q: update 会覆盖我修改过的文件吗？**
A: 不会覆盖 `01-项目概述.md` 和 `03-项目结构.md`（项目特有规则），也不会覆盖已有的 lint/format/husky 配置文件。通用规范和技能会全量更新。

**Q: 如何添加自定义规范？**
A: 在安装后的 `.agents/rules/` 下新增文件即可，建议使用数字前缀保持排序（如 `14-自定义规范.md`）。添加新技能则在 `.agents/skills/` 下创建目录和 `SKILL.md`。

**Q: 支持 Monorepo 吗？**
A: 支持。在 Monorepo 根目录运行安装脚本，所有子项目共享同一套规范。如果子项目需要独立规范，可分别安装。

**Q: OpenSpec 是必须的吗？**
A: 不是。L1/L2 级别不包含 OpenSpec。OpenSpec 更适合新功能开发、跨模块变更等需要需求治理的场景。
