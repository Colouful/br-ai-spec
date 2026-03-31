# ai-spec run 最小解析器与输出约定

本文件定义 `ai-spec run` 在读取流程模板 frontmatter 后的最小输出结构。

目标不是一次把整个执行引擎定义完，而是先保证：

- CLI 可稳定输出
- OpenClaw 可稳定读取
- 后续主理人路由和状态机可以在此基础上扩展

## 1. 为什么要有这个约定

`ai-spec run` 至少会经过两个阶段：

1. 读取流程模板 frontmatter，得到结构化模板信息
2. 结合任务输入，由主理人生成本次实际执行计划

如果没有统一 JSON 输出：

- CLI 只能打印文字
- OpenClaw 只能靠日志猜当前状态
- 后续很难做状态追踪、审批、恢复和审计

因此建议把输出分成两类对象：

- `flow-descriptor`
- `run-plan`

## 2. 阶段一：flow-descriptor

这是“模板解析结果”，只依赖 frontmatter，不包含本次任务的动态路由结果。

### 2.1 输出时机

在 `ai-spec run` 读取到模板文件并完成 frontmatter 校验后立即生成。

### 2.2 最小 JSON 结构

```json
{
  "schema_version": 1,
  "kind": "flow-descriptor",
  "flow": {
    "id": "prd-to-delivery",
    "version": 1,
    "name": "PRD 到交付",
    "status": "active",
    "type": "flow-template",
    "owner": "task-orchestrator",
    "description": "面向新需求、设计还原和增量交付的基础协作模板。",
    "visibility": "internal",
    "domains": ["demand-design", "engineering", "testing"],
    "triggers": ["prd-input", "design-input", "new-feature", "incremental-change"],
    "required_roles": ["requirement-analyst", "frontend-implementer", "code-guardian"],
    "optional_roles": ["design-collaborator", "api-contract-specialist", "unit-test-specialist", "verification-reviewer", "performance-auditor"],
    "approval_gates": ["before-implementation", "before-delivery"],
    "artifacts": [
      "openspec/changes/<change-id>/proposal.md",
      "openspec/changes/<change-id>/tasks.md",
      "code",
      "openspec/changes/<change-id>/checklist.md",
      "openspec/changes/<change-id>/iterations.md"
    ],
    "source": ".agents/flows/common/prd-to-delivery.md"
  },
  "errors": [],
  "warnings": []
}
```

### 2.3 说明

- `schema_version`
  - 表示输出契约版本，不等于 flow frontmatter 的 `version`
- `kind`
  - 当前固定为 `flow-descriptor`
- `flow.source`
  - 为解析器补充字段，不来自 frontmatter
- `errors`
  - 仅用于模板解析层错误
- `warnings`
  - 用于提示非阻断问题

## 3. 阶段二：run-plan

这是“主理人生成的执行计划”，在 `flow-descriptor` 之上增加本次任务的动态路由结果。

### 3.1 输出时机

在主理人完成：

- 模板选择
- 必选专家确认
- 可选专家激活
- 审批点生成

之后输出。

### 3.2 最小 JSON 结构

```json
{
  "schema_version": 1,
  "kind": "run-plan",
  "run_id": "run_20260326_001",
  "mode": "auto",
  "status": "planned",
  "task": {
    "change_id": "add-user-center",
    "input_kind": "prd-input",
    "risk_level": "medium"
  },
  "flow": {
    "id": "prd-to-delivery",
    "name": "PRD 到交付",
    "source": ".agents/flows/common/prd-to-delivery.md"
  },
  "plan": {
    "required_roles": ["requirement-analyst", "frontend-implementer", "code-guardian"],
    "activated_optional_roles": ["design-collaborator", "api-contract-specialist"],
    "skipped_optional_roles": ["unit-test-specialist", "verification-reviewer", "performance-auditor"],
    "approval_gates": ["before-implementation"],
    "first_handoff": "requirement-analyst"
  },
  "artifacts": [
    "openspec/changes/add-user-center/proposal.md",
    "openspec/changes/add-user-center/tasks.md",
    "openspec/changes/add-user-center/checklist.md",
    "openspec/changes/add-user-center/iterations.md"
  ],
  "missing_inputs": [
    "API 字段说明未确认"
  ],
  "warnings": [],
  "errors": []
}
```

## 4. 字段说明

### 4.1 顶层字段

| 字段 | 说明 |
| --- | --- |
| `schema_version` | 输出契约版本，当前固定为 `1` |
| `kind` | `flow-descriptor` 或 `run-plan` |
| `run_id` | 仅 `run-plan` 需要，表示一次运行实例 ID |
| `mode` | 主理人运行模式：`auto / suggest / manual` |
| `status` | 当前运行状态，如 `planned / waiting-approval / running / blocked` |

### 4.2 `task`

用于表达本次运行所面向的任务上下文。

当前最小字段建议：

- `change_id`
- `input_kind`
- `risk_level`

### 4.3 `plan`

这是 `run-plan` 最关键的部分。

| 字段 | 说明 |
| --- | --- |
| `required_roles` | 本模板本次必须参与的专家 |
| `activated_optional_roles` | 主理人动态激活的可选专家 |
| `skipped_optional_roles` | 本次未激活的可选专家 |
| `approval_gates` | 本次实际保留的审批点 |
| `first_handoff` | 第一位要被启动的专家 |

## 5. 最小实现建议

当前阶段不要试图让 `ai-spec run` 一次做完整状态机。

建议分两步实现：

### Step 1

支持：

- 读取流程模板
- 输出 `flow-descriptor`
- 校验流程元数据是否完整

### Step 2

支持：

- 主理人根据输入生成 `run-plan`
- 输出 `first_handoff`
- 输出 `approval_gates`
- 输出 `missing_inputs`

## 6. 错误处理约定

### 6.1 模板解析错误

若 frontmatter 无法解析，返回：

```json
{
  "schema_version": 1,
  "kind": "flow-descriptor",
  "flow": null,
  "errors": ["missing required field: required_roles"],
  "warnings": []
}
```

### 6.2 路由错误

若模板能解析，但主理人无法生成可执行计划，返回：

```json
{
  "schema_version": 1,
  "kind": "run-plan",
  "status": "blocked",
  "errors": ["missing business goal", "input scope is ambiguous"],
  "warnings": []
}
```

## 7. 推荐输出方式

为了兼容 CLI、本地脚本和 OpenClaw，建议：

- 标准输出打印 `run-plan` JSON
- 人类可读说明走标准错误输出或额外 `--pretty` 模式

这样可以保证：

- 机器人读 JSON
- 人看可读文本

两者互不干扰。

## 8. 当前建议

当前阶段，`ai-spec run` 最重要的不是“真的把所有专家跑完”，而是先做到这三件事：

1. 读模板
2. 产出结构化执行计划
3. 明确第一跳交接给谁

只要这三件事稳定了，后面接 OpenClaw、审批、恢复、审计都会顺很多。
