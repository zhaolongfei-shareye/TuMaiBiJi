// 一把小助手：量之前先把界面语言钉成中文。
// 为什么要有它：`globalData.userInfo.language` 是登录时从服务端带回来的，任何一把真登录的
// 尺子（验-热启动归因.js）都会把测试号那一份 `en` 带进这次会话，于是之后每一把钉中文串的
// 尺子都凭空红一片——10-01 一天之内咬到三把（我的页、详情浮窗、形象四槽）。
// 只改内存里那一份，不写服务端；中途崩了留下的也是 zh，后面几把吃的正是中文。
module.exports = {
  read: (mp) => mp.evaluate(() => (getApp().globalData.userInfo || {}).language || 'zh'),
  pin: (mp, lang) => mp.evaluate((l) => {
    const a = getApp()
    a.globalData.userInfo = Object.assign({}, a.globalData.userInfo, { language: l })
    return a.globalData.userInfo.language
  }, lang),
}
