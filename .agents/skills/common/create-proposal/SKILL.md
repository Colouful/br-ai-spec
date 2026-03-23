---
name: create-proposal
description: 提案前置分析与 OpenSpec 增强层。在调用 /opsx:propose 之前完成需求分析（设计稿、接口、交付形态），将分析结论注入 OpenSpec 上下文，由 OpenSpec 在 openspec/changes/ 下生成原生产物，最后做后置检查与增强。
---

# 创建提案（OpenSpec 增强层）

## 定位

本技能是 OpenSpec `/opsx:propose` 的**增强层**，不替代、不干预 OpenSpec 的产物生成。

职责划分：

| 层 | 职责 | 产物位置 |
|----|------|----------|
| **本技能** | 需求前置分析 + 上下文注入 + 后置检查 | 无独立产物（分析结论注入 OpenSpec 上下文） |
| **OpenSpec** | 生成 proposal.md / specs/ / design.md / tasks.md | `openspec/changes/<name>/` |
| **config.yaml** | 桥接 br-ai-spec 规范到 OpenSpec rules | `openspec/config.yaml` |

## 使用时机

当需要为一个**需求**创建提案时使用。需求可能是：

- 新增/改版一个**页面**（有或没有设计稿）
- 开发一系列**功能组件**（有或没有 UI 描述）
- **有接口**或**无接口**（后端未就绪时用 mock）
- 纯逻辑、纯接口、或 UI + 接口 等组合

---

## 步骤 1：需求前置分析

在委托 OpenSpec 生成提案之前，先确认下列条件，作为传递给 OpenSpec 的上下文。

| 条件 | 选项 | 影响 |
|------|------|------|
| **是否有设计稿或 UI 要求描述** | 有 / 无 | 有 → 步骤 2 触发 design-analysis；OpenSpec 的 tasks 中应包含 UI 验收任务 |
| **是否有接口（已提供或约定）** | 有 / 无 / 未就绪 | 有 → 正常对接；无 → 可不做数据层；未就绪 → mock，见项目 Mock 数据策略 |
| **交付形态** | 新页面 / 功能组件 / 能力模块 / 其它 | 决定目录结构（routes vs components）与 OpenSpec design.md 中的技术方案 |
| **是否仅样式/还原类** | 是 / 否 | 是 → 重点在 design-analysis + 验收 |

---

## 步骤 2：设计稿分析（可选但推荐）

当需求**包含界面**且**有设计稿**（.pen、figma 链接、设计图、标注）或**有明确 UI 描述**时：

- **使用技能**：`.agents/skills/design-analysis/SKILL.md`
- **产出**：`docs/样式还原/<名称>-UI分析清单.md`

分析清单应在 OpenSpec 生成提案前或同步完成，以便 OpenSpec 的 specs/、design.md、tasks.md 能引用分析结果。

---

## 步骤 3：委托 OpenSpec 生成提案

将步骤 1-2 的分析结论整合为变更描述，调用 `/opsx:propose <change-name>`。

OpenSpec 会在 `openspec/changes/<change-name>/` 下生成原生产物：

```
openspec/changes/<change-name>/
├── .openspec.yaml      # 变更元数据
├── proposal.md         # 变更概述（why + what + impact）
├── specs/              # Delta specs（新增/修改/删除的需求）
│   └── <domain>/
│       └── spec.md
├── design.md           # 技术设计（方案选型、组件拆分、数据结构）
└── tasks.md            # 实施任务清单
```

**上下文注入**：OpenSpec 通过 `openspec/config.yaml` 中的 `context` 和 `rules` 字段自动读取 br-ai-spec 的规范约束（路由、组件、API、样式等），无需本技能额外干预。

**传递给 OpenSpec 的信息**（作为 propose 描述的一部分）：
- 步骤 1 确认的条件（交付形态、接口情况、设计稿情况）
- 步骤 2 产出的 UI 分析清单路径（如有）
- 涉及 UI 时：组件放置位置建议（依据 `.agents/rules/04-组件规范.md`）
- 涉及接口时：接口结构建议（依据 `.agents/rules/05-API规范.md`）
- 接口未就绪时：标注 mock 策略

---

## 步骤 4：后置检查与增强

OpenSpec 生成提案后，检查以下项目并按需补充：

### 4.1 design.md 检查
- 技术方案是否遵循 `.agents/rules/` 中的架构约束
- 涉及页面时，是否参考了 `.agents/rules/06-路由规范.md`
- 涉及组件时，是否参考了 `.agents/rules/04-组件规范.md`
- 样式方案是否使用主题变量（`.agents/rules/09-样式规范.md`）

### 4.2 tasks.md 检查
- 涉及 UI 且有设计稿时，末尾是否包含 UI 还原验收任务（引用 `.agents/skills/ui-verification/SKILL.md`）
- 涉及接口时，是否包含接口封装任务（引用 `.agents/rules/05-API规范.md`）
- 图标/图片未定时，是否标注占位元素（`.agents/rules/08-通用约束.md`）
- 有 UI 分析清单时，开发任务是否引用 `docs/样式还原/<名称>-UI分析清单.md`

### 4.3 specs/ 检查
- 每个 capability 的验收场景是否可测试
- 有设计稿时，是否引用 UI 分析清单作为验收参考

### 4.4 执行交接
提案确认后进入执行阶段时，使用 `/opsx:apply` 或遵循 `.agents/rules/12-Superpowers执行规范.md`，按 `.agents/skills/execute-task/SKILL.md` 的四步循环逐条执行 tasks.md。

---

## 样式还原验证检查清单（供 create-route / create-component 引用）

当开发涉及 **UI 还原**（有设计稿或分析清单）时，可对照以下检查项自检；更完整项见 `docs/样式还原/<名称>-UI分析清单.md` 中的「验证检查清单」。

**布局**：区域位置、尺寸、间距是否与分析清单/设计稿一致；对齐方式（如 flex-start vs center）是否正确。  
**样式**：颜色、字体、字号、字重、圆角、边框、阴影、效果（如 backdrop-filter）是否一致。  
**元素**：是否缺少区块、图标、占位图；占位尺寸与比例是否正确。  
**交互**：默认/hover/active 等状态是否还原（若有设计）。

create-route、create-component 等技能中「涉及 UI 还原时」可引用：`.agents/skills/create-proposal/SKILL.md` 中的「样式还原验证检查清单」及对应页面的 `docs/样式还原/<名称>-UI分析清单.md`。

---

## 相关规范与技能

- `.agents/rules/03-项目结构.md` - 目录结构、Mock 数据策略
- `.agents/rules/04-组件规范.md` - 组件放置决策
- `.agents/rules/05-API规范.md` - 接口封装
- `.agents/rules/06-路由规范.md` - 路由结构
- `.agents/rules/08-通用约束.md` - 占位元素等
- `.agents/rules/09-样式规范.md` - 设计稿颜色提取、主题变量
- `.agents/rules/12-Superpowers执行规范.md` - 执行原则
- `.agents/skills/execute-task/SKILL.md` - Superpowers 四步循环执行
- `.agents/skills/design-analysis/SKILL.md` - 设计稿分析（有设计稿时使用，产出 UI 分析清单）
- `.agents/skills/ui-verification/SKILL.md` - UI 验收（实现后需验收时使用）
- `openspec/config.yaml` - OpenSpec 配置（含 br-ai-spec 上下文注入）
