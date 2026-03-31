使用 `task-orchestrator（任务主代理）` 的统一入口处理本次任务。

兼容规则：

- 新任务优先按 `/spec-start` 语义执行
- 已有运行态优先按 `/spec-continue` 语义执行
- 本命令仍要求自动推进，不是只生成单步 payload

执行要求：

1. 先判断：
   - 若不存在 `./.ai-spec/current-run.json`，按新任务启动
   - 若已存在运行态，按当前状态继续推进

2. 无论哪种入口，都要自动完成以下链路，直到终态或真实阻断：
   - `bootstrap`
   - `expert-dispatch`
   - `expert-execution`
   - `runtime-action`

3. `prd-to-delivery` 强制要求：
   - 必须有稳定 `change_id`
   - 必须有 `proposal.md / tasks.md / checklist.md / iterations.md`
   - 缺少这些文件时，继续让当前专家补齐，不要交给用户手动处理

4. 写盘方式：
   - `bootstrap` 或 `runtime-action`：写 `./.ai-spec/tmp/task-orchestrator-reply.md`，再执行 `task-orchestrator-extractor apply`
   - `expert-dispatch`：写 `./.ai-spec/tmp/current-dispatch.json`，再执行 `expert-dispatch apply`
   - `expert-execution`：写 `./.ai-spec/tmp/current-execution.json`，再执行 `expert-executor apply`

5. 交互要求：
   - 中间不回显原始 JSON、adapter 字段和命令链
   - 只输出短进度语义
   - 优先做最小状态变更，不要长篇解释，以避免 IDE 超时

6. 最终只输出：
   - `mode`
   - `run_id`
   - `task_type`
   - `flow`
   - `current_role`
   - `status`
   - `completed_roles`
   - `pending_gate`
   - `assumptions`
   - `missing_inputs`
   - `artifacts`
