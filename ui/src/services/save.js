/*
 * 游戏存档 (falcon jsapi.storage 持久化)。
 * 机制参考 youdao-hill-climb:
 *  - 存储 API: $falcon.jsapi.storage.getStorage / setStorage (真机)
 *    签名: storage.getStorage({key}, cb) / storage.setStorage({key, data}, cb)
 *    cb(result), result.data 为读取值, result.error 表示失败 (回调/返回值均可能异步)
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
    if (typeof $falcon !== 'undefined' && $falcon && $falcon.jsapi) return $falcon.jsapi
  } catch (e) {}
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

/* 从 jsapi 回调/返回结果里提取字符串值 */
function extractData(res) {
  if (res == null) return null
  if (typeof res === 'string') return res
  if (res.error) return null
  if (typeof res.data === 'string') return res.data
  if (typeof res.result === 'string') return res.result
  return null
}

/* 异步读取, 统一返回 Promise<string|null> */
function rawGet(key) {
  var b = storageBackend()
  if (b === 'jsapi') {
    return new Promise(function (resolve) {
      var storage = jsapiObject().storage
      try {
        var r = storage.getStorage({ key: key }, function (res) {
          resolve(extractData(res))
        })
        if (r && typeof r.then === 'function') {
          // Promise 风格 (异步)
          r.then(function (res) {
            resolve(extractData(res))
          })
        } else if (typeof r === 'string') {
          // 同步直接返回字符串
          resolve(r)
        } else if (r != null && !r.error && typeof r === 'object') {
          resolve(extractData(r))
        }
        // 若回调已同步触发, resolve 已完成, 后续调用无效
      } catch (e) {
        resolve(null)
      }
    })
  }
  if (b === 'local') {
    try {
      return Promise.resolve(window.localStorage.getItem(key))
    } catch (e) {
      return Promise.resolve(null)
    }
  }
  return Promise.resolve(null)
}

/* 异步写入, 统一返回 Promise<boolean> */
function rawSet(key, value) {
  var b = storageBackend()
  if (b === 'jsapi') {
    return new Promise(function (resolve) {
      var storage = jsapiObject().storage
      try {
        var r = storage.setStorage({ key: key, data: value }, function (res) {
          resolve(!(res && res.error))
        })
        if (r && typeof r.then === 'function') {
          r.then(function (res) {
            resolve(!(res && res.error))
          })
        } else if (r === false) {
          resolve(false)
        } else if (typeof r === 'boolean' || typeof r === 'string') {
          resolve(true)
        } else if (r != null && r.error) {
          resolve(false)
        }
        // 默认: 回调同步已 resolve 或返回 undefined -> 视为成功
      } catch (e) {
        resolve(false)
      }
    })
  }
  if (b === 'local') {
    try {
      window.localStorage.setItem(key, String(value))
      return Promise.resolve(true)
    } catch (e) {
      return Promise.resolve(false)
    }
  }
  return Promise.resolve(false)
}

function read() {
  if (_memory) return Promise.resolve(_memory)
  return rawGet(STORAGE_KEY).then(function (raw) {
    var d = null
    if (typeof raw === 'string' && raw) {
      try {
        d = JSON.parse(raw)
      } catch (e) {
        d = null
      }
    }
    _memory = normalize(d)
    return _memory
  })
}

function persist(db) {
  _memory = db
  return rawSet(STORAGE_KEY, JSON.stringify(db))
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

/* 存储是否可用 (同步探测) */
export function persistAvailable() {
  return storageBackend() !== null
}
