这是协议驱动入口，不是直接开发命令。

你必须先使用终端执行：

```bash
./node_modules/.bin/ai-spec protocol-step --target . --user-input "<本次 /spec-start 的用户原始需求>" --json
```

然后严格按返回结果执行，不允许脑补流程：

1. 读取返回的 `turn.actor`、`turn.mode`、`turn.announcements.enter`、`turn.announcements.exit`、`reads`、`writes`、`expected_output`；若存在 `turn.execution_contract`，优先按它执行，不要额外搜索执行回执格式
2. 在执行当前轮次前，先原样向用户播报 `turn.announcements.enter`
3. 只完成当前 `actor` 的职责：
   - `task-orchestrator`：只做编排、假设、交接、收尾，不写业务代码
   - `requirement-analyst`：只产出 `proposal.md`、`tasks.md`
   - `frontend-implementer`：只有这一阶段允许改业务代码
   - `code-guardian`：只产出 `checklist.md`、`iterations.md`
4. 只写 `turn.writes` 指定的文件；不要自创 scratch 路径
5. 若当前轮次存在 `turn.execution_contract`：
   - 必须把合法的 `expert-execution` JSON 写到 `turn.execution_contract.write_to`
   - 必须先完成 `turn.execution_contract.required_artifacts`
   - 完成后直接执行 `turn.execution_contract.next_advance_command`
6. 完成本轮输出后，立刻原样向用户播报 `turn.announcements.exit`
7. 然后执行：

```bash
./node_modules/.bin/ai-spec protocol-advance --target . --json
```

8. 读取新的 `turn`，继续下一轮；直到 `turn.status` 变成 `terminal` 或 `blocked`
9. 对用户只输出阶段语义和最终摘要，不回显原始 JSON

硬性禁止：

- 当前 `actor` 不是 `frontend-implementer` 时，禁止修改 Vue/TS/CSS 业务代码
- `proposal.md`、`tasks.md` 未完成前，禁止进入实现
- `checklist.md`、`iterations.md` 未完成前，禁止 `complete`
- 不允许跳过 `task-orchestrator -> requirement-analyst -> task-orchestrator -> frontend-implementer -> task-orchestrator -> code-guardian -> task-orchestrator`
