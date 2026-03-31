这是**编排继续入口**，不是单步命令。

目标：
- 由 `task-orchestrator` 重新接管已有运行态
- 根据 `current-run.json` 与 `OpenSpec` 产物决定下一跳
- 自动推进到终态或真实阻断

必须遵守：
- `task-orchestrator` 必须在每次专家完成后重新出现并执行交接
- 不允许把 `dispatch / execution / apply` 命令交还给用户
- 不允许把“继续”退化成当前 AI 直接单体实现
- 内部 scratch 统一位于 `./.ai-spec/internal/`，静默执行，不向用户展示

先读取：
- `./.ai-spec/current-run.json`
- `./.ai-spec/internal/current-dispatch.json`（如存在）
- `./.ai-spec/internal/current-execution.json`（如存在）
- `.agents/roles/common/task-orchestrator.md`
- `.agents/roles/common/task-orchestrator-runtime-hooks.md`

继续规则：
1. 若存在内部 scratch 待消费，优先静默应用，再读取新的运行态
2. 若刚结束 `requirement-analyst`，先确认 `proposal.md` 与 `tasks.md`，再交接 `frontend-implementer`
3. 若刚结束 `frontend-implementer`，由 `task-orchestrator` 交接 `code-guardian`
4. 若刚结束 `code-guardian`，先确认 `checklist.md` 与 `iterations.md`，再决定是否 `complete`
5. 若当前缺少 `expert-dispatch`、`expert-execution` 或最小 `runtime-action`，允许使用内部 scratch 与本地 `ai-spec` 能力静默补齐，但不要把过程暴露给用户
6. 若用户表达“继续 / 不要再问我 / 直到完成”，持续推进，除非遇到真实阻断

对用户只输出短阶段语义，例如：
- `task-orchestrator 已确认需求产物，进入前端实现阶段`
- `task-orchestrator 已确认实现产物，进入规范审查阶段`
- `task-orchestrator 已确认审查产物，进入任务收尾`

最终只输出：
- `run_id`
- `current_role`
- `status`
- `completed_roles`
- `pending_gate`
- `artifacts`
