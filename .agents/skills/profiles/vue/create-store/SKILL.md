---
name: create-store
description: 指导在 Vue 3 项目中按团队规范使用 Pinia 创建和维护全局状态 store，包括目录结构、命名与持久化策略。当前端需要新增或重构状态管理时使用本技能。
---

# 创建与维护 Pinia Store

## 目录与命名

- 文件位置：`src/stores/<module>.ts`，导出名称：`useXxxStore`
- 集中导出：`src/stores/index.ts`

---

## 创建步骤

### 1. Setup Store（推荐）

```ts
// src/stores/user.ts
import { ref, computed } from 'vue'
import { defineStore } from 'pinia'
import type { UserInfo } from '@/api/user/types'

export const useUserStore = defineStore('user', () => {
  const userInfo = ref<UserInfo | null>(null)
  const token = ref('')
  const isLoggedIn = computed(() => !!token.value)

  function setUser(info: UserInfo) { userInfo.value = info }
  function setToken(val: string) { token.value = val }
  function resetUser() { userInfo.value = null; token.value = '' }

  return { userInfo, token, isLoggedIn, setUser, setToken, resetUser }
})
```

### 2. 持久化（如需要）

配合 `pinia-plugin-persistedstate`：

```ts
export const useThemeStore = defineStore(
  'theme',
  () => {
    const mode = ref<'light' | 'dark'>('light')
    function toggleMode() { mode.value = mode.value === 'light' ? 'dark' : 'light' }
    return { mode, toggleMode }
  },
  { persist: { key: 'app-theme', pick: ['mode'] } },
)
```

### 3. 集中导出

```ts
// src/stores/index.ts
export { useUserStore } from './user'
export { useThemeStore } from './theme'
```

---

## 使用约定

- 全局共享状态集中在 `src/stores`，禁止在组件中用 `ref` 维护全局数据
- Store 只存纯数据与业务行为，不耦合 UI 组件
- 消费方式：`const userStore = useUserStore()`

---

## 快速检查清单

- [ ] 文件在 `src/stores/` 下，使用 setup 函数语法？
- [ ] 导出名称为 `useXxxStore`，在 index.ts 集中导出？
- [ ] 按需使用 `persist` 持久化？
- [ ] 未在 store 中耦合 UI 逻辑？
