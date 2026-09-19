/*
 * 游戏存档 (falcon jsapi.storage 持久化)。
 * 机制参考 youdao-hill-climb:
 *  - 存储 API: jsapi.storage.getStorage / setStorage (真机)
 *  - key 带格式版本号 (mario_save_v1), 数据结构变更时升级后缀兼容旧档
 *  - 浏览器预览回退 localStorage, 再无则内存兜底
 * 保留 3 个存档位, 单 key 存全部槽位。
 */

var SAVE_VERSION = 1
var SLOT_COUNT = 3
var STORAGE_KEY = 'mario_save_v' + SAVE_VERSION
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

/* ---- 存储后端探测: jsapi.storage > localStorage > null ---- */
function jsapiObject() {
  try {
    if (typeof jsapi !== 'undefined' && jsapi) return jsapi
  } catch (e) {}
  try {
    if (typeof window !== 'undefined' && window.jsapi) return window.jsapi
  } catch (e) {}
  return null
}

function storageBackend() {
  var j = jsapiObject()
  if (j && j.storage && typeof j.storage.setStorage === 'function') return 'jsapi'
  try {
    if (typeof window !== 'undefined' && window.localStorage) return 'local'
  } catch (e) {}
  return null
}

function rawGet(key) {
  var b = storageBackend()
  if (b === 'jsapi') return jsapiObject().storage.getStorage(key)
  if (b === 'local') return window.localStorage.getItem(key)
  return null
}

function rawSet(key, value) {
  var b = storageBackend()
  if (b === 'jsapi') return jsapiObject().storage.setStorage(key, value)
  if (b === 'local') {
    window.localStorage.setItem(key, String(value))
    return true
  }
  return false
}

function read() {
  if (_memory) return Promise.resolve(_memory)
  var d = null
  try {
    var raw = rawGet(STORAGE_KEY)
    if (typeof raw === 'string' && raw) {
      try {
        d = JSON.parse(raw)
      } catch (e) {
        d = null
      }
    }
  } catch (e) {
    d = null
  }
  _memory = normalize(d)
  return Promise.resolve(_memory)
}

function persist(db) {
  _memory = db
  try {
    return rawSet(STORAGE_KEY, JSON.stringify(db))
  } catch (e) {
    return false
  }
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

/* 写入单个槽并持久化 */
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
    return persist(db)
  })
}

/* 删除单个槽并持久化 */
export function clearSlot(idx) {
  return read().then(function (db) {
    db.slots[idx] = emptySlot()
    return persist(db)
  })
}

/* 存储是否可用 */
export function persistAvailable() {
  return storageBackend() !== null
}
