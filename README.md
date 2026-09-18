# 超级马里奥 (有道词典笔版)

面向有道词典笔 X7PRO 的横版卷轴平台跳跃游戏，
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
  src/services/game/levels.js # 关卡数据 (段式描述, 1-1~2-4 共8关)
  src/services/game/engine.js # Canvas 引擎 (物理/碰撞/敌人/渲染/离屏贴图缓存)
  src/services/game/sprites.js # 像素贴图精灵表 (GitHub参考项目移植)
  src/services/save.js       # 3 存档位持久化 (panet 文件)
  src/services/version.js    # 版本号
```

## 更新日志

### v1.2.2 (当前)
- 角色/砖块/管道/问号块全部用原版 SMB 像素贴图
- 离屏 canvas 缓存 + drawImage 快路径, 大幅提升性能
- 长按跳跃跳得更高 (按住时上升重力减半)
- 8 关按原版布局重做 (1-1~2-4): 管道/问号块/金字塔/旗杆/城堡
- 地下关深蓝青砖 / 城堡关黑灰砖主题
- 加乌龟敌人 (Koopa)
- 修复: 金币 cam 偏移 / 问号块产出道具 / 敌人悬空 / 踩怪判定放宽
- 调试模式: 关于页独立按钮进入, 可选关/无敌

### v1.2.0
- 触摸逻辑重构: 三段触摸区 (左移/右移/跳跃), 松开全复位
- 3 存档位 + 暂停菜单 (继续/保存/回标题/删档)
- 蘑菇变大 / 火花花变火焰 / 星星无敌
- 踩怪/顶砖/顶问号块完整玩法

### v1.1.0
- 初始版本: 1-1/1-2 循环, Goomba 敌人, 旗杆通关
