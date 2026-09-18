#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""把 github.com/l644738595/Super-Mario 的贴图转成 falcon 引擎用的字符矩阵精灵
输出: ui/src/services/game/sprites.js
"""
import io
from PIL import Image

SRC = '/tmp/smb_ref/img'
SRC2 = '/tmp/smb_ref/img/img'
OUT = '/home/user/Doubao/chats/30415052883769602/super-mario/ui/src/services/game/sprites.js'

# (输出名, 源路径, 目标字符矩阵尺寸(w,h), 帧数(取前N帧))
JOBS = [
    # 角色 small: 32x32 -> 12x12 (scale2 => 24x24)
    ('SMALL_STAND', f'{SRC2}/basePerson.png', (12, 12), 1),
    ('SMALL_WALK', f'{SRC2}/basePerson.gif', (12, 12), 3),
    ('SMALL_JUMP', f'{SRC2}/basePersonUp.png', (12, 12), 1),
    # 大形态: 32x64 -> 12x24 (scale2 => 24x48)
    ('BIG_STAND', f'{SRC2}/bigPerson.png', (12, 24), 1),
    ('BIG_WALK', f'{SRC2}/bigPerson.gif', (12, 24), 3),
    ('BIG_JUMP', f'{SRC2}/bigPersonUp.png', (12, 24), 1),
    # 火形态
    ('FIRE_STAND', f'{SRC2}/bulletPerson.png', (12, 24), 1),
    ('FIRE_WALK', f'{SRC2}/bulletPerson.gif', (12, 24), 3),
    ('FIRE_JUMP', f'{SRC2}/bulletPersonUp.png', (12, 24), 1),
    # 死亡
    ('DEAD', f'{SRC2}/diePerson.png', (12, 12), 1),
    # 道具/块
    ('COIN', f'{SRC}/gold.gif', (12, 12), 6),
    ('FLOWER', f'{SRC}/flower.gif', (12, 12), 4),
    ('MUSHROOM', f'{SRC2}/largenMushroom.png', (12, 12), 1),
    ('QBLOCK', f'{SRC}/map-ask.gif', (12, 12), 6),
    ('HARD', f'{SRC2}/map-stone.png', (12, 12), 1),
    ('BRICK', f'{SRC}/macadam.gif', (12, 12), 1),
    ('GROUND', f'{SRC2}/map-land.png', (12, 12), 1),
    ('PIPE_TOP_L', f'{SRC2}/pipelineTopL.png', (12, 12), 1),
    ('PIPE_TOP_R', f'{SRC2}/pipelineTopR.png', (12, 12), 1),
    ('PIPE_BODY_L', f'{SRC2}/pipelineL.png', (12, 12), 1),
    ('PIPE_BODY_R', f'{SRC2}/pipelineR.png', (12, 12), 1),
    # 背景: 原版风云/山 (从 SMB NES 1-1 全图抠取)
    ('CLOUD', f'{SRC2}/CLOUD.png', (16, 12), 1),
    ('CLOUD_S', f'{SRC2}/CLOUD_S.png', (16, 12), 1),
    ('HILL', f'{SRC2}/HILL.png', (28, 17), 1),
]


def load_frames(path, limit):
    im = Image.open(path)
    frames = []
    for i in range(min(im.n_frames if hasattr(im, 'n_frames') else 1, limit)):
        im.seek(i)
        frames.append(im.convert('RGBA'))
    return frames


def palette_from(frames_all):
    """拼接所有帧像素做全局量化, 返回 (调色板列表[(r,g,b)], 映射)"""
    from PIL import Image as _I
    imgs = []
    for frames in frames_all:
        for fr in frames:
            imgs.append(fr)
    # 拼接
    w = sum(im.size[0] for im in imgs)
    h = max(im.size[1] for im in imgs)
    sheet = _I.new('RGBA', (w, h), (0, 0, 0, 0))
    x = 0
    for im in imgs:
        sheet.paste(im, (x, 0))
        x += im.size[0]
    # 提取不透明像素
    px = sheet.load()
    colors = []
    for yy in range(h):
        for xx in range(w):
            r, g, b, a = px[xx, yy]
            if a > 100:
                colors.append((r, g, b))
    # 用 PIL 量化: 构造 1xN 图
    n = len(colors)
    if n == 0:
        return [(0, 0, 0)], []
    import math
    tmp = _I.new('RGB', (1, n))
    tmp.putdata(colors)
    q = tmp.quantize(colors=24, method=_I.Quantize.MEDIANCUT)
    raw = q.getpalette() or []
    pal = [(raw[i * 3], raw[i * 3 + 1], raw[i * 3 + 2]) for i in range(len(raw) // 3)]
    return pal, None


def nearest(c, pal):
    r, g, b = c
    best = 0
    bd = 1 << 30
    for i, (pr, pg, pb) in enumerate(pal):
        d = (r - pr) ** 2 + (g - pg) ** 2 + (b - pb) ** 2
        if d < bd:
            bd = d
            best = i
    return best


def to_matrix(fr, tw, th, pal):
    im = fr.resize((tw, th), Image.NEAREST)
    px = im.load()
    rows = []
    for y in range(th):
        row = []
        for x in range(tw):
            r, g, b, a = px[x, y]
            if a <= 100:
                row.append('.')
            else:
                idx = nearest((r, g, b), pal)
                row.append('0123456789abcdefghijklmnopqrstuvwxyz'[idx])
        rows.append(''.join(row))
    return rows


def main():
    # 先加载所有帧
    loaded = {}
    for name, path, size, nf in JOBS:
        loaded[name] = load_frames(path, nf)
    frames_all = [loaded[n] for n, _, _, _ in JOBS]
    pal, _ = palette_from(frames_all)

    lines = []
    lines.append('/* 自动生成 (scripts/sprites_gen.py): 贴图来自 github.com/l644738595/Super-Mario */')
    lines.append('')
    lines.append('export var SPRITE_MAP = {')
    for i, (pr, pg, pb) in enumerate(pal):
        ch = '0123456789abcdefghijklmnopqrstuvwxyz'[i]
        lines.append("  '%s': '#%02x%02x%02x'," % (ch, pr, pg, pb))
    lines.append('}')
    lines.append('')

    for name, path, size, nf in JOBS:
        tw, th = size
        frames = loaded[name]
        if len(frames) == 1:
            lines.append('export var %s = %s' % (name, _fmt(to_matrix(frames[0], tw, th, pal))))
        else:
            lines.append('export var %s = [' % name)
            for fr in frames:
                lines.append('  ' + _fmt(to_matrix(fr, tw, th, pal)) + ',')
            lines.append(']')
        lines.append('')

    with io.open(OUT, 'w', encoding='utf-8') as f:
        f.write('\n'.join(lines))
    print('written', OUT, 'palette', len(pal))


def _fmt(rows):
    out = ['[']
    for r in rows:
        out.append("    '%s'," % r)
    out.append('  ]')
    return '\n'.join(out)


if __name__ == '__main__':
    main()
