这是协议继续入口，不是直接开发命令。

你必须先使用终端执行：

```bash
./node_modules/.bin/ai-spec protocol-advance --target . --json
```

然后严格按返回结果继续：

1. 读取返回的 `turn.actor`、`turn.mode`、`turn.summary.delivery_profile`、`turn.summary.artifact_profile`、`turn.announcements.enter`、`turn.announcements.exit`、`reads`、`writes`、`expected_output`
   若存在 `turn.guidance` 或 `turn.execution_contract`，直接按它完成当前轮次；不要再主动搜索 `.agents/roles/`、整目录 `.agents/rules/`、`openspec/config.yaml` 或 scratch 规范
2. 在执行当前轮次前，先原样向用户播报 `turn.announcements.enter`
3. 只完成当前 `actor` 的职责，不允许越权
4. 若 `turn.guidance.openspec_rules.sections` 存在，直接按这些规则补全当前 OpenSpec 产物；不要再次打开 `openspec/config.yaml`
   - 若 `delivery_profile = micro` 或 `artifact_profile = compact`，保持短版 compact 产物
   - 若 `delivery_profile = standard` 或 `artifact_profile = full`，保持完整产物
5. 当前轮次只读取真正必需的项目文件：
   - `.ai-spec/current-run.json`
   - `.ai-spec/internal/current-dispatch.json` / `.ai-spec/internal/current-execution.json`
   - `context/PROJECT.md`
   - `openspec/changes/<change-id>/...`
6. 若当前轮次存在 `turn.execution_contract`：
   - 必须先完成 `turn.execution_contract.required_artifacts`
   - 必须把合法的 `expert-execution` JSON 写到 `turn.execution_contract.write_to`
7. 完成本轮输出后，先原样向用户播报 `turn.announcements.exit`，再执行一次：

```bash
./node_modules/.bin/ai-spec protocol-advance --target . --json
```

8. 重复上述步骤，直到 `turn.status` 变成 `terminal` 或 `blocked`
9. 对用户只输出阶段语义和最终摘要，不回显原始 JSON

硬性禁止：

- 不允许把当前轮次直接退化成“开始写页面/组件代码”
- `task-orchestrator` 必须在每次专家完成后重新出现
- `proposal.md`、`tasks.md`、`checklist.md`、`iterations.md` 门禁必须真实落盘
