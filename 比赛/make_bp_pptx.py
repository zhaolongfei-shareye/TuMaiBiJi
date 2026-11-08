#!/usr/bin/env python3
"""Generate English pitch deck PPTX for TuMaiNote (图麦笔记)"""

from pptx import Presentation
from pptx.util import Inches, Pt, Emu
from pptx.dml.color import RGBColor
from pptx.enum.text import PP_ALIGN, MSO_ANCHOR
from pptx.enum.shapes import MSO_SHAPE

# Brand colors
PAPER = RGBColor(0xF2, 0xEF, 0xE9)
INK = RGBColor(0x14, 0x16, 0x1A)
CLAY = RGBColor(0xD2, 0x68, 0x3F)
WHITE = RGBColor(0xFF, 0xFF, 0xFF)
GRAY = RGBColor(0x8A, 0x8A, 0x8A)
LIGHT_GRAY = RGBColor(0xE8, 0xE6, 0xE1)
DARK_INK = RGBColor(0x23, 0x25, 0x2C)

prs = Presentation()
prs.slide_width = Inches(13.333)
prs.slide_height = Inches(7.5)

def add_bg(slide, color=PAPER):
    bg = slide.background
    fill = bg.fill
    fill.solid()
    fill.fore_color.rgb = color

def add_text(slide, left, top, width, height, text, size=18, color=INK, bold=False, align=PP_ALIGN.LEFT, font_name='Helvetica'):
    txBox = slide.shapes.add_textbox(Inches(left), Inches(top), Inches(width), Inches(height))
    tf = txBox.text_frame
    tf.word_wrap = True
    p = tf.paragraphs[0]
    p.text = text
    p.font.size = Pt(size)
    p.font.color.rgb = color
    p.font.bold = bold
    p.font.name = font_name
    p.alignment = align
    return txBox

def add_rect(slide, left, top, width, height, fill_color, corner_radius=None):
    shape = slide.shapes.add_shape(
        MSO_SHAPE.ROUNDED_RECTANGLE if corner_radius else MSO_SHAPE.RECTANGLE,
        Inches(left), Inches(top), Inches(width), Inches(height)
    )
    shape.fill.solid()
    shape.fill.fore_color.rgb = fill_color
    shape.line.fill.background()
    if corner_radius:
        shape.adjustments[0] = corner_radius
    return shape

def add_bullet_list(slide, left, top, width, height, items, size=16, color=INK):
    txBox = slide.shapes.add_textbox(Inches(left), Inches(top), Inches(width), Inches(height))
    tf = txBox.text_frame
    tf.word_wrap = True
    for i, item in enumerate(items):
        if i == 0:
            p = tf.paragraphs[0]
        else:
            p = tf.add_paragraph()
        p.text = item
        p.font.size = Pt(size)
        p.font.color.rgb = color
        p.font.name = 'Helvetica'
        p.space_after = Pt(8)
    return txBox

# ── Slide 1: Cover ──
slide = prs.slides.add_slide(prs.slide_layouts[6])
add_bg(slide)
add_rect(slide, 0, 0, 13.333, 7.5, INK)
add_text(slide, 1.5, 2.0, 10, 1.2, 'TuMaiNote', size=54, color=WHITE, bold=True, align=PP_ALIGN.CENTER)
add_text(slide, 1.5, 3.3, 10, 0.8, 'AI Agent for Personal Knowledge Management', size=24, color=LIGHT_GRAY, align=PP_ALIGN.CENTER)
add_rect(slide, 5.5, 4.5, 2.333, 0.06, CLAY)
add_text(slide, 1.5, 5.0, 10, 0.6, 'Pre-Seed Pitch  |  October 2026', size=16, color=GRAY, align=PP_ALIGN.CENTER)

# ── Slide 2: Problem ──
slide = prs.slides.add_slide(prs.slide_layouts[6])
add_bg(slide)
add_text(slide, 0.8, 0.5, 3, 0.5, '01', size=36, color=CLAY, bold=True)
add_text(slide, 0.8, 1.1, 11, 0.7, 'The Problem: Saved ≠ Usable', size=32, color=INK, bold=True)
add_rect(slide, 0.8, 2.2, 3.6, 4.5, WHITE, 0.05)
add_text(slide, 1.1, 2.4, 3.0, 0.5, 'Bookmark Graveyard', size=18, color=CLAY, bold=True)
add_text(slide, 1.1, 3.0, 3.0, 3.5, 'Articles saved but never re-read.\nScreenshots stored but text not searchable.\nLinks buried in chat histories.\n\n"Saved" captures the entry point, not the content.', size=14, color=DARK_INK)
add_rect(slide, 4.8, 2.2, 3.6, 4.5, WHITE, 0.05)
add_text(slide, 5.1, 2.4, 3.0, 0.5, 'Blank Page Paradox', size=18, color=CLAY, bold=True)
add_text(slide, 5.1, 3.0, 3.0, 3.5, 'Every note app starts with:\n"What do you want to write?"\n\nBut users already have content in hand — someone else\'s article, a screenshot, a quote. They need to organize, not create from scratch.', size=14, color=DARK_INK)
add_rect(slide, 8.8, 2.2, 3.6, 4.5, WHITE, 0.05)
add_text(slide, 9.1, 2.4, 3.0, 0.5, 'Reuse Cost', size=18, color=CLAY, bold=True)
add_text(slide, 9.1, 3.0, 3.0, 3.5, 'When you find that saved thing again, you must re-read the entire piece to extract the one point you need.\n\nMore sources = higher retrieval cost.', size=14, color=DARK_INK)

# ── Slide 3: Solution ──
slide = prs.slides.add_slide(prs.slide_layouts[6])
add_bg(slide)
add_text(slide, 0.8, 0.5, 3, 0.5, '02', size=36, color=CLAY, bold=True)
add_text(slide, 0.8, 1.1, 11, 0.7, 'The Solution: Content → Structure → Visual Card', size=32, color=INK, bold=True)
add_text(slide, 0.8, 2.0, 11, 0.8, 'TuMaiNote is a cross-platform AI knowledge tool — live on WeChat (China), iOS app in development for global rollout.\nIt turns links, screenshots, and notes into structured knowledge cards shareable across any social platform.', size=17, color=DARK_INK)

# Three input boxes
add_rect(slide, 0.8, 3.2, 3.6, 3.5, WHITE, 0.05)
add_text(slide, 1.1, 3.4, 3.0, 0.4, 'Link → Note', size=20, color=CLAY, bold=True)
add_text(slide, 1.1, 4.0, 3.0, 2.5, 'Paste URL → extract article → AI summarizes → structured note with source link', size=15, color=DARK_INK)

add_rect(slide, 4.8, 3.2, 3.6, 3.5, WHITE, 0.05)
add_text(slide, 5.1, 3.4, 3.0, 0.4, 'Screenshot → Note', size=20, color=CLAY, bold=True)
add_text(slide, 5.1, 4.0, 3.0, 2.5, 'Import images (up to 9) → self-hosted OCR → same AI pipeline → structured note', size=15, color=DARK_INK)

add_rect(slide, 8.8, 3.2, 3.6, 3.5, WHITE, 0.05)
add_text(slide, 9.1, 3.4, 3.0, 0.4, 'Handwrite', size=20, color=CLAY, bold=True)
add_text(slide, 9.1, 4.0, 3.0, 2.5, 'You type the title and the text. The summary still runs through the same model (since Oct 4, 2026) — your own title is kept, your original text is stored verbatim.', size=15, color=DARK_INK)

# ── Slide 4: Unified Output Structure ──
slide = prs.slides.add_slide(prs.slide_layouts[6])
add_bg(slide)
add_text(slide, 0.8, 0.5, 3, 0.5, '03', size=36, color=CLAY, bold=True)
add_text(slide, 0.8, 1.1, 11, 0.7, 'Unified Note Structure', size=32, color=INK, bold=True)
add_text(slide, 0.8, 2.0, 11, 0.6, 'All three input channels converge into one consistent output format:', size=18, color=DARK_INK)

# Four output components
components = [
    ('Title', 'From the content — kept as typed on the handwrite entry'),
    ('Summary', '2-3 sentences capturing the core'),
    ('Key Points', '3-8 bullet points extracted by AI'),
    ('Tags', '3-6 category labels for retrieval'),
]
for i, (title, desc) in enumerate(components):
    x = 0.8 + i * 3.1
    add_rect(slide, x, 3.0, 2.8, 3.5, WHITE, 0.05)
    add_text(slide, x + 0.3, 3.3, 2.2, 0.5, title, size=22, color=CLAY, bold=True)
    add_text(slide, x + 0.3, 4.0, 2.2, 2.0, desc, size=15, color=DARK_INK)

# ── Slide 5: AI Agent Pipeline ──
slide = prs.slides.add_slide(prs.slide_layouts[6])
add_bg(slide)
add_text(slide, 0.8, 0.5, 3, 0.5, '04', size=36, color=CLAY, bold=True)
add_text(slide, 0.8, 1.1, 11, 0.7, 'AI Agent Architecture', size=32, color=INK, bold=True)

# Pipeline flow
stages = [
    ('Ingestion', 'Link extraction\nOCR processing\nDirect input'),
    ('Preprocessing', 'Pixel cap (40MP)\nResize (1600px)\nTruncate (12K chars)'),
    ('AI Model', 'Hunyuan LLM\nTemp 0.3\nRetry w/ backoff'),
    ('Output', 'Title + Summary\n+ Key Points\n+ Tags'),
    ('Card Gen', '10 templates\nAdaptive layout\nQR code'),
]
for i, (name, desc) in enumerate(stages):
    x = 0.5 + i * 2.5
    add_rect(slide, x, 2.3, 2.2, 1.0, CLAY, 0.1)
    add_text(slide, x + 0.15, 2.45, 1.9, 0.7, name, size=16, color=WHITE, bold=True, align=PP_ALIGN.CENTER)
    add_rect(slide, x, 3.5, 2.2, 2.0, WHITE, 0.05)
    add_text(slide, x + 0.15, 3.7, 1.9, 1.6, desc, size=13, color=DARK_INK)
    if i < 4:
        add_text(slide, x + 2.2, 2.5, 0.3, 0.5, '→', size=24, color=CLAY, bold=True, align=PP_ALIGN.CENTER)

# Key design principles
add_text(slide, 0.8, 5.8, 11, 0.5, 'Key Principles:', size=16, color=INK, bold=True)
add_text(slide, 0.8, 6.3, 11, 0.8, '• AI failure never destroys extracted content  • Model can be toggled off — product still works  • Self-hosted OCR, no third-party API dependency  • Server-side API key auth', size=14, color=DARK_INK)

# ── Slide 6: Card Templates ──
slide = prs.slides.add_slide(prs.slide_layouts[6])
add_bg(slide)
add_text(slide, 0.8, 0.5, 3, 0.5, '05', size=36, color=CLAY, bold=True)
add_text(slide, 0.8, 1.1, 11, 0.7, '10 Card Templates — One Note, Ten Voices', size=32, color=INK, bold=True)

# Classic templates
add_rect(slide, 0.8, 2.2, 5.8, 4.5, WHITE, 0.05)
add_text(slide, 1.1, 2.4, 5.2, 0.5, '4 Classic (Clarity-First)', size=18, color=CLAY, bold=True)
add_bullet_list(slide, 1.1, 3.1, 5.2, 3.2, [
    '• Jade Paper — dark header band, paper-white body, numbered points',
    '• Verse Slip — one line enlarged on a floating white card',
    '• Layered Paper — colour header, avatar riding the seam, point list',
    '• Vertical Letter — rice-paper stock, columns read right to left',
], size=14, color=DARK_INK)

# Creative templates
add_rect(slide, 7.0, 2.2, 5.5, 4.5, WHITE, 0.05)
add_text(slide, 7.3, 2.4, 4.9, 0.5, '6 Expressive (Share-Worthy)', size=18, color=CLAY, bold=True)
add_bullet_list(slide, 7.3, 3.1, 4.9, 3.2, [
    '• Pop Panels — 4-panel duotone repeat',
    '• Ben-Day Comic — halftone + offset title',
    '• Acid Gradient — glow, big portrait, pill points',
    '• Magazine Cover — portrait under the headline',
    '• Paper & Ink — arch, serif title, vertical source',
    '• Spec Sheet — numbered rows, monospace meta, rules',
], size=14, color=DARK_INK)

# ── Slide 7: Viral Loop ──
slide = prs.slides.add_slide(prs.slide_layouts[6])
add_bg(slide)
add_text(slide, 0.8, 0.5, 3, 0.5, '06', size=36, color=CLAY, bold=True)
add_text(slide, 0.8, 1.1, 11, 0.7, 'Viral Loop: Card → QR → New User', size=32, color=INK, bold=True)

# Flow diagram
flow = [
    ('User creates\nnote & card', 0.8),
    ('Card shared\n(social / print)', 3.5),
    ('Someone scans\nQR code', 6.2),
    ('Lands on public\nabstract page', 8.9),
    ('"Save to my\nnotes" → new user', 11.2),
]
for text, x in flow:
    add_rect(slide, x, 2.5, 2.2, 1.5, CLAY if x == 11.2 else WHITE, 0.08)
    add_text(slide, x + 0.1, 2.7, 2.0, 1.1, text, size=14, color=WHITE if x == 11.2 else DARK_INK, bold=(x == 11.2), align=PP_ALIGN.CENTER)
    if x < 11.2:
        add_text(slide, x + 2.2, 2.9, 0.5, 0.5, '→', size=20, color=CLAY, bold=True, align=PP_ALIGN.CENTER)

add_text(slide, 0.8, 4.5, 11, 2.5,
    'Every card is an acquisition channel.\n'
    '• Cards are images — work on any platform (WeChat Moments, Xiaohongshu, printed paper)\n'
    '• QR code bridges physical → digital without requiring any app integration\n'
    '• "Save to my notes" copies title + summary + points + tags + source link — instant value for new user\n'
    '• The reader keeps an independent copy — revoking the author\'s share does not erase what was already saved',
    size=15, color=DARK_INK)

# ── Slide 8: Cross-Platform Strategy (NEW) ──
slide = prs.slides.add_slide(prs.slide_layouts[6])
add_bg(slide)
add_text(slide, 0.8, 0.5, 3, 0.5, '07', size=36, color=CLAY, bold=True)
add_text(slide, 0.8, 1.1, 11, 0.7, 'Cross-Platform: China + Global', size=32, color=INK, bold=True)
add_text(slide, 0.8, 2.0, 11, 0.5, 'WeChat Mini Program (live, China) → iOS native app (in development, global)', size=18, color=DARK_INK)

# Comparison table
headers = ['Capability', 'WeChat Mini Program', 'iOS App']
rows = [
    ['Card export', 'Save to album', 'Save to album + Share Sheet'],
    ['QR scan', 'WeChat native scan', 'Camera + universal link'],
    ['Shared content', 'Mini Program page', 'H5 URL (any browser)'],
    ['Social sharing', 'WeChat only', 'Instagram, X, TikTok, WhatsApp…'],
    ['One-click save', 'In-app only', 'Share Extension → save from any app'],
    ['Card dimensions', 'Fixed 750px width', 'Adaptive per platform'],
]

col_widths = [2.5, 4.0, 5.0]
col_starts = [0.8, 3.3, 7.3]
table_top = 2.8

# Header row
for j, (header, x, w) in enumerate(zip(headers, col_starts, col_widths)):
    add_rect(slide, x, table_top, w, 0.5, CLAY, 0.06)
    add_text(slide, x + 0.15, table_top + 0.07, w - 0.3, 0.35, header, size=14, color=WHITE, bold=True, align=PP_ALIGN.CENTER)

# Data rows
for i, row in enumerate(rows):
    y = table_top + 0.6 + i * 0.6
    bg = WHITE if i % 2 == 0 else LIGHT_GRAY
    for j, (cell, x, w) in enumerate(zip(row, col_starts, col_widths)):
        add_rect(slide, x, y, w, 0.5, bg, 0.04)
        add_text(slide, x + 0.15, y + 0.07, w - 0.3, 0.35, cell, size=13, color=DARK_INK, bold=(j == 0))

# ── Slide 9: Platform-Adaptive Card Sizing (NEW) ──
slide = prs.slides.add_slide(prs.slide_layouts[6])
add_bg(slide)
add_text(slide, 0.8, 0.5, 3, 0.5, '08', size=36, color=CLAY, bold=True)
add_text(slide, 0.8, 1.1, 11, 0.7, 'Platform-Adaptive Card Sizing (Planned)', size=32, color=INK, bold=True)
add_text(slide, 0.8, 2.0, 11, 0.5, 'Design target for the iOS app — not shipped today. One note → a card sized for each platform.', size=18, color=DARK_INK)

# Platform sizing table
size_headers = ['Platform', 'Ratio', 'Resolution', 'Use Case']
size_rows = [
    ['Instagram Feed', '4:5', '1080×1350', 'Main feed posts'],
    ['Instagram Story', '9:16', '1080×1920', 'Full-screen stories'],
    ['X (Twitter)', '16:9', '1200×675', 'Timeline cards'],
    ['Xiaohongshu', '3:4', '1080×1440', 'Note-style posts'],
    ['WeChat Moments', '1:1', '1080×1080', 'Square format'],
    ['Print', 'A4', '2480×3508', 'Physical cards, journals'],
]

scol_starts = [0.8, 3.8, 5.5, 8.0]
scol_widths = [2.8, 1.5, 2.3, 4.5]
stable_top = 2.8

for j, (header, x, w) in enumerate(zip(size_headers, scol_starts, scol_widths)):
    add_rect(slide, x, stable_top, w, 0.5, CLAY, 0.06)
    add_text(slide, x + 0.15, stable_top + 0.07, w - 0.3, 0.35, header, size=14, color=WHITE, bold=True, align=PP_ALIGN.CENTER)

for i, row in enumerate(size_rows):
    y = stable_top + 0.6 + i * 0.6
    bg = WHITE if i % 2 == 0 else LIGHT_GRAY
    for j, (cell, x, w) in enumerate(zip(row, scol_starts, scol_widths)):
        add_rect(slide, x, y, w, 0.5, bg, 0.04)
        add_text(slide, x + 0.15, y + 0.07, w - 0.3, 0.35, cell, size=13, color=DARK_INK, bold=(j == 0))

# Bottom callout
add_rect(slide, 0.8, 6.2, 11.7, 0.9, WHITE, 0.05)
add_text(slide, 1.1, 6.35, 11.1, 0.6,
    'QR code on every card → H5 URL (not WeChat-locked). Any camera scans it, any browser opens it.\niOS users see "Save to TuMaiNote" → one-click import via Universal Link or Share Extension.',
    size=14, color=DARK_INK)

# ── Slide 10: Market ──
slide = prs.slides.add_slide(prs.slide_layouts[6])
add_bg(slide)
add_text(slide, 0.8, 0.5, 3, 0.5, '09', size=36, color=CLAY, bold=True)
add_text(slide, 0.8, 1.1, 11, 0.7, 'Market & Positioning', size=32, color=INK, bold=True)

# Target users
add_rect(slide, 0.8, 2.2, 5.8, 2.0, WHITE, 0.05)
add_text(slide, 1.1, 2.4, 5.2, 0.4, 'Target Users', size=18, color=CLAY, bold=True)
add_bullet_list(slide, 1.1, 3.0, 5.2, 1.0, [
    '• Knowledge workers consuming 10+ articles/day',
    '• Content creators transforming research into shareable formats',
    '• Students & researchers organizing references',
], size=14, color=DARK_INK)

# Why start WeChat, then global
add_rect(slide, 7.0, 2.2, 5.5, 2.0, WHITE, 0.05)
add_text(slide, 7.3, 2.4, 4.9, 0.4, 'WeChat → Global', size=18, color=CLAY, bold=True)
add_bullet_list(slide, 7.3, 3.0, 4.9, 1.0, [
    '• WeChat: 1.3B MAU, zero install, near-zero cost',
    '• iOS: 1B+ devices, Share Sheet, App Store discovery',
    '• QR → H5 URL bridges both ecosystems',
], size=14, color=DARK_INK)

# Competitive landscape
add_rect(slide, 0.8, 4.6, 11.7, 2.5, WHITE, 0.05)
add_text(slide, 1.1, 4.8, 11.1, 0.4, 'Competitive Position', size=18, color=CLAY, bold=True)
add_text(slide, 1.1, 5.4, 11.1, 1.5,
    'Note apps (Notion, Bear): blank page start, no AI summarization of external content, no visual cards\n'
    'Read-later (Pocket, Instapaper): save but don\'t transform, no card generation\n'
    'AI writing tools (Jasper): generate new content, don\'t organize existing content\n\n'
    'TuMaiNote occupies: Content Ingestion + AI Structuring + Visual Output + Social Distribution',
    size=14, color=DARK_INK)

# ── Slide 11: Business Model ──
slide = prs.slides.add_slide(prs.slide_layouts[6])
add_bg(slide)
add_text(slide, 0.8, 0.5, 3, 0.5, '10', size=36, color=CLAY, bold=True)
add_text(slide, 0.8, 1.1, 11, 0.7, 'Business Model', size=32, color=INK, bold=True)

# Current
add_rect(slide, 0.8, 2.2, 5.8, 4.5, WHITE, 0.05)
add_text(slide, 1.1, 2.4, 5.2, 0.5, 'Current: Free Growth Engine', size=18, color=CLAY, bold=True)
add_bullet_list(slide, 1.1, 3.1, 5.2, 3.2, [
    '• No paywall, no membership, no per-use charges',
    '• All 10 templates free',
    '• Notes are unlimited — gate removed Oct 1, 2026',
    '• "MIND" starts at 100: a score, not a cap',
    '• +10 MIND per new writer who posts a first note',
    '• +1 MIND per reader who saves it (once each)',
    '',
    'Free model maximizes viral coefficient:',
    '• Every shared card = acquisition channel',
    '• MIND growth tied to referrals, not payment',
    '• Zero friction for card sharing',
], size=14, color=DARK_INK)

# Future
add_rect(slide, 7.0, 2.2, 5.5, 4.5, WHITE, 0.05)
add_text(slide, 7.3, 2.4, 4.9, 0.5, 'Future: Brand Collaboration', size=18, color=CLAY, bold=True)
add_bullet_list(slide, 7.3, 3.1, 4.9, 3.2, [
    '• Brand provides visual assets',
    '• Product provides content structure',
    '• User gets branded knowledge card',
    '• Limited-edition co-branded templates',
    '',
    'Status: Directional thinking only.',
    'No brand partnerships exist.',
    'No timeline committed.',
    '',
    'Current free commitment remains:',
    'No membership, no paywall, all templates free.',
], size=14, color=DARK_INK)

# ── Slide 12: Tech Stack ──
slide = prs.slides.add_slide(prs.slide_layouts[6])
add_bg(slide)
add_text(slide, 0.8, 0.5, 3, 0.5, '11', size=36, color=CLAY, bold=True)
add_text(slide, 0.8, 1.1, 11, 0.7, 'Technology Stack', size=32, color=INK, bold=True)

stack = [
    ('China Frontend', 'WeChat Native Mini Program'),
    ('Global Frontend', 'iOS Native App (Swift/SwiftUI) — in development'),
    ('Web', 'H5 public pages (universal link target)'),
    ('Backend', 'FastAPI (Python), self-hosted'),
    ('AI Model', 'Tencent Hunyuan (hy3-preview) via Cloud Function'),
    ('OCR', 'RapidOCR + ONNX Runtime (self-hosted, CPU)'),
    ('Task Queue', 'Redis + RQ (async processing)'),
    ('Extraction', 'trafilatura (open-source)'),
    ('Database', 'SQLite (current), PostgreSQL-ready'),
    ('Cloud', 'Tencent CloudBase (cloud functions + object storage for user image backup)'),
]
for i, (layer, tech) in enumerate(stack):
    y = 2.2 + i * 0.5
    add_rect(slide, 0.8, y, 2.5, 0.42, CLAY if i % 2 == 0 else DARK_INK, 0.08)
    add_text(slide, 1.0, y + 0.05, 2.1, 0.32, layer, size=13, color=WHITE, bold=True, align=PP_ALIGN.CENTER)
    add_text(slide, 3.6, y + 0.05, 9, 0.32, tech, size=14, color=DARK_INK)

# ── Slide 13: Traction ──
slide = prs.slides.add_slide(prs.slide_layouts[6])
add_bg(slide)
add_text(slide, 0.8, 0.5, 3, 0.5, '12', size=36, color=CLAY, bold=True)
add_text(slide, 0.8, 1.1, 11, 0.7, 'Traction & Validation', size=32, color=INK, bold=True)

add_rect(slide, 0.8, 2.2, 3.6, 2.5, WHITE, 0.05)
add_text(slide, 1.1, 2.4, 3.0, 0.4, 'Development Speed', size=18, color=CLAY, bold=True)
add_text(slide, 1.1, 3.0, 3.0, 1.5, 'Sep 17: first runnable loop\nSep 24: 2.0 feature baseline\nOct 8: 2.0.0 live\nOct 11: 2.1.8 in review', size=14, color=DARK_INK)

add_rect(slide, 4.8, 2.2, 3.6, 2.5, WHITE, 0.05)
add_text(slide, 5.1, 2.4, 3.0, 0.4, 'Testing', size=18, color=CLAY, bold=True)
add_text(slide, 5.1, 3.0, 3.0, 1.5, 'Backend: pipeline, failure, isolation, sharing\nClient: DevTools + automator\n20 live deploys, each re-probed on prod', size=14, color=DARK_INK)

add_rect(slide, 8.8, 2.2, 3.6, 2.5, WHITE, 0.05)
add_text(slide, 9.1, 2.4, 3.0, 0.4, 'AI Leverage', size=18, color=CLAY, bold=True)
add_text(slide, 9.1, 3.0, 3.0, 1.5, 'Solo founder + AI coding tools\nFull-stack: product, design, engineering, deployment', size=14, color=DARK_INK)

add_rect(slide, 0.8, 5.0, 11.7, 2.0, WHITE, 0.05)
add_text(slide, 1.1, 5.2, 11.1, 0.4, 'Honest Boundaries', size=18, color=CLAY, bold=True)
add_text(slide, 1.1, 5.8, 11.1, 1.0,
    '• No claimed user scale numbers  • No claimed accuracy percentages\n'
    '• Interface screenshots are dev artifacts, not production user data\n'
    '• OCR quality depends on image clarity  • iOS app is in development — not yet shipped',
    size=14, color=DARK_INK)

# ── Slide 14: The Ask ──
slide = prs.slides.add_slide(prs.slide_layouts[6])
add_bg(slide)
add_text(slide, 0.8, 0.5, 3, 0.5, '13', size=36, color=CLAY, bold=True)
add_text(slide, 0.8, 1.1, 11, 0.7, 'The Ask', size=32, color=INK, bold=True)

add_text(slide, 0.8, 2.2, 11, 0.6, 'Seeking pre-seed funding to ship iOS app, scale infrastructure, expand templates, and grow distribution.', size=20, color=DARK_INK)

alloc = [
    ('iOS Dev', '35%', 'Native iOS app development (2-3 hires)'),
    ('Infrastructure', '30%', 'Dedicated compute for OCR & model inference'),
    ('Design', '15%', 'Premium template ecosystem'),
    ('Growth', '20%', 'Viral loop optimization across WeChat + global platforms'),
]
for i, (area, pct, desc) in enumerate(alloc):
    y = 3.2 + i * 0.9
    add_rect(slide, 0.8, y, 2.0, 0.7, CLAY, 0.08)
    add_text(slide, 0.9, y + 0.15, 1.8, 0.4, f'{area}  {pct}', size=16, color=WHITE, bold=True, align=PP_ALIGN.CENTER)
    add_text(slide, 3.2, y + 0.15, 9, 0.4, desc, size=16, color=DARK_INK)

# ── Slide 15: Closing ──
slide = prs.slides.add_slide(prs.slide_layouts[6])
add_bg(slide)
add_rect(slide, 0, 0, 13.333, 7.5, INK)
add_text(slide, 1.5, 2.0, 10, 1.0, 'TuMaiNote', size=48, color=WHITE, bold=True, align=PP_ALIGN.CENTER)
add_text(slide, 1.5, 3.2, 10, 0.6, 'Let valuable information go beyond bookmarks.', size=22, color=LIGHT_GRAY, align=PP_ALIGN.CENTER)
add_rect(slide, 5.5, 4.1, 2.333, 0.06, CLAY)
add_text(slide, 1.5, 4.6, 10, 0.5, 'agentsbin.cn', size=18, color=GRAY, align=PP_ALIGN.CENTER)
add_text(slide, 1.5, 5.2, 10, 0.5, 'WeChat Mini Program: 图麦笔记  |  iOS App: Coming Soon', size=16, color=GRAY, align=PP_ALIGN.CENTER)

# Save
out = '/Users/zlfmac/Documents/TuMaiBiJi/比赛/TuMaiNote-Pitch-Deck-EN.pptx'
prs.save(out)
print(f'Saved: {out}')
print(f'Total slides: {len(prs.slides)}')
