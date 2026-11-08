import {chromium} from '/Users/zlfmac/.npm/_npx/9833c18b2d85bc59/node_modules/playwright/index.mjs';
const b=await chromium.launch({executablePath:'/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',headless:true});
const p=await b.newPage({viewport:{width:390,height:844}});
await p.goto('http://127.0.0.1:5097/'+encodeURIComponent('图麦笔记-旅行故事版.html'));
await p.waitForFunction(()=>document.querySelector('#page-52'));
const r=await p.evaluate(()=>{
  const pg=document.querySelector('#page-52');
  const out=[...pg.querySelectorAll('p,h1,h2,h3,img,li,svg,.mood-shot,.mood-row')].map(el=>{
    const q=el.getBoundingClientRect();
    return {tag:el.tagName.toLowerCase(),cls:el.className.slice(0,18),left:+q.left.toFixed(1),right:+q.right.toFixed(1),w:+q.width.toFixed(1)};
  });
  return {inner:innerWidth,pad:getComputedStyle(pg).paddingLeft,rows:getComputedStyle(document.querySelector('.mood-row')).flexWrap,out};
});
console.log(JSON.stringify(r,null,1));
await b.close();
