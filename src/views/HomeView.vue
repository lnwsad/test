<script setup>
import { computed, onBeforeUnmount, ref } from 'vue'
import { ANIMALS, ANIMAL_ORDER, BOARD_HEIGHT, BOARD_WIDTH, MAX_TURNS, TURN_SECONDS, getLegalMoves } from '../game/rules.js'
import { createGame, getGame, joinGame, openGameEgg, sendGameMove } from '../services/api.js'
import AnimalArt from '../components/AnimalArt.vue'

const playerName = ref(localStorage.getItem('jungle-player-name') || '')
const roomCodeInput = ref('')
const game = ref(null)
const playerToken = ref('')
const busy = ref(false)
const errorMessage = ref('')
const notice = ref('')
const selectedId = ref(null)
const now = ref(Date.now())
let pollTimer
const clockTimer = setInterval(() => { now.value = Date.now() }, 250)

const isSpectator = computed(() => game.value?.spectator === true)
const viewerSide = computed(() => game.value?.side || 'blue')
const turnDeadline = computed(() => game.value?.turnStartedAt ? Date.parse(game.value.turnStartedAt) + TURN_SECONDS * 1000 : 0)
const secondsLeft = computed(() => turnDeadline.value ? Math.max(0, Math.ceil((turnDeadline.value - now.value) / 1000)) : TURN_SECONDS)
const isMyTurn = computed(() => !isSpectator.value && game.value?.status === 'playing' && !game.value?.winner && game.value?.turn === viewerSide.value && secondsLeft.value > 0)
const isOpponentTurn = computed(() => !isSpectator.value && game.value?.status === 'playing' && !game.value?.winner && game.value?.turn !== viewerSide.value)
const selectedPiece = computed(() => game.value?.pieces.find(piece => piece.id === selectedId.value) || null)
const legalMoves = computed(() => selectedPiece.value && isMyTurn.value ? getLegalMoves(game.value.pieces, game.value.eggs, selectedId.value) : [])
const moveHint = computed(() => !selectedPiece.value
  ? 'แตะหมากของคุณเพื่อดูช่องว่างหรือหมากที่เดินไปชนได้'
  : legalMoves.value.length
    ? 'แตะช่องที่มีแสง เพื่อเดินหรือกิน'
    : 'รอบหมากยังไม่มีช่องว่างหรือหมากศัตรูที่ชนได้ ลองเปิดไข่เพิ่ม')
const boardRows = computed(() => Array.from({ length: BOARD_HEIGHT }, (_, i) => viewerSide.value === 'red' ? BOARD_HEIGHT - 1 - i : i))
const boardCols = computed(() => Array.from({ length: BOARD_WIDTH }, (_, i) => viewerSide.value === 'red' ? BOARD_WIDTH - 1 - i : i))
const ownRevealed = computed(() => game.value?.eggs.filter(egg => egg.side === viewerSide.value && egg.status !== 'hidden').length || 0)
const rivalRevealed = computed(() => game.value?.eggs.filter(egg => egg.side && egg.side !== viewerSide.value && egg.status !== 'hidden').length || 0)
const statusText = computed(() => {
  if (!game.value) return ''
  if (game.value.winner === 'draw') return 'เสมอกัน!'
  if (game.value.winner) return isSpectator.value ? `${game.value.players[game.value.winner]} ชนะการแข่งขัน` : game.value.winner === viewerSide.value ? 'คุณชนะ!' : 'อีกฝ่ายชนะเกมนี้'
  if (game.value.status === 'waiting') return 'รอเพื่อนเข้าห้อง ส่งรหัสชวนให้เพื่อนได้เลย'
  if (isSpectator.value) return `โหมดผู้ชม · ถึงเทิร์น${game.value.players[game.value.turn] || 'ผู้เล่น'}แล้ว`
  if (!secondsLeft.value) return 'หมดเวลา ระบบกำลังเล่นแทนให้อัตโนมัติ…'
  return isMyTurn.value ? 'ตาคุณแล้ว เลือกเปิดไข่หรือเดินสัตว์' : `รอ${game.value.players[game.value.turn] || 'คู่แข่ง'}เดิน...`
})
const lastActionText = computed(() => {
  const action = game.value?.lastMove
  if (action?.type === 'dice') return `ทอยได้ ${action.count} · เปิดไข่สุ่ม ${action.count} ฟอง`
  if (action?.type === 'open') return `${game.value.players[game.value.turn === 'red' ? 'blue' : 'red'] || 'ผู้เล่น'} เปิดไข่เป็น${ANIMALS[action.animal]?.name || 'สัตว์'}`
  if (action?.type === 'move' && action.bothLost) return 'ค่าหมากเท่ากัน · หายทั้งคู่'
  if (action?.type === 'move' && action.attackerLost) return 'เดินเข้าหาตัวที่ใหญ่กว่า · หมากผู้เดินหายไป'
  if (action?.type === 'move' && action.captured) return `กิน${ANIMALS[action.captured]?.name || 'สัตว์'}!`
  if (action?.type === 'timeout-open') return `หมดเวลา · ระบบสุ่มเปิดไข่เป็น${ANIMALS[action.animal]?.name || 'สัตว์'}`
  if (action?.type === 'timeout-capture') return `หมดเวลา · ระบบเลือกกิน${ANIMALS[action.captured]?.name || 'สัตว์'}ที่กินได้คุ้มที่สุด`
  if (action?.type === 'timeout-trade') return 'หมดเวลา · ระบบแลกหมากค่าพลังเท่ากัน'
  if (action?.type === 'timeout-sacrifice') return `หมดเวลา · ระบบยอมแลกหมากกับ${ANIMALS[action.captured]?.name || 'สัตว์ที่ใหญ่กว่า'}`
  if (action?.type === 'timeout-move') return 'หมดเวลา · ระบบสุ่มเดินสัตว์แทน'
  if (action?.type === 'timeout-pass') return 'หมดเวลา · ไม่มีทางเดิน ระบบผ่านเทิร์น'
  return 'หนึ่งเทิร์นเดินหรือเปิดไข่'
})

function cellPiece(row, col) {
  return game.value?.pieces.find(piece => piece.row === row && piece.col === col)
}

function cellEgg(row, col) {
  return game.value?.eggs.find(egg => egg.row === row && egg.col === col)
}

function hasMove(row, col) {
  return legalMoves.value.some(move => move.row === row && move.col === col)
}

function saveCredentials(payload) {
  game.value = payload.game
  playerToken.value = payload.token
  selectedId.value = null
  localStorage.setItem('jungle-player-name', playerName.value.trim() || 'ผู้เล่น')
  sessionStorage.setItem('jungle-active-game', JSON.stringify({ id: payload.game.id, token: payload.token }))
  clearInterval(pollTimer)
  pollTimer = setInterval(refreshGame, 1100)
  errorMessage.value = ''
  notice.value = ''
}

async function createRoom() {
  if (busy.value) return
  busy.value = true
  errorMessage.value = ''
  try { saveCredentials(await createGame(playerName.value)) }
  catch (error) { errorMessage.value = error.message }
  finally { busy.value = false }
}

async function joinRoom() {
  if (busy.value) return
  const id = roomCodeInput.value.trim().toUpperCase()
  if (id.length !== 5) { errorMessage.value = 'กรอกรหัสห้อง 5 ตัวที่เพื่อนส่งให้ก่อนนะ'; return }
  busy.value = true
  errorMessage.value = ''
  try {
    saveCredentials(await joinGame(id, playerName.value))
    roomCodeInput.value = ''
  } catch (error) { errorMessage.value = error.message }
  finally { busy.value = false }
}

async function refreshGame() {
  if (!game.value || !playerToken.value) return
  try {
    game.value = await getGame(game.value.id, playerToken.value)
    if (game.value.winner) clearInterval(pollTimer)
  } catch (error) {
    errorMessage.value = error.message
    clearInterval(pollTimer)
  }
}

async function copyRoomCode() {
  try {
    await navigator.clipboard.writeText(game.value.id)
    notice.value = 'คัดลอกรหัสแล้ว ส่งให้เพื่อนเข้าห้องได้เลย'
  } catch { notice.value = `รหัสห้อง: ${game.value.id}` }
}

async function perform(action) {
  if (busy.value || !isMyTurn.value) return
  busy.value = true
  errorMessage.value = ''
  try {
    const result = action.type === 'open'
      ? await openGameEgg(game.value.id, playerToken.value, action.eggId)
      : await sendGameMove(game.value.id, playerToken.value, action)
    game.value = result
    selectedId.value = null
    if (result.winner) clearInterval(pollTimer)
  } catch (error) {
    errorMessage.value = error.message
    await refreshGame()
  } finally { busy.value = false }
}

async function clickCell(row, col) {
  if (!game.value || !isMyTurn.value || busy.value) return
  const egg = cellEgg(row, col)
  const piece = cellPiece(row, col)
  if (egg?.status === 'hidden') {
    await perform({ type: 'open', eggId: egg.id })
    return
  }
  if (selectedId.value && hasMove(row, col)) {
    await perform({ type: 'move', pieceId: selectedId.value, row, col })
    return
  }
  if (piece?.side === viewerSide.value) {
    selectedId.value = selectedId.value === piece.id ? null : piece.id
    return
  }
  selectedId.value = null
}

function leaveRoom() {
  clearInterval(pollTimer)
  game.value = null
  playerToken.value = ''
  selectedId.value = null
  sessionStorage.removeItem('jungle-active-game')
  errorMessage.value = ''
  notice.value = ''
}

const savedGame = sessionStorage.getItem('jungle-active-game')
if (savedGame) {
  try {
    const saved = JSON.parse(savedGame)
    playerToken.value = saved.token
    getGame(saved.id, saved.token).then(snapshot => {
      game.value = snapshot
      if (!snapshot.winner) pollTimer = setInterval(refreshGame, 1100)
    }).catch(() => sessionStorage.removeItem('jungle-active-game'))
  } catch { sessionStorage.removeItem('jungle-active-game') }
}

onBeforeUnmount(() => {
  clearInterval(pollTimer)
  clearInterval(clockTimer)
})
</script>

<template>
  <section class="jungle-page simple-game">
    <header class="jungle-hero">
      <div class="hero-copy">
        <span class="eyebrow">เกมสัตว์ปริศนา · แข่งกัน 2 คน</span>
        <h1>เปิดไข่<span>ชิงเจ้า</span></h1>
        <p>16 ฟอง · กระดาน 4×4 · ทุกเทิร์นมีเวลา 15 วินาที</p>
        <div class="hero-tags"><span>🎲 ทอยครั้งเดียวก่อนเริ่ม</span><span>🏁 ไม่เกิน 60 เทิร์น</span></div>
      </div>
      <div class="hero-art" aria-hidden="true"><span class="art-sun">◉</span><span class="art-animal">🥚</span><span class="art-spark">✦</span></div>
    </header>

    <section v-if="!game" class="lobby-card">
      <div class="lobby-heading"><span class="lobby-icon">⚔</span><div><h2>เริ่มเกมกับเพื่อน</h2><p>สร้างห้องใหม่แล้วแชร์รหัส 5 ตัวให้คู่แข่ง</p></div></div>
      <label class="field-label" for="player-name">ชื่อผู้เล่น</label>
      <input id="player-name" v-model="playerName" class="lobby-input" maxlength="20" placeholder="เช่น เจ้าป่ามือใหม่" autocomplete="nickname" />
      <div class="lobby-actions">
        <button class="create-button" type="button" :disabled="busy" @click="createRoom"><span>＋</span> สร้างห้องแข่ง <span class="button-arrow">↗</span></button>
        <div class="join-control"><input v-model="roomCodeInput" class="lobby-input code-input" maxlength="5" placeholder="รหัส 5 ตัว" aria-label="รหัสห้อง" @keyup.enter="joinRoom" /><button class="join-button" type="button" :disabled="busy" @click="joinRoom">เข้าห้อง <span>→</span></button></div>
      </div>
      <p v-if="errorMessage" class="error-message" role="alert">{{ errorMessage }}</p>
    </section>

    <section v-else class="match-layout simple-match">
      <div class="match-topline"><button class="back-button" type="button" @click="leaveRoom">← ออกจากห้อง</button><span class="room-badge"><span class="live-dot"></span> ห้อง {{ game.id }}</span></div>
      <div class="match-grid">
        <div class="board-wrap">
          <div v-if="isSpectator" class="player-strip opponent-strip" :class="{ 'active-turn-strip': game.turn === 'red' }"><span class="player-avatar red-avatar">🔴</span><div><strong>{{ game.players.red || 'ฝั่งแดง' }}</strong><small>ฝั่งแดง · เปิดเผยแล้ว {{ rivalRevealed }} / 8 ตัว</small></div><span v-if="game.turn === 'red' && !game.winner" class="turn-chip spectator-turn-chip">กำลังเล่น</span></div>
          <div v-else class="player-strip opponent-strip"><span class="player-avatar red-avatar">{{ viewerSide === 'red' ? '🔵' : '🔴' }}</span><div><strong>{{ game.players[viewerSide === 'red' ? 'blue' : 'red'] || 'รอคู่แข่ง' }}</strong><small>เปิดเผยแล้ว {{ rivalRevealed }} / 8 ตัว</small></div><span v-if="game.turn !== viewerSide && game.status === 'playing' && !game.winner" class="turn-chip opponent-turn">เทิร์นคู่แข่ง</span></div>
          <div class="board-frame simple-board-frame"><div class="jungle-board egg-board" :class="{ 'board-my-turn': isMyTurn, 'board-opponent-turn': isOpponentTurn }" role="grid" aria-label="กระดาน 4 คูณ 4 มีไข่ซ่อนอยู่">
            <template v-for="row in boardRows" :key="row"><button v-for="col in boardCols" :key="`${row}-${col}`" class="board-cell egg-cell" :class="{ 'egg-hidden': cellEgg(row, col)?.status === 'hidden', 'egg-empty': cellEgg(row, col)?.status === 'captured', 'valid-move': hasMove(row, col), selected: selectedId === cellPiece(row, col)?.id }" :aria-label="cellPiece(row, col) ? `${ANIMALS[cellPiece(row, col).animal].name} ${cellPiece(row, col).side === viewerSide ? 'ของคุณ' : 'คู่แข่ง'}` : cellEgg(row, col)?.status === 'hidden' ? 'ไข่ที่ยังไม่เปิด' : 'ช่องว่าง'" role="gridcell" @click="clickCell(row, col)">
              <span v-if="cellEgg(row, col)?.status === 'hidden'" class="egg-art">🥚<small>แตะเพื่อเปิด</small></span>
              <span v-else-if="cellPiece(row, col)" class="animal-piece" :class="[cellPiece(row, col).side, { 'piece-selected': selectedId === cellPiece(row, col).id }]" :title="`${ANIMALS[cellPiece(row, col).animal].name} · ค่า ${ANIMALS[cellPiece(row, col).animal].rank}`"><AnimalArt :animal="cellPiece(row, col).animal"/><span class="animal-label">{{ ANIMALS[cellPiece(row, col).animal].name }}</span><span class="piece-rank">{{ ANIMALS[cellPiece(row, col).animal].rank }}</span></span>
              <span v-if="hasMove(row, col) && !cellPiece(row, col)" class="move-dot"></span><span v-if="hasMove(row, col) && cellPiece(row, col)" class="capture-ring"></span>
            </button></template>
          </div></div>
          <div class="player-strip self-strip" :class="{ 'active-turn-strip': isSpectator && game.turn === 'blue' }"><span class="player-avatar blue-avatar">{{ viewerSide === 'blue' ? '🔵' : '🔴' }}</span><div><strong>{{ game.players[viewerSide] || 'ฝั่งน้ำเงิน' }} <span v-if="!isSpectator" class="you-label">(คุณ)</span></strong><small>{{ isSpectator ? 'ฝั่งน้ำเงิน · ' : '' }}เปิดเผยแล้ว {{ ownRevealed }} / 8 ตัว</small></div><span v-if="isMyTurn" class="turn-chip my-turn">ตาคุณ</span><span v-else-if="isSpectator && game.turn === 'blue' && !game.winner" class="turn-chip spectator-turn-chip">กำลังเล่น</span></div>
        </div>

        <aside class="game-sidebar">
          <article class="turn-card timer-card" :class="{ 'timer-low': secondsLeft <= 5 && !game.winner, 'turn-card-won': game.winner, 'my-turn-card': isMyTurn, 'opponent-turn-card': isOpponentTurn }"><span class="timer-value">{{ game.winner ? (game.winner === 'draw' ? '＝' : '🏆') : game.status === 'waiting' ? '…' : secondsLeft }}</span><small v-if="game.status === 'playing' && !game.winner" class="timer-unit">วินาที</small><div class="timer-copy"><strong>{{ statusText }}</strong><small v-if="game.status === 'playing' && !game.winner">เทิร์น {{ game.turns }} / {{ MAX_TURNS }}</small><small v-else-if="game.status === 'waiting'">เวลาเริ่มเมื่ออีกฝ่ายเข้าห้อง</small><small v-else-if="game.winner === 'draw'">ครบ 60 เทิร์นหรือค่าตัวสุดท้ายเท่ากัน</small></div></article>
          <article class="dice-card" :class="{ 'dice-waiting': game.diceRoll == null }"><span class="eyebrow">{{ game.diceRoll == null ? 'รอผู้เล่นครบสองคน' : 'ทอยลูกเต๋าเริ่มเกม' }}</span><div class="dice-result"><span>🎲</span><strong>{{ game.diceRoll ?? '—' }}</strong><p v-if="game.diceRoll != null">สุ่มเปิดไข่<br /><b>{{ game.diceRoll }} ฟอง</b></p><p v-else>เข้าห้องครบแล้ว<br /><b>จึงเริ่มทอย</b></p></div><small>{{ game.diceRoll == null ? 'ยังไม่เริ่มนับเวลาเทิร์น' : 'เปิดจากทั้งกระดาน ไม่มีไข่ซ้ำ' }}</small></article>
          <article class="invite-card"><span class="eyebrow">MATCH ROOM</span><h3>{{ isSpectator ? 'กำลังรับชมการแข่งขัน' : game.status === 'waiting' ? 'ชวนเพื่อนเข้าประลอง' : 'รหัสห้อง' }}</h3><p>{{ isSpectator ? lastActionText : game.status === 'waiting' ? 'ส่งรหัสนี้ให้เพื่อนเพื่อเริ่มเล่น' : lastActionText }}</p><button class="room-code-button" type="button" @click="copyRoomCode"><span>{{ game.id }}</span><small>คัดลอก ↗</small></button><small v-if="game.status === 'playing' && !isSpectator" class="spectator-note">ผู้ที่เข้าห้องหลังผู้เล่นครบ จะเข้าชมในโหมดผู้ชม</small></article>
          <p v-if="notice" class="notice-message" aria-live="polite">{{ notice }}</p>
          <article class="how-card"><span class="eyebrow">ในเทิร์นของคุณ</span><div class="how-row"><span class="how-number">01</span><p>ไข่เหมือนกันทุกฟอง เลือกเปิดได้ทุกช่อง</p></div><div class="how-row"><span class="how-number">02</span><p>แตะสัตว์แล้วเลือกช่องข้าง ๆ เพื่อเดินหรือกิน</p></div><div class="rat-rule"><span>🐭</span><p><strong>หนูกินช้างได้</strong><br />ช้างกินหนูไม่ได้</p></div></article>
          <p v-if="errorMessage" class="error-message" role="alert">{{ errorMessage }}</p>
          <p class="board-hint">{{ moveHint }} · ทุกการเปิด เดิน หรือกินใช้หนึ่งเทิร์น</p>
        </aside>
      </div>
    </section>

    <section v-if="!game" class="rules-section animal-rank-section"><div class="rules-title"><div><span class="eyebrow">ลำดับพลังสัตว์</span><h2>เปิดสมุดภาพเจ้าป่า</h2></div><span class="rules-caption">ตัวใหญ่กินตัวเล็ก</span></div>
      <div class="animal-ranks"><article v-for="animal in ANIMAL_ORDER" :key="animal" class="rank-card" :class="`rank-${ANIMALS[animal].rank}`"><span class="rank-number">{{ ANIMALS[animal].rank }}</span><AnimalArt :animal="animal"/><strong>{{ ANIMALS[animal].name }}</strong><small>{{ animal === 'rat' ? 'ชนะช้างได้!' : animal === 'elephant' ? 'แพ้หนู' : `กินระดับ ${ANIMALS[animal].rank - 1} ลงไป` }}</small></article></div>
      <p class="rule-note"><span>🏆</span> กินสัตว์อีกฝ่ายหมด หรือเมื่อเหลือฝ่ายละ 1 ตัวเท่ากัน ให้วัดค่าตัวสุดท้าย · เท่ากันเสมอ · ครบ 60 เทิร์นเสมอ</p>
    </section>
    <footer class="jungle-footer">เปิดไข่ให้ทัน คิดให้ไวใน 15 วินาที</footer>
  </section>
</template>
