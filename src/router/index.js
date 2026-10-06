import { createRouter, createWebHashHistory } from 'vue-router'
import HomeView from '../views/HomeView.vue'
import OxView from '../views/OxView.vue'

const router = createRouter({
  history: createWebHashHistory(),
  routes: [
    { path: '/', name: 'home', component: HomeView },
    { path: '/ox', name: 'ox', component: OxView },
    { path: '/about', redirect: '/' },
  ],
})

export default router
