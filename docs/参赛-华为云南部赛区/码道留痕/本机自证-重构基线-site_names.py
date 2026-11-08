import re

MAX_SITE_CHARS = 20
_META_MAX_CHARS = 40
_META_SEPARATORS = (" - ", " | ", " _ ", " · ", "»")
_SUFFIX_WORDS = ("文章", "笔记", "网页", "网站", "页面", "客户端")


def _clean(raw) -> str:
    text = re.sub(r"\s+", " ", str(raw or "")).strip()
    return text if len(text) <= MAX_SITE_CHARS else ""


def _pair(zh: str, en: str = "") -> dict:
    zh = _clean(zh)
    if not zh:
        return {}
    return {"zh": zh, "en": _clean(en) or zh, "via": ""}


def _drop_mixed_name(raw) -> str:
    text = str(raw or "").strip()
    return "" if any(text.endswith(w) for w in _SUFFIX_WORDS) else text


def meta_site(raw) -> dict:
    text = re.sub(r"\s+", " ", str(raw or "")).strip()
    if not text or len(text) > _META_MAX_CHARS:
        return {}
    if any(sep in text for sep in _META_SEPARATORS):
        return {}
    out = _pair(text)
    out["via"] = "meta" if out else ""
    return out


def model_site(raw) -> dict:
    text = _drop_mixed_name(raw)
    out = _pair(text)
    out["via"] = "model" if out else ""
    return out
