# -*- coding: utf-8 -*-
"""按小程序 2.4.16 源码逐屏画的单色界面线稿库。

每屏拆成命名区域，focus 传入区域 id 即套陶土色高亮并在右侧标序号。
屏上文字一律取自 miniprogram/utils/i18n.js 的 zh 字典或页面 wxml 原文，
不许凭印象造字样。产物是内联 SVG，标注为「界面位置示意」，不是截图。
"""
from html import escape

INK = '#19201f'
LINE = '#c9cdc3'
CLAY = '#b95b3b'
MUTED = '#59635c'
GREEN = '#223d35'
SHELL = '#ffffff'

W, H = 300, 476
FRAME_X, FRAME_W = 6, 250
PAD = 15
CX = FRAME_X + PAD
CW = FRAME_W - PAD * 2
TOP = 34
TAB_H = 46


# 示意文字要按成册里的实际渲染尺寸来定：字身整体放大一档，
# 宁可少几个字，也不要小成一团看不清。
SCALE = 1.42


def _fit(s, w, size):
    """按容器宽裁字，宁可省略也不让示意文字压出格子。"""
    room = max(1, int(w))
    n = max(1, int(room // (size * SCALE)))
    return s if len(s) <= n else s[:max(1, n - 1)] + '…'


def _tx(x, y, s, size=8.6, fill=INK, anchor='start', weight=400):
    return (f'<text x="{x:.1f}" y="{y:.1f}" font-size="{size * SCALE:.2f}" fill="{fill}" '
            f'text-anchor="{anchor}" font-weight="{weight}">{escape(s)}</text>')


def _r(x, y, w, h, rx=3, stroke=LINE, fill='none', sw=1, dash=None):
    d = f' stroke-dasharray="{dash}"' if dash else ''
    st = f' stroke="{stroke}" stroke-width="{sw}"' if stroke else ''
    return f'<rect x="{x:.1f}" y="{y:.1f}" width="{w:.1f}" height="{h:.1f}" rx="{rx}" fill="{fill}"{st}{d}/>'


# ---------------------------------------------------------------- 屏定义
# k: nav 顶栏 / h1 大标题 / txt 说明行 / row 横排 / box 图位 / chips 分类条
#    grid 方格阵 / list 列表行 / slide 滑动条 / tab 底栏 / gap 留白 / sheet 浮层
#    swatch 色块排 / pillrow 药丸开关 / card 弹窗卡
def _screens():
    S = {}

    S['create-home'] = [
        {'k': 'row', 'id': 'topline', 'h': 20, 'c': [
            {'t': '告诉好友', 'id': 'recommend', 's': 'pill', 'w': 62},
            {'t': '图麦笔记：仅需10秒拍照截图网页转笔记', 's': 'text'},
            {'t': 'EN', 'id': 'lang', 's': 'mini', 'w': 34}]},
        {'k': 'h1', 'id': 'title', 't': '看到好内容', 't2': '随手记下来'},
        {'k': 'row', 'id': 'swap', 'h': 17, 'c': [{'t': '调亮度', 'id': 'dim', 's': 'link'},
                                                  {'t': '换背景', 'id': 'bg', 's': 'link'},
                                                  {'t': '换心情', 'id': 'mood', 's': 'link'}]},
        {'k': 'row', 'id': 'blk', 'h': 96, 'c': [
            {'t': '人物', 'id': 'person', 's': 'image', 'w': 96},
            {'t': '笔记', 'id': 'statNotes', 's': 'cell', 'v': '12'},
            {'t': '图片', 'id': 'statImages', 's': 'cell', 'v': '48'}]},
        {'k': 'txt', 'id': 'tips', 't': 'Tips：拍照或截图存进来，会自动提炼成要点'},
        {'k': 'row', 'id': 'plusRow', 'h': 26, 'c': [
            {'t': '＋', 'id': 'plus', 's': 'pill', 'w': 30},
            {'t': '记下来', 'id': 'plusLabel', 's': 'text'}]},
        {'k': 'tab', 'c': [{'t': '新建', 'on': True}, {'t': '笔记'}, {'t': '我的'}]},
    ]

    S['create-photo'] = [
        {'k': 'row', 'id': 'panel', 'h': 24, 'c': [{'t': '照片', 's': 'seg', 'on': True},
                                                   {'t': '链接', 's': 'seg'}, {'t': '文字', 's': 'seg'}]},
        {'k': 'row', 'id': 'pick', 'h': 54, 'c': [{'t': '相册', 'id': 'album', 's': 'mini'},
                                                  {'t': '拍照', 'id': 'shutter', 's': 'shutter'},
                                                  {'t': '粘贴', 'id': 'paste', 's': 'mini'}]},
        {'k': 'grid', 'id': 'shots', 'n': 3, 'rows': 3, 'labels': ['1', '2', '3', '4', '5', '6', '7', '8', '+'],
         'mark': '违规', 'mark_at': 5},
        {'k': 'txt', 'id': 'maxhint', 't': '最多 9 张，先删一张再加'},
        {'k': 'gap', 'h': 8},
        {'k': 'row', 'id': 'translate', 'h': 24, 'c': [
            {'t': '原文翻译', 's': 'label', 'w': 52},
            {'t': '识别到外文自动翻译成中文', 'id': 'translateHint', 's': 'text'},
            {'t': '', 'id': 'switch', 's': 'switch', 'w': 30}]},
        {'k': 'slide', 'id': 'slide', 't': '右滑开始提炼'},
        {'k': 'tab', 'c': [{'t': '新建', 'on': True}, {'t': '笔记'}, {'t': '我的'}]},
    ]

    S['create-url'] = [
        {'k': 'row', 'id': 'panel', 'h': 24, 'c': [{'t': '照片', 's': 'seg'},
                                                   {'t': '链接', 's': 'seg', 'on': True}, {'t': '文字', 's': 'seg'}]},
        {'k': 'box', 'id': 'field', 'h': 52, 't': '公众号文章 / 网页链接', 's': 'input'},
        {'k': 'row', 'id': 'paste', 'h': 22, 'c': [{'t': '粘贴', 's': 'pill', 'w': 46},
                                                   {'t': '链接要以 http:// 或 https:// 开头', 's': 'text'}]},
        {'k': 'gap', 'h': 10},
        {'k': 'row', 'id': 'translate', 'h': 26, 'c': [{'t': '原文翻译', 's': 'label', 'w': 52},
                                                       {'t': '识别到外文自动翻译成中文', 's': 'text'},
                                                       {'t': '', 'id': 'switch', 's': 'switch', 'w': 30}]},
        {'k': 'gap', 'h': 12},
        {'k': 'slide', 'id': 'slide', 't': '右滑开始提炼'},
        {'k': 'tab', 'c': [{'t': '新建', 'on': True}, {'t': '笔记'}, {'t': '我的'}]},
    ]

    S['create-write'] = [
        {'k': 'row', 'id': 'panel', 'h': 24, 'c': [{'t': '照片', 's': 'seg'}, {'t': '链接', 's': 'seg'},
                                                   {'t': '文字', 's': 'seg', 'on': True}]},
        {'k': 'box', 'id': 'body', 'h': 118, 't': '把原文贴在这里，摘要自动生成', 's': 'area'},
        {'k': 'row', 'id': 'counter', 'h': 14, 'c': [{'t': '0 / 2000', 's': 'text'}]},
        {'k': 'gap', 'h': 10},
        {'k': 'row', 'id': 'translate', 'h': 26, 'c': [{'t': '原文翻译', 's': 'label', 'w': 52},
                                                       {'t': '识别到外文自动翻译成中文', 's': 'text'},
                                                       {'t': '', 'id': 'switch', 's': 'switch', 'w': 30}]},
        {'k': 'gap', 'h': 12},
        {'k': 'slide', 'id': 'slide', 't': '右滑开始提炼'},
        {'k': 'tab', 'c': [{'t': '新建', 'on': True}, {'t': '笔记'}, {'t': '我的'}]},
    ]

    S['list'] = [
        {'k': 'band', 'id': 'head', 'h': 74, 't': '我的笔记', 'sub': '背景照片 · 字色随深浅自动切换'},
        {'k': 'row', 'id': 'bar', 'h': 26, 'c': [{'t': '搜索笔记', 'id': 'search', 's': 'input', 'w': 150},
                                                 {'t': '', 'id': 'catGrid', 's': 'icon', 'w': 24, 'glyph': 'grid'},
                                                 {'t': '', 'id': 'searchGo', 's': 'icon', 'w': 24, 'glyph': 'search'}]},
        {'k': 'chips', 'id': 'cats', 'c': ['全部', '学习', '旅行', '灵感', '私密', '添加分类']},
        {'k': 'list', 'id': 'rows', 'rows': 4},
        {'k': 'gap', 'h': 10},
        {'k': 'txt', 'id': 'more', 't': '显示更多'},
        {'k': 'tab', 'c': [{'t': '新建'}, {'t': '笔记', 'on': True}, {'t': '我的'}]},
    ]

    # 2.4.16 的真相：井格那一枚只开**笔记页自己的管理态**。独立的 pages/categories 那一页
    # 两个入口（首页跳转与「我的」那一行）都已撤，页文件留着没删。所以这一屏画管理态：
    # 输入框长在井格右手边、这一态没有搜索那枚、芯片不画「全部」、每枚右上角一枚 ✕（私密不画）。
    S['list-edit'] = [
        {'k': 'band', 'id': 'head', 'h': 58, 't': '我的笔记', 'sub': '背景照片 · 字色随深浅自动切换'},
        {'k': 'row', 'id': 'bar', 'h': 28, 'c': [
            {'t': '', 'id': 'catGrid', 's': 'icon', 'w': 26, 'glyph': 'grid', 'on': True},
            {'t': '新增分类，空格分开', 'id': 'addInput', 's': 'input'}]},
        {'k': 'chips', 'id': 'cats', 'edit': True, 'c': ['学习', '旅行', '灵感', '代码', '私密']},
        {'k': 'note', 'id': 'catNote', 't': '这一格里有 5 篇，删掉会归到未分类。'},
        {'k': 'list', 'id': 'rows', 'rows': 3},
        {'k': 'txt', 'id': 'blank', 't': '改动先留本机 · 点页面空白那一下批量保存'},
        {'k': 'tab', 'c': [{'t': '新建'}, {'t': '笔记', 'on': True}, {'t': '我的'}]},
    ]

    S['detail'] = [
        {'k': 'nav', 'id': 'nav', 't': '笔记详情'},
        {'k': 'h1', 'id': 'hero', 't': '标题', 'chips': ['标签一', '标签二'], 'h': 36},
        {'k': 'row', 'id': 'actions', 'h': 20, 'c': [{'t': '编辑', 'id': 'edit', 's': 'pill', 'w': 56},
                                                     {'t': '分享', 'id': 'share', 's': 'pill', 'w': 56},
                                                     {'t': '删除', 'id': 'del', 's': 'pill', 'w': 56}]},
        {'k': 'sec', 'id': 'shots', 't': '配图', 'n': 3, 'lines': 0},
        {'k': 'sec', 'id': 'summary', 't': '摘要', 'lines': 2},
        {'k': 'sec', 'id': 'points', 't': '核心要点', 'lines': 2, 's': 'bullets'},
        {'k': 'sec', 'id': 'source', 't': '来源链接', 'lines': 1},
        {'k': 'sec', 'id': 'original', 't': '原文内容', 'lines': 2, 'more': '展开'},
        {'k': 'sec', 'id': 'imported', 't': '转存来源', 'lines': 2},
        {'k': 'tab', 'c': [{'t': '新建'}, {'t': '笔记', 'on': True}, {'t': '我的'}]},
    ]

    S['detail-sheet'] = [
        {'k': 'sheet', 'id': 'grip', 'h': 20, 't': '左右滑动看下一篇', 'r': '点一下收起'},
        {'k': 'h1', 'id': 'hero', 't': '标题', 'chips': ['标签一', '标签二']},
        {'k': 'sec', 'id': 'summary', 't': '摘要', 'lines': 2},
        {'k': 'sec', 'id': 'points', 't': '核心要点', 'lines': 2, 's': 'bullets'},
        {'k': 'sec', 'id': 'original', 't': '原文内容', 'lines': 2, 'more': '展开'},
        {'k': 'row', 'id': 'actions', 'h': 24, 'c': [{'t': '编辑', 'id': 'edit', 's': 'pill', 'w': 56},
                                                     {'t': '分享', 'id': 'share', 's': 'pill', 'w': 56},
                                                     {'t': '删除', 'id': 'del', 's': 'pill', 'w': 56}]},
        {'k': 'row', 'id': 'pubstate', 'h': 20, 'c': [{'t': '这篇已经公开，别人扫码能看', 's': 'text'},
                                                      {'t': '撤掉分享', 'id': 'unshare', 's': 'linkr', 'w': 52}]},
        {'k': 'tab', 'c': [{'t': '新建'}, {'t': '笔记', 'on': True}, {'t': '我的'}]},
    ]

    S['tpl-sheet'] = [
        {'k': 'sheet', 'id': 'grip', 'h': 20, 't': '左右滑换模板', 'r': '点一下收起'},
        {'k': 'card', 'id': 'preview', 'h': 150, 't': '卡片预览'},
        {'k': 'row', 'id': 'using', 'h': 16, 'c': [{'t': '当前模板：玉版宣', 's': 'text'}]},
        {'k': 'dots', 'id': 'dots', 'n': 11},
        {'k': 'row', 'id': 'btns', 'h': 24, 'c': [{'t': '查看笔记', 's': 'pill', 'w': 74},
                                                  {'t': '编辑卡片信息', 's': 'pill', 'w': 88},
                                                  {'t': '删除分享图', 's': 'pill', 'w': 74}]},
        {'k': 'pillrow', 'id': 'qr', 't': '开启二维码｜朋友扫码就能转存'},
        {'k': 'gap', 'h': 8},
        {'k': 'txt', 'id': 'shareline', 't': '分享到：微信好友 / 朋友圈 / 公众号'},
        {'k': 'tab', 'c': [{'t': '新建'}, {'t': '笔记', 'on': True}, {'t': '我的'}]},
    ]

    S['market'] = [
        {'k': 'nav', 'id': 'nav', 't': '卡片市场', 'r': '编辑卡片信息'},
        {'k': 'txt', 'id': 'g1', 't': '经典款（5）'},
        {'k': 'cells', 'id': 'row1', 'n': 4, 'labels': ['玉版宣', '摘句', '叠翠', '规格卡'], 'on': 0},
        {'k': 'txt', 'id': 'g2', 't': '个性款（6）'},
        {'k': 'cells', 'id': 'row2', 'n': 4, 'labels': ['素宣信笺', '波普分格', '网点漫画', '荧光渐变']},
        {'k': 'txt', 'id': 'g3', 't': '图文卡（下发）'},
        {'k': 'cells', 'id': 'row3', 'n': 2, 'labels': ['杂志封面', '纸间文艺']},
        {'k': 'gap', 'h': 12},
        {'k': 'txt', 'id': 'hint', 't': '左右滑着挑，选中那一格带圆点'},
        {'k': 'tab', 'c': [{'t': '新建'}, {'t': '笔记'}, {'t': '我的'}]},
    ]

    S['me-set'] = [
        {'k': 'band', 'id': 'head', 'h': 66, 't': '你好！我是图麦笔记', 'sub': '名称 · 一句话', 'r': '魅力 12'},
        {'k': 'row', 'id': 'seg', 'h': 24, 'c': [{'t': '设置', 's': 'seg', 'on': True, 'w': 60},
                                                 {'t': '关于', 's': 'seg', 'w': 60}]},
        {'k': 'menu', 'id': 'menu', 'rows': [
            ('卡片市场', '分享给朋友那张卡片上印什么', 'market'),
            ('外观设置', '整个界面的配色，挑顺眼的一套', 'wallpaper'),
            ('私密密码', '锁住不想让别人看到的笔记', 'private'),
            ('我的邮箱', '未填写', 'email'),
            ('图片云空间', '全站已用 12%', 'storage'),
            ('注销账号', '', 'delete')]},
        {'k': 'tab', 'c': [{'t': '新建'}, {'t': '笔记'}, {'t': '我的', 'on': True}]},
    ]

    S['me-about'] = [
        {'k': 'band', 'id': 'head', 'h': 66, 't': '你好！我是图麦笔记', 'sub': '名称 · 一句话', 'r': '魅力 12'},
        {'k': 'row', 'id': 'seg', 'h': 24, 'c': [{'t': '设置', 's': 'seg', 'w': 60},
                                                 {'t': '关于', 's': 'seg', 'on': True, 'w': 60}]},
        {'k': 'card', 'id': 'identity', 'h': 62, 't': '图麦笔记', 'sub': '把图文，提炼成有用的干货', 's': 'plain'},
        {'k': 'menu', 'id': 'menu', 'rows': [
            ('产品官网', '', 'site'), ('反馈邮箱', '', 'mail'),
            ('推荐图麦', '', 'recommend'), ('魅力值规则', '新用户 · 推荐朋友使用 · 笔记被朋友种草', 'mind')]},
        {'k': 'txt', 'id': 'version', 't': '当前版本：2.4.16　开发主体：个人开发者'},
        {'k': 'tab', 'c': [{'t': '新建'}, {'t': '笔记'}, {'t': '我的', 'on': True}]},
    ]

    S['wallpaper'] = [
        {'k': 'nav', 'id': 'nav', 't': '外观设置'},
        {'k': 'txt', 'id': 'hint', 't': '外观都在这里，换完当场生效，下次换手机也还在'},
        {'k': 'gap', 'h': 8},
        {'k': 'txt', 'id': 'sec', 't': '页面壁纸', 'weight': 700},
        {'k': 'txt', 'id': 'subhint', 't': '四枚都带整套色阶：页面底、卡底、左侧方块和墨色一起换'},
        {'k': 'phone', 'id': 'mock', 'h': 132},
        {'k': 'txt', 'id': 'swatchhint', 't': '点下面色块直接生效'},
        {'k': 'swatch', 'id': 'swatch', 'c': [('象牙', '#B1A299'), ('天青', '#9BBCA3'),
                                              ('樱落', '#B5A8BF'), ('雨雾', '#A4B0C0')], 'on': 0},
        {'k': 'txt', 'id': 'inuse', 't': '现在在用：象牙'},
        {'k': 'gap', 'h': 8},
        {'k': 'row', 'id': 'mood', 'h': 22, 'c': [{'t': '墨', 's': 'seg', 'on': True, 'w': 30},
                                                  {'t': '象牙', 's': 'seg', 'w': 42}, {'t': '天青', 's': 'seg', 'w': 42},
                                                  {'t': '樱落', 's': 'seg', 'w': 42}, {'t': '雨雾', 's': 'seg', 'w': 30}]},
    ]

    S['private'] = [
        {'k': 'nav', 'id': 'nav', 't': '我的'},
        {'k': 'gap', 'h': 16},
        {'k': 'card', 'id': 'pin', 'h': 132, 't': '输入密码', 'sub': '请输入 6 位数字密码', 's': 'dialog'},
        {'k': 'gap', 'h': 12},
        {'k': 'txt', 'id': 'scene', 't': '看私密笔记的内容时要输这串；归到私密的笔记不出笔记卡片。'},
        {'k': 'gap', 'h': 10},
        {'k': 'row', 'id': 'reset', 'h': 24, 'c': [{'t': '重置密码', 'id': 'resetBtn', 's': 'pill', 'w': 74},
                                                   {'t': '指纹或面容确认', 'id': 'bio', 's': 'text'}]},
        {'k': 'gap', 'h': 8},
        {'k': 'txt', 'id': 'cat', 't': '私密分类固定在最后一格'},
        {'k': 'tab', 'c': [{'t': '新建'}, {'t': '笔记'}, {'t': '我的', 'on': True}]},
    ]

    S['share-view'] = [
        {'k': 'nav', 'id': 'nav', 't': '分享详情'},
        {'k': 'txt', 'id': 'from', 't': '来自图麦笔记'},
        {'k': 'h1', 'id': 'hero', 't': '标题'},
        {'k': 'sec', 'id': 'summary', 't': '摘要', 'lines': 2},
        {'k': 'sec', 'id': 'points', 't': '核心要点', 'lines': 3, 's': 'bullets'},
        {'k': 'sec', 'id': 'source', 't': '来源链接', 'lines': 1},
        {'k': 'row', 'id': 'author', 'h': 18, 'c': [{'t': '原创作者：林夏', 's': 'text'}]},
        {'k': 'gap', 'h': 10},
        {'k': 'slide', 'id': 'import', 't': '存入笔记', 's': 'button'},
        {'k': 'row', 'id': 'report', 'h': 22, 'c': [{'t': '举报这篇', 's': 'pill', 'w': 68},
                                                    {'t': '垃圾广告 / 有害内容 / 侵权 / 其他', 's': 'text'}]},
        {'k': 'txt', 'id': 'expired', 't': '这篇笔记的分享已关闭'},
    ]

    S['write'] = [
        {'k': 'nav', 'id': 'nav', 't': '编辑笔记'},
        {'k': 'field', 'id': 'fTitle', 't': '标题', 'ph': '输入笔记标题'},
        {'k': 'field', 'id': 'fSummary', 't': '摘要', 'ph': '输入摘要内容…'},
        {'k': 'field', 'id': 'fPoints', 't': '要点（每行一个）', 'ph': '• 第一个要点'},
        {'k': 'field', 'id': 'fTags', 't': '标签（逗号分隔）', 'ph': '技术, 产品, 设计'},
        {'k': 'field', 'id': 'fCat', 't': '分类', 'ph': '未分类'},
        {'k': 'field', 'id': 'fOrig', 't': '原文内容', 'ph': ''},
        {'k': 'field', 'id': 'fShots', 't': '配图', 'ph': '点任意标签把它换到第一位'},
        {'k': 'row', 'id': 'save', 'h': 26, 'c': [{'t': '取消', 's': 'pill', 'w': 60}, {'t': '保存', 's': 'pillpri', 'w': 60}]},
    ]

    S['cardinfo'] = [
        {'k': 'nav', 'id': 'nav', 't': '卡片市场', 'r': '编辑卡片信息'},
        {'k': 'card', 'id': 'ciSheet', 'h': 272, 't': '图片设置', 's': 'dialog'},
        {'k': 'gap', 'h': 6},
        {'k': 'txt', 'id': 'hint', 't': '这四张就是卡片上的人和名字。换一张点「更换」。'},
        {'k': 'tab', 'c': [{'t': '新建'}, {'t': '笔记'}, {'t': '我的'}]},
    ]

    S['delete'] = [
        {'k': 'nav', 'id': 'nav', 't': '我的'},
        {'k': 'gap', 'h': 20},
        {'k': 'card', 'id': 'delSheet', 'h': 176, 't': '注销账号', 's': 'dialog'},
        {'k': 'gap', 'h': 14},
        {'k': 'txt', 'id': 'storage', 't': '图片云空间：全站已用 12%，满了之后新上传的图会存不下'},
        {'k': 'tab', 'c': [{'t': '新建'}, {'t': '笔记'}, {'t': '我的', 'on': True}]},
    ]

    S['language'] = [
        {'k': 'nav', 'id': 'nav', 't': '设置'},
        {'k': 'gap', 'h': 14},
        {'k': 'menu', 'id': 'menu', 'rows': [('语言设置', '选择语言', 'language'),
                                             ('外观设置', '整个界面的配色，挑顺眼的一套', 'wallpaper'),
                                             ('私密密码', '锁住不想让别人看到的笔记', 'private')]},
        {'k': 'gap', 'h': 14},
        {'k': 'row', 'id': 'choice', 'h': 30, 'c': [{'t': '中文', 'id': 'zh', 's': 'seg', 'on': True, 'w': 70},
                                                    {'t': 'English', 'id': 'en', 's': 'seg', 'w': 70}]},
        {'k': 'txt', 'id': 'note', 't': '切换的是界面语言，笔记正文与已存的摘要都不跟着改。'},
        {'k': 'tab', 'c': [{'t': '新建'}, {'t': '笔记'}, {'t': '我的', 'on': True}]},
    ]

    S['about'] = [
        {'k': 'nav', 'id': 'nav', 't': '关于图麦笔记'},
        {'k': 'card', 'id': 'identity', 'h': 74, 't': '图麦笔记', 'sub': '把图文，提炼成有用的干货', 's': 'plain'},
        {'k': 'row', 'id': 'tabs', 'h': 24, 'c': [{'t': '介绍', 's': 'seg', 'on': True, 'w': 56},
                                                  {'t': '功能', 's': 'seg', 'w': 56}, {'t': '隐私', 's': 'seg', 'w': 56}]},
        {'k': 'sec', 'id': 'privacy', 't': '这一栏说清我们收集什么、你的截图经过哪里、以及怎么删掉。', 'lines': 3},
        {'k': 'txt', 'id': 'rows', 't': '最后更新时间：2026 年 9 月 22 日　当前版本　开发主体　公众号'},
        {'k': 'gap', 'h': 10},
        {'k': 'row', 'id': 'contact', 'h': 24, 'c': [{'t': '产品官网', 's': 'pill', 'w': 74},
                                                     {'t': '反馈邮箱', 's': 'pill', 'w': 74},
                                                     {'t': '推荐图麦', 's': 'pill', 'w': 74}]},
    ]
    return S


SCREENS = _screens()

# 弹窗里那几屏还需要画框内小字，单独列一份，免得把主结构写乱。
DIALOG_BODY = {
    'pin': [('dots', '6 位数字'), ('btns', ['确定', '取消'])],
    'ciSheet': [('slots', ['头像', '背景', '卡片', '位置']), ('input', '名称'), ('input', '一句话'),
                ('btns', ['取消', '保存'])],
    'delSheet': [('txt', '将删除你名下的 12 条笔记和 5 个分类，已生成的分享链接一并失效。'),
               ('txt', '删除后无法恢复，也找不回来。确定要注销吗？'),
               ('btns', ['再想想', '确认注销'])],
}


# ---------------------------------------------------------------- 渲染
DEFAULT_H = {'nav': 26, 'h1': 54, 'txt': 15, 'row': 24, 'slide': 34, 'tab': TAB_H,
             'chips': 26, 'list': 118, 'rowsort': 122, 'grid': 150, 'menu': 150,
             'cells': 74, 'sec': 30, 'field': 40, 'card': 150, 'phone': 130,
             'swatch': 44, 'pillrow': 26, 'note': 26, 'dots': 16, 'band': 74, 'sheet': 22}


def _layout(blocks, bottom, limit):
    """自上而下排一遍，返回 (绘制指令, 区域矩形表)。"""
    y = TOP
    draws, rects = [], {}
    for b in blocks:
        k = b['k']
        if k == 'gap':
            y += b['h']
            continue
        h = b.get('h') or DEFAULT_H[k]
        if k == 'sec':
            h = max(h, 20 + b.get('lines', 0) * 8.5 + (30 if b.get('n') else 0))
        if k == 'tab':
            y = bottom - h
        elif y + h > limit:
            raise OverflowError(f"{b.get('id') or k} 画到 {y + h:.0f}，超过内容底线 {limit:.0f}")
        b['_y'], b['_h'] = y, h
        rects[b.get('id') or k] = (CX, y, CW, h)
        if k == 'row':
            for c in _cells(b, CX, y, CW, h):
                if isinstance(c, dict) and c.get('id'):
                    rects[c['id']] = c['_r']
        y += h + (4 if k == 'sec' else 10 if k not in ('txt', 'dots') else 4)
    return draws, rects, y


def _cells(b, x, y, w, h):
    """横排格子的宽度分配，同时把每格矩形记回 c['_r']。"""
    cs = b['c']
    fixed = sum(c.get('w', 0) for c in cs if isinstance(c, dict))
    flexn = [c for c in cs if isinstance(c, dict) and not c.get('w')]
    gap = 8 * max(0, len(cs) - 1)
    rest = w - fixed - gap
    each = rest / len(flexn) if flexn else 0
    cx = x
    out = []
    for c in cs:
        cw = c.get('w') or each
        c['_r'] = (cx, y, cw, h)
        out.append(c)
        cx += cw + gap
    return out


def _draw_cell(c, svg):
    x, y, w, h = c['_r']
    s = c.get('s', 'text')
    t = c.get('t', '')
    if s == 'pill':
        svg.append(_r(x, y + h / 2 - 9, w, 18, 9, INK + '88', sw=1))
        svg.append(_tx(x + w / 2, y + h / 2 + 3.2, _fit(t, w - 10, 8.4), 8.4, anchor='middle'))
    elif s == 'pillpri':
        svg.append(_r(x, y + h / 2 - 9, w, 18, 9, None, GREEN, 1))
        svg.append(_tx(x + w / 2, y + h / 2 + 3.2, _fit(t, w - 10, 8.4), 8.4, SHELL, 'middle', 600))
    elif s == 'seg':
        on = c.get('on')
        svg.append(_r(x, y + h / 2 - 10, w, 20, 3, INK + '55' if not on else None,
                      'none' if not on else GREEN, 1))
        svg.append(_tx(x + w / 2, y + h / 2 + 3.4, _fit(t, w - 8, 8.6), 8.6,
                      INK if not on else SHELL, 'middle', 600 if on else 400))
        if on:
            svg.append(_r(x + w / 2 - 9, y + h - 1, 18, 2, 1, None, CLAY, 0))
    elif s == 'link':
        svg.append(_tx(x, y + h / 2 + 3, _fit(t, w, 8.4), 8.4, MUTED))
        svg.append(_r(x, y + h / 2 + 6, min(w, len(t) * 8.4), 0.8, 0, None, LINE, 0))
    elif s == 'linkr':
        svg.append(_tx(x + w, y + h / 2 + 3, _fit(t, w, 8.4), 8.4, CLAY, 'end', 600))
    elif s == 'mini':
        svg.append(_r(x, y + 2, w, h - 4, 4, INK + '44', SHELL, 1))
        svg.append(_tx(x + w / 2, y + h / 2 + 3, _fit(t, w - 8, 8.2), 8.2, anchor='middle'))
    elif s == 'shutter':
        r = min(w, h) / 2 - 3
        svg.append(f'<circle cx="{x + w / 2}" cy="{y + h / 2}" r="{r:.1f}" fill="none" stroke="{INK}99" stroke-width="1.4"/>')
        svg.append(f'<circle cx="{x + w / 2}" cy="{y + h / 2}" r="{r - 4:.1f}" fill="{INK}14"/>')
        svg.append(_tx(x + w / 2, y + h - 1, _fit(t, w, 7.6), 7.6, MUTED, 'middle'))
    elif s == 'switch':
        svg.append(_r(x, y + h / 2 - 7, w, 14, 7, None, CLAY + 'cc', 0))
        svg.append(f'<circle cx="{x + w - 7}" cy="{y + h / 2}" r="5.4" fill="{SHELL}"/>')
    elif s == 'icon':
        cx2, cy2 = x + w / 2, y + h / 2
        if c.get('glyph') == 'grid':
            for i in range(4):
                svg.append(_r(cx2 - 6 + (i % 2) * 7, cy2 - 6 + (i // 2) * 7, 5, 5, 1, INK + '99', sw=1))
        else:
            svg.append(f'<circle cx="{cx2 - 1}" cy="{cy2 - 1}" r="5" fill="none" stroke="{INK}99" stroke-width="1.3"/>')
            svg.append(f'<line x1="{cx2 + 3}" y1="{cy2 + 3}" x2="{cx2 + 7}" y2="{cy2 + 7}" stroke="{INK}99" stroke-width="1.3"/>')
    elif s == 'label':
        svg.append(_tx(x, y + h / 2 + 3, _fit(t, w, 8.8), 8.8, INK, weight=600))
    elif s == 'input':
        svg.append(_r(x, y + 2, w, h - 4, 3, INK + '44', SHELL, 1))
        svg.append(_tx(x + 7, y + h / 2 + 3, _fit(t, w - 14, 8.2), 8.2, MUTED))
    elif s == 'image':
        svg.append(_r(x, y, w, h - 14, 4, INK + '44', INK + '0A', 1))
        svg.append(f'<line x1="{x}" y1="{y}" x2="{x + w}" y2="{y + h - 14}" stroke="{LINE}" stroke-width="1"/>')
        svg.append(f'<line x1="{x + w}" y1="{y}" x2="{x}" y2="{y + h - 14}" stroke="{LINE}" stroke-width="1"/>')
        svg.append(_tx(x + w / 2, y + h - 3, _fit(c.get('sub') or t, w, 7.8), 7.8, MUTED, 'middle'))
    elif s == 'cell':
        svg.append(_r(x, y, w, h, 4, INK + '33', SHELL, 1))
        svg.append(_tx(x + w / 2, y + h / 2 - 4, c.get('v', ''), 17, CLAY, 'middle', 600))
        svg.append(_tx(x + w / 2, y + h / 2 + 13, _fit(t, w - 8, 8.2), 8.2, MUTED, 'middle'))
    elif s == 'text':
        svg.append(_tx(x, y + h / 2 + 3, _fit(t, w, 8.2), 8.2, MUTED))
    elif s == 'textw':
        svg.append(_tx(x, y + h / 2 + 3, _fit(t, w, 8.6), 8.6, INK))


def _draw(b, svg, cx=CX, w=CW):
    y, h = b['_y'], b['_h']
    k = b['k']
    if k == 'nav':
        svg.append(_tx(cx, y + 15, b.get('t', ''), 11.5, INK, weight=600))
        if b.get('r'):
            svg.append(_tx(cx + w, y + 14, _fit(b['r'], 92, 8.4), 8.4, CLAY, 'end', 600))
        svg.append(_r(cx, y + 22, w, 1, 0, None, INK + '66', 0))
    elif k == 'h1':
        svg.append(_tx(cx, y + 17, b.get('t', ''), 15, INK, weight=600))
        if b.get('t2'):
            svg.append(_tx(cx, y + 36, b['t2'], 15, INK, weight=600))
        for i, chip in enumerate(b.get('chips', [])):
            xoff = cx + (0 if b.get('t2') else 96) + i * 52
            yy = y + 30 if b.get('t2') else y + 8
            svg.append(_r(xoff, yy, 46, 15, 2, None, INK + '12', 0))
            svg.append(_tx(xoff + 23, yy + 10.5, _fit(chip, 40, 7.8), 7.8, MUTED, 'middle'))
    elif k == 'txt':
        svg.append(_tx(cx, y + 11, _fit(b.get('t', ''), w, 8.2), 8.2, MUTED,
                       weight=b.get('weight', 400)))
    elif k == 'band':
        svg.append(_r(cx, y, w, h, 5, INK + '33', INK + '0A', 1))
        svg.append(_tx(cx + 12, y + 24, _fit(b.get('t', ''), w - 60, 11), 11, INK, weight=600))
        if b.get('sub'):
            svg.append(_tx(cx + 12, y + 40, _fit(b['sub'], w - 24, 7.8), 7.8, MUTED))
        if b.get('r'):
            svg.append(_tx(cx + w - 12, y + 24, b['r'], 9.4, CLAY, 'end', 600))
    elif k in ('row',):
        for c in _cells(b, cx, y, w, h):
            _draw_cell(c, svg)
    elif k == 'chips':
        x = cx
        m = b.setdefault('_m', {})
        edit = b.get('edit')
        for i, lab in enumerate(b['c']):
            cw = max(30, len(lab) * 8.6 * (1.42 if not edit else 1) + 16)
            if x + cw > cx + w:
                break
            last = i == len(b['c']) - 1
            on = (not edit) and i == 0
            svg.append(_r(x, y + 2, cw, 19, 2, INK + '44' if not on else None, None if not on else GREEN, 1))
            svg.append(_tx(x + cw / 2, y + 15, lab, 8.4, SHELL if on else MUTED, 'middle'))
            if on:
                svg.append(_r(x + cw / 2 - 8, y + 23, 16, 2, 1, None, CLAY, 0))
            if edit and not last:
                svg.append(_tx(x + cw - 1, y + 4, '✕', 7.4, CLAY, 'middle', 600))
                m.setdefault('catsX', (x + cw - 12, y - 4, 14, 14))
                m.setdefault('catsChip', (x, y, cw, 23))
            if edit and last:
                svg.append(_tx(x + cw + 5, y + 16, '锁', 7.4, CLAY))
                m['catLock'] = (x, y, cw + 16, 23)
            x += cw + 7
    elif k == 'grid':
        cols = b['n']
        gap = 6
        cw = (w - gap * (cols - 1)) / cols
        ch = (h - gap * (b['rows'] - 1)) / b['rows']
        for i, lab in enumerate(b['labels']):
            r, c = divmod(i, cols)
            x, yy = cx + c * (cw + gap), y + r * (ch + gap)
            svg.append(_r(x, yy, cw, ch, 3, INK + '40', INK + '0A', 1))
            if lab == '+':
                svg.append(_tx(x + cw / 2, yy + ch / 2 + 6, '+', 17, INK + '99', 'middle'))
            else:
                svg.append(f'<line x1="{x}" y1="{yy}" x2="{x + cw}" y2="{yy + ch}" stroke="{LINE}" stroke-width="1"/>')
                svg.append(_r(x + 3, yy + 3, 13, 12, 2, None, GREEN, 0))
                svg.append(_tx(x + 9.5, yy + 12, lab, 7.6, SHELL, 'middle', 600))
        if b.get('mark'):
            r, c = divmod(b.get('mark_at', 8), cols)
            x, yy = cx + c * (cw + gap), y + r * (ch + gap)
            svg.append(_r(x, yy + ch - 13, cw, 13, 0, None, CLAY + 'dd', 0))
            svg.append(_tx(x + cw / 2, yy + ch - 3.5, b['mark'], 7.4, SHELL, 'middle', 600))
    elif k == 'list':
        rh = h / b['rows']
        for i in range(b['rows']):
            yy = y + i * rh
            svg.append(_r(cx, yy, w, rh - 7, 3, INK + '2E', SHELL, 1))
            svg.append(_r(cx + 6, yy + 6, 7, rh - 19, 2, None, [GREEN, CLAY, INK + '99', '#8a8f98'][i % 4], 0))
            svg.append(_tx(cx + 20, yy + 15, ['学习', '旅行', '灵感', '私密'][i], 7.6, MUTED))
            svg.append(_r(cx + 52, yy + 9, w - 120, 5, 2, None, INK + '2A', 0))
            svg.append(_r(cx + 52, yy + 19, (w - 120) * .55, 5, 2, None, INK + '1C', 0))
            if i == 3:
                svg.append(_tx(cx + w - 12, yy + 16, '锁', 7.6, CLAY, 'end'))
    elif k == 'rowsort':
        rh = h / len(b['rows'])
        for i, (lab, first) in enumerate(b['rows']):
            yy = y + i * rh
            svg.append(_r(cx, yy, w, rh - 6, 3, INK + '2E', SHELL, 1))
            svg.append(_r(cx + 6, yy + 5, 7, rh - 16, 2, None, [INK + '99', GREEN, CLAY, '#8a8f98', '#B5A8BF'][i], 0))
            svg.append(_tx(cx + 22, yy + rh / 2 + 1, lab, 8.8, INK, weight=600))
            svg.append(_tx(cx + 62, yy + rh / 2 + 1, f'{[12, 9, 5, 3, 11][i]} 篇', 7.6, MUTED))
            for j in range(3):
                svg.append(_r(cx + w - 16, yy + 6 + j * 4, 10, 1.6, 0, None, INK + '55', 0))
            if lab == '私密':
                svg.append(_tx(cx + w - 26, yy + rh / 2 + 1, '固定', 7.2, CLAY, 'end'))
    elif k == 'sec':
        svg.append(_tx(cx, y + 10, b['t'], 8.4, CLAY, weight=600))
        if b.get('more'):
            svg.append(_tx(cx + w, y + 10, b['more'], 7.8, MUTED, 'end'))
        for i in range(b.get('lines', 0)):
            svg.append(_r(cx, y + 16 + i * 9, w - (0 if i else 40), 4.5, 2, None, INK + '22', 0))
        if b.get('n'):
            for i in range(b['n']):
                svg.append(_r(cx + i * 46, y + 16, 40, 30, 3, INK + '40', INK + '0A', 1))
    elif k == 'field':
        svg.append(_tx(cx, y + 10, b['t'], 8.2, CLAY, weight=600))
        svg.append(_r(cx, y + 14, w, 20, 3, INK + '40', SHELL, 1))
        svg.append(_tx(cx + 7, y + 27, _fit(b.get('ph', ''), w - 14, 8), 8, MUTED))
    elif k == 'slide':
        dark = b.get('s') == 'button'
        svg.append(_r(cx, y, w, h, h / 2, None, GREEN if dark else INK + '14', 0))
        svg.append(_tx(cx + w / 2 - 12, y + h / 2 + 3.4, b['t'], 9.6, SHELL if dark else INK, 'middle', 600))
        for i in range(3):
            svg.append(f'<path d="M{cx + w - 34 + i * 6} {y + h / 2 - 5} l5 5 l-5 5" fill="none" '
                       f'stroke="{SHELL if dark else CLAY}" stroke-width="1.5" opacity="{1 - i * .3}"/>')
    elif k == 'tab':
        svg.append(_r(0, y, W, h + 20, 0, None, INK + '08', 0))
        svg.append(_r(CX - 15, y, CW + 30, 1, 0, None, INK + '33', 0))
        for i, c in enumerate(b['c']):
            x = CX + i * (CW / 3)
            svg.append(f'<circle cx="{x + CW / 6}" cy="{y + 17}" r="7" fill="{CLAY if c.get("on") else "none"}" '
                       f'stroke="{INK}66" stroke-width="1"/>')
            svg.append(_tx(x + CW / 6, y + 34, c['t'], 8.2, INK if c.get('on') else MUTED, 'middle',
                           600 if c.get('on') else 400))
    elif k == 'menu':
        rh = h / len(b['rows'])
        for i, (lab, hint, mid) in enumerate(b['rows']):
            yy = y + i * rh
            svg.append(_r(cx, yy, w, rh - 5, 3, INK + '2E', SHELL, 1))
            svg.append(_tx(cx + 10, yy + 15, lab, 9.2, INK, weight=600))
            if hint:
                svg.append(_tx(cx + 10, yy + 26, _fit(hint, w - 40, 7.4), 7.4, MUTED))
            svg.append(f'<path d="M{cx + w - 14} {yy + 13} l4 4 l-4 4" fill="none" stroke="{INK}66" stroke-width="1.2"/>')
            b.setdefault('_m', {})[mid] = (cx, yy, w, rh - 5)
    elif k == 'cells':
        gap = 7
        cw = (w - gap * (b['n'] - 1)) / b['n']
        for i, lab in enumerate(b['labels']):
            x = cx + i * (cw + gap)
            on = b.get('on') == i
            svg.append(_r(x, y, cw, h - 18, 3, INK + '55' if on else INK + '30', INK + '0A', 1.2 if on else 1))
            svg.append(_r(x + 6, y + 8, cw - 12, 5, 2, None, INK + '30', 0))
            svg.append(_r(x + 6, y + 17, (cw - 12) * .7, 4, 2, None, INK + '20', 0))
            svg.append(_tx(x + cw / 2, y + h - 5, _fit(lab, cw, 7.6), 7.6, CLAY if on else MUTED, 'middle'))
            if on:
                svg.append(f'<circle cx="{x + cw - 6}" cy="{y + h - 22}" r="3" fill="{CLAY}"/>')
    elif k == 'phone':
        svg.append(_r(cx + 40, y, w - 80, h, 8, INK + '55', SHELL, 1))
        svg.append(_r(cx + w / 2 - 12, y + 5, 24, 3, 2, None, INK + '55', 0))
        svg.append(_tx(cx + w / 2, y + 20, '图麦笔记', 7.4, MUTED, 'middle'))
        svg.append(_tx(cx + 50, y + 36, '我的笔记', 8.6, INK, weight=600))
        for i in range(3):
            svg.append(_r(cx + 50, y + 44 + i * 22, w - 100, 18, 3, INK + '22', SHELL, 1))
            svg.append(_r(cx + 54, y + 47 + i * 22, 5, 12, 1, None, [GREEN, CLAY, '#A4B0C0'][i], 0))
    elif k == 'swatch':
        gap = 8
        cw = (w - gap * (len(b['c']) - 1)) / len(b['c'])
        for i, (lab, col) in enumerate(b['c']):
            x = cx + i * (cw + gap)
            on = b.get('on') == i
            svg.append(_r(x, y, cw, 24, 3, None, col, 0))
            if on:
                svg.append(_r(x, y, cw, 24, 3, CLAY, 'none', 2))
                svg.append(_tx(x + cw / 2, y + 16, '✓', 9, SHELL, 'middle', 600))
            svg.append(_tx(x + cw / 2, y + 36, lab, 7.8, INK if on else MUTED, 'middle', 600 if on else 400))
    elif k == 'pillrow':
        svg.append(_r(cx, y, w, h, h / 2, None, INK + '12', 0))
        svg.append(_tx(cx + 12, y + h / 2 + 3, _fit(b['t'], w - 60, 8.2), 8.2, INK))
        svg.append(_r(cx + w - 36, y + h / 2 - 7, 26, 14, 7, None, CLAY + 'cc', 0))
        svg.append(f'<circle cx="{cx + w - 17}" cy="{y + h / 2}" r="5.2" fill="{SHELL}"/>')
    elif k == 'dots':
        for i in range(b['n']):
            x = cx + w / 2 + (i - b['n'] / 2) * 11
            svg.append(f'<circle cx="{x:.1f}" cy="{y + 8}" r="2.6" fill="{CLAY if i == 0 else INK + "33"}"/>')
    elif k == 'sheet':
        svg.append(_r(cx + w / 2 - 16, y, 32, 3, 2, None, INK + '44', 0))
        svg.append(_tx(cx, y + 16, _fit(b.get('t', ''), w - 70, 8.2), 8.2, MUTED))
        svg.append(_tx(cx + w, y + 16, b.get('r', ''), 8.2, INK + '99', 'end'))
    elif k == 'note':
        tw = min(w, len(b['t']) * 8.2 * SCALE + 26)
        svg.append(_r(cx, y, tw, h - 4, 3, CLAY + 'aa', CLAY + '0E', 1.1, dash='4 3'))
        svg.append(_tx(cx + 12, y + h / 2 + 1, _fit(b['t'], tw - 24, 8.2), 8.2, CLAY))
    elif k == 'card':
        svg.append(_r(cx, y, w, h, 6, INK + '44', SHELL, 1.2))
        svg.append(_tx(cx + 14, y + 20, b.get('t', ''), 10, INK, weight=600))
        if b.get('sub'):
            svg.append(_tx(cx + 14, y + 36, _fit(b['sub'], w - 28, 8), 8, MUTED))
        body = DIALOG_BODY.get(b.get('id'), [])
        yy = y + 48
        m = b.setdefault('_m', {})
        for kind, val in body:
            if kind == 'dots':
                for i in range(6):
                    svg.append(f'<circle cx="{cx + 34 + i * 30}" cy="{yy + 10}" r="4" fill="{INK}"/>')
                yy += 30
            elif kind == 'slots':
                sw = (w - 28 - 18) / 4
                m['slots'] = (cx + 10, yy - 4, w - 20, sw + 24)
                for i, lab in enumerate(val):
                    x = cx + 14 + i * (sw + 6)
                    svg.append(_r(x, yy, sw, sw + 6, 3, INK + '40', INK + '0A', 1))
                    svg.append(_tx(x + sw / 2, yy + sw + 16, lab, 7.2, MUTED, 'middle'))
                yy += sw + 24
            elif kind == 'input':
                m['input:' + val] = (cx + 10, yy - 2, w - 20, 34)
                svg.append(_tx(cx + 14, yy + 8, val, 8, CLAY, weight=600))
                svg.append(_r(cx + 14, yy + 12, w - 28, 18, 3, INK + '40', SHELL, 1))
                yy += 36
            elif kind == 'txt':
                for j in range(0, len(val), 22):
                    svg.append(_tx(cx + 14, yy + 9, val[j:j + 22], 7.8, MUTED))
                    yy += 11
                yy += 6
            elif kind == 'btns':
                m['btns'] = (cx + 10, yy - 4, w - 20, 28)
                bw = (w - 34) / 2
                svg.append(_r(cx + 14, yy, bw, 20, 3, INK + '55', SHELL, 1))
                svg.append(_tx(cx + 14 + bw / 2, yy + 13.5, val[0], 8.4, INK, 'middle'))
                svg.append(_r(cx + 20 + bw, yy, bw, 20, 3, None, GREEN, 0))
                svg.append(_tx(cx + 20 + bw * 1.5, yy + 13.5, val[1], 8.4, SHELL, 'middle', 600))
                yy += 28


def diagram(screen, focus=(), note=''):
    """返回一段内联 SVG。focus 里的区域 id 套高亮并在右侧标 ①②。"""
    if screen not in SCREENS:
        raise KeyError('未定义的界面示意：' + screen)
    blocks = [{**b} for b in SCREENS[screen]]
    has_tab = any(b['k'] == 'tab' for b in blocks)
    bottom = H - 22
    limit = H - 22 - (TAB_H if has_tab else 0)
    _, rects, cursor = _layout(blocks, bottom, limit)
    svg = [f'<svg viewBox="0 0 {W} {H}" class="wire" role="img" aria-label="{escape(screen)} 界面位置示意">',
           _r(FRAME_X, 8, FRAME_W, H - 16, 20, INK + '55', SHELL, 1.3),
           _r(FRAME_X + FRAME_W / 2 - 17, 13, 34, 4, 2, None, INK + '33', 0)]
    for b in blocks:
        if b['k'] != 'gap':
            _draw(b, svg)
    marks = []
    for i, fid in enumerate([f for f in focus if f]):
        rect = rects.get(fid)
        if rect is None:
            for b in blocks:
                rect = rect or b.get('_m', {}).get(fid)
        if rect is None:
            raise KeyError(f'{screen} 里没有区域 {fid}')
        x, y, w, h = rect
        x, y, w, h = x - 4, y - 3, w + 8, h + 6
        svg.insert(len(svg), _r(x, y, w, h, 6, CLAY, CLAY + '14', 2.2))
        cy = min(max(y + h / 2, 26), H - 30)
        svg.append(f'<line x1="{x + w:.1f}" y1="{cy:.1f}" x2="270" y2="{cy:.1f}" stroke="{CLAY}" '
                   f'stroke-width="1" stroke-dasharray="3 2"/>')
        svg.append(f'<circle cx="278" cy="{cy:.1f}" r="9" fill="{CLAY}"/>')
        svg.append(_tx(278, cy + 3.6, str(i + 1), 9.6, '#ffffff', 'middle', 600))
        marks.append(fid)
    svg.append('</svg>')
    cap = note or '界面位置示意 · 非真实截图'
    return ''.join(svg), f'<div class="wire-cap">{escape(cap)}</div>'


if __name__ == '__main__':
    import sys
    name = sys.argv[1] if len(sys.argv) > 1 else 'create-home'
    fo = sys.argv[2].split(',') if len(sys.argv) > 2 else ['person']
    a, b = diagram(name, fo)
    open(f'/tmp/wire-{name}.svg', 'w', encoding='utf-8').write(a.replace('<svg ', '<svg xmlns="http://www.w3.org/2000/svg" width="300" height="476" '))
    print('ok', name, fo)
