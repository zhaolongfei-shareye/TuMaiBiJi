const i18n = {
  zh: {
    tabNotes: '笔记',
    // 首屏最上面那一行（站长 10-14 22:4x 逐字给的）。分隔符与空格照他写的样子，不自己改成「·」
    aiLine: '用 AI 帮你读懂一切：拍照 | 读图 | 翻译 | 提炼 | 分享',
    // 大标题拆两行、逗号去掉（他原话「"看到好内容"回行"随手记下来"」）。第二行为空＝只有一行，
    // 英文态就是这一档：他 10-14 23:0x 追「英文能否精简一点，不希望回行」，所以 en 只留一句。
    createHeading: '看到好内容',
    createHeading2: '随手记下来',
    tabCreate: '新建',
    tabMe: '我的',
    appName: '图麦笔记',
    navDetail: '笔记详情',
    navShare: '笔记卡片',
    navShareView: '分享详情',
    categories: '分类管理',
    wallpaper: '外观设置',
    fontSection: '界面字体',
    fontHint: '仅 iPhone / iPad 可选（这几款字体是苹果系统自带的），其他机型保持苹方。只影响这台设备上的界面文字，海报模板里的字体跟着模板走，不受这里影响',
    fontDemo: '看到好内容',
    fontDefault: '苹方（默认）',
    fontSong: '宋体',
    fontFang: '仿宋',
    fontKai: '楷体',
    wallpaperSection: '页面壁纸',
    wallpaperSubHint: '四枚都带整套色阶：页面底、卡底、左侧方块和墨色一起换',
    // 站长 10-04：点色块直接生效，"先试看、再点上面手机"那两步撤了，原来那两句提示跟着删。
    swatchHint: '点下面色块直接生效',
    inUse: '现在在用',
    /* ---------- 冒号与「关于」那一页的骨架（站长 10-01 晚排查中英文缺口）----------
       原来模板里把全角冒号硬拼在字典外（`{{t.authorLabel}}：xx`），英文态就印出 "Author："。
       冒号这一档跟着语言走：中文全角、英文半角带一个空格。
       「关于」三栏的名字、介绍那五行、隐私那一栏的领句和那五行信息位以前整块是硬编码中文。 */
    colon: '：',
    aboutTabIntro: '介绍',
    aboutTabFeatures: '功能',
    aboutTabPrivacy: '隐私',
    aboutPrivacyLead: '这一栏说清我们收集什么、你的截图经过哪里、以及怎么删掉。口径与提交给微信后台的《隐私保护指引》保持一致。',
    aboutUpdatedAtLabel: '最后更新时间',
    aboutUpdatedAt: '2026 年 9 月 22 日',
    aboutVersionRow: '当前版本',
    aboutEntityRow: '开发主体',
    aboutEntityValue: '个人开发者',
    aboutAccountRow: '公众号',
    sameWallpaper: '这一枚已经在用了',
    language: '语言设置',
    about: '关于图麦笔记',
    noNotes: '暂无笔记',
    importUrl: 'URL链接',
    // ➕ 那枚方格报的就是这一句：按下开的是"拍照或截图"两用的系统选择器。
    importScreenshot: '拍照或截图',
    writeNote: '亲自撰写',
    // 10-08 创建入口改版：条身展开后不再盖在面板顶上，而是整条让位给面板，
    // 所以"按模式换字"那三条（贴个链接 / 选了 N 张 / 拍照或截图）一起退了——收起态那一枚永远只说一句话。
    // 10-10 晚收起态从纸白胶囊换成左块人物（效果图 PNG图标.png），键名留着不动，
    // 中文改成块上那三个字；英文本来就是同一句「Jot it down」，一个字没动。
    barIdle: '记下来',
    // 「返回」这一枚 10-10 深夜同时上三个位置：创建页面板外那行右边、笔记列表与笔记卡片
    // 右上角（那两处原来分别写着「点空白处收起」和「点一下展开」）。他原话
    // 「这样每页右上角体验一致性」——所以是一个键，不是三句各写一遍。
    back: '返回',
    // 左块右后方那枚淡灰剪影的读屏名字（屏上没有这行字，只有点得中它的人才需要）。
    personSwap: '换成另一个人',
    // 三个模式标签。原来的四档（直接写/拍照/相册/链接）并成三档：相册不再是一个模式，
    // 它是「照片」那一态左边那枚小圆；标签行只有三枚才放得下中间那枚大快门。
    modePhoto: '照片',
    modeWrite: '文字',
    modeUrl: '链接',
    homeBgSwap: '换背景',
    // 「换心情」＝切那一档彩色毛玻璃（站长 10-14 点的名）。三个字，与旁边两枚同档。
    moodSwap: '换心情',
    // 「换背景」左边那一枚：点一下换一档深浅（纯白 → 25% → 50% → 回纯白）。
    // 英文侧跟着「Change photo」那档祈使语气写，别直译成 "Brightness" 那种名词堆。
    bgDimLabel: '调亮度',
    // 横条上面那一行轮播 Tips（站长 10-01 晚）。冒号那档跟着语言走：
    // 中文用全角「：」，英文用半角「: 」，别把全角冒号硬贴到英文句子上。
    tipsPrefix: 'Tips：',
    // 六句全是新串（10-01 那轮现网字典里一句都没有），每句都控制在 24 个汉字以内：
    // 可用宽 = 750 − 24×2（页边）− 48（空两格）= 654rpx，24rpx 字号下放得下 27 个汉字，
    // 所以一句都不会折行。句子按"新用户第一眼用得上的"排序，拍照提炼排最前。
    tips: [
      '拍照或截图存进来，会自动提炼成要点',
      '贴一个公众号链接，长文读成三句话',
      '分享时可选卡片模板，换套版式再发出去',
      '笔记卡片可以「分享」，直接发到微信',
      '设了密码的那一格是私密，锁着不发正文',
      '外观里能换整套配色，点一下就生效',
    ],
    title: '标题',
    summary: '摘要',
    save: '保存',
    cancel: '取消',
    delete: '删除',
    search: '搜索笔记',
    notesHeading: '我的笔记',
    // 首页右上角那一列的小字。原来三列（笔记/分享/种草），10-04 站长拍板把后两列废掉：
    // 分享与种草那两屏本就没做，服务端那两个字段一起撤了，所以这里只留「笔记」一串。
    // 10-10 晚第一屏换成三块，右两枚各要一个计数标签：不借名片那一格的 slotCard——那一枚说的是
    // "这个槽当卡片用"，和"名下有几张图"是两件事。**10-18 站长「把首屏左下角的卡片和上面的数量，
    // 改为图片和数量」⇒ 下面那一枚念的是配图张数（`/api/user/storage-quota` 的 `user_count`），
    // 所以键跟着改成 statImages；旧的 statCards 在这屏之外没有第二个消费者，不留死键。**
    statNotes: '笔记',
    statImages: '图片',
    searchPh: '输入关键词',
    // v19 这一屏（站长 10-03 凌晨拍）：列表区顶上两枚 tab + X 式列表 + 卡片网格。
    // 第二枚那两个字不新造，仍读上面那串 navShare（现网原串「笔记卡片」）。
    // 跟着撤掉的五串一并删净：纸片墙 / 一行（那两枚切换 icon 没了）、
    // 置顶笔记 / 只看置顶（置顶这一档撤了）、已分享（列表里那枚色块撤了，
    // 公开状态只在详情窗下沿那句 sharedNow 里说）。
    tabList: '笔记列表',
    showMore: '显示更多',
    // 列表区右上那枚折叠口的两句（"点一下展开"／"点一下收起"）10-10 深夜一起退了：
    // 那一枚改成「返回」，展开那一态没有入口，`.sheet.ix-wide` 那条死样式也删了。
    // ⚠ 键名本身不许再出现在这一份文件里——`验-统一录入条` 有一条全仓扫退役键名的判据，写在注释里也红。
    allCategories: '全部',
    addCategory: '添加分类',
    categoryName: '分类名称',
    newCategory: '新建分类',
    editCategory: '编辑分类',
    deleteCategoryConfirm: '确定删除？相关笔记将变为未分类',
    // 面板内管理那三串（站长 10-17）。问话里那个 {n} 吃服务端 GET 带回的 `note_count`，
    // 读不到那一档就回落到上面那句现网话术——报一个猜的篇数比不报更坏。
    catAddPh: '新增分类，空格分开',
    // 站长 10-18 那两句「数量要做限制，最多 8 个包括私密分类」「数量超过就，输入框就提示要删除才能添加」
    // 「分类名称最多 4 个汉字」。满那一档是**输入框那一格的占位话**（不点也看得见），
    // 两句提示是在他按下完成／点空白那一步给的——不许静默吞掉他打的那几个字。
    catAddFullPh: '满 {max} 个，先删一个',
    catMaxToast: '分类最多 {max} 个，先删掉一个才能加',
    catNameLimit: '分类名最多 {cjk} 个汉字或 {latin} 个字母',
    // 私密那一格在管理态点下去不动（不给删、不给改名、不起拖），这句话挂在**那一枚上面**
    // （站长 10-18「显示在对应的元素上面」；手机上没有鼠标可"划"⇒ 挂在他按下去那一下）。
    catLockedPrivate: '私密分类固定在最后一格',
    // 站长 10-18 先要过一枚「新增」芯片（「增加一个新增入口」），同一夜又打回：
    // 「列表上怎么多了一个“新增”，有点多余啊，去掉」⇒ 那一串连同那一枚一起删净，
    // 新增那一条口只剩管理态里那枚输入框（留着这两行字是防下一次有人把它补回来）。
    catDelBody: '这一格里有 {n} 篇，删掉会归到未分类。',
    catSaveFailed: '没存上：{names}',
    noCategories: '暂无分类',
    // 「我的→设置」那几行右侧的小字说明（站长 10-05：「右侧要加小字说明，有哪些内容可以设置，
    // 也不要回行，提炼」）。放不放得下由 `docs/工具/探-小字不折行.js` 现量渲染盒子钉，改文案先跑它。
    // 站长 10-05 下午打回第一版：那四句写的是"里面装着什么零件"（名片与十套版式／六位数，可重置），
    // 不是"这行拿来干嘛"。改成每句给用途，而且不许写页面上已经不存在的东西——「壁纸与界面字体」
    // 就是这类错：界面字体那一排站长 09-26 就撤了（微信不认那些系统字体名，点了不换字），这句在承诺一个没有的功能。
    navProfileTip: '分享给朋友那张卡片上印什么',
    wallpaperTip: '整个界面的配色，挑顺眼的一套',
    categoriesTip: '笔记分成哪几类、按什么顺序排',
    privatePasswordTip: '锁住不想让别人看到的笔记',
    // 卡片模板页的形象图：四个槽，每槽自己带两枚开关——「卡片」= 画在卡片头像上，
    // 「背景」= 铺在首页与笔记页头部。两个角色各自单选，同一张可以两个都当。
    // 图只存在本机，不上传。
    navProfile: '卡片模板',
    slotCard: '卡片',
    slotBg: '背景',
    slotHint: '四个位置，先点 ＋ 放一张图进来。图下面两枚开关：「背景」铺在首页、也垫在笔记页头部，「卡片」画在卡片头像上。',
    slotHintFull: '四个位置都放满了。要换一张，先点哪张右上角的垃圾桶删掉一个。',
    slotDropTitle: '删掉这张',
    slotDropOk: '删掉',
    slotDropBody: '这张图会从这四个位置里去掉，只影响这台手机。',
    slotDropWasCard: '卡片头像会没有图。',
    // §8.231（10-14）：包内那张硬编码默认底图删掉了，删完不是「换回默认那张」，而是**没有背景图**、
    // 露出这一套壁纸的底色。这句是删图弹窗里给站长按的那一行，说错就是让用户按着一句假话做决定。
    slotDropWasBg: '首页和笔记页头部就没有背景图了，露出这一套壁纸的底色。',
    avatarSaveFailed: '这张图存不下来，再试一次',
    profileName: '名称',
    profileNamePh: '你的名字或昵称',
    profileSlogan: '一句话',
    profileSloganPh: '想印在图上的一句话，可不填',
    // 卡片模板页分区（站长 10-01 深夜：「保存」上移之后，下面那一块要读得出是成品样子，
    // 不是另一组还能设置的区域）。
    previewTitle: '卡片预览',
    previewHint: '下面是成品样子；改完记得点上面的保存。',
    profileSaved: '已保存',
    // 成品弹窗底下那枚「编辑个人名片」浮出来的一层（站长 10-03：出卡片这一屏要能就地改名片，
    // 不必绕去「我的→卡片模板」）。
    // 站长 10-18 01:3x 两句话：① 首页那枚「换背景」也拉起**同一层**，不必跳设置那一页
    // （「角色开关只留在那一页」那条从这一句起作废，那一页的两枚芯片他没下撤的命令、照旧在）；
    // ② 这一层的名字与两枚按钮：「卡片上的信息」改为**图片设置**，两枚按钮分别叫**背景**与**头像**。
    // 「头像」说的是"画在卡片头像上"那一个角色（=原来那枚「卡片」），指的内容没变，只是叫法。
    editCard: '编辑个人名片',
    cardInfo: '图片设置',
    slotAvatar: '头像',
    cardInfoHint: '这四张就是卡片上的人和名字。换一张点「更换」，不想要了点右上角的垃圾桶。',
    cardReplace: '更换',
    slotPos: '位置',
    // 海报上的码不设过期，所以"撤掉"是用户唯一能把已公开内容收回来的动作。
    sharedNow: '这篇已经公开，别人扫码能看',
    unshare: '撤掉分享',
    unshareBody: '已经发出去的那张海报会立刻扫不开。要再分享就重新生成一张码。',
    unshareConfirm: '撤掉',
    // 扫码落地页与"存到我的笔记"
    authorLabel: '原创作者',
    saveToMine: '存到我的笔记',
    savingMine: '正在存…',
    alreadySaved: '已存到我的笔记',
    savedToMine: '已经存进你的笔记了',
    saveMineFailed: '没存上，再试一次',
    importedFromLabel: '转存来源',
    importedFromHint: '来源信息会一直保留，不能编辑',
    importedTitle: '原笔记',
    importedAt: '转存于',
    sourceShareImport: '转存自分享',
    unshared: '已撤掉分享',
    unshareFailed: '撤掉失败，请稍后再试',
    posterUsing: '当前模板',
    selectWallpaper: '选择壁纸',
    wallpaperHint: '外观都在这里，换完当场生效，下次换手机也还在',
    selectLanguage: '选择语言',
    switched: '已切换',
    applied: '已应用',
    aboutApp: '关于应用',
    feedbackEmail: '反馈邮箱',
    privatePassword: '私密密码',
    privatePasswordHint: '请输入 6 位数字密码',
    privatePasswordTitle: '输入密码',
    privatePasswordOk: '确定',
    privatePasswordWrong: '密码不正确',
    // 连错撞上服务端 10/分钟那道限流时说的话。原来这一句屏上是 slowapi 那句英文原文
    // （那是写给日志看的），站长 10-12 拍 C5 甲：换成一句人话。
    privateRateLimited: '输得太快了，稍等一下再试',
    privatePasswordRequired: '请先在「我的」中设置私密密码',
    // 面板第二行只说这串密码干什么用——"6 位数字"输入框的占位符里已经有了，不重复。
    privatePasswordScene: '看私密笔记的内容时要输这串；归到私密的笔记不出笔记卡片。',
    privatePasswordSetHint: '已经设过了。要换一条就先重置，再输两遍设新的。',
    privatePasswordBack: '返回',
    privatePasswordNew: '新密码（6 位数字）',
    privatePasswordAgain: '再输一次',
    privatePasswordMismatch: '两次输入不一样，没保存',
    privatePasswordReset: '重置密码',
    privatePasswordResetBody: '重置后这串密码就作废，要重新输两遍设一条新的。',
    privatePasswordResetConfirm: '重置',
    privatePasswordResetDone: '已重置，请重新设置',
    privatePasswordSaved: '密码已设好',
    /* ---------- 「我的→设置」第五行：用户自己填的联系邮箱 ----------
       说明那行两句都不能省：「只有你本人看得到」是隐私口径，「清空并保存＝不再留」
       说的是这个动作真会清掉旧值。 */
    myEmail: '我的邮箱',
    myEmailUnset: '未填写',
    myEmailScene: '回信、更正、注销请求都靠它对上你的账号，只有你本人看得到。清空并保存＝不再留。',
    myEmailPlaceholder: 'name@example.com',
    myEmailSave: '保存',
    myEmailSaved: '已保存',
    myEmailCleared: '已清除',
    myEmailLoadFailed: '没读到现在填的邮箱，先不改，稍后再试',
    /* ---------- 「我的」改版 v10：药丸、留白区那两行、脑力值、重置那道生物识别门 ----------
       脑力值只读服务端 /api/user/quota 的 mind 一个数（=100 起始 + 加分），界面不参与算。 */
    pillSettings: '设置',
    pillAbout: '关于',
    meGreeting: '你好！我是图麦笔记',
    // 站长 10-01 晚：这一枚中文侧要有中文名「魅力」，英文侧继续叫 MIND。
    // 两个 tab 右上角那一档标签都是两格汉字（首页「笔记」、本页「魅力」），字距那条规则不用另写一份。
    brainScore: '魅力',
    officialSite: '产品官网',
    resetWithBioTitle: '重置密码',
    resetWithBioBody: '重置需要用这台手机的指纹或面容确认。识别通过后，再输两遍设一条新密码。',
    resetWithBioOk: '继续',
    bioUnavailable: '这台手机没有可用的指纹或面容，直接重置即可。',
    swipeHint: '左右滑换模板',
    grip: '点一下收起',
    slogan: '把图文，提炼成有用的干货',
    shareToFriend: '推荐图麦',
    // 魅力值规则（站长 10-01 深夜：MIND 那一行撤掉，换成这块一条一行）。
    // 三个数一个都不写死：读 /api/user/quota 的 base / reward_each / import_each，
    // 规则本体只在 backend/app/services/quota.py 那一处。
    mindRulesTitle: '魅力值规则',
    mindRuleNewUser: '新用户',
    mindRuleInvite: '推荐朋友使用',
    mindRuleSaved: '笔记被朋友种草',
    mindPlusN: '+{n}',
    shareCardTitle: '图麦笔记 | 把图文提炼成有用的干货',
    // 额度与注销：数字全部来自 /api/user/quota 和 /api/user/deactivate，模板里不写死。
    // 「新写作者 +10」那一串原来挂在分享那一行右边，10-02 撤了——同一个数只在上面
    // 那块魅力值规则里说一次（见 mindRuleInvite）。
    deleteAccount: '注销账号',
    deleteTitle: '注销账号',
    deleteStep1: '将删除你名下的 {notes} 条笔记和 {cats} 个分类，已生成的分享链接一并失效，账号本身同时注销。',
    deleteStep2: '删除后无法恢复，也找不回来。确定要注销吗？',
    deleteConfirm: '确认注销',
    deleteCancel: '再想想',
    deletingAccount: '正在注销...',
    accountDeleted: '账号已注销',
    deleteAccountFailed: '注销失败，请稍后再试',
    // 图片云空间（方案 §3.1.8）。那句说的是**全站**那一池 5GB，不是"你的空间"，
    // 所以不写"你已用"——写成用户的，他会以为删几篇笔记就能腾出来。
    storageSpace: '图片云空间',
    storageTip: '全站已用 {pct}%，满了之后新上传的图会存不下',
    tagOrderHint: '点任意标签把它换到第一位，列表色块上显示的就是第一个标签',
    copied: '已复制',
    loading: '加载中...',
    edit: '编辑',
    confirm: '确定',
    loadFailed: '加载失败',
    saveSucceeded: '保存成功',
    updateSucceeded: '更新成功',
    saveFailed: '保存失败，请重试',
    deleteSucceeded: '已删除',
    deleteFailed: '删除失败',
    deleting: '删除中...',
    operationFailed: '操作失败',
    confirmDelete: '确认删除',
    cannotRestore: '删除后无法恢复',
    linkCopied: '链接已复制',
    summaryLabel: '摘要',
    // 详情页那一排缩略图的栏名。不叫"原始图片"：存下来的是压过的那一张（长边 1920），
    // 叫"原始"会让人以为拿回来的是相机里那份原图。
    shotsLabel: '配图',
    // 外链贴图随笔记存档那两句实话（方案 docs/方案-公众号贴图随笔记存档.md §八.4／§八.11）：
    // 「被上限截了」与「有几张没存上」各一句，谁也不替谁兜底——合成一句就必然有一边是假话。
    shotsTruncated: '这篇原文有 {n} 张图，只留下了前 {k} 张。',
    shotsPartlyFailed: '有 {n} 张图没能存下来。',
    // 详情窗那一行三枚按钮中间那一枚（站长 10-17 深夜「在详情页下方，编辑和删除中间增加一按钮，
    // 分享笔记，点击切换卡片大图窗口」，站长 10-18 凌晨又改口：「分享笔记，改为"分享"」）。
    // 四个字时是量过的：那一枚宽只有约 202rpx，多一个字就在 nowrap 那一行里折出去——现在两个字，更宽裕。
    shareNote: '分享',
    // 私密那一枚置灰时挂在按钮下面那一行的理由（他给的原话，一字没改：「私密笔记不支持分享」）。
    // 这句话进不了按钮（十个字 240rpx > 202rpx），所以位置在按钮下面。
    privateNoShare: '私密笔记不支持分享',
    // 站长 10-18「这类笔记，不能编辑（按钮置灰），不能分享，允许删除」——一句把三样都说清。
    presetHint: '帮助文档不能编辑、不能分享，可以删除',
    keyPoints: '核心要点',
    tagsLabel: '标签',
    sourceLink: '来源链接',
    // 站长 10-03 原话：链接点不开这件事要在窗里说一句，别让人以为是我们没做。
    linkHint: '链接无法直接打开，可复制链接在浏览器打开',
    originalContent: '原文内容',
    expand: '展开',
    collapse: '收起',
    editNote: '编辑笔记',
    titlePlaceholder: '输入笔记标题',
    summaryPlaceholder: '输入摘要内容...',
    keyPointsHint: '要点（每行一个）',
    keyPointsPlaceholder: '• 第一个要点\n• 第二个要点',
    tagsHint: '标签（逗号分隔）',
    tagsPlaceholder: '技术, 产品, 设计',
    categoryLabel: '分类',
    noCategory: '未分类',
    enterTitle: '请输入标题',
    saving: '保存中...',
    paste: '粘贴',
    pasteEmpty: '剪贴板里还没有链接',
    pasteFailed: '读不到剪贴板，麻烦长按输入框再粘',
    // 10-16 照片那一档那枚「粘贴」小圆专用（它落点不在输入框上，所以不能复用上面那两句）。
    // 平台事实：剪贴板里是图片时 getClipboardData 两个回调都不回来（实测六秒零回话），
    // 所以这一句要把"图片贴不进来"直说，不许糊成"剪贴板是空的"。
    pasteNoText: '剪贴板里读不出文字，图片贴不进来',
    pasteReadFail: '读不到剪贴板，麻烦换到链接或文字那一档再粘',
    clear: '清空',
    // 10-08：那排「清空 / 开始提炼」的按钮整排撤了，改成"右滑才开始提炼"那一枚长条。
    // 好处是他给的那张参考图说的——先滑过去，等于让用户把这一屏看清楚再动手。
    slideExtract: '右滑开始提炼',
    // 四步指引（guide1T…guide4D）10-08 整批撤掉：面板压到 500rpx 之后肚子里只剩
    // 「一个输入框或一横排小图 ＋ 一枚滑动条」，那份四步说明放不下了。教学这件事
    // 没有丢——横条上面那六句轮播 Tips 就是同一个用途（10-01 站长点名要的那一行）。
    busyExtract: '提炼中…',
    linkDesc: '公众号文章 / 网页链接',
    // 「直接写」那一档现在只留一个原文框（标题和归类挪到详情页「编辑」里改），
    // 所以这句不再是一行说明，而是原文框里的占位字：没输入时看得见，点进去就没了。
    manualDesc: '把原文贴在这里，摘要自动生成',
    noImagePicked: '没拿到图片，换一张或再试一次',
    pickFirst: '先选一张截图再开始',
    takePhoto: '拍照',
    fromAlbum: '相册',
    // 满 9 张还点 ➕：原来是静默截掉（选了没看见，界面上什么都不说），现在给一句吐司。
    // 张数从 create.js 的 MAX_SHOTS 拼进来，不在这个串里写死第二个 9。
    maxShots: '最多 {n} 张，先删一张再加',
    linkRule: '链接要以 http:// 或 https:// 开头',
    permCamera: '没拿到相机权限，点这里去设置',
    permAlbum: '没拿到相册权限，点这里去设置',
    pickFailed: '没能打开相机或相册，请再试一次',
    // 站长 10-04 要的这枚开关，叫法用他原话「原文翻译」，不改口。10-16 两刀落在同一句里：搬到「返回」同一行
    // ＋「默认是翻译，关闭就不翻译」⇒ 这一位现在**默认开**（`create.js` data 那一位，三档的请求都带上它）。
    // 开＝提炼出来的标题／摘要／要点／标签写成中文；关＝跟着原文的语言走。原文本身两种状态下都不动。
    origTranslate: '原文翻译',
    /* 名字旁边那句说明：站长 10-16 直接给了两态各自的文案，跟着这一位走（开一句、关一句），
       不再是一句两态共用的注释。原话照录，不改字、不缩句：
         开 → 「识别到外文自动翻译成中文」
         关 → 「已关闭自动翻译」
       ⚠ 这一档现在与「返回」同字号（`--fs-meta` 24rpx），比原来那档小字宽大一整档 ⇒ 宽度由
       `验-统一录入条` 中英各算一次钉住（放不下的是英文那句，折行＝红）。 */
    translateOn: '识别到外文自动翻译成中文',
    translateOff: '已关闭自动翻译',
    needBody: '原文还空着',
    extractSucceeded: '已存入笔记',
    extractFailed: '提取失败，请重试',
    ocrRecognizing: 'OCR 识别中...',
    generatingShare: '生成分享图...',
    generateFailed: '生成失败',
    saveToAlbum: '保存到相册',
    savedToAlbum: '已保存到相册',
    needAlbumPermission: '需要相册权限',
    permissionHint: '请在设置中允许访问相册',
    exportFailed: '导出失败',
    scanToView: '图麦笔记-扫码秒看',
    // 关掉二维码时，码位原地换成这两行纯文字（发第三方平台用）
    noQrMark: '微信搜「图麦笔记」',
    qrToggle: '带二维码',
    qrToggleHint: '发到微信以外的平台容易被屏蔽，可关掉只留文字',
    // 二维码药丸搬进主按钮之后，那行字要跟药丸一起说话（站长 10-03 第三稿）。
    // 两态刻意都六个字：切开关时居中那行不跳位，按钮里的字不会闪一下宽度。
    // 站长 10-05 连着打回两次，口径记全：① 第一版「纯分享图片，而非笔记原文」有歧义（读着像
    // "开着就是纯分享"，事实相反）；② 第二版只挂在"开着"这一态，他一开关注释就没了——**两态都得
    // 自带说明，一句讲清这一态对朋友是什么**。所以现在是：开着＝能扫码转存，关掉＝只有这张图。
    // 状态词本身保留（10-03 第三稿拍的是"那行字跟药丸一起说话"，说现在开着还是关着）。
    // 中英文都不许折行，宽度由 `docs/工具/探-小字不折行.js` 两态各量一遍钉住，改文案先跑它。
    qrOn: '开启二维码｜朋友扫码就能转存',
    qrOff: '关闭二维码｜只发这张图，扫不出原文',
    posterMake: '生成分享图',
    // 已生成态那枚通栏：把台账里这一张再发一次。后面那三项是站长 10-04 的原话，一字不改照抄上来；
    // 前面那一句他 10-18 凌晨改过两次口（「分享卡片」→「分享到」）。面板里实际给到哪几条落点由微信系统层
    // 决定（样式与文案都不给改），这一行只说"点它会拉起分享"。
    cardShare: '分享到：微信好友 / 朋友圈 / 公众号',
    // 大图底下左端那枚原来复用「取消」：站长 10-04 要它改成「查看笔记」，点了进这篇的详情页。
    // 收窗那两条口都留着（顶上「点一下收起」+ 点窗外那层遮罩），所以这一枚不必再兼"退出"。
    viewNote: '查看笔记',
    // 10-10 深夜站长点名要这一枚改口：「查看卡片大图界面中，右下角的'删除'，文字改为'删除分享图'」。
    // 同一排左边那枚是「查看笔记」，两个字与五个字并排不违和（两枚都是 flex:1，容器宽装得下）。
    // 英文跟着同一件东西走：这一屏"卡片/分享卡片"本来就是同一张图，不另起一个新词。
    cardDrop: '删除分享图',
    cardDropHint: '删除后可继续生成笔记卡片，已分享的依旧有效',
    cardDropOffline: '这会儿连不上服务器，那张卡片还留着',
    cardPrivateDropFail: '已存为私密，但那张卡片没删掉：',
    cardPrivateDropOffline: '已存为私密，但那张卡片这会儿没删掉',
    // 一篇只留一张：从详情页进笔记卡片页，这篇已经有卡片时给的那一句（10-07 他报的漏口）。
    // 说清"要干什么才有第二张"，不只说"不行"。
    cardOneOnly: '这篇已经有一张笔记卡片，删掉它才能再生成',
    // 补回来的那一张必须留痕（方案 §五："不写这句就是悄悄换了他的东西"）。live 那一档不写任何话。
    sourceWechatArticle: '公众号文章',
    sourceWebArticle: '网页文章',
    sourceScreenshot: '截图识别',
    sourceManual: '亲自撰写',
    // §8.232 新用户出生那一篇预置笔记的来源标签。`source_type` 是 'preset' 时读这一串。
    // 10-18 站长把它改念「帮助文档」（原话「官方预置，变成"帮助文档"」）——只改称呼，不新增分类格。
    sourcePreset: '帮助文档',
    addCategoryPrompt: '请输入分类名',
    nameRequired: '名称不能为空',
    adding: '添加中...',
    added: '已添加',
    addFailed: '添加失败',
    updateFailed: '更新失败',
    sortFailed: '排序失败',
    noCategoriesHint: '点击下方按钮添加第一个分类',
    addCategoryBtn: '添加分类',
    applying: '应用中...',
    setFailed: '设置失败',
    switching: '切换中...',
    switchFailed: '切换失败',
    copyright: '© 2026 图麦笔记 All Rights Reserved',
    invalidShare: '无效的分享链接',
    shareExpired: '这篇笔记的分享已关闭',
    sharedNote: '分享笔记',
    fromTuMaiBiJi: '来自图麦笔记',
    taskProcessing: '正在处理...',
    taskFailed: '处理失败，请重试',
    taskTimeout: '处理超时，请稍后在笔记列表查看',
  },
  en: {
    tabNotes: 'Notes',
    tabCreate: 'Create',
    // 与中文那一档同键（缺一份＝英文态那行是空白，`验-五档彩色玻璃` 有一条专门钉中英两份都在）。
    // 一句放得下，故 createHeading2 留空＝英文不回行（站长 10-14 23:0x「英文能否精简一点，不希望回行」）。
    aiLine: 'AI reads it all: Shoot | Scan | Translate | Distill | Share',
    createHeading: 'Save what matters',
    createHeading2: '',
    tabMe: 'Me',
    appName: 'TumarkNote',
    navDetail: 'Note detail',
    navShare: 'Note card',
    navShareView: 'Shared note',
    categories: 'Categories',
    wallpaper: 'Appearance',
    fontSection: 'Interface font',
    fontHint: 'iPhone / iPad only — these faces ship with iOS; other devices stay on PingFang. Affects on-screen text on this device only; poster templates keep their own fonts',
    fontDemo: 'Good notes',
    fontDefault: 'PingFang (default)',
    fontSong: 'Song (serif)',
    fontFang: 'FangSong',
    fontKai: 'Kai',
    wallpaperSection: 'Wallpaper',
    wallpaperSubHint: 'All four are full ramps: the page, the cards, the block beside each note and the ink all change together',
    swatchHint: 'Tap a swatch below to apply',
    inUse: 'In use',
    colon: ': ',
    aboutTabIntro: 'Intro',
    aboutTabFeatures: 'Features',
    aboutTabPrivacy: 'Privacy',
    aboutPrivacyLead: 'What we collect, where your screenshots go, and how to delete them — same wording as the privacy notice filed with WeChat.',
    aboutUpdatedAtLabel: 'Last updated',
    aboutUpdatedAt: 'Sep 22, 2026',
    aboutVersionRow: 'Version',
    aboutEntityRow: 'Developer',
    aboutEntityValue: 'Independent developer',
    aboutAccountRow: 'Official account',
    sameWallpaper: 'This one is already applied',
    language: 'Language',
    about: 'About',
    noNotes: 'No notes yet',
    importUrl: 'URL link',
    importScreenshot: 'Photo or screenshot',
    writeNote: 'Write it myself',
    // 这一句英文不是从中文逐字翻的：中文要的是"伸手记一笔"那个动作，直译成
    // Tap and jot 没人这么说，所以英文只留一个动词 Jot。这一屏旁边就是拍照/相册/链接
    // 三枚图标，动词本来也只该有一个。10-08 起展开态整条让位给面板，按模式换字那三条一起退了。
    barIdle: 'Jot it down',
    back: 'Back',
    personSwap: 'Switch to the other figure',
    // 与中文那三枚同档：Photo / Link / Text，都是单个词，标签行才放得下。
    modePhoto: 'Photo',
    modeWrite: 'Text',
    modeUrl: 'Link',
    // 站长 10-11 13:2x：「调亮度，换背景的英文不准确」。原来这两枚是 'Dim photo'／'Change photo'——
    // 这一屏上 "Photo" 已经是三枚标签里的「照片」那一档（上面 modePhoto），读起来像在说笔记的图，
    // 而这两枚动的都是**背景那张形象图**：一枚换它、一枚调它的明暗。所以改成点名的那两样。
    homeBgSwap: 'Background',
    moodSwap: 'Mood',
    bgDimLabel: 'Brightness',
    tipsPrefix: 'Tips: ',
    tips: [
      'Photos and screenshots turn into key points',
      'Paste a link — get it down to three lines',
      'Pick a card template before you share',
      'Share the card straight into WeChat',
      'A category with a password stays private',
      'Pick a new look for the whole app',
    ],
    title: 'Title',
    summary: 'Summary',
    save: 'Save',
    // 官方 showModal 的按钮文案上限是 4 个字符（中文按字算，英文按字母算），
    // 所以这里不能用 Cancel/Delete/Keep it 这种长词——超出的部分会被微信截掉。
    cancel: 'Back',
    delete: 'Delete',
    search: 'Search notes',
    notesHeading: 'My notes',
    statNotes: 'Notes',
    // 与中文那一对同一个道理：这是"名下有几张图"的计数标签，不是名片槽位那个 slotCard。
    // 10-18 随站长那句改成 Images（数的是配图张数，见 `create.js` 的 `loadEntryStats`）。
    statImages: 'Images',
    searchPh: 'Enter keywords',
    // 与中文侧一一对应的三串（v19）。第二枚 tab 那两个字仍读 navShare。
    tabList: 'List',
    showMore: 'Show more',
    // 那两句折叠口的话（"点一下展开"／"点一下收起"的英文）随中文那一对一起退了。
    allCategories: 'All',
    addCategory: 'Add category',
    categoryName: 'Category name',
    newCategory: 'New category',
    editCategory: 'Edit category',
    deleteCategoryConfirm: 'Delete? Notes will become uncategorized',
    // 与中文侧同三串。占位那一句要放得进输入框，所以英文没有照"新增分类，空格分开"逐字写。
    catAddPh: 'New categories, space separated',
    // 与中文那三串同一组（10-18 那两句：最多 8 个含私密、名称最多 4 个汉字；英文档我给的 10 个字母）。
    catAddFullPh: 'max {max} · delete one',
    catMaxToast: 'Up to {max} categories — delete one to add another.',
    catNameLimit: 'Up to {cjk} Chinese characters or {latin} letters.',
    catLockedPrivate: 'Private stays last',
    catDelBody: '{n} notes here move to uncategorized.',
    catSaveFailed: 'Not saved: {names}',
    noCategories: 'No categories yet',
    // 与中文那四串同一组（英文一律不直译，且必须放得进那一行——同一把尺子量两种语言）
    // 同样按"这行拿来干嘛"写，不写零件清单；长度由同一把尺子现量。
    navProfileTip: 'What prints on your shared card',
    wallpaperTip: 'Pick the look of the whole app',
    categoriesTip: 'How notes are grouped and ordered',
    privatePasswordTip: 'Locks notes you keep private',
    navProfile: 'Card templates',
    slotCard: 'Card',
    slotBg: 'Home',
    slotHint: 'Four slots. Tap + to add a photo, then pick its role below: Home lays it behind the home page and the head of the notes list, Card is the poster avatar.',
    slotHintFull: 'All four slots are full. Delete one first, then add another.',
    slotDropTitle: 'Remove this photo',
    slotDropOk: 'Yes',
    slotDropBody: 'It is only stored on this phone — nothing is uploaded.',
    slotDropWasCard: 'Your poster will have no avatar.',
    slotDropWasBg: 'Home and the notes header get no background photo — just the wallpaper.',
    avatarSaveFailed: "Couldn't save that image — try again",
    profileName: 'Name',
    profileNamePh: 'Your name or nickname',
    profileSlogan: 'One line',
    profileSloganPh: 'A line to print on the image, optional',
    previewTitle: 'Card preview',
    previewHint: 'This is the finished card. Tap Save above to apply.',
    profileSaved: 'Saved',
    editCard: 'Edit my card',
    cardInfo: 'Image settings',
    slotAvatar: 'Avatar',
    cardInfoHint: 'These four are the face and the name printed on your cards. Tap Replace to swap one, or the bin to remove it.',
    cardReplace: 'Replace',
    slotPos: 'Slot',
    posterUsing: 'Current template',
    // 撤掉分享：码不过期，这一条就是唯一的收回动作
    sharedNow: 'This note is public — anyone with the code can read it',
    unshare: 'Stop sharing',
    unshareBody: 'Posters you already sent out stop working right away. Share again for a new code.',
    unshareConfirm: 'Stop',
    authorLabel: 'Written by',
    saveToMine: 'Save to my notes',
    savingMine: 'Saving…',
    alreadySaved: 'Saved to my notes',
    savedToMine: 'Saved into your notes',
    saveMineFailed: 'Could not save, try again',
    importedFromLabel: 'Imported from',
    importedFromHint: 'This source line stays and cannot be edited',
    importedTitle: 'Original note',
    importedAt: 'Imported',
    sourceShareImport: 'From a share',
    unshared: 'Sharing stopped',
    unshareFailed: 'Could not stop sharing, please try later',
    selectWallpaper: 'Select wallpaper',
    wallpaperHint: 'Applies right away and follows your account to a new phone',
    selectLanguage: 'Select language',
    switched: 'Switched',
    applied: 'Applied',
    aboutApp: 'About',
    feedbackEmail: 'Feedback email',
    privatePassword: 'Private Password',
    privatePasswordHint: 'Enter a 6-digit password',
    privatePasswordTitle: 'Enter Password',
    privatePasswordOk: 'OK',
    privatePasswordWrong: 'Wrong password',
    privateRateLimited: 'Too many tries, wait a minute',
    privatePasswordRequired: 'Please set a private password in Me first',
    privatePasswordScene: 'Needed to open a private note. Notes filed as private get no share card.',
    privatePasswordSetHint: 'Already set. To change it, reset first, then type the new one twice.',
    privatePasswordBack: 'Back',
    privatePasswordNew: 'New password (6 digits)',
    privatePasswordAgain: 'Type it again',
    privatePasswordMismatch: 'The two entries differ — not saved',
    privatePasswordReset: 'Reset password',
    privatePasswordResetBody: 'Resetting voids the current code. Set a new one by typing it twice.',
    // 英文确认键只能 3-4 个字符：微信 showModal 的 confirmText 超 4 会被静默截断
    // （docs/工具/验-弹窗按钮不超四字.js 就是钉这条的），所以这里不用 "Reset"。
    privatePasswordResetConfirm: 'Yes',
    privatePasswordResetDone: 'Reset — please set a new one',
    privatePasswordSaved: 'Password saved',
    myEmail: 'My Email',
    myEmailUnset: 'Not set',
    myEmailScene: 'Replies, corrections and deletion requests are matched to you through this address. Only you can see it. Clear it and save to remove it.',
    myEmailPlaceholder: 'name@example.com',
    myEmailSave: 'Save',
    myEmailSaved: 'Saved',
    myEmailCleared: 'Cleared',
    myEmailLoadFailed: 'Could not load the saved address — try again later',
    pillSettings: 'Settings',
    pillAbout: 'About',
    // 站长 10-16 夜「英文下那句 hello！.... 被遮挡一部分，你修改一下，上下标题，意思差不多就行」。
    // 那一行是单行截断（`nowrap` ＋ `text-overflow:ellipsis`），放不下就屏上打点。
    // 预算是量出来的（`量-名片行英文不截断`）：中文态格子 317.3rpx，英文态因为药丸变宽只剩 **250.0rpx**
    // （这一枚是算出来的，21:47 真截图读到屏上是 241.7rpx ⇒ 判据线抬到格子的 95%）。
    // 原来这两句自然宽分别 278.8 ／ 250.0（离屏画布 `measureText`，且真机那支字比画布那支还宽一点
    // ——他截图上 22 个字母只露出 18 个），两句都顶到线外 ⇒ 各短一截，意思照旧。
    meGreeting: 'I am Tumark',
    brainScore: 'MIND',
    officialSite: 'Website',
    resetWithBioTitle: 'Reset password',
    resetWithBioBody: 'Resetting needs your fingerprint or face. Once it passes, type the new code twice.',
    resetWithBioOk: 'Go',
    bioUnavailable: 'This phone has no fingerprint or face unlock — reset directly.',
    swipeHint: 'Swipe to change template',
    grip: 'Tap to close',
    // 同一夜改短（理由见上面 `meGreeting` 那一段的预算）。这一枚还出现在「关于」页那一行
    // （`about.wxml` 的 `.brand-slogan`，那一格宽得多，短了不会不好看）。
    // ⚠ 分享卡片标题那一句 `shareCardTitle` 里仍写全 'TumarkNote | Make every read useful'——
    // 那是另一处版面（横排长条，没有药丸抢宽），不为这一格去动它。
    slogan: 'Make reads useful',
    shareToFriend: 'Recommend Tumark',
    mindRulesTitle: 'How MIND works',
    mindRuleNewUser: 'New account',
    mindRuleInvite: 'Friend writes',
    mindRuleSaved: 'Friend saves',
    mindPlusN: '+{n}',
    shareCardTitle: 'TumarkNote | Make every read useful',
    deleteAccount: 'Delete account',
    deleteTitle: 'Delete account',
    deleteStep1: 'This deletes your {notes} notes and {cats} categories, revokes every share link you generated, and closes the account.',
    deleteStep2: 'Deletion is permanent and cannot be undone. Delete this account?',
    deleteConfirm: 'Yes',
    deleteCancel: 'Keep',
    deletingAccount: 'Deleting...',
    accountDeleted: 'Account deleted',
    deleteAccountFailed: 'Delete failed, please try later',
    // Same wording rule as the Chinese pair: the pool is shared across everyone, not "yours".
    storageSpace: 'Image storage',
    storageTip: '{pct}% of the shared pool used — new uploads may fail',
    tagOrderHint: 'Tap a tag to move it first — the colour block shows the first tag',
    copied: 'Copied',
    loading: 'Loading...',
    edit: 'Edit',
    confirm: 'OK',
    loadFailed: 'Load failed',
    saveSucceeded: 'Saved',
    updateSucceeded: 'Updated',
    saveFailed: 'Save failed, please retry',
    deleteSucceeded: 'Deleted',
    deleteFailed: 'Delete failed',
    deleting: 'Deleting...',
    operationFailed: 'Operation failed',
    confirmDelete: 'Confirm delete',
    cannotRestore: 'Cannot be restored after deletion',
    linkCopied: 'Link copied',
    summaryLabel: 'Summary',
    // Not "Original images" — what we keep is the compressed copy (long edge 1920).
    shotsLabel: 'Images',
    // Two separate truths (see the zh block): "cut by the 9-image cap" and "some failed to save".
    shotsTruncated: 'The source had {n} images; we kept the first {k}.',
    shotsPartlyFailed: '{n} images could not be saved.',
    // Same two keys as the zh block above: the button is only ~202rpx wide, so the label
    // stays one short word and the reason for the disabled state sits on the line below it.
    shareNote: 'Share',
    privateNoShare: 'Private notes can’t be shared',
    presetHint: 'Help docs are read-only: no editing, no sharing. You can delete them.',
    keyPoints: 'Key Points',
    tagsLabel: 'Tags',
    sourceLink: 'Source Link',
    linkHint: 'Links can’t open here — copy it and read it in a browser',
    originalContent: 'Original Content',
    expand: 'Expand',
    collapse: 'Collapse',
    editNote: 'Edit note',
    titlePlaceholder: 'Enter note title',
    summaryPlaceholder: 'Enter summary...',
    keyPointsHint: 'Key points (one per line)',
    keyPointsPlaceholder: '• First point\n• Second point',
    tagsHint: 'Tags (comma separated)',
    tagsPlaceholder: 'Tech, Product, Design',
    categoryLabel: 'Category',
    noCategory: 'Uncategorised',
    enterTitle: 'Please enter a title',
    saving: 'Saving...',
    paste: 'Paste',
    pasteEmpty: 'Nothing to paste yet',
    pasteFailed: "Can't read the clipboard — long-press the field to paste",
    pasteNoText: "No text on the clipboard — images can't be pasted",
    pasteReadFail: "Can't read the clipboard — paste from the Link or Text tab",
    clear: 'Clear',
    // 「清空 / 开始提炼」那排按钮撤了，换成右滑才开始的那枚长条（中文那段注释写了为什么）。
    slideExtract: 'Slide to extract',
    busyExtract: 'Extracting…',
    linkDesc: 'WeChat articles / Web pages',
    // 这一档只留一个原文框，这句从"框上面那行说明"变成"框里的占位字"。
    // 不写 "Title + text"——标题已经不在这一屏填了。
    manualDesc: 'Paste the text, get a summary',
    noImagePicked: 'No image came back — try another one',
    pickFirst: 'Pick a screenshot first',
    takePhoto: 'Camera',
    fromAlbum: 'Album',
    maxShots: 'Up to {n} images — delete one first',
    linkRule: 'Link must start with http:// or https://',
    permCamera: 'No camera access — tap to open settings',
    permAlbum: 'No album access — tap to open settings',
    pickFailed: 'Could not open the camera or album — please try again',
    // 与中文同一枚：开＝摘要整理成中文，关＝跟着原文的语言走。这里不写 "Translate"
    // （光秃秃会被读成"把界面翻译一下"），点明翻的是原文。
    origTranslate: 'Translate original',
    // 两态各一句。中文那句 12 个字，这一侧同一个字号放不下（容器按中文排的，宽度由尺子算），
    // 所以只报状态，不复述"译成中文"。
    translateOn: 'Auto-translate on',
    translateOff: 'Auto-translate off',
    needBody: 'Add the text to work from',
    extractSucceeded: 'Saved to notes',
    extractFailed: 'Extract failed, please retry',
    ocrRecognizing: 'OCR recognizing...',
    generatingShare: 'Generating share image...',
    generateFailed: 'Generate failed',
    saveToAlbum: 'Save to album',
    savedToAlbum: 'Saved to album',
    needAlbumPermission: 'Album permission required',
    permissionHint: 'Please allow album access in settings',
    exportFailed: 'Export failed',
    scanToView: 'TumarkNote · scan',
    noQrMark: 'in WeChat',
    qrToggle: 'With QR code',
    qrToggleHint: 'Other apps often block QR codes — switch it off to keep text only',
    qrOn: 'QR code on | friends can scan and save',
    qrOff: 'QR code off | just this picture, nothing to scan',
    posterMake: 'Make a share image',
    // 跟着中文那一句同一件东西走：前面是"去哪儿"，后面那三项是微信系统层给的落点，不许另起一个新词。
    cardShare: 'Share to: Chat / Moments / Official Account',
    // 英文不直译"查看笔记"成 View note：这一枚去的是那篇笔记本身，Open note 更像按钮。
    viewNote: 'Open note',
    cardDrop: 'Delete card',
    cardDropHint: 'Delete it and you can make another; links you already shared stay valid',
    cardDropOffline: 'Not connected right now — that card is still there',
    cardPrivateDropFail: 'Saved as private, but that card is still there: ',
    cardPrivateDropOffline: 'Saved as private, but that card could not be removed just now',
    cardOneOnly: 'This note already has a card — delete it to make another',
    sourceWechatArticle: 'WeChat Article',
    sourceWebArticle: 'Web Article',
    sourceScreenshot: 'Screenshot',
    sourceManual: 'Written by me',
    sourcePreset: 'Help doc',
    addCategoryPrompt: 'Enter category name',
    nameRequired: 'Name is required',
    adding: 'Adding...',
    added: 'Added',
    addFailed: 'Add failed',
    updateFailed: 'Update failed',
    sortFailed: 'Sort failed',
    noCategoriesHint: 'Tap button below to add first category',
    addCategoryBtn: 'Add category',
    applying: 'Applying...',
    setFailed: 'Set failed',
    switching: 'Switching...',
    switchFailed: 'Switch failed',
    copyright: '© 2026 TumarkNote All Rights Reserved',
    invalidShare: 'Invalid share link',
    shareExpired: 'This share has been closed',
    sharedNote: 'Shared Note',
    fromTuMaiBiJi: 'From TumarkNote',
    taskProcessing: 'Processing...',
    taskFailed: 'Processing failed, please retry',
    taskTimeout: 'Processing timeout, check notes list later',
  },
}

function t(key, lang) {
  const dict = i18n[lang] || i18n.zh
  return dict[key] || i18n.zh[key] || key
}

// WXML 表达式不能调用 JS 函数，页面需把预计算的文案映射放进 data，
// 模板里用 {{t.key}} 取值；en 缺失的 key 回退到 zh。
function texts(lang) {
  return Object.assign({}, i18n.zh, i18n[lang] || {})
}

module.exports = { i18n, t, texts }
