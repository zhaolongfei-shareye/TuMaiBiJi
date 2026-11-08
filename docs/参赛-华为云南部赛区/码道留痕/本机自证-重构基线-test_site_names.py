from site_names import meta_site, model_site, _clean, _pair


def test_meta_plain():
    assert meta_site("微信公众平台") == {"zh": "微信公众平台", "en": "微信公众平台", "via": "meta"}

def test_meta_collapses_whitespace():
    assert meta_site("  腾讯\n  新闻  ")["zh"] == "腾讯 新闻"

def test_meta_too_long_rejected():
    assert meta_site("站" * 41) == {}

def test_meta_with_separator_rejected():
    assert meta_site("腾讯新闻 - 每日热点") == {}

def test_meta_dirty_then_via_stays_empty():
    assert meta_site("") == {}

def test_model_suffix_gate_rejects_whole_name():
    # 现读就是这个形状：_pair 回空 dict 后又被挂了个 via，不是 {}。重构不许把它"顺手改对"。
    assert model_site("网易文章") == {"via": ""}

def test_model_keeps_real_name_untouched():
    assert model_site("  少数派  ") == {"zh": "少数派", "en": "少数派", "via": "model"}

def test_pair_en_falls_back_to_zh():
    assert _pair("网易", "") == {"zh": "网易", "en": "网易", "via": ""}

def test_clean_over_limit_returns_empty():
    assert _clean("名" * 21) == ""
