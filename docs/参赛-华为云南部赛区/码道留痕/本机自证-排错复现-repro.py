FIELD_LABELS = {"title": "标题", "text": "正文", "summary": "摘要"}
FALLBACK = "提交的内容格式不对，请检查后重试"


def build_detail(errors):
    if not errors:
        return FALLBACK
    first = errors[0]
    loc = [str(p) for p in first.get("loc", ()) if p not in ("body", "query", "path")]
    label = FIELD_LABELS.get(loc[-1], loc[-1] if loc else "")
    kind = first.get("type", "")
    limit = (first.get("ctx") or {}).get("max_length")
    if kind == "string_too_long" and limit:
        return f"{label}太长了，最多 {limit} 字"
    return FALLBACK
