---
name: project-init
description: 自动分析当前项目的技术栈与目录结构，生成 01-项目概述.md 和 03-项目结构.md 规范文件。当需要初始化项目规范、生成项目概述或填写项目信息时使用本技能。
version: 1.0.0
---

# 项目规范初始化

## 触发条件

当用户输入以下类似指令时，调用此技能：

- "初始化项目规范"
- "生成项目概述"
- "填写 01 和 03"
- "分析项目技术栈"
- "生成项目结构文档"

## 前置要求

1. 当前工作区必须是一个前端项目（存在 `package.json`）。
2. `.agents/rules/` 目录已存在（通过 `install.sh` 或手动创建）。

## 执行步骤

### 第一步：采集项目信息

依次读取以下文件，提取关键信息：

**1.1 读取 `package.json`**

提取以下字段，构建技术栈清单：

| 提取目标 | 查找位置 | 示例 |
|----------|----------|------|
| UI 框架 | `dependencies` 中的 `react` / `vue` / `angular` | React ^18.3.1 |
| 类型系统 | `devDependencies` 中的 `typescript` | TypeScript 5.x |
| 构建工具 | `devDependencies` 中的 `vite` / `webpack` / `next` / `nuxt` | Vite 5.x |
| 路由管理 | `dependencies` 中的 `react-router*` / `vue-router` | React Router ^6.x |
| 状态管理 | `dependencies` 中的 `zustand` / `pinia` / `redux` / `mobx` | Zustand ^5.x |
| 组件库 | `dependencies` 中的 `antd` / `element-plus` / `@mui/*` | Ant Design 5.x |
| 样式方案 | 文件后缀（`.module.scss` / `.css` / `tailwind`） + `devDependencies` | SCSS Modules |
| HTTP 请求 | `dependencies` 中的 `axios` / `@tanstack/react-query` 或自有封装 | axios |
| Hooks 工具 | `dependencies` 中的 `ahooks` / `@vueuse/core` | ahooks 3.x |
| 工具函数 | `dependencies` 中的 `lodash*` / `ramda` / `date-fns` / `dayjs` | lodash-es |
| 时间工具 | `dependencies` 中的 `dayjs` / `moment` / `date-fns` | dayjs |

**1.2 扫描 `src/` 目录结构**

执行 `ls src/` 或读取文件树，记录：

- 顶层目录列表及各目录的用途推断
- 入口文件（`main.tsx` / `main.ts` / `App.tsx` / `App.vue`）
- 路由目录的组织模式（文件路由 vs 配置路由）

**1.3 检测项目类型**

根据采集结果判断项目类型：

- SPA（单页应用）：存在 `react-router` / `vue-router` + 无 SSR 框架
- SSR/SSG：存在 `next` / `nuxt` / `remix`
- 微前端子应用：存在 `qiankun` / `micro-app` / `wujie`
- 组件库/工具库：`main` 字段指向 lib 产物
- Monorepo：存在 `workspaces` 或 `pnpm-workspace.yaml`

### 第二步：生成 01-项目概述.md

在 `.agents/rules/` 下生成（或覆盖）`01-项目概述.md`，严格使用以下模板：

```markdown
---
alwaysApply: false
description: 项目定位与技术栈概览。当需要了解项目背景、使用的技术栈时读取此规则。
---

# 项目概述

## 项目定位

<!-- 一句话描述，格式："一个基于 [框架] + [语言] 的 [类型]。" -->
一个基于 {框架} + {语言} 的{项目类型}。

## 技术栈

| 领域 | 技术 | 说明 |
|------|------|------|
| UI 框架 | {名称} {版本} | {约束说明} |
| 类型系统 | {名称} {版本} | {约束说明} |
| 构建工具 | {名称} {版本} | {说明} |
| 路由管理 | {名称} {版本} | - |
| 状态管理 | {名称} {版本} | {约束说明} |
| 组件库 | {名称} {版本} | {说明} |
| 样式方案 | {方案名称} | {约束说明} |
| HTTP 请求 | {库名称} | {说明} |
| ... | ... | ... |
```

**填写规则**：

- 版本号从 `package.json` 中取实际值，保留前缀（`^` / `~`）
- "说明"列：核心强制依赖标注"强制使用"，辅助工具标注"优先使用"或用途说明
- 只列出项目**实际使用**的技术，不要猜测或补全未安装的依赖
- 如果检测到私有包（如 `@company/*`），单独列出并标注用途

### 第三步：生成 03-项目结构.md

在 `.agents/rules/` 下生成（或覆盖）`03-项目结构.md`，严格使用以下模板：

```markdown
---
alwaysApply: false
description: 项目的目录结构规范，定义了 src 目录下各目录的用途与约束。当需要确定代码应放在哪个目录时读取此规则。
---

# 项目结构（NON-NEGOTIABLE）

## 目录结构

\```
src/
├── {目录名}/      # {用途描述}
├── {目录名}/      # {用途描述}
└── 根级文件        # {入口文件列表}
\```

## 结构约束

| 类型 | 目录 | 规范 |
|------|------|------|
| {类型} | `src/{目录}/` | {该目录的组织规范} |
| ... | ... | ... |
```

**填写规则**：

- 目录树必须反映 `src/` 下的**实际目录**，不要添加不存在的目录
- 每个目录的用途从其内部文件推断（读取 2-3 个文件确认）
- 如果存在路由目录，附加「路由目录内的组件放置规则」章节
- 如果项目有 Mock 数据约定，附加「Mock 数据策略」章节

### 第四步：同步 openspec/project.md

如果项目中存在 `openspec/project.md`，将其 `## 项目概述` 下方的描述同步更新为第二步中生成的「项目定位」一句话描述，保持与 `01-项目概述.md` 中的 `## 项目定位` 一致。

**操作规则**：

- 仅替换 `## 项目概述` 与下一个 `##` 标题之间的描述文本
- 不修改 `project.md` 中的其他内容（技能与规范表格、规则索引等）
- 如果 `openspec/project.md` 不存在，跳过此步骤

### 第五步：用户确认

生成完毕后，输出简要总结并询问用户：

1. 展示检测到的技术栈（表格）
2. 展示检测到的目录结构（树形图）
3. 展示将写入 `openspec/project.md` 的项目概述描述
4. 询问："以上信息是否准确？是否需要补充或修改？"

等待用户确认后再写入文件。

---

## 注意事项

- 如果 `01-项目概述.md` 或 `03-项目结构.md` 已存在且内容非模板（已被用户编辑过），应先展示差异，由用户决定是覆盖还是合并。
- 本技能生成 `01-项目概述.md`、`03-项目结构.md` 并同步 `openspec/project.md` 的项目概述，其他规范文件（02-12）保持原样不动。
- 如果项目不是前端项目（无 `package.json`），应提示用户手动填写，并提供空白模板。
