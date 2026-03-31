---
name: sync-registry-index
description: sync（同步）本地求解使用的最小注册表目录。用于维护场景方案、规则映射和技能能力域标签，避免把安装求解数据硬编码在执行脚本里。
---

# sync（同步）注册表目录

本目录用于承载 `ai-spec sync（同步）` 的本地静态注册表。

当前阶段放 5 类数据：

- `scenario-packages.json`
  - 定义 `scenario_package（场景方案包）` 默认展开出的 `roles（专家角色） / skills（技能） / rules（规则） / domains（能力域）`
- `rules.json`
  - 定义 `rule（规则） id` 到实际文件的映射，以及它们的 `domains（能力域）`
- `skills.json`
  - 定义 `skill（技能）` 的 `domains（能力域）` 标签
- `roles.json`
  - 定义 `role（专家角色）` 的安装元数据，以及角色侧公共支持文件
- `flows.json`
  - 定义 `flow（流程模板）` 的安装元数据，以及流程侧公共支持文件

当前原则：

- 运行逻辑写在 `bin/sync.js`
- 安装求解数据沉淀在 `.agents/registry/`
- 后续新增或调整 `rules（规则） / scenario_packages（场景方案包） / skills（技能） / roles（专家角色） / flows（流程模板）` 时，优先改注册表，不优先改执行器

## 校验方式

为避免 `registry（注册表）` 数据文件写坏，当前项目提供了专门的校验命令：

```bash
ai-spec validate-registry
ai-spec validate-registry --json
```

校验范围包括：

- `rules.json`
- `skills.json`
- `roles.json`
- `flows.json`
- `scenario-packages.json`

当前会检查：

- `JSON（结构化数据）` 是否可解析
- 根字段是否存在
- `version（版本号）` 是否合法
- `source（源文件） / support_files（支持文件）` 是否真实存在
- `domains（能力域）` 是否为字符串数组
- `scenario_package（场景方案包）` 引用的 `roles（专家角色） / skills（技能） / rules（规则）` 是否都能在注册表中找到

`ai-spec sync（同步）` 在执行前也会先跑一次注册表校验；若校验失败，会直接中断并提示先执行 `ai-spec validate-registry` 查看详情。
