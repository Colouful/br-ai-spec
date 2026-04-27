# br-ai-spec 第一次使用 — 本地 CLI 接入指南

> 适用场景：你有一个本地业务项目（Vue/React），第一次接入 `ai-spec-auto`，用本地 CLI 完成完整的渐进式引入。
> 前置条件：已 clone `br-ai-spec` 项目到本地。

---

## 零、环境确认

```bash
# 1. 确认 br-ai-spec 项目路径
ls /path/to/br-ai-spec/bin/cli.js
# 应该输出: /path/to/br-ai-spec/bin/cli.js

# 2. 确认 Node.js 版本 >= 20
node -v
# 应该输出: v20.x.x 或 v22.x.x

# 3. 为了跳过启动器同步，建议先设置环境变量
export AI_SPEC_SKIP_LAUNCHER_SYNC=1
```

> **说明**：`AI_SPEC_SKIP_LAUNCHER_SYNC=1` 跳过全局启动器同步，直接使用本地 CLI。本地开发调试时建议加上，生产环境安装全局 CLI 后不需要。

---

## 一、扫描业务项目

先让 CLI 自动识别你的项目技术栈：

```bash
cd /path/to/br-ai-spec

# 扫描你的业务项目
AI_SPEC_SKIP_LAUNCHER_SYNC=1 node bin/cli.js scan /path/to/your-project --json
```

**预期输出示例**（Vue 项目）：
```json
{
  "workspace": {
    "rootDir": "/path/to/your-project",
    "type": "single-project",
    "packageManager": "pnpm"
  },
  "packages": [{
    "primary": {
      "detector": "VueViteDetector",
      "framework": "vue-vite",
      "confidence": 95,
      "language": ["TypeScript"]
    }
  }]
}
```

**验证点**：
- `detector` 正确识别技术栈（VueViteDetector / ReactViteDetector）
- `confidence` >= 80（高置信度，不需要人工确认）
- `language` 正确识别

---

## 二、预览初始化计划（dry-run）

```bash
AI_SPEC_SKIP_LAUNCHER_SYNC=1 node bin/cli.js init /path/to/your-project --recommend --dry-run
```

**预期输出**：

```
InitPlan 生成完成
目标目录：/path/to/your-project
工作区类型：single-project
包数量：1

推荐 Manifest：
  - .
    项目类型：application
    primary detector：VueViteDetector
    confidence：95
    推荐来源：本地
    是否自动推荐 Manifest：是
    推荐 Manifest：frontend-vue-vite-standard@1.0.0（分数 95）

将要写入的文件：
  - .ai-spec/project.json：创建
  - .ai-spec/policy.json：创建
  - .ai-spec/ai-spec.lock.json：创建
  - .agents/registry.index.json：创建
  - .ai-spec/context-index.json：创建
  - .cursor/rules/ai-spec-auto.mdc：创建
  - CLAUDE.md：创建
  - memory.md：创建

dry-run 不会写入文件。
```

**验证点**：
- `项目类型` 显示为 `application`（不是 cli-tool 或 unknown）
- 推荐 Manifest 与你预期一致
- `confidence` >= 80 且没有"需要人工确认"
- 将要写入的文件列表正确

> **如果项目类型是 cli-tool**：说明你的项目被识别为 CLI 工具而非业务项目。此时不会自动推荐 Manifest，需要手动指定 `--manifest frontend-vue-vite-standard`。

---

## 三、执行初始化（yes）

确认计划无误后，执行实际写入：

```bash
AI_SPEC_SKIP_LAUNCHER_SYNC=1 node bin/cli.js init /path/to/your-project --recommend --yes
```

**预期输出**：

```
初始化写入完成
项目 ID：proj_xxxxxxxxxxxxxxxx
已写入文件：
  - .agents/rules/：创建
  - .agents/skills/：创建
  - .agents/roles/：创建
  - .agents/commands/：创建
  - .ai-spec/project.json：创建
  - .ai-spec/policy.json：创建
  - .ai-spec/ai-spec.lock.json：创建
  - .agents/registry.index.json：创建
  - .ai-spec/context-index.json：创建
  - .cursor/rules/ai-spec-auto.mdc：创建
  - CLAUDE.md：创建
  - memory.md：创建
```

**验证点**：
- 出现"初始化写入完成"
- 列表中包含 `.agents/rules/`、`.agents/skills/` 等资产目录
- 有 `project ID`
- 业务项目的 `.gitignore` 没有被修改

---

## 四、IDE 同步（Pointer-only 指针层）

init 完成后，运行 `ide sync` 补齐**全部** IDE 指针文件：

```bash
# React 项目
AI_SPEC_SKIP_LAUNCHER_SYNC=1 node bin/cli.js ide sync /path/to/your-project \
  --ide cursor,claude \
  --profile react \
  --link-mode copy \
  --yes

# Vue 项目
AI_SPEC_SKIP_LAUNCHER_SYNC=1 node bin/cli.js ide sync /path/to/your-project \
  --ide cursor,claude \
  --profile vue \
  --link-mode copy \
  --yes
```

**参数说明**：

| 参数 | 可选值 | 建议 |
|------|--------|------|
| `--ide` | `cursor,claude` | 都选上 |
| `--profile` | `auto` / `react` / `vue` | 明确指定 |
| `--link-mode` | `auto` / `copy` / `symlink` | 团队项目用 `copy` |
| `--yes` | — | 确认执行 |

**预期输出**：

```
IDE 同步完成
使用模式：copy

已写入文件：
  - .agents/registry/ide-registry.json：创建
  - .ai-spec/ide-integration.json：创建
  - .cursor/rules/ai-spec-auto.mdc：更新
  - .cursor/commands/spec-start.md：创建
  - .cursor/commands/spec-update.md：创建
  - .cursor/commands/spec-status.md：创建
  - .claude/ai-spec-auto.md：创建
  - .claude/commands/spec-start.md：创建
  - .claude/commands/spec-update.md：创建
  - .claude/commands/spec-status.md：创建
  - AGENTS.md：创建
  - CLAUDE.md：更新
  - memory.md：更新
```

---

## 五、完整性检查（doctor）

```bash
AI_SPEC_SKIP_LAUNCHER_SYNC=1 node bin/cli.js ide doctor /path/to/your-project
```

**预期输出**：

```
IDE 指针文件检查通过，所有文件完整
```

**如果出现缺失**：

```bash
# 修复缺失文件
AI_SPEC_SKIP_LAUNCHER_SYNC=1 node bin/cli.js ide repair /path/to/your-project --yes
```

---

## 六、对接 Visual 可视化平台（可选）

> 如果你有本地运行的 Visual 服务（如 `http://localhost:18780`），可以让 br-ai-spec 自动上报项目状态和运行事件。

### 6.1 什么是 Visual 上报

br-ai-spec 在 init、spec-start、spec-continue 等关键节点会自动向 Visual 服务发送以下数据：

| 时机 | 上报类型 | 内容 |
|------|----------|------|
| init 完成 | project-state | 项目 ID、技术栈、Manifest |
| spec 阶段切换 | run-event | 当前阶段、执行器、状态 |
| spec 执行完成 | history | 变更文件列表、验证摘要、耗时 |
| 异常发生 | incident | 错误信息、建议修复方案 |

> **隐私保证**：源码、绝对路径、密钥、AI 提示词**绝对不上传**（由 PrivacyFilter 双重过滤）。

### 6.2 方式一：init 时直接指定（最简单）

```bash
# 在 init 时加上 --visual-url
$CLI init $PROJECT --recommend --yes --visual-url http://localhost:18780
```

### 6.3 方式二：编辑 policy.json（推荐，持久生效）

在业务项目的 `.ai-spec/policy.json` 中添加：

```json
{
  "visual": {
    "url": "http://localhost:18780",
    "enabled": true,
    "nonBlocking": true
  }
}
```

配置后所有命令自动上报，无需每次传 `--visual-url`。

### 6.4 验证 Visual 上报

```bash
# 1. 确保 Visual 服务正在运行
curl http://localhost:18780/api/health

# 2. 执行 init（带 visual-url）
$CLI init $PROJECT --recommend --yes --visual-url http://localhost:18780

# 3. 观察输出 —— 如果看到"已跳过运行态上报"说明 Visual 不可达
#    正常情况不会出现此警告
```

### 6.5 环境变量方式

```bash
export AI_SPEC_VISUAL_URL=http://localhost:18780
$CLI init $PROJECT --recommend --yes
```

### 6.6 配置优先级

```
CLI --visual-url  >  policy.json visual.url  >  环境变量 $AI_SPEC_VISUAL_URL
```

### 6.7 Visual 服务需要的 API

你的 Visual 服务需要实现以下接口才能接收数据：

```
GET  /api/health                              → 健康检查
POST /api/collector/project-state             → 接收项目状态
POST /api/collector/run-event                 → 接收运行事件
POST /api/collector/history                   → 接收历史记录
POST /api/collector/incident                  → 接收异常事件
```

详细数据格式和对接文档见：[对接 Visual 文档](./对接visul.md)

---

## 七、验证项目生成的文件

初始化完成后，你的业务项目应该新增以下文件和目录：

```
your-project/
├── .ai-spec/                     # 项目配置层
│   ├── project.json              # 项目画像
│   ├── policy.json               # 执行策略（隐私、分支、审批）
│   ├── ai-spec.lock.json         # 资产锁定索引
│   ├── context-index.json        # 渐进式上下文索引
│   └── ide-integration.json      # IDE 集成状态
│
├── .agents/                      # 资产正文层
│   ├── registry.index.json       # 资产注册表
│   ├── registry/
│   │   └── ide-registry.json     # IDE 消费索引
│   ├── rules/                    # 编码规范（组件、API、路由、状态管理…）
│   ├── skills/                   # 技能定义（创建组件、创建 API、创建测试…）
│   ├── roles/                    # 角色定义（前端实现、后端实现、测试…）
│   ├── commands/                 # 命令模板
│   ├── flows/                    # 工作流定义
│   └── templates/                # 模板
│
├── .cursor/                      # Cursor IDE 指针层
│   ├── rules/
│   │   └── ai-spec-auto.mdc      # Cursor 规则入口（alwaysApply: true）
│   └── commands/
│       ├── spec-start.md         # /spec-start 自定义命令
│       ├── spec-update.md        # /spec-update 自定义命令
│       └── spec-status.md        # /spec-status 自定义命令
│
├── .claude/                      # Claude Code 指针层
│   ├── ai-spec-auto.md           # Claude Code 入口
│   └── commands/
│       ├── spec-start.md
│       ├── spec-update.md
│       └── spec-status.md
│
├── AGENTS.md                     # 通用 Agent 入口（含 AI-SPEC-AUTO 锚点）
├── CLAUDE.md                     # Claude Code 入口（含 AI-SPEC-AUTO 锚点）
└── memory.md                     # 跨会话记忆入口
```

**无需提交到 Git**：`.ai-spec/`、`.agents/`、`.cursor/`、`.claude/` 已经是 AI 管理文件，建议加入 `.gitignore`。

---

## 八、在 Cursor 中使用 /spec-start

### 7.1 打开项目

在 Cursor 中打开你的业务项目目录。

### 7.2 确认规则加载

打开 Cursor 的 AI Chat（`Cmd+I` 或 `Cmd+L`），你应该能看到 Cursor 已自动加载 `.cursor/rules/ai-spec-auto.mdc`（因为设置了 `alwaysApply: true`）。

### 7.3 启动需求

在 AI Chat 中输入：

```
/spec-start 为首页添加用户登录状态显示功能
```

AI 会自动：
1. 读取 `ide-registry.json` → 了解项目 profile（Vue/React）
2. 读取 `registry.index.json` → 了解可用 Rule / Skill
3. 读取 `context-index.json` → 按阶段渐进式加载规则
4. 按规范推进：规划 → 实现 → 验证 → 测试

### 7.4 常用命令

| 命令 | 用途 |
|------|------|
| `/spec-start <需求描述>` | 启动新需求 |
| `/spec-update <补充内容>` | 补充或修正当前需求 |
| `/spec-status` | 查看当前运行状态 |
| `/spec-continue` | 继续当前 run |

---

## 九、完整流程速查

```bash
# === 一次性设置 ===
export AI_SPEC_SKIP_LAUNCHER_SYNC=1
CLI="node /path/to/br-ai-spec/bin/cli.js"
PROJECT="/path/to/your-business-project"

# Step 1: 扫描
$CLI scan $PROJECT --json

# Step 2: 预览
$CLI init $PROJECT --recommend --dry-run

# Step 3: 初始化（不带 Visual 的纯净版本）
$CLI init $PROJECT --recommend --yes

# Step 3-Alt: 初始化（带 Visual 上报）
$CLI init $PROJECT --recommend --yes --visual-url http://localhost:18780

# Step 4: IDE 同步（Vue 项目）
$CLI ide sync $PROJECT --ide cursor,claude --profile vue --link-mode copy --yes

# Step 5: 完整性检查
$CLI ide doctor $PROJECT

# Step 6（可选）: 配置 Visual 持久化 —— 编辑 .ai-spec/policy.json
# 添加 "visual": { "url": "http://localhost:18780", "enabled": true, "nonBlocking": true }

# Step 7: 在 Cursor 中打开项目 → 输入 /spec-start <需求描述>
```

---

## 十、常见问题

### Q1: "目标项目尚未初始化" 错误

说明项目还没有 `project.json`。先执行 `init --recommend --yes`。

### Q2: "项目类型：cli-tool，不自动推荐 Manifest"

项目被识别为 CLI 工具，手动指定 Manifest：
```bash
$CLI init $PROJECT --manifest frontend-vue-vite-standard --yes
```

### Q3: "未配置 Hub URL，已使用本地模式"

不影响使用。本地模式所有资产从 br-ai-spec 自身复制，功能完整。Hub 模式用于团队共享资产。

### Q4: symlink 失败（Windows 或权限问题）

使用 `--link-mode copy` 替代 `auto`：
```bash
$CLI ide sync $PROJECT --link-mode copy --yes
```

### Q5: 如何在 CI/CD 中使用

```bash
# CI 中跳过交互，直接用 --yes
$CLI init $PROJECT --recommend --yes
$CLI ide sync $PROJECT --ide cursor,claude --profile vue --link-mode copy --yes
$CLI ide doctor $PROJECT  # 返回非 0 表示有缺失
```

### Q6: 如何更新已有项目的规范

```bash
# 重新 sync 即可（幂等）
$CLI ide sync $PROJECT --ide cursor,claude --profile vue --link-mode copy --yes
```

### Q7: Visual 上报失败怎么办

```
- 确认 Visual 服务正在运行: curl http://localhost:18780/api/health
- 检查 policy.json 中 visual.enabled 是否为 true
- 上报是异步非阻塞的，失败不影响主流程
- 如果出现 "已跳过运行态上报" 说明 URL 未配置或不可达
```

### Q8: 如何关闭 Visual 上报

```bash
# 方式1: 环境变量
export AI_SPEC_VISUAL_URL=""

# 方式2: 编辑 policy.json
# 设置 "visual": { "enabled": false }
```
