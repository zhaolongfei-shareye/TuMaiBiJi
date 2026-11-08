# -*- coding: utf-8 -*-
"""第三批：09 界面个性、10 账号与数据、11 帮助与魅力值、12 三条完整场景。"""
import json
import os

D = os.path.dirname(os.path.abspath(__file__))

B = {
    # ---------------------------------------------------------------- 09
    'P01': {'screen': 'create-home', 'focus': ['mood'], 'points': [
        '首页点「换心情」，每点一次换一档',
        '墨、象牙、天青、樱落、雨雾五档循环',
        '面板、顶部与底部导航一起调整'],
        'caution': '心情档只存当前设备；入口在首页，「我的」里没有第二排。'},
    'P02': {'screen': 'create-home', 'focus': ['bg'], 'points': [
        '首页「换背景」打开图片与卡片信息层',
        '在图片位添加或更换，再指定哪张当背景',
        '没有个人背景时按这一套壁纸的底色显示'],
        'caution': '换背景不会给笔记加图，也不改某篇的头图。'},
    'P03': {'screen': 'create-home', 'focus': ['dim'], 'points': [
        '铺了背景图时，「调亮度」循环三档',
        '先看标题与操作文字是否易读',
        '换一张照片后可以再选一次'],
        'caution': '不改照片本身的曝光，也不是手机屏幕的系统亮度。'},
    'P04': {'screen': 'me-set', 'focus': ['market'], 'points': [
        '名片图、名称、一句话与市场选套会尝试同步账号',
        '心情档与首页人物形象只落本机',
        '首页和制作窗口里的同类编辑当前也只落本机'],
        'caution': '云端保存不是多端实时同步，也不保证找回已删除的图片。'},
    # ---------------------------------------------------------------- 10
    'A01': {'screen': 'me-set', 'focus': ['head'], 'points': [
        '在微信里打开，按提示完成登录或授权',
        '相机、相册等权限用到时才请求',
        '笔记归属自己的账号，公开需要额外主动操作'],
        'caution': '首页没有 Apple 登录按钮；也不是团队工作区，没有席位与协作权限。'},
    'A02': {'screen': 'list', 'focus': ['rows'], 'points': [
        '笔记文字按账号保存',
        '配图、卡片与名片图走云端图片存储',
        '列表看文字和配图，分享入口看当前卡'],
        'caution': '云端保存不是永久保管承诺，也不等于多端实时同步。'},
    'A03': {'screen': 'me-set', 'focus': ['email'], 'points': [
        '「我的 → 设置 → 我的邮箱」查看或修改',
        '清空再保存，就是不再保留这一项',
        '只关掉编辑层不会写入半截地址'],
        'caution': '不是邮箱登录或订阅；没有自动邮件备份，也不发找回验证码。'},
    'A04': {'screen': 'detail-sheet', 'focus': ['actions'], 'points': [
        '详情底「删除」处理的是整篇笔记',
        '只想换样式时，去已有卡片窗口删除分享图',
        '删笔记会连带处理配图、卡片与分享记录'],
        'caution': '收不回别人保存的图或转存的副本；停止外部访问要用撤回公开。'},
    'A05': {'screen': 'delete', 'focus': ['delSheet'], 'points': [
        '「我的 → 设置 → 注销账号」',
        '第一道确认列出笔记与分类数量',
        '第二道不可恢复提示，两次都确认才执行'],
        'caution': '读不到数量就不会带着猜测继续；注销失败以提示为准。'},
    'A06': {'screen': 'me-set', 'focus': ['storage'], 'points': [
        '提示出现在「我的 → 设置」下方',
        '只有达到提醒条件才多出这一行',
        '它是只读提示，没有独立详情页'],
        'caution': '用的是全站图片空间口径，不是你的个人专属容量。'},
    # ---------------------------------------------------------------- 11
    'S01': {'screen': 'list', 'focus': ['rows'], 'points': [
        '第一次用先读列表里的示例与帮助笔记',
        '用正常的详情窗阅读，不必找「帮助中心」',
        '帮助笔记可以删除，但不能编辑或分享'],
        'caution': '那一页的受限提示是设计如此，不是产品故障。'},
    'S02': {'screen': 'me-about', 'focus': ['head', 'menu'], 'points': [
        '「我的」顶部一枚魅力值数字',
        '「关于」里读三项规则：新用户、推荐朋友使用、笔记被朋友种草',
        '朋友开始记录，或读者转存副本，是两条不同结果'],
        'caution': '点开链接或点一次分享不等于立即结算；它不是现金、余额或付费权益。'},
    'S03': {'screen': 'me-about', 'focus': ['menu'], 'points': [
        '「我的」切到「关于」看介绍与版本号',
        '官网与邮箱条目点了是复制',
        '反馈时带上版本和出现问题的操作'],
        'caution': '不是内嵌浏览器，也不是即时客服会话。'},
    # ---------------------------------------------------------------- 12
    'U01': {'screen': 'detail', 'focus': ['summary', 'original'], 'points': [
        '拍清晰文字或导入截图，右滑整理',
        '先看摘要与要点，再展开原文核对',
        '到编辑页修订表述和标签，归进阅读分类'],
        'caution': '只使用有权处理与分享的材料，并保留出处；摘要不代替理解。'},
    'U02': {'screen': 'create-home', 'focus': ['translate'], 'points': [
        '公开攻略走链接，菜单与印刷说明走图片',
        '自己的安排直接写进文字档',
        '开着原文翻译，整理结果以中文呈现'],
        'caution': '地址、营业时间、价格会变，要回到原始来源核实。'},
    'U03': {'screen': 'tpl-sheet', 'focus': ['preview', 'qr'], 'points': [
        '链接或文字录入，核对来源再写自己的观点',
        '按内容密度挑模板，设好图片与署名',
        '决定要不要展示码，再生成与分享'],
        'caution': '模板不替你取得原文、图片或肖像的使用权。'},
}

if __name__ == '__main__':
    out = os.path.join(D, '内容', '功能要点.json')
    data = json.load(open(out, encoding='utf-8'))
    data.update(B)
    json.dump(data, open(out, 'w', encoding='utf-8'), ensure_ascii=False, indent=1)
    src = json.load(open(os.path.join(D, '完整内容.json'), encoding='utf-8'))
    want = [f['id'] for c in src for f in c['features']]
    print('累计', len(data), '条；正本', len(want), '条')
    print('缺', [x for x in want if x not in data])
    print('多', [x for x in data if x not in want])
    for k, v in data.items():
        if v.get('art') != 'card':
            assert 'screen' in v and v.get('focus'), k
        assert len(v['points']) >= 3, k
        assert all(p.strip() for p in v['points']), k
