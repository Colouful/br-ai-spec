使用 `task-orchestrator（任务主代理）` 启动一个**新任务**，并默认自动推进到终态或真实阻断。

执行要求：

1. 先读取最小必要上下文：
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

2. 先识别并写清：
   - `task_type`
   - `flow`
   - `mode=auto`
   - 稳定 `change_id`
   - `assumptions`
   - `missing_inputs`
   - `first_handoff`
   - `artifacts`

3. `auto` 模式规则：
   - 先从规范和仓库推断技术栈、页面落点、路由落点、样式承载方式、认证方式
   - 能推断的内容写入 `assumptions`，不要重复写入 `missing_inputs`
   - `page-development` 且仓库无现成认证实现时，默认可假设为“账号密码登录 + 基础前端校验”
   - 只有高风险、不可逆、与现有实现冲突时，才允许阻断

4. `prd-to-delivery` 强制门禁：
   - 首轮必须确定 `change_id`
   - 首轮必须带出：
     - `openspec/changes/<change-id>/proposal.md`
     - `openspec/changes/<change-id>/tasks.md`
     - `openspec/changes/<change-id>/checklist.md`
     - `openspec/changes/<change-id>/iterations.md`
   - `requirement-analyst` 阶段必须真实创建 `proposal.md` 和 `tasks.md`
   - `code-guardian` 阶段必须真实创建 `checklist.md` 和 `iterations.md`
   - 不得只在 JSON 中宣称完成而不落盘这些文件

5. 第一步必须先完成 `bootstrap`：
   - 产出一份 Markdown 内容
   - 内容里必须且只允许有一个合法 `json` 代码块
   - 代码块必须符合 `task-orchestrator-bootstrap`
   - 使用 Bash 执行：
     - `mkdir -p ./.ai-spec/tmp`
     - 写入 `./.ai-spec/tmp/task-orchestrator-reply.md`
     - 执行 `./node_modules/.bin/ai-spec task-orchestrator-extractor apply --payload ./.ai-spec/tmp/task-orchestrator-reply.md --target .`

6. `bootstrap` 后继续自动循环，不要停下来等用户：
   - 每轮只重新读取：
     - `./.ai-spec/current-run.json`
     - `./.ai-spec/current-dispatch.json`（如存在）
     - `./.ai-spec/current-execution.json`（如存在）
   - 决策顺序固定：
     - 无 `current-dispatch.json` 且无 `current-execution.json`
       - 由 `task-orchestrator` 产出 `./.ai-spec/tmp/current-dispatch.json`
       - 执行 `./node_modules/.bin/ai-spec expert-dispatch apply --payload ./.ai-spec/tmp/current-dispatch.json --target .`
     - 有 `current-dispatch.json` 且无 `current-execution.json`
       - 由当前专家完成本轮工作，创建本轮必须的文件，并产出 `./.ai-spec/tmp/current-execution.json`
       - 执行 `./node_modules/.bin/ai-spec expert-executor apply --payload ./.ai-spec/tmp/current-execution.json --target .`
     - 有 `current-execution.json`
       - 由 `task-orchestrator` 产出最小 `runtime-action`
       - 写入 `./.ai-spec/tmp/task-orchestrator-reply.md`
       - 执行 `./node_modules/.bin/ai-spec task-orchestrator-extractor apply --payload ./.ai-spec/tmp/task-orchestrator-reply.md --target .`

7. 自动推进前置校验：
   - handoff 到 `frontend-implementer` 前，确认 `proposal.md` 和 `tasks.md` 已存在
   - `complete` 前，确认 `checklist.md` 和 `iterations.md` 已存在
   - 若文件缺失，继续让当前专家补齐，不要把命令链交还给用户

8. 交互要求：
   - 用户已执行 `/spec-start`，视为允许整条链自动推进
   - 若用户表达“继续 / 不要再问我 / 直至完成任务”，继续自动推进
   - 中间不要回显原始 JSON、adapter 字段、命令回显
   - 只输出短进度语义，例如：
     - `已进入需求收敛阶段`
     - `已进入前端实现阶段`
     - `已进入规范审查阶段`
     - `已完成任务收尾`
   - 优先做最小状态变更，不要长篇解释，以避免 IDE 超时

9. 停止条件：
   - `current-run.json.status` 进入 `success / failed / cancelled`
   - 或出现真实 `blocked / waiting-approval`

10. 最终只输出：
   - `mode`
   - `task_type`
   - `flow`
   - `run_id`
   - `status`
   - `completed_roles`
   - `assumptions`
   - `missing_inputs`
   - `artifacts`
