from pathlib import Path
from bs4 import BeautifulSoup
import base64, html, json, re

ROOT = Path('/Users/zlfmac/Documents/TuMaiBiJi/比赛')
ASSETS = ROOT / '图麦笔记-新版素材-20261015'
OUT = ROOT / '图麦笔记-小程序比赛-编辑设计版-V6-20261015.html'
old = BeautifulSoup((ROOT / '图麦笔记-产品说明-V3-20261012.html').read_text(), 'html.parser')
font = re.search(r'@font-face\{.*?\}', old.style.get_text(), re.S).group(0)

def img(name, cls='', style='', alt=''):
    p = ASSETS / name
    mime = 'image/png' if p.suffix == '.png' else 'image/jpeg'
    src = base64.b64encode(p.read_bytes()).decode()
    return f'<img class="{cls}" style="{style}" alt="{html.escape(alt or p.stem)}" src="data:{mime};base64,{src}">'

def para(t, cls=''):
    return f'<p class="{cls}">{t}</p>'

def block(n,t,txt):
    return f'<div class="step"><span class="step-no">{n}</span><div><h3>{t}</h3><p>{txt}</p></div></div>'

def line(t,txt):
    return f'<div class="line"><h3>{t}</h3><p>{txt}</p></div>'

pages=[]
def page(ch,title,dek,body,cls='',note=''):
    n=len(pages)+1
    pages.append(f'''<section class="page {cls}" id="p{n}" data-page="{n}">
    <header><span class="brand">TumarkNote<span class="brand-dot">.</span></span><span>图麦笔记 / 微信小程序作品集</span></header>
    <main><div class="eyebrow">{ch}</div><h1>{title}</h1>{para(dek,'dek') if dek else ''}<div class="body">{body}</div></main>
    {f'<aside class="note">{note}</aside>' if note else ''}
    <footer><span>MAKE WHAT YOU SAVE MATTER.</span><span>{n:02d} <i>/ TOTAL</i></span></footer></section>''')

page('PRODUCT DESIGN / 2026','看到好内容，<br>随手记下来。','把碎片信息，变成自己的知识与表达。',f'''
<div class="cover-art"><div class="cover-word">Keep.<br><em>Make.</em><br>Share.</div>{img('home.png','cover-phone',alt='10月15日开发版墨档首页模拟器截图')}{img('letter.jpg','cover-card',alt='产品渲染的素宣信笺示例卡片')}</div>
<div class="cover-base"><span>图麦笔记<br><b>AI 辅助记录 · 微信里的个人笔记库</b></span><span>作品说明 / V6<br>2026.10.15</span></div>''','cover', '封面界面为开发版模拟器截图；纸卡由产品绘制，内容为虚拟示例。')

page('01 / THE OPPORTUNITY','收藏之后，<br>还差一次真正的使用。','不是缺少信息，而是缺少把信息变成自己的那一步。',f'''
<div class="editorial-quote">“我记得看过，<br>却想不起存在哪里。”</div>
<div class="columns three">{line('学生与阅读者','课堂截图、文章摘录留得很多，复习时仍要重读、摘抄和归类。')}{line('年轻创作者','有观点、有资料，却要再花时间把文字排成值得分享的图片。')}{line('日常记录者','旅行攻略、灵感和生活清单散在相册与聊天里，需要一个轻量入口。')}</div>
<div class="rule-statement">从“保存一个入口”<span>→</span>到“留下一份可用内容”</div>
<p class="small">图麦笔记从已有内容出发，连接采集、整理、回看与表达；不要求用户先建立一套复杂知识体系。</p>
<div class="toc"><span>03—07 页<br><b>看懂产品</b></span><span>08—12 页<br><b>使用与控制</b></span><span>13—21 页<br><b>表达与场景</b></span><span>22—27 页<br><b>技术与边界</b></span></div>''',note='用户画像来自产品设计定位与作者日常观察，不作为访谈结论、用户规模或成效统计。')

page('02 / THE PRODUCT LOOP','不止记下来。<br>还要找得到、用得上。','内容 → 结构 → 卡片 → 再次使用。',f'''
<div class="loop">{block('01','接住内容','公开链接、截图与照片、直接输入的文字。')}{block('02','整理结构','AI 辅助生成标题、摘要、要点与标签，保留原文供核对。')}{block('03','回看与表达','搜索、分类、编辑，再选择模板生成卡片。')}{block('04','分享与转存','带码卡片连接公开笔记，读者主动转存为独立记录。')}</div>
<div class="feature-strip"><div><b>3</b><span>种录入方式</span></div><div><b>10</b><span>套卡片模板</span></div><div><b>5</b><span>档界面心情</span></div></div>
<p class="small">这是流程编排与表达设计的结合，不是要求用户学习提示词的聊天窗口。</p>''',note='本稿聚焦微信小程序；新版外观按本地开发实现展示，不把 iPhone 独立产品或未来构想并入现有能力。')

page('03 / CAPTURE','三种起点，<br>同一份笔记。','用户已经有的内容，就是记录的开始。',f'''
<div class="capture-row">{img('photo-panel.png')}<div><span class="index">01</span><h3>照片</h3><p>从相册选图或拍照，先识别文字，再进入统一提炼流程。</p><p class="small">一批最多 9 张；识字效果受清晰度和版式影响。</p></div></div>
<div class="capture-row">{img('url-panel.png')}<div><span class="index">02</span><h3>链接</h3><p>贴入公众号文章或公开网页地址，减少复制、搬运长文的步骤。</p><p class="small">登录、付费墙与站点限制可能导致采集失败。</p></div></div>
<div class="capture-row">{img('write-panel.png')}<div><span class="index">03</span><h3>文字</h3><p>写下想法，或粘贴已有原文，让摘要进入同一条整理链路。</p><p class="small">这里是文字输入，不是手写笔迹识别。</p></div></div>''',note='三幅均为 2026-10-15 小程序模拟器截图的录入区裁切；来自当日早间开发实现。')

page('04 / INTERACTION','右滑一下，<br>把“准备好”变成动作。','从选入口、贴内容，到明确提交，交互在同一块面板里完成。',f'''
<div class="gesture-visual">{img('url-panel.png')}<div class="gesture-arrow"><span>准备内容</span><span>向右滑动 ─────→</span><span>开始提炼</span></div></div>
<div class="columns three">{line('不误触','空内容时不能起拖；未达到提交条件就松手，滑块回弹。')}{line('不来回跳','照片、链接、文字共用一张面板，入口切换仍留在原页面。')}{line('不猜状态','处理过程有状态反馈；输入报错在输入区附近出现，便于就地修改。')}</div>
<div class="editorial-quote small-quote">少一点搬运，<br>多一点明确的掌控。</div>
<p class="small">设计取舍：滑动比点按更强调提交意图，但也增加操作成本，因此提示语与回弹反馈必须清晰。</p>''',note='录入区为实际模拟器截图局部；下方箭头是流程讲解，不是新增到小程序里的控件。')

page('05 / AI, WITH CONTEXT','把长内容，<br>整理成清楚的四层。','AI 辅助理解，原文仍是核对的依据。',f'''
<div class="source-slip"><span class="eyebrow">INPUT / 编辑示例</span><p>周末去厦门，想慢慢逛沙坡尾和鼓浪屿。出发前确认船票预约，准备一双适合步行的鞋，把交通截图和路线放在一起。</p></div>
<div class="output-note"><span class="eyebrow">STRUCTURED NOTE / 结构示意</span><h2>厦门，两天慢慢走</h2>{line('摘要','围绕海边步行安排周末路线，提前处理交通与预约。')}{line('要点','沙坡尾散步 · 鼓浪屿行程 · 核对船票 · 步行准备')}{line('标签','旅行 / 厦门 / 周末')}</div>
<div class="columns">{line('提炼语言可选择','输出可按设定整理成中文；变化的是标题、摘要、要点与标签，不是改写原文。')}{line('提炼失败，保留已取得的文字','模型不可用时可降级保存原文；采集不到正文或识别不到字，不等于成功。')}</div>''',note='以上文字为说明结构的编辑示例，不是模型实测结果。摘要可能遗漏或失真，公开前应核对原文和出处。')

page('06 / FIRST IMPRESSION','打开时，<br>就知道从哪里开始。','把记录入口、内容数量和轻提示放在一起。',f'''
<div class="phone-spread">{img('home.png','phone')}<div class="spread-copy"><span class="large-en">A place<br>to begin.</span>{line('首屏就是入口','人物入口与加号引出记录面板，笔记与卡片数量让已有积累可见。')}{line('提示是陪伴，不是教程墙','短 Tips 提醒可以记录什么，不在开始之前安排大段学习任务。')}{line('用预置内容解释产品','新账号提供预置笔记，并在首启尝试出卡，让用户先看到成品再开始记录。')}</div></div>''',note='首页：10-15 17:58 模拟器留影，对应 2.2.3 出包前实现。首启出卡依赖处理成功；预置笔记及卡片不可单独删除。')

page('07 / FIND IT AGAIN','从记忆里的片段，<br>找到自己的笔记。','搜索与分类，是把“留住”接到“再用”的那一段。',f'''
<div class="phone-spread">{img('list.png','phone')}<div class="spread-copy">{line('按关键词搜索','搜索标题、摘要与正文相关内容，不必记住最初来自哪个入口。')}{line('按分类回看','用主题整理内容，把旅行、学习或工作资料聚到一起。')}{line('列表与卡片切换','同一批笔记既能按文字浏览，也能回看已经生成的卡片。')}{line('继续修正，而非定稿即结束','编辑自己的标题与内容；原文和结构化结果服务于后续整理。')}</div></div>''',note='10-15 模拟器测试截图，英文界面、中文笔记为当时状态；数字与文章内容不作为产品规模或事实背书。')

page('08 / A MOOD OF YOUR OWN','五种心情，<br>不止一种打开方式。','墨、象牙、天青、樱落、雨雾。同一套交互，不同的视觉气氛。',f'''
<div class="mood-main"><figure>{img('home.png')}<figcaption><b>01 墨</b> / INK</figcaption></figure><figure>{img('ivory.png')}<figcaption><b>02 象牙</b> / IVORY</figcaption></figure></div>
<div class="mood-minis"><figure>{img('celadon-detail.png')}<figcaption>03 天青 / CELADON</figcaption></figure><figure>{img('blush-detail.png')}<figcaption>04 樱落 / BLUSH</figcaption></figure><figure>{img('mist-detail.png')}<figcaption>05 雨雾 / MIST</figcaption></figure></div>
<p class="small">“换心情”循环切换；面板、底栏与导航保持统一。背景图片和亮度可另外调整，不与卡片模板混为一件事。</p>''','moods',note='五档均为 10-15 模拟器截图；后三张仅裁切面板区域。心情偏好保存在本机，不承诺五档选择跨设备完全同步。')

page('09 / PERSONAL SPACE','有自己的形象，<br>也有清楚的秩序。','界面、名片与卡片，各自承担不同的角色。',f'''
<div class="phone-spread">{img('settings.png','phone')}<div class="spread-copy">{line('背景，是打开时的氛围','选择背景与亮度，不改变笔记内容；没有个人图或运营图时可回到无图底色。')}{line('名片，是卡片上的自我介绍','配置形象图、名称与一句话，为分享的内容留下自己的表达。')}{line('设置，只放需要管理的事','模板、分类、私密密码、邮箱与账号管理，按用途组织。')}{line('有选择地随账号保存','名片形象、名称与部分偏好有云端保存链路；本机心情不等于完整云同步。')}</div></div>''',note='设置页为 10-15 模拟器留影。形象图与姓名由用户选择；本稿不使用截图内数值作为运营成果。')

page('10 / PRIVATE BY CHOICE','不想公开的，<br>就留给自己。','“看不见”不只是一层遮罩，而是读取内容之前的判断。',f'''
<div class="privacy-hero"><span class="large-en">Private.<br><em>Not hidden.</em></span>{img('private-panel.png')}</div>
<div class="columns">{line('私密笔记','通过私密分类与六位密码组织访问；服务端限制未解锁的内容读取，不只在前端遮住文字。')}{line('分享与出卡也要守边界','私密内容受分享、卡片登记等服务端限制；转成私密时需要关闭原来的公开入口。')}</div>
<div class="rule-statement">个人记录 <span>≠</span> 默认公开</div>
<p>公开是一项主动选择。隐藏图片上的码，不等于撤回公开分享；用户需要明确操作公开状态。</p>''','privacy',note='密码弹层为 10-15 模拟器截图局部。这里不是端到端加密承诺；身份隔离、权限控制与内容审核是不同的保护层。')

page('11 / CONTINUITY','留下的不只是文字，<br>还有做好的那张卡。','笔记、配图与成品图各有去处，减少对本机缓存的依赖。',f'''
<div class="archive-stack"><div><span>01 / NOTE</span><h2>结构化笔记</h2><p>文字与账号关联，继续搜索、编辑和归类。</p></div><div><span>02 / IMAGE</span><h2>笔记配图</h2><p>选中的图片走云上传，保留在笔记的使用链路中。</p></div><div><span>03 / CARD</span><h2>卡片成品</h2><p>生成后尝试上传留档，本机文件成为缓存而非唯一来源。</p></div></div>
<div class="columns">{line('保存文字，不被存图失败拖住','提炼和存图分开处理；云上传失败不阻断已经能保存的笔记。')}{line('清理要有后续','删除笔记或注销后，关联云对象进入清理链；失败项通过待删队列补处理。')}</div>
<p class="small">一篇笔记保留一张成品卡；换版式需要先处理原卡。已经丢失、又从未上传的旧图片，不能靠这条链路找回。</p>''',note='本页为数据去向示意。只有上传和登记成功的资源才有云端留档，不承诺任意故障下“永不丢失”。')

cards=[('card','玉版宣','Jade Paper'),('quote','摘句','Verse Slip'),('block','叠翠','Layered Paper'),('letter','素宣信笺','Vertical Letter'),('popGrid','波普分格','Pop Panels'),('popDots','网点漫画','Ben-Day Comic'),('acid','荧光渐变','Acid Gradient'),('cover','杂志封面','Magazine Cover'),('lit','纸间文艺','Paper & Ink'),('spec','规格卡','Spec Sheet')]
page('12 / CARD COLLECTION','同一份内容，<br>十种表达的语气。','不是换一个颜色，而是换一种构图、层级与阅读节奏。','<div class="gallery-ten">'+''.join(f'<figure>{img(k+".jpg")}<figcaption><b>{i+1:02d} {zh}</b><span>{en}</span></figcaption></figure>' for i,(k,zh,en) in enumerate(cards))+'</div><div class="rule-statement">先预览 <span>→</span> 再生成 <span>→</span> 保存与分享</div><p class="small">清晰、醒目、安静、个性：选适合内容的表达，不必从空白画布开始。支持受约束的模板配方数据下发，包内模板兜底；新的绘制能力仍需更新客户端。</p>',note='十张均为 10-11 产品 Canvas 绘制的样张；同一条虚拟旅行笔记，使用无码档，不是十款新增功能或真实旅行建议。')

pairs=[
 ('清晰，是表达的底气。','当信息需要被理解，先给它清楚的结构。',0,1,
  '标题先被看见，摘要与编号要点随后展开。适合把课程概念、阅读方法或一篇文章整理成完整知识单元。','一条重点，拥有自己的空间。适合摘录、感悟与短观点；分享时仍应保留出处和必要语境。','复习与回看','读后感与短表达'),
 ('有层次，也有纸的温度。','把现代的信息秩序，放进不同的阅读节奏。',2,3,
  '色块建立主题，纸白内容区承接摘要与要点；头像连接上下两层。适合工作复盘、方法整理与行动提醒。','从右向左竖排，标题、正文与来源各占其位。适合随笔、引文与纸面留存，让一段文字慢下来。','工作总结与方法卡','阅读摘录与书签'),
 ('认真表达，也可以有趣。','给年轻创作者的观点，一种可辨认的视觉语气。',4,5,
  '同一幅形象去色、套色，组织成四格重复；不是四张独立照片。适合创作栏目、活动回顾与个人主题系列。','网点、错位标题与硬阴影带来印刷感。短标题与紧凑摘要相配，适合影评、设计观察与轻知识。','个人栏目与创作记录','文化评论与灵感观察'),
 ('让创作者，站到内容前面。','当人物形象是表达的一部分，画面与观点一起被识别。',6,7,
  '渐变、光晕与头像形成焦点，胶囊式要点把氛围接回内容。适合创作过程、灵感来源与数字文化记录。','人物铺底，文字依靠暗色渐变保持清晰。适合为随笔、访谈与个人栏目做开篇，使用有权使用的肖像。','灵感与创作过程','个人文章与栏目开篇'),
 ('一页感受，一份条理。','文字的情绪，与信息的精确，都可以有自己的位置。',8,9,
  '拱门、衬线与留白，让画面有书页的节奏。适合旅行观察、生活随笔与读后感，也适合打印后继续批注。','编号、细线与等宽元信息建立条目秩序。适合工具记录、出行准备与项目检查点，便于快速定位细节。','生活随笔与手账','清单与研究记录')]
for j,(title,dek,a,b,ta,tb,sa,sb) in enumerate(pairs):
    bodies=[]
    for idx,text,use in [(a,ta,sa),(b,tb,sb)]:
        k,zh,en=cards[idx]
        bodies.append(f'<div class="template-row"><div class="template-art">{img(k+".jpg")}</div><div><span class="eyebrow">{idx+1:02d} / {en.upper()}</span><h2>{zh}</h2><p>{text}</p><div class="usecase">适合 · {use}</div></div></div>')
    page(f'{13+j:02d} / ONE NOTE, TEN VOICES',title,dek,''.join(bodies),'template-page', '产品实绘样张 / 虚拟示例内容 / 无码档。图片沿用附件已确认的人像素材；模板名称按产品字典。')

page('18 / SHARE, THEN KEEP','一张图，<br>接回一份能继续用的笔记。','先读到内容，再决定是否把它留在自己的库里。',f'''
<div class="share-layout">{img('card.jpg','share-card')}<div class="share-flow">{block('01','生成分享卡','选择模板，预览并生成；可选择是否在图上展示小程序码。')}{block('02','进入公开内容','带码版本可连接公开摘要入口，而不是作者的全部私人笔记。')}{block('03','主动转存','读者选择保存为独立副本，让分享成为下一次记录的起点。')}</div></div>
<div class="columns">{line('公开内容是快照','分享时保存内容快照；后续编辑不代表已发图片和已转存副本会同步更新。')}{line('撤回有明确边界','关闭公开入口，不会远程收回别人已经保存、转发或打印的图片。')}</div>
<p class="small">保存图片后可手动用于朋友圈、公众号或其他内容平台；不是接入各平台后台自动发布。</p>''',note='左侧为无码卡片样张，右侧是产品流程示意；本页不伪造扫码成功、传播量或转化率。')

page('19 / EVERYDAY EXPRESSION','从自己的理解，<br>到朋友能读懂的表达。','记录不是为了堆积，而是为了在下一次需要时派上用场。',f'''
<div class="scenario-pair"><figure>{img('新版配图-朋友圈-20260925.jpg')}<figcaption>朋友圈 / 阅读之后的一句话</figcaption></figure><figure>{img('新版样张-小红书手机场景-20260925.jpg')}<figcaption>小红书 / 把资料整理成攻略</figcaption></figure></div>
<div class="columns">{line('一句触动，接两句自己的理解','把文章中值得留下的观点做成卡片，配上阅读背景与个人判断，让分享有自己的语气。')}{line('路线、条件和提醒集中起来','把游记与交通截图整理成行程卡；出发前核对预约与时效信息，旅行后再补真实经验。')}</div>
<div class="small-feature"><b>公众号也可以这样用</b><p>长文负责展开，卡片负责回顾。导出图片后手动插入文章，成为段落小结或文末重点。</p></div>''',note='两幅沿用附件 AI 辅助生成的场景概念图，不是朋友圈或小红书真实界面，也不代表平台合作。')

page('20 / BACK TO PAPER','数字负责整理。<br>纸面，留下温度。','让一条记录，进入更个人化的生活。',f'''
<div class="journal-hero">{img('新版样张-线下手账场景-20260925.jpg')}</div>
<div class="columns">{line('留在手账里','旅行归来，挑一句观察与一张卡片，打印、贴入、写下日期，再补上当时没有记完的感受。')}{line('留在日常可见处','读书摘录贴在书桌边，准备清单放进随身本。数字整理不替代手写，而是为继续记录留出空间。')}</div>
<div class="editorial-quote small-quote">不是把生活做成模板，<br>是给生活留一张纸。</div>''',note='图片为附件中的 AI 辅助场景示意；打印由用户自行完成。真实带码卡片需另测尺寸、纸张、清晰度与识读效果。')

page('21 / THE ARCHITECTURE','把成熟能力接起来，<br>把体验做完整。','微信平台 + 开源处理管线 + 自建业务服务。',f'''
<div class="architecture">
<div class="arch-row primary"><span>CLIENT</span><h3>微信原生小程序</h3><p>录入 · 笔记管理 · 预览 · Canvas 卡片 · 分享</p></div><div class="connector">↓ HTTPS · 身份与请求</div>
<div class="arch-row"><span>SERVICE</span><h3>FastAPI + Redis / RQ</h3><p>业务权限 · 异步任务 · 进度与结果反馈</p></div><div class="connector">↓ 内容处理</div>
<div class="columns arch-branches"><div><h3>链接正文</h3><p>trafilatura / BeautifulSoup</p></div><div><h3>图片文字</h3><p>RapidOCR / ONNX Runtime</p></div></div><div class="connector">↓ 已取得的文字</div>
<div class="arch-row accent"><span>INTELLIGENCE</span><h3>微信云函数 → 云开发 AI → 混元</h3><p>标题 · 摘要 · 要点 · 标签</p></div><div class="connector">↓ 保留结构与来源</div>
<div class="arch-row"><span>OUTPUT</span><h3>笔记库 + 云存储 + 端侧卡片</h3><p>查询、编辑、配图留档与公开分享</p></div></div>
<p class="small">直接输入的文字无需抓取与 OCR；已取得文字在模型失败时可走原文保存降级。卡片由端侧绘制，不由生图模型生成。</p>''','tech',note='技术路径按当前源码整理；不以接口数量、数据库种类或未经复测的性能数字包装创新。')

page('22 / BUILT WITH WECHAT','平台让想法可达，<br>开源让实现扎实。','作品的价值，在于把能力变成普通用户能用的流程。',f'''
<div class="platform-statement"><span>WECHAT × OPEN SOURCE</span><h2>把一次模型调用，<br>接成一次完整的记录。</h2></div>
<div class="columns">{line('微信原生能力','登录、媒体选择、剪贴板、画布、相册保存与小程序码，连接用户熟悉的动作。')}{line('云开发 AI','云函数中转文本模型，用固定输出结构服务记录；开发期成长计划资源降低了验证门槛。')}{line('开源工程基础','FastAPI / Pydantic 处理业务请求，Redis / RQ 编排耗时任务，正文抽取与 OCR 复用成熟组件。')}{line('数据与持续维护','SQLAlchemy / Alembic 支持数据与迁移；云对象存储承接配图、卡片和形象素材。')}</div>
<div class="rule-statement">基础能力有来源，<span></span>产品判断有责任。</div>
<p>原创贡献集中在输入统一、交互组织、失败路径、卡片排版和分享回流，而不是通用模型训练。</p>''',note='赠送额度有资格、期限与适用范围，不等于永久免费。服务器、存储和运维仍有成本；上游许可与模型授权各自适用。')

page('23 / OPERATIONS','好体验，也需要<br>看得见的运营底座。','数据与配置分开，避免把日常维护做成一页长表。',f'''
<div class="ops-shot">{img('ops-top.png')}</div>
<div class="columns">{line('数据：先看发生了什么','总览、逐日、来源分布、模板热度、邀请对账与分享，帮助判断哪里值得继续优化。')}{line('配置：再调整用户会看到什么','运营背景图与首屏 Tips 进入独立配置视图，内容维护与客户端功能开发分工。')}</div>
<p class="small">本页展示的是运营界面，不开放浏览用户笔记正文和图片。统计读自业务记录，不等同于行为埋点或成熟商业增长指标。</p>''',note='10-15 18:04 部署后网页截图的上部裁切；数字为当时系统记录，不作为有效活跃用户或商业成效。图麦克入口未接通，非已完成统一登录。')

page('24 / DESIGN THAT EXPLAINS','文艺感来自节奏，<br>清晰感来自秩序。','把视觉表达留给卡片，把阅读与控制留给用户。',f'''
<div class="design-principles">{block('01','让主次有分寸','大图建立情绪，标题给出结论，正文只解释这一页最重要的事；不让装饰替内容发言。')}{block('02','把熟悉的模式做扎实','沿用成熟的文字标签、就地展开、预览和状态反馈；减少跨页跳转，也避免每一步都发明新手势。')}{block('03','玻璃只服务于层次','外观与背景建立氛围；文字密集的详情阅读保持实心，优先保证可读性。')}{block('04','边界说得清楚','隐藏二维码不等于撤回分享；云留档不等于恢复所有旧图；模型失败不等于内容采集失败。')}</div>
<div class="review-band"><b>体验建议</b><p>选一条有权使用的内容 → 提炼并核对 → 分类与搜索 → 预览成卡 → 分享与转存。再试空输入或无正文链接，看看反馈是否清楚。</p></div>''',note='本轮为文档重编及版面检查，不代表重新运行完整产品测试、内容安全审计或真机验收。')

page('25 / WHAT COMES NEXT','未来可以有更多表达，<br>但不把设想写成现状。','商业价值应建立在用户愿意使用的内容与设计之上。',f'''
<div class="concepts">{img('联名概念-可口可乐-简约版-20260925.jpg')}{img('联名概念-Labubu-简约版-20260925.jpg')}{img('联名概念-爱马仕-简约版-20260925.jpg')}</div>
<p class="concept-label">非官方联名概念 / 未获品牌授权 / 非现有模板</p>
<div class="columns">{line('品牌与创作者合作','探索授权主题、限定模板和内容活动，让品牌成为可选的表达语言，而非强加广告。')}{line('卡片溯源与跨端探索','附件中的隐形水印、相册解码、付费内容及跨端分发仍属研究设想，不是现网能力。')}</div>
<p class="small">当前以笔记与卡片体验为基础。未来合作需验证用户价值、内容授权与平台规则；付费内容、团队协作和跨平台自动分发均不作为已实现能力。</p>''',note='三幅沿用原附件的 AI 辅助联名概念；商标与角色归各权利人。正式合作、研发及上线均需另行验证与授权。')

page('26 / KEEP SOMETHING WORTH KEEPING','让看过的好内容，<br>成为你自己的积累。','图麦笔记 / TumarkNote',f'''
<div class="closing"><div class="closing-letter"><span class="eyebrow">A NOTE TO THE READER</span><h2>从一次随手记录，<br>到下一次真正用上。</h2><p>作品由个人开发者完成产品整合，借助微信平台、开源社区与 Qoder 等 AI 辅助工具实现、整理与迭代。</p><p>感谢让个人创作得以发生的每一份基础。</p><div class="signature">赵龙飞<br><span>产品设计与开发</span></div></div><div class="contact"><div class="qr-paper">{img('图麦笔记小程序码.png')}</div><p>微信扫码体验<br><strong>图麦笔记</strong></p><span>agentsbin.cn<br>zhaolongfei@gmail.com</span></div></div>
<div class="evidence"><h3>阅读与素材说明</h3><p>内容核对截至 2026-10-15。本地工程为 2.2.3；资料记录线上 2.1.10、送审 2.2.0，本轮未重新登录后台确认发布状态。开发版截图不等于扫码后必见同版。</p><p>界面图：10-15 小程序模拟器留影；运营图：当日部署记录截图。十套卡片：10-11 产品实绘、虚拟内容；场景与联名：附件中的 AI 辅助概念图。未把概念图称为实拍。</p><p>核对来源：当前产品代码、产品需求近期记录、用户所给 V3 PDF/HTML 与双语 PPT V2。源图路径与页码对照随 HTML 源稿保留。</p></div>''','closing-page',note='本稿未改动小程序功能、未发布或提交比赛。已下载图片和第三方平台上的内容不在远程撤回范围内。')

css = r'''
:root{--paper:#f2efe8;--ink:#252923;--muted:#676c62;--clay:#bc5836;--line:#cbc9bf;--sage:#dfe4d8;--deep:#29392f}
@page{size:A4;margin:0}*{box-sizing:border-box}html{scroll-behavior:smooth}body{margin:0;background:#d9d8d0;color:var(--ink);font:10.5pt/1.75 'PingFang SC','Helvetica Neue',sans-serif;-webkit-print-color-adjust:exact;print-color-adjust:exact}img{display:block;max-width:100%;object-fit:contain}p{margin:0 0 12pt;overflow-wrap:break-word}h1,h2,h3{margin:0}h1,h2{font-family:'Songti SC','STSong',serif;font-weight:600}h1{font-size:33pt;line-height:1.28;letter-spacing:-.7pt;margin:0 0 14pt;max-width:100%}h2{font-size:23pt;line-height:1.4;margin-bottom:12pt}h3{font-size:12.5pt;line-height:1.5;margin-bottom:7pt}em{font-weight:400}figure{margin:0}figcaption{font-size:8.5pt;line-height:1.5;margin-top:8pt}section.page{width:210mm;height:297mm;padding:30pt 42pt 65pt;margin:18px auto;position:relative;background:var(--paper);break-after:page;overflow:hidden}section.page:last-of-type{break-after:auto}header{height:35pt;display:flex;align-items:flex-start;justify-content:space-between;border-bottom:.5pt solid var(--line);font-size:7pt;letter-spacing:.4pt;color:var(--muted)}.brand{font:19pt/1 Playfair,Georgia,serif;color:var(--ink);letter-spacing:-.8pt}.brand-dot{color:var(--clay)}main>.eyebrow{margin:23pt 0 12pt}.eyebrow{font-size:7.5pt;letter-spacing:1.7pt;color:var(--clay);font-weight:600}.dek{font-size:10.5pt;line-height:1.7;color:var(--muted);margin:0 0 23pt}.body{display:flow-root}.note{position:absolute;left:42pt;right:42pt;bottom:47pt;font-size:7pt;line-height:1.55;color:var(--muted)}footer{position:absolute;left:42pt;right:42pt;bottom:22pt;border-top:.5pt solid var(--line);padding-top:8pt;display:flex;justify-content:space-between;font-size:7pt;letter-spacing:.8pt;color:var(--muted)}footer i{font-style:normal;color:#888b80;font-size:6.5pt}.columns{display:grid;grid-template-columns:1fr 1fr;gap:15pt 24pt}.columns.three{grid-template-columns:1fr 1fr 1fr;gap:19pt}.line{border-top:.6pt solid var(--line);padding-top:13pt}.line p{font-size:10pt;line-height:1.8;margin-bottom:12pt;color:#545c51}.small{font-size:9pt;line-height:1.8;color:var(--muted)}.editorial-quote{font:31pt/1.55 'Songti SC',serif;padding:22pt 0 32pt;color:var(--clay)}.small-quote{font-size:24pt;padding:23pt 0 16pt}.rule-statement{display:flex;align-items:center;justify-content:space-between;font:17pt/1.7 'Songti SC',serif;border-top:1pt solid var(--ink);border-bottom:.5pt solid var(--line);padding:16pt 0;margin:20pt 0}.rule-statement span{color:var(--clay);padding:0 5pt}.toc{display:flex;justify-content:space-between;border-top:.5pt solid var(--line);padding-top:18pt;margin-top:24pt;font-size:8pt;line-height:2.2;color:var(--muted)}.toc b{color:var(--ink);font-size:10pt}.step{display:grid;grid-template-columns:50pt 1fr;gap:18pt;padding:15pt 0;border-top:.5pt solid var(--line)}.step-no{font:31pt/1.2 Playfair,Georgia,serif;color:var(--clay)}.step p{margin:0;color:#545c51;font-size:10pt}.loop .step{padding:17pt 0}.feature-strip{display:flex;justify-content:space-between;margin:25pt 0 18pt;background:var(--sage);padding:17pt 28pt}.feature-strip div{display:flex;gap:10pt;align-items:center}.feature-strip b{font:37pt/1 Playfair,Georgia,serif}.feature-strip span{font-size:8.5pt;width:55pt}.capture-row{display:grid;grid-template-columns:280pt 1fr;gap:24pt;padding:13pt 0 17pt;border-top:.5pt solid var(--line);align-items:center}.capture-row img{width:280pt;height:auto}.capture-row p{font-size:9.5pt;line-height:1.7;margin-bottom:7pt}.capture-row .small{font-size:7.5pt}.index{font:20pt/1 Playfair,serif;color:var(--clay)}.capture-row h3{display:inline-block;margin-left:8pt}.gesture-visual{background:#dce1d7;padding:20pt;margin:13pt 0 24pt}.gesture-visual img{width:100%}.gesture-arrow{display:flex;justify-content:space-between;font-size:8pt;margin-top:12pt;color:#3b4b3f}.source-slip{padding:20pt;background:#dfe4d8;margin-bottom:15pt}.source-slip p{margin:9pt 0 0}.output-note{padding:20pt 24pt;background:#fffefa;border-left:2pt solid var(--clay);margin-bottom:23pt}.output-note h2{margin:8pt 0 16pt}.output-note .line{display:grid;grid-template-columns:48pt 1fr;padding:9pt 0;gap:12pt}.output-note .line h3,.output-note .line p{margin:0}.phone-spread{display:grid;grid-template-columns:227pt 1fr;gap:28pt;align-items:center}.phone{width:227pt;height:auto;border-radius:17pt;box-shadow:0 8pt 25pt #25292318}.spread-copy .line{padding-top:13pt;margin-bottom:14pt}.spread-copy .line p{font-size:9.3pt;line-height:1.8}.large-en{font:32pt/1.15 Playfair,Georgia,serif;display:block;margin-bottom:27pt}.mood-main{display:flex;justify-content:center;gap:34pt}.mood-main img{height:332pt;border-radius:12pt}.mood-main figcaption{text-align:center}.mood-minis{display:grid;grid-template-columns:repeat(3,1fr);gap:15pt;margin:21pt 0 16pt}.mood-minis img{width:100%;border-radius:7pt}.mood-minis figcaption{font-size:7.5pt}.moods .dek{margin-bottom:18pt}.privacy-hero{display:grid;grid-template-columns:155pt 1fr;align-items:center;gap:20pt;background:var(--sage);padding:28pt 18pt;margin:18pt 0 30pt}.privacy-hero .large-en{font-size:28pt;margin:0}.privacy-hero img{width:100%}.archive-stack{padding:10pt 0 28pt}.archive-stack>div{padding:19pt 24pt;background:#e0e5da;border:1pt solid var(--paper);margin:0 0 -1pt;display:grid;grid-template-columns:110pt 1fr;gap:0 12pt}.archive-stack>div:nth-child(2){margin-left:22pt;background:#e8e5db}.archive-stack>div:nth-child(3){margin-left:44pt;background:#f9f7f1}.archive-stack span{font-size:8pt;letter-spacing:1pt;padding-top:4pt;color:var(--muted)}.archive-stack h2{font-size:21pt;margin:0 0 6pt}.archive-stack p{grid-column:2;font-size:9pt;margin:0}.gallery-ten{display:grid;grid-template-columns:repeat(5,1fr);gap:25pt 13pt;padding:15pt 0 23pt}.gallery-ten img{height:171pt;width:100%;object-position:center bottom}.gallery-ten figcaption{font-size:7.5pt}.gallery-ten figcaption span{display:block;color:var(--muted);font-size:6.5pt}.template-row{display:grid;grid-template-columns:208pt 1fr;gap:26pt;align-items:center;min-height:250pt;border-top:.5pt solid var(--line);padding:16pt 0}.template-art{height:236pt;display:flex;justify-content:center;align-items:center}.template-art img{max-height:236pt;max-width:205pt;width:auto;box-shadow:0 4pt 15pt #2529230c}.template-row .eyebrow{font-size:7pt;letter-spacing:1pt}.template-row h2{font-size:25pt;margin:9pt 0 14pt}.template-row p{font-size:10pt;line-height:1.85}.usecase{font-size:8pt;color:var(--clay);border-top:.5pt solid var(--line);padding-top:12pt;margin-top:18pt}.template-page h1{font-size:29pt;white-space:nowrap}.template-page .dek{margin-bottom:18pt}.share-layout{display:grid;grid-template-columns:211pt 1fr;gap:28pt;align-items:center;margin-bottom:28pt}.share-card{width:211pt}.share-flow .step{grid-template-columns:27pt 1fr;gap:10pt;padding:14pt 0}.share-flow .step-no{font-size:21pt}.share-flow .step p{font-size:9pt}.scenario-pair{display:grid;grid-template-columns:1fr 1fr;gap:30pt;margin-bottom:24pt}.scenario-pair img{height:290pt;width:100%}.scenario-pair figcaption{text-align:center;font-size:8pt}.small-feature{border-top:.5pt solid var(--line);padding:15pt 0;margin-top:8pt}.small-feature b{font-size:11pt}.small-feature p{font-size:10pt;margin:6pt 0 0}.journal-hero{margin:10pt -42pt 25pt}.journal-hero img{width:100%;height:283pt;object-fit:cover}.architecture{padding:3pt 0 18pt}.arch-row{border:.5pt solid var(--line);padding:14pt 20pt;background:#faf8f3;display:grid;grid-template-columns:80pt 1fr;gap:3pt 12pt}.arch-row span{font-size:7pt;letter-spacing:1pt;padding-top:5pt;color:var(--muted)}.arch-row h3{font-size:13pt;margin:0}.arch-row p{grid-column:2;font-size:8.5pt;line-height:1.5;margin:0}.arch-row.primary{background:var(--deep);color:var(--paper);border:0}.arch-row.primary span{color:#c8d0c3}.arch-row.accent{background:#dfe5d9}.connector{text-align:center;font-size:7.5pt;color:var(--muted);height:24pt;line-height:24pt}.arch-branches{gap:12pt}.arch-branches>div{background:#e8e5dc;padding:14pt 19pt}.arch-branches h3{margin:0 0 5pt}.arch-branches p{font-size:8pt;margin:0}.platform-statement{padding:29pt;background:var(--deep);color:var(--paper);margin:14pt 0 28pt}.platform-statement span{font-size:8pt;letter-spacing:2pt;color:#c6cebd}.platform-statement h2{font-size:29pt;line-height:1.5;margin:14pt 0 0}.ops-shot{margin:12pt 0 23pt;border:.5pt solid var(--line);padding:7pt;background:#fff}.ops-shot img{width:100%;height:344pt;object-fit:cover;object-position:top}.design-principles .step{padding:18pt 0}.review-band{margin-top:23pt;padding:22pt;background:var(--sage)}.review-band b{font-size:11pt}.review-band p{margin:9pt 0 0;font-size:10pt}.concepts{display:flex;gap:14pt;padding:25pt 0 12pt;align-items:flex-start}.concepts img{width:calc((100% - 28pt)/3);height:247pt;object-position:top}.concept-label{font-size:8pt;color:var(--clay);padding-bottom:23pt}.cover{background:#e9e7db!important}.cover main>.eyebrow{margin-top:29pt}.cover h1{font-size:39pt;line-height:1.2}.cover .dek{font-size:12pt;margin-bottom:0}.cover-art{height:410pt;position:relative;margin-top:12pt}.cover-word{position:absolute;left:0;top:45pt;font:58pt/1.14 Playfair,Georgia,serif;color:#6b775f;letter-spacing:-2pt}.cover-word em{color:var(--clay)}.cover-phone{position:absolute;right:15pt;top:0;width:177pt;border-radius:16pt;transform:rotate(5deg);box-shadow:0 16pt 30pt #28332635}.cover-card{position:absolute;right:155pt;bottom:17pt;height:189pt;width:auto;transform:rotate(-9deg);box-shadow:0 8pt 20pt #25292320}.cover-base{display:flex;justify-content:space-between;align-items:flex-end;border-top:.6pt solid #afb4a4;padding-top:16pt;font-size:9pt;line-height:1.7}.cover-base b{font-weight:400;color:var(--muted);font-size:8pt}.closing{display:grid;grid-template-columns:1fr 137pt;gap:0;margin:20pt 0 25pt;box-shadow:0 8pt 25pt #25292312}.closing-letter{background:#fbf9f3;padding:25pt 24pt}.closing-letter h2{font-size:24pt;margin:16pt 0}.closing-letter p{font-size:9.5pt}.signature{font-family:'Songti SC',serif;font-size:15pt;margin-top:25pt}.signature span{font:8pt 'PingFang SC',sans-serif;color:var(--muted)}.contact{background:#dfe5d8;padding:24pt 17pt;display:flex;flex-direction:column;justify-content:center}.contact p{font-size:9pt;margin:15pt 0 12pt}.contact>span{font-size:7pt;line-height:2}.qr-paper{background:white;padding:9pt}.qr-paper img{width:100%;height:auto}.evidence h3{font-size:10pt}.evidence p{font-size:8pt;line-height:1.75;margin-bottom:8pt}.toolbar{position:fixed;right:20px;bottom:20px;z-index:100;display:flex;gap:8px;background:#26372eee;color:#fff;padding:10px 14px;border-radius:8px;box-shadow:0 6px 20px #0002;font:13px system-ui}.toolbar button{border:1px solid #ffffff55;background:transparent;color:inherit;border-radius:4px;padding:6px 10px;cursor:pointer}.toolbar span{align-self:center}.toolbar button:focus-visible{outline:2px solid #efd09b}#layout-report{display:none}@media print{body{background:var(--paper)}section.page{margin:0} .toolbar{display:none}}
'''
css += '''
.capture-row{grid-template-columns:260pt 1fr;padding:10pt 0 13pt}
.capture-row img{width:260pt}
#p5 .gesture-visual{width:430pt;margin:5pt auto 18pt;padding:16pt}
#p5 .small-quote{font-size:20pt;padding:9pt 0 10pt}
.mood-main img{height:300pt}
.mood-minis{margin-top:16pt}
.gallery-ten{padding:8pt 0 16pt}
.gallery-ten img{height:138pt}
#p13 .rule-statement{margin:12pt 0}
#p23 .platform-statement{padding:24pt}
#p23 .rule-statement{margin:14pt 0}
'''
script='''
<script>
const pages=[...document.querySelectorAll('.page')];
let current=0;
function go(d){current=Math.max(0,Math.min(pages.length-1,current+d));pages[current].scrollIntoView({behavior:'smooth'});document.getElementById('position').textContent=(current+1)+' / '+pages.length;}
document.getElementById('prev').onclick=()=>go(-1);document.getElementById('next').onclick=()=>go(1);document.getElementById('print').onclick=()=>window.print();
const observer=new IntersectionObserver(entries=>{for(const e of entries){if(e.isIntersecting){current=pages.indexOf(e.target);document.getElementById('position').textContent=(current+1)+' / '+pages.length;}}},{threshold:.55});pages.forEach(p=>observer.observe(p));
function measure(){const errors=[];for(const p of pages){const a=p.querySelector('.body').getBoundingClientRect(),note=p.querySelector('.note'),lim=(note||p.querySelector('footer')).getBoundingClientRect().top;if(a.bottom>lim-10) errors.push({page:p.dataset.page,type:'body-note',bottom:a.bottom-p.getBoundingClientRect().top,limit:lim-p.getBoundingClientRect().top});for(const el of p.querySelectorAll('h1,h2,h3,p,figure,.template-row,.columns,.step')){if(el.scrollWidth>el.clientWidth+2) errors.push({page:p.dataset.page,type:'horizontal',text:el.textContent.slice(0,60)});}}window.layoutReport={pages:pages.length,errors,images:[...document.images].filter(i=>!i.complete||!i.naturalWidth).length};document.getElementById('layout-report').textContent=JSON.stringify(window.layoutReport);}
window.addEventListener('load',measure);
</script>
'''
content='<!doctype html><html lang="zh-CN"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>图麦笔记 · 微信小程序比赛作品集 · V6</title><style>'+font+css+'</style></head><body>'+''.join(pages).replace('/ TOTAL',f'/ {len(pages):02d}')+'<nav class="toolbar" aria-label="文档翻页"><button id="prev" aria-label="上一页">←</button><span id="position">1 / '+str(len(pages))+'</span><button id="next" aria-label="下一页">→</button><button id="print">打印 / PDF</button></nav><pre id="layout-report"></pre>'+script+'</body></html>'
OUT.write_text(content)
print(json.dumps({'html':str(OUT),'pages':len(pages),'bytes':OUT.stat().st_size},ensure_ascii=False))
