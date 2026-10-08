const apiBase = (import.meta.env.VITE_API_URL || '/api').replace(/\/$/, '')

async function oxRequest(path, { method = 'GET', token, body } = {}) {
  const response = await fetch(`${apiBase}/ox/games${path}`, {
    method,
    headers: {
      ...(body ? { 'Content-Type': 'application/json' } : {}),
      ...(token ? { 'X-Player-Token': token } : {}),
    },
    ...(body ? { body: JSON.stringify(body) } : {}),
  })
  const data = await response.json().catch(() => null)
  if (!response.ok) throw new Error(data?.error || `API OX ตอบกลับผิดพลาด (${response.status})`)
  if (!data) throw new Error('API OX ส่งข้อมูลกลับมาไม่ถูกต้อง ลองรีเฟรชแล้วทำรายการอีกครั้ง')
  return data
}

export function createOxGame(name) {
  return oxRequest('', { method: 'POST', body: { name } })
}

export function quickJoinOxGame(name) {
  return oxRequest('/quick-join', { method: 'POST', body: { name } })
}

export function getOpenOxGames() {
  return oxRequest('/open')
}

export function joinOxGame(id, name) {
  return oxRequest(`/${encodeURIComponent(id)}/join`, { method: 'POST', body: { name } })
}

export function getOxGame(id, token) {
  return oxRequest(`/${encodeURIComponent(id)}`, { token })
}

export function leaveOxGame(id, token) {
  return oxRequest(`/${encodeURIComponent(id)}/leave`, { method: 'POST', token })
}

export function closeOxGame(id, token) {
  return oxRequest(`/${encodeURIComponent(id)}`, { method: 'DELETE', token })
}

export function playOxCell(id, token, cell, size) {
  return oxRequest(`/${encodeURIComponent(id)}/move`, { method: 'POST', token, body: { cell, size } })
}
