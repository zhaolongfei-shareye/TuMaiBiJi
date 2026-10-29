/* 本机静态＋纯函数：来源那一格到底念哪一句。
 *
 * 这一格今天从"六档通用文案"变成"有站名就只念站名"（方案 docs/方案-来源站点名.md 第四节，
 * ②拍丙＝站长 10-29 那句「只存网易」）。三件事只能靠这一把判：
 * ① **不许拼后缀**：站名逐字相等才算对，「网易文章」这种"看起来更完整"的输出要当场红；
 * ② **一份实现**：列表／详情／卡片绘制三处今天各自抄过一张六支的表（漏一支就把
 *    `share_import` 这种英文原词写上屏，站长 10-02 撞过、10-25 审计 M17 又记一次），
 *    这一刀把三份并成 `utils/sourceLabel.js` 一份——静态扫"还有没有第二份表"；
 * ③ 没站名那一路一字没动：六档通用文案逐档还在、还念原来那句。
 *
 * 跑法（本机，仓库根）：node docs/工具/验-来源那一格念什么.js
 */
const { resolve } = require('node:path');
const { readFileSync } = require('node:fs');
const { sourceLabelOf, SOURCE_TYPE_KEYS } = require(resolve('miniprogram/utils/sourceLabel.js'));
const { t } = require(resolve('miniprogram/utils/i18n.js'));

const ok = [], bad = [];
const ck = (name, cond, got) => {
  console.log(`  ${cond ? '✓' : '✗'} ${name}${got !== undefined ? `　→ ${JSON.stringify(got)}` : ''}`);
  (cond ? ok : bad).push(name);
};

const SITE = { source_type: 'web_article', source_site: '网易', source_site_en: 'NetEase' };

// ① 有站名：两门各念各的，且**逐字等于**表里那两个字（任何拼接都会在这一条红）
ck('中文门有站名＝只念站名', sourceLabelOf(SITE, 'zh') === '网易', sourceLabelOf(SITE, 'zh'));
ck('英文门有站名＝只念英文那格', sourceLabelOf(SITE, 'en') === 'NetEase', sourceLabelOf(SITE, 'en'));
ck('反向：中文门不许念出英文那格', sourceLabelOf(SITE, 'zh') !== 'NetEase');
ck('只给了主名（页面自报与模型那两级就是这个形状）＝两门都念主名',
  sourceLabelOf({ source_type: 'manual', source_site: '人民网' }, 'en') === '人民网',
  sourceLabelOf({ source_type: 'manual', source_site: '人民网' }, 'en'));
ck('只给了英文那格时中文门也念它（不退回通用那句）',
  sourceLabelOf({ source_type: 'manual', source_site_en: 'GitHub' }, 'zh') === 'GitHub');
ck('站名两端有空白＝trim 之后原样，不截断不补字',
  sourceLabelOf({ source_type: 'manual', source_site: '  小红书  ' }, 'zh') === '小红书');
ck('后缀禁：屏上那一句里不许出现「文章／笔记／贴图／链接／平台／网站」',
  !/文章|笔记|贴图|链接|平台|网站/.test(sourceLabelOf(SITE, 'zh') + sourceLabelOf(SITE, 'en')),
  sourceLabelOf(SITE, 'zh') + '｜' + sourceLabelOf(SITE, 'en'));
// 这一条是"半空"那一型：只有空格串的站名不算名字（服务端 snapshot_fields 不会写这种，
// 但老行、手工 SQL 写进去的行都可能长这样，此时必须退到通用那句而不是画一个空格）。
ck('站名是空串或全是空格＝不算有站名，退到通用那一句',
  sourceLabelOf({ source_type: 'web_article', source_site: '   ' }, 'zh') === t('sourceWebArticle', 'zh'),
  sourceLabelOf({ source_type: 'web_article', source_site: '   ' }, 'zh'));

// ③ 没站名那一路：六档逐档还在，念的还是字典里那一句（键丢了会念 undefined 上屏）
// 那六句是**现网字典里读出来的**（`utils/i18n.js` 的 sourceScreenshot／sourceShareImport），
// 不是我照记忆写的——这一把的用处之一就是"改了实现、通用那一路一字没动"，
// 期望值本身写错就等于拿一句假话当尺子。
const GENERIC = {
  wechat_article: '公众号文章', web_article: '网页文章', screenshot: '截图识别',
  manual: '亲自撰写', share_import: '转存自分享', preset: '帮助文档',
};
Object.keys(GENERIC).forEach((type) => {
  const zh = sourceLabelOf({ source_type: type }, 'zh');
  ck(`没站名时 ${type} 念「${GENERIC[type]}」（与 i18n 那一句逐字相同）`,
    zh === GENERIC[type] && zh === t(SOURCE_TYPE_KEYS[type], 'zh'), zh);
});
ck('六档的英文门也逐档有字（不许有一档切过去是空的）',
  Object.keys(GENERIC).every((k) => sourceLabelOf({ source_type: k }, 'en')),
  Object.keys(GENERIC).map((k) => sourceLabelOf({ source_type: k }, 'en')).join('｜'));
ck('认不出的 source_type 念空串，不把英文原词写上屏（M17）',
  sourceLabelOf({ source_type: 'seventh_kind' }, 'zh') === '' &&
  sourceLabelOf({ source_type: 'share_import' }, 'zh') !== 'share_import',
  sourceLabelOf({ source_type: 'seventh_kind' }, 'zh'));
ck('整篇什么都没有（空对象）也念空串，不抛', sourceLabelOf({}, 'zh') === '');

// ② 一份实现：三处都改成吃 utils/sourceLabel.js，且**不许再自带六支表**
const pages = {
  'pages/index/index.js': resolve('miniprogram/pages/index/index.js'),
  'pages/detail/detail.js': resolve('miniprogram/pages/detail/detail.js'),
  'utils/poster.js': resolve('miniprogram/utils/poster.js'),
};
Object.keys(pages).forEach((name) => {
  const src = readFileSync(pages[name], 'utf8');
  ck(`${name} 走的是那一份实现`, /require\(['"]\.\.?\/.*sourceLabel\.js['"]\)/.test(src) &&
    /sourceLabelOf\(/.test(src), name);
  ck(`${name} 里不再抄第二张六支表`, src.indexOf("wechat_article: 'sourceWechatArticle'") < 0);
});
const util = readFileSync(resolve('miniprogram/utils/sourceLabel.js'), 'utf8');
ck('那一处实现里六档一支都不少',
  Object.keys(GENERIC).every((k) => util.indexOf(k + ':') >= 0), Object.keys(GENERIC).length + ' 支');

console.log(`\n结论：${ok.length} 条过，${bad.length} 条红`);
if (bad.length) console.log('红的：\n - ' + bad.join('\n - '));
process.exit(bad.length ? 1 : 0);
