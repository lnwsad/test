<script setup>
defineProps({
  side: { type: String, required: true },
  size: { type: String, default: 'medium' },
  label: { type: String, default: '' },
})
</script>

<template>
  <svg class="ox-egg-art" :class="[`egg-side-${side === 'x' ? 'white' : 'black'}`, `egg-size-${size}`]" viewBox="0 0 100 100" role="img" :aria-label="label || (side === 'x' ? 'ไข่ขาว' : 'ไข่ดำ')" xmlns="http://www.w3.org/2000/svg">
    <ellipse cx="50" cy="91" rx="23" ry="5" fill="#111727" opacity=".18"/>
    <g :transform="size === 'small' ? 'translate(23 22) scale(.54)' : size === 'medium' ? 'translate(11 10) scale(.78)' : 'translate(0 0) scale(1)'">
      <path d="M50 7c-6 0-11 11-18 19C20 40 13 54 16 69c3 17 16 25 34 25s31-8 34-25c3-15-4-29-16-43C61 18 56 7 50 7Z" :fill="side === 'x' ? '#fff5dc' : '#343748'" :stroke="side === 'x' ? '#b89059' : '#171c2c'" stroke-width="3" stroke-linejoin="round"/>
      <path v-if="side === 'x'" d="M49 13c-4 9-10 16-17 24-9 11-14 22-12 33 1 6 4 11 8 14-2-14 3-27 11-39 7-11 12-20 10-32Z" fill="#fffdf5" opacity=".74"/>
      <path v-else d="M31 36c6-8 13-16 18-25-4 1-8 9-14 16C25 39 18 52 18 64c3-10 7-19 13-28Z" fill="#777b90" opacity=".57"/>
      <path v-if="side === 'x'" d="M26 78c10 9 38 11 51 0" fill="none" stroke="#e9d4a7" stroke-width="2" opacity=".75"/>
      <path v-else d="M26 78c10 9 38 11 51 0" fill="none" stroke="#575b70" stroke-width="2" opacity=".82"/>
      <ellipse cx="37" cy="55" rx="5" ry="6.5" :fill="side === 'x' ? '#38323a' : '#fff6e4'"/><ellipse cx="63" cy="55" rx="5" ry="6.5" :fill="side === 'x' ? '#38323a' : '#fff6e4'"/>
      <circle cx="38.5" cy="53" r="1.7" :fill="side === 'x' ? '#fffdf2' : '#7b829c'"/><circle cx="64.5" cy="53" r="1.7" :fill="side === 'x' ? '#fffdf2' : '#7b829c'"/>
      <ellipse cx="27" cy="67" rx="5" ry="2.7" fill="#f18f91" opacity=".72"/><ellipse cx="73" cy="67" rx="5" ry="2.7" fill="#f18f91" opacity=".72"/>
      <path d="M46 66q4-4 8 0-1 4-4 4t-4-4Z" :fill="side === 'x' ? '#d78479' : '#f1a09a'"/><path d="M50 70v3q-5 5-9 0m9 0q5 5 9 0" fill="none" :stroke="side === 'x' ? '#876256' : '#e0c7c4'" stroke-width="2" stroke-linecap="round"/>
      <path d="m29 29 3 2m36-2-3 2" fill="none" :stroke="side === 'x' ? '#dfc391' : '#8c8fa1'" stroke-width="2" stroke-linecap="round"/>
    </g>
  </svg>
</template>
