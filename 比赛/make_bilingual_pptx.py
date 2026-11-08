#!/usr/bin/env python3
"""Generate bilingual (CN+EN) PPTX v2 — 爽图信息流 + 隐形水印 + 商业帝国"""

from pptx import Presentation
from pptx.util import Inches, Pt
from pptx.dml.color import RGBColor
from pptx.enum.text import PP_ALIGN, MSO_ANCHOR
from pptx.enum.shapes import MSO_SHAPE

prs = Presentation()
prs.slide_width = Inches(13.333)
prs.slide_height = Inches(7.5)

PAPER = RGBColor(0xF2, 0xEF, 0xE9)
INK = RGBColor(0x14, 0x16, 0x1A)
CLAY = RGBColor(0xD2, 0x68, 0x3F)
WHITE = RGBColor(0xFF, 0xFF, 0xFF)
GRAY = RGBColor(0x6B, 0x6B, 0x6B)
LIGHT_GRAY = RGBColor(0xE8, 0xE5, 0xDF)
DARK_INK = RGBColor(0x23, 0x25, 0x2C)

TOTAL = 22

def add_bg(slide, color=PAPER):
    bg = slide.background
    fill = bg.fill
    fill.solid()
    fill.fore_color.rgb = color

def tb(slide, left, top, width, height, text, size=18, color=INK, bold=False, align=PP_ALIGN.LEFT, font='Microsoft YaHei'):
    txBox = slide.shapes.add_textbox(Inches(left), Inches(top), Inches(width), Inches(height))
    tf = txBox.text_frame
    tf.word_wrap = True
    p = tf.paragraphs[0]
    p.text = text
    p.font.size = Pt(size)
    p.font.color.rgb = color
    p.font.bold = bold
    p.font.name = font
    p.alignment = align
    return txBox

def bl(slide, items, left=1.0, top=2.0, width=11.0, size=14, color=INK):
    txBox = slide.shapes.add_textbox(Inches(left), Inches(top), Inches(width), Inches(4.5))
    tf = txBox.text_frame
    tf.word_wrap = True
    for i, item in enumerate(items):
        p = tf.paragraphs[0] if i == 0 else tf.add_paragraph()
        p.text = item
        p.font.size = Pt(size)
        p.font.color.rgb = color
        p.font.name = 'Microsoft YaHei'
        p.space_after = Pt(8)
    return txBox

def sec(slide, num, title_cn, title_en=''):
    add_bg(slide)
    n = f'0{num}' if num < 10 else str(num)
    tb(slide, 1.0, 0.6, 2.0, 0.5, n, size=42, color=CLAY, bold=True)
    tb(slide, 1.0, 1.3, 10.0, 0.7, title_cn, size=32, color=INK, bold=True)
    if title_en:
        tb(slide, 1.0, 2.1, 10.0, 0.5, title_en, size=16, color=GRAY, font='Helvetica')

def pg(slide, num):
    tb(slide, 12.0, 7.0, 1.0, 0.4, f'{num}/{TOTAL}', size=10, color=GRAY, align=PP_ALIGN.RIGHT)

def card(slide, x, y, w, h, fill=WHITE, radius=0.05):
    shape = slide.shapes.add_shape(MSO_SHAPE.ROUNDED_RECTANGLE, Inches(x), Inches(y), Inches(w), Inches(h))
    shape.fill.solid()
    shape.fill.fore_color.rgb = fill
    shape.line.fill.background()
    shape.adjustments[0] = radius
    return shape

# ============================================================
# Slide 1: Cover
# ============================================================
slide = prs.slides.add_slide(prs.slide_layouts[6])
add_bg(slide, INK)
tb(slide, 1.5, 1.2, 10.0, 0.6, '2026 微信小程序开发大赛', size=18, color=LIGHT_GRAY)
tb(slide, 1.5, 1.8, 10.0, 0.5, '2026 WeChat Mini Program Development Contest', size=13, color=GRAY, font='Helvetica')
tb(slide, 1.5, 2.8, 10.0, 1.2, '图麦笔记', size=60, color=WHITE, bold=True)
tb(slide, 1.5, 4.2, 10.0, 0.6, 'TuMaiNote', size=28, color=CLAY, font='Helvetica')
tb(slide, 1.5, 4.9, 10.0, 0.6, 'AI Agent 驱动的个人知识管理智能体', size=22, color=LIGHT_GRAY)
tb(slide, 1.5, 5.5, 10.0, 0.5, 'AI Agent for Personal Knowledge Management', size=16, color=GRAY, font='Helvetica')
tb(slide, 1.5, 6.3, 10.0, 0.5, '已上线小程序作品 · 个人开发者  |  Live Mini Program · Individual Developer', size=14, color=GRAY)

# ============================================================
# Slide 2: Problem
# ============================================================
slide = prs.slides.add_slide(prs.slide_layouts[6])
sec(slide, 1, '痛点：收藏 ≠ 可用', 'The Problem: Saved ≠ Usable')

tb(slide, 1.0, 3.0, 5.5, 0.4, '问题 / Problem', size=18, color=CLAY, bold=True)
bl(slide, [
    '用户每天在微信收藏、截图、群聊中积累大量碎片信息',
    '收藏保存的是"入口"，不是内容——找到后仍需重新阅读',
    'Users save articles, screenshots, links daily — but saved ≠ usable',
    'Bookmarks save entry points, not content — still need to re-read',
], left=1.0, top=3.5, width=5.5, size=13)

tb(slide, 7.0, 3.0, 5.5, 0.4, '核心矛盾 / Core Gap', size=18, color=CLAY, bold=True)
bl(slide, [
    '现有笔记工具从空白页开始——但用户手里已有别人的内容',
    'Every note app starts with a blank page — but users already have content',
    '',
    '碎片越多，找回和复用的成本越高',
    'The more you save, the higher the cost of finding and reusing',
], left=7.0, top=3.5, width=5.5, size=13)
pg(slide, 2)

# ============================================================
# Slide 3: Solution
# ============================================================
slide = prs.slides.add_slide(prs.slide_layouts[6])
sec(slide, 2, '解决方案：内容 → 结构 → 卡片', 'The Solution: Content → Structure → Visual Card')

tb(slide, 1.0, 2.8, 11.0, 0.6,
   '图麦笔记：内容采集 → AI 结构化 → 卡片传播——微信小程序线上 2.0.0，iOS App 开发中',
   size=17, color=DARK_INK)
tb(slide, 1.0, 3.3, 11.0, 0.5,
   'WeChat Mini Program: 2.0.0 live since Oct 8, 2026 · 2.1.8 in review (Oct 11) · ICP filing done · notes unlimited',
   size=14, color=GRAY, font='Helvetica')

for i, (cn, en, desc_cn, desc_en) in enumerate([
    ('链接转笔记', 'Link → Note', '粘贴 URL → 提取正文 → AI 提炼 → 结构化笔记', 'Paste URL → extract → AI summarize → structured note'),
    ('截图转笔记', 'Screenshot → Note', '导入图片(≤9张) → 自建 OCR → 同一 AI 链路', 'Import images → self-hosted OCR → same AI pipeline'),
    ('文字转笔记', 'Handwrite', '自己填标题与原文，摘要走同一条提炼链路（10-04 起）', 'You type title + text; the summary runs the same model (since Oct 4, 2026)'),
]):
    x = 0.8 + i * 4.1
    card(slide, x, 4.0, 3.7, 2.8)
    tb(slide, x + 0.2, 4.15, 3.3, 0.4, cn, size=17, color=CLAY, bold=True)
    tb(slide, x + 0.2, 4.55, 3.3, 0.3, en, size=12, color=GRAY, font='Helvetica')
    tb(slide, x + 0.2, 5.0, 3.3, 0.8, desc_cn, size=13, color=DARK_INK)
    tb(slide, x + 0.2, 5.7, 3.3, 0.8, desc_en, size=11, color=GRAY, font='Helvetica')
pg(slide, 3)

# ============================================================
# Slide 4: Output Structure
# ============================================================
slide = prs.slides.add_slide(prs.slide_layouts[6])
sec(slide, 3, '统一笔记结构', 'Unified Note Structure')

tb(slide, 1.0, 2.8, 11.0, 0.5, '三条输入通道汇入同一输出格式 / All three channels converge into one format:', size=16, color=DARK_INK)

for i, (cn, en, desc) in enumerate([
    ('标题', 'Title', '从内容自动生成\nAuto-generated'),
    ('摘要', 'Summary', '2-3 句核心概括\n2-3 sentence core'),
    ('要点', 'Key Points', '3-8 条 AI 提取\n3-8 AI-extracted'),
    ('标签', 'Tags', '3-6 个分类标签\n3-6 category labels'),
]):
    x = 0.8 + i * 3.1
    card(slide, x, 3.6, 2.8, 3.0)
    tb(slide, x + 0.25, 3.8, 2.3, 0.4, cn, size=22, color=CLAY, bold=True)
    tb(slide, x + 0.25, 4.25, 2.3, 0.3, en, size=13, color=GRAY, font='Helvetica')
    tb(slide, x + 0.25, 4.7, 2.3, 1.5, desc, size=14, color=DARK_INK)
pg(slide, 4)

# ============================================================
# Slide 5: AI Agent Pipeline
# ============================================================
slide = prs.slides.add_slide(prs.slide_layouts[6])
sec(slide, 4, 'AI Agent 架构', 'AI Agent Architecture')

stages = [
    ('采集\nIngestion', '链接提取 / OCR\n直接输入'),
    ('预处理\nPreprocess', '40MP 上限\n12K 字截断'),
    ('AI 提炼\nHunyuan', '温度 0.3\n指数退避重试'),
    ('结构化\nOutput', '标题+摘要\n+要点+标签'),
    ('卡片渲染\nCard', '10 套模板\n端侧 Canvas'),
]
for i, (name, desc) in enumerate(stages):
    x = 0.5 + i * 2.5
    shape = slide.shapes.add_shape(MSO_SHAPE.ROUNDED_RECTANGLE, Inches(x), Inches(3.0), Inches(2.2), Inches(1.2))
    shape.fill.solid()
    shape.fill.fore_color.rgb = CLAY if i == 2 else DARK_INK
    shape.line.fill.background()
    shape.adjustments[0] = 0.1
    tf = shape.text_frame
    tf.word_wrap = True
    p = tf.paragraphs[0]
    p.text = name
    p.font.size = Pt(13)
    p.font.bold = True
    p.font.color.rgb = WHITE
    p.alignment = PP_ALIGN.CENTER
    card(slide, x, 4.4, 2.2, 1.2)
    tb(slide, x + 0.1, 4.55, 2.0, 1.0, desc, size=12, color=DARK_INK, align=PP_ALIGN.CENTER)
    if i < 4:
        tb(slide, x + 2.2, 3.2, 0.3, 0.5, '→', size=22, color=CLAY, bold=True, align=PP_ALIGN.CENTER)

tb(slide, 0.8, 6.0, 11.5, 0.8,
   '关键设计 / Key Design：AI 故障不丢数据 · 模型可关闭产品仍可用 · OCR 自建无第三方依赖\n'
   'AI failure never destroys content · Model toggleable · Self-hosted OCR, zero third-party dependency',
   size=13, color=DARK_INK)
pg(slide, 5)

# ============================================================
# Slide 6: Card Templates
# ============================================================
slide = prs.slides.add_slide(prs.slide_layouts[6])
sec(slide, 5, '10 套卡片模板', '10 Card Templates — One Note, Ten Voices')

tb(slide, 0.8, 2.8, 5.8, 0.4, '4 套经典款（清晰优先）/ Classic (Clarity-First)', size=16, color=CLAY, bold=True)
bl(slide, [
    '• 玉版宣 Jade Paper — 深色头带 + 纸白正文 + 编号要点',
    '• 摘句 Verse Slip — 一句话放大浮在白卡上',
    '• 叠翠 Layered Paper — 色块头部 + 头像骑缝',
    '• 素宣信笺 Vertical Letter — 宣纸底、从右往左竖排',
], left=0.8, top=3.4, width=5.8, size=13)

tb(slide, 7.0, 2.8, 5.5, 0.4, '6 套个性款（值得分享）/ Expressive (Share-Worthy)', size=16, color=CLAY, bold=True)
bl(slide, [
    '• 波普分格 Pop Panels — 四格套色重复',
    '• 网点漫画 Ben-Day Comic — 网点 + 套印错位',
    '• 荧光渐变 Acid Gradient — 光晕 + 胶囊要点',
    '• 杂志封面 Magazine Cover — 肖像压在标题下',
    '• 纸间文艺 Paper & Ink — 拱门、衬线、竖排来源',
    '• 规格卡 Spec Sheet — 编号 + 等宽元信息 + 表格线',
], left=7.0, top=3.4, width=5.5, size=13)

tb(slide, 0.8, 6.2, 11.5, 0.5,
   '每套模板有独立构图逻辑，不是换色 / Each template has unique composition logic, not just recolored',
   size=13, color=GRAY, align=PP_ALIGN.CENTER)
pg(slide, 6)

# ============================================================
# Slide 7: 爽图信息流 — 全新商业模式
# ============================================================
slide = prs.slides.add_slide(prs.slide_layouts[6])
add_bg(slide, INK)
tb(slide, 1.0, 0.6, 2.0, 0.5, '06', size=42, color=CLAY, bold=True)
tb(slide, 1.0, 1.3, 11.0, 0.7, '爽图信息流：打破统一信息入口', size=32, color=WHITE, bold=True)
tb(slide, 1.0, 2.1, 11.0, 0.5, 'Viral Card Feed　·　本页为设想，代码零实现 / Concept — not implemented', size=16, color=GRAY, font='Helvetica')

tb(slide, 1.0, 3.0, 11.0, 0.8,
   '传统模式：所有平台把你往自己的入口拉 → 用户被困在信息孤岛\n'
   '新模式：卡片本身就是分发网络 → 每张图都是一颗种子，落在任何信息流里',
   size=16, color=LIGHT_GRAY)

tb(slide, 1.0, 4.2, 11.0, 0.5, '核心逻辑 / Core Logic', size=18, color=CLAY, bold=True)

flow_items = [
    ('AI 提炼\n内容', DARK_INK),
    ('渲染成\n美图', CLAY),
    ('嵌入隐形水印\n（设想）', DARK_INK),
    ('用户发到\n任何平台', CLAY),
    ('平台看到\n只是图片', DARK_INK),
    ('APP 扫描解码\n（设想）', CLAY),
]
for i, (text, fill) in enumerate(flow_items):
    x = 0.5 + i * 2.1
    shape = slide.shapes.add_shape(MSO_SHAPE.ROUNDED_RECTANGLE, Inches(x), Inches(4.9), Inches(1.8), Inches(1.0))
    shape.fill.solid()
    shape.fill.fore_color.rgb = fill
    shape.line.fill.background()
    shape.adjustments[0] = 0.08
    tf = shape.text_frame
    tf.word_wrap = True
    p = tf.paragraphs[0]
    p.text = text
    p.font.size = Pt(12)
    p.font.bold = True
    p.font.color.rgb = WHITE
    p.alignment = PP_ALIGN.CENTER
    if i < 5:
        tb(slide, x + 1.8, 5.1, 0.3, 0.5, '→', size=18, color=CLAY, bold=True, align=PP_ALIGN.CENTER)

tb(slide, 1.0, 6.2, 11.0, 0.5,
   '不是"引流"，是"渗透"。平台无法拦截，用户无感传播，APP 自动收割。',
   size=14, color=CLAY, bold=True, align=PP_ALIGN.CENTER)
pg(slide, 7)

# ============================================================
# Slide 8: 隐形水印技术链路
# ============================================================
slide = prs.slides.add_slide(prs.slide_layouts[6])
sec(slide, 7, '隐形水印：反风控技术链路', 'Invisible Watermark: Anti-Censorship Pipeline　·　Concept, zero lines of code today')

tb(slide, 0.8, 2.8, 5.8, 0.4, '编码侧（发送方）/ Sender Side', size=16, color=CLAY, bold=True)
bl(slide, [
    '① 笔记 ID (64-bit) + 校验码',
    '② 频域水印 (DWT-DCT) 编入卡片图片',
    '③ 仅需 8-16 字节 → 极高鲁棒性',
    '④ 视觉与普通美图无异',
    '',
    '① Note ID (64-bit) + checksum',
    '② Frequency-domain watermark embedded',
    '③ Only 8-16 bytes → extreme robustness',
    '④ Visually identical to any beautiful image',
], left=0.8, top=3.3, width=5.8, size=12)

tb(slide, 7.0, 2.8, 5.5, 0.4, '解码侧（接收方）/ Receiver Side', size=16, color=CLAY, bold=True)
bl(slide, [
    '① APP 扫描用户相册（主动触发+授权）',
    '② 轻量检测模型 (CoreML) 识别水印',
    '③ 提取笔记 ID → 服务器获取完整笔记',
    '④ 自动归档到知识库 + 原始来源链接',
    '',
    '① Album scan (user-triggered + authorized)',
    '② Lightweight detection model (CoreML)',
    '③ Extract ID → fetch full note from server',
    '④ Auto-archive with source attribution',
], left=7.0, top=3.3, width=5.5, size=12)

card(slide, 0.8, 5.8, 11.7, 1.2, LIGHT_GRAY)
tb(slide, 1.0, 5.9, 11.3, 0.3, '现状与鲁棒性目标 / Status & Robustness Target', size=14, color=CLAY, bold=True)
tb(slide, 1.0, 6.25, 11.3, 0.6,
   '这一页整页是未来设想：编码与解码两条链路代码零实现，现网仍是真实小程序码 → 公开摘要页。要做，先实测压缩鲁棒性：\n'
   'JPEG 重编码 + 平台压缩 + 缩放 + 裁切 + 滤镜 + 截图。',
   size=13, color=DARK_INK)
pg(slide, 8)

# ============================================================
# Slide 9: 场景一 — 知识工作者
# ============================================================
slide = prs.slides.add_slide(prs.slide_layouts[6])
sec(slide, 8, '场景一：知识工作者', 'Scenario 1: Knowledge Worker')

card(slide, 0.8, 2.8, 5.8, 4.2)
tb(slide, 1.0, 2.95, 5.4, 0.4, '用户故事 / User Story', size=16, color=CLAY, bold=True)
bl(slide, [
    '小王，产品经理，每天读 15+ 篇文章',
    '',
    '① 看到好文章 → 一键生成卡片',
    '② 发到朋友圈（只是美图，无引流痕迹）',
    '③ 同事看到 → 保存到相册',
    '④ 同事的图麦 APP 自动检测水印',
    '⑤ 完整笔记自动进入同事知识库',
    '⑥ 同事觉得好 → 也生成卡片 → 继续扩散',
], left=1.0, top=3.4, width=5.4, size=13)

card(slide, 7.0, 2.8, 5.5, 4.2)
tb(slide, 7.2, 2.95, 5.1, 0.4, '商业价值 / Business Value', size=16, color=CLAY, bold=True)
bl(slide, [
    '• 零成本获客：每张卡片 = 1 个潜在新用户',
    '• 零平台风险：没有二维码、没有外链',
    '• 自然裂变：用户不知道在"推广"，只是在分享美图',
    '• 知识闭环：从"看到"到"拥有"只需一次保存',
    '',
    '• Zero-cost acquisition: each card = 1 potential user',
    '• Zero platform risk: no QR, no external link',
    '• Natural virality: users share beauty, not ads',
    '• Knowledge loop: "see" → "own" in one save',
], left=7.2, top=3.4, width=5.1, size=12)
pg(slide, 9)

# ============================================================
# Slide 10: 场景二 — 内容创作者
# ============================================================
slide = prs.slides.add_slide(prs.slide_layouts[6])
sec(slide, 8, '场景二：内容创作者', 'Scenario 2: Content Creator')

card(slide, 0.8, 2.8, 5.8, 4.2)
tb(slide, 1.0, 2.95, 5.4, 0.4, '用户故事 / User Story', size=16, color=CLAY, bold=True)
bl(slide, [
    '小李，知识博主，粉丝 5 万',
    '',
    '① 研究一个主题 → AI 提炼出结构化笔记',
    '② 生成 10 套卡片 → 选最适合的',
    '③ 发到小红书/Instagram/X（各平台尺寸自适应）',
    '④ 卡片带真实小程序码 → 扫码进公开摘要页（付费墙为设想）',
    '⑤ 粉丝保存卡片 → APP 解码（设想）→ 进知识库',
    '⑥ 粉丝看到"全文需付费" → 付费解锁 → 创作者获得收入',
], left=1.0, top=3.4, width=5.4, size=12)

card(slide, 7.0, 2.8, 5.5, 4.2)
tb(slide, 7.2, 2.95, 5.1, 0.4, '商业价值 / Business Value', size=16, color=CLAY, bold=True)
bl(slide, [
    '• 创作者经济：内容 → 卡片 → 付费墙 → 收入',
    '• 平台抽成 15-20%，创作者分成 80-85%',
    '• 单篇解锁 1-10 元（创作者自定价）',
    '• 跨平台分发：一张卡片同时落 5+ 个平台',
    '',
    '• Creator economy: content → card → paywall → revenue',
    '• Platform cut 15-20%, creator gets 80-85%',
    '• Per-article unlock ¥1-10 (creator sets price)',
    '• Cross-platform: one card lands on 5+ platforms',
], left=7.2, top=3.4, width=5.1, size=12)
pg(slide, 10)

# ============================================================
# Slide 11: 场景三 — 品牌方 + 企业
# ============================================================
slide = prs.slides.add_slide(prs.slide_layouts[6])
sec(slide, 8, '场景三：品牌方 + 企业', 'Scenario 3: Brand + Enterprise')

card(slide, 0.8, 2.8, 3.7, 4.2)
tb(slide, 1.0, 2.95, 3.3, 0.4, '品牌方 / Brand', size=16, color=CLAY, bold=True)
bl(slide, [
    '• 品牌定制模板',
    '  用户选用后自动带品牌元素',
    '• 挑战赛卡片',
    '  品牌发起话题 → 用户生成卡片',
    '• 隐形品牌水印',
    '  每张卡片都携带品牌编码',
    '• 数据追踪',
    '  解码量 = 品牌曝光真实数据',
], left=1.0, top=3.4, width=3.3, size=12)

card(slide, 4.9, 2.8, 3.7, 4.2)
tb(slide, 5.1, 2.95, 3.3, 0.4, '企业版 / Enterprise', size=16, color=CLAY, bold=True)
bl(slide, [
    '• 团队协作',
    '  多人编辑、审批流',
    '• 品牌模板库',
    '  统一视觉规范',
    '• 批量生成与分发',
    '  一次操作 → 千张卡片',
    '• 数据看板',
    '  扫码量、转化率、用户画像',
], left=4.9, top=3.4, width=3.5, size=12)

card(slide, 9.0, 2.8, 3.5, 4.2)
tb(slide, 9.2, 2.95, 3.1, 0.4, '教育机构 / Edu', size=16, color=CLAY, bold=True)
bl(slide, [
    '• 课件转卡片',
    '  老师生成 → 学生自动获取',
    '• 学习笔记共享',
    '  学生间隐形传播',
    '• 知识库构建',
    '  课程资料自动索引',
    '• 批量授权',
    '  按学校/班级定价',
], left=9.2, top=3.4, width=3.1, size=12)
pg(slide, 11)

# ============================================================
# Slide 12: 商业变现四层定价
# ============================================================
slide = prs.slides.add_slide(prs.slide_layouts[6])
sec(slide, 9, '商业变现：四层定价', 'Monetization: Four-Tier Pricing　·　Concept — the product is free today')

tiers = [
    ('免费层\nFree', '¥0', [
        '笔记不限量（现已生效）',
        '10 套模板全部免费',
        '设想：创建卡片 + 隐形编码',
        '设想：每日解码 3 次',
    ], LIGHT_GRAY),
    ('订阅层\nPro', '¥18/月', [
        '无限解码',
        '自动相册扫描',
        '高级模板',
        '数据看板',
    ], WHITE),
    ('创作者层\nCreator', '¥68/月', [
        '批量生成卡片',
        '品牌联名模板',
        '付费墙（部分免费+部分付费）',
        'API 接入',
    ], WHITE),
    ('企业层\nEnterprise', '¥299-999/月', [
        '团队协作',
        '品牌水印定制',
        '批量分发 + 效果追踪',
        '私有化部署',
    ], WHITE),
]

for i, (name, price, features, bg) in enumerate(tiers):
    x = 0.5 + i * 3.15
    card(slide, x, 2.8, 2.9, 4.2, bg)
    shape = slide.shapes.add_shape(MSO_SHAPE.ROUNDED_RECTANGLE, Inches(x), Inches(2.8), Inches(2.9), Inches(1.0))
    shape.fill.solid()
    shape.fill.fore_color.rgb = CLAY if i == 0 else DARK_INK
    shape.line.fill.background()
    shape.adjustments[0] = 0.05
    tf = shape.text_frame
    tf.word_wrap = True
    p = tf.paragraphs[0]
    p.text = f'{name}  {price}'
    p.font.size = Pt(13)
    p.font.bold = True
    p.font.color.rgb = WHITE
    p.alignment = PP_ALIGN.CENTER
    for j, feat in enumerate(features):
        tb(slide, x + 0.15, 4.0 + j * 0.5, 2.6, 0.45, f'• {feat}', size=12, color=DARK_INK)
pg(slide, 12)

# ============================================================
# Slide 13: 财务预测 + 产品路线图
# ============================================================
slide = prs.slides.add_slide(prs.slide_layouts[6])
sec(slide, 10, '财务预测 + 产品路线图', 'Financial Projections + Roadmap')

tb(slide, 0.8, 2.8, 5.8, 0.4, '三年收入预测（参考估算）/ 3-Year Revenue (Projected)', size=15, color=CLAY, bold=True)

fin_headers = ['年份', '扫码付费', '模板付费', '广告植入', '企业订阅', '合计']
fin_rows = [
    ['Y1', '200万', '100万', '150万', '30万', '480万'],
    ['Y2', '500万', '250万', '350万', '100万', '1200万'],
    ['Y3', '1000万', '500万', '600万', '250万', '2350万'],
]
f_col_w = [1.0, 1.0, 1.0, 1.0, 1.0, 1.0]
f_col_x = [0.8, 1.8, 2.8, 3.8, 4.8, 5.8]

for j, (h, x, w) in enumerate(zip(fin_headers, f_col_x, f_col_w)):
    shape = slide.shapes.add_shape(MSO_SHAPE.ROUNDED_RECTANGLE, Inches(x), Inches(3.3), Inches(w), Inches(0.4))
    shape.fill.solid()
    shape.fill.fore_color.rgb = CLAY
    shape.line.fill.background()
    shape.adjustments[0] = 0.06
    tb(slide, x + 0.05, 3.33, w - 0.1, 0.3, h, size=11, color=WHITE, bold=True, align=PP_ALIGN.CENTER)

for i, row in enumerate(fin_rows):
    y = 3.8 + i * 0.45
    bg_c = WHITE if i % 2 == 0 else LIGHT_GRAY
    for j, (val, x, w) in enumerate(zip(row, f_col_x, f_col_w)):
        shape = slide.shapes.add_shape(MSO_SHAPE.ROUNDED_RECTANGLE, Inches(x), Inches(y), Inches(w), Inches(0.38))
        shape.fill.solid()
        shape.fill.fore_color.rgb = bg_c
        shape.line.fill.background()
        shape.adjustments[0] = 0.04
        tb(slide, x + 0.05, y + 0.03, w - 0.1, 0.3, val, size=11, color=DARK_INK, bold=(j == 0 or j == 5), align=PP_ALIGN.CENTER)

tb(slide, 7.0, 2.8, 5.5, 0.4, '产品路线图 / Product Roadmap', size=15, color=CLAY, bold=True)

roadmap = [
    ('M1-3', 'MVP', '文字+AI+基础模板+导出'),
    ('M4-6', 'V1.0', 'OCR+H5+付费墙（隐形水印为设想）'),
    ('M7-9', 'V1.5', '模板市场+社交API接入'),
    ('M10-12', 'V2.0', '广告系统+企业版+数据看板'),
    ('M13-18', 'V2.5', '国际化+设计师生态+API开放'),
]
for i, (time, ver, desc) in enumerate(roadmap):
    y = 3.3 + i * 0.7
    shape = slide.shapes.add_shape(MSO_SHAPE.ROUNDED_RECTANGLE, Inches(7.0), Inches(y), Inches(1.2), Inches(0.55))
    shape.fill.solid()
    shape.fill.fore_color.rgb = CLAY if i <= 1 else DARK_INK
    shape.line.fill.background()
    shape.adjustments[0] = 0.08
    tf = shape.text_frame
    p = tf.paragraphs[0]
    p.text = f'{time}\n{ver}'
    p.font.size = Pt(10)
    p.font.bold = True
    p.font.color.rgb = WHITE
    p.alignment = PP_ALIGN.CENTER
    tb(slide, 8.4, y + 0.08, 4.0, 0.4, desc, size=12, color=DARK_INK)

tb(slide, 0.8, 6.2, 11.5, 0.5,
   '* 财务数字是类比估算（参照同类 App 的公开口径），非本项目实测、非收入承诺',
   size=11, color=GRAY, align=PP_ALIGN.CENTER)
pg(slide, 13)

# ============================================================
# Slide 14: Cross-Platform
# ============================================================
slide = prs.slides.add_slide(prs.slide_layouts[6])
sec(slide, 11, '跨平台策略：中国 + 全球', 'Cross-Platform: China + Global')

headers = ['能力 / Capability', '微信小程序 / WeChat', 'iOS App']
rows = [
    ['卡片导出 / Export', '保存到相册', '相册 + Share Sheet'],
    ['扫码 / QR Scan', '微信原生扫码', '相机 + Universal Link'],
    ['分享内容 / Shared', '小程序页面', 'H5 URL（任意浏览器）'],
    ['社交分发 / Social', '仅微信', 'Instagram, X, TikTok…'],
    ['一键转存 / Save', '仅应用内', 'Share Extension → 任意 App'],
    ['卡片尺寸 / Size', '固定 750px', '按平台自适应'],
]

col_w = [3.0, 4.0, 4.5]
col_x = [0.8, 3.8, 7.8]
t_top = 2.8

for j, (h, x, w) in enumerate(zip(headers, col_x, col_w)):
    shape = slide.shapes.add_shape(MSO_SHAPE.ROUNDED_RECTANGLE, Inches(x), Inches(t_top), Inches(w), Inches(0.5))
    shape.fill.solid()
    shape.fill.fore_color.rgb = CLAY
    shape.line.fill.background()
    shape.adjustments[0] = 0.06
    tb(slide, x + 0.1, t_top + 0.07, w - 0.2, 0.35, h, size=13, color=WHITE, bold=True, align=PP_ALIGN.CENTER)

for i, row in enumerate(rows):
    y = t_top + 0.6 + i * 0.55
    bg = WHITE if i % 2 == 0 else LIGHT_GRAY
    for j, (cell, x, w) in enumerate(zip(row, col_x, col_w)):
        shape = slide.shapes.add_shape(MSO_SHAPE.ROUNDED_RECTANGLE, Inches(x), Inches(y), Inches(w), Inches(0.45))
        shape.fill.solid()
        shape.fill.fore_color.rgb = bg
        shape.line.fill.background()
        shape.adjustments[0] = 0.04
        tb(slide, x + 0.1, y + 0.05, w - 0.2, 0.35, cell, size=12, color=DARK_INK, bold=(j == 0))
pg(slide, 14)

# ============================================================
# Slide 15: Platform-Adaptive Sizing
# ============================================================
slide = prs.slides.add_slide(prs.slide_layouts[6])
sec(slide, 11, '平台自适应卡片尺寸', 'Platform-Adaptive Card Sizing')

tb(slide, 0.8, 2.8, 11.0, 0.5,
   '一条笔记 → 导出为各平台最优尺寸 / One note → export at optimal size for each platform',
   size=16, color=DARK_INK)

size_data = [
    ('Instagram Feed', '4:5', '1080×1350'),
    ('Instagram Story', '9:16', '1080×1920'),
    ('X (Twitter)', '16:9', '1200×675'),
    ('小红书 Xiaohongshu', '3:4', '1080×1440'),
    ('朋友圈 Moments', '1:1', '1080×1080'),
    ('打印 Print', 'A4', '2480×3508'),
]

s_col_w = [4.0, 2.0, 3.0]
s_col_x = [1.5, 5.5, 7.5]
s_top = 3.5

for j, (h, x, w) in enumerate(zip(['平台 / Platform', '比例 / Ratio', '分辨率 / Resolution'], s_col_x, s_col_w)):
    shape = slide.shapes.add_shape(MSO_SHAPE.ROUNDED_RECTANGLE, Inches(x), Inches(s_top), Inches(w), Inches(0.45))
    shape.fill.solid()
    shape.fill.fore_color.rgb = CLAY
    shape.line.fill.background()
    shape.adjustments[0] = 0.06
    tb(slide, x + 0.1, s_top + 0.05, w - 0.2, 0.35, h, size=13, color=WHITE, bold=True, align=PP_ALIGN.CENTER)

for i, (plat, ratio, res) in enumerate(size_data):
    y = s_top + 0.55 + i * 0.5
    bg = WHITE if i % 2 == 0 else LIGHT_GRAY
    for j, (val, x, w) in enumerate(zip([plat, ratio, res], s_col_x, s_col_w)):
        shape = slide.shapes.add_shape(MSO_SHAPE.ROUNDED_RECTANGLE, Inches(x), Inches(y), Inches(w), Inches(0.42))
        shape.fill.solid()
        shape.fill.fore_color.rgb = bg
        shape.line.fill.background()
        shape.adjustments[0] = 0.04
        tb(slide, x + 0.1, y + 0.05, w - 0.2, 0.32, val, size=12, color=DARK_INK, bold=(j == 0))

tb(slide, 0.8, 6.4, 11.5, 0.6,
   '现网：卡片带真实小程序码 → 微信内进入公开摘要页 → 一键转存为独立笔记\n'
   '跨平台无损传播与自动解码为设想，代码零实现 / cross-platform watermark: concept only',
   size=13, color=DARK_INK, align=PP_ALIGN.CENTER)
pg(slide, 15)

# ============================================================
# Slide 16: Viral Loop (updated)
# ============================================================
slide = prs.slides.add_slide(prs.slide_layouts[6])
sec(slide, 12, '传播闭环：爽图 → 渗透 → 收割', 'Viral Loop: Card → Penetrate → Harvest')

flow = [
    ('用户创建\n笔记+卡片', False),
    ('隐形水印\n编入（设想）', False),
    ('发到任何\n社交平台', False),
    ('平台只看到\n一张美图', False),
    ('APP 扫描\n解码（设想）', False),
    ('知识入库\n→ 留存', True),
]
for i, (text, highlight) in enumerate(flow):
    x = 0.3 + i * 2.15
    shape = slide.shapes.add_shape(MSO_SHAPE.ROUNDED_RECTANGLE, Inches(x), Inches(3.0), Inches(1.9), Inches(1.2))
    shape.fill.solid()
    shape.fill.fore_color.rgb = CLAY if highlight else WHITE
    shape.line.fill.background()
    shape.adjustments[0] = 0.08
    tf = shape.text_frame
    tf.word_wrap = True
    p = tf.paragraphs[0]
    p.text = text
    p.font.size = Pt(12)
    p.font.bold = highlight
    p.font.color.rgb = WHITE if highlight else DARK_INK
    p.alignment = PP_ALIGN.CENTER
    if i < 5:
        tb(slide, x + 1.9, 3.25, 0.25, 0.5, '→', size=18, color=CLAY, bold=True, align=PP_ALIGN.CENTER)

bl(slide, [
    '对比 / Comparison：',
    '旧模式（QR码）：平台可拦截 → 转化路径断裂 → 病毒系数受限',
    '新模式（隐形水印·设想，代码零实现）：平台无法识别 → 零拦截 → 理论病毒系数无上限',
    '',
    'Old (QR): platform can block → conversion breaks → viral coefficient capped',
    'New (watermark, concept only): undetectable → zero blocking → uncapped in theory',
], left=0.8, top=4.7, width=11.5, size=13)
pg(slide, 16)

# ============================================================
# Slide 17: Innovation (updated)
# ============================================================
slide = prs.slides.add_slide(prs.slide_layouts[6])
sec(slide, 13, '创新点：三处应用层创新', 'Innovation: Three Application-Layer Innovations')

tb(slide, 0.8, 2.8, 3.7, 0.4, '① 记录起点前移', size=16, color=CLAY, bold=True)
tb(slide, 0.8, 3.15, 3.7, 0.25, 'Start Point Shift', size=11, color=GRAY, font='Helvetica')
bl(slide, [
    '空白页 → 已有内容 → AI 出结构',
    '用户修正而非创作',
    'Blank page → existing content → AI structures',
], left=0.8, top=3.5, width=3.7, size=12)

tb(slide, 4.9, 2.8, 3.7, 0.4, '② 爽图信息流', size=16, color=CLAY, bold=True)
tb(slide, 4.9, 3.15, 3.7, 0.25, 'Viral Card Feed', size=11, color=GRAY, font='Helvetica')
bl(slide, [
    '卡片=分发网络，每张图是种子',
    '隐形水印反风控＝设想（现网是真码）',
    'Cards = distribution network',
    'Watermark = concept, not built',
], left=4.9, top=3.5, width=3.7, size=12)

tb(slide, 9.0, 2.8, 3.5, 0.4, '③ 知识变社交资产', size=16, color=CLAY, bold=True)
tb(slide, 9.0, 3.15, 3.5, 0.25, 'Knowledge as Social Asset', size=11, color=GRAY, font='Helvetica')
bl(slide, [
    '10 套模板 + 平台自适应尺寸',
    '知识从"存起来"到"传出去"',
    '10 templates + adaptive sizing',
    'From "saved" to "shared"',
], left=9.0, top=3.5, width=3.5, size=12)

card(slide, 0.8, 5.5, 11.7, 1.3, LIGHT_GRAY)
tb(slide, 1.0, 5.6, 11.3, 0.3, '创新本质 / Innovation Essence', size=14, color=CLAY, bold=True)
tb(slide, 1.0, 5.95, 11.3, 0.7,
   '不是发明新算法，而是重新定义三个边界：\n'
   '"记录的起点"（从空白页到已有内容）× "传播的方式"（从引流到渗透）× "知识的终点"（从收藏夹到社交信息流）',
   size=13, color=DARK_INK)
pg(slide, 17)

# ============================================================
# Slide 18: Market
# ============================================================
slide = prs.slides.add_slide(prs.slide_layouts[6])
sec(slide, 14, '市场与定位', 'Market & Positioning')

tb(slide, 0.8, 2.8, 5.8, 0.4, '目标用户 / Target Users', size=17, color=CLAY, bold=True)
bl(slide, [
    '• 每天阅读 10+ 篇的知识工作者',
    '• 需要把研究变成可分享格式的内容创作者',
    '• 截图参考但从不整理的学生/研究者',
    '• 需要品牌卡片营销的企业/运营团队',
    '• Knowledge workers, creators, students, brands',
], left=0.8, top=3.3, width=5.8, size=13)

tb(slide, 7.0, 2.8, 5.5, 0.4, '市场规模 / Market Size', size=17, color=CLAY, bold=True)
bl(slide, [
    '• AI 应用市场 CAGR 39.1%',
    '• 中国知识付费用户 4.32 亿',
    '• 微信 13 亿 MAU + iOS 10 亿+ 设备',
    '• 社交卡片营销已被瑞幸/安踏验证',
    '• 以上外部数字本轮未复核 / external figures, not re-verified',
], left=7.0, top=3.3, width=5.5, size=13)

card(slide, 0.8, 5.2, 11.7, 1.8, WHITE)
tb(slide, 1.0, 5.3, 11.3, 0.3, '竞争定位 / Competitive Position', size=16, color=CLAY, bold=True)
tb(slide, 1.0, 5.7, 11.3, 1.2,
   '笔记(Notion/Bear)：空白页起，无 AI 提炼，无卡片  |  稍后读(Pocket)：只存不变  |  AI 写作(Jasper)：生成新内容，不整理旧内容\n'
   '卡片工具(md2card)：免费但无变现  |  知识付费平台：重，无轻量社交分发\n'
   '图麦笔记 = 内容采集 + AI 结构化 + 卡片出图与扫码回流（+ 设想中的隐形水印分发）',
   size=13, color=DARK_INK)
pg(slide, 18)

# ============================================================
# Slide 19: Tech Stack
# ============================================================
slide = prs.slides.add_slide(prs.slide_layouts[6])
sec(slide, 15, '技术栈', 'Technology Stack')

stack = [
    ('中国前端 / China Frontend', '微信原生小程序 / WeChat Mini Program'),
    ('全球前端 / Global Frontend', 'iOS 原生 App (Swift/SwiftUI) — 开发中'),
    ('Web', 'H5 公开页（通用链接+付费墙）/ H5 pages (universal link + paywall)'),
    ('后端 / Backend', 'FastAPI (Python), 自建 / self-hosted'),
    ('AI 模型 / Model', '腾讯混元 hy3-preview / Tencent Hunyuan'),
    ('OCR', 'RapidOCR + ONNX Runtime (自建/CPU)；Apple Vision 属 iOS 计划'),
    ('隐形水印 / Watermark', '设想 · 代码零实现（编码与检测均未开工）'),
    ('任务队列 / Queue', 'Redis + RQ (异步 / async)'),
    ('内容提取 / Extraction', 'trafilatura (开源 / open-source)'),
    ('数据库 / Database', 'SQLite → PostgreSQL-ready'),
    ('云 / Cloud', '腾讯云开发 CloudBase：云函数 + 对象存储（图片云备份）'),
]
for i, (layer, tech) in enumerate(stack):
    y = 2.6 + i * 0.42
    shape = slide.shapes.add_shape(MSO_SHAPE.ROUNDED_RECTANGLE, Inches(0.8), Inches(y), Inches(3.0), Inches(0.35))
    shape.fill.solid()
    shape.fill.fore_color.rgb = CLAY if i % 2 == 0 else DARK_INK
    shape.line.fill.background()
    shape.adjustments[0] = 0.08
    tb(slide, 0.95, y + 0.02, 2.7, 0.3, layer, size=10, color=WHITE, bold=True, align=PP_ALIGN.CENTER)
    tb(slide, 4.1, y + 0.02, 8.5, 0.3, tech, size=12, color=DARK_INK)
pg(slide, 19)

# ============================================================
# Slide 20: Risk (updated)
# ============================================================
slide = prs.slides.add_slide(prs.slide_layouts[6])
sec(slide, 16, '风险识别与应对', 'Risks & Mitigation　·　含设想项 / including the concept features above')

risks = [
    ('平台检测水印 / Watermark Detection',
     '• 频域方案鲁棒性极强（扛 JPEG/压缩/裁切）\n• 备选：色彩签名方案兜底\n• 水印算法持续升级\n• Frequency-domain is robust · Fallback: color signature'),
    ('用户隐私 / Privacy',
     '• 相册扫描=用户主动触发+明确授权\n• 本地处理（CoreML），不上传无关照片\n• 可随时关闭\n• User-triggered + authorized · Local processing'),
    ('AI 成本 / AI Cost',
     '• 简单任务端侧处理，复杂任务云端\n• 多模型供应商降低单价\n• 免费额度（10亿Token，至2027-03）\n• Edge + cloud hybrid · Multi-vendor'),
    ('内容合规 / Compliance',
     '• 原文与摘要并列，用户可对照\n• 微信内容安全检测\n• 付费墙内容审核机制\n• Side-by-side verification · Content moderation'),
]
for i, (title, desc) in enumerate(risks):
    x = 0.8 + (i % 2) * 6.2
    y = 2.8 + (i // 2) * 2.2
    card(slide, x, y, 5.8, 2.0)
    tb(slide, x + 0.2, y + 0.1, 5.4, 0.35, title, size=15, color=CLAY, bold=True)
    tb(slide, x + 0.2, y + 0.5, 5.4, 1.4, desc, size=12, color=DARK_INK)
pg(slide, 20)

# ============================================================
# Slide 21: The Ask (updated)
# ============================================================
slide = prs.slides.add_slide(prs.slide_layouts[6])
sec(slide, 17, '融资需求', 'The Ask')

tb(slide, 0.8, 2.8, 11.0, 0.5,
   '天使轮 500-800 万元 / Angel Round ¥5-8M',
   size=20, color=DARK_INK, bold=True)
tb(slide, 0.8, 3.4, 11.0, 0.4,
   'Ship iOS app + build watermark infra + scale distribution + grow team',
   size=14, color=GRAY, font='Helvetica')

alloc = [
    ('产品研发\nR&D', '40%', 'iOS 开发(2-3人) + 隐形水印研发 + AI 优化'),
    ('市场推广\nMarketing', '30%', '冷启动：100 位创作者内测 + 小红书/抖音内容营销'),
    ('运营团队\nOps', '20%', '品牌商务 + 用户增长 + 模板设计师'),
    ('储备\nReserve', '10%', '应对不确定性'),
]
for i, (area, pct, desc) in enumerate(alloc):
    y = 4.2 + i * 0.75
    shape = slide.shapes.add_shape(MSO_SHAPE.ROUNDED_RECTANGLE, Inches(0.8), Inches(y), Inches(2.2), Inches(0.6))
    shape.fill.solid()
    shape.fill.fore_color.rgb = CLAY
    shape.line.fill.background()
    shape.adjustments[0] = 0.08
    tb(slide, 0.9, y + 0.05, 2.0, 0.5, f'{area}  {pct}', size=12, color=WHITE, bold=True, align=PP_ALIGN.CENTER)
    tb(slide, 3.3, y + 0.1, 9.0, 0.4, desc, size=14, color=DARK_INK)
pg(slide, 21)

# ============================================================
# Slide 22: Closing
# ============================================================
slide = prs.slides.add_slide(prs.slide_layouts[6])
add_bg(slide, INK)
tb(slide, 1.5, 1.5, 10.0, 0.8, '感谢评审', size=48, color=WHITE, bold=True, align=PP_ALIGN.CENTER)
tb(slide, 1.5, 2.4, 10.0, 0.6, 'Thank You', size=32, color=LIGHT_GRAY, font='Helvetica', align=PP_ALIGN.CENTER)

shape = slide.shapes.add_shape(MSO_SHAPE.RECTANGLE, Inches(5.5), Inches(3.3), Inches(2.333), Inches(0.06))
shape.fill.solid()
shape.fill.fore_color.rgb = CLAY
shape.line.fill.background()

tb(slide, 1.5, 3.7, 10.0, 0.6,
   '每张卡片都是一颗特洛伊木马', size=22, color=CLAY, align=PP_ALIGN.CENTER)
tb(slide, 1.5, 4.3, 10.0, 0.5,
   'Every card is a Trojan Horse — beauty on the outside, knowledge seed within', size=15, color=GRAY, font='Helvetica', align=PP_ALIGN.CENTER)

tb(slide, 1.5, 5.2, 10.0, 0.5, '图麦笔记 · TuMaiNote', size=20, color=LIGHT_GRAY, align=PP_ALIGN.CENTER)
tb(slide, 1.5, 5.7, 10.0, 0.5, 'agentsbin.cn', size=18, color=GRAY, align=PP_ALIGN.CENTER, font='Helvetica')
tb(slide, 1.5, 6.2, 10.0, 0.5, '微信搜索"图麦笔记"  |  iOS App: Coming Soon', size=15, color=LIGHT_GRAY, align=PP_ALIGN.CENTER)
tb(slide, 1.5, 6.7, 10.0, 0.4, '2026 微信小程序开发大赛 · 图麦笔记', size=12, color=GRAY, align=PP_ALIGN.CENTER)

# Save
out = '/Users/zlfmac/Documents/TuMaiBiJi/比赛/图麦笔记-双语PPT-Bilingual.pptx'
prs.save(out)
print(f'Saved: {out}')
print(f'Total slides: {len(prs.slides)}')
