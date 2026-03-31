这是协议继续入口，不是直接开发命令。

你必须先使用终端执行：

```bash
./node_modules/.bin/ai-spec protocol-advance --target . --json
```

然后严格按返回结果继续：

1. 读取返回的 `turn.actor`、`turn.mode`、`turn.announcements.enter`、`turn.announcements.exit`、`reads`、`writes`、`expected_output`；若存在 `turn.execution_contract`，直接按它完成执行回执与产物，不要额外搜索规范
2. 在执行当前轮次前，先原样向用户播报 `turn.announcements.enter`
3. 只完成当前 `actor` 的职责，不允许越权
4. 若当前轮次存在 `turn.execution_contract`：
   - 必须先完成 `turn.execution_contract.required_artifacts`
   - 必须把合法的 `expert-execution` JSON 写到 `turn.execution_contract.write_to`
5. 完成本轮输出后，先原样向用户播报 `turn.announcements.exit`，再执行一次：

```bash
./node_modules/.bin/ai-spec protocol-advance --target . --json
```

6. 重复上述步骤，直到 `turn.status` 变成 `terminal` 或 `blocked`
7. 对用户只输出阶段语义和最终摘要，不回显原始 JSON

硬性禁止：

- 不允许把当前轮次直接退化成“开始写页面/组件代码”
- `task-orchestrator` 必须在每次专家完成后重新出现
- `proposal.md`、`tasks.md`、`checklist.md`、`iterations.md` 门禁必须真实落盘
