"""渲染"笔记列表 · 堆叠卡"那版效果图：headless Chrome 出图 → 按内容裁边 → 存同名 PNG。

用法：python3 docs/工具/画-堆叠卡效果图.py
裁边判据抄 画-效果图对实测.py：body 底色是 #DEDDD8，最底一行还是底色才说明窗口给够了高度；
不够会打印一句提醒，而不是默默把最后一屏切掉。
"""
import os
import subprocess
import sys
from PIL import Image

ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), '../..'))
HTML = os.path.join(ROOT, 'docs/design/笔记列表-堆叠卡/堆叠卡-中英双版.html')
OUT = os.path.join(ROOT, 'docs/design/笔记列表-堆叠卡/堆叠卡-中英双版.png')
CHROME = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome'
BODY_BG = (222, 221, 216)
W, H = 2460, 6200

subprocess.run([CHROME, '--headless', '--disable-gpu', '--hide-scrollbars',
                '--force-device-scale-factor=1', '--allow-file-access-from-files',
                f'--window-size={W},{H}', '--screenshot=/tmp/stack_mock.png',
                'file://' + HTML], check=True,
               stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
im = Image.open('/tmp/stack_mock.png').convert('RGB')
w, h = im.size
px = im.load()
bg = lambda p: all(abs(p[i] - BODY_BG[i]) < 6 for i in range(3))
if not all(bg(px[x, h - 1]) for x in range(0, w, 17)):
    print('注意：窗口最底一行仍有内容，被裁了——把 H 加大')
colbg = lambda x: all(bg(px[x, y]) for y in range(0, h, 19))
rowbg = lambda y: all(bg(px[x, y]) for x in range(0, w, 19))
l = next(x for x in range(w) if not colbg(x))
r = next(x for x in range(w - 1, -1, -1) if not colbg(x))
t = next(y for y in range(h) if not rowbg(y))
b = next(y for y in range(h - 1, -1, -1) if not rowbg(y))
im.crop((max(0, l - 12), max(0, t - 12), min(w, r + 12), min(h, b + 12))).save(OUT)
print(f'→ {OUT}　{(r - l + 24)}×{(b - t + 24)}')
