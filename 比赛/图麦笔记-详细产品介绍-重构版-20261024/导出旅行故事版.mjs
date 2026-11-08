import {chromium} from '/Users/zlfmac/.npm/_npx/9833c18b2d85bc59/node_modules/playwright/index.mjs';
import {readFile,writeFile,mkdir} from 'node:fs/promises';
import {dirname,join} from 'node:path';
import {fileURLToPath} from 'node:url';
const root=dirname(fileURLToPath(import.meta.url));
const plan=JSON.parse(await readFile(join(root,'旅行故事版-编排与覆盖.json'),'utf8'));
const chapters=JSON.parse(await readFile(join(root,'完整内容.json'),'utf8'));
const expected=chapters.flatMap(ch=>ch.features);
const templatePage=plan.page_plan.find(p=>p.kind==='reference'&&p.features.includes('06-03')).number;
const indexPage=plan.page_plan.find(p=>p.kind==='index').number;
const out=join(root,'瑞士故事版图片');
await mkdir(out,{recursive:true});
const browser=await chromium.launch({executablePath:'/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',headless:true});
try{
  const page=await browser.newPage({viewport:{width:1440,height:1100},deviceScaleFactor:1.25});
  const errors=[];page.on('pageerror',e=>errors.push(e.message));
  await page.goto('http://127.0.0.1:5097/'+encodeURIComponent('图麦笔记-旅行故事版.html'));
  await page.evaluate(()=>document.fonts.ready);
  await page.locator('img').evaluateAll(imgs=>Promise.all(imgs.map(i=>i.decode())));
  // 参考半册改成"左图右要点"，尺子也跟着换：不再要求四段长文逐字相等，
  // 而是要求每一项都真的有一张配图、三到四条要点，且 77 项一次不多一次不少。
  const actual=await page.locator('.feature-column').evaluateAll(nodes=>nodes.map(n=>({
    id:n.dataset.featureId,
    points:[...n.querySelectorAll('.points li')].map(li=>li.textContent.trim()),
    caution:n.querySelectorAll('.caution').length,
    art:n.querySelectorAll('.wire-stage svg,.template-image').length,
    cap:(n.querySelector('.wire-cap')||{}).textContent||''
  })));
  if(actual.length!==77)throw Error('Feature count mismatch: '+actual.length);
  for(const f of expected){
    const hits=actual.filter(a=>a.id===f.id);
    if(hits.length!==1)throw Error('Feature not rendered exactly once: '+f.id);
    const h=hits[0];
    if(h.art!==1)throw Error('Feature needs exactly one figure: '+f.id);
    if(h.points.length<3)throw Error('Feature needs at least three points: '+f.id);
    if(h.points.some(t=>!t||t.length>34))throw Error('Empty or over-long bullet: '+f.id);
    if(h.caution>1)throw Error('More than one boundary line: '+f.id);
    if(!h.cap)throw Error('Figure has no provenance caption: '+f.id);
  }
  if(await page.locator('.page').count()!==plan.pages)throw Error('Page count mismatch');
  if(await page.locator('.template-image').count()!==11)throw Error('Template count mismatch');
  const layout=await page.locator('.page').evaluateAll(pages=>pages.map(p=>{
    const box=p.getBoundingClientRect(),foot=p.querySelector('footer').getBoundingClientRect();
    const head=p.querySelector('.page-head').getBoundingClientRect();
    const content=p.querySelector('.page-content').getBoundingClientRect();
    const nodes=[...p.querySelectorAll('.page-content p,.page-content h2,.page-content h3,.page-content blockquote,.page-content img,.page-content label,.page-content .points li,.page-content .wire-stage,.page-content .wire-cap,.page-content .section-band,.page-content .ribbon,.page-content .cover-bottom,.page-content .editorial-quote,.page-content .end-word,.page-content .contents-grid,.page-content .language-grid,.page-content .category-graphic,.page-content .cv-meta,.page-content .cv-strip,.page-content .cv-brand,.page-content .cv-rule,.page-content .photo-sequence,.page-content .transfer')];
    const measured=nodes.map(n=>({text:(n.textContent||n.alt||n.className).slice(0,60),rect:n.getBoundingClientRect()}));
    const bad=measured.filter(({rect:r})=>r.bottom>foot.top-18||r.right>box.right-45||r.left<box.left+45).map(({text,rect:r})=>({text,x:r.x-box.x,y:r.y-box.y,right:r.right-box.x,bottom:r.bottom-box.y,footer:foot.top-box.y}));
    return {id:p.id,headGap:content.top-head.bottom,footerGap:foot.top-Math.max(...measured.map(m=>m.rect.bottom)),bad};
  }));
  const bad=layout.filter(p=>p.bad.length||p.headGap<12);
  await writeFile(join(root,'旅行故事版-版面检查.json'),JSON.stringify({pages:plan.pages,layout,bad,errors},null,2));
  for(const n of [1,2,3,7,8,10,11,14,30,34,46,55,56]){
    await page.locator('#page-'+n).screenshot({style:'.reader{visibility:hidden!important}',path:join(out,String(n).padStart(2,'0')+'.png')});
  }
  if(bad.length)throw Error(JSON.stringify(bad));
  await page.locator('#page-select').selectOption(String(templatePage));
  await page.waitForFunction(n=>{const r=document.querySelector('#page-'+n).getBoundingClientRect();return r.top>=-2&&r.top<150},templatePage);
  await page.locator('#page-select').selectOption(String(indexPage));
  await page.waitForFunction(n=>{const r=document.querySelector('#page-'+n).getBoundingClientRect();return r.top>=-2&&r.top<150},indexPage);
  await page.locator('#page-'+indexPage+' a[href="#chapter-09"]').click();
  await page.waitForFunction(()=>{const r=document.querySelector('#chapter-09').closest('.page').getBoundingClientRect();return r.top>=-2&&r.top<150});
  await page.setViewportSize({width:390,height:844});
  await page.waitForFunction(()=>document.querySelector('.page-wrap').style.width==='366px');
  await page.evaluate(()=>window.scrollTo({top:0,behavior:'instant'}));
  const mobile=await page.evaluate(()=>({width:innerWidth,scrollWidth:document.documentElement.scrollWidth,bodyFont:getComputedStyle(document.querySelector('.points li')).fontSize,columns:getComputedStyle(document.querySelector('.feature-grid')).gridTemplateColumns}));
  if(mobile.scrollWidth>mobile.width||parseFloat(mobile.bodyFont)<15)throw Error('Mobile reading failed: '+JSON.stringify(mobile));
  const mobileBad=await page.locator('.page').evaluateAll(pages=>pages.flatMap(p=>[...p.querySelectorAll('p,h1,h2,h3,img,li,svg,.language-grid,.ribbon,.section-band')].filter(el=>{const r=el.getBoundingClientRect();return r.right>innerWidth+1||r.left<0}).map(el=>({page:p.id,text:el.textContent.slice(0,40)}))));
  if(mobileBad.length)throw Error('Mobile element overflow: '+JSON.stringify(mobileBad));
  await page.screenshot({path:join(root,'旅行故事版-手机阅读.png')});
  await page.locator('#page-'+templatePage).screenshot({style:'.reader{visibility:hidden!important}',path:join(root,'旅行故事版-手机模板.png')});
  await page.setViewportSize({width:1440,height:1100});
  await page.waitForFunction(()=>document.querySelector('.page-wrap').style.width==='1280px');
  for(let n=1;n<=plan.pages;n++)await page.locator('#page-'+n).screenshot({style:'.reader{visibility:hidden!important}',path:join(out,String(n).padStart(2,'0')+'.png')});
  await page.emulateMedia({media:'print'});
  await page.pdf({path:join(root,'图麦笔记-旅行故事版.pdf'),preferCSSPageSize:true,printBackground:true,displayHeaderFooter:false});
  if(errors.length)throw Error(JSON.stringify(errors));
  const report={result:'PASS',pages:plan.pages,features:77,bullets:actual.reduce((a,b)=>a+b.points.length,0),cautions:actual.filter(a=>a.caution).length,templates:11,images:await page.locator('img').count(),minHeaderGap:Math.min(...layout.map(p=>p.headGap)),minFooterGap:Math.min(...layout.map(p=>p.footerGap)),navigation:true,chapterLinks:true,mobile,errors};
  await writeFile(join(root,'旅行故事版-浏览导出检查.json'),JSON.stringify(report,null,2));
  console.log(JSON.stringify(report));
}finally{await browser.close()}
