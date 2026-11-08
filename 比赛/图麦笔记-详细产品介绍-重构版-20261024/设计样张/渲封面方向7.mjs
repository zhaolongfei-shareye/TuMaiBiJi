// 渲六版封面方向 → 每版一张 PNG；再把对标参考图并排拼进一张取证板。
import {chromium} from '/Users/zlfmac/.npm/_npx/9833c18b2d85bc59/node_modules/playwright/index.mjs';
import {readFile, writeFile, mkdir} from 'node:fs/promises';
import {dirname, join} from 'node:path';
import {fileURLToPath} from 'node:url';

const root = dirname(dirname(fileURLToPath(import.meta.url)));
const out = join(root, '设计样张', '封面方向7');
await mkdir(out, {recursive: true});

const browser = await chromium.launch({executablePath: '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome', headless: true});
const page = await browser.newPage({viewport: {width: 1440, height: 1100}, deviceScaleFactor: 1});
const errors = [];
page.on('pageerror', e => errors.push(e.message));
await page.goto('http://127.0.0.1:5097/' + encodeURIComponent('封面方向稿7.html'));
await page.evaluate(() => document.fonts.ready);
await page.evaluate(() => Promise.all([...document.images].map(i => i.decode().catch(() => null))));

const pages = await page.locator('.page').all();
const shots = [];
for (let i = 0; i < pages.length; i++) {
  const el = pages[i];
  await el.scrollIntoViewIfNeeded();
  const file = join(out, 'A'+i + '.png');
  await el.screenshot({path: file});
  // 越界自检：任何元素底边超出 1600 或右边超出 1280 都记下来
  const bad = await el.evaluate(p => [...p.querySelectorAll('*')].filter(e => {
    const r = e.getBoundingClientRect(), b = p.getBoundingClientRect();
    return r.height > 0 && (r.bottom - b.bottom > 1 || r.right - b.right > 1 || b.top - r.top > 1);
  }).map(e => e.className + '|' + (e.textContent || '').slice(0, 18)));
  shots.push({key: 'A'+i, file, bad});
}
console.log(JSON.stringify(shots, null, 1));
console.log('pageerrors', errors.length);
await browser.close();
