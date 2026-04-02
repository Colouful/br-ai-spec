这是统一协议编排入口。

规则：

- 在任何项目搜索、文件读取、技能调用、代码修改之前，必须先执行当前轮次命令
- 新任务：先执行 `./node_modules/.bin/ai-spec protocol-step --target . --user-input "<用户需求>" --json`
- 已有运行态：执行 `./node_modules/.bin/ai-spec protocol-advance --target . --json`
- 之后一律按返回的 `turn.enforcement`、`turn.actor`、`turn.announcements`、`turn.reads`、`turn.writes`、`turn.guidance`、`turn.execution_contract` 执行
- 若存在 `turn.commands`、`turn.requires_advance`、`turn.finalize_contract`，以它们为最终执行契约，不要自行拼命令
- 每进入新 `turn` 前，必须原样播报 `turn.announcements.enter`
- 每完成当前轮次后，必须原样播报 `turn.announcements.exit`
- 每完成一轮，都必须按 `turn.finalize_contract.advance_command` 执行推进；若用户补充了新需求，使用 `turn.finalize_contract.update_command`
- `advance` 返回后，必须直接消费返回结果里的下一个 `turn`；禁止 `sleep`、`tail`、`timeout`、`cat` 日志或额外重跑 `protocol-step`
- 直到 `turn.status` 变成 `terminal` 或 `blocked`

硬性要求：

- 这是协议驱动，不是自由发挥
- 未轮到 `frontend-implementer` 前禁止写业务代码
- 未执行当前轮次命令前禁止调用 `create-view`、`create-component`、`theme-variables`、`execute-task`
- 对用户只展示阶段进度与最终结果，不回显 scratch JSON
