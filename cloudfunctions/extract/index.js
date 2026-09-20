const cloud = require('wx-server-sdk')

cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV })

// 契约：文本进 → 4 字段 JSON 出。不碰数据库、不认身份、不含业务分支。
// 提示词**只由调用方持有**并通过 event.system_prompt 传进来：这里不留第二份，
// 否则改了一处忘另一处，线上就会出现"后端以为换了 prompt、模型其实没换"。
// 失败时只回 {error: "..."}，让后端区分「立刻降级」与「值得重试」。

// 混元模型 id 与额度绑得很紧，官方未公布完整清单，留成环境变量便于当场改而不必重传 zip。
const MODEL_ID = process.env.HUNYUAN_MODEL_ID || 'hy3'
const MAX_INPUT = 12000

function stripFences(s) {
  const t = (s || '').trim()
  if (!t.startsWith('```')) return t
  return t
    .split('\n')
    .filter((l) => !l.startsWith('```'))
    .join('\n')
    .trim()
}

// 与后端 _parse_response 保持同一套宽容度：模型偶尔会吐非 JSON，此时宁可回原文片段，
// 也不要让整条链路失败。
function normalize(parsed, fallbackTitle) {
  const title =
    typeof parsed.title === 'string' && parsed.title.trim()
      ? parsed.title.trim().slice(0, 500)
      : (fallbackTitle || '未命名笔记').trim().slice(0, 500)
  const summary = typeof parsed.summary === 'string' ? parsed.summary : ''
  const keyPoints = Array.isArray(parsed.key_points)
    ? parsed.key_points.filter((v) => typeof v === 'string' || typeof v === 'number').map(String)
    : []
  const tags = Array.isArray(parsed.tags)
    ? parsed.tags.filter((v) => typeof v === 'string' || typeof v === 'number').map(String).slice(0, 20)
    : []
  return { title, summary, key_points: keyPoints, tags }
}

exports.main = async (event) => {
  const text = typeof event === 'string' ? event : (event && event.text) || ''
  const fallbackTitle = (event && event.fallback_title) || ''
  const systemPrompt = (event && event.system_prompt) || ''

  if (!text.trim()) return { error: 'empty input' }
  if (!systemPrompt.trim()) return { error: 'missing system_prompt' }

  let userContent = text.length > MAX_INPUT ? text.slice(0, MAX_INPUT) : text
  if (fallbackTitle) userContent = `参考标题：${fallbackTitle}\n\n${userContent}`

  let result
  try {
    const ai = cloud.ai()
    const model = ai.createModel('cloudbase')
    result = await model.generateText({
      model: MODEL_ID,
      messages: [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: userContent },
      ],
      temperature: 0.3,
    })
  } catch (e) {
    // 抛出来比返回 500 好定位：网关会把未捕获异常压成一个看不出原因的调用失败。
    return { error: `cloud.ai 调用异常: ${e && e.message ? e.message : String(e)}` }
  }

  if (result && result.error) {
    return { error: `模型返回错误: ${JSON.stringify(result.error)}` }
  }

  const content = stripFences(result && result.text)
  if (!content) return { error: '模型返回空内容' }

  let parsed
  try {
    parsed = JSON.parse(content)
  } catch (e) {
    return {
      title: (fallbackTitle || '未命名笔记').trim().slice(0, 500),
      summary: content.slice(0, 500),
      key_points: [],
      tags: [],
    }
  }

  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
    return { error: '模型返回的不是 JSON 对象' }
  }

  const out = normalize(parsed, fallbackTitle)
  out.usage = result.usage || null
  return out
}
