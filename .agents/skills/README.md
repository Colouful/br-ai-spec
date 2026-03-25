---
name: skills-index
description: 技能目录索引。安装到目标项目后此目录为扁平结构（common + profile 合并），此处为源仓库的分层结构。
---

# 技能目录结构

本目录推荐采用 **common + profiles + domains（可选）** 的分层组织。

结论先说：

- 不建议按“专家名”建 skill 目录
- 优先按“复用范围”和“技术栈”组织 skill
- 角色负责职责边界，skill 负责具体方法

## common/ — 通用技能（与技术栈无关）

| 技能 | 用途 | 配合规范 |
|------|------|----------|
| `create-proposal` | 提案前置分析与 OpenSpec 增强层 | - |
| `archive-change` | 变更归档增强层（规范合并 + 目录校验） | - |
| `design-analysis` | 设计稿分析，产出 UI 分析清单 | - |
| `ui-verification` | UI 还原验收 | - |
| `execute-task` | Superpowers 四步循环执行 | `12-Superpowers执行规范` |
| `project-init` | 自动分析项目生成 01/03 规范 | - |
| `using-superpowers` | 技能调度核心规范 | - |
| `find-skills` | 查找开源 skills | - |
| `skill-creator` | 创建 skill 指导 | - |
| `web-design-guidelines` | 网页设计指导 | - |

## profiles/react/ — React 技术栈技能

| 技能 | 用途 | 配合规范 |
|------|------|----------|
| `create-component` | 创建 TSX 组件 + SCSS Modules | `04-组件规范` |
| `create-route` | 创建 Page/Loader 路由 | `06-路由规范` |
| `create-store` | 创建 Zustand Store | `07-状态管理` |
| `create-api` | 创建 HTTP 接口封装 | `05-API规范` |
| `theme-variables` | Antd 主题 CSS 变量使用 | `09-样式规范` |
| `vercel-react-best-practices` | React 最佳实践 | - |
| `vercel-composition-patterns` | React 复合组件模式 | - |

## profiles/vue/ — Vue 技术栈技能

| 技能 | 用途 | 配合规范 |
|------|------|----------|
| `create-component` | 创建 SFC 组件 | `04-组件规范` |
| `create-view` | 创建 Vue 页面模块 | `06-路由规范` |
| `create-store` | 创建 Pinia Store | `07-状态管理` |
| `create-api` | 创建 API 接口封装 | `05-API规范` |
| `theme-variables` | 组件库主题 token 使用 | `09-样式规范` |

## domains/ — 按能力域沉淀的可复用技能（可选）

只有在某个 skill 同时满足下面两个条件时，才建议放到 `domains/`：

- 明显属于某个能力域，例如性能、安全、可观测性
- 会被多个专家复用，而不是只服务某一个专家

例如未来可能出现：

- `domains/performance/lighthouse-audit`
- `domains/observability/sentry-triage`
- `domains/security-a11y/security-review`

## 为什么不建议用 `skills/<expert-name>/`

因为 expert 和 skill 的关系是多对多：

- 一个专家会调用多个 skill
- 一个 skill 也会被多个专家复用

如果按专家名组织 skill，后续会很快出现重复和耦合：

- `frontend-implementer/create-api`
- `code-guardian/create-test`
- `performance-expert/create-test`

这种结构很难维护，也不利于后续插件页面做聚合展示。

---

## 快速查找（按场景选择技能）

| 场景 | 技能文件 |
|------|----------|
| 创建提案时 | `.agents/skills/common/create-proposal/SKILL.md`（前置分析后委托 `/opsx:propose`） |
| 归档变更时 | `.agents/skills/common/archive-change/SKILL.md`（规范合并 + 归档校验） |
| 新增接口 | `.agents/skills/profiles/<stack>/create-api/SKILL.md` |
| 创建/拆分组件 | `.agents/skills/profiles/<stack>/create-component/SKILL.md` |
| 新增页面路由 | React 用 `.agents/skills/profiles/react/create-route/SKILL.md`；Vue 用 `.agents/skills/profiles/vue/create-view/SKILL.md` |
| 新增全局状态 | `.agents/skills/profiles/<stack>/create-store/SKILL.md` |
| 编写样式/主题适配 | `.agents/skills/profiles/<stack>/theme-variables/SKILL.md` |
| 开始执行 tasks.md | `.agents/skills/common/execute-task/SKILL.md` |
| 分析设计稿 | `.agents/skills/common/design-analysis/SKILL.md` |
| UI 还原验收 | `.agents/skills/common/ui-verification/SKILL.md` |
| 初始化项目规范 | `.agents/skills/common/project-init/SKILL.md` |
| 每次对话启动的技能调度 | `.agents/skills/common/using-superpowers/SKILL.md` |

## 使用说明

项目在 `.agents/skills` 下定义了与规范配套的技能，用于承载具体实践步骤与示例代码，避免在规范中塞入过多细节。后续如有新的实践场景，建议以新的技能目录形式补充。

## 当前项目的推荐组织方式

- 与技术栈无关的 skill 放 `common/`
- 与 React / Vue 强绑定的 skill 放 `profiles/react/`、`profiles/vue/`
- 与性能、安全、可观测等能力域强绑定，且会被多个专家复用的 skill，后续再放 `domains/`

当前阶段先保持：

```text
.agents/skills/
├── common/
├── profiles/react/
├── profiles/vue/
└── domains/        # 预留，未来按需启用
```
