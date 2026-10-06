<script setup>
import { ref } from 'vue'
const taps = ref(0)
</script>

<template>
  <div class="hero-card">
    <span class="eyebrow">✦ VUE 3 + CAPACITOR</span>
    <h1>เริ่มสร้าง<br /><span>ไอเดียใหม่</span></h1>
    <p class="intro">โครงสร้างเริ่มต้นสำหรับเว็บแอปที่ต่อยอดเป็นแอปมือถือได้</p>
    <button class="primary-button" @click="taps++">ลองแตะดู <span>↗</span></button>
    <p class="tap-message" aria-live="polite">{{ taps ? 'แตะแล้ว ' + taps + ' ครั้ง' : 'พร้อมเริ่มต้นโปรเจกต์ของคุณ' }}</p>
    <div class="orb"></div>
  </div>
  <div class="section-heading"><div><span class="eyebrow muted">PROJECT STARTER</span><h2>พร้อมต่อยอด</h2></div><span class="arrow">↘</span></div>
  <div class="feature-grid">
    <article class="feature-card"><span class="feature-icon purple">⌘</span><h3>Vue 3</h3><p>Single-file components และ Composition API</p></article>
    <article class="feature-card"><span class="feature-icon mint">▣</span><h3>Capacitor</h3><p>เชื่อม native APIs บน Android และ iOS</p></article>
  </div>
</template>
