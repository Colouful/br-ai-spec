# 实施任务

## 执行总原则
- [ ] 任务必须限定在 proposal.md、design.md 和 specs 已批准范围内
- [ ] 每个子任务都要写明目标、输入、输出、验证点和依赖或前置条件
- [ ] 未完成验证前不得宣称任务完成或继续交接

## 子任务清单

### 子任务 1
- [ ] 目标：创建商品 mock 页面与最小组件结构
- [ ] 输入：proposal.md、specs/ui/spec.md、现有 `src/views` 目录约定
- [ ] 输出：`src/views/products/mock/index.vue`
- [ ] 验证点：页面文件存在，能引用本地 mock 数据并展示列表
- [ ] 依赖或前置条件：requirement-analyst 已产出 proposal、specs、design

### 子任务 2
- [ ] 目标：补齐路由模块和 mock 数据文件
- [ ] 输入：design.md、现有 `src/router/modules` 与 `src/mock` 目录约定
- [ ] 输出：`src/router/modules/products.ts`、`src/mock/products.ts`
- [ ] 验证点：路由指向商品 mock 页面，mock 数据文件可被页面导入
- [ ] 依赖或前置条件：子任务 1 的页面路径已确定

### 子任务 3
- [ ] 目标：补齐 checklist 和 iterations，完成交付闭环
- [ ] 输入：实现结果、proposal.md、design.md、tasks.md
- [ ] 输出：`checklist.md`、`iterations.md`
- [ ] 验证点：检查结论、验证摘要、残留风险和交接提醒都已记录
- [ ] 依赖或前置条件：页面、路由和 mock 数据文件已落盘
