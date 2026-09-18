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
      @mousedown="onMouseDown"
      @mousemove="onMouseMove"
      @mouseup="onMouseUp"
      @click="onClickTap"
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
      <text class="tip">屏幕分三段触摸区：左侧左移 / 中间右移 / 右侧跳跃</text>
      <text class="tip">吃到火焰花后右上角出现 FIRE 按钮 · 游戏时点击右上角暂停</text>
    </div>

    <!-- ===== 关于页 ===== -->
    <div class="title-layer" v-if="screen === 'about'">
      <text class="pause-title">关于</text>
      <div class="about-box">
        <text class="about-version-text">超级马里奥 · 蘑菇王国冒险 v{{ version }}</text>
        <text class="about-line">纯触摸操作 · 不依赖鼠标 · 960×266 横屏适配</text>
        <text class="about-line">关卡：1-1 草原 / 1-2 地下 / 1-3 台阶 / 1-4 库巴城堡</text>
        <text class="about-line">　　　2-1 管道 / 2-2 地下 / 2-3 台阶 / 2-4 库巴城堡二</text>
        <text class="about-line">强化道具：超级蘑菇（变大）/ 火焰花（火球）/ 无敌星 / 1UP</text>
        <text class="about-line">收集金币、踩扁敌人、抵达旗杆通关；吃到蘑菇后可以顶碎砖块</text>
        <text class="about-line">存档位 3 个 · 自动保存至 /userdisk/database</text>
        <div class="debug-btn" @touchstart="enterDebug" @click="enterDebug" @tap="enterDebug">
          <text class="debug-btn-text">调试模式</text>
        </div>
      </div>
      <div class="slot" @touchstart="backFromAbout">
        <text class="slot-title">返回</text>
      </div>
    </div>

    <!-- ===== 调试模式 ===== -->
    <div class="title-layer" v-if="screen === 'debug'">
      <text class="pause-title debug-title">调试模式</text>
      <text class="tip">你已进入调试模式 · 设置仅在本次运行生效</text>
      <div class="debug-row">
        <text class="debug-label">关卡</text>
        <div
          class="debug-chip"
          v-for="lv in [1, 2, 3, 4, 5, 6, 7, 8]"
          :key="lv"
          :class="{ 'debug-chip-on': debugLevel === lv }"
          @touchstart="pickDebugLevel(lv)"
        >
          <text class="debug-chip-text">{{ debugLevelName(lv) }}</text>
        </div>
      </div>
      <div class="debug-row">
        <text class="debug-label">无敌</text>
        <div class="debug-chip" :class="{ 'debug-chip-on': debugStar }" @touchstart="toggleDebugStar">
          <text class="debug-chip-text">{{ debugStar ? '开启' : '关闭' }}</text>
        </div>
      </div>
      <div class="slot" @touchstart="backFromDebug">
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
      screen: 'title', // title | game | paused | gameover | about | debug
      slots: [],
      curSlot: -1,
      saveMsg: '',
      persistOk: true,
      version: APP_VERSION,
      debugMode: false,
      debugLevel: 1,
      debugStar: false,
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
        // 调试模式: 覆盖关卡/无敌
        if (self.debugMode) {
          st.level = self.debugLevel
          st.time = 300
        }
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
        if (self.debugMode && self.debugStar) {
          try {
            self._game.player.starTimer = 999999999 // 永久无敌
          } catch (e) {}
        }
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
    enterDebug() {
      if (this.screen !== 'about') return
      this.debugMode = true
      this.screen = 'debug'
    },
    pickDebugLevel(lv) {
      if (this.screen !== 'debug') return
      this.debugLevel = lv
    },
    debugLevelName(lv) {
      return lv <= 4 ? '1-' + lv : '2-' + (lv - 4)
    },
    toggleDebugStar() {
      if (this.screen !== 'debug') return
      this.debugStar = !this.debugStar
    },
    backFromDebug() {
      if (this.screen !== 'debug') return
      this.screen = 'about'
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
       右上角 x>860 y<46 暂停 */
    /* ---- 触摸输入: 与 v1.2.0 一致 (单点按下即动, touchend 全复位),
       附加火焰形态 FIRE 热区 ---- */
    /* 热区: 左<320 左移 | 320-640 右移 | >=640 跳跃; FIRE 右上角 (火焰形态)
       暂停热区: 右上角 x>860 y<46 */
    onTouchStart(ev) {
      var pt = this.touchPoint(ev)
      if (!pt) return
      if (this.screen !== 'game') return
      if (pt.y < 46 && pt.x > 860) {
        this.pauseGame()
        return
      }
      if (this.isFireZone(pt)) {
        try {
          this._game.setInput('fire', true)
        } catch (e) {}
        return
      }
      this.applyTouch(pt)
    },
    onTouchMove(ev) {
      var pt = this.touchPoint(ev)
      if (!pt || this.screen !== 'game') return
      if (pt.y < 46 && pt.x > 860) return
      if (this.isFireZone(pt)) return
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
    /* FIRE 热区: 火焰形态下右上角按钮区 (按下瞬间发射, 不抢方向/跳跃) */
    isFireZone(pt) {
      if (!this._game) return false
      try {
        if (this._game.getState().power !== 'fire') return false
      } catch (e) {
        return false
      }
      return pt.x >= 820 && pt.y >= 46 && pt.y < 112
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
    /* 预览器/部分环境鼠标事件兜底: 统一转成触摸处理 */
    onMouseDown(e) {
      if (e && e.preventDefault) e.preventDefault()
      this.onTouchStart({ clientX: e && e.clientX, clientY: e && e.clientY, touches: [], changedTouches: [] })
    },
    onMouseMove(e) {
      if (e && e.preventDefault) e.preventDefault()
      this.onTouchMove({ clientX: e && e.clientX, clientY: e && e.clientY, touches: [], changedTouches: [] })
    },
    onMouseUp(e) {
      if (e && e.preventDefault) e.preventDefault()
      this.onTouchEnd({ clientX: e && e.clientX, clientY: e && e.clientY, touches: [], changedTouches: [] })
    },
    /* tap 兜底: 只处理 FIRE 与暂停热区 (方向/跳跃由 down/up 处理) */
    onClickTap(e) {
      if (this.screen !== 'game' || !this._game) return
      var pt = this.touchPoint(e)
      if (!pt) return
      if (pt.y < 46 && pt.x > 860) {
        this.pauseGame()
        return
      }
      if (this.isFireZone(pt)) {
        try {
          this._game.setInput('fire', true)
        } catch (err) {}
      }
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

.about-version {
  width: 100%;
  height: 52px;
  margin-bottom: 6px;
  background-color: rgba(70, 90, 160, 0.85);
  border-width: 2px;
  border-color: #ffd75e;
  border-style: solid;
  border-radius: 8px;
  align-items: center;
  justify-content: center;
}

.about-version-text {
  color: #ffd75e;
  font-size: 22px;
  font-weight: bold;
}

.about-version-count {
  color: #7ee787;
  font-size: 13px;
  font-weight: bold;
  margin-top: 2px;
}

.debug-btn {
  width: 260px;
  height: 44px;
  border-radius: 8px;
  border-width: 2px;
  border-color: #ffd75e;
  background-color: #3a2f14;
  align-items: center;
  justify-content: center;
  margin-top: 10px;
}

.debug-btn-text {
  color: #ffd75e;
  font-size: 20px;
  font-weight: bold;
}

.debug-title {
  color: #ff5a5a;
}

.debug-row {
  width: 700px;
  flex-direction: row;
  align-items: center;
  justify-content: flex-start;
  margin-bottom: 6px;
}

.debug-label {
  color: #ffd75e;
  font-size: 15px;
  font-weight: bold;
  margin-right: 12px;
  width: 48px;
}

.debug-chip {
  width: 76px;
  height: 34px;
  margin-right: 10px;
  background-color: rgba(30, 40, 80, 0.72);
  border-width: 2px;
  border-color: #555f7a;
  border-style: solid;
  border-radius: 6px;
  align-items: center;
  justify-content: center;
}

.debug-chip-on {
  border-color: #ffd75e;
  background-color: rgba(120, 60, 10, 0.8);
}

.debug-chip-text {
  color: #e8ecf8;
  font-size: 14px;
  font-weight: bold;
}

.tip {
  color: rgba(255, 255, 255, 0.92);
  font-size: 12px;
  line-height: 16px;
  text-align: center;
}
</style>
