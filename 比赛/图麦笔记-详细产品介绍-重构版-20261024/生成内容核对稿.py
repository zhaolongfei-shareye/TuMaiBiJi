from pathlib import Path
from html import escape
from urllib.parse import quote
from PIL import Image
import base64, io, json, re

ROOT = Path(__file__).resolve().parent
REPO = ROOT.parent.parent
files = ['01-首页与个人使用.json', '02-录入与阅读.json', '03-卡片分享与隐私.json']
chapters = []
for name in files:
    chapters.extend(json.loads((ROOT/'内容'/name).read_text()))
chapters.sort(key=lambda ch:int(ch['id']))
assert [int(ch['id']) for ch in chapters] == list(range(1,13))
features = [f for ch in chapters for f in ch['features']]
assert len({f['id'] for f in features}) == len(features)
keys = ['benefit','operation','result','boundary']
for f in features:
    assert all(isinstance(f.get(k),str) and f[k].strip() for k in keys + ['whitepaper'])
    assert f['evidence']
    for loc in f['evidence']:
        matched = re.match(r'(.+):(\d+)(?:[-–](\d+))?$',loc)
        assert matched,loc
        path = REPO / matched[1]
        assert path.is_file(),str(path)
        assert int(matched[2]) <= len(path.read_text().splitlines()),loc
meta = json.loads((ROOT/'内容/白皮书对照说明.json').read_text())
travel = json.loads((ROOT/'内容/旅行主线文案.json').read_text())
char_count = sum(len(re.findall(r'[\u4e00-\u9fff]',f[k])) for f in features for k in keys)

def image(path):
    im=Image.open(path).convert('RGB')
    im.thumbnail((1600,1100))
    b=io.BytesIO();im.save(b,format='JPEG',quality=92)
    return 'data:image/jpeg;base64,'+base64.b64encode(b.getvalue()).decode()

def source(loc):
    m=re.match(r'(.+):(\d+)(?:[-–](\d+))?$',loc)
    target='file://'+quote(str(REPO/m[1]))+'#L'+m[2]
    return '<li><a href="'+target+'">'+escape(loc)+'</a></li>'

parts=[]
for ch in chapters:
    rows=[]
    for f in ch['features']:
        body=''.join('<div class="para"><h4>'+lab+'</h4><p>'+escape(f[k])+'</p></div>' for k,lab in zip(keys,['有什么用','怎么使用','会得到什么','需要知道']))
        sources='<details><summary>白皮书对应与核对依据</summary><p>'+escape(f['whitepaper'])+'</p><ul>'+''.join(source(loc) for loc in f['evidence'])+'</ul></details>'
        rows.append('<article class="feature" id="f-'+escape(f['id'])+'"><div class="feature-head"><span>'+escape(f['id'])+'</span><h3>'+escape(f['title'])+'</h3></div>'+body+sources+'</article>')
    parts.append('<section class="chapter" id="c'+ch['id']+'"><div class="chapter-head"><span>第 '+ch['id']+' 章</span><h2>'+escape(ch['title'])+'</h2><p>'+escape(ch['intro'])+'</p></div>'+''.join(rows)+'</section>')
nav=''.join('<a href="#c'+ch['id']+'">'+ch['id']+' '+escape(ch['title'].split('：')[0])+' <small>'+str(len(ch['features']))+'</small></a>' for ch in chapters)
sample=''.join('<figure><a href="'+quote(name)+'"><img src="'+image(ROOT/name)+'" alt="'+escape(title)+'"></a><figcaption>'+escape(title)+'</figcaption></figure>' for name,title in [('瑞士故事版图片/01.png','封面 · 突出slogan，手机方向已纠正'),('瑞士故事版图片/11.png','远程分享 · 林夏仍在国外，通过朋友圈分享'),('瑞士故事版图片/13.png','回国之后 · 打印卡片，贴进旅行手账'),('瑞士故事版图片/15.png','闺蜜来家 · 扫描照片墙的阅读码，查看其他照片')])
coverage='<table><thead><tr><th>白皮书</th><th>新内容位置</th><th>处理方式</th></tr></thead><tbody>'+''.join('<tr>'+''.join('<td>'+escape(d[k])+'</td>' for k in ['whitepaper','destination','treatment'])+'</tr>' for d in meta['domains'])+'</tbody></table>'
differences=''.join('<article class="difference"><h3>'+escape(d['topic'])+'</h3><dl><dt>白皮书原口径</dt><dd>'+escape(d['old'])+'</dd><dt>当前核对</dt><dd>'+escape(d['current'])+'</dd><dt>本稿处理</dt><dd>'+escape(d['decision'])+'</dd></dl><details><summary>查看依据</summary><ul>'+''.join(source(loc) for loc in d['evidence'])+'</ul></details></article>' for d in meta['differences'])
css='''
*{box-sizing:border-box}html{scroll-behavior:smooth;scroll-padding-top:95px}body{margin:0;color:#202b3a;background:#f4f6f8;font-family:-apple-system,BlinkMacSystemFont,"PingFang SC",sans-serif;line-height:1.8}a{color:#2455b1;text-decoration:none}a:hover{text-decoration:underline}button,input{font:inherit}header{position:sticky;top:0;z-index:8;display:flex;gap:24px;align-items:center;padding:16px 28px;background:#fff;border-bottom:1px solid #dce2e8}header strong{white-space:nowrap}header label{margin-left:auto;font-size:13px}input{width:240px;padding:7px 12px;border:1px solid #adb8c6;border-radius:5px}button{padding:7px 15px;background:white;border:1px solid #adb8c6;border-radius:5px;cursor:pointer}button:focus-visible,a:focus-visible,input:focus-visible,summary:focus-visible{outline:3px solid #3d75df;outline-offset:3px}.layout{max-width:1440px;margin:auto;display:grid;grid-template-columns:260px minmax(0,1fr);gap:36px;padding:30px 28px}aside{position:sticky;top:105px;align-self:start;max-height:calc(100vh - 130px);overflow:auto;font-size:13px}aside a{display:block;color:#344256;padding:9px 13px;border-radius:4px}aside a:hover{background:#e3e9f3}aside small{float:right;color:#7b8796}aside h2{font-size:12px;letter-spacing:2px;padding-left:13px;color:#7b8796}.intro,.chapter,.appendix,.designs{background:#fff;padding:38px 45px;margin-bottom:26px;border:1px solid #e2e7ec;border-radius:8px}h1{font-size:32px;line-height:1.4;margin:12px 0}h2{font-size:27px;line-height:1.5;margin:8px 0 15px}h3{font-size:20px;line-height:1.6;margin:0}p{margin:9px 0 20px;font-size:15px}.badge{font-size:12px;font-weight:600;color:#2859aa;letter-spacing:1px}.status{font-size:14px;padding:15px 18px;background:#f0f4fa;border-left:3px solid #4272bf;margin:20px 0}.metrics{display:flex;gap:26px;font-size:14px;color:#5b697a}.metrics b{font-size:21px;color:#25394f;margin-right:6px}.chapter-head>span{color:#57708d;font-size:12px;letter-spacing:2px}.chapter-head>p{color:#657385;max-width:780px}.feature{padding:29px 0 32px;border-top:1px solid #e2e7ec;scroll-margin-top:95px}.feature-head{display:flex;align-items:baseline;gap:16px;margin-bottom:18px}.feature-head>span{font-size:11px;color:#57708d;min-width:45px}.para{display:grid;grid-template-columns:86px minmax(0,1fr);gap:14px;margin:12px 0}.para h4{font-size:12px;color:#68788a;margin:3px 0}.para p{font-size:15px;margin:0;line-height:1.95;text-align:justify}.feature details{margin:18px 0 0 100px}details{font-size:12px;color:#637284}summary{cursor:pointer;color:#39649c}details p{font-size:12px}details ul{padding-left:18px;overflow-wrap:anywhere}table{border-collapse:collapse;width:100%;font-size:13px}th,td{padding:12px 10px;border:1px solid #dce2e8;text-align:left;vertical-align:top}th{background:#f0f4f8}td:first-child{width:22%}td:nth-child(2){width:25%}.difference{padding:23px 0;border-top:1px solid #e2e7ec}.difference h3{font-size:18px}.difference dl{display:grid;grid-template-columns:105px minmax(0,1fr);gap:12px;font-size:13px}.difference dt{color:#758397}.difference dd{margin:0}figure{margin:28px 0}figure img{width:100%;display:block;border:1px solid #e3e7ed}figcaption{font-size:13px;color:#58697f;margin-top:12px}.appendix li{margin:10px 0;font-size:14px}.no-results{display:none;padding:40px;background:white}.hide{display:none!important}#result{font-size:12px;color:#67788c;min-width:100px}.source-link{font-size:13px}.muted{color:#748397;font-size:12px}.designs>p{font-size:14px}.appendix .table-wrap{overflow-x:auto}
@media(max-width:850px){header{flex-wrap:wrap;gap:10px;padding:10px 14px}header strong{font-size:14px}header label{margin-left:0;width:100%}input{width:calc(100% - 80px)}header button{font-size:12px;padding:3px 10px}.layout{display:block;padding:14px}aside{position:static;max-height:none;display:flex;flex-wrap:wrap;gap:2px;margin-bottom:15px}aside h2{width:100%;padding-left:3px}aside a{font-size:12px;padding:5px 8px}aside small{display:none}.intro,.chapter,.appendix,.designs{padding:24px 20px}h1{font-size:25px}h2{font-size:22px}h3{font-size:18px}.para{display:block}.para h4{margin-bottom:4px}.feature details{margin-left:0}.metrics{gap:12px;flex-wrap:wrap}.difference dl{display:block}.difference dd{margin:5px 0 13px}th,td{min-width:170px}}
@media print{@page{size:A4;margin:18mm}header,aside,.designs,.source-link,.muted,.feature details{display:none}.layout{display:block;padding:0;max-width:none}.intro,.chapter,.appendix{border:none;padding:0;margin:0 0 25px}.chapter{break-before:page}.feature{break-inside:avoid}body{background:white}.para p{font-size:11px}.para h4{font-size:10px}.chapter-head p{font-size:12px}}
'''
script='''
const search=document.querySelector('#search');
function fitHeader(){document.documentElement.style.scrollPaddingTop=`${document.querySelector('header').offsetHeight+20}px`}
addEventListener('resize',fitHeader);fitHeader();
const articles=[...document.querySelectorAll('.feature')];
function filter(){const q=search.value.trim().toLocaleLowerCase();let count=0;articles.forEach(a=>{const visible=!q||a.textContent.toLocaleLowerCase().includes(q);a.classList.toggle('hide',!visible);if(visible)count++});document.querySelectorAll('.chapter').forEach(c=>c.classList.toggle('hide',![...c.querySelectorAll('.feature')].some(a=>!a.classList.contains('hide'))));document.querySelector('#result').textContent=q?`找到 ${count} 项`:'';document.querySelector('.no-results').style.display=count?'none':'block';document.querySelectorAll('.intro,.designs,.appendix').forEach(e=>e.classList.toggle('hide',!!q));}
search.addEventListener('input',filter);document.querySelector('#clear').onclick=()=>{search.value='';filter();search.focus()};document.querySelectorAll('aside a').forEach(a=>a.addEventListener('click',()=>{search.value='';filter()}));
'''
output='<!doctype html><html lang="zh-CN"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>图麦笔记｜详细产品介绍·内容核对稿</title><style>'+css+'</style></head><body><header><strong>图麦笔记 · 内容核对稿</strong><label for="search">查找功能 <input id="search" type="search" placeholder="输入功能名或关键词"></label><button id="clear">清空</button><span id="result" role="status"></span></header><div class="layout"><aside><h2>全新内容结构</h2>'+nav+'<a href="#design">全新版式样张</a><a href="#coverage">白皮书覆盖表</a><a href="#difference">原文差异核对</a><a href="#limits">使用边界</a></aside><main><section class="intro"><span class="badge">详细内容稿 / 非最终排版成品</span><h1>图麦笔记<br>'+escape(travel['headline'])+'</h1><p>'+escape(travel['problem'])+'</p><p>'+escape(travel['promise'])+'</p><div class="metrics"><span><b>'+str(len(chapters))+'</b>章</span><span><b>'+str(len(features))+'</b>功能与场景条目</span><span><b>'+format(char_count,',')+'</b>汉字正文</span></div><div class="status">完整旅行故事版已排为63页：林夏的一场旅行串起图片、链接、文字、整理、分类、朋友圈远程分享与朋友转存，再延伸到回国打印手账、照片墙与闺蜜来家扫码。人物采用不同衣着和景别；后半册保留77项完整说明，补齐十一套模板、风格、语言、模型能力和边界。<a href="图麦笔记-旅行故事版.html">打开完整图文册</a> · <a href="图麦笔记-旅行故事版.pdf">打开PDF</a>。本页仅为文字核对与编写依据，不代替成品。</div><p class="source-link">对照正本：<a href="file://'+quote(str(REPO/meta['source']))+'">产品白皮书</a>。白皮书与当前本地2.4.16不一致之处，单列在文末，不修改白皮书原件，也不把过时入口继续宣传。</p></section><section class="designs" id="design"><h2>读懂这一站，写下自己的旅程。</h2><p>保留暖纸色、深绿与陶土点缀，以大幅旅行摄影、九图组照、中文卡面和透明分离的真实控件建立阅读节奏。场景图为AI示意，卡面由本地2.4.16代码绘制，旅行文字为虚构示例，不作为本轮自动提炼的实测结果。</p>'+sample+'</section><div class="no-results">没有匹配的功能；可清空关键词查看全部条目。</div>'+''.join(parts)+'<section class="appendix" id="coverage"><h2>白皮书功能覆盖对照</h2><p>'+escape(meta['basis'])+'</p><div class="table-wrap">'+coverage+'</div></section><section class="appendix" id="difference"><h2>白皮书与当前产品的差异</h2><p>这些是本次编写发现的内容差异，单列核对，不通过删除条目来掩盖，也不让大众按已经撤掉的按钮操作。</p>'+differences+'</section><section class="appendix" id="limits"><h2>使用边界</h2><ul>'+''.join('<li>'+escape(s)+'</li>' for s in meta['boundaries'])+'</ul><h2>后续整册图文要求</h2><ul>'+''.join('<li>'+escape(s)+'</li>' for s in meta['visual_rules'])+'</ul></section></main></div><script>'+script+'</script></body></html>'
(ROOT/'详细产品介绍-内容核对稿.html').write_text(output)
(ROOT/'完整内容.json').write_text(json.dumps(chapters,ensure_ascii=False,indent=2))
report={'chapters':len(chapters),'items':len(features),'chinese_body_chars':char_count,'by_chapter':[{ 'id':ch['id'],'title':ch['title'],'count':len(ch['features'])} for ch in chapters],'missing_fields':0,'duplicate_ids':0,'evidence_paths_checked':sum(len(f['evidence']) for f in features),'whitepaper_domains':len(meta['domains']),'differences':len(meta['differences']),'final_brochure_laid_out':(ROOT/'图麦笔记-旅行故事版.pdf').is_file()}
(ROOT/'内容覆盖读数.json').write_text(json.dumps(report,ensure_ascii=False,indent=2))
print(json.dumps(report,ensure_ascii=False))
