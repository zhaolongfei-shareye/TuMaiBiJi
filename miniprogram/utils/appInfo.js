/** 「我的」和「关于」两处都要说同一套话：版本号、官网、介绍语。
 *  以前版本号只写在 pages/about/about.js 里，「我的」这一版要把关于收进本页，
 *  两处各写一份迟早走样（这个号已经踩过三次"上传完才想起来改"），所以挪到这里，
 *  两边都读这一份，`验-关于页版本号.js` 也直接读这里当期望值。 */
const VERSION = '1.9.24'

// 官网地址以站点自己的 canonical 为准（curl 读到的 <link rel=canonical> 是不带 www 的那个）。
// 只能复制、点不开：web-view 组件个人主体用不了，小程序里打不开外部网页。
const SITE = 'agentsbin.cn'
const OFFICIAL_ACCOUNT = '杰克AI日记'

// 介绍语：关于页和「我的」的介绍卡说的是同一套话。
// 站长 10-01 晚排查中英文缺口时补的英文一份——原来只有中文，英文态这两张卡还是整段汉字。
const INTRO_LEADS = {
  zh: '图麦笔记做的事很窄：把看到的好东西变成能用的笔记。公众号文章、网页链接、手机截图丢进来，出来就是一条带摘要、要点和标签的笔记，之后能搜、能归类、能存成一张卡片图随时调用。',
  en: 'TumarkNote does one narrow thing: turn what you read into notes you can actually use. Drop in an article, a link, or a screenshot, and you get back a note with a summary, key points and tags — searchable, sortable, and savable as a share card whenever you need it.',
}

function introLead(lang) {
  return INTRO_LEADS[lang === 'en' ? 'en' : 'zh']
}

module.exports = { VERSION, SITE, OFFICIAL_ACCOUNT, introLead }
