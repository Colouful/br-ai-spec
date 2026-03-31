使用 `task-orchestrator（任务主代理）` **继续推进当前任务**。

执行要求：

1. 先读取：
   - `./.ai-spec/current-run.json`
   - `.agents/roles/common/task-orchestrator.md`
   - `.agents/roles/common/task-orchestrator-adapter-payload.md`
   - `.agents/roles/common/task-orchestrator-output-extractor-spec.md`
   - `.agents/roles/common/task-orchestrator-runtime-hooks.md`

2. 这个命令只处理“运行中继续推进”，不要重新建新任务：
   - 必须产出一个 `task-orchestrator-runtime-action（主代理运行动作载荷）`
   - 不要产出 `task-orchestrator-bootstrap（主代理首轮桥接载荷）`

3. 根据当前状态和用户输入，只做一个最小动作：
   - `approve（审批）`
   - `handoff（交接）`
   - `resume（恢复）`
   - `gate-blocked（阻断）`
   - `status（状态）`
   - `complete（完成）`
   - `fail（失败）`
   - `cancel（取消）`

4. 先准备一份 Markdown（标记文本） 内容：
   - 可以有简短说明
   - 必须包含且只包含一个合法的 `json` 代码块
   - 代码块内容必须符合 `task-orchestrator-runtime-action（主代理运行动作载荷）`

5. 使用 Bash（命令行） 工具执行：
   - `mkdir -p ./.ai-spec/tmp`
   - 将内容写入 `./.ai-spec/tmp/task-orchestrator-reply.md`
   - 运行：
     - `./node_modules/.bin/ai-spec task-orchestrator-extractor apply --payload ./.ai-spec/tmp/task-orchestrator-reply.md --target .`

6. 最终只输出简要结果：
   - `action（动作）`
   - `current_role（当前专家）`
   - `run_id（运行 ID）`
   - `status（状态）`
   - `pending_gate（待审批点）`
   - `next_action（下一步）`
   - 如果状态已经变化，提示应由 `task-orchestrator（任务主代理）` 重新产出新的 `expert-dispatch（专家派发载荷）`，并由当前专家重新产出新的 `expert-execution（专家执行载荷）`
