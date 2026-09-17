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
      <div class="slot" v-for="s in slots" :key="s.idx" @click="pickSlot(s)">
        <text class="slot-title">存档 {{ s.idx + 1 }}</text>
        <text class="slot-sub" v-if="!s.empty"
          >WORLD {{ s.level }} · 分数 {{ s.score }} · 金币 x{{ s.coins }} · 生命 x{{ s.lives }}</text
        >
        <text class="slot-sub" v-else>空存档 · 点击开始新游戏</text>
      </div>
      <text class="tip" v-if="persistOk === false">存档不可用（本次运行仅内存保存）</text>
      <text class="tip">屏幕分三段触摸区：左侧左移 / 中间右移 / 右侧跳跃</text>
      <text class="tip">游戏时点击右上角暂停 · 支持键盘方向键/空格（预览器）</text>
    </div>

    <!-- ===== 暂停菜单 ===== -->
    <div class="title-layer" v-if="screen === 'paused'">
      <text class="pause-title">PAUSED</text>
      <div class="slot" @click="resumeGame">
        <text class="slot-title">继续游戏</text>
        <text class="slot-sub">WORLD {{ gameState.level }} · 分数 {{ gameState.score }} · 时间 {{ gameState.time }}</text>
      </div>
      <div class="slot" @click="doSave">
        <text class="slot-title">保存进度{{ saveMsg }}</text>
        <text class="slot-sub" v-if="curSlot >= 0">写入存档 {{ curSlot + 1 }}（覆盖）</text>
      </div>
      <div class="slot" @click="backTitle">
        <text class="slot-title">返回标题</text>
      </div>
      <div class="slot" v-if="curSlot >= 0" @click="doDelete">
        <text class="slot-title slot-danger">删除存档 {{ curSlot + 1 }}</text>
      </div>
    </div>

    <!-- ===== 游戏结束 ===== -->
    <div class="title-layer" v-if="screen === 'gameover'">
      <text class="pause-title">GAME OVER</text>
      <text class="tip">最终分数 {{ gameState.score }} · 金币 x{{ gameState.coins }}</text>
      <div class="slot" @click="backTitle">
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
        // 从后台/输入法回来: 游戏进行中则恢复循环
        if (this.screen === 'game' && this._game) this.startLoop()
        return
      }
      this._started = true
      this._init()
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
    _init() {
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

      this.persistOk = persistAvailable()
      this.refreshSlots()

      // 键盘 (webpreview / 预览器调试用, 真机无键盘自动忽略)
      var self = this
      try {
        if (typeof window !== 'undefined' && window.addEventListener) {
          this._keyDown = function (e) {
            self._key(e, true)
          }
          this._keyUp = function (e) {
            self._key(e, false)
          }
          window.addEventListener('keydown', this._keyDown)
          window.addEventListener('keyup', this._keyUp)
        }
      } catch (e) {}

      this._titleTick()
    },

    refreshSlots() {
      var self = this
      try {
        this.slots = loadSlots()
      } catch (e) {
        this.slots = []
      }
      // 标题背景动画
      if (this._titleTimer) clearInterval(this._titleTimer)
      this._titleTimer = setInterval(function () {
        if (self.screen !== 'title') return
        self._titleTick()
      }, 100)
    },

    _titleTick() {
      if (!this._game || !this._ctx) return
      try {
        this._game.renderTitle()
      } catch (e) {}
    },

    /* ---- 存档槽交互 ---- */
    pickSlot(s) {
      this.curSlot = s.idx
      var st = s.empty
        ? { level: 1, score: 0, coins: 0, lives: 3, time: 300 }
        : loadSlot(s.idx)
      if (st.empty) {
        st = { level: 1, score: 0, coins: 0, lives: 3, time: 300 }
      }
      this.gameState = {
        level: st.level,
        score: st.score,
        coins: st.coins,
        lives: st.lives,
        time: st.time,
      }
      try {
        this._game.start(st)
      } catch (e) {}
      this.screen = 'game'
      this.saveMsg = ''
      this.startLoop()
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
      var ok = false
      try {
        ok = saveSlot(this.curSlot, this._game.getState())
      } catch (e) {
        ok = false
      }
      this.persistOk = ok
      this.saveMsg = ok ? ' ✓已保存' : ' ✗保存失败'
      var self = this
      if (this._saveMsgTimer) clearTimeout(this._saveMsgTimer)
      this._saveMsgTimer = setTimeout(function () {
        self.saveMsg = ''
      }, 1500)
    },
    doDelete() {
      try {
        clearSlot(this.curSlot)
      } catch (e) {}
      this.screen = 'title'
      this.curSlot = -1
      this.refreshSlots()
    },
    backTitle() {
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
      var pt = this._touchPoint(ev)
      if (!pt) return
      if (this.screen !== 'game') return
      // 右上角暂停热区
      if (pt.y < 46 && pt.x > 860) {
        this.pauseGame()
        return
      }
      this._applyTouch(pt)
    },
    onTouchMove(ev) {
      var pt = this._touchPoint(ev)
      if (!pt || this.screen !== 'game') return
      if (pt.y < 46 && pt.x > 860) return
      this._applyTouch(pt)
    },
    onTouchEnd(ev) {
      if (this.screen !== 'game') return
      this._game.setInput('left', false)
      this._game.setInput('right', false)
      this._game.setInput('jump', false)
    },
    _applyTouch(pt) {
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
    _touchPoint(ev) {
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

    /* ---- 键盘 (预览器调试) ---- */
    _key(e, down) {
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
