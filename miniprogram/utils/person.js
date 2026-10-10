/**
 * 第一屏那个小人（站长 10-10 晚给的两张卡通 PNG）。
 *
 * 为什么单独一个文件：10-10 深夜他补了一条——"首页那个人物延续到笔记列表和卡片列表，
 * 放在框外面的左上角，首页是男的那里就是男的"。三处画的是同一个"当前人物"，
 * 键名／两张路径／谁在前谁在剪影这件事只能有一份真相，抄一遍就会漂。
 *
 * 只落本机、不落云端：他说的是"记住"，不是"换设备也要记住"，而多一个云端字段就要动
 * 后端 user_profiles 那套白名单与迁移，这一轮不为此开那条链。
 */
const KEY = 'homePerson'
const SRC = { girl: '/assets/ic-person.png', boy: '/assets/ic-person-alt.png' }

/** 存过就是存过的那一张，没存过（或存了个不认识的值）就是女那张＝默认。 */
function current() {
  let k = ''
  try { k = wx.getStorageSync(KEY) } catch (e) { k = '' }
  return SRC[k] ? k : 'girl'
}

function remember(k) {
  try { wx.setStorageSync(KEY, SRC[k] ? k : 'girl') } catch (e) { /* 写不进去只丢这一次记忆，不许冒泡打断换人 */ }
}

/** 另一张（画成右后方那枚淡灰剪影、也画到列表页框外那一位对面时用的那一张）。 */
function other(k) { return k === 'girl' ? 'boy' : 'girl' }

/** 页面 data 里那三位一次给全，别处不许自己拼路径。 */
function figure(key) {
  const k = SRC[key] ? key : current()
  return { personKey: k, personSrc: SRC[k], personAltSrc: SRC[other(k)] }
}

module.exports = { KEY, SRC, current, remember, other, figure }
