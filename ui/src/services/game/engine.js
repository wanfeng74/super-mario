/*
 * 超级马里奥游戏引擎 (Canvas 2D)。
 * 纯 ES5 风格 (var/function/原型), 兼容词典笔 QuickJS 20200705 运行时。
 * 960x266 画布, 1 瓦片 = 24px, 世界横向卷轴。
 *
 * 页面通过如下接口驱动:
 *   createGame(ctx, hooks) -> game
 *   game.start(state)          从关卡起点开始 (state: {level, score, coins, lives, time})
 *   game.setInput(dir, on)     dir: 'left' | 'right' | 'jump'
 *   game.tick(dtMs)            每帧推进 (页面用 setInterval 驱动)
 *   game.getState()            {level, score, coins, lives, time}
 *   game.hooks.onGameOver(state) / onClear(state)
 */

import { LEVELS, LEVEL_THEMES, WORLD_GROUND_Y, WORLD_BLOCKS } from './levels.js'
import {
  SPRITE_MAP as TEX_MAP,
  SMALL_STAND,
  SMALL_WALK,
  SMALL_JUMP,
  BIG_STAND,
  BIG_WALK,
  BIG_JUMP,
  FIRE_STAND,
  FIRE_WALK,
  FIRE_JUMP,
  DEAD,
  COIN,
  FLOWER,
  MUSHROOM,
  QBLOCK,
  HARD,
  BRICK,
  GROUND,
  PIPE_TOP_L,
  PIPE_TOP_R,
  PIPE_BODY_L,
  PIPE_BODY_R,
  CLOUD,
  CLOUD_S,
  HILL,
} from './sprites.js'

var TILE = 24
var VIEW_W = 960
var VIEW_H = 266

/* 物理 (基准 60fps) */
var GRAVITY = 0.55
var JUMP_V = -11.8
var JUMP_HOLD_MAX = 280 /* 长按跳跃最多保持低重力的毫秒数, 超过即下落 */
var MOVE_SPD = 2.9
var AIR_MOVE = 2.55
var MAX_FALL = 6.5 /* 原版 SMB 下落极限约 4px/帧(16px格), 本作 TILE=24 缩放 1.5x -> 6px; 原值 12.5 一帧位移超过敌人中点判定窗口, 导致高速下落隧穿踩不死 */
var ENEMY_SPD = 0.62
var SHELL_SPD = 2.6
var STOMP_V = -7.2
var BONK_V = 3.2
var DEAD_V = -10.5

/* 颜色 */
var C_SKY = '#6cb8f8'
var C_UNDER_BG = '#3a2a20'
var C_CASTLE_BG = '#141418'
var C_GROUND_TOP = '#4cae4f'
var C_GROUND_TOP_DARK = '#3c8f3f'
var C_GROUND_BODY = '#c9783c'
var C_GROUND_BODY_DARK = '#a85f2b'
var C_BRICK = '#c65d1e'
var C_BRICK_DARK = '#8f3f10'
var C_BRICK_LIGHT = '#e8a05a'
var C_QB = '#e89a18'
var C_QB_DARK = '#9c5a08'
var C_QB_LIGHT = '#ffd75e'
var C_HARD = '#8a8f9c'
var C_HARD_DARK = '#5d6270'
var C_HARD_LIGHT = '#c3c7d4'
var C_PIPE = '#2fae5c'
var C_PIPE_DARK = '#1b7a3c'
var C_PIPE_LIGHT = '#8fe3a8'
var C_COIN = '#ffd23e'
var C_COIN_DARK = '#c98a10'
var C_RED = '#e52521'
var C_SKIN = '#ffc0a0'
var C_BLUE = '#3169c7'
var C_SHOE = '#6b3f1d'
var C_WHITE = '#ffffff'
var C_BLACK = '#1c1c1c'
var C_BROWN = '#8b5a2b'
var C_CASTLE = '#c0392b'
var C_CASTLE_DARK = '#8e2a1f'
var C_ORANGE = '#ff7f27'
var C_LIME = '#7ec850'
var C_FIRE = '#f4f4f4'

/* 字符 -> 颜色: 贴图色板 (sprites.js) + 旧精灵保留色 */
var SPRITE_MAP = Object.assign(
  {},
  {
    R: C_RED,
    W: C_WHITE,
    S: C_SKIN,
    B: C_BLUE,
    K: C_SHOE,
    D: C_BLACK,
    M: C_BROWN,
    G: C_PIPE,
    Y: C_COIN,
    O: C_ORANGE,
    L: C_LIME,
    V: '#994e00',
    X: '#666666',
  },
  TEX_MAP
)

var ITEM_MUSHROOM = [
  '...RRRRRR...',
  '..RRRRRRRR..',
  '.RRWWWWRRRR.',
  '.RRWWWWRRRR.',
  '.RRRRRRRRRR.',
  '.RRRRRRRRRR.',
  '.SSSSSSSSSS.',
  '.SSSSSSSSSS.',
  '.MMSSSSSSMM.',
  '.MM..MM..MM.',
  '.MM..MM..MM.',
  '............',
]
var ITEM_MUSHROOM_1UP = [
  '...LLLLLL...',
  '..LLLLLLLL..',
  '.LLWWWWLLLL.',
  '.LLWWWWLLLL.',
  '.LLLLLLLLLL.',
  '.LLLLLLLLLL.',
  '.SSSSSSSSSS.',
  '.SSSSSSSSSS.',
  '.MMSSSSSSMM.',
  '.MM..MM..MM.',
  '.MM..MM..MM.',
  '............',
]
var ITEM_FLOWER = [
  '...OOOOOO...',
  '..OOORROO...',
  '.OORRRRROO..',
  '.OORR..RRO..',
  '.OORR..RRO..',
  '..OOO..OO...',
  '...OO..OO...',
  '...LL..LL...',
  '..LLLLLLLL..',
  '..LL....LL..',
  '.LL......LL.',
  '............',
]
var ITEM_STAR = [
  '....YYYY....',
  '...YYYYYY...',
  '..YYYYYYYY..',
  '..YYYYYYYY..',
  '...YYYYYY...',
  '..Y.YYYY.Y..',
  '.Y..YYYY..Y.',
  '.Y..YYYY..Y.',
  '.Y..YYYY..Y.',
  '..Y.YY.YY...',
  '...Y....Y...',
  '............',
]

/* ===== 原版 NES 敌人贴图 (Super Mario Wiki sprite 精确像素) ===== */
/* v3: 16列系已烘焙1.5倍整数网格(scale=1整数渲染, 消除条纹), 库巴32列保留@3整数 */
var ENEMY_PALETTE = {
  'n': '#994e00',
  'p': '#000000',
  'q': '#ffccc5',
  'r': '#ffffff',
  's': '#ea9e22',
  't': '#0d9300',
  'u': '#b53120',
  'v': '#007c8d',
  'w': '#aeeae9',
  'x': '#007b8c',
  'y': '#103239',
  'z': '#565656',
  'A': '#a6a6a6',
};
Object.assign(SPRITE_MAP, ENEMY_PALETTE)
/* 原版贴图缩放: 16列系已烘焙1.5倍整数网格 => scale=1 整数渲染(无条纹); 库巴32列@3 => 96px */
var ENEMY_SPR_SCALE = {
  koopa: 1, redkoopa: 1, paratroopa_g: 1, paratroopa_r: 1,
  spiny: 1, bulletbill: 1, podoboo: 1, buzzy: 1,
  blooper: 1, cheep: 1, hammer: 1, lakitu: 1, goomba: 1,
}
var SPR_GOOMBA = [
  '.........nnnnnn.........',
  '.........nnnnnn.........',
  '........nnnnnnnnn.......',
  '......nnnnnnnnnnnn......',
  '......nnnnnnnnnnnn......',
  '.....nnnnnnnnnnnnnnn....',
  '...nnpppnnnnnnnnnpppn...',
  '...nnpppnnnnnnnnnpppn...',
  '..nnnnqqpnnnnnnppqnnnnn.',
  '..nnnnqqpppppppppqnnnnn.',
  '..nnnnqqpppppppppqnnnnn.',
  'nnnnnnqqpqqnnnqppqnnnnnn',
  'nnnnnnqqqqqnnnqqqqnnnnnn',
  'nnnnnnqqqqqnnnqqqqnnnnnn',
  'nnnnnnnnnnnnnnnnnnnnnnnn',
  '..nnnnnnqqqqqqqqqnnnnnn.',
  '..nnnnnnqqqqqqqqqnnnnnn.',
  '......qqqqqqqqqqqq......',
  '...pppqqqqqqqqqqqq......',
  '...pppqqqqqqqqqqqq......',
  '..pppppppqqqqqqqqppp....',
  '..pppppppppqqqqppppp....',
  '..pppppppppqqqqppppp....',
  '...pppppppp...pppp......',
]
var SPR_GOOMBA_WALK = [
  '.........nnnnnn.........',
  '.........nnnnnn.........',
  '........nnnnnnnnn.......',
  '......nnnnnnnnnnnn......',
  '......nnnnnnnnnnnn......',
  '.....nnnnnnnnnnnnnnn....',
  '...nnpppnnnnnnnnnpppn...',
  '...nnpppnnnnnnnnnpppn...',
  '..nnnnqqpnnnnnnppqnnnnn.',
  '..nnnnqqpppppppppqnnnnn.',
  '..nnnnqqpppppppppqnnnnn.',
  'nnnnnnqqpqqnnnqppqnnnnnn',
  'nnnnnnqqqqqnnnqqqqnnnnnn',
  'nnnnnnqqqqqnnnqqqqnnnnnn',
  'nnnnnnnnnnnnnnnnnnnnnnnn',
  '..nnnnnnqqqqqqqqqnnnnnn.',
  '..nnnnnnqqqqqqqqqnnnnnn.',
  '......qqqqqqqqqqqq......',
  '......qqqqqqqqqqqqppp...',
  '......qqqqqqqqqqqqppp...',
  '.....pppqqqqqqqpppppppp.',
  '.....ppppqqqqqppppppppp.',
  '.....ppppqqqqqppppppppp.',
  '......ppppp...ppppppp...',
]
var SPR_KOOPA_G = [
  '.....r..................',
  '.....r..................',
  '...rrrrr................',
  '...rrrrrs...............',
  '...rrrrrs...............',
  '..sttrrrsss.............',
  '..sttrrrsss.............',
  '..sttrrrsss.............',
  '..sttrrrsss.............',
  '..srrrrrsss.............',
  '..srrrrrsss.............',
  'sssssrsssss.............',
  'sstssssssss.............',
  'sstssssssss.............',
  'sssssssss...tttttttt....',
  'sssss.sss..tssttttsst...',
  'sssss.sss..tssttttsst...',
  'sss...sss..tttsttsttttt.',
  'sss..sssrttttttsstrrrtt.',
  'sss..sssrttttttsstrrrtt.',
  '..s..sssrtttttsttsttrtt.',
  '.....sssrsstssttttsstss.',
  '.....sssrsstssttttsstss.',
  '...sssrrrttsttttttttstt.',
  '.....srrtsstssttttsstss.',
  '.....srrtsstssttttsstss.',
  '.....srrstttttsttsttttt.',
  '......rrtttttttsstttttt.',
  '......rrtttttttsstttttt.',
  '......rrrtttttsttsttrrrr',
  '.....sssrrrrsstttrrrr...',
  '.....sssrrrrsstttrrrr...',
  '...ssssssssrrrrrrrsssss.',
  '..sssssss.........ssssss',
]
var SPR_KOOPA_R = [
  '.....r..................',
  '.....r..................',
  '...rrrrr................',
  '...rrrrrs...............',
  '...rrrrrs...............',
  '..suurrrsss.............',
  '..suurrrsss.............',
  '..suurrrsss.............',
  '..suurrrsss.............',
  '..srrrrrsss.............',
  '..srrrrrsss.............',
  'sssssrsssss.............',
  'ssussssssss.............',
  'ssussssssss.............',
  'sssssssss...uuuuuuuu....',
  'sssss.sss..ussuuuussu...',
  'sssss.sss..ussuuuussu...',
  'sss...sss..uuusuusuuuuu.',
  'sss..sssruuuuuussurrruu.',
  'sss..sssruuuuuussurrruu.',
  '..s..sssruuuuusuusuuruu.',
  '.....sssrssussuuuussuss.',
  '.....sssrssussuuuussuss.',
  '...sssrrruusuuuuuuuusuu.',
  '.....srrussussuuuussuss.',
  '.....srrussussuuuussuss.',
  '.....srrsuuuuusuusuuuuu.',
  '......rruuuuuuussuuuuuu.',
  '......rruuuuuuussuuuuuu.',
  '......rrruuuuusuusuurrrr',
  '.....sssrrrrssuuurrrr...',
  '.....sssrrrrssuuurrrr...',
  '...ssssssssrrrrrrrsssss.',
  '..sssssss.........ssssss',
]
/* 龟壳 (缩壳状态): 原版 NES 壳 sprite 16x14 烘焙 1.5x -> 24x21, 底部贴地 */
var SPR_KOOPA_SHELL_G = [
  '.......sstttttts........',
  '......tttssssssttt......',
  '......tttssssssttt......',
  '....tttssttttttsttt.....',
  '....ttstttttttttsst.....',
  '....ttstttttttttsst.....',
  '...tssttttttttttstt.....',
  '...sttstttttttttsstss...',
  '...sttstttttttttsstss...',
  '.ssttttssttttttsttttts..',
  '.ttttttttssssssttttttt..',
  '.ttttttttssssssttttttt..',
  'rrrrtttssttttttstttrrrrr',
  'rrrrrrstttttttttssrrrrrr',
  'rrrrrrstttttttttssrrrrrr',
  '....rrrtttttttttrrr.....',
  '......rrrttttttrrr......',
  '......rrrttttttrrr......',
  '.......rrrrrrrrr........',
  '.........rrrrrr.........',
  '.........rrrrrr.........',
]
var SPR_KOOPA_SHELL_R = [
  '.......ssuuuuuus........',
  '......uuussssssuuu......',
  '......uuussssssuuu......',
  '....uuussuuuuuusuuu.....',
  '....uusuuuuuuuuussu.....',
  '....uusuuuuuuuuussu.....',
  '...ussuuuuuuuuuuusuu....',
  '...suusuuuuuuuuussuss...',
  '...suusuuuuuuuuussuss...',
  '.ssuuuussuuuuuusuuuuus..',
  '.uuuuuuuussssssuuuuuuu..',
  '.uuuuuuuussssssuuuuuuu..',
  'rrrruuussuuuuuusuuurrrrr',
  'rrrrrrsuuuuuuuuussrrrrrr',
  'rrrrrrsuuuuuuuuussrrrrrr',
  '....rrruuuuuuuuurrr.....',
  '......rrruuuuuurrr......',
  '......rrruuuuuurrr......',
  '.......rrrrrrrrr........',
  '.........rrrrrr.........',
  '.........rrrrrr.........',
]
var SPR_PARA_G = [
  '.....r..............rrr.',
  '.....r..............rrr.',
  '...rrrrr..........rrrrrr',
  '...rrrrrs........rrrrrrr',
  '...rrrrrs........rrrrrrr',
  '..sttrrrsss....rrrrrrrr.',
  '..sttrrrsss...rrrsrrr...',
  '..sttrrrsss...rrrsrrr...',
  '..sttrrrsss...rssrrrrrr.',
  '..srrrrrsss.rrrssrrrrrr.',
  '..srrrrrsss.rrrssrrrrrr.',
  'sssssrsssss.rrsrrrrrr...',
  'sstssssssss.rrsrrrrr.rr.',
  'sstssssssss.rrsrrrrr.rr.',
  'sssssssss...rrsrrrrrrrr.',
  'sssss.sss..tttrssrrrr...',
  'sssss.sss..tttrssrrrr...',
  'sss...sss..tttrrrrttttt.',
  'sss..sssrtttttsttsttttt.',
  'sss..sssrtttttsttsttttt.',
  '..s..sssrtttssttttsstss.',
  '.....sssrsstttttttttstt.',
  '.....sssrsstttttttttstt.',
  '...sssrrrttsttttttttstt.',
  '.....srrtsstssttttsstss.',
  '.....srrtsstssttttsstss.',
  '.....srrstttttsttsttttt.',
  '......rrtttttttsstttttt.',
  '......rrtttttttsstttttt.',
  '......rrrtttttsttsttrrrr',
  '.....sssrrrrsstttrrrr...',
  '.....sssrrrrsstttrrrr...',
  '...ssssssssrrrrrrrsssss.',
  '..sssssss.........ssssss',
]
var SPR_PARA_R = [
  '.....r..............rrr.',
  '.....r..............rrr.',
  '...rrrrr..........rrrrrr',
  '...rrrrrs........rrrrrrr',
  '...rrrrrs........rrrrrrr',
  '..suurrrsss....rrrrrrrr.',
  '..suurrrsss...rrrsrrr...',
  '..suurrrsss...rrrsrrr...',
  '..suurrrsss...rssrrrrrr.',
  '..srrrrrsss.rrrssrrrrrr.',
  '..srrrrrsss.rrrssrrrrrr.',
  'sssssrsssss.rrsrrrrrr...',
  'ssussssssss.rrsrrrrr.rr.',
  'ssussssssss.rrsrrrrr.rr.',
  'sssssssss...rrsrrrrrrrr.',
  'sssss.sss..uuurssrrrr...',
  'sssss.sss..uuurssrrrr...',
  'sss...sss..uuurrrruuuuu.',
  'sss..sssruuuuusuusuuuuu.',
  'sss..sssruuuuusuusuuuuu.',
  '..s..sssruuussuuuussuss.',
  '.....sssrssuuuuuuuuusuu.',
  '.....sssrssuuuuuuuuusuu.',
  '...sssrrruusuuuuuuuusuu.',
  '.....srrussussuuuussuss.',
  '.....srrussussuuuussuss.',
  '.....srrsuuuuusuusuuuuu.',
  '......rruuuuuuussuuuuuu.',
  '......rruuuuuuussuuuuuu.',
  '......rrruuuuusuusuurrrr',
  '.....sssrrrrssuuurrrr...',
  '.....sssrrrrssuuurrrr...',
  '...ssssssssrrrrrrrsssss.',
  '..sssssss.........ssssss',
]
var SPR_PIRANHA = [
  '...vv...............v...',
  '...vv...............v...',
  '..vnnqqq.........qqqnvv.',
  '..vvvq............qqvvv.',
  '..vvvq............qqvvv.',
  '..nvvvqqq......qqqvvvnn.',
  'vvvvvnqq.........qnnvvvv',
  'vvvvvnqq.........qnnvvvv',
  'nnvvvvvvqqq...qqqvvvvvvn',
  'vvvnnvvvq......qqvvvnvvv',
  'vvvnnvvvq......qqvvvnvvv',
  'vvvvvvvv.........vvvvvvv',
  'vvnvvvvvvqq...qvvvvvvnnv',
  'vvnvvvvvvqq...qvvvvvvnnv',
  'vvvvvvnnvqq...qvvnvvvvvv',
  '..nvvvvvvvv...vvvvvvvnn.',
  '..nvvvvvvvv...vvvvvvvnn.',
  '..vvvnvvvvv...vvvvnnvvv.',
  '...vvvvvvnn...nvvvvvv...',
  '...vvvvvvnn...nvvvvvv...',
  '.....vnnvvvvvvvvvnvv....',
  '........vnnvvvnvv.......',
  '........vnnvvvnvv.......',
  'nnn........nnn.......nnn',
  'nnvnnn.....nnn....nnnvvn',
  'nnvnnn.....nnn....nnnvvn',
  '..nvvnnn...nnn...nnnvnn.',
  '..nnnvnnn..nnn.nnnvvnnn.',
  '..nnnvnnn..nnn.nnnvvnnn.',
  '...nnnvvn..nnn.nnvnnn...',
  '...nnnnnvnnnnnnvvnnnn...',
  '...nnnnnvnnnnnnvvnnnn...',
  '.....nnnnnnnnnnnnnnn....',
  '.........nnnnnn.........',
]
var SPR_BLOOPER = [
  '.........wwxxxw.........',
  '.........wwxxxw.........',
  '........wxxwwwxww.......',
  '......wwxwwwwwwxxw......',
  '......wwxwwwwwwxxw......',
  '.....wwwxwwwwwwxxwww....',
  '...wwwxxwwwwwwwwwxwww...',
  '...wwwxxwwwwwwwwwxwww...',
  '..wwwwxxwwwwwwwwwxwwwww.',
  'wwwwwxwwwwwwwwwwwwxxwwww',
  'wwwwwxwwwwwwwwwwwwxxwwww',
  '.....xwwwwwwwwwwwwxx....',
  '.....wwwwwwwwwwwwwww....',
  '.....wwwwwwwwwwwwwww....',
  '.....wyyyyyyyyyyyyww....',
  '.....ywwwyyyyyywwwyy....',
  '.....ywwwyyyyyywwwyy....',
  '.....wyyywwyyywyyyww....',
  '.....wyyywwyyywyyyww....',
  '.....wyyywwyyywyyyww....',
  '...wwywwwyyyyyywwwyyw...',
  '...wwwxxxwwwwwwxxxwww...',
  '...wwwxxxwwwwwwxxxwww...',
  '...xxwwwwwwwwwwwwwwwx...',
  '...www..wwwwwwwww.www...',
  '...www..wwwwwwwww.www...',
  '...xxw..xww...wxx.wwx...',
  '...www..www...www.www...',
  '...www..www...www.www...',
  '...xxw..xww...wxx.wwx...',
  '.....w..www...www.ww....',
  '.....w..www...www.ww....',
  '.....w..xww...wxx.ww....',
  '.....w...ww...w...ww....',
  '.....w...ww...w...ww....',
  '.........ww...w.........',
]
var SPR_CHEEP = [
  '.....ssssss.............',
  '.....ssssss.............',
  '......ssssssss.rrr......',
  '.....uuuuuuuuurrrrrr....',
  '.....uuuuuuuuurrrrrr....',
  '..ruurrruuuuuurrrrrr....',
  'rrrrrrrrruuuuurrrrrr....',
  'rrrrrrrrruuuuurrrrrr....',
  'rrurrurrruuurrrrrrrr....',
  'rrurrurrruuurrrrrr......',
  'rrurrurrruuurrrrrr......',
  'rrrrrrrrruuurrrrru......',
  '..ruurrruuuuuuuuuu......',
  '..ruurrruuuuuuuuuu......',
  'sssssuuuuuuuuuuuuuuu....',
  '..usssuuuuuuuuuuuuuu...s',
  '..usssuuuuuuuuuuuuuu...s',
  '...uusssuuuuuuuuuuuussss',
  '...uusssrrruuuuuuuuussss',
  '...uusssrrruuuuuuuuussss',
  '..ssssssrrrruuuuuusssss.',
  '...rrrrrrrrrrrruu.sssss.',
  '...rrrrrrrrrrrruu.sssss.',
  '......rrrrrrrr......s...',
]
var SPR_FIREBAR_HUB = [
  '.XXXXXXXXXXRRRR.',
  'XVVVVVVVVVRROORR',
  'XVXVVVVVVRROWOOR',
  'XVVVVVVVVROWOORR',
  'XVVVVVVVVROORRRX',
  'XVVVVVRRRRRORVVX',
  'XVVVVRROORRRRVRX',
  'XVVVRROWOORRRRVR',
  'XVVVROWOORRVVVVX',
  'XVVVROORRRVVVVVX',
  'XVVVRRORVVVRVVVX',
  'XVVVVRRRVRVVVVVX',
  'XVVVVVRRRVRVVVVX',
  'XVXVVVVVVVVVVXVX',
  'XVVVVVVVVVVVVVVX',
  '.XXXXXXXXXXXXXX.',
]
var SPR_HAMMER = [
  '...tttttt...............',
  '...tttttt...............',
  '..trrttttttt............',
  'ttrrrrtttrrt............',
  'ttrrrrtttrrt............',
  '..trrrtttttrtt..........',
  '..trrrtttttttt..........',
  '..trrrtttttttt..........',
  'sssrrsssrssttt..........',
  'ssssssssrsssrrttt.......',
  'ssssssssrsssrrttt.......',
  'ssssssssrssrrrtttttt....',
  '.....srrsttrttttttttt...',
  '.....srrsttrttttttttt...',
  '..ssssrr.ttrrrrtttttrtt.',
  '........tttsssrrrtsstrr.',
  '........tttsssrrrtsstrr.',
  '........tssssssrrstttrr.',
  '........sssssssrrtsstrrt',
  '........sssssssrrtsstrrt',
  '......ssssssssrrrtttsttt',
  '.....sssssssrrrttttttsss',
  '.....sssssssrrrttttttsss',
  '...sssssssstrrttttttsttt',
  '.........tttrrstttsstttt',
  '.........tttrrstttsstttt',
  '......ssstttrrrssstttttt',
  '......ssssstttrrrrrrttt.',
  '......ssssstttrrrrrrttt.',
  '......ssssstttttttrrrrrr',
  '......sssssstttsssssssss',
  '......sssssstttsssssssss',
  '........ssss..tttsssssss',
  '.........sss......ssssss',
  '.........sss......ssssss',
  '....................ssss',
]
var SPR_LAKITU = [
  '........sssssss.........',
  '........sssssss.........',
  '......sssssssssss.......',
  '.....ttttssttttsss......',
  '.....ttttssttttsss......',
  '...ttrrrrttrrrrtts......',
  '...ttrrrrrrrrrrttstt....',
  '...ttrrrrrrrrrrttstt....',
  '...ttrrrtrrtrrrttsttt...',
  '...ttrrrtrrtrrrttsttt...',
  '...ttrrrtrrtrrrttsttt...',
  '.....ttttsstttttttttt...',
  '.....ssssttttttsssssttt.',
  '.....ssssttttttsssssttt.',
  '...sssssssstttssssssstt.',
  '..tssssssssrrrssssssstt.',
  '..tssssssssrrrssssssstt.',
  '..trrssssrrrrrrsssssrtt.',
  '..trrrrrrrrrrrrrrrrrrtt.',
  '..trrrrrrrrrrrrrrrrrrtt.',
  'ttrrrrrrrrrrrrrrrrrrrrrt',
  'ttrrrrrrrttrrrtrrrrrrrrt',
  'ttrrrrrrrttrrrtrrrrrrrrt',
  'ttrrrrrrrttrrrtrrrrrrrrt',
  'ttrrrrrrrttrrrtrrrrrrrrt',
  'ttrrrrrrrttrrrtrrrrrrrrt',
  'ttrrrrrrrrrrrrrrrrrrrrrt',
  'ttrttrrrrrrrrrrrrrrrtrrt',
  'ttrttrrrrrrrrrrrrrrrtrrt',
  '..trrrrrtrrrrrrttrrrrtt.',
  '..trrrrrrttttttrrrrrrtt.',
  '..trrrrrrttttttrrrrrrtt.',
  '..trrrrrrrrrrrrrrrrrrtt.',
  '...ttrrrrrrtttrrrrrrt...',
  '...ttrrrrrrtttrrrrrrt...',
  '.....tttttt...tttttt....',
]
var SPR_SPINY = [
  '............rr..........',
  '............rr..........',
  '............rr..........',
  '...........rsss.........',
  '...........rsss.........',
  '...rr......rsss......rr.',
  '...rrs...rrssssss...rss.',
  '...rrs...rrssssss...rss.',
  '...rrsss.rrssssss.rrsss.',
  '...rrssssuussssuursssss.',
  '...rrssssuussssuursssss.',
  '...rrrsssuuuuuuuursssss.',
  '..uuusssuuurrrsuuusssuu.',
  '..uuusssuuurrrsuuusssuu.',
  'rrrrruuuurrrsssssuuuuuu.',
  '..uuuruuussssssssuuuuuuu',
  '..uuuruuussssssssuuuuuuu',
  'uuruuurruuussssuuuuurrrr',
  'uuuuuussruuuuuuuurrrr...',
  'uuuuuussruuuuuuuurrrr...',
  '.....ssssrrrrrrrrrsssss.',
  '...ssssss.........ssssss',
]
var SPR_BULLET = [
  '.........zzzzzzzzzzz.zzz',
  '.........zzzzzzzzzzz.zzz',
  '......zzzzzrrrrrrrzz.rrr',
  '.....zzzzrrzzzzzzzzzAzzz',
  '.....zzzzrrzzzzzzzzzAzzz',
  '...zzrzzzzzzzzzzzzzzrzzz',
  '..zrrrzzzzzzzzzzzzzzAzzz',
  '..zrrrzzzzzzzzzzzzzzAzzz',
  'zzrzzrzzzzzzzzAAAzzzAzzz',
  'zzzrrzzzzzzrzzrrrAzzAzzz',
  'zzzrrzzzzzzrzzrrrAzzAzzz',
  'zzzzzzzzrrrrrrrrrAzzAzzz',
  'zzzzzzzzrrrrrrrzzzzzAzzz',
  'zzzzzzzzrrrrrrrzzzzzAzzz',
  '..zzzzzzzrrrrrzzzzzzAzzz',
  '...zzzzzzzzzzzzzzzzzAzzz',
  '...zzzzzzzzzzzzzzzzzAzzz',
  '.....zzzzzzzzzzzzzzzAzzz',
  '......zzzzzzzzzzzzzz.zzz',
  '......zzzzzzzzzzzzzz.zzz',
  '.........zzzzzzzzzzz.zzz',
]
var SPR_PODOBOO = [
  '......uuuuuuuuu......',
  '......uuuuuuuuu......',
  '.....uuuuuuuuuuuu....',
  '...uuuuussssssuuuu...',
  '...uuuuussssssuuuu...',
  '..uuuusssssssssuuuuu.',
  '..uuussssrrrsssssuuu.',
  '..uuussssrrrsssssuuu.',
  'uuuuusssrrrrrrsssuuuu',
  'uuusssrrrrrrrrrsssuuu',
  'uuusssrrrrrrrrrsssuuu',
  'uuusssrrrrrrrrrsssuuu',
  'uuusssrrrrrrrrrsssuuu',
  'uuusssrrrrrrrrrsssuuu',
  'uuusssssrrrrrrssssuuu',
  'uuussssssrrrssssssuuu',
  'uuussssssrrrssssssuuu',
  'uuuuusuussssssussuuuu',
  '..uuuuuuusssuuuuuuuu.',
  '..uuuuuuusssuuuuuuuu.',
  '..uuuuuuusssuuuuuuuu.',
  '...uuu..uuuuuu.uuu...',
  '...uuu..uuuuuu.uuu...',
  '.....u...uuu...uu....',
]
var SPR_BUZZY = [
  '.........pppppp.........',
  '.........pppppp.........',
  '......pppppppppppp......',
  '.....ppppppppppppppp....',
  '.....ppppppppppppppp....',
  '...pppppppppppnnnpppp...',
  '..ppppppppppppnqqnppp...',
  '..ppppppppppppnqqnppp...',
  '..pppppppppppppnnnppp...',
  'nnnnnnppppppppppppppppp.',
  'nnnnnnppppppppppppppppp.',
  '..pppnnnppppppppppppppp.',
  '..ppppnnppppppppppppppp.',
  '..ppppnnppppppppppppppp.',
  'pppqqpnnppppppppppppppp.',
  'ppppppnnppppppppppppppp.',
  'ppppppnnppppppppppppppp.',
  'ppppppnnppppppppppppppp.',
  '..pppqnnnppppppppnnnnnnn',
  '..pppqnnnppppppppnnnnnnn',
  '...qqqqqnnnpppnnnnqqqqq.',
  '..qqqqqq.nnnnnn...qqqqqq',
]
var SPR_BOWSER = [
  '............rrr.................',
  '........ttrrrs..................',
  '.......tttrrss..................',
  '.....rrttttsst..................',
  '.s..trrttttttt..................',
  's.sttrrtttttttt.................',
  'sssrrrtttsttttt.................',
  'ssssrtttssstttt.................',
  'rsssttssrtsttttrrtttr...........',
  '.r.sssstttsttttrrttrrst.........',
  '.r.rrtrttrsttttrrtrrrsstrrr.....',
  '....r...tsstttrrrttrssttrrs.....',
  '........rssttrrrtttttttttsstr...',
  '........ssttrrrtttttttttttttr...',
  '......rsssttrrrttttttrrrttttt...',
  '.......ss..ttrrrrrrttrrstttrrr..',
  '.............ttsssrrttsstttrrs..',
  '.........sss..r.sssrrtttttttss..',
  '........ssr.sss.rsstrtttttttttr.',
  '........ss..ssss..ttrtttrrrtttsr',
  '........sr.ssssssrttrrttrrsttt..',
  '........s..sssssttttrrtttssttrr.',
  '.........r.sssssttttrrtttttttrrr',
  '...........rsss.tttttrttttrrtss.',
  '................tttttrrtttsttst.',
  '.................tttttrrrtttttt.',
  '..................tttttrrrrtttt.',
  '..................sttttttrrrrrrr',
  '.................rrssttssssrrrrr',
  '................rrrssssssssssrr.',
  '....................rrssrrssss..',
  '...................rrrsrrrsssss.',
]

/* 原版地面砖 (SMB Ground.png 16x16, 烘焙1.5倍 => 24x24, scale=1) */
var GOOMBA = [
  '....MMMM....',
  '...MMMMMM...',
  '..MMMMMMMM..',
  '.MMMMMMMMMM.',
  '.MMMMMMMMMM.',
  '.MWMMMMMWM..',
  '.MWMMMMMWM..',
  '.MMWMMMMWMM.',
  '..MMMMMMMM..',
  '...MMMMMM...',
  '..KKK..KKK..',
  '..KKK..KKK..',
]
var GOOMBA_WALK = [
  '....MMMM....',
  '...MMMMMM...',
  '..MMMMMMMM..',
  '.MMMMMMMMMM.',
  '.MMMMMMMMMM.',
  '.MWMMMMMWM..',
  '.MWMMMMMWM..',
  '.MMWMMMMWMM.',
  '..MMMMMMMM..',
  '...MMMMMM...',
  '...KK..KK...',
  '...KK..KK...',
]

/* ---------- 工具 ---------- */

/* 精灵 run-length 缓存: 每行折叠成 [start,len,char] 段, 一次 fillRect 画一段 */
var _spriteRuns = new WeakMap()

/* 垂直合并: 把行 RLE 进一步合并为矩形块 (相邻行同色同宽段合成一个 fillRect), 
   减少降级直绘路径的 fillRect 调用次数 (词典笔无离屏 canvas 时收益明显) */
var _spriteBlocks = new WeakMap()
function spriteRectBlocks(sprite) {
  var blocks = _spriteBlocks.get(sprite)
  if (blocks) return blocks
  var h = sprite.length
  var w = sprite[0].length
  var active = []
  blocks = []
  for (var r = 0; r < h; r++) {
    var row = sprite[r]
    var segs = []
    var prev = null
    var start = 0
    for (var c = 0; c < row.length; c++) {
      var ch = row.charAt(c)
      if (ch !== prev) {
        if (prev !== null) segs.push([start, c - start, prev])
        prev = ch
        start = c
      }
    }
    if (prev !== null) segs.push([start, row.length - start, prev])
    for (var s = 0; s < segs.length; s++) {
      var seg = segs[s]
      var key = seg[0] + '|' + seg[1] + '|' + seg[2]
      var found = false
      for (var a = 0; a < active.length; a++) {
        if (active[a].key === key) {
          active[a].h++
          found = true
          break
        }
      }
      if (!found) active.push({ key: key, x: seg[0], w: seg[1], ch: seg[2], y: r, h: 1 })
    }
    for (var a2 = active.length - 1; a2 >= 0; a2--) {
      var act = active[a2]
      var alive2 = false
      for (var s2 = 0; s2 < segs.length; s2++) {
        if (segs[s2][0] + '|' + segs[s2][1] + '|' + segs[s2][2] === act.key) { alive2 = true; break }
      }
      if (!alive2) {
        blocks.push([act.x, act.y, act.w, act.h, act.ch])
        active.splice(a2, 1)
      }
    }
  }
  for (var a3 = 0; a3 < active.length; a3++) {
    var act3 = active[a3]
    blocks.push([act3.x, act3.y, act3.w, act3.h, act3.ch])
  }
  _spriteBlocks.set(sprite, blocks)
  return blocks
}

function spriteRunRows(sprite) {
  var rows = _spriteRuns.get(sprite)
  if (rows) return rows
  rows = []
  for (var r = 0; r < sprite.length; r++) {
    var row = sprite[r]
    var rr = []
    var prev = null
    var start = 0
    for (var c = 0; c < row.length; c++) {
      var ch = row.charAt(c)
      if (ch !== prev) {
        if (prev !== null) rr.push([start, c - start, prev])
        prev = ch
        start = c
      }
    }
    if (prev !== null) rr.push([start, row.length - start, prev])
    rows.push(rr)
  }
  _spriteRuns.set(sprite, rows)
  return rows
}

/* 精灵离屏 canvas 缓存: 缓存直接挂贴图数组对象属性上(见 spriteToCanvas) */
var _canCreateCanvas = null

function ensureCanvas(w, h) {
  /* falcon 环境: 优先用 document.createElement; 降级用当前 ctx 的 canvas 构造 */
  if (_canCreateCanvas === false) return null
  try {
    if (typeof document !== 'undefined' && document.createElement) {
      var c = document.createElement('canvas')
      c.width = w; c.height = h
      return c
    }
  } catch (e) {}
  /* 只有环境完全没有 canvas 能力才禁用全局; 单次尺寸/内存失败(如大离屏 canvas)不毒化后续小 canvas */
  if (typeof document === 'undefined' || !document.createElement) {
    _canCreateCanvas = false
  }
  return null
}

function spriteToCanvas(sprite, scale, flip, cm) {
  /* 缓存挂到贴图数组对象上 (数组是对象): 避免每帧大字符串拼接 + scale 隔离 */
  if (!sprite.__canvasCache) sprite.__canvasCache = {}
  var k = (flip ? 'f' : 'n') + scale
  if (cm) {
    /* 换色 key: 颜色映射序列, 同主题复用同一份 canvas (地下/城堡地面/砖块也走快路径) */
    var cmKey = ''
    for (var ck in cm) cmKey += ck + '=' + cm[ck] + ';'
    k += '|' + cmKey
  }
  var canvas = sprite.__canvasCache[k]
  if (canvas) return canvas
  var w = sprite[0].length * scale
  var h = sprite.length * scale
  canvas = ensureCanvas(w, h)
  if (!canvas) return null
  var cctx = canvas.getContext('2d')
  /* 画到离屏: 直接走 RLE 路径 */
  var runs = spriteRunRows(sprite)
  for (var r = 0; r < h / scale; r++) {
    var rr = runs[r]
    for (var kk = 0; kk < rr.length; kk++) {
      var ch = rr[kk][2]
      if (ch === '.' || ch === ' ') continue
      var color = SPRITE_MAP[ch]
      if (!color) continue
      if (cm) {
        var rep = cm[color]
        if (rep) color = rep
      }
      var s0 = flip ? w - rr[kk][0] * scale - rr[kk][1] * scale : rr[kk][0] * scale
      cctx.fillStyle = color
      cctx.fillRect(s0, r * scale, rr[kk][1] * scale, scale)
    }
  }
  sprite.__canvasCache[k] = canvas
  return canvas
}

/* 贴图画质: 2.0 原画质 */
var SPR_SCALE = 2.0

function drawSprite(ctx, sprite, scale, px, py, flip, colorMap) {
  /* scale=undefined 时用 SPR_SCALE 并自动居中到 24x24 瓦片;
     scale=数字 时按原坐标画 (山/云/标题屏等自由位置贴图) */
  var autoCenter = (scale === undefined || scale === null)
  if (typeof scale === 'boolean') { colorMap = flip; flip = scale; scale = SPR_SCALE; autoCenter = true }
  if (autoCenter) scale = SPR_SCALE
  var h = sprite.length
  var w = sprite[0].length
  var px0, py0
  if (autoCenter) {
    px0 = Math.round(px + (TILE - w * scale) / 2)
    py0 = Math.round(py + (TILE - h * scale) / 2)
  } else {
    px0 = Math.round(px)
    py0 = Math.round(py)
  }
  /* colorMap 着色模式: object(主题换色, 如地下/城堡) 走缓存快路径; function(受伤/无敌闪) 逐帧 fillRect */
  if (colorMap) {
    if (typeof colorMap !== 'function') {
      var cma = spriteToCanvas(sprite, scale, flip, colorMap)
      if (cma) {
        ctx.drawImage(cma, px0, py0)
        return
      }
    }
    var blocks = spriteRectBlocks(sprite)
    for (var b = 0; b < blocks.length; b++) {
      var bl = blocks[b]
      var ch = bl[4]
      if (ch === '.' || ch === ' ') continue
      var color = SPRITE_MAP[ch]
      if (!color) continue
      var rep = typeof colorMap === 'function' ? colorMap(color, ch) : colorMap[color]
      if (rep) color = rep
      var s0 = flip ? w - bl[0] - bl[2] : bl[0]
      ctx.fillStyle = color
      ctx.fillRect(px0 + s0 * scale, py0 + bl[1] * scale, bl[2] * scale, bl[3] * scale)
    }
    return
  }
  /* 快路径: drawImage 缓存 */
  var cached = spriteToCanvas(sprite, scale, flip)
  if (cached) {
    ctx.drawImage(cached, px0, py0)
    return true
  }
  /* 降级: 直接 fillRect (垂直合并块) */
  var blocks = spriteRectBlocks(sprite)
  for (var b = 0; b < blocks.length; b++) {
    var bl = blocks[b]
    var ch = bl[4]
    if (ch === '.' || ch === ' ') continue
    var color = SPRITE_MAP[ch]
    if (!color) continue
    var s0 = flip ? w - bl[0] - bl[2] : bl[0]
    ctx.fillStyle = color
    ctx.fillRect(px0 + s0 * scale, py0 + bl[1] * scale, bl[2] * scale, bl[3] * scale)
  }
}

function rectsHit(ax, ay, aw, ah, bx, by, bw, bh) {
  return ax < bx + bw && ax + aw > bx && ay < by + bh && ay + ah > by
}

/* ---------- 引擎 ---------- */

function Game(ctx, hooks) {
  this.ctx = ctx
  this.hooks = hooks || {}
  this.input = { left: false, right: false, jump: false, prevJump: false }
  /* 地面渲染模式: false=纯色填充(默认,性能最优) / true=原版贴图平铺. 由调试界面运行时切换 */
  this.groundTile = !!(hooks && hooks.groundTile)
  this.state = 'idle' // idle | playing | dead | clear | gameover
  this.reset()
}

/* 调试/运行时切换地面渲染模式: 纯色填充 <-> 原版贴图平铺. 切换后强制静态层缓存重建 */
Game.prototype.setGroundTileMode = function (on) {
  this.groundTile = !!on
  this._tileCacheX = NaN
}

Game.prototype.reset = function () {
  this.score = 0
  this.coins = 0
  this.lives = 3
  this.level = 1
  this.time = 300
  this.camX = 0
  this.animT = 0
  this.stateTimer = 0
  this.tiles = []
  this.pipes = []
  this.enemies = []
  this.coinItems = []
  this.particles = []
  this.powerups = []
  this.fireballs = []
  this.axe = null
  this.boss = null
  this.player = null
  this.flagX = 0
  this.castleX = 0
  this.worldW = WORLD_BLOCKS * TILE
  this.worldH = (WORLD_GROUND_Y + 2) * TILE
  this.speedBonus = 0
  this.invuln = 0
  this.playerBottomPrev = 0
  this._bumpTiles = []
}

/* 从关卡数据构建世界 */
Game.prototype.loadLevel = function (levelIdx) {
  var segs = LEVELS[(levelIdx - 1) % LEVELS.length]
  this.theme = LEVEL_THEMES[levelIdx] || 'overworld'
  this.tiles = []
  this.pipes = []
  this.enemies = []
  this.coinItems = []
  this.particles = []
  this.lavaList = []
  this.flagX = 0
  this.castleX = 0
  this.lavaFireT = 0
  this._bumpTiles = []

  for (var i = 0; i < segs.length; i++) {
    var s = segs[i]
    if (s.t === 'g') {
      var gh = s.h || 2
      var gy = (WORLD_GROUND_Y + 2 - gh) * TILE
      this.tiles.push({ type: 'ground', x: s.x * TILE, y: gy, w: s.w * TILE, h: gh * TILE })
    } else if (s.t === 'l') {
      /* 岩浆 (碰到就死, 和地面顶对齐) */
      var lh = s.h || 1
      var ly = (WORLD_GROUND_Y + 1 - lh) * TILE
      this.tiles.push({ type: 'lava', x: s.x * TILE, y: ly, w: s.w * TILE, h: lh * TILE })
      /* 记录岩浆位置用于喷火球/岩浆死亡判定 (含完整 rect, 供 checkLavaHit 复用避免全量扫 tiles) */
      this.lavaList.push({ x: s.x * TILE, y: ly, w: s.w * TILE, h: lh * TILE })
    } else if (s.t === 'b') {
      this.tiles.push({ type: 'brick', x: s.x * TILE, y: s.y * TILE, w: TILE, h: TILE })
    } else if (s.t === 'q') {
      this.tiles.push({ type: 'qblock', x: s.x * TILE, y: s.y * TILE, w: TILE, h: TILE, used: false, content: s.content || 'coin' })
    } else if (s.t === 'h') {
      this.tiles.push({ type: 'hard', x: s.x * TILE, y: s.y * TILE, w: TILE, h: TILE })
    } else if (s.t === 'p') {
      var ph = (s.h || 2) * TILE
      /* 管道底坐在地面顶(240)上, 向上凸出 h 格. 旧公式多加了 2 格导致 h=2 管道与地面平齐不凸出 */
      var py = WORLD_GROUND_Y * TILE - ph
      this.pipes.push({ x: s.x * TILE, y: py, w: 2 * TILE, h: ph })
      this.tiles.push({ type: 'pipe', x: s.x * TILE, y: py, w: 2 * TILE, h: ph })
    } else if (s.t === 'c') {
      this.coinItems.push({ x: s.x * TILE, y: s.y * TILE, w: TILE, h: TILE, active: true, t: Math.random() * 6.28 })
    } else if (s.t === 'm') {
      var my = s.y != null ? s.y * TILE : (WORLD_GROUND_Y - 1) * TILE
      this.enemies.push({
        x: s.x * TILE,
        y: my,
        w: TILE,
        h: TILE,
        vx: -ENEMY_SPD,
        alive: true,
        squashed: false,
        squashT: 0,
        walk: 0,
        kind: 'goomba',
      })
    } else if (s.t === 't') {
      /* 乌龟 (Koopa) h=36, 脚底贴地 */
      var ty = s.y != null ? s.y * TILE : (WORLD_GROUND_Y - 1.5) * TILE
      this.enemies.push({
        x: s.x * TILE,
        y: ty,
        w: TILE,
        h: TILE * 1.5,
        vx: -ENEMY_SPD * 0.8,
        alive: true,
        squashed: false,
        squashT: 0,
        walk: 0,
        shell: 0,
        shellT: 0,
        kind: 'koopa',
      })
    } else if (s.t === 'rt') {
      /* 红龟 (不会走下平台边缘) */
      var rty = s.y != null ? s.y * TILE : (WORLD_GROUND_Y - 1.5) * TILE
      this.enemies.push({
        x: s.x * TILE, y: rty, w: TILE, h: TILE * 1.5,
        vx: -ENEMY_SPD * 0.8, alive: true, squashed: false, squashT: 0, walk: 0,
        shell: 0, shellT: 0,
        kind: 'redkoopa',
      })
    } else if (s.t === 'pg') {
      /* 绿飞龟 (上下飞) */
      this.enemies.push({
        x: s.x * TILE, y: (s.y || 6) * TILE, w: TILE, h: TILE,
        vx: -ENEMY_SPD, alive: true, squashed: false, squashT: 0, walk: 0,
        kind: 'paratroopa_g', baseY: (s.y || 6) * TILE, flyT: Math.random() * 6,
      })
    } else if (s.t === 'prg') {
      /* 红飞龟 (直线跳跃) */
      this.enemies.push({
        x: s.x * TILE, y: (s.y || 5) * TILE, w: TILE, h: TILE,
        vx: -ENEMY_SPD * 1.2, alive: true, squashed: false, squashT: 0, walk: 0,
        kind: 'paratroopa_r', baseY: (s.y || 5) * TILE, flyT: Math.random() * 6,
      })
    } else if (s.t === 'bz') {
      /* 硬壳虫 (黑甲虫, 怕踩不怕火): 同龟壳机制, 踩后缩壳可踢, 火球免疫 */
      this.enemies.push({
        x: s.x * TILE, y: (WORLD_GROUND_Y - 1) * TILE, w: TILE, h: TILE,
        vx: -ENEMY_SPD, alive: true, squashed: false, squashT: 0, walk: 0,
        shell: 0, shellT: 0,
        kind: 'buzzy',
      })
    } else if (s.t === 'bl') {
      /* 墨鱼 (Z字追踪) */
      this.enemies.push({
        x: s.x * TILE, y: (s.y || 5) * TILE, w: TILE, h: TILE,
        vx: 0, alive: true, squashed: false, squashT: 0, walk: 0,
        kind: 'blooper', t: 0,
      })
    } else if (s.t === 'ch') {
      /* 跳跳鱼 (从下方跳出) */
      this.enemies.push({
        x: s.x * TILE, y: (WORLD_GROUND_Y + 1) * TILE, w: TILE, h: TILE,
        vx: (s.vx || 1.5), alive: true, squashed: false, squashT: 0, walk: 0,
        kind: 'cheep', vy: -10, jumpV: 10, t: Math.random() * 1000, wait: 0,
      })
    } else if (s.t === 'hb') {
      /* 锤子龟 (跳跃+扔锤子) */
      this.enemies.push({
        x: s.x * TILE, y: (s.y || 7) * TILE, w: TILE, h: TILE,
        vx: -ENEMY_SPD * 0.6, alive: true, squashed: false, squashT: 0, walk: 0,
        kind: 'hammer', t: Math.random() * 1000, jumpT: 0, throwT: 0,
      })
    } else if (s.t === 'lk') {
      /* 云龟 (飘在云上扔刺龟蛋) */
      this.enemies.push({
        x: s.x * TILE, y: (s.y || 4) * TILE, w: TILE, h: TILE,
        vx: 0, alive: true, squashed: false, squashT: 0, walk: 0,
        kind: 'lakitu', t: 0, throwT: 0,
      })
    } else if (s.t === 'fb') {
      /* 火焰棒 (旋转火球串) */
      this.enemies.push({
        x: s.x * TILE, y: (s.y || 8) * TILE, w: TILE, h: TILE,
        vx: 0, alive: true, squashed: false, squashT: 0, walk: 0,
        kind: 'firebar', angle: 0, len: s.len || 3, speed: s.speed || 0.04,
      })
    } else if (s.t === 'sp') {
      /* 刺龟 (不能踩) */
      this.enemies.push({
        x: s.x * TILE, y: (WORLD_GROUND_Y - 1) * TILE, w: TILE, h: TILE,
        vx: -ENEMY_SPD, alive: true, squashed: false, squashT: 0, walk: 0,
        kind: 'spiny',
      })
    } else if (s.t === 'bb') {
      /* 子弹比尔 (水平飞) */
      this.enemies.push({
        x: s.x * TILE, y: (s.y || 7) * TILE, w: TILE, h: TILE,
        vx: -(s.vx || 3), alive: true, squashed: false, squashT: 0, walk: 0,
        kind: 'bulletbill',
      })
    } else if (s.t === 'pb') {
      /* 帕拉火球 (从岩浆跳起) */
      this.enemies.push({
        x: s.x * TILE, y: (WORLD_GROUND_Y - 2) * TILE, w: TILE, h: TILE,
        vx: 0, alive: true, squashed: false, squashT: 0, walk: 0,
        kind: 'podoboo', baseY: WORLD_GROUND_Y * TILE - TILE, vy: -8, jumpV: 8,
        t: Math.random() * 1000, wait: 1500,
      })
    } else if (s.t === 'pr') {
      /* 食人花 (从管道顶部弹出) */
      var pipeH = s.h || 2
      var pipePh = pipeH * TILE
      var pipeTopY = WORLD_GROUND_Y * TILE - pipePh
      /* 管道宽 2 格, 中心在 x+1, 食人花居中 */
      var piranhaW = TILE * 0.8
      this.enemies.push({
        x: s.x * TILE + TILE - piranhaW / 2,
        y: pipeTopY,
        w: piranhaW,
        h: TILE * 1.2,
        vx: 0, alive: true, squashed: false, squashT: 0, walk: 0,
        kind: 'piranha', baseY: pipeTopY,
        t: Math.random() * 3000,
      })
    } else if (s.t === 'boss') {
      /* 库巴 BOSS (4x4 瓦片) */
      this.boss = {
        x: s.x * TILE,
        y: s.y * TILE,
        w: 4 * TILE,
        h: 4 * TILE,
        vx: -ENEMY_SPD * 1.5,
        alive: true,
        walk: 0,
        fireT: 0,
      }
    } else if (s.t === 'x') {
      /* 斧头 (断桥通关) */
      this.axe = { x: s.x * TILE, y: s.y * TILE, w: TILE, h: TILE, taken: false, t: 0 }
    } else if (s.t === 'f') {
      this.flagX = s.x * TILE
    } else if (s.t === 'k') {
      this.castleX = s.x * TILE
    } else if (s.t === 's') {
      var sx = s.x * TILE
      var sy = s.y != null ? s.y * TILE : (WORLD_GROUND_Y - 1) * TILE
      this.player = {
        x: sx,
        y: sy,
        w: TILE,
        h: TILE,
        vx: 0,
        vy: 0,
        onGround: false,
        facing: 1,
        walk: 0,
        power: 'small', // small | super | fire
        starTimer: 0,
      }
      this.camX = Math.max(0, sx - 200)
    }
  }
  if (!this.player) {
    this.player = { x: 2 * TILE, y: (WORLD_GROUND_Y - 1) * TILE, w: TILE, h: TILE, vx: 0, vy: 0, onGround: false, facing: 1, walk: 0, power: 'small', starTimer: 0 }
  }
  this.playerBottomPrev = this.player.y + this.player.h
  this.time = Math.max(200, 300 - (levelIdx - 1) * 30)
  this.invuln = 0
  /* 读档恢复变身状态 */
  if (this.resumePower && this.resumePower !== 'small') {
    this.setPower(this.resumePower)
    if (this.resumeStar > 0) this.player.starTimer = this.resumeStar * 1000
  }
  this.resumePower = null
  this.resumeStar = 0
  this.state = 'playing'
  this.stateTimer = 0
  /* 瓦片列索引: 按瓦片覆盖的 x 列分组, collideTiles 只查相关列, 避免每帧全量扫描 */
  this._tileCols = []
  for (var ti = 0; ti < this.tiles.length; ti++) {
    var tcol = this.tiles[ti]
    var c0 = Math.floor(tcol.x / TILE)
    var c1 = Math.floor((tcol.x + tcol.w - 1) / TILE)
    for (var cc = c0; cc <= c1; cc++) {
      if (!this._tileCols[cc]) this._tileCols[cc] = []
      this._tileCols[cc].push(tcol)
    }
  }
  /* 开局悬空怪修正: 地面怪生成在坑/空隙上方时会直接掉落, 吸附到最近的实心地面 (原版怪都站在坑边) */
  for (var si = 0; si < this.enemies.length; si++) {
    var se = this.enemies[si]
    if (se.kind !== 'goomba' && se.kind !== 'koopa' && se.kind !== 'redkoopa' && se.kind !== 'buzzy') continue
    if (this.collideTiles(se.x + se.w / 2 - 2, se.y + se.h, 4, 4)) continue
    var moved = false
    for (var sd = 1; sd <= 10 && !moved; sd++) {
      var sx2 = se.x - sd * TILE
      if (this.collideTiles(sx2 + se.w / 2 - 2, se.y + se.h, 4, 4)) { se.x = sx2; moved = true }
    }
    for (var sd2 = 1; sd2 <= 10 && !moved; sd2++) {
      var sx3 = se.x + sd2 * TILE
      if (this.collideTiles(sx3 + se.w / 2 - 2, se.y + se.h, 4, 4)) { se.x = sx3; moved = true }
    }
  }
}

/* 变身: small -> super -> fire, 切换碰撞框与精灵 */
Game.prototype.setPower = function (next) {
  var p = this.player
  if (!p) return
  if (next === p.power) return
  /* 变大: 底部对齐, 高度翻倍 */
  if (next === 'super' || next === 'fire') {
    if (p.power === 'small') {
      var bottom = p.y + p.h
      p.h = TILE * 2
      p.w = TILE
      p.y = bottom - p.h
    }
  } else if (next === 'small') {
    if (p.power !== 'small') {
      var b2 = p.y + p.h
      p.h = TILE
      p.w = TILE
      p.y = b2 - p.h
    }
  }
  p.power = next
  if (this.hooks.onPower) this.hooks.onPower({ power: next })
}

/* 开始: 按存档/新局状态 */
Game.prototype.start = function (state) {
  this.reset()
  this.level = state.level || 1
  this.score = state.score || 0
  this.coins = state.coins || 0
  this.lives = state.lives || 3
  this.resumePower = state.power || 'small'
  this.resumeStar = state.starTimer || 0
  this.loadLevel(this.level)
}

Game.prototype.getState = function () {
  var p = this.player
  return {
    level: this.level,
    score: this.score,
    coins: this.coins,
    lives: this.lives,
    time: Math.max(0, Math.round(this.time)),
    power: p ? p.power : 'small',
    starTimer: p ? Math.max(0, Math.round((p.starTimer || 0) / 1000)) : 0,
  }
}

Game.prototype.setInput = function (dir, on) {
  if (dir === 'left') this.input.left = on
  else if (dir === 'right') this.input.right = on
  else if (dir === 'jump') this.input.jump = on
  else if (dir === 'fire') {
    /* 火焰形态: 发火球 */
    if (on && this.state === 'playing') this.fireFireball()
  }
}

/* 发射火球 (fire 形态, 最多 2 颗) */
Game.prototype.fireFireball = function () {
  var p = this.player
  if (!p || p.power !== 'fire') return
  if (this.fireballs.length >= 2) return
  var f = {
    x: p.facing > 0 ? p.x + p.w : p.x - TILE,
    y: p.y + 8,
    w: TILE,
    h: TILE,
    vx: p.facing * 3.6,
    vy: -2.4,
    alive: true,
    t: 0,
  }
  this.fireballs.push(f)
}

/* ---------- 玩家物理 ---------- */

Game.prototype.movePlayerX = function () {
  var p = this.player
  var step = Math.abs(p.vx)
  var dir = p.vx > 0 ? 1 : -1
  var guard = 0
  while (step > 0 && guard < 8) {
    var d = Math.min(step, 4)
    p.x += dir * d
    step -= d
    guard++
    var hit = this.collideTiles(p.x, p.y, p.w, p.h)
    if (hit) {
      if (dir > 0) p.x = hit.x - p.w
      else p.x = hit.x + hit.w
      p.vx = 0
      break
    }
  }
  if (p.x < 0) {
    p.x = 0
    p.vx = 0
  }
}

Game.prototype.movePlayerY = function () {
  var p = this.player
  var step = Math.abs(p.vy)
  var dir = p.vy > 0 ? 1 : -1
  var guard = 0
  while (step > 0 && guard < 8) {
    var d = Math.min(step, 4)
    p.y += dir * d
    step -= d
    guard++
    var hit = this.collideTiles(p.x, p.y, p.w, p.h)
    if (hit) {
      if (dir > 0) {
        p.y = hit.y - p.h
        p.vy = 0
        p.onGround = true
      } else {
        p.y = hit.y + hit.h
        p.vy = BONK_V
        this.bonkTile(hit)
      }
      break
    }
  }
  /* 顶部空气墙: 不能跳出地图顶端 */
  if (p.y < 0) {
    p.y = 0
    if (p.vy < 0) p.vy = 0
  }
  if (p.y > this.worldH + 200) {
    this.killPlayer(true)
  }
  /* 岩浆检测: 碰到岩浆就死 */
  this.checkLavaHit()
}

Game.prototype.checkLavaHit = function () {
  if (this.state !== 'playing') return
  var p = this.player
  if (p.starTimer > 0) return
  /* 检测玩家脚底是否在岩浆里: 只遍历岩浆池列表 (远少于全量 tiles), 避免每帧全扫 */
  var footX = p.x + p.w / 2
  var footY = p.y + p.h
  var lava = this.lavaList
  for (var i = 0; i < lava.length; i++) {
    var t = lava[i]
    if (footX >= t.x && footX <= t.x + t.w &&
        footY >= t.y && footY <= t.y + t.h) {
      this.killPlayer(false)
      return
    }
  }
}

/* 岩浆喷火球: 向上方 45 度角发射 */
Game.prototype.shootLavaFireball = function (lava) {
  if (!lava) return
  var p = this.player
  /* 只喷屏幕内可见的岩浆池 (原版: 离开视野的池不喷) */
  if (lava.x + lava.w < this.camX - TILE || lava.x > this.camX + VIEW_W + TILE) return
  /* 原版岩浆喷发: 向上抛物线, 力度足 (初速 ~6), 方向近垂直略带随机 */
  var speed = 5.5 + Math.random() * 1.5
  var angle = -Math.PI / 2 + (Math.random() - 0.5) * (Math.PI / 3)
  var vx = Math.cos(angle) * speed
  var vy = Math.sin(angle) * speed
  /* 生成火球敌人 (生成即激活, 立即飞行) */
  this.enemies.push({
    x: lava.x + lava.w / 2 - TILE / 2,
    y: lava.y - TILE,
    w: TILE,
    h: TILE,
    vx: vx,
    vy: vy,
    alive: true,
    squashed: false,
    squashT: 0,
    walk: 0,
    activated: true,
    kind: 'lavaFireball',
    life: 240,
  })
}

/* 顶砖块: 问号出金币/道具, 砖块 super 顶碎/small 顶弹 */
Game.prototype.spawnPowerup = function (kind, tx, ty) {
  /* 道具出生在块上方; 蘑菇/星/1UP 弹起后水平移动, 花固定 */
  var isStatic = kind === 'flower'
  this.powerups.push({
    kind: kind,
    x: tx,
    y: ty - TILE,
    w: TILE,
    h: TILE,
    vx: isStatic ? 0 : (kind === 'star' ? 2.4 : 1.3),
    vy: isStatic ? 0 : -5,
    active: true,
    t: 0,
  })
  this.score += 200
}

Game.prototype.bonkTile = function (tile) {
  if (tile.type === 'qblock' && !tile.used) {
    tile.used = true
    /* 问号块被顶开是永久状态变化, 强制静态层缓存失效(否则缓存只在跨瓦片时重建, 顶开后块会消失) */
    this._tileCacheX = NaN
    var content = tile.content || 'coin'
    if (content === 'mushroom') {
      this.spawnPowerup('mushroom', tile.x, tile.y)
    } else if (content === 'flower') {
      this.spawnPowerup('flower', tile.x, tile.y)
    } else if (content === 'star') {
      this.spawnPowerup('star', tile.x, tile.y)
    } else if (content === '1up') {
      this.spawnPowerup('1up', tile.x, tile.y)
    } else {
      this.score += 200
      this.coins++
      if (this.coins % 100 === 0) this.lives++
      this.particles.push({ kind: 'coinpop', x: tile.x + TILE / 2, y: tile.y - TILE / 2, vy: -6, t: 0 })
    }
  } else if (tile.type === 'brick') {
    var pw = this.player ? this.player.power : 'small'
    if (!tile.dead && (pw === 'super' || pw === 'fire')) {
      tile.dead = true
      /* 砖块被顶碎是永久状态变化, 强制静态层缓存失效(否则碎砖残留画面) */
      this._tileCacheX = NaN
      this.score += 50
      for (var i = 0; i < 4; i++) {
        this.particles.push({
          kind: 'debris',
          x: tile.x + (i % 2) * 8 + 4,
          y: tile.y + Math.floor(i / 2) * 8 + 4,
          vx: i % 2 === 0 ? -1.6 : 1.6,
          vy: -5 - (i % 2) * 1.4,
          t: 0,
        })
      }
    } else if (!tile.dead) {
      /* small 顶砖只弹: 加入活动抖动列表, 避免 tick 每帧全量扫 tiles 递减 */
      tile.bumpT = 0.2
      if (!this._bumpTiles) this._bumpTiles = []
      if (this._bumpTiles.indexOf(tile) < 0) this._bumpTiles.push(tile)
    }
  }
}

/* 与 tiles 的 AABB 碰撞 (跳过已死砖块), 返回第一个碰撞体 */
Game.prototype.collideTiles = function (x, y, w, h) {
  /* 列索引快路径: 只查查询框覆盖的列, 避免全量扫描 (词典笔软件渲染/慢 JS 下收益明显) */
  var cols = this._tileCols
  if (cols) {
    var c0 = Math.floor(x / TILE)
    var c1 = Math.floor((x + w) / TILE)
    for (var cc = c0; cc <= c1; cc++) {
      var bucket = cols[cc]
      if (!bucket) continue
      for (var bi = 0; bi < bucket.length; bi++) {
        var bt = bucket[bi]
        if (bt.dead) continue
        if (rectsHit(x, y, w, h, bt.x, bt.y, bt.w, bt.h)) return bt
      }
    }
    return null
  }
  for (var i = 0; i < this.tiles.length; i++) {
    var t = this.tiles[i]
    if (t.dead) continue
    if (rectsHit(x, y, w, h, t.x, t.y, t.w, t.h)) return t
  }
  return null
}

Game.prototype.collideTileList = function (x, y, w, h) {
  var out = []
  var cols = this._tileCols
  if (cols) {
    var c0 = Math.floor(x / TILE)
    var c1 = Math.floor((x + w) / TILE)
    for (var cc = c0; cc <= c1; cc++) {
      var bucket = cols[cc]
      if (!bucket) continue
      for (var bi = 0; bi < bucket.length; bi++) {
        var bt = bucket[bi]
        if (bt.dead) continue
        if (rectsHit(x, y, w, h, bt.x, bt.y, bt.w, bt.h)) out.push(bt)
      }
    }
    return out
  }
  for (var i = 0; i < this.tiles.length; i++) {
    var t = this.tiles[i]
    if (t.dead) continue
    if (rectsHit(x, y, w, h, t.x, t.y, t.w, t.h)) out.push(t)
  }
  return out
}

/* ---------- 敌人 ---------- */

Game.prototype.updateEnemies = function (dt) {
  var p = this.player
  var keep = []
  for (var i = 0; i < this.enemies.length; i++) {
    var e = this.enemies[i]
    if (!e.alive) {
      e.squashT -= dt / 1000
      if (e.squashT > 0) keep.push(e)
      continue
    }
    /* 怪物激活: 玩家进入屏幕范围后才开始移动 */
    if (!e.activated) {
      /* 地面怪物激活距离稍远, 刷在砖块/空中的怪物激活距离更短 */
      var isAir = (e.kind === 'paratroopa_g' || e.kind === 'paratroopa_r' ||
                   e.kind === 'bulletbill' || e.kind === 'podoboo' ||
                   e.kind === 'piranha' ||
                   e.kind === 'lakitu' || e.kind === 'blooper' ||
                   (e.y < (WORLD_GROUND_Y - 1.5) * TILE && e.kind !== 'hammer' && e.kind !== 'buzzy'))
      var margin = isAir ? 20 : 100
      if (e.x > p.x - margin && e.x < p.x + VIEW_W + margin) {
        e.activated = true
      } else {
        keep.push(e)
        continue
      }
    }

    /* ===== 按种类分行为 ===== */
    if (e.kind === 'paratroopa_g') {
      /* 绿飞龟: 水平飞行 + 波浪起伏 */
      e.flyT = (e.flyT || 0) + dt / 16.667
      e.y = e.baseY + Math.sin(e.flyT * 0.08) * TILE * 0.8
      e.x += e.vx * (dt / 16.667)
    } else if (e.kind === 'paratroopa_r') {
      /* 红飞龟: 原地垂直跳 (不横移) */
      e.flyT = (e.flyT || 0) + dt / 16.667
      e.y = e.baseY + Math.abs(Math.sin(e.flyT * 0.12)) * TILE * 1.4
    } else if (e.kind === 'bulletbill') {
      /* 子弹比尔: 水平直线飞 */
      e.x += e.vx * (dt / 16.667)
    } else if (e.kind === 'podoboo') {
      /* 帕拉火球: 从岩浆跳起 */
      e.t = (e.t || 0) + dt
      if (e.t > e.wait || e.t == null) {
        e.vy -= GRAVITY * (dt / 16.667)
        e.y += e.vy * (dt / 16.667)
        if (e.y > e.baseY) { e.y = e.baseY; e.vy = -e.jumpV; e.t = 0; e.wait = 1500 + Math.random() * 1000 }
      }
    } else if (e.kind === 'piranha') {
      /* 食人花: 从管道顶部向上弹出再收回 (原版节奏约3s: 升0.4s/露1.6s/降0.4s/藏0.6s) */
      e.t = (e.t || 0) + dt
      if (e.baseY == null) e.baseY = e.y
      var cycle = e.t % 3000
      var popDist = e.h /* 完全弹出时底部正好在管道顶 */
      if (cycle < 400) {
        /* 向上弹出 */
        var p = cycle / 400
        e.y = e.baseY - p * popDist
      } else if (cycle < 2000) {
        /* 停在上面 */
        e.y = e.baseY - popDist
      } else if (cycle < 2400) {
        /* 缩回管道 */
        var p2 = (cycle - 2000) / 400
        e.y = e.baseY - popDist + p2 * popDist
      } else {
        /* 缩回后隐藏 */
        e.y = e.baseY
      }
    } else if (e.kind === 'lavaFireball') {
      /* 岩浆火球: 直线飞行, 有轻微重力 */
      e.x += e.vx * (dt / 16.667)
      e.y += e.vy * (dt / 16.667)
      e.vy += GRAVITY * (dt / 16.667) * 0.3
      e.life--
      if (e.life <= 0) e.alive = false
    } else if (e.kind === 'spiny') {
      /* 刺龟: 不能踩, 有重力 */
      e.x += e.vx * (dt / 16.667)
      if (!e.vy) e.vy = 0
      e.vy = Math.min(e.vy + GRAVITY * (dt / 16.667), MAX_FALL)
      e.y += e.vy * (dt / 16.667)
      var landHit2 = this.collideTiles(e.x, e.y + e.h, e.w, 4)
      if (landHit2 && e.vy > 0) { e.y = landHit2.y - e.h; e.vy = 0 }
      var aheadX2 = e.vx > 0 ? e.x + e.w + 2 : e.x - 2
      var floor2 = this.collideTiles(aheadX2, e.y + e.h + 2, 4, 6)
      if (!floor2 && e.vy === 0) { e.x -= e.vx * (dt / 16.667); e.vx = -e.vx }
    } else if (e.kind === 'blooper') {
      /* 墨鱼: 原版Z字 — 水平朝玩家游动, 垂直在自身深度上下波动 */
      e.t = (e.t || 0) + dt
      if (e.baseY == null) e.baseY = e.y
      var bdx = this.player.x - e.x
      e.x += (bdx > 0 ? 1 : -1) * 0.9 * (dt / 16.667)
      e.y = e.baseY + Math.sin(e.t / 200) * TILE * 0.8
      /* 出屏后从另一侧回来 */
      if (e.y > WORLD_GROUND_Y * TILE || e.y < -TILE * 2) e.y = Math.max(TILE, Math.min(WORLD_GROUND_Y * TILE - TILE, e.y))
    } else if (e.kind === 'cheep') {
      /* 跳跳鱼: 反复从地面跳起 */
      if (e.wait > 0) {
        e.wait -= dt
        keep.push(e)
        continue
      }
      e.vy = Math.min(e.vy + GRAVITY * 0.5 * (dt / 16.667), 6)
      e.y += e.vy * (dt / 16.667)
      e.x += e.vx * (dt / 16.667)
      /* 落回地面下方后等一会再跳 */
      if (e.y >= (WORLD_GROUND_Y + 1) * TILE) {
        e.y = (WORLD_GROUND_Y + 1) * TILE
        e.vy = -10
        e.wait = 1500 + Math.random() * 2000
      }
    } else if (e.kind === 'hammer') {
      /* 锤子龟: 跳跃+扔锤子 */
      if (e.isProjectile) {
        /* 锤子飞行物 */
        e.vy = Math.min(e.vy + GRAVITY * (dt / 16.667), 8)
        e.x += e.vx * (dt / 16.667)
        e.y += e.vy * (dt / 16.667)
        e.life--
        if (e.life <= 0) e.alive = false
        keep.push(e)
        continue
      }
      e.t = (e.t || 0) + dt
      if (!e.vy) e.vy = 0
      e.vy = Math.min(e.vy + GRAVITY * (dt / 16.667), MAX_FALL)
      e.x += e.vx * (dt / 16.667)
      e.y += e.vy * (dt / 16.667)
      var hbLand = this.collideTiles(e.x, e.y + e.h, e.w, 4)
      if (hbLand && e.vy > 0) { e.y = hbLand.y - e.h; e.vy = 0 }
      /* 撞墙掉头 */
      var hbWall = this.collideTiles(e.vx > 0 ? e.x + e.w + 2 : e.x - 2, e.y + 4, 2, e.h - 8)
      if (hbWall) e.vx = -e.vx
      /* 每隔1.5秒跳一下 */
      if (e.vy === 0 && e.t > 1500) { e.vy = -6; e.t = 0 }
      /* 每隔2秒扔锤子 */
      e.throwT = (e.throwT || 0) + dt
      if (e.throwT > 2000 && e.x > this.player.x - 200 && e.x < this.player.x + 400) {
        e.throwT = 0
        var dir = this.player.x > e.x ? 1 : -1
        this.enemies.push({
          x: e.x + e.w / 2, y: e.y, w: TILE * 0.6, h: TILE * 0.6,
          vx: dir * 3, vy: -5, alive: true, squashed: false, squashT: 0, walk: 0,
          kind: 'hammer', isProjectile: true, t: 0, life: 120,
        })
      }
    } else if (e.kind === 'lakitu') {
      /* 云龟: 跟随玩家, 扔刺龟蛋 */
      var targetX = this.player.x - TILE
      e.x += (targetX - e.x) * 0.03
      e.y = (this.player.y - 4 * TILE) + Math.sin(e.t / 500) * TILE
      e.t = (e.t || 0) + dt
      e.throwT = (e.throwT || 0) + dt
      if (e.throwT > 2500 && e.alive) {
        e.throwT = 0
        /* 在玩家正上方扔蛋 */
        this.enemies.push({
          x: this.player.x, y: e.y + TILE, w: TILE, h: TILE,
          vx: 0.3, vy: 1, alive: true, squashed: false, squashT: 0, walk: 0,
          kind: 'spiny', fromLakitu: true,
        })
      }
    } else if (e.kind === 'firebar') {
      /* 火焰棒: 旋转 */
      e.angle += e.speed * (dt / 16.667)
    } else {
      /* 默认: 地面行走 (goomba/koopa/redkoopa/buzzy) */
      if ((e.kind === 'koopa' || e.kind === 'redkoopa' || e.kind === 'buzzy') && e.shell > 0) {
        /* ===== 龟壳状态 (原版: 踩龟缩壳静止 -> 踢出滑行; 静止 13 游戏秒后龟重新钻出) ===== */
        if (e.shell === 2) {
          /* 滑动壳: 高速移动, 撞墙反弹, 边缘掉落 */
          e.x += e.vx * (dt / 16.667)
          if (!e.vy) e.vy = 0
          e.vy = Math.min(e.vy + GRAVITY * (dt / 16.667), MAX_FALL)
          e.y += e.vy * (dt / 16.667)
          var shLand = this.collideTiles(e.x, e.y + e.h, e.w, 4)
          if (shLand && e.vy > 0) { e.y = shLand.y - e.h; e.vy = 0 }
          var shAhead = e.vx > 0 ? e.x + e.w + 2 : e.x - 2
          var shWall = this.collideTiles(shAhead, e.y + 4, 2, e.h - 8)
          if (shWall) {
            e.x -= e.vx * (dt / 16.667)
            e.vx = -e.vx
          }
          /* 滑动壳撞其他敌人: 杀死 */
          for (var oi = 0; oi < this.enemies.length; oi++) {
            var oe = this.enemies[oi]
            if (oe === e || !oe.alive || oe.squashed) continue
            if (oe.kind === 'firebar' || oe.kind === 'piranha' || oe.kind === 'podoboo') continue
            if (rectsHit(e.x, e.y, e.w, e.h, oe.x, oe.y, oe.w, oe.h)) {
              oe.alive = false
              oe.squashed = true
              oe.squashT = 0.5
              this.score += 200
            }
          }
        } else if (e.shell === 1) {
          /* 静止壳: 不移动, 有重力; 13 游戏秒后龟重新钻出来继续走 (原版行为) */
          e.vx = 0
          if (!e.vy) e.vy = 0
          e.vy = Math.min(e.vy + GRAVITY * (dt / 16.667), MAX_FALL)
          e.y += e.vy * (dt / 16.667)
          var stLand = this.collideTiles(e.x, e.y + e.h, e.w, 4)
          if (stLand && e.vy > 0) { e.y = stLand.y - e.h; e.vy = 0 }
          e.shellT = (e.shellT || 0) + dt
          if (e.shellT >= 13000) {
            /* 龟从壳里钻出, 恢复行走 */
            e.shell = 0
            e.shellT = 0
            e.vx = (e.prevVx > 0 ? 1 : -1) * ENEMY_SPD
          }
        }
      } else {
      e.x += e.vx * (dt / 16.667)
      /* 重力: 没地面就往下掉 */
      if (!e.vy) e.vy = 0
      e.vy = Math.min(e.vy + GRAVITY * (dt / 16.667), MAX_FALL)
      e.y += e.vy * (dt / 16.667)
      /* 落地检测 */
      var landHit = this.collideTiles(e.x, e.y + e.h, e.w, 4)
      if (landHit && e.vy > 0) {
        e.y = landHit.y - e.h
        e.vy = 0
      }
      var aheadX = e.vx > 0 ? e.x + e.w + 2 : e.x - 2
      var belowY = e.y + e.h + 2
      var wall = this.collideTiles(aheadX, e.y + 4, 2, e.h - 8)
      var floor = this.collideTiles(aheadX, belowY, 4, 6)
      /* 判断是否地面怪物 (初始 y 在地面高度) */
      var isGroundEnemy = (e.startY == null) || (e.startY >= (WORLD_GROUND_Y - 1.5) * TILE)
      /* 只有撞墙才掉头; 地面怪物走到边缘也掉头, 砖块上的怪物走到边缘掉下去
         (原版: 绿龟 koopa 会走离平台边缘掉下悬崖, 红龟 redkoopa 守平台不掉头) */
      if (wall) {
        e.x -= e.vx * (dt / 16.667)
        e.vx = -e.vx
      } else if (!floor && isGroundEnemy && e.vy === 0 && e.kind !== 'koopa') {
        /* 地面怪物走到平台边缘会掉头 (绿龟除外: 原版走离边缘) */
        e.x -= e.vx * (dt / 16.667)
        e.vx = -e.vx
      }
      e.walk += dt / 90
      }
    }

    /* ===== 与玩家碰撞 ===== */
    /* 帕拉火球在岩浆里等待时不碰撞 */
    if (e.kind === 'podoboo' && e.t <= e.wait) {
      keep.push(e)
      continue
    }
    /* 火焰棒: 逐段检测 (直棒上任意一段碰到玩家都受伤) */
    if (e.kind === 'firebar') {
      var fcx = e.x + e.w / 2
      var fcy = e.y + e.h / 2
      var fireHit = false
      for (var fgi = 0; fgi < e.len; fgi++) {
        var fga = e.angle
        var fgx = fcx + Math.cos(fga) * (fgi + 1) * TILE * 0.5
        var fgy = fcy + Math.sin(fga) * (fgi + 1) * TILE * 0.5
        if (rectsHit(p.x, p.y, p.w, p.h, fgx - 6, fgy - 6, 12, 12)) {
          fireHit = true
          break
        }
      }
      if (fireHit) {
        if (p.starTimer > 0) {
          /* 无敌星: 火焰棒消失 (原版不可消灭, 但无敌星状态下接触无伤) */
        } else if (this.invuln <= 0) {
          this.hurtPlayer()
        }
      }
      keep.push(e)
      continue
    }
    if (rectsHit(p.x, p.y, p.w, p.h, e.x, e.y, e.w, e.h)) {
      if (p.starTimer > 0) {
        e.alive = false
        e.squashed = true
        e.squashT = 0.5
        this.score += 200
      } else if (e.kind === 'spiny' || e.kind === 'piranha' || e.kind === 'podoboo' || e.kind === 'lavaFireball' || e.kind === 'blooper' || e.kind === 'cheep' || e.kind === 'firebar' || (e.kind === 'hammer' && e.isProjectile)) {
        /* 不能踩的敌人 */
        if (this.invuln <= 0) this.hurtPlayer()
      } else if (e.kind === 'paratroopa_g' || e.kind === 'paratroopa_r') {
        /* 飞龟: 下落中踩一下变普通龟 (原版: stomp -> turns into a normal Koopa) */
        var stompingPT = p.vy > 0 && ((p.y + p.h <= e.y + e.h * 0.5) || (this.playerBottomPrev <= e.y + e.h * 0.5 && p.y + p.h > e.y))
        if (stompingPT) {
          e.kind = e.kind === 'paratroopa_r' ? 'redkoopa' : 'koopa'
          e.shell = 0
          e.shellT = 0
          e.h = TILE * 1.5
          e.baseY = undefined
          e.flyT = 0
          e.vx = e.vx || -ENEMY_SPD
          e.x = p.x + (p.w - e.w) / 2
          p.vy = STOMP_V
          p.onGround = false
          this.score += 200
        } else if (p.y + p.h <= e.y + e.h * 0.5) {
          /* 玩家在飞龟上方但未下落: 不交互 */
        } else if (this.invuln <= 0) {
          this.hurtPlayer()
          keep.push(e)
          continue
        }
      } else if (e.kind === 'koopa' || e.kind === 'redkoopa' || e.kind === 'buzzy') {
        /* 龟/硬壳虫 严格原版状态机:
           shell=0 行走; 踩一下 -> shell=1 缩壳静止(13秒后钻出), 玩家弹起;
           弹起落回再踩到静止壳 -> 踢出 shell=2 滑行 (原版连招: 落回即踢, 无防误触锁);
           踩滑行壳 -> 停回 shell=1; 侧面碰静止壳 -> 踢出; 滑行壳碰玩家 -> 受伤 */
        var aboveK = p.y + p.h <= e.y + e.h * 0.5
        var stompingK = p.vy > 0 && (aboveK || (this.playerBottomPrev <= e.y + e.h * 0.5 && p.y + p.h > e.y))
        if (stompingK) {
          if (e.shell === 2) {
            /* 踩滑动的壳: 停下 (原版: A shell in motion can be stopped by stomping on it) */
            e.shell = 1
            e.vx = 0
            e.shellT = 0
            p.vy = STOMP_V
            p.onGround = false
            this.score += 100
          } else if (e.shell === 1) {
            /* 踩静止壳: 沿玩家面向方向踢出 (原版: 落回再踩/再踩静止壳即踢飞, kick and send him flying) */
            e.shell = 2
            e.shellT = 0
            e.vx = (p.facing >= 0 ? 1 : -1) * SHELL_SPD
            p.vy = STOMP_V
            p.onGround = false
            this.score += 100
          } else {
            /* 踩行走龟: 缩壳静止 (原版: stays motionless for a while) */
            e.shell = 1
            e.prevVx = e.vx
            e.vx = 0
            e.shellT = 0
            p.vy = STOMP_V
            p.onGround = false
            this.score += 100
          }
        } else if (e.shell === 2) {
          /* 滑动的壳碰玩家 -> 受伤 (原版: 滑行壳撞到即受伤) */
          if (this.invuln <= 0) this.hurtPlayer()
          keep.push(e)
          continue
        } else if (aboveK) {
          /* 玩家在壳/龟上方但未下落 (上升经过/砖块上水平走过): 不踩不伤 (原版 y 不重叠不碰撞) */
        } else if (this.invuln <= 0) {
          /* 侧面碰: 静止壳 -> 踢飞壳 (原版: 主动踢壳); 行走龟 -> 受伤 */
          if (e.shell === 1) {
            e.shell = 2
            e.shellT = 0
            e.vx = (p.x + p.w / 2 < e.x + e.w / 2 ? 1 : -1) * SHELL_SPD
          } else {
            this.hurtPlayer()
          }
          keep.push(e)
          continue
        }
      } else if (p.vy > 0 && ((p.y + p.h <= e.y + e.h * 0.5) || (this.playerBottomPrev <= e.y + e.h * 0.5 && p.y + p.h > e.y))) {
        /* 踩怪 (原版 SMB: 下落中 vy>0 且玩家脚在敌人垂直中点之上; 高速下落隧穿时上一帧底部在中点之上也算踩.
           必须下落中才可踩: 水平走过/上升中碰到不击杀, 避免"水平走过了才触发") */
        e.alive = false
        e.squashed = true
        e.squashT = 0.5
        e.x = p.x + (p.w - e.w) / 2
        e.y = (WORLD_GROUND_Y - 1) * TILE
        p.vy = STOMP_V
        p.onGround = false
        this.score += 100
      } else if (p.y + p.h <= e.y + e.h * 0.5) {
        /* 玩家在敌人上方但未下落 (站砖块/平台上水平经过): 不踩不伤 (原版 y 不重叠不碰撞) */
      } else if (this.invuln <= 0) {
        this.hurtPlayer()
        keep.push(e)
        continue
      }
    }
    keep.push(e)
  }
  this.enemies = keep
}

/* 库巴 BOSS 更新 */
Game.prototype.updateBoss = function (dt) {
  var b = this.boss
  var p = this.player
  if (!b || !b.alive) return
  /* 巡逻: 撞墙/无地面掉头; 且不越过终点 (斧头/旗杆) */
  var patrolMax = this.axe ? this.axe.x - TILE : (this.flagX > 0 ? this.flagX - TILE : Infinity)
  b.x += b.vx * (dt / 16.667)
  var aheadX = b.vx > 0 ? b.x + b.w + 2 : b.x - 2
  var wall = this.collideTiles(aheadX, b.y + 4, 2, b.h - 8)
  var floor = this.collideTiles(aheadX, b.y + b.h + 2, 4, 6)
  if (wall || !floor || (b.vx > 0 && b.x + b.w > patrolMax)) {
    b.x -= b.vx * (dt / 16.667)
    b.vx = -b.vx
  }
  b.walk += dt / 60

  /* 跳跃: 原版库巴会跳, 每 2.5~4 秒跳一次 */
  b.jumpT = (b.jumpT || 0) - dt
  if (!b.vy) b.vy = 0
  if (b.jumpT <= 0 && b.vy === 0) {
    b.jumpT = 2500 + Math.random() * 1500
    b.vy = -6.5
  }
  b.vy = Math.min(b.vy + GRAVITY * (dt / 16.667), MAX_FALL)
  b.y += b.vy * (dt / 16.667)
  var bossLand = this.collideTiles(b.x, b.y + b.h, b.w, 4)
  if (bossLand && b.vy > 0) {
    b.y = bossLand.y - b.h
    b.vy = 0
  }

  /* 喷火: 原版每次连喷 2~3 个火球 (间隔约 180ms), 火球水平抛物线 */
  b.fireT = (b.fireT || 0) - dt
  b.burst = (b.burst || 0)
  b.burstT = (b.burstT || 0) - dt
  if (b.fireT <= 0 && b.burst <= 0) {
    b.burst = 2 + Math.floor(Math.random() * 2)
    b.burstT = 0
    b.fireT = 2000 + Math.random() * 800
  }
  if (b.burst > 0 && b.burstT <= 0) {
    b.burst--
    b.burstT = 180
    /* 火球射向玩家当前位置 (原版库巴火球朝马里奥方向抛物线) */
    var bm = { x: b.x + b.w / 2, y: b.y + 12 }
    var pm = { x: p.x + p.w / 2, y: p.y + p.h / 2 }
    var bdx = pm.x - bm.x
    var bdy = pm.y - bm.y
    var bd = Math.sqrt(bdx * bdx + bdy * bdy) || 1
    var bspd = 3.0
    this.fireballs.push({
      x: b.x + b.w / 2 - TILE / 2,
      y: b.y + 12,
      w: TILE,
      h: TILE,
      vx: (bdx / bd) * bspd,
      vy: (bdy / bd) * bspd - 0.8,
      alive: true,
      t: 0,
      enemy: true,
    })
  }

  /* 与玩家碰撞 */
  if (rectsHit(p.x, p.y, p.w, p.h, b.x, b.y, b.w, b.h)) {
    if (p.starTimer > 0) {
      this.hurtBoss(3)
      p.vy = STOMP_V
      p.onGround = false
      return
    }
    if (this.invuln > 0) return
    var stomping = p.vy > 0 && this.playerBottomPrev <= b.y + 6
    if (stomping) {
      /* 踩库巴普通形态无效, 弹开 */
      p.vy = STOMP_V
      p.onGround = false
    } else {
      this.hurtPlayer()
    }
  }
}

/* ---------- 道具/粒子 ---------- */

Game.prototype.updateItems = function (dt) {
  var p = this.player
  for (var i = 0; i < this.coinItems.length; i++) {
    var c = this.coinItems[i]
    if (!c.active) continue
    c.t += dt / 90
    if (rectsHit(p.x, p.y, p.w, p.h, c.x, c.y, c.w, c.h)) {
      c.active = false
      this.coins++
      this.score += 200
      if (this.coins % 100 === 0) this.lives++
    }
  }

  /* 强化道具 */
  var keepPu = []
  for (var k = 0; k < this.powerups.length; k++) {
    var u = this.powerups[k]
    if (!u.active) continue
    u.t += dt / 16.667
    if (u.kind !== 'flower') {
      /* 重力 + 水平移动 + 撞墙/落地 */
      u.vy = Math.min(u.vy + GRAVITY * (dt / 16.667), MAX_FALL)
      var steps = Math.abs(u.vy)
      var dirY = u.vy > 0 ? 1 : -1
      var guardY = 0
      while (steps > 0 && guardY < 6) {
        var dY = Math.min(steps, 4)
        u.y += dirY * dY
        steps -= dY
        guardY++
        var hitY = this.collideTiles(u.x, u.y, u.w, u.h)
        if (hitY) {
          if (dirY > 0) { u.y = hitY.y - u.h; u.vy = 0 }
          else { u.y = hitY.y + hitY.h; u.vy = 0.4 }
          break
        }
      }
      var stX = Math.abs(u.vx)
      var dirX = u.vx > 0 ? 1 : -1
      var guardX = 0
      while (stX > 0 && guardX < 6) {
        var dX = Math.min(stX, 4)
        u.x += dirX * dX
        stX -= dX
        guardX++
        var hitX = this.collideTiles(u.x, u.y, u.w, u.h)
        if (hitX) {
          if (dirX > 0) u.x = hitX.x - u.w
          else u.x = hitX.x + hitX.w
          u.vx = -u.vx
          break
        }
      }
      if (u.x < -TILE || u.x > this.worldW + TILE || u.y > this.worldH + 120) continue
    }
    /* 拾取 */
    if (rectsHit(p.x, p.y, p.w, p.h, u.x, u.y, u.w, u.h)) {
      u.active = false
      if (u.kind === 'mushroom') {
        if (p.power === 'small') this.setPower('super')
        this.score += 1000
        this.particles.push({ kind: 'text', x: p.x, y: p.y - 8, t: 0 })
      } else if (u.kind === 'flower') {
        if (p.power === 'small') this.setPower('super')
        this.setPower('fire')
        this.score += 1000
        this.particles.push({ kind: 'text', x: p.x, y: p.y - 8, t: 0 })
      } else if (u.kind === 'star') {
        p.starTimer = 10000
        this.score += 1000
      } else if (u.kind === '1up') {
        this.lives++
        this.score += 1000
      }
      continue
    }
    keepPu.push(u)
  }
  this.powerups = keepPu

  /* 火球 */
  var keepFb = []
  for (var m = 0; m < this.fireballs.length; m++) {
    var f = this.fireballs[m]
    if (!f.alive) continue
    f.t += dt / 16.667
    if (f.enemy) {
      /* 敌方火球 (库巴): 碰玩家受伤, 碰墙消失 */
      if (rectsHit(f.x, f.y, f.w, f.h, p.x, p.y, p.w, p.h)) {
        this.hurtPlayer()
        f.alive = false
        continue
      }
      f.vy = Math.min(f.vy + GRAVITY * (dt / 16.667), MAX_FALL)
      f.x += f.vx * (dt / 16.667)
      f.y += f.vy * (dt / 16.667)
      if (this.collideTiles(f.x, f.y, f.w, f.h)) {
        f.alive = false
        continue
      }
      if (f.y > this.worldH + 80) {
        f.alive = false
        continue
      }
      keepFb.push(f)
      continue
    }
    f.vy = Math.min(f.vy + GRAVITY * (dt / 16.667), MAX_FALL)
    /* 水平 */
    f.x += f.vx * (dt / 16.667)
    var hx = this.collideTiles(f.x, f.y, f.w, f.h)
    if (hx) {
      f.alive = false
      continue
    }
    /* 垂直+弹跳 */
    f.y += f.vy * (dt / 16.667)
    var hy = this.collideTiles(f.x, f.y, f.w, f.h)
    if (hy) {
      if (f.vy > 0) {
        f.y = hy.y - f.h
        f.vy = -4.8
      } else {
        f.y = hy.y + hy.h
        f.vy = 0.6
      }
    }
    /* 与敌人 */
    var killed = false
    for (var n = 0; n < this.enemies.length; n++) {
      var en = this.enemies[n]
      if (!en.alive) continue
      if (rectsHit(f.x, f.y, f.w, f.h, en.x, en.y, en.w, en.h)) {
        en.alive = false
        en.squashed = true
        en.squashT = 0.4
        this.score += 200
        killed = true
        break
      }
    }
    if (killed) {
      f.alive = false
      continue
    }
    /* 与 boss */
    if (this.boss && this.boss.alive && rectsHit(f.x, f.y, f.w, f.h, this.boss.x, this.boss.y, this.boss.w, this.boss.h)) {
      f.alive = false
      this.hurtBoss(1)
      continue
    }
    if (f.x < -TILE || f.x > this.worldW + TILE || f.y > this.worldH + 80) continue
    keepFb.push(f)
  }
  this.fireballs = keepFb

  var keep = []
  for (var j = 0; j < this.particles.length; j++) {
    var pt = this.particles[j]
    pt.t += dt / 1000
    if (pt.kind === 'coinpop') {
      pt.y += pt.vy * (dt / 16.667)
      pt.vy += 0.35 * (dt / 16.667)
      if (pt.t < 0.5) keep.push(pt)
    } else if (pt.kind === 'debris') {
      pt.x += pt.vx * (dt / 16.667)
      pt.y += pt.vy * (dt / 16.667)
      pt.vy += 0.5 * (dt / 16.667)
      if (pt.t < 1.2) keep.push(pt)
    } else if (pt.kind === 'text') {
      pt.y -= 0.8 * (dt / 16.667)
      if (pt.t < 0.8) keep.push(pt)
    }
  }
  this.particles = keep
}

/* 库巴受伤/死亡 */
Game.prototype.hurtBoss = function (dmg) {
  var b = this.boss
  if (!b || !b.alive) return
  b.hp = (b.hp || 5) - dmg
  if (b.hp <= 0) {
    b.alive = false
    this.score += 5000
    this.particles.push({ kind: 'text', x: b.x, y: b.y - 8, t: 0 })
  }
}

/* 玩家受伤: super/fire 降级, small 死亡 */
Game.prototype.hurtPlayer = function () {
  var p = this.player
  if (this.invuln > 0 || p.starTimer > 0) return
  if (p.power === 'super' || p.power === 'fire') {
    this.setPower('small')
    this.invuln = 1500
  } else {
    this.killPlayer(false)
  }
}

/* ---------- 死亡/过关 ---------- */

Game.prototype.killPlayer = function (fall) {
  if (this.state !== 'playing') return
  this.state = 'dead'
  this.stateTimer = 0
  var p = this.player
  p.vy = fall ? -4 : DEAD_V
  p.vx = 0
  this.input.left = false
  this.input.right = false
  this.input.jump = false
}

Game.prototype.updateStateMachine = function (dt) {
  if (this.state === 'dead') {
    this.stateTimer += dt
    var p = this.player
    p.vy += GRAVITY * (dt / 16.667)
    p.y += p.vy * (dt / 16.667)
    if (this.stateTimer > 1600) {
      this.lives--
      if (this.lives <= 0) {
        this.state = 'gameover'
        if (this.hooks.onGameOver) this.hooks.onGameOver(this.getState())
      } else {
        this.loadLevel(this.level)
      }
    }
  } else if (this.state === 'flag') {
    /* 原版通关: 小旗从杆顶滑到杆底 (~0.7s), 玩家定在旗杆旁落地 */
    this.stateTimer += dt
    var fp = this.player
    fp.x = this.flagX - fp.w
    fp.vy = Math.min((fp.vy || 0) + GRAVITY * (dt / 16.667), MAX_FALL)
    fp.y += fp.vy * (dt / 16.667)
    var fLand = this.collideTiles(fp.x, fp.y + fp.h, fp.w, 4)
    if (fLand && fp.vy > 0) { fp.y = fLand.y - fp.h; fp.vy = 0 }
    if (this.stateTimer > 700) {
      this.state = 'clear'
      this.stateTimer = 0
      this.score += 1000
    }
  } else if (this.state === 'clear') {
    this.stateTimer += dt
    var pl = this.player
    pl.x += 1.1 * (dt / 16.667)
    if (this.stateTimer > 2400) {
      this.level++
      this.score += 1000
      this.loadLevel(this.level)
      if (this.hooks.onClear) this.hooks.onClear(this.getState())
    }
  }
}

/* ---------- 主循环 ---------- */

Game.prototype.tick = function (dtMs) {
  this.animT += dtMs
  /* 岩浆喷火球: 每池独立周期 (初始随机相位), 只喷屏幕内可见池 */
  if (this.lavaList && this.lavaList.length > 0) {
    for (var li = 0; li < this.lavaList.length; li++) {
      var lv = this.lavaList[li]
      if (lv.fireT == null) lv.fireT = Math.random() * 2000
      lv.fireT += dtMs
      if (lv.fireT >= 2500) {
        lv.fireT = 0
        this.shootLavaFireball(lv)
      }
    }
  }
  if (this.state !== 'playing') {
    this.updateStateMachine(dtMs)
    return
  }

  var p = this.player
  var dt = dtMs

  /* 记录玩家上一帧底部位置 (用于踩踏判定, 防止穿过敌人落地后误判) */
  this.playerBottomPrev = p.y + p.h

  /* 计时 */
  this.time -= dt / 1000
  if (this.time <= 0) {
    this.time = 0
    this.killPlayer(true)
    return
  }

  /* 输入 */
  var left = this.input.left
  var right = this.input.right
  var wantJump = this.input.jump && !this.input.prevJump
  this.input.prevJump = this.input.jump

  if (left && !right) {
    p.vx = -MOVE_SPD
    p.facing = -1
  } else if (right && !left) {
    p.vx = MOVE_SPD
    p.facing = 1
  } else {
    p.vx = 0
  }

  if (wantJump && p.onGround) {
    p.vy = JUMP_V
    p.onGround = false
    p.jumpHold = 0
  }

  /* 移动 */
  this.movePlayerX()
  /* 长按跳跃: 按住时上升阶段重力减半 -> 跳得更高; 但最多保持 JUMP_HOLD_MAX 毫秒 */
  var g = GRAVITY
  if (this.input.jump && p.vy < 0) {
    p.jumpHold = (p.jumpHold || 0) + dt
    if (p.jumpHold < JUMP_HOLD_MAX) g *= 0.42
  }
  p.vy = Math.min(p.vy + g * (dt / 16.667), MAX_FALL)
  p.onGround = false
  this.movePlayerY()

  if (p.onGround && p.vx !== 0) p.walk += dt / 110
  if (this.invuln > 0) this.invuln -= dt
  /* 砖块抖动递减: 只遍历活动抖动砖列表 (未顶时为空, 避免每帧全量扫 tiles) */
  var btiles = this._bumpTiles
  if (btiles && btiles.length > 0) {
    for (var bidx = btiles.length - 1; bidx >= 0; bidx--) {
      var btile = btiles[bidx]
      btile.bumpT -= dt / 1000
      if (btile.bumpT <= 0) { btile.bumpT = 0; btiles.splice(bidx, 1) }
    }
  }

  /* 敌人/道具 */
  this.updateEnemies(dt)
  this.updateItems(dt)
  if (this.boss) this.updateBoss(dt)

  /* 无敌星倒计时 */
  if (p.starTimer > 0) {
    p.starTimer -= dt
    if (p.starTimer < 0) p.starTimer = 0
  }

  /* 斧头拾取 → 断桥通关 */
  if (this.axe && !this.axe.taken && this.state === 'playing' &&
      rectsHit(p.x, p.y, p.w, p.h, this.axe.x, this.axe.y, this.axe.w, this.axe.h)) {
    this.axe.taken = true
    if (this.boss) {
      this.boss.alive = false
      this.score += 5000
    }
    this.score += 500
    this.state = 'clear'
    this.stateTimer = 0
  }

  /* 相机 */
  var target = p.x - 320
  if (target > this.camX) this.camX = target
  if (p.x < this.camX + 160) this.camX = Math.max(0, p.x - 160)
  this.camX = Math.max(0, Math.min(this.camX, this.worldW - VIEW_W))

  /* 过关: 碰到旗杆才通关 (flagX>0 表示有关卡有旗杆) — 原版: 小旗从杆顶滑下 */
  if (this.flagX > 0 && p.x + p.w > this.flagX) {
    this.state = 'flag'
    this.stateTimer = 0
    this.score += 500
  }
}

/* ---------- 渲染 ---------- */

Game.prototype.render = function () {
  var ctx = this.ctx
  var cam = Math.round(this.camX)
  ctx.fillStyle = this.theme === 'underground' ? C_UNDER_BG : (this.theme === 'castle' ? C_CASTLE_BG : C_SKY)
  ctx.fillRect(0, 0, VIEW_W, VIEW_H)

  this.renderBackdrop(ctx, cam)
  this.renderTiles(ctx, cam)

  /* 悬空金币 */
  for (var i = 0; i < this.coinItems.length; i++) {
    var c = this.coinItems[i]
    if (!c.active || c.x + c.w < cam || c.x > cam + VIEW_W) continue
    this.drawCoin(ctx, c.x - cam + TILE / 2, c.y + TILE / 2, c.t)
  }

  /* 敌人 */
  for (var j = 0; j < this.enemies.length; j++) {
    var e = this.enemies[j]
    if (e.x + e.w < cam || e.x > cam + VIEW_W) continue
    if (!e.alive) {
      /* 踩扁 */
      ctx.fillStyle = C_BROWN
      ctx.fillRect(e.x, e.y + e.h - 8, e.w, 8)
      continue
    }
    var spr
    var sprScale = ENEMY_SPR_SCALE[e.kind]
    if (e.kind === 'koopa') {
      spr = e.shell > 0 ? SPR_KOOPA_SHELL_G : SPR_KOOPA_G
    } else if (e.kind === 'redkoopa') {
      spr = e.shell > 0 ? SPR_KOOPA_SHELL_R : SPR_KOOPA_R
    } else if (e.kind === 'paratroopa_g') {
      spr = SPR_PARA_G
    } else if (e.kind === 'paratroopa_r') {
      spr = SPR_PARA_R
    } else if (e.kind === 'lavaFireball') {
      /* 岩浆火球: 橙红火球 */
      ctx.fillStyle = '#ff3300'
      ctx.fillRect(e.x - cam + 2, e.y + 2, e.w - 4, e.h - 4)
      ctx.fillStyle = '#ff9900'
      ctx.fillRect(e.x - cam + 5, e.y + 5, e.w - 10, e.h - 10)
      ctx.fillStyle = '#ffff00'
      ctx.fillRect(e.x - cam + 8, e.y + 8, e.w - 16, e.h - 16)
      continue
    } else if (e.kind === 'spiny') {
      spr = SPR_SPINY
    } else if (e.kind === 'bulletbill') {
      spr = SPR_BULLET
    } else if (e.kind === 'podoboo') {
      spr = SPR_PODOBOO
    } else if (e.kind === 'piranha') {
      /* 食人花单独在管道后面渲染 */
      continue
    } else if (e.kind === 'buzzy') {
      /* 硬壳虫: 缩壳后显示黑壳(原版深色壳), 行为同龟壳 */
      spr = SPR_BUZZY
    } else if (e.kind === 'blooper') {
      spr = SPR_BLOOPER
    } else if (e.kind === 'cheep') {
      spr = SPR_CHEEP
    } else if (e.kind === 'hammer') {
      if (e.isProjectile) {
        /* 抛出的锤子: 小锤色块 */
        ctx.fillStyle = '#8a5a2b'
        ctx.fillRect(e.x - cam + 2, e.y + e.h - 6, 5, 3)
        ctx.fillRect(e.x - cam + e.w - 7, e.y + e.h - 6, 5, 3)
        ctx.fillStyle = '#c0392b'
        ctx.fillRect(e.x - cam + 3, e.y + e.h - 3, e.w - 6, 3)
      } else {
        spr = SPR_HAMMER
      }
    } else if (e.kind === 'lakitu') {
      spr = SPR_LAKITU
    } else if (e.kind === 'firebar') {
      /* 火焰棒: 原版直棒 (火球沿直线排列, 绕轴旋转, 碰到任意一段都受伤) */
      var cx = e.x - cam + e.w / 2
      var cy = e.y + e.h / 2
      /* 原版中心大火球 (16x16 -> 1.5x = 24x24, 与瓦片同尺寸居中) */
      drawSprite(ctx, SPR_FIREBAR_HUB, 1.5, e.x - cam, e.y, false)
      for (var fi = 0; fi < e.len; fi++) {
        var fa = e.angle
        var fx = cx + Math.cos(fa) * (fi + 1) * TILE * 0.5
        var fy = cy + Math.sin(fa) * (fi + 1) * TILE * 0.5
        ctx.fillStyle = '#ff3300'
        ctx.fillRect(fx - 5, fy - 5, 10, 10)
        ctx.fillStyle = '#ffcc00'
        ctx.fillRect(fx - 3, fy - 3, 6, 6)
      }
      continue
    } else {
      spr = Math.floor(e.walk) % 2 === 0 ? SPR_GOOMBA : SPR_GOOMBA_WALK
    }
    if (spr) {
      /* 壳贴图 24x21 底部对齐到龟碰撞盒底部 */
      if ((e.kind === 'koopa' || e.kind === 'redkoopa') && e.shell > 0) {
        drawSprite(ctx, spr, 1, e.x - cam, e.y + e.h - 21, e.vx > 0)
      } else {
        drawSprite(ctx, spr, sprScale || 2, e.x - cam, e.y, e.vx > 0)
      }
    }
  }

  /* 强化道具 */
  for (var u = 0; u < this.powerups.length; u++) {
    var pu = this.powerups[u]
    if (!pu.active || pu.x + pu.w < cam || pu.x > cam + VIEW_W) continue
    if (pu.kind === 'mushroom') {
      drawSprite(ctx, MUSHROOM, undefined, pu.x - cam, pu.y, false)
    } else if (pu.kind === 'flower') {
      var fi = Math.floor(this.animT / 110) % FLOWER.length
      drawSprite(ctx, FLOWER[fi], undefined, pu.x - cam, pu.y, false)
    } else if (pu.kind === '1up') {
      drawSprite(ctx, ITEM_MUSHROOM_1UP, undefined, pu.x - cam, pu.y, false)
    } else {
      drawSprite(ctx, ITEM_STAR, undefined, pu.x - cam, pu.y, false)
    }
  }

  /* 火球 */
  for (var fb = 0; fb < this.fireballs.length; fb++) {
    var f = this.fireballs[fb]
    if (!f.alive || f.x + f.w < cam || f.x > cam + VIEW_W) continue
    ctx.fillStyle = C_ORANGE
    ctx.fillRect(f.x - cam + 2, f.y + 2, f.w - 4, f.h - 4)
    ctx.fillStyle = C_COIN
    ctx.fillRect(f.x - cam + 5, f.y + 5, f.w - 10, f.h - 10)
  }

  /* 库巴 BOSS */
  if (this.boss && this.boss.alive) {
    var b = this.boss
    if (b.x + b.w > cam && b.x < cam + VIEW_W) {
      drawSprite(ctx, SPR_BOWSER, 3, b.x - cam, b.y, b.vx > 0)
    }
  }

  /* 斧头 */
  if (this.axe && !this.axe.taken) {
    var ax = this.axe
    if (ax.x + ax.w > cam && ax.x < cam + VIEW_W) {
      ctx.fillStyle = '#9aa0ae'
      ctx.fillRect(ax.x - cam, ax.y + 6, 5, 18)
      ctx.fillRect(ax.x - cam + 14, ax.y + 6, 5, 18)
      ctx.fillStyle = '#e8a05a'
      ctx.beginPath()
      ctx.moveTo(ax.x - cam, ax.y + 6)
      ctx.lineTo(ax.x - cam + 4, ax.y - 2)
      ctx.lineTo(ax.x - cam + 16, ax.y + 2)
      ctx.lineTo(ax.x - cam + 16, ax.y + 10)
      ctx.lineTo(ax.x - cam + 4, ax.y + 6)
      ctx.closePath()
      ctx.fill()
    }
  }

  this.renderPlayer(ctx, cam)
  this.renderParticles(ctx, cam)

  if (this.state !== 'idle') this.renderHUD(ctx)
  this.renderControls(ctx)
  this.renderOverlay(ctx)
}

Game.prototype.renderBackdrop = function (ctx, cam) {
  if (this.theme === 'castle') {
    /* 城堡: 黑砖墙 + 底部熔岩带 */
    var cw = -((cam * 0.15) % 24)
    ctx.fillStyle = '#2a2a30'
    ctx.fillRect(0, 0, VIEW_W, VIEW_H)
    ctx.fillStyle = '#3a3a42'
    for (var cx = cw; cx < VIEW_W; cx += 24) {
      ctx.fillRect(cx, 0, 6, VIEW_H)
    }
    ctx.fillStyle = '#201c18'
    for (var cy = 0; cy < VIEW_H; cy += 12) {
      var coff = (Math.floor(cy / 24) % 2) * 12
      ctx.fillRect(cw + coff, cy, VIEW_W, 2)
    }
    return
  }

  if (this.theme === 'underground') {
    /* 地下: 深蓝色背景 */
    ctx.fillStyle = '#000020'
    ctx.fillRect(0, 0, VIEW_W, VIEW_H)
    return
  }
  if (this.theme === 'castle') {
    /* 城堡: 黑色背景 */
    ctx.fillStyle = '#000000'
    ctx.fillRect(0, 0, VIEW_W, VIEW_H)
    return
  }

  /* 远山 (视差 0.2), 贴图平铺, 山底延伸地面顶 (240) 消除缝隙 */
  var m1 = -((cam * 0.2) % 640)
  for (var i = 0; i < 3; i++) {
    var mx = m1 + i * 640
    this.drawHill(ctx, mx + 60, WORLD_GROUND_Y * TILE, 190)
  }
  var m2 = -((cam * 0.35) % 900)
  for (var k = 0; k < 2; k++) {
    var mxx = m2 + k * 900
    this.drawHill(ctx, mxx + 120, WORLD_GROUND_Y * TILE, 240)
  }

  /* 云 (视差 0.5) */
  var c1 = -((cam * 0.5) % 600)
  ctx.fillStyle = '#ffffff'
  for (var q = 0; q < 3; q++) {
    var cx = c1 + q * 600
    this.drawCloud(ctx, cx + 40, 50, 1.1)
    this.drawCloud(ctx, cx + 380, 92, 0.8)
  }
}

Game.prototype.drawHill = function (ctx, x, baseY, w) {
  /* 原版山贴图 (HILL 28x17 字符, scale2 => 56x34px), 平铺成连绵山 */
  var n = Math.max(1, Math.round(w / 56))
  for (var i = 0; i < n; i++) {
    drawSprite(ctx, HILL, 2, x + i * 56, baseY - 34, false)
  }
  /* 补平贴图底部缺口, 保证与地面无缝 */
  ctx.fillStyle = '#0d9300'
  ctx.fillRect(x, baseY - 2, w, 2)
}

Game.prototype.drawCloud = function (ctx, x, y, s) {
  var spr = s >= 1 ? CLOUD : CLOUD_S
  drawSprite(ctx, spr, 2, x, y, false)
}

Game.prototype.renderTiles = function (ctx, cam) {
  /* 主题色板: underground 青蓝, castle 灰, overworld 橙 */
  var themeCM = null
  if (this.theme === 'underground') {
    themeCM = { '#c75100': '#2890d0', '#e44c00': '#40b0e8', '#7c0e00': '#105080', '#000000': '#000030' }
  } else if (this.theme === 'castle') {
    themeCM = { '#c75100': '#909090', '#e44c00': '#b0b0b0', '#7c0e00': '#505050', '#000000': '#000000' }
  }

  /* ===== 食人花: 在管道之前渲染, 管道盖住食人花下半身 (原版逻辑) ===== */
  for (var pz = 0; pz < this.enemies.length; pz++) {
    var ez = this.enemies[pz]
    if (ez.kind !== 'piranha' || !ez.alive) continue
    if (ez.x + ez.w < cam || ez.x > cam + VIEW_W) continue
    var pzx = ez.x - cam + ez.w / 2
    drawSprite(ctx, SPR_PIRANHA, 1, pzx - 12, ez.y, false)
  }

  /* ===== 静态层缓存: 地面/砖块/硬块/已用问号块/管道/旗杆/城堡 只在相机跨瓦片时重绘 ===== */
  var tileX = Math.floor(cam / TILE) * TILE
  var c = this._tileCache
  if (!c || this._tileCacheX !== tileX) {
    if (!c) c = ensureCanvas(VIEW_W + TILE * 2, VIEW_H)
    if (c) {
      this._tileCache = c
      this._tileCacheX = tileX
      var cctx = c.getContext('2d')
      cctx.clearRect(0, 0, c.width, c.height)
      this._renderStaticTiles(cctx, tileX, themeCM)
    } else {
      this._tileCache = null
      this._tileCacheX = tileX
    }
  }
  if (this._tileCache) {
    ctx.drawImage(this._tileCache, this._tileCacheX - cam, 0)
  } else {
    /* 降级: 大离屏 canvas 不可用 (falcon 等受限运行时) 时, 静态层直接逐帧绘制到主画布.
       地面/砖块/管道走 drawSprite 快路径(小 canvas) 或逐像素 fillRect, 保证显示正确优先 */
    this._renderStaticTiles(ctx, cam, themeCM)
  }

  /* ===== 动态元素: 岩浆动画 + 未用问号块 + 抖动砖 (不缓存, 每帧重画) ===== */
  for (var i = 0; i < this.tiles.length; i++) {
    var t = this.tiles[i]
    if (t.dead || t.x + t.w < cam || t.x > cam + VIEW_W) continue
    var sx = t.x - cam
    if (t.type === 'lava') {
      /* 岩浆: 橙红色 + 黄色波纹 */
      ctx.fillStyle = '#ff4400'
      ctx.fillRect(sx, t.y, t.w, t.h)
      ctx.fillStyle = '#ffaa00'
      var wave = Math.floor(this.animT / 200) % 2
      for (var wx = 0; wx < t.w; wx += TILE) {
        ctx.fillRect(sx + wx + wave * 4, t.y + 2, 12, 4)
      }
      ctx.fillStyle = '#ff6600'
      ctx.fillRect(sx, t.y + t.h - 4, t.w, 4)
    } else if (t.type === 'brick' && t.bumpT > 0) {
      /* 被顶的砖: 抖动 */
      var bY = t.y - Math.sin(t.bumpT * 30) * 4
      drawSprite(ctx, BRICK, undefined, sx, bY, false, themeCM)
    } else if (t.type === 'qblock' && !t.used) {
      /* 未用问号块: 闪烁动画 */
      var qi = Math.floor(this.animT / 110) % QBLOCK.length
      drawSprite(ctx, QBLOCK[qi], undefined, sx, t.y, false, themeCM)
    }
  }

  /* 小旗 (动态层): 平时在杆顶, 通关时从杆顶滑到杆底 (原版动画) */
  if (this.flagX > cam - 200 && this.flagX < cam + VIEW_W + 200) {
    var fdx = this.flagX - cam
    var fdbase = WORLD_GROUND_Y * TILE
    var fTop = fdbase - 138
    var fBot = fdbase - 6
    var fdy = fTop
    if (this.state === 'flag') {
      var ft = Math.min(1, this.stateTimer / 700)
      fdy = fTop + (fBot - fTop) * ft
    }
    ctx.fillStyle = '#2fae5c'
    ctx.beginPath()
    ctx.moveTo(fdx + 2, fdy)
    ctx.lineTo(fdx + 34, fdy + 10)
    ctx.lineTo(fdx + 2, fdy + 20)
    ctx.closePath()
    ctx.fill()
  }
}

/* 静态层: 地面/砖块/硬块/已用问号块/管道/旗杆/城堡 (相对 scx 世界坐标绘制) */
Game.prototype._renderStaticTiles = function (ctx, scx, themeCM) {
  for (var i = 0; i < this.tiles.length; i++) {
    var t = this.tiles[i]
    if (t.dead || t.x + t.w < scx || t.x > scx + VIEW_W + TILE * 2) continue
    var sx = t.x - scx
    if (t.type === 'ground') {
      /* 地面渲染: 默认纯色填充(性能最优, 词典笔软件渲染扛不住贴图平铺); 调试开关可切回原版贴图平铺 */
      if (this.groundTile) {
        for (var ggy = 0; ggy < t.h; ggy += TILE) {
          for (var ggx = 0; ggx < t.w; ggx += TILE) {
            drawSprite(ctx, GROUND, undefined, sx + ggx, t.y + ggy, false, themeCM)
          }
        }
      } else {
        var gMain = '#9c4a00', gLight = '#ffcec5'
        if (this.theme === 'underground') {
          gMain = '#2890d0'; gLight = '#40b0e8'
        } else if (this.theme === 'castle') {
          gMain = '#909090'; gLight = '#b0b0b0'
        }
        /* 整块一次 fillRect (负坐标由驱动裁剪), 每帧 2 次调用替代 92 次贴图 blit */
        ctx.fillStyle = gLight
        ctx.fillRect(sx, t.y, t.w, Math.min(4, t.h))
        ctx.fillStyle = gMain
        ctx.fillRect(sx, t.y + Math.min(4, t.h), t.w, t.h - Math.min(4, t.h))
      }
    } else if (t.type === 'brick') {
      if (t.bumpT > 0) continue /* 抖动砖走动态层 */
      drawSprite(ctx, BRICK, undefined, sx, t.y, false, themeCM)
    } else if (t.type === 'qblock') {
      if (t.used) {
        drawSprite(ctx, HARD, undefined, sx, t.y, false, themeCM)
      } /* 未用问号块走动态层(闪烁) */
    } else if (t.type === 'hard') {
      drawSprite(ctx, HARD, undefined, sx, t.y, false, themeCM)
    }
  }

  /* 管道: 贴图 (顶盖 + 管身) */
  for (var p = 0; p < this.pipes.length; p++) {
    var pi = this.pipes[p]
    if (pi.x + pi.w < scx || pi.x > scx + VIEW_W + TILE * 2) continue
    var psx = pi.x - scx
    var rows = Math.round(pi.h / TILE)
    drawSprite(ctx, PIPE_TOP_L, undefined, psx, pi.y, false)
    drawSprite(ctx, PIPE_TOP_R, undefined, psx + TILE, pi.y, false)
    for (var pr = 1; pr < rows; pr++) {
      drawSprite(ctx, PIPE_BODY_L, undefined, psx, pi.y + pr * TILE, false)
      drawSprite(ctx, PIPE_BODY_R, undefined, psx + TILE, pi.y + pr * TILE, false)
    }
  }

  /* 旗杆 (小旗在动态层渲染: 原版通关时从杆顶滑下) */
  if (this.flagX > scx - 200 && this.flagX < scx + VIEW_W + TILE * 2 + 200) {
    var fx = this.flagX - scx
    var baseY = WORLD_GROUND_Y * TILE
    ctx.fillStyle = '#d8d8d8'
    ctx.fillRect(fx - 2, baseY - 140, 4, 140)
    ctx.fillStyle = C_COIN
    ctx.beginPath()
    ctx.arc(fx, baseY - 142, 7, 0, 6.283)
    ctx.fill()
    /* 旗杆底座 */
    ctx.fillStyle = C_BRICK
    ctx.fillRect(fx - 8, baseY - 6, 16, 6)
  }

  /* 城堡 */
  if (this.castleX > scx - 300 && this.castleX < scx + VIEW_W + TILE * 2 + 300) {
    this.renderCastle(ctx, this.castleX - scx)
  }
}

Game.prototype.renderCastle = function (ctx, x) {
  var baseY = WORLD_GROUND_Y * TILE
  /* 主体 */
  ctx.fillStyle = C_CASTLE
  ctx.fillRect(x, baseY - 84, 120, 84)
  ctx.fillStyle = C_CASTLE_DARK
  ctx.fillRect(x, baseY - 84, 120, 6)
  /* 垛口 */
  for (var i = 0; i < 5; i++) {
    ctx.fillRect(x + i * 24, baseY - 96, 14, 14)
  }
  /* 塔 */
  ctx.fillRect(x + 16, baseY - 150, 40, 70)
  ctx.fillStyle = C_CASTLE
  ctx.fillRect(x + 20, baseY - 150, 32, 66)
  /* 塔顶 */
  ctx.fillStyle = C_CASTLE_DARK
  ctx.fillRect(x + 18, baseY - 158, 36, 10)
  ctx.fillRect(x + 30, baseY - 168, 12, 10)
  /* 门 */
  ctx.fillStyle = C_BLACK
  ctx.fillRect(x + 44, baseY - 40, 32, 40)
  ctx.fillStyle = '#5d6270'
  ctx.fillRect(x + 44, baseY - 40, 32, 6)
  /* 窗 */
  ctx.fillStyle = C_QB_LIGHT
  ctx.fillRect(x + 12, baseY - 70, 10, 12)
  ctx.fillRect(x + 98, baseY - 70, 10, 12)
}

Game.prototype.renderPlayer = function (ctx, cam) {
  var p = this.player
  if (this.state === 'idle') return
  /* 无敌闪烁 */
  if (this.invuln > 0 && Math.floor(this.invuln / 120) % 2 === 0) return
  var fire = p.power === 'fire'
  var big = p.power === 'super' || fire
  var spr
  if (this.state === 'dead') {
    spr = DEAD
  } else if (!p.onGround) {
    spr = fire ? FIRE_JUMP : big ? BIG_JUMP : SMALL_JUMP
  } else if (p.vx !== 0) {
    var wf = Math.floor(p.walk) % 2
    if (fire) spr = wf === 0 ? FIRE_WALK[0] : FIRE_WALK[1]
    else if (big) spr = wf === 0 ? BIG_WALK[0] : BIG_WALK[1]
    else spr = wf === 0 ? SMALL_WALK[0] : SMALL_WALK[1]
  } else {
    spr = fire ? FIRE_STAND : big ? BIG_STAND : SMALL_STAND
  }
  /* 无敌星: 彩虹闪烁; 火焰: 红白换装 */
  var colorMap = null
  if (p.starTimer > 0) {
    var hue = Math.floor(this.animT / 100) % 4
    var palette = [C_COIN, C_RED, C_LIME, C_BLUE]
    var col = palette[hue]
    colorMap = function (color, ch) {
      if (ch === 'R' || ch === 'M' || ch === 'S') return col
      return color
    }
  } else if (fire) {
    colorMap = { '#e52521': C_FIRE }
  }
  /* 大马里奥贴图 48px 高, 不居中直接画; 小马里奥 24px 居中 */
  var sprScale = big ? 2 : undefined
  drawSprite(ctx, spr, sprScale, p.x - cam, p.y, p.facing < 0, colorMap)
}

Game.prototype.drawCoin = function (ctx, cx, cy, t) {
  /* 简单黄色金币 (圆形) */
  ctx.fillStyle = '#f8b020'
  ctx.beginPath()
  ctx.arc(cx, cy, 7, 0, 6.283)
  ctx.fill()
  ctx.fillStyle = '#e89010'
  ctx.beginPath()
  ctx.arc(cx, cy, 4, 0, 6.283)
  ctx.fill()
}

Game.prototype.renderParticles = function (ctx, cam) {
  for (var i = 0; i < this.particles.length; i++) {
    var pt = this.particles[i]
    var sx = pt.x - cam
    if (pt.kind === 'coinpop') {
      this.drawCoin(ctx, sx, pt.y, 0.6)
    } else if (pt.kind === 'debris') {
      ctx.fillStyle = C_BRICK
      ctx.fillRect(sx - 3, pt.y - 3, 7, 7)
    } else if (pt.kind === 'text') {
      ctx.fillStyle = C_WHITE
      ctx.font = 'bold 14px sans-serif'
      ctx.textAlign = 'center'
      ctx.fillText(pt.text || '1000', sx, pt.y)
    }
  }
}

Game.prototype.renderHUD = function (ctx) {
  ctx.font = 'bold 17px monospace'
  ctx.textAlign = 'left'
  this.hudText(ctx, 'SCORE', 24, 26)
  this.hudText(ctx, pad6(this.score), 24, 48)
  this.hudText(ctx, 'COINS', 400, 26)
  this.hudText(ctx, 'x' + pad2(this.coins), 400, 48)
  ctx.textAlign = 'right'
  this.hudText(ctx, 'TIME', 936, 26)
  this.hudText(ctx, '' + Math.max(0, Math.round(this.time)), 936, 48)
  this.hudText(ctx, 'WORLD ' + this.level, 936, 74)
  ctx.textAlign = 'left'
  /* 生命 (马里奥小头像) */
  this.hudText(ctx, 'x' + this.lives, 96, 26)
  drawSprite(ctx, SMALL_STAND, 1, 52, 10, false)
  /* 强化状态 */
  var p = this.player
  if (p && p.power !== 'small') {
    var pwr = p.starTimer > 0 ? 'STAR ' + Math.ceil(p.starTimer / 1000) :
      p.power === 'fire' ? 'FIRE' : 'SUPER'
    ctx.textAlign = 'right'
    this.hudText(ctx, pwr, 936, 100)
    ctx.textAlign = 'left'
  }
}

Game.prototype.hudText = function (ctx, text, x, y) {
  ctx.fillStyle = C_BLACK
  ctx.fillText(text, x + 2, y + 2)
  ctx.fillStyle = C_WHITE
  ctx.fillText(text, x, y)
}

Game.prototype.renderControls = function (ctx) {
  if (this.state !== 'playing') return
  var t = this.animT / 400
  var pulse = 0.5 + 0.5 * Math.sin(t)
  /* 左区 */
  if (this.input.left) {
    ctx.fillStyle = 'rgba(255,255,255,0.25)'
    ctx.fillRect(0, VIEW_H - 60, 320, 60)
  }
  this.arrow(ctx, 160, VIEW_H - 32, -1, this.input.left ? 1 : 0.35 + pulse * 0.25)
  /* 右区 */
  if (this.input.right) {
    ctx.fillStyle = 'rgba(255,255,255,0.25)'
    ctx.fillRect(320, VIEW_H - 60, 320, 60)
  }
  this.arrow(ctx, 480, VIEW_H - 32, 1, this.input.right ? 1 : 0.35 + pulse * 0.25)
  /* 跳跃区 */
  if (this.input.jump) {
    ctx.fillStyle = 'rgba(255,255,255,0.25)'
    ctx.fillRect(640, VIEW_H - 60, 320, 60)
  }
  ctx.fillStyle = 'rgba(255,255,255,' + (this.input.jump ? 1 : 0.55 + pulse * 0.25) + ')'
  ctx.font = 'bold 20px sans-serif'
  ctx.textAlign = 'center'
  ctx.fillText('JUMP', 800, VIEW_H - 18)
  ctx.textAlign = 'left'
  /* fire 形态提示 (右上角热区按钮) */
  var pw = this.player ? this.player.power : 'small'
  if (pw === 'fire') {
    var fa = 0.6 + pulse * 0.3
    ctx.fillStyle = 'rgba(255,180,40,' + fa + ')'
    ctx.strokeStyle = 'rgba(255,225,130,' + fa + ')'
    ctx.lineWidth = 2
    ctx.beginPath()
    ctx.rect(832, 50, 104, 56)
    ctx.fill()
    ctx.stroke()
    ctx.fillStyle = '#3a2a00'
    ctx.font = 'bold 18px sans-serif'
    ctx.textAlign = 'center'
    ctx.fillText('FIRE', 884, 86)
    ctx.textAlign = 'left'
  }
}

Game.prototype.arrow = function (ctx, cx, cy, dir, alpha) {
  ctx.fillStyle = 'rgba(255,255,255,' + alpha + ')'
  var s = 12
  ctx.beginPath()
  ctx.moveTo(cx - dir * s, cy - s)
  ctx.lineTo(cx + dir * s * 0.6, cy)
  ctx.lineTo(cx - dir * s, cy + s)
  ctx.closePath()
  ctx.fill()
}

Game.prototype.renderOverlay = function (ctx) {
  if (this.state === 'dead') {
    ctx.fillStyle = 'rgba(0,0,0,0.25)'
    ctx.fillRect(0, 0, VIEW_W, VIEW_H)
  } else if (this.state === 'clear') {
    ctx.fillStyle = 'rgba(0,0,0,0.35)'
    ctx.fillRect(0, 0, VIEW_W, VIEW_H)
    ctx.fillStyle = C_WHITE
    ctx.font = 'bold 30px monospace'
    ctx.textAlign = 'center'
    ctx.fillText('COURSE CLEAR!', VIEW_W / 2 + 2, 140 + 2)
    ctx.fillStyle = C_QB_LIGHT
    ctx.fillText('COURSE CLEAR!', VIEW_W / 2, 140)
    ctx.textAlign = 'left'
  } else if (this.state === 'gameover') {
    ctx.fillStyle = 'rgba(0,0,0,0.55)'
    ctx.fillRect(0, 0, VIEW_W, VIEW_H)
    ctx.font = 'bold 34px monospace'
    ctx.textAlign = 'center'
    ctx.fillStyle = C_WHITE
    ctx.fillText('GAME OVER', VIEW_W / 2, 132)
    ctx.font = 'bold 18px monospace'
    ctx.fillStyle = C_WHITE
    ctx.fillText('SCORE ' + pad6(this.score), VIEW_W / 2, 170)
    ctx.textAlign = 'left'
  }
}

/* ---------- 标题背景 (给页面用) ---------- */

Game.prototype.renderTitle = function (levelText) {
  var ctx = this.ctx
  ctx.fillStyle = C_SKY
  ctx.fillRect(0, 0, VIEW_W, VIEW_H)
  this.renderBackdrop(ctx, this.animT * 0.05)
  /* 地面条 */
  ctx.fillStyle = C_GROUND_TOP
  ctx.fillRect(0, 226, VIEW_W, 12)
  ctx.fillStyle = C_GROUND_BODY
  ctx.fillRect(0, 238, VIEW_W, 28)
  /* 标题 */
  ctx.font = 'bold 52px monospace'
  ctx.textAlign = 'center'
  ctx.fillStyle = C_BLACK
  ctx.fillText('SUPER MARIO', VIEW_W / 2 + 3, 96 + 3)
  ctx.fillStyle = C_RED
  ctx.fillText('SUPER MARIO', VIEW_W / 2, 96)
  ctx.font = 'bold 20px monospace'
  ctx.fillStyle = C_QB_LIGHT
  ctx.fillText('WIFI EDITION', VIEW_W / 2, 128)
  ctx.textAlign = 'left'
  /* 角色 */
  drawSprite(ctx, SMALL_STAND, 3, 300, 158, false)
  drawSprite(ctx, SPR_GOOMBA, 2, 620, 164, false)
}

function pad2(n) {
  n = Math.max(0, Math.floor(n))
  return n < 10 ? '0' + n : '' + n
}

function pad6(n) {
  n = Math.max(0, Math.floor(n))
  var s = '' + n
  while (s.length < 6) s = '0' + s
  return s
}

export function createGame(ctx, hooks) {
  return new Game(ctx, hooks)
}
