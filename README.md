# 超级马里奥 (有道词典笔版)

面向有道词典笔 X6PRO 的横版卷轴平台跳跃游戏，工程形态完全仿照
[wifi-login](https://github.com/soarnext/wifi-login)（aiot-vue-cli 小程序 +
960×266 横条屏 + AMR 打包）。

## 玩法

- 三段触摸区：屏幕左侧按住 **左移**、中间按住 **右移**、右侧按住 **跳跃**
- 踩敌人消灭它；顶问号块出金币；顶砖块打碎得分；收集金币（100 金币 +1 命）
- 到达旗杆过关，关卡 1-1 / 1-2 循环，难度随周目提升
- 3 条命，掉坑 / 被敌人碰到 / 时间耗尽扣命
- 右上角触摸暂停：可继续 / **保存进度** / 返回标题 / 删除存档

## 存档

固件不提供 storage JS 模块，存档通过原生模块 `panet.writeFile/readFile`
写入应用私有目录 `$dataDir/mario_save.json`，共 **3 个存档位**：
标题画面点存档位进入（有档续玩 / 空档新开），暂停菜单可随时覆盖保存。

## 安装 (真机)

```sh
adb push 8001865309000002.1_0_0.amr /data/local/tmp/
adb shell "miniapp_cli install /data/local/tmp/8001865309000002.1_0_0.amr"
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
  src/services/game/levels.js # 关卡数据 (段式描述, 1-1 / 1-2)
  src/services/game/engine.js # Canvas 引擎 (物理/碰撞/敌人/渲染)
  src/services/save.js       # 3 存档位持久化 (panet 文件)
  src/services/version.js    # 版本号
```
