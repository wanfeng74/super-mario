/*
 * 超级马里奥游戏引擎 (Canvas 2D)。
 * 纯 ES5 风格 (var/function/原型), 兼容词典笔 QuickJS 20200705 运行时。
 * 960x266 画布, 1 瓦片 = 24px, 世界横向卷轴。
 *
 * 页面通过如下接口驱动:
 *   createGame(ctx, hooks) -> game
 *   game.start(state)          从关卡起点开始 (state: {level, score, coins, lives, time})
 *   game.setInput(dir, on)     dir: 'left' | 'right' | 'jump'
 *   game.tick(dtMs)            每帧推进 (页面用 setInterval 驱动)
 *   game.getState()            {level, score, coins, lives, time}
 *   game.hooks.onGameOver(state) / onClear(state)
 */

import { LEVELS, LEVEL_THEMES, WORLD_GROUND_Y, WORLD_BLOCKS } from './levels.js'
import {
  SPRITE_MAP as TEX_MAP,
  SMALL_STAND,
  SMALL_WALK,
  SMALL_JUMP,
  BIG_STAND,
  BIG_WALK,
  BIG_JUMP,
  FIRE_STAND,
  FIRE_WALK,
  FIRE_JUMP,
  DEAD,
  COIN,
  FLOWER,
  MUSHROOM,
  QBLOCK,
  HARD,
  BRICK,
  GROUND,
  PIPE_TOP_L,
  PIPE_TOP_R,
  PIPE_BODY_L,
  PIPE_BODY_R,
  CLOUD,
  CLOUD_S,
  HILL,
} from './sprites.js'

var TILE = 24
var VIEW_W = 960
var VIEW_H = 266

/* 物理 (基准 60fps) */
var GRAVITY = 0.55
var JUMP_V = -11.8
var JUMP_HOLD_MAX = 280 /* 长按跳跃最多保持低重力的毫秒数, 超过即下落 */
var MOVE_SPD = 2.9
var AIR_MOVE = 2.55
var MAX_FALL = 12.5
var ENEMY_SPD = 0.62
var STOMP_V = -7.2
var BONK_V = 3.2
var DEAD_V = -10.5

/* 颜色 */
var C_SKY = '#6cb8f8'
var C_UNDER_BG = '#3a2a20'
var C_CASTLE_BG = '#141418'
var C_GROUND_TOP = '#4cae4f'
var C_GROUND_TOP_DARK = '#3c8f3f'
var C_GROUND_BODY = '#c9783c'
var C_GROUND_BODY_DARK = '#a85f2b'
var C_BRICK = '#c65d1e'
var C_BRICK_DARK = '#8f3f10'
var C_BRICK_LIGHT = '#e8a05a'
var C_QB = '#e89a18'
var C_QB_DARK = '#9c5a08'
var C_QB_LIGHT = '#ffd75e'
var C_HARD = '#8a8f9c'
var C_HARD_DARK = '#5d6270'
var C_HARD_LIGHT = '#c3c7d4'
var C_PIPE = '#2fae5c'
var C_PIPE_DARK = '#1b7a3c'
var C_PIPE_LIGHT = '#8fe3a8'
var C_COIN = '#ffd23e'
var C_COIN_DARK = '#c98a10'
var C_RED = '#e52521'
var C_SKIN = '#ffc0a0'
var C_BLUE = '#3169c7'
var C_SHOE = '#6b3f1d'
var C_WHITE = '#ffffff'
var C_BLACK = '#1c1c1c'
var C_BROWN = '#8b5a2b'
var C_CASTLE = '#c0392b'
var C_CASTLE_DARK = '#8e2a1f'
var C_ORANGE = '#ff7f27'
var C_LIME = '#7ec850'
var C_FIRE = '#f4f4f4'

/* 字符 -> 颜色: 贴图色板 (sprites.js) + 旧精灵保留色 */
var SPRITE_MAP = Object.assign(
  {},
  {
    R: C_RED,
    W: C_WHITE,
    S: C_SKIN,
    B: C_BLUE,
    K: C_SHOE,
    D: C_BLACK,
    M: C_BROWN,
    G: C_PIPE,
    Y: C_COIN,
    O: C_ORANGE,
    L: C_LIME,
  },
  TEX_MAP
)

var ITEM_MUSHROOM = [
  '...RRRRRR...',
  '..RRRRRRRR..',
  '.RRWWWWRRRR.',
  '.RRWWWWRRRR.',
  '.RRRRRRRRRR.',
  '.RRRRRRRRRR.',
  '.SSSSSSSSSS.',
  '.SSSSSSSSSS.',
  '.MMSSSSSSMM.',
  '.MM..MM..MM.',
  '.MM..MM..MM.',
  '............',
]
var ITEM_MUSHROOM_1UP = [
  '...LLLLLL...',
  '..LLLLLLLL..',
  '.LLWWWWLLLL.',
  '.LLWWWWLLLL.',
  '.LLLLLLLLLL.',
  '.LLLLLLLLLL.',
  '.SSSSSSSSSS.',
  '.SSSSSSSSSS.',
  '.MMSSSSSSMM.',
  '.MM..MM..MM.',
  '.MM..MM..MM.',
  '............',
]
var ITEM_FLOWER = [
  '...OOOOOO...',
  '..OOORROO...',
  '.OORRRRROO..',
  '.OORR..RRO..',
  '.OORR..RRO..',
  '..OOO..OO...',
  '...OO..OO...',
  '...LL..LL...',
  '..LLLLLLLL..',
  '..LL....LL..',
  '.LL......LL.',
  '............',
]
var ITEM_STAR = [
  '....YYYY....',
  '...YYYYYY...',
  '..YYYYYYYY..',
  '..YYYYYYYY..',
  '...YYYYYY...',
  '..Y.YYYY.Y..',
  '.Y..YYYY..Y.',
  '.Y..YYYY..Y.',
  '.Y..YYYY..Y.',
  '..Y.YY.YY...',
  '...Y....Y...',
  '............',
]

/* 库巴 (BOSS) 12x12 => 24x24 */
var KOOPA = [
  '..GGGGGGGG..',
  '.GGGGGGGGGG.',
  '.GGGGGGGGGG.',
  '.GGRRGGGGRG.',
  '.GGRRGGGGRG.',
  '.GGGGGGGGGG.',
  '.GGGGGGGGGG.',
  '..GGGGGGGG..',
  '.DD.DDDD.DD.',
  '.DD.DDDD.DD.',
  '..DD....DD..',
  '..DD....DD..',
]

var GOOMBA = [
  '....MMMM....',
  '...MMMMMM...',
  '..MMMMMMMM..',
  '.MMMMMMMMMM.',
  '.MMMMMMMMMM.',
  '.MWMMMMMWM..',
  '.MWMMMMMWM..',
  '.MMWMMMMWMM.',
  '..MMMMMMMM..',
  '...MMMMMM...',
  '..KKK..KKK..',
  '..KKK..KKK..',
]
var GOOMBA_WALK = [
  '....MMMM....',
  '...MMMMMM...',
  '..MMMMMMMM..',
  '.MMMMMMMMMM.',
  '.MMMMMMMMMM.',
  '.MWMMMMMWM..',
  '.MWMMMMMWM..',
  '.MMWMMMMWMM.',
  '..MMMMMMMM..',
  '...MMMMMM...',
  '...KK..KK...',
  '...KK..KK...',
]

/* ---------- 工具 ---------- */

/* 精灵 run-length 缓存: 每行折叠成 [start,len,char] 段, 一次 fillRect 画一段 */
var _spriteRuns = new WeakMap()

function spriteRunRows(sprite) {
  var rows = _spriteRuns.get(sprite)
  if (rows) return rows
  rows = []
  for (var r = 0; r < sprite.length; r++) {
    var row = sprite[r]
    var rr = []
    var prev = null
    var start = 0
    for (var c = 0; c < row.length; c++) {
      var ch = row.charAt(c)
      if (ch !== prev) {
        if (prev !== null) rr.push([start, c - start, prev])
        prev = ch
        start = c
      }
    }
    if (prev !== null) rr.push([start, row.length - start, prev])
    rows.push(rr)
  }
  _spriteRuns.set(sprite, rows)
  return rows
}

/* 精灵离屏 canvas 缓存: 同一张 sprite 只在第一次渲染时画 fillRect, 之后直接 drawImage */
var _spriteCanvas = new WeakMap()
var _canCreateCanvas = null

function ensureCanvas(w, h) {
  /* falcon 环境: 优先用 document.createElement; 降级用当前 ctx 的 canvas 构造 */
  if (_canCreateCanvas === false) return null
  try {
    if (typeof document !== 'undefined' && document.createElement) {
      var c = document.createElement('canvas')
      c.width = w; c.height = h
      return c
    }
  } catch (e) {}
  _canCreateCanvas = false
  return null
}

function spriteToCanvas(sprite, scale, flip) {
  var key = flip ? ('f_' + sprite) : sprite
  var canvas = _spriteCanvas.get(key)
  if (canvas) return canvas
  var w = sprite[0].length * scale
  var h = sprite.length * scale
  canvas = ensureCanvas(w, h)
  if (!canvas) return null
  var cctx = canvas.getContext('2d')
  /* 画到离屏: 直接走 RLE 路径 */
  var runs = spriteRunRows(sprite)
  for (var r = 0; r < h / scale; r++) {
    var rr = runs[r]
    for (var k = 0; k < rr.length; k++) {
      var ch = rr[k][2]
      if (ch === '.' || ch === ' ') continue
      var color = SPRITE_MAP[ch]
      if (!color) continue
      var s0 = flip ? w - rr[k][0] * scale - rr[k][1] * scale : rr[k][0] * scale
      cctx.fillStyle = color
      cctx.fillRect(s0, r * scale, rr[k][1] * scale, scale)
    }
  }
  _spriteCanvas.set(key, canvas)
  return canvas
}

/* 贴图画质: 2.0 原画质 */
var SPR_SCALE = 2.0

function drawSprite(ctx, sprite, scale, px, py, flip, colorMap) {
  /* scale=undefined 时用 SPR_SCALE 并自动居中到 24x24 瓦片;
     scale=数字 时按原坐标画 (山/云/标题屏等自由位置贴图) */
  var autoCenter = (scale === undefined || scale === null)
  if (typeof scale === 'boolean') { colorMap = flip; flip = scale; scale = SPR_SCALE; autoCenter = true }
  if (autoCenter) scale = SPR_SCALE
  var h = sprite.length
  var w = sprite[0].length
  var px0, py0
  if (autoCenter) {
    px0 = Math.round(px + (TILE - w * scale) / 2)
    py0 = Math.round(py + (TILE - h * scale) / 2)
  } else {
    px0 = Math.round(px)
    py0 = Math.round(py)
  }
  /* colorMap 着色模式 (受伤/无敌闪) 不能用缓存 */
  if (colorMap) {
    var runs = spriteRunRows(sprite)
    for (var r = 0; r < h; r++) {
      var rr = runs[r]
      for (var k = 0; k < rr.length; k++) {
        var ch = rr[k][2]
        if (ch === '.' || ch === ' ') continue
        var color = SPRITE_MAP[ch]
        if (!color) continue
        var rep = typeof colorMap === 'function' ? colorMap(color, ch) : colorMap[color]
        if (rep) color = rep
        var s0 = flip ? w - rr[k][0] - rr[k][1] : rr[k][0]
        ctx.fillStyle = color
        ctx.fillRect(px0 + s0 * scale, py0 + r * scale, rr[k][1] * scale, scale)
      }
    }
    return
  }
  /* 快路径: drawImage 缓存 */
  var cached = spriteToCanvas(sprite, scale, flip)
  if (cached) {
    ctx.drawImage(cached, px0, py0)
    return
  }
  /* 降级: 直接 fillRect */
  var runs = spriteRunRows(sprite)
  for (var r = 0; r < h; r++) {
    var rr = runs[r]
    for (var k = 0; k < rr.length; k++) {
      var ch = rr[k][2]
      if (ch === '.' || ch === ' ') continue
      var color = SPRITE_MAP[ch]
      if (!color) continue
      var s0 = flip ? w - rr[k][0] - rr[k][1] : rr[k][0]
      ctx.fillStyle = color
      ctx.fillRect(px0 + s0 * scale, py0 + r * scale, rr[k][1] * scale, scale)
    }
  }
}

function rectsHit(ax, ay, aw, ah, bx, by, bw, bh) {
  return ax < bx + bw && ax + aw > bx && ay < by + bh && ay + ah > by
}

/* ---------- 引擎 ---------- */

function Game(ctx, hooks) {
  this.ctx = ctx
  this.hooks = hooks || {}
  this.input = { left: false, right: false, jump: false, prevJump: false }
  this.state = 'idle' // idle | playing | dead | clear | gameover
  this.reset()
}

Game.prototype.reset = function () {
  this.score = 0
  this.coins = 0
  this.lives = 3
  this.level = 1
  this.time = 300
  this.camX = 0
  this.animT = 0
  this.stateTimer = 0
  this.tiles = []
  this.pipes = []
  this.enemies = []
  this.coinItems = []
  this.particles = []
  this.powerups = []
  this.fireballs = []
  this.axe = null
  this.boss = null
  this.player = null
  this.flagX = 0
  this.castleX = 0
  this.worldW = WORLD_BLOCKS * TILE
  this.worldH = (WORLD_GROUND_Y + 2) * TILE
  this.speedBonus = 0
  this.invuln = 0
  this.playerBottomPrev = 0
}

/* 从关卡数据构建世界 */
Game.prototype.loadLevel = function (levelIdx) {
  var segs = LEVELS[(levelIdx - 1) % LEVELS.length]
  this.theme = LEVEL_THEMES[levelIdx] || 'overworld'
  this.tiles = []
  this.pipes = []
  this.enemies = []
  this.coinItems = []
  this.particles = []
  this.lavaList = []
  this.flagX = 0
  this.castleX = 0
  this.lavaFireT = 0

  for (var i = 0; i < segs.length; i++) {
    var s = segs[i]
    if (s.t === 'g') {
      var gh = s.h || 2
      var gy = (WORLD_GROUND_Y + 2 - gh) * TILE
      this.tiles.push({ type: 'ground', x: s.x * TILE, y: gy, w: s.w * TILE, h: gh * TILE })
    } else if (s.t === 'l') {
      /* 岩浆 (碰到就死, 和地面顶对齐) */
      var lh = s.h || 1
      var ly = (WORLD_GROUND_Y + 1 - lh) * TILE
      this.tiles.push({ type: 'lava', x: s.x * TILE, y: ly, w: s.w * TILE, h: lh * TILE })
      /* 记录岩浆位置用于喷火球 */
      this.lavaList.push({ x: s.x * TILE + s.w * TILE / 2, y: ly, w: s.w * TILE })
    } else if (s.t === 'b') {
      this.tiles.push({ type: 'brick', x: s.x * TILE, y: s.y * TILE, w: TILE, h: TILE })
    } else if (s.t === 'q') {
      this.tiles.push({ type: 'qblock', x: s.x * TILE, y: s.y * TILE, w: TILE, h: TILE, used: false, content: s.content || 'coin' })
    } else if (s.t === 'h') {
      this.tiles.push({ type: 'hard', x: s.x * TILE, y: s.y * TILE, w: TILE, h: TILE })
    } else if (s.t === 'p') {
      var ph = (s.h || 2) * TILE
      var py = (WORLD_GROUND_Y + 1) * TILE - ph + TILE
      this.pipes.push({ x: s.x * TILE, y: py, w: 2 * TILE, h: ph })
      this.tiles.push({ type: 'pipe', x: s.x * TILE, y: py, w: 2 * TILE, h: ph })
    } else if (s.t === 'c') {
      this.coinItems.push({ x: s.x * TILE, y: s.y * TILE, w: TILE, h: TILE, active: true, t: Math.random() * 6.28 })
    } else if (s.t === 'm') {
      var my = s.y != null ? s.y * TILE : (WORLD_GROUND_Y - 1) * TILE
      this.enemies.push({
        x: s.x * TILE,
        y: my,
        w: TILE,
        h: TILE,
        vx: -ENEMY_SPD,
        alive: true,
        squashed: false,
        squashT: 0,
        walk: 0,
        kind: 'goomba',
      })
    } else if (s.t === 't') {
      /* 乌龟 (Koopa) h=36, 脚底贴地 */
      var ty = s.y != null ? s.y * TILE : (WORLD_GROUND_Y - 1.5) * TILE
      this.enemies.push({
        x: s.x * TILE,
        y: ty,
        w: TILE,
        h: TILE * 1.5,
        vx: -ENEMY_SPD * 0.8,
        alive: true,
        squashed: false,
        squashT: 0,
        walk: 0,
        kind: 'koopa',
      })
    } else if (s.t === 'rt') {
      /* 红龟 (不会走下平台边缘) */
      var rty = s.y != null ? s.y * TILE : (WORLD_GROUND_Y - 1.5) * TILE
      this.enemies.push({
        x: s.x * TILE, y: rty, w: TILE, h: TILE * 1.5,
        vx: -ENEMY_SPD * 0.8, alive: true, squashed: false, squashT: 0, walk: 0,
        kind: 'redkoopa',
      })
    } else if (s.t === 'pg') {
      /* 绿飞龟 (上下飞) */
      this.enemies.push({
        x: s.x * TILE, y: (s.y || 6) * TILE, w: TILE, h: TILE,
        vx: -ENEMY_SPD, alive: true, squashed: false, squashT: 0, walk: 0,
        kind: 'paratroopa_g', baseY: (s.y || 6) * TILE, flyT: Math.random() * 6,
      })
    } else if (s.t === 'prg') {
      /* 红飞龟 (直线跳跃) */
      this.enemies.push({
        x: s.x * TILE, y: (s.y || 5) * TILE, w: TILE, h: TILE,
        vx: -ENEMY_SPD * 1.2, alive: true, squashed: false, squashT: 0, walk: 0,
        kind: 'paratroopa_r', baseY: (s.y || 5) * TILE, flyT: Math.random() * 6,
      })
    } else if (s.t === 'bz') {
      /* 硬壳虫 (黑甲虫, 怕踩不怕火) */
      this.enemies.push({
        x: s.x * TILE, y: (WORLD_GROUND_Y - 1) * TILE, w: TILE, h: TILE,
        vx: -ENEMY_SPD, alive: true, squashed: false, squashT: 0, walk: 0,
        kind: 'buzzy',
      })
    } else if (s.t === 'bl') {
      /* 墨鱼 (Z字追踪) */
      this.enemies.push({
        x: s.x * TILE, y: (s.y || 5) * TILE, w: TILE, h: TILE,
        vx: 0, alive: true, squashed: false, squashT: 0, walk: 0,
        kind: 'blooper', t: 0,
      })
    } else if (s.t === 'ch') {
      /* 跳跳鱼 (从下方跳出) */
      this.enemies.push({
        x: s.x * TILE, y: (WORLD_GROUND_Y + 1) * TILE, w: TILE, h: TILE,
        vx: (s.vx || 1.5), alive: true, squashed: false, squashT: 0, walk: 0,
        kind: 'cheep', vy: -10, jumpV: 10, t: Math.random() * 1000, wait: 0,
      })
    } else if (s.t === 'hb') {
      /* 锤子龟 (跳跃+扔锤子) */
      this.enemies.push({
        x: s.x * TILE, y: (s.y || 7) * TILE, w: TILE, h: TILE,
        vx: -ENEMY_SPD * 0.6, alive: true, squashed: false, squashT: 0, walk: 0,
        kind: 'hammer', t: Math.random() * 1000, jumpT: 0, throwT: 0,
      })
    } else if (s.t === 'lk') {
      /* 云龟 (飘在云上扔刺龟蛋) */
      this.enemies.push({
        x: s.x * TILE, y: (s.y || 4) * TILE, w: TILE, h: TILE,
        vx: 0, alive: true, squashed: false, squashT: 0, walk: 0,
        kind: 'lakitu', t: 0, throwT: 0,
      })
    } else if (s.t === 'fb') {
      /* 火焰棒 (旋转火球串) */
      this.enemies.push({
        x: s.x * TILE, y: (s.y || 8) * TILE, w: TILE, h: TILE,
        vx: 0, alive: true, squashed: false, squashT: 0, walk: 0,
        kind: 'firebar', angle: 0, len: s.len || 3, speed: s.speed || 0.04,
      })
    } else if (s.t === 'sp') {
      /* 刺龟 (不能踩) */
      this.enemies.push({
        x: s.x * TILE, y: (WORLD_GROUND_Y - 1) * TILE, w: TILE, h: TILE,
        vx: -ENEMY_SPD, alive: true, squashed: false, squashT: 0, walk: 0,
        kind: 'spiny',
      })
    } else if (s.t === 'bb') {
      /* 子弹比尔 (水平飞) */
      this.enemies.push({
        x: s.x * TILE, y: (s.y || 7) * TILE, w: TILE, h: TILE,
        vx: -(s.vx || 3), alive: true, squashed: false, squashT: 0, walk: 0,
        kind: 'bulletbill',
      })
    } else if (s.t === 'pb') {
      /* 帕拉火球 (从岩浆跳起) */
      this.enemies.push({
        x: s.x * TILE, y: (WORLD_GROUND_Y - 2) * TILE, w: TILE, h: TILE,
        vx: 0, alive: true, squashed: false, squashT: 0, walk: 0,
        kind: 'podoboo', baseY: WORLD_GROUND_Y * TILE - TILE, vy: -8, jumpV: 8,
        t: Math.random() * 1000, wait: 1500,
      })
    } else if (s.t === 'pr') {
      /* 食人花 (从管道顶部弹出) */
      var pipeH = s.h || 2
      var pipePh = pipeH * TILE
      var pipeTopY = (WORLD_GROUND_Y + 1) * TILE - pipePh + TILE
      /* 管道宽 2 格, 中心在 x+1, 食人花居中 */
      var piranhaW = TILE * 0.8
      this.enemies.push({
        x: s.x * TILE + TILE - piranhaW / 2,
        y: pipeTopY,
        w: piranhaW,
        h: TILE * 1.2,
        vx: 0, alive: true, squashed: false, squashT: 0, walk: 0,
        kind: 'piranha', baseY: pipeTopY,
        t: Math.random() * 3000,
      })
    } else if (s.t === 'boss') {
      /* 库巴 BOSS (4x4 瓦片) */
      this.boss = {
        x: s.x * TILE,
        y: s.y * TILE,
        w: 4 * TILE,
        h: 4 * TILE,
        vx: -ENEMY_SPD * 1.5,
        alive: true,
        walk: 0,
        fireT: 0,
      }
    } else if (s.t === 'x') {
      /* 斧头 (断桥通关) */
      this.axe = { x: s.x * TILE, y: s.y * TILE, w: TILE, h: TILE, taken: false, t: 0 }
    } else if (s.t === 'f') {
      this.flagX = s.x * TILE
    } else if (s.t === 'k') {
      this.castleX = s.x * TILE
    } else if (s.t === 's') {
      var sx = s.x * TILE
      var sy = s.y != null ? s.y * TILE : (WORLD_GROUND_Y - 1) * TILE
      this.player = {
        x: sx,
        y: sy,
        w: TILE,
        h: TILE,
        vx: 0,
        vy: 0,
        onGround: false,
        facing: 1,
        walk: 0,
        power: 'small', // small | super | fire
        starTimer: 0,
      }
      this.camX = Math.max(0, sx - 200)
    }
  }
  if (!this.player) {
    this.player = { x: 2 * TILE, y: (WORLD_GROUND_Y - 1) * TILE, w: TILE, h: TILE, vx: 0, vy: 0, onGround: false, facing: 1, walk: 0, power: 'small', starTimer: 0 }
  }
  this.playerBottomPrev = this.player.y + this.player.h
  this.time = Math.max(200, 300 - (levelIdx - 1) * 30)
  this.invuln = 0
  /* 读档恢复变身状态 */
  if (this.resumePower && this.resumePower !== 'small') {
    this.setPower(this.resumePower)
    if (this.resumeStar > 0) this.player.starTimer = this.resumeStar * 1000
  }
  this.resumePower = null
  this.resumeStar = 0
  this.state = 'playing'
  this.stateTimer = 0
}

/* 变身: small -> super -> fire, 切换碰撞框与精灵 */
Game.prototype.setPower = function (next) {
  var p = this.player
  if (!p) return
  if (next === p.power) return
  /* 变大: 底部对齐, 高度翻倍 */
  if (next === 'super' || next === 'fire') {
    if (p.power === 'small') {
      var bottom = p.y + p.h
      p.h = TILE * 2
      p.w = TILE
      p.y = bottom - p.h
    }
  } else if (next === 'small') {
    if (p.power !== 'small') {
      var b2 = p.y + p.h
      p.h = TILE
      p.w = TILE
      p.y = b2 - p.h
    }
  }
  p.power = next
  if (this.hooks.onPower) this.hooks.onPower({ power: next })
}

/* 开始: 按存档/新局状态 */
Game.prototype.start = function (state) {
  this.reset()
  this.level = state.level || 1
  this.score = state.score || 0
  this.coins = state.coins || 0
  this.lives = state.lives || 3
  this.resumePower = state.power || 'small'
  this.resumeStar = state.starTimer || 0
  this.loadLevel(this.level)
}

Game.prototype.getState = function () {
  var p = this.player
  return {
    level: this.level,
    score: this.score,
    coins: this.coins,
    lives: this.lives,
    time: Math.max(0, Math.round(this.time)),
    power: p ? p.power : 'small',
    starTimer: p ? Math.max(0, Math.round((p.starTimer || 0) / 1000)) : 0,
  }
}

Game.prototype.setInput = function (dir, on) {
  if (dir === 'left') this.input.left = on
  else if (dir === 'right') this.input.right = on
  else if (dir === 'jump') this.input.jump = on
  else if (dir === 'fire') {
    /* 火焰形态: 发火球 */
    if (on && this.state === 'playing') this.fireFireball()
  }
}

/* 发射火球 (fire 形态, 最多 2 颗) */
Game.prototype.fireFireball = function () {
  var p = this.player
  if (!p || p.power !== 'fire') return
  if (this.fireballs.length >= 2) return
  var f = {
    x: p.facing > 0 ? p.x + p.w : p.x - TILE,
    y: p.y + 8,
    w: TILE,
    h: TILE,
    vx: p.facing * 3.6,
    vy: -2.4,
    alive: true,
    t: 0,
  }
  this.fireballs.push(f)
}

/* ---------- 玩家物理 ---------- */

Game.prototype.movePlayerX = function () {
  var p = this.player
  var step = Math.abs(p.vx)
  var dir = p.vx > 0 ? 1 : -1
  var guard = 0
  while (step > 0 && guard < 8) {
    var d = Math.min(step, 4)
    p.x += dir * d
    step -= d
    guard++
    var hit = this.collideTiles(p.x, p.y, p.w, p.h)
    if (hit) {
      if (dir > 0) p.x = hit.x - p.w
      else p.x = hit.x + hit.w
      p.vx = 0
      break
    }
  }
  if (p.x < 0) {
    p.x = 0
    p.vx = 0
  }
}

Game.prototype.movePlayerY = function () {
  var p = this.player
  var step = Math.abs(p.vy)
  var dir = p.vy > 0 ? 1 : -1
  var guard = 0
  while (step > 0 && guard < 8) {
    var d = Math.min(step, 4)
    p.y += dir * d
    step -= d
    guard++
    var hit = this.collideTiles(p.x, p.y, p.w, p.h)
    if (hit) {
      if (dir > 0) {
        p.y = hit.y - p.h
        p.vy = 0
        p.onGround = true
      } else {
        p.y = hit.y + hit.h
        p.vy = BONK_V
        this.bonkTile(hit)
      }
      break
    }
  }
  /* 顶部空气墙: 不能跳出地图顶端 */
  if (p.y < 0) {
    p.y = 0
    if (p.vy < 0) p.vy = 0
  }
  if (p.y > this.worldH + 200) {
    this.killPlayer(true)
  }
  /* 岩浆检测: 碰到岩浆就死 */
  this.checkLavaHit()
}

Game.prototype.checkLavaHit = function () {
  if (this.state !== 'playing') return
  var p = this.player
  if (p.starTimer > 0) return
  /* 检测玩家脚底是否在岩浆里 */
  var footX = p.x + p.w / 2
  var footY = p.y + p.h
  for (var i = 0; i < this.tiles.length; i++) {
    var t = this.tiles[i]
    if (t.type !== 'lava') continue
    if (footX >= t.x && footX <= t.x + t.w &&
        footY >= t.y && footY <= t.y + t.h) {
      this.killPlayer(false)
      return
    }
  }
}

/* 岩浆喷火球: 向上方 45 度角发射 */
Game.prototype.shootLavaFireball = function () {
  if (!this.lavaList || this.lavaList.length === 0) return
  var p = this.player
  for (var i = 0; i < this.lavaList.length; i++) {
    var lava = this.lavaList[i]
    /* 只喷玩家附近的岩浆 */
    if (Math.abs(lava.x - p.x) > 400) continue
    /* 上方 45 度扇形 (从正上方往左右各偏 22.5 度) */
    var speed = 4
    var angle = -Math.PI / 2 + (Math.random() - 0.5) * (Math.PI / 4)
    var vx = Math.cos(angle) * speed
    var vy = Math.sin(angle) * speed
    /* 生成火球敌人 */
    this.enemies.push({
      x: lava.x - TILE / 2,
      y: lava.y - TILE,
      w: TILE,
      h: TILE,
      vx: vx,
      vy: vy,
      alive: true,
      squashed: false,
      squashT: 0,
      walk: 0,
      kind: 'lavaFireball',
      life: 180,
    })
  }
}

/* 顶砖块: 问号出金币/道具, 砖块 super 顶碎/small 顶弹 */
Game.prototype.spawnPowerup = function (kind, tx, ty) {
  /* 道具出生在块上方; 蘑菇/星/1UP 弹起后水平移动, 花固定 */
  var isStatic = kind === 'flower'
  this.powerups.push({
    kind: kind,
    x: tx,
    y: ty - TILE,
    w: TILE,
    h: TILE,
    vx: isStatic ? 0 : (kind === 'star' ? 2.4 : 1.3),
    vy: isStatic ? 0 : -5,
    active: true,
    t: 0,
  })
  this.score += 200
}

Game.prototype.bonkTile = function (tile) {
  if (tile.type === 'qblock' && !tile.used) {
    tile.used = true
    var content = tile.content || 'coin'
    if (content === 'mushroom') {
      this.spawnPowerup('mushroom', tile.x, tile.y)
    } else if (content === 'flower') {
      this.spawnPowerup('flower', tile.x, tile.y)
    } else if (content === 'star') {
      this.spawnPowerup('star', tile.x, tile.y)
    } else if (content === '1up') {
      this.spawnPowerup('1up', tile.x, tile.y)
    } else {
      this.score += 200
      this.coins++
      if (this.coins % 100 === 0) this.lives++
      this.particles.push({ kind: 'coinpop', x: tile.x + TILE / 2, y: tile.y - TILE / 2, vy: -6, t: 0 })
    }
  } else if (tile.type === 'brick') {
    var pw = this.player ? this.player.power : 'small'
    if (!tile.dead && (pw === 'super' || pw === 'fire')) {
      tile.dead = true
      this.score += 50
      for (var i = 0; i < 4; i++) {
        this.particles.push({
          kind: 'debris',
          x: tile.x + (i % 2) * 8 + 4,
          y: tile.y + Math.floor(i / 2) * 8 + 4,
          vx: i % 2 === 0 ? -1.6 : 1.6,
          vy: -5 - (i % 2) * 1.4,
          t: 0,
        })
      }
    } else if (!tile.dead) {
      /* small 顶砖只弹 */
      tile.bumpT = 0.2
    }
  }
}

/* 与 tiles 的 AABB 碰撞 (跳过已死砖块), 返回第一个碰撞体 */
Game.prototype.collideTiles = function (x, y, w, h) {
  for (var i = 0; i < this.tiles.length; i++) {
    var t = this.tiles[i]
    if (t.dead) continue
    if (rectsHit(x, y, w, h, t.x, t.y, t.w, t.h)) return t
  }
  return null
}

Game.prototype.collideTileList = function (x, y, w, h) {
  var out = []
  for (var i = 0; i < this.tiles.length; i++) {
    var t = this.tiles[i]
    if (t.dead) continue
    if (rectsHit(x, y, w, h, t.x, t.y, t.w, t.h)) out.push(t)
  }
  return out
}

/* ---------- 敌人 ---------- */

Game.prototype.updateEnemies = function (dt) {
  var p = this.player
  var keep = []
  for (var i = 0; i < this.enemies.length; i++) {
    var e = this.enemies[i]
    if (!e.alive) {
      e.squashT -= dt / 1000
      if (e.squashT > 0) keep.push(e)
      continue
    }

    /* 怪物激活: 玩家进入屏幕范围后才开始移动 */
    if (!e.activated) {
      /* 地面怪物激活距离稍远, 刷在砖块/空中的怪物激活距离更短 */
      var isAir = (e.kind === 'paratroopa_g' || e.kind === 'paratroopa_r' ||
                   e.kind === 'bulletbill' || e.kind === 'podoboo' ||
                   e.kind === 'piranha' ||
                   e.kind === 'lakitu' || e.kind === 'blooper' ||
                   (e.y < (WORLD_GROUND_Y - 1.5) * TILE && e.kind !== 'hammer' && e.kind !== 'buzzy'))
      var margin = isAir ? 20 : 100
      if (e.x > p.x - margin && e.x < p.x + VIEW_W + margin) {
        e.activated = true
      } else {
        keep.push(e)
        continue
      }
    }

    /* ===== 按种类分行为 ===== */
    if (e.kind === 'paratroopa_g' || e.kind === 'paratroopa_r') {
      /* 飞龟: 上下飞 */
      e.flyT = (e.flyT || 0) + dt / 16.667
      e.y = e.baseY + Math.sin(e.flyT * 0.08) * TILE * 0.8
      e.x += e.vx * (dt / 16.667)
    } else if (e.kind === 'bulletbill') {
      /* 子弹比尔: 水平直线飞 */
      e.x += e.vx * (dt / 16.667)
    } else if (e.kind === 'podoboo') {
      /* 帕拉火球: 从岩浆跳起 */
      e.t = (e.t || 0) + dt
      if (e.t > e.wait || e.t == null) {
        e.vy -= GRAVITY * (dt / 16.667)
        e.y += e.vy * (dt / 16.667)
        if (e.y > e.baseY) { e.y = e.baseY; e.vy = -e.jumpV; e.t = 0; e.wait = 1500 + Math.random() * 1000 }
      }
    } else if (e.kind === 'piranha') {
      /* 食人花: 从管道顶部向上弹出再收回, 收回后间隔3s再弹 */
      e.t = (e.t || 0) + dt
      if (e.baseY == null) e.baseY = e.y
      var cycle = e.t % 6000
      var popDist = e.h /* 完全弹出时底部正好在管道顶 */
      if (cycle < 800) {
        /* 向上弹出 */
        var p = cycle / 800
        e.y = e.baseY - p * popDist
      } else if (cycle < 2200) {
        /* 停在上面 */
        e.y = e.baseY - popDist
      } else if (cycle < 3000) {
        /* 缩回管道 */
        var p2 = (cycle - 2200) / 800
        e.y = e.baseY - popDist + p2 * popDist
      } else {
        /* 缩回后等待3秒 */
        e.y = e.baseY
      }
    } else if (e.kind === 'lavaFireball') {
      /* 岩浆火球: 直线飞行, 有轻微重力 */
      e.x += e.vx * (dt / 16.667)
      e.y += e.vy * (dt / 16.667)
      e.vy += GRAVITY * (dt / 16.667) * 0.3
      e.life--
      if (e.life <= 0) e.alive = false
    } else if (e.kind === 'spiny') {
      /* 刺龟: 不能踩, 有重力 */
      e.x += e.vx * (dt / 16.667)
      if (!e.vy) e.vy = 0
      e.vy = Math.min(e.vy + GRAVITY * (dt / 16.667), MAX_FALL)
      e.y += e.vy * (dt / 16.667)
      var landHit2 = this.collideTiles(e.x, e.y + e.h, e.w, 4)
      if (landHit2 && e.vy > 0) { e.y = landHit2.y - e.h; e.vy = 0 }
      var aheadX2 = e.vx > 0 ? e.x + e.w + 2 : e.x - 2
      var floor2 = this.collideTiles(aheadX2, e.y + e.h + 2, 4, 6)
      if (!floor2 && e.vy === 0) { e.x -= e.vx * (dt / 16.667); e.vx = -e.vx }
    } else if (e.kind === 'blooper') {
      /* 墨鱼: Z字追踪玩家 */
      e.t = (e.t || 0) + dt
      var dx = this.player.x - e.x
      var dy = this.player.y - e.y
      var dist = Math.sqrt(dx * dx + dy * dy) || 1
      var sp = 0.9
      e.x += (dx / dist) * sp * (dt / 16.667)
      e.y += (dy / dist) * sp * Math.sin(e.t / 150) * 1.8 * (dt / 16.667)
      /* 出屏后从另一侧回来 */
      if (e.y > WORLD_GROUND_Y * TILE || e.y < -TILE * 2) e.y = Math.max(TILE, Math.min(WORLD_GROUND_Y * TILE - TILE, e.y))
    } else if (e.kind === 'cheep') {
      /* 跳跳鱼: 反复从地面跳起 */
      if (e.wait > 0) {
        e.wait -= dt
        keep.push(e)
        continue
      }
      e.vy = Math.min(e.vy + GRAVITY * 0.5 * (dt / 16.667), 6)
      e.y += e.vy * (dt / 16.667)
      e.x += e.vx * (dt / 16.667)
      /* 落回地面下方后等一会再跳 */
      if (e.y >= (WORLD_GROUND_Y + 1) * TILE) {
        e.y = (WORLD_GROUND_Y + 1) * TILE
        e.vy = -10
        e.wait = 1500 + Math.random() * 2000
      }
    } else if (e.kind === 'hammer') {
      /* 锤子龟: 跳跃+扔锤子 */
      if (e.isProjectile) {
        /* 锤子飞行物 */
        e.vy = Math.min(e.vy + GRAVITY * (dt / 16.667), 8)
        e.x += e.vx * (dt / 16.667)
        e.y += e.vy * (dt / 16.667)
        e.life--
        if (e.life <= 0) e.alive = false
        keep.push(e)
        continue
      }
      e.t = (e.t || 0) + dt
      if (!e.vy) e.vy = 0
      e.vy = Math.min(e.vy + GRAVITY * (dt / 16.667), MAX_FALL)
      e.x += e.vx * (dt / 16.667)
      e.y += e.vy * (dt / 16.667)
      var hbLand = this.collideTiles(e.x, e.y + e.h, e.w, 4)
      if (hbLand && e.vy > 0) { e.y = hbLand.y - e.h; e.vy = 0 }
      /* 撞墙掉头 */
      var hbWall = this.collideTiles(e.vx > 0 ? e.x + e.w + 2 : e.x - 2, e.y + 4, 2, e.h - 8)
      if (hbWall) e.vx = -e.vx
      /* 每隔1.5秒跳一下 */
      if (e.vy === 0 && e.t > 1500) { e.vy = -6; e.t = 0 }
      /* 每隔2秒扔锤子 */
      e.throwT = (e.throwT || 0) + dt
      if (e.throwT > 2000 && e.x > this.player.x - 200 && e.x < this.player.x + 400) {
        e.throwT = 0
        var dir = this.player.x > e.x ? 1 : -1
        this.enemies.push({
          x: e.x + e.w / 2, y: e.y, w: TILE * 0.6, h: TILE * 0.6,
          vx: dir * 3, vy: -5, alive: true, squashed: false, squashT: 0, walk: 0,
          kind: 'hammer', isProjectile: true, t: 0, life: 120,
        })
      }
    } else if (e.kind === 'lakitu') {
      /* 云龟: 跟随玩家, 扔刺龟蛋 */
      var targetX = this.player.x - TILE
      e.x += (targetX - e.x) * 0.03
      e.y = (this.player.y - 4 * TILE) + Math.sin(e.t / 500) * TILE
      e.t = (e.t || 0) + dt
      e.throwT = (e.throwT || 0) + dt
      if (e.throwT > 2500 && e.alive) {
        e.throwT = 0
        /* 在玩家正上方扔蛋 */
        this.enemies.push({
          x: this.player.x, y: e.y + TILE, w: TILE, h: TILE,
          vx: 0.3, vy: 1, alive: true, squashed: false, squashT: 0, walk: 0,
          kind: 'spiny', fromLakitu: true,
        })
      }
    } else if (e.kind === 'firebar') {
      /* 火焰棒: 旋转 */
      e.angle += e.speed * (dt / 16.667)
    } else {
      /* 默认: 地面行走 (goomba/koopa/buzzy) */
      e.x += e.vx * (dt / 16.667)
      /* 重力: 没地面就往下掉 */
      if (!e.vy) e.vy = 0
      e.vy = Math.min(e.vy + GRAVITY * (dt / 16.667), MAX_FALL)
      e.y += e.vy * (dt / 16.667)
      /* 落地检测 */
      var landHit = this.collideTiles(e.x, e.y + e.h, e.w, 4)
      if (landHit && e.vy > 0) {
        e.y = landHit.y - e.h
        e.vy = 0
      }
      var aheadX = e.vx > 0 ? e.x + e.w + 2 : e.x - 2
      var belowY = e.y + e.h + 2
      var wall = this.collideTiles(aheadX, e.y + 4, 2, e.h - 8)
      var floor = this.collideTiles(aheadX, belowY, 4, 6)
      /* 判断是否地面怪物 (初始 y 在地面高度) */
      var isGroundEnemy = (e.startY == null) || (e.startY >= (WORLD_GROUND_Y - 1.5) * TILE)
      /* 只有撞墙才掉头; 地面怪物走到边缘也掉头, 砖块上的怪物走到边缘掉下去 */
      if (wall) {
        e.x -= e.vx * (dt / 16.667)
        e.vx = -e.vx
      } else if (!floor && isGroundEnemy && e.vy === 0) {
        /* 地面怪物走到平台边缘会掉头 */
        e.x -= e.vx * (dt / 16.667)
        e.vx = -e.vx
      }
      e.walk += dt / 90
    }

    /* ===== 与玩家碰撞 ===== */
    /* 帕拉火球在岩浆里等待时不碰撞 */
    if (e.kind === 'podoboo' && e.t <= e.wait) {
      keep.push(e)
      continue
    }
    if (rectsHit(p.x, p.y, p.w, p.h, e.x, e.y, e.w, e.h)) {
      if (p.starTimer > 0) {
        e.alive = false
        e.squashed = true
        e.squashT = 0.5
        this.score += 200
      } else if (e.kind === 'spiny' || e.kind === 'piranha' || e.kind === 'podoboo' || e.kind === 'lavaFireball' || e.kind === 'blooper' || e.kind === 'cheep' || e.kind === 'firebar' || (e.kind === 'hammer' && e.isProjectile)) {
        /* 不能踩的敌人 */
        if (this.invuln <= 0) this.hurtPlayer()
      } else if (e.kind === 'paratroopa_g' || e.kind === 'paratroopa_r') {
        /* 飞龟: 踩一下变普通龟 */
        var stompingPT = p.vy > 0 || (this.playerBottomPrev <= e.y)
        if (stompingPT) {
          e.kind = 'koopa'
          e.baseY = e.baseY || e.y
          e.vx = e.vx || -ENEMY_SPD
          e.x = p.x + (p.w - e.w) / 2
          p.vy = STOMP_V
          p.onGround = false
          this.score += 200
        } else if (this.invuln <= 0) {
          this.hurtPlayer()
          keep.push(e)
          continue
        }
      } else if (p.vy > 0 || this.playerBottomPrev <= e.y) {
        /* 下落踩怪 (即使本帧同时落地把vy清零也能踩) */
        e.alive = false
        e.squashed = true
        e.squashT = 0.5
        e.x = p.x + (p.w - e.w) / 2
        e.y = (WORLD_GROUND_Y - 1) * TILE
        p.vy = STOMP_V
        p.onGround = false
        this.score += 100
      } else if (this.invuln <= 0) {
        this.hurtPlayer()
        keep.push(e)
        continue
      }
    }
    keep.push(e)
  }
  this.enemies = keep
}

/* 库巴 BOSS 更新 */
Game.prototype.updateBoss = function (dt) {
  var b = this.boss
  var p = this.player
  if (!b || !b.alive) return
  /* 巡逻: 撞墙/无地面掉头 */
  b.x += b.vx * (dt / 16.667)
  var aheadX = b.vx > 0 ? b.x + b.w + 2 : b.x - 2
  var wall = this.collideTiles(aheadX, b.y + 4, 2, b.h - 8)
  var floor = this.collideTiles(aheadX, b.y + b.h + 2, 4, 6)
  if (wall || !floor) {
    b.x -= b.vx * (dt / 16.667)
    b.vx = -b.vx
  }
  b.walk += dt / 60
  /* 喷火 */
  b.fireT -= dt
  if (b.fireT <= 0) {
    b.fireT = 2200
    var dir = p.x > b.x ? 1 : -1
    this.fireballs.push({
      x: b.x + b.w / 2 - TILE / 2,
      y: b.y + 12,
      w: TILE,
      h: TILE,
      vx: dir * 2.2,
      vy: -1.2,
      alive: true,
      t: 0,
      enemy: true,
    })
  }
  /* 与玩家碰撞 */
  if (rectsHit(p.x, p.y, p.w, p.h, b.x, b.y, b.w, b.h)) {
    if (p.starTimer > 0) {
      this.hurtBoss(3)
      p.vy = STOMP_V
      p.onGround = false
      return
    }
    if (this.invuln > 0) return
    var stomping = p.vy > 0 && this.playerBottomPrev <= b.y + 6
    if (stomping) {
      /* 踩库巴普通形态无效, 弹开 */
      p.vy = STOMP_V
      p.onGround = false
    } else {
      this.hurtPlayer()
    }
  }
}

/* ---------- 道具/粒子 ---------- */

Game.prototype.updateItems = function (dt) {
  var p = this.player
  for (var i = 0; i < this.coinItems.length; i++) {
    var c = this.coinItems[i]
    if (!c.active) continue
    c.t += dt / 90
    if (rectsHit(p.x, p.y, p.w, p.h, c.x, c.y, c.w, c.h)) {
      c.active = false
      this.coins++
      this.score += 200
      if (this.coins % 100 === 0) this.lives++
    }
  }

  /* 强化道具 */
  var keepPu = []
  for (var k = 0; k < this.powerups.length; k++) {
    var u = this.powerups[k]
    if (!u.active) continue
    u.t += dt / 16.667
    if (u.kind !== 'flower') {
      /* 重力 + 水平移动 + 撞墙/落地 */
      u.vy = Math.min(u.vy + GRAVITY * (dt / 16.667), MAX_FALL)
      var steps = Math.abs(u.vy)
      var dirY = u.vy > 0 ? 1 : -1
      var guardY = 0
      while (steps > 0 && guardY < 6) {
        var dY = Math.min(steps, 4)
        u.y += dirY * dY
        steps -= dY
        guardY++
        var hitY = this.collideTiles(u.x, u.y, u.w, u.h)
        if (hitY) {
          if (dirY > 0) { u.y = hitY.y - u.h; u.vy = 0 }
          else { u.y = hitY.y + hitY.h; u.vy = 0.4 }
          break
        }
      }
      var stX = Math.abs(u.vx)
      var dirX = u.vx > 0 ? 1 : -1
      var guardX = 0
      while (stX > 0 && guardX < 6) {
        var dX = Math.min(stX, 4)
        u.x += dirX * dX
        stX -= dX
        guardX++
        var hitX = this.collideTiles(u.x, u.y, u.w, u.h)
        if (hitX) {
          if (dirX > 0) u.x = hitX.x - u.w
          else u.x = hitX.x + hitX.w
          u.vx = -u.vx
          break
        }
      }
      if (u.x < -TILE || u.x > this.worldW + TILE || u.y > this.worldH + 120) continue
    }
    /* 拾取 */
    if (rectsHit(p.x, p.y, p.w, p.h, u.x, u.y, u.w, u.h)) {
      u.active = false
      if (u.kind === 'mushroom') {
        if (p.power === 'small') this.setPower('super')
        this.score += 1000
        this.particles.push({ kind: 'text', x: p.x, y: p.y - 8, t: 0 })
      } else if (u.kind === 'flower') {
        if (p.power === 'small') this.setPower('super')
        this.setPower('fire')
        this.score += 1000
        this.particles.push({ kind: 'text', x: p.x, y: p.y - 8, t: 0 })
      } else if (u.kind === 'star') {
        p.starTimer = 10000
        this.score += 1000
      } else if (u.kind === '1up') {
        this.lives++
        this.score += 1000
      }
      continue
    }
    keepPu.push(u)
  }
  this.powerups = keepPu

  /* 火球 */
  var keepFb = []
  for (var m = 0; m < this.fireballs.length; m++) {
    var f = this.fireballs[m]
    if (!f.alive) continue
    f.t += dt / 16.667
    if (f.enemy) {
      /* 敌方火球 (库巴): 碰玩家受伤, 碰墙消失 */
      if (rectsHit(f.x, f.y, f.w, f.h, p.x, p.y, p.w, p.h)) {
        this.hurtPlayer()
        f.alive = false
        continue
      }
      f.vy = Math.min(f.vy + GRAVITY * (dt / 16.667), MAX_FALL)
      f.x += f.vx * (dt / 16.667)
      f.y += f.vy * (dt / 16.667)
      if (this.collideTiles(f.x, f.y, f.w, f.h)) {
        f.alive = false
        continue
      }
      if (f.y > this.worldH + 80) {
        f.alive = false
        continue
      }
      keepFb.push(f)
      continue
    }
    f.vy = Math.min(f.vy + GRAVITY * (dt / 16.667), MAX_FALL)
    /* 水平 */
    f.x += f.vx * (dt / 16.667)
    var hx = this.collideTiles(f.x, f.y, f.w, f.h)
    if (hx) {
      f.alive = false
      continue
    }
    /* 垂直+弹跳 */
    f.y += f.vy * (dt / 16.667)
    var hy = this.collideTiles(f.x, f.y, f.w, f.h)
    if (hy) {
      if (f.vy > 0) {
        f.y = hy.y - f.h
        f.vy = -4.8
      } else {
        f.y = hy.y + hy.h
        f.vy = 0.6
      }
    }
    /* 与敌人 */
    var killed = false
    for (var n = 0; n < this.enemies.length; n++) {
      var en = this.enemies[n]
      if (!en.alive) continue
      if (rectsHit(f.x, f.y, f.w, f.h, en.x, en.y, en.w, en.h)) {
        en.alive = false
        en.squashed = true
        en.squashT = 0.4
        this.score += 200
        killed = true
        break
      }
    }
    if (killed) {
      f.alive = false
      continue
    }
    /* 与 boss */
    if (this.boss && this.boss.alive && rectsHit(f.x, f.y, f.w, f.h, this.boss.x, this.boss.y, this.boss.w, this.boss.h)) {
      f.alive = false
      this.hurtBoss(1)
      continue
    }
    if (f.x < -TILE || f.x > this.worldW + TILE || f.y > this.worldH + 80) continue
    keepFb.push(f)
  }
  this.fireballs = keepFb

  var keep = []
  for (var j = 0; j < this.particles.length; j++) {
    var pt = this.particles[j]
    pt.t += dt / 1000
    if (pt.kind === 'coinpop') {
      pt.y += pt.vy * (dt / 16.667)
      pt.vy += 0.35 * (dt / 16.667)
      if (pt.t < 0.5) keep.push(pt)
    } else if (pt.kind === 'debris') {
      pt.x += pt.vx * (dt / 16.667)
      pt.y += pt.vy * (dt / 16.667)
      pt.vy += 0.5 * (dt / 16.667)
      if (pt.t < 1.2) keep.push(pt)
    } else if (pt.kind === 'text') {
      pt.y -= 0.8 * (dt / 16.667)
      if (pt.t < 0.8) keep.push(pt)
    }
  }
  this.particles = keep
}

/* 库巴受伤/死亡 */
Game.prototype.hurtBoss = function (dmg) {
  var b = this.boss
  if (!b || !b.alive) return
  b.hp = (b.hp || 5) - dmg
  if (b.hp <= 0) {
    b.alive = false
    this.score += 5000
    this.particles.push({ kind: 'text', x: b.x, y: b.y - 8, t: 0 })
  }
}

/* 玩家受伤: super/fire 降级, small 死亡 */
Game.prototype.hurtPlayer = function () {
  var p = this.player
  if (this.invuln > 0 || p.starTimer > 0) return
  if (p.power === 'super' || p.power === 'fire') {
    this.setPower('small')
    this.invuln = 1500
  } else {
    this.killPlayer(false)
  }
}

/* ---------- 死亡/过关 ---------- */

Game.prototype.killPlayer = function (fall) {
  if (this.state !== 'playing') return
  this.state = 'dead'
  this.stateTimer = 0
  var p = this.player
  p.vy = fall ? -4 : DEAD_V
  p.vx = 0
  this.input.left = false
  this.input.right = false
  this.input.jump = false
}

Game.prototype.updateStateMachine = function (dt) {
  if (this.state === 'dead') {
    this.stateTimer += dt
    var p = this.player
    p.vy += GRAVITY * (dt / 16.667)
    p.y += p.vy * (dt / 16.667)
    if (this.stateTimer > 1600) {
      this.lives--
      if (this.lives <= 0) {
        this.state = 'gameover'
        if (this.hooks.onGameOver) this.hooks.onGameOver(this.getState())
      } else {
        this.loadLevel(this.level)
      }
    }
  } else if (this.state === 'clear') {
    this.stateTimer += dt
    var pl = this.player
    pl.x += 1.1 * (dt / 16.667)
    if (this.stateTimer > 2400) {
      this.level++
      this.score += 1000
      this.loadLevel(this.level)
      if (this.hooks.onClear) this.hooks.onClear(this.getState())
    }
  }
}

/* ---------- 主循环 ---------- */

Game.prototype.tick = function (dtMs) {
  this.animT += dtMs
  /* 岩浆喷火球: 每隔 3 秒朝周围 120 度扇形发射一个火球 */
  if (this.lavaList && this.lavaList.length > 0) {
    if (!this.lavaFireT) this.lavaFireT = 0
    this.lavaFireT += dtMs
    if (this.lavaFireT >= 3000) {
      this.lavaFireT = 0
      this.shootLavaFireball()
    }
  }
  if (this.state !== 'playing') {
    this.updateStateMachine(dtMs)
    return
  }

  var p = this.player
  var dt = dtMs

  /* 记录玩家上一帧底部位置 (用于踩踏判定, 防止穿过敌人落地后误判) */
  this.playerBottomPrev = p.y + p.h

  /* 计时 */
  this.time -= dt / 1000
  if (this.time <= 0) {
    this.time = 0
    this.killPlayer(true)
    return
  }

  /* 输入 */
  var left = this.input.left
  var right = this.input.right
  var wantJump = this.input.jump && !this.input.prevJump
  this.input.prevJump = this.input.jump

  if (left && !right) {
    p.vx = -MOVE_SPD
    p.facing = -1
  } else if (right && !left) {
    p.vx = MOVE_SPD
    p.facing = 1
  } else {
    p.vx = 0
  }

  if (wantJump && p.onGround) {
    p.vy = JUMP_V
    p.onGround = false
    p.jumpHold = 0
  }

  /* 移动 */
  this.movePlayerX()
  /* 长按跳跃: 按住时上升阶段重力减半 -> 跳得更高; 但最多保持 JUMP_HOLD_MAX 毫秒 */
  var g = GRAVITY
  if (this.input.jump && p.vy < 0) {
    p.jumpHold = (p.jumpHold || 0) + dt
    if (p.jumpHold < JUMP_HOLD_MAX) g *= 0.42
  }
  p.vy = Math.min(p.vy + g * (dt / 16.667), MAX_FALL)
  p.onGround = false
  this.movePlayerY()

  if (p.onGround && p.vx !== 0) p.walk += dt / 110
  if (this.invuln > 0) this.invuln -= dt
  /* 砖块抖动递减 */
  for (var bi = 0; bi < this.tiles.length; bi++) {
    if (this.tiles[bi].bumpT > 0) this.tiles[bi].bumpT -= dt / 1000
  }

  /* 敌人/道具 */
  this.updateEnemies(dt)
  this.updateItems(dt)
  if (this.boss) this.updateBoss(dt)

  /* 无敌星倒计时 */
  if (p.starTimer > 0) {
    p.starTimer -= dt
    if (p.starTimer < 0) p.starTimer = 0
  }

  /* 斧头拾取 → 断桥通关 */
  if (this.axe && !this.axe.taken && this.state === 'playing' &&
      rectsHit(p.x, p.y, p.w, p.h, this.axe.x, this.axe.y, this.axe.w, this.axe.h)) {
    this.axe.taken = true
    if (this.boss) {
      this.boss.alive = false
      this.score += 5000
    }
    this.score += 500
    this.state = 'clear'
    this.stateTimer = 0
  }

  /* 相机 */
  var target = p.x - 320
  if (target > this.camX) this.camX = target
  if (p.x < this.camX + 160) this.camX = Math.max(0, p.x - 160)
  this.camX = Math.max(0, Math.min(this.camX, this.worldW - VIEW_W))

  /* 过关: 碰到旗杆才通关 (flagX>0 表示有关卡有旗杆) */
  if (this.flagX > 0 && p.x + p.w > this.flagX) {
    this.state = 'clear'
    this.stateTimer = 0
    this.score += 500
  }
}

/* ---------- 渲染 ---------- */

Game.prototype.render = function () {
  var ctx = this.ctx
  var cam = Math.round(this.camX)
  ctx.fillStyle = this.theme === 'underground' ? C_UNDER_BG : (this.theme === 'castle' ? C_CASTLE_BG : C_SKY)
  ctx.fillRect(0, 0, VIEW_W, VIEW_H)

  this.renderBackdrop(ctx, cam)
  this.renderTiles(ctx, cam)

  /* 悬空金币 */
  for (var i = 0; i < this.coinItems.length; i++) {
    var c = this.coinItems[i]
    if (!c.active || c.x + c.w < cam || c.x > cam + VIEW_W) continue
    this.drawCoin(ctx, c.x - cam + TILE / 2, c.y + TILE / 2, c.t)
  }

  /* 敌人 */
  for (var j = 0; j < this.enemies.length; j++) {
    var e = this.enemies[j]
    if (e.x + e.w < cam || e.x > cam + VIEW_W) continue
    if (!e.alive) {
      /* 踩扁 */
      ctx.fillStyle = C_BROWN
      ctx.fillRect(e.x, e.y + e.h - 8, e.w, 8)
      continue
    }
    var spr
    if (e.kind === 'koopa' || e.kind === 'redkoopa' || e.kind === 'paratroopa_g' || e.kind === 'paratroopa_r') {
      spr = KOOPA
    } else if (e.kind === 'lavaFireball') {
      /* 岩浆火球: 橙红火球 */
      ctx.fillStyle = '#ff3300'
      ctx.fillRect(e.x - cam + 2, e.y + 2, e.w - 4, e.h - 4)
      ctx.fillStyle = '#ff9900'
      ctx.fillRect(e.x - cam + 5, e.y + 5, e.w - 10, e.h - 10)
      ctx.fillStyle = '#ffff00'
      ctx.fillRect(e.x - cam + 8, e.y + 8, e.w - 16, e.h - 16)
      continue
    } else if (e.kind === 'spiny') {
      /* 刺龟: 黑色圆身 + 红刺 */
      ctx.fillStyle = '#222'
      ctx.fillRect(e.x - cam + 2, e.y + 6, e.w - 4, e.h - 8)
      ctx.fillStyle = '#c00'
      ctx.fillRect(e.x - cam + 6, e.y + 2, 4, 6)
      ctx.fillRect(e.x - cam + 14, e.y + 2, 4, 6)
      ctx.fillRect(e.x - cam + 10, e.y, 4, 6)
      continue
    } else if (e.kind === 'bulletbill') {
      /* 子弹比尔: 黑色子弹头 */
      ctx.fillStyle = '#222'
      ctx.fillRect(e.x - cam + 4, e.y + 6, e.w - 4, e.h - 12)
      ctx.fillStyle = '#fff'
      ctx.fillRect(e.x - cam + 14, e.y + 9, 4, 4)
      continue
    } else if (e.kind === 'podoboo') {
      /* 帕拉火球: 橙红火球 + 火焰纹理 */
      ctx.fillStyle = '#ff3300'
      ctx.fillRect(e.x - cam + 2, e.y + 2, e.w - 4, e.h - 4)
      ctx.fillStyle = '#ff9900'
      ctx.fillRect(e.x - cam + 5, e.y + 5, e.w - 10, e.h - 10)
      ctx.fillStyle = '#ffff00'
      ctx.fillRect(e.x - cam + 8, e.y + 8, e.w - 16, e.h - 16)
      continue
    } else if (e.kind === 'piranha') {
      /* 食人花单独在管道后面渲染 */
      continue
    } else if (e.kind === 'buzzy') {
      /* 硬壳虫: 黑色圆壳 */
      ctx.fillStyle = '#333'
      ctx.fillRect(e.x - cam + 2, e.y + 4, e.w - 4, e.h - 6)
      ctx.fillStyle = '#666'
      ctx.fillRect(e.x - cam + 6, e.y + 8, e.w - 12, e.h - 14)
      continue
    } else if (e.kind === 'blooper') {
      /* 墨鱼: 白色鱿鱼 */
      ctx.fillStyle = '#fff'
      ctx.fillRect(e.x - cam + 4, e.y + 2, e.w - 8, e.h - 8)
      ctx.fillStyle = '#000'
      ctx.fillRect(e.x - cam + 8, e.y + 6, 3, 3)
      ctx.fillRect(e.x - cam + 14, e.y + 6, 3, 3)
      /* 触手 */
      ctx.fillRect(e.x - cam + 6, e.y + e.h - 6, 3, 4)
      ctx.fillRect(e.x - cam + 11, e.y + e.h - 6, 3, 4)
      ctx.fillRect(e.x - cam + 16, e.y + e.h - 6, 3, 4)
      continue
    } else if (e.kind === 'cheep') {
      /* 跳跳鱼: 红色鱼 */
      ctx.fillStyle = '#e00'
      ctx.fillRect(e.x - cam + 2, e.y + 6, e.w - 4, e.h - 12)
      ctx.fillStyle = '#a00'
      ctx.fillRect(e.x - cam + 4, e.y + 8, e.w - 8, e.h - 16)
      ctx.fillStyle = '#fff'
      ctx.fillRect(e.x - cam + 16, e.y + 8, 3, 3)
      continue
    } else if (e.kind === 'hammer') {
      /* 锤子龟: 绿龟身体+头盔+锤子 */
      ctx.fillStyle = '#33aa33'
      ctx.fillRect(e.x - cam + 2, e.y + 6, e.w - 4, e.h - 8)
      ctx.fillStyle = '#ccaa22'
      ctx.fillRect(e.x - cam + 4, e.y + 10, e.w - 8, e.h - 14)
      /* 头盔 */
      ctx.fillStyle = '#333'
      ctx.fillRect(e.x - cam + 1, e.y, e.w - 2, 7)
      /* 锤子 */
      ctx.fillStyle = '#aa8844'
      ctx.fillRect(e.x - cam - 2, e.y + 8, 6, 4)
      ctx.fillRect(e.x - cam + e.w - 4, e.y + 8, 6, 4)
      continue
    } else if (e.kind === 'lakitu') {
      /* 云龟: 白云+龟 */
      ctx.fillStyle = '#fff'
      ctx.fillRect(e.x - cam - 2, e.y + e.h - 4, e.w + 4, 6)
      ctx.fillRect(e.x - cam + 2, e.y + e.h - 8, e.w - 4, 6)
      ctx.fillStyle = '#33aa33'
      ctx.fillRect(e.x - cam + 4, e.y + 2, e.w - 8, e.h - 6)
      ctx.fillStyle = '#ccaa22'
      ctx.fillRect(e.x - cam + 6, e.y + 6, e.w - 12, e.h - 12)
      /* 眼镜 */
      ctx.fillStyle = '#000'
      ctx.fillRect(e.x - cam + 8, e.y + 5, 2, 2)
      ctx.fillRect(e.x - cam + 14, e.y + 5, 2, 2)
      continue
    } else if (e.kind === 'firebar') {
      /* 火焰棒: 旋转火球串 */
      var cx = e.x - cam + e.w / 2
      var cy = e.y + e.h / 2
      for (var fi = 0; fi < e.len; fi++) {
        var fa = e.angle + fi * 0.5
        var fx = cx + Math.cos(fa) * (fi + 1) * TILE * 0.5
        var fy = cy + Math.sin(fa) * (fi + 1) * TILE * 0.5
        ctx.fillStyle = '#ff3300'
        ctx.fillRect(fx - 5, fy - 5, 10, 10)
        ctx.fillStyle = '#ffcc00'
        ctx.fillRect(fx - 3, fy - 3, 6, 6)
      }
      continue
    } else {
      spr = Math.floor(e.walk) % 2 === 0 ? GOOMBA : GOOMBA_WALK
    }
    /* 红龟/红飞龟: 红色壳 */
    if (e.kind === 'redkoopa' || e.kind === 'paratroopa_r') {
      ctx.fillStyle = '#c00'
      ctx.fillRect(e.x - cam + 2, e.y + 2, e.w - 4, e.h - 4)
    }
    /* 飞龟: 加白色翅膀 */
    if (e.kind === 'paratroopa_g' || e.kind === 'paratroopa_r') {
      ctx.fillStyle = '#fff'
      ctx.fillRect(e.x - cam - 2, e.y + 2, 6, 8)
      ctx.fillRect(e.x - cam + e.w - 4, e.y + 2, 6, 8)
    }
    drawSprite(ctx, spr, undefined, e.x - cam, e.y, e.vx > 0)
  }

  /* 强化道具 */
  for (var u = 0; u < this.powerups.length; u++) {
    var pu = this.powerups[u]
    if (!pu.active || pu.x + pu.w < cam || pu.x > cam + VIEW_W) continue
    if (pu.kind === 'mushroom') {
      drawSprite(ctx, MUSHROOM, undefined, pu.x - cam, pu.y, false)
    } else if (pu.kind === 'flower') {
      var fi = Math.floor(this.animT / 110) % FLOWER.length
      drawSprite(ctx, FLOWER[fi], undefined, pu.x - cam, pu.y, false)
    } else if (pu.kind === '1up') {
      drawSprite(ctx, ITEM_MUSHROOM_1UP, undefined, pu.x - cam, pu.y, false)
    } else {
      drawSprite(ctx, ITEM_STAR, undefined, pu.x - cam, pu.y, false)
    }
  }

  /* 火球 */
  for (var fb = 0; fb < this.fireballs.length; fb++) {
    var f = this.fireballs[fb]
    if (!f.alive || f.x + f.w < cam || f.x > cam + VIEW_W) continue
    ctx.fillStyle = C_ORANGE
    ctx.fillRect(f.x - cam + 2, f.y + 2, f.w - 4, f.h - 4)
    ctx.fillStyle = C_COIN
    ctx.fillRect(f.x - cam + 5, f.y + 5, f.w - 10, f.h - 10)
  }

  /* 库巴 BOSS */
  if (this.boss && this.boss.alive) {
    var b = this.boss
    if (b.x + b.w > cam && b.x < cam + VIEW_W) {
      drawSprite(ctx, KOOPA, 4, b.x - cam, b.y, b.vx > 0)
    }
  }

  /* 斧头 */
  if (this.axe && !this.axe.taken) {
    var ax = this.axe
    if (ax.x + ax.w > cam && ax.x < cam + VIEW_W) {
      ctx.fillStyle = '#9aa0ae'
      ctx.fillRect(ax.x - cam, ax.y + 6, 5, 18)
      ctx.fillRect(ax.x - cam + 14, ax.y + 6, 5, 18)
      ctx.fillStyle = '#e8a05a'
      ctx.beginPath()
      ctx.moveTo(ax.x - cam, ax.y + 6)
      ctx.lineTo(ax.x - cam + 4, ax.y - 2)
      ctx.lineTo(ax.x - cam + 16, ax.y + 2)
      ctx.lineTo(ax.x - cam + 16, ax.y + 10)
      ctx.lineTo(ax.x - cam + 4, ax.y + 6)
      ctx.closePath()
      ctx.fill()
    }
  }

  this.renderPlayer(ctx, cam)
  this.renderParticles(ctx, cam)

  if (this.state !== 'idle') this.renderHUD(ctx)
  this.renderControls(ctx)
  this.renderOverlay(ctx)
}

Game.prototype.renderBackdrop = function (ctx, cam) {
  if (this.theme === 'castle') {
    /* 城堡: 黑砖墙 + 底部熔岩带 */
    var cw = -((cam * 0.15) % 24)
    ctx.fillStyle = '#2a2a30'
    ctx.fillRect(0, 0, VIEW_W, VIEW_H)
    ctx.fillStyle = '#3a3a42'
    for (var cx = cw; cx < VIEW_W; cx += 24) {
      ctx.fillRect(cx, 0, 6, VIEW_H)
    }
    ctx.fillStyle = '#201c18'
    for (var cy = 0; cy < VIEW_H; cy += 12) {
      var coff = (Math.floor(cy / 24) % 2) * 12
      ctx.fillRect(cw + coff, cy, VIEW_W, 2)
    }
    return
  }

  if (this.theme === 'underground') {
    /* 地下: 深蓝色背景 */
    ctx.fillStyle = '#000020'
    ctx.fillRect(0, 0, VIEW_W, VIEW_H)
    return
  }
  if (this.theme === 'castle') {
    /* 城堡: 黑色背景 */
    ctx.fillStyle = '#000000'
    ctx.fillRect(0, 0, VIEW_W, VIEW_H)
    return
  }

  /* 远山 (视差 0.2), 贴图平铺, 山底延伸地面顶 (240) 消除缝隙 */
  var m1 = -((cam * 0.2) % 640)
  for (var i = 0; i < 3; i++) {
    var mx = m1 + i * 640
    this.drawHill(ctx, mx + 60, WORLD_GROUND_Y * TILE, 190)
  }
  var m2 = -((cam * 0.35) % 900)
  for (var k = 0; k < 2; k++) {
    var mxx = m2 + k * 900
    this.drawHill(ctx, mxx + 120, WORLD_GROUND_Y * TILE, 240)
  }

  /* 云 (视差 0.5) */
  var c1 = -((cam * 0.5) % 600)
  ctx.fillStyle = '#ffffff'
  for (var q = 0; q < 3; q++) {
    var cx = c1 + q * 600
    this.drawCloud(ctx, cx + 40, 50, 1.1)
    this.drawCloud(ctx, cx + 380, 92, 0.8)
  }
}

Game.prototype.drawHill = function (ctx, x, baseY, w) {
  /* 原版山贴图 (HILL 28x17 字符, scale2 => 56x34px), 平铺成连绵山 */
  var n = Math.max(1, Math.round(w / 56))
  for (var i = 0; i < n; i++) {
    drawSprite(ctx, HILL, 2, x + i * 56, baseY - 34, false)
  }
  /* 补平贴图底部缺口, 保证与地面无缝 */
  ctx.fillStyle = '#0d9300'
  ctx.fillRect(x, baseY - 2, w, 2)
}

Game.prototype.drawCloud = function (ctx, x, y, s) {
  var spr = s >= 1 ? CLOUD : CLOUD_S
  drawSprite(ctx, spr, 2, x, y, false)
}

Game.prototype.renderTiles = function (ctx, cam) {
  /* 主题色板: underground 青蓝, castle 灰, overworld 橙 */
  var themeCM = null
  if (this.theme === 'underground') {
    themeCM = { '#c75100': '#2890d0', '#e44c00': '#40b0e8', '#7c0e00': '#105080', '#000000': '#000030' }
  } else if (this.theme === 'castle') {
    themeCM = { '#c75100': '#909090', '#e44c00': '#b0b0b0', '#7c0e00': '#505050', '#000000': '#000000' }
  }
  for (var i = 0; i < this.tiles.length; i++) {
    var t = this.tiles[i]
    if (t.dead || t.x + t.w < cam || t.x > cam + VIEW_W) continue
    var sx = t.x - cam
    if (t.type === 'ground') {
      /* 地面: 纯色填充 (无贴图, 省性能) */
      ctx.fillStyle = this.theme === 'underground' || this.theme === 'castle' ? '#3a6ea5' : '#c84c0c'
      ctx.fillRect(sx, t.y, t.w, t.h)
      /* 顶面草线 */
      ctx.fillStyle = this.theme === 'underground' || this.theme === 'castle' ? '#7ab8e0' : '#e87820'
      ctx.fillRect(sx, t.y, t.w, 4)
      /* 砖缝 */
      ctx.fillStyle = this.theme === 'underground' || this.theme === 'castle' ? '#2a5a8a' : '#8a330c'
      var gx2 = Math.ceil(t.w / TILE)
      for (var gg2 = 0; gg2 <= gx2; gg2++) {
        ctx.fillRect(sx + gg2 * TILE, t.y, 2, Math.min(12, t.h))
      }
    } else if (t.type === 'lava') {
      /* 岩浆: 橙红色 + 黄色波纹 */
      ctx.fillStyle = '#ff4400'
      ctx.fillRect(sx, t.y, t.w, t.h)
      ctx.fillStyle = '#ffaa00'
      var wave = Math.floor(this.animT / 200) % 2
      for (var wx = 0; wx < t.w; wx += TILE) {
        ctx.fillRect(sx + wx + wave * 4, t.y + 2, 12, 4)
      }
      ctx.fillStyle = '#ff6600'
      ctx.fillRect(sx, t.y + t.h - 4, t.w, 4)
    } else if (t.type === 'brick') {
      var bY = t.bumpT > 0 ? t.y - Math.sin(t.bumpT * 30) * 4 : t.y
      drawSprite(ctx, BRICK, undefined, sx, bY, false, themeCM)
    } else if (t.type === 'qblock') {
      if (t.used) {
        drawSprite(ctx, HARD, undefined, sx, t.y, false, themeCM)
      } else {
        var qi = Math.floor(this.animT / 110) % QBLOCK.length
        drawSprite(ctx, QBLOCK[qi], undefined, sx, t.y, false, themeCM)
      }
    } else if (t.type === 'hard') {
      drawSprite(ctx, HARD, undefined, sx, t.y, false, themeCM)
    }
  }

  /* 食人花 (在管道下面渲染, 弹出时花头露出) */
  for (var pi2 = 0; pi2 < this.enemies.length; pi2++) {
    var e = this.enemies[pi2]
    if (e.kind !== 'piranha' || !e.alive) continue
    if (e.x + e.w < cam || e.x > cam + VIEW_W) continue
    var cx = e.x - cam + e.w / 2
    var hh = e.h * 0.45
    ctx.fillStyle = '#0a0'
    ctx.fillRect(cx - 2, e.y + hh, 4, e.h - hh)
    ctx.fillStyle = '#f00'
    ctx.fillRect(e.x - cam + 1, e.y, e.w - 2, hh)
    ctx.fillStyle = '#fff'
    ctx.fillRect(e.x - cam + 3, e.y + 3, 3, 3)
    ctx.fillRect(e.x - cam + e.w - 6, e.y + 5, 3, 3)
    ctx.fillRect(cx - 1, e.y + hh - 6, 3, 3)
    ctx.fillStyle = '#f00'
    ctx.fillRect(e.x - cam, e.y + hh, e.w, 3)
    ctx.fillStyle = '#fff'
    ctx.fillRect(e.x - cam + 2, e.y + hh + 3, 2, 4)
    ctx.fillRect(e.x - cam + e.w - 4, e.y + hh + 3, 2, 4)
    ctx.fillRect(cx - 1, e.y + hh + 3, 2, 5)
  }

  /* 管道: 贴图 (顶盖 + 管身, 在食人花上面) */
  for (var p = 0; p < this.pipes.length; p++) {
    var pi = this.pipes[p]
    if (pi.x + pi.w < cam || pi.x > cam + VIEW_W) continue
    var psx = pi.x - cam
    var rows = Math.round(pi.h / TILE)
    drawSprite(ctx, PIPE_TOP_L, undefined, psx, pi.y, false)
    drawSprite(ctx, PIPE_TOP_R, undefined, psx + TILE, pi.y, false)
    for (var pr = 1; pr < rows; pr++) {
      drawSprite(ctx, PIPE_BODY_L, undefined, psx, pi.y + pr * TILE, false)
      drawSprite(ctx, PIPE_BODY_R, undefined, psx + TILE, pi.y + pr * TILE, false)
    }
  }

  /* 旗杆 */
  if (this.flagX > cam - 200 && this.flagX < cam + VIEW_W + 200) {
    var fx = this.flagX - cam
    var baseY = WORLD_GROUND_Y * TILE
    ctx.fillStyle = '#d8d8d8'
    ctx.fillRect(fx - 2, baseY - 140, 4, 140)
    ctx.fillStyle = C_COIN
    ctx.beginPath()
    ctx.arc(fx, baseY - 142, 7, 0, 6.283)
    ctx.fill()
    ctx.fillStyle = '#2fae5c'
    ctx.beginPath()
    ctx.moveTo(fx + 2, baseY - 138)
    ctx.lineTo(fx + 34, baseY - 128)
    ctx.lineTo(fx + 2, baseY - 118)
    ctx.closePath()
    ctx.fill()
    /* 旗杆底座 */
    ctx.fillStyle = C_BRICK
    ctx.fillRect(fx - 8, baseY - 6, 16, 6)
  }

  /* 城堡 */
  if (this.castleX > cam - 300 && this.castleX < cam + VIEW_W + 300) {
    this.renderCastle(ctx, this.castleX - cam)
  }
}

Game.prototype.renderCastle = function (ctx, x) {
  var baseY = WORLD_GROUND_Y * TILE
  /* 主体 */
  ctx.fillStyle = C_CASTLE
  ctx.fillRect(x, baseY - 84, 120, 84)
  ctx.fillStyle = C_CASTLE_DARK
  ctx.fillRect(x, baseY - 84, 120, 6)
  /* 垛口 */
  for (var i = 0; i < 5; i++) {
    ctx.fillRect(x + i * 24, baseY - 96, 14, 14)
  }
  /* 塔 */
  ctx.fillRect(x + 16, baseY - 150, 40, 70)
  ctx.fillStyle = C_CASTLE
  ctx.fillRect(x + 20, baseY - 150, 32, 66)
  /* 塔顶 */
  ctx.fillStyle = C_CASTLE_DARK
  ctx.fillRect(x + 18, baseY - 158, 36, 10)
  ctx.fillRect(x + 30, baseY - 168, 12, 10)
  /* 门 */
  ctx.fillStyle = C_BLACK
  ctx.fillRect(x + 44, baseY - 40, 32, 40)
  ctx.fillStyle = '#5d6270'
  ctx.fillRect(x + 44, baseY - 40, 32, 6)
  /* 窗 */
  ctx.fillStyle = C_QB_LIGHT
  ctx.fillRect(x + 12, baseY - 70, 10, 12)
  ctx.fillRect(x + 98, baseY - 70, 10, 12)
}

Game.prototype.renderPlayer = function (ctx, cam) {
  var p = this.player
  if (this.state === 'idle') return
  /* 无敌闪烁 */
  if (this.invuln > 0 && Math.floor(this.invuln / 120) % 2 === 0) return
  var fire = p.power === 'fire'
  var big = p.power === 'super' || fire
  var spr
  if (this.state === 'dead') {
    spr = DEAD
  } else if (!p.onGround) {
    spr = fire ? FIRE_JUMP : big ? BIG_JUMP : SMALL_JUMP
  } else if (p.vx !== 0) {
    var wf = Math.floor(p.walk) % 2
    if (fire) spr = wf === 0 ? FIRE_WALK[0] : FIRE_WALK[1]
    else if (big) spr = wf === 0 ? BIG_WALK[0] : BIG_WALK[1]
    else spr = wf === 0 ? SMALL_WALK[0] : SMALL_WALK[1]
  } else {
    spr = fire ? FIRE_STAND : big ? BIG_STAND : SMALL_STAND
  }
  /* 无敌星: 彩虹闪烁; 火焰: 红白换装 */
  var colorMap = null
  if (p.starTimer > 0) {
    var hue = Math.floor(this.animT / 100) % 4
    var palette = [C_COIN, C_RED, C_LIME, C_BLUE]
    var col = palette[hue]
    colorMap = function (color, ch) {
      if (ch === 'R' || ch === 'M' || ch === 'S') return col
      return color
    }
  } else if (fire) {
    colorMap = { '#e52521': C_FIRE }
  }
  /* 大马里奥贴图 48px 高, 不居中直接画; 小马里奥 24px 居中 */
  var sprScale = big ? 2 : undefined
  drawSprite(ctx, spr, sprScale, p.x - cam, p.y, p.facing < 0, colorMap)
}

Game.prototype.drawCoin = function (ctx, cx, cy, t) {
  /* 简单黄色金币 (圆形) */
  ctx.fillStyle = '#f8b020'
  ctx.beginPath()
  ctx.arc(cx, cy, 7, 0, 6.283)
  ctx.fill()
  ctx.fillStyle = '#e89010'
  ctx.beginPath()
  ctx.arc(cx, cy, 4, 0, 6.283)
  ctx.fill()
}

Game.prototype.renderParticles = function (ctx, cam) {
  for (var i = 0; i < this.particles.length; i++) {
    var pt = this.particles[i]
    var sx = pt.x - cam
    if (pt.kind === 'coinpop') {
      this.drawCoin(ctx, sx, pt.y, 0.6)
    } else if (pt.kind === 'debris') {
      ctx.fillStyle = C_BRICK
      ctx.fillRect(sx - 3, pt.y - 3, 7, 7)
    } else if (pt.kind === 'text') {
      ctx.fillStyle = C_WHITE
      ctx.font = 'bold 14px sans-serif'
      ctx.textAlign = 'center'
      ctx.fillText(pt.text || '1000', sx, pt.y)
    }
  }
}

Game.prototype.renderHUD = function (ctx) {
  ctx.font = 'bold 17px monospace'
  ctx.textAlign = 'left'
  this.hudText(ctx, 'SCORE', 24, 26)
  this.hudText(ctx, pad6(this.score), 24, 48)
  this.hudText(ctx, 'COINS', 400, 26)
  this.hudText(ctx, 'x' + pad2(this.coins), 400, 48)
  ctx.textAlign = 'right'
  this.hudText(ctx, 'TIME', 936, 26)
  this.hudText(ctx, '' + Math.max(0, Math.round(this.time)), 936, 48)
  this.hudText(ctx, 'WORLD ' + this.level, 936, 74)
  ctx.textAlign = 'left'
  /* 生命 (马里奥小头像) */
  this.hudText(ctx, 'x' + this.lives, 96, 26)
  drawSprite(ctx, SMALL_STAND, 1, 52, 10, false)
  /* 强化状态 */
  var p = this.player
  if (p && p.power !== 'small') {
    var pwr = p.starTimer > 0 ? 'STAR ' + Math.ceil(p.starTimer / 1000) :
      p.power === 'fire' ? 'FIRE' : 'SUPER'
    ctx.textAlign = 'right'
    this.hudText(ctx, pwr, 936, 100)
    ctx.textAlign = 'left'
  }
}

Game.prototype.hudText = function (ctx, text, x, y) {
  ctx.fillStyle = C_BLACK
  ctx.fillText(text, x + 2, y + 2)
  ctx.fillStyle = C_WHITE
  ctx.fillText(text, x, y)
}

Game.prototype.renderControls = function (ctx) {
  if (this.state !== 'playing') return
  var t = this.animT / 400
  var pulse = 0.5 + 0.5 * Math.sin(t)
  /* 左区 */
  if (this.input.left) {
    ctx.fillStyle = 'rgba(255,255,255,0.25)'
    ctx.fillRect(0, VIEW_H - 60, 320, 60)
  }
  this.arrow(ctx, 160, VIEW_H - 32, -1, this.input.left ? 1 : 0.35 + pulse * 0.25)
  /* 右区 */
  if (this.input.right) {
    ctx.fillStyle = 'rgba(255,255,255,0.25)'
    ctx.fillRect(320, VIEW_H - 60, 320, 60)
  }
  this.arrow(ctx, 480, VIEW_H - 32, 1, this.input.right ? 1 : 0.35 + pulse * 0.25)
  /* 跳跃区 */
  if (this.input.jump) {
    ctx.fillStyle = 'rgba(255,255,255,0.25)'
    ctx.fillRect(640, VIEW_H - 60, 320, 60)
  }
  ctx.fillStyle = 'rgba(255,255,255,' + (this.input.jump ? 1 : 0.55 + pulse * 0.25) + ')'
  ctx.font = 'bold 20px sans-serif'
  ctx.textAlign = 'center'
  ctx.fillText('JUMP', 800, VIEW_H - 18)
  ctx.textAlign = 'left'
  /* fire 形态提示 (右上角热区按钮) */
  var pw = this.player ? this.player.power : 'small'
  if (pw === 'fire') {
    var fa = 0.6 + pulse * 0.3
    ctx.fillStyle = 'rgba(255,180,40,' + fa + ')'
    ctx.strokeStyle = 'rgba(255,225,130,' + fa + ')'
    ctx.lineWidth = 2
    ctx.beginPath()
    ctx.rect(832, 50, 104, 56)
    ctx.fill()
    ctx.stroke()
    ctx.fillStyle = '#3a2a00'
    ctx.font = 'bold 18px sans-serif'
    ctx.textAlign = 'center'
    ctx.fillText('FIRE', 884, 86)
    ctx.textAlign = 'left'
  }
}

Game.prototype.arrow = function (ctx, cx, cy, dir, alpha) {
  ctx.fillStyle = 'rgba(255,255,255,' + alpha + ')'
  var s = 12
  ctx.beginPath()
  ctx.moveTo(cx - dir * s, cy - s)
  ctx.lineTo(cx + dir * s * 0.6, cy)
  ctx.lineTo(cx - dir * s, cy + s)
  ctx.closePath()
  ctx.fill()
}

Game.prototype.renderOverlay = function (ctx) {
  if (this.state === 'dead') {
    ctx.fillStyle = 'rgba(0,0,0,0.25)'
    ctx.fillRect(0, 0, VIEW_W, VIEW_H)
  } else if (this.state === 'clear') {
    ctx.fillStyle = 'rgba(0,0,0,0.35)'
    ctx.fillRect(0, 0, VIEW_W, VIEW_H)
    ctx.fillStyle = C_WHITE
    ctx.font = 'bold 30px monospace'
    ctx.textAlign = 'center'
    ctx.fillText('COURSE CLEAR!', VIEW_W / 2 + 2, 140 + 2)
    ctx.fillStyle = C_QB_LIGHT
    ctx.fillText('COURSE CLEAR!', VIEW_W / 2, 140)
    ctx.textAlign = 'left'
  } else if (this.state === 'gameover') {
    ctx.fillStyle = 'rgba(0,0,0,0.55)'
    ctx.fillRect(0, 0, VIEW_W, VIEW_H)
    ctx.font = 'bold 34px monospace'
    ctx.textAlign = 'center'
    ctx.fillStyle = C_WHITE
    ctx.fillText('GAME OVER', VIEW_W / 2, 132)
    ctx.font = 'bold 18px monospace'
    ctx.fillStyle = C_WHITE
    ctx.fillText('SCORE ' + pad6(this.score), VIEW_W / 2, 170)
    ctx.textAlign = 'left'
  }
}

/* ---------- 标题背景 (给页面用) ---------- */

Game.prototype.renderTitle = function (levelText) {
  var ctx = this.ctx
  ctx.fillStyle = C_SKY
  ctx.fillRect(0, 0, VIEW_W, VIEW_H)
  this.renderBackdrop(ctx, this.animT * 0.05)
  /* 地面条 */
  ctx.fillStyle = C_GROUND_TOP
  ctx.fillRect(0, 226, VIEW_W, 12)
  ctx.fillStyle = C_GROUND_BODY
  ctx.fillRect(0, 238, VIEW_W, 28)
  /* 标题 */
  ctx.font = 'bold 52px monospace'
  ctx.textAlign = 'center'
  ctx.fillStyle = C_BLACK
  ctx.fillText('SUPER MARIO', VIEW_W / 2 + 3, 96 + 3)
  ctx.fillStyle = C_RED
  ctx.fillText('SUPER MARIO', VIEW_W / 2, 96)
  ctx.font = 'bold 20px monospace'
  ctx.fillStyle = C_QB_LIGHT
  ctx.fillText('WIFI EDITION', VIEW_W / 2, 128)
  ctx.textAlign = 'left'
  /* 角色 */
  drawSprite(ctx, SMALL_STAND, 3, 300, 158, false)
  drawSprite(ctx, GOOMBA, 3, 620, 164, false)
}

function pad2(n) {
  n = Math.max(0, Math.floor(n))
  return n < 10 ? '0' + n : '' + n
}

function pad6(n) {
  n = Math.max(0, Math.floor(n))
  var s = '' + n
  while (s.length < 6) s = '0' + s
  return s
}

export function createGame(ctx, hooks) {
  return new Game(ctx, hooks)
}
