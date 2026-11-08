import { chromium } from '/Users/zlfmac/.npm/_npx/9833c18b2d85bc59/node_modules/playwright/index.mjs';
import { writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
const root=path.dirname(fileURLToPath(import.meta.url));
const browser=await chromium.launch({executablePath:'/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',headless:true});
try{
 const page=await browser.newPage({viewport:{width:1040,height:1100},deviceScaleFactor:2});
 const errors=[];page.on('pageerror',e=>errors.push(e.message));
 await page.goto('http://127.0.0.1:5096/'+encodeURIComponent('图麦笔记-大众产品介绍.html'));
 await page.evaluate(()=>document.fonts.ready);
 await page.locator('img').evaluateAll(imgs=>Promise.all(imgs.map(i=>i.decode())));
 const report=await page.locator('.page').evaluateAll(pages=>pages.map((p,i)=>{
  const content=p.querySelector('.content');const footer=p.querySelector('footer');
  const rect=content.getBoundingClientRect();
  const all=[...content.querySelectorAll('*')].filter(e=>e.tagName!=='BR').map(e=>e.getBoundingClientRect());
  const bottom=Math.max(rect.bottom,...all.map(r=>r.bottom));
  return {page:i+1,title:p.dataset.title,gap:Math.round(footer.getBoundingClientRect().top-bottom),spill:p.scrollHeight-p.clientHeight};
 }));
 await page.selectOption('#chapters','p9');
 await page.waitForFunction(()=>Math.abs(document.getElementById('p9').getBoundingClientRect().top)<4);
 const desktop={navWorks:true,images:await page.locator('img').count(),errors};
 await page.setViewportSize({width:390,height:844});
 await page.waitForTimeout(150);
 const mobile=await page.evaluate(()=>({width:innerWidth,scrollWidth:document.documentElement.scrollWidth,firstPageWidth:document.querySelector('.page').getBoundingClientRect().width}));
 await page.selectOption('#chapters','p16');
 await page.waitForFunction(()=>Math.abs(document.getElementById('p16').getBoundingClientRect().top)<4);
 await page.screenshot({path:path.join(root,'手机预览.png')});
 await page.setViewportSize({width:1040,height:1100});
 await page.waitForTimeout(100);
 await writeFile(path.join(root,'版面检查.json'),JSON.stringify({pages:report,desktop,mobile},null,2));
 const bad=report.filter(r=>r.gap<0||r.spill>0);
 if(bad.length||errors.length||mobile.scrollWidth>mobile.width)throw new Error(JSON.stringify({bad,errors,mobile}));
 for(let i=0;i<16;i++)await page.locator('.page').nth(i).screenshot({path:path.join(root,'推广图片',`${String(i+1).padStart(2,'0')}.png`)});
 await page.emulateMedia({media:'print'});
 await page.pdf({path:path.join(root,'图麦笔记-大众产品介绍.pdf'),printBackground:true,preferCSSPageSize:true});
 console.log(JSON.stringify({result:'PASS',pages:report,desktop,mobile}));
}finally{await browser.close();}
