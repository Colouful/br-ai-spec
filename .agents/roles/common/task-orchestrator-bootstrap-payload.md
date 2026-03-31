---
id: task-orchestrator-bootstrap-payload
name: 主代理首轮桥接载荷规范
status: active
owner: task-orchestrator
description: 定义 task-orchestrator 在首轮输出后交给 runtime-state（运行状态） 桥接命令消费的最小组合载荷结构。
---

# 主代理首轮桥接载荷规范

## 1. 目的

这份规范用于解决一个很具体的问题：

- `task-orchestrator（任务主代理）` 已经产出了 `run-plan（运行计划）`
- 也已经产出了首轮 `task-anchor（任务锚点）`
- 需要把这两个对象一次性交给 `ai-spec runtime-state bootstrap`

也就是说，这份载荷是：

> 主代理首轮输出和 `run-state（运行状态）` 写盘之间的桥接对象。

## 2. 最小结构

```json
{
  "schema_version": 1,
  "kind": "task-orchestrator-bootstrap",
  "run_plan": {
    "schema_version": 1,
    "kind": "run-plan"
  },
  "task_anchor": {
    "schema_version": 1,
    "kind": "task-anchor"
  }
}
```

约束：

- `run_plan` 必填
- `task_anchor` 推荐提供；当前阶段允许为空
- `run_plan` 必须符合 `task-orchestrator-run-plan-template.md`
- `task_anchor` 应符合 `task-anchor-spec.md`

## 3. 推荐文件位置

当前阶段建议主代理把这份载荷暂存在：

```text
.ai-spec/tmp/task-orchestrator-first-response.json
```

这不是长期归档文件，只是一次桥接输入。

## 4. 推荐调用方式

```bash
ai-spec runtime-state bootstrap \
  --payload ./.ai-spec/tmp/task-orchestrator-first-response.json
```

如果运行环境支持标准输入，也可以：

```bash
cat ./.ai-spec/tmp/task-orchestrator-first-response.json | ai-spec runtime-state bootstrap --stdin
```

## 5. 示例

```json
{
  "schema_version": 1,
  "kind": "task-orchestrator-bootstrap",
  "run_plan": {
    "schema_version": 1,
    "kind": "run-plan",
    "status": "planned",
    "task": {
      "type": "component-development",
      "raw_input": "创建一个商品组件",
      "risk_level": "low"
    },
    "flow": {
      "id": "prd-to-delivery",
      "reason": "当前输入属于需求驱动的前端交付任务"
    },
    "plan": {
      "required_roles": ["frontend-implementer", "code-guardian"],
      "activated_optional_roles": ["requirement-analyst"],
      "first_handoff": "requirement-analyst",
      "approval_gates": []
    },
    "missing_inputs": [
      "组件目录位置未明确"
    ],
    "next_action": "先补齐关键信息，再进入 requirement-analyst"
  },
  "task_anchor": {
    "schema_version": 1,
    "kind": "task-anchor",
    "task": {
      "raw_goal": "创建一个商品组件",
      "input_kind": "natural-language"
    },
    "stage": {
      "flow_id": "prd-to-delivery",
      "current_role": "requirement-analyst",
      "next_role": "frontend-implementer"
    },
    "constraints": {
      "rules": ["component-standard"],
      "must_not": ["不要跳过规则检查"]
    },
    "expected_output": [
      "补齐 proposal（提案）",
      "输出 tasks（任务清单）"
    ]
  }
}
```

## 6. 一句话要求

> 如果 `task-orchestrator（任务主代理）` 需要在首轮产出后立刻初始化 `run-state（运行状态）`，应优先输出这份组合载荷，再调用 `ai-spec runtime-state bootstrap`，而不是让调用方手工拆分 `run-plan（运行计划）` 和 `task-anchor（任务锚点）`。
