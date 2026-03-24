# Context Pack

这是给目标项目准备的最小上下文包模板。

目标：

- 支撑 AI 协作开发
- 支撑项目实操分享
- 结构浅、职责清楚、后续可扩展

建议在目标项目中落到：

```text
context/
├── PROJECT.md
├── RULES.md
├── DESIGN.md
├── TASKS.md
├── ITERATIONS.md
└── CHECKLIST.md
```

说明：

- `PROJECT.md` 和 `RULES.md` 偏稳定信息
- `DESIGN.md` 和 `TASKS.md` 偏当前需求
- `ITERATIONS.md` 和 `CHECKLIST.md` 偏过程反馈和验证

`spec` 与这套模板不是竞争关系。通常可以这样映射：

- `DESIGN.md` ~= 当前变更的设计说明
- `TASKS.md` ~= 当前变更的任务拆解

如果后续需要扩展，优先新增：

- `DECISIONS.md`
- `TELEMETRY.md`

不建议一开始就把目录做得很深。
