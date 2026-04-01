这是协议驱动入口，不是直接开发命令。

你必须先使用终端执行：

```bash
./node_modules/.bin/ai-spec protocol-step --target . --user-input "<本次 /spec-start 的用户原始需求>" --json
```

然后严格按返回结果执行，不允许脑补流程：

1. 读取返回的 `turn.actor`、`turn.mode`、`turn.summary.delivery_profile`、`turn.summary.artifact_profile`、`turn.announcements.enter`、`turn.announcements.exit`、`reads`、`writes`、`expected_output`
   如果存在 `turn.guidance` 或 `turn.execution_contract`，以它们为准；不要再主动搜索 `.agents/roles/`、整目录 `.agents/rules/`、`openspec/config.yaml` 或 scratch 规范文件
2. 在执行当前轮次前，先原样向用户播报 `turn.announcements.enter`
3. 只完成当前 `actor` 的职责：
   - `task-orchestrator`：只做编排、假设、交接、收尾，不写业务代码
   - `requirement-analyst`：只产出 `proposal.md`、`tasks.md`
   - `frontend-implementer`：只有这一阶段允许改业务代码
   - `code-guardian`：只产出 `checklist.md`、`iterations.md`
4. 若 `turn.guidance.openspec_rules.sections` 存在，直接按这些规则生成或补全当前 OpenSpec 产物；不要再次打开 `openspec/config.yaml`
   - 若 `delivery_profile = micro` 或 `artifact_profile = compact`，当前 OpenSpec 产物必须使用短版 compact 规格
   - 若 `delivery_profile = standard` 或 `artifact_profile = full`，使用完整规格
5. 只读取当前轮次真正必需的项目文件：
   - `.ai-spec/current-run.json`
   - `.ai-spec/internal/current-dispatch.json` / `.ai-spec/internal/current-execution.json`
   - `context/PROJECT.md`
   - `openspec/changes/<change-id>/...`
   不要为“确认规则”而再次遍历整个工作区
6. 只写 `turn.writes` 指定的文件；不要自创 scratch 路径
7. 若当前轮次存在 `turn.execution_contract`：
   - 必须把合法的 `expert-execution` JSON 写到 `turn.execution_contract.write_to`
   - 必须先完成 `turn.execution_contract.required_artifacts`
   - 完成后直接执行 `turn.execution_contract.next_advance_command`
8. 完成本轮输出后，立刻原样向用户播报 `turn.announcements.exit`
9. 然后执行：

```bash
./node_modules/.bin/ai-spec protocol-advance --target . --json
```

10. 读取新的 `turn`，继续下一轮；直到 `turn.status` 变成 `terminal` 或 `blocked`
11. 对用户只输出阶段语义和最终摘要，不回显原始 JSON
12. 若用户提供的是结构化输入模板（如 `.agents/templates/common/mock-page.md`、`new-page.md`、`new-component.md`、`bugfix.md`），优先复用其字段，减少 `missing_inputs`

硬性禁止：

- 当前 `actor` 不是 `frontend-implementer` 时，禁止修改 Vue/TS/CSS 业务代码
- `proposal.md`、`tasks.md` 未完成前，禁止进入实现
- `checklist.md`、`iterations.md` 未完成前，禁止 `complete`
- 不允许跳过 `task-orchestrator -> requirement-analyst -> task-orchestrator -> frontend-implementer -> task-orchestrator -> code-guardian -> task-orchestrator`
