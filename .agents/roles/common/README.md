# 角色目录说明

本目录存放当前阶段真正启用的 MVP 专家角色。

当前只保留 4 个核心角色：

- `task-orchestrator.md`
- `requirement-analyst.md`
- `frontend-implementer.md`
- `code-guardian.md`

这 4 个角色足够支撑最小闭环：

```text
任务输入
  -> task-orchestrator
  -> requirement-analyst
  -> frontend-implementer
  -> code-guardian
```

## 角色文件编写原则

- 文件名使用英文 `kebab-case`，作为稳定 ID
- 文件正文标题和展示名使用中文
- 角色文件负责“职责、边界、交接、产物”
- `skills` 负责“具体怎么做”
- `flows` 负责“按什么顺序做”
- `task-orchestrator` 负责路由和调度，不直接承担具体交付实现

## 建议的 frontmatter 字段

```yaml
id:
name:
status:
domains:
description:
triggers:
preferred_skills:
reads:
writes:
handoff_to:
```

## 目录扩展方式

- 当前启用角色继续放在 `common/`
- 规划中的能力域目录放在 `../domains/`
- 当某个规划专家真正进入 MVP，再从能力域目录迁入或补充到 `common/`

这样可以同时保证：

- 当前可运行角色足够轻
- 未来能力域结构已经就位
- 插件页面后续可以按能力域做展示
