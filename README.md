# 超级马里奥 (有道词典笔版)

面向有道词典笔 falcon UI 平台的横版卷轴平台跳跃游戏。

## 玩法

- 三段触摸区：屏幕左侧按住 **左移**、中间按住 **右移**、右侧按住 **跳跃**
- 踩敌人消灭它；顶问号块出金币；顶砖块打碎得分；收集金币（100 金币 +1 命）
- 到达旗杆过关，关卡 1-1 ~ 2-4 共 8 关
- 3 条命，掉坑 / 被敌人碰到 / 时间耗尽扣命
- 右上角触摸暂停：可继续 / 保存进度 / 返回标题 / 删除存档

## 存档

存档写入 `/userdisk/database/mario_save.json`，共 **3 个存档位**。

## 安装 (真机)

```sh
adb push 8001865309000002.1_2_4.amr /data/local/tmp/
adb shell "miniapp_cli install /data/local/tmp/8001865309000002.1_2_4.amr"
adb shell "miniapp_cli start 8001865309000002"
```

## 本地预览 / 构建

```sh
pnpm install -C ./ui
pnpm -C ui preview          # 浏览器预览 (键盘: 方向键移动, 空格/↑ 跳, P/Esc 暂停)
pnpm -C ui package          # 生产 AMR (aiot-cli -c -q -p)
```

## 工程结构

```
ui/
  src/app.js                 # setViewPort(960) + BasePage 注册
  src/app.json               # 页面注册 (仅 index)
  src/base-page.js           # 页面基类: 定时器统一释放
  src/pages/index/index.vue  # 游戏页面 (标题/存档位/暂停/触摸输入)
  src/services/game/levels.js # 关卡数据 (段式描述, 1-1~2-4 共8关)
  src/services/game/engine.js # Canvas 引擎 (物理/碰撞/敌人/渲染/离屏贴图缓存)
  src/services/game/sprites.js # 像素贴图精灵表
  src/services/save.js       # 3 存档位持久化
  src/services/version.js    # 版本号
```

---

# 开发踩坑记录（必读）

本项目在有道词典笔 falcon UI 平台上踩过的所有坑，后续开发务必规避。

## 一、打包配置坑

### 1. `quickjs.version` 不能改成 app 版本号

```
❌ 错误: "quickjs": { "version": "1.2.2" }
✅ 正确: "quickjs": { "version": "20200705" }
```

**原因**：`quickjs.version` 指向 qjsc 二进制文件名（qjsc20200705），不是 app 版本。改成 app 版本会找不到 qjsc，打包报错 `Can't find qjsc1.2.2`。

顶层 `version` 才是 app 版本号，两者分开。

### 2. appid 必须唯一

每个 app 用独立 appid（如 8001865309000002/3/4），不能和其他 app 重复。

## 二、Canvas 渲染坑（绿屏/黑屏/崩溃）

### 3. `canvas.getContext('2d')` 必须在页面层获取，不能在引擎里

```js
// ✅ 正确: index.vue 里获取 ctx 再传给引擎
var canvas = this.$refs.game
var ctx = null
try { ctx = canvas.getContext('2d') } catch(e) {}
this._game = createGame(ctx, {})

// ❌ 错误: 引擎里接收 canvas 再 getContext
function createGame(canvas, opts) {
  var ctx = canvas.getContext('2d')  // 可能返回 null
}
```

falcon 设备上 canvas 初始化时机特殊，必须在 Vue 页面生命周期 `onShow` 里获取 ctx。

### 4. 绝对不能递归调用 `getContext`

```js
// ❌ 严重错误: 无限递归, 栈溢出黑屏重启
function createCanvasContext(canvas) {
  var ctx = canvas.getContext('2d')
  if (!ctx) ctx = createCanvasContext(canvas)  // 死递归!
  return ctx
}
```

getContext 失败就直接返回 null，引擎里 `if (!this.ctx) return` 保护。

### 5. falcon canvas **不支持** 的 API（调用即崩溃）

| API | 后果 | 替代方案 |
|-----|------|----------|
| `ctx.textBaseline = 'middle'` | 直接崩溃，渲染中断 | 不设 textBaseline，手算 y 偏移 |
| `ctx.strokeRect(x,y,w,h)` | 直接崩溃，后面 fillText 不执行 | 用 4 条 `fillRect` 画边框 |
| `ctx.arc()` / 复杂路径 | 可能不支持 | 尽量用 fillRect 画几何 |

**原则**：falcon canvas 是极简实现，只保留最常用的 `fillRect` / `fillText` / `drawImage` / `fillStyle` / `font` / `textAlign`。其他 API 先在真机验证。

### 6. 字体注意

- `font = 'bold 14px sans-serif'` 可用
- 不要用 `textBaseline`
- 不要用自定义字体文件
- `textAlign` 只用 `left` / `center`

## 三、触摸输入坑

### 7. 纯触摸，无鼠标

- 只有 `touchstart` / `touchmove` / `touchend` / `touchcancel` 事件
- 没有 `mousedown` / `mousemove`（浏览器预览时才有）
- `touchend` 可能不带坐标，要清空所有输入状态

```js
onTouchEnd() {
  this._game.setInput('left', false)
  this._game.setInput('right', false)
  this._game.setInput('jump', false)
}
```

### 8. 同时按方向键+跳跃键可能被系统打断

这是设备系统级问题，应用层无法解决。目前方案：三段触摸区（左/中/右），用户尽量不同时按。

### 9. `touches` 数组可能不存在

falcon 部分版本只在 `changedTouches` 里给坐标，要兼容：

```js
var t = ev.touches && ev.touches[0] ? ev.touches[0] : ev.changedTouches[0]
```

## 四、性能坑

### 10. falcon 设备性能极弱

- 主频低，全屏 fillRect 每帧几百次就会卡
- **优化手段**：
  - 离屏 canvas 缓存贴图（`drawImage` 比 `fillRect` 快 10 倍以上）
  - 减少每帧 fillRect 调用次数
  - 贴图压缩（缩小分辨率、减少颜色数）
  - 不要每帧创建新对象（垃圾回收卡顿）

### 11. 帧率控制

用 `setInterval(16)` 约 60fps，dt 用 `Date.now()` 差值计算，不要假设固定帧间隔。

## 五、存档坑

### 12. 存档路径

```
/userdisk/database/<app_name>_save.json
```

- 固件没有 `localStorage` / `fs` 模块
- 用 `panet.readFile` / `panet.writeFile` 读写
- 目录不存在要自己创建

### 13. 存档初始化崩溃

不要在引擎构造函数里直接调用文件 API，falcon 环境里文件系统初始化时机不确定。要 try/catch 包好，失败就用默认值。

## 六、游戏逻辑坑

### 14. 顶部空气墙

人物跳跃不能无限高，必须在 `movePlayerY` 里加：

```js
if (p.y < 0) {
  p.y = 0
  if (p.vy < 0) p.vy = 0
}
```

### 15. 长按跳跃要有上限

不能按住跳跃键就无限跳，加时间限制：

```js
var JUMP_HOLD_MAX = 280 // 毫秒
if (this.input.jump && p.vy < 0) {
  p.jumpHold += dt
  if (p.jumpHold < JUMP_HOLD_MAX) g *= 0.42
}
```

### 16. 踩怪判定

只有从正上方踩才算踩死，侧面碰到算受伤。判定要宽松一点（y 方向有重叠范围），否则玩家觉得踩不死。

### 17. 怪物悬空

关卡数据里怪物 y 坐标要贴地（`GROUND_Y - 1`），不能让怪物浮在空中。

### 18. 问号块产出

每个问号块只能出一次（`used: false/true`），不能无限出金币。

## 七、QuickJS 语法坑

### 19. 纯 ES5，不支持 ES6+

```js
// ✅ 可以用
var x = 1
function foo() {}
Array.prototype.forEach.call(arr, function() {})

// ❌ 不能用
const x = 1
let y = 2
() => {}
class Foo {}
Array.prototype.map 没问题, 但不要用展开运算符 ...
```

`quickjs.version = "20200705"` 对应的 QuickJS 版本很老，只支持 ES5。

## 八、调试模式

关于页连续点击版本号 10 次进入调试模式：
- 可选关卡（1-1 ~ 2-4）
- 无敌模式
- 仅本次运行生效，不写入存档

## 更新日志

### v1.2.4 (当前)
- 加顶部空气墙，不能跳出地图顶端
- 长按跳跃加上限（最多保持低重力 280ms，不会无限高）

### v1.2.2
- 角色/砖块/管道/问号块全部用原版 SMB 像素贴图
- 离屏 canvas 缓存 + drawImage 快路径, 大幅提升性能
- 8 关按原版布局重做 (1-1~2-4)
- 地下关深蓝青砖 / 城堡关黑灰砖主题
- 加乌龟敌人 (Koopa)
- 调试模式: 关于页独立按钮进入, 可选关/无敌

### v1.2.0
- 触摸逻辑重构: 三段触摸区 (左移/右移/跳跃), 松开全复位
- 3 存档位 + 暂停菜单 (继续/保存/回标题/删档)
- 蘑菇变大 / 火花花变火焰 / 星星无敌

### v1.1.0
- 初始版本: 1-1/1-2 循环, Goomba 敌人, 旗杆通关
