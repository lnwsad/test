import { createApp } from 'vue'
import { Capacitor } from '@capacitor/core'
import App from './App.vue'
import router from './router'
import './style.css'

const app = createApp(App)
app.provide('runtimePlatform', Capacitor.getPlatform())
app.use(router)
app.mount('#app')
