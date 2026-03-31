---
id: task-orchestrator-runtime-hooks
name: 主理人运行态钩子规范
status: active
owner: task-orchestrator
description: 定义 task-orchestrator 在首轮规划、审批阻断、审批放行、专家交接、恢复、完成、失败、取消时应调用的 runtime-state 命令。
---

# 主理人运行态钩子规范

## 1. 目的

这份规范不直接替代真正的运行器代码，它解决的是：

> 当 `task-orchestrator（任务主理人）` 真的开始驱动一条任务链时，每个关键节点应该调用哪条 `runtime-state（运行状态）` 命令。

也就是说，它是：

- 自动执行链的调用约定
- 未来 Runner（运行器）或 IDE（开发工具）插件的接线图

## 2. 最小钩子映射

### 2.1 首轮计划生成后

当主理人已经拿到：

- `run-plan（运行计划）`
- 首轮 `task-anchor（任务锚点）`

推荐优先调用：

```bash
ai-spec task-orchestrator-extractor apply --payload ./.ai-spec/tmp/task-orchestrator-reply.md
```

如果当前环境已经直接生成纯结构化 payload（载荷），可回退为：

```bash
ai-spec task-orchestrator-adapter apply --payload ./.ai-spec/tmp/task-orchestrator-first-response.json
```

如果当前环境尚未接抽取层和适配层，再回退为：

```bash
ai-spec runtime-state bootstrap --payload ./.ai-spec/tmp/task-orchestrator-first-response.json
```

### 2.2 进入审批等待或被阻断

如果当前节点不能继续，需要卡在审批点或阻断点：

```bash
ai-spec task-orchestrator-adapter apply --payload ./.ai-spec/tmp/runtime-action.json
```

如果只是一般阻断，没有审批点：

```bash
ai-spec runtime-state gate-blocked --status blocked --message "缺少设计稿，无法继续"
```

### 2.3 审批通过

优先通过适配层消费结构化动作载荷；未接适配层时回退为：

```bash
ai-spec runtime-state approve \
  --gate before-implementation \
  --to-role frontend-implementer
```

### 2.4 专家交接

优先通过适配层消费结构化动作载荷；未接适配层时回退为：

```bash
ai-spec runtime-state handoff \
  --to-role frontend-implementer \
  --next-role code-guardian \
  --task-anchor ./.ai-spec/tmp/frontend-implementer-anchor.json \
  --status running
```

### 2.5 恢复执行

优先通过适配层消费结构化动作载荷；未接适配层时回退为：

```bash
ai-spec runtime-state resume --to-role frontend-implementer --status running
```

### 2.6 运行完成

优先通过适配层消费结构化动作载荷；未接适配层时回退为：

```bash
ai-spec runtime-state complete
```

### 2.7 运行失败

优先通过适配层消费结构化动作载荷；未接适配层时回退为：

```bash
ai-spec runtime-state fail --error "组件规范检查未通过"
```

### 2.8 用户取消

优先通过适配层消费结构化动作载荷；未接适配层时回退为：

```bash
ai-spec runtime-state cancel --message "用户主动取消当前任务"
```

### 2.9 查询当前状态

优先通过适配层消费结构化动作载荷；未接适配层时回退为：

```bash
ai-spec runtime-state status
```

## 3. 推荐自动链顺序

```text
task-orchestrator（任务主理人）
  -> 生成 run-plan（运行计划） + task-anchor（任务锚点） / runtime-action（运行动作）
  -> task-orchestrator-adapter（自动执行适配层）
  -> bootstrap（首轮桥接）
  -> 如需等待审批：gate-blocked（阻断）
  -> 审批通过：approve（审批）
  -> 交给下一位专家：handoff（交接）
  -> 如执行中断：resume（恢复）
  -> 成功结束：complete（完成）
  -> 失败结束：fail（失败）
  -> 用户放弃：cancel（取消）
```

## 4. 当前阶段边界

当前仓库里已经有：

- 最小 `runtime-state（运行状态）` 命令
- 最小钩子映射规范
- 最小 `task-orchestrator-adapter（自动执行适配层）`

但还没有：

- 自动读取主理人输出并逐条调用这些命令的真正运行器
- 自动生成所有中间 `task-anchor（任务锚点）` 文件的执行器

所以这份规范当前的意义是：

> 先把自动执行链的调用协议定稳，再把真正的运行器接上。

## 5. 一句话要求

> `task-orchestrator（任务主理人）` 不应只负责“说下一步做什么”，还应优先输出结构化载荷并调用 `task-orchestrator-adapter（自动执行适配层）`，再由适配层统一驱动 `runtime-state（运行状态）`，把运行链稳定落到 `.ai-spec/` 中。
