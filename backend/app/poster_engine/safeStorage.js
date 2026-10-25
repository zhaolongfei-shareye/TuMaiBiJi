// 本机存储（`wx.getStorageSync` / `setStorageSync` / `removeStorageSync`）在这一侧唯一的出口。
//
// 为什么要有这一只：那三个 API 是**会抛**的（存储写满、某一栏的数据坏掉、被系统清了一半）。
// 本仓早就自己认这一点——`utils/assetQueue.js`、`utils/person.js`、`utils/posterTemplates.js`
// 三把都各自包了 try。但 10-25 全面审计（M15）现数出工具层与 app.js 还剩三十来处裸调用，
// 咬人最重的一处在 `utils/mpAssets.js` 的 `serverBgPath()`：它在列表／创建／「我的」每次
// `onShow` 的路上，一抛就把整屏打死（它前面那句 setData 还没发出去）。所以这里收成一枚共用
// helper，工具层不再直接碰那三个 API，也不再三十个地方各写一个 try。
//
// 返回值口径（**照调用点原有的语义定，不另起一套规则**）：
//   · `read` 读不到时回 `''`——这正是微信对"本机没有这一栏"的原样返回，所以调用点那些
//     `if (v && ...)`／`Array.isArray(v) ? v : []`／`|| 'default'` 的判据走的仍是"没有这一栏"
//     那一支，业务含义一个字没改；
//   · `tryRead` 留给"读不到与读到空不能混为一谈"的调用点：默认值会让上层误判、而且误判的方向
//     是**把旧账覆盖掉／把文件删掉**的那几处（见 `utils/poster.js` 那三条清理链）；
//   · `write` / `remove` 只回布尔（true＝真落成了），坏在哪只留一行日志，不许把调用方卡住。

/** 读出那一栏；读不到（抛了）就回 `''` 或调用点指定的默认值。 */
function read(key, fallback) {
  const r = tryRead(key)
  if (r.ok) return r.value
  return fallback === undefined ? '' : fallback
}

/** 同 `read`，但把"到底读没读到"一并交回：坏掉的读不许被当成"这一栏是空的"用下去。 */
function tryRead(key) {
  try {
    return { ok: true, value: wx.getStorageSync(key) }
  } catch (e) {
    console.warn('本机存储没读到（这一栏当作没有）:', key, e)
    return { ok: false, value: '' }
  }
}

/** 写一栏；写不进（配额满／被系统清）只回 false 加一行日志。 */
function write(key, value) {
  try {
    wx.setStorageSync(key, value)
    return true
  } catch (e) {
    console.warn('本机存储没写进:', key, e)
    return false
  }
}

/** 清一栏；清不掉只回 false 加一行日志（没这一栏本来就不算失败，微信那边 remove 也不抛）。 */
function remove(key) {
  try {
    wx.removeStorageSync(key)
    return true
  } catch (e) {
    console.warn('本机存储没清掉:', key, e)
    return false
  }
}

module.exports = { read, tryRead, write, remove }
