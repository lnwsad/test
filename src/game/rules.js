export const BOARD_WIDTH = 4
export const BOARD_HEIGHT = 4
export const MAX_TURNS = 60
export const TURN_SECONDS = 15

export const ANIMALS = {
  rat: { name: 'หนู', emoji: '🐭', rank: 1 },
  cat: { name: 'แมว', emoji: '🐱', rank: 2 },
  wolf: { name: 'หมาป่า', emoji: '🐺', rank: 3 },
  dog: { name: 'สุนัข', emoji: '🐶', rank: 4 },
  leopard: { name: 'เสือดาว', emoji: '🐆', rank: 5 },
  tiger: { name: 'เสือ', emoji: '🐯', rank: 6 },
  lion: { name: 'สิงโต', emoji: '🦁', rank: 7 },
  elephant: { name: 'ช้าง', emoji: '🐘', rank: 8 },
}

export const ANIMAL_ORDER = ['rat', 'cat', 'wolf', 'dog', 'leopard', 'tiger', 'lion', 'elephant']

function shuffled(items) {
  const result = [...items]
  for (let i = result.length - 1; i > 0; i -= 1) {
    const j = Math.floor(Math.random() * (i + 1))
    ;[result[i], result[j]] = [result[j], result[i]]
  }
  return result
}

export function createInitialEggs() {
  const eggs = Array.from({ length: BOARD_HEIGHT }, (_, row) => Array.from({ length: BOARD_WIDTH }, (_, col) => ({
    id: `egg-${row}-${col}`,
    side: null,
    row,
    col,
    status: 'hidden',
    animal: null,
  }))).flat()
  const sides = shuffled([...Array(8).fill('red'), ...Array(8).fill('blue')])
  eggs.forEach((egg, index) => { egg.side = sides[index] })
  for (const side of ['red', 'blue']) {
    const animals = shuffled(ANIMAL_ORDER)
    eggs.filter(egg => egg.side === side).forEach((egg, index) => { egg.animal = animals[index] })
  }
  return eggs
}

export function canCapture(attacker, defender) {
  if (!attacker || !defender || attacker.side === defender.side) return false
  if (attacker.animal === 'rat' && defender.animal === 'elephant') return true
  if (attacker.animal === 'elephant' && defender.animal === 'rat') return false
  return ANIMALS[attacker.animal].rank > ANIMALS[defender.animal].rank
}

export function combatOutcome(attacker, defender) {
  if (attacker.animal === 'rat' && defender.animal === 'elephant') return 'attacker'
  if (attacker.animal === 'elephant' && defender.animal === 'rat') return 'defender'
  const difference = ANIMALS[attacker.animal].rank - ANIMALS[defender.animal].rank
  return difference > 0 ? 'attacker' : difference < 0 ? 'defender' : 'both'
}

export function getLegalMoves(pieces, eggs, pieceId) {
  const piece = pieces.find(item => item.id === pieceId)
  if (!piece) return []
  return [[-1, 0], [1, 0], [0, -1], [0, 1]].flatMap(([dr, dc]) => {
    const row = piece.row + dr
    const col = piece.col + dc
    if (row < 0 || row >= BOARD_HEIGHT || col < 0 || col >= BOARD_WIDTH) return []
    const egg = eggs.find(item => item.row === row && item.col === col)
    if (!egg || egg.status === 'hidden') return []
    const target = pieces.find(item => item.row === row && item.col === col)
    if (target && target.side === piece.side) return []
    return [{ row, col, captureId: target?.id }]
  })
}

export function applyMove(pieces, eggs, pieceId, row, col) {
  const piece = pieces.find(item => item.id === pieceId)
  const move = getLegalMoves(pieces, eggs, pieceId).find(item => item.row === row && item.col === col)
  if (!piece || !move) return null
  const capturedPiece = move.captureId ? pieces.find(item => item.id === move.captureId) : null
  const outcome = capturedPiece ? combatOutcome(piece, capturedPiece) : 'move'
  const attackerLost = outcome === 'defender' || outcome === 'both'
  const defenderLost = outcome === 'attacker' || outcome === 'both'
  const removedIds = new Set([
    ...(attackerLost ? [pieceId] : []),
    ...(defenderLost && capturedPiece ? [capturedPiece.id] : []),
  ])
  const updatedPieces = pieces
    .filter(item => !removedIds.has(item.id))
    .map(item => item.id === pieceId ? { ...item, row, col } : item)
  const updatedEggs = removedIds.size
    ? eggs.map(egg => removedIds.has(egg.id) ? { ...egg, status: 'captured' } : egg)
    : eggs
  return { pieces: updatedPieces, eggs: updatedEggs, captured: capturedPiece, outcome, attackerLost, bothLost: outcome === 'both' }
}

export function evaluateWinner(pieces, eggs) {
  const remaining = Object.fromEntries(['red', 'blue'].map(side => [
    side,
    eggs.filter(egg => egg.side === side && egg.status !== 'captured'),
  ]))
  if (remaining.red.length === 0) return 'blue'
  if (remaining.blue.length === 0) return 'red'
  if (remaining.red.length !== 1 || remaining.blue.length !== 1) return null
  const finalAnimals = ['red', 'blue'].map(side => {
    const egg = remaining[side][0]
    const piece = pieces.find(item => item.id === egg.id)
    return piece?.animal ?? egg.animal
  })
  if (finalAnimals[0] === 'rat' && finalAnimals[1] === 'elephant') return 'red'
  if (finalAnimals[1] === 'rat' && finalAnimals[0] === 'elephant') return 'blue'
  const redRank = ANIMALS[finalAnimals[0]].rank
  const blueRank = ANIMALS[finalAnimals[1]].rank
  return redRank === blueRank ? 'draw' : redRank > blueRank ? 'red' : 'blue'
}

export function randomOpening(eggs, dieRoll) {
  const unopened = eggs.filter(egg => egg.status === 'hidden')
  const count = Math.min(dieRoll, unopened.length)
  const selected = shuffled(unopened).slice(0, count)
  return eggs.map(egg => {
    if (!selected.some(item => item.id === egg.id)) return egg
    return { ...egg, status: 'revealed' }
  })
}
