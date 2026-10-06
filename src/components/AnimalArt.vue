<script setup>
import { ANIMALS } from '../game/rules.js'

defineProps({
  animal: { type: String, required: true },
  label: { type: String, default: '' },
})
</script>

<template>
  <svg class="animal-portrait" viewBox="0 0 100 100" role="img" :aria-label="label || ANIMALS[animal]?.name || 'สัตว์'" xmlns="http://www.w3.org/2000/svg">
    <defs>
      <linearGradient id="fur" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#fff5d9"/><stop offset="1" stop-color="#e8c99a"/></linearGradient>
      <linearGradient id="muzzle" x1="0" y1="0" x2="0" y2="1"><stop stop-color="#fffaf0"/><stop offset="1" stop-color="#f2dfc2"/></linearGradient>
      <linearGradient id="ear" x1="0" y1="0" x2="1" y2="1"><stop stop-color="#f6b2a6"/><stop offset="1" stop-color="#db7f78"/></linearGradient>
    </defs>
    <ellipse cx="50" cy="85" rx="28" ry="6" fill="#302d25" opacity=".16"/>

    <!-- Silhouette and ears -->
    <g v-if="animal === 'rat'">
      <circle cx="30" cy="28" r="16" fill="#e9b9a7" stroke="#775748" stroke-width="3"/><circle cx="70" cy="28" r="16" fill="#e9b9a7" stroke="#775748" stroke-width="3"/>
      <circle cx="30" cy="28" r="9" fill="url(#ear)"/><circle cx="70" cy="28" r="9" fill="url(#ear)"/>
      <path d="M23 55c0-20 12-33 27-33s27 13 27 33v13c0 13-12 19-27 19S23 81 23 68z" fill="url(#fur)" stroke="#775748" stroke-width="3"/>
    </g>
    <g v-else-if="animal === 'cat' || animal === 'wolf' || animal === 'tiger'">
      <path d="M25 42 20 15q-1-5 4-2l21 18M75 42l5-27q1-5-4-2L55 31" :fill="animal === 'wolf' ? '#b9c6c5' : animal === 'tiger' ? '#eaa56d' : '#e8c99a'" stroke="#57473b" stroke-width="3" stroke-linejoin="round"/>
      <path d="m26 27 15 10M74 27 59 37" fill="none" stroke="#d98283" stroke-width="4" stroke-linecap="round"/>
      <path d="M22 53c0-19 12-31 28-31s28 12 28 31v14c0 13-12 20-28 20S22 80 22 67z" :fill="animal === 'wolf' ? '#d5d7ca' : animal === 'tiger' ? '#efb36e' : 'url(#fur)'" stroke="#57473b" stroke-width="3"/>
    </g>
    <g v-else-if="animal === 'dog'">
      <path d="M27 37C10 20 12 53 19 68c5 10 14 8 17-1M73 37c17-17 15 16 8 31-5 10-14 8-17-1" fill="#b77b57" stroke="#604637" stroke-width="3" stroke-linecap="round"/>
      <path d="M22 53c0-19 12-31 28-31s28 12 28 31v14c0 13-12 20-28 20S22 80 22 67z" fill="#e9c99d" stroke="#604637" stroke-width="3"/>
    </g>
    <g v-else-if="animal === 'leopard'">
      <circle cx="29" cy="27" r="12" fill="#d99b55" stroke="#574336" stroke-width="3"/><circle cx="71" cy="27" r="12" fill="#d99b55" stroke="#574336" stroke-width="3"/><circle cx="29" cy="27" r="6" fill="url(#ear)"/><circle cx="71" cy="27" r="6" fill="url(#ear)"/>
      <path d="M22 53c0-19 12-31 28-31s28 12 28 31v14c0 13-12 20-28 20S22 80 22 67z" fill="#e6b66e" stroke="#574336" stroke-width="3"/>
      <g fill="#76503a"><circle cx="29" cy="47" r="2.5"/><circle cx="71" cy="47" r="2.5"/><circle cx="26" cy="64" r="2.5"/><circle cx="74" cy="64" r="2.5"/><circle cx="34" cy="78" r="2"/><circle cx="66" cy="78" r="2"/></g>
    </g>
    <g v-else-if="animal === 'lion'">
      <path d="M50 9c8 0 12 8 19 8s12 5 12 13 9 10 8 19 3 13-3 20 0 14-9 18-9 10-18 8-13 6-20 1-15-1-18-10-11-7-10-16-7-12-3-20-4-15 4-21 7-14 15-13S42 8 50 9Z" fill="#bd723e" stroke="#604335" stroke-width="3"/>
      <path d="M25 55c0-18 11-29 25-29s25 11 25 29v11c0 13-11 21-25 21S25 79 25 66z" fill="#f0cf8e" stroke="#604335" stroke-width="3"/>
      <path d="M32 36q8 6 14 2M68 36q-8 6-14 2M31 69q5 7 10 4M69 69q-5 7-10 4" fill="none" stroke="#8b5137" stroke-width="4" stroke-linecap="round"/>
    </g>
    <g v-else-if="animal === 'elephant'">
      <path d="M28 43C5 28 8 72 24 77c6 2 11-2 14-8M72 43c23-15 20 29 4 34-6 2-11-2-14-8" fill="#91b6b5" stroke="#4d6868" stroke-width="3"/>
      <path d="M22 53c0-19 12-31 28-31s28 12 28 31v14c0 13-12 20-28 20S22 80 22 67z" fill="#a8c9c5" stroke="#4d6868" stroke-width="3"/>
      <path d="M42 62c-1 11 2 26 8 27s10-8 8-15l-1-12" fill="#91b6b5" stroke="#4d6868" stroke-width="3" stroke-linecap="round"/><path d="M44 77q5 4 11 0" fill="none" stroke="#6e9997" stroke-width="2"/>
      <path d="m31 76 8 2M69 76l-8 2" stroke="#fff3d7" stroke-width="4" stroke-linecap="round"/>
    </g>
    <g v-else>
      <circle cx="30" cy="28" r="12" fill="#a8c9c5" stroke="#4d6868" stroke-width="3"/><circle cx="70" cy="28" r="12" fill="#a8c9c5" stroke="#4d6868" stroke-width="3"/>
      <path d="M22 53c0-19 12-31 28-31s28 12 28 31v14c0 13-12 20-28 20S22 80 22 67z" fill="url(#fur)" stroke="#65513e" stroke-width="3"/>
    </g>

    <!-- Face details -->
    <g v-if="animal !== 'elephant'">
      <ellipse cx="39" cy="57" rx="4" ry="5.5" fill="#392f2a"/><ellipse cx="61" cy="57" rx="4" ry="5.5" fill="#392f2a"/>
      <circle cx="40" cy="55" r="1.3" fill="#fff8e9"/><circle cx="62" cy="55" r="1.3" fill="#fff8e9"/>
      <ellipse cx="50" cy="69" rx="16" ry="11" fill="url(#muzzle)"/>
      <path d="M47 67q3-4 6 0-1 4-3 4t-3-4Z" fill="#875b56"/><path d="M50 71v3q-5 5-9 0M50 74q5 5 9 0" fill="none" stroke="#79534a" stroke-width="1.8" stroke-linecap="round"/>
      <ellipse cx="31" cy="68" rx="5" ry="2.5" fill="#e88d85" opacity=".7"/><ellipse cx="69" cy="68" rx="5" ry="2.5" fill="#e88d85" opacity=".7"/>
    </g>
    <g v-else>
      <ellipse cx="39" cy="55" rx="4" ry="5" fill="#392f2a"/><ellipse cx="61" cy="55" rx="4" ry="5" fill="#392f2a"/><circle cx="40" cy="53" r="1.3" fill="#fff8e9"/><circle cx="62" cy="53" r="1.3" fill="#fff8e9"/>
      <ellipse cx="31" cy="66" rx="5" ry="2.5" fill="#e88d85" opacity=".65"/><ellipse cx="69" cy="66" rx="5" ry="2.5" fill="#e88d85" opacity=".65"/>
    </g>
    <g v-if="animal === 'rat'" fill="none" stroke="#967262" stroke-width="1.4" stroke-linecap="round"><path d="m37 69-14-3m14 6-15 2m41-5 14-3m-14 6 15 2"/><path d="M46 78v5m8-5v5" stroke="#fff" stroke-width="3"/></g>
    <g v-if="animal === 'cat'" fill="none" stroke="#8b7562" stroke-width="1.3" stroke-linecap="round"><path d="m36 70-13-3m14 6-13 1m40-4 13-3m-14 6 13 1"/></g>
    <g v-if="animal === 'tiger'" fill="none" stroke="#78503a" stroke-width="4" stroke-linecap="round"><path d="m39 31 5 9m17-9-5 9M25 48l9 4m41-4-9 4m-41 9 9 2m41-2-9 2"/></g>
    <g v-if="animal === 'wolf'" fill="none" stroke="#829799" stroke-width="3" stroke-linecap="round"><path d="m31 34 6 5m32-5-6 5M27 72l8 2m38-2-8 2"/></g>
    <path v-if="animal === 'dog'" d="M43 82q7 5 14 0" fill="none" stroke="#d98786" stroke-width="3" stroke-linecap="round"/>
    <path v-if="animal === 'elephant'" d="M48 36q2-3 4 0" fill="none" stroke="#6e9997" stroke-width="2" stroke-linecap="round"/>
  </svg>
</template>
