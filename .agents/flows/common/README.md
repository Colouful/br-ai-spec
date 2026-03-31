# 流程目录说明

本目录用于定义“专家协同流程”。

当前阶段先只保留 1 条流程：

- `prd-to-delivery.md`

这里的“流程”不再理解成写死所有步骤的刚性链路，而应理解成：

- 基础协作模板
- 必选专家骨架
- 可选专家插入条件
- 审批点和产物约束

当前阶段的目标不是把流程做复杂，而是先把最小模板骨架立住，后续按相同结构新增即可。

## Frontmatter 约定

流程模板的结构化元数据统一约定见：

- [../FRONTMATTER.md](/Users/lizhenwei/workspace/vueworkspace/bairong/br-ai-spec/.agents/flows/FRONTMATTER.md)
- [../RUN_OUTPUT.md](/Users/lizhenwei/workspace/vueworkspace/bairong/br-ai-spec/.agents/flows/RUN_OUTPUT.md)

后续 CLI、插件页面、OpenClaw 调度层都应优先解析 frontmatter，而不是依赖正文做关键路由判断。
