#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""从原版 SMB 全图截图提取关卡布局, 输出 levels.js 段格式。
截图: 224px 高, 16px 瓦片, HUD 占顶部 2 行(32px)。
我们坐标系: TILE=24, 地面顶 y=10。
  our_y = (shot_y - 32)/16 + 2   (shot_row=8 地面顶 -> our_y=10)
  our_x = shot_x / 16
"""
import sys, io
from PIL import Image

def analyze(path, theme='sky'):
    im = Image.open(path).convert('RGB')
    W, H = im.size
    px = im.load()
    TW = 16  # 截图瓦片
    cols = W // TW
    rows = (H - 32) // TW  # 游戏区行数 (从 y=32 开始)
    print(f'# {path}: {cols} cols x {rows} game rows (y offset 32px)')

    # 分类每个瓦片
    def tile_kind(col, row):
        x0, y0 = col * TW, 32 + row * TW
        # 采样中心
        cx, cy = x0 + 8, y0 + 8
        if cx >= W or cy >= H:
            return '.'
        r, g, b = px[cx, cy]
        # 天空 (浅蓝 ~104,160,230)
        if r > 150 and g > 150 and b > 180: return '.'
        # 黑色背景 (地下/城堡)
        if r < 30 and g < 30 and b < 30: return '.'
        # 水下蓝
        if b > 150 and r < 100 and g < 180: return '.'
        # 地面/砖 (橙棕 ~196,90,20)
        if r > 150 and g > 60 and g < 140 and b < 80: return 'B'
        # 问号块 (黄橙 ~230,160,40)
        if r > 200 and g > 130 and g < 190 and b < 80: return 'Q'
        # 管道绿
        if g > 120 and r < 80 and b < 80: return 'P'
        # 金币黄
        if r > 200 and g > 170 and b < 80: return 'C'
        # 山绿 (深绿)
        if g > 80 and g > r + 40 and g > b + 40: return 'M'
        # 城堡砖 (红棕 ~160,60,40)
        if r > 120 and g < 80 and b < 80: return 'K'
        # 其他非空
        return '?'

    # 打印每行的瓦片类型 (仅地面+上方)
    for row in range(rows):
        line = ''
        for col in range(cols):
            line += tile_kind(col, row)
        if 'B' in line or 'Q' in line or 'P' in line or 'K' in line or '?' in line:
            print(f'  row{row:2d}: {line}')

if __name__ == '__main__':
    analyze(sys.argv[1])
