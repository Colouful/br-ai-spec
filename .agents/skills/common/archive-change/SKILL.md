---
name: archive-change
description: 变更归档增强层。在执行 /opsx:archive 时确保增量规范正确合并到 openspec/specs/，变更目录归档到正确路径，并输出合并摘要。
---

# 归档变更（OpenSpec 增强层）

## 定位

本技能是 OpenSpec `/opsx:archive` 的**增强层**，确保归档流程中规范合并和目录操作的正确性。

职责划分：

| 层 | 职责 | 产物位置 |
|----|------|----------|
| **本技能** | 规范合并 + 目录创建 + 路径校验 + 摘要输出 | `openspec/specs/` |
| **OpenSpec** | 归档命令调度、产物完整性检查 | `openspec/changes/archive/` |
| **config.yaml** | 桥接 ex-ai-spec  规范到 OpenSpec rules | `openspec/config.yaml` |

## 使用时机

当用户执行以下操作时触发：

- `/opsx:archive`
- `/opsx-archive`
- "归档变更"
- "归档当前变更"

---

## 步骤 1：归档前检查

确认变更目录完整性：

| 检查项 | 路径 | 必须存在 |
|--------|------|----------|
| 变更元数据 | `openspec/changes/<name>/.openspec.yaml` | 是 |
| 提案文档 | `openspec/changes/<name>/proposal.md` | 是 |
| 增量规范 | `openspec/changes/<name>/specs/` | 是 |
| 技术设计 | `openspec/changes/<name>/design.md` | 否（警告） |
| 任务清单 | `openspec/changes/<name>/tasks.md` | 是 |

检查 `tasks.md` 中的任务完成状态：

- 全部完成 `[x]` → 正常归档
- 存在未完成 `[ ]` → 警告但不阻止，输出未完成任务列表

---

## 步骤 2：合并增量规范到 openspec/specs/

**这是最关键的步骤，必须严格执行。**

### 2.1 确保目标目录存在

```text
openspec/specs/ 不存在 → 创建目录
```

### 2.2 遍历增量规范

遍历 `openspec/changes/<name>/specs/` 下的每个域目录：

```text
openspec/changes/<name>/specs/
├── ui/
│   └── component-name.spec.md
├── api/
│   └── endpoint-name.spec.md
└── ...
```

### 2.3 按域合并

对每个 `<domain>/` 目录：

1. 检查 `openspec/specs/<domain>/` 是否存在，不存在则**创建**
2. 将增量规范文件**复制**到 `openspec/specs/<domain>/`
3. 如果目标已存在同名 spec 文件：更新内容（保留未涉及的 capability），不覆盖

### 2.4 合并示例

变更前：

```text
openspec/
├── specs/                          ← 可能不存在，需创建
└── changes/
    └── add-button-global-component/
        └── specs/
            └── ui/
                └── app-button.spec.md
```

合并后：

```text
openspec/
├── specs/
│   └── ui/                         ← 新建域目录
│       └── app-button.spec.md      ← 从增量规范复制
└── changes/
    └── archive/
        └── 2026-03-23-add-button-global-component/
            └── ...                  ← 归档后的完整变更
```

---

## 步骤 3：归档变更目录

将变更目录移动到**正确的归档路径**：

```text
源：openspec/changes/<name>/
目标：openspec/changes/archive/YYYY-MM-DD-<name>/
```

**注意路径**：归档目录是 `openspec/changes/archive/`，**不是** `openspec/archive/`。

确保 `openspec/changes/archive/` 目录存在，不存在则创建。

---

## 步骤 4：输出合并摘要

归档完成后，输出以下摘要信息：

```text
归档摘要：
- 变更名称：<name>
- 归档路径：openspec/changes/archive/YYYY-MM-DD-<name>/
- 规范合并：
  - 新增域：<列出新增的 domain 目录>
  - 新增规范：<列出新增的 spec 文件>
  - 更新规范：<列出已存在并被更新的 spec 文件>
- 任务完成状态：N/M 已完成
```

---

## 常见错误与防范

| 错误 | 正确做法 |
|------|----------|
| 归档到 `openspec/archive/` | 归档到 `openspec/changes/archive/YYYY-MM-DD-<name>/` |
| 跳过规范合并直接归档 | 必须先合并到 `openspec/specs/` 再归档 |
| `openspec/specs/` 不存在时跳过合并 | 不存在则创建目录，然后合并 |
| 覆盖已有规范 | 已有同名 spec 时合并内容，保留未涉及的 capability |

---

## 相关规范与技能

- `openspec/config.yaml` — archive rules 定义归档规则
- `.agents/skills/create-proposal/SKILL.md` — 提案前置分析（上游流程）
- `.agents/skills/execute-task/SKILL.md` — 任务执行（上游流程）
- `docs/openspec-guide.md` — OpenSpec 完整工作流说明
