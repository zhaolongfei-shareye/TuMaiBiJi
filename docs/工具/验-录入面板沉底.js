// 录入面板"贴底 + 四屏等高"这一批的静态尺子（不连模拟器，纯读文件）。
// 跑法：node docs/工具/验-录入面板沉底.js
// 要守的东西：① 展开时整块从流里拿出来沉到底栏上方，不再从顶上挂下来盖住照片；
// ② 面板定高，四个模式共用一个窗口；③ 定高之后不许有东西被压扁或被裁；
// ④ 那个 bottom 是从底栏几何推出来的，底栏一动这里要跟着动，所以两头都从源码现读。
const fs = require('fs')
const path = require('path')

const ROOT = path.resolve(__dirname, '../..')
const P = (rel) => path.join(ROOT, 'miniprogram', rel)

let pass = 0
const fails = []
function ok(name, cond, extra) {
  if (cond) { pass += 1; return }
  fails.push(name + (extra ? ' —— ' + extra : ''))
}

const wxml = fs.readFileSync(P('pages/create/create.wxml'), 'utf8')
const wxssRaw = fs.readFileSync(P('pages/create/create.wxss'), 'utf8')
const wxss = wxssRaw.replace(/\/\*[\s\S]*?\*\//g, '')
const barWxss = fs.readFileSync(P('custom-tab-bar/index.wxss'), 'utf8').replace(/\/\*[\s\S]*?\*\//g, '')
const appWxss = fs.readFileSync(P('app.wxss'), 'utf8')

// 只扫"这一个选择器自己那一段"：选择器必须顶到行首，否则 `.container.has-bg .panel {`
// 会被当成 `.panel` 那一段先命中，读到的就不是面板自己的规则了。
const seg = (sel) => {
  const esc = sel.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
  const m = new RegExp(`(?:^|\\n)${esc}\\s*\\{([^}]*)\\}`).exec(wxss)
  return m ? m[1] : ''
}

// ---------- 1. 展开态那个类改名了，旧名一处不剩 ----------
ok('展开态挂的是 entry-dock', /\{\{active \? 'entry-dock' : ''\}\}/.test(wxml))
ok('旧的 bg-give-way 全项目清零', !/bg-give-way/.test(
  [wxml, wxssRaw, fs.readFileSync(P('pages/create/create.js'), 'utf8')].join('\n')))
ok('收起态那条留白还在（66vh 没被顺手删掉）', /\.entry-wrap\s*\{[^}]*margin-top:\s*66vh/.test(wxss))
ok('那条 margin-top 过渡已撤（贴底是 position 切换，过渡不动它）',
  !/transition:\s*margin-top/.test(wxss))

// ---------- 2. 贴底：fixed + 底栏上方 ----------
const dock = seg('.container.entry-dock .entry-wrap')
ok('展开时整块 fixed', /position:\s*fixed/.test(dock), dock.trim().slice(0, 60))
ok('展开时不再靠 margin-top 定位', /margin-top:\s*0/.test(dock))
const bottom = Number((/bottom:\s*(\d+)rpx/.exec(dock) || [])[1])
ok('bottom 是个数', Number.isFinite(bottom), String(bottom))
// 底栏占掉的那一段从组件源码现读：bottom 20 + height 108 = 128，面板再留一条缝
const barBottom = Number(/\.tab-bar\s*\{[\s\S]*?bottom:\s*(\d+)rpx/.exec(barWxss)[1])
const barHeight = Number(/\.tab-bar\s*\{[\s\S]*?height:\s*(\d+)rpx/.exec(barWxss)[1])
const gap = bottom - (barBottom + barHeight)
ok('面板底边 = 底栏顶边 + 一条 24 的缝', gap === 24, `实得 ${gap}`)
// 左右内缩和 .container 的 --sp-3 是同一个数：fixed 不吃父级 padding，不写就宽一圈
const sp3 = Number(/--sp-3:\s*(\d+)rpx/.exec(appWxss)[1])
ok('左右内缩等于 --sp-3', new RegExp(`left:\\s*${sp3}rpx`).test(dock) && new RegExp(`right:\\s*${sp3}rpx`).test(dock), `--sp-3=${sp3}`)
ok('展开时换背景那一行整个不渲染',
  /\.container\.entry-dock \.home-swap\s*\{[^}]*display:\s*none/.test(wxss))
// 抬层那条规则不许再把 fixed 改回 relative：它必须排除展开态
ok('铺图抬层那条排除了展开态',
  /\.container\.has-bg:not\(\.entry-dock\) \.entry-wrap/.test(wxss))

// ---------- 3. 四屏等高：面板定高，内容不许被压扁 ----------
const panel = seg('.panel')
const PANEL_H = Number(/height:\s*(\d+)rpx/.exec(panel)[1])
ok('面板定高', PANEL_H > 0 && PANEL_H < 1200, String(PANEL_H))
ok('面板是 flex 列', /display:\s*flex/.test(panel) && /flex-direction:\s*column/.test(panel))
ok('面板算 border-box（定高含内边距）', /box-sizing:\s*border-box/.test(panel))
const body = seg('.entry-body')
ok('body 吃掉面板剩下的那一段', /flex:\s*1/.test(body) && /min-height:\s*0/.test(body))
ok('body 自己是 flex 列', /display:\s*flex/.test(body) && /flex-direction:\s*column/.test(body))
ok('body 里每一段都不许 shrink（富余整段留给按钮行上面的 auto 边距）',
  /\.entry-body > view,\s*\.entry-body > picker,\s*\.entry-body > textarea,\s*\.entry-body > scroll-view\s*\{[^}]*flex:\s*none/.test(wxss))
ok('模式标签行不许 shrink', /\.modes\s*\{[^}]*flex:\s*none/.test(wxss))
ok('条身不许 shrink', /\.bar\s*\{[^}]*flex:\s*none/.test(wxss))
ok('面板底边内边距就是 --sp-4（真跑那把拿它当"贴底"的判据）',
  /padding:\s*8rpx var\(--sp-4\) var\(--sp-4\)/.test(panel))
ok('按钮行沉到 body 底下', /\.panel \.acts\s*\{[^}]*margin-top:\s*auto/.test(wxss))
// padding-top 是"填满时仍留一条缝"：只有 margin-top:auto 的话内容一满，auto 归零就贴脸了
ok('按钮行留一条最小缝', /\.panel \.acts\s*\{[^}]*padding-top:\s*20rpx/.test(wxss))

// ---------- 4. 那个高度是从源码单点读出来的，别处不许再抄一份 ----------
ok('700 这个数在 WXSS 里只出现一次',
  (wxss.match(/height:\s*700rpx/g) || []).length === 1)
ok('量法脚本还在', fs.existsSync(path.join(ROOT, 'docs/工具/量-面板四态自然高.js')))
ok('注释里写了三个模式的实测高度',
  /608/.test(wxssRaw) && /660/.test(wxssRaw) && /413/.test(wxssRaw))

console.log(`${fails.length ? '✗' : '✓'} 录入面板沉底 静态：${pass}/${pass + fails.length} 条通过`
  + `　面板高 ${PANEL_H}rpx、底边距 ${bottom}rpx`)
fails.forEach((f) => console.log('  ✗ ' + f))
process.exit(fails.length ? 1 : 0)
