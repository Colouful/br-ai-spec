使用 `task-orchestrator（任务主代理）` **继续推进当前任务**，并默认自动跑到终态或真实阻断。

执行要求：

1. 先读取：
   - `./.ai-spec/current-run.json`
   - `.agents/roles/common/task-orchestrator.md`
   - `.agents/roles/common/task-orchestrator-adapter-payload.md`
   - `.agents/roles/common/task-orchestrator-output-extractor-spec.md`
   - `.agents/roles/common/task-orchestrator-runtime-hooks.md`

2. 不要只做单步动作。应持续自动推进：
   - 需要 `runtime-action` 时，产出并应用
   - 需要新的 `expert-dispatch` 时，产出并应用
   - 需要新的 `expert-execution` 时，产出并应用
   - 不要把 dispatch / execution / adapter 再交给用户手动触发

3. 每轮只重新读取：
   - `./.ai-spec/current-run.json`
   - `./.ai-spec/current-dispatch.json`（如存在）
   - `./.ai-spec/current-execution.json`（如存在）

4. 决策顺序固定：
   - 有 `current-execution.json`
     - 由 `task-orchestrator` 产出最小 `runtime-action`
     - 写入 `./.ai-spec/tmp/task-orchestrator-reply.md`
     - 执行 `./node_modules/.bin/ai-spec task-orchestrator-extractor apply --payload ./.ai-spec/tmp/task-orchestrator-reply.md --target .`
   - 无 `current-dispatch.json` 且运行态仍可继续
     - 由 `task-orchestrator` 产出 `./.ai-spec/tmp/current-dispatch.json`
     - 执行 `./node_modules/.bin/ai-spec expert-dispatch apply --payload ./.ai-spec/tmp/current-dispatch.json --target .`
   - 有 `current-dispatch.json` 且无 `current-execution.json`
     - 由当前专家完成本轮工作并产出 `./.ai-spec/tmp/current-execution.json`
     - 执行 `./node_modules/.bin/ai-spec expert-executor apply --payload ./.ai-spec/tmp/current-execution.json --target .`

5. `prd-to-delivery` 门禁：
   - handoff 到 `frontend-implementer` 前，必须已有 `proposal.md` 和 `tasks.md`
   - `complete` 前，必须已有 `checklist.md` 和 `iterations.md`
   - 若缺文件，继续让当前专家补齐，不要把缺口回抛给用户

6. 交互要求：
   - 若用户说“继续 / 不要再问我 / 直到完成”，持续推进
   - 中间不要贴原始 payload、adapter 字段或命令回显
   - 只输出短进度语义
   - 优先做最小状态变更，不要长篇解释，以避免 IDE 超时

7. 停止条件：
   - `current-run.json.status` 进入 `success / failed / cancelled`
   - 或出现真实 `blocked / waiting-approval`

8. 最终只输出：
   - `run_id`
   - `current_role`
   - `status`
   - `completed_roles`
   - `pending_gate`
   - `artifacts`
