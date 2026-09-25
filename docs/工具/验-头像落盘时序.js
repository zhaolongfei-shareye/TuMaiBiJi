// 头像落盘这条链路的时序自检：用一个"像真机那样"的假文件系统跑，
// 因为开发者工具的替身在目标文件已存在时不报错，真机会（errno 17 file already exists）。
//
// 09-25 大改过一次，起因是站长报的 1.4.0 BUG：卡片模板只要传过一次图，后面无论怎么换，
// 预览还是第一张。根因是暂存/正式各只有一个固定文件名，第二次挑图拿到的路径字符串和
// 第一次一模一样，而 <image> 组件和 canvas 的 createImage() 都按路径缓存位图。
// 现在改成"一张图一个文件名"，于是这里最要紧的一条断言就是：连着挑两次，路径必须不同。
// 用法：node docs/工具/验-头像落盘时序.js
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
function ck(cond, msg) {
  n++
  if (!cond) fails.push(msg)
  console.log(`${cond ? '  ok' : '  ✗'} ${n}. ${msg}`)
}
const avatarsOf = (files) => [...files].filter((p) => p.startsWith(`${UD}/${PREFIX}`))

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

  ck(poster.avatarPath() === '', '没存过头像时 avatarPath 为空，不抛异常')

  // —— 站长报的那条 BUG，正面断言 ——
  const s1 = await poster.stageAvatar(`${UD}/temp1.img`)
  const s2 = await poster.stageAvatar(`${UD}/temp2.img`)
  ck(s1 !== s2, `连着挑两张图拿到两个不同路径（${s1} ≠ ${s2}）`)
  ck(s1.indexOf(PREFIX) >= 0 && s2.indexOf(PREFIX) >= 0, '两张都在头像前缀下，没跑到别的目录里')
  ck(!fs.files.has(s1), '第二次挑图时，上一张没保存的先收掉（本地只有 10MB）')
  ck(poster.readProfile().avatarPath === undefined, '挑图这一步不动 profile，海报仍用老头像')

  // 保存 = 把这张记进 profile，不复制第二份、不搬文件
  const dest = await poster.commitAvatar(s2)
  poster.writeProfile({ avatarPath: dest })
  ck(dest === s2 && fs.files.has(dest), '保存后用的还是刚才那张文件，没有再复制一份')
  ck(avatarsOf(fs.files).length === 1, '正式+暂存加起来此刻只有一份文件')

  // 保存之后 onUnload 会调 dropStaged，这时候它绝不能把刚转正的那张删掉
  poster.dropStaged()
  ck(fs.files.has(dest) && poster.avatarPath() === dest, '转正之后再 dropStaged 不会误删正在用的头像')

  // 换第二次头像：旧的那张当场被删，路径又是一个新名字
  fs.add(`${UD}/temp3.img`)
  const s3 = await poster.stageAvatar(`${UD}/temp3.img`)
  ck(s3 !== dest, '换第三张时路径又换了一个名字')
  const dest2 = await poster.commitAvatar(s3)
  poster.writeProfile({ avatarPath: dest2 })
  ck(!fs.files.has(dest) && fs.files.has(dest2), '新头像转正时，被它顶替的那张当场删掉')
  ck(avatarsOf(fs.files).length === 1, '换过一轮之后目录里仍然只剩一张')

  // 没点保存就退出（onUnload）：这张不该留在本机
  const s4 = await poster.stageAvatar(`${UD}/temp1.img`)
  poster.dropStaged()
  ck(!fs.files.has(s4), '挑完没保存就退出，暂存那张当场删掉')
  ck(fs.files.has(dest2), '删暂存不影响正在用的正式头像')

  // 中途被系统杀掉：新进程里 poster.js 的模块状态全空，只剩 storage 里那份名单。
  // 开页时页面会先 dropStaged 再 pruneAvatars，残留必须收干净、正在用的那张不能动。
  const zombie = await poster.stageAvatar(`${UD}/temp2.img`)
  fs.add(`${UD}/别的应用的文件.img`)
  const fresh = loadPoster()
  ck(fresh.readProfile().avatarPath === dest2, '换新进程后 profile 还在')
  fresh.dropStaged()
  fresh.pruneAvatars()
  ck(!fs.files.has(zombie), '开页清扫：上个进程留下的没保存的暂存被删掉')
  ck(fs.files.has(dest2) && fresh.avatarPath() === dest2, '开页清扫：正在用的那张不误删')
  ck(fs.files.has(`${UD}/别的应用的文件.img`), '开页清扫：只认名单，名单外的文件一个都不碰')

  // 同进程里正在暂存的那一张也不能被清扫删掉（挑完图停在页上的状态）
  const staging = await fresh.stageAvatar(`${UD}/temp3.img`)
  fresh.pruneAvatars()
  ck(fs.files.has(staging), '清扫不动本次正在暂存的头像')
  fresh.dropStaged()

  // 「去掉」：正式那张也要跟着没
  fresh.dropAvatar()
  ck(!fs.files.has(dest2), '去掉头像：正式那张删掉')
  ck(avatarsOf(fs.files).length === 0, '去掉之后目录里没有头像残留')
  ck(fresh.avatarPath() === '', '没有头像时 avatarPath 回空串（海报退回「麦」占位字）')
  fresh.dropStaged()
  fresh.dropAvatar()
  fresh.pruneAvatars()
  ck(true, '本来就没有时再清一次：不抛异常')

  // 文件被系统清掉、记录还留着：读出来是空，不能拿一个不存在的路径去画海报
  fs.add(`${UD}/temp1.img`)
  const again = await fresh.stageAvatar(`${UD}/temp1.img`)
  fresh.commitAvatar(again)
  fresh.writeProfile({ avatarPath: again })
  fs.files.delete(again)
  ck(fresh.avatarPath() === '', '文件被系统清掉后 avatarPath 退回空（记录还在但文件没了）')
  fresh.writeProfile({ avatarPath: '' })

  console.log(`\n${fails.length ? '失败 ' + fails.length + ' 条：\n' + fails.join('\n') : `${n} 条断言全过`}`)
  process.exit(fails.length ? 1 : 0)
})().catch((e) => {
  console.error('用例本身炸了：', e)
  process.exit(2)
})
