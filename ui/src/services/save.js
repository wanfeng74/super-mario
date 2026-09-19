/*
 * 游戏存档 (临时关闭持久化, 只用内存)。
 * 等找到正确的 falcon 存储 API 再恢复。
 */

var SAVE_VERSION = 1
var SLOT_COUNT = 3
var _memory = null

function emptySlot() {
  return { score: 0, coins: 0, lives: 3, level: 1, time: 300, power: 'small', saveAt: 0 }
}

function normalize(d) {
  var slots = []
  for (var i = 0; i < SLOT_COUNT; i++) {
    var s = emptySlot()
    if (d && d.slots && d.slots[i] && typeof d.slots[i] === 'object') {
      var raw = d.slots[i]
      s.score = typeof raw.score === 'number' ? raw.score : 0
      s.coins = typeof raw.coins === 'number' ? raw.coins : 0
      s.lives = typeof raw.lives === 'number' ? raw.lives : 3
      s.level = typeof raw.level === 'number' ? raw.level : 1
      s.time = typeof raw.time === 'number' ? raw.time : 300
      s.power = raw.power === 'super' || raw.power === 'fire' ? raw.power : 'small'
      s.saveAt = typeof raw.saveAt === 'number' ? raw.saveAt : 0
    }
    slots.push(s)
  }
  return { version: SAVE_VERSION, slots: slots }
}

function read() {
  if (!_memory) _memory = normalize(null)
  return Promise.resolve(_memory)
}

/* 读取全部存档槽 */
export function loadSlots() {
  return read().then(function (db) {
    var out = []
    for (var i = 0; i < db.slots.length; i++) {
      out.push({
        idx: i,
        score: db.slots[i].score,
        coins: db.slots[i].coins,
        lives: db.slots[i].lives,
        level: db.slots[i].level,
        time: db.slots[i].time,
        power: db.slots[i].power,
        saveAt: db.slots[i].saveAt,
        empty: db.slots[i].saveAt === 0,
      })
    }
    return out
  })
}

/* 读取单个槽 */
export function loadSlot(idx) {
  return read().then(function (db) {
    var s = db.slots[idx] || emptySlot()
    return {
      score: s.score,
      coins: s.coins,
      lives: s.lives,
      level: s.level,
      time: s.time,
      power: s.power,
      saveAt: s.saveAt,
      empty: s.saveAt === 0,
    }
  })
}

/* 写入单个槽 (只存内存, 不持久化) */
export function saveSlot(idx, state) {
  return read().then(function (db) {
    db.slots[idx] = {
      score: state.score || 0,
      coins: state.coins || 0,
      lives: state.lives || 3,
      level: state.level || 1,
      time: typeof state.time === 'number' ? state.time : 300,
      power: state.power === 'super' || state.power === 'fire' ? state.power : 'small',
      saveAt: Date.now(),
    }
    _memory = db
    return true
  })
}

/* 删除单个槽 */
export function clearSlot(idx) {
  return read().then(function (db) {
    db.slots[idx] = emptySlot()
    _memory = db
    return true
  })
}

/* 存储是否可用 (现在只在内存, 重启即失) */
export function persistAvailable() {
  return false
}
