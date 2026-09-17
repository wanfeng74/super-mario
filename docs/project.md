# 工程结构与构建

> 返回 [README](../README.md)

## 工程结构

```
ui/                           # aiot-vue-cli 小程序工程
  src/app.js                  # setViewPort(960) + BasePage 注册
  src/app.json                # 页面注册 (index)
  src/base-page.js            # 页面基类: $falcon.on token / setTimeout / setInterval 统一释放
  src/pages/index/index.vue   # 游戏页面: 标题+存档位 / 暂停菜单 / 触摸输入 / 游戏循环
  src/services/game/levels.js # 关卡数据 (段式描述, 瓦片坐标, 1 瓦片=24px)
  src/services/game/engine.js # Canvas 引擎 (物理/碰撞/敌人/粒子/渲染, 纯 ES5)
  src/services/save.js        # 3 存档位: $dataDir/mario_save.json (panet 文件)
  src/services/version.js     # 版本号 (与 package.json 同步)
```

## 构建

```sh
pnpm install -C ./ui
pnpm -C ui build          # debug AMR (aiot-cli -p)
pnpm -C ui package        # 生产 QuickJS AMR (aiot-cli -c -q -p)
```

产物名为 `<appid>.<主>_<次>_<修>.amr`（如 `8001865309000002.1_0_0.amr`）。
版本号在 `ui/package.json` 与 `ui/src/services/version.js` 两处同步。

## 安装

```sh
adb push 8001865309000002.1_0_0.amr /data/local/tmp/
adb shell "miniapp_cli install /data/local/tmp/8001865309000002.1_0_0.amr"
adb shell "miniapp_cli start 8001865309000002"
```

> 该固件 `miniapp_cli start <appid>` 不带 `--page` 才进主页。

## 运行时约束 (与 wifi-login 相同基准机型)

- 屏幕 960×266 (direction 270), 设计宽度 960
- QuickJS 20200705; 无 requestAnimationFrame → 游戏循环用 setInterval(16) + 时间戳
- 固件无系统 storage JS 模块 → 存档用原生 `panet.writeFile/readFile` 写 `$dataDir`
- 触摸事件: falcon-vue-render 支持 touchstart/touchmove/touchend
