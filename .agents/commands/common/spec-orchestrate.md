这是统一协议编排入口。

规则：

- 新任务：先执行 `./node_modules/.bin/ai-spec protocol-step --target . --user-input "<用户需求>" --json`
- 已有运行态：执行 `./node_modules/.bin/ai-spec protocol-advance --target . --json`
- 之后一律按返回的 `turn.actor`、`turn.announcements.enter`、`turn.announcements.exit`、`reads`、`writes`、`expected_output` 行事；若存在 `turn.execution_contract`，直接按它落盘当前专家回执
- 每进入新 `turn` 前，必须原样播报 `turn.announcements.enter`
- 每完成当前轮次后，必须原样播报 `turn.announcements.exit`
- 每完成一轮，都必须再次执行 `protocol-advance`
- 直到 `turn.status` 变成 `terminal` 或 `blocked`

硬性要求：

- 这是协议驱动，不是自由发挥
- 未轮到 `frontend-implementer` 前禁止写业务代码
- 对用户只展示阶段进度与最终结果，不回显 scratch JSON
