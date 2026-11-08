from pathlib import Path
from html import escape
from functools import lru_cache
from PIL import Image
import base64
import io
import json
import importlib.util

_spec = importlib.util.spec_from_file_location('wire', str(Path(__file__).parent / '界面示意图.py'))
wire = importlib.util.module_from_spec(_spec)
_spec.loader.exec_module(wire)
POINTS = json.loads((Path(__file__).parent / '内容' / '功能要点.json').read_text(encoding='utf-8'))
SCREEN_NAMES = {
    'create-home': '新建页首屏', 'create-photo': '新建页 · 照片档', 'create-url': '新建页 · 链接档',
    'create-write': '新建页 · 文字档', 'list': '笔记页', 'list-edit': '笔记页 · 管理态',
    'detail': '笔记详情页', 'detail-sheet': '笔记详情窗', 'tpl-sheet': '卡片制作窗',
    'market': '卡片市场', 'me-set': '我的 · 设置', 'me-about': '我的 · 关于', 'wallpaper': '外观设置',
    'private': '私密密码', 'share-view': '公开阅读页', 'write': '编辑笔记', 'cardinfo': '图片设置',
    'delete': '注销确认', 'language': '语言设置', 'about': '关于图麦笔记'}

ROOT = Path(__file__).resolve().parent
ASSETS = ROOT / '素材'
chapters = json.loads((ROOT / '完整内容.json').read_text())
features = {f['id']: f for ch in chapters for f in ch['features']}
meta = json.loads((ROOT / '内容/白皮书对照说明.json').read_text())
pages = []


@lru_cache(maxsize=None)
def uri(name):
    im = Image.open(ASSETS / name)
    im.thumbnail((1536, 1536), Image.Resampling.LANCZOS)
    buf = io.BytesIO()
    if im.mode == 'RGBA' and im.getchannel('A').getextrema() != (255, 255):
        im.save(buf, format='PNG')
        mime = 'png'
    else:
        im.convert('RGB').save(buf, format='JPEG', quality=88)
        mime = 'jpeg'
    return f'data:image/{mime};base64,' + base64.b64encode(buf.getvalue()).decode()


def pic(name, cls='', alt='旅行场景示意'):
    return f'<img class="{cls}" src="{uri(name)}" alt="{escape(alt)}">'


def figure(name, caption, cls=''):
    return f'<figure class="{cls}">{pic(name)}<figcaption>{escape(caption)}</figcaption></figure>'


def p(text, cls=''):
    return f'<p class="{cls}">{escape(text)}</p>'


def block(title, text):
    return '<div class="copy-block"><h3>' + escape(title) + '</h3>' + p(text) + '</div>'


def ribbon(items, numbered=True):
    # 目录页那一条是"里面有这四块"，不是顺序；编号会和上面 01–12 的章号撞车。
    cells = ''.join((f'<div><i>{i+1:02}</i>' if numbered else '<div><i class="dot"></i>')
                    + f'<span>{escape(v)}</span></div>' for i, v in enumerate(items))
    return '<div class="ribbon">' + cells + '</div>'


def add(section, title, intro, body, theme='', ids=(), note='', kind='story', pre=''):
    n = len(pages) + 1
    html = f'<section class="page {theme}" id="page-{n}" data-kind="{kind}"><header class="running"><span>图麦笔记 <b>TUMARKNOTE</b></span><span>{escape(section)}</span></header><div class="page-head">{pre}<div class="eyebrow">{escape(section)}</div><h1>{escape(title).replace(chr(10), "<br>")}</h1>{p(intro,"intro") if intro else ""}</div><div class="page-content">{body}</div><footer><span>{escape(note or "图麦笔记 · 读懂这一站，写下自己的旅程")}</span><b>{n:02}</b></footer></section>'
    pages.append({'number': n, 'section': section, 'title': title, 'kind': kind, 'features': list(ids), 'html': html})


hero = '旅行-地标介绍-v3.png'
cafe = '旅行-林夏全身蓝衬衣-v3.png'
evening = '旅行-林夏半身棕针织.png'
friend = '旅行-小禾国内阅读.png'
remote_share = '旅行-国外朋友圈特写.png'
journal = '旅行-打印手账俯拍.png'
wall = '旅行-回国照片墙全身.png'
scan = '旅行-闺蜜扫码特写-v2.png'
photo_note = '人物与经历为虚构，旅行影像为AI场景示意。'
contact_sheet = Image.open(ASSETS / '旅行-九个瞬间.png')
for index, cell in enumerate([0, 2, 5]):
    x, y = cell % 3, cell // 3
    contact_sheet.crop((round(x*contact_sheet.width/3), round(y*contact_sheet.height/3), round((x+1)*contact_sheet.width/3), round((y+1)*contact_sheet.height/3))).save(ASSETS / f'旅行-故事镜头{index}.png')

# 封面＝站长 10-26 挑定的 A 风格 v5（设计样张/封面方向8/A2改v5.png 一比一搬进来）：
# 满版人物照（人物左移 179px）＋右上小程序码＋其下四枚数字竖排＋底部深色带（两张真实渲染＋书法口号＋平台圆标）。
# 口号那三行用的是界面同一枚书法位图，opacity .8 与 app.wxss 里 .brand-title 同档；
# h1 文字留着但视觉隐藏——书签与 PDF 检索层还要靠它。
cv2_stats = ''.join(f'<div class="cv2-num"><div class="v"><b>{v}</b><i>{u}</i></div><em>{lab}</em></div>'
                    for v, u, lab in [('3', '种', '图片·链接·文字'), ('16', '种', '外文整理成中文'),
                                      ('9', '张', '照片收进同一篇'), ('11', '套', '卡片版式')])
cv2_head = ('<div class="cv2-bg" style="background-image:url(' + uri('旅行-林夏咖啡馆.png') + ')"></div>'
            '<div class="cv2-veil"></div><div class="cv2-veilr"></div>'
            '<div class="cv2-brand"><b>图麦笔记</b><span>TUMARKNOTE</span></div>'
            '<figure class="cv2-qr">' + pic('品牌小程序码-亮墨.png', '', '图麦笔记小程序码')
            + '<figcaption>扫一扫打开</figcaption></figure>'
            '<div class="cv2-stats">' + cv2_stats + '</div>')
cv2_mood = ''.join(pic('平台圆标/' + f, 'cv2-disc', n) for f, n in
                   [('微信-512.png', '微信'), ('公众号-512.png', '公众号'), ('小红书-512.png', '小红书'),
                    ('微博-512.png', '微博'), ('知乎-512.png', '知乎'), ('抖音-512.png', '抖音')])
cv2_band = ('<div class="cv2-band"><div class="cv2-strip">'
            '<figure class="cv2-shot">' + pic('首屏实拍-林夏.png', '', '新建页首屏真实渲染') + '</figure>'
            '<figure class="cv2-shot">' + pic('旅行卡-cover.png', '', '本机代码画出的分享卡片') + '</figure>'
            '</div><div class="cv2-right"><div class="cv2-hero">'
            + pic('口号书法-亮墨.png', '', '看到好内容，随手记下来。Save what matters')
            + '</div><div class="cv2-mood"><span>存成一张图，发这些地方</span><div class="row">'
            + cv2_mood + '</div></div></div></div>')

add('旅行故事 / 产品介绍', '看到好内容，\n随手记下来。', '',
    cv2_band,
    theme='cover cover-a', ids=[], pre=cv2_head,
    note='两帧均为真实渲染：首屏（开发者工具 iPhone 12/13 档）与本机代码画出的卡片；人物故事为虚构。')

add('序章 / 认识林夏', '拍了三百张照片，\n回来一句也说不清。',
    '22 岁的大四学生林夏，第一次独自去罗马。三天下来相册满了，可朋友问她万神殿到底什么样，她只会一张张翻照片——这册子讲她怎么把看到的东西，变成说得清的东西。',
    '<div class="triptych">' + ''.join(figure(name, cap) for name, cap in [(cafe,'旅途中 · 查攻略'),(remote_share,'仍在国外 · 发朋友圈'),(journal,'回国后 · 做旅行手账')]) + '</div>' +
    ribbon(['读攻略','记见闻','发朋友圈','做手账','扫码续读']) +
    '<div class="editorial-quote">不是替她经历旅行，<br>而是让经历不再散落各处。</div>' +
    p('本册用林夏与朋友小禾的虚构故事解释功能。示例文字并非真实用户证言，也不冒充本次AI提炼的实测输出。','small'),
    note=photo_note)

add('第一站 / 链接', '攻略在同学发来的链接里，\n到了路口翻不到。',
    '出发前一晚她还在聊天里翻那篇罗马漫步攻略。她把链接复制出来、贴进图麦笔记，右滑一下，长文变成三句要点，原文也留着——到了路口不用再翻聊天记录。',
    '<div class="split"><div>' + figure(cafe,'林夏在咖啡馆阅读攻略 / AI场景示意','portrait') + '</div><div class="story-copy">' +
    pic('控件-粘贴.png','control small-control','真实粘贴控件') +
    block('复制链接，交给图麦笔记','复制文章链接，回到新建面板粘贴。产品会识别网址并进入链接录入，再向右滑动提交，不必先把整篇文章手动抄一遍。') +
    block('先抓重点，再回原站核对','文章读入后整理为摘要和要点，并尝试保留正文配图。临行前先看重点，需要确认地址、时间或价格时，再复制来源链接回原站。') +
    '<div class="rule-note">登录、付费或站点限制可能使链接读取失败；配图不保证全部保存，也不是网页原样归档。</div></div></div>', ids=['02-02','02-03','05-05'], note='粘贴按钮为开发者工具真实控件裁片；已分离背景。')

add('第二站 / 图片', '介绍牌写着意大利语，\n她举起手机拍了一张。',
    '万神殿门前那块牌子她一个字都不认得。拍下来交给图麦笔记，字认出来了、翻成中文了，穹顶、街角、那杯咖啡也一起选进同一篇。',
    figure(hero,'后置镜头朝介绍牌，屏幕朝林夏 / AI场景示意','wide-scene') +
    '<div class="three-notes">' + block('01 拍清楚文字','对准介绍牌，让文字完整、清晰，尽量避开反光。') + block('02 把现场也留下','拍照或从相册选择同一站的照片，每批最多9张。') + block('03 提交前再检查','删掉重复画面；想补一张，可以继续拍摄或从相册选入。') + '</div>',
    ids=['02-01','02-06'], note=photo_note)

add('第二站 / 外文与多图', '十六种外文、九张照片，\n收进同一篇笔记。',
    '一趟旅行要记的东西不止一种：牌子上是意大利语，攻略里是英语，照片一拍就是十几张。外文内容整理成中文，最多九张配图跟着这一篇走。',
    '<div class="value-layout"><div>' + figure('旅行-九个瞬间.png','同一站的介绍与旅行细节 / 九图均为AI示意') +
    '<div class="editorial-quote compact">不止翻译一句话，<br>而是把这一站，真正记下来。</div></div><div class="numbers">' +
    ''.join('<div><b>'+num+'</b><h3>'+unit+'</h3>'+p(desc)+'</div>' for num, unit, desc in [('16','种外文内容','识别读入的内容，整理成便于回看的中文。'),('9','张照片，最多','介绍、建筑、街巷与细节，可以留在同一篇里。'),('1','篇旅行笔记','先理清重点，再补上自己的真实见闻。')]) + '</div></div>',
    ids=['03-03','02-01'], note='16语内容整理与图片识字是不同环节；完整语言及识字边界见本册能力说明。')

add('第三站 / 文字', '穹顶下的光，\n介绍牌上没写。',
    '机器能整理的只有它看得见的部分。回到住处她打开「直接写」，把那一刻写进去——光从圆洞落下来，地上那一块是暖的。这一栏写什么就是什么。',
    '<div class="split"><div>'+figure(evening,'傍晚，林夏写下当天的观察 / AI场景示意','portrait')+'</div><div class="story-copy">'+
    '<div class="text-excerpt"><label>林夏的随手记 · 虚构示例</label><p>在万神殿停一会儿</p><blockquote>今天最想留下的，不是又到过一个地标，而是抬头时看见的那束光。</blockquote></div>'+
    block('直接写，也能粘贴追加','切换到文字录入，写下刚想到的内容，或把已有文字粘贴进来。第一行会成为这篇文字笔记的标题，最好先给它一个清楚的名字。')+
    block('想补进原来的游记？','打开那篇已有笔记，进入编辑，再修改摘要、要点或原文。新建文字笔记和编辑旧笔记是两条不同路径，不会自动合并多篇内容。')+'</div></div>',
    ids=['02-04','05-06'], note='输入框直接输入上限2000字；粘贴与整理长度另见详细功能说明。')

add('第四站 / 生成笔记', '右滑一下，\n十秒变成一篇有标题有要点的笔记。',
    '素材齐了：一条链接、九张图、她自己写的那段。她开着「原文翻译」，向右滑动。出来的不是成品游记，是一篇有标题、有摘要、有要点、原文也在下面的笔记。',
    '<div class="split note-split"><div class="story-copy">'+
    pic('控件-翻译开关.png','control toggle-control','真实翻译开关')+'<h3>原文翻译</h3>'+p('图片、链接、文字入口共用，默认开启；希望保留原文语言的整理结果时，可以关闭。')+
    pic('控件-右滑提炼.png','control slider-control','真实右滑提炼控件')+
    block('先看状态，再看结果','右滑后等待任务处理。完成后打开结果，检查地名、数字和事实；若只保留了原文或整理失败，按提示处理，不把“存下了”误当作“提炼好了”。')+'</div><div class="note-demo"><label>整理内容结构示意 · 非应用截图</label><div><small>标题</small><h2>罗马慢游记</h2></div><div><small>摘要</small><p>从景点介绍了解这一站，再把广场、石柱与街巷里的观察留在一起。</p></div><div><small>要点</small><p>读懂介绍里的重点<br>核对来源中的信息<br>补上今天自己的感受</p></div><div><small>标签</small><p>罗马　旅行手记</p></div></div></div>',
    theme='green', ids=['02-05','03-01','03-02','03-04'], note='开关来自开发者工具；滑块来自真机截图。内容为虚构示例，并非提炼实测结果。')

add('第五站 / 回看与编辑', '第一张放穹顶，\n重复的那两张删掉。',
    '生成完不是就完了。九张图里她挑最能代表这一天的放最前面，摘要里那句太书面的改成自己的口气，原文随时切回来对一眼。',
    '<div class="photo-sequence">'+''.join('<div>'+pic(f'旅行-故事镜头{i}.png',f'shot shot-{i}')+f'<span>0{i+1} / '+label+'</span></div>' for i,label in enumerate(['这一站的开场','抬头看见的光','沿途留下的细节']))+'</div>'+
    '<div class="three-notes">'+block('看完整张图','详情里轮播配图，点开大图查看细节；竖图和横图各自保持比例，不只看裁切缩略图。')+block('把第一张设为头图','进入编辑调整照片次序，第一张作为头图。删除、排序立即生效，不会等到最后保存文字才执行。')+block('文字仍可以继续改','标题、摘要、要点、标签、分类、原文都能编辑。先核对识别与整理内容，再决定哪些话值得留下。')+'</div>'+p('保存后的编辑页不能追加新图片；图片调整后点取消，不会撤销已经完成的删除或排序。','rule-note'),
    ids=['05-04','05-06','05-07','05-08'], note='三组照片局部用于叙事示意，不模拟应用中的操作界面。')

add('第六站 / 分类与搜索', '十几篇笔记，\n别再堆成一个「未分类」。',
    '四五天下来已经有十几篇。她给这趟建了「罗马」那一格，把游记、攻略、灵感分开；要找某一句就搜关键词，下一次出发不用从相册第一张翻起。',
    '<div class="category-graphic"><label>林夏的分类安排 · 功能关系示意</label><div><span>攻略</span><p>出发前读过的路线与文章</p></div><div><span>旅行</span><p>在万神殿留下的中文笔记</p></div><div><span>灵感</span><p>穹顶下的光与个人观察</p></div></div>'+
    '<div class="three-notes">'+block('在列表就地管理','进入列表面板的分类管理，新分类名可用空格分隔一次输入；也可以改名、拖动排序。')+block('先缩小，再寻找','点分类缩小范围，再用“罗马”等关键词搜索。来源不同的资料，仍然可以用同一种方式查找。')+block('删分类不等于删笔记','删除普通分类后，原有笔记归入未分类；私密分类不能删除。不要为整理分组误删整篇内容。')+'</div>',
    ids=['04-01','04-02','04-03','04-04','04-05','04-06'], note='分类名与内容为虚构演示；图形为信息组织说明，非应用截图。')

add('第七站 / 分享', '想发出去的那一篇，\n先做成一张发得出去的卡。',
    '图麦笔记把这一篇排成一张图：十一套模板挑一套，署名和公开范围先看清楚，再生成。发出去的不再是一条别人懒得点的链接，是一张看得懂的卡。',
    '<div class="share-layout"><div class="two-cards">'+pic('旅行卡-lit.png','product-card','纸间文艺真实模板示例')+pic('旅行卡-card.png','product-card','玉版宣真实模板示例')+'</div><div class="story-copy">'+
    block('先选表达，再生成','从笔记详情进入制作，滑动比较卡面。生成后可以存到相册，再通过系统提供的渠道分享。')+
    block('有照片，也有不同文字节奏','生活观察可以用纸间文艺；希望要点更清楚，可以用玉版宣。后半册逐套展示十一种模板，不拿同一张卡冒充不同样式。')+
    '<div class="rule-note">进入卡片制作、准备阅读码时就可能建立公开。取消预览或隐藏二维码，不等于撤回公开；私密笔记不能制作分享卡。</div></div></div>',
    theme='green', ids=['06-02','06-16','06-18','07-01'], note='本地2.4.16模板实绘；虚构署名与内容，无真实笔记二维码。')

add('第八站 / 国外发朋友圈', '罗马傍晚七点，\n国内的朋友刚吃完早饭。',
    '卡做好了，人还在罗马。她把这张卡存进相册，打开微信朋友圈，配一句自己的话，选好谁能看——她和国内的朋友，此刻隔着七个小时。',
    figure(remote_share,'罗马露台上的过肩特写 / AI场景示意，非朋友圈操作截图','wide-scene')+
    '<div class="three-notes">'+block('先生成分享卡','核对照片、摘要与署名；需要继续阅读的入口时，制作带阅读码的卡片。')+block('由自己发到朋友圈','保存生成图片后，到微信朋友圈选择它并发布。图麦笔记不会代发，也不会替你决定可见范围。')+block('一张图，也是一个入口','朋友先看到旅行卡，有兴趣时再识别其中的阅读码，打开公开笔记，继续看文字和配图。')+'</div>',
    ids=['06-16','06-18','07-01','07-02'], note='朋友圈发布在微信中完成；本页为虚构远程分享故事，不是实际发布记录。')

add('第九站 / 国内朋友转存', '小禾扫了卡上那个码，\n读完存成自己的攻略。',
    '在国内刷到这张卡的小禾，不用装任何软件，扫码就把这一篇读完：介绍、照片、要点都在。她也想去罗马，点一下「存入笔记」，这一站就成了她的参考。',
    figure(friend,'小禾独自在国内家中阅读，林夏仍在国外 / AI场景示意','wide-scene')+
    '<div class="transfer"><div><i>林夏 · 国外</i><h3>保留自己的原笔记</h3><p>继续修改，不会替小禾改掉已经转存的副本。</p></div><span>→</span><div><i>小禾 · 国内</i><h3>留下独立的参考副本</h3><p>转存保留标题、摘要、要点等内容及来源信息。</p></div></div>'+
    p('公开阅读可以查看这篇已公开的配图；转存则不复制照片、完整正文、识别原文或分类。两件事不同：看得到配图，不代表配图被复制进副本。','rule-note'),
    ids=['07-02','07-03','07-04','07-05','07-06'], note=photo_note)

add('第十站 / 回国做手账', '回了国，\n她把这一站打印出来贴进手账。',
    '这张卡本来就是为打印准备的：照片、介绍、她自己写的那段都在一张纸上。和机票根、门票贴在一起，翻得动，也留得住。',
    figure(journal,'俯拍手部与纸张细节 / 打印手账AI场景示意','wide-native')+
    '<div class="three-notes">'+block('挑选合适的卡面','照片为主可选图文卡；希望保留书页气质，可选纸间文艺。先检查文字与图片，再生成保存。')+block('打印交给外部工具','使用相册中的卡片图片，通过打印机或打印服务输出。按纸张大小选择比例，不把它理解成应用内打印按钮。')+block('为回忆留下自己的位置','贴在手账里，旁边再写日期、路线与当时的感受。若保留阅读码，纸页还可以连接到公开笔记。')+'</div>',
    ids=['06-03','06-13','06-16','06-18'], note='打印与装帧是保存图片后的外部使用方式；本页不是实际打印测试。')

add('第十一站 / 家里的照片墙', '照片墙上那张卡，\n别人看一眼，她记得一整天。',
    '手账收进抽屉，还有一张贴在墙上。路过的人看见的是一张图，她自己知道那天从早上走到傍晚，走错了两次。',
    figure(wall,'回国后的全身环境照 / 家庭照片墙AI场景示意','wide-native')+
    '<div class="three-notes">'+block('照片负责唤起记忆','挑一张能代表那一天的画面；不必把全部照片都挤进一张卡。')+block('卡片负责说清故事','用标题与摘要补上背景，让第一次看到这张照片的人，也知道它对你意味着什么。')+block('阅读码连接更多内容','想让朋友继续阅读，就选用带码卡片，并保持对应笔记公开；码不要被相框或装饰遮住。')+'</div>',
    ids=['06-16','06-18','07-01'], note='打印尺寸、清晰度和反光会影响扫码；示意图不含可访问真实笔记的码。')

add('第十二站 / 闺蜜来家做客', '朋友指着墙上那张问：这是哪儿？\n她指了指那个码。',
    '闺蜜用微信扫卡片上的码，打开的就是这一篇——另外八张照片、完整的介绍、她写的那一段，都在里面。一张卡是入口，不是一张图的终点。',
    figure(scan,'小禾从照片墙扫描纸面阅读码 / 过肩特写，AI场景示意','wide-scene')+
    '<div class="three-notes">'+block('纸面入口，手机继续读','后置镜头对准纸面阅读码，识别成功后打开对应公开内容；不需要把全部照片都打印出来。')+block('一张卡背后的其他照片','在公开阅读页查看这篇可公开的配图与文字。能否读取取决于分享仍有效、图片已保存并可访问。')+block('喜欢的话，再留一份','小禾也能在小程序里转存独立笔记。转存仍不带照片，与扫码阅读原作者的配图不是同一件事。')+'</div>',
    ids=['06-18','07-01','07-02','07-03'], note='图中为演示码，不是可访问的真实笔记入口；未据此宣称完成纸面扫码实测。')

add('尾声 / 从旅行到日常', '旅行会结束，\n这样记下来的东西不会。',
    '回学校以后，同样的办法用在书页、公众号长文和课程资料上：看到就存，存了就整理，要找就搜。这册子的后半部分，把每一项单独讲清楚。',
    '<div class="closing-story">'+pic(journal)+'<div><span>看见</span><span>看懂</span><span>留下</span><span>分享</span></div></div>'+
    '<div class="three-notes">'+block('图，不只是一张截图','把眼前文字读入，也让无字照片以图片笔记的形式留下。')+block('文，不只是一段摘录','链接与文字都有入口，整理结果还能反复阅读、核对和编辑。')+block('分享，不止发一张图','给朋友阅读入口，让愿意继续用的人留下独立副本。')+'</div>',
    ids=['U01','U02','U03'], note=photo_note)

add('故事讲完 / 她留下了什么', '林夏的罗马五天，\n到这里讲完。',
    '图麦笔记没有替她多走一步路，只替她把看到的东西留成了说得清的样子。五天里发生的五件事，一件一件回看：',
    '<div class="recap">'
    '<div><i>01</i><span>同学发来的一条攻略链接</span><b>三句要点，原文还在下面</b></div>'
    '<div><i>02</i><span>一块看不懂的意大利语介绍牌</span><b>一张照片，读成了中文</b></div>'
    '<div><i>03</i><span>九张照片和她自己写的一段</span><b>一篇有标题、有摘要、有要点的笔记</b></div>'
    '<div><i>04</i><span>四五天记下的十几篇</span><b>归进「罗马」那一格，搜一句就出来</b></div>'
    '<div><i>05</i><span>一张发出去的卡片</span><b>朋友圈、手账、照片墙，和小禾的攻略</b></div>'
    '</div>'
    '<div class="rule-note">这五件事用的是同一个入口：新建页那一屏。下面开始，一项一项拆开说。</div>',
    ids=[], note='故事与人物均为虚构示例；这五件事都能在前十几页里找到对应的那一屏。', kind='story')

chapter_labels = {
    '01': '首页与新建', '02': '三种记法', '03': '整理成要点', '04': '找回那一篇',
    '05': '回看与修改', '06': '做成一张卡', '07': '发出去与撤回', '08': '只给自己看',
    '09': '界面换成你的', '10': '数据与删除', '11': '帮助与反馈', '12': '旅行之外的用法'
}

add('功能索引 / 按需深入', '我只有 712 KB，\n但能做的事不止这一屏。',
    '整个小程序的代码包 712 KB。小，是因为它只做一件事：把看到的东西变成能用的笔记。'
    '下面十二个功能域、七十七项，都是这一件事拆开来的样子。',
    '<div class="contents-grid">'+''.join(f'<a href="#chapter-{ch["id"]}"><i>{ch["id"]}</i><span>{escape(chapter_labels[ch["id"]])}</span><b>→</b></a>' for ch in chapters)+'</div>'+ribbon(['完整功能说明','十一套真实模板','语言与模型能力','产品使用边界'], numbered=False),
    theme='index-page', kind='index')

chapter_names = {
    '01': ('打开就是首页，拍照、贴链接、写字都在这一屏。','新建 / 笔记 / 我的'),
    '02': ('三种素材三个入口，不用换软件。','图片 / 链接 / 文字'),
    '03': ('右滑一下，外文变成中文要点，原文还在下面。','整理 / 翻译 / 核对'),
    '04': ('记了五十篇，还能一秒钟找到那一句。','搜索 / 分类 / 时间'),
    '05': ('回看不只是看，还能改、能补图、能接着写。','阅读 / 配图 / 编辑'),
    '06': ('同一篇笔记，十一套版式。','选模板 / 设署名 / 做成图'),
    '07': ('一张卡发出去，谁能看、能不能撤回。','公开 / 分享 / 转存'),
    '08': ('不想给别人看的那一格，设个密码。','密码 / 解锁 / 私密'),
    '09': ('界面能换成你自己顺眼的那一套。','背景 / 心情 / 亮度'),
    '10': ('你的资料存在哪、怎么删，这里查得到。','账号 / 保存 / 删除'),
    '11': ('第一次用不会的地方，有地方问。','帮助 / 推荐 / 反馈'),
    '12': ('旅行之外，读书、生活、写东西同样能用。','阅读 / 生活 / 创作')
}
template_map = {'06-03':'topBleedEdge','06-04':'card','06-05':'quote','06-06':'block','06-07':'spec','06-08':'letter','06-09':'popGrid','06-10':'popDots','06-11':'acid','06-12':'cover','06-13':'lit'}
chapter_refs = {}
market_done = False


def feature_html(f, template=False):
    """左图右要点：图按 2.4.16 源码逐屏画线稿并标号，文字只留三到四条。"""
    short = f['title']          # 整句当标题；从前按冒号切出来的那半句小字已撤（站长：不知道表达什么）
    b = POINTS[f['id']]
    if template:
        art = '<div class="template-stage">' + pic('旅行卡-' + template_map[f['id']] + '.png', 'template-image', short + '真实模板') + '</div>' \
              '<div class="wire-cap">本地 2.4.16 实绘 · 内容为虚构示例</div>'
    else:
        svg, _ = wire.diagram(b['screen'], b['focus'])
        art = '<div class="wire-stage">' + svg + '</div><div class="wire-cap">界面位置示意 · ' + \
              escape(SCREEN_NAMES[b['screen']]) + '（非真实截图）</div>'
    text = (f'<div class="feature-title"><span>{escape(f["id"])}</span><h2>{escape(short)}</h2></div>')
    text += '<ul class="points">' + ''.join('<li>' + escape(x) + '</li>' for x in b['points']) + '</ul>'
    if b.get('caution'):
        text += '<p class="caution">需要知道：' + escape(b['caution']) + '</p>'
    return (f'<article class="feature-column{" template-column" if template else ""}"'
            f' data-feature-id="{escape(f["id"])}"><div class="feature-art">{art}</div>'
            f'<div class="feature-text">{text}</div></article>')


MARKET_SHELF = [
    ('经典款（5）', [('图文卡', 'topBleedEdge', '先看现场，再读一段说明', True),
                    ('玉版宣', 'card', '把知识整理成一张可复习的卡', False),
                    ('摘句', 'quote', '让一句重点拥有自己的空间', False),
                    ('叠翠', 'block', '从主题走到可执行的要点', False),
                    ('规格卡', 'spec', '让条目便于定位和核对', False)]),
    ('个性款（6）', [('素宣信笺', 'letter', '按竖排节奏读一段话', False),
                    ('波普分格', 'popGrid', '用同一形象做四格重复', False),
                    ('网点漫画', 'popDots', '用印刷感突出一个观察', False),
                    ('荧光渐变', 'acid', '让灵感氛围接上具体要点', False),
                    ('杂志封面', 'cover', '用一张形象图引出文章', False),
                    ('纸间文艺', 'lit', '让生活观察保留书页感', False)]),
]


def market_shelf():
    """06 章开头那一页：把十一套真实模板按卡片市场那两组货架排出来。
    组名与顺序照 utils/poster.js（图文卡纳入经典款、排第一），卡面是本地代码实绘。"""
    out = ['<div class="market-shelf"><div class="mk-head"><b>卡片市场</b>'
           '<span>编辑卡片信息</span></div>']
    for label, items in MARKET_SHELF:
        out.append(f'<div class="mk-group">{escape(label)}</div><div class="mk-row r{len(items)}">')
        for name, key, line, on in items:
            out.append('<figure class="mk-cell' + (' on' if on else '') + '">'
                       + pic('旅行卡-' + key + '.png', 'mk-img', name + '真实卡面')
                       + f'<figcaption><b>{escape(name)}</b><span>{escape(line)}</span></figcaption></figure>')
        out.append('</div>')
    out.append('<div class="mk-foot">十一套都在这一屏，左右滑着挑；选中那一格带圆点。'
               '卡面由本地 2.4.16 产品代码实绘，内容与配图为虚构示例。</div></div>')
    return ''.join(out)


def mood_row():
    """五档心情一行排开，后一张压住前一张的一半：让读者看见这一档落到整屏上是什么样子。"""
    names = ['墨', '象牙', '天青', '樱落', '雨雾']
    cells = ''.join(
        f'<figure class="mood-shot">{pic("心情实拍-" + n + ".jpg", "mood-img", "图麦笔记首页·" + n + "档心情真实渲染")}'
        f'<figcaption>{n}</figcaption></figure>' for n in names)
    return '<div class="mood-row">' + cells + '</div>'


for ch in chapters:
    cid = ch['id']
    chapter_refs[cid] = len(pages)+1
    fs = ch['features']
    if cid == '06':
        groups = [fs[:2], *[fs[i:min(i+2,13)] for i in range(2,13,2)], *[fs[i:i+2] for i in range(13,len(fs),2)]]
    else:
        groups = [fs[i:i+2] for i in range(0,len(fs),2)]
    for gi, group in enumerate(groups):
        templates = all(POINTS[f['id']].get('art') == 'card' for f in group)
        if templates and not market_done:
            market_done = True
            add('功能 06 / 卡片表达', '同一篇笔记，十一套版式。',
                '先摆在一起看一眼：十一套模板分两组列在卡片市场里，排的都是同一份虚构罗马手记。'
                '下面按组拆开细看，每一套的取舍不一样。',
                market_shelf(), ids=[], note='卡面由本地 2.4.16 产品代码实绘；图文卡使用本地种子配方，内容与配图为虚构示例。',
                kind='reference')
        heading, motif = chapter_names[cid]
        intro = ch['intro'] if gi == 0 else ''
        body = '<div class="chapter-anchor" id="chapter-'+cid+'"></div>' if gi == 0 else ''
        if cid == '09' and gi == 0:
            add('功能 09 / 让界面更像自己', '五档心情，同一屏。',
                '点一下「换心情」，整屏跟着一起换：面板、导航条、卡片和底栏同时变色。'
                '下面五张是同一台手机、同一屏、同一张背景照片，只换那一档。',
                mood_row(), ids=[],
                note='五帧都是开发者工具 iPhone 12/13 档的真实渲染（734×1588）：按 App 自己那条「换心情」的代码路逐档切好后拍摄，色值取自 utils/palette.js 的 MOODS 五档。',
                kind='reference')
            chapter_refs[cid] = len(pages)+1
        elif not templates:
            body += '<div class="section-band"><span>'+escape(motif)+'</span><b>'+cid+'</b></div>'
        body += '<div class="feature-grid '+('templates' if templates else '')+' '+('single' if len(group)==1 else '')+'">'+''.join(feature_html(f,templates) for f in group)+'</div>'
        note = '模板由本地2.4.16产品代码实绘；图文卡使用本地种子配方，内容与配图为虚构示例。' if templates else '界面位置示意图按 2.4.16 源码逐屏绘制，屏上字样取自产品文案，不是真实截图。'
        add('功能 '+cid+' / '+ch['title'].split('：')[0],heading,intro,body,ids=[f['id'] for f in group],note=note,kind='reference')

languages=['英语','日语','韩语','法语','德语','西班牙语','俄语','阿拉伯语','葡萄牙语','意大利语','泰语','越南语','印地语','印尼语','土耳其语','荷兰语']
add('能力说明 / 支持的语言','十六种外文进来，\n出去是一篇中文。',
    '十六种外文内容支持整理成中文。菜单语言、内容整理语言和图片识字，是三件需要分清的事。',
    '<div class="language-grid">'+''.join(f'<div><i>{i+1:02}</i><span>{v}</span></div>' for i,v in enumerate(languages))+'</div>'+
    '<div class="three-notes">'+block('界面：中文与英文','首页中／EN切换的是菜单和提示，不会改写已有笔记，也不等于16种界面语言。')+block('整理：中文或原文语言','图片、链接、文字共用原文翻译开关。开启后将读入内容整理成中文，不是逐句对照的全文翻译。')+block('图片：先要识字成功','16语内容测试不能直接等同于16语图片识别全覆盖。清晰度、字形和识字模型支持都会影响结果。')+'</div>',
    note='语言名单据既有16语文本实测留档；本次编册未重新执行16语测试。',kind='capabilities')

add('能力说明 / 模型分工','先认出字，\n再整理意思。',
    '图麦笔记不是让一个模型凭照片编旅行故事，而是先取得文字，再组织内容，最后由你核对、补充和表达。',
    '<div class="model-flow">'+block('01 取得文字','图片交给RapidOCR识字；链接读取文章内容；文字输入直接进入整理。三种入口提供的材料不同，但都以读入文字为内容来源。')+block('02 整理内容','腾讯混元负责提炼摘要、要点与标签，并按翻译开关组织结果语言。文字录入的标题取原文首行，不保证每次都另拟新标题。')+block('03 留下个人表达','你回看原文与照片，修订遗漏或错误，再补上真实见闻。模板绘制负责排版，不是重新想象旅程的生成式作图。')+'</div>'+
    '<div class="model-bottom"><div><h3>可以帮助</h3><p>压缩信息、梳理要点、整理中文、形成可编辑的内容结构。</p></div><div><h3>不能代替</h3><p>事实核查、亲身经历、实时地图与订票，也不会凭风景照片理解所有景点。</p></div></div>'+
    p('技术口径：本地配置为RapidOCR 3.9.2 / PP-OCRv6 small；云函数默认混元hy3-preview，可由部署配置覆盖。这里描述本地配置，不冒充云端当前型号实测。','small'),
    theme='green',kind='capabilities')

add('使用边界 / 记录之前','记之前先确认：\n这张图读得清吗，这篇能用吗。',
    '保留资料之前，先确认素材可读取、有权使用；内容生成之后，再核对关键事实。',
    '<div class="boundary-grid">'+block('图片不是万能识别','每批最多9张。印刷文字需清晰；不提供手写识别、商品识别或估价，不支持HEIC。无字图可以成为图片笔记，但不等于分析了画面。')+block('链接不是所有网页都能读','登录、付费和站点限制可能影响正文或图片读取；不能把抓取成功理解成网页完整存档。')+block('长文存在处理上限','文字框直接输入最多2000字；粘贴追加路径不同，文字提交上限16000字，提炼取前12000字。重要信息不要只放在被截去的尾部。')+block('AI结果需要核对','地名、数字、时间与历史信息都可能识别或整理错误。保留的原文也可以被编辑，不是不可变的事实凭证。')+'</div>',kind='boundaries')

add('使用边界 / 保存与传播','公开、撤回、被别人转存，\n是三件不同的事。',
    '决定分享前，先分清哪些内容会被看见，以及哪些结果已经不再只由你控制。',
    '<div class="boundary-grid">'+block('进入制作就可能公开','为准备阅读码而进入制作时可能建立公开。隐藏码、取消预览、删除卡片，都不等于撤回公开入口。')+block('转存是独立副本','照片、完整正文、识别原文和分类不跟随转存。原作者之后的编辑，不会自动覆盖朋友手里的副本。')+block('撤回不能追收','撤回可以关闭公开入口，但收不回已经下载的图片或转存副本。公开页、导出图、转存副本的更新方式不同。')+block('云端不等于永久保管','不承诺永久保存、多端实时同步或所有图片都有备份。删除与注销前先判断后果；这里也不是团队协作工具。')+'</div>'+p('公开内容需接受安全检查；素材、原文和肖像应有使用权。不提供语音录入，也不通过付费移除AI或来源标识。','rule-note'),kind='boundaries')

add('下一站 / 轮到你的故事','下一趟出门，\n带一篇说得清的东西回来。',
    '把眼前的介绍读懂，把沿途的照片留下，把自己的感受写进去。下一场旅行，从一篇属于你的笔记开始。',
    '<div class="last-image">'+pic(hero)+'</div><div class="end-word"><strong>图麦笔记</strong><span>读懂这一站，写下自己的旅程。</span></div>',
    theme='cover',note='微信小程序 · 本册依据本地2.4.16整理 · 虚构故事与AI场景，不作真实用户证言。',kind='closing')

add('找到我们 / 官网与联系', '想试的话，\n从这里进来。',
    '微信里搜「图麦笔记」就能打开，也可以扫右边那一枚码。用得不顺、想提一句，或者发现了问题，都写在下面。',
    '<div class="contact"><div class="contact-list">'
    '<div><i>小程序</i><span>图麦笔记</span></div>'
    '<div><i>官网</i><span>agentsbin.cn</span></div>'
    '<div><i>反馈邮箱</i><span>jacky28471258@gmail.com</span></div>'
    '<div><i>微信号</i><span>jackyai2026</span></div>'
    '</div><figure class="contact-mark">'
    + pic('品牌小程序码.png', 'cv-mark', '图麦笔记小程序码')
    + '<figcaption>长按识别，或在微信里扫一扫</figcaption></figure></div>'
    '<div class="rule-note">邮箱里读到的每一封都会看。功能建议、报错截图、想看到的下一步，都可以直接发。</div>',
    ids=[], note='小程序名、官网与反馈邮箱取自小程序包内的现值，屏上「我的」与「关于」读的就是同一份；微信号是站长 2026-10-25 给的那一枚。右边那枚码与封面同一枚。',
    theme='closing-page', kind='closing')

css = '''
:root{--paper:#e2ded4;--ink:#19201f;--green:#223d35;--clay:#b95b3b;--muted:#59635c;--line:#c9cdc3}*{box-sizing:border-box}@font-face{font-family:"Zhuque Fangsong";src:url("素材/朱雀仿宋-Regular.ttf") format("truetype");font-display:swap}body{margin:0;background:#d3cfc5;color:var(--ink);font-family:"Zhuque Fangsong","Songti SC","Hiragino Sans GB","PingFang SC",serif;-webkit-font-smoothing:antialiased}a{color:inherit;text-decoration:none}button,select{font:inherit}button:focus-visible,select:focus-visible,a:focus-visible{outline:3px solid var(--clay);outline-offset:4px}.reader{position:sticky;top:0;z-index:10;background:var(--paper);padding:12px 24px;display:flex;align-items:center;gap:20px;border-bottom:1px solid var(--line);font-size:14px}.reader strong{margin-right:auto}.reader select{max-width:48vw;background:transparent;border:1px solid var(--line);padding:6px 12px}.reader button{background:var(--green);color:var(--paper);border:0;padding:8px 16px;cursor:pointer}.page-wrap{margin:30px auto;position:relative;width:1280px;height:1600px}.page{width:1280px;height:1600px;position:relative;background:var(--paper);padding:0 76px;overflow:visible;transform-origin:top left}.running{position:absolute;left:76px;right:76px;top:43px;height:46px;display:flex;justify-content:space-between;align-items:flex-start;border-bottom:2px solid currentColor;font-size:15px;letter-spacing:.6px}.running b{font-family:Arial,sans-serif;font-size:13px;margin-left:12px;font-weight:500;letter-spacing:1px}.page-head{position:absolute;left:76px;right:76px;top:132px}.eyebrow{font-size:14px;letter-spacing:2px;color:var(--clay);margin-bottom:22px}h1{font-size:61px;line-height:1.25;letter-spacing:-1.5px;margin:0;font-weight:600}p{font-size:23px;line-height:1.85;margin:0 0 22px;overflow-wrap:anywhere;line-break:strict}h2{font-size:32px;line-height:1.5;margin:0 0 20px}h3{font-size:25px;line-height:1.5;margin:0 0 14px;font-weight:600}.intro{font-size:23px;line-height:1.8;max-width:1060px;margin:26px 0 0;color:var(--muted)}.page-content{position:absolute;top:454px;left:76px;right:76px;bottom:124px}footer{position:absolute;bottom:40px;left:76px;right:76px;border-top:1px solid var(--line);padding-top:20px;display:flex;gap:20px;align-items:flex-start;font-size:13px;line-height:1.7;color:var(--muted)}footer span{max-width:1020px}footer b{margin-left:auto;font-family:Arial,sans-serif;font-size:18px;font-weight:400}figure{margin:0}img{display:block;max-width:100%;object-fit:cover}figcaption{font-size:13px;color:var(--muted);line-height:1.8;margin-top:14px}.green footer{color:#d0dacd;border-color:#7c9080}.cover-a{background:var(--paper);color:var(--ink)}.cover-a .running,.cover-a .eyebrow{display:none}.cover-a .page-head{top:104px}.cv-brand{display:flex;align-items:flex-start;justify-content:space-between;gap:40px}.cv-name{font-size:66px;font-weight:600;letter-spacing:2px;line-height:1}.cv-name span{display:block;font:19px/1 Arial,sans-serif;letter-spacing:11px;color:var(--clay);margin-top:13px}.cv-mark{width:150px;height:150px;object-fit:contain}.cv-rule{width:104px;height:10px;background:var(--clay);margin:32px 0 30px}.cover-a h1{font-size:104px;line-height:1.16;letter-spacing:-4px;font-weight:600;margin:0}.cover-a .intro{font-size:27px;line-height:1.75;color:var(--muted);margin-top:34px;max-width:980px;white-space:pre-line}.cover-a .page-content{top:758px}.cv-strip{display:grid;grid-template-columns:324px 1fr;gap:64px;align-items:start;padding:0}.ui-shotwrap{position:relative;line-height:0}.ui-shot{width:324px;height:auto;border-radius:32px;display:block;border:1px solid rgba(25,32,31,.16)}.ui-side b{display:block;font-size:38px;font-weight:600;letter-spacing:-1px;color:var(--ink)}.ui-side p{font-size:21px;line-height:1.85;margin:22px 0 0;max-width:560px;color:var(--muted)}.cv-meta{font-size:20px;line-height:1.75;color:var(--muted);margin-top:46px;border-top:1px solid var(--line);padding-top:22px}.cv-meta span{display:block}.triptych{display:grid;grid-template-columns:repeat(3,1fr);gap:24px}.triptych img{width:100%;height:380px;object-position:60% center}.ribbon{display:flex;margin-top:65px;border-top:2px solid var(--ink);border-bottom:1px solid var(--line)}.ribbon>div{flex:1;padding:25px 10px 27px 0;display:flex;flex-direction:column;gap:14px}.ribbon i{font:20px Arial,sans-serif;color:var(--clay);font-style:normal}.ribbon i.dot{width:26px;height:5px;background:var(--clay);margin:6px 0}.ribbon span{font-size:20px}.editorial-quote{font-size:41px;line-height:1.5;margin:61px 0 30px;letter-spacing:-.5px;max-width:900px}.editorial-quote:before{content:"";display:block;width:88px;height:8px;background:var(--clay);margin-bottom:25px}.compact{font-size:34px}.small{font-size:16px;color:var(--muted);line-height:1.9}.split{display:grid;grid-template-columns:1fr 1fr;gap:72px}.portrait img{width:100%;height:770px;object-position:58% center}.story-copy .copy-block{margin-bottom:40px}.story-copy p{font-size:23px}.control{object-fit:contain;width:auto}.small-control{height:90px;margin:0 0 33px}.rule-note{border-left:5px solid var(--clay);padding:18px 0 18px 25px;font-size:19px;line-height:1.85;margin:24px 0 0}.wide-scene img{width:100%;height:610px;object-position:center 43%}.three-notes{display:grid;grid-template-columns:repeat(3,1fr);gap:42px;margin-top:50px}.three-notes .copy-block{border-top:5px solid var(--clay);padding-top:24px}.three-notes h3{font-size:24px}.three-notes p{font-size:21px;line-height:1.85}.value-layout{display:grid;grid-template-columns:1fr 260px;gap:80px}.value-layout figure{margin-top:60px}.value-layout figure img{width:100%;height:auto}.numbers{display:flex;flex-direction:column;gap:37px}.numbers b{font:105px/1 Arial,sans-serif;letter-spacing:-5px;color:var(--clay)}.numbers h3{margin:15px 0 12px;font-size:23px}.numbers p{font-size:20px}.text-excerpt{background:#e3e5dc;padding:30px 32px;margin-bottom:40px;border-top:8px solid var(--clay)}label{font-size:14px;line-height:1.7;display:block;color:var(--muted);margin-bottom:22px}.text-excerpt>p{font-weight:600}.text-excerpt blockquote{font-size:26px;line-height:1.8;margin:0}.green{background:var(--green);color:var(--paper)}.green .intro,.green p,.green label{color:#d4ded0}.green .eyebrow{color:#e6a68a}.green .rule-note{border-color:#d58a68}.green .small{color:#d4ded0}.toggle-control{height:51px;margin:12px 0 25px}.slider-control{width:490px;margin:54px 0 44px}.note-demo{background:var(--paper);color:var(--ink);padding:36px 40px;border-top:12px solid var(--clay)}.note-demo label,.note-demo p{color:var(--ink)}.note-demo>div{padding:20px 0;border-bottom:1px solid var(--line)}.note-demo>div:last-child{border-bottom:0}.note-demo small{font-size:16px;color:var(--muted)}.note-demo h2{margin:14px 0 10px;font-size:36px}.note-demo p{font-size:23px;margin:15px 0}.photo-sequence{display:grid;grid-template-columns:repeat(3,1fr);gap:25px}.photo-sequence>div{overflow:hidden}.photo-sequence img{width:100%;height:365px;object-fit:cover}.photo-sequence span{display:block;padding:20px 0;border-bottom:1px solid var(--line);font-size:18px}.shot-0{object-position:0 0}.shot-1{object-position:100% 0}.shot-2{object-position:100% 100%}.category-graphic{background:var(--green);color:var(--paper);padding:34px 42px}.category-graphic label{color:#c7d3c3}.category-graphic>div{display:grid;grid-template-columns:185px 1fr;gap:32px;padding:24px 0;border-bottom:1px solid #657d6a;align-items:center}.category-graphic>div:last-child{border:0}.category-graphic span{font-size:43px}.category-graphic p{font-size:23px;margin:0;color:#d4ded0}.share-layout{display:grid;grid-template-columns:1.1fr 1fr;gap:60px}.two-cards{display:flex;flex-direction:column;align-items:flex-start;gap:30px}.product-card{object-fit:contain;width:270px;max-height:475px;border:1px solid var(--line)}.product-card:nth-child(2){align-self:flex-end;margin-top:-240px;width:270px;max-height:560px}.share-layout .story-copy{padding-top:30px}.transfer{display:grid;grid-template-columns:1fr 50px 1fr;gap:26px;margin-top:32px}.transfer i{color:var(--clay);font-size:15px;font-style:normal}.transfer h3{font-size:26px;margin:12px 0}.transfer p{font-size:21px;margin:0}.transfer>span{font-size:40px;padding-top:32px}.closing-story{position:relative}.closing-story>img{width:100%;height:560px;object-position:center 53%}.closing-story>div{display:flex;background:var(--clay);color:var(--paper)}.closing-story span{flex:1;text-align:left;padding:25px 30px;font-size:31px;border-right:1px solid #d89b7c}.contents-grid{display:grid;grid-template-columns:1fr 1fr;column-gap:70px}.contents-grid a{display:flex;align-items:center;gap:25px;border-bottom:1px solid var(--line);padding:26px 0}.contents-grid i{font:36px Arial,sans-serif;color:var(--clay);font-style:normal}.contents-grid span{font-size:24px}.contents-grid b{font-size:23px;margin-left:auto;font-weight:400}.page[data-kind=reference] .page-head{top:126px}.page[data-kind=reference] h1{font-size:51px}.page[data-kind=reference] .intro{font-size:20px;line-height:1.8;max-width:1100px}.page[data-kind=reference] .page-content{top:374px}.section-band{display:flex;align-items:center;justify-content:space-between;height:112px;background:var(--green);color:var(--paper);padding:20px 31px;margin-bottom:42px;border-left:13px solid var(--clay)}.section-band span{font-size:27px;letter-spacing:1px}.section-band b{font:60px Arial,sans-serif;font-weight:400;color:#c6d2c2}.feature-grid{display:flex;flex-direction:column;gap:44px}.feature-column{border-top:3px solid var(--clay);padding-top:20px;display:grid;grid-template-columns:240px 1fr;gap:0 40px;align-items:start}.feature-title>span{font:13px Arial,sans-serif;color:var(--muted);display:block;margin-bottom:10px}.feature-title h2{font-size:30px;margin:0 0 8px;line-height:1.4;letter-spacing:-.4px}.feature-subtitle{font-size:19px;line-height:1.6;color:var(--muted);margin:0 0 20px}.points{list-style:none;padding:0;margin:0}.points li{position:relative;padding-left:19px;font-size:19px;line-height:1.6;margin-bottom:13px}.points li:before{content:"";position:absolute;left:0;top:10px;width:8px;height:8px;background:var(--clay)}.caution{font-size:15px;line-height:1.7;color:var(--muted);border-top:1px solid var(--line);padding-top:12px;margin:6px 0 0}.wire-stage svg{width:240px;height:auto;display:block}.wire-cap{font-size:11px;line-height:1.6;color:var(--muted);margin-top:9px;border-left:2px solid var(--clay);padding-left:8px}.template-stage{height:300px;background:#e3e5dc;display:flex;align-items:center;justify-content:center;padding:12px}.template-image{height:100%;width:auto;object-fit:contain;max-width:100%}.template-column{grid-template-columns:240px 1fr}.template-column .template-stage{height:344px}.feature-grid.single{gap:0}.feature-grid.single .feature-column{grid-template-columns:404px 1fr;gap:0 56px;padding-top:26px}.feature-grid.single .wire-stage svg{width:404px}.feature-grid.single .feature-title h2{font-size:40px;letter-spacing:-1px}.feature-grid.single .feature-subtitle{font-size:22px;margin-bottom:26px}.feature-grid.single .points li{font-size:22px;line-height:1.65;margin-bottom:17px;padding-left:23px}.feature-grid.single .points li:before{top:12px;width:9px;height:9px}.feature-grid.single .caution{font-size:17px;padding-top:15px}.feature-grid.single .wire-cap{font-size:13px;margin-top:13px}.feature-grid.single .template-column .template-stage,.feature-grid.single.template-stage{height:640px}.feature-grid.single .template-stage{height:640px}.market-shelf{border-top:3px solid var(--ink);padding-top:22px}.mk-head{display:flex;align-items:baseline;gap:22px}.mk-head b{font-size:36px;font-weight:600;letter-spacing:-1px}.mk-head span{margin-left:auto;font-size:15px;color:var(--clay);border:1px solid var(--clay);padding:7px 15px}.mk-group{font-size:15px;letter-spacing:2.5px;color:var(--clay);border-bottom:1px solid var(--line);padding:26px 0 9px}.mk-row{display:grid;gap:16px;margin-top:16px}.mk-row.r5{grid-template-columns:repeat(5,1fr)}.mk-row.r6{grid-template-columns:repeat(6,1fr)}.mk-cell{margin:0;background:#fff;border:1px solid var(--line);padding:9px 9px 11px}.mk-cell.on{border-color:var(--clay);border-width:2px}.mk-cell img{width:100%;aspect-ratio:3/4;object-fit:contain;background:#f4f1eb}.mk-cell figcaption{margin-top:9px}.mk-cell b{display:block;font-size:16px;font-weight:600;line-height:1.35}.mk-cell span{display:block;font-size:11.5px;line-height:1.5;color:var(--muted);margin-top:4px}.mk-cell.on b:after{content:"";display:inline-block;width:7px;height:7px;border-radius:50%;background:var(--clay);margin-left:7px;vertical-align:middle}.mk-foot{font-size:13px;line-height:1.7;color:var(--muted);border-top:1px solid var(--line);margin-top:26px;padding-top:12px}.language-grid{display:grid;grid-template-columns:repeat(4,1fr);gap:0 38px}.language-grid>div{display:flex;align-items:center;gap:20px;border-top:1px solid var(--ink);height:109px}.language-grid i{font:18px Arial,sans-serif;color:var(--clay);font-style:normal}.language-grid span{font-size:28px}.model-flow{border-top:7px solid var(--clay)}.model-flow .copy-block{display:grid;grid-template-columns:260px 1fr;gap:55px;padding:36px 0 20px;border-bottom:1px solid #7b8e7e}.model-flow p{font-size:23px}.model-bottom{display:grid;grid-template-columns:1fr 1fr;gap:70px;margin:48px 0 30px}.model-bottom p{font-size:22px}.boundary-grid{display:grid;grid-template-columns:1fr 1fr;gap:65px 75px;margin-top:18px}.boundary-grid .copy-block{border-top:8px solid var(--clay);padding-top:35px}.boundary-grid h3{font-size:28px}.boundary-grid p{font-size:25px;line-height:1.9}.last-image img{width:100%;height:710px;object-position:center 40%}.end-word{display:flex;flex-direction:column;gap:22px;margin-top:55px}.end-word strong{font-size:43px}.end-word span{font-size:26px}.chapter-anchor{position:absolute;top:-374px}.reader-status{font-size:12px;color:var(--muted)}
.cover-a{background:#141614;color:#f7f4ed;padding:0}.cover-a .page-head{position:static;padding:0}.cover-a .page-head h1{position:absolute;width:1px;height:1px;overflow:hidden;clip-path:inset(50%);white-space:nowrap}
.cv2-bg{position:absolute;inset:0;background-size:cover;background-position:72% 22%}.cv2-veil{position:absolute;inset:0;background:linear-gradient(180deg,rgba(18,20,18,.40) 0%,rgba(18,20,18,.06) 26%,rgba(18,20,18,.30) 46%,rgba(18,20,18,.72) 66%,rgba(18,20,18,.92) 100%)}.cv2-veilr{position:absolute;top:0;right:0;bottom:0;width:560px;background:linear-gradient(270deg,rgba(18,20,18,.66) 0%,rgba(18,20,18,.34) 52%,rgba(18,20,18,0) 100%)}
.cv2-brand{position:absolute;left:76px;top:68px}.cv2-brand b{display:block;font-size:62px;font-weight:600;letter-spacing:3px;line-height:1;color:#f4f1ea}.cv2-brand span{display:block;font:17px/1 Arial,sans-serif;letter-spacing:10px;color:#e8b48f;margin-top:12px}
.cv2-qr{position:absolute;right:76px;top:64px;width:168px;text-align:center}.cv2-qr img{width:168px;height:168px;margin:0 auto}.cv2-qr figcaption{font-size:16px;color:#d5cfc3;letter-spacing:1px;margin-top:8px}
.cv2-stats{position:absolute;right:76px;top:300px;width:290px;text-align:right}.cv2-num{padding:22px 0 0;border-top:1px solid rgba(247,244,237,.22)}.cv2-num:first-child{border-top:0;padding-top:0}.cv2-num .v{display:flex;align-items:baseline;justify-content:flex-end}.cv2-num b{font-size:44px;line-height:1;font-weight:600;color:#f7f4ed}.cv2-num .v i{font-style:normal;font-size:19px;color:#e8b48f;margin-left:6px}.cv2-num em{display:block;font-style:normal;font-size:16px;line-height:1.5;color:#e6e1d7;margin-top:8px}
.cover-a .page-content{top:1105px;left:0;right:0;bottom:0;padding:0}.cv2-band{position:absolute;left:0;right:0;top:0;background:rgba(20,22,20,.74);padding:24px 76px 0;display:grid;grid-template-columns:auto 1fr;gap:48px;align-items:end}
.cv2-strip{display:flex;gap:22px;align-items:flex-end}.cv2-shot{margin:0;width:177px}.cv2-shot img{width:177px;height:auto;border-radius:20px;border:1px solid rgba(247,244,237,.30)}
.cv2-right{display:flex;flex-direction:column;justify-content:flex-end;padding:26px 0}.cv2-hero img{width:470px;height:auto;margin-left:auto;opacity:.8}
.cv2-mood{margin-top:26px;padding-top:20px;border-top:1px solid rgba(247,244,237,.22);display:flex;justify-content:flex-end;align-items:center;gap:26px}.cv2-mood>span{font-size:18px;color:#d5cfc3;letter-spacing:1px;white-space:nowrap}.cv2-mood .row{display:flex;gap:18px}.cv2-disc{width:58px;height:58px;border-radius:50%;border:1px solid rgba(247,244,237,.42)}
.cover-a footer{bottom:26px;border-top:0;padding-top:0;font-size:16px;line-height:1.6;color:#a9a398}.cover-a footer b{font-size:16px;color:#a9a398}
.wide-native img{width:100%;height:610px;object-fit:contain}.recap{border-top:3px solid var(--ink)}.recap>div{display:grid;grid-template-columns:74px 1fr 1fr;gap:0 34px;align-items:baseline;padding:30px 0;border-bottom:1px solid var(--line)}.recap i{font:19px Arial,sans-serif;font-style:normal;color:var(--clay)}.recap span{font-size:26px;line-height:1.6}.recap b{font-size:26px;font-weight:600;line-height:1.6;letter-spacing:-.3px}.mood-row{display:flex;justify-content:center;padding-top:16px}.mood-shot{margin:0;width:288px;flex:0 0 auto}.mood-shot+.mood-shot{margin-left:-144px}.mood-shot img{width:100%;height:auto;border-radius:26px;background:#fff;border:5px solid var(--paper)}.mood-shot figcaption{font-size:22px;line-height:1.4;color:var(--ink);text-align:center;margin-top:20px;letter-spacing:2px}.contact{display:grid;grid-template-columns:1fr 300px;gap:80px;align-items:start;border-top:3px solid var(--ink);padding-top:10px}.contact-list>div{display:grid;grid-template-columns:190px 1fr;gap:0 30px;align-items:baseline;padding:34px 0;border-bottom:1px solid var(--line)}.contact-list i{font-size:20px;font-style:normal;letter-spacing:2px;color:var(--clay)}.contact-list span{font-size:38px;letter-spacing:-.5px}.contact-mark{text-align:center}.contact-mark img{width:230px;height:230px;object-fit:contain;margin:14px auto 0}.contact-mark figcaption{font-size:16px;text-align:center}
@media(max-width:600px){.reader{padding:10px 12px;gap:9px;flex-wrap:wrap}.reader strong{font-size:13px}.reader select{max-width:65vw;font-size:12px}.reader button{font-size:12px}.reader-status{display:none}.page-wrap{margin:14px auto}}
@media screen and (max-width:599px){.page{width:100%;height:auto;padding:22px;scroll-margin-top:90px}.running{position:static;height:auto;gap:10px;font-size:10px;line-height:1.7;padding-bottom:14px}.running b{display:block;font-size:9px;margin:0}.page-head,.cover .page-head,.page[data-kind=reference] .page-head{position:static;margin-top:30px}.page h1,.cover h1,.page[data-kind=reference] h1{font-size:34px;letter-spacing:-1px;line-height:1.3}.page .intro,.page[data-kind=reference] .intro{font-size:17px;line-height:1.9;margin-top:22px}.eyebrow{font-size:11px;letter-spacing:1px;margin-bottom:15px}.page-content,.cover .page-content,.page[data-kind=reference] .page-content{position:static;margin-top:30px}.page p,.story-copy p,.three-notes p,.boundary-grid p,.model-flow p,.model-bottom p{font-size:17px;line-height:1.9}.page h2{font-size:26px}.page h3,.three-notes h3,.boundary-grid h3{font-size:22px}.page footer{position:static;margin-top:35px;font-size:10px;padding-top:15px}.cv-name{font-size:34px;letter-spacing:1px}.cv-name span{font-size:12px;letter-spacing:5px;margin-top:10px}.cv-mark{width:62px;height:62px}.cv-rule{width:60px;height:6px;margin:20px 0 18px}.cover-a h1{font-size:38px;letter-spacing:-1.4px;line-height:1.26}.cover-a .intro{font-size:16px;margin-top:18px}.cv-strip{grid-template-columns:1fr;gap:24px;justify-items:start;padding:0}.ui-shot{width:262px}.ui-side{text-align:left;width:100%}.ui-side b{font-size:24px}.ui-side p{font-size:16px;margin-top:12px}.cv-meta{font-size:15px;margin-top:20px}.triptych,.split,.three-notes,.value-layout,.share-layout,.feature-grid,.feature-grid.single,.templates.single,.contents-grid,.boundary-grid,.model-bottom{grid-template-columns:1fr;gap:30px}.triptych img,.portrait img,.wide-scene img,.wide-native img,.closing-story>img,.last-image img{width:100%;height:auto;max-height:450px;object-fit:cover}.triptych figure+figure{margin-top:8px}.ribbon{flex-wrap:wrap;margin-top:30px}.ribbon>div{flex:1 1 40%;padding:16px 8px 16px 0}.ribbon span{font-size:16px}.ribbon i{font-size:14px}.editorial-quote,.compact{font-size:27px;margin-top:35px}.page .small{font-size:13px}.story-copy .copy-block{margin-bottom:25px}.rule-note{font-size:15px!important;padding-left:16px;margin-top:24px}.three-notes{margin-top:28px}.three-notes .copy-block{padding-top:18px}.value-layout figure{margin-top:0}.numbers{flex-direction:row;gap:15px;margin-top:28px}.numbers>div{flex:1;min-width:0}.numbers b{font-size:55px;letter-spacing:-2px}.numbers h3{font-size:17px}.numbers p{font-size:14px}.text-excerpt{padding:23px}.text-excerpt blockquote{font-size:22px}.note-demo{padding:23px}.toggle-control{height:40px}.slider-control{width:100%;margin:30px 0}.photo-sequence{gap:12px}.photo-sequence img{height:120px}.photo-sequence span{font-size:11px;line-height:1.7;padding:12px 0}.category-graphic{padding:24px}.category-graphic>div{grid-template-columns:1fr;gap:10px;padding:18px 0}.category-graphic span{font-size:28px}.category-graphic p{font-size:16px}.two-cards{flex-direction:row;gap:16px}.product-card,.product-card:nth-child(2){width:calc(50% - 8px);height:auto;max-height:none;margin:0;align-self:flex-start}.transfer{grid-template-columns:1fr;gap:12px}.transfer>span{padding:0;transform:rotate(90deg);width:30px}.transfer p{font-size:17px}.closing-story span{font-size:17px;padding:17px 10px}.contents-grid a{padding:15px 0}.contents-grid span{font-size:18px}.section-band{height:auto;min-height:90px;padding:18px;margin-bottom:28px}.section-band span{font-size:19px}.section-band b{font-size:38px}.feature-column{grid-template-columns:1fr;gap:18px}.feature-title h2{font-size:24px}.feature-subtitle{font-size:16px;margin-bottom:14px}.points li{font-size:16px;line-height:1.75;margin-bottom:10px;padding-left:15px}.points li:before{top:9px;width:6px;height:6px}.caution{font-size:13px}.mk-row.r5,.mk-row.r6{grid-template-columns:repeat(2,1fr)}.mk-cell img{aspect-ratio:3/4}.market-shelf{padding-top:16px}.mk-head b{font-size:26px}.mk-head span{font-size:12px;padding:5px 10px}.wire-stage svg{width:200px}.feature-grid.single .feature-column{grid-template-columns:1fr;gap:20px}.mk-row.r5,.mk-row.r6{grid-template-columns:repeat(2,1fr)}.market-shelf{padding-top:16px}.mk-head b{font-size:26px}.mk-head span{font-size:12px;padding:5px 10px}.feature-grid.single .wire-stage svg{width:200px}.feature-grid.single .wire-cap{font-size:11px}.feature-grid.single .feature-subtitle{font-size:16px}.feature-grid.single .caution{font-size:13px}.wire-stage svg{width:200px}.mk-cell img{aspect-ratio:3/4}.market-shelf{padding-top:16px}.mk-head b{font-size:26px}.mk-head span{font-size:12px;padding:5px 10px}.wire-stage svg{width:200px}.feature-grid.single .feature-title h2{font-size:26px}.feature-grid.single .points li{font-size:16px}.feature-grid.single .template-stage{height:330px}.template-stage,.template-column .template-stage{height:330px}.template-image{height:100%;object-fit:contain}.language-grid{grid-template-columns:1fr 1fr;gap:0 20px}.language-grid>div{gap:10px;height:75px}.language-grid span{font-size:20px}.language-grid i{font-size:12px}.model-flow .copy-block{grid-template-columns:1fr;gap:12px;padding:25px 0 10px}.model-bottom{margin-top:30px}.boundary-grid{row-gap:30px}.boundary-grid .copy-block{padding-top:23px}.end-word{margin-top:30px}.end-word strong{font-size:32px}.end-word span{font-size:20px}.chapter-anchor{display:none}.recap>div{grid-template-columns:44px 1fr;gap:6px 16px;padding:16px 0}.recap span,.recap b{font-size:17px;grid-column:2}.mood-row{flex-wrap:nowrap;justify-content:flex-start;gap:0}.mood-shot{width:112px}.mood-shot+.mood-shot{margin-left:-60px}.mood-shot figcaption{font-size:13px;letter-spacing:1px;margin-top:10px}.contact{grid-template-columns:1fr;gap:26px}.contact-list>div{grid-template-columns:1fr;gap:6px;padding:16px 0}.contact-list span{font-size:24px}.contact-mark img{width:170px;height:170px}
.cover-a{padding:22px}.cv2-veil,.cv2-veilr{display:none}.cv2-bg{position:static;display:block;width:100%;height:230px;background-size:cover;background-position:72% 22%;border-radius:14px;margin-bottom:18px}
.cv2-brand{position:static}.cv2-brand b{font-size:34px;letter-spacing:1px}.cv2-brand span{font-size:12px;letter-spacing:5px;margin-top:10px}
.cv2-qr{position:static;width:auto;display:flex;align-items:center;gap:14px;text-align:left;margin-top:16px}.cv2-qr img{width:92px;height:92px;margin:0}.cv2-qr figcaption{margin-top:0;font-size:13px}
.cv2-stats{position:static;width:auto;text-align:left;display:grid;grid-template-columns:1fr 1fr;gap:14px 20px;margin:18px 0 0}.cv2-num{border-top:0;padding:0}.cv2-num .v{justify-content:flex-start}.cv2-num b{font-size:30px}.cv2-num .v i{font-size:14px}.cv2-num em{font-size:13px;margin-top:4px}
.cv2-band{position:static;background:transparent;padding:0;display:block}.cv2-right{padding:0}.cv2-hero img{width:100%;max-width:330px;margin:16px 0 0}
.cv2-strip{gap:12px}.cv2-shot{width:calc(50% - 6px)}.cv2-shot img{width:100%}
.cv2-mood{display:block;border-top:0;padding-top:14px;margin-top:14px}.cv2-mood .row{flex-wrap:wrap;gap:10px;margin-top:10px}.cv2-disc{width:40px;height:40px}
.cover-a footer{position:static;margin-top:18px;bottom:auto;font-size:12px}}
@media print{@page{size:1280px 1600px;margin:0}body{background:white}.reader{display:none}.page-wrap{margin:0!important;width:1280px!important;height:1600px!important;break-after:page;break-inside:avoid}.page-wrap:last-child{break-after:auto}.page{transform:none!important;print-color-adjust:exact;-webkit-print-color-adjust:exact}}
'''
options=''.join(f'<option value="{pg["number"]}">{pg["number"]:02} · {escape(pg["title"].replace(chr(10), ""))}</option>' for pg in pages)
script='''
const select=document.querySelector('#page-select');
function resize(){const mobile=innerWidth<600;const scale=Math.min(1,(innerWidth-24)/1280);document.querySelectorAll('.page-wrap').forEach(w=>{w.style.width=mobile?`${innerWidth-24}px`:`${1280*scale}px`;w.style.height=mobile?'auto':`${1600*scale}px`;w.firstElementChild.style.transform=mobile?'none':`scale(${scale})`});}
addEventListener('resize',resize);resize();
select.addEventListener('change',()=>document.querySelector(`#page-${select.value}`).parentElement.scrollIntoView({behavior:'smooth',block:'start'}));
document.querySelector('#print').onclick=()=>print();
document.querySelectorAll('.contents-grid a').forEach(a=>a.addEventListener('click',e=>{e.preventDefault();document.querySelector(a.getAttribute('href')).closest('.page-wrap').scrollIntoView({behavior:'smooth',block:'start'})}));
'''
html='<!doctype html><html lang="zh-CN"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>图麦笔记 · 林夏的罗马手记</title><style>'+css+'</style></head><body><nav class="reader"><strong>图麦笔记 · 林夏的罗马手记</strong><span class="reader-status">旅行故事＋完整功能 · '+str(len(pages))+'页</span><select id="page-select" aria-label="跳转页面">'+options+'</select><button id="print">打印 / 存为PDF</button></nav>'+''.join('<div class="page-wrap">'+pg['html']+'</div>' for pg in pages)+'<script>'+script+'</script></body></html>'
(ROOT/'图麦笔记-旅行故事版.html').write_text(html)
coverage={fid:[pg['number'] for pg in pages if fid in pg['features']] for fid in features}
reference_coverage={fid:[pg['number'] for pg in pages if pg['kind']=='reference' and fid in pg['features']] for fid in features}
assert all(len(v)==1 for v in reference_coverage.values()),reference_coverage
report={'edition':'瑞士排版旅行故事版','local_product_version':'2.4.16','pages':len(pages),'features':len(features),'reference_paragraphs':len(features)*4,'template_count':len(template_map),'languages':languages,'page_plan':[{k:v for k,v in pg.items() if k!='html'} for pg in pages],'coverage':coverage,'reference_coverage':reference_coverage,'chapter_pages':chapter_refs,'hero_asset':hero,'final_brochure_laid_out':True,'verified':False}
(ROOT/'旅行故事版-编排与覆盖.json').write_text(json.dumps(report,ensure_ascii=False,indent=2))
print(json.dumps({'pages':len(pages),'features':len(features),'templates':len(template_map),'html_bytes':len(html.encode())},ensure_ascii=False))
