// 日期只在这三个形态间切换：列表方块里的 MM-DD，详情头部的到分钟，海报上的到日。
// 之前在 index.js 和 detail.js 各抄了一份补零逻辑，收到这里来。
const pad = (n) => String(n).padStart(2, '0')

function formatDate(dateStr) {
  if (!dateStr) return ''
  const d = new Date(dateStr)
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`
}

function formatDateTime(dateStr) {
  if (!dateStr) return ''
  const d = new Date(dateStr)
  return `${formatDate(dateStr)} ${pad(d.getHours())}:${pad(d.getMinutes())}`
}

// 短日期只到"月-日"：年份在列表里是噪声，跨年时看详情那行的完整日期就够了。
function formatShortDate(dateStr) {
  if (!dateStr) return ''
  const d = new Date(dateStr)
  return `${pad(d.getMonth() + 1)}-${pad(d.getDate())}`
}

module.exports = { formatDateTime, formatShortDate }
