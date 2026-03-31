使用 `task-orchestrator（任务主代理）` 的单动作链处理本次任务。

兼容说明：

- 新任务优先使用 `/spec-start`
- 运行中继续推进优先使用 `/spec-continue`
- 本命令保留为统一兼容入口

执行要求：

1. 先读取这些规范：
   - `.agents/roles/common/task-orchestrator.md`
   - `.agents/roles/common/task-orchestrator-run-plan-template.md`
   - `.agents/roles/common/task-anchor-spec.md`
   - `.agents/roles/common/task-orchestrator-bootstrap-payload.md`
   - `.agents/roles/common/task-orchestrator-adapter-payload.md`
   - `.agents/roles/common/task-orchestrator-output-extractor-spec.md`
   - `.agents/roles/common/task-orchestrator-runtime-hooks.md`

2. 识别这次属于哪种最小动作：
   - 如果当前项目还没有 `.ai-spec/current-run.json`，或这是一个新任务，产出 `task-orchestrator-bootstrap（主代理首轮桥接载荷）`
   - 如果当前项目已经有运行态，且用户是在继续、审批、阻断、恢复、完成、失败、取消、查询状态，则只产出一个 `task-orchestrator-runtime-action（主代理运行动作载荷）`

3. 不要在这一步直接写业务代码。当前命令只负责：
   - 收敛任务
   - 生成结构化载荷
   - 触发运行态更新

4. 先在内存里准备一份 Markdown（标记文本） 内容，格式必须是：
   - 上面可以有简短说明
   - 下面必须包含且只包含一个合法的 `json` 代码块
   - 代码块内容必须符合当前所需 payload（载荷） 规范

5. 使用 Bash（命令行） 工具执行：
   - `mkdir -p ./.ai-spec/tmp`
   - 将上一步准备好的 Markdown（标记文本） 内容写入 `./.ai-spec/tmp/task-orchestrator-reply.md`
   - 运行：
     - `./node_modules/.bin/ai-spec task-orchestrator-extractor apply --payload ./.ai-spec/tmp/task-orchestrator-reply.md --target .`

6. 最终对用户只输出简要结果：
   - `task_type（任务类型）`
   - `flow（流程模板）`
   - `current_role（当前专家）`
   - `run_id（运行 ID）`
   - `status（状态）`
   - `pending_gate（待审批点）`
   - `missing_inputs（缺失输入） / next_action（下一步）`

7. 如果信息不足：
   - 允许首轮 `bootstrap（首轮桥接）` 里保留 `missing_inputs（缺失输入）`
   - 或输出 `gate-blocked（阻断）`
   - 不要为了继续执行而虚构信息
