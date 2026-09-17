/*
 * 游戏存档 (3 个存档位)。
 * 固件不提供 storage JS 模块, 用 panet.writeFile/readFile 持久化到
 * 应用私有数据目录 ($dataDir/mario_save.json)。$dataDir 不可用时退化为
 * 内存模式 (仅当前会话有效), 界面会提示"存档不可用"。
 *
 * 存储结构:
 *   {
 *     version: 1,
 *     slots: [ {score, coins, lives, level, time, saveAt}, ... ]  // 3 槽
 *   }
 * 每槽保存: 分数 / 金币 / 生命 / 关卡 / 时间, 出生点固定为当前关卡起点。
 */

import { Panet } from 'panet'

var SAVE_VERSION = 1
var SLOT_COUNT = 3
var SAVE_NAME = 'mario_save.json'

var _panet = null
var _path = null
var _memory = null
var _fileOk = true // $dataDir 是否可用

function client() {
  if (!_panet) _panet = typeof Panet === 'function' ? new Panet() : Panet
  return _panet
}

function savePath() {
  if (_path !== null) return _path
  var dir = ''
  try {
    dir = globalThis.$dataDir || ''
  } catch (e) {
    dir = ''
  }
  if (!dir) {
    /* web 预览环境没有 $dataDir: 用固定前缀, 交给 mock (localStorage) */
    try {
      if (typeof window !== 'undefined' && window.localStorage) dir = '/preview'
    } catch (e) {}
  }
  _path = dir ? dir + '/' + SAVE_NAME : ''
  return _path
}

function emptySlot() {
  return { score: 0, coins: 0, lives: 3, level: 1, time: 300, saveAt: 0 }
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
      s.saveAt = typeof raw.saveAt === 'number' ? raw.saveAt : 0
    }
    slots.push(s)
  }
  return { version: SAVE_VERSION, slots: slots }
}

function read() {
  if (_memory) return _memory
  var d = null
  var path = savePath()
  if (path) {
    try {
      var raw = client().readFile(path)
      if (raw) d = JSON.parse(raw)
    } catch (e) {
      d = null // 文件不存在/损坏: 按无存档处理, 不代表不可写
    }
  } else {
    _fileOk = false
  }
  _memory = normalize(d)
  return _memory
}

function write() {
  var path = savePath()
  if (!path) return false
  try {
    client().writeFile(path, JSON.stringify(_memory))
    _fileOk = true
    return true
  } catch (e) {
    _fileOk = false
    return false
  }
}

/* 读取全部存档槽 (用于标题画面展示) */
export function loadSlots() {
  var db = read()
  var out = []
  for (var i = 0; i < db.slots.length; i++) {
    out.push({
      idx: i,
      score: db.slots[i].score,
      coins: db.slots[i].coins,
      lives: db.slots[i].lives,
      level: db.slots[i].level,
      time: db.slots[i].time,
      saveAt: db.slots[i].saveAt,
      empty: db.slots[i].saveAt === 0,
    })
  }
  return out
}

/* 读取单个槽 (有档则作为初始进度) */
export function loadSlot(idx) {
  var db = read()
  var s = db.slots[idx] || emptySlot()
  return {
    score: s.score,
    coins: s.coins,
    lives: s.lives,
    level: s.level,
    time: s.time,
    saveAt: s.saveAt,
    empty: s.saveAt === 0,
  }
}

/* 写入单个槽 (新建/覆盖) */
export function saveSlot(idx, state) {
  var db = read()
  db.slots[idx] = {
    score: state.score || 0,
    coins: state.coins || 0,
    lives: state.lives || 3,
    level: state.level || 1,
    time: typeof state.time === 'number' ? state.time : 300,
    saveAt: Date.now(),
  }
  _memory = db
  return write()
}

/* 删除单个槽 */
export function clearSlot(idx) {
  var db = read()
  db.slots[idx] = emptySlot()
  _memory = db
  return write()
}

/* $dataDir 是否可用 (不可用时存档只在内存, 重启即失) */
export function persistAvailable() {
  return _fileOk && savePath() !== ''
}
