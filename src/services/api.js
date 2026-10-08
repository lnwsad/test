const apiBase = (import.meta.env.VITE_API_URL || '/api').replace(/\/$/, '')

async function gameRequest(path, { method = 'GET', token, body } = {}) {
  const response = await fetch(`${apiBase}/games${path}`, {
    method,
    headers: {
      ...(body ? { 'Content-Type': 'application/json' } : {}),
      ...(token ? { 'X-Player-Token': token } : {}),
    },
    ...(body ? { body: JSON.stringify(body) } : {}),
  })
  const data = await response.json()
  if (!response.ok) throw new Error(data.error || 'เชื่อมต่อห้องไม่ได้')
  return data
}

export function createGame(name) {
  return gameRequest('', { method: 'POST', body: { name } })
}

export function quickJoinGame(name) {
  return gameRequest('/quick-join', { method: 'POST', body: { name } })
}

export function getOpenGames() {
  return gameRequest('/open')
}

export function joinGame(id, name) {
  return gameRequest(`/${encodeURIComponent(id)}/join`, { method: 'POST', body: { name } })
}

export function getGame(id, token) {
  return gameRequest(`/${encodeURIComponent(id)}`, { token })
}

export function leaveGame(id, token) {
  return gameRequest(`/${encodeURIComponent(id)}/leave`, { method: 'POST', token })
}

export function openGameEgg(id, token, eggId) {
  return gameRequest(`/${encodeURIComponent(id)}/open`, { method: 'POST', token, body: { eggId } })
}

export function sendGameMove(id, token, move) {
  return gameRequest(`/${encodeURIComponent(id)}/moves`, { method: 'POST', token, body: move })
}

export async function getApiHealth() {
  const response = await fetch(`${apiBase}/health`)
  const data = await response.json()
  if (!response.ok) throw new Error(data.database || 'API unavailable')
  return data
}

export async function getNotes() {
  const response = await fetch(`${apiBase}/notes`)
  if (!response.ok) throw new Error('โหลดรายการไม่สำเร็จ')
  return response.json()
}

export async function createNote(text) {
  const response = await fetch(`${apiBase}/notes`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ text }),
  })
  const data = await response.json()
  if (!response.ok) throw new Error(data.error || 'บันทึกรายการไม่สำเร็จ')
  return data
}
