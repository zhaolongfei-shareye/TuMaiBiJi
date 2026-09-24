// 头像落盘这条链路的时序自检：用一个"像真机那样"的假文件系统的跑，
// 因为开发者工具的替身在目标文件已存在时不报错，真机会（errno 17 file already exists）。
// 用法：node docs/工具/验-头像落盘时序.js
const path = require('path')

const UD = '/userdata'
const AVATAR = 'poster-avatar.img'
const STAGED = 'poster-avatar-staged.img'

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
    getStorageSync: (k) => store[k],
    setStorageSync: (k, v) => { store[k] = v },
  }
  return { files, add: (p) => files.add(p) }
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

  const s1 = await poster.stageAvatar(`${UD}/temp1.img`)
  ck(s1 === `${UD}/${STAGED}`, '第一次选图：落到暂存名')

  let secondFailed = false
  let s2 = ''
  try {
    s2 = await poster.stageAvatar(`${UD}/temp2.img`)
  } catch (e) {
    secondFailed = true
  }
  ck(!secondFailed && s2 === `${UD}/${STAGED}`, '第二次选图（暂存名已存在）：不再被"文件已存在"顶回来')

  const dest = await poster.commitAvatar(s2)
  ck(dest === `${UD}/${AVATAR}`, '点保存：正式文件在')
  ck(fs.files.has(`${UD}/${AVATAR}`), '正式文件确实落了盘')
  ck(!fs.files.has(`${UD}/${STAGED}`), '保存后暂存那份被删掉，不留多余拷贝')

  const again = await poster.commitAvatar(s2 === '' ? `${UD}/${AVATAR}` : (await poster.stageAvatar(`${UD}/temp1.img`)))
  ck(again === `${UD}/${AVATAR}`, '换第二次头像（正式名已存在）：也能存下来')

  // 下面这三条走的是"页面保存"那条真顺序：commitAvatar 之后还要 writeProfile 记下路径，
  // 光落盘不写记录，海报是读不到头像的。
  poster.writeProfile({ avatarPath: again })
  ck(poster.avatarPath() === `${UD}/${AVATAR}`, '写进记录后 avatarPath 读得到')

  fs.files.delete(`${UD}/${AVATAR}`)
  ck(poster.avatarPath() === '', '文件被系统清掉后 avatarPath 退回空（记录还在但文件没了）')
  poster.writeProfile({ avatarPath: '' })

  poster.dropStaged()
  poster.dropAvatar()
  ck(!fs.files.has(`${UD}/${AVATAR}`) && !fs.files.has(`${UD}/${STAGED}`), '清空形象：两份文件都没了')
  poster.dropStaged()
  poster.dropAvatar()
  ck(true, '再清一次（本来就没有）：不抛异常')

  console.log(`\n${fails.length ? '失败 ' + fails.length + ' 条：\n' + fails.join('\n') : `${n} 条断言全过`}`)
  process.exit(fails.length ? 1 : 0)
})().catch((e) => {
  console.error('用例本身炸了：', e)
  process.exit(2)
})
