/**
 * 链接那一档的两个动作：判「这一串是不是链接」与「从一串话里把那一枚抽出来」。
 *
 * 为什么住在 utils 而不是页面里：这两条要能不连模拟器真跑（`docs/工具/验-链接框粘贴.js`
 * 直接 require 这一份），钉的是发货的那一截字节，不是在尺子里重抄一遍近似版。
 *
 * 「抽取」这一只是站长 10-29 那句需求（「提取链接，剪贴板自动删除非链接的内容，
 * 例如：谷歌Gemini，重夺AI第一 https://c.m.163.com/…，自动删除http前面的文字」）落下来的。
 * 他那一串的真名子不是"删除前面的字"而是**抽取**：前后都剥——那串尾巴上还粘着「，自动删除…」，
 * 只剥前面照样判坏。四条拍板过的口径：多枚取第一枚并说一句；参数一个不抹（`xsec_token`
 * 是取小红书正文的命根子，抹错一次就是抓回一篇空文）；裸域名不自动补协议（猜一个 https
 * 出来等于抓错站）；正在写的半截不许被顶掉。
 */

// 必须有协议头、主机名里要有顶级域、整串不能出现空白。
// 之前只判"以 http 开头且某处有个点"，`https://a.com 后面还有字` 和 `http:///a.b` 都能过，
// 到了服务端才失败，用户在卡里看到的是一句和输入对不上的错。
const LINK_RE = /^https?:\/\/[a-z0-9]([a-z0-9-]*[a-z0-9])?(\.[a-z0-9]([a-z0-9-]*[a-z0-9])?)+(:\d{1,5})?(\/[^\s]*)?$/i

function isLink(value) {
  const s = (value || '').trim()
  if (!s || /\s/.test(s)) return false
  return LINK_RE.test(s)
}

// 按 URL 的**合法字符集**吃，不按空格切：空格、中文标点、全角空格、引号都不在这个集合里
// （RFC 3986 里空格必须写成 %20），所以"吃到第一个非法字符就停"既不会截短真链接，
// 也不会把前后的句子带进来。
const LINK_FIND_RE = /https?:\/\/[A-Za-z0-9\-._~:/?#[\]@!$&'()*+,;=%]+/gi
// 句末那几个 ASCII 标点会被上面那一条一起吃进来（中文的「。，」不会，它们不在集合里）。
// 只剥这一小撮收尾的：`/`、`=`、`%`、`)` 一律留着——真链接会以它们结尾，而带括号那类地址
// （维基那种 `.../Foo_(bar)`）抹掉半个就把链接改断了。
const LINK_TRAIL_RE = /[.,;:!?'"]+$/

/** 一串话里有几枚**合格**链接，逐枚返回。`isLink` 那道滤是必须的：`https://a` 这种没写完
 *  的半截不算一枚，否则失焦那一条会把人正在打的字顶掉。 */
function findLinks(value) {
  const out = []
  const re = new RegExp(LINK_FIND_RE.source, 'gi')
  let m
  while ((m = re.exec(String(value || ''))) !== null) {
    const hit = m[0].replace(LINK_TRAIL_RE, '')
    if (hit && isLink(hit)) out.push(hit)
  }
  return out
}

/** 取第一枚，并带回"一共几枚"——页面只在 `count > 1` 时念那一句「取的是第一条链接」。
 *  抽不出就回空串：调用方原样留着那一串，不许悄悄吞掉剪贴板里的东西。 */
function extractLink(value) {
  const hits = findLinks(String(value || '').trim())
  return { link: hits.length ? hits[0] : '', count: hits.length }
}

module.exports = { LINK_RE, isLink, findLinks, extractLink }
