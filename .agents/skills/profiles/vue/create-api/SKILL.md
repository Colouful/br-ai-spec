---
name: create-api
description: 指导在 Vue 3 项目中按团队规范创建和维护 HTTP 接口，包括类型定义、请求封装、命名约定与错误处理。当前端需要新增或调整 API 时使用本技能。
---

# 创建与维护 API

## 目录结构

```text
src/api/<module>/index.ts    # 请求函数
src/api/<module>/types.ts    # 请求/响应类型
```

所有请求函数集中在 `src/api/` 按模块管理，禁止在组件或 store 中直接调用 axios。

---

## 创建步骤

### 1. 定义类型

```ts
// src/api/banner/types.ts
export interface Banner { id: number; title: string; imageUrl: string; status: number }
export interface GetBannerListParams { page: number; pageSize: number; status?: number }
export interface GetBannerListResult { list: Banner[]; total: number }
export type CreateBannerParams = Pick<Banner, 'title' | 'imageUrl'>
export type UpdateBannerParams = CreateBannerParams & { id: number }
```

类型严格依据接口文档（如 Apifox），禁止凭空创造字段。

### 2. 创建请求函数

```ts
// src/api/banner/index.ts
import request from '@/utils/request'
import type { GetBannerListParams, GetBannerListResult, CreateBannerParams, UpdateBannerParams } from './types'

export const getBannerList = (params: GetBannerListParams) =>
  request.get<GetBannerListResult>('/api/banners', { params })

export const getBannerDetail = (id: number) => request.get<Banner>(`/api/banners/${id}`)
export const createBanner = (data: CreateBannerParams) => request.post('/api/banners', data)
export const updateBanner = (data: UpdateBannerParams) => request.put(`/api/banners/${data.id}`, data)
export const deleteBanner = (id: number) => request.delete(`/api/banners/${id}`)
```

---

## 命名约定（NON-NEGOTIABLE）

`getXxxList` / `getXxxDetail` / `createXxx` / `updateXxx` / `deleteXxx`，**禁止** `fetchXxx` 等前缀。

## 错误处理（NON-NEGOTIABLE）

- 接口错误由 `request` 拦截器统一处理，业务代码中**禁止重复** `ElMessage.error` 等提示
- 业务侧只处理成功逻辑及前端自身校验错误

---

## 快速检查清单

- [ ] 类型在 `types.ts`，请求在 `index.ts`？
- [ ] 命名符合 `get/create/update/deleteXxx`？
- [ ] 未重复处理接口错误？
- [ ] 类型与接口文档一致？
