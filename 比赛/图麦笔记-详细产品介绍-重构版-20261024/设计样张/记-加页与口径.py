# -*- coding: utf-8 -*-
"""把 10-24 深夜这一轮（加页＋改口径＋五档实拍）写进素材/样张来源.json。"""
import json
import os

D = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
P = os.path.join(D, '素材', '样张来源.json')
data = json.load(open(P, encoding='utf-8'))

data['pages_and_voice_1024b'] = {
    '触发': '站长六条：①说完故事加一页总结 ②过渡句换成「我虽然渺小，只有 XX K，但还能做很多」③功能描述站用户角度 ④大标题下的小字与下面重复，删掉无意义备注 ⑤五档配色要完整界面一行排列、可重叠露一半 ⑥结尾加官网与联系方式页；另加「啰嗦的删掉」。',
    '新增三页': {
        '17 故事总结': '「林夏的罗马五天，到这里讲完。」＋五行对照（她留下的东西 → 变成什么），每行都能回指前十几页。',
        '52 五档心情': '「五档心情，同一屏。」整页只放五张真实渲染，一行排列、后一张压住前一张一半，下面逐张标墨／象牙／天青／樱落／雨雾。',
        '67 找到我们': '「想试的话，从这里进来。」四枚：小程序 图麦笔记／官网 agentsbin.cn／反馈邮箱 jacky28471258@gmail.com／公众号 杰克AI日记，右边那枚小程序码与封面同一枚。',
    },
    '712KB 的出处': 'docs/版本与发布现状.md 第 14 行现读：`cli upload -v 2.4.17`（729,103 B）。729103/1024＝712.0 KB。这一枚数出现在第 18 页大标题与引导句里。⚠ 口径：这是那颗代码包的字节数（上传时工具报的），不是压缩后平台侧的展示数。',
    '联系方式的出处': '小程序名与官网＝miniprogram/utils/appInfo.js 的 SITE（第 521 行「agentsbin.cn」）与 OFFICIAL_ACCOUNT（第 522 行「杰克AI日记」）；邮箱＝miniprogram/utils/contact.js 第 3 行 CONTACT_EMAIL。三枚都是包内现值，屏上「我的」与「关于」读的就是同一份。',
    '五档实拍通道': {
        '拍摄': '开发者工具 cli auto（端口 9451，AppID wx4416d1283b5de721）→ iPhone 12/13 档 → 走 App 自己那条 cycleGlassMood（首页「换心情」按下去的同一段代码：记档＋跟着换壁纸＋重算主题），逐档 reLaunch 首页后 mp.screenshot()，734×1588。',
        '为什么第一版是假的': '第一次只写 wx.setStorageSync("glassMood") 不切壁纸 ⇒ app.js:380 的 glassMood() 会拿本机这一档与壁纸对账，对不上就落回壁纸钉的那档，结果五张里只有象牙变了。像素自检：五张 md5 只有一种＋nav 采样全等 #23252C。改走 cycleGlassMood 后五张 md5 全不同。',
        '色值核对': '导航条取样：墨 (35,37,43)＝#23252C、象牙 (174,163,154)≈#B1A299、天青 (162,187,165)≈#9BBCA3、樱落 (179,168,189)≈#B5A8BF、雨雾 (166,176,190)≈#A4B0C0，逐档对上 utils/palette.js 的 MOODS.glass。',
        '还原': '拍完把 poster_profile、glassMood、wallpaper 三件写回并按快照读回：RESTORE -> {"mood":"ink","wallpaper":"tint-paper"}。首屏背景用的是 /tmp/bg-linxia.jpg（故事里那位女主角那张），与封面同一张。',
    },
    '章首小字': '12 段从 72–104 字压到 23–37 字，全部换成「你可以…」那一句；旧值整段留在 完整内容.json 的 chapters[i].intro_old，页面上不再出现。',
    '功能标题': '77 项标题全部从「功能名：说明」换成用户视角整句（例：P02「背景照片：从自己的图片中指定」→「首页背景换成你自己拍的照片」）；旧值留在 features[i].title_old。最长 24 字。',
    '撤掉的小字': 'feature_html 从前把标题按冒号切成两半（前半做大字、后半做灰色小字），造成「没提炼好和没存下来不是一回事」下面跟一条没有信息量的「分开重试」。现整句进 h2，`.feature-subtitle` 这一行全册撤掉（CSS 规则留着，页面上已无引用）。',
    '撤掉的备注': '参考半册续页那句「左边那一格按 2.4.16 源码画出这一屏，标号就是它的位置。」与模板页那句讲画法的话，全部置空；每屏下方的「界面位置示意 · 非真实截图」那行保留（那是诚实标注，不是备注）。',
    '尺子读数': '结构尺子 PASS：pages 67／features 77／bullets 231／cautions 77／templates 11／images 52（46＋五档＋封底码）／minHeaderGap 18.72／minFooterGap 35.89／390 视口不横滚 bodyFont 16px。',
    'PDF读数': '67 页／67 枚书签／67 页可检索／37,605,795 B；首枚「01｜看到好内容， 随手记下来。」，末枚「67｜想试的话， 从这里进来。」。',
    '一处口径疑点': '全册的 provenance 行写的是「按 2.4.16 源码绘制」，而本地工作树 miniprogram/utils/appInfo.js 的 VERSION 已是 2.4.17（线上发布的是 2.4.16，2.4.17 在审核中）。线稿与要点是照本地这棵树核的，严格说应写 2.4.17。本轮没动这 64 处字样，等他定口径。',
    '没动的部分': '77 项的三到四条要点与「需要知道」那一行（本轮只改标题）；故事半册 16 页的引导句（那是叙事，不是备注）；页脚那句旧口号「读懂这一站，写下自己的旅程」仍在 67 页每一页上，待拍。',
}

json.dump(data, open(P, 'w', encoding='utf-8'), ensure_ascii=False, indent=2)
back = json.load(open(P, encoding='utf-8'))
print(json.dumps({'keys': len(back), '本轮键': list(back['pages_and_voice_1024b'].keys()), 'bytes': os.path.getsize(P)}, ensure_ascii=False))
