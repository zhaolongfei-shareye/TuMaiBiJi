// 形象图落盘这条链路的时序自检：用一个"像真机那样"的假文件系统跑，
// 因为开发者工具的替身在目标文件已存在时不报错，真机会（errno 17 file already exists）。
// 用法：node docs/工具/验-头像落盘时序.js
//
// 09-30 整支跟着四槽改写。这个文件原来钉的是"暂存→转正"那两步（stageAvatar/commitAvatar），
// 现在那套已经没有了：选完直接 mintAvatar 出一个唯一文件名、当场写进某个槽。
// 但它当年抓到的两条真坑一条都没过期，所以照旧钉着：
//   ① 一张一个文件名（1.4.0 那次"换图预览还是第一张"，根因是同名 + 按路径缓存位图）；
//   ② 开页清扫只认名单，正在用的和别人的文件都不能碰（本地目录一共 10MB）。
// 至于"角色单选、删掉不补位、老账号升级"那些是逻辑而不是时序，在另一支尺子里
// （验-形象四槽.js），两支各管一段，别混。
const path = require('path')

const UD = '/userdata'
const PREFIX = 'poster-avatar'

function makeFs({ strictOverwrite }) {
  const files = new Set()
  const fm = {
    accessSync(p) {
      if (!files.has(p)) throw { errMsg: 'accessSync:fail no such file or directory' }
    },
    unlinkSync(p) {
      if (!files.has(p)) throw { errMsg: 'unlinkSync:fail no such file or directory' }
      files.delete(p)
    },
    copyFile(o) {
      const done = (cb, arg) => setTimeout(() => cb && cb(arg), 0)
      if (!o || typeof o.srcPath !== 'string') {
        done(o.fail, { errMsg: 'copyFile:fail parameter error: parameter.srcPath should be String instead of Undefined', errno: 1001 })
        return
      }
      if (!files.has(o.srcPath)) { done(o.fail, { errMsg: 'copyFile:fail no such file or directory' }); return }
      if (strictOverwrite && files.has(o.destPath)) {
        done(o.fail, { errMsg: 'copyFile:fail file already exists', errno: -30 })
        return
      }
      files.delete(o.destPath)
      files.add(o.destPath)
      done(o.success, {})
    },
  }
  const store = {}
  global.wx = {
    env: { USER_DATA_PATH: UD },
    getFileSystemManager: () => fm,
    // 真机上 getStorageSync 对没写过的 key 回空串（不是 undefined），
    // 名单读出来说话不照这个来，就等于没验到那条 guard。
    getStorageSync: (k) => (k in store ? store[k] : ''),
    setStorageSync: (k, v) => { store[k] = JSON.parse(JSON.stringify(v)) },
  }
  return { files, store, add: (p) => files.add(p) }
}

const posterPath = path.resolve(__dirname, '../../miniprogram/utils/poster.js')
function loadPoster() {
  delete require.cache[require.cache[posterPath]]
  return require(posterPath)
}

let n = 0
const fails = []
function ck(cond, msg, got) {
  n++
  if (!cond) fails.push(msg)
  console.log(`${cond ? '  ok' : '  ✗'} ${n}. ${msg}${got === undefined || got === '' ? '' : ' → ' + got}`)
}
const avatarsOf = (files) => [...files].filter((p) => p.startsWith(`${UD}/${PREFIX}`))
// 页面上的写法：挑一张 → 放进第 i 格 → 立刻落盘
const pick = async (poster, slots, i, src) => {
  const next = poster.placeSlot(slots, i, await poster.mintAvatar(src))
  poster.writeSlots(next)
  return next
}

;(async () => {
  // 先把这个假文件系统本身钉住：它必须真的会拒绝同名覆盖，否则整场测试是空的
  {
    const fs1 = makeFs({ strictOverwrite: true })
    fs1.add(`${UD}/a.img`)
    fs1.add(`${UD}/b.img`)
    const rejected = await new Promise((res) =>
      global.wx.getFileSystemManager().copyFile({ srcPath: `${UD}/a.img`, destPath: `${UD}/b.img`, success: () => res(false), fail: () => res(true) }),
    )
    ck(rejected, '这台"真机"在目标已存在时确实回 fail（尺子有效）')
  }

  const fs = makeFs({ strictOverwrite: true })
  const poster = loadPoster()
  fs.add(`${UD}/temp1.img`)
  fs.add(`${UD}/temp2.img`)

  ck(poster.cardPath() === '', '没放过图时卡片位是空的，不抛异常')
  ck(poster.homeBg() === '/assets/home-bg-portrait.jpg', '没放过图时首页用包里那张默认图')

  // —— 站长报过的那条 BUG，正面断言：两张的文件名必须不一样 ——
  let s = poster.blankSlots()
  s = await pick(poster, s, 0, `${UD}/temp1.img`)
  s = await pick(poster, s, 1, `${UD}/temp2.img`)
  const p0 = s[0].path, p1 = s[1].path
  ck(p0 !== p1, `连着放两张，落到两个不同文件上（${p0} ≠ ${p1}）`)
  ck(p0.indexOf(PREFIX) >= 0 && p1.indexOf(PREFIX) >= 0, '两张都在头像前缀下，没跑到别的目录里')
  ck(fs.files.has(p0) && fs.files.has(p1), '两张都真在本机存着')
  ck(poster.readProfile().avatarPath === '', 'storage 里那栏旧头像一直是空的（真相只有 images 一处）')

  // 第 3 格放第三张，再自己在图上勾「卡片」：顶上别人那张之后，被顶的不能跟着被删
  // （它还占着「背景」，还在自己那一格里）
  fs.add(`${UD}/temp3.img`)
  let s2 = poster.placeSlot(s, 2, await poster.mintAvatar(`${UD}/temp3.img`))
  s2 = poster.takeRole(s2, 2, 'card')
  poster.writeSlots(s2)
  const p2 = s2[2].path
  ck(fs.files.has(p0) && fs.files.has(p1) && fs.files.has(p2), '换角色不删文件：三张都还在本机')
  ck(poster.cardPath() === p2, '「卡片」现在取第三张', poster.cardPath())

  // 删掉中间那格：只有它那个文件走，另外两张不能陪葬
  const s3 = s2.slice()
  s3[1] = null
  poster.writeSlots(s3)
  ck(!fs.files.has(p1) && fs.files.has(p0) && fs.files.has(p2), '删一格只收它自己那张')
  ck(poster.readSlots()[1] === null, '那一格回空位（界面画虚线 ➕）')

  // 四格放满再清干净：目录里不该有头像残留
  fs.add(`${UD}/temp4.img`)
  let full = s3.slice()
  full = await pick(poster, full, 1, `${UD}/temp2.img`)
  full = await pick(poster, full, 3, `${UD}/temp4.img`)
  ck(full.filter(Boolean).length === 4, '四个位置放满', JSON.stringify(full.map((x) => !!x)))
  poster.writeSlots(poster.blankSlots())
  ck(avatarsOf(fs.files).length === 0, '全清之后目录里没有头像残留', `[${avatarsOf(fs.files).join(',')}]`)
  ck(poster.cardPath() === '' && poster.homeBg() === '/assets/home-bg-portrait.jpg', '清完之后卡片没图、首页回默认')

  // 挑完没落盘就退出（onUnload）：这张不该留在本机
  const orphan = await poster.mintAvatar(`${UD}/temp1.img`)
  ck(fs.files.has(orphan), '刚复制出来、还没写进槽的那张先在磁盘上')
  poster.dropUncommitted()
  ck(!fs.files.has(orphan), '挑完没落盘就退出，那张当场删掉')

  // 中途被系统杀掉：新进程里 poster.js 的模块状态全空，只剩 storage 里那份名单。
  // 开页时页面会先 dropUncommitted 再 pruneAvatars，残留必须收干净、正在用的不能动。
  fs.add(`${UD}/temp1.img`)
  const kept = await poster.mintAvatar(`${UD}/temp1.img`)
  poster.writeSlots([null, { path: kept, card: true, bg: true }, null, null])
  const zombie = await poster.mintAvatar(`${UD}/temp1.img`)
  fs.add(`${UD}/别的应用的文件.img`)
  const fresh = loadPoster()
  ck(fresh.readSlots()[1].path === kept, '换新进程后四个槽的记号还在')
  fresh.dropUncommitted()
  fresh.pruneAvatars()
  ck(!fs.files.has(zombie), '开页清扫：上个进程留下的、没进槽的那张被删掉')
  ck(fs.files.has(kept) && fresh.cardPath() === kept, '开页清扫：正在用的那张不误删')
  ck(fs.files.has(`${UD}/别的应用的文件.img`), '开页清扫：只认名单，名单外的文件一个都不碰')

  // 同进程里刚复制出来、还没落进槽的那一张也不能被清扫删掉（挑完图停在页上的状态）
  const pending = await fresh.mintAvatar(`${UD}/temp1.img`)
  fresh.pruneAvatars()
  ck(fs.files.has(pending), '清扫不动这一次刚复制、还没落盘的图')
  fresh.dropUncommitted()

  // 文件被系统清掉、记录还留着：不能拿一个不存在的路径去画海报
  fresh.writeSlots([{ path: pending, card: true, bg: true }, null, null, null])
  fs.files.delete(pending)
  ck(fresh.cardPath() === '', '文件没了 → 卡片位退回空（海报退回「麦」占位字）')
  ck(fresh.homeBg() === '/assets/home-bg-portrait.jpg', '文件没了 → 首页落回默认图，不引用不存在的文件')
  ck(fresh.posterProfile().avatarPath === '', 'posterProfile 也跟着回空（画海报那条读的是它）')

  // 空着再清一轮：不该抛异常
  fresh.dropUncommitted()
  fresh.pruneAvatars()
  fresh.writeSlots(fresh.blankSlots())
  ck(true, '本来就没有时再清一次：不抛异常')

  console.log(`\n${fails.length ? '失败 ' + fails.length + ' 条：\n' + fails.join('\n') : `${n} 条断言全过`}`)
  process.exit(fails.length ? 1 : 0)
})().catch((e) => {
  console.error('用例本身炸了：', e)
  process.exit(2)
})
