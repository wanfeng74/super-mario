<template>
  <div class="wrapper">
    <canvas
      ref="game"
      class="game-canvas"
      :width="960"
      :height="266"
      :style="{ width: '960px', height: '266px' }"
      @touchstart="onTouchStart"
      @touchmove="onTouchMove"
      @touchend="onTouchEnd"
      @touchcancel="onTouchEnd"
    ></canvas>

    <!-- ===== 标题画面: 三个存档位 ===== -->
    <div class="title-layer" v-if="screen === 'title'">
      <div class="slot" v-for="s in slots" :key="s.idx" @touchstart="pickSlot(s)">
        <text class="slot-title">存档 {{ s.idx + 1 }}</text>
        <text class="slot-sub" v-if="!s.empty"
          >WORLD {{ s.level }} · 分数 {{ s.score }} · 金币 x{{ s.coins }} · 生命 x{{ s.lives }}</text
        >
        <text class="slot-sub" v-else>空存档 · 点击开始新游戏</text>
      </div>
      <div class="slot about-slot" @touchstart="goAbout">
        <text class="slot-title">关于</text>
      </div>
      <text class="tip" v-if="persistOk === false">存档不可用（本次运行仅内存保存）</text>
      <text class="tip">屏幕分三段触摸区：左侧左移 / 中间右移 / 右侧跳跃（支持多指同按）</text>
      <text class="tip">吃到火焰花后右上角出现 FIRE 按钮 · 游戏时点击左上角暂停</text>
    </div>

    <!-- ===== 关于页 ===== -->
    <div class="title-layer" v-if="screen === 'about'">
      <text class="pause-title">关于</text>
      <div class="about-box">
        <text class="about-line">超级马里奥 · 蘑菇王国冒险 v{{ version }}</text>
        <text class="about-line">纯触摸操作 · 不依赖鼠标 · 960×266 横屏适配</text>
        <text class="about-line">关卡：1-1 草原 / 1-2 地下 / 1-3 原野 / 1-4 库巴城堡</text>
        <text class="about-line">强化道具：超级蘑菇（变大）/ 火焰花（火球）/ 无敌星 / 1UP</text>
        <text class="about-line">收集金币、踩扁敌人、抵达旗杆通关；吃到蘑菇后可以顶碎砖块</text>
        <text class="about-line">存档位 3 个 · 自动保存至 /userdisk/database</text>
      </div>
      <div class="slot" @touchstart="backFromAbout">
        <text class="slot-title">返回</text>
      </div>
    </div>

    <!-- ===== 暂停菜单 ===== -->
    <div class="title-layer" v-if="screen === 'paused'">
      <text class="pause-title">PAUSED</text>
      <div class="slot" @touchstart="resumeGame">
        <text class="slot-title">继续游戏</text>
        <text class="slot-sub">WORLD {{ gameState.level }} · 分数 {{ gameState.score }} · 时间 {{ gameState.time }}</text>
      </div>
      <div class="slot" @touchstart="doSave">
        <text class="slot-title">保存进度{{ saveMsg }}</text>
        <text class="slot-sub" v-if="curSlot >= 0">写入存档 {{ curSlot + 1 }}（覆盖）</text>
      </div>
      <div class="slot" @touchstart="backTitle">
        <text class="slot-title">返回标题</text>
      </div>
      <div class="slot" v-if="curSlot >= 0" @touchstart="doDelete">
        <text class="slot-title slot-danger">删除存档 {{ curSlot + 1 }}</text>
      </div>
    </div>

    <!-- ===== 游戏结束 ===== -->
    <div class="title-layer" v-if="screen === 'gameover'">
      <text class="pause-title">GAME OVER</text>
      <text class="tip">最终分数 {{ gameState.score }} · 金币 x{{ gameState.coins }}</text>
      <div class="slot" @touchstart="backTitle">
        <text class="slot-title">返回标题</text>
      </div>
    </div>
  </div>
</template>

<script>
import { createGame } from '../../services/game/engine.js'
import { loadSlots, loadSlot, saveSlot, clearSlot, persistAvailable } from '../../services/save.js'
import { APP_VERSION } from '../../services/version.js'

export default {
  name: 'index',
  data() {
    return {
      screen: 'title', // title | game | paused | gameover | about
      slots: [],
      curSlot: -1,
      saveMsg: '',
      persistOk: true,
      version: APP_VERSION,
      _touchZones: {},
      gameState: { level: 1, score: 0, coins: 0, lives: 3, time: 300, power: 'small' },
    }
  },
  methods: {
    /* ---- 页面生命周期 (falcon) ---- */
    onShow() {
      if (this._started) {
        // 从后台回来: 游戏进行中则恢复循环
        if (this.screen === 'game' && this._game) this.startLoop()
        return
      }
      this._started = true
      this.initGame()
    },
    onHide() {
      // 切后台: 停止游戏循环 (时间冻结, 相当于自动暂停)
      this.stopLoop()
    },
    onUnload() {
      this.stopLoop()
      if (this._keyDown) {
        try {
          if (typeof window !== 'undefined' && window.removeEventListener) {
            window.removeEventListener('keydown', this._keyDown)
            window.removeEventListener('keyup', this._keyUp)
          }
        } catch (e) {}
      }
    },

    /* ---- 初始化 ---- */
    initGame() {
      var canvas = this.$refs.game
      var ctx = null
      try {
        if (canvas && typeof canvas.getContext === 'function') ctx = canvas.getContext('2d')
      } catch (e) {
        ctx = null
      }
      if (!ctx && typeof createCanvasContext === 'function') {
        try {
          ctx = createCanvasContext(canvas)
        } catch (e2) {
          ctx = null
        }
      }
      this._ctx = ctx
      this._game = createGame(ctx, {
        onGameOver: (st) => {
          this.gameState = st
          this.screen = 'gameover'
        },
      })
      // 预览调试暴露 (真机 window 为空对象, 赋值无害)
      try {
        if (typeof window !== 'undefined') window.__marioGame = this._game
      } catch (e) {}

      this.persistOk = persistAvailable()
      var self = this
      loadSlots().then(function (slots) {
        self.slots = slots
      })

      // 键盘 (仅预览器调试用, 真机无键盘自动忽略)
      try {
        if (typeof window !== 'undefined' && window.addEventListener) {
          this._keyDown = function (e) {
            self.keyHandler(e, true)
          }
          this._keyUp = function (e) {
            self.keyHandler(e, false)
          }
          window.addEventListener('keydown', this._keyDown)
          window.addEventListener('keyup', this._keyUp)
        }
      } catch (e) {}

      this.startTitleAnim()
    },

    refreshSlots() {
      var self = this
      loadSlots().then(function (slots) {
        self.slots = slots
      })
      // 标题背景动画
      if (this._titleTimer) clearInterval(this._titleTimer)
      this._titleTimer = setInterval(function () {
        if (self.screen !== 'title') return
        self.titleTick()
      }, 100)
    },

    startTitleAnim() {
      var self = this
      if (this._titleTimer) clearInterval(this._titleTimer)
      this._titleTimer = setInterval(function () {
        if (self.screen !== 'title') return
        self.titleTick()
      }, 100)
    },

    titleTick() {
      if (!this._game || !this._ctx) return
      try {
        this._game.renderTitle()
      } catch (e) {}
    },

    /* ---- 存档槽交互 ---- */
    pickSlot(s) {
      // 防抖: backTitle/doDelete 重建 DOM 期间可能收到重复触摸, 短时间忽略
      if (this._blockPickUntil && Date.now() < this._blockPickUntil) {
        return
      }
      this.curSlot = s.idx
      var self = this
      var fresh = { level: 1, score: 0, coins: 0, lives: 3, time: 300, power: 'small' }
      loadSlot(s.idx).then(function (st) {
        if (st.empty) st = fresh
        self.gameState = {
          level: st.level,
          score: st.score,
          coins: st.coins,
          lives: st.lives,
          time: st.time,
          power: st.power || 'small',
        }
        try {
          self._game.start(st)
        } catch (e) {}
        self.screen = 'game'
        self.saveMsg = ''
        self.startLoop()
      })
    },

    /* ---- 暂停 ---- */
    pauseGame() {
      if (this.screen !== 'game') return
      this.stopLoop()
      this.gameState = this._game.getState()
      this.screen = 'paused'
    },
    resumeGame() {
      if (this.screen !== 'paused') return
      this.saveMsg = ''
      this.screen = 'game'
      this.startLoop()
    },
    doSave() {
      var self = this
      saveSlot(this.curSlot, this._game.getState()).then(function (ok) {
        self.persistOk = ok
        self.saveMsg = ok ? ' ✓已保存' : ' ✗保存失败'
        if (self._saveMsgTimer) clearTimeout(self._saveMsgTimer)
        self._saveMsgTimer = setTimeout(function () {
          self.saveMsg = ''
        }, 1500)
      })
    },
    doDelete() {
      this._blockPickUntil = Date.now() + 400
      var self = this
      clearSlot(this.curSlot).then(function () {
        self.screen = 'title'
        self.curSlot = -1
        self.refreshSlots()
      })
    },
    backTitle() {
      this._blockPickUntil = Date.now() + 400
      this.stopLoop()
      this.screen = 'title'
      this.curSlot = -1
      this.refreshSlots()
    },
    goAbout() {
      if (this.screen !== 'title') return
      this.stopLoop()
      this.screen = 'about'
    },
    backFromAbout() {
      if (this.screen !== 'about') return
      this.screen = 'title'
      this.refreshSlots()
    },

    /* ---- 游戏循环 ---- */
    startLoop() {
      if (this._loopToken != null) return
      var self = this
      this._lastTs = Date.now()
      this._loopToken = setInterval(function () {
        var now = Date.now()
        var dt = now - self._lastTs
        self._lastTs = now
        if (dt > 100) dt = 100
        if (self.screen !== 'game' || !self._game) return
        try {
          self._game.tick(dt)
          self._game.render()
        } catch (e) {}
      }, 16)
    },
    stopLoop() {
      if (this._loopToken != null) {
        clearInterval(this._loopToken)
        this._loopToken = null
      }
    },

    /* ---- 触摸输入: 多指跟踪, 方向+跳跃可同时按住 ---- */
    /* 热区: 左<320 左移 | 320-640 右移 | >=640 跳跃; 右上角 FIRE 按钮 (火焰形态)
       左上角 x>860 y<46 暂停 */
    onTouchStart(ev) {
      if (this.screen !== 'game') return
      var ts = ev.touches && ev.touches.length > 0 ? ev.touches : ev.changedTouches || []
      for (var i = 0; i < ts.length; i++) {
        var t = ts[i]
        var pt = this.pointOf(t)
        if (!pt) continue
        if (pt.y < 46 && pt.x > 860) {
          this.pauseGame()
          continue
        }
        var id = t.identifier != null ? t.identifier : 'p' + i
        var zone = this.zoneOf(pt)
        if (zone === 'fire') {
          // 火球只按下瞬间发射一次
          try {
            this._game.setInput('fire', true)
          } catch (e) {}
          zone = 'none'
        }
        this._touchZones[id] = zone
      }
      this.refreshTouchInput()
    },
    onTouchMove(ev) {
      if (this.screen !== 'game') return
      var ts = ev.touches || []
      for (var i = 0; i < ts.length; i++) {
        var t = ts[i]
        var id = t.identifier != null ? t.identifier : 'p' + i
        if (this._touchZones[id] == null) continue
        var pt = this.pointOf(t)
        if (!pt) continue
        if (pt.y < 46 && pt.x > 860) {
          delete this._touchZones[id]
          continue
        }
        var z = this.zoneOf(pt)
        this._touchZones[id] = z === 'fire' ? 'none' : z
      }
      this.refreshTouchInput()
    },
    onTouchEnd(ev) {
      var ts = ev.changedTouches || []
      for (var i = 0; i < ts.length; i++) {
        var t = ts[i]
        var id = t.identifier != null ? t.identifier : 'p' + i
        delete this._touchZones[id]
      }
      if (this.screen !== 'game') return
      this.refreshTouchInput()
    },
    refreshTouchInput() {
      if (!this._game) return
      var left = false
      var right = false
      var jump = false
      for (var id in this._touchZones) {
        var z = this._touchZones[id]
        if (z === 'left') left = true
        else if (z === 'right') right = true
        else if (z === 'jump') jump = true
      }
      this._game.setInput('left', left)
      this._game.setInput('right', right)
      this._game.setInput('jump', jump)
    },
    /* 热区判定 */
    zoneOf(pt) {
      var isFire = false
      try {
        isFire = this._game.getState().power === 'fire'
      } catch (e) {}
      if (pt.x < 320) return 'left'
      if (pt.x < 640) return 'right'
      if (isFire && pt.x >= 820 && pt.y >= 46 && pt.y < 112) return 'fire'
      return 'jump'
    },
    pointOf(t) {
      if (!t) return null
      var x = t.clientX != null ? t.clientX : t.pageX != null ? t.pageX : t.x
      var y = t.clientY != null ? t.clientY : t.pageY != null ? t.pageY : t.y
      if (x == null || y == null) return null
      return { x: x, y: y }
    },
    touchPoint(ev) {
      if (!ev) return null
      var t = null
      if (ev.touches && ev.touches.length > 0) t = ev.touches[0]
      else if (ev.changedTouches && ev.changedTouches.length > 0) t = ev.changedTouches[0]
      else if (ev.clientX != null) t = ev
      if (!t) return null
      var x = t.clientX != null ? t.clientX : t.pageX != null ? t.pageX : t.x
      var y = t.clientY != null ? t.clientY : t.pageY != null ? t.pageY : t.y
      if (x == null || y == null) return null
      return { x: x, y: y }
    },

    /* ---- 键盘 (仅预览器调试) ---- */
    keyHandler(e, down) {
      if (this.screen !== 'game') return
      var k = e && e.key != null ? e.key : ''
      var kc = e && e.keyCode != null ? e.keyCode : 0
      if (k === 'ArrowLeft' || k === 'a' || k === 'A' || kc === 37) {
        this._game.setInput('left', down)
        if (down && e.preventDefault) e.preventDefault()
      } else if (k === 'ArrowRight' || k === 'd' || k === 'D' || kc === 39) {
        this._game.setInput('right', down)
        if (down && e.preventDefault) e.preventDefault()
      } else if (k === ' ' || k === 'ArrowUp' || k === 'w' || k === 'W' || k === 'x' || k === 'X' || kc === 32 || kc === 38) {
        this._game.setInput('jump', down)
        if (down && e.preventDefault) e.preventDefault()
      } else if (down && (k === 'Escape' || k === 'p' || k === 'P' || kc === 27 || kc === 80)) {
        this.pauseGame()
      }
    },
  },
}
</script>

<style scoped>
.wrapper {
  position: relative;
  width: 960px;
  height: 266px;
  background-color: #6cb8f8;
}

.game-canvas {
  position: absolute;
  left: 0;
  top: 0;
}

.title-layer {
  position: absolute;
  left: 0;
  top: 0;
  width: 960px;
  height: 266px;
  flex-direction: column;
  justify-content: flex-end;
  align-items: center;
  padding-bottom: 4px;
}

.slot {
  width: 520px;
  height: 42px;
  margin-bottom: 5px;
  background-color: rgba(20, 20, 30, 0.72);
  border-width: 2px;
  border-color: #ffd75e;
  border-style: solid;
  border-radius: 6px;
  flex-direction: column;
  justify-content: center;
  align-items: center;
}

.slot-title {
  color: #ffffff;
  font-size: 17px;
  font-weight: bold;
  line-height: 20px;
}

.slot-danger {
  color: #ff8080;
}

.slot-sub {
  color: #ffd75e;
  font-size: 12px;
  line-height: 15px;
}

.pause-title {
  color: #ffd75e;
  font-size: 30px;
  font-weight: bold;
  margin-bottom: 6px;
}

.about-slot {
  width: 520px;
  height: 34px;
  margin-bottom: 4px;
  background-color: rgba(30, 40, 80, 0.72);
}

.about-box {
  width: 700px;
  margin-bottom: 8px;
  padding-top: 8px;
  padding-bottom: 8px;
  padding-left: 14px;
  padding-right: 14px;
  background-color: rgba(20, 20, 30, 0.72);
  border-width: 2px;
  border-color: #3169c7;
  border-style: solid;
  border-radius: 8px;
  flex-direction: column;
  justify-content: center;
  align-items: flex-start;
}

.about-line {
  color: #e8ecf8;
  font-size: 13px;
  line-height: 19px;
}

.tip {
  color: rgba(255, 255, 255, 0.92);
  font-size: 12px;
  line-height: 16px;
  text-align: center;
}
</style>
