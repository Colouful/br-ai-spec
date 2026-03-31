这是**编排入口**，不是直接开发命令。

目标：
- 由 `task-orchestrator` 显式协调专家链完成任务
- 默认自动推进到终态或真实阻断
- 对用户只暴露阶段进度、`current-run.json` 与 `OpenSpec` 产物

必须遵守：
- 禁止跳过主链：`task-orchestrator -> requirement-analyst -> task-orchestrator -> frontend-implementer -> task-orchestrator -> code-guardian -> task-orchestrator`
- 禁止在 `requirement-analyst` 产出 `proposal.md` 和 `tasks.md` 之前直接修改业务代码
- 禁止在 `code-guardian` 产出 `checklist.md` 和 `iterations.md` 之前直接 `complete`
- payload / adapter / dispatch / execution / runtime-action 都属于内部 scratch，统一放在 `./.ai-spec/internal/`，静默执行，不向用户回显

先读取：
- `./package.json`
- `./src/`（如存在）
- `context/PROJECT.md`（如存在）
- `.agents/rules/01-项目概述.md`、`.agents/rules/03-项目结构.md`
- 页面开发再补充 `.agents/rules/05-API规范.md`、`.agents/rules/06-路由规范.md`、`.agents/rules/09-样式规范.md`
- `.agents/roles/common/task-orchestrator.md`
- `.agents/roles/common/task-orchestrator-run-plan-template.md`
- `.agents/roles/common/task-anchor-spec.md`
- `.agents/roles/common/task-orchestrator-runtime-hooks.md`

执行原则：
1. 先由 `task-orchestrator` 启动运行态：识别任务、选择 `flow`、确定 `mode=auto`、生成稳定 `change_id`，并优先把规范与仓库中可推断的信息写入 `assumptions`
2. 启动后按当前运行态自动推进；每次专家完成后，必须由 `task-orchestrator` 重新接管并决定下一跳
3. `requirement-analyst` 负责 `openspec/changes/<change-id>/proposal.md` 与 `tasks.md`
4. `frontend-implementer` 只按提案和任务清单实现，不扩 scope
5. `code-guardian` 负责 `openspec/changes/<change-id>/checklist.md` 与 `iterations.md`
6. 若内部工具需要写 `task-orchestrator-reply.md`、`current-dispatch.json`、`current-execution.json` 或 `current-runtime-action.json`，统一写入 `./.ai-spec/internal/tmp/` 并静默调用本地 `ai-spec` 能力应用
7. 若遇到真实高风险、不可逆冲突或人工审批点，才允许停下；否则继续推进，不要回问用户

对用户只输出短阶段语义，例如：
- `task-orchestrator 已完成任务识别，进入需求收敛阶段`
- `requirement-analyst 已完成提案与任务清单，返回主代理交接实现阶段`
- `task-orchestrator 已完成交接，进入前端实现阶段`
- `frontend-implementer 已完成实现，返回主代理交接审查阶段`
- `task-orchestrator 已完成交接，进入规范审查阶段`
- `code-guardian 已完成审查，返回主代理收尾`
- `task-orchestrator 已完成任务收尾`

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
