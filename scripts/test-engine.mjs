/* 集成测试: 引擎道具/BOSS/存档路径 (Node ESM, 需要 panet resolver) */
import { createGame } from '../ui/src/services/game/engine.js'
import { LEVELS } from '../ui/src/services/game/levels.js'
import { loadSlots, loadSlot, saveSlot, clearSlot, persistAvailable } from '../ui/src/services/save.js'
import { __calls } from './panet-mock.mjs'

/* 假 canvas 2d context: 记录调用即可 */
const ctx = new Proxy(
  {},
  {
    get(t, k) {
      if (k === 'measureText') return () => ({ width: 10 })
      if (k === 'canvas') return { width: 960, height: 266 }
      return () => undefined
    },
    set(t, k, v) {
      t[k] = v
      return true
    },
  }
)

let pass = 0
let fail = 0
function ok(name, cond, extra) {
  if (cond) {
    pass++
    console.log('PASS', name)
  } else {
    fail++
    console.log('FAIL', name, extra != null ? '| ' + extra : '')
  }
}

/* 1. 全部关卡可加载并稳定跑 30 帧 */
for (let lv = 1; lv <= LEVELS.length; lv++) {
  let err = null
  try {
    const g = createGame(ctx, {})
    g.start({ level: lv, score: 0, coins: 0, lives: 3, time: 300, power: 'small' })
    for (let f = 0; f < 30; f++) g.tick(16)
  } catch (e) {
    err = e
  }
  ok('LEVEL ' + lv + ' runs 30 ticks without error', !err, err && err.message)
}

/* 2. 蘑菇: 玩家接触后变 Super */
{
  const g = createGame(ctx, {})
  g.start({ level: 1 })
  g.spawnPowerup('mushroom', g.player.x, g.player.y - 24)
  g.powerups[0].x = g.player.x + 4
  g.powerups[0].y = g.player.y + g.player.h / 2 - g.powerups[0].h / 2
  g.powerups[0].vy = 0
  g.powerups[0].vx = 0
  g.tick(16)
  ok('mushroom -> super', g.player.power === 'super', g.player.power)
  ok('score +1000', g.score >= 1000, g.score)
}

/* 3. 火焰花 -> Fire, 可发火球 */
{
  const g = createGame(ctx, {})
  g.start({ level: 1 })
  g.spawnPowerup('flower', g.player.x, g.player.y - 24)
  g.powerups[0].x = g.player.x + 4
  g.powerups[0].y = g.player.y + g.player.h / 2 - g.powerups[0].h / 2
  g.tick(16)
  ok('flower -> fire', g.player.power === 'fire', g.player.power)
  g.fireFireball()
  g.fireFireball()
  g.fireFireball()
  ok('fireball cap = 2', g.fireballs.length === 2, g.fireballs.length)
}

/* 4. 无敌星 */
{
  const g = createGame(ctx, {})
  g.start({ level: 1 })
  g.spawnPowerup('star', g.player.x, g.player.y - 24)
  g.powerups[0].x = g.player.x + 4
  g.powerups[0].y = g.player.y + g.player.h / 2 - g.powerups[0].h / 2
  g.powerups[0].vy = 0
  g.powerups[0].vx = 0
  g.tick(16)
  ok('star -> starTimer ~10s', g.player.starTimer > 9000 && g.player.starTimer <= 10000, g.player.starTimer)
}

/* 5. 1UP */
{
  const g = createGame(ctx, {})
  g.start({ level: 1 })
  const before = g.lives
  g.spawnPowerup('1up', g.player.x, g.player.y - 24)
  g.powerups[0].x = g.player.x + 4
  g.powerups[0].y = g.player.y + g.player.h / 2 - g.powerups[0].h / 2
  g.powerups[0].vy = 0
  g.powerups[0].vx = 0
  g.tick(16)
  ok('1up -> lives+1', g.lives === before + 1, g.lives)
}

/* 6. 1-4 城堡关: BOSS 存在, 斧头通关 */
{
  const g = createGame(ctx, {})
  g.start({ level: 4 })
  ok('boss spawned', !!g.boss && g.boss.alive)
  ok('axe present', !!g.axe && !g.axe.taken)
  /* 传送玩家到斧头旁并触发拾取 */
  g.player.x = g.axe.x - 4
  g.player.y = g.axe.y - g.player.h + 6
  g.tick(16)
  ok('axe -> COURSE CLEAR', g.state === 'clear', g.state)
}

/* 7. BOSS 火球是敌方火球 */
{
  const g = createGame(ctx, {})
  g.start({ level: 4 })
  const old = g.player.x
  g.player.x = g.boss.x + g.boss.w + 100
  g.updateBoss(5000)
  ok('boss fires enemy fireball', g.fireballs.some((f) => f.enemy))
}

/* 8. 存档: 写 /userdisk/database/super_mario_save.json, 字段含 power */
await clearSlot(0)
const before = __calls.length
const wrote = await saveSlot(0, { score: 12345, coins: 7, lives: 2, level: 3, time: 200, power: 'fire' })
ok('saveSlot resolves ok', wrote === true)
const w = __calls.slice(before).find((c) => c[0] === 'writeFile')
ok('save path = /userdisk/database/super_mario_save.json', !!w && w[1] === '/userdisk/database/super_mario_save.json', w && w[1])
ok('save data includes power', !!w && /"power":"fire"/.test(w[2]), w && w[2])

/* 9. 读档回填字段 */
const st = await loadSlot(0)
ok('loaded power=fire', st.power === 'fire', st.power)
ok('loaded level=3 score=12345 coins=7', st.level === 3 && st.score === 12345 && st.coins === 7)

/* 10. persistAvailable */
ok('persistAvailable true', persistAvailable() === true)

console.log('\n==== ' + pass + ' passed, ' + fail + ' failed ====')
process.exit(fail > 0 ? 1 : 0)
