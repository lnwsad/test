import { Capacitor } from '@capacitor/core'

export function getRuntimeInfo() {
  return {
    platform: Capacitor.getPlatform(),
    isNative: Capacitor.isNativePlatform(),
  }
}
