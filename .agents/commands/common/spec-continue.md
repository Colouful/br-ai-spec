这是**编排继续命令**，不是单步命令。

目标：
- 由 `task-orchestrator（任务主代理）` 重新接管当前运行态
- 判断下一位专家是谁
- 自动推进到终态或真实阻断

硬性要求：
- 不允许把“继续执行 dispatch / execution / apply”交还给用户
- 不允许把自动推进退化成单体实现
- `task-orchestrator` 必须在每次专家完成后重新出现并执行交接

先读取：
- `./.ai-spec/current-run.json`
- `./.ai-spec/current-dispatch.json`（如存在）
- `./.ai-spec/current-execution.json`（如存在）
- `.agents/roles/common/task-orchestrator.md`
- `.agents/roles/common/task-orchestrator-adapter-payload.md`
- `.agents/roles/common/task-orchestrator-output-extractor-spec.md`

按以下规则继续：

1. 若当前刚结束 `requirement-analyst`
- 由 `task-orchestrator` 先确认 `proposal.md` 和 `tasks.md` 存在
- 再 handoff 到 `frontend-implementer`
- 对用户只输出：
  - `task-orchestrator 已确认需求产物，进入前端实现阶段`

2. 若当前刚结束 `frontend-implementer`
- 由 `task-orchestrator` 接管并 handoff 到 `code-guardian`
- 对用户只输出：
  - `task-orchestrator 已确认实现产物，进入规范审查阶段`

3. 若当前刚结束 `code-guardian`
- 由 `task-orchestrator` 先确认 `checklist.md` 和 `iterations.md` 存在
- 再决定是否 `complete`
- 对用户只输出：
  - `task-orchestrator 已确认审查产物，进入任务收尾`

4. 若当前缺少新的 `expert-dispatch`
- 由 `task-orchestrator` 产出 `./.ai-spec/tmp/current-dispatch.json`
- 执行 `./node_modules/.bin/ai-spec expert-dispatch apply --payload ./.ai-spec/tmp/current-dispatch.json --target .`

5. 若当前已有 `expert-dispatch` 但没有 `expert-execution`
- 由当前专家完成本轮工作
- 写入 `./.ai-spec/tmp/current-execution.json`
- 执行 `./node_modules/.bin/ai-spec expert-executor apply --payload ./.ai-spec/tmp/current-execution.json --target .`

6. 若当前已有 `expert-execution`
- 由 `task-orchestrator` 产出最小 `runtime-action`
- 写入 `./.ai-spec/tmp/task-orchestrator-reply.md`
- 执行 `./node_modules/.bin/ai-spec task-orchestrator-extractor apply --payload ./.ai-spec/tmp/task-orchestrator-reply.md --target .`

交互要求：
- 只输出短阶段语义
- 不回显原始 payload、adapter 字段、命令链
- 若用户表达“继续 / 不要再问我 / 直到完成”，持续推进

最终只输出：
- `run_id`
- `current_role`
- `status`
- `completed_roles`
- `pending_gate`
- `artifacts`
