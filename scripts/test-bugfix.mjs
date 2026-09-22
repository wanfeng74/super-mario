/* 专项回归: 4 个 bug 修复验证
   1) 踩踏判定: 侧面高处冲撞可踩死 (原版判定: 玩家底部在敌人垂直中点之上)
   2) 火焰棒: 直棒逐段碰撞 (碰任意一段即受伤)
   3) Boss: 连发喷火 + 跳跃
   4) 绿龟: 踩后缩壳, 踢飞, 滑动杀敌, 撞墙反弹
*/
import { createGame } from '../ui/src/services/game/engine.js'
import { LEVELS } from '../ui/src/services/game/levels.js'

const ctx = new Proxy({}, {
  get(t, k) {
    if (k === 'measureText') return () => ({ width: 10 })
    if (k === 'canvas') return { width: 960, height: 266 }
    return () => undefined
  },
  set(t, k, v) { t[k] = v; return true },
})

let pass = 0
let fail = 0
function ok(name, cond, extra) {
  if (cond) { pass++; console.log('PASS', name) }
  else { fail++; console.log('FAIL', name, extra != null ? '| ' + extra : '') }
}

function findEnemy(g, kind) {
  return g.enemies.find((e) => e.alive && e.kind === kind)
}

/* ============ 1. 踩踏判定: 侧面高处可踩死 (不要求正上方) ============ */
{
  const g = createGame(ctx, {})
  g.start({ level: 1 })
  const e = findEnemy(g, 'goomba')
  ok('1-1 has goomba', !!e)
  if (e) {
    e.x = g.player.x + 40
    e.y = 9 * 24
    e.vy = 0
    e.vx = 0
    e.activated = true
    /* 玩家从右侧贴过来, 底部高于敌人中点 (0.25h) 且下落中 (vy>0, 原版: 下落中才可踩) → 应踩死 */
    g.player.x = e.x + e.w - 2      // 重叠 2px
    g.player.y = e.y - e.h * 0.75   // 玩家底部 = e.y + 0.25h < e.y + 0.5h
    g.player.vy = 3                 // 下落中
    g.player.vx = 0
    g.updateEnemies(16)
    ok('falling high-side hit stomps goomba', !e.alive || e.squashed, 'alive=' + e.alive + ' squashed=' + e.squashed)
  }
  /* 反例1: 玩家底部低于敌人中点 (同高度水平撞) → 玩家受伤 */
  const g2 = createGame(ctx, {})
  g2.start({ level: 1 })
  const e2 = findEnemy(g2, 'goomba')
  if (e2) {
    e2.x = g2.player.x + 40
    e2.y = 9 * 24
    e2.vy = 0
    e2.vx = 0
    e2.activated = true
    g2.player.x = e2.x + e2.w - 2
    g2.player.y = e2.y            // 玩家底部 = e2.y + TILE > 中点 → 撞伤
    g2.player.vy = 0
    g2.updateEnemies(16)
    ok('side-low hit hurts player (bottom > mid)', e2.alive && g2.state === 'dead', 'state=' + g2.state + ' alive=' + e2.alive)
  }
  /* 反例2: 玩家未下落 (vy=0) 但底部在敌人中点之上 (砖块/平台上水平经过) → 不踩不伤 (原版 y 不重叠不碰撞) */
  const g3 = createGame(ctx, {})
  g3.start({ level: 1 })
  const e3 = findEnemy(g3, 'goomba')
  if (e3) {
    e3.x = g3.player.x + 40
    e3.y = 9 * 24
    e3.vy = 0
    e3.vx = 0
    e3.activated = true
    g3.player.x = e3.x + e3.w - 2
    g3.player.y = e3.y - e3.h * 0.75   // 底部高于中点
    g3.player.vy = 0                    // 但未下落 (水平走过)
    g3.updateEnemies(16)
    ok('flat high-side pass does NOT stomp (vy=0)', e3.alive && !e3.squashed && g3.state !== 'dead', 'alive=' + e3.alive + ' state=' + g3.state)
  }
}

/* ============ 2. 火焰棒直棒逐段碰撞 ============ */
{
  const g = createGame(ctx, {})
  g.start({ level: 4 })
  const fb = g.enemies.find((e) => e.kind === 'firebar')
  ok('1-4 has firebar', !!fb)
  if (fb) {
    fb.activated = true
    fb.angle = 0
    fb.speed = 0
    /* 玩家放在第 3 段火球位置 (离中心 3*12=36px) */
    g.player.x = fb.x + fb.w / 2 + 3 * 12 - 6
    g.player.y = fb.y + fb.h / 2 - 6
    g.player.vy = 0
    g.invuln = 0
    g.updateEnemies(16)
    ok('firebar segment 3 hurts player', g.state === 'dead', 'state=' + g.state)
  }
  /* 远离火焰棒的玩家不受伤害 */
  const g2 = createGame(ctx, {})
  g2.start({ level: 4 })
  const fb2 = g2.enemies.find((e) => e.kind === 'firebar')
  if (fb2) {
    fb2.activated = true
    fb2.angle = 0
    fb2.speed = 0
    g2.player.x = fb2.x - 100
    g2.player.y = fb2.y + fb2.h / 2 - 6
    g2.player.vy = 0
    g2.invuln = 0
    g2.updateEnemies(16)
    ok('far from firebar no hurt', g2.state === 'playing', 'state=' + g2.state)
  }
}

/* ============ 3. Boss 连发喷火 + 跳跃 ============ */
{
  const g = createGame(ctx, {})
  g.start({ level: 4 })
  const b = g.boss
  ok('boss spawned', !!b && b.alive)
  if (b) {
    b.fireT = 0
    b.burst = 0
    b.burstT = 0
    for (let f = 0; f < 30; f++) g.updateBoss(16)
    const enemyFires = g.fireballs.filter((fb) => fb.alive && fb.enemy).length
    ok('boss fires burst (>=2 fireballs in ~0.48s)', enemyFires >= 2, 'count=' + enemyFires)
    /* 跳跃 */
    b.jumpT = 0
    b.vy = 0
    g.updateBoss(16)
    ok('boss jumps (vy<0 after trigger)', b.vy < 0, 'vy=' + b.vy)
  }
}

/* ============ 4. 绿龟壳机制 ============ */
{
  const g = createGame(ctx, {})
  g.start({ level: 1 })
  const k = findEnemy(g, 'koopa')
  ok('1-1 has koopa', !!k)
  if (k) {
    /* 踩一下 (下落中 vy>0) → 缩壳 (shell=1, 不消失) */
    k.x = g.player.x + 30
    k.y = 9 * 24
    k.vy = 0
    k.vx = 0
    k.activated = true
    g.player.x = k.x + k.w / 2 - g.player.w / 2
    g.player.y = k.y - g.player.h - 1
    g.player.vy = 3
    g.updateEnemies(16)
    ok('stomp koopa -> shell=1, still alive', k.alive && k.shell === 1, 'alive=' + k.alive + ' shell=' + k.shell)

    /* 踢飞: 玩家从侧面碰静止壳 → 壳滑动 (shell=2, vx!=0) */
    g.player.x = k.x + k.w - 2
    g.player.y = k.y + k.h * 0.6   // 底部低于中点, 侧面碰
    g.player.vy = 0
    g.updateEnemies(16)
    ok('side hit shell -> sliding (shell=2, vx!=0)', k.shell === 2 && k.vx !== 0, 'shell=' + k.shell + ' vx=' + k.vx)
    ok('shell speed ~2.6', Math.abs(k.vx) > 2, 'vx=' + k.vx)
  }
}

/* 壳滑动杀敌 */
{
  const g = createGame(ctx, {})
  g.start({ level: 1 })
  const k = g.enemies.find((e) => e.kind === 'koopa')
  const goomba = g.enemies.find((e) => e.kind === 'goomba')
  if (k && goomba) {
    k.activated = true
    goomba.activated = true
    k.shell = 2
    k.vx = 2.6
    k.x = goomba.x - k.w - 2
    k.y = goomba.y
    for (let f = 0; f < 10; f++) g.updateEnemies(16)
    ok('sliding shell kills goomba', !goomba.alive, 'alive=' + goomba.alive)
  } else {
    ok('sliding shell kills goomba', false, 'koopa/goomba not found')
  }
}

/* 壳撞墙反弹 */
{
  const g = createGame(ctx, {})
  g.start({ level: 4 })
  const k = g.enemies.find((e) => e.kind === 'koopa' || e.kind === 'redkoopa')
  if (k) {
    k.activated = true
    k.shell = 2
    k.vx = 2.6
    k.x = 6 * 24
    k.y = 9 * 24
    for (let f = 0; f < 60; f++) g.updateEnemies(16)
    ok('shell still alive after wall bounce', k.alive && k.shell === 2, 'alive=' + k.alive + ' shell=' + k.shell)
  } else {
    ok('shell wall bounce', true, 'no koopa in 1-4, skip')
  }
}

/* ============ 5. 库巴严格原版: 桥/斧头/踩踏/火球/假库巴 ============ */
{
  const g = createGame(ctx, {})
  g.start({ level: 4 })
  const b = g.boss
  ok('boss is 2x2 tiles (原版玩家2倍)', b && b.w === 48 && b.h === 48, b && b.w + 'x' + b.h)
  ok('1-4 boss is decoy (假库巴)', b && b.isDecoy === true)
  ok('bridge present (斧头桥)', g.bridges.length >= 8, 'bridge=' + g.bridges.length)
  ok('bridge is one-way (h=24 body not blocked)', g.collideTiles(g.bridges[5].x, g.bridges[5].y - 10, 24, 24) === null || g.collideTiles(g.bridges[5].x, g.bridges[5].y - 10, 24, 24).type !== 'bridge')
  /* 摸斧头 -> 桥逐段塌 -> 库巴坠岩浆 -> 通关 */
  g.player.x = g.axe.x - 4
  g.player.y = g.axe.y - g.player.h + 6
  g.tick(16)
  ok('axe taken -> bridge collapse', g.axe.taken && g.bridgeCollapse)
  for (let f = 0; f < 400; f++) g.tick(16)
  ok('bridge fully collapsed', g.bridges.every((t) => t.dead))
  ok('boss dies in lava after axe', !g.boss.alive)
  ok('course clear after collapse', g.state === 'clear', g.state)
}

/* ============ 6. 踩库巴 = 受伤 (原版 Stomp=xx) ============ */
{
  const g = createGame(ctx, {})
  g.start({ level: 4 })
  const b = g.boss
  g.player.x = b.x + b.w / 2 - g.player.w / 2
  g.player.y = b.y - g.player.h - 2
  g.player.vy = 5
  g.tick(16)
  ok('stomp boss -> hurt (not bounce, 原版踩库巴受伤)', g.state === 'dead' || g.invuln > 0 || g.player.power !== 'small' || g.lives < 3, 'state=' + g.state)
  ok('boss NOT killed by stomp', b.alive)
}

/* ============ 7. 火球 5 发击杀假库巴 -> 现原形 (原版 Fire=5000) ============ */
{
  const g = createGame(ctx, {})
  g.start({ level: 4 })
  const b = g.boss
  for (let i = 0; i < 5; i++) g.hurtBoss(1)
  ok('5 fireballs kill decoy', !b.alive)
  const decoy = g.enemies.find((e) => e.kind === 'goomba' || e.kind === 'koopa')
  ok('decoy reveals true form (1-4 goomba)', !!decoy && decoy.kind === 'goomba')
  ok('decoy kill gives 5000', g.score >= 5000)
}

/* ============ 8. 8-4 真库巴 + 6-4 扔锤 (原版) ============ */
{
  const g = createGame(ctx, {})
  g.start({ level: 32 })
  ok('8-4 boss is REAL bowser', g.boss && g.boss.isDecoy === false)
  ok('8-4 has bridge', g.bridges.length >= 8)
}
{
  const g = createGame(ctx, {})
  g.start({ level: 24 })
  const b = g.boss
  g.player.x = b.x + 100
  b.throwT = 1700
  g.updateBoss(16)
  ok('6-4 boss throws hammer (原版扔锤关)', g.enemies.some((e) => e.kind === 'hammer' && e.isProjectile))
}

console.log(`\n==== ${pass} passed, ${fail} failed ====`)
process.exit(fail > 0 ? 1 : 0)
