// 把 automator 那道「版本闸」改成认不出来就不判——一次性、可重复跑、认出就跳过。
//
// 为什么（10-13 实测，不是猜的）：
//   真跑那批 12 次连接全打「连不上自动化端口」，把 automator 的报错原样打出来是
//   `TypeError: Cannot read properties of undefined (reading 'split')`，
//   栈顶在 licia/cmpVersion.js:4 ← MiniProgram.checkVersion ← Launcher.connect。
//   拿裸 WebSocket 直接问那一头 `Tool.getInfo`，回的是：
//     {"id":"…","result":{"version":"2.02.2608040"}}
//   ——只有 version，没有 SDKVersion。而 checkVersion 写的是
//     `t = (await this.send("Tool.getInfo")).SDKVersion` 然后 cmpVersion(t, "2.7.3")，
//   于是 undefined.split('.') 当场炸，连接一步都还没开始用就死了。
//   automator 0.12.1 已经是 npm 上最新版（`npm view miniprogram-automator dist-tags` 现读），
//   等不到上游改，所以在装好的那一份里把它改成「SDKVersion 不是非空字符串就不判」。
//
// 为什么不干脆放行所有版本：这道闸原本是给「IDE 自动化 SDK 太老」准备的一句人话报错。
// 改动只挡掉「字段根本不存在」这一种，字段在且太老时照旧抛原来那句。
// 真要是 SDK 太老，后面每一个 App.* / Element.* 都会回明确的 "unimplemented"，
// 比现在这种「一句话原因都没有的连接红」好查。
//
// 只改 ~/.mpauto 里那一份（跑尺子.sh 的 NODE_PATH 指的就是它），不碰项目代码、不碰仓库。
// 重装 npm i 会把补丁冲掉，所以 跑尺子.sh 每把之前先跑一次这个文件。

const fs = require('fs')
const os = require('os')
const path = require('path')

const TARGET = path.join(os.homedir(), '.mpauto', 'node_modules', 'miniprogram-automator', 'out', 'MiniProgram.js')
const BAK = TARGET + '.pre-versiongate.bak'

// 原文是那一段压缩过的代码，引号全是双引号，这里整体用单引号包，里面的反引号与 ${} 都只是普通字符。
const OLD = 'async checkVersion(){let t="";if(t=(await this.send("Tool.getInfo")).SDKVersion,"dev"!==t&&cmpVersion_1.default(t,"2.7.3")<0)throw Error(`SDKVersion is currently ${t}, while automator(${pkg.version}) requires at least version 2.7.3`)}'
const NEW = 'async checkVersion(){let t="";if(t=(await this.send("Tool.getInfo")).SDKVersion,"string"==typeof t&&t&&"dev"!==t&&cmpVersion_1.default(t,"2.7.3")<0)throw Error(`SDKVersion is currently ${t}, while automator(${pkg.version}) requires at least version 2.7.3`)}'

function main() {
  if (!fs.existsSync(TARGET)) {
    console.log('!! 找不到 automator 那一份：' + TARGET)
    console.log('   先装一次：mkdir -p ~/.mpauto && cd ~/.mpauto && npm i miniprogram-automator')
    process.exit(1)
  }
  const src = fs.readFileSync(TARGET, 'utf8')
  if (src.includes(NEW)) { console.log('版本闸已修（跳过，不重复写）'); return }
  if (!src.includes(OLD)) {
    // 既不是原样也不是修过——多半是 automator 升了版、这一段改了写法。
    // 这里必须大声红：静默跳过就是「以为修了其实没修」那一类坑。
    console.log('!! 没认出 checkVersion 那段原文（automator 版本或写法变了？不硬改）')
    console.log('   装的是 ' + readVersion() + '，文件在 ' + TARGET)
    process.exit(1)
  }
  if (!fs.existsSync(BAK)) fs.writeFileSync(BAK, src) // 留一份可还原的原文，别拿 git 当还原手段
  fs.writeFileSync(TARGET, src.replace(OLD, NEW))
  console.log('版本闸已修：SDKVersion 缺失时不再 cmpVersion(undefined)（原文备份在 ' + BAK + '）')
}

function readVersion() {
  try {
    return JSON.parse(fs.readFileSync(path.join(path.dirname(path.dirname(path.dirname(TARGET))), 'package.json'), 'utf8')).version
  } catch (e) { return '(读不到)' }
}

main()
