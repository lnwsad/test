function createRandomPlayerName() {
  const suffix = globalThis.crypto?.randomUUID?.().replaceAll('-', '').slice(0, 6).toUpperCase()
    || Math.random().toString(36).slice(2, 8).toUpperCase()
  return `ผู้เล่น-${suffix}`
}

let pagePlayerName = createRandomPlayerName()

export function getPagePlayerName() {
  return pagePlayerName
}

export function setPagePlayerName(name) {
  if (typeof name === 'string' && name.trim()) pagePlayerName = name.trim().slice(0, 20)
}
