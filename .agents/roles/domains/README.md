# 能力域角色目录说明

本目录用于存放“规划中的能力域角色结构”。

插件页面如果需要统一读取角色展示信息，优先读取上层索引文件：

- `../INDEX.md`

它的作用不是马上启用所有专家，而是先把未来的目录骨架立住，避免后面边做边改结构。

当前策略：

- `common/` 放当前 MVP 真正启用的专家
- `domains/` 放各能力域的目录占位和候选专家模板
- 某个专家真正进入 MVP 后，再补完整角色定义或迁入 `common/`

推荐的能力域目录如下：

- `demand-design/`
- `governance/`
- `engineering/`
- `testing/`
- `delivery/`
- `documentation/`
- `performance/`
- `observability/`
- `security-a11y/`

## 候选模板原则

- 文件名继续使用英文 `kebab-case`
- `status` 统一先标记为 `planned`
- 文件内容保持轻量，只定义职责、输入、输出和启用条件
- 真正进入 MVP 时，再补充更细的 rules、skills 和流程绑定
