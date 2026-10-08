import 'dotenv/config'
import cors from 'cors'
import express from 'express'
import mongoose from 'mongoose'
import { randomBytes, randomInt, randomUUID } from 'node:crypto'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { ANIMALS, MAX_TURNS, TURN_SECONDS, applyMove, combatOutcome, createInitialEggs, evaluateWinner, getLegalMoves, randomOpening } from '../src/game/rules.js'

const app = express()
const port = Number(process.env.PORT || 3000)
const clientDist = fileURLToPath(new URL('../dist/', import.meta.url))

app.use(cors({ origin: process.env.CORS_ORIGIN?.split(',').map(value => value.trim()) || true }))
app.use(express.json({ limit: '1mb' }))
app.use(express.static(clientDist))

const noteSchema = new mongoose.Schema({
  text: { type: String, required: true, trim: true, maxlength: 500 },
}, { timestamps: true })
const Note = mongoose.model('Note', noteSchema)

// Rooms are held in memory so a game can start without a database. Deployments
// that run multiple API instances should replace this map with shared storage.
const games = new Map()
const oxGames = new Map()
const closedRooms = new Map()
const ROOM_WAIT_TIMEOUT_MS = 60_000
const SPECTATOR_ACTIVE_WINDOW_MS = 15_000
const ROOM_ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'
const OX_TURN_SECONDS = 30

function roomCode() {
  let code
  do {
    code = Array.from(randomBytes(5), byte => ROOM_ALPHABET[byte % ROOM_ALPHABET.length]).join('')
  } while (games.has(code) || oxGames.has(code) || closedRooms.has(code))
  return code
}

function pruneExpiredWaitingRooms() {
  const cutoff = Date.now() - ROOM_WAIT_TIMEOUT_MS
  for (const [id, game] of games) {
    if (game.players.blue && !game.players.red && !game.winner && Date.parse(game.createdAt || 0) <= cutoff) games.delete(id)
    else if (game.winner && Date.now() - Date.parse(game.finishedAt || game.updatedAt || 0) >= 120_000) games.delete(id)
  }
  for (const [id, game] of oxGames) {
    if (game.players.x && !game.players.o && !game.winner && Date.parse(game.createdAt || 0) <= cutoff) oxGames.delete(id)
    else if (game.winner && Date.now() - Date.parse(game.finishedAt || 0) >= 120_000) oxGames.delete(id)
  }
  for (const [id, closedAt] of closedRooms) {
    if (Date.now() - closedAt >= 120_000) closedRooms.delete(id)
  }
}

const waitingRoomCleanup = setInterval(pruneExpiredWaitingRooms, 5_000)
waitingRoomCleanup.unref()

function touchSpectator(game, token) {
  const spectator = game.spectators?.find(player => player.token === token)
  if (spectator) spectator.lastSeenAt = Date.now()
}

function countActiveSpectators(game) {
  const cutoff = Date.now() - SPECTATOR_ACTIVE_WINDOW_MS
  return (game.spectators || []).filter(spectator => spectator.lastSeenAt && spectator.lastSeenAt >= cutoff).length
}

function publicOxGame(game, token) {
  const side = game.players.x?.token === token ? 'x' : game.players.o?.token === token ? 'o' : null
  const spectator = !side && Boolean(game.spectators.some(player => player.token === token))
  if (!side && !spectator) return null
  return {
    id: game.id,
    createdAt: game.createdAt,
    finishedAt: game.finishedAt ?? null,
    side,
    spectator,
    status: game.players.x && game.players.o ? 'playing' : 'waiting',
    players: { x: game.players.x?.name ?? null, o: game.players.o?.name ?? null },
    cells: game.cells,
    inventories: game.inventories,
    turn: game.turn,
    winner: game.winner,
    turns: game.turns,
    turnSeconds: OX_TURN_SECONDS,
    turnStartedAt: game.turnStartedAt,
    lastMove: game.lastMove,
  }
}

function getOxWinner(cells) {
  const lines = [[0, 1, 2], [3, 4, 5], [6, 7, 8], [0, 3, 6], [1, 4, 7], [2, 5, 8], [0, 4, 8], [2, 4, 6]]
  const tops = cells.map(stack => stack.at(-1)?.side ?? null)
  const winningLine = lines.find(([a, b, c]) => tops[a] && tops[a] === tops[b] && tops[a] === tops[c])
  return winningLine ? tops[winningLine[0]] : null
}

const OX_SIZE_RANK = { small: 1, medium: 2, large: 3 }

function hasOxLegalMove(game, side) {
  return Object.entries(game.inventories[side]).some(([size, count]) => count > 0 && game.cells.some(stack => {
    const top = stack.at(-1)
    return !top || (top.side !== side && OX_SIZE_RANK[size] > OX_SIZE_RANK[top.size])
  }))
}

function getOxLegalPlacements(game, side) {
  return Object.entries(game.inventories[side]).flatMap(([size, count]) => {
    if (!count) return []
    return game.cells.flatMap((stack, cell) => {
      const top = stack.at(-1)
      return !top || (top.side !== side && OX_SIZE_RANK[size] > OX_SIZE_RANK[top.size])
        ? [{ size, cell }]
        : []
    })
  })
}

function completeOxTurn(game, completedAt, lastMove) {
  game.turns += 1
  game.lastMove = lastMove
  game.winner = getOxWinner(game.cells)
  if (game.winner) {
    game.finishedAt = completedAt.toISOString()
    game.turnStartedAt = null
    return
  }
  const current = game.turn
  const next = current === 'x' ? 'o' : 'x'
  const nextCanPlay = hasOxLegalMove(game, next)
  const currentCanPlay = hasOxLegalMove(game, current)
  if (nextCanPlay) game.turn = next
  else if (!currentCanPlay) {
    game.winner = 'draw'
    game.finishedAt = completedAt.toISOString()
    game.turnStartedAt = null
    return
  } else game.lastMove.skipped = next
  game.turnStartedAt = completedAt.toISOString()
}

function advanceExpiredOxTurns(game) {
  if (game.winner || !game.turnStartedAt || !game.players.x || !game.players.o) return
  let turnStart = Date.parse(game.turnStartedAt)
  const turnMs = OX_TURN_SECONDS * 1000
  while (!game.winner && Date.now() - turnStart >= turnMs) {
    const completedAt = new Date(turnStart + turnMs)
    const options = getOxLegalPlacements(game, game.turn)
    if (!options.length) {
      const current = game.turn
      const next = current === 'x' ? 'o' : 'x'
      if (!hasOxLegalMove(game, next)) {
        game.winner = 'draw'
        game.finishedAt = completedAt.toISOString()
        game.lastMove = { type: 'timeout-pass', skipped: game.turn }
        game.turnStartedAt = null
        return
      }
      game.turn = next
      game.lastMove = { type: 'timeout-pass', skipped: current }
      game.turnStartedAt = completedAt.toISOString()
      turnStart += turnMs
      continue
    }
    const choice = options[Math.floor(Math.random() * options.length)]
    const top = game.cells[choice.cell].at(-1)
    game.inventories[game.turn][choice.size] -= 1
    game.cells[choice.cell].push({ side: game.turn, size: choice.size, id: randomUUID() })
    const lastMove = { type: 'timeout-place', cell: choice.cell, side: game.turn, size: choice.size, captured: top?.size ?? null }
    completeOxTurn(game, completedAt, lastMove)
    turnStart += turnMs
  }
}

function rollOpeningDie() {
  const result = randomInt(100)
  if (result < 20) return 1
  if (result < 40) return 2
  if (result < 60) return 3
  if (result < 80) return 4
  return result < 85 ? 5 : 6
}

function publicGame(game, token) {
  const side = game.players.red?.token === token ? 'red' : game.players.blue?.token === token ? 'blue' : null
  const spectator = !side && Boolean(game.spectators?.some(player => player.token === token))
  if (!side && !spectator) return null
  return {
    id: game.id,
    createdAt: game.createdAt,
    finishedAt: game.finishedAt ?? null,
    side,
    spectator,
    status: game.players.red && game.players.blue ? 'playing' : 'waiting',
    players: {
      red: game.players.red?.name ?? null,
      blue: game.players.blue?.name ?? null,
    },
    eggs: game.eggs.map(egg => egg.status === 'hidden' ? { ...egg, side: null, animal: null } : egg),
    pieces: game.pieces,
    turn: game.turn,
    winner: game.winner,
    turns: game.turns,
    maxTurns: MAX_TURNS,
    turnSeconds: TURN_SECONDS,
    turnStartedAt: game.turnStartedAt,
    diceRoll: game.diceRoll,
    lastMove: game.lastMove,
    updatedAt: game.updatedAt,
  }
}

function finishIfWon(game) {
  const remaining = Object.fromEntries(['red', 'blue'].map(side => [
    side,
    game.eggs.filter(egg => egg.side === side && egg.status !== 'captured'),
  ]))
  if (remaining.red.length === 1 && remaining.blue.length === 1) {
    for (const side of ['red', 'blue']) {
      const egg = remaining[side][0]
      if (egg.status === 'hidden') {
        egg.status = 'revealed'
        game.pieces.push({ id: egg.id, animal: egg.animal, side, row: egg.row, col: egg.col })
      }
    }
  }
  game.winner = evaluateWinner(game.pieces, game.eggs)
}

function completeTurn(game, action, completedAt = new Date()) {
  game.turns += 1
  game.lastMove = action
  game.updatedAt = completedAt.toISOString()
  finishIfWon(game)
  if (game.winner) {
    game.finishedAt = completedAt.toISOString()
    return
  }
  if (game.turns >= MAX_TURNS) {
    game.winner = 'draw'
    game.finishedAt = completedAt.toISOString()
    return
  }
  game.turn = game.turn === 'red' ? 'blue' : 'red'
  game.turnStartedAt = completedAt.toISOString()
}

function randomChoice(items) {
  return items[Math.floor(Math.random() * items.length)]
}

function playTimedOutTurn(game, completedAt) {
  const hiddenEggs = game.eggs.filter(egg => egg.status === 'hidden')
  if (hiddenEggs.length) {
    const egg = randomChoice(hiddenEggs)
    egg.status = 'revealed'
    game.pieces.push({ id: egg.id, animal: egg.animal, side: egg.side, row: egg.row, col: egg.col })
    completeTurn(game, { type: 'timeout-open', eggId: egg.id, animal: egg.animal }, completedAt)
    return
  }

  const moves = game.pieces
    .filter(piece => piece.side === game.turn)
    .flatMap(piece => getLegalMoves(game.pieces, game.eggs, piece.id).map(move => ({ piece, move })))
  const captures = moves.filter(item => item.move.captureId)
  const winningCaptures = captures.filter(item => (
    combatOutcome(item.piece, game.pieces.find(piece => piece.id === item.move.captureId)) === 'attacker'
  ))
  if (winningCaptures.length) {
    const rankedCaptures = winningCaptures.map(item => ({
      ...item,
      rank: ANIMALS[game.pieces.find(piece => piece.id === item.move.captureId).animal].rank,
    }))
    const strongest = Math.max(...rankedCaptures.map(item => item.rank))
    const choice = randomChoice(rankedCaptures.filter(item => item.rank === strongest))
    const result = applyMove(game.pieces, game.eggs, choice.piece.id, choice.move.row, choice.move.col)
    game.pieces = result.pieces
    game.eggs = result.eggs
    completeTurn(game, { type: 'timeout-capture', pieceId: choice.piece.id, row: choice.move.row, col: choice.move.col, captured: result.captured?.animal ?? null, outcome: result.outcome }, completedAt)
    return
  }

  const emptyMoves = moves.filter(item => !item.move.captureId)
  if (emptyMoves.length) {
    const choice = randomChoice(emptyMoves)
    const result = applyMove(game.pieces, game.eggs, choice.piece.id, choice.move.row, choice.move.col)
    game.pieces = result.pieces
    game.eggs = result.eggs
    completeTurn(game, { type: 'timeout-move', pieceId: choice.piece.id, row: choice.move.row, col: choice.move.col }, completedAt)
    return
  }

  const equalCaptures = captures.filter(item => (
    combatOutcome(item.piece, game.pieces.find(piece => piece.id === item.move.captureId)) === 'both'
  ))
  if (equalCaptures.length) {
    const choice = randomChoice(equalCaptures)
    const result = applyMove(game.pieces, game.eggs, choice.piece.id, choice.move.row, choice.move.col)
    game.pieces = result.pieces
    game.eggs = result.eggs
    completeTurn(game, { type: 'timeout-trade', pieceId: choice.piece.id, row: choice.move.row, col: choice.move.col, captured: result.captured?.animal ?? null, outcome: result.outcome }, completedAt)
    return
  }

  if (captures.length) {
    const choice = randomChoice(captures)
    const result = applyMove(game.pieces, game.eggs, choice.piece.id, choice.move.row, choice.move.col)
    game.pieces = result.pieces
    game.eggs = result.eggs
    completeTurn(game, { type: 'timeout-sacrifice', pieceId: choice.piece.id, row: choice.move.row, col: choice.move.col, captured: result.captured?.animal ?? null, outcome: result.outcome }, completedAt)
    return
  }

  completeTurn(game, { type: 'timeout-pass' }, completedAt)
}

function advanceExpiredTurns(game) {
  if (game.winner || !game.turnStartedAt || !game.players.red || !game.players.blue) return
  const turnStart = Date.parse(game.turnStartedAt)
  const elapsed = Date.now() - turnStart
  const expired = Math.min(MAX_TURNS - game.turns, Math.floor(elapsed / (TURN_SECONDS * 1000)))
  if (expired <= 0) return
  for (let turn = 1; turn <= expired && !game.winner; turn += 1) {
    playTimedOutTurn(game, new Date(turnStart + turn * TURN_SECONDS * 1000))
  }
}

function cleanName(value) {
  return typeof value === 'string' ? value.trim().slice(0, 20) || 'ผู้เล่น' : 'ผู้เล่น'
}

function joinAnimalGame(game, name) {
  const token = randomUUID()
  game.players.red = { token, name: cleanName(name) }
  game.diceRoll = rollOpeningDie()
  game.eggs = randomOpening(game.eggs, game.diceRoll)
  game.pieces = game.eggs.filter(egg => egg.status === 'revealed').map(egg => ({ id: egg.id, animal: egg.animal, side: egg.side, row: egg.row, col: egg.col }))
  game.lastMove = { type: 'dice', count: game.diceRoll }
  game.turnStartedAt = new Date().toISOString()
  game.updatedAt = new Date().toISOString()
  return { token, game: publicGame(game, token) }
}

function joinOxGame(game, name) {
  const token = randomUUID()
  game.players.o = { token, name: cleanName(name) }
  game.turnStartedAt = new Date().toISOString()
  return { token, game: publicOxGame(game, token) }
}

app.post('/api/games', (request, response) => {
  const id = roomCode()
  const token = randomUUID()
  const game = {
    id,
    createdAt: new Date().toISOString(),
    players: { red: null, blue: { token, name: cleanName(request.body?.name) } },
    spectators: [],
    eggs: createInitialEggs(),
    pieces: [],
    turn: randomBytes(1)[0] % 2 ? 'red' : 'blue',
    winner: null,
    turns: 0,
    turnStartedAt: null,
    diceRoll: null,
    lastMove: null,
    updatedAt: new Date().toISOString(),
  }
  games.set(id, game)
  response.status(201).json({ token, game: publicGame(game, token) })
})

app.post('/api/games/quick-join', (request, response) => {
  const game = [...games.values()]
    .filter(candidate => !candidate.players.red && candidate.players.blue && !candidate.winner)
    .sort((a, b) => a.createdAt.localeCompare(b.createdAt))[0]
  if (!game) return response.status(404).json({ error: 'ยังไม่มีห้อง public ที่รอผู้เล่นอยู่ ลองสร้างห้องใหม่ก่อนได้เลย' })
  response.json(joinAnimalGame(game, request.body?.name))
})

app.post('/api/games/:id/join', (request, response) => {
  pruneExpiredWaitingRooms()
  const game = games.get(request.params.id.toUpperCase())
  if (!game) return response.status(404).json({ error: 'ไม่พบห้องนี้ ลองตรวจรหัสอีกครั้ง' })
  if (!game.players.red && game.players.blue) {
    return response.json(joinAnimalGame(game, request.body?.name))
  }
  const token = randomUUID()
  if (game.players.red && game.players.blue) {
    game.spectators ??= []
    game.spectators.push({ token, name: cleanName(request.body?.name), lastSeenAt: Date.now() })
    return response.json({ token, game: publicGame(game, token) })
  }
})

app.post('/api/games/:id/leave', (request, response) => {
  const game = games.get(request.params.id.toUpperCase())
  if (game) game.spectators = (game.spectators || []).filter(player => player.token !== request.get('x-player-token'))
  response.json({ ok: true })
})

app.delete('/api/games/:id', (request, response) => {
  const id = request.params.id.toUpperCase()
  const game = games.get(id)
  if (!game) return response.status(404).json({ error: 'ไม่พบห้องนี้ หรือห้องถูกปิดแล้ว' })
  const token = request.get('x-player-token')
  if (![game.players.blue?.token, game.players.red?.token].includes(token)) {
    return response.status(403).json({ error: 'เฉพาะผู้เล่นในห้องเท่านั้นที่ปิดห้องได้' })
  }
  games.delete(id)
  closedRooms.set(id, Date.now())
  response.json({ ok: true })
})

app.get('/api/games/open', (_request, response) => {
  pruneExpiredWaitingRooms()
  const rooms = [...games.values()]
    .filter(game => game.players.blue)
    .sort((a, b) => Date.parse(a.createdAt || 0) - Date.parse(b.createdAt || 0))
    .map(game => ({ id: game.id, hostName: game.players.blue.name, createdAt: game.createdAt, status: game.winner ? 'finished' : game.players.red ? 'playing' : 'waiting', spectators: countActiveSpectators(game) }))
  response.json(rooms)
})

app.get('/api/games/:id', (request, response) => {
  pruneExpiredWaitingRooms()
  const game = games.get(request.params.id.toUpperCase())
  if (!game) return response.status(closedRooms.has(request.params.id.toUpperCase()) ? 410 : 404).json({ error: closedRooms.has(request.params.id.toUpperCase()) ? 'ผู้เล่นออกจากห้อง ห้องนี้ถูกปิดแล้ว' : 'ไม่พบห้องนี้ หรือห้องหมดอายุแล้ว' })
  advanceExpiredTurns(game)
  touchSpectator(game, request.get('x-player-token'))
  const snapshot = publicGame(game, request.get('x-player-token'))
  if (!snapshot) return response.status(403).json({ error: 'รหัสผู้เล่นไม่ถูกต้อง' })
  response.json(snapshot)
})

app.post('/api/games/:id/open', (request, response) => {
  const game = games.get(request.params.id.toUpperCase())
  if (!game) return response.status(404).json({ error: 'ไม่พบห้องนี้ หรือห้องหมดอายุแล้ว' })
  advanceExpiredTurns(game)
  const snapshot = publicGame(game, request.get('x-player-token'))
  if (!snapshot) return response.status(403).json({ error: 'รหัสผู้เล่นไม่ถูกต้อง' })
  if (snapshot.status !== 'playing') return response.status(409).json({ error: 'รอผู้เล่นอีกฝ่ายเข้าห้องก่อนนะ' })
  if (game.winner) return response.status(409).json({ error: 'เกมจบแล้ว' })
  if (snapshot.side !== game.turn) return response.status(409).json({ error: 'ยังไม่ถึงตาของคุณ' })
  const egg = game.eggs.find(item => item.id === request.body?.eggId)
  if (!egg || egg.status !== 'hidden') {
    return response.status(400).json({ error: 'เลือกไข่ที่ยังไม่ถูกเปิด' })
  }
  egg.status = 'revealed'
  game.pieces.push({ id: egg.id, animal: egg.animal, side: egg.side, row: egg.row, col: egg.col })
  completeTurn(game, { type: 'open', eggId: egg.id, animal: egg.animal })
  game.updatedAt = new Date().toISOString()
  response.json(publicGame(game, request.get('x-player-token')))
})

app.post('/api/games/:id/moves', (request, response) => {
  const game = games.get(request.params.id.toUpperCase())
  if (!game) return response.status(404).json({ error: 'ไม่พบห้องนี้ หรือห้องหมดอายุแล้ว' })
  advanceExpiredTurns(game)
  const snapshot = publicGame(game, request.get('x-player-token'))
  if (!snapshot) return response.status(403).json({ error: 'รหัสผู้เล่นไม่ถูกต้อง' })
  if (snapshot.status !== 'playing') return response.status(409).json({ error: 'รอผู้เล่นอีกฝ่ายเข้าห้องก่อนนะ' })
  if (game.winner) return response.status(409).json({ error: 'เกมจบแล้ว' })
  if (snapshot.side !== game.turn) return response.status(409).json({ error: 'ยังไม่ถึงตาของคุณ' })
  const { pieceId, row, col } = request.body ?? {}
  const result = applyMove(game.pieces, game.eggs, pieceId, row, col)
  if (!result) return response.status(400).json({ error: 'เดินแบบนี้ไม่ได้ ลองเลือกช่องที่ถูกกติกา' })
  game.pieces = result.pieces
  game.eggs = result.eggs
  completeTurn(game, { type: 'move', pieceId, row, col, captured: result.captured?.animal ?? null, outcome: result.outcome, attackerLost: result.attackerLost, bothLost: result.bothLost })
  game.updatedAt = new Date().toISOString()
  response.json(publicGame(game, request.get('x-player-token')))
})

app.post('/api/ox/games', (request, response) => {
  const id = roomCode()
  const token = randomUUID()
  const game = {
    id,
    createdAt: new Date().toISOString(),
    players: { x: { token, name: cleanName(request.body?.name) }, o: null },
    spectators: [],
    cells: Array.from({ length: 9 }, () => []),
    inventories: { x: { small: 3, medium: 3, large: 2 }, o: { small: 3, medium: 3, large: 2 } },
    turn: 'x',
    winner: null,
    turns: 0,
    turnStartedAt: null,
    lastMove: null,
  }
  oxGames.set(id, game)
  response.status(201).json({ token, game: publicOxGame(game, token) })
})

app.post('/api/ox/games/quick-join', (request, response) => {
  const game = [...oxGames.values()]
    .filter(candidate => !candidate.players.o && candidate.players.x && !candidate.winner)
    .sort((a, b) => a.createdAt.localeCompare(b.createdAt))[0]
  if (!game) return response.status(404).json({ error: 'ยังไม่มีห้อง public ที่รอผู้เล่นอยู่ ลองสร้างห้องใหม่ก่อนได้เลย' })
  response.json(joinOxGame(game, request.body?.name))
})

app.post('/api/ox/games/:id/join', (request, response) => {
  pruneExpiredWaitingRooms()
  const game = oxGames.get(request.params.id.toUpperCase())
  if (!game) return response.status(404).json({ error: 'ไม่พบห้อง OX นี้ ตรวจรหัสอีกครั้ง' })
  if (!game.players.o && game.players.x) {
    return response.json(joinOxGame(game, request.body?.name))
  }
  const token = randomUUID()
  if (game.players.o) {
    game.spectators.push({ token, name: cleanName(request.body?.name), lastSeenAt: Date.now() })
    return response.json({ token, game: publicOxGame(game, token) })
  }
})

app.post('/api/ox/games/:id/leave', (request, response) => {
  const game = oxGames.get(request.params.id.toUpperCase())
  if (game) game.spectators = (game.spectators || []).filter(player => player.token !== request.get('x-player-token'))
  response.json({ ok: true })
})

app.delete('/api/ox/games/:id', (request, response) => {
  const id = request.params.id.toUpperCase()
  const game = oxGames.get(id)
  if (!game) return response.status(404).json({ error: 'ไม่พบห้อง OX นี้ หรือห้องถูกปิดแล้ว' })
  const token = request.get('x-player-token')
  if (![game.players.x?.token, game.players.o?.token].includes(token)) {
    return response.status(403).json({ error: 'เฉพาะผู้เล่นในห้องเท่านั้นที่ปิดห้องได้' })
  }
  oxGames.delete(id)
  closedRooms.set(id, Date.now())
  response.json({ ok: true })
})

app.get('/api/ox/games/open', (_request, response) => {
  pruneExpiredWaitingRooms()
  const rooms = [...oxGames.values()]
    .filter(game => game.players.x)
    .sort((a, b) => Date.parse(a.createdAt || 0) - Date.parse(b.createdAt || 0))
    .map(game => ({ id: game.id, hostName: game.players.x.name, createdAt: game.createdAt, status: game.winner ? 'finished' : game.players.o ? 'playing' : 'waiting', spectators: countActiveSpectators(game) }))
  response.json(rooms)
})

app.get('/api/ox/games/:id', (request, response) => {
  pruneExpiredWaitingRooms()
  const game = oxGames.get(request.params.id.toUpperCase())
  if (!game) return response.status(closedRooms.has(request.params.id.toUpperCase()) ? 410 : 404).json({ error: closedRooms.has(request.params.id.toUpperCase()) ? 'ผู้เล่นออกจากห้อง ห้องนี้ถูกปิดแล้ว' : 'ไม่พบห้อง OX นี้ หรือห้องหมดอายุแล้ว' })
  advanceExpiredOxTurns(game)
  touchSpectator(game, request.get('x-player-token'))
  const snapshot = publicOxGame(game, request.get('x-player-token'))
  if (!snapshot) return response.status(403).json({ error: 'รหัสผู้เล่นไม่ถูกต้อง' })
  response.json(snapshot)
})

app.post('/api/ox/games/:id/move', (request, response) => {
  const game = oxGames.get(request.params.id.toUpperCase())
  if (!game) return response.status(404).json({ error: 'ไม่พบห้อง OX นี้ หรือห้องหมดอายุแล้ว' })
  advanceExpiredOxTurns(game)
  const snapshot = publicOxGame(game, request.get('x-player-token'))
  if (!snapshot) return response.status(403).json({ error: 'รหัสผู้เล่นไม่ถูกต้อง' })
  if (snapshot.status !== 'playing') return response.status(409).json({ error: 'รอผู้เล่นอีกฝ่ายเข้าห้องก่อนนะ' })
  if (game.winner) return response.status(409).json({ error: 'เกมจบแล้ว' })
  if (snapshot.side !== game.turn) return response.status(409).json({ error: 'ยังไม่ถึงเทิร์นของคุณ' })
  const { cell, size } = request.body ?? {}
  if (!Number.isInteger(cell) || cell < 0 || cell > 8 || !Object.hasOwn(OX_SIZE_RANK, size)) {
    return response.status(400).json({ error: 'เลือกหมากและช่องบนกระดานให้ถูกต้อง' })
  }
  if (!game.inventories[game.turn][size]) return response.status(400).json({ error: 'หมากขนาดนี้ถูกใช้หมดแล้ว' })
  const stack = game.cells[cell]
  const top = stack.at(-1)
  if (top?.side === game.turn) return response.status(400).json({ error: 'วางทับหมากของตัวเองไม่ได้' })
  if (top && OX_SIZE_RANK[size] <= OX_SIZE_RANK[top.size]) return response.status(400).json({ error: 'ต้องใช้หมากที่ใหญ่กว่าจึงจะกินได้' })
  game.inventories[game.turn][size] -= 1
  stack.push({ side: game.turn, size, id: randomUUID() })
  completeOxTurn(game, new Date(), { type: 'place', cell, side: game.turn, size, captured: top?.size ?? null })
  response.json(publicOxGame(game, request.get('x-player-token')))
})

app.get('/api/health', (_request, response) => {
  const connected = mongoose.connection.readyState === 1
  response.status(200).json({
    api: 'ok',
    database: connected ? 'connected' : 'disconnected',
  })
})

app.get('/api/notes', async (_request, response, next) => {
  try {
    response.json(await Note.find().sort({ createdAt: -1 }).lean())
  } catch (error) {
    next(error)
  }
})

app.post('/api/notes', async (request, response, next) => {
  try {
    const text = typeof request.body?.text === 'string' ? request.body.text.trim() : ''
    if (!text || text.length > 500) {
      return response.status(400).json({ error: 'ข้อความต้องมีความยาว 1–500 ตัวอักษร' })
    }
    response.status(201).json(await Note.create({ text }))
  } catch (error) {
    next(error)
  }
})

// In production, the same persistent server serves the built Vue app and API.
// Keep unknown /api routes as API 404s instead of returning the SPA document.
app.use((request, response, next) => {
  if (request.method !== 'GET' || request.path === '/api' || request.path.startsWith('/api/')) return next()
  response.sendFile(join(clientDist, 'index.html'))
})

app.use((error, _request, response, _next) => {
  console.error(error)
  response.status(500).json({ error: 'เกิดข้อผิดพลาดใน API' })
})

app.listen(port, '0.0.0.0', () => console.log(`Server listening on port ${port}`))

if (process.env.MONGODB_URI) {
  mongoose.connect(process.env.MONGODB_URI)
    .then(() => console.log('Connected to MongoDB'))
    .catch(error => console.error('MongoDB connection failed:', error.message))
} else {
  console.warn('MONGODB_URI is missing. Add it to .env to connect MongoDB.')
}
