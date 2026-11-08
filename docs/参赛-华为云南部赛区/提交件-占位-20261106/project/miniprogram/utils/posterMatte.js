// 外圈那一档的画法只留这一份（N4）：首页与分享页两条出口存出去的必须是同一张图，数与色只吃 poster.js 的 MATTE／matteColor。

const poster = require('./poster.js')

function outSize(plan) {
  return { w: plan.width + poster.MATTE * 2, h: plan.height + poster.MATTE * 2 }
}

// 画布切到 plan+MATTE×2、垫满 matteColor、平移落笔；scale 与 before 只给分享页那排小样用（圆角裁形）。
function paint(canvas, ctx, plan, images, scale, before) {
  const s = scale || 1
  const out = outSize(plan)
  canvas.width = Math.round(out.w * s)
  canvas.height = Math.round(out.h * s)
  if (s !== 1) ctx.scale(s, s)
  if (before) before(out)
  ctx.fillStyle = poster.matteColor(plan)
  ctx.fillRect(0, 0, out.w, out.h)
  ctx.save()
  ctx.translate(poster.MATTE, poster.MATTE)
  poster.paintLayers(ctx, plan.layers, images)
  ctx.restore()
  return out
}

module.exports = { outSize, paint }
