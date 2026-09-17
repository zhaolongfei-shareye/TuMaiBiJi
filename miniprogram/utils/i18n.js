const i18n = {
  zh: {
    tabNotes: '笔记',
    tabCreate: '新建',
    tabMe: '我的',
    login: '点击登录',
    notLoggedIn: '未登录',
    categories: '分类管理',
    wallpaper: '壁纸设置',
    language: '语言 / Language',
    about: '关于微图闪记',
    noNotes: '暂无笔记',
    importUrl: 'URL 导入',
    importScreenshot: '截图导入',
    writeNote: '手动撰写',
    title: '标题',
    summary: '摘要',
    save: '保存',
    cancel: '取消',
    delete: '删除',
    pin: '置顶',
    unpin: '取消置顶',
    search: '搜索笔记',
    allCategories: '全部',
  },
  en: {
    tabNotes: 'Notes',
    tabCreate: 'Create',
    tabMe: 'Me',
    login: 'Tap to login',
    notLoggedIn: 'Not logged in',
    categories: 'Categories',
    wallpaper: 'Wallpaper',
    language: 'Language',
    about: 'About',
    noNotes: 'No notes yet',
    importUrl: 'Import URL',
    importScreenshot: 'Screenshot',
    writeNote: 'Write note',
    title: 'Title',
    summary: 'Summary',
    save: 'Save',
    cancel: 'Cancel',
    delete: 'Delete',
    pin: 'Pin',
    unpin: 'Unpin',
    search: 'Search notes',
    allCategories: 'All',
  },
}

function t(key, lang) {
  const dict = i18n[lang] || i18n.zh
  return dict[key] || i18n.zh[key] || key
}

module.exports = { i18n, t }
