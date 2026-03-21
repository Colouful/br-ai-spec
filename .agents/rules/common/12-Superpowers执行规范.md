---
alwaysApply: false
description: 实现变更时的强制执行规范，要求启用 Superpowers 微观执行模式（头脑风暴、TDD 驱动、双重审查）。当开始编写代码或执行 tasks.md 时读取此规则。
---

# 12-Superpowers 编码执行规范

## 适用范围

当进入实现阶段并开始处理 `tasks.md` 中的具体任务时，本规范自动生效。

## 核心约束（NON-NEGOTIABLE）

1. **禁止直出代码**：绝对禁止未经思考直接输出大量业务代码。每条 Task 必须经过 Superpowers Loop 的三道关卡后才可提交。
2. **逐条执行**：按 `tasks.md` 中的顺序逐条处理，禁止跳过或批量完成。
3. **用户确认门禁**：每条 Task 的头脑风暴结论必须获得用户明确同意后，才可进入编码阶段。

## Superpowers Loop（三道关卡）

| 关卡 | 名称 | 核心要求 |
|------|------|----------|
| 1 | 头脑风暴 | 先思考边界情况、错误处理和对现有代码的影响；有歧义必须提问 |
| 2 | TDD 驱动 | RED → GREEN → REFACTOR；REFACTOR 阶段须按需引用 `.agents/rules/` 中的对应规范 |
| 3 | 双重审查 | 设计对齐（`design.md` / `specs/`）+ 质量门禁（异常捕获、类型严谨） |

## 何时可以跳过

以下情况可省略本规范，直接修改：

- 修复拼写、格式、注释等非行为性变更
- 恢复已有 spec 描述的预期行为（Bug fix）
- 非破坏性依赖版本更新

## 具体操作步骤

详见 `.agents/skills/execute-task/SKILL.md`，该技能定义了 Superpowers Loop 的四步操作流程（加载上下文与头脑风暴 → TDD 落地编码 → 双重自我审查 → 状态更新）。