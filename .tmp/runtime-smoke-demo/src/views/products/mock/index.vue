<template>
  <section class="product-mock-page">
    <h1>商品 Mock 页面</h1>
    <ul>
      <li v-for="item in productMock" :key="item.id">
        <strong>{{ item.name }}</strong>
        <span>{{ item.price }}</span>
      </li>
    </ul>
  </section>
</template>

<script setup lang="ts">
import { productMock } from '../../../mock/products';
</script>

<style scoped>
.product-mock-page {
  padding: 24px;
}

.product-mock-page ul {
  display: grid;
  gap: 12px;
  list-style: none;
  padding: 0;
}
</style>
