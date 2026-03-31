---
id: expert-executor-spec
name: 单轮专家执行器规范
status: active
owner: task-orchestrator
description: 定义如何消费 current-dispatch（当前专家派发载荷），为当前专家生成单轮执行载荷，不自动递归推进下一轮。
---

# 单轮专家执行器规范

## 1. 目的

这份规范解决的问题是：

> 当前系统已经有 `run-state（运行状态）` 和 `expert-dispatch（专家派发载荷）`，但还需要一份由“当前专家”明确产出的“本轮执行输入”。

因此当前阶段的最小实现是：

- 当前专家负责产出 `expert-execution（专家执行载荷）`
- 本地工具只负责校验和落盘
- Phase A（第一步） 只到执行载荷
- Phase B（第二步） 可额外落盘 `runtime-action（运行动作）` 草案
- 不自动递归跑完整链

## 2. 当前支持角色

Phase A（第一步） 当前只要求支持 3 个角色：

- `requirement-analyst（需求解析专家）`
- `frontend-implementer（前端实现专家）`
- `code-guardian（规范守护者）`

## 3. 推荐落盘位置

- `.ai-spec/current-execution.json`
- `.ai-spec/current-execution.md`
- `.ai-spec/executions/<run-id>/<execution-id>.json`
- `.ai-spec/executions/<run-id>/<execution-id>.md`

## 4. 推荐接入方式

当前最稳的接入方式是：

```bash
ai-spec expert-executor apply --payload ./.ai-spec/tmp/current-execution.json
```

或：

```bash
cat ./.ai-spec/tmp/current-execution.json | ai-spec expert-executor apply --stdin
```

Phase B（第二步） 当前只建议继续落盘 `runtime-action（运行动作）` 草案，不建议由本地脚本自行推理：

```bash
ai-spec expert-executor apply-action --payload ./.ai-spec/tmp/current-runtime-action.json
```

## 5. 一句话约束

> `expert-executor（专家执行器）` 不应替当前专家做技能选择、执行推理和下一步动作判断；它只是“当前专家”结构化输出的校验与落盘器。
