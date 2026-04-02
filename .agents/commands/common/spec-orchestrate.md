这是统一协议编排入口。

规则：

- 在任何项目搜索、文件读取、技能调用、代码修改之前，必须先执行当前轮次命令
- 新任务：先执行 `./node_modules/.bin/ai-spec protocol-step --target . --user-input "<用户需求>" --json`
- 已有运行态：
  - 若当前这条用户输入本身是在表达审批/放行（如“我同意继续实现 / 同意 / 继续 / 开始 / 愿意”），优先执行 `./node_modules/.bin/ai-spec protocol-update --target . --user-input "<当前用户原话>" --json`
  - 否则执行 `./node_modules/.bin/ai-spec protocol-advance --target . --json`
- 之后一律按返回的 `turn.enforcement`、`turn.actor`、`turn.announcements`、`turn.reads`、`turn.writes`、`turn.guidance`、`turn.execution_contract` 执行
- 若存在 `turn.commands`、`turn.requires_advance`、`turn.finalize_contract`，以它们为最终执行契约，不要自行拼命令
- 每进入新 `turn` 前，必须原样播报 `turn.announcements.enter`
- 每完成当前轮次后，必须原样播报 `turn.announcements.exit`
- 每完成一轮，都必须按 `turn.finalize_contract.advance_command` 执行推进；若用户补充了新需求，或当前输入本身是审批/放行意见，使用 `turn.finalize_contract.update_command`
- `advance` 返回后，必须直接消费返回结果里的下一个 `turn`；禁止 `sleep`、`tail`、`timeout`、`cat` 日志或额外重跑 `protocol-step`
- 直到 `turn.status` 变成 `terminal` 或 `blocked`
- 若 `turn.status = blocked` 且存在 `turn.summary.pending_gate`，明确告诉用户当前在审批门禁中；若存在 `turn.guidance.approval_gate.user_report_contract`，严格按它输出极简摘要：只保留“当前状态 / 关键原因 / 下一步”，不要长篇说明或罗列文件路径；不要继续执行 `advance`；收到明确批准意见后，先执行 `turn.commands.update` 记录审批说明，再让用户重新执行 `/spec-continue`

硬性要求：

- 这是协议驱动，不是自由发挥
- 未轮到 `frontend-implementer` 前禁止写业务代码
- 未执行当前轮次命令前禁止调用 `create-view`、`create-component`、`theme-variables`、`execute-task`
- 对用户只展示阶段进度与最终结果，不回显 scratch JSON
- 若 `delivery_profile = micro`，最终摘要严格服从 `turn.finalize_contract.user_report` 与 `turn.finalize_contract.user_report_contract`：
  不超过 6 行；只保留交付结论、验证结果、残留风险；不重复转述 `checklist.md`、`iterations.md`；不逐条罗列 created/updated 文件或 OpenSpec 文件名
