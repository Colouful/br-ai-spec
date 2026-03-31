这是**编排命令**，不是直接开发命令。

目标：
- 由 `task-orchestrator（任务主代理）` 协调专家链完成任务
- 默认自动推进到终态或真实阻断
- 不把中间 payload / adapter / apply 命令交给用户

硬性要求：
- 禁止在 `requirement-analyst（需求解析专家）` 完成前直接修改业务代码
- 禁止跳过 `task-orchestrator -> requirement-analyst -> frontend-implementer -> code-guardian -> task-orchestrator` 这条主链
- 即使同一个 AI 会话里完成全部流程，也必须**显式按角色阶段推进**，不能把“自动推进”理解成“自己直接把代码写完”
- 用户只看阶段语义；payload、适配器、状态清理属于内部机制，静默执行

先读取：
- `./package.json`
- `./src/`（如存在）
- `context/PROJECT.md`（如存在）
- `.agents/rules/01-项目概述.md`（如存在）
- `.agents/rules/03-项目结构.md`（如存在）
- `.agents/rules/05-API规范.md`（如存在）
- `.agents/rules/06-路由规范.md`（如存在）
- `.agents/rules/09-样式规范.md`（如存在）
- `.agents/roles/common/task-orchestrator.md`
- `.agents/roles/common/task-orchestrator-run-plan-template.md`
- `.agents/roles/common/task-anchor-spec.md`
- `.agents/roles/common/task-orchestrator-bootstrap-payload.md`
- `.agents/roles/common/task-orchestrator-output-extractor-spec.md`

按以下阶段严格执行：

阶段 A：`task-orchestrator`
- 识别任务、选择 `flow`、确定 `mode=auto`
- 先从规则和仓库推断 `assumptions`，不要把可推断信息重复写入 `missing_inputs`
- 生成稳定 `change_id`
- 生成 `run-plan + task-anchor + artifacts`
- 将首轮桥接内容写入 `./.ai-spec/tmp/task-orchestrator-reply.md`
- 执行：
  - `mkdir -p ./.ai-spec/tmp`
  - `./node_modules/.bin/ai-spec task-orchestrator-extractor apply --payload ./.ai-spec/tmp/task-orchestrator-reply.md --target .`
- 对用户只输出一句进度：
  - `task-orchestrator 已完成任务识别，进入需求收敛阶段`

阶段 B：`requirement-analyst`
- 必须创建：
  - `openspec/changes/<change-id>/proposal.md`
  - `openspec/changes/<change-id>/tasks.md`
- 必须在产物落盘后再写 `./.ai-spec/tmp/current-execution.json`
- 执行：
  - `./node_modules/.bin/ai-spec expert-executor apply --payload ./.ai-spec/tmp/current-execution.json --target .`
- 对用户只输出一句进度：
  - `requirement-analyst 已完成提案与任务清单，返回主代理交接实现阶段`

阶段 C：`task-orchestrator`
- 基于 requirement-analyst 的结果重新接管
- 产出 handoff 到 `frontend-implementer` 的最小 runtime-action
- 写入 `./.ai-spec/tmp/task-orchestrator-reply.md`
- 执行：
  - `./node_modules/.bin/ai-spec task-orchestrator-extractor apply --payload ./.ai-spec/tmp/task-orchestrator-reply.md --target .`
- 对用户只输出一句进度：
  - `task-orchestrator 已完成交接，进入前端实现阶段`

阶段 D：`frontend-implementer`
- 先读取 `proposal.md` 和 `tasks.md`
- 只按任务范围实现代码，不扩 scope
- 产出 `./.ai-spec/tmp/current-execution.json`
- 执行：
  - `./node_modules/.bin/ai-spec expert-executor apply --payload ./.ai-spec/tmp/current-execution.json --target .`
- 对用户只输出一句进度：
  - `frontend-implementer 已完成实现，返回主代理交接审查阶段`

阶段 E：`task-orchestrator`
- 基于实现结果重新接管
- 产出 handoff 到 `code-guardian` 的最小 runtime-action
- 写入 `./.ai-spec/tmp/task-orchestrator-reply.md`
- 执行：
  - `./node_modules/.bin/ai-spec task-orchestrator-extractor apply --payload ./.ai-spec/tmp/task-orchestrator-reply.md --target .`
- 对用户只输出一句进度：
  - `task-orchestrator 已完成交接，进入规范审查阶段`

阶段 F：`code-guardian`
- 必须创建：
  - `openspec/changes/<change-id>/checklist.md`
  - `openspec/changes/<change-id>/iterations.md`
- 完成检查后产出 `./.ai-spec/tmp/current-execution.json`
- 执行：
  - `./node_modules/.bin/ai-spec expert-executor apply --payload ./.ai-spec/tmp/current-execution.json --target .`
- 对用户只输出一句进度：
  - `code-guardian 已完成审查，返回主代理收尾`

阶段 G：`task-orchestrator`
- 再次接管
- 只有在 `proposal/tasks/checklist/iterations` 都存在时，才允许产出 `complete`
- 写入 `./.ai-spec/tmp/task-orchestrator-reply.md`
- 执行：
  - `./node_modules/.bin/ai-spec task-orchestrator-extractor apply --payload ./.ai-spec/tmp/task-orchestrator-reply.md --target .`
- 对用户只输出一句进度：
  - `task-orchestrator 已完成任务收尾`

自动推进规则：
- 若用户执行 `/spec-start`，视为允许整条链自动推进
- 若用户表达“继续 / 不要再问我 / 直至完成任务”，继续推进，不要停下来等用户
- 中间不要贴原始 JSON、adapter 字段、命令回显
- 若遇到真实高风险阻断，才允许停下

最终只输出：
- `mode`
- `task_type`
- `flow`
- `run_id`
- `status`
- `completed_roles`
- `assumptions`
- `missing_inputs`
- `artifacts`
