---
id: task-orchestrator-run-plan-template
name: 主代理首轮运行计划模板
status: active
owner: task-orchestrator
description: 定义 task-orchestrator 在首次识别任务时必须输出的最小 run-plan 结构，用于统一 IDE、OpenClaw 和后续运行时入口的首轮响应。
---

# 主代理首轮运行计划模板

## 1. 目的

这份模板用于统一 `task-orchestrator（任务主代理）` 在首次接收任务时的输出格式。

适用场景：

- `IDE（开发工具） AI（智能体）` 中显式触发
- OpenClaw（远程入口）触发
- 后续插件页面点击“开始执行”

不论入口来自哪里，首轮输出都应先收敛成最小 `run-plan（运行计划）`，而不是直接写代码。

## 2. 必填字段

首轮输出至少必须覆盖下面 5 类信息：

1. `task_identification（任务识别）`
2. `selected_flow（选中的流程模板）`
3. `selected_roles（本次激活专家）`
4. `missing_inputs（缺失输入）`
5. `next_action（下一步动作）`

## 3. 推荐 Markdown（标记语言）模板

```md
## 任务识别
- 类型：组件开发 / 页面开发 / 文档产出 / 问题修复 / 增量改造
- 当前输入：<原始任务文本>
- 风险级别：low / medium / high

## 推荐流程模板
- `selected_flow（选中的流程模板）`：<flow-id>
- 原因：<为什么选择这条模板>

## 推荐专家
- 必选：<required_roles>
- 可选：<activated_optional_roles>
- 第一跳：<first_handoff>

## 缺失输入
- <missing_input_1>
- <missing_input_2>

## 审批点
- <approval_gate_1>
- <approval_gate_2>

## 下一步
- <next_action>
```

## 4. 推荐 JSON（结构化数据）模板

```json
{
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
    "组件目录位置未明确",
    "是否有设计稿未明确"
  ],
  "next_action": "先补齐关键信息，再进入 requirement-analyst"
}
```

## 5. 最小判定规则

### 5.1 可以直接进入实现前置阶段

当满足以下条件时，可以继续向下游专家交接：

- 已识别任务类型
- 已选出基础 `flow（流程模板）`
- 已明确第一跳专家
- 关键阻断输入已知，或已显式列为 `missing_inputs（缺失输入）`

### 5.2 不能直接进入实现阶段

遇到以下情况时，不应直接让 `frontend-implementer（前端实现专家）` 开始写代码：

- 任务范围完全不清晰
- 技术栈未识别
- 所属目录或页面未知
- 是否需要接口 / 状态 / 设计稿完全未知

此时必须先输出缺口清单或先交给 `requirement-analyst（需求解析专家）`。

## 6. 示例

### 输入

```text
@task-orchestrator（任务主代理） 创建一个商品组件
```

### 输出

```md
## 任务识别
- 类型：组件开发
- 当前输入：创建一个商品组件
- 风险级别：low

## 推荐流程模板
- `selected_flow（选中的流程模板）`：prd-to-delivery
- 原因：当前输入属于需求驱动的前端交付任务，且缺少实现细节，适合先走最小规划再进入实现

## 推荐专家
- 必选：frontend-implementer（前端实现专家）、code-guardian（规范守护者）
- 可选：requirement-analyst（需求解析专家）
- 第一跳：requirement-analyst（需求解析专家）

## 缺失输入
- 组件使用的是 Vue（前端框架）还是 React（前端框架）
- 组件准备放在哪个页面或目录
- 是否有设计稿或参考样式

## 审批点
- 暂无

## 下一步
- 请先补齐上述信息，再进入 requirement-analyst（需求解析专家）
```

## 7. 一句话约束

> `task-orchestrator（任务主代理）` 的首轮输出必须先形成结构化 `run-plan（运行计划）`，再决定是否交给下游专家，不允许在信息明显不足时直接进入实现。

## 8. 与首轮桥接载荷的关系

如果当前运行环境支持本地命令调用，则在生成 `run-plan（运行计划）` 后，应继续：

1. 生成首轮 `task-anchor（任务锚点）`
2. 组装 `task-orchestrator-bootstrap（主代理首轮桥接载荷）`
3. 调用：

```bash
ai-spec runtime-state bootstrap --payload ./.ai-spec/tmp/task-orchestrator-first-response.json
```

对应规范见：

- [task-anchor-spec.md](/Users/lizhenwei/workspace/vueworkspace/bairong/br-ai-spec/.agents/roles/common/task-anchor-spec.md)
- [task-orchestrator-bootstrap-payload.md](/Users/lizhenwei/workspace/vueworkspace/bairong/br-ai-spec/.agents/roles/common/task-orchestrator-bootstrap-payload.md)
