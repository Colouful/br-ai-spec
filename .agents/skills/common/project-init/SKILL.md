---
name: project-init
description: 自动分析当前项目的技术栈、目录结构与实现约定，生成 01-项目概述.md、03-项目结构.md、context/PROJECT.md，并在自定义规则缺失时补生成 04/05/06/07/09。当需要初始化项目规范、生成项目概述、填写项目信息或根据项目生成自定义规则时使用本技能。
compatibility: Requires a local project workspace with package.json, .agents/rules/, and optional openspec/ for synchronized project documentation updates.
metadata:
  version: "2.1.0"
---

# 项目规范初始化

## 触发条件

当用户输入以下类似指令时，调用此技能：

- "初始化项目规范"
- "初始化项目"
- "初始化当前项目"
- "初始化当前项目规范"
- "生成项目概述"
- "填写 01 和 03"
- "分析项目技术栈"
- "生成项目结构文档"
- "根据项目生成自定义规则"
- "自定义 04/05/06/07/09"
- "生成项目规则"
- "project-init"
- "project init"

## 环境依赖

- 依赖本仓库的 `.agents/rules/` 目录结构和可写的 `context/`
- 若存在 `openspec/`，会同步写入 `openspec/project.md`
- 若可用，可先运行 `scripts/inspect-project.js` 输出项目事实摘要，再补读关键文件

## 注意事项

- 只要判定需要补 `04/05/06/07/09`，就不能只写 `01/03`
- 不能根据猜测编造业务背景，缺失信息只能写已确认事实
- 自定义规则必须基于项目实际代码、目录和依赖归纳，严禁照搬通用模板
- `openspec/` 不存在时，只跳过 `openspec/project.md`，不要强制创建 OpenSpec

## 执行核对清单

- [ ] `01-项目概述.md` 已生成或刷新
- [ ] `03-项目结构.md` 已生成或刷新
- [ ] `context/PROJECT.md` 已生成或刷新
- [ ] 待生成/待刷新规则已全部落盘

## 前置要求

1. 当前工作区必须是一个前端项目（存在 `package.json`）。
2. `.agents/rules/` 目录已存在（通过 `install.sh` / `install.ps1` / `npx init` 或手动创建）。
3. 若 `context/` 目录不存在，可由本技能创建。
4. 规则生成范围由两类信号共同决定：
   - `.agents/rules/` 中规则文件是否缺失
   - `.ai-spec/manifest.json.local_preferences.project_init.custom_rules` 中是否声明了需要按项目自定义生成或刷新的规则

## 固定产物

本技能的固定目标是：

- 始终生成或刷新：
  - `.agents/rules/01-项目概述.md`
  - `.agents/rules/03-项目结构.md`
  - `context/PROJECT.md`
- 若项目已安装 OpenSpec（存在 `openspec/`），同步 `openspec/project.md` 中的项目概述
- 对于安装时选择了“根据项目自定义”的规则，按项目事实生成或刷新：
  - `04-组件规范.md`
  - `05-API规范.md`
  - `06-路由规范.md`
  - `07-状态管理.md`
  - `09-样式规范.md`

## 完成标准（强约束）

以下条件必须同时满足，才算本次 `project-init` 完成：

1. `01-项目概述.md`
2. `03-项目结构.md`
3. `context/PROJECT.md`
4. 若存在 `openspec/`，则 `openspec/project.md` 已同步
5. 若 `.agents/rules/` 下缺失 `04/05/06/07/09` 中任意文件，则这些缺失项必须在本次执行中一并补生成
6. 若 `.ai-spec/manifest.json.local_preferences.project_init.custom_rules` 中包含 `04/05/06/07/09` 中任意规则，则这些规则即使文件已存在，也必须在本次执行中按项目事实刷新

也就是说：

- **如果待生成列表非空，只写 `01/03 + PROJECT` 视为未完成**
- **不能在摘要里只说“后续再补 04/05/06/07/09”**
- **不能只分析、不落盘**
- **不能只生成其中一部分缺失规则后就结束**

## 资源导航

- `scripts/inspect-project.js`
  - 何时用：需要先快速汇总技术栈、目录、缺失规则与 OpenSpec 信号时
  - 用法：`node scripts/inspect-project.js [workspace-root]`
- `references/scope-resolution.md`
  - 何时读：确定 `待生成列表 / 待刷新列表 / 本轮写入清单` 时
- `references/repo-fact-gathering.md`
  - 何时读：采集 `package.json`、`README.md`、源码目录与后端标记文件时
- `references/deep-scan-rules.md`
  - 何时读：只对本轮待生成/刷新规则做深度扫描时
- `references/output-contracts.md`
  - 何时读：写 `01/03/PROJECT/openspec/project.md` 前
- `references/custom-rule-generation.md`
  - 何时读：补生成 `04/05/06/07/09` 时

## 执行步骤

### 第零步：确定规则生成范围

- 先按 `references/scope-resolution.md` 确定 `待生成列表`、`待刷新列表` 和 `本轮写入清单`
- 若有需要，可先运行 `node scripts/inspect-project.js` 看一版摘要
- 后续所有写入必须严格遵守这份清单

### 第一步：采集基础项目信息

- 依次读取 `package.json`、`README.md`、源码目录和必要的后端标记文件
- 只提取稳定事实，不把任务期假设写进项目长期上下文
- 详细采集项见 `references/repo-fact-gathering.md`

### 第二步：仅对待生成/刷新规则做深度扫描

- 只对 `待生成列表 + 待刷新列表` 对应的能力域做深扫
- 每个能力域至少读取 2-3 个真实样本，再归纳规则
- 详细扫描要求见 `references/deep-scan-rules.md`

### 第三步：写入核心产物

- 生成或刷新：
  - `.agents/rules/01-项目概述.md`
  - `.agents/rules/03-项目结构.md`
  - `context/PROJECT.md`
- 若存在 `openspec/`，同步 `openspec/project.md`
- 每个产物的写法与边界见 `references/output-contracts.md`

### 第四步：补生成或刷新自定义规则

- 仅处理 `待生成列表` 与 `待刷新列表` 中的规则
- 每条规则必须基于仓库事实生成
- `04/05/06/07/09` 的详细覆盖要求见 `references/custom-rule-generation.md`

### 第五步：用户确认并一次性写入

- 真正写入前，按 `references/output-contracts.md` 的确认摘要格式向用户说明：
  - 技术栈
  - 目录结构
  - 项目定位
  - 本轮将补哪些规则
  - 是否同步 `openspec/project.md`
- 用户确认后，必须按 `本轮写入清单` 一次性完成全部写入
- 如果项目不是前端项目（无 `package.json`），应提示用户手动填写并提供空白模板方向
