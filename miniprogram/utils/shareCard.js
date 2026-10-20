// 「把小程序推荐给别人」这一张卡的载荷正本。
// 现在有两个入口点它：首屏那枚黄色横条「推荐好友使用」与「我的」页那行「推荐图麦」。
// 三格（标题／落地路径／封面）必须一处定义、两处消费——这两枚要是各说一套，
// 同一个 App 从两个地方转出去会是两张不同的卡，而这种漂移在屏上看不出来。
// 封面那张图的字节账、以及「越线或路径写错时微信不报错、只静默退回截当前页」那条坑，
// 记在 pages/me/me.js 那一段注释里；这一枚由 docs/工具/验-我的页改版-真跑.js
// 真调一次 onShareAppMessage 来钉。
const { t } = require('./i18n.js')

const SHARE_IMAGE = '/assets/share-card.jpg'

// 邀请人 id 拿不到就退化成裸路径：归因失败不该让分享本身点不动。
function appSharePayload(lang, inviter) {
  return {
    title: t('shareCardTitle', lang),
    path: `/pages/create/create${inviter ? `?inviter=${inviter}` : ''}`,
    imageUrl: SHARE_IMAGE,
  }
}

module.exports = { appSharePayload, SHARE_IMAGE }
