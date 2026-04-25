# AGENTS.md

你正在参与 AI 工程资产操作系统开发。

## 项目边界

- br-ai-spec：本地 CLI、技术栈扫描、项目初始化、状态机、执行器适配、Worktree 隔离。
- skill-q-platform：资产 Hub、Manifest、Agent Profile、Asset Factory、审核发布。
- br-ai-spec-visual：运行态可视化、Collector API、运行事件、治理报表。

## 架构文档目录

/Users/lizhenwei/Downloads/00download/docs/第二大阶段

开发前必须阅读该目录下 7 份 Markdown 文档。

## 最高约束

1. 不允许删除既有业务逻辑。
2. 不允许一次性实现全部内容。
3. 不允许扫描阶段写业务项目。
4. 不允许上传目标项目源码。
5. 不允许绕过 `.ai-spec/ai-spec.lock.json`。
6. 不允许修改 Hub 已发布资产正文。
7. 不允许把 Codex / Cursor / Claude Code 写死为唯一执行器。
8. 不允许状态机无限重试。
9. 不允许在原始工作区直接修改业务代码。
10. 所有提示、错误提示、CLI 输出必须使用中文。
11. 所有核心数据结构必须有类型定义。
12. 所有 JSON 配置必须有 schema 校验。
13. 所有核心模块必须补测试。

## 执行方式

采用虚拟子代理模式，但不要创建失控的并发 Agent：

1. 架构审查
2. 实现
3. 测试
4. 安全审计
5. 回归审查

## 开发顺序

1. ConfigLoader
2. TechScannerEngine
3. InitPlan / InitApplier
4. ai-spec.lock.json / registry.index.json / context-index.json
5. GlobalCache / Sync
6. AssetTamperChecker
7. Branch / Worktree
8. StateMachine / CircuitBreaker / EscapeHatch
9. ContextBuilder
10. PrivacyFilter / Telemetry
11. Hub Asset / Manifest API
12. Agent Profile
13. Executor Adapter：Codex / Cursor / Claude Code
14. Visual Collector
15. Asset Factory