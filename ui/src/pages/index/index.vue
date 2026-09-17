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
      <text class="tip" v-if="persistOk === false">存档不可用（本次运行仅内存保存）</text>
      <text class="tip">屏幕分三段触摸区：左侧左移 / 中间右移 / 右侧跳跃</text>
      <text class="tip">游戏时点击右上角暂停</text>
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

export default {
  name: 'index',
  data() {
    return {
      screen: 'title', // title | game | paused | gameover
      slots: [],
      curSlot: -1,
      saveMsg: '',
      persistOk: true,
      gameState: { level: 1, score: 0, coins: 0, lives: 3, time: 300 },
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
      var fresh = { level: 1, score: 0, coins: 0, lives: 3, time: 300 }
      loadSlot(s.idx).then(function (st) {
        if (st.empty) st = fresh
        self.gameState = {
          level: st.level,
          score: st.score,
          coins: st.coins,
          lives: st.lives,
          time: st.time,
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

    /* ---- 触摸输入: 三段触摸区 ---- */
    onTouchStart(ev) {
      var pt = this.touchPoint(ev)
      if (!pt) return
      if (this.screen !== 'game') return
      // 右上角暂停热区
      if (pt.y < 46 && pt.x > 860) {
        this.pauseGame()
        return
      }
      this.applyTouch(pt)
    },
    onTouchMove(ev) {
      var pt = this.touchPoint(ev)
      if (!pt || this.screen !== 'game') return
      if (pt.y < 46 && pt.x > 860) return
      this.applyTouch(pt)
    },
    onTouchEnd(ev) {
      if (this.screen !== 'game') return
      this._game.setInput('left', false)
      this._game.setInput('right', false)
      this._game.setInput('jump', false)
    },
    applyTouch(pt) {
      if (pt.x < 320) {
        this._game.setInput('left', true)
        this._game.setInput('right', false)
        this._game.setInput('jump', false)
      } else if (pt.x < 640) {
        this._game.setInput('right', true)
        this._game.setInput('left', false)
        this._game.setInput('jump', false)
      } else {
        this._game.setInput('jump', true)
      }
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

.tip {
  color: rgba(255, 255, 255, 0.92);
  font-size: 12px;
  line-height: 16px;
  text-align: center;
}
</style>
