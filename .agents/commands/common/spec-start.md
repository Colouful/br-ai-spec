使用 `task-orchestrator（任务主代理）` 启动一个**新任务**。

执行要求：

1. 先读取这些规范：
   - `.agents/roles/common/task-orchestrator.md`
   - `.agents/roles/common/task-orchestrator-run-plan-template.md`
   - `.agents/roles/common/task-anchor-spec.md`
   - `.agents/roles/common/task-orchestrator-bootstrap-payload.md`
   - `.agents/roles/common/task-orchestrator-output-extractor-spec.md`

2. 这个命令只处理“新任务启动”，不要输出运行中动作：
   - 必须产出 `task-orchestrator-bootstrap（主代理首轮桥接载荷）`
   - 不要产出 `task-orchestrator-runtime-action（主代理运行动作载荷）`

3. 不要在这一步直接写业务代码。当前命令只负责：
   - 识别任务
   - 选择 `flow（流程模板）`
   - 生成首轮 `run-plan（运行计划）`
   - 生成首轮 `task-anchor（任务锚点）`
   - 触发运行态初始化

4. 先准备一份 Markdown（标记文本） 内容：
   - 可以有简短说明
   - 必须包含且只包含一个合法的 `json` 代码块
   - 代码块内容必须符合 `task-orchestrator-bootstrap（主代理首轮桥接载荷）`

5. 使用 Bash（命令行） 工具执行：
   - `mkdir -p ./.ai-spec/tmp`
   - 将内容写入 `./.ai-spec/tmp/task-orchestrator-reply.md`
   - 运行：
     - `ai-spec task-orchestrator-extractor apply --payload ./.ai-spec/tmp/task-orchestrator-reply.md --target .`

6. 最终只输出简要结果：
   - `task_type（任务类型）`
   - `flow（流程模板）`
   - `first_handoff（第一跳专家）`
   - `run_id（运行 ID）`
   - `status（状态）`
   - `missing_inputs（缺失输入） / next_action（下一步）`
