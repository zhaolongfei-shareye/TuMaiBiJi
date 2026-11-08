from pathlib import Path
from urllib.parse import quote
from bs4 import BeautifulSoup
from PIL import Image
import subprocess,json,pymupdf

root=Path('/Users/zlfmac/Documents/TuMaiBiJi/比赛')
a=root/'图麦笔记-V7素材-20261015'
name='图麦笔记-小程序比赛-文艺故事版-V7-20261015'
source=root/(name+'.html');pdf=root/(name+'.pdf')
s=BeautifulSoup(source.read_text(),'html.parser');sections=s.select('section.page');total=len(sections)
base=['/Applications/Google Chrome.app/Contents/MacOS/Google Chrome','--headless=new','--disable-gpu','--disable-background-networking']
probe=a/'_check.html'
extra='''<pre id="interaction-report" hidden></pre><script>setTimeout(()=>{const n=document.querySelectorAll('.page').length;const label=()=>document.getElementById('position').textContent;const tests=[];document.getElementById('next').click();tests.push(label()==='2 / '+n);document.getElementById('prev').click();tests.push(label()==='1 / '+n);document.getElementById('prev').click();tests.push(label()==='1 / '+n);for(let i=0;i<n+2;i++)document.getElementById('next').click();tests.push(label()===n+' / '+n);document.getElementById('interaction-report').textContent=JSON.stringify(tests)},1000)</script>'''
probe.write_text(source.read_text().replace('</body>',extra+'</body>'))
url='http://127.0.0.1:5097/'+quote(str(probe.relative_to(root)))
r=subprocess.run(base+['--dump-dom','--virtual-time-budget=5000',url],capture_output=True,text=True,timeout=70)
t=BeautifulSoup(r.stdout,'html.parser')
layout=json.loads(t.select_one('#layout-report').get_text());nav=json.loads(t.select_one('#interaction-report').get_text())
print(json.dumps({'layout':layout,'nav':nav},ensure_ascii=False))
assert not layout['errors'] and layout['images']==0 and layout['pages']==total and all(nav)
probe.unlink()
url='http://127.0.0.1:5097/'+quote(source.name)
r=subprocess.run(base+['--no-pdf-header-footer','--print-to-pdf='+str(pdf),'--timeout=30000',url],capture_output=True,text=True,timeout=70)
assert r.returncode==0 and pdf.exists(),r.stderr[-1000:]
d=pymupdf.open(pdf);assert len(d)==total
for i,p in enumerate(d):
 text=p.get_text();assert f'{i+1:02d}/{total}' in text.replace(' ',''),i
 p.get_pixmap(matrix=pymupdf.Matrix(1.2,1.2),alpha=False).save(str(a/f'V7-{i+1:02d}.png'))
d.set_toc([[1,p.h1.get_text(' ',strip=True),i] for i,p in enumerate(sections,1)])
d.set_metadata({'title':'图麦笔记｜微信小程序比赛作品集 V7','author':'赵龙飞','subject':'16语中文笔记、五种心情与探店故事','keywords':'图麦笔记,多语言,笔记,卡片,小程序'})
d.saveIncr()
for batch in range((total+5)//6):
 sheet=Image.new('RGB',(1191,1124),'#d7d5cb')
 for j in range(6):
  i=batch*6+j
  if i>=total:break
  pix=d[i].get_pixmap(matrix=pymupdf.Matrix(2/3,2/3),alpha=False)
  sheet.paste(Image.frombytes('RGB',(pix.width,pix.height),pix.samples),((j%3)*397,(j//3)*562))
 sheet.save(a/f'V7总览-{batch+1}.jpg',quality=92)
preview=Image.new('RGB',(1191,1686),'#d7d5cb')
for j,i in enumerate([0,2,3,9,10,11,12,13,31]):
 pix=d[i].get_pixmap(matrix=pymupdf.Matrix(2/3,2/3),alpha=False)
 preview.paste(Image.frombytes('RGB',(pix.width,pix.height),pix.samples),((j%3)*397,(j//3)*562))
preview.save(root/'图麦笔记-小程序比赛-V7-重点页预览.jpg',quality=93)
report={'pages':total,'pdf_bytes':pdf.stat().st_size,'layout':layout,'nav':nav,'full_mood_screens':len(s.select('.mood-full-screen')),'language_names':len(s.select('.language-list>span')),'story_panels':6,'bookmarks':len(d.get_toc())}
assert report['full_mood_screens']==5 and report['language_names']==16
(a/'检查结果.json').write_text(json.dumps(report,ensure_ascii=False,indent=2))
print(json.dumps(report,ensure_ascii=False,indent=2))
