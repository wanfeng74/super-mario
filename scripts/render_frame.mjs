// 软件渲染: 用 mock canvas 渲染一帧游戏画面 -> /tmp/frame.raw (960x266 RGB)
import { createGame } from '../ui/src/services/game/engine.js'
import { writeFileSync } from 'fs'

const W = 960, H = 266
const buf = new Uint8Array(W * H * 3)

function hex(c) {
  if (typeof c !== 'string') return [255, 0, 255]
  c = c.trim()
  if (c.startsWith('#')) {
    if (c.length === 4) return [parseInt(c[1] + c[1], 16), parseInt(c[2] + c[2], 16), parseInt(c[3] + c[3], 16)]
    return [parseInt(c.slice(1, 3), 16), parseInt(c.slice(3, 5), 16), parseInt(c.slice(5, 7), 16)]
  }
  if (c.startsWith('rgba') || c.startsWith('rgb')) {
    const m = c.match(/[\d.]+/g)
    if (!m) return [255, 0, 255]
    const a = m.length > 3 ? parseFloat(m[3]) : 1
    return [Math.round(parseFloat(m[0]) * a), Math.round(parseFloat(m[1]) * a), Math.round(parseFloat(m[2]) * a)]
  }
  return [255, 0, 255]
}

let fillStyle = '#000'
let pathPts = []
const ctx = {
  canvas: { width: W, height: H },
  set fillStyle(v) { fillStyle = v },
  get fillStyle() { return fillStyle },
  fillRect(x, y, w, h) {
    const [r, g, b] = hex(fillStyle)
    x = Math.round(x); y = Math.round(y); w = Math.round(w); h = Math.round(h)
    for (let yy = y; yy < y + h; yy++) {
      if (yy < 0 || yy >= H) continue
      for (let xx = x; xx < x + w; xx++) {
        if (xx < 0 || xx >= W) continue
        const o = (yy * W + xx) * 3
        buf[o] = r; buf[o + 1] = g; buf[o + 2] = b
      }
    }
  },
  clearRect(x, y, w, h) { this.fillStyle = '#000'; this.fillRect(x, y, w, h) },
  beginPath() { pathPts = [] },
  moveTo(x, y) { pathPts.push([x, y]) },
  lineTo(x, y) { pathPts.push([x, y]) },
  closePath() {},
  fill() {
    // 三角形/多边形栅格化 (扫描线)
    if (pathPts.length < 3) return
    const [r, g, b] = hex(fillStyle)
    let minY = Infinity, maxY = -Infinity
    for (const p of pathPts) { if (p[1] < minY) minY = p[1]; if (p[1] > maxY) maxY = p[1] }
    minY = Math.max(0, Math.floor(minY)); maxY = Math.min(H - 1, Math.ceil(maxY))
    for (let yy = minY; yy <= maxY; yy++) {
      const xs = []
      for (let i = 0; i < pathPts.length; i++) {
        const a = pathPts[i], b = pathPts[(i + 1) % pathPts.length]
        if ((a[1] <= yy && b[1] > yy) || (b[1] <= yy && a[1] > yy)) {
          const t = (yy - a[1]) / (b[1] - a[1])
          xs.push(a[0] + t * (b[0] - a[0]))
        }
      }
      xs.sort((p, q) => p - q)
      for (let i = 0; i + 1 < xs.length; i += 2) {
        const x0 = Math.max(0, Math.round(xs[i])), x1 = Math.min(W - 1, Math.round(xs[i + 1]))
        for (let xx = x0; xx <= x1; xx++) {
          const o = (yy * W + xx) * 3
          buf[o] = r; buf[o + 1] = g; buf[o + 2] = b
        }
      }
    }
  },
  arc(x, y, rad, a0, a1) {
    // 近似: 把圆栅格化直接画 (通过临时收集点)
    this._arc = { x, y, rad }
  },
  fillText() {},
  measureText() { return { width: 10 } },
  set font(v) {}, set textAlign(v) {},
}

// arc + fill 单独处理: 覆盖在 fill 里
const origFill = ctx.fill.bind(ctx)
ctx.fill = function () {
  if (this._arc) {
    const [r, g, b] = hex(fillStyle)
    const { x, y, rad } = this._arc
    this._arc = null
    for (let yy = Math.max(0, Math.floor(y - rad)); yy <= Math.min(H - 1, Math.ceil(y + rad)); yy++) {
      const dy = yy - y
      const dx = Math.sqrt(Math.max(0, rad * rad - dy * dy))
      const x0 = Math.max(0, Math.round(x - dx)), x1 = Math.min(W - 1, Math.round(x + dx))
      for (let xx = x0; xx <= x1; xx++) {
        const o = (yy * W + xx) * 3
        buf[o] = r; buf[o + 1] = g; buf[o + 2] = b
      }
    }
    return
  }
  origFill()
}

const level = parseInt(process.argv[2] || '1')
const camTo = process.argv[3] ? parseInt(process.argv[3]) : -1
const g = createGame(ctx, {})
g.start({ level, lives: 3 })
// 前进若干 tick 让场景滚起来
for (let f = 0; f < 20; f++) g.tick(16)
if (camTo >= 0) {
  g.camX = Math.max(0, Math.min(camTo, g.worldW - 960))
  g.player.x = g.camX + 200
  g.player.y = 240 - g.player.h
  g.player.vx = 0; g.player.vy = 0; g.player.onGround = true
  // 关闭无敌星计时干扰
  for (let f = 0; f < 2; f++) g.tick(16)
}
g.render()
writeFileSync('/tmp/frame.raw', Buffer.from(buf))
console.log('frame saved, level', level)
