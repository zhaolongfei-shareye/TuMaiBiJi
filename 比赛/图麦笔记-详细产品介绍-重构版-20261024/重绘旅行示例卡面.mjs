import { chromium } from '/Users/zlfmac/.npm/_npx/9833c18b2d85bc59/node_modules/playwright/index.mjs';
import { readFileSync, writeFileSync, realpathSync, existsSync, lstatSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';

// 只写本稿的旅行卡-*；产品源码、原图、既有裁图与其他稿件全部只读。
const root = dirname(fileURLToPath(import.meta.url));
const expectedRoot = '/Users/zlfmac/Documents/TuMaiBiJi/比赛/图麦笔记-详细产品介绍-重构版-20261024';
if (realpathSync(root) !== expectedRoot) throw new Error('Only the new document directory is allowed');
const assets = join(root, '素材');
if (realpathSync(assets) !== assets) throw new Error('Asset directory must not redirect elsewhere');
const utils = resolve(root, '../../miniprogram/utils');
const seedPath = resolve(root, '../../backend/seed/poster_templates.json');
const sha256 = value => createHash('sha256').update(value).digest('hex');
// 与种子的 content_hash 口径相同：递归键名排序、紧凑 UTF-8 JSON。
const canonical = value => {
  if (Array.isArray(value)) return '[' + value.map(canonical).join(',') + ']';
  if (value && typeof value === 'object') {
    return '{' + Object.keys(value).sort().map(key => JSON.stringify(key) + ':' + canonical(value[key])).join(',') + '}';
  }
  return JSON.stringify(value);
};
const sources = {};
const pending = ['poster.js', 'posterTemplates.js'];
while (pending.length) {
  const name = pending.shift();
  if (sources[name]) continue;
  if (!/^[A-Za-z][A-Za-z0-9_]*\.js$/.test(name)) throw new Error('Unexpected dependency: ' + name);
  const source = readFileSync(join(utils, name), 'utf8');
  sources[name] = source;
  for (const match of source.matchAll(/require\(['"]([^'"]+)['"]\)/g)) {
    pending.push(match[1].replace(/^\.\//, ''));
  }
}
const version = sources['appInfo.js']?.match(/const VERSION = '([^']+)'/)?.[1];
if (!/^\d+\.\d+\.\d+$/.test(version || '')) throw new Error('Missing local product version');
const seedBytes = readFileSync(seedPath);
const seedRows = JSON.parse(seedBytes.toString('utf8'));
if (!Array.isArray(seedRows) || new Set(seedRows.map(row => row.template_id)).size !== seedRows.length) {
  throw new Error('Invalid or duplicate seed rows');
}
for (const row of seedRows) {
  if (row.recipe?.id !== row.template_id || sha256(canonical(row.recipe)) !== row.content_hash) {
    throw new Error('Seed recipe identity/hash mismatch: ' + row.template_id);
  }
}
const originalPath = join(assets, '旅行-九个瞬间.png');
const originalBytes = readFileSync(originalPath);
// Pillow 离线裁左上第一格，只通过 stdout 交回内存；不再覆写「旅行-万神殿.png」。
const illustrationBytes = execFileSync('python3', ['-B', '-c', `
from PIL import Image
import io, sys
with Image.open(io.BytesIO(sys.stdin.buffer.read())) as image:
    assert image.size == (1536, 1024), image.size
    image.crop((0, 0, 512, 341)).save(sys.stdout.buffer, format='PNG')
`], { input: originalBytes, maxBuffer: 8 * 1024 * 1024 });
const illustration = 'data:image/png;base64,' + illustrationBytes.toString('base64');
const note = {
  id: 0,
  title: '罗马慢游记',
  summary: '读完介绍再逛广场。看石柱间的光和穹顶的天。在转角喝杯咖啡。记下沿途风景与自己的感受。',
  key_points: ['读懂介绍，让地标不只剩一张打卡照', '把建筑、街巷与沿途细节放进同一篇', '补上自己的感受，再分享给朋友'],
  tags: ['罗马', '旅行手记'], category_id: 1, source_type: 'manual', created_at: '2026-10-24T10:00:00Z'
};
const profile = { name: '林夏', slogan: '看见，也记得', avatarPath: '' };
const options = { showQr: false, strict: true, hasNote: true };
const dependencies = Object.fromEntries(Object.entries(sources).map(([name, source]) => [name, sha256(source)]));
const inputHashes = new Map([
  [fileURLToPath(import.meta.url), sha256(readFileSync(fileURLToPath(import.meta.url)))],
  [seedPath, sha256(seedBytes)], [originalPath, sha256(originalBytes)],
  ...Object.entries(dependencies).map(([name, hash]) => [join(utils, name), hash])
]);
function writeAsset(name, bytes) {
  if (!/^旅行卡-(?:[A-Za-z][A-Za-z0-9]*\.png|绘制记录\.json)$/.test(name)) throw new Error('Output not allowed: ' + name);
  const output = join(assets, name);
  if (existsSync(output)) {
    const stat = lstatSync(output);
    if (!stat.isFile() || stat.isSymbolicLink() || stat.nlink !== 1) throw new Error('Output must be a regular unlinked file: ' + output);
  }
  writeFileSync(output, bytes);
  return output;
}
const browser = await chromium.launch({
  executablePath: '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome', headless: true,
  args: ['--disable-background-networking', '--disable-component-update', '--disable-sync', '--disable-domain-reliability', '--host-resolver-rules=MAP * ~NOTFOUND']
});
try {
  const context = await browser.newContext({ offline: true, serviceWorkers: 'block', timezoneId: 'Asia/Shanghai' });
  const blockedRequests = [];
  const observedRequests = [];
  context.on('request', request => observedRequests.push(request.url()));
  await context.route('**/*', route => {
    blockedRequests.push(route.request().url());
    return route.abort();
  });
  const page = await context.newPage();
  const pageErrors = [];
  page.on('pageerror', error => pageErrors.push(error.message));
  await page.setContent('<!doctype html><meta charset="utf-8"><meta http-equiv="Content-Security-Policy" content="default-src \'none\'; img-src data:; script-src \'unsafe-eval\'"><canvas></canvas>');
  const result = await page.evaluate(async ({ sources, seedRows, illustration, note, profile, options }) => {
    const cache = {};
    const forbiddenCalls = [];
    const storageReads = [];
    const memoryStorage = new Map();
    const forbidden = name => function () {
      forbiddenCalls.push(name);
      throw new Error('Platform/network services disabled: ' + name);
    };
    for (const key of ['fetch', 'XMLHttpRequest', 'WebSocket', 'EventSource']) {
      Object.defineProperty(globalThis, key, { value: forbidden(key), configurable: false });
    }
    Object.defineProperty(navigator, 'sendBeacon', { value: forbidden('sendBeacon') });
    const fs = new Proxy({}, { get: (_, key) => forbidden('fs.' + String(key)) });
    // 只读本次显式放入 Map 的虚构内容/本地种子；绝不接触真实微信缓存。
    const wx = new Proxy({
      env: { USER_DATA_PATH: '/no-user-files' },
      getStorageSync: key => { storageReads.push(key); return memoryStorage.get(key) || ''; },
      getFileSystemManager: () => fs
    }, { get: (target, key) => Object.hasOwn(target, key) ? target[key] : forbidden('wx.' + String(key)) });
    function req(path) {
      const key = path.replace(/^\.\//, '');
      if (cache[key]) return cache[key].exports;
      if (!(key in sources)) throw new Error('Missing module ' + key);
      const module = { exports: {} };
      cache[key] = module;
      new Function('module', 'exports', 'require', 'wx', sources[key])(module, module.exports, req, wx);
      return module.exports;
    }
    function freeze(value) {
      if (value && typeof value === 'object' && !Object.isFrozen(value)) {
        Object.values(value).forEach(freeze);
        Object.freeze(value);
      }
      return value;
    }
    freeze(note);
    freeze(profile);
    freeze(options);
    freeze(seedRows);
    const poster = req('./poster.js');
    const templates = req('./posterTemplates.js');
    const bundled = req('./posterRecipes.js');
    freeze(bundled);
    const bundledIds = poster.TEMPLATES.map(template => template.id);
    if (bundledIds.length !== 10 || bundledIds.some(id => !bundled[id] || bundled[id].id !== id)) {
      throw new Error('Bundled template definitions do not match their recipes');
    }
    // 十套使用当前包内真实配方；仅包内不存在的模板从种子恢复，避免旧种子盖掉新包内版。
    const injectedRows = seedRows.filter(row => row.status === 'live' && !bundledIds.includes(row.template_id));
    if (injectedRows.length !== 1 || injectedRows[0].template_id !== 'topBleedEdge') {
      throw new Error('Expected exactly the seed-only topBleedEdge recipe');
    }
    memoryStorage.set(poster.PROFILE_KEY, profile);
    memoryStorage.set(templates.STORE_KEY, freeze({ rows: injectedRows, manifest: templates.manifestOf(injectedRows) }));
    const restore = templates.restore();
    if (!restore.cached || restore.accepted !== injectedRows.length || restore.rejected.length) {
      throw new Error('Seed restore failed: ' + JSON.stringify(restore));
    }
    const definitions = poster.templateList();
    const ids = definitions.map(template => template.id);
    if (ids.length !== 11 || new Set(ids).size !== 11 || ids.some(id => !/^[A-Za-z][A-Za-z0-9]*$/.test(id))) {
      throw new Error('Expected eleven distinct actual template ids');
    }
    const photo = new Image();
    photo.src = illustration;
    await photo.decode();
    if (photo.naturalWidth !== 512 || photo.naturalHeight !== 341) throw new Error('Incorrect crop dimensions');
    const canvas = document.querySelector('canvas');
    const ctx = canvas.getContext('2d', { willReadFrequently: true });
    // 位图必须是产品的 .img/.w/.h wrapper。大图槽用同一张 AI 配图，小头像保持空槽。
    const images = {
      note: { img: photo, w: photo.naturalWidth, h: photo.naturalHeight },
      avatar: { img: null, w: 0, h: 0 }
    };
    if (options.hasNote !== !!images.note.img) throw new Error('hasNote/image mismatch');
    const supported = new Set(Object.keys(poster.RECIPE_OP_KEYS));
    const rasterMethods = new Set(['fillRect', 'fill', 'stroke', 'fillText', 'strokeText', 'drawImage']);
    const closingPunctuation = /^[，。、；：！？）》」』】〉]/;
    const cards = definitions.map(definition => {
      const { id } = definition;
      const injected = injectedRows.find(row => row.template_id === id);
      const expectedRecipe = injected ? injected.recipe : bundled[id];
      const recipe = poster.recipeOf(id);
      const recipeSource = poster.recipeSource(id);
      if (recipe !== expectedRecipe || recipe.id !== id || recipeSource !== (injected ? 'remote' : 'bundled')) {
        throw new Error('Recipe substitution or fallback: ' + id);
      }
      const recipeBefore = JSON.stringify(recipe);
      canvas.width = poster.W;
      canvas.height = 1;
      const plan = poster.planPoster(ctx, note, id, profile, 'zh', options);
      if (plan.fellBack || plan.template !== id) throw new Error('Template fallback: ' + id);
      if (![plan.width, plan.height].every(value => Number.isInteger(value) && value > 0 && value <= 4096)) {
        throw new Error('Invalid template dimensions: ' + id);
      }
      if (!plan.layers.length || plan.layers.some(layer => !supported.has(layer.k))) throw new Error('Incomplete layer plan: ' + id);
      freeze(plan.layers);
      const imageLayers = plan.layers.filter(layer => layer.k === 'image' || layer.k === 'avatar');
      const imageKeys = imageLayers.map(layer => layer.key || 'avatar');
      for (const layer of imageLayers) {
        const key = layer.key || 'avatar';
        if (key === 'avatar' && layer.k === 'avatar' && !profile.avatarPath) continue;
        if (key !== 'note' || images[key]?.img !== photo || !images[key].w || !images[key].h) {
          throw new Error('Missing image or forbidden avatar/QR layer: ' + id + ':' + key);
        }
      }
      const textLayers = plan.layers.filter(layer => layer.k === 'text');
      const texts = textLayers.map(layer => layer.lines.join(''));
      const summaryLayers = textLayers.filter(layer => layer.lines.join('').startsWith(note.summary.slice(0, 6)));
      const summaryLeadingPunctuation = summaryLayers.flatMap(layer => layer.lines.filter(line => closingPunctuation.test(line)));
      if (summaryLeadingPunctuation.length) throw new Error('Summary punctuation at line start: ' + id + ':' + summaryLeadingPunctuation.join('|'));
      // 不要求每套都有 slogan/摘要/全部要点：只核对该套原计划真正要画的文字。
      canvas.width = plan.width;
      canvas.height = plan.height;
      const layerAudit = [];
      let active = null;
      const instrumented = new Proxy(ctx, {
        get(target, key) {
          const value = Reflect.get(target, key, target);
          if (typeof value !== 'function') return value;
          return (...args) => {
            if (args.some(arg => typeof arg === 'number' && !Number.isFinite(arg))) throw new Error('Non-finite canvas argument: ' + id + ':' + String(key));
            if (key === 'drawImage' && args[0] !== photo) throw new Error('Unexpected bitmap: ' + id);
            const result = value.apply(target, args);
            if (active) {
              active.calls[key] = (active.calls[key] || 0) + 1;
              if (key === 'fillText') active.paintedText += String(args[0]);
            }
            return result;
          };
        },
        set(target, key, value) { return Reflect.set(target, key, value, target); }
      });
      // 仍是一次原生 paintLayers 调用，迭代器仅在每层前后取证，不增删、代画或修改图层。
      function* auditedLayers() {
        for (const [index, layer] of plan.layers.entries()) {
          const before = ctx.getImageData(0, 0, canvas.width, canvas.height).data;
          active = { index, kind: layer.k, calls: {}, paintedText: '' };
          yield layer;
          const after = ctx.getImageData(0, 0, canvas.width, canvas.height).data;
          let changedPixels = 0;
          for (let i = 0; i < after.length; i += 4) {
            if (after[i] !== before[i] || after[i + 1] !== before[i + 1] || after[i + 2] !== before[i + 2] || after[i + 3] !== before[i + 3]) changedPixels++;
          }
          const calls = active.calls;
          const rasterCalls = Object.entries(calls).reduce((sum, [key, count]) => sum + (rasterMethods.has(key) ? count : 0), 0);
          const pathOnly = (layer.k === 'rrect' || layer.k === 'circle') && !layer.fill && !layer.stroke;
          if (pathOnly) {
            // letter 原配方保留了一枚无 fill/stroke 的内框；它应执行路径但不产生像素，不能冒充实绘成功。
            const pathMethod = layer.k === 'rrect' ? 'roundRect' : 'arc';
            if (calls[pathMethod] !== 1 || rasterCalls || changedPixels) throw new Error('Unexpected path-only layer behavior: ' + id + ':' + index);
          } else if (!rasterCalls || !changedPixels) {
            throw new Error('Layer not actually painted: ' + id + ':' + index + ':' + layer.k);
          }
          if (['fill', 'grad', 'radial'].includes(layer.k) && calls.fillRect !== 1) throw new Error('Missing background draw: ' + id);
          if (layer.k === 'line' && calls.stroke !== 1) throw new Error('Missing line draw: ' + id);
          if (layer.k === 'rrect' || layer.k === 'circle') {
            if ((calls.fill || 0) !== (layer.fill ? 1 : 0) || (calls.stroke || 0) !== (layer.stroke ? 1 : 0)) throw new Error('Incomplete shape draw: ' + id);
          }
          if (layer.k === 'text' && (!calls.fillText || active.paintedText !== layer.lines.join(''))) throw new Error('Text layer not fully drawn: ' + id + ':' + index);
          const key = layer.key || 'avatar';
          const expectedImageDraws = (layer.k === 'image' || layer.k === 'avatar') && !!images[key]?.img ? 1 : 0;
          if ((calls.drawImage || 0) !== expectedImageDraws) throw new Error('Image draw count mismatch: ' + id + ':' + index);
          layerAudit.push({
            ...active, changedPixels, rasterCalls, imageDraws: calls.drawImage || 0,
            status: pathOnly ? 'original-path-only-no-pixels' : 'painted',
            ...(pathOnly ? { limitation: '原模板无 fill/stroke，只构建路径；保留原配方，未补画。' } : {})
          });
          active = null;
        }
      }
      poster.paintLayers(instrumented, auditedLayers(), images);
      if (layerAudit.length !== plan.layers.length || JSON.stringify(recipe) !== recipeBefore) throw new Error('Incomplete traversal or modified recipe: ' + id);
      const imageDraws = layerAudit.reduce((sum, layer) => sum + layer.imageDraws, 0);
      const expectedImageDraws = imageLayers.filter(layer => images[layer.key || 'avatar']?.img).length;
      if (imageDraws !== expectedImageDraws) throw new Error('Missing bitmap draw: ' + id);
      const pixels = ctx.getImageData(0, 0, canvas.width, canvas.height).data;
      if (!pixels.some((value, index) => index % 4 === 3 && value > 0)) throw new Error('Blank output: ' + id);
      const originalNoPaintLayers = layerAudit.filter(layer => layer.status !== 'painted').map(layer => layer.index);
      return {
        ...definition, template: plan.template, width: canvas.width, height: canvas.height,
        recipeSource, recipeOrigin: injected ? 'local-seed-via-memory-restore' : 'current-bundled-recipe',
        recipe, fellBack: false, noFallback: true, layers: plan.layers.length, layerPlan: plan.layers,
        imageKeys, imageDraws, expectedImageDraws, missingImages: [], unsupportedLayers: [],
        allPlannedLayersExecuted: true, allDrawableLayersPainted: true,
        allLayersChangedPixels: originalNoPaintLayers.length === 0, originalNoPaintLayers,
        textCoverage: {
          title: texts.includes(note.title), name: texts.includes(profile.name), slogan: texts.includes(profile.slogan),
          summary: summaryLayers.map(layer => layer.lines),
          completePoints: note.key_points.map(point => texts.includes(point)),
          summaryLeadingPunctuation
        },
        layerAudit, png: canvas.toDataURL('image/png').split(',')[1]
      };
    });
    if (forbiddenCalls.length) throw new Error('Platform/network service attempted: ' + forbiddenCalls.join(', '));
    return { cards, ids, bundledIds, injectedIds: injectedRows.map(row => row.template_id), restore, storageReads, storageKey: templates.STORE_KEY, forbiddenCalls };
  }, { sources, seedRows, illustration, note, profile, options });
  if (pageErrors.length || blockedRequests.length || observedRequests.length) throw new Error(JSON.stringify({ pageErrors, blockedRequests, observedRequests }));
  for (const [path, hash] of inputHashes) {
    if (sha256(readFileSync(path)) !== hash) throw new Error('Read-only input changed during render: ' + path);
  }
  const cards = result.cards.map(({ png, recipe, ...card }) => {
    const buffer = Buffer.from(png, 'base64');
    const output = writeAsset(`旅行卡-${card.id}.png`, buffer);
    return {
      ...card, recipePath: card.recipeSource === 'remote' ? seedPath : join(utils, 'posterRecipes.js'),
      recipeSha256: sha256(canonical(recipe)), output, sha256: sha256(buffer)
    };
  });
  const originalNoPaintLayers = cards.flatMap(card => card.originalNoPaintLayers.map(index => ({ id: card.id, index })));
  const report = {
    version, generatedAt: new Date().toISOString(), root, utils, ids: result.ids,
    method: `本地${version}产品代码实绘、林夏为虚构主角，非自动生成游记的实测证据。`,
    renderer: 'Unmodified local poster.js planPoster(strict) + paintLayers; desktop Chrome; 10 bundled recipes + 1 local seed recipe',
    browserVersion: browser.version(), options, note, profile,
    seed: {
      path: seedPath, sha256: sha256(seedBytes), ids: seedRows.map(row => row.template_id),
      contentHashes: Object.fromEntries(seedRows.map(row => [row.template_id, row.content_hash])),
      recipeHashAlgorithm: 'SHA-256 of recursively key-sorted compact UTF-8 JSON',
      allContentHashesVerified: true, bundledIds: result.bundledIds, injectedIds: result.injectedIds,
      storageKey: result.storageKey, entry: 'posterTemplates.restore -> poster.applyRemoteTemplates -> poster.templateList / recipeOf',
      restore: result.restore, storageReads: result.storageReads
    },
    illustration: {
      source: originalPath, kind: '本稿既有 AI 罗马图，不是实拍或真实人物数据', originalWidth: 1536, originalHeight: 1024,
      crop: [0, 0, 512, 341], transport: 'in-memory PNG data URL only', width: 512, height: 341,
      sourceSha256: sha256(originalBytes), sha256: sha256(illustrationBytes), sameBitmapForEveryImageLayer: true
    },
    validation: {
      allElevenRendered: cards.length === 11, allPlannedLayersExecuted: true, allDrawableLayersPainted: true,
      allLayersChangedPixels: originalNoPaintLayers.length === 0, originalNoPaintLayers,
      noFallback: true, missingImages: [], blockedRequests, observedRequests, pageErrors,
      forbiddenPlatformCalls: result.forbiddenCalls, readOnlyInputsUnchanged: true,
      evidence: '逐层记录原生 Canvas 操作、逐字核对 fillText、同源 drawImage 次数及前后实际变化像素；原配方路径空层单独披露。'
    },
    scope: {
      realNoteData: false, avatarProvided: false, qrProvided: false, liveRemoteRecipes: false,
      network: 'offline context + abort all routes + CSP + disabled network APIs + disabled host resolution; no live service access',
      writes: '仅本脚本和本稿素材/旅行卡-*；原图、裁图、产品源码与其他稿件不改',
      whitePaper16: '用户确认数；本任务未测试',
      layout: '保留十一套真实配方及原生无 QR 分支；不补齐模板本来不展示的摘要、slogan、要点或图片位。',
      limitations: [
        '桌面 Chrome 离线画布，不代表微信真机字体、导出外框或分享链路的验收。',
        '同一张 512×341 AI 配图按模板原规则裁切、放大、去色或套色；未提供真实头像或二维码。',
        ...(originalNoPaintLayers.length ? ['letter 原模板存在无 fill/stroke 的路径空层：已执行但没有像素，未修改模板以伪造全层实绘。'] : [])
      ]
    },
    scriptSha256: inputHashes.get(fileURLToPath(import.meta.url)), dependencies, cards
  };
  writeAsset('旅行卡-绘制记录.json', JSON.stringify(report, null, 2) + '\n');
  console.log(JSON.stringify({
    version, ids: result.ids, seedSha256: report.seed.sha256, restore: result.restore,
    cards: cards.map(({ id, width, height, layers, imageDraws, originalNoPaintLayers, fellBack }) => ({ id, width, height, layers, imageDraws, originalNoPaintLayers, fellBack })),
    validation: report.validation
  }, null, 2));
} finally {
  await browser.close();
}
