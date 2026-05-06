# 变更提案：runtime-smoke-demo

## 目标

### 业务目标
- 新增一个商品 mock 页面，用于验证 expert-delivery 主链可运行。

### 工程目标
- 验证 proposal、design、tasks、checklist、iterations 这组模板化产物可以支撑主链闭环。

### 变更对象与入口
- 页面入口：`src/views/products/mock/index.vue`
- 路由入口：`src/router/modules/products.ts`
- 数据入口：`src/mock/products.ts`

### 设计链接
- 当前示例没有独立 Figma(设计稿)，以 runtime smoke 需求文案和仓库约定作为设计输入。

### 组件复用约束（可选）
- 当前示例优先复用现有 Vue 目录结构和最小页面约定，不额外引入组件库封装。

## 范围

### In Scope(纳入范围)
- 新增商品 mock 页面。
- 新增最小路由模块。
- 新增最小 mock 数据。
- 输出结构化的 design、tasks、checklist 和 iterations。

### Out of Scope(排除范围)
- 不接真实 API(接口)。
- 不引入真实浏览器脚本或复杂状态管理。

## 非目标
- 不接真实 API。
- 不引入复杂状态管理。
- 不在本次示例中抽象新的通用组件。

## 默认假设
- 仓库已有 Vue 3 + TypeScript 基础结构，可直接承接页面、路由和 mock 文件。
- 当前示例只要求最小验证闭环，不要求真实组件库和真实浏览器验证接入。

## 风险与待确认项
- 当前演示为确定性 replay(回放)，不代表真实 AI IDE 全自动执行。
- 真实业务接入时仍需补浏览器验证证据和组件复用决策。
