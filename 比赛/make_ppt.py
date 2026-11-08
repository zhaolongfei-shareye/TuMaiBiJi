#!/usr/bin/env python3
"""生成 2026 微信小程序开发大赛参赛PPT — 图麦笔记"""

from pptx import Presentation
from pptx.util import Inches, Pt, Emu
from pptx.dml.color import RGBColor
from pptx.enum.text import PP_ALIGN, MSO_ANCHOR
from pptx.enum.shapes import MSO_SHAPE
import os

prs = Presentation()
prs.slide_width = Inches(13.333)
prs.slide_height = Inches(7.5)

# === 品牌色 ===
PAPER = RGBColor(0xF2, 0xEF, 0xE9)
INK = RGBColor(0x14, 0x16, 0x1A)
CLAY = RGBColor(0xD2, 0x68, 0x3F)
WHITE = RGBColor(0xFF, 0xFF, 0xFF)
GRAY = RGBColor(0x6B, 0x6B, 0x6B)
LIGHT_GRAY = RGBColor(0xE8, 0xE5, 0xDF)
DARK_INK = RGBColor(0x23, 0x25, 0x2C)

def add_bg(slide, color=PAPER):
    bg = slide.background
    fill = bg.fill
    fill.solid()
    fill.fore_color.rgb = color

def add_text_box(slide, left, top, width, height, text, font_size=18,
                 color=INK, bold=False, align=PP_ALIGN.LEFT, font_name='Microsoft YaHei'):
    txBox = slide.shapes.add_textbox(Inches(left), Inches(top), Inches(width), Inches(height))
    tf = txBox.text_frame
    tf.word_wrap = True
    p = tf.paragraphs[0]
    p.text = text
    p.font.size = Pt(font_size)
    p.font.color.rgb = color
    p.font.bold = bold
    p.font.name = font_name
    p.alignment = align
    return txBox

def add_bullet_slide(slide, items, left=1.0, top=2.0, width=11.0, font_size=16, color=INK):
    txBox = slide.shapes.add_textbox(Inches(left), Inches(top), Inches(width), Inches(4.5))
    tf = txBox.text_frame
    tf.word_wrap = True
    for i, item in enumerate(items):
        if i == 0:
            p = tf.paragraphs[0]
        else:
            p = tf.add_paragraph()
        p.text = item
        p.font.size = Pt(font_size)
        p.font.color.rgb = color
        p.font.name = 'Microsoft YaHei'
        p.space_after = Pt(12)
        p.level = 0
    return txBox

def add_section_header(slide, section_num, title, subtitle=''):
    add_bg(slide)
    add_text_box(slide, 1.0, 0.8, 2.0, 0.5, f'0{section_num}' if section_num < 10 else str(section_num),
                 font_size=48, color=CLAY, bold=True)
    add_text_box(slide, 1.0, 1.6, 10.0, 0.8, title, font_size=36, color=INK, bold=True)
    if subtitle:
        add_text_box(slide, 1.0, 2.5, 10.0, 0.6, subtitle, font_size=18, color=GRAY)

def add_page_number(slide, num, total=19):
    add_text_box(slide, 12.0, 7.0, 1.0, 0.4, f'{num}/{total}',
                 font_size=10, color=GRAY, align=PP_ALIGN.RIGHT)

# ============================================================
# Slide 1: 封面
# ============================================================
slide = prs.slides.add_slide(prs.slide_layouts[6])
add_bg(slide, INK)
add_text_box(slide, 1.5, 1.5, 10.0, 1.0,
             '2026 微信小程序开发大赛', font_size=20, color=LIGHT_GRAY)
add_text_box(slide, 1.5, 2.5, 10.0, 1.5,
             '图麦笔记', font_size=60, color=WHITE, bold=True)
add_text_box(slide, 1.5, 4.0, 10.0, 0.8,
             'AI Agent 驱动的个人知识管理智能体', font_size=28, color=CLAY)
add_text_box(slide, 1.5, 5.2, 10.0, 0.6,
             '作品：图麦笔记（已上线小程序）  |  团队：个人开发者', font_size=16, color=GRAY)
add_text_box(slide, 1.5, 6.2, 10.0, 0.5,
             '把"存下来"和"整理好"之间的重复劳动交给 AI Agent', font_size=14, color=LIGHT_GRAY)

# ============================================================
# Slide 2: 作品背景与说明
# ============================================================
slide = prs.slides.add_slide(prs.slide_layouts[6])
add_bg(slide)
add_section_header(slide, 1, '作品背景与说明')
add_text_box(slide, 1.0, 3.2, 5.5, 0.5, '痛点', font_size=20, color=CLAY, bold=True)
add_bullet_slide(slide, [
    '用户每天在微信收藏、截图、群聊链接中积累大量碎片信息',
    '收藏保存的是"入口"，不是内容——找到后仍需重新阅读摘录',
    '现有笔记工具要求用户从空白页开始写，但碎片场景下用户手里有别人的内容，不是一篇待写的文章',
], left=1.0, top=3.8, width=5.5, font_size=14)

add_text_box(slide, 7.0, 3.2, 5.5, 0.5, '解决方案', font_size=20, color=CLAY, bold=True)
add_bullet_slide(slide, [
    '图麦笔记：一个 AI Agent 知识管理智能体',
    '三个录入入口（链接 / 照片 / 文字）→ 同一条 AI 提炼链路 → 结构化笔记',
    '十套卡片模板将笔记变成可传播的社交图片，码把读者领回原文',
    '微信小程序载体，零安装即用',
], left=7.0, top=3.8, width=5.5, font_size=14)
add_page_number(slide, 2)

# ============================================================
# Slide 3: 数据收集与处理 — 数据来源
# ============================================================
slide = prs.slides.add_slide(prs.slide_layouts[6])
add_bg(slide)
add_section_header(slide, 2, '数据来源：三条采集通道')
add_text_box(slide, 1.0, 3.2, 3.5, 0.5, '链接转笔记', font_size=18, color=CLAY, bold=True)
add_bullet_slide(slide, [
    '用户粘贴公开网页地址',
    '后端 trafilatura 抓取正文',
    '保留来源 URL 与原文',
    '来源：全网公开网页',
], left=1.0, top=3.8, width=3.5, font_size=13)

add_text_box(slide, 5.0, 3.2, 3.5, 0.5, '截图/拍照转笔记', font_size=18, color=CLAY, bold=True)
add_bullet_slide(slide, [
    '相册/相机导入，一批最多 9 张',
    '自建服务器 RapidOCR 识别',
    '支持 JPG/PNG 格式',
    '来源：用户本地图片',
], left=5.0, top=3.8, width=3.5, font_size=13)

add_text_box(slide, 9.0, 3.2, 3.5, 0.5, '文字转笔记', font_size=18, color=CLAY, bold=True)
add_bullet_slide(slide, [
    '用户自己填标题 + 原文',
    '摘要走同一条提炼链路',
    '入队前多一道内容安全检查',
    '来源：用户原创内容',
], left=9.0, top=3.8, width=3.5, font_size=13)

add_text_box(slide, 1.0, 6.2, 11.0, 0.5,
             '设计原则：记录起点从"空白页"前移到"用户已经看到的那条内容"',
             font_size=14, color=GRAY, align=PP_ALIGN.CENTER)
add_page_number(slide, 3)

# ============================================================
# Slide 4: 数据来源 — 权威性与时效性
# ============================================================
slide = prs.slides.add_slide(prs.slide_layouts[6])
add_bg(slide)
add_section_header(slide, 2, '数据渠道的权威性与时效性')

add_text_box(slide, 1.0, 3.2, 11.0, 0.5, '三大渠道特征', font_size=20, color=INK, bold=True)
add_bullet_slide(slide, [
    '渠道一：公开网页 — trafilatura 正文提取，保留原始 URL 可溯源，时效性取决于源站发布',
    '渠道二：相册截图 / 拍照 — RapidOCR + ONNX Runtime 在自建服务器推理，不接第三方识别 API；识别出的文字仍交给云开发模型提炼',
    '渠道三：用户自己写 — 标题与原文都由用户填，摘要同样交给模型（10-04 起）；用户原文一字不改留档，改笔记那一次保存不再调用模型',
    '',
    '数据流向透明：原始内容 → 提取/识别 → 模型提炼 → 结构化笔记 → 用户可编辑修正',
    '所有处理环节可追溯，原文与 AI 结果并列展示，方便用户对照核实',
], left=1.0, top=3.8, width=11.0, font_size=15)
add_page_number(slide, 4)

# ============================================================
# Slide 5: 知识库内容
# ============================================================
slide = prs.slides.add_slide(prs.slide_layouts[6])
add_bg(slide)
add_section_header(slide, 2, '知识库：混元大模型 + 笔记结构化存储')

add_text_box(slide, 1.0, 3.2, 5.5, 0.5, 'AI 模型层', font_size=20, color=CLAY, bold=True)
add_bullet_slide(slide, [
    '腾讯混元大模型 (hy3-preview)',
    '通过微信云开发 Serverless 调用',
    '温度 0.3 — 控制输出确定性',
    '输入上限 12,000 字符截断',
    '提示词由后端统一持有，避免版本漂移',
], left=1.0, top=3.8, width=5.5, font_size=14)

add_text_box(slide, 7.0, 3.2, 5.5, 0.5, '笔记知识库', font_size=20, color=CLAY, bold=True)
add_bullet_slide(slide, [
    '统一四件套结构：标题 + 摘要 + 要点 + 标签',
    '分类体系：用户自定义 + 私密分类',
    '全文索引：支持标题/内容/标签搜索',
    '分享快照：公开摘要页独立于原笔记',
    '转存回流：扫码 → 一键复制笔记结构',
], left=7.0, top=3.8, width=5.5, font_size=14)
add_page_number(slide, 5)

# ============================================================
# Slide 6: 预处理流程
# ============================================================
slide = prs.slides.add_slide(prs.slide_layouts[6])
add_bg(slide)
add_section_header(slide, 2, '预处理与利用：端到端 Pipeline')

flow_items = [
    ('用户输入', '链接/照片/文字'),
    ('任务入队', 'Redis/RQ 异步'),
    ('内容提取', 'trafilatura/OCR'),
    ('模型提炼', '混元 Agent'),
    ('结构化存储', '笔记入库'),
    ('卡片渲染', '端侧 Canvas'),
]
for i, (title, desc) in enumerate(flow_items):
    x = 0.8 + i * 2.05
    shape = slide.shapes.add_shape(MSO_SHAPE.ROUNDED_RECTANGLE,
                                    Inches(x), Inches(3.5), Inches(1.8), Inches(1.2))
    shape.fill.solid()
    shape.fill.fore_color.rgb = CLAY if i == 3 else LIGHT_GRAY
    shape.line.fill.background()
    tf = shape.text_frame
    tf.word_wrap = True
    p = tf.paragraphs[0]
    p.text = title
    p.font.size = Pt(13)
    p.font.bold = True
    p.font.color.rgb = WHITE if i == 3 else INK
    p.alignment = PP_ALIGN.CENTER
    p2 = tf.add_paragraph()
    p2.text = desc
    p2.font.size = Pt(10)
    p2.font.color.rgb = WHITE if i == 3 else GRAY
    p2.alignment = PP_ALIGN.CENTER

add_text_box(slide, 1.0, 5.2, 11.0, 1.5,
             '关键设计：\n'
             '• 三条录入通道在"提炼"阶段合流，共用同一份提示词与同一套结构化输出\n'
             '• 失败降级：模型不可用时回退为"标题+原文"保存，不丢数据\n'
             '• 指数退避重试（1/2/4 秒，最多 4 次），应对限流与超时',
             font_size=13, color=INK)
add_page_number(slide, 6)

# ============================================================
# Slide 7: 数据利用 — AI Agent 设计中的用途
# ============================================================
slide = prs.slides.add_slide(prs.slide_layouts[6])
add_bg(slide)
add_section_header(slide, 2, '数据在 AI Agent 设计中的用途')

add_bullet_slide(slide, [
    '输入数据 → 混元大模型提炼 → 输出结构化笔记（标题/摘要/要点/标签）',
    '',
    '• 链接正文 → 语义提炼 → 提取核心观点，生成可检索的知识条目',
    '• 截图 OCR 文本 → 阅读顺序重排 → 与链接共用同一套提炼逻辑',
    '• 自己写的原文 → 同一份提示词出摘要 → 标题保留用户填的那份',
    '• 标签 → 模型给 3-6 个短词；分类 → 用户当场挑，私密那一格由服务端把关',
    '• 笔记内容 → 端侧 Canvas 排版 → 十套卡片模板自适应渲染',
    '',
    '数据闭环：用户使用越多 → 知识库越丰富 → 分类越精准 → 找回效率越高',
], left=1.0, top=3.2, width=11.0, font_size=15)
add_page_number(slide, 7)

# ============================================================
# Slide 8: 分析过程 — 分析方法选择
# ============================================================
slide = prs.slides.add_slide(prs.slide_layouts[6])
add_bg(slide)
add_section_header(slide, 3, '分析方法选择：为什么是混元大模型')

add_text_box(slide, 1.0, 3.2, 5.5, 0.5, '选择依据', font_size=20, color=CLAY, bold=True)
add_bullet_slide(slide, [
    '任务匹配：内容提炼 = 摘要 + 要点 + 标签，正是大模型强项',
    '成本可控：微信云开发成长计划提供免费额度',
    '部署简单：Serverless 云函数，无需管理 GPU',
    '延迟可接受：模型那一步实测 1.27–2.87 秒（云函数留档），异步任务不阻塞用户',
], left=1.0, top=3.8, width=5.5, font_size=14)

add_text_box(slide, 7.0, 3.2, 5.5, 0.5, '适配优势', font_size=20, color=CLAY, bold=True)
add_bullet_slide(slide, [
    '中文理解强：混元对中文网页/截图文字理解准确',
    '结构化输出：JSON 模式保证输出格式稳定',
    '温度 0.3：低随机性 → 提炼结果可预期',
    '可降级：模型不可用时产品仍可用（采集不依赖 AI）',
], left=7.0, top=3.8, width=5.5, font_size=14)
add_page_number(slide, 8)

# ============================================================
# Slide 9: 分析过程 — 问题理解与逻辑论证
# ============================================================
slide = prs.slides.add_slide(prs.slide_layouts[6])
add_bg(slide)
add_section_header(slide, 3, '问题理解：从用户行为到 Agent 设计')

add_bullet_slide(slide, [
    '用户行为洞察 → Agent 设计决策：',
    '',
    '① 用户收藏后不再回看 → Agent 自动提炼摘要，降低"重新阅读"成本',
    '② 截图里的文字搜不到 → Agent 驱动 OCR + 语义索引，图片变可检索文本',
    '③ 笔记工具要求从零写 → Agent 把起点前移到已有内容，用户只需修正而非创作',
    '④ 整理好的内容出不去 → Agent + 端侧渲染生成卡片，知识变成可传播的社交资产',
    '⑤ 分享后无法回流 → Agent 生成公开摘要页 + 转存入口，形成知识传播闭环',
    '',
    '核心逻辑：AI Agent 不是替代用户思考，而是替代"摘录、概括、打标签"的重复劳动',
], left=1.0, top=3.2, width=11.0, font_size=15)
add_page_number(slide, 9)

# ============================================================
# Slide 10: 分析过程 — 分析流程思维导图
# ============================================================
slide = prs.slides.add_slide(prs.slide_layouts[6])
add_bg(slide)
add_section_header(slide, 3, '分析流程：从输入到输出的完整链路')

steps = [
    ('输入层', ['链接 URL', '截图/拍照', '手写文字']),
    ('处理层', ['正文提取', 'OCR 识别', '阅读顺序重排']),
    ('AI Agent', ['混元提炼', 'JSON 结构化', '降级兜底']),
    ('存储层', ['笔记入库', '分类索引', '全文搜索']),
    ('输出层', ['列表展示', '卡片渲染', '分享/转存']),
]
for i, (title, items) in enumerate(steps):
    x = 0.5 + i * 2.5
    add_text_box(slide, x, 3.3, 2.2, 0.5, title, font_size=16, color=CLAY, bold=True, align=PP_ALIGN.CENTER)
    for j, item in enumerate(items):
        shape = slide.shapes.add_shape(MSO_SHAPE.ROUNDED_RECTANGLE,
                                        Inches(x + 0.1), Inches(4.0 + j * 0.7), Inches(2.0), Inches(0.55))
        shape.fill.solid()
        shape.fill.fore_color.rgb = LIGHT_GRAY
        shape.line.color.rgb = CLAY
        shape.line.width = Pt(1)
        tf = shape.text_frame
        tf.vertical_anchor = MSO_ANCHOR.MIDDLE
        p = tf.paragraphs[0]
        p.text = item
        p.font.size = Pt(11)
        p.font.color.rgb = INK
        p.alignment = PP_ALIGN.CENTER

add_text_box(slide, 1.0, 6.3, 11.0, 0.5,
             '结构示意（不是某一次实测输出）：正文 → 一份提示词 → 标题 + 2-3 句摘要 + 3-8 条要点 + 3-6 个标签 → 十套卡片排版',
             font_size=13, color=GRAY, align=PP_ALIGN.CENTER)
add_page_number(slide, 10)

# ============================================================
# Slide 11: 创新性 — 创新点
# ============================================================
slide = prs.slides.add_slide(prs.slide_layouts[6])
add_bg(slide)
add_section_header(slide, 4, '创新点：两处应用层创新')

add_text_box(slide, 1.0, 3.2, 5.5, 0.5, '创新一：记录起点前移', font_size=20, color=CLAY, bold=True)
add_bullet_slide(slide, [
    '传统笔记：空白编辑器 → 用户从零写',
    '图麦笔记：从用户已有的内容开始 → AI 提炼出结构',
    '三入口（链接 / 照片 / 文字）并行，汇入同一份提示词与同一套结构',
    '用户只需"修正"而非"创作"，降低记录门槛',
], left=1.0, top=3.8, width=5.5, font_size=14)

add_text_box(slide, 7.0, 3.2, 5.5, 0.5, '创新二：知识变社交资产', font_size=20, color=CLAY, bold=True)
add_bullet_slide(slide, [
    '十套卡片模板，端侧 Canvas 实时渲染',
    '同一笔记十种视觉表达，适配不同社交场景',
    '卡片上的小程序码 = 纸面→数字的桥梁',
    '转存回流机制：扫码 → 看到摘要 → 一键存进自己的库',
], left=7.0, top=3.8, width=5.5, font_size=14)

add_text_box(slide, 1.0, 6.3, 11.0, 0.5,
             '创新本质：不是发明新算法，而是重新定义"记录的起点"和"知识的终点"',
             font_size=14, color=GRAY, align=PP_ALIGN.CENTER)
add_page_number(slide, 11)

# ============================================================
# Slide 12: 独特视角 — 跨学科交叉
# ============================================================
slide = prs.slides.add_slide(prs.slide_layouts[6])
add_bg(slide)
add_section_header(slide, 4, '独特视角：消费 × AI × 知识管理 交叉融合')

add_bullet_slide(slide, [
    '消费视角：',
    '  • 目标用户 = 微信 13 亿用户中的"信息收藏者"',
    '  • 场景 = 碎片化阅读 → 收藏堆积 → 无法复用的消费痛点',
    '  • 分发 = 卡片图进入朋友圈/小红书/群聊，天然社交传播',
    '',
    'AI Agent 视角：',
    '  • 不是对话式 ChatBot，而是任务驱动型 Agent',
    '  • 自主完成"提取→提炼→结构化→渲染"多步工作流',
    '  • 可降级设计：AI 不是唯一路径，产品不依赖单一模型',
    '',
    '知识管理视角：',
    '  • 不是第二大脑（太重），而是"碎片信息的第一道整理"',
    '  • 从"存下来"到"用出去"的完整闭环',
], left=1.0, top=3.2, width=11.0, font_size=14)
add_page_number(slide, 12)

# ============================================================
# Slide 13: 结果解释 — AI Agent 应用价值
# ============================================================
slide = prs.slides.add_slide(prs.slide_layouts[6])
add_bg(slide)
add_section_header(slide, 5, '结果解读：AI Agent 产生的应用价值')

add_bullet_slide(slide, [
    '对用户：',
    '  • 一条链接 → 后台处理完就是一张结构化笔记（标题+摘要+要点+标签），不必再复制长文、另开编辑器、逐段摘录',
    '  • 截图文字从"看得见搜不到"变成可检索、可引用的知识条目',
    '  • 十套卡片让知识"拿得出去"，不再是收藏夹里的死数据',
    '',
    '对内容生态：',
    '  • 卡片上的小程序码把"读者"领回原文 → 内容创作者获得精准回流',
    '  • 转存机制让知识在用户间流转，每次转存都是一次新用户获取',
    '',
    '对 AI 应用落地：',
    '  • 证明了"任务驱动型 Agent"比"对话式 ChatBot"更适合工具场景',
    '  • 个人开发者用免费平台额度 + 开源 OCR 即可跑通完整 AI 应用',
], left=1.0, top=3.2, width=11.0, font_size=14)
add_page_number(slide, 13)

# ============================================================
# Slide 14: 问题与优化建议
# ============================================================
slide = prs.slides.add_slide(prs.slide_layouts[6])
add_bg(slide)
add_section_header(slide, 5, '问题与优化建议')

add_text_box(slide, 1.0, 3.2, 5.5, 0.5, '当前问题', font_size=20, color=CLAY, bold=True)
add_bullet_slide(slide, [
    '① OCR 对模糊截图与复杂版式识别率有限（「文字」那一档是自己打字，不做笔迹识别）',
    '② 单模型（混元）存在单点风险',
    '③ 提炼结果偶尔出现 JSON 格式异常',
    '④ 卡片模板能选能换，但用户还不能自己排版式',
], left=1.0, top=3.8, width=5.5, font_size=14)

add_text_box(slide, 7.0, 3.2, 5.5, 0.5, '优化建议', font_size=20, color=CLAY, bold=True)
add_bullet_slide(slide, [
    '① 引入多模态大模型直接理解图片语义',
    '② 增加模型路由层，支持多模型 fallback',
    '③ 强化输出校验 + 片段兜底解析机制',
    '④ 补多机型真机回归：换设备与重装之后名片回得来那两条链路',
    '⑤ 接入用户行为数据优化推荐分类',
], left=7.0, top=3.8, width=5.5, font_size=14)
add_page_number(slide, 14)

# ============================================================
# Slide 15: 风险识别与应对
# ============================================================
slide = prs.slides.add_slide(prs.slide_layouts[6])
add_bg(slide)
add_section_header(slide, 5, '风险识别与应对策略')

add_text_box(slide, 1.0, 3.2, 5.5, 0.5, '风险一：数据安全风险', font_size=18, color=CLAY, bold=True)
add_bullet_slide(slide, [
    '风险：用户截图/链接可能含敏感信息',
    '应对：',
    '  • OCR 在自建服务器执行，不接第三方识别服务',
    '  • 私密那一格由服务端把关：不解锁不发正文与摘要',
    '  • 图片云备份走对象存储，删笔记即发起删除、删不成落待删账',
    '  • 原文与 AI 结果一并留存，供用户对照、修改、删除',
], left=1.0, top=3.8, width=5.5, font_size=13)

add_text_box(slide, 7.0, 3.2, 5.5, 0.5, '风险二：模型可用性风险', font_size=18, color=CLAY, bold=True)
add_bullet_slide(slide, [
    '风险：混元模型限流/宕机导致提炼失败',
    '应对：',
    '  • 指数退避重试（最多 4 次）',
    '  • 降级保存"标题+原文"，不丢数据',
    '  • 提炼可整体关闭，采集照常工作',
    '  • 未来引入多模型路由分散风险',
], left=7.0, top=3.8, width=5.5, font_size=13)
add_page_number(slide, 15)

# ============================================================
# Slide 16: 风险 — 补充
# ============================================================
slide = prs.slides.add_slide(prs.slide_layouts[6])
add_bg(slide)
add_section_header(slide, 5, '风险识别与应对（续）')

add_text_box(slide, 1.0, 3.2, 5.5, 0.5, '风险三：内容合规风险', font_size=18, color=CLAY, bold=True)
add_bullet_slide(slide, [
    '风险：AI 提炼结果可能失真或侵权',
    '应对：',
    '  • 原文与摘要并列展示，用户可对照核实',
    '  • 自己写的与要分享的都过微信内容安全检测（msgSecCheck）',
    '  • 用户须知：对 AI 结果中的事实与出处自行复核',
], left=1.0, top=3.8, width=5.5, font_size=13)

add_text_box(slide, 7.0, 3.2, 5.5, 0.5, '风险四：平台依赖风险', font_size=18, color=CLAY, bold=True)
add_bullet_slide(slide, [
    '风险：依赖微信小程序 + 云开发生态',
    '应对：',
    '  • 后端自建，与微信平台解耦',
    '  • OCR 走自建服务器，不依赖微信 OCR',
    '  • 模型层抽象，可切换其他大模型',
], left=7.0, top=3.8, width=5.5, font_size=13)
add_page_number(slide, 16)

# ============================================================
# Slide 17: 应用结果 — 应用描述与界面展示
# ============================================================
slide = prs.slides.add_slide(prs.slide_layouts[6])
add_bg(slide)
add_section_header(slide, 6, '应用描述与界面展示')

add_text_box(slide, 1.0, 3.2, 11.0, 0.5,
             '图麦笔记 — 微信小程序（搜索"图麦笔记"即可体验）', font_size=18, color=INK, bold=True)

add_bullet_slide(slide, [
    '核心界面流程：',
    '',
    '① 第一屏：形象图铺满 + 三块入口（人物／笔记数／卡片数）+ 调亮度·换背景·换主角',
    '② 录入：照片 / 文字 / 链接三档 → 右滑才开始提炼 → 异步处理 → 核对结果',
    '③ 笔记详情：标题 + 摘要 + 要点 + 标签 + 原文，可编辑修正',
    '④ 卡片生成：十套模板一键切换、左右滑换模板，端侧实时渲染，保存到相册',
    '⑤ 分享：卡片图 + 小程序码 → 扫码看公开摘要 → 转存回流',
    '线上 2.0.0（10-08 09:50 发布）· 2.1.8 已提审（10-11 15:22）· 小程序已备案 · 笔记不限量',
    '技术架构：微信原生小程序 → 自建 FastAPI 后端 → Redis/RQ 异步任务 → 腾讯云函数 AI 提炼',
], left=1.0, top=3.8, width=11.0, font_size=14)
add_page_number(slide, 17)

# ============================================================
# Slide 18: 提示词示例与链接
# ============================================================
slide = prs.slides.add_slide(prs.slide_layouts[6])
add_bg(slide)
add_section_header(slide, 6, '提示词示例与智能体链接')

add_text_box(slide, 1.0, 3.2, 11.0, 0.5, '提示词示例（节选自 backend/app/services/llm.py 的 SYSTEM_PROMPT）', font_size=18, color=INK, bold=True)
add_bullet_slide(slide, [
    '唯一一份 system prompt — 链接 / 照片 / 文字三条来源共用：',
    '  "提取一个简洁的标题；写一段 2-3 句话的摘要；提取 3-8 个关键要点（每条一句话）；生成 3-6 个标签（短词）；严格按 JSON 输出 title / summary / key_points / tags"',
    '',
    '「原文翻译」那枚开关只往末尾追加一段语言指令（10-04 起）：',
    '  关 = 标题、摘要、要点、标签都跟随原文的语言，不翻译成中文',
    '  开 = 一律用简体中文写；原文是其他语言时先读懂再整理成中文',
    '',
    '分类由用户当场挑——代码里没有"分类推荐"这条提示词；温度 0.3，不设 maxTokens',
], left=1.0, top=3.8, width=11.0, font_size=13)

add_text_box(slide, 1.0, 6.2, 11.0, 0.5,
             '智能体体验：微信搜索"图麦笔记"小程序  |  官网：agentsbin.cn',
             font_size=16, color=CLAY, bold=True, align=PP_ALIGN.CENTER)
add_page_number(slide, 18)

# ============================================================
# Slide 19: 致谢
# ============================================================
slide = prs.slides.add_slide(prs.slide_layouts[6])
add_bg(slide, INK)
add_text_box(slide, 1.5, 2.5, 10.0, 1.0,
             '感谢评审', font_size=48, color=WHITE, bold=True, align=PP_ALIGN.CENTER)
add_text_box(slide, 1.5, 4.0, 10.0, 0.8,
             '图麦笔记 — AI Agent 驱动的个人知识管理智能体', font_size=22, color=CLAY, align=PP_ALIGN.CENTER)
add_text_box(slide, 1.5, 5.2, 10.0, 0.6,
             '微信搜索"图麦笔记"即刻体验', font_size=16, color=LIGHT_GRAY, align=PP_ALIGN.CENTER)
add_text_box(slide, 1.5, 6.0, 10.0, 0.5,
             '2026 微信小程序开发大赛 · 图麦笔记', font_size=14, color=GRAY, align=PP_ALIGN.CENTER)

# === 保存 ===
out_path = '/Users/zlfmac/Documents/TuMaiBiJi/比赛/图麦笔记-小程序大赛答辩.pptx'
prs.save(out_path)
print(f'PPT saved: {out_path}')
print(f'Total slides: {len(prs.slides)}')
