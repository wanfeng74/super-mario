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

import { LEVELS, WORLD_GROUND_Y, WORLD_BLOCKS } from './levels.js'

var TILE = 24
var VIEW_W = 960
var VIEW_H = 266

/* 物理 (基准 60fps) */
var GRAVITY = 0.55
var JUMP_V = -11.8
var MOVE_SPD = 2.9
var AIR_MOVE = 2.55
var MAX_FALL = 12.5
var ENEMY_SPD = 0.62
var STOMP_V = -7.2
var BONK_V = 3.2
var DEAD_V = -10.5

/* 颜色 */
var C_SKY = '#6cb8f8'
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

/* ---------- 像素精灵 (字符 -> 颜色) ---------- */

var SPRITE_MAP = {
  R: C_RED,
  W: C_WHITE,
  S: C_SKIN,
  B: C_BLUE,
  K: C_SHOE,
  D: C_BLACK,
  M: C_BROWN,
  G: C_PIPE,
}

/* 角色 12x24, 放大 2 倍 => 24x48 完整覆盖碰撞框 (红帽/棕发/橙脸/红衣/红裤/棕鞋) */
var MARIO_STAND = [
  '...RRRRRR....',
  '..RRRRRRRR...',
  '..MMMMMMMM...',
  '.MMSSSSSMM...',
  '.MSSSSSSSM...',
  '.MSSSSSSSM...',
  '.MMSSSSSMM...',
  '..MMMMMMM....',
  '.MRRRRRRRM...',
  'MRRRRRRRRRM..',
  'SRRRRRRRRRS..',
  'SRRRRRRRRRS..',
  '.SRRRRRRRS...',
  '..RRRRRRR....',
  '..RRRRRRR....',
  '..RRRRRRR....',
  '.MRR..RRM....',
  '.MRR..RRM....',
  '.MMM..MMM....',
  'MMM....MMM...',
  'MM......MM...',
  'MM......MM...',
  'MM......MM...',
  'MM......MM...',
]
var MARIO_WALK = [
  '...RRRRRR....',
  '..RRRRRRRR...',
  '..MMMMMMMM...',
  '.MMSSSSSMM...',
  '.MSSSSSSSM...',
  '.MSSSSSSSM...',
  '.MMSSSSSMM...',
  '..MMMMMMM....',
  '.MRRRRRRRM...',
  'MRRRRRRRRRM..',
  'SRRRRRRRRRS..',
  'SRRRRRRRRRS..',
  '.SRRRRRRRS...',
  '..RRRRRRR....',
  '..RRRRRRR....',
  '..RRRRRRR....',
  '.MRR..RRM....',
  '.MM....MM....',
  '.MM....MM....',
  'MMM...MM.....',
  'MM.....MM....',
  'MM.....MM....',
  'MM.....MM....',
  'MM.....MM....',
]
var MARIO_JUMP = [
  '...RRRRRR....',
  '..RRRRRRRR...',
  '..MMMMMMMM...',
  '.MMSSSSSMM...',
  '.MSSSSSSSM...',
  '.MSSSSSSSM...',
  '.MMSSSSSMM...',
  '..MMMMMMM....',
  'MRRRRRRRRRM..',
  'MRRRRRRRRRM..',
  'SRRRRRRRRRS..',
  'SSRRRRRRRSS..',
  '.SRRRRRRRS...',
  '..RRRRRRR....',
  '..RRRRRRR....',
  '..RRRRRRR....',
  '.MRR....RRM..',
  '.MRR....RRM..',
  '.MMM....MMM..',
  'MMM......MMM.',
  'MM........MM.',
  'MM........MM.',
  'MM........MM.',
  'MM........MM.',
]
/* 死亡: 大字躺倒 (红帽/棕发/橙脸/红衣/四肢) */
var MARIO_DEAD = [
  '.............',
  '.............',
  '.............',
  '....RRRRR....',
  '...RRRRRRR...',
  '..MMMMMMMM...',
  '.MMSSSSSSMM..',
  '.MSSSSSSSSM..',
  '.MSSSSSSSSM..',
  '.MMSSSSSSMM..',
  '..MMMMMMMM...',
  '.MRRRRRRRM...',
  'MRRRRRRRRRM..',
  'MRRRRRRRRRM..',
  '.MMM...MMM...',
  'MMM.....MMM..',
  'MM.......MM..',
  '.............',
  '.............',
  '.............',
  '.............',
  '.............',
  '.............',
  '.............',
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

function drawSprite(ctx, sprite, scale, px, py, flip) {
  var h = sprite.length
  var w = sprite[0].length
  var px0 = Math.round(px)
  var py0 = Math.round(py)
  for (var r = 0; r < h; r++) {
    var row = sprite[r]
    for (var c = 0; c < w; c++) {
      var ch = row.charAt(c)
      if (ch === '.' || ch === ' ') continue
      var color = SPRITE_MAP[ch]
      if (!color) continue
      var sx = flip ? px0 + (w - 1 - c) * scale : px0 + c * scale
      var sy = py0 + r * scale
      ctx.fillStyle = color
      ctx.fillRect(sx, sy, scale, scale)
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
  this.tiles = []
  this.pipes = []
  this.enemies = []
  this.coinItems = []
  this.particles = []
  this.flagX = 0
  this.castleX = 0

  for (var i = 0; i < segs.length; i++) {
    var s = segs[i]
    if (s.t === 'g') {
      var gh = s.h || 2
      var gy = (WORLD_GROUND_Y + 2 - gh) * TILE
      this.tiles.push({ type: 'ground', x: s.x * TILE, y: gy, w: s.w * TILE, h: gh * TILE })
    } else if (s.t === 'b') {
      this.tiles.push({ type: 'brick', x: s.x * TILE, y: s.y * TILE, w: TILE, h: TILE })
    } else if (s.t === 'q') {
      this.tiles.push({ type: 'qblock', x: s.x * TILE, y: s.y * TILE, w: TILE, h: TILE, used: false })
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
      })
    } else if (s.t === 'f') {
      this.flagX = s.x * TILE
    } else if (s.t === 'k') {
      this.castleX = s.x * TILE
    } else if (s.t === 's') {
      var sx = s.x * TILE
      var sy = s.y != null ? s.y * TILE : (WORLD_GROUND_Y - 2) * TILE
      this.player = {
        x: sx,
        y: sy,
        w: TILE,
        h: 2 * TILE,
        vx: 0,
        vy: 0,
        onGround: false,
        facing: 1,
        walk: 0,
      }
      this.camX = Math.max(0, sx - 200)
    }
  }
  if (!this.player) {
    this.player = { x: 2 * TILE, y: (WORLD_GROUND_Y - 2) * TILE, w: TILE, h: 2 * TILE, vx: 0, vy: 0, onGround: false, facing: 1, walk: 0 }
  }
  this.playerBottomPrev = this.player.y + this.player.h
  this.time = Math.max(200, 300 - (levelIdx - 1) * 30)
  this.invuln = 0
  this.state = 'playing'
  this.stateTimer = 0
}

/* 开始: 按存档/新局状态 */
Game.prototype.start = function (state) {
  this.reset()
  this.level = state.level || 1
  this.score = state.score || 0
  this.coins = state.coins || 0
  this.lives = state.lives || 3
  this.loadLevel(this.level)
}

Game.prototype.getState = function () {
  return { level: this.level, score: this.score, coins: this.coins, lives: this.lives, time: Math.max(0, Math.round(this.time)) }
}

Game.prototype.setInput = function (dir, on) {
  if (dir === 'left') this.input.left = on
  else if (dir === 'right') this.input.right = on
  else if (dir === 'jump') this.input.jump = on
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
  if (p.y > this.worldH + 200) {
    this.killPlayer(true)
  }
}

/* 顶砖块: 问号出金币, 砖块顶碎 */
Game.prototype.bonkTile = function (tile) {
  if (tile.type === 'qblock' && !tile.used) {
    tile.used = true
    this.score += 200
    this.particles.push({
      kind: 'coinpop',
      x: tile.x + TILE / 2,
      y: tile.y - TILE / 2,
      vy: -6,
      t: 0,
    })
  } else if (tile.type === 'brick') {
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
    /* 巡逻: 前方无地面或撞墙则掉头 */
    e.x += e.vx * (dt / 16.667)
    var aheadX = e.vx > 0 ? e.x + e.w + 2 : e.x - 2
    var belowY = e.y + e.h + 2
    var wall = this.collideTiles(aheadX, e.y + 4, 2, e.h - 8)
    var floor = this.collideTiles(aheadX, belowY, 4, 6)
    if (wall || !floor) {
      e.x -= e.vx * (dt / 16.667)
      e.vx = -e.vx
    }
    e.walk += dt / 90

    /* 与玩家碰撞 */
    if (this.invuln > 0) {
      keep.push(e)
      continue
    }
    if (rectsHit(p.x, p.y, p.w, p.h, e.x, e.y, e.w, e.h)) {
      /* 踩踏判定: 玩家上一帧底部在敌人顶部(含 6px 容差)之上且正在下落.
         不能用当前穿透深度 p.y+p.h-e.y —— 玩家落地后穿透恒为 24px, 会永远判成撞死 */
      var stomping = p.vy > 0 && this.playerBottomPrev <= e.y + 6
      if (stomping) {
        e.alive = false
        e.squashed = true
        e.squashT = 0.5
        p.vy = STOMP_V
        p.onGround = false
        this.score += 100
      } else {
        this.killPlayer(false)
        keep.push(e)
        continue
      }
    }
    keep.push(e)
  }
  this.enemies = keep
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
  }

  /* 移动 */
  this.movePlayerX()
  p.vy = Math.min(p.vy + GRAVITY * (dt / 16.667), MAX_FALL)
  p.onGround = false
  this.movePlayerY()

  if (p.onGround && p.vx !== 0) p.walk += dt / 110
  if (this.invuln > 0) this.invuln -= dt

  /* 敌人/道具 */
  this.updateEnemies(dt)
  this.updateItems(dt)

  /* 相机 */
  var target = p.x - 320
  if (target > this.camX) this.camX = target
  if (p.x < this.camX + 160) this.camX = Math.max(0, p.x - 160)
  this.camX = Math.max(0, Math.min(this.camX, this.worldW - VIEW_W))

  /* 过关 */
  if (p.x + p.w > this.flagX) {
    this.state = 'clear'
    this.stateTimer = 0
    this.score += 500
  }
}

/* ---------- 渲染 ---------- */

Game.prototype.render = function () {
  var ctx = this.ctx
  var cam = Math.round(this.camX)
  ctx.fillStyle = C_SKY
  ctx.fillRect(0, 0, VIEW_W, VIEW_H)

  this.renderBackdrop(ctx, cam)
  this.renderTiles(ctx, cam)

  /* 悬空金币 */
  for (var i = 0; i < this.coinItems.length; i++) {
    var c = this.coinItems[i]
    if (!c.active || c.x + c.w < cam || c.x > cam + VIEW_W) continue
    this.drawCoin(ctx, c.x + TILE / 2, c.y + TILE / 2, c.t)
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
    var spr = Math.floor(e.walk) % 2 === 0 ? GOOMBA : GOOMBA_WALK
    drawSprite(ctx, spr, 2, e.x - cam, e.y, false)
  }

  this.renderPlayer(ctx, cam)
  this.renderParticles(ctx, cam)

  if (this.state !== 'idle') this.renderHUD(ctx)
  this.renderControls(ctx)
  this.renderOverlay(ctx)
}

Game.prototype.renderBackdrop = function (ctx, cam) {
  /* 远山 (视差 0.2) */
  var m1 = -((cam * 0.2) % 640)
  ctx.fillStyle = '#7fd08a'
  for (var i = 0; i < 3; i++) {
    var mx = m1 + i * 640
    this.drawHill(ctx, mx + 60, 196, 190, 80)
  }
  var m2 = -((cam * 0.35) % 900)
  ctx.fillStyle = '#4aa763'
  for (var k = 0; k < 2; k++) {
    var mxx = m2 + k * 900
    this.drawHill(ctx, mxx + 120, 214, 240, 60)
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

Game.prototype.drawHill = function (ctx, x, baseY, w, h) {
  ctx.beginPath()
  ctx.moveTo(x, baseY)
  ctx.lineTo(x + w / 2, baseY - h)
  ctx.lineTo(x + w, baseY)
  ctx.closePath()
  ctx.fill()
}

Game.prototype.drawCloud = function (ctx, x, y, s) {
  var u = 14 * s
  ctx.fillRect(x, y, 5 * u, u)
  ctx.fillRect(x + u, y - u, 3 * u, u)
  ctx.fillRect(x + u, y, u, 2 * u)
  ctx.fillRect(x + 2 * u, y - 2 * u, 3 * u, 2 * u)
}

Game.prototype.renderTiles = function (ctx, cam) {
  for (var i = 0; i < this.tiles.length; i++) {
    var t = this.tiles[i]
    if (t.dead || t.x + t.w < cam || t.x > cam + VIEW_W) continue
    var sx = t.x - cam
    if (t.type === 'ground') {
      ctx.fillStyle = C_GROUND_TOP
      ctx.fillRect(sx, t.y, t.w, 10)
      ctx.fillStyle = C_GROUND_TOP_DARK
      ctx.fillRect(sx, t.y + 10, t.w, 4)
      ctx.fillStyle = C_GROUND_BODY
      ctx.fillRect(sx, t.y + 14, t.w, t.h - 14)
      ctx.fillStyle = C_GROUND_BODY_DARK
      for (var g = 0; g < t.w / TILE; g++) {
        var gx = sx + g * TILE
        ctx.fillRect(gx + 4, t.y + 18 + ((g % 2) * 10), TILE - 8, 6)
      }
    } else if (t.type === 'brick') {
      ctx.fillStyle = C_BRICK
      ctx.fillRect(sx, t.y, TILE, TILE)
      ctx.fillStyle = C_BRICK_DARK
      ctx.fillRect(sx, t.y + TILE - 2, TILE, 2)
      ctx.fillRect(sx + TILE - 2, t.y, 2, TILE)
      ctx.fillRect(sx + TILE / 2 - 1, t.y + 8, 2, TILE - 12)
      ctx.fillStyle = C_BRICK_LIGHT
      ctx.fillRect(sx, t.y, TILE, 2)
      ctx.fillRect(sx, t.y, 2, TILE)
    } else if (t.type === 'qblock') {
      var base = t.used ? C_HARD : C_QB
      var dark = t.used ? C_HARD_DARK : C_QB_DARK
      var light = t.used ? C_HARD_LIGHT : C_QB_LIGHT
      ctx.fillStyle = dark
      ctx.fillRect(sx, t.y, TILE, TILE)
      ctx.fillStyle = base
      ctx.fillRect(sx + 2, t.y + 2, TILE - 4, TILE - 4)
      ctx.fillStyle = light
      ctx.fillRect(sx + 2, t.y + 2, TILE - 4, 3)
      ctx.fillRect(sx + 2, t.y + 2, 3, TILE - 4)
      if (!t.used) {
        ctx.fillStyle = C_WHITE
        ctx.font = 'bold 15px sans-serif'
        ctx.textAlign = 'center'
        ctx.fillText('?', sx + TILE / 2, t.y + 18)
      }
    } else if (t.type === 'hard') {
      ctx.fillStyle = C_HARD
      ctx.fillRect(sx, t.y, TILE, TILE)
      ctx.fillStyle = C_HARD_DARK
      ctx.fillRect(sx, t.y + TILE - 3, TILE, 3)
      ctx.fillRect(sx + TILE - 3, t.y, 3, TILE)
      ctx.fillStyle = C_HARD_LIGHT
      ctx.fillRect(sx, t.y, TILE, 3)
      ctx.fillRect(sx, t.y, 3, TILE)
    }
  }

  /* 管道 (整体绘制) */
  for (var p = 0; p < this.pipes.length; p++) {
    var pi = this.pipes[p]
    if (pi.x + pi.w < cam || pi.x > cam + VIEW_W) continue
    var psx = pi.x - cam
    ctx.fillStyle = C_PIPE_DARK
    ctx.fillRect(psx, pi.y, pi.w, pi.h)
    ctx.fillStyle = C_PIPE
    ctx.fillRect(psx + 3, pi.y, pi.w - 3, pi.h)
    ctx.fillStyle = C_PIPE_LIGHT
    ctx.fillRect(psx + 3, pi.y, 8, pi.h)
    ctx.fillStyle = C_PIPE_DARK
    ctx.fillRect(psx, pi.y, pi.w, 8)
    ctx.fillStyle = C_PIPE_LIGHT
    ctx.fillRect(psx + 3, pi.y + 2, 6, 4)
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
  var spr = MARIO_STAND
  if (this.state === 'dead') {
    spr = MARIO_DEAD
  } else if (!p.onGround) {
    spr = MARIO_JUMP
  } else if (p.vx !== 0) {
    spr = Math.floor(p.walk) % 2 === 0 ? MARIO_WALK : MARIO_STAND
  }
  drawSprite(ctx, spr, 2, p.x - cam, p.y, p.facing < 0)
}

Game.prototype.drawCoin = function (ctx, cx, cy, t) {
  var w = Math.max(3, Math.abs(Math.sin(t)) * 11)
  ctx.fillStyle = C_COIN_DARK
  ctx.beginPath()
  ctx.arc(cx, cy, 11, 0, 6.283)
  ctx.fill()
  ctx.fillStyle = C_COIN
  ctx.beginPath()
  ctx.arc(cx, cy - 1, 9.5, 0, 6.283)
  ctx.fill()
  ctx.fillStyle = '#fff4c0'
  ctx.fillRect(cx - w / 2, cy - 6, w, 12)
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
      ctx.fillText(pt.text, sx, pt.y)
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
  drawSprite(ctx, MARIO_STAND, 1, 52, 10, false)
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
    ctx.fillStyle = C_WHITE
    ctx.font = 'bold 34px monospace'
    ctx.textAlign = 'center'
    ctx.fillText('GAME OVER', VIEW_W / 2 + 2, 132 + 2)
    ctx.fillStyle = C_RED
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
  drawSprite(ctx, MARIO_STAND, 3, 300, 158, false)
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
