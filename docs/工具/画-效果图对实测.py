"""把效果图重渲染、裁边、量一遍几何，并和模拟器实测拼成一张对比图。

用法：python3 docs/工具/画-效果图对实测.py
效果图口径与 create.wxss 同一条：一屏 = 外框 184 + 视口 1506 = 1690，1px 当 1rpx。
"""
import subprocess
import sys
from PIL import Image, ImageDraw

DIR = 'docs/design/统一录入条'
HTML = f'{DIR}/首页统一录入-中英双版.html'
OUT = f'{DIR}/首页统一录入-中英双版.png'
CMP = f'{DIR}/效果图对实测-收起态.png'
REAL = f'{DIR}/实测/实测-1-收起态.png'
CHROME = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome'
PAGE_H = 1690
BODY_BG = (222, 221, 216)


def render():
    # 标注屏是自适应高度，整版比一块屏高得多；窗口给不够会把最后一屏裁掉
    import os
    subprocess.run([CHROME, '--headless', '--disable-gpu', '--hide-scrollbars',
                    '--force-device-scale-factor=1', '--allow-file-access-from-files',
                    '--window-size=4020,11000', '--screenshot=/tmp/mock_raw.png',
                    'file://' + os.path.abspath(HTML)], check=True,
                   stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
    im = Image.open('/tmp/mock_raw.png').convert('RGB')
    w, h = im.size
    px = im.load()
    bg = lambda p: all(abs(p[i] - BODY_BG[i]) < 6 for i in range(3))
    if not all(bg(px[x, h - 1]) for x in range(0, w, 17)):
        print('注意：窗口最底一行仍有内容，被裁了——把 --window-size 的高度加大')
    colbg = lambda x: all(bg(px[x, y]) for y in range(0, h, 19))
    rowbg = lambda y: all(bg(px[x, y]) for x in range(0, w, 19))
    l = next(x for x in range(w) if not colbg(x))
    r = next(x for x in range(w - 1, -1, -1) if not colbg(x))
    t = next(y for y in range(h) if not rowbg(y))
    b = next(y for y in range(h - 1, -1, -1) if not rowbg(y))
    out = im.crop((max(0, l - 12), max(0, t - 12), min(w, r + 12), min(h, b + 12)))
    out.save(OUT)
    return out


def paper(p):
    return p[0] > 225 and 225 < p[1] < 250 and 210 < p[2] < 240 and abs(p[0] - p[1]) < 16 and abs(p[1] - p[2]) < 18


def phone(im):
    """返回第一屏手机框的 (左, 上, 右)，靠那条 #181A20 状态栏认。"""
    px = im.load()
    dark = lambda p: p[0] < 40 and p[1] < 40 and p[2] < 45
    top = next(y for y in range(im.size[1]) if sum(1 for x in range(20, 700) if dark(px[x, y])) > 300)
    y = top + 60
    left = next(x for x in range(im.size[0]) if dark(px[x, y]))
    right = left
    while dark(px[right + 1, y]):
        right += 1
    return left, top, right


def bar_span(box):
    """在手机框里找纸白条：取中间那一列区间，避开圆角和小圆。"""
    px = box.load()
    rows = [y for y in range(box.size[1]) if sum(1 for x in range(300, 420) if paper(px[x, y])) > 100]
    return rows[0], rows[-1]


def main():
    m = render()
    l, t, r = phone(m)
    box = m.crop((l, t, r + 1, t + PAGE_H))
    top, bot = bar_span(box)
    print(f'效果图  条顶 {top - 184}  条底 {bot - 184}   （代码：1102 / 1230）')
    real = Image.open(REAL).convert('RGB')
    b2 = real.resize((int(real.size[0] * PAGE_H / real.size[1]), PAGE_H), Image.LANCZOS)
    gap = 48
    out = Image.new('RGB', (box.size[0] + b2.size[0] + gap * 3, PAGE_H + 70), '#DEDDD8')
    out.paste(box, (gap, gap))
    out.paste(b2, (gap * 2 + box.size[0], gap))
    d = ImageDraw.Draw(out)
    d.text((gap + 6, 18), '效果图（与代码同口径）', fill='#23252C')
    d.text((gap * 2 + box.size[0] + 6, 18), '模拟器实测', fill='#23252C')
    out.save(CMP)
    print('交付', OUT, m.size, '和', CMP, out.size)


if __name__ == '__main__':
    sys.exit(main())
