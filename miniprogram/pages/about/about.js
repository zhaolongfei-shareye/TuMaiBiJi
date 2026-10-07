const { t, texts } = require('../../utils/i18n.js')
const { toneStyle } = require('../../utils/palette.js')

const { CONTACT_EMAIL } = require('../../utils/contact.js')
// 版本号、官网、公众号、介绍语——「我的」那一页现在也要说这几句，
// 所以它们搬到 utils/appInfo.js 里只留一份。
const { VERSION, SITE, OFFICIAL_ACCOUNT, introLead } = require('../../utils/appInfo.js')

// 每条都写清"做什么"和"什么情况下做不到"。宁可写边界，不堆形容词：
// 这些句子最后都要能拿代码对上，读者照着做不会撞墙。
// tone 不按下标排，而是钉在语义上：链接和截图这两块的颜色必须和新建页那两张卡一致，
// 同一个功能在全应用只有一张脸。
//
// 中英两份并列（站长 10-01 要求补齐英文缺口）。两份**条目数必须相等**，
// `验-中英文缺口.js` 会盯着这一条——错位会让英文态底下空出一格。
// 英文侧的 mark 只用一个词（Link/Shot/Sort/Card/Skin）：左侧那块只有 96rpx 宽，
// 字 26rpx/800，两个词就折行。
const FEATURES_ZH = [
  {
    mark: '链接',
    tone: 1,
    title: '链接转笔记',
    body: '粘贴公众号文章或网页链接，服务器抓取正文后整理成摘要、核心要点和标签，多数在十几秒内完成。需要是公开可访问的 http/https 链接；要登录、有付费墙或屏蔽抓取的页面会直接告诉你失败，不会塞半条空笔记进列表。',
  },
  {
    mark: '截图',
    tone: 2,
    title: '截图转笔记',
    body: '拍照或从相册选，一次最多 9 张。文字识别在我们自己的服务器上完成，不交给第三方 OCR 接口。支持 JPG 和 PNG；iPhone 相机默认拍的 HEIC 请先在「设置 → 相机 → 格式」里改成「兼容性最好」。经过微信转发的图片会丢拍摄参数，这类图只认画面里的字。',
  },
  {
    mark: '整理',
    tone: 3,
    title: '分类、置顶与搜索',
    body: '笔记可归到自建分类、可置顶、可打标签。搜索会同时命中标题、摘要、正文和抓下来的原文。在编辑页点任意一个标签就能把它换到第一位，列表和卡片图左侧色块上显示的就是第一个标签。',
  },
  {
    mark: '归档',
    tone: 4,
    title: '生成笔记卡片图',
    body: '一条笔记可以存成一张竖长卡片图，高度按内容排：短笔记末尾不留一大块空白，长笔记也不砍要点。卡片图上带着这一条自己的小程序码，扫开就是它本身。用途是存档和随时调用：插进任意文章里当配图，之后从那张图就能调回来看；也能离线打印出来，贴在纸质笔记、手账或旅游攻略上。',
  },
  {
    mark: '外观',
    tone: 0,
    title: '四张壁纸',
    body: '四张都是浅色的整套色阶：象牙、天青、樱落、雨雾。换一张，页面底、卡片、按钮和左侧那块方块会一起收进同一支色相，只按深浅分层，导航条也跟着换。象牙、天青、樱落这三张只存在当前这台设备上，雨雾那张跟着账号走。界面语言在新建页标题右边切（中 / EN），切完当场就变。',
  },
]

const FEATURES_EN = [
  {
    mark: 'Link',
    tone: 1,
    title: 'Link to note',
    body: 'Paste a WeChat article or any web link. The server pulls the page and writes back a summary, key points and tags, usually within a few dozen seconds. The link has to be publicly reachable over http/https; pages behind a login, a paywall or an anti-crawler block fail plainly instead of dropping an empty note into your list.',
  },
  {
    mark: 'Shot',
    tone: 2,
    title: 'Screenshot to note',
    body: 'Take a photo or pick from the album, up to 9 at a time. Text recognition runs on our own server, not through a third-party OCR API. JPG and PNG are supported; HEIC from the iPhone camera needs Settings > Camera > Formats > Most Compatible first. Images forwarded through WeChat lose their capture metadata, so for those only the text on screen is read.',
  },
  {
    mark: 'Sort',
    tone: 3,
    title: 'Categories, pinning and search',
    body: 'Notes can be filed into your own categories, pinned and tagged. Search hits the title, summary, body text and the captured original. Tapping any tag on the edit page moves it to the front; the colour block on the left of a list row or card shows that first tag.',
  },
  {
    mark: 'Card',
    tone: 4,
    title: 'Export a note card',
    body: 'One note can be saved as a tall card image whose height follows the content: short notes get no blank block at the end, long ones keep every point. Each card carries its own mini-program code that opens exactly that note. Use it to archive and reuse: drop it into any article as a figure and come back to the note from that image later, or print it offline and paste it into a paper notebook, journal or travel plan.',
  },
  {
    mark: 'Skin',
    tone: 0,
    title: 'Four wallpapers',
    body: 'All four are light tint ramps: Ivory, Celadon, Blush and Mist. Switching one pulls the page, cards, buttons and the colour block on the left into a single hue that differs only in lightness, and the nav bar follows. The first three live on this phone only; Mist follows your account. The interface language switches to the right of the title on the new-note page, and applies immediately.',
  },
]

// 隐私这一栏同样中英并列，十条一小节，两份顺序一一对应。
const PRIVACY_ZH = [
  {
    title: '我们收集什么',
    lines: [
      '微信登录标识（OpenID）：只用来把笔记归到你名下，不下发给客户端，也不出现在任何页面里。',
      '你自己存进来的内容：标题、摘要、要点、标签、分类、来源链接，以及截图识别出的文字。',
      '你在「卡片模板」里填的昵称：只在你主动生成分享图的那一刻传给服务器，用来在扫码页上显示「原创作者：某某」。不生成分享图，它就一直只存在这台手机里。',
      '你导入的截图：用来识别里面的文字，识别完这批图会按第 3 条那样存进我们的云存储一份，好让这篇笔记的图以后还看得到。',
      '不收集通讯录、位置、麦克风、设备标识和浏览记录。',
    ],
  },
  {
    title: '手机权限',
    lines: [
      '相机与相册：截图导入（拍照或选图）、给分享海报挑一张头像图、把生成的海报图存进相册时用到。海报头像和生成好的海报图都只存在这台手机里，不上传。不给权限也能正常看笔记和搜索。',
      '剪贴板：只有你点「粘贴」那颗按钮时才读一次，用来取你复制的链接；点「复制链接」时才会写入。',
      '权限随时能在手机设置里关掉，关掉后对应功能会明确提示，不会静默失败。',
    ],
  },
  {
    title: '你的截图怎么处理',
    lines: [
      '截图经 HTTPS 上传到我们自己的服务器识别文字，只在服务进程内存里暂存，识别完立刻丢弃。',
      '做识别的这台服务器不把图片写入磁盘、不存入数据库；超过 30 分钟没提交的暂存批次自动作废。',
      '保存成功的这批图另压一份小图，存进我们的云开发对象存储（腾讯云），用来在详情页把图原样读回来；删掉这篇笔记或注销账号时，云端那一份跟着删。',
      '识别出的文字和整理出的摘要会作为笔记内容保存下来——这是你用它存笔记的目的，不是额外收集。',
    ],
  },
  {
    title: '第三方与模型',
    lines: [
      '整理摘要和要点这一步会把文字交给腾讯混元大模型（经微信云开发调用），只传这一条笔记需要的文本。',
      '你粘贴的链接由我们的服务器直接抓取，不经过任何第三方解析或短链服务。',
      '小程序内没有广告、没有统计埋点、不接入第三方分享或推送 SDK。',
    ],
  },
  {
    title: '可见性与删除',
    lines: [
      '笔记默认只有你本人可见：接口按登录身份隔离，用别人的身份访问你的笔记会拿到 404。',
      '在笔记详情里删除，这条笔记的内容即被删除，卡片图上那个码扫出来也就空了。',
      '不想删掉内容、只想停止外泄：在详情里点「撤掉分享」，这一条的公开当场关掉，已经发出去的链接和海报上那个码都扫不开了；再分享会换一个全新链接，旧的不会复活。',
      '别人扫码看到这一条时，可以点「存到我的笔记」把公开页上的内容（标题、摘要、要点、标签、原文链接，以及你的昵称）抄进他自己的库。抄过去的那份就归他了，你之后撤掉分享或删掉笔记都不影响那一份；他那边会永久留一栏「转存来源」写着原创作者是谁、什么时候抄的，那一栏他改不掉。',
      '但已经存进相册、打印出去的图收不回来：任何拿到那张码的人都能扫到那一条笔记。生成卡片图之前，请确认它的内容可以给别人看。',
    ],
  },
  {
    title: '服务器与日志',
    lines: [
      '服务部署在我们自己的服务器上，全站 HTTPS 传输。',
      '服务器记录常规访问日志（请求路径、时间、来源 IP）用于排障和限流，不记录笔记正文。',
    ],
  },
  {
    title: '账号与笔记',
    lines: [
      '笔记不限量：存多少条由你自己决定，删掉哪条只影响那一条本身。',
      '邀请关系只存两个序号——谁邀请了谁、这笔奖励来自哪一篇笔记，不读取昵称、头像，也不调用任何用户信息接口；它只用于结这一笔，不用于推送或营销。',
      '「我的 → 注销账号」可以随时自助注销，两道确认后删除名下全部笔记、分类和已生成的分享链接，账号本身一起删除，无法恢复。',
      '不想全删也可以逐条删除笔记，删除后无法恢复。',
    ],
  },
  {
    title: '未成年人',
    lines: ['本服务面向所有年龄段用户。若你是未成年人，请在监护人指导下使用。'],
  },
  {
    title: '条款更新',
    lines: ['我们可能适时更新本指引，重大变更会在小程序内公告。继续使用即表示接受更新后的条款。'],
  },
  {
    title: '联系我们',
    lines: ['对本指引有任何疑问，用反馈邮箱或公众号联系我们，两个都在「介绍」这一栏，点一下就能复制。'],
  },
]

const PRIVACY_EN = [
  {
    title: 'What we collect',
    lines: [
      'WeChat login id (OpenID): used only to put your notes under your account. It is never sent to the client and appears on no page.',
      'What you save yourself: title, summary, key points, tags, category, source link, and the text recognised from your screenshots.',
      'The nickname you type in "Card templates": it reaches the server only at the moment you generate a share image, so the scan page can show "Original author: …". Until you generate one it stays on this phone.',
      'Screenshots you import: we read the text inside them, and the batch is then kept as item 3 describes so the images stay visible in that note.',
      'We do not collect contacts, location, microphone, device identifiers or browsing history.',
    ],
  },
  {
    title: 'Device permissions',
    lines: [
      'Camera and photo library: used for screenshot import (shoot or pick), for choosing an avatar image for the share poster, and for saving a generated poster into your album. The poster avatar and the finished poster stay on this phone and are never uploaded. Reading and searching notes works fine without these.',
      'Clipboard: read once only when you tap the "Paste" button, to take the link you copied; written to only when you tap "Copy link".',
      'You can revoke any permission in phone settings at any time. The matching feature then says so clearly instead of failing silently.',
    ],
  },
  {
    title: 'How your screenshots are handled',
    lines: [
      'Screenshots are uploaded to our own server over HTTPS to read their text, held only in the running process memory, and discarded immediately after recognition.',
      'That recognition server never writes images to disk or stores them in the database; any staging batch left unsubmitted for more than 30 minutes is dropped.',
      'Images from a note you saved are also compressed and stored in our CloudBase object storage (Tencent Cloud) so the note can show them again later; deleting that note, or your account, deletes the cloud copies.',
      'The recognised text and the summary built from it are saved as note content — that is the purpose of the product, not extra collection.',
    ],
  },
  {
    title: 'Third parties and models',
    lines: [
      'Turning text into a summary and key points sends that text to Tencent Hunyuan LLM (called through WeChat CloudBase), and only the text this one note needs.',
      'Links you paste are fetched directly by our server, with no third-party parser or short-link service in between.',
      'The mini-program has no ads, no analytics tracking, and no third-party share or push SDK.',
    ],
  },
  {
    title: 'Visibility and deletion',
    lines: [
      'Notes are private to you by default: the API isolates by logged-in identity, so another identity fetching your note gets a 404.',
      'Deleting a note from its detail page removes its content, and the code printed on its card image then leads nowhere.',
      'To stop exposure without deleting the content: tap "Revoke share" in the detail page. That note stops being public at once, and both the link already sent out and the code on the poster stop opening. Sharing again issues a brand-new link; the old one does not come back.',
      'Someone opening your shared note can tap "Save to my notes" and copy what the public page shows (title, summary, key points, tags, original link, and your nickname) into their own library. That copy becomes theirs: revoking the share or deleting the note later does not touch it. Their side keeps a permanent "Saved from" line naming the original author and when it was copied, and they cannot edit that line.',
      'But images already saved to an album or printed cannot be recalled: anyone holding that code can open that one note. Check that its content is OK to show others before generating a card image.',
    ],
  },
  {
    title: 'Server and logs',
    lines: [
      'The service runs on our own server and the whole site transfers over HTTPS.',
      'The server keeps ordinary access logs (request path, time, source IP) for troubleshooting and rate limiting; note bodies are not logged.',
    ],
  },
  {
    title: 'Account and notes',
    lines: [
      'Notes are unlimited: how many you keep is your call, and deleting one affects only that one.',
      'Referral records store two ids only — who invited whom, and which note the reward came from. No nickname or avatar is read and no user-info API is called; it exists solely to settle that one credit, never for push or marketing.',
      '"Me → Delete account" is self-service at any time. After two confirmations it deletes every note, category and generated share link under your account, and the account itself, with no way back.',
      'You can also delete notes one by one instead; those are unrecoverable too.',
    ],
  },
  {
    title: 'Minors',
    lines: ['This service is for users of all ages. If you are a minor, please use it under a guardian\'s guidance.'],
  },
  {
    title: 'Changes to this notice',
    lines: ['We may update this notice from time to time; material changes will be announced inside the mini-program. Keeping on using it means accepting the updated terms.'],
  },
  {
    title: 'Contact us',
    lines: ['Questions about this notice: reach us by the feedback email or the official account — both are in the "Intro" tab, one tap copies either.'],
  },
]

/** 一整个页面的内容按语言算出来。色块仍由 toneStyle 现算——
 *  淡雅两枚（象牙/天青）下它们要跟着换档，所以进页时得重算一次。 */
function content(lang, skin) {
  const feats = lang === 'en' ? FEATURES_EN : FEATURES_ZH
  const priv = lang === 'en' ? PRIVACY_EN : PRIVACY_ZH
  return {
    updatedAt: t('aboutUpdatedAt', lang),
    introLead: introLead(lang),
    infoRows: [
      { label: t('aboutVersionRow', lang), value: `v${VERSION}` },
      { label: t('officialSite', lang), value: SITE, copy: SITE },
      { label: t('aboutEntityRow', lang), value: t('aboutEntityValue', lang) },
      { label: t('feedbackEmail', lang), value: CONTACT_EMAIL, copy: CONTACT_EMAIL },
      { label: t('aboutAccountRow', lang), value: OFFICIAL_ACCOUNT, copy: OFFICIAL_ACCOUNT },
    ],
    // 左侧色块和首页/详情/新建页同一张色板，按语义取色，不存图
    features: feats.map((f) => Object.assign({}, f, { skin: skin(f.tone) })),
    privacy: priv,
  }
}

Page({
  data: Object.assign(
    { version: VERSION, themeClass: '', lang: 'zh', t: texts('zh'), tab: 'intro' },
    content('zh', toneStyle)
  ),

  onLoad() {
    const app = getApp()
    const lang = app.globalData.userInfo?.language || 'zh'
    this.setData(
      Object.assign(
        {
          lang,
          t: texts(lang),
          themeClass: app.applyTheme(app.getWallpaper()),
        },
        // 那五个色块在 data 字面量里算的是中文态（模块加载时主题还没落地），
        // 淡雅两枚下它们要跟着换档，所以进页时按当前主题重算。
        content(lang, toneStyle)
      )
    )
    app.setNavTitle('aboutApp', lang)
  },

  onTab(e) {
    const key = e.currentTarget.dataset.key
    if (key === this.data.tab) return
    this.setData({ tab: key })
    wx.pageScrollTo({ scrollTop: 0, duration: 120 })
  },

  onCopy(e) {
    const value = e.currentTarget.dataset.value
    if (!value) return
    wx.setClipboardData({
      data: value,
      success: () => {
        wx.showToast({ title: t('copied', this.data.lang), icon: 'success' })
      },
    })
  },
})
