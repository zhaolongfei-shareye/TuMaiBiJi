from pathlib import Path
from bs4 import BeautifulSoup
from PIL import Image, ImageDraw, ImageFont
import base64, json, re, shutil, html

ROOT=Path('/Users/zlfmac/Documents/TuMaiBiJi/比赛')
A=ROOT/'图麦笔记-V7素材-20261015'
PREV=ROOT/'图麦笔记-新版素材-20261015'
OUT=ROOT/'图麦笔记-小程序比赛-文艺故事版-V7-20261015.html'
soup=BeautifulSoup((ROOT/'图麦笔记-小程序比赛-编辑设计版-V6-20261015.html').read_text(),'html.parser')

story_source=Path('/Users/zlfmac/Documents/AgentsNote/vibe_images/tumarknote-literary-comic-cafe-story_1792062267927_de063751.png')
shutil.copy2(story_source,A/'探店漫画-生成原图.png')
story=Image.open(story_source).convert('RGB')
from PIL import ImageOps
panel5=ImageOps.fit(Image.open(A/'第五格-两手修正版.png').convert('RGB'),(489,445),method=Image.Resampling.LANCZOS)
story.paste(panel5,(12,1008))
draw=ImageDraw.Draw(story)
font=ImageFont.truetype('/System/Library/Fonts/Supplemental/Songti.ttc',24)
subfont=ImageFont.truetype('/System/Library/Fonts/Supplemental/Songti.ttc',17)
labels=[('01 走进街角小店','周末散步，遇见一间喜欢的小店。'),('02 发现一件好物','一只青色陶杯，让她停下脚步。'),('03 拍下细节与说明','把杯子和产品说明一起拍下来。'),('04 用图麦笔记提炼','让说明里的文字，成为清楚的要点。'),('05 留在手机里','保存笔记，下次想起时还能找到。'),('06 生成卡片，发到朋友圈','把喜欢的理由，也分享给朋友。')]
for i,(title,sub) in enumerate(labels):
 x=[12,523][i%2];y=[449,927,1457][i//2]
 draw.text((x+17,y+3),title,font=font,fill='#394436')
 draw.text((x+17,y+35),sub,font=subfont,fill='#656b5a')
story.save(A/'探店故事-六格漫画.png')

log=Path('/Users/zlfmac/.qoder/projects/-Users-zlfmac-Documents-AgentsNote/57434e3c-813c-4bd5-81af-e5a41264d5e9.jsonl')
evidence=[]
for i,line in enumerate(log.open(),1):
 if i in [14147,14191]:
  o=json.loads(line)
  texts=[v['content'] for v in o['message']['content'] if v.get('type')=='tool_result']
  evidence.append({'source':str(log),'line':i,'timestamp':o['timestamp'],'result':'\n'.join(texts)})
(A/'16语实测-历史工具结果.json').write_text(json.dumps(evidence,ensure_ascii=False,indent=2))


def image(path,cls='',alt=''):
 p=Path(path);mime='image/png' if p.suffix=='.png' else 'image/jpeg'
 return f'<img class="{cls}" alt="{html.escape(alt or p.stem)}" src="data:{mime};base64,{base64.b64encode(p.read_bytes()).decode()}">'

def section(kicker,title,dek,body,cls,note):
 return BeautifulSoup(f'''<section class="page {cls}"><header><span class="brand">TumarkNote<span class="brand-dot">.</span></span><span>图麦笔记 / 微信小程序作品集</span></header><main><div class="eyebrow">{kicker}</div><h1>{title}</h1><p class="dek">{dek}</p><div class="body">{body}</div></main><aside class="note">{note}</aside><footer><span>MAKE WHAT YOU SAVE MATTER.</span><span class="page-number"></span></footer></section>''','html.parser').section

oldpages=soup.select('section.page')
for num,cls in [(5,'interaction-existing'),(13,'collection-existing'),(23,'platform-existing')]:
 oldpages[num-1]['class'].append(cls)
 css=soup.style.string.replace(f'#p{num} ',f'.{cls} ')
 soup.style.string=css

storypage=section('A LITTLE STORY','把一次心动，记成一张卡。','周末，她走进街角小店。一个小发现，从此有了可以重读的模样。',image(A/'探店故事-六格漫画.png','story-art','女漫画人物探店、发现陶杯、拍照、提炼、保存笔记、生成卡片并分享的六格故事'),'story-page','AI 生成的流程概念漫画，延续界面女漫画人物的贝雷帽、长发与米白针织风格；手机画面为示意。提炼来自照片中的说明文字，不是商品识别或自动估价；朋友圈由用户主动发布。')
oldpages[2].replace_with(storypage)

languages=['英语','日语','韩语','法语','德语','西班牙语','俄语','阿拉伯语','葡萄牙语','意大利语','泰语','越南语','印地语','印尼语','土耳其语','荷兰语']
langbody='''<div class="language-hero"><div class="language-number">16</div><div><span>LANGUAGES. ONE CLEAR NOTE.</span><h2>外文原文，<br>整理成中文笔记。</h2><p>16 种语言的粘贴文本，已有成功实测记录。<br>标题、摘要、要点与标签用中文呈现，原文保留。</p></div></div>'''
langbody+='<div class="language-list">'+''.join(f'<span><i>{i+1:02d}</i>{t}</span>' for i,t in enumerate(languages))+'</div>'
langbody+='''<div class="language-scenes"><div><span class="eyebrow">READ & LEARN</span><h3>读英文，也留住自己的理解。</h3><p>把英语阅读材料的文字贴进来，先用中文梳理主旨，再回看原文与表达。适合读后整理，不替代逐句精读与语言教学。</p></div><div><span class="eyebrow">TRAVEL & REMEMBER</span><h3>走得远，也看得懂说明。</h3><p>把行程、展览或店铺介绍中的外文复制过来，整理成随身可查的中文要点。关键日期、地址与条件仍需对照原文核实。</p></div></div>
<div class="language-path">贴入外文 → 展开文字面板 → 开启「原文翻译」 → 右滑提炼</div>
<p class="small">仅文字录入的这次提交生效，默认关闭、保存后复位；不是逐字全文翻译，也不承诺 16 语截图识别、国外网站抓取或离线可用。</p>'''
langpage=section('READ BEYOND LANGUAGE','读得懂世界，<br>也记得住重点。','把语言的距离，变成一份可以回看的中文笔记。',langbody,'language-page','历史实测：2026-10-14，16/16 文本样本成功且非降级，按当次中文输出与事实≥3/4判据通过；后续英、阿、泰3语按4/4复测通过。不是翻译准确率100%；文本超过12,000字符会截断。')
storypage.insert_after(langpage)

moods=[
 ('home.png','墨','INK','把喧闹，留在屏幕外。','一页深色，给思绪一个安静的落点。','深色面板收住视线，背景仍留在柔和的层次里。把重要的文字放到眼前，让记录不必大声。','专注的一刻','读完一段长文，收拢今天的观察。','#27302d','#e8e9e1'),
 ('ivory.png','象牙','IVORY','像翻开，温柔的一页纸。','暖而不浓，把日常慢慢接住。','像书页、信笺和手账的底色，保留轻盈的阅读空间。内容不急着展示，先安稳地留给自己。','温柔的日常','摘一句喜欢的话，留一段自己的感受。','#796955','#eee9de'),
 ('celadon.png','天青','CELADON','给思绪，留一点新鲜空气。','一抹清润，让记录像走进树影。','带着绿意的轻盈色调，把视线从密集的信息里松开。同样的笔记结构，换一种清新的心情。','出发与发现','记录街角小店、步行路线和新的灵感。','#47715c','#e7eee5'),
 ('blush.png','樱落','BLUSH','把微小的心动，轻轻收好。','柔和的颜色，也容得下认真的想法。','让感受有位置，不把情绪涂满整页。写下小小的喜欢，或把一个还不成熟的念头先保存下来。','心动的片刻','一场展览、一句歌词、今天想留住的瞬间。','#806780','#eeE8ed'),
 ('mist.png','雨雾','MIST','让灵感，在安静里慢慢浮现。','像雨后远处的天色，留一点呼吸。','清淡的蓝调让内容拥有更从容的阅读节奏。把纷杂整理成几条要点，再把注意力还给生活。','整理与回望','将旅行与阅读的碎片，汇成一份自己的记录。','#57758b','#e6ebef')]
anchor=oldpages[8]
for i,(file,zh,en,title,dek,poem,scene,example,ink,paper) in enumerate(moods):
 body=f'''<div class="mood-full-layout">{image(PREV/file,'mood-full-screen',zh+'档完整首页模拟器截图')}<div class="mood-essay"><span class="mood-serial">0{i+1}<i>/05</i></span><h2>{zh}<em>{en}</em></h2><p>{poem}</p><div class="mood-use"><h3>{scene}</h3><p>{example}</p></div><div class="mood-family">{''.join('<b class="'+('chosen' if n==i else '')+'">'+label+'</b>' for n,label in enumerate(['墨','象牙','天青','樱落','雨雾']))}</div><p class="mood-foot">同一套交互，五种视觉语气。<br>在首页点「换心情」循环切换，<br>面板、导航和底栏同步呼应。</p></div></div>'''
 p=section('FIVE MOODS / '+en,title,dek,body,'mood-full-page','五档完整界面均来自 2026-10-15 模拟器截图，按原比例展示，未重绘或重新着色。文艺描述是使用氛围，不代表新增功能；心情偏好保存在本机。')
 p['style']=f'--mood-ink:{ink};--mood-paper:{paper}'
 anchor.insert_before(p)
anchor.decompose()

pages=soup.select('section.page')
for i,p in enumerate(pages,1):
 p['id']=f'p{i}';p['data-page']=str(i)
 p.footer.find_all('span',recursive=False)[-1].clear()
 p.footer.find_all('span',recursive=False)[-1].append(BeautifulSoup(f'{i:02d} <i>/ {len(pages):02d}</i>','html.parser'))
 eyebrow=p.select_one('main > .eyebrow')
 if i>1:
  label=re.sub(r'^\d+\s*/\s*','',eyebrow.get_text())
  eyebrow.string=f'{i-1:02d} / {label}'

cover=pages[0]
cover.select_one('.dek').string='16 语整理成中文 · 10 套卡片 · 5 种心情'
for t in list(cover.find_all(string=True)):
 if '作品说明 / V6' in t:t.replace_with(str(t).replace('V6','V7'))
toc=pages[1].select_one('.toc')
toc.clear()
toc.append(BeautifulSoup('<span>03—08 页<br><b>发现与记录</b></span><span>09—17 页<br><b>五色与管理</b></span><span>18—26 页<br><b>卡片与生活</b></span><span>27—32 页<br><b>技术与边界</b></span>','html.parser'))
last=pages[-1]
evidencep=last.select_one('.evidence')
newp=soup.new_tag('p');newp.string='16语证据已从10-14历史工具返回中找回，纠正规格“无读数”的旧结论；此处不把一次样本通过泛化为所有文本均准确。新增探店漫画为AI生成的概念流程图，非真实产品截图。'
evidencep.append(newp)

style=r'''
.story-page main>.eyebrow{margin:16pt 0 9pt}.story-page h1{font-size:27pt;line-height:1.3;margin-bottom:9pt;white-space:nowrap}.story-page .dek{font-size:9.5pt;margin-bottom:10pt}.story-art{width:390pt;height:auto;margin:0 auto}.story-page .note{font-size:6.8pt;line-height:1.5}
.language-page h1{font-size:31pt}.language-page .dek{margin-bottom:16pt}.language-hero{display:grid;grid-template-columns:136pt 1fr;gap:18pt;align-items:center;padding:7pt 0 16pt;border-top:.6pt solid var(--line)}.language-number{font:100pt/1.1 Playfair,Georgia,serif;color:var(--clay);letter-spacing:-8pt}.language-hero span{font-size:7pt;letter-spacing:1.2pt;color:var(--clay)}.language-hero h2{font-size:23pt;line-height:1.35;margin:8pt 0}.language-hero p{font-size:9pt;line-height:1.7;margin:0}.language-list{display:grid;grid-template-columns:repeat(4,1fr);gap:0 15pt;margin:6pt 0 25pt}.language-list span{padding:7pt 0;border-bottom:.5pt solid var(--line);font-size:10pt}.language-list i{font:8pt Georgia,serif;color:var(--clay);font-style:normal;margin-right:12pt}.language-scenes{display:grid;grid-template-columns:1fr 1fr;gap:24pt}.language-scenes h3{font-size:12pt;margin:8pt 0}.language-scenes p{font-size:9pt;line-height:1.8}.language-path{background:var(--sage);padding:12pt 15pt;margin:14pt 0;font-size:9pt}.language-page .small{font-size:8pt}.language-page .note{font-size:6.5pt}
.mood-full-page{background:var(--mood-paper)!important}.mood-full-page h1{font-size:27pt;white-space:nowrap;color:var(--mood-ink);letter-spacing:-.5pt}.mood-full-page main>.eyebrow{color:var(--mood-ink)}.mood-full-page .dek{margin-bottom:28pt}.mood-full-layout{display:grid;grid-template-columns:236pt 1fr;gap:32pt;align-items:center}.mood-full-screen{width:236pt;height:auto;border-radius:17pt;box-shadow:0 10pt 25pt #28332618}.mood-serial{font:43pt/1 Playfair,Georgia,serif;color:var(--mood-ink)}.mood-serial i{font-size:13pt;color:var(--muted);font-style:normal;margin-left:7pt}.mood-essay h2{font-size:30pt;line-height:1.2;margin:20pt 0}.mood-essay h2 em{display:block;font:12pt Playfair,Georgia,serif;letter-spacing:3pt;margin-top:10pt;color:var(--mood-ink)}.mood-essay>p{font-size:10pt;line-height:1.9}.mood-use{border-top:.5pt solid #a9b1a477;padding-top:17pt;margin-top:22pt}.mood-use h3{font-size:11pt}.mood-use p{font-size:9pt;line-height:1.8}.mood-family{display:flex;gap:9pt;margin:27pt 0 13pt;font-size:8pt;color:var(--muted)}.mood-family b{font-weight:400;white-space:nowrap}.mood-family .chosen{color:var(--mood-ink);font-weight:600;border-bottom:1pt solid var(--mood-ink);padding-bottom:5pt}.mood-essay .mood-foot{font-size:8pt;line-height:1.85;color:var(--muted)}.closing-page .evidence p{font-size:7.5pt;line-height:1.65}.closing-page .closing{margin-top:12pt;margin-bottom:19pt}
'''
soup.style.string=soup.style.string+'\n'+style
soup.title.string='图麦笔记 · 微信小程序比赛作品集 · V7'
soup.select_one('#position').string=f'1 / {len(pages)}'
soup.select_one('#layout-report').clear()
(A/'页码与更新.json').write_text(json.dumps([{'page':i,'title':p.h1.get_text(' ',strip=True)} for i,p in enumerate(pages,1)],ensure_ascii=False,indent=2))
OUT.write_text(str(soup))
print(json.dumps({'html':str(OUT),'pages':len(pages),'story':str(A/'探店故事-六格漫画.png')},ensure_ascii=False))
