这是统一编排入口。

规则：
- 新任务按 `/spec-start` 的阶段链执行
- 已有运行态按 `/spec-continue` 的阶段链执行
- 本命令本身不允许退化成“直接写代码”

必须遵守：
- `task-orchestrator` 先识别任务并启动
- `requirement-analyst` 先产出 `proposal.md` 和 `tasks.md`
- `frontend-implementer` 再做实现
- `code-guardian` 再产出 `checklist.md` 和 `iterations.md`
- `task-orchestrator` 最后收尾

中间要求：
- payload / adapter / apply 只做内部静默机制
- 用户只看到阶段进度
- 不把中间命令链交还给用户

最终只输出：
- `mode`
- `run_id`
- `task_type`
- `flow`
- `current_role`
- `status`
- `completed_roles`
- `artifacts`
