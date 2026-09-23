/* 渲染调用计数对比: 新版 engine.js vs 备份版 engine.js.v2110bak
   分别对 地面(1) / 地下(2) / 城堡(4) 三个主题各跑 5 帧, 统计每帧 fillRect/drawImage/fillText 次数 */
import { mkdirSync, copyFileSync, writeFileSync, readFileSync, rmSync } from 'node:fs'
import { fileURLToPath, pathToFileURL } from 'node:url'

const GAME_DIR = fileURLToPath(new URL('../ui/src/services/game/', import.meta.url))
const TMP = '/tmp/engine-perf-cmp'
mkdirSync(TMP, { recursive: true })

/* 复制依赖到临时目录并统一扩展名为 .mjs, 同时改写 engine 的相对导入 */
const deps = ['engine.js', 'engine.js.v2110bak', 'levels.js', 'sprites.js']
const rename = {
  'engine.js': 'engine.mjs',
  'engine.js.v2110bak': 'engine.v2110bak.mjs',
  'levels.js': 'levels.mjs',
  'sprites.js': 'sprites.mjs',
}
for (const d of deps) {
  copyFileSync(GAME_DIR + d, TMP + '/' + rename[d])
}
copyFileSync(fileURLToPath(new URL('./panet-mock.mjs', import.meta.url)), TMP + '/panet-mock.mjs')

const patch = (p) => {
  let s = readFileSync(TMP + '/' + p, 'utf8')
  s = s.replace(/from '\.\/(levels|sprites|constants|save|panet)\.js'/g, "from './$1.mjs'")
  writeFileSync(TMP + '/' + p, s)
}
for (const f of ['engine.mjs', 'engine.v2110bak.mjs']) patch(f)
function makeCtx() {
  const counts = { fillRect: 0, drawImage: 0, fillText: 0 }
  const mk2d = () => new Proxy({}, {
    get(t, k) {
      if (k === 'measureText') return () => ({ width: 10 })
      if (k === 'canvas') return { width: 960, height: 266 }
      if (k === 'fillRect') return () => { counts.fillRect++ }
      if (k === 'drawImage') return () => { counts.drawImage++ }
      if (k === 'fillText') return () => { counts.fillText++ }
      return () => undefined
    },
    set(t, k, v) { t[k] = v; return true },
  })
  const ctx = mk2d()
  /* mock document.createElement: 让离屏 canvas 缓存路径生效 (同时统计缓存画布调用) */
  globalThis.document = {
    createElement: (tag) => {
      if (tag === 'canvas') return { width: 0, height: 0, getContext: () => mk2d() }
      return {}
    },
  }
  return { ctx, counts }
}

async function bench(label, enginePath, levels) {
  const mod = await import(pathToFileURL(TMP + '/' + enginePath).href)
  console.log('==== ' + label + ' ====')
  for (const lv of levels) {
    const { ctx, counts } = makeCtx()
    /* 固定相机: 避免静态层缓存因跨瓦片重建引入噪声 */
    const g = mod.createGame(ctx, {})
    g.start({ level: lv, score: 0, coins: 0, lives: 3, time: 300, power: 'small' })
    g.player.vx = 0
    g.player.vy = 0
    g.player.onGround = true
    g.camX = 480
    /* 预热帧(构建缓存)后统计 5 帧 */
    for (let f = 0; f < 3; f++) { g.tick(16); g.render() }
    Object.assign(counts, { fillRect: 0, drawImage: 0, fillText: 0 })
    for (let f = 0; f < 5; f++) { g.tick(16); g.render() }
    const per = (n) => (n / 5).toFixed(1)
    console.log('L' + lv + ': fillRect ' + per(counts.fillRect) + '/f, drawImage ' + per(counts.drawImage) + '/f, fillText ' + per(counts.fillText) + '/f')
  }
}

/* 主题: 1=地面, 2=地下, 4=城堡 */
await bench('新版 (engine.js)', 'engine.mjs', [1, 2, 4])
await bench('备份版 (engine.js.v2110bak)', 'engine.v2110bak.mjs', [1, 2, 4])

rmSync(TMP, { recursive: true, force: true })
