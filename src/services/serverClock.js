let serverTimeAnchor = null
let monotonicTimeAnchor = null

export function syncServerClock(serverNow, requestStartedAt, responseReceivedAt) {
  if (!Number.isFinite(serverNow)) return
  // Use the request midpoint to reduce the effect of network delay.
  serverTimeAnchor = serverNow + Math.max(0, responseReceivedAt - requestStartedAt) / 2
  monotonicTimeAnchor = responseReceivedAt
}

export function getServerNow() {
  if (serverTimeAnchor === null || monotonicTimeAnchor === null) return Date.now()
  return serverTimeAnchor + (performance.now() - monotonicTimeAnchor)
}
