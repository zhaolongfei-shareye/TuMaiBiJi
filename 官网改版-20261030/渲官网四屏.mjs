import {chromium} from '/Users/zlfmac/.npm/_npx/9833c18b2d85bc59/node_modules/playwright/index.mjs';
import {mkdir} from 'node:fs/promises';
const out='/Users/zlfmac/Documents/TuMaiBiJi/官网改版-20261030/效果图';
await mkdir(out,{recursive:true});
const b=await chromium.launch({executablePath:'/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',headless:true});
const p=await b.newPage({viewport:{width:1520,height:1000},deviceScaleFactor:1});
const errs=[];p.on('pageerror',e=>errs.push(e.message));
const failed=[];p.on('requestfailed',r=>failed.push(r.url().split('/').slice(-1)[0]));
await p.goto('file://'+out.replace('/效果图','')+'/官网改版四屏.html');
await p.evaluate(()=>document.fonts.ready);
await p.evaluate(()=>Promise.all([...document.images].map(i=>i.decode().catch(()=>null))));
const els=await p.locator('.panel').all();
const names=['01-支持的网站','02-模板真实成品','03-版本只留大版本','04-十六种外文'];
for(let i=0;i<els.length;i++){
  await els[i].scrollIntoViewIfNeeded();
  await els[i].screenshot({path:`${out}/${names[i]}.png`});
  const bad=await els[i].evaluate(e=>{const r=e.getBoundingClientRect();
    return [...e.querySelectorAll('*')].filter(x=>{const q=x.getBoundingClientRect();return q.height>0&&(q.bottom>r.bottom+1||q.right>r.right+1)}).map(x=>x.className+'|'+(x.textContent||'').slice(0,16))});
  console.log(names[i],'越界',bad.length?JSON.stringify(bad):'无');
}
console.log('imgs',await p.evaluate(()=>document.images.length),'加载失败请求',failed.length?JSON.stringify([...new Set(failed)]):'无','pageerrors',errs.length);
await b.close();
