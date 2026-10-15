// 日期只在这三个形态间切换：纸片角上的 MM/DD，时间轴那列的 YY/MM，详情头部的到分钟，海报上的到日。
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

// 站长 10-02 定 v18 那一屏的日期用"极简写法"：分隔符从 - 换成 /。
// 年份在这里仍然是噪声（纸片那一格只有 150rpx 宽），跨年照样看详情那行的完整日期。
function formatShortDate(dateStr) {
  if (!dateStr) return ''
  const d = new Date(dateStr)
  return `${pad(d.getMonth() + 1)}/${pad(d.getDate())}`
}

// 时间轴那一列的月份档：YY/MM（他给的样子是 26/10）。和上面那档同一族写法，
// 一年之内不重复年份、跨年又分得开——那一列只有 126rpx 宽，写全 2026-10 会顶出去。
function formatYearMonth(dateStr) {
  if (!dateStr) return ''
  const d = new Date(dateStr)
  return `${String(d.getFullYear()).slice(-2)}/${pad(d.getMonth() + 1)}`
}

module.exports = { formatDateTime, formatShortDate, formatYearMonth }
