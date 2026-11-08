from pathlib import Path
from urllib.parse import quote
from bs4 import BeautifulSoup
from PIL import Image
import subprocess, json, pymupdf, hashlib

root=Path('/Users/zlfmac/Documents/TuMaiBiJi/比赛')
assets=root/'图麦笔记-新版素材-20261015'
name='图麦笔记-小程序比赛-编辑设计版-V6-20261015'
source=root/(name+'.html')
pdf=root/(name+'.pdf')
chrome='/Applications/Google Chrome.app/Contents/MacOS/Google Chrome'
base=[chrome,'--headless=new','--disable-gpu','--disable-background-networking']
probe=assets/'_浏览器检查.html'
extra='''<pre id="interaction-report" style="display:none"></pre><script>
setTimeout(()=>{const checks=[]; const label=()=>document.getElementById('position').textContent;
document.getElementById('next').click();checks.push({name:'下一页',ok:label()==='2 / 27'});
document.getElementById('prev').click();checks.push({name:'上一页',ok:label()==='1 / 27'});
document.getElementById('prev').click();checks.push({name:'首页边界',ok:label()==='1 / 27'});
for(let i=0;i<30;i++)document.getElementById('next').click();checks.push({name:'末页边界',ok:label()==='27 / 27'});
let called=false;window.print=()=>{called=true};document.getElementById('print').click();checks.push({name:'打印入口',ok:called});
document.getElementById('interaction-report').textContent=JSON.stringify(checks);
},1000);</script>'''
probe.write_text(source.read_text().replace('</body>',extra+'</body>'))
url='http://127.0.0.1:5097/'+quote('图麦笔记-新版素材-20261015/_浏览器检查.html')
r=subprocess.run(base+['--dump-dom','--virtual-time-budget=4000',url],capture_output=True,text=True,timeout=60)
s=BeautifulSoup(r.stdout,'html.parser')
layout=json.loads(s.select_one('#layout-report').get_text())
interaction=json.loads(s.select_one('#interaction-report').get_text())
assert layout['pages']==27 and not layout['errors'] and layout['images']==0,layout
assert all(c['ok'] for c in interaction),interaction
probe.unlink()
url='http://127.0.0.1:5097/'+quote(name+'.html')
r=subprocess.run(base+['--no-pdf-header-footer','--print-to-pdf='+str(pdf),'--timeout=30000',url],capture_output=True,text=True,timeout=70)
assert r.returncode==0 and pdf.exists(),r.stderr[-1000:]
d=pymupdf.open(pdf)
assert len(d)==27,len(d)
sections=BeautifulSoup(source.read_text(),'html.parser').select('section.page')
toc=[]
for i,p in enumerate(d):
    text=p.get_text()
    assert f'{i+1:02d} / 27' in text or f'{i+1:02d} / 27'.replace(' ','') in text.replace(' ',''),i
    assert len(text.strip())>80,i
    toc.append([1,sections[i].h1.get_text(' ',strip=True),i+1])
    pix=p.get_pixmap(matrix=pymupdf.Matrix(1.2,1.2),alpha=False)
    pix.save(str(assets/f'新版-{i+1:02d}.png'))
d.set_toc(toc)
d.set_metadata({'title':'图麦笔记｜微信小程序比赛作品集 V6','author':'赵龙飞','subject':'产品功能、交互、界面与技术方案 · 2026-10-15','keywords':'图麦笔记, 微信小程序, AI笔记, 产品设计'})
d.saveIncr()
for batch in range(5):
    sheet=Image.new('RGB',(1191,1124),'#d7d5cb')
    for j in range(6):
        i=batch*6+j
        if i>=len(d):break
        pix=d[i].get_pixmap(matrix=pymupdf.Matrix(2/3,2/3),alpha=False)
        im=Image.frombytes('RGB',(pix.width,pix.height),pix.samples)
        sheet.paste(im,((j%3)*397,(j//3)*562))
    sheet.save(assets/f'新版总览-{batch+1}.jpg',quality=92)
preview=Image.new('RGB',(1191,1124),'#d7d5cb')
for j,i in enumerate([0,3,8,15,20,26]):
    pix=d[i].get_pixmap(matrix=pymupdf.Matrix(2/3,2/3),alpha=False)
    preview.paste(Image.frombytes('RGB',(pix.width,pix.height),pix.samples),((j%3)*397,(j//3)*562))
preview.save(root/'图麦笔记-小程序比赛-V6-重点页预览.jpg',quality=93)
report={'layout':layout,'browser_interactions':interaction,'pdf_pages':len(d),'pdf_bytes':pdf.stat().st_size,'bookmarks':len(d.get_toc()),'pdf_sha256':hashlib.sha256(pdf.read_bytes()).hexdigest()}
(assets/'最终检查.json').write_text(json.dumps(report,ensure_ascii=False,indent=2))
print(json.dumps(report,ensure_ascii=False,indent=2))
