# -*- coding: utf-8 -*-
"""把 12 段章首小字换成用户视角那一句。

旧值不丢：整段挪进 chapters[i]['intro_old']，页面上不再出现，只留作链。
"""
import json
import os

D = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
P = os.path.join(D, '完整内容.json')
NEW = {
    '01': '打开就是首页：拍照、贴链接、写字，都在这一屏动手。',
    '02': '手上的内容是什么形状，就从哪个口进去：一张图、一条链接，或者自己打几个字。',
    '03': '右滑一下，它先把内容读成中文要点；原文留在下面，随时回来对一眼。',
    '04': '记多了不怕翻：按日期看、按关键词搜、按分类放，要找的那一句能找回来。',
    '05': '自动整理出来的不是成品：改文字、换配图、调顺序，都在这一屏接着做。',
    '06': '同一篇笔记，想让人先看见什么，就选哪一套版式。',
    '07': '你可以只让一篇被看见：发出去、随时撤回，别人转走的是他自己的副本。',
    '08': '有些内容只想自己看：放进「私密」那一格，设六位密码，它就不进分享。',
    '09': '首页背景换成你自己拍的照片，再挑一档顺眼的颜色，连明暗都能调。',
    '10': '你的账号、图片、卡片各存在哪儿，怎么删、删了会怎样，这里写明白了。',
    '11': '不知道去哪儿问、想反馈一句、想看现在是哪一版，都在「我的」这一屏。',
    '12': '旅行之外，同一套办法用在书页、公众号长文和课程资料上。',
}

data = json.load(open(P, encoding='utf-8'))
assert len(data) == 12, len(data)
for ch in data:
    old = ch['intro']
    ch['intro_old'] = old
    ch['intro'] = NEW[ch['id']]
    ch['intro_len'] = len(ch['intro'])
json.dump(data, open(P, 'w', encoding='utf-8'), ensure_ascii=False, indent=2)

back = json.load(open(P, encoding='utf-8'))
print(json.dumps([{'id': c['id'], 'len': len(c['intro']), '旧len': len(c['intro_old'])} for c in back], ensure_ascii=False))
