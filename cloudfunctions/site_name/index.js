// cloud.ai() 只有**在云函数内部**调用才抵扣成长计划的免费额度（与 extract 同一条理由，
// 见 backend/app/core/config.py 顶上那段注释）。直连混元端点会改扣套餐。

const cloud = require('wx-server-sdk')

cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV })

// 契约：{host, title, snippet} 进 → {site_name: "网易"} 出。不碰数据库、不认身份。
// 与 extract 分开立一条函数，是因为那条的文件头写着"文本进 → 4 字段 JSON 出、不含业务分支"，
// 而这里回的是另一个形状（一个名字）。塞进去不会报错，代价是那条契约以后没人敢信。
//
// 提示词**只由调用方持有**并通过 event.system_prompt 传进来：这里不留第二份，
// 否则改了一处忘另一处，线上就会出现"后端以为换了 prompt、模型其实没换"。
//
// 默认值是 2026-09-20 实测出来的，不是文档抄来的：控制台里带「免费额度」标记的 hy3 与
// hy3-preview 行为完全不同——hy3 一律 0.68s 内抛 HTTP 429 `AI_MODEL_NOT_ENABLED`
// （要求先切换为资源点套餐），hy3-preview 正常返回并带 usage。别改回 hy3。
const MODEL_ID = process.env.HUNYUAN_MODEL_ID || 'hy3-preview'
const MAX_INPUT = 6000

function stripFences(s) {
  const t = (s || '').trim()
  if (!t.startsWith('```')) return t
  return t
    .split('\n')
    .filter((l) => !l.startsWith('```'))
    .join('\n')
    .trim()
}

// 只认 `{"site_name": "..."}` 这一个形状。多输出的字段一律丢掉，不往回带。
function pickName(parsed) {
  const raw = parsed && parsed.site_name
  if (typeof raw !== 'string') return null
  const name = raw.replace(/\s+/g, ' ').trim()
  return name || null
}

exports.main = async (event) => {
  const ev = event || {}
  const systemPrompt = typeof ev.system_prompt === 'string' ? ev.system_prompt : ''
  const host = typeof ev.host === 'string' ? ev.host.trim() : ''
  const title = typeof ev.title === 'string' ? ev.title : ''
  const snippet = typeof ev.snippet === 'string' ? ev.snippet : ''

  // 域名是这一问里最值钱的一条信息，没有它就只能靠正文猜一家——那正是方案里
  // "认不准宁可空着"要防的那件事，所以直接拒，不发这一发。
  if (!host) return { error: 'missing host' }
  if (!systemPrompt.trim()) return { error: 'missing system_prompt' }

  const userContent = [`域名：${host}`, `标题：${title}`, `开头：${snippet}`]
    .join('\n')
    .slice(0, MAX_INPUT)

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
      temperature: 0.1,
    })
  } catch (callErr) {
    // 抛出来比返回 500 好定位（网关会把未捕获异常压成看不出原因的调用失败）。
    // retryable 带出去给调用方看原因；**后端目前对这一枚值一次都不重试**——站名没了只是
    // 屏上退到通用那档，用户看不出缺了什么，不值得把 worker 那条队列按住陪等。
    const resp = callErr && callErr.response
    if (resp) {
      let body = resp.data
      if (typeof body !== 'string') {
        try {
          body = JSON.stringify(body)
        } catch (stringifyError) {
          body = String(resp.data)
        }
      }
      return {
        error: `cloud.ai 返回 HTTP ${resp.status}: ${(body || '').slice(0, 500)}`,
        retryable: resp.status === 429 || resp.status >= 500,
      }
    }
    return {
      error: `cloud.ai 调用异常: ${e2 && e2.message ? e2.message : String(e2)}`,
      retryable: true,
    }
  }

  if (result && result.error) {
    return { error: `模型返回错误: ${JSON.stringify(result.error)}` }
  }

  const content = stripFences(result && result.text)
  if (!content) return { error: '模型返回空内容' }

  let parsed
  try {
    parsed = JSON.parse(content)
  } catch (err) {
    // 认不出 JSON＝这一家没认出来，不是"识别成功但名字空"。回 error 让后端日志留痕，
    // 后端那一路把它折成空串 ⇒ 屏上退到「网页文章」那六档通用文案。
    return { error: '模型回体不是 JSON', retryable: false }
  }

  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
    return { error: '模型回体不是 JSON 对象' }
  }

  const name = pickName(parsed)
  if (!name) return { site_name: '' }

  return { site_name: name, usage: result.usage || null }
}
