import { chromium } from '/Users/zlfmac/.npm/_npx/9833c18b2d85bc59/node_modules/playwright/index.mjs';
import { readFileSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createHash } from 'node:crypto';

const root = dirname(fileURLToPath(import.meta.url));
const utils = resolve(root, '../../miniprogram/utils');
const sources = {};
const pending = ['poster.js'];
while (pending.length) {
  const name = pending.shift();
  if (sources[name]) continue;
  if (!/^[A-Za-z][A-Za-z0-9_]*\.js$/.test(name)) throw new Error('Unexpected dependency: ' + name);
  const source = readFileSync(join(utils, name), 'utf8');
  sources[name] = source;
  for (const match of source.matchAll(/require\(['"]([^'"]+)['"]\)/g)) pending.push(match[1].replace(/^\.\//, ''));
}
const illustration = 'data:image/jpeg;base64,' + readFileSync(join(root, 'assets/study.jpg')).toString('base64');
const browser = await chromium.launch({ executablePath: '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome', headless: true });
try {
  const page = await browser.newPage();
  await page.route('**/*', route => route.abort());
  await page.setContent('<!doctype html><meta charset="utf-8"><canvas></canvas>');
  const rows = await page.evaluate(async ({sources, illustration}) => {
    const cache = {};
    const forbidden = () => { throw new Error('Preview must not access platform services'); };
    const wx = {
      env: { USER_DATA_PATH: '/no-user-files' },
      getStorageSync: () => '', setStorageSync: forbidden,
      getFileSystemManager: () => ({ accessSync: forbidden, copyFile: forbidden, unlinkSync: forbidden })
    };
    function req(path) {
      const key = path.replace(/^\.\//, '');
      if (cache[key]) return cache[key].exports;
      if (!(key in sources)) throw new Error('Missing module ' + key);
      const module = { exports: {} };
      cache[key] = module;
      new Function('module', 'exports', 'require', 'wx', sources[key])(module, module.exports, req, wx);
      return module.exports;
    }
    const poster = req('./poster.js');
    const photo = new Image();
    photo.src = illustration;
    await photo.decode();
    const note = {
      id: 0, title: '阅读，是与自己相遇',
      summary: '留下一段喜欢的文字，也留下一点自己的理解。让读过的内容，在日常生活里慢慢生长。',
      key_points: ['读到喜欢的段落，随手记下来', '回看时补上自己的思考', '把真正有用的内容分享出去'],
      tags: ['阅读', '灵感'], category_id: 1, source_type: 'manual', created_at: '2026-10-24T10:00:00Z'
    };
    const profile = { name: '阅读手记', slogan: '每天读一点，慢慢想清楚', avatarPath: 'ai-demo-profile' };
    const canvas = document.querySelector('canvas');
    const ctx = canvas.getContext('2d');
    return ['card','quote','block','spec','letter','popGrid','popDots','acid','cover','lit'].map(id => {
      const plan = poster.planPoster(ctx, note, id, profile, 'zh', {showQr:false, strict:true, hasNote:true});
      if (plan.fellBack) throw new Error('Fallback template: ' + id);
      if (plan.layers.some(layer => layer.k === 'image' && layer.key === 'qr')) throw new Error('QR layer retained');
      canvas.width = plan.width;
      canvas.height = plan.height;
      const bitmap = {img:photo, w:photo.naturalWidth, h:photo.naturalHeight};
      const images = {note:bitmap, avatar:bitmap};
      const imageKeys = plan.layers.filter(layer => layer.k === 'image' || layer.k === 'avatar').map(layer => layer.key || 'avatar');
      if (imageKeys.some(key => !images[key]?.img || !images[key].w || !images[key].h)) throw new Error('Missing image for ' + id);
      poster.paintLayers(ctx, plan.layers, images);
      return {id, width:plan.width, height:plan.height, layers:plan.layers.length, imageKeys, png:canvas.toDataURL('image/png').split(',')[1]};
    });
  }, {sources, illustration});
  for (const row of rows) writeFileSync(join(root, 'assets', `current-${row.id}.png`), Buffer.from(row.png, 'base64'));
  const report = {
    version: sources['appInfo.js']?.match(/const VERSION = '([^']+)'/)?.[1] || readFileSync(join(utils, 'appInfo.js'),'utf8').match(/const VERSION = '([^']+)'/)[1],
    method:'Current local product renderer in desktop Chrome; fictional note and profile; AI-generated photo; showQr=false; no remote recipes or network access',
    dependencies:Object.fromEntries(Object.entries(sources).map(([name,src])=>[name,createHash('sha256').update(src).digest('hex')])),
    cards:rows.map(({png,...row})=>row)
  };
  writeFileSync(join(root,'卡面重绘记录.json'),JSON.stringify(report,null,2));
  console.log(JSON.stringify({version:report.version,cards:report.cards}));
} finally {
  await browser.close();
}
