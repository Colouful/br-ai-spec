这是协议继续入口，不是直接开发命令。

绝对红线：

- 在执行 `protocol-advance --json` 之前，禁止直接开始读项目代码、调用实现技能或修改业务文件
- 不允许把当前轮次退化成“直接开始写页面/组件代码”
- `task-orchestrator` 必须在每次专家完成后重新出现

先判断当前这一轮用户输入：

- 若用户这轮是在表达审批/放行意图，例如：
  - `我同意继续实现`
  - `同意`
  - `继续`
  - `开始`
  - `愿意`
- 且当前运行态很可能已停在 `pending_gate`

则优先执行：

```bash
./node_modules/.bin/ai-spec protocol-update --target . --user-input "<当前这条用户原话>" --json
```

不要先空跑 `protocol-advance`。

其它情况再先执行：

```bash
./node_modules/.bin/ai-spec protocol-advance --target . --json
```

然后只按返回的 `turn` 执行：

1. 若存在 `turn.enforcement`，先完全遵守它；尤其是 `allowed_actor`、`allow_code_write`、`forbidden_skills`
2. 原样向用户播报 `turn.announcements.enter`
3. 只读取 `turn.reads`，只写 `turn.writes`
4. 若存在 `turn.guidance`、`turn.execution_contract`、`turn.commands`、`turn.finalize_contract`，以它们为最终执行契约，不要自行拼命令
5. 完成当前轮次后，原样播报 `turn.announcements.exit`
6. 若 `turn.requires_advance = true`，立即执行 `turn.finalize_contract.advance_command`
7. 若用户中途补充新要求，或当前这条输入本身就是审批/放行意见，优先执行 `turn.finalize_contract.update_command` 或 `turn.commands.update`
8. `advance` 返回后，直接读取返回结果里的下一个 `turn` 并继续；不要 `sleep`、`tail`、`timeout`、`cat` 日志，也不要额外重跑 `protocol-step`
9. 重复直到 `turn.status = terminal | blocked`

若 `turn.status = blocked` 且存在 `turn.summary.pending_gate`：
- 明确告诉用户：当前停在该审批门禁，尚未批准，不能继续实现
- 若存在 `turn.guidance.approval_gate.user_report_contract`，严格按它输出极简摘要：
  只保留“当前状态 / 关键原因 / 下一步”，不要写长篇阶段说明，不要罗列 proposal/tasks 或仓库文件路径
- 不要继续执行 `advance`
- 若用户随后给出明确批准意见，先执行 `turn.commands.update` 记录审批说明，再让用户重新执行 `/spec-continue`

`proposal.md`、`tasks.md`、`checklist.md`、`iterations.md` 门禁必须真实落盘。
若 `delivery_profile = micro`，最终摘要严格服从 `turn.finalize_contract.user_report` 与 `turn.finalize_contract.user_report_contract`：
- 不超过 6 行
- 只保留交付结论、验证结果、残留风险
- 不重复转述 `checklist.md`、`iterations.md`
- 不逐条罗列 created/updated 文件或 OpenSpec 文件名
