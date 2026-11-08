#!/usr/bin/env python3
"""生成六张专利附图（纯黑白线条，符合审查指南第一部分第一章 4.3／4.6）。

形式约束：
- 线条与文字一律 #000，底色一律 #fff，不用灰阶／彩色／阴影／渐变
- 图号不画进图片（《关于规范提交专利电子申请的指引》：图号应以文字形式表示，
  不应包含在图片中）；图号在 WORD 转 XML 编辑器五书模板里以正文文字写在图下方
- 图内文字为中文，必要处括注原文
- 不使用附图标记（框内直接给文字），规避"标记双向一致"校验
- 画布高度按实际墨迹下沿收边，不留空尾
"""
import math
import os
import re

HERE = os.path.dirname(os.path.abspath(__file__))
FONT = "Songti SC, STSong, SimSun, serif"
CJK = 1.0
ASCII = 0.55
MINFS = 12.0   # 字号下限（用户拍板丙方案）：A4 满幅约 2.0mm，再小印刷不可读


def text_w(s, fs):
    return sum(fs * (CJK if ord(c) > 0x2E80 else ASCII) for c in s)


def esc(s):
    return s.replace("&", "&amp;").replace("<", "&lt;").replace(">", "&gt;")


class Fig:
    def __init__(self, w):
        self.w = w
        self.h = 0
        self.body = []

    def box(self, cx, cy, w, h, text, fs=13, rounded=False, sw=1.6):
        x, y = cx - w / 2, cy - h / 2
        rx = f' rx="{h / 2:g}" ry="{h / 2:g}"' if rounded else ""
        self.body.append(
            f'<rect x="{x:g}" y="{y:g}" width="{w:g}" height="{h:g}"{rx} '
            f'fill="#fff" stroke="#000" stroke-width="{sw}"/>'
        )
        self.text(cx, cy, text, fs)

    def diamond(self, cx, cy, w, h, text, fs=13, sw=1.6):
        pts = (f"{cx:g},{cy - h / 2:g} {cx + w / 2:g},{cy:g} "
               f"{cx:g},{cy + h / 2:g} {cx - w / 2:g},{cy:g}")
        self.body.append(
            f'<polygon points="{pts}" fill="#fff" stroke="#000" stroke-width="{sw}"/>'
        )
        self.text(cx, cy, text, fs)

    def text(self, cx, cy, text, fs, lh=None):
        fs = max(fs, MINFS)
        lines = text.split("\n")
        lh = lh or fs * 1.42
        y0 = cy - lh * (len(lines) - 1) / 2 + fs * 0.36
        for i, ln in enumerate(lines):
            self.body.append(
                f'<text x="{cx:g}" y="{y0 + i * lh:g}" text-anchor="middle" '
                f'font-family="{FONT}" font-size="{fs}" fill="#000">{esc(ln)}</text>'
            )

    def label(self, x, y, text, fs=12, anchor="middle"):
        fs = max(fs, MINFS)
        self.body.append(
            f'<text x="{x:g}" y="{y:g}" text-anchor="{anchor}" '
            f'font-family="{FONT}" font-size="{fs}" fill="#000">{esc(text)}</text>'
        )

    def _pad(self, x, y, text, fs):
        tw = text_w(text, fs)
        self.body.append(
            f'<rect x="{x - tw / 2 - 3:g}" y="{y - fs + 1:g}" width="{tw + 6:g}" '
            f'height="{fs + 5:g}" fill="#fff" stroke="none"/>'
        )

    def arrow(self, pts, text=None, tx=None, ty=None, fs=12):
        fs = max(fs, MINFS)
        d = "M " + " L ".join(f"{x:g} {y:g}" for x, y in pts)
        self.body.append(
            f'<path d="{d}" fill="none" stroke="#000" stroke-width="1.6" '
            f'marker-end="url(#ah)"/>'
        )
        if text:
            x = tx if tx is not None else (pts[0][0] + pts[-1][0]) / 2
            y = ty if ty is not None else (pts[0][1] + pts[-1][1]) / 2 - 4
            self._pad(x, y + 3, text, fs)
            self.label(x, y + 3, text, fs)

    def line(self, pts, dashed=False, sw=1.6):
        d = "M " + " L ".join(f"{x:g} {y:g}" for x, y in pts)
        dash = ' stroke-dasharray="6 4"' if dashed else ""
        self.body.append(
            f'<path d="{d}" fill="none" stroke="#000" stroke-width="{sw}"{dash}/>'
        )

    def ink_bottom(self):
        """实际墨迹的最低 y（含文字下伸部），用于收边画布。"""
        bottom = 0.0
        for b in self.body:
            if b.startswith("<rect"):
                y = float(re.search(r'\by="(-?[\d.]+)"', b).group(1))
                h = float(re.search(r'height="([\d.]+)"', b).group(1))
                bottom = max(bottom, y + h)
            elif b.startswith("<polygon"):
                ys = [float(v) for v in re.findall(r"-?[\d.]+", b[b.index("points="):])]
                bottom = max(bottom, max(ys[1::2]))
            elif b.startswith("<path"):
                ys = [float(v) for v in re.findall(r"-?[\d.]+", b[b.index('d="'):])]
                bottom = max(bottom, max(ys[1::2]))
            elif b.startswith("<text"):
                y = float(re.search(r'\by="(-?[\d.]+)"', b).group(1))
                fs = float(re.search(r'font-size="([\d.]+)"', b).group(1))
                bottom = max(bottom, y + fs * 0.28)
        return bottom

    def save(self, name):
        self.h = math.ceil(self.ink_bottom() + 26)
        svg = f'''<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" width="{self.w}" height="{self.h}" viewBox="0 0 {self.w} {self.h}">
  <defs>
    <marker id="ah" markerWidth="9" markerHeight="7" refX="8.5" refY="3.5" orient="auto">
      <polygon points="0 0, 9 3.5, 0 7" fill="#000"/>
    </marker>
  </defs>
  <rect x="0" y="0" width="{self.w}" height="{self.h}" fill="#fff" stroke="none"/>
{chr(10).join("  " + b for b in self.body)}
</svg>
'''
        path = os.path.join(HERE, name)
        with open(path, "w", encoding="utf-8") as f:
            f.write(svg)
        return path


W = 880
AX = 250   # 图 1：A 链列中心
BX = 640   # 图 1：B 链列中心


def fig1():
    f = Fig(W)

    f.box(W / 2, 46, 320, 40, "用户在客户端提交多源内容", 14, rounded=True)
    f.arrow([(W / 2, 66), (W / 2, 96)])
    f.box(W / 2, 132, 480, 62,
          "识别本次提交的两类处理对象：可由原件重算的语义派生数据\n／一经丢失即不可恢复的原件数据", 13)
    f.arrow([(W / 2 - 110, 163), (AX, 220)])
    f.arrow([(W / 2 + 110, 163), (BX, 220)])

    fy = 248
    f.box(AX, fy, 330, 48, "语义抽取链（A 链）\n发起首个网络请求", 13)
    f.box(BX, fy, 330, 48, "建立原件留存链（B 链）的异步\n任务句柄，且不对其执行等待", 13)
    f.arrow([(BX - 165, fy), (AX + 165, fy)], "先建立句柄", ty=fy - 13)
    f.line([(48, fy + 40), (48, 1030)], dashed=True, sw=1.1)
    f.line([(852, fy + 40), (852, 1030)], dashed=True, sw=1.1)

    # ---------- A 链 ----------
    y = 344
    f.box(AX, y, 330, 60, "两阶段传输：暂存阶段逐份写入\n服务端易失性暂存区（多级准入\n治理，详见图 5），返回批次标识", 11.5)
    f.arrow([(AX, y + 30), (AX, y + 58)])
    y = 440
    f.box(AX, y, 330, 46, "处理阶段凭批次标识投递异步\n任务队列，返回任务标识", 12)
    f.arrow([(AX, y + 23), (AX, y + 55)])
    y = 534
    f.box(AX, y, 330, 66, "工作进程：像素量前置准入 →\n光学字符识别（互斥锁串行）→\n语言模型推理（详见图 2）", 11.5)
    f.arrow([(AX, y + 33), (AX, y + 61)])
    y = 640
    f.box(AX, y, 330, 82,
          "推理可用时产出结构化知识数据；\n不可用时降级写入——以原始文本首\n个非空行的定长前缀充当标题，余\n字段置空并附降级标记", 11.5)
    f.arrow([(AX, y + 41), (AX, y + 69)])
    y = 748
    f.box(AX, y, 330, 46, "持久化并返回记录标识\n（两种情形下记录均被持久化）", 12)

    # ---------- B 链 ----------
    y = 344
    f.box(BX, y, 330, 40, "以串行方式取本批下一份图像", 13)
    f.arrow([(BX, y + 20), (BX, y + 50)])
    y = 434
    f.box(BX, y, 330, 66, "按质量阶梯逐档导出至体积达标\n或档位用尽；压缩不可完成时输出\n未经压缩的原始图像数据\n（两级退路，详见图 3）", 11.5)
    f.arrow([(BX, y + 33), (BX, y + 61)])
    y = 540
    f.box(BX, y, 330, 60, "客户端直传至云对象存储；直传\n失败时输出空值而不抛出异常，\n调用方跳过该份并继续下一份", 11.5)
    f.arrow([(BX, y + 30), (BX, y + 58)])
    y = 636
    f.box(BX, y, 330, 40, "收集该份的存储标识", 13)
    f.arrow([(BX, y + 20), (BX, y + 50)])
    y = 722
    f.diamond(BX, y, 300, 78, "本批是否还有\n未处理的图像？", 12)
    f.arrow([(BX - 150, y), (445, y), (445, 344), (BX - 165, 344)], "是")

    # ---------- 汇合 ----------
    f.label(440, 1000, "两链执行区间在时间上重叠", 12)
    jy = 1046
    f.arrow([(AX, 771), (AX, jy - 20)])
    f.arrow([(BX, y + 39), (BX, jy - 20)], "否", tx=BX + 20)
    f.box(W / 2, jy, 320, 40, "两链均已终止", 13)
    f.arrow([(W / 2, jy + 20), (W / 2, jy + 52)])
    jy = 1148
    f.diamond(W / 2, jy, 350, 80, "A 链是否产出了记录标识？", 13)
    f.box(W / 2 - 230, jy + 108, 300, 46, "引用绑定（详见图 4）", 13)
    f.arrow([(W / 2 - 175, jy), (W / 2 - 230, jy), (W / 2 - 230, jy + 85)], "是")
    f.box(W / 2 + 230, jy + 108, 310, 46, "跨链补偿回滚（详见图 4）", 13)
    f.arrow([(W / 2 + 175, jy), (W / 2 + 230, jy), (W / 2 + 230, jy + 85)], "否")
    return f


def fig2():
    f = Fig(W)
    LX, MX, RX = 110, 390, 670
    f.label(LX, 34, "客户端", 13)
    f.label(MX, 34, "服务端", 13)
    f.label(RX, 34, "异步任务队列工作进程", 13)
    f.line([(30, 46), (850, 46)], sw=1.2)

    # ---------- 客户端 ⇄ 服务端：两阶段传输 ----------
    f.box(LX, 92, 180, 46, "暂存阶段：逐份上传图像\n（受调用频率上限约束）", 10.5)
    f.arrow([(200, 92), (390, 92), (390, 150)], "提交图像", tx=295, ty=84)
    f.box(MX, 176, 200, 52, "按多级内存治理准入后写入\n易失性暂存区（详见图 5）", 10.5)
    f.arrow([(390, 202), (390, 228), (110, 228), (110, 272)], "返回批次标识", tx=250, ty=224)
    f.box(LX, 292, 180, 40, "处理阶段：提交批次标识", 10.5)
    f.arrow([(200, 292), (390, 292), (390, 352)])
    f.box(MX, 372, 200, 40, "整批数据打包入队", 11)
    f.arrow([(490, 372), (670, 372), (670, 458)], "投递任务", tx=580, ty=364)
    f.arrow([(390, 392), (390, 418), (110, 418), (110, 455)], "返回任务标识", tx=250, ty=410)

    f.box(LX, 484, 180, 58, "按预设间隔轮询任务状态，\n直至取得结果或超过最长\n等待时长", 10.5)
    f.box(MX, 484, 200, 58, "读取任务状态记录：返回当前\n状态；已完成时一并返回记录\n标识与降级标记", 10.5)
    f.arrow([(200, 476), (290, 476)], "查询", tx=245, ty=468)
    f.arrow([(290, 500), (200, 500)], "返回状态", tx=245, ty=492)

    # ---------- 工作进程：逐份处理 ----------
    f.box(RX, 484, 230, 52, "取出批次内一份图像，\n读取其宽与高", 11)
    f.arrow([(670, 510), (670, 534)])
    f.diamond(RX, 575, 240, 82, "宽 × 高 是否超过\n预设像素总量阈值？", 11)
    f.arrow([(550, 575), (480, 575)], "是", tx=530, ty=568)
    f.box(MX, 586, 180, 48, "当场拒绝该份\n（在解码之前）", 10.5)
    f.line([(390, 610), (390, 640), (515, 640)], sw=1.6)
    f.arrow([(670, 616), (670, 640)], "否", tx=700, ty=620)

    f.box(RX, 663, 230, 46, "方向元数据校正 → 按识别\n长边阈值等比缩放", 10.5)
    f.arrow([(670, 686), (670, 710)])
    f.box(RX, 730, 230, 40, "获取识别互斥锁", 11)
    f.arrow([(670, 750), (670, 774)])
    f.box(RX, 797, 230, 46, "调用光学字符识别引擎\n（任一时刻至多一个调用）", 10.5)
    f.arrow([(670, 820), (670, 844)])
    f.box(RX, 864, 230, 40, "释放识别互斥锁", 11)

    # 批次回环：释放锁后取下一份，直至批次内各份处理完毕
    f.arrow([(555, 864), (515, 864), (515, 484), (555, 484)])
    f.label(507, 700, "对批次内下一份图像重复", 10.5, anchor="end")

    f.arrow([(670, 884), (670, 908)])
    f.box(RX, 931, 230, 46, "过滤置信度低于阈值的行，\n拼接为带页码标记的全文", 10.5)
    f.arrow([(670, 954), (670, 978)])
    f.box(RX, 998, 230, 40, "调用语言模型推理", 11)
    f.arrow([(670, 1018), (670, 1042)])

    f.diamond(RX, 1083, 240, 82, "推理是否成功？", 11)
    f.arrow([(670, 1124), (670, 1154)], "否", tx=690, ty=1132)
    f.box(RX, 1182, 230, 56, "指数退避后重试\n（最多预设次数，仅对\n可自愈失败类别）", 10.5)
    f.arrow([(555, 1182), (535, 1182), (535, 998), (555, 998)], "未用尽", tx=528, ty=1090)
    f.arrow([(670, 1210), (670, 1234)], "已用尽", tx=690, ty=1220)
    f.box(RX, 1264, 230, 52, "降级写入：首个非空行的\n定长前缀充当标题，余字\n段置空，附降级标记", 10.5)
    f.arrow([(670, 1290), (670, 1303)])
    f.box(RX, 1332, 230, 58, "写入数据库得到记录标识；\n任务标识与记录标识合并写入\n同一任务状态记录", 10.5)
    f.arrow([(790, 1083), (810, 1083), (810, 1332), (785, 1332)], "是", tx=818, ty=1150)

    # ---------- 客户端取得结果 ----------
    f.arrow([(110, 513), (110, 1310)], "持续轮询直至取得结果", tx=110, ty=900)
    f.box(LX, 1332, 180, 44, "取得记录标识与降级标记", 10.5)
    f.arrow([(620, 1361), (620, 1386), (110, 1386), (110, 1354)],
            "任务状态：已完成", tx=370, ty=1378)
    return f


def fig3():
    f = Fig(W)
    CX, RX = 285, 660
    LW = 100    # 左侧回环轨
    BUS = 848   # 右侧汇流轨

    f.box(CX, 52, 330, 40, "以串行方式取本批下一份图像", 13, rounded=True)
    f.arrow([(CX, 72), (CX, 106)])

    f.diamond(CX, 148, 320, 84, "能否读取该份图像的\n原始尺寸信息？", 12)
    f.arrow([(CX, 190), (CX, 244)], "能", tx=CX + 20, ty=215)
    f.arrow([(445, 148), (RX, 148), (RX, 319)], "不能", tx=520, ty=140)
    f.box(RX, 350, 260, 62, "以未经压缩的原始图像数据\n作为本份的输出\n（宁可增大体积也不得丢弃原件）", 10.5)

    f.box(CX, 268, 330, 48, "按长边阈值计算缩放比例，在离屏\n绘图表面上重绘", 11)
    f.arrow([(CX, 292), (CX, 326)])

    f.diamond(CX, 368, 320, 84, "重绘与逐档导出\n是否可完成？", 12)
    f.arrow([(CX, 410), (CX, 468)], "可", tx=CX + 20, ty=437)
    f.arrow([(445, 368), (530, 368)], "不可", tx=487, ty=360)

    f.box(CX, 488, 330, 40, "取质量阶梯中的下一档", 13)
    f.arrow([(CX, 508), (CX, 555)])
    f.box(CX, 578, 330, 46, "以该档质量参数导出为\n有损编码文件", 12)
    f.arrow([(CX, 601), (CX, 636)])

    f.diamond(CX, 678, 320, 84, "能否读取导出文件\n的字节数？", 12)
    f.arrow([(CX, 720), (CX, 756)], "能", tx=CX + 20, ty=736)
    f.arrow([(445, 678), (530, 678)], "不能", tx=487, ty=670)
    f.box(RX, 678, 260, 52, "不拦截：仍将该档导出结果\n作为本份的输出", 10.5)

    f.diamond(CX, 798, 320, 84, "字节数是否不超过\n预设预算阈值？", 12)
    f.arrow([(CX, 840), (CX, 980)], "不超过", tx=CX, ty=905)
    f.arrow([(445, 798), (530, 798)], "超过", tx=487, ty=790)

    f.diamond(RX, 798, 260, 84, "阶梯档位\n是否已用尽？", 12)
    f.arrow([(RX, 840), (RX, 902)], "已用尽", tx=RX, ty=872)
    f.box(RX, 926, 260, 48, "以最低档结果作为本份的输出\n（不丢弃原件）", 10.5)
    f.arrow([(RX, 756), (RX, 730), (500, 730), (500, 488), (450, 488)],
            "未用尽", tx=500, ty=620)

    # 三条退路统一汇入"确定本份的输出"
    f.line([(790, 350), (BUS, 350)], sw=1.6)
    f.line([(790, 678), (BUS, 678)], sw=1.6)
    f.line([(790, 926), (BUS, 926)], sw=1.6)
    f.line([(BUS, 350), (BUS, 1000)], sw=1.6)
    f.arrow([(BUS, 1000), (450, 1000)])

    f.box(CX, 1000, 330, 40, "确定本份的输出", 13)
    f.arrow([(CX, 1020), (CX, 1050)])
    f.box(CX, 1070, 330, 40, "客户端直传至云对象存储", 13)
    f.arrow([(CX, 1090), (CX, 1120)])

    f.diamond(CX, 1160, 300, 80, "直传是否成功？", 12)
    f.arrow([(CX, 1200), (CX, 1240)], "是", tx=CX + 20, ty=1218)
    f.arrow([(435, 1160), (530, 1160)], "否", tx=482, ty=1152)
    f.box(RX, 1130, 260, 62, "输出空值且不向调用方抛出\n异常；调用方跳过该份并继续\n处理下一份", 10.5)
    f.arrow([(RX, 1161), (RX, 1352), (435, 1352)], "跳过该份", tx=550, ty=1344)

    f.box(CX, 1260, 330, 40, "记录该份的存储标识", 13)
    f.arrow([(CX, 1280), (CX, 1311)])

    f.diamond(CX, 1352, 300, 82, "本批是否还有\n未处理的图像？", 12)
    f.arrow([(135, 1352), (LW, 1352), (LW, 52), (120, 52)], "是", tx=LW, ty=700)
    f.arrow([(CX, 1393), (CX, 1430)], "否", tx=CX + 20, ty=1410)
    f.box(CX, 1450, 330, 40, "输出本批的存储标识集合", 13, rounded=True)
    return f


def fig4():
    f = Fig(W)
    CX = 460
    LX, RX = 215, 705
    RAIL = 374      # 两类前置拒绝共用的整批拒绝竖轨

    f.box(CX, 48, 340, 40, "两链均已终止", 13, rounded=True)
    f.arrow([(CX, 68), (CX, 106)])
    f.diamond(CX, 148, 380, 84, "A 链是否产出了记录标识？", 13)
    f.arrow([(270, 148), (LX, 148), (LX, 207)], "是", tx=241, ty=140)
    f.arrow([(650, 148), (RX, 148), (RX, 218)], "否", tx=674, ty=140)

    # ---------- 左支：引用绑定 ----------
    f.box(LX, 230, 300, 46, "调用引用绑定接口，提交\n存储标识集合与记录标识", 10.5)
    f.arrow([(LX, 253), (LX, 283)])
    f.box(LX, 306, 300, 46, "对本次提交的存储标识去重，\n并求其与该记录既有关联之并集", 10.5)
    f.arrow([(LX, 329), (LX, 359)])
    f.diamond(LX, 401, 300, 84, "并集数目是否超过\n预设张数上限？", 10.5)
    f.arrow([(LX, 443), (LX, 473)], "否", tx=LX + 20, ty=458)
    f.box(LX, 496, 300, 46, "取下一条存储标识，以其为键\n查询既有资产行", 10.5)
    f.arrow([(LX, 519), (LX, 549)])
    f.diamond(LX, 591, 300, 84, "既有行是否归属其他账户，\n或已关联至其他记录？", 10.5)
    f.arrow([(LX, 633), (LX, 657)], "否", tx=LX + 20, ty=645)
    f.box(LX, 686, 300, 58, "不存在既有行则新建；存在则\n更新其关联关系、账户标识与\n尺寸、字节数", 10.5)
    f.arrow([(LX, 715), (LX, 745)])
    f.diamond(LX, 787, 300, 84, "本批是否还有未处置的\n存储标识？", 10.5)
    f.arrow([(65, 787), (35, 787), (35, 496), (65, 496)], "是", tx=28, ty=640)
    f.arrow([(LX, 829), (LX, 862)], "否", tx=LX + 20, ty=840)
    f.box(LX, 882, 300, 40, "提交事务，返回已绑定的资产行", 11)
    f.arrow([(LX, 902), (LX, 932)])

    # 两类前置拒绝共用一条竖轨，指向同一个整批拒绝出口
    f.line([(365, 401), (RAIL, 401)], sw=1.6)
    f.line([(365, 591), (RAIL, 591)], sw=1.6)
    f.line([(RAIL, 401), (RAIL, 591)], sw=1.6)
    f.arrow([(RAIL, 496), (400, 496)])
    f.label(382, 488, "是", 10)
    f.box(475, 496, 150, 46, "整批拒绝：本次请求内已\n作出的处置一并不予提交", 10)

    # 绑定失败 → 补偿队列
    f.diamond(LX, 972, 280, 80, "客户端是否收到\n成功响应？", 10.5)
    f.arrow([(LX, 1012), (LX, 1052)], "是", tx=LX + 20, ty=1030)
    f.box(LX, 1072, 280, 40, "引用完整，流程结束", 12, rounded=True)
    f.arrow([(75, 972), (45, 972), (45, 1150), (65, 1150)], "否", tx=52, ty=1050)
    f.box(LX, 1150, 300, 62, "写入客户端非易失性补偿队列：\n同一记录标识合并为一条，总数\n超上限则淘汰最早写入的条目", 10.5)
    f.arrow([(LX, 1181), (LX, 1211)])
    f.box(LX, 1234, 300, 46, "客户端由后台转入前台的生命\n周期事件触发重放", 10.5)
    f.arrow([(LX, 1257), (LX, 1287)])
    f.diamond(LX, 1329, 300, 84, "服务端响应的状态码\n属于哪一类？", 10.5)
    f.line([(LX, 1371), (LX, 1400)], sw=1.6)
    f.line([(140, 1400), (310, 1400)], sw=1.6)
    f.arrow([(140, 1400), (140, 1418)])
    f.arrow([(310, 1400), (310, 1418)])
    f.label(140, 1394, "请求不成立类", 10)
    f.label(310, 1394, "临时不可用类／无响应", 10)
    f.box(140, 1444, 150, 52, "移除该条目\n不再重放", 11)
    f.box(310, 1444, 170, 52, "保留该条目\n等待后续重放", 11)
    f.arrow([(395, 1444), (430, 1444), (430, 1234), (365, 1234)])

    # ---------- 右支：跨链补偿回滚 ----------
    f.box(RX, 246, 280, 56, "取 B 链已成功提交的全部存储\n标识（即无索引指向的孤儿对象）", 10.5)
    f.arrow([(RX, 274), (RX, 330)])
    f.box(RX, 350, 280, 40, "调用云对象存储删除接口", 11)
    f.arrow([(RX, 370), (RX, 402)])
    f.diamond(RX, 444, 280, 84, "删除是否成功，且客户端\n是否具备云存储能力？", 10.5)
    f.arrow([(RX, 486), (RX, 540)], "是", tx=RX + 20, ty=510)
    f.box(RX, 560, 280, 40, "无孤儿对象，流程结束", 12, rounded=True)
    f.arrow([(845, 444), (862, 444), (862, 620), (845, 620)], "否", tx=866, ty=520)
    f.box(RX, 620, 280, 46, "将待删存储标识写入待删队列", 11)
    f.arrow([(RX, 643), (RX, 691)])
    f.box(RX, 716, 280, 50, "与补偿队列共用同一生命周期\n事件重放删除", 10.5)
    f.arrow([(RX, 741), (RX, 772)])
    f.diamond(RX, 812, 280, 80, "删除是否成功？", 11)
    f.arrow([(RX, 852), (RX, 900)], "是", tx=RX + 20, ty=876)
    f.box(RX, 920, 280, 40, "存储侧最终一致", 12, rounded=True)
    f.arrow([(845, 812), (862, 812), (862, 716), (845, 716)], "否", tx=866, ty=764)
    return f


def fig5():
    f = Fig(W)
    CX, RX = 270, 690
    f.box(CX, 50, 350, 40, "客户端提交一份图像至暂存阶段", 13, rounded=True)
    f.arrow([(CX, 70), (CX, 100)])

    def rej(y, text, positive="是", h=44, fs=12):
        f.box(RX, y, 300, h, text, fs)
        f.arrow([(CX + 165, y), (RX - 150, y)], positive)

    f.diamond(CX, 136, 330, 72, "调用频率是否超过\n该账户的上限？", 12)
    rej(136, "拒绝并返回临时错误")
    f.arrow([(CX, 172), (CX, 210)], "否", tx=CX + 20)

    f.diamond(CX, 246, 330, 72, "以固定块长流式读取，累计\n字节数是否超过单份上限？", 11.5)
    rej(246, "当即中止读取并拒绝\n（不待整份读入内存）", h=52)
    f.arrow([(CX, 282), (CX, 320)], "否", tx=CX + 20)

    f.diamond(CX, 356, 330, 72, "依文件头字节序列判定的格式\n是否在可解码白名单内？", 11.5)
    rej(356, "当场拒绝\n不写入暂存区", positive="否", h=52)
    f.arrow([(CX, 392), (CX, 430)], "是", tx=CX + 20)

    f.box(CX, 456, 330, 42, "清扫存活时长已超期的批次", 12)
    f.arrow([(CX, 477), (CX, 504)])

    f.diamond(CX, 548, 330, 88, "所携带的批次标识是否有效\n且归属于当前账户？\n（未携带即视为无效）", 11)
    rej(548, "拒绝")
    f.arrow([(CX, 592), (CX, 622)], "是", tx=CX + 20)

    f.diamond(CX, 658, 330, 72, "是否要求建立新批次，且该账户\n批次数已达上限？", 11.5)
    f.box(RX, 658, 300, 52, "按建立时间淘汰该账户\n自身最旧的批次，不触及\n其他账户的在途批次", 11)
    f.arrow([(CX + 165, 658), (RX - 150, 658)], "是")
    f.line([(RX, 684), (RX, 720), (CX, 720)])
    f.arrow([(CX, 694), (CX, 732)], "否", tx=CX + 20)

    f.diamond(CX, 768, 330, 72, "加入本份后，全局字节占用\n是否超出预算？", 11.5)
    rej(768, "拒绝并返回表示\n暂存已满的状态码", h=52)
    f.arrow([(CX, 804), (CX, 842)], "否", tx=CX + 20)

    f.diamond(CX, 878, 330, 72, "该批的份数是否\n已达上限？", 12)
    rej(878, "当场拒绝")
    f.arrow([(CX, 914), (CX, 952)], "否", tx=CX + 20)

    f.diamond(CX, 988, 330, 72, "该批累计字节数是否\n超过单批上限？", 12)
    rej(988, "当场拒绝")
    f.arrow([(CX, 1024), (CX, 1062)], "否", tx=CX + 20)

    f.box(CX, 1088, 350, 40, "写入易失性暂存区，返回批次标识", 13)
    f.arrow([(CX, 1108), (CX, 1140)])
    f.box(CX, 1166, 350, 46, "处理阶段：整批投递至异步任务队列\n后当即自暂存区移除以释放内存", 12)
    return f


def fig6():
    f = Fig(W)
    colx = [(40, 210), (216, 420), (426, 630), (636, 840)]
    hdr_cy, hdr_h = 54, 36
    row_top, rh, gap = 80, 82, 6

    heads = ["小程序运行环境", "原生移动操作系统环境", "网页浏览器环境"]
    rows = ["异步任务句柄", "离屏绘图表面", "带质量参数的\n有损编码接口",
            "客户端文件直传接口", "非易失性补偿队列", "前台生命周期事件"]
    cols = [
        ["未被等待的\nPromise 对象", "离屏画布组件", "画布导出临时\n文件接口",
         "云存储上传接口", "键值存储项", "应用前台恢复回调"],
        ["未被串联等待的协程\n任务或其作业句柄", "位图绘制上下文",
         "带质量参数的位图\n有损编码接口", "对象存储软件开发\n工具包的上传接口",
         "本地数据库表\n或偏好存储项", "场景激活回调\n或活动恢复回调"],
        ["未被等待的\nPromise 对象", "画布元素或\n离屏画布接口",
         "画布转数据链接或\n转文件对象接口", "凭服务端签发的临时上传\n凭证发起的写入请求",
         "浏览器端索引数据库\n或本地存储项", "页面可见性变更事件\n与窗口聚焦事件"],
    ]
    for (x0, x1), name in zip(colx[1:], heads):
        f.box((x0 + x1) / 2, hdr_cy, x1 - x0, hdr_h, name, 12)
    for i in range(len(rows)):
        cy = row_top + i * (rh + gap) + rh / 2
        x0, x1 = colx[0]
        f.box((x0 + x1) / 2, cy, x1 - x0, rh, rows[i], 11.5)
        for j in range(3):
            x0, x1 = colx[j + 1]
            f.box((x0 + x1) / 2, cy, x1 - x0, rh, cols[j][i], 11)
    return f


def main():
    figs = [
        ("patent-fig1-overall-flow.svg", fig1),
        ("patent-fig2-chain-a.svg", fig2),
        ("patent-fig3-chain-b.svg", fig3),
        ("patent-fig4-bindcompensate.svg", fig4),
        ("patent-fig5-staging-governance.svg", fig5),
        ("patent-fig6-runtime-equivalence.svg", fig6),
    ]
    for name, fn in figs:
        fn().save(name)
        print("OK", name)


if __name__ == "__main__":
    main()
