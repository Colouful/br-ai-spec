# 5 分钟快速上手

## 你将获得什么

安装 ex-ai-spec  后，AI 编码助手会自动遵循团队的目录结构、组件规范、API 命名、样式变量等约束，不再需要每次聊天重复解释项目规则。

## 安装

```bash
# 克隆规范库
git clone http://git.100credit.cn/zhenwei.li/ex-ai-spec .git
cd ex-ai-spec 

# 安装到你的项目（交互式，会引导选择技术栈和安装层级）
bash install.sh init /path/to/your-project

# 或指定参数（非交互式）
bash install.sh init /path/to/your-project --profile vue --level L2
```

### 安装层级

| 层级 | 内容 | 适合场景 |
|------|------|----------|
| **L1** | 只安装 `.agents`（规范 + 技能） | 快速试用、个人开发者 |
| **L2** | `.agents` + IDE 适配层 + MCP 模板 | 团队标准接入 |
| **L3** | 全量安装含 OpenSpec 流程 | 需要需求治理与归档 |

### 技术栈 Profile

| Profile | 技术栈 |
|---------|--------|
| **react** | React + TypeScript + Vite + Zustand + Ant Design |
| **vue** | Vue 3 + TypeScript + Vite + Pinia + Vue Router |

## 安装后必做的两件事

### 1. 填写项目信息

编辑以下两个文件（或在 AI IDE 中输入"初始化项目规范"让 AI 自动生成）：

- `.agents/rules/01-项目概述.md` — 项目定位和技术栈
- `.agents/rules/03-项目结构.md` — 项目目录结构

### 2. 配置 MCP（仅 L2/L3）

修改 `.cursor/mcp.json` 中的占位符：

- `你的项目ID` → ApiFox 项目 ID
- `你的 APIFOX 访问令牌` → ApiFox Token

## 开始使用

安装完成后，在 AI IDE 中正常对话即可。AI 会自动按规范执行。

### 高频场景

| 你想做什么 | 对 AI 说 |
|------------|----------|
| 新建组件 | "创建一个用户列表组件" |
| 新建页面 | "新增一个订单详情页" |
| 接新接口 | "对接用户列表接口" |
| 分析设计稿 | "分析这个 Figma 设计稿" |
| 创建提案 | "帮我创建一个变更提案" |

### 验证安装

```bash
bash install.sh check /path/to/your-project
```

## 更新规范

```bash
bash install.sh update /path/to/your-project --profile vue
```

更新不会覆盖 `01-项目概述.md` 和 `03-项目结构.md`（项目特有规则）。
