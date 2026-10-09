<script setup>
import { computed, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import { closeOxGame, createOxGame, getOpenOxGames, getOxGame, joinOxGame, leaveOxGame, playOxCell, quickJoinOxGame } from '../services/ox.js'
import OxEgg from '../components/OxEgg.vue'
import { getPagePlayerName, setPagePlayerName } from '../services/playerName.js'

const SIZE_ORDER = ['small', 'medium', 'large']
const SIZE_LABEL = { small: 'เล็ก', medium: 'กลาง', large: 'ใหญ่' }
const SIZE_RANK = { small: 1, medium: 2, large: 3 }
const OX_TURN_SECONDS = 30
const playerName = ref(getPagePlayerName())
watch(playerName, setPagePlayerName)
const roomCodeInput = ref('')
const openRooms = ref([])
const roomsLoading = ref(true)
const game = ref(null)
const playerToken = ref('')
const busy = ref(false)
const errorMessage = ref('')
const notice = ref('')
const selectedSize = ref(null)
const now = ref(Date.now())
const winnerPopupDismissed = ref(false)
const showExitConfirm = ref(false)
const roomClosedMessage = ref('')
let pollTimer
let roomsTimer
const clockTimer = setInterval(() => { now.value = Date.now() }, 250)
watch([now, game], () => {
  if (game.value && ((game.value.winner && roomSecondsLeft.value <= 0) || (game.value.status === 'waiting' && roomSecondsLeft.value <= 0))) leaveRoom()
})

const spectator = computed(() => game.value?.spectator === true)
const preparationSeconds = computed(() => game.value?.status === 'playing' && game.value.turnStartedAt
  ? Math.max(0, Math.ceil((Date.parse(game.value.turnStartedAt) - now.value) / 1000))
  : 0)
const secondsLeft = computed(() => game.value?.turnStartedAt
  ? Math.min(game.value.turnSeconds || OX_TURN_SECONDS, Math.max(0, Math.ceil((Date.parse(game.value.turnStartedAt) + (game.value.turnSeconds || OX_TURN_SECONDS) * 1000 - now.value) / 1000)))
  : OX_TURN_SECONDS)
const roomSecondsLeft = computed(() => {
  if (!game.value) return 0
  const start = game.value.winner ? game.value.finishedAt : game.value.status === 'waiting' ? game.value.createdAt : null
  return start ? Math.max(0, Math.ceil((Date.parse(start) + (game.value.winner ? 120_000 : 60_000) - now.value) / 1000)) : 0
})
const winnerName = computed(() => game.value?.winner === 'draw' ? 'เสมอกัน!' : game.value?.players?.[game.value?.winner] || 'ผู้ชนะ')
function withRoomTimestamps(snapshot, previous = null) {
  return {
    ...snapshot,
    createdAt: snapshot.createdAt || previous?.createdAt || new Date().toISOString(),
    finishedAt: snapshot.finishedAt || (snapshot.winner ? previous?.finishedAt || new Date().toISOString() : null),
  }
}
const isMyTurn = computed(() => game.value?.status === 'playing' && !game.value?.winner && preparationSeconds.value === 0 && !spectator.value && game.value?.turn === game.value?.side && secondsLeft.value > 0)
const ownSide = computed(() => spectator.value ? 'o' : game.value?.side || 'x')
const otherSide = computed(() => spectator.value ? 'x' : ownSide.value === 'x' ? 'o' : 'x')
const activePlayer = computed(() => game.value?.players[game.value?.turn] || 'ผู้เล่น')
const sideName = side => side === 'x' ? 'ไข่ขาว' : 'ไข่ดำ'
const turnAnnouncement = ref(null)
let announcementTimer
function announceTurn() {
  if (!game.value || game.value.status !== 'playing' || game.value.winner) return
  clearTimeout(announcementTimer)
  turnAnnouncement.value = {
    player: game.value.players[game.value.turn] || 'ผู้เล่น',
    side: game.value.turn,
    sideLabel: sideName(game.value.turn),
  }
  announcementTimer = setTimeout(() => { turnAnnouncement.value = null }, 1000)
}
watch(() => preparationSeconds.value, (value, previous) => {
  if (previous > 0 && value === 0) announceTurn()
})
watch(() => game.value?.turnStartedAt, (value, previous) => {
  if (value && previous && preparationSeconds.value === 0) announceTurn()
})
const ownRemaining = computed(() => SIZE_ORDER.reduce((sum, size) => sum + (game.value?.inventories[ownSide.value]?.[size] || 0), 0))
const statusText = computed(() => {
  if (!game.value) return ''
  if (game.value.winner === 'draw') return 'เสมอกัน · ทั้งสองฝ่ายเดินต่อไม่ได้'
  if (game.value.winner) return spectator.value ? `${game.value.players[game.value.winner]} ชนะการแข่งขัน!` : game.value.winner === game.value.side ? 'คุณชนะ! 🎉' : 'อีกฝ่ายชนะเกมนี้'
  if (game.value.status === 'waiting') return 'รอผู้เล่นคนที่สองเข้าห้อง'
  if (!secondsLeft.value) return 'หมดเวลา · ระบบกำลังสุ่มวางไข่ให้'
  if (game.value.lastMove?.skipped) return `${game.value.players[game.value.lastMove.skipped] || 'คู่แข่ง'} ไม่มีหมากที่เดินได้ · ข้ามเทิร์น`
  if (spectator.value) return `โหมดผู้ชม · ${activePlayer.value} ถือ${sideName(game.value.turn)}กำลังเล่น`
  return isMyTurn.value ? `ตาคุณแล้ว · วาง${sideName(game.value.side)}` : `รอ${activePlayer.value}วางไข่`
})

function rackPieces(side) {
  const inventory = game.value?.inventories[side]
  if (!inventory) return []
  return SIZE_ORDER.flatMap(size => Array.from({ length: inventory[size] }, (_, index) => ({ size, key: `${side}-${size}-${index}` })))
}

function canSelectPiece(side, size) {
  return isMyTurn.value && game.value.side === side && game.value.inventories[side][size] > 0
}

function selectPiece(side, size) {
  if (!canSelectPiece(side, size)) return
  errorMessage.value = ''
  selectedSize.value = selectedSize.value === size ? null : size
}

function canPlace(cell, size = selectedSize.value) {
  if (!game.value || !isMyTurn.value || !size || !game.value.inventories[game.value.side][size]) return false
  const top = game.value.cells[cell].at(-1)
  return !top || (top.side !== game.value.side && SIZE_RANK[size] > SIZE_RANK[top.size])
}

function dragPiece(event, side, size) {
  if (!canSelectPiece(side, size)) {
    event.preventDefault()
    return
  }
  selectedSize.value = size
  event.dataTransfer.effectAllowed = 'move'
  event.dataTransfer.setData('text/plain', size)
}

async function placePiece(cell, size = selectedSize.value) {
  if (!isMyTurn.value || busy.value) return
  if (!size) {
    notice.value = 'เลือกไข่จากแถวสำรอง แล้วลากหรือแตะช่องบนกระดาน'
    return
  }
  if (!canPlace(cell, size)) {
    notice.value = 'ลงช่องนี้ไม่ได้ · ใช้ไข่ที่ใหญ่กว่ากินไข่ฝ่ายตรงข้าม หรือเลือกช่องว่าง'
    return
  }
  busy.value = true
  errorMessage.value = ''
  notice.value = ''
  try {
    game.value = await playOxCell(game.value.id, playerToken.value, cell, size)
    selectedSize.value = null
  } catch (error) {
    errorMessage.value = error.message
    await refreshGame()
  } finally { busy.value = false }
}

function dropPiece(event, cell) {
  const size = event.dataTransfer?.getData('text/plain') || selectedSize.value
  placePiece(cell, size)
}

function saveCredentials(payload) {
  winnerPopupDismissed.value = false
  roomClosedMessage.value = ''
  game.value = withRoomTimestamps(payload.game)
  playerToken.value = payload.token
  selectedSize.value = null
  sessionStorage.setItem('ox-active-game', JSON.stringify({ id: payload.game.id, token: payload.token }))
  clearInterval(pollTimer)
  clearInterval(roomsTimer)
  roomsTimer = null
  pollTimer = setInterval(refreshGame, 1000)
  errorMessage.value = ''
  notice.value = ''
}

async function createRoom() {
  if (busy.value) return
  busy.value = true
  errorMessage.value = ''
  try { saveCredentials(await createOxGame(playerName.value)) }
  catch (error) { errorMessage.value = error.message }
  finally { busy.value = false }
}

async function quickJoinRoom() {
  if (busy.value) return
  busy.value = true
  errorMessage.value = ''
  try { saveCredentials(await quickJoinOxGame(playerName.value)) }
  catch (error) { errorMessage.value = error.message }
  finally { busy.value = false }
}

async function joinRoom() {
  if (busy.value) return
  const id = roomCodeInput.value.trim().toUpperCase()
  if (id.length !== 5) { errorMessage.value = 'กรอกรหัสห้อง 5 ตัวก่อนนะ'; return }
  busy.value = true
  errorMessage.value = ''
  try {
    saveCredentials(await joinOxGame(id, playerName.value))
    roomCodeInput.value = ''
  } catch (error) { errorMessage.value = error.message }
  finally { busy.value = false }
}

async function joinListedRoom(id) {
  if (busy.value) return
  busy.value = true
  errorMessage.value = ''
  try { saveCredentials(await joinOxGame(id, playerName.value)) }
  catch (error) { errorMessage.value = error.message; await refreshOpenRooms() }
  finally { busy.value = false }
}

async function refreshOpenRooms() {
  try { openRooms.value = await getOpenOxGames() }
  catch { openRooms.value = [] }
  finally { roomsLoading.value = false }
}

function startRoomsRefresh() {
  clearInterval(roomsTimer)
  refreshOpenRooms()
  roomsTimer = setInterval(refreshOpenRooms, 4000)
}

async function refreshGame() {
  if (!game.value || !playerToken.value) return
  try {
    const hadWinner = Boolean(game.value.winner)
    const snapshot = await getOxGame(game.value.id, playerToken.value)
    game.value = withRoomTimestamps(snapshot, game.value)
    if (game.value.winner && !hadWinner) winnerPopupDismissed.value = false
  } catch (error) {
    if (error.message.includes('ผู้เล่นออกจากห้อง')) {
      leaveRoom('ผู้เล่นออกจากห้อง ห้องนี้ถูกปิดแล้ว')
      return
    }
    errorMessage.value = error.message
    clearInterval(pollTimer)
  }
}

async function copyRoomCode() {
  try {
    await navigator.clipboard.writeText(game.value.id)
    notice.value = 'คัดลอกรหัสแล้ว ส่งให้เพื่อนได้เลย'
  } catch { notice.value = `รหัสห้อง: ${game.value.id}` }
}

function requestExit() {
  showExitConfirm.value = true
}

async function confirmExitRoom() {
  if (!game.value || !playerToken.value || busy.value) return
  busy.value = true
  errorMessage.value = ''
  try {
    if (!spectator.value) await closeOxGame(game.value.id, playerToken.value)
    showExitConfirm.value = false
    leaveRoom()
  } catch (error) {
    errorMessage.value = error.message
  } finally { busy.value = false }
}

function leaveRoom(message = '') {
  leaveSpectatorPresence()
  clearInterval(pollTimer)
  showExitConfirm.value = false
  game.value = null
  playerToken.value = ''
  selectedSize.value = null
  sessionStorage.removeItem('ox-active-game')
  errorMessage.value = ''
  notice.value = ''
  roomClosedMessage.value = message
  startRoomsRefresh()
}

function leaveSpectatorPresence() {
  if (spectator.value && game.value && playerToken.value) {
    void leaveOxGame(game.value.id, playerToken.value).catch(() => {})
  }
}

const savedGame = sessionStorage.getItem('ox-active-game')
if (savedGame) {
  try {
    const saved = JSON.parse(savedGame)
    playerToken.value = saved.token
    getOxGame(saved.id, saved.token).then(snapshot => {
      game.value = withRoomTimestamps(snapshot)
      winnerPopupDismissed.value = false
      pollTimer = setInterval(refreshGame, 1000)
    }).catch(() => sessionStorage.removeItem('ox-active-game'))
  } catch { sessionStorage.removeItem('ox-active-game') }
}

onMounted(startRoomsRefresh)

onBeforeUnmount(() => {
  leaveSpectatorPresence()
  clearInterval(pollTimer)
  clearInterval(roomsTimer)
  clearInterval(clockTimer)
  clearTimeout(announcementTimer)
})
</script>

<template>
  <section class="ox-page">
    <header class="ox-hero">
      <div><span class="eyebrow">เกมวางแผน · แข่งกัน 2 คน</span><h1>ไข่จุ๊บจิ๊บ <span>เกมเรียงสาม</span></h1><p>แต่ละฝ่ายมีไข่เล็ก 3 กลาง 3 ใหญ่ 2 · มีเวลาเทิร์นละ 30 วินาที</p></div>
      <div class="ox-hero-mark" aria-hidden="true"><OxEgg side="x" size="medium"/><OxEgg side="o" size="small"/></div>
    </header>

    <section v-if="!game" class="lobby-card ox-lobby">
      <div class="lobby-heading"><span class="lobby-icon">🥚</span><div><h2>เริ่มเกมไข่จุ๊บจิ๊บ</h2><p>สร้างห้อง public หรือเลือกเข้าห้องที่เปิดรออยู่</p></div></div>
      <div v-if="roomClosedMessage" class="room-closed-modal-backdrop" role="presentation"><section class="room-closed-modal" role="dialog" aria-modal="true" aria-labelledby="ox-closed-title"><span>📢</span><h2 id="ox-closed-title">ผู้เล่นออกจากห้อง</h2><p>ห้องนี้ถูกปิดแล้ว ทุกคนกลับมาที่ Lobby แล้ว</p><button class="join-button" type="button" @click="roomClosedMessage = ''">ตกลง</button></section></div>
      <label class="field-label" for="ox-player-name">ชื่อผู้เล่น</label>
      <input id="ox-player-name" v-model="playerName" class="lobby-input" maxlength="20" placeholder="ชื่อของคุณ" autocomplete="nickname" />
      <div class="lobby-actions lobby-actions-public">
        <button class="quick-join-button quick-join-ox" type="button" aria-label="Quick Join" :disabled="busy" @click="quickJoinRoom"><span class="quick-join-icon" aria-hidden="true">⚡</span><strong>Quick Join</strong></button>
        <button class="create-button create-public-button ox-create" type="button" :disabled="busy" @click="createRoom"><span>＋</span> สร้างห้อง public <span class="button-arrow">↗</span></button>
      </div>
      <section class="public-rooms" aria-label="ห้อง public ที่เปิดอยู่">
        <div class="public-rooms-heading"><strong>ห้อง public ที่เปิดอยู่</strong><span>{{ openRooms.length }}</span></div>
        <p v-if="roomsLoading" class="public-rooms-empty">กำลังโหลดรายการห้อง…</p>
        <p v-else-if="!openRooms.length" class="public-rooms-empty">ยังไม่มีห้องเปิดรออยู่</p>
        <div v-else class="public-room-list">
          <button v-for="room in openRooms" :key="room.id" class="public-room-item" type="button" :disabled="busy" :aria-label="`${room.status === 'waiting' ? 'เข้าร่วม' : room.status === 'finished' ? 'ดูผล' : 'รับชม'}ห้อง ${room.id} ของ ${room.hostName}`" @click="joinListedRoom(room.id)">
            <span class="public-room-host"><strong>{{ room.hostName }}</strong><small :class="`room-status-${room.status}`">{{ room.status === 'playing' ? 'กำลังแข่ง' : room.status === 'finished' ? 'จบการแข่งขัน' : 'กำลังรอผู้เล่น' }}</small><small v-if="room.status !== 'waiting'" class="room-viewer-count">ผู้ชม {{ room.spectators }} คน</small></span><span class="public-room-code">{{ room.id }}</span><span class="public-room-join">{{ room.status === 'waiting' ? 'เข้าร่วม →' : room.status === 'finished' ? 'ดูผล →' : 'รับชม →' }}</span>
          </button>
        </div>
      </section>
      <div class="join-by-code"><span>มีรหัสห้องแล้ว?</span><div class="join-control"><input v-model="roomCodeInput" class="lobby-input code-input" maxlength="5" placeholder="รหัส 5 ตัว" aria-label="รหัสห้องไข่จุ๊บจิ๊บ" @keyup.enter="joinRoom" /><button class="join-button" type="button" :disabled="busy" @click="joinRoom">เข้าห้อง <span>→</span></button></div></div>
      <p v-if="errorMessage" class="error-message" role="alert">{{ errorMessage }}</p>
    </section>

    <section v-if="!game" class="about-card rules-page-card ox-rules-card">
      <span class="eyebrow muted">กติกาก่อนเริ่มเล่น</span>
      <h2>วางไข่ซ้อน 3 × 3</h2>
      <ul class="stack-list">
        <li><span>ไข่ต่อฝ่าย</span><strong>ไข่เล็ก 3 ฟอง · ไข่กลาง 3 ฟอง · ไข่ใหญ่ 2 ฟอง รวม 8 ฟอง</strong></li>
        <li><span>วิธีวาง</span><strong>ลากไข่จากแถวสำรองลงช่องว่าง หรือแตะไข่แล้วแตะช่อง</strong></li>
        <li><span>การกิน</span><strong>ไข่ใหญ่กินไข่ฝ่ายตรงข้ามที่เล็กกว่าได้ วางทับไข่ฝ่ายเดียวกันไม่ได้</strong></li>
        <li><span>เวลาต่อเทิร์น</span><strong>30 วินาที ถ้าหมดเวลาระบบจะสุ่มเลือกไข่และสุ่มวางในช่องที่ลงได้</strong></li>
        <li><span>ชนะเกม</span><strong>เรียงไข่ชั้นบนของฝ่ายตัวเองครบ 3 ช่อง แนวนอน แนวตั้ง หรือแนวทแยง</strong></li>
        <li><span>ห้องแข่ง</span><strong>ห้องที่สร้างเป็น public และเข้าได้ด้วย Quick Join หรือรหัส ผู้ที่เข้าหลังห้องเต็มรับชมได้</strong></li>
      </ul>
    </section>

    <section v-else class="ox-match">
      <div v-if="preparationSeconds > 0" class="game-preparation" role="status" aria-live="assertive"><span>เตรียมพร้อม</span><strong>{{ preparationSeconds }}</strong><small>เกมจะเริ่มในอีก {{ preparationSeconds }} วินาที</small></div>
      <div v-if="turnAnnouncement" class="turn-announcement" :class="`turn-announcement-${turnAnnouncement.side}`" aria-live="polite"><span>ตาผู้เล่น</span><strong>{{ turnAnnouncement.player }}</strong><small>({{ turnAnnouncement.sideLabel }})</small></div>

      <div v-if="game.status === 'waiting'" class="room-expiry-banner" role="status">กำลังรอผู้เล่น · ปิดห้องใน {{ roomSecondsLeft }} วินาที</div>
      <div v-if="game.winner" class="room-expiry-banner finished-expiry-banner" role="status">ห้องจะปิดและกลับ lobby ใน {{ roomSecondsLeft }} วินาที</div>
      <div class="match-topline"><button class="back-button" type="button" @click="requestExit">← ออกจากห้อง</button><span class="room-badge"><span class="live-dot"></span> ไข่จุ๊บจิ๊บ · {{ game.id }}</span></div>
      <div class="ox-players">
        <div class="ox-player" :class="{ 'ox-player-active': game.status === 'playing' && !game.winner && game.turn === 'x' }"><OxEgg class="ox-player-art" side="x" size="medium"/><div><strong>{{ game.players.x || 'ผู้เล่นไข่ขาว' }}</strong><small>ไข่ขาว</small></div><span v-if="game.turn === 'x' && game.status === 'playing' && !game.winner" class="turn-chip my-turn">กำลังเล่น</span></div>
        <span class="ox-versus">VS</span>
        <div class="ox-player" :class="{ 'ox-player-active': game.status === 'playing' && !game.winner && game.turn === 'o' }"><OxEgg class="ox-player-art" side="o" size="medium"/><div><strong>{{ game.players.o || 'รอคู่แข่งเข้าห้อง' }}</strong><small>ไข่ดำ</small></div><span v-if="game.turn === 'o' && game.status === 'playing' && !game.winner" class="turn-chip opponent-turn">กำลังเล่น</span></div>
      </div>
      <article class="ox-status" :class="{ 'ox-status-active': isMyTurn, 'ox-status-waiting': game.status === 'waiting' }"><span class="ox-status-icon"><OxEgg v-if="game.status === 'playing' && !game.winner" :side="game.turn" size="small"/><span v-else>{{ game.winner === 'draw' ? '＝' : game.winner ? '🏆' : '⌛' }}</span></span><div><strong>{{ statusText }}</strong><small v-if="game.status === 'waiting'">แชร์รหัสให้เพื่อน แล้วเกมจะเริ่มเมื่อเขาเข้าห้อง</small><small v-else-if="!game.winner && game.lastMove?.type === 'timeout-place'">หมดเวลา · ระบบสุ่มวางไข่ให้แล้ว</small><small v-else-if="!game.winner">ใช้ไข่ไปแล้ว {{ game.turns }} / 16</small><small v-else>จบการแข่งขัน · ใช้ไข่ {{ game.turns }} ฟอง</small></div><span v-if="game.status === 'playing' && !game.winner" class="ox-countdown" :class="{ 'ox-countdown-low': secondsLeft <= 5 }">{{ secondsLeft }}<small>วิ</small></span></article>

      <section class="ox-reserve" :class="{ 'ox-reserve-active': isMyTurn && !spectator }">
        <div class="ox-reserve-heading"><strong>{{ spectator ? sideName(otherSide) : `หมากสำรอง · ${sideName(otherSide)}` }}</strong><span>{{ game.players[otherSide] || 'รอผู้เล่น' }} · เหลือ {{ Object.values(game.inventories[otherSide]).reduce((sum, count) => sum + count, 0) }}/8</span></div>
        <div class="ox-rack"><button v-for="token in rackPieces(otherSide)" :key="token.key" class="ox-token" :class="[`token-${token.size}`]" type="button" disabled :aria-label="`หมาก${SIZE_LABEL[token.size]} ${sideName(otherSide)}`"><OxEgg :side="otherSide" :size="token.size"/><small>{{ SIZE_LABEL[token.size] }}</small></button></div>
      </section>

      <div class="ox-board-frame"><div class="ox-board" role="grid" aria-label="กระดานไข่สามคูณสาม">
        <button v-for="(stack, index) in game.cells" :key="index" class="ox-cell" :class="{ 'ox-cell-playable': canPlace(index), 'ox-cell-selected-target': selectedSize && canPlace(index), 'ox-cell-last': game.lastMove?.cell === index && stack.length }" type="button" :disabled="!isMyTurn || busy" :aria-label="stack.length ? `ช่อง ${index + 1} มีไข่${SIZE_LABEL[stack.at(-1).size]} ${sideName(stack.at(-1).side)}` : `ช่อง ${index + 1} ว่าง`" role="gridcell" @click="placePiece(index)" @dragover.prevent @drop.prevent="dropPiece($event, index)">
          <OxEgg v-if="stack.length" class="ox-board-piece" :side="stack.at(-1).side" :size="stack.at(-1).size"/>
          <small v-if="stack.length" class="ox-piece-size">{{ SIZE_LABEL[stack.at(-1).size] }}</small>
          <small v-if="stack.length > 1" class="ox-stack-count">ซ้อน {{ stack.length }}</small>
          <span v-else-if="isMyTurn && selectedSize && canPlace(index)" class="ox-cell-hint">วางที่นี่</span>
        </button>
      </div></div>

      <section class="ox-reserve ox-own-reserve" :class="{ 'ox-reserve-active': isMyTurn && !spectator }">
        <div class="ox-reserve-heading"><strong>{{ spectator ? sideName(ownSide) : `หมากของคุณ · ${sideName(ownSide)}` }}</strong><span>{{ game.players[ownSide] || 'ผู้เล่น' }} · เหลือ {{ ownRemaining }}/8</span></div>
        <div class="ox-rack"><button v-for="token in rackPieces(ownSide)" :key="token.key" class="ox-token" :class="[`token-${token.size}`, { 'token-selected': selectedSize === token.size && isMyTurn }]" type="button" :disabled="!canSelectPiece(ownSide, token.size)" :draggable="canSelectPiece(ownSide, token.size)" :aria-label="`ลากหมาก${SIZE_LABEL[token.size]} ${sideName(ownSide)} ไปวาง`" @click="selectPiece(ownSide, token.size)" @dragstart="dragPiece($event, ownSide, token.size)"><OxEgg :side="ownSide" :size="token.size"/><small>{{ SIZE_LABEL[token.size] }}</small></button></div>
        <small class="ox-drag-hint">ลากไข่ไปวาง หรือแตะไข่แล้วแตะช่อง · ไข่ใหญ่กินไข่เล็กฝ่ายตรงข้าม</small>
      </section>

      <p v-if="spectator" class="ox-spectator-note">คุณกำลังรับชมการแข่งขันในโหมดผู้ชม</p>
      <p v-if="notice" class="notice-message" role="status">{{ notice }}</p>
      <article class="invite-card ox-invite"><span class="eyebrow">รหัสห้องไข่จุ๊บจิ๊บ</span><button class="room-code-button" type="button" @click="copyRoomCode"><span>{{ game.id }}</span><small>คัดลอก ↗</small></button><small v-if="game.status === 'playing' && !spectator" class="spectator-note">คนที่เข้าหลังผู้เล่นครบจะเข้าชมเกม</small></article>
      <p v-if="errorMessage" class="error-message" role="alert">{{ errorMessage }}</p>
      <div v-if="game?.winner && !winnerPopupDismissed" class="result-modal-backdrop" role="presentation">
        <section class="result-modal" role="dialog" aria-modal="true" aria-labelledby="ox-result-title">
          <span class="result-trophy">{{ game.winner === 'draw' ? '🤝' : '🏆' }}</span><span class="eyebrow">จบการแข่งขัน</span>
          <h2 id="ox-result-title">{{ winnerName }}</h2><p>{{ game.winner === 'draw' ? 'เกมนี้จบลงด้วยผลเสมอ' : 'เป็นผู้ชนะในเกมนี้' }}</p>
          <small>ห้องจะปิดอัตโนมัติใน {{ roomSecondsLeft }} วินาที</small>
          <div class="result-modal-actions"><button type="button" class="create-button" @click="leaveRoom">กลับหน้า Lobby</button><button type="button" class="join-button" @click="winnerPopupDismissed = true">ปิด popup</button></div>
        </section>
      </div>
      <div v-if="showExitConfirm" class="room-closed-modal-backdrop" role="presentation"><section class="room-closed-modal" role="dialog" aria-modal="true" aria-labelledby="ox-exit-title"><span>⚠️</span><h2 id="ox-exit-title">ยืนยันออกจากห้อง?</h2><p>{{ spectator ? 'คุณจะออกจากการรับชมการแข่งขันนี้' : 'ห้องจะถูกปิด และผู้เล่นกับผู้ชมทุกคนจะกลับไป Lobby' }}</p><small v-if="errorMessage" class="error-message" role="alert">{{ errorMessage }}</small><div class="result-modal-actions"><button class="join-button" type="button" :disabled="busy" @click="showExitConfirm = false">ยกเลิก</button><button class="create-button" type="button" :disabled="busy" @click="confirmExitRoom">{{ busy ? 'กำลังปิดห้อง…' : spectator ? 'ยืนยันออก' : 'ยืนยันปิดห้อง' }}</button></div></section></div>
    </section>
  </section>
</template>
