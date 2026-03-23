---
name: skills-index
description: 技能目录索引。安装到目标项目后此目录为扁平结构（common + profile 合并），此处为源仓库的分层结构。
---

# 技能目录结构

本目录采用 **common + profiles** 分层组织。

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

---

## 快速查找（按场景选择技能）

| 场景 | 技能文件 |
|------|----------|
| 创建提案时 | `.agents/skills/create-proposal/SKILL.md`（前置分析后委托 `/opsx:propose`） |
| 归档变更时 | `.agents/skills/archive-change/SKILL.md`（规范合并 + 归档校验） |
| 新增接口 | `.agents/skills/create-api/SKILL.md` |
| 创建/拆分组件 | `.agents/skills/create-component/SKILL.md` |
| 新增页面路由 | `.agents/skills/create-route/SKILL.md` 或 `create-view/SKILL.md` |
| 新增全局状态 | `.agents/skills/create-store/SKILL.md` |
| 编写样式/主题适配 | `.agents/skills/theme-variables/SKILL.md` |
| 开始执行 tasks.md | `.agents/skills/execute-task/SKILL.md` |
| 分析设计稿 | `.agents/skills/design-analysis/SKILL.md` |
| UI 还原验收 | `.agents/skills/ui-verification/SKILL.md` |
| 初始化项目规范 | `.agents/skills/project-init/SKILL.md` |
| 每次对话启动的技能调度 | `.agents/skills/using-superpowers/SKILL.md` |

## 使用说明

项目在 `.agents/skills` 下定义了与规范配套的技能，用于承载具体实践步骤与示例代码，避免在规范中塞入过多细节。后续如有新的实践场景，建议以新的技能目录形式补充。
