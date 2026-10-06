<script setup>
import { computed } from 'vue'
import AppNav from './components/AppNav.vue'
import { getRuntimeInfo } from './services/runtime.js'

const platform = computed(() => {
  const runtime = getRuntimeInfo()
  return runtime.isNative ? runtime.platform : 'Web'
})
</script>

<template>
  <main class="app-shell">
    <header class="topbar">
      <RouterLink class="brand jungle-brand" to="/" aria-label="หน้าเลือกเกม">
        <span class="brand-mark">🎮</span>
        <span>เกมแข่งออนไลน์</span>
      </RouterLink>
      <span class="platform-pill"><span class="status-dot"></span>{{ platform }}</span>
    </header>

    <section class="page-content">
      <RouterView />
    </section>

    <AppNav />
  </main>
</template>
