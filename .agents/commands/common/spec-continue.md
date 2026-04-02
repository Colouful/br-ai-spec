这是协议继续入口，不是直接开发命令。

绝对红线：

- 在执行 `protocol-advance --json` 之前，禁止直接开始读项目代码、调用实现技能或修改业务文件
- 不允许把当前轮次退化成“直接开始写页面/组件代码”
- `task-orchestrator` 必须在每次专家完成后重新出现

先执行：

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
7. 若用户中途补充新要求，优先执行 `turn.finalize_contract.update_command` 或 `turn.commands.update`
8. 重复直到 `turn.status = terminal | blocked`

`proposal.md`、`tasks.md`、`checklist.md`、`iterations.md` 门禁必须真实落盘。
