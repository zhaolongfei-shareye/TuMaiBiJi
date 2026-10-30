// 「来源那一格念什么」唯一的实现。
//
// 方案正本 `docs/方案-来源站点名.md` 第四节；②拍的是丙（站长 10-29 那句「只存网易」）：
// **有站名就只念站名**，一个字都不许多拼——不许在这条链的任何一处补「文章」「笔记」这类后缀。
// 没站名（认不出、或这一篇本来就不是从链接来的）才退到那六档通用文案。
//
// 为什么三处共用这一只（列表／详情／卡片绘制）：原来 `pages/index`、`pages/detail`、
// `utils/poster.js` 各抄了一份六支的表，漏一支就把英文原词（`share_import`／`preset`）
// 直接写上屏（站长 10-02 对 v18 时撞过同一型，10-25 第八轮审计 M17 又记了一次）。
// 现在站名这一级加进来，如果还是三处各写一遍，"哪一处忘了改"就变成屏上三种说法。
//
// 字段名仍叫 `source_type_label`（wxml 两处与卡片那几处都读它）：这一刀改的是
// "里面装的是哪句话"，不是名字。改名字要动的屏与判据比这条需求本身还多。
const { t } = require('./i18n.js')

// 服务端 `notes.source_type` 那六档（闭集，配额与后台来源分布都判它）。
const SOURCE_TYPE_KEYS = {
  wechat_article: 'sourceWechatArticle',
  web_article: 'sourceWebArticle',
  screenshot: 'sourceScreenshot',
  manual: 'sourceManual',
  // 转存别人分享的那一篇。这一支以前漏在表外：查不到键就把英文原文写上屏了。
  share_import: 'sourceShareImport',
  // §8.232 新用户出生那一篇（服务端 source_type='preset'）。
  preset: 'sourcePreset',
}

// 认不出键就念空串，不把英文原词写上屏（M17：不知道的时候宁可少念，不猜）。
function sourceLabelOf(note, lang) {
  const n = note || {}
  // 英文门优先读 `source_site_en`：那一栏空而主名有时回的就是主名（服务端 `Note.source_site_en`
  // 那一段已经这么兜过了），所以这里再兜一道只是"老服务端回体里没这一栏"的形状。
  const site = String(n.source_site || '').trim()
  const en = String(n.source_site_en || '').trim()
  const named = lang === 'en' ? (en || site) : (site || en)
  if (named) return named
  const key = SOURCE_TYPE_KEYS[n.source_type]
  return key ? t(key, lang) : ''
}

// 卡片竖排那一列放得下的字数（站长 10-30 拍乙：「切 10 字，末尾补省略号」）。
// 站名最长 24 字（后台那张人工表的上限），所以第 11 字起一定被切到——切了就要在屏上留个记号，
// 不许像原来那样无声腰斩。按码点数、不按 UTF-16 长度：出图引擎里那句 `len` 也是这个口径，
// 两边数不一样，卡片高度就会自己算错。
const VERT_MAX = 10
function clipVertLabel(text) {
  const chars = Array.from(String(text == null ? '' : text))
  return chars.length > VERT_MAX ? `${chars.slice(0, VERT_MAX).join('')}…` : chars.join('')
}

module.exports = { sourceLabelOf, SOURCE_TYPE_KEYS, clipVertLabel, VERT_MAX }
